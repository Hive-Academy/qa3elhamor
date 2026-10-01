import type { QualityTier } from '@qa3elhamor/world-domain';

/** What decides whether the page runs in-world presentations. */
export interface InWorldConditions {
  /** `prefers-reduced-motion: reduce`: no flights, no bobbing, no bubble curtain. */
  readonly reducedMotion: boolean;
  /** The live quality tier: the low tier keeps the cheaper DOM dialogs. */
  readonly tier: QualityTier;
  /** Whether the browser can create a WebGL context at all. */
  readonly webgl: boolean;
}

/**
 * Whether in-world landmark presentations (the Pineapple's floating card and its successors)
 * run on this page. Everywhere else the landmark kernel falls back to each landmark's DOM
 * dialog overlay, which carries the same content (`LandmarkProvider inWorld`).
 */
export const inWorldAvailable = ({
  reducedMotion,
  tier,
  webgl,
}: InWorldConditions): boolean => webgl && !reducedMotion && tier !== 'low';
