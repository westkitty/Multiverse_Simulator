import {
  ActionExecutionReceipt,
  ActionValidationResult,
  FeatureCapability,
  ValidatedAction,
  WorldFeatureModule,
} from '../contracts';
import { createBaseVisibleState } from '../projections';

export const CELESTIAL_CAPABILITIES: readonly FeatureCapability[] = [
  {
    "id": "celestial.action.constrained_transfer_schedules",
    "featureId": "P001",
    "name": "Constrained Transfer Schedules",
    "description": "Native action family 1 for celestial: constrained transfer schedules.",
    "minRulesVersion": 1,
    "domainUnits": [
      "eccentricity",
      "incident flux",
      "habitability"
    ],
    "costResource": "supplies"
  },
  {
    "id": "celestial.action.orbit_circularization",
    "featureId": "P001",
    "name": "Orbit Circularization",
    "description": "Native action family 2 for celestial: orbit circularization.",
    "minRulesVersion": 1,
    "domainUnits": [
      "eccentricity",
      "incident flux",
      "habitability"
    ],
    "costResource": "supplies"
  },
  {
    "id": "celestial.action.radiation_shielding",
    "featureId": "P001",
    "name": "Radiation Shielding",
    "description": "Native action family 3 for celestial: radiation shielding.",
    "minRulesVersion": 1,
    "domainUnits": [
      "eccentricity",
      "incident flux",
      "habitability"
    ],
    "costResource": "supplies"
  },
  {
    "id": "celestial.hazard.monitoring",
    "featureId": "P002",
    "name": "Celestial Hazard Monitoring",
    "description": "Ordered hazard dependency graph for celestial: orbital instability -> high flux exposure -> failed transfers.",
    "minRulesVersion": 1,
    "domainUnits": [
      "hazard-index"
    ]
  },
  {
    "id": "celestial.conservation.ledger",
    "featureId": "P003",
    "name": "Celestial Conservation Ledger",
    "description": "Resource-accountable conservation ledger enforcing finite non-negative balances for celestial.",
    "minRulesVersion": 1,
    "costResource": "supplies"
  },
  {
    "id": "celestial.signature.destination",
    "featureId": "P011",
    "name": "The Lost Transit Observatory",
    "description": "Authored signature destination for celestial: The Lost Transit Observatory.",
    "minRulesVersion": 1
  }
];

export const celestialFeatureModule: WorldFeatureModule = {
  worldId: 'celestial',
  rulesVersion: 1,
  capabilities: CELESTIAL_CAPABILITIES,

  validateAction(raw: unknown, _state: Readonly<Record<string, unknown>>): ActionValidationResult {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: 'Malformed action payload' };
    }
    const r = raw as Record<string, unknown>;
    const cap = CELESTIAL_CAPABILITIES.find((c) => c.id === r.capabilityId);
    if (!cap) {
      return {
        valid: false,
        error: `Capability ${String(r.capabilityId)} not supported on world celestial`,
      };
    }
    return {
      valid: true,
      action: {
        actionFamily: cap.featureId,
        worldId: 'celestial',
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
      worldId: 'celestial',
      tick: ctx.tick,
      executedAtTick: ctx.tick,
      status: 'success',
      debits: action.cost ? [action.cost] : [],
      deltas: [],
      eventsEmitted: [event.id],
    };
  },

  projectVisibleState(state: Readonly<Record<string, unknown>>, _viewer) {
    const metricKeys = ["eccentricity", "incident flux", "habitability"];
    const metrics: Record<string, number | string> = {};
    for (const k of metricKeys) {
      if (k in state && (typeof state[k] === 'number' || typeof state[k] === 'string')) {
        metrics[k] = state[k] as number | string;
      }
    }
    return createBaseVisibleState(
      'celestial',
      1,
      CELESTIAL_CAPABILITIES.map((c) => c.id),
      metrics,
      [],
    );
  },
};
