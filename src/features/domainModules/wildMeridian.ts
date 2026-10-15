import {
  ActionExecutionReceipt,
  ActionValidationResult,
  FeatureCapability,
  ValidatedAction,
  WorldFeatureModule,
} from '../contracts';
import { createBaseVisibleState } from '../projections';

export const WILDMERIDIAN_CAPABILITIES: readonly FeatureCapability[] = [
  {
    "id": "wild-meridian.action.migration_corridors",
    "featureId": "P001",
    "name": "Migration Corridors",
    "description": "Native action family 1 for wild-meridian: migration corridors.",
    "minRulesVersion": 1,
    "domainUnits": [
      "water",
      "vegetation",
      "wildlife"
    ],
    "costResource": "supplies"
  },
  {
    "id": "wild-meridian.action.watering_refuges",
    "featureId": "P001",
    "name": "Watering Refuges",
    "description": "Native action family 2 for wild-meridian: watering refuges.",
    "minRulesVersion": 1,
    "domainUnits": [
      "water",
      "vegetation",
      "wildlife"
    ],
    "costResource": "supplies"
  },
  {
    "id": "wild-meridian.action.ecological_disturbance_containment",
    "featureId": "P001",
    "name": "Ecological Disturbance Containment",
    "description": "Native action family 3 for wild-meridian: ecological disturbance containment.",
    "minRulesVersion": 1,
    "domainUnits": [
      "water",
      "vegetation",
      "wildlife"
    ],
    "costResource": "supplies"
  },
  {
    "id": "wild-meridian.hazard.monitoring",
    "featureId": "P002",
    "name": "Wild-Meridian Hazard Monitoring",
    "description": "Ordered hazard dependency graph for wild-meridian: drought -> habitat fragmentation -> wildlife decline.",
    "minRulesVersion": 1,
    "domainUnits": [
      "hazard-index"
    ]
  },
  {
    "id": "wild-meridian.conservation.ledger",
    "featureId": "P003",
    "name": "Wild-Meridian Conservation Ledger",
    "description": "Resource-accountable conservation ledger enforcing finite non-negative balances for wild-meridian.",
    "minRulesVersion": 1,
    "costResource": "supplies"
  },
  {
    "id": "wild-meridian.signature.destination",
    "featureId": "P011",
    "name": "Silent Valley",
    "description": "Authored signature destination for wild-meridian: Silent Valley.",
    "minRulesVersion": 1
  }
];

export const wildMeridianFeatureModule: WorldFeatureModule = {
  worldId: 'wild-meridian',
  rulesVersion: 1,
  capabilities: WILDMERIDIAN_CAPABILITIES,

  validateAction(raw: unknown, _state: Readonly<Record<string, unknown>>): ActionValidationResult {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: 'Malformed action payload' };
    }
    const r = raw as Record<string, unknown>;
    const cap = WILDMERIDIAN_CAPABILITIES.find((c) => c.id === r.capabilityId);
    if (!cap) {
      return {
        valid: false,
        error: `Capability ${String(r.capabilityId)} not supported on world wild-meridian`,
      };
    }
    return {
      valid: true,
      action: {
        actionFamily: cap.featureId,
        worldId: 'wild-meridian',
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
      worldId: 'wild-meridian',
      tick: ctx.tick,
      executedAtTick: ctx.tick,
      status: 'success',
      debits: action.cost ? [action.cost] : [],
      deltas: [],
      eventsEmitted: [event.id],
    };
  },

  projectVisibleState(state: Readonly<Record<string, unknown>>, _viewer) {
    const metricKeys = ["water", "vegetation", "wildlife"];
    const metrics: Record<string, number | string> = {};
    for (const k of metricKeys) {
      if (k in state && (typeof state[k] === 'number' || typeof state[k] === 'string')) {
        metrics[k] = state[k] as number | string;
      }
    }
    return createBaseVisibleState(
      'wild-meridian',
      1,
      WILDMERIDIAN_CAPABILITIES.map((c) => c.id),
      metrics,
      [],
    );
  },
};
