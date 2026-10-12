import * as THREE from 'three';
import { ExplorationAtlas, ExplorationState } from '../exploration/contracts';
import { ImmersiveLayout, SceneProfile, sceneHash } from '../exploration/immersiveLayout';

function scenicGeometry(style: SceneProfile['architecture']): THREE.BufferGeometry {
  switch (style) {
    case 'forest': case 'wilds': return new THREE.ConeGeometry(1.25, 8, 6);
    case 'reef': return new THREE.DodecahedronGeometry(2, 0);
    case 'cavern': case 'crags': return new THREE.ConeGeometry(1.5, 10, 5);
    case 'orbit': return new THREE.IcosahedronGeometry(1.8, 0);
    case 'signal': return new THREE.OctahedronGeometry(2.3, 0);
    case 'city': return new THREE.BoxGeometry(3, 12, 4);
    case 'factory': case 'machines': return new THREE.CylinderGeometry(.8, 1.4, 9, 8);
    case 'habitat': case 'terraform': return new THREE.CylinderGeometry(2, 2, 4, 8);
    case 'storm': return new THREE.CylinderGeometry(.5, 1, 11, 6);
    case 'settlement': return new THREE.BoxGeometry(4, 4, 5);
    case 'ruins': return new THREE.CylinderGeometry(1, 1.4, 7, 7);
  }
}

/** An atmospheric, visual-only projection: no changes to the Atlas, simulation RNG, routes, or persistence. */
export function addImmersiveScenery(
  scene: THREE.Scene,
  atlas: ExplorationAtlas,
  exploration: ExplorationState,
  layout: ImmersiveLayout,
): { materials: THREE.Material[]; refresh: (current: ExplorationState) => void } {
  const style = layout.profile.architecture;
  const sky = new THREE.Color(layout.profile.horizon);
  const earth = new THREE.Color(layout.profile.ground);
  const baseColor = sky.clone().lerp(earth, .45);
  const scenicMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: .91, metalness: style === 'machines' || style === 'orbit' ? .6 : .08,
  });
  const geometry = scenicGeometry(style);
  geometry.computeBoundingBox();
  // Source both named sites and the surrounding real simulated regions.
  // Unvisited territory receives atmospheric geometry, never fabricated POIs.
  const scenicAnchors = [
    ...layout.points.map(site => ({ id: site.id, x: site.x, z: site.z, count: 5 })),
    ...atlas.regions.map(region => ({ id: `region:${region.id}`, x: layout.regionAnchors[region.id]?.x ?? 0, z: layout.regionAnchors[region.id]?.z ?? 0, count: 3 })),
  ];
  const meshes = new THREE.InstancedMesh(geometry, scenicMaterial, scenicAnchors.reduce((sum, anchor) => sum + anchor.count, 0));
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let count = 0;
  for (const site of scenicAnchors) {
    for (let i = 0; i < site.count; i++) {
      const seed = sceneHash(atlas.worldId + ':' + site.id + ':environment:' + i);
      const angle = (seed % 65536) / 65536 * Math.PI * 2;
      const radius = 9 + (seed >>> 16) % 19;
      const x = site.x + Math.cos(angle) * radius, z = site.z + Math.sin(angle) * radius;
      if (Math.hypot(x - layout.spawn.x, z - layout.spawn.z) < 6 || layout.points.some(point => Math.hypot(point.x - x, point.z - z) < 3.8)) continue;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, seed % 628 / 100, 0);
      const size = .48 + (seed >>> 4) % 130 / 100;
      const height = style === 'city' ? 1.7 : style === 'forest' || style === 'crags' ? 1.3 : 1;
      const lift = style === 'orbit' || style === 'signal' ? 9 + seed % 12 : 0;
      dummy.position.y = lift + (style === 'orbit' || style === 'signal' || style === 'reef' ? 0 : (geometry.boundingBox?.max.y ?? 4) * size / 2);
      dummy.scale.set(size, size * height, size);
      // Native primitive origin is at the center; keep decorative structures grounded.
      if (lift === 0 && style !== 'reef' && style !== 'orbit' && style !== 'signal') {
        dummy.position.y = -geometry.boundingBox!.min.y * size * height;
      }
      dummy.updateMatrix();
      meshes.setMatrixAt(count, dummy.matrix);
      tint.copy(baseColor).lerp(new THREE.Color(layout.profile.accent), ((seed >>> 23) % 18) / 100);
      meshes.setColorAt(count, tint);
      count++;
    }
  }
  meshes.count = count;
  meshes.instanceMatrix.needsUpdate = true;
  if (meshes.instanceColor) meshes.instanceColor.needsUpdate = true;
  scene.add(meshes);

  // Traversable corridors reflect the actual region graph, not invented world connections.
  // Lines in remote/underwater/orbital worlds are elevated survey-guidance filaments.
  const regionCenters = new Map(Object.entries(layout.regionAnchors));
  const corridors = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: .85, metalness: .2,
      transparent: true, opacity: style === 'orbit' || style === 'signal' ? .62 : .75,
    }),
    Math.max(1, atlas.routes.length * 2),
  );
  const isFlying = layout.profile.movement === 'fly';
  const openTint = new THREE.Color(layout.profile.accent).lerp(earth, .55);
  const closedTint = new THREE.Color(0x943f45).lerp(earth, .25);
  let previousRouteSignature = '';
  const updateRoutes = (current: ExplorationState) => {
    const signature = atlas.routes.map(route => current.blockedRoutes[route.id] ? '1' : '0').join('');
    if (signature === previousRouteSignature) return;
    previousRouteSignature = signature;
    let edgeCount = 0;
    for (const route of atlas.routes) {
      const a = regionCenters.get(route.from), b = regionCenters.get(route.to);
      if (!a || !b) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 2) continue;
      const blocked = current.blockedRoutes[route.id] ?? route.blocked;
      // A visibly broken route has a genuine gap, not just a cosmetic red tint.
      const fractions = blocked ? [0.18, 0.82] : [0.5];
      for (const fraction of fractions) {
        dummy.position.set(a.x + dx * fraction, isFlying ? 8 : .065, a.z + dz * fraction);
        dummy.rotation.set(0, Math.atan2(dx, dz), 0);
        dummy.scale.set(isFlying ? .18 : 2.2, isFlying ? .14 : .12, blocked ? len * .34 : len);
        dummy.updateMatrix();
        corridors.setMatrixAt(edgeCount, dummy.matrix);
        corridors.setColorAt(edgeCount, blocked ? closedTint : openTint);
        edgeCount++;
      }
    }
    corridors.count = edgeCount;
    corridors.instanceMatrix.needsUpdate = true;
    if (corridors.instanceColor) corridors.instanceColor.needsUpdate = true;
  };
  updateRoutes(exploration);
  scene.add(corridors);

  // A large, world-specific silhouette near a real existing Atlas site acts as an
  // orientation landmark. It does not reveal hidden site names or fabricate evidence.
  const anchor = layout.points[Math.min(2, layout.points.length - 1)];
  const monumentMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(layout.profile.accent).lerp(earth, .52),
    roughness: .65, metalness: style === 'city' || style === 'orbit' || style === 'machines' ? .55 : .08,
    emissive: layout.profile.accent, emissiveIntensity: .13,
  });
  if (anchor) {
    const monument = new THREE.Group();
    monument.position.set(anchor.x + 13, 0, anchor.z + 11);
    const add = (shape: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0) => {
      const mesh = new THREE.Mesh(shape, monumentMaterial);
      mesh.position.set(x, y, z);
      mesh.rotation.x = rx;
      monument.add(mesh);
    };
    switch (style) {
      case 'forest': case 'wilds':
        add(new THREE.CylinderGeometry(1.8, 2.7, 28, 9), 0, 14, 0);
        add(new THREE.ConeGeometry(13, 23, 10), 0, 33, 0);
        break;
      case 'reef': case 'cavern': case 'crags':
        for (let i = 0; i < 5; i++) add(new THREE.ConeGeometry(3 + i / 2, 16 + i * 5, 5), i * 3 - 6, 8 + i * 2.5, i % 2 * 3);
        break;
      case 'orbit': case 'signal': case 'storm':
        add(new THREE.TorusGeometry(17, 1.1, 8, 44), 0, 24, 0);
        add(new THREE.IcosahedronGeometry(7, 1), 0, 24, 0);
        break;
      case 'habitat': case 'terraform':
        add(new THREE.CylinderGeometry(12, 12, 3, 24), 0, 2, 0);
        add(new THREE.SphereGeometry(12, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0, 3, 0);
        break;
      case 'city': case 'factory': case 'machines':
        add(new THREE.BoxGeometry(13, 43, 13), 0, 21.5, 0);
        add(new THREE.BoxGeometry(26, 2, 5), 0, 34, 0);
        break;
      case 'settlement': case 'ruins':
        for (const x of [-7, 7]) add(new THREE.CylinderGeometry(1.7, 2, 20, 8), x, 10, 0);
        add(new THREE.BoxGeometry(18, 3, 5), 0, 20, 0);
        break;
    }
    scene.add(monument);
  }
  // ThreeWorldView owns all geometry disposal via scene traversal. Return only
  // the newly owned materials so shared meshes are not double-disposed.
  return { materials: [scenicMaterial, corridors.material as THREE.Material, monumentMaterial], refresh: updateRoutes };
}
