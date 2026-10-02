import {
  addScaled,
  worldPerPx,
  yawTowards,
  type Vec3,
  type ViewFrame,
} from '../narrators/view-layout';
import {
  groundPointAtScreen,
  isPortrait,
  pixelSize,
  placeNarrator,
  type NarratorSpec,
  type PixelSize,
} from '../narrators/visit-layout';
import type { VisitLayout } from '../narrators/visit-types';

/**
 * The Tiki visit, composed for the screen at the stop's resting view: the tiki head in the
 * middle (the stop looks at it), the narrator up on the left, and one stone tablet per job
 * standing on the sand in front of the tiki, in a shallow fan (or two rows on a phone). Tablets
 * are placed by where their foot shows on screen: the seabed point under it, so they stand on
 * the sand at whatever depth that is.
 */
export interface TikiLayoutSpec {
  readonly narrator: NarratorSpec;
  readonly tablets: {
    /** The leftmost and rightmost tablet centres, as fractions of the width. */
    readonly left: number;
    readonly right: number;
    /** Where the nearest row's feet show, as a fraction of the height. */
    readonly footY: number;
    /** Each row further back shows its feet this much higher (a fraction of the height). */
    readonly rowStep: number;
    /** Outer tablets of a row stand this much further back (a fraction of the height). */
    readonly arc: number;
    readonly perRow: number;
    readonly height: PixelSize;
    /** Width over height. */
    readonly aspect: number;
    /** Outer tablets turn this far (radians) away from the middle, like a fanned hand. */
    readonly fanYaw: number;
    /**
     * A selected tablet comes `towards` the visitor (a fraction of its distance) and lifts off
     * the sand (a fraction of its height). Less on a phone, where it would leave the screen.
     */
    readonly present: { readonly towards: number; readonly lift: number };
  };
}

/** Wide screens: the narrator over the rock on the left, the tablets fanned before the tiki. */
export const TIKI_LANDSCAPE: TikiLayoutSpec = {
  narrator: {
    x: 0.17,
    y: 0.43,
    height: { ofHeight: 0.13, ofWidth: 0.09, min: 72, max: 132 },
    depth: 0.8,
  },
  tablets: {
    left: 0.3,
    right: 0.7,
    footY: 0.885,
    rowStep: 0.2,
    arc: 0.035,
    perRow: 4,
    height: { ofHeight: 0.205, ofWidth: 0.125, min: 150, max: 200 },
    aspect: 0.82,
    fanYaw: 0.26,
    present: { towards: 0.13, lift: 0.1 },
  },
};

/**
 * Portrait phones: the narrator on the left, low enough that its bubble (tall while it reads a
 * job's highlights) fits above it; two rows of wider slabs before the tiki.
 */
export const TIKI_PORTRAIT: TikiLayoutSpec = {
  narrator: {
    x: 0.22,
    y: 0.465,
    height: { ofHeight: 0.085, ofWidth: 0.19, min: 56, max: 96 },
    depth: 0.8,
  },
  tablets: {
    left: 0.245,
    right: 0.755,
    footY: 0.89,
    rowStep: 0.185,
    arc: 0,
    perRow: 2,
    height: { ofHeight: 0.165, ofWidth: 0.36, min: 118, max: 142 },
    aspect: 1.15,
    fanYaw: 0.16,
    present: { towards: 0.05, lift: 0.06 },
  },
};

export const tikiLayoutSpecFor = (aspect: number): TikiLayoutSpec =>
  isPortrait(aspect) ? TIKI_PORTRAIT : TIKI_LANDSCAPE;

/** One tablet, standing on the sand. */
export interface TabletSlot {
  /** The middle of its foot, on the seabed (world). */
  readonly foot: Vec3;
  readonly width: number;
  readonly height: number;
  readonly thickness: number;
  /** Heading of its face (radians about +Y, 0 = +Z). */
  readonly yaw: number;
  /** How much of its width the visitor sees (its turn away from the eye). */
  readonly facing: number;
  /** Where it moves while selected, relative to its foot: towards the visitor and up. */
  readonly presented: Vec3;
  /** The seabed's height (world y): the tablet rises out of it. */
  readonly ground: number;
}

/** Screen fractions of each tablet's foot: rows of `perRow`, the first (newest) row furthest back. */
export function tabletFeet(
  spec: TikiLayoutSpec['tablets'],
  count: number,
): { readonly x: number; readonly y: number; readonly outer: number }[] {
  const rows = Math.max(Math.ceil(count / spec.perRow), 1);
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / spec.perRow);
    const inRow = Math.min(spec.perRow, count - row * spec.perRow);
    const column = i - row * spec.perRow;
    // -1 at the left end of the row, 1 at the right; 0 for a lone tablet.
    const outer = inRow > 1 ? (2 * column) / (inRow - 1) - 1 : 0;
    const x = (spec.left + spec.right) / 2 + (outer * (spec.right - spec.left)) / 2;
    const y = spec.footY - spec.rowStep * (rows - 1 - row) - spec.arc * outer * outer;
    return { x, y, outer };
  });
}

/** Thickness over height. */
const THICKNESS = 0.16;

/**
 * The Tiki visit placed in the world for `view` (the stop's resting view). `ground` is the
 * seabed's height there (world y): tablets stand on it, and the narrator stays above it.
 */
export function tikiLayout(
  view: ViewFrame,
  count: number,
  ground: number,
  spec: TikiLayoutSpec = tikiLayoutSpecFor(view.width / view.height),
): VisitLayout<TabletSlot> {
  const { width, height } = view;
  const t = spec.tablets;
  const heightPx = pixelSize(t.height, width, height);
  const slots = tabletFeet(t, count).map(({ x, y, outer }) => {
    const at = groundPointAtScreen(view, x * width, y * height, ground, view.focusDepth * 3);
    const perPx = worldPerPx(view, at.depth);
    const tall = heightPx * perPx;
    const foot = at.point;
    const toEye = yawTowards(foot, view.eye);
    // Turned out from the middle, like a fanned hand of cards.
    const fan = -t.fanYaw * outer;
    const towards: Vec3 = [view.eye[0] - foot[0], 0, view.eye[2] - foot[2]];
    const presented = addScaled(
      [towards[0] * t.present.towards, 0, towards[2] * t.present.towards],
      [0, 1, 0],
      tall * t.present.lift,
    );
    return {
      foot,
      width: tall * t.aspect,
      height: tall,
      thickness: tall * THICKNESS,
      yaw: toEye + fan,
      facing: Math.cos(fan),
      presented,
      ground,
    };
  });
  return { narrator: placeNarrator(view, spec.narrator, ground), slots };
}
