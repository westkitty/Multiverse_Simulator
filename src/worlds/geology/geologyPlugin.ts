import { z } from 'zod';
import {
  clampDet,
  RenderConnectionVisual,
  RenderEntityVisual,
  RenderFrameData,
  RenderZoneVisual,
  roundDet,
  SimulationCommand,
} from '../../core/contracts';
import { defineWorldPlugin } from '../../core/pdk';

export interface GeologyConfig extends Record<string, unknown> {
  plateConvergenceRateMmYr: number; // 10 .. 120 mm/yr
  magmaRechargeRate: number; // 0.2 .. 2.5
  poreFluidPressureFactor: number; // 0.3 .. 2.2
  surfaceErosionRate: number; // 0.2 .. 2.2
  faultFrictionCoefficient: number; // 0.35 .. 0.85
  seismicReinforcementLevel: number; // 0.3 .. 2.2
  monitoringNetworkCoverage: number; // 0.2 .. 1.0
}

export type TectonicProvince =
  | 'subduction_trench'
  | 'volcanic_arc'
  | 'transform_fault'
  | 'continental_rift'
  | 'accretionary_wedge'
  | 'craton_interior';

export interface GeologicalCell {
  id: string;
  label: string;
  gridX: number; // 0..7 (8 cols)
  gridZ: number; // 0..5 (6 rows) => 48 geological cells
  centerX: number;
  centerZ: number;
  province: TectonicProvince;
  elevationMeters: number;
  slopeDegrees: number;
  tectonicStressMpa: number; // 0 .. 160 MPa
  faultStrengthMpa: number; // 45 .. 135 MPa
  magmaChamberPressureMpa: number; // 0 .. 140 MPa
  groundwaterPorePressureMpa: number; // 5 .. 65 MPa
  sedimentThicknessMeters: number;
  landslideHazardIndex: number; // 0 .. 100
  seismicSensorInstalled: boolean;
  structuralReinforcement: number; // 0 .. 100
  infrastructureIntegrity: number; // 0 .. 100
  activeHazard: 'none' | 'earthquake_rupture' | 'volcanic_eruption' | 'landslide_debris';
  lastQuakeMw: number;
}

export interface GeologyState {
  cells: GeologicalCell[];
  convergenceMultiplier: number;
  magmaSupplyMultiplier: number;
  cumulativeEarthquakes: number;
  cumulativeEruptions: number;
  cumulativeLandslides: number;
  maxRecordedMw: number;
  lastQuakeEventId: string | null;
  lastEruptionEventId: string | null;
  lastLandslideEventId: string | null;
}

const geologyConfigSchema = z.object({
  plateConvergenceRateMmYr: z.number().min(5).max(150),
  magmaRechargeRate: z.number().min(0.1).max(3.0),
  poreFluidPressureFactor: z.number().min(0.2).max(2.5),
  surfaceErosionRate: z.number().min(0.1).max(2.5),
  faultFrictionCoefficient: z.number().min(0.25).max(0.95),
  seismicReinforcementLevel: z.number().min(0.2).max(2.5),
  monitoringNetworkCoverage: z.number().min(0.1).max(1.0),
});

const GEO_COLS = 8;
const GEO_ROWS = 6; // 48 active geological cells (3x the 16-cell baseline)

const GEO_CELL_NAMES = [
  'Cascadia Trench N', 'Forearc Prism N', 'Mount Hyperion Arc', 'Back-Arc Basin N', 'San Andreas Seg-1', 'Rift Graben N', 'Piedmont Horst', 'Northern Craton',
  'Subduction Zone B', 'Accretionary Slope', 'Caldera Ignis', 'Geothermal Plateau', 'Transform Stepover', 'Basalt Rift Valley', 'Granite Uplift', 'Stable Shield NE',
  'Megathrust Locked-1', 'Coastal Wedge C', 'Stratovolcano Sol', 'Pyroclastic Apron', 'Strike-Slip Fault C', 'Fissure Swarm', 'Karst Aquifer Belt', 'Interior Basin E',
  'Megathrust Locked-2', 'Trench Abyssal Toe', 'Mount Vulcanus', 'Lahar Valley', ' Hayward Fault Seg', 'Obsidian Dome', 'Sandstone Escarpment', 'Prairie Foreland',
  'Southern Trench', 'Submarine Landslide', 'Andesite Cone S', 'Ashfall Terrace', 'Transform Bend S', 'Thermal Geyser Basin', 'Fold-Thrust Belt', 'Alluvial Fan SE',
  'Triple Junction W', 'Outer Rise Flexure', 'Submarine Caldera', 'DACITE Ridge', 'Southern Fault Zone', 'Rift Lake Margin', 'Loess Steeplands', 'Craton Margin S',
];

function getGeoIdx(gx: number, gz: number, rows = GEO_ROWS): number {
  const cx = clampDet(gx, 0, GEO_COLS - 1);
  const cz = clampDet(gz, 0, rows - 1);
  return cz * GEO_COLS + cx;
}

export const geologyPlugin = defineWorldPlugin<GeologyConfig, GeologyState>({
  id: 'geology',
  name: 'World I — The Restless Planet',
  subtitle: '48-Cell Plate Tectonics, Elastic Rebound Quakes, Volcanism & Mass Wasting',
  version: '2.0.0',
  schemaVersion: 1,
  accentColor: '#eab308',
  description:
    'Geophysical and natural-hazard laboratory modeling 48 lithospheric cells across 6 tectonic provinces (Subduction Trench, Accretionary Wedge, Volcanic Arc, Transform Fault, Continental Rift, Craton Shield). Simulates tectonic stress accumulation, effective-stress fault rupture, elastic stress transfer, volcanic magma chamber eruptions, crustal uplift, erosion, pore-water landslides, and infrastructure seismic hardening.',
  physicalModelDocumentation: [
    '48-Cell Lithospheric Grid (8x6 tectonic domain, 3x the 16-cell baseline) spanning active plate boundaries and cratonic interiors.',
    'Mohr-Coulomb & Elastic Rebound Approximation: Fault rupture triggers when tectonic shear stress exceeds effective fault strength tau_crit = mu * (sigma_n - P_fluid); rupture drops local stress and transfers elastic stress to adjacent fault segments.',
    'Magma Chamber Overpressure & Eruption: Subduction volatile flux and rift decompression recharge magma chambers (MPa) until cap-rock tensile strength is exceeded.',
    'Geomorphic Coupling: Co-seismic uplift and volcanic extrusions build topographic relief, while fluvial erosion and pore-pressure saturation drive landslides and sediment transport.',
  ],
  simplifiedMechanicsNote:
    'Uses a discrete cellular spring-block tectonic and box-magma model rather than a 3D viscoelastic finite-element continuum solver.',
  scaleMetadata: {
    areaUnitLabel: 'active geological cells across 6 tectonic provinces',
    baselinePlayableArea: 16,
    expandedPlayableArea: 48,
    baselineTerritoryScalar: 16,
    expandedTerritoryScalar: 48,
    baselineScenarioCount: 3,
    baselineInterventionCount: 6,
    baselineMetricCount: 6,
  },
  configSchema: geologyConfigSchema,
  defaultConfig: {
    plateConvergenceRateMmYr: 58,
    magmaRechargeRate: 1.0,
    poreFluidPressureFactor: 1.0,
    surfaceErosionRate: 1.0,
    faultFrictionCoefficient: 0.62,
    seismicReinforcementLevel: 1.0,
    monitoringNetworkCoverage: 0.55,
  },
  scenarios: [
    {
      id: 'geo-megathrust-cascade',
      name: 'Subduction Megathrust Rupture & Aftershock Cascade',
      subtitle: 'Locked Trench Strain Release -> Elastic Stress Transfer -> Landslides',
      description:
        'Rapid plate convergence loads the western subduction trench near critical Mohr-Coulomb failure. When a locked segment ruptures, elastic stress transfers to neighboring segments and destabilizes steep coastal slopes.',
      hypothesis:
        'Installing seismic early-warning sensors, reinforcing lifelines, and relieving pore-fluid buildup reduces infrastructure damage by over 40%.',
      seed: 90111,
      config: {
        plateConvergenceRateMmYr: 96,
        magmaRechargeRate: 1.1,
        poreFluidPressureFactor: 1.25,
        surfaceErosionRate: 1.0,
        faultFrictionCoefficient: 0.55,
        seismicReinforcementLevel: 0.85,
        monitoringNetworkCoverage: 0.5,
      },
    },
    {
      id: 'geo-caldera-super-eruption',
      name: 'Volcanic Arc Magma Surge & Plinian Eruption Crisis',
      subtitle: 'Deep Mantle Volatile Flux -> Caldera Overpressure -> Lahar Hazard',
      description:
        'High magma recharge pressurizes the central volcanic arc chambers (Mount Hyperion, Caldera Ignis, Mount Vulcanus) toward explosive eruption thresholds.',
      hypothesis:
        'Geothermal pressure venting and lahar diversion barriers prevent catastrophic infrastructure loss during arc eruptions.',
      seed: 90222,
      config: {
        plateConvergenceRateMmYr: 65,
        magmaRechargeRate: 2.15,
        poreFluidPressureFactor: 1.1,
        surfaceErosionRate: 1.15,
        faultFrictionCoefficient: 0.65,
        seismicReinforcementLevel: 0.9,
        monitoringNetworkCoverage: 0.6,
      },
    },
    {
      id: 'geo-pore-pressure-landslide-swarm',
      name: 'Hydro-Seismic Pore Pressure & Mass-Wasting Swarm',
      subtitle: 'High Groundwater Pressure -> Fault Unclamping & Slope Collapse',
      description:
        'Elevated subsurface pore-fluid pressure lowers effective normal stress on faults and saturates steep accretionary and mountain slopes.',
      hypothesis:
        'Draining excess groundwater pore pressure and terracing steep slopes halts landslide propagation.',
      seed: 90333,
      config: {
        plateConvergenceRateMmYr: 62,
        magmaRechargeRate: 0.9,
        poreFluidPressureFactor: 1.95,
        surfaceErosionRate: 1.45,
        faultFrictionCoefficient: 0.52,
        seismicReinforcementLevel: 0.8,
        monitoringNetworkCoverage: 0.45,
      },
    },
    {
      id: 'geo-transform-fault-unzipping',
      name: 'Strike-Slip Transform Fault Unzipping Sequence',
      subtitle: 'Progressive North-to-South Shear Rupture Propagation',
      description:
        'Focuses on the central transform fault corridor where low friction and high shear strain trigger sequential strike-slip earthquakes.',
      hypothesis:
        'Targeted seismic base-isolation retrofits along the transform corridor preserve >80% infrastructure integrity.',
      seed: 90444,
      config: {
        plateConvergenceRateMmYr: 88,
        magmaRechargeRate: 0.75,
        poreFluidPressureFactor: 1.3,
        surfaceErosionRate: 0.9,
        faultFrictionCoefficient: 0.48,
        seismicReinforcementLevel: 0.75,
        monitoringNetworkCoverage: 0.65,
      },
    },
    {
      id: 'geo-continental-rift-fissure',
      name: 'Continental Rift Extension & Basaltic Fissure Swarm',
      subtitle: 'Crustal Thinning + Magmatic Dike Intrusion',
      description:
        'Active rifting in the eastern graben combines normal-fault subsidence with effusive basaltic fissure eruptions.',
      hypothesis:
        'Deploying full sensor arrays and geothermal heat extraction stabilizes rift chamber pressures.',
      seed: 90555,
      config: {
        plateConvergenceRateMmYr: 72,
        magmaRechargeRate: 1.75,
        poreFluidPressureFactor: 1.15,
        surfaceErosionRate: 1.05,
        faultFrictionCoefficient: 0.58,
        seismicReinforcementLevel: 0.95,
        monitoringNetworkCoverage: 0.55,
      },
    },
    {
      id: 'geo-induced-seismicity-injection',
      name: 'Deep Fluid Injection & Induced Seismicity Lab',
      subtitle: 'Anthropogenic Pore-Pressure Spike Along Dormant Faults',
      description:
        'At Tick 3, a deep fluid injection pulse raises pore pressure across interior fault segments, testing Mohr-Coulomb unclamping.',
      hypothesis:
        'Withdrawing pore fluids and reducing injection pressure restores fault stability.',
      seed: 90666,
      config: {
        plateConvergenceRateMmYr: 52,
        magmaRechargeRate: 0.85,
        poreFluidPressureFactor: 1.1,
        surfaceErosionRate: 0.95,
        faultFrictionCoefficient: 0.6,
        seismicReinforcementLevel: 1.0,
        monitoringNetworkCoverage: 0.7,
      },
      scheduledCommands: [
        {
          tick: 3,
          type: 'modify_pore_fluid_pressure',
          label: 'Deep Brine Injection Pore-Pressure Surge',
          payload: { deltaPoreMpa: 22 },
        },
      ],
    },
    {
      id: 'geo-orogenic-uplift-erosion',
      name: 'Rapid Orogeny vs. Extreme Fluvial Erosion',
      subtitle: 'Crustal Thickening & Sediment Basin Filling',
      description:
        'Explores the long-term balance between tectonic mountain building and rapid surface erosion and mass wasting.',
      hypothesis:
        'Slope stabilization and check-dam engineering reduce landslide hazard while preserving highland infrastructure.',
      seed: 90777,
      config: {
        plateConvergenceRateMmYr: 84,
        magmaRechargeRate: 1.2,
        poreFluidPressureFactor: 1.35,
        surfaceErosionRate: 2.0,
        faultFrictionCoefficient: 0.64,
        seismicReinforcementLevel: 1.0,
        monitoringNetworkCoverage: 0.6,
      },
    },
    {
      id: 'geo-unreinforced-vulnerability-crisis',
      name: 'Unreinforced Lifelines in High-Hazard Zone',
      subtitle: 'Low Structural Hardening (0.35x) vs. Compound Geo-Hazards',
      description:
        'Civil infrastructure starts with minimal seismic or volcanic reinforcement and sparse early-warning sensors.',
      hypothesis:
        'Rapid deployment of the 48-cell seismic sensor grid plus structural base-isolation raises survival integrity above 75%.',
      seed: 90888,
      config: {
        plateConvergenceRateMmYr: 78,
        magmaRechargeRate: 1.4,
        poreFluidPressureFactor: 1.25,
        surfaceErosionRate: 1.1,
        faultFrictionCoefficient: 0.56,
        seismicReinforcementLevel: 0.35,
        monitoringNetworkCoverage: 0.2,
      },
    },
    {
      id: 'geo-lithospheric-equilibrium',
      name: 'Balanced 48-Cell Lithospheric Observatory',
      subtitle: 'Nominal Plate Convergence, Magmatism & Geomorphic Cycle',
      description:
        'Reference 48-cell geological domain for controlled geophysical and hazard-mitigation experiments.',
      hypothesis:
        'Moderate plate convergence and 100% monitoring coverage keep infrastructure integrity above 82%.',
      seed: 90999,
      config: {
        plateConvergenceRateMmYr: 58,
        magmaRechargeRate: 1.0,
        poreFluidPressureFactor: 1.0,
        surfaceErosionRate: 1.0,
        faultFrictionCoefficient: 0.62,
        seismicReinforcementLevel: 1.0,
        monitoringNetworkCoverage: 0.55,
      },
    },
  ],
  quickInterventions: [
    {
      id: 'geo-reinforce-infrastructure',
      label: 'Seismic Base-Isolation & Lifeline Hardening (+26%)',
      description: 'Reinforces structures and restores infrastructure integrity across all 48 geological cells.',
      category: 'structure',
      commandType: 'reinforce_vulnerable_areas',
      defaultPayload: { reinforcementBoost: 26, integrityRestore: 22 },
    },
    {
      id: 'geo-deploy-sensor-array',
      label: 'Deploy Full P-Wave Seismic & Tiltmeter Array (100%)',
      description: 'Installs early-warning sensors across all 48 cells, reducing hazard impact damage by 35%.',
      category: 'structure',
      commandType: 'deploy_monitoring_network',
      defaultPayload: { fullCoverage: true },
    },
    {
      id: 'geo-vent-geothermal-magma',
      label: 'Geothermal Pressure Relief Drilling (-28 MPa Magma)',
      description: 'Bleeds overpressure from volcanic arc and rift magma chambers safely.',
      category: 'restoration',
      commandType: 'vent_magma_pressure',
      defaultPayload: { pressureDropMpa: 28 },
    },
    {
      id: 'geo-drain-pore-pressure',
      label: 'Drain Subsurface Pore-Fluid Pressure (-16 MPa)',
      description: 'Lowers groundwater pore pressure, increasing effective fault clamping and stabilizing steep slopes.',
      category: 'restoration',
      commandType: 'modify_pore_fluid_pressure',
      defaultPayload: { deltaPoreMpa: -16 },
    },
    {
      id: 'geo-inject-pore-fluids',
      label: 'Inject High-Pressure Deep Fluids (+20 MPa Pore)',
      description: 'Increases pore-fluid pressure, unclamping faults and inducing slip.',
      category: 'crisis',
      commandType: 'modify_pore_fluid_pressure',
      defaultPayload: { deltaPoreMpa: 20 },
    },
    {
      id: 'geo-controlled-fault-creep',
      label: 'Induce Controlled Aseismic Fault Creep (-24 MPa Stress)',
      description: 'Releases accumulated tectonic shear stress aseismically before a megathrust rupture.',
      category: 'restoration',
      commandType: 'relieve_tectonic_stress',
      defaultPayload: { stressDropMpa: 24 },
    },
    {
      id: 'geo-stabilize-landslide-slopes',
      label: 'Construct Retaining Terraces & Rockbolts (-40% Slide Risk)',
      description: 'Stabilizes steep accretionary and mountain slopes against mass wasting.',
      category: 'structure',
      commandType: 'stabilize_slopes',
      defaultPayload: { hazardReduction: 38 },
    },
    {
      id: 'geo-lahar-diversion-barriers',
      label: 'Build Volcanic Lahar & Pyroclastic Diversion Channels',
      description: 'Protects volcanic arc and valley cells from eruption and debris damage.',
      category: 'structure',
      commandType: 'reinforce_vulnerable_areas',
      defaultPayload: { province: 'volcanic_arc', reinforcementBoost: 34, integrityRestore: 25 },
    },
    {
      id: 'geo-accelerate-plates',
      label: 'Accelerate Plate Convergence (+35% Strain Rate)',
      description: 'Increases tectonic loading rate across subduction and transform boundaries.',
      category: 'crisis',
      commandType: 'adjust_tectonic_convergence',
      defaultPayload: { multiplierDelta: 0.35 },
    },
    {
      id: 'geo-decelerate-plates',
      label: 'Dampen Plate Boundary Strain Rate (-30%)',
      description: 'Reduces tectonic shear loading rate across active fault zones.',
      category: 'policy',
      commandType: 'adjust_tectonic_convergence',
      defaultPayload: { multiplierDelta: -0.3 },
    },
    {
      id: 'geo-trigger-megathrust-quake',
      label: 'Trigger Subduction Megathrust Earthquake (Mw 8.2)',
      description: 'Forces an immediate elastic-rebound rupture along the western subduction trench.',
      category: 'crisis',
      commandType: 'trigger_earthquake_rupture',
      defaultPayload: { province: 'subduction_trench', magnitudeMw: 8.2 },
    },
    {
      id: 'geo-trigger-transform-quake',
      label: 'Trigger Strike-Slip Transform Rupture (Mw 7.4)',
      description: 'Ruptures the central transform fault zone and transfers stress to adjacent segments.',
      category: 'crisis',
      commandType: 'trigger_earthquake_rupture',
      defaultPayload: { province: 'transform_fault', magnitudeMw: 7.4 },
    },
    {
      id: 'geo-trigger-volcanic-eruption',
      label: 'Trigger Explosive Volcanic Arc Eruption (VEI-5)',
      description: 'Pressurizes and erupts central volcanic arc calderas, depositing ash and lava.',
      category: 'crisis',
      commandType: 'trigger_volcanic_eruption',
      defaultPayload: { magmaSpikeMpa: 48 },
    },
    {
      id: 'geo-trigger-mass-landslide',
      label: 'Trigger Alpine & Submarine Landslide Cascade',
      description: 'Initiates slope failure across high-relief cells, eroding peaks and damaging valleys.',
      category: 'crisis',
      commandType: 'trigger_landslide_event',
      defaultPayload: { slopeSeverity: 45 },
    },
    {
      id: 'geo-mantle-plume-surge',
      label: 'Inject Deep Mantle Plume Surge (+45% Magma Supply)',
      description: 'Increases magma recharge across volcanic arc and continental rift zones.',
      category: 'crisis',
      commandType: 'adjust_magma_supply',
      defaultPayload: { magmaMultiplierDelta: 0.45 },
    },
    {
      id: 'geo-cool-magma-conduits',
      label: 'Circulate Deep Cryo-Brine in Volcanic Conduits (-35% Magma)',
      description: 'Slows magma recharge and cools shallow volcanic conduits.',
      category: 'restoration',
      commandType: 'adjust_magma_supply',
      defaultPayload: { magmaMultiplierDelta: -0.35 },
    },
    {
      id: 'geo-sediment-dredging',
      label: 'Dredge & Terrace Alluvial Sediment Basins',
      description: 'Clears excess landslide debris and restores floodplain drainage.',
      category: 'restoration',
      commandType: 'stabilize_slopes',
      defaultPayload: { hazardReduction: 28, clearHazards: true },
    },
    {
      id: 'geo-emergency-reconstruction',
      label: 'Mobilize Post-Disaster Geotechnical Reconstruction',
      description: 'Clears active earthquake/eruption/landslide states and restores infrastructure to >85%.',
      category: 'restoration',
      commandType: 'reinforce_vulnerable_areas',
      defaultPayload: { reinforcementBoost: 18, integrityRestore: 40 },
    },
  ],
  metricDefinitions: [
    {
      id: 'meanTectonicStressMpa',
      label: 'Mean Tectonic Shear Stress',
      unit: 'MPa',
      category: 'Tectonics',
      description: 'Average accumulated crustal shear stress across all 48 geological cells.',
      warningThreshold: 68,
      criticalThreshold: 88,
      higherIsBetter: false,
    },
    {
      id: 'maxTectonicStressMpa',
      label: 'Peak Fault Shear Stress',
      unit: 'MPa',
      category: 'Tectonics',
      description: 'Highest accumulated shear stress on any individual fault segment.',
      warningThreshold: 92,
      criticalThreshold: 112,
      higherIsBetter: false,
    },
    {
      id: 'meanMagmaPressureMpa',
      label: 'Mean Magma Chamber Pressure',
      unit: 'MPa',
      category: 'Volcanism',
      description: 'Average magma overpressure across volcanic arc and rift cells.',
      warningThreshold: 65,
      criticalThreshold: 85,
      higherIsBetter: false,
    },
    {
      id: 'maxMagmaPressureMpa',
      label: 'Peak Caldera Chamber Pressure',
      unit: 'MPa',
      category: 'Volcanism',
      description: 'Highest magma pressure among active volcanic edifices.',
      warningThreshold: 88,
      criticalThreshold: 105,
      higherIsBetter: false,
    },
    {
      id: 'meanPorePressureMpa',
      label: 'Mean Groundwater Pore Pressure',
      unit: 'MPa',
      category: 'Hydrogeology',
      description: 'Average subsurface fluid pressure reducing effective fault friction.',
      warningThreshold: 36,
      criticalThreshold: 48,
      higherIsBetter: false,
    },
    {
      id: 'meanElevationMeters',
      label: 'Mean Crustal Elevation',
      unit: 'm',
      category: 'Geomorphology',
      description: 'Average surface elevation across the 48 lithospheric cells.',
    },
    {
      id: 'maxElevationMeters',
      label: 'Peak Orogenic Elevation',
      unit: 'm',
      category: 'Geomorphology',
      description: 'Highest mountain or volcanic edifice elevation in the domain.',
    },
    {
      id: 'meanSedimentThicknessM',
      label: 'Mean Sediment Thickness',
      unit: 'm',
      category: 'Geomorphology',
      description: 'Average eroded and deposited regolith/sediment layer thickness.',
    },
    {
      id: 'meanLandslideHazardIndex',
      label: 'Mean Landslide Hazard Index',
      unit: 'idx',
      category: 'Geomorphology',
      description: 'Average slope instability and mass-wasting risk across all 48 cells.',
      warningThreshold: 48,
      criticalThreshold: 68,
      higherIsBetter: false,
    },
    {
      id: 'cumulativeEarthquakes',
      label: 'Cumulative Earthquakes',
      unit: 'quakes',
      category: 'Seismology',
      description: 'Total fault rupture events recorded since Genesis.',
    },
    {
      id: 'maxRecordedMw',
      label: 'Peak Recorded Magnitude (Mw)',
      unit: 'Mw',
      category: 'Seismology',
      description: 'Largest moment-magnitude earthquake recorded during the run.',
      warningThreshold: 6.8,
      criticalThreshold: 7.8,
      higherIsBetter: false,
    },
    {
      id: 'cumulativeEruptions',
      label: 'Cumulative Volcanic Eruptions',
      unit: 'eruptions',
      category: 'Volcanism',
      description: 'Total volcanic eruption episodes since Genesis.',
    },
    {
      id: 'cumulativeLandslides',
      label: 'Cumulative Landslide Events',
      unit: 'slides',
      category: 'Geomorphology',
      description: 'Total mass-wasting slope failures triggered since Genesis.',
    },
    {
      id: 'activeHazardCellsCount',
      label: 'Cells in Active Geo-Hazard',
      unit: 'cells',
      category: 'Hazards',
      description: 'Count of cells currently experiencing earthquake rupture, eruption, or landslide.',
      warningThreshold: 3,
      criticalThreshold: 7,
      higherIsBetter: false,
    },
    {
      id: 'monitoredCellsPct',
      label: 'Seismic Sensor Coverage',
      unit: '%',
      category: 'Mitigation',
      description: 'Percentage of the 48 geological cells equipped with early-warning telemetry.',
      higherIsBetter: true,
    },
    {
      id: 'meanReinforcementLevel',
      label: 'Mean Geotechnical Reinforcement',
      unit: '%',
      category: 'Mitigation',
      description: 'Average seismic and slope engineering protection level across cells.',
      higherIsBetter: true,
    },
    {
      id: 'meanInfrastructureIntegrity',
      label: 'Exposed Infrastructure Integrity',
      unit: '%',
      category: 'Mitigation',
      description: 'Average structural integrity of surface lifelines exposed to geological hazards.',
      warningThreshold: 68,
      criticalThreshold: 45,
      higherIsBetter: true,
    },
    {
      id: 'geologicalStabilityIndex',
      label: 'Planetary Crustal Stability Index',
      unit: '%',
      category: 'Stability',
      comparableDimension: 'system_stability_ratio',
      description: 'Composite lithospheric and lifeline resilience score.',
      warningThreshold: 60,
      criticalThreshold: 38,
      higherIsBetter: true,
    },
  ],

  initializeWorld(config, rng) {
    const stream = rng.stream('geo_init');
    const cells: GeologicalCell[] = [];

    for (let gz = 0; gz < GEO_ROWS; gz++) {
      for (let gx = 0; gx < GEO_COLS; gx++) {
        const idx = gz * GEO_COLS + gx;
        const centerX = roundDet(-42 + gx * 12, 2);
        const centerZ = roundDet(-30 + gz * 12, 2);

        let province: TectonicProvince = 'craton_interior';
        let elev = 450;
        let slope = 8;
        let initStress = 38;
        let magma = 8;

        if (gx === 0) {
          province = 'subduction_trench';
          elev = -1200 + stream.nextRange(-150, 150);
          slope = 22;
          initStress = 74 + stream.nextRange(-6, 10);
          magma = 12;
        } else if (gx === 1) {
          province = 'accretionary_wedge';
          elev = 620 + stream.nextRange(-80, 120);
          slope = 28;
          initStress = 64 + stream.nextRange(-6, 8);
          magma = 18;
        } else if (gx === 2 || gx === 3) {
          province = 'volcanic_arc';
          elev = 2150 + stream.nextRange(-220, 350);
          slope = 31;
          initStress = 56 + stream.nextRange(-5, 8);
          magma = 64 + stream.nextRange(-8, 12);
        } else if (gx === 4) {
          province = 'transform_fault';
          elev = 880 + stream.nextRange(-90, 90);
          slope = 19;
          initStress = 72 + stream.nextRange(-6, 10);
          magma = 22;
        } else if (gx === 5) {
          province = 'continental_rift';
          elev = 540 + stream.nextRange(-70, 70);
          slope = 16;
          initStress = 52 + stream.nextRange(-5, 7);
          magma = 54 + stream.nextRange(-6, 10);
        } else {
          province = 'craton_interior';
          elev = 380 + stream.nextRange(-40, 60);
          slope = 6;
          initStress = 26 + stream.nextRange(-4, 5);
          magma = 6;
        }

        const pore = roundDet(
          clampDet(18 * config.poreFluidPressureFactor + stream.nextRange(-3, 4), 5, 62),
          1,
        );
        const strength = roundDet(
          clampDet(135 * config.faultFrictionCoefficient + 28, 55, 135),
          1,
        );

        cells.push({
          id: `geo-${gx}-${gz}`,
          label: GEO_CELL_NAMES[idx] ?? `Litho Cell ${gx}-${gz}`,
          gridX: gx,
          gridZ: gz,
          centerX,
          centerZ,
          province,
          elevationMeters: roundDet(elev, 0),
          slopeDegrees: roundDet(slope, 1),
          tectonicStressMpa: roundDet(initStress, 1),
          faultStrengthMpa: strength,
          magmaChamberPressureMpa: roundDet(magma, 1),
          groundwaterPorePressureMpa: pore,
          sedimentThicknessMeters: roundDet(stream.nextRange(12, 45), 1),
          landslideHazardIndex: roundDet(clampDet(slope * 1.1 + pore * 0.45, 5, 95), 1),
          seismicSensorInstalled: stream.nextBoolean(config.monitoringNetworkCoverage),
          structuralReinforcement: roundDet(clampDet(48 * config.seismicReinforcementLevel, 15, 98), 1),
          infrastructureIntegrity: 92,
          activeHazard: 'none',
          lastQuakeMw: 0,
        });
      }
    }

    return {
      cells,
      convergenceMultiplier: 1.0,
      magmaSupplyMultiplier: 1.0,
      cumulativeEarthquakes: 0,
      cumulativeEruptions: 0,
      cumulativeLandslides: 0,
      maxRecordedMw: 0,
      lastQuakeEventId: null,
      lastEruptionEventId: null,
      lastLandslideEventId: null,
    };
  },

  systems: [
    {
      id: 'geo_1_tectonic_stress_and_earthquakes',
      name: 'Plate Convergence Loading, Mohr-Coulomb Fault Rupture & Elastic Transfer',
      order: 10,
      step(ctx) {
        const { state, config } = ctx;
        const rateFactor = (config.plateConvergenceRateMmYr / 58) * state.convergenceMultiplier;

        const rupturedCells: GeologicalCell[] = [];

        for (const cell of state.cells) {
          if (cell.activeHazard === 'earthquake_rupture') {
            cell.activeHazard = 'none';
          }

          const boundaryWeight =
            cell.province === 'subduction_trench'
              ? 3.2
              : cell.province === 'transform_fault'
                ? 2.9
                : cell.province === 'accretionary_wedge'
                  ? 2.1
                  : cell.province === 'continental_rift'
                    ? 1.8
                    : cell.province === 'volcanic_arc'
                      ? 1.5
                      : 0.45;

          cell.tectonicStressMpa = roundDet(
            clampDet(cell.tectonicStressMpa + boundaryWeight * rateFactor, 5, 160),
            1,
          );

          // Effective fault strength drops as groundwater pore pressure rises
          const effectiveStrength = Math.max(
            38,
            cell.faultStrengthMpa - cell.groundwaterPorePressureMpa * 0.55,
          );

          if (cell.tectonicStressMpa >= effectiveStrength) {
            rupturedCells.push(cell);
          }
        }

        if (rupturedCells.length > 0) {
          for (const cell of rupturedCells) {
            const stressDrop = roundDet(cell.tectonicStressMpa * 0.58, 1);
            const mw = roundDet(clampDet(5.2 + Math.log10(Math.max(1, stressDrop)) * 1.45, 5.0, 9.1), 2);
            cell.tectonicStressMpa = roundDet(cell.tectonicStressMpa - stressDrop, 1);
            cell.activeHazard = 'earthquake_rupture';
            cell.lastQuakeMw = mw;
            state.cumulativeEarthquakes += 1;
            if (mw > state.maxRecordedMw) {
              state.maxRecordedMw = mw;
            }

            // Co-seismic crustal uplift on subduction/thrust, subsidence on rift
            const uplift = cell.province === 'continental_rift' ? -8 : 14;
            cell.elevationMeters = roundDet(cell.elevationMeters + uplift, 0);

            // Infrastructure damage mitigated by structuralReinforcement and early warning sensor
            const sensorFactor = cell.seismicSensorInstalled ? 0.65 : 1.0;
            const reinfFactor = clampDet(1 - cell.structuralReinforcement / 135, 0.25, 0.95);
            const damage = roundDet((mw - 4.5) * 7.5 * sensorFactor * reinfFactor, 1);
            cell.infrastructureIntegrity = roundDet(
              clampDet(cell.infrastructureIntegrity - damage, 10, 100),
              1,
            );

            // Elastic stress transfer to orthogonal neighbor cells
            const dirs = [
              [-1, 0],
              [1, 0],
              [0, -1],
              [0, 1],
            ];
            for (const [dx, dz] of dirs) {
              const nx = cell.gridX + dx;
              const nz = cell.gridZ + dz;
              if (nx >= 0 && nx < GEO_COLS && nz >= 0 && nz < state.cells.length / GEO_COLS) {
                const nCell = state.cells[getGeoIdx(nx, nz, state.cells.length / GEO_COLS)];
                nCell.tectonicStressMpa = roundDet(
                  clampDet(nCell.tectonicStressMpa + stressDrop * 0.14, 5, 160),
                  1,
                );
                nCell.landslideHazardIndex = roundDet(
                  clampDet(nCell.landslideHazardIndex + mw * 2.2, 5, 100),
                  1,
                );
              }
            }
          }

          const topQuake = rupturedCells.sort((a, b) => b.lastQuakeMw - a.lastQuakeMw)[0];
          const ev = ctx.emitEvent({
            type: 'earthquake_rupture',
            severity: topQuake.lastQuakeMw >= 7.2 ? 'critical' : 'warning',
            title: `Mw ${topQuake.lastQuakeMw} Earthquake Rupture at ${topQuake.label}`,
            description: `${rupturedCells.length} fault segment(s) ruptured via elastic rebound, transferring stress to neighboring cells.`,
            sourceSystem: 'geo_1_tectonic_stress_and_earthquakes',
            sourceEntityId: topQuake.id,
            affectedEntityIds: rupturedCells.map((c) => c.id),
            payload: {
              magnitudeMw: topQuake.lastQuakeMw,
              rupturedCount: rupturedCells.length,
              structuralDamage: roundDet((topQuake.lastQuakeMw - 4.5) * 6, 1),
            },
            causalLinkType: 'direct',
            causalExplanation:
              'Accumulated plate-boundary shear stress exceeded Mohr-Coulomb effective fault friction.',
          });
          state.lastQuakeEventId = ev.id;
        }
      },
    },
    {
      id: 'geo_2_volcanic_magma_and_eruptions',
      name: 'Mantle Melt Recharge, Caldera Overpressure & Volcanic Eruptions',
      order: 20,
      step(ctx) {
        const { state, config } = ctx;
        const erupted: GeologicalCell[] = [];

        for (const cell of state.cells) {
          if (cell.activeHazard === 'volcanic_eruption') {
            cell.activeHazard = 'none';
          }

          if (cell.province === 'volcanic_arc' || cell.province === 'continental_rift') {
            const recharge =
              (cell.province === 'volcanic_arc' ? 2.4 : 1.7) *
              config.magmaRechargeRate *
              state.magmaSupplyMultiplier;
            cell.magmaChamberPressureMpa = roundDet(
              clampDet(cell.magmaChamberPressureMpa + recharge, 5, 140),
              1,
            );

            if (cell.magmaChamberPressureMpa >= 96) {
              erupted.push(cell);
            }
          } else {
            cell.magmaChamberPressureMpa = roundDet(
              clampDet(cell.magmaChamberPressureMpa * 0.98, 2, 140),
              1,
            );
          }
        }

        if (erupted.length > 0) {
          for (const cell of erupted) {
            cell.magmaChamberPressureMpa = roundDet(cell.magmaChamberPressureMpa * 0.42, 1);
            cell.activeHazard = 'volcanic_eruption';
            cell.elevationMeters = roundDet(cell.elevationMeters + 35, 0);
            cell.sedimentThicknessMeters = roundDet(cell.sedimentThicknessMeters + 8, 1);
            state.cumulativeEruptions += 1;

            const reinfFactor = clampDet(1 - cell.structuralReinforcement / 130, 0.25, 0.95);
            cell.infrastructureIntegrity = roundDet(
              clampDet(cell.infrastructureIntegrity - 22 * reinfFactor, 10, 100),
              1,
            );
          }

          const lead = erupted[0];
          const ev = ctx.emitEvent({
            type: 'volcanic_eruption',
            severity: 'critical',
            title: `Volcanic Eruption at ${lead.label} (${erupted.length} Vent(s))`,
            description: `Magma chamber overpressure (>96 MPa) ruptured cap rock at ${erupted.map((e) => e.label).join(', ')}, extruding lava and tephra.`,
            sourceSystem: 'geo_2_volcanic_magma_and_eruptions',
            sourceEntityId: lead.id,
            affectedEntityIds: erupted.map((e) => e.id),
            payload: {
              eruptedCount: erupted.length,
              ashAerosolLoad: 0.28,
              structuralDamage: 20,
            },
            causalLinkType: 'direct',
            causalExplanation:
              'Subduction volatile flux and magma chamber recharge exceeded lithostatic cap-rock tensile strength.',
          });
          state.lastEruptionEventId = ev.id;
        }
      },
    },
    {
      id: 'geo_3_erosion_groundwater_and_landslides',
      name: 'Surface Weathering, Groundwater Pore Diffusion & Landslide Mass Wasting',
      order: 30,
      step(ctx) {
        const { state, config, tick } = ctx;
        let slideCount = 0;

        for (const cell of state.cells) {
          if (cell.activeHazard === 'landslide_debris') {
            cell.activeHazard = 'none';
          }

          // Surface erosion proportional to positive elevation and slope
          if (cell.elevationMeters > 200) {
            const erodedMeters = roundDet(
              (cell.elevationMeters / 1200) * (cell.slopeDegrees / 25) * 1.4 * config.surfaceErosionRate,
              1,
            );
            cell.elevationMeters = roundDet(cell.elevationMeters - erodedMeters, 0);
            cell.sedimentThicknessMeters = roundDet(
              clampDet(cell.sedimentThicknessMeters + erodedMeters * 0.45, 2, 180),
              1,
            );
          }

          // Pore fluid pressure relaxation toward config baseline
          const targetPore = 18 * config.poreFluidPressureFactor;
          cell.groundwaterPorePressureMpa = roundDet(
            clampDet(cell.groundwaterPorePressureMpa * 0.85 + targetPore * 0.15, 4, 65),
            1,
          );

          // Landslide hazard evaluation
          const rawSlideRisk =
            cell.slopeDegrees * 1.35 +
            cell.groundwaterPorePressureMpa * 0.72 -
            cell.structuralReinforcement * 0.35;
          cell.landslideHazardIndex = roundDet(
            clampDet(cell.landslideHazardIndex * 0.55 + rawSlideRisk * 0.45, 4, 100),
            1,
          );

          if (cell.landslideHazardIndex >= 76) {
            cell.activeHazard = 'landslide_debris';
            cell.landslideHazardIndex = roundDet(cell.landslideHazardIndex * 0.55, 1);
            cell.slopeDegrees = roundDet(Math.max(5, cell.slopeDegrees - 3.5), 1);
            cell.infrastructureIntegrity = roundDet(
              Math.max(15, cell.infrastructureIntegrity - 12),
              1,
            );
            state.cumulativeLandslides += 1;
            slideCount += 1;
          }

          // Natural maintenance recovery of infrastructure
          cell.infrastructureIntegrity = roundDet(
            clampDet(
              cell.infrastructureIntegrity + 0.85 * config.seismicReinforcementLevel,
              10,
              100,
            ),
            1,
          );
        }

        if (slideCount >= 2 && tick % 3 === 0) {
          const ev = ctx.emitEvent({
            type: 'landslide_mass_wasting',
            severity: slideCount >= 4 ? 'critical' : 'warning',
            title: `Mass-Wasting Landslides (${slideCount} Steep Slopes Failed)`,
            description: `High pore-water saturation and seismic shaking triggered debris slides across ${slideCount} high-relief cells.`,
            sourceSystem: 'geo_3_erosion_groundwater_and_landslides',
            payload: { slideCount },
            causalLinkType: 'dependency',
            causedByEventId: state.lastQuakeEventId,
            causalExplanation:
              'Elevated groundwater pore pressure and co-seismic acceleration exceeded slope shear strength.',
          });
          state.lastLandslideEventId = ev.id;
        }
      },
    },
  ],

  applyCommand(state, command: SimulationCommand, ctx) {
    const payload = command.payload ?? {};

    if (command.type === 'reinforce_vulnerable_areas') {
      const targetProv = payload.province ? String(payload.province) : null;
      const reinfBoost = Number(payload.reinforcementBoost ?? 26);
      const intRestore = Number(payload.integrityRestore ?? 22);
      for (const c of state.cells) {
        if (!targetProv || c.province === targetProv) {
          c.structuralReinforcement = roundDet(
            clampDet(c.structuralReinforcement + reinfBoost, 15, 100),
            1,
          );
          c.infrastructureIntegrity = roundDet(
            clampDet(c.infrastructureIntegrity + intRestore, 20, 100),
            1,
          );
          c.activeHazard = 'none';
        }
      }
      ctx.emitEvent({
        type: 'vulnerable_areas_reinforced',
        severity: 'positive',
        title: `Seismic & Geotechnical Reinforcement (+${reinfBoost}%)`,
        description: 'Upgraded base isolation, retaining walls, and lifeline integrity across vulnerable geological cells.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Geotechnical engineering strengthened structures and slopes.',
      });
      return;
    }

    if (command.type === 'deploy_monitoring_network') {
      for (const c of state.cells) {
        c.seismicSensorInstalled = true;
        c.infrastructureIntegrity = roundDet(clampDet(c.infrastructureIntegrity + 8, 20, 100), 1);
      }
      ctx.emitEvent({
        type: 'monitoring_network_deployed',
        severity: 'positive',
        title: '100% P-Wave Seismic & Tiltmeter Network Online',
        description: 'All 48 geological cells are now instrumented with real-time seismic and volcanic telemetry.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Early-warning instrumentation enabled automated lifeline shutoffs.',
      });
      return;
    }

    if (command.type === 'vent_magma_pressure') {
      const drop = Number(payload.pressureDropMpa ?? 28);
      for (const c of state.cells) {
        if (c.province === 'volcanic_arc' || c.province === 'continental_rift') {
          c.magmaChamberPressureMpa = roundDet(
            Math.max(10, c.magmaChamberPressureMpa - drop),
            1,
          );
        }
      }
      ctx.emitEvent({
        type: 'magma_pressure_vented',
        severity: 'positive',
        title: `Geothermal Relief Drilling (-${drop} MPa Chamber Pressure)`,
        description: 'Vented volcanic gas and thermal overpressure across volcanic arc and rift chambers.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Controlled geothermal depressurization reduced eruption risk.',
      });
      return;
    }

    if (command.type === 'modify_pore_fluid_pressure') {
      const delta = Number(payload.deltaPoreMpa ?? -16);
      for (const c of state.cells) {
        c.groundwaterPorePressureMpa = roundDet(
          clampDet(c.groundwaterPorePressureMpa + delta, 4, 65),
          1,
        );
        c.landslideHazardIndex = roundDet(
          clampDet(c.landslideHazardIndex + delta * 0.85, 4, 100),
          1,
        );
      }
      ctx.emitEvent({
        type: 'pore_fluid_pressure_modified',
        severity: delta > 0 ? 'warning' : 'positive',
        title: `Subsurface Pore Pressure Shift (${delta > 0 ? '+' : ''}${delta} MPa)`,
        description: `Modified groundwater pore pressure by ${delta} MPa across all 48 cells, altering effective fault clamping.`,
        sourceSystem: 'command_bus',
        payload: { deltaPoreMpa: delta },
        causalLinkType: 'direct',
        causalExplanation: 'Hydrogeological extraction/injection altered Mohr-Coulomb effective normal stress.',
      });
      return;
    }

    if (command.type === 'relieve_tectonic_stress') {
      const drop = Number(payload.stressDropMpa ?? 24);
      for (const c of state.cells) {
        c.tectonicStressMpa = roundDet(Math.max(8, c.tectonicStressMpa - drop), 1);
      }
      ctx.emitEvent({
        type: 'tectonic_stress_relieved',
        severity: 'positive',
        title: `Controlled Aseismic Creep (-${drop} MPa Shear Stress)`,
        description: 'Dissipated accumulated plate-boundary shear stress without destructive seismic rupture.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Gradual aseismic slip lowered locked fault strain energy.',
      });
      return;
    }

    if (command.type === 'stabilize_slopes') {
      const reduction = Number(payload.hazardReduction ?? 35);
      for (const c of state.cells) {
        c.landslideHazardIndex = roundDet(Math.max(4, c.landslideHazardIndex - reduction), 1);
        if (payload.clearHazards) {
          c.activeHazard = 'none';
        }
      }
      ctx.emitEvent({
        type: 'slopes_stabilized',
        severity: 'positive',
        title: `Slope Terracing & Rockbolting (-${reduction} Landslide Risk)`,
        description: 'Stabilized steep mountain and accretionary slopes against debris slides.',
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Retaining structures increased slope shear resistance.',
      });
      return;
    }

    if (command.type === 'adjust_tectonic_convergence') {
      const delta = Number(payload.multiplierDelta ?? 0.3);
      const before = state.convergenceMultiplier;
      state.convergenceMultiplier = roundDet(clampDet(before + delta, 0.25, 2.5), 2);
      for (const c of state.cells) {
        c.tectonicStressMpa = roundDet(clampDet(c.tectonicStressMpa + delta * 18, 5, 160), 1);
      }
      ctx.emitEvent({
        type: 'tectonic_convergence_adjusted',
        severity: delta > 0 ? 'warning' : 'info',
        title: `Plate Convergence Rate Scaled (${before}x -> ${state.convergenceMultiplier}x)`,
        description: `Tectonic strain accumulation multiplier set to ${state.convergenceMultiplier}x.`,
        sourceSystem: 'command_bus',
        deltas: [
          { metricOrField: 'convergenceMultiplier', before, after: state.convergenceMultiplier },
        ],
        causalLinkType: 'direct',
        causalExplanation: 'Operator modified regional plate convergence velocity.',
      });
      return;
    }

    if (command.type === 'adjust_magma_supply') {
      const delta = Number(payload.magmaMultiplierDelta ?? 0.4);
      const before = state.magmaSupplyMultiplier;
      state.magmaSupplyMultiplier = roundDet(clampDet(before + delta, 0.2, 2.5), 2);
      for (const c of state.cells) {
        if (c.province === 'volcanic_arc' || c.province === 'continental_rift') {
          c.magmaChamberPressureMpa = roundDet(
            clampDet(c.magmaChamberPressureMpa + delta * 24, 5, 140),
            1,
          );
        }
      }
      ctx.emitEvent({
        type: 'magma_supply_adjusted',
        severity: delta > 0 ? 'warning' : 'positive',
        title: `Mantle Magma Supply (${before}x -> ${state.magmaSupplyMultiplier}x)`,
        description: `Adjusted deep magmatic recharge rate across volcanic arc and rift conduits.`,
        sourceSystem: 'command_bus',
        causalLinkType: 'direct',
        causalExplanation: 'Modified asthenospheric melt flux.',
      });
      return;
    }

    if (command.type === 'trigger_earthquake_rupture') {
      const prov = String(payload.province ?? 'subduction_trench');
      const mw = Number(payload.magnitudeMw ?? 8.0);
      const targets = state.cells.filter((c) => c.province === prov);
      for (const c of targets) {
        c.activeHazard = 'earthquake_rupture';
        c.lastQuakeMw = mw;
        c.tectonicStressMpa = roundDet(c.tectonicStressMpa * 0.45, 1);
        c.elevationMeters = roundDet(c.elevationMeters + 16, 0);
        const reinfFactor = clampDet(1 - c.structuralReinforcement / 135, 0.25, 0.95);
        c.infrastructureIntegrity = roundDet(
          Math.max(12, c.infrastructureIntegrity - (mw - 4.5) * 6.5 * reinfFactor),
          1,
        );
      }
      state.cumulativeEarthquakes += targets.length;
      if (mw > state.maxRecordedMw) state.maxRecordedMw = mw;
      const ev = ctx.emitEvent({
        type: 'earthquake_rupture',
        severity: 'critical',
        title: `Triggered Mw ${mw} Earthquake (${prov.toUpperCase()})`,
        description: `Elastic-rebound rupture propagated across ${targets.length} cells in ${prov}.`,
        sourceSystem: 'command_bus',
        affectedEntityIds: targets.map((t) => t.id),
        payload: { magnitudeMw: mw, province: prov, structuralDamage: 24 },
        causalLinkType: 'direct',
        causalExplanation: 'Forced fault slip along locked tectonic boundary.',
      });
      state.lastQuakeEventId = ev.id;
      return;
    }

    if (command.type === 'trigger_volcanic_eruption') {
      const spike = Number(payload.magmaSpikeMpa ?? 48);
      const arcCells = state.cells.filter((c) => c.province === 'volcanic_arc');
      for (let i = 0; i < Math.min(4, arcCells.length); i++) {
        const c = arcCells[i];
        c.magmaChamberPressureMpa = roundDet(clampDet(c.magmaChamberPressureMpa + spike, 20, 130), 1);
        c.activeHazard = 'volcanic_eruption';
        c.elevationMeters = roundDet(c.elevationMeters + 32, 0);
        c.infrastructureIntegrity = roundDet(Math.max(15, c.infrastructureIntegrity - 18), 1);
      }
      state.cumulativeEruptions += 1;
      const ev = ctx.emitEvent({
        type: 'volcanic_eruption',
        severity: 'critical',
        title: 'Explosive Volcanic Arc Eruption Triggered',
        description: 'Four volcanic arc calderas erupted, depositing ash and lava and increasing elevation.',
        sourceSystem: 'command_bus',
        affectedEntityIds: arcCells.slice(0, 4).map((c) => c.id),
        payload: { magmaSpikeMpa: spike, structuralDamage: 22 },
        causalLinkType: 'direct',
        causalExplanation: 'Magmatic overpressure ruptured volcanic conduits.',
      });
      state.lastEruptionEventId = ev.id;
      return;
    }

    if (command.type === 'trigger_landslide_event') {
      const sev = Number(payload.slopeSeverity ?? 45);
      const steep = state.cells.filter((c) => c.slopeDegrees >= 20);
      for (const c of steep.slice(0, 6)) {
        c.activeHazard = 'landslide_debris';
        c.landslideHazardIndex = roundDet(clampDet(c.landslideHazardIndex + sev, 20, 100), 1);
        c.infrastructureIntegrity = roundDet(Math.max(15, c.infrastructureIntegrity - 14), 1);
      }
      state.cumulativeLandslides += 1;
      const ev = ctx.emitEvent({
        type: 'landslide_mass_wasting',
        severity: 'warning',
        title: 'High-Relief Landslide Cascade Triggered',
        description: 'Slope failures mobilized debris across steep accretionary and volcanic slopes.',
        sourceSystem: 'command_bus',
        payload: { slopeSeverity: sev, structuralDamage: 16 },
        causalLinkType: 'direct',
        causalExplanation: 'Triggered mass-wasting failure across steep slopes.',
      });
      state.lastLandslideEventId = ev.id;
    }
  },

  extractMetrics(state) {
    const n = Math.max(1, state.cells.length);
    const stresses = state.cells.map((c) => c.tectonicStressMpa);
    const magmas = state.cells.map((c) => c.magmaChamberPressureMpa);
    const elevations = state.cells.map((c) => c.elevationMeters);

    const meanStress = stresses.reduce((a, b) => a + b, 0) / n;
    const maxStress = Math.max(...stresses);
    const meanMagma = magmas.reduce((a, b) => a + b, 0) / n;
    const maxMagma = Math.max(...magmas);

    const meanPore =
      state.cells.reduce((a, c) => a + c.groundwaterPorePressureMpa, 0) / n;
    const meanElev = elevations.reduce((a, b) => a + b, 0) / n;
    const maxElev = Math.max(...elevations);

    const meanSed =
      state.cells.reduce((a, c) => a + c.sedimentThicknessMeters, 0) / n;
    const meanSlide =
      state.cells.reduce((a, c) => a + c.landslideHazardIndex, 0) / n;

    const activeHazards = state.cells.filter((c) => c.activeHazard !== 'none').length;
    const monitoredPct =
      (state.cells.filter((c) => c.seismicSensorInstalled).length / n) * 100;
    const meanReinf =
      state.cells.reduce((a, c) => a + c.structuralReinforcement, 0) / n;
    const meanIntegrity =
      state.cells.reduce((a, c) => a + c.infrastructureIntegrity, 0) / n;

    const stability = clampDet(
      meanIntegrity * 0.55 +
        meanReinf * 0.25 +
        25 -
        activeHazards * 4.5 -
        Math.max(0, meanStress - 55) * 0.45 -
        Math.max(0, meanSlide - 45) * 0.35,
      5,
      100,
    );

    return {
      meanTectonicStressMpa: roundDet(meanStress, 1),
      maxTectonicStressMpa: roundDet(maxStress, 1),
      meanMagmaPressureMpa: roundDet(meanMagma, 1),
      maxMagmaPressureMpa: roundDet(maxMagma, 1),
      meanPorePressureMpa: roundDet(meanPore, 1),
      meanElevationMeters: roundDet(meanElev, 0),
      maxElevationMeters: roundDet(maxElev, 0),
      meanSedimentThicknessM: roundDet(meanSed, 1),
      meanLandslideHazardIndex: roundDet(meanSlide, 1),
      cumulativeEarthquakes: state.cumulativeEarthquakes,
      maxRecordedMw: roundDet(state.maxRecordedMw, 2),
      cumulativeEruptions: state.cumulativeEruptions,
      cumulativeLandslides: state.cumulativeLandslides,
      activeHazardCellsCount: activeHazards,
      monitoredCellsPct: roundDet(monitoredPct, 1),
      meanReinforcementLevel: roundDet(meanReinf, 1),
      meanInfrastructureIntegrity: roundDet(meanIntegrity, 1),
      geologicalStabilityIndex: roundDet(stability, 2),
    };
  },

  inspectEntities(state) {
    return state.cells.map((c) => {
      const status =
        c.activeHazard !== 'none' || c.tectonicStressMpa > 92 || c.magmaChamberPressureMpa > 88
          ? 'critical'
          : c.tectonicStressMpa > 72 || c.landslideHazardIndex > 62
            ? 'warning'
            : 'nominal';

      return {
        entityId: c.id,
        kind: `geo_${c.province}`,
        label: `${c.label} (${c.province.toUpperCase()})`,
        status,
        position: [c.centerX, Math.max(0.2, c.elevationMeters / 1000), c.centerZ],
        summary: `Stress ${c.tectonicStressMpa}/${c.faultStrengthMpa} MPa • Magma ${c.magmaChamberPressureMpa} MPa • Elev ${c.elevationMeters}m • Integrity ${c.infrastructureIntegrity}%`,
        properties: [
          { key: 'province', label: 'Tectonic Province', value: c.province },
          { key: 'elevationMeters', label: 'Crustal Elevation', value: c.elevationMeters, unit: 'm' },
          { key: 'tectonicStressMpa', label: 'Shear Stress', value: c.tectonicStressMpa, unit: 'MPa' },
          { key: 'faultStrengthMpa', label: 'Fault Strength', value: c.faultStrengthMpa, unit: 'MPa' },
          { key: 'magmaChamberPressureMpa', label: 'Magma Pressure', value: c.magmaChamberPressureMpa, unit: 'MPa' },
          { key: 'groundwaterPorePressureMpa', label: 'Pore Fluid Pressure', value: c.groundwaterPorePressureMpa, unit: 'MPa' },
          { key: 'landslideHazardIndex', label: 'Landslide Hazard', value: c.landslideHazardIndex, unit: 'idx' },
          { key: 'seismicSensorInstalled', label: 'Seismic Telemetry', value: c.seismicSensorInstalled ? 'ACTIVE' : 'NONE' },
          { key: 'structuralReinforcement', label: 'Reinforcement', value: c.structuralReinforcement, unit: '%' },
          { key: 'infrastructureIntegrity', label: 'Infrastructure Integrity', value: c.infrastructureIntegrity, unit: '%' },
          { key: 'activeHazard', label: 'Active Hazard', value: c.activeHazard },
        ],
      };
    });
  },

  extractRenderFrame(state, _config, runId, tick): RenderFrameData {
    const zones: RenderZoneVisual[] = state.cells.map((c) => {
      let color = '#475569';
      if (c.activeHazard === 'volcanic_eruption') {
        color = '#ef4444';
      } else if (c.activeHazard === 'earthquake_rupture') {
        color = '#f59e0b';
      } else if (c.province === 'subduction_trench') {
        color = '#1e3a8a';
      } else if (c.province === 'volcanic_arc') {
        color = '#b91c1c';
      } else if (c.province === 'transform_fault') {
        color = '#d97706';
      } else if (c.province === 'continental_rift') {
        color = '#7c3aed';
      } else if (c.province === 'accretionary_wedge') {
        color = '#0d9488';
      } else {
        color = '#65a30d';
      }

      const heightVisual = clampDet((c.elevationMeters + 1500) / 1400, 0.3, 3.2);

      return {
        id: c.id,
        label: c.label,
        position: [c.centerX, heightVisual * 0.5, c.centerZ],
        size: [10.8, heightVisual, 10.8],
        value: roundDet(c.tectonicStressMpa / 120, 2),
        secondaryValue: c.magmaChamberPressureMpa,
        status:
          c.activeHazard !== 'none' || c.tectonicStressMpa > 92
            ? 'critical'
            : c.tectonicStressMpa > 72
              ? 'warning'
              : 'nominal',
        color,
      };
    });

    // Render volcanic cones, seismic beacons, and hazard markers
    const entities: RenderEntityVisual[] = [];
    for (const c of state.cells) {
      if (c.province === 'volcanic_arc' || c.activeHazard !== 'none') {
        const yBase = clampDet((c.elevationMeters + 1500) / 1400, 0.3, 3.2);
        entities.push({
          id: `volc-${c.id}`,
          kind: c.province === 'volcanic_arc' ? 'predator' : 'herbivore',
          label: `${c.label} (${c.activeHazard !== 'none' ? c.activeHazard.toUpperCase() : `${c.magmaChamberPressureMpa} MPa`})`,
          position: [c.centerX, yBase + 0.8, c.centerZ],
          scale: c.activeHazard !== 'none' ? [1.9, 2.2, 1.9] : [1.3, 1.6, 1.3],
          color:
            c.activeHazard === 'volcanic_eruption'
              ? '#ff3d57'
              : c.activeHazard === 'earthquake_rupture'
                ? '#facc15'
                : '#f97316',
          energyOrHealth: roundDet(c.infrastructureIntegrity / 100, 2),
          status: c.activeHazard !== 'none' ? 'critical' : 'nominal',
        });
      }
    }

    // Plate boundary fault lines connecting trench, transform, and rift cells
    const connections: RenderConnectionVisual[] = [];
    for (let gz = 0; gz < state.cells.length / GEO_COLS - 1; gz++) {
      for (const gx of [0, 2, 4, 5]) {
        const cA = state.cells[getGeoIdx(gx, gz, state.cells.length / GEO_COLS)];
        const cB = state.cells[getGeoIdx(gx, gz + 1, state.cells.length / GEO_COLS)];
        connections.push({
          id: `fault-${cA.id}-${cB.id}`,
          from: [cA.centerX, 1.1, cA.centerZ],
          to: [cB.centerX, 1.1, cB.centerZ],
          status:
            cA.activeHazard !== 'none'
              ? 'closed'
              : cA.tectonicStressMpa > 75
                ? 'active'
                : 'open',
          flowRate: cA.tectonicStressMpa,
          label: `Fault Boundary ${cA.label} - ${cB.label} (${cA.tectonicStressMpa} MPa)`,
        });
      }
    }

    const metrics = this.extractMetrics(state, _config);
    const ambientStatus =
      metrics.geologicalStabilityIndex < 45 || metrics.activeHazardCellsCount >= 5
        ? 'critical'
        : metrics.geologicalStabilityIndex < 68 || metrics.maxTectonicStressMpa > 90
          ? 'warning'
          : 'nominal';

    return {
      worldId: 'geology',
      runId,
      tick,
      ambientStatus,
      entities,
      zones,
      connections,
      hudSummary: {
        'Geo Cells': state.cells.length,
        'Max Stress': `${metrics.maxTectonicStressMpa} MPa`,
        'Max Magma': `${metrics.maxMagmaPressureMpa} MPa`,
        Quakes: state.cumulativeEarthquakes,
        Integrity: `${metrics.meanInfrastructureIntegrity}%`,
      },
    };
  },
});
