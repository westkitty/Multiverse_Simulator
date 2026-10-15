import { FeatureCapability, HazardLink, HazardNode } from '../contracts';
import { StandardWorldFeatureModule } from './domainHelper';

export const STATION_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'station.action.compartment_sealing',
    featureId: 'P001',
    name: 'Compartment Sealing',
    description: 'Seal leaking ring bulkhead to arrest atmospheric pressure drop.',
    minRulesVersion: 1,
    domainUnits: ['meanPressureKpa'],
    costResource: 'power',
  },
  {
    id: 'station.action.scrubber_overhaul',
    featureId: 'P001',
    name: 'Scrubber Overhaul',
    description: 'Replace depleted scrubber chemical cartridges to restore O2 reserves.',
    minRulesVersion: 1,
    domainUnits: ['o2ReserveMoles'],
    costResource: 'scrubbers',
  },
  {
    id: 'station.action.life_support_priority',
    featureId: 'P001',
    name: 'Life Support Priority',
    description: 'Route emergency oxygen and battery banks to medical bays.',
    minRulesVersion: 1,
    domainUnits: ['meanCrewHealth'],
    costResource: 'emergency_o2',
  },
  {
    id: 'station.hazard.monitoring',
    featureId: 'P002',
    name: 'Station Hazard Monitoring',
    description: 'Ordered hazard dependency graph for station: pressure leakage -> oxygen depletion -> compartment shutdown.',
    minRulesVersion: 1,
    domainUnits: ['hazard-index'],
  },
  {
    id: 'station.conservation.ledger',
    featureId: 'P003',
    name: 'Station Conservation Ledger',
    description: 'Resource-accountable conservation ledger enforcing finite non-negative balances for station.',
    minRulesVersion: 1,
    costResource: 'power',
  },
  {
    id: 'station.signature.destination',
    featureId: 'P011',
    name: 'The Dark Habitation Ring',
    description: 'Authored signature destination for station: The Dark Habitation Ring.',
    minRulesVersion: 1,
  },
];

export const STATION_HAZARD_NODES: readonly HazardNode[] = [
  {
    id: 'pressure_leak',
    label: 'Pressure Leakage',
    worldId: 'station',
    sourceMetric: 'meanPressureKpa',
    targetMetric: 'meanPressureKpa',
    threshold: 80,
    operator: '<',
    severity: 'warning',
    upstreamNodeIds: [],
    mitigationActionFamily: 'station.action.compartment_sealing',
    description: 'Ring air pressure dropped below habitable standard',
    observedTriggerTemplate: 'Ring pressure ({value} kPa) fell below {threshold} kPa',
    hypothesizedExplanation: 'Micrometeoroid breach or seal fatigue venting atmosphere to space',
  },
  {
    id: 'oxygen_depletion',
    label: 'Oxygen Depletion',
    worldId: 'station',
    sourceMetric: 'o2ReserveMoles',
    targetMetric: 'o2ReserveMoles',
    threshold: 500,
    operator: '<',
    severity: 'critical',
    upstreamNodeIds: ['pressure_leak'],
    mitigationActionFamily: 'station.action.scrubber_overhaul',
    description: 'Available breathable oxygen falling to dangerous thresholds',
    observedTriggerTemplate: 'O2 reserve ({value} mol) dropped below {threshold} mol',
    hypothesizedExplanation: 'Vent loss combined with saturated CO2 scrubbers starving oxygen recycling',
  },
  {
    id: 'compartment_shutdown',
    label: 'Compartment Shutdown',
    worldId: 'station',
    sourceMetric: 'meanCrewHealth',
    targetMetric: 'meanCrewHealth',
    threshold: 40,
    operator: '<',
    severity: 'catastrophic',
    upstreamNodeIds: ['oxygen_depletion'],
    mitigationActionFamily: 'station.action.life_support_priority',
    description: 'Crew hypoxia forces evacuation and compartment lockdown',
    observedTriggerTemplate: 'Crew health ({value}) dropped below {threshold}',
    hypothesizedExplanation: 'Unmitigated hypoxia causing widespread neurological distress and evacuation',
  },
];

export const STATION_HAZARD_LINKS: readonly HazardLink[] = [
  {
    fromNodeId: 'pressure_leak',
    toNodeId: 'oxygen_depletion',
    causalLinkType: 'direct',
    description: 'Pressure loss vents oxygen into space faster than scrubber replenishment',
  },
  {
    fromNodeId: 'oxygen_depletion',
    toNodeId: 'compartment_shutdown',
    causalLinkType: 'dependency',
    description: 'Severe hypoxia induces crew incapacitation and module abandonment',
  },
];

export const stationFeatureModule = new StandardWorldFeatureModule({
  worldId: 'station',
  capabilities: STATION_CAPABILITIES,
  hazardNodes: STATION_HAZARD_NODES,
  hazardLinks: STATION_HAZARD_LINKS,
  initialBudget: {
    power: { balance: 100, capacity: 200, replenishmentRate: 2.0 },
    scrubbers: { balance: 20, capacity: 50, replenishmentRate: 0.2 },
    emergency_o2: { balance: 50, capacity: 100, replenishmentRate: 0.5 },
  },
  actionCosts: {
    'station.action.compartment_sealing': [
      { resource: 'power', amount: 10 },
      { resource: 'scrubbers', amount: 2 },
    ],
    'station.action.scrubber_overhaul': [
      { resource: 'scrubbers', amount: 4 },
      { resource: 'power', amount: 15 },
    ],
    'station.action.life_support_priority': [
      { resource: 'emergency_o2', amount: 10 },
      { resource: 'power', amount: 20 },
    ],
  },
  actionDeltas: {
    'station.action.compartment_sealing': [
      { field: 'meanPressureKpa', delta: 15, unit: 'kPa' },
    ],
    'station.action.scrubber_overhaul': [
      { field: 'o2ReserveMoles', delta: 250, unit: 'mol' },
    ],
    'station.action.life_support_priority': [
      { field: 'meanCrewHealth', delta: 25, unit: '%' },
    ],
  },
  metricKeys: ['meanPressureKpa', 'o2ReserveMoles', 'meanCrewHealth'],
});
