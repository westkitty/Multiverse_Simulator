import { FeatureCapability, HazardLink, HazardNode } from '../contracts';
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
    mitigationActionFamily: 'timewornEmpire.action.windbreak_berm_reinforcement',
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
    mitigationActionFamily: 'timewornEmpire.action.protective_capping',
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

export const timewornEmpireFeatureModule = new StandardWorldFeatureModule({
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
});
