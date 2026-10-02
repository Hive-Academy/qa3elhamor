import { clamp, smoothstep, talkPulse } from './narrator-motion.js';
import {
  BONE,
  LEFT,
  RIGHT,
  type Side,
  addArm,
  addBone,
  addCrouch,
  addElbow,
  addHand,
  mixArm,
  type RigPose,
} from './narrator-rig.js';

/*
 * The clips: pure pose functions. Each one takes the pose built so far (the rest pose, idle and
 * whatever was layered before it) and adds or overrides the bones it drives, as a function of
 * time and its parameters. The animator (`narrator-animator.ts`) cross-fades their results.
 *
 * Every angular frequency on the wrapping clock `t` is a multiple of 0.02 rad/s, as in
 * `narrator-motion.ts`, so the clock can wrap without a visible step.
 */

/**
 * The idle fidgets: one plays now and then while the narrator has nothing else to do. Each
 * character plays its own few (`ClipStyle.fidgets`): SpongeBob scratches, bounces, looks round
 * and puts his hands on his hips; Patrick dozes off and pats his belly; the Crab Clerk clacks
 * his claws; the Sardine President puffs himself up; the Hamour yawns.
 */
export type NarratorFidgetId = 'scratch' | 'bounce' | 'look' | 'hips' | 'doze' | 'belly' | 'clack' | 'puff' | 'yawn';

export const NARRATOR_FIDGET_IDS: readonly NarratorFidgetId[] = [
  'scratch',
  'bounce',
  'look',
  'hips',
  'doze',
  'belly',
  'clack',
  'puff',
  'yawn',
];

/** How long each fidget lasts, seconds (it eases in and out inside this). */
export const FIDGET_SECONDS: Readonly<Record<NarratorFidgetId, number>> = {
  scratch: 2.8,
  bounce: 1.3,
  look: 3.2,
  hips: 3.6,
  doze: 4.2,
  belly: 2.6,
  clack: 1.6,
  puff: 3.4,
  yawn: 3,
};

/** How long each fidget eases in and out, seconds: an arm lifted far comes up slowly. */
const FIDGET_EASE: Readonly<Record<NarratorFidgetId, number>> = {
  scratch: 0.75,
  bounce: 0.3,
  look: 0.45,
  hips: 0.7,
  doze: 0.4,
  belly: 0.6,
  clack: 0.25,
  puff: 0.8,
  yawn: 0.6,
};

export type NarratorClipId = 'idle' | 'wave' | 'talk' | 'hop' | 'react' | 'listen' | NarratorFidgetId;

export const NARRATOR_CLIP_IDS: readonly NarratorClipId[] = [
  'idle',
  'wave',
  'talk',
  'hop',
  'react',
  'listen',
  ...NARRATOR_FIDGET_IDS,
];

export const isNarratorClipId = (value: unknown): value is NarratorClipId =>
  typeof value === 'string' && (NARRATOR_CLIP_IDS as readonly string[]).includes(value);

export const isNarratorFidgetId = (value: unknown): value is NarratorFidgetId =>
  typeof value === 'string' && (NARRATOR_FIDGET_IDS as readonly string[]).includes(value);

/** Leg lengths, x height, for the crouches (`legLengths(spec)`), and how the arms are bound. */
export interface ClipLegs {
  readonly thigh: number;
  readonly shin: number;
  /** How far the bound arms hang below horizontal, radians (`RigRest.armBind`; default 0). */
  readonly armBind?: number;
}

/** How many seeded phase offsets the idle reads (`IdleDrive.phase`). */
export const IDLE_PHASES = 8;

/** What the idle is driven by beyond the clock: the animator's slow state. */
export interface IdleDrive {
  /** Breathing phase, radians: the animator advances it at a slowly drifting rate. */
  readonly breath: number;
  /** Where the head looks, radians (the animator's glance springs): + yaw is its left, + pitch down. */
  readonly gazeYaw: number;
  readonly gazePitch: number;
  /** Per-narrator phase offsets (seeded, `IDLE_PHASES` of them): two narrators never sway in step. */
  readonly phase: Float64Array;
  /** Multiplies the drifting (`ClipStyle.idle`; default 1). */
  readonly amount?: number;
  /** The breath's squash, x height per unit breath (`ClipStyle.breath.depth`; default 0.013). */
  readonly breathDepth?: number;
}

/**
 * Smooth noise in about -1..1: three detuned sines whose rates share no short common period, so
 * the sum never visibly loops. The rates are multiples of 0.02 rad/s (the clock wraps cleanly).
 */
const drift = (t: number, a: number, b: number, c: number, p: number): number =>
  (Math.sin(t * a + p) + 0.6 * Math.sin(t * b + 1.7 * p + 0.9) + 0.35 * Math.sin(t * c + 2.9 * p + 2.1)) / 1.95;

/**
 * Idle, layered so it never looks frozen and never visibly loops: breathing (a squash, the chest
 * and arms lifting a touch), a slow weight shift from hip to hip (the free knee gives, the chest
 * counters so the head stays level), the arms and elbows drifting each on its own slow noise, a
 * small head tilt, and the head's glance (`drive.gazeYaw` / `gazePitch`, which the animator moves
 * between the camera and a look aside).
 */
export function idleClip(t: number, legs: ClipLegs, drive: IdleDrive, out: RigPose): void {
  const ph = drive.phase;
  const p = (i: number): number => ph[i] ?? 0;
  const k = drive.amount ?? 1;
  const breath = Math.sin(drive.breath);
  out.squash *= 1 + (drive.breathDepth ?? 0.013) * breath;
  addCrouch(out, legs, 0.004 * (1 - breath));
  addBone(out, BONE.chest, -0.012 * breath, 0, 0);

  // Weight shift: + is onto its right leg (the left knee gives).
  const shift = drift(t, 0.22, 0.38, 0.62, p(0)) * k;
  addBone(out, BONE.hips, 0, drift(t, 0.18, 0.34, 0.58, p(1)) * 0.035, shift * 0.04);
  addBone(out, BONE.chest, 0, 0, -shift * 0.025);
  const free = (s: number): number => Math.max(0, s) ** 1.5;
  addBone(out, BONE.hipL, -0.05 * free(shift), 0, 0);
  addBone(out, BONE.kneeL, 0.1 * free(shift), 0, 0);
  addBone(out, BONE.hipR, -0.05 * free(-shift), 0, 0);
  addBone(out, BONE.kneeR, 0.1 * free(-shift), 0, 0);
  out.hipsY -= 0.004 * Math.abs(shift);

  // The head: its glance, a slow tilt, and a breath of nod.
  addBone(
    out,
    BONE.head,
    drive.gazePitch + 0.008 * breath + drift(t, 0.26, 0.46, 0.86, p(2)) * 0.012 * k,
    drive.gazeYaw + drift(t, 0.14, 0.3, 0.54, p(3)) * 0.03 * k,
    drift(t, 0.3, 0.52, 0.94, p(4)) * 0.035 * k - shift * 0.012
  );

  // Arms: breathing lift, and each drifting on its own.
  addArm(out, LEFT, 0.03 * breath + drift(t, 0.4, 0.74, 1.18, p(5)) * 0.04 * k, drift(t, 0.46, 0.82, 1.3, p(6)) * 0.06 * k);
  addArm(out, RIGHT, 0.03 * breath + drift(t, 0.44, 0.7, 1.22, p(6)) * 0.04 * k, drift(t, 0.5, 0.86, 1.34, p(7)) * 0.06 * k);
  addElbow(out, LEFT, 0.06 + drift(t, 0.66, 1.06, 1.5, p(7)) * 0.06 * k);
  addElbow(out, RIGHT, 0.06 + drift(t, 0.62, 1.1, 1.46, p(5)) * 0.06 * k);

  // The extras, for a character that has them: a lazy tail, a jaw that breathes, eye stalks that
  // drift each on its own and follow the glance.
  addBone(out, BONE.tail, 0, drift(t, 0.5, 0.84, 1.26, p(1)) * 0.12 * k, 0);
  addBone(out, BONE.jaw, 0.02 + 0.02 * breath, 0, 0);
  addBone(out, BONE.eyeL, drift(t, 0.38, 0.66, 1.02, p(2)) * 0.05 * k, drive.gazeYaw * 0.8, drift(t, 0.34, 0.62, 1.1, p(3)) * 0.06 * k);
  addBone(out, BONE.eyeR, drift(t, 0.42, 0.7, 0.98, p(4)) * 0.05 * k, drive.gazeYaw * 0.8, drift(t, 0.36, 0.58, 1.06, p(5)) * 0.06 * k);
}

/**
 * Listening, between its lines: arms come a little forward with the forearms up (hands loosely in
 * front), the body leans in, the head tilts with interest and nods now and then.
 */
export function listenClip(t: number, out: RigPose): void {
  addArm(out, LEFT, 0.14, 0.16, 0.05);
  addArm(out, RIGHT, 0.14, 0.16, 0.05);
  addElbow(out, LEFT, 0.45, 0.1);
  addElbow(out, RIGHT, 0.45, 0.1);
  addHand(out, LEFT, 0.1);
  addHand(out, RIGHT, 0.1);
  addBone(out, BONE.chest, 0.035, 0, 0);
  // A slow nod: a soft bump every few seconds, never on a fixed beat.
  const nod = Math.max(0, drift(t, 0.9, 1.46, 2.18, 0.4)) ** 3;
  addBone(out, BONE.head, 0.02 + 0.06 * nod, 0, 0.06);
}

/** 0..1..0 over a fidget of `seconds`: eases in over `inS`, holds, eases out over `outS`. */
export function fidgetEnvelope(s: number, seconds: number, inS = 0.45, outS = 0.55): number {
  if (!(s > 0) || !(s < seconds)) return 0;
  return smoothstep(0, inS, s) * (1 - smoothstep(seconds - outS, seconds, s));
}

const SCRATCH_ARM = { lift: 1.2, swing: -0.3, reach: 0.4 } as const;
const HIPS_ARM = { lift: -0.7, swing: 0.05, reach: 0 } as const;
/** A hand patting the belly: down, well forward and round to the front. */
const BELLY_ARM = { lift: -0.25, swing: 0.55, reach: 0.75 } as const;

/**
 * One fidget at `s` seconds into it, at full weight (the animator eases it in and out with
 * `fidgetEnvelope` and its own gate). Each one starts and ends at the pose it was given.
 *
 * - scratch: the right hand up beside the head, scratching, the head leaning into it;
 * - bounce: two little bounces on the heels, arms flapping;
 * - look: looks round to one side, then the other, then back;
 * - hips: hands on the hips, a proud little lean back;
 * - doze: nods off (the head sinks, the arms go slack), then wakes with a start;
 * - belly: pats its belly, pleased with itself;
 * - clack: both claws up, snapping;
 * - puff: chest out, fins on the "hips", a grand look round;
 * - yawn: a huge jaw-open yawn, fins stretching out.
 */
export function fidgetClip(id: NarratorFidgetId, s: number, legs: ClipLegs, out: RigPose): void {
  const seconds = FIDGET_SECONDS[id];
  const e = fidgetEnvelope(s, seconds, FIDGET_EASE[id], FIDGET_EASE[id]);
  if (e <= 0) return;
  switch (id) {
    case 'scratch': {
      mixArm(out, RIGHT, e, SCRATCH_ARM, { bend: 0.25, curl: 0.55 + 0.12 * Math.sin(s * 15) }, legs.armBind);
      addHand(out, RIGHT, e * 0.35 * Math.sin(s * 15), 0);
      addBone(out, BONE.head, e * 0.03, e * -0.06, e * -0.08);
      return;
    }
    case 'bounce': {
      // Two bounces inside the envelope: a dip, up on the toes, a dip.
      const u = clamp((s - 0.2) / (seconds - 0.4), 0, 1);
      const cycle = Math.sin(u * Math.PI * 4);
      const up = Math.max(0, cycle);
      const dip = Math.max(0, -cycle);
      out.offsetY += e * 0.018 * up;
      out.squash *= 1 + e * (0.03 * up - 0.04 * dip);
      addCrouch(out, legs, e * 0.03 * dip);
      addArm(out, LEFT, e * 0.25 * up, 0);
      addArm(out, RIGHT, e * 0.25 * up, 0);
      return;
    }
    case 'look': {
      // Left, hold, right, hold, back (in the middle of the envelope).
      const u = clamp(s / seconds, 0, 1);
      const side = smoothstep(0.08, 0.28, u) - 2 * smoothstep(0.42, 0.62, u) + smoothstep(0.78, 0.94, u);
      addBone(out, BONE.head, e * 0.02, side * 0.32, side * 0.03);
      addBone(out, BONE.hips, 0, side * 0.08, 0);
      return;
    }
    case 'hips': {
      mixArm(out, LEFT, e, HIPS_ARM, { bend: 0.15, curl: -1.8 }, legs.armBind);
      mixArm(out, RIGHT, e, HIPS_ARM, { bend: 0.15, curl: -1.8 }, legs.armBind);
      addBone(out, BONE.chest, e * -0.05, 0, 0);
      addBone(out, BONE.head, e * -0.03, 0, e * 0.04 * Math.sin(s * 1.6));
      return;
    }
    case 'doze': {
      // Sinks over most of it (the head drops, the body sags, the arms go slack), then a start:
      // a quick jolt upright, and back.
      const u = clamp(s / seconds, 0, 1);
      const sink = smoothstep(0.05, 0.62, u) * (1 - smoothstep(0.7, 0.76, u));
      const start = Math.sin(Math.PI * clamp((u - 0.7) / 0.16, 0, 1));
      addBone(out, BONE.head, e * (0.2 * sink - 0.1 * start), 0, e * 0.06 * sink);
      addBone(out, BONE.chest, e * (0.08 * sink - 0.05 * start), 0, 0);
      addArm(out, LEFT, e * (-0.12 * sink + 0.35 * start), e * 0.05 * sink);
      addArm(out, RIGHT, e * (-0.12 * sink + 0.35 * start), e * 0.05 * sink);
      addCrouch(out, legs, e * 0.012 * sink);
      out.offsetY += e * 0.02 * start;
      out.squash *= 1 - e * (0.02 * sink - 0.03 * start);
      addBone(out, BONE.jaw, e * 0.12 * sink, 0, 0);
      return;
    }
    case 'belly': {
      mixArm(out, LEFT, e, BELLY_ARM, { bend: 0.5, curl: 0 }, legs.armBind);
      const pat = Math.max(0, Math.sin(s * 9));
      addArm(out, LEFT, e * 0.12 * pat, 0);
      addBone(out, BONE.head, e * 0.06, e * 0.12, e * 0.05);
      out.squash *= 1 - e * 0.015;
      return;
    }
    case 'clack': {
      // Both claws up and in, the pincers snapping.
      const snap = Math.max(0, Math.sin(s * 14)) ** 2;
      addArm(out, LEFT, e * 0.6, e * 0.35);
      addArm(out, RIGHT, e * 0.6, e * 0.35);
      addHand(out, LEFT, e * (0.2 + 0.7 * snap));
      addHand(out, RIGHT, e * (0.2 + 0.7 * snap));
      addBone(out, BONE.eyeL, e * -0.1, 0, e * 0.08);
      addBone(out, BONE.eyeR, e * -0.1, 0, e * -0.08);
      out.offsetY += e * 0.01 * snap;
      return;
    }
    case 'puff': {
      // Chest out, nose up, fins on the hips, a slow look round the room.
      const u = clamp(s / seconds, 0, 1);
      addBone(out, BONE.chest, e * -0.16, 0, 0);
      addBone(out, BONE.head, e * -0.08, e * 0.25 * Math.sin(Math.PI * 2 * u), 0);
      addArm(out, LEFT, e * -0.4, e * 0.3);
      addArm(out, RIGHT, e * -0.4, e * 0.3);
      out.squash *= 1 + e * 0.03;
      return;
    }
    case 'yawn': {
      const u = clamp(s / seconds, 0, 1);
      const open = smoothstep(0.1, 0.45, u) * (1 - smoothstep(0.6, 0.9, u));
      addBone(out, BONE.jaw, e * 0.75 * open, 0, 0);
      addBone(out, BONE.head, e * -0.12 * open, 0, 0);
      addArm(out, LEFT, e * 0.6 * open, e * -0.2 * open);
      addArm(out, RIGHT, e * 0.6 * open, e * -0.2 * open);
      addBone(out, BONE.tail, 0, e * 0.2 * open * Math.sin(s * 4), 0);
      out.squash *= 1 + e * 0.03 * open;
      return;
    }
  }
}

/** How long the landing settle lasts, seconds. */
export const SETTLE_SECONDS = 1.1;

/**
 * Settling after a landing, `s` seconds after it: a damped rebound of the body and a lag of the
 * arms, starting and ending at nothing (so it can be added on top of anything).
 */
export function settleClip(s: number, out: RigPose): void {
  if (!(s > 0) || s >= SETTLE_SECONDS) return;
  const a = Math.exp(-4.5 * s) * Math.sin(9.5 * s);
  out.squash *= 1 + 0.05 * a;
  addArm(out, LEFT, 0.2 * a, 0);
  addArm(out, RIGHT, 0.2 * a, 0);
  addBone(out, BONE.head, -0.05 * a, 0, 0);
}

const WAVE_ARM = { lift: 0.75, swing: -0.1, reach: 0.15 } as const;

/** The wave's rock, rad/s on the clip's clock. */
export const WAVE_RATE = 9.4;

/**
 * Wave (the right hand unless `side` says otherwise): the arm comes up and out, the forearm stands
 * up and rocks side to side, the body leans away a little and the head tilts toward the hand.
 * `raise` (0..1) is how far the arm is up (the animator ramps it), so the wave starts and ends
 * with the arm in motion. `lift` is how high, radians above horizontal (`armBind` is the bind's
 * droop, added so the arm is aimed from horizontal whatever the model).
 */
export function waveClip(t: number, raise: number, out: RigPose, side: Side = RIGHT, lift: number = WAVE_ARM.lift, armBind = 0): void {
  const up = smoothstep(0, 1, raise);
  const rock = Math.sin(t * WAVE_RATE);
  // Up ~43 degrees and a little in front (a raised arm swings forward with a
  // negative swing); the forearm stands up and rocks between 60 and 100 degrees, so the hand
  // never passes behind the box (the arm hangs behind its front face).
  mixArm(out, side, up, WAVE_ARM, { bend: 0.1, curl: 0.65 + 0.35 * rock }, lift - WAVE_ARM.lift + armBind);
  addArm(out, side, up * 0.08 * rock, 0);
  // The hand lags the forearm (it flaps against the rock), so it stays upright and outside.
  addHand(out, side, up * (0.1 - 0.35 * rock));
  // Leaning away from the waving side, the head tilting toward it.
  addBone(out, BONE.hips, 0, 0, -side * up * 0.05);
  addBone(out, BONE.head, 0, side * up * 0.08, side * up * 0.06);
}

/**
 * Talk: alternating hand gestures and nods on the speech rhythm (`talkPulse`). `intensity`
 * (0..1) scales the gesturing posture; `rhythm` (0..1, default `intensity`) scales the beat on
 * top of it, so the beat can die away (between lines) while the posture eases out more slowly.
 */
export function talkClip(t: number, intensity: number, out: RigPose, rhythm = intensity): void {
  const k = clamp(intensity, 0, 1);
  if (k <= 0) return;
  const beat = talkPulse(t) * clamp(Number.isFinite(rhythm) ? rhythm : 0, 0, 1);
  // Which hand leads drifts slowly from one to the other.
  const lead = Math.sin(t * 1.9);
  const left = 0.5 + 0.5 * lead;
  const right = 1 - left;
  addArm(out, LEFT, k * (0.45 + 0.38 * left + 0.12 * beat * left), k * (0.3 + 0.25 * left), k * 0.15);
  addArm(out, RIGHT, k * (0.45 + 0.38 * right + 0.12 * beat * right), k * (0.3 + 0.25 * right), k * 0.15);
  addElbow(out, LEFT, k * (0.75 + 0.25 * beat * left), k * 0.25 * left);
  addElbow(out, RIGHT, k * (0.75 + 0.25 * beat * right), k * 0.25 * right);
  addHand(out, LEFT, k * 0.2 * beat * left);
  addHand(out, RIGHT, k * 0.2 * beat * right);
  addBone(out, BONE.head, k * (0.07 * beat - 0.02), k * 0.06 * Math.sin(t * 1.3), k * 0.03 * lead);
  addBone(out, BONE.chest, k * 0.03 * beat, 0, 0);
  out.hipsY -= k * 0.006 * beat;
  // A jaw (or a moustache) works on each syllable; a tail and eye stalks join in.
  addBone(out, BONE.jaw, k * (0.06 + 0.28 * beat), 0, 0);
  addBone(out, BONE.tail, 0, k * 0.1 * lead, 0);
  addBone(out, BONE.eyeL, k * -0.06 * beat, 0, 0);
  addBone(out, BONE.eyeR, k * -0.06 * beat, 0, 0);
}

/** The parts of one hop, as fractions of it. */
const CROUCH_END = 0.2;
const LAND_START = 0.8;
/** Hop height, x height. */
const HOP_HEIGHT = 0.28;

/**
 * One hop, `u` 0..1: crouch (anticipation), spring up with the arms thrown up and the legs
 * tucked, arc, and land into a squashed crouch. `u` 0 and 1 are both the crouch, so hops chain.
 * `height` and `crouchBy` scale the arc and the crouch: a heavy character hops low, lands deep.
 */
export function hopClip(u: number, legs: ClipLegs, out: RigPose, height = 1, crouchBy = 1): void {
  const p = clamp(Number.isFinite(u) ? u : 0, 0, 1);
  let crouch: number;
  let flight = 0;
  // Held deep, then the spring: the crouch unwinds just before take-off.
  if (p < CROUCH_END) crouch = 1 - smoothstep(CROUCH_END * 0.4, CROUCH_END, p);
  else if (p > LAND_START) crouch = smoothstep(LAND_START, 1, p);
  else {
    crouch = 0;
    flight = (p - CROUCH_END) / (LAND_START - CROUCH_END);
  }
  const air = 4 * flight * (1 - flight);
  crouch *= crouchBy;
  // In the air: arms flung up, legs tucked under, body stretched; down: squashed.
  out.offsetY += HOP_HEIGHT * height * air;
  out.squash *= 1 + 0.1 * height * air * (1 - flight) - 0.13 * crouch;
  addCrouch(out, legs, 0.12 * crouch);
  const tuck = Math.sin(Math.PI * flight);
  addBone(out, BONE.hipL, -0.55 * tuck, 0, 0);
  addBone(out, BONE.hipR, -0.55 * tuck, 0, 0);
  addBone(out, BONE.kneeL, 0.9 * tuck, 0, 0);
  addBone(out, BONE.kneeR, 0.9 * tuck, 0, 0);
  const arms = air * 1.6 - crouch * 0.25;
  addArm(out, LEFT, arms, -0.2 * crouch);
  addArm(out, RIGHT, arms, -0.2 * crouch);
  addElbow(out, LEFT, 0.2 * crouch, 0.4 * air);
  addElbow(out, RIGHT, 0.2 * crouch, 0.4 * air);
  addBone(out, BONE.chest, 0.12 * crouch - 0.08 * air, 0, 0);
  addBone(out, BONE.head, -0.06 * air, 0, 0);
}

/** How long a react lasts, seconds. */
export const REACT_SECONDS = 1.1;

/**
 * React (surprised): a quick jump with the arms flung up and the head thrown back, then a
 * landing squash, back to where it was. `s` is seconds since it started (0..REACT_SECONDS).
 */
export function reactClip(s: number, legs: ClipLegs, out: RigPose): void {
  const p = clamp(Number.isFinite(s) ? s / REACT_SECONDS : 1, 0, 1);
  const startle = smoothstep(0, 0.12, p) * (1 - smoothstep(0.55, 1, p));
  const jumpP = clamp((p - 0.06) / 0.42, 0, 1);
  const air = p > 0.06 && p < 0.48 ? 4 * jumpP * (1 - jumpP) : 0;
  const land = p >= 0.48 ? Math.sin(Math.PI * clamp((p - 0.48) / 0.3, 0, 1)) : 0;
  const pre = p < 0.06 ? Math.sin(Math.PI * (p / 0.06)) : 0;
  out.offsetY += 0.16 * air;
  out.squash *= 1 + 0.08 * air - 0.1 * land - 0.06 * pre;
  addCrouch(out, legs, 0.08 * land + 0.05 * pre);
  addArm(out, LEFT, startle * 2.1, startle * 0.3);
  addArm(out, RIGHT, startle * 2.1, startle * 0.3);
  addElbow(out, LEFT, 0, startle * 0.5);
  addElbow(out, RIGHT, 0, startle * 0.5);
  addHand(out, LEFT, startle * 0.4);
  addHand(out, RIGHT, startle * 0.4);
  addBone(out, BONE.chest, -0.12 * startle, 0, 0);
  addBone(out, BONE.head, -0.14 * startle, 0, 0);
  addBone(out, BONE.hipL, -0.3 * air, 0, 0.12 * air);
  addBone(out, BONE.hipR, -0.3 * air, 0, -0.12 * air);
  addBone(out, BONE.kneeL, 0.5 * air, 0, 0);
  addBone(out, BONE.kneeR, 0.5 * air, 0, 0);
  // Mouth open, eye stalks shooting up, tail flicked.
  addBone(out, BONE.jaw, 0.6 * startle, 0, 0);
  addBone(out, BONE.eyeL, -0.35 * startle, 0, 0.15 * startle);
  addBone(out, BONE.eyeR, -0.35 * startle, 0, -0.15 * startle);
  addBone(out, BONE.tail, 0, 0.5 * Math.sin(Math.PI * clamp(p / 0.35, 0, 1)), 0);
}

/**
 * One swim stroke, `u` 0..1 (a fish's way in and out, instead of a hop): the tail sweeps across
 * and back, the body counters it, the fins tuck back along the flanks and the head leads. `u` 0
 * and 1 meet, so strokes chain.
 */
export function swimClip(u: number, out: RigPose): void {
  const p = clamp(Number.isFinite(u) ? u : 0, 0, 1);
  const sweep = Math.sin(Math.PI * 2 * p);
  addBone(out, BONE.tail, 0, 0.55 * sweep, 0);
  addBone(out, BONE.hips, 0, -0.12 * sweep, 0.03 * sweep);
  addBone(out, BONE.head, -0.04, 0.06 * Math.sin(Math.PI * 2 * p - 0.8), 0);
  addArm(out, LEFT, -0.35 + 0.15 * Math.max(0, sweep), 0.2);
  addArm(out, RIGHT, -0.35 + 0.15 * Math.max(0, -sweep), 0.2);
  addBone(out, BONE.jaw, 0.08, 0, 0);
  out.offsetY += 0.015 * Math.sin(Math.PI * 4 * p);
}

/**
 * One scuttle step, `u` 0..1 (a crab's way in and out): a quick, low, bouncing sidestep with the
 * claws up and the shell rocking. `u` 0 and 1 are both the dip, so steps chain.
 */
export function scuttleClip(u: number, legs: ClipLegs, out: RigPose, height = 1): void {
  const p = clamp(Number.isFinite(u) ? u : 0, 0, 1);
  const lift = Math.sin(Math.PI * p);
  out.offsetY += 0.05 * height * lift;
  addCrouch(out, legs, 0.04 * (1 - lift));
  out.squash *= 1 + 0.03 * lift - 0.03 * (1 - lift);
  addBone(out, BONE.hips, 0, 0, 0.06 * Math.sin(Math.PI * 2 * p));
  addArm(out, LEFT, 0.35 + 0.1 * lift, -0.2);
  addArm(out, RIGHT, 0.35 + 0.1 * lift, -0.2);
  addHand(out, LEFT, 0.3 * lift);
  addHand(out, RIGHT, 0.3 * (1 - lift));
  addBone(out, BONE.eyeL, -0.08 * lift, 0, 0.05);
  addBone(out, BONE.eyeR, -0.08 * lift, 0, -0.05);
}
