import {writeFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {SimulationKernel} from '../core/kernel';
import {CORE_WORLD_PLUGINS} from '../worlds';
import {applyExplorationCommand,planRoute,surveyCoverage} from '../exploration/engine';
import {resupplyAvailability} from '../exploration/dossier';

/** Acceptance workload, not a fixture: default configs/stocks, real commands and full native ticks. */
describe.runIf(process.env.RUN_ACCEPTANCE==='1')('Default-resource active-world acceptance',()=>{
 it('completes investigations with default stocks and retains finite, restorable state through 2000 ticks',()=>{
  const results=[];
  const policy=process.env.BALANCE_POLICY??'nearest-first';
  const selectedWorlds=process.env.BALANCE_WORLDS?.split(',');
  for(const plugin of CORE_WORLD_PLUGINS.filter(p=>!selectedWorlds||selectedWorlds.includes(p.id)))for(const seed of [1,2026,424242]){
   const k=new SimulationKernel({runId:`balance-${plugin.id}-${seed}`,name:'Default-stock acceptance',plugin,seed});
   const initial=k.getState().exploration.expedition;
   const startingStocks={fuel:initial.fuel,supplies:initial.supplies};
   let expeditionFailure:string|null=null,stabilityFailure:string|null=null,resupplies=0;
   const command=(action:string,siteId:string)=>{
    const s=k.getState();applyExplorationCommand(s.atlas,s.exploration,{action,siteId} as Parameters<typeof applyExplorationCommand>[2],{tick:k.tick,branchId:k.runId});
    k.enqueueCommand({type:'exploration.action',label:action,payload:{action,siteId}});k.flushCurrentTickCommands();
   };
   const travel=(siteId:string)=>{command('travel',siteId);while(k.getState().exploration.expedition.journey)k.step();};
   try{
    for(let moves=0;moves<200;moves++){
     let s=k.getState();const a=s.atlas,e=s.exploration;
     if(Object.values(e.sites).every((x:any)=>x.discoveryState==='RESOLVED'))break;
     // Only stock transfers the real UI can perform. No direct state/config mutations.
     if(!resupplyAvailability(a,e)){
      k.enqueueCommand({type:'expedition.resupply',label:'Local resupply',payload:{}});k.flushCurrentTickCommands();resupplies++;
     }
     s=k.getState();
     const ready=(site:any)=>{
      if(e.sites[site.facts.id].discoveryState==='RESOLVED'||e.sites[site.facts.id].hazard>70)return false;
      if(a.chains.some((chain:any)=>{const index=chain.steps.findIndex((step:any)=>step.siteId===site.facts.id);return index>0&&chain.steps.slice(0,index).some((step:any)=>!e.sites[step.siteId].evidence.some((x:any)=>x.evidenceId===step.evidenceId));}))return false;
      try{planRoute(a,e.expedition.regionId,site.facts.regionId,70,e.expedition.fuel,e);return true;}catch{return false;}
     };
     const coverage=surveyCoverage(a,e);
     const candidates=a.sites.filter((x:any)=>coverage.has(x.facts.regionId)&&ready(x));
     if(policy==='nearest-first')candidates.sort((left:any,right:any)=>planRoute(a,e.expedition.regionId,left.facts.regionId,70,e.expedition.fuel,e).ticks-planRoute(a,e.expedition.regionId,right.facts.regionId,70,e.expedition.fuel,e).ticks||e.sites[right.facts.id].hazard-e.sites[left.facts.id].hazard);
     const site=candidates[0];
     if(!site){
      const anchor=a.sites.find((x:any)=>e.sites[x.facts.id].firstVisitedTick!==null&&x.facts.regionId!==e.expedition.regionId&&e.sites[x.facts.id].hazard<=70&&a.sites.some((candidate:any)=>ready(candidate)&&surveyCoverage(a,{...e,expedition:{...e.expedition,regionId:x.facts.regionId}}).has(candidate.facts.regionId)));
      if(!anchor)throw new Error('No safe reachable investigation or visited frontier anchor');
      travel(anchor.facts.id);continue;
     }
     const id=site.facts.id;
     if(e.sites[id].discoveryState==='UNKNOWN')command('detect',id);
     if(k.getState().exploration.sites[id].discoveryState==='DETECTED')command('survey',id);
     if(k.getState().exploration.sites[id].discoveryState==='SURVEYED')command('discover',id);
     if(k.getState().exploration.expedition.regionId!==site.facts.regionId||k.getState().exploration.sites[id].firstVisitedTick===null)travel(id);
     while(k.getState().exploration.sites[id].condition<75)command('repair',id);
     const d=k.getState().exploration.sites[id];
     if(site.evidence.some((rule:any)=>!d.evidence.some((x:any)=>x.evidenceId===rule.id)))command('investigate',id);
     command('resolve',id);
    }
   }catch(error){expeditionFailure=String(error);}
   const expeditionTick=k.tick, resolved=Object.values(k.getState().exploration.sites).filter((x:any)=>x.discoveryState==='RESOLVED').length;
   if(resolved!==36&&!expeditionFailure)expeditionFailure='Navigation budget exhausted';
   try{
    while(k.tick<2000)k.step();
    const scan=(value:unknown):void=>{if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Non-finite authoritative value');if(value&&typeof value==='object')for(const v of Object.values(value))scan(v);};
    scan(k.getState());
    const restored=SimulationKernel.fromRunRecord(k.exportRunRecord(),plugin);
    expect(restored.getStateHash()).toBe(k.getStateHash());
    for(let tick=0;tick<5;tick++){k.step();restored.step();}
    expect(restored.getStateHash()).toBe(k.getStateHash());
   }catch(error){stabilityFailure=String(error);}
   const state=k.getState();
   results.push({world:plugin.id,seed,startingStocks,resolved,expeditionTick,resupplies,expeditionFailure,stabilityFailure,finalTick:k.tick,remainingStocks:{fuel:state.exploration.expedition.fuel,supplies:state.exploration.expedition.supplies},meanCondition:Object.values(state.exploration.sites).reduce((n:number,x:any)=>n+x.condition,0)/36});
  }
  writeFileSync(process.env.BALANCE_REPORT??'docs/acceptance/default-balance.json',JSON.stringify({schemaVersion:1,policy,method:'Default configs and starting stocks; full native systems; only real expedition commands; three seeds; 2000 ticks plus restored continuation. Greedy reachable-site policy with prerequisite ordering and local resupply, not an exhaustive planning oracle.',results},null,2)+'\n');
  expect(results.filter(r=>r.expeditionFailure||r.stabilityFailure)).toEqual([]);
 },900000);
});
