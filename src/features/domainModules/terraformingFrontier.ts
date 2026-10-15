import { FeatureCapability, HazardLink, HazardNode } from '../contracts';
import { StandardWorldFeatureModule } from './domainHelper';

export const TERRAFORMING_FRONTIER_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'terraformingFrontier.action.atmospheric_seal_maintenance',
    featureId: 'P001',
    name: 'Atmospheric Seal Maintenance',
    description: 'Pressurize membrane geodesic domes to arrest outer atmospheric pressure collapse.',
    minRulesVersion: 1,
    domainUnits: ['pressure'],
    costResource: 'energy',
  },
  {
    id: 'terraformingFrontier.action.microbial_innoculation',
    featureId: 'P001',
    name: 'Microbial Innoculation',
    description: 'Introduce extremophile mycorrhizal bacteria to revitalize barren regolith topsoil.',
    minRulesVersion: 1,
    domainUnits: ['soil'],
    costResource: 'bio_stock',
  },
  {
    id: 'terraformingFrontier.action.lichen_nursery_expansion',
    featureId: 'P001',
    name: 'Lichen Nursery Expansion',
    description: 'Seed genetically engineered pioneer lichens to bootstrap biological oxygen output.',
    minRulesVersion: 1,
    domainUnits: ['oxygen'],
    costResource: 'reagents',
  },
  {
    id: 'terraformingFrontier.hazard.monitoring',
    featureId: 'P002',
    name: 'Terraforming Frontier Hazard Monitoring',
    description: 'Ordered hazard dependency graph for terraforming-frontier: atmospheric deficiency -> poor soil -> biosphere instability.',
    minRulesVersion: 1,
    domainUnits: ['hazard-index'],
  },
  {
    id: 'terraformingFrontier.conservation.ledger',
    featureId: 'P003',
    name: 'Terraforming Frontier Conservation Ledger',
    description: 'Resource-accountable conservation ledger enforcing finite non-negative balances for terraforming-frontier.',
    minRulesVersion: 1,
    costResource: 'reagents',
  },
  {
    id: 'terraformingFrontier.signature.destination',
    featureId: 'P011',
    name: 'First Green',
    description: 'Authored signature destination for terraforming-frontier: First Green.',
    minRulesVersion: 1,
  },
];

export const TERRAFORMING_FRONTIER_HAZARD_NODES: readonly HazardNode[] = [
  {
    id: 'dome_depressurization',
    label: 'Dome Depressurization',
    worldId: 'terraforming-frontier',
    sourceMetric: 'pressure',
    targetMetric: 'pressure',
    threshold: 30,
    operator: '<',
    severity: 'warning',
    upstreamNodeIds: [],
    mitigationActionFamily: 'terraformingFrontier.action.atmospheric_seal_maintenance',
    description: 'Canopy dome air pressure drops below habitable survival standards',
    observedTriggerTemplate: 'Canopy atmospheric pressure ({value}) dropped below {threshold}',
    hypothesizedExplanation: 'Membrane seam fatigue venting manufactured atmosphere into thin alien air',
  },
  {
    id: 'subsoil_sterilization',
    label: 'Subsoil Sterilization',
    worldId: 'terraforming-frontier',
    sourceMetric: 'soil',
    targetMetric: 'soil',
    threshold: 30,
    operator: '<',
    severity: 'critical',
    upstreamNodeIds: ['dome_depressurization'],
    mitigationActionFamily: 'terraformingFrontier.action.microbial_innoculation',
    description: 'Regolith fertility crashes, causing catastrophic seedling mortality',
    observedTriggerTemplate: 'Topsoil organic viability ({value}) fell below {threshold}',
    hypothesizedExplanation: 'Cold desiccation and perchlorates killing pioneer soil microbes',
  },
  {
    id: 'biosphere_asphyxiation',
    label: 'Biosphere Asphyxiation',
    worldId: 'terraforming-frontier',
    sourceMetric: 'oxygen',
    targetMetric: 'oxygen',
    threshold: 20,
    operator: '<',
    severity: 'catastrophic',
    upstreamNodeIds: ['subsoil_sterilization'],
    mitigationActionFamily: 'terraformingFrontier.action.lichen_nursery_expansion',
    description: 'Photosynthetic production collapses, suffocating animal colonies and humans',
    observedTriggerTemplate: 'Biosphere oxygen level ({value}%) fell below {threshold}%',
    hypothesizedExplanation: 'Dying vegetation halting oxygen generation across the bio-dome',
  },
];

export const TERRAFORMING_FRONTIER_HAZARD_LINKS: readonly HazardLink[] = [
  {
    fromNodeId: 'dome_depressurization',
    toNodeId: 'subsoil_sterilization',
    causalLinkType: 'direct',
    description: 'Depressurization desiccates topsoil and exposes microbes to radiation',
  },
  {
    fromNodeId: 'subsoil_sterilization',
    toNodeId: 'biosphere_asphyxiation',
    causalLinkType: 'dependency',
    description: 'Sterile soil kills pioneer plants, shutting down atmospheric oxygen production',
  },
];

export const terraformingFrontierFeatureModule = new StandardWorldFeatureModule({
  worldId: 'terraforming-frontier',
  capabilities: TERRAFORMING_FRONTIER_CAPABILITIES,
  hazardNodes: TERRAFORMING_FRONTIER_HAZARD_NODES,
  hazardLinks: TERRAFORMING_FRONTIER_HAZARD_LINKS,
  initialBudget: {
    reagents: { balance: 50, capacity: 100, replenishmentRate: 1.0 },
    bio_stock: { balance: 40, capacity: 80, replenishmentRate: 0.5 },
    energy: { balance: 60, capacity: 120, replenishmentRate: 1.5 },
  },
  actionCosts: {
    'terraformingFrontier.action.atmospheric_seal_maintenance': [
      { resource: 'energy', amount: 10 },
      { resource: 'reagents', amount: 6 },
    ],
    'terraformingFrontier.action.microbial_innoculation': [
      { resource: 'bio_stock', amount: 12 },
      { resource: 'reagents', amount: 8 },
    ],
    'terraformingFrontier.action.lichen_nursery_expansion': [
      { resource: 'bio_stock', amount: 15 },
      { resource: 'energy', amount: 12 },
    ],
  },
  actionDeltas: {
    'terraformingFrontier.action.atmospheric_seal_maintenance': [
      { field: 'pressure', delta: 20, unit: 'kPa' },
    ],
    'terraformingFrontier.action.microbial_innoculation': [
      { field: 'soil', delta: 25, unit: 'viability' },
    ],
    'terraformingFrontier.action.lichen_nursery_expansion': [
      { field: 'oxygen', delta: 20, unit: '%' },
    ],
  },
  metricKeys: ['pressure', 'soil', 'oxygen'],
  facilityDefinitions: [
    {
      "typeId": "biosphere_dome",
      "worldId": "terraforming-frontier",
      "name": "Pressurized Biosphere Dome",
      "description": "Inflatable habitat dome sustaining closed-loop ecology on alien regolith.",
      "buildMaterialsCost": [
        {
          "resource": "reagents",
          "amount": 8
        },
        {
          "resource": "energy",
          "amount": 10
        }
      ],
      "buildTicks": 3,
      "upkeepCost": [
        {
          "resource": "energy",
          "amount": 1
        }
      ],
      "benefitMetric": "domePressureKpa",
      "benefitDeltaPerTick": 2
    },
    {
      "typeId": "atmosphere_regulator",
      "worldId": "terraforming-frontier",
      "name": "Frontier Atmosphere Regulator",
      "description": "Enzymatic bioreactor scrubbing toxic carbon and converting free oxygen.",
      "buildMaterialsCost": [
        {
          "resource": "bio_stock",
          "amount": 6
        },
        {
          "resource": "reagents",
          "amount": 6
        }
      ],
      "buildTicks": 4,
      "upkeepCost": [
        {
          "resource": "reagents",
          "amount": 1
        }
      ],
      "benefitMetric": "o2ConcentrationPct",
      "benefitDeltaPerTick": 1.5
    }
  ],
  initialDepots: [
    {
      "siteId": "site-dome",
      "capacity": 100,
      "inventory": {
        "reagents": 30,
        "bio_stock": 25,
        "energy": 35
      }
    },
    {
      "siteId": "site-crater",
      "capacity": 100,
      "inventory": {
        "reagents": 20,
        "bio_stock": 15,
        "energy": 25
      }
    }
  ],
  initialCouriers: [
    {
      "id": "courier-frontier-1",
      "name": "Frontier Crawler Rover",
      "carrierType": "ground_rover",
      "capacity": 35,
      "speed": 1,
      "location": "site-dome",
      "currentCargo": {},
      "status": "idle",
      "condition": 100,
      "fuel": 50
    }
  ],
  initialRoutes: [
    {
      "fromSiteId": "site-dome",
      "toSiteId": "site-crater",
      "travelTicks": 2,
      "fuelCost": 1
    }
  ],
});
