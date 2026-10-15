import {
  ActionExecutionReceipt,
  ActionValidationResult,
  BudgetResourceConfig,
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

export interface DomainModuleConfig {
  readonly worldId: string;
  readonly capabilities: readonly FeatureCapability[];
  readonly hazardNodes: readonly HazardNode[];
  readonly hazardLinks: readonly HazardLink[];
  readonly initialBudget: Record<string, BudgetResourceConfig>;
  readonly actionCosts: Record<string, Array<{ resource: string; amount: number }>>;
  readonly actionDeltas: Record<string, Array<{ field: string; delta: number; unit: string }>>;
  readonly metricKeys: readonly string[];
}

export class StandardWorldFeatureModule implements WorldFeatureModule {
  readonly worldId: string;
  readonly rulesVersion = 1;
  readonly capabilities: readonly FeatureCapability[];
  readonly hazardGraph: HazardDependencyGraph;
  readonly budgetLedger: ScientificBudgetLedger;
  private readonly config: DomainModuleConfig;

  constructor(config: DomainModuleConfig) {
    this.worldId = config.worldId;
    this.config = config;
    this.capabilities = config.capabilities;
    this.hazardGraph = new HazardDependencyGraph(config.worldId, config.hazardNodes, config.hazardLinks);
    this.budgetLedger = new ScientificBudgetLedger(config.worldId, config.initialBudget);
  }

  previewCost(capabilityId: string): CostPreview {
    const debits = this.config.actionCosts[capabilityId] ?? [];
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
    const cap = this.capabilities.find((c) => c.id === r.capabilityId);
    if (!cap) {
      return {
        valid: false,
        error: `Capability ${String(r.capabilityId)} not supported on world ${this.worldId}`,
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
        worldId: this.worldId,
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
    const debits = this.config.actionCosts[action.capabilityId] ?? [];
    const tx = this.budgetLedger.applyTransaction(action.capabilityId, debits, [], ctx.tick);

    if (tx.status === 'rejected') {
      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
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
    const plannedDeltas = this.config.actionDeltas[action.capabilityId] ?? [];
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
      type: `${this.worldId}.action_executed`,
      severity: 'info',
      title: `${action.capabilityId} Executed`,
      description: `Executed ${action.capabilityId} on ${this.worldId} at tick ${ctx.tick}.`,
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
      worldId: this.worldId,
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
    const metrics: Record<string, number | string> = {};
    const numericMetrics: Record<string, number> = {};
    for (const k of this.config.metricKeys) {
      if (k in state && typeof state[k] === 'number') {
        metrics[k] = state[k] as number;
        numericMetrics[k] = state[k] as number;
      }
    }
    const hazards = this.evaluateHazards(numericMetrics, 0);
    const budgetBalances = this.budgetLedger.getAllBalances();

    return createBaseVisibleState(
      this.worldId,
      1,
      this.capabilities.map((c) => c.id),
      metrics,
      [],
      hazards,
      budgetBalances,
    );
  }
}
