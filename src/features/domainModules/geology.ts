import { FeatureCapability, HazardLink, HazardNode } from '../contracts';
import { StandardWorldFeatureModule } from './domainHelper';

export const GEOLOGY_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'geology.action.deep_bore_pressure_relief',
    featureId: 'P001',
    name: 'Deep Bore Pressure Relief',
    description: 'Drill relief vents into subduction faults to reduce accumulated tectonic stress.',
    minRulesVersion: 1,
    domainUnits: ['meanTectonicStressMpa'],
    costResource: 'bore_capacity',
  },
  {
    id: 'geology.action.seismic_anchor_grouting',
    featureId: 'P001',
    name: 'Seismic Anchor Grouting',
    description: 'Pump high-pressure polymer grout to stabilize rising magma conduits.',
    minRulesVersion: 1,
    domainUnits: ['meanMagmaPressureMpa'],
    costResource: 'reinforcement',
  },
  {
    id: 'geology.action.geothermal_tap_diversion',
    featureId: 'P001',
    name: 'Geothermal Tap Diversion',
    description: 'Reroute subterranean heat flows to restore severed sensor array connections.',
    minRulesVersion: 1,
    domainUnits: ['monitoredCellsPct'],
    costResource: 'sensors',
  },
  {
    id: 'geology.hazard.monitoring',
    featureId: 'P002',
    name: 'Geology Hazard Monitoring',
    description: 'Ordered hazard dependency graph for geology: tectonic stress -> rupture -> inaccessible monitoring.',
    minRulesVersion: 1,
    domainUnits: ['hazard-index'],
  },
  {
    id: 'geology.conservation.ledger',
    featureId: 'P003',
    name: 'Geology Conservation Ledger',
    description: 'Resource-accountable conservation ledger enforcing finite non-negative balances for geology.',
    minRulesVersion: 1,
    costResource: 'reinforcement',
  },
  {
    id: 'geology.signature.destination',
    featureId: 'P011',
    name: 'The Buried Seismic Array',
    description: 'Authored signature destination for geology: The Buried Seismic Array.',
    minRulesVersion: 1,
  },
];

export const GEOLOGY_HAZARD_NODES: readonly HazardNode[] = [
  {
    id: 'tectonic_accumulation',
    label: 'Tectonic Stress Accumulation',
    worldId: 'geology',
    sourceMetric: 'meanTectonicStressMpa',
    targetMetric: 'meanTectonicStressMpa',
    threshold: 80,
    operator: '>',
    severity: 'warning',
    upstreamNodeIds: [],
    mitigationActionFamily: 'geology.action.deep_bore_pressure_relief',
    description: 'Fault friction locking tectonic plates and building catastrophic shear stress',
    observedTriggerTemplate: 'Tectonic stress ({value} MPa) exceeded {threshold} MPa',
    hypothesizedExplanation: 'Subduction zone plate lock preventing gradual seismic energy dissipation',
  },
  {
    id: 'magma_rupture',
    label: 'Magma Rupture',
    worldId: 'geology',
    sourceMetric: 'meanMagmaPressureMpa',
    targetMetric: 'meanMagmaPressureMpa',
    threshold: 70,
    operator: '>',
    severity: 'critical',
    upstreamNodeIds: ['tectonic_accumulation'],
    mitigationActionFamily: 'geology.action.seismic_anchor_grouting',
    description: 'Fractured bedrock opens dikes allowing magma surge toward monitoring stations',
    observedTriggerTemplate: 'Magma pressure ({value} MPa) exceeded {threshold} MPa',
    hypothesizedExplanation: 'Shear fracturing puncturing pressurized sub-crustal magma pockets',
  },
  {
    id: 'sensor_severance',
    label: 'Sensor Severance',
    worldId: 'geology',
    sourceMetric: 'monitoredCellsPct',
    targetMetric: 'monitoredCellsPct',
    threshold: 30,
    operator: '<',
    severity: 'catastrophic',
    upstreamNodeIds: ['magma_rupture'],
    mitigationActionFamily: 'geology.action.geothermal_tap_diversion',
    description: 'Thermal inundation and fault slippage destroys seismic array telemetry',
    observedTriggerTemplate: 'Seismic sensor coverage ({value}%) fell below {threshold}%',
    hypothesizedExplanation: 'Molten rock intrusion severing subterranean telemetry lines and melting array nodes',
  },
];

export const GEOLOGY_HAZARD_LINKS: readonly HazardLink[] = [
  {
    fromNodeId: 'tectonic_accumulation',
    toNodeId: 'magma_rupture',
    causalLinkType: 'direct',
    description: 'Tectonic stress fractures bedrock, releasing pressurized magma dikes',
  },
  {
    fromNodeId: 'magma_rupture',
    toNodeId: 'sensor_severance',
    causalLinkType: 'dependency',
    description: 'Magma intrusion shears cables and melts buried seismic monitoring sensors',
  },
];

export const geologyFeatureModule = new StandardWorldFeatureModule({
  worldId: 'geology',
  capabilities: GEOLOGY_CAPABILITIES,
  hazardNodes: GEOLOGY_HAZARD_NODES,
  hazardLinks: GEOLOGY_HAZARD_LINKS,
  initialBudget: {
    reinforcement: { balance: 40, capacity: 80, replenishmentRate: 0.5 },
    bore_capacity: { balance: 30, capacity: 60, replenishmentRate: 0.4 },
    sensors: { balance: 25, capacity: 50, replenishmentRate: 0.3 },
  },
  actionCosts: {
    'geology.action.deep_bore_pressure_relief': [
      { resource: 'bore_capacity', amount: 8 },
      { resource: 'reinforcement', amount: 5 },
    ],
    'geology.action.seismic_anchor_grouting': [
      { resource: 'reinforcement', amount: 12 },
      { resource: 'bore_capacity', amount: 6 },
    ],
    'geology.action.geothermal_tap_diversion': [
      { resource: 'sensors', amount: 6 },
      { resource: 'bore_capacity', amount: 8 },
    ],
  },
  actionDeltas: {
    'geology.action.deep_bore_pressure_relief': [
      { field: 'meanTectonicStressMpa', delta: -25, unit: 'MPa' },
    ],
    'geology.action.seismic_anchor_grouting': [
      { field: 'meanMagmaPressureMpa', delta: -20, unit: 'MPa' },
    ],
    'geology.action.geothermal_tap_diversion': [
      { field: 'monitoredCellsPct', delta: 35, unit: '%' },
    ],
  },
  metricKeys: ['meanTectonicStressMpa', 'meanMagmaPressureMpa', 'monitoredCellsPct'],
});
