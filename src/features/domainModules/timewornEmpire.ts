import {
  ActionExecutionReceipt,
  ActionValidationResult,
  FeatureCapability,
  ValidatedAction,
  WorldFeatureModule,
} from '../contracts';
import { createBaseVisibleState } from '../projections';

export const TIMEWORNEMPIRE_CAPABILITIES: readonly FeatureCapability[] = [
  {
    "id": "timeworn-empire.action.controlled_excavation",
    "featureId": "P001",
    "name": "Controlled Excavation",
    "description": "Native action family 1 for timeworn-empire: controlled excavation.",
    "minRulesVersion": 1,
    "domainUnits": [
      "burial",
      "erosion",
      "exposure"
    ],
    "costResource": "supplies"
  },
  {
    "id": "timeworn-empire.action.ruin_protection",
    "featureId": "P001",
    "name": "Ruin Protection",
    "description": "Native action family 2 for timeworn-empire: ruin protection.",
    "minRulesVersion": 1,
    "domainUnits": [
      "burial",
      "erosion",
      "exposure"
    ],
    "costResource": "supplies"
  },
  {
    "id": "timeworn-empire.action.stratum_hypotheses",
    "featureId": "P001",
    "name": "Stratum Hypotheses",
    "description": "Native action family 3 for timeworn-empire: stratum hypotheses.",
    "minRulesVersion": 1,
    "domainUnits": [
      "burial",
      "erosion",
      "exposure"
    ],
    "costResource": "supplies"
  },
  {
    "id": "timeworn-empire.hazard.monitoring",
    "featureId": "P002",
    "name": "Timeworn-Empire Hazard Monitoring",
    "description": "Ordered hazard dependency graph for timeworn-empire: erosion -> exposure -> irreversible archaeological loss.",
    "minRulesVersion": 1,
    "domainUnits": [
      "hazard-index"
    ]
  },
  {
    "id": "timeworn-empire.conservation.ledger",
    "featureId": "P003",
    "name": "Timeworn-Empire Conservation Ledger",
    "description": "Resource-accountable conservation ledger enforcing finite non-negative balances for timeworn-empire.",
    "minRulesVersion": 1,
    "costResource": "supplies"
  },
  {
    "id": "timeworn-empire.signature.destination",
    "featureId": "P011",
    "name": "City of Three Foundations",
    "description": "Authored signature destination for timeworn-empire: City of Three Foundations.",
    "minRulesVersion": 1
  }
];

export const timewornEmpireFeatureModule: WorldFeatureModule = {
  worldId: 'timeworn-empire',
  rulesVersion: 1,
  capabilities: TIMEWORNEMPIRE_CAPABILITIES,

  validateAction(raw: unknown, _state: Readonly<Record<string, unknown>>): ActionValidationResult {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: 'Malformed action payload' };
    }
    const r = raw as Record<string, unknown>;
    const cap = TIMEWORNEMPIRE_CAPABILITIES.find((c) => c.id === r.capabilityId);
    if (!cap) {
      return {
        valid: false,
        error: `Capability ${String(r.capabilityId)} not supported on world timeworn-empire`,
      };
    }
    return {
      valid: true,
      action: {
        actionFamily: cap.featureId,
        worldId: 'timeworn-empire',
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
      worldId: 'timeworn-empire',
      tick: ctx.tick,
      executedAtTick: ctx.tick,
      status: 'success',
      debits: action.cost ? [action.cost] : [],
      deltas: [],
      eventsEmitted: [event.id],
    };
  },

  projectVisibleState(state: Readonly<Record<string, unknown>>, _viewer) {
    const metricKeys = ["burial", "erosion", "exposure"];
    const metrics: Record<string, number | string> = {};
    for (const k of metricKeys) {
      if (k in state && (typeof state[k] === 'number' || typeof state[k] === 'string')) {
        metrics[k] = state[k] as number | string;
      }
    }
    return createBaseVisibleState(
      'timeworn-empire',
      1,
      TIMEWORNEMPIRE_CAPABILITIES.map((c) => c.id),
      metrics,
      [],
    );
  },
};
