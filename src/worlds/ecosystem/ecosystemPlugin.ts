import { z } from 'zod';
import {
  clampDet,
  DeterministicRng,
  EntityInspection,
  RenderConnectionVisual,
  RenderEntityVisual,
  RenderFrameData,
  RenderZoneVisual,
  roundDet,
  RunId,
  SimulationCommand,
  Tick,
} from '../../core/contracts';
import { defineWorldPlugin } from '../../core/pdk';

export interface EcosystemConfig extends Record<string, unknown> {
  initialHerbivores: number;
  initialPredators: number;
  resourceAbundance: number; // 0.3 .. 2.0
  reproductionRate: number; // 0.2 .. 2.0
  metabolicDemand: number; // 0.4 .. 2.0
  predatorPressure: number; // 0.3 .. 2.0
  environmentalRegeneration: number; // 0.2 .. 2.0
  waterAvailability: number; // 0.15 .. 1.5
}

export interface HabitatZone {
  id: string;
  label: string;
  gridX: number;
  gridZ: number;
  centerX: number;
  centerZ: number;
  elevation: number;
  moisture: number; // 0..100
  soilNutrients: number; // 0..100
  plantBiomass: number; // 0..160
  carryingCapacity: number;
}

export interface OrganismEntity {
  id: string;
  species: 'herbivore' | 'predator';
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  vx: number;
  vz: number;
  energy: number;
  hydration: number;
  age: number;
  maxAge: number;
  offspringCount: number;
  lastAction: 'foraging' | 'hunting' | 'fleeing' | 'reproducing' | 'wandering';
}

export interface EcosystemState {
  nextOrganismId: number;
  zones: HabitatZone[];
  organisms: OrganismEntity[];
  droughtTicksRemaining: number;
  droughtSeverity: number;
  cumulativeBirths: number;
  cumulativeDeaths: number;
  deathsByStarvation: number;
  deathsByPredation: number;
  deathsByDehydration: number;
  deathsByOldAge: number;
  lastDroughtEventId: string | null;
  lastShortageEventId: string | null;
  lastCascadeAlertTick: number;
}

const ecosystemConfigSchema = z.object({
  initialHerbivores: z.number().int().min(0).max(250),
  initialPredators: z.number().int().min(0).max(100),
  resourceAbundance: z.number().min(0.2).max(2.5),
  reproductionRate: z.number().min(0.1).max(2.5),
  metabolicDemand: z.number().min(0.3).max(2.5),
  predatorPressure: z.number().min(0.2).max(2.5),
  environmentalRegeneration: z.number().min(0.1).max(2.5),
  waterAvailability: z.number().min(0.1).max(2.0),
});

const ZONE_LABELS = [
  'North-West Basin',
  'Northern Marsh',
  'Highland Creek',
  'North-East Ridge',
  'Western Meadow',
  'Central Oasis A',
  'Central Oasis B',
  'Eastern Steppe',
  'Silt Floodplain',
  'Heartland Grove',
  'Sunlit Savanna',
  'Granite Foothills',
  'South-West Fen',
  'Southern Valley',
  'Timberline Glade',
  'South-East Delta',
];

function findZoneForCoord(zones: HabitatZone[], x: number, z: number): HabitatZone {
  const gx = clampDet(Math.floor(((x + 30) / 60) * 4), 0, 3);
  const gz = clampDet(Math.floor(((z + 30) / 60) * 4), 0, 3);
  const idx = gz * 4 + gx;
  return zones[idx] ?? zones[0];
}

function spawnOrganism(
  state: EcosystemState,
  species: 'herbivore' | 'predator',
  rng: DeterministicRng,
  nearX?: number,
  nearZ?: number,
  initialEnergy?: number,
): OrganismEntity {
  const stream = rng.stream('spawn');
  const id = `org-${state.nextOrganismId++}`;
  const x = clampDet(
    nearX !== undefined ? nearX + stream.nextRange(-3.5, 3.5) : stream.nextRange(-26, 26),
    -28,
    28,
  );
  const z = clampDet(
    nearZ !== undefined ? nearZ + stream.nextRange(-3.5, 3.5) : stream.nextRange(-26, 26),
    -28,
    28,
  );
  const angle = stream.nextRange(0, Math.PI * 2);
  const speed = species === 'predator' ? 1.4 : 1.05;

  const org: OrganismEntity = {
    id,
    species,
    x: roundDet(x, 3),
    z: roundDet(z, 3),
    prevX: roundDet(x, 3),
    prevZ: roundDet(z, 3),
    vx: roundDet(Math.cos(angle) * speed, 3),
    vz: roundDet(Math.sin(angle) * speed, 3),
    energy: roundDet(initialEnergy ?? (species === 'predator' ? 78 : 68), 2),
    hydration: roundDet(stream.nextRange(72, 96), 2),
    age: stream.nextInt(1, 14),
    maxAge: species === 'predator' ? stream.nextInt(95, 135) : stream.nextInt(75, 115),
    offspringCount: 0,
    lastAction: 'wandering',
  };
  state.organisms.push(org);
  return org;
}

export const ecosystemPlugin = defineWorldPlugin<EcosystemConfig, EcosystemState>({
  id: 'ecosystem',
  name: 'World A — Living Ecosystem',
  subtitle: 'Trophic Biosphere, Spatial Foraging & Nutrient Cycling',
  version: '1.0.0',
  schemaVersion: 1,
  accentColor: '#00e676',
  description:
    'Spatial ecological laboratory modeling primary flora biomass, soil nutrient cycling, moisture dynamics, herbivore grazing, and apex predator hunting.',
  physicalModelDocumentation: [
    'Spatial 4x4 biome grid (16 habitat zones across a 60x60m basin) tracking soil moisture, mineral nutrients, and renewable flora biomass.',
    'Logistic primary production driven by moisture, soil nutrients, and environmentalRegeneration rate.',
    'Individual organism agents (Herbivores & Predators) with metabolic energy expenditure, hydration decay, perception-driven steering, grazing/predation, reproduction energy transfer, and decomposition back into soil nutrients.',
  ],
  simplifiedMechanicsNote:
    'Organisms use bounded spatial perception rules (nearest threat avoidance and highest local patch gradient) rather than neural-network policies, guaranteeing transparent causal attribution.',
  configSchema: ecosystemConfigSchema,
  defaultConfig: {
    initialHerbivores: 38,
    initialPredators: 7,
    resourceAbundance: 1.0,
    reproductionRate: 1.0,
    metabolicDemand: 1.0,
    predatorPressure: 1.0,
    environmentalRegeneration: 1.0,
    waterAvailability: 1.0,
  },
  scenarios: [
    {
      id: 'eco-trophic-cascade',
      name: 'Trophic Cascade & Overgrazing Crisis',
      subtitle: 'Apex Predator Absence -> Flora Collapse',
      description:
        'Begins with abundant herbivores and zero apex predators. Unchecked herbivore growth strips primary flora biomass, triggering an overgrazing famine unless predators are introduced or fertility is managed.',
      hypothesis:
        'Introducing a controlled apex predator cohort before carrying capacity is breached stabilizes primary flora biomass and prevents total herbivore starvation.',
      seed: 70421,
      config: {
        initialHerbivores: 52,
        initialPredators: 0,
        resourceAbundance: 0.95,
        reproductionRate: 1.25,
        metabolicDemand: 1.0,
        predatorPressure: 1.0,
        environmentalRegeneration: 0.85,
        waterAvailability: 1.0,
      },
    },
    {
      id: 'eco-balanced-savanna',
      name: 'Equilibrium Basin Observatory',
      subtitle: 'Three-Tier Trophic Oscillation',
      description:
        'A balanced biosphere with producers, 38 herbivores, and 7 apex predators exhibiting natural Lotka-Volterra style population oscillations across 16 moisture zones.',
      hypothesis:
        'Trophic coupling maintains ecosystem health index above 65% unless perturbed by an external hydrological drought.',
      seed: 11890,
      config: {
        initialHerbivores: 38,
        initialPredators: 7,
        resourceAbundance: 1.1,
        reproductionRate: 1.0,
        metabolicDemand: 0.95,
        predatorPressure: 1.0,
        environmentalRegeneration: 1.05,
        waterAvailability: 1.05,
      },
    },
    {
      id: 'eco-arid-drought-shock',
      name: 'Hydrological Drought Stress Test',
      subtitle: 'Scheduled Tick-12 Megadrought',
      description:
        'A thriving ecosystem subjected to a severe hydrological drought at Tick 12, testing oasis migration and species resilience.',
      hypothesis:
        'Restoring water availability or reducing metabolic demand mid-drought preserves both trophic levels.',
      seed: 99312,
      config: {
        initialHerbivores: 40,
        initialPredators: 6,
        resourceAbundance: 1.0,
        reproductionRate: 1.0,
        metabolicDemand: 1.05,
        predatorPressure: 0.95,
        environmentalRegeneration: 0.95,
        waterAvailability: 0.85,
      },
      scheduledCommands: [
        {
          tick: 12,
          type: 'trigger_drought',
          label: 'Scheduled Megadrought Onset',
          payload: { severity: 0.55, durationTicks: 30 },
        },
      ],
    },
  ],
  quickInterventions: [
    {
      id: 'eco-add-predators',
      label: 'Introduce Apex Predators (+6)',
      description: 'Releases 6 apex predators into the central habitat to regulate herbivore grazing.',
      category: 'policy',
      commandType: 'introduce_predators',
      defaultPayload: { count: 6 },
    },
    {
      id: 'eco-add-herbivores',
      label: 'Introduce Herbivores (+15)',
      description: 'Introduces 15 herbivore grazers across meadow zones.',
      category: 'policy',
      commandType: 'introduce_herbivores',
      defaultPayload: { count: 15 },
    },
    {
      id: 'eco-trigger-drought',
      label: 'Trigger Severe Drought',
      description: 'Cuts rainfall and drains zone moisture by 50% for 25 ticks.',
      category: 'crisis',
      commandType: 'trigger_drought',
      defaultPayload: { severity: 0.5, durationTicks: 25 },
    },
    {
      id: 'eco-resource-shortage',
      label: 'Trigger Flora Blight (-55% Biomass)',
      description: 'Acute fungal blight removes 55% of standing plant biomass across all zones.',
      category: 'crisis',
      commandType: 'trigger_resource_shortage',
      defaultPayload: { lossFraction: 0.55 },
    },
    {
      id: 'eco-remove-predators',
      label: 'Remove Predator Species',
      description: 'Removes all apex predators from the biosphere to observe trophic release.',
      category: 'structure',
      commandType: 'remove_species',
      defaultPayload: { species: 'predator' },
    },
    {
      id: 'eco-restore-favorable',
      label: 'Restore Favorable Conditions',
      description: 'Ends active drought, replenishes moisture to 85%, and boosts soil fertility.',
      category: 'restoration',
      commandType: 'restore_favorable_conditions',
      defaultPayload: { moistureTarget: 85, biomassBoost: 35 },
    },
    {
      id: 'eco-boost-fertility',
      label: 'Increase Soil Fertility (+35%)',
      description: 'Enriches soil nutrients and accelerates primary flora regeneration.',
      category: 'restoration',
      commandType: 'boost_fertility',
      defaultPayload: { fertilityBoost: 0.35, biomassInjection: 25 },
    },
  ],
  metricDefinitions: [
    {
      id: 'herbivoreCount',
      label: 'Herbivore Population',
      unit: 'organisms',
      category: 'Population',
      description: 'Active herbivore grazers in the habitat.',
      warningThreshold: 10,
      criticalThreshold: 3,
      higherIsBetter: true,
    },
    {
      id: 'predatorCount',
      label: 'Predator Population',
      unit: 'organisms',
      category: 'Population',
      description: 'Active apex predators in the habitat.',
      warningThreshold: 2,
      criticalThreshold: 0,
      higherIsBetter: true,
    },
    {
      id: 'totalPlantBiomass',
      label: 'Total Flora Biomass',
      unit: 'kg',
      category: 'Resources',
      description: 'Aggregate edible primary producer biomass across all 16 habitat zones.',
      warningThreshold: 450,
      criticalThreshold: 220,
      higherIsBetter: true,
    },
    {
      id: 'meanMoisture',
      label: 'Mean Habitat Moisture',
      unit: '%',
      category: 'Environment',
      description: 'Average hydrological moisture across all habitat zones.',
      warningThreshold: 38,
      criticalThreshold: 22,
      higherIsBetter: true,
    },
    {
      id: 'meanSoilNutrients',
      label: 'Soil Nutrient Index',
      unit: 'idx',
      category: 'Environment',
      description: 'Average mineral nutrient concentration in basin soils.',
      higherIsBetter: true,
    },
    {
      id: 'ecosystemHealthIndex',
      label: 'Ecosystem Stability Index',
      unit: '%',
      category: 'Health',
      comparableDimension: 'system_stability_ratio',
      description:
        'Composite ecological vitality score (0-100%) combining biomass adequacy, moisture, and trophic diversity.',
      warningThreshold: 50,
      criticalThreshold: 28,
      higherIsBetter: true,
    },
  ],

  initializeWorld(config, rng) {
    const zStream = rng.stream('zones');
    const zones: HabitatZone[] = [];

    for (let gz = 0; gz < 4; gz++) {
      for (let gx = 0; gx < 4; gx++) {
        const idx = gz * 4 + gx;
        const centerX = -22.5 + gx * 15;
        const centerZ = -22.5 + gz * 15;
        const distFromCenter = Math.hypot(centerX, centerZ) / 32;
        const isOasis = (gx === 1 || gx === 2) && (gz === 1 || gz === 2);

        const baseMoisture = clampDet(
          (isOasis ? 82 : 62 - distFromCenter * 14) * config.waterAvailability +
            zStream.nextRange(-6, 6),
          15,
          100,
        );
        const baseNutrients = clampDet(
          68 * config.resourceAbundance + zStream.nextRange(-8, 8),
          20,
          100,
        );
        const carryingCap = roundDet(110 * config.resourceAbundance * (isOasis ? 1.25 : 1.0), 1);
        const initialBiomass = clampDet(
          carryingCap * 0.78 + zStream.nextRange(-10, 10),
          15,
          160,
        );

        zones.push({
          id: `zone-${idx + 1}`,
          label: ZONE_LABELS[idx] ?? `Sector ${idx + 1}`,
          gridX: gx,
          gridZ: gz,
          centerX,
          centerZ,
          elevation: roundDet(isOasis ? 0.4 : 1.2 + distFromCenter * 1.8, 2),
          moisture: roundDet(baseMoisture, 2),
          soilNutrients: roundDet(baseNutrients, 2),
          plantBiomass: roundDet(initialBiomass, 2),
          carryingCapacity: carryingCap,
        });
      }
    }

    const state: EcosystemState = {
      nextOrganismId: 1,
      zones,
      organisms: [],
      droughtTicksRemaining: 0,
      droughtSeverity: 0,
      cumulativeBirths: 0,
      cumulativeDeaths: 0,
      deathsByStarvation: 0,
      deathsByPredation: 0,
      deathsByDehydration: 0,
      deathsByOldAge: 0,
      lastDroughtEventId: null,
      lastShortageEventId: null,
      lastCascadeAlertTick: -99,
    };

    for (let i = 0; i < config.initialHerbivores; i++) {
      spawnOrganism(state, 'herbivore', rng);
    }
    for (let i = 0; i < config.initialPredators; i++) {
      spawnOrganism(state, 'predator', rng);
    }

    return state;
  },

  systems: [
    {
      id: 'eco_1_hydrology_and_flora',
      name: 'Hydrology, Nutrient Cycling & Primary Flora Production',
      order: 10,
      step(ctx) {
        const { state, config, rng, tick } = ctx;
        const envStream = rng.stream('environment');

        const isDrought = state.droughtTicksRemaining > 0;
        if (isDrought) {
          state.droughtTicksRemaining -= 1;
        }

        const beforeTotalBiomass = state.zones.reduce((s, z) => s + z.plantBiomass, 0);

        for (const zone of state.zones) {
          const isCentralOasis =
            (zone.gridX === 1 || zone.gridX === 2) &&
            (zone.gridZ === 1 || zone.gridZ === 2);
          const targetMoisture = clampDet(
            (isCentralOasis ? 80 : 58) *
              config.waterAvailability *
              (isDrought ? 1 - state.droughtSeverity : 1),
            8,
            100,
          );
          const moistureDelta =
            (targetMoisture - zone.moisture) * 0.16 + envStream.nextRange(-0.8, 0.8);
          zone.moisture = roundDet(clampDet(zone.moisture + moistureDelta, 5, 100), 2);

          // Passive mineral replenishment
          zone.soilNutrients = roundDet(
            clampDet(
              zone.soilNutrients + 0.55 * config.environmentalRegeneration,
              10,
              100,
            ),
            2,
          );

          // Logistic plant growth constrained by moisture and soil nutrients
          const moistureFactor = clampDet(zone.moisture / 70, 0.08, 1.3);
          const nutrientFactor = clampDet(zone.soilNutrients / 75, 0.15, 1.3);
          const effectiveCap = Math.max(
            20,
            zone.carryingCapacity * moistureFactor * config.resourceAbundance,
          );

          const growthRate =
            0.14 *
            config.environmentalRegeneration *
            moistureFactor *
            nutrientFactor;
          const logisticGrowth =
            growthRate *
            zone.plantBiomass *
            (1 - zone.plantBiomass / Math.max(25, effectiveCap)) +
            1.8 * moistureFactor * config.environmentalRegeneration;

          // If severe drought, plants also experience desiccation loss
          const desiccation =
            zone.moisture < 24 ? (24 - zone.moisture) * 0.22 : 0;

          const netGrowth = logisticGrowth - desiccation;
          zone.plantBiomass = roundDet(
            clampDet(zone.plantBiomass + netGrowth, 2, 160),
            2,
          );
          if (netGrowth > 0) {
            zone.soilNutrients = roundDet(
              clampDet(zone.soilNutrients - netGrowth * 0.08, 8, 100),
              2,
            );
          }
        }

        const afterTotalBiomass = state.zones.reduce((s, z) => s + z.plantBiomass, 0);
        if (
          beforeTotalBiomass >= 360 &&
          afterTotalBiomass < 360 &&
          tick - state.lastCascadeAlertTick >= 8
        ) {
          state.lastCascadeAlertTick = tick;
          const ev = ctx.emitEvent({
            type: 'resource_shortage',
            severity: 'warning',
            title: 'Primary Flora Biomass Depletion',
            description: `Basin flora biomass fell to ${roundDet(afterTotalBiomass, 1)} kg under combined grazing and moisture constraints.`,
            sourceSystem: 'eco_1_hydrology_and_flora',
            causedByEventId: state.lastDroughtEventId ?? undefined,
            causalLinkType: state.lastDroughtEventId ? 'dependency' : 'inferred',
            causalExplanation: state.lastDroughtEventId
              ? 'Moisture deficit from active drought throttled primary flora regeneration below herbivore consumption rate.'
              : 'Herbivore grazing pressure exceeded natural soil and flora regeneration rate.',
            payload: {
              totalPlantBiomass: roundDet(afterTotalBiomass, 1),
              severity: roundDet(1 - afterTotalBiomass / 1200, 2),
            },
            deltas: [
              {
                metricOrField: 'totalPlantBiomass',
                before: roundDet(beforeTotalBiomass, 1),
                after: roundDet(afterTotalBiomass, 1),
                unit: 'kg',
              },
            ],
          });
          state.lastShortageEventId = ev.id;
        }
      },
    },
    {
      id: 'eco_2_behavior_and_trophic_feeding',
      name: 'Organism Perception, Steering & Trophic Feeding',
      order: 20,
      step(ctx) {
        const { state, config, rng } = ctx;
        const moveStream = rng.stream('movement');

        // Sort organisms by ID for strict deterministic iteration
        state.organisms.sort((a, b) =>
          a.id.localeCompare(b.id, undefined, { numeric: true }),
        );

        const removedPreyIds = new Set<string>();
        const predators = state.organisms.filter((o) => o.species === 'predator');
        const herbivores = state.organisms.filter((o) => o.species === 'herbivore');

        // Step Herbivores: threat avoidance or patch foraging + grazing
        for (const herb of herbivores) {
          herb.prevX = herb.x;
          herb.prevZ = herb.z;

          // Check nearest predator within 13m
          let nearestPred: OrganismEntity | null = null;
          let minPredDist = 13.0;
          for (const pred of predators) {
            const d = Math.hypot(pred.x - herb.x, pred.z - herb.z);
            if (d < minPredDist) {
              minPredDist = d;
              nearestPred = pred;
            }
          }

          if (nearestPred) {
            herb.lastAction = 'fleeing';
            const dx = herb.x - nearestPred.x;
            const dz = herb.z - nearestPred.z;
            const norm = Math.max(0.01, Math.hypot(dx, dz));
            herb.vx = roundDet((dx / norm) * 2.1, 3);
            herb.vz = roundDet((dz / norm) * 2.1, 3);
          } else {
            const currentZone = findZoneForCoord(state.zones, herb.x, herb.z);
            if (currentZone.plantBiomass < 28 || currentZone.moisture < 25) {
              // Seek richest zone
              let bestZone = currentZone;
              let bestScore = currentZone.plantBiomass + currentZone.moisture * 0.5;
              for (const candidate of state.zones) {
                const distPenalty =
                  Math.hypot(candidate.centerX - herb.x, candidate.centerZ - herb.z) * 0.6;
                const score = candidate.plantBiomass + candidate.moisture * 0.5 - distPenalty;
                if (score > bestScore) {
                  bestScore = score;
                  bestZone = candidate;
                }
              }
              const dx = bestZone.centerX - herb.x + moveStream.nextRange(-1.5, 1.5);
              const dz = bestZone.centerZ - herb.z + moveStream.nextRange(-1.5, 1.5);
              const norm = Math.max(0.01, Math.hypot(dx, dz));
              herb.vx = roundDet((dx / norm) * 1.45, 3);
              herb.vz = roundDet((dz / norm) * 1.45, 3);
              herb.lastAction = 'foraging';
            } else {
              herb.vx = roundDet(
                clampDet(herb.vx * 0.7 + moveStream.nextRange(-0.65, 0.65), -1.4, 1.4),
                3,
              );
              herb.vz = roundDet(
                clampDet(herb.vz * 0.7 + moveStream.nextRange(-0.65, 0.65), -1.4, 1.4),
                3,
              );
              herb.lastAction = 'foraging';
            }
          }

          herb.x = roundDet(clampDet(herb.x + herb.vx, -28.5, 28.5), 3);
          herb.z = roundDet(clampDet(herb.z + herb.vz, -28.5, 28.5), 3);

          // Grazing in new zone
          const zone = findZoneForCoord(state.zones, herb.x, herb.z);
          const desiredBite = Math.min(4.2, Math.max(0, 105 - herb.energy) * 0.18);
          const actualBite = Math.min(zone.plantBiomass - 1.5, Math.max(0, desiredBite));
          if (actualBite > 0.1) {
            zone.plantBiomass = roundDet(zone.plantBiomass - actualBite, 2);
            herb.energy = roundDet(clampDet(herb.energy + actualBite * 2.55, 0, 115), 2);
          }

          // Hydration intake from zone moisture
          const waterIntake = (zone.moisture / 100) * 5.2;
          herb.hydration = roundDet(clampDet(herb.hydration + waterIntake, 0, 100), 2);
        }

        // Step Predators: pursue nearest live herbivore & hunt
        for (const pred of predators) {
          pred.prevX = pred.x;
          pred.prevZ = pred.z;

          let targetHerb: OrganismEntity | null = null;
          let minDist = 26.0;
          for (const herb of herbivores) {
            if (removedPreyIds.has(herb.id)) continue;
            const d = Math.hypot(herb.x - pred.x, herb.z - pred.z);
            if (d < minDist) {
              minDist = d;
              targetHerb = herb;
            }
          }

          if (targetHerb) {
            pred.lastAction = 'hunting';
            const dx = targetHerb.x - pred.x;
            const dz = targetHerb.z - pred.z;
            const norm = Math.max(0.01, Math.hypot(dx, dz));
            const huntSpeed = 1.95 * clampDet(config.predatorPressure, 0.5, 1.8);
            pred.vx = roundDet((dx / norm) * huntSpeed, 3);
            pred.vz = roundDet((dz / norm) * huntSpeed, 3);
            pred.x = roundDet(clampDet(pred.x + pred.vx, -28.5, 28.5), 3);
            pred.z = roundDet(clampDet(pred.z + pred.vz, -28.5, 28.5), 3);

            const postDist = Math.hypot(targetHerb.x - pred.x, targetHerb.z - pred.z);
            const catchRadius = 2.4 * clampDet(config.predatorPressure, 0.6, 1.6);
            if (postDist <= catchRadius && pred.energy < 98) {
              removedPreyIds.add(targetHerb.id);
              pred.energy = roundDet(clampDet(pred.energy + 38, 0, 125), 2);
              state.cumulativeDeaths += 1;
              state.deathsByPredation += 1;
              const preyZone = findZoneForCoord(state.zones, targetHerb.x, targetHerb.z);
              preyZone.soilNutrients = roundDet(
                clampDet(preyZone.soilNutrients + 3.0, 0, 100),
                2,
              );
            }
          } else {
            pred.lastAction = 'wandering';
            pred.vx = roundDet(
              clampDet(pred.vx * 0.75 + moveStream.nextRange(-0.8, 0.8), -1.6, 1.6),
              3,
            );
            pred.vz = roundDet(
              clampDet(pred.vz * 0.75 + moveStream.nextRange(-0.8, 0.8), -1.6, 1.6),
              3,
            );
            pred.x = roundDet(clampDet(pred.x + pred.vx, -28.5, 28.5), 3);
            pred.z = roundDet(clampDet(pred.z + pred.vz, -28.5, 28.5), 3);
          }

          const predZone = findZoneForCoord(state.zones, pred.x, pred.z);
          pred.hydration = roundDet(
            clampDet(pred.hydration + (predZone.moisture / 100) * 5.0, 0, 100),
            2,
          );
        }

        if (removedPreyIds.size > 0) {
          state.organisms = state.organisms.filter((o) => !removedPreyIds.has(o.id));
        }
      },
    },
    {
      id: 'eco_3_metabolism_reproduction_and_mortality',
      name: 'Metabolism, Reproduction & Lifecycle Mortality',
      order: 30,
      step(ctx) {
        const { state, config, rng } = ctx;
        const lifeStream = rng.stream('lifecycle');

        const survivors: OrganismEntity[] = [];
        const newborns: OrganismEntity[] = [];
        let starvedThisTick = 0;
        let dehydratedThisTick = 0;

        const currentHerbCount = state.organisms.filter(
          (o) => o.species === 'herbivore',
        ).length;
        const currentPredCount = state.organisms.filter(
          (o) => o.species === 'predator',
        ).length;

        for (const org of state.organisms) {
          org.age += 1;
          const speedMag = Math.hypot(org.vx, org.vz);
          const baseBurn = org.species === 'predator' ? 2.55 : 2.15;
          const energyCost =
            (baseBurn + speedMag * 0.42) * config.metabolicDemand;
          const hydrationCost =
            (org.species === 'predator' ? 2.4 : 2.6) *
            (state.droughtTicksRemaining > 0 ? 1.35 : 1.0);

          org.energy = roundDet(org.energy - energyCost, 2);
          org.hydration = roundDet(org.hydration - hydrationCost, 2);

          // Check mortality conditions
          if (org.energy <= 0 || org.hydration <= 0 || org.age >= org.maxAge) {
            state.cumulativeDeaths += 1;
            if (org.energy <= 0) {
              state.deathsByStarvation += 1;
              starvedThisTick += 1;
            } else if (org.hydration <= 0) {
              state.deathsByDehydration += 1;
              dehydratedThisTick += 1;
            } else {
              state.deathsByOldAge += 1;
            }
            const deathZone = findZoneForCoord(state.zones, org.x, org.z);
            deathZone.soilNutrients = roundDet(
              clampDet(deathZone.soilNutrients + 4.5, 0, 100),
              2,
            );
            continue;
          }

          // Check reproduction eligibility
          const isHerb = org.species === 'herbivore';
          const energyThreshold = isHerb ? 76 : 86;
          const maxCap = isHerb ? 160 : 55;
          const currentCount = isHerb ? currentHerbCount : currentPredCount;
          const baseReproProb =
            (isHerb ? 0.14 : 0.085) * config.reproductionRate;

          if (
            org.age >= 6 &&
            org.energy >= energyThreshold &&
            org.hydration >= 35 &&
            currentCount + newborns.length < maxCap &&
            lifeStream.nextBoolean(baseReproProb)
          ) {
            const childEnergy = roundDet(org.energy * 0.42, 2);
            org.energy = roundDet(org.energy - childEnergy, 2);
            org.offspringCount += 1;
            org.lastAction = 'reproducing';
            state.cumulativeBirths += 1;

            const child = spawnOrganism(
              state,
              org.species,
              rng,
              org.x,
              org.z,
              childEnergy + 12,
            );
            // Remove from state.organisms where spawnOrganism pushed it so we append deterministically
            state.organisms.pop();
            newborns.push(child);
          }

          survivors.push(org);
        }

        state.organisms = [...survivors, ...newborns];

        if (starvedThisTick + dehydratedThisTick >= 4) {
          const upstreamId = state.lastShortageEventId ?? state.lastDroughtEventId;
          ctx.emitEvent({
            type: 'population_mortality_spike',
            severity: 'critical',
            title: `Ecological Mortality Spike (${starvedThisTick + dehydratedThisTick} lost)`,
            description: `${starvedThisTick} organisms starved and ${dehydratedThisTick} dehydrated in a single tick.`,
            sourceSystem: 'eco_3_metabolism_reproduction_and_mortality',
            causedByEventId: upstreamId ?? undefined,
            causalLinkType: upstreamId ? 'dependency' : 'direct',
            causalExplanation: upstreamId
              ? 'Resource/moisture deficit reduced foraging intake below basal metabolic demand.'
              : 'Population density exceeded immediate habitat patch carrying capacity.',
            payload: {
              starvedThisTick,
              dehydratedThisTick,
              remainingOrganisms: state.organisms.length,
            },
            deltas: [
              {
                metricOrField: 'totalPopulation',
                before: state.organisms.length + starvedThisTick + dehydratedThisTick,
                after: state.organisms.length,
                unit: 'organisms',
              },
            ],
          });
        }
      },
    },
  ],

  applyCommand(state, command: SimulationCommand, ctx) {
    const { rng } = ctx;

    switch (command.type) {
      case 'introduce_predators': {
        const count = clampDet(Number(command.payload.count ?? 6), 1, 40);
        const before = state.organisms.filter((o) => o.species === 'predator').length;
        const spawnedIds: string[] = [];
        for (let i = 0; i < count; i++) {
          const org = spawnOrganism(state, 'predator', rng, 0, 0, 84);
          spawnedIds.push(org.id);
        }
        const after = state.organisms.filter((o) => o.species === 'predator').length;
        ctx.emitEvent({
          type: 'species_introduced',
          severity: 'positive',
          title: `Introduced ${count} Apex Predators`,
          description: `Predator population increased from ${before} to ${after} to regulate herbivore grazing pressure.`,
          sourceSystem: 'ecosystem_command',
          affectedEntityIds: spawnedIds,
          payload: { species: 'predator', count },
          deltas: [
            {
              metricOrField: 'predatorCount',
              before,
              after,
              unit: 'organisms',
            },
          ],
        });
        break;
      }

      case 'introduce_herbivores': {
        const count = clampDet(Number(command.payload.count ?? 15), 1, 60);
        const before = state.organisms.filter((o) => o.species === 'herbivore').length;
        const spawnedIds: string[] = [];
        for (let i = 0; i < count; i++) {
          const org = spawnOrganism(state, 'herbivore', rng, undefined, undefined, 74);
          spawnedIds.push(org.id);
        }
        const after = state.organisms.filter((o) => o.species === 'herbivore').length;
        ctx.emitEvent({
          type: 'species_introduced',
          severity: 'info',
          title: `Introduced ${count} Herbivores`,
          description: `Herbivore population increased from ${before} to ${after}.`,
          sourceSystem: 'ecosystem_command',
          affectedEntityIds: spawnedIds,
          payload: { species: 'herbivore', count },
          deltas: [
            {
              metricOrField: 'herbivoreCount',
              before,
              after,
              unit: 'organisms',
            },
          ],
        });
        break;
      }

      case 'remove_species': {
        const targetSpecies =
          command.payload.species === 'herbivore' ? 'herbivore' : 'predator';
        const before = state.organisms.filter((o) => o.species === targetSpecies).length;
        const removedIds = state.organisms
          .filter((o) => o.species === targetSpecies)
          .map((o) => o.id);
        state.organisms = state.organisms.filter((o) => o.species !== targetSpecies);
        ctx.emitEvent({
          type: 'species_removed',
          severity: 'warning',
          title: `Removed All ${targetSpecies === 'predator' ? 'Apex Predators' : 'Herbivores'}`,
          description: `Removed ${before} ${targetSpecies} organisms from the habitat.`,
          sourceSystem: 'ecosystem_command',
          affectedEntityIds: removedIds.slice(0, 15),
          payload: { species: targetSpecies, removedCount: before },
          deltas: [
            {
              metricOrField:
                targetSpecies === 'predator' ? 'predatorCount' : 'herbivoreCount',
              before,
              after: 0,
              unit: 'organisms',
            },
          ],
        });
        break;
      }

      case 'trigger_drought': {
        const severity = clampDet(Number(command.payload.severity ?? 0.5), 0.15, 0.85);
        const durationTicks = clampDet(
          Number(command.payload.durationTicks ?? 25),
          5,
          100,
        );
        const beforeMoisture = roundDet(
          state.zones.reduce((s, z) => s + z.moisture, 0) / state.zones.length,
          1,
        );
        state.droughtSeverity = severity;
        state.droughtTicksRemaining = durationTicks;
        for (const zone of state.zones) {
          zone.moisture = roundDet(
            clampDet(zone.moisture * (1 - severity * 0.7), 8, 100),
            2,
          );
        }
        const afterMoisture = roundDet(
          state.zones.reduce((s, z) => s + z.moisture, 0) / state.zones.length,
          1,
        );
        const ev = ctx.emitEvent({
          type: 'drought_triggered',
          severity: 'critical',
          title: `Hydrological Drought (${Math.round(severity * 100)}% Severity)`,
          description: `Mean habitat moisture dropped from ${beforeMoisture}% to ${afterMoisture}% for ${durationTicks} ticks.`,
          sourceSystem: 'ecosystem_command',
          affectedEntityIds: state.zones.map((z) => z.id),
          payload: {
            severity,
            durationTicks,
            moistureDrop: severity,
          },
          deltas: [
            {
              metricOrField: 'meanMoisture',
              before: beforeMoisture,
              after: afterMoisture,
              unit: '%',
            },
          ],
        });
        state.lastDroughtEventId = ev.id;
        break;
      }

      case 'trigger_resource_shortage': {
        const lossFraction = clampDet(
          Number(command.payload.lossFraction ?? 0.55),
          0.1,
          0.9,
        );
        const beforeBio = roundDet(
          state.zones.reduce((s, z) => s + z.plantBiomass, 0),
          1,
        );
        for (const zone of state.zones) {
          zone.plantBiomass = roundDet(
            clampDet(zone.plantBiomass * (1 - lossFraction), 4, 160),
            2,
          );
        }
        const afterBio = roundDet(
          state.zones.reduce((s, z) => s + z.plantBiomass, 0),
          1,
        );
        const ev = ctx.emitEvent({
          type: 'resource_shortage',
          severity: 'critical',
          title: `Primary Flora Blight (-${Math.round(lossFraction * 100)}%)`,
          description: `Standing flora biomass dropped from ${beforeBio} kg to ${afterBio} kg across all habitat sectors.`,
          sourceSystem: 'ecosystem_command',
          affectedEntityIds: state.zones.map((z) => z.id),
          payload: {
            lossFraction,
            severity: lossFraction,
          },
          deltas: [
            {
              metricOrField: 'totalPlantBiomass',
              before: beforeBio,
              after: afterBio,
              unit: 'kg',
            },
          ],
        });
        state.lastShortageEventId = ev.id;
        break;
      }

      case 'restore_favorable_conditions': {
        const moistureTarget = clampDet(
          Number(command.payload.moistureTarget ?? 85),
          40,
          100,
        );
        const biomassBoost = clampDet(
          Number(command.payload.biomassBoost ?? 35),
          5,
          80,
        );
        const beforeBio = roundDet(
          state.zones.reduce((s, z) => s + z.plantBiomass, 0),
          1,
        );
        state.droughtTicksRemaining = 0;
        state.droughtSeverity = 0;
        for (const zone of state.zones) {
          zone.moisture = roundDet(Math.max(zone.moisture, moistureTarget), 2);
          zone.soilNutrients = roundDet(clampDet(zone.soilNutrients + 20, 0, 100), 2);
          zone.plantBiomass = roundDet(
            clampDet(zone.plantBiomass + biomassBoost, 10, 160),
            2,
          );
        }
        const afterBio = roundDet(
          state.zones.reduce((s, z) => s + z.plantBiomass, 0),
          1,
        );
        ctx.emitEvent({
          type: 'conditions_restored',
          severity: 'positive',
          title: 'Restored Favorable Biosphere Conditions',
          description: `Ended drought stress, restored zone moisture to >=${moistureTarget}%, and replenished flora biomass to ${afterBio} kg.`,
          sourceSystem: 'ecosystem_command',
          affectedEntityIds: state.zones.map((z) => z.id),
          payload: { moistureTarget, biomassBoost },
          deltas: [
            {
              metricOrField: 'totalPlantBiomass',
              before: beforeBio,
              after: afterBio,
              unit: 'kg',
            },
          ],
        });
        break;
      }

      case 'boost_fertility': {
        const fertilityBoost = clampDet(
          Number(command.payload.fertilityBoost ?? 0.35),
          0.05,
          1.0,
        );
        const biomassInjection = clampDet(
          Number(command.payload.biomassInjection ?? 25),
          5,
          80,
        );
        const beforeBio = roundDet(
          state.zones.reduce((s, z) => s + z.plantBiomass, 0),
          1,
        );
        for (const zone of state.zones) {
          zone.soilNutrients = roundDet(
            clampDet(zone.soilNutrients + fertilityBoost * 45, 0, 100),
            2,
          );
          zone.carryingCapacity = roundDet(
            clampDet(zone.carryingCapacity * (1 + fertilityBoost * 0.25), 50, 180),
            1,
          );
          zone.plantBiomass = roundDet(
            clampDet(zone.plantBiomass + biomassInjection, 5, 160),
            2,
          );
        }
        const afterBio = roundDet(
          state.zones.reduce((s, z) => s + z.plantBiomass, 0),
          1,
        );
        ctx.emitEvent({
          type: 'fertility_boosted',
          severity: 'positive',
          title: `Soil Fertility Boosted (+${Math.round(fertilityBoost * 100)}%)`,
          description: `Soil nutrient levels and primary flora biomass increased (${beforeBio} kg -> ${afterBio} kg).`,
          sourceSystem: 'ecosystem_command',
          affectedEntityIds: state.zones.map((z) => z.id),
          payload: { fertilityBoost, biomassInjection },
          deltas: [
            {
              metricOrField: 'totalPlantBiomass',
              before: beforeBio,
              after: afterBio,
              unit: 'kg',
            },
          ],
        });
        break;
      }
    }
  },

  extractMetrics(state) {
    const herbivoreCount = state.organisms.filter(
      (o) => o.species === 'herbivore',
    ).length;
    const predatorCount = state.organisms.filter(
      (o) => o.species === 'predator',
    ).length;
    const totalPlantBiomass = roundDet(
      state.zones.reduce((s, z) => s + z.plantBiomass, 0),
      1,
    );
    const meanMoisture = roundDet(
      state.zones.reduce((s, z) => s + z.moisture, 0) / Math.max(1, state.zones.length),
      1,
    );
    const meanSoilNutrients = roundDet(
      state.zones.reduce((s, z) => s + z.soilNutrients, 0) /
        Math.max(1, state.zones.length),
      1,
    );

    const biomassScore = clampDet((totalPlantBiomass / 1100) * 100, 0, 100);
    const herbScore =
      herbivoreCount === 0
        ? 0
        : herbivoreCount > 110
          ? clampDet(100 - (herbivoreCount - 110) * 1.2, 20, 100)
          : clampDet((herbivoreCount / 32) * 100, 15, 100);
    const predScore = predatorCount > 0 ? clampDet((predatorCount / 6) * 100, 35, 100) : 35;
    const ecosystemHealthIndex = roundDet(
      clampDet(
        biomassScore * 0.4 +
          meanMoisture * 0.25 +
          herbScore * 0.2 +
          predScore * 0.15,
        0,
        100,
      ),
      1,
    );

    return {
      herbivoreCount,
      predatorCount,
      totalPlantBiomass,
      meanMoisture,
      meanSoilNutrients,
      ecosystemHealthIndex,
    };
  },

  inspectEntities(state) {
    const inspections: EntityInspection[] = [];

    for (const zone of state.zones) {
      const status =
        zone.plantBiomass < 20 || zone.moisture < 20
          ? 'critical'
          : zone.plantBiomass < 42 || zone.moisture < 35
            ? 'warning'
            : 'nominal';
      inspections.push({
        entityId: zone.id,
        kind: 'habitat_zone',
        label: zone.label,
        status,
        position: [zone.centerX, zone.elevation, zone.centerZ],
        summary: `Biomass ${zone.plantBiomass} kg | Moisture ${zone.moisture}% | Nutrients ${zone.soilNutrients}`,
        properties: [
          { key: 'plantBiomass', label: 'Flora Biomass', value: zone.plantBiomass, unit: 'kg' },
          { key: 'moisture', label: 'Soil Moisture', value: zone.moisture, unit: '%' },
          { key: 'soilNutrients', label: 'Soil Nutrients', value: zone.soilNutrients, unit: 'idx' },
          { key: 'carryingCapacity', label: 'Carrying Capacity', value: zone.carryingCapacity, unit: 'kg' },
        ],
      });
    }

    for (const org of state.organisms) {
      const status =
        org.energy < 22 || org.hydration < 22
          ? 'critical'
          : org.energy < 42 || org.hydration < 40
            ? 'warning'
            : 'nominal';
      inspections.push({
        entityId: org.id,
        kind: org.species,
        label: `${org.species === 'predator' ? 'Apex Predator' : 'Herbivore Grazer'} (${org.id})`,
        status,
        position: [org.x, 0.8, org.z],
        summary: `${org.lastAction.toUpperCase()} | Energy ${org.energy} | Hydration ${org.hydration}% | Age ${org.age}t`,
        properties: [
          { key: 'species', label: 'Species Trophic Role', value: org.species },
          { key: 'lastAction', label: 'Current Behavior', value: org.lastAction },
          { key: 'energy', label: 'Metabolic Energy', value: org.energy, unit: 'kcal' },
          { key: 'hydration', label: 'Hydration', value: org.hydration, unit: '%' },
          { key: 'age', label: 'Age / Lifespan', value: `${org.age} / ${org.maxAge}`, unit: 'ticks' },
          { key: 'offspringCount', label: 'Offspring Produced', value: org.offspringCount },
        ],
      });
    }

    return inspections;
  },

  extractRenderFrame(state, config, runId: RunId, tick: Tick): RenderFrameData {
    const metrics = this.extractMetrics(state, config);
    const ambientStatus =
      metrics.ecosystemHealthIndex < 30
        ? 'critical'
        : metrics.ecosystemHealthIndex < 55 || state.droughtTicksRemaining > 0
          ? 'warning'
          : 'nominal';

    const zones: RenderZoneVisual[] = state.zones.map((z) => {
      const bioRatio = clampDet(z.plantBiomass / 120, 0, 1);
      const status =
        z.plantBiomass < 20 || z.moisture < 20
          ? 'critical'
          : z.plantBiomass < 42
            ? 'warning'
            : 'nominal';
      return {
        id: z.id,
        label: z.label,
        position: [z.centerX, z.elevation * 0.4, z.centerZ],
        size: [14.2, Math.max(0.35, z.elevation * 0.7), 14.2],
        value: bioRatio,
        secondaryValue: clampDet(z.moisture / 100, 0, 1),
        status,
        color:
          status === 'critical'
            ? '#8d5524'
            : bioRatio > 0.6
              ? '#15803d'
              : '#4d7c0f',
        metadata: {
          plantBiomass: z.plantBiomass,
          moisture: z.moisture,
          soilNutrients: z.soilNutrients,
        },
      };
    });

    const entities: RenderEntityVisual[] = state.organisms.map((o) => {
      const isPred = o.species === 'predator';
      const zone = findZoneForCoord(state.zones, o.x, o.z);
      const yBase = zone.elevation * 0.4 + 0.55;
      const rotationY = Math.atan2(o.vx, o.vz);
      return {
        id: o.id,
        kind: o.species,
        label: `${isPred ? 'Predator' : 'Herbivore'} ${o.id}`,
        position: [o.x, yBase, o.z],
        prevPosition: [o.prevX, yBase, o.prevZ],
        scale: isPred ? [1.25, 1.25, 1.65] : [0.95, 0.95, 1.25],
        rotationY,
        color: isPred ? '#ff3d57' : '#00e5ff',
        secondaryColor: o.lastAction === 'fleeing' ? '#ffb300' : '#00e676',
        energyOrHealth: clampDet(o.energy / 100, 0.05, 1),
        status:
          o.energy < 22 || o.hydration < 22
            ? 'critical'
            : o.energy < 42
              ? 'warning'
              : 'nominal',
        metadata: {
          action: o.lastAction,
          age: o.age,
          energy: o.energy,
        },
      };
    });

    const connections: RenderConnectionVisual[] = [];

    return {
      worldId: 'ecosystem',
      runId,
      tick,
      ambientStatus,
      entities,
      zones,
      connections,
      hudSummary: {
        Herbivores: metrics.herbivoreCount,
        Predators: metrics.predatorCount,
        'Flora Biomass': `${metrics.totalPlantBiomass} kg`,
        'Mean Moisture': `${metrics.meanMoisture}%`,
        'Health Index': `${metrics.ecosystemHealthIndex}%`,
        Regime: state.droughtTicksRemaining > 0 ? `DROUGHT (${state.droughtTicksRemaining}t)` : 'NOMINAL',
      },
    };
  },
});
