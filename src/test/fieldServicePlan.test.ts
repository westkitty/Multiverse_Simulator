import {describe,it,expect} from 'vitest';
import {SimulationKernel} from '../core/kernel';
import {CORE_WORLD_PLUGINS} from '../worlds';
import {planFieldService} from '../exploration/fieldServicePlan';
import {planRoute} from '../exploration/engine';

const world = CORE_WORLD_PLUGINS.find(plugin=>plugin.id==='ecosystem')!;
const fresh = (seed=2026) => new SimulationKernel({
  runId:'service-lab-'+seed,name:'Service order proof',plugin:world,seed,
});
function command(kernel:SimulationKernel<any,any>,action:string,siteId:string) {
  const issued=kernel.enqueueCommand({
    type:'exploration.action',label:'Service lab '+action,payload:{action,siteId},
  });
  const accepted=kernel.flushCurrentTickCommands();
  expect(accepted.some(entry=>entry.id===issued.id)).toBe(true);
}
/** A normal in-game first visit: survey, discover, depart and simulate arrival. */
function visitStartingSite(kernel:SimulationKernel<any,any>) {
  const source=kernel.getState();
  const site=source.atlas.sites.find((item:any)=>
    item.facts.regionId===source.exploration.expedition.regionId)!;
  const id=site.facts.id;
  for(let phase=0;phase<3;phase++){
    const stage=kernel.getState().exploration.sites[id].discoveryState;
    if(stage==='UNKNOWN')command(kernel,'detect',id);
    else if(stage==='DETECTED')command(kernel,'survey',id);
    else if(stage==='SURVEYED')command(kernel,'discover',id);
  }
  command(kernel,'travel',id);
  let ticks=0;
  while(kernel.getState().exploration.expedition.journey && ++ticks<20)kernel.step();
  expect(kernel.getState().exploration.sites[id].firstVisitedTick).not.toBeNull();
  return id;
}
describe('native expedition service order',()=>{
  it('preserves all fifteen worlds with no manufactured visits or repair opportunities',()=>{
    for(const plugin of CORE_WORLD_PLUGINS){
      const k=new SimulationKernel({
        runId:'service-'+plugin.id,name:'New reality',plugin,seed:1,
      });
      const hash=k.getStateHash();
      const source=k.getState();
      const plan=planFieldService(source.atlas,source.exploration);
      expect(plan.action,plugin.id).toBe('none');
      expect(plan.visitedDamagedSites,plugin.id).toBe(0);
      expect(plan.target,plugin.id).toBeNull();
      expect(k.getStateHash(),plugin.id).toBe(hash);
    }
  });

  it('uses real prior visit, finite two-supply repair, and never mutates on projection',()=>{
    const k=fresh();
    const id=visitStartingSite(k);
    const source=k.getState();
    const beforeHash=k.getStateHash();
    const plan=planFieldService(source.atlas,source.exploration);
    expect(plan.action).toBe('repair');
    expect(plan.target?.siteId).toBe(id);
    expect(plan.target?.local).toBe(true);
    expect(plan.target?.fuelCost).toBe(0);
    expect(plan.repairSuppliesCost).toBe(2);
    expect(plan.safelyReachableDamagedSites).toBeGreaterThanOrEqual(1);
    expect(k.getStateHash()).toBe(beforeHash);

    const beforeCondition=k.getState().exploration.sites[id].condition;
    const beforeSupplies=k.getState().exploration.expedition.supplies;
    command(k,'repair',id);
    const after=k.getState().exploration;
    expect(after.sites[id].condition).toBeGreaterThan(beforeCondition);
    expect(after.expedition.supplies).toBe(beforeSupplies-2);
    const clone=SimulationKernel.fromRunRecord(k.exportRunRecord(),world);
    expect(clone.getStateHash()).toBe(k.getStateHash());
    for(let tick=0;tick<5;tick++){k.step();clone.step();}
    expect(clone.getStateHash()).toBe(k.getStateHash());
  });

  it('distinguishes paid resupply, depleted local stock, journey and blocked hazard',()=>{
    const k=fresh(424242);
    const id=visitStartingSite(k);
    const source=k.getState();
    const copy=structuredClone(source.exploration);
    const hash=k.getStateHash();

    copy.expedition.supplies=1;
    let result=planFieldService(source.atlas,copy);
    expect(result.action).toBe('resupply');

    for(const site of source.atlas.sites) {
      if(site.facts.regionId===copy.expedition.regionId && copy.sites[site.facts.id].firstVisitedTick!==null){
        copy.sites[site.facts.id].resources.supplies=0;
        copy.sites[site.facts.id].resources.fuel=0;
      }
    }
    result=planFieldService(source.atlas,copy);
    expect(result.action).toBe('need-supplies');
    copy.expedition.supplies=10;
    copy.sites[id].hazard=96;
    result=planFieldService(source.atlas,copy);
    expect(result.action).toBe('blocked');
    expect(result.blockedDamagedSites).toBe(1);

    copy.expedition.journey={siteId:id,routeIds:[],arrivalTick:k.tick+3};
    result=planFieldService(source.atlas,copy);
    expect(result.action).toBe('in-transit');
    expect(result.instruction).toContain('Advance simulation');
    expect(k.getStateHash()).toBe(hash);
  });

  it('never suggests fuel-unaffordable routes or unvisited hidden sites',()=>{
    const k=fresh(99);
    const id=visitStartingSite(k);
    const source=k.getState();
    const copy=structuredClone(source.exploration);
    copy.sites[id].condition=99;
    const candidate=source.atlas.sites.find((site:any)=>{
      if(site.facts.regionId===copy.expedition.regionId)return false;
      if(copy.sites[site.facts.id].hazard>70)return false;
      try {
        const route=planRoute(source.atlas,copy.expedition.regionId,site.facts.regionId,70,
          copy.expedition.fuel,copy);
        return route.fuel>0;
      }catch{return false;}
    });
    expect(candidate).toBeDefined();
    const remote=candidate!.facts.id;
    copy.sites[remote].firstVisitedTick=1;
    copy.sites[remote].discoveryState='VISITED';
    copy.sites[remote].condition=15;
    const ready=planFieldService(source.atlas,copy);
    expect(ready.action).toBe('travel');
    expect(ready.target?.siteId).toBe(remote);
    expect(ready.target?.fuelCost).toBeGreaterThan(0);
    expect(ready.visitedDamagedSites).toBe(1);
    copy.expedition.fuel=0;
    const dry=planFieldService(source.atlas,copy);
    expect(dry.action).toBe('blocked');
    expect(dry.target).toBeNull();
    expect(k.getState().exploration.sites[remote].firstVisitedTick).toBeNull();
  });
});
