import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ExplorationAtlas, ExplorationState } from '../exploration/contracts';
import { ExplorationCommand, presentSite } from '../exploration/engine';
import { suggestedAction } from '../exploration/dossier';
import { fieldBeaconState, fieldBearing, fieldWaypoints, type FieldBearing, type FieldBeaconState } from '../exploration/fieldWayfinding';
import { ImmersiveActorMarker, ImmersiveLayout, makeImmersiveLayout, movementBasis, sceneHash, SceneProfile, spawnViewAngles, yawToward } from '../exploration/immersiveLayout';
import { addImmersiveScenery, addImmersiveFlora } from './immersiveScenery';
import { addImmersiveAtmosphere } from './immersiveAtmosphere';
import { addImmersiveTerrain, terrainHeight } from './immersiveTerrain';

interface Props {
  atlas: ExplorationAtlas;
  exploration: ExplorationState;
  regions: ReadonlyArray<{ id: string; position: readonly [number, number, number] }>;
  actors: ImmersiveActorMarker[];
  runId: string;
  onSelectSite: (id: string) => void;
  onSiteAction: (id: string, kind: ExplorationCommand['action']) => string;
  onAdvanceTime: () => void;
  onReturnToAtlas: () => void;
  reducedMotion?: boolean;
}
type Movement = 'forward' | 'back' | 'left' | 'right' | 'up' | 'down' | 'sprint';

function landmarkShape(
  group: THREE.Group, profile: SceneProfile, seed: number, x: number, z: number,
  material: THREE.Material, accent: THREE.Material, collision: Array<{ x: number; z: number; radius: number }>,
) {
  const box = (w: number, h: number, d: number, ox: number, oy: number, oz: number, mat = material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x + ox, oy, z + oz);
    group.add(mesh);
    return mesh;
  };
  const cylinder = (bottom: number, top: number, h: number, ox: number, oy: number, oz: number, mat = material) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, h, 7), mat);
    mesh.position.set(x + ox, oy, z + oz);
    group.add(mesh);
    return mesh;
  };
  const addCollision = (r: number) => collision.push({ x, z, radius: r });
  switch (profile.architecture) {
    case 'forest': case 'wilds':
      cylinder(.5, .35, 6, 0, 3, 0);
      for (let i = 0; i < 3; i++) cylinder(3.5 - i * .5, .2, 3.7, 0, 6.8 + i * 1.65, 0, accent);
      addCollision(.9); break;
    case 'reef':
      for (let i = 0; i < 4; i++) cylinder(.8, .28, 3 + i * 2, Math.sin(i * 1.7) * 2, 2 + i, Math.cos(i * 1.7) * 2, i % 2 ? accent : material);
      addCollision(1.2); break;
    case 'crags': case 'cavern':
      for (let i = 0; i < 3; i++) {
        const mesh = new THREE.Mesh(new THREE.ConeGeometry(2.2 + i * .6, 6 + i * 3, 5), i === 1 ? accent : material);
        mesh.position.set(x + i * 2.1 - 2.1, (6 + i * 3) / 2, z + (i % 2 ? -1.5 : 1));
        mesh.rotation.y = seed * .0001;
        group.add(mesh);
      }
      addCollision(2); break;
    case 'city': case 'settlement': case 'ruins': case 'factory': case 'machines':
      box(5, 8 + seed % 12, 5, 0, (8 + seed % 12) / 2, 0);
      box(3.3, .3, 3.3, 0, 5, 2.65, accent);
      box(1.2, 3, .25, 0, 1.5, 2.55, accent);
      if (profile.architecture === 'factory' || profile.architecture === 'machines') {
        cylinder(.5, .5, 16, 3.2, 8, -1, accent);
      }
      addCollision(3); break;
    case 'habitat': case 'terraform':
      cylinder(3, 3, 1.5, 0, .75, 0);
      cylinder(2.2, 1.8, 6, 0, 4.3, 0, accent);
      box(7, .4, 1.5, 0, 2, 0);
      addCollision(3); break;
    case 'storm': case 'orbit': case 'signal':
      cylinder(.8, .4, 16 + seed % 11, 0, 8 + seed % 11 / 2, 0);
      for (let i = 0; i < 3; i++) box(7 - i, .2, .7, 0, 6 + i * 4, 0, accent).rotation.y = i * .8;
      addCollision(.8); break;
  }
}

export const ImmersiveWorldView: React.FC<Props> = ({
  atlas, exploration, regions, actors, runId, onSelectSite, onSiteAction, onAdvanceTime, onReturnToAtlas, reducedMotion,
}) => {
  // Layout rebuilds are gated on the only exploration fields that affect the
  // projection (discovery/condition/hazard/visit/region). Simulation ticks that
  // do not change these fields reuse the cached geometry plan.
  const layoutSignature = useMemo(() => {
    let sig = atlas.worldId + '|' + exploration.expedition.regionId;
    for (const site of atlas.sites) {
      const delta = exploration.sites[site.facts.id];
      sig += delta ? `${delta.discoveryState}${Math.round(delta.condition)}${Math.round(delta.hazard)}${delta.firstVisitedTick !== null ? 'v' : '-'}` : '?';
    }
    for (const region of regions) sig += `#${Math.round(region.position[0])},${Math.round(region.position[2])}`;
    return sig;
  }, [atlas, exploration, regions]);
  const layoutCache = useRef<{ key: string; value: ImmersiveLayout } | null>(null);
  const layout = useMemo(() => {
    if (layoutCache.current?.key === layoutSignature) return layoutCache.current.value;
    const value = makeImmersiveLayout(atlas, exploration, regions);
    layoutCache.current = { key: layoutSignature, value };
    return value;
  }, [atlas, exploration, regions, layoutSignature]);
  const sceneHost = useRef<HTMLDivElement>(null);
  const actions = useRef(new Set<Movement>());
  const view = useRef({ yaw: -.5, pitch: -.12 });
  const player = useRef({ x: layout.spawn.x, y: 2.2, z: layout.spawn.z });
  const lookPointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [inspectedSiteId, setInspectedSiteId] = useState<string | null>(null);
  const [interactionResult, setInteractionResult] = useState('');
  const liveLayout = useRef(layout);
  liveLayout.current = layout;
  const liveActors = useRef(actors);
  liveActors.current = actors;
  const liveExploration = useRef(exploration);
  liveExploration.current = exploration;
  const previousExpeditionRegion = useRef(exploration.expedition.regionId);
  const [readout, setReadout] = useState('MOVE: W A S D / ARROWS · LOOK: DRAG · SPRINT: SHIFT · INTERACT: E');
  const [webglFailed, setWebglFailed] = useState(false);
  const [contextGeneration, setContextGeneration] = useState(0);
  const [location, setLocation] = useState({ x: player.current.x, z: player.current.z });
  const [manualWaypoint, setManualWaypoint] = useState<string | null>(null);
  const [guideVisible, setGuideVisible] = useState(true);
  const [bearingReadout, setBearingReadout] = useState<FieldBearing | null>(null);
  // Known-only, deterministic waypoint order. A visual pointer never authorizes
  // simulation travel or reveals unlocated sites.
  const waypoints = useMemo(() => fieldWaypoints(layout.points, layout.spawn), [layout]);
  const guidedWaypoint = guideVisible
    ? (waypoints.find(site => site.id === manualWaypoint) ?? waypoints[0] ?? null)
    : null;
  const liveWaypoint = useRef(guidedWaypoint);
  liveWaypoint.current = guidedWaypoint;
  const cycleWaypoint = () => {
    if (!waypoints.length) return;
    const index = waypoints.findIndex(site => site.id === guidedWaypoint?.id);
    setManualWaypoint(waypoints[(index + 1) % waypoints.length].id);
    setGuideVisible(true);
    setBearingReadout(null);
  };

  // Re-arm only on run/world entry. Discovery updates must never teleport the
  // player back to spawn mid-exploration.
  useEffect(() => {
    player.current = { x: layout.spawn.x, y: 2.2, z: layout.spawn.z };
    view.current = spawnViewAngles(layout);
    actions.current.clear();
    setTarget(null);
    setInspectedSiteId(null);
    setInteractionResult('');
    setManualWaypoint(null);
    setGuideVisible(true);
    setBearingReadout(null);
  }, [runId, atlas.worldId]);

  // The simulation, not the camera, decides when an expedition actually
  // arrives. Reposition the visual player only after its region truly changes.
  useEffect(() => {
    const nextRegion = exploration.expedition.regionId;
    if (previousExpeditionRegion.current === nextRegion) return;
    previousExpeditionRegion.current = nextRegion;
    const site = layout.points.find(point => point.regionId === nextRegion && point.discovery !== 'UNKNOWN')
      ?? layout.points.find(point => point.regionId === nextRegion);
    const anchor = site ?? layout.regionAnchors[nextRegion];
    if (anchor) {
      player.current = { x: anchor.x + 5.2, y: 2.2, z: anchor.z + 3.2 };
      // Arrive looking at the destination, not into empty terrain.
      if (site) {
        view.current = {
          yaw: yawToward(player.current.x, player.current.z, site.x, site.z),
          pitch: -.1,
        };
      }
    }
    setInspectedSiteId(null);
    setTarget(null);
  }, [exploration.expedition.regionId, layout]);

  useEffect(() => {
    const host = sceneHost.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      setWebglFailed(true);
      return;
    }
    setWebglFailed(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const profile = layout.profile;
    const visualSeed = sceneHash(atlas.worldId);
    scene.background = new THREE.Color(profile.sky);
    scene.fog = new THREE.Fog(profile.horizon, 60 + profile.terrainAmplitude * 6, Math.max(220, layout.extent * 2.2));
    // Dark-sky worlds need stronger ambient fill so landmark silhouettes stay
    // readable; bright worlds keep directional contrast.
    const skyLuma = (() => {
      const c = new THREE.Color(profile.sky);
      return (c.r + c.g + c.b) / 3;
    })();
    scene.add(new THREE.HemisphereLight(profile.horizon, profile.ground, 1.9 + (1 - skyLuma) * 1.1));
    const sun = new THREE.DirectionalLight(profile.celestialColor, 1.9);
    sun.position.set(50, 85, 15);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(73, 1, .1, 1200);
    const atmosphere = addImmersiveAtmosphere(scene, profile, layout.extent, visualSeed);
    const terrain = addImmersiveTerrain(scene, profile, layout.extent, visualSeed);
    const mainMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(profile.horizon).lerp(new THREE.Color(profile.ground), .6), roughness: .82, metalness: .12 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: profile.accent, roughness: .48, emissive: profile.accent, emissiveIntensity: .24 });
    const unknownMaterial = new THREE.MeshStandardMaterial({ color: 0x7c8795, roughness: .78, metalness: .22 });
    const resolvedMaterial = new THREE.MeshStandardMaterial({ color: 0xffe2a2, emissive: 0xc18b31, emissiveIntensity: .52, roughness: .38 });
    const unsafeMaterial = new THREE.MeshStandardMaterial({ color: 0xff627a, emissive: 0xb02544, emissiveIntensity: .65, roughness: .42 });
    const criticalMaterial = new THREE.MeshStandardMaterial({ color: 0xff8359, emissive: 0x9e3320, emissiveIntensity: .55, roughness: .45 });
    const serviceMaterial = new THREE.MeshStandardMaterial({ color: 0xf2c678, emissive: 0x906021, emissiveIntensity: .4, roughness: .52 });
    const beaconMaterials: Record<FieldBeaconState, THREE.Material> = {
      unidentified: unknownMaterial, signal: accentMaterial,
      unsafe: unsafeMaterial, critical: criticalMaterial, service: serviceMaterial,
      stable: accentMaterial, resolved: resolvedMaterial,
    };
    const objects = new THREE.Group();
    scene.add(objects);
    const collision: Array<{ x: number; z: number; radius: number }> = [];
    const targets: Array<{ id: string; x: number; z: number; name: string }> = [];
    const beacons = new Map<string, THREE.Mesh>();
    for (const site of layout.points) {
      const discovered = site.discovery !== 'UNKNOWN';
      const material = discovered ? mainMaterial : unknownMaterial;
      landmarkShape(objects, profile, site.visualSeed, site.x, site.z, material, accentMaterial, collision);
      const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(.8, 0), beaconMaterials[fieldBeaconState(site)]);
      beacon.position.set(site.x, 13.5 + site.visualSeed % 6, site.z);
      beacon.userData.siteId = site.id;
      objects.add(beacon);
      beacons.set(site.id, beacon);
      targets.push({ id: site.id, x: site.x, z: site.z, name: site.label });
    }
    const scenery = addImmersiveScenery(scene, atlas, exploration, layout);
    const flora = addImmersiveFlora(scene, layout);
    let routeSnapshot = exploration;
    const actorGeometry = profile.movement === 'fly' ? new THREE.OctahedronGeometry(.85, 1)
      : profile.architecture === 'machines' || profile.architecture === 'factory' ? new THREE.BoxGeometry(.85, 1.8, .85)
      : new THREE.CapsuleGeometry(.44, 1.15, 4, 8);
    const actorMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .52, metalness: .25 });
    const actorMeshes = new THREE.InstancedMesh(actorGeometry, actorMaterial, 180);
    actorMeshes.count = 0;
    actorMeshes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(actorMeshes);
    const actorBody = new THREE.Object3D();
    const actorTarget = new THREE.Vector3();
    const actorMemory = new Map<string, THREE.Vector3>();
    const regionAnchors = new Map(Object.entries(layout.regionAnchors));
    const actorFingerprints = new Map<string, number>();
    const activeTint = new THREE.Color(profile.accent);
    const tiredTint = new THREE.Color(0xed956e);
    let nearbyId = '';
    const pointer = renderer.domElement;
    pointer.tabIndex = 0;
    pointer.setAttribute('aria-label', 'Focus to control the three-dimensional environment');
    pointer.style.touchAction = 'none';
    // Do not steal focus from keyboard-operated navigation. Mouse/touch entry
    // explicitly focuses the canvas; keyboard users can tab into it.

    const keyToMovement = (key: string): Movement | null => {
      const keyMap: Record<string, Movement> = {
        w: 'forward', ArrowUp: 'forward', s: 'back', ArrowDown: 'back',
        a: 'left', ArrowLeft: 'left', d: 'right', ArrowRight: 'right',
        ' ': 'up',
        // Sprint on foot; vertical descent while flying (existing behavior).
        Shift: profile.movement === 'fly' ? 'down' : 'sprint',
      };
      return keyMap[key] ?? null;
    };
    const down = (event: KeyboardEvent) => {
      const explorer = host.closest('[aria-label="Immersive 3D world explorer"]');
      if (!explorer?.contains(document.activeElement)) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)) return;
      const value = keyToMovement(event.key);
      if (value) { actions.current.add(value); event.preventDefault(); }
      if (event.key.toLowerCase() === 'e') {
        const t = targets.find(t => t.id === nearbyId);
        if (t) { setInspectedSiteId(t.id); setInteractionResult(''); }
      }
    };
    const up = (event: KeyboardEvent) => {
      const value = keyToMovement(event.key);
      if (value) actions.current.delete(value);
    };
    const pointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      pointer.focus({ preventScroll: true });
      lookPointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      pointer.setPointerCapture(e.pointerId);
    };
    const pointerMove = (e: PointerEvent) => {
      const p = lookPointer.current;
      if (!p || p.id !== e.pointerId) return;
      view.current.yaw -= (e.clientX - p.x) * .004;
      view.current.pitch = Math.max(-1.3, Math.min(1.3, view.current.pitch - (e.clientY - p.y) * .0035));
      lookPointer.current = { id: p.id, x: e.clientX, y: e.clientY };
    };
    const pointerUp = (e: PointerEvent) => { if (lookPointer.current?.id === e.pointerId) lookPointer.current = null; };
    const resetInputs = () => actions.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', resetInputs);
    pointer.addEventListener('pointerdown', pointerDown);
    pointer.addEventListener('pointermove', pointerMove);
    pointer.addEventListener('pointerup', pointerUp);
    pointer.addEventListener('pointercancel', pointerUp);
    const resize = () => {
      if (!host.isConnected) return;
      const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    // Preallocated scratch vectors: the animation loop performs no per-frame
    // heap allocation for movement math.
    const moveDir = new THREE.Vector3();
    const desiredVelocity = new THREE.Vector3();
    const smoothVelocity = new THREE.Vector3();
    const isWalking = profile.movement === 'walk';
    const baseSpeed = isWalking ? 12 : 19;
    let walkPhase = 0;
    let fovCurrent = 73;
    let lastTime = performance.now(), stamp = 0, lastActorUpdate = 0, lastDiagnostics = 0, frameId = 0;
    const animate = (time: number) => {
      frameId = requestAnimationFrame(animateEntry);
      // Clamp long frames (slow devices/software rasterizers) to a still-
      // playable catch-up step; collision radii bound any tunneling risk.
      const dt = Math.min(.1, Math.max(0, (time - lastTime) / 1000));
      lastTime = time;
      const orientation = view.current;
      const p = player.current;
      const f = Number(actions.current.has('forward')) - Number(actions.current.has('back'));
      const r = Number(actions.current.has('right')) - Number(actions.current.has('left'));
      const sprinting = isWalking && actions.current.has('sprint') && (f !== 0 || r !== 0);
      const speed = baseSpeed * (sprinting ? 1.55 : 1);
      // Movement basis verified against THREE camera world direction.
      const basis = movementBasis(orientation.yaw);
      moveDir.set(
        basis.forward[0] * f + basis.right[0] * r, 0,
        basis.forward[1] * f + basis.right[1] * r,
      );
      if (moveDir.lengthSq() > 0) moveDir.normalize();
      desiredVelocity.copy(moveDir).multiplyScalar(speed);
      // Responsive acceleration with quick settle: input feels immediate but
      // starts/stops without a velocity pop.
      smoothVelocity.lerp(desiredVelocity, 1 - Math.exp(-(desiredVelocity.lengthSq() > 0 ? 11 : 14) * dt));
      const nx = Math.max(-layout.extent, Math.min(layout.extent, p.x + smoothVelocity.x * dt));
      const nz = Math.max(-layout.extent, Math.min(layout.extent, p.z + smoothVelocity.z * dt));
      const blocked = isWalking && collision.some(c => Math.hypot(nx - c.x, nz - c.z) < c.radius + .7);
      if (!blocked) { p.x = nx; p.z = nz; }
      if (!isWalking) {
        p.y = Math.max(2.2, Math.min(72, p.y + (Number(actions.current.has('up')) - Number(actions.current.has('down'))) * dt * 12));
      } else {
        // Ground-following over the visual heightfield, with a gentle head bob.
        const groundY = terrainHeight(p.x, p.z, profile, visualSeed) + 2.2;
        p.y += (groundY - p.y) * Math.min(1, dt * 9);
        if (!reducedMotion && smoothVelocity.lengthSq() > 1) {
          walkPhase += dt * (sprinting ? 11.5 : 8.2);
        }
      }
      const bob = isWalking && !reducedMotion ? Math.sin(walkPhase) * .055 : 0;
      camera.position.set(p.x, p.y + bob, p.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.y = orientation.yaw;
      camera.rotation.x = orientation.pitch;
      // Subtle sprint FOV response (skipped under reduced motion).
      const fovTarget = reducedMotion ? 73 : 73 + (sprinting ? 5 : 0);
      if (Math.abs(fovCurrent - fovTarget) > .05) {
        fovCurrent += (fovTarget - fovCurrent) * Math.min(1, dt * 6);
        camera.fov = fovCurrent;
        camera.updateProjectionMatrix();
      }
      // Field units are sourced from real kernel actor state. Interpolation is
      // presentation-only; it never feeds positions or time into the simulation.
      if (time - lastActorUpdate >= 90) {
      lastActorUpdate = time;
      if (routeSnapshot !== liveExploration.current) {
        scenery.refresh(liveExploration.current);
        routeSnapshot = liveExploration.current;
      }
      let actorCount = 0;
      const worldTransform = liveLayout.current.sourceTransform;
      for (const actor of liveActors.current) {
        if (actorCount >= 180) break;
        const neighbor = regionAnchors.get(actor.regionId);
        if (!actor.nativePosition && !neighbor) continue;
        const baseX = actor.nativePosition ? (actor.nativePosition[0] - worldTransform.centerX) * worldTransform.scale : neighbor!.x;
        const baseZ = actor.nativePosition ? (actor.nativePosition[1] - worldTransform.centerZ) * worldTransform.scale : neighbor!.z;
        let fingerprint = actorFingerprints.get(actor.id);
        if (fingerprint === undefined) { fingerprint = sceneHash(actor.id); actorFingerprints.set(actor.id, fingerprint); }
        const bearing = (fingerprint % 628) / 100;
        const distance = 2.8 + (fingerprint >>> 10) % 31 / 10;
        actorTarget.set(baseX + Math.cos(bearing) * distance, isWalking ? 1.2 : 6 + fingerprint % 9, baseZ + Math.sin(bearing) * distance);
        let position = actorMemory.get(actor.id);
        if (!position) { position = actorTarget.clone(); actorMemory.set(actor.id, position); }
        position.lerp(actorTarget, reducedMotion ? 1 : Math.min(1, dt * 4));
        actorBody.position.copy(position);
        actorBody.rotation.y = bearing;
        actorBody.scale.setScalar(.8 + (actor.role % 4) * .12);
        actorBody.updateMatrix();
        actorMeshes.setMatrixAt(actorCount, actorBody.matrix);
        actorMeshes.setColorAt(actorCount, actor.energy < 25 ? tiredTint : activeTint);
        actorCount++;
      }
      actorMeshes.count = actorCount;
      actorMeshes.instanceMatrix.needsUpdate = true;
      if (actorMeshes.instanceColor) actorMeshes.instanceColor.needsUpdate = true;
      actorMeshes.computeBoundingSphere();
      // Project the latest surveyed state, not the original scene snapshot.
      // Repairs, disasters and science appear as genuinely changing beacons.
      for (const site of liveLayout.current.points) {
        const marker = beacons.get(site.id);
        if (marker) marker.material = beaconMaterials[fieldBeaconState(site)];
      }
      }
      if (time - stamp > 200) {
        stamp = time;
        const nearby = targets
          .map(t => ({ ...t, distance: Math.hypot(p.x - t.x, p.z - t.z) }))
          .sort((a,b) => a.distance - b.distance)[0];
        const inRange = nearby && nearby.distance < 12 ? nearby : null;
        nearbyId = inRange?.id ?? '';
        setTarget(previous => previous === (inRange?.id ?? null) ? previous : (inRange?.id ?? null));
        setLocation({ x: Math.round(p.x), z: Math.round(p.z) });
        const waypoint = liveWaypoint.current;
        setBearingReadout(waypoint
          ? fieldBearing(p.x, p.z, orientation.yaw, waypoint.x, waypoint.z)
          : null);
        const observed = liveLayout.current.points.find(site => site.id === inRange?.id);
        setReadout(inRange
          ? `${observed?.label ?? 'Unidentified contact'} · ${Math.round(inRange.distance)} m · E / INSPECT`
          : nearby
            ? `Nearest contact ${Math.round(nearby.distance)} m — move closer to investigate`
            : 'Move toward a structure to investigate');
      }
      renderer.render(scene, camera);
      // Actual WebGL submission counters, sampled slowly for automated browser proof.
      if (time - lastDiagnostics >= 1000) {
        lastDiagnostics = time;
        pointer.dataset.drawCalls = String(renderer.info.render.calls);
        pointer.dataset.worldSites = String(layout.points.length);
        pointer.dataset.simulatedActors = String(actorMeshes.count);
        pointer.dataset.serviceBeacons = String([...beacons.values()]
          .filter(beacon => beacon.material === serviceMaterial || beacon.material === criticalMaterial).length);
      }
    };
    // Hidden tabs suspend GPU work entirely; the loop keeps scheduling so state
    // stays coherent on return, but skips rendering and per-frame updates.
    const animateEntry = (time: number) => {
      if (document.hidden) {
        lastTime = time;
        frameId = requestAnimationFrame(animateEntry);
        return;
      }
      animate(time);
    };
    frameId = requestAnimationFrame(animateEntry);
    const onLost = (event: Event) => { event.preventDefault(); setWebglFailed(true); cancelAnimationFrame(frameId); };
    const onRestored = () => { setWebglFailed(false); setContextGeneration(generation => generation + 1); };
    pointer.addEventListener('webglcontextlost', onLost);
    pointer.addEventListener('webglcontextrestored', onRestored);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', resetInputs);
      pointer.removeEventListener('pointerdown', pointerDown);
      pointer.removeEventListener('pointermove', pointerMove);
      pointer.removeEventListener('pointerup', pointerUp);
      pointer.removeEventListener('pointercancel', pointerUp);
      pointer.removeEventListener('webglcontextlost', onLost);
      pointer.removeEventListener('webglcontextrestored', onRestored);
      actions.current.clear();
      scene.traverse(node => {
        const mesh = node as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
        }
        if (node instanceof THREE.InstancedMesh) node.dispose();
      });
      [mainMaterial, accentMaterial, unknownMaterial, resolvedMaterial, unsafeMaterial, criticalMaterial, serviceMaterial, actorMaterial,
        ...scenery.materials, ...flora.materials, ...atmosphere.materials, ...terrain.materials,
      ].forEach(m => m.dispose());
      atmosphere.textures.forEach(texture => texture.dispose());
      renderer.dispose();
      pointer.remove();
    };
  }, [atlas.worldId, runId, layout.profile.architecture, reducedMotion, contextGeneration]);

  const inspected = layout.points.find(point => point.id === inspectedSiteId);
  const observed = inspected ? presentSite(atlas, exploration, inspected.id) : null;
  const stage = inspected ? exploration.sites[inspected.id].discoveryState : null;
  const guidance = inspected ? suggestedAction(atlas, exploration, inspected.id) : null;
  const nextStage = (['detect','survey','discover','travel','investigate','repair','resolve','operate','recover'] as const)
    .find(action => action === guidance?.action) ?? null;
  const isLocal = !!inspected && exploration.expedition.regionId === inspected.regionId && exploration.sites[inspected.id].firstVisitedTick !== null;
  const records = isLocal && inspected ? exploration.journal.filter(event => event.siteId === inspected.id).slice(-3) : [];
  const actionButton = (label: string, movement: Movement) => (
    <button type="button" aria-label={label} onPointerDown={event => { event.preventDefault(); actions.current.add(movement); (event.currentTarget as HTMLButtonElement).setPointerCapture(event.pointerId); }}
      onPointerUp={() => actions.current.delete(movement)} onPointerCancel={() => actions.current.delete(movement)} onLostPointerCapture={() => actions.current.delete(movement)}
      style={{ minWidth: 52, minHeight: 52, background: '#172534d9', border: '1px solid #729aa9', color: 'white', borderRadius: 8, touchAction: 'none', fontSize: 22 }}>
      {label}
    </button>
  );
  return (
    <section aria-label="Immersive 3D world explorer" style={{ position:'relative', minHeight:'min(82dvh,960px)', height:'min(82dvh,960px)', background:'#080d17', border:'1px solid #395565', overflow:'hidden', borderRadius:8 }}>
      <div ref={sceneHost} aria-label="Three.js playable universe" style={{ position:'absolute', inset:0 }} />
      {webglFailed && <div role="alert" style={{ position:'absolute', inset:0, display:'grid', placeContent:'center', padding:24, background:'#101a27', color:'white' }}>3D rendering is unavailable on this device. Return to the fully accessible Atlas for exploration and simulation controls.</div>}
      <div style={{ position:'absolute', left:12, top:12, right:12, display:'flex', justifyContent:'space-between', gap:8, pointerEvents:'none' }}>
        <div style={{ background:'#07111ad9', padding:'9px 12px', color:'#e1f2f9', maxWidth:'70%', borderLeft:'3px solid #89c7d4' }}>
          <strong>{atlas.worldId.replace(/-/g, ' ').toUpperCase()} · 3D EXPLORATION</strong>
          <small style={{ display:'block', color:'#bdd0dc' }}>{layout.profile.description}</small>
          <small style={{ display:'block', color:'#bdd0dc' }}>{layout.points.length} mapped places · {actors.length} simulated field units</small>
          <small style={{ display:'block', color:'#bdd0dc' }}>{readout}</small>
          <div role="group" aria-label="Visual field bearing" data-testid="field-bearing-guide"
            style={{ marginTop:7, paddingTop:6, borderTop:'1px solid #506c78', display:'grid', gap:3 }}>
            <small style={{ color:'#accbd6', letterSpacing:'.06em' }}>FIELD BEARING · VISUAL ONLY</small>
            {guidedWaypoint ? <>
              <strong data-testid="field-waypoint-name" style={{ fontSize:12 }}>{guidedWaypoint.label}</strong>
              <output data-testid="field-bearing-readout" style={{ fontSize:12, color:'#ffe6a8' }}>
                {bearingReadout
                  ? `${bearingReadout.arrow} ${bearingReadout.direction} · ${Math.round(bearingReadout.distance)} scene metres`
                  : 'Acquiring visual bearing…'}
              </output>
              {guidedWaypoint.hazard !== null && guidedWaypoint.hazard > 70 &&
                <small style={{ color:'#ffb6ba' }}>Unsafe site hazard; expedition access is not guaranteed.</small>}
            </> : <small style={{ color:'#bdd0dc' }}>
              {waypoints.length ? 'Guide hidden · free exploration' : 'No recognized destination yet'}
            </small>}
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, pointerEvents:'auto' }}>
              <button type="button" aria-label="Track next known site" disabled={!waypoints.length} onClick={cycleWaypoint}
                style={{ minHeight:44, border:'1px solid #88bac9', borderRadius:5, color:'white', background:'#274359', padding:'5px 11px' }}>
                {guidedWaypoint ? 'Next site' : 'Track a site'}
              </button>
              {guidedWaypoint && <button type="button" aria-label="Hide field bearing" onClick={() => { setGuideVisible(false); setBearingReadout(null); }}
                style={{ minHeight:44, border:'1px solid #718895', borderRadius:5, color:'white', background:'#1b2b38', padding:'5px 11px' }}>
                Hide guide
              </button>}
            </div>
          </div>
        </div>
        <div style={{ background:'#07111ad9', padding:8, font:'11px monospace', color:'#d2ecf0' }}>X {location.x} / Z {location.z}</div>
      </div>
      <div aria-hidden="true" style={{ position:'absolute', left:'50%', top:'50%', transform:'translate(-50%,-50%)', color:'white', textShadow:'0 1px 3px black', fontSize:22, pointerEvents:'none' }}>+</div>
      <div style={{ position:'absolute', bottom:12, left:12, display:'grid', gap:5 }}>
        <div style={{ display:'flex', justifyContent:'center' }}>{actionButton('Forward', 'forward')}</div>
        <div style={{ display:'flex', gap:5 }}>{actionButton('Left', 'left')}{actionButton('Back', 'back')}{actionButton('Right', 'right')}</div>
      </div>
      <div style={{ position:'absolute', bottom:12, right:12, display:'grid', gap:6, justifyItems:'end' }}>
        {layout.profile.movement === 'fly' && <div style={{ display:'flex', gap:6 }}>{actionButton('Ascend', 'up')}{actionButton('Descend', 'down')}</div>}
        <button type="button" disabled={!target} onClick={() => { if (target) { setInspectedSiteId(target); setInteractionResult(''); } }} style={{ minHeight:44, padding:'9px 14px', background:target?'#b6e6e7':'#26313d', color:'#061217', border:0, borderRadius:6, fontWeight:700 }}>Inspect nearby</button>
        <button type="button" onClick={onReturnToAtlas} style={{ minHeight:44, padding:'9px 14px', background:'#091825db', color:'white', border:'1px solid #789bab', borderRadius:6 }}>Return to Atlas</button>
      </div>
      {inspected && <aside aria-label="Nearby site investigation" style={{ position:'absolute', top:115, right:12, width:'min(350px,calc(100% - 24px))', maxHeight:'calc(100% - 235px)', overflowY:'auto', background:'#0b1824f2', border:'1px solid #81b6c5', padding:14, color:'#effaff', boxShadow:'0 14px 48px #0009', borderRadius:8 }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:8, alignItems:'center' }}><strong>{observed?.label ?? 'Unidentified contact'}</strong><button type="button" aria-label="Close nearby site investigation" onClick={() => setInspectedSiteId(null)} style={{ background:'#273f52', color:'white', border:0, padding:'6px 11px' }}>×</button></div>
        <p style={{ fontSize:12, color:'#b9d2df', margin:'7px 0' }}>Region {inspected.regionId} · {stage}</p>
        <p style={{ fontSize:13 }}>{observed?.description ?? 'An unclassified field contact. Your instruments have not identified its origin.'}</p>
        {guidance && <p style={{ fontSize:12, color:'#aed9d9', borderLeft:'2px solid #7dbbb6', paddingLeft:9 }}>{guidance.instruction}</p>}
        {observed?.condition !== null && observed?.condition !== undefined && <p style={{ fontSize:12 }}>Installation integrity: {observed.condition.toFixed(1)}%</p>}
        {nextStage && <button type="button" disabled={target !== inspected.id || !!exploration.expedition.journey} onClick={() => setInteractionResult(onSiteAction(inspected.id, nextStage))} style={{ minHeight:44, background:'#a7ddcd', color:'#091916', border:0, padding:'8px 12px', borderRadius:5, fontWeight:700, marginRight:6 }}>{nextStage === 'travel' ? 'Begin expedition travel' : nextStage.charAt(0).toUpperCase()+nextStage.slice(1)}</button>}
        {isLocal && <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8, marginBottom:8 }}>
          <button type="button" disabled={target !== inspected.id} onClick={() => setInteractionResult(onSiteAction(inspected.id, 'repair'))} style={{ minHeight:42, padding:'8px 12px', background:'#263c43', border:'1px solid #88b5ac', borderRadius:5, color:'#effaff' }}>Repair installation</button>
          <button type="button" disabled={target !== inspected.id} onClick={() => setInteractionResult(onSiteAction(inspected.id, 'operate'))} style={{ minHeight:42, padding:'8px 12px', background:'#263c43', border:'1px solid #88b5ac', borderRadius:5, color:'#effaff' }}>Operate facility</button>
        </div>}
        {observed?.history && <details style={{ fontSize:12, margin:'8px 0' }}><summary>Recovered background record</summary><p>{observed.history.origin}</p><small>Generated historical context, not eyewitness proof · {observed.history.formationEpoch}</small></details>}
        {records.length > 0 && <div style={{ margin:'8px 0', borderTop:'1px solid #526779', paddingTop:8 }}><strong style={{ fontSize:11 }}>RECORDED FIELD ACTIONS</strong><ol style={{ fontSize:11, margin:'5px 0', paddingLeft:20 }}>{records.map(record => <li key={record.id}>T{record.tick} · {record.action}</li>)}</ol></div>}
        <button type="button" onClick={() => { onSelectSite(inspected.id); onReturnToAtlas(); }} style={{ minHeight:44, background:'#253948', color:'white', border:'1px solid #647e91', padding:'8px 12px', borderRadius:5 }}>Full dossier</button>
        {interactionResult && <p role="status" style={{ fontSize:12, color:'#d7e8cc' }}>{interactionResult}</p>}
      </aside>}
      {exploration.expedition.journey && <div role="status" style={{ position:'absolute', left:'50%', bottom:84, transform:'translateX(-50%)', background:'#142238ed', color:'#e3f4fa', fontSize:12, padding:7, display:'flex', alignItems:'center', gap:8 }}><span>Travel in progress · arrival T{exploration.expedition.journey.arrivalTick}</span><button type="button" onClick={onAdvanceTime} style={{ minHeight:40, background:'#a9d8e5', color:'#07131c', border:0, borderRadius:4 }}>Advance 1 tick</button></div>}
      <div style={{ position:'absolute', left:'50%', bottom:6, transform:'translateX(-50%)', fontSize:10, color:'#d8f6ff', background:'#07111aca', padding:4, pointerEvents:'none' }}>Physical exploration · deterministic expedition actions and history</div>
    </section>
  );
};
