import { roundDet } from '../core/contracts';
import { ExplorationAtlas, ExplorationState } from './contracts';

export interface RefugeWorld {
  atlas: ExplorationAtlas;
  exploration: ExplorationState;
  regions: ReadonlyArray<{id: string}>;
  atlasActors?: Array<{id: string; regionId: string; energy: number}>;
  actors?: Array<{id: string; region: number; energy: number}>;
}

/** Read-only projection; IDs/energy come from real authoritative actors, not site labels. */
export function refugeRoster(world: RefugeWorld) {
  return world.atlasActors?.map(a => ({id:a.id,regionId:a.regionId,energy:a.energy}))
    ?? world.actors?.map(a => ({id:a.id,regionId:world.regions[a.region].id,energy:a.energy})) ?? [];
}

/** Two supply units at most, twenty energy per unit, distributed deterministically.
 * No new state fields and no changes to historical `operate` command semantics. */
export function planRefugeRest(world: RefugeWorld, siteId: unknown) {
  const site=world.atlas.sites.find(s=>s.facts.id===siteId);
  if(!site || Number(site.facts.extensions.structureRole)!==3)throw new Error('Select a refuge installation');
  if(!site.availableInteractions.includes('operate'))throw new Error('Refuge service unavailable at this site');
  const e=world.exploration, d=e.sites[site.facts.id];
  if(e.expedition.journey)throw new Error('Cannot service teams while the expedition is in transit');
  if(e.expedition.regionId!==site.facts.regionId || d.firstVisitedTick===null)throw new Error('Visit this refuge first');
  if(d.condition<30)throw new Error('Repair this refuge to at least 30%');
  const roster=refugeRoster(world);
  if(new Set(roster.map(a=>a.id)).size!==roster.length)throw new Error('Duplicate team identity');
  const crew=roster.filter(a=>a.regionId===site.facts.regionId && a.energy<100)
    .sort((a,b)=>a.id.localeCompare(b.id,'en'));
  if(!crew.length)throw new Error('No tired teams are present at this refuge');
  let budget=Math.min(40,(d.resources.supplies??0)*20);
  const changes=crew.flatMap(a=>{
    const restored=roundDet(Math.min(100-a.energy,budget),3);
    if(restored<=0)return [];
    budget=roundDet(budget-restored,3);
    return [{id:a.id,before:a.energy,after:roundDet(a.energy+restored,3),restored}];
  });
  const restored=roundDet(changes.reduce((n,a)=>n+a.restored,0),3), cost=roundDet(restored/20,6);
  if(!changes.length || cost>(d.resources.supplies??0))throw new Error('Local supplies depleted');
  return {siteId:site.facts.id,cost,restored,changes};
}

/** Validate everything before touching authoritative stocks or actors. */
export function restAtRefuge(world: RefugeWorld, siteId: unknown) {
  const plan=planRefugeRest(world,siteId);
  const actors=world.atlasActors??world.actors??[];
  for(const change of plan.changes)actors.find(a=>a.id===change.id)!.energy=change.after;
  const stocks=world.exploration.sites[plan.siteId].resources;
  stocks.supplies=roundDet(stocks.supplies-plan.cost,6);
  return plan;
}

export function refugeRestEvent(plan: ReturnType<typeof planRefugeRest>) {
  return {type:'expedition.rest',title:'Refuge service completed',
    description:`${plan.changes.length} local teams restored by ${plan.restored} total energy; ${plan.cost} local supplies consumed.`,
    severity:'info' as const,sourceSystem:'refuge',sourceEntityId:plan.siteId,
    affectedEntityIds:plan.changes.map(a=>a.id),payload:plan,causalLinkType:'direct' as const,
    causalExplanation:'Local supplies were consumed to restore only the teams present at the visited refuge.'};
}
