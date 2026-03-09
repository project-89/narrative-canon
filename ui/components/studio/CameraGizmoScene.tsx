"use client";

import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import { Canvas, useFrame, useThree, useLoader } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import {
  directSnap,
  sphericalToPosition,
  MIN_ELEVATION,
  MAX_ELEVATION,
  MIN_DISTANCE,
  MAX_DISTANCE,
} from "@/lib/camera-mapping";

// ── Constants ──────────────────────────────────────────────────────────────

const RING_COLOR = "#34d399"; // cyan-green for azimuth ring
const ARC_COLOR = "#f472b6"; // pink for elevation arc
const HANDLE_AZIMUTH_COLOR = "#facc15"; // yellow
const HANDLE_ELEVATION_COLOR = "#f472b6"; // pink
const HANDLE_DISTANCE_COLOR = "#34d399"; // cyan
const SIGHT_COLOR = "#fb923c"; // orange line of sight
const CAMERA_COLOR = "#334155"; // dark slate camera body

// Fixed viewer camera position (isometric-ish)
const VIEWER_POS: [number, number, number] = [12, 8, 12];

// ── Image Plane ────────────────────────────────────────────────────────────

function ImagePlane({ url }: { url: string }) {
  const texture = useLoader(THREE.TextureLoader, url);
  const aspect = useMemo(() => {
    if (!texture.image) return 1;
    return texture.image.width / texture.image.height;
  }, [texture]);
  const h = 2;
  const w = h * aspect;

  return (
    <mesh>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={texture} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ── Azimuth Ring (horizontal torus) ────────────────────────────────────────

function AzimuthRing({ radius }: { radius: number }) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius, 0.04, 12, 128]} />
      <meshBasicMaterial color={RING_COLOR} transparent opacity={0.7} />
    </mesh>
  );
}

// ── Elevation Arc (vertical partial arc at current azimuth) ────────────────

function ElevationArc({
  azimuth,
  radius,
}: {
  azimuth: number;
  radius: number;
}) {
  const points = useMemo(() => {
    const steps = 64;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const t = MIN_ELEVATION + (MAX_ELEVATION - MIN_ELEVATION) * (i / steps);
      pts.push([
        -Math.sin(azimuth) * Math.cos(t) * radius,
        Math.sin(t) * radius,
        Math.cos(azimuth) * Math.cos(t) * radius,
      ]);
    }
    return pts;
  }, [azimuth, radius]);

  return (
    <Line
      points={points}
      color={ARC_COLOR}
      lineWidth={3}
      transparent
      opacity={0.7}
    />
  );
}

// ── Line of Sight ──────────────────────────────────────────────────────────

function LineOfSight({ from }: { from: [number, number, number] }) {
  return (
    <Line
      points={[from, [0, 0, 0]]}
      color={SIGHT_COLOR}
      lineWidth={2}
      transparent
      opacity={0.8}
    />
  );
}

// ── Camera Model (small box + cone lens) ───────────────────────────────────

function CameraModel({ position }: { position: [number, number, number] }) {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.lookAt(0, 0, 0);
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Body */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.4, 0.3, 0.25]} />
        <meshStandardMaterial color={CAMERA_COLOR} />
      </mesh>
      {/* Lens */}
      <mesh position={[0, 0, -0.2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 0.15, 12]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      {/* Viewfinder bump */}
      <mesh position={[0, 0.22, 0.02]}>
        <boxGeometry args={[0.15, 0.1, 0.12]} />
        <meshStandardMaterial color={CAMERA_COLOR} />
      </mesh>
    </group>
  );
}

// ── Grid Floor ─────────────────────────────────────────────────────────────

function GridFloor() {
  return <gridHelper args={[30, 30, "#334155", "#1e293b"]} position={[0, -0.01, 0]} />;
}

// ── Draggable Sphere Handle ────────────────────────────────────────────────

interface HandleProps {
  position: [number, number, number];
  color: string;
  size?: number;
  onDrag: (e: { point: THREE.Vector3; ray: THREE.Ray }) => void;
}

function DragHandle({ position, color, size = 0.25, onDrag }: HandleProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const dragging = useRef(false);
  const { camera, raycaster, gl } = useThree();
  const plane = useRef(new THREE.Plane());

  const onPointerDown = useCallback(
    (e: any) => {
      e.stopPropagation();
      dragging.current = true;
      (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
      // Set drag plane perpendicular to viewer
      const camDir = new THREE.Vector3()
        .subVectors(camera.position, new THREE.Vector3(...position))
        .normalize();
      plane.current.setFromNormalAndCoplanarPoint(
        camDir,
        new THREE.Vector3(...position),
      );
    },
    [camera, position],
  );

  const onPointerMove = useCallback(
    (e: any) => {
      if (!dragging.current) return;
      e.stopPropagation();
      // Get NDC coords
      const rect = gl.domElement.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const hitPt = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane.current, hitPt)) {
        onDrag({ point: hitPt, ray: raycaster.ray });
      }
    },
    [camera, raycaster, gl, onDrag],
  );

  const onPointerUp = useCallback((e: any) => {
    dragging.current = false;
    (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
  }, []);

  return (
    <mesh
      ref={meshRef}
      position={position}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <sphereGeometry args={[size, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.3}
      />
    </mesh>
  );
}

// ── Scene Content ──────────────────────────────────────────────────────────

interface SceneContentProps {
  sourceImageUrl: string;
  onCameraChange: (azimuth: string, elevation: string, distance: string) => void;
}

function SceneContent({ sourceImageUrl, onCameraChange }: SceneContentProps) {
  const { camera } = useThree();
  const [azimuth, setAzimuth] = useState(0); // front
  const [elevation, setElevation] = useState(Math.PI / 8); // slightly elevated
  const [radius, setRadius] = useState(6); // medium shot

  const lastSnap = useRef({ azimuth: "", elevation: "", distance: "" });

  // Position fixed viewer camera
  useEffect(() => {
    camera.position.set(...VIEWER_POS);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  // Virtual camera position
  const camPos = useMemo(
    () => sphericalToPosition(azimuth, elevation, radius),
    [azimuth, elevation, radius],
  );

  // Fire snap callback when values change
  useEffect(() => {
    const snapped = directSnap(azimuth, elevation, radius);
    if (
      snapped.azimuth !== lastSnap.current.azimuth ||
      snapped.elevation !== lastSnap.current.elevation ||
      snapped.distance !== lastSnap.current.distance
    ) {
      lastSnap.current = snapped;
      onCameraChange(snapped.azimuth, snapped.elevation, snapped.distance);
    }
  }, [azimuth, elevation, radius, onCameraChange]);

  // Azimuth handle: on the ring at current azimuth, y=0
  const azHandlePos = useMemo<[number, number, number]>(() => {
    return [-Math.sin(azimuth) * radius, 0, Math.cos(azimuth) * radius];
  }, [azimuth, radius]);

  // Distance handle: along the ground-level line at current azimuth, at min end
  const distHandlePos = useMemo<[number, number, number]>(() => {
    const r = radius;
    return [
      -Math.sin(azimuth) * r * 0.35,
      -0.01,
      Math.cos(azimuth) * r * 0.35,
    ];
  }, [azimuth, radius]);

  // ── Drag handlers ──────────────────────────────────────────────────────

  const onDragAzimuth = useCallback(
    ({ point }: { point: THREE.Vector3 }) => {
      const angle = Math.atan2(-point.x, point.z);
      setAzimuth(angle);
    },
    [],
  );

  const onDragElevation = useCallback(
    ({ point }: { point: THREE.Vector3 }) => {
      const horizDist = Math.sqrt(point.x * point.x + point.z * point.z);
      let el = Math.atan2(point.y, horizDist);
      el = Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, el));
      setElevation(el);
    },
    [],
  );

  const onDragDistance = useCallback(
    ({ point }: { point: THREE.Vector3 }) => {
      const d = point.length();
      const clamped = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, d * 2.8));
      setRadius(clamped);
    },
    [],
  );

  return (
    <>
      <ambientLight intensity={0.7} />
      <pointLight position={[10, 10, 10]} intensity={0.5} />
      <pointLight position={[-5, 5, -5]} intensity={0.2} />

      <GridFloor />
      <ImagePlane url={sourceImageUrl} />
      <AzimuthRing radius={radius} />
      <ElevationArc azimuth={azimuth} radius={radius} />
      <LineOfSight from={camPos} />
      <CameraModel position={camPos} />

      {/* Azimuth handle (yellow) on the ring */}
      <DragHandle
        position={azHandlePos}
        color={HANDLE_AZIMUTH_COLOR}
        onDrag={onDragAzimuth}
      />

      {/* Elevation handle (pink) at the camera position */}
      <DragHandle
        position={camPos}
        color={HANDLE_ELEVATION_COLOR}
        size={0.2}
        onDrag={onDragElevation}
      />

      {/* Distance handle (cyan) along the ground line */}
      <DragHandle
        position={distHandlePos}
        color={HANDLE_DISTANCE_COLOR}
        onDrag={onDragDistance}
      />
    </>
  );
}

// ── Exported Canvas ────────────────────────────────────────────────────────

interface CameraGizmoSceneProps {
  sourceImageUrl: string;
  onCameraChange: (azimuth: string, elevation: string, distance: string) => void;
}

export default function CameraGizmoScene({
  sourceImageUrl,
  onCameraChange,
}: CameraGizmoSceneProps) {
  return (
    <Canvas
      camera={{ fov: 40, near: 0.1, far: 100, position: VIEWER_POS }}
      style={{ background: "transparent" }}
      gl={{ alpha: true }}
    >
      <SceneContent
        sourceImageUrl={sourceImageUrl}
        onCameraChange={onCameraChange}
      />
    </Canvas>
  );
}
