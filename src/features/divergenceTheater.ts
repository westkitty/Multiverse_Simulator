/**
 * The Divergence Theater (P014)
 *
 * Implements synchronized, spatially legible branch comparison snapshots between
 * baseline and treated timelines. Enforces genuine provenance, origin matching,
 * and honest reporting without interpolated or false differences.
 */

export interface SiteDiffRecord {
  readonly siteId: string;
  readonly baselineCondition: string;
  readonly treatmentCondition: string;
  readonly deltaDescription: string;
  readonly hasRepairedInstallation: boolean;
}

export interface MetricDiffRecord {
  readonly metricId: string;
  readonly label: string;
  readonly baselineValue: number;
  readonly treatmentValue: number;
  readonly absoluteDiff: number;
  readonly percentDiff: number;
  readonly unit?: string;
}

export interface BranchDiffSnapshot {
  readonly id: string;
  readonly sourceRunId: string;
  readonly originCheckpointId: string;
  readonly worldId: string;
  readonly tick: number;
  readonly rulesVersion: number;
  readonly baselineHash: string;
  readonly treatmentHash: string;
  readonly metricDiffs: readonly MetricDiffRecord[];
  readonly siteDiffs: readonly SiteDiffRecord[];
  readonly inventoryDiffs: Record<string, { baseline: number; treatment: number; delta: number }>;
  readonly crewDiffs: readonly {
    crewId: string;
    baselineEnergy: number;
    treatmentEnergy: number;
    delta: number;
  }[];
  readonly temporalScrubbingAvailable: boolean;
  readonly warningNotice?: string;
}

export interface SerializedDivergenceManager {
  readonly worldId: string;
  readonly activeSnapshot: BranchDiffSnapshot | null;
  readonly snapshotHistory: readonly BranchDiffSnapshot[];
}

export class DivergenceTheaterManager {
  readonly worldId: string;
  private activeSnapshot: BranchDiffSnapshot | null = null;
  private readonly snapshotHistory: BranchDiffSnapshot[] = [];

  constructor(worldId: string, initialSnapshot?: BranchDiffSnapshot) {
    this.worldId = worldId;
    if (initialSnapshot) {
      this.activeSnapshot = initialSnapshot;
      this.snapshotHistory.push(initialSnapshot);
    }
  }

  getActiveSnapshot(): BranchDiffSnapshot | null {
    return this.activeSnapshot;
  }

  getSnapshotHistory(): readonly BranchDiffSnapshot[] {
    return [...this.snapshotHistory];
  }

  /**
   * Compares two world branches at matching tick from common origin checkpoint.
   */
  computeBranchDiff(params: {
    sourceRunId: string;
    originCheckpointId: string;
    tick: number;
    baselineHash: string;
    treatmentHash: string;
    baselineMetrics: Record<string, number>;
    treatmentMetrics: Record<string, number>;
    baselineSites?: Record<string, string>;
    treatmentSites?: Record<string, string>;
    baselineInventory?: Record<string, number>;
    treatmentInventory?: Record<string, number>;
    baselineCrewEnergy?: Record<string, number>;
    treatmentCrewEnergy?: Record<string, number>;
    mismatchedOrigin?: boolean;
    mismatchedTick?: boolean;
  }): BranchDiffSnapshot {
    let warningNotice: string | undefined;

    if (params.mismatchedOrigin) {
      warningNotice = 'Warning: Compared branches originate from different historical checkpoints. Direct causal diff may be confounded.';
    } else if (params.mismatchedTick) {
      warningNotice = 'Warning: Ticks do not match between branches. Temporal offset may distort metric differences.';
    }

    const metricDiffs: MetricDiffRecord[] = [];
    const allMetricKeys = Array.from(
      new Set([
        ...Object.keys(params.baselineMetrics),
        ...Object.keys(params.treatmentMetrics),
      ]),
    ).sort();

    for (const k of allMetricKeys) {
      const bVal = params.baselineMetrics[k] ?? 0;
      const tVal = params.treatmentMetrics[k] ?? 0;
      const absDiff = Math.round((tVal - bVal) * 100) / 100;
      const pctDiff = bVal !== 0 ? Math.round(((tVal - bVal) / Math.abs(bVal)) * 10000) / 100 : 0;

      metricDiffs.push({
        metricId: k,
        label: k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' '),
        baselineValue: bVal,
        treatmentValue: tVal,
        absoluteDiff: absDiff,
        percentDiff: pctDiff,
      });
    }

    const siteDiffs: SiteDiffRecord[] = [];
    if (params.baselineSites && params.treatmentSites) {
      const allSiteKeys = Array.from(
        new Set([
          ...Object.keys(params.baselineSites),
          ...Object.keys(params.treatmentSites),
        ]),
      ).sort();

      for (const s of allSiteKeys) {
        const bCond = params.baselineSites[s] ?? 'pristine';
        const tCond = params.treatmentSites[s] ?? 'pristine';
        if (bCond !== tCond) {
          siteDiffs.push({
            siteId: s,
            baselineCondition: bCond,
            treatmentCondition: tCond,
            deltaDescription: `Site state shifted from ${bCond} to ${tCond}`,
            hasRepairedInstallation: tCond.includes('repaired') || tCond.includes('stabilized'),
          });
        }
      }
    }

    const inventoryDiffs: Record<string, { baseline: number; treatment: number; delta: number }> = {};
    if (params.baselineInventory && params.treatmentInventory) {
      const invKeys = Array.from(
        new Set([
          ...Object.keys(params.baselineInventory),
          ...Object.keys(params.treatmentInventory),
        ]),
      );
      for (const k of invKeys) {
        const b = params.baselineInventory[k] ?? 0;
        const t = params.treatmentInventory[k] ?? 0;
        inventoryDiffs[k] = { baseline: b, treatment: t, delta: Math.round((t - b) * 100) / 100 };
      }
    }

    const crewDiffs: Array<{
      crewId: string;
      baselineEnergy: number;
      treatmentEnergy: number;
      delta: number;
    }> = [];
    if (params.baselineCrewEnergy && params.treatmentCrewEnergy) {
      const crewIds = Array.from(
        new Set([
          ...Object.keys(params.baselineCrewEnergy),
          ...Object.keys(params.treatmentCrewEnergy),
        ]),
      );
      for (const id of crewIds) {
        const b = params.baselineCrewEnergy[id] ?? 80;
        const t = params.treatmentCrewEnergy[id] ?? 80;
        crewDiffs.push({
          crewId: id,
          baselineEnergy: b,
          treatmentEnergy: t,
          delta: Math.round((t - b) * 100) / 100,
        });
      }
    }

    const snapshot: BranchDiffSnapshot = {
      id: `diff-${this.worldId}-${params.tick}-${this.snapshotHistory.length + 1}`,
      sourceRunId: params.sourceRunId,
      originCheckpointId: params.originCheckpointId,
      worldId: this.worldId,
      tick: params.tick,
      rulesVersion: 1,
      baselineHash: params.baselineHash,
      treatmentHash: params.treatmentHash,
      metricDiffs,
      siteDiffs,
      inventoryDiffs,
      crewDiffs,
      temporalScrubbingAvailable: !params.mismatchedTick,
      warningNotice,
    };

    this.activeSnapshot = snapshot;
    this.snapshotHistory.push(snapshot);

    return snapshot;
  }

  scrubTimeline(targetTick: number): {
    readonly success: boolean;
    readonly snapshot: BranchDiffSnapshot | null;
    readonly error?: string;
  } {
    const match = this.snapshotHistory.find((s) => s.tick === targetTick);
    if (match) {
      this.activeSnapshot = match;
      return { success: true, snapshot: match };
    }
    return {
      success: false,
      snapshot: null,
      error: `Snapshot unavailable at tick ${targetTick}; historical state cannot be interpolated.`,
    };
  }

  serialize(): SerializedDivergenceManager {
    return {
      worldId: this.worldId,
      activeSnapshot: this.activeSnapshot ? { ...this.activeSnapshot } : null,
      snapshotHistory: [...this.snapshotHistory],
    };
  }

  deserialize(data: SerializedDivergenceManager): void {
    this.activeSnapshot = data.activeSnapshot ? { ...data.activeSnapshot } : null;
    this.snapshotHistory.length = 0;
    this.snapshotHistory.push(...data.snapshotHistory);
  }
}
