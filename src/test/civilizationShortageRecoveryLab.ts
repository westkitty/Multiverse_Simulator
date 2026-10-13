import { SimulationKernel } from '../core/kernel';
import { inspectNativeRecoveryAccess } from './nativeScientificAccessLab';

/**
 * Independent replayable interventions for an actual civilization that reached
 * tick 2005 through the default-stock 36-site expedition and idle continuation.
 * No fabricated interventions, mutated state fixtures or altered world defaults.
 */
const RECOVERY_POLICIES = [
  { id:'jubilee-only', commands:[
    { tick:0, id:'civ-civic-festival-stabilization' },
    { tick:1, id:'civ-civic-festival-stabilization' },
  ]},
  { id:'famine-relief-plus-jubilee', commands:[
    { tick:0, id:'civ-grand-famine-relief' },
    { tick:1, id:'civ-civic-festival-stabilization' },
  ]},
  { id:'production-structure-only', commands:[
    { tick:0, id:'civ-build-water' },
    { tick:1, id:'civ-expand-food' },
    { tick:2, id:'civ-agronomy-soil-enrichment' },
  ]},
  { id:'relief-to-production-bridge', commands:[
    { tick:0, id:'civ-grand-famine-relief' },
    { tick:1, id:'civ-build-water' },
    { tick:2, id:'civ-expand-food' },
    { tick:3, id:'civ-agronomy-soil-enrichment' },
    { tick:4, id:'civ-civic-festival-stabilization' },
  ]},
  { id:'ongoing-free-relief-positive-control', commands:[
    { tick:0, id:'civ-grand-famine-relief' },
    { tick:30, id:'civ-grand-famine-relief' },
    { tick:60, id:'civ-grand-famine-relief' },
    { tick:90, id:'civ-grand-famine-relief' },
  ]},
] as const;

interface ConditionMeasure {
  tick: number;
  safeSites: number;
  unsafeSites: number;
  meanRegionHazard: number;
  meanSiteCondition: number;
  meanStability: number;
  meanPopulation: number;
  settlementShortages: number;
  totalFood: number;
  totalWater: number;
  totalMaterials: number;
  meanFoodProduction: number;
  meanFoodConsumption: number;
  meanWaterProduction: number;
  meanWaterConsumption: number;
}
function measure(kernel: SimulationKernel<any,any>): ConditionMeasure {
  const world = kernel.getState();
  const places = world.settlements as Array<any>;
  if (!places?.length) throw new Error('Civilization settlements absent from native state');
  const average = (field: string) =>
    places.reduce((sum,place)=>sum+Number(place[field]),0)/places.length;
  const total = (field: string) =>
    places.reduce((sum,place)=>sum+Number(place[field]),0);
  const access = inspectNativeRecoveryAccess(kernel);
  return {
    tick:kernel.tick,
    safeSites:access.safelyReachableSites,
    unsafeSites:access.unsafeSiteTargets,
    meanRegionHazard:access.meanRegionHazard,
    meanSiteCondition:access.meanSiteCondition,
    meanStability:average('stabilityIndex'),
    meanPopulation:average('population'),
    settlementShortages:places.filter(place=>place.shortageStreakTicks>0).length,
    totalFood:total('foodStock'), totalWater:total('waterStock'),
    totalMaterials:total('materialsStock'),
    meanFoodProduction:average('lastFoodProduction'),
    meanFoodConsumption:average('lastFoodConsumption'),
    meanWaterProduction:average('lastWaterProduction'),
    meanWaterConsumption:average('lastWaterConsumption'),
  };
}
export function probeCivilizationShortageRecovery(exhaustedKernel: SimulationKernel<any,any>) {
  if (exhaustedKernel.plugin.id!=='civilization' || exhaustedKernel.tick<2000)
    throw new Error('Requires post-collapse Civilization authoritative checkpoint');
  const plugin = exhaustedKernel.plugin;
  const saved = exhaustedKernel.exportRunRecord();
  const baselineHash = exhaustedKernel.getStateHash();
  const original = measure(exhaustedKernel);
  const results = RECOVERY_POLICIES.map(policy=>{
    const control=SimulationKernel.fromRunRecord(saved,plugin);
    const treatment=SimulationKernel.fromRunRecord(saved,plugin);
    if(control.getStateHash()!==baselineHash || treatment.getStateHash()!==baselineHash)
      throw new Error('Treatment and control must share full source state and RNG');
    const samples:Record<string, {control:ConditionMeasure; treatment:ConditionMeasure}> = {};
    let commandsAccepted=0;
    for(let offset=0;offset<120;offset++){
      for(const item of policy.commands){
        if(item.tick!==offset)continue;
        const action=plugin.quickInterventions.find(d=>d.id===item.id);
        if(!action)throw new Error('Missing plugin-authored control '+item.id);
        const eventsBefore=new Set(treatment.getEvents().map(event=>event.id));
        const cmd=treatment.enqueueCommand({
          type:action.commandType,label:action.label,payload:action.defaultPayload,
        });
        const applied=treatment.flushCurrentTickCommands();
        if(!applied.some(c=>c.id===cmd.id) ||
          !treatment.getEvents().some(e=>!eventsBefore.has(e.id) && e.type==='command:'+action.commandType)){
          throw new Error('Unconfirmed native command '+item.id);
        }
        commandsAccepted++;
      }
      control.step();
      treatment.step();
      const steps=offset+1;
      if(steps===6 || steps===30 || steps===120) {
        samples[String(steps)]={control:measure(control),treatment:measure(treatment)};
      }
    }
    const restored=SimulationKernel.fromRunRecord(treatment.exportRunRecord(),plugin);
    if(restored.getStateHash()!==treatment.getStateHash())
      throw new Error('Recovery protocol failed authoritative save/restore hash');
    for(let tick=0;tick<5;tick++){restored.step();treatment.step();}
    if(restored.getStateHash()!==treatment.getStateHash())
      throw new Error('Restored recovery diverged in deterministic continuation');
    const sample=samples['120'];
    return {
      policy:policy.id,commandsAccepted,plannedCommands:policy.commands.length,
      commands:policy.commands.map(c=>c.id),
      sourceHashIdentical:true,
      restoreContinuationPass:true,
      at6:samples['6'],at30:samples['30'],at120:sample,
      safeSiteGain:sample.treatment.safeSites-sample.control.safeSites,
      finalStabilityGain:Math.round((sample.treatment.meanStability-sample.control.meanStability)*1000)/1000,
      finalFoodGain:Math.round((sample.treatment.totalFood-sample.control.totalFood)*1000)/1000,
      finalWaterGain:Math.round((sample.treatment.totalWater-sample.control.totalWater)*1000)/1000,
    };
  });
  return {
    world:plugin.id,seed:exhaustedKernel.seed,startTick:exhaustedKernel.tick,
    initial:original,policies:results,
    method:'Five paired immutable-run-record policies, 120 full native ticks, fixed seeds and original production commands. Free-airlift control is explicitly NON-ECONOMIC. No domain state surgery, RNG changes, save changes or relaxed safety gates.',
  };
}
