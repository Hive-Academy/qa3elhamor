import { pointAtScreenAbove, worldPerPx, type Vec3, type ViewFrame } from '../narrators/view-layout';
import {
  isPortrait,
  pixelSize,
  placeNarrator,
  type NarratorPlacement,
  type NarratorSpec,
  type PixelSize,
  type ScreenFraction,
} from '../narrators/visit-layout';

/**
 * The Pineapple visit, composed for the screen at the stop's resting view: the pineapple sits
 * in the middle (the stop looks at it), the narrator beside it, the skill bubbles around it.
 * `depth` is a fraction of the distance to the stop's focus: below 1 is in front of the
 * pineapple.
 */
export interface PineappleLayoutSpec {
  readonly narrator: NarratorSpec;
  readonly bubbles: {
    /** One per bubble, in order; extra bubbles share the last slots' ring (see `ringSlots`). */
    readonly slots: readonly ScreenFraction[];
    readonly diameter: PixelSize;
    readonly depth: number;
  };
}

/** Wide screens: the narrator talks from the left, the bubbles arc round the right. */
export const PINEAPPLE_LANDSCAPE: PineappleLayoutSpec = {
  narrator: {
    x: 0.27,
    y: 0.66,
    height: { ofHeight: 0.13, ofWidth: 0.09, min: 72, max: 132 },
    depth: 0.8,
  },
  bubbles: {
    slots: [
      { x: 0.455, y: 0.31 },
      { x: 0.595, y: 0.27 },
      { x: 0.715, y: 0.4 },
      { x: 0.76, y: 0.58 },
      { x: 0.695, y: 0.75 },
      { x: 0.6, y: 0.83 },
    ],
    diameter: { ofHeight: 0.125, ofWidth: 0.08, min: 84, max: 128 },
    depth: 0.84,
  },
};

/** Portrait phones: the narrator above the pineapple, its bubble at the top, skills around. */
export const PINEAPPLE_PORTRAIT: PineappleLayoutSpec = {
  narrator: {
    x: 0.3,
    y: 0.42,
    height: { ofHeight: 0.085, ofWidth: 0.19, min: 56, max: 96 },
    depth: 0.8,
  },
  bubbles: {
    slots: [
      { x: 0.77, y: 0.415 },
      { x: 0.8, y: 0.56 },
      { x: 0.68, y: 0.705 },
      { x: 0.32, y: 0.705 },
      { x: 0.2, y: 0.56 },
      { x: 0.5, y: 0.81 },
    ],
    diameter: { ofHeight: 0.105, ofWidth: 0.23, min: 78, max: 108 },
    depth: 0.8,
  },
};

export const pineappleLayoutSpecFor = (aspect: number): PineappleLayoutSpec =>
  isPortrait(aspect) ? PINEAPPLE_PORTRAIT : PINEAPPLE_LANDSCAPE;

/**
 * Slots for `count` bubbles: the spec's slots, then more on an ellipse through the spec's
 * extent if there are more groups than slots (content may add one). Never empty for count > 0.
 */
export function ringSlots(
  slots: readonly ScreenFraction[],
  count: number,
): ScreenFraction[] {
  if (count <= slots.length) return slots.slice(0, count);
  const extra = count - slots.length;
  const fill = Array.from({ length: extra }, (_, i) => {
    const angle = Math.PI * (0.6 + (1.2 * (i + 0.5)) / extra);
    return { x: 0.5 + 0.36 * Math.cos(angle), y: 0.5 - 0.36 * Math.sin(angle) };
  });
  return [...slots, ...fill];
}

export interface PineappleLayout {
  readonly narrator: NarratorPlacement;
  readonly bubbles: readonly {
    readonly centre: Vec3;
    readonly radius: number;
  }[];
}

/**
 * The Pineapple visit placed in the world for `view` (the stop's resting view). `ground` is the
 * seabed's height there (world y): nothing is placed under it. Low on a screen that looks down,
 * a slot comes nearer the eye instead, along its line of sight, keeping its size on screen.
 */
export function pineappleLayout(
  view: ViewFrame,
  count: number,
  ground: number,
  spec: PineappleLayoutSpec = pineappleLayoutSpecFor(view.width / view.height),
): PineappleLayout {
  const { width, height } = view;
  const b = spec.bubbles;
  const radiusPx = pixelSize(b.diameter, width, height) / 2;
  const bubbles = ringSlots(b.slots, count).map((slot, i) => {
    // A little depth variety, so the bubbles do not sit on one flat sheet.
    const depth = view.focusDepth * b.depth * (1 + (i % 2 === 0 ? -0.025 : 0.025));
    const clear = radiusPx * worldPerPx(view, depth) * 1.3;
    const at = pointAtScreenAbove(view, slot.x * width, slot.y * height, depth, ground + clear);
    return { centre: at.point, radius: radiusPx * worldPerPx(view, at.depth) };
  });
  return { narrator: placeNarrator(view, spec.narrator, ground), bubbles };
}
