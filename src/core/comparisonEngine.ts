import { CausalEvent, MetricDefinition, roundDet, Tick, WorldId } from './contracts';
import { SimulationKernel } from './kernel';

export interface ConfigDifference {
  key: string;
  leftValue: unknown;
  rightValue: unknown;
}

export interface MetricDeltaComparison {
  metricId: string;
  label: string;
  unit: string;
  leftValue: number;
  rightValue: number;
  absoluteDelta: number;
  percentDelta: number;
}

export interface SharedCrossWorldDimensionComparison {
  dimensionKey: string;
  dimensionLabel: string;
  unit: string;
  leftMetricLabel: string;
  rightMetricLabel: string;
  leftValue: number;
  rightValue: number;
  delta: number;
}

export interface RealityComparisonReport {
  mode: 'same_world' | 'cross_world';
  leftRunId: string;
  rightRunId: string;
  leftWorldId: WorldId;
  rightWorldId: WorldId;
  comparedAtTick: { leftTick: Tick; rightTick: Tick };
  sharedMetadata: {
    leftDurationTicks: number;
    rightDurationTicks: number;
    leftTotalEvents: number;
    rightTotalEvents: number;
    leftCriticalEvents: number;
    rightCriticalEvents: number;
    leftSeed: number;
    rightSeed: number;
    sameLineageOrigin: boolean;
  };
  configDifferences: ConfigDifference[];
  sameWorldMetricDeltas: MetricDeltaComparison[];
  crossWorldCompatibleDimensions: SharedCrossWorldDimensionComparison[];
  incompatibilityNotice: string | null;
  divergentEvents: {
    leftRecent: CausalEvent[];
    rightRecent: CausalEvent[];
  };
}

function getMetricsForTick(kernel: SimulationKernel<any, any>, targetTick?: Tick): Record<string, number> {
  if (targetTick === undefined || targetTick >= kernel.tick) {
    return kernel.getLatestMetrics();
  }
  const history = kernel.getMetricHistory();
  let best = history[0]?.values ?? kernel.getLatestMetrics();
  for (const point of history) {
    if (point.tick <= targetTick) {
      best = point.values;
    } else {
      break;
    }
  }
  return best;
}

export function compareRealities(
  leftKernel: SimulationKernel<any, any>,
  rightKernel: SimulationKernel<any, any>,
  syncTick?: Tick,
): RealityComparisonReport {
  const isSameWorld = leftKernel.worldId === rightKernel.worldId;
  const leftTick = syncTick !== undefined ? Math.min(syncTick, leftKernel.tick) : leftKernel.tick;
  const rightTick = syncTick !== undefined ? Math.min(syncTick, rightKernel.tick) : rightKernel.tick;

  const leftMetrics = getMetricsForTick(leftKernel, leftTick);
  const rightMetrics = getMetricsForTick(rightKernel, rightTick);

  const leftEvents = leftKernel.getEvents().filter((e) => e.tick <= leftTick);
  const rightEvents = rightKernel.getEvents().filter((e) => e.tick <= rightTick);

  const leftConfig = leftKernel.getConfig();
  const rightConfig = rightKernel.getConfig();
  const allConfigKeys = Array.from(
    new Set([...Object.keys(leftConfig), ...Object.keys(rightConfig)]),
  ).sort();

  const configDifferences: ConfigDifference[] = [];
  for (const key of allConfigKeys) {
    const lVal = leftConfig[key];
    const rVal = rightConfig[key];
    if (JSON.stringify(lVal) !== JSON.stringify(rVal)) {
      configDifferences.push({
        key,
        leftValue: lVal,
        rightValue: rVal,
      });
    }
  }

  const sameWorldMetricDeltas: MetricDeltaComparison[] = [];
  const crossWorldCompatibleDimensions: SharedCrossWorldDimensionComparison[] = [];

  if (isSameWorld) {
    for (const def of leftKernel.plugin.metricDefinitions) {
      const lVal = leftMetrics[def.id] ?? 0;
      const rVal = rightMetrics[def.id] ?? 0;
      const absDelta = rVal - lVal;
      const pctDelta = Math.abs(lVal) > 1e-6 ? ((rVal - lVal) / Math.abs(lVal)) * 100 : 0;
      sameWorldMetricDeltas.push({
        metricId: def.id,
        label: def.label,
        unit: def.unit,
        leftValue: roundDet(lVal, 2),
        rightValue: roundDet(rVal, 2),
        absoluteDelta: roundDet(absDelta, 2),
        percentDelta: roundDet(pctDelta, 1),
      });
    }
  } else {
    // Only compare metrics that explicitly declare the exact same `comparableDimension` and `unit`
    const rightDefsByDim = new Map<string, MetricDefinition>();
    for (const rDef of rightKernel.plugin.metricDefinitions) {
      if (rDef.comparableDimension) {
        rightDefsByDim.set(`${rDef.comparableDimension}:${rDef.unit}`, rDef);
      }
    }

    for (const lDef of leftKernel.plugin.metricDefinitions) {
      if (!lDef.comparableDimension) continue;
      const match = rightDefsByDim.get(`${lDef.comparableDimension}:${lDef.unit}`);
      if (match) {
        const lVal = leftMetrics[lDef.id] ?? 0;
        const rVal = rightMetrics[match.id] ?? 0;
        crossWorldCompatibleDimensions.push({
          dimensionKey: lDef.comparableDimension,
          dimensionLabel: lDef.comparableDimension.replace(/_/g, ' ').toUpperCase(),
          unit: lDef.unit,
          leftMetricLabel: `${leftKernel.plugin.name}: ${lDef.label}`,
          rightMetricLabel: `${rightKernel.plugin.name}: ${match.label}`,
          leftValue: roundDet(lVal, 2),
          rightValue: roundDet(rVal, 2),
          delta: roundDet(rVal - lVal, 2),
        });
      }
    }
  }

  const leftLineage = leftKernel.getLineage();
  const rightLineage = rightKernel.getLineage();
  const sameLineageOrigin =
    isSameWorld &&
    (leftLineage.parentRunId === rightKernel.runId ||
      rightLineage.parentRunId === leftKernel.runId ||
      (leftLineage.parentRunId !== null && leftLineage.parentRunId === rightLineage.parentRunId));

  return {
    mode: isSameWorld ? 'same_world' : 'cross_world',
    leftRunId: leftKernel.runId,
    rightRunId: rightKernel.runId,
    leftWorldId: leftKernel.worldId,
    rightWorldId: rightKernel.worldId,
    comparedAtTick: { leftTick, rightTick },
    sharedMetadata: {
      leftDurationTicks: leftTick,
      rightDurationTicks: rightTick,
      leftTotalEvents: leftEvents.length,
      rightTotalEvents: rightEvents.length,
      leftCriticalEvents: leftEvents.filter((e) => e.severity === 'critical').length,
      rightCriticalEvents: rightEvents.filter((e) => e.severity === 'critical').length,
      leftSeed: leftKernel.seed,
      rightSeed: rightKernel.seed,
      sameLineageOrigin,
    },
    configDifferences,
    sameWorldMetricDeltas,
    crossWorldCompatibleDimensions,
    incompatibilityNotice: isSameWorld
      ? null
      : `Cross-World Comparison Mode (${leftKernel.plugin.name} vs. ${rightKernel.plugin.name}): Domain-specific physical quantities (e.g., kPa hull pressure vs. biosphere biomass vs. settlement grain stockpiles) do NOT share common units and are never arbitrarily normalized. Only shared execution metadata and explicitly compatible unit dimensions are compared directly.`,
    divergentEvents: {
      leftRecent: leftEvents.slice(-8),
      rightRecent: rightEvents.slice(-8),
    },
  };
}
