import {
  ActionExecutionReceipt,
  ActionValidationResult,
  FeatureCapability,
  ValidatedAction,
  WorldFeatureModule,
} from '../contracts';
import { createBaseVisibleState } from '../projections';

export const CIVILIZATION_CAPABILITIES: readonly FeatureCapability[] = [
  {
    "id": "civilization.action.water_distribution",
    "featureId": "P001",
    "name": "Water Distribution",
    "description": "Native action family 1 for civilization: water distribution.",
    "minRulesVersion": 1,
    "domainUnits": [
      "water stock",
      "food stock",
      "civic stability"
    ],
    "costResource": "supplies"
  },
  {
    "id": "civilization.action.infrastructure_load",
    "featureId": "P001",
    "name": "Infrastructure Load",
    "description": "Native action family 2 for civilization: infrastructure load.",
    "minRulesVersion": 1,
    "domainUnits": [
      "water stock",
      "food stock",
      "civic stability"
    ],
    "costResource": "supplies"
  },
  {
    "id": "civilization.action.crossing_reinforcement",
    "featureId": "P001",
    "name": "Crossing Reinforcement",
    "description": "Native action family 3 for civilization: crossing reinforcement.",
    "minRulesVersion": 1,
    "domainUnits": [
      "water stock",
      "food stock",
      "civic stability"
    ],
    "costResource": "supplies"
  },
  {
    "id": "civilization.hazard.monitoring",
    "featureId": "P002",
    "name": "Civilization Hazard Monitoring",
    "description": "Ordered hazard dependency graph for civilization: water shortage -> food scarcity -> civic failure.",
    "minRulesVersion": 1,
    "domainUnits": [
      "hazard-index"
    ]
  },
  {
    "id": "civilization.conservation.ledger",
    "featureId": "P003",
    "name": "Civilization Conservation Ledger",
    "description": "Resource-accountable conservation ledger enforcing finite non-negative balances for civilization.",
    "minRulesVersion": 1,
    "costResource": "supplies"
  },
  {
    "id": "civilization.signature.destination",
    "featureId": "P011",
    "name": "The Abandoned River Capital",
    "description": "Authored signature destination for civilization: The Abandoned River Capital.",
    "minRulesVersion": 1
  }
];

export const civilizationFeatureModule: WorldFeatureModule = {
  worldId: 'civilization',
  rulesVersion: 1,
  capabilities: CIVILIZATION_CAPABILITIES,

  validateAction(raw: unknown, _state: Readonly<Record<string, unknown>>): ActionValidationResult {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: 'Malformed action payload' };
    }
    const r = raw as Record<string, unknown>;
    const cap = CIVILIZATION_CAPABILITIES.find((c) => c.id === r.capabilityId);
    if (!cap) {
      return {
        valid: false,
        error: `Capability ${String(r.capabilityId)} not supported on world civilization`,
      };
    }
    return {
      valid: true,
      action: {
        actionFamily: cap.featureId,
        worldId: 'civilization',
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
      worldId: 'civilization',
      tick: ctx.tick,
      executedAtTick: ctx.tick,
      status: 'success',
      debits: action.cost ? [action.cost] : [],
      deltas: [],
      eventsEmitted: [event.id],
    };
  },

  projectVisibleState(state: Readonly<Record<string, unknown>>, _viewer) {
    const metricKeys = ["water stock", "food stock", "civic stability"];
    const metrics: Record<string, number | string> = {};
    for (const k of metricKeys) {
      if (k in state && (typeof state[k] === 'number' || typeof state[k] === 'string')) {
        metrics[k] = state[k] as number | string;
      }
    }
    return createBaseVisibleState(
      'civilization',
      1,
      CIVILIZATION_CAPABILITIES.map((c) => c.id),
      metrics,
      [],
    );
  },
};
