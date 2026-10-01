import type { DivePath } from '@qa3elhamor/dive-domain';
import {
  AMBIENT_LIFE_DEFAULTS,
  WATER_VOLUME,
  type AmbientLifeConfig,
  type FishSchoolSpec,
  type KelpClearing,
  type Vec3,
} from '@qa3elhamor/world-feature';

/**
 * Ambient life placed around the dive. Everything positional is derived from the dive path at
 * runtime (whatever `dive.config.ts` currently routes), so re-tuning the dive moves the fish,
 * the Hamour's patrol and the kelp clearings with it. Counts are the quality tier's call
 * (`QUALITY_PROFILES[tier].ambientLife`); this file decides where and what.
 *
 * IP: `characters` stays empty. The bundled SpongeBob and Patrick models are Nickelodeon IP
 * and this site carries its owner's name (`.ptah/scope-decisions.md` §IP). A fork that
 * accepts that risk may place them, in scene-world units like landmarks, e.g.
 * `characters: [{ asset: 'patrick-character', position: [0.1, 0.07, 0.2], rotationY: 1 }]`.
 */
export const AMBIENT_ART = {
  /** School homes: dive progress, side of the route (+1 right of travel, -1 left), colour. */
  schools: [
    // Priority order: the low tier renders the first two, so they sit where every visit goes.
    { at: 0.5, side: 1, color: '#e3bf4f', size: 0.5, speed: 1.9, radius: 5 },
    { at: 0.14, side: -1, color: '#9fc4d8', size: 0.42, speed: 2.3, radius: 6 },
    { at: 0.74, side: -1, color: '#d98b52', size: 0.48, speed: 1.7, radius: 5 },
    { at: 0.3, side: 1, color: '#a9d6cf', size: 0.36, speed: 2.5, radius: 6 },
    { at: 0.9, side: 1, color: '#7fc8b4', size: 0.46, speed: 1.8, radius: 5 },
    { at: 0.62, side: -1, color: '#c6d8e4', size: 0.34, speed: 2.6, radius: 6 },
  ],
  /** Sideways distance of a school's home from the camera's line, world units. */
  schoolOffset: 8,
  /** The Hamour's near leg runs this far to the right of the route, a little below it. */
  patrolNear: { side: 8.5, drop: 0.5 },
  /** Its return leg: far to the left and higher, well into the fog. */
  patrolFar: { side: 22, rise: 7 },
  patrolSamples: 10,
  /** No patrol point closer than this to the camera's line, world units. */
  patrolCameraClearance: 5,
  /** Kelp keeps this far (xz) from each landmark... */
  landmarkClearance: 7,
  /** ...and from the camera's line, where the camera is low enough for kelp to reach. */
  cameraClearance: 4.5,
  cameraClearanceBelowY: 12,
  /** The bed grows within the route's footprint plus this margin. */
  kelpMargin: 22,
} as const;

type MutableVec3 = [number, number, number];

/** Unit horizontal vector to the right of travel at `progress`. */
function rightOf(path: DivePath, progress: number): MutableVec3 {
  const [tx, , tz] = path.tangentAt(progress);
  const length = Math.hypot(tx, tz);
  return length > 1e-6 ? [-tz / length, 0, tx / length] : [1, 0, 0];
}

const add = (a: Vec3, b: Vec3, scale = 1): Vec3 => [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];

/** Landmark focus points (world units) from the dive's waypoints. */
const landmarkFoci = (path: DivePath): Vec3[] =>
  path.waypoints.flatMap((w) => (w.focus ? [w.focus] : []));

/** Moves `point` (xz) out of every landmark's clearance circle. */
function awayFromLandmarks(point: Vec3, foci: readonly Vec3[], clearance: number): Vec3 {
  let [x, , z] = point;
  for (const focus of foci) {
    const dx = x - focus[0];
    const dz = z - focus[2];
    const d = Math.hypot(dx, dz);
    if (d >= clearance) continue;
    const scale = d > 1e-6 ? clearance / d : 1;
    x = focus[0] + (d > 1e-6 ? dx * scale : clearance);
    z = focus[2] + (d > 1e-6 ? dz * scale : 0);
  }
  return [x, point[1], z];
}

/** Distance from `point` to the camera's line, sampled at 101 points. */
function distanceToCameraLine(point: Vec3, path: DivePath): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= 100; i++) {
    const p = path.pointAt(i / 100);
    best = Math.min(best, Math.hypot(point[0] - p[0], point[1] - p[1], point[2] - p[2]));
  }
  return best;
}

/**
 * The nearest spot to `point`, at the same height, that is `landmarkClearance` (xz) from every
 * landmark and `patrolCameraClearance` from the camera's line: searched on rings of growing
 * radius, so the result is deterministic and moves the point as little as it can.
 */
function clearSpot(point: Vec3, path: DivePath, foci: readonly Vec3[], art: typeof AMBIENT_ART): Vec3 {
  const isClear = (p: Vec3): boolean =>
    foci.every((f) => Math.hypot(p[0] - f[0], p[2] - f[2]) >= art.landmarkClearance) &&
    distanceToCameraLine(p, path) >= art.patrolCameraClearance;
  if (isClear(point)) return point;
  for (let radius = 1; radius <= 24; radius++) {
    for (let k = 0; k < 24; k++) {
      const angle = (k / 24) * Math.PI * 2;
      const candidate: Vec3 = [point[0] + Math.cos(angle) * radius, point[1], point[2] + Math.sin(angle) * radius];
      if (isClear(candidate)) return candidate;
    }
  }
  return awayFromLandmarks(point, foci, art.landmarkClearance);
}

/**
 * The Hamour's patrol: a loop down the dive on the right of the route, just off the camera's
 * line, and back up far on the left. The near leg is where it spends its time with the
 * visitor; the far leg is how it gets back to the top unseen.
 */
export function buildHamourPatrol(path: DivePath, art = AMBIENT_ART): Vec3[] {
  const foci = landmarkFoci(path);
  const near: Vec3[] = [];
  const far: Vec3[] = [];
  for (let i = 0; i < art.patrolSamples; i++) {
    const progress = 0.04 + (0.94 * i) / (art.patrolSamples - 1);
    const point = path.pointAt(progress);
    const right = rightOf(path, progress);
    const keepClear = (candidate: Vec3): Vec3 => clearSpot(candidate, path, foci, art);
    near.push(keepClear(add(add(point, right, art.patrolNear.side), [0, -art.patrolNear.drop, 0])));
    far.push(keepClear(add(add(point, right, -art.patrolFar.side), [0, art.patrolFar.rise, 0])));
  }
  return [...near, ...far.reverse()];
}

/** School homes beside the route, in `AMBIENT_ART.schools` priority order. */
export function buildSchools(path: DivePath, art = AMBIENT_ART): FishSchoolSpec[] {
  const foci = landmarkFoci(path);
  return art.schools.map(({ at, side, color, size, speed, radius }) => {
    const point = path.pointAt(at);
    const home = awayFromLandmarks(add(point, rightOf(path, at), side * art.schoolOffset), foci, art.landmarkClearance);
    return { center: [home[0], Math.max(home[1] + 1, 4), home[2]], radius, size, speed, color };
  });
}

/**
 * Where kelp may not root: each landmark, the camera's line wherever it runs low, the sight
 * line from each stop to its landmark, and the view ahead of the last camera position.
 */
export function buildKelpClearings(path: DivePath, art = AMBIENT_ART): KelpClearing[] {
  const clearings: KelpClearing[] = landmarkFoci(path).map((center) => ({ center, radius: art.landmarkClearance }));
  for (let i = 0; i <= 40; i++) {
    const progress = i / 40;
    const point = path.pointAt(progress);
    if (point[1] > art.cameraClearanceBelowY) continue;
    clearings.push({ center: point, radius: art.cameraClearance });
    // A little of the view ahead, so a low camera never stares into a stalk.
    clearings.push({ center: add(point, path.tangentAt(progress), 6), radius: art.cameraClearance });
  }
  for (const waypoint of path.waypoints) {
    if (!waypoint.focus) continue;
    for (const t of [0.33, 0.66]) {
      const center: Vec3 = [
        waypoint.position[0] + (waypoint.focus[0] - waypoint.position[0]) * t,
        0,
        waypoint.position[2] + (waypoint.focus[2] - waypoint.position[2]) * t,
      ];
      clearings.push({ center, radius: art.cameraClearance });
    }
  }
  const end = path.pointAt(1);
  const ahead = path.tangentAt(1);
  for (const distance of [10, 15]) clearings.push({ center: add(end, ahead, distance), radius: art.cameraClearance + 1 });
  return clearings;
}

/** The route's xz footprint plus a margin, inside the water volume. */
function kelpArea(path: DivePath, margin: number): NonNullable<AmbientLifeConfig['kelp']>['area'] {
  const xs = path.controlPoints.map((p) => p[0]);
  const zs = path.controlPoints.map((p) => p[2]);
  const limit = (value: number, axis: 0 | 2): number =>
    Math.min(WATER_VOLUME.max[axis] * 0.8, Math.max(WATER_VOLUME.min[axis] * 0.8, value));
  return {
    min: [limit(Math.min(...xs) - margin, 0), limit(Math.min(...zs) - margin, 2)],
    max: [limit(Math.max(...xs) + margin, 0), limit(Math.max(...zs) + margin, 2)],
  };
}

/** The site's ambient life, fitted to `path`. */
export function buildAmbientLife(path: DivePath, base: AmbientLifeConfig = AMBIENT_LIFE_DEFAULTS): AmbientLifeConfig {
  return {
    ...base,
    schools: buildSchools(path),
    hamour: base.hamour && { ...base.hamour, patrol: buildHamourPatrol(path) },
    kelp: base.kelp && {
      ...base.kelp,
      area: kelpArea(path, AMBIENT_ART.kelpMargin),
      clearings: buildKelpClearings(path),
    },
    characters: [],
  };
}
