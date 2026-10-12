import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { addImmersiveScenery, addImmersiveFlora } from '../renderers/immersiveScenery';
import { addImmersiveAtmosphere } from '../renderers/immersiveAtmosphere';
import { addImmersiveTerrain, terrainHeight } from '../renderers/immersiveTerrain';
import { makeImmersiveLayout, movementBasis, projectImmersiveActors, SCENE_PROFILES, sceneHash, spawnViewAngles, yawToward } from '../exploration/immersiveLayout';
import { CORE_WORLD_PLUGINS } from '../worlds';
import { SimulationKernel } from '../core/kernel';
import { isFrontierState } from '../worlds/frontiers/frontierPlugin';

describe('Immersive Three.js scene projection', () => {
  it('assigns an explicit exploration environment to all fifteen registered worlds', () => {
    expect(CORE_WORLD_PLUGINS).toHaveLength(15);
    for (const world of CORE_WORLD_PLUGINS) {
      expect(SCENE_PROFILES[world.id]).toBeDefined();
    }
    expect(new Set(Object.values(SCENE_PROFILES).map(p => p.architecture)).size).toBe(15);
  });
  it('does not modify authoritative simulation state or RNG while projecting scenes', () => {
    for (const plugin of CORE_WORLD_PLUGINS) {
      const scenario = plugin.scenarios[0];
      const kernel = new SimulationKernel({
        runId: 'immersive-' + plugin.id,
        name: 'Immersive projection',
        plugin,
        seed: scenario.seed,
        config: scenario.config,
      });
      const state = kernel.getState();
      expect(isFrontierState(state)).toBe(true);
      if (!isFrontierState(state)) continue;
      const before = kernel.getStateHash();
      const layout = makeImmersiveLayout(state.atlas, state.exploration, state.regions);
      expect(layout.points).toHaveLength(state.atlas.sites.length);
      expect(layout.extent).toBeGreaterThan(100);
      expect(layout.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.z))).toBe(true);
      expect(makeImmersiveLayout(state.atlas, state.exploration, state.regions)).toEqual(layout);
      expect(Object.keys(layout.regionAnchors)).toHaveLength(state.atlas.regions.length);
      expect(Object.values(layout.regionAnchors).every(pos => Math.max(Math.abs(pos.x), Math.abs(pos.z)) + 20 <= layout.extent)).toBe(true);
      expect(projectImmersiveActors(state).length).toBeGreaterThan(0);
      expect(kernel.getStateHash()).toBe(before);
    }
  });
  it('spawns beside the known local expedition contact instead of an unknown neighbor', () => {
    const plugin = CORE_WORLD_PLUGINS.find(world => world.id === 'ecosystem')!;
    const scenario = plugin.scenarios[0];
    const kernel = new SimulationKernel({ runId: 'spawn-proof', name: 'Spawn proof', plugin, seed: scenario.seed, config: scenario.config });
    const state = kernel.getState();
    expect(isFrontierState(state)).toBe(true);
    if (!isFrontierState(state)) return;
    const layout = makeImmersiveLayout(state.atlas, state.exploration, state.regions);
    const local = layout.points.find(site => site.regionId === state.exploration.expedition.regionId && site.discovery !== 'UNKNOWN');
    expect(local).toBeDefined();
    const nearest = [...layout.points].sort((a,b) => Math.hypot(a.x - layout.spawn.x, a.z - layout.spawn.z) - Math.hypot(b.x - layout.spawn.x, b.z - layout.spawn.z))[0];
    expect(nearest.id).toBe(local!.id);
  });

  it('renders actual region corridors and updates their geometry when an authoritative route closes', () => {
    const plugin = CORE_WORLD_PLUGINS.find(world => world.id === 'ecosystem')!;
    const scenario = plugin.scenarios[0];
    const kernel = new SimulationKernel({ runId: 'route-scene', name: 'Route scene', plugin, seed: scenario.seed, config: scenario.config });
    const state = kernel.getState();
    expect(isFrontierState(state)).toBe(true);
    if (!isFrontierState(state)) return;
    const layout = makeImmersiveLayout(state.atlas, state.exploration, state.regions);
    const before = kernel.getStateHash();
    const scene = new THREE.Scene();
    const scenery = addImmersiveScenery(scene, state.atlas, state.exploration, layout);
    const instances = scene.children.filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh);
    expect(instances).toHaveLength(2);
    const roads = instances[1];
    expect(roads.count).toBeGreaterThan(0);
    const route = state.atlas.routes.find(item => {
      const a = layout.regionAnchors[item.from], b = layout.regionAnchors[item.to];
      return a && b && Math.hypot(a.x - b.x, a.z - b.z) >= 2 && !state.exploration.blockedRoutes[item.id];
    });
    expect(route).toBeDefined();
    const beforeCount = roads.count;
    scenery.refresh({ ...state.exploration, blockedRoutes: { ...state.exploration.blockedRoutes, [route!.id]: true } });
    expect(roads.count).toBe(beforeCount + 1);
    scenery.refresh(state.exploration);
    expect(roads.count).toBe(beforeCount);
    expect(kernel.getStateHash()).toBe(before);
    scenery.materials.forEach(material => material.dispose());
    scene.traverse(node => { if (node instanceof THREE.Mesh) node.geometry.dispose(); });
  });

  it('creates stable visual hashes without simulation RNG', () => {
    expect(sceneHash('example')).toBe(sceneHash('example'));
    expect(sceneHash('example')).not.toBe(sceneHash('other'));
  });

  it('spawns facing scene content in every world instead of an empty quadrant', () => {
    for (const plugin of CORE_WORLD_PLUGINS) {
      const scenario = plugin.scenarios[0];
      const kernel = new SimulationKernel({ runId: 'facing-' + plugin.id, name: 'Facing proof', plugin, seed: scenario.seed, config: scenario.config });
      const state = kernel.getState();
      expect(isFrontierState(state)).toBe(true);
      if (!isFrontierState(state)) continue;
      const layout = makeImmersiveLayout(state.atlas, state.exploration, state.regions);
      const angles = spawnViewAngles(layout);
      expect(Number.isFinite(angles.yaw)).toBe(true);
      // Contract: the spawn view reveals scene content (never an empty
      // quadrant) and matches the best of the deterministic candidate
      // directions under the same view-cone score.
      const scoreFor = (yaw: number) => layout.points.reduce((score, point) => {
        const dx = point.x - layout.spawn.x, dz = point.z - layout.spawn.z;
        const distance = Math.hypot(dx, dz);
        if (distance > 110) return score;
        const basis = movementBasis(yaw);
        const dot = (dx * basis.forward[0] + dz * basis.forward[1]) / (distance || 1);
        return dot > Math.cos(.62) ? score + 1 / (1 + distance / 35) : score;
      }, 0);
      expect(scoreFor(angles.yaw)).toBeGreaterThan(0);
      let bestBinScore = -1;
      for (let bin = 0; bin < 16; bin++) bestBinScore = Math.max(bestBinScore, scoreFor(bin * Math.PI / 8));
      expect(scoreFor(angles.yaw)).toBeCloseTo(bestBinScore, 10);
    }
  });

  it('moves the player along the camera look direction, not a mirrored basis', () => {
    // QQQ regression: the pre-uplift movement basis mirrored X against the
    // Three.js camera (W drifted sideways at most yaws). This asserts the
    // on-screen forward vector equals movement forward at several headings.
    const camera = new THREE.PerspectiveCamera();
    camera.rotation.order = 'YXZ';
    for (const yaw of [0, .7, -1.2, Math.PI / 2, -Math.PI / 2, Math.PI * .9]) {
      camera.rotation.set(0, yaw, 0);
      camera.updateMatrixWorld();
      const look = new THREE.Vector3();
      camera.getWorldDirection(look);
      const basis = movementBasis(yaw);
      expect(basis.forward[0]).toBeCloseTo(look.x, 6);
      expect(basis.forward[1]).toBeCloseTo(look.z, 6);
      // Camera right is forward rotated -90° about Y: (-fz, fx) in xz.
      expect(basis.right[0]).toBeCloseTo(-basis.forward[1], 6);
      expect(basis.right[1]).toBeCloseTo(basis.forward[0], 6);
    }
    // yawToward must orient the camera at its target.
    for (const [dx, dz] of [[10, 0], [-3, 7], [0, -12], [-6, -8]] as const) {
      const yaw = yawToward(2, -4, 2 + dx, -4 + dz);
      const basis = movementBasis(yaw);
      expect(basis.forward[0] * dx + basis.forward[1] * dz).toBeGreaterThan(0);
    }
  });

  it('builds deterministic bounded visual terrain without touching the kernel', () => {
    for (const plugin of CORE_WORLD_PLUGINS) {
      const profile = SCENE_PROFILES[plugin.id];
      expect(profile).toBeDefined();
      const seed = sceneHash(plugin.id);
      const a = terrainHeight(12.5, -7.25, profile, seed);
      const b = terrainHeight(12.5, -7.25, profile, seed);
      expect(a).toBe(b);
      expect(Math.abs(a)).toBeLessThanOrEqual(profile.terrainAmplitude + 0.001);
      const scenario = plugin.scenarios[0];
      const kernel = new SimulationKernel({ runId: 'terrain-' + plugin.id, name: 'Terrain proof', plugin, seed: scenario.seed, config: scenario.config });
      const state = kernel.getState();
      const before = kernel.getStateHash();
      const scene = new THREE.Scene();
      const atmosphere = addImmersiveAtmosphere(scene, profile, 150, seed);
      const terrain = addImmersiveTerrain(scene, profile, 150, seed);
      expect(scene.children.some(node => node.name === 'immersive-ground')).toBe(true); // displaced ground always present
      expect(atmosphere.textures.length).toBe(1); // gradient sky lives on scene.background
      expect(scene.background).toBeInstanceOf(THREE.DataTexture);
      if (profile.canopyHeight !== null) expect(scene.children.filter(node => node.name !== 'immersive-ground').length).toBeGreaterThanOrEqual(1);
      expect(atmosphere.materials.length + atmosphere.textures.length).toBeGreaterThanOrEqual(1);
      expect(terrain.materials.length).toBeGreaterThan(0);
      if (profile.starfield === 0) {
        expect(atmosphere.materials.some(material => material instanceof THREE.PointsMaterial)).toBe(false);
      } else {
        expect(atmosphere.materials.some(material => material instanceof THREE.PointsMaterial)).toBe(true);
      }
      const layout = makeImmersiveLayout(state.atlas, state.exploration, state.regions);
      const flora = addImmersiveFlora(scene, layout);
      const instances = scene.children.filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh);
      expect(instances).toHaveLength(1); // flora only; scenery adds the other two in its own contract test
      expect(instances[0].count).toBeGreaterThan(0);
      expect(flora.materials.length).toBe(1);
      expect(kernel.getStateHash()).toBe(before);
      scene.traverse(node => {
        const mesh = node as THREE.Mesh;
        if (mesh.isMesh || node instanceof THREE.Points) mesh.geometry.dispose();
        const material = (mesh as THREE.Mesh).material;
        if (material && typeof material === 'object' && 'dispose' in material) (material as THREE.Material).dispose();
      });
    }
  });

  it('keeps exploration projection layout stable across ticks that change no projected field', () => {
    const plugin = CORE_WORLD_PLUGINS.find(world => world.id === 'ecosystem')!;
    const scenario = plugin.scenarios[0];
    const kernel = new SimulationKernel({ runId: 'layout-stability', name: 'Layout stability', plugin, seed: scenario.seed, config: scenario.config });
    const state = kernel.getState();
    expect(isFrontierState(state)).toBe(true);
    if (!isFrontierState(state)) return;
    const before = makeImmersiveLayout(state.atlas, state.exploration, state.regions);
    // A later tick may advance journal/time fields the projection never reads.
    const later = { ...state.exploration, lastTick: state.exploration.lastTick + 7, sequence: state.exploration.sequence + 3 };
    const after = makeImmersiveLayout(state.atlas, later, state.regions);
    expect(after).toEqual(before);
  });
});
