import { DISCOVERY_ORDER, ExplorationAtlas, ExplorationState } from './contracts';

/** Derived, branch-local hints. Never reveals an unknown site's history or advances discovery. */
export function curiosityLeads(atlas:ExplorationAtlas,state:ExplorationState,tick:number) {
  return atlas.sites.flatMap(site=>{
    const delta=state.sites[site.facts.id];
    if(DISCOVERY_ORDER.indexOf(delta.discoveryState)<2||delta.discoveryState==='RESOLVED')return [];
    const lastObservation=Math.max(0,delta.firstVisitedTick??0,...delta.evidence.map(e=>e.tick),...state.journal.filter(e=>e.siteId===site.facts.id).map(e=>e.tick));
    const expiresAt=lastObservation+48;if(tick>expiresAt)return [];
    const reason=delta.condition<45?'degraded infrastructure':delta.hazard>55?'elevated local hazard':delta.evidence.length?'unfinished evidence chain':null;
    if(!reason)return [];
    return [{siteId:site.facts.id,reason,expiresAt,
      hypothesis:`Check whether the measured environment and ${reason} share a cause; correlation alone is not proof.`,
      evidence:delta.evidence.map(e=>({id:e.evidenceId,value:e.value,unit:e.unit,tick:e.tick,classification:e.classification})),
      confidence:delta.evidence.length?'measurement available':'survey signal only',
      priority:100-delta.condition+delta.hazard}];
  }).sort((a,b)=>b.priority-a.priority||a.siteId.localeCompare(b.siteId,'en')).slice(0,6);
}
