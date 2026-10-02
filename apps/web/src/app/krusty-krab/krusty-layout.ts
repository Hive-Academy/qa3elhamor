import {
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
 * The Krusty Krab visit, composed for the screen at the stop's resting view: the restaurant in
 * the middle (the stop looks at it), the crab clerk up on the left, and a big wooden menu board
 * on two posts standing on the sand beside the restaurant, facing the visitor. Every service is
 * one row on its face. The board is placed by where its foot shows on screen: the seabed point
 * under it, so it stands on the sand at whatever depth that is.
 */
export interface KrustyLayoutSpec {
  readonly narrator: NarratorSpec;
  /** Where else the crab may float, in order, when the town hides its spot (`narrator-post.ts`). */
  readonly narratorAlternatives: readonly NarratorSpec[];
  readonly board: {
    /** The board's middle, as a fraction of the width. */
    readonly x: number;
    /** Where its posts meet the sand, as a fraction of the height. */
    readonly footY: number;
    /** On screen, from the sand to the top of its awning. */
    readonly height: PixelSize;
    /** The face's width over the whole stand's height. */
    readonly aspect: number;
    /** Fractions of the stand's height: the bare posts under the face, and the face. */
    readonly legs: number;
    readonly face: number;
    /**
     * A selected row comes `towards` the visitor (a fraction of the way, along the line of sight)
     * and grows by `zoom` on top. Less on a phone, where the board already fills the width.
     */
    readonly present: { readonly towards: number; readonly zoom: number };
  };
}

/** Wide screens: the crab over the sand on the left, the board between it and the restaurant. */
export const KRUSTY_LANDSCAPE: KrustyLayoutSpec = {
  narrator: {
    x: 0.15,
    y: 0.5,
    height: { ofHeight: 0.13, ofWidth: 0.09, min: 72, max: 132 },
    // In front of the Chum Bucket, which stands at the left edge of this view.
    depth: 0.55,
  },
  // Over the restaurant, right of the board.
  narratorAlternatives: [
    {
      x: 0.64,
      y: 0.3,
      height: { ofHeight: 0.13, ofWidth: 0.09, min: 72, max: 132 },
      depth: 0.6,
    },
  ],
  board: {
    x: 0.4,
    footY: 0.86,
    height: { ofHeight: 0.5, ofWidth: 0.3, min: 300, max: 440 },
    aspect: 0.82,
    legs: 0.19,
    face: 0.67,
    present: { towards: 0.14, zoom: 1.12 },
  },
};

/**
 * Portrait phones: the crab up on the left, its bubble over the open water; the board across
 * the lower half, in front of the restaurant, which shows over its awning.
 */
export const KRUSTY_PORTRAIT: KrustyLayoutSpec = {
  narrator: {
    x: 0.22,
    y: 0.4,
    height: { ofHeight: 0.085, ofWidth: 0.19, min: 56, max: 96 },
    depth: 0.6,
  },
  // Over the open water on the right, above the board.
  narratorAlternatives: [
    {
      x: 0.76,
      y: 0.4,
      height: { ofHeight: 0.085, ofWidth: 0.19, min: 56, max: 96 },
      depth: 0.6,
    },
  ],
  board: {
    x: 0.5,
    footY: 0.895,
    height: { ofHeight: 0.44, ofWidth: 0.96, min: 280, max: 400 },
    aspect: 0.9,
    legs: 0.1,
    face: 0.78,
    present: { towards: 0.06, zoom: 1.05 },
  },
};

export const krustyLayoutSpecFor = (aspect: number): KrustyLayoutSpec =>
  isPortrait(aspect) ? KRUSTY_PORTRAIT : KRUSTY_LANDSCAPE;

/** The menu board in the world: one per visit, shared by every row's slot. */
export interface MenuBoardPlacement {
  /** The middle between its posts, on the seabed (world). */
  readonly foot: Vec3;
  /** Heading of its face (radians about +Y, 0 = +Z): towards the visitor. */
  readonly yaw: number;
  /** From the sand to the top of the awning (world). */
  readonly height: number;
  /** The face's width, its height, and the height of its bottom edge above the sand (world). */
  readonly width: number;
  readonly face: number;
  readonly legs: number;
  /** The seabed's height (world y): the board rises out of it. */
  readonly ground: number;
  /** The eye the board is composed for (world): a selected row comes towards it. */
  readonly eye: Vec3;
  /** The fraction of the way to the eye a selected row comes, along the line of sight. */
  readonly towards: number;
  /** How much a selected row grows, on top of coming nearer. */
  readonly zoom: number;
}

/** One service: a row on the board's face. */
export interface MenuRowSlot {
  readonly board: MenuBoardPlacement;
  readonly index: number;
  readonly count: number;
  /** The row's middle, above the sand (world, on the board's centre line). */
  readonly centre: number;
  readonly width: number;
  readonly height: number;
}

/** Thickness of the board's face over its width. */
export const FACE_DEPTH = 0.06;
/** The face's margin above the first row and under the last, as a fraction of its height. */
const FACE_PAD = 0.055;
/** A row's drawn height over its share of the face, and its width over the face's. */
const ROW_FILL = 0.86;
const ROW_WIDTH = 0.88;

/** The rows on a face `face` tall whose bottom is `legs` above the sand, the first on top. */
export function menuRows(
  board: MenuBoardPlacement,
  count: number,
): MenuRowSlot[] {
  const pad = board.face * FACE_PAD;
  const share = (board.face - 2 * pad) / Math.max(count, 1);
  const top = board.legs + board.face - pad;
  return Array.from({ length: count }, (_, index) => ({
    board,
    index,
    count,
    centre: top - (index + 0.5) * share,
    width: board.width * ROW_WIDTH,
    height: share * ROW_FILL,
  }));
}

/**
 * How far a row comes out of the face when it is `selected` of the way presented (0 to 1), in
 * the board's own axes: `up` and `out` (towards the visitor, horizontally). It travels along
 * the line of sight, so it stays where it was on screen and only looks bigger: a zoom.
 */
export function rowLift(
  slot: MenuRowSlot,
  selected: number,
): { readonly up: number; readonly out: number } {
  const { board } = slot;
  const face = flushCentre(slot);
  const across = Math.hypot(board.eye[0] - face[0], board.eye[2] - face[2]);
  const f = board.towards * selected;
  return { up: (board.eye[1] - face[1]) * f, out: across * f };
}

/** A row's middle (world) on the face, flush with it. */
const flushCentre = (slot: MenuRowSlot): Vec3 => {
  const { board } = slot;
  const z = (board.width * FACE_DEPTH) / 2;
  return [
    board.foot[0] + Math.sin(board.yaw) * z,
    board.ground + slot.centre,
    board.foot[2] + Math.cos(board.yaw) * z,
  ];
};

/** Where a row's middle is (world), `selected` of the way presented (0 = flush with the face). */
export function rowCentre(slot: MenuRowSlot, selected: number): Vec3 {
  const { board } = slot;
  const { up, out } = rowLift(slot, selected);
  const z = (board.width * FACE_DEPTH) / 2 + out;
  return [
    board.foot[0] + Math.sin(board.yaw) * z,
    board.ground + slot.centre + up,
    board.foot[2] + Math.cos(board.yaw) * z,
  ];
}

/**
 * The Krusty Krab visit placed in the world for `view` (the stop's resting view). `ground` is
 * the seabed's height there (world y): the board stands on it, and the narrator stays above it.
 */
export function krustyLayout(
  view: ViewFrame,
  count: number,
  ground: number,
  spec: KrustyLayoutSpec = krustyLayoutSpecFor(view.width / view.height),
): VisitLayout<MenuRowSlot> {
  const { width, height } = view;
  const b = spec.board;
  const heightPx = pixelSize(b.height, width, height);
  const at = groundPointAtScreen(
    view,
    b.x * width,
    b.footY * height,
    ground,
    view.focusDepth * 3,
  );
  const tall = heightPx * worldPerPx(view, at.depth);
  const foot = at.point;
  const board: MenuBoardPlacement = {
    foot,
    yaw: yawTowards(foot, view.eye),
    height: tall,
    width: tall * b.aspect,
    face: tall * b.face,
    legs: tall * b.legs,
    ground,
    eye: view.eye,
    towards: b.present.towards,
    zoom: b.present.zoom,
  };
  return {
    narrator: placeNarrator(view, spec.narrator, ground),
    narratorAlternatives: spec.narratorAlternatives.map((alternative) =>
      placeNarrator(view, alternative, ground),
    ),
    slots: menuRows(board, count),
  };
}
