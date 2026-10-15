import {
  NativeActionFamilyDefinition,
  ScientificInstrumentConfig, EmergencyDefinition,
  FeatureCapability,
  PolicyDefinition,
  RestorationLayerDefinition, HazardLink, HazardNode } from '../contracts';
import { StandardWorldFeatureModule } from './domainHelper';

export const ATMOSPHERE_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'atmosphere.action.cloud_seeding',
    featureId: 'P001',
    name: 'Cloud Seeding',
    description: 'Disperse hygroscopic aerosols to restore low-altitude moisture.',
    minRulesVersion: 1,
    domainUnits: ['meanHumidityPct'],
    costResource: 'reagents',
  },
  {
    id: 'atmosphere.action.barometric_dampening',
    featureId: 'P001',
    name: 'Barometric Dampening',
    description: 'Deploy thermal sinks to damp violent barometric gradient swings.',
    minRulesVersion: 1,
    domainUnits: ['meanPressureHpa'],
    costResource: 'sensor_power',
  },
  {
    id: 'atmosphere.action.thermal_sink_deployment',
    featureId: 'P001',
    name: 'Thermal Sink Deployment',
    description: 'Erect convective cooling fields to counter extreme temperature excursions.',
    minRulesVersion: 1,
    domainUnits: ['meanTemperatureC'],
    costResource: 'shelters',
  },
  {
    id: 'atmosphere.hazard.monitoring',
    featureId: 'P002',
    name: 'Atmosphere Hazard Monitoring',
    description: 'Ordered hazard dependency graph for atmosphere: moisture loss -> storm instability -> monitoring blindness.',
    minRulesVersion: 1,
    domainUnits: ['hazard-index'],
  },
  {
    id: 'atmosphere.conservation.ledger',
    featureId: 'P003',
    name: 'Atmosphere Conservation Ledger',
    description: 'Resource-accountable conservation ledger enforcing finite non-negative balances for atmosphere.',
    minRulesVersion: 1,
    costResource: 'reagents',
  },
  {
    id: 'atmosphere.signature.destination',
    featureId: 'P011',
    name: 'The Station Beneath the Storm',
    description: 'Authored signature destination for atmosphere: The Station Beneath the Storm.',
    minRulesVersion: 1,
  },
];

export const ATMOSPHERE_HAZARD_NODES: readonly HazardNode[] = [
  {
    id: 'moisture_loss',
    label: 'Moisture Loss',
    worldId: 'atmosphere',
    sourceMetric: 'meanHumidityPct',
    targetMetric: 'meanHumidityPct',
    threshold: 20,
    operator: '<',
    severity: 'warning',
    upstreamNodeIds: [],
    mitigationActionFamily: 'atmosphere.action.cloud_seeding',
    description: 'Atmospheric humidity drops below critical cloud-condensation levels',
    observedTriggerTemplate: 'Atmospheric humidity ({value}%) dropped below {threshold}%',
    hypothesizedExplanation: 'High-altitude desiccating jetstreams stripping tropospheric moisture',
  },
  {
    id: 'storm_instability',
    label: 'Storm Instability',
    worldId: 'atmosphere',
    sourceMetric: 'meanPressureHpa',
    targetMetric: 'meanPressureHpa',
    threshold: 950,
    operator: '<',
    severity: 'critical',
    upstreamNodeIds: ['moisture_loss'],
    mitigationActionFamily: 'atmosphere.action.barometric_dampening',
    description: 'Violent pressure collapses generate catastrophic squall lines',
    observedTriggerTemplate: 'Barometric low pressure ({value} hPa) dropped below {threshold} hPa',
    hypothesizedExplanation: 'Extreme thermal gradients triggering cyclonic shear fronts',
  },
  {
    id: 'monitoring_blindness',
    label: 'Monitoring Blindness',
    worldId: 'atmosphere',
    sourceMetric: 'meanTemperatureC',
    targetMetric: 'meanTemperatureC',
    threshold: 45,
    operator: '>',
    severity: 'catastrophic',
    upstreamNodeIds: ['storm_instability'],
    mitigationActionFamily: 'atmosphere.action.thermal_sink_deployment',
    description: 'Extreme heat and ion storms blind sensor station arrays',
    observedTriggerTemplate: 'Ambient temperature ({value} C) exceeded {threshold} C',
    hypothesizedExplanation: 'Runaway greenhouse feedback and electrical storms blinding monitoring arrays',
  },
];

export const ATMOSPHERE_HAZARD_LINKS: readonly HazardLink[] = [
  {
    fromNodeId: 'moisture_loss',
    toNodeId: 'storm_instability',
    causalLinkType: 'direct',
    description: 'Moisture depletion destabilizes convection columns into violent squall fronts',
  },
  {
    fromNodeId: 'storm_instability',
    toNodeId: 'monitoring_blindness',
    causalLinkType: 'dependency',
    description: 'Violent pressure drops cause runaway thermal heating and sensor blackout',
  },
];


export const ATMOSPHERE_EMERGENCIES: readonly EmergencyDefinition[] = [
  {
    "id": "atmosphere.vortex_collapse",
    "worldId": "atmosphere",
    "name": "Stratospheric Vortex Collapse",
    "description": "Moisture divergence creates violent thermal turbulence and blinding dust fronts.",
    "triggerMetric": "meanHumidityPct",
    "triggerOperator": "<",
    "precursorThreshold": 35,
    "activeThreshold": 20,
    "escalateDelayTicks": 4,
    "containmentActionIds": [
      "atmosphere.action.cloud_seeding"
    ],
    "consequences": {
      "metricPenaltiesPerTick": {
        "meanPressureHpa": 5,
        "meanTemperatureC": 1.2
      },
      "budgetDrainPerTick": {
        "reagents": 1
      },
      "secondaryHazardNodeId": "storm_instability",
      "description": "Atmospheric instability buffets sensor masts and boils off moisture."
    }
  }
] as const;

export const ATMOSPHERE_RESTORATION_LAYERS: readonly RestorationLayerDefinition[] = [
  {
    "id": "cloud_bands",
    "name": "Cloud Band Stratification",
    "metricKey": "meanHumidityPct",
    "baselineValue": 15,
    "targetValue": 70,
    "visualElements": {
      "materialColor": "#78909c",
      "accentHex": "#b0bec5",
      "activeMeshes": [
        "thin_haze",
        "scattered_cirrus",
        "dense_cumulus",
        "stable_vapor_belt"
      ]
    },
    "stageDescriptions": {
      "degraded": "Torn, chaotic wisps of dry atmospheric smog.",
      "stabilizing": "Layered cirrus sheets shield lower zones from solar glare.",
      "restoring": "Moist cumulus decks roll across the planetary horizon.",
      "flourishing": "Majestic, balanced cloud belts delivering rhythmic rainfall."
    }
  },
  {
    "id": "platform_corrosion",
    "name": "Aerostat Weathering & Stabilization",
    "metricKey": "meanTemperatureC",
    "baselineValue": 45,
    "targetValue": 15,
    "visualElements": {
      "materialColor": "#ff7043",
      "accentHex": "#ffab91",
      "activeMeshes": [
        "weathered_spire",
        "thermal_coating",
        "aerodynamic_baffle",
        "climate_array"
      ]
    },
    "stageDescriptions": {
      "degraded": "Charred, overheated sensor towers and peeling thermal tiles.",
      "stabilizing": "Active coolant pumps bring outer hull temperatures down.",
      "restoring": "Reflective ceramic panels deflect harsh stratospheric heat.",
      "flourishing": "Calm, stabilized aerostat platforms gliding in thermal equilibrium."
    }
  }
] as const;

export const ATMOSPHERE_POLICIES: readonly PolicyDefinition[] = [
  {
    "id": "atmosphere.aerosol_seeding_injection",
    "worldId": "atmosphere",
    "name": "Aerosol Seeding Injection",
    "description": "Catalyzes moisture coalescence with chemical seeding, elevating local turbulence.",
    "targetHazard": "moisture_loss",
    "resourceCostsPerTick": {
      "reagents": 3
    },
    "metricBenefitsPerTick": {
      "meanHumidityPct": 2.5
    },
    "sideEffectsPerTick": {
      "meanPressureHpa": 3
    },
    "tradeoffSummary": "Condenses atmospheric vapor quickly while spiking local barometric pressure."
  },
  {
    "id": "atmosphere.high_altitude_shelter_pressurization",
    "worldId": "atmosphere",
    "name": "Gondola Shelter Pressurization",
    "description": "Heats observation gondolas at the expense of regional vapor condensation.",
    "targetHazard": "monitoring_blindness",
    "resourceCostsPerTick": {
      "sensor_power": 2
    },
    "metricBenefitsPerTick": {
      "meanTemperatureC": -1.5
    },
    "sideEffectsPerTick": {
      "meanHumidityPct": -0.8
    },
    "tradeoffSummary": "Stabilizes habitability temperatures while stripping ambient humidity."
  }
] as const;

export const ATMOSPHERE_NATIVE_ACTIONS: readonly NativeActionFamilyDefinition[] = [
  {
    "id": "atmosphere.action.cloud_seeding",
    "worldId": "atmosphere",
    "familyKey": "cloud_seeding",
    "name": "Moisture-Front Redirection",
    "description": "Disperse condensation nuclei to steer supercell storm fronts.",
    "readSet": [
      "meanHumidityPct",
      "meanPressureHpa"
    ],
    "writeSet": [
      "meanHumidityPct",
      "meanPressureHpa"
    ],
    "prerequisites": [
      {
        "field": "meanHumidityPct",
        "condition": "<",
        "threshold": 20
      }
    ],
    "resourceCosts": [
      {
        "resource": "reagents",
        "amount": 4
      },
      {
        "resource": "sensor_power",
        "amount": 3
      }
    ],
    "deltas": [
      {
        "field": "meanHumidityPct",
        "delta": 10,
        "unit": "%"
      },
      {
        "field": "meanPressureHpa",
        "delta": 10,
        "unit": "hPa"
      }
    ],
    "decisionImplication": "Forces localized condensation to restore tropospheric moisture before desiccation.",
    "dynamicHelp": "Deploy when humidity drops below 20% to prevent desiccating runaway."
  },
  {
    "id": "atmosphere.action.barometric_dampening",
    "worldId": "atmosphere",
    "familyKey": "barometric_dampening",
    "name": "Storm Instrument Deployment",
    "description": "Deploy sonic dampening arrays to stabilize barometric pressure gradients.",
    "readSet": [
      "meanPressureHpa",
      "meanTemperatureC"
    ],
    "writeSet": [
      "meanPressureHpa",
      "meanTemperatureC"
    ],
    "prerequisites": [
      {
        "field": "meanPressureHpa",
        "condition": "<",
        "threshold": 970
      }
    ],
    "resourceCosts": [
      {
        "resource": "sensor_power",
        "amount": 5
      },
      {
        "resource": "shelters",
        "amount": 2
      }
    ],
    "deltas": [
      {
        "field": "meanPressureHpa",
        "delta": 15,
        "unit": "hPa"
      },
      {
        "field": "meanTemperatureC",
        "delta": -3,
        "unit": "C"
      }
    ],
    "decisionImplication": "Elevates local atmospheric pressure, damping wind shear at substantial power cost.",
    "dynamicHelp": "Fire when pressure drops below 970 hPa to counter eye-wall formation."
  },
  {
    "id": "atmosphere.action.thermal_sink_deployment",
    "worldId": "atmosphere",
    "familyKey": "thermal_sink_deployment",
    "name": "Temporary Climate Countermeasures",
    "description": "Vent subterranean heat sinks into updrafts to collapse convective cells.",
    "readSet": [
      "meanTemperatureC",
      "meanHumidityPct"
    ],
    "writeSet": [
      "meanTemperatureC",
      "meanHumidityPct"
    ],
    "prerequisites": [
      {
        "field": "meanTemperatureC",
        "condition": ">",
        "threshold": 35
      }
    ],
    "resourceCosts": [
      {
        "resource": "shelters",
        "amount": 4
      },
      {
        "resource": "reagents",
        "amount": 3
      }
    ],
    "deltas": [
      {
        "field": "meanTemperatureC",
        "delta": -10,
        "unit": "C"
      },
      {
        "field": "meanHumidityPct",
        "delta": 5,
        "unit": "%"
      }
    ],
    "decisionImplication": "Cools thermal updrafts to quench tornado genesis, utilizing thermal buffer stores.",
    "dynamicHelp": "Activate when surface temperatures exceed 35 C during low-pressure alerts."
  }
] as const;


export const ATMOSPHERE_INSTRUMENTS: readonly ScientificInstrumentConfig[] = [{
  "id": "atmosphere.instrument.meteorological_sonde",
  "worldId": "atmosphere",
  "name": "Storm Tower Meteorological Sonde",
  "description": "Calibrated micro-barometer and hygrometer for turbulent storm tracking.",
  "deviceClass": "environmental_sampler",
  "sampleCost": [
    {
      "resource": "sensor_power",
      "amount": 2
    }
  ],
  "calibrationCost": [
    {
      "resource": "reagents",
      "amount": 3
    }
  ],
  "channels": [
    {
      "id": "meanHumidityPct",
      "name": "Relative Humidity",
      "unit": "%",
      "minValid": 0,
      "maxValid": 100,
      "basePrecision": 0.1
    },
    {
      "id": "meanPressureHpa",
      "name": "Barometric Pressure",
      "unit": "hPa",
      "minValid": 800,
      "maxValid": 1100,
      "basePrecision": 0.5
    },
    {
      "id": "meanTemperatureC",
      "name": "Air Temperature",
      "unit": "C",
      "minValid": -50,
      "maxValid": 100,
      "basePrecision": 0.2
    }
  ]
}] as const;


export const atmosphereFeatureModule = new StandardWorldFeatureModule({
  instruments: ATMOSPHERE_INSTRUMENTS,
  nativeActions: ATMOSPHERE_NATIVE_ACTIONS,
  worldId: 'atmosphere',
  capabilities: ATMOSPHERE_CAPABILITIES,
  hazardNodes: ATMOSPHERE_HAZARD_NODES,
  hazardLinks: ATMOSPHERE_HAZARD_LINKS,
  initialBudget: {
    sensor_power: { balance: 50, capacity: 100, replenishmentRate: 1.0 },
    reagents: { balance: 30, capacity: 60, replenishmentRate: 0.5 },
    shelters: { balance: 20, capacity: 40, replenishmentRate: 0.1 },
  },
  actionCosts: {
    'atmosphere.action.cloud_seeding': [
      { resource: 'reagents', amount: 5 },
      { resource: 'sensor_power', amount: 5 },
    ],
    'atmosphere.action.barometric_dampening': [
      { resource: 'reagents', amount: 8 },
      { resource: 'sensor_power', amount: 10 },
    ],
    'atmosphere.action.thermal_sink_deployment': [
      { resource: 'shelters', amount: 4 },
      { resource: 'sensor_power', amount: 15 },
    ],
  },
  actionDeltas: {
    'atmosphere.action.cloud_seeding': [
      { field: 'meanHumidityPct', delta: 15, unit: '%' },
    ],
    'atmosphere.action.barometric_dampening': [
      { field: 'meanPressureHpa', delta: 30, unit: 'hPa' },
    ],
    'atmosphere.action.thermal_sink_deployment': [
      { field: 'meanTemperatureC', delta: -10, unit: 'C' },
    ],
  },
  metricKeys: ['meanHumidityPct', 'meanPressureHpa', 'meanTemperatureC'],
  facilityDefinitions: [
    {
      "typeId": "storm_observation_array",
      "worldId": "atmosphere",
      "name": "Storm Observation Array",
      "description": "High-altitude sensor array tracking hurricane formation and storm fronts.",
      "buildMaterialsCost": [
        {
          "resource": "sensor_power",
          "amount": 8
        },
        {
          "resource": "reagents",
          "amount": 4
        }
      ],
      "buildTicks": 3,
      "upkeepCost": [
        {
          "resource": "sensor_power",
          "amount": 1
        }
      ],
      "benefitMetric": "soilMoisturePct",
      "benefitDeltaPerTick": 2
    },
    {
      "typeId": "rain_collector",
      "worldId": "atmosphere",
      "name": "Atmospheric Rain Collector",
      "description": "Precipitation harvesting rig providing moisture buffers against storm fronts.",
      "buildMaterialsCost": [
        {
          "resource": "shelters",
          "amount": 5
        },
        {
          "resource": "sensor_power",
          "amount": 6
        }
      ],
      "buildTicks": 4,
      "upkeepCost": [
        {
          "resource": "sensor_power",
          "amount": 1
        }
      ],
      "benefitMetric": "humidityRatio",
      "benefitDeltaPerTick": 1.5
    }
  ],
  initialDepots: [
    {
      "siteId": "site-shelter",
      "capacity": 100,
      "inventory": {
        "sensor_power": 30,
        "reagents": 20,
        "shelters": 15
      }
    },
    {
      "siteId": "site-ridge",
      "capacity": 100,
      "inventory": {
        "sensor_power": 20,
        "reagents": 10,
        "shelters": 5
      }
    }
  ],
  initialCouriers: [
    {
      "id": "courier-atmo-1",
      "name": "Atmospheric Drone 1",
      "carrierType": "sky_drone",
      "capacity": 25,
      "speed": 1,
      "location": "site-shelter",
      "currentCargo": {},
      "status": "idle",
      "condition": 100,
      "fuel": 40
    }
  ],
  initialRoutes: [
    {
      "fromSiteId": "site-shelter",
      "toSiteId": "site-ridge",
      "travelTicks": 2,
      "fuelCost": 1
    }
  ],
  emergencies: ATMOSPHERE_EMERGENCIES,
  restorationLayers: ATMOSPHERE_RESTORATION_LAYERS,
  policies: ATMOSPHERE_POLICIES,
});
