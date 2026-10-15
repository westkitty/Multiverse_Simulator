import { FeatureCapability, HazardLink, HazardNode } from '../contracts';
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

export const signalExpanseFeatureModule = new StandardWorldFeatureModule({
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
});
