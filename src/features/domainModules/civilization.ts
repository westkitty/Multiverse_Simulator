import { FeatureCapability, HazardLink, HazardNode } from '../contracts';
import { StandardWorldFeatureModule } from './domainHelper';

export const CIVILIZATION_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'civilization.action.aqueduct_restoration',
    featureId: 'P001',
    name: 'Aqueduct Restoration',
    description: 'Repair breached canal viaducts to refill municipal reservoirs.',
    minRulesVersion: 1,
    domainUnits: ['totalWaterStock'],
    costResource: 'repair_materials',
  },
  {
    id: 'civilization.action.granary_rationing',
    featureId: 'P001',
    name: 'Granary Rationing',
    description: 'Enact emergency grain rationing to stave off famine collapse.',
    minRulesVersion: 1,
    domainUnits: ['totalFoodStock'],
    costResource: 'grain',
  },
  {
    id: 'civilization.action.civic_assembly',
    featureId: 'P001',
    name: 'Civic Assembly',
    description: 'Reconvene regional forum to coordinate municipal waterworks maintenance.',
    minRulesVersion: 1,
    domainUnits: ['meanWaterworksLevel'],
    costResource: 'cistern_inventory',
  },
  {
    id: 'civilization.hazard.monitoring',
    featureId: 'P002',
    name: 'Civilization Hazard Monitoring',
    description: 'Ordered hazard dependency graph for civilization: water shortage -> food scarcity -> civic failure.',
    minRulesVersion: 1,
    domainUnits: ['hazard-index'],
  },
  {
    id: 'civilization.conservation.ledger',
    featureId: 'P003',
    name: 'Civilization Conservation Ledger',
    description: 'Resource-accountable conservation ledger enforcing finite non-negative balances for civilization.',
    minRulesVersion: 1,
    costResource: 'repair_materials',
  },
  {
    id: 'civilization.signature.destination',
    featureId: 'P011',
    name: 'The Abandoned River Capital',
    description: 'Authored signature destination for civilization: The Abandoned River Capital.',
    minRulesVersion: 1,
  },
];

export const CIVILIZATION_HAZARD_NODES: readonly HazardNode[] = [
  {
    id: 'water_shortage',
    label: 'Water Shortage',
    worldId: 'civilization',
    sourceMetric: 'totalWaterStock',
    targetMetric: 'totalWaterStock',
    threshold: 100,
    operator: '<',
    severity: 'warning',
    upstreamNodeIds: [],
    mitigationActionFamily: 'civilization.action.aqueduct_restoration',
    description: 'Cistern water supply drops below emergency rationing levels',
    observedTriggerTemplate: 'Cistern water reserves ({value}) fell below {threshold}',
    hypothesizedExplanation: 'Aqueduct breaches and seasonal drought cutting off river inflow',
  },
  {
    id: 'food_scarcity',
    label: 'Food Scarcity',
    worldId: 'civilization',
    sourceMetric: 'totalFoodStock',
    targetMetric: 'totalFoodStock',
    threshold: 80,
    operator: '<',
    severity: 'critical',
    upstreamNodeIds: ['water_shortage'],
    mitigationActionFamily: 'civilization.action.granary_rationing',
    description: 'Crop harvest and granary inventories collapse',
    observedTriggerTemplate: 'Stored grain reserves ({value}) fell below {threshold}',
    hypothesizedExplanation: 'Irrigation canal failure stunting seasonal agriculture',
  },
  {
    id: 'civic_failure',
    label: 'Civic Failure',
    worldId: 'civilization',
    sourceMetric: 'meanWaterworksLevel',
    targetMetric: 'meanWaterworksLevel',
    threshold: 1,
    operator: '<',
    severity: 'catastrophic',
    upstreamNodeIds: ['food_scarcity'],
    mitigationActionFamily: 'civilization.action.civic_assembly',
    description: 'Municipal governance and infrastructure breakdown',
    observedTriggerTemplate: 'Municipal waterworks level ({value}) dropped below {threshold}',
    hypothesizedExplanation: 'Depopulation and riots abandoning maintenance of critical civic systems',
  },
];

export const CIVILIZATION_HAZARD_LINKS: readonly HazardLink[] = [
  {
    fromNodeId: 'water_shortage',
    toNodeId: 'food_scarcity',
    causalLinkType: 'direct',
    description: 'Lack of irrigation directly causes widespread crop failure and food shortages',
  },
  {
    fromNodeId: 'food_scarcity',
    toNodeId: 'civic_failure',
    causalLinkType: 'dependency',
    description: 'Food scarcity undermines civic cohesion and maintenance labor',
  },
];

export const civilizationFeatureModule = new StandardWorldFeatureModule({
  worldId: 'civilization',
  capabilities: CIVILIZATION_CAPABILITIES,
  hazardNodes: CIVILIZATION_HAZARD_NODES,
  hazardLinks: CIVILIZATION_HAZARD_LINKS,
  initialBudget: {
    cistern_inventory: { balance: 50, capacity: 100, replenishmentRate: 1.0 },
    grain: { balance: 60, capacity: 120, replenishmentRate: 0.5 },
    repair_materials: { balance: 40, capacity: 80, replenishmentRate: 0.2 },
  },
  actionCosts: {
    'civilization.action.aqueduct_restoration': [
      { resource: 'repair_materials', amount: 8 },
      { resource: 'cistern_inventory', amount: 5 },
    ],
    'civilization.action.granary_rationing': [
      { resource: 'grain', amount: 10 },
      { resource: 'repair_materials', amount: 2 },
    ],
    'civilization.action.civic_assembly': [
      { resource: 'grain', amount: 15 },
      { resource: 'cistern_inventory', amount: 10 },
    ],
  },
  actionDeltas: {
    'civilization.action.aqueduct_restoration': [
      { field: 'totalWaterStock', delta: 50, unit: 'm3' },
      { field: 'meanWaterworksLevel', delta: 0.5, unit: 'tier' },
    ],
    'civilization.action.granary_rationing': [
      { field: 'totalFoodStock', delta: 40, unit: 't' },
    ],
    'civilization.action.civic_assembly': [
      { field: 'meanWaterworksLevel', delta: 1.0, unit: 'tier' },
      { field: 'totalFoodStock', delta: 20, unit: 't' },
    ],
  },
  metricKeys: ['totalWaterStock', 'totalFoodStock', 'meanWaterworksLevel'],
});
