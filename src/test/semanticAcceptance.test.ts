import {describe,it,expect} from 'vitest';
import {writeFileSync} from 'node:fs';
import {CORE_WORLD_PLUGINS} from '../worlds';
import {SimulationKernel} from '../core/kernel';
import {refugeRoster} from '../exploration/refuge';
import {fieldInterventions} from '../exploration/nativeFieldExperiments';

describe.runIf(process.env.RUN_SEMANTIC_ACCEPTANCE==='1')('Semantic content acceptance (not name counts)',()=>{
 it('requires supply camp and refuge to have different functional effects, not different transfer amounts',()=>{
  const results=CORE_WORLD_PLUGINS.map(plugin=>{
   const k=new SimulationKernel({runId:'semantic',name:'semantic',plugin,seed:2026}),s=k.getState();
   const effects=[0,3].map(role=>{
    const kernel=new SimulationKernel({runId:`semantic-${role}`,name:'controlled operation fixture',plugin,seed:2026});
    const fixture=kernel.getState(),site=fixture.atlas.sites[role],d=fixture.exploration.sites[site.facts.id];
    fixture.exploration.expedition.regionId=site.facts.regionId;d.discoveryState='VISITED';d.firstVisitedTick=0;d.condition=50;
    // Explicit fixture placement, not an expedition claim. Exercise the production command bus.
    const actor=(fixture.atlasActors??fixture.actors)[0];actor.energy=10;
    if(fixture.atlasActors)actor.regionId=site.facts.regionId;
    else actor.region=fixture.regions.findIndex((r:any)=>r.id===site.facts.regionId);
    const before=structuredClone(fixture.exploration),resources={...d.resources};
    const energy=refugeRoster(fixture).reduce((n,a)=>n+a.energy,0);
    kernel.enqueueCommand({type:role===3?'expedition.rest':'exploration.action',label:'facility operation',payload:role===3?{siteId:site.facts.id}:{action:'operate',siteId:site.facts.id}});
    kernel.flushCurrentTickCommands();
    const result=fixture.exploration,delta=result.sites[site.facts.id];
    // Normalize quantity; an energy effect must exist in real actors, not an output counter.
    const signature={supplies:Math.sign(result.expedition.supplies-before.expedition.supplies),fuel:Math.sign(result.expedition.fuel-before.expedition.fuel),condition:Math.sign(delta.condition-50),hazard:Math.sign(delta.hazard-before.sites[site.facts.id].hazard),resources:Object.fromEntries(Object.keys(resources).sort().map(key=>[key,Math.sign(delta.resources[key]-resources[key])])),cargo:result.expedition.cargo,actorEnergy:Math.sign(refugeRoster(fixture).reduce((n,a)=>n+a.energy,0)-energy)};
    return {role,name:site.facts.name,signature};
   });
   return {world:plugin.id,status:JSON.stringify(effects[0].signature)===JSON.stringify(effects[1].signature)?'FAIL':'PASS',effects,historyTemplates:new Set(s.atlas.sites.map((site:any)=>site.facts.origin)).size,chains:s.atlas.chains.length,sites:s.atlas.sites.length};
  });
  writeFileSync('docs/acceptance/semantic-results.json',JSON.stringify({schemaVersion:1,criterion:'Production camp operate and refuge rest commands must have different functional effects; legacy refuge operate is retained for replay, not presented as the current service. This is a necessary check, not sufficient certification of semantic breadth.',results},null,2)+'\n');
  expect(results.filter(r=>r.status==='FAIL').map(r=>r.world)).toEqual([]);
 });

 it('audits controlled native command outcomes rather than counting names or objects',()=>{
  const results=CORE_WORLD_PLUGINS.map(plugin=>{
   const scenario=plugin.scenarios[0];
   const options={runId:'paired-semantic-evaluation',name:'matched behavior audit',plugin,seed:scenario.seed,config:scenario.config};
   const untreated=new SimulationKernel(options);
   const treated=new SimulationKernel(options);
   // Same run ID, seed, config, kernel build and starting tick. One treatment command.
   expect(treated.getStateHash(),plugin.id+' baseline identity').toBe(untreated.getStateHash());
   const descriptor=fieldInterventions(plugin.id,plugin.quickInterventions)[0];
   expect(descriptor,plugin.id+' authored command source').toBeDefined();
   treated.enqueueCommand({type:descriptor.commandType,label:descriptor.label,payload:descriptor.defaultPayload});
   treated.flushCurrentTickCommands();
   const accepted=treated.getEvents().some(event=>event.type==='command:'+descriptor.commandType);
   for(let tick=0;tick<4;tick++){untreated.step();treated.step();}
   const control=untreated.getLatestMetrics(),experimental=treated.getLatestMetrics();
   const differences=plugin.metricDefinitions.flatMap(metric=>{
    const before=control[metric.id],after=experimental[metric.id];
    if(!Number.isFinite(before)||!Number.isFinite(after)||Math.abs(after-before)<=.000001)return [];
    return [{id:metric.id,unit:metric.unit,control:before,treatment:after,delta:Math.round((after-before)*1000000)/1000000}];
   });
   return {world:plugin.id,command:descriptor.commandType,interventionId:descriptor.id,accepted,
     changedMetricCount:differences.length,differences};
  });
  const coverage=results.filter(item=>item.accepted && item.changedMetricCount>0).length;
  const report={schemaVersion:1,method:'Matched four-tick deterministic paired runs, same world/seed/config and run ID; only treatment receives one pre-existing world-native command. Count numeric metric differences over 1e-6, not labels, props, scenario descriptions or metadata. These are measured functional responses, not proof of 3x semantic content or novel authored stories.',worldsTested:results.length,worldsWithMeasuredResponse:coverage,results};
  writeFileSync('docs/acceptance/native-field-variety.json',JSON.stringify(report,null,2)+'\n');
  console.log('Controlled native field response coverage:',coverage+'/'+results.length,
    results.map(item=>item.world+':'+item.changedMetricCount).join(' '));
  expect(results.filter(item=>!item.accepted).map(item=>item.world)).toEqual([]);
  expect(results.filter(item=>item.changedMetricCount===0).map(item=>item.world)).toEqual([]);
 });
});
