import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ExplorationAtlas, ExplorationState } from '../exploration/contracts';
import { ExplorationCommand, presentSite } from '../exploration/engine';
import { makeImmersiveLayout, SceneProfile } from '../exploration/immersiveLayout';
import { addImmersiveScenery } from './immersiveScenery';

interface Props {
  atlas: ExplorationAtlas;
  exploration: ExplorationState;
  runId: string;
  onSelectSite: (id: string) => void;
  onSiteAction: (id: string, kind: ExplorationCommand['action']) => string;
  onAdvanceTime: () => void;
  onReturnToAtlas: () => void;
  reducedMotion?: boolean;
}
type Movement = 'forward' | 'back' | 'left' | 'right' | 'up' | 'down';

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
  atlas, exploration, runId, onSelectSite, onSiteAction, onAdvanceTime, onReturnToAtlas, reducedMotion,
}) => {
  const layout = useMemo(() => makeImmersiveLayout(atlas, exploration), [atlas, exploration]);
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
  const [readout, setReadout] = useState('MOVE: W A S D / ARROWS · LOOK: DRAG · INTERACT: E');
  const [webglFailed, setWebglFailed] = useState(false);
  const [location, setLocation] = useState({ x: player.current.x, z: player.current.z });

  useEffect(() => {
    player.current = { x: layout.spawn.x, y: 2.2, z: layout.spawn.z };
    view.current = { yaw: -.5, pitch: -.12 };
    actions.current.clear();
    setTarget(null);
    setInspectedSiteId(null);
    setInteractionResult('');
  }, [runId, atlas.worldId]);

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
    scene.background = new THREE.Color(profile.sky);
    scene.fog = new THREE.Fog(profile.horizon, 75, Math.max(190, layout.extent * 2));
    scene.add(new THREE.HemisphereLight(profile.horizon, profile.ground, 2.1));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(50, 85, 15);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(73, 1, .1, 800);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(layout.extent * 2.7, layout.extent * 2.7),
      new THREE.MeshStandardMaterial({ color: profile.ground, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const mainMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(profile.horizon).lerp(new THREE.Color(profile.ground), .6), roughness: .82, metalness: .12 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: profile.accent, roughness: .48, emissive: profile.accent, emissiveIntensity: .24 });
    const unknownMaterial = new THREE.MeshStandardMaterial({ color: 0x7c8795, roughness: .78, metalness: .22 });
    const objects = new THREE.Group();
    scene.add(objects);
    const collision: Array<{ x: number; z: number; radius: number }> = [];
    const targets: Array<{ id: string; x: number; z: number; name: string }> = [];
    for (const site of layout.points) {
      const discovered = site.discovery !== 'UNKNOWN';
      const material = discovered ? mainMaterial : unknownMaterial;
      landmarkShape(objects, profile, site.visualSeed, site.x, site.z, material, accentMaterial, collision);
      const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(.8, 0), discovered ? accentMaterial : unknownMaterial);
      beacon.position.set(site.x, 13.5 + site.visualSeed % 6, site.z);
      beacon.userData.siteId = site.id;
      objects.add(beacon);
      targets.push({ id: site.id, x: site.x, z: site.z, name: site.label });
    }
    const sceneryMaterials = addImmersiveScenery(scene, atlas, exploration, layout);
    let nearbyId = '';
    const pointer = renderer.domElement;
    pointer.style.touchAction = 'none';

    const down = (event: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)) return;
      const keyMap: Record<string, Movement> = { w:'forward', ArrowUp:'forward', s:'back', ArrowDown:'back', a:'left', ArrowLeft:'left', d:'right', ArrowRight:'right', ' ':'up', Shift:'down' };
      const value = keyMap[event.key];
      if (value) { actions.current.add(value); event.preventDefault(); }
      if (event.key.toLowerCase() === 'e') {
        const t = targets.find(t => t.id === nearbyId);
        if (t) { setInspectedSiteId(t.id); setInteractionResult(''); }
      }
    };
    const up = (event: KeyboardEvent) => {
      const keyMap: Record<string, Movement> = { w:'forward', ArrowUp:'forward', s:'back', ArrowDown:'back', a:'left', ArrowLeft:'left', d:'right', ArrowRight:'right', ' ':'up', Shift:'down' };
      const value = keyMap[event.key];
      if (value) actions.current.delete(value);
    };
    const pointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
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
    let lastTime = performance.now(), stamp = 0, frameId = 0;
    const animate = (time: number) => {
      frameId = requestAnimationFrame(animate);
      const dt = Math.min(.045, Math.max(0, (time - lastTime) / 1000));
      lastTime = time;
      const orientation = view.current;
      const p = player.current;
      const f = Number(actions.current.has('forward')) - Number(actions.current.has('back'));
      const r = Number(actions.current.has('right')) - Number(actions.current.has('left'));
      const direction = new THREE.Vector3(
        Math.sin(orientation.yaw) * f + Math.cos(orientation.yaw) * r, 0,
        -Math.cos(orientation.yaw) * f + Math.sin(orientation.yaw) * r,
      );
      if (direction.lengthSq() > 0) direction.normalize().multiplyScalar(dt * (profile.movement === 'fly' ? 19 : 12));
      const nx = Math.max(-layout.extent, Math.min(layout.extent, p.x + direction.x));
      const nz = Math.max(-layout.extent, Math.min(layout.extent, p.z + direction.z));
      const blocked = profile.movement === 'walk' && collision.some(c => Math.hypot(nx - c.x, nz - c.z) < c.radius + .7);
      if (!blocked) { p.x = nx; p.z = nz; }
      if (profile.movement === 'fly') {
        p.y = Math.max(2.2, Math.min(72, p.y + (Number(actions.current.has('up')) - Number(actions.current.has('down'))) * dt * 12));
      } else p.y = 2.2;
      camera.position.set(p.x, p.y, p.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.y = orientation.yaw;
      camera.rotation.x = orientation.pitch;
      if (time - stamp > 200) {
        stamp = time;
        const nearby = targets
          .map(t => ({ ...t, distance: Math.hypot(p.x - t.x, p.z - t.z) }))
          .sort((a,b) => a.distance - b.distance)[0];
        const inRange = nearby && nearby.distance < 12 ? nearby : null;
        nearbyId = inRange?.id ?? '';
        setTarget(previous => previous === (inRange?.id ?? null) ? previous : (inRange?.id ?? null));
        setLocation({ x: Math.round(p.x), z: Math.round(p.z) });
        const observed = liveLayout.current.points.find(site => site.id === inRange?.id);
        setReadout(inRange ? ((observed?.label ?? 'Unidentified contact') + ' · E / INSPECT') : 'Move toward a structure to investigate');
      }
      renderer.render(scene, camera);
    };
    frameId = requestAnimationFrame(animate);
    const onLost = (event: Event) => { event.preventDefault(); setWebglFailed(true); cancelAnimationFrame(frameId); };
    pointer.addEventListener('webglcontextlost', onLost);
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
      actions.current.clear();
      scene.traverse(node => {
        const mesh = node as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
        }
      });
      [mainMaterial, accentMaterial, unknownMaterial, ...sceneryMaterials, ground.material as THREE.Material].forEach(m => m.dispose());
      renderer.dispose();
      pointer.remove();
    };
  }, [atlas.worldId, runId, layout.profile.architecture, reducedMotion]);

  const inspected = layout.points.find(point => point.id === inspectedSiteId);
  const observed = inspected ? presentSite(atlas, exploration, inspected.id) : null;
  const stage = inspected ? exploration.sites[inspected.id].discoveryState : null;
  const stageActions: Record<string, ExplorationCommand['action'] | null> = {
    UNKNOWN: 'detect', DETECTED: 'survey', SURVEYED: 'discover', DISCOVERED: 'travel',
    VISITED: 'investigate', INVESTIGATED: 'resolve', RESOLVED: null,
  };
  const nextStage = stage ? stageActions[stage] : null;
  const actionButton = (label: string, movement: Movement) => (
    <button type="button" aria-label={label} onPointerDown={event => { event.preventDefault(); actions.current.add(movement); (event.currentTarget as HTMLButtonElement).setPointerCapture(event.pointerId); }}
      onPointerUp={() => actions.current.delete(movement)} onPointerCancel={() => actions.current.delete(movement)} onLostPointerCapture={() => actions.current.delete(movement)}
      style={{ minWidth: 52, minHeight: 52, background: '#172534d9', border: '1px solid #729aa9', color: 'white', borderRadius: 8, touchAction: 'none', fontSize: 22 }}>
      {label}
    </button>
  );
  return (
    <section aria-label="Immersive 3D world explorer" style={{ position:'relative', minHeight:'min(75vh,760px)', height:'min(75vh,760px)', background:'#080d17', border:'1px solid #395565', overflow:'hidden', borderRadius:8 }}>
      <div ref={sceneHost} aria-label="Three.js playable universe" style={{ position:'absolute', inset:0 }} />
      {webglFailed && <div role="alert" style={{ position:'absolute', inset:0, display:'grid', placeContent:'center', padding:24, background:'#101a27', color:'white' }}>3D rendering is unavailable on this device. Return to the fully accessible Atlas for exploration and simulation controls.</div>}
      <div style={{ position:'absolute', left:12, top:12, right:12, display:'flex', justifyContent:'space-between', gap:8, pointerEvents:'none' }}>
        <div style={{ background:'#07111ad9', padding:'9px 12px', color:'#e1f2f9', maxWidth:'70%', borderLeft:'3px solid #89c7d4' }}>
          <strong>{atlas.worldId.replace(/-/g, ' ').toUpperCase()} · 3D EXPLORATION</strong>
          <small style={{ display:'block', color:'#bdd0dc' }}>{layout.profile.description}</small>
          <small style={{ display:'block', color:'#bdd0dc' }}>{readout}</small>
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
        {observed?.condition !== null && observed?.condition !== undefined && <p style={{ fontSize:12 }}>Installation integrity: {observed.condition.toFixed(1)}%</p>}
        {nextStage && <button type="button" disabled={target !== inspected.id || !!exploration.expedition.journey} onClick={() => setInteractionResult(onSiteAction(inspected.id, nextStage))} style={{ minHeight:44, background:'#a7ddcd', color:'#091916', border:0, padding:'8px 12px', borderRadius:5, fontWeight:700, marginRight:6 }}>{nextStage === 'travel' ? 'Begin expedition travel' : nextStage.charAt(0).toUpperCase()+nextStage.slice(1)}</button>}
        <button type="button" onClick={() => { onSelectSite(inspected.id); onReturnToAtlas(); }} style={{ minHeight:44, background:'#253948', color:'white', border:'1px solid #647e91', padding:'8px 12px', borderRadius:5 }}>Full dossier</button>
        {interactionResult && <p role="status" style={{ fontSize:12, color:'#d7e8cc' }}>{interactionResult}</p>}
      </aside>}
      {exploration.expedition.journey && <div role="status" style={{ position:'absolute', left:'50%', bottom:84, transform:'translateX(-50%)', background:'#142238ed', color:'#e3f4fa', fontSize:12, padding:7, display:'flex', alignItems:'center', gap:8 }}><span>Travel in progress · arrival T{exploration.expedition.journey.arrivalTick}</span><button type="button" onClick={onAdvanceTime} style={{ minHeight:40, background:'#a9d8e5', color:'#07131c', border:0, borderRadius:4 }}>Advance 1 tick</button></div>}
      <div style={{ position:'absolute', left:'50%', bottom:6, transform:'translateX(-50%)', fontSize:10, color:'#d8f6ff', background:'#07111aca', padding:4, pointerEvents:'none' }}>Physical exploration · deterministic expedition actions and history</div>
    </section>
  );
};
