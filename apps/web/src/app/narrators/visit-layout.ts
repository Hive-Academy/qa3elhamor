import {
  addScaled,
  pointAtScreenAbove,
  worldPerPx,
  yawTowards,
  type Vec3,
  type ViewFrame,
} from './view-layout';

/*
 * The parts of a visit's composition every landmark shares: pixel sizes relative to the
 * viewport, the narrator's post, and points on the seabed under a spot on the screen. Each
 * landmark writes its own layout spec (where its content objects go) on top of these.
 */

/** A point on the viewport as fractions of its width and height, from the top left. */
export interface ScreenFraction {
  readonly x: number;
  readonly y: number;
}

/** A pixel size relative to the viewport: the smaller of two fractions, clamped. */
export interface PixelSize {
  readonly ofHeight: number;
  readonly ofWidth: number;
  readonly min: number;
  readonly max: number;
}

export const pixelSize = (size: PixelSize, width: number, height: number): number =>
  Math.min(Math.max(Math.min(size.ofHeight * height, size.ofWidth * width), size.min), size.max);

/** Below this aspect (width / height) a visit uses its portrait composition. */
export const PORTRAIT_BELOW_ASPECT = 0.9;

export const isPortrait = (aspect: number): boolean => aspect < PORTRAIT_BELOW_ASPECT;

/**
 * Where the narrator floats, on screen: `x`/`y` its middle, `height` how tall it looks, `depth`
 * a fraction of the distance to the stop's focus (below 1 is in front of the landmark).
 */
export interface NarratorSpec extends ScreenFraction {
  readonly height: PixelSize;
  readonly depth: number;
}

/** The narrator placed in the world: what `<LandmarkNarrator>` and the bubble need. */
export interface NarratorPlacement {
  /** Its post: belly (or feet) on this point. */
  readonly post: Vec3;
  /** Height of the original cast, world units (a bundled model scales from it). */
  readonly height: number;
  /** Facing the eye. */
  readonly restYaw: number;
  /** Swims in from off screen left, and away up and left: multiples of its height. */
  readonly enterFrom: Vec3;
  readonly exitTo: Vec3;
}

/**
 * The narrator at `spec` for `view`, never sunk under `ground` (world y): low on a screen that
 * looks down, it comes nearer the eye along its line of sight instead, keeping its screen spot.
 */
export function placeNarrator(
  view: ViewFrame,
  spec: NarratorSpec,
  ground: number,
): NarratorPlacement {
  const { width, height } = view;
  const narratorPx = pixelSize(spec.height, width, height);
  const roughHeight = narratorPx * worldPerPx(view, view.focusDepth * spec.depth);
  // The slot is the narrator's middle on screen; its post is half its height lower.
  const placed = pointAtScreenAbove(
    view,
    spec.x * width,
    spec.y * height + narratorPx / 2,
    view.focusDepth * spec.depth,
    ground + roughHeight * 0.3,
  );
  const post = placed.point;
  const away = (lift: number): Vec3 => {
    const sideways = addScaled([0, 0, 0], view.right, -7);
    return [sideways[0], lift, sideways[2]];
  };
  return {
    post,
    height: narratorPx * worldPerPx(view, placed.depth),
    restYaw: yawTowards(post, view.eye),
    enterFrom: away(0.8),
    exitTo: away(2.6),
  };
}

/**
 * The seabed point (world y `ground`) that shows at screen point (`x`, `y`), and its depth: for
 * things that stand on the sand. A line of sight that does not come down to the seabed within
 * `maxDepth` (looking level, or up) gives the point at `maxDepth` instead, floating.
 */
export function groundPointAtScreen(
  view: ViewFrame,
  x: number,
  y: number,
  ground: number,
  maxDepth: number,
): { readonly point: Vec3; readonly depth: number } {
  return pointAtScreenAbove(view, x, y, maxDepth, ground);
}
