/**
 * Three Genuine Ages of History (P012)
 *
 * Implements three distinct, authored historical epochs per universe (45 eras total).
 * Each era alters the physical simulation regime (degradation rates, hazard acceleration,
 * resource yields) and transitions deterministically based on authoritatively evaluated catalysts.
 */

export interface EraRegimeModifiers {
  readonly degradationRateMultiplier: number;
  readonly consumptionMultiplier: number;
  readonly hazardEscalationMultiplier: number;
  readonly restorationEfficiencyMultiplier: number;
}

export interface EraTransitionCondition {
  readonly minTick?: number;
  readonly triggerMetric?: string;
  readonly triggerValue?: number;
  readonly comparison?: '>' | '<' | '>=' | '<=';
}

export interface HistoricalEraDefinition {
  readonly eraNumber: 1 | 2 | 3;
  readonly id: string;
  readonly worldId: string;
  readonly name: string;
  readonly subtitle: string;
  readonly lore: string;
  readonly catalystCondition: string;
  readonly transitionThreshold: EraTransitionCondition;
  readonly regimeModifiers: EraRegimeModifiers;
}

export interface HistoricalEraState {
  readonly worldId: string;
  currentEraNumber: 1 | 2 | 3;
  eraTransitionTicks: [number, number | null, number | null];
}

export class HistoricalEraManager {
  readonly worldId: string;
  private readonly eras: readonly [
    HistoricalEraDefinition,
    HistoricalEraDefinition,
    HistoricalEraDefinition,
  ];
  private currentEraNumber: 1 | 2 | 3 = 1;
  private readonly eraTransitionTicks: [number, number | null, number | null] = [0, null, null];

  constructor(
    worldId: string,
    eras: readonly [
      HistoricalEraDefinition,
      HistoricalEraDefinition,
      HistoricalEraDefinition,
    ],
  ) {
    this.worldId = worldId;
    this.eras = eras;
  }

  getCurrentEra(): HistoricalEraDefinition {
    return this.eras[this.currentEraNumber - 1];
  }

  getCurrentEraNumber(): 1 | 2 | 3 {
    return this.currentEraNumber;
  }

  getAllEras(): readonly [
    HistoricalEraDefinition,
    HistoricalEraDefinition,
    HistoricalEraDefinition,
  ] {
    return this.eras;
  }

  getRegimeModifiers(): EraRegimeModifiers {
    return this.getCurrentEra().regimeModifiers;
  }

  getEraTransitionTicks(): readonly [number, number | null, number | null] {
    return this.eraTransitionTicks;
  }

  /**
   * Evaluates simulation state to determine if an era catalyst has triggered a transition.
   * Eras progress monotonically (Era 1 -> Era 2 -> Era 3).
   */
  evaluateTransition(
    tick: number,
    metrics: Record<string, number>,
  ): {
    readonly transitioned: boolean;
    readonly previousEra?: HistoricalEraDefinition;
    readonly newEra?: HistoricalEraDefinition;
  } {
    if (this.currentEraNumber >= 3) {
      return { transitioned: false };
    }

    const nextEraIdx = this.currentEraNumber as 1 | 2; // 1 for Era 2, 2 for Era 3
    const nextEra = this.eras[nextEraIdx];
    const cond = nextEra.transitionThreshold;

    let satisfied = true;

    if (cond.minTick !== undefined && tick < cond.minTick) {
      satisfied = false;
    }

    if (cond.triggerMetric !== undefined && cond.triggerValue !== undefined) {
      const metricVal = metrics[cond.triggerMetric] ?? 0;
      switch (cond.comparison ?? '>=') {
        case '>':
          satisfied = satisfied && metricVal > cond.triggerValue;
          break;
        case '<':
          satisfied = satisfied && metricVal < cond.triggerValue;
          break;
        case '>=':
          satisfied = satisfied && metricVal >= cond.triggerValue;
          break;
        case '<=':
          satisfied = satisfied && metricVal <= cond.triggerValue;
          break;
      }
    }

    if (satisfied) {
      const prevEra = this.getCurrentEra();
      this.currentEraNumber = (this.currentEraNumber + 1) as 2 | 3;
      this.eraTransitionTicks[this.currentEraNumber - 1] = tick;
      return {
        transitioned: true,
        previousEra: prevEra,
        newEra: this.getCurrentEra(),
      };
    }

    return { transitioned: false };
  }

  forceEra(eraNumber: 1 | 2 | 3, tick: number): void {
    this.currentEraNumber = eraNumber;
    this.eraTransitionTicks[eraNumber - 1] = tick;
  }

  serialize(): HistoricalEraState {
    return {
      worldId: this.worldId,
      currentEraNumber: this.currentEraNumber,
      eraTransitionTicks: [...this.eraTransitionTicks],
    };
  }

  deserialize(state: HistoricalEraState): void {
    this.currentEraNumber = state.currentEraNumber;
    this.eraTransitionTicks[0] = state.eraTransitionTicks[0];
    this.eraTransitionTicks[1] = state.eraTransitionTicks[1];
    this.eraTransitionTicks[2] = state.eraTransitionTicks[2];
  }
}
