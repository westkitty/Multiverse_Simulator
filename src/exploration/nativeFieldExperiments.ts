import type { MetricDefinition, QuickInterventionDescriptor } from '../core/contracts';
import type { ExplorationAtlas, ExplorationState } from './contracts';
import { planRoute } from './engine';

/**
 * Hand-curated pointers to existing authoritative simulation controls. This
 * module supplies no new commands, outcomes, sites, lore, or persistent state.
 * "Frontier" policy is shared plumbing, not six independent new mechanics.
 */
export const NATIVE_FIELD_PLANS: Record<string, {
  interventionIds: readonly [string, string];
  metricIds: readonly [string, string, string];
}> = {
  ecosystem: {
    interventionIds: ['eco-boost-fertility', 'eco-rewild-canopy-corridors'],
    metricIds: ['meanSoilNutrients', 'totalPlantBiomass', 'meanMoisture'],
  },
  station: {
    interventionIds: ['stn-emergency-resupply', 'stn-prioritize-lifesupport'],
    metricIds: ['o2ReserveMoles', 'meanPressureKpa', 'meanCrewHealth'],
  },
  civilization: {
    interventionIds: ['civ-build-water', 'civ-expand-food'],
    metricIds: ['meanWaterworksLevel', 'totalWaterStock', 'totalFoodStock'],
  },
  atmosphere: {
    interventionIds: ['atm-solar-dimming', 'atm-inject-moisture-west'],
    metricIds: ['meanTemperatureC', 'meanHumidityPct', 'meanPressureHpa'],
  },
  ocean: {
    interventionIds: ['ocn-nutrient-upwelling-pulse', 'ocn-oxygenate-dead-zones'],
    metricIds: ['meanSurfaceNutrientsUmol', 'meanSurfaceOxygenMgL', 'meanCarbonatePh'],
  },
  celestial: {
    interventionIds: ['cel-greenhouse-seeding', 'cel-circularize-orbits'],
    metricIds: ['meanHabitabilityIndex', 'meanTerrestrialTempK', 'meanEccentricity'],
  },
  megacity: {
    interventionIds: ['cty-build-social-housing', 'cty-clean-air-scrubbers'],
    metricIds: ['totalHousingCapacityK', 'meanPollutionAqi', 'cityLivabilityIndex'],
  },
  industrial: {
    interventionIds: ['ind-expand-extraction', 'ind-expedite-airlift'],
    metricIds: ['extractionOutputRate', 'totalRawOreStock', 'unfulfilledDemandBacklog'],
  },
  geology: {
    interventionIds: ['geo-vent-geothermal-magma', 'geo-deploy-sensor-array'],
    metricIds: ['meanMagmaPressureMpa', 'meanTectonicStressMpa', 'monitoredCellsPct'],
  },
  'wild-meridian': {
    interventionIds: ['conserve', 'restore'],
    metricIds: ['water', 'vegetation', 'wildlife'],
  },
  'hollow-deep': {
    interventionIds: ['conserve', 'restore'],
    metricIds: ['water', 'gas', 'stress'],
  },
  'timeworn-empire': {
    interventionIds: ['conserve', 'restore'],
    metricIds: ['burial', 'erosion', 'exposure'],
  },
  'terraforming-frontier': {
    interventionIds: ['conserve', 'restore'],
    metricIds: ['pressure', 'soil', 'oxygen'],
  },
  'machine-wilderness': {
    interventionIds: ['conserve', 'restore'],
    metricIds: ['power', 'wear', 'backlog'],
  },
  'signal-expanse': {
    interventionIds: ['conserve', 'restore'],
    metricIds: ['signal', 'noise', 'coverage'],
  },
};

export function fieldInterventions(
  worldId: string,
  available: readonly QuickInterventionDescriptor[],
): QuickInterventionDescriptor[] {
  const plan = NATIVE_FIELD_PLANS[worldId];
  if (!plan) return [];
  // IDs must resolve against the actual plugin. Never fabricate a command.
  return plan.interventionIds.flatMap(id => {
    const intervention = available.find(item => item.id === id);
    return intervention ? [intervention] : [];
  });
}

/**
 * Exact existing restorative actions proven in the 30-tick native-access lab.
 * These are not new effects, currencies, access overrides or instant POI repairs.
 * Civilization v2 has a separate versioned housing fix; its old Jubilee command
 * cannot provide durable emergency access in legacy v1.
 */
export const FIELD_EMERGENCY_RECOVERY_IDS: Readonly<Record<string,string>> = {
  industrial: 'ind-repair-all-facilities',
  megacity: 'cty-infrastructure-overhaul',
  geology: 'geo-emergency-reconstruction',
};

export function fieldEmergencyRecovery(
  worldId: string,
  available: readonly QuickInterventionDescriptor[],
): QuickInterventionDescriptor | null {
  const id = FIELD_EMERGENCY_RECOVERY_IDS[worldId];
  if (!id) return null;
  // Fail closed if a native plugin no longer advertises this specific command.
  const found = available.find(item => item.id === id && item.category === 'restoration');
  return found ?? null;
}

export interface FieldAccessStatus {
  totalSites: number;
  safelyReachableSites: number;
  unsafeDestinations: number;
  routeOrFuelBarriers: number;
}

/**
 * Read-only current reality. Count only truly fuel-bounded native Atlas routes,
 * excluding hazardous targets; no routing rules, safety gates or world state
 * are modified by this diagnostic.
 */
export function fieldAccessStatus(
  atlas: ExplorationAtlas,
  exploration: ExplorationState,
): FieldAccessStatus {
  let safelyReachableSites = 0, unsafeDestinations = 0, routeOrFuelBarriers = 0;
  for (const site of atlas.sites) {
    const delta = exploration.sites[site.facts.id];
    if (!delta || delta.hazard > 70) {
      unsafeDestinations++;
      continue;
    }
    try {
      planRoute(atlas, exploration.expedition.regionId, site.facts.regionId,
        70, exploration.expedition.fuel, exploration);
      safelyReachableSites++;
    } catch {
      routeOrFuelBarriers++;
    }
  }
  return {
    totalSites: atlas.sites.length,
    safelyReachableSites,
    unsafeDestinations,
    routeOrFuelBarriers,
  };
}

export interface NativeFieldGauge {
  id: string;
  label: string;
  unit: string;
  value: number;
  delta: number | null;
}

/** Display measured plugin metrics only. A before/after change is not a
 * controlled causal estimate: autonomous systems may also have advanced. */
export function fieldTelemetry(
  worldId: string,
  definitions: readonly MetricDefinition[],
  values: Readonly<Record<string, number>>,
  before: Readonly<Record<string, number>> | null = null,
): NativeFieldGauge[] {
  const plan = NATIVE_FIELD_PLANS[worldId];
  if (!plan) return [];
  return plan.metricIds.flatMap(id => {
    const definition = definitions.find(item => item.id === id);
    const current = values[id];
    if (!definition || !Number.isFinite(current)) return [];
    const previous = before?.[id];
    const delta = previous !== undefined && Number.isFinite(previous)
      ? Math.round((current - previous) * 1_000_000) / 1_000_000 : null;
    return [{ id, label: definition.label, unit: definition.unit, value: current, delta }];
  });
}
