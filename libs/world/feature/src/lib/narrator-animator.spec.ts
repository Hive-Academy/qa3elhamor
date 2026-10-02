import { describe, expect, it } from 'vitest';
import {
  BLEND,
  FIDGET_GAP,
  GREET_DELAY,
  GREET_SECONDS,
  TALK_ATTACK,
  TALK_RELEASE,
  createNarratorAnimator,
  seedNarratorAnimator,
  stepNarratorAnimator,
  type NarratorAnimatorInput,
  type NarratorAnimatorState,
} from './narrator-animator.js';
import {
  FIDGET_SECONDS,
  NARRATOR_FIDGET_IDS,
  REACT_SECONDS,
  fidgetClip,
  hopClip,
  isNarratorClipId,
  reactClip,
  waveClip,
} from './narrator-clips.js';
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
const shoulderL = (pose: RigPose): number => pose.rot[BONE.shoulderL * 3 + 2] ?? 0;
const rest = (() => {
  const pose = createRigPose();
  writeRestPose(SPONGEBOB_RIG.rest, pose);
  return pose;
})();

/** The largest change of any channel between two poses (rotations in radians, offsets x height). */
function poseDelta(a: RigPose, b: RigPose): number {
  let max = 0;
  for (let i = 0; i < a.rot.length; i++) max = Math.max(max, Math.abs((a.rot[i] ?? 0) - (b.rot[i] ?? 0)));
  return Math.max(
    max,
    Math.abs(a.offsetY - b.offsetY) * 4,
    Math.abs(a.hipsY - b.hipsY) * 4,
    Math.abs(a.squash - b.squash) * 4
  );
}

/**
 * Plays `script` (segments of seconds and input) at 60 fps and returns the largest per-frame
 * change of the pose, and where it happened.
 */
function maxStep(
  state: NarratorAnimatorState,
  script: readonly (readonly [number, Partial<NarratorAnimatorInput>])[]
): { readonly delta: number; readonly at: number } {
  const out = createRigPose();
  const prev = createRigPose();
  let delta = 0;
  let at = -1;
  let frame = 0;
  let started = false;
  for (const [seconds, input] of script) {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      stepNarratorAnimator(state, { ...BASE, ...input }, SPONGEBOB_RIG, out);
      if (started) {
        const d = poseDelta(out, prev);
        if (d > delta) {
          delta = d;
          at = frame;
        }
      }
      started = true;
      prev.rot.set(out.rot);
      prev.offsetY = out.offsetY;
      prev.hipsY = out.hipsY;
      prev.squash = out.squash;
      frame += 1;
    }
  }
  return { delta, at };
}

/** At 60 fps, no channel moves more than this in a frame on a calm transition (~4.8 rad/s). */
const CALM_STEP = 0.08;
/** A whole arm raised or lowered (~2 rad in half a second) peaks near 6 rad/s. */
const GESTURE_STEP = 0.12;

describe('stepNarratorAnimator', () => {
  it('holds the rest pose under reduced motion: no idle loop, no hop, no wave, no gesture', () => {
    const state = createNarratorAnimator(SPONGEBOB_RIG);
    for (const input of [
      { phase: 'entering', presence: 0.4 },
      { talk: 1, waving: true },
      { poke: 3 },
      { hold: { clip: 'wave' } },
      { hold: { clip: 'scratch' } },
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

  it('never freezes while idle, and does not repeat on a short loop', () => {
    const state = createNarratorAnimator(SPONGEBOB_RIG, 7);
    const samples: number[][] = [];
    for (let i = 0; i < 40; i++) samples.push(Array.from(run(state, 0.5).rot));
    // Every half second the pose has moved.
    for (let i = 1; i < samples.length; i++) {
      const d = Math.max(...(samples[i] ?? []).map((v, k) => Math.abs(v - (samples[i - 1]?.[k] ?? 0))));
      expect(d).toBeGreaterThan(1e-3);
    }
    // No two samples 2..10 s apart are the same pose (no short period).
    for (let i = 0; i < samples.length; i++)
      for (let j = i + 4; j < Math.min(samples.length, i + 21); j++) {
        const d = Math.max(...(samples[i] ?? []).map((v, k) => Math.abs(v - (samples[j]?.[k] ?? 0))));
        expect(d).toBeGreaterThan(1e-3);
      }
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
    const greeting = run(state, GREET_DELAY + 0.6);
    expect(-shoulderR(greeting)).toBeGreaterThan(0.5); // the right arm is up (its z is negative going up)
    const after = run(state, GREET_SECONDS + BLEND.wave.out + 0.5);
    expect(Math.abs(shoulderR(after) - shoulderR(rest))).toBeLessThan(0.15);
  });

  it('waves for as long as it is asked to (a farewell)', () => {
    const state = createNarratorAnimator(SPONGEBOB_RIG);
    run(state, 1);
    const waving = run(state, 3, { waving: true });
    expect(-shoulderR(waving)).toBeGreaterThan(0.5);
  });

  it('gestures while talking', () => {
    const quiet = run(createNarratorAnimator(SPONGEBOB_RIG), 1, { talk: 0 });
    const talking = run(createNarratorAnimator(SPONGEBOB_RIG), 1, { talk: 1 });
    // Both arms come up from the rest pose.
    expect(shoulderL(talking) - shoulderL(quiet)).toBeGreaterThan(0.3);
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
    const state = createNarratorAnimator(SPONGEBOB_RIG, Number.NaN);
    const out = run(state, 0.5, { dt: Number.NaN, presence: Number.NaN, talk: Number.POSITIVE_INFINITY, poke: Number.NaN });
    expect(rigPoseFinite(out)).toBe(true);
    state.clock = Number.NaN;
    state.breath = Number.NaN;
    expect(rigPoseFinite(run(state, 0.1, { phase: 'exiting', presence: Number.NaN }))).toBe(true);
  });

  it('previews a held clip, frozen where asked', () => {
    const a = run(createNarratorAnimator(SPONGEBOB_RIG), 0.5, { hold: { clip: 'hop', at: 0.5 } });
    const b = run(createNarratorAnimator(SPONGEBOB_RIG), 0.9, { hold: { clip: 'hop', at: 0.5 } });
    expect(a.offsetY).toBeGreaterThan(0.2);
    expect(b.offsetY).toBeCloseTo(a.offsetY, 9);
    expect(isNarratorClipId('wave')).toBe(true);
    expect(isNarratorClipId('scratch')).toBe(true);
    expect(isNarratorClipId('dance')).toBe(false);
  });
});

describe('the talk envelope', () => {
  it('rises fast and falls slowly', () => {
    const state = createNarratorAnimator(SPONGEBOB_RIG);
    run(state, 1);
    run(state, TALK_ATTACK + 1 / 60, { talk: 1 });
    expect(state.talkEnv.x).toBeGreaterThan(0.9);
    run(state, 1, { talk: 1 });
    run(state, 0.2, { talk: 0 });
    expect(state.talkEnv.x).toBeGreaterThan(0.3);
    run(state, TALK_RELEASE, { talk: 0 });
    expect(state.talkEnv.x).toBeLessThan(0.1);
  });

  it('eases into listening between lines instead of dropping back to idle', () => {
    const state = createNarratorAnimator(SPONGEBOB_RIG);
    run(state, 1);
    const idle = run(state, 0.2);
    run(state, 2, { talk: 1 });
    const pause = run(state, 1.5, { talk: 0 });
    expect(state.listenW.x).toBeGreaterThan(0.8);
    // Arms still a little up and forward: not the idle's arms.
    expect(shoulderL(pause) - shoulderL(idle)).toBeGreaterThan(0.05);
    // Long after the last line, it relaxes into the idle.
    run(state, 8);
    expect(state.listenW.x).toBeLessThan(0.05);
  });

  it('never pops across talk, a pause, and talk again (60 fps)', () => {
    const state = createNarratorAnimator(SPONGEBOB_RIG, 3);
    const { delta } = maxStep(state, [
      [1, {}],
      [2.3, { talk: 1 }],
      [0.4, { talk: 0 }],
      [1.7, { talk: 1 }],
      [2.5, { talk: 0 }],
      [0.15, { talk: 1 }],
      [3, { talk: 0 }],
    ]);
    expect(delta).toBeLessThan(CALM_STEP);
  });
});

describe('transitions', () => {
  it('never pops when a wave starts, is interrupted by talk, and ends', () => {
    const { delta } = maxStep(createNarratorAnimator(SPONGEBOB_RIG, 5), [
      [1, {}],
      [0.4, { waving: true }],
      [0.6, { waving: true, talk: 1 }],
      [1, { talk: 1 }],
      [2, {}],
    ]);
    expect(delta).toBeLessThan(GESTURE_STEP);
  });

  it('lands, settles and greets without a pop', () => {
    const script: [number, Partial<NarratorAnimatorInput>][] = [];
    for (let i = 0; i <= 126; i++) script.push([1 / 60, { phase: 'entering', presence: Math.min(0.999, i / 126) }]);
    script.push([4, {}]);
    const state = createNarratorAnimator(SPONGEBOB_RIG, 9);
    // The hops themselves are quick; from the landing on (settle, greeting, idle) it is checked.
    maxStep(state, script.slice(0, 127));
    const { delta } = maxStep(state, script.slice(127));
    expect(delta).toBeLessThan(GESTURE_STEP);
  });

  it('absorbs a jump: a hop that reverses mid-air, a new held clip', () => {
    const state = createNarratorAnimator(SPONGEBOB_RIG);
    const { delta } = maxStep(state, [
      [0.5, { phase: 'entering', presence: 0.5 / 6 }],
      [0.3, { phase: 'exiting', presence: 0.5 }],
      [0.6, { hold: { clip: 'wave', at: 0.5 } }],
      [0.6, { hold: { clip: 'hips', at: 0.5 } }],
      [0.6, {}],
    ]);
    // Whole-pose jumps (a dev preview flipping clips) are absorbed over INERTIA_SECONDS.
    expect(delta).toBeLessThan(0.25);
  });

  it('blends from a handed-over pose instead of popping to its own', () => {
    const state = createNarratorAnimator(SPONGEBOB_RIG);
    const other = createRigPose();
    writeRestPose(SPONGEBOB_RIG.rest, other);
    waveClip(0.3, 1, other);
    seedNarratorAnimator(state, other);
    const first = run(state, 1 / 60);
    expect(poseDelta(first, other)).toBeLessThan(CALM_STEP);
    const later = run(state, 1);
    expect(Math.abs(shoulderR(later) - shoulderR(rest))).toBeLessThan(0.15);
  });
});

describe('fidgets', () => {
  /** Plays `seconds` of idle and lists each fidget as it starts: [time, id]. */
  function schedule(seed: number, seconds: number): [number, string][] {
    const state = createNarratorAnimator(SPONGEBOB_RIG, seed);
    const starts: [number, string][] = [];
    let last: string | null = null;
    for (let i = 0; i < seconds * 60; i++) {
      run(state, 1 / 60);
      if (state.fidget && state.fidget !== last && state.fidgetAt <= 1 / 60 + 1e-9) starts.push([i / 60, state.fidget]);
      last = state.fidget;
    }
    return starts;
  }

  it('is deterministic for a seed, and differs between seeds', () => {
    const a = schedule(42, 90);
    expect(schedule(42, 90)).toEqual(a);
    expect(schedule(43, 90)).not.toEqual(a);
    expect(a.length).toBeGreaterThan(5);
  });

  it(`plays one every ${FIDGET_GAP.min}-${FIDGET_GAP.max} s of idle, never the same twice running`, () => {
    const starts = schedule(11, 120);
    for (let i = 1; i < starts.length; i++) {
      const [t0, id0] = starts[i - 1] ?? [0, ''];
      const [t1, id1] = starts[i] ?? [0, ''];
      const gap = t1 - t0 - FIDGET_SECONDS[id0 as keyof typeof FIDGET_SECONDS];
      expect(gap).toBeGreaterThanOrEqual(FIDGET_GAP.min - 0.05);
      expect(gap).toBeLessThanOrEqual(FIDGET_GAP.max + 0.05);
      expect(id1).not.toBe(id0);
    }
  });

  it('does not fidget while it talks, and a fidget cut short by talk fades without a pop', () => {
    const state = createNarratorAnimator(SPONGEBOB_RIG, 2);
    run(state, 6, { talk: 1 });
    expect(state.fidget).toBeNull();
    // Idle until a fidget starts, then talk over it.
    for (let i = 0; i < 60 * 30 && !state.fidget; i++) run(state, 1 / 60);
    expect(state.fidget).not.toBeNull();
    const { delta } = maxStep(state, [
      [0.6, {}],
      [1.5, { talk: 1 }],
    ]);
    expect(delta).toBeLessThan(GESTURE_STEP);
  });

  it('starts and ends each fidget at the pose it was given', () => {
    const legs = legLengths(SPONGEBOB_RIG);
    for (const id of NARRATOR_FIDGET_IDS) {
      for (const s of [0, FIDGET_SECONDS[id]]) {
        const pose = createRigPose();
        writeRestPose(SPONGEBOB_RIG.rest, pose);
        fidgetClip(id, s, legs, pose);
        expect(poseDelta(pose, rest), `${id} at ${s}`).toBeLessThan(1e-9);
      }
    }
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
