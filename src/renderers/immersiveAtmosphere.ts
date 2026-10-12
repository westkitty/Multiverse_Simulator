import * as THREE from 'three';
import { SceneProfile } from '../exploration/immersiveLayout';

/**
 * Visual-only sky, starfield and distant celestial features. Presentation
 * layer exclusively: never touches the Atlas, simulation RNG, routes or
 * persistence. All randomness derives from a caller-supplied visual seed.
 */
export function addImmersiveAtmosphere(
  scene: THREE.Scene,
  profile: SceneProfile,
  extent: number,
  visualSeed: number,
): { materials: THREE.Material[]; textures: THREE.Texture[] } {
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const radius = Math.max(320, extent * 2.6);

  // Gradient sky: a small DataTexture on scene.background beats a shaded dome
  // on software rasterizers (fast unlit path, no dome geometry). DOM-free so
  // the same code runs under jsdom unit tests.
  const zenith = new THREE.Color(profile.skyZenith);
  const horizonBand = new THREE.Color(profile.horizon);
  const lowBand = horizonBand.clone().lerp(new THREE.Color(profile.ground), .35);
  const skyHeight = 64;
  const skyData = new Uint8Array(2 * skyHeight * 4);
  const mix = new THREE.Color();
  for (let y = 0; y < skyHeight; y++) {
    // DataTexture rows start at the bottom of the screen.
    const t = 1 - y / (skyHeight - 1);
    if (t < .62) mix.copy(horizonBand).lerp(zenith, t / .62);
    else mix.copy(lowBand).lerp(horizonBand, (t - .62) / .38);
    for (let x = 0; x < 2; x++) {
      const index = (y * 2 + x) * 4;
      skyData[index] = Math.round(mix.r * 255);
      skyData[index + 1] = Math.round(mix.g * 255);
      skyData[index + 2] = Math.round(mix.b * 255);
      skyData[index + 3] = 255;
    }
  }
  const skyTexture = new THREE.DataTexture(skyData, 2, skyHeight, THREE.RGBAFormat);
  skyTexture.colorSpace = THREE.SRGBColorSpace;
  skyTexture.magFilter = THREE.LinearFilter;
  skyTexture.needsUpdate = true;
  scene.background = skyTexture;
  textures.push(skyTexture);

  // Starfield on the upper hemisphere (Points, not instanced meshes).
  if (profile.starfield > 0) {
    const starCount = Math.round(110 + profile.starfield * 360);
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const starColor = new THREE.Color();
    for (let i = 0; i < starCount; i++) {
      const h1 = ((visualSeed + i * 2654435761) >>> 0) / 4294967296;
      const h2 = ((visualSeed * 31 + i * 2246822519) >>> 0) / 4294967296;
      const h3 = ((visualSeed * 65537 + i * 3266489917) >>> 0) / 4294967296;
      const azimuth = h1 * Math.PI * 2;
      const elevation = 0.06 + h2 * h2 * 1.35; // bias toward the horizon band
      const r = radius * (0.82 + h3 * 0.14);
      starPositions[i * 3] = Math.cos(azimuth) * Math.cos(elevation) * r;
      starPositions[i * 3 + 1] = Math.sin(elevation) * r;
      starPositions[i * 3 + 2] = Math.sin(azimuth) * Math.cos(elevation) * r;
      starColor.setHSL(.58 + h3 * .1, .35 + h2 * .4, .68 + h1 * .3);
      starColors[i * 3] = starColor.r; starColors[i * 3 + 1] = starColor.g; starColors[i * 3 + 2] = starColor.b;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMaterial = new THREE.PointsMaterial({
      size: 1.9 + profile.starfield * 1.6, vertexColors: true, fog: false,
      transparent: true, opacity: .5 + profile.starfield * .5, depthWrite: false,
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    stars.renderOrder = -9;
    scene.add(stars);
    materials.push(starMaterial);
  }

  // Distant celestial anchor per world identity.
  const anchorAngle = ((visualSeed >>> 8) % 360) * Math.PI / 180;
  const anchorHeight = radius * .42;
  const anchorR = radius * .78;
  const anchorX = Math.cos(anchorAngle) * anchorR;
  const anchorZ = Math.sin(anchorAngle) * anchorR;
  const bodyMaterial = (color: number, emissive: number, intensity: number) => {
    const material = new THREE.MeshBasicMaterial({ color, fog: false, transparent: true, opacity: .92 });
    materials.push(material);
    void emissive; void intensity;
    return material;
  };
  const addBody = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.renderOrder = -8;
    scene.add(mesh);
    return mesh;
  };
  switch (profile.celestial) {
    case 'sun': {
      const glow = bodyMaterial(profile.celestialColor, profile.celestialColor, 1);
      addBody(new THREE.SphereGeometry(radius * .045, 20, 16), glow, anchorX, anchorHeight, anchorZ);
      const halo = bodyMaterial(profile.celestialColor, profile.celestialColor, .4);
      (halo as THREE.MeshBasicMaterial).opacity = .16;
      addBody(new THREE.SphereGeometry(radius * .1, 20, 16), halo, anchorX, anchorHeight, anchorZ);
      break;
    }
    case 'moon': {
      const moon = bodyMaterial(profile.celestialColor, profile.celestialColor, .8);
      addBody(new THREE.SphereGeometry(radius * .038, 18, 14), moon, anchorX, anchorHeight, anchorZ);
      break;
    }
    case 'binary-suns': {
      const a = bodyMaterial(profile.celestialColor, profile.celestialColor, 1);
      const b = bodyMaterial(0xff9d6b, 0xff9d6b, 1);
      addBody(new THREE.SphereGeometry(radius * .034, 18, 14), a, anchorX, anchorHeight, anchorZ);
      addBody(new THREE.SphereGeometry(radius * .022, 16, 12), b, anchorX + radius * .07, anchorHeight - radius * .035, anchorZ + radius * .02);
      break;
    }
    case 'ringed-giant': {
      const giant = bodyMaterial(profile.celestialColor, profile.celestialColor, 1);
      (giant as THREE.MeshBasicMaterial).opacity = .85;
      const planet = addBody(new THREE.SphereGeometry(radius * .12, 26, 20), giant, anchorX, anchorHeight, anchorZ);
      planet.rotation.z = .35;
      const ringMaterial = bodyMaterial(profile.celestialColor, profile.celestialColor, .6);
      (ringMaterial as THREE.MeshBasicMaterial).opacity = .38;
      const ring = addBody(new THREE.RingGeometry(radius * .15, radius * .24, 48), ringMaterial, anchorX, anchorHeight, anchorZ);
      ring.rotation.set(Math.PI / 2 - .42, 0, .3);
      break;
    }
    case 'nebula': {
      const hues: number[] = [profile.celestialColor, 0x6f7bff, 0xff6fb0];
      for (let i = 0; i < 3; i++) {
        const material = bodyMaterial(hues[i], hues[i], .3);
        (material as THREE.MeshBasicMaterial).opacity = .12 + i * .03;
        addBody(new THREE.SphereGeometry(radius * (.16 + i * .05), 18, 12), material,
          anchorX + (i - 1) * radius * .16, anchorHeight + (i - 1) * radius * .07, anchorZ - i * radius * .05);
      }
      break;
    }
    case 'storm-eye': {
      const ringMaterial = bodyMaterial(profile.celestialColor, profile.celestialColor, .4);
      (ringMaterial as THREE.MeshBasicMaterial).opacity = .22;
      const vortex = addBody(new THREE.TorusGeometry(radius * .12, radius * .035, 10, 40), ringMaterial,
        anchorX * .6, anchorHeight * 1.15, anchorZ * .6);
      vortex.rotation.x = Math.PI / 2 - .25;
      const core = bodyMaterial(0xffffff, 0xffffff, .5);
      (core as THREE.MeshBasicMaterial).opacity = .14;
      addBody(new THREE.SphereGeometry(radius * .05, 16, 12), core, anchorX * .6, anchorHeight * 1.15, anchorZ * .6);
      break;
    }
    case 'void':
    default:
      break;
  }
  return { materials, textures };
}
