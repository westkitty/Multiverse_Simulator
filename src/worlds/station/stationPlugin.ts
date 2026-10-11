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

// Ideal gas constant factor at T = 293.15 K: R * T / 1000 = 8.31446 * 293.15 / 1000 ≈ 2.4374 kPa·m³/mol
// At 101.3 kPa, molar density is ~41.56 mol/m³ (78% N2, 21% O2, 0.04% CO2)
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
  sparePartsUnits: number;
  reactorOnline: boolean;
  reactorThrottle: number; // 0..1.2
  scrubberFaultActive: boolean;
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
  crewCount: z.number().int().min(1).max(16),
  reactorNominalKw: z.number().min(20).max(300),
  solarBackupKw: z.number().min(5).max(100),
  batteryCapacityKwh: z.number().min(20).max(500),
  initialO2ReserveMoles: z.number().min(200).max(10000),
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
];

export const stationPlugin = defineWorldPlugin<StationConfig, StationState>({
  id: 'station',
  name: 'World B — Modular Space Station',
  subtitle: 'Atmospheric Mass Conservation, Electrical Bus & Failure Propagation',
  version: '1.0.0',
  schemaVersion: 1,
  accentColor: '#00e5ff',
  description:
    'Modular orbital habitat laboratory modeling ideal-gas compartment pressure (N2, O2, CO2), hatch flow conservation, electrical load shedding, life-support dependencies, and crew survival.',
  physicalModelDocumentation: [
    'Ideal-gas compartment state: Each room has fixed volume V (m³) and explicit molar gas inventory (n_N2, n_O2, n_CO2). Total pressure P = (n_total * R * T) / V.',
    'Mass-conservative hatch equalization: Open hatches transfer gas moles between connected rooms proportional to pressure differential ΔP without creating or destroying gas.',
    'Dependency-coupled electrical bus: Primary reactor + solar backup + battery bank supply prioritized room loads. Power deficit sheds lower-priority loads first, disabling scrubbers and O2 electrolyzers.',
  ],
  simplifiedMechanicsNote:
    'Isothermal compartment assumption (T = 293 K) is used so pressure changes reflect exact molar gas transfers and hull breaches without CFD turbulence overhead.',
  configSchema: stationConfigSchema,
  defaultConfig: {
    crewCount: 6,
    reactorNominalKw: 110,
    solarBackupKw: 22,
    batteryCapacityKwh: 120,
    initialO2ReserveMoles: 2400,
    scrubberEfficiency: 1.0,
    autoIsolateCriticalBreach: false,
  },
  scenarios: [
    {
      id: 'station-cascading-failure',
      name: 'Cascading Reactor & Life Support Crisis',
      subtitle: 'Reactor Trip -> Battery Drain -> Scrubber Offline -> CO2 Toxicity',
      description:
        'At Tick 4, a primary reactor scram trips main generation, forcing the station onto finite batteries. Unless non-essential loads are shed or the reactor is repaired, the Life Support scrubber loses power, CO2 rises, and crew health degrades.',
      hypothesis:
        'Prioritizing Life Support power (Priority 1) and dispatching an engineering repair team before battery depletion prevents CO2 asphyxiation.',
      seed: 55104,
      config: {
        crewCount: 6,
        reactorNominalKw: 110,
        solarBackupKw: 18,
        batteryCapacityKwh: 55,
        initialO2ReserveMoles: 2200,
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
      subtitle: 'Airlock Decompression Propagation Test',
      description:
        'A micrometeoroid punctures the Docking Airlock at Tick 5. With hatches open, atmospheric pressure vents across the entire station unless the compartment is isolated by closing hatches.',
      hypothesis:
        'Isolating the breached compartment immediately preserves >92% of total station atmosphere and prevents crew hypoxia.',
      seed: 88210,
      config: {
        crewCount: 6,
        reactorNominalKw: 115,
        solarBackupKw: 24,
        batteryCapacityKwh: 120,
        initialO2ReserveMoles: 2400,
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
      name: 'Nominal Orbital Operations',
      subtitle: 'Closed-Loop Life Support Baseline',
      description:
        'All 6 station compartments operating at 101.3 kPa nominal atmosphere and balanced electrical load for baseline benchmarking and custom fault injection.',
      hypothesis:
        'Closed-loop O2 generation and CO2 scrubbing maintain atmospheric equilibrium indefinitely while reactor power exceeds 86 kW station load.',
      seed: 31415,
      config: {
        crewCount: 6,
        reactorNominalKw: 115,
        solarBackupKw: 25,
        batteryCapacityKwh: 140,
        initialO2ReserveMoles: 2600,
        scrubberEfficiency: 1.05,
        autoIsolateCriticalBreach: false,
      },
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
      id: 'stn-repair-all',
      label: 'Dispatch Emergency Repair Crew',
      description: 'Seals active hull breaches, restores reactor core online, and repairs CO2 scrubbers.',
      category: 'restoration',
      commandType: 'dispatch_repair',
      defaultPayload: { targetRoomId: 'all' },
    },
    {
      id: 'stn-prioritize-lifesupport',
      label: 'Prioritize Life Support Power',
      description: 'Sets Life Support to Priority 1 and sheds non-essential Airlock & Habitation auxiliary loads.',
      category: 'policy',
      commandType: 'prioritize_life_support',
      defaultPayload: {},
    },
    {
      id: 'stn-trigger-breach',
      label: 'Trigger Airlock Hull Breach',
      description: 'Punctures the Docking Airlock hull, venting gas to vacuum.',
      category: 'crisis',
      commandType: 'trigger_hull_breach',
      defaultPayload: { roomId: 'room-airlock', severity: 0.55 },
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
      label: 'Open All Internal Hatches',
      description: 'Opens all 6 inter-compartment hatches to equalize station pressure.',
      category: 'structure',
      commandType: 'set_all_hatches',
      defaultPayload: { isOpen: true },
    },
  ],
  metricDefinitions: [
    {
      id: 'meanPressureKpa',
      label: 'Mean Cabin Pressure',
      unit: 'kPa',
      category: 'Atmosphere',
      description: 'Volume-weighted mean atmospheric pressure across all station compartments (nominal 101.3 kPa).',
      warningThreshold: 86,
      criticalThreshold: 68,
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
    const rooms: StationRoom[] = [
      createInitialRoom(
        'room-bridge',
        'Command Bridge',
        'bridge',
        [0, 0, -16],
        [10, 3.6, 8],
        180,
        14,
        1,
      ),
      createInitialRoom(
        'room-lifesupport',
        'Life Support Bay',
        'lifesupport',
        [0, 0, -5],
        [11, 3.6, 9],
        210,
        24,
        2,
      ),
      createInitialRoom(
        'room-habitation',
        'Habitation & Hydroponics',
        'habitation',
        [-13, 0, -5],
        [11, 3.6, 10],
        260,
        18,
        2,
      ),
      createInitialRoom(
        'room-engineering',
        'Engineering & Battery Hub',
        'engineering',
        [0, 0, 7],
        [11, 3.6, 9],
        220,
        16,
        1,
      ),
      createInitialRoom(
        'room-reactor',
        'Reactor Core Chamber',
        'reactor',
        [13, 0, 7],
        [10, 4.2, 9],
        240,
        8,
        1,
      ),
      createInitialRoom(
        'room-airlock',
        'Docking Airlock & Cargo',
        'airlock',
        [0, 0, 18],
        [9, 3.4, 8],
        160,
        10,
        3,
      ),
    ];

    const hatches: StationHatch[] = [
      {
        id: 'hatch-bridge-ls',
        label: 'Hatch H1 (Bridge <-> Life Support)',
        roomA: 'room-bridge',
        roomB: 'room-lifesupport',
        isOpen: true,
        lastFlowMoles: 0,
      },
      {
        id: 'hatch-ls-hab',
        label: 'Hatch H2 (Life Support <-> Habitation)',
        roomA: 'room-lifesupport',
        roomB: 'room-habitation',
        isOpen: true,
        lastFlowMoles: 0,
      },
      {
        id: 'hatch-ls-eng',
        label: 'Hatch H3 (Life Support <-> Engineering)',
        roomA: 'room-lifesupport',
        roomB: 'room-engineering',
        isOpen: true,
        lastFlowMoles: 0,
      },
      {
        id: 'hatch-eng-reactor',
        label: 'Hatch H4 (Engineering <-> Reactor)',
        roomA: 'room-engineering',
        roomB: 'room-reactor',
        isOpen: true,
        lastFlowMoles: 0,
      },
      {
        id: 'hatch-eng-airlock',
        label: 'Hatch H5 (Engineering <-> Airlock)',
        roomA: 'room-engineering',
        roomB: 'room-airlock',
        isOpen: true,
        lastFlowMoles: 0,
      },
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

    return {
      rooms,
      hatches,
      crew,
      batteryChargeKwh: config.batteryCapacityKwh,
      o2ReserveMoles: config.initialO2ReserveMoles,
      sparePartsUnits: 100,
      reactorOnline: true,
      reactorThrottle: 1.0,
      scrubberFaultActive: false,
      totalGenerationKw: config.reactorNominalKw + config.solarBackupKw,
      totalDemandKw: 90,
      totalSuppliedKw: 90,
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
      name: 'Electrical Power Generation, Battery Storage & Priority Load Allocation',
      order: 10,
      step(ctx) {
        const { state, config } = ctx;
        const reactorRoom = state.rooms.find((r) => r.role === 'reactor')!;
        const reactorHealthFactor = clampDet(reactorRoom.equipmentHealth / 100, 0, 1);

        const reactorKw =
          state.reactorOnline && reactorRoom.equipmentOnline
            ? roundDet(
                config.reactorNominalKw * reactorHealthFactor * state.reactorThrottle,
                2,
              )
            : 0;
        const totalGenKw = roundDet(reactorKw + config.solarBackupKw, 2);
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
          // Surplus recharges battery (1 tick = 0.25 hr equivalent electrical step)
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
          // Deficit draws from battery
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
            // Battery exhausted: shed loads in reverse priority order (Priority 3 shed first, then 2, then 1)
            const availableKw = roundDet(
              totalGenKw + state.batteryChargeKwh * 4,
              2,
            );
            state.batteryChargeKwh = 0;

            let remainingKw = availableKw;
            const sortedByPriority = [...state.rooms].sort((a, b) =>
              a.powerPriority !== b.powerPriority
                ? a.powerPriority - b.powerPriority
                : a.id.localeCompare(b.id),
            );

            const lsRoom = state.rooms.find((r) => r.role === 'lifesupport')!;
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
      name: 'Atmospheric Mass Conservation, Breaches, Hatches & Scrubbers',
      order: 20,
      step(ctx) {
        const { state, config } = ctx;

        // 1 & 2. Coupled orifice hull-breach blowdown and mass-conserving hatch equalization (2 sub-steps per tick)
        for (let sub = 0; sub < 2; sub++) {
          for (const hatch of state.hatches) {
            if (!hatch.isOpen) {
              hatch.lastFlowMoles = 0;
              continue;
            }
            const roomA = state.rooms.find((r) => r.id === hatch.roomA);
            const roomB = state.rooms.find((r) => r.id === hatch.roomB);
            if (!roomA || !roomB) continue;

            const totalVol = roomA.volumeM3 + roomB.volumeM3;
            const conductance = 0.58;

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
                  totalMoles * 0.72,
                  room.breachSeverity *
                    1650 *
                    Math.sqrt(Math.max(0.02, room.pressureKpa / 101.3)),
                );
                const lossRatio = clampDet(chokedMolesLoss / totalMoles, 0, 0.85);
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

        // 3. Crew respiration (O2 -> CO2 molar conversion in occupied rooms)
        for (const member of state.crew) {
          const room = state.rooms.find((r) => r.id === member.roomId);
          if (!room) continue;
          const respiredMoles = Math.min(room.o2Moles, 11.5);
          room.o2Moles = roundDet(room.o2Moles - respiredMoles, 2);
          room.co2Moles = roundDet(room.co2Moles + respiredMoles, 2);
          recomputeRoomThermodynamics(room);
        }

        // 4. Life Support CO2 scrubbing & O2 replenishment (requires Life Support power & healthy scrubber)
        const lsRoom = state.rooms.find((r) => r.role === 'lifesupport')!;

        const scrubberPower =
          lsRoom.equipmentOnline && !state.scrubberFaultActive
            ? lsRoom.poweredFraction *
              (lsRoom.equipmentHealth / 100) *
              config.scrubberEfficiency
            : 0;

        if (scrubberPower > 0.05) {
          // Scrub CO2 from Life Support room and connected open network
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
                  ? 0.75
                  : 0.35;

            const scrubCapacityMoles = 22.0 * scrubberPower * connectedFactor;
            const excessCo2 = Math.max(0, room.co2Moles - room.volumeM3 * 0.08);
            const removedCo2 = Math.min(excessCo2, scrubCapacityMoles);
            room.co2Moles = roundDet(room.co2Moles - removedCo2, 2);

            // Replenish O2 toward 21.3 kPa target if room is not breached
            if (room.breachSeverity === 0 && state.o2ReserveMoles > 0) {
              const targetO2Moles = (21.5 * room.volumeM3) / RT_KPA_M3_PER_MOL;
              const o2Deficit = Math.max(0, targetO2Moles - room.o2Moles);
              const injectMoles = Math.min(
                o2Deficit,
                32.0 * scrubberPower * connectedFactor,
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

          // If current room is depressurizing (<75 kPa), attempt evacuation through an open hatch to a higher-pressure room
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

          // Physiological update based on room O2, CO2, and total pressure
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
    switch (command.type) {
      case 'toggle_hatch': {
        const hatchId = String(command.payload.hatchId ?? 'hatch-eng-airlock');
        const hatch = state.hatches.find((h) => h.id === hatchId);
        if (hatch) {
          const before = hatch.isOpen;
          hatch.isOpen =
            command.payload.isOpen !== undefined
              ? Boolean(command.payload.isOpen)
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
        const isOpen = Boolean(command.payload.isOpen ?? true);
        for (const h of state.hatches) {
          h.isOpen = isOpen;
        }
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
        const roomId = String(command.payload.roomId ?? 'room-airlock');
        const breachedRoom = state.rooms.find((r) => r.breachSeverity > 0);
        const targetRoomId =
          roomId === 'auto' && breachedRoom ? breachedRoom.id : roomId;
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
        const lsRoom = state.rooms.find((r) => r.role === 'lifesupport');
        const airlockRoom = state.rooms.find((r) => r.role === 'airlock');
        const habRoom = state.rooms.find((r) => r.role === 'habitation');
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
        const roomId = String(command.payload.roomId ?? 'room-airlock');
        const room = state.rooms.find((r) => r.id === roomId);
        if (room) {
          const before = room.equipmentOnline;
          room.equipmentOnline =
            command.payload.online !== undefined
              ? Boolean(command.payload.online)
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
        const roomId = String(command.payload.roomId ?? 'room-lifesupport');
        const priority = clampDet(Number(command.payload.priority ?? 1), 1, 3) as 1 | 2 | 3;
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
        const roomId = String(command.payload.roomId ?? 'room-airlock');
        const severity = clampDet(Number(command.payload.severity ?? 0.55), 0.1, 0.95);
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
        const damageAmount = clampDet(Number(command.payload.damageAmount ?? 55), 10, 95);
        const reactorRoom = state.rooms.find((r) => r.role === 'reactor')!;
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
        const lsRoom = state.rooms.find((r) => r.role === 'lifesupport')!;
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
        const targetRoomId = String(command.payload.targetRoomId ?? 'all');
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

            // Repressurize severely depressurized compartments from reserve if sealed
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
        const oxygenMoles = clampDet(Number(command.payload.oxygenMoles ?? 400), 10, 5000);
        const batteryKwh = clampDet(Number(command.payload.batteryKwh ?? 40), 5, 300);
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
    }
  },

  extractMetrics(state) {
    const totalVolume = state.rooms.reduce((acc, r) => acc + r.volumeM3, 0);
    const meanPressureKpa = roundDet(
      state.rooms.reduce((acc, r) => acc + r.pressureKpa * r.volumeM3, 0) / totalVolume,
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
    const netPowerBalanceKw = roundDet(state.totalGenerationKw - state.totalDemandKw, 2);
    const meanCrewHealth = roundDet(
      state.crew.reduce((acc, c) => acc + c.health, 0) / Math.max(1, state.crew.length),
      1,
    );

    return {
      meanPressureKpa,
      meanO2PartialKpa,
      meanCo2PartialKpa,
      netPowerBalanceKw,
      batteryChargeKwh: state.batteryChargeKwh,
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
        'Mean Pressure': `${metrics.meanPressureKpa} kPa`,
        'O2 / CO2': `${metrics.meanO2PartialKpa} / ${metrics.meanCo2PartialKpa} kPa`,
        'Power Bus': `${state.totalGenerationKw} / ${state.totalDemandKw} kW`,
        Battery: `${state.batteryChargeKwh} kWh`,
        'Crew Health': `${metrics.meanCrewHealth}%`,
        Reactor: state.reactorOnline ? 'ONLINE' : 'SCRAMMED',
      },
    };
  },
});
