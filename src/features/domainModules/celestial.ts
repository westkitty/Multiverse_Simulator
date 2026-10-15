import {
  NativeActionFamilyDefinition,
  ScientificInstrumentConfig, EmergencyDefinition,
  FeatureCapability,
  PolicyDefinition,
  RestorationLayerDefinition, HazardLink, HazardNode } from '../contracts';
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


export const CELESTIAL_EMERGENCIES: readonly EmergencyDefinition[] = [
  {
    "id": "celestial.orbital_destabilization",
    "worldId": "celestial",
    "name": "Orbital Resonance Destabilization",
    "description": "Eccentric orbital drift increasing solar radiation and thermal shock.",
    "triggerMetric": "meanEccentricity",
    "triggerOperator": ">",
    "precursorThreshold": 0.08,
    "activeThreshold": 0.15,
    "escalateDelayTicks": 4,
    "containmentActionIds": [
      "celestial.action.thruster_burn"
    ],
    "consequences": {
      "metricPenaltiesPerTick": {
        "meanHabitabilityIndex": 0.05,
        "meanTerrestrialTempK": 2
      },
      "budgetDrainPerTick": {
        "propellant": 2
      },
      "secondaryHazardNodeId": "solar_flux_surge",
      "description": "Severe elliptical drift threatens catastrophic atmospheric boil-off."
    }
  }
] as const;

export const CELESTIAL_RESTORATION_LAYERS: readonly RestorationLayerDefinition[] = [
  {
    "id": "orbital_concentricity",
    "name": "Orbital Path Concentricity",
    "metricKey": "meanEccentricity",
    "baselineValue": 0.25,
    "targetValue": 0.01,
    "visualElements": {
      "materialColor": "#7e57c2",
      "accentHex": "#b39ddb",
      "activeMeshes": [
        "decaying_spiral",
        "eccentric_ellipse",
        "corrected_trajectory",
        "circular_keplerian_orbit"
      ]
    },
    "stageDescriptions": {
      "degraded": "Chaotic oscillating trajectory dipping perilously close to periastron.",
      "stabilizing": "Automated burn vectors dampen orbital oscillation.",
      "restoring": "Predictable, stable elliptical path across stellar plane.",
      "flourishing": "Flawlessly circular Keplerian orbit delivering uniform insolation."
    }
  },
  {
    "id": "radiator_panels",
    "name": "Thermal Radiator Arrays",
    "metricKey": "meanHabitabilityIndex",
    "baselineValue": 0.2,
    "targetValue": 0.95,
    "visualElements": {
      "materialColor": "#26a69a",
      "accentHex": "#80cbc4",
      "activeMeshes": [
        "scorched_plating",
        "deployable_baffle",
        "glowing_coolant_fin",
        "balanced_heat_shield"
      ]
    },
    "stageDescriptions": {
      "degraded": "Blistered heat shields radiating uncontrolled thermal spikes.",
      "stabilizing": "Coolant lines flushed and purged of vapor locks.",
      "restoring": "Deployable radiant fins dissipate stellar excess into deep space.",
      "flourishing": "Optimal thermal shielding shielding living habitats year-round."
    }
  }
] as const;

export const CELESTIAL_POLICIES: readonly PolicyDefinition[] = [
  {
    "id": "celestial.reaction_thruster_stationkeeping",
    "worldId": "celestial",
    "name": "Reaction Thruster Stationkeeping",
    "description": "Burns reaction mass to circularize orbits, venting combustion products across instrument fields.",
    "targetHazard": "orbital_drift",
    "resourceCostsPerTick": {
      "propellant": 3
    },
    "metricBenefitsPerTick": {
      "meanEccentricity": -0.015
    },
    "sideEffectsPerTick": {
      "meanHabitabilityIndex": -0.02
    },
    "tradeoffSummary": "Direct orbital stabilization at high propellant burn, clouding telescope visibility."
  },
  {
    "id": "celestial.thermal_shutter_orientation",
    "worldId": "celestial",
    "name": "Thermal Shutter Orientation",
    "description": "Angles sunshields against extreme stellar flux, incurring minor orbital perturbation.",
    "targetHazard": "solar_flux_surge",
    "resourceCostsPerTick": {
      "thermal_protection": 2
    },
    "metricBenefitsPerTick": {
      "meanHabitabilityIndex": 0.04
    },
    "sideEffectsPerTick": {
      "meanEccentricity": 0.005
    },
    "tradeoffSummary": "Mitigates deadly radiation spikes while imparting slight solar sail drift."
  }
] as const;

export const CELESTIAL_NATIVE_ACTIONS: readonly NativeActionFamilyDefinition[] = [
  {
    "id": "celestial.action.orbit_correction_burn",
    "worldId": "celestial",
    "familyKey": "orbit_correction_burn",
    "name": "Constrained Transfer Schedule",
    "description": "Execute delta-V burns at periapsis to prevent runaway orbital elongation.",
    "readSet": [
      "meanEccentricity",
      "meanHabitabilityIndex"
    ],
    "writeSet": [
      "meanEccentricity",
      "meanHabitabilityIndex"
    ],
    "prerequisites": [
      {
        "field": "meanEccentricity",
        "condition": ">",
        "threshold": 0.25
      }
    ],
    "resourceCosts": [
      {
        "resource": "propellant",
        "amount": 6
      },
      {
        "resource": "orbital_hardware",
        "amount": 2
      }
    ],
    "deltas": [
      {
        "field": "meanEccentricity",
        "delta": -0.06,
        "unit": "e"
      },
      {
        "field": "meanHabitabilityIndex",
        "delta": 10,
        "unit": "index"
      }
    ],
    "decisionImplication": "Lowers eccentricity to prevent deep thermal extremes at high propellant cost.",
    "dynamicHelp": "Perform burn when eccentricity exceeds 0.25 e to safeguard biosphere stability."
  },
  {
    "id": "celestial.action.shield_orientation",
    "worldId": "celestial",
    "familyKey": "shield_orientation",
    "name": "Radiation & Thermal Shield Staging",
    "description": "Orient orbital occulting arrays to attenuate lethal solar flare flux.",
    "readSet": [
      "meanTerrestrialTempK",
      "meanHabitabilityIndex"
    ],
    "writeSet": [
      "meanTerrestrialTempK",
      "meanHabitabilityIndex"
    ],
    "prerequisites": [
      {
        "field": "meanTerrestrialTempK",
        "condition": ">",
        "threshold": 310
      }
    ],
    "resourceCosts": [
      {
        "resource": "thermal_protection",
        "amount": 4
      },
      {
        "resource": "orbital_hardware",
        "amount": 3
      }
    ],
    "deltas": [
      {
        "field": "meanTerrestrialTempK",
        "delta": -25,
        "unit": "K"
      },
      {
        "field": "meanHabitabilityIndex",
        "delta": 12,
        "unit": "index"
      }
    ],
    "decisionImplication": "Shields planetary surface from coronal mass ejections and radiant heat.",
    "dynamicHelp": "Deploy thermal arrays when equilibrium temperatures exceed 310 K."
  },
  {
    "id": "celestial.action.transit_station_stabilization",
    "worldId": "celestial",
    "familyKey": "transit_station_stabilization",
    "name": "Orbit Circularization Lock",
    "description": "Engage magnetic station tethers to damp resonance with outer gas giants.",
    "readSet": [
      "meanHabitabilityIndex",
      "meanEccentricity"
    ],
    "writeSet": [
      "meanHabitabilityIndex",
      "meanEccentricity"
    ],
    "prerequisites": [
      {
        "field": "meanHabitabilityIndex",
        "condition": "<",
        "threshold": 45
      }
    ],
    "resourceCosts": [
      {
        "resource": "orbital_hardware",
        "amount": 5
      },
      {
        "resource": "propellant",
        "amount": 4
      }
    ],
    "deltas": [
      {
        "field": "meanHabitabilityIndex",
        "delta": 18,
        "unit": "index"
      },
      {
        "field": "meanEccentricity",
        "delta": -0.03,
        "unit": "e"
      }
    ],
    "decisionImplication": "Locks orbital geometry into stable resonance, halting long-term orbital decay.",
    "dynamicHelp": "Engage tethers when planetary habitability rating drops below 45 index."
  }
] as const;


export const CELESTIAL_INSTRUMENTS: readonly ScientificInstrumentConfig[] = [{
  "id": "celestial.instrument.astrometric_spectrometer",
  "worldId": "celestial",
  "name": "Transit Astrometric Spectrometer",
  "description": "Measures orbital eccentricity, planetary equilibrium flux, and habitability index.",
  "deviceClass": "spectral_analyzer",
  "sampleCost": [
    {
      "resource": "propellant",
      "amount": 2
    }
  ],
  "calibrationCost": [
    {
      "resource": "thermal_protection",
      "amount": 2
    }
  ],
  "channels": [
    {
      "id": "meanEccentricity",
      "name": "Orbital Eccentricity",
      "unit": "e",
      "minValid": 0,
      "maxValid": 1,
      "basePrecision": 0.01
    },
    {
      "id": "meanTerrestrialTempK",
      "name": "Equilibrium Temperature",
      "unit": "K",
      "minValid": 0,
      "maxValid": 1000,
      "basePrecision": 1
    },
    {
      "id": "meanHabitabilityIndex",
      "name": "Habitability Rating",
      "unit": "index",
      "minValid": 0,
      "maxValid": 100,
      "basePrecision": 0.2
    }
  ]
}] as const;


export const celestialFeatureModule = new StandardWorldFeatureModule({
  instruments: CELESTIAL_INSTRUMENTS,
  nativeActions: CELESTIAL_NATIVE_ACTIONS,
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
  emergencies: CELESTIAL_EMERGENCIES,
  restorationLayers: CELESTIAL_RESTORATION_LAYERS,
  policies: CELESTIAL_POLICIES,
});
