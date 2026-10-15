import {
  NativeActionFamilyDefinition,
  ScientificInstrumentConfig, EmergencyDefinition,
  FeatureCapability,
  PolicyDefinition,
  RestorationLayerDefinition, HazardLink, HazardNode } from '../contracts';
import { StandardWorldFeatureModule } from './domainHelper';

export const TIMEWORN_EMPIRE_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'timewornEmpire.action.windbreak_berm_reinforcement',
    featureId: 'P001',
    name: 'Windbreak Berm Reinforcement',
    description: 'Raise earthworks and geotextiles to shelter friezes from abrasive sandstorms.',
    minRulesVersion: 1,
    domainUnits: ['erosion'],
    costResource: 'excavation_capacity',
  },
  {
    id: 'timewornEmpire.action.protective_capping',
    featureId: 'P001',
    name: 'Protective Capping',
    description: 'Apply sacrificial lime mortar caps to protect vulnerable carved monuments.',
    minRulesVersion: 1,
    domainUnits: ['exposure'],
    costResource: 'conservation_materials',
  },
  {
    id: 'timewornEmpire.action.tomb_humidity_buffering',
    featureId: 'P001',
    name: 'Tomb Humidity Buffering',
    description: 'Install humidity buffers and earth blankets to preserve buried subterranean archives.',
    minRulesVersion: 1,
    domainUnits: ['burial'],
    costResource: 'crew_time',
  },
  {
    id: 'timewornEmpire.hazard.monitoring',
    featureId: 'P002',
    name: 'Timeworn Empire Hazard Monitoring',
    description: 'Ordered hazard dependency graph for timeworn-empire: erosion -> exposure -> irreversible archaeological loss.',
    minRulesVersion: 1,
    domainUnits: ['hazard-index'],
  },
  {
    id: 'timewornEmpire.conservation.ledger',
    featureId: 'P003',
    name: 'Timeworn Empire Conservation Ledger',
    description: 'Resource-accountable conservation ledger enforcing finite non-negative balances for timeworn-empire.',
    minRulesVersion: 1,
    costResource: 'conservation_materials',
  },
  {
    id: 'timewornEmpire.signature.destination',
    featureId: 'P011',
    name: 'City of Three Foundations',
    description: 'Authored signature destination for timeworn-empire: City of Three Foundations.',
    minRulesVersion: 1,
  },
];

export const TIMEWORN_EMPIRE_HAZARD_NODES: readonly HazardNode[] = [
  {
    id: 'sandstorm_scour',
    label: 'Sandstorm Scour',
    worldId: 'timeworn-empire',
    sourceMetric: 'erosion',
    targetMetric: 'erosion',
    threshold: 70,
    operator: '>',
    severity: 'warning',
    upstreamNodeIds: [],
    mitigationActionFamily: 'timewornEmpire.action.protective_capping',
    description: 'Severe aeolian abrasion scouring ancient masonry foundations',
    observedTriggerTemplate: 'Masonry erosion rate ({value}) exceeded {threshold}',
    hypothesizedExplanation: 'Unchecked seasonal dust storms carrying abrasive quartz particles',
  },
  {
    id: 'monument_exposure',
    label: 'Monument Exposure',
    worldId: 'timeworn-empire',
    sourceMetric: 'exposure',
    targetMetric: 'exposure',
    threshold: 65,
    operator: '>',
    severity: 'critical',
    upstreamNodeIds: ['sandstorm_scour'],
    mitigationActionFamily: 'timewornEmpire.action.windbreak_berm_reinforcement',
    description: 'Protective topsoil stripped away, exposing fragile inscriptions',
    observedTriggerTemplate: 'Archaeological exposure level ({value}) exceeded {threshold}',
    hypothesizedExplanation: 'Wind erosion stripping protective dune layers from buried monuments',
  },
  {
    id: 'archive_dissolution',
    label: 'Archive Dissolution',
    worldId: 'timeworn-empire',
    sourceMetric: 'burial',
    targetMetric: 'burial',
    threshold: 20,
    operator: '<',
    severity: 'catastrophic',
    upstreamNodeIds: ['monument_exposure'],
    mitigationActionFamily: 'timewornEmpire.action.tomb_humidity_buffering',
    description: 'Loss of burial strata subjects delicate archives to irreversible powdering',
    observedTriggerTemplate: 'Protective burial strata ({value}) dropped below {threshold}',
    hypothesizedExplanation: 'Exposure to extreme diurnal thermal cycling pulverizing porous limestone inscriptions',
  },
];

export const TIMEWORN_EMPIRE_HAZARD_LINKS: readonly HazardLink[] = [
  {
    fromNodeId: 'sandstorm_scour',
    toNodeId: 'monument_exposure',
    causalLinkType: 'direct',
    description: 'Severe wind scour removes sediment dunes, directly exposing delicate relief carvings',
  },
  {
    fromNodeId: 'monument_exposure',
    toNodeId: 'archive_dissolution',
    causalLinkType: 'dependency',
    description: 'Exposed surface ruins collapse into subterranean vaults, destroying buried archives',
  },
];


export const TIMEWORN_EMPIRE_EMERGENCIES: readonly EmergencyDefinition[] = [
  {
    "id": "timeworn_empire.archaeological_scour",
    "worldId": "timeworn-empire",
    "name": "Sandstorm Scour & Archive Loss",
    "description": "Fierce desert abrasion grinding away irreplaceable historic bas-reliefs.",
    "triggerMetric": "erosion",
    "triggerOperator": ">",
    "precursorThreshold": 65,
    "activeThreshold": 85,
    "escalateDelayTicks": 4,
    "containmentActionIds": [
      "timeworn_empire.action.preservation"
    ],
    "consequences": {
      "metricPenaltiesPerTick": {
        "exposure": 2,
        "burial": 1.5
      },
      "budgetDrainPerTick": {
        "conservation_materials": 1
      },
      "secondaryHazardNodeId": "monument_exposure",
      "description": "Centuries of recorded history sandblasted into illegible dust."
    }
  }
] as const;

export const TIMEWORN_EMPIRE_RESTORATION_LAYERS: readonly RestorationLayerDefinition[] = [
  {
    "id": "monumental_colonnades",
    "name": "Imperial Monument Restoration",
    "metricKey": "erosion",
    "baselineValue": 95,
    "targetValue": 15,
    "visualElements": {
      "materialColor": "#d4e157",
      "accentHex": "#e6ee9c",
      "activeMeshes": [
        "weathered_pedestal",
        "scaffolded_entablature",
        "re-erected_fluted_column",
        "pristine_imperial_propylon"
      ]
    },
    "stageDescriptions": {
      "degraded": "Wind-scoured stubs and toppled limestone entablatures buried in scree.",
      "stabilizing": "Protective windbreak scaffolding wraps fragile column drums.",
      "restoring": "Re-erected triumphal porticos stand against the desert horizon.",
      "flourishing": "Flawlessly conserved imperial monuments crowned with golden capitals."
    }
  },
  {
    "id": "epigraphic_archives",
    "name": "Epigraphic Library Conservation",
    "metricKey": "exposure",
    "baselineValue": 90,
    "targetValue": 20,
    "visualElements": {
      "materialColor": "#c0ca33",
      "accentHex": "#dce775",
      "activeMeshes": [
        "pulverized_tablets",
        "chemical_mortar_consolidation",
        "sheltered_scriptorium",
        "deciphered_stele_hall"
      ]
    },
    "stageDescriptions": {
      "degraded": "Flaking inscriptions and cracked tablets exposed to scorching sun.",
      "stabilizing": "Chemical consolidants arrest crumbling plaster and lime.",
      "restoring": "Enclosed archival pavilions shield ancient stelae from sand.",
      "flourishing": "Illuminated hall of inscriptions completely deciphered and preserved."
    }
  }
] as const;

export const TIMEWORN_EMPIRE_POLICIES: readonly PolicyDefinition[] = [
  {
    "id": "timeworn_empire.chemical_silicate_consolidation",
    "worldId": "timeworn-empire",
    "name": "Chemical Silicate Consolidation",
    "description": "Sprays silicate binders to arrest masonry crumble, chemically discoloring ancient inscriptions.",
    "targetHazard": "sandstorm_scour",
    "resourceCostsPerTick": {
      "conservation_materials": 3
    },
    "metricBenefitsPerTick": {
      "erosion": -3.5
    },
    "sideEffectsPerTick": {
      "exposure": 1
    },
    "tradeoffSummary": "Haults stone erosion completely but leaves a modern protective glaze over artifacts."
  },
  {
    "id": "timeworn_empire.protective_sand_berm_deposition",
    "worldId": "timeworn-empire",
    "name": "Protective Earthen Berm Burial",
    "description": "Bulldozes protective earth dikes over delicate frescoes, restricting excavation access.",
    "targetHazard": "monument_exposure",
    "resourceCostsPerTick": {
      "excavation_capacity": 2
    },
    "metricBenefitsPerTick": {
      "exposure": -3
    },
    "sideEffectsPerTick": {
      "burial": 2.5
    },
    "tradeoffSummary": "Shields priceless reliefs from weather while temporarily sealing them under sand."
  }
] as const;

export const TIMEWORN_EMPIRE_NATIVE_ACTIONS: readonly NativeActionFamilyDefinition[] = [
  {
    "id": "timewornEmpire.action.windbreak_berm_reinforcement",
    "worldId": "timeworn-empire",
    "familyKey": "windbreak_berm_reinforcement",
    "name": "Controlled Stratum Excavation",
    "description": "Excavate sanddrifts under protective shrouds to reveal underlying masonry.",
    "readSet": [
      "burial",
      "exposure"
    ],
    "writeSet": [
      "burial",
      "exposure"
    ],
    "prerequisites": [
      {
        "field": "burial",
        "condition": ">",
        "threshold": 45
      }
    ],
    "resourceCosts": [
      {
        "resource": "excavation_capacity",
        "amount": 5
      },
      {
        "resource": "crew_time",
        "amount": 3
      }
    ],
    "deltas": [
      {
        "field": "burial",
        "delta": -20,
        "unit": "cm"
      },
      {
        "field": "exposure",
        "delta": 12,
        "unit": "%"
      }
    ],
    "decisionImplication": "Uncovers foundational monuments while managing fragile sediment shifts.",
    "dynamicHelp": "Excavate when drift burial exceeds 45 cm to recover lost inscriptions."
  },
  {
    "id": "timewornEmpire.action.protective_capping",
    "worldId": "timeworn-empire",
    "familyKey": "protective_capping",
    "name": "Ruin Protection & Chemical Capping",
    "description": "Apply silane consolidants to porous sandstone to halt wind scour.",
    "readSet": [
      "erosion",
      "exposure"
    ],
    "writeSet": [
      "erosion",
      "exposure"
    ],
    "prerequisites": [
      {
        "field": "erosion",
        "condition": ">",
        "threshold": 30
      }
    ],
    "resourceCosts": [
      {
        "resource": "conservation_materials",
        "amount": 5
      },
      {
        "resource": "crew_time",
        "amount": 2
      }
    ],
    "deltas": [
      {
        "field": "erosion",
        "delta": -18,
        "unit": "mm/yr"
      },
      {
        "field": "exposure",
        "delta": 4,
        "unit": "%"
      }
    ],
    "decisionImplication": "Halts irreversible wind erosion on ancient facades, burning chemical consolidants.",
    "dynamicHelp": "Apply protective capping when stone erosion rates exceed 30 mm/yr."
  },
  {
    "id": "timewornEmpire.action.tomb_humidity_buffering",
    "worldId": "timeworn-empire",
    "familyKey": "tomb_humidity_buffering",
    "name": "Stratum Hypothesis Testing",
    "description": "Buffer microclimates and document conflicting architectural chronologies.",
    "readSet": [
      "exposure",
      "erosion"
    ],
    "writeSet": [
      "exposure",
      "erosion"
    ],
    "prerequisites": [
      {
        "field": "exposure",
        "condition": "<",
        "threshold": 40
      }
    ],
    "resourceCosts": [
      {
        "resource": "crew_time",
        "amount": 4
      },
      {
        "resource": "conservation_materials",
        "amount": 3
      }
    ],
    "deltas": [
      {
        "field": "exposure",
        "delta": 18,
        "unit": "%"
      },
      {
        "field": "erosion",
        "delta": -4,
        "unit": "mm/yr"
      }
    ],
    "decisionImplication": "Systematizes stratigraphic layers to resolve historical succession debates.",
    "dynamicHelp": "Test stratum hypotheses when exposed ruins coverage falls below 40%."
  }
] as const;


export const TIMEWORN_EMPIRE_INSTRUMENTS: readonly ScientificInstrumentConfig[] = [{
  "id": "timewornEmpire.instrument.stratigraphic_ground_radar",
  "worldId": "timeworn-empire",
  "name": "City of Three Foundations Ground Radar",
  "description": "Maps aeolian burial depth, architectural stone erosion, and exposed stratum ruins.",
  "deviceClass": "structural_probe",
  "sampleCost": [
    {
      "resource": "crew_time",
      "amount": 1
    }
  ],
  "calibrationCost": [
    {
      "resource": "conservation_materials",
      "amount": 2
    }
  ],
  "channels": [
    {
      "id": "burial",
      "name": "Sand Sediment Burial",
      "unit": "cm",
      "minValid": 0,
      "maxValid": 200,
      "basePrecision": 0.5
    },
    {
      "id": "erosion",
      "name": "Masonry Wind Erosion",
      "unit": "mm/yr",
      "minValid": 0,
      "maxValid": 100,
      "basePrecision": 0.2
    },
    {
      "id": "exposure",
      "name": "Exposed Archaeological Stratum",
      "unit": "%",
      "minValid": 0,
      "maxValid": 100,
      "basePrecision": 0.2
    }
  ]
}] as const;


export const timewornEmpireFeatureModule = new StandardWorldFeatureModule({
  instruments: TIMEWORN_EMPIRE_INSTRUMENTS,
  nativeActions: TIMEWORN_EMPIRE_NATIVE_ACTIONS,
  worldId: 'timeworn-empire',
  capabilities: TIMEWORN_EMPIRE_CAPABILITIES,
  hazardNodes: TIMEWORN_EMPIRE_HAZARD_NODES,
  hazardLinks: TIMEWORN_EMPIRE_HAZARD_LINKS,
  initialBudget: {
    conservation_materials: { balance: 50, capacity: 100, replenishmentRate: 1.0 },
    crew_time: { balance: 60, capacity: 120, replenishmentRate: 1.5 },
    excavation_capacity: { balance: 30, capacity: 60, replenishmentRate: 0.3 },
  },
  actionCosts: {
    'timewornEmpire.action.windbreak_berm_reinforcement': [
      { resource: 'excavation_capacity', amount: 8 },
      { resource: 'crew_time', amount: 10 },
    ],
    'timewornEmpire.action.protective_capping': [
      { resource: 'conservation_materials', amount: 12 },
      { resource: 'crew_time', amount: 8 },
    ],
    'timewornEmpire.action.tomb_humidity_buffering': [
      { resource: 'conservation_materials', amount: 15 },
      { resource: 'excavation_capacity', amount: 5 },
    ],
  },
  actionDeltas: {
    'timewornEmpire.action.windbreak_berm_reinforcement': [
      { field: 'erosion', delta: -25, unit: 'rate' },
    ],
    'timewornEmpire.action.protective_capping': [
      { field: 'exposure', delta: -30, unit: 'index' },
    ],
    'timewornEmpire.action.tomb_humidity_buffering': [
      { field: 'burial', delta: 20, unit: 'depth' },
    ],
  },
  metricKeys: ['erosion', 'exposure', 'burial'],
  facilityDefinitions: [
    {
      "typeId": "strata_shelter",
      "worldId": "timeworn-empire",
      "name": "Archaeological Strata Shelter",
      "description": "Canopy structure protecting ancient limestone foundations from erosion.",
      "buildMaterialsCost": [
        {
          "resource": "conservation_materials",
          "amount": 8
        },
        {
          "resource": "crew_time",
          "amount": 10
        }
      ],
      "buildTicks": 3,
      "upkeepCost": [
        {
          "resource": "conservation_materials",
          "amount": 1
        }
      ],
      "benefitMetric": "foundationHealth",
      "benefitDeltaPerTick": 2
    },
    {
      "typeId": "field_conservation_workshop",
      "worldId": "timeworn-empire",
      "name": "Field Epigraphy Workshop",
      "description": "On-site laboratory for stabilizing crumbling masonry inscriptions.",
      "buildMaterialsCost": [
        {
          "resource": "excavation_capacity",
          "amount": 6
        },
        {
          "resource": "conservation_materials",
          "amount": 6
        }
      ],
      "buildTicks": 4,
      "upkeepCost": [
        {
          "resource": "conservation_materials",
          "amount": 1
        }
      ],
      "benefitMetric": "preservationScore",
      "benefitDeltaPerTick": 1.5
    }
  ],
  initialDepots: [
    {
      "siteId": "site-foundation",
      "capacity": 100,
      "inventory": {
        "conservation_materials": 30,
        "crew_time": 40,
        "excavation_capacity": 20
      }
    },
    {
      "siteId": "site-terrace",
      "capacity": 100,
      "inventory": {
        "conservation_materials": 20,
        "crew_time": 20,
        "excavation_capacity": 10
      }
    }
  ],
  initialCouriers: [
    {
      "id": "courier-empire-1",
      "name": "Terrace Supply Transport",
      "carrierType": "ground_rover",
      "capacity": 35,
      "speed": 1,
      "location": "site-foundation",
      "currentCargo": {},
      "status": "idle",
      "condition": 100,
      "fuel": 50
    }
  ],
  initialRoutes: [
    {
      "fromSiteId": "site-foundation",
      "toSiteId": "site-terrace",
      "travelTicks": 2,
      "fuelCost": 1
    }
  ],
  emergencies: TIMEWORN_EMPIRE_EMERGENCIES,
  restorationLayers: TIMEWORN_EMPIRE_RESTORATION_LAYERS,
  policies: TIMEWORN_EMPIRE_POLICIES,
});
