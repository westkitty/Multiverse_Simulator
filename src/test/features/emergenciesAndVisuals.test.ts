import { describe, expect, it } from 'vitest';
import {
  EmergencyDefinition,
  EmergencyManager,
} from '../../features/emergencySystem';
import {
  RestorationLayerDefinition,
  VisualRestorationManager,
} from '../../features/visualRestoration';
import {
  PolicyDefinition,
  PolicyManager,
} from '../../features/policyTrial';
import { ScientificBudgetLedger } from '../../features/budgetLedger';

describe('Gate G3 Shared Systems (P006, P007, P017)', () => {
  describe('P006: EmergencyManager', () => {
    const testEmergencyDef: EmergencyDefinition = {
      id: 'ecosystem.test_collapse',
      worldId: 'ecosystem',
      name: 'Test Watershed Collapse',
      description: 'Severe loss of water causing secondary ecosystem failure.',
      triggerMetric: 'moisture',
      triggerOperator: '<',
      precursorThreshold: 40,
      activeThreshold: 20,
      escalateDelayTicks: 3,
      containmentActionIds: ['ecosystem.irrigate'],
      consequences: {
        metricPenaltiesPerTick: { biomass: 1.5 },
        budgetDrainPerTick: { water_stores: 2 },
        description: 'Drying soil kills biomass and evaporates water stores.',
      },
    };

    it('initializes emergency in dormant stage', () => {
      const em = new EmergencyManager('ecosystem');
      em.registerEmergency(testEmergencyDef);

      const state = em.getState('ecosystem.test_collapse');
      expect(state).toBeDefined();
      expect(state?.stage).toBe('dormant');
      expect(state?.severity).toBe(0);
      expect(em.getActiveEmergencies()).toHaveLength(0);
    });

    it('transitions to precursor when precursor threshold breached', () => {
      const em = new EmergencyManager('ecosystem');
      em.registerEmergency(testEmergencyDef);

      // moisture drops to 35 (< 40)
      const report = em.stepEmergencies(1, { moisture: 35 });
      const state = em.getState('ecosystem.test_collapse')!;

      expect(state.stage).toBe('precursor');
      expect(state.severity).toBe(25);
      expect(report.transitions).toHaveLength(1);
      expect(report.transitions[0].toStage).toBe('precursor');
      expect(em.getActiveEmergencies()).toHaveLength(1);
    });

    it('escalates to active when active threshold breached directly', () => {
      const em = new EmergencyManager('ecosystem');
      em.registerEmergency(testEmergencyDef);

      // moisture drops severely to 15 (< 20)
      const report = em.stepEmergencies(1, { moisture: 15 });
      const state = em.getState('ecosystem.test_collapse')!;

      expect(state.stage).toBe('active');
      expect(state.severity).toBe(60); // Active trip from dormant sets severity
      expect(report.activeCount).toBe(1);
    });

    it('escalates from precursor to active after delay timeout without mitigation', () => {
      const em = new EmergencyManager('ecosystem');
      em.registerEmergency(testEmergencyDef);

      // Step 1: Precursor triggered
      em.stepEmergencies(1, { moisture: 35 });
      expect(em.getState('ecosystem.test_collapse')?.stage).toBe('precursor');

      // Step 2, 3: Precursor persists
      em.stepEmergencies(2, { moisture: 35 });
      em.stepEmergencies(3, { moisture: 35 });

      // Step 4: escalateDelayTicks (3) reached -> escalates to active
      const report = em.stepEmergencies(4, { moisture: 35 });
      const state = em.getState('ecosystem.test_collapse')!;
      expect(state.stage).toBe('active');
      expect(report.transitions.some((t) => t.toStage === 'active')).toBe(true);
    });

    it('escalates from active to escalating and applies 2x penalty multiplier', () => {
      const em = new EmergencyManager('ecosystem');
      em.registerEmergency(testEmergencyDef);
      const budget = new ScientificBudgetLedger('ecosystem', {
        water_stores: { balance: 100, capacity: 200 },
      });

      // Jump directly to active
      em.stepEmergencies(1, { moisture: 15 });
      expect(em.getState('ecosystem.test_collapse')?.stage).toBe('active');

      let biomass = 50;
      const ctx = {
        applyMetricDelta: (_m: string, delta: number) => {
          biomass += delta;
        },
        budgetLedger: budget,
      };

      // Active penalties applied (1.5 biomass, 2 water_stores)
      em.stepEmergencies(2, { moisture: 15 }, ctx);
      expect(biomass).toBe(48.5);
      expect(budget.getBalance('water_stores')).toBe(98);

      em.stepEmergencies(3, { moisture: 15 }, ctx);
      expect(biomass).toBe(47);
      expect(budget.getBalance('water_stores')).toBe(96);

      // Tick 4: 3 ticks in active (ticks 1, 2, 3) -> escalates to escalating!
      const report = em.stepEmergencies(4, { moisture: 15 }, ctx);
      const state = em.getState('ecosystem.test_collapse')!;
      expect(state.stage).toBe('escalating');
      expect(report.escalatingCount).toBe(1);
      // Escalating applies 2x multiplier (3.0 biomass, 4 water_stores)
      expect(biomass).toBe(44);
      expect(budget.getBalance('water_stores')).toBe(92);

      em.stepEmergencies(5, { moisture: 15 }, ctx);
      expect(biomass).toBe(41);
      expect(budget.getBalance('water_stores')).toBe(88);

      em.stepEmergencies(6, { moisture: 15 }, ctx);
      expect(biomass).toBe(38);
      expect(budget.getBalance('water_stores')).toBe(84);
    });

    it('mitigates emergency through successive stages', () => {
      const em = new EmergencyManager('ecosystem');
      em.registerEmergency(testEmergencyDef);

      // Trigger active
      em.stepEmergencies(1, { moisture: 15 });
      expect(em.getState('ecosystem.test_collapse')?.stage).toBe('active');

      // Mitigate once -> contained
      const mit1 = em.mitigateEmergency('ecosystem.test_collapse', 2, 1.0);
      expect(mit1.success).toBe(true);
      expect(mit1.newStage).toBe('contained');
      expect(em.getState('ecosystem.test_collapse')?.stage).toBe('contained');

      // Mitigate again -> resolved
      const mit2 = em.mitigateEmergency('ecosystem.test_collapse', 3, 1.0);
      expect(mit2.success).toBe(true);
      expect(mit2.newStage).toBe('resolved');

      // Step with safe metric -> returns to dormant
      em.stepEmergencies(4, { moisture: 80 });
      expect(em.getState('ecosystem.test_collapse')?.stage).toBe('dormant');
    });

    it('serializes and deserializes emergency state correctly', () => {
      const em1 = new EmergencyManager('ecosystem');
      em1.registerEmergency(testEmergencyDef);
      em1.stepEmergencies(1, { moisture: 35 });

      const json = em1.toJSON();
      const em2 = new EmergencyManager('ecosystem');
      em2.registerEmergency(testEmergencyDef);
      em2.fromJSON(json);

      expect(em2.getState('ecosystem.test_collapse')?.stage).toBe('precursor');
      expect(em2.getState('ecosystem.test_collapse')?.severity).toBe(25);
    });
  });

  describe('P007: VisualRestorationManager', () => {
    const testLayerDef: RestorationLayerDefinition = {
      id: 'canopy_vitality',
      name: 'Forest Canopy Vitality',
      metricKey: 'biomass',
      baselineValue: 20,
      targetValue: 100,
      visualElements: {
        materialColor: '#2e7d32',
        accentHex: '#81c784',
        activeMeshes: ['tree_stump', 'sapling_sparse', 'tree_medium', 'canopy_full'],
      },
      stageDescriptions: {
        degraded: 'Barren clearings and withered stumps.',
        stabilizing: 'Sparse saplings begin rooting in protected soil.',
        restoring: 'Young trees form an open woodland canopy.',
        flourishing: 'Dense, mature foliage across the entire watershed.',
      },
    };

    it('evaluates baseline degraded state correctly', () => {
      const vrm = new VisualRestorationManager('ecosystem');
      vrm.registerLayer(testLayerDef);

      const snapshot = vrm.evaluate({ biomass: 20 });
      expect(snapshot.overallProgress).toBe(0);
      expect(snapshot.overallStage).toBe('degraded');
      expect(snapshot.layers[0].stage).toBe('degraded');
      expect(snapshot.layers[0].opacity).toBe(0);
      expect(snapshot.layers[0].activeMeshes).toHaveLength(1);
      expect(snapshot.accessibleSummary).toContain('degraded');
    });

    it('evaluates intermediate and flourishing stages', () => {
      const vrm = new VisualRestorationManager('ecosystem');
      vrm.registerLayer(testLayerDef);

      // 60 biomass: (60 - 20) / (100 - 20) = 40/80 = 0.50 (stabilizing)
      const snapMid = vrm.evaluate({ biomass: 60 });
      expect(snapMid.overallProgress).toBe(0.5);
      expect(snapMid.overallStage).toBe('stabilizing');
      expect(snapMid.layers[0].activeMeshes).toHaveLength(2);

      // 95 biomass: (95 - 20) / 80 = 75/80 = 0.938 (flourishing)
      const snapHigh = vrm.evaluate({ biomass: 95 });
      expect(snapHigh.overallProgress).toBeGreaterThanOrEqual(0.9);
      expect(snapHigh.overallStage).toBe('flourishing');
      expect(snapHigh.layers[0].activeMeshes).toHaveLength(4);
    });

    it('supports reducedMotion mode with zero particle density and quantized opacities', () => {
      const vrm = new VisualRestorationManager('ecosystem');
      vrm.registerLayer(testLayerDef);

      const normalSnap = vrm.evaluate({ biomass: 50 }, { reducedMotion: false });
      expect(normalSnap.reducedMotionApplied).toBe(false);
      expect(normalSnap.layers[0].particleDensity).toBeGreaterThan(0);

      const reducedSnap = vrm.evaluate({ biomass: 50 }, { reducedMotion: true });
      expect(reducedSnap.reducedMotionApplied).toBe(true);
      expect(reducedSnap.layers[0].particleDensity).toBe(0); // Zero particle motion
      // (50 - 20) / 80 = 0.375 -> rounded to nearest 0.25 is 0.5
      expect(reducedSnap.layers[0].opacity).toBe(0.5);
    });
  });

  describe('P017: PolicyManager & Three-Arm Trials', () => {
    const policyA: PolicyDefinition = {
      id: 'ecosystem.aggressive_irrigation',
      worldId: 'ecosystem',
      name: 'Emergency Flooding Influx',
      description: 'Diverts heavy water reserves directly into dry marshland.',
      targetHazard: 'watershed_drought',
      resourceCostsPerTick: { water_stores: 4 },
      metricBenefitsPerTick: { moisture: 2.0 },
      sideEffectsPerTick: { soil_salinity: 0.5 },
      tradeoffSummary: 'Rapidly raises moisture at high water store cost and moderate soil salinization.',
    };

    const policyB: PolicyDefinition = {
      id: 'ecosystem.managed_mulching',
      worldId: 'ecosystem',
      name: 'Organic Cover and Mulching',
      description: 'Deploys protective mulch to retain moisture without drawing stored water.',
      targetHazard: 'watershed_drought',
      resourceCostsPerTick: { seed_stocks: 1 },
      metricBenefitsPerTick: { moisture: 0.6 },
      sideEffectsPerTick: { biomass: 0.1 },
      tradeoffSummary: 'Slow moisture retention consuming seeds with minimal side effects.',
    };

    it('registers policies and verifies retrieval', () => {
      const pm = new PolicyManager('ecosystem');
      pm.registerPolicy(policyA);
      pm.registerPolicy(policyB);

      expect(pm.getAllPolicies()).toHaveLength(2);
      expect(pm.getPolicy('ecosystem.aggressive_irrigation')).toBeDefined();
    });

    it('executes three-arm trial and exposes authentic trade-offs', () => {
      const pm = new PolicyManager('ecosystem');
      pm.registerPolicy(policyA);
      pm.registerPolicy(policyB);

      const initialMetrics = { moisture: 30, soil_salinity: 5, biomass: 50 };
      const trial = pm.evaluateThreeArmTrial(
        initialMetrics,
        'ecosystem.aggressive_irrigation',
        'ecosystem.managed_mulching',
        20,
      );

      expect(trial.horizonTicks).toBe(20);
      expect(trial.worldId).toBe('ecosystem');

      // Baseline: no policy active, no resource spent, metrics unchanged
      expect(trial.baseline.totalResourcesSpent).toEqual({});
      expect(trial.baseline.terminalMetrics.moisture).toBe(30);

      // Policy A (Aggressive):
      // 20 ticks * 4 water_stores = 80 water_stores spent
      expect(trial.policyA.totalResourcesSpent.water_stores).toBe(80);
      // moisture: 30 + (20 * 2.0) = 70
      expect(trial.policyA.terminalMetrics.moisture).toBe(70);
      // soil_salinity side effect: 5 - (20 * 0.5) = -5 (or penalized metric)
      expect(trial.policyA.terminalMetrics.soil_salinity).toBe(-5);

      // Policy B (Managed):
      // 20 ticks * 1 seed_stocks = 20 seed_stocks spent
      expect(trial.policyB.totalResourcesSpent.seed_stocks).toBe(20);
      // moisture: 30 + (20 * 0.6) = 42
      expect(trial.policyB.terminalMetrics.moisture).toBe(42);

      expect(trial.tradeoffsIdentified).toHaveLength(2);
      expect(trial.comparativeSummary).toContain('Three-Arm Trial on ecosystem');
    });
  });
});
