import {
  ActionExecutionReceipt,
  ActionValidationResult,
  CostPreview,
  FeatureCapability,
  HazardDependencyGraph,
  HazardEvaluationResult,
  HazardLink,
  HazardNode,
  ScientificBudgetLedger,
  ValidatedAction,
  WorldFeatureModule,
} from '../contracts';
import { createBaseVisibleState } from '../projections';

export const ECOSYSTEM_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'ecosystem.action.habitat_corridors',
    featureId: 'P001',
    name: 'Habitat Corridors',
    description: 'Establish migratory corridors to relieve local drought stress.',
    minRulesVersion: 1,
    domainUnits: ['moisture', 'biomass'],
    costResource: 'water_stores',
  },
  {
    id: 'ecosystem.action.nutrient_balancing',
    featureId: 'P001',
    name: 'Nutrient Balancing',
    description: 'Apply enzymatic treatments to halt toxic nutrient runaway.',
    minRulesVersion: 1,
    domainUnits: ['nutrients', 'moisture'],
    costResource: 'supplies',
  },
  {
    id: 'ecosystem.action.targeted_firebreaks',
    featureId: 'P001',
    name: 'Targeted Firebreaks',
    description: 'Construct controlled firebreaks to protect dying forest canopy.',
    minRulesVersion: 1,
    domainUnits: ['biomass', 'nutrients'],
    costResource: 'seed_stocks',
  },
  {
    id: 'ecosystem.hazard.monitoring',
    featureId: 'P002',
    name: 'Ecosystem Hazard Monitoring',
    description: 'Ordered hazard dependency graph for ecosystem: watershed drought / nutrient runaway.',
    minRulesVersion: 1,
    domainUnits: ['hazard-index'],
  },
  {
    id: 'ecosystem.conservation.ledger',
    featureId: 'P003',
    name: 'Ecosystem Conservation Ledger',
    description: 'Resource-accountable conservation ledger enforcing finite non-negative balances for ecosystem.',
    minRulesVersion: 1,
    costResource: 'supplies',
  },
  {
    id: 'ecosystem.signature.destination',
    featureId: 'P011',
    name: 'The Glasswater Refuge',
    description: 'Authored signature destination for ecosystem: The Glasswater Refuge.',
    minRulesVersion: 1,
  },
];

export const ECOSYSTEM_HAZARD_NODES: readonly HazardNode[] = [
  {
    id: 'watershed_drought',
    label: 'Watershed Drought',
    worldId: 'ecosystem',
    sourceMetric: 'moisture',
    targetMetric: 'moisture',
    threshold: 30,
    operator: '<',
    severity: 'warning',
    upstreamNodeIds: [],
    mitigationActionFamily: 'ecosystem.action.habitat_corridors',
    description: 'Soil moisture falls below critical threshold',
    observedTriggerTemplate: 'Watershed moisture ({value}) dropped below {threshold}',
    hypothesizedExplanation: 'Prolonged rainfall deficit drying regional soil beds',
  },
  {
    id: 'nutrient_runaway',
    label: 'Nutrient Runaway',
    worldId: 'ecosystem',
    sourceMetric: 'nutrients',
    targetMetric: 'nutrients',
    threshold: 80,
    operator: '>',
    severity: 'critical',
    upstreamNodeIds: ['watershed_drought'],
    mitigationActionFamily: 'ecosystem.action.nutrient_balancing',
    description: 'Nutrient concentration exceeds tolerable bounds',
    observedTriggerTemplate: 'Nutrient concentration ({value}) exceeded {threshold}',
    hypothesizedExplanation: 'Stagnant flow allows toxic mineralization and salt accumulation',
  },
  {
    id: 'canopy_dieback',
    label: 'Canopy Dieback',
    worldId: 'ecosystem',
    sourceMetric: 'biomass',
    targetMetric: 'biomass',
    threshold: 20,
    operator: '<',
    severity: 'catastrophic',
    upstreamNodeIds: ['nutrient_runaway'],
    mitigationActionFamily: 'ecosystem.action.targeted_firebreaks',
    description: 'Forest canopy fails irreversibly',
    observedTriggerTemplate: 'Canopy biomass ({value}) dropped below {threshold}',
    hypothesizedExplanation: 'Combined osmotic shock and toxic mineralization kill root systems',
  },
];

export const ECOSYSTEM_HAZARD_LINKS: readonly HazardLink[] = [
  {
    fromNodeId: 'watershed_drought',
    toNodeId: 'nutrient_runaway',
    causalLinkType: 'direct',
    description: 'Low moisture concentrates mineralized nutrients in soil',
  },
  {
    fromNodeId: 'nutrient_runaway',
    toNodeId: 'canopy_dieback',
    causalLinkType: 'dependency',
    description: 'Nutrient toxic buildup accelerates canopy root necrosis',
  },
];

export function createEcosystemHazardGraph(): HazardDependencyGraph {
  return new HazardDependencyGraph('ecosystem', ECOSYSTEM_HAZARD_NODES, ECOSYSTEM_HAZARD_LINKS);
}

export function createEcosystemBudgetLedger(): ScientificBudgetLedger {
  return new ScientificBudgetLedger('ecosystem', {
    supplies: { balance: 40, capacity: 100, replenishmentRate: 0.5 },
    water_stores: { balance: 50, capacity: 100, replenishmentRate: 1.0 },
    seed_stocks: { balance: 30, capacity: 60, replenishmentRate: 0.2 },
  });
}

const ACTION_COSTS: Record<string, Array<{ resource: string; amount: number }>> = {
  'ecosystem.action.habitat_corridors': [
    { resource: 'water_stores', amount: 5 },
    { resource: 'supplies', amount: 2 },
  ],
  'ecosystem.action.nutrient_balancing': [
    { resource: 'supplies', amount: 4 },
    { resource: 'water_stores', amount: 3 },
  ],
  'ecosystem.action.targeted_firebreaks': [
    { resource: 'seed_stocks', amount: 4 },
    { resource: 'supplies', amount: 6 },
  ],
};

const ACTION_DELTAS: Record<string, Array<{ field: string; delta: number; unit: string }>> = {
  'ecosystem.action.habitat_corridors': [
    { field: 'moisture', delta: 15, unit: '%' },
    { field: 'biomass', delta: 5, unit: 't' },
  ],
  'ecosystem.action.nutrient_balancing': [
    { field: 'nutrients', delta: -20, unit: 'ppm' },
    { field: 'moisture', delta: 5, unit: '%' },
  ],
  'ecosystem.action.targeted_firebreaks': [
    { field: 'biomass', delta: 15, unit: 't' },
    { field: 'nutrients', delta: -10, unit: 'ppm' },
  ],
};

export class EcosystemFeatureModule implements WorldFeatureModule {
  readonly worldId = 'ecosystem';
  readonly rulesVersion = 1;
  readonly capabilities = ECOSYSTEM_CAPABILITIES;
  readonly hazardGraph = createEcosystemHazardGraph();
  readonly budgetLedger = createEcosystemBudgetLedger();

  previewCost(capabilityId: string): CostPreview {
    const debits = ACTION_COSTS[capabilityId] ?? [];
    return this.budgetLedger.previewDebit(debits);
  }

  evaluateHazards(
    metrics: Record<string, number>,
    tick: number,
  ): HazardEvaluationResult {
    return this.hazardGraph.evaluate(metrics, tick);
  }

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

    const preview = this.previewCost(cap.id);
    if (!preview.feasible) {
      const shortfallMsg = preview.shortfalls
        .map((s) => `${s.resource}: need ${s.required}, have ${s.available}`)
        .join(', ');
      return {
        valid: false,
        error: `Insufficient budget for ${cap.id}: ${shortfallMsg}`,
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
  }

  applyAction(
    state: Record<string, unknown>,
    action: ValidatedAction,
    ctx: { tick: number; emitEvent: (e: any) => any },
  ): ActionExecutionReceipt {
    const debits = ACTION_COSTS[action.capabilityId] ?? [];
    const tx = this.budgetLedger.applyTransaction(action.capabilityId, debits, [], ctx.tick);

    if (tx.status === 'rejected') {
      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: 'ecosystem',
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'rejected',
        rejectionReason: tx.rejectionReason,
        debits: [],
        deltas: [],
        eventsEmitted: [],
      };
    }

    // Apply native deltas to state
    const plannedDeltas = ACTION_DELTAS[action.capabilityId] ?? [];
    const executedDeltas: Array<{
      field: string;
      before: number | string;
      after: number | string;
      unit?: string;
    }> = [];

    for (const d of plannedDeltas) {
      const before = typeof state[d.field] === 'number' ? (state[d.field] as number) : 0;
      const after = Math.max(0, Math.round((before + d.delta) * 100) / 100);
      state[d.field] = after;
      executedDeltas.push({ field: d.field, before, after, unit: d.unit });
    }

    const event = ctx.emitEvent({
      type: 'ecosystem.action_executed',
      severity: 'info',
      title: `${action.capabilityId} Executed`,
      description: `Executed ${action.capabilityId} at tick ${ctx.tick}.`,
      sourceSystem: 'feature-module',
      payload: action.payload,
      deltas: executedDeltas.map((ed) => ({
        metricOrField: ed.field,
        before: ed.before as number,
        after: ed.after as number,
        unit: ed.unit,
      })),
      causalLinkType: 'direct',
      causalExplanation: `Applied priced intervention ${action.capabilityId}`,
    });

    return {
      actionId: `${action.capabilityId}-${ctx.tick}`,
      worldId: 'ecosystem',
      tick: ctx.tick,
      executedAtTick: ctx.tick,
      status: 'success',
      debits: [...tx.debitsApplied],
      deltas: executedDeltas,
      eventsEmitted: [event.id],
    };
  }

  projectVisibleState(
    state: Readonly<Record<string, unknown>>,
    _viewer: unknown,
  ) {
    const metricKeys = ['moisture', 'nutrients', 'biomass'];
    const metrics: Record<string, number | string> = {};
    const numericMetrics: Record<string, number> = {};
    for (const k of metricKeys) {
      if (k in state && typeof state[k] === 'number') {
        metrics[k] = state[k] as number;
        numericMetrics[k] = state[k] as number;
      }
    }
    const hazards = this.evaluateHazards(numericMetrics, 0);
    const budgetBalances = this.budgetLedger.getAllBalances();

    return createBaseVisibleState(
      'ecosystem',
      1,
      ECOSYSTEM_CAPABILITIES.map((c) => c.id),
      metrics,
      [],
      hazards,
      budgetBalances,
    );
  }
}

export const ecosystemFeatureModule = new EcosystemFeatureModule();
