import {writeFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {SimulationKernel} from '../core/kernel';
import {CORE_WORLD_PLUGINS} from '../worlds';
import {applyExplorationCommand,planRoute,surveyCoverage} from '../exploration/engine';
import {resupplyAvailability} from '../exploration/dossier';


const ECONOMY_AUDIT_WORLDS = new Set(['civilization', 'industrial', 'megacity', 'geology']);

/** A deterministic, ordinary-player repair policy: no changes to plugin config, world
 * state, RNG, archives or actor inventories outside the validated command bus. */
function exerciseMaintenancePolicy(kernel: SimulationKernel<any, any>, untilTick: number) {
  let cursor = 0, repairs = 0, journeys = 0, resupplies = 0, idleChecks = 0;
  const dispatch = (type: string, label: string, payload: Record<string, unknown>) => {
    const command = kernel.enqueueCommand({type, label, payload});
    const applied = kernel.flushCurrentTickCommands();
    expect(applied.some(item => item.id === command.id)).toBe(true);
  };
  while (kernel.tick < untilTick) {
    const world = kernel.getState();
    const atlas = world.atlas, state = world.exploration, expedition = state.expedition;
    let acted = false;

    // One player command at most every other simulated tick. Travel advances via
    // regular fixed ticks and never teleports or bypasses an access/route gate.
    if (!expedition.journey && kernel.tick % 2 === 0) {
      if (expedition.supplies < 6) {
        const local = atlas.sites.find((site: any) =>
          site.facts.regionId === expedition.regionId &&
          state.sites[site.facts.id].firstVisitedTick !== null);
        const stocks = local && state.sites[local.facts.id].resources;
        if (stocks && stocks.supplies + stocks.fuel > 0) {
          dispatch('expedition.resupply', 'Maintain: paid local resupply', {});
          resupplies++;
          acted = true;
        }
      }

      if (!acted) {
        for (let shift = 0; shift < atlas.sites.length; shift++) {
          const index = (cursor + shift) % atlas.sites.length;
          const site = atlas.sites[index], delta = state.sites[site.facts.id];
          if (delta.firstVisitedTick === null || delta.condition >= 80) continue;

          if (site.facts.regionId === expedition.regionId) {
            if (expedition.supplies < 2) continue;
            dispatch('exploration.action', 'Maintain: repair visited site',
              {action: 'repair', siteId: site.facts.id});
            repairs++;
            cursor = (index + 1) % atlas.sites.length;
            acted = true;
            break;
          }

          if (delta.hazard > 70) continue;
          try {
            // The same validated native route/fuel budget used by the Atlas UI.
            planRoute(atlas, expedition.regionId, site.facts.regionId, 70,
              expedition.fuel, state);
          } catch {
            continue;
          }
          dispatch('exploration.action', 'Maintain: travel to service site',
            {action: 'travel', siteId: site.facts.id});
          journeys++;
          cursor = index;
          acted = true;
          break;
        }
      }
      if (!acted) idleChecks++;
    }
    kernel.step();
  }

  const nextState = kernel.getState();
  const deltas = Object.values(nextState.exploration.sites) as Array<{
    condition: number; hazard: number;
  }>;
  const meanCondition = deltas.reduce((sum, site) => sum + site.condition, 0) / deltas.length;
  const collapsedSites = deltas.filter(site => site.condition < 25).length;
  const unsafeAccessSites = deltas.filter(site => site.hazard > 70).length;
  const finalStocks = {
    fuel: nextState.exploration.expedition.fuel,
    supplies: nextState.exploration.expedition.supplies,
  };
  const restored = SimulationKernel.fromRunRecord(kernel.exportRunRecord(), kernel.plugin);
  expect(restored.getStateHash()).toBe(kernel.getStateHash());
  for (let tick = 0; tick < 5; tick++) {
    kernel.step();
    restored.step();
  }
  expect(restored.getStateHash()).toBe(kernel.getStateHash());
  return {repairs, journeys, resupplies, idleChecks, meanCondition, collapsedSites,
    unsafeAccessSites, finalStocks};
}

/** Acceptance workload, not a fixture: default configs/stocks, real commands and full native ticks. */
describe.runIf(process.env.RUN_ACCEPTANCE==='1')('Default-resource active-world acceptance',()=>{
 it('completes investigations with default stocks and retains finite, restorable state through 2000 ticks',()=>{
  const results=[];
  const maintenanceResults=[];
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
   const maintenanceStart = ECONOMY_AUDIT_WORLDS.has(plugin.id) && resolved===36
     && !expeditionFailure ? k.exportRunRecord() : null;
   const maintenanceStartHash = maintenanceStart ? k.getStateHash() : null;
   let unattendedAt2000: {meanCondition:number; collapsedSites:number; unsafeAccessSites:number}|null=null;
   try{
    while(k.tick<2000)k.step();
    const deltas=Object.values(k.getState().exploration.sites) as Array<{condition:number;hazard:number}>;
    unattendedAt2000={
      meanCondition:deltas.reduce((sum,site)=>sum+site.condition,0)/deltas.length,
      collapsedSites:deltas.filter(site=>site.condition<25).length,
      unsafeAccessSites:deltas.filter(site=>site.hazard>70).length,
    };
    const scan=(value:unknown):void=>{if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Non-finite authoritative value');if(value&&typeof value==='object')for(const v of Object.values(value))scan(v);};
    scan(k.getState());
    const restored=SimulationKernel.fromRunRecord(k.exportRunRecord(),plugin);
    expect(restored.getStateHash()).toBe(k.getStateHash());
    for(let tick=0;tick<5;tick++){k.step();restored.step();}
    expect(restored.getStateHash()).toBe(k.getStateHash());
   }catch(error){stabilityFailure=String(error);}
   const state=k.getState();
   results.push({world:plugin.id,seed,startingStocks,resolved,expeditionTick,resupplies,expeditionFailure,stabilityFailure,finalTick:k.tick,remainingStocks:{fuel:state.exploration.expedition.fuel,supplies:state.exploration.expedition.supplies},meanCondition:Object.values(state.exploration.sites).reduce((n:number,x:any)=>n+x.condition,0)/36});
   if (maintenanceStart && unattendedAt2000 && !stabilityFailure) {
     const managed=SimulationKernel.fromRunRecord(maintenanceStart,plugin);
     expect(managed.getStateHash()).toBe(maintenanceStartHash);
     const treatment=exerciseMaintenancePolicy(managed,2000);
     const delta=treatment.meanCondition-unattendedAt2000.meanCondition;
     maintenanceResults.push({
       world:plugin.id,seed,startTick:maintenanceStart.tick,endTick:2000,
       unattended:unattendedAt2000,maintained:treatment,meanConditionGain:delta,
     });
     console.info(`ECONOMY_LAB ${plugin.id} seed=${seed} idle=${unattendedAt2000.meanCondition.toFixed(3)} managed=${treatment.meanCondition.toFixed(3)} gain=${delta.toFixed(3)} repairs=${treatment.repairs} trips=${treatment.journeys} resupplies=${treatment.resupplies} collapsed=${treatment.collapsedSites}/${unattendedAt2000.collapsedSites}`);
     expect(treatment.repairs).toBeGreaterThan(0);
     // A repair must produce a measured improvement over an otherwise identical
     // full-native, unattended control; it is not an indefinite-sustainability claim.
     expect(delta).toBeGreaterThan(0);
   }
  }
  writeFileSync(process.env.BALANCE_REPORT??'docs/acceptance/default-balance.json',JSON.stringify({schemaVersion:1,policy,method:'Default configs and starting stocks; full native systems; only real expedition commands; three seeds; 2000 ticks plus restored continuation. Greedy reachable-site policy with prerequisite ordering and local resupply, not an exhaustive planning oracle.',results},null,2)+'\n');
  writeFileSync(process.env.MAINTENANCE_REPORT??'docs/acceptance/maintenance-economy.json',
    JSON.stringify({
      schemaVersion:1,
      protocol:'matched-controls-v1',
      worlds:[...ECONOMY_AUDIT_WORLDS],
      method:'Branch the identical post-investigation native state. Control: no more player commands. Treatment: at most one valid repair, travel or resupply command per two ticks; normal journey ticks, stock spending and safety gates. Compare site condition and unsafe access at tick 2000; verify treatment save/restore continuation five further ticks. Neither outcome certifies indefinite or unattended sustainability.',
      results:maintenanceResults,
    },null,2)+'\n');
  expect(maintenanceResults.length).toBe(
    results.filter(r=>ECONOMY_AUDIT_WORLDS.has(r.world)&&r.resolved===36&&!r.expeditionFailure&&!r.stabilityFailure).length);
  expect(results.filter(r=>r.expeditionFailure||r.stabilityFailure)).toEqual([]);
 },900000);
});
