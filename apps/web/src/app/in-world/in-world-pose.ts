/*
 * The maths of an in-world DOM card: where it flies from, where it settles, and the scale at
 * which drei's `<Html transform>` draws it at exactly one CSS pixel per screen pixel, so its
 * text is rasterised at its own size (crisp) rather than scaled up or down (blurred).
 *
 * drei maps one CSS pixel of transformed HTML to `distanceFactor / 400` world units (times the
 * object's world scale), and projects it with a CSS perspective of `fovPx` pixels, where `fovPx`
 * is the camera's focal length in screen pixels. A card at depth `d` in front of the camera is
 * therefore shown at `scale * (distanceFactor / 400) * fovPx / d` screen pixels per CSS pixel.
 */

/** drei's `distanceFactor` for in-world cards (its default). */
export const IN_WORLD_DISTANCE_FACTOR = 10;

/** The camera's focal length in screen pixels: `projectionMatrix[5] * height / 2`. */
export const focalLengthPx = (
  verticalFovDegrees: number,
  viewportHeight: number,
): number => {
  const focal =
    viewportHeight / 2 / Math.tan((verticalFovDegrees * Math.PI) / 360);
  return Number.isFinite(focal) && focal > 0 ? focal : 0;
};

/** True for a number that can divide: finite and positive. */
const usable = (value: number): boolean => Number.isFinite(value) && value > 0;

/**
 * World scale for an `<Html transform>` object at `depth` (world units along the view axis)
 * so it appears at `apparent` screen pixels per CSS pixel; `apparent = 1` is pixel-exact.
 * 0 (nothing drawn) when any input cannot give a real size: a collapsed viewport (focal 0),
 * a depth at or behind the camera, NaN.
 */
export function htmlScaleFor(
  depth: number,
  focalPx: number,
  apparent = 1,
  distanceFactor = IN_WORLD_DISTANCE_FACTOR,
): number {
  if (!usable(depth) || !usable(focalPx) || !usable(distanceFactor)) return 0;
  if (!usable(apparent)) return 0;
  return (apparent * depth) / ((distanceFactor / 400) * focalPx);
}

/**
 * World units covered by one screen pixel at `depth`, for offsets measured on screen; 0 when
 * the inputs are not usable (see `htmlScaleFor`).
 */
export const worldPerPixel = (depth: number, focalPx: number): number =>
  usable(depth) && usable(focalPx) ? depth / focalPx : 0;

export const clamp01 = (t: number): number =>
  t <= 0 ? 0 : t >= 1 ? 1 : Number.isFinite(t) ? t : 0;

export const easeOutCubic = (t: number): number => 1 - (1 - clamp01(t)) ** 3;

export const easeInCubic = (t: number): number => clamp01(t) ** 3;

/** Linear interpolation. */
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The card's timeline, in seconds. */
export interface InWorldTiming {
  /** Wait before the card leaves the door, while the bubble curtain rises. */
  readonly delay: number;
  /** Door to settled, in front of the camera. */
  readonly emerge: number;
  /** Settled back to the door after closing. */
  readonly leave: number;
}

export const DEFAULT_IN_WORLD_TIMING: InWorldTiming = {
  delay: 0.35,
  emerge: 1.25,
  leave: 0.55,
};

/**
 * How far out of the door the card is, 0 (at the door, tiny) to 1 (settled in front of the
 * camera), `elapsed` seconds after opening. `from` is where it was when opened: above 0 when
 * re-opened while still flying back in, in which case it turns round at once (no wait for the
 * curtain) and covers only the remaining distance, in proportionally less time.
 */
export function emergeProgress(
  elapsed: number,
  timing: InWorldTiming = DEFAULT_IN_WORLD_TIMING,
  from = 0,
): number {
  const start = clamp01(from);
  if (start <= 0) return easeOutCubic((elapsed - timing.delay) / timing.emerge);
  const remaining = 1 - start;
  const duration = timing.emerge * Math.max(remaining, 0.2);
  return start + remaining * easeOutCubic(elapsed / duration);
}

/** The same, `elapsed` seconds after closing, from wherever the card was (`from`). */
export const leaveProgress = (
  elapsed: number,
  from: number,
  timing: InWorldTiming = DEFAULT_IN_WORLD_TIMING,
): number => from * (1 - easeInCubic(elapsed / timing.leave));

/** A small drift in the current, in screen pixels and radians. */
export interface Bob {
  x: number;
  y: number;
  roll: number;
  yaw: number;
}

/** A bob to write into, so the per-frame call allocates nothing. */
export const createBob = (): Bob => ({ x: 0, y: 0, roll: 0, yaw: 0 });

/**
 * The card's bob at `time` seconds, scaled by `amount` (0 holds it still: the card calms
 * while the visitor points at it or tabs through it, so it reads at full sharpness), written
 * into `out` and returned. Slow, incommensurate sines, so it never visibly loops.
 */
export function bobAt(time: number, amount: number, out: Bob): Bob {
  const a = Number.isFinite(amount) ? amount : 0;
  const t = Number.isFinite(time) ? time : 0;
  out.x = 3 * Math.sin(t * 0.53) * a;
  out.y = 6 * Math.sin(t * 0.81) * a;
  out.roll = 0.006 * Math.sin(t * 0.67 + 1.3) * a;
  out.yaw = 0.02 * Math.sin(t * 0.43 + 0.4) * a;
  return out;
}

/** Planar point. */
export interface Point2 {
  readonly x: number;
  readonly z: number;
}

/**
 * The point on a landmark's footprint facing the viewer: from the footprint centre towards
 * `viewer`, `radius` out. Used as the "door" an in-world card comes out of when the model has
 * no marked door: the side the visitor is looking at.
 */
export function facingPoint(
  center: Point2,
  viewer: Point2,
  radius: number,
): Point2 {
  const dx = viewer.x - center.x;
  const dz = viewer.z - center.z;
  const length = Math.hypot(dx, dz);
  if (!(length > 1e-9)) return { x: center.x, z: center.z + radius };
  return {
    x: center.x + (dx / length) * radius,
    z: center.z + (dz / length) * radius,
  };
}
