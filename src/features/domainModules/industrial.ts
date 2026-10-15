import { FeatureCapability, HazardLink, HazardNode } from '../contracts';
import { StandardWorldFeatureModule } from './domainHelper';

export const INDUSTRIAL_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'industrial.action.conveyor_spur_activation',
    featureId: 'P001',
    name: 'Conveyor Spur Activation',
    description: 'Bypass blocked rail hubs to clear critical unfulfilled component backlogs.',
    minRulesVersion: 1,
    domainUnits: ['unfulfilledDemandBacklog'],
    costResource: 'freight_fuel',
  },
  {
    id: 'industrial.action.blast_furnace_feed_override',
    featureId: 'P001',
    name: 'Blast Furnace Feed Override',
    description: 'Expedite emergency raw ore stockpiles to maintain furnace operational heat.',
    minRulesVersion: 1,
    domainUnits: ['totalRawOreStock'],
    costResource: 'ore',
  },
  {
    id: 'industrial.action.slag_cooling_purge',
    featureId: 'P001',
    name: 'Slag Cooling Purge',
    description: 'Clear solidified smelter conduits to restore baseline extraction output rate.',
    minRulesVersion: 1,
    domainUnits: ['extractionOutputRate'],
    costResource: 'spares',
  },
  {
    id: 'industrial.hazard.monitoring',
    featureId: 'P002',
    name: 'Industrial Hazard Monitoring',
    description: 'Ordered hazard dependency graph for industrial: freight interruption -> inventory scarcity -> factory stoppage.',
    minRulesVersion: 1,
    domainUnits: ['hazard-index'],
  },
  {
    id: 'industrial.conservation.ledger',
    featureId: 'P003',
    name: 'Industrial Conservation Ledger',
    description: 'Resource-accountable conservation ledger enforcing finite non-negative balances for industrial.',
    minRulesVersion: 1,
    costResource: 'ore',
  },
  {
    id: 'industrial.signature.destination',
    featureId: 'P011',
    name: 'The Factory Without Deliveries',
    description: 'Authored signature destination for industrial: The Factory Without Deliveries.',
    minRulesVersion: 1,
  },
];

export const INDUSTRIAL_HAZARD_NODES: readonly HazardNode[] = [
  {
    id: 'freight_stoppage',
    label: 'Freight Stoppage',
    worldId: 'industrial',
    sourceMetric: 'unfulfilledDemandBacklog',
    targetMetric: 'unfulfilledDemandBacklog',
    threshold: 500,
    operator: '>',
    severity: 'warning',
    upstreamNodeIds: [],
    mitigationActionFamily: 'industrial.action.conveyor_spur_activation',
    description: 'Heavy rail freight interruption causes supply bottlenecks',
    observedTriggerTemplate: 'Unfulfilled freight backlog ({value}) exceeded {threshold}',
    hypothesizedExplanation: 'Automated rail derailment and marshalling yard power failure blocking ore transit',
  },
  {
    id: 'inventory_starvation',
    label: 'Inventory Starvation',
    worldId: 'industrial',
    sourceMetric: 'totalRawOreStock',
    targetMetric: 'totalRawOreStock',
    threshold: 50,
    operator: '<',
    severity: 'critical',
    upstreamNodeIds: ['freight_stoppage'],
    mitigationActionFamily: 'industrial.action.blast_furnace_feed_override',
    description: 'On-site feedstock reserves depleted by unreplenished consumption',
    observedTriggerTemplate: 'Raw ore stock ({value} t) fell below {threshold} t',
    hypothesizedExplanation: 'Continuous smelting without incoming freight emptying storage silos',
  },
  {
    id: 'foundry_blackout',
    label: 'Foundry Blackout',
    worldId: 'industrial',
    sourceMetric: 'extractionOutputRate',
    targetMetric: 'extractionOutputRate',
    threshold: 10,
    operator: '<',
    severity: 'catastrophic',
    upstreamNodeIds: ['inventory_starvation'],
    mitigationActionFamily: 'industrial.action.slag_cooling_purge',
    description: 'Smelter freeze and slag solidification halts entire manufacturing complex',
    observedTriggerTemplate: 'Smelter extraction rate ({value} t/h) fell below {threshold} t/h',
    hypothesizedExplanation: 'Starved blast furnaces cooling down, freezing molten slag in conduits',
  },
];

export const INDUSTRIAL_HAZARD_LINKS: readonly HazardLink[] = [
  {
    fromNodeId: 'freight_stoppage',
    toNodeId: 'inventory_starvation',
    causalLinkType: 'direct',
    description: 'Freight delays exhaust warehouse feedstock reserves',
  },
  {
    fromNodeId: 'inventory_starvation',
    toNodeId: 'foundry_blackout',
    causalLinkType: 'dependency',
    description: 'Lack of ore causes blast furnaces to starve, cool, and freeze',
  },
];

export const industrialFeatureModule = new StandardWorldFeatureModule({
  worldId: 'industrial',
  capabilities: INDUSTRIAL_CAPABILITIES,
  hazardNodes: INDUSTRIAL_HAZARD_NODES,
  hazardLinks: INDUSTRIAL_HAZARD_LINKS,
  initialBudget: {
    ore: { balance: 80, capacity: 150, replenishmentRate: 2.0 },
    processed_goods: { balance: 40, capacity: 80, replenishmentRate: 0.5 },
    freight_fuel: { balance: 60, capacity: 100, replenishmentRate: 1.0 },
    spares: { balance: 30, capacity: 60, replenishmentRate: 0.3 },
  },
  actionCosts: {
    'industrial.action.conveyor_spur_activation': [
      { resource: 'freight_fuel', amount: 10 },
      { resource: 'spares', amount: 4 },
    ],
    'industrial.action.blast_furnace_feed_override': [
      { resource: 'ore', amount: 20 },
      { resource: 'freight_fuel', amount: 8 },
    ],
    'industrial.action.slag_cooling_purge': [
      { resource: 'spares', amount: 8 },
      { resource: 'processed_goods', amount: 10 },
    ],
  },
  actionDeltas: {
    'industrial.action.conveyor_spur_activation': [
      { field: 'unfulfilledDemandBacklog', delta: -200, unit: 'orders' },
    ],
    'industrial.action.blast_furnace_feed_override': [
      { field: 'totalRawOreStock', delta: 60, unit: 't' },
    ],
    'industrial.action.slag_cooling_purge': [
      { field: 'extractionOutputRate', delta: 20, unit: 't/h' },
    ],
  },
  metricKeys: ['unfulfilledDemandBacklog', 'totalRawOreStock', 'extractionOutputRate'],
});
