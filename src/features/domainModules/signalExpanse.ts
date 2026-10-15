import {
  ActionExecutionReceipt,
  ActionValidationResult,
  FeatureCapability,
  ValidatedAction,
  WorldFeatureModule,
} from '../contracts';
import { createBaseVisibleState } from '../projections';

export const SIGNALEXPANSE_CAPABILITIES: readonly FeatureCapability[] = [
  {
    "id": "signal-expanse.action.array_calibration",
    "featureId": "P001",
    "name": "Array Calibration",
    "description": "Native action family 1 for signal-expanse: array calibration.",
    "minRulesVersion": 1,
    "domainUnits": [
      "signal",
      "noise",
      "coverage"
    ],
    "costResource": "supplies"
  },
  {
    "id": "signal-expanse.action.interference_suppression",
    "featureId": "P001",
    "name": "Interference Suppression",
    "description": "Native action family 2 for signal-expanse: interference suppression.",
    "minRulesVersion": 1,
    "domainUnits": [
      "signal",
      "noise",
      "coverage"
    ],
    "costResource": "supplies"
  },
  {
    "id": "signal-expanse.action.signal_reconstruction",
    "featureId": "P001",
    "name": "Signal Reconstruction",
    "description": "Native action family 3 for signal-expanse: signal reconstruction.",
    "minRulesVersion": 1,
    "domainUnits": [
      "signal",
      "noise",
      "coverage"
    ],
    "costResource": "supplies"
  },
  {
    "id": "signal-expanse.hazard.monitoring",
    "featureId": "P002",
    "name": "Signal-Expanse Hazard Monitoring",
    "description": "Ordered hazard dependency graph for signal-expanse: interference -> coverage loss -> false/fragmented observations.",
    "minRulesVersion": 1,
    "domainUnits": [
      "hazard-index"
    ]
  },
  {
    "id": "signal-expanse.conservation.ledger",
    "featureId": "P003",
    "name": "Signal-Expanse Conservation Ledger",
    "description": "Resource-accountable conservation ledger enforcing finite non-negative balances for signal-expanse.",
    "minRulesVersion": 1,
    "costResource": "supplies"
  },
  {
    "id": "signal-expanse.signature.destination",
    "featureId": "P011",
    "name": "Last Transmission",
    "description": "Authored signature destination for signal-expanse: Last Transmission.",
    "minRulesVersion": 1
  }
];

export const signalExpanseFeatureModule: WorldFeatureModule = {
  worldId: 'signal-expanse',
  rulesVersion: 1,
  capabilities: SIGNALEXPANSE_CAPABILITIES,

  validateAction(raw: unknown, _state: Readonly<Record<string, unknown>>): ActionValidationResult {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: 'Malformed action payload' };
    }
    const r = raw as Record<string, unknown>;
    const cap = SIGNALEXPANSE_CAPABILITIES.find((c) => c.id === r.capabilityId);
    if (!cap) {
      return {
        valid: false,
        error: `Capability ${String(r.capabilityId)} not supported on world signal-expanse`,
      };
    }
    return {
      valid: true,
      action: {
        actionFamily: cap.featureId,
        worldId: 'signal-expanse',
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
      worldId: 'signal-expanse',
      tick: ctx.tick,
      executedAtTick: ctx.tick,
      status: 'success',
      debits: action.cost ? [action.cost] : [],
      deltas: [],
      eventsEmitted: [event.id],
    };
  },

  projectVisibleState(state: Readonly<Record<string, unknown>>, _viewer) {
    const metricKeys = ["signal", "noise", "coverage"];
    const metrics: Record<string, number | string> = {};
    for (const k of metricKeys) {
      if (k in state && (typeof state[k] === 'number' || typeof state[k] === 'string')) {
        metrics[k] = state[k] as number | string;
      }
    }
    return createBaseVisibleState(
      'signal-expanse',
      1,
      SIGNALEXPANSE_CAPABILITIES.map((c) => c.id),
      metrics,
      [],
    );
  },
};
