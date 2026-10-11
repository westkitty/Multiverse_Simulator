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
  SimulationCommand,
} from '../../core/contracts';
import { defineWorldPlugin } from '../../core/pdk';

export interface OceanConfig extends Record<string, unknown> {
  surfaceGyreStrength: number; // 0.3 .. 2.2
  thermohalineUpwellingRate: number; // 0.2 .. 2.2
  surfaceSolarWarming: number; // 0.5 .. 1.8
  nutrientRunoffMultiplier: number; // 0.3 .. 2.5
  oxygenReaerationRate: number; // 0.3 .. 2.0
  pollutionDecayRate: number; // 0.1 .. 1.5
  fishingHarvestPressure: number; // 0.0 .. 1.5
  selectedDepthView: 'all' | 'epipelagic' | 'mesopelagic' | 'bathypelagic';
}

export interface DepthLayerState {
  layer: 'epipelagic' | 'mesopelagic' | 'bathypelagic';
  depthMeters: number;
  temperatureC: number;
  salinityPsu: number;
  pressureBar: number;
  dissolvedOxygenMgL: number;
  nutrientsUmolL: number;
  phytoplanktonBiomass: number;
  detritusMarineSnow: number;
  pollutionIndex: number; // 0..100
}

export interface OceanSector {
  id: string;
  label: string;
  gridX: number; // 0..7 (8 cols)
  gridZ: number; // 0..5 (6 rows) => 48 horizontal sectors
  centerX: number;
  centerZ: number;
  bathymetryMeters: number;
  currentU: number;
  currentV: number;
  upwellingVelocity: number;
  protectedMpa: boolean;
  coralBenthicHealth: number; // 0..100
  carbonatePh: number; // 7.5 .. 8.3
  epipelagic: DepthLayerState; // 0 - 200m
  mesopelagic: DepthLayerState; // 200 - 1000m
  bathypelagic: DepthLayerState; // 1000 - 4000m
}

export interface MarineShoalEntity {
  id: string;
  trophicRole: 'grazer_shoal' | 'apex_pod';
  name: string;
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  depthLayer: 'epipelagic' | 'mesopelagic' | 'bathypelagic';
  depthMeters: number;
  biomassTons: number;
  healthPct: number;
  migrationState: 'foraging' | 'vertical_migration' | 'escaping_hypoxia' | 'spawning';
}

export interface OceanState {
  nextShoalId: number;
  sectors: OceanSector[];
  shoals: MarineShoalEntity[];
  activeDepthFilter: 'all' | 'epipelagic' | 'mesopelagic' | 'bathypelagic';
  gyreMultiplier: number;
  upwellingMultiplier: number;
  thermalAnomalyC: number;
  cumulativePrimaryProduction: number;
  cumulativeHypoxicEvents: number;
  cumulativeCollapseSectors: number;
  lastHypoxiaEventId: string | null;
  lastPollutionEventId: string | null;
  lastThermalEventId: string | null;
}

const oceanConfigSchema = z.object({
  surfaceGyreStrength: z.number().min(0.2).max(2.5),
  thermohalineUpwellingRate: z.number().min(0.1).max(2.5),
  surfaceSolarWarming: z.number().min(0.4).max(2.0),
  nutrientRunoffMultiplier: z.number().min(0.2).max(3.0),
  oxygenReaerationRate: z.number().min(0.2).max(2.5),
  pollutionDecayRate: z.number().min(0.05).max(2.0),
  fishingHarvestPressure: z.number().min(0).max(2.0),
  selectedDepthView: z.enum(['all', 'epipelagic', 'mesopelagic', 'bathypelagic']),
});

const OCEAN_COLS = 8;
const OCEAN_ROWS = 6; // 48 horizontal marine sectors (3x the 16-sector baseline)

const SECTOR_NAMES = [
  'Subpolar Shelf NW', 'Cold Labrador Current', 'Boreal Bank', 'North Greenland Trench', 'Viking Seamount', 'Arctic Gate', 'BarentsSlope', 'Polar Shelf NE',
  'Western Boundary Gyre', 'Sargasso Eddy W', 'Continental Rise W', 'Mid-Ocean Fracture N', 'Azores Guyot', 'Thermohaline Sink', 'Celtic Abyssal Plain', 'Eastern Upwelling N',
  'Gulf Stream Core', 'Subtropical Convergence', 'Pelagic Dome A', 'Hydrothermal Ridge N', 'Atlantis Basin', 'Twilight Canyon', 'Canary Current N', 'Coastal Kelp Bank',
  'Equatorial Counter W', 'Coral Atoll Chain', 'Pelagic Dome B', 'Mid-Trench Vent Field', 'Abyssal Hills', 'Seamount Sanctuary', 'Benguela Upwelling', 'Continental Shelf E',
  'South Gyre Limb W', 'Lagoon Seamount', 'Turquoise Bank', 'Fracture Zone South', 'Hadal Rim West', 'Mariana Analogue', 'Humboldt Cold Plume', 'Estuary Outflow SE',
  'Antarctic Circumpolar W', 'Roaring Forties Sea', 'Subantarctic Ridge', 'Krill Convergence', 'Abyssal Plain S', 'Deep Drake Channel', 'Southern Upwelling', 'Ice-Shelf Margin SE',
];

function getSectorIdx(gx: number, gz: number): number {
  const cx = clampDet(gx, 0, OCEAN_COLS - 1);
  const cz = clampDet(gz, 0, OCEAN_ROWS - 1);
  return cz * OCEAN_COLS + cx;
}

function getSectorAtWorldPos(sectors: OceanSector[], x: number, z: number): OceanSector {
  const gx = clampDet(Math.floor(((x + 48) / 96) * OCEAN_COLS), 0, OCEAN_COLS - 1);
  const gz = clampDet(Math.floor(((z + 36) / 72) * OCEAN_ROWS), 0, OCEAN_ROWS - 1);
  return sectors[getSectorIdx(gx, gz)] ?? sectors[0];
}

function spawnShoal(
  state: OceanState,
  trophicRole: MarineShoalEntity['trophicRole'],
  rng: DeterministicRng,
  x?: number,
  z?: number,
  depthLayer: MarineShoalEntity['depthLayer'] = 'epipelagic',
): MarineShoalEntity {
  const stream = rng.stream('ocean_spawn');
  const id = `shoal-${state.nextShoalId++}`;
  const grazerNames = ['Krill Swarm', 'Forage Herring School', 'Copepod Cloud', 'Lanternfish Shoal', 'Anchoveta Bank'];
  const apexNames = ['Bluefin Pelagic Pod', 'Orca Ecotype Pod', 'Giant Squid Guild', 'Mako Apex Pack', 'Sperm Whale Pod'];
  const list = trophicRole === 'apex_pod' ? apexNames : grazerNames;
  const name = `${list[(state.nextShoalId - 2) % list.length]} #${state.nextShoalId - 1}`;

  const px = roundDet(clampDet(x ?? stream.nextRange(-40, 40), -44, 44), 2);
  const pz = roundDet(clampDet(z ?? stream.nextRange(-28, 28), -32, 32), 2);
  const depthMeters =
    depthLayer === 'epipelagic' ? 85 : depthLayer === 'mesopelagic' ? 520 : 2100;

  const shoal: MarineShoalEntity = {
    id,
    trophicRole,
    name,
    x: px,
    z: pz,
    prevX: px,
    prevZ: pz,
    depthLayer,
    depthMeters,
    biomassTons: roundDet(
      trophicRole === 'apex_pod' ? stream.nextRange(42, 75) : stream.nextRange(85, 145),
      2,
    ),
    healthPct: roundDet(stream.nextRange(82, 98), 2),
    migrationState: 'foraging',
  };
  state.shoals.push(shoal);
  return shoal;
}

export const oceanPlugin = defineWorldPlugin<OceanConfig, OceanState>({
  id: 'ocean',
  name: 'World E — The Abyssal Ocean',
  subtitle: '3-Layer Thermohaline Circulation, Upwelling, Hypoxia & Marine Food Webs',
  version: '2.0.0',
  schemaVersion: 1,
  accentColor: '#06b6d4',
  description:
    'Three-dimensional layered marine laboratory modeling surface wind gyres, deep thermohaline circulation, salinity & thermal stratification, nutrient upwelling, phytoplankton blooms, marine snow decomposition, dissolved oxygen hypoxia, vertical migration, and Marine Protected Areas across 48 horizontal sectors (144 volumetric depth compartments).',
  physicalModelDocumentation: [
    '48 horizontal marine sectors (8x6 basin, 3x the 16-sector baseline), each stratified into 3 coupled vertical depth layers: Epipelagic (0-200m), Mesopelagic Twilight (200-1000m), and Bathypelagic Abyssal (1000-4000m) = 144 volumetric ocean compartments.',
    'Thermohaline & Upwelling Transport: Vertical nutrient flux carries deep regenerated nitrate/phosphate from bathypelagic/mesopelagic reservoirs into the sunlit epipelagic zone.',
    'Eutrophication & Hypoxic Dead Zones: Excess nutrient runoff triggers rapid surface phytoplankton blooms; sinking marine snow detritus is mineralized by deep bacteria, depleting dissolved oxygen (mg/L).',
    'Vertical & Horizontal Marine Migration: Grazer shoals and apex pelagic pods migrate across sectors and depth layers in response to food abundance, hypoxia (<3.0 mg/L O2), thermal stress, and MPA protection.',
  ],
  simplifiedMechanicsNote:
    'Models a 3-layer box-advection ocean column per horizontal sector rather than solving continuous 3D primitive baroclinic Navier-Stokes equations.',
  scaleMetadata: {
    areaUnitLabel: 'horizontal marine sectors (144 volumetric depth cells)',
    baselinePlayableArea: 16,
    expandedPlayableArea: 48,
    baselineTerritoryScalar: 48,
    expandedTerritoryScalar: 144,
    baselineScenarioCount: 3,
    baselineInterventionCount: 6,
    baselineMetricCount: 6,
  },
  configSchema: oceanConfigSchema,
  defaultConfig: {
    surfaceGyreStrength: 1.0,
    thermohalineUpwellingRate: 1.0,
    surfaceSolarWarming: 1.0,
    nutrientRunoffMultiplier: 1.0,
    oxygenReaerationRate: 1.0,
    pollutionDecayRate: 0.45,
    fishingHarvestPressure: 0.25,
    selectedDepthView: 'all',
  },
  scenarios: [
    {
      id: 'ocn-eutrophic-hypoxia-cascade',
      name: 'Eutrophication Bloom & Abyssal Dead Zone',
      subtitle: 'Nutrient Surge -> Algal Bloom -> Marine Snow -> Hypoxic Collapse',
      description:
        'High agricultural nutrient runoff fuels an explosive surface phytoplankton bloom. As organic detritus sinks into the twilight and abyssal layers, microbial respiration strips dissolved oxygen, forcing marine shoals to flee or perish.',
      hypothesis:
        'Curbing nutrient runoff while boosting deep thermohaline ventilation prevents widespread mesopelagic hypoxia (< 2.5 mg/L O2).',
      seed: 50111,
      config: {
        surfaceGyreStrength: 0.85,
        thermohalineUpwellingRate: 0.75,
        surfaceSolarWarming: 1.15,
        nutrientRunoffMultiplier: 2.1,
        oxygenReaerationRate: 0.75,
        pollutionDecayRate: 0.35,
        fishingHarvestPressure: 0.3,
        selectedDepthView: 'all',
      },
    },
    {
      id: 'ocn-thermohaline-shutdown',
      name: 'Thermohaline Conveyor Stagnation & Stratification',
      subtitle: 'Surface Warming + Meltwater Freshening -> Upwelling Collapse',
      description:
        'Warm, low-salinity surface water caps the upper ocean, shutting down vertical mixing and starving the photic zone of abyssal nutrients.',
      hypothesis:
        'Reactivating deep-water brine convection and mechanical upwelling restores epipelagic primary productivity.',
      seed: 50222,
      config: {
        surfaceGyreStrength: 0.7,
        thermohalineUpwellingRate: 0.32,
        surfaceSolarWarming: 1.38,
        nutrientRunoffMultiplier: 0.65,
        oxygenReaerationRate: 0.7,
        pollutionDecayRate: 0.45,
        fishingHarvestPressure: 0.25,
        selectedDepthView: 'all',
      },
    },
    {
      id: 'ocn-toxic-spill-remediation',
      name: 'Western Gyre Chemical Spill & Trophic Contamination',
      subtitle: 'Advected Plume -> Coral Bleaching & Food-Web Toxicity',
      description:
        'At Tick 3, an industrial hydrocarbon and microplastic plume enters the western boundary current and circulates across the basin.',
      hypothesis:
        'Deploying microbial bioremediation and establishing Marine Protected Areas preserves over 80% of pelagic biomass.',
      seed: 50333,
      config: {
        surfaceGyreStrength: 1.3,
        thermohalineUpwellingRate: 1.0,
        surfaceSolarWarming: 1.05,
        nutrientRunoffMultiplier: 1.0,
        oxygenReaerationRate: 1.0,
        pollutionDecayRate: 0.25,
        fishingHarvestPressure: 0.35,
        selectedDepthView: 'all',
      },
      scheduledCommands: [
        {
          tick: 3,
          type: 'inject_pollution_spill',
          label: 'Western Boundary Tanker & Runoff Plume',
          payload: { region: 'west', pollutionDelta: 55 },
        },
      ],
    },
    {
      id: 'ocn-marine-heatwave-bleaching',
      name: 'Equatorial Marine Heatwave & Acidification Crisis',
      subtitle: 'Thermal Spike + Low pH -> Coral & Grazer Mortality',
      description:
        'Intense solar warming lowers dissolved oxygen solubility and accelerates carbonate acidification across shallow banks.',
      hypothesis:
        'Inducing cold abyssal upwelling and alkalinity buffering stabilizes carbonate pH and saves benthic reefs.',
      seed: 50444,
      config: {
        surfaceGyreStrength: 0.9,
        thermohalineUpwellingRate: 0.65,
        surfaceSolarWarming: 1.48,
        nutrientRunoffMultiplier: 0.95,
        oxygenReaerationRate: 0.8,
        pollutionDecayRate: 0.4,
        fishingHarvestPressure: 0.3,
        selectedDepthView: 'epipelagic',
      },
    },
    {
      id: 'ocn-overfishing-trophic-imbalance',
      name: 'Industrial Overharvest & Sanctuary Recovery',
      subtitle: 'Pelagic Depletion vs. Marine Protected Area Network',
      description:
        'Heavy fishing pressure depletes apex pods and grazer shoals outside sanctuaries.',
      hypothesis:
        'Expanding Marine Protected Areas to at least 50% of sectors allows shoal biomass to rebound within 25 ticks.',
      seed: 50555,
      config: {
        surfaceGyreStrength: 1.05,
        thermohalineUpwellingRate: 1.15,
        surfaceSolarWarming: 1.0,
        nutrientRunoffMultiplier: 1.1,
        oxygenReaerationRate: 1.1,
        pollutionDecayRate: 0.5,
        fishingHarvestPressure: 1.25,
        selectedDepthView: 'all',
      },
    },
    {
      id: 'ocn-eastern-upwelling-oasis',
      name: 'Humboldt-Benguela Upwelling Super-Bloom',
      subtitle: 'Cold Nutrient-Rich Deep Water -> Pelagic Megafauna Surge',
      description:
        'Vigorous eastern boundary upwelling pumps cold, nitrate-rich deep water to the sunlit surface, supporting dense grazer and apex populations.',
      hypothesis:
        'Maintaining balanced upwelling without excessive anthropogenic runoff sustains high biomass without triggering bottom hypoxia.',
      seed: 50666,
      config: {
        surfaceGyreStrength: 1.25,
        thermohalineUpwellingRate: 1.65,
        surfaceSolarWarming: 0.92,
        nutrientRunoffMultiplier: 1.15,
        oxygenReaerationRate: 1.25,
        pollutionDecayRate: 0.55,
        fishingHarvestPressure: 0.18,
        selectedDepthView: 'all',
      },
    },
    {
      id: 'ocn-twilight-zone-migration',
      name: 'Mesopelagic Diel Vertical Migration Observatory',
      subtitle: 'Twilight Layer Lanternfish & Carbon Biological Pump',
      description:
        'Focuses on the 200-1000m mesopelagic twilight layer where migrating shoals transfer carbon and consume sinking marine snow.',
      hypothesis:
        'Protecting mesopelagic oxygen minimum zones keeps the biological carbon pump operating efficiently.',
      seed: 50777,
      config: {
        surfaceGyreStrength: 1.0,
        thermohalineUpwellingRate: 1.1,
        surfaceSolarWarming: 1.0,
        nutrientRunoffMultiplier: 1.25,
        oxygenReaerationRate: 0.95,
        pollutionDecayRate: 0.45,
        fishingHarvestPressure: 0.2,
        selectedDepthView: 'mesopelagic',
      },
    },
    {
      id: 'ocn-abyssal-hydrothermal-vents',
      name: 'Bathypelagic Trench & Hydrothermal Plume Lab',
      subtitle: '1000-4000m Abyssal Circulation & Mineral Enrichment',
      description:
        'Explores deep-ocean mineral enrichment, cold bottom currents, and high-pressure benthic habitats.',
      hypothesis:
        'Deep current acceleration distributes hydrothermal minerals across the basin floor and feeds distant upwelling zones.',
      seed: 50888,
      config: {
        surfaceGyreStrength: 0.95,
        thermohalineUpwellingRate: 1.4,
        surfaceSolarWarming: 0.95,
        nutrientRunoffMultiplier: 1.05,
        oxygenReaerationRate: 1.05,
        pollutionDecayRate: 0.5,
        fishingHarvestPressure: 0.15,
        selectedDepthView: 'bathypelagic',
      },
    },
    {
      id: 'ocn-balanced-pelagic-basin',
      name: 'Balanced Three-Layer Ocean Baseline',
      subtitle: 'Nominal Gyre, Upwelling & Trophic Equilibrium',
      description:
        'Reference 48-sector, 3-depth-layer marine ecosystem for controlled multi-seed oceanographic experiments.',
      hypothesis:
        'Coupled surface-to-abyssal exchange maintains dissolved oxygen above 5.5 mg/L across all three depth horizons.',
      seed: 50999,
      config: {
        surfaceGyreStrength: 1.0,
        thermohalineUpwellingRate: 1.0,
        surfaceSolarWarming: 1.0,
        nutrientRunoffMultiplier: 1.0,
        oxygenReaerationRate: 1.0,
        pollutionDecayRate: 0.45,
        fishingHarvestPressure: 0.25,
        selectedDepthView: 'all',
      },
    },
  ],
  quickInterventions: [
    {
      id: 'ocn-view-all-layers',
      label: 'Depth View: Full 3-Layer Column (0-4000m)',
      description: 'Displays Epipelagic, Mesopelagic, and Bathypelagic layers simultaneously.',
      category: 'policy',
      commandType: 'select_depth_layer',
      defaultPayload: { layer: 'all' },
    },
    {
      id: 'ocn-view-epipelagic',
      label: 'Depth View: Epipelagic Sunlit Zone (0-200m)',
      description: 'Focuses inspection and rendering on the sunlit surface layer.',
      category: 'policy',
      commandType: 'select_depth_layer',
      defaultPayload: { layer: 'epipelagic' },
    },
    {
      id: 'ocn-view-mesopelagic',
      label: 'Depth View: Mesopelagic Twilight Zone (200-1000m)',
      description: 'Focuses inspection and rendering on the mesopelagic oxygen minimum & migration layer.',
      category: 'policy',
      commandType: 'select_depth_layer',
      defaultPayload: { layer: 'mesopelagic' },
    },
    {
      id: 'ocn-view-bathypelagic',
      label: 'Depth View: Bathypelagic Abyssal Zone (1000-4000m)',
      description: 'Focuses inspection and rendering on the high-pressure deep ocean trench layer.',
      category: 'policy',
      commandType: 'select_depth_layer',
      defaultPayload: { layer: 'bathypelagic' },
    },
    {
      id: 'ocn-nutrient-upwelling-pulse',
      label: 'Trigger Deep Nutrient Upwelling (+18 µmol/L)',
      description: 'Pumps cold, nitrate-rich bathypelagic water into the sunlit epipelagic layer.',
      category: 'restoration',
      commandType: 'inject_nutrients',
      defaultPayload: { region: 'east', nutrientDelta: 18, coolingDeltaC: -1.8 },
    },
    {
      id: 'ocn-eutrophic-runoff-surge',
      label: 'Trigger Coastal Eutrophic Runoff (+32 µmol/L)',
      description: 'Floods coastal sectors with excess fertilizer nutrients, risking algal bloom & deep hypoxia.',
      category: 'crisis',
      commandType: 'inject_nutrients',
      defaultPayload: { region: 'west', nutrientDelta: 32, coolingDeltaC: 0.8 },
    },
    {
      id: 'ocn-accelerate-gyre',
      label: 'Accelerate Subtropical Gyre (+40% Current)',
      description: 'Increases horizontal current advection and surface oxygen mixing.',
      category: 'policy',
      commandType: 'modify_ocean_currents',
      defaultPayload: { gyreDelta: 0.4, upwellingDelta: 0.25 },
    },
    {
      id: 'ocn-stagnate-currents',
      label: 'Stagnate Thermohaline Conveyor (-45%)',
      description: 'Weakens ocean currents and vertical overturning circulation.',
      category: 'crisis',
      commandType: 'modify_ocean_currents',
      defaultPayload: { gyreDelta: -0.45, upwellingDelta: -0.45 },
    },
    {
      id: 'ocn-marine-heatwave',
      label: 'Trigger Surface Marine Heatwave (+4.2°C)',
      description: 'Warms the epipelagic layer, reducing dissolved oxygen saturation and stressing coral reefs.',
      category: 'crisis',
      commandType: 'alter_ocean_temperature',
      defaultPayload: { layer: 'epipelagic', deltaTempC: 4.2 },
    },
    {
      id: 'ocn-polar-cold-inflow',
      label: 'Inject Polar Deep-Water Inflow (-3.0°C & +O2)',
      description: 'Cools the ocean column and ventilates deep layers with oxygen-rich polar water.',
      category: 'restoration',
      commandType: 'alter_ocean_temperature',
      defaultPayload: { layer: 'all', deltaTempC: -3.0, oxygenBoostMgL: 1.4 },
    },
    {
      id: 'ocn-expand-mpa-network',
      label: 'Establish Basin-Wide Marine Protected Areas',
      description: 'Designates 24 additional sectors as no-take Marine Protected Areas, halting harvest pressure.',
      category: 'policy',
      commandType: 'establish_protected_regions',
      defaultPayload: { coverageFraction: 0.75 },
    },
    {
      id: 'ocn-oxygenate-dead-zones',
      label: 'Deploy Deep-Water Oxygenation & Downwelling',
      description: 'Injects +2.2 mg/L dissolved oxygen into hypoxic mesopelagic and bathypelagic sectors.',
      category: 'restoration',
      commandType: 'ventilate_hypoxic_zones',
      defaultPayload: { oxygenBoostMgL: 2.2 },
    },
    {
      id: 'ocn-pollution-spill',
      label: 'Simulate Chemical & Microplastic Spill (+48)',
      description: 'Introduces a toxic pollutant plume into western surface and twilight sectors.',
      category: 'crisis',
      commandType: 'inject_pollution_spill',
      defaultPayload: { region: 'west', pollutionDelta: 48 },
    },
    {
      id: 'ocn-bioremediation-sweep',
      label: 'Deploy Enzymatic Ocean Bioremediation (-65% Toxins)',
      description: 'Neutralizes chemical and plastic pollution across all three depth horizons.',
      category: 'restoration',
      commandType: 'remediate_ocean_pollution',
      defaultPayload: { removalEfficiency: 0.65 },
    },
    {
      id: 'ocn-alkalinity-enhancement',
      label: 'Ocean Alkalinity Buffering (+0.14 pH)',
      description: 'Spreads crushed olivine minerals to counteract ocean acidification and restore coral health.',
      category: 'structure',
      commandType: 'buffer_ocean_acidity',
      defaultPayload: { deltaPh: 0.14, coralBoost: 15 },
    },
    {
      id: 'ocn-restock-grazer-shoals',
      label: 'Seed Krill & Forage Fish Shoals (+4 Shoals)',
      description: 'Introduces 4 healthy pelagic grazer shoals into nutrient-rich sectors.',
      category: 'restoration',
      commandType: 'seed_marine_life',
      defaultPayload: { role: 'grazer_shoal', count: 4 },
    },
    {
      id: 'ocn-reintroduce-apex-pods',
      label: 'Reintroduce Apex Pelagic Pods (+2 Pods)',
      description: 'Introduces 2 apex predator pods to balance trophic grazing.',
      category: 'restoration',
      commandType: 'seed_marine_life',
      defaultPayload: { role: 'apex_pod', count: 2 },
    },
    {
      id: 'ocn-freshwater-lens-pulse',
      label: 'Glacial Meltwater Salinity Shock (-2.2 PSU)',
      description: 'Freshens northern surface waters, increasing stratification and slowing thermohaline sinking.',
      category: 'crisis',
      commandType: 'alter_salinity_stratification',
      defaultPayload: { deltaSalinityPsu: -2.2 },
    },
  ],
  metricDefinitions: [
    {
      id: 'meanSurfaceTempC',
      label: 'Mean Epipelagic Temperature',
      unit: '°C',
      category: 'Physical',
      comparableDimension: 'temperature_celsius',
      description: 'Average temperature of the 0-200m sunlit surface layer across all 48 sectors.',
      warningThreshold: 24,
      criticalThreshold: 27.5,
      higherIsBetter: false,
    },
    {
      id: 'meanDeepTempC',
      label: 'Mean Bathypelagic Temperature',
      unit: '°C',
      category: 'Physical',
      description: 'Average temperature of the 1000-4000m abyssal layer.',
    },
    {
      id: 'meanSalinityPsu',
      label: 'Mean Surface Salinity',
      unit: 'PSU',
      category: 'Physical',
      description: 'Practical Salinity Units across the upper ocean.',
    },
    {
      id: 'meanSurfaceOxygenMgL',
      label: 'Epipelagic Dissolved Oxygen',
      unit: 'mg/L',
      category: 'Biogeochemistry',
      description: 'Mean dissolved O2 in the surface photic zone.',
      warningThreshold: 5.2,
      criticalThreshold: 3.8,
      higherIsBetter: true,
    },
    {
      id: 'meanTwilightOxygenMgL',
      label: 'Mesopelagic Dissolved Oxygen',
      unit: 'mg/L',
      category: 'Biogeochemistry',
      description: 'Mean dissolved O2 in the 200-1000m twilight layer (oxygen minimum zone).',
      warningThreshold: 3.8,
      criticalThreshold: 2.4,
      higherIsBetter: true,
    },
    {
      id: 'hypoxicSectorCount',
      label: 'Hypoxic Dead-Zone Sectors',
      unit: 'sectors',
      category: 'Hazards',
      description: 'Number of sectors where any depth layer falls below 3.0 mg/L dissolved oxygen.',
      warningThreshold: 5,
      criticalThreshold: 12,
      higherIsBetter: false,
    },
    {
      id: 'meanSurfaceNutrientsUmol',
      label: 'Epipelagic Nutrient Concentration',
      unit: 'µmol/L',
      category: 'Biogeochemistry',
      description: 'Dissolved nitrate/phosphate available for primary production in the photic zone.',
    },
    {
      id: 'totalPhytoplanktonBiomass',
      label: 'Total Phytoplankton Biomass',
      unit: 'kt',
      category: 'Ecology',
      description: 'Integrated primary producer biomass across all 48 epipelagic sectors.',
      warningThreshold: 400,
      criticalThreshold: 220,
      higherIsBetter: true,
    },
    {
      id: 'totalMarineSnowDetritus',
      label: 'Sinking Marine Snow Flux',
      unit: 'kt',
      category: 'Biogeochemistry',
      description: 'Particulate organic detritus sinking through mesopelagic and bathypelagic layers.',
    },
    {
      id: 'grazerShoalBiomassTons',
      label: 'Pelagic Grazer Biomass',
      unit: 'tons',
      category: 'Ecology',
      description: 'Combined biomass of krill, forage fish, and lanternfish shoals.',
      warningThreshold: 650,
      criticalThreshold: 350,
      higherIsBetter: true,
    },
    {
      id: 'apexPodBiomassTons',
      label: 'Apex Predator Pod Biomass',
      unit: 'tons',
      category: 'Ecology',
      description: 'Combined biomass of tuna, cetacean, and apex cephalopod pods.',
      warningThreshold: 160,
      criticalThreshold: 80,
      higherIsBetter: true,
    },
    {
      id: 'activeShoalCount',
      label: 'Active Marine Shoals & Pods',
      unit: 'shoals',
      category: 'Ecology',
      description: 'Total tracked mobile marine populations across the basin.',
      higherIsBetter: true,
    },
    {
      id: 'meanCurrentSpeedMs',
      label: 'Mean Gyre Current Velocity',
      unit: 'm/s',
      category: 'Circulation',
      description: 'Average horizontal surface current speed across the 48 sectors.',
    },
    {
      id: 'meanUpwellingIndex',
      label: 'Vertical Upwelling Flux Index',
      unit: 'm/day',
      category: 'Circulation',
      description: 'Domain-average vertical nutrient upwelling rate.',
      higherIsBetter: true,
    },
    {
      id: 'meanPollutionIndex',
      label: 'Mean Ocean Pollution Index',
      unit: 'idx',
      category: 'Hazards',
      description: 'Average chemical and microplastic contamination across all layers (0-100).',
      warningThreshold: 18,
      criticalThreshold: 35,
      higherIsBetter: false,
    },
    {
      id: 'meanCarbonatePh',
      label: 'Mean Seawater Carbonate pH',
      unit: 'pH',
      category: 'Biogeochemistry',
      description: 'Average ocean pH (lower values indicate ocean acidification).',
      warningThreshold: 7.92,
      criticalThreshold: 7.78,
      higherIsBetter: true,
    },
    {
      id: 'protectedMpaSectors',
      label: 'Marine Protected Area Coverage',
      unit: 'sectors',
      category: 'Policy',
      description: 'Number of sectors designated as no-take Marine Protected Areas.',
      higherIsBetter: true,
    },
    {
      id: 'oceanHealthIndex',
      label: 'Marine Biosphere Health Index',
      unit: '%',
      category: 'Stability',
      comparableDimension: 'system_stability_ratio',
      description: 'Composite marine ecosystem health (oxygenation, coral integrity, trophic balance, low pollution).',
      warningThreshold: 62,
      criticalThreshold: 40,
      higherIsBetter: true,
    },
  ],

  initializeWorld(config, rng) {
    const stream = rng.stream('ocean_init');
    const sectors: OceanSector[] = [];

    for (let gz = 0; gz < OCEAN_ROWS; gz++) {
      for (let gx = 0; gx < OCEAN_COLS; gx++) {
        const idx = gz * OCEAN_COLS + gx;
        const centerX = roundDet(-42 + gx * 12, 2);
        const centerZ = roundDet(-30 + gz * 12, 2);

        // Latitudinal temperature gradient: warmer near middle/south-central, colder at northern/southern edges
        const latWarmth = 1 - Math.abs(gz - 2.5) / 3.2;
        const surfTemp = roundDet(
          clampDet(
            11 + latWarmth * 13 * config.surfaceSolarWarming + stream.nextRange(-1.1, 1.1),
            1.5,
            32,
          ),
          2,
        );
        const mesoTemp = roundDet(clampDet(surfTemp * 0.45 + 3.2, 2.0, 16), 2);
        const bathyTemp = roundDet(clampDet(2.1 + stream.nextRange(-0.4, 0.6), 1.0, 6.0), 2);

        // Clockwise subtropical gyre circulation
        const normX = (gx - 3.5) / 3.5;
        const normZ = (gz - 2.5) / 2.5;
        const currentU = roundDet(normZ * 0.85 * config.surfaceGyreStrength, 2);
        const currentV = roundDet(-normX * 0.75 * config.surfaceGyreStrength, 2);

        // Eastern boundary (gx >= 6) and Divergent zones have higher natural upwelling
        const upwelling = roundDet(
          (gx >= 6 ? 1.85 : gx <= 1 ? 0.65 : 1.05) *
            config.thermohalineUpwellingRate +
            stream.nextRange(-0.15, 0.15),
          2,
        );

        const surfNutrients = roundDet(
          clampDet(
            (8.5 + upwelling * 4.5) * config.nutrientRunoffMultiplier + stream.nextRange(-1.5, 1.5),
            2,
            85,
          ),
          2,
        );
        const phyto = roundDet(clampDet(14 + surfNutrients * 0.95, 4, 95), 2);

        const surfO2 = roundDet(
          clampDet((8.4 - (surfTemp - 12) * 0.11) * config.oxygenReaerationRate, 3.2, 11.5),
          2,
        );
        const mesoO2 = roundDet(
          clampDet(surfO2 * 0.68 - (config.nutrientRunoffMultiplier - 1) * 1.4, 1.4, 9.5),
          2,
        );
        const bathyO2 = roundDet(clampDet(5.6 * config.thermohalineUpwellingRate, 1.8, 9.0), 2);

        sectors.push({
          id: `sec-${gx}-${gz}`,
          label: SECTOR_NAMES[idx] ?? `Marine Sector ${gx}-${gz}`,
          gridX: gx,
          gridZ: gz,
          centerX,
          centerZ,
          bathymetryMeters: roundDet(2200 + Math.abs(gx - 3.5) * 320 + stream.nextRange(-180, 220), 0),
          currentU,
          currentV,
          upwellingVelocity: upwelling,
          protectedMpa: (gx === 3 || gx === 4) && (gz === 2 || gz === 3), // 4 initial core sanctuary sectors
          coralBenthicHealth: roundDet(stream.nextRange(78, 94), 2),
          carbonatePh: roundDet(8.11 - (config.surfaceSolarWarming - 1) * 0.12, 3),
          epipelagic: {
            layer: 'epipelagic',
            depthMeters: 100,
            temperatureC: surfTemp,
            salinityPsu: roundDet(34.8 + latWarmth * 0.6, 2),
            pressureBar: 10,
            dissolvedOxygenMgL: surfO2,
            nutrientsUmolL: surfNutrients,
            phytoplanktonBiomass: phyto,
            detritusMarineSnow: roundDet(phyto * 0.18, 2),
            pollutionIndex: 2.0,
          },
          mesopelagic: {
            layer: 'mesopelagic',
            depthMeters: 600,
            temperatureC: mesoTemp,
            salinityPsu: 34.6,
            pressureBar: 60,
            dissolvedOxygenMgL: mesoO2,
            nutrientsUmolL: roundDet(surfNutrients * 1.65, 2),
            phytoplanktonBiomass: 0,
            detritusMarineSnow: roundDet(phyto * 0.32, 2),
            pollutionIndex: 1.0,
          },
          bathypelagic: {
            layer: 'bathypelagic',
            depthMeters: 2600,
            temperatureC: bathyTemp,
            salinityPsu: 34.9,
            pressureBar: 260,
            dissolvedOxygenMgL: bathyO2,
            nutrientsUmolL: roundDet(28 + upwelling * 6, 2),
            phytoplanktonBiomass: 0,
            detritusMarineSnow: roundDet(phyto * 0.25, 2),
            pollutionIndex: 0.5,
          },
        });
      }
    }

    const state: OceanState = {
      nextShoalId: 1,
      sectors,
      shoals: [],
      activeDepthFilter: config.selectedDepthView,
      gyreMultiplier: config.surfaceGyreStrength,
      upwellingMultiplier: config.thermohalineUpwellingRate,
      thermalAnomalyC: 0,
      cumulativePrimaryProduction: 0,
      cumulativeHypoxicEvents: 0,
      cumulativeCollapseSectors: 0,
      lastHypoxiaEventId: null,
      lastPollutionEventId: null,
      lastThermalEventId: null,
    };

    // Spawn 14 grazer shoals and 5 apex pods across depth layers
    for (let i = 0; i < 14; i++) {
      const layer = i % 3 === 0 ? 'mesopelagic' : 'epipelagic';
      spawnShoal(state, 'grazer_shoal', rng, undefined, undefined, layer);
    }
    for (let i = 0; i < 5; i++) {
      const layer = i === 4 ? 'bathypelagic' : i % 2 === 0 ? 'epipelagic' : 'mesopelagic';
      spawnShoal(state, 'apex_pod', rng, undefined, undefined, layer);
    }

    return state;
  },

  systems: [
    {
      id: 'ocn_1_circulation_and_upwelling',
      name: 'Surface Gyre Advection & Deep Thermohaline Upwelling',
      order: 10,
      step(ctx) {
        const { state, config } = ctx;
        const prevSurfNutrients = state.sectors.map((s) => s.epipelagic.nutrientsUmolL);
        const prevSurfPollution = state.sectors.map((s) => s.epipelagic.pollutionIndex);
        const prevSurfTemp = state.sectors.map((s) => s.epipelagic.temperatureC);

        for (let i = 0; i < state.sectors.length; i++) {
          const sec = state.sectors[i];
          const normX = (sec.gridX - 3.5) / 3.5;
          const normZ = (sec.gridZ - 2.5) / 2.5;

          sec.currentU = roundDet(normZ * 0.85 * state.gyreMultiplier, 2);
          sec.currentV = roundDet(-normX * 0.75 * state.gyreMultiplier, 2);

          // Stratification penalty if surface is too warm or too fresh relative to deep layer
          const densityDiff =
            (sec.bathypelagic.salinityPsu - sec.epipelagic.salinityPsu) * 0.8 +
            (sec.epipelagic.temperatureC - sec.bathypelagic.temperatureC) * 0.08;
          const stratificationDamping = clampDet(1.25 - densityDiff * 0.18, 0.25, 1.35);

          sec.upwellingVelocity = roundDet(
            clampDet(
              (sec.gridX >= 6 ? 1.7 : 1.0) * state.upwellingMultiplier * stratificationDamping,
              0.1,
              3.8,
            ),
            2,
          );

          // Horizontal advection from upstream neighbor
          const upX = clampDet(
            Math.round(sec.gridX - Math.sign(sec.currentU)),
            0,
            OCEAN_COLS - 1,
          );
          const upZ = clampDet(
            Math.round(sec.gridZ - Math.sign(sec.currentV)),
            0,
            OCEAN_ROWS - 1,
          );
          const upIdx = getSectorIdx(upX, upZ);
          const advect = clampDet(Math.hypot(sec.currentU, sec.currentV) * 0.08, 0.02, 0.22);

          sec.epipelagic.nutrientsUmolL = roundDet(
            prevSurfNutrients[i] * (1 - advect) + prevSurfNutrients[upIdx] * advect,
            2,
          );
          sec.epipelagic.pollutionIndex = roundDet(
            prevSurfPollution[i] * (1 - advect) + prevSurfPollution[upIdx] * advect,
            2,
          );

          // Vertical upwelling transfers deep nutrients up and cools the surface slightly
          const upwelledNutrients =
            Math.min(sec.bathypelagic.nutrientsUmolL * 0.08, sec.upwellingVelocity * 1.45);
          sec.bathypelagic.nutrientsUmolL = roundDet(
            clampDet(sec.bathypelagic.nutrientsUmolL - upwelledNutrients * 0.35 + 0.55, 5, 95),
            2,
          );
          sec.epipelagic.nutrientsUmolL = roundDet(
            clampDet(
              sec.epipelagic.nutrientsUmolL +
                upwelledNutrients +
                config.nutrientRunoffMultiplier * 0.45,
              0.5,
              95,
            ),
            2,
          );

          // Thermal relaxation toward solar forcing + thermalAnomalyC - upwelling cooling
          const latWarmth = 1 - Math.abs(sec.gridZ - 2.5) / 3.2;
          const targetSurfTemp =
            11 +
            latWarmth * 13 * config.surfaceSolarWarming +
            state.thermalAnomalyC -
            sec.upwellingVelocity * 0.65;
          sec.epipelagic.temperatureC = roundDet(
            clampDet(
              prevSurfTemp[i] * 0.72 +
                targetSurfTemp * 0.22 +
                prevSurfTemp[upIdx] * 0.06,
              0.5,
              34,
            ),
            2,
          );
          sec.mesopelagic.temperatureC = roundDet(
            clampDet(sec.mesopelagic.temperatureC * 0.88 + sec.epipelagic.temperatureC * 0.055, 1.5, 19),
            2,
          );
        }
      },
    },
    {
      id: 'ocn_2_biogeochemistry_and_oxygen',
      name: 'Phytoplankton Blooms, Marine Snow Sinking & Dissolved Oxygen Budget',
      order: 20,
      step(ctx) {
        const { state, config, tick } = ctx;
        let hypoxicCount = 0;

        for (const sec of state.sectors) {
          // 1. Epipelagic primary production (phytoplankton uptake of nutrients)
          const lightFactor = clampDet(config.surfaceSolarWarming * 0.95, 0.4, 1.6);
          const tempOptimum = clampDet(1 - Math.abs(sec.epipelagic.temperatureC - 18) * 0.03, 0.35, 1.2);
          const pollutionPenalty = clampDet(1 - sec.epipelagic.pollutionIndex * 0.008, 0.2, 1.0);

          const nutrientUptake = Math.min(
            sec.epipelagic.nutrientsUmolL * 0.28,
            4.8 * lightFactor * tempOptimum * pollutionPenalty,
          );

          sec.epipelagic.nutrientsUmolL = roundDet(
            Math.max(0.2, sec.epipelagic.nutrientsUmolL - nutrientUptake),
            2,
          );
          const newGrowth = nutrientUptake * 3.1;
          state.cumulativePrimaryProduction = roundDet(
            state.cumulativePrimaryProduction + newGrowth * 0.1,
            2,
          );

          // Mortality / sinking into marine snow
          const sinkingLoss = sec.epipelagic.phytoplanktonBiomass * 0.16;
          sec.epipelagic.phytoplanktonBiomass = roundDet(
            clampDet(sec.epipelagic.phytoplanktonBiomass + newGrowth - sinkingLoss, 1.5, 120),
            2,
          );

          // 2. Marine snow detritus cascade (Epipelagic -> Mesopelagic -> Bathypelagic)
          sec.epipelagic.detritusMarineSnow = roundDet(
            clampDet(sec.epipelagic.detritusMarineSnow * 0.6 + sinkingLoss * 0.7, 0.5, 80),
            2,
          );
          const snowToMeso = sec.epipelagic.detritusMarineSnow * 0.38;
          sec.mesopelagic.detritusMarineSnow = roundDet(
            clampDet(sec.mesopelagic.detritusMarineSnow * 0.68 + snowToMeso, 0.5, 95),
            2,
          );
          const snowToBathy = sec.mesopelagic.detritusMarineSnow * 0.32;
          sec.bathypelagic.detritusMarineSnow = roundDet(
            clampDet(sec.bathypelagic.detritusMarineSnow * 0.72 + snowToBathy, 0.5, 95),
            2,
          );

          // 3. Bacterial remineralization of marine snow consumes O2 and releases deep nutrients
          const mesoRespirationO2 = sec.mesopelagic.detritusMarineSnow * 0.055;
          const bathyRespirationO2 = sec.bathypelagic.detritusMarineSnow * 0.038;

          sec.mesopelagic.nutrientsUmolL = roundDet(
            clampDet(sec.mesopelagic.nutrientsUmolL + mesoRespirationO2 * 2.8, 2, 95),
            2,
          );
          sec.bathypelagic.nutrientsUmolL = roundDet(
            clampDet(sec.bathypelagic.nutrientsUmolL + bathyRespirationO2 * 3.2, 5, 98),
            2,
          );

          // 4. Dissolved Oxygen budget across all 3 layers
          const o2SaturationSurf = clampDet(9.2 - (sec.epipelagic.temperatureC - 10) * 0.14, 4.5, 11.5);
          const reaeration =
            (o2SaturationSurf - sec.epipelagic.dissolvedOxygenMgL) *
            0.22 *
            config.oxygenReaerationRate *
            clampDet(state.gyreMultiplier, 0.4, 1.8);
          const photosynO2 = newGrowth * 0.045;
          const surfDecayO2 = sec.epipelagic.detritusMarineSnow * 0.04 + sec.epipelagic.pollutionIndex * 0.012;

          sec.epipelagic.dissolvedOxygenMgL = roundDet(
            clampDet(
              sec.epipelagic.dissolvedOxygenMgL + reaeration + photosynO2 - surfDecayO2,
              0.8,
              12.0,
            ),
            2,
          );

          const verticalO2MixMeso =
            (sec.epipelagic.dissolvedOxygenMgL - sec.mesopelagic.dissolvedOxygenMgL) *
            0.09 *
            clampDet(state.upwellingMultiplier, 0.3, 2.0);
          sec.mesopelagic.dissolvedOxygenMgL = roundDet(
            clampDet(
              sec.mesopelagic.dissolvedOxygenMgL + verticalO2MixMeso - mesoRespirationO2 + 0.18,
              0.4,
              10.5,
            ),
            2,
          );

          const deepConveyorO2 = 0.22 * clampDet(state.upwellingMultiplier, 0.25, 2.0);
          sec.bathypelagic.dissolvedOxygenMgL = roundDet(
            clampDet(
              sec.bathypelagic.dissolvedOxygenMgL + deepConveyorO2 - bathyRespirationO2,
              0.5,
              10.0,
            ),
            2,
          );

          if (
            sec.epipelagic.dissolvedOxygenMgL < 3.0 ||
            sec.mesopelagic.dissolvedOxygenMgL < 2.6 ||
            sec.bathypelagic.dissolvedOxygenMgL < 2.4
          ) {
            hypoxicCount++;
          }
        }

        if (hypoxicCount >= 5 && tick % 4 === 0) {
          state.cumulativeHypoxicEvents += 1;
          const ev = ctx.emitEvent({
            type: 'hypoxic_dead_zone_expansion',
            severity: hypoxicCount >= 12 ? 'critical' : 'warning',
            title: `Marine Hypoxia Alert (${hypoxicCount} Sectors < 3.0 mg/L O2)`,
            description: `Microbial decomposition of sinking marine snow and thermal stratification depleted dissolved oxygen across ${hypoxicCount} sectors.`,
            sourceSystem: 'ocn_2_biogeochemistry_and_oxygen',
            affectedEntityIds: state.sectors
              .filter((s) => s.mesopelagic.dissolvedOxygenMgL < 2.8)
              .slice(0, 6)
              .map((s) => s.id),
            payload: {
              hypoxicSectors: hypoxicCount,
              thermalAnomalyC: state.thermalAnomalyC,
            },
            causalLinkType: 'dependency',
            causalExplanation:
              'High surface organic production sank as marine snow into stratified deeper water where bacterial respiration consumed dissolved O2.',
          });
          state.lastHypoxiaEventId = ev.id;
        }
      },
    },
    {
      id: 'ocn_3_marine_foodweb_and_migration',
      name: 'Grazer & Apex Trophic Dynamics, Vertical Migration & MPA Sanctuary Effect',
      order: 30,
      step(ctx) {
        const { state, config, rng, tick } = ctx;
        const stream = rng.stream('ocean_foodweb');

        const surviving: MarineShoalEntity[] = [];
        for (const shoal of state.shoals) {
          shoal.prevX = shoal.x;
          shoal.prevZ = shoal.z;

          const host = getSectorAtWorldPos(state.sectors, shoal.x, shoal.z);
          const layerState = host[shoal.depthLayer];

          // Diel / conditional vertical migration between Epipelagic and Mesopelagic
          if (shoal.trophicRole === 'grazer_shoal') {
            if (
              shoal.depthLayer === 'epipelagic' &&
              host.epipelagic.phytoplanktonBiomass < 12 &&
              host.mesopelagic.dissolvedOxygenMgL > 3.2
            ) {
              shoal.depthLayer = 'mesopelagic';
              shoal.depthMeters = 520;
              shoal.migrationState = 'vertical_migration';
            } else if (
              shoal.depthLayer === 'mesopelagic' &&
              (host.mesopelagic.dissolvedOxygenMgL < 2.8 || host.epipelagic.phytoplanktonBiomass > 22)
            ) {
              shoal.depthLayer = 'epipelagic';
              shoal.depthMeters = 90;
              shoal.migrationState =
                host.mesopelagic.dissolvedOxygenMgL < 2.8 ? 'escaping_hypoxia' : 'foraging';
            }
          }

          // Horizontal steering toward neighbor sector with higher O2 and food
          let bestSector = host;
          let bestScore = -999;
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const cand = state.sectors[getSectorIdx(host.gridX + dx, host.gridZ + dz)];
              const lState = cand[shoal.depthLayer];
              const foodScore =
                shoal.trophicRole === 'grazer_shoal'
                  ? cand.epipelagic.phytoplanktonBiomass * 0.6 + lState.detritusMarineSnow * 0.3
                  : cand.epipelagic.phytoplanktonBiomass * 0.3;
              const o2Score = lState.dissolvedOxygenMgL * 6;
              const pollPenalty = lState.pollutionIndex * 1.2;
              const mpaBonus = cand.protectedMpa ? 8 : 0;
              const score = foodScore + o2Score - pollPenalty + mpaBonus;
              if (score > bestScore) {
                bestScore = score;
                bestSector = cand;
              }
            }
          }

          const dirX = bestSector.centerX - shoal.x;
          const dirZ = bestSector.centerZ - shoal.z;
          const dist = Math.hypot(dirX, dirZ);
          const stepSpeed = shoal.trophicRole === 'apex_pod' ? 2.4 : 1.7;
          if (dist > 0.5) {
            shoal.x = roundDet(
              clampDet(shoal.x + (dirX / dist) * stepSpeed + host.currentU * 0.4, -44, 44),
              2,
            );
            shoal.z = roundDet(
              clampDet(shoal.z + (dirZ / dist) * stepSpeed + host.currentV * 0.4, -32, 32),
              2,
            );
          } else {
            shoal.x = roundDet(
              clampDet(shoal.x + stream.nextRange(-1.5, 1.5) + host.currentU * 0.4, -44, 44),
              2,
            );
            shoal.z = roundDet(
              clampDet(shoal.z + stream.nextRange(-1.5, 1.5) + host.currentV * 0.4, -32, 32),
              2,
            );
          }

          // Feeding & metabolic biomass update
          if (shoal.trophicRole === 'grazer_shoal') {
            const grazeAmount = Math.min(host.epipelagic.phytoplanktonBiomass * 0.14, 6.5);
            host.epipelagic.phytoplanktonBiomass = roundDet(
              Math.max(1.0, host.epipelagic.phytoplanktonBiomass - grazeAmount),
              2,
            );
            const harvestLoss = host.protectedMpa ? 0 : config.fishingHarvestPressure * 1.8;
            const hypoxiaDamage = layerState.dissolvedOxygenMgL < 2.8 ? 5.5 : 0;
            const toxinDamage = layerState.pollutionIndex * 0.08;

            shoal.biomassTons = roundDet(
              clampDet(
                shoal.biomassTons + grazeAmount * 1.35 - 2.4 - harvestLoss - hypoxiaDamage - toxinDamage,
                0,
                220,
              ),
              2,
            );
            shoal.healthPct = roundDet(
              clampDet(
                shoal.healthPct + (layerState.dissolvedOxygenMgL > 4.5 ? 1.8 : -4.2) - toxinDamage,
                0,
                100,
              ),
              2,
            );
          } else {
            // Apex pod hunts nearby grazer shoals
            let preyGain = 1.8;
            for (const other of state.shoals) {
              if (
                other.trophicRole === 'grazer_shoal' &&
                other.biomassTons > 25 &&
                Math.hypot(other.x - shoal.x, other.z - shoal.z) < 15
              ) {
                const taken = Math.min(5.2, other.biomassTons * 0.08);
                other.biomassTons = roundDet(other.biomassTons - taken, 2);
                preyGain += taken * 0.82;
                break;
              }
            }
            const harvestLoss = host.protectedMpa ? 0 : config.fishingHarvestPressure * 1.1;
            const hypoxiaDamage = layerState.dissolvedOxygenMgL < 2.8 ? 3.5 : 0;
            const toxinDamage = layerState.pollutionIndex * 0.1;

            shoal.biomassTons = roundDet(
              clampDet(
                shoal.biomassTons + preyGain - 1.9 - harvestLoss - hypoxiaDamage - toxinDamage,
                0,
                140,
              ),
              2,
            );
            shoal.healthPct = roundDet(
              clampDet(
                shoal.healthPct + (layerState.dissolvedOxygenMgL > 4.2 ? 1.5 : -3.5) - toxinDamage,
                0,
                100,
              ),
              2,
            );
          }

          if (shoal.biomassTons >= 8 && shoal.healthPct >= 10) {
            surviving.push(shoal);
          }
        }

        state.shoals = surviving;

        // Reproduction inside healthy MPA or high-biomass sectors
        if (state.shoals.length < 28 && tick % 3 === 0) {
          for (const s of [...state.shoals]) {
            if (s.biomassTons > 155 && s.trophicRole === 'grazer_shoal' && state.shoals.length < 28) {
              s.biomassTons = roundDet(s.biomassTons * 0.62, 2);
              s.migrationState = 'spawning';
              spawnShoal(state, 'grazer_shoal', rng, s.x + 2, s.z - 2, s.depthLayer);
            }
          }
        }
      },
    },
    {
      id: 'ocn_4_pollution_and_collapse_dynamics',
      name: 'Pollution Remediation, Acidification & Benthic Reef Health',
      order: 40,
      step(ctx) {
        const { state, config, tick } = ctx;
        let collapsedSectors = 0;

        for (const sec of state.sectors) {
          // Natural biodegradation & vertical sinking of pollution
          const decay = clampDet(config.pollutionDecayRate * 0.08, 0.01, 0.25);
          const sinkToMeso = sec.epipelagic.pollutionIndex * 0.05;
          sec.epipelagic.pollutionIndex = roundDet(
            Math.max(0, sec.epipelagic.pollutionIndex * (1 - decay) - sinkToMeso),
            2,
          );
          sec.mesopelagic.pollutionIndex = roundDet(
            Math.max(0, sec.mesopelagic.pollutionIndex * (1 - decay * 0.7) + sinkToMeso * 0.7),
            2,
          );
          sec.bathypelagic.pollutionIndex = roundDet(
            Math.max(0, sec.bathypelagic.pollutionIndex * (1 - decay * 0.5) + sinkToMeso * 0.3),
            2,
          );

          // Carbonate pH and Coral / Benthic Health
          const thermalStress = Math.max(0, sec.epipelagic.temperatureC - 26.5);
          const hypoxiaStress = Math.max(0, 3.5 - sec.epipelagic.dissolvedOxygenMgL);
          const acidStress = Math.max(0, 7.95 - sec.carbonatePh) * 18;
          const mpaRecovery = sec.protectedMpa ? 1.4 : 0.55;

          sec.coralBenthicHealth = roundDet(
            clampDet(
              sec.coralBenthicHealth +
                mpaRecovery -
                thermalStress * 1.4 -
                hypoxiaStress * 1.8 -
                sec.epipelagic.pollutionIndex * 0.09 -
                acidStress,
              0,
              100,
            ),
            2,
          );

          if (sec.coralBenthicHealth < 30 || sec.mesopelagic.dissolvedOxygenMgL < 2.0) {
            collapsedSectors += 1;
          }
        }

        state.cumulativeCollapseSectors = collapsedSectors;
        if (collapsedSectors >= 6 && tick % 6 === 0) {
          ctx.emitEvent({
            type: 'localized_ecosystem_collapse',
            severity: 'critical',
            title: `Localized Marine Collapse (${collapsedSectors} Degraded Sectors)`,
            description: `Combined hypoxia, thermal stress, or pollution reduced benthic habitat health below 30% in ${collapsedSectors} sectors.`,
            sourceSystem: 'ocn_4_pollution_and_collapse_dynamics',
            payload: { collapsedSectors },
            causalLinkType: 'dependency',
            causedByEventId: state.lastHypoxiaEventId ?? state.lastPollutionEventId,
            causalExplanation:
              'Persistent deoxygenation and contamination exceeded benthic resilience thresholds.',
          });
        }
      },
    },
  ],

  applyCommand(state, command: SimulationCommand, ctx) {
    const payload = command.payload ?? {};

    if (command.type === 'select_depth_layer') {
      const layer = String(payload.layer ?? 'all') as OceanState['activeDepthFilter'];
      const before = state.activeDepthFilter;
      state.activeDepthFilter = layer;
      for (const sec of state.sectors) {
        const target =
          layer === 'mesopelagic'
            ? sec.mesopelagic
            : layer === 'bathypelagic'
              ? sec.bathypelagic
              : sec.epipelagic;
        target.dissolvedOxygenMgL = roundDet(
          clampDet(target.dissolvedOxygenMgL + 0.18, 0.2, 12.0),
          2,
        );
      }
      ctx.emitEvent({
        type: 'depth_layer_selected',
        severity: 'info',
        title: `Ocean Depth Horizon Switched (${layer.toUpperCase()})`,
        description: `Observatory depth slice updated from ${before} to ${layer} with active sonar oxygenation sweep.`,
        sourceSystem: 'command_bus',
        deltas: [{ metricOrField: 'activeDepthFilter', before, after: layer }],
        causalLinkType: 'direct',
        causalExplanation: 'Operator changed active 3D bathymetric inspection horizon.',
      });
      return;
    }

    if (command.type === 'inject_nutrients') {
      const region = String(payload.region ?? 'east');
      const delta = Number(payload.nutrientDelta ?? 18);
      const coolDelta = Number(payload.coolingDeltaC ?? -1.0);
      for (const sec of state.sectors) {
        const match =
          region === 'all' ||
          (region === 'east' && sec.gridX >= 4) ||
          (region === 'west' && sec.gridX <= 3);
        if (match) {
          sec.epipelagic.nutrientsUmolL = roundDet(
            clampDet(sec.epipelagic.nutrientsUmolL + delta, 1, 98),
            2,
          );
          sec.epipelagic.phytoplanktonBiomass = roundDet(
            clampDet(sec.epipelagic.phytoplanktonBiomass + delta * 0.85, 2, 120),
            2,
          );
          sec.epipelagic.temperatureC = roundDet(
            clampDet(sec.epipelagic.temperatureC + coolDelta, 1, 34),
            2,
          );
        }
      }
      ctx.emitEvent({
        type: 'nutrient_injection_applied',
        severity: delta > 25 ? 'warning' : 'positive',
        title: `Marine Nutrient Pulse (${region.toUpperCase()} +${delta} µmol/L)`,
        description: `Injected dissolved nitrate/phosphate across ${region} sectors, stimulating phytoplankton bloom.`,
        sourceSystem: 'command_bus',
        payload: { region, nutrientDelta: delta },
        causalLinkType: 'direct',
        causalExplanation: 'Operator enriched photic-zone dissolved macronutrients.',
      });
      return;
    }

    if (command.type === 'modify_ocean_currents') {
      const gyreDelta = Number(payload.gyreDelta ?? 0.35);
      const upwDelta = Number(payload.upwellingDelta ?? 0.25);
      const beforeG = state.gyreMultiplier;
      state.gyreMultiplier = roundDet(clampDet(beforeG + gyreDelta, 0.2, 2.5), 2);
      state.upwellingMultiplier = roundDet(
        clampDet(state.upwellingMultiplier + upwDelta, 0.15, 2.5),
        2,
      );
      for (const sec of state.sectors) {
        sec.upwellingVelocity = roundDet(
          clampDet(sec.upwellingVelocity + upwDelta * 0.8, 0.1, 3.8),
          2,
        );
      }
      ctx.emitEvent({
        type: 'ocean_currents_modified',
        severity: gyreDelta < 0 ? 'warning' : 'positive',
        title: `Gyre & Thermohaline Circulation Updated (${state.gyreMultiplier}x)`,
        description: `Gyre multiplier changed from ${beforeG}x to ${state.gyreMultiplier}x; upwelling multiplier set to ${state.upwellingMultiplier}x.`,
        sourceSystem: 'command_bus',
        deltas: [{ metricOrField: 'gyreMultiplier', before: beforeG, after: state.gyreMultiplier }],
        causalLinkType: 'direct',
        causalExplanation: 'Operator adjusted wind-gyre and thermohaline overturning momentum.',
      });
      return;
    }

    if (command.type === 'alter_ocean_temperature') {
      const deltaTemp = Number(payload.deltaTempC ?? 3.5);
      const o2Boost = Number(payload.oxygenBoostMgL ?? 0);
      const beforeAnom = state.thermalAnomalyC;
      state.thermalAnomalyC = roundDet(clampDet(beforeAnom + deltaTemp, -8, 10), 2);
      for (const sec of state.sectors) {
        sec.epipelagic.temperatureC = roundDet(
          clampDet(sec.epipelagic.temperatureC + deltaTemp, 0.5, 34),
          2,
        );
        if (o2Boost !== 0) {
          sec.epipelagic.dissolvedOxygenMgL = roundDet(
            clampDet(sec.epipelagic.dissolvedOxygenMgL + o2Boost, 1, 12),
            2,
          );
          sec.mesopelagic.dissolvedOxygenMgL = roundDet(
            clampDet(sec.mesopelagic.dissolvedOxygenMgL + o2Boost, 1, 11),
            2,
          );
        }
      }
      const ev = ctx.emitEvent({
        type: 'ocean_thermal_anomaly',
        severity: deltaTemp > 2 ? 'warning' : 'positive',
        title: `Ocean Thermal Shift (${deltaTemp > 0 ? '+' : ''}${deltaTemp}°C)`,
        description: `Surface water temperature shifted by ${deltaTemp}°C across the marine basin.`,
        sourceSystem: 'command_bus',
        payload: { deltaTempC: deltaTemp, thermalAnomalyC: state.thermalAnomalyC },
        causalLinkType: 'direct',
        causalExplanation: 'Direct ocean heat content perturbation applied.',
      });
      state.lastThermalEventId = ev.id;
      return;
    }

    if (command.type === 'establish_protected_regions') {
      const coverage = clampDet(Number(payload.coverageFraction ?? 0.75), 0.1, 1.0);
      const targetCount = Math.round(state.sectors.length * coverage);
      for (let i = 0; i < state.sectors.length; i++) {
        state.sectors[i].protectedMpa = i < targetCount;
        if (state.sectors[i].protectedMpa) {
          state.sectors[i].coralBenthicHealth = roundDet(
            clampDet(state.sectors[i].coralBenthicHealth + 8, 0, 100),
            2,
          );
        }
      }
      ctx.emitEvent({
        type: 'protected_mpa_established',
        severity: 'positive',
        title: `Marine Protected Area Network Expanded (${targetCount} Sectors)`,
        description: `${targetCount} of ${state.sectors.length} sectors are now protected from extractive fishing pressure.`,
        sourceSystem: 'command_bus',
        payload: { protectedSectors: targetCount },
        causalLinkType: 'direct',
        causalExplanation: 'Sanctuary designation eliminated fishing mortality and accelerated benthic recovery.',
      });
      return;
    }

    if (command.type === 'ventilate_hypoxic_zones') {
      const boost = Number(payload.oxygenBoostMgL ?? 2.2);
      for (const sec of state.sectors) {
        sec.epipelagic.dissolvedOxygenMgL = roundDet(
          clampDet(sec.epipelagic.dissolvedOxygenMgL + boost * 0.7, 1, 12),
          2,
        );
        sec.mesopelagic.dissolvedOxygenMgL = roundDet(
          clampDet(sec.mesopelagic.dissolvedOxygenMgL + boost, 1, 11),
          2,
        );
        sec.bathypelagic.dissolvedOxygenMgL = roundDet(
          clampDet(sec.bathypelagic.dissolvedOxygenMgL + boost, 1, 10),
          2,
        );
      }
      ctx.emitEvent({
        type: 'hypoxic_zones_ventilated',
        severity: 'positive',
        title: `Deep-Water Oxygenation (+${boost} mg/L O2)`,
        description: 'Injected oxygenated water into mesopelagic and bathypelagic layers.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Artificial downwelling ventilated deep oxygen minimum zones.',
      });
      return;
    }

    if (command.type === 'inject_pollution_spill') {
      const region = String(payload.region ?? 'west');
      const delta = Number(payload.pollutionDelta ?? 48);
      for (const sec of state.sectors) {
        if (region === 'all' || (region === 'west' && sec.gridX <= 3)) {
          sec.epipelagic.pollutionIndex = roundDet(
            clampDet(sec.epipelagic.pollutionIndex + delta, 0, 100),
            2,
          );
          sec.mesopelagic.pollutionIndex = roundDet(
            clampDet(sec.mesopelagic.pollutionIndex + delta * 0.45, 0, 100),
            2,
          );
          sec.coralBenthicHealth = roundDet(Math.max(5, sec.coralBenthicHealth - delta * 0.25), 2);
        }
      }
      const ev = ctx.emitEvent({
        type: 'marine_pollution_spill',
        severity: 'critical',
        title: `Marine Pollution Plume (+${delta} Contamination)`,
        description: `Chemical and microplastic plume contaminated ${region} ocean sectors.`,
        sourceSystem: 'command_bus',
        payload: { region, pollutionDelta: delta },
        causalLinkType: 'direct',
        causalExplanation: 'Contaminant discharge increased surface and twilight toxicity.',
      });
      state.lastPollutionEventId = ev.id;
      return;
    }

    if (command.type === 'remediate_ocean_pollution') {
      const eff = clampDet(Number(payload.removalEfficiency ?? 0.65), 0.1, 0.95);
      for (const sec of state.sectors) {
        sec.epipelagic.pollutionIndex = roundDet(sec.epipelagic.pollutionIndex * (1 - eff), 2);
        sec.mesopelagic.pollutionIndex = roundDet(sec.mesopelagic.pollutionIndex * (1 - eff), 2);
        sec.bathypelagic.pollutionIndex = roundDet(sec.bathypelagic.pollutionIndex * (1 - eff), 2);
      }
      ctx.emitEvent({
        type: 'ocean_pollution_remediated',
        severity: 'positive',
        title: `Enzymatic Bioremediation Sweep (-${Math.round(eff * 100)}% Toxins)`,
        description: 'Neutralized hydrocarbons and plastic particulates across all depth layers.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Bioremediation agents accelerated contaminant breakdown.',
      });
      return;
    }

    if (command.type === 'buffer_ocean_acidity') {
      const deltaPh = Number(payload.deltaPh ?? 0.14);
      const coralBoost = Number(payload.coralBoost ?? 15);
      for (const sec of state.sectors) {
        sec.carbonatePh = roundDet(clampDet(sec.carbonatePh + deltaPh, 7.5, 8.35), 3);
        sec.coralBenthicHealth = roundDet(clampDet(sec.coralBenthicHealth + coralBoost, 0, 100), 2);
      }
      ctx.emitEvent({
        type: 'alkalinity_buffering_applied',
        severity: 'positive',
        title: `Ocean Alkalinity Enhanced (+${deltaPh} pH)`,
        description: 'Olivine dissolution buffered carbonate acidity and restored calcifying reefs.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Increased carbonate saturation state across shallow and benthic reefs.',
      });
      return;
    }

    if (command.type === 'seed_marine_life') {
      const role = (payload.role === 'apex_pod' ? 'apex_pod' : 'grazer_shoal') as MarineShoalEntity['trophicRole'];
      const count = clampDet(Number(payload.count ?? 3), 1, 8);
      for (let i = 0; i < count; i++) {
        spawnShoal(state, role, ctx.rng, undefined, undefined, 'epipelagic');
      }
      ctx.emitEvent({
        type: 'marine_shoals_seeded',
        severity: 'positive',
        title: `Marine Life Restocked (+${count} ${role === 'apex_pod' ? 'Apex Pods' : 'Grazer Shoals'})`,
        description: `Introduced ${count} healthy ${role} populations into the marine basin.`,
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Direct biological restocking bolstered pelagic trophic guilds.',
      });
      return;
    }

    if (command.type === 'alter_salinity_stratification') {
      const deltaPsu = Number(payload.deltaSalinityPsu ?? -2.0);
      for (const sec of state.sectors) {
        sec.epipelagic.salinityPsu = roundDet(
          clampDet(sec.epipelagic.salinityPsu + deltaPsu, 28, 39),
          2,
        );
      }
      ctx.emitEvent({
        type: 'salinity_stratification_altered',
        severity: deltaPsu < 0 ? 'warning' : 'info',
        title: `Surface Salinity Shift (${deltaPsu > 0 ? '+' : ''}${deltaPsu} PSU)`,
        description: `Altered epipelagic salinity, modifying upper-ocean density stratification.`,
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Freshwater/brine flux altered vertical halocline density gradient.',
      });
    }
  },

  extractMetrics(state) {
    const n = Math.max(1, state.sectors.length);
    const meanSurfTemp =
      state.sectors.reduce((a, s) => a + s.epipelagic.temperatureC, 0) / n;
    const meanDeepTemp =
      state.sectors.reduce((a, s) => a + s.bathypelagic.temperatureC, 0) / n;
    const meanSalinity =
      state.sectors.reduce((a, s) => a + s.epipelagic.salinityPsu, 0) / n;

    const meanSurfO2 =
      state.sectors.reduce((a, s) => a + s.epipelagic.dissolvedOxygenMgL, 0) / n;
    const meanMesoO2 =
      state.sectors.reduce((a, s) => a + s.mesopelagic.dissolvedOxygenMgL, 0) / n;

    const hypoxicCount = state.sectors.filter(
      (s) =>
        s.epipelagic.dissolvedOxygenMgL < 3.0 ||
        s.mesopelagic.dissolvedOxygenMgL < 2.8 ||
        s.bathypelagic.dissolvedOxygenMgL < 2.5,
    ).length;

    const meanNutrients =
      state.sectors.reduce((a, s) => a + s.epipelagic.nutrientsUmolL, 0) / n;
    const totalPhyto = state.sectors.reduce(
      (a, s) => a + s.epipelagic.phytoplanktonBiomass,
      0,
    );
    const totalSnow = state.sectors.reduce(
      (a, s) =>
        a + s.epipelagic.detritusMarineSnow + s.mesopelagic.detritusMarineSnow + s.bathypelagic.detritusMarineSnow,
      0,
    );

    const grazerBiomass = state.shoals
      .filter((sh) => sh.trophicRole === 'grazer_shoal')
      .reduce((a, sh) => a + sh.biomassTons, 0);
    const apexBiomass = state.shoals
      .filter((sh) => sh.trophicRole === 'apex_pod')
      .reduce((a, sh) => a + sh.biomassTons, 0);

    const meanCurrent =
      state.sectors.reduce((a, s) => a + Math.hypot(s.currentU, s.currentV), 0) / n;
    const meanUpwelling =
      state.sectors.reduce((a, s) => a + s.upwellingVelocity, 0) / n;

    const meanPollution =
      state.sectors.reduce(
        (a, s) =>
          a +
          (s.epipelagic.pollutionIndex +
            s.mesopelagic.pollutionIndex +
            s.bathypelagic.pollutionIndex) /
            3,
        0,
      ) / n;

    const meanPh = state.sectors.reduce((a, s) => a + s.carbonatePh, 0) / n;
    const mpaCount = state.sectors.filter((s) => s.protectedMpa).length;
    const meanCoral = state.sectors.reduce((a, s) => a + s.coralBenthicHealth, 0) / n;

    const healthIndex = clampDet(
      meanCoral * 0.35 +
        clampDet(meanMesoO2 * 9, 0, 35) +
        clampDet((grazerBiomass + apexBiomass) / 45, 0, 25) -
        meanPollution * 0.65 -
        hypoxicCount * 1.1,
      5,
      100,
    );

    return {
      meanSurfaceTempC: roundDet(meanSurfTemp, 2),
      meanDeepTempC: roundDet(meanDeepTemp, 2),
      meanSalinityPsu: roundDet(meanSalinity, 2),
      meanSurfaceOxygenMgL: roundDet(meanSurfO2, 2),
      meanTwilightOxygenMgL: roundDet(meanMesoO2, 2),
      hypoxicSectorCount: hypoxicCount,
      meanSurfaceNutrientsUmol: roundDet(meanNutrients, 2),
      totalPhytoplanktonBiomass: roundDet(totalPhyto, 2),
      totalMarineSnowDetritus: roundDet(totalSnow, 2),
      grazerShoalBiomassTons: roundDet(grazerBiomass, 2),
      apexPodBiomassTons: roundDet(apexBiomass, 2),
      activeShoalCount: state.shoals.length,
      meanCurrentSpeedMs: roundDet(meanCurrent, 2),
      meanUpwellingIndex: roundDet(meanUpwelling, 2),
      meanPollutionIndex: roundDet(meanPollution, 2),
      meanCarbonatePh: roundDet(meanPh, 3),
      protectedMpaSectors: mpaCount,
      oceanHealthIndex: roundDet(healthIndex, 2),
    };
  },

  inspectEntities(state) {
    const list: EntityInspection[] = [];

    for (const shoal of state.shoals) {
      list.push({
        entityId: shoal.id,
        kind: shoal.trophicRole,
        label: `${shoal.name} (${shoal.depthLayer.toUpperCase()})`,
        status:
          shoal.healthPct < 45
            ? 'critical'
            : shoal.migrationState === 'escaping_hypoxia'
              ? 'warning'
              : 'nominal',
        position: [shoal.x, shoal.depthLayer === 'epipelagic' ? 2.2 : shoal.depthLayer === 'mesopelagic' ? 1.1 : 0.3, shoal.z],
        summary: `Biomass ${shoal.biomassTons} t • Health ${shoal.healthPct}% • Depth ${shoal.depthMeters}m (${shoal.migrationState})`,
        properties: [
          { key: 'trophicRole', label: 'Trophic Guild', value: shoal.trophicRole },
          { key: 'depthLayer', label: 'Depth Horizon', value: shoal.depthLayer },
          { key: 'depthMeters', label: 'Depth', value: shoal.depthMeters, unit: 'm' },
          { key: 'biomassTons', label: 'Biomass', value: shoal.biomassTons, unit: 'tons' },
          { key: 'healthPct', label: 'Cohort Health', value: shoal.healthPct, unit: '%' },
          { key: 'migrationState', label: 'Behavior', value: shoal.migrationState },
        ],
      });
    }

    for (const sec of state.sectors) {
      const focusLayer =
        state.activeDepthFilter === 'all' ? sec.epipelagic : sec[state.activeDepthFilter];
      const status =
        sec.mesopelagic.dissolvedOxygenMgL < 2.4 || focusLayer.pollutionIndex > 45
          ? 'critical'
          : sec.mesopelagic.dissolvedOxygenMgL < 3.4 || focusLayer.pollutionIndex > 20
            ? 'warning'
            : 'nominal';

      list.push({
        entityId: sec.id,
        kind: sec.protectedMpa ? 'ocean_sector_mpa' : 'ocean_sector',
        label: `${sec.label}${sec.protectedMpa ? ' [MPA SANCTUARY]' : ''}`,
        status,
        position: [sec.centerX, 0.5, sec.centerZ],
        summary: `Surf ${sec.epipelagic.temperatureC}°C • O2 (Surf/Meso/Abyss): ${sec.epipelagic.dissolvedOxygenMgL}/${sec.mesopelagic.dissolvedOxygenMgL}/${sec.bathypelagic.dissolvedOxygenMgL} mg/L • Phyto ${sec.epipelagic.phytoplanktonBiomass} kt`,
        properties: [
          { key: 'bathymetryMeters', label: 'Seafloor Depth', value: sec.bathymetryMeters, unit: 'm' },
          { key: 'protectedMpa', label: 'MPA Sanctuary', value: sec.protectedMpa ? 'PROTECTED' : 'OPEN' },
          { key: 'surfTempC', label: 'Epipelagic Temp (0-200m)', value: sec.epipelagic.temperatureC, unit: '°C' },
          { key: 'mesoTempC', label: 'Mesopelagic Temp (200-1000m)', value: sec.mesopelagic.temperatureC, unit: '°C' },
          { key: 'bathyTempC', label: 'Bathypelagic Temp (1000-4000m)', value: sec.bathypelagic.temperatureC, unit: '°C' },
          { key: 'surfO2', label: 'Epipelagic O2', value: sec.epipelagic.dissolvedOxygenMgL, unit: 'mg/L' },
          { key: 'mesoO2', label: 'Mesopelagic O2', value: sec.mesopelagic.dissolvedOxygenMgL, unit: 'mg/L' },
          { key: 'bathyO2', label: 'Bathypelagic O2', value: sec.bathypelagic.dissolvedOxygenMgL, unit: 'mg/L' },
          { key: 'nutrients', label: 'Surface Nutrients', value: sec.epipelagic.nutrientsUmolL, unit: 'µmol/L' },
          { key: 'phytoplankton', label: 'Phytoplankton Biomass', value: sec.epipelagic.phytoplanktonBiomass, unit: 'kt' },
          { key: 'upwelling', label: 'Upwelling Velocity', value: sec.upwellingVelocity, unit: 'm/day' },
          { key: 'carbonatePh', label: 'Seawater pH', value: sec.carbonatePh, unit: 'pH' },
          { key: 'coralHealth', label: 'Benthic/Coral Health', value: sec.coralBenthicHealth, unit: '%' },
        ],
      });
    }

    return list;
  },

  extractRenderFrame(state, _config, runId, tick): RenderFrameData {
    const zones: RenderZoneVisual[] = state.sectors.map((sec) => {
      const layer =
        state.activeDepthFilter === 'all' ? sec.epipelagic : sec[state.activeDepthFilter];
      const isHypoxic =
        layer.dissolvedOxygenMgL < 3.0 || sec.mesopelagic.dissolvedOxygenMgL < 2.6;

      let color = '#0284c7';
      if (layer.pollutionIndex > 35) {
        color = '#9333ea';
      } else if (isHypoxic) {
        color = '#dc2626';
      } else if (sec.epipelagic.phytoplanktonBiomass > 36) {
        color = '#10b981';
      } else if (sec.protectedMpa) {
        color = '#06b6d4';
      } else if (state.activeDepthFilter === 'bathypelagic') {
        color = '#1e3a8a';
      }

      return {
        id: sec.id,
        label: sec.label,
        position: [sec.centerX, 0.3, sec.centerZ],
        size: [10.8, Math.max(0.45, 0.45 + (sec.epipelagic.phytoplanktonBiomass / 100) * 1.3), 10.8],
        value: roundDet(layer.dissolvedOxygenMgL / 10, 2),
        secondaryValue: sec.epipelagic.phytoplanktonBiomass,
        status: isHypoxic ? 'critical' : layer.pollutionIndex > 20 ? 'warning' : 'nominal',
        color,
      };
    });

    const entities: RenderEntityVisual[] = state.shoals
      .filter(
        (sh) => state.activeDepthFilter === 'all' || sh.depthLayer === state.activeDepthFilter,
      )
      .map((sh) => {
        const yHeight =
          sh.depthLayer === 'epipelagic'
            ? 2.5
            : sh.depthLayer === 'mesopelagic'
              ? 1.45
              : 0.65;
        return {
          id: sh.id,
          kind: sh.trophicRole === 'apex_pod' ? 'predator' : 'herbivore',
          label: `${sh.name} (${sh.depthLayer})`,
          position: [sh.x, yHeight, sh.z],
          prevPosition: [sh.prevX, yHeight, sh.prevZ],
          scale: sh.trophicRole === 'apex_pod' ? [1.5, 1.5, 1.5] : [1.1, 1.1, 1.1],
          color: sh.trophicRole === 'apex_pod' ? '#f59e0b' : '#22d3ee',
          energyOrHealth: roundDet(sh.healthPct / 100, 2),
          status: sh.healthPct < 45 ? 'critical' : sh.migrationState === 'escaping_hypoxia' ? 'warning' : 'nominal',
        };
      });

    const connections: RenderConnectionVisual[] = [];
    for (let gz = 0; gz < OCEAN_ROWS; gz += 2) {
      for (let gx = 0; gx < OCEAN_COLS - 1; gx += 2) {
        const sA = state.sectors[getSectorIdx(gx, gz)];
        const sB = state.sectors[getSectorIdx(gx + 1, gz)];
        const speed = roundDet(Math.hypot(sA.currentU, sA.currentV), 2);
        connections.push({
          id: `gyre-${sA.id}-${sB.id}`,
          from: [sA.centerX, 0.85, sA.centerZ],
          to: [sB.centerX, 0.85, sB.centerZ],
          status: sA.upwellingVelocity > 1.5 ? 'active' : 'open',
          flowRate: speed,
          label: `Gyre Current ${sA.label} -> ${sB.label} (${speed} m/s)`,
        });
      }
    }

    const metrics = this.extractMetrics(state, _config);
    const ambientStatus =
      metrics.oceanHealthIndex < 45 || metrics.hypoxicSectorCount >= 12
        ? 'critical'
        : metrics.oceanHealthIndex < 68 || metrics.hypoxicSectorCount >= 5
          ? 'warning'
          : 'nominal';

    return {
      worldId: 'ocean',
      runId,
      tick,
      ambientStatus,
      entities,
      zones,
      connections,
      hudSummary: {
        Sectors: `${state.sectors.length} (3 Layers = 144 Cells)`,
        'Depth View': state.activeDepthFilter.toUpperCase(),
        'Twilight O2': `${metrics.meanTwilightOxygenMgL} mg/L`,
        'Hypoxic Sectors': metrics.hypoxicSectorCount,
        'Shoals/Pods': state.shoals.length,
      },
    };
  },
});
