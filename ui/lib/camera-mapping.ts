/**
 * Camera Mapping — spherical coordinates ↔ cinematography text options.
 *
 * Three.js uses a Y-up coordinate system. OrbitControls gives us:
 *   azimuthalAngle (theta) — rotation around Y axis, 0 = +Z (camera behind image looking at front)
 *   polarAngle (phi)       — angle from +Y axis downward
 *
 * We remap to intuitive camera azimuth/elevation:
 *   azimuth  — 0 = front (camera facing subject), π = rear
 *   elevation — 0 = eye level, positive = looking down, negative = looking up
 */

// ── Azimuth table ──────────────────────────────────────────────────────────
// OrbitControls theta: 0 = +Z. We place the image plane at Z=0 facing +Z,
// so camera at theta=0 is behind the plane. We offset by π so theta=π → front.
// The mapping: cameraAzimuth = π - theta  (wrapped to [-π, π])

interface AngleEntry {
  value: string;
  label: string;
  angle: number; // radians in our azimuth space
}

export const AZIMUTH_TABLE: AngleEntry[] = [
  { value: "front", label: "Front", angle: 0 },
  { value: "3/4 front-left", label: "¾ Front-Left", angle: Math.PI / 4 },
  { value: "profile left", label: "Profile Left", angle: Math.PI / 2 },
  { value: "3/4 rear-left", label: "¾ Rear-Left", angle: (3 * Math.PI) / 4 },
  { value: "rear", label: "Rear", angle: Math.PI },
  { value: "3/4 rear-right", label: "¾ Rear-Right", angle: -(3 * Math.PI) / 4 },
  { value: "profile right", label: "Profile Right", angle: -Math.PI / 2 },
  { value: "3/4 front-right", label: "¾ Front-Right", angle: -Math.PI / 4 },
];

// ── Elevation table ────────────────────────────────────────────────────────
// elevation = 0 → eye level, positive → camera looks down (bird's eye),
// negative → camera looks up (worm's eye)

export const ELEVATION_TABLE: AngleEntry[] = [
  { value: "worm's eye", label: "Worm's Eye", angle: -Math.PI / 3 },
  { value: "low angle", label: "Low Angle", angle: -Math.PI / 6 },
  { value: "eye level", label: "Eye Level", angle: 0 },
  { value: "slightly elevated", label: "Slightly Elevated", angle: Math.PI / 8 },
  { value: "high angle", label: "High Angle", angle: Math.PI / 4 },
  { value: "bird's eye", label: "Bird's Eye", angle: Math.PI / 3 },
];

// ── Distance table ─────────────────────────────────────────────────────────

interface DistanceEntry {
  value: string;
  label: string;
  radius: number;
}

export const DISTANCE_TABLE: DistanceEntry[] = [
  { value: "extreme close-up", label: "Extreme Close-Up", radius: 1.5 },
  { value: "close-up", label: "Close-Up", radius: 2.5 },
  { value: "medium close-up", label: "Medium Close-Up", radius: 4 },
  { value: "medium shot", label: "Medium Shot", radius: 6 },
  { value: "medium wide", label: "Medium Wide", radius: 8 },
  { value: "wide shot", label: "Wide Shot", radius: 11 },
  { value: "extreme wide", label: "Extreme Wide", radius: 14 },
];

// ── Snap helpers ───────────────────────────────────────────────────────────

/** Wrap angle to [-π, π] */
function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  if (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

/** Angular distance on a circle (shortest arc) */
function angularDist(a: number, b: number): number {
  return Math.abs(wrapAngle(a - b));
}

export function snapAzimuth(theta: number): string {
  let best = AZIMUTH_TABLE[0];
  let bestDist = Infinity;
  for (const entry of AZIMUTH_TABLE) {
    const d = angularDist(theta, entry.angle);
    if (d < bestDist) {
      bestDist = d;
      best = entry;
    }
  }
  return best.value;
}

export function snapElevation(phi: number): string {
  let best = ELEVATION_TABLE[0];
  let bestDist = Infinity;
  for (const entry of ELEVATION_TABLE) {
    const d = Math.abs(phi - entry.angle);
    if (d < bestDist) {
      bestDist = d;
      best = entry;
    }
  }
  return best.value;
}

export function snapDistance(radius: number): string {
  let best = DISTANCE_TABLE[0];
  let bestDist = Infinity;
  for (const entry of DISTANCE_TABLE) {
    const d = Math.abs(radius - entry.radius);
    if (d < bestDist) {
      bestDist = d;
      best = entry;
    }
  }
  return best.value;
}

// ── Direct snap from our azimuth/elevation/radius ──────────────────────────

export function directSnap(
  azimuthAngle: number,
  elevationAngle: number,
  radius: number,
): { azimuth: string; elevation: string; distance: string } {
  return {
    azimuth: snapAzimuth(azimuthAngle),
    elevation: snapElevation(elevationAngle),
    distance: snapDistance(radius),
  };
}

// ── Limits derived from tables ─────────────────────────────────────────────

export const MIN_ELEVATION = ELEVATION_TABLE[0].angle; // worm's eye
export const MAX_ELEVATION = ELEVATION_TABLE[ELEVATION_TABLE.length - 1].angle; // bird's eye
export const MIN_DISTANCE = DISTANCE_TABLE[0].radius;
export const MAX_DISTANCE = DISTANCE_TABLE[DISTANCE_TABLE.length - 1].radius;

/**
 * Convert our azimuth/elevation/radius to a Three.js Y-up position.
 * azimuth: 0 = front (camera on +Z side), π/2 = left, etc.
 * elevation: 0 = eye level, positive = above, negative = below.
 */
export function sphericalToPosition(
  azimuth: number,
  elevation: number,
  radius: number,
): [number, number, number] {
  const y = Math.sin(elevation) * radius;
  const horizR = Math.cos(elevation) * radius;
  const x = -Math.sin(azimuth) * horizR;
  const z = Math.cos(azimuth) * horizR;
  return [x, y, z];
}
