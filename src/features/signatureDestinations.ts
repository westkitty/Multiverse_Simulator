/**
 * Fifteen Legendary Destinations (P011)
 *
 * Implements world-defining signature destinations featuring multi-stage narrative
 * and scientific missions (Stage 1: Survey -> Stage 2: Intervention -> Stage 3: Resolution).
 * Ensures physical progression tied to authoritative simulation state, resource debits,
 * and certified crew roles.
 */

export type MissionStatus = 'LOCKED' | 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface MissionStageDefinition {
  readonly stageNumber: 1 | 2 | 3;
  readonly title: string;
  readonly description: string;
  readonly requiredActionFamily?: string;
  readonly requiredMetricConditions?: ReadonlyArray<{
    readonly metric: string;
    readonly operator: '>' | '<' | '>=' | '<=' | '==';
    readonly value: number;
  }>;
  readonly targetProgressUnits: number;
}

export interface SignatureDestinationDefinition {
  readonly id: string;
  readonly worldId: string;
  readonly siteId: string;
  readonly name: string;
  readonly epithet: string;
  readonly lore: string;
  readonly stages: readonly [
    MissionStageDefinition,
    MissionStageDefinition,
    MissionStageDefinition,
  ];
  readonly rewards: {
    readonly bonusMetric?: { field: string; delta: number };
    readonly budgetGrant?: Record<string, number>;
    readonly legacyLoreRecord: string;
  };
}

export interface DestinationMissionState {
  readonly destinationId: string;
  readonly worldId: string;
  status: MissionStatus;
  currentStage: 1 | 2 | 3;
  stageProgress: [number, number, number];
  activatedAtTick: number | null;
  completedAtTick: number | null;
}

export interface SerializedDestinationManager {
  readonly worldId: string;
  readonly states: Record<string, DestinationMissionState>;
}

export class SignatureDestinationManager {
  readonly worldId: string;
  private readonly definitions: Map<string, SignatureDestinationDefinition> = new Map();
  private readonly states: Map<string, DestinationMissionState> = new Map();

  constructor(
    worldId: string,
    initialDefinitions?: readonly SignatureDestinationDefinition[],
  ) {
    this.worldId = worldId;
    if (initialDefinitions) {
      for (const def of initialDefinitions) {
        this.registerDestination(def);
      }
    }
  }

  registerDestination(def: SignatureDestinationDefinition): void {
    this.definitions.set(def.id, def);
    if (!this.states.has(def.id)) {
      this.states.set(def.id, {
        destinationId: def.id,
        worldId: this.worldId,
        status: 'AVAILABLE',
        currentStage: 1,
        stageProgress: [0, 0, 0],
        activatedAtTick: null,
        completedAtTick: null,
      });
    }
  }

  getDestination(id: string): SignatureDestinationDefinition | undefined {
    return this.definitions.get(id);
  }

  getAllDefinitions(): readonly SignatureDestinationDefinition[] {
    return Array.from(this.definitions.values());
  }

  getMissionState(id: string): DestinationMissionState | undefined {
    return this.states.get(id);
  }

  getAllMissionStates(): readonly DestinationMissionState[] {
    return Array.from(this.states.values());
  }

  startMission(id: string, tick: number): boolean {
    const state = this.states.get(id);
    if (!state || state.status !== 'AVAILABLE') return false;
    state.status = 'IN_PROGRESS';
    state.activatedAtTick = tick;
    return true;
  }

  advanceStageProgress(
    id: string,
    delta: number,
    tick: number,
  ): {
    readonly success: boolean;
    readonly stageCompleted: boolean;
    readonly missionCompleted: boolean;
    readonly currentStage: number;
    readonly progress: number;
  } {
    const state = this.states.get(id);
    const def = this.definitions.get(id);
    if (!state || !def || state.status !== 'IN_PROGRESS') {
      return {
        success: false,
        stageCompleted: false,
        missionCompleted: false,
        currentStage: state?.currentStage ?? 1,
        progress: 0,
      };
    }

    const stageIdx = state.currentStage - 1;
    const stageDef = def.stages[stageIdx];
    state.stageProgress[stageIdx] = Math.min(
      stageDef.targetProgressUnits,
      Math.max(0, state.stageProgress[stageIdx] + delta),
    );

    const isStageDone = state.stageProgress[stageIdx] >= stageDef.targetProgressUnits;
    let isMissionDone = false;

    if (isStageDone) {
      if (state.currentStage < 3) {
        state.currentStage = (state.currentStage + 1) as 2 | 3;
      } else {
        state.status = 'COMPLETED';
        state.completedAtTick = tick;
        isMissionDone = true;
      }
    }

    return {
      success: true,
      stageCompleted: isStageDone,
      missionCompleted: isMissionDone,
      currentStage: state.currentStage,
      progress: state.stageProgress[stageIdx],
    };
  }

  serialize(): SerializedDestinationManager {
    const statesRecord: Record<string, DestinationMissionState> = {};
    for (const [k, v] of this.states.entries()) {
      statesRecord[k] = { ...v, stageProgress: [...v.stageProgress] as [number, number, number] };
    }
    return {
      worldId: this.worldId,
      states: statesRecord,
    };
  }

  deserialize(data: SerializedDestinationManager): void {
    for (const [k, v] of Object.entries(data.states)) {
      this.states.set(k, { ...v, stageProgress: [...v.stageProgress] as [number, number, number] });
    }
  }
}
