import { describe,expect,it } from 'vitest';
import { CORE_WORLD_PLUGINS } from '../worlds';
import { SimulationKernel } from '../core/kernel';
import { applyExplorationCommand } from '../exploration/engine';
import { frameBounds } from '../renderers/frameBounds';

describe('Twelve facility functions, atomic resource accounting and expanded presentation bounds',()=>{
  for(const plugin of CORE_WORLD_PLUGINS)it(`${plugin.id}: all facility operations change authoritative resources, contacts, routes or hazard`,()=>{
    const k=new SimulationKernel({runId:'facilities',name:'fixture',plugin,seed:2026});const initial=k.getState();
    for(let role=0;role<12;role++){
      // Isolated unit fixture establishes local visit and operational resources, not a playthrough claim.
      const state=structuredClone(initial.exploration),site=initial.atlas.sites[role],id=site.facts.id;
      for(const delta of Object.values(state.sites) as any[]){delta.discoveryState='UNKNOWN';delta.firstVisitedTick=null;}
      Object.assign(state.sites[id],{discoveryState:'VISITED',firstVisitedTick:0,condition:50,hazard:50});
      state.expedition.regionId=site.facts.regionId;
      const edge=initial.atlas.routes.find((r:any)=>r.from===site.facts.regionId||r.to===site.facts.regionId);
      if(role===5)state.blockedRoutes[edge.id]=true;
      const before=JSON.stringify(state);
      const result=applyExplorationCommand(initial.atlas,state,{action:'operate',siteId:id},{tick:0,branchId:'facilities'});
      expect(JSON.stringify(state)).toBe(before);
      expect(result.events[0].before).not.toBe(result.events[0].after);
      expect(JSON.stringify(result.state)).not.toBe(before);
      if(role===4)expect(result.state.sites[id].resources.reserve).toBe(state.sites[id].resources.reserve-2);
      if(role===8)expect(result.state.expedition.cargo.records).toBe(1);
      if(role===10)expect(result.state.sites[id].mitigation).toBe(15);
      if(role===11)expect(result.state.sites[id].resources.fuel).toBe(state.sites[id].resources.fuel+1);
      const remote=structuredClone(state);remote.expedition.regionId=initial.atlas.regions.find((r:any)=>r.id!==site.facts.regionId).id;
      const remoteBefore=JSON.stringify(remote);
      expect(()=>applyExplorationCommand(initial.atlas,remote,{action:'operate',siteId:id},{tick:0,branchId:'facilities'})).toThrow('Visit this site first');
      expect(JSON.stringify(remote)).toBe(remoteBefore);
    }
    const frame=k.extractRenderFrame(),bounds=frameBounds(frame);
    for(const item of [...frame.zones,...frame.entities])item.position.forEach((n,i)=>{expect(n).toBeGreaterThanOrEqual(bounds.min[i]);expect(n).toBeLessThanOrEqual(bounds.max[i]);});
    expect(bounds.viewBox.split(' ').every(n=>Number.isFinite(Number(n)))).toBe(true);
  });
});
