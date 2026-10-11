import {
  CausalEvent,
  CheckpointId,
  roundDet,
  RunId,
  Tick,
  WorldId,
  WorldPlugin,
} from './contracts';
import { SimulationKernel } from './kernel';

export type ExperimentSeedPolicy = 'single_deterministic' | 'paired_multi_seed';

export interface ExperimentIntervention {
  commandType: string;
  commandLabel: string;
  payload: Record<string, unknown>;
}

export interface ExperimentDefinition {
  id: string;
  title: string;
  hypothesis: string;
  worldId: WorldId;
  baselineRunId: RunId;
  checkpointId?: CheckpointId;
  startTick: Tick;
  durationTicks: number;
  seedPolicy: ExperimentSeedPolicy;
  pairedSeedCount: number; // 1 for single_deterministic, 2..6 for paired_multi_seed
  intervention: ExperimentIntervention;
  selectedMetrics: string[];
}

export interface MetricDescriptiveVariation {
  metricId: string;
  label: string;
  unit: string;
  sampleSize: number;
  baselineMean: number;
  treatmentMean: number;
  meanDelta: number;
  percentDelta: number;
  baselineMin: number;
  baselineMax: number;
  treatmentMin: number;
  treatmentMax: number;
  deltaStdDev: number;
}

export interface PairedTrialSummary {
  trialIndex: number;
  seed: number;
  baselineFinalHash: string;
  treatmentFinalHash: string;
  baselineEndMetrics: Record<string, number>;
  treatmentEndMetrics: Record<string, number>;
}

export interface ExperimentResultRecord {
  id: string;
  definition: ExperimentDefinition;
  executedAtIso: string;
  startTick: Tick;
  endTick: Tick;
  baselineBranchRunId: RunId;
  treatmentBranchRunId: RunId;
  methodologyNote: string;
  trials: PairedTrialSummary[];
  metricSummaries: MetricDescriptiveVariation[];
  keyCausalEvents: CausalEvent[];
  conclusionSummary: string;
}

export const WORKLOAD_LIMITS = {
  maxDurationTicks: 150,
  maxPairedSeeds: 6,
};

export function runControlledExperiment<
  TConfig extends Record<string, unknown>,
  TState,
>(
  sourceKernel: SimulationKernel<TConfig, TState>,
  plugin: WorldPlugin<TConfig, TState>,
  definition: ExperimentDefinition,
): {
  result: ExperimentResultRecord;
  primaryBaselineKernel: SimulationKernel<TConfig, TState>;
  primaryTreatmentKernel: SimulationKernel<TConfig, TState>;
} {
  const duration = Math.max(
    5,
    Math.min(WORKLOAD_LIMITS.maxDurationTicks, Math.floor(definition.durationTicks)),
  );
  const sampleSize =
    definition.seedPolicy === 'paired_multi_seed'
      ? Math.max(2, Math.min(WORKLOAD_LIMITS.maxPairedSeeds, Math.floor(definition.pairedSeedCount)))
      : 1;

  const targetCheckpoint = definition.checkpointId
    ? sourceKernel.getCheckpoint(definition.checkpointId)
    : sourceKernel.listCheckpoints()[0];

  const startTick = targetCheckpoint ? targetCheckpoint.tick : sourceKernel.tick;
  const endTick = startTick + duration;

  const trials: PairedTrialSummary[] = [];
  let primaryBaselineKernel: SimulationKernel<TConfig, TState> | null = null;
  let primaryTreatmentKernel: SimulationKernel<TConfig, TState> | null = null;

  for (let i = 0; i < sampleSize; i++) {
    const trialSeed = i === 0 ? sourceKernel.seed : (sourceKernel.seed + i * 7919) >>> 0;

    const baselineBranch = sourceKernel.forkBranch({
      newRunId: `${definition.id}-ctrl-s${i + 1}`,
      newName: `${sourceKernel.name} [Control #${i + 1}]`,
      checkpointId: targetCheckpoint?.id,
      seedOverride: i === 0 ? undefined : trialSeed,
      hypothesisNote: `Control baseline for experiment: ${definition.title}`,
    });

    const treatmentBranch = sourceKernel.forkBranch({
      newRunId: `${definition.id}-exp-s${i + 1}`,
      newName: `${sourceKernel.name} [Experiment #${i + 1}: ${definition.intervention.commandLabel}]`,
      checkpointId: targetCheckpoint?.id,
      seedOverride: i === 0 ? undefined : trialSeed,
      hypothesisNote: `Experimental intervention (${definition.intervention.commandLabel}) for: ${definition.title}`,
      initialCommand: {
        type: definition.intervention.commandType,
        label: definition.intervention.commandLabel,
        payload: definition.intervention.payload,
      },
    });

    for (let stepIdx = 0; stepIdx < duration; stepIdx++) {
      baselineBranch.step();
      treatmentBranch.step();
    }

    if (i === 0) {
      primaryBaselineKernel = baselineBranch;
      primaryTreatmentKernel = treatmentBranch;
    }

    trials.push({
      trialIndex: i + 1,
      seed: trialSeed,
      baselineFinalHash: baselineBranch.getStateHash(),
      treatmentFinalHash: treatmentBranch.getStateHash(),
      baselineEndMetrics: baselineBranch.getLatestMetrics(),
      treatmentEndMetrics: treatmentBranch.getLatestMetrics(),
    });
  }

  const metricDefs = plugin.metricDefinitions.filter(
    (m) =>
      definition.selectedMetrics.length === 0 ||
      definition.selectedMetrics.includes(m.id),
  );

  const metricSummaries: MetricDescriptiveVariation[] = metricDefs.map((mDef) => {
    const baseVals = trials.map((t) => t.baselineEndMetrics[mDef.id] ?? 0);
    const treatVals = trials.map((t) => t.treatmentEndMetrics[mDef.id] ?? 0);
    const deltas = trials.map((_, idx) => treatVals[idx] - baseVals[idx]);

    const baseMean = baseVals.reduce((a, b) => a + b, 0) / sampleSize;
    const treatMean = treatVals.reduce((a, b) => a + b, 0) / sampleSize;
    const meanDelta = treatMean - baseMean;
    const percentDelta =
      Math.abs(baseMean) > 1e-6 ? ((treatMean - baseMean) / Math.abs(baseMean)) * 100 : 0;

    const variance =
      sampleSize > 1
        ? deltas.reduce((acc, d) => acc + Math.pow(d - meanDelta, 2), 0) / sampleSize
        : 0;

    return {
      metricId: mDef.id,
      label: mDef.label,
      unit: mDef.unit,
      sampleSize,
      baselineMean: roundDet(baseMean, 2),
      treatmentMean: roundDet(treatMean, 2),
      meanDelta: roundDet(meanDelta, 2),
      percentDelta: roundDet(percentDelta, 1),
      baselineMin: roundDet(Math.min(...baseVals), 2),
      baselineMax: roundDet(Math.max(...baseVals), 2),
      treatmentMin: roundDet(Math.min(...treatVals), 2),
      treatmentMax: roundDet(Math.max(...treatVals), 2),
      deltaStdDev: roundDet(Math.sqrt(variance), 2),
    };
  });

  const keyCausalEvents = primaryTreatmentKernel!
    .getEvents()
    .filter((ev) => ev.tick >= startTick)
    .slice(-12);

  const methodologyNote =
    sampleSize === 1
      ? `Single-run deterministic comparison (N=1, Seed ${sourceKernel.seed}). Differences reflect exact causal divergence under identical RNG streams from Tick ${startTick} to ${endTick}, not a multi-seed statistical distribution.`
      : `Paired-seed ensemble comparison (N=${sampleSize} paired seeds, ${duration} ticks per branch). Descriptive variation (mean, min/max range, SD of paired deltas) is reported without parametric p-value claims.`;

  const topShift = [...metricSummaries].sort(
    (a, b) => Math.abs(b.percentDelta) - Math.abs(a.percentDelta),
  )[0];

  const conclusionSummary = topShift
    ? `Across ${duration} simulated ticks (N=${sampleSize}), "${definition.intervention.commandLabel}" shifted ${topShift.label} from ${topShift.baselineMean} ${topShift.unit} (control) to ${topShift.treatmentMean} ${topShift.unit} (treatment), a delta of ${topShift.meanDelta >= 0 ? '+' : ''}${topShift.meanDelta} ${topShift.unit} (${topShift.percentDelta >= 0 ? '+' : ''}${topShift.percentDelta}%).`
    : `Experiment completed over ${duration} ticks (N=${sampleSize}).`;

  return {
    result: {
      id: definition.id,
      definition: {
        ...definition,
        durationTicks: duration,
        pairedSeedCount: sampleSize,
      },
      executedAtIso: new Date().toISOString(),
      startTick,
      endTick,
      baselineBranchRunId: primaryBaselineKernel!.runId,
      treatmentBranchRunId: primaryTreatmentKernel!.runId,
      methodologyNote,
      trials,
      metricSummaries,
      keyCausalEvents,
      conclusionSummary,
    },
    primaryBaselineKernel: primaryBaselineKernel!,
    primaryTreatmentKernel: primaryTreatmentKernel!,
  };
}
