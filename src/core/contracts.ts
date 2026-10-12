export const ENGINE_VERSION = '1.0.0';
export const SCHEMA_VERSION = 1;

export type Tick = number;
export type RunId = string;
export type BranchId = string;
export type CheckpointId = string;
export type EventId = string;
export type EntityId = string;
export type PrimaryWorldId =
  | 'ecosystem'
  | 'station'
  | 'civilization'
  | 'atmosphere'
  | 'ocean'
  | 'celestial'
  | 'megacity'
  | 'industrial'
  | 'geology'
  | 'wild-meridian'
  | 'hollow-deep'
  | 'timeworn-empire'
  | 'terraforming-frontier'
  | 'machine-wilderness'
  | 'signal-expanse';
export type WorldId = PrimaryWorldId | string;

export interface WorldScaleMetadata {
  areaUnitLabel: string;
  baselinePlayableArea: number;
  expandedPlayableArea: number;
  baselineTerritoryScalar: number;
  expandedTerritoryScalar: number;
  baselineScenarioCount: number;
  baselineInterventionCount: number;
  baselineMetricCount: number;
}

export type CausalLinkType = 'direct' | 'dependency' | 'inferred' | 'unknown';

export interface CausalEventDelta {
  metricOrField: string;
  before: number | string;
  after: number | string;
  unit?: string;
}

export interface CausalEvent {
  id: EventId;
  runId: RunId;
  tick: Tick;
  type: string;
  severity: 'info' | 'warning' | 'critical' | 'positive';
  title: string;
  description: string;
  sourceSystem: string;
  sourceEntityId: EntityId | null;
  affectedEntityIds: EntityId[];
  payload: Record<string, unknown>;
  deltas: CausalEventDelta[];
  causedByEventId: EventId | null;
  causalLinkType: CausalLinkType;
  causalExplanation: string;
  correlationId: string;
  schemaVersion: number;
}

export interface CausalChainInspection {
  event: CausalEvent;
  whatHappened: string;
  whatChanged: CausalEventDelta[];
  whatCausedIt: {
    linkType: CausalLinkType;
    explanation: string;
    upstreamChain: CausalEvent[];
  };
  whatWasAffected: {
    entityIds: EntityId[];
    description: string;
  };
  whatHappenedNext: CausalEvent[];
}

export interface CrossWorldProvenance {
  adapterId: string;
  sourceRunId: RunId;
  sourceWorldId: WorldId;
  sourceEventId: EventId;
  sourceTick: Tick;
  informationLossNotes: string[];
}

export interface SimulationCommand<TPayload = Record<string, unknown>> {
  id: string;
  tick: Tick;
  sequence: number;
  type: string;
  label: string;
  payload: TPayload;
  provenance?: CrossWorldProvenance;
  executedAtTick?: Tick;
  replayPhase?: 'pre_systems' | 'post_systems';
}

export interface MetricDefinition {
  id: string;
  label: string;
  unit: string;
  category: string;
  /**
   * Optional explicit shared dimension key if and only if two metrics across
   * worlds share an exact compatible conceptual definition (e.g. 'utilization_ratio').
   * Prevents arbitrary or misleading cross-world normalization.
   */
  comparableDimension?: string;
  description: string;
  warningThreshold?: number;
  criticalThreshold?: number;
  higherIsBetter?: boolean;
}

export interface MetricPoint {
  tick: Tick;
  values: Record<string, number>;
}

export interface EntityProperty {
  key: string;
  label: string;
  value: string | number;
  unit?: string;
}

export interface EntityInspection {
  entityId: EntityId;
  kind: string;
  label: string;
  status: 'nominal' | 'warning' | 'critical' | 'inactive';
  position?: [number, number, number];
  summary: string;
  properties: EntityProperty[];
}

export interface RenderEntityVisual {
  id: EntityId;
  kind: string;
  label: string;
  position: [number, number, number];
  prevPosition?: [number, number, number];
  scale: [number, number, number];
  rotationY?: number;
  color: string;
  secondaryColor?: string;
  energyOrHealth: number;
  status: 'nominal' | 'warning' | 'critical' | 'inactive';
  metadata?: Record<string, number | string | boolean>;
}

export interface RenderConnectionVisual {
  id: string;
  from: [number, number, number];
  to: [number, number, number];
  status: 'open' | 'closed' | 'active' | 'strained' | 'broken';
  flowRate: number;
  label: string;
}

export interface RenderZoneVisual {
  id: string;
  label: string;
  position: [number, number, number];
  size: [number, number, number];
  value: number;
  secondaryValue?: number;
  status: 'nominal' | 'warning' | 'critical';
  color: string;
  metadata?: Record<string, number | string | boolean>;
}

export interface RenderFrameData {
  worldId: WorldId;
  runId: RunId;
  tick: Tick;
  ambientStatus: 'nominal' | 'warning' | 'critical';
  entities: RenderEntityVisual[];
  zones: RenderZoneVisual[];
  connections: RenderConnectionVisual[];
  hudSummary: Record<string, string | number>;
}

export interface EmitEventInput {
  type: string;
  severity: 'info' | 'warning' | 'critical' | 'positive';
  title: string;
  description: string;
  sourceSystem: string;
  sourceEntityId?: EntityId | null;
  affectedEntityIds?: EntityId[];
  payload?: Record<string, unknown>;
  deltas?: CausalEventDelta[];
  causedByEventId?: EventId | null;
  causalLinkType?: CausalLinkType;
  causalExplanation?: string;
  correlationId?: string;
}

export interface rngStreamInterface {
  nextFloat(): number;
  nextRange(min: number, max: number): number;
  nextInt(minInclusive: number, maxInclusive: number): number;
  nextBoolean(probability?: number): boolean;
  pick<T>(items: readonly T[]): T;
  gaussian(mean?: number, stdDev?: number): number;
}

export interface DeterministicRngState {
  masterSeed: number;
  streams: Record<string, number>;
}

export interface DeterministicRng {
  readonly masterSeed: number;
  stream(name: string): rngStreamInterface;
  serialize(): DeterministicRngState;
  restore(state: DeterministicRngState): void;
  clone(): DeterministicRng;
}

export interface SystemExecutionContext<TState, TConfig> {
  readonly runId: RunId;
  readonly tick: Tick;
  readonly config: TConfig;
  readonly state: TState;
  readonly rng: DeterministicRng;
  emitEvent(input: EmitEventInput): CausalEvent;
  findRecentEventByType(type: string, maxTickAge?: number): CausalEvent | undefined;
}

export interface CommandExecutionContext<TConfig> {
  readonly runId: RunId;
  readonly tick: Tick;
  readonly config: TConfig;
  readonly rng: DeterministicRng;
  emitEvent(input: EmitEventInput): CausalEvent;
}

export interface SimulationSystem<TState, TConfig> {
  id: string;
  name: string;
  order: number;
  step(ctx: SystemExecutionContext<TState, TConfig>): void;
}

export interface WorldScenarioPreset<TConfig> {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  hypothesis: string;
  seed: number;
  config: TConfig;
  scheduledCommands?: Array<{
    tick: Tick;
    type: string;
    label: string;
    payload: Record<string, unknown>;
  }>;
}

export interface QuickInterventionDescriptor {
  id: string;
  label: string;
  description: string;
  category: 'crisis' | 'policy' | 'restoration' | 'structure';
  commandType: string;
  defaultPayload: Record<string, unknown>;
}

export interface WorldPlugin<
  TConfig = Record<string, unknown>,
  TState = Record<string, unknown>,
> {
  id: WorldId;
  name: string;
  subtitle: string;
  version: string;
  schemaVersion: number;
  accentColor: string;
  description: string;
  physicalModelDocumentation: string[];
  simplifiedMechanicsNote: string;
  scaleMetadata?: WorldScaleMetadata;
  defaultConfig: TConfig;
  scenarios: WorldScenarioPreset<TConfig>[];
  quickInterventions: QuickInterventionDescriptor[];
  metricDefinitions: MetricDefinition[];

  register(): void;
  validateConfig(raw: unknown): {
    valid: boolean;
    config?: TConfig;
    errors?: string[];
  };
  initializeWorld(config: TConfig, rng: DeterministicRng): TState;
  getSystems(): SimulationSystem<TState, TConfig>[];
  applyCommand(
    state: TState,
    command: SimulationCommand,
    ctx: CommandExecutionContext<TConfig>,
  ): void;
  serializeState(state: TState): Record<string, unknown>;
  restoreState(serialized: Record<string, unknown>): TState;
  migrateState(
    serialized: Record<string, unknown>,
    fromSchemaVersion: number,
  ): Record<string, unknown>;
  extractMetrics(state: TState, config: TConfig): Record<string, number>;
  inspectEntities(state: TState, config: TConfig): EntityInspection[];
  extractRenderFrame(
    state: TState,
    config: TConfig,
    runId: RunId,
    tick: Tick,
  ): RenderFrameData;
  dispose(): void;
}

export interface ResourceBudgetConfig {
  maxEvents: number;
  maxCheckpoints: number;
  maxMetricHistory: number;
  maxEntitiesWarning: number;
  maxFastForwardStepBudgetMs: number;
  maxWorkerQueueDepth: number;
  autoCheckpointIntervalTicks: number;
}

export const DEFAULT_RESOURCE_BUDGET: ResourceBudgetConfig = {
  maxEvents: 1500,
  maxCheckpoints: 32,
  maxMetricHistory: 600,
  maxEntitiesWarning: 1200,
  maxFastForwardStepBudgetMs: 250,
  maxWorkerQueueDepth: 32,
  autoCheckpointIntervalTicks: 25,
};

export interface CheckpointSnapshot {
  id: CheckpointId;
  runId: RunId;
  label: string;
  tick: Tick;
  createdAtSimTick: Tick;
  stateHash: string;
  rngState: DeterministicRngState;
  serializedState: Record<string, unknown>;
  config: Record<string, unknown>;
  commandSequence: number;
  commandHistoryLength: number;
  metricsAtTick: Record<string, number>;
  byteSizeEstimate: number;
  /** Optional causal-journal state at fork origin. Existing checkpoints/archives omit it. */
  replayJournal?: { sequenceCounter: number; events: CausalEvent[] };
}

export interface BranchLineage {
  runId: RunId;
  name: string;
  worldId: WorldId;
  parentRunId: RunId | null;
  forkedAtTick: Tick;
  forkCheckpointId: CheckpointId | null;
  seed: number;
  createdAtLabel: string;
  hypothesisNote?: string;
}

export interface PerformanceSample {
  tick: Tick;
  stepDurationMs: number;
  stepsPerSecond: number;
  renderFps: number;
  frameTimeMs: number;
  entityCount: number;
  eventCount: number;
  eventThroughputPerSec: number;
  workerQueueDepth: number;
  checkpointCount: number;
  snapshotStorageBytes: number;
  saveLoadLatencyMs: number;
  heapUsedBytes: number | null;
}

/**
 * Deterministic numeric rounding to avoid floating-point drift across steps.
 * Rounds half-away-from-zero at the specified decimal precision.
 */
export function roundDet(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Clamp a numeric value deterministically between [min, max].
 */
export function clampDet(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Canonical JSON stringifier with sorted object keys for deterministic state hashing.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(roundDet(value, 6)) : 'null';
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((item) => stableStringify(item)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs: string[] = [];
  for (const key of keys) {
    const val = obj[key];
    if (val !== undefined && typeof val !== 'function') {
      pairs.push(JSON.stringify(key) + ':' + stableStringify(val));
    }
  }
  return '{' + pairs.join(',') + '}';
}

/**
 * Deterministic 64-bit FNV-1a hash formatted as a 16-character hex digest.
 */
export function fnv1a64(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

export function computeStateHash(
  worldId: WorldId,
  tick: Tick,
  serializedState: Record<string, unknown>,
  rngState: DeterministicRngState,
): string {
  const payload = stableStringify({
    worldId,
    tick,
    state: serializedState,
    rng: rngState,
  });
  return fnv1a64(payload);
}
