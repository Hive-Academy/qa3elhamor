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
import { buildDiveSpec } from './dive.config';
import { LANDMARKS } from '../site.config';
import { createKrustyScene } from './krusty-krab/krusty-scene';
import { createServicesMenuOverlay } from './krusty-krab/services-menu';
import { stopView, type StopView } from './narrators/stop-view';
import { narratorFor, narratorsConfigFor } from './narrators.config';
import { createCitizenshipCardOverlay } from './overlays/citizenship-card';
import { createBureauScene } from './bureau/bureau-scene';
import { createComplaintScrollOverlay } from './overlays/complaint-scroll';
import { createPineappleScene } from './pineapple/pineapple-scene';
import { createExperienceRecordOverlay } from './tiki/experience-record';
import { createTikiScene } from './tiki/tiki-scene';
import { COMPLAINT_SUBMITTER, WALL } from './wall/wall-port';

/**
 * Overlay components by key, with their content bound here (the landmark libraries never import
 * content). The Pineapple's Citizenship Card, the Tiki's full record and the Krusty Krab's full
 * menu are the fallbacks for their narrated visits (reduced motion, low tier, no WebGL).
 *
 * The bureau's complaints, in the dialog and in the world alike, go through the site's one
 * contact submitter (`CONTACT_SUBMITTER`, the provider chosen by `VITE_CONTACT_PROVIDER`);
 * unset (or `none`), it falls back to the pending submitter, which sends nothing anywhere and
 * says so to the visitor. With the public wall on (`VITE_WALL_API_URL`, `WALL`), the same
 * forms also offer pinning a complaint on the wall: `COMPLAINT_SUBMITTER` routes those to it.
 */
export const LANDMARK_OVERLAYS: LandmarkOverlayRegistry = {
  pineapple: createCitizenshipCardOverlay({ profile, copy: siteCopy }),
  tiki: createExperienceRecordOverlay({ entries: resumeEntries, copy: siteCopy }),
  'krusty-krab': createServicesMenuOverlay({ services: serviceItems, copy: siteCopy }),
  bureau: createComplaintScrollOverlay({
    copy: siteCopy,
    submitter: COMPLAINT_SUBMITTER,
    publicWall: WALL?.words,
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
 * In-scene components, by key, each made for the dive stop of the landmark that shows it (its
 * camera framing). The Pineapple's, the Tiki's and the Krusty Krab's are narrated visits
 * (`narrators/narrated-visit.tsx`, see `narrators/README.md`): a narrator, the content as 3D
 * objects (skills as bubbles, jobs as stone tablets, services as rows on a menu board), and the
 * full view one tap away.
 */
const SCENE_FACTORIES = {
  pineapple: (stop: StopView) =>
    createPineappleScene({
      profile,
      copy: siteCopy,
      narration: narration.landmarks.pineapple,
      narrator: narratorFor('pineapple', NARRATORS),
      stop,
    }),
  tiki: (stop: StopView) =>
    createTikiScene({
      entries: resumeEntries,
      copy: siteCopy,
      narration: narration.landmarks.tiki,
      narrator: narratorFor('tiki', NARRATORS),
      stop,
    }),
  'krusty-krab': (stop: StopView) =>
    createKrustyScene({
      services: serviceItems,
      copy: siteCopy,
      narration: narration.landmarks['krusty-krab'],
      narrator: narratorFor('krusty-krab', NARRATORS),
      stop,
    }),
  // Not an object tour: the Sardine President, the clerk window and the complaint scroll.
  bureau: (stop: StopView) =>
    createBureauScene({
      copy: siteCopy,
      submitter: COMPLAINT_SUBMITTER,
      narration: narration.landmarks.bureau,
      narrator: narratorFor('bureau', NARRATORS),
      stop,
      wall: WALL,
    }),
} satisfies Record<string, (stop: StopView) => LandmarkSceneRegistry[string]>;

/**
 * The scenes the configured landmarks (`LANDMARKS`, site.config.ts) show, each at its
 * landmark's stop. A scene no landmark names is not built, so removing a landmark from the
 * config is enough.
 */
export const LANDMARK_SCENES: LandmarkSceneRegistry = Object.fromEntries(
  Object.entries(SCENE_FACTORIES).flatMap(([key, create]) => {
    const landmark = LANDMARKS.find((definition) => definition.scene === key);
    return landmark ? [[key, create(stopView(landmark.waypoint))]] : [];
  }),
);

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
