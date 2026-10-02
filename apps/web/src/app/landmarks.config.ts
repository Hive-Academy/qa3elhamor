import {
  createLandmarkRegistry,
  formatLandmarkIssues,
  type LandmarkDefinition,
  type LandmarkRegistry,
} from '@qa3elhamor/landmarks-domain';
import type { LandmarkSceneRegistry } from '@qa3elhamor/landmarks-feature';
import type { LandmarkOverlayRegistry } from '@qa3elhamor/landmarks-ui';
import {
  narration,
  profile,
  resumeEntries,
  serviceItems,
  siteCopy,
} from '@qa3elhamor/content-data-access';
import { LANDMARK_PLACEMENTS, buildDiveSpec } from './dive.config';
import { createKrustyScene } from './krusty-krab/krusty-scene';
import { createServicesMenuOverlay } from './krusty-krab/services-menu';
import { stopView } from './narrators/stop-view';
import { narratorFor, narratorsConfigFor } from './narrators.config';
import { createCitizenshipCardOverlay } from './overlays/citizenship-card';
import { createBureauScene } from './bureau/bureau-scene';
import { CONTACT_SUBMITTER } from './contact-submitter';
import { createComplaintScrollOverlay } from './overlays/complaint-scroll';
import { createPineappleScene } from './pineapple/pineapple-scene';
import { createExperienceRecordOverlay } from './tiki/experience-record';
import { createTikiScene } from './tiki/tiki-scene';

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
    // A narrator and the skills as bubbles; the dialog card is the fallback where in-world is off.
    presentation: 'in-world',
    scene: 'pineapple',
    overlay: 'pineapple',
    label: { en: 'The Pineapple', ar: 'بيت الأناناس' },
    caption: { en: 'About', ar: 'نبذة' },
  },
  {
    id: 'tiki',
    model: 'landmark-tiki',
    position: LANDMARK_PLACEMENTS['landmark-tiki'],
    waypoint: 'landmark-tiki',
    // A narrator and the jobs as stone tablets; the full record dialog is the fallback.
    presentation: 'in-world',
    scene: 'tiki',
    overlay: 'tiki',
    label: { en: 'Tiki Head', ar: 'رأس التيكي' },
    caption: { en: 'Performance reviews', ar: 'تقييمات الأداء' },
  },
  {
    id: 'krusty-krab',
    model: 'landmark-krusty-krab',
    position: LANDMARK_PLACEMENTS['landmark-krusty-krab'],
    waypoint: 'landmark-krusty-krab',
    // A narrator and the services as a flipping menu board; the full menu dialog is the fallback.
    presentation: 'in-world',
    scene: 'krusty-krab',
    overlay: 'krusty-krab',
    label: { en: 'The Krusty Krab', ar: 'مطعم كراستي كراب' },
    caption: { en: 'Services menu', ar: 'قائمة الخدمات' },
  },
  {
    id: 'bureau',
    model: 'landmark-bureau',
    position: LANDMARK_PLACEMENTS['landmark-bureau'],
    waypoint: 'landmark-bureau',
    // The Sardine President and the complaint scroll out of the tube; the form dialog is the fallback.
    presentation: 'in-world',
    scene: 'bureau',
    overlay: 'bureau',
    label: { en: 'Complaints Bureau', ar: 'مكتب الشكاوى' },
    caption: { en: 'File a complaint', ar: 'قدّم شكوى' },
  },
];

/**
 * Overlay components by key, with their content bound here (the landmark libraries never import
 * content). The Pineapple's Citizenship Card, the Tiki's full record and the Krusty Krab's full
 * menu are the fallbacks for their narrated visits (reduced motion, low tier, no WebGL).
 *
 * The bureau's complaints, in the dialog and in the world alike, go through the site's one
 * contact submitter (`CONTACT_SUBMITTER`, the provider chosen by `VITE_CONTACT_PROVIDER`);
 * unset (or `none`), it falls back to the pending submitter, which sends nothing anywhere and
 * says so to the visitor.
 */
export const LANDMARK_OVERLAYS: LandmarkOverlayRegistry = {
  pineapple: createCitizenshipCardOverlay({ profile, copy: siteCopy }),
  tiki: createExperienceRecordOverlay({ entries: resumeEntries, copy: siteCopy }),
  'krusty-krab': createServicesMenuOverlay({ services: serviceItems, copy: siteCopy }),
  bureau: createComplaintScrollOverlay({
    copy: siteCopy,
    submitter: CONTACT_SUBMITTER,
  }),
};

/** The dive's waypoint ids: the only targets a landmark may send the camera to. */
export const diveWaypointIds = (): string[] =>
  (buildDiveSpec().waypoints ?? []).map((w) => w.id);

/** Who narrates (`narrators.config.ts`); in development `?narrators=bundled` previews the switch. */
const NARRATORS = narratorsConfigFor(
  typeof window === 'undefined' ? '' : window.location.search,
  import.meta.env.DEV,
);

/**
 * In-scene components by key, for landmarks with 3D content (`scene`). Each renders R3F
 * children in its landmark's frame. The Pineapple's, the Tiki's and the Krusty Krab's are
 * narrated visits (`narrators/narrated-visit.tsx`, see `narrators/README.md`): a narrator, the
 * content as 3D objects (skills as bubbles, jobs as stone tablets, services as rows on a menu
 * board), and the full view one tap away.
 */
export const LANDMARK_SCENES: LandmarkSceneRegistry = {
  pineapple: createPineappleScene({
    profile,
    copy: siteCopy,
    narration: narration.landmarks.pineapple,
    narrator: narratorFor('pineapple', NARRATORS),
    stop: stopView('landmark-pineapple'),
  }),
  tiki: createTikiScene({
    entries: resumeEntries,
    copy: siteCopy,
    narration: narration.landmarks.tiki,
    narrator: narratorFor('tiki', NARRATORS),
    stop: stopView('landmark-tiki'),
  }),
  'krusty-krab': createKrustyScene({
    services: serviceItems,
    copy: siteCopy,
    narration: narration.landmarks['krusty-krab'],
    narrator: narratorFor('krusty-krab', NARRATORS),
    stop: stopView('landmark-krusty-krab'),
  }),
  // Not an object tour: the Sardine President, the clerk window and the complaint scroll.
  bureau: createBureauScene({
    copy: siteCopy,
    submitter: CONTACT_SUBMITTER,
    narration: narration.landmarks.bureau,
    narrator: narratorFor('bureau', NARRATORS),
    stop: stopView('landmark-bureau'),
  }),
};

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
