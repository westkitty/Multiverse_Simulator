import { describe, it, expect } from 'vitest';
import {
  AtlasContinuumNavigator,
  SCALE_ORDER,
  type NavigationSite,
  type NavigationRoute,
} from '../../features/atlasContinuum';
import {
  CrewManager,
  CrewRole,
  CREW_ROLE_DEFINITIONS,
} from '../../features/crewSpecializations';
import { StandardWorldFeatureModule } from '../../features/domainModules/domainHelper';

const testBudgets = {
  energy: { balance: 100, capacity: 100 },
  fuel: { balance: 100, capacity: 100 },
  compute: { balance: 100, capacity: 100 },
};

const baseTestConfig = {
  worldId: 'geology',
  capabilities: [],
  hazardNodes: [],
  hazardLinks: [],
  actionCosts: {},
  actionDeltas: {},
  initialBudget: testBudgets,
  policies: [],
};

describe('Gate G5 Shared Contracts: Atlas Continuum Navigation (P008)', () => {
  const sites: NavigationSite[] = [
    {
      id: 'site-alpha',
      worldId: 'geology',
      regionId: 'reg-surface',
      name: 'Caldera Observation Post',
      description: 'Thermal imaging site',
      coordinates: { x: 100, y: 200, z: 0 },
      isDisclosed: true,
      dangerLevel: 3,
    },
    {
      id: 'site-beta',
      worldId: 'geology',
      regionId: 'reg-subsurface',
      name: 'Sub-crustal Chamber',
      description: 'Magmatic pressure cavity',
      coordinates: { x: 150, y: 350, z: -50 },
      isDisclosed: false, // Redacted
      dangerLevel: 5,
    },
  ];

  const routes: NavigationRoute[] = [
    {
      id: 'route-surf-to-sub',
      fromRegionId: 'reg-surface',
      toRegionId: 'reg-subsurface',
      distanceKm: 42,
      fuelCost: 15,
      travelTicks: 4,
      hazardRating: 2,
    },
  ];

  it('manages 4 zoom scales with monotonic clamping', () => {
    expect(SCALE_ORDER).toEqual(['universe', 'region', 'site', 'field']);
    const nav = new AtlasContinuumNavigator('geology', sites, routes);
    expect(nav.getCurrentScale()).toBe('universe');

    // Zooming out from universe remains clamped at universe
    nav.zoomOut();
    expect(nav.getCurrentScale()).toBe('universe');

    // Step in sequentially
    expect(nav.zoomIn()).toBe('region');
    expect(nav.zoomIn()).toBe('site');
    expect(nav.zoomIn()).toBe('field');

    // Zooming in from field remains clamped at field
    nav.zoomIn();
    expect(nav.getCurrentScale()).toBe('field');

    // Step out to region
    nav.setScale('region');
    expect(nav.getCurrentScale()).toBe('region');
  });

  it('redacts undiscovered sites from visible projection at regional and site views', () => {
    const nav = new AtlasContinuumNavigator('geology', sites, routes);
    nav.setScale('region');

    const visibleSites = nav.getVisibleSites();
    expect(visibleSites.length).toBe(2);

    const alpha = visibleSites.find((s) => s.id === 'site-alpha');
    const beta = visibleSites.find((s) => s.id === 'site-beta');

    expect(alpha?.name).toBe('Caldera Observation Post');
    expect(beta?.name).toBe('Unmapped Sector');
    expect(beta?.description).toBe('Survey required to disclose telemetry.');
    expect(beta?.dangerLevel).toBe(0);

    // After disclosing site-beta
    nav.discloseSite('site-beta');
    const updatedVisible = nav.getVisibleSites();
    const updatedBeta = updatedVisible.find((s) => s.id === 'site-beta');
    expect(updatedBeta?.name).toBe('Sub-crustal Chamber');
    expect(updatedBeta?.dangerLevel).toBe(5);
  });

  it('enforces legal physical route transit requiring fuel and time', () => {
    const nav = new AtlasContinuumNavigator('geology', sites, routes);

    // Transit with sufficient fuel
    const validCheck = nav.verifyTransit('reg-surface', 'reg-subsurface', 20);
    expect(validCheck.legal).toBe(true);
    expect(validCheck.fuelCost).toBe(15);
    expect(validCheck.travelTicks).toBe(4);

    // Transit with insufficient fuel
    const lowFuelCheck = nav.verifyTransit('reg-surface', 'reg-subsurface', 10);
    expect(lowFuelCheck.legal).toBe(false);
    expect(lowFuelCheck.reason).toContain('Insufficient fuel');

    // Transit on disconnected route
    const disconnectedCheck = nav.verifyTransit('reg-surface', 'reg-orbital', 50);
    expect(disconnectedCheck.legal).toBe(false);
    expect(disconnectedCheck.reason).toContain('No charted route');
  });

  it('transforms coordinates accurately across multi-scale dimensions', () => {
    const nav = new AtlasContinuumNavigator('geology', sites, routes);
    const converted = nav.convertCoordinates({ x: 10, y: 20 }, 'site', 'field');
    expect(converted.x).toBe(100);
    expect(converted.y).toBe(200);

    const macro = nav.convertCoordinates({ x: 50, y: 50 }, 'field', 'universe');
    expect(macro.x).toBe(0.05);
    expect(macro.y).toBe(0.05);
  });
});

describe('Gate G5 Shared Contracts: Crew Specializations (P009)', () => {
  it('defines 6 concrete specialization roles with quantitative modifiers', () => {
    expect(Object.keys(CREW_ROLE_DEFINITIONS).length).toBe(6);

    const surveyor = CREW_ROLE_DEFINITIONS[CrewRole.FieldSurveyor];
    expect(surveyor.roleName).toBe('Field Surveyor');
    expect(surveyor.surveySpeedMultiplier).toBeGreaterThan(1.0);

    const hazardSpec = CREW_ROLE_DEFINITIONS[CrewRole.HazardSpecialist];
    expect(hazardSpec.hazardMitigationBonus).toBeGreaterThan(0.2);

    const engineer = CREW_ROLE_DEFINITIONS[CrewRole.SystemsEngineer];
    expect(engineer.repairEfficiencyMultiplier).toBeGreaterThan(1.0);
  });

  it('tracks energy debits and rest restoration', () => {
    const mgr = new CrewManager('geology');
    mgr.registerCrew({
      id: 'crew-01',
      worldId: 'geology',
      name: 'Dr. Sarah Stone',
      role: CrewRole.HazardSpecialist,
      energy: 50,
      assignedRegionId: 'reg-surface',
      assignedSiteId: null,
      work: 12,
    });

    mgr.debitEnergy('crew-01', 30);
    expect(mgr.getCrew('crew-01')?.energy).toBe(20);

    mgr.restCrew('crew-01', 50);
    expect(mgr.getCrew('crew-01')?.energy).toBe(70);

    // Clamps at 100 max
    mgr.restCrew('crew-01', 50);
    expect(mgr.getCrew('crew-01')?.energy).toBe(100);
  });

  it('enforces legality for exhausted crew and certified role requirements', () => {
    const mgr = new CrewManager('geology');
    mgr.registerCrew({
      id: 'crew-tired',
      worldId: 'geology',
      name: 'Exhausted Surveyor',
      role: CrewRole.FieldSurveyor,
      energy: 5,
      assignedRegionId: 'reg-surface',
      assignedSiteId: null,
      work: 0,
    });
    mgr.registerCrew({
      id: 'crew-engineer',
      worldId: 'geology',
      name: 'Tech Specialist',
      role: CrewRole.SystemsEngineer,
      energy: 80,
      assignedRegionId: 'reg-surface',
      assignedSiteId: null,
      work: 0,
    });

    // Exhausted crew cannot be dispatched
    const exhaustedCheck = mgr.checkExpeditionLegality(['crew-tired']);
    expect(exhaustedCheck.legal).toBe(false);
    expect(exhaustedCheck.reason).toContain('exhausted');

    // Role requirement check
    const roleCheck = mgr.checkExpeditionLegality(['crew-engineer'], CrewRole.HazardSpecialist);
    expect(roleCheck.legal).toBe(false);
    expect(roleCheck.reason).toContain('Missing certified role');

    // Valid check
    const validCheck = mgr.checkExpeditionLegality(['crew-engineer'], CrewRole.SystemsEngineer);
    expect(validCheck.legal).toBe(true);
  });

  it('previews mission risk and applies specialist hazard mitigation', () => {
    const mgr = new CrewManager('geology');
    mgr.registerCrew({
      id: 'crew-hazard',
      worldId: 'geology',
      name: 'Chief Defender',
      role: CrewRole.HazardSpecialist,
      energy: 90,
      assignedRegionId: 'reg-surface',
      assignedSiteId: null,
      work: 0,
    });

    const previewWithoutCrew = mgr.previewMissionRisk(4);
    expect(previewWithoutCrew.baselineRisk).toBe(4);
    expect(previewWithoutCrew.netRisk).toBe(4);

    const previewWithHazardSpec = mgr.previewMissionRisk(4, ['crew-hazard']);
    expect(previewWithHazardSpec.mitigationDiscount).toBeGreaterThan(0);
    expect(previewWithHazardSpec.netRisk).toBeLessThan(4);
  });
});

describe('Gate G5 StandardWorldFeatureModule Navigation and Crew Integration', () => {
  it('instantiates navigation and crew systems and exposes standard capabilities', () => {
    const mod = new StandardWorldFeatureModule({
      ...baseTestConfig,
      metricKeys: ['mantle_pressure', 'seismic_tension'],
    });

    const capIds = mod.capabilities.map((c) => c.id);
    expect(capIds).toContain('navigation.zoom');
    expect(capIds).toContain('navigation.transit');
    expect(capIds).toContain('crew.assign');
    expect(capIds).toContain('crew.rest');

    // Visible state projections
    const vis = mod.projectVisibleState({ mantle_pressure: 45, seismic_tension: 20 }, null);
    expect(vis.crewMembers).toBeDefined();
    expect(vis.crewMembers?.length).toBe(6);
    expect(vis.navigationScale).toBe('universe');
  });

  it('executes navigation zoom and transit actions cleanly', () => {
    const mockCtx = {
      tick: 10,
      state: { mantle_pressure: 50 },
      emitEvent: (ev: any) => ({ ...ev, id: `evt-${Date.now()}` }),
    };

    const mod = new StandardWorldFeatureModule({
      ...baseTestConfig,
      metricKeys: ['mantle_pressure'],
    });

    // Zoom action
    const zoomValidation = mod.validateAction(
      {
        actionFamily: 'P008',
        worldId: 'geology',
        capabilityId: 'navigation.zoom',
        payload: { scale: 'site' },
      },
      mockCtx.state,
    );
    expect(zoomValidation.valid).toBe(true);

    const zoomExec = mod.applyAction(mockCtx.state, zoomValidation.action!, mockCtx as any);
    expect(zoomExec.status).toBe('success');

    const updatedVis = mod.projectVisibleState(mockCtx.state, null);
    expect(updatedVis.navigationScale).toBe('site');
  });

  it('executes crew assign and rest actions cleanly', () => {
    const mockCtx = {
      tick: 15,
      state: { mantle_pressure: 50 },
      emitEvent: (ev: any) => ({ ...ev, id: `evt-${Date.now()}` }),
    };

    const mod = new StandardWorldFeatureModule({
      ...baseTestConfig,
      metricKeys: ['mantle_pressure'],
    });

    const crewList = mod.projectVisibleState(mockCtx.state, null).crewMembers!;
    const testCrewId = crewList[0].id;

    // Crew assign action
    const assignValidation = mod.validateAction(
      {
        actionFamily: 'P009',
        worldId: 'geology',
        capabilityId: 'crew.assign',
        payload: { crewId: testCrewId, targetSiteId: 'site-primary' },
      },
      mockCtx.state,
    );
    expect(assignValidation.valid).toBe(true);

    const assignExec = mod.applyAction(mockCtx.state, assignValidation.action!, mockCtx as any);
    expect(assignExec.status).toBe('success');

    // Crew rest action
    const restValidation = mod.validateAction(
      {
        actionFamily: 'P009',
        worldId: 'geology',
        capabilityId: 'crew.rest',
        payload: { crewId: testCrewId, amount: 20 },
      },
      mockCtx.state,
    );
    expect(restValidation.valid).toBe(true);

    const restExec = mod.applyAction(mockCtx.state, restValidation.action!, mockCtx as any);
    expect(restExec.status).toBe('success');
  });
});
