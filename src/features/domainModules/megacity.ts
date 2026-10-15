import { FeatureCapability, HazardLink, HazardNode } from '../contracts';
import { StandardWorldFeatureModule } from './domainHelper';

export const MEGACITY_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'megacity.action.grid_substation_bypass',
    featureId: 'P001',
    name: 'Grid Substation Bypass',
    description: 'Route emergency diesel power to restore blackout sector capacity.',
    minRulesVersion: 1,
    domainUnits: ['totalHousingCapacityK'],
    costResource: 'district_fuel',
  },
  {
    id: 'megacity.action.stormwater_drain_clearance',
    featureId: 'P001',
    name: 'Stormwater Drain Clearance',
    description: 'Activate auxiliary pumps and clear storm conduits to reduce toxic flood AQI.',
    minRulesVersion: 1,
    domainUnits: ['meanPollutionAqi'],
    costResource: 'spare_parts',
  },
  {
    id: 'megacity.action.emergency_caucus_dispatch',
    featureId: 'P001',
    name: 'Emergency Caucus Dispatch',
    description: 'Deploy municipal corps to reconnect isolated flooded tenement wards.',
    minRulesVersion: 1,
    domainUnits: ['cityLivabilityIndex'],
    costResource: 'municipal_stock',
  },
  {
    id: 'megacity.hazard.monitoring',
    featureId: 'P002',
    name: 'Megacity Hazard Monitoring',
    description: 'Ordered hazard dependency graph for megacity: power failure -> pumping loss -> flood and isolation.',
    minRulesVersion: 1,
    domainUnits: ['hazard-index'],
  },
  {
    id: 'megacity.conservation.ledger',
    featureId: 'P003',
    name: 'Megacity Conservation Ledger',
    description: 'Resource-accountable conservation ledger enforcing finite non-negative balances for megacity.',
    minRulesVersion: 1,
    costResource: 'district_fuel',
  },
  {
    id: 'megacity.signature.destination',
    featureId: 'P011',
    name: 'The Blackout Quarter',
    description: 'Authored signature destination for megacity: The Blackout Quarter.',
    minRulesVersion: 1,
  },
];

export const MEGACITY_HAZARD_NODES: readonly HazardNode[] = [
  {
    id: 'substation_blackout',
    label: 'Substation Blackout',
    worldId: 'megacity',
    sourceMetric: 'totalHousingCapacityK',
    targetMetric: 'totalHousingCapacityK',
    threshold: 20,
    operator: '<',
    severity: 'warning',
    upstreamNodeIds: [],
    mitigationActionFamily: 'megacity.action.grid_substation_bypass',
    description: 'Urban power grid failure deprives residential wards of electricity',
    observedTriggerTemplate: 'Housing capacity ({value}k) dropped below {threshold}k',
    hypothesizedExplanation: 'Substation transformer overload cascading into district-wide power blackout',
  },
  {
    id: 'drainage_pump_failure',
    label: 'Drainage Pump Failure',
    worldId: 'megacity',
    sourceMetric: 'meanPollutionAqi',
    targetMetric: 'meanPollutionAqi',
    threshold: 250,
    operator: '>',
    severity: 'critical',
    upstreamNodeIds: ['substation_blackout'],
    mitigationActionFamily: 'megacity.action.stormwater_drain_clearance',
    description: 'Loss of electric pumping causes toxic stormwater to back up into city streets',
    observedTriggerTemplate: 'Air pollution index ({value} AQI) exceeded {threshold} AQI',
    hypothesizedExplanation: 'Unpowered drainage lift stations allowing contaminated sewer overflow',
  },
  {
    id: 'district_isolation',
    label: 'District Isolation',
    worldId: 'megacity',
    sourceMetric: 'cityLivabilityIndex',
    targetMetric: 'cityLivabilityIndex',
    threshold: 30,
    operator: '<',
    severity: 'catastrophic',
    upstreamNodeIds: ['drainage_pump_failure'],
    mitigationActionFamily: 'megacity.action.emergency_caucus_dispatch',
    description: 'Flooding and darkness sever transport access, isolating thousands of inhabitants',
    observedTriggerTemplate: 'City livability index ({value}) fell below {threshold}',
    hypothesizedExplanation: 'Submerged transit corridors and structural collapse severing district logistics',
  },
];

export const MEGACITY_HAZARD_LINKS: readonly HazardLink[] = [
  {
    fromNodeId: 'substation_blackout',
    toNodeId: 'drainage_pump_failure',
    causalLinkType: 'direct',
    description: 'Grid blackout halts electrically powered drainage pumps, causing toxic flood surge',
  },
  {
    fromNodeId: 'drainage_pump_failure',
    toNodeId: 'district_isolation',
    causalLinkType: 'dependency',
    description: 'Toxic urban flooding submerges thoroughfares and severs neighborhood transit',
  },
];

export const megacityFeatureModule = new StandardWorldFeatureModule({
  worldId: 'megacity',
  capabilities: MEGACITY_CAPABILITIES,
  hazardNodes: MEGACITY_HAZARD_NODES,
  hazardLinks: MEGACITY_HAZARD_LINKS,
  initialBudget: {
    district_fuel: { balance: 50, capacity: 100, replenishmentRate: 1.0 },
    spare_parts: { balance: 40, capacity: 80, replenishmentRate: 0.5 },
    municipal_stock: { balance: 60, capacity: 120, replenishmentRate: 1.5 },
  },
  actionCosts: {
    'megacity.action.grid_substation_bypass': [
      { resource: 'spare_parts', amount: 8 },
      { resource: 'district_fuel', amount: 10 },
    ],
    'megacity.action.stormwater_drain_clearance': [
      { resource: 'district_fuel', amount: 12 },
      { resource: 'municipal_stock', amount: 10 },
    ],
    'megacity.action.emergency_caucus_dispatch': [
      { resource: 'municipal_stock', amount: 15 },
      { resource: 'district_fuel', amount: 8 },
    ],
  },
  actionDeltas: {
    'megacity.action.grid_substation_bypass': [
      { field: 'totalHousingCapacityK', delta: 20, unit: 'k' },
    ],
    'megacity.action.stormwater_drain_clearance': [
      { field: 'meanPollutionAqi', delta: -60, unit: 'AQI' },
    ],
    'megacity.action.emergency_caucus_dispatch': [
      { field: 'cityLivabilityIndex', delta: 25, unit: 'index' },
    ],
  },
  metricKeys: ['totalHousingCapacityK', 'meanPollutionAqi', 'cityLivabilityIndex'],
});
