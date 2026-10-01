import { useEffect } from 'react';
import { useDive } from '@qa3elhamor/dive-feature';
import type { LandmarkEvent } from '@qa3elhamor/landmarks-feature';
import type { QualityTier } from '@qa3elhamor/world-domain';
import {
  createTelemetryClient,
  resolveAnalyticsConfig,
  type TelemetryClient,
} from '@qa3elhamor/telemetry-data-access';

/**
 * Site telemetry wiring. Configuration comes from `VITE_ANALYTICS_*` at build time (see
 * `docs/analytics.md`); unset means the no-op adapter, so a fork sends nothing until it opts
 * in. Every call here is safe to make unconditionally.
 */

let client: TelemetryClient | null = null;

/** The page's single telemetry client, created on first use. */
export function siteTelemetry(): TelemetryClient {
  client ??= createTelemetryClient(resolveAnalyticsConfig(import.meta.env));
  return client;
}

/**
 * Mount once inside `<DiveProvider>`. Feeds dive state changes to the session (depth
 * milestones, last waypoint), lazily loads the provider script when the main thread is idle,
 * and sends the drop-off event on `pagehide`. It subscribes to the controller directly rather
 * than through `useDiveState`, so the host component never re-renders for telemetry.
 */
export function useSiteTelemetry(): void {
  const dive = useDive();
  useEffect(() => {
    const telemetry = siteTelemetry();
    const stop = telemetry.start();
    const observe = (): void => telemetry.session.observeDive(dive.getState());
    observe();
    const unsubscribe = dive.subscribe(observe);
    return () => {
      unsubscribe();
      stop();
    };
  }, [dive]);
}

/** Renders nothing; mounts `useSiteTelemetry`. Place it inside `<DiveProvider>`. */
export function SiteTelemetry(): null {
  useSiteTelemetry();
  return null;
}

/**
 * Forward a landmark kernel event. Opening a landmark (pointer or keyboard) counts as a
 * landmark click and as opening its overlay, keyed by the landmark id. Hover, close and
 * model errors are not collected.
 */
export function trackLandmarkEvent(event: LandmarkEvent): void {
  if (event.type !== 'landmark_open') return;
  const { session } = siteTelemetry();
  session.landmarkClicked(event.landmarkId);
  session.overlayOpened(event.landmarkId);
}

/** Any other overlay (e.g. `complaints-wall`), keyed by a fixed slug. */
export function trackOverlayOpened(overlayKey: string): void {
  siteTelemetry().session.overlayOpened(overlayKey);
}

/**
 * Report the rendering tier. Precondition: call only once the tier is FINAL — the first call
 * per visit wins and later calls are ignored, so a provisional tier reported early would be
 * the one recorded. `app.tsx` passes this to `<QualityProvider onSettled>`, which calls it
 * once when the frame-rate governor settles (or at once for a `?quality=` override).
 */
export function trackQualityTier(tier: QualityTier): void {
  siteTelemetry().session.qualityTierResolved(tier);
}
