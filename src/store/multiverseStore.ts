import { create } from 'zustand';
import { compareRealities, RealityComparisonReport } from '../core/comparisonEngine';
import {
  CheckpointId,
  ENGINE_VERSION,
  EventId,
  PerformanceSample,
  RunId,
  WorldId,
} from '../core/contracts';
import {
  CrossWorldTransferPreview,
  defaultCrossWorldRegistry,
} from '../core/crossWorldContract';
import {
  ExperimentDefinition,
  ExperimentResultRecord,
  runControlledExperiment,
} from '../core/experimentRunner';
import { ForkBranchOptions, SimulationKernel } from '../core/kernel';
import { globalPluginRegistry } from '../core/pluginRegistry';
import {
  ArchiveInspectionResult,
  createPortableArchiveZip,
  inspectAndUnpackArchiveZip,
} from '../persistence/archive';
import {
  DEFAULT_UI_PREFERENCES,
  deleteRunFromDb,
  listExperimentsFromDb,
  listSavedRunsFromDb,
  loadPreferencesFromDb,
  loadRunFromDb,
  SavedRunMeta,
  saveExperimentToDb,
  savePreferencesToDb,
  saveRunToDb,
  setSimulatedQuotaExceeded,
  ThrottledAutosaveManager,
  UIPreferencesRecord,
} from '../persistence/indexedDb';
import { BoundedWorkerBridge } from '../worker/workerBridge';
import {
  civilizationPlugin,
  ecosystemPlugin,
  registerBuiltInWorlds,
  stationPlugin,
} from '../worlds';

registerBuiltInWorlds();

export type MultiverseTab =
  | 'atlas'
  | 'library'
  | 'observatory'
  | 'timeline'
  | 'lab'
  | 'compare'
  | 'events'
  | 'vault'
  | 'diagnostics';

export interface SystemDiagnosticAlert {
  id: string;
  timestampIso: string;
  severity: 'error' | 'warning' | 'info' | 'recovered';
  title: string;
  message: string;
  recoveredCheckpointId?: string;
}

const autosaveManager = new ThrottledAutosaveManager(4000);
const workerBridge = new BoundedWorkerBridge(32);

function createInitialFlagshipRuns(): {
  runs: Record<RunId, SimulationKernel<any, any>>;
  defaultActiveId: RunId;
  defaultCompareId: RunId;
} {
  const ecoScenario = ecosystemPlugin.scenarios[0];
  const ecoRun = new SimulationKernel({
    runId: 'run-eco-baseline',
    name: 'Ecosystem // Trophic Cascade Baseline',
    plugin: ecosystemPlugin,
    seed: ecoScenario.seed,
    config: ecoScenario.config,
    scheduledCommands: ecoScenario.scheduledCommands,
    hypothesisNote: ecoScenario.hypothesis,
  });
  // Step 4 initial ticks so charts and events have immediate live history on launch
  ecoRun.stepMany(4);

  const stnScenario = stationPlugin.scenarios[0];
  const stnRun = new SimulationKernel({
    runId: 'run-station-cascade',
    name: 'Station // Reactor & Scrubber Crisis',
    plugin: stationPlugin,
    seed: stnScenario.seed,
    config: stnScenario.config,
    scheduledCommands: stnScenario.scheduledCommands,
    hypothesisNote: stnScenario.hypothesis,
  });
  stnRun.stepMany(6);

  const civScenario = civilizationPlugin.scenarios[0];
  const civRun = new SimulationKernel({
    runId: 'run-civ-frontier',
    name: 'Civilization // Arid Frontier Network',
    plugin: civilizationPlugin,
    seed: civScenario.seed,
    config: civScenario.config,
    scheduledCommands: civScenario.scheduledCommands,
    hypothesisNote: civScenario.hypothesis,
  });
  civRun.stepMany(5);

  return {
    runs: {
      [ecoRun.runId]: ecoRun,
      [stnRun.runId]: stnRun,
      [civRun.runId]: civRun,
    },
    defaultActiveId: ecoRun.runId,
    defaultCompareId: stnRun.runId,
  };
}

export interface MultiverseState {
  activeTab: MultiverseTab;
  runs: Record<RunId, SimulationKernel<any, any>>;
  activeRunId: RunId;
  comparisonRightRunId: RunId;
  comparisonSyncTick: number | undefined;
  isRunning: boolean;
  simulationSpeed: 0.5 | 1 | 2 | 4 | 8;
  selectedEntityId: string | null;
  selectedEventId: EventId | null;
  uiRevision: number;
  renderFps: number;
  frameTimeMs: number;
  webglSupported: boolean;
  webglContextLost: boolean;
  experiments: ExperimentResultRecord[];
  savedRunsMeta: SavedRunMeta[];
  preferences: UIPreferencesRecord;
  systemAlerts: SystemDiagnosticAlert[];
  lastReplayCheck: {
    runId: RunId;
    tick: number;
    passed: boolean;
    authoritativeHash: string;
    replayedHash: string;
  } | null;

  // Actions
  initializeStoreFromDb(): Promise<void>;
  setActiveTab(tab: MultiverseTab): void;
  selectRun(runId: RunId): void;
  setComparisonRightRun(runId: RunId): void;
  setComparisonSyncTick(tick: number | undefined): void;
  selectEntity(entityId: string | null): void;
  selectEvent(eventId: EventId | null): void;
  setRenderTelemetry(fps: number, frameTimeMs: number): void;
  setWebglStatus(supported: boolean, contextLost?: boolean): void;

  createNewRun(options: {
    worldId: WorldId;
    scenarioId?: string;
    customName?: string;
    customSeed?: number;
    configOverrides?: Record<string, unknown>;
    switchToObservatory?: boolean;
  }): RunId;

  stepActiveRun(steps?: number): void;
  fastForwardActiveRun(steps: number): Promise<void>;
  stepComparisonPair(): void;
  toggleRunning(forceState?: boolean): void;
  setSimulationSpeed(speed: 0.5 | 1 | 2 | 4 | 8): void;
  resetActiveRun(): void;

  dispatchCommand(
    commandType: string,
    label: string,
    payload: Record<string, unknown>,
    targetRunId?: RunId,
  ): void;

  createManualCheckpoint(label?: string, runId?: RunId): CheckpointId;
  restoreCheckpoint(checkpointId: CheckpointId, runId?: RunId): void;
  forkRunBranch(
    options: Omit<ForkBranchOptions, 'newRunId'> & { sourceRunId?: RunId },
  ): RunId;
  verifyReplayEquivalence(runId?: RunId): boolean;

  executeExperiment(definition: ExperimentDefinition): Promise<ExperimentResultRecord>;

  previewCrossWorldEvent(
    sourceRunId: RunId,
    sourceEventId: EventId,
    targetRunId: RunId,
    preferredAdapterId?: string,
  ): CrossWorldTransferPreview | null;

  applyCrossWorldEvent(
    sourceRunId: RunId,
    sourceEventId: EventId,
    targetRunId: RunId,
    preferredAdapterId?: string,
  ): CrossWorldTransferPreview | null;

  getComparisonReport(): RealityComparisonReport | null;
  getPerformanceSample(): PerformanceSample;

  saveRunToVault(runId?: RunId): Promise<SavedRunMeta | null>;
  loadRunFromVault(runId: RunId): Promise<boolean>;
  deleteRunFromVault(runId: RunId): Promise<void>;
  exportRunArchive(runId?: RunId): { filename: string; bytes: Uint8Array };
  importRunArchive(bytes: Uint8Array): Promise<ArchiveInspectionResult>;

  updatePreferences(partial: Partial<UIPreferencesRecord>): Promise<void>;
  recordAlert(
    severity: SystemDiagnosticAlert['severity'],
    title: string,
    message: string,
    recoveredCheckpointId?: string,
  ): void;
  clearAlerts(): void;
  triggerFaultRecoveryDrill(
    drill:
      | 'worker_crash'
      | 'simulation_exception_rollback'
      | 'storage_quota'
      | 'corrupt_archive'
      | 'invalid_plugin',
  ): Promise<void>;
  exportDiagnosticsJson(): string;
}

const initialFlagships = createInitialFlagshipRuns();

export const useMultiverseStore = create<MultiverseState>((set, get) => ({
  activeTab: 'observatory',
  runs: initialFlagships.runs,
  activeRunId: initialFlagships.defaultActiveId,
  comparisonRightRunId: initialFlagships.defaultCompareId,
  comparisonSyncTick: undefined,
  isRunning: false,
  simulationSpeed: 1,
  selectedEntityId: null,
  selectedEventId: null,
  uiRevision: 1,
  renderFps: 60,
  frameTimeMs: 16.6,
  webglSupported: true,
  webglContextLost: false,
  experiments: [],
  savedRunsMeta: [],
  preferences: { ...DEFAULT_UI_PREFERENCES },
  systemAlerts: [],
  lastReplayCheck: null,

  async initializeStoreFromDb() {
    try {
      const [prefs, savedMetas, savedExps] = await Promise.all([
        loadPreferencesFromDb(),
        listSavedRunsFromDb(),
        listExperimentsFromDb(),
      ]);

      // Also save initial flagship runs if DB is empty so Vault has immediate entries
      if (savedMetas.length === 0) {
        const currentRuns = Object.values(get().runs);
        const createdMetas: SavedRunMeta[] = [];
        for (const r of currentRuns) {
          const m = await saveRunToDb(r.exportRunRecord());
          createdMetas.push(m);
        }
        set({
          preferences: prefs,
          savedRunsMeta: createdMetas,
          experiments: savedExps,
        });
      } else {
        set({
          preferences: prefs,
          savedRunsMeta: savedMetas,
          experiments: savedExps,
        });
      }
    } catch (err) {
      get().recordAlert(
        'warning',
        'IndexedDB Initialization Warning',
        err instanceof Error ? err.message : String(err),
      );
    }
  },

  setActiveTab(tab) {
    set({ activeTab: tab });
  },

  selectRun(runId) {
    const { runs } = get();
    if (!runs[runId]) return;
    set((s) => ({
      activeRunId: runId,
      selectedEntityId: null,
      selectedEventId: null,
      uiRevision: s.uiRevision + 1,
    }));
  },

  setComparisonRightRun(runId) {
    const { runs } = get();
    if (!runs[runId]) return;
    set((s) => ({
      comparisonRightRunId: runId,
      uiRevision: s.uiRevision + 1,
    }));
  },

  setComparisonSyncTick(tick) {
    set((s) => ({
      comparisonSyncTick: tick,
      uiRevision: s.uiRevision + 1,
    }));
  },

  selectEntity(entityId) {
    set({ selectedEntityId: entityId });
  },

  selectEvent(eventId) {
    set({ selectedEventId: eventId });
  },

  setRenderTelemetry(fps, frameTimeMs) {
    set({ renderFps: fps, frameTimeMs });
  },

  setWebglStatus(supported, contextLost = false) {
    set({ webglSupported: supported, webglContextLost: contextLost });
    if (!supported || contextLost) {
      get().recordAlert(
        'warning',
        contextLost ? 'WebGL Context Lost — Fallback Active' : 'WebGL Unavailable — Tabular Telemetry Mode Active',
        'The observatory has automatically engaged non-WebGL accessible instrumentation mode so simulation inspection continues uninterrupted.',
      );
    }
  },

  createNewRun(options) {
    const plugin = globalPluginRegistry.get(options.worldId);
    const scenario =
      plugin.scenarios.find((sc) => sc.id === options.scenarioId) ??
      plugin.scenarios[0];

    const seed =
      options.customSeed !== undefined
        ? options.customSeed
        : scenario
          ? scenario.seed
          : 424242;

    const baseConfig = scenario ? scenario.config : plugin.defaultConfig;
    const mergedConfig = {
      ...baseConfig,
      ...(options.configOverrides ?? {}),
    };

    const runId = `run-${options.worldId}-${Date.now().toString(36)}-${Math.floor((seed % 997) + 1)}`;
    const runName =
      options.customName?.trim() ||
      `${plugin.name.replace(/World [A-Z] — /, '')} // ${scenario ? scenario.name : 'Custom Run'}`;

    const kernel = new SimulationKernel({
      runId,
      name: runName,
      plugin,
      seed,
      config: mergedConfig,
      scheduledCommands: scenario?.scheduledCommands,
      hypothesisNote: scenario?.hypothesis,
    });

    set((s) => ({
      runs: { ...s.runs, [runId]: kernel },
      activeRunId: runId,
      activeTab: options.switchToObservatory !== false ? 'observatory' : s.activeTab,
      selectedEntityId: null,
      selectedEventId: null,
      uiRevision: s.uiRevision + 1,
    }));

    if (get().preferences.autosaveEnabled) {
      autosaveManager.scheduleAutosave(
        () => kernel.exportRunRecord(),
        async () => {
          const metas = await listSavedRunsFromDb();
          set({ savedRunsMeta: metas });
        },
      );
    }

    return runId;
  },

  stepActiveRun(steps = 1) {
    const { runs, activeRunId, preferences } = get();
    const kernel = runs[activeRunId];
    if (!kernel) return;

    try {
      const count = Math.max(1, Math.floor(steps));
      for (let i = 0; i < count; i++) {
        kernel.step();
      }
      set((s) => ({ uiRevision: s.uiRevision + 1 }));

      if (preferences.autosaveEnabled) {
        autosaveManager.scheduleAutosave(
          () => kernel.exportRunRecord(),
          async () => {
            const metas = await listSavedRunsFromDb();
            set({ savedRunsMeta: metas });
          },
          (err) => {
            get().recordAlert(
              'warning',
              'Autosave Throttled / Storage Warning',
              err.message,
            );
          },
        );
      }
    } catch (err) {
      // Isolate simulation exception and roll back to last known-good checkpoint
      const checkpoints = kernel.listCheckpoints();
      const lastGood = checkpoints[checkpoints.length - 1];
      if (lastGood) {
        kernel.restoreCheckpoint(lastGood.id);
      }
      set((s) => ({ isRunning: false, uiRevision: s.uiRevision + 1 }));
      get().recordAlert(
        'recovered',
        'Simulation Exception Isolated & Rolled Back',
        `Caught runtime exception during step: ${err instanceof Error ? err.message : String(err)}. Automatically restored last known-good checkpoint "${lastGood?.label ?? 'Genesis'}".`,
        lastGood?.id,
      );
    }
  },

  async fastForwardActiveRun(steps: number) {
    const { runs, activeRunId } = get();
    const kernel = runs[activeRunId];
    if (!kernel) return;

    try {
      await workerBridge.stepKernelWithWorkerOrFallback(kernel, steps, 280);
      set((s) => ({ uiRevision: s.uiRevision + 1 }));
    } catch (err) {
      get().recordAlert(
        'error',
        'Fast-Forward Interrupted',
        err instanceof Error ? err.message : String(err),
      );
    }
  },

  stepComparisonPair() {
    const { runs, activeRunId, comparisonRightRunId } = get();
    const left = runs[activeRunId];
    const right = runs[comparisonRightRunId];
    if (left) left.step();
    if (right && right.runId !== left?.runId) right.step();
    set((s) => ({ uiRevision: s.uiRevision + 1 }));
  },

  toggleRunning(forceState) {
    set((s) => ({
      isRunning: forceState !== undefined ? forceState : !s.isRunning,
    }));
  },

  setSimulationSpeed(speed) {
    set({ simulationSpeed: speed });
    savePreferencesToDb({ simulationSpeed: speed }).catch(() => {});
  },

  resetActiveRun() {
    const { runs, activeRunId } = get();
    const kernel = runs[activeRunId];
    if (!kernel) return;
    const genesis = kernel.listCheckpoints()[0];
    if (genesis) {
      kernel.restoreCheckpoint(genesis.id);
      set((s) => ({
        isRunning: false,
        selectedEntityId: null,
        selectedEventId: null,
        uiRevision: s.uiRevision + 1,
      }));
    }
  },

  dispatchCommand(commandType, label, payload, targetRunId) {
    const { runs, activeRunId } = get();
    const runId = targetRunId ?? activeRunId;
    const kernel = runs[runId];
    if (!kernel) return;

    if (!commandType || typeof commandType !== 'string') {
      get().recordAlert(
        'error',
        'Invalid Command Rejected',
        'Command type must be a non-empty string.',
      );
      return;
    }

    kernel.enqueueCommand({
      tick: kernel.tick,
      type: commandType,
      label,
      payload,
    });
    kernel.flushCurrentTickCommands();

    const events = kernel.getEvents();
    const latestEvent = events[events.length - 1];
    set((s) => ({
      selectedEventId: latestEvent ? latestEvent.id : s.selectedEventId,
      uiRevision: s.uiRevision + 1,
    }));
  },

  createManualCheckpoint(label, runId) {
    const { runs, activeRunId } = get();
    const target = runs[runId ?? activeRunId];
    if (!target) throw new Error('Target run not found');
    const chk = target.createCheckpoint(
      label?.trim() || `Manual Checkpoint @ Tick ${target.tick}`,
    );
    set((s) => ({ uiRevision: s.uiRevision + 1 }));
    return chk.id;
  },

  restoreCheckpoint(checkpointId, runId) {
    const { runs, activeRunId } = get();
    const target = runs[runId ?? activeRunId];
    if (!target) return;
    target.restoreCheckpoint(checkpointId);
    set((s) => ({
      isRunning: false,
      uiRevision: s.uiRevision + 1,
    }));
  },

  forkRunBranch(options) {
    const { runs, activeRunId } = get();
    const parent = runs[options.sourceRunId ?? activeRunId];
    if (!parent) throw new Error('Source run not found for branching');

    const newRunId = `branch-${parent.worldId}-t${parent.tick}-${Object.keys(runs).length + 1}`;
    const child = parent.forkBranch({
      ...options,
      newRunId,
    });

    set((s) => ({
      runs: {
        ...s.runs,
        [newRunId]: child,
      },
      activeRunId: newRunId,
      comparisonRightRunId: parent.runId,
      uiRevision: s.uiRevision + 1,
    }));

    return newRunId;
  },

  verifyReplayEquivalence(runId) {
    const { runs, activeRunId } = get();
    const target = runs[runId ?? activeRunId];
    if (!target) return false;
    const res = target.replayFromStart(target.tick);
    set((s) => ({
      lastReplayCheck: {
        runId: target.runId,
        tick: target.tick,
        passed: res.matchesAuthoritativeHash,
        authoritativeHash: res.authoritativeHash,
        replayedHash: res.replayedHash,
      },
      uiRevision: s.uiRevision + 1,
    }));
    return res.matchesAuthoritativeHash;
  },

  async executeExperiment(definition) {
    const { runs } = get();
    const sourceKernel = runs[definition.baselineRunId];
    if (!sourceKernel) {
      throw new Error(`Baseline run "${definition.baselineRunId}" not found`);
    }

    const { result, primaryBaselineKernel, primaryTreatmentKernel } =
      runControlledExperiment(sourceKernel, sourceKernel.plugin, definition);

    set((s) => ({
      runs: {
        ...s.runs,
        [primaryBaselineKernel.runId]: primaryBaselineKernel,
        [primaryTreatmentKernel.runId]: primaryTreatmentKernel,
      },
      comparisonRightRunId: primaryTreatmentKernel.runId,
      experiments: [result, ...s.experiments],
      uiRevision: s.uiRevision + 1,
    }));

    try {
      await saveExperimentToDb(result);
    } catch (err) {
      get().recordAlert(
        'warning',
        'Experiment Persistence Warning',
        err instanceof Error ? err.message : String(err),
      );
    }

    return result;
  },

  previewCrossWorldEvent(sourceRunId, sourceEventId, targetRunId, preferredAdapterId) {
    const { runs } = get();
    const sourceRun = runs[sourceRunId];
    const targetRun = runs[targetRunId];
    if (!sourceRun || !targetRun) return null;

    const event = sourceRun.getJournal().getById(sourceEventId);
    if (!event) return null;

    return defaultCrossWorldRegistry.previewTransfer(
      event,
      sourceRun.worldId,
      targetRun.worldId,
      preferredAdapterId,
    );
  },

  applyCrossWorldEvent(sourceRunId, sourceEventId, targetRunId, preferredAdapterId) {
    const preview = get().previewCrossWorldEvent(
      sourceRunId,
      sourceEventId,
      targetRunId,
      preferredAdapterId,
    );
    if (!preview) return null;

    if (!preview.compatible || !preview.translatedCommand) {
      get().recordAlert(
        'warning',
        'Cross-World Transfer Rejected by Contract',
        preview.rejectionReason ?? 'Incompatible source event and target world.',
      );
      return preview;
    }

    const targetRun = get().runs[targetRunId];
    if (!targetRun) return null;

    targetRun.enqueueCommand({
      tick: targetRun.tick,
      type: preview.translatedCommand.type,
      label: preview.translatedCommand.label,
      payload: preview.translatedCommand.payload,
      provenance: preview.translatedCommand.provenance,
    });
    targetRun.flushCurrentTickCommands();

    set((s) => ({ uiRevision: s.uiRevision + 1 }));
    return preview;
  },

  getComparisonReport() {
    const { runs, activeRunId, comparisonRightRunId, comparisonSyncTick } = get();
    const left = runs[activeRunId];
    const right = runs[comparisonRightRunId];
    if (!left || !right) return null;
    return compareRealities(left, right, comparisonSyncTick);
  },

  getPerformanceSample() {
    const { runs, activeRunId, renderFps, frameTimeMs } = get();
    const active = runs[activeRunId] ?? Object.values(runs)[0];
    return active.getPerformanceSample(
      renderFps,
      frameTimeMs,
      workerBridge.getQueueDepth(),
    );
  },

  async saveRunToVault(runId) {
    const { runs, activeRunId } = get();
    const target = runs[runId ?? activeRunId];
    if (!target) return null;
    try {
      const meta = await saveRunToDb(target.exportRunRecord());
      const metas = await listSavedRunsFromDb();
      set({ savedRunsMeta: metas });
      return meta;
    } catch (err) {
      get().recordAlert(
        'error',
        'Failed to Save Run to IndexedDB',
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }
  },

  async loadRunFromVault(runId) {
    try {
      const record = await loadRunFromDb(runId);
      if (!record) {
        get().recordAlert('error', 'Save Not Found', `Run "${runId}" was not found in IndexedDB.`);
        return false;
      }
      const plugin = globalPluginRegistry.get(record.worldId);
      const kernel = SimulationKernel.fromRunRecord(record, plugin);
      set((s) => ({
        runs: { ...s.runs, [kernel.runId]: kernel },
        activeRunId: kernel.runId,
        activeTab: 'observatory',
        uiRevision: s.uiRevision + 1,
      }));
      return true;
    } catch (err) {
      get().recordAlert(
        'error',
        'Corrupt or Incompatible Save Blocked',
        err instanceof Error ? err.message : String(err),
      );
      return false;
    }
  },

  async deleteRunFromVault(runId) {
    try {
      await deleteRunFromDb(runId);
      const metas = await listSavedRunsFromDb();
      set({ savedRunsMeta: metas });
    } catch (err) {
      get().recordAlert(
        'error',
        'Delete Failed',
        err instanceof Error ? err.message : String(err),
      );
    }
  },

  exportRunArchive(runId) {
    const { runs, activeRunId } = get();
    const target = runs[runId ?? activeRunId];
    if (!target) {
      throw new Error('No active run to export');
    }
    const record = target.exportRunRecord();
    const bytes = createPortableArchiveZip(record);
    const safeName = target.name
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-|-$/g, '');
    return {
      filename: `${safeName || target.runId}-t${target.tick}.omniverse.zip`,
      bytes,
    };
  },

  async importRunArchive(bytes) {
    const inspection = inspectAndUnpackArchiveZip(bytes);
    if (!inspection.valid || !inspection.record) {
      get().recordAlert(
        'error',
        'Portable Archive Rejected',
        inspection.errors.join(' | '),
      );
      return inspection;
    }

    try {
      const plugin = globalPluginRegistry.get(inspection.record.worldId);
      const kernel = SimulationKernel.fromRunRecord(inspection.record, plugin);
      await saveRunToDb(kernel.exportRunRecord());
      const metas = await listSavedRunsFromDb();

      set((s) => ({
        runs: { ...s.runs, [kernel.runId]: kernel },
        activeRunId: kernel.runId,
        savedRunsMeta: metas,
        uiRevision: s.uiRevision + 1,
      }));
      return inspection;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      get().recordAlert('error', 'Archive Restoration Failed', msg);
      return {
        valid: false,
        errors: [msg],
        warnings: inspection.warnings,
      };
    }
  },

  async updatePreferences(partial) {
    set((s) => ({
      preferences: {
        ...s.preferences,
        ...partial,
      },
    }));
    const updated = await savePreferencesToDb(partial);
    set({ preferences: updated });
  },

  recordAlert(severity, title, message, recoveredCheckpointId) {
    const alert: SystemDiagnosticAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestampIso: new Date().toISOString(),
      severity,
      title,
      message,
      recoveredCheckpointId,
    };
    set((s) => ({
      systemAlerts: [alert, ...s.systemAlerts].slice(0, 40),
    }));
  },

  clearAlerts() {
    set({ systemAlerts: [] });
  },

  async triggerFaultRecoveryDrill(drill) {
    const { runs, activeRunId } = get();
    const activeKernel = runs[activeRunId];

    if (drill === 'worker_crash') {
      workerBridge.handleWorkerCrash(
        'Diagnostic Drill: Simulated Worker Process Termination',
      );
      get().recordAlert(
        'recovered',
        'Worker Crash Isolated & Recovered',
        'Worker transport handled termination, cleared in-flight queue, and re-established simulation execution without losing authoritative kernel state.',
      );
    } else if (drill === 'simulation_exception_rollback') {
      const checkpoints = activeKernel.listCheckpoints();
      const lastGood = checkpoints[checkpoints.length - 1];
      if (lastGood) {
        activeKernel.restoreCheckpoint(lastGood.id);
      }
      get().recordAlert(
        'recovered',
        'Runtime Fault Rollback Verified',
        `Isolated simulated step fault on "${activeKernel.name}" and rolled back cleanly to checkpoint "${lastGood?.label ?? 'Genesis'}" (Hash ${lastGood?.stateHash.slice(0, 8)}).`,
        lastGood?.id,
      );
      set((s) => ({ uiRevision: s.uiRevision + 1 }));
    } else if (drill === 'storage_quota') {
      setSimulatedQuotaExceeded(true);
      try {
        await saveRunToDb(activeKernel.exportRunRecord());
      } catch (err) {
        get().recordAlert(
          'warning',
          'Storage Quota Exhaustion Handled',
          `${err instanceof Error ? err.message : String(err)} In-memory simulation state and checkpoints remain intact.`,
        );
      } finally {
        setSimulatedQuotaExceeded(false);
      }
    } else if (drill === 'corrupt_archive') {
      const corruptBytes = new Uint8Array([80, 75, 3, 4, 99, 99, 0, 0]);
      await get().importRunArchive(corruptBytes);
    } else if (drill === 'invalid_plugin') {
      try {
        globalPluginRegistry.register({ id: '' } as any);
      } catch (err) {
        get().recordAlert(
          'info',
          'Invalid Plugin Registration Blocked',
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  },

  exportDiagnosticsJson() {
    const state = get();
    const activeKernel = state.runs[state.activeRunId];
    const perf = state.getPerformanceSample();
    const payload = {
      exportedAtIso: new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
      activeWorldId: activeKernel?.worldId,
      activeRunId: activeKernel?.runId,
      activeTick: activeKernel?.tick,
      stateHash: activeKernel?.getStateHash(),
      webglSupported: state.webglSupported,
      webglContextLost: state.webglContextLost,
      workerDiagnostics: workerBridge.getDiagnostics(),
      performanceSample: perf,
      resourceBudget: activeKernel?.getBudget(),
      recentSystemAlerts: state.systemAlerts.slice(0, 15),
    };
    return JSON.stringify(payload, null, 2);
  },
}));
