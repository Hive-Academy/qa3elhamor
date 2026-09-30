import { sanitizeEvent, isTelemetrySlug } from './allow-list.js';
import { EventDeduper } from './dedupe.js';
import {
  NO_WAYPOINT,
  type TelemetryEvent,
  type TelemetryQualityTier,
} from './events.js';
import { DiveMilestoneTracker, type DiveMilestoneTrackerOptions } from './milestone-tracker.js';

/** Where a session delivers admitted events; implemented by the data-access `AnalyticsPort`. */
export interface TelemetrySink {
  /** Normal delivery; may be queued until the provider is ready. */
  track(event: TelemetryEvent): void;
  /** Delivery while the page is being hidden or unloaded: must not depend on a later tick. */
  trackOnExit(event: TelemetryEvent): void;
}

/** The subset of the dive state telemetry reads. Structurally satisfied by `DiveState`. */
export interface DiveSnapshot {
  /** Deepest progress reached this visit, in [0, 1]. */
  readonly maxProgress: number;
  readonly nearestWaypointId: string | null;
}

export interface TelemetrySessionOptions extends DiveMilestoneTrackerOptions {
  readonly now?: () => number;
}

/**
 * One visit's telemetry: turns dive snapshots and UI signals into allow-listed, de-duplicated
 * events. Pure — no DOM, no timers — so the whole policy is unit-testable; the page lifecycle
 * (calling `dropOff` on `pagehide`) lives in data-access.
 */
export class TelemetrySession {
  private readonly tracker: DiveMilestoneTracker;
  private readonly deduper: EventDeduper;
  private lastWaypointId: string = NO_WAYPOINT;

  constructor(
    private readonly sink: TelemetrySink,
    options: TelemetrySessionOptions = {}
  ) {
    this.tracker = new DiveMilestoneTracker(options);
    this.deduper = new EventDeduper(options.now);
  }

  /** Feed on every dive state change; cheap when nothing new was reached. */
  observeDive(snapshot: DiveSnapshot): void {
    const id = snapshot.nearestWaypointId;
    // A non-slug id would fail the allow-list and lose the whole drop-off event, so it is
    // ignored and the last valid waypoint stands.
    if (id !== null && isTelemetrySlug(id)) this.lastWaypointId = id;
    for (const milestone of this.tracker.update(snapshot.maxProgress)) {
      this.emit({ name: 'dive_depth_reached', props: { milestone } });
    }
  }

  landmarkClicked(landmarkId: string): void {
    this.emit({ name: 'landmark_clicked', props: { landmarkId } });
  }

  overlayOpened(overlayKey: string): void {
    this.emit({ name: 'overlay_opened', props: { overlayKey } });
  }

  qualityTierResolved(tier: TelemetryQualityTier): void {
    this.emit({ name: 'quality_tier_resolved', props: { tier } });
  }

  /**
   * Where the visitor left the dive, sent on the exit path. At most once per page-hide:
   * repeated calls are dropped until `resumeVisit` re-arms it.
   */
  dropOff(): void {
    this.emit(
      {
        name: 'dive_drop_off',
        props: { maxDepthBucket: this.tracker.bucket, lastWaypointId: this.lastWaypointId },
      },
      true
    );
  }

  /**
   * The page came back from the back/forward cache: the visit continues, so the next exit
   * sends a fresh drop-off with the depth reached by then. Depth milestones stay consumed —
   * they are once per visit regardless of navigation.
   */
  resumeVisit(): void {
    this.deduper.forget('dive_drop_off');
  }

  private emit(candidate: TelemetryEvent, onExit = false): void {
    const event = sanitizeEvent(candidate);
    if (event === null || !this.deduper.admit(event)) return;
    if (onExit) this.sink.trackOnExit(event);
    else this.sink.track(event);
  }
}
