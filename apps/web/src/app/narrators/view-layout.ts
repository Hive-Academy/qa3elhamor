/*
 * Composing a landmark visit for the screen, then placing it in the world. Things around a
 * landmark (its narrator, its content objects) are designed in screen terms (where on the
 * viewport, how many pixels big) for the camera's resting view at the landmark's stop, and
 * turned into world positions and sizes once. They are then ordinary 3D objects: the camera's
 * sway gives them parallax, and they stay put if the camera moves on.
 *
 * Pure and allocation-light; no three.js, so it is cheap to test.
 */

export type Vec3 = readonly [number, number, number];

/** The camera's resting view at a stop, as the dive frames it for the current viewport. */
export interface ViewFrame {
  readonly eye: Vec3;
  /** Unit vectors: screen right, screen up, and into the screen. */
  readonly right: Vec3;
  readonly up: Vec3;
  readonly forward: Vec3;
  /** Focal length in CSS pixels: a unit at depth `d` is `focalPx / d` pixels. */
  readonly focalPx: number;
  readonly width: number;
  readonly height: number;
  /** Distance from the eye to the stop's focus point, along `forward`. */
  readonly focusDepth: number;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: Vec3, fallback: Vec3): Vec3 => {
  const l = length(a);
  return l > 1e-9 && Number.isFinite(l)
    ? [a[0] / l, a[1] / l, a[2] / l]
    : fallback;
};
/** `a + b * s`. */
export const addScaled = (a: Vec3, b: Vec3, s: number): Vec3 => [
  a[0] + b[0] * s,
  a[1] + b[1] * s,
  a[2] + b[2] * s,
];

const usable = (n: number): boolean => Number.isFinite(n) && n > 0;

/**
 * The view from `eye` towards `focus` with a vertical field of view of `fovDeg`, on `viewport`.
 * `pullBack` (at least 1) moves the eye back along its line of sight, as the dive does on
 * portrait screens (`framingScale` in `@qa3elhamor/dive-feature`). Degenerate input (a zero
 * line of sight, a collapsed viewport) gives a usable frame rather than NaN.
 */
export function viewFrame(
  eye: Vec3,
  focus: Vec3,
  fovDeg: number,
  viewport: Viewport,
  pullBack = 1,
): ViewFrame {
  const back = usable(pullBack) ? Math.max(pullBack, 1) : 1;
  const sight = sub(focus, eye);
  const forward = normalize(sight, [0, 0, -1]);
  const right = normalize(cross(forward, [0, 1, 0]), [1, 0, 0]);
  const up = cross(right, forward);
  const width = usable(viewport.width) ? viewport.width : 1;
  const height = usable(viewport.height) ? viewport.height : 1;
  const fov = usable(fovDeg) && fovDeg < 179 ? fovDeg : 55;
  const focalPx = height / 2 / Math.tan((fov * Math.PI) / 360);
  const distance = length(sight) * back;
  return {
    eye: addScaled(focus, forward, -distance),
    right,
    up,
    forward,
    focalPx,
    width,
    height,
    focusDepth: distance,
  };
}

/** World units per CSS pixel at `depth` in front of the eye. */
export const worldPerPx = (view: ViewFrame, depth: number): number =>
  usable(depth) ? depth / view.focalPx : 0;

/**
 * The world point at `depth` in front of the eye that shows at screen point (`x`, `y`), in CSS
 * pixels from the viewport's top left.
 */
export function pointAtScreen(
  view: ViewFrame,
  x: number,
  y: number,
  depth: number,
): Vec3 {
  const perPx = worldPerPx(view, depth);
  const centre = addScaled(view.eye, view.forward, depth);
  return addScaled(
    addScaled(centre, view.right, (x - view.width / 2) * perPx),
    view.up,
    (view.height / 2 - y) * perPx,
  );
}

/**
 * `pointAtScreen`, but never lower than `minY`: when the point at `depth` would be under the
 * seabed (low on a screen looking down), it comes along the same line of sight towards the
 * eye until it is `minY` high, so it still shows at (`x`, `y`). Returns the point and its depth.
 */
export function pointAtScreenAbove(
  view: ViewFrame,
  x: number,
  y: number,
  depth: number,
  minY: number,
): { readonly point: Vec3; readonly depth: number } {
  const far = pointAtScreen(view, x, y, depth);
  const drop = view.eye[1] - far[1];
  if (far[1] >= minY || !(drop > 1e-9) || !(view.eye[1] > minY))
    return { point: far, depth };
  const near = depth * ((view.eye[1] - minY) / drop);
  return { point: pointAtScreen(view, x, y, near), depth: near };
}

/** Where a world point shows, in CSS pixels from the top left, and its depth. */
export function screenOf(
  view: ViewFrame,
  point: Vec3,
): { readonly x: number; readonly y: number; readonly depth: number } {
  const rel = sub(point, view.eye);
  const depth = dot(rel, view.forward);
  if (!(depth > 1e-6)) return { x: Number.NaN, y: Number.NaN, depth };
  const scale = view.focalPx / depth;
  return {
    x: view.width / 2 + dot(rel, view.right) * scale,
    y: view.height / 2 - dot(rel, view.up) * scale,
    depth,
  };
}

/** Heading (radians about +Y, 0 = +Z) from `from` towards `to`, on the ground plane. */
export const yawTowards = (from: Vec3, to: Vec3): number =>
  Math.atan2(to[0] - from[0], to[2] - from[2]);

/** Evenly spaced angles (degrees) from `start` to `end`, both included; one: their middle. */
export function spreadAngles(
  count: number,
  start: number,
  end: number,
): number[] {
  if (!(count > 0)) return [];
  if (count === 1) return [(start + end) / 2];
  return Array.from(
    { length: count },
    (_, i) => start + ((end - start) * i) / (count - 1),
  );
}
