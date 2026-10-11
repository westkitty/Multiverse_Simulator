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

export interface AtmosphereConfig extends Record<string, unknown> {
  solarHeatingMultiplier: number; // 0.5 .. 1.8
  coriolisStrength: number; // 0.2 .. 2.0
  evaporationRate: number; // 0.3 .. 2.2
  condensationThreshold: number; // 55 .. 92 (%)
  thermalDiffusionRate: number; // 0.05 .. 0.45
  orographicLiftFactor: number; // 0.3 .. 2.0
  seasonalAmplitudeC: number; // 0 .. 18 (°C)
  aerosolCoolingIndex: number; // 0 .. 1.0
}

export type TerrainSurfaceType = 'ocean' | 'coastal' | 'plains' | 'forest' | 'highland' | 'mountain';

export interface ClimateCell {
  id: string;
  label: string;
  gridX: number; // 0..7 (8 columns)
  gridZ: number; // 0..5 (6 rows) => 48 cells
  centerX: number;
  centerZ: number;
  surfaceType: TerrainSurfaceType;
  elevationKm: number;
  albedo: number;
  pressureHpa: number; // 960 .. 1045 hPa
  temperatureC: number; // -25 .. +48 °C
  humidityPct: number; // 5 .. 100 %
  windU: number; // East-West m/s
  windV: number; // North-South m/s
  windSpeedMs: number;
  cloudCoverPct: number; // 0 .. 100 %
  precipitationMmHr: number; // 0 .. 85 mm/hr
  soilMoisturePct: number; // 0 .. 100 %
  floodDepthCm: number; // 0 .. 250 cm
  droughtStressIndex: number; // 0 .. 100
  convectiveCapeJkg: number; // 0 .. 4500 J/kg
}

export interface StormEntity {
  id: string;
  name: string;
  category: 'depression' | 'tropical_storm' | 'cyclone' | 'supercell';
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  vx: number;
  vz: number;
  centralPressureHpa: number;
  maxSustainedWindMs: number;
  moistureCorePct: number;
  radiusKm: number;
  ageTicks: number;
}

export interface AtmosphereState {
  nextStormId: number;
  cells: ClimateCell[];
  storms: StormEntity[];
  seasonPhaseRad: number;
  globalSolarMultiplier: number;
  stratosphericAerosolLoad: number;
  jetStreamShiftMs: number;
  cloudSeedingActiveTicks: number;
  cumulativeRainfallMm: number;
  cumulativeStormsFormed: number;
  cumulativeFloodEvents: number;
  cumulativeDroughtCells: number;
  lastStormEventId: string | null;
  lastDroughtEventId: string | null;
  lastFloodEventId: string | null;
}

const atmosphereConfigSchema = z.object({
  solarHeatingMultiplier: z.number().min(0.4).max(2.0),
  coriolisStrength: z.number().min(0.1).max(2.5),
  evaporationRate: z.number().min(0.2).max(2.5),
  condensationThreshold: z.number().min(45).max(95),
  thermalDiffusionRate: z.number().min(0.02).max(0.5),
  orographicLiftFactor: z.number().min(0.2).max(2.5),
  seasonalAmplitudeC: z.number().min(0).max(25),
  aerosolCoolingIndex: z.number().min(0).max(1.2),
});

const GRID_COLS = 8;
const GRID_ROWS = 6; // 48 active climate cells (3x the 16-cell baseline)

const REGION_NAMES = [
  'Boreal Sea NW', 'Subpolar Bay', 'Fjord Coast', 'Northern Tundra', 'Taiga Ridge', 'Glacier Peak', 'Siberian Steppe', 'Northeast Sound',
  'Western Ocean', 'Tempest Shoals', 'Estuary Lowland', 'Riverine Valley', 'Central Timberland', 'Alpine Foothills', 'Highland Pass', 'Eastern Shelf',
  'Warm Current W', 'Pelagic Gyre', 'Coastal Marsh', 'Alluvial Plains', 'Heartland Basin', 'Granite Escarpment', 'Cloud Forest', 'Leeward Prairie',
  'Subtropical Bay', 'Coral Bight', 'Delta Wetlands', 'Savanna Corridor', 'Monsoon Plateau', 'Volcanic Massif', 'Rainshadow Basin', 'Arid Badlands',
  'Tradewind Sea', 'Archipelago W', 'Mangrove Coast', 'Floodplain South', 'Redwood Terraces', 'Sierra Crest', 'Dry Mesa', 'Salt Flat East',
  'Equatorial Swell', 'Doldrum Trench', 'Lagoon Peninsula', 'Tropical Lowland', 'Canopy Basin', 'Southern Cordillera', 'Desert Erg', 'Monsoon Strait',
];

function findCellIndex(gx: number, gz: number): number {
  const cx = clampDet(gx, 0, GRID_COLS - 1);
  const cz = clampDet(gz, 0, GRID_ROWS - 1);
  return cz * GRID_COLS + cx;
}

function findCellAtWorldPos(cells: ClimateCell[], x: number, z: number): ClimateCell {
  const gx = clampDet(Math.floor(((x + 48) / 96) * GRID_COLS), 0, GRID_COLS - 1);
  const gz = clampDet(Math.floor(((z + 36) / 72) * GRID_ROWS), 0, GRID_ROWS - 1);
  return cells[findCellIndex(gx, gz)] ?? cells[0];
}

function createStorm(
  state: AtmosphereState,
  rng: DeterministicRng,
  x: number,
  z: number,
  centralPressureHpa = 982,
  windMs = 28,
): StormEntity {
  const stream = rng.stream('storm_spawn');
  const id = `storm-${state.nextStormId++}`;
  const names = ['Vortex Alpha', 'Cyclone Boreas', 'Tempest Zephyr', 'Typhoon Hyperion', 'Gale Astraea', 'Supercell Helios'];
  const name = `${names[(state.nextStormId - 2) % names.length]}-${state.nextStormId - 1}`;
  const category: StormEntity['category'] =
    windMs >= 46
      ? 'cyclone'
      : windMs >= 36
        ? 'supercell'
        : windMs >= 24
          ? 'tropical_storm'
          : 'depression';

  const storm: StormEntity = {
    id,
    name,
    category,
    x: roundDet(clampDet(x, -44, 44), 2),
    z: roundDet(clampDet(z, -32, 32), 2),
    prevX: roundDet(clampDet(x, -44, 44), 2),
    prevZ: roundDet(clampDet(z, -32, 32), 2),
    vx: roundDet(stream.nextRange(1.2, 3.1), 2),
    vz: roundDet(stream.nextRange(-1.4, 1.4), 2),
    centralPressureHpa: roundDet(centralPressureHpa, 1),
    maxSustainedWindMs: roundDet(windMs, 2),
    moistureCorePct: roundDet(stream.nextRange(78, 96), 2),
    radiusKm: roundDet(stream.nextRange(11, 18), 2),
    ageTicks: 0,
  };
  state.storms.push(storm);
  state.cumulativeStormsFormed += 1;
  return storm;
}

export const atmospherePlugin = defineWorldPlugin<AtmosphereConfig, AtmosphereState>({
  id: 'atmosphere',
  name: 'World D — The Living Atmosphere',
  subtitle: 'Synoptic Pressure, Heat Advection, Cyclogenesis & Hydrological Extremes',
  version: '2.0.0',
  schemaVersion: 1,
  accentColor: '#38bdf8',
  description:
    'Regional synoptic meteorology and climate laboratory modeling barometric pressure gradients, geostrophic/Coriolis wind advection, evaporation-condensation cloud physics, orographic precipitation, cyclonic storm systems, and drought-flood cascades across 48 coupled terrain cells.',
  physicalModelDocumentation: [
    '48-cell synoptic mesoscale grid (8x6 cells spanning 10,800 km², 3x the 16-cell baseline) with explicit ocean, coastal, plains, forest, highland, and mountain boundary conditions.',
    'Pressure-gradient & Coriolis wind dynamics: Horizontal wind accelerates from high to low barometric pressure (hPa), deflected by planetary vorticity and damped by terrain roughness.',
    'Thermodynamic moisture cycle: Surface evaporation feeds atmospheric humidity; cooling or orographic uplift across mountain ridges triggers condensation into cloud cover, latent heat release (CAPE), and precipitation runoff.',
    'Autonomous cyclogenesis: Warm, humid low-pressure troughs nucleate tracked StormEntities that advect across the domain, drawing moisture and dumping intense rainfall.',
  ],
  simplifiedMechanicsNote:
    'Uses a 2D hydrostatic shallow-atmosphere approximation with parameterized vertical convection (CAPE) rather than a 3D Navier-Stokes primitive equation solver.',
  scaleMetadata: {
    areaUnitLabel: 'active climate cells (10,800 km² synoptic basin)',
    baselinePlayableArea: 16,
    expandedPlayableArea: 48,
    baselineTerritoryScalar: 3600,
    expandedTerritoryScalar: 10800,
    baselineScenarioCount: 3,
    baselineInterventionCount: 6,
    baselineMetricCount: 6,
  },
  configSchema: atmosphereConfigSchema,
  defaultConfig: {
    solarHeatingMultiplier: 1.0,
    coriolisStrength: 1.0,
    evaporationRate: 1.0,
    condensationThreshold: 72,
    thermalDiffusionRate: 0.18,
    orographicLiftFactor: 1.1,
    seasonalAmplitudeC: 8,
    aerosolCoolingIndex: 0.0,
  },
  scenarios: [
    {
      id: 'atm-supercell-cyclogenesis',
      name: 'Warm-Basin Supercell & Coastal Surge',
      subtitle: 'Marine Heatwave -> Cyclonic Intensification -> Inland Flood',
      description:
        'Elevated solar heating over the western ocean belt builds a deep low-pressure trough and high convective instability (CAPE), spawning multi-cell cyclones that march inland.',
      hypothesis:
        'Deploying stratospheric aerosol cooling or localized marine cloud brightening early reduces peak cyclone wind speed and downstream floodplain inundation.',
      seed: 40111,
      config: {
        solarHeatingMultiplier: 1.24,
        coriolisStrength: 1.25,
        evaporationRate: 1.35,
        condensationThreshold: 68,
        thermalDiffusionRate: 0.2,
        orographicLiftFactor: 1.3,
        seasonalAmplitudeC: 10,
        aerosolCoolingIndex: 0.0,
      },
    },
    {
      id: 'atm-continental-megadrought',
      name: 'Continental Blocking High & Megadrought',
      subtitle: 'Persistent Subsidence Ridge -> Soil Desiccation',
      description:
        'A stagnant high-pressure ridge suppresses cloud formation over the eastern interior plains while moisture remains trapped offshore.',
      hypothesis:
        'Cloud seeding combined with westerly jet stream reinforcement breaks the blocking ridge and restores interior precipitation.',
      seed: 40222,
      config: {
        solarHeatingMultiplier: 1.18,
        coriolisStrength: 0.85,
        evaporationRate: 0.72,
        condensationThreshold: 82,
        thermalDiffusionRate: 0.14,
        orographicLiftFactor: 0.85,
        seasonalAmplitudeC: 12,
        aerosolCoolingIndex: 0.0,
      },
    },
    {
      id: 'atm-monsoon-deluge',
      name: 'Orographic Monsoon Deluge',
      subtitle: 'Moisture Plume Collision with Mountain Cordillera',
      description:
        'Strong onshore moisture transport collides with the central mountain escarpment, producing extreme orographic rainfall on windward slopes and arid rain-shadow conditions leeward.',
      hypothesis:
        'Balancing atmospheric circulation prevents windward flash flooding while delivering moisture across the leeward pass.',
      seed: 40333,
      config: {
        solarHeatingMultiplier: 1.08,
        coriolisStrength: 1.1,
        evaporationRate: 1.45,
        condensationThreshold: 65,
        thermalDiffusionRate: 0.22,
        orographicLiftFactor: 1.75,
        seasonalAmplitudeC: 7,
        aerosolCoolingIndex: 0.0,
      },
    },
    {
      id: 'atm-stratospheric-dimming',
      name: 'Volcanic Aerosol Winter & Jet Shift',
      subtitle: 'High Albedo Sulfate Veil -> Radiative Cooling',
      description:
        'High initial stratospheric aerosol loading reduces solar insolation, cooling the continent and suppressing tropical evaporation.',
      hypothesis:
        'Clearing aerosols or injecting localized thermal plumes prevents sub-freezing crop-zone collapse.',
      seed: 40444,
      config: {
        solarHeatingMultiplier: 0.78,
        coriolisStrength: 1.15,
        evaporationRate: 0.65,
        condensationThreshold: 74,
        thermalDiffusionRate: 0.16,
        orographicLiftFactor: 1.0,
        seasonalAmplitudeC: 14,
        aerosolCoolingIndex: 0.55,
      },
    },
    {
      id: 'atm-polar-vortex-outbreak',
      name: 'Arctic Vortex Meander & Frontal Clash',
      subtitle: 'Sharp Meridional Thermal Gradient -> Baroclinic Instability',
      description:
        'A weakened Coriolis containment allows frigid northern air to plunge southward into warm subtropical moisture, triggering explosive frontal squalls.',
      hypothesis:
        'Stabilizing the zonal jet stream reduces extreme temperature variance and frontal wind shear.',
      seed: 40555,
      config: {
        solarHeatingMultiplier: 0.94,
        coriolisStrength: 0.55,
        evaporationRate: 1.1,
        condensationThreshold: 70,
        thermalDiffusionRate: 0.12,
        orographicLiftFactor: 1.2,
        seasonalAmplitudeC: 18,
        aerosolCoolingIndex: 0.1,
      },
    },
    {
      id: 'atm-atmospheric-river-landfall',
      name: 'Pineapple Express Atmospheric River',
      subtitle: 'Narrow Filament Vapor Transport -> Basin Saturation',
      description:
        'A concentrated corridor of tropical water vapor streams toward the central riverine valley.',
      hypothesis:
        'Diverting circulation and opening floodway retention reduces peak flood depth by over 40%.',
      seed: 40666,
      config: {
        solarHeatingMultiplier: 1.15,
        coriolisStrength: 1.05,
        evaporationRate: 1.6,
        condensationThreshold: 64,
        thermalDiffusionRate: 0.25,
        orographicLiftFactor: 1.5,
        seasonalAmplitudeC: 6,
        aerosolCoolingIndex: 0.0,
      },
    },
    {
      id: 'atm-urban-heat-dome',
      name: 'Interior Thermal Dome & Convective Cap',
      subtitle: 'Radiative Trapping -> Flash Dry-Lightning Risk',
      description:
        'Low thermal diffusion and intense insolation trap a 40°C heat dome over the central heartland basin.',
      hypothesis:
        'Artificial albedo enhancement and moisture injection cool the basin core by at least 4°C.',
      seed: 40777,
      config: {
        solarHeatingMultiplier: 1.38,
        coriolisStrength: 0.75,
        evaporationRate: 0.85,
        condensationThreshold: 80,
        thermalDiffusionRate: 0.08,
        orographicLiftFactor: 0.9,
        seasonalAmplitudeC: 11,
        aerosolCoolingIndex: 0.0,
      },
    },
    {
      id: 'atm-twin-cyclone-fujiwhara',
      name: 'Binary Cyclone Interaction (Fujiwhara Lab)',
      subtitle: 'Dual Low-Pressure Vortices -> Compound Storm Track',
      description:
        'Two tropical storms initialize in adjacent oceanic sectors and interact through overlapping pressure fields.',
      hypothesis:
        'Disrupting the western vortex moisture core prevents binary merger into a Category-5 equivalent cyclone.',
      seed: 40888,
      config: {
        solarHeatingMultiplier: 1.28,
        coriolisStrength: 1.45,
        evaporationRate: 1.4,
        condensationThreshold: 67,
        thermalDiffusionRate: 0.2,
        orographicLiftFactor: 1.15,
        seasonalAmplitudeC: 8,
        aerosolCoolingIndex: 0.0,
      },
      scheduledCommands: [
        {
          tick: 2,
          type: 'spawn_cyclonic_vortex',
          label: 'Secondary Tropical Vortex Formation',
          payload: { x: -24, z: 14, centralPressureHpa: 974, windMs: 38 },
        },
      ],
    },
    {
      id: 'atm-synoptic-equilibrium',
      name: 'Balanced Synoptic Climate Observatory',
      subtitle: 'Nominal Seasonal Cycle & Moderate Frontal Passage',
      description:
        'Reference synoptic baseline across all 48 terrain cells for controlled counterfactual climate experiments.',
      hypothesis:
        'Small perturbations in solar forcing (+10%) produce nonlinear amplification in extreme precipitation events.',
      seed: 40999,
      config: {
        solarHeatingMultiplier: 1.0,
        coriolisStrength: 1.0,
        evaporationRate: 1.0,
        condensationThreshold: 72,
        thermalDiffusionRate: 0.18,
        orographicLiftFactor: 1.1,
        seasonalAmplitudeC: 8,
        aerosolCoolingIndex: 0.0,
      },
    },
  ],
  quickInterventions: [
    {
      id: 'atm-solar-surge',
      label: 'Increase Solar Heating (+18%)',
      description: 'Boosts regional solar irradiance multiplier, warming surfaces and accelerating evaporation.',
      category: 'crisis',
      commandType: 'adjust_solar_forcing',
      defaultPayload: { deltaMultiplier: 0.18 },
    },
    {
      id: 'atm-solar-dimming',
      label: 'Solar Radiation Management (-15%)',
      description: 'Reduces effective solar heating via high-altitude reflective aerosols.',
      category: 'policy',
      commandType: 'adjust_solar_forcing',
      defaultPayload: { deltaMultiplier: -0.15 },
    },
    {
      id: 'atm-inject-moisture-west',
      label: 'Inject Western Marine Moisture Plume',
      description: 'Adds +28% atmospheric humidity across the western oceanic and coastal sectors.',
      category: 'restoration',
      commandType: 'inject_moisture_plume',
      defaultPayload: { region: 'west', humidityBoostPct: 28 },
    },
    {
      id: 'atm-inject-moisture-east',
      label: 'Irrigate Eastern Interior Atmosphere',
      description: 'Releases +26% water vapor across drought-prone eastern interior cells.',
      category: 'restoration',
      commandType: 'inject_moisture_plume',
      defaultPayload: { region: 'east', humidityBoostPct: 26 },
    },
    {
      id: 'atm-spawn-cyclone',
      label: 'Nucleate Mesoscale Cyclone (972 hPa)',
      description: 'Forms a deep cyclonic low-pressure system over the western warm current.',
      category: 'crisis',
      commandType: 'spawn_cyclonic_vortex',
      defaultPayload: { x: -28, z: 4, centralPressureHpa: 972, windMs: 42 },
    },
    {
      id: 'atm-dissipate-storms',
      label: 'Deploy Cryogenic Storm Suppression',
      description: 'Weakens active cyclones by cooling surface inflow and raising central pressure (+14 hPa).',
      category: 'restoration',
      commandType: 'suppress_active_storms',
      defaultPayload: { pressureRiseHpa: 14, windReductionFactor: 0.68 },
    },
    {
      id: 'atm-cloud-seeding',
      label: 'Silver-Iodide Cloud Seeding Campaign',
      description: 'Lowers condensation threshold for 18 ticks, inducing immediate rainfall from humid clouds.',
      category: 'policy',
      commandType: 'trigger_cloud_seeding',
      defaultPayload: { durationTicks: 18, bonusPrecipitationMm: 6.5 },
    },
    {
      id: 'atm-jet-stream-boost',
      label: 'Accelerate Westerly Jet Stream (+8 m/s)',
      description: 'Increases zonal westerly circulation speed, pushing weather systems eastward faster.',
      category: 'policy',
      commandType: 'shift_jet_stream',
      defaultPayload: { deltaZonalWindMs: 8 },
    },
    {
      id: 'atm-jet-stream-block',
      label: 'Induce Atmospheric Blocking Ridge (-7 m/s)',
      description: 'Slows zonal circulation and establishes a high-pressure ridge over the central basin.',
      category: 'crisis',
      commandType: 'shift_jet_stream',
      defaultPayload: { deltaZonalWindMs: -7 },
    },
    {
      id: 'atm-artificial-cooling-core',
      label: 'Artificial Cryo-Cooling (Central Basin -6°C)',
      description: 'Extracts sensible heat from the central interior cells, raising local barometric pressure.',
      category: 'restoration',
      commandType: 'apply_regional_thermal_shock',
      defaultPayload: { region: 'central', deltaTempC: -6, deltaPressureHpa: 7 },
    },
    {
      id: 'atm-heatwave-pulse',
      label: 'Trigger Continental Heat Dome (+7.5°C)',
      description: 'Injects an intense sensible heat anomaly and low-pressure thermal trough.',
      category: 'crisis',
      commandType: 'apply_regional_thermal_shock',
      defaultPayload: { region: 'central', deltaTempC: 7.5, deltaPressureHpa: -8 },
    },
    {
      id: 'atm-aerosol-injection',
      label: 'Stratospheric Sulfate Injection (+0.35)',
      description: 'Increases planetary albedo veil to cool all climate cells and dampen CAPE instability.',
      category: 'policy',
      commandType: 'adjust_aerosol_veil',
      defaultPayload: { deltaAerosol: 0.35 },
    },
    {
      id: 'atm-aerosol-scrub',
      label: 'Scrub Atmospheric Aerosols (-0.35)',
      description: 'Clears particulate veil, restoring full solar transmittance.',
      category: 'restoration',
      commandType: 'adjust_aerosol_veil',
      defaultPayload: { deltaAerosol: -0.35 },
    },
    {
      id: 'atm-flood-drainage',
      label: 'Open Emergency Floodway Spillways',
      description: 'Drains standing floodwater across inundated cells and recharges soil moisture.',
      category: 'structure',
      commandType: 'drain_flood_basins',
      defaultPayload: { drainageEfficiency: 0.65 },
    },
    {
      id: 'atm-reforest-albedo',
      label: 'Afforest Interior Plains (Moisture Retention)',
      description: 'Converts dry plains cells into high-evapotranspiration forest canopy.',
      category: 'structure',
      commandType: 'modify_surface_biome',
      defaultPayload: { targetType: 'forest', soilMoistureBoost: 24 },
    },
    {
      id: 'atm-orographic-pass',
      label: 'Channel Mountain Wind Pass (Reduce Rainshadow)',
      description: 'Enhances moisture transport across the eastern mountain cordillera.',
      category: 'structure',
      commandType: 'channel_mountain_moisture',
      defaultPayload: { leewardHumidityTransferPct: 22 },
    },
    {
      id: 'atm-polar-front',
      label: 'Trigger Northern Polar Outbreak (-9°C North)',
      description: 'Drives a cold high-pressure air mass into the northern 16 climate cells.',
      category: 'crisis',
      commandType: 'apply_regional_thermal_shock',
      defaultPayload: { region: 'north', deltaTempC: -9, deltaPressureHpa: 11 },
    },
    {
      id: 'atm-marine-upwelling-cool',
      label: 'Induce Cool Western Ocean Upwelling (-4.5°C)',
      description: 'Cools western ocean surface cells, suppressing tropical cyclogenesis.',
      category: 'policy',
      commandType: 'apply_regional_thermal_shock',
      defaultPayload: { region: 'west', deltaTempC: -4.5, deltaPressureHpa: 6 },
    },
  ],
  metricDefinitions: [
    {
      id: 'meanTemperatureC',
      label: 'Mean Surface Temperature',
      unit: '°C',
      category: 'Thermal',
      comparableDimension: 'temperature_celsius',
      description: 'Average surface air temperature across all 48 climate cells.',
      warningThreshold: 29,
      criticalThreshold: 34,
      higherIsBetter: false,
    },
    {
      id: 'maxTemperatureC',
      label: 'Peak Cell Temperature',
      unit: '°C',
      category: 'Thermal',
      description: 'Hottest individual climate cell temperature in the synoptic grid.',
      warningThreshold: 36,
      criticalThreshold: 41,
      higherIsBetter: false,
    },
    {
      id: 'minPressureHpa',
      label: 'Minimum Barometric Pressure',
      unit: 'hPa',
      category: 'Pressure',
      description: 'Lowest sea-level equivalent pressure across cells and active storm cores.',
      warningThreshold: 985,
      criticalThreshold: 968,
      higherIsBetter: true,
    },
    {
      id: 'meanPressureHpa',
      label: 'Mean Barometric Pressure',
      unit: 'hPa',
      category: 'Pressure',
      description: 'Domain-wide average atmospheric pressure.',
    },
    {
      id: 'pressureGradientMaxHpa',
      label: 'Max Synoptic Pressure Differential',
      unit: 'hPa',
      category: 'Pressure',
      description: 'Difference between highest ridge pressure and deepest low trough.',
      warningThreshold: 32,
      criticalThreshold: 48,
      higherIsBetter: false,
    },
    {
      id: 'meanHumidityPct',
      label: 'Mean Relative Humidity',
      unit: '%',
      category: 'Hydrology',
      description: 'Average atmospheric moisture saturation across the 48 cells.',
      warningThreshold: 35,
      criticalThreshold: 22,
      higherIsBetter: true,
    },
    {
      id: 'meanCloudCoverPct',
      label: 'Mean Cloud Fraction',
      unit: '%',
      category: 'Hydrology',
      description: 'Domain-averaged cloud cover percentage.',
    },
    {
      id: 'totalPrecipitationMmHr',
      label: 'Total Regional Precipitation Flux',
      unit: 'mm/hr',
      category: 'Hydrology',
      comparableDimension: 'water_flux_rate',
      description: 'Sum of active precipitation rates across all 48 climate cells.',
    },
    {
      id: 'meanWindSpeedMs',
      label: 'Mean Synoptic Wind Speed',
      unit: 'm/s',
      category: 'Circulation',
      description: 'Average horizontal wind speed across the 48 climate cells.',
      warningThreshold: 18,
      criticalThreshold: 26,
      higherIsBetter: false,
    },
    {
      id: 'peakWindSpeedMs',
      label: 'Peak Gust / Cyclone Wind Speed',
      unit: 'm/s',
      category: 'Circulation',
      description: 'Maximum sustained wind speed across all cells and storm vortices.',
      warningThreshold: 32,
      criticalThreshold: 45,
      higherIsBetter: false,
    },
    {
      id: 'activeStormCount',
      label: 'Active Cyclonic Storm Systems',
      unit: 'storms',
      category: 'Hazards',
      description: 'Number of organized cyclonic/supercell storm vortices currently tracked.',
      warningThreshold: 2,
      criticalThreshold: 4,
      higherIsBetter: false,
    },
    {
      id: 'meanCapeJkg',
      label: 'Mean Convective Instability (CAPE)',
      unit: 'J/kg',
      category: 'Thermodynamics',
      description: 'Average Convective Available Potential Energy driving thunderstorm updrafts.',
      warningThreshold: 1600,
      criticalThreshold: 2400,
      higherIsBetter: false,
    },
    {
      id: 'meanSoilMoisturePct',
      label: 'Mean Land Soil Moisture',
      unit: '%',
      category: 'Hydrology',
      description: 'Average soil moisture across terrestrial climate cells.',
      warningThreshold: 32,
      criticalThreshold: 20,
      higherIsBetter: true,
    },
    {
      id: 'droughtAffectedCells',
      label: 'Cells in Severe Drought',
      unit: 'cells',
      category: 'Hazards',
      description: 'Count of terrestrial cells with drought stress index above 60.',
      warningThreshold: 8,
      criticalThreshold: 15,
      higherIsBetter: false,
    },
    {
      id: 'floodedCellsCount',
      label: 'Cells with Active Flooding',
      unit: 'cells',
      category: 'Hazards',
      description: 'Count of cells where surface flood inundation exceeds 25 cm.',
      warningThreshold: 4,
      criticalThreshold: 9,
      higherIsBetter: false,
    },
    {
      id: 'effectiveAlbedoPct',
      label: 'Effective Planetary Albedo',
      unit: '%',
      category: 'Radiation',
      description: 'Combined surface, cloud, and stratospheric aerosol reflectivity.',
    },
    {
      id: 'cumulativeRainfallMm',
      label: 'Cumulative Basin Rainfall',
      unit: 'mm',
      category: 'Hydrology',
      description: 'Integrated precipitation delivered since simulation Genesis.',
      higherIsBetter: true,
    },
    {
      id: 'climateStabilityIndex',
      label: 'Atmospheric Stability Index',
      unit: '%',
      category: 'Stability',
      comparableDimension: 'system_stability_ratio',
      description: 'Composite meteorological stability score (penalized by severe storms, floods, and megadrought).',
      warningThreshold: 60,
      criticalThreshold: 38,
      higherIsBetter: true,
    },
  ],

  initializeWorld(config, rng) {
    const stream = rng.stream('atm_init');
    const cells: ClimateCell[] = [];

    for (let gz = 0; gz < GRID_ROWS; gz++) {
      for (let gx = 0; gx < GRID_COLS; gx++) {
        const idx = gz * GRID_COLS + gx;
        const centerX = roundDet(-42 + gx * 12, 2);
        const centerZ = roundDet(-30 + gz * 12, 2);

        // West columns (0,1) are ocean/coastal, col 5 is mountain cordillera, col 6-7 leeward plains/arid
        let surfaceType: TerrainSurfaceType = 'plains';
        let elevationKm = 0.25;
        let albedo = 0.22;

        if (gx <= 1) {
          surfaceType = 'ocean';
          elevationKm = 0.0;
          albedo = 0.09;
        } else if (gx === 2) {
          surfaceType = 'coastal';
          elevationKm = 0.08;
          albedo = 0.16;
        } else if (gx === 4) {
          surfaceType = 'forest';
          elevationKm = 0.45;
          albedo = 0.15;
        } else if (gx === 5) {
          surfaceType = 'mountain';
          elevationKm = roundDet(2.1 + Math.sin(gz * 0.9) * 0.55, 2);
          albedo = 0.38;
        } else if (gx === 6) {
          surfaceType = 'highland';
          elevationKm = 1.1;
          albedo = 0.28;
        }

        // Meridional temperature gradient (warmer in south gz=5, cooler in north gz=0) + lapse rate
        const latFactor = (gz - 2.5) * 3.8;
        const baseTemp =
          18.5 +
          latFactor * 1.15 -
          elevationKm * 6.2 +
          (config.solarHeatingMultiplier - 1) * 14 +
          stream.nextRange(-1.5, 1.5);

        const baseHumidity =
          surfaceType === 'ocean'
            ? stream.nextRange(76, 90)
            : surfaceType === 'coastal'
              ? stream.nextRange(68, 82)
              : surfaceType === 'forest'
                ? stream.nextRange(60, 76)
                : gx >= 6
                  ? stream.nextRange(28, 48)
                  : stream.nextRange(48, 66);

        const basePressure =
          1013.2 -
          (baseTemp - 18) * 0.65 -
          (baseHumidity - 55) * 0.12 +
          stream.nextRange(-3.5, 3.5);

        const cloudCover = clampDet(
          (baseHumidity - (config.condensationThreshold - 15)) * 1.65,
          0,
          100,
        );

        cells.push({
          id: `cell-${gx}-${gz}`,
          label: REGION_NAMES[idx] ?? `Sector ${gx}-${gz}`,
          gridX: gx,
          gridZ: gz,
          centerX,
          centerZ,
          surfaceType,
          elevationKm: roundDet(elevationKm, 2),
          albedo: roundDet(albedo, 2),
          pressureHpa: roundDet(clampDet(basePressure, 965, 1042), 2),
          temperatureC: roundDet(baseTemp, 2),
          humidityPct: roundDet(clampDet(baseHumidity, 8, 100), 2),
          windU: roundDet(4.5 + (gz - 2.5) * 0.8 + stream.nextRange(-1.2, 1.2), 2),
          windV: roundDet(stream.nextRange(-2.0, 2.0), 2),
          windSpeedMs: 5.0,
          cloudCoverPct: roundDet(cloudCover, 2),
          precipitationMmHr: roundDet(cloudCover > 55 ? (cloudCover - 55) * 0.22 : 0, 2),
          soilMoisturePct: roundDet(
            surfaceType === 'ocean' ? 100 : clampDet(baseHumidity * 0.82, 12, 95),
            2,
          ),
          floodDepthCm: 0,
          droughtStressIndex: roundDet(
            surfaceType === 'ocean' ? 0 : Math.max(0, 60 - baseHumidity * 0.8),
            2,
          ),
          convectiveCapeJkg: roundDet(
            Math.max(0, (baseTemp - 16) * 65 + (baseHumidity - 50) * 18),
            1,
          ),
        });
      }
    }

    const state: AtmosphereState = {
      nextStormId: 1,
      cells,
      storms: [],
      seasonPhaseRad: 0.4,
      globalSolarMultiplier: config.solarHeatingMultiplier,
      stratosphericAerosolLoad: config.aerosolCoolingIndex,
      jetStreamShiftMs: 0,
      cloudSeedingActiveTicks: 0,
      cumulativeRainfallMm: 0,
      cumulativeStormsFormed: 0,
      cumulativeFloodEvents: 0,
      cumulativeDroughtCells: 0,
      lastStormEventId: null,
      lastDroughtEventId: null,
      lastFloodEventId: null,
    };

    // Spawn an initial cyclonic storm if solarHeatingMultiplier or evaporationRate is high
    if (config.solarHeatingMultiplier >= 1.15 || config.evaporationRate >= 1.3) {
      createStorm(state, rng, -28, 8, 979, 34);
    } else {
      createStorm(state, rng, -32, -4, 991, 23);
    }

    return state;
  },

  systems: [
    {
      id: 'atm_1_solar_and_seasonal_forcing',
      name: 'Solar Insolation, Albedo & Seasonal Heat Balance',
      order: 10,
      step(ctx) {
        const { state, config, rng } = ctx;
        const stream = rng.stream('atm_solar');
        state.seasonPhaseRad = roundDet((state.seasonPhaseRad + 0.08) % (Math.PI * 2), 4);
        const seasonalOffset = Math.sin(state.seasonPhaseRad) * (config.seasonalAmplitudeC * 0.12);
        const aerosolDimming = clampDet(state.stratosphericAerosolLoad * 0.25, 0, 0.45);
        const effectiveSolar = Math.max(0.35, state.globalSolarMultiplier - aerosolDimming);

        const prevTemps = state.cells.map((c) => c.temperatureC);

        for (let i = 0; i < state.cells.length; i++) {
          const cell = state.cells[i];
          const cloudShade = (cell.cloudCoverPct / 100) * 0.28;
          const netAlbedo = clampDet(cell.albedo + cloudShade + aerosolDimming * 0.4, 0.08, 0.85);
          const latWarmth = (cell.gridZ - 2.5) * 0.35;

          const solarGain = (1 - netAlbedo) * effectiveSolar * 1.45 + latWarmth * 0.15 + seasonalOffset * 0.18;
          const radiativeCooling = 0.85 + cell.elevationKm * 0.28;

          // Neighbor conductive/turbulent heat transfer
          let neighborTempSum = 0;
          let neighborCount = 0;
          const dirs = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ];
          for (const [dx, dz] of dirs) {
            const nx = cell.gridX + dx;
            const nz = cell.gridZ + dz;
            if (nx >= 0 && nx < GRID_COLS && nz >= 0 && nz < GRID_ROWS) {
              neighborTempSum += prevTemps[nz * GRID_COLS + nx];
              neighborCount++;
            }
          }
          const neighborMean = neighborCount > 0 ? neighborTempSum / neighborCount : prevTemps[i];
          const diffusion = config.thermalDiffusionRate * (neighborMean - prevTemps[i]);

          // Ocean has higher thermal inertia
          const inertia = cell.surfaceType === 'ocean' ? 0.45 : 0.85;
          const nextTemp =
            prevTemps[i] +
            (solarGain - radiativeCooling + diffusion + stream.nextRange(-0.18, 0.18)) * inertia;

          cell.temperatureC = roundDet(clampDet(nextTemp, -30, 52), 2);
        }
      },
    },
    {
      id: 'atm_2_pressure_and_wind_circulation',
      name: 'Barometric Pressure Gradient & Coriolis Wind Advection',
      order: 20,
      step(ctx) {
        const { state, config } = ctx;
        const prevHumidity = state.cells.map((c) => c.humidityPct);
        const prevTemp = state.cells.map((c) => c.temperatureC);

        // Update hydrostatic barometric pressure from thermal & moisture anomalies
        for (const cell of state.cells) {
          const thermalAnomaly = cell.temperatureC - 18.0;
          const humidityAnomaly = cell.humidityPct - 55.0;
          const targetPressure =
            1013.0 - thermalAnomaly * 0.58 - humidityAnomaly * 0.11 + cell.elevationKm * 1.5;

          // Storm vortex proximity deepens local low pressure
          let stormDip = 0;
          for (const storm of state.storms) {
            const dist = Math.hypot(cell.centerX - storm.x, cell.centerZ - storm.z);
            if (dist < storm.radiusKm * 1.4) {
              const factor = Math.max(0, 1 - dist / (storm.radiusKm * 1.4));
              stormDip += (1012 - storm.centralPressureHpa) * factor * 0.65;
            }
          }

          cell.pressureHpa = roundDet(
            clampDet(
              cell.pressureHpa * 0.55 + (targetPressure - stormDip) * 0.45,
              950,
              1048,
            ),
            2,
          );
        }

        // Compute horizontal wind vectors from pressure gradient + Coriolis + Jet Stream
        for (const cell of state.cells) {
          const leftIdx = findCellIndex(cell.gridX - 1, cell.gridZ);
          const rightIdx = findCellIndex(cell.gridX + 1, cell.gridZ);
          const upIdx = findCellIndex(cell.gridX, cell.gridZ - 1);
          const downIdx = findCellIndex(cell.gridX, cell.gridZ + 1);

          // Wind blows from high pressure to low pressure
          const dPdx = state.cells[rightIdx].pressureHpa - state.cells[leftIdx].pressureHpa;
          const dPdz = state.cells[downIdx].pressureHpa - state.cells[upIdx].pressureHpa;

          const pgfU = -dPdx * 0.85;
          const pgfV = -dPdz * 0.85;

          // Coriolis deflection proportional to config.coriolisStrength
          const coriolisU = pgfU + config.coriolisStrength * 0.25 * pgfV;
          const coriolisV = pgfV - config.coriolisStrength * 0.25 * pgfU;

          const terrainDrag =
            cell.surfaceType === 'mountain'
              ? 0.62
              : cell.surfaceType === 'forest'
                ? 0.78
                : cell.surfaceType === 'ocean'
                  ? 0.94
                  : 0.85;

          const baseZonal = 3.8 + state.jetStreamShiftMs * 0.65;
          cell.windU = roundDet(
            clampDet((cell.windU * 0.5 + (baseZonal + coriolisU) * 0.5) * terrainDrag, -38, 45),
            2,
          );
          cell.windV = roundDet(
            clampDet((cell.windV * 0.5 + coriolisV * 0.5) * terrainDrag, -35, 35),
            2,
          );

          // Superimpose cyclonic tangential wind near storm centers
          let stormWindBoost = 0;
          for (const storm of state.storms) {
            const dist = Math.hypot(cell.centerX - storm.x, cell.centerZ - storm.z);
            if (dist < storm.radiusKm * 1.2) {
              stormWindBoost = Math.max(
                stormWindBoost,
                storm.maxSustainedWindMs * (1 - dist / (storm.radiusKm * 1.35)),
              );
            }
          }

          cell.windSpeedMs = roundDet(
            clampDet(Math.hypot(cell.windU, cell.windV) + stormWindBoost * 0.55, 0.4, 65),
            2,
          );

          // Upstream moisture & heat advection
          const upwindX = clampDet(
            Math.round(cell.gridX - Math.sign(cell.windU)),
            0,
            GRID_COLS - 1,
          );
          const upwindZ = clampDet(
            Math.round(cell.gridZ - Math.sign(cell.windV)),
            0,
            GRID_ROWS - 1,
          );
          const upwindIdx = findCellIndex(upwindX, upwindZ);
          const advectRate = clampDet(cell.windSpeedMs * 0.012, 0.02, 0.28);

          cell.humidityPct = roundDet(
            clampDet(
              prevHumidity[cell.gridZ * GRID_COLS + cell.gridX] * (1 - advectRate) +
                prevHumidity[upwindIdx] * advectRate,
              5,
              100,
            ),
            2,
          );
          cell.temperatureC = roundDet(
            clampDet(
              cell.temperatureC * (1 - advectRate * 0.5) +
                prevTemp[upwindIdx] * (advectRate * 0.5),
              -30,
              52,
            ),
            2,
          );
        }
      },
    },
    {
      id: 'atm_3_moisture_clouds_and_precipitation',
      name: 'Evaporation, Orographic Condensation, Rainfall & Hydrology',
      order: 30,
      step(ctx) {
        const { state, config, tick } = ctx;
        if (state.cloudSeedingActiveTicks > 0) {
          state.cloudSeedingActiveTicks -= 1;
        }
        const effectiveCondThreshold =
          state.cloudSeedingActiveTicks > 0
            ? Math.max(48, config.condensationThreshold - 12)
            : config.condensationThreshold;

        let newFloodCount = 0;
        let newDroughtCount = 0;

        for (const cell of state.cells) {
          // 1. Evaporation source
          const tempFactor = Math.max(0.2, (cell.temperatureC + 10) / 28);
          const evapBase =
            cell.surfaceType === 'ocean'
              ? 4.6
              : cell.surfaceType === 'coastal'
                ? 3.1
                : cell.surfaceType === 'forest'
                  ? 2.4
                  : (cell.soilMoisturePct / 100) * 1.8;

          const evapGain = evapBase * config.evaporationRate * tempFactor;

          // 2. Orographic lift when wind blows across elevated terrain
          const orographicLift =
            cell.elevationKm * Math.abs(cell.windU) * 0.35 * config.orographicLiftFactor;

          const rawHumidity = cell.humidityPct + evapGain + orographicLift * 0.6;

          // 3. Cloud condensation & CAPE
          const excessMoisture = Math.max(0, rawHumidity - (effectiveCondThreshold - 18));
          cell.cloudCoverPct = roundDet(
            clampDet(cell.cloudCoverPct * 0.45 + excessMoisture * 1.85, 0, 100),
            2,
          );

          cell.convectiveCapeJkg = roundDet(
            clampDet(
              Math.max(0, (cell.temperatureC - 14) * 75 + (rawHumidity - 48) * 24 + orographicLift * 95),
              0,
              4500,
            ),
            1,
          );

          // 4. Precipitation
          let rainMmHr = 0;
          if (rawHumidity > effectiveCondThreshold || cell.cloudCoverPct > 62) {
            rainMmHr =
              Math.max(0, rawHumidity - effectiveCondThreshold) * 0.55 +
              Math.max(0, cell.cloudCoverPct - 60) * 0.24 +
              orographicLift * 1.35;
          }
          if (state.cloudSeedingActiveTicks > 0 && cell.cloudCoverPct > 35) {
            rainMmHr += 4.2;
          }

          // Storm core deluge
          for (const storm of state.storms) {
            const dist = Math.hypot(cell.centerX - storm.x, cell.centerZ - storm.z);
            if (dist < storm.radiusKm) {
              rainMmHr += (1 - dist / storm.radiusKm) * (storm.moistureCorePct * 0.28);
            }
          }

          cell.precipitationMmHr = roundDet(clampDet(rainMmHr, 0, 95), 2);
          state.cumulativeRainfallMm = roundDet(
            state.cumulativeRainfallMm + cell.precipitationMmHr * 0.1,
            2,
          );

          // Rain depletes atmospheric water vapor
          cell.humidityPct = roundDet(
            clampDet(rawHumidity - cell.precipitationMmHr * 0.42, 6, 100),
            2,
          );

          // 5. Land soil moisture, flood depth & drought stress
          if (cell.surfaceType === 'ocean') {
            cell.soilMoisturePct = 100;
            cell.floodDepthCm = 0;
            cell.droughtStressIndex = 0;
          } else {
            const infiltration = cell.precipitationMmHr * 1.15;
            const evapLoss = evapGain * 0.55 + Math.max(0, (cell.temperatureC - 22) * 0.35);
            cell.soilMoisturePct = roundDet(
              clampDet(cell.soilMoisturePct + infiltration - evapLoss, 4, 100),
              2,
            );

            // Runoff & flooding when soil is saturated or rainfall is intense
            const runoffAddition =
              cell.precipitationMmHr > 14
                ? (cell.precipitationMmHr - 14) * 1.85
                : cell.soilMoisturePct > 88
                  ? cell.precipitationMmHr * 0.65
                  : 0;
            const naturalDrainage = 2.6 + cell.elevationKm * 1.8;
            cell.floodDepthCm = roundDet(
              clampDet(cell.floodDepthCm + runoffAddition - naturalDrainage, 0, 250),
              2,
            );

            cell.droughtStressIndex = roundDet(
              clampDet(
                (100 - cell.soilMoisturePct) * 0.85 + Math.max(0, cell.temperatureC - 26) * 1.6,
                0,
                100,
              ),
              2,
            );

            if (cell.floodDepthCm > 25) newFloodCount++;
            if (cell.droughtStressIndex > 60) newDroughtCount++;
          }
        }

        if (newFloodCount >= 3 && tick % 4 === 0) {
          state.cumulativeFloodEvents += 1;
          const ev = ctx.emitEvent({
            type: 'regional_flood_inundation',
            severity: newFloodCount >= 7 ? 'critical' : 'warning',
            title: `Regional Flash Flooding (${newFloodCount} Cells Inundated)`,
            description: `Intense precipitation and saturated soils caused surface flooding across ${newFloodCount} climate cells.`,
            sourceSystem: 'atm_3_moisture_clouds_and_precipitation',
            affectedEntityIds: state.cells
              .filter((c) => c.floodDepthCm > 25)
              .slice(0, 6)
              .map((c) => c.id),
            payload: {
              floodedCells: newFloodCount,
              rainfallRateMmHr: roundDet(
                state.cells.reduce((a, c) => a + c.precipitationMmHr, 0),
                2,
              ),
              severity: roundDet(clampDet(newFloodCount / 16, 0.15, 0.9), 2),
            },
            causalLinkType: 'dependency',
            causedByEventId: state.lastStormEventId,
            causalExplanation:
              'Extreme convective and orographic rainfall exceeded soil infiltration capacity, accumulating surface floodwater.',
          });
          state.lastFloodEventId = ev.id;
        }

        if (newDroughtCount >= 8 && tick % 5 === 0) {
          state.cumulativeDroughtCells = newDroughtCount;
          const ev = ctx.emitEvent({
            type: 'drought_triggered',
            severity: newDroughtCount >= 14 ? 'critical' : 'warning',
            title: `Atmospheric Megadrought (${newDroughtCount} Arid Cells)`,
            description: `High evaporation and suppressed condensation drove ${newDroughtCount} terrestrial cells into severe hydrological deficit.`,
            sourceSystem: 'atm_3_moisture_clouds_and_precipitation',
            affectedEntityIds: state.cells
              .filter((c) => c.droughtStressIndex > 60)
              .slice(0, 6)
              .map((c) => c.id),
            payload: {
              droughtCells: newDroughtCount,
              severity: roundDet(clampDet(newDroughtCount / 28, 0.2, 0.75), 2),
            },
            causalLinkType: 'dependency',
            causalExplanation:
              'Persistent high-pressure subsidence and thermal evaporation depleted terrestrial soil moisture.',
          });
          state.lastDroughtEventId = ev.id;
        }
      },
    },
    {
      id: 'atm_4_storm_cyclogenesis_and_tracking',
      name: 'Cyclonic Storm Nucleation, Advection & Dissipation',
      order: 40,
      step(ctx) {
        const { state, config, rng, tick } = ctx;
        const stream = rng.stream('atm_storms');

        // 1. Advance existing storms along local wind + Coriolis steering
        const survivingStorms: StormEntity[] = [];
        for (const storm of state.storms) {
          storm.ageTicks += 1;
          storm.prevX = storm.x;
          storm.prevZ = storm.z;

          const hostCell = findCellAtWorldPos(state.cells, storm.x, storm.z);
          const steerU = hostCell.windU * 0.35 + 1.1;
          const steerV = hostCell.windV * 0.35 - config.coriolisStrength * 0.28;

          storm.vx = roundDet(storm.vx * 0.55 + steerU * 0.45, 2);
          storm.vz = roundDet(storm.vz * 0.55 + steerV * 0.45, 2);
          storm.x = roundDet(storm.x + storm.vx, 2);
          storm.z = roundDet(storm.z + storm.vz, 2);

          // Intensify over warm humid ocean/coastal cells; weaken over mountains/dry land
          if (
            (hostCell.surfaceType === 'ocean' || hostCell.surfaceType === 'coastal') &&
            hostCell.temperatureC > 20
          ) {
            storm.centralPressureHpa = roundDet(
              clampDet(storm.centralPressureHpa - 1.4, 948, 1010),
              1,
            );
            storm.maxSustainedWindMs = roundDet(
              clampDet(storm.maxSustainedWindMs + 1.6, 16, 62),
              2,
            );
            storm.moistureCorePct = roundDet(clampDet(storm.moistureCorePct + 2.2, 40, 99), 2);
          } else {
            const mountainDecay = hostCell.surfaceType === 'mountain' ? 4.2 : 1.5;
            storm.centralPressureHpa = roundDet(
              clampDet(storm.centralPressureHpa + mountainDecay, 948, 1012),
              1,
            );
            storm.maxSustainedWindMs = roundDet(
              clampDet(storm.maxSustainedWindMs - mountainDecay * 1.1, 10, 62),
              2,
            );
            storm.moistureCorePct = roundDet(
              clampDet(storm.moistureCorePct - 3.0, 20, 99),
              2,
            );
          }

          storm.category =
            storm.maxSustainedWindMs >= 46
              ? 'cyclone'
              : storm.maxSustainedWindMs >= 36
                ? 'supercell'
                : storm.maxSustainedWindMs >= 24
                  ? 'tropical_storm'
                  : 'depression';

          const inBounds = storm.x >= -46 && storm.x <= 46 && storm.z >= -34 && storm.z <= 34;
          if (inBounds && storm.maxSustainedWindMs >= 15 && storm.ageTicks <= 42) {
            survivingStorms.push(storm);
          }
        }
        state.storms = survivingStorms;

        // 2. Autonomous cyclogenesis when a warm humid cell has high CAPE & low pressure
        if (state.storms.length < 4) {
          const candidates = state.cells.filter(
            (c) =>
              c.convectiveCapeJkg > 1750 &&
              c.humidityPct > 74 &&
              c.pressureHpa < 1006,
          );
          if (candidates.length > 0 && stream.nextBoolean(0.35)) {
            const origin = candidates[stream.nextInt(0, candidates.length - 1)];
            const spawned = createStorm(
              state,
              rng,
              origin.centerX,
              origin.centerZ,
              roundDet(origin.pressureHpa - 16, 1),
              roundDet(26 + (origin.convectiveCapeJkg - 1500) * 0.01, 2),
            );
            const ev = ctx.emitEvent({
              type: 'cyclonic_storm_formed',
              severity: spawned.maxSustainedWindMs > 38 ? 'critical' : 'warning',
              title: `${spawned.name} Nucleated over ${origin.label}`,
              description: `High convective instability (${origin.convectiveCapeJkg} J/kg) and low barometric pressure (${origin.pressureHpa} hPa) spawned ${spawned.name} (${spawned.maxSustainedWindMs} m/s).`,
              sourceSystem: 'atm_4_storm_cyclogenesis_and_tracking',
              sourceEntityId: spawned.id,
              affectedEntityIds: [spawned.id, origin.id],
              payload: {
                stormId: spawned.id,
                windSpeedMs: spawned.maxSustainedWindMs,
                centralPressureHpa: spawned.centralPressureHpa,
                tick,
              },
              causalLinkType: 'direct',
              causalExplanation:
                'Warm surface evaporation and latent heat release exceeded convective threshold, organizing a cyclonic vortex.',
            });
            state.lastStormEventId = ev.id;
          }
        }
      },
    },
  ],

  applyCommand(state, command: SimulationCommand, ctx) {
    const payload = command.payload ?? {};

    if (command.type === 'adjust_solar_forcing') {
      const delta = Number(payload.deltaMultiplier ?? 0.15);
      const before = state.globalSolarMultiplier;
      state.globalSolarMultiplier = roundDet(clampDet(before + delta, 0.4, 2.0), 3);
      for (const cell of state.cells) {
        cell.temperatureC = roundDet(clampDet(cell.temperatureC + delta * 11, -30, 52), 2);
      }
      ctx.emitEvent({
        type: 'solar_forcing_adjusted',
        severity: delta > 0 ? 'warning' : 'info',
        title: `Solar Forcing Adjusted (${before}x -> ${state.globalSolarMultiplier}x)`,
        description: `Regional solar heating multiplier changed by ${delta > 0 ? '+' : ''}${delta}.`,
        sourceSystem: 'command_bus',
        deltas: [
          {
            metricOrField: 'globalSolarMultiplier',
            before,
            after: state.globalSolarMultiplier,
            unit: 'x',
          },
        ],
        causalLinkType: 'direct',
        causalExplanation: 'Operator modified regional solar radiation forcing.',
      });
      return;
    }

    if (command.type === 'inject_moisture_plume') {
      const region = String(payload.region ?? 'west');
      const boost = Number(payload.humidityBoostPct ?? 25);
      const affected: string[] = [];
      for (const cell of state.cells) {
        const match =
          region === 'all' ||
          (region === 'west' && cell.gridX <= 3) ||
          (region === 'east' && cell.gridX >= 4);
        if (match) {
          cell.humidityPct = roundDet(clampDet(cell.humidityPct + boost, 5, 100), 2);
          cell.cloudCoverPct = roundDet(clampDet(cell.cloudCoverPct + boost * 0.7, 0, 100), 2);
          cell.soilMoisturePct = roundDet(clampDet(cell.soilMoisturePct + boost * 0.45, 5, 100), 2);
          affected.push(cell.id);
        }
      }
      ctx.emitEvent({
        type: 'moisture_plume_injected',
        severity: 'positive',
        title: `Moisture Plume Injected (${region.toUpperCase()} +${boost}% RH)`,
        description: `Atmospheric humidity and cloud cover increased across ${affected.length} climate cells.`,
        sourceSystem: 'command_bus',
        affectedEntityIds: affected.slice(0, 8),
        payload: { region, humidityBoostPct: boost, rainfallMmHr: roundDet(boost * 0.45, 2) },
        causalLinkType: 'direct',
        causalExplanation: 'Direct atmospheric vapor injection increased relative humidity and cloud condensation.',
      });
      return;
    }

    if (command.type === 'spawn_cyclonic_vortex') {
      const x = Number(payload.x ?? -26);
      const z = Number(payload.z ?? 4);
      const pressure = Number(payload.centralPressureHpa ?? 972);
      const wind = Number(payload.windMs ?? 42);
      const storm = createStorm(state, ctx.rng, x, z, pressure, wind);
      for (const cell of state.cells) {
        const dist = Math.hypot(cell.centerX - storm.x, cell.centerZ - storm.z);
        if (dist < 24) {
          cell.pressureHpa = roundDet(clampDet(cell.pressureHpa - 12, 950, 1045), 2);
          cell.windSpeedMs = roundDet(clampDet(cell.windSpeedMs + 14, 1, 65), 2);
          cell.precipitationMmHr = roundDet(clampDet(cell.precipitationMmHr + 18, 0, 95), 2);
        }
      }
      const ev = ctx.emitEvent({
        type: 'cyclonic_storm_formed',
        severity: 'critical',
        title: `Cyclone ${storm.name} Spawned (${storm.centralPressureHpa} hPa)`,
        description: `Cyclonic vortex initialized at (${storm.x}, ${storm.z}) with ${storm.maxSustainedWindMs} m/s winds.`,
        sourceSystem: 'command_bus',
        sourceEntityId: storm.id,
        affectedEntityIds: [storm.id],
        payload: {
          stormId: storm.id,
          centralPressureHpa: storm.centralPressureHpa,
          windSpeedMs: storm.maxSustainedWindMs,
          rainfallRateMmHr: 28,
        },
        causalLinkType: 'direct',
        causalExplanation: 'Targeted mesoscale pressure drop nucleated an active cyclonic vortex.',
      });
      state.lastStormEventId = ev.id;
      return;
    }

    if (command.type === 'suppress_active_storms') {
      const pressureRise = Number(payload.pressureRiseHpa ?? 14);
      const windFactor = Number(payload.windReductionFactor ?? 0.68);
      const beforeCount = state.storms.length;
      for (const storm of state.storms) {
        storm.centralPressureHpa = roundDet(clampDet(storm.centralPressureHpa + pressureRise, 950, 1013), 1);
        storm.maxSustainedWindMs = roundDet(storm.maxSustainedWindMs * windFactor, 2);
      }
      state.storms = state.storms.filter((s) => s.maxSustainedWindMs >= 16);
      for (const cell of state.cells) {
        cell.windSpeedMs = roundDet(cell.windSpeedMs * 0.78, 2);
      }
      ctx.emitEvent({
        type: 'storm_suppression_deployed',
        severity: 'positive',
        title: 'Cryogenic Storm Suppression Executed',
        description: `Active vortices weakened; storm count changed from ${beforeCount} to ${state.storms.length}.`,
        sourceSystem: 'command_bus',
        deltas: [
          { metricOrField: 'activeStormCount', before: beforeCount, after: state.storms.length },
        ],
        causalLinkType: 'direct',
        causalExplanation: 'Surface inflow cooling disrupted cyclonic eyewall convection.',
      });
      return;
    }

    if (command.type === 'trigger_cloud_seeding') {
      const duration = Number(payload.durationTicks ?? 18);
      const bonusRain = Number(payload.bonusPrecipitationMm ?? 6.5);
      state.cloudSeedingActiveTicks = duration;
      for (const cell of state.cells) {
        if (cell.humidityPct > 42) {
          cell.precipitationMmHr = roundDet(clampDet(cell.precipitationMmHr + bonusRain, 0, 95), 2);
          cell.soilMoisturePct = roundDet(clampDet(cell.soilMoisturePct + bonusRain * 1.4, 5, 100), 2);
        }
      }
      ctx.emitEvent({
        type: 'cloud_seeding_activated',
        severity: 'positive',
        title: `Cloud Seeding Campaign Active (${duration} Ticks)`,
        description: `Silver-iodide glaciogenic nuclei accelerated precipitation across humid climate cells.`,
        sourceSystem: 'command_bus',
        payload: { durationTicks: duration, rainfallRateMmHr: bonusRain * 12 },
        causalLinkType: 'direct',
        causalExplanation: 'Lowered effective condensation threshold to harvest atmospheric water vapor.',
      });
      return;
    }

    if (command.type === 'shift_jet_stream') {
      const delta = Number(payload.deltaZonalWindMs ?? 6);
      const before = state.jetStreamShiftMs;
      state.jetStreamShiftMs = roundDet(clampDet(before + delta, -18, 22), 2);
      for (const cell of state.cells) {
        cell.windU = roundDet(clampDet(cell.windU + delta * 0.65, -38, 45), 2);
        cell.windSpeedMs = roundDet(Math.hypot(cell.windU, cell.windV), 2);
      }
      ctx.emitEvent({
        type: 'jet_stream_shifted',
        severity: Math.abs(state.jetStreamShiftMs) > 10 ? 'warning' : 'info',
        title: `Zonal Jet Stream Shifted (${delta > 0 ? '+' : ''}${delta} m/s)`,
        description: `Upper-level zonal wind anomaly updated from ${before} m/s to ${state.jetStreamShiftMs} m/s.`,
        sourceSystem: 'command_bus',
        deltas: [
          { metricOrField: 'jetStreamShiftMs', before, after: state.jetStreamShiftMs, unit: 'm/s' },
        ],
        causalLinkType: 'direct',
        causalExplanation: 'Operator altered synoptic zonal circulation momentum.',
      });
      return;
    }

    if (command.type === 'apply_regional_thermal_shock') {
      const region = String(payload.region ?? 'central');
      const deltaTemp = Number(payload.deltaTempC ?? 5);
      const deltaP = Number(payload.deltaPressureHpa ?? -6);
      for (const cell of state.cells) {
        const match =
          region === 'all' ||
          (region === 'central' && cell.gridX >= 2 && cell.gridX <= 5 && cell.gridZ >= 1 && cell.gridZ <= 4) ||
          (region === 'north' && cell.gridZ <= 1) ||
          (region === 'west' && cell.gridX <= 2);
        if (match) {
          cell.temperatureC = roundDet(clampDet(cell.temperatureC + deltaTemp, -30, 52), 2);
          cell.pressureHpa = roundDet(clampDet(cell.pressureHpa + deltaP, 950, 1048), 2);
        }
      }
      ctx.emitEvent({
        type: 'regional_thermal_shock',
        severity: Math.abs(deltaTemp) >= 6 ? 'warning' : 'info',
        title: `Regional Thermal Anomaly (${region.toUpperCase()} ${deltaTemp > 0 ? '+' : ''}${deltaTemp}°C)`,
        description: `Applied ${deltaTemp}°C thermal and ${deltaP} hPa barometric perturbation to ${region} sector.`,
        sourceSystem: 'command_bus',
        payload: { region, deltaTempC: deltaTemp, deltaPressureHpa: deltaP },
        causalLinkType: 'direct',
        causalExplanation: 'Localized sensible heat and pressure perturbation applied.',
      });
      return;
    }

    if (command.type === 'adjust_aerosol_veil') {
      const delta = Number(payload.deltaAerosol ?? 0.25);
      const before = state.stratosphericAerosolLoad;
      state.stratosphericAerosolLoad = roundDet(clampDet(before + delta, 0, 1.2), 3);
      for (const cell of state.cells) {
        cell.temperatureC = roundDet(clampDet(cell.temperatureC - delta * 4.5, -30, 52), 2);
      }
      ctx.emitEvent({
        type: 'aerosol_veil_modified',
        severity: 'info',
        title: `Stratospheric Aerosol Veil (${before} -> ${state.stratosphericAerosolLoad})`,
        description: `Planetary aerosol optical depth updated to ${state.stratosphericAerosolLoad}.`,
        sourceSystem: 'command_bus',
        deltas: [
          { metricOrField: 'stratosphericAerosolLoad', before, after: state.stratosphericAerosolLoad },
        ],
        causalLinkType: 'direct',
        causalExplanation: 'Modified stratospheric sulfate aerosol reflectivity.',
      });
      return;
    }

    if (command.type === 'drain_flood_basins') {
      const eff = clampDet(Number(payload.drainageEfficiency ?? 0.65), 0.1, 0.95);
      for (const cell of state.cells) {
        if (cell.floodDepthCm > 0) {
          cell.floodDepthCm = roundDet(cell.floodDepthCm * (1 - eff), 2);
        }
        cell.soilMoisturePct = roundDet(
          clampDet(cell.soilMoisturePct + 4.5 * eff, 10, 95),
          2,
        );
      }
      ctx.emitEvent({
        type: 'flood_basins_drained',
        severity: 'positive',
        title: 'Emergency Floodway Spillways Opened',
        description: `Drained ${Math.round(eff * 100)}% of standing surface floodwater into retention aquifers.`,
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Hydrological spillway diversion reduced surface flood inundation.',
      });
      return;
    }

    if (command.type === 'modify_surface_biome') {
      const boost = Number(payload.soilMoistureBoost ?? 24);
      for (const cell of state.cells) {
        if (cell.surfaceType === 'plains') {
          cell.surfaceType = 'forest';
          cell.albedo = 0.15;
        }
        if (cell.surfaceType !== 'ocean') {
          cell.soilMoisturePct = roundDet(clampDet(cell.soilMoisturePct + boost, 10, 100), 2);
          cell.droughtStressIndex = roundDet(Math.max(0, cell.droughtStressIndex - boost * 0.7), 2);
        }
      }
      ctx.emitEvent({
        type: 'surface_biome_afforested',
        severity: 'positive',
        title: 'Interior Afforestation & Canopy Restoration',
        description: 'Converted interior plains to forest canopy, raising soil moisture retention and evapotranspiration.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Vegetative canopy expansion lowered surface albedo and improved root moisture retention.',
      });
      return;
    }

    if (command.type === 'channel_mountain_moisture') {
      const transfer = Number(payload.leewardHumidityTransferPct ?? 22);
      for (const cell of state.cells) {
        if (cell.gridX >= 5) {
          cell.humidityPct = roundDet(clampDet(cell.humidityPct + transfer, 10, 100), 2);
          cell.soilMoisturePct = roundDet(clampDet(cell.soilMoisturePct + transfer * 0.65, 10, 100), 2);
          cell.droughtStressIndex = roundDet(Math.max(0, cell.droughtStressIndex - transfer * 0.6), 2);
        }
      }
      ctx.emitEvent({
        type: 'orographic_pass_channeled',
        severity: 'positive',
        title: `Leeward Rainshadow Relief (+${transfer}% RH)`,
        description: 'Channeled humid windward air across the mountain cordillera into the eastern rainshadow basin.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Reduced orographic blocking across col passes.',
      });
    }
  },

  extractMetrics(state) {
    const n = Math.max(1, state.cells.length);
    const temps = state.cells.map((c) => c.temperatureC);
    const pressures = state.cells.map((c) => c.pressureHpa);
    const stormPressures = state.storms.map((s) => s.centralPressureHpa);
    const allPressures = [...pressures, ...stormPressures];

    const meanTemp = temps.reduce((a, b) => a + b, 0) / n;
    const maxTemp = Math.max(...temps);
    const minP = Math.min(...allPressures);
    const maxP = Math.max(...pressures);
    const meanP = pressures.reduce((a, b) => a + b, 0) / n;

    const meanHumidity = state.cells.reduce((a, c) => a + c.humidityPct, 0) / n;
    const meanCloud = state.cells.reduce((a, c) => a + c.cloudCoverPct, 0) / n;
    const totalPrecip = state.cells.reduce((a, c) => a + c.precipitationMmHr, 0);
    const meanWind = state.cells.reduce((a, c) => a + c.windSpeedMs, 0) / n;
    const peakWind = Math.max(
      ...state.cells.map((c) => c.windSpeedMs),
      ...state.storms.map((s) => s.maxSustainedWindMs),
      0,
    );
    const meanCape = state.cells.reduce((a, c) => a + c.convectiveCapeJkg, 0) / n;

    const landCells = state.cells.filter((c) => c.surfaceType !== 'ocean');
    const meanSoil =
      landCells.reduce((a, c) => a + c.soilMoisturePct, 0) / Math.max(1, landCells.length);
    const droughtCells = landCells.filter((c) => c.droughtStressIndex > 60).length;
    const floodedCells = state.cells.filter((c) => c.floodDepthCm > 25).length;

    const effectiveAlbedo =
      (state.cells.reduce((a, c) => a + c.albedo + (c.cloudCoverPct / 100) * 0.25, 0) / n +
        state.stratosphericAerosolLoad * 0.2) *
      100;

    const stability = clampDet(
      100 -
        state.storms.length * 9 -
        droughtCells * 1.4 -
        floodedCells * 2.5 -
        Math.max(0, maxTemp - 35) * 2.2,
      5,
      100,
    );

    return {
      meanTemperatureC: roundDet(meanTemp, 2),
      maxTemperatureC: roundDet(maxTemp, 2),
      minPressureHpa: roundDet(minP, 2),
      meanPressureHpa: roundDet(meanP, 2),
      pressureGradientMaxHpa: roundDet(maxP - minP, 2),
      meanHumidityPct: roundDet(meanHumidity, 2),
      meanCloudCoverPct: roundDet(meanCloud, 2),
      totalPrecipitationMmHr: roundDet(totalPrecip, 2),
      meanWindSpeedMs: roundDet(meanWind, 2),
      peakWindSpeedMs: roundDet(peakWind, 2),
      activeStormCount: state.storms.length,
      meanCapeJkg: roundDet(meanCape, 1),
      meanSoilMoisturePct: roundDet(meanSoil, 2),
      droughtAffectedCells: droughtCells,
      floodedCellsCount: floodedCells,
      effectiveAlbedoPct: roundDet(clampDet(effectiveAlbedo, 5, 95), 2),
      cumulativeRainfallMm: roundDet(state.cumulativeRainfallMm, 2),
      climateStabilityIndex: roundDet(stability, 2),
    };
  },

  inspectEntities(state) {
    const inspections: EntityInspection[] = [];

    for (const storm of state.storms) {
      inspections.push({
        entityId: storm.id,
        kind: `storm_${storm.category}`,
        label: `${storm.name} (${storm.category.toUpperCase()})`,
        status: storm.maxSustainedWindMs >= 42 ? 'critical' : 'warning',
        position: [storm.x, 3.2, storm.z],
        summary: `Central Pressure ${storm.centralPressureHpa} hPa • Max Winds ${storm.maxSustainedWindMs} m/s • Core Moisture ${storm.moistureCorePct}%`,
        properties: [
          { key: 'category', label: 'Storm Classification', value: storm.category },
          { key: 'centralPressureHpa', label: 'Central Pressure', value: storm.centralPressureHpa, unit: 'hPa' },
          { key: 'maxSustainedWindMs', label: 'Max Sustained Wind', value: storm.maxSustainedWindMs, unit: 'm/s' },
          { key: 'moistureCorePct', label: 'Core Moisture', value: storm.moistureCorePct, unit: '%' },
          { key: 'radiusKm', label: 'Vortex Radius', value: storm.radiusKm, unit: 'km' },
          { key: 'ageTicks', label: 'Tracked Duration', value: storm.ageTicks, unit: 'ticks' },
        ],
      });
    }

    for (const cell of state.cells) {
      const status =
        cell.floodDepthCm > 35 || cell.droughtStressIndex > 75 || cell.windSpeedMs > 32
          ? 'critical'
          : cell.floodDepthCm > 15 || cell.droughtStressIndex > 55 || cell.windSpeedMs > 22
            ? 'warning'
            : 'nominal';

      inspections.push({
        entityId: cell.id,
        kind: `climate_cell_${cell.surfaceType}`,
        label: `${cell.label} (${cell.surfaceType.toUpperCase()})`,
        status,
        position: [cell.centerX, cell.elevationKm, cell.centerZ],
        summary: `${cell.temperatureC}°C • ${cell.pressureHpa} hPa • RH ${cell.humidityPct}% • Rain ${cell.precipitationMmHr} mm/hr`,
        properties: [
          { key: 'surfaceType', label: 'Surface Biome', value: cell.surfaceType },
          { key: 'elevationKm', label: 'Elevation', value: cell.elevationKm, unit: 'km' },
          { key: 'temperatureC', label: 'Temperature', value: cell.temperatureC, unit: '°C' },
          { key: 'pressureHpa', label: 'Barometric Pressure', value: cell.pressureHpa, unit: 'hPa' },
          { key: 'humidityPct', label: 'Relative Humidity', value: cell.humidityPct, unit: '%' },
          { key: 'cloudCoverPct', label: 'Cloud Cover', value: cell.cloudCoverPct, unit: '%' },
          { key: 'precipitationMmHr', label: 'Precipitation', value: cell.precipitationMmHr, unit: 'mm/hr' },
          { key: 'windSpeedMs', label: 'Wind Speed', value: cell.windSpeedMs, unit: 'm/s' },
          { key: 'soilMoisturePct', label: 'Soil Moisture', value: cell.soilMoisturePct, unit: '%' },
          { key: 'floodDepthCm', label: 'Flood Depth', value: cell.floodDepthCm, unit: 'cm' },
          { key: 'droughtStressIndex', label: 'Drought Stress', value: cell.droughtStressIndex, unit: 'idx' },
          { key: 'convectiveCapeJkg', label: 'Convective CAPE', value: cell.convectiveCapeJkg, unit: 'J/kg' },
        ],
      });
    }

    return inspections;
  },

  extractRenderFrame(state, _config, runId, tick): RenderFrameData {
    const zones: RenderZoneVisual[] = state.cells.map((cell) => {
      const status =
        cell.floodDepthCm > 35 || cell.droughtStressIndex > 75
          ? 'critical'
          : cell.floodDepthCm > 15 || cell.droughtStressIndex > 55
            ? 'warning'
            : 'nominal';

      let color = '#1e3a5f';
      if (cell.surfaceType === 'ocean') {
        color = cell.temperatureC > 24 ? '#0284c7' : '#0369a1';
      } else if (cell.floodDepthCm > 25) {
        color = '#38bdf8';
      } else if (cell.droughtStressIndex > 60) {
        color = '#d97706';
      } else if (cell.surfaceType === 'mountain') {
        color = '#64748b';
      } else if (cell.surfaceType === 'forest') {
        color = '#15803d';
      } else {
        color = '#22c55e';
      }

      return {
        id: cell.id,
        label: cell.label,
        position: [cell.centerX, cell.elevationKm * 0.5, cell.centerZ],
        size: [10.8, Math.max(0.45, 0.5 + cell.elevationKm * 1.4), 10.8],
        value: roundDet(cell.humidityPct / 100, 2),
        secondaryValue: cell.pressureHpa,
        status,
        color,
        metadata: {
          tempC: cell.temperatureC,
          pressureHpa: cell.pressureHpa,
          rainMmHr: cell.precipitationMmHr,
          cloudPct: cell.cloudCoverPct,
        },
      };
    });

    const entities: RenderEntityVisual[] = [];

    // Render active storm systems as towering cyclonic columns
    for (const storm of state.storms) {
      entities.push({
        id: storm.id,
        kind: 'storm_vortex',
        label: `${storm.name} (${storm.centralPressureHpa} hPa)`,
        position: [storm.x, 3.4, storm.z],
        prevPosition: [storm.prevX, 3.4, storm.prevZ],
        scale: [2.8, 3.6, 2.8],
        color: storm.maxSustainedWindMs >= 42 ? '#ff3d57' : '#38bdf8',
        energyOrHealth: clampDet(storm.maxSustainedWindMs / 60, 0.2, 1),
        status: storm.maxSustainedWindMs >= 42 ? 'critical' : 'warning',
      });
    }

    // Render dense cloud/precipitation decks over cells with heavy clouds
    for (const cell of state.cells) {
      if (cell.cloudCoverPct >= 48) {
        entities.push({
          id: `cloud-${cell.id}`,
          kind: 'cloud_deck',
          label: `Cloud Deck @ ${cell.label} (${cell.cloudCoverPct}%)`,
          position: [cell.centerX, 2.2 + cell.elevationKm * 0.8, cell.centerZ],
          scale: [
            clampDet((cell.cloudCoverPct / 100) * 4.2, 1.2, 4.2),
            0.55,
            clampDet((cell.cloudCoverPct / 100) * 4.2, 1.2, 4.2),
          ],
          color: cell.precipitationMmHr > 12 ? '#7dd3fc' : '#cbd5e1',
          energyOrHealth: roundDet(cell.cloudCoverPct / 100, 2),
          status: cell.precipitationMmHr > 25 ? 'warning' : 'nominal',
        });
      }
    }

    // Render wind stream connections between adjacent high-flow cells
    const connections: RenderConnectionVisual[] = [];
    for (let gz = 0; gz < GRID_ROWS; gz += 2) {
      for (let gx = 0; gx < GRID_COLS - 1; gx += 2) {
        const cA = state.cells[findCellIndex(gx, gz)];
        const cB = state.cells[findCellIndex(gx + 1, gz)];
        connections.push({
          id: `wind-${cA.id}-${cB.id}`,
          from: [cA.centerX, 1.4, cA.centerZ],
          to: [cB.centerX, 1.4, cB.centerZ],
          status: cA.windSpeedMs > 24 ? 'active' : 'open',
          flowRate: cA.windSpeedMs,
          label: `Wind Corridor ${cA.label} -> ${cB.label} (${cA.windSpeedMs} m/s)`,
        });
      }
    }

    const metrics = this.extractMetrics(state, _config);
    const ambientStatus =
      metrics.climateStabilityIndex < 45 || state.storms.some((s) => s.maxSustainedWindMs > 45)
        ? 'critical'
        : metrics.climateStabilityIndex < 70 || state.storms.length >= 2
          ? 'warning'
          : 'nominal';

    return {
      worldId: 'atmosphere',
      runId,
      tick,
      ambientStatus,
      entities,
      zones,
      connections,
      hudSummary: {
        'Climate Cells': state.cells.length,
        'Mean Temp': `${metrics.meanTemperatureC}°C`,
        'Min Pressure': `${metrics.minPressureHpa} hPa`,
        Storms: state.storms.length,
        'Rain Flux': `${metrics.totalPrecipitationMmHr} mm/hr`,
      },
    };
  },
});
