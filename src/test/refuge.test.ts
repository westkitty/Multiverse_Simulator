import {describe,it,expect} from 'vitest';
import {SimulationKernel} from '../core/kernel';
import {CORE_WORLD_PLUGINS} from '../worlds';
import {planRefugeRest,refugeRoster,restAtRefuge} from '../exploration/refuge';
import {createPortableArchiveZip,inspectAndUnpackArchiveZip} from '../persistence/archive';

describe('Refuge service is a real, paid local actor intervention',()=>{
 for(const plugin of CORE_WORLD_PLUGINS)it(`${plugin.id}: paid actor energy, no expedition gift, unchanged remote teams, archive continuation`,()=>{
  const k=new SimulationKernel({runId:'refuge',name:'controlled local fixture',plugin,seed:2026}),s=k.getState();
  const site=s.atlas.sites[3],d=s.exploration.sites[site.facts.id];
  s.exploration.expedition.regionId=site.facts.regionId;d.firstVisitedTick=0;d.discoveryState='VISITED';d.condition=50;
  const actor=(s.atlasActors??s.actors)[0];actor.energy=10;
  if(s.atlasActors)actor.regionId=site.facts.regionId;else actor.region=s.regions.findIndex((r:any)=>r.id===site.facts.regionId);
  const before=structuredClone(s), hash=k.getStateHash(),plan=planRefugeRest(s,site.facts.id);
  expect(k.getStateHash()).toBe(hash);
  k.enqueueCommand({type:'expedition.rest',label:'Rest',payload:{siteId:site.facts.id}});k.flushCurrentTickCommands();
  expect(s.exploration.expedition).toEqual(before.exploration.expedition);
  const gain=refugeRoster(s).reduce((n,a)=>n+a.energy,0)-refugeRoster(before).reduce((n,a)=>n+a.energy,0);
  expect(gain).toBeCloseTo(plan.restored,6);expect(gain).toBeGreaterThan(0);
  expect(d.resources.supplies).toBeCloseTo(before.exploration.sites[site.facts.id].resources.supplies-gain/20,6);
  for(const remote of refugeRoster(before).filter(a=>a.regionId!==site.facts.regionId))expect(refugeRoster(s).find(a=>a.id===remote.id)).toEqual(remote);
  const archive=inspectAndUnpackArchiveZip(createPortableArchiveZip(k.exportRunRecord()));expect(archive.valid).toBe(true);
  const restored=SimulationKernel.fromRunRecord(archive.record!,plugin);expect(restored.getStateHash()).toBe(k.getStateHash());
  for(let i=0;i<8;i++){k.step();restored.step();}expect(restored.getStateHash()).toBe(k.getStateHash());
 });
 it('rejects empty/full/depleted/remote/in-transit refuges without state changes',()=>{
  const k=new SimulationKernel({runId:'reject',name:'fixture',plugin:CORE_WORLD_PLUGINS[9],seed:1});
  const s=k.getState(),site=s.atlas.sites[3],id=site.facts.id;
  s.exploration.expedition.regionId=site.facts.regionId;s.exploration.sites[id].firstVisitedTick=0;
  const region=s.regions.findIndex((r:any)=>r.id===site.facts.regionId);
  const actor=s.actors[0];actor.region=region;actor.energy=50;
  for(const mutate of [
   (x:any)=>{for(const a of x.actors)a.energy=100;},
   (x:any)=>{x.actors.push({...x.actors[0]});},
   (x:any)=>{x.actors[1].id=x.actors[0].id;},
   (x:any)=>{x.atlas.sites[3].availableInteractions=[];},
   (x:any)=>{x.exploration.sites[id].resources.supplies=0;},
   (x:any)=>{x.exploration.sites[id].condition=29;},
   (x:any)=>{x.exploration.expedition.regionId='elsewhere';},
   (x:any)=>{x.exploration.expedition.journey={arrivalTick:10};},
   (x:any)=>{for(const a of x.actors)a.region=(region+1)%x.regions.length;},
  ]){const copy=structuredClone(s);mutate(copy);const before=JSON.stringify(copy);expect(()=>restAtRefuge(copy,id)).toThrow();expect(JSON.stringify(copy)).toBe(before);}
 });
 it('a real default-stock journey can rest teams and replay from genesis',()=>{
  const k=new SimulationKernel({runId:'journey',name:'journey',plugin:CORE_WORLD_PLUGINS[9],seed:2026});
  const siteId=k.getState().atlas.sites[3].facts.id;
  for(const action of ['detect','survey','discover','travel']){k.enqueueCommand({type:'exploration.action',label:action,payload:{action,siteId}});k.flushCurrentTickCommands();}
  while(k.getState().exploration.expedition.journey)k.step();
  const plan=planRefugeRest(k.getState(),siteId);expect(plan.restored).toBeGreaterThan(0);
  k.enqueueCommand({type:'expedition.rest',label:'Rest local teams',payload:{siteId}});k.flushCurrentTickCommands();
  for(let i=0;i<10;i++)k.step();expect(k.replayFromStart(k.tick).matchesAuthoritativeHash).toBe(true);
 });
});
