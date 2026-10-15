import { describe, it, expect } from 'vitest';
import {
  SignatureDestinationManager,
  type SignatureDestinationDefinition,
} from '../../features/signatureDestinations';
import {
  HistoricalEraManager,
  type HistoricalEraDefinition,
} from '../../features/historicalEras';
import {
  ActorMemoryManager,
  type ActorMemoryRecord,
  type MonumentRecord,
} from '../../features/actorMemory';
import {
  StandardWorldFeatureModule,
  createDefaultSignatureDestination,
  createDefaultHistoricalEras,
  createDefaultActorsAndMonuments,
} from '../../features/domainModules/domainHelper';

describe('Gate G6 Shared Systems: Destinations, Eras & Memories', () => {
  describe('SignatureDestinationManager', () => {
    const sampleDef: SignatureDestinationDefinition = {
      id: 'ocean.destination.primary',
      worldId: 'ocean',
      siteId: 'site-abyss',
      name: 'The Sunken Obelisk',
      epithet: 'The Abyssal Resonator',
      lore: 'An ancient crystalline monolith emitting acoustic pulses in the abyssal trench.',
      stages: [
        {
          stageNumber: 1,
          title: 'Acoustic Mapping',
          description: 'Survey sonar resonance patterns.',
          targetProgressUnits: 100,
        },
        {
          stageNumber: 2,
          title: 'Resonance Harmonization',
          description: 'Deploy tuning arrays to stabilize frequency drift.',
          targetProgressUnits: 100,
        },
        {
          stageNumber: 3,
          title: 'Equilibrium Verification',
          description: 'Record sustained harmonic balance across the abyss.',
          targetProgressUnits: 100,
        },
      ],
      rewards: {
        bonusMetric: { field: 'stability', delta: 15 },
        budgetGrant: { energy: 50, supplies: 30 },
        legacyLoreRecord: 'Recorded historical triumph at The Sunken Obelisk.',
      },
    };

    it('initializes destination and mission states correctly', () => {
      const mgr = new SignatureDestinationManager('ocean', [sampleDef]);
      expect(mgr.getAllDefinitions()).toHaveLength(1);
      const missions = mgr.getAllMissionStates();
      expect(missions).toHaveLength(1);
      expect(missions[0].destinationId).toBe(sampleDef.id);
      expect(missions[0].status).toBe('AVAILABLE');
      expect(missions[0].currentStage).toBe(1);
      expect(missions[0].stageProgress[0]).toBe(0);
    });

    it('starts mission and advances through all 3 stages to completion', () => {
      const mgr = new SignatureDestinationManager('ocean', [sampleDef]);
      expect(mgr.startMission(sampleDef.id, 10)).toBe(true);
      expect(mgr.getMissionState(sampleDef.id)?.status).toBe('IN_PROGRESS');

      // Stage 1 partial
      let adv = mgr.advanceStageProgress(sampleDef.id, 50, 11);
      expect(adv.success).toBe(true);
      expect(adv.progress).toBe(50);
      expect(adv.stageCompleted).toBe(false);

      // Stage 1 completion
      adv = mgr.advanceStageProgress(sampleDef.id, 50, 12);
      expect(adv.stageCompleted).toBe(true);
      expect(adv.currentStage).toBe(2);
      expect(adv.missionCompleted).toBe(false);

      // Stage 2 completion
      adv = mgr.advanceStageProgress(sampleDef.id, 100, 13);
      expect(adv.stageCompleted).toBe(true);
      expect(adv.currentStage).toBe(3);
      expect(adv.missionCompleted).toBe(false);

      // Stage 3 completion (Mission complete)
      adv = mgr.advanceStageProgress(sampleDef.id, 100, 14);
      expect(adv.stageCompleted).toBe(true);
      expect(adv.missionCompleted).toBe(true);
      expect(mgr.getMissionState(sampleDef.id)?.status).toBe('COMPLETED');
      expect(mgr.getMissionState(sampleDef.id)?.completedAtTick).toBe(14);
    });

    it('serializes and deserializes state faithfully', () => {
      const mgr = new SignatureDestinationManager('ocean', [sampleDef]);
      mgr.startMission(sampleDef.id, 5);
      mgr.advanceStageProgress(sampleDef.id, 75, 6);
      const snapshot = mgr.serialize();

      const restored = new SignatureDestinationManager('ocean', [sampleDef]);
      restored.deserialize(snapshot);
      const mission = restored.getMissionState(sampleDef.id);
      expect(mission?.status).toBe('IN_PROGRESS');
      expect(mission?.stageProgress[0]).toBe(75);
    });
  });

  describe('HistoricalEraManager', () => {
    const sampleEras: [HistoricalEraDefinition, HistoricalEraDefinition, HistoricalEraDefinition] = [
      {
        eraNumber: 1,
        id: 'geology.era.1',
        worldId: 'geology',
        name: 'Era of the Fractured Crust',
        subtitle: 'Initial Seismological Awakening',
        lore: 'Tectonic plates grind in primal turbulence.',
        catalystCondition: 'Initial condition',
        transitionThreshold: { minTick: 0 },
        regimeModifiers: {
          degradationRateMultiplier: 1.0,
          consumptionMultiplier: 1.0,
          hazardEscalationMultiplier: 1.0,
          restorationEfficiencyMultiplier: 1.0,
        },
      },
      {
        eraNumber: 2,
        id: 'geology.era.2',
        worldId: 'geology',
        name: 'The Magmatic Crucible',
        subtitle: 'Subterranean Pressure Escalation',
        lore: 'Volcanic vents erupt as internal pressure spikes.',
        catalystCondition: 'Tick reaches 50 and stability >= 40',
        transitionThreshold: {
          minTick: 50,
          triggerMetric: 'stability',
          triggerValue: 40,
          comparison: '>=',
        },
        regimeModifiers: {
          degradationRateMultiplier: 1.25,
          consumptionMultiplier: 1.15,
          hazardEscalationMultiplier: 1.3,
          restorationEfficiencyMultiplier: 0.9,
        },
      },
      {
        eraNumber: 3,
        id: 'geology.era.3',
        worldId: 'geology',
        name: 'Age of Lithic Harmony',
        subtitle: 'Tectonic Equilibrium',
        lore: 'Subterranean geothermal conduits stabilized into enduring harmony.',
        catalystCondition: 'Tick reaches 150 and containment >= 75',
        transitionThreshold: {
          minTick: 150,
          triggerMetric: 'containment',
          triggerValue: 75,
          comparison: '>=',
        },
        regimeModifiers: {
          degradationRateMultiplier: 0.8,
          consumptionMultiplier: 0.85,
          hazardEscalationMultiplier: 0.7,
          restorationEfficiencyMultiplier: 1.25,
        },
      },
    ];

    it('starts in Era 1 and provides correct regime modifiers', () => {
      const mgr = new HistoricalEraManager('geology', sampleEras);
      expect(mgr.getCurrentEraNumber()).toBe(1);
      expect(mgr.getCurrentEra().name).toBe('Era of the Fractured Crust');
      expect(mgr.getRegimeModifiers().hazardEscalationMultiplier).toBe(1.0);
    });

    it('evaluates transition conditions monotonically', () => {
      const mgr = new HistoricalEraManager('geology', sampleEras);

      // Not enough ticks
      let res = mgr.evaluateTransition(20, { stability: 50 });
      expect(res.transitioned).toBe(false);
      expect(mgr.getCurrentEraNumber()).toBe(1);

      // Enough ticks but not enough metric
      res = mgr.evaluateTransition(60, { stability: 30 });
      expect(res.transitioned).toBe(false);
      expect(mgr.getCurrentEraNumber()).toBe(1);

      // Both conditions met -> transitions to Era 2
      res = mgr.evaluateTransition(60, { stability: 45 });
      expect(res.transitioned).toBe(true);
      expect(res.previousEra?.eraNumber).toBe(1);
      expect(res.newEra?.eraNumber).toBe(2);
      expect(mgr.getCurrentEraNumber()).toBe(2);
      expect(mgr.getRegimeModifiers().degradationRateMultiplier).toBe(1.25);

      // Era 2 transition conditions met -> transitions to Era 3
      res = mgr.evaluateTransition(160, { containment: 80 });
      expect(res.transitioned).toBe(true);
      expect(mgr.getCurrentEraNumber()).toBe(3);
      expect(mgr.getRegimeModifiers().restorationEfficiencyMultiplier).toBe(1.25);

      // Era 3 cannot transition further
      res = mgr.evaluateTransition(300, { containment: 99 });
      expect(res.transitioned).toBe(false);
      expect(mgr.getCurrentEraNumber()).toBe(3);
    });

    it('supports forceEra for manual override', () => {
      const mgr = new HistoricalEraManager('geology', sampleEras);
      mgr.forceEra(3, 42);
      expect(mgr.getCurrentEraNumber()).toBe(3);
      expect(mgr.getCurrentEra().name).toBe('Age of Lithic Harmony');
    });
  });

  describe('ActorMemoryManager', () => {
    it('registers actors, erects monuments, and records chronicles', () => {
      const mgr = new ActorMemoryManager('megacity');
      const actor: ActorMemoryRecord = {
        id: 'actor-1',
        worldId: 'megacity',
        name: 'Chief Engineer Maya Vance',
        role: 'Systems Architect',
        eraNumber: 1,
        achievement: 'Designed the primary grid surge shunt',
        sacrificeOrCost: 'Endured extreme radiation during manual override',
        recordedTick: 25,
        sentiment: 'revered',
        legacyEffect: {
          metric: 'stability',
          bonus: 5,
          description: 'Grid stability bonus from pioneer engineering',
        },
      };
      mgr.registerActor(actor);

      expect(mgr.getAllActors()).toHaveLength(1);
      expect(mgr.getActor('actor-1')?.name).toBe('Chief Engineer Maya Vance');

      const monument: MonumentRecord = {
        id: 'monument-1',
        worldId: 'megacity',
        siteId: 'site-grid-core',
        title: 'The Vance Shunt Column',
        inscription: 'Here stands the column that sustained ten million souls.',
        erectedTick: 30,
        dedicatedToActorId: 'actor-1',
      };
      mgr.erectMonument(monument);

      expect(mgr.getAllMonuments()).toHaveLength(1);

      mgr.recordChronicle(
        35,
        'Monument Dedicated at Grid Core',
        'Citizens gather to honor the resilience of the engineering vanguard.',
        'actor-1',
      );

      // 1 from registerActor + 1 from erectMonument + 1 explicit recordChronicle = 3
      expect(mgr.getAllChronicles()).toHaveLength(3);

      const legacy = mgr.getLegacyModifiers();
      expect(legacy.stability).toBe(5);
    });
  });

  describe('StandardWorldFeatureModule G6 Seam', () => {
    it('integrates G6 capabilities, actions, evaluation, and projection', () => {
      const destDef = createDefaultSignatureDestination('ocean');
      const eras = createDefaultHistoricalEras('ocean');
      const { actors, monuments } = createDefaultActorsAndMonuments('ocean');

      const mod = new StandardWorldFeatureModule({
        worldId: 'ocean',
        capabilities: [],
        hazardNodes: [],
        hazardLinks: [],
        initialBudget: {},
        actionCosts: {},
        actionDeltas: {},
        metricKeys: ['salinity', 'temperature', 'stability'],
        signatureDestination: destDef,
        historicalEras: eras,
        initialActors: actors,
        initialMonuments: monuments,
      });

      // Verify managers are accessible
      expect(mod.destinationManager).toBeDefined();
      expect(mod.eraManager).toBeDefined();
      expect(mod.actorMemoryManager).toBeDefined();

      // Verify capabilities are registered
      const capIds = mod.capabilities.map((c) => c.id);
      expect(capIds).toContain('destination.start');
      expect(capIds).toContain('destination.progress');
      expect(capIds).toContain('era.transition');
      expect(capIds).toContain('memorial.inscribe');
      expect(capIds).toContain('monument.erect');

      const mockCtx = {
        tick: 1,
        state: { stability: 50 },
        emitEvent: (e: any) => ({ ...e, id: `evt-${Date.now()}` }),
      };

      // Test destination.start action
      const startValidation = mod.validateAction(
        {
          actionFamily: 'P011',
          worldId: 'ocean',
          capabilityId: 'destination.start',
          payload: { destinationId: destDef.id },
        },
        mockCtx.state,
      );
      expect(startValidation.valid).toBe(true);

      const startRes = mod.applyAction(mockCtx.state, startValidation.action!, mockCtx as any);
      expect(startRes.status).toBe('success');
      expect(mod.destinationManager.getMissionState(destDef.id)?.status).toBe('IN_PROGRESS');

      // Test destination.progress action
      const progValidation = mod.validateAction(
        {
          actionFamily: 'P011',
          worldId: 'ocean',
          capabilityId: 'destination.progress',
          payload: { destinationId: destDef.id, delta: 30 },
        },
        mockCtx.state,
      );
      expect(progValidation.valid).toBe(true);

      const progRes = mod.applyAction(mockCtx.state, progValidation.action!, mockCtx as any);
      expect(progRes.status).toBe('success');
      expect(mod.destinationManager.getMissionState(destDef.id)?.stageProgress[0]).toBe(30);

      // Test era.transition action
      const eraValidation = mod.validateAction(
        {
          actionFamily: 'P012',
          worldId: 'ocean',
          capabilityId: 'era.transition',
          payload: { targetEra: 2 },
        },
        mockCtx.state,
      );
      expect(eraValidation.valid).toBe(true);

      const eraRes = mod.applyAction(mockCtx.state, eraValidation.action!, mockCtx as any);
      expect(eraRes.status).toBe('success');
      expect(mod.eraManager.getCurrentEraNumber()).toBe(2);

      // Test memorial.inscribe action
      const inscribeValidation = mod.validateAction(
        {
          actionFamily: 'P015',
          worldId: 'ocean',
          capabilityId: 'memorial.inscribe',
          payload: {
            name: 'Dr. Elena Rostova',
            role: 'Chief Oceanographer',
            achievement: 'Mapped hydrothermal abyssal currents',
          },
        },
        mockCtx.state,
      );
      expect(inscribeValidation.valid).toBe(true);

      const inscribeRes = mod.applyAction(mockCtx.state, inscribeValidation.action!, mockCtx as any);
      expect(inscribeRes.status).toBe('success');
      expect(mod.actorMemoryManager.getAllActors().some((a) => a.name === 'Dr. Elena Rostova')).toBe(true);

      // Test monument.erect action
      const monValidation = mod.validateAction(
        {
          actionFamily: 'P015',
          worldId: 'ocean',
          capabilityId: 'monument.erect',
          payload: {
            title: 'Abyssal Beacon of Rostova',
            siteId: 'site-trench',
            inscription: 'May the deep currents remember our vigil.',
          },
        },
        mockCtx.state,
      );
      expect(monValidation.valid).toBe(true);

      const monRes = mod.applyAction(mockCtx.state, monValidation.action!, mockCtx as any);
      expect(monRes.status).toBe('success');
      expect(mod.actorMemoryManager.getAllMonuments().some((m) => m.title === 'Abyssal Beacon of Rostova')).toBe(true);

      // Test projectVisibleState
      const visible = mod.projectVisibleState(mockCtx.state, null);
      expect(visible.destinationMissions).toBeDefined();
      expect(visible.destinationMissions?.length).toBeGreaterThan(0);
      expect(visible.currentEra?.eraNumber).toBe(2);
      expect(visible.memorializedActors?.length).toBeGreaterThan(0);
      expect(visible.monuments?.length).toBeGreaterThan(0);
    });
  });
});
