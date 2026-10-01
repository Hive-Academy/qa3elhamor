import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GOVERNOR_POLICY,
  adaptTier,
  createGovernorState,
  settleGovernor,
  settledGovernorState,
  summariseFrameTimes,
  type FrameStats,
  type GovernorState,
} from './quality-governor.js';

/** A one-second window at a steady frame time. */
const windowAt = (frameMs: number, p90Ms = frameMs): FrameStats => ({
  durationMs: 1000,
  frames: Math.round(1000 / frameMs),
  p50Ms: frameMs,
  p90Ms,
});

const SMOOTH = windowAt(16.7);
const NEUTRAL = windowAt(20); // 50 fps: neither slow nor fast
const SLOW = windowAt(33); // 30 fps

const run = (state: GovernorState, windows: readonly FrameStats[]): GovernorState =>
  windows.reduce((current, stats) => adaptTier(current, stats), state);

const repeat = (stats: FrameStats, times: number): FrameStats[] => Array.from({ length: times }, () => stats);

describe('adaptTier', () => {
  it('ignores slow frames during warm-up', () => {
    const state = run(createGovernorState('high'), repeat(SLOW, 2));
    expect(state.tier).toBe('high');
    expect(state.slowMs).toBe(0);
  });

  it('steps down one tier after sustained slow frames, then again after a new warm-up', () => {
    // 2.5 s warm-up: window 3 counts 0.5 s, so 3 s of slow time is reached at window 6.
    let state = run(createGovernorState('high'), repeat(SLOW, 5));
    expect(state.tier).toBe('high');
    expect(state.slowMs).toBe(2500);
    state = adaptTier(state, SLOW);
    expect(state.tier).toBe('medium');
    expect(state.downgraded).toBe(true);
    expect(state.sinceChangeMs).toBe(0);

    state = run(state, repeat(SLOW, 2));
    expect(state.tier).toBe('medium'); // still warming up at the new tier
    state = run(state, repeat(SLOW, 4));
    expect(state.tier).toBe('low');
  });

  it('treats a bad 90th percentile as slow even when the median is fine', () => {
    const hitching = windowAt(16.7, 70);
    expect(run(createGovernorState('high'), repeat(hitching, 6)).tier).toBe('medium');
  });

  it('needs the slow time to be consecutive', () => {
    const state = run(createGovernorState('high'), [
      ...repeat(SLOW, 4),
      NEUTRAL,
      ...repeat(SLOW, 2),
    ]);
    expect(state.tier).toBe('high');
    expect(state.slowMs).toBe(2000);
  });

  it('credits a window straddling the end of warm-up only for its part after it', () => {
    const state = run(createGovernorState('high'), repeat(SLOW, 3));
    expect(state.slowMs).toBe(500);
  });

  it('steps down and settles on a persistent stall of multi-second single frames', () => {
    const stall: FrameStats = { durationMs: 3000, frames: 1, p50Ms: 3000, p90Ms: 3000 };
    let state = createGovernorState('high');
    for (let i = 0; i < 10 && !state.settled; i++) state = adaptTier(state, stall);
    expect(state.tier).toBe('low');
    expect(state.settled).toBe(true);
    expect(state.elapsedMs).toBeLessThanOrEqual(DEFAULT_GOVERNOR_POLICY.maxDurationMs);
  });

  it('never goes below low', () => {
    const state = run(createGovernorState('low'), repeat(SLOW, 12));
    expect(state.tier).toBe('low');
  });

  it('upgrades once after sustained smooth frames, never above the ceiling', () => {
    const up = run(createGovernorState('medium'), repeat(SMOOTH, 9)); // 3 warm-up + 6 fast
    expect(up.tier).toBe('high');
    expect(up.upgraded).toBe(true);

    const capped = run(createGovernorState('low', 'low'), repeat(SMOOTH, 20));
    expect(capped.tier).toBe('low');
  });

  it('upgrades at most once per visit', () => {
    const state = run(createGovernorState('low'), repeat(SMOOTH, 29));
    expect(state.tier).toBe('medium');
  });

  it('never upgrades after a downgrade, so it cannot oscillate', () => {
    let state = run(createGovernorState('high'), repeat(SLOW, 6));
    expect(state.tier).toBe('medium');
    state = run(state, repeat(SMOOTH, 20));
    expect(state.tier).toBe('medium');
  });

  it('settles after the settle window at a stable tier, then stops adapting', () => {
    const { warmupMs, settleAfterMs } = DEFAULT_GOVERNOR_POLICY;
    const windows = (warmupMs + settleAfterMs) / 1000;
    let state = run(createGovernorState('medium'), repeat(NEUTRAL, Math.ceil(windows) - 1));
    expect(state.settled).toBe(false);
    state = adaptTier(state, NEUTRAL);
    expect(state.settled).toBe(true);

    expect(run(state, repeat(SLOW, 10))).toBe(state);
  });

  it('restarts the settle window after a change', () => {
    const state = run(createGovernorState('high'), [...repeat(SLOW, 6), ...repeat(NEUTRAL, 9)]);
    expect(state.tier).toBe('medium');
    expect(state.settled).toBe(false);
    expect(adaptTier(state, NEUTRAL).settled).toBe(false);
    expect(run(state, repeat(NEUTRAL, 2)).settled).toBe(true);
  });

  it('settles at the hard deadline even while still changing', () => {
    const policy = { ...DEFAULT_GOVERNOR_POLICY, maxDurationMs: 4000 };
    let state = createGovernorState('high');
    for (let i = 0; i < 4; i++) state = adaptTier(state, SLOW, policy);
    expect(state.settled).toBe(true);
  });

  it('ignores empty and non-finite windows (hidden tab)', () => {
    const start = createGovernorState('high');
    expect(adaptTier(start, { durationMs: 1000, frames: 0, p50Ms: Number.NaN, p90Ms: Number.NaN })).toBe(start);
    expect(adaptTier(start, { durationMs: Number.POSITIVE_INFINITY, frames: 5, p50Ms: 16, p90Ms: 16 })).toBe(start);
  });

  it('builds a pre-settled state for manual overrides', () => {
    const state = settledGovernorState('low');
    expect(state).toMatchObject({ tier: 'low', settled: true, ceiling: 'low' });
    expect(adaptTier(state, SLOW)).toBe(state);
  });

  it('settles on demand at the current tier (wall-clock backstop)', () => {
    const state = settleGovernor(createGovernorState('medium'));
    expect(state).toMatchObject({ tier: 'medium', settled: true });
    expect(settleGovernor(state)).toBe(state);
  });

  it('never lets the ceiling sit below the starting tier', () => {
    expect(createGovernorState('high', 'low').ceiling).toBe('high');
  });
});

describe('summariseFrameTimes', () => {
  it('returns nearest-rank p50 and p90 without reordering the samples', () => {
    const samples = new Float32Array([40, 10, 20, 30, 50, 60, 70, 80, 90, 100]);
    const scratch = new Float32Array(16);
    const stats = summariseFrameTimes(samples, 10, scratch, 1000);
    expect(stats).toEqual({ durationMs: 1000, frames: 10, p50Ms: 50, p90Ms: 90 });
    expect(samples[0]).toBe(40);
  });

  it('only reads the first `count` samples', () => {
    const samples = new Float32Array([16, 17, 999, 999]);
    const stats = summariseFrameTimes(samples, 2, new Float32Array(4), 33);
    expect(stats.frames).toBe(2);
    expect(stats.p90Ms).toBeCloseTo(17);
  });

  it('reports an empty window as zero frames with NaN percentiles', () => {
    const stats = summariseFrameTimes(new Float32Array(4), 0, new Float32Array(4), 500);
    expect(stats.frames).toBe(0);
    expect(Number.isNaN(stats.p50Ms)).toBe(true);
  });
});
