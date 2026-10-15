import {
  ActionExecutionReceipt,
  ActionValidationResult,
  FeatureCapability,
  ValidatedAction,
  WorldFeatureModule,
} from '../contracts';
import { createBaseVisibleState } from '../projections';

export const ATMOSPHERE_CAPABILITIES: readonly FeatureCapability[] = [
  {
    "id": "atmosphere.action.moisture_front_control",
    "featureId": "P001",
    "name": "Moisture-Front Control",
    "description": "Native action family 1 for atmosphere: moisture-front control.",
    "minRulesVersion": 1,
    "domainUnits": [
      "pressure",
      "temperature",
      "humidity"
    ],
    "costResource": "supplies"
  },
  {
    "id": "atmosphere.action.instrument_deployment",
    "featureId": "P001",
    "name": "Instrument Deployment",
    "description": "Native action family 2 for atmosphere: instrument deployment.",
    "minRulesVersion": 1,
    "domainUnits": [
      "pressure",
      "temperature",
      "humidity"
    ],
    "costResource": "supplies"
  },
  {
    "id": "atmosphere.action.temporary_countermeasures",
    "featureId": "P001",
    "name": "Temporary Countermeasures",
    "description": "Native action family 3 for atmosphere: temporary countermeasures.",
    "minRulesVersion": 1,
    "domainUnits": [
      "pressure",
      "temperature",
      "humidity"
    ],
    "costResource": "supplies"
  },
  {
    "id": "atmosphere.hazard.monitoring",
    "featureId": "P002",
    "name": "Atmosphere Hazard Monitoring",
    "description": "Ordered hazard dependency graph for atmosphere: moisture loss -> storm instability -> monitoring blindness.",
    "minRulesVersion": 1,
    "domainUnits": [
      "hazard-index"
    ]
  },
  {
    "id": "atmosphere.conservation.ledger",
    "featureId": "P003",
    "name": "Atmosphere Conservation Ledger",
    "description": "Resource-accountable conservation ledger enforcing finite non-negative balances for atmosphere.",
    "minRulesVersion": 1,
    "costResource": "supplies"
  },
  {
    "id": "atmosphere.signature.destination",
    "featureId": "P011",
    "name": "The Station Beneath the Storm",
    "description": "Authored signature destination for atmosphere: The Station Beneath the Storm.",
    "minRulesVersion": 1
  }
];

export const atmosphereFeatureModule: WorldFeatureModule = {
  worldId: 'atmosphere',
  rulesVersion: 1,
  capabilities: ATMOSPHERE_CAPABILITIES,

  validateAction(raw: unknown, _state: Readonly<Record<string, unknown>>): ActionValidationResult {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: 'Malformed action payload' };
    }
    const r = raw as Record<string, unknown>;
    const cap = ATMOSPHERE_CAPABILITIES.find((c) => c.id === r.capabilityId);
    if (!cap) {
      return {
        valid: false,
        error: `Capability ${String(r.capabilityId)} not supported on world atmosphere`,
      };
    }
    return {
      valid: true,
      action: {
        actionFamily: cap.featureId,
        worldId: 'atmosphere',
        capabilityId: cap.id,
        payload: (r.payload as Record<string, unknown>) ?? {},
        cost: cap.costResource ? { resource: cap.costResource, amount: 2 } : undefined,
      },
    };
  },

  applyAction(_state: Record<string, unknown>, action: ValidatedAction, ctx): ActionExecutionReceipt {
    const event = ctx.emitEvent({
      type: `${action.worldId}.action_executed`,
      severity: 'info',
      title: `${action.capabilityId} Executed`,
      description: `Executed ${action.capabilityId} on ${action.worldId} at tick ${ctx.tick}.`,
      sourceSystem: 'feature-module',
      payload: action.payload,
    });

    return {
      actionId: `${action.capabilityId}-${ctx.tick}`,
      worldId: 'atmosphere',
      tick: ctx.tick,
      executedAtTick: ctx.tick,
      status: 'success',
      debits: action.cost ? [action.cost] : [],
      deltas: [],
      eventsEmitted: [event.id],
    };
  },

  projectVisibleState(state: Readonly<Record<string, unknown>>, _viewer) {
    const metricKeys = ["pressure", "temperature", "humidity"];
    const metrics: Record<string, number | string> = {};
    for (const k of metricKeys) {
      if (k in state && (typeof state[k] === 'number' || typeof state[k] === 'string')) {
        metrics[k] = state[k] as number | string;
      }
    }
    return createBaseVisibleState(
      'atmosphere',
      1,
      ATMOSPHERE_CAPABILITIES.map((c) => c.id),
      metrics,
      [],
    );
  },
};
