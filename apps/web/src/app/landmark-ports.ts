import { useDive } from '@qa3elhamor/dive-feature';
import type {
  LandmarkCamera,
  LandmarkEvent,
  UseLandmarkModel,
} from '@qa3elhamor/landmarks-feature';
import {
  assetUrl,
  evictCompressedModel,
  useCompressedModel,
} from '@qa3elhamor/world-feature';
import { useMemo } from 'react';
import { trackLandmarkEvent } from './telemetry';

/*
 * The landmark kernel's capabilities, implemented here because this is the one place allowed
 * to join the landmarks, dive and world libraries.
 */

/** The landmark camera, driven by the dive: focus swims to the stop, release resumes scroll. */
export function useDiveLandmarkCamera(): LandmarkCamera {
  const dive = useDive();
  return useMemo(
    () => ({
      focus: (waypointId) => dive.focusWaypoint(waypointId),
      release: () => dive.release(),
    }),
    [dive],
  );
}

const modelUrl = (assetId: string): string =>
  assetUrl(assetId, import.meta.env.BASE_URL);

/** Loads a landmark's manifested GLB with the world's Meshopt loader and cache. */
export const useLandmarkModel: UseLandmarkModel = (assetId) =>
  useCompressedModel(modelUrl(assetId));

export const evictLandmarkModel = (assetId: string): void =>
  evictCompressedModel(modelUrl(assetId));

/**
 * Landmark events: forwarded to telemetry (opens become `landmark_clicked` and
 * `overlay_opened`), and model failures are also logged so a missing model is visible in the
 * console rather than silently absent.
 */
export function reportLandmarkEvent(event: LandmarkEvent): void {
  trackLandmarkEvent(event);
  if (event.type === 'landmark_model_error') {
    console.error(
      `Landmark "${event.landmarkId}" model failed to load; it stays reachable without it.`,
      event.error,
    );
  }
  if (event.type === 'landmark_scene_error') {
    console.error(
      `Landmark "${event.landmarkId}" scene component failed; the landmark works without it.`,
      event.error,
    );
  }
}
