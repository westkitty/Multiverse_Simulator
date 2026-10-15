import { describe, expect, it } from 'vitest';
import { ALL_DOMAIN_FEATURE_MODULES } from '../../features/domainModules';

describe('Gate G1: Fifteen-World Domain Integration (P002, P003, P013)', () => {
  it('registers all 15 domain feature modules with version 1', () => {
    expect(ALL_DOMAIN_FEATURE_MODULES).toHaveLength(15);
    const worldIds = ALL_DOMAIN_FEATURE_MODULES.map((m) => m.worldId);
    expect(new Set(worldIds).size).toBe(15);
    for (const mod of ALL_DOMAIN_FEATURE_MODULES) {
      expect(mod.rulesVersion).toBe(1);
      expect(mod.hazardGraph).toBeDefined();
      expect(mod.budgetLedger).toBeDefined();
    }
  });

  describe('P002: Anatomy of a Catastrophe across all 15 worlds', () => {
    for (const mod of ALL_DOMAIN_FEATURE_MODULES) {
      it(`${mod.worldId}: hazard DAG is structurally valid with acyclic links and upstream tracing`, () => {
        const graph = mod.hazardGraph!;
        const validation = graph.validateGraph();
        expect(validation.valid, `Graph validation errors in ${mod.worldId}: ${validation.errors.join(', ')}`).toBe(true);

        const nodes = graph.getNodes();
        const links = graph.getLinks();
        expect(nodes.length).toBeGreaterThanOrEqual(3);
        expect(links.length).toBeGreaterThanOrEqual(2);

        // Verify root cause -> intermediate -> terminal catastrophe chain
        const terminalNode = nodes[nodes.length - 1];
        const upstream = graph.findUpstreamCauses(terminalNode.id);
        expect(upstream.length).toBeGreaterThanOrEqual(1);

        const rootNode = nodes[0];
        const downstream = graph.findDownstreamRisks(rootNode.id);
        expect(downstream.length).toBeGreaterThanOrEqual(1);
      });

      it(`${mod.worldId}: evaluates dormant baseline when metrics are healthy`, () => {
        const graph = mod.hazardGraph!;
        const healthyMetrics: Record<string, number> = {};
        for (const node of graph.getNodes()) {
          // Set metric to safe side of threshold
          if (node.operator === '<' || node.operator === '<=') {
            healthyMetrics[node.sourceMetric] = node.threshold + 20;
          } else {
            healthyMetrics[node.sourceMetric] = Math.max(0, node.threshold - 20);
          }
        }

        const evalResult = graph.evaluate(healthyMetrics, 1);
        expect(evalResult.worldId).toBe(mod.worldId);
        expect(evalResult.activeHazards).toHaveLength(0);
        expect(evalResult.hazardLevel).toBe(0);
        expect(evalResult.unmitigatedCascadeActive).toBe(false);
      });

      it(`${mod.worldId}: detects threshold failure, sets trigger text, and identifies recommended mitigations`, () => {
        const graph = mod.hazardGraph!;
        const nodes = graph.getNodes();
        const triggerNode = nodes[0]; // Stage 1 failure

        const stressedMetrics: Record<string, number> = {};
        for (const node of nodes) {
          healthyMetric(node, stressedMetrics);
        }
        // Force stage 1 failure
        stressMetric(triggerNode, stressedMetrics);

        const evalResult = graph.evaluate(stressedMetrics, 5);
        expect(evalResult.activeHazards.length).toBeGreaterThanOrEqual(1);
        const active = evalResult.activeHazards.find((h) => h.nodeId === triggerNode.id);
        expect(active).toBeDefined();
        expect(active?.observedTrigger.length).toBeGreaterThan(0);
        expect(active?.mitigationActionFamily).toBe(triggerNode.mitigationActionFamily);
        expect(evalResult.recommendedMitigations).toContain(triggerNode.mitigationActionFamily);
      });

      it(`${mod.worldId}: cascading to terminal failure raises unmitigatedCascadeActive`, () => {
        const graph = mod.hazardGraph!;
        const nodes = graph.getNodes();

        // Stress all nodes
        const fullStressMetrics: Record<string, number> = {};
        for (const node of nodes) {
          stressMetric(node, fullStressMetrics);
        }

        const evalResult = graph.evaluate(fullStressMetrics, 10);
        expect(evalResult.unmitigatedCascadeActive).toBe(true);
        expect(evalResult.hazardLevel).toBeGreaterThanOrEqual(50);
      });
    }
  });

  describe('P003: Conservation Has Teeth across all 15 worlds', () => {
    for (const mod of ALL_DOMAIN_FEATURE_MODULES) {
      it(`${mod.worldId}: enforces finite non-negative balances and previews cost`, () => {
        const ledger = mod.budgetLedger!;
        const balances = ledger.getAllBalances();
        const resourceKeys = Object.keys(balances);
        expect(resourceKeys.length).toBeGreaterThanOrEqual(2);

        for (const res of resourceKeys) {
          expect(balances[res]).toBeGreaterThan(0);
          expect(ledger.getCapacity(res)).toBeGreaterThanOrEqual(balances[res]);
        }

        // Preview all actions
        for (const cap of mod.capabilities.filter((c) => c.featureId === 'P001')) {
          const preview = mod.previewCost!(cap.id);
          expect(preview.feasible).toBe(true);
          expect(preview.debits.length).toBeGreaterThanOrEqual(1);
        }
      });

      it(`${mod.worldId}: atomic debit on valid execution mutates balances and state deltas`, () => {
        // Create an isolated clone of the module's ledger
        const ledger = mod.budgetLedger!.clone();
        const actionCap = mod.capabilities.find((c) => c.featureId === 'P001')!;
        const initialBalances = ledger.getAllBalances();

        const state: Record<string, unknown> = {};
        const ctx = createMockContext(4);

        const validated = mod.validateAction(
          { capabilityId: actionCap.id, payload: {} },
          state,
        );
        expect(validated.valid).toBe(true);
        expect(validated.action).toBeDefined();

        const receipt = mod.applyAction(state, validated.action!, ctx);
        expect(receipt.status).toBe('success');
        expect(receipt.debits?.length).toBeGreaterThanOrEqual(1);
        expect(receipt.deltas?.length).toBeGreaterThanOrEqual(1);
        expect(receipt.eventsEmitted).toHaveLength(1);

        // Verify balance decreased
        const afterBalances = mod.budgetLedger!.getAllBalances();
        for (const deb of receipt.debits!) {
          expect(afterBalances[deb.resource]).toBeLessThan(initialBalances[deb.resource]);
        }
      });

      it(`${mod.worldId}: rejects execution and rolls back when budget is insufficient`, () => {
        // Drain ledger to 0
        const ledger = mod.budgetLedger!;
        const all = ledger.getAllBalances();
        const drainDebits = Object.entries(all).map(([resource, amount]) => ({
          resource,
          amount,
        }));
        ledger.applyTransaction('drain', drainDebits, [], 100);

        const actionCap = mod.capabilities.find((c) => c.featureId === 'P001')!;
        const validation = mod.validateAction(
          { capabilityId: actionCap.id, payload: {} },
          {},
        );
        expect(validation.valid).toBe(false);
        expect(validation.error).toContain('Insufficient budget');

        // Forced applyAction on drained ledger results in rejected receipt and no state changes
        const dummyAction = {
          actionFamily: 'P001',
          worldId: mod.worldId,
          capabilityId: actionCap.id,
          payload: {},
        };
        const receipt = mod.applyAction({}, dummyAction, createMockContext(101));
        expect(receipt.status).toBe('rejected');
        expect(receipt.rejectionReason).toContain('Insufficient budget');

        // Replenish for subsequent tests
        ledger.replenish(200);
      });
    }
  });

  describe('P013: Matched Hypothesis & Causal Mitigation (Initial P013)', () => {
    for (const mod of ALL_DOMAIN_FEATURE_MODULES) {
      it(`${mod.worldId}: matched treatment vs control proves intervention halts/mitigates hazard`, () => {
        const graph = mod.hazardGraph!;
        const rootNode = graph.getNodes()[0];
        const mitigationCapId = rootNode.mitigationActionFamily;

        // Baseline / Control state: in hazard
        const controlState: Record<string, number> = {};
        for (const node of graph.getNodes()) {
          healthyMetric(node, controlState);
        }
        stressMetric(rootNode, controlState);

        // Control evaluates active hazard
        const controlEvalBefore = graph.evaluate(controlState, 1);
        expect(controlEvalBefore.activeHazards.some((h) => h.nodeId === rootNode.id)).toBe(true);

        // Treatment branch: start from identical state, apply legal priced intervention
        const treatmentState: Record<string, number> = { ...controlState };
        const ctx = createMockContext(2);
        const receipt = mod.applyAction(
          treatmentState as any,
          {
            actionFamily: 'P001',
            worldId: mod.worldId,
            capabilityId: mitigationCapId,
            payload: {},
          },
          ctx,
        );
        expect(receipt.status).toBe('success');

        // Treatment evaluates hazard again: root hazard must now be resolved or mitigated
        const treatmentEvalAfter = graph.evaluate(treatmentState, 2);
        const rootStillActive = treatmentEvalAfter.activeHazards.some((h) => h.nodeId === rootNode.id);
        expect(rootStillActive).toBe(false);

        // Control branch without treatment remained in hazard state
        const controlEvalAfter = graph.evaluate(controlState, 2);
        expect(controlEvalAfter.activeHazards.some((h) => h.nodeId === rootNode.id)).toBe(true);
      });
    }
  });
});

function createMockContext(tick: number) {
  return {
    runId: 'test-run',
    tick,
    config: {},
    rng: {
      next: () => 0.5,
      nextInt: (min: number) => min,
      fork: () => createMockContext(tick).rng,
      serialize: () => ({ state: [0, 0, 0, 0] }),
    },
    emitEvent: (e: any) => ({
      id: `evt-${tick}`,
      runId: 'test-run',
      tick,
      type: e.type ?? 'test.event',
      severity: e.severity ?? 'info',
      title: e.title ?? 'Test Event',
      description: e.description ?? '',
      sourceSystem: e.sourceSystem ?? 'test',
      sourceEntityId: null,
      affectedEntityIds: [],
      payload: e.payload ?? {},
      deltas: e.deltas ?? [],
      causedByEventId: null,
      causalLinkType: 'direct',
      causalExplanation: '',
      correlationId: `corr-${tick}`,
      schemaVersion: 1,
    }),
  } as any;
}

function healthyMetric(node: any, target: Record<string, number>) {
  const delta = node.threshold <= 1 ? 0.2 : Math.min(20, Math.max(2, node.threshold * 0.3));
  if (node.operator === '<' || node.operator === '<=') {
    target[node.sourceMetric] = node.threshold + delta;
  } else {
    target[node.sourceMetric] = Math.max(0, node.threshold - delta);
  }
}

function stressMetric(node: any, target: Record<string, number>) {
  const delta = node.threshold <= 1 ? 0.05 : Math.min(5, Math.max(1, node.threshold * 0.1));
  if (node.operator === '<' || node.operator === '<=') {
    target[node.sourceMetric] = Math.max(0, node.threshold - delta);
  } else {
    target[node.sourceMetric] = node.threshold + delta;
  }
}
