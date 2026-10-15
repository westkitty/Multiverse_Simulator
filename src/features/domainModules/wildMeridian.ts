import {
  NativeActionFamilyDefinition,
  ScientificInstrumentConfig, EmergencyDefinition,
  FeatureCapability,
  PolicyDefinition,
  RestorationLayerDefinition, HazardLink, HazardNode } from '../contracts';
import { StandardWorldFeatureModule } from './domainHelper';

export const WILD_MERIDIAN_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'wildMeridian.action.watering_hole_recharge',
    featureId: 'P001',
    name: 'Watering Hole Recharge',
    description: 'Pump groundwater reserves into valley wetlands to alleviate severe drought.',
    minRulesVersion: 1,
    domainUnits: ['water'],
    costResource: 'stored_water',
  },
  {
    id: 'wildMeridian.action.scrubland_reseeding',
    featureId: 'P001',
    name: 'Scrubland Reseeding',
    description: 'Broadcast drought-tolerant native seeds to halt scrubland canopy fragmentation.',
    minRulesVersion: 1,
    domainUnits: ['vegetation'],
    costResource: 'seed_stock',
  },
  {
    id: 'wildMeridian.action.migration_corridor_fencing',
    featureId: 'P001',
    name: 'Migration Corridor Fencing',
    description: 'Erect protected sanctuary boundaries to safeguard starving megafauna populations.',
    minRulesVersion: 1,
    domainUnits: ['wildlife'],
    costResource: 'field_energy',
  },
  {
    id: 'wildMeridian.hazard.monitoring',
    featureId: 'P002',
    name: 'Wild Meridian Hazard Monitoring',
    description: 'Ordered hazard dependency graph for wild-meridian: drought -> habitat fragmentation -> wildlife decline.',
    minRulesVersion: 1,
    domainUnits: ['hazard-index'],
  },
  {
    id: 'wildMeridian.conservation.ledger',
    featureId: 'P003',
    name: 'Wild Meridian Conservation Ledger',
    description: 'Resource-accountable conservation ledger enforcing finite non-negative balances for wild-meridian.',
    minRulesVersion: 1,
    costResource: 'stored_water',
  },
  {
    id: 'wildMeridian.signature.destination',
    featureId: 'P011',
    name: 'Silent Valley',
    description: 'Authored signature destination for wild-meridian: Silent Valley.',
    minRulesVersion: 1,
  },
];

export const WILD_MERIDIAN_HAZARD_NODES: readonly HazardNode[] = [
  {
    id: 'watershed_depletion',
    label: 'Watershed Depletion',
    worldId: 'wild-meridian',
    sourceMetric: 'water',
    targetMetric: 'water',
    threshold: 25,
    operator: '<',
    severity: 'warning',
    upstreamNodeIds: [],
    mitigationActionFamily: 'wildMeridian.action.watering_hole_recharge',
    description: 'Groundwater table and river pools drop below critical survival levels',
    observedTriggerTemplate: 'Groundwater volume ({value}) fell below {threshold}',
    hypothesizedExplanation: 'Severe rainfall deficit depleting alluvial aquifers across the meridian',
  },
  {
    id: 'canopy_fragmentation',
    label: 'Canopy Fragmentation',
    worldId: 'wild-meridian',
    sourceMetric: 'vegetation',
    targetMetric: 'vegetation',
    threshold: 30,
    operator: '<',
    severity: 'critical',
    upstreamNodeIds: ['watershed_depletion'],
    mitigationActionFamily: 'wildMeridian.action.scrubland_reseeding',
    description: 'Vegetation canopy dies back, fragmenting contiguous wilderness corridors',
    observedTriggerTemplate: 'Vegetation coverage index ({value}) dropped below {threshold}',
    hypothesizedExplanation: 'Desiccated soil starving scrubland roots and inducing shrubland retreat',
  },
  {
    id: 'fauna_starvation',
    label: 'Fauna Starvation',
    worldId: 'wild-meridian',
    sourceMetric: 'wildlife',
    targetMetric: 'wildlife',
    threshold: 20,
    operator: '<',
    severity: 'catastrophic',
    upstreamNodeIds: ['canopy_fragmentation'],
    mitigationActionFamily: 'wildMeridian.action.migration_corridor_fencing',
    description: 'Native animal populations starve from severed grazing and watering routes',
    observedTriggerTemplate: 'Wildlife abundance index ({value}) fell below {threshold}',
    hypothesizedExplanation: 'Loss of forage corridors and water sources decimating herds and predators',
  },
];

export const WILD_MERIDIAN_HAZARD_LINKS: readonly HazardLink[] = [
  {
    fromNodeId: 'watershed_depletion',
    toNodeId: 'canopy_fragmentation',
    causalLinkType: 'direct',
    description: 'Water depletion kills scrubland root systems, fragmenting vegetation coverage',
  },
  {
    fromNodeId: 'canopy_fragmentation',
    toNodeId: 'fauna_starvation',
    causalLinkType: 'dependency',
    description: 'Fragmented vegetation denies herbivores adequate forage, triggering starvation',
  },
];


export const WILD_MERIDIAN_EMERGENCIES: readonly EmergencyDefinition[] = [
  {
    "id": "wild_meridian.savanna_desertification",
    "worldId": "wild-meridian",
    "name": "Savanna Drought & Herd Fragmentation",
    "description": "Dry season waterhole depletion driving native herds into starvation.",
    "triggerMetric": "water",
    "triggerOperator": "<",
    "precursorThreshold": 35,
    "activeThreshold": 20,
    "escalateDelayTicks": 4,
    "containmentActionIds": [
      "wild_meridian.action.waterhole_dredging"
    ],
    "consequences": {
      "metricPenaltiesPerTick": {
        "vegetation": 1.8,
        "wildlife": 1.2
      },
      "budgetDrainPerTick": {
        "stored_water": 1
      },
      "secondaryHazardNodeId": "canopy_fragmentation",
      "description": "Desiccated grassland causes herd stampedes and brush fires."
    }
  }
] as const;

export const WILD_MERIDIAN_RESTORATION_LAYERS: readonly RestorationLayerDefinition[] = [
  {
    "id": "riparian_corridors",
    "name": "Riparian River Corridor",
    "metricKey": "water",
    "baselineValue": 15,
    "targetValue": 85,
    "visualElements": {
      "materialColor": "#43a047",
      "accentHex": "#81c784",
      "activeMeshes": [
        "sunbaked_wash",
        "willow_shoot_hedgerow",
        "meandering_riverine_forest",
        "permanent_oxbow_wetland"
      ]
    },
    "stageDescriptions": {
      "degraded": "Cracked white riverbed littered with bleached driftwood.",
      "stabilizing": "Willows and sedge grass anchor the restored banks.",
      "restoring": "Perennial stream connecting deep watering holes.",
      "flourishing": "Lush riparian gallery forest sheltering rich biodiversity."
    }
  },
  {
    "id": "wildlife_pastures",
    "name": "Native Herd Grazing Grounds",
    "metricKey": "wildlife",
    "baselineValue": 10,
    "targetValue": 80,
    "visualElements": {
      "materialColor": "#7cb342",
      "accentHex": "#aed581",
      "activeMeshes": [
        "bleached_skeletons",
        "fenced_recovery_paddock",
        "migrating_antelope_herd",
        "thriving_bison_reserve"
      ]
    },
    "stageDescriptions": {
      "degraded": "Eroded dust bowl with no animal sightings.",
      "stabilizing": "Small breeding herds return to protected watering enclosures.",
      "restoring": "Vibrant migrations moving along ancestral paths.",
      "flourishing": "Vast savanna teeming with thousands of roaming wild ungulates."
    }
  }
] as const;

export const WILD_MERIDIAN_POLICIES: readonly PolicyDefinition[] = [
  {
    "id": "wild_meridian.solar_well_groundwater_pumping",
    "worldId": "wild-meridian",
    "name": "Solar Well Groundwater Pumping",
    "description": "Runs solar pumps to fill water troughs, eroding surrounding pasture from intense grazing.",
    "targetHazard": "watershed_depletion",
    "resourceCostsPerTick": {
      "stored_water": 2
    },
    "metricBenefitsPerTick": {
      "water": 2.4
    },
    "sideEffectsPerTick": {
      "vegetation": -0.5
    },
    "tradeoffSummary": "Guarantees animal drinking water but trampled vegetation surrounds wells."
  },
  {
    "id": "wild_meridian.rotational_grazing_enclosure",
    "worldId": "wild-meridian",
    "name": "Rotational Grazing Enclosure",
    "description": "Fences off denuded steppe to permit grass recovery, temporarily restricting wild herds.",
    "targetHazard": "canopy_fragmentation",
    "resourceCostsPerTick": {
      "field_energy": 2
    },
    "metricBenefitsPerTick": {
      "vegetation": 2
    },
    "sideEffectsPerTick": {
      "wildlife": -0.8
    },
    "tradeoffSummary": "Restores deep native grassland root systems while temporarily limiting herd grazing area."
  }
] as const;

export const WILD_MERIDIAN_NATIVE_ACTIONS: readonly NativeActionFamilyDefinition[] = [
  {
    "id": "wildMeridian.action.watering_hole_recharge",
    "worldId": "wild-meridian",
    "familyKey": "watering_hole_recharge",
    "name": "Watering Refuge Re-Hydration",
    "description": "Pump groundwater reserves into valley wetlands to relieve wildlife drought.",
    "readSet": [
      "water",
      "wildlife"
    ],
    "writeSet": [
      "water",
      "wildlife"
    ],
    "prerequisites": [
      {
        "field": "water",
        "condition": "<",
        "threshold": 35
      }
    ],
    "resourceCosts": [
      {
        "resource": "stored_water",
        "amount": 5
      },
      {
        "resource": "field_energy",
        "amount": 2
      }
    ],
    "deltas": [
      {
        "field": "water",
        "delta": 20,
        "unit": "ML"
      },
      {
        "field": "wildlife",
        "delta": 8,
        "unit": "index"
      }
    ],
    "decisionImplication": "Refills critical oasis water holes, preventing herd dispersal and death.",
    "dynamicHelp": "Recharge wetlands when valley water reserves drop below 35 ML."
  },
  {
    "id": "wildMeridian.action.scrubland_reseeding",
    "worldId": "wild-meridian",
    "familyKey": "scrubland_reseeding",
    "name": "Ecological Disturbance Containment",
    "description": "Broadcast drought-hardy seeds to knit eroding soil and restore scrub cover.",
    "readSet": [
      "vegetation",
      "water"
    ],
    "writeSet": [
      "vegetation",
      "water"
    ],
    "prerequisites": [
      {
        "field": "vegetation",
        "condition": "<",
        "threshold": 40
      }
    ],
    "resourceCosts": [
      {
        "resource": "seed_stock",
        "amount": 4
      },
      {
        "resource": "stored_water",
        "amount": 2
      }
    ],
    "deltas": [
      {
        "field": "vegetation",
        "delta": 18,
        "unit": "%"
      },
      {
        "field": "water",
        "delta": 4,
        "unit": "ML"
      }
    ],
    "decisionImplication": "Stabilizes fragile topsoil against desertification, consuming seed banks.",
    "dynamicHelp": "Reseed terrain when scrubland vegetation density drops below 40%."
  },
  {
    "id": "wildMeridian.action.migration_corridor_fencing",
    "worldId": "wild-meridian",
    "familyKey": "migration_corridor_fencing",
    "name": "Migration Corridor Protection",
    "description": "Establish acoustic boundary perimeters to steer herds away from dry basins.",
    "readSet": [
      "wildlife",
      "vegetation"
    ],
    "writeSet": [
      "wildlife",
      "vegetation"
    ],
    "prerequisites": [
      {
        "field": "wildlife",
        "condition": "<",
        "threshold": 45
      }
    ],
    "resourceCosts": [
      {
        "resource": "field_energy",
        "amount": 4
      },
      {
        "resource": "seed_stock",
        "amount": 2
      }
    ],
    "deltas": [
      {
        "field": "wildlife",
        "delta": 16,
        "unit": "index"
      },
      {
        "field": "vegetation",
        "delta": 4,
        "unit": "%"
      }
    ],
    "decisionImplication": "Protects endangered megafauna migration routes through active field guidance.",
    "dynamicHelp": "Activate perimeter fences when wildlife health index drops below 45."
  }
] as const;


export const WILD_MERIDIAN_INSTRUMENTS: readonly ScientificInstrumentConfig[] = [{
  "id": "wildMeridian.instrument.ecotag_monitor",
  "worldId": "wild-meridian",
  "name": "Silent Valley Wildlife & Hydro Monitor",
  "description": "Tracks regional aquifer volume, scrubland canopy, and migratory herd indices.",
  "deviceClass": "environmental_sampler",
  "sampleCost": [
    {
      "resource": "field_energy",
      "amount": 1
    }
  ],
  "calibrationCost": [
    {
      "resource": "seed_stock",
      "amount": 2
    }
  ],
  "channels": [
    {
      "id": "water",
      "name": "Aquifer Reserve Volume",
      "unit": "ML",
      "minValid": 0,
      "maxValid": 100,
      "basePrecision": 0.2
    },
    {
      "id": "vegetation",
      "name": "Scrubland Foliage Density",
      "unit": "%",
      "minValid": 0,
      "maxValid": 100,
      "basePrecision": 0.1
    },
    {
      "id": "wildlife",
      "name": "Megafauna Population Index",
      "unit": "index",
      "minValid": 0,
      "maxValid": 100,
      "basePrecision": 0.2
    }
  ]
}] as const;


export const wildMeridianFeatureModule = new StandardWorldFeatureModule({
  instruments: WILD_MERIDIAN_INSTRUMENTS,
  nativeActions: WILD_MERIDIAN_NATIVE_ACTIONS,
  worldId: 'wild-meridian',
  capabilities: WILD_MERIDIAN_CAPABILITIES,
  hazardNodes: WILD_MERIDIAN_HAZARD_NODES,
  hazardLinks: WILD_MERIDIAN_HAZARD_LINKS,
  initialBudget: {
    stored_water: { balance: 50, capacity: 100, replenishmentRate: 1.0 },
    seed_stock: { balance: 40, capacity: 80, replenishmentRate: 0.5 },
    field_energy: { balance: 60, capacity: 120, replenishmentRate: 1.5 },
  },
  actionCosts: {
    'wildMeridian.action.watering_hole_recharge': [
      { resource: 'stored_water', amount: 12 },
      { resource: 'field_energy', amount: 8 },
    ],
    'wildMeridian.action.scrubland_reseeding': [
      { resource: 'seed_stock', amount: 10 },
      { resource: 'stored_water', amount: 6 },
    ],
    'wildMeridian.action.migration_corridor_fencing': [
      { resource: 'field_energy', amount: 15 },
      { resource: 'seed_stock', amount: 5 },
    ],
  },
  actionDeltas: {
    'wildMeridian.action.watering_hole_recharge': [
      { field: 'water', delta: 20, unit: 'volume' },
    ],
    'wildMeridian.action.scrubland_reseeding': [
      { field: 'vegetation', delta: 25, unit: 'index' },
    ],
    'wildMeridian.action.migration_corridor_fencing': [
      { field: 'wildlife', delta: 20, unit: 'index' },
    ],
  },
  metricKeys: ['water', 'vegetation', 'wildlife'],
  facilityDefinitions: [
    {
      "typeId": "migration_refuge",
      "worldId": "wild-meridian",
      "name": "Riparian Migration Refuge",
      "description": "Protected wildlife sanctuary safeguarding endangered migratory corridors.",
      "buildMaterialsCost": [
        {
          "resource": "stored_water",
          "amount": 8
        },
        {
          "resource": "seed_stock",
          "amount": 5
        }
      ],
      "buildTicks": 3,
      "upkeepCost": [
        {
          "resource": "stored_water",
          "amount": 1
        }
      ],
      "benefitMetric": "faunaIntegrity",
      "benefitDeltaPerTick": 2
    },
    {
      "typeId": "waterway_restoration",
      "worldId": "wild-meridian",
      "name": "Restored Valley Waterway",
      "description": "Engineered culverts and flow channels sustaining perennial stream flow.",
      "buildMaterialsCost": [
        {
          "resource": "field_energy",
          "amount": 8
        },
        {
          "resource": "stored_water",
          "amount": 6
        }
      ],
      "buildTicks": 4,
      "upkeepCost": [
        {
          "resource": "field_energy",
          "amount": 1
        }
      ],
      "benefitMetric": "streamFlow",
      "benefitDeltaPerTick": 1.5
    }
  ],
  initialDepots: [
    {
      "siteId": "site-refuge",
      "capacity": 100,
      "inventory": {
        "stored_water": 30,
        "seed_stock": 25,
        "field_energy": 35
      }
    },
    {
      "siteId": "site-pass",
      "capacity": 100,
      "inventory": {
        "stored_water": 20,
        "seed_stock": 15,
        "field_energy": 25
      }
    }
  ],
  initialCouriers: [
    {
      "id": "courier-meridian-1",
      "name": "Valley Scout Rover",
      "carrierType": "ground_rover",
      "capacity": 30,
      "speed": 1,
      "location": "site-refuge",
      "currentCargo": {},
      "status": "idle",
      "condition": 100,
      "fuel": 50
    }
  ],
  initialRoutes: [
    {
      "fromSiteId": "site-refuge",
      "toSiteId": "site-pass",
      "travelTicks": 2,
      "fuelCost": 1
    }
  ],
  emergencies: WILD_MERIDIAN_EMERGENCIES,
  restorationLayers: WILD_MERIDIAN_RESTORATION_LAYERS,
  policies: WILD_MERIDIAN_POLICIES,
});
