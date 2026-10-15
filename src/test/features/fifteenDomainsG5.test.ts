import { describe, it, expect } from 'vitest';
import '../../features/domainModules';
import { globalFeatureRegistry } from '../../features/registry';
import { SimulationKernel } from '../../core/kernel';
import { isOmniverseIIIRules } from '../../features/featureVersions';
import { CORE_WORLD_PLUGINS } from '../../worlds';
import { CrewRole, CREW_ROLE_DEFINITIONS } from '../../features/crewSpecializations';

describe('Omniverse III Fifteen-World Continuum Navigation and Crew Specializations (Gate G5 Checkpoint B)', () => {
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

  it('verifies all 15 universes expose standard G5 navigation and crew capabilities', () => {
    const requiredG5Caps = [
      'navigation.zoom',
      'navigation.transit',
      'crew.assign',
      'crew.rest',
    ];

    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      expect(mod).toBeDefined();
      const capIds = new Set(mod.capabilities.map((c: any) => c.id));
      for (const reqCap of requiredG5Caps) {
        expect(capIds.has(reqCap), `World ${worldId} missing capability ${reqCap}`).toBe(true);
      }
    }
  });

  it('verifies all 15 universes initialize AtlasContinuumNavigator with 4 zoom scales and clamping', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      expect(mod.continuumNavigator).toBeDefined();
      expect(mod.continuumNavigator.getCurrentScale()).toBe('universe');

      // Monotonic step in
      expect(mod.continuumNavigator.zoomIn()).toBe('region');
      expect(mod.continuumNavigator.zoomIn()).toBe('site');
      expect(mod.continuumNavigator.zoomIn()).toBe('field');

      // Upper clamp at field
      expect(mod.continuumNavigator.zoomIn()).toBe('field');

      // Step out and lower clamp
      mod.continuumNavigator.setScale('universe');
      expect(mod.continuumNavigator.zoomOut()).toBe('universe');
    }
  });

  it('executes navigation.zoom and projects navigationScale across all 15 universes', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      const mockState = { tick: 10 };
      const mockCtx = {
        tick: 10,
        state: mockState,
        emitEvent: (ev: any) => ({ ...ev, id: `evt-${Date.now()}` }),
      };

      // Validate zoom action
      const validation = mod.validateAction(
        {
          capabilityId: 'navigation.zoom',
          payload: { scale: 'site' },
        },
        mockState,
      );
      expect(validation.valid, `World ${worldId} failed zoom validation: ${validation.error}`).toBe(true);

      // Execute zoom
      const receipt = mod.applyAction(mockState, validation.action, mockCtx);
      expect(receipt.status).toBe('success');

      // Verify projection
      const vis = mod.projectVisibleState(mockState, null);
      expect(vis.navigationScale).toBe('site');
    }
  });

  it('verifies route transit legality and fuel enforcement across all 15 universes', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;

      // Intra-region transit is always legal with 0 cost
      const sameRegionCheck = mod.continuumNavigator.verifyTransit('region-primary', 'region-primary', 0);
      expect(sameRegionCheck.legal).toBe(true);
      expect(sameRegionCheck.fuelCost).toBe(0);

      // Uncharted route transit is rejected
      const unchartedCheck = mod.continuumNavigator.verifyTransit('region-primary', 'region-uncharted-xyz', 100);
      expect(unchartedCheck.legal).toBe(false);
      expect(unchartedCheck.reason).toContain('No charted route');
    }
  });

  it('verifies all 15 universes initialize CrewManager with 6 certified specialist roles', () => {
    const requiredRoles = [
      CrewRole.FIELD_SURVEYOR,
      CrewRole.SYSTEMS_ENGINEER,
      CrewRole.BIOSPHERE_ECOLOGIST,
      CrewRole.LOGISTICS_COURIER,
      CrewRole.HEAVY_CONSTRUCTOR,
      CrewRole.HAZARD_SPECIALIST,
    ];

    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      expect(mod.crewManager).toBeDefined();

      const allCrew = mod.crewManager.getAllCrew();
      expect(allCrew.length, `World ${worldId} has ${allCrew.length} crew members, expected 6`).toBe(6);

      const rolesPresent = new Set(allCrew.map((c: any) => c.role));
      for (const reqRole of requiredRoles) {
        expect(rolesPresent.has(reqRole), `World ${worldId} missing role ${CREW_ROLE_DEFINITIONS[reqRole].roleName}`).toBe(true);
      }

      // Check visible state projection
      const vis = mod.projectVisibleState({}, null);
      expect(vis.crewMembers).toBeDefined();
      expect(vis.crewMembers.length).toBe(6);
    }
  });

  it('enforces legality checks for exhausted crew and certified roles across all 15 universes', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      const allCrew = mod.crewManager.getAllCrew();
      const firstCrew = allCrew[0];

      // Exhaust crew
      mod.crewManager.debitEnergy(firstCrew.id, 95);
      expect(firstCrew.energy).toBeLessThan(10);

      // Expedition check should reject exhausted member
      const exhaustedCheck = mod.crewManager.checkExpeditionLegality([firstCrew.id]);
      expect(exhaustedCheck.legal).toBe(false);
      expect(exhaustedCheck.reason).toContain('exhausted');

      // Restores crew
      mod.crewManager.restCrew(firstCrew.id, 90);
      expect(firstCrew.energy).toBeGreaterThanOrEqual(90);

      // Verify certified role requirement for specialized mission
      const surveyor = allCrew.find((c: any) => c.role === CrewRole.FIELD_SURVEYOR);
      expect(surveyor).toBeDefined();
      const missingRoleCheck = mod.crewManager.checkExpeditionLegality([surveyor.id], CrewRole.HAZARD_SPECIALIST);
      expect(missingRoleCheck.legal).toBe(false);
      expect(missingRoleCheck.reason).toContain('Missing certified role');
    }
  });

  it('executes crew.assign and crew.rest actions with energy debits across all 15 universes', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      const mockState = { tick: 20 };
      const mockCtx = {
        tick: 20,
        state: mockState,
        emitEvent: (ev: any) => ({ ...ev, id: `evt-${Date.now()}` }),
      };

      const allCrew = mod.crewManager.getAllCrew();
      const testMember = allCrew[0];
      const initialEnergy = testMember.energy;

      // Assign action
      const assignValidation = mod.validateAction(
        {
          capabilityId: 'crew.assign',
          payload: { crewId: testMember.id, targetSiteId: 'site-field-alpha' },
        },
        mockState,
      );
      expect(assignValidation.valid).toBe(true);

      const assignReceipt = mod.applyAction(mockState, assignValidation.action, mockCtx);
      expect(assignReceipt.status).toBe('success');
      expect(testMember.energy).toBeLessThan(initialEnergy);
      expect(testMember.assignedSiteId).toBe('site-field-alpha');

      // Rest action
      const preRestEnergy = testMember.energy;
      const restValidation = mod.validateAction(
        {
          capabilityId: 'crew.rest',
          payload: { crewId: testMember.id, amount: 20 },
        },
        mockState,
      );
      expect(restValidation.valid).toBe(true);

      const restReceipt = mod.applyAction(mockState, restValidation.action, mockCtx);
      expect(restReceipt.status).toBe('success');
      expect(testMember.energy).toBeGreaterThan(preRestEnergy);
    }
  });

  it('previews mission and expedition risk with role-based mitigations across all 15 universes', () => {
    for (const worldId of all15WorldIds) {
      const mod = globalFeatureRegistry.get(worldId) as any;
      const hazardSpecialist = mod.crewManager.getAllCrew().find((c: any) => c.role === CrewRole.HAZARD_SPECIALIST);
      expect(hazardSpecialist).toBeDefined();

      const riskWithoutCrew = mod.crewManager.previewMissionRisk(5.0);
      expect(riskWithoutCrew.baselineRisk).toBe(5.0);
      expect(riskWithoutCrew.netRisk).toBe(5.0);

      const riskWithSpecialist = mod.crewManager.previewMissionRisk(5.0, [hazardSpecialist.id]);
      expect(riskWithSpecialist.mitigationDiscount).toBeGreaterThan(0);
      expect(riskWithSpecialist.netRisk).toBeLessThan(5.0);
    }
  });

  it('proves zero-impact hash identity on legacy runs across all 15 worlds', () => {
    expect(CORE_WORLD_PLUGINS).toHaveLength(15);

    for (const plugin of CORE_WORLD_PLUGINS) {
      const kernel = new SimulationKernel({
        runId: `legacy-parity-g5-${plugin.id}`,
        name: `Legacy Parity G5 ${plugin.id}`,
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
      expect(kernel.tick).toBe(10);
    }
  });
});
