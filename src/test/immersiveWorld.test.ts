import { describe, expect, it } from 'vitest';
import { makeImmersiveLayout, SCENE_PROFILES, sceneHash } from '../exploration/immersiveLayout';
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
      const layout = makeImmersiveLayout(state.atlas, state.exploration);
      expect(layout.points).toHaveLength(state.atlas.sites.length);
      expect(layout.extent).toBeGreaterThan(100);
      expect(layout.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.z))).toBe(true);
      expect(makeImmersiveLayout(state.atlas, state.exploration)).toEqual(layout);
      expect(kernel.getStateHash()).toBe(before);
    }
  });
  it('creates stable visual hashes without simulation RNG', () => {
    expect(sceneHash('example')).toBe(sceneHash('example'));
    expect(sceneHash('example')).not.toBe(sceneHash('other'));
  });
});
