/**
 * The Causality Detective (P013)
 *
 * Implements rigorous hypothesis formulation, paired control-vs-treatment trials,
 * causal effect size estimation, and honest confound disclosure across all 15 universes.
 */

export type HypothesisStatus = 'UNTESTED' | 'TESTING' | 'SUPPORTED' | 'REFUTED' | 'INCONCLUSIVE';

export interface HypothesisPrediction {
  readonly metric: string;
  readonly expectedDirection: 'increase' | 'decrease' | 'stabilize';
  readonly minimumExpectedDelta?: number;
}

export interface CausalHypothesisDefinition {
  readonly id: string;
  readonly worldId: string;
  readonly title: string;
  readonly premise: string;
  readonly targetActionFamily: string;
  readonly observableMetrics: readonly string[];
  readonly prediction: HypothesisPrediction;
  readonly confoundRisks: readonly string[];
}

export interface HypothesisTrialExecution {
  readonly trialId: string;
  readonly hypothesisId: string;
  readonly worldId: string;
  readonly seed: number;
  readonly startTick: number;
  readonly durationTicks: number;
  readonly baselineFinalHash: string;
  readonly treatmentFinalHash: string;
  readonly baselineDelta: number;
  readonly treatmentDelta: number;
  readonly causalEffectSize: number;
  readonly confidenceScore: number; // 0.0 - 1.0
  readonly detectedConfounds: readonly string[];
  readonly outcome: 'SUPPORTED' | 'REFUTED' | 'INCONCLUSIVE';
  readonly verifiedAtTick: number;
}

export interface SerializedHypothesisManager {
  readonly worldId: string;
  readonly hypotheses: readonly CausalHypothesisDefinition[];
  readonly trialHistory: readonly HypothesisTrialExecution[];
  readonly hypothesisStatuses: Record<string, HypothesisStatus>;
}

export class HypothesisInvestigationManager {
  readonly worldId: string;
  private readonly hypotheses: Map<string, CausalHypothesisDefinition> = new Map();
  private readonly trialHistory: HypothesisTrialExecution[] = [];
  private readonly statuses: Map<string, HypothesisStatus> = new Map();

  constructor(
    worldId: string,
    initialHypotheses?: readonly CausalHypothesisDefinition[],
  ) {
    this.worldId = worldId;
    if (initialHypotheses) {
      for (const h of initialHypotheses) {
        this.registerHypothesis(h);
      }
    }
  }

  registerHypothesis(def: CausalHypothesisDefinition): void {
    this.hypotheses.set(def.id, def);
    if (!this.statuses.has(def.id)) {
      this.statuses.set(def.id, 'UNTESTED');
    }
  }

  getHypothesis(id: string): CausalHypothesisDefinition | undefined {
    return this.hypotheses.get(id);
  }

  getAllHypotheses(): readonly CausalHypothesisDefinition[] {
    return Array.from(this.hypotheses.values());
  }

  getStatus(id: string): HypothesisStatus {
    return this.statuses.get(id) ?? 'UNTESTED';
  }

  getAllStatuses(): Record<string, HypothesisStatus> {
    const res: Record<string, HypothesisStatus> = {};
    for (const [k, v] of this.statuses.entries()) {
      res[k] = v;
    }
    return res;
  }

  getTrialHistory(hypothesisId?: string): readonly HypothesisTrialExecution[] {
    if (!hypothesisId) {
      return [...this.trialHistory];
    }
    return this.trialHistory.filter((t) => t.hypothesisId === hypothesisId);
  }

  /**
   * Evaluates a paired trial comparing baseline (control) vs treatment branch.
   */
  recordTrialResult(
    hypothesisId: string,
    trial: {
      seed: number;
      startTick: number;
      durationTicks: number;
      baselineFinalHash: string;
      treatmentFinalHash: string;
      baselineStartVal: number;
      baselineEndVal: number;
      treatmentStartVal: number;
      treatmentEndVal: number;
      externalHazardSpikeDetected?: boolean;
      resourceExhaustionDetected?: boolean;
      tick: number;
    },
  ): HypothesisTrialExecution {
    const def = this.hypotheses.get(hypothesisId);
    const baselineDelta = Math.round((trial.baselineEndVal - trial.baselineStartVal) * 100) / 100;
    const treatmentDelta = Math.round((trial.treatmentEndVal - trial.treatmentStartVal) * 100) / 100;
    const causalEffectSize = Math.round((treatmentDelta - baselineDelta) * 100) / 100;

    const detectedConfounds: string[] = [];
    if (trial.externalHazardSpikeDetected) {
      detectedConfounds.push('Concurrent external hazard spike distorted outcome.');
    }
    if (trial.resourceExhaustionDetected) {
      detectedConfounds.push('Resource exhaustion constrained intervention efficacy.');
    }

    let outcome: 'SUPPORTED' | 'REFUTED' | 'INCONCLUSIVE' = 'INCONCLUSIVE';
    let confidenceScore = 0.9;

    if (detectedConfounds.length > 0) {
      confidenceScore = 0.45;
      outcome = 'INCONCLUSIVE';
    } else if (def) {
      const pred = def.prediction;
      const minDelta = pred.minimumExpectedDelta ?? 0.5;

      if (pred.expectedDirection === 'increase') {
        outcome = causalEffectSize >= minDelta ? 'SUPPORTED' : 'REFUTED';
      } else if (pred.expectedDirection === 'decrease') {
        outcome = causalEffectSize <= -minDelta ? 'SUPPORTED' : 'REFUTED';
      } else {
        // stabilize
        outcome = Math.abs(causalEffectSize) <= minDelta ? 'SUPPORTED' : 'REFUTED';
      }
    }

    const execution: HypothesisTrialExecution = {
      trialId: `trial-${this.worldId}-${hypothesisId}-${this.trialHistory.length + 1}`,
      hypothesisId,
      worldId: this.worldId,
      seed: trial.seed,
      startTick: trial.startTick,
      durationTicks: trial.durationTicks,
      baselineFinalHash: trial.baselineFinalHash,
      treatmentFinalHash: trial.treatmentFinalHash,
      baselineDelta,
      treatmentDelta,
      causalEffectSize,
      confidenceScore,
      detectedConfounds,
      outcome,
      verifiedAtTick: trial.tick,
    };

    this.trialHistory.push(execution);
    this.statuses.set(hypothesisId, outcome);

    return execution;
  }

  serialize(): SerializedHypothesisManager {
    return {
      worldId: this.worldId,
      hypotheses: Array.from(this.hypotheses.values()),
      trialHistory: [...this.trialHistory],
      hypothesisStatuses: this.getAllStatuses(),
    };
  }

  deserialize(data: SerializedHypothesisManager): void {
    this.hypotheses.clear();
    this.statuses.clear();
    this.trialHistory.length = 0;

    for (const h of data.hypotheses) {
      this.hypotheses.set(h.id, h);
    }
    for (const [k, v] of Object.entries(data.hypothesisStatuses)) {
      this.statuses.set(k, v);
    }
    this.trialHistory.push(...data.trialHistory);
  }
}
