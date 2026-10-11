import { describe, expect, it } from 'vitest';
import { CORE_WORLD_PLUGINS, LEGACY_WORLD_PLUGINS, ORIGINAL_WORLD_PLUGINS } from '../worlds';
import { SimulationKernel } from '../core/kernel';
import { planRoute } from '../exploration/engine';
import { createPortableArchiveZip, inspectAndUnpackArchiveZip } from '../persistence/archive';

const regionTargets=[144,54,27,144,144,54,54,54,144];
describe('Native atlas expansion and backward compatibility',()=>{
  it('contains 540 owned sites, 45 linked chains and 15 signature destinations',()=>{
    let sites=0,chains=0,signatures=0;
    for(const plugin of CORE_WORLD_PLUGINS){
      const k=new SimulationKernel({runId:`inventory-${plugin.id}`,name:'inventory',plugin,seed:2026});
      const s=k.getState();sites+=s.atlas.sites.length;chains+=s.atlas.chains.length;
      signatures+=s.atlas.sites.filter((p:any)=>p.facts.extensions.signature).length;
      expect(new Set(s.atlas.sites.map((p:any)=>p.facts.id)).size).toBe(36);
      for(const site of s.atlas.sites){expect(s.exploration.sites[site.facts.id]).toBeDefined();expect(site.availableInteractions.length).toBeGreaterThan(0);}
    }
    expect(sites).toBe(540);expect(chains).toBe(45);expect(signatures).toBe(15);
  });
  ORIGINAL_WORLD_PLUGINS.forEach((plugin,index)=>{
    it(`${plugin.id}: expanded native region graph, active outer territory, old archive continuation`,()=>{
      const k=new SimulationKernel({runId:'expanded',name:'expanded',plugin,seed:2026});const s=k.getState();
      expect(s.atlas.regions.length).toBe(regionTargets[index]);
      for(const r of s.atlas.regions)expect(planRoute(s.atlas,s.atlas.regions[0].id,r.id,100).region).toBe(r.id);
      if(plugin.id==='station')expect(s.rooms.reduce((n:number,r:any)=>n+r.volumeM3,0)).toBe(11430);
      if(plugin.id==='civilization')expect(s.settlements.length+s.frontierSites.length).toBe(45);
      if(plugin.id==='celestial'){expect(s.systems.length).toBe(9);expect(s.bodies.length).toBe(54);}
      if(plugin.id==='industrial')expect(s.routes.length).toBeGreaterThanOrEqual(72);
      const before=k.getStateHash();k.stepMany(8);expect(k.getStateHash()).not.toBe(before);
      expect(k.getState().regions.at(-1).readings).not.toEqual({});
      const checkpoint=k.createCheckpoint('expansion-save'),checkpointHash=k.getStateHash();k.stepMany(3);k.restoreCheckpoint(checkpoint.id);expect(k.getStateHash()).toBe(checkpointHash);
      const baseline=new SimulationKernel({runId:'legacy',name:'legacy',plugin:LEGACY_WORLD_PLUGINS[index],seed:2026});baseline.stepMany(5);
      const zip=createPortableArchiveZip(baseline.exportRunRecord());const unpacked=inspectAndUnpackArchiveZip(zip);expect(unpacked.valid).toBe(true);
      const restored=SimulationKernel.fromRunRecord(unpacked.record!,plugin);expect(restored.getStateHash()).toBe(baseline.getStateHash());
      baseline.stepMany(5);restored.stepMany(5);expect(restored.getStateHash()).toBe(baseline.getStateHash());
      expect(restored.getState().atlas).toBeUndefined();expect(restored.replayFromStart(restored.tick).matchesAuthoritativeHash).toBe(true);
    });
  });
});
