import { describe, expect, it } from 'vitest';
import { compareRealities } from '../core/comparisonEngine';
import { defaultCrossWorldRegistry } from '../core/crossWorldContract';
import { runControlledExperiment } from '../core/experimentRunner';
import { SimulationKernel } from '../core/kernel';
import { verifyWorldPluginContract } from '../core/pdk';
import { globalPluginRegistry } from '../core/pluginRegistry';
import {
  createPortableArchiveZip,
  inspectAndUnpackArchiveZip,
} from '../persistence/archive';
import {
  atmospherePlugin,
  celestialPlugin,
  ORIGINAL_WORLD_PLUGINS,
  geologyPlugin,
  industrialPlugin,
  megacityPlugin,
  oceanPlugin,
  registerBuiltInWorlds,
} from '../worlds';

registerBuiltInWorlds();

describe('Nine-World Triple-Scale Expansion Proof Suite (Sections 2-10)', () => {
  it('A. Registry Proof: registers and validates all 9 primary simulation worlds in globalPluginRegistry', () => {
    const expectedIds = [
      'ecosystem',
      'station',
      'civilization',
      'atmosphere',
      'ocean',
      'celestial',
      'megacity',
      'industrial',
      'geology',
    ];

    expect(ORIGINAL_WORLD_PLUGINS.map((p) => p.id)).toEqual(expectedIds);

    for (const id of expectedIds) {
      const plugin = globalPluginRegistry.get(id);
      expect(plugin).toBeDefined();
      expect(plugin!.id).toBe(id);

      const contractResult = verifyWorldPluginContract(plugin as any, 18, 424242);
      expect(contractResult.passed).toBe(true);
      expect(contractResult.determinismVerified).toBe(true);
      expect(contractResult.serializationRoundTripVerified).toBe(true);
      expect(contractResult.continuationConsistencyVerified).toBe(true);
      expect(contractResult.branchIsolationVerified).toBe(true);
    }
  });

  it('B. Spatial Scale Proof (>= 3x Playable Area): verifies >= 3x active spatial zones/nodes across all 9 worlds', () => {
    const expectedMinZones: Record<string, number> = {
      ecosystem: 48, // 3x of 16 habitat zones
      station: 18, // 3x of 6 pressurized compartments
      civilization: 9, // 3x of 3 starting settlements
      atmosphere: 48, // 3x of 16 climate cells
      ocean: 48, // 48 horizontal sectors (144 3-layer cells, >= 3x of 16)
      celestial: 3, // 3 star systems with 18 celestial bodies (3x of 1 system / 6 bodies)
      megacity: 18, // 3x of 6 urban districts
      industrial: 18, // 3x of 6 industrial facilities
      geology: 48, // 3x of 16 crustal cells
    };

    for (const plugin of ORIGINAL_WORLD_PLUGINS) {
      expect(plugin.scaleMetadata).toBeDefined();
      const sm = plugin.scaleMetadata!;
      expect(sm.expandedPlayableArea).toBeGreaterThanOrEqual(
        sm.baselinePlayableArea * 3,
      );
      expect(sm.expandedTerritoryScalar).toBeGreaterThanOrEqual(
        sm.baselineTerritoryScalar * 3,
      );

      const kernel = new SimulationKernel({
        runId: `scale-check-${plugin.id}`,
        name: `Scale Check ${plugin.name}`,
        plugin: plugin as any,
        seed: plugin.scenarios[0].seed,
      });

      const frame0 = kernel.extractRenderFrame();
      expect(frame0.zones.length).toBeGreaterThanOrEqual(
        expectedMinZones[plugin.id],
      );

      if (plugin.id === 'celestial') {
        expect(frame0.entities.length).toBeGreaterThanOrEqual(18);
      }

      // Advance 6 ticks and verify active state updates across spatial zones/entities
      const hash0 = kernel.getStateHash();
      kernel.stepMany(6);
      expect(kernel.getStateHash()).not.toBe(hash0);

      const entities = kernel.inspectEntities();
      expect(entities.length).toBeGreaterThanOrEqual(expectedMinZones[plugin.id]);
    }
  });

  it('C. Functional Content Proof (>= 3x Scenarios, Interventions & Metrics): verifies triple content targets across all 9 worlds', () => {
    const expectedTargets: Record<
      string,
      { scenarios: number; interventions: number; metrics: number }
    > = {
      ecosystem: { scenarios: 9, interventions: 21, metrics: 18 },
      station: { scenarios: 9, interventions: 21, metrics: 18 },
      civilization: { scenarios: 9, interventions: 24, metrics: 18 },
      atmosphere: { scenarios: 9, interventions: 18, metrics: 18 },
      ocean: { scenarios: 9, interventions: 18, metrics: 18 },
      celestial: { scenarios: 9, interventions: 18, metrics: 18 },
      megacity: { scenarios: 9, interventions: 18, metrics: 18 },
      industrial: { scenarios: 9, interventions: 18, metrics: 18 },
      geology: { scenarios: 9, interventions: 18, metrics: 18 },
    };

    for (const plugin of ORIGINAL_WORLD_PLUGINS) {
      const target = expectedTargets[plugin.id];
      expect(plugin.scenarios.length).toBeGreaterThanOrEqual(target.scenarios);
      expect(plugin.quickInterventions.length).toBeGreaterThanOrEqual(
        target.interventions,
      );
      expect(plugin.metricDefinitions.length).toBeGreaterThanOrEqual(
        target.metrics,
      );

      // Verify every scenario initializes and steps cleanly without NaN
      for (const sc of plugin.scenarios) {
        const k = new SimulationKernel({
          runId: `sc-${plugin.id}-${sc.id}`,
          name: sc.name,
          plugin: plugin as any,
          seed: sc.seed,
          config: sc.config,
          scheduledCommands: sc.scheduledCommands,
        });
        k.stepMany(3);
        const metrics = k.getLatestMetrics();
        for (const def of plugin.metricDefinitions) {
          expect(Number.isFinite(metrics[def.id])).toBe(true);
        }
      }
    }
  });

  it('D & F. Determinism & No-Op Detection Proof: every intervention in all 9 worlds mutates state vs. control and replays deterministically', { timeout: 60000 }, () => {
    for (const plugin of ORIGINAL_WORLD_PLUGINS) {
      for (const intervention of plugin.quickInterventions) {
        const control = new SimulationKernel({
          runId: `noop-ctrl-${plugin.id}-${intervention.id}`,
          name: 'Control',
          plugin: plugin as any,
          seed: 314159,
        });
        const treatment = new SimulationKernel({
          runId: `noop-treat-${plugin.id}-${intervention.id}`,
          name: 'Treatment',
          plugin: plugin as any,
          seed: 314159,
        });

        control.stepMany(2);
        treatment.stepMany(2);

        treatment.enqueueCommand({
          type: intervention.commandType,
          label: intervention.label,
          payload: intervention.defaultPayload,
        });

        control.stepMany(2);
        treatment.stepMany(2);

        // Authoritative state hash and event journal must diverge from no-op control
        expect(
          treatment.getStateHash(),
          `No-op detected on ${plugin.id} -> ${intervention.id} (${intervention.commandType})`,
        ).not.toBe(control.getStateHash());
        expect(treatment.getEvents().length).toBeGreaterThan(
          control.getEvents().length,
        );
      }

      // Deterministic replay check on each world
      const replayKernel = new SimulationKernel({
        runId: `replay-${plugin.id}`,
        name: `Replay ${plugin.id}`,
        plugin: plugin as any,
        seed: 271828,
      });
      replayKernel.stepMany(3);
      const firstInt = plugin.quickInterventions[0];
      replayKernel.enqueueCommand({
        type: firstInt.commandType,
        label: firstInt.label,
        payload: firstInt.defaultPayload,
      });
      replayKernel.stepMany(4);
      const check = replayKernel.replayFromStart(replayKernel.tick);
      expect(check.matchesAuthoritativeHash).toBe(true);
    }
  });

  it('E. Causal Behavior Proof Across the Six New Worlds (Atmosphere, Ocean, Celestial, Megacity, Industrial, Geology)', () => {
    // 1. World D (Atmosphere): Moisture plume injection increases humidity and rainfall
    const atmBase = new SimulationKernel({
      runId: 'atm-base',
      name: 'Atmosphere Base',
      plugin: atmospherePlugin,
      seed: 81001,
    });
    const atmWet = atmBase.forkBranch({
      newRunId: 'atm-wet',
      newName: 'Atmosphere Moisture Plume',
      initialCommand: {
        type: 'inject_moisture_plume',
        label: 'Inject Moisture',
        payload: { region: 'all', humidityBoost: 35, pressureDropHpa: 8 },
      },
    });
    atmBase.stepMany(6);
    atmWet.stepMany(6);
    expect(atmWet.getLatestMetrics().meanHumidityPct).toBeGreaterThan(
      atmBase.getLatestMetrics().meanHumidityPct,
    );

    // 2. World E (Ocean): Deep nutrient upwelling increases surface nutrients and phytoplankton
    const ocnBase = new SimulationKernel({
      runId: 'ocn-base',
      name: 'Ocean Base',
      plugin: oceanPlugin,
      seed: 82001,
    });
    const ocnUpwell = ocnBase.forkBranch({
      newRunId: 'ocn-upwell',
      newName: 'Ocean Upwelling & Sanctuary',
      initialCommand: {
        type: 'inject_nutrients',
        label: 'Upwelling',
        payload: { region: 'all', nutrientDelta: 24, coolingDeltaC: -1.5 },
      },
    });
    ocnBase.stepMany(6);
    ocnUpwell.stepMany(6);
    expect(ocnUpwell.getLatestMetrics().meanSurfaceNutrientsUmol).toBeGreaterThan(
      ocnBase.getLatestMetrics().meanSurfaceNutrientsUmol,
    );

    // 3. World F (Celestial): Gravitational resonance perturbation increases planetary eccentricity
    const celBase = new SimulationKernel({
      runId: 'cel-base',
      name: 'Celestial Base',
      plugin: celestialPlugin,
      seed: 83001,
    });
    const celPerturbed = celBase.forkBranch({
      newRunId: 'cel-pert',
      newName: 'Celestial Perturbed',
      initialCommand: {
        type: 'perturb_orbital_eccentricity',
        label: 'Resonance Kick',
        payload: { deltaEccentricity: 0.18 },
      },
    });
    celBase.stepMany(6);
    celPerturbed.stepMany(6);
    expect(celPerturbed.getLatestMetrics().meanEccentricity).toBeGreaterThan(
      celBase.getLatestMetrics().meanEccentricity,
    );

    // 4. World G (Megacity): Transit & clean grid investment reduces congestion
    const cityBase = new SimulationKernel({
      runId: 'city-base',
      name: 'Megacity Base',
      plugin: megacityPlugin,
      seed: 84001,
    });
    const cityTransit = cityBase.forkBranch({
      newRunId: 'city-transit',
      newName: 'Megacity Transit Upgrade',
      initialCommand: {
        type: 'expand_public_transit',
        label: 'Expand Metro',
        payload: { transitShareBoostPct: 16, corridorCapacityBoostK: 45 },
      },
    });
    cityBase.stepMany(6);
    cityTransit.stepMany(6);
    expect(cityTransit.getLatestMetrics().meanTrafficCongestionPct).toBeLessThan(
      cityBase.getLatestMetrics().meanTrafficCongestionPct,
    );

    // 5. World H (Industrial): Refinery shortage degrades midstream refined alloy stock
    const indBase = new SimulationKernel({
      runId: 'ind-base',
      name: 'Industrial Base',
      plugin: industrialPlugin,
      seed: 85001,
    });
    const indFault = indBase.forkBranch({
      newRunId: 'ind-fault',
      newName: 'Industrial Refinery Outage',
      initialCommand: {
        type: 'induce_supply_shortage',
        label: 'Refinery Outage',
        payload: { targetTier: 1, breakdownCount: 2, inventoryLossFraction: 0.55 },
      },
    });
    indBase.stepMany(6);
    indFault.stepMany(6);
    expect(indFault.getLatestMetrics().totalRefinedAlloyStock).toBeLessThan(
      indBase.getLatestMetrics().totalRefinedAlloyStock,
    );

    // 6. World I (Geology): Controlled fault creep relieves tectonic shear stress
    const geoBase = new SimulationKernel({
      runId: 'geo-base',
      name: 'Geology Base',
      plugin: geologyPlugin,
      seed: 86001,
    });
    const geoRelieved = geoBase.forkBranch({
      newRunId: 'geo-relieved',
      newName: 'Geology Fault Creep Relief',
      initialCommand: {
        type: 'relieve_tectonic_stress',
        label: 'Controlled Fault Creep',
        payload: { stressDropMpa: 28 },
      },
    });
    geoBase.stepMany(4);
    geoRelieved.stepMany(4);
    expect(geoRelieved.getLatestMetrics().meanTectonicStressMpa).toBeLessThan(
      geoBase.getLatestMetrics().meanTectonicStressMpa,
    );
  });

  it('G, H & J. Persistence, Archive Round-Trip, Branch Isolation & 10 Cross-World Adapters', async () => {
    // Verify all 10 Cross-World Adapters are registered and functional
    const adapters = defaultCrossWorldRegistry.listAdapters();
    expect(adapters.length).toBeGreaterThanOrEqual(10);

    // Test new cross-world adapters: Geology -> Atmosphere, Geology -> Megacity, Atmosphere -> Ecosystem, Celestial -> Station, Ocean -> Ecosystem
    const geoKernel = new SimulationKernel({
      runId: 'cw-geo',
      name: 'CW Geology',
      plugin: geologyPlugin,
      seed: 91001,
    });
    geoKernel.enqueueCommand({
      type: 'trigger_volcanic_eruption',
      label: 'Plinian Eruption',
      payload: { ashInjection: 42 },
    });
    geoKernel.flushCurrentTickCommands();
    const eruptionEv = geoKernel
      .getEvents()
      .find((e) => e.type === 'volcanic_eruption')!;
    expect(eruptionEv).toBeDefined();

    const geoToAtmPreview = defaultCrossWorldRegistry.previewTransfer(
      eruptionEv,
      'geology',
      'atmosphere',
    );
    expect(geoToAtmPreview.compatible).toBe(true);
    expect(geoToAtmPreview.translatedCommand?.type).toBe(
      'adjust_aerosol_veil',
    );

    // Verify incompatible transfer rejection (Celestial orbital eccentricity -> Megacity pipes)
    const invalidPreview = defaultCrossWorldRegistry.previewTransfer(
      {
        ...eruptionEv,
        type: 'orbital_eccentricity_shift',
      },
      'celestial',
      'megacity',
    );
    expect(invalidPreview.compatible).toBe(false);
    expect(invalidPreview.rejectionReason).toContain('REJECTED BY PHYSICAL CONTRACT');

    // Verify exportRunRecord/fromRunRecord and .omniverse.zip archive round-trip across all 9 worlds
    for (const plugin of ORIGINAL_WORLD_PLUGINS) {
      const k = new SimulationKernel({
        runId: `persist-${plugin.id}`,
        name: `Persist ${plugin.id}`,
        plugin: plugin as any,
        seed: 515151,
      });
      k.stepMany(4);
      const record = k.exportRunRecord();
      const restored = SimulationKernel.fromRunRecord(record, plugin as any);
      expect(restored.getStateHash()).toBe(k.getStateHash());

      const zipBytes = createPortableArchiveZip(record);
      const unpacked = inspectAndUnpackArchiveZip(zipBytes);
      expect(unpacked.valid).toBe(true);
      expect(unpacked.manifest?.pluginId).toBe(plugin.id);
    }

    // Verify Controlled Experiment Runner & Reality Comparison Engine work on new worlds
    const baseCity = new SimulationKernel({
      runId: 'exp-base-city',
      name: 'Megacity Baseline',
      plugin: megacityPlugin,
      seed: 84001,
    });
    const expResult = runControlledExperiment(baseCity, megacityPlugin, {
      id: 'exp-megacity-transit',
      title: 'Megacity Transit vs Baseline',
      hypothesis: 'Expanding rapid transit reduces metropolitan traffic congestion.',
      worldId: 'megacity',
      baselineRunId: baseCity.runId,
      startTick: 0,
      durationTicks: 8,
      seedPolicy: 'paired_multi_seed',
      pairedSeedCount: 2,
      intervention: {
        commandType: 'expand_transit_network',
        commandLabel: 'Expand Metro Lines',
        payload: { transitBoost: 28, congestionDrop: 20 },
      },
      selectedMetrics: ['meanCongestionPct', 'urbanLivabilityIndex'],
    });
    expect(expResult.result.trials.length).toBe(2);

    const compReport = compareRealities(geoKernel, atmWetHelper());
    expect(compReport.mode).toBe('cross_world');
    expect(compReport.crossWorldCompatibleDimensions.length).toBeGreaterThanOrEqual(1);
  });
});

function atmWetHelper() {
  const k = new SimulationKernel({
    runId: 'comp-atm',
    name: 'Compare Atmosphere',
    plugin: atmospherePlugin,
    seed: 81001,
  });
  k.stepMany(4);
  return k;
}
