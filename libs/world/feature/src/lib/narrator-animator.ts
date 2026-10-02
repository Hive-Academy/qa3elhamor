import { AMBIENT_TIME_PERIOD } from './ambient-clock.js';
import {
  REACT_SECONDS,
  hopClip,
  idleClip,
  reactClip,
  talkClip,
  waveClip,
  type ClipLegs,
  type NarratorClipId,
} from './narrator-clips.js';
import { NARRATOR_MAX_FRAME, clamp, smoothstep, type NarratorPhase } from './narrator-motion.js';
import {
  blendRigPose,
  copyRigPose,
  createRigPose,
  legLengths,
  writeRestPose,
  type NarratorRigSpec,
  type RigPose,
} from './narrator-rig.js';

/*
 * The rigged narrator's animator: which clips play, and how much of each, from what the
 * narrator is doing. Pure and allocation-free per frame (the scratch poses live in the state).
 *
 * Ownership: `stepNarrator` (narrator-motion.ts) still owns the body as a whole: presence, the
 * travel to and from the post, facing the visitor and the `settled` / `exited` events. The
 * animator owns the bones, and the hop: its arc is the root bone's offset (`RigPose.offsetY`),
 * which rides on top of the travel. So `narrator-motion.ts` is unchanged.
 *
 * - Entering (presence rising): hops in (`HOPS_IN` hops over the travel), then waves once it has
 *   landed (`GREET_SECONDS`).
 * - Present: idles; talking layers the talk gestures on top (`talk`, the narrator's talk
 *   envelope); `waving` waves for as long as it is set (a farewell, a passer-by).
 * - Exiting: hops away (`HOPS_OUT`).
 * - `poke` (a counter): each change while present plays `react` once.
 * - Reduced motion: the rest pose, still (no idle loop, no hops, no gestures).
 *
 * Every clip fades in and out over `FADE_SECONDS`.
 */

export const FADE_SECONDS = 0.25;
export const GREET_SECONDS = 2.2;
export const HOPS_IN = 3;
export const HOPS_OUT = 2;

export interface NarratorAnimatorInput {
  readonly dt: number;
  /** From `stepNarrator`'s pose. */
  readonly phase: NarratorPhase;
  /** From `stepNarrator`'s state: 0 away .. 1 at its post. */
  readonly presence: number;
  /** The talk envelope, 0..1 (`stepNarrator`'s state). */
  readonly talk: number;
  readonly waving: boolean;
  /** A counter: each change plays `react` once. */
  readonly poke: number;
  readonly reducedMotion: boolean;
  /**
   * Development preview: loop one clip (at full weight), or freeze it at `at` (0..1 through the
   * clip). Null in production.
   */
  readonly hold: NarratorClipHold | null;
}

export interface NarratorClipHold {
  readonly clip: NarratorClipId;
  /** Freezes the clip here (0..1 of its cycle). Omitted: it plays. */
  readonly at?: number;
}

export interface NarratorAnimatorState {
  clock: number;
  talkW: number;
  waveW: number;
  hopW: number;
  reactW: number;
  /** How far the waving arm is up, 0..1. */
  raise: number;
  /** Seconds of greeting wave left. */
  greetLeft: number;
  /** Seconds since `react` started, or -1. */
  reactAt: number;
  /** Where the current (or last) hop is, 0..1. */
  hopU: number;
  lastPhase: NarratorPhase | null;
  lastPoke: number | null;
  readonly rest: RigPose;
  readonly scratch: RigPose;
}

export function createNarratorAnimator(spec: NarratorRigSpec): NarratorAnimatorState {
  const rest = createRigPose();
  writeRestPose(spec.rest, rest);
  return {
    clock: 0,
    talkW: 0,
    waveW: 0,
    hopW: 0,
    reactW: 0,
    raise: 0,
    greetLeft: 0,
    reactAt: -1,
    hopU: 1,
    lastPhase: null,
    lastPoke: null,
    rest,
    scratch: createRigPose(),
  };
}

const approach = (x: number, target: number, step: number): number =>
  x < target ? Math.min(target, x + step) : Math.max(target, x - step);

const legsCache = new WeakMap<NarratorRigSpec, ClipLegs>();
const legsOf = (spec: NarratorRigSpec): ClipLegs => {
  let legs = legsCache.get(spec);
  if (!legs) {
    legs = legLengths(spec);
    legsCache.set(spec, legs);
  }
  return legs;
};

/** Cycle lengths, seconds, of the clips that loop in a preview. */
const HOP_CYCLE = 0.95;
const WAVE_CYCLE = (2 * Math.PI) / 9.4;
const TALK_CYCLE = (2 * Math.PI) / 1.9;
const IDLE_CYCLE = (2 * Math.PI) / 1.6;

/** Advances one frame and writes the bone pose into `out`. */
export function stepNarratorAnimator(
  state: NarratorAnimatorState,
  input: NarratorAnimatorInput,
  spec: NarratorRigSpec,
  out: RigPose
): void {
  const dt = clamp(Number.isFinite(input.dt) ? input.dt : 0, 0, NARRATOR_MAX_FRAME);
  if (!Number.isFinite(state.clock)) state.clock = 0;
  state.clock = (state.clock + dt) % AMBIENT_TIME_PERIOD;
  const legs = legsOf(spec);
  const phase = input.phase;

  // --- Events. ---
  if (state.lastPhase === 'entering' && phase === 'present') state.greetLeft = GREET_SECONDS;
  if (phase !== 'present') state.greetLeft = 0;
  else state.greetLeft = Math.max(0, state.greetLeft - dt);
  const poke = Number.isFinite(input.poke) ? input.poke : 0;
  if (state.lastPoke !== null && poke !== state.lastPoke && phase === 'present') state.reactAt = 0;
  state.lastPoke = poke;
  state.lastPhase = phase;
  if (state.reactAt >= 0) {
    state.reactAt += dt;
    if (state.reactAt >= REACT_SECONDS) state.reactAt = -1;
  }

  copyRigPose(state.rest, out);
  if (input.reducedMotion) {
    state.talkW = 0;
    state.waveW = 0;
    state.hopW = 0;
    state.reactW = 0;
    state.raise = 0;
    return;
  }

  const hold = input.hold;
  const frozen = hold?.at !== undefined && Number.isFinite(hold.at) ? clamp(hold.at, 0, 1) : null;
  const t = state.clock;

  // --- Targets. ---
  const travelling = phase === 'entering' || phase === 'exiting';
  if (phase === 'entering') state.hopU = fract(clamp(input.presence, 0, 1) * HOPS_IN, true);
  else if (phase === 'exiting') state.hopU = fract((1 - clamp(input.presence, 0, 1)) * HOPS_OUT, false);
  let talkT = clamp(Number.isFinite(input.talk) ? input.talk : 0, 0, 1);
  let waveT = phase === 'present' && (input.waving || state.greetLeft > 0) ? 1 : 0;
  let hopT = travelling ? 1 : 0;
  let reactT = state.reactAt >= 0 ? 1 : 0;
  if (hold) {
    talkT = hold.clip === 'talk' ? 1 : 0;
    waveT = hold.clip === 'wave' ? 1 : 0;
    hopT = hold.clip === 'hop' ? 1 : 0;
    reactT = hold.clip === 'react' ? 1 : 0;
  }
  const step = dt / FADE_SECONDS;
  // Travel snaps the hop in: it starts with the crouch the moment the narrator leaves.
  state.hopW = hopT > 0 && travelling ? 1 : approach(state.hopW, hopT, step);
  state.talkW = approach(state.talkW, talkT, step);
  state.waveW = approach(state.waveW, waveT, step);
  state.reactW = approach(state.reactW, reactT, step * 2);
  state.raise = approach(state.raise, waveT, dt / 0.45);

  // --- Pose: idle, then each layer cross-faded over it. ---
  const idleT = hold?.clip === 'idle' && frozen !== null ? frozen * IDLE_CYCLE : t;
  idleClip(idleT, legs, out);
  const scratch = state.scratch;

  if (state.talkW > 0) {
    copyRigPose(out, scratch);
    talkClip(hold?.clip === 'talk' && frozen !== null ? frozen * TALK_CYCLE : t, 1, scratch);
    // The talk envelope is already smooth: it is the layer's weight as it is.
    blendRigPose(out, scratch, state.talkW);
  }
  if (state.waveW > 0) {
    copyRigPose(out, scratch);
    const waveTime = hold?.clip === 'wave' && frozen !== null ? frozen * WAVE_CYCLE : t;
    waveClip(waveTime, hold?.clip === 'wave' ? 1 : state.raise, scratch);
    blendRigPose(out, scratch, smoothstep(0, 1, state.waveW));
  }
  if (state.reactW > 0) {
    copyRigPose(out, scratch);
    const since = hold?.clip === 'react' ? (frozen ?? (t % (REACT_SECONDS + 0.4)) / REACT_SECONDS) * REACT_SECONDS : state.reactAt;
    reactClip(since < 0 ? REACT_SECONDS : since, legs, scratch);
    blendRigPose(out, scratch, smoothstep(0, 1, state.reactW));
  }
  if (state.hopW > 0) {
    copyRigPose(out, scratch);
    const u = hold?.clip === 'hop' ? (frozen ?? (t % HOP_CYCLE) / HOP_CYCLE) : state.hopU;
    hopClip(u, legs, scratch);
    blendRigPose(out, scratch, smoothstep(0, 1, state.hopW));
  }
}

/**
 * The fractional part of `x`, where a whole number reads as the end of a hop (`atEnd`, so the
 * last hop lands at presence 1) or its start.
 */
function fract(x: number, atEnd: boolean): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  const f = x - Math.floor(x);
  return f === 0 && atEnd ? 1 : f;
}
