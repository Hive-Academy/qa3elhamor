/**
 * Aspect-aware framing. The camera's vertical field of view is fixed, so a portrait phone
 * sees a much narrower slice of the scene than a desktop: a landmark framed for 16:10 is
 * cropped at the sides on a 390 px phone. Near a stop, the dive pulls the camera back along
 * its line of sight by `framingScale` so the subject keeps its width in frame.
 */
export interface DiveFramingOptions {
  /** Aspect (width / height) the route is authored for; at or above it nothing changes. */
  readonly referenceAspect: number;
  /**
   * How much of the lost width to win back, in [0, 1]: 1 keeps the subject's full width
   * (and makes it small in a tall frame), 0 disables the pull-back.
   */
  readonly strength: number;
  /** Upper bound on the distance multiplier, so terrain behind the camera stays behind it. */
  readonly maxScale: number;
}

export const DIVE_FRAMING_DEFAULTS: DiveFramingOptions = {
  referenceAspect: 1.6,
  strength: 0.55,
  maxScale: 2,
};

/**
 * Multiplier for the camera's distance to its subject at `aspect`: always a finite number of
 * at least 1, whatever it is given. A degenerate aspect counts as wide (1), and an option that
 * is not a usable number falls back to its `DIVE_FRAMING_DEFAULTS` value, so a bad config can
 * never put NaN into the camera.
 */
export function framingScale(aspect: number, options: DiveFramingOptions = DIVE_FRAMING_DEFAULTS): number {
  const referenceAspect = usable(options.referenceAspect, (v) => v > 0, DIVE_FRAMING_DEFAULTS.referenceAspect);
  const strength = usable(options.strength, (v) => v >= 0, DIVE_FRAMING_DEFAULTS.strength);
  const maxScale = usable(options.maxScale, (v) => v >= 1, DIVE_FRAMING_DEFAULTS.maxScale);
  if (!(aspect > 0) || !Number.isFinite(aspect) || aspect >= referenceAspect) return 1;
  return Math.min(maxScale, Math.pow(referenceAspect / aspect, strength));
}

const usable = (value: number, ok: (v: number) => boolean, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && ok(value) ? value : fallback;
