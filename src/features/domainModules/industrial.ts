import {
  NativeActionFamilyDefinition,
  ScientificInstrumentConfig, EmergencyDefinition,
  FeatureCapability,
  PolicyDefinition,
  RestorationLayerDefinition, HazardLink, HazardNode } from '../contracts';
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
    mitigationActionFamily: 'industrial.action.blast_furnace_feed_override',
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
    mitigationActionFamily: 'industrial.action.conveyor_spur_activation',
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


export const INDUSTRIAL_EMERGENCIES: readonly EmergencyDefinition[] = [
  {
    "id": "industrial.furnace_starvation",
    "worldId": "industrial",
    "name": "Smelter Starvation & Foundry Stall",
    "description": "Raw ore supply disruption causing blast furnace freeze-ups.",
    "triggerMetric": "totalRawOreStock",
    "triggerOperator": "<",
    "precursorThreshold": 50,
    "activeThreshold": 20,
    "escalateDelayTicks": 4,
    "containmentActionIds": [
      "industrial.action.haulage_surge"
    ],
    "consequences": {
      "metricPenaltiesPerTick": {
        "extractionOutputRate": 1.5,
        "unfulfilledDemandBacklog": 5
      },
      "budgetDrainPerTick": {
        "freight_fuel": 1
      },
      "secondaryHazardNodeId": "inventory_starvation",
      "description": "Crucibles cool and seize, creating massive backlogs in machinery manufacturing."
    }
  }
] as const;

export const INDUSTRIAL_RESTORATION_LAYERS: readonly RestorationLayerDefinition[] = [
  {
    "id": "conveyor_networks",
    "name": "Freight Conveyor Infrastructure",
    "metricKey": "totalRawOreStock",
    "baselineValue": 15,
    "targetValue": 150,
    "visualElements": {
      "materialColor": "#e64a19",
      "accentHex": "#ff8a65",
      "activeMeshes": [
        "seized_rollers",
        "repaired_beltway",
        "high_speed_gantry",
        "automated_ore_monorail"
      ]
    },
    "stageDescriptions": {
      "degraded": "Torn rubber belts and stalled rusty conveyor chutes.",
      "stabilizing": "Drive motors replaced and high-tension chains re-linked.",
      "restoring": "Continuous iron ore streams pouring into processing hoppers.",
      "flourishing": "Roaring multi-tiered conveyor networks feeding industrial crucibles."
    }
  },
  {
    "id": "blast_furnace_hearths",
    "name": "Blast Furnace Foundry Hearth",
    "metricKey": "extractionOutputRate",
    "baselineValue": 2,
    "targetValue": 25,
    "visualElements": {
      "materialColor": "#f4511e",
      "accentHex": "#ff7043",
      "activeMeshes": [
        "cold_slag_crucible",
        "preheating_tuyere",
        "molten_iron_tap",
        "continuous_smelting_cascade"
      ]
    },
    "stageDescriptions": {
      "degraded": "Dark, cold slag crucibles choked with solid metal.",
      "stabilizing": "Preheating blowers reignite oxygen blast tuyeres.",
      "restoring": "Glowing streams of molten pig iron filling casting molds.",
      "flourishing": "Blinding volcanic cascade of high-grade alloy production."
    }
  }
] as const;

export const INDUSTRIAL_POLICIES: readonly PolicyDefinition[] = [
  {
    "id": "industrial.priority_freight_convoy",
    "worldId": "industrial",
    "name": "Priority Freight Convoy",
    "description": "Rushes heavy fuel haulers to restock bins, wearing out local excavation equipment.",
    "targetHazard": "freight_stoppage",
    "resourceCostsPerTick": {
      "freight_fuel": 3
    },
    "metricBenefitsPerTick": {
      "totalRawOreStock": 8
    },
    "sideEffectsPerTick": {
      "extractionOutputRate": -0.8
    },
    "tradeoffSummary": "Rapidly restocks empty blast furnaces but causes excessive mechanical wear."
  },
  {
    "id": "industrial.spares_cannibalization_overdrive",
    "worldId": "industrial",
    "name": "Spares Cannibalization Overdrive",
    "description": "Repairs primary drillheads using spare assemblies, burning ore reserves faster.",
    "targetHazard": "inventory_starvation",
    "resourceCostsPerTick": {
      "spares": 2
    },
    "metricBenefitsPerTick": {
      "extractionOutputRate": 2.5
    },
    "sideEffectsPerTick": {
      "totalRawOreStock": -2
    },
    "tradeoffSummary": "Maintains assembly speed by burning through existing raw materials."
  }
] as const;

export const INDUSTRIAL_NATIVE_ACTIONS: readonly NativeActionFamilyDefinition[] = [
  {
    "id": "industrial.action.conveyor_spur_activation",
    "worldId": "industrial",
    "familyKey": "conveyor_spur_activation",
    "name": "Extraction & Production Rebalance",
    "description": "Engage auxiliary conveyor lines to clear mineral delivery bottlenecks.",
    "readSet": [
      "totalRawOreStock",
      "extractionOutputRate"
    ],
    "writeSet": [
      "totalRawOreStock",
      "extractionOutputRate"
    ],
    "prerequisites": [
      {
        "field": "totalRawOreStock",
        "condition": "<",
        "threshold": 40
      }
    ],
    "resourceCosts": [
      {
        "resource": "spares",
        "amount": 4
      },
      {
        "resource": "ore",
        "amount": 3
      }
    ],
    "deltas": [
      {
        "field": "totalRawOreStock",
        "delta": 25,
        "unit": "t"
      },
      {
        "field": "extractionOutputRate",
        "delta": 5,
        "unit": "t/hr"
      }
    ],
    "decisionImplication": "Restores furnace feed stability, avoiding shutdown at mechanical spare wear.",
    "dynamicHelp": "Activate conveyor spurs when ore storage drops below 40 t."
  },
  {
    "id": "industrial.action.blast_furnace_feed_override",
    "worldId": "industrial",
    "familyKey": "blast_furnace_feed_override",
    "name": "Emergency Freight Routing",
    "description": "Override blast furnace feed schedules to process stranded critical batches.",
    "readSet": [
      "unfulfilledDemandBacklog",
      "extractionOutputRate"
    ],
    "writeSet": [
      "unfulfilledDemandBacklog",
      "extractionOutputRate"
    ],
    "prerequisites": [
      {
        "field": "unfulfilledDemandBacklog",
        "condition": ">",
        "threshold": 50
      }
    ],
    "resourceCosts": [
      {
        "resource": "freight_fuel",
        "amount": 5
      },
      {
        "resource": "processed_goods",
        "amount": 2
      }
    ],
    "deltas": [
      {
        "field": "unfulfilledDemandBacklog",
        "delta": -25,
        "unit": "orders"
      },
      {
        "field": "extractionOutputRate",
        "delta": 8,
        "unit": "t/hr"
      }
    ],
    "decisionImplication": "Drives down industrial supply chain backlog by burning priority freight fuel.",
    "dynamicHelp": "Override feed lines when unfulfilled order backlog exceeds 50 orders."
  },
  {
    "id": "industrial.action.slag_cooling_purge",
    "worldId": "industrial",
    "familyKey": "slag_cooling_purge",
    "name": "Foundry Waste Containment",
    "description": "Purge solidified slag buildup and flush cooling channels to avert furnace burst.",
    "readSet": [
      "extractionOutputRate",
      "unfulfilledDemandBacklog"
    ],
    "writeSet": [
      "extractionOutputRate",
      "unfulfilledDemandBacklog"
    ],
    "prerequisites": [
      {
        "field": "extractionOutputRate",
        "condition": "<",
        "threshold": 25
      }
    ],
    "resourceCosts": [
      {
        "resource": "spares",
        "amount": 5
      },
      {
        "resource": "ore",
        "amount": 2
      }
    ],
    "deltas": [
      {
        "field": "extractionOutputRate",
        "delta": 15,
        "unit": "t/hr"
      },
      {
        "field": "unfulfilledDemandBacklog",
        "delta": -5,
        "unit": "orders"
      }
    ],
    "decisionImplication": "Cleans toxic furnace encrustation, preventing catastrophic thermal runaway.",
    "dynamicHelp": "Purge cooling jackets when smelter extraction rate drops below 25 t/hr."
  }
] as const;


export const INDUSTRIAL_INSTRUMENTS: readonly ScientificInstrumentConfig[] = [{
  "id": "industrial.instrument.furnace_telemetry_monitor",
  "worldId": "industrial",
  "name": "Heavy Foundry Diagnostic Monitor",
  "description": "Monitors ore stock reserves, unfulfilled order backlogs, and extraction flow.",
  "deviceClass": "structural_probe",
  "sampleCost": [
    {
      "resource": "freight_fuel",
      "amount": 1
    }
  ],
  "calibrationCost": [
    {
      "resource": "spares",
      "amount": 2
    }
  ],
  "channels": [
    {
      "id": "unfulfilledDemandBacklog",
      "name": "Order Backlog",
      "unit": "orders",
      "minValid": 0,
      "maxValid": 200,
      "basePrecision": 1
    },
    {
      "id": "totalRawOreStock",
      "name": "Raw Ore Storage",
      "unit": "t",
      "minValid": 0,
      "maxValid": 200,
      "basePrecision": 0.5
    },
    {
      "id": "extractionOutputRate",
      "name": "Smelter Output Rate",
      "unit": "t/hr",
      "minValid": 0,
      "maxValid": 100,
      "basePrecision": 0.2
    }
  ]
}] as const;


export const industrialFeatureModule = new StandardWorldFeatureModule({
  instruments: INDUSTRIAL_INSTRUMENTS,
  nativeActions: INDUSTRIAL_NATIVE_ACTIONS,
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
  facilityDefinitions: [
    {
      "typeId": "freight_depot",
      "worldId": "industrial",
      "name": "Automated Freight Terminal",
      "description": "Coordinates raw materials routing to prevent inventory starvation.",
      "buildMaterialsCost": [
        {
          "resource": "ore",
          "amount": 12
        },
        {
          "resource": "spares",
          "amount": 5
        }
      ],
      "buildTicks": 3,
      "upkeepCost": [
        {
          "resource": "spares",
          "amount": 1
        }
      ],
      "benefitMetric": "equipmentHealth",
      "benefitDeltaPerTick": 2
    },
    {
      "typeId": "production_buffer",
      "worldId": "industrial",
      "name": "Finished Goods Logistics Buffer",
      "description": "Buffers intermediate output and balances manufacturing cycle throughput.",
      "buildMaterialsCost": [
        {
          "resource": "processed_goods",
          "amount": 8
        },
        {
          "resource": "freight_fuel",
          "amount": 8
        }
      ],
      "buildTicks": 4,
      "upkeepCost": [
        {
          "resource": "freight_fuel",
          "amount": 1
        }
      ],
      "benefitMetric": "outputInventory",
      "benefitDeltaPerTick": 25
    }
  ],
  initialDepots: [
    {
      "siteId": "site-assembly",
      "capacity": 100,
      "inventory": {
        "ore": 50,
        "processed_goods": 25,
        "freight_fuel": 35,
        "spares": 20
      }
    },
    {
      "siteId": "site-dispatch",
      "capacity": 100,
      "inventory": {
        "ore": 30,
        "processed_goods": 15,
        "freight_fuel": 25,
        "spares": 10
      }
    }
  ],
  initialCouriers: [
    {
      "id": "courier-ind-1",
      "name": "Industrial Rail Train",
      "carrierType": "crawler_train",
      "capacity": 50,
      "speed": 1,
      "location": "site-assembly",
      "currentCargo": {},
      "status": "idle",
      "condition": 100,
      "fuel": 60
    }
  ],
  initialRoutes: [
    {
      "fromSiteId": "site-assembly",
      "toSiteId": "site-dispatch",
      "travelTicks": 2,
      "fuelCost": 1
    }
  ],
  emergencies: INDUSTRIAL_EMERGENCIES,
  restorationLayers: INDUSTRIAL_RESTORATION_LAYERS,
  policies: INDUSTRIAL_POLICIES,
});
