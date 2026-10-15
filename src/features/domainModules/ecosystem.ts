import {
  EmergencyDefinition,
  FeatureCapability,
  PolicyDefinition,
  RestorationLayerDefinition,
  HazardDependencyGraph,
  HazardLink,
  HazardNode,
  ScientificBudgetLedger,
} from '../contracts';
import { StandardWorldFeatureModule } from './domainHelper';

export const ECOSYSTEM_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'ecosystem.action.habitat_corridors',
    featureId: 'P001',
    name: 'Habitat Corridors',
    description: 'Establish migratory corridors to relieve local drought stress.',
    minRulesVersion: 1,
    domainUnits: ['moisture', 'biomass'],
    costResource: 'water_stores',
  },
  {
    id: 'ecosystem.action.nutrient_balancing',
    featureId: 'P001',
    name: 'Nutrient Balancing',
    description: 'Apply enzymatic treatments to halt toxic nutrient runaway.',
    minRulesVersion: 1,
    domainUnits: ['nutrients', 'moisture'],
    costResource: 'supplies',
  },
  {
    id: 'ecosystem.action.targeted_firebreaks',
    featureId: 'P001',
    name: 'Targeted Firebreaks',
    description: 'Construct controlled firebreaks to protect dying forest canopy.',
    minRulesVersion: 1,
    domainUnits: ['biomass', 'nutrients'],
    costResource: 'seed_stocks',
  },
  {
    id: 'ecosystem.hazard.monitoring',
    featureId: 'P002',
    name: 'Ecosystem Hazard Monitoring',
    description: 'Ordered hazard dependency graph for ecosystem: watershed drought / nutrient runaway.',
    minRulesVersion: 1,
    domainUnits: ['hazard-index'],
  },
  {
    id: 'ecosystem.conservation.ledger',
    featureId: 'P003',
    name: 'Ecosystem Conservation Ledger',
    description: 'Resource-accountable conservation ledger enforcing finite non-negative balances for ecosystem.',
    minRulesVersion: 1,
    costResource: 'supplies',
  },
  {
    id: 'ecosystem.signature.destination',
    featureId: 'P011',
    name: 'The Glasswater Refuge',
    description: 'Authored signature destination for ecosystem: The Glasswater Refuge.',
    minRulesVersion: 1,
  },
];

export const ECOSYSTEM_HAZARD_NODES: readonly HazardNode[] = [
  {
    id: 'watershed_drought',
    label: 'Watershed Drought',
    worldId: 'ecosystem',
    sourceMetric: 'moisture',
    targetMetric: 'moisture',
    threshold: 30,
    operator: '<',
    severity: 'warning',
    upstreamNodeIds: [],
    mitigationActionFamily: 'ecosystem.action.habitat_corridors',
    description: 'Soil moisture falls below critical threshold',
    observedTriggerTemplate: 'Watershed moisture ({value}) dropped below {threshold}',
    hypothesizedExplanation: 'Prolonged rainfall deficit drying regional soil beds',
  },
  {
    id: 'nutrient_runaway',
    label: 'Nutrient Runaway',
    worldId: 'ecosystem',
    sourceMetric: 'nutrients',
    targetMetric: 'nutrients',
    threshold: 80,
    operator: '>',
    severity: 'critical',
    upstreamNodeIds: ['watershed_drought'],
    mitigationActionFamily: 'ecosystem.action.nutrient_balancing',
    description: 'Nutrient concentration exceeds tolerable bounds',
    observedTriggerTemplate: 'Nutrient concentration ({value}) exceeded {threshold}',
    hypothesizedExplanation: 'Stagnant flow allows toxic mineralization and salt accumulation',
  },
  {
    id: 'canopy_dieback',
    label: 'Canopy Dieback',
    worldId: 'ecosystem',
    sourceMetric: 'biomass',
    targetMetric: 'biomass',
    threshold: 20,
    operator: '<',
    severity: 'catastrophic',
    upstreamNodeIds: ['nutrient_runaway'],
    mitigationActionFamily: 'ecosystem.action.targeted_firebreaks',
    description: 'Forest canopy fails irreversibly',
    observedTriggerTemplate: 'Canopy biomass ({value}) dropped below {threshold}',
    hypothesizedExplanation: 'Combined osmotic shock and toxic mineralization kill root systems',
  },
];

export const ECOSYSTEM_HAZARD_LINKS: readonly HazardLink[] = [
  {
    fromNodeId: 'watershed_drought',
    toNodeId: 'nutrient_runaway',
    causalLinkType: 'direct',
    description: 'Low moisture concentrates mineralized nutrients in soil',
  },
  {
    fromNodeId: 'nutrient_runaway',
    toNodeId: 'canopy_dieback',
    causalLinkType: 'dependency',
    description: 'Nutrient toxic buildup accelerates canopy root necrosis',
  },
];

export function createEcosystemHazardGraph(): HazardDependencyGraph {
  return new HazardDependencyGraph('ecosystem', ECOSYSTEM_HAZARD_NODES, ECOSYSTEM_HAZARD_LINKS);
}

export function createEcosystemBudgetLedger(): ScientificBudgetLedger {
  return new ScientificBudgetLedger('ecosystem', {
    supplies: { balance: 40, capacity: 100, replenishmentRate: 0.5 },
    water_stores: { balance: 50, capacity: 100, replenishmentRate: 1.0 },
    seed_stocks: { balance: 30, capacity: 60, replenishmentRate: 0.2 },
  });
}

const ACTION_COSTS: Record<string, Array<{ resource: string; amount: number }>> = {
  'ecosystem.action.habitat_corridors': [
    { resource: 'water_stores', amount: 5 },
    { resource: 'supplies', amount: 2 },
  ],
  'ecosystem.action.nutrient_balancing': [
    { resource: 'supplies', amount: 4 },
    { resource: 'water_stores', amount: 3 },
  ],
  'ecosystem.action.targeted_firebreaks': [
    { resource: 'seed_stocks', amount: 4 },
    { resource: 'supplies', amount: 6 },
  ],
};

const ACTION_DELTAS: Record<string, Array<{ field: string; delta: number; unit: string }>> = {
  'ecosystem.action.habitat_corridors': [
    { field: 'moisture', delta: 15, unit: '%' },
    { field: 'biomass', delta: 5, unit: 't' },
  ],
  'ecosystem.action.nutrient_balancing': [
    { field: 'nutrients', delta: -20, unit: 'ppm' },
    { field: 'moisture', delta: 5, unit: '%' },
  ],
  'ecosystem.action.targeted_firebreaks': [
    { field: 'biomass', delta: 15, unit: 't' },
    { field: 'nutrients', delta: -10, unit: 'ppm' },
  ],
};

export const ECOSYSTEM_FACILITY_DEFINITIONS = [
  {
    typeId: 'wetland_pump',
    worldId: 'ecosystem',
    name: 'Wetland Hydration Pump',
    description: 'Restores hydraulic gradient across dried wetland sectors.',
    buildMaterialsCost: [
      { resource: 'water_stores', amount: 5 },
      { resource: 'supplies', amount: 4 },
    ],
    buildTicks: 3,
    upkeepCost: [{ resource: 'supplies', amount: 1 }],
    benefitMetric: 'moisture',
    benefitDeltaPerTick: 1.5,
  },
  {
    typeId: 'seed_nursery',
    worldId: 'ecosystem',
    name: 'Seed Propagation Nursery',
    description: 'Propagates drought-tolerant flora to restore lost biomass.',
    buildMaterialsCost: [
      { resource: 'seed_stocks', amount: 5 },
      { resource: 'water_stores', amount: 4 },
    ],
    buildTicks: 4,
    upkeepCost: [{ resource: 'water_stores', amount: 1 }],
    benefitMetric: 'biomass',
    benefitDeltaPerTick: 2.0,
  },
] as const;

export const ECOSYSTEM_DEPOTS = [
  {
    siteId: 'depot-nursery',
    capacity: 100,
    inventory: { supplies: 25, water_stores: 30, seed_stocks: 20 },
  },
  {
    siteId: 'depot-wetland',
    capacity: 100,
    inventory: { supplies: 15, water_stores: 20, seed_stocks: 10 },
  },
] as const;

export const ECOSYSTEM_COURIERS = [
  {
    id: 'courier-eco-1',
    name: 'Wetland Rover 1',
    carrierType: 'ground_rover' as const,
    capacity: 30,
    speed: 1,
    location: 'depot-nursery',
    currentCargo: {},
    status: 'idle' as const,
    condition: 100,
    fuel: 50,
  },
];

export const ECOSYSTEM_ROUTES = [
  {
    fromSiteId: 'depot-nursery',
    toSiteId: 'depot-wetland',
    travelTicks: 2,
    fuelCost: 1,
  },
];


export const ECOSYSTEM_EMERGENCIES: readonly EmergencyDefinition[] = [
  {
    "id": "ecosystem.watershed_collapse",
    "worldId": "ecosystem",
    "name": "Watershed Collapse & Nutrient Runaway",
    "description": "Critical moisture loss causing rapid soil salinization and canopy collapse.",
    "triggerMetric": "moisture",
    "triggerOperator": "<",
    "precursorThreshold": 35,
    "activeThreshold": 20,
    "escalateDelayTicks": 4,
    "containmentActionIds": [
      "ecosystem.action.habitat_corridors",
      "ecosystem.action.nutrient_balancing"
    ],
    "consequences": {
      "metricPenaltiesPerTick": {
        "biomass": 1.5,
        "nutrients": 1
      },
      "budgetDrainPerTick": {
        "water_stores": 1
      },
      "secondaryHazardNodeId": "nutrient_runaway",
      "description": "Runaway drying decimates living biomass and drains emergency water stores."
    }
  }
] as const;

export const ECOSYSTEM_RESTORATION_LAYERS: readonly RestorationLayerDefinition[] = [
  {
    "id": "wetland_channels",
    "name": "Wetland Channel Connectivity",
    "metricKey": "moisture",
    "baselineValue": 15,
    "targetValue": 80,
    "visualElements": {
      "materialColor": "#1976d2",
      "accentHex": "#64b5f6",
      "activeMeshes": [
        "dry_marsh_bed",
        "shallow_rill",
        "connected_creek",
        "deep_water_lagoon"
      ]
    },
    "stageDescriptions": {
      "degraded": "Cracked, parched mud beds with no surface water.",
      "stabilizing": "Trickling seepages connect isolated pools.",
      "restoring": "Braided channels flow continuously across the flood basin.",
      "flourishing": "Deep open lagoons surrounded by lush reed beds."
    }
  },
  {
    "id": "forest_canopy",
    "name": "Dead Canopy Regrowth",
    "metricKey": "biomass",
    "baselineValue": 10,
    "targetValue": 90,
    "visualElements": {
      "materialColor": "#2e7d32",
      "accentHex": "#81c784",
      "activeMeshes": [
        "charred_stumps",
        "sapling_groundcover",
        "mature_oak_groves",
        "ancient_canopy"
      ]
    },
    "stageDescriptions": {
      "degraded": "Dead gray canopy and bare scorched soil.",
      "stabilizing": "Hardy pioneer moss and scrub begin anchoring the soil.",
      "restoring": "Vibrant green sapling thickets shade the understory.",
      "flourishing": "Towering cathedral forest with thick, interlocking canopy."
    }
  }
] as const;

export const ECOSYSTEM_POLICIES: readonly PolicyDefinition[] = [
  {
    "id": "ecosystem.emergency_aquifer_recharge",
    "worldId": "ecosystem",
    "name": "Emergency Aquifer Recharge",
    "description": "Forces high-pressure water stores into deep subterranean aquifers.",
    "targetHazard": "watershed_drought",
    "resourceCostsPerTick": {
      "water_stores": 3
    },
    "metricBenefitsPerTick": {
      "moisture": 2.2
    },
    "sideEffectsPerTick": {
      "nutrients": 0.8
    },
    "tradeoffSummary": "Rapid moisture recovery at heavy water store burn, causing mineral leaching."
  },
  {
    "id": "ecosystem.controlled_marsh_mulching",
    "worldId": "ecosystem",
    "name": "Controlled Marsh Mulching",
    "description": "Spreads protective biological seed matting to reduce surface evaporation.",
    "targetHazard": "watershed_drought",
    "resourceCostsPerTick": {
      "seed_stocks": 2
    },
    "metricBenefitsPerTick": {
      "moisture": 0.8
    },
    "sideEffectsPerTick": {
      "biomass": 0.3
    },
    "tradeoffSummary": "Conserves water stores and prevents erosion, but consumes precious seed stock."
  }
] as const;

export const ECOSYSTEM_CONFIG = {
  worldId: 'ecosystem',
  capabilities: ECOSYSTEM_CAPABILITIES,
  hazardNodes: ECOSYSTEM_HAZARD_NODES,
  hazardLinks: ECOSYSTEM_HAZARD_LINKS,
  initialBudget: {
    supplies: { balance: 40, capacity: 100, replenishmentRate: 0.5 },
    water_stores: { balance: 50, capacity: 100, replenishmentRate: 1.0 },
    seed_stocks: { balance: 30, capacity: 60, replenishmentRate: 0.2 },
  },
  actionCosts: ACTION_COSTS,
  actionDeltas: ACTION_DELTAS,
  metricKeys: ['moisture', 'nutrients', 'biomass'],
  facilityDefinitions: ECOSYSTEM_FACILITY_DEFINITIONS,
  initialDepots: ECOSYSTEM_DEPOTS,
  initialCouriers: ECOSYSTEM_COURIERS,
  initialRoutes: ECOSYSTEM_ROUTES,
  emergencies: ECOSYSTEM_EMERGENCIES,
  restorationLayers: ECOSYSTEM_RESTORATION_LAYERS,
  policies: ECOSYSTEM_POLICIES,
};

export class EcosystemFeatureModule extends StandardWorldFeatureModule {
  constructor() {
    super(ECOSYSTEM_CONFIG);
  }
}

export const ecosystemFeatureModule = new EcosystemFeatureModule();
