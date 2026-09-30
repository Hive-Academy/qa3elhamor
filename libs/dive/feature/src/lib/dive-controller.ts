import type { DivePath, DiveWaypoint, MutableVec3, Vec3 } from '@qa3elhamor/dive-domain';
import type { ScrollSource } from './scroll-source.js';
import { settleSpring, snapSpring, stepCriticalSpring, type SpringState } from './spring.js';

/**
 * Who drives the camera:
 * - `scroll`: native page scroll (the normal dive);
 * - `focus`: the camera holds on a waypoint and looks at its focus (landmark-kernel);
 * - `suspended`: scroll input is ignored and the camera stays put (an overlay is open).
 */
export type DiveMode = 'scroll' | 'focus' | 'suspended';

/**
 * Observable dive state for overlays and telemetry. The controller updates ONE object in place
 * and notifies subscribers only when something changed, so a camera at rest costs nothing.
 * Read it inside a listener or via `useDiveState`; call `snapshot()` to keep a copy.
 */
export interface DiveState {
  /** Where the camera is along the dive, in [0, 1] (arc-length). */
  progress: number;
  /** Where the camera is heading, in [0, 1]. */
  targetProgress: number;
  /** Rate of change of `progress` per second (signed; positive is deeper). */
  velocity: number;
  /** Displayed depth in metres, positive, 0 at the surface. */
  depth: number;
  /** Depth as a fraction of the floor depth, in [0, 1]. */
  depthRatio: number;
  /** Deepest progress reached this visit (telemetry: depth reached, drop-off). */
  maxProgress: number;
  /** Deepest depth in metres reached this visit. */
  maxDepth: number;
  nearestWaypointId: string | null;
  focusedWaypointId: string | null;
  mode: DiveMode;
}

export interface DiveControllerOptions {
  /** Spring natural frequency in 1/s; higher follows the scroll more tightly. */
  readonly responsiveness?: number;
  /** How far ahead along the path the camera looks, in world units. */
  readonly lookAhead?: number;
  /** Amplitude of the idle sway in world units; 0 disables it. */
  readonly sway?: number;
  /** Jump instead of animating, and no sway (`prefers-reduced-motion`). */
  readonly reducedMotion?: boolean;
}

export const DIVE_CONTROLLER_DEFAULTS = {
  responsiveness: 3.2,
  lookAhead: 9,
  sway: 0.22,
} as const;

/** Frames longer than this (tab switch, GC pause) are clamped so the camera does not leap. */
const MAX_FRAME_SECONDS = 0.1;
/** The look-at blend towards a focus target moves a little quicker than the camera itself. */
const FOCUS_BLEND_RATE = 1.4;
const PUBLISH_EPSILON = 1e-5;

// NaN fails every comparison, so it is caught first: non-finite progress means the surface.
const clamp01 = (v: number): number => (Number.isNaN(v) || v <= 0 ? 0 : v >= 1 ? 1 : v);

/**
 * The dive's camera brain, free of React and three.js so it can be unit-tested: it turns
 * scroll input into an eased camera pose along a `DivePath`.
 *
 * Each frame, `step(dt)` advances a critically damped spring from the current progress
 * towards the scroll target and writes `pose.position` / `pose.lookAt` in place. The renderer
 * copies the pose onto its camera. Nothing is allocated per frame.
 */
export class DiveController {
  readonly path: DivePath;
  /** The camera pose for the current frame, in world units. Overwritten by every `step`. */
  readonly pose: { readonly position: MutableVec3; readonly lookAt: MutableVec3 } = {
    position: [0, 0, 0],
    lookAt: [0, 0, 0],
  };

  private readonly responsiveness: number;
  private readonly lookAhead: number;
  private readonly swayAmplitude: number;
  private reducedMotion: boolean;

  private readonly progress: SpringState = { value: 0, velocity: 0 };
  private readonly focusBlend: SpringState = { value: 0, velocity: 0 };
  private target = 0;
  private focusBlendTarget = 0;
  private focusPoint: Vec3 | null = null;
  private heldScroll = 0;
  private source: ScrollSource | null = null;
  private snapNextStep = true;
  private elapsed = 0;

  private readonly state: DiveState;
  private readonly listeners = new Set<() => void>();
  private readonly scratchTangent: MutableVec3 = [0, 0, 0];

  constructor(path: DivePath, options: DiveControllerOptions = {}) {
    this.path = path;
    this.responsiveness = options.responsiveness ?? DIVE_CONTROLLER_DEFAULTS.responsiveness;
    this.lookAhead = options.lookAhead ?? DIVE_CONTROLLER_DEFAULTS.lookAhead;
    this.swayAmplitude = options.sway ?? DIVE_CONTROLLER_DEFAULTS.sway;
    this.reducedMotion = options.reducedMotion ?? false;
    const depth = path.depthAt(0);
    this.state = {
      progress: 0,
      targetProgress: 0,
      velocity: 0,
      depth,
      depthRatio: depth / path.depth.floorMeters,
      maxProgress: 0,
      maxDepth: depth,
      nearestWaypointId: path.nearestWaypoint(0)?.id ?? null,
      focusedWaypointId: null,
      mode: 'scroll',
    };
    this.writePose(0);
  }

  // --- observable state ---------------------------------------------------------------

  /** The live state object (updated in place). Do not mutate it. */
  getState = (): Readonly<DiveState> => this.state;

  /** A detached copy of the current state. */
  snapshot = (): DiveState => ({ ...this.state });

  /** Called after any change to the state; returns the unsubscribe function. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  // --- input ----------------------------------------------------------------------------

  /**
   * Binds scroll input. The camera jumps to the current scroll position on the next frame
   * (a reload mid-dive does not replay the descent). Returns the disconnect function.
   */
  connect(source: ScrollSource): () => void {
    this.source = source;
    const onScroll = (): void => {
      if (this.state.mode === 'scroll') this.target = source.read();
    };
    onScroll();
    this.snapNextStep = true;
    const unsubscribe = source.subscribe(onScroll);
    return () => {
      unsubscribe();
      if (this.source === source) this.source = null;
    };
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  // --- imperative API (landmark-kernel, overlays, navigation) ----------------------------

  /**
   * Swims to the waypoint `id` and turns to face its focus point, ignoring scroll until
   * `release()`. Calling it again while focused moves to the other waypoint; the return
   * position stays the one from before the first focus. Throws for an unknown id.
   */
  focusWaypoint(id: string): void {
    const waypoint = this.requireWaypoint(id);
    this.hold();
    this.state.mode = 'focus';
    this.state.focusedWaypointId = waypoint.id;
    this.target = waypoint.progress;
    this.focusPoint = waypoint.focus;
    this.focusBlendTarget = waypoint.focus ? 1 : 0;
    this.notify();
  }

  /**
   * Freezes the camera and ignores scroll (e.g. while an overlay is open) until `release()`.
   * Called during a `focusWaypoint` swim, it stops the camera where it is (easing to a halt)
   * and keeps facing the focus; `release()` still returns to the pre-focus scroll position.
   */
  suspend(): void {
    if (this.state.mode === 'suspended') return;
    this.hold();
    if (this.state.mode === 'focus') this.target = clamp01(this.progress.value);
    this.state.mode = 'suspended';
    this.notify();
  }

  /**
   * Returns control to the scroll from `focus` or `suspended`: the page scroll is restored to
   * where it was when control was taken, and the camera eases back there.
   */
  release(): void {
    if (this.state.mode === 'scroll') return;
    this.returnToScroll();
    const source = this.source;
    if (source && Math.abs(source.read() - this.heldScroll) > PUBLISH_EPSILON) {
      source.scrollTo(this.heldScroll, false);
    }
    this.target = this.heldScroll;
    this.notify();
  }

  /**
   * Scrolls the page so the dive arrives at waypoint `id` (a "next landmark" link). The dive
   * stays scroll-driven; with reduced motion the page jumps. From `focus` or `suspended` it
   * hands control back to the scroll without first restoring the held position, so the page
   * makes one move, not a snap back followed by a scroll. Throws for an unknown id.
   */
  scrollToWaypoint(id: string): void {
    const waypoint = this.requireWaypoint(id);
    if (this.state.mode !== 'scroll') {
      this.returnToScroll();
      if (this.source) this.target = this.source.read();
      this.notify();
    }
    if (this.source) this.source.scrollTo(waypoint.progress, !this.reducedMotion);
    else this.target = waypoint.progress;
  }

  /** Leaves `focus`/`suspended` for scroll control, without touching the page scroll. */
  private returnToScroll(): void {
    this.state.mode = 'scroll';
    this.state.focusedWaypointId = null;
    this.focusBlendTarget = 0;
  }

  // --- per frame --------------------------------------------------------------------------

  /** Advances the camera by `delta` seconds and publishes state if it changed. */
  step(delta: number): void {
    const dt = delta > 0 ? Math.min(delta, MAX_FRAME_SECONDS) : 0; // NaN and negatives: no time
    this.elapsed += dt;

    if (this.reducedMotion || this.snapNextStep) {
      snapSpring(this.progress, this.target);
      snapSpring(this.focusBlend, this.focusBlendTarget);
      this.snapNextStep = false;
    } else {
      stepCriticalSpring(this.progress, this.target, this.responsiveness, dt);
      stepCriticalSpring(this.focusBlend, this.focusBlendTarget, this.responsiveness * FOCUS_BLEND_RATE, dt);
      // 1e-5 of the dive is about a millimetre of camera travel: invisible, and it lets the
      // controller stop publishing once the camera is at rest.
      settleSpring(this.progress, this.target, 1e-5);
      settleSpring(this.focusBlend, this.focusBlendTarget, 1e-4);
    }
    if (this.focusBlendTarget === 0 && this.focusBlend.value === 0) this.focusPoint = null;

    const progress = clamp01(this.progress.value);
    const depth = this.writePose(progress);
    this.publish(progress, depth);
  }

  // --- internals --------------------------------------------------------------------------

  /** Writes the pose for `progress` and returns the depth at the unswayed camera height. */
  private writePose(progress: number): number {
    const { position, lookAt } = this.pose;
    const path = this.path;
    const tangent = this.scratchTangent;

    path.sampleInto(progress, position, tangent);
    const depth = path.depthOfY(position[1]);

    // Look a fixed distance ahead along the curve; past the end, continue along the final
    // tangent so the view never collapses onto the camera position.
    const ahead = progress + this.lookAhead / path.length;
    if (ahead <= 1) {
      path.pointInto(ahead, lookAt);
    } else {
      path.sampleInto(1, lookAt, tangent);
      const overshoot = (ahead - 1) * path.length;
      lookAt[0] += tangent[0] * overshoot;
      lookAt[1] += tangent[1] * overshoot;
      lookAt[2] += tangent[2] * overshoot;
    }

    const blend = clamp01(this.focusBlend.value);
    const focus = this.focusPoint;
    if (focus && blend > 0) {
      lookAt[0] += (focus[0] - lookAt[0]) * blend;
      lookAt[1] += (focus[1] - lookAt[1]) * blend;
      lookAt[2] += (focus[2] - lookAt[2]) * blend;
    }

    // A slow, incommensurate drift: the diver is floating, not on rails. Only the position
    // moves, so the view rotates very slightly around a steady target.
    const sway = this.reducedMotion ? 0 : this.swayAmplitude;
    if (sway > 0) {
      const t = this.elapsed;
      position[0] += sway * Math.sin(t * 0.41);
      position[1] += sway * 0.6 * Math.sin(t * 0.29 + 1.7);
      position[2] += sway * 0.5 * Math.sin(t * 0.23 + 0.6);
    }
    return depth;
  }

  private publish(progress: number, depth: number): void {
    const s = this.state;
    const nearest = this.path.nearestWaypoint(progress)?.id ?? null;
    const velocity = this.reducedMotion ? 0 : this.progress.velocity;
    const changed =
      Math.abs(s.progress - progress) > PUBLISH_EPSILON ||
      Math.abs(s.velocity - velocity) > PUBLISH_EPSILON ||
      s.targetProgress !== this.target ||
      s.nearestWaypointId !== nearest ||
      (s.velocity !== 0 && velocity === 0);
    if (!changed) return;

    s.progress = progress;
    s.targetProgress = this.target;
    s.velocity = velocity;
    s.depth = depth;
    s.depthRatio = depth / this.path.depth.floorMeters;
    s.nearestWaypointId = nearest;
    if (progress > s.maxProgress) s.maxProgress = progress;
    if (depth > s.maxDepth) s.maxDepth = depth;
    this.notify();
  }

  /** Remembers the scroll position to return to, unless control is already held. */
  private hold(): void {
    if (this.state.mode === 'scroll') this.heldScroll = this.source?.read() ?? this.target;
  }

  private requireWaypoint(id: string): DiveWaypoint {
    const waypoint = this.path.waypoint(id);
    if (!waypoint) throw new RangeError(`Unknown dive waypoint "${id}".`);
    return waypoint;
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
