import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { compareRealities } from '../core/comparisonEngine';
import { defaultCrossWorldRegistry } from '../core/crossWorldContract';
import { runControlledExperiment } from '../core/experimentRunner';
import { SimulationKernel } from '../core/kernel';
import { PluginRegistry } from '../core/pluginRegistry';
import {
  createPortableArchiveZip,
  inspectAndUnpackArchiveZip,
} from '../persistence/archive';
import {
  deleteRunFromDb,
  listSavedRunsFromDb,
  loadRunFromDb,
  saveRunToDb,
  setSimulatedQuotaExceeded,
} from '../persistence/indexedDb';
import { BoundedWorkerBridge } from '../worker/workerBridge';
import {
  civilizationPlugin,
  ecosystemPlugin,
  stationPlugin,
} from '../worlds';

describe('Phase 5-6: Cross-World Contracts, Experiments, Comparison, Persistence & Adversarial Tests', () => {
  it('Cross-World Contract translates compatible events with provenance and safely rejects incompatible transfers', () => {
    const ecoRun = new SimulationKernel({
      runId: 'cw-eco',
      name: 'CW Ecosystem',
      plugin: ecosystemPlugin,
      seed: 101,
    });
    const stnRun = new SimulationKernel({
      runId: 'cw-stn',
      name: 'CW Station',
      plugin: stationPlugin,
      seed: 202,
    });

    // 1. Compatible: Ecosystem Drought -> Civilization Regional Drought
    ecoRun.enqueueCommand({
      type: 'trigger_drought',
      label: 'Trigger Drought',
      payload: { severity: 0.48, durationTicks: 20 },
    });
    ecoRun.flushCurrentTickCommands();
    const droughtEv = ecoRun
      .getEvents()
      .find((e) => e.type === 'drought_triggered')!;
    expect(droughtEv).toBeDefined();

    const compatiblePreview = defaultCrossWorldRegistry.previewTransfer(
      droughtEv,
      'ecosystem',
      'civilization',
    );
    expect(compatiblePreview.compatible).toBe(true);
    expect(compatiblePreview.translatedCommand?.type).toBe(
      'trigger_regional_drought',
    );
    expect(
      compatiblePreview.translatedCommand?.provenance.sourceEventId,
    ).toBe(droughtEv.id);

    // 2. Incompatible: Station Hull Breach Decompression -> Ecosystem (MUST BE REJECTED)
    stnRun.enqueueCommand({
      type: 'trigger_hull_breach',
      label: 'Breach Airlock',
      payload: { roomId: 'room-airlock', severity: 0.6 },
    });
    stnRun.flushCurrentTickCommands();
    const breachEv = stnRun.getEvents().find((e) => e.type === 'hull_breach')!;
    expect(breachEv).toBeDefined();

    const rejectedPreview = defaultCrossWorldRegistry.previewTransfer(
      breachEv,
      'station',
      'ecosystem',
    );
    expect(rejectedPreview.compatible).toBe(false);
    expect(rejectedPreview.rejectionReason).toContain(
      'REJECTED BY PHYSICAL CONTRACT',
    );

    // 3. Same-world transfer rejected by cross-world contract
    const sameWorldPreview = defaultCrossWorldRegistry.previewTransfer(
      droughtEv,
      'ecosystem',
      'ecosystem',
    );
    expect(sameWorldPreview.compatible).toBe(false);
  });

  it('Scientific Experiment Lab executes paired multi-seed trials and computes descriptive variation', () => {
    const baseEco = new SimulationKernel({
      runId: 'exp-base-eco',
      name: 'Experiment Baseline',
      plugin: ecosystemPlugin,
      seed: 70421,
      config: ecosystemPlugin.scenarios[0].config,
    });

    const { result, primaryBaselineKernel, primaryTreatmentKernel } =
      runControlledExperiment(baseEco, ecosystemPlugin, {
        id: 'test-exp-predators',
        title: 'Apex Predator Trophic Test',
        hypothesis: 'Adding predators reduces herbivore overgrazing.',
        worldId: 'ecosystem',
        baselineRunId: baseEco.runId,
        startTick: 0,
        durationTicks: 15,
        seedPolicy: 'paired_multi_seed',
        pairedSeedCount: 3,
        intervention: {
          commandType: 'introduce_predators',
          commandLabel: 'Introduce Predators (+6)',
          payload: { count: 6 },
        },
        selectedMetrics: ['herbivoreCount', 'predatorCount', 'totalPlantBiomass'],
      });

    expect(result.trials.length).toBe(3);
    expect(primaryBaselineKernel.tick).toBe(15);
    expect(primaryTreatmentKernel.tick).toBe(15);
    expect(result.methodologyNote).toContain('N=3 paired seeds');

    const predSummary = result.metricSummaries.find(
      (m) => m.metricId === 'predatorCount',
    )!;
    expect(predSummary.treatmentMean).toBeGreaterThan(predSummary.baselineMean);
  });

  it('Comparison Engine distinguishes same-world metric deltas from cross-world shared dimensions', () => {
    const ecoA = new SimulationKernel({
      runId: 'cmp-eco-a',
      name: 'Eco A',
      plugin: ecosystemPlugin,
      seed: 111,
    });
    const ecoB = ecoA.forkBranch({
      newRunId: 'cmp-eco-b',
      newName: 'Eco B',
      initialCommand: {
        type: 'introduce_predators',
        label: 'Add Predators',
        payload: { count: 6 },
      },
    });
    ecoA.stepMany(8);
    ecoB.stepMany(8);

    const sameWorldReport = compareRealities(ecoA, ecoB);
    expect(sameWorldReport.mode).toBe('same_world');
    expect(sameWorldReport.incompatibilityNotice).toBeNull();
    expect(sameWorldReport.sameWorldMetricDeltas.length).toBeGreaterThan(0);
    expect(sameWorldReport.sharedMetadata.sameLineageOrigin).toBe(true);

    const civRun = new SimulationKernel({
      runId: 'cmp-civ',
      name: 'Civ Run',
      plugin: civilizationPlugin,
      seed: 222,
    });
    civRun.stepMany(5);

    const crossWorldReport = compareRealities(ecoA, civRun);
    expect(crossWorldReport.mode).toBe('cross_world');
    expect(crossWorldReport.sameWorldMetricDeltas.length).toBe(0);
    expect(crossWorldReport.incompatibilityNotice).toContain(
      'Cross-World Comparison Mode',
    );
    expect(
      crossWorldReport.crossWorldCompatibleDimensions.some(
        (d) => d.dimensionKey === 'system_stability_ratio',
      ),
    ).toBe(true);
  });

  it('IndexedDB and Portable .omniverse.zip Archives preserve state and reject corrupt/malicious imports', async () => {
    const stn = new SimulationKernel({
      runId: 'vault-stn-test',
      name: 'Vault Station Test',
      plugin: stationPlugin,
      seed: 445566,
    });
    stn.stepMany(6);

    const record = stn.exportRunRecord();
    const savedMeta = await saveRunToDb(record);
    expect(savedMeta.runId).toBe('vault-stn-test');
    expect(savedMeta.tick).toBe(6);

    const listed = await listSavedRunsFromDb();
    expect(listed.some((m) => m.runId === 'vault-stn-test')).toBe(true);

    const loadedRecord = await loadRunFromDb('vault-stn-test');
    expect(loadedRecord).not.toBeNull();
    const restoredKernel = SimulationKernel.fromRunRecord(
      loadedRecord!,
      stationPlugin,
    );
    expect(restoredKernel.getStateHash()).toBe(stn.getStateHash());

    // Portable ZIP Archive Round-Trip
    const zipBytes = createPortableArchiveZip(record);
    const unpacked = inspectAndUnpackArchiveZip(zipBytes);
    expect(unpacked.valid).toBe(true);
    expect(unpacked.integrity?.stateHash).toBe(stn.getStateHash());

    // Reject script injection inside ZIP
    const maliciousZip = zipSync({
      'manifest.json': strToU8('{}'),
      'exploit.js': strToU8('alert(1)'),
    });
    const maliciousCheck = inspectAndUnpackArchiveZip(maliciousZip);
    expect(maliciousCheck.valid).toBe(false);
    expect(maliciousCheck.errors[0]).toContain('prohibited executable/script');

    // Reject tampered state.json inside ZIP
    const tamperedZip = zipSync({
      'manifest.json': strToU8(JSON.stringify(unpacked.manifest)),
      'config.json': strToU8('{}'),
      'state.json': strToU8('{"tampered":true}'),
      'checkpoints.json': strToU8('{}'),
      'events.json': strToU8('{}'),
      'integrity.json': strToU8(JSON.stringify(unpacked.integrity)),
    });
    const tamperedCheck = inspectAndUnpackArchiveZip(tamperedZip);
    expect(tamperedCheck.valid).toBe(false);
    expect(
      tamperedCheck.errors.some((e) => e.includes('checksum mismatch')),
    ).toBe(true);

    await deleteRunFromDb('vault-stn-test');
  });

  it('Adversarial validation: empty world, extreme scarcity, bounded logs/snapshots, quota failure & worker crash recovery', async () => {
    // 1. Empty world (0 herbivores, 0 predators) does not NaN or crash
    const emptyEco = new SimulationKernel({
      runId: 'adv-empty-eco',
      name: 'Empty Ecosystem',
      plugin: ecosystemPlugin,
      seed: 999,
      config: {
        ...ecosystemPlugin.defaultConfig,
        initialHerbivores: 0,
        initialPredators: 0,
        waterAvailability: 0.15,
      },
      budget: {
        maxEvents: 60,
        maxCheckpoints: 6,
        autoCheckpointIntervalTicks: 2,
      },
    });

    emptyEco.stepMany(30);
    expect(emptyEco.tick).toBe(30);
    expect(emptyEco.getEvents().length).toBeLessThanOrEqual(60);
    expect(emptyEco.listCheckpoints().length).toBeLessThanOrEqual(6);

    // 2. Invalid plugin registration is blocked cleanly
    const reg = new PluginRegistry();
    expect(() => reg.register({ id: '' } as any)).toThrow();

    // 3. Simulated storage quota exhaustion throws clean error without corrupting kernel
    setSimulatedQuotaExceeded(true);
    await expect(saveRunToDb(emptyEco.exportRunRecord())).rejects.toThrow(
      /QuotaExceededError/,
    );
    setSimulatedQuotaExceeded(false);

    // 4. Worker crash recovery preserves execution
    const bridge = new BoundedWorkerBridge(8);
    bridge.handleWorkerCrash('Adversarial Worker Termination');
    expect(bridge.getDiagnostics().crashRecoveryCount).toBe(1);
    const stepRes = await bridge.stepKernelWithWorkerOrFallback(emptyEco, 4);
    expect(stepRes.stepsExecuted).toBe(4);
    bridge.dispose();
  });
});
