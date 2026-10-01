/**
 * A smooth, monotone curve through a list of knots: piecewise cubic Hermite with
 * Fritsch–Butland tangents (the scheme behind "PCHIP"). It passes through every knot, never
 * overshoots between them, and its slope is continuous, so a value driven through it has no
 * velocity jumps at the knots.
 *
 * The dive uses it to turn scroll into progress: knots close together in progress but far
 * apart in scroll make the camera linger there.
 *
 * Pure; immutable after construction.
 */
export class MonotoneCurve {
  private readonly xs: Float64Array;
  private readonly ys: Float64Array;
  private readonly slopes: Float64Array;

  /**
   * `xs` must be strictly increasing and `ys` non-decreasing, with the same length (at least
   * 2). Callers validate; this throws a `RangeError` on bad input as a wiring guard.
   */
  constructor(xs: readonly number[], ys: readonly number[]) {
    const n = xs.length;
    if (n < 2 || ys.length !== n) throw new RangeError('MonotoneCurve needs at least two knots of each.');
    for (let i = 1; i < n; i++) {
      if (!(xs[i] > xs[i - 1])) throw new RangeError('MonotoneCurve xs must be strictly increasing.');
      if (!(ys[i] >= ys[i - 1])) throw new RangeError('MonotoneCurve ys must be non-decreasing.');
    }
    this.xs = Float64Array.from(xs);
    this.ys = Float64Array.from(ys);

    const secant = new Float64Array(n - 1);
    for (let i = 0; i < n - 1; i++) secant[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);

    const slopes = new Float64Array(n);
    slopes[0] = endSlope(xs[1] - xs[0], n > 2 ? xs[2] - xs[1] : 0, secant[0], n > 2 ? secant[1] : secant[0]);
    slopes[n - 1] =
      n > 2
        ? endSlope(xs[n - 1] - xs[n - 2], xs[n - 2] - xs[n - 3], secant[n - 2], secant[n - 3])
        : secant[0];
    for (let i = 1; i < n - 1; i++) {
      const d0 = secant[i - 1];
      const d1 = secant[i];
      if (d0 <= 0 || d1 <= 0) {
        slopes[i] = 0;
        continue;
      }
      // Weighted harmonic mean of the neighbouring secants (Fritsch–Butland).
      const h0 = xs[i] - xs[i - 1];
      const h1 = xs[i + 1] - xs[i];
      const w0 = 2 * h1 + h0;
      const w1 = h1 + 2 * h0;
      slopes[i] = (w0 + w1) / (w0 / d0 + w1 / d1);
    }
    this.slopes = slopes;
  }

  /** The curve at `x`, clamped to the first and last knots outside their range. */
  at(x: number): number {
    const xs = this.xs;
    const last = xs.length - 1;
    if (!(x > xs[0])) return this.ys[0]; // also catches NaN
    if (x >= xs[last]) return this.ys[last];
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >>> 1;
      if (xs[mid] <= x) lo = mid;
      else hi = mid;
    }
    const h = xs[hi] - xs[lo];
    const t = (x - xs[lo]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * this.ys[lo] +
      (t3 - 2 * t2 + t) * h * this.slopes[lo] +
      (-2 * t3 + 3 * t2) * this.ys[hi] +
      (t3 - t2) * h * this.slopes[hi]
    );
  }

  /**
   * The smallest `x` whose value reaches `y` (the inverse, for a strictly increasing curve),
   * clamped to the knot range. Bisection: exact to ~1e-12 of the range in 48 steps.
   */
  inverse(y: number): number {
    const xs = this.xs;
    const last = xs.length - 1;
    if (!(y > this.ys[0])) return xs[0];
    if (y >= this.ys[last]) {
      // Lowest x already at the top value, for a curve that ends on a plateau.
      let i = last;
      while (i > 0 && this.ys[i - 1] >= y) i--;
      return xs[i];
    }
    let lo = xs[0];
    let hi = xs[last];
    for (let i = 0; i < 48; i++) {
      const mid = (lo + hi) / 2;
      if (this.at(mid) < y) lo = mid;
      else hi = mid;
    }
    return hi;
  }
}

/**
 * One-sided three-point slope for an end knot, kept monotone: zero if it points the wrong
 * way, capped at three times the end secant (the Fritsch–Carlson bound).
 */
function endSlope(h0: number, h1: number, d0: number, d1: number): number {
  if (h1 <= 0) return d0;
  const m = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
  if (m <= 0 || d0 <= 0) return 0;
  return Math.min(m, 3 * d0);
}
