import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ExplorationAtlas, ExplorationState } from '../exploration/contracts';
import { ImmersiveLandmark, makeImmersiveLayout, sceneHash } from '../exploration/immersiveLayout';
import './immersive.css';

interface Props {
  atlas: ExplorationAtlas;
  exploration: ExplorationState;
  runId: string;
  selectedSiteId: string;
  onSelectSite: (id: string) => void;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const ImmersiveWorld: React.FC<Props> = ({ atlas, exploration, runId, selectedSiteId, onSelectSite }) => {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{ camera: THREE.PerspectiveCamera; nearest: () => ImmersiveLandmark | null; position: () => string } | null>(null);
  const selectedRef = useRef(onSelectSite);
  selectedRef.current = onSelectSite;
  const layout = makeImmersiveLayout(atlas, exploration);
  const [webglError, setWebglError] = useState('');
  const [position, setPosition] = useState('INITIALIZING');
  const [nearby, setNearby] = useState<ImmersiveLandmark | null>(null);
  const [focus, setFocus] = useState(false);
  const [touch, setTouch] = useState<string[]>([]);
  const touchRef = useRef<string[]>([]);
  touchRef.current = touch;
  const [heading, setHeading] = useState(0);
  const compassRef = useRef(0);
  const chosenRef = useRef(selectedSiteId);
  chosenRef.current = selectedSiteId;
  const pointsRef = useRef(layout.points);
  pointsRef.current = layout.points;

  useEffect(() => {
    const root = host.current;
    if (!root) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'default' });
    } catch {
      setWebglError('WebGL unavailable. Use the accessible Living World Atlas to explore sites.');
      return;
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(layout.profile.sky);
    scene.fog = new THREE.Fog(layout.profile.horizon, 70, 240);
    const camera = new THREE.PerspectiveCamera(76, 1, 0.08, 400);
    const position3 = new THREE.Vector3(layout.spawn.x, layout.profile.movement === 'fly' ? 9 : 2.5, layout.spawn.z);
    camera.position.copy(position3);
    const sun = new THREE.DirectionalLight(0xffedd5, 1.6);
    sun.position.set(30, 70, -45);
    scene.add(sun, new THREE.HemisphereLight(layout.profile.horizon, layout.profile.ground, 1.8));
    const owned: Array<THREE.BufferGeometry | THREE.Material> = [];
    const makeMaterial = (color: number, emissive = 0) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.83, emissive, emissiveIntensity: .28 });
      owned.push(m);
      return m;
    };
    const groundMat = makeMaterial(layout.profile.ground);
    const accentMat = makeMaterial(layout.profile.accent, layout.profile.accent);
    const structureMat = makeMaterial(new THREE.Color(layout.profile.ground).lerp(new THREE.Color(0xa9aeb8), .43).getHex());
    const shadowMat = makeMaterial(new THREE.Color(layout.profile.ground).multiplyScalar(.65).getHex());
    const warningMat = makeMaterial(0xcc7568, 0x632316);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const column = new THREE.CylinderGeometry(.5, .7, 1, 7);
    const cone = new THREE.ConeGeometry(1, 2.5, 6);
    const sphere = new THREE.IcosahedronGeometry(1, 1);
    owned.push(box, column, cone, sphere);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(layout.extent * 2.3, layout.extent * 2.3), groundMat);
    owned.push(ground.geometry);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -.05;
    scene.add(ground);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot = 0) => {
      const obj = new THREE.Mesh(geo, mat);
      obj.position.set(x, y, z);
      obj.scale.set(sx, sy, sz);
      obj.rotation.y = rot;
      scene.add(obj);
      return obj;
    };
    const isSky = layout.profile.movement === 'fly';
    const featureSeed = sceneHash(atlas.worldId + ':' + runId);
    for (let i = 0; i < 190; i++) {
      const a = ((i * 137.507 + featureSeed % 360) * Math.PI / 180);
      const r = 10 + Math.sqrt((i + .5) / 190) * (layout.extent * 1.15);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const s = 2 + ((sceneHash(atlas.worldId + ':feature:' + i) % 700) / 100);
      const nearSite = layout.points.some(p => Math.hypot(p.x - x, p.z - z) < 5);
      if (nearSite) continue;
      const theme = layout.profile.architecture;
      if (['forest', 'wilds'].includes(theme)) {
        add(column, shadowMat, x, s * .55, z, .37, s, .37);
        add(cone, groundMat, x, s * 1.65, z, s * .58, s * 1.65, s * .58);
      } else if (['city','factory','machines','habitat','settlement','ruins','terraform'].includes(theme)) {
        const tall = theme === 'city' ? s * 3.5 : s * 1.6;
        add(box, i % 4 ? structureMat : shadowMat, x, tall / 2, z, 2 + i % 3, tall, 2.5, a);
      } else if (['orbit','signal'].includes(theme)) {
        add(column, i % 3 ? shadowMat : accentMat, x, s, z, .4, s * 2, .4);
        add(sphere, accentMat, x, s * 2, z, .3, .3, .3);
      } else if (theme === 'reef') {
        add(cone, i % 5 ? structureMat : accentMat, x, s * .65, z, s * .42, s * 1.3, s * .42);
      } else {
        add(cone, structureMat, x, s * .55, z, s * .9, s, s * .9);
      }
    }
    const markers = new Map<string, THREE.Mesh>();
    for (const point of layout.points) {
      const h = 3.3 + point.visualSeed % 45 / 10;
      const pillar = add(
        layout.profile.architecture === 'ruins' ? box : column,
        point.discovery === 'UNKNOWN' ? shadowMat : point.condition !== null && point.condition < 30 ? warningMat : structureMat,
        point.x, h * .5, point.z, 1.9, h, 1.9,
      );
      pillar.userData.siteId = point.id;
      const beacon = add(sphere, point.discovery === 'UNKNOWN' ? shadowMat : accentMat, point.x, h + .8, point.z, .55, .55, .55);
      beacon.userData.siteId = point.id;
      markers.set(point.id, beacon);
      add(box, shadowMat, point.x, .12, point.z, 4, .25, 4);
    }
    let width = 0, height = 0;
    const resize = () => {
      const w = root.clientWidth || 600, h = root.clientHeight || 460;
      if (w === width && h === height) return;
      width = w; height = h;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    root.appendChild(renderer.domElement);
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('aria-label','Interactive three-dimensional world exploration');
    renderer.domElement.style.touchAction = 'none';
    let yaw = 0, pitch = 0, activePointer: number | null = null, lx = 0, ly = 0;
    const keys = new Set<string>();
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.activeElement !== renderer.domElement && document.pointerLockElement !== renderer.domElement) return;
      if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','KeyE'].includes(event.code)) event.preventDefault();
      keys.add(event.code);
      if (event.code === 'KeyE') {
        const near = nearest();
        if (near) selectedRef.current(near.id);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => { keys.delete(event.code); };
    const onBlur = () => keys.clear();
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      activePointer = event.pointerId; lx = event.clientX; ly = event.clientY;
      renderer.domElement.focus();
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== activePointer) return;
      yaw -= (event.clientX - lx) * .004;
      pitch = clamp(pitch - (event.clientY - ly) * .003, -1.35, 1.35);
      lx = event.clientX; ly = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => { if (activePointer === event.pointerId) activePointer = null; };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    const nearest = () => {
      let best: ImmersiveLandmark | null = null, d = Infinity;
      for (const point of pointsRef.current) {
        const distance = Math.hypot(position3.x - point.x, position3.z - point.z);
        if (distance < 8 && distance < d) { best = point; d = distance; }
      }
      return best;
    };
    sceneRef.current = { camera, nearest, position: () => position3.x.toFixed(0) + ', ' + position3.z.toFixed(0) };
    const clock = new THREE.Clock();
    let raf = 0, lastHud = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), .05);
      const buttons = touchRef.current;
      const forward = Number(keys.has('KeyW') || keys.has('ArrowUp') || buttons.includes('forward')) - Number(keys.has('KeyS') || keys.has('ArrowDown') || buttons.includes('back'));
      const strafe = Number(keys.has('KeyD') || buttons.includes('right')) - Number(keys.has('KeyA') || buttons.includes('left'));
      const turn = Number(buttons.includes('turnRight')) - Number(buttons.includes('turnLeft'));
      yaw -= turn * dt * 1.5;
      const speed = (keys.has('ShiftLeft') ? 21 : 12) * dt;
      const norm = Math.max(1, Math.hypot(forward, strafe));
      position3.x += (-Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * speed / norm;
      position3.z += (-Math.cos(yaw) * forward - Math.sin(yaw) * strafe) * speed / norm;
      position3.x = clamp(position3.x, -layout.extent, layout.extent);
      position3.z = clamp(position3.z, -layout.extent, layout.extent);
      if (isSky) {
        const up = Number(buttons.includes('up') || keys.has('Space')) - Number(buttons.includes('down') || keys.has('ControlLeft'));
        position3.y = clamp(position3.y + up * speed, 2.5, 50);
      }
      camera.position.copy(position3);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(pitch, yaw, 0);
      resize();
      for (const [id, marker] of markers) marker.scale.setScalar(id === chosenRef.current ? .85 : .55);
      renderer.render(scene, camera);
      if (now - lastHud > 180) {
        lastHud = now;
        setNearby(nearest());
        setPosition(sceneRef.current?.position() ?? '');
        setHeading(Math.round(((yaw * 180 / Math.PI) % 360 + 360) % 360));
        compassRef.current = yaw;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      sceneRef.current = null;
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      if (root.contains(renderer.domElement)) root.removeChild(renderer.domElement);
      for (const resource of owned) resource.dispose();
      renderer.dispose();
    };
  }, [atlas.worldId, runId, exploration.expedition.regionId]);
  const press = (button: string) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setTouch(value => [...value.filter(v => v !== button), button]); },
    onPointerUp: () => setTouch(value => value.filter(v => v !== button)),
    onPointerCancel: () => setTouch(value => value.filter(v => v !== button)),
    onLostPointerCapture: () => setTouch(value => value.filter(v => v !== button)),
  });
  return <section className="immersive-experience" aria-label="Walkable 3D world explorer">
    <div className="immersive-header"><strong>EXPLORE IN 3D</strong><span>{layout.profile.description}</span><span>{layout.profile.movement === 'fly' ? 'FREE FLIGHT' : 'ON FOOT'} · HEADING {heading}° · {position}</span></div>
    <div className="immersive-canvas" ref={host}>
      <div className="immersive-crosshair" aria-hidden="true">+</div>
      {nearby && <div className="immersive-nearby" role="status">NEARBY: {nearby.label}<button onClick={() => selectedRef.current(nearby.id)}>Inspect location (E)</button></div>}
      {webglError && <div className="immersive-error" role="alert">{webglError}</div>}
    </div>
    <div className="immersive-controls">
      <div className="immersive-help">Click and drag to look. WASD / arrows to move. Shift to sprint. E to inspect. {layout.profile.movement === 'fly' ? 'Space/Ctrl to rise/descend.' : ''} Touch controls below.</div>
      <div className="immersive-pad" aria-label="Touch exploration controls">
        {([['turnLeft','↶'],['forward','↑'],['turnRight','↷'],['left','←'],['back','↓'],['right','→'], ...(layout.profile.movement === 'fly' ? [['up','Rise'],['down','Descend']] : [])] as string[][]).map(([id,label]) => <button type="button" key={id} aria-label={id} {...press(id)}>{label}</button>)}
      </div>
      <button type="button" onClick={() => { sceneRef.current?.camera.position.set(layout.spawn.x, layout.profile.movement === 'fly' ? 9 : 2.5, layout.spawn.z); setFocus(!focus); }}>Reset exploration view</button>
    </div>
    <p className="immersive-note">Free movement is reconnaissance, not a simulation travel command. Use the Atlas to formally detect, travel, investigate and record evidence. Unidentified contacts remain unnamed until discovered.</p>
  </section>;
};
