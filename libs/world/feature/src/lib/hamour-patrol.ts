import { CatmullRomCurve3, Vector3 } from 'three';
import type { Vec3 } from './world-space.js';

/**
 * Where the Hamour swims: a closed, arc-length-parameterised loop through the configured
 * patrol points, plus the rules that keep it near the visitor and out of their line of sight.
 *
 * The loop position `u` is a fraction of the loop in [0, 1). The Hamour cruises along it, but
 * its speed leans towards the part of the loop nearest the camera, so wherever the visitor is
 * on the dive it is never far away; when the camera jumps (a long scroll, reduced-motion jump
 * mode) it is moved, out in the fog, to just behind the camera's stretch of the loop.
 */
export interface PatrolLoop {
  readonly curve: CatmullRomCurve3;
  /** Loop length, world units. */
  readonly length: number;
  /** `PATROL_SAMPLES` evenly spaced points (xyz), for nearest-point queries. */
  readonly samples: Float32Array;
}

export const PATROL_SAMPLES = 96;

/** A loop through `points` (world units), or null when fewer than 3 distinct points are given. */
export function createPatrolLoop(points: readonly Vec3[]): PatrolLoop | null {
  const usable = points.filter((p) => p.every(Number.isFinite));
  if (usable.length < 3) return null;
  const curve = new CatmullRomCurve3(
    usable.map(([x, y, z]) => new Vector3(x, y, z)),
    true,
    'centripetal'
  );
  curve.arcLengthDivisions = 400;
  const length = curve.getLength();
  if (!(length > 0)) return null;
  const samples = new Float32Array(PATROL_SAMPLES * 3);
  const point = new Vector3();
  for (let i = 0; i < PATROL_SAMPLES; i++) {
    curve.getPointAt(i / PATROL_SAMPLES, point);
    samples.set([point.x, point.y, point.z], i * 3);
  }
  return { curve, length, samples };
}

/** Samples either side of the previous answer searched first, see `nearestLoopFraction`. */
const LOCAL_WINDOW = 12;
/** A far part of the loop wins over the local one only when this much closer (squared ratio). */
const SWITCH_RATIO = 0.5;

/**
 * The loop fraction of the sample nearest to (x, y, z). With `hint` (the previous answer) it
 * prefers the stretch of loop around the hint unless another stretch is clearly closer, so a
 * camera between two legs of the loop does not flip from one to the other every frame.
 */
export function nearestLoopFraction(loop: PatrolLoop, x: number, y: number, z: number, hint?: number): number {
  const { samples } = loop;
  const distanceSq = (i: number): number => {
    const dx = samples[i * 3] - x;
    const dy = samples[i * 3 + 1] - y;
    const dz = samples[i * 3 + 2] - z;
    return dx * dx + dy * dy + dz * dz;
  };
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < PATROL_SAMPLES; i++) {
    const d = distanceSq(i);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  if (hint === undefined || !Number.isFinite(hint)) return best / PATROL_SAMPLES;

  const centre = Math.round(wrapFraction(hint) * PATROL_SAMPLES);
  let local = centre % PATROL_SAMPLES;
  let localDistance = Number.POSITIVE_INFINITY;
  for (let k = -LOCAL_WINDOW; k <= LOCAL_WINDOW; k++) {
    const i = (((centre + k) % PATROL_SAMPLES) + PATROL_SAMPLES) % PATROL_SAMPLES;
    const d = distanceSq(i);
    if (d < localDistance) {
      localDistance = d;
      local = i;
    }
  }
  return (bestDistance < localDistance * SWITCH_RATIO ? best : local) / PATROL_SAMPLES;
}

/** Wraps a loop fraction into [0, 1). */
export const wrapFraction = (u: number): number => u - Math.floor(u);

/** Signed shortest way round the loop from `from` to `to`, in [-0.5, 0.5). */
export const loopGap = (from: number, to: number): number => wrapFraction(to - from + 0.5) - 0.5;

export interface PatrolTuning {
  /** Unhurried swimming speed, world units per second. */
  readonly cruiseSpeed: number;
  /** Speed range as multiples of the cruise speed. */
  readonly minSpeedFactor: number;
  readonly maxSpeedFactor: number;
  /** Where the Hamour likes to be relative to the camera's nearest loop point, world units (+ = ahead). */
  readonly lead: number;
  /** Extra speed factor per world unit of gap to that spot. */
  readonly followGain: number;
  /** A gap larger than this (world units) is closed by moving the Hamour, unseen. */
  readonly snapDistance: number;
  /** ...to this far behind the camera's stretch of loop. */
  readonly snapBehind: number;
}

export const DEFAULT_PATROL_TUNING: PatrolTuning = {
  cruiseSpeed: 1.6,
  minSpeedFactor: 0.3,
  maxSpeedFactor: 3.2,
  lead: 6,
  followGain: 0.08,
  snapDistance: 70,
  snapBehind: 45,
};

export interface PatrolStep {
  /** New loop fraction. */
  readonly u: number;
  /** Speed used, world units per second (0 when the Hamour was moved). */
  readonly speed: number;
}

/**
 * One patrol step from loop fraction `u`, given the camera's nearest loop fraction. `dt` may
 * be 0 (reduced motion freezes the swim; a jump is still followed). `canSnap` is the
 * caller's word that the Hamour is out of sight (far, or behind the camera); without it a
 * big gap is closed by swimming at top speed, never by a visible jump.
 */
export function advancePatrol(
  u: number,
  cameraU: number,
  loop: Pick<PatrolLoop, 'length'>,
  dt: number,
  tuning: PatrolTuning = DEFAULT_PATROL_TUNING,
  canSnap = true
): PatrolStep {
  const gap = loopGap(u, wrapFraction(cameraU + tuning.lead / loop.length)) * loop.length;
  if (canSnap && Math.abs(gap) > tuning.snapDistance) {
    return { u: wrapFraction(cameraU - tuning.snapBehind / loop.length), speed: 0 };
  }
  const factor = Math.min(
    tuning.maxSpeedFactor,
    Math.max(tuning.minSpeedFactor, 1 + gap * tuning.followGain)
  );
  const speed = tuning.cruiseSpeed * factor;
  const step = Math.max(0, dt) * speed;
  return { u: wrapFraction(u + step / loop.length), speed };
}

/** The cone in front of the camera the Hamour must stay out of: where landmarks are framed. */
export interface ViewClearance {
  /** It never comes closer to the camera than this, world units (it would fill the frame). */
  readonly minDistance: number;
  /** How far ahead of the camera the cone reaches, world units. */
  readonly distance: number;
  /** Cone radius at the camera, world units... */
  readonly radius: number;
  /** ...growing by this much per unit ahead. */
  readonly slope: number;
}

export const DEFAULT_VIEW_CLEARANCE: ViewClearance = { minDistance: 8, distance: 26, radius: 2.5, slope: 0.32 };

/**
 * Writes into `out` the displacement that moves the point (px, py, pz) out of the clearance
 * cone of a camera at `camera` looking along unit vector `forward`, and at least
 * `minDistance` from the camera (zero when it is already clear). Pushed sideways from the view
 * axis (upward when it sits right on it), then outward from the camera. Allocates nothing.
 */
export function viewClearanceOffset(
  px: number,
  py: number,
  pz: number,
  camera: { readonly x: number; readonly y: number; readonly z: number },
  forward: { readonly x: number; readonly y: number; readonly z: number },
  clearance: ViewClearance,
  out: { x: number; y: number; z: number }
): void {
  out.x = 0;
  out.y = 0;
  out.z = 0;
  const dx = px - camera.x;
  const dy = py - camera.y;
  const dz = pz - camera.z;
  const along = dx * forward.x + dy * forward.y + dz * forward.z;
  if (along > 0 && along <= clearance.distance) {
    let rx = dx - along * forward.x;
    let ry = dy - along * forward.y;
    let rz = dz - along * forward.z;
    let off = Math.sqrt(rx * rx + ry * ry + rz * rz);
    const allowed = clearance.radius + clearance.slope * along;
    if (off < allowed) {
      if (off < 1e-4) {
        // Dead centre: push towards world up, made perpendicular to the view.
        rx = -forward.y * forward.x;
        ry = 1 - forward.y * forward.y;
        rz = -forward.y * forward.z;
        off = Math.sqrt(rx * rx + ry * ry + rz * rz);
        if (off < 1e-4) {
          rx = 1;
          ry = 0;
          rz = 0;
          off = 1;
        }
        const push = allowed / off;
        out.x = rx * push;
        out.y = ry * push;
        out.z = rz * push;
      } else {
        const push = (allowed - off) / off;
        out.x = rx * push;
        out.y = ry * push;
        out.z = rz * push;
      }
    }
  }

  // Then keep its distance.
  const qx = dx + out.x;
  const qy = dy + out.y;
  const qz = dz + out.z;
  const distance = Math.sqrt(qx * qx + qy * qy + qz * qz);
  if (distance >= clearance.minDistance) return;
  if (distance < 1e-4) {
    // On the camera itself: straight up (never ahead, which is the cone).
    out.y += clearance.minDistance;
    return;
  }
  const grow = clearance.minDistance / distance - 1;
  out.x += qx * grow;
  out.y += qy * grow;
  out.z += qz * grow;
}
