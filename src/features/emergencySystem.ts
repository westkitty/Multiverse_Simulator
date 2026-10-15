import type { ScientificBudgetLedger } from './budgetLedger';
import type { HazardDependencyGraph } from './hazardGraph';

export type EmergencyStage =
  | 'dormant'
  | 'precursor'
  | 'active'
  | 'escalating'
  | 'contained'
  | 'resolved';

export interface EmergencyConsequences {
  /** Per-tick drain/penalty on world metrics while in active stage. Escalating stage applies a 2x multiplier. */
  metricPenaltiesPerTick: Record<string, number>;
  /** Per-tick resource drain on scientific budget ledger while active or escalating. */
  budgetDrainPerTick?: Record<string, number>;
  /** Optional downstream hazard node ID triggered if emergency enters escalating stage. */
  secondaryHazardNodeId?: string;
  /** Human-readable explanation of crisis impact. */
  description: string;
}

export interface EmergencyDefinition {
  id: string;
  worldId: string;
  name: string;
  description: string;
  triggerMetric: string;
  triggerOperator: '>' | '<' | '>=' | '<=';
  precursorThreshold: number;
  activeThreshold: number;
  escalateDelayTicks: number;
  containmentActionIds: string[];
  consequences: EmergencyConsequences;
}

export interface EmergencyTransitionEvent {
  tick: number;
  emergencyId: string;
  fromStage: EmergencyStage;
  toStage: EmergencyStage;
  reason: string;
}

export interface EmergencyState {
  id: string;
  worldId: string;
  stage: EmergencyStage;
  severity: number; // 0 to 100
  stageTicks: number;
  totalActiveTicks: number;
  mitigationCount: number;
  lastTransitionTick: number;
  history: EmergencyTransitionEvent[];
}

export interface EmergencyStepReport {
  tick: number;
  worldId: string;
  transitions: EmergencyTransitionEvent[];
  activeCount: number;
  escalatingCount: number;
  appliedPenalties: Record<string, number>;
  appliedBudgetDrains: Record<string, number>;
}

export class EmergencyManager {
  readonly worldId: string;
  private readonly definitions = new Map<string, EmergencyDefinition>();
  private readonly states = new Map<string, EmergencyState>();

  constructor(worldId: string) {
    this.worldId = worldId;
  }

  registerEmergency(def: EmergencyDefinition): void {
    if (def.worldId !== this.worldId) {
      throw new Error(
        `Emergency ${def.id} worldId (${def.worldId}) does not match manager worldId (${this.worldId})`,
      );
    }
    this.definitions.set(def.id, def);
    if (!this.states.has(def.id)) {
      this.states.set(def.id, {
        id: def.id,
        worldId: this.worldId,
        stage: 'dormant',
        severity: 0,
        stageTicks: 0,
        totalActiveTicks: 0,
        mitigationCount: 0,
        lastTransitionTick: 0,
        history: [],
      });
    }
  }

  getDefinition(id: string): EmergencyDefinition | undefined {
    return this.definitions.get(id);
  }

  getAllDefinitions(): EmergencyDefinition[] {
    return Array.from(this.definitions.values());
  }

  getState(id: string): EmergencyState | undefined {
    return this.states.get(id);
  }

  getAllStates(): EmergencyState[] {
    return Array.from(this.states.values());
  }

  getActiveEmergencies(): EmergencyState[] {
    return Array.from(this.states.values()).filter(
      (s) => s.stage === 'precursor' || s.stage === 'active' || s.stage === 'escalating',
    );
  }

  private evaluatesTrigger(
    val: number,
    threshold: number,
    op: '>' | '<' | '>=' | '<=',
  ): boolean {
    switch (op) {
      case '>':
        return val > threshold;
      case '<':
        return val < threshold;
      case '>=':
        return val >= threshold;
      case '<=':
        return val <= threshold;
    }
  }

  stepEmergencies(
    tick: number,
    metrics: Record<string, number>,
    ctx?: {
      applyMetricDelta?: (metric: string, delta: number) => void;
      budgetLedger?: ScientificBudgetLedger;
      hazardGraph?: HazardDependencyGraph;
    },
  ): EmergencyStepReport {
    const transitions: EmergencyTransitionEvent[] = [];
    const appliedPenalties: Record<string, number> = {};
    const appliedBudgetDrains: Record<string, number> = {};

    for (const [id, def] of this.definitions) {
      const state = this.states.get(id)!;
      const metricVal = metrics[def.triggerMetric] ?? 0;
      const isPrecursorTrip = this.evaluatesTrigger(
        metricVal,
        def.precursorThreshold,
        def.triggerOperator,
      );
      const isActiveTrip = this.evaluatesTrigger(
        metricVal,
        def.activeThreshold,
        def.triggerOperator,
      );

      state.stageTicks++;

      const transitionTo = (nextStage: EmergencyStage, reason: string) => {
        const fromStage = state.stage;
        state.stage = nextStage;
        state.stageTicks = 0;
        state.lastTransitionTick = tick;
        const ev: EmergencyTransitionEvent = {
          tick,
          emergencyId: id,
          fromStage,
          toStage: nextStage,
          reason,
        };
        state.history.push(ev);
        transitions.push(ev);
      };

      // State machine transitions
      switch (state.stage) {
        case 'dormant':
          if (isActiveTrip) {
            state.severity = 60;
            transitionTo('active', `Metric ${def.triggerMetric}=${metricVal} directly breached active threshold ${def.activeThreshold}`);
          } else if (isPrecursorTrip) {
            state.severity = 25;
            transitionTo('precursor', `Metric ${def.triggerMetric}=${metricVal} breached precursor threshold ${def.precursorThreshold}`);
          }
          break;

        case 'precursor':
          if (isActiveTrip) {
            state.severity = 65;
            transitionTo('active', `Precursor escalated: metric ${def.triggerMetric}=${metricVal} breached active threshold ${def.activeThreshold}`);
          } else if (state.stageTicks >= def.escalateDelayTicks && isPrecursorTrip) {
            state.severity = 60;
            transitionTo('active', `Unmitigated precursor timed out after ${state.stageTicks} ticks`);
          } else if (!isPrecursorTrip) {
            state.severity = 0;
            transitionTo('dormant', `Metric ${def.triggerMetric}=${metricVal} returned to safe range`);
          }
          break;

        case 'active':
          state.totalActiveTicks++;
          if (state.stageTicks >= def.escalateDelayTicks) {
            state.severity = 90;
            transitionTo('escalating', `Unchecked active emergency timed out after ${state.stageTicks} ticks into full cascade`);
          } else if (!isActiveTrip && !isPrecursorTrip) {
            state.severity = 20;
            transitionTo('contained', `Crisis conditions subsided; entering containment`);
          }
          break;

        case 'escalating':
          state.totalActiveTicks++;
          state.severity = 100;
          if (!isActiveTrip && !isPrecursorTrip) {
            state.severity = 30;
            transitionTo('contained', `Severe cascade subsided below trigger levels; entering containment`);
          }
          break;

        case 'contained':
          state.severity = Math.max(0, state.severity - 10);
          if (state.severity <= 0 && !isPrecursorTrip && !isActiveTrip) {
            transitionTo('resolved', 'Containment complete; baseline environmental integrity restored');
          }
          break;

        case 'resolved':
          transitionTo('dormant', 'Resetting resolved emergency to dormant monitoring');
          break;
      }

      // Apply penalties and drains if active or escalating
      if (state.stage === 'active' || state.stage === 'escalating') {
        const mult = state.stage === 'escalating' ? 2 : 1;

        // Metric penalties
        for (const [mKey, drain] of Object.entries(def.consequences.metricPenaltiesPerTick)) {
          const penalty = drain * mult;
          appliedPenalties[mKey] = (appliedPenalties[mKey] ?? 0) + penalty;
          if (ctx?.applyMetricDelta) {
            ctx.applyMetricDelta(mKey, -penalty);
          }
        }

        // Budget drain
        if (def.consequences.budgetDrainPerTick && ctx?.budgetLedger) {
          for (const [rKey, cost] of Object.entries(def.consequences.budgetDrainPerTick)) {
            const drainAmount = cost * mult;
            appliedBudgetDrains[rKey] = (appliedBudgetDrains[rKey] ?? 0) + drainAmount;
            ctx.budgetLedger.applyTransaction(
              `emergency-drain-${id}`,
              [{ resource: rKey, amount: drainAmount }],
              [],
              tick,
            );
          }
        }
      }
    }

    const activeCount = Array.from(this.states.values()).filter(
      (s) => s.stage === 'active',
    ).length;
    const escalatingCount = Array.from(this.states.values()).filter(
      (s) => s.stage === 'escalating',
    ).length;

    return {
      tick,
      worldId: this.worldId,
      transitions,
      activeCount,
      escalatingCount,
      appliedPenalties,
      appliedBudgetDrains,
    };
  }

  mitigateEmergency(
    emergencyId: string,
    tick: number,
    effectiveness = 1.0,
  ): { success: boolean; newStage?: EmergencyStage; reason?: string } {
    const state = this.states.get(emergencyId);
    if (!state) {
      return { success: false, reason: `Emergency ${emergencyId} not found` };
    }

    if (state.stage === 'dormant' || state.stage === 'resolved') {
      return { success: false, reason: `Emergency ${emergencyId} is not currently active` };
    }

    state.mitigationCount++;
    const fromStage = state.stage;
    let nextStage: EmergencyStage = state.stage;

    if (state.stage === 'escalating') {
      nextStage = effectiveness >= 1.5 ? 'contained' : 'active';
      state.severity = Math.max(40, state.severity - 40 * effectiveness);
    } else if (state.stage === 'active') {
      nextStage = effectiveness >= 1.0 ? 'contained' : 'precursor';
      state.severity = Math.max(20, state.severity - 45 * effectiveness);
    } else if (state.stage === 'precursor') {
      nextStage = 'dormant';
      state.severity = 0;
    } else if (state.stage === 'contained') {
      state.severity = Math.max(0, state.severity - 30 * effectiveness);
      if (state.severity <= 0) {
        nextStage = 'resolved';
      }
    }

    if (nextStage !== fromStage) {
      state.stage = nextStage;
      state.stageTicks = 0;
      state.lastTransitionTick = tick;
      state.history.push({
        tick,
        emergencyId,
        fromStage,
        toStage: nextStage,
        reason: `Mitigation intervention applied (effectiveness=${effectiveness})`,
      });
    }

    return { success: true, newStage: nextStage };
  }

  toJSON(): {
    worldId: string;
    states: EmergencyState[];
  } {
    return {
      worldId: this.worldId,
      states: Array.from(this.states.values()),
    };
  }

  fromJSON(data: { worldId: string; states: EmergencyState[] }): void {
    if (data.worldId !== this.worldId) {
      throw new Error(`Data worldId ${data.worldId} does not match manager ${this.worldId}`);
    }
    for (const s of data.states) {
      if (this.states.has(s.id)) {
        this.states.set(s.id, { ...s, history: [...s.history] });
      }
    }
  }
}
