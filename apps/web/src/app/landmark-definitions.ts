import type { LandmarkDefinition } from '@qa3elhamor/landmarks-domain';
import { LANDMARK_PLACEMENTS } from './dive.config';

/*
 * The landmark definitions alone: data, no scene or overlay code. The page view reads them for
 * the landmarks' names and is part of every visitor's first download, so this module must not
 * import the 3D scenes; those are bound in `landmarks.config.ts`, which only the dive's lazy
 * chunk loads (docs/perf-budget.md).
 */

/**
 * The landmarks on the page, in the order the dive meets them. Adding one is an entry here,
 * an overlay in `landmarks.config.ts` (or, for `presentation: 'in-world'`, a scene component) and (for a camera stop) a `stop` in `dive.config.ts`; see
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
