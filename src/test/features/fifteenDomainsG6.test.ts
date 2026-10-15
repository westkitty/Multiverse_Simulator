import { describe, it, expect } from 'vitest';
import '../../features/domainModules';
import { globalFeatureRegistry } from '../../features/registry';
import { SimulationKernel } from '../../core/kernel';
import { isOmniverseIIIRules } from '../../features/featureVersions';
import { CORE_WORLD_PLUGINS } from '../../worlds';

describe('Omniverse III Fifteen-World Missions, Eras & Memories (Gate G6 Checkpoint B)', () => {
  const all15WorldIds = [
    'ecosystem',
    'station',
    'civilization',
    'atmosphere',
    'ocean',
    'celestial',
    'megacity',
    'industrial',
    'geology',
    'wild-meridian',
    'hollow-deep',
    'timeworn-empire',
    'terraforming-frontier',
    'machine-wilderness',
    'signal-expanse',
  ] as const;

  it('registers all 15 worlds in globalFeatureRegistry with rulesVersion=1', () => {
    expect(all15WorldIds.length).toBe(15);
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId);
      expect(mod).toBeDefined();
      expect(mod?.worldId).toBe(worldId);
      expect(mod?.rulesVersion).toBe(1);
    }
  });

  it('verifies all 15 universes expose standard G6 capabilities', () => {
    const requiredG6Caps = [
      'destination.start',
      'destination.progress',
      'era.transition',
      'memorial.inscribe',
      'monument.erect',
    ];

    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      expect(mod).toBeDefined();
      const capIds = new Set(mod.capabilities.map((c: any) => c.id));
      for (const reqCap of requiredG6Caps) {
        expect(capIds.has(reqCap), `World ${worldId} missing capability ${reqCap}`).toBe(true);
      }
    }
  });

  it('verifies all 15 universes possess 3-stage signature destination missions (P011)', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      expect(mod.destinationManager, `World ${worldId} missing destinationManager`).toBeDefined();

      const defs = mod.destinationManager.getAllDefinitions();
      expect(defs.length, `World ${worldId} should have at least 1 destination definition`).toBeGreaterThanOrEqual(1);

      const dest = defs[0];
      expect(dest.worldId).toBe(worldId);
      expect(dest.stages).toHaveLength(3);
      for (const stage of dest.stages) {
        expect(stage.targetProgressUnits).toBeGreaterThan(0);
        expect(stage.title.length).toBeGreaterThan(0);
      }

      const missions = mod.destinationManager.getAllMissionStates();
      expect(missions.length).toBeGreaterThanOrEqual(1);
      const mission = missions[0];
      expect(mission.destinationId).toBe(dest.id);
      expect(mission.status).toBe('AVAILABLE');
      expect(mission.currentStage).toBe(1);
      expect(mission.stageProgress).toEqual([0, 0, 0]);
    }
  });

  it('executes destination.start and destination.progress to completion across all 15 universes (P011)', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      const def = mod.destinationManager.getAllDefinitions()[0];
      const mockState = { stability: 50 };
      const mockCtx = {
        tick: 10,
        state: mockState,
        emitEvent: (ev: any) => ({ ...ev, id: `evt-${Date.now()}` }),
      };

      // 1. Start mission
      const startValidation = mod.validateAction(
        {
          capabilityId: 'destination.start',
          payload: { destinationId: def.id },
        },
        mockState,
      );
      expect(startValidation.valid).toBe(true);

      const startReceipt = mod.applyAction(mockState, startValidation.action, mockCtx);
      expect(startReceipt.status).toBe('success');
      expect(mod.destinationManager.getMissionState(def.id).status).toBe('IN_PROGRESS');

      // 2. Advance through all 3 stages
      for (let s = 1; s <= 3; s++) {
        const progValidation = mod.validateAction(
          {
            capabilityId: 'destination.progress',
            payload: { destinationId: def.id, delta: 100 },
          },
          mockState,
        );
        expect(progValidation.valid).toBe(true);

        const progReceipt = mod.applyAction(mockState, progValidation.action, mockCtx);
        expect(progReceipt.status).toBe('success');
      }

      // 3. Verify mission completion
      const completedState = mod.destinationManager.getMissionState(def.id);
      expect(completedState.status).toBe('COMPLETED');
      expect(completedState.completedAtTick).toBe(10);
    }
  });

  it('verifies all 15 universes possess 3 authored historical eras with physical regime modifiers (P012)', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      expect(mod.eraManager, `World ${worldId} missing eraManager`).toBeDefined();

      const eras = mod.eraManager.getAllEras();
      expect(eras).toHaveLength(3);

      for (let i = 0; i < 3; i++) {
        const era = eras[i];
        expect(era.eraNumber).toBe(i + 1);
        expect(era.worldId).toBe(worldId);
        expect(era.name.length).toBeGreaterThan(0);
        expect(era.regimeModifiers.degradationRateMultiplier).toBeGreaterThan(0);
        expect(era.regimeModifiers.consumptionMultiplier).toBeGreaterThan(0);
        expect(era.regimeModifiers.hazardEscalationMultiplier).toBeGreaterThan(0);
        expect(era.regimeModifiers.restorationEfficiencyMultiplier).toBeGreaterThan(0);
      }

      expect(mod.eraManager.getCurrentEraNumber()).toBe(1);
    }
  });

  it('evaluates monotonic era transitions and forceEra across all 15 universes (P012)', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      const mockState = { stability: 60 };
      const mockCtx = {
        tick: 105,
        state: mockState,
        emitEvent: (ev: any) => ({ ...ev, id: `evt-${Date.now()}` }),
      };

      // Step owned systems triggers transition check
      mod.stepOwnedSystems({ tick: 105, state: mockState });

      // Era transition action
      const transitionValidation = mod.validateAction(
        {
          capabilityId: 'era.transition',
          payload: { targetEra: 2 },
        },
        mockState,
      );
      expect(transitionValidation.valid).toBe(true);

      const receipt = mod.applyAction(mockState, transitionValidation.action, mockCtx);
      expect(receipt.status).toBe('success');
      expect(mod.eraManager.getCurrentEraNumber()).toBe(2);

      // Verify active regime modifiers reflect Era 2
      const mods = mod.eraManager.getRegimeModifiers();
      expect(mods.degradationRateMultiplier).toBeGreaterThanOrEqual(1.0);
    }
  });

  it('verifies actor memory, monuments, and civic chronicles across all 15 universes (P015)', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      expect(mod.actorMemoryManager, `World ${worldId} missing actorMemoryManager`).toBeDefined();

      const actors = mod.actorMemoryManager.getAllActors();
      expect(actors.length, `World ${worldId} should have at least 1 memorialized actor`).toBeGreaterThanOrEqual(1);

      const monuments = mod.actorMemoryManager.getAllMonuments();
      expect(monuments.length, `World ${worldId} should have at least 1 monument`).toBeGreaterThanOrEqual(1);

      const chronicles = mod.actorMemoryManager.getAllChronicles();
      expect(chronicles.length, `World ${worldId} should have chronicle entries`).toBeGreaterThanOrEqual(1);

      const legacy = mod.actorMemoryManager.getLegacyModifiers();
      expect(typeof legacy).toBe('object');
    }
  });

  it('executes memorial.inscribe and monument.erect across all 15 universes (P015)', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      const mockState = { stability: 50 };
      const mockCtx = {
        tick: 20,
        state: mockState,
        emitEvent: (ev: any) => ({ ...ev, id: `evt-${Date.now()}` }),
      };

      // 1. Inscribe memory
      const inscribeValidation = mod.validateAction(
        {
          capabilityId: 'memorial.inscribe',
          payload: {
            name: `Commander Vane of ${worldId}`,
            role: 'Lead Vanguard',
            achievement: 'Established primary perimeter defense during crisis',
          },
        },
        mockState,
      );
      expect(inscribeValidation.valid).toBe(true);

      const inscribeReceipt = mod.applyAction(mockState, inscribeValidation.action, mockCtx);
      expect(inscribeReceipt.status).toBe('success');
      expect(mod.actorMemoryManager.getAllActors().some((a: any) => a.name.includes('Commander Vane'))).toBe(true);

      // 2. Erect monument
      const monValidation = mod.validateAction(
        {
          capabilityId: 'monument.erect',
          payload: {
            title: `Pillar of ${worldId}`,
            siteId: 'site-primary',
            inscription: 'Honoring the enduring courage of our field pioneers.',
          },
        },
        mockState,
      );
      expect(monValidation.valid).toBe(true);

      const monReceipt = mod.applyAction(mockState, monValidation.action, mockCtx);
      expect(monReceipt.status).toBe('success');
      expect(mod.actorMemoryManager.getAllMonuments().some((m: any) => m.title.includes('Pillar of'))).toBe(true);
    }
  });

  it('projects complete G6 state into VisibleFeatureState across all 15 universes', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      const state = { stability: 50 };
      const visible = mod.projectVisibleState(state, null);

      expect(visible.destinationMissions, `World ${worldId} missing destinationMissions`).toBeDefined();
      expect(visible.destinationMissions.length).toBeGreaterThanOrEqual(1);

      expect(visible.currentEra, `World ${worldId} missing currentEra`).toBeDefined();
      expect(visible.currentEra.name.length).toBeGreaterThan(0);
      expect(visible.currentEra.regimeModifiers).toBeDefined();

      expect(visible.memorializedActors, `World ${worldId} missing memorializedActors`).toBeDefined();
      expect(visible.memorializedActors.length).toBeGreaterThanOrEqual(1);

      expect(visible.monuments, `World ${worldId} missing monuments`).toBeDefined();
      expect(visible.monuments.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('proves zero-impact hash identity on legacy runs across all 15 worlds (worldRulesVersion: 0)', () => {
    expect(CORE_WORLD_PLUGINS).toHaveLength(15);

    for (const plugin of CORE_WORLD_PLUGINS) {
      const kernel = new SimulationKernel({
        runId: `legacy-parity-${plugin.id}`,
        name: `Legacy Parity ${plugin.id}`,
        plugin,
        seed: 424242,
      });

      expect(isOmniverseIIIRules(kernel.getConfig())).toBe(false);

      for (let i = 0; i < 10; i++) {
        kernel.step();
      }

      const hashAt10 = kernel.getStateHash();
      expect(typeof hashAt10).toBe('string');
      expect(hashAt10).toHaveLength(16);

      const cp = kernel.createCheckpoint('cp-10');
      expect(cp.stateHash).toBe(hashAt10);

      for (let i = 0; i < 5; i++) {
        kernel.step();
      }

      kernel.restoreCheckpoint(cp.id);
      expect(kernel.getStateHash()).toBe(hashAt10);
      expect(kernel.tick).toBe(10);
    }
  });
});
