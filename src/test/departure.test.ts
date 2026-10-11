import {expect,it} from 'vitest';
import {SimulationKernel} from '../core/kernel';
import {CORE_WORLD_PLUGINS} from '../worlds';
import {departureBriefing,nearbyInvestigations} from '../exploration/departure';
import {applyExplorationCommand} from '../exploration/engine';
for(const plugin of CORE_WORLD_PLUGINS)it(`${plugin.id}: route projection hides unknown names and agrees with actual departure`,()=>{
 const k=new SimulationKernel({runId:'routes',name:'routes',plugin,seed:2026}),s=k.getState(),id=s.atlas.sites[0].facts.id;
 const before=k.getStateHash();expect(nearbyInvestigations(s.atlas,s.exploration,0)).toEqual([]);
 expect(departureBriefing(s.atlas,s.exploration,id,0).ready).toBe(false);expect(k.getStateHash()).toBe(before);
 for(const action of ['survey','discover']){k.enqueueCommand({type:'exploration.action',label:action,payload:{action,siteId:id}});k.flushCurrentTickCommands();}
 const ready=departureBriefing(s.atlas,s.exploration,id,k.tick);expect(ready.ready).toBe(true);
 const result=applyExplorationCommand(s.atlas,s.exploration,{action:'travel',siteId:id},{tick:k.tick,branchId:k.runId});
 expect(result.state.expedition.journey?.arrivalTick).toBe(ready.arrivalTick);
 expect(s.exploration.expedition.fuel-result.state.expedition.fuel).toBe(ready.fuel);
 expect(nearbyInvestigations(s.atlas,s.exploration,k.tick)[0].siteId).toBe(id);
 const blocked=structuredClone(s.exploration);blocked.sites[id].hazard=71;
 expect(departureBriefing(s.atlas,blocked,id,k.tick).ready).toBe(false);
 expect(nearbyInvestigations(s.atlas,blocked,k.tick)).toEqual([]);
 expect(()=>applyExplorationCommand(s.atlas,blocked,{action:'travel',siteId:id},{tick:k.tick,branchId:k.runId})).toThrow('hazard');
});
it('local work does not require a redundant journey, even if surroundings have deteriorated',()=>{
 const k=new SimulationKernel({runId:'local',name:'fixture',plugin:CORE_WORLD_PLUGINS[9],seed:1}),s=k.getState(),id=s.atlas.sites[0].facts.id;
 Object.assign(s.exploration.sites[id],{discoveryState:'VISITED',firstVisitedTick:0,hazard:90});
 const options=nearbyInvestigations(s.atlas,s.exploration,12);
 expect(options[0]).toMatchObject({siteId:id,onSite:true,ticks:0,fuel:0});
 expect(departureBriefing(s.atlas,s.exploration,id,12).ready).toBe(false);
});
