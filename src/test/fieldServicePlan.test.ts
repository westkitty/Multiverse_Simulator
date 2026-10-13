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
      expect(plan.unsafeDamagedSites,plugin.id).toBe(0);
      expect(plan.fuelLimitedDamagedSites,plugin.id).toBe(0);
      expect(plan.routeBlockedDamagedSites,plugin.id).toBe(0);
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
        // The native stock transfer would still send fuel; that cannot pay
        // the two-supply repair bill.
        expect(copy.sites[site.facts.id].resources.fuel).toBeGreaterThan(0);
      }
    }
    result=planFieldService(source.atlas,copy);
    expect(result.action).toBe('need-supplies');
    expect(result.instruction).toContain('fuel-only transfers');
    for(const site of source.atlas.sites) {
      if(site.facts.regionId===copy.expedition.regionId && copy.sites[site.facts.id].firstVisitedTick!==null){
        copy.sites[site.facts.id].resources.fuel=0;
      }
    }
    expect(planFieldService(source.atlas,copy).action).toBe('need-supplies');
    copy.expedition.supplies=10;
    copy.sites[id].hazard=96;
    result=planFieldService(source.atlas,copy);
    expect(result.action).toBe('blocked');
    expect(result.blockedDamagedSites).toBe(1);
    expect(result.unsafeDamagedSites).toBe(1);
    expect(result.fuelLimitedDamagedSites).toBe(0);

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
    // A finite local fuel stock can repair a fuel-only route blockade.
    copy.sites[id].resources.fuel=Math.max(20,ready.target!.fuelCost+1);
    copy.expedition.fuel=0;
    const dry=planFieldService(source.atlas,copy);
    expect(dry.action).toBe('resupply');
    expect(dry.safelyReachableDamagedSites).toBe(0);
    expect(dry.fuelLimitedDamagedSites).toBe(1);
    expect(dry.routeBlockedDamagedSites).toBe(0);
    expect(dry.target).toBeNull();
    expect(dry.instruction).toContain('Transfer up to 10 fuel');
    // This is a projection only: it must NEVER credit fuel or bypass the route.
    expect(copy.expedition.fuel).toBe(0);
    copy.sites[id].resources.fuel=0;
    const unsupported=planFieldService(source.atlas,copy);
    expect(unsupported.action).toBe('blocked');
    expect(unsupported.target).toBeNull();
    expect(k.getState().exploration.sites[remote].firstVisitedTick).toBeNull();
  });

  it('allows safe paid travel to an already visited destination that can resupply repair materials after arrival',()=>{
    const k=fresh(1904);
    const localId=visitStartingSite(k);
    const original=k.getState();
    const copy=structuredClone(original.exploration);
    const baseHash=k.getStateHash();
    copy.sites[localId].condition=100;
    const remote=original.atlas.sites.find(site=>{
      if(site.facts.regionId===copy.expedition.regionId)return false;
      if(copy.sites[site.facts.id].hazard>70)return false;
      try {
        return planRoute(original.atlas,copy.expedition.regionId,
          site.facts.regionId,70,copy.expedition.fuel,copy).fuel>0;
      }catch{return false;}
    })!;
    expect(remote).toBeDefined();
    const id=remote.facts.id;
    copy.sites[id].firstVisitedTick=1;
    copy.sites[id].discoveryState='VISITED';
    copy.sites[id].condition=20;
    // First visited source at home has NO supplies. The previously visited
    // destination carries finite supplies; travel needs only route fuel.
    copy.sites[localId].resources.supplies=0;
    copy.sites[id].resources.supplies=7;
    copy.expedition.supplies=1;
    const departure=planFieldService(original.atlas,copy);
    expect(departure.action).toBe('travel');
    expect(departure.target?.siteId).toBe(id);
    expect(departure.instruction).toContain('resupply there before paying');
    const nativeCost=planRoute(original.atlas,copy.expedition.regionId,
      remote.facts.regionId,70,copy.expedition.fuel,copy).fuel;
    expect(departure.target?.fuelCost).toBe(nativeCost);
    // Hypothetical arrival is only in the cloned planning fixture.
    copy.expedition.regionId=remote.facts.regionId;
    copy.expedition.fuel-=nativeCost;
    expect(planFieldService(original.atlas,copy).action).toBe('resupply');
    copy.expedition.supplies=3;
    expect(planFieldService(original.atlas,copy).action).toBe('repair');
    expect(k.getStateHash()).toBe(baseHash);
  });

  it('allows finite origin-plus-destination supplies to cover one real repair without teleporting stock',()=>{
    const k=fresh(1907);
    const local=visitStartingSite(k);
    const original=k.getState();
    const copy=structuredClone(original.exploration);
    copy.sites[local].condition=100;
    const remote=original.atlas.sites.find(site=>{
      if(site.facts.regionId===copy.expedition.regionId) return false;
      try {
        return planRoute(original.atlas,copy.expedition.regionId,
          site.facts.regionId,70,copy.expedition.fuel,copy).fuel>0;
      }catch{return false;}
    })!;
    expect(remote).toBeDefined();
    const id=remote.facts.id;
    copy.sites[id].firstVisitedTick=1;
    copy.sites[id].discoveryState='VISITED';
    copy.sites[id].condition=10;
    copy.sites[local].resources.supplies=1;
    copy.sites[id].resources.supplies=1;
    copy.expedition.supplies=0;
    const first=planFieldService(original.atlas,copy);
    expect(first.action).toBe('resupply');
    expect(first.instruction).toContain('collect the remaining supplies');
    expect(copy.expedition.supplies).toBe(0);
    // The hypothetical stock transfers mirror native 10-supply maximums,
    // but only cloned fixture state is edited; the real run is unchanged.
    copy.sites[local].resources.supplies=0;
    copy.expedition.supplies=1;
    const second=planFieldService(original.atlas,copy);
    expect(second.action).toBe('travel');
    expect(second.target?.siteId).toBe(id);
    copy.expedition.regionId=remote.facts.regionId;
    expect(planFieldService(original.atlas,copy).action).toBe('resupply');
    copy.expedition.supplies=2;
    expect(planFieldService(original.atlas,copy).action).toBe('repair');
  });

  it('never confuses remote dangerous routes with refuelable routes',()=>{
    const k=fresh(904);
    const localId=visitStartingSite(k);
    const original=k.getState();
    const copy=structuredClone(original.exploration);
    copy.sites[localId].condition=100;
    const remote=original.atlas.sites.find(site=>site.facts.regionId!==copy.expedition.regionId)!;
    copy.sites[remote.facts.id].firstVisitedTick=1;
    copy.sites[remote.facts.id].discoveryState='VISITED';
    copy.sites[remote.facts.id].condition=10;
    copy.sites[localId].resources.fuel=100;
    copy.expedition.fuel=0;
    // Even infinite fuel cannot turn an unsafe destination into a safe order.
    copy.sites[remote.facts.id].hazard=100;
    const blocked=planFieldService(original.atlas,copy);
    expect(blocked.action).toBe('blocked');
    expect(blocked.target).toBeNull();
    expect(blocked.safelyReachableDamagedSites).toBe(0);
    expect(blocked.unsafeDamagedSites).toBe(1);
    copy.sites[remote.facts.id].hazard=20;
    copy.regionHazards[remote.facts.regionId]=99;
    const unsafeCorridor=planFieldService(original.atlas,copy);
    expect(unsafeCorridor.action).toBe('blocked');
    expect(unsafeCorridor.unsafeDamagedSites).toBe(0);
    expect(unsafeCorridor.routeBlockedDamagedSites).toBe(1);
    expect(unsafeCorridor.fuelLimitedDamagedSites).toBe(0);
  });

});
