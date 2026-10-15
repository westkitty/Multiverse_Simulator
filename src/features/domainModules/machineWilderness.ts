import { FeatureCapability, HazardLink, HazardNode } from '../contracts';
import { StandardWorldFeatureModule } from './domainHelper';

export const MACHINE_WILDERNESS_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'machineWilderness.action.solar_collector_realignment',
    featureId: 'P001',
    name: 'Solar Collector Realignment',
    description: 'Clean and realign autonomous photovoltaic towers to restore substation power grids.',
    minRulesVersion: 1,
    domainUnits: ['power'],
    costResource: 'energy',
  },
  {
    id: 'machineWilderness.action.drone_motor_lubrication',
    featureId: 'P001',
    name: 'Drone Motor Lubrication',
    description: 'Refurbish mechanical gear assemblies to reduce grinding mechanical wear.',
    minRulesVersion: 1,
    domainUnits: ['wear'],
    costResource: 'recovered_parts',
  },
  {
    id: 'machineWilderness.action.fabrication_queue_clearing',
    featureId: 'P001',
    name: 'Fabrication Queue Clearing',
    description: 'Purge deadlocked task orders to clear critical assembly backlogs.',
    minRulesVersion: 1,
    domainUnits: ['backlog'],
    costResource: 'worker_capacity',
  },
  {
    id: 'machineWilderness.hazard.monitoring',
    featureId: 'P002',
    name: 'Machine Wilderness Hazard Monitoring',
    description: 'Ordered hazard dependency graph for machine-wilderness: power failures -> maintenance backlog -> automation collapse.',
    minRulesVersion: 1,
    domainUnits: ['hazard-index'],
  },
  {
    id: 'machineWilderness.conservation.ledger',
    featureId: 'P003',
    name: 'Machine Wilderness Conservation Ledger',
    description: 'Resource-accountable conservation ledger enforcing finite non-negative balances for machine-wilderness.',
    minRulesVersion: 1,
    costResource: 'recovered_parts',
  },
  {
    id: 'machineWilderness.signature.destination',
    featureId: 'P011',
    name: 'Unfinished City',
    description: 'Authored signature destination for machine-wilderness: Unfinished City.',
    minRulesVersion: 1,
  },
];

export const MACHINE_WILDERNESS_HAZARD_NODES: readonly HazardNode[] = [
  {
    id: 'grid_brownout',
    label: 'Grid Brownout',
    worldId: 'machine-wilderness',
    sourceMetric: 'power',
    targetMetric: 'power',
    threshold: 30,
    operator: '<',
    severity: 'warning',
    upstreamNodeIds: [],
    mitigationActionFamily: 'machineWilderness.action.solar_collector_realignment',
    description: 'Substation power grid output drops below autonomous recharge threshold',
    observedTriggerTemplate: 'Substation power bus ({value}) dropped below {threshold}',
    hypothesizedExplanation: 'Dust fouling solar arrays and inverter failure starving local micro-grids',
  },
  {
    id: 'servo_fatigue',
    label: 'Servo Fatigue',
    worldId: 'machine-wilderness',
    sourceMetric: 'wear',
    targetMetric: 'wear',
    threshold: 70,
    operator: '>',
    severity: 'critical',
    upstreamNodeIds: ['grid_brownout'],
    mitigationActionFamily: 'machineWilderness.action.drone_motor_lubrication',
    description: 'Mechanical friction and lack of lubricants seize autonomous drone chassis',
    observedTriggerTemplate: 'Mechanical assembly wear ({value}) exceeded {threshold}',
    hypothesizedExplanation: 'Unlubricated servomotors grinding gears and failing under unpowered load',
  },
  {
    id: 'assembly_freeze',
    label: 'Assembly Freeze',
    worldId: 'machine-wilderness',
    sourceMetric: 'backlog',
    targetMetric: 'backlog',
    threshold: 80,
    operator: '>',
    severity: 'catastrophic',
    upstreamNodeIds: ['servo_fatigue'],
    mitigationActionFamily: 'machineWilderness.action.fabrication_queue_clearing',
    description: 'Deadlocked fabrication tasks halt all infrastructure production',
    observedTriggerTemplate: 'Fabrication order backlog ({value}) exceeded {threshold}',
    hypothesizedExplanation: 'Failed maintenance drones causing infinite queue deadlock in factory nodes',
  },
];

export const MACHINE_WILDERNESS_HAZARD_LINKS: readonly HazardLink[] = [
  {
    fromNodeId: 'grid_brownout',
    toNodeId: 'servo_fatigue',
    causalLinkType: 'direct',
    description: 'Low power prevents active thermal regulation and auto-lubrication of drone servos',
  },
  {
    fromNodeId: 'servo_fatigue',
    toNodeId: 'assembly_freeze',
    causalLinkType: 'dependency',
    description: 'Immobilized maintenance drones cannot execute fabrication tasks, freezing the queue',
  },
];

export const machineWildernessFeatureModule = new StandardWorldFeatureModule({
  worldId: 'machine-wilderness',
  capabilities: MACHINE_WILDERNESS_CAPABILITIES,
  hazardNodes: MACHINE_WILDERNESS_HAZARD_NODES,
  hazardLinks: MACHINE_WILDERNESS_HAZARD_LINKS,
  initialBudget: {
    recovered_parts: { balance: 50, capacity: 100, replenishmentRate: 1.0 },
    energy: { balance: 60, capacity: 120, replenishmentRate: 1.5 },
    worker_capacity: { balance: 40, capacity: 80, replenishmentRate: 0.5 },
  },
  actionCosts: {
    'machineWilderness.action.solar_collector_realignment': [
      { resource: 'energy', amount: 8 },
      { resource: 'worker_capacity', amount: 6 },
    ],
    'machineWilderness.action.drone_motor_lubrication': [
      { resource: 'recovered_parts', amount: 10 },
      { resource: 'worker_capacity', amount: 8 },
    ],
    'machineWilderness.action.fabrication_queue_clearing': [
      { resource: 'recovered_parts', amount: 15 },
      { resource: 'energy', amount: 10 },
    ],
  },
  actionDeltas: {
    'machineWilderness.action.solar_collector_realignment': [
      { field: 'power', delta: 25, unit: 'kW' },
    ],
    'machineWilderness.action.drone_motor_lubrication': [
      { field: 'wear', delta: -30, unit: 'index' },
    ],
    'machineWilderness.action.fabrication_queue_clearing': [
      { field: 'backlog', delta: -35, unit: 'tasks' },
    ],
  },
  metricKeys: ['power', 'wear', 'backlog'],
});
