import {
  ActionExecutionReceipt,
  ActionValidationResult,
  FeatureCapability,
  ValidatedAction,
  WorldFeatureModule,
} from '../contracts';
import { createBaseVisibleState } from '../projections';

export const TERRAFORMINGFRONTIER_CAPABILITIES: readonly FeatureCapability[] = [
  {
    "id": "terraforming-frontier.action.atmospheric_control",
    "featureId": "P001",
    "name": "Atmospheric Control",
    "description": "Native action family 1 for terraforming-frontier: atmospheric control.",
    "minRulesVersion": 1,
    "domainUnits": [
      "pressure",
      "soil",
      "oxygen"
    ],
    "costResource": "supplies"
  },
  {
    "id": "terraforming-frontier.action.soil_amendment",
    "featureId": "P001",
    "name": "Soil Amendment",
    "description": "Native action family 2 for terraforming-frontier: soil amendment.",
    "minRulesVersion": 1,
    "domainUnits": [
      "pressure",
      "soil",
      "oxygen"
    ],
    "costResource": "supplies"
  },
  {
    "id": "terraforming-frontier.action.biome_seeding",
    "featureId": "P001",
    "name": "Biome Seeding",
    "description": "Native action family 3 for terraforming-frontier: biome seeding.",
    "minRulesVersion": 1,
    "domainUnits": [
      "pressure",
      "soil",
      "oxygen"
    ],
    "costResource": "supplies"
  },
  {
    "id": "terraforming-frontier.hazard.monitoring",
    "featureId": "P002",
    "name": "Terraforming-Frontier Hazard Monitoring",
    "description": "Ordered hazard dependency graph for terraforming-frontier: atmospheric deficiency -> poor soil -> biosphere instability.",
    "minRulesVersion": 1,
    "domainUnits": [
      "hazard-index"
    ]
  },
  {
    "id": "terraforming-frontier.conservation.ledger",
    "featureId": "P003",
    "name": "Terraforming-Frontier Conservation Ledger",
    "description": "Resource-accountable conservation ledger enforcing finite non-negative balances for terraforming-frontier.",
    "minRulesVersion": 1,
    "costResource": "supplies"
  },
  {
    "id": "terraforming-frontier.signature.destination",
    "featureId": "P011",
    "name": "First Green",
    "description": "Authored signature destination for terraforming-frontier: First Green.",
    "minRulesVersion": 1
  }
];

export const terraformingFrontierFeatureModule: WorldFeatureModule = {
  worldId: 'terraforming-frontier',
  rulesVersion: 1,
  capabilities: TERRAFORMINGFRONTIER_CAPABILITIES,

  validateAction(raw: unknown, _state: Readonly<Record<string, unknown>>): ActionValidationResult {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: 'Malformed action payload' };
    }
    const r = raw as Record<string, unknown>;
    const cap = TERRAFORMINGFRONTIER_CAPABILITIES.find((c) => c.id === r.capabilityId);
    if (!cap) {
      return {
        valid: false,
        error: `Capability ${String(r.capabilityId)} not supported on world terraforming-frontier`,
      };
    }
    return {
      valid: true,
      action: {
        actionFamily: cap.featureId,
        worldId: 'terraforming-frontier',
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
      worldId: 'terraforming-frontier',
      tick: ctx.tick,
      executedAtTick: ctx.tick,
      status: 'success',
      debits: action.cost ? [action.cost] : [],
      deltas: [],
      eventsEmitted: [event.id],
    };
  },

  projectVisibleState(state: Readonly<Record<string, unknown>>, _viewer) {
    const metricKeys = ["pressure", "soil", "oxygen"];
    const metrics: Record<string, number | string> = {};
    for (const k of metricKeys) {
      if (k in state && (typeof state[k] === 'number' || typeof state[k] === 'string')) {
        metrics[k] = state[k] as number | string;
      }
    }
    return createBaseVisibleState(
      'terraforming-frontier',
      1,
      TERRAFORMINGFRONTIER_CAPABILITIES.map((c) => c.id),
      metrics,
      [],
    );
  },
};
