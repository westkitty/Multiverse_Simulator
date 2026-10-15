import {
  ActionExecutionReceipt,
  ActionValidationResult,
  FeatureCapability,
  ValidatedAction,
  WorldFeatureModule,
} from '../contracts';
import { createBaseVisibleState } from '../projections';

export const MEGACITY_CAPABILITIES: readonly FeatureCapability[] = [
  {
    "id": "megacity.action.power_isolation",
    "featureId": "P001",
    "name": "Power Isolation",
    "description": "Native action family 1 for megacity: power isolation.",
    "minRulesVersion": 1,
    "domainUnits": [
      "infrastructure health",
      "pollution",
      "reachable sites"
    ],
    "costResource": "supplies"
  },
  {
    "id": "megacity.action.flood_rerouting",
    "featureId": "P001",
    "name": "Flood Rerouting",
    "description": "Native action family 2 for megacity: flood rerouting.",
    "minRulesVersion": 1,
    "domainUnits": [
      "infrastructure health",
      "pollution",
      "reachable sites"
    ],
    "costResource": "supplies"
  },
  {
    "id": "megacity.action.transport_priority",
    "featureId": "P001",
    "name": "Transport Priority",
    "description": "Native action family 3 for megacity: transport priority.",
    "minRulesVersion": 1,
    "domainUnits": [
      "infrastructure health",
      "pollution",
      "reachable sites"
    ],
    "costResource": "supplies"
  },
  {
    "id": "megacity.hazard.monitoring",
    "featureId": "P002",
    "name": "Megacity Hazard Monitoring",
    "description": "Ordered hazard dependency graph for megacity: power failure -> pumping loss -> flood and isolation.",
    "minRulesVersion": 1,
    "domainUnits": [
      "hazard-index"
    ]
  },
  {
    "id": "megacity.conservation.ledger",
    "featureId": "P003",
    "name": "Megacity Conservation Ledger",
    "description": "Resource-accountable conservation ledger enforcing finite non-negative balances for megacity.",
    "minRulesVersion": 1,
    "costResource": "supplies"
  },
  {
    "id": "megacity.signature.destination",
    "featureId": "P011",
    "name": "The Blackout Quarter",
    "description": "Authored signature destination for megacity: The Blackout Quarter.",
    "minRulesVersion": 1
  }
];

export const megacityFeatureModule: WorldFeatureModule = {
  worldId: 'megacity',
  rulesVersion: 1,
  capabilities: MEGACITY_CAPABILITIES,

  validateAction(raw: unknown, _state: Readonly<Record<string, unknown>>): ActionValidationResult {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: 'Malformed action payload' };
    }
    const r = raw as Record<string, unknown>;
    const cap = MEGACITY_CAPABILITIES.find((c) => c.id === r.capabilityId);
    if (!cap) {
      return {
        valid: false,
        error: `Capability ${String(r.capabilityId)} not supported on world megacity`,
      };
    }
    return {
      valid: true,
      action: {
        actionFamily: cap.featureId,
        worldId: 'megacity',
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
      worldId: 'megacity',
      tick: ctx.tick,
      executedAtTick: ctx.tick,
      status: 'success',
      debits: action.cost ? [action.cost] : [],
      deltas: [],
      eventsEmitted: [event.id],
    };
  },

  projectVisibleState(state: Readonly<Record<string, unknown>>, _viewer) {
    const metricKeys = ["infrastructure health", "pollution", "reachable sites"];
    const metrics: Record<string, number | string> = {};
    for (const k of metricKeys) {
      if (k in state && (typeof state[k] === 'number' || typeof state[k] === 'string')) {
        metrics[k] = state[k] as number | string;
      }
    }
    return createBaseVisibleState(
      'megacity',
      1,
      MEGACITY_CAPABILITIES.map((c) => c.id),
      metrics,
      [],
    );
  },
};
