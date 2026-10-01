import {
  createLandmarkRegistry,
  formatLandmarkIssues,
  type LandmarkDefinition,
  type LandmarkRegistry,
} from '@qa3elhamor/landmarks-domain';
import type { LandmarkSceneRegistry } from '@qa3elhamor/landmarks-feature';
import type { LandmarkOverlayRegistry } from '@qa3elhamor/landmarks-ui';
import { profile, siteCopy } from '@qa3elhamor/content-data-access';
import { ComingSoonOverlay } from './coming-soon-overlay';
import { LANDMARK_PLACEMENTS, buildDiveSpec } from './dive.config';
import { createCitizenshipCardOverlay } from './overlays/citizenship-card';
import {
  createComplaintScrollOverlay,
  pendingSubmitter,
} from './overlays/complaint-scroll';

/**
 * The landmarks on the page, in the order the dive meets them. Adding one is an entry here,
 * an overlay below (or, for `presentation: 'in-world'`, a scene component) and (for a camera stop) a `stop` in `dive.config.ts`; see
 * `libs/landmarks/README.md`.
 *
 * `model` is a `WEB_ASSETS` id, resolved to a URL by `useLandmarkModel`. Positions come from
 * the asset pipeline's placements (scene-world units). `waypoint` is the dive stop's id,
 * which `dive.config.ts` names after the placement.
 */
export const LANDMARKS: readonly LandmarkDefinition[] = [
  {
    id: 'pineapple',
    model: 'landmark-pineapple',
    position: LANDMARK_PLACEMENTS['landmark-pineapple'],
    waypoint: 'landmark-pineapple',
    overlay: 'pineapple',
    label: { en: 'The Pineapple', ar: 'بيت الأناناس' },
    caption: { en: 'About', ar: 'نبذة' },
  },
  {
    id: 'tiki',
    model: 'landmark-tiki',
    position: LANDMARK_PLACEMENTS['landmark-tiki'],
    waypoint: 'landmark-tiki',
    overlay: 'tiki',
    label: { en: 'Tiki Head', ar: 'رأس التيكي' },
    caption: { en: 'Performance reviews', ar: 'تقييمات الأداء' },
  },
  {
    id: 'krusty-krab',
    model: 'landmark-krusty-krab',
    position: LANDMARK_PLACEMENTS['landmark-krusty-krab'],
    waypoint: 'landmark-krusty-krab',
    overlay: 'krusty-krab',
    label: { en: 'The Krusty Krab', ar: 'مطعم كراستي كراب' },
    caption: { en: 'Services menu', ar: 'قائمة الخدمات' },
  },
  {
    id: 'bureau',
    model: 'landmark-bureau',
    position: LANDMARK_PLACEMENTS['landmark-bureau'],
    waypoint: 'landmark-bureau',
    overlay: 'bureau',
    label: { en: 'Complaints Bureau', ar: 'مكتب الشكاوى' },
    caption: { en: 'File a complaint', ar: 'قدّم شكوى' },
  },
];

/**
 * Overlay components by key, with their content bound here (the landmark libraries never import
 * content). Tiki and Krusty Krab stay placeholders until their landmark items land.
 *
 * The bureau's `pendingSubmitter` sends nothing anywhere and says so to the visitor;
 * `complaints-contact-adapter` replaces it with the real delivery.
 */
export const LANDMARK_OVERLAYS: LandmarkOverlayRegistry = {
  pineapple: createCitizenshipCardOverlay({ profile, copy: siteCopy }),
  tiki: ComingSoonOverlay,
  'krusty-krab': ComingSoonOverlay,
  bureau: createComplaintScrollOverlay({
    copy: siteCopy,
    submitter: pendingSubmitter,
  }),
};

/** The dive's waypoint ids: the only targets a landmark may send the camera to. */
export const diveWaypointIds = (): string[] =>
  (buildDiveSpec().waypoints ?? []).map((w) => w.id);

/**
 * In-scene components by key, for landmarks with 3D content (`scene`): krusty-krab's menu and
 * the complaints wall register theirs here. Each renders R3F children in its landmark's frame.
 */
export const LANDMARK_SCENES: LandmarkSceneRegistry = {};

/**
 * Validates the landmarks against the dive, the overlays and the scenes, once per page load. A broken
 * entry fails loudly at startup (and in `landmarks.config.spec.ts`), never on first click.
 */
export function buildLandmarkRegistry(
  definitions: readonly LandmarkDefinition[] = LANDMARKS,
  overlays: LandmarkOverlayRegistry = LANDMARK_OVERLAYS,
  waypointIds: readonly string[] = diveWaypointIds(),
  scenes: LandmarkSceneRegistry = LANDMARK_SCENES,
): LandmarkRegistry {
  const result = createLandmarkRegistry(definitions, {
    waypointIds,
    overlayKeys: Object.keys(overlays),
    sceneKeys: Object.keys(scenes),
  });
  if (!result.ok)
    throw new Error(
      `Invalid landmarks config:\n${formatLandmarkIssues(result.error)}`,
    );
  return result.value;
}
