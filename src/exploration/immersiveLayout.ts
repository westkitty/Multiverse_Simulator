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
  /** Gradient sky dome zenith color (visual only). */
  skyZenith: number;
  /** Star density 0..1; 0 disables the starfield. */
  starfield: number;
  /** Distant sky feature that anchors each world's horizon. */
  celestial: 'sun' | 'moon' | 'ringed-giant' | 'binary-suns' | 'nebula' | 'storm-eye' | 'void';
  celestialColor: number;
  /** Ground displacement style for the walkable/flyable surface. */
  terrain: 'flat' | 'rolling' | 'dunes' | 'crags' | 'terraces' | 'peaks' | 'mounds' | 'deck' | 'cloud-bands';
  /** Peak-to-trough displacement in scene units (visual only). */
  terrainAmplitude: number;
  /** Secondary ground tone mixed into terrain vertex colors. */
  groundTint: number;
  /** Optional translucent ceiling/surface plane height (ocean surface, cavern roof). */
  canopyHeight: number | null;
}

export const SCENE_PROFILES: Record<string, SceneProfile> = {
  ecosystem: { sky: 0x7499aa, horizon: 0x9fc9b2, ground: 0x334e3d, accent: 0x9bdb82, architecture: 'forest', movement: 'walk', description: 'Living woodland, field stations and restored wetlands', skyZenith: 0x3d6f96, starfield: 0, celestial: 'sun', celestialColor: 0xffe6b8, terrain: 'rolling', terrainAmplitude: 3.4, groundTint: 0x4c6b45, canopyHeight: null },
  station: { sky: 0x070e1b, horizon: 0x1a2845, ground: 0x202e3f, accent: 0x55d9e8, architecture: 'habitat', movement: 'walk', description: 'Pressure doors, service corridors and derelict habitats', skyZenith: 0x04070f, starfield: 0, celestial: 'void', celestialColor: 0x55d9e8, terrain: 'deck', terrainAmplitude: 0.9, groundTint: 0x2b3d52, canopyHeight: 26 },
  civilization: { sky: 0xb8b2a0, horizon: 0xd2c39e, ground: 0x6e6851, accent: 0xe9ba73, architecture: 'settlement', movement: 'walk', description: 'River settlements, bridges and deserted civic works', skyZenith: 0x7d91a8, starfield: 0, celestial: 'sun', celestialColor: 0xffd9a0, terrain: 'rolling', terrainAmplitude: 2.6, groundTint: 0x8a7c58, canopyHeight: null },
  atmosphere: { sky: 0x576b88, horizon: 0x95a9bd, ground: 0x3e5268, accent: 0xc1ebff, architecture: 'storm', movement: 'fly', description: 'Storm fronts, weather towers and remote instruments', skyZenith: 0x2c4260, starfield: 0, celestial: 'storm-eye', celestialColor: 0xd8ecff, terrain: 'cloud-bands', terrainAmplitude: 7.5, groundTint: 0x6c86a0, canopyHeight: null },
  ocean: { sky: 0x051e34, horizon: 0x0a4d65, ground: 0x1b4047, accent: 0x72e2dc, architecture: 'reef', movement: 'fly', description: 'Submerged installations, reef towers and deep-sea ruins', skyZenith: 0x02101f, starfield: 0, celestial: 'void', celestialColor: 0x72e2dc, terrain: 'mounds', terrainAmplitude: 4.2, groundTint: 0x14525c, canopyHeight: 54 },
  celestial: { sky: 0x01030c, horizon: 0x080b20, ground: 0x232741, accent: 0xffc87b, architecture: 'orbit', movement: 'fly', description: 'Orbital platforms, distant worlds and stellar stations', skyZenith: 0x01020a, starfield: 1, celestial: 'ringed-giant', celestialColor: 0xffc87b, terrain: 'deck', terrainAmplitude: 1.4, groundTint: 0x2e3358, canopyHeight: null },
  megacity: { sky: 0x101e32, horizon: 0x394b62, ground: 0x242d42, accent: 0xed83d9, architecture: 'city', movement: 'walk', description: 'Dense tower districts and infrastructure corridors', skyZenith: 0x0a1626, starfield: .25, celestial: 'moon', celestialColor: 0xb9c6ff, terrain: 'deck', terrainAmplitude: 0.8, groundTint: 0x2f3a52, canopyHeight: null },
  industrial: { sky: 0x5b6268, horizon: 0x8d8275, ground: 0x4d504b, accent: 0xffbc6a, architecture: 'factory', movement: 'walk', description: 'Conveyors, smokestacks and silent freight terminals', skyZenith: 0x3d464e, starfield: 0, celestial: 'sun', celestialColor: 0xffc98d, terrain: 'flat', terrainAmplitude: 1.1, groundTint: 0x5a5348, canopyHeight: null },
  geology: { sky: 0x765d52, horizon: 0xb38d6f, ground: 0x57433c, accent: 0xff9871, architecture: 'crags', movement: 'walk', description: 'Fault escarpments, basalt ridges and monitoring arrays', skyZenith: 0x4e3a40, starfield: 0, celestial: 'sun', celestialColor: 0xffb189, terrain: 'crags', terrainAmplitude: 6.2, groundTint: 0x6e4a3a, canopyHeight: null },
  'wild-meridian': { sky: 0x839e80, horizon: 0xc0bd83, ground: 0x53663e, accent: 0xebe085, architecture: 'wilds', movement: 'walk', description: 'Overgrown frontier trails and unexpected wilderness', skyZenith: 0x5d86a0, starfield: 0, celestial: 'sun', celestialColor: 0xffe9a8, terrain: 'rolling', terrainAmplitude: 4.6, groundTint: 0x6a7a42, canopyHeight: null },
  'hollow-deep': { sky: 0x090e19, horizon: 0x18263a, ground: 0x323b47, accent: 0x78e2ee, architecture: 'cavern', movement: 'walk', description: 'Cavern columns, subterranean pools and forgotten routes', skyZenith: 0x05080f, starfield: .12, celestial: 'void', celestialColor: 0x78e2ee, terrain: 'crags', terrainAmplitude: 5.4, groundTint: 0x27323f, canopyHeight: 30 },
  'timeworn-empire': { sky: 0x9e8d7f, horizon: 0xc4a993, ground: 0x61534b, accent: 0xffcc91, architecture: 'ruins', movement: 'walk', description: 'Layered ruins, fallen monuments and reclaimed streets', skyZenith: 0x6d7892, starfield: 0, celestial: 'sun', celestialColor: 0xffd6a5, terrain: 'terraces', terrainAmplitude: 3.8, groundTint: 0x7a6350, canopyHeight: null },
  'terraforming-frontier': { sky: 0x7f7b9c, horizon: 0xb19abb, ground: 0x70546b, accent: 0xa3ffd1, architecture: 'terraform', movement: 'walk', description: 'Artificial habitats, greenhouse domes and unfinished ecology', skyZenith: 0x544f80, starfield: .35, celestial: 'moon', celestialColor: 0xc9b7ff, terrain: 'dunes', terrainAmplitude: 3.2, groundTint: 0x7d5c72, canopyHeight: null },
  'machine-wilderness': { sky: 0x384957, horizon: 0x66828d, ground: 0x3c4b4a, accent: 0x75fff0, architecture: 'machines', movement: 'walk', description: 'Autonomous structures among abandoned service networks', skyZenith: 0x22323e, starfield: .18, celestial: 'moon', celestialColor: 0x9fd8e8, terrain: 'mounds', terrainAmplitude: 3.6, groundTint: 0x44564f, canopyHeight: null },
  'signal-expanse': { sky: 0x070920, horizon: 0x24204c, ground: 0x252443, accent: 0xba94ff, architecture: 'signal', movement: 'fly', description: 'Transmission spires, resonance fields and luminous relays', skyZenith: 0x03041a, starfield: .85, celestial: 'nebula', celestialColor: 0xba94ff, terrain: 'flat', terrainAmplitude: 1.6, groundTint: 0x2f2b55, canopyHeight: null },
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
  regionAnchors: Record<string, { x: number; z: number }>;
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
  // Start next to a legitimate, locally recognized expedition contact. Choose
  // a clear viewing angle where that contact is closer than neighboring sites.
  const local = points.find(point => point.regionId === state.expedition.regionId && point.discovery !== 'UNKNOWN')
    ?? points.find(point => point.regionId === state.expedition.regionId) ?? points[0];
  // Wide enough that landmark facades do not bury the camera at spawn, while
  // staying inside the 12-unit inspection range of the local contact.
  const placeSpawn = (spawnRadius: number) => {
    const candidates = Array.from({ length: 32 }, (_, index) => {
      const angle = index * Math.PI * 2 / 32;
      const x = (local?.x ?? 0) + Math.cos(angle) * spawnRadius;
      const z = (local?.z ?? 0) + Math.sin(angle) * spawnRadius;
      const rivals = points.filter(point => point.id !== local?.id);
      const nearestRival = rivals.reduce((best, point) => Math.min(best, Math.hypot(point.x - x, point.z - z)), Infinity);
      return { x, z, margin: nearestRival - spawnRadius };
    });
    candidates.sort((a, b) => b.margin - a.margin);
    return candidates[0] ?? { x: 0, z: 0, margin: -Infinity };
  };
  let spawn = placeSpawn(8.5);
  if (!(spawn.margin > 0)) spawn = placeSpawn(5.5);
  const regionAnchors: Record<string, { x: number; z: number }> = Object.fromEntries(regionPositions.map(region => [region.id, { x: (region.position[0] - centerX) * scale, z: (region.position[2] - centerZ) * scale }]));
  for (const region of atlas.regions) {
    if (Object.hasOwn(regionAnchors, region.id)) continue;
    const ownSites = points.filter(point => point.regionId === region.id);
    if (ownSites.length) regionAnchors[region.id] = { x: ownSites.reduce((total, place) => total + place.x, 0) / ownSites.length, z: ownSites.reduce((total, place) => total + place.z, 0) / ownSites.length };
  }
  return {
    points,
    spawn: { x: spawn.x, z: spawn.z },
    profile,
    sourceTransform: { centerX, centerZ, scale },
    regionAnchors,
    extent: Math.max(130, ...points.map(p => Math.max(Math.abs(p.x), Math.abs(p.z)) + 22), ...Object.values(regionAnchors).map(p => Math.max(Math.abs(p.x), Math.abs(p.z)) + 22)),
  };
}

/**
 * Movement basis aligned with the Three.js YXZ camera (verified against
 * THREE.PerspectiveCamera.getWorldDirection). Forward is the camera's world
 * look direction projected to the ground plane; right is perpendicular.
 */
export function movementBasis(yaw: number): { forward: readonly [number, number]; right: readonly [number, number] } {
  return {
    forward: [-Math.sin(yaw), -Math.cos(yaw)],
    right: [Math.cos(yaw), -Math.sin(yaw)],
  };
}

/**
 * Camera orientation for first impression and post-arrival. The player never
 * spawns staring into an empty quadrant: among deterministic candidate
 * directions, choose the yaw that reveals the most scene content (sites are
 * weighted by proximity). The nearest landmark contributes strong weight at
 * spawn distance, so it stays framed whenever its surroundings are not empty.
 * Presentation-only; never feeds into simulation movement.
 */
export function spawnViewAngles(layout: ImmersiveLayout): { yaw: number; pitch: number } {
  if (!layout.points.length) return { yaw: -.5, pitch: -.12 };
  const scoreFor = (yaw: number) => {
    let score = 0;
    for (const point of layout.points) {
      const dx = point.x - layout.spawn.x, dz = point.z - layout.spawn.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 110) continue;
      const basis = movementBasis(yaw);
      const lookX = basis.forward[0], lookZ = basis.forward[1];
      const dot = (dx * lookX + dz * lookZ) / (distance || 1);
      if (dot > Math.cos(.62)) score += 1 / (1 + distance / 35);
    }
    return score;
  };
  let yaw = 0;
  let bestScore = -1;
  for (let bin = 0; bin < 16; bin++) {
    const candidate = bin * Math.PI / 8;
    const score = scoreFor(candidate);
    if (score > bestScore) { bestScore = score; yaw = candidate; }
  }
  return { yaw, pitch: -.1 };
}

/** Yaw that turns the camera toward a world-space point. */
export function yawToward(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
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
