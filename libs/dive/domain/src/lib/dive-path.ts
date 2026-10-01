import { CatmullRomSpline } from './catmull-rom.js';
import { MonotoneCurve } from './monotone-curve.js';
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
  /**
   * What the camera looks at while focused on this stop (world units), e.g. the landmark. The
   * scrolling camera also turns towards it as it nears the stop (`attentionInto`).
   */
  readonly focus?: Vec3;
  /**
   * Scroll fraction in (0, 1) at which the camera reaches this stop. Set it on every waypoint
   * or on none; without it, scroll maps straight to arc-length progress.
   */
  readonly scroll?: number;
}

/**
 * How scroll is spent around the stops. Each waypoint holds a band of `dwell` scroll centred
 * on its `scroll`, across which the camera only creeps `creep` world units, so a visitor can
 * stop scrolling anywhere near a landmark and still be looking at it. Bands are shrunk where
 * neighbouring stops are too close for them to fit.
 */
export interface DivePacingSpec {
  /** Scroll fraction of each stop's hold, in [0, 1). */
  readonly dwell: number;
  /** World units travelled across one hold, at least 0. */
  readonly creep: number;
}

/**
 * How camera height maps to displayed depth. Depth is 0 m at `surfaceY` and `floorMeters` at
 * `floorY`; the world is not to scale, so metres are a narrative figure, not a measurement.
 * Along the dive, `DivePath.depthAt` uses the deepest height reached so far, so the gauge
 * never winds back.
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
  /** Holds around the stops; omitted, scroll moves the camera at a constant speed. */
  readonly pacing?: DivePacingSpec;
  /**
   * What the camera turns to face as it reaches the end of the dive (world units), so the
   * last view is a subject rather than open water.
   */
  readonly endFocus?: Vec3;
}

export interface DiveWaypoint {
  readonly id: string;
  readonly controlPoint: number;
  /** Arc-length progress in [0, 1] at which the camera reaches this stop. */
  readonly progress: number;
  /** Scroll fraction in [0, 1] at which the camera reaches this stop. */
  readonly scroll: number;
  readonly position: Vec3;
  readonly focus: Vec3 | null;
}

/** Distances (world units of arc) over which the scrolling camera turns to a focus point. */
export interface DiveAttentionRange {
  /** Within this distance of a focus point's stop the camera looks straight at it. */
  readonly inner: number;
  /** Beyond this distance the focus point has no pull. */
  readonly outer: number;
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
  /** What the camera faces at the end of the dive, if anything. */
  readonly endFocus: Vec3 | null;
  /**
   * The lowest camera height anywhere on the path (sampled along the spline, so it includes
   * any dip between control points). A depth spec whose `floorY` is this makes the deepest
   * point of the dive read exactly `floorMeters`.
   */
  readonly lowestY: number;

  private readonly spline: CatmullRomSpline;
  /** Lowest camera height reached so far, at the same samples as `cumulative`. */
  private readonly deepestY: Float64Array;
  /** Scroll fraction to progress; null when scroll is progress. */
  private readonly pacing: MonotoneCurve | null;
  /** Focus points by progress, in path order (waypoint foci, then the end focus). */
  private readonly attention: readonly AttentionPoint[];
  /** Cumulative arc length at u = i / (cumulative.length - 1). */
  private readonly cumulative: Float64Array;
  private readonly waypointsById: ReadonlyMap<string, DiveWaypoint>;
  private readonly scratchDerivative: MutableVec3 = [0, 0, 0];

  private constructor(spec: DivePathSpec) {
    this.controlPoints = Object.freeze(spec.controlPoints.map((p) => Object.freeze([p[0], p[1], p[2]] as const)));
    this.depth = Object.freeze({ ...spec.depth });
    this.spline = new CatmullRomSpline(this.controlPoints);

    const samples = this.spline.segmentCount * SAMPLES_PER_SEGMENT;
    this.cumulative = new Float64Array(samples + 1);
    this.deepestY = new Float64Array(samples + 1);
    const prev: MutableVec3 = [0, 0, 0];
    const next: MutableVec3 = [0, 0, 0];
    this.spline.evaluate(0, prev);
    this.deepestY[0] = prev[1];
    for (let i = 1; i <= samples; i++) {
      this.spline.evaluate(i / samples, next);
      this.cumulative[i] =
        this.cumulative[i - 1] + Math.hypot(next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]);
      this.deepestY[i] = Math.min(this.deepestY[i - 1], next[1]);
      prev[0] = next[0];
      prev[1] = next[1];
      prev[2] = next[2];
    }
    this.length = this.cumulative[samples];
    this.lowestY = this.deepestY[samples];

    this.waypoints = Object.freeze(
      (spec.waypoints ?? []).map((w) => {
        const progress = this.cumulative[w.at * SAMPLES_PER_SEGMENT] / this.length;
        return Object.freeze({
          id: w.id,
          controlPoint: w.at,
          progress,
          scroll: w.scroll ?? progress,
          position: this.controlPoints[w.at],
          focus: w.focus ? freezeVec3(w.focus) : null,
        });
      })
    );
    this.waypointsById = new Map(this.waypoints.map((w) => [w.id, w]));
    this.endFocus = spec.endFocus ? freezeVec3(spec.endFocus) : null;
    this.pacing = buildPacing(this.waypoints, spec.pacing, this.length);

    const attention: AttentionPoint[] = this.waypoints
      .filter((w) => w.focus !== null)
      .map((w) => ({ progress: w.progress, focus: w.focus as Vec3 }));
    if (this.endFocus) attention.push({ progress: 1, focus: this.endFocus });
    this.attention = attention;
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

    const waypoints = spec?.waypoints ?? [];
    const scrolled = waypoints.filter((w) => w.scroll !== undefined);
    if (scrolled.length > 0 && scrolled.length < waypoints.length) {
      issues.push('waypoints must all set scroll, or none of them.');
    }
    let previousScroll = 0;
    scrolled.forEach((w) => {
      const s = w.scroll as number;
      if (!Number.isFinite(s) || s <= 0 || s >= 1) {
        issues.push(`waypoint "${w.id}" scroll must be in (0, 1), got ${s}.`);
      } else if (s <= previousScroll) {
        issues.push(`waypoint "${w.id}" scroll must be after the previous stop's.`);
      } else {
        previousScroll = s;
      }
    });

    const pacing = spec?.pacing;
    if (pacing !== undefined) {
      if (!Number.isFinite(pacing.dwell) || pacing.dwell < 0 || pacing.dwell >= 1) {
        issues.push(`pacing.dwell must be in [0, 1), got ${pacing.dwell}.`);
      }
      if (!Number.isFinite(pacing.creep) || pacing.creep < 0) {
        issues.push(`pacing.creep must be a finite number of at least 0, got ${pacing.creep}.`);
      }
    }
    if (spec?.endFocus !== undefined && !isFiniteVec3(spec.endFocus)) {
      issues.push('endFocus is not three finite numbers.');
    }
    return issues;
  }

  /**
   * The lowest camera height on the path through `controlPoints`, sampled exactly as a built
   * `DivePath` samples it (`lowestY`). For a depth spec whose deepest point reads
   * `floorMeters`; needs at least two finite points.
   */
  static lowestYOf(controlPoints: readonly Vec3[]): number {
    const spline = new CatmullRomSpline(controlPoints);
    const samples = spline.segmentCount * SAMPLES_PER_SEGMENT;
    const p: MutableVec3 = [0, 0, 0];
    let lowest = Infinity;
    for (let i = 0; i <= samples; i++) {
      spline.evaluate(i / samples, p);
      if (p[1] < lowest) lowest = p[1];
    }
    return lowest;
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

  /**
   * Displayed depth in metres at `progress`: the story's depth, which never decreases as the
   * dive goes on. It follows the deepest camera height reached so far, so climbing over a
   * hill or up to a landmark on a rise holds the gauge rather than winding it back. Raw height
   * is still available as `depthOfY`.
   */
  depthAt(progress: number): number {
    const table = this.cumulative;
    const target = clamp01(progress) * this.length;
    let lo = 0;
    let hi = table.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >>> 1;
      if (table[mid] <= target) lo = mid;
      else hi = mid;
    }
    const span = table[hi] - table[lo];
    const frac = span > 0 ? Math.min(1, Math.max(0, (target - table[lo]) / span)) : 0;
    const y = this.deepestY[lo] + (this.deepestY[hi] - this.deepestY[lo]) * frac;
    return this.depthOfY(y);
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

  // --- pacing: scroll fraction <-> progress ---------------------------------------------------

  /** Dive progress for a scroll fraction (both clamped to [0, 1]); slow inside a stop's hold. */
  progressAtScroll(scroll: number): number {
    const s = clamp01(scroll);
    return this.pacing ? clamp01(this.pacing.at(s)) : s;
  }

  /** The scroll fraction that puts the camera at `progress`; the inverse of `progressAtScroll`. */
  scrollAtProgress(progress: number): number {
    const p = clamp01(progress);
    return this.pacing ? clamp01(this.pacing.inverse(p)) : p;
  }

  /** Scroll fraction of the waypoint `id`; throws for an unknown id, which is a wiring error. */
  scrollOf(id: string): number {
    const w = this.waypointsById.get(id);
    if (!w) throw new RangeError(`Unknown dive waypoint "${id}".`);
    return w.scroll;
  }

  // --- attention: where the scrolling camera should look ---------------------------------------

  /**
   * How strongly the camera at `progress` should look at a focus point, in [0, 1], with that
   * point written into `out` (left untouched when the weight is 0).
   *
   * The pull of each focus point (a waypoint's `focus`, or `endFocus` at the end) is 1 within
   * `range.inner` world units of arc from its stop and fades smoothly to 0 at `range.outer`.
   * Between two stops close enough for both to pull, the point slides from one to the other,
   * so the view pans across rather than snapping at the midpoint.
   */
  attentionInto(progress: number, range: DiveAttentionRange, out: MutableVec3): number {
    const points = this.attention;
    if (points.length === 0) return 0;
    const p = clamp01(progress);
    let next = 0;
    while (next < points.length && points[next].progress <= p) next++;
    const before = next > 0 ? points[next - 1] : null;
    const after = next < points.length ? points[next] : null;

    if (!before || !after) {
      const only = (before ?? after) as AttentionPoint;
      const w = falloff(Math.abs(p - only.progress) * this.length, range);
      if (w > 0) copyInto(only.focus, out);
      return w;
    }

    const dBefore = (p - before.progress) * this.length;
    const dAfter = (after.progress - p) * this.length;
    const wBefore = falloff(dBefore, range);
    const wAfter = falloff(dAfter, range);
    if (wBefore <= 0 && wAfter <= 0) return 0;

    // Blend by pull AND by place in the gap, so the result is exactly a stop's focus on that
    // stop (continuous as `p` crosses it) and exactly the other focus once one pull is gone.
    const u = dBefore + dAfter > 0 ? dBefore / (dBefore + dAfter) : 0;
    const towardsAfter = wAfter * u;
    const denominator = wBefore * (1 - u) + towardsAfter;
    const t = denominator > 0 ? towardsAfter / denominator : 0;
    out[0] = before.focus[0] + (after.focus[0] - before.focus[0]) * t;
    out[1] = before.focus[1] + (after.focus[1] - before.focus[1]) * t;
    out[2] = before.focus[2] + (after.focus[2] - before.focus[2]) * t;
    return Math.max(wBefore, wAfter);
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

interface AttentionPoint {
  readonly progress: number;
  readonly focus: Vec3;
}

const freezeVec3 = (v: Vec3): Vec3 => Object.freeze([v[0], v[1], v[2]] as const);

const copyInto = (v: Vec3, out: MutableVec3): void => {
  out[0] = v[0];
  out[1] = v[1];
  out[2] = v[2];
};

/** 1 within `inner`, 0 beyond `outer`, smoothstep between: no kink at either edge. */
function falloff(distanceAlongArc: number, range: DiveAttentionRange): number {
  const d = Math.abs(distanceAlongArc);
  if (d <= range.inner) return 1;
  if (d >= range.outer) return 0;
  const x = (d - range.inner) / (range.outer - range.inner);
  return 1 - x * x * (3 - 2 * x);
}

/**
 * Knots from scroll to progress: the surface, each stop (flanked by its hold when there is
 * one) and the floor, joined by a monotone curve. Holds are shrunk to at most 45% of the gap
 * to each neighbouring stop, in scroll and in progress, so neighbouring knots never cross.
 * Returns null when scroll is plain progress (no stop sets `scroll` and there is no pacing).
 */
function buildPacing(
  waypoints: readonly DiveWaypoint[],
  pacing: DivePacingSpec | undefined,
  length: number
): MonotoneCurve | null {
  const custom = waypoints.some((w) => w.scroll !== w.progress);
  if (!custom && (!pacing || pacing.dwell === 0 || waypoints.length === 0)) return null;

  const halfDwell = (pacing?.dwell ?? 0) / 2;
  const halfCreep = length > 0 ? (pacing?.creep ?? 0) / 2 / length : 0;
  const xs = [0];
  const ys = [0];
  // A stop at the very start or end of the scroll adds no knot of its own.
  const knot = (x: number, y: number): void => {
    if (x > xs[xs.length - 1] && x < 1) {
      xs.push(x);
      ys.push(Math.max(y, ys[ys.length - 1]));
    }
  };
  waypoints.forEach((w, i) => {
    const prevScroll = i > 0 ? waypoints[i - 1].scroll : 0;
    const nextScroll = i < waypoints.length - 1 ? waypoints[i + 1].scroll : 1;
    const prevProgress = i > 0 ? waypoints[i - 1].progress : 0;
    const nextProgress = i < waypoints.length - 1 ? waypoints[i + 1].progress : 1;
    const h = Math.min(halfDwell, 0.45 * (w.scroll - prevScroll), 0.45 * (nextScroll - w.scroll));
    const c = Math.min(halfCreep, 0.45 * (w.progress - prevProgress), 0.45 * (nextProgress - w.progress));
    if (h > 0) knot(w.scroll - h, w.progress - c);
    knot(w.scroll, w.progress);
    if (h > 0) knot(w.scroll + h, w.progress + c);
  });
  xs.push(1);
  ys.push(1);
  return new MonotoneCurve(xs, ys);
}
