import {
  NativeActionFamilyDefinition,
  ScientificInstrumentConfig, EmergencyDefinition,
  FeatureCapability,
  PolicyDefinition,
  RestorationLayerDefinition, HazardLink, HazardNode } from '../contracts';
import { StandardWorldFeatureModule } from './domainHelper';

export const HOLLOW_DEEP_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'hollowDeep.action.aquifer_sump_drainage',
    featureId: 'P001',
    name: 'Aquifer Sump Drainage',
    description: 'Engage high-pressure submersible pumps to clear flooded cavern levels.',
    minRulesVersion: 1,
    domainUnits: ['water'],
    costResource: 'vent_energy',
  },
  {
    id: 'hollowDeep.action.methane_vent_flaring',
    featureId: 'P001',
    name: 'Methane Vent Flaring',
    description: 'Ignite controlled vent flares to dispel explosive chokedamp pockets.',
    minRulesVersion: 1,
    domainUnits: ['gas'],
    costResource: 'vent_energy',
  },
  {
    id: 'hollowDeep.action.acoustic_rockbolt_installation',
    featureId: 'P001',
    name: 'Acoustic Rockbolt Installation',
    description: 'Drive hydraulic expansion rockbolts to brace fractured ceiling pillars.',
    minRulesVersion: 1,
    domainUnits: ['stress'],
    costResource: 'bracing',
  },
  {
    id: 'hollowDeep.hazard.monitoring',
    featureId: 'P002',
    name: 'Hollow Deep Hazard Monitoring',
    description: 'Ordered hazard dependency graph for hollow-deep: aquifer pressure -> gas buildup -> structural collapse.',
    minRulesVersion: 1,
    domainUnits: ['hazard-index'],
  },
  {
    id: 'hollowDeep.conservation.ledger',
    featureId: 'P003',
    name: 'Hollow Deep Conservation Ledger',
    description: 'Resource-accountable conservation ledger enforcing finite non-negative balances for hollow-deep.',
    minRulesVersion: 1,
    costResource: 'bracing',
  },
  {
    id: 'hollowDeep.signature.destination',
    featureId: 'P011',
    name: 'Cathedral Below',
    description: 'Authored signature destination for hollow-deep: Cathedral Below.',
    minRulesVersion: 1,
  },
];

export const HOLLOW_DEEP_HAZARD_NODES: readonly HazardNode[] = [
  {
    id: 'aquifer_inundation',
    label: 'Aquifer Inundation',
    worldId: 'hollow-deep',
    sourceMetric: 'water',
    targetMetric: 'water',
    threshold: 75,
    operator: '>',
    severity: 'warning',
    upstreamNodeIds: [],
    mitigationActionFamily: 'hollowDeep.action.aquifer_sump_drainage',
    description: 'Subterranean water tables overwhelm sump drainage capacity',
    observedTriggerTemplate: 'Cavern water level ({value}) exceeded {threshold}',
    hypothesizedExplanation: 'Breached subterranean karst aquifers flooding lower galleries',
  },
  {
    id: 'choke_damp_accumulation',
    label: 'Chokedamp Accumulation',
    worldId: 'hollow-deep',
    sourceMetric: 'gas',
    targetMetric: 'gas',
    threshold: 70,
    operator: '>',
    severity: 'critical',
    upstreamNodeIds: ['aquifer_inundation'],
    mitigationActionFamily: 'hollowDeep.action.methane_vent_flaring',
    description: 'Rising water displaces toxic methane and CO2 into transit tunnels',
    observedTriggerTemplate: 'Toxic gas concentration ({value}) exceeded {threshold}',
    hypothesizedExplanation: 'Inundation displacing dense pocket gases into ventilation shafts',
  },
  {
    id: 'pillar_crush',
    label: 'Pillar Crush',
    worldId: 'hollow-deep',
    sourceMetric: 'stress',
    targetMetric: 'stress',
    threshold: 80,
    operator: '>',
    severity: 'catastrophic',
    upstreamNodeIds: ['choke_damp_accumulation'],
    mitigationActionFamily: 'hollowDeep.action.acoustic_rockbolt_installation',
    description: 'Pore pressure and rock fatigue cause massive ceiling collapses',
    observedTriggerTemplate: 'Ceiling structural stress ({value}) exceeded {threshold}',
    hypothesizedExplanation: 'Hydrostatic pressure weakening support pillars, inducing rockburst collapses',
  },
];

export const HOLLOW_DEEP_HAZARD_LINKS: readonly HazardLink[] = [
  {
    fromNodeId: 'aquifer_inundation',
    toNodeId: 'choke_damp_accumulation',
    causalLinkType: 'direct',
    description: 'Rising flood waters force heavy toxic gases into inhabited galleries',
  },
  {
    fromNodeId: 'choke_damp_accumulation',
    toNodeId: 'pillar_crush',
    causalLinkType: 'dependency',
    description: 'Acidic gas pockets and water saturation weaken load-bearing rock pillars',
  },
];


export const HOLLOW_DEEP_EMERGENCIES: readonly EmergencyDefinition[] = [
  {
    "id": "hollow_deep.chasm_subsidence",
    "worldId": "hollow-deep",
    "name": "Cavern Aquifer Surge & Roof Collapse",
    "description": "Pressurized aquifer breaching limestone vaults and drowning lower galleries.",
    "triggerMetric": "water",
    "triggerOperator": ">",
    "precursorThreshold": 65,
    "activeThreshold": 85,
    "escalateDelayTicks": 4,
    "containmentActionIds": [
      "hollow_deep.action.bracing"
    ],
    "consequences": {
      "metricPenaltiesPerTick": {
        "stress": 2.5,
        "gas": 1.5
      },
      "budgetDrainPerTick": {
        "bracing": 1
      },
      "secondaryHazardNodeId": "pillar_crush",
      "description": "Waterlogged ceilings buckle under hydrostatic load, releasing toxic damp."
    }
  }
] as const;

export const HOLLOW_DEEP_RESTORATION_LAYERS: readonly RestorationLayerDefinition[] = [
  {
    "id": "cavern_buttresses",
    "name": "Cathedral Pillar Buttresses",
    "metricKey": "stress",
    "baselineValue": 90,
    "targetValue": 15,
    "visualElements": {
      "materialColor": "#5d4037",
      "accentHex": "#8d6e63",
      "activeMeshes": [
        "spalling_limestone_roof",
        "timber_cribbing_post",
        "reinforced_arch_strut",
        "impenetrable_granite_colonnade"
      ]
    },
    "stageDescriptions": {
      "degraded": "Shearing stalactites and groaning stone pillars on the verge of collapse.",
      "stabilizing": "Heavy timber cribbing erected to halt immediate roof settling.",
      "restoring": "Arched masonry buttresses distribute overburden weight safely.",
      "flourishing": "Majestic, indestructible subterranean vault supported by soaring colonnades."
    }
  },
  {
    "id": "siphon_drainage",
    "name": "Subterranean Siphon Drainage",
    "metricKey": "water",
    "baselineValue": 90,
    "targetValue": 20,
    "visualElements": {
      "materialColor": "#00acc1",
      "accentHex": "#4dd0e1",
      "activeMeshes": [
        "submerged_tunnels",
        "rotary_slurry_pump",
        "gravity_siphon_conduit",
        "dry_paved_catacomb_way"
      ]
    },
    "stageDescriptions": {
      "degraded": "Murky subterranean floods completely submerging historic pathways.",
      "stabilizing": "High-volume pumps clear access through high water traps.",
      "restoring": "Continuous gravity siphons direct drainage into abyssal sumps.",
      "flourishing": "Dry, echoing paved walkways throughout the monumental underground cavern."
    }
  }
] as const;

export const HOLLOW_DEEP_POLICIES: readonly PolicyDefinition[] = [
  {
    "id": "hollow_deep.methane_vent_flaring",
    "worldId": "hollow-deep",
    "name": "Methane Vent Flaring",
    "description": "Ignites gas pockets to reduce explosion risk, causing thermal spalling in ceiling stone.",
    "targetHazard": "choke_damp_accumulation",
    "resourceCostsPerTick": {
      "vent_energy": 3
    },
    "metricBenefitsPerTick": {
      "gas": -3.5
    },
    "sideEffectsPerTick": {
      "stress": 1
    },
    "tradeoffSummary": "Safely purges explosive gas at the cost of inducing thermal stress fractures in rock."
  },
  {
    "id": "hollow_deep.heavy_hydraulic_underpinning",
    "worldId": "hollow-deep",
    "name": "Heavy Hydraulic Underpinning",
    "description": "Jacks heavy steel pillars beneath unstable spans, disturbing subterranean water veins.",
    "targetHazard": "pillar_crush",
    "resourceCostsPerTick": {
      "bracing": 3
    },
    "metricBenefitsPerTick": {
      "stress": -4
    },
    "sideEffectsPerTick": {
      "water": 1.5
    },
    "tradeoffSummary": "Stops cavern roof collapses while puncturing minor water-bearing strata."
  }
] as const;

export const HOLLOW_DEEP_NATIVE_ACTIONS: readonly NativeActionFamilyDefinition[] = [
  {
    "id": "hollowDeep.action.aquifer_sump_drainage",
    "worldId": "hollow-deep",
    "familyKey": "aquifer_sump_drainage",
    "name": "Aquifer Sump Regulation",
    "description": "Activate high-head sump pumps to dewater submerged passages.",
    "readSet": [
      "water",
      "stress"
    ],
    "writeSet": [
      "water",
      "stress"
    ],
    "prerequisites": [
      {
        "field": "water",
        "condition": ">",
        "threshold": 50
      }
    ],
    "resourceCosts": [
      {
        "resource": "vent_energy",
        "amount": 5
      },
      {
        "resource": "bracing",
        "amount": 2
      }
    ],
    "deltas": [
      {
        "field": "water",
        "delta": -22,
        "unit": "m3"
      },
      {
        "field": "stress",
        "delta": 4,
        "unit": "kPa"
      }
    ],
    "decisionImplication": "Drains flooded transit tunnels at significant pumping energy expenditure.",
    "dynamicHelp": "Pump sumps when cave water levels exceed 50 m3 to keep survey routes passable."
  },
  {
    "id": "hollowDeep.action.methane_vent_flaring",
    "worldId": "hollow-deep",
    "familyKey": "methane_vent_flaring",
    "name": "Gas Pocket Flaring & Venting",
    "description": "Purge and flare toxic gas pockets before explosive thresholds are reached.",
    "readSet": [
      "gas",
      "stress"
    ],
    "writeSet": [
      "gas",
      "stress"
    ],
    "prerequisites": [
      {
        "field": "gas",
        "condition": ">",
        "threshold": 45
      }
    ],
    "resourceCosts": [
      {
        "resource": "vent_energy",
        "amount": 4
      },
      {
        "resource": "water_reserve",
        "amount": 2
      }
    ],
    "deltas": [
      {
        "field": "gas",
        "delta": -25,
        "unit": "ppm"
      },
      {
        "field": "stress",
        "delta": -3,
        "unit": "kPa"
      }
    ],
    "decisionImplication": "Neutralizes explosive methane pockets, preventing catastrophic cave-in sparks.",
    "dynamicHelp": "Vent gas pockets when methane levels exceed 45 ppm."
  },
  {
    "id": "hollowDeep.action.acoustic_rockbolt_installation",
    "worldId": "hollow-deep",
    "familyKey": "acoustic_rockbolt_installation",
    "name": "Passage Bracing & Rockbolting",
    "description": "Drill pre-stressed steel rockbolts into fracture zones to prevent roof collapse.",
    "readSet": [
      "stress",
      "water"
    ],
    "writeSet": [
      "stress",
      "water"
    ],
    "prerequisites": [
      {
        "field": "stress",
        "condition": ">",
        "threshold": 55
      }
    ],
    "resourceCosts": [
      {
        "resource": "bracing",
        "amount": 5
      },
      {
        "resource": "water_reserve",
        "amount": 2
      }
    ],
    "deltas": [
      {
        "field": "stress",
        "delta": -25,
        "unit": "kPa"
      },
      {
        "field": "water",
        "delta": -4,
        "unit": "m3"
      }
    ],
    "decisionImplication": "Reinforces unstable cavern ceilings against structural failure using heavy timber.",
    "dynamicHelp": "Install rockbolts when cavern stress climbs above 55 kPa."
  }
] as const;


export const HOLLOW_DEEP_INSTRUMENTS: readonly ScientificInstrumentConfig[] = [{
  "id": "hollowDeep.instrument.spelunking_gas_stress_probe",
  "worldId": "hollow-deep",
  "name": "Cathedral Below Geotechnical Probe",
  "description": "Measures cavern floodwater levels, combustible methane gas, and ceiling stress.",
  "deviceClass": "structural_probe",
  "sampleCost": [
    {
      "resource": "vent_energy",
      "amount": 1
    }
  ],
  "calibrationCost": [
    {
      "resource": "bracing",
      "amount": 2
    }
  ],
  "channels": [
    {
      "id": "water",
      "name": "Floodwater Sump Level",
      "unit": "m3",
      "minValid": 0,
      "maxValid": 150,
      "basePrecision": 0.5
    },
    {
      "id": "gas",
      "name": "Pocket Gas Concentration",
      "unit": "ppm",
      "minValid": 0,
      "maxValid": 200,
      "basePrecision": 0.5
    },
    {
      "id": "stress",
      "name": "Subterranean Strata Stress",
      "unit": "kPa",
      "minValid": 0,
      "maxValid": 150,
      "basePrecision": 0.5
    }
  ]
}] as const;


export const hollowDeepFeatureModule = new StandardWorldFeatureModule({
  instruments: HOLLOW_DEEP_INSTRUMENTS,
  nativeActions: HOLLOW_DEEP_NATIVE_ACTIONS,
  worldId: 'hollow-deep',
  capabilities: HOLLOW_DEEP_CAPABILITIES,
  hazardNodes: HOLLOW_DEEP_HAZARD_NODES,
  hazardLinks: HOLLOW_DEEP_HAZARD_LINKS,
  initialBudget: {
    bracing: { balance: 40, capacity: 80, replenishmentRate: 0.5 },
    vent_energy: { balance: 50, capacity: 100, replenishmentRate: 1.0 },
    water_reserve: { balance: 30, capacity: 60, replenishmentRate: 0.4 },
  },
  actionCosts: {
    'hollowDeep.action.aquifer_sump_drainage': [
      { resource: 'vent_energy', amount: 10 },
      { resource: 'water_reserve', amount: 5 },
    ],
    'hollowDeep.action.methane_vent_flaring': [
      { resource: 'vent_energy', amount: 12 },
      { resource: 'bracing', amount: 4 },
    ],
    'hollowDeep.action.acoustic_rockbolt_installation': [
      { resource: 'bracing', amount: 15 },
      { resource: 'vent_energy', amount: 8 },
    ],
  },
  actionDeltas: {
    'hollowDeep.action.aquifer_sump_drainage': [
      { field: 'water', delta: -25, unit: 'level' },
    ],
    'hollowDeep.action.methane_vent_flaring': [
      { field: 'gas', delta: -30, unit: 'ppm' },
    ],
    'hollowDeep.action.acoustic_rockbolt_installation': [
      { field: 'stress', delta: -35, unit: 'MPa' },
    ],
  },
  metricKeys: ['water', 'gas', 'stress'],
  facilityDefinitions: [
    {
      "typeId": "gas_vent",
      "worldId": "hollow-deep",
      "name": "Subterranean Gas Vent Chimney",
      "description": "Exhausts hazardous pockets of methane and toxic volcanic gas.",
      "buildMaterialsCost": [
        {
          "resource": "vent_energy",
          "amount": 8
        },
        {
          "resource": "bracing",
          "amount": 5
        }
      ],
      "buildTicks": 3,
      "upkeepCost": [
        {
          "resource": "vent_energy",
          "amount": 1
        }
      ],
      "benefitMetric": "airQuality",
      "benefitDeltaPerTick": 2
    },
    {
      "typeId": "aquifer_pump",
      "worldId": "hollow-deep",
      "name": "Cavern Aquifer Drainage Pump",
      "description": "Drains floodwaters from unstable chambers to maintain tunnel integrity.",
      "buildMaterialsCost": [
        {
          "resource": "water_reserve",
          "amount": 6
        },
        {
          "resource": "bracing",
          "amount": 5
        }
      ],
      "buildTicks": 4,
      "upkeepCost": [
        {
          "resource": "bracing",
          "amount": 1
        }
      ],
      "benefitMetric": "strataStability",
      "benefitDeltaPerTick": 1.5
    }
  ],
  initialDepots: [
    {
      "siteId": "site-cavern",
      "capacity": 100,
      "inventory": {
        "bracing": 25,
        "vent_energy": 30,
        "water_reserve": 20
      }
    },
    {
      "siteId": "site-cathedral",
      "capacity": 100,
      "inventory": {
        "bracing": 15,
        "vent_energy": 20,
        "water_reserve": 10
      }
    }
  ],
  initialCouriers: [
    {
      "id": "courier-hollow-1",
      "name": "Subterranean Mine Cart",
      "carrierType": "sub_crawler",
      "capacity": 30,
      "speed": 1,
      "location": "site-cavern",
      "currentCargo": {},
      "status": "idle",
      "condition": 100,
      "fuel": 40
    }
  ],
  initialRoutes: [
    {
      "fromSiteId": "site-cavern",
      "toSiteId": "site-cathedral",
      "travelTicks": 2,
      "fuelCost": 1
    }
  ],
  emergencies: HOLLOW_DEEP_EMERGENCIES,
  restorationLayers: HOLLOW_DEEP_RESTORATION_LAYERS,
  policies: HOLLOW_DEEP_POLICIES,
});
