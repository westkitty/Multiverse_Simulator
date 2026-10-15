import { FeatureCapability, HazardLink, HazardNode } from '../contracts';
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

export const atmosphereFeatureModule = new StandardWorldFeatureModule({
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
});
