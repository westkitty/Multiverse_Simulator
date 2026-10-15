import {
  NativeActionFamilyDefinition,
  ScientificInstrumentConfig, EmergencyDefinition,
  FeatureCapability,
  PolicyDefinition,
  RestorationLayerDefinition, HazardLink, HazardNode } from '../contracts';
import { StandardWorldFeatureModule } from './domainHelper';

export const SIGNAL_EXPANSE_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'signalExpanse.action.rf_notch_filtering',
    featureId: 'P001',
    name: 'RF Notch Filtering',
    description: 'Tune digital notch filters to cancel out ambient radio frequency noise spikes.',
    minRulesVersion: 1,
    domainUnits: ['noise'],
    costResource: 'calibration_power',
  },
  {
    id: 'signalExpanse.action.gimbal_servo_recalibration',
    featureId: 'P001',
    name: 'Gimbal Servo Recalibration',
    description: 'Realign parabolic dish steerers to maximize cross-array signal coverage.',
    minRulesVersion: 1,
    domainUnits: ['coverage'],
    costResource: 'relay_parts',
  },
  {
    id: 'signalExpanse.action.coherent_integrator_lock',
    featureId: 'P001',
    name: 'Coherent Integrator Lock',
    description: 'Synchronize cryogenic local oscillators to lock onto degraded interstellar carrier signals.',
    minRulesVersion: 1,
    domainUnits: ['signal'],
    costResource: 'processing_capacity',
  },
  {
    id: 'signalExpanse.hazard.monitoring',
    featureId: 'P002',
    name: 'Signal Expanse Hazard Monitoring',
    description: 'Ordered hazard dependency graph for signal-expanse: interference -> coverage loss -> false/fragmented observations.',
    minRulesVersion: 1,
    domainUnits: ['hazard-index'],
  },
  {
    id: 'signalExpanse.conservation.ledger',
    featureId: 'P003',
    name: 'Signal Expanse Conservation Ledger',
    description: 'Resource-accountable conservation ledger enforcing finite non-negative balances for signal-expanse.',
    minRulesVersion: 1,
    costResource: 'calibration_power',
  },
  {
    id: 'signalExpanse.signature.destination',
    featureId: 'P011',
    name: 'Last Transmission',
    description: 'Authored signature destination for signal-expanse: Last Transmission.',
    minRulesVersion: 1,
  },
];

export const SIGNAL_EXPANSE_HAZARD_NODES: readonly HazardNode[] = [
  {
    id: 'atmospheric_flutter',
    label: 'Atmospheric Flutter',
    worldId: 'signal-expanse',
    sourceMetric: 'noise',
    targetMetric: 'noise',
    threshold: 70,
    operator: '>',
    severity: 'warning',
    upstreamNodeIds: [],
    mitigationActionFamily: 'signalExpanse.action.rf_notch_filtering',
    description: 'Ionospheric scintillation generates severe RF background interference',
    observedTriggerTemplate: 'RF spectrum noise floor ({value} dBm) exceeded {threshold} dBm',
    hypothesizedExplanation: 'High-altitude plasma storms scattering radio telescope reception beams',
  },
  {
    id: 'dish_misalignment',
    label: 'Dish Misalignment',
    worldId: 'signal-expanse',
    sourceMetric: 'coverage',
    targetMetric: 'coverage',
    threshold: 30,
    operator: '<',
    severity: 'critical',
    upstreamNodeIds: ['atmospheric_flutter'],
    mitigationActionFamily: 'signalExpanse.action.gimbal_servo_recalibration',
    description: 'Interferometer array loses phase lock, dropping spatial baseline coverage',
    observedTriggerTemplate: 'Interferometer baseline coverage ({value}%) fell below {threshold}%',
    hypothesizedExplanation: 'Thermal expansion and mechanical drift throwing antenna gimbals out of phase alignment',
  },
  {
    id: 'telemetry_loss',
    label: 'Telemetry Loss',
    worldId: 'signal-expanse',
    sourceMetric: 'signal',
    targetMetric: 'signal',
    threshold: 25,
    operator: '<',
    severity: 'catastrophic',
    upstreamNodeIds: ['dish_misalignment'],
    mitigationActionFamily: 'signalExpanse.action.coherent_integrator_lock',
    description: 'Decoded transmission carrier signal collapses into noise, losing all data',
    observedTriggerTemplate: 'Decoded signal SNR ({value} dB) fell below {threshold} dB',
    hypothesizedExplanation: 'Severe phase jitter and carrier loss causing irreversible frame synchronization collapse',
  },
];

export const SIGNAL_EXPANSE_HAZARD_LINKS: readonly HazardLink[] = [
  {
    fromNodeId: 'atmospheric_flutter',
    toNodeId: 'dish_misalignment',
    causalLinkType: 'direct',
    description: 'Noise spikes degrade tracking telemetry, causing dish pointing servos to drift',
  },
  {
    fromNodeId: 'dish_misalignment',
    toNodeId: 'telemetry_loss',
    causalLinkType: 'dependency',
    description: 'Phase misalignment drops array gain below the threshold needed to lock onto the signal',
  },
];


export const SIGNAL_EXPANSE_EMERGENCIES: readonly EmergencyDefinition[] = [
  {
    "id": "signal_expanse.carrier_jamming",
    "worldId": "signal-expanse",
    "name": "Ionospheric Jamming & Telemetry Blackout",
    "description": "Atmospheric interference saturating parabolic dishes with blind static.",
    "triggerMetric": "noise",
    "triggerOperator": ">",
    "precursorThreshold": 65,
    "activeThreshold": 85,
    "escalateDelayTicks": 4,
    "containmentActionIds": [
      "signal_expanse.action.dish_alignment"
    ],
    "consequences": {
      "metricPenaltiesPerTick": {
        "coverage": 2.5,
        "signal": 2
      },
      "budgetDrainPerTick": {
        "calibration_power": 1
      },
      "secondaryHazardNodeId": "dish_misalignment",
      "description": "High noise floor severs inter-dish phasing and loses celestial targets."
    }
  }
] as const;

export const SIGNAL_EXPANSE_RESTORATION_LAYERS: readonly RestorationLayerDefinition[] = [
  {
    "id": "dish_interferometer",
    "name": "Interferometer Dish Phasing",
    "metricKey": "signal",
    "baselineValue": 10,
    "targetValue": 85,
    "visualElements": {
      "materialColor": "#5c6bc0",
      "accentHex": "#9fa8da",
      "activeMeshes": [
        "de-phased_mesh_reflector",
        "mechanically_steered_horn",
        "cryogenic_receiver_hub",
        "superconducting_interferometer_baseline"
      ]
    },
    "stageDescriptions": {
      "degraded": "Divergent, warped wire-mesh dishes pointing randomly at the ground.",
      "stabilizing": "Actuators synchronize azimuth drives toward polar transit points.",
      "restoring": "Precision parabolic antennas locked on coherent deep-space frequencies.",
      "flourishing": "Flawlessly phased kilometer-scale radio telescope network."
    }
  },
  {
    "id": "subcarrier_noise_filter",
    "name": "Subcarrier Noise Floor Reduction",
    "metricKey": "noise",
    "baselineValue": 90,
    "targetValue": 15,
    "visualElements": {
      "materialColor": "#26c6da",
      "accentHex": "#80deea",
      "activeMeshes": [
        "static_snow",
        "subcarrier_frequency_lock",
        "comb_filter_demodulator",
        "pure_carrier_sine_wave"
      ]
    },
    "stageDescriptions": {
      "degraded": "Hissing static and blinding RF interference obscuring all data.",
      "stabilizing": "Digital notch filters cancel out local ionospheric harmonics.",
      "restoring": "Clear, filtered pulse streams resolving celestial signals.",
      "flourishing": "Ultra-quiet cryogenic baseline receiving crisp interstellar transmissions."
    }
  }
] as const;

export const SIGNAL_EXPANSE_POLICIES: readonly PolicyDefinition[] = [
  {
    "id": "signal_expanse.narrowband_cryogenic_filtering",
    "worldId": "signal-expanse",
    "name": "Narrowband Cryogenic Filtering",
    "description": "Chills receiver front-ends with liquid helium to cut thermal noise, narrowing beam reception angle.",
    "targetHazard": "atmospheric_flutter",
    "resourceCostsPerTick": {
      "calibration_power": 3
    },
    "metricBenefitsPerTick": {
      "noise": -3.5
    },
    "sideEffectsPerTick": {
      "coverage": -1
    },
    "tradeoffSummary": "Eliminates radio noise floor completely while slightly narrowing the sky search area."
  },
  {
    "id": "signal_expanse.multi_baseline_interferometric_mesh",
    "worldId": "signal-expanse",
    "name": "Multi-Baseline Interferometric Mesh",
    "description": "Cross-correlates distant auxiliary antennas, introducing slight quantization jitter.",
    "targetHazard": "telemetry_loss",
    "resourceCostsPerTick": {
      "relay_parts": 2
    },
    "metricBenefitsPerTick": {
      "coverage": 3.5
    },
    "sideEffectsPerTick": {
      "noise": 1
    },
    "tradeoffSummary": "Expands observable sky coverage rapidly while adding minor correlation noise."
  }
] as const;

export const SIGNAL_EXPANSE_NATIVE_ACTIONS: readonly NativeActionFamilyDefinition[] = [
  {
    "id": "signalExpanse.action.rf_notch_filtering",
    "worldId": "signal-expanse",
    "familyKey": "rf_notch_filtering",
    "name": "Interference Suppression",
    "description": "Apply cryogenic notch filters to eliminate interstellar plasma noise spikes.",
    "readSet": [
      "noise",
      "signal"
    ],
    "writeSet": [
      "noise",
      "signal"
    ],
    "prerequisites": [
      {
        "field": "noise",
        "condition": ">",
        "threshold": -45
      }
    ],
    "resourceCosts": [
      {
        "resource": "calibration_power",
        "amount": 4
      },
      {
        "resource": "relay_parts",
        "amount": 2
      }
    ],
    "deltas": [
      {
        "field": "noise",
        "delta": -22,
        "unit": "dBm"
      },
      {
        "field": "signal",
        "delta": 6,
        "unit": "dB"
      }
    ],
    "decisionImplication": "Quiets background radio chatter to unmask faint deep-space transmissions.",
    "dynamicHelp": "Engage notch filters when thermal noise rises above -45 dBm."
  },
  {
    "id": "signalExpanse.action.gimbal_servo_recalibration",
    "worldId": "signal-expanse",
    "familyKey": "gimbal_servo_recalibration",
    "name": "Antenna Array Calibration",
    "description": "Phase-align multi-dish interferometers to maximize synthetic aperture baseline.",
    "readSet": [
      "coverage",
      "signal"
    ],
    "writeSet": [
      "coverage",
      "signal"
    ],
    "prerequisites": [
      {
        "field": "coverage",
        "condition": "<",
        "threshold": 45
      }
    ],
    "resourceCosts": [
      {
        "resource": "relay_parts",
        "amount": 4
      },
      {
        "resource": "processing_capacity",
        "amount": 3
      }
    ],
    "deltas": [
      {
        "field": "coverage",
        "delta": 25,
        "unit": "%"
      },
      {
        "field": "signal",
        "delta": 5,
        "unit": "dB"
      }
    ],
    "decisionImplication": "Restores telescope geometry for precise astronomical source triangulation.",
    "dynamicHelp": "Calibrate dish gimbals when baseline coverage drops below 45%."
  },
  {
    "id": "signalExpanse.action.coherent_integrator_lock",
    "worldId": "signal-expanse",
    "familyKey": "coherent_integrator_lock",
    "name": "Distributed Signal Reconstruction",
    "description": "Lock coherent Fourier correlators onto repeating pulses to reconstruct message data.",
    "readSet": [
      "signal",
      "noise"
    ],
    "writeSet": [
      "signal",
      "noise"
    ],
    "prerequisites": [
      {
        "field": "signal",
        "condition": "<",
        "threshold": 35
      }
    ],
    "resourceCosts": [
      {
        "resource": "processing_capacity",
        "amount": 5
      },
      {
        "resource": "calibration_power",
        "amount": 4
      }
    ],
    "deltas": [
      {
        "field": "signal",
        "delta": 25,
        "unit": "dB"
      },
      {
        "field": "noise",
        "delta": -4,
        "unit": "dBm"
      }
    ],
    "decisionImplication": "Pulls weak candidate carrier waves out of the static using heavy FFT compute.",
    "dynamicHelp": "Lock correlators when carrier SNR falls below 35 dB."
  }
] as const;


export const SIGNAL_EXPANSE_INSTRUMENTS: readonly ScientificInstrumentConfig[] = [{
  "id": "signalExpanse.instrument.radio_interferometer_receiver",
  "worldId": "signal-expanse",
  "name": "Last Transmission Interferometer Receiver",
  "description": "Measures cryogenic RF noise floor, antenna baseline coverage, and coherent signal SNR.",
  "deviceClass": "spectral_analyzer",
  "sampleCost": [
    {
      "resource": "calibration_power",
      "amount": 1
    }
  ],
  "calibrationCost": [
    {
      "resource": "relay_parts",
      "amount": 2
    }
  ],
  "channels": [
    {
      "id": "noise",
      "name": "Cryogenic Noise Floor",
      "unit": "dBm",
      "minValid": -120,
      "maxValid": 0,
      "basePrecision": 0.5
    },
    {
      "id": "coverage",
      "name": "Antenna Baseline Coverage",
      "unit": "%",
      "minValid": 0,
      "maxValid": 100,
      "basePrecision": 0.1
    },
    {
      "id": "signal",
      "name": "Coherent Carrier Signal SNR",
      "unit": "dB",
      "minValid": 0,
      "maxValid": 100,
      "basePrecision": 0.2
    }
  ]
}] as const;


export const signalExpanseFeatureModule = new StandardWorldFeatureModule({
  instruments: SIGNAL_EXPANSE_INSTRUMENTS,
  nativeActions: SIGNAL_EXPANSE_NATIVE_ACTIONS,
  worldId: 'signal-expanse',
  capabilities: SIGNAL_EXPANSE_CAPABILITIES,
  hazardNodes: SIGNAL_EXPANSE_HAZARD_NODES,
  hazardLinks: SIGNAL_EXPANSE_HAZARD_LINKS,
  initialBudget: {
    calibration_power: { balance: 60, capacity: 120, replenishmentRate: 1.5 },
    relay_parts: { balance: 40, capacity: 80, replenishmentRate: 0.5 },
    processing_capacity: { balance: 50, capacity: 100, replenishmentRate: 1.0 },
  },
  actionCosts: {
    'signalExpanse.action.rf_notch_filtering': [
      { resource: 'calibration_power', amount: 10 },
      { resource: 'processing_capacity', amount: 6 },
    ],
    'signalExpanse.action.gimbal_servo_recalibration': [
      { resource: 'relay_parts', amount: 8 },
      { resource: 'calibration_power', amount: 12 },
    ],
    'signalExpanse.action.coherent_integrator_lock': [
      { resource: 'processing_capacity', amount: 15 },
      { resource: 'calibration_power', amount: 8 },
    ],
  },
  actionDeltas: {
    'signalExpanse.action.rf_notch_filtering': [
      { field: 'noise', delta: -30, unit: 'dBm' },
    ],
    'signalExpanse.action.gimbal_servo_recalibration': [
      { field: 'coverage', delta: 25, unit: '%' },
    ],
    'signalExpanse.action.coherent_integrator_lock': [
      { field: 'signal', delta: 30, unit: 'dB' },
    ],
  },
  metricKeys: ['noise', 'coverage', 'signal'],
  facilityDefinitions: [
    {
      "typeId": "signal_relay",
      "worldId": "signal-expanse",
      "name": "Interstellar Signal Relay",
      "description": "Phased microwave array amplifying faint deep-space radio telemetry.",
      "buildMaterialsCost": [
        {
          "resource": "calibration_power",
          "amount": 10
        },
        {
          "resource": "relay_parts",
          "amount": 6
        }
      ],
      "buildTicks": 3,
      "upkeepCost": [
        {
          "resource": "calibration_power",
          "amount": 1
        }
      ],
      "benefitMetric": "carrierGainDb",
      "benefitDeltaPerTick": 2
    },
    {
      "typeId": "interferometer",
      "worldId": "signal-expanse",
      "name": "Sub-Millimeter Interferometer",
      "description": "Cryogenically cooled antenna array resolving fine spatial harmonics.",
      "buildMaterialsCost": [
        {
          "resource": "processing_capacity",
          "amount": 8
        },
        {
          "resource": "relay_parts",
          "amount": 6
        }
      ],
      "buildTicks": 4,
      "upkeepCost": [
        {
          "resource": "processing_capacity",
          "amount": 1
        }
      ],
      "benefitMetric": "interferometryBaselineKm",
      "benefitDeltaPerTick": 1.5
    }
  ],
  initialDepots: [
    {
      "siteId": "site-array",
      "capacity": 100,
      "inventory": {
        "calibration_power": 40,
        "relay_parts": 25,
        "processing_capacity": 30
      }
    },
    {
      "siteId": "site-receiver",
      "capacity": 100,
      "inventory": {
        "calibration_power": 20,
        "relay_parts": 15,
        "processing_capacity": 20
      }
    }
  ],
  initialCouriers: [
    {
      "id": "courier-signal-1",
      "name": "Expanse Data Drone",
      "carrierType": "sky_drone",
      "capacity": 30,
      "speed": 1,
      "location": "site-array",
      "currentCargo": {},
      "status": "idle",
      "condition": 100,
      "fuel": 50
    }
  ],
  initialRoutes: [
    {
      "fromSiteId": "site-array",
      "toSiteId": "site-receiver",
      "travelTicks": 2,
      "fuelCost": 1
    }
  ],
  emergencies: SIGNAL_EXPANSE_EMERGENCIES,
  restorationLayers: SIGNAL_EXPANSE_RESTORATION_LAYERS,
  policies: SIGNAL_EXPANSE_POLICIES,
});
