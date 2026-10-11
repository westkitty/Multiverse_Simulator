import { restAtRefuge, refugeRestEvent } from '../../exploration/refuge';
import { expandNativeWorld } from './expandNative';
import { z } from 'zod';
import { CommandExecutionContext, DeterministicRng, EmitEventInput, WorldPlugin, roundDet } from '../../core/contracts';
import { ExplorationAtlas, ExplorationState, atlasSchema } from '../../exploration/contracts';
import { advanceExploration, applyExplorationCommand, createExplorationState, ExplorationCommand, presentSite, restoreExplorationState } from '../../exploration/engine';

interface NativeProfile {
  collection: string; condition: string; field: string; unit: string; signature: string;
  names: string[]; history: string; mode: 'field-team' | 'remote-observatory';
}
const PROFILES: Record<string, NativeProfile> = {
  ecosystem: { collection:'zones', condition:'moisture', field:'plantBiomass', unit:'kg', signature:'The Glasswater Refuge', mode:'field-team', history:'A former wetland monitoring network was abandoned during a dry period. Surviving pumps and seed stocks record the disturbance.', names:['Research camp','Rain gauge','Ranger ruin','Nesting refuge','Seed cache','Wildlife crossing','Nursery','Wetland pump','Field archive','Canopy relay','Firebreak','Glasswater station'] },
  station: { collection:'rooms',condition:'equipmentHealth',field:'pressureKpa',unit:'kPa',signature:'The Dark Habitation Ring',mode:'field-team',history:'A phased station refit left service compartments isolated. Maintenance records and atmospheric sensors preserve evidence of the shutdown.',names:['Crew refuge','Pressure sensor','Retired airlock','Crew berth','Parts locker','Bulkhead crossing','Repair workshop','Scrubber unit','Maintenance archive','Telemetry relay','Radiation shelter','Backup power bus'] },
  civilization: { collection:'settlements',condition:'stabilityIndex',field:'waterStock',unit:'units',signature:'The Abandoned River Capital',mode:'field-team',history:'A former river-trade network left cisterns, storehouses and civic records after a sequence of supply shortages.',names:['Survey camp','River gauge','Old fort','Farmstead','Granary','Trade bridge','Mason workshop','Cistern pump','Civic archive','Signal tower','Flood barrier','Mill complex'] },
  atmosphere: { collection:'cells',condition:'soilMoisturePct',field:'pressureHpa',unit:'hPa',signature:'The Station Beneath the Storm',mode:'remote-observatory',history:'A weather-monitoring campaign left instruments across a changing climate transect. Sensor readings can be compared with surviving campaign records.',names:['Weather shelter','Barometer array','Abandoned radar','Cloud sampler','Battery depot','Survey corridor','Instrument workshop','Rain collector','Climate archive','Weather relay','Flood warning post','Storm observatory'] },
  ocean: { collection:'sectors',condition:'coralBenthicHealth',field:'carbonatePh',unit:'pH',signature:'The Drowned Listening Garden',mode:'remote-observatory',history:'An oceanographic network was abandoned after low oxygen conditions and equipment degradation interrupted its survey campaign.',names:['ROV dock','Chemical sampler','Research wreck','Coral nursery','Mineral sample cache','Dive corridor','ROV workshop','Oxygenation module','Cruise archive','Acoustic relay','Contaminant trap','Listening garden'] },
  celestial: { collection:'bodies',condition:'orbitalStabilityIndex',field:'incidentFluxWm2',unit:'W/m²',signature:'The Lost Transit Observatory',mode:'remote-observatory',history:'A planetary transit campaign lost its instrument network. Surviving platforms record stellar flux and orbital stability, not an omniscient account of past orbits.',names:['Probe anchorage','Flux instrument','Probe wreck','Observation platform','Calibration cache','Survey trajectory','Probe workshop','Thermal regulator','Transit archive','Navigation beacon','Radiation shield','Transit observatory'] },
  megacity: { collection:'districts',condition:'infrastructureHealth',field:'pollutionAqi',unit:'AQI',signature:'The Blackout Quarter',mode:'field-team',history:'A previous utility failure left abandoned service infrastructure. District readings and maintenance archives can distinguish power, water and pollution pressures.',names:['Emergency shelter','Air quality mast','Closed interchange','Residential block','Utility depot','Transit crossing','Repair yard','Water pump','Municipal archive','Grid relay','Pollution barrier','District substation'] },
  industrial: { collection:'nodes',condition:'equipmentHealth',field:'outputInventory',unit:'units',signature:'The Factory Without Deliveries',mode:'field-team',history:'An interrupted delivery schedule left idle equipment and stranded stocks. Inventory and equipment telemetry preserve evidence of the interruption.',names:['Logistics camp','Inventory meter','Derelict warehouse','Crew facilities','Salvage depot','Freight crossing','Maintenance shop','Cooling pump','Shipping archive','Dispatch relay','Containment bay','Auxiliary power plant'] },
  geology: { collection:'cells',condition:'infrastructureIntegrity',field:'tectonicStressMpa',unit:'MPa',signature:'The Buried Seismic Array',mode:'remote-observatory',history:'Tectonic loading and erosion damaged an earlier monitoring installation. Exposed foundations and active sensors preserve different kinds of evidence.',names:['Geology camp','Seismic sensor','Buried mine','Field refuge','Core sample cache','Survey pass','Sensor workshop','Drainage bore','Strata archive','Telemetry tower','Slope reinforcement','Seismic array'] },
};
export interface NativeAtlasState {
  atlas: ExplorationAtlas; exploration: ExplorationState;
  regions: Array<{ id:string; position:[number,number,number]; biome:string; readings:Record<string,number>; hazard:number; production:number }>;
  atlasActors: Array<{ id:string; role:number; regionId:string; work:number; cargo:number; cargoOrigin:string|null; energy:number }>;
}
type RecordState = Record<string, any>;
const clamp = (v:number) => roundDet(Math.max(0,Math.min(100,v)),3);
const nativeObjects = (s:RecordState,p:NativeProfile):RecordState[] => s[p.collection];
function position(o:RecordState):[number,number,number] { return o.position ? [...o.position] as [number,number,number] : [o.centerX ?? o.x ?? 0, 0, o.centerZ ?? o.z ?? 0]; }
function build(plugin:WorldPlugin<any,any>, s:RecordState, rng:DeterministicRng):NativeAtlasState {
  const p=PROFILES[plugin.id], objects=nativeObjects(s,p);
  const regions=objects.map((o,i)=>({id:o.id,position:position(o),biome:o.biome??o.surfaceType??o.province??o.role??o.bodyClass??`district-${i+1}`,readings:{[p.field]:Number(o[p.field]??0)},hazard:clamp(100-Number(o[p.condition]??70)),production:0}));
  // Scientific observation links for remote domains; walkable domains use their actual native network where available.
  const nativeEdges:RecordState[] = s.hatches ?? s.routes ?? s.corridors ?? [];
  const routes:ExplorationAtlas['routes']=[];
  const regionIds=new Set(regions.map(r=>r.id));
  for(const edge of nativeEdges){
    const from=edge.roomA??edge.fromSettlementId??edge.fromNodeId??edge.fromDistrictId;
    const to=edge.roomB??edge.toSettlementId??edge.toNodeId??edge.toDistrictId;
    if(regionIds.has(from)&&regionIds.has(to)) routes.push({id:`atlas:${edge.id}`,from,to,travelTicks:2,fuel:p.mode==='remote-observatory'?0:1,blocked:!(edge.isOpen??edge.active??true)});
  }
  if(!routes.length) for(let i=0;i<regions.length;i++) {
    const o=objects[i];
    const nexts=typeof o.gridX==='number' ? objects.filter(n=>Math.abs(n.gridX-o.gridX)+Math.abs(n.gridZ-o.gridZ)===1) : objects.filter((_,j)=>j===i+1);
    for(const n of nexts) if(String(o.id)<String(n.id)||typeof o.gridX!=='number') routes.push({id:`atlas:${o.id}:${n.id}`,from:o.id,to:n.id,travelTicks:p.mode==='remote-observatory'?1:2,fuel:p.mode==='remote-observatory'?0:1,blocked:false});
  }
  const sites=Array.from({length:36},(_,i)=>{
    const r=regions[Math.floor(i*regions.length/36)],o=objects.find(n=>n.id===r.id)!;
    const perRegion=Math.ceil(36/regions.length),slot=i%perRegion;
    // Subsystem sites remain within the parent compartment/district footprint.
    const coordinates:[number,number,number]=[r.position[0]+(slot%4-1.5)*1.2,r.position[1]+.5,r.position[2]+Math.floor(slot/4)*1.2];
    return {facts:{schemaVersion:1 as const,id:`${plugin.id}:poi-${i}`,worldId:plugin.id,regionId:r.id,archetypeId:`${plugin.id}:${i%12}`,seed:rng.stream(`atlas-site-${i}`).nextInt(1,0xffffffff),coordinates,spatialBounds:{radius:.45,unit:'map-unit'},name:i===2?p.signature:`${p.names[i%12]} · ${o.label??o.name??r.id}`,description:`${p.names[i%12]} linked to ${r.id}. Measure ${p.field} and inspect the infrastructure before drawing conclusions.`,origin:p.history,formationEpoch:`Network phase ${i%3+1}`,association:p.mode==='field-team'?'Regional survey service':'Scientific instrument network',simulationDependencies:[r.id,p.field,p.condition],extensions:{signature:i===2,structureRole:i%12,evidenceQuestion:`Do changes in ${p.field} coincide with infrastructure condition at this location?`,navigationMode:p.mode}},
      initial:{condition:40+i%35,hazard:Math.min(65,r.hazard),inhabitants:[],resources:{salvage:20,supplies:30,fuel:20,reserve:40,records:1},readings:{...r.readings}},availableInteractions:['survey','discover','investigate','repair','recover','resolve','operate'] as const,
      evidence:[{id:'measurement',label:p.field,source:'reading' as const,resourceId:p.field,unit:p.unit,comparison:'atLeast' as const,threshold:-1e9},...(i%12===2?[{id:'repair-proof',label:'Restored installation',source:'condition' as const,unit:'%',comparison:'atLeast' as const,threshold:75}]:[])],
      renderPresentation:{glyph:`role-${i%12}`,silhouette:p.names[i%12]},accessibilityPresentation:{detectedLabel:`Unidentified instrument contact ${i+1}`,surveyedDescription:`Surveyed ${p.mode==='remote-observatory'?'instrument location':'structure'} in ${r.id}.`}};
  });
  const atlas=atlasSchema.parse({schemaVersion:1,worldId:plugin.id,regions:regions.map(r=>({id:r.id,label:r.biome,hazard:Math.min(65,r.hazard)})),routes,sites,chains:Array.from({length:3},(_,i)=>({id:`${plugin.id}:chain-${i}`,steps:[0,1,2].map(j=>({siteId:sites[i*12+j].facts.id,evidenceId:'measurement'}))}))});
  let exploration=createExplorationState(atlas,regions[0].id,150,80);
  exploration=applyExplorationCommand(atlas,exploration,{action:'detect',siteId:sites[0].facts.id},{tick:0,branchId:'genesis'}).state;
  return {atlas,exploration,regions,atlasActors:Array.from({length:12},(_,i)=>({id:`${plugin.id}:survey-team-${i}`,role:i%6,regionId:regions[i%regions.length].id,work:0,cargo:0,cargoOrigin:null,energy:80}))};
}
const emitEvents=(events:ReturnType<typeof advanceExploration>['events'],emit:(input:EmitEventInput)=>unknown)=>{
  for(const event of events) emit({type:`exploration.${event.action}`,title:`Site ${event.action}`,description:event.after,severity:'info',sourceSystem:'native-atlas',sourceEntityId:event.siteId,affectedEntityIds:[event.siteId],payload:event,causalLinkType:'direct',causalExplanation:'Validated site command or survey arrival.'});
};
/** Opt-in config flag is persisted. Old archives without it retain native state and replay geometry.
 * This adapter does not replace the scientific plugin or its ordered native systems. */
export function withNativeAtlas<C extends Record<string,unknown>,S extends object>(plugin:WorldPlugin<C,S>):WorldPlugin<C,S & Partial<NativeAtlasState>> {
  const profile=PROFILES[plugin.id];
  const active=(s:S & Partial<NativeAtlasState>):s is S & NativeAtlasState => !!s.atlas && !!s.exploration;
  return {
    ...plugin, version:'3.1.0',
    subtitle:`Expanded native ${profile.collection} · persistent sites and survey teams`,
    description:`New Atlas runs use three connected native extents and 36 persistent sites. Legacy model description: ${plugin.description}`,
    physicalModelDocumentation:['Atlas-enabled runs expand native territory by three. Numerical extents in the inherited model notes below describe unexpanded legacy runs.',...plugin.physicalModelDocumentation],
    scaleMetadata: plugin.scaleMetadata ? {...plugin.scaleMetadata,
      areaUnitLabel: plugin.scaleMetadata.areaUnitLabel,
      baselinePlayableArea:plugin.scaleMetadata.expandedPlayableArea,
      expandedPlayableArea:plugin.scaleMetadata.expandedPlayableArea*3,
      baselineTerritoryScalar:plugin.scaleMetadata.expandedTerritoryScalar,
      expandedTerritoryScalar:plugin.scaleMetadata.expandedTerritoryScalar*3} : undefined,
    defaultConfig:{...plugin.defaultConfig,atlasVersion:1} as C,
    scenarios:plugin.scenarios.map(s=>({...s,config:{...s.config,atlasVersion:1} as C})),
    validateConfig(raw){const parsed=plugin.validateConfig(raw);if(parsed.valid && parsed.config && raw && typeof raw==='object' && 'atlasVersion' in raw){if((raw as Record<string,unknown>).atlasVersion!==1)return {valid:false,errors:['Unsupported atlas config version']};return {...parsed,config:{...parsed.config,atlasVersion:1} as C};}return parsed;},
    initializeWorld(config,rng){const native=plugin.initializeWorld(config,rng);if(config.atlasVersion===1){expandNativeWorld(plugin,native,config,rng);return Object.assign(native,build(plugin,native,rng));}return native;},
    getSystems(){return [...plugin.getSystems(),{id:'native-atlas',name:'Sites and instrument teams',order:100,step(ctx){
      const s=ctx.state;if(!active(s))return;
      const objects=nativeObjects(s,profile);
      const nativeEdges:RecordState[]=(s as RecordState).hatches??(s as RecordState).routes??(s as RecordState).corridors??[];
      for(const edge of nativeEdges) { const id=`atlas:${edge.id}`; if(Object.hasOwn(s.exploration.blockedRoutes,id))s.exploration.blockedRoutes[id]=!(edge.isOpen??edge.active??true); }
      for(const region of s.regions){const obj=objects.find(o=>o.id===region.id);if(!obj)continue;region.readings={[profile.field]:Number(obj[profile.field]??0)};region.hazard=clamp(100-Number(obj[profile.condition]??70));s.exploration.regionHazards[region.id]=region.hazard;}
      for(const site of s.atlas.sites){const delta=s.exploration.sites[site.facts.id],region=s.regions.find(r=>r.id===site.facts.regionId)!;
        delta.readings={...region.readings};delta.mitigation=clamp(delta.mitigation-.01);delta.hazard=clamp(region.hazard-delta.mitigation);delta.condition=clamp(delta.condition-.002-region.hazard*.001);
        const role=Number(site.facts.extensions.structureRole);
        if(role===0)delta.resources.supplies=roundDet(Math.min(100,delta.resources.supplies+delta.condition*.002),3);
        if(role===4)delta.resources.salvage=roundDet(Math.min(100,delta.resources.salvage+.01),3);
        if(role===11)delta.resources.fuel=roundDet(Math.min(100,delta.resources.fuel+delta.condition*.001),3);
      }
      for(const actor of s.atlasActors){
        const location=s.atlas.sites.find(site=>site.facts.regionId===actor.regionId),site=location?s.exploration.sites[location.facts.id]:null;
        actor.energy=clamp(actor.energy-.08);
        if(site){
          if(actor.energy<20&&site.resources.supplies>=1){site.resources.supplies--;actor.energy=clamp(actor.energy+20);}
          if(actor.energy===0)continue;
          if(actor.role===0&&site.resources.supplies>1){site.resources.supplies-=.05;actor.work++;}
          if(actor.role===1&&site.discoveryState==='UNKNOWN'){site.discoveryState='DETECTED';actor.work++;}
          if(actor.role===2&&site.resources.salvage>.1){site.resources.salvage=roundDet(site.resources.salvage-.1,3);site.condition=clamp(site.condition+.08);actor.work++;}
          if(actor.role===3){if(actor.cargo===0&&site.resources.supplies>=1){site.resources.supplies--;actor.cargo=1;actor.cargoOrigin=actor.regionId;}else if(actor.cargo&&actor.cargoOrigin!==actor.regionId){site.resources.supplies+=actor.cargo;actor.cargo=0;actor.cargoOrigin=null;actor.work++;}}
          if(actor.role===4&&site.resources.salvage>=1){site.resources.salvage--;site.condition=clamp(site.condition+.2);actor.work++;}
          if(actor.role===5){site.hazard=clamp(site.hazard-.1);actor.work++;}
        }
        if(ctx.tick%(4+actor.role)===0){const routes=s.atlas.routes.filter(r=>!s.exploration.blockedRoutes[r.id]&&(r.from===actor.regionId||r.to===actor.regionId));if(routes.length){const edge=routes[(ctx.tick+actor.role)%routes.length];actor.regionId=edge.from===actor.regionId?edge.to:edge.from;}}
      }
      for(const site of s.atlas.sites)s.exploration.sites[site.facts.id].inhabitants=s.atlasActors.filter(a=>a.regionId===site.facts.regionId).map(a=>a.id);
      const result=advanceExploration(s.atlas,s.exploration,{tick:ctx.tick,branchId:ctx.runId});s.exploration=result.state;emitEvents(result.events,ctx.emitEvent);
    }}];},
    applyCommand(s,command,ctx:CommandExecutionContext<C>){
      if(!command.type.startsWith('exploration.')&&!command.type.startsWith('expedition.')){plugin.applyCommand(s,command,ctx);return;}
      if(!active(s))throw new Error('This legacy run has no exploration state. Create a new run to use the Atlas.');
      if(command.type==='expedition.rest'){ctx.emitEvent(refugeRestEvent(restAtRefuge(s,command.payload.siteId)));return;}
      if(command.type==='expedition.resupply'){
        if(s.exploration.expedition.journey)throw new Error('Cannot resupply in transit');
        const local=s.atlas.sites.find(x=>x.facts.regionId===s.exploration.expedition.regionId&&s.exploration.sites[x.facts.id].firstVisitedTick!==null);
        if(!local)throw new Error('Visit a local site first');const d=s.exploration.sites[local.facts.id],supply=Math.min(10,d.resources.supplies),fuel=Math.min(10,d.resources.fuel);
        if(supply+fuel===0)throw new Error('Supplies depleted');d.resources.supplies-=supply;d.resources.fuel-=fuel;s.exploration.expedition.supplies+=supply;s.exploration.expedition.fuel+=fuel;
        ctx.emitEvent({type:command.type,title:'Local stocks transferred',description:`${supply} supplies and ${fuel} fuel transferred.`,severity:'info',sourceSystem:'native-atlas',sourceEntityId:local.facts.id});return;
      }
      if(command.type!=='exploration.action')throw new Error('Unknown exploration command');
      const result=applyExplorationCommand(s.atlas,s.exploration,command.payload as ExplorationCommand,{tick:ctx.tick,branchId:ctx.runId});
      // Repairs restore local installations, not stars or climate cells. Native telemetry drives their wear.
      // Domain-changing scientific interventions remain the original plugin's validated controls.
      s.exploration=result.state;
      if(command.payload.action==='operate'){
        const site=s.atlas.sites.find(x=>x.facts.id===command.payload.siteId)!;
        const role=Number(site.facts.extensions.structureRole), object=nativeObjects(s,profile).find(o=>o.id===site.facts.regionId)!;
        if(role===5){const edge=((s as RecordState).hatches??(s as RecordState).routes??(s as RecordState).corridors??[]).find((e:RecordState)=>s.exploration.blockedRoutes[`atlas:${e.id}`]===false&&(e.roomA===object.id||e.roomB===object.id||e.fromSettlementId===object.id||e.toSettlementId===object.id||e.fromDistrictId===object.id||e.toDistrictId===object.id||e.fromNodeId===object.id||e.toNodeId===object.id));if(edge){if('isOpen'in edge)edge.isOpen=true;else edge.active=true;}}
        if(role===7){
          if(plugin.id==='ecosystem')object.moisture=clamp(object.moisture+2);
          if(plugin.id==='station')object.equipmentHealth=clamp(object.equipmentHealth+5);
          if(plugin.id==='civilization')object.waterStock=roundDet(Math.min(object.storageCapacity,object.waterStock+5),3);
          if(plugin.id==='atmosphere')object.soilMoisturePct=clamp(object.soilMoisturePct+2);
          if(plugin.id==='ocean')object.epipelagic.dissolvedOxygenMgL=roundDet(Math.min(14,object.epipelagic.dissolvedOxygenMgL+.2),3);
          if(plugin.id==='celestial')object.greenhouseOpticalDepth=roundDet(Math.max(0,object.greenhouseOpticalDepth-.05),3);
          if(plugin.id==='megacity')object.infrastructureHealth=clamp(object.infrastructureHealth+5);
          if(plugin.id==='industrial')object.equipmentHealth=clamp(object.equipmentHealth+5);
          if(plugin.id==='geology')object.structuralReinforcement=clamp(object.structuralReinforcement+2);
        }
      }
      emitEvents(result.events,ctx.emitEvent);
    },
    serializeState(s){const raw=plugin.serializeState(s);if(active(s)){Object.assign(raw,JSON.parse(JSON.stringify({atlas:s.atlas,exploration:s.exploration,regions:s.regions,atlasActors:s.atlasActors})));}return raw;},
    restoreState(raw){const s=plugin.restoreState(raw);if(raw.atlas!==undefined){const atlas=atlasSchema.parse(raw.atlas);if(atlas.worldId!==plugin.id)throw new Error('Atlas world mismatch');const exploration=restoreExplorationState(atlas,raw.exploration);
      const regions=z.array(z.object({id:z.string(),position:z.tuple([z.number().finite(),z.number().finite(),z.number().finite()]),biome:z.string(),readings:z.record(z.number().finite()),hazard:z.number().finite(),production:z.number().finite()})).parse(raw.regions);
      const atlasActors=z.array(z.object({id:z.string(),role:z.number().int().min(0).max(5),regionId:z.string(),work:z.number().nonnegative(),cargo:z.number().nonnegative(),cargoOrigin:z.string().nullable(),energy:z.number().min(0).max(100)})).parse(raw.atlasActors);
      if(atlasActors.some(a=>!regions.some(r=>r.id===a.regionId)))throw new Error('Actor region missing');Object.assign(s,{atlas,exploration,regions,atlasActors});}return s;},
    inspectEntities(s,c){
      const native=plugin.inspectEntities(s,c);if(!active(s))return native;
      return [...native,...s.atlasActors.map(a=>({entityId:a.id,kind:'survey-team',label:`${['Field support','Survey team','Maintenance team','Supply courier','Construction team','Risk assessors'][a.role]} ${a.id}`,position:s.regions.find(r=>r.id===a.regionId)!.position,status:'nominal' as const,summary:`${a.work} completed tasks; carrying ${a.cargo} supply units.`,properties:[{key:'energy',label:'Energy',value:a.energy,unit:'%'}]})),
      ...s.atlas.sites.flatMap(site=>{const view=presentSite(s.atlas,s.exploration,site.facts.id);return view?[{entityId:site.facts.id,kind:'discovery-site',label:view.label,position:site.facts.coordinates,status:'nominal' as const,summary:view.description,properties:[{key:'discovery',label:'Discovery',value:view.discoveryState}]}]:[];})];
    },
    extractRenderFrame(s,c,runId,tick){const frame=plugin.extractRenderFrame(s,c,runId,tick);if(active(s))for(const a of s.atlasActors)frame.entities.push({id:a.id,kind:'survey-team',label:`Survey team role ${a.role+1}`,position:s.regions.find(r=>r.id===a.regionId)!.position,scale:[.5,1,.5],color:'#e2e8f0',energyOrHealth:a.energy,status:'nominal'});if(active(s))for(const site of s.atlas.sites){const view=presentSite(s.atlas,s.exploration,site.facts.id);if(view)frame.entities.push({id:site.facts.id,kind:'discovery-site',label:view.label,position:site.facts.coordinates,scale:[.6,1+s.exploration.sites[site.facts.id].condition/50,.6],color:plugin.accentColor,energyOrHealth:s.exploration.sites[site.facts.id].condition,status:'nominal'});}return frame;},
  };
}
