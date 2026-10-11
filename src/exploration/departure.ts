import { DISCOVERY_ORDER, ExplorationAtlas, ExplorationState } from './contracts';
import { planRoute, presentSite } from './engine';

/** A present-time preflight, never a prediction of conditions at arrival. */
export function departureBriefing(atlas:ExplorationAtlas,state:ExplorationState,siteId:string,tick:number) {
  const site=atlas.sites.find(s=>s.facts.id===siteId);
  if(!site)throw new Error('Unknown site');
  const d=state.sites[siteId];
  const blocked=(reason:string)=>({ready:false as const,reason,ticks:null,fuel:null,arrivalTick:null,passages:null});
  if(state.expedition.journey)return blocked(`Expedition committed until tick ${state.expedition.journey.arrivalTick}.`);
  if(DISCOVERY_ORDER.indexOf(d.discoveryState)<3)return blocked('Discover this contact before planning a departure.');
  if(d.hazard>70)return blocked('Local hazard exceeds the safe-access limit of 70. Repairing an installation alone does not make its surroundings safe.');
  try {
    const route=planRoute(atlas,state.expedition.regionId,site.facts.regionId,70,state.expedition.fuel,state);
    const ticks=Math.max(1,route.ticks);
    return {ready:true as const,reason:null,ticks,fuel:route.fuel,arrivalTick:tick+ticks,passages:route.routeIds.length};
  } catch(error){return blocked(error instanceof Error?error.message:String(error));}
}

/** Only revealed, prerequisite-ready sites. No hidden-name oracle and no state mutation. */
export function nearbyInvestigations(atlas:ExplorationAtlas,state:ExplorationState,tick:number) {
  if(state.expedition.journey)return [];
  return atlas.sites.flatMap(site=>{
    const d=state.sites[site.facts.id];
    if(DISCOVERY_ORDER.indexOf(d.discoveryState)<3 || d.discoveryState==='RESOLVED')return [];
    if(atlas.chains.some(chain=>{
      const index=chain.steps.findIndex(s=>s.siteId===site.facts.id);
      return index>0 && chain.steps.slice(0,index).some(s=>!state.sites[s.siteId].evidence.some(e=>e.evidenceId===s.evidenceId));
    }))return [];
    const onSite=d.firstVisitedTick!==null && state.expedition.regionId===site.facts.regionId;
    const route=onSite ? {ready:true as const,reason:null,ticks:0,fuel:0,arrivalTick:tick,passages:0} : departureBriefing(atlas,state,site.facts.id,tick);
    if(!route.ready)return [];
    return [{siteId:site.facts.id,label:presentSite(atlas,state,site.facts.id)!.label,hazard:d.hazard,onSite,...route}];
  }).sort((a,b)=>a.ticks-b.ticks||b.hazard-a.hazard||a.siteId.localeCompare(b.siteId,'en')).slice(0,4);
}
