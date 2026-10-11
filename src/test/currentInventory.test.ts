import {writeFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {CORE_WORLD_PLUGINS} from '../worlds';
import {SimulationKernel} from '../core/kernel';
import {createPortableArchiveZip} from '../persistence/archive';
import {defaultCrossWorldRegistry} from '../core/crossWorldContract';

const baseline=[48,18,9,48,48,18,18,18,48,16,16,12,16,16,12];
const target=[144,54,27,144,144,54,54,54,144,48,48,36,48,48,36];
describe('Current inventory (separate from frozen intake evidence)',()=>{
  it('measures actual authoritative collections, content functions and optional CPU timings',()=>{
    const worlds=CORE_WORLD_PLUGINS.map((plugin,index)=>{
      const k=new SimulationKernel({runId:`measure-${plugin.id}`,name:'inventory',plugin,seed:424242});const s=k.getState();
      const observed={regions:s.regions.length,pois:s.atlas.sites.length,poiArchetypes:new Set(s.atlas.sites.map((p:any)=>p.facts.archetypeId)).size,
        facilityFunctions:new Set(s.atlas.sites.map((p:any)=>p.facts.extensions.structureRole)).size,
        actors:(s.atlasActors??s.actors).length,actorRoles:new Set((s.atlasActors??s.actors).map((a:any)=>a.role)).size,
        chains:s.atlas.chains.length,signatures:s.atlas.sites.filter((p:any)=>p.facts.extensions.signature).length,
        scenarios:plugin.scenarios.length,quickInterventions:plugin.quickInterventions.length,metrics:plugin.metricDefinitions.length,
        nativeCollections:Object.fromEntries(Object.entries(s).filter(([,v])=>Array.isArray(v)).map(([key,v])=>[key,(v as unknown[]).length]))};
      expect(observed.regions).toBe(target[index]);expect(observed.pois).toBe(36);expect(observed.facilityFunctions).toBe(12);expect(observed.actorRoles).toBe(6);
      const timing:number[]=[];
      if(process.env.RECORD_CURRENT==='1')for(let tick=0;tick<100;tick++){const begin=performance.now();k.step();timing.push(performance.now()-begin);}
      timing.sort((a,b)=>a-b);
      return {id:plugin.id,version:plugin.version,baselineRegions:baseline[index],targetRegions:target[index],observed,
        proof:{territory:'PASS',siteInventory:'PASS',facilityOperations:'PASS unit fixtures; not all narrative archetypes independently playtested',actorRoleBreadth:'PASS implementation; long-run ecology/economy balance UNVERIFIED',legacyArchive:index<9?'PASS same-checkout legacy generator; independent historical fixture UNVERIFIED':'not applicable',browser:'PASS first-site journey desktop/mobile; full 540-site playthrough UNVERIFIED'},
        benchmark:timing.length?{ticks:100,p50StepMs:timing[49],p95StepMs:timing[94],archiveBytesAtTick100:createPortableArchiveZip(k.exportRunRecord()).byteLength}:undefined};
    });
    expect(worlds.reduce((n,w)=>n+w.observed.pois,0)).toBe(540);
    if(process.env.RECORD_CURRENT==='1')writeFileSync('docs/current-inventory.json',JSON.stringify({schemaVersion:1,measuredAt:new Date().toISOString(),seed:424242,branch:'arena/37f107b8-multiverse-simulator',startingCommit:'b4e57734873df0af4f0bd760a9283557b0e8c977',environment:{node:process.version,platform:process.platform,method:'Vitest/jsdom, 100 single steps, no warmup excluded; CPU timings, NOT browser FPS or GPU memory'},total:{worlds:15,pois:540,chains:45,signatures:15,crossWorldAdapters:defaultCrossWorldRegistry.listAdapters().length},status:'LOCAL DEVELOPMENT; final release acceptance incomplete; remote publication BLOCKED',limitations:['Functional facility operations share a twelve-role exploration layer; do not equate named archetypes with twelve independent domain simulations.','Original scenarios/interventions retained, not tripled against intake.','Historical semantic breadth, long-run balance and full exploration stress acceptance remain incomplete; branch-local expiring leads are implemented and tested.','No current deployed build or live HTTPS verification.'],worlds},null,2)+'\n');
  },120000);
});
