import { SCENE_PROFILES } from '../exploration/immersiveLayout';
import { frameBounds } from './frameBounds';
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RenderFrameData } from '../core/contracts';

export interface ThreeWorldViewportProps {
  frame: RenderFrameData;
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string | null) => void;
  simplifiedMode?: boolean;
  reducedMotion?: boolean;
  highContrast?: boolean;
  compact?: boolean;
  onTelemetrySample?: (fps: number, frameTimeMs: number) => void;
  onWebglStatusChange?: (supported: boolean, contextLost?: boolean) => void;
}

interface CameraSphericalState {
  theta: number;
  phi: number;
  radius: number;
  targetX: number;
  targetY: number;
  targetZ: number;
}

const DEFAULT_CAMERA: CameraSphericalState = {
  theta: 0.62,
  phi: 0.88,
  radius: 76,
  targetX: 0,
  targetY: 0,
  targetZ: 0,
};

function canCreateWebGLContext(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const testCanvas = document.createElement('canvas');
    const gl =
      testCanvas.getContext('webgl2') ||
      testCanvas.getContext('webgl') ||
      testCanvas.getContext('experimental-webgl');
    return Boolean(gl);
  } catch {
    return false;
  }
}

export const ThreeWorldViewport: React.FC<ThreeWorldViewportProps> = ({
  frame,
  selectedEntityId,
  onSelectEntity,
  simplifiedMode = false,
  reducedMotion = false,
  highContrast = false,
  compact = false,
  onTelemetrySample,
  onWebglStatusChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<RenderFrameData>(frame);
  const selectedIdRef = useRef<string | null>(selectedEntityId);
  const lastTickRef = useRef<number>(frame.tick);
  const tickTransitionStartRef = useRef<number>(
    typeof performance !== 'undefined' ? performance.now() : 0,
  );
  const cameraStateRef = useRef<CameraSphericalState>({ ...DEFAULT_CAMERA });

  const [webglAvailable, setWebglAvailable] = useState<boolean>(() =>
    canCreateWebGLContext(),
  );
  const [contextLost, setContextLost] = useState<boolean>(false);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);

  // Layer visibility controls for 3x-scale 9-world inspection
  const [showZones, setShowZones] = useState<boolean>(true);
  const [showEntities, setShowEntities] = useState<boolean>(true);
  const [showConnections, setShowConnections] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(true);

  const layersRef = useRef({
    showZones: true,
    showEntities: true,
    showConnections: true,
  });

  useEffect(() => {
    layersRef.current = { showZones, showEntities, showConnections };
  }, [showZones, showEntities, showConnections]);

  useEffect(() => {
    if (frame.tick !== lastTickRef.current) {
      lastTickRef.current = frame.tick;
      tickTransitionStartRef.current =
        typeof performance !== 'undefined' ? performance.now() : 0;
    }
    frameRef.current = frame;
  }, [frame]);

  useEffect(() => {
    selectedIdRef.current = selectedEntityId;
  }, [selectedEntityId]);

  const resetCamera = () => {
    cameraStateRef.current = { ...DEFAULT_CAMERA };
  };

  const fitToWorld = () => {
    const f = frameRef.current, bounds = frameBounds(f);
    const aspect = (containerRef.current?.clientWidth || 640) / (containerRef.current?.clientHeight || 440);
    cameraStateRef.current = {
      theta: f.worldId === 'station' ? 0.45 : 0.6, phi: 0.86,
      radius: Math.max(24, bounds.span * 1.6 / Math.min(1, aspect)),
      targetX: bounds.center[0], targetY: bounds.center[1], targetZ: bounds.center[2],
    };
  };
  const focusSelected = () => {
    const target = [...frameRef.current.entities, ...frameRef.current.zones].find(x => x.id === selectedIdRef.current);
    if (!target) return;
    const size = 'size' in target ? target.size : target.scale;
    cameraStateRef.current = { ...cameraStateRef.current, radius: Math.max(16, Math.max(...size) * 3), targetX: target.position[0], targetY: target.position[1], targetZ: target.position[2] };
  };
  useEffect(() => { fitToWorld(); }, [frame.worldId, frame.runId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const supported = canCreateWebGLContext();
    setWebglAvailable(supported);
    onWebglStatusChange?.(supported, false);
    if (!supported) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !simplifiedMode,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglAvailable(false);
      onWebglStatusChange?.(false, false);
      return;
    }

    const width = Math.max(300, container.clientWidth || 640);
    const height = Math.max(240, container.clientHeight || 420);
    renderer.setSize(width, height);
    renderer.setPixelRatio(
      simplifiedMode ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    renderer.setClearColor(highContrast ? 0x000000 : 0x070a0f, 1);

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070a0f, 0.0055);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);

    const ambientLight = new THREE.AmbientLight(0xdbeafe, highContrast ? 1.1 : 0.78);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.15);
    dirLight.position.set(36, 58, 32);
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x00e5ff, 0.42);
    rimLight.position.set(-36, 24, -32);
    scene.add(rimLight);

    const gridHelper = new THREE.GridHelper(108, 24, 0x1e293b, 0x0f172a);
    gridHelper.position.y = -0.05;
    scene.add(gridHelper);

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const cylGeo = new THREE.CylinderGeometry(0.5, 0.65, 1, simplifiedMode ? 8 : 16);
    const coneGeo = new THREE.ConeGeometry(0.55, 1.2, simplifiedMode ? 6 : 12);
    const sphereGeo = new THREE.SphereGeometry(0.55, simplifiedMode ? 8 : 14, simplifiedMode ? 8 : 12);
    const ringGeo = new THREE.RingGeometry(1.1, 1.55, 24);
    ringGeo.rotateX(-Math.PI / 2);

    const zoneGroup = new THREE.Group();
    const connectionGroup = new THREE.Group();
    const entityGroup = new THREE.Group();
    scene.add(zoneGroup);
    scene.add(connectionGroup);
    scene.add(entityGroup);

    const selectionRingMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const selectionRing = new THREE.Mesh(ringGeo, selectionRingMat);
    selectionRing.visible = false;
    scene.add(selectionRing);

    const zoneMaterial = new THREE.MeshStandardMaterial({ roughness: .65, metalness: .12 });
    const zoneInstances = new THREE.InstancedMesh(boxGeo, zoneMaterial, 2048);
    zoneInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    zoneInstances.count = 0;
    zoneGroup.add(zoneInstances);
    const zoneTransform = new THREE.Object3D();
    const instanceColor = new THREE.Color();
    const linkDirection = new THREE.Vector3();
    const linkAxis = new THREE.Vector3(0, 0, 1);
    const hitIdentity = (hit: THREE.Intersection) => hit.object === zoneInstances && hit.instanceId !== undefined
      ? frameRef.current.zones[hit.instanceId] : { id: String(hit.object.userData.entityId ?? ''), label: String(hit.object.userData.label ?? '') };
    const entityMeshes = new Map<string, THREE.Mesh>();
    const connectionMeshes = new Map<string, THREE.Mesh>();
    const pickableObjects: THREE.Object3D[] = [];

    let previousWorldPalette = '';
    const syncSceneObjects = (currentFrame: RenderFrameData, alpha: number) => {
      // All observatory worlds inherit their own playable-world palette.
      // A single existing renderer remains authoritative across world changes.
      if (previousWorldPalette !== currentFrame.worldId) {
        previousWorldPalette = currentFrame.worldId;
        const profile = SCENE_PROFILES[currentFrame.worldId] ?? SCENE_PROFILES.ecosystem;
        if (!highContrast) {
          renderer.setClearColor(profile.skyZenith, 1);
          (scene.fog as THREE.FogExp2).color.set(profile.horizon);
          rimLight.color.set(profile.accent);
          dirLight.color.set(profile.celestialColor);
          ambientLight.color.set(profile.horizon).lerp(new THREE.Color(0xffffff), .60);
          selectionRingMat.color.set(profile.accent);
        }
      }
      pickableObjects.length = 0;
      zoneGroup.visible = layersRef.current.showZones;
      entityGroup.visible = layersRef.current.showEntities;
      connectionGroup.visible = layersRef.current.showConnections;

      const isTranslucentWorld =
        currentFrame.worldId === 'station' ||
        currentFrame.worldId === 'ocean' ||
        currentFrame.worldId === 'celestial';

      // One draw call for all habitat/climate/compartment boxes instead of one per zone.
      zoneInstances.count = Math.min(2048, currentFrame.zones.length);
      zoneInstances.userData.entityId = null;
      zoneMaterial.transparent = isTranslucentWorld;
      zoneMaterial.opacity = isTranslucentWorld ? .42 : 1;
      currentFrame.zones.slice(0,2048).forEach((z,index) => {
        const height = currentFrame.worldId === 'ecosystem' ? Math.max(.3,z.size[1]+z.value*1.1) : z.size[1];
        zoneTransform.scale.set(z.size[0],height,z.size[2]);
        zoneTransform.position.set(z.position[0],currentFrame.worldId === 'station'?z.size[1]*.5:z.position[1],z.position[2]);
        zoneTransform.updateMatrix();
        zoneInstances.setMatrixAt(index,zoneTransform.matrix);
        zoneInstances.setColorAt(index,instanceColor.set(z.color));
      });
      zoneInstances.instanceMatrix.needsUpdate = true;
      if(zoneInstances.instanceColor)zoneInstances.instanceColor.needsUpdate = true;
      zoneInstances.computeBoundingSphere();
      if(layersRef.current.showZones)pickableObjects.push(zoneInstances);
      const bounds=frameBounds(currentFrame);
      (scene.fog as THREE.FogExp2).density=1/(bounds.span*8);
      gridHelper.scale.setScalar(Math.max(1,bounds.span/108));
      gridHelper.position.set(bounds.center[0],bounds.min[1]-.1,bounds.center[2]);

      const activeConnIds = new Set<string>();
      for (const conn of currentFrame.connections) {
        activeConnIds.add(conn.id);
        let mesh = connectionMeshes.get(conn.id);
        if (!mesh) {
          const mat = new THREE.MeshStandardMaterial({
            color: 0x00e5ff,
            roughness: 0.4,
            metalness: 0.3,
          });
          mesh = new THREE.Mesh(boxGeo, mat);
          mesh.userData = { entityId: conn.id, label: conn.label };
          connectionGroup.add(mesh);
          connectionMeshes.set(conn.id, mesh);
        }
        mesh.userData.entityId = conn.id;
        mesh.userData.label = conn.label;

        const dx = conn.to[0] - conn.from[0];
        const dz = conn.to[2] - conn.from[2];
        const dy = conn.to[1] - conn.from[1];
        const dist = Math.max(0.5, Math.hypot(dx, dy, dz));
        const midX = (conn.from[0] + conn.to[0]) * 0.5;
        const midZ = (conn.from[2] + conn.to[2]) * 0.5;

        mesh.position.set(midX, (conn.from[1] + conn.to[1]) * .5, midZ);
        mesh.scale.set(
          conn.status === 'active' ? 1.05 : 0.65,
          conn.status === 'closed' ? 1.5 : 0.4,
          dist * 0.82,
        );
        mesh.quaternion.setFromUnitVectors(linkAxis, linkDirection.set(dx, dy, dz).normalize());

        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color.set(
          conn.status === 'closed'
            ? '#ff3d57'
            : conn.status === 'active'
              ? '#ffb300'
              : '#00e676',
        );
        if (layersRef.current.showConnections) {
          pickableObjects.push(mesh);
        }
      }

      for (const [id, mesh] of connectionMeshes.entries()) {
        if (!activeConnIds.has(id)) {
          connectionGroup.remove(mesh);
          (mesh.material as THREE.Material).dispose();
          connectionMeshes.delete(id);
        }
      }

      const activeEntIds = new Set<string>();
      for (const ent of currentFrame.entities) {
        activeEntIds.add(ent.id);
        let mesh = entityMeshes.get(ent.id);
        if (!mesh) {
          const geo =
            ent.kind === 'predator' || ent.kind === 'volcano_cone' || ent.kind === 'storm_vortex'
              ? coneGeo
              : ent.kind === 'herbivore' || ent.kind === 'star' || ent.kind === 'planet' || ent.kind === 'moon'
                ? sphereGeo
                : cylGeo;
          const mat = new THREE.MeshStandardMaterial({
            color: ent.color,
            roughness: 0.35,
            metalness: 0.25,
          });
          mesh = new THREE.Mesh(geo, mat);
          mesh.userData = { entityId: ent.id, label: ent.label };
          entityGroup.add(mesh);
          entityMeshes.set(ent.id, mesh);
        }

        mesh.userData.entityId = ent.id;
        mesh.userData.label = ent.label;

        const interpX =
          !reducedMotion && ent.prevPosition
            ? ent.prevPosition[0] + (ent.position[0] - ent.prevPosition[0]) * alpha
            : ent.position[0];
        const interpZ =
          !reducedMotion && ent.prevPosition
            ? ent.prevPosition[2] + (ent.position[2] - ent.prevPosition[2]) * alpha
            : ent.position[2];

        mesh.position.set(interpX, ent.position[1], interpZ);
        mesh.scale.set(ent.scale[0], ent.scale[1], ent.scale[2]);
        if (ent.rotationY !== undefined) {
          mesh.rotation.y = ent.rotationY;
        }

        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color.set(ent.color);
        if (layersRef.current.showEntities) {
          pickableObjects.push(mesh);
        }
      }

      for (const [id, mesh] of entityMeshes.entries()) {
        if (!activeEntIds.has(id)) {
          entityGroup.remove(mesh);
          (mesh.material as THREE.Material).dispose();
          entityMeshes.delete(id);
        }
      }

      const selId = selectedIdRef.current;
      const targetMesh =
        (selId && entityMeshes.get(selId)) ||

        (selId && connectionMeshes.get(selId));

      if (targetMesh) {
        selectionRing.visible = true;
        selectionRing.position.set(
          targetMesh.position.x,
          0.18,
          targetMesh.position.z,
        );
        const radiusScale = Math.max(
          1.4,
          Math.max(targetMesh.scale.x, targetMesh.scale.z) * 0.65,
        );
        selectionRing.scale.set(radiusScale, radiusScale, 1);
      } else {
        const zone=currentFrame.zones.find(z=>z.id===selId);
        selectionRing.visible=!!zone;
        if(zone){selectionRing.position.set(zone.position[0],zone.position[1]+.2,zone.position[2]);selectionRing.scale.setScalar(Math.max(zone.size[0],zone.size[2])*.6);}
      }
    };

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let isDragging = false;
    let isPanning = false;
    let downX = 0;
    let downY = 0;
    let lastX = 0;
    let lastY = 0;

    const domEl = renderer.domElement;

    const handlePointerDown = (e: PointerEvent) => {
      isDragging = true;
      isPanning = e.button === 2 || e.shiftKey;
      downX = e.clientX;
      downY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
    };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = domEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      }

      if (!isDragging) {
        raycaster.setFromCamera(pointerNdc, camera);
        const hits = raycaster.intersectObjects(pickableObjects, false);
        if (hits.length > 0 && hitIdentity(hits[0])?.label) {
          setHoveredLabel(hitIdentity(hits[0]).label);
        } else {
          setHoveredLabel(null);
        }
        return;
      }

      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      const cam = cameraStateRef.current;
      if (isPanning) {
        const b = frameBounds(frameRef.current);
        cam.targetX = Math.max(b.min[0]-b.span, Math.min(b.max[0]+b.span, cam.targetX - dx * cam.radius * .001));
        cam.targetZ = Math.max(b.min[2]-b.span, Math.min(b.max[2]+b.span, cam.targetZ - dy * cam.radius * .001));
      } else {
        cam.theta -= dx * 0.0075;
        cam.phi = Math.max(0.22, Math.min(1.42, cam.phi - dy * 0.0065));
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;
      const moveDist = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moveDist < 6) {
        const rect = domEl.getBoundingClientRect();
        pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNdc, camera);
        const hits = raycaster.intersectObjects(pickableObjects, false);
        if (hits.length > 0 && hitIdentity(hits[0])?.id) {
          onSelectEntity(hitIdentity(hits[0]).id);
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = cameraStateRef.current;
      cam.radius = Math.max(8, Math.min(frameBounds(frameRef.current).span * 8, cam.radius + e.deltaY * cam.radius * .001));
    };

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
      onWebglStatusChange?.(true, true);
    };

    const handleContextRestored = () => {
      setContextLost(false);
      onWebglStatusChange?.(true, false);
    };

    domEl.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    domEl.addEventListener('wheel', handleWheel, { passive: false });
    const preventContextMenu = (e: Event) => e.preventDefault();
    domEl.addEventListener('contextmenu', preventContextMenu);
    domEl.addEventListener('webglcontextlost', handleContextLost);
    domEl.addEventListener('webglcontextrestored', handleContextRestored);

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(280, container.clientWidth || 640);
      const h = Math.max(220, container.clientHeight || 400);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    let animFrameId = 0;
    let frameCount = 0;
    let lastFpsSampleWall = performance.now();

    let syncedFrame: RenderFrameData | null = null;
    let syncedLayers = '';
    let syncedSelection: string | null = null;
    let syncedAlpha = -1;
    const animate = (now: number) => {
      animFrameId = requestAnimationFrame(animate);
      frameCount += 1;

      const elapsedFpsWindow = now - lastFpsSampleWall;
      if (elapsedFpsWindow >= 750) {
        const fps = (frameCount * 1000) / elapsedFpsWindow;
        const frameTime = elapsedFpsWindow / Math.max(1, frameCount);
        onTelemetrySample?.(fps, frameTime);
        frameCount = 0;
        lastFpsSampleWall = now;
      }

      const alpha = Math.min(
        1,
        Math.max(0, (now - tickTransitionStartRef.current) / 180),
      );
      const layerKey = JSON.stringify(layersRef.current);
      if(syncedFrame !== frameRef.current || syncedLayers !== layerKey || syncedSelection !== selectedIdRef.current || (!reducedMotion && alpha !== syncedAlpha)) {
        syncSceneObjects(frameRef.current, alpha);
        syncedFrame=frameRef.current; syncedLayers=layerKey; syncedSelection=selectedIdRef.current; syncedAlpha=alpha;
      }

      const cam = cameraStateRef.current;
      const sinPhi = Math.sin(cam.phi);
      camera.position.set(
        cam.targetX + cam.radius * sinPhi * Math.sin(cam.theta),
        cam.targetY + cam.radius * Math.cos(cam.phi),
        cam.targetZ + cam.radius * sinPhi * Math.cos(cam.theta),
      );
      camera.lookAt(cam.targetX, cam.targetY, cam.targetZ);

      renderer.render(scene, camera);
      domEl.dataset.drawCalls=String(renderer.info.render.calls);
      domEl.dataset.visualInstances=String(frameRef.current.zones.length+frameRef.current.entities.length+frameRef.current.connections.length);
    };

    animFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameId);
      domEl.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      domEl.removeEventListener('wheel', handleWheel);
      domEl.removeEventListener('contextmenu', preventContextMenu);
      domEl.removeEventListener('webglcontextlost', handleContextLost);
      domEl.removeEventListener('webglcontextrestored', handleContextRestored);
      window.removeEventListener('resize', handleResize);

      zoneMaterial.dispose();
      zoneInstances.dispose();
      gridHelper.geometry.dispose();
      for(const material of Array.isArray(gridHelper.material)?gridHelper.material:[gridHelper.material])material.dispose();
      for (const mesh of entityMeshes.values()) {
        (mesh.material as THREE.Material).dispose();
      }
      for (const mesh of connectionMeshes.values()) {
        (mesh.material as THREE.Material).dispose();
      }
      selectionRingMat.dispose();
      boxGeo.dispose();
      cylGeo.dispose();
      coneGeo.dispose();
      sphereGeo.dispose();
      ringGeo.dispose();
      renderer.dispose();
    };
  }, [simplifiedMode, reducedMotion, highContrast]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: compact ? '280px' : '440px',
        backgroundColor: '#070a0f',
        border: '1px solid #1e293b',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {/* WebGL Canvas Host */}
      <div
        ref={containerRef}
        aria-label={`${frame.worldId} 3D Simulation Observatory Viewport`}
        style={{
          width: '100%',
          height: '100%',
          display: webglAvailable && !contextLost ? 'block' : 'none',
        }}
      />

      {/* Interactive 2D Schematic Fallback when WebGL is unavailable or in headless test environments */}
      {(!webglAvailable || contextLost) && (
        <div
          data-testid="schematic-fallback-viewport"
          style={{
            width: '100%',
            height: '100%',
            padding: '12px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            background:
              'radial-gradient(circle at 50% 50%, #0f172a 0%, #070a0f 100%)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '12px',
              color: '#94a3b8',
            }}
          >
            <span>
              INTERACTIVE TACTICAL SCHEMATIC ({frame.worldId.toUpperCase()} // TICK {frame.tick})
            </span>
            <span style={{ color: '#00e5ff' }}>
              {contextLost ? 'WebGL Context Recovery Mode' : '2D Precision Schematic Active (3x Scale)'}
            </span>
          </div>

          <svg aria-label="Interactive two-dimensional world map"
            viewBox={frameBounds(frame).viewBox}
            style={{
              width: '100%',
              height: '82%',
              border: '1px solid #1e293b',
              borderRadius: '6px',
              background: '#080c14',
            }}
          >
            {showZones &&
              frame.zones.map((z) => (
                <g
                  key={z.id}
                  role="button" tabIndex={0} aria-label={z.label}
                  onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelectEntity(z.id);}}}
                  onClick={() => onSelectEntity(z.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={z.position[0] - z.size[0] * 0.45}
                    y={z.position[2] - z.size[2] * 0.45}
                    width={z.size[0] * 0.9}
                    height={z.size[2] * 0.9}
                    fill={z.color}
                    fillOpacity={0.32}
                    stroke={selectedEntityId === z.id ? '#00e5ff' : z.color}
                    strokeWidth={selectedEntityId === z.id ? 0.85 : 0.35}
                    rx={0.8}
                  />
                  {showLabels && (
                    <text
                      x={z.position[0]}
                      y={z.position[2]}
                      fontSize="1.65"
                      fill="#e2e8f0"
                      textAnchor="middle"
                    >
                      {z.label.slice(0, 14)}
                    </text>
                  )}
                </g>
              ))}

            {showConnections &&
              frame.connections.map((c) => (
                <line
                  key={c.id}
                  x1={c.from[0]}
                  y1={c.from[2]}
                  x2={c.to[0]}
                  y2={c.to[2]}
                  stroke={
                    c.status === 'closed'
                      ? '#ff3d57'
                      : c.status === 'active'
                        ? '#ffb300'
                        : '#00e676'
                  }
                  strokeWidth={0.65}
                  strokeDasharray={c.status === 'closed' ? '1,1' : undefined}
                  role="button" tabIndex={0} aria-label={c.id}
                  onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelectEntity(c.id);}}}
                  onClick={() => onSelectEntity(c.id)}
                  style={{ cursor: 'pointer' }}
                />
              ))}

            {showEntities &&
              frame.entities.map((e) => (
                <circle
                  key={e.id}
                  cx={e.position[0]}
                  cy={e.position[2]}
                  r={e.kind === 'predator' || e.kind === 'star' ? 1.35 : 0.9}
                  fill={e.color}
                  stroke={selectedEntityId === e.id ? '#ffffff' : '#080c14'}
                  strokeWidth={selectedEntityId === e.id ? 0.45 : 0.2}
                  role="button" tabIndex={0} aria-label={e.label}
                  onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelectEntity(e.id);}}}
                  onClick={() => onSelectEntity(e.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <title>{e.label}</title>
                </circle>
              ))}
          </svg>
        </div>
      )}

      {/* Top-Left HUD Telemetry Ribbon */}
      <div
        style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          right: '10px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: '8px',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            backgroundColor: 'rgba(10, 14, 22, 0.88)',
            border: '1px solid #1e293b',
            borderRadius: '6px',
            padding: '5px 10px',
            fontSize: '11px',
            fontFamily: 'monospace',
          }}
        >
          <span
            style={{
              color:
                frame.ambientStatus === 'critical'
                  ? '#ff3d57'
                  : frame.ambientStatus === 'warning'
                    ? '#ffb300'
                    : '#00e676',
              fontWeight: 700,
            }}
          >
            {frame.ambientStatus === 'critical'
              ? '■ CRITICAL'
              : frame.ambientStatus === 'warning'
                ? '▲ WARNING'
                : '● NOMINAL'}
          </span>
          {Object.entries(frame.hudSummary).map(([k, v]) => (
            <span key={k} style={{ color: '#cbd5e1', marginLeft: '6px' }}>
              <strong style={{ color: '#64748b' }}>{k}:</strong> {v}
            </span>
          ))}
        </div>

        {/* Camera & Layer Visibility Controls Bar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px',
            pointerEvents: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => setShowZones((v) => !v)}
            aria-pressed={showZones}
            style={{
              backgroundColor: showZones ? 'rgba(0, 229, 255, 0.14)' : '#0f172a',
              color: showZones ? '#00e5ff' : '#64748b',
              border: '1px solid #334155',
              borderRadius: '4px',
              padding: '3px 7px',
              fontSize: '10px',
              cursor: 'pointer',
            }}
          >
            Zones ({frame.zones.length})
          </button>
          <button
            type="button"
            onClick={() => setShowEntities((v) => !v)}
            aria-pressed={showEntities}
            style={{
              backgroundColor: showEntities ? 'rgba(0, 230, 118, 0.14)' : '#0f172a',
              color: showEntities ? '#00e676' : '#64748b',
              border: '1px solid #334155',
              borderRadius: '4px',
              padding: '3px 7px',
              fontSize: '10px',
              cursor: 'pointer',
            }}
          >
            Entities ({frame.entities.length})
          </button>
          <button
            type="button"
            onClick={() => setShowConnections((v) => !v)}
            aria-pressed={showConnections}
            style={{
              backgroundColor: showConnections ? 'rgba(255, 179, 0, 0.14)' : '#0f172a',
              color: showConnections ? '#ffb300' : '#64748b',
              border: '1px solid #334155',
              borderRadius: '4px',
              padding: '3px 7px',
              fontSize: '10px',
              cursor: 'pointer',
            }}
          >
            Links ({frame.connections.length})
          </button>
          <button
            type="button"
            onClick={() => setShowLabels((v) => !v)}
            aria-pressed={showLabels}
            style={{
              backgroundColor: showLabels ? 'rgba(148, 163, 184, 0.18)' : '#0f172a',
              color: showLabels ? '#e2e8f0' : '#64748b',
              border: '1px solid #334155',
              borderRadius: '4px',
              padding: '3px 7px',
              fontSize: '10px',
              cursor: 'pointer',
            }}
          >
            Labels
          </button>
          <button
            type="button"
            onClick={resetCamera}
            aria-label="Reset 3D Camera"
            style={{
              backgroundColor: '#0f172a',
              color: '#e2e8f0',
              border: '1px solid #334155',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Reset Camera
          </button>
          <button type="button" onClick={focusSelected} style={{ padding: '4px 8px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155' }}>Focus selected site</button>
          <button
            type="button"
            onClick={fitToWorld}
            aria-label="Fit Camera to World"
            style={{
              backgroundColor: '#0f172a',
              color: '#00e5ff',
              border: '1px solid #0e7490',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Fit to World
          </button>
        </div>
      </div>

      {/* Hover Tooltip Overlay */}
      {hoveredLabel && (
        <div
          style={{
            position: 'absolute',
            bottom: '10px',
            left: '12px',
            backgroundColor: 'rgba(15, 23, 42, 0.94)',
            border: '1px solid #00e5ff',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            color: '#f8fafc',
            pointerEvents: 'none',
          }}
        >
          Target: <strong>{hoveredLabel}</strong> (Click to inspect)
        </div>
      )}
    </div>
  );
};
