import { describe, expect, it } from 'vitest';
import { defaultCrossWorldRegistry } from '../core/crossWorldContract';
import { SimulationKernel } from '../core/kernel';
import {
  civilizationPlugin,
  ecosystemPlugin,
  stationPlugin,
} from '../worlds';

describe('Section 23: Adversarial Stress Validation & Performance Benchmarks', () => {
  it('handles high entity counts (300 organisms) and long-running simulations without NaN or unbounded growth', () => {
    const heavyEco = new SimulationKernel({
      runId: 'stress-heavy-eco',
      name: 'High Entity Stress Run',
      plugin: ecosystemPlugin,
      seed: 20261011,
      config: {
        ...ecosystemPlugin.defaultConfig,
        initialHerbivores: 220,
        initialPredators: 45,
        resourceAbundance: 1.5,
      },
      budget: {
        maxEvents: 250,
        maxCheckpoints: 10,
        maxMetricHistory: 80,
        autoCheckpointIntervalTicks: 5,
      },
    });

    const t0 = performance.now();
    heavyEco.stepMany(80, 10000);
    const elapsedMs = performance.now() - t0;

    expect(heavyEco.tick).toBe(80);
    expect(heavyEco.getEvents().length).toBeLessThanOrEqual(250);
    expect(heavyEco.listCheckpoints().length).toBeLessThanOrEqual(10);
    expect(heavyEco.getMetricHistory().length).toBeLessThanOrEqual(80);

    const metrics = heavyEco.getLatestMetrics();
    for (const val of Object.values(metrics)) {
      expect(Number.isFinite(val)).toBe(true);
    }

    // Ensure average step duration is fast (< 15ms/step even for 265 initial entities)
    expect(elapsedMs / 80).toBeLessThan(15);
  });

  it('enforces wall-clock time budget during bounded fast-forward', () => {
    const stn = new SimulationKernel({
      runId: 'stress-ff-stn',
      name: 'Fast Forward Station',
      plugin: stationPlugin,
      seed: 9090,
    });

    // Request 10000 steps with a tight 5ms wall-clock budget
    const res = stn.stepMany(10000, 5);
    expect(res.stepsExecuted).toBeGreaterThanOrEqual(1);
    expect(res.stepsExecuted).toBeLessThan(10000);
    expect(res.hitTimeBudget).toBe(true);
  });

  it('preserves strict branch independence across 10 repeated forks and mid-simulation checkpoint restores', () => {
    const rootCiv = new SimulationKernel({
      runId: 'stress-root-civ',
      name: 'Root Civilization',
      plugin: civilizationPlugin,
      seed: 334455,
    });
    rootCiv.stepMany(10);
    const midCheckpoint = rootCiv.createCheckpoint('Midpoint @ T10');
    const midHash = midCheckpoint.stateHash;

    rootCiv.stepMany(10);
    expect(rootCiv.tick).toBe(20);

    // Fork 10 branches from Midpoint @ T10 with different interventions
    const branches: SimulationKernel<any, any>[] = [];
    for (let i = 0; i < 10; i++) {
      const b = rootCiv.forkBranch({
        newRunId: `stress-branch-${i}`,
        newName: `Branch #${i}`,
        checkpointId: midCheckpoint.id,
        initialCommand:
          i % 2 === 0
            ? {
                type: 'build_water_infrastructure',
                label: 'Build Water',
                payload: { targetSettlementId: 'all' },
              }
            : {
                type: 'trigger_regional_drought',
                label: 'Trigger Drought',
                payload: { severity: 0.6, durationTicks: 20 },
              },
      });
      b.stepMany(5);
      branches.push(b);
    }

    // All even branches must have identical state hashes to each other, and all odd branches identical to each other
    expect(branches[0].getStateHash()).toBe(branches[2].getStateHash());
    expect(branches[1].getStateHash()).toBe(branches[3].getStateHash());
    expect(branches[0].getStateHash()).not.toBe(branches[1].getStateHash());

    // Restore rootCiv back to Midpoint @ T10 and verify exact state hash restoration
    rootCiv.restoreCheckpoint(midCheckpoint.id);
    expect(rootCiv.tick).toBe(10);
    expect(rootCiv.getStateHash()).toBe(midHash);
  });

  it('handles malformed cross-world events and schema migration safely', () => {
    const malformedPreview = defaultCrossWorldRegistry.previewTransfer(
      null as any,
      'ecosystem',
      'civilization',
    );
    expect(malformedPreview.compatible).toBe(false);
    expect(malformedPreview.rejectionReason).toContain('Malformed event');

    // Schema migration from legacy schemaVersion 0
    const civ = new SimulationKernel({
      runId: 'mig-civ',
      name: 'Migration Test',
      plugin: civilizationPlugin,
      seed: 123,
    });
    civ.stepMany(3);
    const record = civ.exportRunRecord();
    record.schemaVersion = 0;

    const restored = SimulationKernel.fromRunRecord(record, civilizationPlugin);
    expect(restored.tick).toBe(3);
    expect(restored.getStateHash()).toBe(civ.getStateHash());
  });
});
