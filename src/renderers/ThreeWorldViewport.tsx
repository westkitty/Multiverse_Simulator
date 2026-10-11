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
    const f = frameRef.current;
    let maxExtent = 36;
    for (const z of f.zones) {
      maxExtent = Math.max(
        maxExtent,
        Math.abs(z.position[0]) + z.size[0] * 0.6,
        Math.abs(z.position[2]) + z.size[2] * 0.6,
      );
    }
    for (const e of f.entities) {
      maxExtent = Math.max(maxExtent, Math.abs(e.position[0]), Math.abs(e.position[2]));
    }
    cameraStateRef.current = {
      theta: f.worldId === 'station' ? 0.45 : f.worldId === 'celestial' ? 0.35 : 0.6,
      phi: f.worldId === 'celestial' ? 0.72 : 0.86,
      radius: Math.max(46, Math.min(115, maxExtent * 1.65)),
      targetX: 0,
      targetY: 0,
      targetZ: 0,
    };
  };

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

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 340);

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

    const zoneMeshes = new Map<string, THREE.Mesh>();
    const entityMeshes = new Map<string, THREE.Mesh>();
    const connectionMeshes = new Map<string, THREE.Mesh>();
    const pickableObjects: THREE.Object3D[] = [];

    const syncSceneObjects = (currentFrame: RenderFrameData, alpha: number) => {
      pickableObjects.length = 0;
      zoneGroup.visible = layersRef.current.showZones;
      entityGroup.visible = layersRef.current.showEntities;
      connectionGroup.visible = layersRef.current.showConnections;

      const isTranslucentWorld =
        currentFrame.worldId === 'station' ||
        currentFrame.worldId === 'ocean' ||
        currentFrame.worldId === 'celestial';

      const activeZoneIds = new Set<string>();
      for (const z of currentFrame.zones) {
        activeZoneIds.add(z.id);
        let mesh = zoneMeshes.get(z.id);
        if (!mesh) {
          const mat = new THREE.MeshStandardMaterial({
            color: z.color,
            roughness: 0.65,
            metalness: isTranslucentWorld ? 0.35 : 0.12,
            transparent: isTranslucentWorld,
            opacity: isTranslucentWorld ? 0.42 : 0.92,
          });
          mesh = new THREE.Mesh(boxGeo, mat);
          mesh.userData = { entityId: z.id, label: z.label };
          zoneGroup.add(mesh);
          zoneMeshes.set(z.id, mesh);
        }

        mesh.userData.entityId = z.id;
        mesh.userData.label = z.label;
        const heightScale =
          currentFrame.worldId === 'ecosystem'
            ? Math.max(0.3, z.size[1] + z.value * 1.1)
            : z.size[1];
        mesh.scale.set(z.size[0], heightScale, z.size[2]);
        mesh.position.set(
          z.position[0],
          currentFrame.worldId === 'station' ? z.size[1] * 0.5 : z.position[1],
          z.position[2],
        );

        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color.set(z.color);
        if (isTranslucentWorld) {
          mat.transparent = true;
          mat.opacity = selectedIdRef.current === z.id ? 0.68 : 0.36;
        } else {
          mat.transparent = false;
          mat.opacity = 1;
        }
        if (layersRef.current.showZones) {
          pickableObjects.push(mesh);
        }
      }

      for (const [id, mesh] of zoneMeshes.entries()) {
        if (!activeZoneIds.has(id)) {
          zoneGroup.remove(mesh);
          (mesh.material as THREE.Material).dispose();
          zoneMeshes.delete(id);
        }
      }

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
        const dist = Math.max(0.5, Math.hypot(dx, dz));
        const midX = (conn.from[0] + conn.to[0]) * 0.5;
        const midZ = (conn.from[2] + conn.to[2]) * 0.5;

        mesh.position.set(midX, 0.55, midZ);
        mesh.scale.set(
          conn.status === 'active' ? 1.05 : 0.65,
          conn.status === 'closed' ? 1.5 : 0.4,
          dist * 0.82,
        );
        mesh.rotation.y = Math.atan2(dx, dz);

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
        (selId && zoneMeshes.get(selId)) ||
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
        selectionRing.visible = false;
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
        if (hits.length > 0 && hits[0].object.userData?.label) {
          setHoveredLabel(String(hits[0].object.userData.label));
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
        cam.targetX = Math.max(-48, Math.min(48, cam.targetX - dx * 0.08));
        cam.targetZ = Math.max(-48, Math.min(48, cam.targetZ - dy * 0.08));
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
        if (hits.length > 0 && hits[0].object.userData?.entityId) {
          onSelectEntity(String(hits[0].object.userData.entityId));
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = cameraStateRef.current;
      cam.radius = Math.max(18, Math.min(140, cam.radius + e.deltaY * 0.05));
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
    domEl.addEventListener('contextmenu', (e) => e.preventDefault());
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
      syncSceneObjects(frameRef.current, alpha);

      const cam = cameraStateRef.current;
      const sinPhi = Math.sin(cam.phi);
      camera.position.set(
        cam.targetX + cam.radius * sinPhi * Math.sin(cam.theta),
        cam.targetY + cam.radius * Math.cos(cam.phi),
        cam.targetZ + cam.radius * sinPhi * Math.cos(cam.theta),
      );
      camera.lookAt(cam.targetX, cam.targetY, cam.targetZ);

      renderer.render(scene, camera);
    };

    animFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameId);
      domEl.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      domEl.removeEventListener('wheel', handleWheel);
      domEl.removeEventListener('webglcontextlost', handleContextLost);
      domEl.removeEventListener('webglcontextrestored', handleContextRestored);
      window.removeEventListener('resize', handleResize);

      for (const mesh of zoneMeshes.values()) {
        (mesh.material as THREE.Material).dispose();
      }
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

          <svg
            viewBox="-52 -38 104 76"
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
