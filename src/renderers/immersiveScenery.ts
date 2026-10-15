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

interface ScenicAnchor { id: string; x: number; z: number; count: number }

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
  // Composition: a loose ring of scenery around every named site, clusters at
  // real simulated region anchors, and sparse dressing along actual routes.
  // Unvisited territory receives atmospheric geometry, never fabricated POIs.
  const scenicAnchors: ScenicAnchor[] = [
    ...layout.points.map(site => ({ id: site.id, x: site.x, z: site.z, count: 4 })),
    ...atlas.regions.map(region => ({ id: `region:${region.id}`, x: layout.regionAnchors[region.id]?.x ?? 0, z: layout.regionAnchors[region.id]?.z ?? 0, count: 4 })),
    ...atlas.routes.map(route => {
      const a = layout.regionAnchors[route.from], b = layout.regionAnchors[route.to];
      if (!a || !b) return null;
      return { id: `route:${route.id}`, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, count: 3 };
    }).filter((anchor): anchor is ScenicAnchor => anchor !== null),
  ];
  const planned = scenicAnchors.reduce((sum, anchor) => sum + anchor.count, 0);
  const meshes = new THREE.InstancedMesh(geometry, scenicMaterial, Math.max(1, planned));
  meshes.userData.role = 'scenic';
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const facadePlacements: Array<{x:number;y:number;z:number;yaw:number;width:number;height:number;tone:number}> = [];
  let count = 0;
  for (const site of scenicAnchors) {
    for (let i = 0; i < site.count; i++) {
      const seed = sceneHash(atlas.worldId + ':' + site.id + ':environment:' + i);
      const angle = (seed % 65536) / 65536 * Math.PI * 2;
      const radius = 9 + (seed >>> 16) % 19;
      const x = site.x + Math.cos(angle) * radius, z = site.z + Math.sin(angle) * radius;
      if (Math.hypot(x - layout.spawn.x, z - layout.spawn.z) < 16 || layout.points.some(point => Math.hypot(point.x - x, point.z - z) < 3.8)) continue;
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
      if(style==='city'||style==='settlement') {
        // Panel rhythm across the EXISTING background skyline, not only POIs:
        // deterministic irregular illuminated recesses on two visible faces.
        const yaw = seed % 628 / 100;
        const sin = Math.sin(yaw), cos = Math.cos(yaw);
        const maxX = (geometry.boundingBox!.max.x + .04) * size;
        const maxZ = (geometry.boundingBox!.max.z + .04) * size;
        const rows=style==='city'?4:2;
        for(let row=0;row<rows;row++)for(let col=0;col<2;col++)for(let face=0;face<2;face++){
          if(((seed>>> (row+col+face)) & 7)===0)continue;
          const lx=face===0?(col===0?-0.36:.36)*size:maxX;
          const lz=face===0?maxZ:(col===0?-.40:.40)*size;
          facadePlacements.push({
            x:x+lx*cos+lz*sin,
            y:(row+1)/(rows+1)*(geometry.boundingBox!.max.y-geometry.boundingBox!.min.y)*size*height,
            z:z-lx*sin+lz*cos,
            yaw:yaw+(face?Math.PI/2:0),
            width:.49*size,height:(style==='city'?.82:.65)*size*height,
            tone:(seed+row*7+col*3+face)%7,
          });
        }
      }
      count++;
    }
  }
  meshes.count = count;
  meshes.instanceMatrix.needsUpdate = true;
  if (meshes.instanceColor) meshes.instanceColor.needsUpdate = true;
  scene.add(meshes);
  const facadeMaterial = new THREE.MeshBasicMaterial({
    color:0xffffff,transparent:true,opacity:.78,depthWrite:false,toneMapped:false,
  });
  if(facadePlacements.length) {
    const lights = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1,1,.1),facadeMaterial,facadePlacements.length);
    lights.name='aaa-scenic-facades';
    const glow = new THREE.Color();
    const highlight = new THREE.Color(layout.profile.accent);
    for(let i=0;i<facadePlacements.length;i++){
      const f=facadePlacements[i];
      dummy.position.set(f.x,f.y,f.z);
      dummy.rotation.set(0,f.yaw,0);
      dummy.scale.set(f.width,f.height,1);
      dummy.updateMatrix();
      lights.setMatrixAt(i,dummy.matrix);
      glow.copy(highlight).lerp(new THREE.Color(layout.profile.celestialColor),f.tone/12);
      lights.setColorAt(i,glow);
    }
    lights.instanceMatrix.needsUpdate=true;
    if(lights.instanceColor)lights.instanceColor.needsUpdate=true;
    lights.computeBoundingSphere();
    scene.add(lights);
  } else {
    facadeMaterial.dispose();
  }

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
  corridors.userData.role = 'routes';
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
    corridors.computeBoundingSphere();
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
  return { materials: [scenicMaterial, corridors.material as THREE.Material, monumentMaterial, ...(facadePlacements.length ? [facadeMaterial] : [])], refresh: updateRoutes };
}

/**
 * Secondary ground-level dressing: a second instanced layer of small shapes so
 * each world reads at two scales instead of one repeated primitive. Visual
 * only; omitted from addImmersiveScenery so its strict two-mesh contract holds.
 */
export function addImmersiveFlora(
  scene: THREE.Scene,
  layout: ImmersiveLayout,
): { materials: THREE.Material[] } {
  const style = layout.profile.architecture;
  const accent = new THREE.Color(layout.profile.accent);
  const earth = new THREE.Color(layout.profile.groundTint);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: .95,
    metalness: style === 'machines' || style === 'city' || style === 'factory' ? .45 : .05,
    transparent: style === 'reef' || style === 'signal', opacity: style === 'reef' || style === 'signal' ? .85 : 1,
  });
  const geometry = ((): THREE.BufferGeometry => {
    switch (style) {
      case 'forest': case 'wilds': return new THREE.DodecahedronGeometry(.9, 0); // boulders/ferns
      case 'reef': return new THREE.ConeGeometry(.7, 2.4, 5); // coral spikes
      case 'cavern': case 'crags': return new THREE.DodecahedronGeometry(1.1, 0); // rubble
      case 'orbit': case 'signal': return new THREE.TetrahedronGeometry(1.1, 0); // drifting shards
      case 'city': case 'settlement': case 'ruins': return new THREE.BoxGeometry(1.6, .7, 1.6); // street furniture
      case 'factory': case 'machines': return new THREE.CylinderGeometry(.35, .5, 1.6, 6); // pipe stacks
      case 'habitat': case 'terraform': return new THREE.SphereGeometry(.8, 8, 6); // planters
      case 'storm': return new THREE.OctahedronGeometry(1, 0); // hail cores
    }
  })();
  const planned = Math.max(1, layout.points.length * 5);
  const mesh = new THREE.InstancedMesh(geometry, material, planned);
  mesh.userData.role = 'flora';
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let count = 0;
  for (const site of layout.points) {
    for (let i = 0; i < 5; i++) {
      const seed = sceneHash(layout.profile.architecture + ':' + site.id + ':flora:' + i);
      const angle = (seed % 65536) / 65536 * Math.PI * 2;
      const radius = 4.2 + (seed >>> 16) % 26;
      const x = site.x + Math.cos(angle) * radius, z = site.z + Math.sin(angle) * radius;
      if (Math.hypot(x - layout.spawn.x, z - layout.spawn.z) < 11) continue;
      const floating = style === 'orbit' || style === 'signal';
      dummy.position.set(x, floating ? 6 + seed % 14 : 0, z);
      dummy.rotation.set(0, seed % 628 / 100, floating ? (seed % 100) / 100 : 0);
      const size = .5 + (seed >>> 3) % 90 / 100;
      dummy.scale.set(size, size * (.7 + (seed >>> 9) % 60 / 100), size);
      if (!floating) dummy.position.y = .28 * size;
      dummy.updateMatrix();
      mesh.setMatrixAt(count, dummy.matrix);
      tint.copy(earth).lerp(accent, ((seed >>> 17) % 30) / 100);
      mesh.setColorAt(count, tint);
      count++;
    }
  }
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
  return { materials: [material] };
}
