import { FeatureCapability, HazardLink, HazardNode } from '../contracts';
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

export const hollowDeepFeatureModule = new StandardWorldFeatureModule({
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
});
