import { CatmullRomSpline } from './catmull-rom.js';
import { isFiniteVec3, type MutableVec3, type Vec3 } from './vec3.js';

/**
 * A named stop on the dive, usually one per landmark. It sits ON the path, at one of the
 * control points, so its progress is exact rather than a nearest-point projection.
 */
export interface DiveWaypointSpec {
  /** Stable id; landmark-kernel and telemetry use the landmark's asset id (e.g. `landmark-pineapple`). */
  readonly id: string;
  /** Index into `controlPoints` of the camera position at this stop. */
  readonly at: number;
  /** What the camera looks at while focused on this stop (world units), e.g. the landmark. */
  readonly focus?: Vec3;
}

/**
 * How camera height maps to displayed depth. Depth is 0 m at `surfaceY` and `floorMeters` at
 * `floorY`; the world is not to scale, so metres are a narrative figure, not a measurement.
 */
export interface DiveDepthSpec {
  readonly surfaceY: number;
  readonly floorY: number;
  readonly floorMeters: number;
}

export interface DivePathSpec {
  /** Camera positions in world units, surface first. At least two, consecutive ones distinct. */
  readonly controlPoints: readonly Vec3[];
  /** Stops along the path, in path order. */
  readonly waypoints?: readonly DiveWaypointSpec[];
  readonly depth: DiveDepthSpec;
}

export interface DiveWaypoint {
  readonly id: string;
  readonly controlPoint: number;
  /** Arc-length progress in [0, 1] at which the camera reaches this stop. */
  readonly progress: number;
  readonly position: Vec3;
  readonly focus: Vec3 | null;
}

/** Thrown by `DivePath.create` with every problem found, not just the first. */
export class DivePathError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid dive path:\n- ${issues.join('\n- ')}`);
    this.name = 'DivePathError';
  }
}

/** Arc-length table resolution. 96 chords per segment keeps the length error far below 0.1%. */
const SAMPLES_PER_SEGMENT = 96;

/** Progress distance under which two positions count as "at" the same place. */
const PROGRESS_EPSILON = 1e-6;

// NaN fails every comparison, so it is caught first: non-finite progress means the surface.
const clamp01 = (v: number): number => (Number.isNaN(v) || v <= 0 ? 0 : v >= 1 ? 1 : v);

/**
 * The dive: an immutable, validated camera path from the surface to the seabed.
 *
 * Positions along it are addressed by `progress` in [0, 1], which is arc-length
 * parameterised: equal steps in progress cover equal distances, so a steady scroll moves the
 * camera at a steady speed no matter how unevenly the control points are spaced.
 *
 * Pure: no three.js, no DOM. The `*Into` samplers write into caller-owned buffers so a render
 * loop can call them every frame without allocating.
 */
export class DivePath {
  readonly controlPoints: readonly Vec3[];
  readonly waypoints: readonly DiveWaypoint[];
  readonly depth: DiveDepthSpec;
  /** Total arc length in world units. */
  readonly length: number;

  private readonly spline: CatmullRomSpline;
  /** Cumulative arc length at u = i / (cumulative.length - 1). */
  private readonly cumulative: Float64Array;
  private readonly waypointsById: ReadonlyMap<string, DiveWaypoint>;
  private readonly scratch: MutableVec3 = [0, 0, 0];
  private readonly scratchDerivative: MutableVec3 = [0, 0, 0];

  private constructor(spec: DivePathSpec) {
    this.controlPoints = Object.freeze(spec.controlPoints.map((p) => Object.freeze([p[0], p[1], p[2]] as const)));
    this.depth = Object.freeze({ ...spec.depth });
    this.spline = new CatmullRomSpline(this.controlPoints);

    const samples = this.spline.segmentCount * SAMPLES_PER_SEGMENT;
    this.cumulative = new Float64Array(samples + 1);
    const prev: MutableVec3 = [0, 0, 0];
    const next: MutableVec3 = [0, 0, 0];
    this.spline.evaluate(0, prev);
    for (let i = 1; i <= samples; i++) {
      this.spline.evaluate(i / samples, next);
      this.cumulative[i] =
        this.cumulative[i - 1] + Math.hypot(next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]);
      prev[0] = next[0];
      prev[1] = next[1];
      prev[2] = next[2];
    }
    this.length = this.cumulative[samples];

    this.waypoints = Object.freeze(
      (spec.waypoints ?? []).map((w) =>
        Object.freeze({
          id: w.id,
          controlPoint: w.at,
          progress: this.cumulative[w.at * SAMPLES_PER_SEGMENT] / this.length,
          position: this.controlPoints[w.at],
          focus: w.focus ? (Object.freeze([w.focus[0], w.focus[1], w.focus[2]] as const) as Vec3) : null,
        })
      )
    );
    this.waypointsById = new Map(this.waypoints.map((w) => [w.id, w]));
  }

  /** Every problem with `spec`, or an empty list when it is a valid dive. */
  static validate(spec: DivePathSpec): string[] {
    const issues: string[] = [];
    const points = Array.isArray(spec?.controlPoints) ? spec.controlPoints : [];
    if (points.length < 2) issues.push(`controlPoints needs at least 2 points, got ${points.length}.`);
    points.forEach((p, i) => {
      if (!isFiniteVec3(p)) issues.push(`controlPoints[${i}] is not three finite numbers.`);
      else if (i > 0 && isFiniteVec3(points[i - 1])) {
        const q = points[i - 1];
        if (p[0] === q[0] && p[1] === q[1] && p[2] === q[2]) {
          issues.push(`controlPoints[${i}] repeats controlPoints[${i - 1}]; consecutive points must differ.`);
        }
      }
    });

    const depth = spec?.depth;
    if (!depth || ![depth.surfaceY, depth.floorY, depth.floorMeters].every(Number.isFinite)) {
      issues.push('depth needs finite surfaceY, floorY and floorMeters.');
    } else {
      if (depth.surfaceY <= depth.floorY) issues.push('depth.surfaceY must be above depth.floorY.');
      if (depth.floorMeters <= 0) issues.push('depth.floorMeters must be positive.');
    }

    const seen = new Set<string>();
    let previousAt = -1;
    (spec?.waypoints ?? []).forEach((w, i) => {
      const label = `waypoints[${i}]`;
      if (typeof w.id !== 'string' || w.id.trim() === '') issues.push(`${label}.id must be a non-empty string.`);
      else if (seen.has(w.id)) issues.push(`${label}.id "${w.id}" is not unique.`);
      else seen.add(w.id);

      if (!Number.isInteger(w.at) || w.at < 0 || w.at >= points.length) {
        issues.push(`${label}.at must be a control point index in [0, ${points.length - 1}], got ${w.at}.`);
      } else {
        if (w.at <= previousAt) issues.push(`${label} ("${w.id}") is out of path order; waypoints must follow the dive.`);
        previousAt = w.at;
      }
      if (w.focus !== undefined && !isFiniteVec3(w.focus)) issues.push(`${label}.focus is not three finite numbers.`);
    });
    return issues;
  }

  /** Validates and builds a dive; throws `DivePathError` listing every issue. */
  static create(spec: DivePathSpec): DivePath {
    const issues = DivePath.validate(spec);
    if (issues.length > 0) throw new DivePathError(issues);
    return new DivePath(spec);
  }

  /** Writes the camera position at `progress` (clamped to [0, 1]) into `out`. */
  pointInto(progress: number, out: MutableVec3): MutableVec3 {
    this.spline.evaluate(this.splineParameter(progress), out);
    return out;
  }

  /** Writes the point and the unit direction of travel at `progress` into the two buffers. */
  sampleInto(progress: number, outPoint: MutableVec3, outTangent: MutableVec3): void {
    const d = this.scratchDerivative;
    this.spline.evaluate(this.splineParameter(progress), outPoint, d);
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len > 1e-12) {
      outTangent[0] = d[0] / len;
      outTangent[1] = d[1] / len;
      outTangent[2] = d[2] / len;
    } else {
      // A stationary point of the spline: fall back to the overall direction of the dive.
      const a = this.controlPoints[0];
      const b = this.controlPoints[this.controlPoints.length - 1];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
      outTangent[0] = (b[0] - a[0]) / l;
      outTangent[1] = (b[1] - a[1]) / l;
      outTangent[2] = (b[2] - a[2]) / l;
    }
  }

  /** Allocating convenience form of `pointInto`, for setup code and tests. */
  pointAt(progress: number): Vec3 {
    return this.pointInto(progress, [0, 0, 0]);
  }

  /** Allocating convenience: the unit direction of travel at `progress`. */
  tangentAt(progress: number): Vec3 {
    const t: MutableVec3 = [0, 0, 0];
    this.sampleInto(progress, [0, 0, 0], t);
    return t;
  }

  /** 0 at the surface, 1 at the floor, for a camera height in world units. */
  depthRatioOfY(y: number): number {
    return clamp01((this.depth.surfaceY - y) / (this.depth.surfaceY - this.depth.floorY));
  }

  /** Displayed depth in metres (positive, 0 at the surface) for a camera height. */
  depthOfY(y: number): number {
    return this.depthRatioOfY(y) * this.depth.floorMeters;
  }

  /** Displayed depth in metres at `progress`. */
  depthAt(progress: number): number {
    return this.depthOfY(this.pointInto(progress, this.scratch)[1]);
  }

  waypoint(id: string): DiveWaypoint | undefined {
    return this.waypointsById.get(id);
  }

  /** Progress of the waypoint `id`; throws for an unknown id, which is a wiring error. */
  progressOf(id: string): number {
    const w = this.waypointsById.get(id);
    if (!w) throw new RangeError(`Unknown dive waypoint "${id}".`);
    return w.progress;
  }

  /** The waypoint closest to `progress` along the path, or null when there are none. */
  nearestWaypoint(progress: number): DiveWaypoint | null {
    let best: DiveWaypoint | null = null;
    let bestDistance = Infinity;
    for (const w of this.waypoints) {
      const d = Math.abs(w.progress - progress);
      if (d < bestDistance) {
        best = w;
        bestDistance = d;
      }
    }
    return best;
  }

  /** The first waypoint strictly deeper along the path than `progress`. */
  nextWaypoint(progress: number): DiveWaypoint | null {
    for (const w of this.waypoints) if (w.progress > progress + PROGRESS_EPSILON) return w;
    return null;
  }

  /** The last waypoint strictly shallower along the path than `progress`. */
  previousWaypoint(progress: number): DiveWaypoint | null {
    for (let i = this.waypoints.length - 1; i >= 0; i--) {
      if (this.waypoints[i].progress < progress - PROGRESS_EPSILON) return this.waypoints[i];
    }
    return null;
  }

  /** Maps arc-length progress to the spline's uniform parameter by searching the length table. */
  private splineParameter(progress: number): number {
    const target = clamp01(progress) * this.length;
    const table = this.cumulative;
    let lo = 0;
    let hi = table.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >>> 1;
      if (table[mid] <= target) lo = mid;
      else hi = mid;
    }
    const span = table[hi] - table[lo];
    const frac = span > 0 ? (target - table[lo]) / span : 0;
    return (lo + frac) / (table.length - 1);
  }
}
