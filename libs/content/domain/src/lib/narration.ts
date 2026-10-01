import type { LocalizedText } from './localized-text.js';

/** The landmarks in the underwater scene where a narrator swims up and speaks. */
export const NARRATION_LANDMARKS = [
  'pineapple',
  'tiki',
  'krusty-krab',
  'bureau',
] as const;

export type NarrationLandmarkId = (typeof NARRATION_LANDMARKS)[number];

/** Limits the speech bubble is designed for; the parser enforces them. */
export const NARRATION_LIMITS = {
  minLines: 2,
  maxLines: 5,
  /** Maximum English length of a line, hint or farewell. */
  maxEnLength: 140,
} as const;

/**
 * What the narrator says at one landmark.
 *
 * - `lines`: the main dialogue, typed out one bubble at a time.
 * - `hints`: comments about one object at the landmark, keyed by that object's stable id
 *   (at the pineapple, a skill group id from `SiteProfile.skills`).
 * - `farewell`: said when the visitor leaves the landmark.
 */
export interface LandmarkNarration {
  readonly lines: readonly LocalizedText[];
  readonly hints?: Readonly<Record<string, LocalizedText>>;
  readonly farewell?: LocalizedText;
}

/** Everything the narrators say, keyed by landmark. Read from `content/narration.json`. */
export interface Narration {
  readonly landmarks: Readonly<Record<NarrationLandmarkId, LandmarkNarration>>;
}
