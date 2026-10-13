import type { ExplorationAtlas, ExplorationState } from './contracts';
import { planRoute } from './engine';
import { resupplyAvailability } from './dossier';

/**
 * Read-only triage of already VISITED, damaged installations. Never reveals
 * unvisited site identity, alters route safety, or creates expedition stocks.
 * Every recommended action must still pass the existing native command bus.
 */
export type FieldServiceAction = 'none' | 'in-transit' | 'blocked' | 'need-supplies' | 'resupply' | 'travel' | 'repair';

export interface FieldServiceTarget {
  siteId: string;
  regionId: string;
  condition: number;
  hazard: number;
  local: boolean;
  fuelCost: number;
  travelTicks: number;
}

export interface FieldServicePlan {
  action: FieldServiceAction;
  instruction: string;
  visitedDamagedSites: number;
  safelyReachableDamagedSites: number;
  blockedDamagedSites: number;
  repairSuppliesCost: 2;
  target: FieldServiceTarget | null;
}

export function planFieldService(atlas: ExplorationAtlas, exploration: ExplorationState): FieldServicePlan {
  const expedition = exploration.expedition;
  const damaged = atlas.sites.filter(site => {
    const delta = exploration.sites[site.facts.id];
    return !!delta && delta.firstVisitedTick !== null && delta.condition < 75 &&
      site.availableInteractions.includes('repair');
  });
  const feasible: FieldServiceTarget[] = [];
  for (const site of damaged) {
    const delta = exploration.sites[site.facts.id];
    // A once-visited site can become dangerous. Old visit permission must not
    // be misrepresented as safe present-time access.
    if (delta.hazard > 70) continue;
    try {
      const route = planRoute(
        atlas, expedition.regionId, site.facts.regionId, 70, expedition.fuel, exploration,
      );
      feasible.push({
        siteId:site.facts.id, regionId:site.facts.regionId,
        condition:delta.condition, hazard:delta.hazard,
        local:expedition.regionId === site.facts.regionId,
        fuelCost:route.fuel, travelTicks:Math.max(1,route.ticks),
      });
    } catch {
      // Existing route, blocked passage, hazard and fuel limits are authority.
    }
  }
  feasible.sort((left,right) =>
    Number(right.local) - Number(left.local) ||
    left.travelTicks - right.travelTicks ||
    left.condition - right.condition ||
    left.siteId.localeCompare(right.siteId, 'en'));
  // The native resupply command always draws from the FIRST visited site in
  // the expedition's current region. Do not pretend other sites can be chosen.
  const firstVisitedStock = (regionId: string) => {
    const source = atlas.sites.find(site =>
      site.facts.regionId === regionId &&
      exploration.sites[site.facts.id].firstVisitedTick !== null);
    return source ? exploration.sites[source.facts.id].resources : null;
  };
  const localStock = firstVisitedStock(expedition.regionId);
  const localSupplyTransfer = Math.min(10, localStock?.supplies ?? 0);
  const localFuelStock = localStock?.fuel ?? 0;
  const canResupplyHere = resupplyAvailability(atlas, exploration) === null;
  const enoughSuppliesAfterArrival = (regionId: string) =>
    expedition.supplies + localSupplyTransfer +
      Math.min(10, firstVisitedStock(regionId)?.supplies ?? 0) >= 2;

  const target = feasible[0] ?? null;
  const base = {
    visitedDamagedSites:damaged.length,
    safelyReachableDamagedSites:feasible.length,
    blockedDamagedSites:damaged.length-feasible.length,
    repairSuppliesCost:2 as const,
    target,
  };
  if (expedition.journey) return {
    ...base, action:'in-transit' as const,
    instruction:`Expedition in transit until tick ${expedition.journey.arrivalTick}. Advance simulation time before another service action.`,
  };
  if (!damaged.length) return {
    ...base, action:'none' as const,
    instruction:'No visited installation currently needs service below 75% condition. Discover and physically visit a site before it can be repaired.',
  };
  if (!target) {
    // Fuel may be the only obstacle. Offer an ACTUAL, finite local transfer
    // before declaring a previously visited safe destination inaccessible.
    // This is a hypothetical route check, not a state change or waived gate:
    // travel becomes available only once native resupply has debited stocks.
    const fuelCanReopenRoute = canResupplyHere && localFuelStock > 0 &&
      damaged.some(site => {
        const delta = exploration.sites[site.facts.id];
        if (delta.hazard > 70 || !enoughSuppliesAfterArrival(site.facts.regionId))
          return false;
        try {
          planRoute(atlas, expedition.regionId, site.facts.regionId,
            70, expedition.fuel + localFuelStock, exploration);
          return true;
        } catch {
          return false; // Hazardous/blocked corridors stay blocked.
        }
      });
    if (fuelCanReopenRoute) return {
      ...base, action:'resupply' as const,
      instruction:`No damaged destination is reachable with ${expedition.fuel} current fuel, but the first visited local site holds ${localFuelStock} transferable fuel. Transfer up to 10 fuel per native resupply, then recheck the real route and supplies. No travel is authorized until its full fuel bill is paid.`,
    };
    return {
      ...base, action:'blocked' as const,
      instruction:`${damaged.length} visited damaged installation(s), but none is safe to reach using the present hazard limit, open routes and finite fuel. A usable local fuel transfer is unavailable or insufficient; restore world science or find another legitimate supply source.`,
    };
  }
  if (expedition.supplies < 2) {
    if (canResupplyHere && expedition.supplies + localSupplyTransfer >= 2)
      return {
        ...base, action:'resupply' as const,
        instruction:`Repair requires 2 supplies; only ${expedition.supplies} available. Transfer the missing supplies from the first visited site in this region before dispatch.`,
      };
    // One stock transfer at each end can legitimately share the repair bill.
    // Consume origin stock first, then actually travel, then transfer the
    // remainder at a previously visited destination. Never grant stock here.
    const twoStopBridge = feasible.find(candidate =>
      !candidate.local && expedition.supplies + localSupplyTransfer +
        Math.min(10, firstVisitedStock(candidate.regionId)?.supplies ?? 0) >= 2);
    if (canResupplyHere && localSupplyTransfer > 0 && twoStopBridge)
      return {
        ...base, target:twoStopBridge, action:'resupply' as const,
        instruction:`Repair costs 2 supplies. Transfer ${localSupplyTransfer} from the first visited site here, travel the real fuel-bounded route, then collect the remaining supplies at the visited destination before repair.`,
      };
    // Travelling costs fuel, not supplies. A visited destination can itself
    // contain the finite native resupply stock required for subsequent repair.
    // Refusing such a trip strands valid service orders on the wrong side of
    // an artificial planner-only resource gate.
    const stockedDestination = feasible.find(candidate =>
      !candidate.local && expedition.supplies +
        Math.min(10, firstVisitedStock(candidate.regionId)?.supplies ?? 0) >= 2);
    if (stockedDestination) return {
      ...base, target:stockedDestination, action:'travel' as const,
      instruction:`Only ${expedition.supplies} repair supplies aboard. This already-visited destination has transferable local supplies. Travel costs ${stockedDestination.fuelCost} fuel, then resupply there before paying the 2-supply repair bill. Recheck hazard and native stocks after arrival.`,
    };
    const reason = resupplyAvailability(atlas, exploration);
    return {
      ...base, action:'need-supplies' as const,
      instruction:`Repair costs 2 supplies; only ${expedition.supplies} available. ${reason ? 'Cannot resupply here: '+reason : 'The first local stock transfer cannot pay the remaining repair cost; fuel-only transfers are not a substitute for supplies.'} No safely reachable visited destination can supply the difference after arrival.`,
    };
  }
  if (target.local) return {
    ...base, action:'repair' as const,
    instruction:`This previously visited installation is in the current region. A real repair costs 2 expedition supplies and restores up to 25 condition points.`,
  };
  return {
    ...base, action:'travel' as const,
    instruction:`Destination is previously visited and presently safe. Travel costs ${target.fuelCost} fuel and ${target.travelTicks} simulation tick(s); repair will still cost 2 supplies after arrival. Safety can change while travelling.`,
  };
}
