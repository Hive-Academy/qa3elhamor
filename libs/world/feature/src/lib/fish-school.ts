import { seededRandom } from './seeded-random.js';
import type { Vec3 } from './world-space.js';

/**
 * Boids-lite for one fish school: cohesion, alignment and separation against a small rotating
 * sample of school-mates (never all of them), a per-fish wander, and a soft pull towards a
 * goal that drifts slowly around the school's home. Cost is `count x neighbourSamples` per
 * step, and a step allocates nothing: all state lives in typed arrays made once.
 *
 * Units are world units and seconds. Every fish keeps a speed between 0.55x and 1.45x the
 * school's cruise speed and swims mostly level, which is what reads as "fish" rather than as
 * insects.
 */
export interface FishSchoolSpec {
  /** Home of the school, world units. The school roams within about `radius` of it. */
  readonly center: Vec3;
  /** Soft bound: fish further than this from the drifting goal are pulled back hard. */
  readonly radius: number;
  /** Cruise speed, world units per second. */
  readonly speed: number;
  /** Fish length, world units (each fish varies 0.8x-1.2x). */
  readonly size: number;
  /** Flank colour, `#rrggbb`. The back is darker and the belly paler automatically. */
  readonly color: string;
}

export interface FishSchoolState {
  readonly count: number;
  /** xyz per fish. */
  readonly positions: Float32Array;
  /** xyz per fish, world units per second. */
  readonly velocities: Float32Array;
  /** Length multiplier per fish. */
  readonly scales: Float32Array;
  /** Per-fish wander phase. */
  readonly phases: Float32Array;
  /** School-wide phases of the drifting goal. */
  readonly goalPhase: Float32Array;
  /** Seconds simulated (wraps, see `SCHOOL_TIME_PERIOD`). */
  time: number;
  /** Steps taken; rotates which school-mates each fish samples. */
  frame: number;
}

/** Steering weights. The defaults are tuned for schools of 10-60 fish a few units across. */
export interface BoidsTuning {
  readonly cohesion: number;
  readonly alignment: number;
  readonly separation: number;
  /** Distance, as a multiple of the fish size, under which school-mates push apart. */
  readonly separationDistance: number;
  readonly wander: number;
  /** Pull towards the goal, per unit of distance beyond half the radius. */
  readonly bounds: number;
  /** Largest vertical share of the velocity (0 = perfectly level, 1 = free). */
  readonly maxClimb: number;
}

export const DEFAULT_BOIDS_TUNING: BoidsTuning = {
  cohesion: 0.55,
  alignment: 1.1,
  separation: 2.4,
  separationDistance: 1.6,
  wander: 0.9,
  bounds: 1.6,
  maxClimb: 0.3,
};

/** Longest step the simulation takes; a longer frame (tab switch, GC) is cut to this. */
export const MAX_SCHOOL_STEP = 0.1;
/** Clock wrap, so a page left open for days keeps float precision in the wander phases. */
export const SCHOOL_TIME_PERIOD = 2 * Math.PI * 1000;

const MIN_SPEED = 0.55;
const MAX_SPEED = 1.45;

/** Seeds a school: fish scattered within half the radius of home, heading roughly together. */
export function createSchoolState(spec: FishSchoolSpec, count: number, seed: number): FishSchoolState {
  const n = Math.max(0, Math.floor(count));
  const random = seededRandom(seed);
  const positions = new Float32Array(n * 3);
  const velocities = new Float32Array(n * 3);
  const scales = new Float32Array(n);
  const phases = new Float32Array(n);
  const heading = random() * Math.PI * 2;
  const spread = spec.radius * 0.5;

  for (let i = 0; i < n; i++) {
    const o = i * 3;
    positions[o] = spec.center[0] + (random() * 2 - 1) * spread;
    positions[o + 1] = spec.center[1] + (random() * 2 - 1) * spread * 0.4;
    positions[o + 2] = spec.center[2] + (random() * 2 - 1) * spread;
    const angle = heading + (random() * 2 - 1) * 0.5;
    velocities[o] = Math.sin(angle) * spec.speed;
    velocities[o + 1] = 0;
    velocities[o + 2] = Math.cos(angle) * spec.speed;
    scales[i] = 0.8 + random() * 0.4;
    phases[i] = random() * Math.PI * 2;
  }

  const goalPhase = new Float32Array([random() * 6.283, random() * 6.283, random() * 6.283]);
  return { count: n, positions, velocities, scales, phases, goalPhase, time: 0, frame: 0 };
}

/**
 * Advances the school by `dt` seconds (clamped to `MAX_SCHOOL_STEP`; 0 or less is a no-op).
 * Each fish reads `neighbourSamples` school-mates, spread across the school and rotated every
 * step so over a few frames every fish hears from every part of the school.
 */
export function stepSchool(
  state: FishSchoolState,
  spec: FishSchoolSpec,
  dt: number,
  neighbourSamples: number,
  tuning: BoidsTuning = DEFAULT_BOIDS_TUNING
): void {
  const n = state.count;
  if (!(dt > 0) || n === 0) return;
  const step = Math.min(dt, MAX_SCHOOL_STEP);
  state.time = (state.time + step) % SCHOOL_TIME_PERIOD;
  state.frame = (state.frame + 1) % 1_000_000;
  const t = state.time;
  const { positions: p, velocities: v, phases, goalPhase } = state;

  // The goal drifts on a slow Lissajous inside the home region, so the school travels.
  const r = spec.radius;
  const gx = spec.center[0] + Math.sin(t * 0.07 + goalPhase[0]) * r * 0.55;
  const gy = spec.center[1] + Math.sin(t * 0.11 + goalPhase[1]) * r * 0.15;
  const gz = spec.center[2] + Math.cos(t * 0.05 + goalPhase[2]) * r * 0.55;

  const k = Math.min(Math.max(0, Math.floor(neighbourSamples)), n - 1);
  const stride = k > 0 ? Math.max(1, Math.floor((n - 1) / k)) : 1;
  const offset = state.frame % Math.max(1, n - 1);
  const sepDistance = spec.size * tuning.separationDistance;
  const sepDistanceSq = sepDistance * sepDistance;
  const minSpeed = spec.speed * MIN_SPEED;
  const maxSpeed = spec.speed * MAX_SPEED;

  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const px = p[o];
    const py = p[o + 1];
    const pz = p[o + 2];
    let vx = v[o];
    let vy = v[o + 1];
    let vz = v[o + 2];

    let ax = 0;
    let ay = 0;
    let az = 0;

    if (k > 0) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      let mx = 0;
      let my = 0;
      let mz = 0;
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let s = 0; s < k; s++) {
        // 1..n-1 steps away, so a fish never samples itself.
        const j = (i + 1 + ((offset + s * stride) % (n - 1))) % n;
        const q = j * 3;
        const dx = px - p[q];
        const dy = py - p[q + 1];
        const dz = pz - p[q + 2];
        cx += p[q];
        cy += p[q + 1];
        cz += p[q + 2];
        mx += v[q];
        my += v[q + 1];
        mz += v[q + 2];
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq < sepDistanceSq && dSq > 1e-8) {
          const push = (sepDistanceSq - dSq) / (sepDistanceSq * Math.sqrt(dSq));
          sx += dx * push;
          sy += dy * push;
          sz += dz * push;
        }
      }
      const inv = 1 / k;
      ax += (cx * inv - px) * tuning.cohesion + (mx * inv - vx) * tuning.alignment + sx * tuning.separation * spec.speed;
      ay += (cy * inv - py) * tuning.cohesion + (my * inv - vy) * tuning.alignment + sy * tuning.separation * spec.speed;
      az += (cz * inv - pz) * tuning.cohesion + (mz * inv - vz) * tuning.alignment + sz * tuning.separation * spec.speed;
    }

    // Wander: smooth per-fish noise, mostly horizontal.
    const ph = phases[i];
    ax += Math.sin(t * 0.9 + ph) * tuning.wander * spec.speed;
    ay += Math.sin(t * 0.6 + ph * 1.7) * tuning.wander * spec.speed * 0.25;
    az += Math.cos(t * 0.8 + ph * 2.3) * tuning.wander * spec.speed;

    // Soft bounds: a gentle pull always, a strong one beyond half the radius.
    const gdx = gx - px;
    const gdy = (gy - py) * 2; // flatter schools: vertical distance counts double
    const gdz = gz - pz;
    const gd = Math.sqrt(gdx * gdx + gdy * gdy + gdz * gdz);
    if (gd > 1e-6) {
      const pull = (0.08 + tuning.bounds * Math.max(0, gd - r * 0.5) / r) * spec.speed;
      ax += (gdx / gd) * pull;
      ay += (gdy / gd) * pull;
      az += (gdz / gd) * pull;
    }

    vx += ax * step;
    vy += ay * step;
    vz += az * step;

    // Speed band first...
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (speed < 1e-6) {
      vx = minSpeed;
      vy = 0;
      vz = 0;
    } else if (speed < minSpeed || speed > maxSpeed) {
      const scale = (speed < minSpeed ? minSpeed : maxSpeed) / speed;
      vx *= scale;
      vy *= scale;
      vz *= scale;
    }
    // ...then mostly level swimming, topping the horizontal speed back up to the band.
    const horizontal = Math.sqrt(vx * vx + vz * vz);
    const climbLimit = Math.max(horizontal, minSpeed) * tuning.maxClimb;
    if (vy > climbLimit || vy < -climbLimit) {
      vy = vy > 0 ? climbLimit : -climbLimit;
      const needed = Math.sqrt(Math.max(0, minSpeed * minSpeed - vy * vy));
      if (horizontal < needed) {
        if (horizontal < 1e-6) {
          vx = needed;
          vz = 0;
        } else {
          vx *= needed / horizontal;
          vz *= needed / horizontal;
        }
      }
    }

    v[o] = vx;
    v[o + 1] = vy;
    v[o + 2] = vz;
    p[o] = px + vx * step;
    p[o + 1] = py + vy * step;
    p[o + 2] = pz + vz * step;
  }
}

/**
 * Writes one column-major 4x4 instance matrix per fish into `out` (an `InstancedMesh`'s
 * `instanceMatrix.array`): translate to the fish, turn its +Z nose along its velocity with no
 * roll, and scale by `size x` the fish's own multiplier. No trigonometry, no allocation.
 */
export function writeSchoolMatrices(state: FishSchoolState, size: number, out: Float32Array): void {
  const { positions: p, velocities: v, scales } = state;
  const n = Math.min(state.count, Math.floor(out.length / 16));
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const m = i * 16;
    const vx = v[o];
    const vy = v[o + 1];
    const vz = v[o + 2];
    const length = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const horizontal = Math.sqrt(vx * vx + vz * vz);
    // Yaw from the horizontal heading, pitch from the climb: R = Ry(yaw) * Rx(pitch).
    const cy = horizontal > 1e-6 ? vz / horizontal : 1;
    const sy = horizontal > 1e-6 ? vx / horizontal : 0;
    const cp = length > 1e-6 ? horizontal / length : 1;
    const sp = length > 1e-6 ? -vy / length : 0;
    const s = size * scales[i];

    out[m] = cy * s;
    out[m + 1] = 0;
    out[m + 2] = -sy * s;
    out[m + 3] = 0;
    out[m + 4] = sy * sp * s;
    out[m + 5] = cp * s;
    out[m + 6] = cy * sp * s;
    out[m + 7] = 0;
    out[m + 8] = sy * cp * s;
    out[m + 9] = -sp * s;
    out[m + 10] = cy * cp * s;
    out[m + 11] = 0;
    out[m + 12] = p[o];
    out[m + 13] = p[o + 1];
    out[m + 14] = p[o + 2];
    out[m + 15] = 1;
  }
}
