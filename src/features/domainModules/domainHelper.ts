import {
  ActionExecutionReceipt,
  ActionValidationResult,
  BudgetResourceConfig,
  CostPreview,
  CourierState,
  FacilityDefinition,
  FacilityManager,
  FeatureCapability,
  HazardDependencyGraph,
  HazardEvaluationResult,
  HazardLink,
  HazardNode,
  LogisticsNetwork,
  LogisticsRouteEdge,
  ScientificBudgetLedger,
  ValidatedAction,
  WorldFeatureModule,
} from '../contracts';
import { createBaseVisibleState } from '../projections';

export const STANDARD_G2_CAPABILITIES: readonly FeatureCapability[] = [
  {
    id: 'logistics.ship',
    featureId: 'P004',
    name: 'Dispatch Logistics Shipment',
    description: 'Schedule and dispatch courier shipment between verified depots.',
    minRulesVersion: 1,
  },
  {
    id: 'logistics.resupply',
    featureId: 'P004',
    name: 'Local Depot Resupply',
    description: 'Extract emergency resupply from verified local depot.',
    minRulesVersion: 1,
  },
  {
    id: 'facility.build',
    featureId: 'P005',
    name: 'Construct World Facility',
    description: 'Begin construction of a native persistent facility.',
    minRulesVersion: 1,
  },
  {
    id: 'facility.maintain',
    featureId: 'P005',
    name: 'Maintain Facility',
    description: 'Perform maintenance to restore degraded facility operation.',
    minRulesVersion: 1,
  },
  {
    id: 'facility.configure',
    featureId: 'P005',
    name: 'Configure Facility',
    description: 'Adjust operating rate and resource profile.',
    minRulesVersion: 1,
  },
  {
    id: 'facility.retire',
    featureId: 'P005',
    name: 'Retire Facility',
    description: 'Decommission facility and recover partial salvage.',
    minRulesVersion: 1,
  },
];

export interface DomainModuleConfig {
  readonly worldId: string;
  readonly capabilities: readonly FeatureCapability[];
  readonly hazardNodes: readonly HazardNode[];
  readonly hazardLinks: readonly HazardLink[];
  readonly initialBudget: Record<string, BudgetResourceConfig>;
  readonly actionCosts: Record<string, Array<{ resource: string; amount: number }>>;
  readonly actionDeltas: Record<string, Array<{ field: string; delta: number; unit: string }>>;
  readonly metricKeys: readonly string[];
  readonly facilityDefinitions?: readonly FacilityDefinition[];
  readonly initialDepots?: ReadonlyArray<{
    siteId: string;
    capacity: number;
    inventory: Record<string, number>;
  }>;
  readonly initialCouriers?: readonly CourierState[];
  readonly initialRoutes?: readonly LogisticsRouteEdge[];
}

export class StandardWorldFeatureModule implements WorldFeatureModule {
  readonly worldId: string;
  readonly rulesVersion = 1;
  readonly capabilities: readonly FeatureCapability[];
  readonly hazardGraph: HazardDependencyGraph;
  readonly budgetLedger: ScientificBudgetLedger;
  readonly logisticsNetwork: LogisticsNetwork;
  readonly facilityManager: FacilityManager;
  private readonly config: DomainModuleConfig;

  constructor(config: DomainModuleConfig) {
    this.worldId = config.worldId;
    this.config = config;

    // Combine custom and standard G2 capabilities
    const existingCapIds = new Set(config.capabilities.map((c) => c.id));
    const mergedCaps = [...config.capabilities];
    for (const stdCap of STANDARD_G2_CAPABILITIES) {
      if (!existingCapIds.has(stdCap.id)) {
        mergedCaps.push(stdCap);
      }
    }
    this.capabilities = mergedCaps;

    this.hazardGraph = new HazardDependencyGraph(
      config.worldId,
      config.hazardNodes,
      config.hazardLinks,
    );
    this.budgetLedger = new ScientificBudgetLedger(config.worldId, config.initialBudget);

    // Initialize logistics network
    this.logisticsNetwork = new LogisticsNetwork(config.worldId);
    if (config.initialDepots) {
      for (const d of config.initialDepots) {
        this.logisticsNetwork.createDepot(d.siteId, d.capacity, d.inventory);
      }
    }
    if (config.initialCouriers) {
      for (const c of config.initialCouriers) {
        this.logisticsNetwork.registerCourier(c);
      }
    }
    if (config.initialRoutes) {
      for (const r of config.initialRoutes) {
        this.logisticsNetwork.addRouteEdge(r);
      }
    }

    // Initialize facility manager
    this.facilityManager = new FacilityManager(config.worldId);
    if (config.facilityDefinitions) {
      for (const f of config.facilityDefinitions) {
        this.facilityManager.registerDefinition(f);
      }
    }
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

    const payload = (r.payload as Record<string, unknown>) ?? {};

    // P005: Facility Actions
    if (cap.id === 'facility.build') {
      const defaultTypeId = this.facilityManager.definitions.keys().next().value ?? 'default_facility';
      const typeId = String(payload.typeId ?? defaultTypeId);
      const siteId = String(payload.siteId ?? 'site-default');
      if (payload.typeId && !this.facilityManager.definitions.has(typeId)) {
        return { valid: false, error: `Unknown facility type: ${typeId}` };
      }
      return {
        valid: true,
        action: {
          actionFamily: 'P005',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { ...payload, siteId, typeId },
          targetSiteId: siteId,
        },
      };
    }

    if (cap.id === 'facility.maintain' || cap.id === 'facility.configure' || cap.id === 'facility.retire') {
      const siteId = String(payload.siteId ?? 'site-default');
      return {
        valid: true,
        action: {
          actionFamily: 'P005',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { ...payload, siteId },
          targetSiteId: siteId,
        },
      };
    }

    // P004: Logistics Actions
    if (cap.id === 'logistics.ship') {
      const sourceSiteId = String(payload.sourceSiteId ?? 'site-default-a');
      const destSiteId = String(payload.destSiteId ?? 'site-default-b');
      return {
        valid: true,
        action: {
          actionFamily: 'P004',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { ...payload, sourceSiteId, destSiteId },
        },
      };
    }

    if (cap.id === 'logistics.resupply') {
      const siteId = String(payload.siteId ?? 'site-default');
      const resource = String(payload.resource ?? 'supplies');
      return {
        valid: true,
        action: {
          actionFamily: 'P004',
          worldId: this.worldId,
          capabilityId: cap.id,
          payload: { ...payload, siteId, resource },
          targetSiteId: siteId,
        },
      };
    }

    // Standard Priced Actions
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
        payload,
        cost: cap.costResource ? { resource: cap.costResource, amount: 2 } : undefined,
      },
    };
  }

  applyAction(
    state: Record<string, unknown>,
    action: ValidatedAction,
    ctx: { tick: number; emitEvent: (e: any) => any },
  ): ActionExecutionReceipt {
    const payload = action.payload as Record<string, unknown>;

    // Handle P005 Facility Commands
    if (action.capabilityId === 'facility.build') {
      const siteId = String(payload.siteId);
      const regionId = String(payload.regionId ?? 'region-default');
      const typeId = String(payload.typeId);
      const res = this.facilityManager.buildFacility(siteId, regionId, typeId, ctx.tick, {
        budgetLedger: this.budgetLedger,
        logisticsNetwork: this.logisticsNetwork,
      });

      if (!res.success) {
        return {
          actionId: `${action.capabilityId}-${ctx.tick}`,
          worldId: this.worldId,
          tick: ctx.tick,
          executedAtTick: ctx.tick,
          status: 'rejected',
          rejectionReason: res.reason,
          debits: [],
          deltas: [],
          eventsEmitted: [],
        };
      }

      const event = ctx.emitEvent({
        type: `${this.worldId}.facility_built`,
        severity: 'info',
        title: `Facility Built: ${typeId}`,
        description: `Initiated construction of ${typeId} at ${siteId} on ${this.worldId}.`,
        sourceSystem: 'facility-manager',
        payload,
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    if (action.capabilityId === 'facility.maintain') {
      const siteId = String(payload.siteId);
      const res = this.facilityManager.maintainFacility(siteId, ctx.tick, {
        budgetLedger: this.budgetLedger,
        logisticsNetwork: this.logisticsNetwork,
      });

      if (!res.success) {
        return {
          actionId: `${action.capabilityId}-${ctx.tick}`,
          worldId: this.worldId,
          tick: ctx.tick,
          executedAtTick: ctx.tick,
          status: 'rejected',
          rejectionReason: res.reason,
          debits: [],
          deltas: [],
          eventsEmitted: [],
        };
      }

      const event = ctx.emitEvent({
        type: `${this.worldId}.facility_maintained`,
        severity: 'info',
        title: `Facility Maintained at ${siteId}`,
        description: `Performed maintenance at ${siteId} on ${this.worldId}.`,
        sourceSystem: 'facility-manager',
        payload,
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    if (action.capabilityId === 'facility.configure') {
      const siteId = String(payload.siteId);
      const rate = Number(payload.operatingRate ?? 1.0);
      const res = this.facilityManager.configureFacility(siteId, rate);

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: res.success ? 'success' : 'rejected',
        rejectionReason: res.reason,
        debits: [],
        deltas: [],
        eventsEmitted: [],
      };
    }

    if (action.capabilityId === 'facility.retire') {
      const siteId = String(payload.siteId);
      const res = this.facilityManager.retireFacility(siteId, {
        logisticsNetwork: this.logisticsNetwork,
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: res.success ? 'success' : 'rejected',
        rejectionReason: res.reason,
        debits: [],
        deltas: [],
        eventsEmitted: [],
      };
    }

    // Handle P004 Logistics Commands
    if (action.capabilityId === 'logistics.ship') {
      const orderId = String(payload.orderId ?? `ord-${ctx.tick}`);
      const sourceSiteId = String(payload.sourceSiteId);
      const destSiteId = String(payload.destSiteId);
      const cargo = (payload.cargo as Record<string, number>) ?? {};
      const courierId = payload.courierId ? String(payload.courierId) : undefined;
      const route = Array.isArray(payload.route) ? (payload.route as string[]) : [];

      const orderRes = this.logisticsNetwork.createShipmentOrder(
        orderId,
        sourceSiteId,
        destSiteId,
        cargo,
        route,
      );

      if (!orderRes.success) {
        return {
          actionId: `${action.capabilityId}-${ctx.tick}`,
          worldId: this.worldId,
          tick: ctx.tick,
          executedAtTick: ctx.tick,
          status: 'rejected',
          rejectionReason: orderRes.reason,
          debits: [],
          deltas: [],
          eventsEmitted: [],
        };
      }

      if (courierId) {
        const dispatchRes = this.logisticsNetwork.dispatchOrder(orderId, courierId, ctx.tick);
        if (!dispatchRes.success) {
          return {
            actionId: `${action.capabilityId}-${ctx.tick}`,
            worldId: this.worldId,
            tick: ctx.tick,
            executedAtTick: ctx.tick,
            status: 'rejected',
            rejectionReason: dispatchRes.reason,
            debits: [],
            deltas: [],
            eventsEmitted: [],
          };
        }
      }

      const event = ctx.emitEvent({
        type: `${this.worldId}.shipment_created`,
        severity: 'info',
        title: `Shipment ${orderId} Created`,
        description: `Shipment ${orderId} scheduled from ${sourceSiteId} to ${destSiteId}.`,
        sourceSystem: 'logistics-network',
        payload,
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    if (action.capabilityId === 'logistics.resupply') {
      const siteId = String(payload.siteId);
      const resource = String(payload.resource);
      const amount = Number(payload.amount ?? 1);

      const res = this.logisticsNetwork.localResupply(siteId, resource, amount);
      if (!res.success) {
        return {
          actionId: `${action.capabilityId}-${ctx.tick}`,
          worldId: this.worldId,
          tick: ctx.tick,
          executedAtTick: ctx.tick,
          status: 'rejected',
          rejectionReason: res.reason,
          debits: [],
          deltas: [],
          eventsEmitted: [],
        };
      }

      const event = ctx.emitEvent({
        type: `${this.worldId}.resupply_extracted`,
        severity: 'info',
        title: `Local Resupply: ${res.amountSupplied} ${resource}`,
        description: `Extracted ${res.amountSupplied} ${resource} from depot at ${siteId}.`,
        sourceSystem: 'logistics-network',
        payload,
      });

      return {
        actionId: `${action.capabilityId}-${ctx.tick}`,
        worldId: this.worldId,
        tick: ctx.tick,
        executedAtTick: ctx.tick,
        status: 'success',
        debits: [{ resource, amount: res.amountSupplied }],
        deltas: [],
        eventsEmitted: [event.id],
      };
    }

    // Standard priced action execution
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

  stepOwnedSystems(ctx: { tick: number; state: Record<string, unknown> }): void {
    // Step logistics network
    this.logisticsNetwork.stepNetwork(ctx.tick);

    // Step facilities and apply metric benefits to world state
    this.facilityManager.stepFacilities(ctx.tick, {
      budgetLedger: this.budgetLedger,
      logisticsNetwork: this.logisticsNetwork,
      applyBenefit: (metric, delta) => {
        if (typeof ctx.state[metric] === 'number') {
          ctx.state[metric] = Math.max(
            0,
            Math.round(((ctx.state[metric] as number) + delta) * 100) / 100,
          );
        }
      },
    });
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
