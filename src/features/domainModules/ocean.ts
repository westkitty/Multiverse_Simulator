import { EmergencyDefinition,
  FeatureCapability,
  PolicyDefinition,
  RestorationLayerDefinition, HazardLink, HazardNode } from '../contracts';
import { StandardWorldFeatureModule } from './domainHelper';

export const OCEAN_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'ocean.action.aeration_upwelling',
    featureId: 'P001',
    name: 'Aeration Upwelling',
    description: 'Trigger deep benthic bubblers to inject dissolved O2 into dead zones.',
    minRulesVersion: 1,
    domainUnits: ['meanSurfaceOxygenMgL'],
    costResource: 'oxygenation_capacity',
  },
  {
    id: 'ocean.action.alkalinity_injection',
    featureId: 'P001',
    name: 'Alkalinity Injection',
    description: 'Release mineralized lime buffers to halt ocean acidification.',
    minRulesVersion: 1,
    domainUnits: ['meanCarbonatePh'],
    costResource: 'nutrient_reserve',
  },
  {
    id: 'ocean.action.benthic_restoration',
    featureId: 'P001',
    name: 'Benthic Restoration',
    description: 'Deploy autonomous seedings to replenish depleted abyssal nutrients.',
    minRulesVersion: 1,
    domainUnits: ['meanSurfaceNutrientsUmol'],
    costResource: 'rov_power',
  },
  {
    id: 'ocean.hazard.monitoring',
    featureId: 'P002',
    name: 'Ocean Hazard Monitoring',
    description: 'Ordered hazard dependency graph for ocean: oxygen depletion -> habitat damage -> ecological feedback.',
    minRulesVersion: 1,
    domainUnits: ['hazard-index'],
  },
  {
    id: 'ocean.conservation.ledger',
    featureId: 'P003',
    name: 'Ocean Conservation Ledger',
    description: 'Resource-accountable conservation ledger enforcing finite non-negative balances for ocean.',
    minRulesVersion: 1,
    costResource: 'oxygenation_capacity',
  },
  {
    id: 'ocean.signature.destination',
    featureId: 'P011',
    name: 'The Drowned Listening Garden',
    description: 'Authored signature destination for ocean: The Drowned Listening Garden.',
    minRulesVersion: 1,
  },
];

export const OCEAN_HAZARD_NODES: readonly HazardNode[] = [
  {
    id: 'hypoxic_deadzone',
    label: 'Hypoxic Deadzone',
    worldId: 'ocean',
    sourceMetric: 'meanSurfaceOxygenMgL',
    targetMetric: 'meanSurfaceOxygenMgL',
    threshold: 4,
    operator: '<',
    severity: 'warning',
    upstreamNodeIds: [],
    mitigationActionFamily: 'ocean.action.aeration_upwelling',
    description: 'Dissolved oxygen falls below marine survival threshold',
    observedTriggerTemplate: 'Dissolved oxygen ({value} mg/L) dropped below {threshold} mg/L',
    hypothesizedExplanation: 'Thermal stratification arresting vertical circulation of oxygenated surface water',
  },
  {
    id: 'carbonate_acidification',
    label: 'Carbonate Acidification',
    worldId: 'ocean',
    sourceMetric: 'meanCarbonatePh',
    targetMetric: 'meanCarbonatePh',
    threshold: 7.8,
    operator: '<',
    severity: 'critical',
    upstreamNodeIds: ['hypoxic_deadzone'],
    mitigationActionFamily: 'ocean.action.alkalinity_injection',
    description: 'Ocean carbonate pH collapse dissolves calcifying marine organisms',
    observedTriggerTemplate: 'Carbonate pH ({value}) dropped below {threshold}',
    hypothesizedExplanation: 'Anaerobic microbial decay releasing acidic compounds that deplete carbonate saturation',
  },
  {
    id: 'ecological_collapse',
    label: 'Ecological Collapse',
    worldId: 'ocean',
    sourceMetric: 'meanSurfaceNutrientsUmol',
    targetMetric: 'meanSurfaceNutrientsUmol',
    threshold: 5,
    operator: '<',
    severity: 'catastrophic',
    upstreamNodeIds: ['carbonate_acidification'],
    mitigationActionFamily: 'ocean.action.benthic_restoration',
    description: 'Primary nutrient web crashes, sterilizing the water column',
    observedTriggerTemplate: 'Surface nutrients ({value} umol) dropped below {threshold} umol',
    hypothesizedExplanation: 'Loss of benthic microbial communities halting nutrient recycling cycles',
  },
];

export const OCEAN_HAZARD_LINKS: readonly HazardLink[] = [
  {
    fromNodeId: 'hypoxic_deadzone',
    toNodeId: 'carbonate_acidification',
    causalLinkType: 'direct',
    description: 'Hypoxia drives anaerobic decomposition, releasing organic acids that depress pH',
  },
  {
    fromNodeId: 'carbonate_acidification',
    toNodeId: 'ecological_collapse',
    causalLinkType: 'dependency',
    description: 'Acidic water inhibits shell formation and causes planktonic collapse',
  },
];


export const OCEAN_EMERGENCIES: readonly EmergencyDefinition[] = [
  {
    "id": "ocean.abyssal_hypoxia",
    "worldId": "ocean",
    "name": "Abyssal Hypoxia Deadzone Cascade",
    "description": "Surface deoxygenation plunging benthic trenches into anoxic die-offs.",
    "triggerMetric": "meanSurfaceOxygenMgL",
    "triggerOperator": "<",
    "precursorThreshold": 5,
    "activeThreshold": 3,
    "escalateDelayTicks": 4,
    "containmentActionIds": [
      "ocean.action.aeration"
    ],
    "consequences": {
      "metricPenaltiesPerTick": {
        "meanCarbonatePh": 0.05,
        "meanSurfaceNutrientsUmol": 2
      },
      "budgetDrainPerTick": {
        "oxygenation_capacity": 1
      },
      "secondaryHazardNodeId": "carbonate_acidification",
      "description": "Deadzone expansion acidifies the water column and chokes pelagic life."
    }
  }
] as const;

export const OCEAN_RESTORATION_LAYERS: readonly RestorationLayerDefinition[] = [
  {
    "id": "bioluminescent_reef",
    "name": "Bioluminescent Reef Vitality",
    "metricKey": "meanSurfaceOxygenMgL",
    "baselineValue": 2,
    "targetValue": 9,
    "visualElements": {
      "materialColor": "#00bcd4",
      "accentHex": "#80deea",
      "activeMeshes": [
        "bleached_coral",
        "algal_turf",
        "glowing_anemone",
        "vibrant_atoll"
      ]
    },
    "stageDescriptions": {
      "degraded": "Ghostly white bleached coral skeletons covered in gray slime.",
      "stabilizing": "Fluorescent polyps spark to life along the outer reef crest.",
      "restoring": "Luminous branching corals illuminate the ocean floor.",
      "flourishing": "Kaleidoscopic underwater garden teeming with glowing pelagic fauna."
    }
  },
  {
    "id": "water_clarity",
    "name": "Pelagic Water Clarity",
    "metricKey": "meanCarbonatePh",
    "baselineValue": 7.4,
    "targetValue": 8.3,
    "visualElements": {
      "materialColor": "#00838f",
      "accentHex": "#4dd0e1",
      "activeMeshes": [
        "turbid_silt",
        "filtered_shallows",
        "clear_photic_zone",
        "crystalline_abyss"
      ]
    },
    "stageDescriptions": {
      "degraded": "Opaque, acidic murky water choked with decomposing detritus.",
      "stabilizing": "Filter feeders reduce surface turbidity in sheltered bays.",
      "restoring": "Sunlight penetrates deep into the photic zone.",
      "flourishing": "Crystal-clear sapphire depths with pristine visibility."
    }
  }
] as const;

export const OCEAN_POLICIES: readonly PolicyDefinition[] = [
  {
    "id": "ocean.deep_sea_oxygen_venting",
    "worldId": "ocean",
    "name": "Deep-Sea Oxygen Venting",
    "description": "Injects gaseous oxygen directly into the thermocline, causing mild localized acidification.",
    "targetHazard": "hypoxic_deadzone",
    "resourceCostsPerTick": {
      "oxygenation_capacity": 3
    },
    "metricBenefitsPerTick": {
      "meanSurfaceOxygenMgL": 0.35
    },
    "sideEffectsPerTick": {
      "meanCarbonatePh": -0.02
    },
    "tradeoffSummary": "Prevents massive fish die-offs while slightly increasing water acidity."
  },
  {
    "id": "ocean.macroalgae_nutrient_pulse",
    "worldId": "ocean",
    "name": "Macroalgae Nutrient Pulse",
    "description": "Feeds calcifying kelp forests to stabilize pH, temporarily absorbing dissolved O2.",
    "targetHazard": "carbonate_acidification",
    "resourceCostsPerTick": {
      "nutrient_reserve": 2
    },
    "metricBenefitsPerTick": {
      "meanCarbonatePh": 0.04
    },
    "sideEffectsPerTick": {
      "meanSurfaceOxygenMgL": -0.1
    },
    "tradeoffSummary": "Rebuilds coral calcification integrity at the cost of oxygen draw."
  }
] as const;

export const oceanFeatureModule = new StandardWorldFeatureModule({
  worldId: 'ocean',
  capabilities: OCEAN_CAPABILITIES,
  hazardNodes: OCEAN_HAZARD_NODES,
  hazardLinks: OCEAN_HAZARD_LINKS,
  initialBudget: {
    oxygenation_capacity: { balance: 40, capacity: 80, replenishmentRate: 0.5 },
    nutrient_reserve: { balance: 50, capacity: 100, replenishmentRate: 1.0 },
    rov_power: { balance: 80, capacity: 150, replenishmentRate: 2.0 },
  },
  actionCosts: {
    'ocean.action.aeration_upwelling': [
      { resource: 'oxygenation_capacity', amount: 8 },
      { resource: 'rov_power', amount: 10 },
    ],
    'ocean.action.alkalinity_injection': [
      { resource: 'nutrient_reserve', amount: 10 },
      { resource: 'rov_power', amount: 15 },
    ],
    'ocean.action.benthic_restoration': [
      { resource: 'nutrient_reserve', amount: 12 },
      { resource: 'oxygenation_capacity', amount: 10 },
    ],
  },
  actionDeltas: {
    'ocean.action.aeration_upwelling': [
      { field: 'meanSurfaceOxygenMgL', delta: 2.5, unit: 'mg/L' },
    ],
    'ocean.action.alkalinity_injection': [
      { field: 'meanCarbonatePh', delta: 0.3, unit: 'pH' },
    ],
    'ocean.action.benthic_restoration': [
      { field: 'meanSurfaceNutrientsUmol', delta: 8, unit: 'umol' },
    ],
  },
  metricKeys: ['meanSurfaceOxygenMgL', 'meanCarbonatePh', 'meanSurfaceNutrientsUmol'],
  facilityDefinitions: [
    {
      "typeId": "oxygenation_module",
      "worldId": "ocean",
      "name": "Benthic Oxygenation Module",
      "description": "Aerates hypoxic dead zones and elevates dissolved oxygen levels.",
      "buildMaterialsCost": [
        {
          "resource": "oxygenation_capacity",
          "amount": 5
        },
        {
          "resource": "rov_power",
          "amount": 10
        }
      ],
      "buildTicks": 3,
      "upkeepCost": [
        {
          "resource": "rov_power",
          "amount": 1
        }
      ],
      "benefitMetric": "dissolvedOxygenMgL",
      "benefitDeltaPerTick": 2
    },
    {
      "typeId": "reef_nursery",
      "worldId": "ocean",
      "name": "Benthic Reef Nursery",
      "description": "Nurtures coral micro-colonies and accelerates benthic structural health.",
      "buildMaterialsCost": [
        {
          "resource": "nutrient_reserve",
          "amount": 6
        },
        {
          "resource": "rov_power",
          "amount": 8
        }
      ],
      "buildTicks": 4,
      "upkeepCost": [
        {
          "resource": "nutrient_reserve",
          "amount": 1
        }
      ],
      "benefitMetric": "coralBenthicHealth",
      "benefitDeltaPerTick": 1.5
    }
  ],
  initialDepots: [
    {
      "siteId": "site-rov-dock",
      "capacity": 100,
      "inventory": {
        "oxygenation_capacity": 25,
        "nutrient_reserve": 30,
        "rov_power": 50
      }
    },
    {
      "siteId": "site-deep-reef",
      "capacity": 100,
      "inventory": {
        "oxygenation_capacity": 15,
        "nutrient_reserve": 20,
        "rov_power": 30
      }
    }
  ],
  initialCouriers: [
    {
      "id": "courier-ocean-1",
      "name": "Submersible Crawler 1",
      "carrierType": "sub_crawler",
      "capacity": 35,
      "speed": 1,
      "location": "site-rov-dock",
      "currentCargo": {},
      "status": "idle",
      "condition": 100,
      "fuel": 60
    }
  ],
  initialRoutes: [
    {
      "fromSiteId": "site-rov-dock",
      "toSiteId": "site-deep-reef",
      "travelTicks": 3,
      "fuelCost": 1
    }
  ],
  emergencies: OCEAN_EMERGENCIES,
  restorationLayers: OCEAN_RESTORATION_LAYERS,
  policies: OCEAN_POLICIES,
});
