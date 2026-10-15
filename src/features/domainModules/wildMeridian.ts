import { FeatureCapability, HazardLink, HazardNode } from '../contracts';
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

export const wildMeridianFeatureModule = new StandardWorldFeatureModule({
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
});
