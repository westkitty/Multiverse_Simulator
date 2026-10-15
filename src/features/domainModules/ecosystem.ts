import {
  ActionExecutionReceipt,
  ActionValidationResult,
  FeatureCapability,
  ValidatedAction,
  WorldFeatureModule,
} from '../contracts';
import { createBaseVisibleState } from '../projections';

export const ECOSYSTEM_CAPABILITIES: readonly FeatureCapability[] = [
  {
    "id": "ecosystem.action.habitat_corridors",
    "featureId": "P001",
    "name": "Habitat Corridors",
    "description": "Native action family 1 for ecosystem: habitat corridors.",
    "minRulesVersion": 1,
    "domainUnits": [
      "moisture",
      "nutrients",
      "biomass"
    ],
    "costResource": "supplies"
  },
  {
    "id": "ecosystem.action.nutrient_balancing",
    "featureId": "P001",
    "name": "Nutrient Balancing",
    "description": "Native action family 2 for ecosystem: nutrient balancing.",
    "minRulesVersion": 1,
    "domainUnits": [
      "moisture",
      "nutrients",
      "biomass"
    ],
    "costResource": "supplies"
  },
  {
    "id": "ecosystem.action.targeted_firebreaks",
    "featureId": "P001",
    "name": "Targeted Firebreaks",
    "description": "Native action family 3 for ecosystem: targeted firebreaks.",
    "minRulesVersion": 1,
    "domainUnits": [
      "moisture",
      "nutrients",
      "biomass"
    ],
    "costResource": "supplies"
  },
  {
    "id": "ecosystem.hazard.monitoring",
    "featureId": "P002",
    "name": "Ecosystem Hazard Monitoring",
    "description": "Ordered hazard dependency graph for ecosystem: watershed drought / nutrient runaway.",
    "minRulesVersion": 1,
    "domainUnits": [
      "hazard-index"
    ]
  },
  {
    "id": "ecosystem.conservation.ledger",
    "featureId": "P003",
    "name": "Ecosystem Conservation Ledger",
    "description": "Resource-accountable conservation ledger enforcing finite non-negative balances for ecosystem.",
    "minRulesVersion": 1,
    "costResource": "supplies"
  },
  {
    "id": "ecosystem.signature.destination",
    "featureId": "P011",
    "name": "The Glasswater Refuge",
    "description": "Authored signature destination for ecosystem: The Glasswater Refuge.",
    "minRulesVersion": 1
  }
];

export const ecosystemFeatureModule: WorldFeatureModule = {
  worldId: 'ecosystem',
  rulesVersion: 1,
  capabilities: ECOSYSTEM_CAPABILITIES,

  validateAction(raw: unknown, _state: Readonly<Record<string, unknown>>): ActionValidationResult {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: 'Malformed action payload' };
    }
    const r = raw as Record<string, unknown>;
    const cap = ECOSYSTEM_CAPABILITIES.find((c) => c.id === r.capabilityId);
    if (!cap) {
      return {
        valid: false,
        error: `Capability ${String(r.capabilityId)} not supported on world ecosystem`,
      };
    }
    return {
      valid: true,
      action: {
        actionFamily: cap.featureId,
        worldId: 'ecosystem',
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
      worldId: 'ecosystem',
      tick: ctx.tick,
      executedAtTick: ctx.tick,
      status: 'success',
      debits: action.cost ? [action.cost] : [],
      deltas: [],
      eventsEmitted: [event.id],
    };
  },

  projectVisibleState(state: Readonly<Record<string, unknown>>, _viewer) {
    const metricKeys = ["moisture", "nutrients", "biomass"];
    const metrics: Record<string, number | string> = {};
    for (const k of metricKeys) {
      if (k in state && (typeof state[k] === 'number' || typeof state[k] === 'string')) {
        metrics[k] = state[k] as number | string;
      }
    }
    return createBaseVisibleState(
      'ecosystem',
      1,
      ECOSYSTEM_CAPABILITIES.map((c) => c.id),
      metrics,
      [],
    );
  },
};
