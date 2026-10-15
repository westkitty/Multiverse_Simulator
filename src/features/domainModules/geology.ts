import {
  ActionExecutionReceipt,
  ActionValidationResult,
  FeatureCapability,
  ValidatedAction,
  WorldFeatureModule,
} from '../contracts';
import { createBaseVisibleState } from '../projections';

export const GEOLOGY_CAPABILITIES: readonly FeatureCapability[] = [
  {
    "id": "geology.action.pressure_venting",
    "featureId": "P001",
    "name": "Pressure Venting",
    "description": "Native action family 1 for geology: pressure venting.",
    "minRulesVersion": 1,
    "domainUnits": [
      "tectonic stress",
      "magma pressure",
      "sensor coverage"
    ],
    "costResource": "supplies"
  },
  {
    "id": "geology.action.fault_reinforcement",
    "featureId": "P001",
    "name": "Fault Reinforcement",
    "description": "Native action family 2 for geology: fault reinforcement.",
    "minRulesVersion": 1,
    "domainUnits": [
      "tectonic stress",
      "magma pressure",
      "sensor coverage"
    ],
    "costResource": "supplies"
  },
  {
    "id": "geology.action.sensor_coverage",
    "featureId": "P001",
    "name": "Sensor Coverage",
    "description": "Native action family 3 for geology: sensor coverage.",
    "minRulesVersion": 1,
    "domainUnits": [
      "tectonic stress",
      "magma pressure",
      "sensor coverage"
    ],
    "costResource": "supplies"
  },
  {
    "id": "geology.hazard.monitoring",
    "featureId": "P002",
    "name": "Geology Hazard Monitoring",
    "description": "Ordered hazard dependency graph for geology: tectonic stress -> rupture -> inaccessible monitoring.",
    "minRulesVersion": 1,
    "domainUnits": [
      "hazard-index"
    ]
  },
  {
    "id": "geology.conservation.ledger",
    "featureId": "P003",
    "name": "Geology Conservation Ledger",
    "description": "Resource-accountable conservation ledger enforcing finite non-negative balances for geology.",
    "minRulesVersion": 1,
    "costResource": "supplies"
  },
  {
    "id": "geology.signature.destination",
    "featureId": "P011",
    "name": "The Buried Seismic Array",
    "description": "Authored signature destination for geology: The Buried Seismic Array.",
    "minRulesVersion": 1
  }
];

export const geologyFeatureModule: WorldFeatureModule = {
  worldId: 'geology',
  rulesVersion: 1,
  capabilities: GEOLOGY_CAPABILITIES,

  validateAction(raw: unknown, _state: Readonly<Record<string, unknown>>): ActionValidationResult {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: 'Malformed action payload' };
    }
    const r = raw as Record<string, unknown>;
    const cap = GEOLOGY_CAPABILITIES.find((c) => c.id === r.capabilityId);
    if (!cap) {
      return {
        valid: false,
        error: `Capability ${String(r.capabilityId)} not supported on world geology`,
      };
    }
    return {
      valid: true,
      action: {
        actionFamily: cap.featureId,
        worldId: 'geology',
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
      worldId: 'geology',
      tick: ctx.tick,
      executedAtTick: ctx.tick,
      status: 'success',
      debits: action.cost ? [action.cost] : [],
      deltas: [],
      eventsEmitted: [event.id],
    };
  },

  projectVisibleState(state: Readonly<Record<string, unknown>>, _viewer) {
    const metricKeys = ["tectonic stress", "magma pressure", "sensor coverage"];
    const metrics: Record<string, number | string> = {};
    for (const k of metricKeys) {
      if (k in state && (typeof state[k] === 'number' || typeof state[k] === 'string')) {
        metrics[k] = state[k] as number | string;
      }
    }
    return createBaseVisibleState(
      'geology',
      1,
      GEOLOGY_CAPABILITIES.map((c) => c.id),
      metrics,
      [],
    );
  },
};
