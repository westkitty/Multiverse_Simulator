import { EmergencyDefinition,
  FeatureCapability,
  PolicyDefinition,
  RestorationLayerDefinition, HazardLink, HazardNode } from '../contracts';
import { StandardWorldFeatureModule } from './domainHelper';

export const GEOLOGY_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'geology.action.deep_bore_pressure_relief',
    featureId: 'P001',
    name: 'Deep Bore Pressure Relief',
    description: 'Drill relief vents into subduction faults to reduce accumulated tectonic stress.',
    minRulesVersion: 1,
    domainUnits: ['meanTectonicStressMpa'],
    costResource: 'bore_capacity',
  },
  {
    id: 'geology.action.seismic_anchor_grouting',
    featureId: 'P001',
    name: 'Seismic Anchor Grouting',
    description: 'Pump high-pressure polymer grout to stabilize rising magma conduits.',
    minRulesVersion: 1,
    domainUnits: ['meanMagmaPressureMpa'],
    costResource: 'reinforcement',
  },
  {
    id: 'geology.action.geothermal_tap_diversion',
    featureId: 'P001',
    name: 'Geothermal Tap Diversion',
    description: 'Reroute subterranean heat flows to restore severed sensor array connections.',
    minRulesVersion: 1,
    domainUnits: ['monitoredCellsPct'],
    costResource: 'sensors',
  },
  {
    id: 'geology.hazard.monitoring',
    featureId: 'P002',
    name: 'Geology Hazard Monitoring',
    description: 'Ordered hazard dependency graph for geology: tectonic stress -> rupture -> inaccessible monitoring.',
    minRulesVersion: 1,
    domainUnits: ['hazard-index'],
  },
  {
    id: 'geology.conservation.ledger',
    featureId: 'P003',
    name: 'Geology Conservation Ledger',
    description: 'Resource-accountable conservation ledger enforcing finite non-negative balances for geology.',
    minRulesVersion: 1,
    costResource: 'reinforcement',
  },
  {
    id: 'geology.signature.destination',
    featureId: 'P011',
    name: 'The Buried Seismic Array',
    description: 'Authored signature destination for geology: The Buried Seismic Array.',
    minRulesVersion: 1,
  },
];

export const GEOLOGY_HAZARD_NODES: readonly HazardNode[] = [
  {
    id: 'tectonic_accumulation',
    label: 'Tectonic Stress Accumulation',
    worldId: 'geology',
    sourceMetric: 'meanTectonicStressMpa',
    targetMetric: 'meanTectonicStressMpa',
    threshold: 80,
    operator: '>',
    severity: 'warning',
    upstreamNodeIds: [],
    mitigationActionFamily: 'geology.action.deep_bore_pressure_relief',
    description: 'Fault friction locking tectonic plates and building catastrophic shear stress',
    observedTriggerTemplate: 'Tectonic stress ({value} MPa) exceeded {threshold} MPa',
    hypothesizedExplanation: 'Subduction zone plate lock preventing gradual seismic energy dissipation',
  },
  {
    id: 'magma_rupture',
    label: 'Magma Rupture',
    worldId: 'geology',
    sourceMetric: 'meanMagmaPressureMpa',
    targetMetric: 'meanMagmaPressureMpa',
    threshold: 70,
    operator: '>',
    severity: 'critical',
    upstreamNodeIds: ['tectonic_accumulation'],
    mitigationActionFamily: 'geology.action.seismic_anchor_grouting',
    description: 'Fractured bedrock opens dikes allowing magma surge toward monitoring stations',
    observedTriggerTemplate: 'Magma pressure ({value} MPa) exceeded {threshold} MPa',
    hypothesizedExplanation: 'Shear fracturing puncturing pressurized sub-crustal magma pockets',
  },
  {
    id: 'sensor_severance',
    label: 'Sensor Severance',
    worldId: 'geology',
    sourceMetric: 'monitoredCellsPct',
    targetMetric: 'monitoredCellsPct',
    threshold: 30,
    operator: '<',
    severity: 'catastrophic',
    upstreamNodeIds: ['magma_rupture'],
    mitigationActionFamily: 'geology.action.geothermal_tap_diversion',
    description: 'Thermal inundation and fault slippage destroys seismic array telemetry',
    observedTriggerTemplate: 'Seismic sensor coverage ({value}%) fell below {threshold}%',
    hypothesizedExplanation: 'Molten rock intrusion severing subterranean telemetry lines and melting array nodes',
  },
];

export const GEOLOGY_HAZARD_LINKS: readonly HazardLink[] = [
  {
    fromNodeId: 'tectonic_accumulation',
    toNodeId: 'magma_rupture',
    causalLinkType: 'direct',
    description: 'Tectonic stress fractures bedrock, releasing pressurized magma dikes',
  },
  {
    fromNodeId: 'magma_rupture',
    toNodeId: 'sensor_severance',
    causalLinkType: 'dependency',
    description: 'Magma intrusion shears cables and melts buried seismic monitoring sensors',
  },
];


export const GEOLOGY_EMERGENCIES: readonly EmergencyDefinition[] = [
  {
    "id": "geology.fault_shear",
    "worldId": "geology",
    "name": "Crustal Rupture & Telemetry Severance",
    "description": "Critical tectonic shear snapping deep geophone arrays and fracturing shafts.",
    "triggerMetric": "meanTectonicStressMpa",
    "triggerOperator": ">",
    "precursorThreshold": 65,
    "activeThreshold": 85,
    "escalateDelayTicks": 4,
    "containmentActionIds": [
      "geology.action.fault_grouting"
    ],
    "consequences": {
      "metricPenaltiesPerTick": {
        "monitoredCellsPct": 3,
        "meanMagmaPressureMpa": 2
      },
      "budgetDrainPerTick": {
        "reinforcement": 1
      },
      "secondaryHazardNodeId": "magma_rupture",
      "description": "Subterranean quakes sever telemetry cables and open magma conduits."
    }
  }
] as const;

export const GEOLOGY_RESTORATION_LAYERS: readonly RestorationLayerDefinition[] = [
  {
    "id": "fault_reinforcement",
    "name": "Fault Grouting & Rockbolting",
    "metricKey": "meanTectonicStressMpa",
    "baselineValue": 95,
    "targetValue": 20,
    "visualElements": {
      "materialColor": "#6d4c41",
      "accentHex": "#a1887f",
      "activeMeshes": [
        "fractured_stratum",
        "anchored_rockbolt_cluster",
        "hydraulic_stabilization_buttress",
        "grout_reinforced_monolith"
      ]
    },
    "stageDescriptions": {
      "degraded": "Gaping fault fractures shedding ceiling rock into deep shafts.",
      "stabilizing": "High-tensile rockbolts secure shifting tectonic plates.",
      "restoring": "Pressurized epoxy grout fills microscopic fracture planes.",
      "flourishing": "Monolithic stabilized bedrock with zero microseismic slip."
    }
  },
  {
    "id": "seismic_monitoring",
    "name": "Deep Borehole Telemetry",
    "metricKey": "monitoredCellsPct",
    "baselineValue": 10,
    "targetValue": 95,
    "visualElements": {
      "materialColor": "#3949ab",
      "accentHex": "#7986cb",
      "activeMeshes": [
        "severed_cable_trunk",
        "repaired_borehole_geophone",
        "triangulated_sensor_array",
        "sub_crustal_deep_tomograph"
      ]
    },
    "stageDescriptions": {
      "degraded": "Blank seismographs and severed downhole sensor fiber.",
      "stabilizing": "Telemetry repeaters spliced along accessible tunnels.",
      "restoring": "Multi-axis geophones recording real-time acoustic emissions.",
      "flourishing": "Complete sub-crustal tomography mapping planetary mantle flow."
    }
  }
] as const;

export const GEOLOGY_POLICIES: readonly PolicyDefinition[] = [
  {
    "id": "geology.hydraulic_fault_lubrication",
    "worldId": "geology",
    "name": "Hydraulic Fault Lubrication",
    "description": "Injects high-pressure fluid into fault gouge to release slip aseismically, shaking nearby sensors.",
    "targetHazard": "tectonic_accumulation",
    "resourceCostsPerTick": {
      "bore_capacity": 3
    },
    "metricBenefitsPerTick": {
      "meanTectonicStressMpa": -4
    },
    "sideEffectsPerTick": {
      "monitoredCellsPct": -2
    },
    "tradeoffSummary": "Relieves catastrophic fault pressure at the cost of temporary sensor blinding."
  },
  {
    "id": "geology.subterranean_strut_reinforcement",
    "worldId": "geology",
    "name": "Subterranean Strut Reinforcement",
    "description": "Braces monitoring caverns with heavy alloy, transferring stress onto surrounding rock.",
    "targetHazard": "sensor_severance",
    "resourceCostsPerTick": {
      "reinforcement": 3
    },
    "metricBenefitsPerTick": {
      "monitoredCellsPct": 3.5
    },
    "sideEffectsPerTick": {
      "meanTectonicStressMpa": 1
    },
    "tradeoffSummary": "Protects deep geophone equipment while elevating surrounding rock stress."
  }
] as const;

export const geologyFeatureModule = new StandardWorldFeatureModule({
  worldId: 'geology',
  capabilities: GEOLOGY_CAPABILITIES,
  hazardNodes: GEOLOGY_HAZARD_NODES,
  hazardLinks: GEOLOGY_HAZARD_LINKS,
  initialBudget: {
    reinforcement: { balance: 40, capacity: 80, replenishmentRate: 0.5 },
    bore_capacity: { balance: 30, capacity: 60, replenishmentRate: 0.4 },
    sensors: { balance: 25, capacity: 50, replenishmentRate: 0.3 },
  },
  actionCosts: {
    'geology.action.deep_bore_pressure_relief': [
      { resource: 'bore_capacity', amount: 8 },
      { resource: 'reinforcement', amount: 5 },
    ],
    'geology.action.seismic_anchor_grouting': [
      { resource: 'reinforcement', amount: 12 },
      { resource: 'bore_capacity', amount: 6 },
    ],
    'geology.action.geothermal_tap_diversion': [
      { resource: 'sensors', amount: 6 },
      { resource: 'bore_capacity', amount: 8 },
    ],
  },
  actionDeltas: {
    'geology.action.deep_bore_pressure_relief': [
      { field: 'meanTectonicStressMpa', delta: -25, unit: 'MPa' },
    ],
    'geology.action.seismic_anchor_grouting': [
      { field: 'meanMagmaPressureMpa', delta: -20, unit: 'MPa' },
    ],
    'geology.action.geothermal_tap_diversion': [
      { field: 'monitoredCellsPct', delta: 35, unit: '%' },
    ],
  },
  metricKeys: ['meanTectonicStressMpa', 'meanMagmaPressureMpa', 'monitoredCellsPct'],
  facilityDefinitions: [
    {
      "typeId": "fault_brace",
      "worldId": "geology",
      "name": "Hydraulic Fault-Line Brace",
      "description": "High-tensile hydraulic struts bracing tectonic fissures against collapse.",
      "buildMaterialsCost": [
        {
          "resource": "reinforcement",
          "amount": 6
        },
        {
          "resource": "bore_capacity",
          "amount": 4
        }
      ],
      "buildTicks": 3,
      "upkeepCost": [
        {
          "resource": "reinforcement",
          "amount": 1
        }
      ],
      "benefitMetric": "infrastructureIntegrity",
      "benefitDeltaPerTick": 2
    },
    {
      "typeId": "seismic_sensor_array",
      "worldId": "geology",
      "name": "Deep Borehole Seismic Array",
      "description": "Subterranean geophone network monitoring acoustic precursor pulses.",
      "buildMaterialsCost": [
        {
          "resource": "sensors",
          "amount": 5
        },
        {
          "resource": "reinforcement",
          "amount": 5
        }
      ],
      "buildTicks": 4,
      "upkeepCost": [
        {
          "resource": "sensors",
          "amount": 1
        }
      ],
      "benefitMetric": "tectonicRelief",
      "benefitDeltaPerTick": 1.5
    }
  ],
  initialDepots: [
    {
      "siteId": "site-mine",
      "capacity": 100,
      "inventory": {
        "reinforcement": 25,
        "bore_capacity": 20,
        "sensors": 15
      }
    },
    {
      "siteId": "site-array",
      "capacity": 100,
      "inventory": {
        "reinforcement": 15,
        "bore_capacity": 10,
        "sensors": 10
      }
    }
  ],
  initialCouriers: [
    {
      "id": "courier-geo-1",
      "name": "Mountain Transport Hauler",
      "carrierType": "field_hauler",
      "capacity": 30,
      "speed": 1,
      "location": "site-mine",
      "currentCargo": {},
      "status": "idle",
      "condition": 100,
      "fuel": 40
    }
  ],
  initialRoutes: [
    {
      "fromSiteId": "site-mine",
      "toSiteId": "site-array",
      "travelTicks": 2,
      "fuelCost": 1
    }
  ],
  emergencies: GEOLOGY_EMERGENCIES,
  restorationLayers: GEOLOGY_RESTORATION_LAYERS,
  policies: GEOLOGY_POLICIES,
});
