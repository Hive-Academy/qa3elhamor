import type { ViewFrame } from '../narrators/view-layout';
import {
  isPortrait,
  pixelSize,
  placeNarrator,
  type NarratorPlacement,
  type NarratorSpec,
  type PixelSize,
} from '../narrators/visit-layout';

/**
 * The Bureau visit, composed for the screen at the stop's resting view: the Bureau in the middle
 * (the stop looks at it), the Sardine President up on the left, and the clerk window with its
 * pneumatic tube on the Bureau's side facing the visitor (placed on the model, sized here).
 */
export interface BureauLayoutSpec {
  readonly narrator: NarratorSpec;
  /** The clerk window's width on screen. */
  readonly window: PixelSize;
  /** The bottle's height on screen as it lets go. */
  readonly bottle: PixelSize;
}

/** Wide screens: the President over the rocks on the left, clear of the unrolled scroll. */
export const BUREAU_LANDSCAPE: BureauLayoutSpec = {
  narrator: {
    x: 0.16,
    y: 0.42,
    height: { ofHeight: 0.13, ofWidth: 0.09, min: 72, max: 132 },
    depth: 0.8,
  },
  window: { ofHeight: 0.16, ofWidth: 0.1, min: 96, max: 150 },
  bottle: { ofHeight: 0.24, ofWidth: 0.16, min: 120, max: 220 },
};

/** Portrait phones: the President on the left, low enough for his bubble to fit above him. */
export const BUREAU_PORTRAIT: BureauLayoutSpec = {
  narrator: {
    x: 0.24,
    y: 0.5,
    height: { ofHeight: 0.085, ofWidth: 0.19, min: 56, max: 96 },
    depth: 0.8,
  },
  window: { ofHeight: 0.11, ofWidth: 0.26, min: 80, max: 110 },
  bottle: { ofHeight: 0.2, ofWidth: 0.4, min: 110, max: 170 },
};

export const bureauLayoutSpecFor = (aspect: number): BureauLayoutSpec =>
  isPortrait(aspect) ? BUREAU_PORTRAIT : BUREAU_LANDSCAPE;

export interface BureauLayout {
  readonly narrator: NarratorPlacement;
  /** The clerk window's width, CSS pixels. */
  readonly windowPx: number;
  /** The bottle's height, CSS pixels. */
  readonly bottlePx: number;
}

/** The Bureau visit for `view` (the stop's resting view); `ground` is the seabed there. */
export function bureauLayout(
  view: ViewFrame,
  ground: number,
  spec: BureauLayoutSpec = bureauLayoutSpecFor(view.width / view.height),
): BureauLayout {
  const { width, height } = view;
  return {
    narrator: placeNarrator(view, spec.narrator, ground),
    windowPx: pixelSize(spec.window, width, height),
    bottlePx: pixelSize(spec.bottle, width, height),
  };
}
