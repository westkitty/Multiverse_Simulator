import { describe, it, expect } from 'vitest';
import '../../features/domainModules';
import { globalFeatureRegistry } from '../../features/registry';
import { SimulationKernel } from '../../core/kernel';
import { isOmniverseIIIRules } from '../../features/featureVersions';
import { CORE_WORLD_PLUGINS } from '../../worlds';

describe('Omniverse III Fifteen-World Hypotheses & Divergence Theater (Gate G7 Checkpoint B)', () => {
  const all15WorldIds = [
    'ecosystem',
    'station',
    'civilization',
    'atmosphere',
    'ocean',
    'celestial',
    'megacity',
    'industrial',
    'geology',
    'wild-meridian',
    'hollow-deep',
    'timeworn-empire',
    'terraforming-frontier',
    'machine-wilderness',
    'signal-expanse',
  ] as const;

  it('registers all 15 worlds in globalFeatureRegistry with rulesVersion=1', () => {
    expect(all15WorldIds.length).toBe(15);
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId);
      expect(mod).toBeDefined();
      expect(mod?.worldId).toBe(worldId);
      expect(mod?.rulesVersion).toBe(1);
    }
  });

  it('verifies all 15 universes expose standard G7 capabilities', () => {
    const requiredG7Caps = [
      'hypothesis.test',
      'hypothesis.evaluate',
      'divergence.compare',
      'divergence.scrub',
    ];

    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      expect(mod).toBeDefined();
      const capIds = new Set(mod.capabilities.map((c: any) => c.id));
      for (const reqCap of requiredG7Caps) {
        expect(capIds.has(reqCap), `World ${worldId} missing capability ${reqCap}`).toBe(true);
      }
    }
  });

  it('verifies all 15 universes possess authored causal hypotheses with predictions (P013)', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      expect(mod.hypothesisManager, `World ${worldId} missing hypothesisManager`).toBeDefined();

      const hypotheses = mod.hypothesisManager.getAllHypotheses();
      expect(hypotheses.length, `World ${worldId} must have at least 1 hypothesis`).toBeGreaterThanOrEqual(1);

      for (const h of hypotheses) {
        expect(h.id).toContain(worldId);
        expect(h.worldId).toBe(worldId);
        expect(h.title.length).toBeGreaterThan(0);
        expect(h.premise.length).toBeGreaterThan(0);
        expect(h.targetActionFamily.length).toBeGreaterThan(0);
        expect(h.observableMetrics.length).toBeGreaterThan(0);
        expect(h.prediction.metric.length).toBeGreaterThan(0);
        expect(['increase', 'decrease', 'stabilize']).toContain(h.prediction.expectedDirection);
        expect(h.prediction.minimumExpectedDelta).toBeGreaterThan(0);
        expect(mod.hypothesisManager.getStatus(h.id)).toBe('UNTESTED');
      }
    }
  });

  it('verifies all 15 universes can record paired trials and evaluate hypotheses (P013)', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      const initialHypotheses = mod.hypothesisManager.getAllHypotheses();
      const targetHypothesis = initialHypotheses[0];
      const mockState = { stability: 50 };
      const mockCtx = {
        tick: 10,
        state: mockState,
        emitEvent: (ev: any) => ({ ...ev, id: `evt-${Date.now()}` }),
      };

      // Execute paired trial test via capability
      const testValidation = mod.validateAction(
        {
          capabilityId: 'hypothesis.test',
          payload: {
            hypothesisId: targetHypothesis.id,
            seed: 42,
            baselineStartVal: 50,
            baselineEndVal: 48,
            treatmentStartVal: 50,
            treatmentEndVal: targetHypothesis.prediction.expectedDirection === 'decrease' ? 35 : 65,
            externalHazardSpikeDetected: false,
            resourceExhaustionDetected: false,
          },
        },
        mockState,
      );
      expect(testValidation.valid, `World ${worldId} failed to validate hypothesis.test: ${testValidation.error}`).toBe(true);

      const testReceipt = mod.applyAction(mockState, testValidation.action, mockCtx);
      expect(testReceipt.status).toBe('success');

      // Verify hypothesis status updated to SUPPORTED
      expect(mod.hypothesisManager.getStatus(targetHypothesis.id)).toBe('SUPPORTED');

      // Now evaluate hypothesis via capability
      const evalValidation = mod.validateAction(
        {
          capabilityId: 'hypothesis.evaluate',
          payload: {
            hypothesisId: targetHypothesis.id,
          },
        },
        mockState,
      );
      expect(evalValidation.valid, `World ${worldId} failed to validate hypothesis.evaluate: ${evalValidation.error}`).toBe(true);

      const evalReceipt = mod.applyAction(mockState, evalValidation.action, mockCtx);
      expect(evalReceipt.status).toBe('success');
      expect(mod.hypothesisManager.getTrialHistory(targetHypothesis.id).length).toBe(1);
    }
  });

  it('verifies confound detection downgrades confidence and sets INCONCLUSIVE across worlds (P013)', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      const targetHypothesis = mod.hypothesisManager.getAllHypotheses()[0];
      const mockState = { stability: 50 };
      const mockCtx = {
        tick: 20,
        state: mockState,
        emitEvent: (ev: any) => ({ ...ev, id: `evt-${Date.now()}` }),
      };

      const confoundValidation = mod.validateAction(
        {
          capabilityId: 'hypothesis.test',
          payload: {
            hypothesisId: targetHypothesis.id,
            seed: 99,
            baselineStartVal: 40,
            baselineEndVal: 38,
            treatmentStartVal: 40,
            treatmentEndVal: 55,
            externalHazardSpikeDetected: true,
          },
        },
        mockState,
      );
      expect(confoundValidation.valid).toBe(true);

      const res = mod.applyAction(mockState, confoundValidation.action, mockCtx);
      expect(res.status).toBe('success');

      expect(mod.hypothesisManager.getStatus(targetHypothesis.id)).toBe('INCONCLUSIVE');
      const trials = mod.hypothesisManager.getTrialHistory(targetHypothesis.id);
      const latestTrial = trials[trials.length - 1];
      expect(latestTrial.outcome).toBe('INCONCLUSIVE');
      expect(latestTrial.confidenceScore).toBeLessThanOrEqual(0.6);
      expect(latestTrial.detectedConfounds[0]).toContain('hazard spike');
    }
  });

  it('verifies all 15 universes compute synchronized branch diff comparisons (P014)', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      expect(mod.divergenceManager, `World ${worldId} missing divergenceManager`).toBeDefined();

      const mockState = { stability: 70 };
      const mockCtx = {
        tick: 50,
        state: mockState,
        emitEvent: (ev: any) => ({ ...ev, id: `evt-${Date.now()}` }),
      };

      const compareValidation = mod.validateAction(
        {
          capabilityId: 'divergence.compare',
          payload: {
            originCheckpointId: `cp-${worldId}-origin`,
            baselineHash: 'hash-base-50',
            treatmentHash: 'hash-treat-50',
            baselineMetrics: { stability: 70, resources: 500, hazards: 15 },
            treatmentMetrics: { stability: 85, resources: 420, hazards: 5 },
            baselineSites: { 'site-primary': 'degraded', 'site-secondary': 'stable' },
            treatmentSites: { 'site-primary': 'stabilized', 'site-secondary': 'stable' },
          },
        },
        mockState,
      );
      expect(compareValidation.valid, `World ${worldId} failed to validate divergence.compare: ${compareValidation.error}`).toBe(true);

      const result = mod.applyAction(mockState, compareValidation.action, mockCtx);
      expect(result.status).toBe('success');

      const latestDiff = mod.divergenceManager.getActiveSnapshot();
      expect(latestDiff).toBeDefined();
      expect(latestDiff.tick).toBe(50);
      expect(latestDiff.warningNotice).toBeUndefined();

      // Verify metric deltas
      const stab = latestDiff.metricDiffs.find((m: any) => m.metricId === 'stability');
      expect(stab?.absoluteDiff).toBe(15);
      const resDiff = latestDiff.metricDiffs.find((m: any) => m.metricId === 'resources');
      expect(resDiff?.absoluteDiff).toBe(-80);
      const hazDiff = latestDiff.metricDiffs.find((m: any) => m.metricId === 'hazards');
      expect(hazDiff?.absoluteDiff).toBe(-10);

      // Verify site differences
      expect(latestDiff.siteDiffs.length).toBe(1);
      const siteDiff = latestDiff.siteDiffs[0];
      expect(siteDiff.siteId).toBe('site-primary');
      expect(siteDiff.baselineCondition).toBe('degraded');
      expect(siteDiff.treatmentCondition).toBe('stabilized');
      expect(siteDiff.hasRepairedInstallation).toBe(true);
    }
  });

  it('verifies divergence theater handles origin & tick mismatch warnings faithfully across worlds (P014)', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      const mockState = { stability: 60 };
      const mockCtx = {
        tick: 75,
        state: mockState,
        emitEvent: (ev: any) => ({ ...ev, id: `evt-${Date.now()}` }),
      };

      // Mismatched origin
      const originValidation = mod.validateAction(
        {
          capabilityId: 'divergence.compare',
          payload: {
            originCheckpointId: 'cp-divergent',
            mismatchedOrigin: true,
            baselineMetrics: { stability: 60 },
            treatmentMetrics: { stability: 75 },
          },
        },
        mockState,
      );
      expect(originValidation.valid).toBe(true);

      const originRes = mod.applyAction(mockState, originValidation.action, mockCtx);
      expect(originRes.status).toBe('success');
      const originSnapshot = mod.divergenceManager.getActiveSnapshot();
      expect(originSnapshot.warningNotice).toContain('different historical checkpoints');

      // Mismatched tick
      const tickValidation = mod.validateAction(
        {
          capabilityId: 'divergence.compare',
          payload: {
            mismatchedTick: true,
            baselineMetrics: { stability: 60 },
            treatmentMetrics: { stability: 75 },
          },
        },
        mockState,
      );
      expect(tickValidation.valid).toBe(true);

      const tickRes = mod.applyAction(mockState, tickValidation.action, mockCtx);
      expect(tickRes.status).toBe('success');
      const tickSnapshot = mod.divergenceManager.getActiveSnapshot();
      expect(tickSnapshot.warningNotice).toContain('Ticks do not match');
    }
  });

  it('verifies temporal scrubbing across all 15 universes (P014)', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      const mockState = { stability: 50 };

      // Generate two branch diffs at ticks 100 and 200
      mod.divergenceManager.computeBranchDiff({
        sourceRunId: `run-${worldId}-100`,
        originCheckpointId: `cp-${worldId}-100`,
        tick: 100,
        baselineHash: 'hash-b100',
        treatmentHash: 'hash-t100',
        baselineMetrics: { stability: 50 },
        treatmentMetrics: { stability: 60 },
      });

      mod.divergenceManager.computeBranchDiff({
        sourceRunId: `run-${worldId}-200`,
        originCheckpointId: `cp-${worldId}-200`,
        tick: 200,
        baselineHash: 'hash-b200',
        treatmentHash: 'hash-t200',
        baselineMetrics: { stability: 50 },
        treatmentMetrics: { stability: 80 },
      });

      const mockCtx = {
        tick: 200,
        state: mockState,
        emitEvent: (ev: any) => ({ ...ev, id: `evt-${Date.now()}` }),
      };

      // Valid scrub to tick 100
      const scrubValidation = mod.validateAction(
        {
          capabilityId: 'divergence.scrub',
          payload: {
            targetTick: 100,
          },
        },
        mockState,
      );
      expect(scrubValidation.valid).toBe(true);

      const scrubReceipt = mod.applyAction(mockState, scrubValidation.action, mockCtx);
      expect(scrubReceipt.status).toBe('success');

      const scrubbed = mod.divergenceManager.getActiveSnapshot();
      expect(scrubbed?.tick).toBe(100);
      expect(scrubbed?.metricDiffs[0].absoluteDiff).toBe(10);

      // Scrub to non-existent tick
      const invalidValidation = mod.validateAction(
        {
          capabilityId: 'divergence.scrub',
          payload: {
            targetTick: 999,
          },
        },
        mockState,
      );
      expect(invalidValidation.valid).toBe(true);

      const invalidReceipt = mod.applyAction(mockState, invalidValidation.action, mockCtx);
      expect(invalidReceipt.status).toBe('rejected');
      expect(invalidReceipt.rejectionReason).toContain('999');
    }
  });

  it('projects G7 state correctly into VisibleFeatureState across all 15 universes', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      const fakeState: any = {
        worldId,
        tick: 150,
        stability: 60,
      };

      const visible = mod.projectVisibleState(fakeState, {});
      expect(visible).toBeDefined();
      expect(visible.worldId).toBe(worldId);

      // Hypotheses
      expect(Array.isArray(visible.hypotheses)).toBe(true);
      expect(visible.hypotheses.length).toBeGreaterThanOrEqual(1);

      // Active Investigations
      expect(Array.isArray(visible.activeInvestigations)).toBe(true);

      // Branch diff
      expect(visible.branchDiff).toBeDefined();
      expect(typeof visible.branchDiff.tick).toBe('number');
      expect(Array.isArray(visible.branchDiff.metricDiffs)).toBe(true);
      expect(Array.isArray(visible.branchDiff.siteDiffs)).toBe(true);
      expect(Array.isArray(visible.branchDiff.crewDiffs)).toBe(true);
    }
  });

  it('preserves bit-for-bit determinism and zero drift on legacy rulesVersion=0 runs across all 15 worlds', () => {
    for (const worldId of all15WorldIds) {
      const plugin = CORE_WORLD_PLUGINS.find((p) => p.id === worldId);
      expect(plugin, `Missing core world plugin for ${worldId}`).toBeDefined();

      const kernelLegacy1 = new SimulationKernel({
        runId: `legacy-parity-1-${worldId}`,
        name: `Legacy Parity 1 ${worldId}`,
        plugin: plugin!,
        seed: 424242,
      });

      const kernelLegacy2 = new SimulationKernel({
        runId: `legacy-parity-2-${worldId}`,
        name: `Legacy Parity 2 ${worldId}`,
        plugin: plugin!,
        seed: 424242,
      });

      expect(isOmniverseIIIRules(kernelLegacy1.getConfig())).toBe(false);
      expect(isOmniverseIIIRules(kernelLegacy2.getConfig())).toBe(false);

      for (let t = 0; t < 25; t++) {
        kernelLegacy1.step();
        kernelLegacy2.step();
      }

      const hash1 = kernelLegacy1.getStateHash();
      const hash2 = kernelLegacy2.getStateHash();
      expect(hash1).toBe(hash2);
    }
  });
});
