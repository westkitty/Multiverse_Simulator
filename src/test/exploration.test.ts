import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { atlasSchema, ExplorationAtlas, ExplorationState, SiteDefinition } from '../exploration/contracts';
import { populateAtlas, PlacementSocket } from '../exploration/population';
import { advanceExploration, applyExplorationCommand, createExplorationState, planRoute, presentSite, restoreExplorationState } from '../exploration/engine';
import { defineWorldPlugin, verifyWorldPluginContract } from '../core/pdk';
import { SimulationKernel } from '../core/kernel';
import { createPortableArchiveZip, inspectAndUnpackArchiveZip } from '../persistence/archive';

// Test-only content: deliberately NOT registered as a primary world or counted toward 540 POIs.
const template: SiteDefinition = {
  facts: { id: 'template', worldId: 'fixture', regionId: 'a', archetypeId: 'relay', seed: 1,
    coordinates: [0, 0, 0], spatialBounds: { radius: 2, unit: 'm' }, name: 'Lost Relay',
    description: 'Corroded switching equipment.', origin: 'Abandoned after a flood', formationEpoch: 'Year 12',
    association: 'Survey team', simulationDependencies: ['power'], extensions: { role: 'relay' }, schemaVersion: 1 },
  initial: { condition: 25, hazard: 10, inhabitants: [], resources: { parts: 2 } },
  availableInteractions: ['survey', 'discover', 'investigate', 'repair', 'recover', 'resolve'],
  evidence: [{ id: 'damage', label: 'Observe corrosion', source: 'condition', comparison: 'atMost', threshold: 50 }],
  renderPresentation: { glyph: 'relay', silhouette: 'mast' },
  accessibilityPresentation: { detectedLabel: 'Unidentified structure', surveyedDescription: 'Metallic structure on the ridge' },
};
const sockets: PlacementSocket[] = ['a', 'b', 'c'].map((regionId, index) => ({ id: regionId, regionId,
  coordinates: [index * 20, -index * 10, 0], clearance: 3, tags: ['ridge', 'infrastructure'] }));
function atlas(): ExplorationAtlas {
  return populateAtlas({ schemaVersion: 1, worldId: 'fixture',
    regions: ['a', 'b', 'c'].map(id => ({ id, label: id, hazard: 10 })),
    routes: [
      { id: 'ab', from: 'a', to: 'b', travelTicks: 3, fuel: 2, blocked: false },
      { id: 'bc', from: 'b', to: 'c', travelTicks: 4, fuel: 3, blocked: false },
      { id: 'ac', from: 'a', to: 'c', travelTicks: 2, fuel: 20, blocked: false },
    ],
    chains: [{ id: 'relay-history', steps: ['a', 'b', 'c'].map(id => ({ siteId: `fixture:${id}`, evidenceId: 'damage' })) }],
  }, 42, sockets, [{ requiredTags: ['ridge'], definition: template }]);
}
function command(a: ExplorationAtlas, s: ExplorationState, action: Parameters<typeof applyExplorationCommand>[2]['action'], siteId = 'fixture:a', branchId = 'main') {
  return applyExplorationCommand(a, s, { action, siteId }, { tick: s.lastTick, branchId }).state;
}
function visit(a: ExplorationAtlas, s: ExplorationState, siteId = 'fixture:a') {
  for (const action of ['detect', 'survey', 'discover', 'travel'] as const) s = command(a, s, action, siteId);
  return advanceExploration(a, s, { tick: s.expedition.journey!.arrivalTick, branchId: 'main' }).state;
}

describe('Phase 1 exploration contracts and state machine', () => {
  it('generates stable owned facts regardless of socket/region order, with seed-specific identities', () => {
    const a = atlas();
    const reordered = populateAtlas({ ...a, regions: [...a.regions].reverse(), routes: [...a.routes].reverse() }, 42, [...sockets].reverse(), [{ requiredTags: ['ridge'], definition: template }]);
    expect(reordered).toEqual(a);
    for (const seed of [1, 2, 30, 2026]) {
      const generated = populateAtlas(a, seed, sockets, [{ requiredTags: ['ridge'], definition: template }]);
      expect(generated.sites).toHaveLength(3);
      expect(new Set(generated.sites.map(s => s.facts.id)).size).toBe(3);
      expect(generated.sites[0].facts.seed).not.toBe(a.sites[0].facts.seed);
    }
    a.sites[0].initial.resources.parts = 999;
    expect(template.initial.resources.parts).toBe(2);
  });

  it('rejects incoherent geometry, environmental mismatches, duplicate IDs and disconnected graphs', () => {
    const base = atlas();
    expect(() => populateAtlas(base, 42, sockets, [{ requiredTags: ['aquifer'], definition: template }])).toThrow(/compatible/);
    expect(() => populateAtlas(base, 42, [sockets[0], { ...sockets[1], coordinates: [0, 0, 0] }], [{ requiredTags: [], definition: template }])).toThrow(/Overlapping/);
    expect(() => populateAtlas(base, 42, [sockets[0], sockets[0]], [])).toThrow(/Duplicate/);
    expect(() => atlasSchema.parse({ ...base, routes: [] })).toThrow(/Disconnected/);
    expect(() => atlasSchema.parse({ ...base, chains: [{ id: 'bad', steps: Array(3).fill({ siteId: 'missing', evidenceId: 'x' }) }] })).toThrow();
  });

  it('does not expose undiscovered names or generated history through presentation', () => {
    const a = atlas(); let s = createExplorationState(a, 'a');
    expect(presentSite(a, s, 'fixture:a')).toBeNull();
    s = command(a, s, 'detect');
    expect(JSON.stringify(presentSite(a, s, 'fixture:a'))).not.toMatch(/Lost Relay|flood|Year 12/);
    s = command(a, s, 'survey');
    expect(presentSite(a, s, 'fixture:a')!.condition).toBe(25);
    expect(presentSite(a, s, 'fixture:a')!.history).toBeNull();
  });

  it('validates every transition and rejects actions atomically without spending resources', () => {
    const a = atlas(), s = createExplorationState(a, 'a'), saved = JSON.stringify(s);
    for (const action of ['survey', 'discover', 'travel', 'investigate', 'repair', 'recover', 'resolve'] as const) {
      expect(() => command(a, s, action)).toThrow();
      expect(JSON.stringify(s)).toBe(saved);
    }
    let visited = visit(a, s);
    visited.expedition.supplies = 0;
    const before = JSON.stringify(visited);
    expect(() => applyExplorationCommand(a, visited, { action: 'recover', siteId: 'fixture:a', resourceId: 'toString' }, { tick: visited.lastTick, branchId: 'main' })).toThrow(/unavailable/);
    expect(() => command(a, visited, 'investigate')).toThrow(/supplies/);
    expect(JSON.stringify(visited)).toBe(before);
    expect(() => applyExplorationCommand(a, visited, { action: 'repair', siteId: 'fixture:a' }, { tick: -1, branchId: 'main' })).toThrow();
  });

  it('charges fuel, uses feasible alternative routes, and arrives only on deterministic ticks', () => {
    const a = atlas();
    expect(planRoute(a, 'a', 'c').routeIds).toEqual(['ac']);
    expect(planRoute(a, 'a', 'c', 70, 5).routeIds).toEqual(['ab', 'bc']);
    a.routes.find(r => r.id === 'ac')!.blocked = true;
    let s = createExplorationState(a, 'a');
    for (const action of ['detect', 'survey', 'discover', 'travel'] as const) s = command(a, s, action, 'fixture:b');
    expect(s.expedition.fuel).toBe(98);
    expect(s.expedition.regionId).toBe('a');
    expect(() => command(a, s, 'repair', 'fixture:b')).toThrow(/transit/);
    s = advanceExploration(a, s, { tick: 2, branchId: 'main' }).state;
    expect(s.expedition.regionId).toBe('a');
    const restored = restoreExplorationState(a, JSON.parse(JSON.stringify(s)));
    const at3 = advanceExploration(a, restored, { tick: 3, branchId: 'main' });
    expect(at3.state.expedition.regionId).toBe('b');
    expect(at3.state.sites['fixture:b'].firstVisitedTick).toBe(3);
    expect(at3.events[0].action).toBe('arrive');
    a.regions.find(r => r.id === 'b')!.hazard = 95;
    expect(() => planRoute(a, 'a', 'c')).toThrow(/No feasible route/);
  });

  it('requires multi-location evidence in order and captures observed values, not scripted conclusions', () => {
    const a = atlas(); let s = createExplorationState(a, 'a');
    s = visit(a, s, 'fixture:b');
    expect(() => command(a, s, 'investigate', 'fixture:b')).toThrow(/prior evidence/);
    s = visit(a, s, 'fixture:a');
    for (const id of ['a', 'b', 'c']) {
      if (id === 'b') {
        s = command(a, s, 'travel', 'fixture:b');
        s = advanceExploration(a, s, { tick: s.expedition.journey!.arrivalTick, branchId: 'main' }).state;
      }
      if (id === 'c') s = visit(a, s, 'fixture:c');
      s = command(a, s, 'investigate', `fixture:${id}`);
      expect(s.sites[`fixture:${id}`].evidence[0]).toMatchObject({ classification: 'OBSERVED', value: 25, unit: 'percent' });
      s = command(a, s, 'resolve', `fixture:${id}`);
    }
    expect(Object.values(s.sites).every(site => site.discoveryState === 'RESOLVED')).toBe(true);
    expect(() => command(a, s, 'resolve', 'fixture:c')).toThrow();
  });

  it('repairs and resource recovery alter owned state, preserve historical evidence and isolate forks', () => {
    const a = atlas(); let parent = visit(a, createExplorationState(a, 'a'));
    parent = command(a, parent, 'investigate');
    const fork = command(a, restoreExplorationState(a, parent), 'repair', 'fixture:a', 'alternative');
    expect(fork.sites['fixture:a'].condition).toBe(50);
    expect(parent.sites['fixture:a'].condition).toBe(25);
    expect(fork.journal.at(-1)!.branchId).toBe('alternative');
    expect(fork.sites['fixture:a'].evidence[0].value).toBe(25);
    const recovered = applyExplorationCommand(a, fork, { action: 'recover', siteId: 'fixture:a', resourceId: 'parts' }, { tick: fork.lastTick, branchId: 'alternative' }).state;
    expect(recovered.sites['fixture:a'].resources.parts).toBe(1);
    expect(recovered.expedition.cargo.parts).toBe(1);
    expect(recovered.expedition.supplies).toBe(fork.expedition.supplies);
    expect(parent.expedition.cargo).toEqual({});
    recovered.blockedRoutes.ab = true;
    recovered.blockedRoutes.ac = true;
    expect(() => planRoute(a, 'a', 'b', 70, 100, recovered)).toThrow(/No feasible route/);
    expect(planRoute(a, 'a', 'b', 70, 100, parent).routeIds).toEqual(['ab']);
  });

  it('rejects future schemas, corrupt saves and forged references; bounds histories without losing evidence', () => {
    const a = atlas(); let s = command(a, visit(a, createExplorationState(a, 'a')), 'investigate');
    expect(() => restoreExplorationState(a, { ...s, schemaVersion: 2 })).toThrow();
    expect(() => restoreExplorationState(a, { ...s, sites: {} })).toThrow();
    expect(() => restoreExplorationState(a, { ...s, expedition: { ...s.expedition, fuel: NaN } })).toThrow();
    const corrupt = structuredClone(s); corrupt.sites['fixture:a'].evidence[0].evidenceId = 'fake';
    expect(() => restoreExplorationState(a, corrupt)).toThrow(/evidence/);
    for (let i = 0; i < 150; i++) {
      s = command(a, s, 'travel');
      s = advanceExploration(a, s, { tick: s.lastTick + 1, branchId: 'main' }).state;
    }
    expect(s.journal).toHaveLength(128);
    expect(s.sites['fixture:a'].eventReferences).toHaveLength(128);
    expect(s.actionCounts.arrive).toBe(151);
    expect(s.sites['fixture:a'].evidence).toHaveLength(1);
    expect(restoreExplorationState(a, JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});

const testAtlas = atlas();
const fixturePlugin = defineWorldPlugin<Record<string, never>, ExplorationState>({
  id: 'exploration-test-fixture', name: 'Exploration contract fixture', subtitle: 'Test only', version: '1.0.0', schemaVersion: 1,
  accentColor: '#ffffff', description: 'Not a production world', physicalModelDocumentation: [], simplifiedMechanicsNote: 'Test harness',
  configSchema: z.object({}).strict(), defaultConfig: {}, scenarios: [], quickInterventions: [], metricDefinitions: [],
  initializeWorld: () => createExplorationState(testAtlas, 'a'),
  systems: [{ id: 'exploration', name: 'Arrival', order: 1, step(ctx) {
    const result = advanceExploration(testAtlas, ctx.state, { tick: ctx.tick, branchId: ctx.runId });
    Object.assign(ctx.state, result.state);
    for (const event of result.events) ctx.emitEvent({ type: `exploration.${event.action}`, severity: 'info', title: event.action,
      description: event.after, sourceSystem: 'exploration', affectedEntityIds: [event.siteId], payload: event,
      causalLinkType: 'direct', causalExplanation: 'Committed expedition reached its arrival tick' });
  } }],
  applyCommand(state, cmd, ctx) {
    const result = applyExplorationCommand(testAtlas, state, { action: cmd.payload.action as 'detect', siteId: 'fixture:a' }, { tick: ctx.tick, branchId: ctx.runId });
    Object.assign(state, result.state);
    for (const event of result.events) ctx.emitEvent({ type: `exploration.${event.action}`, severity: 'info', title: event.action,
      description: event.after, sourceSystem: 'exploration', affectedEntityIds: [event.siteId], payload: event,
      causalLinkType: 'direct', causalExplanation: 'Validated player exploration command' });
  },
  restoreState: raw => restoreExplorationState(testAtlas, raw),
  extractMetrics: () => ({}), inspectEntities: () => [],
  extractRenderFrame: (_s, _c, runId, tick) => ({ worldId: 'exploration-test-fixture', runId, tick, ambientStatus: 'nominal', entities: [], zones: [], connections: [], hudSummary: {} }),
});

describe('Exploration embedded in the existing PDK/kernel (unregistered fixture)', () => {
  it('passes PDK replay/continuation/isolation and portable archive continuation', () => {
    expect(verifyWorldPluginContract(fixturePlugin).passed).toBe(true);
    const kernel = new SimulationKernel({ runId: 'exploration-main', name: 'Exploration integration', plugin: fixturePlugin, seed: 42 });
    for (const action of ['detect', 'survey', 'discover', 'travel']) {
      kernel.enqueueCommand({ type: 'explore', label: action, payload: { action } });
      kernel.flushCurrentTickCommands();
    }
    kernel.stepMany(3);
    kernel.enqueueCommand({ type: 'explore', label: 'investigate', payload: { action: 'investigate' } });
    kernel.flushCurrentTickCommands();
    expect(kernel.getState().sites['fixture:a'].discoveryState).toBe('INVESTIGATED');
    expect(kernel.getEvents().some(e => e.type === 'exploration.investigate')).toBe(true);
    expect(kernel.getEvents().some(e => e.type === 'exploration.arrive')).toBe(true);
    expect(kernel.replayFromStart(kernel.tick).matchesAuthoritativeHash).toBe(true);
    const branch = kernel.forkBranch({ newRunId: 'repaired-branch', newName: 'Repair counterfactual',
      initialCommand: { type: 'explore', label: 'repair', payload: { action: 'repair' } } });
    branch.flushCurrentTickCommands();
    expect(branch.getState().sites['fixture:a'].condition).toBe(50);
    expect(kernel.getState().sites['fixture:a'].condition).toBe(25);
    expect(branch.getState().journal.at(-1)!.branchId).toBe('repaired-branch');
    const unpacked = inspectAndUnpackArchiveZip(createPortableArchiveZip(kernel.exportRunRecord()));
    expect(unpacked.valid).toBe(true);
    const restored = SimulationKernel.fromRunRecord(unpacked.record!, fixturePlugin);
    kernel.stepMany(4); restored.stepMany(4);
    expect(restored.getStateHash()).toBe(kernel.getStateHash());
  });
});
