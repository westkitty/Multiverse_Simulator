import { EmergencyDefinition,
  FeatureCapability,
  PolicyDefinition,
  RestorationLayerDefinition, HazardLink, HazardNode } from '../contracts';
import { StandardWorldFeatureModule } from './domainHelper';

export const STATION_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'station.action.compartment_sealing',
    featureId: 'P001',
    name: 'Compartment Sealing',
    description: 'Seal leaking ring bulkhead to arrest atmospheric pressure drop.',
    minRulesVersion: 1,
    domainUnits: ['meanPressureKpa'],
    costResource: 'power',
  },
  {
    id: 'station.action.scrubber_overhaul',
    featureId: 'P001',
    name: 'Scrubber Overhaul',
    description: 'Replace depleted scrubber chemical cartridges to restore O2 reserves.',
    minRulesVersion: 1,
    domainUnits: ['o2ReserveMoles'],
    costResource: 'scrubbers',
  },
  {
    id: 'station.action.life_support_priority',
    featureId: 'P001',
    name: 'Life Support Priority',
    description: 'Route emergency oxygen and battery banks to medical bays.',
    minRulesVersion: 1,
    domainUnits: ['meanCrewHealth'],
    costResource: 'emergency_o2',
  },
  {
    id: 'station.hazard.monitoring',
    featureId: 'P002',
    name: 'Station Hazard Monitoring',
    description: 'Ordered hazard dependency graph for station: pressure leakage -> oxygen depletion -> compartment shutdown.',
    minRulesVersion: 1,
    domainUnits: ['hazard-index'],
  },
  {
    id: 'station.conservation.ledger',
    featureId: 'P003',
    name: 'Station Conservation Ledger',
    description: 'Resource-accountable conservation ledger enforcing finite non-negative balances for station.',
    minRulesVersion: 1,
    costResource: 'power',
  },
  {
    id: 'station.signature.destination',
    featureId: 'P011',
    name: 'The Dark Habitation Ring',
    description: 'Authored signature destination for station: The Dark Habitation Ring.',
    minRulesVersion: 1,
  },
];

export const STATION_HAZARD_NODES: readonly HazardNode[] = [
  {
    id: 'pressure_leak',
    label: 'Pressure Leakage',
    worldId: 'station',
    sourceMetric: 'meanPressureKpa',
    targetMetric: 'meanPressureKpa',
    threshold: 80,
    operator: '<',
    severity: 'warning',
    upstreamNodeIds: [],
    mitigationActionFamily: 'station.action.compartment_sealing',
    description: 'Ring air pressure dropped below habitable standard',
    observedTriggerTemplate: 'Ring pressure ({value} kPa) fell below {threshold} kPa',
    hypothesizedExplanation: 'Micrometeoroid breach or seal fatigue venting atmosphere to space',
  },
  {
    id: 'oxygen_depletion',
    label: 'Oxygen Depletion',
    worldId: 'station',
    sourceMetric: 'o2ReserveMoles',
    targetMetric: 'o2ReserveMoles',
    threshold: 500,
    operator: '<',
    severity: 'critical',
    upstreamNodeIds: ['pressure_leak'],
    mitigationActionFamily: 'station.action.scrubber_overhaul',
    description: 'Available breathable oxygen falling to dangerous thresholds',
    observedTriggerTemplate: 'O2 reserve ({value} mol) dropped below {threshold} mol',
    hypothesizedExplanation: 'Vent loss combined with saturated CO2 scrubbers starving oxygen recycling',
  },
  {
    id: 'compartment_shutdown',
    label: 'Compartment Shutdown',
    worldId: 'station',
    sourceMetric: 'meanCrewHealth',
    targetMetric: 'meanCrewHealth',
    threshold: 40,
    operator: '<',
    severity: 'catastrophic',
    upstreamNodeIds: ['oxygen_depletion'],
    mitigationActionFamily: 'station.action.life_support_priority',
    description: 'Crew hypoxia forces evacuation and compartment lockdown',
    observedTriggerTemplate: 'Crew health ({value}) dropped below {threshold}',
    hypothesizedExplanation: 'Unmitigated hypoxia causing widespread neurological distress and evacuation',
  },
];

export const STATION_HAZARD_LINKS: readonly HazardLink[] = [
  {
    fromNodeId: 'pressure_leak',
    toNodeId: 'oxygen_depletion',
    causalLinkType: 'direct',
    description: 'Pressure loss vents oxygen into space faster than scrubber replenishment',
  },
  {
    fromNodeId: 'oxygen_depletion',
    toNodeId: 'compartment_shutdown',
    causalLinkType: 'dependency',
    description: 'Severe hypoxia induces crew incapacitation and module abandonment',
  },
];


export const STATION_EMERGENCIES: readonly EmergencyDefinition[] = [
  {
    "id": "station.hull_depressurization",
    "worldId": "station",
    "name": "Rapid Hull Depressurization",
    "description": "Breached seals evacuate oxygen and cause secondary electrical fires.",
    "triggerMetric": "meanPressureKpa",
    "triggerOperator": "<",
    "precursorThreshold": 80,
    "activeThreshold": 50,
    "escalateDelayTicks": 4,
    "containmentActionIds": [
      "station.action.compartment_sealing"
    ],
    "consequences": {
      "metricPenaltiesPerTick": {
        "o2ReserveMoles": 50,
        "meanCrewHealth": 1.5
      },
      "budgetDrainPerTick": {
        "emergency_o2": 2
      },
      "secondaryHazardNodeId": "oxygen_depletion",
      "description": "Escaping atmosphere starves compartments and drains emergency life support."
    }
  }
] as const;

export const STATION_RESTORATION_LAYERS: readonly RestorationLayerDefinition[] = [
  {
    "id": "pressure_bulkheads",
    "name": "Bulkhead Pressure Integrity",
    "metricKey": "meanPressureKpa",
    "baselineValue": 40,
    "targetValue": 101.3,
    "visualElements": {
      "materialColor": "#455a64",
      "accentHex": "#90a4ae",
      "activeMeshes": [
        "breached_frame",
        "clamped_seal",
        "welded_plate",
        "pressurized_chamber"
      ]
    },
    "stageDescriptions": {
      "degraded": "Buckled frames venting atmosphere into vacuum.",
      "stabilizing": "Temporary emergency clamps arrest major pressure drops.",
      "restoring": "Robotic welders secure heavy airtight plates.",
      "flourishing": "Pristine habitat ring with certified atmospheric seal."
    }
  },
  {
    "id": "illumination_grid",
    "name": "Station Compartment Illumination",
    "metricKey": "meanCrewHealth",
    "baselineValue": 20,
    "targetValue": 100,
    "visualElements": {
      "materialColor": "#fbc02d",
      "accentHex": "#fff59d",
      "activeMeshes": [
        "emergency_red_beacon",
        "flickering_corridor",
        "primary_hall_lighting",
        "biosphere_illumination"
      ]
    },
    "stageDescriptions": {
      "degraded": "Strobe red emergency claxons and blackened corridors.",
      "stabilizing": "Low-voltage auxiliary lighting restored along transit spine.",
      "restoring": "Full daytime simulation lighting engaged in primary rings.",
      "flourishing": "Warm, radiant full-spectrum illumination across all sectors."
    }
  }
] as const;

export const STATION_POLICIES: readonly PolicyDefinition[] = [
  {
    "id": "station.bulkhead_airlock_containment",
    "worldId": "station",
    "name": "Bulkhead Airlock Containment",
    "description": "Pressurizes critical habitats with reserve O2 while placing severe draw on power.",
    "targetHazard": "pressure_leak",
    "resourceCostsPerTick": {
      "emergency_o2": 3
    },
    "metricBenefitsPerTick": {
      "meanPressureKpa": 3.5
    },
    "sideEffectsPerTick": {
      "meanCrewHealth": -0.5
    },
    "tradeoffSummary": "Rapid pressure recovery at high emergency oxygen burn, causing spatial disorientation."
  },
  {
    "id": "station.auxiliary_scrubber_overdrive",
    "worldId": "station",
    "name": "Auxiliary Scrubber Overdrive",
    "description": "Boosts breathable reserves by running chemical scrubbers at continuous maximum duty.",
    "targetHazard": "oxygen_depletion",
    "resourceCostsPerTick": {
      "scrubbers": 2
    },
    "metricBenefitsPerTick": {
      "o2ReserveMoles": 60
    },
    "sideEffectsPerTick": {
      "meanPressureKpa": -0.5
    },
    "tradeoffSummary": "Cleans toxic air rapidly but vents small amounts of pressurization gas."
  }
] as const;

export const stationFeatureModule = new StandardWorldFeatureModule({
  worldId: 'station',
  capabilities: STATION_CAPABILITIES,
  hazardNodes: STATION_HAZARD_NODES,
  hazardLinks: STATION_HAZARD_LINKS,
  initialBudget: {
    power: { balance: 100, capacity: 200, replenishmentRate: 2.0 },
    scrubbers: { balance: 20, capacity: 50, replenishmentRate: 0.2 },
    emergency_o2: { balance: 50, capacity: 100, replenishmentRate: 0.5 },
  },
  actionCosts: {
    'station.action.compartment_sealing': [
      { resource: 'power', amount: 10 },
      { resource: 'scrubbers', amount: 2 },
    ],
    'station.action.scrubber_overhaul': [
      { resource: 'scrubbers', amount: 4 },
      { resource: 'power', amount: 15 },
    ],
    'station.action.life_support_priority': [
      { resource: 'emergency_o2', amount: 10 },
      { resource: 'power', amount: 20 },
    ],
  },
  actionDeltas: {
    'station.action.compartment_sealing': [
      { field: 'meanPressureKpa', delta: 15, unit: 'kPa' },
    ],
    'station.action.scrubber_overhaul': [
      { field: 'o2ReserveMoles', delta: 250, unit: 'mol' },
    ],
    'station.action.life_support_priority': [
      { field: 'meanCrewHealth', delta: 25, unit: '%' },
    ],
  },
  metricKeys: ['meanPressureKpa', 'o2ReserveMoles', 'meanCrewHealth'],
  facilityDefinitions: [
    {
      "typeId": "life_support_scrubber",
      "worldId": "station",
      "name": "Life-Support Atmospheric Scrubber",
      "description": "Circulates and purifies habitat air, restoring oxygen reserves.",
      "buildMaterialsCost": [
        {
          "resource": "scrubbers",
          "amount": 4
        },
        {
          "resource": "power",
          "amount": 8
        }
      ],
      "buildTicks": 3,
      "upkeepCost": [
        {
          "resource": "power",
          "amount": 1
        }
      ],
      "benefitMetric": "o2ReserveMoles",
      "benefitDeltaPerTick": 25
    },
    {
      "typeId": "pressure_bulkhead",
      "worldId": "station",
      "name": "Reinforced Pressure Bulkhead",
      "description": "Seals structural breaches and sustains compartment pressure.",
      "buildMaterialsCost": [
        {
          "resource": "emergency_o2",
          "amount": 5
        },
        {
          "resource": "power",
          "amount": 6
        }
      ],
      "buildTicks": 4,
      "upkeepCost": [
        {
          "resource": "power",
          "amount": 1
        }
      ],
      "benefitMetric": "meanPressureKpa",
      "benefitDeltaPerTick": 2
    }
  ],
  initialDepots: [
    {
      "siteId": "site-airlock",
      "capacity": 100,
      "inventory": {
        "scrubbers": 15,
        "power": 40,
        "emergency_o2": 25
      }
    },
    {
      "siteId": "site-habitation",
      "capacity": 100,
      "inventory": {
        "scrubbers": 5,
        "power": 60,
        "emergency_o2": 25
      }
    }
  ],
  initialCouriers: [
    {
      "id": "courier-station-1",
      "name": "Ring Transport Rail",
      "carrierType": "crawler_train",
      "capacity": 30,
      "speed": 1,
      "location": "site-airlock",
      "currentCargo": {},
      "status": "idle",
      "condition": 100,
      "fuel": 40
    }
  ],
  initialRoutes: [
    {
      "fromSiteId": "site-airlock",
      "toSiteId": "site-habitation",
      "travelTicks": 2,
      "fuelCost": 1
    }
  ],
  emergencies: STATION_EMERGENCIES,
  restorationLayers: STATION_RESTORATION_LAYERS,
  policies: STATION_POLICIES,
});
