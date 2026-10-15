import { describe, it, expect } from 'vitest';
import {
  HypothesisInvestigationManager,
  type CausalHypothesisDefinition,
} from '../../features/hypothesisInvestigations';
import {
  DivergenceTheaterManager,
} from '../../features/divergenceTheater';
import {
  StandardWorldFeatureModule,
  createDefaultHypotheses,
  createDefaultDivergenceSnapshot,
} from '../../features/domainModules/domainHelper';

describe('Gate G7 Shared Systems: Hypotheses & Divergence Theater', () => {
  describe('HypothesisInvestigationManager', () => {
    const sampleHypothesis: CausalHypothesisDefinition = {
      id: 'ocean.hypothesis.thermal_stabilization',
      worldId: 'ocean',
      title: 'Ocean Thermal Current Stabilization',
      premise: 'Deploying subsea thermal pumps increases deep current velocity and restores stability.',
      targetActionFamily: 'P001',
      observableMetrics: ['stability', 'current_velocity'],
      prediction: {
        metric: 'stability',
        expectedDirection: 'increase',
        minimumExpectedDelta: 4.0,
      },
      confoundRisks: [
        'Concurrent abyssal tremor distortion.',
        'Thermal pump cavitation under excess pressure.',
      ],
    };

    it('initializes and registers hypotheses correctly', () => {
      const mgr = new HypothesisInvestigationManager('ocean', [sampleHypothesis]);
      expect(mgr.getAllHypotheses()).toHaveLength(1);
      expect(mgr.getHypothesis(sampleHypothesis.id)?.title).toBe('Ocean Thermal Current Stabilization');
      expect(mgr.getStatus(sampleHypothesis.id)).toBe('UNTESTED');
    });

    it('evaluates paired trial results and updates status to SUPPORTED', () => {
      const mgr = new HypothesisInvestigationManager('ocean', [sampleHypothesis]);

      // Baseline: starts 50, ends 48 (delta -2)
      // Treatment: starts 50, ends 58 (delta +8)
      // Causal effect size = (+8) - (-2) = +10 >= 4.0 -> SUPPORTED
      const trial = mgr.recordTrialResult(sampleHypothesis.id, {
        seed: 42,
        startTick: 10,
        durationTicks: 50,
        baselineFinalHash: 'hash-base-60',
        treatmentFinalHash: 'hash-treat-60',
        baselineStartVal: 50,
        baselineEndVal: 48,
        treatmentStartVal: 50,
        treatmentEndVal: 58,
        tick: 60,
      });

      expect(trial.causalEffectSize).toBe(10);
      expect(trial.outcome).toBe('SUPPORTED');
      expect(trial.confidenceScore).toBeGreaterThanOrEqual(0.85);
      expect(mgr.getStatus(sampleHypothesis.id)).toBe('SUPPORTED');
      expect(mgr.getTrialHistory(sampleHypothesis.id)).toHaveLength(1);
    });

    it('evaluates paired trial and updates status to REFUTED when effect fails threshold', () => {
      const mgr = new HypothesisInvestigationManager('ocean', [sampleHypothesis]);

      // Baseline: starts 50, ends 50 (delta 0)
      // Treatment: starts 50, ends 51 (delta +1)
      // Causal effect size = 1 < 4.0 -> REFUTED
      const trial = mgr.recordTrialResult(sampleHypothesis.id, {
        seed: 42,
        startTick: 10,
        durationTicks: 50,
        baselineFinalHash: 'hash-base-60',
        treatmentFinalHash: 'hash-treat-60',
        baselineStartVal: 50,
        baselineEndVal: 50,
        treatmentStartVal: 50,
        treatmentEndVal: 51,
        tick: 60,
      });

      expect(trial.causalEffectSize).toBe(1);
      expect(trial.outcome).toBe('REFUTED');
      expect(mgr.getStatus(sampleHypothesis.id)).toBe('REFUTED');
    });

    it('detects confounds and marks trial INCONCLUSIVE with downgraded confidence', () => {
      const mgr = new HypothesisInvestigationManager('ocean', [sampleHypothesis]);

      const trial = mgr.recordTrialResult(sampleHypothesis.id, {
        seed: 42,
        startTick: 10,
        durationTicks: 50,
        baselineFinalHash: 'hash-base-60',
        treatmentFinalHash: 'hash-treat-60',
        baselineStartVal: 50,
        baselineEndVal: 40,
        treatmentStartVal: 50,
        treatmentEndVal: 55,
        externalHazardSpikeDetected: true,
        tick: 60,
      });

      expect(trial.outcome).toBe('INCONCLUSIVE');
      expect(trial.confidenceScore).toBeLessThan(0.5);
      expect(trial.detectedConfounds).toHaveLength(1);
      expect(mgr.getStatus(sampleHypothesis.id)).toBe('INCONCLUSIVE');
    });

    it('serializes and deserializes hypothesis state faithfully', () => {
      const mgr = new HypothesisInvestigationManager('ocean', [sampleHypothesis]);
      mgr.recordTrialResult(sampleHypothesis.id, {
        seed: 42,
        startTick: 0,
        durationTicks: 25,
        baselineFinalHash: 'hb',
        treatmentFinalHash: 'ht',
        baselineStartVal: 50,
        baselineEndVal: 50,
        treatmentStartVal: 50,
        treatmentEndVal: 60,
        tick: 25,
      });

      const serialized = mgr.serialize();
      const restored = new HypothesisInvestigationManager('ocean');
      restored.deserialize(serialized);

      expect(restored.getAllHypotheses()).toHaveLength(1);
      expect(restored.getStatus(sampleHypothesis.id)).toBe('SUPPORTED');
      expect(restored.getTrialHistory()).toHaveLength(1);
    });
  });

  describe('DivergenceTheaterManager', () => {
    it('computes branch diff with metric, site, inventory, and crew differences', () => {
      const mgr = new DivergenceTheaterManager('geology');

      const snapshot = mgr.computeBranchDiff({
        sourceRunId: 'run-geology-1',
        originCheckpointId: 'cp-origin-0',
        tick: 50,
        baselineHash: 'hash-base-50',
        treatmentHash: 'hash-treat-50',
        baselineMetrics: { stability: 40, mantle_pressure: 85 },
        treatmentMetrics: { stability: 65, mantle_pressure: 60 },
        baselineSites: { 'site-primary': 'fractured' },
        treatmentSites: { 'site-primary': 'stabilized' },
        baselineInventory: { energy: 30, repairs: 5 },
        treatmentInventory: { energy: 15, repairs: 2 },
        baselineCrewEnergy: { 'crew-01': 80 },
        treatmentCrewEnergy: { 'crew-01': 55 },
      });

      expect(snapshot.metricDiffs).toHaveLength(2);
      const stabilityDiff = snapshot.metricDiffs.find((m) => m.metricId === 'stability');
      expect(stabilityDiff?.absoluteDiff).toBe(25);
      expect(stabilityDiff?.percentDiff).toBeGreaterThan(0);

      expect(snapshot.siteDiffs).toHaveLength(1);
      expect(snapshot.siteDiffs[0].hasRepairedInstallation).toBe(true);

      expect(snapshot.inventoryDiffs.energy.delta).toBe(-15);
      expect(snapshot.crewDiffs[0].delta).toBe(-25);
      expect(snapshot.warningNotice).toBeUndefined();
    });

    it('attaches warning notices on mismatched origins or ticks without fabricating false diffs', () => {
      const mgr = new DivergenceTheaterManager('geology');

      const originMismatch = mgr.computeBranchDiff({
        sourceRunId: 'run-geology-1',
        originCheckpointId: 'cp-origin-alt',
        tick: 50,
        baselineHash: 'hb',
        treatmentHash: 'ht',
        baselineMetrics: { stability: 50 },
        treatmentMetrics: { stability: 50 },
        mismatchedOrigin: true,
      });

      expect(originMismatch.warningNotice).toMatch(/different historical checkpoints/i);

      const tickMismatch = mgr.computeBranchDiff({
        sourceRunId: 'run-geology-1',
        originCheckpointId: 'cp-origin-0',
        tick: 50,
        baselineHash: 'hb',
        treatmentHash: 'ht',
        baselineMetrics: { stability: 50 },
        treatmentMetrics: { stability: 50 },
        mismatchedTick: true,
      });

      expect(tickMismatch.warningNotice).toMatch(/Ticks do not match/i);
      expect(tickMismatch.temporalScrubbingAvailable).toBe(false);
    });

    it('supports scrubbing to authenticated ticks and rejects unavailable timestamps', () => {
      const mgr = new DivergenceTheaterManager('geology');

      mgr.computeBranchDiff({
        sourceRunId: 'run-1',
        originCheckpointId: 'cp-0',
        tick: 20,
        baselineHash: 'hb20',
        treatmentHash: 'ht20',
        baselineMetrics: { stability: 45 },
        treatmentMetrics: { stability: 55 },
      });

      mgr.computeBranchDiff({
        sourceRunId: 'run-1',
        originCheckpointId: 'cp-0',
        tick: 40,
        baselineHash: 'hb40',
        treatmentHash: 'ht40',
        baselineMetrics: { stability: 40 },
        treatmentMetrics: { stability: 70 },
      });

      const scrub20 = mgr.scrubTimeline(20);
      expect(scrub20.success).toBe(true);
      expect(scrub20.snapshot?.tick).toBe(20);

      const scrub99 = mgr.scrubTimeline(99);
      expect(scrub99.success).toBe(false);
      expect(scrub99.error).toMatch(/Snapshot unavailable at tick 99/i);
    });
  });

  describe('StandardWorldFeatureModule G7 Seam', () => {
    it('integrates G7 capabilities, action validation, execution, and state projection', () => {
      const hypotheses = createDefaultHypotheses('geology');
      const branchDiff = createDefaultDivergenceSnapshot('geology');

      const mod = new StandardWorldFeatureModule({
        worldId: 'geology',
        capabilities: [],
        hazardNodes: [],
        hazardLinks: [],
        initialBudget: {},
        actionCosts: {},
        actionDeltas: {},
        metricKeys: ['stability', 'mantle_pressure'],
        hypotheses,
        initialBranchDiff: branchDiff,
      });

      // Verify managers exist
      expect(mod.hypothesisManager).toBeDefined();
      expect(mod.divergenceManager).toBeDefined();

      // Verify capabilities are present
      const capIds = mod.capabilities.map((c) => c.id);
      expect(capIds).toContain('hypothesis.test');
      expect(capIds).toContain('hypothesis.evaluate');
      expect(capIds).toContain('divergence.compare');
      expect(capIds).toContain('divergence.scrub');

      const mockCtx = {
        tick: 25,
        state: { stability: 50 },
        emitEvent: (e: any) => ({ ...e, id: `evt-${Date.now()}` }),
      };

      // 1. hypothesis.test action
      const testValidation = mod.validateAction(
        {
          capabilityId: 'hypothesis.test',
          payload: {
            hypothesisId: hypotheses[0].id,
            seed: 42,
            startTick: 0,
            durationTicks: 25,
            baselineStartVal: 50,
            baselineEndVal: 48,
            treatmentStartVal: 50,
            treatmentEndVal: 65,
          },
        },
        mockCtx.state,
      );
      expect(testValidation.valid).toBe(true);

      const testRes = mod.applyAction(mockCtx.state, testValidation.action!, mockCtx as any);
      expect(testRes.status).toBe('success');
      expect(mod.hypothesisManager.getStatus(hypotheses[0].id)).toBe('SUPPORTED');

      // 2. hypothesis.evaluate action
      const evalValidation = mod.validateAction(
        {
          capabilityId: 'hypothesis.evaluate',
          payload: { hypothesisId: hypotheses[0].id },
        },
        mockCtx.state,
      );
      expect(evalValidation.valid).toBe(true);

      const evalRes = mod.applyAction(mockCtx.state, evalValidation.action!, mockCtx as any);
      expect(evalRes.status).toBe('success');

      // 3. divergence.compare action
      const compareValidation = mod.validateAction(
        {
          capabilityId: 'divergence.compare',
          payload: {
            originCheckpointId: 'cp-0',
            baselineMetrics: { stability: 45 },
            treatmentMetrics: { stability: 70 },
          },
        },
        mockCtx.state,
      );
      expect(compareValidation.valid).toBe(true);

      const compareRes = mod.applyAction(mockCtx.state, compareValidation.action!, mockCtx as any);
      expect(compareRes.status).toBe('success');
      expect(mod.divergenceManager.getActiveSnapshot()?.metricDiffs).toHaveLength(1);

      // 4. divergence.scrub action
      const scrubValidation = mod.validateAction(
        {
          capabilityId: 'divergence.scrub',
          payload: { targetTick: 25 },
        },
        mockCtx.state,
      );
      expect(scrubValidation.valid).toBe(true);

      const scrubRes = mod.applyAction(mockCtx.state, scrubValidation.action!, mockCtx as any);
      expect(scrubRes.status).toBe('success');

      // 5. projectVisibleState includes G7 fields
      const visible = mod.projectVisibleState(mockCtx.state, null);
      expect(visible.hypotheses).toBeDefined();
      expect(visible.hypotheses?.length).toBeGreaterThanOrEqual(1);
      expect(visible.activeInvestigations).toBeDefined();
      expect(visible.activeInvestigations?.length).toBeGreaterThanOrEqual(1);
      expect(visible.branchDiff).toBeDefined();
    });
  });
});
