import type { ImmersiveLandmark } from './immersiveLayout';
import { yawToward } from './immersiveLayout';

/**
 * Pure visual wayfinding. The camera and its route-free distances are never
 * authoritative expedition travel, and unknown contacts must not become
 * selectable locations or expose their names, history or hazards.
 */
export type FieldBeaconState =
  'unidentified' | 'signal' | 'unsafe' | 'critical' | 'service' | 'stable' | 'resolved';

export function fieldBeaconState(point: Pick<ImmersiveLandmark, 'discovery' | 'condition' | 'hazard'>): FieldBeaconState {
  if (point.discovery === 'UNKNOWN') return 'unidentified';
  // The field has not surveyed an instrument's condition at DETECTED.
  if (point.discovery === 'DETECTED' || point.condition === null) return 'signal';
  // Real present-time safety outranks a historically resolved dossier.
  if (point.hazard !== null && point.hazard > 70) return 'unsafe';
  if (point.discovery === 'RESOLVED') return 'resolved';
  if (point.condition < 25) return 'critical';
  if (point.condition < 75) return 'service';
  return 'stable';
}

/** Prefer real damaged visited sites, then ongoing investigations. No hidden
 * destination may enter the target carousel. This is NOT a route planner.
 */
export function fieldWaypoints(
  points: readonly ImmersiveLandmark[], origin: { x: number; z: number },
): ImmersiveLandmark[] {
  const priority = (point: ImmersiveLandmark): number => {
    if (point.discovery === 'RESOLVED') return 3;
    if (point.hazard !== null && point.hazard > 70) return 2;
    if (['VISITED', 'INVESTIGATED'].includes(point.discovery) &&
      point.condition !== null && point.condition < 75) return 0;
    return 1;
  };
  return points.filter(point => point.discovery !== 'UNKNOWN')
    .sort((a, b) =>
      priority(a) - priority(b) ||
      Math.hypot(a.x - origin.x, a.z - origin.z) - Math.hypot(b.x - origin.x, b.z - origin.z) ||
      a.id.localeCompare(b.id, 'en'));
}

export interface FieldBearing {
  distance: number;
  direction: 'here' | 'ahead' | 'left' | 'right' | 'behind';
  arrow: string;
}

/** Heading computed against the same YXZ camera yaw used by movementBasis.
 * Angles are wrapped through +/-PI, avoiding backwards cues at wraparound.
 */
export function fieldBearing(
  fromX: number, fromZ: number, cameraYaw: number, toX: number, toZ: number,
): FieldBearing {
  const distance = Math.hypot(toX - fromX, toZ - fromZ);
  if (distance <= 12) return { distance, direction: 'here', arrow: '◆' };
  const targetYaw = yawToward(fromX, fromZ, toX, toZ);
  const delta = Math.atan2(Math.sin(targetYaw - cameraYaw), Math.cos(targetYaw - cameraYaw));
  if (Math.abs(delta) <= Math.PI / 4) return { distance, direction: 'ahead', arrow: '↑' };
  if (Math.abs(delta) >= 3 * Math.PI / 4) return { distance, direction: 'behind', arrow: '↓' };
  return delta > 0 ? { distance, direction: 'left', arrow: '←' }
    : { distance, direction: 'right', arrow: '→' };
}
