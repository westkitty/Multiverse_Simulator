import {it,expect} from 'vitest';
import {CORE_WORLD_PLUGINS} from '../worlds';
import {SimulationKernel} from '../core/kernel';
import {advanceExploration,applyExplorationCommand,surveyCoverage} from '../exploration/engine';

it('all 540 sites and 45 ordered chains are accessible through detection, travel and evidence actions with sufficient stocks',()=>{
  for(const plugin of CORE_WORLD_PLUGINS){
    const k=new SimulationKernel({runId:'routes',name:'routes',plugin,seed:2026});const atlas=k.getState().atlas;
    let state=structuredClone(k.getState().exploration);
    // Isolate navigational/chain feasibility from long-run environmental and economy balance.
    state.expedition.fuel=1000;state.expedition.supplies=1000;
    let tick=0;
    for(let completed=0;completed<36;completed++){
      const canAdvance=(regionId:string)=>{
        const coverage=surveyCoverage(atlas,{...state,expedition:{...state.expedition,regionId}});
        return atlas.sites.some((s:any)=>state.sites[s.facts.id].firstVisitedTick===null&&coverage.has(s.facts.regionId));
      };
      if(!canAdvance(state.expedition.regionId)){
        const anchor=atlas.sites.find((s:any)=>state.sites[s.facts.id].firstVisitedTick!==null&&canAdvance(s.facts.regionId));
        expect(anchor,`${plugin.id}: no surveyed frontier anchor`).toBeDefined();
        state=applyExplorationCommand(atlas,state,{action:'travel',siteId:anchor.facts.id},{tick,branchId:'routes'}).state;
        tick=state.expedition.journey!.arrivalTick;state=advanceExploration(atlas,state,{tick,branchId:'routes'}).state;
      }
      const covered=surveyCoverage(atlas,state);
      const site=atlas.sites.find((s:any)=>state.sites[s.facts.id].firstVisitedTick===null&&covered.has(s.facts.regionId)&&atlas.chains.every((chain:any)=>{
        const index=chain.steps.findIndex((step:any)=>step.siteId===s.facts.id);
        return index<1||chain.steps.slice(0,index).every((step:any)=>state.sites[step.siteId].evidence.some((e:any)=>e.evidenceId===step.evidenceId));
      }));
      expect(site,`${plugin.id}: stalled after ${completed} sites`).toBeDefined();
      const siteId=site.facts.id;
      if(state.sites[siteId].discoveryState==='UNKNOWN')state=applyExplorationCommand(atlas,state,{action:'detect',siteId},{tick,branchId:'routes'}).state;
      for(const action of ['survey','discover','travel'] as const)state=applyExplorationCommand(atlas,state,{action,siteId},{tick,branchId:'routes'}).state;
      tick=state.expedition.journey!.arrivalTick;state=advanceExploration(atlas,state,{tick,branchId:'routes'}).state;
      for(const action of ['repair','repair','investigate','resolve'] as const)state=applyExplorationCommand(atlas,state,{action,siteId},{tick,branchId:'routes'}).state;
    }
    expect(Object.values(state.sites).every((s:any)=>s.discoveryState==='RESOLVED')).toBe(true);
    for(const chain of atlas.chains)expect(chain.steps.every((step:any)=>state.sites[step.siteId].evidence.some((e:any)=>e.evidenceId===step.evidenceId))).toBe(true);
  }
},60000);
