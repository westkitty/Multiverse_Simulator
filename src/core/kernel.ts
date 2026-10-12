import { CausalEventJournal } from './causalJournal';
import {
  BranchLineage,
  CausalChainInspection,
  CausalEvent,
  CheckpointId,
  CheckpointSnapshot,
  CommandExecutionContext,
  computeStateHash,
  DEFAULT_RESOURCE_BUDGET,
  EmitEventInput,
  ENGINE_VERSION,
  EntityInspection,
  MetricPoint,
  PerformanceSample,
  RenderFrameData,
  ResourceBudgetConfig,
  roundDet,
  RunId,
  SCHEMA_VERSION,
  SimulationCommand,
  SimulationSystem,
  SystemExecutionContext,
  Tick,
  WorldId,
  WorldPlugin,
} from './contracts';
import { SeededRng } from './rng';

export interface KernelCreateOptions<TConfig, TState = any> {
  runId: RunId;
  name: string;
  plugin: WorldPlugin<TConfig, TState>;
  seed: number;
  config?: TConfig;
  parentRunId?: RunId | null;
  forkedAtTick?: Tick;
  forkCheckpointId?: CheckpointId | null;
  hypothesisNote?: string;
  budget?: Partial<ResourceBudgetConfig>;
  scheduledCommands?: Array<{
    tick: Tick;
    type: string;
    label: string;
    payload: Record<string, unknown>;
  }>;
}

export interface SerializedRunRecord {
  engineVersion: string;
  schemaVersion: number;
  runId: RunId;
  name: string;
  worldId: WorldId;
  pluginVersion: string;
  seed: number;
  tick: Tick;
  stateHash: string;
  lineage: BranchLineage;
  initialConfig: Record<string, unknown>;
  currentConfig: Record<string, unknown>;
  rngState: ReturnType<SeededRng['serialize']>;
  worldState: Record<string, unknown>;
  commandSequence: number;
  pendingCommands: SimulationCommand[];
  executedCommands: SimulationCommand[];
  metricHistory: MetricPoint[];
  checkpoints: CheckpointSnapshot[];
  eventJournal: ReturnType<CausalEventJournal['serialize']>;
  budget: ResourceBudgetConfig;
}

export interface ForkBranchOptions<TConfig = Record<string, unknown>> {
  newRunId: RunId;
  newName: string;
  checkpointId?: CheckpointId;
  configPatch?: Partial<TConfig>;
  seedOverride?: number;
  hypothesisNote?: string;
  initialCommand?: {
    type: string;
    label: string;
    payload: Record<string, unknown>;
  };
}

export class SimulationKernel<
  TConfig extends Record<string, unknown> = Record<string, unknown>,
  TState = Record<string, unknown>,
> {
  readonly runId: RunId;
  name: string;
  readonly plugin: WorldPlugin<TConfig, TState>;
  readonly seed: number;
  private rng: SeededRng;
  private _tick: Tick = 0;
  private initialConfig: TConfig;
  private currentConfig: TConfig;
  private state: TState;
  private systems: SimulationSystem<TState, TConfig>[];
  private commandSequence = 1;
  private pendingCommands: SimulationCommand[] = [];
  private executedCommands: SimulationCommand[] = [];
  private journal: CausalEventJournal;
  private checkpoints: CheckpointSnapshot[] = [];
  private metricHistory: MetricPoint[] = [];
  private lineage: BranchLineage;
  private budget: ResourceBudgetConfig;

  // Telemetry counters
  private lastStepDurationMs = 0;
  private rollingStepsPerSec = 0;
  private lastSaveLoadLatencyMs = 0;
  private recentEventCountWindow: Array<{ tick: Tick; count: number }> = [];

  constructor(options: KernelCreateOptions<TConfig, TState>) {
    this.runId = options.runId;
    this.name = options.name;
    this.plugin = options.plugin;
    this.seed = (Math.floor(options.seed) >>> 0) || 1337;
    this.budget = {
      ...DEFAULT_RESOURCE_BUDGET,
      ...(options.budget ?? {}),
    };

    const rawConfig = options.config ?? options.plugin.defaultConfig;
    const validation = this.plugin.validateConfig(rawConfig);
    if (!validation.valid || !validation.config) {
      throw new Error(
        `Invalid world configuration for "${this.plugin.id}": ${(validation.errors ?? ['Unknown validation error']).join('; ')}`,
      );
    }

    this.initialConfig = JSON.parse(JSON.stringify(validation.config)) as TConfig;
    this.currentConfig = JSON.parse(JSON.stringify(validation.config)) as TConfig;
    this.rng = new SeededRng(this.seed);
    this.journal = new CausalEventJournal(this.budget.maxEvents);

    // Sort systems deterministically by (order, id)
    this.systems = [...this.plugin.getSystems()].sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.id.localeCompare(b.id);
    });

    this.state = this.plugin.initializeWorld(this.currentConfig, this.rng);

    this.lineage = {
      runId: this.runId,
      name: this.name,
      worldId: this.plugin.id,
      parentRunId: options.parentRunId ?? null,
      forkedAtTick: options.forkedAtTick ?? 0,
      forkCheckpointId: options.forkCheckpointId ?? null,
      seed: this.seed,
      createdAtLabel: `Tick ${options.forkedAtTick ?? 0}`,
      hypothesisNote: options.hypothesisNote,
    };

    if (options.scheduledCommands) {
      for (const sc of options.scheduledCommands) {
        this.enqueueCommand({
          tick: sc.tick,
          type: sc.type,
          label: sc.label,
          payload: sc.payload,
        });
      }
    }

    this.recordMetricsAtCurrentTick();
    this.journal.append(this.runId, 0, {
      type: 'world_initialized',
      severity: 'info',
      title: `${this.plugin.name} Initialized`,
      description: `Run "${this.name}" initialized with deterministic seed ${this.seed}.`,
      sourceSystem: 'kernel',
      causalLinkType: 'direct',
      causalExplanation: 'Initial world genesis from deterministic seed and validated configuration.',
      payload: { seed: this.seed, worldId: this.plugin.id },
    });

    this.createCheckpoint('Genesis (Tick 0)');
  }

  get tick(): Tick {
    return this._tick;
  }

  get worldId(): WorldId {
    return this.plugin.id;
  }

  getConfig(): TConfig {
    return JSON.parse(JSON.stringify(this.currentConfig)) as TConfig;
  }

  getInitialConfig(): TConfig {
    return JSON.parse(JSON.stringify(this.initialConfig)) as TConfig;
  }

  getState(): TState {
    return this.state;
  }

  getLineage(): BranchLineage {
    return { ...this.lineage };
  }

  getBudget(): ResourceBudgetConfig {
    return { ...this.budget };
  }

  setBudget(partial: Partial<ResourceBudgetConfig>): void {
    this.budget = { ...this.budget, ...partial };
    this.journal.setMaxEvents(this.budget.maxEvents);
    this.enforceCheckpointBudget();
    this.enforceMetricHistoryBudget();
  }

  getStateHash(): string {
    return computeStateHash(
      this.plugin.id,
      this._tick,
      this.plugin.serializeState(this.state),
      this.rng.serialize(),
    );
  }

  enqueueCommand(input: {
    tick?: Tick;
    type: string;
    label: string;
    payload: Record<string, unknown>;
    provenance?: SimulationCommand['provenance'];
  }): SimulationCommand {
    const targetTick = Math.max(this._tick, input.tick ?? this._tick);
    const cmd: SimulationCommand = {
      id: `cmd-${this.runId}-${this.commandSequence}`,
      tick: targetTick,
      sequence: this.commandSequence++,
      type: input.type,
      label: input.label,
      payload: JSON.parse(JSON.stringify(input.payload)) as Record<string, unknown>,
      provenance: input.provenance ? { ...input.provenance } : undefined,
    };
    this.pendingCommands.push(cmd);
    this.pendingCommands.sort((a, b) => {
      if (a.tick !== b.tick) return a.tick - b.tick;
      return a.sequence - b.sequence;
    });
    return cmd;
  }

  /**
   * Executes any pending commands scheduled for the current tick immediately.
   * Useful when the user dispatches an interactive command while paused and wants
   * immediate state/visual feedback before or during the next tick.
   */
  flushCurrentTickCommands(
    phase: 'pre_systems' | 'post_systems' = 'post_systems',
    onRejected: 'throw' | 'continue' = 'throw',
  ): SimulationCommand[] {
    // Consume only successful commands. A failure must not silently discard later
    // due commands or leave a false "command applied" event in the causal journal.
    const due = this.pendingCommands.filter((cmd) => cmd.tick <= this._tick);
    const completed: SimulationCommand[] = [];

    for (const queued of due) {
      const cmd: SimulationCommand = { ...queued, executedAtTick: this._tick, replayPhase: phase };
      // Commands are infrequent; copy authoritative transaction surfaces so even a
      // plugin that mutates state, RNG, config and emits an event before throwing
      // cannot leak partial changes into a timeline or its archive.
      const stateBefore = structuredClone(this.state);
      const configBefore = structuredClone(this.currentConfig);
      const rngBefore = structuredClone(this.rng.serialize());
      const journalBefore = this.journal.serialize();

      try {
        const cmdEvent = this.journal.append(this.runId, this._tick, {
          type: `command:${cmd.type}`,
          severity: 'info',
          title: `Command: ${cmd.label}`,
          description: cmd.provenance
            ? `Cross-world command via adapter "${cmd.provenance.adapterId}" from run ${cmd.provenance.sourceRunId}.`
            : `User or scenario intervention command "${cmd.label}" (${cmd.type}) applied at tick ${this._tick}.`,
          sourceSystem: 'command_bus',
          causalLinkType: 'direct',
          causalExplanation: cmd.provenance
            ? `Translated explicitly from ${cmd.provenance.sourceWorldId} event ${cmd.provenance.sourceEventId}.`
            : 'Explicit user/scenario command injected into simulation command bus.',
          payload: {
            commandId: cmd.id,
            commandType: cmd.type,
            ...cmd.payload,
          },
        });

        const cmdCtx: CommandExecutionContext<TConfig> = {
          runId: this.runId,
          tick: this._tick,
          config: this.currentConfig,
          rng: this.rng,
          emitEvent: (eventInput: EmitEventInput) =>
            this.journal.append(this.runId, this._tick, {
              ...eventInput,
              causedByEventId: eventInput.causedByEventId ?? cmdEvent.id,
              causalLinkType: eventInput.causalLinkType ?? 'direct',
              correlationId: eventInput.correlationId ?? cmdEvent.correlationId,
            }),
        };

        this.plugin.applyCommand(this.state, cmd, cmdCtx);
        this.pendingCommands = this.pendingCommands.filter((item) => item.id !== cmd.id);
        // Preserve enqueueCommand's returned object identity and completion metadata.
        queued.executedAtTick = this._tick;
        queued.replayPhase = phase;
        this.executedCommands.push(queued);
        completed.push(queued);
      } catch (error) {
        this.state = stateBefore;
        this.currentConfig = configBefore;
        this.rng.restore(rngBefore);
        this.journal.restore(journalBefore);
        // A rejected command is not replayed, retried forever, or marked applied.
        // Later commands remain queued in their original stable order.
        this.pendingCommands = this.pendingCommands.filter((item) => item.id !== cmd.id);
        const reason = error instanceof Error ? error.message : String(error);
        this.journal.append(this.runId, this._tick, {
          type: 'command_rejected',
          severity: 'warning',
          title: `Rejected command: ${cmd.label}`,
          description: `Command "${cmd.type}" was rejected without changing world state: ${reason}`,
          sourceSystem: 'command_bus',
          causalLinkType: 'direct',
          causalExplanation: 'Command validation or execution failed; authoritative state and RNG were rolled back.',
          payload: { commandId: cmd.id, commandType: cmd.type, reason },
        });
        if (onRejected === 'throw') {
          if (completed.length > 0) this.recordMetricsAtCurrentTick(true);
          throw error;
        }
        // Fixed-tick background progress is not allowed to skip a tick because
        // a scheduled command failed; the event preserves the rejection cause.
      }
    }

    if (completed.length > 0) this.recordMetricsAtCurrentTick(true);
    return completed;
  }

  /**
   * Advances authoritative simulation time by exactly 1 fixed tick.
   */
  step(): {
    tick: Tick;
    eventsEmitted: CausalEvent[];
    metrics: Record<string, number>;
    stepDurationMs: number;
  } {
    const startWall = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const eventsBeforeCount = this.journal.count();

    // 1. Flush commands scheduled at current tick before advancing (post_systems of previous tick)
    this.flushCurrentTickCommands('post_systems', 'continue');

    // 2. Advance simulation clock
    this._tick += 1;

    // 3. Flush commands scheduled specifically for the new tick (pre_systems of new tick)
    this.flushCurrentTickCommands('pre_systems', 'continue');

    // 4. Execute ordered systems deterministically
    const emittedThisTick: CausalEvent[] = [];
    const sysCtx: SystemExecutionContext<TState, TConfig> = {
      runId: this.runId,
      tick: this._tick,
      config: this.currentConfig,
      state: this.state,
      rng: this.rng,
      emitEvent: (input: EmitEventInput) => {
        const ev = this.journal.append(this.runId, this._tick, input);
        emittedThisTick.push(ev);
        return ev;
      },
      findRecentEventByType: (type: string, maxTickAge = 15) =>
        this.journal.findRecentByType(type, this._tick, maxTickAge),
    };

    for (const system of this.systems) {
      system.step(sysCtx);
    }

    // 5. Record metrics for the new tick
    const metrics = this.recordMetricsAtCurrentTick();

    // 6. Periodic automatic checkpointing
    if (
      this.budget.autoCheckpointIntervalTicks > 0 &&
      this._tick % this.budget.autoCheckpointIntervalTicks === 0
    ) {
      this.createCheckpoint(`Auto @ Tick ${this._tick}`);
    }

    const endWall = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.lastStepDurationMs = roundDet(Math.max(0.01, endWall - startWall), 3);
    const instantSps = 1000 / Math.max(0.1, this.lastStepDurationMs);
    this.rollingStepsPerSec = roundDet(
      this.rollingStepsPerSec === 0
        ? instantSps
        : this.rollingStepsPerSec * 0.7 + instantSps * 0.3,
      1,
    );

    const eventsDelta = Math.max(0, this.journal.count() - eventsBeforeCount + emittedThisTick.length);
    this.recentEventCountWindow.push({ tick: this._tick, count: eventsDelta });
    while (this.recentEventCountWindow.length > 20) {
      this.recentEventCountWindow.shift();
    }

    return {
      tick: this._tick,
      eventsEmitted: emittedThisTick,
      metrics,
      stepDurationMs: this.lastStepDurationMs,
    };
  }

  /**
   * Executes multiple deterministic ticks while respecting a wall-clock time budget
   * so fast-forwarding never freezes the main thread or worker queue.
   */
  stepMany(
    targetSteps: number,
    maxWallTimeMs = this.budget.maxFastForwardStepBudgetMs,
  ): {
    stepsExecuted: number;
    hitTimeBudget: boolean;
    tick: Tick;
    stateHash: string;
  } {
    const clampedSteps = Math.max(0, Math.floor(targetSteps));
    const startWall = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let executed = 0;
    let hitBudget = false;

    for (let i = 0; i < clampedSteps; i++) {
      this.step();
      executed++;
      const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startWall;
      if (elapsed >= maxWallTimeMs && i < clampedSteps - 1) {
        hitBudget = true;
        break;
      }
    }

    return {
      stepsExecuted: executed,
      hitTimeBudget: hitBudget,
      tick: this._tick,
      stateHash: this.getStateHash(),
    };
  }

  private recordMetricsAtCurrentTick(replaceIfSameTick = false): Record<string, number> {
    const raw = this.plugin.extractMetrics(this.state, this.currentConfig);
    const rounded: Record<string, number> = {};
    for (const key of Object.keys(raw).sort()) {
      rounded[key] = roundDet(raw[key], 3);
    }

    const last = this.metricHistory[this.metricHistory.length - 1];
    if (last && last.tick === this._tick && replaceIfSameTick) {
      last.values = rounded;
    } else if (!last || last.tick !== this._tick) {
      this.metricHistory.push({
        tick: this._tick,
        values: rounded,
      });
    }
    this.enforceMetricHistoryBudget();
    return rounded;
  }

  private enforceMetricHistoryBudget(): void {
    while (this.metricHistory.length > this.budget.maxMetricHistory) {
      // Keep index 0 (initial tick 0) and drop oldest intermediate entries
      this.metricHistory.splice(1, 1);
    }
  }

  createCheckpoint(label?: string): CheckpointSnapshot {
    const serializedState = this.plugin.serializeState(this.state);
    const rngState = this.rng.serialize();
    const stateHash = computeStateHash(this.plugin.id, this._tick, serializedState, rngState);
    const metrics = this.getLatestMetrics();
    const rawJson = JSON.stringify(serializedState);

    const checkpoint: CheckpointSnapshot = {
      id: `chk-${this.runId}-t${this._tick}-${this.checkpoints.length + 1}`,
      runId: this.runId,
      label: label ?? `Checkpoint @ Tick ${this._tick}`,
      tick: this._tick,
      createdAtSimTick: this._tick,
      stateHash,
      rngState,
      serializedState,
      config: JSON.parse(JSON.stringify(this.currentConfig)) as Record<string, unknown>,
      commandSequence: this.commandSequence,
      commandHistoryLength: this.executedCommands.length,
      metricsAtTick: metrics,
      byteSizeEstimate: rawJson.length,
    };

    // Replace existing auto-checkpoint at exact same tick if label is Auto, otherwise append
    const existingIdx = this.checkpoints.findIndex(
      (c) => c.tick === this._tick && c.label === checkpoint.label,
    );
    if (existingIdx >= 0) {
      this.checkpoints[existingIdx] = checkpoint;
    } else {
      this.checkpoints.push(checkpoint);
    }

    this.enforceCheckpointBudget();
    return checkpoint;
  }

  private enforceCheckpointBudget(): void {
    while (this.checkpoints.length > this.budget.maxCheckpoints) {
      // Preserve index 0 (Genesis Tick 0) and remove oldest auto-checkpoint first
      const autoIndex = this.checkpoints.findIndex(
        (c, idx) => idx > 0 && c.label.startsWith('Auto @'),
      );
      if (autoIndex > 0) {
        this.checkpoints.splice(autoIndex, 1);
      } else {
        this.checkpoints.splice(1, 1);
      }
    }
  }

  listCheckpoints(): CheckpointSnapshot[] {
    return this.checkpoints.map((c) => ({ ...c }));
  }

  getCheckpoint(checkpointId: CheckpointId): CheckpointSnapshot | undefined {
    return this.checkpoints.find((c) => c.id === checkpointId);
  }

  restoreCheckpoint(checkpointId: CheckpointId): CheckpointSnapshot {
    const target = this.checkpoints.find((c) => c.id === checkpointId);
    if (!target) {
      throw new Error(`Checkpoint "${checkpointId}" not found in run "${this.runId}"`);
    }

    const clonedState = JSON.parse(JSON.stringify(target.serializedState)) as Record<string, unknown>;
    this.state = this.plugin.restoreState(clonedState);
    this.rng.restore(JSON.parse(JSON.stringify(target.rngState)));
    this.currentConfig = JSON.parse(JSON.stringify(target.config)) as TConfig;
    this._tick = target.tick;
    this.commandSequence = target.commandSequence;
    this.executedCommands = this.executedCommands.slice(0, target.commandHistoryLength);
    this.pendingCommands = this.pendingCommands.filter((c) => c.tick > this._tick);
    this.metricHistory = this.metricHistory.filter((m) => m.tick <= this._tick);
    if (this.metricHistory.length === 0) {
      this.recordMetricsAtCurrentTick();
    }

    this.journal.append(this.runId, this._tick, {
      type: 'checkpoint_restored',
      severity: 'info',
      title: `Restored ${target.label}`,
      description: `Rewound authoritative state to tick ${target.tick} (hash ${target.stateHash.slice(0, 8)}).`,
      sourceSystem: 'kernel',
      causalLinkType: 'direct',
      causalExplanation: 'User or experiment runner restored a saved simulation checkpoint.',
      payload: {
        checkpointId: target.id,
        restoredTick: target.tick,
        stateHash: target.stateHash,
      },
    });

    return target;
  }

  /**
   * Verifies state/RNG by replaying commands from an authoritative origin.
   * Roots begin at Genesis. Forks begin at their immutable branch-origin
   * checkpoint and run only commands executed AFTER that checkpoint.
   *
   * A historical target without a captured checkpoint is *unverifiable*,
   * not a successful replay. Missing/corrupt fork provenance fails closed.
   */
  replayFromStart(upToTick = this._tick): {
    replayedKernel: SimulationKernel<TConfig, TState>;
    matchesAuthoritativeHash: boolean;
    replayedHash: string;
    authoritativeHash: string;
    originTick: Tick;
    verificationBasis: 'genesis' | 'fork_checkpoint' | 'legacy_fork_journal';
  } {
    if (!Number.isSafeInteger(upToTick) || upToTick < 0 || upToTick > this._tick) {
      throw new Error('Replay target must be a recorded, nonfuture simulation tick');
    }

    const isFork = this.lineage.parentRunId !== null;
    const origin = isFork
      ? this.checkpoints.find(c =>
          c.runId === this.runId &&
          c.tick === this.lineage.forkedAtTick &&
          c.label.startsWith('Branch Origin (Tick '))
      : undefined;
    if (isFork && !origin) {
      throw new Error('Replay unavailable: the original fork checkpoint is missing');
    }
    if (origin && upToTick < origin.tick) {
      throw new Error('Cannot replay a child branch before its fork-origin tick');
    }

    // Replaying to an arbitrary earlier tick cannot be called proof without
    // an independently recorded authoritative hash at that exact tick.
    const historicalCheckpoint = upToTick === this._tick
      ? undefined
      : this.checkpoints.find(c => c.tick === upToTick);
    if (upToTick !== this._tick && !historicalCheckpoint) {
      throw new Error('Replay unverified: no authoritative checkpoint exists at the requested historical tick');
    }
    const authoritativeHash = upToTick === this._tick
      ? this.getStateHash()
      : historicalCheckpoint!.stateHash;

    const replayKernel = new SimulationKernel<TConfig, TState>({
      runId: this.runId,
      name: this.name + ' (Replay)',
      plugin: this.plugin,
      seed: this.seed,
      config: JSON.parse(JSON.stringify(origin?.config ?? this.initialConfig)) as TConfig,
      budget: this.budget,
    });

    let originTick: Tick = 0;
    let inheritedCommandCount = 0;
    let verificationBasis: 'genesis' | 'fork_checkpoint' | 'legacy_fork_journal' = 'genesis';
    if (origin) {
      const baseHash = computeStateHash(
        this.plugin.id, origin.tick, origin.serializedState, origin.rngState,
      );
      if (baseHash !== origin.stateHash) {
        throw new Error('Replay unavailable: fork-origin checkpoint hash does not match its snapshot');
      }
      const validated = this.plugin.validateConfig(origin.config);
      if (!validated.valid || !validated.config) {
        throw new Error('Replay unavailable: fork-origin configuration is invalid');
      }
      originTick = origin.tick;
      inheritedCommandCount = origin.commandHistoryLength;
      if (!Number.isSafeInteger(inheritedCommandCount) ||
          inheritedCommandCount < 0 || inheritedCommandCount > this.executedCommands.length) {
        throw new Error('Replay unavailable: fork-origin command history is inconsistent');
      }
      replayKernel.state = this.plugin.restoreState(
        JSON.parse(JSON.stringify(origin.serializedState)) as Record<string, unknown>,
      );
      replayKernel.rng.restore(JSON.parse(JSON.stringify(origin.rngState)));
      replayKernel.currentConfig = JSON.parse(JSON.stringify(validated.config)) as TConfig;
      replayKernel._tick = origin.tick;
      replayKernel.commandSequence = origin.commandSequence;
      replayKernel.executedCommands = JSON.parse(
        JSON.stringify(this.executedCommands.slice(0, inheritedCommandCount)),
      ) as SimulationCommand[];
      replayKernel.metricHistory = JSON.parse(
        JSON.stringify(this.metricHistory.filter(m => m.tick <= origin.tick)),
      ) as MetricPoint[];
      replayKernel.checkpoints = [JSON.parse(JSON.stringify(origin)) as CheckpointSnapshot];

      // New branches carry the exact causal journal at their origin. For old
      // archives without this optional field, recover only if the original
      // branch-creation event is still present in the bounded current journal.
      let anchoredJournal = origin.replayJournal;
      if (!anchoredJournal) {
        const history = this.journal.serialize().events;
        const boundary = history.findIndex(e =>
          e.runId === this.runId &&
          e.tick === origin.tick &&
          e.type === 'reality_branched' &&
          e.payload?.parentRunId === this.lineage.parentRunId &&
          e.payload?.forkCheckpointId === this.lineage.forkCheckpointId
        );
        if (boundary < 0) {
          throw new Error('Replay unavailable: legacy fork-origin event history has expired');
        }
        const events = history.slice(0, boundary + 1);
        const lastId = events[events.length - 1].id;
        const sequence = Number(lastId.match(/-(\d+)$/)?.[1]);
        if (!Number.isSafeInteger(sequence)) {
          throw new Error('Replay unavailable: legacy fork event sequence is invalid');
        }
        anchoredJournal = { sequenceCounter: sequence + 1, events };
        verificationBasis = 'legacy_fork_journal';
      } else {
        verificationBasis = 'fork_checkpoint';
      }
      const forkMarker = anchoredJournal.events[anchoredJournal.events.length - 1];
      if (!forkMarker || forkMarker.type !== 'reality_branched' ||
          forkMarker.runId !== this.runId || forkMarker.tick !== origin.tick ||
          forkMarker.payload?.parentRunId !== this.lineage.parentRunId ||
          forkMarker.payload?.forkCheckpointId !== this.lineage.forkCheckpointId) {
        throw new Error('Replay unavailable: fork-origin branch event is invalid');
      }
      if (!Number.isSafeInteger(anchoredJournal.sequenceCounter) ||
          anchoredJournal.events.some(e => e.tick > origin.tick)) {
        throw new Error('Replay unavailable: fork-origin causal journal is inconsistent');
      }
      replayKernel.journal.restore(anchoredJournal);
    }

    const relevantCommands = this.executedCommands.slice(inheritedCommandCount)
      .filter(c => (c.executedAtTick ?? c.tick) <= upToTick);
    const enqueueForPhase = (targetTick: Tick, phase: 'pre_systems' | 'post_systems') => {
      for (const c of relevantCommands) {
        const execTick = c.executedAtTick ?? c.tick;
        const execPhase = c.replayPhase ?? 'post_systems';
        if (execTick === targetTick && execPhase === phase) {
          replayKernel.enqueueCommand({
            tick: targetTick,
            type: c.type,
            label: c.label,
            payload: JSON.parse(JSON.stringify(c.payload)) as Record<string, unknown>,
            provenance: c.provenance,
          });
        }
      }
    };

    while (replayKernel.tick < upToTick) {
      const currentT = replayKernel.tick;
      enqueueForPhase(currentT, 'post_systems');
      enqueueForPhase(currentT + 1, 'pre_systems');
      replayKernel.step();
    }
    enqueueForPhase(upToTick, 'post_systems');
    replayKernel.flushCurrentTickCommands('post_systems');

    const replayedHash = replayKernel.getStateHash();
    return {
      replayedKernel: replayKernel,
      matchesAuthoritativeHash: replayedHash === authoritativeHash,
      replayedHash,
      authoritativeHash,
      originTick,
      verificationBasis,
    };
  }

  /**
   * Forks an independent branch reality from either a specified checkpoint or the current tick.
   * Uses deep copy-on-write state cloning so changes in the forked branch never mutate this branch.
   */
  forkBranch(options: ForkBranchOptions<TConfig>): SimulationKernel<TConfig, TState> {
    const sourceCheckpoint = options.checkpointId
      ? this.getCheckpoint(options.checkpointId)
      : this.createCheckpoint(`Fork Origin @ Tick ${this._tick}`);

    if (!sourceCheckpoint) {
      throw new Error(`Cannot fork branch: checkpoint "${options.checkpointId}" not found`);
    }

    const mergedConfigRaw = {
      ...(JSON.parse(JSON.stringify(sourceCheckpoint.config)) as Record<string, unknown>),
      ...(options.configPatch ?? {}),
    };
    const validation = this.plugin.validateConfig(mergedConfigRaw);
    if (!validation.valid || !validation.config) {
      throw new Error(
        `Invalid config patch for forked branch: ${(validation.errors ?? []).join('; ')}`,
      );
    }

    const branchSeed = options.seedOverride !== undefined ? options.seedOverride : this.seed;

    const forked = new SimulationKernel<TConfig, TState>({
      runId: options.newRunId,
      name: options.newName,
      plugin: this.plugin,
      seed: branchSeed,
      config: validation.config,
      parentRunId: this.runId,
      forkedAtTick: sourceCheckpoint.tick,
      forkCheckpointId: sourceCheckpoint.id,
      hypothesisNote: options.hypothesisNote,
      budget: this.budget,
    });

    // Restore exact state & RNG from the fork checkpoint (unless seed was explicitly overridden for paired multi-seed runs)
    const clonedWorldState = JSON.parse(
      JSON.stringify(sourceCheckpoint.serializedState),
    ) as Record<string, unknown>;
    forked.state = this.plugin.restoreState(clonedWorldState);
    if (options.seedOverride === undefined) {
      forked.rng.restore(JSON.parse(JSON.stringify(sourceCheckpoint.rngState)));
    }
    forked._tick = sourceCheckpoint.tick;
    forked.commandSequence = sourceCheckpoint.commandSequence;
    forked.executedCommands = JSON.parse(
      JSON.stringify(this.executedCommands.slice(0, sourceCheckpoint.commandHistoryLength)),
    ) as SimulationCommand[];
    forked.metricHistory = JSON.parse(
      JSON.stringify(this.metricHistory.filter((m) => m.tick <= sourceCheckpoint.tick)),
    ) as MetricPoint[];
    forked.journal = this.journal.cloneUpToTick(sourceCheckpoint.tick, options.newRunId);

    forked.journal.append(forked.runId, forked._tick, {
      type: 'reality_branched',
      severity: 'positive',
      title: `Reality Branched: ${options.newName}`,
      description: `Forked from "${this.name}" at tick ${sourceCheckpoint.tick}${options.hypothesisNote ? ` (${options.hypothesisNote})` : ''}.`,
      sourceSystem: 'kernel',
      causalLinkType: 'direct',
      causalExplanation: `Explicit timeline fork from parent run ${this.runId} checkpoint ${sourceCheckpoint.id}.`,
      payload: {
        parentRunId: this.runId,
        forkedAtTick: sourceCheckpoint.tick,
        forkCheckpointId: sourceCheckpoint.id,
        configPatch: options.configPatch ?? {},
      },
    });

    // Store the causal journal at the exact fork boundary, before its first
    // intervention. Ordinary and historical root checkpoints keep their shape.
    const branchOrigin = forked.createCheckpoint(`Branch Origin (Tick ${sourceCheckpoint.tick})`);
    branchOrigin.replayJournal = forked.journal.serialize();
    branchOrigin.byteSizeEstimate += JSON.stringify(branchOrigin.replayJournal).length;
    forked.checkpoints = [branchOrigin];

    if (options.initialCommand) {
      forked.enqueueCommand({
        tick: forked._tick,
        type: options.initialCommand.type,
        label: options.initialCommand.label,
        payload: options.initialCommand.payload,
      });
      forked.flushCurrentTickCommands();
    }

    return forked;
  }

  getLatestMetrics(): Record<string, number> {
    const last = this.metricHistory[this.metricHistory.length - 1];
    return last ? { ...last.values } : this.plugin.extractMetrics(this.state, this.currentConfig);
  }

  getMetricHistory(): MetricPoint[] {
    return this.metricHistory.map((m) => ({
      tick: m.tick,
      values: { ...m.values },
    }));
  }

  getEvents(): CausalEvent[] {
    return this.journal.getAll();
  }

  getJournal(): CausalEventJournal {
    return this.journal;
  }

  inspectCausalChain(eventId: string): CausalChainInspection | null {
    return this.journal.inspectCausalChain(eventId);
  }

  inspectEntities(): EntityInspection[] {
    return this.plugin.inspectEntities(this.state, this.currentConfig);
  }

  extractRenderFrame(): RenderFrameData {
    return this.plugin.extractRenderFrame(
      this.state,
      this.currentConfig,
      this.runId,
      this._tick,
    );
  }

  getExecutedCommands(): SimulationCommand[] {
    return [...this.executedCommands];
  }

  getPendingCommands(): SimulationCommand[] {
    return [...this.pendingCommands];
  }

  getPerformanceSample(
    renderFps = 60,
    frameTimeMs = 16.6,
    workerQueueDepth = 0,
  ): PerformanceSample {
    const entities = this.plugin.inspectEntities(this.state, this.currentConfig);
    const snapshotBytes = this.checkpoints.reduce((acc, c) => acc + c.byteSizeEstimate, 0);
    const totalRecentEvents = this.recentEventCountWindow.reduce((acc, w) => acc + w.count, 0);
    const eventThroughput = roundDet(
      (totalRecentEvents / Math.max(1, this.recentEventCountWindow.length)) *
        Math.min(60, Math.max(1, this.rollingStepsPerSec || 10)),
      1,
    );

    const perfMemory =
      typeof performance !== 'undefined' &&
      'memory' in performance &&
      performance.memory &&
      typeof (performance.memory as { usedJSHeapSize?: number }).usedJSHeapSize === 'number'
        ? (performance.memory as { usedJSHeapSize: number }).usedJSHeapSize
        : null;

    return {
      tick: this._tick,
      stepDurationMs: this.lastStepDurationMs,
      stepsPerSecond: this.rollingStepsPerSec,
      renderFps: roundDet(renderFps, 1),
      frameTimeMs: roundDet(frameTimeMs, 2),
      entityCount: entities.length,
      eventCount: this.journal.count(),
      eventThroughputPerSec: eventThroughput,
      workerQueueDepth,
      checkpointCount: this.checkpoints.length,
      snapshotStorageBytes: snapshotBytes,
      saveLoadLatencyMs: this.lastSaveLoadLatencyMs,
      heapUsedBytes: perfMemory,
    };
  }

  exportRunRecord(): SerializedRunRecord {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const worldState = this.plugin.serializeState(this.state);
    const rngState = this.rng.serialize();
    const stateHash = computeStateHash(this.plugin.id, this._tick, worldState, rngState);

    const record: SerializedRunRecord = {
      engineVersion: ENGINE_VERSION,
      schemaVersion: SCHEMA_VERSION,
      runId: this.runId,
      name: this.name,
      worldId: this.plugin.id,
      pluginVersion: this.plugin.version,
      seed: this.seed,
      tick: this._tick,
      stateHash,
      lineage: { ...this.lineage },
      initialConfig: JSON.parse(JSON.stringify(this.initialConfig)) as Record<string, unknown>,
      currentConfig: JSON.parse(JSON.stringify(this.currentConfig)) as Record<string, unknown>,
      rngState,
      worldState,
      commandSequence: this.commandSequence,
      pendingCommands: JSON.parse(JSON.stringify(this.pendingCommands)) as SimulationCommand[],
      executedCommands: JSON.parse(JSON.stringify(this.executedCommands)) as SimulationCommand[],
      metricHistory: JSON.parse(JSON.stringify(this.metricHistory)) as MetricPoint[],
      checkpoints: JSON.parse(JSON.stringify(this.checkpoints)) as CheckpointSnapshot[],
      eventJournal: this.journal.serialize(),
      budget: { ...this.budget },
    };

    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.lastSaveLoadLatencyMs = roundDet(Math.max(0.05, t1 - t0), 2);
    return record;
  }

  static fromRunRecord<
    TConfig extends Record<string, unknown> = Record<string, unknown>,
    TState = Record<string, unknown>,
  >(
    record: SerializedRunRecord,
    plugin: WorldPlugin<TConfig, TState>,
  ): SimulationKernel<TConfig, TState> {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!record || typeof record !== 'object' || record.worldId !== plugin.id) {
      throw new Error(
        `Incompatible run record: expected worldId "${plugin.id}", got "${String(record?.worldId)}"`,
      );
    }

    const migratedWorldState =
      record.schemaVersion < plugin.schemaVersion
        ? plugin.migrateState(record.worldState, record.schemaVersion)
        : record.worldState;

    const validation = plugin.validateConfig(record.currentConfig);
    if (!validation.valid || !validation.config) {
      throw new Error(
        `Corrupt or invalid configuration in saved run "${record.runId}": ${(validation.errors ?? []).join('; ')}`,
      );
    }

    const kernel = new SimulationKernel<TConfig, TState>({
      runId: record.runId,
      name: record.name,
      plugin,
      seed: record.seed,
      config: validation.config,
      parentRunId: record.lineage?.parentRunId ?? null,
      forkedAtTick: record.lineage?.forkedAtTick ?? 0,
      forkCheckpointId: record.lineage?.forkCheckpointId ?? null,
      hypothesisNote: record.lineage?.hypothesisNote,
      budget: record.budget,
    });

    kernel.initialConfig = JSON.parse(JSON.stringify(record.initialConfig)) as TConfig;
    kernel.currentConfig = validation.config;
    kernel.state = plugin.restoreState(
      JSON.parse(JSON.stringify(migratedWorldState)) as Record<string, unknown>,
    );
    kernel.rng.restore(JSON.parse(JSON.stringify(record.rngState)));
    kernel._tick = record.tick;
    kernel.commandSequence = record.commandSequence || 1;
    kernel.pendingCommands = JSON.parse(
      JSON.stringify(record.pendingCommands ?? []),
    ) as SimulationCommand[];
    kernel.executedCommands = JSON.parse(
      JSON.stringify(record.executedCommands ?? []),
    ) as SimulationCommand[];
    kernel.metricHistory = JSON.parse(
      JSON.stringify(record.metricHistory ?? []),
    ) as MetricPoint[];
    kernel.checkpoints = JSON.parse(
      JSON.stringify(record.checkpoints ?? []),
    ) as CheckpointSnapshot[];
    if (record.eventJournal) {
      kernel.journal.restore(record.eventJournal);
    }

    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    kernel.lastSaveLoadLatencyMs = roundDet(Math.max(0.05, t1 - t0), 2);
    return kernel;
  }
}
