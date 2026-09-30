import type { MutableVec3, Vec3 } from './vec3.js';

/** Coefficients per segment: c0..c3 for x, then y, then z. */
const COEFFS_PER_SEGMENT = 12;

/** Knot spacing below which a segment is treated as degenerate (mirrors three.js). */
const MIN_KNOT_SPACING = 1e-4;

/**
 * Centripetal Catmull-Rom spline through `points` (open, not closed), the same curve family
 * three.js's `CatmullRomCurve3` builds by default. Centripetal parameterisation never cusps or
 * self-intersects inside a segment, which matters for a camera: a cusp is a visible jolt.
 *
 * The spline is parameterised by `u` in [0, 1], spread uniformly over the segments, so `u` is
 * NOT proportional to distance travelled. `DivePath` adds the arc-length mapping on top.
 *
 * Every per-segment cubic is solved once at construction; evaluation is a few multiply-adds
 * and writes into caller-owned buffers.
 */
export class CatmullRomSpline {
  readonly segmentCount: number;
  private readonly coeffs: Float64Array;

  constructor(points: readonly Vec3[]) {
    if (points.length < 2) {
      throw new RangeError('A Catmull-Rom spline needs at least two points.');
    }
    const n = points.length;
    this.segmentCount = n - 1;
    this.coeffs = new Float64Array(this.segmentCount * COEFFS_PER_SEGMENT);

    for (let i = 0; i < this.segmentCount; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      // Open ends: reflect the neighbour through the end point, as three.js does.
      const p0 = i > 0 ? points[i - 1] : reflect(p2, p1);
      const p3 = i + 2 < n ? points[i + 2] : reflect(p1, p2);

      let dt0 = centripetalSpacing(p0, p1);
      let dt1 = centripetalSpacing(p1, p2);
      let dt2 = centripetalSpacing(p2, p3);
      if (dt1 < MIN_KNOT_SPACING) dt1 = 1;
      if (dt0 < MIN_KNOT_SPACING) dt0 = dt1;
      if (dt2 < MIN_KNOT_SPACING) dt2 = dt1;

      for (let axis = 0; axis < 3; axis++) {
        const x0 = p0[axis];
        const x1 = p1[axis];
        const x2 = p2[axis];
        const x3 = p3[axis];
        // Non-uniform Catmull-Rom tangents, rescaled to the [0, 1] segment parameter.
        const t1 = ((x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1) * dt1;
        const t2 = ((x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2) * dt1;
        const o = i * COEFFS_PER_SEGMENT + axis * 4;
        this.coeffs[o] = x1;
        this.coeffs[o + 1] = t1;
        this.coeffs[o + 2] = -3 * x1 + 3 * x2 - 2 * t1 - t2;
        this.coeffs[o + 3] = 2 * x1 - 2 * x2 + t1 + t2;
      }
    }
  }

  /**
   * Writes the point at spline parameter `u` (clamped to [0, 1]) into `out`, and the
   * derivative with respect to the local segment parameter into `outDerivative` when given.
   */
  evaluate(u: number, out: MutableVec3, outDerivative?: MutableVec3): void {
    const scaled = clamp01(u) * this.segmentCount;
    const segment = Math.min(Math.floor(scaled), this.segmentCount - 1);
    const t = scaled - segment;
    const base = segment * COEFFS_PER_SEGMENT;
    for (let axis = 0; axis < 3; axis++) {
      const o = base + axis * 4;
      const c1 = this.coeffs[o + 1];
      const c2 = this.coeffs[o + 2];
      const c3 = this.coeffs[o + 3];
      out[axis] = this.coeffs[o] + t * (c1 + t * (c2 + t * c3));
      if (outDerivative) outDerivative[axis] = c1 + t * (2 * c2 + t * 3 * c3);
    }
  }
}

// NaN fails every comparison, so it is caught first: non-finite progress means the surface.
const clamp01 = (v: number): number => (Number.isNaN(v) || v <= 0 ? 0 : v >= 1 ? 1 : v);

const reflect = (neighbour: Vec3, end: Vec3): Vec3 => [
  2 * end[0] - neighbour[0],
  2 * end[1] - neighbour[1],
  2 * end[2] - neighbour[2],
];

/** Centripetal knot spacing: distance^0.5. */
const centripetalSpacing = (a: Vec3, b: Vec3): number =>
  Math.pow((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2, 0.25);
