import { AMBIENT_TIME_PERIOD } from './ambient-clock.js';
import {
  FIDGET_SECONDS,
  IDLE_PHASES,
  NARRATOR_FIDGET_IDS,
  REACT_SECONDS,
  SETTLE_SECONDS,
  fidgetClip,
  hopClip,
  idleClip,
  scuttleClip,
  swimClip,
  isNarratorFidgetId,
  listenClip,
  reactClip,
  settleClip,
  talkClip,
  waveClip,
  type ClipLegs,
  type IdleDrive,
  type NarratorClipId,
  type NarratorFidgetId,
} from './narrator-clips.js';
import { NARRATOR_MAX_FRAME, clamp, smoothstep, springStep, type NarratorPhase, type Spring } from './narrator-motion.js';
import { DEFAULT_CLIP_STYLE, SPONGEBOB_STYLE, type ClipStyle } from './narrator-clip-style.js';
import {
  BONE,
  addBone,
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
 * narrator is doing. Pure, deterministic for a seed, and allocation-free per frame (the scratch
 * poses live in the state).
 *
 * Ownership: `stepNarrator` (narrator-motion.ts) still owns the body as a whole: presence, the
 * travel to and from the post, facing the visitor and the `settled` / `exited` events. The
 * animator owns the bones, and the hop: its arc is the root bone's offset (`RigPose.offsetY`),
 * which rides on top of the travel.
 *
 * - Entering (presence rising): hops in (`ClipStyle.hop.hopsIn` hops over the travel; a fish swims
 *   in, a crab scuttles), lands with a settle, then waves (`GREET_SECONDS`).
 * - Present: idles (breathing, a weight shift, drifting arms, glances, and a fidget every
 *   `FIDGET_GAP` seconds). Talking layers the talk gestures on top; between lines it eases into
 *   a listening pose rather than dropping to idle. `waving` waves for as long as it is set.
 * - Exiting: hops away (`ClipStyle.hop.hopsOut`).
 *
 * Each character plays all of this in its own way (`ClipStyle`, from `spec.style`): the idle and
 * talk tempo, how big the gestures are, which arm waves, its fidgets and how it travels. The
 * styled clocks (idle, talk, wave) each advance at their own rate and wrap like the main clock.
 * - `poke` (a counter): each change while present plays `react` once.
 * - Reduced motion: the rest pose, still (no idle, no hops, no gestures).
 *
 * Nothing switches: every layer's weight is a critically damped spring with its own in and out
 * times (`BLEND`), so each starts and stops with no jolt. A discrete jump (a phase that reverses
 * mid-hop, a new held clip, a hand-over from another narrator's pose) is absorbed by an offset
 * from the last pose shown that decays over `INERTIA_SECONDS`: the pose never pops.
 */

export const GREET_SECONDS = 2.2;
/** SpongeBob's hops in and out (each style sets its own: `ClipStyle.hop`). */
export const HOPS_IN = SPONGEBOB_STYLE.hop.hopsIn;
export const HOPS_OUT = SPONGEBOB_STYLE.hop.hopsOut;

/** Seconds a layer takes to blend in, and out (to 95%). */
export const BLEND = {
  talk: { in: 0.5, out: 0.65 },
  listen: { in: 0.6, out: 0.7 },
  wave: { in: 0.55, out: 0.7 },
  react: { in: 0.1, out: 0.35 },
  hop: { in: 0.18, out: 0.75 },
  fidget: { in: 0.35, out: 0.6 },
} as const;

/** The talk envelope's attack and release, seconds (to 95%). */
export const TALK_ATTACK = 0.15;
export const TALK_RELEASE = 0.6;
/** How long it stays engaged (listening) after it last talked, seconds. */
export const LISTEN_HOLD = 5;
/** A discrete jump in the pose is absorbed over this long, seconds. */
export const INERTIA_SECONDS = 0.45;
/** The greeting wave waits this long after landing, for the settle, seconds. */
export const GREET_DELAY = 0.35;
/** Seconds between two fidgets, the least and the most: SpongeBob's (`ClipStyle.fidgetGap`). */
export const FIDGET_GAP = SPONGEBOB_STYLE.fidgetGap;
/** Seconds between two glances, the least and the most. */
const GLANCE_GAP = { min: 1.6, max: 5 } as const;

export interface NarratorAnimatorInput {
  readonly dt: number;
  /** From `stepNarrator`'s pose. */
  readonly phase: NarratorPhase;
  /** From `stepNarrator`'s state: 0 away .. 1 at its post. */
  readonly presence: number;
  /** How much it is talking, 0..1 (`stepNarrator`'s talk spring): the animator shapes it further. */
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
  /** How this character plays the clips. */
  readonly style: ClipStyle;
  /** The styled clocks: seconds at the style's idle, talk and wave tempo, wrapped like `clock`. */
  idleClock: number;
  talkClock: number;
  waveClock: number;
  /** The seeded generator's state (mulberry32): fidgets and glances, never `Math.random`. */
  rng: number;
  /** Per-narrator idle phase offsets (from the seed). */
  readonly phase: Float64Array;
  /** Breathing phase, radians, wrapped at 2 pi. */
  breath: number;
  /** The shaped talk envelope (fast attack, slow release). */
  readonly talkEnv: Spring;
  readonly talkW: Spring;
  readonly listenW: Spring;
  /** Seconds of listening left since it last talked. */
  engagedLeft: number;
  readonly waveW: Spring;
  readonly hopW: Spring;
  readonly reactW: Spring;
  /** How free it is to fidget (0 while it talks, waves, reacts or travels). */
  readonly fidgetGate: Spring;
  /** Seconds of greeting wave left (its first `GREET_DELAY` is the wait before it). */
  greetLeft: number;
  /** Seconds since `react` started, or -1. */
  reactAt: number;
  /** Seconds since it landed, or -1. */
  settleAt: number;
  /** Where the current (or last) hop is, 0..1. */
  hopU: number;
  /** The fidget playing, and seconds into it. */
  fidget: NarratorFidgetId | null;
  fidgetAt: number;
  lastFidget: NarratorFidgetId | null;
  /** Idle seconds until the next fidget starts. */
  nextFidgetIn: number;
  readonly gazeYaw: Spring;
  readonly gazePitch: Spring;
  gazeYawTarget: number;
  gazePitchTarget: number;
  nextGlanceIn: number;
  lastPhase: NarratorPhase | null;
  lastPoke: number | null;
  lastHoldClip: NarratorClipId | null;
  lastHoldAt: number;
  /** Seconds the inertia offset has left, and the offset itself (`last` minus the new pose). */
  inertiaLeft: number;
  readonly inertia: RigPose;
  /** The last pose written (or a hand-over pose), and whether there is one. */
  readonly last: RigPose;
  hasLast: boolean;
  /** True: the next step absorbs the jump from `last` (an event, or a hand-over). */
  blendFromLast: boolean;
  readonly rest: RigPose;
  readonly scratch: RigPose;
}

const spring = (x = 0): Spring => ({ x, v: 0 });
const still = (s: Spring): void => {
  s.x = 0;
  s.v = 0;
};

/** Next number from the seeded generator, 0..1 (mulberry32). */
export function nextRandom(state: { rng: number }): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** The animator for `spec`. `seed` (any finite number) makes its idle and fidgets its own. */
export function createNarratorAnimator(spec: NarratorRigSpec, seed = 1): NarratorAnimatorState {
  const style = spec.style ?? DEFAULT_CLIP_STYLE;
  const rest = createRigPose();
  writeRestPose(spec.rest, rest);
  addBone(rest, BONE.chest, style.posture.chest, 0, 0);
  addBone(rest, BONE.head, style.posture.head, 0, 0);
  const state: NarratorAnimatorState = {
    clock: 0,
    style,
    idleClock: 0,
    talkClock: 0,
    waveClock: 0,
    rng: (Number.isFinite(seed) ? Math.floor(seed) : 1) >>> 0,
    phase: new Float64Array(IDLE_PHASES),
    breath: 0,
    talkEnv: spring(),
    talkW: spring(),
    listenW: spring(),
    engagedLeft: 0,
    waveW: spring(),
    hopW: spring(),
    reactW: spring(),
    fidgetGate: spring(),
    greetLeft: 0,
    reactAt: -1,
    settleAt: -1,
    hopU: 1,
    fidget: null,
    fidgetAt: 0,
    lastFidget: null,
    nextFidgetIn: 0,
    gazeYaw: spring(),
    gazePitch: spring(),
    gazeYawTarget: 0,
    gazePitchTarget: 0,
    nextGlanceIn: 0,
    lastPhase: null,
    lastPoke: null,
    lastHoldClip: null,
    lastHoldAt: Number.NaN,
    inertiaLeft: 0,
    inertia: createRigPose(),
    last: createRigPose(),
    hasLast: false,
    blendFromLast: false,
    rest,
    scratch: createRigPose(),
  };
  for (let i = 0; i < IDLE_PHASES; i++) state.phase[i] = nextRandom(state) * Math.PI * 2;
  state.breath = nextRandom(state) * Math.PI * 2;
  state.nextFidgetIn = gap(state, style.fidgetGap);
  state.nextGlanceIn = gap(state, GLANCE_GAP);
  return state;
}

/**
 * Starts the animator from `pose` (another narrator's last pose, handed over): its next step
 * blends from there instead of popping to its own pose.
 */
export function seedNarratorAnimator(state: NarratorAnimatorState, pose: RigPose): void {
  copyRigPose(pose, state.last);
  state.hasLast = true;
  state.blendFromLast = true;
}

const gap = (state: NarratorAnimatorState, range: { readonly min: number; readonly max: number }): number =>
  range.min + (range.max - range.min) * nextRandom(state);

/** A critically damped spring that settles in `inS` (rising) or `outS` (falling) seconds. */
function ease(s: Spring, target: number, inS: number, outS: number, dt: number): number {
  const seconds = target >= s.x ? inS : outS;
  springStep(s, target, 4.74 / seconds, dt);
  return clamp(s.x, 0, 1);
}

const legsCache = new WeakMap<NarratorRigSpec, ClipLegs>();
const legsOf = (spec: NarratorRigSpec): ClipLegs => {
  let legs = legsCache.get(spec);
  if (!legs) {
    legs = { ...legLengths(spec), armBind: spec.rest.armBind ?? 0 };
    legsCache.set(spec, legs);
  }
  return legs;
};

/** Cycle lengths, seconds, of the clips that loop in a preview. */
const HOP_CYCLE = 0.95;
const WAVE_CYCLE = (2 * Math.PI) / 9.4;
const TALK_CYCLE = (2 * Math.PI) / 1.9;
const IDLE_CYCLE = 40;

/** The idle's drive, reused (no allocation per frame). */
type MutableDrive = { -readonly [K in keyof IdleDrive]-?: IdleDrive[K] };
const drive: MutableDrive = {
  breath: 0,
  gazeYaw: 0,
  gazePitch: 0,
  phase: new Float64Array(IDLE_PHASES),
  amount: 1,
  breathDepth: 0.013,
};

/** `clock` advanced by `dt` at `rate`, wrapped like the main clock (a corrupt clock restarts). */
const advance = (clock: number, dt: number, rate: number): number =>
  ((Number.isFinite(clock) ? clock : 0) + dt * (Number.isFinite(rate) && rate > 0 ? rate : 1)) % AMBIENT_TIME_PERIOD;

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
  const style = state.style;
  state.idleClock = advance(state.idleClock, dt, style.tempo);
  state.talkClock = advance(state.talkClock, dt, style.talk.tempo);
  state.waveClock = advance(state.waveClock, dt, style.wave.tempo);
  const legs = legsOf(spec);
  const phase = input.phase;
  const hold = input.hold;
  const frozen = hold?.at !== undefined && Number.isFinite(hold.at) ? clamp(hold.at, 0, 1) : null;
  const first = !state.hasLast;

  // --- Events. ---
  if (state.lastPhase === 'entering' && phase === 'present') {
    state.greetLeft = GREET_SECONDS + GREET_DELAY;
    state.settleAt = 0;
  }
  if (phase !== 'present') state.greetLeft = 0;
  else state.greetLeft = Math.max(0, state.greetLeft - dt);
  const poke = Number.isFinite(input.poke) ? input.poke : 0;
  if (state.lastPoke !== null && poke !== state.lastPoke && phase === 'present') state.reactAt = 0;
  state.lastPoke = poke;
  // A jump the springs cannot smooth: a phase change (a hop that reverses), a new held clip.
  const holdClip = hold?.clip ?? null;
  const holdAt = frozen ?? Number.NaN;
  const sameAt = holdAt === state.lastHoldAt || (Number.isNaN(holdAt) && Number.isNaN(state.lastHoldAt));
  const holdChanged = holdClip !== state.lastHoldClip || !sameAt;
  if (!first && ((state.lastPhase !== null && phase !== state.lastPhase) || holdChanged)) state.blendFromLast = true;
  state.lastPhase = phase;
  state.lastHoldClip = holdClip;
  state.lastHoldAt = holdAt;
  if (state.reactAt >= 0) {
    state.reactAt += dt;
    if (state.reactAt >= REACT_SECONDS) state.reactAt = -1;
  }
  if (state.settleAt >= 0) {
    state.settleAt += dt;
    if (state.settleAt >= SETTLE_SECONDS) state.settleAt = -1;
  }

  copyRigPose(state.rest, out);
  if (input.reducedMotion) {
    still(state.talkEnv);
    still(state.talkW);
    still(state.listenW);
    still(state.waveW);
    still(state.hopW);
    still(state.reactW);
    still(state.fidgetGate);
    state.fidget = null;
    state.settleAt = -1;
    state.inertiaLeft = 0;
    state.blendFromLast = false;
    copyRigPose(out, state.last);
    state.hasLast = true;
    return;
  }

  const t = state.clock;
  const idleClock = state.idleClock;

  // --- Targets. ---
  const travelling = phase === 'entering' || phase === 'exiting';
  if (phase === 'entering') state.hopU = fract(clamp(input.presence, 0, 1) * style.hop.hopsIn, true);
  else if (phase === 'exiting') state.hopU = fract((1 - clamp(input.presence, 0, 1)) * style.hop.hopsOut, false);
  const talkIn = clamp(Number.isFinite(input.talk) ? input.talk : 0, 0, 1);
  let waveT = phase === 'present' && (input.waving || (state.greetLeft > 0 && state.greetLeft <= GREET_SECONDS)) ? 1 : 0;
  let hopT = travelling ? 1 : 0;
  let reactT = state.reactAt >= 0 ? 1 : 0;
  let talkPostureT = talkIn > 0.02 ? 1 : 0;
  if (talkIn > 0.02) state.engagedLeft = LISTEN_HOLD;
  else state.engagedLeft = Math.max(0, state.engagedLeft - dt);
  let listenT = state.engagedLeft > 0 && phase === 'present' ? 1 : 0;
  let talkTarget = talkIn;
  if (hold) {
    talkTarget = hold.clip === 'talk' ? 1 : 0;
    talkPostureT = talkTarget;
    waveT = hold.clip === 'wave' ? 1 : 0;
    hopT = hold.clip === 'hop' ? 1 : 0;
    reactT = hold.clip === 'react' ? 1 : 0;
    listenT = hold.clip === 'listen' ? 1 : 0;
  }
  const free =
    !hold && phase === 'present' && waveT === 0 && state.greetLeft <= 0 && reactT === 0 && talkPostureT === 0 && state.engagedLeft <= 0 ? 1 : 0;

  // --- Weights: springs (a fresh animator starts at its targets: there is nothing to blend from). ---
  if (first) {
    state.talkEnv.x = talkTarget;
    state.talkW.x = talkPostureT;
    state.listenW.x = listenT * (1 - talkPostureT);
    state.waveW.x = waveT;
    state.hopW.x = hopT;
    state.reactW.x = reactT;
    state.fidgetGate.x = free;
  }
  const env = ease(state.talkEnv, talkTarget, TALK_ATTACK, TALK_RELEASE, dt);
  const talkW = ease(state.talkW, talkPostureT, BLEND.talk.in, BLEND.talk.out, dt);
  const listenW = ease(state.listenW, listenT * (1 - talkPostureT), BLEND.listen.in, BLEND.listen.out, dt);
  const waveW = ease(state.waveW, waveT, BLEND.wave.in, BLEND.wave.out, dt);
  const hopW = ease(state.hopW, hopT, BLEND.hop.in, BLEND.hop.out, dt);
  const reactW = ease(state.reactW, reactT, BLEND.react.in, BLEND.react.out, dt);
  const gate = ease(state.fidgetGate, free, BLEND.fidget.in, BLEND.fidget.out, dt);

  // --- Fidgets: one every FIDGET_GAP seconds of free time, never the same twice running. ---
  if (state.fidget) {
    state.fidgetAt += dt;
    if (state.fidgetAt >= FIDGET_SECONDS[state.fidget]) {
      state.fidget = null;
      state.nextFidgetIn = gap(state, style.fidgetGap);
    }
  } else if (free) {
    state.nextFidgetIn -= dt;
    if (state.nextFidgetIn <= 0) startFidget(state, pickFidget(state));
  }

  // --- Glances: between the camera and a look aside, held for a while each. ---
  state.nextGlanceIn -= dt * style.tempo;
  if (state.nextGlanceIn <= 0) {
    const atCamera = env > 0.3 || nextRandom(state) < 0.45;
    state.gazeYawTarget = atCamera ? 0 : (nextRandom(state) * 2 - 1) * 0.28;
    state.gazePitchTarget = atCamera ? 0 : (nextRandom(state) * 2 - 1) * 0.06;
    state.nextGlanceIn = gap(state, GLANCE_GAP);
  }
  springStep(state.gazeYaw, state.gazeYawTarget, 7, dt);
  springStep(state.gazePitch, state.gazePitchTarget, 7, dt);

  // Breathing at a slowly drifting rate (a little quicker while talking).
  if (!Number.isFinite(state.breath)) state.breath = 0;
  const breathRate = (1.45 + 0.2 * Math.sin(t * 0.08 + (state.phase[0] ?? 0)) + 0.4 * talkW) * style.breath.rate;
  state.breath = (state.breath + breathRate * dt) % (Math.PI * 2);

  // --- Pose: the idle, then each layer blended over it. ---
  drive.breath = state.breath;
  const glance = 1 - 0.7 * Math.max(talkW, listenW);
  drive.gazeYaw = state.gazeYaw.x * glance;
  drive.gazePitch = state.gazePitch.x * glance;
  drive.phase.set(state.phase);
  drive.amount = style.idle;
  drive.breathDepth = style.breath.depth;
  const idleT = hold?.clip === 'idle' && frozen !== null ? frozen * IDLE_CYCLE : idleClock;
  idleClip(idleT, legs, drive, out);
  if (state.settleAt >= 0) settleClip(state.settleAt, out);
  const scratch = state.scratch;

  if (listenW > 0) {
    copyRigPose(out, scratch);
    listenClip(idleClock, scratch);
    blendRigPose(out, scratch, listenW);
  }
  if (talkW > 0) {
    copyRigPose(out, scratch);
    const talkT = hold?.clip === 'talk' && frozen !== null ? frozen * TALK_CYCLE : state.talkClock;
    // The posture follows the slower weight; the beat follows the envelope, dying away first.
    talkClip(talkT, style.talk.amplitude, scratch, hold?.clip === 'talk' ? 1 : env);
    blendRigPose(out, scratch, talkW);
  }
  const heldFidget = hold && isNarratorFidgetId(hold.clip) ? hold.clip : null;
  if (heldFidget) {
    const seconds = FIDGET_SECONDS[heldFidget];
    const s = frozen !== null ? 0.05 + frozen * (seconds - 0.1) : t % (seconds + 0.6);
    fidgetClip(heldFidget, s, legs, out);
  } else if (state.fidget && gate > 0) {
    copyRigPose(out, scratch);
    fidgetClip(state.fidget, state.fidgetAt, legs, scratch);
    blendRigPose(out, scratch, gate);
  }
  if (waveW > 0) {
    copyRigPose(out, scratch);
    const waveTime = hold?.clip === 'wave' && frozen !== null ? frozen * WAVE_CYCLE : state.waveClock;
    waveClip(waveTime, 1, scratch, style.wave.side, style.wave.lift, legs.armBind);
    blendRigPose(out, scratch, waveW);
  }
  if (reactW > 0) {
    copyRigPose(out, scratch);
    const since = hold?.clip === 'react' ? (frozen ?? (t % (REACT_SECONDS + 0.4)) / REACT_SECONDS) * REACT_SECONDS : state.reactAt;
    reactClip(since < 0 ? REACT_SECONDS : since, legs, scratch);
    blendRigPose(out, scratch, reactW * style.react);
  }
  if (hopW > 0) {
    copyRigPose(out, scratch);
    const u = hold?.clip === 'hop' ? (frozen ?? (t % HOP_CYCLE) / HOP_CYCLE) : state.hopU;
    travelClip(style, u, legs, scratch);
    blendRigPose(out, scratch, hopW);
  }

  // --- Inertia: a jump becomes an offset from the last pose, decaying to nothing. ---
  if (state.blendFromLast && state.hasLast) {
    diffRigPose(state.last, out, state.inertia);
    state.inertiaLeft = INERTIA_SECONDS;
  }
  state.blendFromLast = false;
  if (state.inertiaLeft > 0) {
    addScaledRigPose(out, state.inertia, smoothstep(0, INERTIA_SECONDS, state.inertiaLeft));
    state.inertiaLeft = Math.max(0, state.inertiaLeft - dt);
  }
  copyRigPose(out, state.last);
  state.hasLast = true;
}

/** One hop, stroke or scuttle step of the style's way of travelling, `u` 0..1 through it. */
function travelClip(style: ClipStyle, u: number, legs: ClipLegs, out: RigPose): void {
  if (style.locomotion === 'swim') swimClip(u, out);
  else if (style.locomotion === 'scuttle') scuttleClip(u, legs, out, style.hop.height);
  else hopClip(u, legs, out, style.hop.height, style.hop.crouch);
}

function startFidget(state: NarratorAnimatorState, id: NarratorFidgetId): void {
  state.fidget = id;
  state.fidgetAt = 0;
  state.lastFidget = id;
}

/** One of the style's fidgets other than the last one, picked by the seeded generator. */
function pickFidget(state: NarratorAnimatorState): NarratorFidgetId {
  const set = state.style.fidgets.length > 0 ? state.style.fidgets : NARRATOR_FIDGET_IDS;
  const skip = state.lastFidget !== null && set.length > 1 && set.includes(state.lastFidget);
  const choices = set.length - (skip ? 1 : 0);
  let k = Math.min(choices - 1, Math.floor(nextRandom(state) * choices));
  for (const id of set) {
    if (skip && id === state.lastFidget) continue;
    if (k-- === 0) return id;
  }
  return set[0] ?? 'look';
}

/** `out` = `a` minus `b`, channel by channel (squash as a difference too). */
function diffRigPose(a: RigPose, b: RigPose, out: RigPose): void {
  for (let i = 0; i < out.rot.length; i++) out.rot[i] = (a.rot[i] ?? 0) - (b.rot[i] ?? 0);
  out.offsetX = a.offsetX - b.offsetX;
  out.offsetY = a.offsetY - b.offsetY;
  out.offsetZ = a.offsetZ - b.offsetZ;
  out.hipsY = a.hipsY - b.hipsY;
  out.squash = a.squash - b.squash;
}

/** `out` += `offset` x `k`. */
function addScaledRigPose(out: RigPose, offset: RigPose, k: number): void {
  for (let i = 0; i < out.rot.length; i++) out.rot[i] = (out.rot[i] ?? 0) + (offset.rot[i] ?? 0) * k;
  out.offsetX += offset.offsetX * k;
  out.offsetY += offset.offsetY * k;
  out.offsetZ += offset.offsetZ * k;
  out.hipsY += offset.hipsY * k;
  out.squash = Math.max(0.05, out.squash + offset.squash * k);
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
