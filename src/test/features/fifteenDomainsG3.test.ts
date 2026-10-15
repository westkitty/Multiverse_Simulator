import { describe, expect, it } from 'vitest';
import { ALL_DOMAIN_FEATURE_MODULES } from '../../features/domainModules';

describe('Gate G3: Fifteen-World Emergencies, Visuals & Policy Trials (P006, P007, P017)', () => {
  for (const mod of ALL_DOMAIN_FEATURE_MODULES) {
    const worldId = mod.worldId;
    describe(`Universe: ${worldId}`, () => {
      it('P006: registers at least one staged emergency with full state machine', () => {
        expect(mod.emergencyManager).toBeDefined();

        const defs = mod.emergencyManager!.getAllDefinitions();
        expect(defs.length).toBeGreaterThanOrEqual(1);

        const primaryEmergency = defs[0];
        expect(primaryEmergency.worldId).toBe(worldId);
        expect(primaryEmergency.precursorThreshold).toBeDefined();
        expect(primaryEmergency.activeThreshold).toBeDefined();
        expect(primaryEmergency.consequences.metricPenaltiesPerTick).toBeDefined();
        expect(primaryEmergency.escalateDelayTicks).toBeGreaterThan(0);

        // Starts dormant
        const state = mod.emergencyManager!.getState(primaryEmergency.id);
        expect(state).toBeDefined();
        expect(state?.stage).toBe('dormant');
      });

      it('P006: steps through precursor, active, and executes emergency.mitigate action', () => {
        const primaryEmergency = mod.emergencyManager!.getAllDefinitions()[0];

        // Trigger active stage
        const triggerMetric = primaryEmergency.triggerMetric;
        const triggerVal = primaryEmergency.triggerOperator === '<'
          ? primaryEmergency.activeThreshold - 5
          : primaryEmergency.activeThreshold + 5;

        const report = mod.emergencyManager!.stepEmergencies(1, { [triggerMetric]: triggerVal });
        expect(report.activeCount).toBeGreaterThanOrEqual(1);

        const activeState = mod.emergencyManager!.getState(primaryEmergency.id)!;
        expect(activeState.stage).toBe('active');

        // Mitigate via module action
        const validation = mod.validateAction(
          {
            capabilityId: 'emergency.mitigate',
            payload: { emergencyId: primaryEmergency.id, effectiveness: 1.0 },
          },
          {},
        );
        expect(validation.valid).toBe(true);

        const events: any[] = [];
        const mockCtx: any = {
          runId: 'test-run',
          tick: 2,
          config: {},
          emitEvent: (e: any) => {
            const ev = { id: `ev-${events.length}`, runId: 'test-run', tick: 2, schemaVersion: 1, ...e };
            events.push(ev);
            return ev;
          },
        };

        const receipt = mod.applyAction(
          {},
          validation.action!,
          mockCtx,
        );

        expect(receipt.status).toBe('success');
        expect(receipt.eventsEmitted).toHaveLength(1);
        expect(mod.emergencyManager!.getState(primaryEmergency.id)?.stage).toBe('contained');
      });

      it('P007: defines at least two visual restoration layers with accessible summaries and reducedMotion', () => {
        expect(mod.visualRestorationManager).toBeDefined();

        const layers = mod.visualRestorationManager!.getAllLayerDefinitions();
        expect(layers.length).toBeGreaterThanOrEqual(2);

        for (const layer of layers) {
          expect(layer.id).toBeTruthy();
          expect(layer.name).toBeTruthy();
          expect(layer.metricKey).toBeTruthy();
          expect(layer.stageDescriptions.degraded).toBeTruthy();
          expect(layer.stageDescriptions.flourishing).toBeTruthy();
          expect(layer.visualElements.activeMeshes.length).toBeGreaterThanOrEqual(2);
        }

        // Test normal evaluation at target metric levels
        const targetMetrics: Record<string, number> = {};
        for (const layer of layers) {
          targetMetrics[layer.metricKey] = layer.targetValue;
        }

        const normalSnapshot = mod.visualRestorationManager!.evaluate(targetMetrics, {
          reducedMotion: false,
        });
        expect(normalSnapshot.worldId).toBe(worldId);
        expect(normalSnapshot.overallProgress).toBeGreaterThanOrEqual(0.9);
        expect(normalSnapshot.overallStage).toBe('flourishing');
        expect(normalSnapshot.reducedMotionApplied).toBe(false);
        expect(normalSnapshot.accessibleSummary).toContain(worldId);

        // Test reduced-motion mode
        const reducedSnapshot = mod.visualRestorationManager!.evaluate(targetMetrics, {
          reducedMotion: true,
        });
        expect(reducedSnapshot.reducedMotionApplied).toBe(true);
        for (const l of reducedSnapshot.layers) {
          expect(l.particleDensity).toBe(0); // Zero particle motion
        }
      });

      it('P017: registers at least two priced policies and executes three-arm trade-off trial', () => {
        expect(mod.policyManager).toBeDefined();

        const policies = mod.policyManager!.getAllPolicies();
        expect(policies.length).toBeGreaterThanOrEqual(2);

        const [policyA, policyB] = policies;
        expect(policyA.id).toBeTruthy();
        expect(policyB.id).toBeTruthy();
        expect(Object.keys(policyA.resourceCostsPerTick).length).toBeGreaterThan(0);
        expect(Object.keys(policyB.resourceCostsPerTick).length).toBeGreaterThan(0);
        expect(policyA.tradeoffSummary).toBeTruthy();
        expect(policyB.tradeoffSummary).toBeTruthy();

        // Run Three-Arm Trial
        const initialMetrics: Record<string, number> = {};
        for (const p of [policyA, policyB]) {
          for (const m of Object.keys(p.metricBenefitsPerTick)) {
            initialMetrics[m] = 40;
          }
          for (const m of Object.keys(p.sideEffectsPerTick)) {
            initialMetrics[m] = 40;
          }
        }

        const trial = mod.policyManager!.evaluateThreeArmTrial(
          initialMetrics,
          policyA.id,
          policyB.id,
          25,
        );

        expect(trial.worldId).toBe(worldId);
        expect(trial.horizonTicks).toBe(25);
        expect(trial.baseline.armId).toBe('baseline');
        expect(trial.policyA.armId).toBe('policyA');
        expect(trial.policyB.armId).toBe('policyB');

        // Baseline spends nothing
        expect(trial.baseline.totalResourcesSpent).toEqual({});

        // Both policies spend resources
        expect(Object.keys(trial.policyA.totalResourcesSpent).length).toBeGreaterThan(0);
        expect(Object.keys(trial.policyB.totalResourcesSpent).length).toBeGreaterThan(0);

        // Trade-offs documented
        expect(trial.tradeoffsIdentified).toHaveLength(2);
        expect(trial.comparativeSummary).toContain(`Three-Arm Trial on ${worldId}`);
      });

      it('P006/P007/P017: projects complete visible feature state and executes stepOwnedSystems without error', () => {
        const testState: Record<string, unknown> = {
          tick: 10,
        };

        const sysCtx: any = {
          runId: 'test-run',
          tick: 10,
          state: testState,
          config: {},
          rng: () => 0.5,
          emitEvent: () => ({} as any),
          findRecentEventByType: () => null,
        };

        // Step owned systems
        expect(() => {
          mod.stepOwnedSystems?.(sysCtx);
        }).not.toThrow();

        // Project visible state
        const visible = mod.projectVisibleState(testState, {
          worldId,
          siteDisclosures: {},
        });

        expect(visible.worldId).toBe(worldId);
        expect(visible.emergencies).toBeDefined();
        expect(visible.emergencies!.length).toBeGreaterThanOrEqual(1);
        expect(visible.visualRestoration).toBeDefined();
        expect(visible.visualRestoration?.layers.length).toBeGreaterThanOrEqual(2);
        expect(visible.activePolicies).toBeDefined();
        expect(visible.activePolicies!.length).toBeGreaterThanOrEqual(2);
      });
    });
  }
});
