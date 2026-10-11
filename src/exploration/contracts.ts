import { z } from 'zod';

const id = z.string().min(1).max(120);
const text = z.string().min(1).max(1000);
const amount = z.number().finite().nonnegative();
const tick = amount.int().safe();
const position = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
export const discoverySchema = z.enum(['UNKNOWN', 'DETECTED', 'SURVEYED', 'DISCOVERED', 'VISITED', 'INVESTIGATED', 'RESOLVED']);
export type DiscoveryState = z.infer<typeof discoverySchema>;
export const DISCOVERY_ORDER = discoverySchema.options;

// Immutable generated facts. Coordinates are domain-native; units are mandatory.
export const siteFactsSchema = z.object({
  id, worldId: id, regionId: id, archetypeId: id, seed: tick,
  coordinates: position,
  spatialBounds: z.object({ radius: z.number().finite().positive(), unit: id }).strict(),
  name: text, description: text, origin: text, formationEpoch: text,
  association: text,
  simulationDependencies: z.array(id).max(64),
  // Extensions must remain JSON-compatible; they are facts, not mutable simulation fields.
  extensions: z.record(z.union([z.string().max(1000), z.number().finite(), z.boolean()])),
  schemaVersion: z.literal(1),
}).strict();
export type SiteFacts = z.infer<typeof siteFactsSchema>;

export const evidenceRuleSchema = z.object({
  id, label: text,
  source: z.enum(['condition', 'hazard', 'resource', 'reading']),
  resourceId: id.optional(),
  unit: id.optional(),
  comparison: z.enum(['atLeast', 'atMost']), threshold: z.number().finite(),
}).strict().superRefine((rule, ctx) => {
  if (['resource', 'reading'].includes(rule.source) && !rule.resourceId) ctx.addIssue({ code: 'custom', message: 'Resource evidence requires resourceId' });
});

export const siteDefinitionSchema = z.object({
  facts: siteFactsSchema,
  initial: z.object({
    condition: amount.max(100), hazard: amount.max(100),
    inhabitants: z.array(id).max(128), resources: z.record(amount),
    readings: z.record(z.number().finite()).optional(),
  }).strict(),
  availableInteractions: z.array(z.enum(['survey', 'discover', 'investigate', 'repair', 'recover', 'resolve', 'operate'])).max(7),
  evidence: z.array(evidenceRuleSchema).max(32),
  renderPresentation: z.object({ glyph: id, silhouette: id }).strict(),
  accessibilityPresentation: z.object({ detectedLabel: text, surveyedDescription: text }).strict(),
}).strict();
export type SiteDefinition = z.infer<typeof siteDefinitionSchema>;

export const regionSchema = z.object({
  id, label: text, hazard: amount.max(100),
}).strict();
const edgeSchema = z.object({
  id, from: id, to: id, travelTicks: tick.positive(), fuel: amount, blocked: z.boolean(),
}).strict();
export const atlasSchema = z.object({
  schemaVersion: z.literal(1), worldId: id,
  regions: z.array(regionSchema).min(1).max(2048),
  routes: z.array(edgeSchema).max(8192),
  sites: z.array(siteDefinitionSchema).max(8192),
  chains: z.array(z.object({
    id, steps: z.array(z.object({ siteId: id, evidenceId: id }).strict()).min(3).max(32),
  }).strict()).max(128),
}).strict().superRefine((atlas, ctx) => {
  const problem = (message: string) => ctx.addIssue({ code: 'custom', message });
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length) problem(`Duplicate ${label}`);
  };
  unique(atlas.regions.map(r => r.id), 'region ID');
  unique(atlas.routes.map(r => r.id), 'route ID');
  unique(atlas.sites.map(s => s.facts.id), 'site ID');
  unique(atlas.chains.map(c => c.id), 'chain ID');
  const regions = new Set(atlas.regions.map(r => r.id));
  for (const route of atlas.routes) {
    if (!regions.has(route.from) || !regions.has(route.to) || route.from === route.to) problem('Invalid route endpoints');
  }
  // Validate topological connectivity separately from temporary route blockages.
  const reached = new Set([atlas.regions[0].id]);
  for (let i = 0; i < atlas.regions.length; i++) {
    for (const route of atlas.routes) {
      if (reached.has(route.from)) reached.add(route.to);
      if (reached.has(route.to)) reached.add(route.from);
    }
  }
  if (reached.size !== regions.size) problem('Disconnected region graph');
  for (const site of atlas.sites) {
    if (site.facts.worldId !== atlas.worldId || !regions.has(site.facts.regionId)) problem('Site world/region mismatch');
    unique(site.availableInteractions, 'site interaction');
    unique(site.evidence.map(e => e.id), 'site evidence ID');
    for (const evidence of site.evidence) {
      if (evidence.source === 'reading' && !Object.hasOwn(site.initial.readings ?? {}, evidence.resourceId!)) problem('Unknown evidence reading');
      if (evidence.source === 'resource' && !Object.hasOwn(site.initial.resources, evidence.resourceId!)) problem('Unknown evidence resource');
    }
  }
  for (const chain of atlas.chains) {
    unique(chain.steps.map(s => s.siteId), 'chain location');
    for (const step of chain.steps) {
      if (!atlas.sites.find(s => s.facts.id === step.siteId)?.evidence.some(e => e.id === step.evidenceId)) problem('Invalid chain evidence reference');
    }
  }
});
export type ExplorationAtlas = z.infer<typeof atlasSchema>;

export const observationSchema = z.object({
  evidenceId: id, tick, branchId: id, value: z.number().finite(), unit: id,
  classification: z.literal('OBSERVED'),
}).strict();
export const siteDeltaSchema = z.object({
  discoveryState: discoverySchema, condition: amount.max(100), hazard: amount.max(100), mitigation: amount.max(100).default(0),
  inhabitants: z.array(id).max(128), resources: z.record(amount),
  readings: z.record(z.number().finite()).default({}),
  evidence: z.array(observationSchema).max(32),
  eventReferences: z.array(id).max(128),
  firstVisitedTick: tick.nullable(),
}).strict();
export const historySchema = z.object({
  id, branchId: id, tick, siteId: id,
  action: z.enum(['detect', 'survey', 'discover', 'depart', 'arrive', 'investigate', 'repair', 'recover', 'resolve', 'operate']),
  before: text, after: text,
}).strict();
export type ExplorationEvent = z.infer<typeof historySchema>;
export const explorationStateSchema = z.object({
  schemaVersion: z.literal(1), worldId: id, lastTick: tick, sequence: tick,
  sites: z.record(siteDeltaSchema),
  regionHazards: z.record(amount.max(100)),
  blockedRoutes: z.record(z.boolean()),
  expedition: z.object({
    regionId: id, fuel: amount, supplies: amount, cargo: z.record(amount),
    journey: z.object({ siteId: id, routeIds: z.array(id).max(2048), arrivalTick: tick }).strict().nullable(),
  }).strict(),
  journal: z.array(historySchema).max(128),
  // Compacted totals preserve action counts after bounded journal eviction.
  actionCounts: z.record(tick),
}).strict();
export type ExplorationState = z.infer<typeof explorationStateSchema>;
