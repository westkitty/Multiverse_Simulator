export interface PolicyDefinition {
  id: string;
  worldId: string;
  name: string;
  description: string;
  targetHazard: string;
  /** Per-tick resource cost deducted from scientific budget */
  resourceCostsPerTick: Record<string, number>;
  /** Direct per-tick benefit applied to positive metrics or reducing negative hazards */
  metricBenefitsPerTick: Record<string, number>;
  /** Inevitable trade-off penalty applied per-tick to secondary metrics */
  sideEffectsPerTick: Record<string, number>;
  /** Concise explanation of trade-off (e.g. "Prevents flood but accelerates equipment wear") */
  tradeoffSummary: string;
}

export interface ArmTrialOutcome {
  armId: 'baseline' | 'policyA' | 'policyB';
  policyId?: string;
  policyName: string;
  ticksRun: number;
  initialMetrics: Record<string, number>;
  terminalMetrics: Record<string, number>;
  totalResourcesSpent: Record<string, number>;
  netStabilityScore: number; // 0 to 100
  tradeoffSummary: string;
}

export interface ThreeArmTrialResult {
  worldId: string;
  horizonTicks: number;
  baseline: ArmTrialOutcome;
  policyA: ArmTrialOutcome;
  policyB: ArmTrialOutcome;
  comparativeSummary: string;
  tradeoffsIdentified: string[];
}

export class PolicyManager {
  readonly worldId: string;
  private readonly policies = new Map<string, PolicyDefinition>();

  constructor(worldId: string) {
    this.worldId = worldId;
  }

  registerPolicy(policy: PolicyDefinition): void {
    if (policy.worldId !== this.worldId) {
      throw new Error(
        `Policy ${policy.id} worldId (${policy.worldId}) does not match manager worldId (${this.worldId})`,
      );
    }
    this.policies.set(policy.id, policy);
  }

  getPolicy(id: string): PolicyDefinition | undefined {
    return this.policies.get(id);
  }

  getAllPolicies(): PolicyDefinition[] {
    return Array.from(this.policies.values());
  }

  /**
   * Simulates a deterministic three-arm trial over a fixed horizon:
   * 1. Baseline: No active policy (Status Quo)
   * 2. Policy A: Intensive or direct intervention
   * 3. Policy B: Alternative or conservation-focused intervention
   */
  evaluateThreeArmTrial(
    initialMetrics: Record<string, number>,
    policyAId: string,
    policyBId: string,
    horizonTicks = 50,
  ): ThreeArmTrialResult {
    const policyA = this.policies.get(policyAId);
    const policyB = this.policies.get(policyBId);

    if (!policyA) {
      throw new Error(`Policy A (${policyAId}) not found on world ${this.worldId}`);
    }
    if (!policyB) {
      throw new Error(`Policy B (${policyBId}) not found on world ${this.worldId}`);
    }

    const runArm = (
      armId: 'baseline' | 'policyA' | 'policyB',
      policy?: PolicyDefinition,
    ): ArmTrialOutcome => {
      const metrics = { ...initialMetrics };
      const resourcesSpent: Record<string, number> = {};

      for (let t = 0; t < horizonTicks; t++) {
        if (policy) {
          // Accumulate costs
          for (const [res, cost] of Object.entries(policy.resourceCostsPerTick)) {
            resourcesSpent[res] = (resourcesSpent[res] ?? 0) + cost;
          }
          // Apply benefits
          for (const [mKey, delta] of Object.entries(policy.metricBenefitsPerTick)) {
            metrics[mKey] = (metrics[mKey] ?? 0) + delta;
          }
          // Apply inevitable side-effects
          for (const [mKey, penalty] of Object.entries(policy.sideEffectsPerTick)) {
            metrics[mKey] = (metrics[mKey] ?? 0) - penalty;
          }
        }
      }

      for (const k of Object.keys(metrics)) {
        metrics[k] = Math.round(metrics[k] * 100) / 100;
      }
      for (const k of Object.keys(resourcesSpent)) {
        resourcesSpent[k] = Math.round(resourcesSpent[k] * 100) / 100;
      }

      // Compute aggregate stability score based on average metric health
      const metricValues = Object.values(metrics);
      const avgMetric =
        metricValues.length > 0
          ? metricValues.reduce((sum, v) => sum + v, 0) / metricValues.length
          : 50;
      const netStabilityScore = Math.max(0, Math.min(100, Math.round(avgMetric * 10) / 10));

      return {
        armId,
        policyId: policy?.id,
        policyName: policy ? policy.name : 'Status Quo (No Intervention)',
        ticksRun: horizonTicks,
        initialMetrics: { ...initialMetrics },
        terminalMetrics: metrics,
        totalResourcesSpent: resourcesSpent,
        netStabilityScore,
        tradeoffSummary: policy
          ? policy.tradeoffSummary
          : 'Zero resource expenditure, but unmitigated hazard progression.',
      };
    };

    const baseline = runArm('baseline');
    const outcomeA = runArm('policyA', policyA);
    const outcomeB = runArm('policyB', policyB);

    const tradeoffsIdentified = [
      `${policyA.name}: ${policyA.tradeoffSummary}`,
      `${policyB.name}: ${policyB.tradeoffSummary}`,
    ];

    const comparativeSummary =
      `Three-Arm Trial on ${this.worldId} (${horizonTicks} ticks): ` +
      `Baseline stability ${baseline.netStabilityScore}; ` +
      `${policyA.name} stability ${outcomeA.netStabilityScore}; ` +
      `${policyB.name} stability ${outcomeB.netStabilityScore}. ` +
      `Interventions demonstrate authentic trade-offs between resource expenditure and secondary collateral strain.`;

    return {
      worldId: this.worldId,
      horizonTicks,
      baseline,
      policyA: outcomeA,
      policyB: outcomeB,
      comparativeSummary,
      tradeoffsIdentified,
    };
  }

  toJSON(): {
    worldId: string;
    policyIds: string[];
  } {
    return {
      worldId: this.worldId,
      policyIds: Array.from(this.policies.keys()),
    };
  }
}
