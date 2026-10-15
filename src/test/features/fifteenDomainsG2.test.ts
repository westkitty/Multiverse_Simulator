import { describe, expect, it } from 'vitest';
import { ALL_DOMAIN_FEATURE_MODULES } from '../../features/domainModules';

describe('Omniverse III Fifteen-World G2 Integration (P004 Logistics & P005 Facilities)', () => {
  it('verifies all 15 universes are registered with logistics networks and facility managers', () => {
    expect(ALL_DOMAIN_FEATURE_MODULES).toHaveLength(15);

    for (const mod of ALL_DOMAIN_FEATURE_MODULES) {
      expect(mod.rulesVersion).toBe(1);
      expect(mod.logisticsNetwork).toBeDefined();
      expect(mod.facilityManager).toBeDefined();
      expect(mod.logisticsNetwork!.worldId).toBe(mod.worldId);
      expect(mod.facilityManager!.worldId).toBe(mod.worldId);
    }
  });

  const EXPECTED_FACILITIES: Record<string, string[]> = {
    ecosystem: ['wetland_pump', 'seed_nursery'],
    station: ['life_support_scrubber', 'pressure_bulkhead'],
    civilization: ['waterworks', 'river_crossing'],
    atmosphere: ['storm_observation_array', 'rain_collector'],
    ocean: ['oxygenation_module', 'reef_nursery'],
    celestial: ['transit_beacon', 'radiation_shield'],
    megacity: ['substation', 'water_pump'],
    industrial: ['freight_depot', 'production_buffer'],
    geology: ['fault_brace', 'seismic_sensor_array'],
    'wild-meridian': ['migration_refuge', 'waterway_restoration'],
    'hollow-deep': ['gas_vent', 'aquifer_pump'],
    'timeworn-empire': ['strata_shelter', 'field_conservation_workshop'],
    'terraforming-frontier': ['biosphere_dome', 'atmosphere_regulator'],
    'machine-wilderness': ['power_relay', 'maintenance_swarm_hub'],
    'signal-expanse': ['signal_relay', 'interferometer'],
  };

  for (const mod of ALL_DOMAIN_FEATURE_MODULES) {
    const worldId = mod.worldId;
    const expectedFacs = EXPECTED_FACILITIES[worldId]!;

    describe(`World: ${worldId}`, () => {
      it(`registers 2 native facility definitions: ${expectedFacs.join(', ')}`, () => {
        const fm = mod.facilityManager!;
        for (const facTypeId of expectedFacs) {
          const def = fm.definitions.get(facTypeId);
          expect(def, `Missing facility definition for ${facTypeId} on ${worldId}`).toBeDefined();
          expect(def!.worldId).toBe(worldId);
          expect(def!.buildMaterialsCost.length).toBeGreaterThan(0);
          expect(def!.buildTicks).toBeGreaterThanOrEqual(1);
          expect(def!.upkeepCost.length).toBeGreaterThan(0);
          expect(def!.benefitDeltaPerTick).toBeGreaterThan(0);
        }
      });

      it('initializes at least 2 functional depots with non-empty inventories', () => {
        const net = mod.logisticsNetwork!;
        expect(net.depots.size).toBeGreaterThanOrEqual(2);
        for (const depot of net.depots.values()) {
          expect(depot.capacity).toBeGreaterThanOrEqual(50);
          const totalStock = Object.values(depot.inventory).reduce((a, b) => a + b, 0);
          expect(totalStock).toBeGreaterThan(0);
        }
      });

      it('registers at least 1 courier with fuel and non-zero cargo capacity', () => {
        const net = mod.logisticsNetwork!;
        expect(net.couriers.size).toBeGreaterThanOrEqual(1);
        for (const courier of net.couriers.values()) {
          expect(courier.capacity).toBeGreaterThan(0);
          expect(courier.fuel).toBeGreaterThan(0);
          expect(courier.condition).toBe(100);
          expect(courier.status).toBe('idle');
        }
      });

      it('builds, constructs, and operates native facilities with domain benefits and upkeep', () => {
        const fm = mod.facilityManager!;
        const [primaryFac, secondaryFac] = expectedFacs;

        // Build primary facility at site-1
        const build1 = fm.buildFacility('test-site-1', 'region-test', primaryFac, 1, {
          budgetLedger: mod.budgetLedger,
          logisticsNetwork: mod.logisticsNetwork,
        });
        expect(build1.success, build1.reason).toBe(true);
        expect(build1.facility?.buildState).toBe('under_construction');

        // Cannot build on occupied site
        const conflict = fm.buildFacility('test-site-1', 'region-test', secondaryFac, 2, {
          budgetLedger: mod.budgetLedger,
          logisticsNetwork: mod.logisticsNetwork,
        });
        expect(conflict.success).toBe(false);

        // Advance ticks to finish construction
        const def1 = fm.definitions.get(primaryFac)!;
        for (let t = 0; t < def1.buildTicks; t++) {
          fm.stepFacilities(2 + t, {
            budgetLedger: mod.budgetLedger,
            logisticsNetwork: mod.logisticsNetwork,
          });
        }
        expect(build1.facility?.buildState).toBe('active');

        // Verify domain benefit application during active step
        let benefitDelivered = 0;
        const stepRes = fm.stepFacilities(10, {
          budgetLedger: mod.budgetLedger,
          logisticsNetwork: mod.logisticsNetwork,
          applyBenefit: (_metric, delta) => {
            benefitDelivered += delta;
          },
        });
        expect(stepRes.benefitsApplied.length).toBeGreaterThanOrEqual(1);
        expect(benefitDelivered).toBeGreaterThan(0);

        // Retire facility and reclaim salvage
        const retire = fm.retireFacility('test-site-1', {
          logisticsNetwork: mod.logisticsNetwork,
        });
        expect(retire.success).toBe(true);
        expect(fm.getFacilityBySite('test-site-1')).toBeUndefined();
      });

      it('executes courier shipment between depots and proves exact inventory conservation', () => {
        const net = mod.logisticsNetwork!;
        const depots = Array.from(net.depots.values());
        const [depotA, depotB] = depots;
        const courier = Array.from(net.couriers.values())[0];

        // Ensure courier is at depotA
        courier.location = depotA.siteId;
        courier.status = 'idle';
        courier.currentCargo = {};

        // Find an available resource at depotA
        const resource = Object.keys(depotA.inventory)[0];
        const stockA = depotA.inventory[resource];
        const amountToShip = Math.min(stockA, 3);

        const initialTotal = { ...depotA.inventory };
        for (const [k, v] of Object.entries(depotB.inventory)) {
          initialTotal[k] = (initialTotal[k] ?? 0) + v;
        }

        const orderId = `test-order-${worldId}`;
        const orderRes = net.createShipmentOrder(
          orderId,
          depotA.siteId,
          depotB.siteId,
          { [resource]: amountToShip },
        );
        expect(orderRes.success, orderRes.reason).toBe(true);

        const dispatch = net.dispatchOrder(orderId, courier.id, 1);
        expect(dispatch.success, dispatch.reason).toBe(true);

        // Advance transit until delivered
        while (orderRes.order!.status === 'in_transit') {
          net.stepNetwork(2);
        }
        expect(orderRes.order!.status).toBe('delivered');
        expect(net.getDepotStock(depotB.siteId, resource)).toBeGreaterThanOrEqual(amountToShip);

        // Strict conservation report
        const report = net.verifyInventoryConservation(initialTotal);
        expect(report.conserved).toBe(true);
      });

      it('performs local resupply with finite deduction and zero phantom replenishment', () => {
        const net = mod.logisticsNetwork!;
        const depot = Array.from(net.depots.values())[0];
        const resource = Object.keys(depot.inventory)[0];
        const before = depot.inventory[resource];

        const resupply = net.localResupply(depot.siteId, resource, 2);
        expect(resupply.success).toBe(true);
        expect(resupply.amountSupplied).toBe(2);
        expect(net.getDepotStock(depot.siteId, resource)).toBe(before - 2);
      });
    });
  }
});
