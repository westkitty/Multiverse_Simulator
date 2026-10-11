import { z } from 'zod';
import { SeededRng } from '../core/rng';
import { atlasSchema, ExplorationAtlas, SiteDefinition, siteDefinitionSchema } from './contracts';

const socketSchema = z.object({
  id: z.string().min(1).max(80), regionId: z.string().min(1),
  coordinates: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
  clearance: z.number().finite().positive(), tags: z.array(z.string()),
}).strict();
export type PlacementSocket = z.infer<typeof socketSchema>;
export interface PopulationArchetype {
  requiredTags: string[];
  definition: SiteDefinition;
}

/** Environmental planners supply non-overlapping, domain-valid sockets, not arbitrary scatter.
 * A socket-local RNG stream makes generation independent of region/chunk visitation order.
 * No global simulation RNG is consumed. No population minima are invented here.
 */
export function populateAtlas(
  base: Omit<ExplorationAtlas, 'sites'>,
  seed: number,
  rawSockets: PlacementSocket[],
  archetypes: PopulationArchetype[],
): ExplorationAtlas {
  z.number().int().nonnegative().max(0xffffffff).parse(seed);
  const sockets = rawSockets.map(s => socketSchema.parse(s)).sort((a, b) => a.id.localeCompare(b.id, 'en'));
  if (new Set(sockets.map(s => s.id)).size !== sockets.length) throw new Error('Duplicate placement socket');
  const templates = archetypes.map(a => ({ requiredTags: [...a.requiredTags], definition: siteDefinitionSchema.parse(a.definition) }))
    .sort((a, b) => a.definition.facts.archetypeId.localeCompare(b.definition.facts.archetypeId, 'en'));
  if (new Set(templates.map(a => a.definition.facts.archetypeId)).size !== templates.length) throw new Error('Duplicate archetype');
  const sites = sockets.map(socket => {
    const eligible = templates.filter(a => a.requiredTags.every(tag => socket.tags.includes(tag)) && a.definition.facts.spatialBounds.radius <= socket.clearance);
    if (!eligible.length) throw new Error(`No environmentally compatible archetype at ${socket.id}`);
    const rng = new SeededRng(seed).stream(`population:${base.worldId}:${socket.regionId}:${socket.id}`);
    const template = rng.pick(eligible).definition;
    return siteDefinitionSchema.parse({
      ...template,
      facts: { ...template.facts, id: `${base.worldId}:${socket.id}`, worldId: base.worldId,
        regionId: socket.regionId, coordinates: socket.coordinates, seed: rng.nextInt(1, 0xffffffff) },
    });
  });
  for (let i = 0; i < sites.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = sites[i].facts, b = sites[j].facts;
      if (a.spatialBounds.unit !== b.spatialBounds.unit) throw new Error('Atlas coordinates require consistent units');
      const distance = Math.hypot(...a.coordinates.map((v, k) => v - b.coordinates[k]));
      if (distance < a.spatialBounds.radius + b.spatialBounds.radius) throw new Error(`Overlapping placements: ${a.id}, ${b.id}`);
    }
  }
  return atlasSchema.parse({ ...base, regions: [...base.regions].sort((a, b) => a.id.localeCompare(b.id, 'en')),
    routes: [...base.routes].sort((a, b) => a.id.localeCompare(b.id, 'en')),
    chains: [...base.chains].sort((a, b) => a.id.localeCompare(b.id, 'en')), sites });
}
