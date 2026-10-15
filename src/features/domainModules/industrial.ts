import {
  ActionExecutionReceipt,
  ActionValidationResult,
  FeatureCapability,
  ValidatedAction,
  WorldFeatureModule,
} from '../contracts';
import { createBaseVisibleState } from '../projections';

export const INDUSTRIAL_CAPABILITIES: readonly FeatureCapability[] = [
  {
    "id": "industrial.action.production_balance",
    "featureId": "P001",
    "name": "Production Balance",
    "description": "Native action family 1 for industrial: production balance.",
    "minRulesVersion": 1,
    "domainUnits": [
      "inventory",
      "backlog",
      "equipment health"
    ],
    "costResource": "supplies"
  },
  {
    "id": "industrial.action.emergency_freight",
    "featureId": "P001",
    "name": "Emergency Freight",
    "description": "Native action family 2 for industrial: emergency freight.",
    "minRulesVersion": 1,
    "domainUnits": [
      "inventory",
      "backlog",
      "equipment health"
    ],
    "costResource": "supplies"
  },
  {
    "id": "industrial.action.waste_containment",
    "featureId": "P001",
    "name": "Waste Containment",
    "description": "Native action family 3 for industrial: waste containment.",
    "minRulesVersion": 1,
    "domainUnits": [
      "inventory",
      "backlog",
      "equipment health"
    ],
    "costResource": "supplies"
  },
  {
    "id": "industrial.hazard.monitoring",
    "featureId": "P002",
    "name": "Industrial Hazard Monitoring",
    "description": "Ordered hazard dependency graph for industrial: freight interruption -> inventory scarcity -> factory stoppage.",
    "minRulesVersion": 1,
    "domainUnits": [
      "hazard-index"
    ]
  },
  {
    "id": "industrial.conservation.ledger",
    "featureId": "P003",
    "name": "Industrial Conservation Ledger",
    "description": "Resource-accountable conservation ledger enforcing finite non-negative balances for industrial.",
    "minRulesVersion": 1,
    "costResource": "supplies"
  },
  {
    "id": "industrial.signature.destination",
    "featureId": "P011",
    "name": "The Factory Without Deliveries",
    "description": "Authored signature destination for industrial: The Factory Without Deliveries.",
    "minRulesVersion": 1
  }
];

export const industrialFeatureModule: WorldFeatureModule = {
  worldId: 'industrial',
  rulesVersion: 1,
  capabilities: INDUSTRIAL_CAPABILITIES,

  validateAction(raw: unknown, _state: Readonly<Record<string, unknown>>): ActionValidationResult {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: 'Malformed action payload' };
    }
    const r = raw as Record<string, unknown>;
    const cap = INDUSTRIAL_CAPABILITIES.find((c) => c.id === r.capabilityId);
    if (!cap) {
      return {
        valid: false,
        error: `Capability ${String(r.capabilityId)} not supported on world industrial`,
      };
    }
    return {
      valid: true,
      action: {
        actionFamily: cap.featureId,
        worldId: 'industrial',
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
      worldId: 'industrial',
      tick: ctx.tick,
      executedAtTick: ctx.tick,
      status: 'success',
      debits: action.cost ? [action.cost] : [],
      deltas: [],
      eventsEmitted: [event.id],
    };
  },

  projectVisibleState(state: Readonly<Record<string, unknown>>, _viewer) {
    const metricKeys = ["inventory", "backlog", "equipment health"];
    const metrics: Record<string, number | string> = {};
    for (const k of metricKeys) {
      if (k in state && (typeof state[k] === 'number' || typeof state[k] === 'string')) {
        metrics[k] = state[k] as number | string;
      }
    }
    return createBaseVisibleState(
      'industrial',
      1,
      INDUSTRIAL_CAPABILITIES.map((c) => c.id),
      metrics,
      [],
    );
  },
};
