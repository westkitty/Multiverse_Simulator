import { SimulationKernel } from '../core/kernel';
import { planFieldService } from '../exploration/fieldServicePlan';
import { inspectNativeRecoveryAccess, SCIENTIFIC_RECOVERY_COMMANDS } from './nativeScientificAccessLab';

interface ServiceCounts {
  repair: number;
  travel: number;
  resupply: number;
  costedRepairSupplies: number;
  paidTravelFuel: number;
  localTransferredSupplies: number;
  localTransferredFuel: number;
  waitingInTransitTicks: number;
  blockedTicks: number;
  insufficientSuppliesTicks: number;
  noWorkTicks: number;
}
function snapshot(kernel: SimulationKernel<any, any>) {
  const state = kernel.getState();
  const atlas = state.atlas, expedition = state.exploration.expedition;
  const sites = Object.values(state.exploration.sites) as Array<{
    condition: number; hazard: number; firstVisitedTick: number|null;
    resources: {fuel: number; supplies: number};
  }>;
  const mean = (numbers: number[]) =>
    numbers.reduce((sum, n) => sum + n, 0)/numbers.length;
  const access = inspectNativeRecoveryAccess(kernel);
  const plan = planFieldService(atlas, state.exploration);
  return {
    tick:kernel.tick,
    meanSiteCondition:mean(sites.map(site=>site.condition)),
    sitesBelow25:sites.filter(site=>site.condition<25).length,
    sitesBelow75:sites.filter(site=>site.condition<75).length,
    visitedDamagedSites:plan.visitedDamagedSites,
    safeReachableSites:access.safelyReachableSites,
    unsafeTargets:access.unsafeSiteTargets,
    regionHazard:access.meanRegionHazard,
    safeVisitedDamaged:plan.safelyReachableDamagedSites,
    blockedVisitedDamaged:plan.blockedDamagedSites,
    limitedByFuel:plan.fuelLimitedDamagedSites,
    limitedByUnsafeDestination:plan.unsafeDamagedSites,
    limitedByRoute:plan.routeBlockedDamagedSites,
    expeditionFuel:expedition.fuel,
    expeditionSupplies:expedition.supplies,
    worldSiteFuel:sites.reduce((sum,site)=>sum+site.resources.fuel,0),
    worldSiteSupplies:sites.reduce((sum,site)=>sum+site.resources.supplies,0),
    inTransit:!!expedition.journey,
  };
}
const send = (
  kernel: SimulationKernel<any,any>,
  type:string, label:string, payload: Record<string,unknown>,
) => {
  const queued=kernel.enqueueCommand({type,label,payload});
  const receipts=kernel.flushCurrentTickCommands();
  if(!receipts.some(receipt=>receipt.id===queued.id)) {
    throw new Error('No accepted native command receipt for '+label);
  }
};
/** Use exactly the existing 3D world scientific controls; this is not an
 * uncosted new supply, teleport, route override or replacement world policy. */
function applyWorldRecovery(kernel:SimulationKernel<any,any>) {
  const id=SCIENTIFIC_RECOVERY_COMMANDS[kernel.plugin.id];
  const descriptor=kernel.plugin.quickInterventions.find(action=>action.id===id);
  if(!descriptor)throw new Error('Missing native world restoration '+kernel.plugin.id);
  send(kernel,descriptor.commandType,descriptor.label,descriptor.defaultPayload);
}
/**
 * Execute one legal player action selected by the very same read-only service
 * planner used by the actual 3D field deck. All resource debit and journey
 * timing is performed by the original simulation command bus.
 */
function serviceOnce(kernel:SimulationKernel<any,any>,counts:ServiceCounts) {
  const state=kernel.getState(),expedition=state.exploration.expedition;
  const hash=kernel.getStateHash();
  const plan=planFieldService(state.atlas,state.exploration);
  if(hash!==kernel.getStateHash())throw new Error('Field planner mutated authoritative world state');
  if(plan.action==='in-transit'){counts.waitingInTransitTicks++;return;}
  if(plan.action==='blocked'){counts.blockedTicks++;return;}
  if(plan.action==='need-supplies'){counts.insufficientSuppliesTicks++;return;}
  if(plan.action==='none'){counts.noWorkTicks++;return;}
  const currentRegion=expedition.regionId;
  const supplyBefore=expedition.supplies, fuelBefore=expedition.fuel;
  if(plan.action==='resupply'){
    const donor=state.atlas.sites.find((site:any)=>
      site.facts.regionId===currentRegion &&
      state.exploration.sites[site.facts.id].firstVisitedTick!==null);
    if(!donor)throw new Error('Planner resupply without visited local donor');
    const old=state.exploration.sites[donor.facts.id].resources;
    const donorSupplies=old.supplies,donorFuel=old.fuel;
    send(kernel,'expedition.resupply','Actual local finite transfer',{});
    const after=kernel.getState().exploration;
    const donated=after.sites[donor.facts.id].resources;
    const suppliesMoved=after.expedition.supplies-supplyBefore;
    const fuelMoved=after.expedition.fuel-fuelBefore;
    if(suppliesMoved+fuelMoved<=0 || suppliesMoved>10 || fuelMoved>10 ||
      Math.abs(suppliesMoved-(donorSupplies-donated.supplies))>1e-6 ||
      Math.abs(fuelMoved-(donorFuel-donated.fuel))>1e-6)
      throw new Error('Native resupply violated finite local inventory ledger');
    counts.localTransferredSupplies+=suppliesMoved;
    counts.localTransferredFuel+=fuelMoved;
    counts.resupply++;
    return;
  }
  if(!plan.target)throw new Error('Actionable service plan missing visited target');
  const siteId=plan.target.siteId;
  const currentSite=state.exploration.sites[siteId];
  if(currentSite.firstVisitedTick===null || currentSite.hazard>70)
    throw new Error('Planner selected unvisited or hazardous destination');
  if(plan.action==='travel'){
    send(kernel,'exploration.action','Actual paid service departure',{action:'travel',siteId});
    const after=kernel.getState().exploration.expedition;
    if(!after.journey || Math.abs(fuelBefore-after.fuel-plan.target.fuelCost)>1e-6)
      throw new Error('Native travel failed fuel debit or tick-driven journey creation');
    counts.paidTravelFuel+=plan.target.fuelCost;
    counts.travel++;
    return;
  }
  if(plan.action==='repair'){
    if(currentRegion!==plan.target.regionId || supplyBefore<2)
      throw new Error('Planner requested unpaid or nonlocal repair');
    const prior=currentSite.condition;
    send(kernel,'exploration.action','Actual paid service repair',{action:'repair',siteId});
    const after=kernel.getState().exploration;
    const gained=after.sites[siteId].condition-prior;
    const expectedGain=Math.min(25,100-prior);
    const suppliesSpent=supplyBefore-after.expedition.supplies;
    // Native fractional conditions may carry IEEE-754 rounding at ±25.
    // Compare against the exact engine contract within a narrow 1e-6 bound,
    // never waive the positive gain or the real two-supply debit.
    if(!Number.isFinite(gained) || !Number.isFinite(suppliesSpent) ||
      expectedGain<=0 || Math.abs(suppliesSpent-2)>1e-6 ||
      Math.abs(gained-expectedGain)>1e-6)
      throw new Error(
        'Native repair failed verified ledger: world='+kernel.plugin.id+
        ' site='+siteId+' prior='+prior+' after='+after.sites[siteId].condition+
        ' gained='+gained+' expectedGain='+expectedGain+
        ' debit='+suppliesSpent+' expectedDebit=2',
      );
    counts.repair++;
    counts.costedRepairSupplies+=2;
    return;
  }
  const exhaustive:never=plan.action;
  throw new Error('Unknown service action '+exhaustive);
}
function emptyCounts():ServiceCounts {
  return {repair:0,travel:0,resupply:0,costedRepairSupplies:0,
    paidTravelFuel:0,localTransferredSupplies:0,localTransferredFuel:0,
    waitingInTransitTicks:0,blockedTicks:0,insufficientSuppliesTicks:0,noWorkTicks:0};
}
/**
 * Three explicitly matched arms:
 * 1. unattended native world; 2. only the proven scientific emergency command;
 * 3. identical science plus legal ordinary paid service orders.
 *
 * Post-collapse source state comes from the full 36-site default-stock
 * expedition and 2000 native ticks. No canonical config, archive, RNG or
 * tick behavior is modified to get a favorable outcome.
 */
export function probeClosedLoopSustainment(kernel:SimulationKernel<any,any>) {
  if(kernel.tick<2000 || !SCIENTIFIC_RECOVERY_COMMANDS[kernel.plugin.id])
    throw new Error('Need an exhausted eligible native world at tick >=2000');
  const source=kernel.exportRunRecord(), sourceHash=kernel.getStateHash();
  const control=SimulationKernel.fromRunRecord(source,kernel.plugin);
  const science=SimulationKernel.fromRunRecord(source,kernel.plugin);
  const serviced=SimulationKernel.fromRunRecord(source,kernel.plugin);
  for(const arm of [control,science,serviced])if(arm.getStateHash()!==sourceHash)
    throw new Error('Matched sustainment arm state or RNG differs');
  const initial=snapshot(control);
  for(let pulse=0;pulse<2;pulse++){
    applyWorldRecovery(science);
    applyWorldRecovery(serviced);
    control.step();
    science.step();
    serviced.step();
  }
  if(science.getStateHash()!==serviced.getStateHash())
    throw new Error('Science-only and service arms diverged before servicing');
  const afterScience={control:snapshot(control),science:snapshot(science)};
  const counts=emptyCounts();
  const checkpoints:Record<string,unknown>={};
  for(let offset=1;offset<=180;offset++){
    if(offset%2===1 && !serviced.getState().exploration.expedition.journey) {
      serviceOnce(serviced,counts);
    } else if(serviced.getState().exploration.expedition.journey) {
      counts.waitingInTransitTicks++;
    }
    control.step();
    science.step();
    serviced.step();
    if(offset===30||offset===90||offset===180)checkpoints[String(offset)]={
      untreated:snapshot(control),science:snapshot(science),paidService:snapshot(serviced),
    };
  }
  const end=checkpoints['180'] as {
    untreated:ReturnType<typeof snapshot>,
    science:ReturnType<typeof snapshot>,
    paidService:ReturnType<typeof snapshot>
  };
  if(counts.costedRepairSupplies!==2*counts.repair)
    throw new Error('Recorded repair costs are inconsistent');
  const restored=SimulationKernel.fromRunRecord(serviced.exportRunRecord(),kernel.plugin);
  if(restored.getStateHash()!==serviced.getStateHash())
    throw new Error('Saved service treatment differs from authoritative hash');
  for(let tick=0;tick<5;tick++){restored.step();serviced.step();}
  if(restored.getStateHash()!==serviced.getStateHash())
    throw new Error('Service run diverged after native restore and continuation');
  return {
    world:kernel.plugin.id,seed:kernel.seed,startTick:kernel.tick,initial,
    afterScience,commandCounts:counts,checkpoints,
    siteConditionGainFromPaidService:end.paidService.meanSiteCondition-end.science.meanSiteCondition,
    siteCollapseReductionFromPaidService:end.science.sitesBelow25-end.paidService.sitesBelow25,
    safeSiteGainFromScience:end.science.safeReachableSites-end.untreated.safeReachableSites,
    safeSiteGainFromService:end.paidService.safeReachableSites-end.science.safeReachableSites,
    identicalStartingHash:true,scienceArmsMatchedAtServiceStart:true,
    restoreContinuationPass:true,
    evidenceLimit:'Finite 180-tick active treatment following real native science; not a 2000-tick costed global-science equilibrium, autonomous NPC upkeep or indefinite sustainability proof.',
  };
}
