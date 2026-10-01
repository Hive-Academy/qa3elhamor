import { higherTier, lowerTier } from './quality-profile.js';
import type { QualityTier } from './quality-tier.js';

/** One measurement window of rendered frames. */
export interface FrameStats {
  /** Wall-clock time the window covers, in ms. */
  readonly durationMs: number;
  /** Frames rendered in the window. */
  readonly frames: number;
  /** Median frame time in ms. */
  readonly p50Ms: number;
  /** 90th-percentile frame time in ms: the stutter the median hides. */
  readonly p90Ms: number;
}

export interface GovernorPolicy {
  /** Windows are ignored this long after start and after each tier change (shader compiles, model decode). */
  readonly warmupMs: number;
  /** A window is slow when its median frame rate is below this... */
  readonly downgradeFps: number;
  /** ...or when its 90th-percentile frame time is above this (visible hitching). */
  readonly downgradeP90Ms: number;
  /** Consecutive slow time before stepping one tier down. */
  readonly downgradeAfterMs: number;
  /** A window is fast when its 90th-percentile frame time is at or below this. */
  readonly upgradeP90Ms: number;
  /** Consecutive fast time before the one permitted step up. */
  readonly upgradeAfterMs: number;
  /** Time at one tier, after its warm-up, with no change before the tier is final. */
  readonly settleAfterMs: number;
  /** The tier is final this long after start, whatever the frames say. */
  readonly maxDurationMs: number;
}

export const DEFAULT_GOVERNOR_POLICY: GovernorPolicy = {
  warmupMs: 2500,
  downgradeFps: 45,
  downgradeP90Ms: 50,
  downgradeAfterMs: 3000,
  upgradeP90Ms: 18,
  upgradeAfterMs: 6000,
  settleAfterMs: 8000,
  maxDurationMs: 30_000,
};

export interface GovernorState {
  readonly tier: QualityTier;
  /** True once the tier is final; `adaptTier` then returns the state unchanged. */
  readonly settled: boolean;
  /** The highest tier an upgrade may reach. */
  readonly ceiling: QualityTier;
  /** Measured time since the governor started. */
  readonly elapsedMs: number;
  /** Measured time since start or since the last tier change. */
  readonly sinceChangeMs: number;
  /** Consecutive slow time, after warm-up. */
  readonly slowMs: number;
  /** Consecutive fast time, after warm-up. */
  readonly fastMs: number;
  /** Once any change has happened in a direction, the governor never reverses it. */
  readonly upgraded: boolean;
  readonly downgraded: boolean;
}

const RANK: Record<QualityTier, number> = { low: 0, medium: 1, high: 2 };

export const createGovernorState = (
  tier: QualityTier,
  ceiling: QualityTier = 'high'
): GovernorState => ({
  tier,
  settled: false,
  ceiling: RANK[ceiling] < RANK[tier] ? tier : ceiling,
  elapsedMs: 0,
  sinceChangeMs: 0,
  slowMs: 0,
  fastMs: 0,
  upgraded: false,
  downgraded: false,
});

/** A governor that never adapts: the manual `?quality=` override. */
export const settledGovernorState = (tier: QualityTier): GovernorState => ({
  ...createGovernorState(tier, tier),
  settled: true,
});

const isUsable = (stats: FrameStats): boolean =>
  stats.frames > 0 &&
  Number.isFinite(stats.durationMs) &&
  stats.durationMs > 0 &&
  Number.isFinite(stats.p50Ms) &&
  Number.isFinite(stats.p90Ms);

const changeTo = (state: GovernorState, tier: QualityTier, direction: 'up' | 'down'): GovernorState => ({
  ...state,
  tier,
  sinceChangeMs: 0,
  slowMs: 0,
  fastMs: 0,
  upgraded: state.upgraded || direction === 'up',
  downgraded: state.downgraded || direction === 'down',
});

/**
 * One governor step: folds a measurement window into the state and returns the next state.
 * Pure; the caller owns the clock and the frames.
 *
 * Hysteresis, so a device never oscillates between tiers:
 * - windows inside the warm-up after start or after a change do not count;
 * - one tier down after `downgradeAfterMs` of consecutive slow windows (median below
 *   `downgradeFps` or p90 above `downgradeP90Ms`), repeatable down to `low`;
 * - one tier up after `upgradeAfterMs` of consecutive fast windows, at most once per visit,
 *   never above `ceiling`, and never after a downgrade;
 * - settled (final, stops adapting) after `settleAfterMs` at one tier past its warm-up, or at
 *   `maxDurationMs` regardless.
 *
 * Empty or non-finite windows (a hidden tab renders nothing) leave the state unchanged, so
 * time in the background neither settles nor downgrades the tier. A window may hold a single
 * very long frame (a device stalling for seconds per frame): it counts as slow like any other,
 * so a persistent stall still steps down and settles by `maxDurationMs`.
 */
export function adaptTier(
  state: GovernorState,
  stats: FrameStats,
  policy: GovernorPolicy = DEFAULT_GOVERNOR_POLICY
): GovernorState {
  if (state.settled || !isUsable(stats)) return state;

  const elapsedMs = state.elapsedMs + stats.durationMs;
  const sinceChangeMs = state.sinceChangeMs + stats.durationMs;
  let next: GovernorState = { ...state, elapsedMs, sinceChangeMs };

  if (sinceChangeMs > policy.warmupMs) {
    const slow = 1000 / stats.p50Ms < policy.downgradeFps || stats.p90Ms > policy.downgradeP90Ms;
    const fast = !slow && stats.p90Ms <= policy.upgradeP90Ms;
    // A window straddling the end of warm-up counts only for its part after it.
    const counted = Math.min(stats.durationMs, sinceChangeMs - policy.warmupMs);
    next = {
      ...next,
      slowMs: slow ? state.slowMs + counted : 0,
      fastMs: fast ? state.fastMs + counted : 0,
    };

    const down = lowerTier(next.tier);
    const up = higherTier(next.tier);
    if (next.slowMs >= policy.downgradeAfterMs && down) {
      next = changeTo(next, down, 'down');
    } else if (
      next.fastMs >= policy.upgradeAfterMs &&
      up &&
      RANK[up] <= RANK[next.ceiling] &&
      !next.upgraded &&
      !next.downgraded
    ) {
      next = changeTo(next, up, 'up');
    }
  }

  const stable = next.sinceChangeMs >= policy.warmupMs + policy.settleAfterMs;
  return stable || elapsedMs >= policy.maxDurationMs ? { ...next, settled: true } : next;
}

/**
 * Ends adaptation at the current tier. The provider's wall-clock backstop, for when frames
 * stop arriving altogether (no window ever reaches `adaptTier`).
 */
export const settleGovernor = (state: GovernorState): GovernorState =>
  state.settled ? state : { ...state, settled: true };

/**
 * Median and 90th percentile of the first `count` frame times in `samples`, sorted in
 * `scratch` so the caller's ring buffer keeps its order and nothing is allocated per frame.
 * Nearest-rank percentiles; `count` is clamped to both buffers.
 */
export function summariseFrameTimes(
  samples: Float32Array,
  count: number,
  scratch: Float32Array,
  durationMs: number
): FrameStats {
  const n = Math.max(0, Math.min(count, samples.length, scratch.length));
  if (n === 0) return { durationMs, frames: 0, p50Ms: Number.NaN, p90Ms: Number.NaN };
  scratch.set(samples.subarray(0, n));
  const sorted = scratch.subarray(0, n).sort();
  const at = (p: number): number => sorted[Math.min(n - 1, Math.ceil(p * n) - 1)] ?? Number.NaN;
  return { durationMs, frames: n, p50Ms: at(0.5), p90Ms: at(0.9) };
}
