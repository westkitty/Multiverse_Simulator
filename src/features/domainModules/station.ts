import {
  ActionExecutionReceipt,
  ActionValidationResult,
  FeatureCapability,
  ValidatedAction,
  WorldFeatureModule,
} from '../contracts';
import { createBaseVisibleState } from '../projections';

export const STATION_CAPABILITIES: readonly FeatureCapability[] = [
  {
    "id": "station.action.pressure_sector_isolation",
    "featureId": "P001",
    "name": "Pressure Sector Isolation",
    "description": "Native action family 1 for station: pressure sector isolation.",
    "minRulesVersion": 1,
    "domainUnits": [
      "pressure",
      "oxygen reserve",
      "crew health"
    ],
    "costResource": "supplies"
  },
  {
    "id": "station.action.scrubber_allocation",
    "featureId": "P001",
    "name": "Scrubber Allocation",
    "description": "Native action family 2 for station: scrubber allocation.",
    "minRulesVersion": 1,
    "domainUnits": [
      "pressure",
      "oxygen reserve",
      "crew health"
    ],
    "costResource": "supplies"
  },
  {
    "id": "station.action.crew_evacuation",
    "featureId": "P001",
    "name": "Crew Evacuation",
    "description": "Native action family 3 for station: crew evacuation.",
    "minRulesVersion": 1,
    "domainUnits": [
      "pressure",
      "oxygen reserve",
      "crew health"
    ],
    "costResource": "supplies"
  },
  {
    "id": "station.hazard.monitoring",
    "featureId": "P002",
    "name": "Station Hazard Monitoring",
    "description": "Ordered hazard dependency graph for station: pressure leakage -> oxygen depletion -> compartment shutdown.",
    "minRulesVersion": 1,
    "domainUnits": [
      "hazard-index"
    ]
  },
  {
    "id": "station.conservation.ledger",
    "featureId": "P003",
    "name": "Station Conservation Ledger",
    "description": "Resource-accountable conservation ledger enforcing finite non-negative balances for station.",
    "minRulesVersion": 1,
    "costResource": "supplies"
  },
  {
    "id": "station.signature.destination",
    "featureId": "P011",
    "name": "The Dark Habitation Ring",
    "description": "Authored signature destination for station: The Dark Habitation Ring.",
    "minRulesVersion": 1
  }
];

export const stationFeatureModule: WorldFeatureModule = {
  worldId: 'station',
  rulesVersion: 1,
  capabilities: STATION_CAPABILITIES,

  validateAction(raw: unknown, _state: Readonly<Record<string, unknown>>): ActionValidationResult {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: 'Malformed action payload' };
    }
    const r = raw as Record<string, unknown>;
    const cap = STATION_CAPABILITIES.find((c) => c.id === r.capabilityId);
    if (!cap) {
      return {
        valid: false,
        error: `Capability ${String(r.capabilityId)} not supported on world station`,
      };
    }
    return {
      valid: true,
      action: {
        actionFamily: cap.featureId,
        worldId: 'station',
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
      worldId: 'station',
      tick: ctx.tick,
      executedAtTick: ctx.tick,
      status: 'success',
      debits: action.cost ? [action.cost] : [],
      deltas: [],
      eventsEmitted: [event.id],
    };
  },

  projectVisibleState(state: Readonly<Record<string, unknown>>, _viewer) {
    const metricKeys = ["pressure", "oxygen reserve", "crew health"];
    const metrics: Record<string, number | string> = {};
    for (const k of metricKeys) {
      if (k in state && (typeof state[k] === 'number' || typeof state[k] === 'string')) {
        metrics[k] = state[k] as number | string;
      }
    }
    return createBaseVisibleState(
      'station',
      1,
      STATION_CAPABILITIES.map((c) => c.id),
      metrics,
      [],
    );
  },
};
