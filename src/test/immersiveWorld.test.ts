import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { addImmersiveScenery } from '../renderers/immersiveScenery';
import { makeImmersiveLayout, projectImmersiveActors, SCENE_PROFILES, sceneHash } from '../exploration/immersiveLayout';
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
      expect(projectImmersiveActors(state).length).toBeGreaterThan(0);
      expect(kernel.getStateHash()).toBe(before);
    }
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
});
