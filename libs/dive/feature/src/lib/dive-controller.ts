import type { DiveAttentionRange, DivePath, DiveWaypoint, MutableVec3, Vec3 } from '@qa3elhamor/dive-domain';
import { DIVE_FRAMING_DEFAULTS, framingScale, type DiveFramingOptions } from './framing.js';
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
  /**
   * Arc distances over which the scrolling camera turns from the path ahead to a stop's
   * focus (`DivePath.attentionInto`). An `outer` of 0 disables it.
   */
  readonly attention?: DiveAttentionRange;
  /** Pull-back near stops on narrow (portrait) viewports; see `framingScale`. */
  readonly framing?: DiveFramingOptions;
  /** Jump instead of animating, and no sway (`prefers-reduced-motion`). */
  readonly reducedMotion?: boolean;
}

/**
 * Tuned on the four-landmark route (dive-tuning): a 90% follow of a scroll step in about a
 * second, a look-ahead long enough that the heading does not twitch on bends, a sway small
 * enough not to shake a landmark seen from ten units away, and a gaze that starts turning to
 * a stop 22 units out, so the short hops between landmarks pan from one to the next instead
 * of staring at open seabed, and is locked on for the last 3.
 */
export const DIVE_CONTROLLER_DEFAULTS = {
  responsiveness: 3.8,
  lookAhead: 12,
  sway: 0.16,
  attention: { inner: 3, outer: 22 },
  framing: DIVE_FRAMING_DEFAULTS,
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
  private readonly attention: DiveAttentionRange;
  private readonly framing: DiveFramingOptions;
  private reducedMotion: boolean;
  /**
   * Distance multiplier near stops (1 on wide screens), eased towards `framingTarget` so a
   * rotated phone or a resized window glides rather than jumps. The first aspect is applied
   * as is: the page does not open with a pull-back animation.
   */
  private readonly framingDistance: SpringState = { value: 1, velocity: 0 };
  private framingTarget = 1;
  private aspectKnown = false;

  private readonly progress: SpringState = { value: 0, velocity: 0 };
  private readonly focusBlend: SpringState = { value: 0, velocity: 0 };
  private target = 0;
  private focusBlendTarget = 0;
  /** The focus the camera is turning to (landmark-kernel); kept while the blend fades out. */
  private focusPoint: Vec3 | null = null;
  /**
   * Where the explicit focus actually is this frame, per axis. It follows `focusPoint` on a
   * spring, so switching straight from one focused landmark to another pans the gaze across
   * instead of cutting to the new one.
   */
  private readonly focusLook: readonly [SpringState, SpringState, SpringState] = [
    { value: 0, velocity: 0 },
    { value: 0, velocity: 0 },
    { value: 0, velocity: 0 },
  ];
  private readonly scratchFocus: MutableVec3 = [0, 0, 0];
  /** Scroll fraction (not progress) to restore on `release()`. */
  private heldScroll = 0;
  private source: ScrollSource | null = null;
  private snapNextStep = true;
  private elapsed = 0;

  private readonly state: DiveState;
  private readonly listeners = new Set<() => void>();
  private readonly scratchTangent: MutableVec3 = [0, 0, 0];
  private readonly scratchAttention: MutableVec3 = [0, 0, 0];

  constructor(path: DivePath, options: DiveControllerOptions = {}) {
    this.path = path;
    this.responsiveness = options.responsiveness ?? DIVE_CONTROLLER_DEFAULTS.responsiveness;
    this.lookAhead = options.lookAhead ?? DIVE_CONTROLLER_DEFAULTS.lookAhead;
    this.swayAmplitude = options.sway ?? DIVE_CONTROLLER_DEFAULTS.sway;
    this.attention = options.attention ?? DIVE_CONTROLLER_DEFAULTS.attention;
    this.framing = options.framing ?? DIVE_CONTROLLER_DEFAULTS.framing;
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
      if (this.state.mode === 'scroll') this.target = this.path.progressAtScroll(source.read());
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

  /**
   * Tells the dive the viewport's aspect (width / height) so it can frame stops for it: on a
   * portrait phone the camera stands further back from a landmark. The first call applies at
   * once; later ones (rotation, resize) ease in over the next frames.
   */
  setViewAspect(aspect: number): void {
    this.framingTarget = framingScale(aspect, this.framing);
    if (!this.aspectKnown) {
      this.aspectKnown = true;
      snapSpring(this.framingDistance, this.framingTarget);
    }
  }

  // --- imperative API (landmark-kernel, overlays, navigation) ----------------------------

  /**
   * Swims to the waypoint `id` and turns to face its focus point, ignoring scroll until
   * `release()`. Calling it again while focused moves to the other waypoint, panning the gaze
   * from the old focus to the new one; the return position stays the one from before the
   * first focus. Throws for an unknown id.
   */
  focusWaypoint(id: string): void {
    const waypoint = this.requireWaypoint(id);
    this.hold();
    this.state.mode = 'focus';
    this.state.focusedWaypointId = waypoint.id;
    this.target = waypoint.progress;
    if (waypoint.focus) {
      // Nothing explicit in view yet: start the look on the new focus and let the blend ease
      // it in. Otherwise keep the current look and let it travel (see `focusLook`).
      if (!this.focusPoint || this.focusBlend.value <= 0) {
        this.focusLook.forEach((axis, i) => snapSpring(axis, (waypoint.focus as Vec3)[i]));
      }
      this.focusPoint = waypoint.focus;
      this.focusBlendTarget = 1;
    } else {
      // A stop with nothing to face: fade the old focus out rather than dropping it.
      this.focusBlendTarget = 0;
    }
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
    this.target = this.path.progressAtScroll(this.heldScroll);
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
      if (this.source) this.target = this.path.progressAtScroll(this.source.read());
      this.notify();
    }
    if (this.source) this.source.scrollTo(waypoint.scroll, !this.reducedMotion);
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

    const focus = this.focusPoint;
    if (this.reducedMotion || this.snapNextStep) {
      snapSpring(this.progress, this.target);
      snapSpring(this.focusBlend, this.focusBlendTarget);
      snapSpring(this.framingDistance, this.framingTarget);
      if (focus) this.focusLook.forEach((axis, i) => snapSpring(axis, focus[i]));
      this.snapNextStep = false;
    } else {
      const lookRate = this.responsiveness * FOCUS_BLEND_RATE;
      stepCriticalSpring(this.progress, this.target, this.responsiveness, dt);
      stepCriticalSpring(this.focusBlend, this.focusBlendTarget, lookRate, dt);
      stepCriticalSpring(this.framingDistance, this.framingTarget, this.responsiveness, dt);
      // 1e-5 of the dive is about a millimetre of camera travel: invisible, and it lets the
      // controller stop publishing once the camera is at rest.
      settleSpring(this.progress, this.target, 1e-5);
      settleSpring(this.focusBlend, this.focusBlendTarget, 1e-4);
      settleSpring(this.framingDistance, this.framingTarget, 1e-5);
      if (focus) {
        this.focusLook.forEach((axis, i) => {
          stepCriticalSpring(axis, focus[i], lookRate, dt);
          settleSpring(axis, focus[i], 1e-5);
        });
      }
    }
    if (this.focusBlendTarget === 0 && this.focusBlend.value === 0) this.focusPoint = null;

    const progress = clamp01(this.progress.value);
    const depth = this.writePose(progress);
    this.publish(progress, depth);
  }

  // --- internals --------------------------------------------------------------------------

  /** Writes the pose for `progress` and returns the narrative depth there (`DivePath.depthAt`). */
  private writePose(progress: number): number {
    const { position, lookAt } = this.pose;
    const path = this.path;
    const tangent = this.scratchTangent;

    path.sampleInto(progress, position, tangent);
    const depth = path.depthAt(progress);

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

    // Near a stop the scrolling camera turns from the path ahead to the stop's subject, so a
    // visitor who stops scrolling there is looking at the landmark, not past it.
    const attentionPoint = this.scratchAttention;
    const attention = this.attention.outer > 0 ? path.attentionInto(progress, this.attention, attentionPoint) : 0;
    if (attention > 0) mixInto(lookAt, attentionPoint, attention);

    // An explicit focus (landmark-kernel) wins over both.
    const blend = clamp01(this.focusBlend.value);
    const focus = this.focusPoint !== null;
    if (focus && blend > 0) {
      const look = this.scratchFocus;
      look[0] = this.focusLook[0].value;
      look[1] = this.focusLook[1].value;
      look[2] = this.focusLook[2].value;
      mixInto(lookAt, look, blend);
    }

    // On a narrow viewport, stand further back from whatever the camera is framing, along
    // the line of sight, so the subject is not cropped at the sides.
    const framing = (this.framingDistance.value - 1) * Math.max(attention, focus ? blend : 0);
    if (framing > 0) {
      position[0] += (position[0] - lookAt[0]) * framing;
      position[1] += (position[1] - lookAt[1]) * framing;
      position[2] += (position[2] - lookAt[2]) * framing;
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
    if (this.state.mode === 'scroll') {
      this.heldScroll = this.source?.read() ?? this.path.scrollAtProgress(this.target);
    }
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

/** Moves `out` the fraction `t` of the way to `to`, in place. */
function mixInto(out: MutableVec3, to: Vec3, t: number): void {
  out[0] += (to[0] - out[0]) * t;
  out[1] += (to[1] - out[1]) * t;
  out[2] += (to[2] - out[2]) * t;
}
