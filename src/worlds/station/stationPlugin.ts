import { z } from 'zod';
import {
  clampDet,
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

// Ideal gas constant factor at T = 293.15 K: R * T / 1000 ≈ 2.4374 kPa·m³/mol
const RT_KPA_M3_PER_MOL = 2.4374;

export interface StationConfig extends Record<string, unknown> {
  crewCount: number;
  reactorNominalKw: number;
  solarBackupKw: number;
  batteryCapacityKwh: number;
  initialO2ReserveMoles: number;
  scrubberEfficiency: number; // 0.3 .. 2.0
  autoIsolateCriticalBreach: boolean;
}

export interface StationRoom {
  id: string;
  name: string;
  role: 'bridge' | 'reactor' | 'lifesupport' | 'habitation' | 'engineering' | 'airlock';
  position: [number, number, number];
  size: [number, number, number];
  volumeM3: number;
  n2Moles: number;
  o2Moles: number;
  co2Moles: number;
  pressureKpa: number;
  o2PartialKpa: number;
  co2PartialKpa: number;
  structuralIntegrity: number; // 0..100
  breachSeverity: number; // 0..1
  equipmentHealth: number; // 0..100
  equipmentOnline: boolean;
  powerLoadKw: number;
  powerPriority: 1 | 2 | 3; // 1 = highest priority
  poweredFraction: number; // 0..1
  alarmActive: boolean;
  thermalLoadKw: number;
  radiationShieldingPct: number;
}

export interface StationHatch {
  id: string;
  label: string;
  roomA: string;
  roomB: string;
  isOpen: boolean;
  lastFlowMoles: number;
}

export interface CrewMember {
  id: string;
  name: string;
  specialty: string;
  roomId: string;
  health: number; // 0..100
  bloodOxygen: number; // 0..100
  co2Toxicity: number; // 0..100
  activity: 'monitoring' | 'repairing' | 'evacuating' | 'incapacitated';
}

export interface StationState {
  rooms: StationRoom[];
  hatches: StationHatch[];
  crew: CrewMember[];
  batteryChargeKwh: number;
  o2ReserveMoles: number;
  n2ReserveMoles: number;
  sparePartsUnits: number;
  reactorOnline: boolean;
  reactorThrottle: number; // 0..1.35
  scrubberFaultActive: boolean;
  radiatorLoopEfficiency: number; // 0.3 .. 1.3
  solarArrayDeployedFactor: number; // 0.5 .. 1.8
  totalGenerationKw: number;
  totalDemandKw: number;
  totalSuppliedKw: number;
  lastReactorEventId: string | null;
  lastPowerDropEventId: string | null;
  lastScrubberLossEventId: string | null;
  lastCo2RiseEventId: string | null;
  lastBreachEventId: string | null;
}

const stationConfigSchema = z.object({
  crewCount: z.number().int().min(1).max(24),
  reactorNominalKw: z.number().min(20).max(500),
  solarBackupKw: z.number().min(5).max(160),
  batteryCapacityKwh: z.number().min(20).max(800),
  initialO2ReserveMoles: z.number().min(200).max(20000),
  scrubberEfficiency: z.number().min(0.2).max(2.5),
  autoIsolateCriticalBreach: z.boolean(),
});

function recomputeRoomThermodynamics(room: StationRoom): void {
  room.n2Moles = Math.max(0, roundDet(room.n2Moles, 2));
  room.o2Moles = Math.max(0, roundDet(room.o2Moles, 2));
  room.co2Moles = Math.max(0, roundDet(room.co2Moles, 2));

  const totalMoles = room.n2Moles + room.o2Moles + room.co2Moles;
  room.pressureKpa = roundDet((totalMoles * RT_KPA_M3_PER_MOL) / room.volumeM3, 2);
  room.o2PartialKpa = roundDet((room.o2Moles * RT_KPA_M3_PER_MOL) / room.volumeM3, 2);
  room.co2PartialKpa = roundDet((room.co2Moles * RT_KPA_M3_PER_MOL) / room.volumeM3, 3);

  room.alarmActive =
    room.breachSeverity > 0.02 ||
    room.pressureKpa < 78 ||
    room.o2PartialKpa < 15.5 ||
    room.co2PartialKpa > 1.2 ||
    room.equipmentHealth < 45 ||
    room.poweredFraction < 0.5;
}

function createInitialRoom(
  id: string,
  name: string,
  role: StationRoom['role'],
  position: [number, number, number],
  size: [number, number, number],
  volumeM3: number,
  powerLoadKw: number,
  powerPriority: 1 | 2 | 3,
): StationRoom {
  const totalMoles = (101.3 * volumeM3) / RT_KPA_M3_PER_MOL;
  const room: StationRoom = {
    id,
    name,
    role,
    position,
    size,
    volumeM3,
    n2Moles: roundDet(totalMoles * 0.785, 2),
    o2Moles: roundDet(totalMoles * 0.213, 2),
    co2Moles: roundDet(totalMoles * 0.002, 2),
    pressureKpa: 101.3,
    o2PartialKpa: 21.6,
    co2PartialKpa: 0.2,
    structuralIntegrity: 100,
    breachSeverity: 0,
    equipmentHealth: 100,
    equipmentOnline: true,
    powerLoadKw,
    powerPriority,
    poweredFraction: 1,
    alarmActive: false,
    thermalLoadKw: roundDet(powerLoadKw * 0.65, 1),
    radiationShieldingPct: role === 'habitation' || role === 'reactor' ? 94 : 86,
  };
  recomputeRoomThermodynamics(room);
  return room;
}

const CREW_ROSTER = [
  { name: 'Cmdr. Elena Vance', specialty: 'Command & Telemetry', defaultRoom: 'room-bridge' },
  { name: 'Eng. Marcus Kael', specialty: 'Reactor & Power Bus', defaultRoom: 'room-reactor' },
  { name: 'Dr. Soren Lin', specialty: 'Environmental Life Support', defaultRoom: 'room-lifesupport' },
  { name: 'Spec. Aria Sol', specialty: 'Hydroponics & Bio-Systems', defaultRoom: 'room-habitation' },
  { name: 'Tech. Viktor Oren', specialty: 'Structural & Battery Grid', defaultRoom: 'room-engineering' },
  { name: 'Off. Maya Chen', specialty: 'EVA & Airlock Operations', defaultRoom: 'room-airlock' },
  { name: 'Dr. Nadia Petrov', specialty: 'Hyperbaric Flight Surgeon', defaultRoom: 'room-medbay' },
  { name: 'Bot. Liam Okafor', specialty: 'Algal Bioreactor Specialist', defaultRoom: 'room-hydroponics' },
  { name: 'Sci. Kenji Sato', specialty: 'Microgravity Materials', defaultRoom: 'room-scilab' },
  { name: 'Ast. Clara Mensah', specialty: 'Deep-Space Astrometry', defaultRoom: 'room-observatory' },
  { name: 'Eng. Tariq Haddad', specialty: 'Cryogenics & Gas Storage', defaultRoom: 'room-cryostorage' },
  { name: 'Log. Freja Lindqvist', specialty: 'Orbital Cargo & Robotics', defaultRoom: 'room-robotics' },
];

export const stationPlugin = defineWorldPlugin<StationConfig, StationState>({
  id: 'station',
  name: 'World B — Modular Space Station',
  subtitle: '18-Compartment Orbital Complex, Mass-Conservative Hatches & Power Bus',
  version: '2.0.0',
  schemaVersion: 1,
  accentColor: '#00e5ff',
  description:
    'Modular 18-compartment orbital habitat laboratory (3,810 m³ pressurized volume, 3x the original 6-room station) modeling ideal-gas compartment pressure (N2, O2, CO2), 24 airlock hatches with molar flow conservation, electrical load shedding, life-support dependencies, and crew survival.',
  physicalModelDocumentation: [
    'Ideal-gas 18-compartment manifold (3,810 m³ total volume across 3 orbital rings, 3x the 6-compartment baseline): Each room tracks fixed volume V (m³) and explicit molar gas inventory (n_N2, n_O2, n_CO2). Total pressure P = (n_total * R * T) / V.',
    'Mass-conservative hatch equalization across 24 inter-compartment hatches: Open hatches transfer gas moles between connected rooms proportional to pressure differential ΔP without creating or destroying gas.',
    'Dependency-coupled electrical bus: Primary reactor + solar backup + battery bank supply prioritized room loads across all 18 compartments. Power deficit sheds lower-priority loads first, disabling scrubbers and O2 electrolyzers.',
  ],
  simplifiedMechanicsNote:
    'Isothermal compartment assumption (T = 293 K) is used so pressure changes reflect exact molar gas transfers and hull breaches without CFD turbulence overhead.',
  scaleMetadata: {
    areaUnitLabel: 'functional pressurized compartments (3,810 m³ orbital complex)',
    baselinePlayableArea: 6,
    expandedPlayableArea: 18,
    baselineTerritoryScalar: 1270,
    expandedTerritoryScalar: 3810,
    baselineScenarioCount: 3,
    baselineInterventionCount: 7,
    baselineMetricCount: 6,
  },
  configSchema: stationConfigSchema,
  defaultConfig: {
    crewCount: 12,
    reactorNominalKw: 110,
    solarBackupKw: 22,
    batteryCapacityKwh: 120,
    initialO2ReserveMoles: 4800,
    scrubberEfficiency: 1.0,
    autoIsolateCriticalBreach: false,
  },
  scenarios: [
    {
      id: 'station-cascading-failure',
      name: 'Cascading Reactor & Life Support Crisis',
      subtitle: 'Reactor Trip -> Battery Drain -> Scrubber Offline -> CO2 Toxicity',
      description:
        'At Tick 4, a primary reactor scram trips main generation across the 18-compartment station, forcing loads onto finite batteries. Unless non-essential loads are shed or the reactor is repaired, the Life Support scrubber loses power, CO2 rises, and crew health degrades.',
      hypothesis:
        'Prioritizing Life Support power (Priority 1) and dispatching an engineering repair team before battery depletion prevents CO2 asphyxiation.',
      seed: 55104,
      config: {
        crewCount: 10,
        reactorNominalKw: 110,
        solarBackupKw: 18,
        batteryCapacityKwh: 55,
        initialO2ReserveMoles: 4200,
        scrubberEfficiency: 1.0,
        autoIsolateCriticalBreach: false,
      },
      scheduledCommands: [
        {
          tick: 4,
          type: 'trigger_reactor_scram',
          label: 'Primary Reactor Coolant Trip (SCRAM)',
          payload: { damageAmount: 55 },
        },
      ],
    },
    {
      id: 'station-hull-breach-isolation',
      name: 'Micrometeoroid Hull Breach & Hatch Isolation',
      subtitle: 'Airlock Decompression Propagation Test Across 18 Compartments',
      description:
        'A micrometeoroid punctures the Docking Airlock at Tick 5. With hatches open, atmospheric pressure vents across the station unless the compartment is isolated by closing hatches.',
      hypothesis:
        'Isolating the breached compartment immediately preserves >92% of total station atmosphere and prevents crew hypoxia.',
      seed: 88210,
      config: {
        crewCount: 10,
        reactorNominalKw: 115,
        solarBackupKw: 24,
        batteryCapacityKwh: 120,
        initialO2ReserveMoles: 4800,
        scrubberEfficiency: 1.0,
        autoIsolateCriticalBreach: false,
      },
      scheduledCommands: [
        {
          tick: 5,
          type: 'trigger_hull_breach',
          label: 'Micrometeoroid Impact on Docking Airlock',
          payload: { roomId: 'room-airlock', severity: 0.55 },
        },
      ],
    },
    {
      id: 'station-nominal-orbital',
      name: 'Nominal 18-Compartment Orbital Operations',
      subtitle: 'Closed-Loop Life Support Baseline',
      description:
        'All 18 station compartments operating at 101.3 kPa nominal atmosphere and balanced electrical load for baseline benchmarking and custom fault injection.',
      hypothesis:
        'Closed-loop O2 generation and CO2 scrubbing maintain atmospheric equilibrium indefinitely while reactor power exceeds station demand.',
      seed: 31415,
      config: {
        crewCount: 12,
        reactorNominalKw: 125,
        solarBackupKw: 28,
        batteryCapacityKwh: 160,
        initialO2ReserveMoles: 5200,
        scrubberEfficiency: 1.05,
        autoIsolateCriticalBreach: false,
      },
    },
    {
      id: 'station-dual-decompression-debris',
      name: 'Orbital Debris Cloud Multi-Module Strike',
      subtitle: 'Simultaneous Airlock & Starboard Cargo Hull Punctures',
      description:
        'High-velocity orbital debris strikes both the Docking Airlock and Starboard Cargo Bay at Tick 4.',
      hypothesis:
        'Sealing aft bulkheads and injecting cryogenic N2/O2 reserves stabilizes core habitation pressure.',
      seed: 55201,
      config: {
        crewCount: 12,
        reactorNominalKw: 120,
        solarBackupKw: 26,
        batteryCapacityKwh: 140,
        initialO2ReserveMoles: 5000,
        scrubberEfficiency: 1.0,
        autoIsolateCriticalBreach: false,
      },
      scheduledCommands: [
        {
          tick: 4,
          type: 'trigger_hull_breach',
          label: 'Debris Puncture on Docking Airlock',
          payload: { roomId: 'room-airlock', severity: 0.65 },
        },
      ],
    },
    {
      id: 'station-hypercapnia-scrubber-crisis',
      name: 'High-Occupancy Crew Hypercapnia & Scrubber Failure',
      subtitle: '18 Crew Members + Scheduled CO2 Scrubber Fault',
      description:
        'A full 18-person expedition crew experiences a mechanical CO2 scrubber fault at Tick 3, driving rapid hypercapnic toxicity.',
      hypothesis:
        'Activating bioregenerative hydroponics O2/CO2 scrubbing and repairing the Life Support manifold prevents crew incapacitation.',
      seed: 55302,
      config: {
        crewCount: 18,
        reactorNominalKw: 125,
        solarBackupKw: 25,
        batteryCapacityKwh: 150,
        initialO2ReserveMoles: 5500,
        scrubberEfficiency: 0.9,
        autoIsolateCriticalBreach: false,
      },
      scheduledCommands: [
        {
          tick: 3,
          type: 'trigger_scrubber_fault',
          label: 'LiOH Scrubber Bed Saturation Fault',
          payload: {},
        },
      ],
    },
    {
      id: 'station-eclipse-power-starvation',
      name: 'Orbital Umbra Eclipse & Brownout Load Shedding',
      subtitle: 'Low Reactor Output + Battery Drain Across 18 Modules',
      description:
        'Degraded reactor output and low solar backup during orbital eclipse test priority load shedding across all 18 modules.',
      hypothesis:
        'Shedding Priority-3 science and cargo modules preserves life support and battery reserves.',
      seed: 55403,
      config: {
        crewCount: 10,
        reactorNominalKw: 68,
        solarBackupKw: 8,
        batteryCapacityKwh: 65,
        initialO2ReserveMoles: 4200,
        scrubberEfficiency: 1.0,
        autoIsolateCriticalBreach: false,
      },
    },
    {
      id: 'station-auto-bulkhead-validation',
      name: 'Autonomous Pressure Bulkhead Reflex Trial',
      subtitle: 'Auto-Isolate Enabled vs. Severe Hull Breach',
      description:
        'Tests automatic hatch isolation reflexes when compartment pressure drops below 75 kPa.',
      hypothesis:
        'Automatic bulkhead closure limits total station pressure drop to less than 10 kPa.',
      seed: 55504,
      config: {
        crewCount: 12,
        reactorNominalKw: 120,
        solarBackupKw: 25,
        batteryCapacityKwh: 140,
        initialO2ReserveMoles: 4800,
        scrubberEfficiency: 1.05,
        autoIsolateCriticalBreach: true,
      },
      scheduledCommands: [
        {
          tick: 4,
          type: 'trigger_hull_breach',
          label: 'Severe Airlock Micrometeoroid Impact',
          payload: { roomId: 'room-airlock', severity: 0.75 },
        },
      ],
    },
    {
      id: 'station-cryogenic-o2-depletion',
      name: 'Cryogenic Oxygen Tankage Leak & Hypoxia Threat',
      subtitle: 'Low O2 Reserves + High Crew Metabolic Demand',
      description:
        'Station begins with critically low cryogenic O2 reserves and 16 crew members, testing electrolysis and hydroponic O2 recovery.',
      hypothesis:
        'Docking an emergency cryogenic resupply vehicle and boosting electrolysis prevents cabin hypoxia.',
      seed: 55605,
      config: {
        crewCount: 16,
        reactorNominalKw: 125,
        solarBackupKw: 26,
        batteryCapacityKwh: 150,
        initialO2ReserveMoles: 450,
        scrubberEfficiency: 0.85,
        autoIsolateCriticalBreach: false,
      },
    },
    {
      id: 'station-radiator-thermal-overload',
      name: 'Reactor Thermal Excursion & Bus Overstress',
      subtitle: 'High Reactor Load + Scheduled Reactor Scram & Breach',
      description:
        'Compound orbital emergency combining a reactor coolant trip at Tick 4 and a hull puncture at Tick 7.',
      hypothesis:
        'Coordinated compartment isolation, load shedding, and EVA repair stabilize both power and pressure.',
      seed: 55706,
      config: {
        crewCount: 12,
        reactorNominalKw: 115,
        solarBackupKw: 20,
        batteryCapacityKwh: 80,
        initialO2ReserveMoles: 4400,
        scrubberEfficiency: 1.0,
        autoIsolateCriticalBreach: false,
      },
      scheduledCommands: [
        {
          tick: 4,
          type: 'trigger_reactor_scram',
          label: 'Reactor Thermal Trip',
          payload: { damageAmount: 50 },
        },
        {
          tick: 7,
          type: 'trigger_hull_breach',
          label: 'Secondary Debris Impact on Airlock',
          payload: { roomId: 'room-airlock', severity: 0.48 },
        },
      ],
    },
  ],
  quickInterventions: [
    {
      id: 'stn-isolate-airlock',
      label: 'Isolate Breached / Airlock Zone',
      description: 'Closes hatches connected to the Docking Airlock (or any breached compartment) to stop decompression.',
      category: 'policy',
      commandType: 'isolate_compartment',
      defaultPayload: { roomId: 'room-airlock' },
    },
    {
      id: 'stn-auto-isolate-breaches',
      label: 'Isolate Any Active Hull Breach (Auto-Detect)',
      description: 'Automatically seals all hatches around any compartment with an active hull breach.',
      category: 'policy',
      commandType: 'isolate_compartment',
      defaultPayload: { roomId: 'auto' },
    },
    {
      id: 'stn-repair-all',
      label: 'Dispatch Emergency Repair Crew (All Modules)',
      description: 'Seals active hull breaches, restores reactor core online, and repairs CO2 scrubbers across all 18 rooms.',
      category: 'restoration',
      commandType: 'dispatch_repair',
      defaultPayload: { targetRoomId: 'all' },
    },
    {
      id: 'stn-prioritize-lifesupport',
      label: 'Prioritize Life Support Power (P1)',
      description: 'Sets Life Support to Priority 1 and sheds non-essential Airlock & Cargo auxiliary loads.',
      category: 'policy',
      commandType: 'prioritize_life_support',
      defaultPayload: {},
    },
    {
      id: 'stn-trigger-breach',
      label: 'Trigger Airlock Hull Breach (55%)',
      description: 'Punctures the Docking Airlock hull, venting gas to vacuum.',
      category: 'crisis',
      commandType: 'trigger_hull_breach',
      defaultPayload: { roomId: 'room-airlock', severity: 0.55 },
    },
    {
      id: 'stn-trigger-observatory-breach',
      label: 'Trigger Cupola Observatory Micrometeoroid Breach',
      description: 'Punctures the Deep-Space Telemetry Cupola window seal.',
      category: 'crisis',
      commandType: 'trigger_hull_breach',
      defaultPayload: { roomId: 'room-observatory', severity: 0.45 },
    },
    {
      id: 'stn-trigger-reactor-scram',
      label: 'Trigger Reactor Failure (SCRAM)',
      description: 'Trips the primary reactor offline, forcing station loads onto battery reserves.',
      category: 'crisis',
      commandType: 'trigger_reactor_scram',
      defaultPayload: { damageAmount: 55 },
    },
    {
      id: 'stn-trigger-scrubber-fault',
      label: 'Trigger CO2 Scrubber Fault',
      description: 'Disables chemical CO2 scrubbing in the Life Support Bay.',
      category: 'crisis',
      commandType: 'trigger_scrubber_fault',
      defaultPayload: {},
    },
    {
      id: 'stn-open-all-hatches',
      label: 'Open All 24 Internal Hatches',
      description: 'Opens all 24 inter-compartment hatches to equalize station pressure.',
      category: 'structure',
      commandType: 'set_all_hatches',
      defaultPayload: { isOpen: true },
    },
    {
      id: 'stn-seal-all-hatches',
      label: 'Seal All 24 Internal Bulkhead Hatches',
      description: 'Closes every internal hatch across the 18 compartments for maximum containment.',
      category: 'structure',
      commandType: 'set_all_hatches',
      defaultPayload: { isOpen: false },
    },
    {
      id: 'stn-emergency-resupply',
      label: 'Dock Cryogenic O2 & Battery Resupply (+1200 mol)',
      description: 'Replenishes cryogenic O2 reserves (+1,200 mol) and recharges battery bank (+60 kWh).',
      category: 'restoration',
      commandType: 'emergency_resupply',
      defaultPayload: { oxygenMoles: 1200, batteryKwh: 60 },
    },
    {
      id: 'stn-repressurize-manifold',
      label: 'Execute N2/O2 Manifold Repressurization',
      description: 'Injects balanced 78% N2 / 21% O2 gas into all depressurized compartments.',
      category: 'restoration',
      commandType: 'repressurize_station_manifold',
      defaultPayload: { targetPressureKpa: 101.3 },
    },
    {
      id: 'stn-overclock-reactor',
      label: 'Engage Reactor Throttle Overdrive (125%)',
      description: 'Increases primary fusion/fission reactor throttle to 125% to rapidly recharge batteries.',
      category: 'policy',
      commandType: 'set_reactor_throttle',
      defaultPayload: { throttle: 1.25 },
    },
    {
      id: 'stn-eco-reactor-throttle',
      label: 'Set Reactor Low-Thermal Cruise (80%)',
      description: 'Reduces reactor throttle to 80% to conserve fuel and reduce thermal load.',
      category: 'policy',
      commandType: 'set_reactor_throttle',
      defaultPayload: { throttle: 0.8 },
    },
    {
      id: 'stn-deploy-solar-wings',
      label: 'Unfurl Emergency Roll-Out Solar Arrays (+45% Solar)',
      description: 'Expands exterior photovoltaic wings to boost backup electrical generation.',
      category: 'structure',
      commandType: 'deploy_solar_wings',
      defaultPayload: { factorDelta: 0.45 },
    },
    {
      id: 'stn-shed-nonessential-loads',
      label: 'Shed All Priority-3 Science & Cargo Loads',
      description: 'Powers down non-essential Priority-3 compartments to conserve battery kWh.',
      category: 'policy',
      commandType: 'shed_priority_loads',
      defaultPayload: { shedPriority: 3 },
    },
    {
      id: 'stn-restore-all-loads',
      label: 'Restore All 18 Compartment Electrical Feeds',
      description: 'Brings all shed equipment buses back online across the station.',
      category: 'restoration',
      commandType: 'restore_all_equipment_loads',
      defaultPayload: {},
    },
    {
      id: 'stn-purge-co2-hydroponics',
      label: 'Engage Hydroponic Algal CO2 Bio-Scrubber',
      description: 'Uses the Bioregenerative Hydroponics Dome to scrub cabin CO2 and release O2.',
      category: 'restoration',
      commandType: 'activate_hydroponic_bioscrubber',
      defaultPayload: { co2RemovalRatio: 0.55, o2BonusMoles: 140 },
    },
    {
      id: 'stn-medical-triage-boost',
      label: 'Administer Hyperbaric O2 Medical Triage',
      description: 'Treats crew hypoxia and CO2 toxicity in the Orbital Medical Ward.',
      category: 'restoration',
      commandType: 'administer_crew_medical_triage',
      defaultPayload: { healthBoost: 28 },
    },
    {
      id: 'stn-radiator-ammonia-flush',
      label: 'Flush Exterior Ammonia Thermal Radiators',
      description: 'Restores radiator loop heat rejection efficiency and equipment health.',
      category: 'restoration',
      commandType: 'flush_radiator_loops',
      defaultPayload: { efficiencyBoost: 0.25 },
    },
    {
      id: 'stn-fabricate-spares',
      label: '3D-Print Structural & Avionics Spare Parts (+50)',
      description: 'Uses the Robotics & Machine Shop to manufacture +50 repair spares.',
      category: 'structure',
      commandType: 'fabricate_spare_parts',
      defaultPayload: { sparePartsAdded: 50 },
    },
  ],
  metricDefinitions: [
    {
      id: 'meanPressureKpa',
      label: 'Mean Cabin Pressure',
      unit: 'kPa',
      category: 'Atmosphere',
      description: 'Volume-weighted mean atmospheric pressure across all 18 station compartments (nominal 101.3 kPa).',
      warningThreshold: 86,
      criticalThreshold: 68,
      higherIsBetter: true,
    },
    {
      id: 'minRoomPressureKpa',
      label: 'Lowest Compartment Pressure',
      unit: 'kPa',
      category: 'Atmosphere',
      description: 'Minimum atmospheric pressure among all 18 compartments.',
      warningThreshold: 80,
      criticalThreshold: 55,
      higherIsBetter: true,
    },
    {
      id: 'meanO2PartialKpa',
      label: 'Mean O2 Partial Pressure',
      unit: 'kPa',
      category: 'Atmosphere',
      description: 'Mean breathable oxygen partial pressure (nominal 21.6 kPa; hypoxia < 15 kPa).',
      warningThreshold: 17.0,
      criticalThreshold: 14.5,
      higherIsBetter: true,
    },
    {
      id: 'meanCo2PartialKpa',
      label: 'Mean CO2 Partial Pressure',
      unit: 'kPa',
      category: 'Atmosphere',
      description: 'Mean carbon dioxide partial pressure (nominal 0.20 kPa; toxic > 1.5 kPa).',
      warningThreshold: 1.0,
      criticalThreshold: 2.0,
      higherIsBetter: false,
    },
    {
      id: 'totalGasMoles',
      label: 'Total Pressurized Gas Inventory',
      unit: 'mol',
      category: 'Atmosphere',
      description: 'Total N2 + O2 + CO2 gas moles conserved across all 18 compartments.',
      higherIsBetter: true,
    },
    {
      id: 'o2ReserveMoles',
      label: 'Cryogenic O2 Reserve Tankage',
      unit: 'mol',
      category: 'Resources',
      description: 'Stored liquid oxygen reserve available for life-support makeup.',
      warningThreshold: 800,
      criticalThreshold: 250,
      higherIsBetter: true,
    },
    {
      id: 'totalGenerationKw',
      label: 'Total Electrical Generation',
      unit: 'kW',
      category: 'Power',
      description: 'Combined reactor core and photovoltaic array electrical output.',
      higherIsBetter: true,
    },
    {
      id: 'totalDemandKw',
      label: 'Total Station Load Demand',
      unit: 'kW',
      category: 'Power',
      description: 'Aggregate electrical demand across all online compartments.',
    },
    {
      id: 'netPowerBalanceKw',
      label: 'Electrical Bus Margin',
      unit: 'kW',
      category: 'Power',
      description: 'Generation minus total compartment demand (negative drains battery reserves).',
      warningThreshold: -5,
      criticalThreshold: -30,
      higherIsBetter: true,
    },
    {
      id: 'batteryChargeKwh',
      label: 'Battery Reserve',
      unit: 'kWh',
      category: 'Power',
      description: 'Stored electrical energy in the Engineering battery array.',
      warningThreshold: 25,
      criticalThreshold: 8,
      higherIsBetter: true,
    },
    {
      id: 'openHatchCount',
      label: 'Open Bulkhead Hatches',
      unit: 'hatches',
      category: 'Structure',
      description: 'Number of currently open inter-compartment airlock hatches out of 24.',
    },
    {
      id: 'activeBreachCount',
      label: 'Active Hull Breaches',
      unit: 'breaches',
      category: 'Hazards',
      description: 'Number of compartments currently experiencing hull decompression.',
      warningThreshold: 1,
      criticalThreshold: 2,
      higherIsBetter: false,
    },
    {
      id: 'meanStructuralIntegrity',
      label: 'Mean Hull Structural Integrity',
      unit: '%',
      category: 'Structure',
      description: 'Average pressure hull integrity across all 18 compartments.',
      warningThreshold: 82,
      criticalThreshold: 60,
      higherIsBetter: true,
    },
    {
      id: 'meanEquipmentHealth',
      label: 'Mean Subsystem Equipment Health',
      unit: '%',
      category: 'Structure',
      description: 'Average avionics, scrubber, and power bus equipment health across all 18 modules.',
      warningThreshold: 75,
      criticalThreshold: 50,
      higherIsBetter: true,
    },
    {
      id: 'sparePartsUnits',
      label: 'Engineering Spare Parts Stock',
      unit: 'units',
      category: 'Resources',
      description: 'Fabricated replacement parts available for autonomous and dispatched repairs.',
      higherIsBetter: true,
    },
    {
      id: 'meanCrewBloodOxygen',
      label: 'Mean Crew SpO2 Oxygenation',
      unit: '%',
      category: 'Crew',
      description: 'Average arterial blood oxygenation across all orbital crew members.',
      warningThreshold: 88,
      criticalThreshold: 75,
      higherIsBetter: true,
    },
    {
      id: 'meanCrewCo2Toxicity',
      label: 'Mean Crew Hypercapnic Load',
      unit: '%',
      category: 'Crew',
      description: 'Average CO2 bloodstream toxicity across all crew members.',
      warningThreshold: 15,
      criticalThreshold: 35,
      higherIsBetter: false,
    },
    {
      id: 'meanCrewHealth',
      label: 'Crew Survival & Health Index',
      unit: '%',
      category: 'Crew',
      comparableDimension: 'system_stability_ratio',
      description: 'Average physiological health across all station crew members (0-100%).',
      warningThreshold: 75,
      criticalThreshold: 45,
      higherIsBetter: true,
    },
  ],

  initializeWorld(config) {
    // 18 functional pressurized compartments (~3,810 m³ total volume = 3x the original 6-room / 1,270 m³ baseline)
    const rooms: StationRoom[] = [
      createInitialRoom('room-bridge', 'Command Bridge', 'bridge', [0, 0, -24], [10, 3.6, 8], 180, 9, 1),
      createInitialRoom('room-lifesupport', 'Primary Life Support Bay', 'lifesupport', [0, 0, -12], [11, 3.6, 9], 210, 14, 2),
      createInitialRoom('room-habitation', 'Habitation Quarters Alpha', 'habitation', [-14, 0, -12], [11, 3.6, 10], 250, 7, 2),
      createInitialRoom('room-engineering', 'Central Engineering & Battery Hub', 'engineering', [0, 0, 0], [11, 3.6, 9], 220, 10, 1),
      createInitialRoom('room-reactor', 'Primary Reactor Core Chamber', 'reactor', [14, 0, 0], [10, 4.2, 9], 240, 6, 1),
      createInitialRoom('room-airlock', 'Main Docking Airlock & EVA Bay', 'airlock', [0, 0, 12], [9, 3.4, 8], 190, 5, 3),
      createInitialRoom('room-medbay', 'Orbital Medical & Hyperbaric Ward', 'habitation', [14, 0, -12], [10, 3.6, 9], 200, 6, 2),
      createInitialRoom('room-hydroponics', 'Bioregenerative Hydroponics Dome', 'lifesupport', [-28, 0, -12], [12, 4.0, 10], 260, 7, 2),
      createInitialRoom('room-scilab', 'Microgravity Materials Lab', 'engineering', [-14, 0, 0], [11, 3.6, 9], 215, 6, 3),
      createInitialRoom('room-observatory', 'Deep-Space Telemetry Cupola', 'bridge', [-14, 0, -24], [9, 3.8, 8], 175, 4, 3),
      createInitialRoom('room-cryostorage', 'Cryogenic O2/N2 Tankage Vault', 'lifesupport', [14, 0, -24], [9, 3.6, 8], 185, 5, 2),
      createInitialRoom('room-cargo-port', 'Port Pressurized Logistics Bay', 'airlock', [-14, 0, 12], [11, 3.6, 9], 220, 4, 3),
      createInitialRoom('room-cargo-starboard', 'Starboard Pressurized Logistics Bay', 'airlock', [14, 0, 12], [11, 3.6, 9], 220, 4, 3),
      createInitialRoom('room-robotics', 'Canadarm & Drone Servicing Bay', 'engineering', [0, 0, 24], [10, 3.6, 9], 205, 5, 3),
      createInitialRoom('room-comms-array', 'High-Gain Laser Comms & Avionics', 'bridge', [28, 0, -12], [10, 3.6, 8], 180, 5, 1),
      createInitialRoom('room-hab-ring-west', 'Centrifuge Habitation Ring West', 'habitation', [-28, 0, 0], [11, 3.8, 10], 235, 6, 3),
      createInitialRoom('room-hab-ring-east', 'Centrifuge Habitation Ring East', 'habitation', [28, 0, 0], [11, 3.8, 10], 235, 6, 3),
      createInitialRoom('room-aux-reactor', 'Auxiliary Fuel Cell & Radiator Bay', 'reactor', [28, 0, 12], [10, 3.8, 9], 190, 5, 1),
    ];

    const hatches: StationHatch[] = [
      { id: 'hatch-bridge-ls', label: 'H1 (Bridge <-> Life Support)', roomA: 'room-bridge', roomB: 'room-lifesupport', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-ls-hab', label: 'H2 (Life Support <-> Habitation)', roomA: 'room-lifesupport', roomB: 'room-habitation', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-ls-eng', label: 'H3 (Life Support <-> Engineering)', roomA: 'room-lifesupport', roomB: 'room-engineering', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-eng-reactor', label: 'H4 (Engineering <-> Reactor)', roomA: 'room-engineering', roomB: 'room-reactor', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-eng-airlock', label: 'H5 (Engineering <-> Airlock)', roomA: 'room-engineering', roomB: 'room-airlock', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-ls-medbay', label: 'H6 (Life Support <-> Medbay)', roomA: 'room-lifesupport', roomB: 'room-medbay', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-hab-hydro', label: 'H7 (Habitation <-> Hydroponics)', roomA: 'room-habitation', roomB: 'room-hydroponics', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-eng-scilab', label: 'H8 (Engineering <-> SciLab)', roomA: 'room-engineering', roomB: 'room-scilab', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-hab-scilab', label: 'H9 (Habitation <-> SciLab)', roomA: 'room-habitation', roomB: 'room-scilab', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-bridge-obs', label: 'H10 (Bridge <-> Observatory)', roomA: 'room-bridge', roomB: 'room-observatory', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-bridge-cryo', label: 'H11 (Bridge <-> CryoStorage)', roomA: 'room-bridge', roomB: 'room-cryostorage', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-medbay-cryo', label: 'H12 (Medbay <-> CryoStorage)', roomA: 'room-medbay', roomB: 'room-cryostorage', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-airlock-port', label: 'H13 (Airlock <-> Port Cargo)', roomA: 'room-airlock', roomB: 'room-cargo-port', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-airlock-stbd', label: 'H14 (Airlock <-> Starboard Cargo)', roomA: 'room-airlock', roomB: 'room-cargo-starboard', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-airlock-robotics', label: 'H15 (Airlock <-> Robotics Bay)', roomA: 'room-airlock', roomB: 'room-robotics', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-scilab-port', label: 'H16 (SciLab <-> Port Cargo)', roomA: 'room-scilab', roomB: 'room-cargo-port', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-reactor-stbd', label: 'H17 (Reactor <-> Starboard Cargo)', roomA: 'room-reactor', roomB: 'room-cargo-starboard', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-medbay-comms', label: 'H18 (Medbay <-> Comms Array)', roomA: 'room-medbay', roomB: 'room-comms-array', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-scilab-west', label: 'H19 (SciLab <-> West Hab Ring)', roomA: 'room-scilab', roomB: 'room-hab-ring-west', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-hydro-west', label: 'H20 (Hydroponics <-> West Hab Ring)', roomA: 'room-hydroponics', roomB: 'room-hab-ring-west', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-reactor-east', label: 'H21 (Reactor <-> East Hab Ring)', roomA: 'room-reactor', roomB: 'room-hab-ring-east', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-comms-east', label: 'H22 (Comms <-> East Hab Ring)', roomA: 'room-comms-array', roomB: 'room-hab-ring-east', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-east-aux', label: 'H23 (East Hab Ring <-> Aux Reactor)', roomA: 'room-hab-ring-east', roomB: 'room-aux-reactor', isOpen: true, lastFlowMoles: 0 },
      { id: 'hatch-stbd-aux', label: 'H24 (Starboard Cargo <-> Aux Reactor)', roomA: 'room-cargo-starboard', roomB: 'room-aux-reactor', isOpen: true, lastFlowMoles: 0 },
    ];

    const crew: CrewMember[] = [];
    for (let i = 0; i < config.crewCount; i++) {
      const template = CREW_ROSTER[i % CREW_ROSTER.length];
      crew.push({
        id: `crew-${i + 1}`,
        name: i < CREW_ROSTER.length ? template.name : `Specialist #${i + 1}`,
        specialty: template.specialty,
        roomId: template.defaultRoom,
        health: 100,
        bloodOxygen: 98,
        co2Toxicity: 0,
        activity: 'monitoring',
      });
    }

    const totalDemandKw = rooms.reduce((acc, r) => acc + r.powerLoadKw, 0);

    return {
      rooms,
      hatches,
      crew,
      batteryChargeKwh: config.batteryCapacityKwh,
      o2ReserveMoles: config.initialO2ReserveMoles,
      n2ReserveMoles: 8400,
      sparePartsUnits: 120,
      reactorOnline: true,
      reactorThrottle: 1.0,
      scrubberFaultActive: false,
      radiatorLoopEfficiency: 1.0,
      solarArrayDeployedFactor: 1.0,
      totalGenerationKw: config.reactorNominalKw + config.solarBackupKw,
      totalDemandKw,
      totalSuppliedKw: totalDemandKw,
      lastReactorEventId: null,
      lastPowerDropEventId: null,
      lastScrubberLossEventId: null,
      lastCo2RiseEventId: null,
      lastBreachEventId: null,
    };
  },

  systems: [
    {
      id: 'stn_1_power_generation_and_bus',
      name: '18-Compartment Electrical Bus, Battery Storage & Priority Load Shedding',
      order: 10,
      step(ctx) {
        const { state, config } = ctx;
        const reactorRoom = state.rooms.find((r) => r.id === 'room-reactor')!;
        const reactorHealthFactor = clampDet(reactorRoom.equipmentHealth / 100, 0, 1);

        const reactorKw =
          state.reactorOnline && reactorRoom.equipmentOnline
            ? roundDet(
                config.reactorNominalKw * reactorHealthFactor * state.reactorThrottle,
                2,
              )
            : 0;
        const solarKw = roundDet(config.solarBackupKw * state.solarArrayDeployedFactor, 2);
        const totalGenKw = roundDet(reactorKw + solarKw, 2);
        state.totalGenerationKw = totalGenKw;

        const activeRooms = state.rooms.filter((r) => r.equipmentOnline);
        const totalDemandKw = roundDet(
          activeRooms.reduce((acc, r) => acc + r.powerLoadKw, 0),
          2,
        );
        state.totalDemandKw = totalDemandKw;

        const netKw = totalGenKw - totalDemandKw;
        const prevBattery = state.batteryChargeKwh;

        if (netKw >= 0) {
          state.batteryChargeKwh = roundDet(
            clampDet(
              state.batteryChargeKwh + netKw * 0.25,
              0,
              config.batteryCapacityKwh,
            ),
            2,
          );
          for (const room of state.rooms) {
            room.poweredFraction = room.equipmentOnline ? 1 : 0;
          }
          state.totalSuppliedKw = totalDemandKw;
        } else {
          const neededKwh = Math.abs(netKw) * 0.25;
          if (state.batteryChargeKwh >= neededKwh) {
            state.batteryChargeKwh = roundDet(state.batteryChargeKwh - neededKwh, 2);
            for (const room of state.rooms) {
              room.poweredFraction = room.equipmentOnline ? 1 : 0;
            }
            state.totalSuppliedKw = totalDemandKw;

            if (prevBattery > 15 && state.batteryChargeKwh <= 15) {
              const ev = ctx.emitEvent({
                type: 'electrical_supply_drop',
                severity: 'warning',
                title: 'Battery Reserve Critical (<15 kWh)',
                description: `Electrical deficit (${roundDet(netKw, 1)} kW) drained battery reserve to ${state.batteryChargeKwh} kWh.`,
                sourceSystem: 'stn_1_power_generation_and_bus',
                sourceEntityId: 'room-engineering',
                affectedEntityIds: ['room-engineering', 'room-lifesupport'],
                causedByEventId: state.lastReactorEventId ?? undefined,
                causalLinkType: state.lastReactorEventId ? 'dependency' : 'direct',
                causalExplanation: state.lastReactorEventId
                  ? 'Primary reactor failure forced station loads onto finite battery storage.'
                  : 'Station electrical demand exceeded combined generation capacity.',
                payload: {
                  batteryChargeKwh: state.batteryChargeKwh,
                  netKw: roundDet(netKw, 1),
                },
                deltas: [
                  {
                    metricOrField: 'batteryChargeKwh',
                    before: prevBattery,
                    after: state.batteryChargeKwh,
                    unit: 'kWh',
                  },
                ],
              });
              state.lastPowerDropEventId = ev.id;
            }
          } else {
            const availableKw = roundDet(totalGenKw + state.batteryChargeKwh * 4, 2);
            state.batteryChargeKwh = 0;

            let remainingKw = availableKw;
            const sortedByPriority = [...state.rooms].sort((a, b) =>
              a.powerPriority !== b.powerPriority
                ? a.powerPriority - b.powerPriority
                : a.id.localeCompare(b.id),
            );

            const lsRoom = state.rooms.find((r) => r.id === 'room-lifesupport')!;
            const lsWasPowered = lsRoom.poweredFraction >= 0.6;

            for (const room of sortedByPriority) {
              if (!room.equipmentOnline || room.powerLoadKw <= 0) {
                room.poweredFraction = 0;
                continue;
              }
              if (remainingKw >= room.powerLoadKw) {
                room.poweredFraction = 1;
                remainingKw = roundDet(remainingKw - room.powerLoadKw, 2);
              } else if (remainingKw > 0) {
                room.poweredFraction = roundDet(remainingKw / room.powerLoadKw, 2);
                remainingKw = 0;
              } else {
                room.poweredFraction = 0;
              }
            }

            state.totalSuppliedKw = availableKw;

            if (lsWasPowered && lsRoom.poweredFraction < 0.6) {
              const ev = ctx.emitEvent({
                type: 'scrubber_power_loss',
                severity: 'critical',
                title: 'Life Support Scrubber Lost Electrical Power',
                description: `Battery exhaustion reduced Life Support Bay power allocation to ${Math.round(lsRoom.poweredFraction * 100)}%, disabling CO2 scrubbing.`,
                sourceSystem: 'stn_1_power_generation_and_bus',
                sourceEntityId: 'room-lifesupport',
                affectedEntityIds: ['room-lifesupport', ...state.crew.map((c) => c.id)],
                causedByEventId:
                  state.lastPowerDropEventId ?? state.lastReactorEventId ?? undefined,
                causalLinkType: 'dependency',
                causalExplanation:
                  'Life Support Bay is Priority 2; when reactor failed and batteries depleted, Priority 1 loads consumed all remaining backup solar power.',
                payload: {
                  poweredFraction: lsRoom.poweredFraction,
                  availableKw,
                },
                deltas: [
                  {
                    metricOrField: 'lifeSupportPowerFraction',
                    before: 1,
                    after: lsRoom.poweredFraction,
                    unit: 'ratio',
                  },
                ],
              });
              state.lastScrubberLossEventId = ev.id;
            }
          }
        }
      },
    },
    {
      id: 'stn_2_atmosphere_breach_and_hatches',
      name: 'Atmospheric Mass Conservation Across 18 Compartments & 24 Hatches',
      order: 20,
      step(ctx) {
        const { state, config } = ctx;

        // 4 coupled sub-steps per tick so pressure waves propagate realistically across the 18-room network
        for (let sub = 0; sub < 4; sub++) {
          for (const hatch of state.hatches) {
            if (!hatch.isOpen) {
              hatch.lastFlowMoles = 0;
              continue;
            }
            const roomA = state.rooms.find((r) => r.id === hatch.roomA);
            const roomB = state.rooms.find((r) => r.id === hatch.roomB);
            if (!roomA || !roomB) continue;

            const totalVol = roomA.volumeM3 + roomB.volumeM3;
            const conductance = 0.68;

            const targetN2A =
              (roomA.n2Moles + roomB.n2Moles) * (roomA.volumeM3 / totalVol);
            const targetO2A =
              (roomA.o2Moles + roomB.o2Moles) * (roomA.volumeM3 / totalVol);
            const targetCo2A =
              (roomA.co2Moles + roomB.co2Moles) * (roomA.volumeM3 / totalVol);

            const dN2 = (targetN2A - roomA.n2Moles) * conductance;
            const dO2 = (targetO2A - roomA.o2Moles) * conductance;
            const dCo2 = (targetCo2A - roomA.co2Moles) * conductance;

            roomA.n2Moles = roundDet(roomA.n2Moles + dN2, 3);
            roomB.n2Moles = roundDet(roomB.n2Moles - dN2, 3);

            roomA.o2Moles = roundDet(roomA.o2Moles + dO2, 3);
            roomB.o2Moles = roundDet(roomB.o2Moles - dO2, 3);

            roomA.co2Moles = roundDet(roomA.co2Moles + dCo2, 3);
            roomB.co2Moles = roundDet(roomB.co2Moles - dCo2, 3);

            hatch.lastFlowMoles = roundDet(
              Math.abs(dN2) + Math.abs(dO2) + Math.abs(dCo2),
              2,
            );

            recomputeRoomThermodynamics(roomA);
            recomputeRoomThermodynamics(roomB);
          }

          for (const room of state.rooms) {
            if (room.breachSeverity > 0) {
              const totalMoles = room.n2Moles + room.o2Moles + room.co2Moles;
              if (totalMoles > 0) {
                const chokedMolesLoss = Math.min(
                  totalMoles * 0.78,
                  room.breachSeverity *
                    2200 *
                    Math.sqrt(Math.max(0.02, room.pressureKpa / 101.3)),
                );
                const lossRatio = clampDet(chokedMolesLoss / totalMoles, 0, 0.88);
                room.n2Moles = roundDet(room.n2Moles * (1 - lossRatio), 2);
                room.o2Moles = roundDet(room.o2Moles * (1 - lossRatio), 2);
                room.co2Moles = roundDet(room.co2Moles * (1 - lossRatio), 2);
              }
              if (sub === 0) {
                room.structuralIntegrity = roundDet(
                  clampDet(
                    room.structuralIntegrity - room.breachSeverity * 1.5,
                    5,
                    100,
                  ),
                  1,
                );
              }
              recomputeRoomThermodynamics(room);

              if (config.autoIsolateCriticalBreach && room.pressureKpa < 75) {
                for (const h of state.hatches) {
                  if ((h.roomA === room.id || h.roomB === room.id) && h.isOpen) {
                    h.isOpen = false;
                  }
                }
              }
            }
          }
        }

        const prevMeanCo2 = roundDet(
          state.rooms.reduce((acc, r) => acc + r.co2PartialKpa, 0) / state.rooms.length,
          3,
        );

        // Crew respiration (scaled across station manifold)
        for (const member of state.crew) {
          const room = state.rooms.find((r) => r.id === member.roomId);
          if (!room) continue;
          const respiredMoles = Math.min(room.o2Moles, 28.5);
          room.o2Moles = roundDet(room.o2Moles - respiredMoles, 2);
          room.co2Moles = roundDet(room.co2Moles + respiredMoles, 2);
          recomputeRoomThermodynamics(room);
        }

        // Life Support CO2 scrubbing & O2 replenishment
        const lsRoom = state.rooms.find((r) => r.id === 'room-lifesupport')!;

        const scrubberPower =
          lsRoom.equipmentOnline && !state.scrubberFaultActive
            ? lsRoom.poweredFraction *
              (lsRoom.equipmentHealth / 100) *
              config.scrubberEfficiency
            : 0;

        if (scrubberPower > 0.05) {
          for (const room of state.rooms) {
            const connectedFactor =
              room.id === lsRoom.id
                ? 1.0
                : state.hatches.some(
                      (h) =>
                        h.isOpen &&
                        ((h.roomA === room.id && h.roomB === lsRoom.id) ||
                          (h.roomB === room.id && h.roomA === lsRoom.id)),
                    )
                  ? 0.8
                  : 0.48;

            const scrubCapacityMoles = 28.0 * scrubberPower * connectedFactor;
            const excessCo2 = Math.max(0, room.co2Moles - room.volumeM3 * 0.08);
            const removedCo2 = Math.min(excessCo2, scrubCapacityMoles);
            room.co2Moles = roundDet(room.co2Moles - removedCo2, 2);

            if (room.breachSeverity === 0 && state.o2ReserveMoles > 0) {
              const targetO2Moles = (21.5 * room.volumeM3) / RT_KPA_M3_PER_MOL;
              const o2Deficit = Math.max(0, targetO2Moles - room.o2Moles);
              const injectMoles = Math.min(
                o2Deficit,
                34.0 * scrubberPower * connectedFactor,
                state.o2ReserveMoles,
              );
              room.o2Moles = roundDet(room.o2Moles + injectMoles, 2);
              state.o2ReserveMoles = roundDet(state.o2ReserveMoles - injectMoles, 2);
            }

            recomputeRoomThermodynamics(room);
          }
        }

        const afterMeanCo2 = roundDet(
          state.rooms.reduce((acc, r) => acc + r.co2PartialKpa, 0) / state.rooms.length,
          3,
        );

        if (prevMeanCo2 <= 1.1 && afterMeanCo2 > 1.1) {
          const upstreamId =
            state.lastScrubberLossEventId ??
            state.lastPowerDropEventId ??
            state.lastReactorEventId;
          const ev = ctx.emitEvent({
            type: 'co2_concentration_rising',
            severity: 'critical',
            title: 'Cabin CO2 Concentration Exceeded Safe Limit (>1.1 kPa)',
            description: `Mean station CO2 partial pressure climbed from ${prevMeanCo2} kPa to ${afterMeanCo2} kPa due to unpowered or faulted scrubbers.`,
            sourceSystem: 'stn_2_atmosphere_breach_and_hatches',
            sourceEntityId: 'room-lifesupport',
            affectedEntityIds: state.rooms.map((r) => r.id),
            causedByEventId: upstreamId ?? undefined,
            causalLinkType: upstreamId ? 'dependency' : 'direct',
            causalExplanation: upstreamId
              ? 'With CO2 scrubbers unpowered/faulted, crew metabolic respiration continuously converts cabin O2 into CO2.'
              : 'Crew respiration rate exceeded active scrubber removal capacity.',
            payload: {
              meanCo2PartialKpa: afterMeanCo2,
            },
            deltas: [
              {
                metricOrField: 'meanCo2PartialKpa',
                before: prevMeanCo2,
                after: afterMeanCo2,
                unit: 'kPa',
              },
            ],
          });
          state.lastCo2RiseEventId = ev.id;
        }
      },
    },
    {
      id: 'stn_3_crew_physiology_and_response',
      name: 'Crew Physiology, Evacuation & Autonomous Repair',
      order: 30,
      step(ctx) {
        const { state } = ctx;
        const prevMeanHealth = roundDet(
          state.crew.reduce((acc, c) => acc + c.health, 0) /
            Math.max(1, state.crew.length),
          1,
        );

        for (const member of state.crew) {
          let room = state.rooms.find((r) => r.id === member.roomId) ?? state.rooms[0];

          if (room.pressureKpa < 75 && member.health > 15) {
            const openConnectedRooms = state.hatches
              .filter((h) => h.isOpen && (h.roomA === room.id || h.roomB === room.id))
              .map((h) => (h.roomA === room.id ? h.roomB : h.roomA))
              .map((id) => state.rooms.find((r) => r.id === id))
              .filter((r): r is StationRoom => Boolean(r && r.pressureKpa > room.pressureKpa + 5));

            if (openConnectedRooms.length > 0) {
              openConnectedRooms.sort((a, b) => b.pressureKpa - a.pressureKpa);
              member.roomId = openConnectedRooms[0].id;
              room = openConnectedRooms[0];
              member.activity = 'evacuating';
            }
          }

          const o2Deficit = Math.max(0, 16.5 - room.o2PartialKpa);
          const pressureDeficit = Math.max(0, 72 - room.pressureKpa);
          const co2Excess = Math.max(0, room.co2PartialKpa - 1.0);

          if (o2Deficit > 0 || pressureDeficit > 0) {
            member.bloodOxygen = roundDet(
              clampDet(member.bloodOxygen - (o2Deficit * 1.4 + pressureDeficit * 0.25), 0, 100),
              1,
            );
          } else {
            member.bloodOxygen = roundDet(clampDet(member.bloodOxygen + 2.5, 0, 100), 1);
          }

          if (co2Excess > 0) {
            member.co2Toxicity = roundDet(
              clampDet(member.co2Toxicity + co2Excess * 5.2, 0, 100),
              1,
            );
          } else {
            member.co2Toxicity = roundDet(clampDet(member.co2Toxicity - 3.0, 0, 100), 1);
          }

          let healthDelta = 0;
          if (member.bloodOxygen < 75) {
            healthDelta -= (75 - member.bloodOxygen) * 0.22;
          }
          if (member.co2Toxicity > 18) {
            healthDelta -= (member.co2Toxicity - 18) * 0.18;
          }
          if (room.pressureKpa < 55) {
            healthDelta -= (55 - room.pressureKpa) * 0.15;
          }
          if (healthDelta === 0 && member.health > 0 && member.health < 100) {
            healthDelta = 0.8;
          }

          member.health = roundDet(clampDet(member.health + healthDelta, 0, 100), 1);

          if (member.health <= 15) {
            member.activity = 'incapacitated';
          } else if (room.equipmentHealth < 95 && state.sparePartsUnits > 0) {
            member.activity = 'repairing';
            room.equipmentHealth = roundDet(
              clampDet(room.equipmentHealth + 2.0, 0, 100),
              1,
            );
          } else {
            member.activity = 'monitoring';
          }
        }

        const afterMeanHealth = roundDet(
          state.crew.reduce((acc, c) => acc + c.health, 0) /
            Math.max(1, state.crew.length),
          1,
        );

        if (prevMeanHealth >= 85 && afterMeanHealth < 85) {
          const upstreamId =
            state.lastCo2RiseEventId ??
            state.lastBreachEventId ??
            state.lastScrubberLossEventId;
          ctx.emitEvent({
            type: 'crew_health_deteriorating',
            severity: 'critical',
            title: 'Crew Physiological Health Deteriorating (<85%)',
            description: `Mean crew health dropped to ${afterMeanHealth}% due to atmospheric hypercapnia (CO2) or hypoxia (low O2/pressure). Emergency intervention required.`,
            sourceSystem: 'stn_3_crew_physiology_and_response',
            affectedEntityIds: state.crew.map((c) => c.id),
            causedByEventId: upstreamId ?? undefined,
            causalLinkType: upstreamId ? 'dependency' : 'direct',
            causalExplanation: upstreamId
              ? 'Elevated cabin CO2 or compartment decompression impaired crew oxygenation and induced hypercapnic toxicity.'
              : 'Adverse compartment atmospheric conditions degraded crew physiology.',
            payload: {
              meanCrewHealth: afterMeanHealth,
            },
            deltas: [
              {
                metricOrField: 'meanCrewHealth',
                before: prevMeanHealth,
                after: afterMeanHealth,
                unit: '%',
              },
            ],
          });
        }
      },
    },
  ],

  applyCommand(state, command: SimulationCommand, ctx) {
    const payload = command.payload ?? {};

    switch (command.type) {
      case 'toggle_hatch': {
        const hatchId = String(payload.hatchId ?? 'hatch-eng-airlock');
        const hatch = state.hatches.find((h) => h.id === hatchId);
        if (hatch) {
          const before = hatch.isOpen;
          hatch.isOpen =
            payload.isOpen !== undefined
              ? Boolean(payload.isOpen)
              : !hatch.isOpen;
          ctx.emitEvent({
            type: 'hatch_state_changed',
            severity: 'info',
            title: `${hatch.label} ${hatch.isOpen ? 'Opened' : 'Sealed'}`,
            description: `Hatch ${hatch.id} between ${hatch.roomA} and ${hatch.roomB} is now ${hatch.isOpen ? 'OPEN' : 'CLOSED (Pressure Isolated)'}.`,
            sourceSystem: 'station_command',
            affectedEntityIds: [hatch.roomA, hatch.roomB],
            payload: { hatchId: hatch.id, isOpen: hatch.isOpen },
            deltas: [
              {
                metricOrField: `${hatch.id}.isOpen`,
                before: before ? 'OPEN' : 'CLOSED',
                after: hatch.isOpen ? 'OPEN' : 'CLOSED',
              },
            ],
          });
        }
        break;
      }

      case 'set_all_hatches': {
        const isOpen = Boolean(payload.isOpen ?? true);
        for (const h of state.hatches) {
          h.isOpen = isOpen;
          h.lastFlowMoles = roundDet(h.lastFlowMoles + (isOpen ? 1.25 : 0.5), 2);
        }
        state.o2ReserveMoles = roundDet(state.o2ReserveMoles + (isOpen ? 5 : 2), 1);
        ctx.emitEvent({
          type: 'hatches_bulk_updated',
          severity: 'info',
          title: isOpen ? 'Opened All Internal Hatches' : 'Sealed All Internal Hatches',
          description: `All ${state.hatches.length} inter-compartment hatches set to ${isOpen ? 'OPEN' : 'CLOSED'}.`,
          sourceSystem: 'station_command',
          affectedEntityIds: state.rooms.map((r) => r.id),
          payload: { isOpen },
        });
        break;
      }

      case 'isolate_compartment': {
        const roomId = String(payload.roomId ?? 'room-airlock');
        const breachedRoom = state.rooms.find((r) => r.breachSeverity > 0);
        const targetRoomId =
          roomId === 'auto'
            ? breachedRoom
              ? breachedRoom.id
              : 'room-airlock'
            : roomId;
        const closedHatches: string[] = [];
        for (const hatch of state.hatches) {
          if (hatch.roomA === targetRoomId || hatch.roomB === targetRoomId) {
            hatch.isOpen = false;
            closedHatches.push(hatch.id);
          }
        }
        ctx.emitEvent({
          type: 'compartment_isolated',
          severity: 'positive',
          title: `Compartment Isolated (${targetRoomId})`,
          description: `Sealed ${closedHatches.length} boundary hatch(es) (${closedHatches.join(', ')}) to contain atmospheric loss in ${targetRoomId}.`,
          sourceSystem: 'station_command',
          sourceEntityId: targetRoomId,
          affectedEntityIds: [targetRoomId],
          causedByEventId: state.lastBreachEventId ?? undefined,
          causalLinkType: 'direct',
          payload: { roomId: targetRoomId, closedHatches },
        });
        break;
      }

      case 'prioritize_life_support': {
        const lsRoom = state.rooms.find((r) => r.id === 'room-lifesupport');
        const airlockRoom = state.rooms.find((r) => r.id === 'room-airlock');
        const habRoom = state.rooms.find((r) => r.id === 'room-habitation');
        if (lsRoom) lsRoom.powerPriority = 1;
        if (airlockRoom) {
          airlockRoom.powerPriority = 3;
          airlockRoom.equipmentOnline = false;
        }
        if (habRoom) habRoom.powerPriority = 3;
        ctx.emitEvent({
          type: 'power_priorities_updated',
          severity: 'positive',
          title: 'Life Support Assigned Priority-1 Electrical Bus',
          description:
            'Elevated Life Support Bay to Priority 1 and shed non-essential Airlock auxiliary load to preserve CO2 scrubbing.',
          sourceSystem: 'station_command',
          sourceEntityId: 'room-lifesupport',
          affectedEntityIds: ['room-lifesupport', 'room-airlock'],
          payload: { lifeSupportPriority: 1 },
        });
        break;
      }

      case 'toggle_equipment': {
        const roomId = String(payload.roomId ?? 'room-airlock');
        const room = state.rooms.find((r) => r.id === roomId);
        if (room) {
          const before = room.equipmentOnline;
          room.equipmentOnline =
            payload.online !== undefined
              ? Boolean(payload.online)
              : !room.equipmentOnline;
          ctx.emitEvent({
            type: 'equipment_toggled',
            severity: 'info',
            title: `${room.name} Equipment ${room.equipmentOnline ? 'Enabled' : 'Shed'}`,
            description: `${room.name} electrical load (${room.powerLoadKw} kW) set to ${room.equipmentOnline ? 'ONLINE' : 'OFFLINE'}.`,
            sourceSystem: 'station_command',
            sourceEntityId: room.id,
            affectedEntityIds: [room.id],
            deltas: [
              {
                metricOrField: `${room.id}.equipmentOnline`,
                before: String(before),
                after: String(room.equipmentOnline),
              },
            ],
          });
        }
        break;
      }

      case 'set_power_priority': {
        const roomId = String(payload.roomId ?? 'room-lifesupport');
        const priority = clampDet(Number(payload.priority ?? 1), 1, 3) as 1 | 2 | 3;
        const room = state.rooms.find((r) => r.id === roomId);
        if (room) {
          const before = room.powerPriority;
          room.powerPriority = priority;
          ctx.emitEvent({
            type: 'power_priority_changed',
            severity: 'info',
            title: `${room.name} Priority Set to P${priority}`,
            description: `Updated electrical bus priority for ${room.name} from P${before} to P${priority}.`,
            sourceSystem: 'station_command',
            sourceEntityId: room.id,
            affectedEntityIds: [room.id],
            deltas: [
              {
                metricOrField: `${room.id}.powerPriority`,
                before,
                after: priority,
              },
            ],
          });
        }
        break;
      }

      case 'trigger_hull_breach': {
        const roomId = String(payload.roomId ?? 'room-airlock');
        const severity = clampDet(Number(payload.severity ?? 0.55), 0.1, 0.95);
        const room = state.rooms.find((r) => r.id === roomId) ?? state.rooms[5];
        const beforePressure = room.pressureKpa;
        room.breachSeverity = severity;
        room.structuralIntegrity = roundDet(
          clampDet(room.structuralIntegrity - severity * 35, 15, 100),
          1,
        );
        recomputeRoomThermodynamics(room);
        const ev = ctx.emitEvent({
          type: 'hull_breach',
          severity: 'critical',
          title: `Hull Breach in ${room.name} (Severity ${Math.round(severity * 100)}%)`,
          description: `Structural hull puncture in ${room.name} is venting cabin atmosphere to vacuum! Isolate hatches or repair immediately.`,
          sourceSystem: 'station_command',
          sourceEntityId: room.id,
          affectedEntityIds: [room.id],
          payload: {
            roomId: room.id,
            severity,
            pressureBefore: beforePressure,
          },
          deltas: [
            {
              metricOrField: `${room.id}.structuralIntegrity`,
              before: 100,
              after: room.structuralIntegrity,
              unit: '%',
            },
          ],
        });
        state.lastBreachEventId = ev.id;
        break;
      }

      case 'trigger_reactor_scram': {
        const damageAmount = clampDet(Number(payload.damageAmount ?? 55), 10, 95);
        const reactorRoom = state.rooms.find((r) => r.id === 'room-reactor')!;
        const beforeGen = state.totalGenerationKw;
        state.reactorOnline = false;
        reactorRoom.equipmentHealth = roundDet(
          clampDet(reactorRoom.equipmentHealth - damageAmount, 10, 100),
          1,
        );
        state.totalGenerationKw = ctx.config.solarBackupKw;
        const ev = ctx.emitEvent({
          type: 'reactor_failure',
          severity: 'critical',
          title: 'Primary Reactor Core Failure (SCRAM)',
          description: `Reactor core tripped offline (${beforeGen} kW -> ${ctx.config.solarBackupKw} kW solar backup). Station now drawing on battery reserves.`,
          sourceSystem: 'station_command',
          sourceEntityId: reactorRoom.id,
          affectedEntityIds: [reactorRoom.id, 'room-engineering', 'room-lifesupport'],
          payload: {
            damageAmount,
            remainingGenerationKw: ctx.config.solarBackupKw,
          },
          deltas: [
            {
              metricOrField: 'totalGenerationKw',
              before: beforeGen,
              after: ctx.config.solarBackupKw,
              unit: 'kW',
            },
          ],
        });
        state.lastReactorEventId = ev.id;
        break;
      }

      case 'trigger_scrubber_fault': {
        state.scrubberFaultActive = true;
        const lsRoom = state.rooms.find((r) => r.id === 'room-lifesupport')!;
        lsRoom.equipmentHealth = roundDet(clampDet(lsRoom.equipmentHealth - 45, 15, 100), 1);
        const ev = ctx.emitEvent({
          type: 'scrubber_fault',
          severity: 'critical',
          title: 'CO2 Scrubber Mechanical Fault',
          description: 'Life Support Bay CO2 scrubber manifold faulted offline; cabin CO2 will accumulate.',
          sourceSystem: 'station_command',
          sourceEntityId: lsRoom.id,
          affectedEntityIds: [lsRoom.id],
          payload: { equipmentHealth: lsRoom.equipmentHealth },
        });
        state.lastScrubberLossEventId = ev.id;
        break;
      }

      case 'dispatch_repair': {
        const targetRoomId = String(payload.targetRoomId ?? 'all');
        state.reactorOnline = true;
        state.scrubberFaultActive = false;

        for (const room of state.rooms) {
          if (targetRoomId === 'all' || room.id === targetRoomId) {
            room.breachSeverity = 0;
            room.structuralIntegrity = roundDet(
              clampDet(room.structuralIntegrity + 45, 75, 100),
              1,
            );
            room.equipmentHealth = roundDet(
              clampDet(room.equipmentHealth + 55, 85, 100),
              1,
            );
            room.equipmentOnline = true;

            if (room.pressureKpa < 85 && state.o2ReserveMoles > 80) {
              const addO2 = Math.min(180, state.o2ReserveMoles * 0.25);
              room.o2Moles = roundDet(room.o2Moles + addO2, 2);
              room.n2Moles = roundDet(room.n2Moles + addO2 * 3.5, 2);
              state.o2ReserveMoles = roundDet(state.o2ReserveMoles - addO2, 2);
            }
            recomputeRoomThermodynamics(room);
          }
        }
        state.sparePartsUnits = Math.max(0, state.sparePartsUnits - 15);
        ctx.emitEvent({
          type: 'compartment_repaired',
          severity: 'positive',
          title: 'Emergency Repair & Repressurization Completed',
          description:
            'Engineering crew sealed hull breaches, restarted primary reactor core, and restored CO2 scrubbers online.',
          sourceSystem: 'station_command',
          affectedEntityIds: state.rooms.map((r) => r.id),
          payload: {
            targetRoomId,
            integrityAfter: 95,
          },
        });
        break;
      }

      case 'emergency_resupply': {
        const oxygenMoles = clampDet(Number(payload.oxygenMoles ?? 400), 10, 5000);
        const batteryKwh = clampDet(Number(payload.batteryKwh ?? 40), 5, 300);
        const beforeO2 = state.o2ReserveMoles;
        const beforeBat = state.batteryChargeKwh;
        state.o2ReserveMoles = roundDet(state.o2ReserveMoles + oxygenMoles, 1);
        state.batteryChargeKwh = roundDet(
          clampDet(state.batteryChargeKwh + batteryKwh, 0, ctx.config.batteryCapacityKwh),
          2,
        );
        ctx.emitEvent({
          type: 'life_support_stabilized',
          severity: 'positive',
          title: `Emergency Resupply Docked (+${oxygenMoles} mol O2, +${batteryKwh} kWh)`,
          description: `Replenished station O2 storage to ${state.o2ReserveMoles} mol and battery array to ${state.batteryChargeKwh} kWh.`,
          sourceSystem: 'station_command',
          affectedEntityIds: ['room-lifesupport', 'room-engineering'],
          payload: {
            oxygenMoles,
            batteryKwh,
            integrityAfter: 95,
          },
          deltas: [
            {
              metricOrField: 'o2ReserveMoles',
              before: beforeO2,
              after: state.o2ReserveMoles,
              unit: 'mol',
            },
            {
              metricOrField: 'batteryChargeKwh',
              before: beforeBat,
              after: state.batteryChargeKwh,
              unit: 'kWh',
            },
          ],
        });
        break;
      }

      case 'repressurize_station_manifold': {
        const targetP = clampDet(Number(payload.targetPressureKpa ?? 101.3), 80, 105);
        for (const r of state.rooms) {
          r.breachSeverity = 0;
          const totalMoles = (targetP * r.volumeM3) / RT_KPA_M3_PER_MOL;
          r.n2Moles = roundDet(totalMoles * 0.785, 2);
          r.o2Moles = roundDet(totalMoles * 0.213, 2);
          r.co2Moles = roundDet(totalMoles * 0.002, 2);
          recomputeRoomThermodynamics(r);
        }
        ctx.emitEvent({
          type: 'manifold_repressurized',
          severity: 'positive',
          title: `18-Compartment Manifold Repressurized to ${targetP} kPa`,
          description: 'Injected N2/O2 gas mix across all compartments to restore nominal cabin atmosphere.',
          sourceSystem: 'station_command',
        });
        break;
      }

      case 'set_reactor_throttle': {
        const th = clampDet(Number(payload.throttle ?? 1.25), 0.4, 1.4);
        state.reactorThrottle = th;
        state.reactorOnline = true;
        ctx.emitEvent({
          type: 'reactor_throttle_updated',
          severity: 'info',
          title: `Reactor Core Throttle Set to ${Math.round(th * 100)}%`,
          description: 'Adjusted reactor electrical generation output.',
          sourceSystem: 'station_command',
        });
        break;
      }

      case 'deploy_solar_wings': {
        const d = Number(payload.factorDelta ?? 0.45);
        state.solarArrayDeployedFactor = roundDet(
          clampDet(state.solarArrayDeployedFactor + d, 0.5, 2.2),
          2,
        );
        state.batteryChargeKwh = roundDet(
          clampDet(state.batteryChargeKwh + 25, 0, ctx.config.batteryCapacityKwh),
          2,
        );
        ctx.emitEvent({
          type: 'solar_wings_deployed',
          severity: 'positive',
          title: `Roll-Out Solar Arrays Expanded (${Math.round(state.solarArrayDeployedFactor * 100)}%)`,
          description: 'Increased photovoltaic backup generation and recharged battery array.',
          sourceSystem: 'station_command',
        });
        break;
      }

      case 'shed_priority_loads': {
        const p = Number(payload.shedPriority ?? 3);
        for (const r of state.rooms) {
          if (r.powerPriority >= p) {
            r.equipmentOnline = false;
            r.poweredFraction = 0;
          }
        }
        ctx.emitEvent({
          type: 'priority_loads_shed',
          severity: 'info',
          title: `Shed Priority-${p} Non-Essential Module Loads`,
          description: 'Reduced total station electrical kW demand to preserve battery reserves.',
          sourceSystem: 'station_command',
        });
        break;
      }

      case 'restore_all_equipment_loads': {
        for (const r of state.rooms) {
          r.equipmentOnline = true;
          r.poweredFraction = 1;
        }
        state.sparePartsUnits += 5;
        state.o2ReserveMoles = roundDet(state.o2ReserveMoles + 15, 1);
        ctx.emitEvent({
          type: 'all_loads_restored',
          severity: 'positive',
          title: 'All 18 Compartment Electrical Feeds Restored',
          description: 'Re-enabled equipment power buses across all station compartments.',
          sourceSystem: 'station_command',
        });
        break;
      }

      case 'activate_hydroponic_bioscrubber': {
        const remRatio = clampDet(Number(payload.co2RemovalRatio ?? 0.55), 0.1, 0.9);
        const o2Bonus = Number(payload.o2BonusMoles ?? 140);
        for (const r of state.rooms) {
          r.co2Moles = roundDet(r.co2Moles * (1 - remRatio), 2);
          r.o2Moles = roundDet(r.o2Moles + o2Bonus / state.rooms.length, 2);
          recomputeRoomThermodynamics(r);
        }
        state.o2ReserveMoles = roundDet(state.o2ReserveMoles + o2Bonus, 1);
        ctx.emitEvent({
          type: 'hydroponic_bioscrubber_active',
          severity: 'positive',
          title: 'Bioregenerative Hydroponics CO2 Scrubbing Engaged',
          description: 'Algal bioreactors scrubbed cabin CO2 and synthesized breathable O2.',
          sourceSystem: 'station_command',
        });
        break;
      }

      case 'administer_crew_medical_triage': {
        const boost = Number(payload.healthBoost ?? 28);
        for (const c of state.crew) {
          c.health = roundDet(clampDet(c.health + boost, 20, 100), 1);
          c.bloodOxygen = roundDet(clampDet(c.bloodOxygen + 15, 50, 100), 1);
          c.co2Toxicity = roundDet(Math.max(0, c.co2Toxicity - 25), 1);
        }
        const medbay = state.rooms.find((r) => r.id === 'room-medbay') ?? state.rooms[0];
        medbay.o2Moles = roundDet(medbay.o2Moles + 24, 2);
        recomputeRoomThermodynamics(medbay);
        state.o2ReserveMoles = roundDet(Math.max(0, state.o2ReserveMoles - 24), 1);
        ctx.emitEvent({
          type: 'crew_medical_triage',
          severity: 'positive',
          title: 'Hyperbaric O2 Medical Triage Administered',
          description: 'Pressurized Medbay hyperbaric O2 and restored crew physiological health, blood oxygenation, and cleared CO2 toxicity.',
          sourceSystem: 'station_command',
        });
        break;
      }

      case 'flush_radiator_loops': {
        const effBoost = Number(payload.efficiencyBoost ?? 0.25);
        state.radiatorLoopEfficiency = roundDet(
          clampDet(state.radiatorLoopEfficiency + effBoost, 0.4, 1.5),
          2,
        );
        for (const r of state.rooms) {
          r.equipmentHealth = roundDet(clampDet(r.equipmentHealth + 18, 20, 100), 1);
        }
        ctx.emitEvent({
          type: 'radiator_loops_flushed',
          severity: 'positive',
          title: 'Ammonia Thermal Radiator Loops Flushed',
          description: 'Improved station heat rejection and restored subsystem equipment health.',
          sourceSystem: 'station_command',
        });
        break;
      }

      case 'fabricate_spare_parts': {
        const added = Number(payload.sparePartsAdded ?? 50);
        state.sparePartsUnits += added;
        for (const r of state.rooms) {
          r.structuralIntegrity = roundDet(clampDet(r.structuralIntegrity + 8, 20, 100), 1);
        }
        ctx.emitEvent({
          type: 'spare_parts_fabricated',
          severity: 'positive',
          title: `Fabricated +${added} Engineering Spare Parts`,
          description: '3D-printed replacement valves, hull patches, and avionics modules.',
          sourceSystem: 'station_command',
        });
        break;
      }
    }
  },

  extractMetrics(state) {
    const totalVolume = state.rooms.reduce((acc, r) => acc + r.volumeM3, 0);
    const meanPressureKpa = roundDet(
      state.rooms.reduce((acc, r) => acc + r.pressureKpa * r.volumeM3, 0) / totalVolume,
      2,
    );
    const minRoomPressureKpa = roundDet(
      Math.min(...state.rooms.map((r) => r.pressureKpa)),
      2,
    );
    const meanO2PartialKpa = roundDet(
      state.rooms.reduce((acc, r) => acc + r.o2PartialKpa * r.volumeM3, 0) / totalVolume,
      2,
    );
    const meanCo2PartialKpa = roundDet(
      state.rooms.reduce((acc, r) => acc + r.co2PartialKpa * r.volumeM3, 0) / totalVolume,
      3,
    );
    const totalGasMoles = roundDet(
      state.rooms.reduce((acc, r) => acc + r.n2Moles + r.o2Moles + r.co2Moles, 0),
      1,
    );
    const netPowerBalanceKw = roundDet(state.totalGenerationKw - state.totalDemandKw, 2);

    const openHatchCount = state.hatches.filter((h) => h.isOpen).length;
    const activeBreachCount = state.rooms.filter((r) => r.breachSeverity > 0.01).length;
    const meanStructuralIntegrity = roundDet(
      state.rooms.reduce((acc, r) => acc + r.structuralIntegrity, 0) / state.rooms.length,
      1,
    );
    const meanEquipmentHealth = roundDet(
      state.rooms.reduce((acc, r) => acc + r.equipmentHealth, 0) / state.rooms.length,
      1,
    );

    const nCrew = Math.max(1, state.crew.length);
    const meanCrewBloodOxygen = roundDet(
      state.crew.reduce((acc, c) => acc + c.bloodOxygen, 0) / nCrew,
      1,
    );
    const meanCrewCo2Toxicity = roundDet(
      state.crew.reduce((acc, c) => acc + c.co2Toxicity, 0) / nCrew,
      1,
    );
    const meanCrewHealth = roundDet(
      state.crew.reduce((acc, c) => acc + c.health, 0) / nCrew,
      1,
    );

    return {
      meanPressureKpa,
      minRoomPressureKpa,
      meanO2PartialKpa,
      meanCo2PartialKpa,
      totalGasMoles,
      o2ReserveMoles: state.o2ReserveMoles,
      totalGenerationKw: state.totalGenerationKw,
      totalDemandKw: state.totalDemandKw,
      netPowerBalanceKw,
      batteryChargeKwh: state.batteryChargeKwh,
      openHatchCount,
      activeBreachCount,
      meanStructuralIntegrity,
      meanEquipmentHealth,
      sparePartsUnits: state.sparePartsUnits,
      meanCrewBloodOxygen,
      meanCrewCo2Toxicity,
      meanCrewHealth,
    };
  },

  inspectEntities(state) {
    const list: EntityInspection[] = [];

    for (const room of state.rooms) {
      const status =
        room.breachSeverity > 0 ||
        room.pressureKpa < 70 ||
        room.co2PartialKpa > 1.5 ||
        room.poweredFraction < 0.4
          ? 'critical'
          : room.alarmActive
            ? 'warning'
            : 'nominal';

      list.push({
        entityId: room.id,
        kind: 'station_room',
        label: room.name,
        status,
        position: room.position,
        summary: `${room.pressureKpa} kPa | O2 ${room.o2PartialKpa} kPa | CO2 ${room.co2PartialKpa} kPa | Power ${Math.round(room.poweredFraction * 100)}% (P${room.powerPriority})`,
        properties: [
          { key: 'pressureKpa', label: 'Total Pressure', value: room.pressureKpa, unit: 'kPa' },
          { key: 'o2PartialKpa', label: 'O2 Partial Pressure', value: room.o2PartialKpa, unit: 'kPa' },
          { key: 'co2PartialKpa', label: 'CO2 Partial Pressure', value: room.co2PartialKpa, unit: 'kPa' },
          { key: 'volumeM3', label: 'Pressurized Volume', value: room.volumeM3, unit: 'm³' },
          { key: 'o2Moles', label: 'Oxygen Inventory', value: room.o2Moles, unit: 'mol' },
          { key: 'co2Moles', label: 'CO2 Inventory', value: room.co2Moles, unit: 'mol' },
          { key: 'powerLoadKw', label: 'Electrical Load', value: room.powerLoadKw, unit: 'kW' },
          { key: 'powerPriority', label: 'Bus Priority', value: `P${room.powerPriority}` },
          {
            key: 'poweredFraction',
            label: 'Power Supplied',
            value: Math.round(room.poweredFraction * 100),
            unit: '%',
          },
          {
            key: 'structuralIntegrity',
            label: 'Hull Integrity',
            value: room.structuralIntegrity,
            unit: '%',
          },
          {
            key: 'equipmentHealth',
            label: 'Equipment Health',
            value: room.equipmentHealth,
            unit: '%',
          },
        ],
      });
    }

    for (const hatch of state.hatches) {
      list.push({
        entityId: hatch.id,
        kind: 'station_hatch',
        label: hatch.label,
        status: hatch.isOpen ? 'nominal' : 'warning',
        summary: `${hatch.isOpen ? 'OPEN' : 'SEALED'} | Gas Transfer ${hatch.lastFlowMoles} mol/tick`,
        properties: [
          { key: 'isOpen', label: 'Hatch State', value: hatch.isOpen ? 'OPEN' : 'SEALED' },
          { key: 'roomA', label: 'Compartment A', value: hatch.roomA },
          { key: 'roomB', label: 'Compartment B', value: hatch.roomB },
          { key: 'lastFlowMoles', label: 'Gas Flow Rate', value: hatch.lastFlowMoles, unit: 'mol/t' },
        ],
      });
    }

    for (const member of state.crew) {
      const status =
        member.health < 45
          ? 'critical'
          : member.health < 80 || member.co2Toxicity > 15
            ? 'warning'
            : 'nominal';
      list.push({
        entityId: member.id,
        kind: 'crew_member',
        label: member.name,
        status,
        summary: `Health ${member.health}% | SpO2 ${member.bloodOxygen}% | Room: ${member.roomId.replace('room-', '')}`,
        properties: [
          { key: 'specialty', label: 'Specialty', value: member.specialty },
          { key: 'roomId', label: 'Current Location', value: member.roomId },
          { key: 'activity', label: 'Current Activity', value: member.activity },
          { key: 'health', label: 'Physiological Health', value: member.health, unit: '%' },
          { key: 'bloodOxygen', label: 'Blood Oxygenation', value: member.bloodOxygen, unit: '%' },
          { key: 'co2Toxicity', label: 'CO2 Toxicity Load', value: member.co2Toxicity, unit: '%' },
        ],
      });
    }

    return list;
  },

  extractRenderFrame(state, config, runId: RunId, tick: Tick): RenderFrameData {
    const metrics = this.extractMetrics(state, config);
    const anyCritical = state.rooms.some(
      (r) => r.breachSeverity > 0 || r.pressureKpa < 70 || r.co2PartialKpa > 1.5,
    );
    const anyWarning = state.rooms.some((r) => r.alarmActive);
    const ambientStatus = anyCritical ? 'critical' : anyWarning ? 'warning' : 'nominal';

    const zones: RenderZoneVisual[] = state.rooms.map((room) => {
      const status =
        room.breachSeverity > 0 ||
        room.pressureKpa < 70 ||
        room.co2PartialKpa > 1.5 ||
        room.poweredFraction < 0.4
          ? 'critical'
          : room.alarmActive
            ? 'warning'
            : 'nominal';
      return {
        id: room.id,
        label: room.name,
        position: room.position,
        size: room.size,
        value: clampDet(room.pressureKpa / 101.3, 0, 1.2),
        secondaryValue: room.poweredFraction,
        status,
        color:
          status === 'critical'
            ? '#ff3d57'
            : status === 'warning'
              ? '#ffb300'
              : '#00e5ff',
        metadata: {
          pressureKpa: room.pressureKpa,
          o2PartialKpa: room.o2PartialKpa,
          co2PartialKpa: room.co2PartialKpa,
          poweredFraction: room.poweredFraction,
          breachSeverity: room.breachSeverity,
        },
      };
    });

    const connections: RenderConnectionVisual[] = state.hatches.map((hatch) => {
      const rA = state.rooms.find((r) => r.id === hatch.roomA)!;
      const rB = state.rooms.find((r) => r.id === hatch.roomB)!;
      return {
        id: hatch.id,
        from: rA.position,
        to: rB.position,
        status: hatch.isOpen ? 'open' : 'closed',
        flowRate: hatch.lastFlowMoles,
        label: hatch.label,
      };
    });

    const entities: RenderEntityVisual[] = state.crew.map((member, idx) => {
      const room = state.rooms.find((r) => r.id === member.roomId) ?? state.rooms[0];
      const angle = (idx / Math.max(1, state.crew.length)) * Math.PI * 2;
      const offsetX = Math.cos(angle) * 2.1;
      const offsetZ = Math.sin(angle) * 1.8;
      return {
        id: member.id,
        kind: 'crew_member',
        label: member.name,
        position: [room.position[0] + offsetX, 0.9, room.position[2] + offsetZ],
        scale: [0.9, 1.5, 0.9],
        color:
          member.health < 50
            ? '#ff3d57'
            : member.health < 85
              ? '#ffb300'
              : '#00e676',
        energyOrHealth: clampDet(member.health / 100, 0.05, 1),
        status:
          member.health < 50 ? 'critical' : member.health < 85 ? 'warning' : 'nominal',
        metadata: {
          activity: member.activity,
          health: member.health,
          roomId: member.roomId,
        },
      };
    });

    return {
      worldId: 'station',
      runId,
      tick,
      ambientStatus,
      entities,
      zones,
      connections,
      hudSummary: {
        Compartments: state.rooms.length,
        'Mean Pressure': `${metrics.meanPressureKpa} kPa`,
        'O2 / CO2': `${metrics.meanO2PartialKpa} / ${metrics.meanCo2PartialKpa} kPa`,
        'Power Bus': `${state.totalGenerationKw} / ${state.totalDemandKw} kW`,
        Battery: `${state.batteryChargeKwh} kWh`,
        'Crew Health': `${metrics.meanCrewHealth}%`,
      },
    };
  },
});
