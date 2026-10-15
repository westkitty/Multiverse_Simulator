import {
  ActionExecutionReceipt,
  ActionValidationResult,
  FeatureCapability,
  ValidatedAction,
  WorldFeatureModule,
} from '../contracts';
import { createBaseVisibleState } from '../projections';

export const HOLLOWDEEP_CAPABILITIES: readonly FeatureCapability[] = [
  {
    "id": "hollow-deep.action.aquifer_regulation",
    "featureId": "P001",
    "name": "Aquifer Regulation",
    "description": "Native action family 1 for hollow-deep: aquifer regulation.",
    "minRulesVersion": 1,
    "domainUnits": [
      "water",
      "gas",
      "stress"
    ],
    "costResource": "supplies"
  },
  {
    "id": "hollow-deep.action.gas_venting",
    "featureId": "P001",
    "name": "Gas Venting",
    "description": "Native action family 2 for hollow-deep: gas venting.",
    "minRulesVersion": 1,
    "domainUnits": [
      "water",
      "gas",
      "stress"
    ],
    "costResource": "supplies"
  },
  {
    "id": "hollow-deep.action.tunnel_reinforcement",
    "featureId": "P001",
    "name": "Tunnel Reinforcement",
    "description": "Native action family 3 for hollow-deep: tunnel reinforcement.",
    "minRulesVersion": 1,
    "domainUnits": [
      "water",
      "gas",
      "stress"
    ],
    "costResource": "supplies"
  },
  {
    "id": "hollow-deep.hazard.monitoring",
    "featureId": "P002",
    "name": "Hollow-Deep Hazard Monitoring",
    "description": "Ordered hazard dependency graph for hollow-deep: aquifer pressure -> gas buildup -> structural collapse.",
    "minRulesVersion": 1,
    "domainUnits": [
      "hazard-index"
    ]
  },
  {
    "id": "hollow-deep.conservation.ledger",
    "featureId": "P003",
    "name": "Hollow-Deep Conservation Ledger",
    "description": "Resource-accountable conservation ledger enforcing finite non-negative balances for hollow-deep.",
    "minRulesVersion": 1,
    "costResource": "supplies"
  },
  {
    "id": "hollow-deep.signature.destination",
    "featureId": "P011",
    "name": "Cathedral Below",
    "description": "Authored signature destination for hollow-deep: Cathedral Below.",
    "minRulesVersion": 1
  }
];

export const hollowDeepFeatureModule: WorldFeatureModule = {
  worldId: 'hollow-deep',
  rulesVersion: 1,
  capabilities: HOLLOWDEEP_CAPABILITIES,

  validateAction(raw: unknown, _state: Readonly<Record<string, unknown>>): ActionValidationResult {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: 'Malformed action payload' };
    }
    const r = raw as Record<string, unknown>;
    const cap = HOLLOWDEEP_CAPABILITIES.find((c) => c.id === r.capabilityId);
    if (!cap) {
      return {
        valid: false,
        error: `Capability ${String(r.capabilityId)} not supported on world hollow-deep`,
      };
    }
    return {
      valid: true,
      action: {
        actionFamily: cap.featureId,
        worldId: 'hollow-deep',
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
      worldId: 'hollow-deep',
      tick: ctx.tick,
      executedAtTick: ctx.tick,
      status: 'success',
      debits: action.cost ? [action.cost] : [],
      deltas: [],
      eventsEmitted: [event.id],
    };
  },

  projectVisibleState(state: Readonly<Record<string, unknown>>, _viewer) {
    const metricKeys = ["water", "gas", "stress"];
    const metrics: Record<string, number | string> = {};
    for (const k of metricKeys) {
      if (k in state && (typeof state[k] === 'number' || typeof state[k] === 'string')) {
        metrics[k] = state[k] as number | string;
      }
    }
    return createBaseVisibleState(
      'hollow-deep',
      1,
      HOLLOWDEEP_CAPABILITIES.map((c) => c.id),
      metrics,
      [],
    );
  },
};
