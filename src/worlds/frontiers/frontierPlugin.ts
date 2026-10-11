import { restAtRefuge, refugeRestEvent } from '../../exploration/refuge';
import { z } from 'zod';
import { defineWorldPlugin } from '../../core/pdk';
import { EmitEventInput, EntityInspection, roundDet, SimulationCommand, SystemExecutionContext } from '../../core/contracts';
import { atlasSchema, ExplorationAtlas, explorationStateSchema, SiteDefinition } from '../../exploration/contracts';
import { advanceExploration, applyExplorationCommand, createExplorationState, ExplorationCommand, presentSite, restoreExplorationState } from '../../exploration/engine';
import { DomainSpec, FRONTIER_DOMAINS } from './domains';

const configSchema = z.object({ scale: z.union([z.literal(1), z.literal(3)]), forcing: z.number().min(.25).max(3), autonomy: z.boolean() }).strict();
type Config = z.infer<typeof configSchema>;
const regionSchema = z.object({ id: z.string(), position: z.tuple([z.number(), z.number(), z.number()]), biome: z.string(), readings: z.record(z.number().finite()), hazard: z.number().finite(), production: z.number().finite() });
const actorSchema = z.object({ id: z.string(), role: z.number().int().min(0).max(5), region: z.number().int().nonnegative(), previousRegion: z.number().int().nonnegative(), energy: z.number().min(0).max(100), completed: z.number().nonnegative(), task: z.string(), cargo:z.number().nonnegative(), cargoOrigin:z.string().nullable() });
const stateSchema = z.object({ schemaVersion: z.literal(1), atlas: atlasSchema, exploration: explorationStateSchema,
  regions: z.array(regionSchema), actors: z.array(actorSchema), elapsed: z.number().int().nonnegative(), policy: z.enum(['balanced','conserve','restore']), discoveries: z.number().nonnegative() }).strict();
export type FrontierState = z.infer<typeof stateSchema>;
const clamp = (n: number, max = 100) => roundDet(Math.max(0, Math.min(max, n)), 3);
export function isFrontierState(value: unknown): value is Pick<FrontierState, 'atlas' | 'exploration' | 'regions'> {
  return !!value && typeof value === 'object' && 'atlas' in value && 'exploration' in value && 'regions' in value;
}
function emitExploration(events: ReturnType<typeof advanceExploration>['events'], emit: (event: EmitEventInput) => unknown) {
  for (const event of events) emit({ type: `exploration.${event.action}`, severity: 'info', title: `Expedition ${event.action}`, description: event.after,
    sourceSystem: 'expedition', sourceEntityId: event.siteId, affectedEntityIds: [event.siteId], payload: event,
    causalLinkType: 'direct', causalExplanation: 'Validated expedition command or committed tick arrival.' });
}
function buildAtlas(spec: DomainSpec, regions: FrontierState['regions'], seed: number, scale: number): ExplorationAtlas {
  const sites: SiteDefinition[] = Array.from({ length: 12 * scale }, (_, i) => {
    const region = regions[Math.floor(i * regions.length / (12 * scale))];
    const [field, label, unit] = spec.fields[i % spec.fields.length];
    const signature = i === 2;
    return {
      facts: { schemaVersion: 1, id: `${spec.id}:site-${i}`, worldId: spec.id, regionId: region.id, archetypeId: `type-${i % (scale === 1 ? 4 : 12)}`, seed,
        coordinates: [region.position[0] + 2, region.position[1] + 1, region.position[2] + 2], spatialBounds: { radius: 1.5, unit: 'map-unit' },
        name: signature ? spec.signature : `${spec.archetypes[i % (scale === 1 ? 4 : 12)]} ${i + 1}`,
        description: `${region.biome} location. ${signature ? spec.question : `Investigate ${label.toLowerCase()} and the surviving infrastructure.`}`,
        origin: spec.history, formationEpoch: `Occupation layer ${i % 3 + 1}`, association: spec.actors[(i + 1) % 6], simulationDependencies: [region.id, field],
        extensions: { signature, structureRole: i % 12, layer: i % 3 + 1, evidenceQuestion: spec.question } },
      initial: { condition: signature ? 28 : 40 + i % 25, hazard: Math.min(60, region.hazard), inhabitants: [], resources: { salvage: 20 + i % 7, supplies: 12, fuel: 10, reserve:40, records:1 }, readings: { ...region.readings } },
      availableInteractions: ['survey','discover','investigate','repair','recover','resolve','operate'],
      evidence: [
        { id: 'field-sample', label: `${label} measurement`, source: 'reading', resourceId: field, unit, comparison: 'atLeast', threshold: spec.fields[i % spec.fields.length][3] < 0 ? -60 : 0 },
        ...(i % 12 === 2 ? [{ id: 'restored-system', label: 'Restored infrastructure', source: 'condition' as const, unit: '%', comparison: 'atLeast' as const, threshold: 75 }] : []),
      ],
      renderPresentation: { glyph: `site-${i % 6}`, silhouette: spec.archetypes[i % 12] },
      accessibilityPresentation: { detectedLabel: `Unidentified contact ${i + 1}`, surveyedDescription: `Surveyed ${region.biome} structure; environmental readings available.` },
    };
  });
  const routes: ExplorationAtlas['routes'] = [];
  for (let i = 0; i < regions.length; i++) {
    for (const next of [i % 4 < 3 ? i + 1 : -1, i + 4 < regions.length ? i + 4 : -1]) {
      if (next < 0) continue;
      routes.push({ id: `route-${i}-${next}`, from: regions[i].id, to: regions[next].id, travelTicks: spec.id === 'hollow-deep' && next === i + 4 ? 5 : 2, fuel: spec.id === 'signal-expanse' ? 3 : 1, blocked: false });
    }
  }
  return atlasSchema.parse({ schemaVersion: 1, worldId: spec.id,
    regions: regions.map(r => ({ id: r.id, label: `${r.biome} ${r.id}`, hazard: r.hazard })), routes, sites,
    chains: Array.from({ length: scale }, (_, i) => ({ id: `${spec.id}:investigation-${i + 1}`, steps: [0, 1, 2].map(j => ({ siteId: sites[i * 12 + j].facts.id, evidenceId: 'field-sample' })) })),
  });
}
function system(spec: DomainSpec, ctx: SystemExecutionContext<FrontierState, Config>) {
  const { state: s, config: c, tick } = ctx;
  s.elapsed = tick;
  const old = s.regions.map(r => ({ ...r, readings: { ...r.readings } }));
  const regionSites = new Map<string, string[]>();
  for (const site of s.atlas.sites) regionSites.set(site.facts.regionId, [...(regionSites.get(site.facts.regionId) ?? []), site.facts.id]);
  for (let i = 0; i < s.regions.length; i++) {
    const r = s.regions[i], ids = regionSites.get(r.id) ?? [];
    const health = ids.length ? ids.reduce((n, id) => n + s.exploration.sites[id].condition, 0) / ids.length : 50;
    const neighbors = s.atlas.routes.filter(route => route.from === r.id || route.to === r.id);
    const adjacent = neighbors[tick % neighbors.length];
    const neighbor = old.find(n => n.id === (adjacent.from === r.id ? adjacent.to : adjacent.from))!;
    spec.step(r, neighbor, health, c.forcing * (s.policy === 'conserve' ? .8 : 1), tick);
    s.exploration.regionHazards[r.id] = r.hazard;
    for (const id of ids) {
      const site = s.exploration.sites[id];
      const previousCondition = site.condition;
      site.condition = clamp(site.condition - .002 - Math.max(0, r.hazard - 25) * .002);
      site.mitigation=clamp(site.mitigation-.01);
      site.hazard = clamp(r.hazard-site.mitigation);
      site.readings = { ...r.readings };
      site.resources.supplies = clamp(site.resources.supplies + r.production * .2, 200);
      site.resources.fuel = clamp(site.resources.fuel + r.production * .05, 100);
      if (previousCondition >= 20 && site.condition < 20) ctx.emitEvent({ type: 'site.deterioration', title: 'Infrastructure entering critical condition', description: `${id}: local hazard is overwhelming maintenance.`, severity: 'warning', sourceSystem: 'environment', sourceEntityId: id, deltas: [{ metricOrField: 'condition', before: previousCondition, after: site.condition, unit: '%' }] });
    }
  }
  // These utility actors change authoritative stocks and structures; motion is an outcome of their task.
  if (c.autonomy) for (const actor of s.actors) {
    actor.previousRegion = actor.region;
    const region = s.regions[actor.region];
    const siteId = regionSites.get(region.id)?.[0];
    const site = siteId ? s.exploration.sites[siteId] : null;
    actor.energy = clamp(actor.energy - .4);
    actor.task = 'travelling';
    if(actor.energy===0&&(!site||site.resources.supplies<1)){actor.task='stranded';continue;}
    if (site) {
      if (actor.energy < 20 && site.resources.supplies >= 1) { site.resources.supplies -= 1; actor.energy = clamp(actor.energy + 15); actor.task = 'resupplying'; }
      else if (actor.role === 0) { site.resources.salvage = clamp(site.resources.salvage + region.production * .3, 100); actor.task = 'collecting'; }
      else if (actor.role === 1) {
        if (site.discoveryState === 'UNKNOWN') {
          site.discoveryState = 'DETECTED'; s.discoveries += 1;
          ctx.emitEvent({ type: 'expedition.contact', title: 'Survey team reports a contact', description: `A survey actor detected a structure in ${region.id}.`, severity: 'info', sourceSystem: 'autonomous-survey', sourceEntityId: actor.id, affectedEntityIds: [siteId!], causalLinkType: 'direct' });
        }
        actor.task = 'surveying';
      }
      else if (actor.role === 2 && site.resources.salvage >= .1) { site.resources.salvage = roundDet(site.resources.salvage - .1, 3); site.condition = clamp(site.condition + .08); actor.task = 'maintaining'; }
      else if (actor.role === 3) {
        if(actor.cargo===0&&site.resources.supplies>2){site.resources.supplies-=1;actor.cargo=1;actor.cargoOrigin=region.id;actor.task='loading';}
        else if(actor.cargo>0&&actor.cargoOrigin!==region.id){site.resources.supplies+=actor.cargo;actor.cargo=0;actor.cargoOrigin=null;actor.task='delivering';}
      }
      else if (actor.role === 4 && site.resources.salvage >= .5) { site.resources.salvage -= .5; site.condition = clamp(site.condition + .3); actor.task = 'constructing'; }
      else if (actor.role === 5) { site.hazard = clamp(site.hazard - .2); actor.task = 'mitigating'; }
      if (actor.task !== 'travelling') actor.completed += 1;
    }
    if (tick % (3 + actor.role) === 0) {
      const edges = s.atlas.routes.filter(e => !s.exploration.blockedRoutes[e.id] && (e.from === region.id || e.to === region.id));
      const choices = edges.map(e => s.regions.findIndex(r => r.id === (e.from === region.id ? e.to : e.from)));
      if (choices.length) actor.region = choices.reduce((best, next) => s.regions[next].hazard < s.regions[best].hazard ? next : best, choices[(tick + actor.role) % choices.length]);
    }
  }
  for(const site of s.atlas.sites)s.exploration.sites[site.facts.id].inhabitants=s.actors.filter(a=>s.regions[a.region].id===site.facts.regionId).map(a=>a.id);
  const arrival = advanceExploration(s.atlas, s.exploration, { tick, branchId: ctx.runId });
  s.exploration = arrival.state;
  emitExploration(arrival.events, ctx.emitEvent);
}
export function makeFrontierPlugin(spec: DomainSpec) {
  const defaultConfig: Config = { scale: 3, forcing: 1, autonomy: true };
  return defineWorldPlugin<Config, FrontierState>({
    id: spec.id, name: spec.name, subtitle: spec.subtitle, version: '1.1.0', schemaVersion: 1, accentColor: spec.color,
    description: `${spec.subtitle}. Investigate ${spec.signature}; regional processes, autonomous teams and infrastructure continue beyond the camera.`,
    physicalModelDocumentation: [spec.history, spec.question, 'Explicit regional teaching model: adjacency exchange and infrastructure health modify domain-specific rates. Not a calibrated predictive simulator.'],
    simplifiedMechanicsNote: 'Expedition fuel and supplies are local to this reality. Paused and closed-browser simulations do not advance.',
    configSchema, defaultConfig,
    scaleMetadata: { areaUnitLabel: 'active connected regions', baselinePlayableArea: spec.baselineRegions, expandedPlayableArea: spec.baselineRegions * 3,
      baselineTerritoryScalar: spec.baselineRegions, expandedTerritoryScalar: spec.baselineRegions * 3, baselineScenarioCount: 1, baselineInterventionCount: 1, baselineMetricCount: 2 },
    scenarios: [
      { id: 'frontier', name: 'Open frontier', subtitle: 'Expedition arrival', description: spec.question, hypothesis: 'Infrastructure repair changes regional environmental trajectories.', seed: 424242, config: defaultConfig },
      { id: 'crisis', name: 'Environmental pressure', subtitle: 'High forcing', description: 'Increased environmental pressure tests logistics and maintenance.', hypothesis: 'Higher forcing increases regional hazard.', seed: 52143, config: { ...defaultConfig, forcing: 2 } },
      { id: 'baseline-scale', name: 'Initial survey extent', subtitle: 'Functional scale baseline', description: 'One third of the connected territory and site population.', hypothesis: 'The same mechanics function at the initial scale.', seed: 424242, config: { ...defaultConfig, scale: 1 } },
    ],
    quickInterventions: [
      { id: 'conserve', label: 'Adopt conservation policy', description: 'Reduce environmental forcing by 20%.', category: 'policy', commandType: 'frontier.policy', defaultPayload: { policy: 'conserve' } },
      { id: 'restore', label: 'Restore regional infrastructure', description: 'Spend ten regional salvage units on repairs.', category: 'restoration', commandType: 'frontier.restore', defaultPayload: { region: 0 } },
      { id: 'pressure', label: 'Increase environmental forcing', description: 'Add 0.25 to bounded regional forcing.', category: 'crisis', commandType: 'frontier.forcing', defaultPayload: { delta: .25 } },
    ],
    metricDefinitions: [...spec.fields.map(([id, label, unit]) => ({ id, label, unit, category: 'Environment', description: `Mean regional ${label.toLowerCase()}.` })),
      { id: 'meanCondition', label: 'Site integrity', unit: '%', category: 'Infrastructure', description: 'Mean condition of persistent sites.' },
      { id: 'visited', label: 'Sites visited', unit: 'sites', category: 'Exploration', description: 'Sites reached by the expedition.' },
      { id: 'actorWork', label: 'Autonomous work', unit: 'tasks', category: 'Actors', description: 'Completed autonomous actions.' }],
    initializeWorld(config, rng) {
      const regions = Array.from({ length: spec.baselineRegions * config.scale }, (_, i) => {
        const random = rng.stream(`${spec.id}:region:${i}`);
        return { id: `region-${i}`, position: [i % 4 * 16 - 24, spec.id === 'hollow-deep' ? -Math.floor(i / 4) * 8 : 0, Math.floor(i / 4) * 16 - 32] as [number,number,number],
          biome: spec.biomes[i % spec.biomes.length], readings: Object.fromEntries(spec.fields.map(([id, , , initial]) => [id, roundDet(initial + random.nextRange(-2, 2), 3)])), hazard: 25, production: 0 };
      });
      const atlas = buildAtlas(spec, regions, rng.masterSeed, config.scale);
      let exploration = createExplorationState(atlas, regions[0].id, 150, 80);
      exploration = applyExplorationCommand(atlas, exploration, { action: 'detect', siteId: atlas.sites[0].facts.id }, { tick: 0, branchId: 'genesis' }).state;
      return { schemaVersion: 1, atlas, exploration, regions, elapsed: 0, policy: 'balanced', discoveries: 0,
        actors: Array.from({ length: config.scale * 12 }, (_, i) => ({ id: `actor-${i}`, role: i % (config.scale === 1 ? 2 : 6), region: i % regions.length, previousRegion: i % regions.length, energy: 80, completed: 0, task: 'arriving', cargo:0, cargoOrigin:null })) };
    },
    systems: [{ id: `${spec.id}.environment-and-actors`, name: spec.subtitle, order: 1, step: ctx => system(spec, ctx) }],
    applyCommand(s, cmd: SimulationCommand, ctx) {
      if(cmd.type==='expedition.rest'){ctx.emitEvent(refugeRestEvent(restAtRefuge(s,cmd.payload.siteId)));return;}
      if (cmd.type === 'exploration.action') {
        const result = applyExplorationCommand(s.atlas, s.exploration, cmd.payload as ExplorationCommand, { tick: ctx.tick, branchId: ctx.runId });
        s.exploration = result.state; emitExploration(result.events, ctx.emitEvent); return;
      }
      if (cmd.type === 'frontier.import_supplies') {
        if(spec.id!=='terraforming-frontier')throw new Error('Supply allocation only supports terraforming settlements');
        const quantity=z.number().finite().positive().max(100).parse(cmd.payload.quantity);
        const first=s.exploration.sites[s.atlas.sites[0].facts.id];first.resources.salvage=roundDet(first.resources.salvage+quantity,6);
      } else if(cmd.type==='frontier.expose_layers') {
        if(spec.id!=='timeworn-empire')throw new Error('Stratum exposure only supports archaeological regions');
        const meters=z.number().finite().positive().max(1).parse(cmd.payload.meters);
        for(const r of s.regions){r.readings.burial=roundDet(Math.max(0,r.readings.burial-meters),3);r.readings.exposure=clamp(r.readings.exposure+meters*10);}
      } else if (cmd.type === 'expedition.resupply') {
        if (s.exploration.expedition.journey) throw new Error('Cannot resupply in transit');
        const local = s.atlas.sites.find(site => site.facts.regionId === s.exploration.expedition.regionId && s.exploration.sites[site.facts.id].firstVisitedTick !== null);
        if (!local) throw new Error('Visit a local supply location first');
        const delta = s.exploration.sites[local.facts.id];
        const supplies = Math.min(10, delta.resources.supplies), fuel = Math.min(10, delta.resources.fuel);
        if (supplies + fuel <= 0) throw new Error('Local stocks depleted');
        delta.resources.supplies -= supplies; delta.resources.fuel -= fuel;
        s.exploration.expedition.supplies += supplies; s.exploration.expedition.fuel += fuel;
      } else if (cmd.type === 'frontier.policy') s.policy = z.enum(['balanced','conserve','restore']).parse(cmd.payload.policy);
      else if (cmd.type === 'frontier.forcing') ctx.config.forcing = Math.max(.25, Math.min(3, ctx.config.forcing + z.number().min(-1).max(1).parse(cmd.payload.delta)));
      else if (cmd.type === 'frontier.restore') {
        const index = z.number().int().min(0).max(s.regions.length - 1).parse(cmd.payload.region);
        const site = s.atlas.sites.find(x => x.facts.regionId === s.regions[index].id);
        if (!site) throw new Error('No infrastructure in this region');
        const delta = s.exploration.sites[site.facts.id];
        if (delta.resources.salvage < 10) throw new Error('Need ten local salvage units');
        delta.resources.salvage -= 10; delta.condition = clamp(delta.condition + 30);
      } else throw new Error(`Unsupported command: ${cmd.type}`);
      ctx.emitEvent({ type: cmd.type, title: cmd.label, description: 'Validated intervention changed authoritative logistics or regional policy.', severity: 'info', sourceSystem: spec.id, payload: cmd.payload, causalLinkType: 'direct' });
    },
    restoreState(raw) {
      const s = stateSchema.parse(raw); s.exploration = restoreExplorationState(s.atlas, s.exploration);
      if (s.atlas.worldId !== spec.id || s.regions.length !== s.atlas.regions.length || s.actors.some(a => a.region >= s.regions.length || a.previousRegion >= s.regions.length)) throw new Error('Invalid domain state topology');
      return s;
    },
    migrateState(raw, version) { if (version !== 1) throw new Error('Unsupported frontier schema'); return raw; },
    extractMetrics(s) {
      return { ...Object.fromEntries(spec.fields.map(([field]) => [field, roundDet(s.regions.reduce((n, r) => n + r.readings[field], 0) / s.regions.length, 3)])),
        meanCondition: roundDet(Object.values(s.exploration.sites).reduce((n, d) => n + d.condition, 0) / s.atlas.sites.length, 3),
        visited: Object.values(s.exploration.sites).filter(d => d.firstVisitedTick !== null).length, actorWork: s.actors.reduce((n, a) => n + a.completed, 0) };
    },
    inspectEntities(s) {
      const regions: EntityInspection[] = s.regions.map(r => ({ entityId: r.id, kind: r.biome, label: `${r.biome} · ${r.id}`, position: r.position, status: r.hazard > 70 ? 'critical' : 'nominal', summary: `Regional hazard ${r.hazard.toFixed(1)}%.`, properties: spec.fields.map(([key,label,unit]) => ({ key,label,unit,value:r.readings[key] })) }));
      return [...regions, ...s.actors.map(a => ({ entityId: a.id, kind: 'expedition-actor', label: `${spec.actors[a.role]} ${a.id}`, position: s.regions[a.region].position, status: 'nominal' as const, summary: a.task, properties: [{ key: 'work', label: 'Completed work', value: a.completed, unit: 'tasks' }, { key: 'energy', label: 'Energy', value: a.energy, unit: '%' }] }))];
    },
    extractRenderFrame(s, _c, runId, tick) {
      return { worldId: spec.id, runId, tick, ambientStatus: 'nominal', hudSummary: { expedition: s.exploration.expedition.regionId, sites: s.atlas.sites.length },
        zones: s.regions.map(r => ({ id: r.id, label: r.biome, position: r.position, size: [13, 1 + r.hazard / 20, 13] as [number,number,number], value: r.hazard, status: r.hazard > 70 ? 'critical' as const : 'nominal' as const, color: spec.color })),
        entities: [...s.actors.map(a => ({ id: a.id, kind: spec.actors[a.role], label: spec.actors[a.role], position: s.regions[a.region].position, prevPosition: s.regions[a.previousRegion].position, scale: [1, 2, 1] as [number,number,number], color: '#e2e8f0', energyOrHealth: a.energy, status: 'nominal' as const })),
          ...s.atlas.sites.flatMap(site => { const view = presentSite(s.atlas, s.exploration, site.facts.id); if (!view) return []; const d = s.exploration.sites[site.facts.id]; return [{ id: site.facts.id, kind: 'discovery-site', label: view.label, position: site.facts.coordinates, scale: [2, 1 + d.condition / 30, 2] as [number,number,number], color: d.condition < 30 ? '#fb7185' : spec.color, energyOrHealth: d.condition, status: 'nominal' as const }]; })],
        connections: s.atlas.routes.map(route => ({ id: route.id, from: s.regions.find(r => r.id === route.from)!.position, to: s.regions.find(r => r.id === route.to)!.position, status: s.exploration.blockedRoutes[route.id] ? 'closed' as const : 'open' as const, flowRate: 0, label: `${route.travelTicks} ticks / ${route.fuel} fuel` })) };
    },
  });
}
export const FRONTIER_WORLD_PLUGINS = FRONTIER_DOMAINS.map(makeFrontierPlugin);
