import { describe, expect, it } from 'vitest';
import { progressFromScroll, scrollTopForProgress } from './scroll-source.js';
import { settleSpring, snapSpring, stepCriticalSpring, type SpringState } from './spring.js';

const run = (dt: number, seconds: number, omega = 4): SpringState => {
  const s: SpringState = { value: 0, velocity: 0 };
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) stepCriticalSpring(s, 1, omega, dt);
  return s;
};

describe('stepCriticalSpring', () => {
  it('is frame-rate independent', () => {
    const at30 = run(1 / 30, 1);
    const at60 = run(1 / 60, 1);
    const at144 = run(1 / 144, 1);
    expect(at60.value).toBeCloseTo(at30.value, 10);
    expect(at144.value).toBeCloseTo(at30.value, 10);
    expect(at144.velocity).toBeCloseTo(at30.velocity, 10);
  });

  it('never overshoots a step from rest and converges', () => {
    const s: SpringState = { value: 0, velocity: 0 };
    let previous = 0;
    for (let i = 0; i < 600; i++) {
      stepCriticalSpring(s, 1, 4, 1 / 60);
      expect(s.value).toBeLessThanOrEqual(1);
      expect(s.value).toBeGreaterThanOrEqual(previous);
      previous = s.value;
    }
    expect(s.value).toBeCloseTo(1, 6);
  });

  it('reaches about 90% of a step in 3.9 / omega seconds', () => {
    expect(run(1 / 60, 3.9 / 4).value).toBeCloseTo(0.9, 2);
  });

  it('ignores non-positive time steps and frequencies', () => {
    const s: SpringState = { value: 0.3, velocity: 0.1 };
    stepCriticalSpring(s, 1, 4, 0);
    stepCriticalSpring(s, 1, 0, 1 / 60);
    stepCriticalSpring(s, 1, 4, Number.NaN);
    expect(s).toEqual({ value: 0.3, velocity: 0.1 });
  });

  it('settles and snaps exactly onto the target', () => {
    const s: SpringState = { value: 1 - 1e-8, velocity: 1e-8 };
    expect(settleSpring(s, 1)).toBe(true);
    expect(s).toEqual({ value: 1, velocity: 0 });
    const far: SpringState = { value: 0.5, velocity: 0 };
    expect(settleSpring(far, 1)).toBe(false);
    snapSpring(far, 0.25);
    expect(far).toEqual({ value: 0.25, velocity: 0 });
  });
});

describe('scroll mapping', () => {
  it('maps scroll offsets to clamped progress', () => {
    expect(progressFromScroll(0, 1000)).toBe(0);
    expect(progressFromScroll(250, 1000)).toBe(0.25);
    expect(progressFromScroll(2000, 1000)).toBe(1);
    expect(progressFromScroll(-5, 1000)).toBe(0);
    expect(progressFromScroll(100, 0)).toBe(0);
  });

  it('round-trips progress to a scroll offset', () => {
    expect(scrollTopForProgress(0.4, 1000)).toBe(400);
    expect(progressFromScroll(scrollTopForProgress(0.73, 5321), 5321)).toBeCloseTo(0.73, 12);
    expect(scrollTopForProgress(2, 1000)).toBe(1000);
    expect(scrollTopForProgress(0.5, -10)).toBe(0);
  });
});
