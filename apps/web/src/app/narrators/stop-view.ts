import type { DivePathSpec } from '@qa3elhamor/dive-domain';
import { WORLD_SCALE, sceneToWorld } from '@qa3elhamor/world-feature';
import {
  LANDMARK_PLACEMENTS,
  buildDiveSpec,
  type LandmarkId,
} from '../dive.config';
import type { Vec3 } from './view-layout';

/** Where the camera rests at a landmark's stop, what it looks at, and the seabed there. */
export interface StopView {
  readonly eye: Vec3;
  readonly focus: Vec3;
  /** The landmark's base height (world y): the seabed nothing should sink under. */
  readonly ground: number;
}

/**
 * The resting view at the dive stop of landmark `id` (`dive.config.ts`): the stop's control
 * point and its focus, in world units, before the portrait pull-back (the scene applies that
 * for its viewport). Throws for a stop that does not exist or does not look at anything: a
 * config error, caught at startup.
 */
export function stopView(
  id: LandmarkId,
  spec: DivePathSpec = buildDiveSpec(),
  scale: number = WORLD_SCALE,
): StopView {
  const waypoint = spec.waypoints?.find((candidate) => candidate.id === id);
  const eye = waypoint ? spec.controlPoints[waypoint.at] : undefined;
  if (!waypoint?.focus || !eye)
    throw new Error(
      `No dive stop "${id}" with a focus to compose a visit for.`,
    );
  return {
    eye,
    focus: waypoint.focus,
    ground: sceneToWorld(LANDMARK_PLACEMENTS[id], scale)[1],
  };
}
