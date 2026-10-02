import type { LandmarkDefinition } from '@qa3elhamor/landmarks-domain';
import type { QualityTier } from '@qa3elhamor/world-domain';
import type { TourConfig } from '../../site.config';

/*
 * Whether this visit starts with the intro, and what the journey's stops are. Pure, except for
 * the two storage helpers, which take the storage they use.
 */

/** Where the visitor's choice is kept between visits. */
export const TOUR_STORAGE_KEY = 'qa3elhamor:tour';

/** `done`: they took the journey to its last stop. `skipped`: they chose to explore on their own. */
export type TourChoice = 'done' | 'skipped';

export const parseTourChoice = (
  value: string | null | undefined,
): TourChoice | null =>
  value === 'done' || value === 'skipped' ? value : null;

/** The slice of `Storage` the tour uses; `localStorage` in the browser. */
export type TourStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The remembered choice; storage that throws (blocked) reads as none. */
export function readTourChoice(storage: TourStorage | null): TourChoice | null {
  try {
    return parseTourChoice(storage?.getItem(TOUR_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Remembers `choice`; a finished journey is never downgraded to "skipped" by a later replay. */
export function writeTourChoice(
  storage: TourStorage | null,
  choice: TourChoice,
): void {
  try {
    if (choice === 'skipped' && readTourChoice(storage) === 'done') return;
    storage?.setItem(TOUR_STORAGE_KEY, choice);
  } catch {
    // Blocked storage: the choice lasts this visit only.
  }
}

/** `?tour=on` forces the intro (even for automated browsers and returning visitors); `?tour=off` turns it all off. */
export type TourParam = 'on' | 'off' | null;

export function tourParam(search: string): TourParam {
  const value = new URLSearchParams(search).get('tour');
  return value === 'on' || value === 'off' ? value : null;
}

/**
 * - `intro`: the title and "Begin the journey" / "Explore on my own".
 * - `replay`: the free dive, with a small "Replay the journey" button.
 * - `off`: the free dive and nothing else.
 */
export type TourEntry = 'intro' | 'replay' | 'off';

export interface TourEntryConditions {
  readonly enabled: boolean;
  readonly param: TourParam;
  /**
   * The browser is driven by automation (`navigator.webdriver`): the end-to-end suite expects
   * the free dive on load, so the tour stays off unless `?tour=on` asks for it.
   */
  readonly automated: boolean;
  readonly stored: TourChoice | null;
}

export function tourEntry({
  enabled,
  param,
  automated,
  stored,
}: TourEntryConditions): TourEntry {
  if (!enabled || param === 'off') return 'off';
  if (param === 'on') return 'intro';
  if (automated) return 'off';
  return stored ? 'replay' : 'intro';
}

/**
 * `cinematic`: the extruded 3D title over the surface (medium and high tiers). `card`: a flat
 * card with the same words and buttons, for reduced motion and the low tier.
 */
export type IntroStyle = 'cinematic' | 'card';

export const introStyle = ({
  reducedMotion,
  tier,
}: {
  readonly reducedMotion: boolean;
  readonly tier: QualityTier;
}): IntroStyle => (reducedMotion || tier === 'low' ? 'card' : 'cinematic');

/** One stop of the journey: a landmark, its dive waypoint, its name and caption. */
export type TourStop = Pick<
  LandmarkDefinition,
  'id' | 'waypoint' | 'label' | 'caption'
>;

type StopSource = TourStop;

/**
 * The journey's stops: `config.stops` in its order, or every landmark in dive order (by its
 * waypoint's place on the dive, `progressOf`). An unknown or repeated id is a config error and
 * throws at startup, like a broken landmark.
 */
export function tourStops(
  config: TourConfig,
  landmarks: readonly StopSource[],
  progressOf: (waypoint: string) => number,
): TourStop[] {
  const toStop = ({ id, waypoint, label, caption }: StopSource): TourStop => ({
    id,
    waypoint,
    label,
    caption,
  });
  if (!config.stops) {
    return [...landmarks]
      .sort((a, b) => progressOf(a.waypoint) - progressOf(b.waypoint))
      .map(toStop);
  }
  const issues: string[] = [];
  const seen = new Set<string>();
  const stops: TourStop[] = [];
  for (const id of config.stops) {
    const landmark = landmarks.find((candidate) => candidate.id === id);
    if (!landmark) issues.push(`unknown landmark "${id}"`);
    else if (seen.has(id)) issues.push(`"${id}" is listed twice`);
    else stops.push(toStop(landmark));
    seen.add(id);
  }
  if (issues.length > 0)
    throw new Error(
      `Invalid TOUR.stops in site.config.ts: ${issues.join('; ')}.`,
    );
  return stops;
}
