import { describe, expect, it } from 'vitest';
import { SimulationKernel } from '../core/kernel';
import { CORE_WORLD_PLUGINS } from '../worlds';
import { compareSiteRealities, siteChronicle } from '../exploration/forensics';
import { curiosityLeads } from '../exploration/leads';

const plugin = CORE_WORLD_PLUGINS[0];
function start(runId: string) {
  return new SimulationKernel({ runId, name: runId, plugin, seed: 2026 });
}
function command(run: ReturnType<typeof start>, siteId: string, action: string) {
  run.enqueueCommand({ type: 'exploration.action', label: action, payload: { action, siteId } });
  run.flushCurrentTickCommands();
}
function visit(run: ReturnType<typeof start>, siteId: string) {
  for (const action of ['survey', 'discover', 'travel']) command(run, siteId, action);
  while (run.getState().exploration.expedition.journey) run.step();
}
describe('Read-only site histories and real-event curiosity', () => {
  it('withholds casefiles until a visit, then presents actual action deltas and linked environment events', () => {
    const run = start('casefile');
    const state = run.getState(), siteId = state.atlas.sites[0].facts.id;
    const previous = run.getStateHash();
    expect(siteChronicle(state.atlas, state.exploration, siteId, run.getEvents(), run.runId)).toEqual([]);
    expect(run.getStateHash()).toBe(previous);
    visit(run, siteId);
    const beforeCondition = run.getState().exploration.sites[siteId].condition;
    command(run, siteId, 'repair');
    const event = run.getJournal().append(run.runId, run.tick, {
      type: 'site.deterioration', title: 'Recorded infrastructure loss', severity: 'warning',
      description: 'Authoritative event from a monitored installation', sourceSystem: 'environment',
      sourceEntityId: siteId, deltas: [{ metricOrField: 'condition', before: 70, after: 55, unit: '%' }],
    });
    const hash = run.getStateHash();
    const future = run.getJournal().append(run.runId, run.tick + 12, {
      type: 'site.deterioration', title: 'Future-only signal', severity: 'warning',
      description: 'Must not appear before it happens', sourceSystem: 'test', sourceEntityId: siteId,
    });
    const entries = siteChronicle(state.atlas, run.getState().exploration, siteId, run.getEvents(), run.runId);
    expect(entries.some(e => e.causalEventId === future.id)).toBe(false);
    expect(entries.some(e => e.kind === 'ACTION' && e.title === 'repair' &&
      e.changes.some(change => change.field === 'condition' &&
        change.before === beforeCondition && Number(change.after) > Number(change.before)))).toBe(true);
    expect(entries.some(e => e.kind === 'SIMULATION' && e.causalEventId === event.id &&
      e.changes.some(change => change.field === 'condition' && change.after === 55))).toBe(true);
    expect(entries.some(e => e.title === 'exploration.repair')).toBe(false);
    expect(run.getStateHash()).toBe(hash);
  });

  it('reveals real, fresh event leads only for already surveyed sites and the correct run', () => {
    const run = start('event-run');
    const s = run.getState(), siteId = s.atlas.sites[0].facts.id;
    const unknownId = s.atlas.sites[1].facts.id;
    // No unsurveyed-site metadata may escape. Visiting is the knowledge gate
    // before a physical-event title can become part of the user's casefile.
    visit(run, siteId);
    const observedTick = run.tick;
    const first = run.getJournal().append(run.runId, observedTick, {
      type: 'site.deterioration', title: 'Observed power loss', severity: 'warning',
      description: 'Simulation detected declining infrastructure', sourceSystem: 'environment',
      sourceEntityId: siteId,
    });
    run.getJournal().append(run.runId, observedTick, {
      type: 'site.deterioration', title: 'Undiscovered site secret', severity: 'warning',
      description: 'Must stay sealed', sourceSystem: 'environment', sourceEntityId: unknownId,
    });
    const hash = run.getStateHash();
    const leads = curiosityLeads(s.atlas, s.exploration, observedTick, run.getEvents(), run.runId);
    expect(leads.some(l => l.eventId === first.id && l.reason.includes('Observed power loss'))).toBe(true);
    expect(JSON.stringify(leads)).not.toContain('Undiscovered site secret');
    // A known-but-unvisited contact must not disclose a site-specific causal title.
    const surveyed = structuredClone(s.exploration);
    surveyed.sites[siteId].discoveryState = 'SURVEYED';
    surveyed.sites[siteId].firstVisitedTick = null;
    expect(JSON.stringify(curiosityLeads(s.atlas, surveyed, observedTick, run.getEvents(), run.runId)))
      .not.toContain('Observed power loss');

    expect(curiosityLeads(s.atlas, s.exploration, observedTick, run.getEvents(), 'foreign-run').some(l => l.eventId)).toBe(false);
    expect(curiosityLeads(s.atlas, s.exploration, observedTick + 49, run.getEvents(), run.runId)).toEqual([]);
    expect(run.getStateHash()).toBe(hash);
  });

  it('compares corresponding same-seed sites without leaking an unvisited parallel reality', () => {
    const root = start('root');
    const siteId = root.getState().atlas.sites[0].facts.id;
    visit(root, siteId);
    const branch = root.forkBranch({ newRunId: 'fork', newName: 'Other outcome' });
    command(branch, siteId, 'repair');
    const a = root.getState(), b = branch.getState();
    const result = compareSiteRealities(a.atlas, a.exploration, root.seed, b.atlas, b.exploration, branch.seed, siteId);
    expect(result?.targetVisible).toBe(true);
    expect(result!.conditionDifference).toBeGreaterThan(0);
    expect(a.exploration.sites[siteId].condition).not.toBe(b.exploration.sites[siteId].condition);
    const sealed = structuredClone(b.exploration);
    sealed.sites[siteId].discoveryState = 'UNKNOWN';
    sealed.sites[siteId].firstVisitedTick = null;
    sealed.sites[siteId].evidence = [];
    const hidden = compareSiteRealities(a.atlas, a.exploration, root.seed, b.atlas, sealed, branch.seed, siteId);
    expect(hidden).toMatchObject({ targetVisible: false, targetCondition: null, targetHazard: null, targetEvidence: null, resourceChanges: [] });
    expect(compareSiteRealities(a.atlas, a.exploration, root.seed, b.atlas, b.exploration, 999, siteId)).toBeNull();
    expect(root.replayFromStart(root.tick).matchesAuthoritativeHash).toBe(true);
    // A branch starts from an exact fork checkpoint, not from its own genesis.
    // Verify the supported source-of-truth behavior: archive restoration and
    // deterministic continuation of the same lineage after the fork.
    const restored = SimulationKernel.fromRunRecord(branch.exportRunRecord(), plugin);
    expect(restored.getStateHash()).toBe(branch.getStateHash());
    expect(branch.replayFromStart().matchesAuthoritativeHash).toBe(true);
    expect(restored.replayFromStart().matchesAuthoritativeHash).toBe(true);
    branch.step();
    restored.step();
    expect(restored.getStateHash()).toBe(branch.getStateHash());
  });
});
