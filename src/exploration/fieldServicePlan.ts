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
  if (!target) return {
    ...base, action:'blocked' as const,
    instruction:`${damaged.length} visited damaged installation(s), but none is safe to reach using the present hazard limit, open routes and fuel. Restore world science or replenish fuel before travel.`,
  };
  if (expedition.supplies < 2) {
    // The native resupply command transfers up to ten supplies AND up to ten
    // fuel from the FIRST previously visited site in the current region.
    // A fuel-only stock transfer must not be advertised as supplying a repair.
    const local = atlas.sites.find(site =>
      site.facts.regionId === expedition.regionId &&
      exploration.sites[site.facts.id].firstVisitedTick !== null);
    const transferable = local
      ? Math.min(10, exploration.sites[local.facts.id].resources.supplies ?? 0) : 0;
    const reason = resupplyAvailability(atlas, exploration);
    return reason || expedition.supplies + transferable < 2 ? {
      ...base, action:'need-supplies' as const,
      instruction:`Repair costs 2 expedition supplies; only ${expedition.supplies} available. ${reason ? 'Cannot resupply here: '+reason : 'This local stock transfer cannot supply the remaining repair cost; fuel-only transfers are not a substitute for supplies.'}`,
    } : {
      ...base, action:'resupply' as const,
      instruction:`Repair costs 2 expedition supplies; only ${expedition.supplies} available. Transfer finite stocks from the visited local site before dispatch.`,
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
