import { clamp, smoothstep, talkPulse } from './narrator-motion.js';
import {
  BONE,
  LEFT,
  RIGHT,
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

export type NarratorClipId = 'idle' | 'wave' | 'talk' | 'hop' | 'react';

export const NARRATOR_CLIP_IDS: readonly NarratorClipId[] = ['idle', 'wave', 'talk', 'hop', 'react'];

export const isNarratorClipId = (value: unknown): value is NarratorClipId =>
  typeof value === 'string' && (NARRATOR_CLIP_IDS as readonly string[]).includes(value);

/** Leg lengths, x height, for the crouches (`legLengths(spec)`). */
export interface ClipLegs {
  readonly thigh: number;
  readonly shin: number;
}

/** A sharp, periodic bump (0..1): a quick head tilt every so often, like a blink. */
const bump = (t: number, rate: number, sharpness: number): number => Math.max(0, Math.sin(t * rate)) ** sharpness;

/**
 * Idle: breathing (a slow squash and a little knee give), a gentle sway of the hips, the arms
 * swinging a touch out of step, and now and then a quick tilt of the head.
 */
export function idleClip(t: number, legs: ClipLegs, out: RigPose): void {
  const breath = Math.sin(t * 1.6);
  out.squash *= 1 + 0.014 * breath;
  addCrouch(out, legs, 0.006 * (1 - breath));
  addBone(out, BONE.hips, 0, Math.sin(t * 0.7) * 0.05, Math.sin(t * 1.1 + 0.4) * 0.025);
  addBone(out, BONE.head, Math.sin(t * 0.9 + 1.3) * 0.02, 0, Math.sin(t * 0.9) * 0.02 + bump(t, 1.24, 14) * 0.07);
  addArm(out, LEFT, 0.04 * breath, Math.sin(t * 1.6 + 0.6) * 0.07);
  addArm(out, RIGHT, 0.04 * breath, Math.sin(t * 1.6 + 2.2) * 0.07);
  addElbow(out, LEFT, Math.max(0, Math.sin(t * 1.6 + 0.6)) * 0.08);
  addElbow(out, RIGHT, Math.max(0, Math.sin(t * 1.6 + 2.2)) * 0.08);
}

const WAVE_ARM = { lift: 0.75, swing: -0.1, reach: 0.15 } as const;

/**
 * Wave (the right hand): the arm comes up and out, the forearm stands up and rocks side to side,
 * the body leans away a little and the head tilts toward the hand. `raise` (0..1) is how far
 * the arm is up (the animator ramps it), so the wave starts and ends with the arm in motion.
 */
export function waveClip(t: number, raise: number, out: RigPose): void {
  const up = smoothstep(0, 1, raise);
  const rock = Math.sin(t * 9.4);
  // Up ~43 degrees and a little in front (a raised arm swings forward with a
  // negative swing); the forearm stands up and rocks between 60 and 100 degrees, so the hand
  // never passes behind the box (the arm hangs behind its front face).
  mixArm(out, RIGHT, up, WAVE_ARM, { bend: 0.1, curl: 0.65 + 0.35 * rock });
  addArm(out, RIGHT, up * 0.08 * rock, 0);
  // The hand lags the forearm (it flaps against the rock), so it stays upright and outside.
  addHand(out, RIGHT, up * (0.1 - 0.35 * rock));
  addBone(out, BONE.hips, 0, 0, up * 0.05);
  addBone(out, BONE.head, 0, up * -0.08, up * -0.06);
}

/**
 * Talk: alternating hand gestures and nods on the speech rhythm (`talkPulse`). `intensity`
 * (0..1) scales everything: the narrator's talk envelope.
 */
export function talkClip(t: number, intensity: number, out: RigPose): void {
  const k = clamp(intensity, 0, 1);
  if (k <= 0) return;
  const beat = talkPulse(t);
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
}

/** The parts of one hop, as fractions of it. */
const CROUCH_END = 0.2;
const LAND_START = 0.8;
/** Hop height, x height. */
const HOP_HEIGHT = 0.28;

/**
 * One hop, `u` 0..1: crouch (anticipation), spring up with the arms thrown up and the legs
 * tucked, arc, and land into a squashed crouch. `u` 0 and 1 are both the crouch, so hops chain.
 */
export function hopClip(u: number, legs: ClipLegs, out: RigPose): void {
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
  // In the air: arms flung up, legs tucked under, body stretched; down: squashed.
  out.offsetY += HOP_HEIGHT * air;
  out.squash *= 1 + 0.1 * air * (1 - flight) - 0.13 * crouch;
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
}
