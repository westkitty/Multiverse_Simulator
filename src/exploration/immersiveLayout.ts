import { ExplorationAtlas, ExplorationState, DiscoveryState } from './contracts';
import { presentSite, surveyCoverage } from './engine';

/**
 * Pure, read-only projection of the authoritative Atlas into walkable scene space.
 * Native spatial units differ across worlds, so the view applies a uniform scene scale.
 * Never pass these positions back to the simulation as a movement/route command.
 */
export interface SceneProfile {
  sky: number;
  horizon: number;
  ground: number;
  accent: number;
  architecture: 'forest' | 'habitat' | 'settlement' | 'storm' | 'reef' | 'orbit' |
    'city' | 'factory' | 'crags' | 'wilds' | 'cavern' | 'ruins' | 'terraform' | 'machines' | 'signal';
  movement: 'walk' | 'fly';
  description: string;
}

export const SCENE_PROFILES: Record<string, SceneProfile> = {
  ecosystem: { sky: 0x7499aa, horizon: 0x9fc9b2, ground: 0x334e3d, accent: 0x9bdb82, architecture: 'forest', movement: 'walk', description: 'Living woodland, field stations and restored wetlands' },
  station: { sky: 0x070e1b, horizon: 0x1a2845, ground: 0x202e3f, accent: 0x55d9e8, architecture: 'habitat', movement: 'walk', description: 'Pressure doors, service corridors and derelict habitats' },
  civilization: { sky: 0xb8b2a0, horizon: 0xd2c39e, ground: 0x6e6851, accent: 0xe9ba73, architecture: 'settlement', movement: 'walk', description: 'River settlements, bridges and deserted civic works' },
  atmosphere: { sky: 0x576b88, horizon: 0x95a9bd, ground: 0x3e5268, accent: 0xc1ebff, architecture: 'storm', movement: 'fly', description: 'Storm fronts, weather towers and remote instruments' },
  ocean: { sky: 0x051e34, horizon: 0x0a4d65, ground: 0x1b4047, accent: 0x72e2dc, architecture: 'reef', movement: 'fly', description: 'Submerged installations, reef towers and deep-sea ruins' },
  celestial: { sky: 0x01030c, horizon: 0x080b20, ground: 0x232741, accent: 0xffc87b, architecture: 'orbit', movement: 'fly', description: 'Orbital platforms, distant worlds and stellar stations' },
  megacity: { sky: 0x101e32, horizon: 0x394b62, ground: 0x242d42, accent: 0xed83d9, architecture: 'city', movement: 'walk', description: 'Dense tower districts and infrastructure corridors' },
  industrial: { sky: 0x5b6268, horizon: 0x8d8275, ground: 0x4d504b, accent: 0xffbc6a, architecture: 'factory', movement: 'walk', description: 'Conveyors, smokestacks and silent freight terminals' },
  geology: { sky: 0x765d52, horizon: 0xb38d6f, ground: 0x57433c, accent: 0xff9871, architecture: 'crags', movement: 'walk', description: 'Fault escarpments, basalt ridges and monitoring arrays' },
  'wild-meridian': { sky: 0x839e80, horizon: 0xc0bd83, ground: 0x53663e, accent: 0xebe085, architecture: 'wilds', movement: 'walk', description: 'Overgrown frontier trails and unexpected wilderness' },
  'hollow-deep': { sky: 0x090e19, horizon: 0x18263a, ground: 0x323b47, accent: 0x78e2ee, architecture: 'cavern', movement: 'walk', description: 'Cavern columns, subterranean pools and forgotten routes' },
  'timeworn-empire': { sky: 0x9e8d7f, horizon: 0xc4a993, ground: 0x61534b, accent: 0xffcc91, architecture: 'ruins', movement: 'walk', description: 'Layered ruins, fallen monuments and reclaimed streets' },
  'terraforming-frontier': { sky: 0x7f7b9c, horizon: 0xb19abb, ground: 0x70546b, accent: 0xa3ffd1, architecture: 'terraform', movement: 'walk', description: 'Artificial habitats, greenhouse domes and unfinished ecology' },
  'machine-wilderness': { sky: 0x384957, horizon: 0x66828d, ground: 0x3c4b4a, accent: 0x75fff0, architecture: 'machines', movement: 'walk', description: 'Autonomous structures among abandoned service networks' },
  'signal-expanse': { sky: 0x070920, horizon: 0x24204c, ground: 0x252443, accent: 0xba94ff, architecture: 'signal', movement: 'fly', description: 'Transmission spires, resonance fields and luminous relays' },
};

export interface ImmersiveLandmark {
  id: string;
  regionId: string;
  x: number;
  z: number;
  height: number;
  label: string;
  discovery: DiscoveryState;
  condition: number | null;
  hazard: number | null;
  covered: boolean;
  visualSeed: number;
}

export interface ImmersiveLayout {
  points: ImmersiveLandmark[];
  spawn: { x: number; z: number };
  profile: SceneProfile;
  extent: number;
  sourceTransform: { centerX: number; centerZ: number; scale: number };
}

/** Stable geometry variation; visual-only, never consumes SimulationKernel RNG. */
export function sceneHash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

export function makeImmersiveLayout(atlas: ExplorationAtlas, state: ExplorationState, regionPositions: ReadonlyArray<{ id: string; position: readonly [number, number, number] }> = []): ImmersiveLayout {
  const profile = SCENE_PROFILES[atlas.worldId] ?? SCENE_PROFILES.ecosystem;
  const sites = atlas.sites;
  const xs = [...sites.map(s => s.facts.coordinates[0]), ...regionPositions.map(r => r.position[0])];
  const zs = [...sites.map(s => s.facts.coordinates[2]), ...regionPositions.map(r => r.position[2])];
  const minX = Math.min(0, ...xs), maxX = Math.max(0, ...xs);
  const minZ = Math.min(0, ...zs), maxZ = Math.max(0, ...zs);
  const span = Math.max(1, maxX - minX, maxZ - minZ);
  const centerX = (minX + maxX) / 2, centerZ = (minZ + maxZ) / 2;
  const scale = 210 / span;
  const coverage = surveyCoverage(atlas, state);
  const placed: Array<{ x: number; z: number }> = [];
  const points = sites.map(site => {
    const fact = site.facts;
    let x = (fact.coordinates[0] - centerX) * scale;
    let z = (fact.coordinates[2] - centerZ) * scale;
    // Small deterministic display offsets for coincident module coordinates.
    // Actual native coordinates remain untouched in the Atlas and saved history.
    for (let attempt = 0; attempt < 12 && placed.some(other => Math.hypot(other.x - x, other.z - z) < 4); attempt++) {
      const angle = (sceneHash(fact.id) % 360) * Math.PI / 180 + attempt * 2.39996;
      x += Math.cos(angle) * (2 + attempt);
      z += Math.sin(angle) * (2 + attempt);
    }
    placed.push({ x, z });
    const delta = state.sites[fact.id];
    const visible = delta.discoveryState !== 'UNKNOWN' ? presentSite(atlas, state, fact.id) : null;
    return {
      id: fact.id,
      regionId: fact.regionId,
      x,
      z,
      height: 0,
      label: visible?.label ?? 'Unidentified contact',
      discovery: delta.discoveryState,
      condition: visible?.condition ?? null,
      hazard: visible && visible.condition !== null ? delta.hazard : null,
      covered: coverage.has(fact.regionId),
      visualSeed: sceneHash(fact.id),
    };
  });
  const local = points.find(point => point.regionId === state.expedition.regionId) ?? points[0];
  return {
    points,
    spawn: { x: (local?.x ?? 0) + 7, z: (local?.z ?? 0) + 9 },
    profile,
    sourceTransform: { centerX, centerZ, scale },
    extent: Math.max(130, ...points.map(p => Math.max(Math.abs(p.x), Math.abs(p.z)) + 22)),
  };
}


export interface ImmersiveActorMarker {
  id: string;
  regionId: string;
  role: number;
  energy: number;
  task: string;
  nativePosition: [number, number] | null;
}

/**
 * Reflect only simulated actors, never invent populations from decorative geometry.
 * The nine native Atlas worlds store atlasActors.regionId; frontier worlds store
 * actors.region as an index into their owned regions array.
 */
export function projectImmersiveActors(raw: unknown): ImmersiveActorMarker[] {
  if (!raw || typeof raw !== 'object') return [];
  const state = raw as Record<string, unknown>;
  const regions = Array.isArray(state.regions) ? state.regions : [];
  const roster = Array.isArray(state.atlasActors) ? state.atlasActors
    : Array.isArray(state.actors) ? state.actors : [];
  const result: ImmersiveActorMarker[] = [];
  for (const candidate of roster) {
    if (!candidate || typeof candidate !== 'object') continue;
    const actor = candidate as Record<string, unknown>;
    const regionIndex = typeof actor.region === 'number' ? actor.region : -1;
    const region = regions[regionIndex] as { id?: unknown; position?: unknown } | undefined;
    const regionId = typeof actor.regionId === 'string' ? actor.regionId
      : typeof region?.id === 'string' ? region.id : null;
    if (!regionId || typeof actor.id !== 'string') continue;
    const role = typeof actor.role === 'number' && Number.isFinite(actor.role) ? actor.role : 0;
    const energy = typeof actor.energy === 'number' && Number.isFinite(actor.energy) ? actor.energy : 0;
    const nativeRegion = regions.find(candidate => !!candidate && typeof candidate === 'object' && (candidate as { id?: unknown }).id === regionId) as { position?: unknown } | undefined;
    const position = nativeRegion?.position;
    const nativePosition: [number, number] | null = Array.isArray(position) && position.length === 3 && Number.isFinite(position[0]) && Number.isFinite(position[2]) ? [position[0], position[2]] : null;
    result.push({ id: actor.id, regionId, role, energy, task: typeof actor.task === 'string' ? actor.task : 'field-work', nativePosition });
    if (result.length >= 180) break;
  }
  return result;
}
