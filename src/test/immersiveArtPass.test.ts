import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { addImmersiveArtPass, chooseImmersiveArtTier } from '../renderers/immersiveArtPass';
import { addImmersiveFacadeDetails } from '../renderers/immersiveFacadeDetails';
import { makeImmersiveLayout, sceneHash } from '../exploration/immersiveLayout';
import { CORE_WORLD_PLUGINS } from '../worlds';
import { isFrontierState } from '../worlds/frontiers/frontierPlugin';
import { SimulationKernel } from '../core/kernel';

describe('AAA native-world art direction', () => {
  it('uses bounded quality budgets without touching gameplay', () => {
    expect(chooseImmersiveArtTier({viewportWidth:390,devicePixelRatio:3})).toBe('lite');
    expect(chooseImmersiveArtTier({viewportWidth:1280,devicePixelRatio:1,hardwareConcurrency:2})).toBe('lite');
    expect(chooseImmersiveArtTier({viewportWidth:1280,devicePixelRatio:1,deviceMemory:2})).toBe('lite');
    expect(chooseImmersiveArtTier({viewportWidth:1280,devicePixelRatio:1,hardwareConcurrency:8})).toBe('full');
  });

  it('draws all 15 native visual identities with fixed GPU submission ceilings', () => {
    expect(CORE_WORLD_PLUGINS).toHaveLength(15);
    for (const plugin of CORE_WORLD_PLUGINS) {
      const scenario = plugin.scenarios[0];
      const kernel = new SimulationKernel({runId:'aaa-'+plugin.id,name:'AAA art proof',plugin,seed:scenario.seed,config:scenario.config});
      const before = kernel.getStateHash();
      const native = kernel.getState();
      expect(isFrontierState(native),plugin.id).toBe(true);
      if (!isFrontierState(native)) continue;
      const layout = makeImmersiveLayout(native.atlas,native.exploration,native.regions);
      const scene = new THREE.Scene();
      const pass = addImmersiveArtPass(scene,layout,sceneHash(plugin.id),'full');
      const instances = scene.children.filter((object): object is THREE.InstancedMesh => object instanceof THREE.InstancedMesh);
      const particles = scene.getObjectByName('aaa-ambient-motes') as THREE.Points | undefined;
      expect(instances,plugin.id).toHaveLength(3);
      expect(instances[0].count,plugin.id).toBe(native.atlas.sites.length);
      expect(instances[1].count,plugin.id).toBeLessThanOrEqual(native.atlas.sites.length * 2);
      expect(instances[1].count,plugin.id).toBeGreaterThan(0);
      expect(instances[2].count,plugin.id).toBe(instances[1].count * 2);
      expect(particles,plugin.id).toBeInstanceOf(THREE.Points);
      expect((particles!.geometry.getAttribute('position') as THREE.BufferAttribute).count).toBe(96);
      const positions = particles!.geometry.getAttribute('position') as THREE.BufferAttribute;
      const starting = (positions.array as Float32Array).slice();
      pass.update(1);
      pass.update(1.2);
      expect(Array.from(positions.array as Float32Array),plugin.id).not.toEqual(Array.from(starting));
      const facade = addImmersiveFacadeDetails(scene,layout,'full');
      expect(facade.count,plugin.id).toBeGreaterThan(0);
      expect(facade.count,plugin.id).toBeLessThanOrEqual(native.atlas.sites.length * 20);
      expect(scene.getObjectByName('aaa-native-facade-details'),plugin.id).toBeInstanceOf(THREE.InstancedMesh);
      expect(kernel.getStateHash(),plugin.id).toBe(before);
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) object.geometry.dispose();
      });
      pass.materials.forEach(material => material.dispose());
      facade.materials.forEach(material => material.dispose());
    }
  });

  it('disables particle motion completely under reduced motion and halves structure count on lite devices', () => {
    const plugin = CORE_WORLD_PLUGINS[0], scenario = plugin.scenarios[0];
    const kernel = new SimulationKernel({runId:'aaa-lite',name:'Lite art',plugin,seed:scenario.seed,config:scenario.config});
    const native = kernel.getState();
    if (!isFrontierState(native)) throw new Error('Atlas missing');
    const layout = makeImmersiveLayout(native.atlas,native.exploration,native.regions);
    const fullScene = new THREE.Scene(), liteScene = new THREE.Scene();
    const full = addImmersiveArtPass(fullScene,layout,sceneHash(plugin.id),'full');
    const lite = addImmersiveArtPass(liteScene,layout,sceneHash(plugin.id),'lite',true);
    expect(liteScene.getObjectByName('aaa-ambient-motes')).toBeUndefined();
    const first = fullScene.getObjectByName('aaa-architectural-silhouettes') as THREE.InstancedMesh;
    const second = liteScene.getObjectByName('aaa-architectural-silhouettes') as THREE.InstancedMesh;
    expect(second.count).toBeLessThanOrEqual(first.count);
    expect(lite.tier).toBe('lite');
    lite.update(60);
    for (const [scene,pass] of [[fullScene,full],[liteScene,lite]] as const) {
      scene.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.Points)object.geometry.dispose();});
      pass.materials.forEach(material=>material.dispose());
    }
  });
});
