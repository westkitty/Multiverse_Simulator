import { z } from 'zod';
import {
  atlasSchema, DISCOVERY_ORDER, ExplorationAtlas, ExplorationEvent, ExplorationState,
  explorationStateSchema, SiteDefinition,
} from './contracts';

export function createExplorationState(atlas: ExplorationAtlas, regionId: string, fuel = 100, supplies = 20): ExplorationState {
  const checked = atlasSchema.parse(atlas);
  if (!checked.regions.some(r => r.id === regionId)) throw new Error('Unknown starting region');
  return explorationStateSchema.parse({
    schemaVersion: 1, worldId: checked.worldId, lastTick: 0, sequence: 0,
    regionHazards: Object.fromEntries(checked.regions.map(r => [r.id, r.hazard])),
    blockedRoutes: Object.fromEntries(checked.routes.map(r => [r.id, r.blocked])),
    sites: Object.fromEntries(checked.sites.map(site => [site.facts.id, {
      ...site.initial, discoveryState: 'UNKNOWN', evidence: [], eventReferences: [], firstVisitedTick: null,
    }])),
    expedition: { regionId, fuel, supplies, cargo: {}, journey: null }, journal: [], actionCounts: {},
  });
}

/** Strict save validation. Parsing returns owned data, never references to another branch. */
export function restoreExplorationState(atlas: ExplorationAtlas, raw: unknown): ExplorationState {
  const state = explorationStateSchema.parse(raw);
  if (state.worldId !== atlas.worldId) throw new Error('Exploration world mismatch');
  const ids = atlas.sites.map(s => s.facts.id);
  if (ids.length !== Object.keys(state.sites).length || ids.some(id => !state.sites[id])) throw new Error('Exploration site inventory mismatch');
  if (!atlas.regions.some(r => r.id === state.expedition.regionId)) throw new Error('Unknown expedition region');
  const sameKeys = (actual: Record<string, unknown>, expected: string[]) => Object.keys(actual).length === expected.length && expected.every(key => Object.hasOwn(actual, key));
  if (!sameKeys(state.regionHazards, atlas.regions.map(r => r.id)) || !sameKeys(state.blockedRoutes, atlas.routes.map(r => r.id))) throw new Error('Navigation inventory mismatch');
  for (const site of atlas.sites) {
    const delta = state.sites[site.facts.id];
    if (delta.evidence.some(e => !site.evidence.some(rule => rule.id === e.evidenceId) || e.tick > state.lastTick)) throw new Error('Invalid saved evidence');
    if (new Set(delta.evidence.map(e => e.evidenceId)).size !== delta.evidence.length) throw new Error('Duplicate saved evidence');
    if (!sameKeys(delta.resources, Object.keys(site.initial.resources))) throw new Error('Resource inventory mismatch');
    const visited = DISCOVERY_ORDER.indexOf(delta.discoveryState) >= DISCOVERY_ORDER.indexOf('VISITED');
    if (visited !== (delta.firstVisitedTick !== null) || (delta.firstVisitedTick !== null && delta.firstVisitedTick > state.lastTick)) throw new Error('Invalid visit history');
    if (delta.evidence.length && DISCOVERY_ORDER.indexOf(delta.discoveryState) < DISCOVERY_ORDER.indexOf('INVESTIGATED')) throw new Error('Evidence without investigation');
    if (delta.discoveryState === 'RESOLVED' && (!site.evidence.length || site.evidence.some(rule => !delta.evidence.some(e => e.evidenceId === rule.id)))) throw new Error('Resolved site missing evidence');
  }
  if (state.journal.some(e => !ids.includes(e.siteId) || e.tick > state.lastTick)) throw new Error('Invalid saved history');
  const journey = state.expedition.journey;
  if (journey) {
    const destination = atlas.sites.find(s => s.facts.id === journey.siteId);
    if (!destination || journey.arrivalTick <= state.lastTick) throw new Error('Invalid saved journey');
    let region = state.expedition.regionId;
    for (const id of journey.routeIds) {
      const edge = atlas.routes.find(e => e.id === id);
      if (!edge || (edge.from !== region && edge.to !== region)) throw new Error('Disconnected saved journey');
      region = edge.from === region ? edge.to : edge.from;
    }
    if (region !== destination.facts.regionId) throw new Error('Journey destination mismatch');
  }
  return state;
}

/** Undirected graph, shortest travel time; stable lexical ties, no camera dependence. */
export function planRoute(atlas: ExplorationAtlas, from: string, to: string, maximumHazard = 70, maximumFuel = Infinity, navigation?: Pick<ExplorationState, 'blockedRoutes' | 'regionHazards'>) {
  if (![from, to].every(id => atlas.regions.some(r => r.id === id))) throw new Error('Unknown route region');
  const queue = [{ region: from, ticks: 0, fuel: 0, routeIds: [] as string[] }];
  const visited = new Map<string, Array<{ ticks: number; fuel: number }>>();
  let examined = 0;
  while (queue.length) {
    if (++examined > 16384) throw new Error('Route search budget exceeded; narrow the region graph');
    queue.sort((a, b) => a.ticks - b.ticks || a.routeIds.join('/').localeCompare(b.routeIds.join('/'), 'en'));
    const current = queue.shift()!;
    const labels = visited.get(current.region) ?? [];
    if (labels.some(label => label.ticks <= current.ticks && label.fuel <= current.fuel)) continue;
    visited.set(current.region, [...labels.filter(label => !(label.ticks >= current.ticks && label.fuel >= current.fuel)), current]);
    if (current.region === to) return current;
    for (const edge of atlas.routes) {
      if ((navigation?.blockedRoutes[edge.id] ?? edge.blocked) || (edge.from !== current.region && edge.to !== current.region)) continue;
      const next = edge.from === current.region ? edge.to : edge.from;
      if ((navigation?.regionHazards[next] ?? atlas.regions.find(r => r.id === next)!.hazard) > maximumHazard) continue;
      if (current.fuel + edge.fuel > maximumFuel) continue;
      if (queue.length >= 8192) throw new Error('Route search queue budget exceeded');
      queue.push({ region: next, ticks: current.ticks + edge.travelTicks, fuel: current.fuel + edge.fuel, routeIds: [...current.routeIds, edge.id] });
    }
  }
  throw new Error('No feasible route: blocked passages, regional hazard, or insufficient fuel');
}

const commandSchema = z.object({
  action: z.enum(['detect', 'survey', 'discover', 'travel', 'investigate', 'repair', 'recover', 'resolve', 'operate']),
  siteId: z.string().min(1), resourceId: z.string().min(1).optional(),
}).strict();
export type ExplorationCommand = z.infer<typeof commandSchema>;
const contextSchema = z.object({ tick: z.number().int().nonnegative().safe(), branchId: z.string().min(1).max(80) }).strict();
export type ExplorationContext = z.infer<typeof contextSchema>;

function record(state: ExplorationState, ctx: ExplorationContext, siteId: string, action: ExplorationEvent['action'], before: string, after: string) {
  const event: ExplorationEvent = { id: `explore:${ctx.branchId}:${++state.sequence}`, ...ctx, siteId, action, before, after };
  state.journal.push(event);
  state.journal = state.journal.slice(-128);
  const site = state.sites[siteId];
  site.eventReferences = [...site.eventReferences, event.id].slice(-128);
  state.actionCounts[action] = (state.actionCounts[action] ?? 0) + 1;
  return event;
}

function collectEvidence(site: SiteDefinition, state: ExplorationState, ctx: ExplorationContext) {
  const delta = state.sites[site.facts.id];
  for (const rule of site.evidence) {
    if (delta.evidence.some(e => e.evidenceId === rule.id)) continue;
    const value = rule.source === 'resource' ? delta.resources[rule.resourceId!] : rule.source === 'reading' ? delta.readings[rule.resourceId!] : delta[rule.source];
    const matches = rule.comparison === 'atLeast' ? value >= rule.threshold : value <= rule.threshold;
    if (matches) delta.evidence.push({ evidenceId: rule.id, ...ctx, value,
      unit: rule.unit ?? (['resource', 'reading'].includes(rule.source) ? rule.resourceId! : 'percent'), classification: 'OBSERVED' });
  }
}

/** Four-link instrument coverage bridges unsited terrain without exposing names/history. */
export function surveyCoverage(atlas: ExplorationAtlas,state: ExplorationState) {
  const regions=new Set([state.expedition.regionId]);
  for(let step=0;step<4;step++){
    const reached=new Set(regions);
    for(const route of atlas.routes)if(!state.blockedRoutes[route.id]){
      if(reached.has(route.from))regions.add(route.to);
      if(reached.has(route.to))regions.add(route.from);
    }
  }
  return regions;
}

/** Atomic command transaction: rejected commands never spend fuel or mutate caller data.
 * Domain plugins must embed the returned state and forward returned events to the kernel.
 */
export function applyExplorationCommand(atlas: ExplorationAtlas, rawState: ExplorationState, rawCommand: ExplorationCommand, rawContext: ExplorationContext) {
  const command = commandSchema.parse(rawCommand), ctx = contextSchema.parse(rawContext);
  const state = restoreExplorationState(atlas, rawState);
  if (ctx.tick < state.lastTick) throw new Error('Exploration tick cannot move backwards');
  if (state.expedition.journey) throw new Error('Expedition in transit: advance arrival before another action');
  state.lastTick = ctx.tick;
  const site = atlas.sites.find(s => s.facts.id === command.siteId);
  if (!site) throw new Error('Unknown site');
  const delta = state.sites[command.siteId];
  const summarize = () => JSON.stringify({ stage: delta.discoveryState, condition: delta.condition,
    hazard: delta.hazard, evidenceCount: delta.evidence.length, resources: delta.resources,
    contacts:Object.values(state.sites).filter(s=>s.discoveryState!=='UNKNOWN').length, blockedRoutes:Object.values(state.blockedRoutes).filter(Boolean).length,cargo:Object.values(state.expedition.cargo).reduce((a,b)=>a+b,0), supplies: state.expedition.supplies, fuel: state.expedition.fuel, inTransit: !!state.expedition.journey });
  const before = summarize();
  const stage = delta.discoveryState;
  const requireStage = (expected: typeof stage) => { if (stage !== expected) throw new Error(`Requires ${expected}, found ${stage}`); };
  const requireLocal = () => { if (state.expedition.regionId !== site.facts.regionId || delta.firstVisitedTick === null) throw new Error('Visit this site first'); };
  if (!['detect', 'travel'].includes(command.action) && !site.availableInteractions.includes(command.action as SiteDefinition['availableInteractions'][number])) throw new Error('Interaction unavailable at this site');
  const spend = (amount: number) => {
    if (state.expedition.supplies < amount) throw new Error('Insufficient expedition supplies');
    state.expedition.supplies -= amount;
  };
  let action: ExplorationEvent['action'];
  switch (command.action) {
    case 'detect':
      requireStage('UNKNOWN');
      if (!surveyCoverage(atlas,state).has(site.facts.regionId)) throw new Error('Detection requires local or adjacent route survey coverage (four-link instrument range)');
      delta.discoveryState = 'DETECTED'; action = 'detect'; break;
    case 'survey': requireStage('DETECTED'); spend(1); delta.discoveryState = 'SURVEYED'; action = 'survey'; break;
    case 'discover': requireStage('SURVEYED'); delta.discoveryState = 'DISCOVERED'; action = 'discover'; break;
    case 'travel': {
      if (DISCOVERY_ORDER.indexOf(stage) < DISCOVERY_ORDER.indexOf('DISCOVERED')) throw new Error('Discover a destination before travelling');
      if (delta.hazard > 70) throw new Error('Site hazard prevents safe access');
      const route = planRoute(atlas, state.expedition.regionId, site.facts.regionId, 70, state.expedition.fuel, state);
      if (state.expedition.fuel < route.fuel) throw new Error('Insufficient fuel for planned route');
      state.expedition.fuel -= route.fuel;
      state.expedition.journey = { siteId: command.siteId, routeIds: route.routeIds, arrivalTick: ctx.tick + Math.max(1, route.ticks) };
      action = 'depart'; break;
    }
    case 'investigate': {
      requireLocal();
      if (!['VISITED', 'INVESTIGATED'].includes(stage)) throw new Error('Site is not ready for investigation');
      for (const chain of atlas.chains) {
        const index = chain.steps.findIndex(step => step.siteId === command.siteId);
        if (index > 0 && chain.steps.slice(0, index).some(step => !state.sites[step.siteId].evidence.some(e => e.evidenceId === step.evidenceId))) throw new Error('Follow prior evidence before this investigation');
      }
      const count = delta.evidence.length;
      collectEvidence(site, state, ctx);
      if (delta.evidence.length === count) throw new Error('No new evidence matches current simulation conditions');
      spend(1); delta.discoveryState = 'INVESTIGATED'; action = 'investigate'; break;
    }
    case 'repair': requireLocal();
      if (delta.condition >= 100) throw new Error('Site already fully repaired');
      spend(2); delta.condition = Math.min(100, delta.condition + 25); action = 'repair'; break;
    case 'recover': { requireLocal();
      const resource = command.resourceId;
      if (!resource || !Object.hasOwn(delta.resources, resource) || delta.resources[resource] < 1) throw new Error('Resource unavailable');
      delta.resources[resource] -= 1; state.expedition.cargo[resource] = (Object.hasOwn(state.expedition.cargo, resource) ? state.expedition.cargo[resource] : 0) + 1; action = 'recover'; break;
    }
    case 'operate': {
      requireLocal();
      if(delta.condition<30)throw new Error('Repair this installation to at least 30% before operation');
      const role=Number(site.facts.extensions.structureRole);
      if(!Number.isInteger(role)||role<0||role>11)throw new Error('No compatible facility operation');
      const take=(key:string,n:number)=>{if(!Object.hasOwn(delta.resources,key)||delta.resources[key]<n)throw new Error(`Need ${n} ${key}`);delta.resources[key]-=n;};
      const reveal=(distance:number)=>{
        const regions=new Set([site.facts.regionId]);
        for(let step=0;step<distance;step++){const reached=new Set(regions);for(const edge of atlas.routes)if(!state.blockedRoutes[edge.id]){if(reached.has(edge.from))regions.add(edge.to);if(reached.has(edge.to))regions.add(edge.from);}}
        let found=0;for(const candidate of atlas.sites)if(regions.has(candidate.facts.regionId)&&state.sites[candidate.facts.id].discoveryState==='UNKNOWN'){state.sites[candidate.facts.id].discoveryState='DETECTED';found++;}
        if(!found)throw new Error('No unknown contacts within instrument range');
      };
      switch(role){
        case 0:take('supplies',5);state.expedition.supplies+=5;break;
        case 1:spend(1);reveal(1);break;
        case 2:take('salvage',2);state.expedition.cargo.salvage=(state.expedition.cargo.salvage??0)+2;break;
        // Historical archives replay this exact transfer. Current UI uses expedition.rest.
        case 3:take('supplies',2);state.expedition.supplies+=2;break;
        case 4:take('reserve',2);delta.resources.salvage=(delta.resources.salvage??0)+2;break;
        case 5:{
          const edge=atlas.routes.find(r=>(r.from===site.facts.regionId||r.to===site.facts.regionId)&&state.blockedRoutes[r.id]);
          if(!edge)throw new Error('No blocked local route');take('salvage',2);state.blockedRoutes[edge.id]=false;break;
        }
        case 6:if(delta.condition>=100)throw new Error('Workshop already fully restored');take('salvage',2);delta.condition=Math.min(100,delta.condition+10);break;
        case 7:take('fuel',1);delta.condition=Math.min(100,delta.condition+5);break;
        case 8:take('records',1);state.expedition.cargo.records=(state.expedition.cargo.records??0)+1;break;
        case 9:take('fuel',2);reveal(2);break;
        case 10:if(delta.hazard<=0)throw new Error('No active local hazard');take('salvage',2);delta.hazard=Math.max(0,delta.hazard-15);delta.mitigation=Math.min(100,delta.mitigation+15);break;
        case 11:take('supplies',2);delta.resources.fuel=(delta.resources.fuel??0)+1;break;
      }
      action='operate';break;
    }
    case 'resolve': requireLocal(); requireStage('INVESTIGATED');
      if (!site.evidence.length || site.evidence.some(rule => !delta.evidence.some(e => e.evidenceId === rule.id))) throw new Error('Evidence incomplete');
      delta.discoveryState = 'RESOLVED'; action = 'resolve'; break;
  }
  const event = record(state, ctx, command.siteId, action, before, summarize());
  return { state, events: [event] };
}

/** Arrival is driven by simulation ticks, never wall clock or viewport visibility. */
export function advanceExploration(atlas: ExplorationAtlas, rawState: ExplorationState, rawContext: ExplorationContext) {
  const state = restoreExplorationState(atlas, rawState), ctx = contextSchema.parse(rawContext);
  if (ctx.tick < state.lastTick) throw new Error('Exploration tick cannot move backwards');
  state.lastTick = ctx.tick;
  const events: ExplorationEvent[] = [];
  const journey = state.expedition.journey;
  if (journey && ctx.tick >= journey.arrivalTick) {
    const site = atlas.sites.find(s => s.facts.id === journey.siteId)!;
    // In-flight routes are committed at departure; future domain adapters must model disruptions explicitly.
    state.expedition.regionId = site.facts.regionId;
    state.expedition.journey = null;
    const delta = state.sites[journey.siteId], before = delta.discoveryState;
    if (delta.firstVisitedTick === null) delta.firstVisitedTick = journey.arrivalTick;
    if (DISCOVERY_ORDER.indexOf(before) < DISCOVERY_ORDER.indexOf('VISITED')) delta.discoveryState = 'VISITED';
    events.push(record(state, { ...ctx, tick: journey.arrivalTick }, journey.siteId, 'arrive', before, delta.discoveryState));
  }
  return { state, events };
}

/** This is the only presentation projection: unknown names/history must not reach accessible labels. */
export function presentSite(atlas: ExplorationAtlas, state: ExplorationState, siteId: string) {
  const site = atlas.sites.find(s => s.facts.id === siteId);
  if (!site) throw new Error('Unknown site');
  const delta = state.sites[siteId];
  if (delta.discoveryState === 'UNKNOWN') return null;
  const rank = DISCOVERY_ORDER.indexOf(delta.discoveryState);
  return {
    id: siteId, regionId: site.facts.regionId, discoveryState: delta.discoveryState,
    label: rank >= 3 ? site.facts.name : site.accessibilityPresentation.detectedLabel,
    description: rank >= 4 ? site.facts.description : rank >= 2 ? site.accessibilityPresentation.surveyedDescription : 'Unsurveyed signal',
    history: rank >= 4 ? { origin: site.facts.origin, formationEpoch: site.facts.formationEpoch, classification: 'GENERATED_HISTORY' } : null,
    condition: rank >= 2 ? delta.condition : null,
    evidence: delta.evidence.map(e => ({ ...e })),
  };
}
