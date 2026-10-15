import { FeatureCapability, HazardLink, HazardNode } from '../contracts';
import { StandardWorldFeatureModule } from './domainHelper';

export const CELESTIAL_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'celestial.action.orbit_correction_burn',
    featureId: 'P001',
    name: 'Orbit Correction Burn',
    description: 'Execute retrograde thruster burn to circularize decaying planetary orbit.',
    minRulesVersion: 1,
    domainUnits: ['meanEccentricity'],
    costResource: 'propellant',
  },
  {
    id: 'celestial.action.shield_orientation',
    featureId: 'P001',
    name: 'Shield Orientation',
    description: 'Reorient reflective sunshades to reduce scorching solar radiation flux.',
    minRulesVersion: 1,
    domainUnits: ['meanTerrestrialTempK'],
    costResource: 'thermal_protection',
  },
  {
    id: 'celestial.action.transit_station_stabilization',
    featureId: 'P001',
    name: 'Transit Station Stabilization',
    description: 'Recalibrate magnetic tethers to maintain safe Lagrange transit routes.',
    minRulesVersion: 1,
    domainUnits: ['meanHabitabilityIndex'],
    costResource: 'orbital_hardware',
  },
  {
    id: 'celestial.hazard.monitoring',
    featureId: 'P002',
    name: 'Celestial Hazard Monitoring',
    description: 'Ordered hazard dependency graph for celestial: orbital instability -> high flux exposure -> failed transfers.',
    minRulesVersion: 1,
    domainUnits: ['hazard-index'],
  },
  {
    id: 'celestial.conservation.ledger',
    featureId: 'P003',
    name: 'Celestial Conservation Ledger',
    description: 'Resource-accountable conservation ledger enforcing finite non-negative balances for celestial.',
    minRulesVersion: 1,
    costResource: 'propellant',
  },
  {
    id: 'celestial.signature.destination',
    featureId: 'P011',
    name: 'The Lost Transit Observatory',
    description: 'Authored signature destination for celestial: The Lost Transit Observatory.',
    minRulesVersion: 1,
  },
];

export const CELESTIAL_HAZARD_NODES: readonly HazardNode[] = [
  {
    id: 'orbital_drift',
    label: 'Orbital Drift',
    worldId: 'celestial',
    sourceMetric: 'meanEccentricity',
    targetMetric: 'meanEccentricity',
    threshold: 0.4,
    operator: '>',
    severity: 'warning',
    upstreamNodeIds: [],
    mitigationActionFamily: 'celestial.action.orbit_correction_burn',
    description: 'Orbital eccentricity exceeds circular stability envelope',
    observedTriggerTemplate: 'Orbital eccentricity ({value}) exceeded {threshold}',
    hypothesizedExplanation: 'Gravitational perturbation from outer gas giants destabilizing planetary orbit',
  },
  {
    id: 'solar_flux_surge',
    label: 'Solar Flux Surge',
    worldId: 'celestial',
    sourceMetric: 'meanTerrestrialTempK',
    targetMetric: 'meanTerrestrialTempK',
    threshold: 350,
    operator: '>',
    severity: 'critical',
    upstreamNodeIds: ['orbital_drift'],
    mitigationActionFamily: 'celestial.action.shield_orientation',
    description: 'Perihelion solar radiation overheats surface and orbital stations',
    observedTriggerTemplate: 'Surface temperature ({value} K) exceeded {threshold} K',
    hypothesizedExplanation: 'High-eccentricity perihelion passage exposing planetary crust to intense solar flux',
  },
  {
    id: 'transfer_failure',
    label: 'Transfer Failure',
    worldId: 'celestial',
    sourceMetric: 'meanHabitabilityIndex',
    targetMetric: 'meanHabitabilityIndex',
    threshold: 0.2,
    operator: '<',
    severity: 'catastrophic',
    upstreamNodeIds: ['solar_flux_surge'],
    mitigationActionFamily: 'celestial.action.transit_station_stabilization',
    description: 'Orbital transfer corridors and surface life-support collapse',
    observedTriggerTemplate: 'Habitability index ({value}) fell below {threshold}',
    hypothesizedExplanation: 'Extreme thermal swings and orbital velocity mismatch preventing spacecraft rendezvous',
  },
];

export const CELESTIAL_HAZARD_LINKS: readonly HazardLink[] = [
  {
    fromNodeId: 'orbital_drift',
    toNodeId: 'solar_flux_surge',
    causalLinkType: 'direct',
    description: 'Eccentric orbit causes perihelion proximity surges that spike surface temperature',
  },
  {
    fromNodeId: 'solar_flux_surge',
    toNodeId: 'transfer_failure',
    causalLinkType: 'dependency',
    description: 'Intense thermal flux degrades orbital station radiators and habitability',
  },
];

export const celestialFeatureModule = new StandardWorldFeatureModule({
  worldId: 'celestial',
  capabilities: CELESTIAL_CAPABILITIES,
  hazardNodes: CELESTIAL_HAZARD_NODES,
  hazardLinks: CELESTIAL_HAZARD_LINKS,
  initialBudget: {
    propellant: { balance: 60, capacity: 120, replenishmentRate: 1.0 },
    orbital_hardware: { balance: 25, capacity: 50, replenishmentRate: 0.2 },
    thermal_protection: { balance: 30, capacity: 60, replenishmentRate: 0.3 },
  },
  actionCosts: {
    'celestial.action.orbit_correction_burn': [
      { resource: 'propellant', amount: 15 },
      { resource: 'orbital_hardware', amount: 2 },
    ],
    'celestial.action.shield_orientation': [
      { resource: 'thermal_protection', amount: 8 },
      { resource: 'propellant', amount: 5 },
    ],
    'celestial.action.transit_station_stabilization': [
      { resource: 'orbital_hardware', amount: 6 },
      { resource: 'propellant', amount: 10 },
    ],
  },
  actionDeltas: {
    'celestial.action.orbit_correction_burn': [
      { field: 'meanEccentricity', delta: -0.15, unit: 'e' },
    ],
    'celestial.action.shield_orientation': [
      { field: 'meanTerrestrialTempK', delta: -40, unit: 'K' },
    ],
    'celestial.action.transit_station_stabilization': [
      { field: 'meanHabitabilityIndex', delta: 0.25, unit: 'index' },
    ],
  },
  metricKeys: ['meanEccentricity', 'meanTerrestrialTempK', 'meanHabitabilityIndex'],
  facilityDefinitions: [
    {
      "typeId": "transit_beacon",
      "worldId": "celestial",
      "name": "Orbital Transit Beacon",
      "description": "Deep-space navigation and telemetry beacon correcting orbital drift.",
      "buildMaterialsCost": [
        {
          "resource": "propellant",
          "amount": 10
        },
        {
          "resource": "orbital_hardware",
          "amount": 4
        }
      ],
      "buildTicks": 3,
      "upkeepCost": [
        {
          "resource": "propellant",
          "amount": 1
        }
      ],
      "benefitMetric": "orbitalStabilityIndex",
      "benefitDeltaPerTick": 2
    },
    {
      "typeId": "radiation_shield",
      "worldId": "celestial",
      "name": "Magnetic Radiation Shield",
      "description": "Deflects coronal mass ejections and stabilizes incident flux tolerance.",
      "buildMaterialsCost": [
        {
          "resource": "thermal_protection",
          "amount": 6
        },
        {
          "resource": "propellant",
          "amount": 8
        }
      ],
      "buildTicks": 4,
      "upkeepCost": [
        {
          "resource": "propellant",
          "amount": 1
        }
      ],
      "benefitMetric": "fluxTolerancePct",
      "benefitDeltaPerTick": 1.5
    }
  ],
  initialDepots: [
    {
      "siteId": "site-probe-dock",
      "capacity": 100,
      "inventory": {
        "propellant": 40,
        "orbital_hardware": 15,
        "thermal_protection": 20
      }
    },
    {
      "siteId": "site-observatory",
      "capacity": 100,
      "inventory": {
        "propellant": 20,
        "orbital_hardware": 10,
        "thermal_protection": 10
      }
    }
  ],
  initialCouriers: [
    {
      "id": "courier-celestial-1",
      "name": "Orbital Tug Pod",
      "carrierType": "orbital_pod",
      "capacity": 30,
      "speed": 1,
      "location": "site-probe-dock",
      "currentCargo": {},
      "status": "idle",
      "condition": 100,
      "fuel": 50
    }
  ],
  initialRoutes: [
    {
      "fromSiteId": "site-probe-dock",
      "toSiteId": "site-observatory",
      "travelTicks": 2,
      "fuelCost": 1
    }
  ],
});
