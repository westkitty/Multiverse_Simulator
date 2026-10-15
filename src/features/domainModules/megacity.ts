import { EmergencyDefinition,
  FeatureCapability,
  PolicyDefinition,
  RestorationLayerDefinition, HazardLink, HazardNode } from '../contracts';
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


export const MEGACITY_EMERGENCIES: readonly EmergencyDefinition[] = [
  {
    "id": "megacity.grid_collapse",
    "worldId": "megacity",
    "name": "Cascading District Power & Pumping Collapse",
    "description": "Substation trip disabling stormwater drainage and isolating sectors.",
    "triggerMetric": "cityLivabilityIndex",
    "triggerOperator": "<",
    "precursorThreshold": 45,
    "activeThreshold": 25,
    "escalateDelayTicks": 4,
    "containmentActionIds": [
      "megacity.action.substation_restart"
    ],
    "consequences": {
      "metricPenaltiesPerTick": {
        "totalHousingCapacityK": 5,
        "meanPollutionAqi": 4
      },
      "budgetDrainPerTick": {
        "district_fuel": 2
      },
      "secondaryHazardNodeId": "drainage_pump_failure",
      "description": "Submerged electrical vaults trigger blackouts and displace thousands."
    }
  }
] as const;

export const MEGACITY_RESTORATION_LAYERS: readonly RestorationLayerDefinition[] = [
  {
    "id": "transit_corridors",
    "name": "Transit Corridor Drainage",
    "metricKey": "cityLivabilityIndex",
    "baselineValue": 20,
    "targetValue": 85,
    "visualElements": {
      "materialColor": "#ffb300",
      "accentHex": "#ffe082",
      "activeMeshes": [
        "gridlocked_debris",
        "cleared_expressway",
        "maglev_elevated_line",
        "automated_transit_artery"
      ]
    },
    "stageDescriptions": {
      "degraded": "Flooded subterranean tracks and impassable drowned highways.",
      "stabilizing": "High-capacity pump trucks clear major tunnel choke points.",
      "restoring": "Automated maglev shuttles resume regular commuter schedules.",
      "flourishing": "Silent, hyper-connected transit arteries humming across city tiers."
    }
  },
  {
    "id": "facade_illumination",
    "name": "Arcology Facade Illumination",
    "metricKey": "totalHousingCapacityK",
    "baselineValue": 50,
    "targetValue": 200,
    "visualElements": {
      "materialColor": "#00e676",
      "accentHex": "#b9f6ca",
      "activeMeshes": [
        "darkened_spires",
        "isolated_emergency_clusters",
        "glowing_facade_grid",
        "pulsing_cybernetic_megalopolis"
      ]
    },
    "stageDescriptions": {
      "degraded": "Pitch-black monolithic skyscrapers towering in darkness.",
      "stabilizing": "Emergency generators restore light to primary residential lobbies.",
      "restoring": "Luminescent facade panels glow across mid-level tiers.",
      "flourishing": "Dazzling neon megalopolis vibrant with life and activity."
    }
  }
] as const;

export const MEGACITY_POLICIES: readonly PolicyDefinition[] = [
  {
    "id": "megacity.backup_generator_substation_fueling",
    "worldId": "megacity",
    "name": "Backup Generator Substation Fueling",
    "description": "Fires diesel turbine generators to power arcologies, spiking regional smog.",
    "targetHazard": "substation_blackout",
    "resourceCostsPerTick": {
      "district_fuel": 3
    },
    "metricBenefitsPerTick": {
      "cityLivabilityIndex": 3.5
    },
    "sideEffectsPerTick": {
      "meanPollutionAqi": 5
    },
    "tradeoffSummary": "Rapid power restoration at heavy fuel expenditure, generating heavy air pollution."
  },
  {
    "id": "megacity.subway_sluice_pump_override",
    "worldId": "megacity",
    "name": "Subway Sluice Pump Override",
    "description": "Forces drainage pumps beyond rated duty cycles to save flooded housing sectors.",
    "targetHazard": "drainage_pump_failure",
    "resourceCostsPerTick": {
      "spare_parts": 2
    },
    "metricBenefitsPerTick": {
      "totalHousingCapacityK": 6
    },
    "sideEffectsPerTick": {
      "cityLivabilityIndex": -1
    },
    "tradeoffSummary": "Saves flooded apartments while straining municipal mechanical components."
  }
] as const;

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
  facilityDefinitions: [
    {
      "typeId": "substation",
      "worldId": "megacity",
      "name": "District Utility Substation",
      "description": "High-voltage grid substation stabilizing metropolitan energy networks.",
      "buildMaterialsCost": [
        {
          "resource": "district_fuel",
          "amount": 8
        },
        {
          "resource": "spare_parts",
          "amount": 6
        }
      ],
      "buildTicks": 3,
      "upkeepCost": [
        {
          "resource": "district_fuel",
          "amount": 1
        }
      ],
      "benefitMetric": "infrastructureHealth",
      "benefitDeltaPerTick": 2
    },
    {
      "typeId": "water_pump",
      "worldId": "megacity",
      "name": "Municipal Water Conduit Pump",
      "description": "Restores hydraulic pressure across subterranean water utility lines.",
      "buildMaterialsCost": [
        {
          "resource": "municipal_stock",
          "amount": 10
        },
        {
          "resource": "spare_parts",
          "amount": 5
        }
      ],
      "buildTicks": 4,
      "upkeepCost": [
        {
          "resource": "spare_parts",
          "amount": 1
        }
      ],
      "benefitMetric": "waterHeadPressure",
      "benefitDeltaPerTick": 1.5
    }
  ],
  initialDepots: [
    {
      "siteId": "site-utility",
      "capacity": 100,
      "inventory": {
        "district_fuel": 30,
        "spare_parts": 25,
        "municipal_stock": 40
      }
    },
    {
      "siteId": "site-blackout",
      "capacity": 100,
      "inventory": {
        "district_fuel": 20,
        "spare_parts": 15,
        "municipal_stock": 20
      }
    }
  ],
  initialCouriers: [
    {
      "id": "courier-city-1",
      "name": "District Freight Hauler",
      "carrierType": "field_hauler",
      "capacity": 40,
      "speed": 1,
      "location": "site-utility",
      "currentCargo": {},
      "status": "idle",
      "condition": 100,
      "fuel": 50
    }
  ],
  initialRoutes: [
    {
      "fromSiteId": "site-utility",
      "toSiteId": "site-blackout",
      "travelTicks": 2,
      "fuelCost": 1
    }
  ],
  emergencies: MEGACITY_EMERGENCIES,
  restorationLayers: MEGACITY_RESTORATION_LAYERS,
  policies: MEGACITY_POLICIES,
});
