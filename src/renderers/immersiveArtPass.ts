import * as THREE from 'three';
import { ImmersiveLayout, SceneProfile, sceneHash } from '../exploration/immersiveLayout';
import { terrainHeight } from './immersiveTerrain';

export type ImmersiveArtTier = 'lite' | 'full';

/** Stable visual budget per scene; never changes authoritative simulation work. */
export function chooseImmersiveArtTier(input: {
  viewportWidth: number; devicePixelRatio: number; hardwareConcurrency?: number;
  deviceMemory?: number;
}): ImmersiveArtTier {
  if (input.viewportWidth < 740 || (input.hardwareConcurrency ?? 8) <= 4 ||
      (input.deviceMemory ?? 8) <= 4 || input.devicePixelRatio > 2.5) return 'lite';
  return 'full';
}

function structuralGeometry(style: SceneProfile['architecture']): THREE.BufferGeometry {
  switch (style) {
    case 'city': case 'factory': case 'machines':
    case 'settlement': case 'ruins':
      return new THREE.BoxGeometry(1, 1, 1);
    case 'forest': case 'wilds':
      return new THREE.ConeGeometry(.72, 1, 6);
    case 'reef':
      return new THREE.TetrahedronGeometry(.7, 0);
    case 'crags': case 'cavern':
      return new THREE.ConeGeometry(.7, 1, 5);
    case 'orbit': case 'signal':
      return new THREE.OctahedronGeometry(.68, 0);
    case 'storm':
      return new THREE.CylinderGeometry(.14, .25, 1, 6);
    case 'habitat': case 'terraform':
      return new THREE.CylinderGeometry(.8, .9, 1, 10);
  }
}

/** A shared authored material language across all worlds, with silhouettes,
 * shadows and motes selected by the existing 15 distinct scene profiles.
 * Visual-only: no new colliders, POIs, actors, resources, route edges or RNG.
 * Caller owns geometry and material disposal with the existing scene.
 */
export function addImmersiveArtPass(
  scene: THREE.Scene, layout: ImmersiveLayout, visualSeed: number,
  tier: ImmersiveArtTier, reducedMotion = false,
): { materials: THREE.Material[]; update: (timeSeconds: number) => void; tier: ImmersiveArtTier } {
  const profile = layout.profile, style = profile.architecture;
  const sites = layout.points;
  const accent = new THREE.Color(profile.accent);
  const ground = new THREE.Color(profile.ground);
  const materials: THREE.Material[] = [];

  // Cheap painterly contact shading makes structures sit IN the landscape.
  const contactMaterial = new THREE.MeshBasicMaterial({
    color: ground.clone().multiplyScalar(.4), transparent: true, opacity: .34,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
    side: THREE.DoubleSide,
  });
  const shadows = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1, 20), contactMaterial, Math.max(1, sites.length));
  shadows.name = 'aaa-contact-shadows';
  const dummy = new THREE.Object3D();
  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    dummy.position.set(site.x, terrainHeight(site.x, site.z, profile, visualSeed) + .085, site.z);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    const spread = 5.4 + (site.visualSeed % 8) * .13;
    dummy.scale.set(spread, spread * .7, 1);
    dummy.updateMatrix();
    shadows.setMatrixAt(i, dummy.matrix);
  }
  shadows.count = sites.length;
  shadows.instanceMatrix.needsUpdate = true;
  shadows.computeBoundingSphere();
  scene.add(shadows);
  materials.push(contactMaterial);

  // Designed accents near REAL landmarks, not random free-floating clutter.
  // All silhouettes are batched into one GPU instanced draw.
  const motifMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: .75, flatShading: true,
    metalness: ['city', 'factory', 'machines', 'orbit', 'signal'].includes(style) ? .46 : .12,
    emissive: accent.clone().multiplyScalar(.08), emissiveIntensity: .18,
  });
  const motifGeometry = structuralGeometry(style);
  const perSite = tier === 'lite' ? 1 : 2;
  const motifs = new THREE.InstancedMesh(
    motifGeometry, motifMaterial, Math.max(1, sites.length * perSite));
  motifs.name = 'aaa-architectural-silhouettes';
  motifs.userData.architecture = style;
  const color = new THREE.Color();
  let count = 0;
  for (const site of sites) {
    for (let i = 0; i < perSite; i++) {
      const seed = sceneHash(style + ':' + site.id + ':crafted-detail:' + i);
      const angle = (((seed >>> 5) % 4096) / 4096) * Math.PI * 2;
      const distance = 11 + ((seed >>> 18) % 9);
      const x = site.x + Math.cos(angle) * distance;
      const z = site.z + Math.sin(angle) * distance;
      if (Math.hypot(x - layout.spawn.x, z - layout.spawn.z) < 10 ||
          sites.some(other => Math.hypot(x - other.x, z - other.z) < 4.5)) continue;
      const height = 4.5 + ((seed >>> 10) % 8);
      let width = 1.1 + ((seed >>> 4) % 7) * .23;
      if (style === 'forest' || style === 'wilds') width *= 2.2;
      if (style === 'reef' || style === 'cavern' || style === 'crags') width *= 1.9;
      if (style === 'orbit' || style === 'signal') width *= 1.4;
      dummy.position.set(x, terrainHeight(x, z, profile, visualSeed) + height * .5, z);
      if (style === 'orbit' || style === 'signal') dummy.position.y += 5.5;
      dummy.rotation.set(0, angle * .37, 0);
      dummy.scale.set(width, height, width * (style === 'city' ? 1.8 : 1));
      dummy.updateMatrix();
      motifs.setMatrixAt(count, dummy.matrix);
      color.copy(ground).lerp(accent, .23 + (seed % 17) / 100);
      motifs.setColorAt(count, color);
      count++;
    }
  }
  motifs.count = count;
  motifs.instanceMatrix.needsUpdate = true;
  if (motifs.instanceColor) motifs.instanceColor.needsUpdate = true;
  motifs.computeBoundingSphere();
  scene.add(motifs);
  materials.push(motifMaterial);

  // Edge trim: two low-key ribs per structure, one more instanced draw.
  const trimMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: .64,
    depthWrite: false, toneMapped: false,
  });
  const trim = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1), trimMaterial, Math.max(1, count * 2));
  trim.name = 'aaa-silhouette-accents';
  let detailCount = 0;
  const stripeDummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    motifs.getMatrixAt(i, dummy.matrix);
    dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
    const y = dummy.position.y, h = dummy.scale.y, w = dummy.scale.x;
    for (let stripe = 0; stripe < 2; stripe++) {
      stripeDummy.position.set(
        dummy.position.x + (stripe ? w * .33 : -w * .33),
        y + (stripe ? h * .24 : -h * .2),
        dummy.position.z + w * .52);
      stripeDummy.quaternion.copy(dummy.quaternion);
      stripeDummy.scale.set(.12, stripe ? h * .32 : h * .16, .13);
      stripeDummy.updateMatrix();
      trim.setMatrixAt(detailCount, stripeDummy.matrix);
      color.copy(accent).lerp(ground, stripe ? .16 : .46);
      trim.setColorAt(detailCount, color);
      detailCount++;
    }
  }
  trim.count = detailCount;
  trim.instanceMatrix.needsUpdate = true;
  if (trim.instanceColor) trim.instanceColor.needsUpdate = true;
  trim.computeBoundingSphere();
  scene.add(trim);
  materials.push(trimMaterial);

  // Subtle non-flashing motes; one Points draw, fixed buffer, ~10 Hz updates.
  const motesCount = reducedMotion ? 0 : tier === 'lite' ? 36 : 96;
  const seeds = new Float32Array(motesCount * 3);
  const positions = new Float32Array(motesCount * 3);
  for (let i = 0; i < motesCount; i++) {
    const seed = sceneHash(visualSeed + ':mote:' + i);
    const a = (seed % 6283) / 1000;
    const radius = 18 + ((seed >>> 9) % 145);
    seeds[i * 3] = Math.cos(a) * radius;
    seeds[i * 3 + 1] = 5 + ((seed >>> 17) % 33);
    seeds[i * 3 + 2] = Math.sin(a) * radius;
    positions.set(seeds.subarray(i * 3, i * 3 + 3), i * 3);
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particleMaterial = new THREE.PointsMaterial({
    color: accent.clone().lerp(new THREE.Color(profile.celestialColor), .46),
    size: style === 'reef' ? .8 : .58,
    transparent: true, opacity: style === 'storm' ? .28 : .42,
    depthWrite: false, fog: true, sizeAttenuation: true,
  });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.name = 'aaa-ambient-motes';
  if (motesCount > 0) scene.add(particles);
  else particleGeometry.dispose();
  materials.push(particleMaterial);
  let lastUpdate = -1;
  const update = (timeSeconds: number) => {
    if (motesCount === 0 || timeSeconds - lastUpdate < .095) return;
    lastUpdate = timeSeconds;
    const attribute = particleGeometry.getAttribute('position') as THREE.BufferAttribute;
    const data = attribute.array as Float32Array;
    for (let i = 0; i < motesCount; i++) {
      const drift = (i % 7 + 1) * .06;
      data[i * 3] = seeds[i * 3] + Math.sin(timeSeconds * drift + i) * 2.5;
      data[i * 3 + 1] = seeds[i * 3 + 1] + Math.sin(timeSeconds * (drift + .06) + i * .71) * 1.7;
      data[i * 3 + 2] = seeds[i * 3 + 2] + Math.cos(timeSeconds * drift + i * .4) * 2.1;
    }
    attribute.needsUpdate = true;
  };
  return { materials, update, tier };
}
