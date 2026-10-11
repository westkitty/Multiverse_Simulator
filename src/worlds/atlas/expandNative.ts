import { DeterministicRng, WorldPlugin } from '../../core/contracts';
import { SeededRng } from '../../core/rng';
import { FRONTIER_SITES } from '../civilization/civilizationPlugin';

type State = Record<string, any>;
const clone = <T>(v:T):T => JSON.parse(JSON.stringify(v)) as T;
/** Adds two connected, fully modelled extensions, preserving original IDs and indices.
 * Runs without atlasVersion retain the exact legacy extent. The native systems operate on
 * all added cells/compartments/nodes, not independent hidden copies of a simulation. */
export function expandNativeWorld<C extends Record<string,unknown>,S extends object>(plugin:WorldPlugin<C,S>, state:S, config:C, rng:DeterministicRng):void {
  const s=state as State;
  const collection:Record<string,string>={ecosystem:'zones',station:'rooms',civilization:'settlements',atmosphere:'cells',ocean:'sectors',celestial:'systems',megacity:'districts',industrial:'nodes',geology:'cells'};
  const key=collection[plugin.id], original:State[]=clone(s[key]);
  const linksKey=plugin.id==='station'?'hatches':plugin.id==='megacity'?'corridors':(plugin.id==='civilization'||plugin.id==='industrial')?'routes':null;
  const oldLinks:State[]=linksKey?clone(s[linksKey]):[];
  const originalsBodies:State[]=plugin.id==='celestial'?clone(s.bodies):[];
  for(let extension=1;extension<=2;extension++) {
    const suffix=`-extension-${extension}`;
    const generated=plugin.initializeWorld(config,new SeededRng(rng.stream(`extent:${extension}`).nextInt(1,0xffffffff))) as State;
    const newObjects:State[]=generated[key];
    const idMap=new Map(original.map(o=>[o.id,`${o.id}${suffix}`]));
    for(let i=0;i<newObjects.length;i++) {
      const o=clone(newObjects[i]);o.id=idMap.get(original[i].id);if(o.name)o.name+=` · Extension ${extension+1}`;if(o.label)o.label+=` · Extension ${extension+1}`;
      if(typeof o.gridZ==='number'){o.gridZ+=extension*(plugin.id==='megacity'?3:6);if(typeof o.centerZ==='number')o.centerZ+=extension*72;}
      if(o.position)o.position[2]+=extension*(plugin.id==='megacity'?54:plugin.id==='station'?72:96);
      if(o.centerOffset)o.centerOffset[0]+=extension*128;
      s[key].push(o);
    }
    if(linksKey)for(const source of oldLinks){const edge=clone(source);edge.id+=suffix;for(const field of ['roomA','roomB','fromSettlementId','toSettlementId','fromDistrictId','toDistrictId','fromNodeId','toNodeId'])if(edge[field])edge[field]=idMap.get(edge[field]);s[linksKey].push(edge);}
    if(plugin.id==='celestial')for(const source of originalsBodies){const body=clone(source);body.id+=suffix;body.name+=` · Extension ${extension+1}`;body.systemId=idMap.get(source.systemId);body.x+=extension*128;body.prevX+=extension*128;s.bodies.push(body);}
  }
  // Physical cross-extension links join the new regional networks.
  for(let extension=1;extension<=2;extension++) {
    const suffix=`-extension-${extension}`,prev=extension===1?'':`-extension-${extension-1}`;
    if(plugin.id==='station')s.hatches.push({id:`hatch-spine-${extension}`,label:`Spine pressure connection ${extension}`,roomA:`room-robotics${prev}`,roomB:`room-bridge${suffix}`,isOpen:true,lastFlowMoles:0});
    if(plugin.id==='civilization')s.routes.push({id:`trade-spine-${extension}`,fromSettlementId:`${original.at(-1)!.id}${prev}`,toSettlementId:`${original[0].id}${suffix}`,capacityPerTick:25,lastTransferredAmount:0,active:true});
    if(plugin.id==='megacity')for(let col=0;col<6;col++)s.corridors.push({id:`city-spine-${extension}-${col}`,fromDistrictId:`${original[12+col].id}${prev}`,toDistrictId:`${original[col].id}${suffix}`,transitCapacityK:95,commuterFlowK:0,congestionRatio:0,active:true});
    if(plugin.id==='industrial'){
      const source=original.find(o=>o.tierIndex===2)!,target=original.find(o=>o.tierIndex===3)!;
      for(const [a,b] of [[prev,suffix],[suffix,prev]])s.routes.push({id:`industrial-spine-${extension}-${a||'core'}`,fromNodeId:source.id+a,toNodeId:target.id+b,commodity:source.producesCommodity,maxCapacityPerTick:20,currentFlowUnits:0,congestionRatio:0,deliveryDelayTicks:4,active:true});
    }
  }
  if(plugin.id==='civilization')s.frontierSites=Array.from({length:3},(_,i)=>FRONTIER_SITES.map(f=>({...clone(f),id:i?`${f.id}-extension-${i}`:f.id,name:i?`${f.name} · Extension ${i+1}`:f.name,position:[f.position[0],f.position[1],f.position[2]+i*96]}))).flat();
  if(plugin.id==='megacity'){s.powerPlantCapacityMw*=3;s.waterWorksCapacityMld*=3;s.wasteProcessingCapacityTons*=3;}
  if(plugin.id==='industrial')s.gridPowerAvailableMw*=3;
  // Configured actor counts are not silently tripled. Spread them through the enlarged habitat.
  if(plugin.id==='ecosystem')s.organisms.forEach((o:State,i:number)=>{o.z+=i%3*72;o.prevZ=o.z;});
  if(plugin.id==='ocean')s.shoals.forEach((o:State,i:number)=>{o.z+=i%3*72;o.prevZ=o.z;});
  if(plugin.id==='station'){s.crew.forEach((o:State,i:number)=>{if(i%3)o.roomId+=`-extension-${i%3}`;});s.o2ReserveMoles*=3;s.n2ReserveMoles*=3;s.sparePartsUnits*=3;}
}
