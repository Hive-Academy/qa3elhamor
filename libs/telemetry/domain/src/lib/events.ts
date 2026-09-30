/**
 * The complete telemetry event catalogue. Nothing outside this list is ever sent: the
 * allow-list (`sanitizeEvent`) rejects any other name or property, so adding an event is a
 * deliberate change here plus a row in `docs/analytics.md`.
 *
 * Every property is a small enumerated value or a slug id authored in the site's content.
 * There is no free text, no URL, no timestamp and nothing typed by the visitor, so no event
 * can carry personal data.
 */

/** Depth milestones, as a percentage of the full dive. Each fires at most once per visit. */
export const DEPTH_MILESTONES = [25, 50, 75, 100] as const;
export type DepthMilestone = (typeof DEPTH_MILESTONES)[number];

/** The deepest milestone reached; 0 when the visitor never reached the first one. */
export const DEPTH_BUCKETS = [0, ...DEPTH_MILESTONES] as const;
export type DepthBucket = (typeof DEPTH_BUCKETS)[number];

/**
 * Rendering quality tiers. Mirrors `QUALITY_TIERS` in world-domain, which the telemetry
 * scope may not import; the app passes its tier straight through, so a mismatch is a
 * type error at the composition root.
 */
export const TELEMETRY_QUALITY_TIERS = ['low', 'medium', 'high'] as const;
export type TelemetryQualityTier = (typeof TELEMETRY_QUALITY_TIERS)[number];

/** Sent as `lastWaypointId` when the visitor left before the camera neared any waypoint. */
export const NO_WAYPOINT = 'none';

export interface DiveDepthReachedEvent {
  readonly name: 'dive_depth_reached';
  readonly props: { readonly milestone: DepthMilestone };
}

export interface LandmarkClickedEvent {
  readonly name: 'landmark_clicked';
  readonly props: { readonly landmarkId: string };
}

export interface OverlayOpenedEvent {
  readonly name: 'overlay_opened';
  readonly props: { readonly overlayKey: string };
}

export interface DiveDropOffEvent {
  readonly name: 'dive_drop_off';
  readonly props: { readonly maxDepthBucket: DepthBucket; readonly lastWaypointId: string };
}

export interface QualityTierResolvedEvent {
  readonly name: 'quality_tier_resolved';
  readonly props: { readonly tier: TelemetryQualityTier };
}

export type TelemetryEvent =
  | DiveDepthReachedEvent
  | LandmarkClickedEvent
  | OverlayOpenedEvent
  | DiveDropOffEvent
  | QualityTierResolvedEvent;

export type TelemetryEventName = TelemetryEvent['name'];

export const TELEMETRY_EVENT_NAMES: readonly TelemetryEventName[] = [
  'dive_depth_reached',
  'landmark_clicked',
  'overlay_opened',
  'dive_drop_off',
  'quality_tier_resolved',
];

/** A property value as providers receive it. */
export type TelemetryPropValue = string | number;
