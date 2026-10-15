import {
  ActionExecutionReceipt,
  ActionValidationResult,
  FeatureCapability,
  ValidatedAction,
  WorldFeatureModule,
} from '../contracts';
import { createBaseVisibleState } from '../projections';

export const MACHINEWILDERNESS_CAPABILITIES: readonly FeatureCapability[] = [
  {
    "id": "machine-wilderness.action.power_routing",
    "featureId": "P001",
    "name": "Power Routing",
    "description": "Native action family 1 for machine-wilderness: power routing.",
    "minRulesVersion": 1,
    "domainUnits": [
      "power",
      "wear",
      "backlog"
    ],
    "costResource": "supplies"
  },
  {
    "id": "machine-wilderness.action.maintenance_swarm_scheduling",
    "featureId": "P001",
    "name": "Maintenance Swarm Scheduling",
    "description": "Native action family 2 for machine-wilderness: maintenance swarm scheduling.",
    "minRulesVersion": 1,
    "domainUnits": [
      "power",
      "wear",
      "backlog"
    ],
    "costResource": "supplies"
  },
  {
    "id": "machine-wilderness.action.parts_recovery",
    "featureId": "P001",
    "name": "Parts Recovery",
    "description": "Native action family 3 for machine-wilderness: parts recovery.",
    "minRulesVersion": 1,
    "domainUnits": [
      "power",
      "wear",
      "backlog"
    ],
    "costResource": "supplies"
  },
  {
    "id": "machine-wilderness.hazard.monitoring",
    "featureId": "P002",
    "name": "Machine-Wilderness Hazard Monitoring",
    "description": "Ordered hazard dependency graph for machine-wilderness: power failures -> maintenance backlog -> automation collapse.",
    "minRulesVersion": 1,
    "domainUnits": [
      "hazard-index"
    ]
  },
  {
    "id": "machine-wilderness.conservation.ledger",
    "featureId": "P003",
    "name": "Machine-Wilderness Conservation Ledger",
    "description": "Resource-accountable conservation ledger enforcing finite non-negative balances for machine-wilderness.",
    "minRulesVersion": 1,
    "costResource": "supplies"
  },
  {
    "id": "machine-wilderness.signature.destination",
    "featureId": "P011",
    "name": "Unfinished City",
    "description": "Authored signature destination for machine-wilderness: Unfinished City.",
    "minRulesVersion": 1
  }
];

export const machineWildernessFeatureModule: WorldFeatureModule = {
  worldId: 'machine-wilderness',
  rulesVersion: 1,
  capabilities: MACHINEWILDERNESS_CAPABILITIES,

  validateAction(raw: unknown, _state: Readonly<Record<string, unknown>>): ActionValidationResult {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: 'Malformed action payload' };
    }
    const r = raw as Record<string, unknown>;
    const cap = MACHINEWILDERNESS_CAPABILITIES.find((c) => c.id === r.capabilityId);
    if (!cap) {
      return {
        valid: false,
        error: `Capability ${String(r.capabilityId)} not supported on world machine-wilderness`,
      };
    }
    return {
      valid: true,
      action: {
        actionFamily: cap.featureId,
        worldId: 'machine-wilderness',
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
      worldId: 'machine-wilderness',
      tick: ctx.tick,
      executedAtTick: ctx.tick,
      status: 'success',
      debits: action.cost ? [action.cost] : [],
      deltas: [],
      eventsEmitted: [event.id],
    };
  },

  projectVisibleState(state: Readonly<Record<string, unknown>>, _viewer) {
    const metricKeys = ["power", "wear", "backlog"];
    const metrics: Record<string, number | string> = {};
    for (const k of metricKeys) {
      if (k in state && (typeof state[k] === 'number' || typeof state[k] === 'string')) {
        metrics[k] = state[k] as number | string;
      }
    }
    return createBaseVisibleState(
      'machine-wilderness',
      1,
      MACHINEWILDERNESS_CAPABILITIES.map((c) => c.id),
      metrics,
      [],
    );
  },
};
