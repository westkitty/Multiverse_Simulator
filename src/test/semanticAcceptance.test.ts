import {describe,it,expect} from 'vitest';
import {writeFileSync} from 'node:fs';
import {CORE_WORLD_PLUGINS} from '../worlds';
import {SimulationKernel} from '../core/kernel';
import {refugeRoster} from '../exploration/refuge';

describe.runIf(process.env.RUN_SEMANTIC_ACCEPTANCE==='1')('Semantic content acceptance (not name counts)',()=>{
 it('requires supply camp and refuge to have different functional effects, not different transfer amounts',()=>{
  const results=CORE_WORLD_PLUGINS.map(plugin=>{
   const k=new SimulationKernel({runId:'semantic',name:'semantic',plugin,seed:2026}),s=k.getState();
   const effects=[0,3].map(role=>{
    const kernel=new SimulationKernel({runId:`semantic-${role}`,name:'controlled operation fixture',plugin,seed:2026});
    const fixture=kernel.getState(),site=fixture.atlas.sites[role],d=fixture.exploration.sites[site.facts.id];
    fixture.exploration.expedition.regionId=site.facts.regionId;d.discoveryState='VISITED';d.firstVisitedTick=0;d.condition=50;
    // Explicit fixture placement, not an expedition claim. Exercise the production command bus.
    const actor=(fixture.atlasActors??fixture.actors)[0];actor.energy=10;
    if(fixture.atlasActors)actor.regionId=site.facts.regionId;
    else actor.region=fixture.regions.findIndex((r:any)=>r.id===site.facts.regionId);
    const before=structuredClone(fixture.exploration),resources={...d.resources};
    const energy=refugeRoster(fixture).reduce((n,a)=>n+a.energy,0);
    kernel.enqueueCommand({type:role===3?'expedition.rest':'exploration.action',label:'facility operation',payload:role===3?{siteId:site.facts.id}:{action:'operate',siteId:site.facts.id}});
    kernel.flushCurrentTickCommands();
    const result=fixture.exploration,delta=result.sites[site.facts.id];
    // Normalize quantity; an energy effect must exist in real actors, not an output counter.
    const signature={supplies:Math.sign(result.expedition.supplies-before.expedition.supplies),fuel:Math.sign(result.expedition.fuel-before.expedition.fuel),condition:Math.sign(delta.condition-50),hazard:Math.sign(delta.hazard-before.sites[site.facts.id].hazard),resources:Object.fromEntries(Object.keys(resources).sort().map(key=>[key,Math.sign(delta.resources[key]-resources[key])])),cargo:result.expedition.cargo,actorEnergy:Math.sign(refugeRoster(fixture).reduce((n,a)=>n+a.energy,0)-energy)};
    return {role,name:site.facts.name,signature};
   });
   return {world:plugin.id,status:JSON.stringify(effects[0].signature)===JSON.stringify(effects[1].signature)?'FAIL':'PASS',effects,historyTemplates:new Set(s.atlas.sites.map((site:any)=>site.facts.origin)).size,chains:s.atlas.chains.length,sites:s.atlas.sites.length};
  });
  writeFileSync('docs/acceptance/semantic-results.json',JSON.stringify({schemaVersion:1,criterion:'Production camp operate and refuge rest commands must have different functional effects; legacy refuge operate is retained for replay, not presented as the current service. This is a necessary check, not sufficient certification of semantic breadth.',results},null,2)+'\n');
  expect(results.filter(r=>r.status==='FAIL').map(r=>r.world)).toEqual([]);
 });
});
