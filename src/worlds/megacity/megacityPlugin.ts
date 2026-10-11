import { z } from 'zod';
import {
  clampDet,
  EntityInspection,
  RenderConnectionVisual,
  RenderEntityVisual,
  RenderFrameData,
  RenderZoneVisual,
  roundDet,
  SimulationCommand,
} from '../../core/contracts';
import { defineWorldPlugin } from '../../core/pdk';

export interface MegacityConfig extends Record<string, unknown> {
  populationGrowthPressure: number; // 0.3 .. 2.2
  publicTransitInvestment: number; // 0.3 .. 2.5
  gridGenerationCapacityMw: number; // 400 .. 2400
  waterTreatmentCapacityMld: number; // 300 .. 2000
  wasteRecyclingEfficiency: number; // 0.2 .. 2.0
  infrastructureMaintenanceBudget: number; // 0.3 .. 2.2
  emissionControlStrictness: number; // 0.3 .. 2.0
}

export type DistrictZoneType =
  | 'downtown_core'
  | 'residential_high'
  | 'residential_suburb'
  | 'industrial_port'
  | 'tech_corridor'
  | 'civic_medical'
  | 'green_waterfront';

export interface CityDistrict {
  id: string;
  name: string;
  zoneType: DistrictZoneType;
  gridX: number; // 0..5 (6 cols)
  gridZ: number; // 0..2 (3 rows) => 18 districts
  position: [number, number, number];
  populationK: number; // thousands of residents
  housingCapacityK: number; // thousands
  jobsAvailableK: number; // thousands of jobs
  commercialLevel: number;
  residentialLevel: number;
  transitAccessScore: number; // 0..100
  trafficCongestionPct: number; // 0..100
  powerDemandMw: number;
  powerSuppliedMw: number;
  waterDemandMld: number;
  waterSuppliedMld: number;
  uncollectedWasteTons: number;
  pollutionAqi: number; // 15..350
  infrastructureHealth: number; // 0..100
  emergencyActive: 'none' | 'grid_brownout' | 'water_main_break' | 'transit_gridlock' | 'smog_alert';
  livabilityIndex: number; // 0..100
}

export interface TransitUtilityCorridor {
  id: string;
  fromDistrictId: string;
  toDistrictId: string;
  transitCapacityK: number;
  commuterFlowK: number;
  congestionRatio: number;
  active: boolean;
}

export interface MegacityState {
  districts: CityDistrict[];
  corridors: TransitUtilityCorridor[];
  powerPlantCapacityMw: number;
  renewableGridBonusMw: number;
  waterWorksCapacityMld: number;
  wasteProcessingCapacityTons: number;
  transitModalSharePct: number;
  cumulativeHousingBuiltK: number;
  cumulativeEmergencyCount: number;
  lastEmergencyEventId: string | null;
  lastGridEventId: string | null;
  lastHousingEventId: string | null;
}

const megacityConfigSchema = z.object({
  populationGrowthPressure: z.number().min(0.2).max(2.5),
  publicTransitInvestment: z.number().min(0.2).max(2.5),
  gridGenerationCapacityMw: z.number().min(300).max(3000),
  waterTreatmentCapacityMld: z.number().min(250).max(2500),
  wasteRecyclingEfficiency: z.number().min(0.2).max(2.5),
  infrastructureMaintenanceBudget: z.number().min(0.2).max(2.5),
  emissionControlStrictness: z.number().min(0.2).max(2.5),
});

const DISTRICT_SPECS: Array<{
  id: string;
  name: string;
  zoneType: DistrictZoneType;
  gx: number;
  gz: number;
  popK: number;
  houseK: number;
  jobsK: number;
}> = [
  // Row 0 (North Metro Belt - 6 districts)
  { id: 'dst-northgate', name: 'Northgate Heights', zoneType: 'residential_suburb', gx: 0, gz: 0, popK: 145, houseK: 165, jobsK: 65 },
  { id: 'dst-veridian', name: 'Veridian Tech Park', zoneType: 'tech_corridor', gx: 1, gz: 0, popK: 95, houseK: 115, jobsK: 210 },
  { id: 'dst-uptown', name: 'Uptown Residential Towers', zoneType: 'residential_high', gx: 2, gz: 0, popK: 240, houseK: 255, jobsK: 110 },
  { id: 'dst-medcenter', name: 'University & Medical Mile', zoneType: 'civic_medical', gx: 3, gz: 0, popK: 110, houseK: 130, jobsK: 195 },
  { id: 'dst-skyline-n', name: 'Skyline Financial North', zoneType: 'downtown_core', gx: 4, gz: 0, popK: 160, houseK: 175, jobsK: 290 },
  { id: 'dst-ironworks', name: 'Ironworks Foundry District', zoneType: 'industrial_port', gx: 5, gz: 0, popK: 75, houseK: 90, jobsK: 185 },

  // Row 1 (Central Metropolitan Spine - 6 districts)
  { id: 'dst-westbrook', name: 'Westbrook Commons', zoneType: 'residential_high', gx: 0, gz: 1, popK: 215, houseK: 225, jobsK: 95 },
  { id: 'dst-midtown', name: 'Midtown Exchange', zoneType: 'downtown_core', gx: 1, gz: 1, popK: 185, houseK: 195, jobsK: 320 },
  { id: 'dst-central-hub', name: 'Grand Central Nexus', zoneType: 'downtown_core', gx: 2, gz: 1, popK: 210, houseK: 215, jobsK: 380 },
  { id: 'dst-capitol', name: 'Civic Capitol Plaza', zoneType: 'civic_medical', gx: 3, gz: 1, popK: 135, houseK: 150, jobsK: 230 },
  { id: 'dst-eastside', name: 'Eastside Tenements', zoneType: 'residential_high', gx: 4, gz: 1, popK: 265, houseK: 250, jobsK: 90 },
  { id: 'dst-cargo-terminal', name: 'Intermodal Cargo Hub', zoneType: 'industrial_port', gx: 5, gz: 1, popK: 85, houseK: 100, jobsK: 220 },

  // Row 2 (Southern Waterfront & Harbor Belt - 6 districts)
  { id: 'dst-emerald-bay', name: 'Emerald Bay Esplanade', zoneType: 'green_waterfront', gx: 0, gz: 2, popK: 120, houseK: 145, jobsK: 80 },
  { id: 'dst-south-arbor', name: 'South Arbor Gardens', zoneType: 'residential_suburb', gx: 1, gz: 2, popK: 170, houseK: 185, jobsK: 75 },
  { id: 'dst-harbor-front', name: 'Harborfront Innovation Quay', zoneType: 'tech_corridor', gx: 2, gz: 2, popK: 130, houseK: 150, jobsK: 240 },
  { id: 'dst-marina-towers', name: 'Marina High-Rise Quarter', zoneType: 'residential_high', gx: 3, gz: 2, popK: 230, houseK: 235, jobsK: 105 },
  { id: 'dst-estuary-park', name: 'Estuary Eco-District', zoneType: 'green_waterfront', gx: 4, gz: 2, popK: 105, houseK: 130, jobsK: 70 },
  { id: 'dst-deepwater-port', name: 'Deepwater Refinery Port', zoneType: 'industrial_port', gx: 5, gz: 2, popK: 65, houseK: 80, jobsK: 205 },
];

export const megacityPlugin = defineWorldPlugin<MegacityConfig, MegacityState>({
  id: 'megacity',
  name: 'World G — The Living Megacity',
  subtitle: '18-District Urban Systems, Commuter Transit, Utility Grids & Housing Tradeoffs',
  version: '2.0.0',
  schemaVersion: 1,
  accentColor: '#f43f5e',
  description:
    'Metropolitan systems laboratory modeling 18 interconnected urban districts across residential, downtown, tech, civic, waterfront, and industrial zones. Simulates housing shortages, commuter traffic congestion vs public transit, electrical grid load shedding, potable water & waste infrastructure, urban smog propagation, and municipal emergencies.',
  physicalModelDocumentation: [
    '18 Interconnected Urban Districts (6x3 metropolitan matrix covering 3x the 6-district baseline territory) linked by 24 transportation and utility corridors.',
    'Commuter Gravity & Modal Split Model: Daily trips flow from residential districts to employment centers; insufficient public transit share forces automobile congestion, slowing economic productivity and raising PM2.5 emissions.',
    'Coupled Utility Conservation: Expanding high-density residential or commercial development increases megawatt (MW) power and megaliter (ML/d) water demand, triggering brownouts if grid capacity lags.',
  ],
  simplifiedMechanicsNote:
    'Models district-level demographic stocks, corridor commuter flows, and utility bus conservation rather than individual vehicle microsimulation.',
  scaleMetadata: {
    areaUnitLabel: 'interconnected metropolitan districts (5,040 km² metro basin)',
    baselinePlayableArea: 6,
    expandedPlayableArea: 18,
    baselineTerritoryScalar: 1680,
    expandedTerritoryScalar: 5040,
    baselineScenarioCount: 3,
    baselineInterventionCount: 6,
    baselineMetricCount: 6,
  },
  configSchema: megacityConfigSchema,
  defaultConfig: {
    populationGrowthPressure: 1.0,
    publicTransitInvestment: 1.0,
    gridGenerationCapacityMw: 1350,
    waterTreatmentCapacityMld: 1150,
    wasteRecyclingEfficiency: 1.0,
    infrastructureMaintenanceBudget: 1.0,
    emissionControlStrictness: 1.0,
  },
  scenarios: [
    {
      id: 'cty-housing-vs-grid-overload',
      name: 'Housing Boom vs. Utility Grid Brownout Crisis',
      subtitle: 'Rapid Densification -> Substation Overload & Water Deficit',
      description:
        'Rapid population inflow creates an acute housing shortage. Upzoning high-density residential towers solves the housing crisis but overloads the electrical and water grids unless substations and reservoirs are expanded.',
      hypothesis:
        'Pairing residential upzoning with +350 MW clean grid capacity and water reclamation prevents municipal brownouts and keeps livability above 75%.',
      seed: 70111,
      config: {
        populationGrowthPressure: 1.45,
        publicTransitInvestment: 0.95,
        gridGenerationCapacityMw: 1080,
        waterTreatmentCapacityMld: 920,
        wasteRecyclingEfficiency: 0.9,
        infrastructureMaintenanceBudget: 0.95,
        emissionControlStrictness: 0.95,
      },
    },
    {
      id: 'cty-commuter-gridlock-smog',
      name: 'Metropolitan Commuter Gridlock & Smog Inversion',
      subtitle: 'Car-Dependent Sprawl -> Corridor Paralysis & PM2.5 Surge',
      description:
        'Low initial public transit investment forces millions of commuters onto arterial highways into Midtown and Grand Central, spiking congestion above 75% and trapping toxic smog.',
      hypothesis:
        'Expanding rapid-transit metro lines and enacting congestion pricing cuts traffic congestion by over 30 percentage points.',
      seed: 70222,
      config: {
        populationGrowthPressure: 1.15,
        publicTransitInvestment: 0.45,
        gridGenerationCapacityMw: 1350,
        waterTreatmentCapacityMld: 1150,
        wasteRecyclingEfficiency: 0.85,
        infrastructureMaintenanceBudget: 0.9,
        emissionControlStrictness: 0.55,
      },
    },
    {
      id: 'cty-aging-infrastructure-cascade',
      name: 'Deferred Maintenance & Cascading Municipal Failure',
      subtitle: 'Deteriorating Mains & Substations -> Multi-District Emergency',
      description:
        'Decades of underfunded maintenance leave bridges, water mains, and electrical transformers brittle across the Eastside and Industrial Port.',
      hypothesis:
        'Doubling infrastructure maintenance crews and retrofitting critical utility trunks halts cascading district emergencies.',
      seed: 70333,
      config: {
        populationGrowthPressure: 1.05,
        publicTransitInvestment: 0.85,
        gridGenerationCapacityMw: 1200,
        waterTreatmentCapacityMld: 980,
        wasteRecyclingEfficiency: 0.65,
        infrastructureMaintenanceBudget: 0.42,
        emissionControlStrictness: 0.85,
      },
    },
    {
      id: 'cty-industrial-port-toxins',
      name: 'Eastern Industrial Port Pollution & Waste Crisis',
      subtitle: 'Foundry & Refinery Plumes -> Downwind Residential AQI Spike',
      description:
        'Heavy port and foundry activity on the eastern edge generates uncollected solid waste and high AQI plumes that drift into Eastside Tenements and Capitol Plaza.',
      hypothesis:
        'Installing industrial scrubbers, green buffer parks, and circular waste-to-energy plants restores air quality below 65 AQI.',
      seed: 70444,
      config: {
        populationGrowthPressure: 1.0,
        publicTransitInvestment: 1.0,
        gridGenerationCapacityMw: 1400,
        waterTreatmentCapacityMld: 1150,
        wasteRecyclingEfficiency: 0.4,
        infrastructureMaintenanceBudget: 0.95,
        emissionControlStrictness: 0.42,
      },
    },
    {
      id: 'cty-heatwave-peak-demand-shock',
      name: 'Summer Peak-Load Blackout & Water Pressure Drop',
      subtitle: 'Scheduled Substation Trip During Peak Cooling Demand',
      description:
        'At Tick 4, a main transmission transformer trips while air-conditioning and water demand surge across all 18 districts.',
      hypothesis:
        'Deploying distributed microgrids and smart load-shedding restores full power supply within 6 ticks.',
      seed: 70555,
      config: {
        populationGrowthPressure: 1.1,
        publicTransitInvestment: 1.05,
        gridGenerationCapacityMw: 1160,
        waterTreatmentCapacityMld: 1020,
        wasteRecyclingEfficiency: 1.0,
        infrastructureMaintenanceBudget: 1.0,
        emissionControlStrictness: 1.0,
      },
      scheduledCommands: [
        {
          tick: 4,
          type: 'trigger_municipal_emergency',
          label: 'Central Substation Transformer Trip',
          payload: { emergencyType: 'grid_brownout', gridLossMw: 290 },
        },
      ],
    },
    {
      id: 'cty-transit-strike-disruption',
      name: 'Metropolitan Transit Shutdown & Commuter Shock',
      subtitle: 'Sudden Modal Shift to Highways -> Downtown Gridlock',
      description:
        'A transit network outage forces rapid-rail riders onto surface streets, testing corridor redundancy.',
      hypothesis:
        'Restoring rapid transit service and opening dedicated bus rapid transit (BRT) lanes clears downtown congestion.',
      seed: 70666,
      config: {
        populationGrowthPressure: 1.05,
        publicTransitInvestment: 0.6,
        gridGenerationCapacityMw: 1380,
        waterTreatmentCapacityMld: 1180,
        wasteRecyclingEfficiency: 1.0,
        infrastructureMaintenanceBudget: 0.85,
        emissionControlStrictness: 0.9,
      },
    },
    {
      id: 'cty-polycentric-green-metropolis',
      name: '15-Minute Polycentric Eco-Metropolis',
      subtitle: 'Balanced Mixed-Use Districts & High Transit Share',
      description:
        'Tests whether distributing jobs into suburban and waterfront hubs reduces cross-town commuter congestion and utility strain.',
      hypothesis:
        'Mixed-use commercial decentralization keeps average corridor congestion below 32%.',
      seed: 70777,
      config: {
        populationGrowthPressure: 1.0,
        publicTransitInvestment: 1.65,
        gridGenerationCapacityMw: 1550,
        waterTreatmentCapacityMld: 1350,
        wasteRecyclingEfficiency: 1.5,
        infrastructureMaintenanceBudget: 1.35,
        emissionControlStrictness: 1.5,
      },
    },
    {
      id: 'cty-hypergrowth-megalopolis',
      name: 'Hyper-Growth Megalopolis Stress Test',
      subtitle: '2.0x Demographic Surge Across All 18 Districts',
      description:
        'Extreme in-migration strains housing, transit, electricity, water, and sanitation simultaneously.',
      hypothesis:
        'Coordinated investment across housing, metro rail, and utility capacity sustains growth without district collapse.',
      seed: 70888,
      config: {
        populationGrowthPressure: 1.95,
        publicTransitInvestment: 1.1,
        gridGenerationCapacityMw: 1450,
        waterTreatmentCapacityMld: 1200,
        wasteRecyclingEfficiency: 1.0,
        infrastructureMaintenanceBudget: 1.0,
        emissionControlStrictness: 1.0,
      },
    },
    {
      id: 'cty-balanced-metro-baseline',
      name: 'Balanced 18-District Metropolitan Baseline',
      subtitle: 'Nominal Urban Operations & Utility Equilibrium',
      description:
        'Reference 18-district metropolitan configuration for controlled urban policy experiments.',
      hypothesis:
        'Baseline infrastructure margins maintain livability above 78% unless perturbed by unmitigated growth or utility shocks.',
      seed: 70999,
      config: {
        populationGrowthPressure: 1.0,
        publicTransitInvestment: 1.0,
        gridGenerationCapacityMw: 1350,
        waterTreatmentCapacityMld: 1150,
        wasteRecyclingEfficiency: 1.0,
        infrastructureMaintenanceBudget: 1.0,
        emissionControlStrictness: 1.0,
      },
    },
  ],
  quickInterventions: [
    {
      id: 'cty-build-social-housing',
      label: 'Construct High-Density Housing (+360k Cap, +Utility Load)',
      description: 'Expands residential housing capacity across 6 stressed districts, relieving shortages while increasing power/water demand.',
      category: 'structure',
      commandType: 'develop_housing_towers',
      defaultPayload: { capacityBoostPerDistrictK: 45, powerDemandIncreaseMw: 18 },
    },
    {
      id: 'cty-mixed-use-upzone',
      label: 'Upzone Mixed-Use Commercial & Housing',
      description: 'Adds local employment and moderate housing across suburban districts to shorten commutes.',
      category: 'policy',
      commandType: 'upzone_mixed_use',
      defaultPayload: { jobsBoostK: 25, housingBoostK: 20 },
    },
    {
      id: 'cty-expand-metro-rail',
      label: 'Expand Rapid Transit Metro Lines (+16% Modal Share)',
      description: 'Increases public transit capacity and modal share, reducing road congestion and smog.',
      category: 'structure',
      commandType: 'expand_public_transit',
      defaultPayload: { transitShareBoostPct: 16, corridorCapacityBoostK: 45 },
    },
    {
      id: 'cty-congestion-pricing',
      label: 'Enact Core Congestion Pricing & BRT Lanes',
      description: 'Shifts downtown commuter trips from private cars to public transit and cuts traffic delays.',
      category: 'policy',
      commandType: 'enact_congestion_pricing',
      defaultPayload: { congestionReductionPct: 18, transitShiftPct: 9 },
    },
    {
      id: 'cty-upgrade-power-grid',
      label: 'Commission Clean Substation & Solar Microgrid (+320 MW)',
      description: 'Expands metropolitan electrical generation capacity by +320 MW and clears brownouts.',
      category: 'structure',
      commandType: 'upgrade_electrical_grid',
      defaultPayload: { addedCapacityMw: 320 },
    },
    {
      id: 'cty-upgrade-water-works',
      label: 'Expand Water Desalination & Reclamation (+280 ML/d)',
      description: 'Increases potable water supply capacity by +280 ML/d across all 18 districts.',
      category: 'structure',
      commandType: 'upgrade_water_infrastructure',
      defaultPayload: { addedWaterMld: 280 },
    },
    {
      id: 'cty-circular-waste-plant',
      label: 'Build Circular Waste-to-Energy & Recycling Plant',
      description: 'Clears 65% of uncollected district solid waste and generates +65 MW bonus power.',
      category: 'restoration',
      commandType: 'expand_waste_management',
      defaultPayload: { wasteClearanceFraction: 0.65, bonusPowerMw: 65 },
    },
    {
      id: 'cty-clean-air-scrubbers',
      label: 'Mandate Zero-Emission Zone & Port Scrubbers (-35% AQI)',
      description: 'Cuts industrial and vehicular particulate emissions across all districts.',
      category: 'restoration',
      commandType: 'enforce_emission_controls',
      defaultPayload: { aqiReductionFactor: 0.35 },
    },
    {
      id: 'cty-infrastructure-overhaul',
      label: 'Dispatch Citywide Infrastructure Repair Brigades (+22% Health)',
      description: 'Restores structural health of bridges, water mains, and transformers across all 18 districts.',
      category: 'restoration',
      commandType: 'overhaul_city_infrastructure',
      defaultPayload: { healthBoost: 22 },
    },
    {
      id: 'cty-green-canopy-corridors',
      label: 'Plant Urban Sponge Parks & Green Corridors',
      description: 'Improves district livability, absorbs stormwater, and filters urban air pollution.',
      category: 'restoration',
      commandType: 'plant_urban_green_canopy',
      defaultPayload: { aqiDrop: 24, livabilityBoost: 8 },
    },
    {
      id: 'cty-emergency-response-mobilize',
      label: 'Mobilize Municipal Emergency Command (Clear Crises)',
      description: 'Resolves active brownout, water main, and gridlock emergencies across affected districts.',
      category: 'restoration',
      commandType: 'resolve_municipal_emergencies',
      defaultPayload: { restoreMargin: 0.25 },
    },
    {
      id: 'cty-trigger-grid-brownout',
      label: 'Simulate Substation Overload (-280 MW Grid Loss)',
      description: 'Trips a primary transmission substation, inducing cascading district brownouts.',
      category: 'crisis',
      commandType: 'trigger_municipal_emergency',
      defaultPayload: { emergencyType: 'grid_brownout', gridLossMw: 280 },
    },
    {
      id: 'cty-trigger-water-rupture',
      label: 'Simulate Trunk Water Main Rupture (-260 ML/d)',
      description: 'Ruptures a metropolitan aqueduct trunk, reducing potable water supply.',
      category: 'crisis',
      commandType: 'trigger_municipal_emergency',
      defaultPayload: { emergencyType: 'water_main_break', waterLossMld: 260 },
    },
    {
      id: 'cty-trigger-transit-paralysis',
      label: 'Simulate Arterial Bridge & Transit Closure',
      description: 'Disrupts central commuter corridors, spiking traffic congestion.',
      category: 'crisis',
      commandType: 'trigger_municipal_emergency',
      defaultPayload: { emergencyType: 'transit_gridlock', congestionSpike: 32 },
    },
    {
      id: 'cty-trigger-smog-inversion',
      label: 'Trigger Thermal Smog Inversion (+75 AQI)',
      description: 'Traps industrial and vehicular exhaust over the metropolitan basin.',
      category: 'crisis',
      commandType: 'trigger_municipal_emergency',
      defaultPayload: { emergencyType: 'smog_alert', aqiSpike: 75 },
    },
    {
      id: 'cty-inmigration-wave',
      label: 'Simulate Metropolitan Population Surge (+15% Pop)',
      description: 'Adds +15% residents across all districts, testing housing and utility reserves.',
      category: 'crisis',
      commandType: 'surge_city_population',
      defaultPayload: { populationFactor: 1.15 },
    },
    {
      id: 'cty-smart-grid-load-balance',
      label: 'Activate Automated Smart-Grid Demand Response (-10% Peak Load)',
      description: 'Trims peak electrical and water consumption by 10% through smart metering.',
      category: 'policy',
      commandType: 'activate_smart_demand_response',
      defaultPayload: { demandReductionFactor: 0.9 },
    },
    {
      id: 'cty-seismic-structural-retrofit',
      label: 'Seismic & Flood Hardening of District Lifelines',
      description: 'Reinforces district utilities and raises structural health floor.',
      category: 'structure',
      commandType: 'overhaul_city_infrastructure',
      defaultPayload: { healthBoost: 28 },
    },
  ],
  metricDefinitions: [
    {
      id: 'totalPopulationK',
      label: 'Total Metropolitan Population',
      unit: 'k citizens',
      category: 'Demographics',
      description: 'Combined resident population across all 18 urban districts (in thousands).',
      higherIsBetter: true,
    },
    {
      id: 'totalHousingCapacityK',
      label: 'Total Housing Capacity',
      unit: 'k units',
      category: 'Housing',
      description: 'Maximum resident population accommodated without overcrowding.',
      higherIsBetter: true,
    },
    {
      id: 'housingShortageK',
      label: 'Unmet Housing Shortage',
      unit: 'k citizens',
      category: 'Housing',
      description: 'Total residents exceeding district housing capacity across the metropolis.',
      warningThreshold: 90,
      criticalThreshold: 220,
      higherIsBetter: false,
    },
    {
      id: 'totalEmploymentK',
      label: 'Total Metropolitan Jobs',
      unit: 'k jobs',
      category: 'Economy',
      description: 'Aggregate commercial, tech, civic, and industrial employment capacity.',
      higherIsBetter: true,
    },
    {
      id: 'meanTrafficCongestionPct',
      label: 'Mean Traffic Congestion',
      unit: '%',
      category: 'Mobility',
      description: 'Average road and corridor congestion across all 18 districts.',
      warningThreshold: 55,
      criticalThreshold: 72,
      higherIsBetter: false,
    },
    {
      id: 'transitModalSharePct',
      label: 'Public Transit Modal Share',
      unit: '%',
      category: 'Mobility',
      description: 'Percentage of daily commuter trips carried by rapid rail and bus transit.',
      warningThreshold: 32,
      criticalThreshold: 20,
      higherIsBetter: true,
    },
    {
      id: 'totalPowerDemandMw',
      label: 'Total Electrical Grid Demand',
      unit: 'MW',
      category: 'Utilities',
      description: 'Combined electrical power load across all 18 districts.',
    },
    {
      id: 'totalPowerSuppliedMw',
      label: 'Electrical Power Supplied',
      unit: 'MW',
      category: 'Utilities',
      description: 'Actual megawatts delivered by metropolitan power plants and microgrids.',
      higherIsBetter: true,
    },
    {
      id: 'gridReserveMarginPct',
      label: 'Electrical Grid Reserve Margin',
      unit: '%',
      category: 'Utilities',
      comparableDimension: 'power_reserve_ratio',
      description: 'Percentage of electrical supply adequacy relative to metropolitan demand.',
      warningThreshold: 95,
      criticalThreshold: 82,
      higherIsBetter: true,
    },
    {
      id: 'totalWaterDemandMld',
      label: 'Potable Water Demand',
      unit: 'ML/d',
      category: 'Utilities',
      description: 'Daily municipal water demand in megaliters per day.',
    },
    {
      id: 'waterSupplyAdequacyPct',
      label: 'Water Supply Adequacy',
      unit: '%',
      category: 'Utilities',
      description: 'Ratio of treated potable water supply to total district demand.',
      warningThreshold: 94,
      criticalThreshold: 80,
      higherIsBetter: true,
    },
    {
      id: 'totalUncollectedWasteTons',
      label: 'Uncollected Municipal Waste',
      unit: 'tons',
      category: 'Sanitation',
      description: 'Accumulated solid waste awaiting collection or recycling across districts.',
      warningThreshold: 450,
      criticalThreshold: 900,
      higherIsBetter: false,
    },
    {
      id: 'meanPollutionAqi',
      label: 'Mean Air Quality Index (AQI)',
      unit: 'AQI',
      category: 'Environment',
      description: 'Average particulate and NOx air quality index across the 18 districts (lower is cleaner).',
      warningThreshold: 95,
      criticalThreshold: 145,
      higherIsBetter: false,
    },
    {
      id: 'meanInfrastructureHealth',
      label: 'Infrastructure Condition Index',
      unit: '%',
      category: 'Infrastructure',
      description: 'Average structural health of district transit, power, and water lifelines.',
      warningThreshold: 62,
      criticalThreshold: 42,
      higherIsBetter: true,
    },
    {
      id: 'activeEmergencyDistricts',
      label: 'Districts in Municipal Emergency',
      unit: 'districts',
      category: 'Hazards',
      description: 'Count of districts experiencing active brownouts, main breaks, gridlock, or smog alerts.',
      warningThreshold: 2,
      criticalThreshold: 5,
      higherIsBetter: false,
    },
    {
      id: 'activeCorridorsCount',
      label: 'Active Transit & Utility Corridors',
      unit: 'corridors',
      category: 'Mobility',
      description: 'Number of operational inter-district transportation and utility links.',
    },
    {
      id: 'totalDailyCommutersK',
      label: 'Daily Inter-District Commuters',
      unit: 'k trips',
      category: 'Mobility',
      description: 'Total daily commuter flow across the 24 metropolitan transit corridors.',
    },
    {
      id: 'cityLivabilityIndex',
      label: 'Metropolitan Livability Index',
      unit: '%',
      category: 'Stability',
      comparableDimension: 'system_stability_ratio',
      description: 'Population-weighted urban livability score (housing, power, water, transit, clean air).',
      warningThreshold: 64,
      criticalThreshold: 42,
      higherIsBetter: true,
    },
  ],

  initializeWorld(config, rng) {
    const stream = rng.stream('city_init');
    const districts: CityDistrict[] = DISTRICT_SPECS.map((spec) => {
      const posX = roundDet(-35 + spec.gx * 14, 2);
      const posZ = roundDet(-18 + spec.gz * 18, 2);
      const popK = roundDet(spec.popK * (0.9 + config.populationGrowthPressure * 0.1), 1);
      const powerDemand = roundDet(
        popK * 0.32 +
          spec.jobsK * 0.18 +
          (spec.zoneType === 'industrial_port' ? 42 : spec.zoneType === 'downtown_core' ? 28 : 8),
        1,
      );
      const waterDemand = roundDet(popK * 0.34 + spec.jobsK * 0.08, 1);

      return {
        id: spec.id,
        name: spec.name,
        zoneType: spec.zoneType,
        gridX: spec.gx,
        gridZ: spec.gz,
        position: [posX, 0.5, posZ],
        populationK: popK,
        housingCapacityK: spec.houseK,
        jobsAvailableK: spec.jobsK,
        commercialLevel: spec.zoneType === 'downtown_core' || spec.zoneType === 'tech_corridor' ? 3 : 2,
        residentialLevel: spec.zoneType.startsWith('residential') ? 3 : 2,
        transitAccessScore: roundDet(
          clampDet(52 * config.publicTransitInvestment + stream.nextRange(-6, 8), 18, 98),
          1,
        ),
        trafficCongestionPct: roundDet(
          clampDet(54 - config.publicTransitInvestment * 18 + stream.nextRange(-5, 6), 12, 92),
          1,
        ),
        powerDemandMw: powerDemand,
        powerSuppliedMw: powerDemand,
        waterDemandMld: waterDemand,
        waterSuppliedMld: waterDemand,
        uncollectedWasteTons: roundDet(stream.nextRange(8, 24), 1),
        pollutionAqi: roundDet(
          clampDet(
            (spec.zoneType === 'industrial_port' ? 88 : spec.zoneType === 'downtown_core' ? 68 : 42) /
              config.emissionControlStrictness,
            18,
            240,
          ),
          1,
        ),
        infrastructureHealth: roundDet(
          clampDet(76 + config.infrastructureMaintenanceBudget * 14 + stream.nextRange(-4, 4), 35, 100),
          1,
        ),
        emergencyActive: 'none',
        livabilityIndex: 82,
      };
    });

    // Build 24 horizontal + vertical inter-district corridors across the 6x3 grid
    const corridors: TransitUtilityCorridor[] = [];
    for (let gz = 0; gz < 3; gz++) {
      for (let gx = 0; gx < 6; gx++) {
        const curr = districts[gz * 6 + gx];
        if (gx < 5) {
          const right = districts[gz * 6 + (gx + 1)];
          corridors.push({
            id: `cor-${curr.id}-${right.id}`,
            fromDistrictId: curr.id,
            toDistrictId: right.id,
            transitCapacityK: roundDet(95 * config.publicTransitInvestment, 1),
            commuterFlowK: 48,
            congestionRatio: 0.42,
            active: true,
          });
        }
        if (gz < 2) {
          const down = districts[(gz + 1) * 6 + gx];
          corridors.push({
            id: `cor-${curr.id}-${down.id}`,
            fromDistrictId: curr.id,
            toDistrictId: down.id,
            transitCapacityK: roundDet(85 * config.publicTransitInvestment, 1),
            commuterFlowK: 42,
            congestionRatio: 0.38,
            active: true,
          });
        }
      }
    }

    return {
      districts,
      corridors,
      powerPlantCapacityMw: config.gridGenerationCapacityMw,
      renewableGridBonusMw: 0,
      waterWorksCapacityMld: config.waterTreatmentCapacityMld,
      wasteProcessingCapacityTons: roundDet(380 * config.wasteRecyclingEfficiency, 1),
      transitModalSharePct: roundDet(clampDet(36 * config.publicTransitInvestment, 12, 85), 1),
      cumulativeHousingBuiltK: 0,
      cumulativeEmergencyCount: 0,
      lastEmergencyEventId: null,
      lastGridEventId: null,
      lastHousingEventId: null,
    };
  },

  systems: [
    {
      id: 'cty_1_demographics_housing_and_employment',
      name: 'District Population Growth, Housing Shortages & Inter-District Spillover',
      order: 10,
      step(ctx) {
        const { state, config, tick } = ctx;
        let totalShortage = 0;

        for (const d of state.districts) {
          const shortage = Math.max(0, d.populationK - d.housingCapacityK);
          totalShortage += shortage;

          // Growth rate depends on livability, available jobs, and housing headroom
          const headroomRatio = (d.housingCapacityK - d.populationK) / Math.max(1, d.housingCapacityK);
          const growthRate =
            headroomRatio >= 0
              ? 0.012 * config.populationGrowthPressure * (d.livabilityIndex / 80)
              : 0.003 * config.populationGrowthPressure - 0.008;

          d.populationK = roundDet(clampDet(d.populationK * (1 + growthRate), 25, 650), 1);

          // Spillover migration from severely overcrowded district to connected neighbor with spare housing
          if (d.populationK > d.housingCapacityK * 1.12) {
            const neighborCorridor = state.corridors.find(
              (c) => c.active && (c.fromDistrictId === d.id || c.toDistrictId === d.id),
            );
            if (neighborCorridor) {
              const targetId =
                neighborCorridor.fromDistrictId === d.id
                  ? neighborCorridor.toDistrictId
                  : neighborCorridor.fromDistrictId;
              const target = state.districts.find((x) => x.id === targetId);
              if (target && target.populationK < target.housingCapacityK * 0.96) {
                const migrants = roundDet(Math.min(4.5, (d.populationK - d.housingCapacityK) * 0.15), 1);
                d.populationK = roundDet(d.populationK - migrants, 1);
                target.populationK = roundDet(target.populationK + migrants, 1);
              }
            }
          }
        }

        if (totalShortage > 160 && tick % 5 === 0) {
          const ev = ctx.emitEvent({
            type: 'housing_shortage_crisis',
            severity: totalShortage > 280 ? 'critical' : 'warning',
            title: `Metropolitan Housing Shortage (${roundDet(totalShortage, 1)}k Unhoused Deficit)`,
            description: `Population growth outpaced residential capacity across high-demand districts, triggering overcrowding and spillover migration.`,
            sourceSystem: 'cty_1_demographics_housing_and_employment',
            affectedEntityIds: state.districts
              .filter((d) => d.populationK > d.housingCapacityK)
              .map((d) => d.id),
            payload: { totalShortageK: roundDet(totalShortage, 1) },
            causalLinkType: 'dependency',
            causalExplanation:
              'Demographic inflow exceeded built residential capacity in core and high-rise districts.',
          });
          state.lastHousingEventId = ev.id;
        }
      },
    },
    {
      id: 'cty_2_commuting_transit_and_congestion',
      name: 'Corridor Commuter Flows, Transit Modal Split & Road Congestion',
      order: 20,
      step(ctx) {
        const { state, config } = ctx;
        const byId = new Map(state.districts.map((d) => [d.id, d]));

        for (const cor of state.corridors) {
          const dA = byId.get(cor.fromDistrictId);
          const dB = byId.get(cor.toDistrictId);
          if (!dA || !dB || !cor.active) {
            cor.commuterFlowK = 0;
            cor.congestionRatio = 0;
            continue;
          }

          // Commuters flow proportional to residential population and destination jobs
          const tripDemand = (dA.populationK * dB.jobsAvailableK + dB.populationK * dA.jobsAvailableK) / 720;
          cor.commuterFlowK = roundDet(clampDet(tripDemand, 8, 240), 1);

          const autoShare = clampDet(1 - state.transitModalSharePct / 100, 0.15, 0.9);
          const roadLoad = cor.commuterFlowK * autoShare;
          cor.congestionRatio = roundDet(
            clampDet(roadLoad / Math.max(25, cor.transitCapacityK * 0.65), 0.08, 1.45),
            2,
          );
        }

        for (const d of state.districts) {
          const linked = state.corridors.filter(
            (c) => c.fromDistrictId === d.id || c.toDistrictId === d.id,
          );
          const avgCorCongestion =
            linked.reduce((a, c) => a + c.congestionRatio, 0) / Math.max(1, linked.length);

          d.transitAccessScore = roundDet(
            clampDet(state.transitModalSharePct * 1.15 + config.publicTransitInvestment * 12, 15, 99),
            1,
          );
          d.trafficCongestionPct = roundDet(
            clampDet(
              avgCorCongestion * 68 +
                (d.zoneType === 'downtown_core' ? 14 : 4) -
                d.transitAccessScore * 0.25,
              8,
              99,
            ),
            1,
          );
        }
      },
    },
    {
      id: 'cty_3_power_water_and_waste_utilities',
      name: 'Electrical Substation Bus, Potable Water & Waste/Air Pollution',
      order: 30,
      step(ctx) {
        const { state, config, tick } = ctx;

        // 1. Recompute district power and water demands
        let totalPowerDemand = 0;
        let totalWaterDemand = 0;

        for (const d of state.districts) {
          d.powerDemandMw = roundDet(
            d.populationK * 0.34 +
              d.jobsAvailableK * 0.19 +
              d.residentialLevel * 6 +
              d.commercialLevel * 8 +
              (d.zoneType === 'industrial_port' ? 38 : 0),
            1,
          );
          d.waterDemandMld = roundDet(
            d.populationK * 0.36 + d.jobsAvailableK * 0.09 + d.residentialLevel * 4,
            1,
          );
          totalPowerDemand += d.powerDemandMw;
          totalWaterDemand += d.waterDemandMld;
        }

        // 2. Allocate electrical supply across districts (critical civic/medical & downtown first, residential/industrial shed under deficit)
        const totalAvailablePower = state.powerPlantCapacityMw + state.renewableGridBonusMw;
        const powerRatio = clampDet(totalAvailablePower / Math.max(1, totalPowerDemand), 0.35, 1.0);
        const waterRatio = clampDet(
          state.waterWorksCapacityMld / Math.max(1, totalWaterDemand),
          0.35,
          1.0,
        );

        let brownoutDistricts = 0;
        const prevAqi = state.districts.map((d) => d.pollutionAqi);

        for (let i = 0; i < state.districts.length; i++) {
          const d = state.districts[i];
          const priorityBoost = d.zoneType === 'civic_medical' ? 0.08 : 0;
          const effPowerRatio = clampDet(
            powerRatio * (d.infrastructureHealth / 88) + priorityBoost,
            0.3,
            1.0,
          );
          const effWaterRatio = clampDet(
            waterRatio * (d.infrastructureHealth / 90) + priorityBoost,
            0.3,
            1.0,
          );

          d.powerSuppliedMw = roundDet(d.powerDemandMw * effPowerRatio, 1);
          d.waterSuppliedMld = roundDet(d.waterDemandMld * effWaterRatio, 1);

          if (effPowerRatio < 0.86) {
            d.emergencyActive = 'grid_brownout';
            brownoutDistricts++;
          } else if (effWaterRatio < 0.85) {
            d.emergencyActive = 'water_main_break';
          } else if (d.trafficCongestionPct > 82) {
            d.emergencyActive = 'transit_gridlock';
          } else if (d.pollutionAqi > 155) {
            d.emergencyActive = 'smog_alert';
          } else {
            d.emergencyActive = 'none';
          }

          // 3. Solid waste generation vs collection capacity
          const wasteGenerated = d.populationK * 0.14 + (d.zoneType === 'industrial_port' ? 14 : 4);
          const collectionPerDistrict =
            (state.wasteProcessingCapacityTons / state.districts.length) *
            clampDet(1 - d.trafficCongestionPct * 0.004, 0.5, 1.1);
          d.uncollectedWasteTons = roundDet(
            clampDet(d.uncollectedWasteTons + wasteGenerated - collectionPerDistrict, 0, 220),
            1,
          );

          // 4. Air pollution (PM2.5 AQI) from traffic congestion, industrial activity, uncollected waste, and neighbor drift
          const emissionSource =
            (d.trafficCongestionPct * 0.58 +
              (d.zoneType === 'industrial_port' ? 48 : d.zoneType === 'downtown_core' ? 22 : 8) +
              d.uncollectedWasteTons * 0.22) /
            config.emissionControlStrictness;

          const greenSink = d.zoneType === 'green_waterfront' ? 18 : 6;
          const neighborIdx = i > 0 ? i - 1 : i;
          const driftAqi = prevAqi[neighborIdx] * 0.15;

          d.pollutionAqi = roundDet(
            clampDet(prevAqi[i] * 0.55 + (emissionSource - greenSink) * 0.3 + driftAqi, 15, 320),
            1,
          );
        }

        if (brownoutDistricts >= 3 && tick % 4 === 0) {
          state.cumulativeEmergencyCount += 1;
          const ev = ctx.emitEvent({
            type: 'utility_grid_brownout',
            severity: brownoutDistricts >= 6 ? 'critical' : 'warning',
            title: `Metropolitan Grid Deficit (${brownoutDistricts} Districts in Brownout)`,
            description: `Total electrical demand (${roundDet(totalPowerDemand, 1)} MW) exceeded effective supply capacity (${roundDet(totalAvailablePower, 1)} MW).`,
            sourceSystem: 'cty_3_power_water_and_waste_utilities',
            affectedEntityIds: state.districts
              .filter((d) => d.emergencyActive === 'grid_brownout')
              .map((d) => d.id),
            payload: {
              brownoutDistricts,
              totalPowerDemandMw: roundDet(totalPowerDemand, 1),
              totalAvailablePowerMw: roundDet(totalAvailablePower, 1),
            },
            causalLinkType: 'dependency',
            causedByEventId: state.lastHousingEventId ?? state.lastEmergencyEventId,
            causalExplanation:
              'District population and building load growth exceeded electrical substation generation and transformer health.',
          });
          state.lastGridEventId = ev.id;
        }
      },
    },
    {
      id: 'cty_4_infrastructure_decay_and_emergencies',
      name: 'Infrastructure Wear, Maintenance Recovery & Livability Score',
      order: 40,
      step(ctx) {
        const { state, config } = ctx;

        for (const d of state.districts) {
          const wear =
            0.65 +
            (d.trafficCongestionPct / 100) * 0.55 +
            Math.max(0, d.populationK - d.housingCapacityK) * 0.008;
          const repair = 0.82 * config.infrastructureMaintenanceBudget;

          d.infrastructureHealth = roundDet(
            clampDet(d.infrastructureHealth + repair - wear, 15, 100),
            1,
          );

          // Composite Livability Index
          const housingAdequacy = clampDet(
            (d.housingCapacityK / Math.max(1, d.populationK)) * 100,
            35,
            105,
          );
          const powerAdequacy = (d.powerSuppliedMw / Math.max(1, d.powerDemandMw)) * 100;
          const waterAdequacy = (d.waterSuppliedMld / Math.max(1, d.waterDemandMld)) * 100;
          const congestionPenalty = Math.max(0, d.trafficCongestionPct - 35) * 0.35;
          const aqiPenalty = Math.max(0, d.pollutionAqi - 45) * 0.22;
          const wastePenalty = d.uncollectedWasteTons * 0.12;

          d.livabilityIndex = roundDet(
            clampDet(
              housingAdequacy * 0.28 +
                powerAdequacy * 0.24 +
                waterAdequacy * 0.22 +
                d.infrastructureHealth * 0.26 -
                congestionPenalty -
                aqiPenalty -
                wastePenalty,
              5,
              100,
            ),
            1,
          );
        }
      },
    },
  ],

  applyCommand(state, command: SimulationCommand, ctx) {
    const payload = command.payload ?? {};

    if (command.type === 'develop_housing_towers') {
      const boostK = Number(payload.capacityBoostPerDistrictK ?? 45);
      const powerLoad = Number(payload.powerDemandIncreaseMw ?? 18);
      // Prioritize districts with highest housing shortage
      const sorted = [...state.districts].sort(
        (a, b) => b.populationK - b.housingCapacityK - (a.populationK - a.housingCapacityK),
      );
      const targets = sorted.slice(0, 8);
      for (const d of targets) {
        d.housingCapacityK = roundDet(d.housingCapacityK + boostK, 1);
        d.residentialLevel += 1;
        d.powerDemandMw = roundDet(d.powerDemandMw + powerLoad, 1);
      }
      state.cumulativeHousingBuiltK = roundDet(
        state.cumulativeHousingBuiltK + boostK * targets.length,
        1,
      );
      const ev = ctx.emitEvent({
        type: 'housing_towers_constructed',
        severity: 'positive',
        title: `High-Density Housing Expanded (+${boostK * targets.length}k Capacity)`,
        description: `Constructed residential towers in 8 high-demand districts, relieving overcrowding while adding +${powerLoad * targets.length} MW utility load.`,
        sourceSystem: 'command_bus',
        affectedEntityIds: targets.map((t) => t.id),
        payload: { addedHousingK: boostK * targets.length },
        causalLinkType: 'direct',
        causalExplanation: 'Upzoned residential construction expanded district housing stock and utility demand.',
      });
      state.lastHousingEventId = ev.id;
      return;
    }

    if (command.type === 'upzone_mixed_use') {
      const jobsBoost = Number(payload.jobsBoostK ?? 25);
      const houseBoost = Number(payload.housingBoostK ?? 20);
      for (const d of state.districts) {
        if (d.zoneType === 'residential_suburb' || d.zoneType === 'green_waterfront') {
          d.jobsAvailableK = roundDet(d.jobsAvailableK + jobsBoost, 1);
          d.housingCapacityK = roundDet(d.housingCapacityK + houseBoost, 1);
          d.commercialLevel += 1;
        }
      }
      ctx.emitEvent({
        type: 'mixed_use_upzoning_enacted',
        severity: 'positive',
        title: 'Polycentric Mixed-Use Upzoning Enacted',
        description: 'Distributed jobs and housing across suburban and waterfront districts, shortening commuter trips.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Decentralized commercial zoning reduced cross-town commute distances.',
      });
      return;
    }

    if (command.type === 'expand_public_transit') {
      const shareBoost = Number(payload.transitShareBoostPct ?? 16);
      const capBoost = Number(payload.corridorCapacityBoostK ?? 45);
      const before = state.transitModalSharePct;
      state.transitModalSharePct = roundDet(clampDet(before + shareBoost, 10, 88), 1);
      for (const c of state.corridors) {
        c.transitCapacityK = roundDet(c.transitCapacityK + capBoost, 1);
        c.congestionRatio = roundDet(c.congestionRatio * 0.72, 2);
      }
      for (const d of state.districts) {
        d.trafficCongestionPct = roundDet(Math.max(8, d.trafficCongestionPct - shareBoost * 0.9), 1);
      }
      ctx.emitEvent({
        type: 'public_transit_expanded',
        severity: 'positive',
        title: `Rapid Transit Metro Expanded (${before}% -> ${state.transitModalSharePct}% Share)`,
        description: 'Added high-capacity rail corridors and boosted metropolitan transit ridership.',
        sourceSystem: 'command_bus',
        deltas: [
          { metricOrField: 'transitModalSharePct', before, after: state.transitModalSharePct, unit: '%' },
        ],
        causalLinkType: 'direct',
        causalExplanation: 'Expanded metro line frequency shifted commuters off congested highways.',
      });
      return;
    }

    if (command.type === 'enact_congestion_pricing') {
      const drop = Number(payload.congestionReductionPct ?? 18);
      const shift = Number(payload.transitShiftPct ?? 9);
      state.transitModalSharePct = roundDet(clampDet(state.transitModalSharePct + shift, 10, 88), 1);
      for (const d of state.districts) {
        d.trafficCongestionPct = roundDet(Math.max(8, d.trafficCongestionPct - drop), 1);
        d.pollutionAqi = roundDet(Math.max(15, d.pollutionAqi - 12), 1);
      }
      ctx.emitEvent({
        type: 'congestion_pricing_enacted',
        severity: 'positive',
        title: `Core Congestion Pricing & BRT Lanes (-${drop}% Congestion)`,
        description: 'Reduced private vehicle entry into downtown cores and accelerated bus rapid transit.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Peak cordon pricing shifted automobile trips to rapid transit.',
      });
      return;
    }

    if (command.type === 'upgrade_electrical_grid') {
      const addedMw = Number(payload.addedCapacityMw ?? 320);
      const before = state.powerPlantCapacityMw;
      state.powerPlantCapacityMw = roundDet(before + addedMw, 1);
      for (const d of state.districts) {
        d.powerSuppliedMw = d.powerDemandMw;
        if (d.emergencyActive === 'grid_brownout') d.emergencyActive = 'none';
      }
      ctx.emitEvent({
        type: 'electrical_grid_upgraded',
        severity: 'positive',
        title: `Clean Substation & Microgrid Online (+${addedMw} MW)`,
        description: `Metropolitan power capacity increased from ${before} MW to ${state.powerPlantCapacityMw} MW.`,
        sourceSystem: 'command_bus',
        deltas: [
          { metricOrField: 'powerPlantCapacityMw', before, after: state.powerPlantCapacityMw, unit: 'MW' },
        ],
        causalLinkType: 'direct',
        causalExplanation: 'New substation and renewable generation increased grid reserve margin.',
      });
      return;
    }

    if (command.type === 'upgrade_water_infrastructure') {
      const addedMld = Number(payload.addedWaterMld ?? 280);
      const before = state.waterWorksCapacityMld;
      state.waterWorksCapacityMld = roundDet(before + addedMld, 1);
      for (const d of state.districts) {
        d.waterSuppliedMld = d.waterDemandMld;
        if (d.emergencyActive === 'water_main_break') d.emergencyActive = 'none';
      }
      ctx.emitEvent({
        type: 'water_infrastructure_upgraded',
        severity: 'positive',
        title: `Water Reclamation & Aqueduct Expanded (+${addedMld} ML/d)`,
        description: `Municipal potable water capacity increased from ${before} ML/d to ${state.waterWorksCapacityMld} ML/d.`,
        sourceSystem: 'command_bus',
        deltas: [
          { metricOrField: 'waterWorksCapacityMld', before, after: state.waterWorksCapacityMld, unit: 'ML/d' },
        ],
        causalLinkType: 'direct',
        causalExplanation: 'Expanded water treatment and pressurized aqueduct trunks.',
      });
      return;
    }

    if (command.type === 'expand_waste_management') {
      const frac = clampDet(Number(payload.wasteClearanceFraction ?? 0.65), 0.1, 0.95);
      const bonusMw = Number(payload.bonusPowerMw ?? 65);
      state.wasteProcessingCapacityTons = roundDet(state.wasteProcessingCapacityTons + 140, 1);
      state.renewableGridBonusMw = roundDet(state.renewableGridBonusMw + bonusMw, 1);
      for (const d of state.districts) {
        d.uncollectedWasteTons = roundDet(d.uncollectedWasteTons * (1 - frac), 1);
      }
      ctx.emitEvent({
        type: 'waste_to_energy_commissioned',
        severity: 'positive',
        title: `Circular Waste-to-Energy Facility Online (+${bonusMw} MW)`,
        description: `Cleared ${Math.round(frac * 100)}% of uncollected district solid waste and added +${bonusMw} MW grid power.`,
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Materials recovery and thermal valorization cleared waste backlogs.',
      });
      return;
    }

    if (command.type === 'enforce_emission_controls') {
      const factor = clampDet(Number(payload.aqiReductionFactor ?? 0.35), 0.1, 0.75);
      for (const d of state.districts) {
        d.pollutionAqi = roundDet(clampDet(d.pollutionAqi * (1 - factor), 15, 320), 1);
        if (d.emergencyActive === 'smog_alert' && d.pollutionAqi < 120) {
          d.emergencyActive = 'none';
        }
      }
      ctx.emitEvent({
        type: 'emission_controls_enforced',
        severity: 'positive',
        title: `Port Scrubbers & Zero-Emission Zone (-${Math.round(factor * 100)}% AQI)`,
        description: 'Reduced industrial and vehicular particulate concentrations across all 18 districts.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Electrostatic scrubbers and clean-fleet mandates lowered PM2.5 emissions.',
      });
      return;
    }

    if (command.type === 'overhaul_city_infrastructure') {
      const boost = Number(payload.healthBoost ?? 22);
      for (const d of state.districts) {
        d.infrastructureHealth = roundDet(clampDet(d.infrastructureHealth + boost, 20, 100), 1);
      }
      ctx.emitEvent({
        type: 'city_infrastructure_overhauled',
        severity: 'positive',
        title: `Citywide Infrastructure Overhaul (+${boost}% Condition)`,
        description: 'Reinforced bridges, water mains, and electrical substations across all 18 districts.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Civil engineering brigades repaired structural deterioration.',
      });
      return;
    }

    if (command.type === 'plant_urban_green_canopy') {
      const aqiDrop = Number(payload.aqiDrop ?? 24);
      const livBoost = Number(payload.livabilityBoost ?? 8);
      for (const d of state.districts) {
        d.pollutionAqi = roundDet(clampDet(d.pollutionAqi - aqiDrop, 15, 320), 1);
        d.livabilityIndex = roundDet(clampDet(d.livabilityIndex + livBoost, 10, 100), 1);
      }
      ctx.emitEvent({
        type: 'urban_green_canopy_planted',
        severity: 'positive',
        title: 'Urban Sponge Parks & Tree Canopy Expanded',
        description: `Filtered urban air (-${aqiDrop} AQI) and boosted district livability across the metropolis.`,
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Vegetative biofiltration and cooling improved urban microclimates.',
      });
      return;
    }

    if (command.type === 'resolve_municipal_emergencies') {
      state.powerPlantCapacityMw = roundDet(state.powerPlantCapacityMw + 160, 1);
      state.waterWorksCapacityMld = roundDet(state.waterWorksCapacityMld + 140, 1);
      for (const d of state.districts) {
        d.emergencyActive = 'none';
        d.powerSuppliedMw = d.powerDemandMw;
        d.waterSuppliedMld = d.waterDemandMld;
        d.infrastructureHealth = roundDet(clampDet(d.infrastructureHealth + 12, 20, 100), 1);
      }
      ctx.emitEvent({
        type: 'municipal_emergencies_resolved',
        severity: 'positive',
        title: 'Municipal Emergency Command Mobilized',
        description: 'Cleared active brownouts, main breaks, and corridor emergencies across all districts.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Emergency utility reserves and rapid-response crews restored service continuity.',
      });
      return;
    }

    if (command.type === 'trigger_municipal_emergency') {
      const eType = String(payload.emergencyType ?? 'grid_brownout') as CityDistrict['emergencyActive'];
      if (eType === 'grid_brownout') {
        const loss = Number(payload.gridLossMw ?? 280);
        state.powerPlantCapacityMw = roundDet(Math.max(400, state.powerPlantCapacityMw - loss), 1);
      } else if (eType === 'water_main_break') {
        const loss = Number(payload.waterLossMld ?? 260);
        state.waterWorksCapacityMld = roundDet(Math.max(300, state.waterWorksCapacityMld - loss), 1);
      } else if (eType === 'transit_gridlock') {
        const spike = Number(payload.congestionSpike ?? 32);
        for (const d of state.districts) {
          d.trafficCongestionPct = roundDet(clampDet(d.trafficCongestionPct + spike, 10, 99), 1);
        }
      } else if (eType === 'smog_alert') {
        const spike = Number(payload.aqiSpike ?? 75);
        for (const d of state.districts) {
          d.pollutionAqi = roundDet(clampDet(d.pollutionAqi + spike, 15, 320), 1);
        }
      }

      for (let i = 0; i < 6; i++) {
        state.districts[i].emergencyActive = eType;
        if (payload.structuralDamage) {
          state.districts[i].infrastructureHealth = roundDet(
            Math.max(15, state.districts[i].infrastructureHealth - Number(payload.structuralDamage)),
            1,
          );
        }
      }
      state.cumulativeEmergencyCount += 1;
      const ev = ctx.emitEvent({
        type: 'municipal_emergency_triggered',
        severity: 'critical',
        title: `Municipal Emergency: ${eType.toUpperCase()}`,
        description: `Metropolitan infrastructure shock (${eType}) impacted interconnected districts.`,
        sourceSystem: 'command_bus',
        payload: { emergencyType: eType, ...payload },
        causalLinkType: 'direct',
        causalExplanation: 'Acute utility or transportation infrastructure failure.',
      });
      state.lastEmergencyEventId = ev.id;
      return;
    }

    if (command.type === 'surge_city_population') {
      const factor = clampDet(Number(payload.populationFactor ?? 1.15), 0.8, 1.5);
      for (const d of state.districts) {
        d.populationK = roundDet(d.populationK * factor, 1);
      }
      ctx.emitEvent({
        type: 'population_surge_applied',
        severity: 'warning',
        title: `Metropolitan Population Surge (${factor}x)`,
        description: 'Rapid demographic inflow increased housing, transit, and utility demand across all 18 districts.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Regional in-migration wave expanded resident population.',
      });
      return;
    }

    if (command.type === 'activate_smart_demand_response') {
      const factor = clampDet(Number(payload.demandReductionFactor ?? 0.9), 0.7, 1.0);
      state.renewableGridBonusMw = roundDet(state.renewableGridBonusMw + 95, 1);
      for (const d of state.districts) {
        d.powerDemandMw = roundDet(d.powerDemandMw * factor, 1);
        d.waterDemandMld = roundDet(d.waterDemandMld * factor, 1);
      }
      ctx.emitEvent({
        type: 'smart_demand_response_activated',
        severity: 'positive',
        title: 'Smart-Grid Automated Demand Response Active',
        description: 'Trimmed peak power and water demand and dispatched distributed battery storage.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Automated load-shaving reduced peak utility stress.',
      });
    }
  },

  extractMetrics(state) {
    const n = Math.max(1, state.districts.length);
    const totalPop = state.districts.reduce((a, d) => a + d.populationK, 0);
    const totalHouse = state.districts.reduce((a, d) => a + d.housingCapacityK, 0);
    const shortage = state.districts.reduce(
      (a, d) => a + Math.max(0, d.populationK - d.housingCapacityK),
      0,
    );
    const totalJobs = state.districts.reduce((a, d) => a + d.jobsAvailableK, 0);

    const meanCongestion =
      state.districts.reduce((a, d) => a + d.trafficCongestionPct, 0) / n;
    const totalPowerDem = state.districts.reduce((a, d) => a + d.powerDemandMw, 0);
    const totalPowerSup = state.districts.reduce((a, d) => a + d.powerSuppliedMw, 0);
    const gridMargin = (totalPowerSup / Math.max(1, totalPowerDem)) * 100;

    const totalWaterDem = state.districts.reduce((a, d) => a + d.waterDemandMld, 0);
    const totalWaterSup = state.districts.reduce((a, d) => a + d.waterSuppliedMld, 0);
    const waterAdequacy = (totalWaterSup / Math.max(1, totalWaterDem)) * 100;

    const totalWaste = state.districts.reduce((a, d) => a + d.uncollectedWasteTons, 0);
    const meanAqi = state.districts.reduce((a, d) => a + d.pollutionAqi, 0) / n;
    const meanInfra =
      state.districts.reduce((a, d) => a + d.infrastructureHealth, 0) / n;
    const emergencies = state.districts.filter((d) => d.emergencyActive !== 'none').length;
    const activeCorridors = state.corridors.filter((c) => c.active).length;
    const totalCommuters = state.corridors.reduce((a, c) => a + c.commuterFlowK, 0);

    const weightedLivability =
      state.districts.reduce((a, d) => a + d.livabilityIndex * d.populationK, 0) /
      Math.max(1, totalPop);

    return {
      totalPopulationK: roundDet(totalPop, 1),
      totalHousingCapacityK: roundDet(totalHouse, 1),
      housingShortageK: roundDet(shortage, 1),
      totalEmploymentK: roundDet(totalJobs, 1),
      meanTrafficCongestionPct: roundDet(meanCongestion, 1),
      transitModalSharePct: roundDet(state.transitModalSharePct, 1),
      totalPowerDemandMw: roundDet(totalPowerDem, 1),
      totalPowerSuppliedMw: roundDet(totalPowerSup, 1),
      gridReserveMarginPct: roundDet(gridMargin, 1),
      totalWaterDemandMld: roundDet(totalWaterDem, 1),
      waterSupplyAdequacyPct: roundDet(waterAdequacy, 1),
      totalUncollectedWasteTons: roundDet(totalWaste, 1),
      meanPollutionAqi: roundDet(meanAqi, 1),
      meanInfrastructureHealth: roundDet(meanInfra, 1),
      activeEmergencyDistricts: emergencies,
      activeCorridorsCount: activeCorridors,
      totalDailyCommutersK: roundDet(totalCommuters, 1),
      cityLivabilityIndex: roundDet(weightedLivability, 2),
    };
  },

  inspectEntities(state) {
    const list: EntityInspection[] = [];

    for (const d of state.districts) {
      const status =
        d.emergencyActive !== 'none' || d.livabilityIndex < 45
          ? 'critical'
          : d.populationK > d.housingCapacityK || d.trafficCongestionPct > 65
            ? 'warning'
            : 'nominal';

      list.push({
        entityId: d.id,
        kind: `district_${d.zoneType}`,
        label: `${d.name} (${d.zoneType.toUpperCase()})`,
        status,
        position: d.position,
        summary: `Pop ${d.populationK}k / ${d.housingCapacityK}k Housing • Congestion ${d.trafficCongestionPct}% • AQI ${d.pollutionAqi} • Livability ${d.livabilityIndex}%`,
        properties: [
          { key: 'zoneType', label: 'Zoning Classification', value: d.zoneType },
          { key: 'populationK', label: 'Population', value: d.populationK, unit: 'k' },
          { key: 'housingCapacityK', label: 'Housing Capacity', value: d.housingCapacityK, unit: 'k' },
          { key: 'jobsAvailableK', label: 'Employment', value: d.jobsAvailableK, unit: 'k jobs' },
          { key: 'trafficCongestionPct', label: 'Traffic Congestion', value: d.trafficCongestionPct, unit: '%' },
          { key: 'transitAccessScore', label: 'Transit Access', value: d.transitAccessScore, unit: '/100' },
          { key: 'powerSuppliedMw', label: 'Power Supplied', value: `${d.powerSuppliedMw}/${d.powerDemandMw}`, unit: 'MW' },
          { key: 'waterSuppliedMld', label: 'Water Supplied', value: `${d.waterSuppliedMld}/${d.waterDemandMld}`, unit: 'ML/d' },
          { key: 'uncollectedWasteTons', label: 'Uncollected Waste', value: d.uncollectedWasteTons, unit: 'tons' },
          { key: 'pollutionAqi', label: 'Air Quality (AQI)', value: d.pollutionAqi, unit: 'AQI' },
          { key: 'infrastructureHealth', label: 'Infrastructure Health', value: d.infrastructureHealth, unit: '%' },
          { key: 'emergencyActive', label: 'Emergency Status', value: d.emergencyActive },
          { key: 'livabilityIndex', label: 'Livability Index', value: d.livabilityIndex, unit: '%' },
        ],
      });
    }

    for (const cor of state.corridors) {
      list.push({
        entityId: cor.id,
        kind: 'transit_corridor',
        label: `Corridor ${cor.fromDistrictId} <-> ${cor.toDistrictId}`,
        status: cor.congestionRatio > 0.95 ? 'critical' : cor.congestionRatio > 0.7 ? 'warning' : 'nominal',
        summary: `Commuter Flow ${cor.commuterFlowK}k • Capacity ${cor.transitCapacityK}k • Load Ratio ${cor.congestionRatio}`,
        properties: [
          { key: 'commuterFlowK', label: 'Daily Commuters', value: cor.commuterFlowK, unit: 'k' },
          { key: 'transitCapacityK', label: 'Transit Capacity', value: cor.transitCapacityK, unit: 'k' },
          { key: 'congestionRatio', label: 'Congestion Ratio', value: cor.congestionRatio },
        ],
      });
    }

    return list;
  },

  extractRenderFrame(state, _config, runId, tick): RenderFrameData {
    const byId = new Map(state.districts.map((d) => [d.id, d]));

    const zones: RenderZoneVisual[] = state.districts.map((d) => {
      let color = '#334155';
      if (d.emergencyActive !== 'none') {
        color = '#ef4444';
      } else if (d.zoneType === 'downtown_core') {
        color = '#3b82f6';
      } else if (d.zoneType === 'tech_corridor') {
        color = '#06b6d4';
      } else if (d.zoneType === 'green_waterfront') {
        color = '#10b981';
      } else if (d.zoneType === 'industrial_port') {
        color = '#f59e0b';
      } else if (d.zoneType === 'civic_medical') {
        color = '#a855f7';
      } else {
        color = '#6366f1';
      }

      return {
        id: d.id,
        label: d.name,
        position: [d.position[0], 0.35, d.position[2]],
        size: [11.5, 0.65, 13.5],
        value: roundDet(d.livabilityIndex / 100, 2),
        secondaryValue: d.populationK,
        status:
          d.emergencyActive !== 'none'
            ? 'critical'
            : d.populationK > d.housingCapacityK
              ? 'warning'
              : 'nominal',
        color,
      };
    });

    // High-rise skyline towers for each district scaled by population and commercial level
    const entities: RenderEntityVisual[] = state.districts.map((d) => {
      const towerHeight = clampDet(
        1.2 + (d.populationK / 90) * 1.4 + d.commercialLevel * 0.55,
        1.2,
        6.5,
      );
      return {
        id: `tower-${d.id}`,
        kind: 'city_tower',
        label: `${d.name} Skyline (${d.populationK}k)`,
        position: [d.position[0], towerHeight * 0.5 + 0.35, d.position[2]],
        scale: [2.4, towerHeight, 2.4],
        color:
          d.emergencyActive !== 'none'
            ? '#ff3d57'
            : d.pollutionAqi > 115
              ? '#f97316'
              : '#38bdf8',
        energyOrHealth: roundDet(d.livabilityIndex / 100, 2),
        status:
          d.emergencyActive !== 'none'
            ? 'critical'
            : d.trafficCongestionPct > 68
              ? 'warning'
              : 'nominal',
      };
    });

    const connections: RenderConnectionVisual[] = state.corridors.map((c) => {
      const dA = byId.get(c.fromDistrictId);
      const dB = byId.get(c.toDistrictId);
      return {
        id: c.id,
        from: dA ? [dA.position[0], 0.65, dA.position[2]] : [0, 0, 0],
        to: dB ? [dB.position[0], 0.65, dB.position[2]] : [0, 0, 0],
        status:
          c.congestionRatio > 0.9
            ? 'closed'
            : c.congestionRatio > 0.65
              ? 'active'
              : 'open',
        flowRate: c.commuterFlowK,
        label: `${c.fromDistrictId} <-> ${c.toDistrictId} (${c.commuterFlowK}k trips)`,
      };
    });

    const metrics = this.extractMetrics(state, _config);
    const ambientStatus =
      metrics.cityLivabilityIndex < 48 || metrics.activeEmergencyDistricts >= 5
        ? 'critical'
        : metrics.cityLivabilityIndex < 68 || metrics.activeEmergencyDistricts >= 2
          ? 'warning'
          : 'nominal';

    return {
      worldId: 'megacity',
      runId,
      tick,
      ambientStatus,
      entities,
      zones,
      connections,
      hudSummary: {
        Districts: state.districts.length,
        Population: `${metrics.totalPopulationK}k`,
        'Congestion': `${metrics.meanTrafficCongestionPct}%`,
        'Grid Margin': `${metrics.gridReserveMarginPct}%`,
        Livability: `${metrics.cityLivabilityIndex}%`,
      },
    };
  },
});
