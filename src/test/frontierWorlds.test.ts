import { describe, expect, it } from 'vitest';
import { CORE_WORLD_PLUGINS, ORIGINAL_WORLD_PLUGINS } from '../worlds';
import { FRONTIER_WORLD_PLUGINS } from '../worlds/frontiers/frontierPlugin';
import { FRONTIER_DOMAINS } from '../worlds/frontiers/domains';
import { SimulationKernel } from '../core/kernel';
import { verifyWorldPluginContract } from '../core/pdk';
import { createPortableArchiveZip, inspectAndUnpackArchiveZip } from '../persistence/archive';
import { applyExplorationCommand, planRoute } from '../exploration/engine';

describe('Fifteen-world registry and six functional frontier worlds', () => {
  it('preserves the original nine IDs and adds six distinct PDK plugins', () => {
    expect(CORE_WORLD_PLUGINS).toHaveLength(15);
    expect(new Set(CORE_WORLD_PLUGINS.map(p => p.id)).size).toBe(15);
    expect(CORE_WORLD_PLUGINS.slice(0,9).map(p => p.id)).toEqual(ORIGINAL_WORLD_PLUGINS.map(p => p.id));
    expect(new Set(FRONTIER_DOMAINS.map(d => d.step.toString())).size).toBe(6);
  });
  for (const plugin of FRONTIER_WORLD_PLUGINS) {
    it(`${plugin.id}: contract, actual scale, content, autonomous progress and portable continuation`, () => {
      const proof = verifyWorldPluginContract(plugin, 8, 31337);
      expect(proof.passed, proof.details.join('\n')).toBe(true);
      const baseline = new SimulationKernel({ runId:'baseline', name:'baseline', plugin, seed:4242, config:{ ...plugin.defaultConfig, scale:1 } });
      const expanded = new SimulationKernel({ runId:'expanded', name:'expanded', plugin, seed:4242 });
      const s = expanded.getState(), b = baseline.getState();
      expect(s.regions.length).toBe(b.regions.length * 3);
      expect(s.atlas.sites.length).toBe(b.atlas.sites.length * 3);
      expect(s.atlas.sites.length).toBeGreaterThanOrEqual(36);
      expect(new Set(s.atlas.sites.map(x => x.facts.archetypeId)).size).toBe(12);
      expect(new Set(s.actors.map(a => a.role)).size).toBe(6);
      expect(s.atlas.chains).toHaveLength(3);
      expect(s.atlas.sites.filter(x => x.facts.extensions.signature)).toHaveLength(1);
      for (const region of s.regions) expect(planRoute(s.atlas,s.regions[0].id,region.id).region).toBe(region.id);
      const readings = structuredClone(s.regions.map(r => r.readings));
      const health = s.exploration.sites[s.atlas.sites[0].facts.id].condition;
      expanded.stepMany(20); baseline.stepMany(20);
      expect(expanded.getState().actors.reduce((n,a) => n+a.completed,0)).toBeGreaterThan(0);
      expect(expanded.getState().regions.every((r,i) => JSON.stringify(r.readings) !== JSON.stringify(readings[i]))).toBe(true);
      expect(expanded.getState().exploration.sites[s.atlas.sites[0].facts.id].condition).not.toBe(health);
      const zip = createPortableArchiveZip(expanded.exportRunRecord()), unpacked = inspectAndUnpackArchiveZip(zip);
      expect(unpacked.valid).toBe(true);
      const restored = SimulationKernel.fromRunRecord(unpacked.record!,plugin);
      expanded.stepMany(4); restored.stepMany(4);
      expect(restored.getStateHash()).toBe(expanded.getStateHash());
      expect(expanded.replayFromStart(expanded.tick).matchesAuthoritativeHash).toBe(true);
      const twin = new SimulationKernel({ runId:'twin', name:'twin', plugin, seed:4242 }); twin.stepMany(24);
      expect(twin.getStateHash()).toBe(expanded.getStateHash());
    }, 20000);
    it(`${plugin.id}: every quick intervention has a domain consequence and replays`,()=>{
      for(const intervention of plugin.quickInterventions){
        const k=new SimulationKernel({runId:'intervention',name:'intervention',plugin,seed:2026});
        const control=new SimulationKernel({runId:'control',name:'control',plugin,seed:2026});
        for(let t=0;t<3;t++){k.step();control.step();}
        k.enqueueCommand({type:intervention.commandType,label:intervention.label,payload:intervention.defaultPayload});k.flushCurrentTickCommands();
        for(let t=0;t<6;t++){k.step();control.step();}
        expect(k.getState().regions.map(r=>r.readings)).not.toEqual(control.getState().regions.map(r=>r.readings));
        expect(k.replayFromStart(k.tick).matchesAuthoritativeHash).toBe(true);
      }
    });
    it(`${plugin.id}: expedition actions, repair consequences and independent branch history`, () => {
      const k = new SimulationKernel({ runId:'explorer',name:'expedition',plugin,seed:123 });
      const siteId = k.getState().atlas.sites[0].facts.id;
      for (const action of ['survey','discover','travel']) {
        k.enqueueCommand({ type:'exploration.action', label:action, payload:{ action,siteId } }); k.flushCurrentTickCommands();
      }
      k.stepMany(2);
      k.enqueueCommand({ type:'exploration.action',label:'investigate',payload:{action:'investigate',siteId} }); k.flushCurrentTickCommands();
      expect(k.getState().exploration.sites[siteId].evidence.length).toBeGreaterThan(0);
      const original = k.getState().exploration.sites[siteId].condition;
      const branch = k.forkBranch({ newRunId:'repair',newName:'repaired',initialCommand:{type:'exploration.action',label:'repair',payload:{action:'repair',siteId}} });
      branch.flushCurrentTickCommands();
      expect(branch.getState().exploration.sites[siteId].condition).toBeGreaterThan(original);
      expect(k.getState().exploration.sites[siteId].condition).toBe(original);
      const before = JSON.stringify(k.getState());
      expect(() => applyExplorationCommand(k.getState().atlas,k.getState().exploration,{action:'survey',siteId},{tick:k.tick,branchId:k.runId})).toThrow();
      expect(JSON.stringify(k.getState())).toBe(before);
      k.stepMany(5); branch.stepMany(5);
      expect(branch.getState().regions[0].readings).not.toEqual(k.getState().regions[0].readings);
      expect(k.replayFromStart(k.tick).matchesAuthoritativeHash).toBe(true);
    });
  }
});
