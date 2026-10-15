import { describe, it, expect } from 'vitest';
import {
  ScientificInstrument,
  ScientificInstrumentManager,
  ScientificBudgetLedger,
  NativeActionRegistry,
  NativeActionFamilyDefinition,
} from '../../features/contracts';
import { StandardWorldFeatureModule } from '../../features/domainModules/domainHelper';

describe('Scientific Instruments Engine (P010)', () => {
  const testInstrumentConfig = {
    id: 'test_sampler',
    worldId: 'ecosystem',
    name: 'Field Moisture & Biomass Probe',
    description: 'Calibrated environmental sampler for watershed soil telemetry.',
    deviceClass: 'environmental_sampler' as const,
    channels: [
      {
        id: 'moisture',
        name: 'Soil Moisture',
        unit: '%',
        minValid: 0,
        maxValid: 100,
        basePrecision: 0.1,
      },
      {
        id: 'biomass',
        name: 'Vegetation Biomass',
        unit: 't/ha',
        minValid: 0,
        maxValid: 500,
        basePrecision: 0.5,
      },
    ],
    sampleCost: [{ resource: 'energy', amount: 2 }],
    calibrationCost: [{ resource: 'supplies', amount: 5 }],
    maxRangeMeters: 250,
  };

  it('samples valid channel returning calibrated observation with provenance', () => {
    const inst = new ScientificInstrument(testInstrumentConfig);
    const ledger = new ScientificBudgetLedger('ecosystem', {
      energy: { balance: 20, capacity: 50, replenishmentRate: 1 },
      supplies: { balance: 20, capacity: 50, replenishmentRate: 1 },
    });

    const res = inst.sample(
      {
        channelId: 'moisture',
        siteId: 'site-alpha',
        tick: 42,
        rawMetricValue: 65.4,
        distanceMeters: 100,
        isDisclosed: true,
      },
      ledger,
    );

    expect(res.success).toBe(true);
    expect(res.observation).toBeDefined();
    expect(res.observation?.channel).toBe('moisture');
    expect(res.observation?.unit).toBe('%');
    expect(res.observation?.siteId).toBe('site-alpha');
    expect(res.observation?.tick).toBe(42);
    expect(res.observation?.provenance.deviceClass).toBe('environmental_sampler');
    expect(res.observation?.provenance.rulesVersion).toBe(1);
    expect(res.observation?.provenance.costPaid).toEqual([{ resource: 'energy', amount: 2 }]);
    expect(ledger.getBalance('energy')).toBe(18);
  });

  it('rejects sampling when site is undisclosed or out of range', () => {
    const inst = new ScientificInstrument(testInstrumentConfig);
    const ledger = new ScientificBudgetLedger('ecosystem', {
      energy: { balance: 20, capacity: 50, replenishmentRate: 1 },
    });

    // Undisclosed site
    const undisclosedRes = inst.sample(
      {
        channelId: 'moisture',
        siteId: 'site-secret',
        tick: 1,
        rawMetricValue: 50,
        isDisclosed: false,
      },
      ledger,
    );
    expect(undisclosedRes.success).toBe(false);
    expect(undisclosedRes.reason).toContain('not disclosed');

    // Out of range (maxRange is 250)
    const outOfRangeRes = inst.sample(
      {
        channelId: 'moisture',
        siteId: 'site-far',
        tick: 1,
        rawMetricValue: 50,
        distanceMeters: 500,
        isDisclosed: true,
      },
      ledger,
    );
    expect(outOfRangeRes.success).toBe(false);
    expect(outOfRangeRes.reason).toContain('out of range');
  });

  it('rejects sampling when budget is insufficient and preserves balance', () => {
    const inst = new ScientificInstrument(testInstrumentConfig);
    const ledger = new ScientificBudgetLedger('ecosystem', {
      energy: { balance: 1, capacity: 50, replenishmentRate: 1 }, // needs 2
    });

    const res = inst.sample(
      {
        channelId: 'moisture',
        siteId: 'site-alpha',
        tick: 1,
        rawMetricValue: 50,
        distanceMeters: 50,
        isDisclosed: true,
      },
      ledger,
    );

    expect(res.success).toBe(false);
    expect(res.reason).toContain('Insufficient budget');
    expect(ledger.getBalance('energy')).toBe(1);
  });

  it('degrades calibration over repeated samples and restores on calibration', () => {
    const inst = new ScientificInstrument(testInstrumentConfig);
    const ledger = new ScientificBudgetLedger('ecosystem', {
      energy: { balance: 100, capacity: 100, replenishmentRate: 1 },
      supplies: { balance: 20, capacity: 50, replenishmentRate: 1 },
    });

    expect(inst.calibrationLevel).toBe(1.0);

    for (let i = 0; i < 10; i++) {
      inst.sample(
        {
          channelId: 'moisture',
          siteId: 'site-alpha',
          tick: i,
          rawMetricValue: 50,
          isDisclosed: true,
        },
        ledger,
      );
    }

    expect(inst.calibrationLevel).toBeLessThan(1.0);
    expect(inst.sampleCount).toBe(10);

    // Calibrate
    const calibRes = inst.calibrate(10, ledger);
    expect(calibRes.success).toBe(true);
    expect(calibRes.newLevel).toBe(1.0);
    expect(inst.calibrationLevel).toBe(1.0);
    expect(ledger.getBalance('supplies')).toBe(15);
  });

  it('ScientificInstrumentManager tracks and bounds recent observations', () => {
    const mgr = new ScientificInstrumentManager('ecosystem');
    mgr.registerInstrument(testInstrumentConfig);

    for (let i = 0; i < 5; i++) {
      mgr.sample('test_sampler', {
        channelId: 'moisture',
        siteId: `site-${i}`,
        tick: i,
        rawMetricValue: 40 + i,
        isDisclosed: true,
      });
    }

    const obs = mgr.getObservations();
    expect(obs.length).toBe(5);
    expect(mgr.getRecentObservations(3).length).toBe(3);
    expect(obs[4].calibratedValue).toBeGreaterThan(40);
  });
});

describe('Native Actions Registry (P001)', () => {
  const sampleAction: NativeActionFamilyDefinition = {
    id: 'ecosystem.action.habitat_corridors',
    familyKey: 'habitat_corridors',
    worldId: 'ecosystem',
    name: 'Habitat Corridors',
    description: 'Establish migratory corridors to relieve local drought stress.',
    readSet: ['moisture', 'biomass'],
    writeSet: ['moisture', 'biomass'],
    prerequisites: [{ field: 'moisture', condition: '<', threshold: 40 }],
    resourceCosts: [
      { resource: 'water_stores', amount: 5 },
      { resource: 'supplies', amount: 2 },
    ],
    deltas: [
      { field: 'moisture', delta: 15, unit: '%' },
      { field: 'biomass', delta: 5, unit: 't' },
    ],
    decisionImplication: 'Restores watershed connectivity but expends water stores.',
    dynamicHelp: 'Target when moisture drops below 40% to halt progressive drought.',
  };

  it('validates prerequisite conditions correctly', () => {
    const reg = new NativeActionRegistry();
    reg.registerAction(sampleAction);

    // Fails when moisture >= 40
    const failVal = reg.validate(sampleAction.id, { moisture: 55, biomass: 30 });
    expect(failVal.valid).toBe(false);
    expect(failVal.error).toContain('Prerequisite failed');

    // Passes when moisture < 40
    const passVal = reg.validate(sampleAction.id, { moisture: 30, biomass: 30 });
    expect(passVal.valid).toBe(true);
  });

  it('executes atomic debit and state delta mutation on valid condition', () => {
    const reg = new NativeActionRegistry();
    reg.registerAction(sampleAction);

    const ledger = new ScientificBudgetLedger('ecosystem', {
      water_stores: { balance: 20, capacity: 50, replenishmentRate: 1 },
      supplies: { balance: 10, capacity: 20, replenishmentRate: 1 },
    });

    const state = { moisture: 25, biomass: 40 };
    const res = reg.execute(sampleAction.id, state, 10, ledger);

    expect(res.success).toBe(true);
    expect(res.executedAtTick).toBe(10);
    expect(state.moisture).toBe(40); // 25 + 15
    expect(state.biomass).toBe(45); // 40 + 5
    expect(ledger.getBalance('water_stores')).toBe(15); // 20 - 5
    expect(ledger.getBalance('supplies')).toBe(8); // 10 - 2
  });

  it('rejects execution and performs atomic rollback on budget shortfall', () => {
    const reg = new NativeActionRegistry();
    reg.registerAction(sampleAction);

    const ledger = new ScientificBudgetLedger('ecosystem', {
      water_stores: { balance: 2, capacity: 50, replenishmentRate: 1 }, // needs 5
      supplies: { balance: 10, capacity: 20, replenishmentRate: 1 },
    });

    const state = { moisture: 25, biomass: 40 };
    const res = reg.execute(sampleAction.id, state, 10, ledger);

    expect(res.success).toBe(false);
    expect(res.reason).toContain('Insufficient budget');
    expect(state.moisture).toBe(25); // untouched
    expect(state.biomass).toBe(40); // untouched
    expect(ledger.getBalance('water_stores')).toBe(2); // untouched
  });
});

describe('StandardWorldFeatureModule G4 Capabilities Integration', () => {
  it('exposes instrument.sample and instrument.calibrate in capabilities', () => {
    const mod = new StandardWorldFeatureModule({
      worldId: 'ecosystem',
      capabilities: [],
      hazardNodes: [],
      hazardLinks: [],
      initialBudget: {
        supplies: { balance: 50, capacity: 100, replenishmentRate: 1 },
      },
      actionCosts: {},
      actionDeltas: {},
      metricKeys: ['moisture', 'biomass'],
      instruments: [
        {
          id: 'eco_sampler',
          worldId: 'ecosystem',
          name: 'Ecosystem Sampler',
          description: 'Measures moisture and biomass.',
          deviceClass: 'environmental_sampler',
          channels: [
            {
              id: 'moisture',
              name: 'Moisture',
              unit: '%',
              minValid: 0,
              maxValid: 100,
              basePrecision: 0.1,
            },
          ],
        },
      ],
    });

    const capIds = mod.capabilities.map((c) => c.id);
    expect(capIds).toContain('instrument.sample');
    expect(capIds).toContain('instrument.calibrate');

    // Validates instrument sampling
    const val = mod.validateAction(
      {
        capabilityId: 'instrument.sample',
        payload: {
          instrumentId: 'eco_sampler',
          channelId: 'moisture',
          siteId: 'site-marsh',
        },
      },
      { moisture: 45 },
    );
    expect(val.valid).toBe(true);

    // Executes instrument sampling
    const emittedEvents: any[] = [];
    const receipt = mod.applyAction(
      { moisture: 45 },
      val.action!,
      {
        tick: 15,
        emitEvent: (e) => {
          emittedEvents.push(e);
          return { id: 'evt-1' };
        },
      },
    );
    expect(receipt.status).toBe('success');
    expect(emittedEvents.length).toBe(1);
    expect(emittedEvents[0].type).toBe('ecosystem.instrument_sampled');

    // Visible state projection includes instruments and observations
    const visible = mod.projectVisibleState({ moisture: 45 }, {});
    expect(visible.instruments?.length).toBe(1);
    expect(visible.recentObservations?.length).toBe(1);
  });
});
