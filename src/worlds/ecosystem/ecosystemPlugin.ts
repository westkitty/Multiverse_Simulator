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

export type BiomeKind =
  | 'wetland_marsh'
  | 'riparian_grove'
  | 'savanna_meadow'
  | 'canopy_forest'
  | 'arid_steppe'
  | 'alpine_ridge';

export interface HabitatZone {
  id: string;
  label: string;
  biome: BiomeKind;
  gridX: number; // 0..7 (8 cols)
  gridZ: number; // 0..5 (6 rows) => 48 active habitat zones
  centerX: number;
  centerZ: number;
  elevation: number;
  moisture: number; // 0..100
  soilNutrients: number; // 0..100
  plantBiomass: number; // 0..160
  carryingCapacity: number;
  pollinatorIndex: number; // 0..100
  decomposerActivity: number; // 0..100
  invasiveSpreadPct: number; // 0..100
  fireHazardIndex: number; // 0..100
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
  immunity: number; // 0..100
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
  pathogenOutbreakTicks: number;
  seasonalRainBonus: number;
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
  initialHerbivores: z.number().int().min(0).max(320),
  initialPredators: z.number().int().min(0).max(120),
  resourceAbundance: z.number().min(0.2).max(2.5),
  reproductionRate: z.number().min(0.1).max(2.5),
  metabolicDemand: z.number().min(0.3).max(2.5),
  predatorPressure: z.number().min(0.2).max(2.5),
  environmentalRegeneration: z.number().min(0.1).max(2.5),
  waterAvailability: z.number().min(0.1).max(2.0),
});

const ECO_COLS = 8;
const ECO_ROWS = 6; // 48 active habitat zones (3x the 16-zone baseline)

const ZONE_LABELS = [
  'North-West Basin', 'Northern Marsh', 'Highland Creek', 'North-East Ridge', 'Boreal Peatland', 'Timberline Tarn', 'Granite Crag N', 'Glacial Outwash',
  'Western Meadow', 'Central Oasis A', 'Central Oasis B', 'Eastern Steppe', 'Cedar Floodplain', 'Mossy Ravine', ' Juniper Terraces', 'Windward Bluff',
  'Silt Floodplain', 'Heartland Grove', 'Sunlit Savanna', 'Granite Foothills', 'Riparian Oxbow', 'Emerald Glade', 'Acacia Plateau', 'Shale Badlands',
  'South-West Fen', 'Southern Valley', 'Timberline Glade', 'South-East Delta', 'Willow Billabong', 'Fern Canopy', 'Tallgrass Prairie', 'Limestone Karst',
  'Estuary Reedbed', 'Cypress Bayou', 'Sycamore Bottoms', 'Redwood Hollow', 'Orchid Cloudwood', 'Saguaro Bajada', 'Ocotillo Mesa', 'Alkali Pan',
  'Mangrove Fringe', 'Tidal Saltmarsh', 'Alluvial Fan S', 'Gallery Forest', 'Monsoon Meadow', 'Basalt Scarp', 'Dry Wash Canyon', 'Southern Dune Erg',
];

function findZoneForCoord(zones: HabitatZone[], x: number, z: number): HabitatZone {
  const gx = clampDet(Math.floor(((x + 48) / 96) * ECO_COLS), 0, ECO_COLS - 1);
  const gz = clampDet(Math.floor(((z + 36) / 72) * ECO_ROWS), 0, ECO_ROWS - 1);
  const idx = gz * ECO_COLS + gx;
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
    nearX !== undefined ? nearX + stream.nextRange(-4.5, 4.5) : stream.nextRange(-42, 42),
    -45,
    45,
  );
  const z = clampDet(
    nearZ !== undefined ? nearZ + stream.nextRange(-4.5, 4.5) : stream.nextRange(-30, 30),
    -33,
    33,
  );
  const angle = stream.nextRange(0, Math.PI * 2);
  const speed = species === 'predator' ? 1.55 : 1.15;

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
    immunity: roundDet(stream.nextRange(74, 96), 1),
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
  subtitle: '48-Zone Trophic Biosphere, Pollinator Guilds, Foraging & Nutrient Cycling',
  version: '2.0.0',
  schemaVersion: 1,
  accentColor: '#00e676',
  description:
    'Spatial ecological laboratory modeling 48 habitat zones across 6 biomes (10,800 m² basin, 3x the original 16-zone area) with soil nutrient cycling, moisture hydrology, pollinator and fungal decomposer guilds, invasive flora, wildfire risk, herbivore grazing, and apex predator hunting.',
  physicalModelDocumentation: [
    'Spatial 8x6 biome grid (48 habitat zones across a 120x90m = 10,800 m² basin, 3x the 16-zone baseline) tracking soil moisture, mineral nutrients, pollinator density, fungal decomposers, and renewable flora biomass.',
    'Logistic primary production driven by moisture, soil nutrients, pollinator guilds, and environmentalRegeneration rate, counterbalanced by invasive weed competition and drought/fire desiccation.',
    'Individual organism agents (Herbivores & Predators) with metabolic energy expenditure, hydration decay, immunity, perception-driven steering, grazing/predation, reproduction energy transfer, and carcass decomposition back into soil nutrients.',
  ],
  simplifiedMechanicsNote:
    'Organisms use bounded spatial perception rules (nearest threat avoidance and highest local patch gradient) rather than neural-network policies, guaranteeing transparent causal attribution.',
  scaleMetadata: {
    areaUnitLabel: 'active habitat zones (10,800 m² ecological basin)',
    baselinePlayableArea: 16,
    expandedPlayableArea: 48,
    baselineTerritoryScalar: 3600,
    expandedTerritoryScalar: 10800,
    baselineScenarioCount: 3,
    baselineInterventionCount: 7,
    baselineMetricCount: 6,
  },
  configSchema: ecosystemConfigSchema,
  defaultConfig: {
    initialHerbivores: 72,
    initialPredators: 14,
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
        'Begins with abundant herbivores and zero apex predators across all 48 habitat zones. Unchecked herbivore growth strips primary flora biomass, triggering an overgrazing famine unless predators are introduced or fertility is managed.',
      hypothesis:
        'Introducing a controlled apex predator cohort before carrying capacity is breached stabilizes primary flora biomass and prevents total herbivore starvation.',
      seed: 70421,
      config: {
        initialHerbivores: 96,
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
      name: 'Equilibrium Basin Observatory (48 Zones)',
      subtitle: 'Three-Tier Trophic Oscillation Across 6 Biomes',
      description:
        'A balanced biosphere with producers, 72 herbivores, and 14 apex predators exhibiting natural Lotka-Volterra style population oscillations across 48 moisture and biome zones.',
      hypothesis:
        'Trophic coupling maintains ecosystem health index above 65% unless perturbed by an external hydrological drought.',
      seed: 11890,
      config: {
        initialHerbivores: 72,
        initialPredators: 14,
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
      subtitle: 'Scheduled Tick-12 Megadrought Across 48 Zones',
      description:
        'A thriving ecosystem subjected to a severe hydrological drought at Tick 12, testing oasis migration and species resilience.',
      hypothesis:
        'Restoring water availability or reducing metabolic demand mid-drought preserves both trophic levels.',
      seed: 99312,
      config: {
        initialHerbivores: 68,
        initialPredators: 12,
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
    {
      id: 'eco-apex-overpredation-collapse',
      name: 'Apex Predator Hyper-Density & Prey Crash',
      subtitle: 'Predator Overshoot -> Prey Bottleneck -> Predator Starvation',
      description:
        'High initial apex predator numbers and hunting pressure rapidly deplete herbivore herds across open savanna zones.',
      hypothesis:
        'Creating dense forest refugia and supplementing herbivore cohorts prevents local prey extinction.',
      seed: 70444,
      config: {
        initialHerbivores: 54,
        initialPredators: 32,
        resourceAbundance: 1.1,
        reproductionRate: 0.95,
        metabolicDemand: 1.05,
        predatorPressure: 1.45,
        environmentalRegeneration: 1.1,
        waterAvailability: 1.0,
      },
    },
    {
      id: 'eco-pollinator-blight-crisis',
      name: 'Pollinator Decline & Invasive Flora Takeover',
      subtitle: 'Low Regeneration + Scheduled Flora Blight',
      description:
        'Reduced environmental regeneration and a scheduled Tick-6 fungal blight depress native flora and pollinator guilds.',
      hypothesis:
        'Reintroducing native pollinators and clearing invasive weeds restores primary production.',
      seed: 70555,
      config: {
        initialHerbivores: 64,
        initialPredators: 10,
        resourceAbundance: 0.82,
        reproductionRate: 0.9,
        metabolicDemand: 1.0,
        predatorPressure: 0.95,
        environmentalRegeneration: 0.62,
        waterAvailability: 0.9,
      },
      scheduledCommands: [
        {
          tick: 6,
          type: 'trigger_resource_shortage',
          label: 'Fungal Flora & Pollinator Blight',
          payload: { lossFraction: 0.48 },
        },
      ],
    },
    {
      id: 'eco-wildfire-mosaic-recovery',
      name: 'Arid Brushfire & Ash Nutrient Succession',
      subtitle: 'Dry Steppe Wildfire -> Mineral Ash Pulse -> Secondary Succession',
      description:
        'Low moisture in eastern steppe zones triggers brushfire hazard, burning standing flora while enriching soil mineral ash.',
      hypothesis:
        'Controlled firebreaks and post-fire monsoon irrigation trigger a rapid secondary flora boom.',
      seed: 70666,
      config: {
        initialHerbivores: 60,
        initialPredators: 11,
        resourceAbundance: 1.0,
        reproductionRate: 1.05,
        metabolicDemand: 1.0,
        predatorPressure: 1.0,
        environmentalRegeneration: 1.15,
        waterAvailability: 0.65,
      },
      scheduledCommands: [
        {
          tick: 5,
          type: 'trigger_wildfire_outbreak',
          label: 'Eastern Steppe Dry-Lightning Brushfire',
          payload: { region: 'east', burnFraction: 0.52 },
        },
      ],
    },
    {
      id: 'eco-pathogen-epizootic-wave',
      name: 'Epizootic Herd Contagion & Immunity Selection',
      subtitle: 'High-Density Herd Pathogen Stress vs. Veterinary Inoculation',
      description:
        'Dense herbivore herds experience a metabolic pathogen outbreak at Tick 4 that elevates energy drain.',
      hypothesis:
        'Deploying wildlife probiotic/immunity supplements and wetland hydration buffers halts herd mortality.',
      seed: 70777,
      config: {
        initialHerbivores: 105,
        initialPredators: 14,
        resourceAbundance: 1.15,
        reproductionRate: 1.1,
        metabolicDemand: 1.2,
        predatorPressure: 0.95,
        environmentalRegeneration: 1.05,
        waterAvailability: 1.0,
      },
      scheduledCommands: [
        {
          tick: 4,
          type: 'trigger_pathogen_outbreak',
          label: 'Epizootic Herd Pathogen Wave',
          payload: { durationTicks: 18, immunityDrop: 28 },
        },
      ],
    },
    {
      id: 'eco-wetland-corridor-rewilding',
      name: 'Riparian Wetland Rewilding & Megafauna Boom',
      subtitle: 'High Water & Fertility -> Carrying Capacity Expansion',
      description:
        'Explores how connected wetland corridors and high soil fertility support high-density multi-trophic biodiversity.',
      hypothesis:
        'Abundant riparian moisture supports over 140 organisms without triggering overgrazing collapse.',
      seed: 70888,
      config: {
        initialHerbivores: 88,
        initialPredators: 18,
        resourceAbundance: 1.45,
        reproductionRate: 1.2,
        metabolicDemand: 0.9,
        predatorPressure: 1.05,
        environmentalRegeneration: 1.35,
        waterAvailability: 1.35,
      },
    },
    {
      id: 'eco-alpine-fragmentation-stress',
      name: 'Harsh Metabolic Winter & Habitat Scarcity',
      subtitle: 'High Metabolic Burn (1.45x) + Low Resource Abundance',
      description:
        'Organisms face cold alpine metabolic costs across sparse forage patches.',
      hypothesis:
        'Establishing geothermal/oasis winter refuges and mycorrhizal soil enrichment prevents trophic extinction.',
      seed: 70999,
      config: {
        initialHerbivores: 58,
        initialPredators: 9,
        resourceAbundance: 0.68,
        reproductionRate: 0.88,
        metabolicDemand: 1.42,
        predatorPressure: 1.0,
        environmentalRegeneration: 0.75,
        waterAvailability: 0.85,
      },
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
      id: 'eco-add-predator-pack',
      label: 'Reintroduce Northern Wolf Pack (+12)',
      description: 'Releases 12 apex predators across northern timberline zones.',
      category: 'policy',
      commandType: 'introduce_predators',
      defaultPayload: { count: 12 },
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
      id: 'eco-add-migratory-herd',
      label: 'Release Migratory Grazer Herd (+30)',
      description: 'Introduces 30 high-vitality herbivores into savanna and floodplain corridors.',
      category: 'restoration',
      commandType: 'introduce_herbivores',
      defaultPayload: { count: 30 },
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
      id: 'eco-flash-aridification',
      label: 'Trigger Extreme Megadrought (-70% Moisture)',
      description: 'Drains 70% of surface water across all 48 zones for 35 ticks.',
      category: 'crisis',
      commandType: 'trigger_drought',
      defaultPayload: { severity: 0.7, durationTicks: 35 },
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
      id: 'eco-cull-herbivores',
      label: 'Selective Herbivore Culling (-30%)',
      description: 'Reduces overcrowded herbivore population by 30% to prevent overgrazing famine.',
      category: 'policy',
      commandType: 'cull_overgrazing_herd',
      defaultPayload: { cullFraction: 0.3 },
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
    {
      id: 'eco-seed-pollinators',
      label: 'Release Native Pollinator Swarms (+32 Index)',
      description: 'Boosts pollinator density across all 48 zones, accelerating flora seed set and carrying capacity.',
      category: 'restoration',
      commandType: 'boost_pollinator_guilds',
      defaultPayload: { pollinatorBoost: 32, decomposerBoost: 20 },
    },
    {
      id: 'eco-inoculate-mycorrhizae',
      label: 'Inoculate Mycorrhizal Fungal Decomposers (+35)',
      description: 'Accelerates dead-organic-matter recycling into bioavailable soil nutrients.',
      category: 'restoration',
      commandType: 'boost_pollinator_guilds',
      defaultPayload: { pollinatorBoost: 15, decomposerBoost: 35 },
    },
    {
      id: 'eco-clear-invasive-weeds',
      label: 'Eradicate Invasive Weed Canopy (-75% Invasive)',
      description: 'Removes unpalatable invasive weeds and restores native edible forage.',
      category: 'restoration',
      commandType: 'manage_invasive_flora',
      defaultPayload: { invasiveDelta: -45, nativeBiomassBonus: 22 },
    },
    {
      id: 'eco-invasive-outbreak',
      label: 'Simulate Invasive Thorny-Weed Incursion (+42%)',
      description: 'Spreads invasive weeds that crowd out edible native flora.',
      category: 'crisis',
      commandType: 'manage_invasive_flora',
      defaultPayload: { invasiveDelta: 42, nativeBiomassBonus: -18 },
    },
    {
      id: 'eco-trigger-wildfire',
      label: 'Ignite Dry-Steppe Brushfire (East Sector)',
      description: 'Burns dry biomass across eastern zones while releasing mineral ash into soil.',
      category: 'crisis',
      commandType: 'trigger_wildfire_outbreak',
      defaultPayload: { region: 'east', burnFraction: 0.52 },
    },
    {
      id: 'eco-suppress-wildfire',
      label: 'Deploy Aerial Firebreaks & Monsoon Rain (+24% Moisture)',
      description: 'Extinguishes wildfire risk and hydrates dry steppe and forest zones.',
      category: 'restoration',
      commandType: 'suppress_wildfire_hazard',
      defaultPayload: { moistureAdd: 24 },
    },
    {
      id: 'eco-trigger-pathogen',
      label: 'Simulate Epizootic Herd Pathogen Wave',
      description: 'Introduces a metabolic pathogen that lowers organism immunity and energy.',
      category: 'crisis',
      commandType: 'trigger_pathogen_outbreak',
      defaultPayload: { durationTicks: 18, immunityDrop: 28 },
    },
    {
      id: 'eco-wildlife-vaccination',
      label: 'Administer Wildlife Immunity & Electrolytes',
      description: 'Cures pathogen outbreaks and restores organism immunity and hydration.',
      category: 'restoration',
      commandType: 'immunize_wildlife_population',
      defaultPayload: { immunityBoost: 35, energyBoost: 18 },
    },
    {
      id: 'eco-excavate-oasis-springs',
      label: 'Excavate Artesian Wetland Springs (+25% Cap)',
      description: 'Converts central and southern zones into high-moisture wetland oases.',
      category: 'structure',
      commandType: 'construct_ecological_corridors',
      defaultPayload: { capacityBoost: 28, moistureFloor: 82 },
    },
    {
      id: 'eco-rewild-canopy-corridors',
      label: 'Plant Wildlife Migration Corridors (+22 kg/zone)',
      description: 'Connects fragmented habitat patches and increases flora biomass across all 48 zones.',
      category: 'structure',
      commandType: 'construct_ecological_corridors',
      defaultPayload: { capacityBoost: 18, moistureFloor: 72 },
    },
  ],
  metricDefinitions: [
    {
      id: 'herbivoreCount',
      label: 'Herbivore Population',
      unit: 'organisms',
      category: 'Population',
      description: 'Active herbivore grazers in the 48-zone habitat.',
      warningThreshold: 18,
      criticalThreshold: 5,
      higherIsBetter: true,
    },
    {
      id: 'predatorCount',
      label: 'Predator Population',
      unit: 'organisms',
      category: 'Population',
      description: 'Active apex predators in the 48-zone habitat.',
      warningThreshold: 3,
      criticalThreshold: 0,
      higherIsBetter: true,
    },
    {
      id: 'totalOrganismCount',
      label: 'Total Fauna Population',
      unit: 'organisms',
      category: 'Population',
      description: 'Combined herbivore and apex predator count across the basin.',
      higherIsBetter: true,
    },
    {
      id: 'trophicPredatorPreyRatio',
      label: 'Predator-to-Prey Ratio',
      unit: '%',
      category: 'Ecology',
      description: 'Percentage ratio of apex predators to herbivore grazers.',
    },
    {
      id: 'totalPlantBiomass',
      label: 'Total Flora Biomass',
      unit: 'kg',
      category: 'Resources',
      description: 'Aggregate edible primary producer biomass across all 48 habitat zones.',
      warningThreshold: 1200,
      criticalThreshold: 600,
      higherIsBetter: true,
    },
    {
      id: 'meanZoneBiomassKg',
      label: 'Mean Patch Biomass Density',
      unit: 'kg/zone',
      category: 'Resources',
      description: 'Average standing flora biomass per habitat zone.',
      higherIsBetter: true,
    },
    {
      id: 'totalCarryingCapacityKg',
      label: 'Basin Flora Carrying Capacity',
      unit: 'kg',
      category: 'Resources',
      description: 'Sum of maximum supportable flora biomass across all 48 zones.',
      higherIsBetter: true,
    },
    {
      id: 'meanMoisture',
      label: 'Mean Habitat Moisture',
      unit: '%',
      category: 'Environment',
      comparableDimension: 'water_flux_rate',
      description: 'Average hydrological soil moisture across all 48 habitat zones.',
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
      id: 'meanPollinatorIndex',
      label: 'Mean Pollinator Guild Index',
      unit: 'idx',
      category: 'Ecology',
      description: 'Average native pollinator abundance driving flora reproduction.',
      warningThreshold: 42,
      criticalThreshold: 25,
      higherIsBetter: true,
    },
    {
      id: 'meanDecomposerActivity',
      label: 'Fungal Decomposer Activity',
      unit: 'idx',
      category: 'Ecology',
      description: 'Average mycorrhizal and detritivore nutrient recycling rate.',
      higherIsBetter: true,
    },
    {
      id: 'meanInvasiveSpreadPct',
      label: 'Invasive Weed Coverage',
      unit: '%',
      category: 'Hazards',
      description: 'Average percentage of zone carrying capacity displaced by invasive weeds.',
      warningThreshold: 28,
      criticalThreshold: 45,
      higherIsBetter: false,
    },
    {
      id: 'meanFireHazardIndex',
      label: 'Wildfire Hazard Index',
      unit: 'idx',
      category: 'Hazards',
      description: 'Average brushfire ignition risk driven by low moisture and dry fuel.',
      warningThreshold: 52,
      criticalThreshold: 72,
      higherIsBetter: false,
    },
    {
      id: 'meanOrganismEnergy',
      label: 'Mean Fauna Metabolic Energy',
      unit: 'kcal',
      category: 'Health',
      description: 'Average energy reserve across all living herbivores and predators.',
      warningThreshold: 45,
      criticalThreshold: 28,
      higherIsBetter: true,
    },
    {
      id: 'meanOrganismHydration',
      label: 'Mean Fauna Hydration',
      unit: '%',
      category: 'Health',
      description: 'Average hydration level across all living organisms.',
      warningThreshold: 48,
      criticalThreshold: 30,
      higherIsBetter: true,
    },
    {
      id: 'cumulativeBirths',
      label: 'Cumulative Fauna Births',
      unit: 'births',
      category: 'Demographics',
      description: 'Total offspring born since simulation Genesis.',
      higherIsBetter: true,
    },
    {
      id: 'cumulativeDeaths',
      label: 'Cumulative Fauna Mortality',
      unit: 'deaths',
      category: 'Demographics',
      description: 'Total organism deaths (starvation, predation, dehydration, old age).',
    },
    {
      id: 'ecosystemHealthIndex',
      label: 'Ecosystem Stability Index',
      unit: '%',
      category: 'Health',
      comparableDimension: 'system_stability_ratio',
      description:
        'Composite ecological vitality score (0-100%) combining biomass adequacy, moisture, pollinators, and trophic diversity.',
      warningThreshold: 50,
      criticalThreshold: 28,
      higherIsBetter: true,
    },
  ],

  initializeWorld(config, rng) {
    const zStream = rng.stream('zones');
    const zones: HabitatZone[] = [];

    for (let gz = 0; gz < ECO_ROWS; gz++) {
      for (let gx = 0; gx < ECO_COLS; gx++) {
        const idx = gz * ECO_COLS + gx;
        const centerX = roundDet(-42 + gx * 12, 2);
        const centerZ = roundDet(-30 + gz * 12, 2);
        const distFromCenter = Math.hypot(centerX, centerZ) / 52;
        const isOasis = gx >= 2 && gx <= 5 && gz >= 1 && gz <= 4;

        let biome: BiomeKind = 'savanna_meadow';
        if (isOasis && (gx + gz) % 2 === 0) {
          biome = 'wetland_marsh';
        } else if (gx <= 1) {
          biome = 'riparian_grove';
        } else if (gx >= 6 && gz <= 2) {
          biome = 'alpine_ridge';
        } else if (gx >= 6) {
          biome = 'arid_steppe';
        } else if (gz >= 4) {
          biome = 'canopy_forest';
        }

        const baseMoisture = clampDet(
          (biome === 'wetland_marsh'
            ? 84
            : biome === 'riparian_grove'
              ? 76
              : biome === 'arid_steppe'
                ? 44
                : 66 - distFromCenter * 12) *
            config.waterAvailability +
            zStream.nextRange(-5, 5),
          15,
          100,
        );
        const baseNutrients = clampDet(
          70 * config.resourceAbundance + zStream.nextRange(-7, 7),
          20,
          100,
        );
        const carryingCap = roundDet(
          112 * config.resourceAbundance * (isOasis ? 1.22 : 1.0),
          1,
        );
        const initialBiomass = clampDet(
          carryingCap * 0.78 + zStream.nextRange(-9, 9),
          15,
          160,
        );

        zones.push({
          id: `zone-${idx + 1}`,
          label: ZONE_LABELS[idx] ?? `Sector ${idx + 1}`,
          biome,
          gridX: gx,
          gridZ: gz,
          centerX,
          centerZ,
          elevation: roundDet(
            biome === 'alpine_ridge' ? 2.4 : biome === 'wetland_marsh' ? 0.35 : 0.9 + distFromCenter * 1.1,
            2,
          ),
          moisture: roundDet(baseMoisture, 2),
          soilNutrients: roundDet(baseNutrients, 2),
          plantBiomass: roundDet(initialBiomass, 2),
          carryingCapacity: carryingCap,
          pollinatorIndex: roundDet(clampDet(68 * config.environmentalRegeneration + zStream.nextRange(-6, 6), 20, 100), 1),
          decomposerActivity: roundDet(clampDet(65 * config.environmentalRegeneration + zStream.nextRange(-5, 5), 20, 100), 1),
          invasiveSpreadPct: roundDet(zStream.nextRange(4, 12), 1),
          fireHazardIndex: roundDet(Math.max(5, 85 - baseMoisture * 0.8), 1),
        });
      }
    }

    const state: EcosystemState = {
      nextOrganismId: 1,
      zones,
      organisms: [],
      droughtTicksRemaining: 0,
      droughtSeverity: 0,
      pathogenOutbreakTicks: 0,
      seasonalRainBonus: 0,
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
      name: '48-Zone Hydrology, Pollinators, Nutrient Cycling & Flora Production',
      order: 10,
      step(ctx) {
        const { state, config, rng, tick } = ctx;
        const envStream = rng.stream('environment');

        const isDrought = state.droughtTicksRemaining > 0;
        if (isDrought) {
          state.droughtTicksRemaining -= 1;
        }
        if (state.pathogenOutbreakTicks > 0) {
          state.pathogenOutbreakTicks -= 1;
        }

        const beforeTotalBiomass = state.zones.reduce((s, z) => s + z.plantBiomass, 0);

        for (const zone of state.zones) {
          const isWetland =
            zone.biome === 'wetland_marsh' || zone.biome === 'riparian_grove';
          const targetMoisture = clampDet(
            ((isWetland ? 82 : 60) * config.waterAvailability + state.seasonalRainBonus) *
              (isDrought ? 1 - state.droughtSeverity : 1),
            8,
            100,
          );
          const moistureDelta =
            (targetMoisture - zone.moisture) * 0.16 + envStream.nextRange(-0.8, 0.8);
          zone.moisture = roundDet(clampDet(zone.moisture + moistureDelta, 5, 100), 2);

          // Fungal decomposer mineral replenishment
          const decompBonus = (zone.decomposerActivity / 70) * 0.6;
          zone.soilNutrients = roundDet(
            clampDet(
              zone.soilNutrients + decompBonus * config.environmentalRegeneration,
              10,
              100,
            ),
            2,
          );

          // Pollinator dynamics
          const floraSupport = clampDet(zone.plantBiomass / 90, 0.3, 1.3);
          zone.pollinatorIndex = roundDet(
            clampDet(
              zone.pollinatorIndex + (floraSupport * 68 - zone.pollinatorIndex) * 0.08,
              12,
              100,
            ),
            1,
          );

          // Fire hazard index
          zone.fireHazardIndex = roundDet(
            clampDet(90 - zone.moisture * 0.85 + zone.invasiveSpreadPct * 0.25, 4, 100),
            1,
          );

          // Logistic plant growth constrained by moisture, nutrients, pollinators, and invasive competition
          const moistureFactor = clampDet(zone.moisture / 68, 0.08, 1.35);
          const nutrientFactor = clampDet(zone.soilNutrients / 72, 0.15, 1.35);
          const pollinatorFactor = clampDet(zone.pollinatorIndex / 65, 0.45, 1.3);
          const invasivePenalty = clampDet(1 - zone.invasiveSpreadPct / 150, 0.4, 1.0);

          const effectiveCap = Math.max(
            20,
            zone.carryingCapacity * moistureFactor * config.resourceAbundance * invasivePenalty,
          );

          const growthRate =
            0.14 *
            config.environmentalRegeneration *
            moistureFactor *
            nutrientFactor *
            pollinatorFactor;
          const logisticGrowth =
            growthRate *
              zone.plantBiomass *
              (1 - zone.plantBiomass / Math.max(25, effectiveCap)) +
            1.8 * moistureFactor * config.environmentalRegeneration;

          const desiccation = zone.moisture < 24 ? (24 - zone.moisture) * 0.22 : 0;
          const netGrowth = logisticGrowth - desiccation;

          zone.plantBiomass = roundDet(
            clampDet(zone.plantBiomass + netGrowth, 2, 160),
            2,
          );
          if (netGrowth > 0) {
            zone.soilNutrients = roundDet(
              clampDet(zone.soilNutrients - netGrowth * 0.07, 8, 100),
              2,
            );
          }
        }

        const afterTotalBiomass = state.zones.reduce((s, z) => s + z.plantBiomass, 0);
        if (
          beforeTotalBiomass >= 1080 &&
          afterTotalBiomass < 1080 &&
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
              severity: roundDet(clampDet(1 - afterTotalBiomass / 3600, 0.15, 0.85), 2),
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
      name: 'Organism Perception, Spatial Steering & Trophic Feeding',
      order: 20,
      step(ctx) {
        const { state, config, rng } = ctx;
        const moveStream = rng.stream('movement');

        state.organisms.sort((a, b) =>
          a.id.localeCompare(b.id, undefined, { numeric: true }),
        );

        const removedPreyIds = new Set<string>();
        const predators = state.organisms.filter((o) => o.species === 'predator');
        const herbivores = state.organisms.filter((o) => o.species === 'herbivore');

        for (const herb of herbivores) {
          herb.prevX = herb.x;
          herb.prevZ = herb.z;

          let nearestPred: OrganismEntity | null = null;
          let minPredDist = 14.0;
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
            herb.vx = roundDet((dx / norm) * 2.2, 3);
            herb.vz = roundDet((dz / norm) * 2.2, 3);
          } else {
            const currentZone = findZoneForCoord(state.zones, herb.x, herb.z);
            if (currentZone.plantBiomass < 28 || currentZone.moisture < 25) {
              let bestZone = currentZone;
              let bestScore = currentZone.plantBiomass + currentZone.moisture * 0.5;
              for (const candidate of state.zones) {
                const distPenalty =
                  Math.hypot(candidate.centerX - herb.x, candidate.centerZ - herb.z) * 0.45;
                const score = candidate.plantBiomass + candidate.moisture * 0.5 - distPenalty;
                if (score > bestScore) {
                  bestScore = score;
                  bestZone = candidate;
                }
              }
              const dx = bestZone.centerX - herb.x + moveStream.nextRange(-1.5, 1.5);
              const dz = bestZone.centerZ - herb.z + moveStream.nextRange(-1.5, 1.5);
              const norm = Math.max(0.01, Math.hypot(dx, dz));
              herb.vx = roundDet((dx / norm) * 1.55, 3);
              herb.vz = roundDet((dz / norm) * 1.55, 3);
              herb.lastAction = 'foraging';
            } else {
              herb.vx = roundDet(
                clampDet(herb.vx * 0.7 + moveStream.nextRange(-0.65, 0.65), -1.5, 1.5),
                3,
              );
              herb.vz = roundDet(
                clampDet(herb.vz * 0.7 + moveStream.nextRange(-0.65, 0.65), -1.5, 1.5),
                3,
              );
              herb.lastAction = 'foraging';
            }
          }

          herb.x = roundDet(clampDet(herb.x + herb.vx, -45.5, 45.5), 3);
          herb.z = roundDet(clampDet(herb.z + herb.vz, -33.5, 33.5), 3);

          const zone = findZoneForCoord(state.zones, herb.x, herb.z);
          const desiredBite = Math.min(4.2, Math.max(0, 105 - herb.energy) * 0.18);
          const actualBite = Math.min(zone.plantBiomass - 1.5, Math.max(0, desiredBite));
          if (actualBite > 0.1) {
            zone.plantBiomass = roundDet(zone.plantBiomass - actualBite, 2);
            herb.energy = roundDet(clampDet(herb.energy + actualBite * 2.55, 0, 115), 2);
          }

          const waterIntake = (zone.moisture / 100) * 5.2;
          herb.hydration = roundDet(clampDet(herb.hydration + waterIntake, 0, 100), 2);
        }

        for (const pred of predators) {
          pred.prevX = pred.x;
          pred.prevZ = pred.z;

          let targetHerb: OrganismEntity | null = null;
          let minDist = 32.0;
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
            const huntSpeed = 2.1 * clampDet(config.predatorPressure, 0.5, 1.8);
            pred.vx = roundDet((dx / norm) * huntSpeed, 3);
            pred.vz = roundDet((dz / norm) * huntSpeed, 3);
            pred.x = roundDet(clampDet(pred.x + pred.vx, -45.5, 45.5), 3);
            pred.z = roundDet(clampDet(pred.z + pred.vz, -33.5, 33.5), 3);

            const postDist = Math.hypot(targetHerb.x - pred.x, targetHerb.z - pred.z);
            const catchRadius = 2.6 * clampDet(config.predatorPressure, 0.6, 1.6);
            if (postDist <= catchRadius && pred.energy < 98) {
              removedPreyIds.add(targetHerb.id);
              pred.energy = roundDet(clampDet(pred.energy + 38, 0, 125), 2);
              state.cumulativeDeaths += 1;
              state.deathsByPredation += 1;
              const preyZone = findZoneForCoord(state.zones, targetHerb.x, targetHerb.z);
              preyZone.soilNutrients = roundDet(
                clampDet(preyZone.soilNutrients + 3.5, 0, 100),
                2,
              );
            }
          } else {
            pred.lastAction = 'wandering';
            pred.vx = roundDet(
              clampDet(pred.vx * 0.75 + moveStream.nextRange(-0.8, 0.8), -1.7, 1.7),
              3,
            );
            pred.vz = roundDet(
              clampDet(pred.vz * 0.75 + moveStream.nextRange(-0.8, 0.8), -1.7, 1.7),
              3,
            );
            pred.x = roundDet(clampDet(pred.x + pred.vx, -45.5, 45.5), 3);
            pred.z = roundDet(clampDet(pred.z + pred.vz, -33.5, 33.5), 3);
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
      name: 'Metabolism, Immunity, Reproduction & Lifecycle Mortality',
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

        const pathogenDrain = state.pathogenOutbreakTicks > 0 ? 0.85 : 0;

        for (const org of state.organisms) {
          org.age += 1;
          const speedMag = Math.hypot(org.vx, org.vz);
          const baseBurn = org.species === 'predator' ? 2.45 : 2.05;
          const energyCost =
            (baseBurn + speedMag * 0.38 + pathogenDrain) * config.metabolicDemand;
          const hydrationCost =
            (org.species === 'predator' ? 2.35 : 2.55) *
            (state.droughtTicksRemaining > 0 ? 1.35 : 1.0);

          org.energy = roundDet(org.energy - energyCost, 2);
          org.hydration = roundDet(org.hydration - hydrationCost, 2);

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
              clampDet(deathZone.soilNutrients + 4.8, 0, 100),
              2,
            );
            continue;
          }

          const isHerb = org.species === 'herbivore';
          const energyThreshold = isHerb ? 75 : 85;
          const maxCap = isHerb ? 260 : 85;
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
    const payload = command.payload ?? {};

    switch (command.type) {
      case 'introduce_predators': {
        const count = clampDet(Number(payload.count ?? 6), 1, 50);
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
        const count = clampDet(Number(payload.count ?? 15), 1, 80);
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
          payload.species === 'herbivore' ? 'herbivore' : 'predator';
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

      case 'cull_overgrazing_herd': {
        const frac = clampDet(Number(payload.cullFraction ?? 0.3), 0.1, 0.8);
        const herbs = state.organisms.filter((o) => o.species === 'herbivore');
        const removeCount = Math.max(1, Math.floor(herbs.length * frac));
        const removeSet = new Set(herbs.slice(0, removeCount).map((h) => h.id));
        state.organisms = state.organisms.filter((o) => !removeSet.has(o.id));
        for (const z of state.zones) {
          z.soilNutrients = roundDet(clampDet(z.soilNutrients + 6, 0, 100), 2);
        }
        ctx.emitEvent({
          type: 'herbivore_herd_culled',
          severity: 'info',
          title: `Selective Herd Management (-${removeCount} Herbivores)`,
          description: `Reduced herbivore grazing pressure and recycled nutrients into basin soils.`,
          sourceSystem: 'ecosystem_command',
          payload: { removedCount: removeCount },
        });
        break;
      }

      case 'trigger_drought': {
        const severity = clampDet(Number(payload.severity ?? 0.5), 0.15, 0.85);
        const durationTicks = clampDet(Number(payload.durationTicks ?? 25), 5, 100);
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
        const lossFraction = clampDet(Number(payload.lossFraction ?? 0.55), 0.1, 0.9);
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
          description: `Standing flora biomass dropped from ${beforeBio} kg to ${afterBio} kg across all 48 habitat sectors.`,
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
        const moistureTarget = clampDet(Number(payload.moistureTarget ?? 85), 40, 100);
        const biomassBoost = clampDet(Number(payload.biomassBoost ?? 35), 5, 80);
        const beforeBio = roundDet(
          state.zones.reduce((s, z) => s + z.plantBiomass, 0),
          1,
        );
        state.droughtTicksRemaining = 0;
        state.droughtSeverity = 0;
        state.pathogenOutbreakTicks = 0;
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
        const fertilityBoost = clampDet(Number(payload.fertilityBoost ?? 0.35), 0.05, 1.0);
        const biomassInjection = clampDet(Number(payload.biomassInjection ?? 25), 5, 80);
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
            clampDet(zone.carryingCapacity * (1 + fertilityBoost * 0.25), 50, 200),
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

      case 'boost_pollinator_guilds': {
        const polBoost = Number(payload.pollinatorBoost ?? 30);
        const decBoost = Number(payload.decomposerBoost ?? 20);
        for (const z of state.zones) {
          z.pollinatorIndex = roundDet(clampDet(z.pollinatorIndex + polBoost, 15, 100), 1);
          z.decomposerActivity = roundDet(clampDet(z.decomposerActivity + decBoost, 15, 100), 1);
          z.plantBiomass = roundDet(clampDet(z.plantBiomass + 12, 5, 160), 2);
        }
        ctx.emitEvent({
          type: 'pollinator_guilds_boosted',
          severity: 'positive',
          title: `Pollinator & Mycorrhizal Guilds Enriched (+${polBoost})`,
          description: 'Increased native bee/insect pollination and fungal soil nutrient cycling across all 48 zones.',
          sourceSystem: 'ecosystem_command',
        });
        break;
      }

      case 'manage_invasive_flora': {
        const invDelta = Number(payload.invasiveDelta ?? -40);
        const bioBonus = Number(payload.nativeBiomassBonus ?? 20);
        for (const z of state.zones) {
          z.invasiveSpreadPct = roundDet(clampDet(z.invasiveSpreadPct + invDelta, 0, 90), 1);
          z.plantBiomass = roundDet(clampDet(z.plantBiomass + bioBonus, 5, 160), 2);
        }
        ctx.emitEvent({
          type: 'invasive_flora_managed',
          severity: invDelta < 0 ? 'positive' : 'warning',
          title: invDelta < 0 ? 'Invasive Weed Canopy Eradicated' : 'Invasive Weed Incursion Spread',
          description: `Invasive weed coverage shifted by ${invDelta}% across the 48 habitat zones.`,
          sourceSystem: 'ecosystem_command',
        });
        break;
      }

      case 'trigger_wildfire_outbreak': {
        const burnFrac = clampDet(Number(payload.burnFraction ?? 0.5), 0.15, 0.85);
        for (const z of state.zones) {
          if (z.gridX >= 4) {
            z.plantBiomass = roundDet(Math.max(6, z.plantBiomass * (1 - burnFrac)), 2);
            z.soilNutrients = roundDet(clampDet(z.soilNutrients + 22, 10, 100), 2);
            z.fireHazardIndex = roundDet(clampDet(z.fireHazardIndex + 30, 10, 100), 1);
          }
        }
        ctx.emitEvent({
          type: 'wildfire_outbreak',
          severity: 'critical',
          title: 'Eastern Steppe Brushfire Outbreak',
          description: 'Dry-lightning brushfire consumed eastern flora biomass while depositing mineral ash into soils.',
          sourceSystem: 'ecosystem_command',
        });
        break;
      }

      case 'suppress_wildfire_hazard': {
        const mAdd = Number(payload.moistureAdd ?? 24);
        for (const z of state.zones) {
          z.moisture = roundDet(clampDet(z.moisture + mAdd, 15, 100), 2);
          z.fireHazardIndex = roundDet(Math.max(4, z.fireHazardIndex - 38), 1);
        }
        ctx.emitEvent({
          type: 'wildfire_suppressed',
          severity: 'positive',
          title: 'Aerial Firebreaks & Monsoon Hydration Deployed',
          description: `Added +${mAdd}% soil moisture and suppressed wildfire risk across all 48 zones.`,
          sourceSystem: 'ecosystem_command',
        });
        break;
      }

      case 'trigger_pathogen_outbreak': {
        const dur = Number(payload.durationTicks ?? 18);
        const drop = Number(payload.immunityDrop ?? 28);
        state.pathogenOutbreakTicks = dur;
        for (const o of state.organisms) {
          o.immunity = roundDet(clampDet(o.immunity - drop, 10, 100), 1);
          o.energy = roundDet(Math.max(12, o.energy - 14), 2);
        }
        ctx.emitEvent({
          type: 'pathogen_outbreak_triggered',
          severity: 'warning',
          title: `Epizootic Herd Pathogen Wave (${dur} Ticks)`,
          description: 'Contagion elevated metabolic burn and reduced fauna immunity.',
          sourceSystem: 'ecosystem_command',
        });
        break;
      }

      case 'immunize_wildlife_population': {
        const immBoost = Number(payload.immunityBoost ?? 35);
        const engBoost = Number(payload.energyBoost ?? 18);
        state.pathogenOutbreakTicks = 0;
        for (const o of state.organisms) {
          o.immunity = roundDet(clampDet(o.immunity + immBoost, 20, 100), 1);
          o.energy = roundDet(clampDet(o.energy + engBoost, 20, 115), 2);
          o.hydration = roundDet(clampDet(o.hydration + 20, 30, 100), 2);
        }
        ctx.emitEvent({
          type: 'wildlife_immunized',
          severity: 'positive',
          title: 'Wildlife Probiotic & Immunity Intervention',
          description: 'Cleared pathogen stress and restored fauna metabolic energy and hydration.',
          sourceSystem: 'ecosystem_command',
        });
        break;
      }

      case 'construct_ecological_corridors': {
        const capBoost = Number(payload.capacityBoost ?? 22);
        const mFloor = Number(payload.moistureFloor ?? 75);
        for (const z of state.zones) {
          z.carryingCapacity = roundDet(clampDet(z.carryingCapacity + capBoost, 50, 220), 1);
          z.moisture = roundDet(Math.max(z.moisture, mFloor), 2);
          z.plantBiomass = roundDet(clampDet(z.plantBiomass + 18, 10, 160), 2);
        }
        ctx.emitEvent({
          type: 'ecological_corridors_constructed',
          severity: 'positive',
          title: `Riparian & Canopy Migration Corridors Expanded (+${capBoost} Cap)`,
          description: 'Connected all 48 habitat zones with hydrated green corridors and higher carrying capacity.',
          sourceSystem: 'ecosystem_command',
        });
        break;
      }
    }
  },

  extractMetrics(state) {
    const nZones = Math.max(1, state.zones.length);
    const herbivoreCount = state.organisms.filter(
      (o) => o.species === 'herbivore',
    ).length;
    const predatorCount = state.organisms.filter(
      (o) => o.species === 'predator',
    ).length;
    const totalOrganismCount = state.organisms.length;
    const trophicPredatorPreyRatio = roundDet(
      herbivoreCount > 0 ? (predatorCount / herbivoreCount) * 100 : 0,
      1,
    );

    const totalPlantBiomass = roundDet(
      state.zones.reduce((s, z) => s + z.plantBiomass, 0),
      1,
    );
    const meanZoneBiomassKg = roundDet(totalPlantBiomass / nZones, 1);
    const totalCarryingCapacityKg = roundDet(
      state.zones.reduce((s, z) => s + z.carryingCapacity, 0),
      1,
    );

    const meanMoisture = roundDet(
      state.zones.reduce((s, z) => s + z.moisture, 0) / nZones,
      1,
    );
    const meanSoilNutrients = roundDet(
      state.zones.reduce((s, z) => s + z.soilNutrients, 0) / nZones,
      1,
    );
    const meanPollinatorIndex = roundDet(
      state.zones.reduce((s, z) => s + z.pollinatorIndex, 0) / nZones,
      1,
    );
    const meanDecomposerActivity = roundDet(
      state.zones.reduce((s, z) => s + z.decomposerActivity, 0) / nZones,
      1,
    );
    const meanInvasiveSpreadPct = roundDet(
      state.zones.reduce((s, z) => s + z.invasiveSpreadPct, 0) / nZones,
      1,
    );
    const meanFireHazardIndex = roundDet(
      state.zones.reduce((s, z) => s + z.fireHazardIndex, 0) / nZones,
      1,
    );

    const nOrgs = Math.max(1, state.organisms.length);
    const meanOrganismEnergy = roundDet(
      state.organisms.reduce((s, o) => s + o.energy, 0) / nOrgs,
      1,
    );
    const meanOrganismHydration = roundDet(
      state.organisms.reduce((s, o) => s + o.hydration, 0) / nOrgs,
      1,
    );

    const biomassScore = clampDet((totalPlantBiomass / 3200) * 100, 0, 100);
    const herbScore =
      herbivoreCount === 0
        ? 0
        : herbivoreCount > 210
          ? clampDet(100 - (herbivoreCount - 210) * 0.9, 20, 100)
          : clampDet((herbivoreCount / 55) * 100, 15, 100);
    const predScore = predatorCount > 0 ? clampDet((predatorCount / 10) * 100, 35, 100) : 35;
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
      totalOrganismCount,
      trophicPredatorPreyRatio,
      totalPlantBiomass,
      meanZoneBiomassKg,
      totalCarryingCapacityKg,
      meanMoisture,
      meanSoilNutrients,
      meanPollinatorIndex,
      meanDecomposerActivity,
      meanInvasiveSpreadPct,
      meanFireHazardIndex,
      meanOrganismEnergy,
      meanOrganismHydration,
      cumulativeBirths: state.cumulativeBirths,
      cumulativeDeaths: state.cumulativeDeaths,
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
        label: `${zone.label} (${zone.biome.toUpperCase()})`,
        status,
        position: [zone.centerX, zone.elevation, zone.centerZ],
        summary: `Biomass ${zone.plantBiomass} kg | Moisture ${zone.moisture}% | Nutrients ${zone.soilNutrients} | Pollinators ${zone.pollinatorIndex}`,
        properties: [
          { key: 'biome', label: 'Biome Type', value: zone.biome },
          { key: 'plantBiomass', label: 'Flora Biomass', value: zone.plantBiomass, unit: 'kg' },
          { key: 'moisture', label: 'Soil Moisture', value: zone.moisture, unit: '%' },
          { key: 'soilNutrients', label: 'Soil Nutrients', value: zone.soilNutrients, unit: 'idx' },
          { key: 'carryingCapacity', label: 'Carrying Capacity', value: zone.carryingCapacity, unit: 'kg' },
          { key: 'pollinatorIndex', label: 'Pollinator Index', value: zone.pollinatorIndex, unit: 'idx' },
          { key: 'decomposerActivity', label: 'Decomposer Guild', value: zone.decomposerActivity, unit: 'idx' },
          { key: 'invasiveSpreadPct', label: 'Invasive Weeds', value: zone.invasiveSpreadPct, unit: '%' },
          { key: 'fireHazardIndex', label: 'Fire Hazard', value: zone.fireHazardIndex, unit: 'idx' },
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
          { key: 'immunity', label: 'Immunity', value: org.immunity, unit: '%' },
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
        size: [10.8, Math.max(0.35, z.elevation * 0.7), 10.8],
        value: bioRatio,
        secondaryValue: clampDet(z.moisture / 100, 0, 1),
        status,
        color:
          status === 'critical'
            ? '#8d5524'
            : z.biome === 'wetland_marsh'
              ? '#0d9488'
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
    for (let gz = 0; gz < ECO_ROWS; gz += 2) {
      for (let gx = 0; gx < ECO_COLS - 1; gx += 2) {
        const zA = state.zones[gz * ECO_COLS + gx];
        const zB = state.zones[gz * ECO_COLS + (gx + 1)];
        connections.push({
          id: `eco-cor-${zA.id}-${zB.id}`,
          from: [zA.centerX, 0.35, zA.centerZ],
          to: [zB.centerX, 0.35, zB.centerZ],
          status: zA.moisture > 65 ? 'open' : 'active',
          flowRate: zA.moisture,
          label: `Migration Corridor ${zA.label} <-> ${zB.label}`,
        });
      }
    }

    return {
      worldId: 'ecosystem',
      runId,
      tick,
      ambientStatus,
      entities,
      zones,
      connections,
      hudSummary: {
        'Habitat Zones': state.zones.length,
        Herbivores: metrics.herbivoreCount,
        Predators: metrics.predatorCount,
        'Flora Biomass': `${metrics.totalPlantBiomass} kg`,
        'Mean Moisture': `${metrics.meanMoisture}%`,
        'Health Index': `${metrics.ecosystemHealthIndex}%`,
      },
    };
  },
});
