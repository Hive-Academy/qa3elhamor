import { describe, expect, it } from 'vitest';
import {
  FADE_SECONDS,
  GREET_SECONDS,
  createNarratorAnimator,
  stepNarratorAnimator,
  type NarratorAnimatorInput,
  type NarratorAnimatorState,
} from './narrator-animator.js';
import { REACT_SECONDS, hopClip, isNarratorClipId, reactClip, waveClip } from './narrator-clips.js';
import { BONE, SPONGEBOB_RIG, createRigPose, legLengths, rigPoseFinite, writeRestPose, type RigPose } from './narrator-rig.js';

const BASE: NarratorAnimatorInput = {
  dt: 1 / 60,
  phase: 'present',
  presence: 1,
  talk: 0,
  waving: false,
  poke: 0,
  reducedMotion: false,
  hold: null,
};

function run(state: NarratorAnimatorState, seconds: number, input: Partial<NarratorAnimatorInput> = {}): RigPose {
  const out = createRigPose();
  const frames = Math.max(1, Math.round(seconds * 60));
  for (let i = 0; i < frames; i++) stepNarratorAnimator(state, { ...BASE, ...input }, SPONGEBOB_RIG, out);
  return out;
}

const shoulderR = (pose: RigPose): number => pose.rot[BONE.shoulderR * 3 + 2] ?? 0;
const rest = (() => {
  const pose = createRigPose();
  writeRestPose(SPONGEBOB_RIG.rest, pose);
  return pose;
})();

describe('stepNarratorAnimator', () => {
  it('holds the rest pose under reduced motion: no idle loop, no hop, no wave, no gesture', () => {
    const state = createNarratorAnimator(SPONGEBOB_RIG);
    for (const input of [
      { phase: 'entering', presence: 0.4 },
      { talk: 1, waving: true },
      { poke: 3 },
      { hold: { clip: 'wave' } },
    ] as Partial<NarratorAnimatorInput>[]) {
      const a = run(state, 0.5, { ...input, reducedMotion: true });
      const b = run(state, 0.7, { ...input, reducedMotion: true });
      expect(Array.from(a.rot)).toEqual(Array.from(rest.rot));
      expect(Array.from(b.rot)).toEqual(Array.from(rest.rot));
      expect(a.offsetY).toBe(0);
      expect(a.squash).toBe(1);
    }
  });

  it('idles around the rest pose: it breathes (moves) but stays near it', () => {
    const state = createNarratorAnimator(SPONGEBOB_RIG);
    const a = run(state, 1);
    const b = run(state, 1.3);
    expect(a.squash).not.toBe(b.squash);
    expect(Math.abs(shoulderR(a) - shoulderR(rest))).toBeLessThan(0.15);
    expect(a.offsetY).toBe(0);
  });

  it('hops in while entering: up in the air mid-hop, crouched at the start of each', () => {
    const state = createNarratorAnimator(SPONGEBOB_RIG);
    // Presence 1/6: the middle of the first of three hops.
    const air = run(state, 1 / 60, { phase: 'entering', presence: 1 / 6 });
    expect(air.offsetY).toBeGreaterThan(0.2);
    const crouch = run(state, 1 / 60, { phase: 'entering', presence: 1 / 3 + 0.001 });
    expect(crouch.offsetY).toBe(0);
    expect(crouch.hipsY).toBeLessThan(-0.05);
  });

  it('waves once it has arrived, then settles back to idle', () => {
    const state = createNarratorAnimator(SPONGEBOB_RIG);
    run(state, 0.2, { phase: 'entering', presence: 0.99 });
    const greeting = run(state, 0.6);
    expect(-shoulderR(greeting)).toBeGreaterThan(0.5); // the right arm is up (its z is negative going up)
    const after = run(state, GREET_SECONDS + FADE_SECONDS + 0.5);
    expect(Math.abs(shoulderR(after) - shoulderR(rest))).toBeLessThan(0.15);
  });

  it('waves for as long as it is asked to (a farewell)', () => {
    const state = createNarratorAnimator(SPONGEBOB_RIG);
    run(state, 1);
    const waving = run(state, 3, { waving: true });
    expect(-shoulderR(waving)).toBeGreaterThan(0.5);
  });

  it('gestures while talking, scaled by the talk envelope', () => {
    const quiet = run(createNarratorAnimator(SPONGEBOB_RIG), 1, { talk: 0 });
    const talking = run(createNarratorAnimator(SPONGEBOB_RIG), 1, { talk: 1 });
    // Both arms come up from the rest pose.
    expect((talking.rot[BONE.shoulderL * 3 + 2] ?? 0) - (quiet.rot[BONE.shoulderL * 3 + 2] ?? 0)).toBeGreaterThan(0.3);
  });

  it('reacts to a poke while present, once, and not to the first value it sees', () => {
    const state = createNarratorAnimator(SPONGEBOB_RIG);
    run(state, 0.5, { poke: 5 });
    expect(state.reactAt).toBe(-1);
    run(state, 0.1, { poke: 6 });
    expect(state.reactAt).toBeGreaterThan(0);
    run(state, REACT_SECONDS, { poke: 6 });
    expect(state.reactAt).toBe(-1);
    run(state, 0.1, { phase: 'entering', presence: 0.5, poke: 7 });
    expect(state.reactAt).toBe(-1);
  });

  it('stays finite on corrupt input', () => {
    const state = createNarratorAnimator(SPONGEBOB_RIG);
    const out = run(state, 0.5, { dt: Number.NaN, presence: Number.NaN, talk: Number.POSITIVE_INFINITY, poke: Number.NaN });
    expect(rigPoseFinite(out)).toBe(true);
    state.clock = Number.NaN;
    expect(rigPoseFinite(run(state, 0.1, { phase: 'exiting', presence: Number.NaN }))).toBe(true);
  });

  it('previews a held clip, frozen where asked', () => {
    const a = run(createNarratorAnimator(SPONGEBOB_RIG), 0.5, { hold: { clip: 'hop', at: 0.5 } });
    const b = run(createNarratorAnimator(SPONGEBOB_RIG), 0.9, { hold: { clip: 'hop', at: 0.5 } });
    expect(a.offsetY).toBeGreaterThan(0.2);
    expect(b.offsetY).toBeCloseTo(a.offsetY, 9);
    expect(isNarratorClipId('wave')).toBe(true);
    expect(isNarratorClipId('dance')).toBe(false);
  });
});

describe('the clips', () => {
  const legs = legLengths(SPONGEBOB_RIG);

  it('chains hops: a hop starts and ends in the same crouch, and peaks mid-flight', () => {
    const start = createRigPose();
    const end = createRigPose();
    const mid = createRigPose();
    hopClip(0, legs, start);
    hopClip(1, legs, end);
    hopClip(0.5, legs, mid);
    expect(start.hipsY).toBeCloseTo(end.hipsY, 2);
    expect(start.offsetY).toBe(0);
    expect(mid.offsetY).toBeGreaterThan(0.25);
  });

  it('ends a react where it started', () => {
    const before = createRigPose();
    const after = createRigPose();
    reactClip(REACT_SECONDS, legs, after);
    for (let i = 0; i < before.rot.length; i++) expect(after.rot[i]).toBeCloseTo(before.rot[i] ?? 0, 6);
    expect(after.offsetY).toBeCloseTo(0, 9);
  });

  it('waves only the right arm', () => {
    const pose = createRigPose();
    writeRestPose(SPONGEBOB_RIG.rest, pose);
    const left = Array.from(pose.rot.slice(BONE.shoulderL * 3, BONE.handL * 3 + 3));
    waveClip(0.3, 1, pose);
    expect(Array.from(pose.rot.slice(BONE.shoulderL * 3, BONE.handL * 3 + 3))).toEqual(left);
    expect(-shoulderR(pose)).toBeGreaterThan(0.6);
  });
});
