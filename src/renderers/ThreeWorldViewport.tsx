import { frameBounds } from './frameBounds';
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { RenderConnectionVisual, RenderEntityVisual, RenderFrameData } from '../core/contracts';

const RENDER_INSTANCE_CHUNK = 1024;
type EntityShape = 'cone' | 'sphere' | 'cylinder';

function shapeForEntity(kind: string): EntityShape {
  if (kind === 'predator' || kind === 'volcano_cone' || kind === 'storm_vortex') return 'cone';
  if (kind === 'herbivore' || kind === 'star' || kind === 'planet' || kind === 'moon') return 'sphere';
  return 'cylinder';
}

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
    const hazardTransform = new THREE.Object3D();
    const connectionTransform = new THREE.Object3D();
    const entityTransform = new THREE.Object3D();
    const instanceColor = new THREE.Color();
    const linkDirection = new THREE.Vector3();
    const linkAxis = new THREE.Vector3(0, 0, 1);
    const boundPoint = new THREE.Vector3();
    const hazardGeometry = new THREE.RingGeometry(0.94, 1, 28);
    hazardGeometry.rotateX(-Math.PI / 2);
    const hazardMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      toneMapped: false,
    });
    const hazardInstances = new THREE.InstancedMesh(hazardGeometry, hazardMaterial, 2048);
    hazardInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    hazardInstances.count = 0;
    zoneGroup.add(hazardInstances);

    const entityMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.25,
    });
    const connectionMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
      metalness: 0.3,
    });
    const entityGeometry: Record<EntityShape, THREE.BufferGeometry> = {
      cone: coneGeo,
      sphere: sphereGeo,
      cylinder: cylGeo,
    };
    const entityBatches = new Map<EntityShape, THREE.InstancedMesh[]>([
      ['cone', []], ['sphere', []], ['cylinder', []],
    ]);
    const entityItemsByShape = new Map<EntityShape, RenderEntityVisual[]>([
      ['cone', []], ['sphere', []], ['cylinder', []],
    ]);
    const entityBatchItems = new Map<THREE.InstancedMesh, RenderEntityVisual[]>();
    const entityBatchBounds = new Map<THREE.InstancedMesh, { box: THREE.Box3; sphere: THREE.Sphere }>();
    const connectionBatches: THREE.InstancedMesh[] = [];
    const connectionBatchItems = new Map<THREE.InstancedMesh, RenderConnectionVisual[]>();
    const entityById = new Map<string, RenderEntityVisual>();
    const connectionById = new Map<string, RenderConnectionVisual>();
    const zoneById = new Map<string, RenderFrameData['zones'][number]>();
    const pickableObjects: THREE.Object3D[] = [];
    const addEntityBatch = (shape: EntityShape) => {
      const mesh = new THREE.InstancedMesh(entityGeometry[shape], entityMaterial, RENDER_INSTANCE_CHUNK);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.userData.renderLayer = 'entity';
      entityGroup.add(mesh);
      entityBatches.get(shape)!.push(mesh);
      entityBatchItems.set(mesh, []);
      entityBatchBounds.set(mesh, { box: new THREE.Box3(), sphere: new THREE.Sphere() });
    };

    const addConnectionBatch = () => {
      const mesh = new THREE.InstancedMesh(boxGeo, connectionMaterial, RENDER_INSTANCE_CHUNK);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.userData.renderLayer = 'connection';
      connectionGroup.add(mesh);
      connectionBatches.push(mesh);
      connectionBatchItems.set(mesh, []);
    };

    const hitIdentity = (hit: THREE.Intersection) => {
      if (hit.object === zoneInstances && hit.instanceId !== undefined) {
        return frameRef.current.zones[hit.instanceId];
      }
      if (hit.instanceId !== undefined) {
        const mesh = hit.object as THREE.InstancedMesh;
        const identity = entityBatchItems.get(mesh)?.[hit.instanceId] ??
          connectionBatchItems.get(mesh)?.[hit.instanceId];
        if (identity) return identity;
      }
      return { id: String(hit.object.userData.entityId ?? ''), label: String(hit.object.userData.label ?? '') };
    };

    const syncStaticWorld = (currentFrame: RenderFrameData) => {
      zoneById.clear();
      const zoneCount = Math.min(2048, currentFrame.zones.length);
      zoneInstances.count = zoneCount;
      zoneMaterial.transparent = currentFrame.worldId === 'station' || currentFrame.worldId === 'ocean' || currentFrame.worldId === 'celestial';
      zoneMaterial.opacity = zoneMaterial.transparent ? 0.42 : 1;
      let hazardCount = 0;
      for (let index = 0; index < currentFrame.zones.length; index += 1) {
        const zone = currentFrame.zones[index];
        zoneById.set(zone.id, zone);
        if (index >= zoneCount) continue;
        const height = currentFrame.worldId === 'ecosystem'
          ? Math.max(0.3, zone.size[1] + zone.value * 1.1)
          : zone.size[1];
        zoneTransform.scale.set(zone.size[0], height, zone.size[2]);
        zoneTransform.position.set(
          zone.position[0],
          currentFrame.worldId === 'station' ? zone.size[1] * 0.5 : zone.position[1],
          zone.position[2],
        );
        zoneTransform.updateMatrix();
        zoneInstances.setMatrixAt(index, zoneTransform.matrix);
        zoneInstances.setColorAt(index, instanceColor.set(zone.color));

        // Alert rings encode the simulation's own status field; they are not decorative VFX.
        if (zone.status !== 'nominal' && hazardCount < 2048) {
          hazardTransform.scale.set(Math.max(0.5, zone.size[0] * 0.58), Math.max(0.5, zone.size[2] * 0.58), 1);
          const surfaceY = currentFrame.worldId === 'station'
            ? zone.size[1]
            : zone.position[1] + height * 0.5;
          hazardTransform.position.set(zone.position[0], surfaceY + 0.045, zone.position[2]);
          hazardTransform.updateMatrix();
          hazardInstances.setMatrixAt(hazardCount, hazardTransform.matrix);
          hazardInstances.setColorAt(hazardCount, instanceColor.set(zone.status === 'critical' ? '#ff756d' : '#e5bd72'));
          hazardCount += 1;
        }
      }
      hazardInstances.count = hazardCount;
      zoneInstances.instanceMatrix.needsUpdate = true;
      if (zoneInstances.instanceColor) zoneInstances.instanceColor.needsUpdate = true;
      hazardInstances.instanceMatrix.needsUpdate = true;
      if (hazardInstances.instanceColor) hazardInstances.instanceColor.needsUpdate = true;
      zoneInstances.computeBoundingSphere();
      hazardInstances.computeBoundingSphere();

      connectionById.clear();
      const neededConnectionBatches = Math.ceil(currentFrame.connections.length / RENDER_INSTANCE_CHUNK);
      while (connectionBatches.length < neededConnectionBatches) addConnectionBatch();
      for (const mesh of connectionBatches) connectionBatchItems.get(mesh)!.length = 0;
      for (let index = 0; index < currentFrame.connections.length; index += 1) {
        const connection = currentFrame.connections[index];
        connectionById.set(connection.id, connection);
        const batchIndex = Math.floor(index / RENDER_INSTANCE_CHUNK);
        const localIndex = index % RENDER_INSTANCE_CHUNK;
        const mesh = connectionBatches[batchIndex];
        connectionBatchItems.get(mesh)!.push(connection);
        const dx = connection.to[0] - connection.from[0];
        const dy = connection.to[1] - connection.from[1];
        const dz = connection.to[2] - connection.from[2];
        const distance = Math.max(0.5, Math.hypot(dx, dy, dz));
        connectionTransform.position.set(
          (connection.from[0] + connection.to[0]) * 0.5,
          (connection.from[1] + connection.to[1]) * 0.5,
          (connection.from[2] + connection.to[2]) * 0.5,
        );
        connectionTransform.scale.set(
          connection.status === 'active' ? 1.05 : 0.65,
          connection.status === 'closed' ? 1.5 : 0.4,
          distance * 0.82,
        );
        connectionTransform.quaternion.setFromUnitVectors(linkAxis, linkDirection.set(dx, dy, dz).normalize());
        connectionTransform.updateMatrix();
        mesh.setMatrixAt(localIndex, connectionTransform.matrix);
        mesh.setColorAt(localIndex, instanceColor.set(
          connection.status === 'closed' ? '#ff3d57' :
            connection.status === 'active' ? '#ffb300' : '#00e676',
        ));
      }
      for (const mesh of connectionBatches) {
        const items = connectionBatchItems.get(mesh)!;
        mesh.count = items.length;
        if (items.length > 0) {
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          mesh.computeBoundingSphere();
        }
      }

      const bounds = frameBounds(currentFrame);
      (scene.fog as THREE.FogExp2).density = 1 / (bounds.span * 8);
      (scene.fog as THREE.FogExp2).color.set(
        currentFrame.ambientStatus === 'critical' ? '#1a1014' :
          currentFrame.ambientStatus === 'warning' ? '#15140f' : '#070a0f',
      );
      gridHelper.scale.setScalar(Math.max(1, bounds.span / 108));
      gridHelper.position.set(bounds.center[0], bounds.min[1] - 0.1, bounds.center[2]);
    };

    const prepareEntityFrame = (currentFrame: RenderFrameData) => {
      entityById.clear();
      for (const items of entityItemsByShape.values()) items.length = 0;
      for (const entity of currentFrame.entities) {
        entityById.set(entity.id, entity);
        entityItemsByShape.get(shapeForEntity(entity.kind))!.push(entity);
      }

      for (const shape of ['cone', 'sphere', 'cylinder'] as const) {
        const items = entityItemsByShape.get(shape)!;
        const batches = entityBatches.get(shape)!;
        const needed = Math.ceil(items.length / RENDER_INSTANCE_CHUNK);
        while (batches.length < needed) addEntityBatch(shape);
        for (const mesh of batches) entityBatchItems.get(mesh)!.length = 0;
        for (let index = 0; index < items.length; index += 1) {
          const batchIndex = Math.floor(index / RENDER_INSTANCE_CHUNK);
          const localIndex = index % RENDER_INSTANCE_CHUNK;
          const mesh = batches[batchIndex];
          const entity = items[index];
          entityBatchItems.get(mesh)!.push(entity);
          mesh.setColorAt(localIndex, instanceColor.set(entity.color));
        }
        for (const mesh of batches) {
          const batchItems = entityBatchItems.get(mesh)!;
          mesh.count = batchItems.length;
          if (batchItems.length === 0) continue;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          const bounds = entityBatchBounds.get(mesh)!;
          bounds.box.makeEmpty();
          for (const entity of batchItems) {
            const previous = entity.prevPosition ?? entity.position;
            const extent = Math.max(Math.abs(entity.scale[0]), Math.abs(entity.scale[1]), Math.abs(entity.scale[2])) * 0.72;
            bounds.box.expandByPoint(boundPoint.set(
              Math.min(previous[0], entity.position[0]) - extent,
              Math.min(previous[1], entity.position[1]) - extent,
              Math.min(previous[2], entity.position[2]) - extent,
            ));
            bounds.box.expandByPoint(boundPoint.set(
              Math.max(previous[0], entity.position[0]) + extent,
              Math.max(previous[1], entity.position[1]) + extent,
              Math.max(previous[2], entity.position[2]) + extent,
            ));
          }
          mesh.boundingSphere = bounds.box.getBoundingSphere(bounds.sphere);
        }
      }
    };

    const syncEntityTransforms = (alpha: number) => {
      for (const shape of ['cone', 'sphere', 'cylinder'] as const) {
        for (const mesh of entityBatches.get(shape)!) {
          const items = entityBatchItems.get(mesh)!;
          for (let index = 0; index < items.length; index += 1) {
            const entity = items[index];
            const interpolate = !reducedMotion && entity.prevPosition;
            const x = interpolate
              ? entity.prevPosition![0] + (entity.position[0] - entity.prevPosition![0]) * alpha
              : entity.position[0];
            const z = interpolate
              ? entity.prevPosition![2] + (entity.position[2] - entity.prevPosition![2]) * alpha
              : entity.position[2];
            entityTransform.position.set(x, entity.position[1], z);
            entityTransform.scale.set(entity.scale[0], entity.scale[1], entity.scale[2]);
            entityTransform.rotation.set(0, entity.rotationY ?? 0, 0);
            entityTransform.updateMatrix();
            mesh.setMatrixAt(index, entityTransform.matrix);
          }
          if (items.length > 0) mesh.instanceMatrix.needsUpdate = true;
        }
      }
    };

    const syncSelectionRing = (currentFrame: RenderFrameData, alpha: number) => {
      const id = selectedIdRef.current;
      const entity = id ? entityById.get(id) : undefined;
      const connection = id ? connectionById.get(id) : undefined;
      const zone = id ? zoneById.get(id) : undefined;
      if (entity) {
        const interpolate = !reducedMotion && entity.prevPosition;
        const x = interpolate
          ? entity.prevPosition![0] + (entity.position[0] - entity.prevPosition![0]) * alpha
          : entity.position[0];
        const z = interpolate
          ? entity.prevPosition![2] + (entity.position[2] - entity.prevPosition![2]) * alpha
          : entity.position[2];
        const radius = Math.max(1.4, Math.max(entity.scale[0], entity.scale[2]) * 0.7);
        selectionRing.visible = true;
        selectionRing.position.set(x, entity.position[1] - Math.abs(entity.scale[1]) * 0.5 + 0.12, z);
        selectionRing.scale.set(radius, radius, 1);
      } else if (connection) {
        const dx = connection.to[0] - connection.from[0];
        const dz = connection.to[2] - connection.from[2];
        const radius = Math.max(1.4, Math.hypot(dx, dz) * 0.035);
        selectionRing.visible = true;
        selectionRing.position.set(
          (connection.from[0] + connection.to[0]) * 0.5,
          (connection.from[1] + connection.to[1]) * 0.5 + 0.12,
          (connection.from[2] + connection.to[2]) * 0.5,
        );
        selectionRing.scale.set(radius, radius, 1);
      } else if (zone) {
        const height = currentFrame.worldId === 'ecosystem'
          ? Math.max(0.3, zone.size[1] + zone.value * 1.1)
          : zone.size[1];
        const y = currentFrame.worldId === 'station'
          ? zone.size[1]
          : zone.position[1] + height * 0.5;
        selectionRing.visible = true;
        selectionRing.position.set(zone.position[0], y + 0.12, zone.position[2]);
        selectionRing.scale.set(Math.max(zone.size[0], zone.size[2]) * 0.56, Math.max(zone.size[0], zone.size[2]) * 0.56, 1);
      } else {
        selectionRing.visible = false;
      }
    };

    const syncPickableObjects = () => {
      pickableObjects.length = 0;
      if (layersRef.current.showZones && zoneInstances.count > 0) pickableObjects.push(zoneInstances);
      if (layersRef.current.showConnections) {
        for (const mesh of connectionBatches) if (mesh.count > 0) pickableObjects.push(mesh);
      }
      if (layersRef.current.showEntities) {
        for (const batches of entityBatches.values()) {
          for (const mesh of batches) if (mesh.count > 0) pickableObjects.push(mesh);
        }
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
    let syncedSelection: string | null = null;
    let syncedAlpha = -1;
    let previousShowZones = layersRef.current.showZones;
    let previousShowEntities = layersRef.current.showEntities;
    let previousShowConnections = layersRef.current.showConnections;
    let topologySyncs = 0;
    let entitySyncs = 0;
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

      const currentFrame = frameRef.current;
      const alpha = Math.min(
        1,
        Math.max(0, (now - tickTransitionStartRef.current) / 180),
      );
      const frameChanged = syncedFrame !== currentFrame;
      const layers = layersRef.current;
      const layerChanged = previousShowZones !== layers.showZones ||
        previousShowEntities !== layers.showEntities ||
        previousShowConnections !== layers.showConnections;
      const selectionChanged = syncedSelection !== selectedIdRef.current;

      if (frameChanged) {
        syncStaticWorld(currentFrame);
        prepareEntityFrame(currentFrame);
        syncedFrame = currentFrame;
        topologySyncs += 1;
      }

      zoneGroup.visible = layers.showZones;
      entityGroup.visible = layers.showEntities;
      connectionGroup.visible = layers.showConnections;

      const entityTransformsChanged = frameChanged || (!reducedMotion && alpha !== syncedAlpha);
      if (entityTransformsChanged) {
        syncEntityTransforms(alpha);
        syncSelectionRing(currentFrame, alpha);
        syncedAlpha = alpha;
        entitySyncs += 1;
      } else if (selectionChanged) {
        syncSelectionRing(currentFrame, alpha);
      }
      if (frameChanged || layerChanged) syncPickableObjects();

      syncedSelection = selectedIdRef.current;
      previousShowZones = layers.showZones;
      previousShowEntities = layers.showEntities;
      previousShowConnections = layers.showConnections;

      const cam = cameraStateRef.current;
      const sinPhi = Math.sin(cam.phi);
      camera.position.set(
        cam.targetX + cam.radius * sinPhi * Math.sin(cam.theta),
        cam.targetY + cam.radius * Math.cos(cam.phi),
        cam.targetZ + cam.radius * sinPhi * Math.cos(cam.theta),
      );
      camera.lookAt(cam.targetX, cam.targetY, cam.targetZ);

      renderer.render(scene, camera);
      domEl.dataset.drawCalls = String(renderer.info.render.calls);
      domEl.dataset.visualInstances = String(currentFrame.zones.length + currentFrame.entities.length + currentFrame.connections.length);
      domEl.dataset.topologySyncs = String(topologySyncs);
      domEl.dataset.entitySyncs = String(entitySyncs);
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
      hazardInstances.dispose();
      hazardMaterial.dispose();
      entityMaterial.dispose();
      connectionMaterial.dispose();
      for (const batches of entityBatches.values()) {
        for (const mesh of batches) mesh.dispose();
      }
      for (const mesh of connectionBatches) mesh.dispose();
      gridHelper.geometry.dispose();
      for (const material of Array.isArray(gridHelper.material) ? gridHelper.material : [gridHelper.material]) material.dispose();
      selectionRingMat.dispose();
      boxGeo.dispose();
      cylGeo.dispose();
      coneGeo.dispose();
      sphereGeo.dispose();
      ringGeo.dispose();
      hazardGeometry.dispose();
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
