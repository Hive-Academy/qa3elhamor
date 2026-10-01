import { describe, expect, it } from 'vitest';
import { AMBIENT_TIME_PERIOD } from './ambient-clock.js';
import {
  DEFAULT_NARRATOR_MOTION,
  NARRATOR_MAX_FRAME,
  angleSpringStep,
  createNarratorMotionState,
  createNarratorPose,
  limitYaw,
  reducedTalkScale,
  springStep,
  squashStretch,
  stepNarrator,
  talkPulse,
  wrapAngle,
  type NarratorFrameInput,
  type NarratorMotionTuning,
  type NarratorPose,
} from './narrator-motion.js';

const TUNING: NarratorMotionTuning = { ...DEFAULT_NARRATOR_MOTION, enterSeconds: 1, exitSeconds: 1 };

const frame = (overrides: Partial<NarratorFrameInput> = {}): NarratorFrameInput => ({
  dt: 1 / 60,
  present: true,
  talking: false,
  reducedMotion: false,
  cameraYaw: 0,
  restYaw: 0,
  maxTurn: 1.2,
  height: 1,
  enterFrom: [-3, 1, -1],
  exitTo: [3, 1, -1],
  ...overrides,
});

/** Runs `seconds` of frames at `fps`, returning the events seen. */
function run(
  state: ReturnType<typeof createNarratorMotionState>,
  pose: NarratorPose,
  seconds: number,
  input: Partial<NarratorFrameInput> = {},
  fps = 60,
  tuning = TUNING
): string[] {
  const events: string[] = [];
  const frames = Math.round(seconds * fps);
  for (let i = 0; i < frames; i++) {
    const event = stepNarrator(state, frame({ dt: 1 / fps, ...input }), tuning, pose);
    if (event) events.push(event);
  }
  return events;
}

const poseIsFinite = (pose: NarratorPose): boolean =>
  [pose.offsetX, pose.offsetY, pose.offsetZ, pose.yaw, pose.pitch, pose.roll, pose.scaleX, pose.scaleY, pose.scaleZ, pose.talk, pose.swim].every(
    Number.isFinite
  );

describe('springStep (critically damped, exact)', () => {
  it('converges on the target without overshoot', () => {
    const s = { x: 0, v: 0 };
    let max = 0;
    for (let i = 0; i < 120; i++) {
      springStep(s, 1, 8, 1 / 60);
      max = Math.max(max, s.x);
    }
    expect(s.x).toBeCloseTo(1, 3);
    expect(max).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('is frame-rate independent: one long step equals many short ones', () => {
    const coarse = { x: 0, v: 2 };
    const fine = { x: 0, v: 2 };
    springStep(coarse, 1, 6, 0.1);
    for (let i = 0; i < 100; i++) springStep(fine, 1, 6, 0.001);
    expect(coarse.x).toBeCloseTo(fine.x, 9);
    expect(coarse.v).toBeCloseTo(fine.v, 9);
  });

  it('ignores a zero / negative / NaN step and a non-finite target; snaps a corrupt state', () => {
    const s = { x: 0.3, v: 0.1 };
    springStep(s, 1, 6, 0);
    springStep(s, 1, 6, -1);
    springStep(s, 1, 6, Number.NaN);
    springStep(s, Number.NaN, 6, 0.1);
    springStep(s, Number.POSITIVE_INFINITY, 6, 0.1);
    expect(s).toEqual({ x: 0.3, v: 0.1 });
    const corrupt = { x: Number.NaN, v: 0 };
    springStep(corrupt, 2, 6, 0.016);
    expect(corrupt).toEqual({ x: 2, v: 0 });
  });
});

describe('angles and facing', () => {
  it('wraps into [-pi, pi) and maps non-finite to 0', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI);
    expect(wrapAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2);
    expect(wrapAngle(0.4)).toBeCloseTo(0.4);
    expect(wrapAngle(Number.NaN)).toBe(0);
  });

  it('limits the turn around the rest heading, the short way round', () => {
    expect(limitYaw(0, 0.5, 1.2)).toBeCloseTo(0.5);
    expect(limitYaw(0, 2.5, 1.2)).toBeCloseTo(1.2);
    expect(limitYaw(0, -2.5, 1.2)).toBeCloseTo(-1.2);
    // Rest near +pi, desired just past -pi: 0.2 rad away, not 2pi - 0.2.
    expect(limitYaw(3.0, -3.0, 0.5)).toBeCloseTo(wrapAngle(3.0 + (2 * Math.PI - 6.0)));
    // A limit of pi or more leaves it free.
    expect(limitYaw(0, 2.5, Math.PI)).toBeCloseTo(2.5);
  });

  it('turns an angle spring the short way across the +-pi seam', () => {
    const s = { x: 3.0, v: 0 };
    angleSpringStep(s, -3.0, 10, 0.05);
    // From 3.0 toward -3.0 + 2pi = 3.283: it increases (then wraps), never sweeps back through 0.
    expect(Math.abs(s.x)).toBeGreaterThan(3.0);
  });
});

describe('talk curves', () => {
  it('pulses in [0, 1], continuously, with a syllable rhythm', () => {
    let previous = talkPulse(0);
    let peaks = 0;
    let rising = true;
    for (let t = 0.001; t < 3; t += 0.001) {
      const value = talkPulse(t);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(Math.abs(value - previous)).toBeLessThan(0.05);
      if (rising && value < previous) peaks++;
      rising = value >= previous;
      previous = value;
    }
    // About 4.4 syllables a second.
    expect(peaks).toBeGreaterThan(10);
    expect(peaks).toBeLessThan(16);
  });

  it('wraps seamlessly with the shared clock period and guards NaN', () => {
    expect(talkPulse(AMBIENT_TIME_PERIOD - 1e-6)).toBeCloseTo(talkPulse(0), 3);
    expect(talkPulse(Number.NaN)).toBe(0);
  });

  it('squashes and stretches with volume kept, and rests at 1 without an envelope', () => {
    for (const pulse of [0, 0.3, 1]) {
      const { y, xz } = squashStretch(pulse, 1, 0.1);
      expect(y * xz * xz).toBeCloseTo(1, 9);
    }
    expect(squashStretch(0, 1, 0.1).y).toBeCloseTo(0.9);
    expect(squashStretch(1, 1, 0.1).y).toBeCloseTo(1.1);
    expect(squashStretch(0.7, 0, 0.1)).toEqual({ y: 1, xz: 1 });
  });

  it('gives reduced motion only a gentle pulse, and none when silent', () => {
    for (let t = 0; t < 4; t += 0.05) {
      expect(reducedTalkScale(t, 1)).toBeGreaterThanOrEqual(1);
      expect(reducedTalkScale(t, 1)).toBeLessThanOrEqual(1.036);
      expect(reducedTalkScale(t, 0)).toBe(1);
    }
    expect(reducedTalkScale(Number.NaN, 1)).toBe(1);
  });
});

describe('stepNarrator', () => {
  it('swims in from enterFrom facing its travel, settles once, then faces the camera', () => {
    const state = createNarratorMotionState();
    const pose = createNarratorPose();
    stepNarrator(state, frame(), TUNING, pose);
    expect(pose.visible).toBe(true);
    expect(pose.phase).toBe('entering');
    expect(pose.offsetX).toBeLessThan(-2.5);
    // Travelling toward +X (from -3 to 0): heading about atan2(3, 1).
    expect(pose.yaw).toBeCloseTo(Math.atan2(3, 1), 1);

    const events = run(state, pose, 1.2);
    expect(events).toEqual(['settled']);
    expect(pose.phase).toBe('present');
    expect(Math.abs(pose.offsetX)).toBeLessThan(1e-9);
    run(state, pose, 2);
    expect(pose.yaw).toBeCloseTo(0, 2);
    expect(run(state, pose, 2)).toEqual([]);
  });

  it('turns toward the camera only as far as maxTurn allows, plus the facing offset', () => {
    const state = createNarratorMotionState();
    const pose = createNarratorPose();
    const tuning = { ...TUNING, facingOffset: 0.3 };
    run(state, pose, 4, { cameraYaw: 2.8, maxTurn: 1 }, 60, tuning);
    expect(pose.yaw).toBeCloseTo(1.3, 2);
    run(state, pose, 4, { cameraYaw: -0.4, maxTurn: 1 }, 60, tuning);
    expect(pose.yaw).toBeCloseTo(-0.1, 2);
  });

  it('swims away to exitTo, shrinking out, and reports exited once', () => {
    const state = createNarratorMotionState();
    const pose = createNarratorPose();
    run(state, pose, 1.5);
    const events = run(state, pose, 0.5, { present: false });
    expect(events).toEqual([]);
    expect(pose.phase).toBe('exiting');
    expect(pose.offsetX).toBeGreaterThan(0);
    expect(run(state, pose, 1, { present: false })).toEqual(['exited']);
    expect(pose.visible).toBe(false);
    expect(run(state, pose, 1, { present: false })).toEqual([]);
  });

  it('turns back without a jump when present flips mid-way', () => {
    const state = createNarratorMotionState();
    const pose = createNarratorPose();
    run(state, pose, 1.5);
    run(state, pose, 0.6, { present: false });
    const before = { x: pose.offsetX, y: pose.offsetY, z: pose.offsetZ };
    stepNarrator(state, frame({ present: true }), TUNING, pose);
    expect(Math.abs(pose.offsetX - before.x)).toBeLessThan(0.1);
    expect(Math.abs(pose.offsetZ - before.z)).toBeLessThan(0.1);
    expect(run(state, pose, 1.5)).toEqual(['settled']);
  });

  it('squashes, stretches and hops while talking, and eases back when it stops', () => {
    const state = createNarratorMotionState();
    const pose = createNarratorPose();
    run(state, pose, 1.5);
    let minY = Infinity;
    let maxY = -Infinity;
    let maxTalk = 0;
    for (let i = 0; i < 120; i++) {
      stepNarrator(state, frame({ talking: true }), TUNING, pose);
      minY = Math.min(minY, pose.scaleY);
      maxY = Math.max(maxY, pose.scaleY);
      maxTalk = Math.max(maxTalk, pose.talk);
      expect(pose.scaleY * pose.scaleX * pose.scaleZ).toBeCloseTo(1, 6);
    }
    expect(maxY).toBeGreaterThan(1.05);
    expect(minY).toBeLessThan(0.97);
    expect(maxTalk).toBeGreaterThan(0.5);
    run(state, pose, 1.5, { talking: false });
    expect(pose.scaleY).toBeCloseTo(1, 3);
    expect(pose.talk).toBeLessThan(0.01);
  });

  it('is frame-rate independent', () => {
    const at60 = createNarratorMotionState();
    const at24 = createNarratorMotionState();
    const pose60 = createNarratorPose();
    const pose24 = createNarratorPose();
    // Mid swim-in: the travel is the same at any frame rate.
    run(at60, pose60, 0.5, {}, 60);
    run(at24, pose24, 0.5, {}, 24);
    expect(at24.presence).toBeCloseTo(at60.presence, 9);
    expect(pose24.offsetX).toBeCloseTo(pose60.offsetX, 9);
    expect(pose24.yaw).toBeCloseTo(pose60.yaw, 6);
    // Settled, then the camera moves: the turn toward it is the same too.
    run(at60, pose60, 3, {}, 60);
    run(at24, pose24, 3, {}, 24);
    run(at60, pose60, 0.5, { cameraYaw: 0.8 }, 60);
    run(at24, pose24, 0.5, { cameraYaw: 0.8 }, 24);
    expect(pose24.yaw).toBeCloseTo(pose60.yaw, 3);
    expect(pose60.yaw).toBeGreaterThan(0.4);
  });

  it('clamps a long frame so a tab switch does not jump it', () => {
    const state = createNarratorMotionState();
    const pose = createNarratorPose();
    stepNarrator(state, frame({ dt: 30 }), TUNING, pose);
    expect(state.presence).toBeCloseTo(NARRATOR_MAX_FRAME / TUNING.enterSeconds, 9);
  });

  it('survives NaN everywhere with a finite pose', () => {
    const state = createNarratorMotionState(Number.NaN);
    const pose = createNarratorPose();
    for (let i = 0; i < 30; i++) {
      stepNarrator(
        state,
        frame({
          dt: i % 2 ? Number.NaN : 1 / 60,
          cameraYaw: Number.NaN,
          restYaw: Number.NaN,
          maxTurn: Number.NaN,
          height: Number.NaN,
          enterFrom: [Number.NaN, 1, Number.POSITIVE_INFINITY],
          talking: true,
        }),
        { ...TUNING, facingOffset: Number.NaN, travelYawOffset: Number.NaN },
        pose
      );
      expect(poseIsFinite(pose)).toBe(true);
    }
    state.yaw.x = Number.NaN;
    state.presence = Number.NaN;
    stepNarrator(state, frame(), TUNING, pose);
    expect(poseIsFinite(pose)).toBe(true);
  });

  describe('under reduced motion', () => {
    it('appears at its post at once, settled, with no travel, bob or sway', () => {
      const state = createNarratorMotionState();
      const pose = createNarratorPose();
      expect(stepNarrator(state, frame({ reducedMotion: true, cameraYaw: 0.5 }), TUNING, pose)).toBe('settled');
      for (let i = 0; i < 90; i++) {
        stepNarrator(state, frame({ reducedMotion: true, cameraYaw: 0.5 }), TUNING, pose);
        expect([pose.offsetX, pose.offsetY, pose.offsetZ, pose.pitch, pose.roll]).toEqual([0, 0, 0, 0, 0]);
        expect([pose.scaleX, pose.scaleY, pose.scaleZ]).toEqual([1, 1, 1]);
        expect(pose.talk).toBe(0);
        expect(pose.swim).toBe(0);
      }
      expect(pose.yaw).toBeCloseTo(0.5);
    });

    it('holds one heading while the camera moves', () => {
      const state = createNarratorMotionState();
      const pose = createNarratorPose();
      stepNarrator(state, frame({ reducedMotion: true, cameraYaw: 0.5 }), TUNING, pose);
      run(state, pose, 1, { reducedMotion: true, cameraYaw: -0.9 });
      expect(pose.yaw).toBeCloseTo(0.5);
    });

    it('talks with a uniform scale pulse only', () => {
      const state = createNarratorMotionState();
      const pose = createNarratorPose();
      let max = 1;
      for (let i = 0; i < 120; i++) {
        stepNarrator(state, frame({ reducedMotion: true, talking: true }), TUNING, pose);
        expect(pose.scaleX).toBe(pose.scaleY);
        expect(pose.scaleZ).toBe(pose.scaleY);
        expect(pose.offsetY).toBe(0);
        max = Math.max(max, pose.scaleY);
      }
      expect(max).toBeGreaterThan(1.01);
      expect(max).toBeLessThanOrEqual(1.036);
    });

    it('leaves at once and reports exited', () => {
      const state = createNarratorMotionState();
      const pose = createNarratorPose();
      run(state, pose, 0.5, { reducedMotion: true });
      expect(stepNarrator(state, frame({ reducedMotion: true, present: false }), TUNING, pose)).toBe('exited');
      expect(pose.visible).toBe(false);
    });
  });
});
