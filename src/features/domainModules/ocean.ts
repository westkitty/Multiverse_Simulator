import {
  ActionExecutionReceipt,
  ActionValidationResult,
  FeatureCapability,
  ValidatedAction,
  WorldFeatureModule,
} from '../contracts';
import { createBaseVisibleState } from '../projections';

export const OCEAN_CAPABILITIES: readonly FeatureCapability[] = [
  {
    "id": "ocean.action.upwelling",
    "featureId": "P001",
    "name": "Upwelling",
    "description": "Native action family 1 for ocean: upwelling.",
    "minRulesVersion": 1,
    "domainUnits": [
      "dissolved oxygen",
      "pH",
      "nutrients"
    ],
    "costResource": "supplies"
  },
  {
    "id": "ocean.action.depth_oxygenation",
    "featureId": "P001",
    "name": "Depth Oxygenation",
    "description": "Native action family 2 for ocean: depth oxygenation.",
    "minRulesVersion": 1,
    "domainUnits": [
      "dissolved oxygen",
      "pH",
      "nutrients"
    ],
    "costResource": "supplies"
  },
  {
    "id": "ocean.action.carbonate_habitat_protection",
    "featureId": "P001",
    "name": "Carbonate Habitat Protection",
    "description": "Native action family 3 for ocean: carbonate habitat protection.",
    "minRulesVersion": 1,
    "domainUnits": [
      "dissolved oxygen",
      "pH",
      "nutrients"
    ],
    "costResource": "supplies"
  },
  {
    "id": "ocean.hazard.monitoring",
    "featureId": "P002",
    "name": "Ocean Hazard Monitoring",
    "description": "Ordered hazard dependency graph for ocean: oxygen depletion -> habitat damage -> ecological feedback.",
    "minRulesVersion": 1,
    "domainUnits": [
      "hazard-index"
    ]
  },
  {
    "id": "ocean.conservation.ledger",
    "featureId": "P003",
    "name": "Ocean Conservation Ledger",
    "description": "Resource-accountable conservation ledger enforcing finite non-negative balances for ocean.",
    "minRulesVersion": 1,
    "costResource": "supplies"
  },
  {
    "id": "ocean.signature.destination",
    "featureId": "P011",
    "name": "The Drowned Listening Garden",
    "description": "Authored signature destination for ocean: The Drowned Listening Garden.",
    "minRulesVersion": 1
  }
];

export const oceanFeatureModule: WorldFeatureModule = {
  worldId: 'ocean',
  rulesVersion: 1,
  capabilities: OCEAN_CAPABILITIES,

  validateAction(raw: unknown, _state: Readonly<Record<string, unknown>>): ActionValidationResult {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: 'Malformed action payload' };
    }
    const r = raw as Record<string, unknown>;
    const cap = OCEAN_CAPABILITIES.find((c) => c.id === r.capabilityId);
    if (!cap) {
      return {
        valid: false,
        error: `Capability ${String(r.capabilityId)} not supported on world ocean`,
      };
    }
    return {
      valid: true,
      action: {
        actionFamily: cap.featureId,
        worldId: 'ocean',
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
      worldId: 'ocean',
      tick: ctx.tick,
      executedAtTick: ctx.tick,
      status: 'success',
      debits: action.cost ? [action.cost] : [],
      deltas: [],
      eventsEmitted: [event.id],
    };
  },

  projectVisibleState(state: Readonly<Record<string, unknown>>, _viewer) {
    const metricKeys = ["dissolved oxygen", "pH", "nutrients"];
    const metrics: Record<string, number | string> = {};
    for (const k of metricKeys) {
      if (k in state && (typeof state[k] === 'number' || typeof state[k] === 'string')) {
        metrics[k] = state[k] as number | string;
      }
    }
    return createBaseVisibleState(
      'ocean',
      1,
      OCEAN_CAPABILITIES.map((c) => c.id),
      metrics,
      [],
    );
  },
};
