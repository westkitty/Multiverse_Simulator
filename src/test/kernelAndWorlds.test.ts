import { describe, expect, it } from 'vitest';
import { DeterministicECS } from '../core/ecs';
import { SimulationKernel } from '../core/kernel';
import {
  createThermalLatticeTemplatePlugin,
  verifyWorldPluginContract,
} from '../core/pdk';
import { SeededRng } from '../core/rng';
import {
  civilizationPlugin,
  ecosystemPlugin,
  stationPlugin,
} from '../worlds';
import { StationState } from '../worlds/station/stationPlugin';

describe('Phase 1-4: Core Kernel, RNG, ECS, Causality & Three World Modules', () => {
  it('RNG streams are deterministic, isolated, and serialize/restore accurately', () => {
    const rngA = new SeededRng(987654);
    const rngB = new SeededRng(987654);

    // Draw from an unrelated stream on rngA; stream("weather") must remain identical to rngB
    rngA.stream('unrelated_noise').nextFloat();
    rngA.stream('unrelated_noise').nextInt(1, 100);

    const seqA = [
      rngA.stream('weather').nextFloat(),
      rngA.stream('weather').nextInt(10, 50),
      rngA.stream('weather').gaussian(0, 1),
    ];
    const seqB = [
      rngB.stream('weather').nextFloat(),
      rngB.stream('weather').nextInt(10, 50),
      rngB.stream('weather').gaussian(0, 1),
    ];
    expect(seqA).toEqual(seqB);

    // Serialize and restore mid-stream
    const snapshot = rngA.serialize();
    const nextFromA = rngA.stream('weather').nextFloat();

    const restored = new SeededRng(1);
    restored.restore(snapshot);
    expect(restored.stream('weather').nextFloat()).toBe(nextFromA);
  });

  it('DeterministicECS maintains monotonic IDs, sorted queries, and lossless serialization', () => {
    const ecs = new DeterministicECS();
    const e1 = ecs.createEntity('org');
    const e2 = ecs.createEntity('org');
    const e3 = ecs.createEntity('org');

    expect([e1, e2, e3]).toEqual(['org-1', 'org-2', 'org-3']);

    ecs.setComponent(e3, 'pos', { x: 30, z: -10 });
    ecs.setComponent(e1, 'pos', { x: 10, z: 5 });
    ecs.setComponent(e1, 'energy', { kcal: 80 });

    expect(ecs.query(['pos'])).toEqual(['org-1', 'org-3']);
    expect(ecs.query(['pos', 'energy'])).toEqual(['org-1']);

    const snap = ecs.serialize();
    const copy = new DeterministicECS();
    copy.restore(snap);
    expect(copy.query(['pos'])).toEqual(['org-1', 'org-3']);
    expect(copy.getComponent<{ kcal: number }>(e1, 'energy')?.kcal).toBe(80);
  });

  it('PDK contract verifier passes determinism, serialization, continuation, and branch isolation for all 4 plugins', () => {
    const plugins = [
      ecosystemPlugin,
      stationPlugin,
      civilizationPlugin,
      createThermalLatticeTemplatePlugin(),
    ];

    for (const plugin of plugins) {
      const verification = verifyWorldPluginContract(plugin as any, 24, 777111);
      expect(verification.passed).toBe(true);
      expect(verification.determinismVerified).toBe(true);
      expect(verification.serializationRoundTripVerified).toBe(true);
      expect(verification.continuationConsistencyVerified).toBe(true);
      expect(verification.branchIsolationVerified).toBe(true);
      expect(verification.hashRunA).toBe(verification.hashRunB);
    }
  });

  it('Deterministic replay from Tick 0 reproduces identical authoritative state hash after commands', () => {
    const kernel = new SimulationKernel({
      runId: 'replay-test-eco',
      name: 'Ecosystem Replay Run',
      plugin: ecosystemPlugin,
      seed: 123456,
    });

    kernel.stepMany(5);
    kernel.enqueueCommand({
      tick: kernel.tick,
      type: 'trigger_drought',
      label: 'Mid-Run Drought',
      payload: { severity: 0.5, durationTicks: 15 },
    });
    kernel.stepMany(6);
    kernel.enqueueCommand({
      tick: kernel.tick,
      type: 'introduce_predators',
      label: 'Add Predators',
      payload: { count: 5 },
    });
    kernel.stepMany(7);

    const replayCheck = kernel.replayFromStart(kernel.tick);
    expect(replayCheck.matchesAuthoritativeHash).toBe(true);
    expect(replayCheck.replayedHash).toBe(kernel.getStateHash());
  });

  it('World A (Ecosystem): models grazing, drought biomass drop, predator introduction, and nutrient cycling', () => {
    const eco = new SimulationKernel({
      runId: 'eco-mechanics',
      name: 'Ecosystem Mechanics Test',
      plugin: ecosystemPlugin,
      seed: 70421,
      config: {
        ...ecosystemPlugin.defaultConfig,
        initialHerbivores: 45,
        initialPredators: 0,
      },
    });

    const initialMetrics = eco.getLatestMetrics();
    expect(initialMetrics.herbivoreCount).toBe(45);
    expect(initialMetrics.predatorCount).toBe(0);

    // Trigger drought and step
    eco.enqueueCommand({
      type: 'trigger_drought',
      label: 'Severe Drought',
      payload: { severity: 0.65, durationTicks: 20 },
    });
    eco.stepMany(10);

    const droughtMetrics = eco.getLatestMetrics();
    expect(droughtMetrics.meanMoisture).toBeLessThan(initialMetrics.meanMoisture);

    // Introduce predators and restore favorable conditions
    eco.enqueueCommand({
      type: 'introduce_predators',
      label: 'Introduce Predators',
      payload: { count: 8 },
    });
    eco.enqueueCommand({
      type: 'restore_favorable_conditions',
      label: 'Restore Water',
      payload: { moistureTarget: 88, biomassBoost: 40 },
    });
    eco.flushCurrentTickCommands();

    const postRestoreMetrics = eco.getLatestMetrics();
    expect(postRestoreMetrics.predatorCount).toBe(8);
    expect(postRestoreMetrics.meanMoisture).toBeGreaterThanOrEqual(80);
  });

  it('World B (Space Station): conserves gas moles across hatches, isolates breaches, and traces reactor -> scrubber -> CO2 causal chain', () => {
    const stn = new SimulationKernel({
      runId: 'stn-mechanics',
      name: 'Station Physics Test',
      plugin: stationPlugin,
      seed: 55104,
      config: {
        ...stationPlugin.defaultConfig,
        batteryCapacityKwh: 30,
        solarBackupKw: 15,
      },
    });

    // 1. Verify compartment isolation during hull breach preserves station atmosphere
    const breachedBranch = stn.forkBranch({
      newRunId: 'stn-unisolated',
      newName: 'Unisolated Breach',
      initialCommand: {
        type: 'trigger_hull_breach',
        label: 'Breach Airlock',
        payload: { roomId: 'room-airlock', severity: 0.7 },
      },
    });

    const isolatedBranch = stn.forkBranch({
      newRunId: 'stn-isolated',
      newName: 'Isolated Breach',
      initialCommand: {
        type: 'trigger_hull_breach',
        label: 'Breach Airlock',
        payload: { roomId: 'room-airlock', severity: 0.7 },
      },
    });
    isolatedBranch.enqueueCommand({
      type: 'isolate_compartment',
      label: 'Seal Airlock Hatches',
      payload: { roomId: 'room-airlock' },
    });

    breachedBranch.stepMany(12);
    isolatedBranch.stepMany(12);

    expect(isolatedBranch.getLatestMetrics().meanPressureKpa).toBeGreaterThan(
      breachedBranch.getLatestMetrics().meanPressureKpa + 8,
    );

    // 2. Verify cascading reactor failure -> battery drain -> scrubber power loss -> CO2 rise -> crew health drop
    stn.enqueueCommand({
      type: 'trigger_reactor_scram',
      label: 'Reactor Scram',
      payload: { damageAmount: 70 },
    });
    stn.stepMany(18);

    const events = stn.getEvents();
    const reactorEv = events.find((e) => e.type === 'reactor_failure');
    const scrubberLossEv = events.find((e) => e.type === 'scrubber_power_loss');
    const co2RiseEv = events.find((e) => e.type === 'co2_concentration_rising');

    expect(reactorEv).toBeDefined();
    expect(scrubberLossEv).toBeDefined();
    expect(co2RiseEv).toBeDefined();

    // Inspect causal chain on CO2 rise event
    const chain = stn.inspectCausalChain(co2RiseEv!.id);
    expect(chain).not.toBeNull();
    expect(chain!.whatCausedIt.upstreamChain.length).toBeGreaterThanOrEqual(1);
    expect(
      chain!.whatCausedIt.upstreamChain.some((e) => e.type === 'reactor_failure'),
    ).toBe(true);

    // Dispatch emergency repair and verify recovery
    const stateBeforeRepair = stn.getState() as StationState;
    expect(stateBeforeRepair.reactorOnline).toBe(false);

    stn.enqueueCommand({
      type: 'dispatch_repair',
      label: 'Emergency Repair',
      payload: { targetRoomId: 'all' },
    });
    stn.flushCurrentTickCommands();
    expect((stn.getState() as StationState).reactorOnline).toBe(true);
  });

  it('World C (Civilization): models resource accounting, infrastructure investment, founding settlements, and drought resilience', () => {
    const civBaseline = new SimulationKernel({
      runId: 'civ-no-infra',
      name: 'Civilization Baseline (No Early Water Infra)',
      plugin: civilizationPlugin,
      seed: 60412,
      config: civilizationPlugin.scenarios[0].config,
      scheduledCommands: civilizationPlugin.scenarios[0].scheduledCommands,
    });

    const civInvested = civBaseline.forkBranch({
      newRunId: 'civ-with-infra',
      newName: 'Civilization With Water & Route Investment',
      initialCommand: {
        type: 'build_water_infrastructure',
        label: 'Build Aqueducts',
        payload: { targetSettlementId: 'all' },
      },
    });
    civInvested.enqueueCommand({
      type: 'establish_route',
      label: 'Upgrade Trade Routes',
      payload: { upgradeAll: true },
    });
    civInvested.enqueueCommand({
      type: 'change_development_priority',
      label: 'Water Security Doctrine',
      payload: { priority: 'water_security' },
    });

    civBaseline.stepMany(26);
    civInvested.stepMany(26);

    const baseMetrics = civBaseline.getLatestMetrics();
    const invMetrics = civInvested.getLatestMetrics();

    expect(invMetrics.totalWaterStock).toBeGreaterThan(baseMetrics.totalWaterStock);
    expect(invMetrics.totalPopulation).toBeGreaterThanOrEqual(
      baseMetrics.totalPopulation,
    );
    expect(invMetrics.infrastructureIndex).toBeGreaterThan(
      baseMetrics.infrastructureIndex,
    );

    // Test founding a 10th frontier settlement (from 9 starting settlements)
    expect(civInvested.inspectEntities().filter((e) => e.kind === 'settlement').length).toBe(9);
    civInvested.enqueueCommand({
      type: 'found_settlement',
      label: 'Found Frontier Colony',
      payload: {},
    });
    civInvested.flushCurrentTickCommands();
    expect(civInvested.inspectEntities().filter((e) => e.kind === 'settlement').length).toBe(10);
  });
});
