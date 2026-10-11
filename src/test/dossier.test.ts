import { describe, expect, it } from 'vitest';
import { SimulationKernel } from '../core/kernel';
import { CORE_WORLD_PLUGINS } from '../worlds';
import { resupplyAvailability, siteDossier, suggestedAction } from '../exploration/dossier';

describe('Read-only field dossiers', () => {
  for (const plugin of CORE_WORLD_PLUGINS) it(`${plugin.id}: hidden history, frozen samples, live differences, owned archive continuation`, () => {
    const k = new SimulationKernel({ runId:'dossier', name:'dossier', plugin, seed:2026 });
    const site = k.getState().atlas.sites[0], siteId = site.facts.id;
    const project = () => siteDossier(k.getState().atlas,k.getState().exploration,siteId);
    const perform = (action:string) => { k.enqueueCommand({type:'exploration.action',label:action,payload:{action,siteId}}); k.flushCurrentTickCommands(); };
    const before = k.getStateHash();
    expect(project().readings).toEqual([]);
    expect(project().view?.history).toBeNull();
    expect(project().chains[0].steps[1].label).toBe('Unlocated record');
    expect(JSON.stringify(project())).not.toContain(site.facts.origin);
    expect(resupplyAvailability(k.getState().atlas,k.getState().exploration)).toMatch(/Visit/);
    expect(k.getStateHash()).toBe(before);
    expect(suggestedAction(k.getState().atlas,k.getState().exploration,siteId).action).toBe('survey');
    perform('survey'); perform('discover'); perform('travel');
    expect(suggestedAction(k.getState().atlas,k.getState().exploration,siteId).action).toBeNull();
    expect(resupplyAvailability(k.getState().atlas,k.getState().exploration)).toMatch(/transit/);
    k.step();
    expect(project().visited).toBe(true);
    expect(project().view!.history!.classification).toBe('GENERATED_HISTORY');
    expect(project().readings.every(r=>r.sample===null && r.difference===null)).toBe(true);
    perform('investigate');
    const sample = project().readings.find(r=>r.sample)!;
    expect(sample.sample).not.toBeNull();
    expect(sample.difference).toBe(0);
    expect(resupplyAvailability(k.getState().atlas,k.getState().exploration)).toBeNull();
    for(let i=0;i<4;i++)k.step();
    const live = project().readings.find(r=>r.field===sample.field)!;
    expect(live.sample).toEqual(sample.sample);
    // Rounded ocean pH and the first stellar body's flux can legitimately remain constant.
    // Never manufacture motion merely to make the comparison look alive.
    if (!['ocean','celestial'].includes(plugin.id)) expect(live.current).not.toBe(sample.current);
    expect(live.difference).toBe(live.current - sample.sample!.value);
    const after = k.getStateHash(); project();
    expect(k.getStateHash()).toBe(after);
    const restored = SimulationKernel.fromRunRecord(k.exportRunRecord(),plugin);
    expect(siteDossier(restored.getState().atlas,restored.getState().exploration,siteId)).toEqual(project());
    expect(k.replayFromStart(k.tick).matchesAuthoritativeHash).toBe(true);
  });
  it('does not confuse a recorded chain measurement with restored/resolved infrastructure',()=>{
    const k=new SimulationKernel({runId:'chain',name:'chain',plugin:CORE_WORLD_PLUGINS[9],seed:2026});
    const s=k.getState(), site=s.atlas.sites[2];
    // Local fixture tests the distinction between evidence acquisition and resolution.
    const delta=s.exploration.sites[site.facts.id];
    delta.discoveryState='INVESTIGATED';delta.firstVisitedTick=0;
    delta.evidence=[{evidenceId:'field-sample',value:20,unit:'%',classification:'OBSERVED',tick:0,branchId:'chain'}];
    const d=siteDossier(s.atlas,s.exploration,site.facts.id);
    expect(d.chains[0].steps[2].collected).toBe(true);
    expect(d.chains[0].steps[2].resolved).toBe(false);
    expect(d.missingEvidence.map(e=>e.id)).toContain('restored-system');
    expect(d.prerequisite!.siteId).toBe(s.atlas.sites[0].facts.id);
  });
});
