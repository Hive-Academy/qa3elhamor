import { AMBIENT_TIME_PERIOD } from './ambient-clock.js';
import type { Vec3 } from './world-space.js';

/**
 * The narrator's animation maths: springs, camera facing, the talk rhythm and the swim-in /
 * swim-away travel. Pure and allocation-free: `stepNarrator` mutates a state and a pose the
 * caller owns, so the `<Narrator>` component only copies the pose onto its groups.
 *
 * Every angular frequency here is a multiple of 0.02 rad/s, so the clock can wrap at
 * `AMBIENT_TIME_PERIOD` without a visible step (the same rule as the ambient shaders).
 */

/** Frames longer than this (a tab switch, a GC pause) do not jump the animation. */
export const NARRATOR_MAX_FRAME = 0.1;

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// Scalars

export const clamp = (x: number, min: number, max: number): number => (x < min ? min : x > max ? max : x);

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Ease used for the swim travel: fast start, gentle arrival (and, run backwards, the reverse). */
export const easeOutCubic = (p: number): number => {
  const q = 1 - clamp(p, 0, 1);
  return 1 - q * q * q;
};

/** `a` wrapped into [-pi, pi). Non-finite input gives 0. */
export function wrapAngle(a: number): number {
  if (!Number.isFinite(a)) return 0;
  return a - TAU * Math.floor((a + Math.PI) / TAU);
}

/**
 * The heading closest to `desired` that stays within `maxTurn` of `rest` (shortest way round).
 * A `maxTurn` of pi or more leaves `desired` free.
 */
export function limitYaw(rest: number, desired: number, maxTurn: number): number {
  const limit = Number.isFinite(maxTurn) ? Math.max(0, maxTurn) : Math.PI;
  return wrapAngle(rest + clamp(wrapAngle(desired - rest), -limit, limit));
}

/** Heading (rotation about +Y) that turns a +Z-forward character to face along (dx, dz). */
export const yawToward = (dx: number, dz: number): number => Math.atan2(dx, dz);

// ---------------------------------------------------------------------------------------------
// Springs

export interface Spring {
  x: number;
  v: number;
}

/**
 * Critically damped spring toward `target`, solved exactly over `dt` (so the result does not
 * depend on the frame rate). `omega` is the natural frequency, rad/s: it settles to within 1% in
 * about 6.6 / omega seconds. A corrupt (non-finite) state snaps to the target.
 */
export function springStep(s: Spring, target: number, omega: number, dt: number): void {
  if (!Number.isFinite(target)) return;
  if (!Number.isFinite(s.x) || !Number.isFinite(s.v)) {
    s.x = target;
    s.v = 0;
    return;
  }
  if (!(dt > 0) || !(omega > 0)) return;
  const c1 = s.x - target;
  const c2 = s.v + omega * c1;
  const decay = Math.exp(-omega * dt);
  s.x = target + (c1 + c2 * dt) * decay;
  s.v = (c2 - omega * (c1 + c2 * dt)) * decay;
}

/** `springStep` on an angle: turns the short way round and keeps `x` wrapped. */
export function angleSpringStep(s: Spring, target: number, omega: number, dt: number): void {
  if (!Number.isFinite(target)) return;
  const base = Number.isFinite(s.x) ? s.x : target;
  springStep(s, base + wrapAngle(target - base), omega, dt);
  s.x = wrapAngle(s.x);
}

// ---------------------------------------------------------------------------------------------
// Curves

/** Syllable rate of the talk rhythm, rad/s (about 4.4 syllables a second). */
const SYLLABLE_RATE = 27.6;

/**
 * The talk rhythm, 0..1: a syllable beat whose strength drifts with two slow, detuned accents,
 * so it reads as speech rather than a metronome. Continuous, periodic in `AMBIENT_TIME_PERIOD`.
 */
export function talkPulse(t: number): number {
  if (!Number.isFinite(t)) return 0;
  const syllable = 0.5 - 0.5 * Math.cos(t * SYLLABLE_RATE);
  const accent = 0.66 + 0.34 * Math.sin(t * 4.4 + 0.7) * Math.sin(t * 11.3);
  return clamp(syllable * accent, 0, 1);
}

/**
 * Squash-and-stretch scales for a talk value `pulse` (0..1) at envelope `envelope` (0..1):
 * squashed on the closed beat, stretched on the open one, volume kept (x = z = 1 / sqrt(y)).
 */
export function squashStretch(pulse: number, envelope: number, amount: number): { y: number; xz: number } {
  const y = 1 + amount * (2 * clamp(pulse, 0, 1) - 1) * clamp(envelope, 0, 1);
  const safe = Math.max(0.05, y);
  return { y: safe, xz: 1 / Math.sqrt(safe) };
}

/** Reduced motion's only movement while talking: a slow, gentle uniform scale pulse. */
export const reducedTalkScale = (t: number, envelope: number): number =>
  1 + 0.035 * (0.5 - 0.5 * Math.cos((Number.isFinite(t) ? t : 0) * 3.2)) * clamp(envelope, 0, 1);

// ---------------------------------------------------------------------------------------------
// The frame step

/** Per-character animation tuning: amplitudes as fractions of the rendered height. */
export interface NarratorMotionTuning {
  /** Idle bob amplitude, x height. */
  readonly bob: number;
  /** Idle roll sway amplitude, radians (pitch sways at half of it). */
  readonly sway: number;
  /** Squash-and-stretch amount while talking (0.09 = +-9% height). */
  readonly talkStretch: number;
  /** Hop on each talk beat, x height. */
  readonly talkBounce: number;
  /** Added to the camera-facing heading, radians: a fish shows its profile three-quarter on. */
  readonly facingOffset: number;
  /** Added to the travel heading, radians: pi/2 makes a crab walk sideways. */
  readonly travelYawOffset: number;
  readonly enterSeconds: number;
  readonly exitSeconds: number;
  /** Default swim-in start, relative to the post, x height (parent axes). */
  readonly enterFrom: Vec3;
  /** Default swim-away end, relative to the post, x height (parent axes). */
  readonly exitTo: Vec3;
}

export const DEFAULT_NARRATOR_MOTION: NarratorMotionTuning = {
  bob: 0.045,
  sway: 0.05,
  talkStretch: 0.09,
  talkBounce: 0.05,
  facingOffset: 0,
  travelYawOffset: 0,
  enterSeconds: 1.6,
  exitSeconds: 1.2,
  enterFrom: [-2.6, 0.9, -1.4],
  exitTo: [2.8, 1.5, -1.2],
};

export type NarratorPhase = 'gone' | 'entering' | 'present' | 'exiting';

export interface NarratorMotionState {
  /** 0 = away (at the travel offset, shrunk), 1 = at its post. */
  presence: number;
  /** The travel offset at presence 0, x height: `enterFrom` on the way in, `exitTo` on the way out. */
  sideX: number;
  sideY: number;
  sideZ: number;
  readonly yaw: Spring;
  readonly talk: Spring;
  readonly swim: Spring;
  /** Seconds, wrapped at `AMBIENT_TIME_PERIOD`. */
  clock: number;
  /** Reduced motion holds one heading; null until it is chosen. */
  heldYaw: number | null;
  settledSent: boolean;
  exitedSent: boolean;
  initialised: boolean;
}

export function createNarratorMotionState(clockStart = 0): NarratorMotionState {
  return {
    presence: 0,
    sideX: 0,
    sideY: 0,
    sideZ: 0,
    yaw: { x: 0, v: 0 },
    talk: { x: 0, v: 0 },
    swim: { x: 0, v: 0 },
    clock: Number.isFinite(clockStart) ? clockStart % AMBIENT_TIME_PERIOD : 0,
    heldYaw: null,
    settledSent: false,
    exitedSent: true,
    initialised: false,
  };
}

export interface NarratorFrameInput {
  /** Seconds since the last frame; clamped to [0, NARRATOR_MAX_FRAME]. */
  readonly dt: number;
  readonly present: boolean;
  readonly talking: boolean;
  readonly reducedMotion: boolean;
  /** Heading from the narrator's post toward the camera (parent space), or NaN when unknown. */
  readonly cameraYaw: number;
  /** The heading facing is limited around. */
  readonly restYaw: number;
  /** How far, radians, it may turn from `restYaw` to face the camera. */
  readonly maxTurn: number;
  /** Rendered height, parent units: amplitudes and travel offsets scale with it. */
  readonly height: number;
  /** Where it swims in from, relative to its post, x height (parent axes). */
  readonly enterFrom: Vec3;
  /** Where it swims away to, relative to its post, x height (parent axes). */
  readonly exitTo: Vec3;
}

/** Written every frame by `stepNarrator`; the component copies it onto its groups. */
export interface NarratorPose {
  /** Offset from the post, parent units. */
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  yaw: number;
  pitch: number;
  roll: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  /** Talk beat 0..1 for shader mouths and claws (0 under reduced motion). */
  talk: number;
  /** Swim effort 0..1+ for shader tails. */
  swim: number;
  visible: boolean;
  phase: NarratorPhase;
}

export const createNarratorPose = (): NarratorPose => ({
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
  talk: 0,
  swim: 0,
  visible: false,
  phase: 'gone',
});

export type NarratorEvent = 'settled' | 'exited' | null;

const finiteOr = (x: number, fallback: number): number => (Number.isFinite(x) ? x : fallback);

const IDLE_SWIM = 0.3;
const TRAVEL_SWIM = 1;

/**
 * Advances one frame and writes the pose. Returns 'settled' on the frame it arrives at its post
 * (once per arrival) and 'exited' on the frame it has fully swum away (once per departure).
 *
 * - Present: swims in from `enterFrom` (facing its travel), then turns to the camera, limited to
 *   `maxTurn` around `restYaw`, and idles: a bob and a slow sway.
 * - Talking: rhythmic squash-and-stretch with a hop and a nod on each beat, eased in and out.
 * - Not present: swims away to `exitTo`, accelerating and shrinking away at the end.
 * - Reduced motion: no travel, bob, sway or turning (one heading, chosen on arrival); talking
 *   is only a gentle uniform scale pulse.
 */
export function stepNarrator(
  state: NarratorMotionState,
  input: NarratorFrameInput,
  tuning: NarratorMotionTuning,
  out: NarratorPose
): NarratorEvent {
  const dt = clamp(finiteOr(input.dt, 0), 0, NARRATOR_MAX_FRAME);
  const height = input.height > 0 && Number.isFinite(input.height) ? input.height : 1;
  const reduced = input.reducedMotion;
  const restYaw = wrapAngle(finiteOr(input.restYaw, 0));
  const cameraKnown = Number.isFinite(input.cameraYaw);
  const faceYaw = wrapAngle(
    (cameraKnown ? limitYaw(restYaw, input.cameraYaw, input.maxTurn) : restYaw) + finiteOr(tuning.facingOffset, 0)
  );

  if (!Number.isFinite(state.presence)) state.presence = input.present ? 1 : 0;
  if (!Number.isFinite(state.clock)) state.clock = 0;
  state.clock = (state.clock + dt) % AMBIENT_TIME_PERIOD;

  // --- Presence: which way it is travelling and how far along. ---
  if (state.presence <= 0 && input.present) {
    state.sideX = finiteOr(input.enterFrom[0], 0);
    state.sideY = finiteOr(input.enterFrom[1], 0);
    state.sideZ = finiteOr(input.enterFrom[2], 0);
  } else if (state.presence >= 1 && !input.present) {
    state.sideX = finiteOr(input.exitTo[0], 0);
    state.sideY = finiteOr(input.exitTo[1], 0);
    state.sideZ = finiteOr(input.exitTo[2], 0);
  }
  if (reduced) {
    state.presence = input.present ? 1 : 0;
  } else {
    const rate = input.present
      ? 1 / Math.max(0.05, finiteOr(tuning.enterSeconds, 1))
      : -1 / Math.max(0.05, finiteOr(tuning.exitSeconds, 1));
    state.presence = clamp(state.presence + rate * dt, 0, 1);
  }
  const presence = state.presence;
  const travelling = presence > 0 && presence < 1;

  let event: NarratorEvent = null;
  if (presence >= 1 && input.present) {
    if (!state.settledSent) event = 'settled';
    state.settledSent = true;
  } else state.settledSent = false;
  if (presence <= 0 && !input.present) {
    if (!state.exitedSent) event = 'exited';
    state.exitedSent = true;
  } else state.exitedSent = false;

  // --- Heading. ---
  if (presence <= 0 || !reduced) state.heldYaw = null;
  if (reduced) {
    if (state.heldYaw === null && presence > 0) state.heldYaw = faceYaw;
    state.yaw.x = state.heldYaw ?? faceYaw;
    state.yaw.v = 0;
  } else {
    let targetYaw = faceYaw;
    const leading = input.present ? presence < 0.72 : true;
    const sideLength = Math.hypot(state.sideX, state.sideZ);
    if (travelling && leading && sideLength > 1e-6) {
      // Into its post it swims against the offset; away, along it.
      const direction = input.present ? -1 : 1;
      targetYaw = yawToward(state.sideX * direction, state.sideZ * direction) + finiteOr(tuning.travelYawOffset, 0);
    }
    if (!state.initialised) {
      state.yaw.x = wrapAngle(targetYaw);
      state.yaw.v = 0;
    } else angleSpringStep(state.yaw, targetYaw, 4.2, dt);
  }
  state.initialised = true;

  // --- Talk envelope and swim effort. ---
  const talkTarget = input.talking && input.present ? 1 : 0;
  if (reduced) {
    state.talk.x = talkTarget;
    state.talk.v = 0;
    state.swim.x = 0;
    state.swim.v = 0;
  } else {
    springStep(state.talk, talkTarget, 11, dt);
    springStep(state.swim, travelling ? TRAVEL_SWIM : IDLE_SWIM, 3, dt);
  }
  const envelope = clamp(state.talk.x, 0, 1);

  // --- Pose. ---
  const t = state.clock;
  out.visible = presence > 0;
  out.phase = presence <= 0 ? 'gone' : presence >= 1 ? 'present' : input.present ? 'entering' : 'exiting';
  out.yaw = state.yaw.x;

  if (reduced) {
    const pulse = reducedTalkScale(t, envelope);
    out.offsetX = 0;
    out.offsetY = 0;
    out.offsetZ = 0;
    out.pitch = 0;
    out.roll = 0;
    out.scaleX = pulse;
    out.scaleY = pulse;
    out.scaleZ = pulse;
    out.talk = 0;
    out.swim = 0;
    return event;
  }

  const away = 1 - easeOutCubic(presence);
  const beat = talkPulse(t) * envelope;
  const squash = squashStretch(talkPulse(t), envelope, tuning.talkStretch);
  const appear = smoothstep(0, 0.35, presence);
  const bob = Math.sin(t * 1.6) * tuning.bob * height;

  out.offsetX = state.sideX * away * height;
  out.offsetY = state.sideY * away * height + bob + beat * tuning.talkBounce * height;
  out.offsetZ = state.sideZ * away * height;
  out.roll = Math.sin(t * 1.1 + 0.4) * tuning.sway;
  out.pitch = Math.sin(t * 0.9 + 1.3) * tuning.sway * 0.5 - beat * 0.06;
  out.scaleX = squash.xz * appear;
  out.scaleY = squash.y * appear;
  out.scaleZ = squash.xz * appear;
  out.talk = beat;
  out.swim = Math.max(0, state.swim.x);
  return event;
}
