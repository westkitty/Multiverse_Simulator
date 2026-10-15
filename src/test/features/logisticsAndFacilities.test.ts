import { describe, expect, it } from 'vitest';
import { LogisticsNetwork } from '../../features/logisticsWeb';
import { FacilityManager } from '../../features/facilitySystem';
import { ScientificBudgetLedger } from '../../features/budgetLedger';

describe('Living Logistics Web (P004)', () => {
  it('creates depots with capacity ceilings and tracked inventories', () => {
    const net = new LogisticsNetwork('ecosystem');
    const depot = net.createDepot('site-alpha', 100, { seed_canisters: 20, water_filter_parts: 10 });

    expect(depot.siteId).toBe('site-alpha');
    expect(depot.capacity).toBe(100);
    expect(net.getDepotStock('site-alpha', 'seed_canisters')).toBe(20);
    expect(net.getDepotStock('site-alpha', 'water_filter_parts')).toBe(10);
    expect(net.getDepotFreeCapacity('site-alpha')).toBe(70);
  });

  it('rejects shipment orders when source stock or destination capacity is insufficient', () => {
    const net = new LogisticsNetwork('station');
    net.createDepot('depot-a', 50, { scrubber_cartridges: 5 });
    net.createDepot('depot-b', 10, { spare_parts: 8 });

    // Insufficient stock at source
    const order1 = net.createShipmentOrder('ord-1', 'depot-a', 'depot-b', { scrubber_cartridges: 10 });
    expect(order1.success).toBe(false);
    expect(order1.reason).toContain('Insufficient available scrubber_cartridges');

    // Insufficient capacity at destination (10 capacity - 8 stored = 2 free; requesting 4)
    const order2 = net.createShipmentOrder('ord-2', 'depot-a', 'depot-b', { scrubber_cartridges: 4 });
    expect(order2.success).toBe(false);
    expect(order2.reason).toContain('Insufficient capacity at destination depot');
  });

  it('reserves outbound and inbound inventory on valid order creation', () => {
    const net = new LogisticsNetwork('civilization');
    net.createDepot('depot-masonry', 100, { aqueduct_masonry: 40 });
    net.createDepot('depot-waterworks', 100, {});

    const order = net.createShipmentOrder('ord-100', 'depot-masonry', 'depot-waterworks', {
      aqueduct_masonry: 15,
    });
    expect(order.success).toBe(true);

    // Available stock should be reduced by reservation, while actual inventory remains until dispatch
    expect(net.getDepotStock('depot-masonry', 'aqueduct_masonry')).toBe(40);
    expect(net.getDepotAvailableStock('depot-masonry', 'aqueduct_masonry')).toBe(25);
    expect(net.getDepotFreeCapacity('depot-waterworks')).toBe(85);
  });

  it('transfers cargo into courier custody on dispatch and delivers atomically to destination', () => {
    const net = new LogisticsNetwork('megacity');
    net.createDepot('depot-grid', 100, { transformer_cores: 10 });
    net.createDepot('depot-substation', 100, {});

    net.registerCourier({
      id: 'courier-heavy-1',
      name: 'Transit Hauler 1',
      carrierType: 'field_hauler',
      capacity: 30,
      speed: 1,
      location: 'depot-grid',
      currentCargo: {},
      status: 'idle',
      condition: 100,
      fuel: 50,
    });

    const orderRes = net.createShipmentOrder('ord-500', 'depot-grid', 'depot-substation', {
      transformer_cores: 6,
    });
    expect(orderRes.success).toBe(true);

    // Dispatch courier
    const dispatch = net.dispatchOrder('ord-500', 'courier-heavy-1', 10);
    expect(dispatch.success).toBe(true);

    const courier = net.couriers.get('courier-heavy-1')!;
    expect(courier.status).toBe('in_transit');
    expect(courier.currentCargo.transformer_cores).toBe(6);

    // Source depot has parted with custody
    expect(net.getDepotStock('depot-grid', 'transformer_cores')).toBe(4);
    // Destination depot has not yet received
    expect(net.getDepotStock('depot-substation', 'transformer_cores')).toBe(0);

    // Advance transit ticks until arrival
    let ticks = 0;
    while (orderRes.order!.status === 'in_transit' && ticks < 10) {
      net.stepNetwork(10 + ticks);
      ticks++;
    }

    expect(orderRes.order!.status).toBe('delivered');
    expect(orderRes.order!.arrivalTick).toBeDefined();
    expect(courier.status).toBe('idle');
    expect(courier.location).toBe('depot-substation');
    expect(courier.currentCargo.transformer_cores).toBeUndefined();
    expect(net.getDepotStock('depot-substation', 'transformer_cores')).toBe(6);

    // Total inventory conservation check
    const conservation = net.verifyInventoryConservation({ transformer_cores: 10 });
    expect(conservation.conserved).toBe(true);
  });

  it('aborts shipment and returns cargo safely to source when route is blocked', () => {
    const net = new LogisticsNetwork('industrial');
    net.createDepot('factory-depot', 80, { standardized_pallets: 20 });
    net.createDepot('buffer-depot', 80, {});

    net.registerCourier({
      id: 'drone-express',
      name: 'Logistics Drone',
      carrierType: 'sky_drone',
      capacity: 15,
      speed: 1,
      location: 'factory-depot',
      currentCargo: {},
      status: 'idle',
      condition: 100,
      fuel: 40,
    });

    const orderRes = net.createShipmentOrder('ord-route-block', 'factory-depot', 'buffer-depot', {
      standardized_pallets: 10,
    });
    expect(orderRes.success).toBe(true);

    net.dispatchOrder('ord-route-block', 'drone-express', 1);
    expect(net.getDepotStock('factory-depot', 'standardized_pallets')).toBe(10);

    // Step with blocked edge
    const stepRes = net.stepNetwork(2, { blockedEdges: [['factory-depot', 'buffer-depot']] });
    expect(stepRes.abortedOrders).toContain('ord-route-block');

    const order = net.orders.get('ord-route-block')!;
    expect(order.status).toBe('aborted');

    // Cargo returned to source depot
    expect(net.getDepotStock('factory-depot', 'standardized_pallets')).toBe(20);
    expect(net.getDepotStock('buffer-depot', 'standardized_pallets')).toBe(0);

    const conservation = net.verifyInventoryConservation({ standardized_pallets: 20 });
    expect(conservation.conserved).toBe(true);
  });

  it('proves exact inventory conservation across multi-depot shipping, production, and consumption loops', () => {
    const net = new LogisticsNetwork('ocean');
    net.createDepot('reef-dock', 100, { catalyst_cells: 50 });
    net.createDepot('oxygen-lab', 100, { catalyst_cells: 10 });

    net.registerCourier({
      id: 'sub-crawler-1',
      name: 'Deep Crawler',
      carrierType: 'sub_crawler',
      capacity: 30,
      speed: 1,
      location: 'reef-dock',
      currentCargo: {},
      status: 'idle',
      condition: 100,
      fuel: 100,
    });

    const initial = { catalyst_cells: 60 };

    // 1. Dispatch 15 units
    net.createShipmentOrder('ord-ocean-1', 'reef-dock', 'oxygen-lab', { catalyst_cells: 15 });
    net.dispatchOrder('ord-ocean-1', 'sub-crawler-1', 1);

    // Verify conservation mid-transit (35 in dock, 15 in courier, 10 in lab = 60 total)
    expect(net.verifyInventoryConservation(initial).conserved).toBe(true);

    // 2. Deliver shipment
    while (net.orders.get('ord-ocean-1')!.status === 'in_transit') {
      net.stepNetwork(2);
    }
    expect(net.verifyInventoryConservation(initial).conserved).toBe(true);

    // 3. Local production of 20 units at reef-dock
    net.recordProduction('reef-dock', 'catalyst_cells', 20);
    expect(net.verifyInventoryConservation(initial).conserved).toBe(true);

    // 4. Local consumption of 8 units at oxygen-lab
    net.recordConsumption('oxygen-lab', 'catalyst_cells', 8);
    expect(net.verifyInventoryConservation(initial).conserved).toBe(true);

    // Discrepancy report check
    const report = net.verifyInventoryConservation(initial);
    expect(report.conserved).toBe(true);
    expect(Object.keys(report.discrepancies).length).toBe(0);
  });

  it('performs local resupply with strict finite deductions and zero phantom generation', () => {
    const net = new LogisticsNetwork('hollow-deep');
    net.createDepot('vent-hub', 50, { rock_bolts: 12 });

    const res1 = net.localResupply('vent-hub', 'rock_bolts', 5);
    expect(res1.success).toBe(true);
    expect(res1.amountSupplied).toBe(5);
    expect(net.getDepotStock('vent-hub', 'rock_bolts')).toBe(7);

    // Attempting to draw more than available stock is clamped to remaining stock
    const res2 = net.localResupply('vent-hub', 'rock_bolts', 20);
    expect(res2.success).toBe(true);
    expect(res2.amountSupplied).toBe(7);
    expect(net.getDepotStock('vent-hub', 'rock_bolts')).toBe(0);

    // Attempting to draw from empty depot fails
    const res3 = net.localResupply('vent-hub', 'rock_bolts', 5);
    expect(res3.success).toBe(false);
    expect(res3.amountSupplied).toBe(0);
  });
});

describe('Build the Things That Save the World (P005)', () => {
  const wetlandPumpDef = {
    typeId: 'wetland_pump',
    worldId: 'ecosystem',
    name: 'Wetland Hydration Pump',
    description: 'Restores hydraulic gradient across dried wetland sectors.',
    buildMaterialsCost: [
      { resource: 'water_filter_parts', amount: 4 },
      { resource: 'energy', amount: 5 },
    ],
    buildTicks: 4,
    upkeepCost: [{ resource: 'energy', amount: 1 }],
    benefitMetric: 'plantBiomass',
    benefitDeltaPerTick: 2.5,
  };

  it('registers facility definitions and validates placement constraints', () => {
    const fm = new FacilityManager('ecosystem');
    fm.registerDefinition(wetlandPumpDef);

    const ledger = new ScientificBudgetLedger('ecosystem', {
      energy: { balance: 10, capacity: 20, replenishmentRate: 0 },
      water_filter_parts: {
        balance: 10,
        capacity: 20,
        replenishmentRate: 0,
      },
    });

    const buildRes = fm.buildFacility('poi-wetland-1', 'zone-a', 'wetland_pump', 1, {
      budgetLedger: ledger,
    });
    expect(buildRes.success).toBe(true);
    expect(buildRes.facility?.buildState).toBe('under_construction');
    expect(buildRes.facility?.constructionProgress).toBe(0);
    expect(buildRes.facility?.constructionTicksRemaining).toBe(4);

    // Second build on occupied site must fail
    const buildConflict = fm.buildFacility('poi-wetland-1', 'zone-a', 'wetland_pump', 2, {
      budgetLedger: ledger,
    });
    expect(buildConflict.success).toBe(false);
    expect(buildConflict.reason).toContain('already occupied');
  });

  it('rejects construction when build materials are insufficient', () => {
    const fm = new FacilityManager('ecosystem');
    fm.registerDefinition(wetlandPumpDef);

    const ledger = new ScientificBudgetLedger('ecosystem', {
      energy: { balance: 2, capacity: 20, replenishmentRate: 0 },
      water_filter_parts: {
        balance: 1,
        capacity: 20,
        replenishmentRate: 0,
      },
    });

    const buildRes = fm.buildFacility('poi-wetland-shortage', 'zone-a', 'wetland_pump', 1, {
      budgetLedger: ledger,
    });
    expect(buildRes.success).toBe(false);
    expect(buildRes.reason).toContain('Insufficient');
    expect(fm.getFacilityBySite('poi-wetland-shortage')).toBeUndefined();
  });

  it('progresses construction across native ticks and activates facility upon completion', () => {
    const fm = new FacilityManager('ecosystem');
    fm.registerDefinition(wetlandPumpDef);

    const ledger = new ScientificBudgetLedger('ecosystem', {
      energy: { balance: 20, capacity: 50, replenishmentRate: 0 },
      water_filter_parts: {
        balance: 10,
        capacity: 20,
        replenishmentRate: 0,
      },
    });

    fm.buildFacility('site-pump', 'zone-refuge', 'wetland_pump', 10, { budgetLedger: ledger });
    const facility = fm.getFacilityBySite('site-pump')!;

    // Step 1: progress 25%
    fm.stepFacilities(11, { budgetLedger: ledger });
    expect(facility.buildState).toBe('under_construction');
    expect(facility.constructionProgress).toBe(25);

    // Step 2 & 3: progress 50% and 75%
    fm.stepFacilities(12, { budgetLedger: ledger });
    fm.stepFacilities(13, { budgetLedger: ledger });
    expect(facility.constructionProgress).toBe(75);

    // Step 4: completion
    const step4 = fm.stepFacilities(14, { budgetLedger: ledger });
    expect(step4.completedFacilities).toContain(facility.id);
    expect(facility.buildState).toBe('active');
    expect(facility.completedTick).toBe(14);
  });

  it('delivers domain metric benefit while active and debits periodic upkeep', () => {
    const fm = new FacilityManager('ecosystem');
    fm.registerDefinition(wetlandPumpDef);

    const ledger = new ScientificBudgetLedger('ecosystem', {
      energy: { balance: 30, capacity: 50, replenishmentRate: 0 },
      water_filter_parts: {
        balance: 10,
        capacity: 20,
        replenishmentRate: 0,
      },
    });

    fm.buildFacility('site-active-pump', 'zone-refuge', 'wetland_pump', 1, { budgetLedger: ledger });
    // Fast forward construction
    for (let i = 0; i < 4; i++) {
      fm.stepFacilities(2 + i, { budgetLedger: ledger });
    }

    const facility = fm.getFacilityBySite('site-active-pump')!;
    expect(facility.buildState).toBe('active');

    let metricValue = 100;
    const applyBenefit = (_metric: string, delta: number) => {
      metricValue += delta;
    };

    // Active tick 1
    const energyBefore = ledger.getBalance('energy');
    const stepRes = fm.stepFacilities(10, { budgetLedger: ledger, applyBenefit });

    expect(stepRes.benefitsApplied.length).toBe(1);
    expect(stepRes.benefitsApplied[0].delta).toBe(2.5);
    expect(metricValue).toBe(102.5);
    // Upkeep debited
    expect(ledger.getBalance('energy')).toBe(energyBefore - 1);
  });

  it('degrades facility effectiveness when upkeep cannot be paid and recovers upon maintenance', () => {
    const fm = new FacilityManager('ecosystem');
    fm.registerDefinition(wetlandPumpDef);

    // Zero energy left for upkeep
    const ledger = new ScientificBudgetLedger('ecosystem', {
      energy: { balance: 5, capacity: 50, replenishmentRate: 0 },
      water_filter_parts: {
        balance: 10,
        capacity: 20,
        replenishmentRate: 0,
      },
    });

    fm.buildFacility('site-degrade-pump', 'zone-refuge', 'wetland_pump', 1, { budgetLedger: ledger });
    for (let i = 0; i < 4; i++) {
      fm.stepFacilities(2 + i, { budgetLedger: ledger });
    }

    const facility = fm.getFacilityBySite('site-degrade-pump')!;
    expect(facility.buildState).toBe('active');
    expect(ledger.getBalance('energy')).toBe(0); // All 5 energy consumed by build

    // Run ticks without upkeep: maintenance degrades by 5 each tick
    for (let t = 0; t < 16; t++) {
      fm.stepFacilities(10 + t, { budgetLedger: ledger });
    }

    expect(facility.maintenanceState).toBeLessThan(25);
    expect(facility.buildState).toBe('degraded');
    expect(facility.operatingRate).toBeLessThan(0.3);

    // Resupply energy budget
    ledger.applyTransaction('resupply', [], [{ resource: 'energy', amount: 20, source: 'resupply' }], 30);

    // Perform maintenance verb
    const maintainRes = fm.maintainFacility('site-degrade-pump', 31, { budgetLedger: ledger });
    expect(maintainRes.success).toBe(true);
    expect(facility.buildState).toBe('active');
    expect(facility.maintenanceState).toBe(100);
    expect(facility.operatingRate).toBe(1.0);
  });

  it('retires facility, reclaims partial salvage materials, and frees socket for new construction', () => {
    const fm = new FacilityManager('ecosystem');
    fm.registerDefinition(wetlandPumpDef);

    const net = new LogisticsNetwork('ecosystem');
    net.createDepot('site-retire-pump', 100, {
      water_filter_parts: 10,
      energy: 10,
    });

    fm.buildFacility('site-retire-pump', 'zone-refuge', 'wetland_pump', 1, {
      logisticsNetwork: net,
    });

    const retireRes = fm.retireFacility('site-retire-pump', { logisticsNetwork: net });
    expect(retireRes.success).toBe(true);
    // 50% salvage of 4 water_filter_parts = 2 reclaimed
    expect(retireRes.salvageRecovered.water_filter_parts).toBe(2);

    // Socket is now free for new construction
    expect(fm.getFacilityBySite('site-retire-pump')).toBeUndefined();
    const rebuild = fm.buildFacility('site-retire-pump', 'zone-refuge', 'wetland_pump', 10, {
      logisticsNetwork: net,
    });
    expect(rebuild.success).toBe(true);
  });
});
