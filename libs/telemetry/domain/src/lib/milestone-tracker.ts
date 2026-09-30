import { DEPTH_MILESTONES, type DepthBucket, type DepthMilestone } from './events.js';

/**
 * A spring-driven camera settles asymptotically, so "100%" may never read exactly 1. A
 * milestone counts as reached within this much progress of its threshold.
 */
export const DEFAULT_MILESTONE_TOLERANCE = 0.005;

export interface DiveMilestoneTrackerOptions {
  /** Ascending percentages; defaults to `DEPTH_MILESTONES`. */
  readonly milestones?: readonly DepthMilestone[];
  /** See `DEFAULT_MILESTONE_TOLERANCE`. */
  readonly tolerance?: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * The deepest milestone at or below `progress` (a [0, 1] fraction of the dive), or 0.
 * Pure helper for callers that only need the bucket, not the once-only bookkeeping.
 */
export function depthBucketFor(
  progress: number,
  tolerance: number = DEFAULT_MILESTONE_TOLERANCE,
  milestones: readonly DepthMilestone[] = DEPTH_MILESTONES
): DepthBucket {
  if (!Number.isFinite(progress)) return 0;
  const p = clamp01(progress);
  let bucket: DepthBucket = 0;
  for (const milestone of milestones) {
    if (p >= milestone / 100 - tolerance) bucket = milestone;
  }
  return bucket;
}

/**
 * Turns a stream of dive progress readings into "milestone newly reached" signals.
 *
 * - Monotonic: it tracks the deepest progress seen, so scrolling back up never re-arms a
 *   milestone and a shallower reading is ignored.
 * - Once per bucket: each milestone is returned by exactly one `update` call per tracker
 *   (one tracker = one visit).
 * - Jitter-safe: a camera oscillating around a threshold crosses it once; non-finite
 *   readings are ignored and out-of-range ones clamped.
 * - A jump past several thresholds at once (deep link, fast fling) returns all of them in
 *   ascending order.
 */
export class DiveMilestoneTracker {
  private readonly milestones: readonly DepthMilestone[];
  private readonly tolerance: number;
  private readonly fired = new Set<DepthMilestone>();
  private deepest = 0;

  constructor(options: DiveMilestoneTrackerOptions = {}) {
    this.milestones = [...(options.milestones ?? DEPTH_MILESTONES)].sort((a, b) => a - b);
    this.tolerance = Math.max(0, options.tolerance ?? DEFAULT_MILESTONE_TOLERANCE);
  }

  /** Feed a progress reading in [0, 1]; returns the milestones this reading newly reached. */
  update(progress: number): DepthMilestone[] {
    if (!Number.isFinite(progress)) return [];
    const p = clamp01(progress);
    if (p <= this.deepest) return [];
    this.deepest = p;

    const reached: DepthMilestone[] = [];
    for (const milestone of this.milestones) {
      if (!this.fired.has(milestone) && p >= milestone / 100 - this.tolerance) {
        this.fired.add(milestone);
        reached.push(milestone);
      }
    }
    return reached;
  }

  /** Deepest progress seen, in [0, 1]. */
  get maxProgress(): number {
    return this.deepest;
  }

  /** Deepest milestone reached so far, or 0. */
  get bucket(): DepthBucket {
    let bucket: DepthBucket = 0;
    for (const milestone of this.milestones) if (this.fired.has(milestone)) bucket = milestone;
    return bucket;
  }
}
