import * as THREE from 'three';
import { SceneProfile } from '../exploration/immersiveLayout';

/**
 * Deterministic visual terrain: a presentation-only heightfield derived from
 * scene coordinates and a visual seed. The same seed always produces the same
 * surface. Height sampling is shared with camera grounding; it never feeds
 * positions back into the simulation, routes or persistence.
 */
export function terrainHeight(x: number, z: number, profile: SceneProfile, visualSeed: number): number {
  const amplitude = profile.terrainAmplitude;
  if (amplitude <= 0) return 0;
  const phase = (visualSeed % 1024) / 1024 * Math.PI * 2;
  const s1 = Math.sin(x * .021 + phase) * Math.cos(z * .017 - phase * .6);
  const s2 = Math.sin((x + z) * .011 + phase * 1.7);
  switch (profile.terrain) {
    case 'flat':
      return amplitude * .18 * s1;
    case 'rolling':
      return amplitude * (s1 * .62 + s2 * .38);
    case 'dunes':
      return amplitude * Math.abs(Math.sin(x * .026 + phase) * .7 + s2 * .3);
    case 'crags': {
      const ridge = Math.abs(Math.sin(x * .018 + phase) * Math.cos(z * .014 + phase * .4));
      return amplitude * (ridge * .78 + s1 * .22);
    }
    case 'terraces': {
      const raw = amplitude * (s1 * .5 + s2 * .5);
      const step = amplitude * .28;
      return Math.max(-amplitude, Math.min(amplitude, Math.round(raw / step) * step));
    }
    case 'peaks':
      return amplitude * (Math.abs(s1) * .55 + Math.abs(s2) * .45);
    case 'mounds':
      return amplitude * (Math.abs(Math.sin(x * .023 + phase) * Math.sin(z * .019 + phase * .8)) * .8 + s2 * .2);
    case 'deck':
      return amplitude * .12 * s1;
    case 'cloud-bands':
      return amplitude * (Math.sin(x * .013 + phase) * .55 + Math.sin(z * .031 + phase * 1.3) * .45);
    default:
      return 0;
  }
}

/** Build the displaced ground surface plus an optional translucent canopy plane. */
export function addImmersiveTerrain(
  scene: THREE.Scene,
  profile: SceneProfile,
  extent: number,
  visualSeed: number,
): { materials: THREE.Material[] } {
  const materials: THREE.Material[] = [];
  const size = extent * 2.7;
  // 40 segments keep gentle heightfields smooth at 7× fewer triangles than a
  // dense grid — measured frame-time sensitive on software rasterizers.
  const segments = 40;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const base = new THREE.Color(profile.ground);
  const tint = new THREE.Color(profile.groundTint);
  const scratch = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    const y = terrainHeight(x, z, profile, visualSeed);
    positions.setY(i, y);
    // Art-directed terrain strata: one existing vertex-colored surface,
    // no added texture downloads, overdraw or per-frame shading passes.
    const macro = (Math.sin(x * .018 + visualSeed * .0001) *
      Math.cos(z * .021 - visualSeed * .0003) + 1) * .5;
    const contour = Math.abs(Math.sin((x + z) * .033 + visualSeed * .0002));
    const altitude = THREE.MathUtils.clamp(y / (profile.terrainAmplitude + 1), -.75, .75);
    let tintMix = .24 + macro * .39;
    switch (profile.terrain) {
      case 'deck':
        // Broad industrial/naval panel bands, not a neon chessboard.
        tintMix = .28 + macro * .16 + contour * .10;
        break;
      case 'crags':
      case 'terraces':
        tintMix = .23 + contour * .37 + Math.max(0, altitude) * .21;
        break;
      case 'mounds':
      case 'dunes':
        tintMix = .31 + macro * .26 + contour * .22;
        break;
      case 'cloud-bands':
        tintMix = .42 + macro * .27;
        break;
      default:
        tintMix = .22 + macro * .35 + (1 - contour) * .12;
    }
    scratch.copy(base).lerp(tint, THREE.MathUtils.clamp(tintMix, .1, .86));
    // Slight altitude separation, never enough to hide hazards or sites.
    scratch.offsetHSL(0, 0, altitude * .075);
    colors[i * 3] = scratch.r; colors[i * 3 + 1] = scratch.g; colors[i * 3 + 2] = scratch.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  // Lambert shades per-vertex: visually equivalent for a broad terrain with
  // vertex colors, and measurably cheaper per pixel on software rasterizers.
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const ground = new THREE.Mesh(geometry, material);
  ground.name = 'immersive-ground';
  scene.add(ground);
  materials.push(material);

  if (profile.canopyHeight !== null) {
    // Translucent ceiling: ocean surface seen from below, station deck roof,
    // or cavern rock layer. Purely atmospheric.
    const isWater = profile.architecture === 'reef';
    const canopyMaterial = new THREE.MeshBasicMaterial({
      color: isWater ? 0x2e7f96 : 0x141c2a,
      transparent: true, opacity: isWater ? .28 : .42,
      side: THREE.DoubleSide, depthWrite: false, fog: true,
    });
    const canopy = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), canopyMaterial);
    canopy.rotation.x = Math.PI / 2;
    canopy.position.y = profile.canopyHeight;
    canopy.renderOrder = 2;
    scene.add(canopy);
    materials.push(canopyMaterial);
  }
  return { materials };
}
