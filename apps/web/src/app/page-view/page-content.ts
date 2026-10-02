import {
  credits,
  narration,
  profile,
  projectItems,
  resumeEntries,
  serviceItems,
  siteCopy,
} from '@qa3elhamor/content-data-access';
import {
  NARRATION_LANDMARKS,
  type Credit,
  type LandmarkNarration,
  type LocalizedText,
  type ProjectItem,
  type ResumeEntry,
  type ServiceItem,
  type SiteCopy,
  type SiteProfile,
} from '@qa3elhamor/content-domain';
import { LANDMARKS } from '../landmark-definitions';
import type { ComplaintSubmitter } from '../overlays/complaint-scroll';
import { COMPLAINT_SUBMITTER, WALL, type WallPort } from '../wall/wall-port';

/** What the narrators say at one landmark, under the landmark's own name. */
export interface NarrationStop {
  readonly id: string;
  readonly label: LocalizedText;
  readonly narration: LandmarkNarration;
}

/** Everything the dive carries, for the page to render without WebGL. */
export interface PageContent {
  readonly profile: SiteProfile;
  readonly copy: SiteCopy;
  readonly resume: readonly ResumeEntry[];
  /** In display order (`sortProjects`). */
  readonly projects: readonly ProjectItem[];
  readonly services: readonly ServiceItem[];
  /** Editorial credits (`content/credits.json`); the CC-BY model credits come from the manifest. */
  readonly credits: readonly Credit[];
  /** In the order the dive meets the landmarks. */
  readonly narration: readonly NarrationStop[];
  /** Delivers the Bureau's complaints: the same provider as the dive's form. */
  readonly submitter: ComplaintSubmitter;
  /** The public complaints wall, or `null` when it is off (then the page has no wall section). */
  readonly wall: WallPort | null;
}

/** Every narrated landmark, labelled as the dive labels it (the id when no landmark matches). */
export const narrationStops = (): NarrationStop[] =>
  NARRATION_LANDMARKS.map((id) => {
    // A landmark label may be a bare English string; content text is always the object form.
    const label = LANDMARKS.find((landmark) => landmark.id === id)?.label ?? id;
    return {
      id,
      label: typeof label === 'string' ? { en: label } : label,
      narration: narration.landmarks[id],
    };
  });

/** The page's content, read from the same validated content module as the dive. */
export function buildPageContent(
  submitter: ComplaintSubmitter = COMPLAINT_SUBMITTER,
  wall: WallPort | null = WALL,
): PageContent {
  return {
    profile,
    copy: siteCopy,
    resume: resumeEntries,
    projects: projectItems,
    services: serviceItems,
    credits,
    narration: narrationStops(),
    submitter,
    wall,
  };
}
