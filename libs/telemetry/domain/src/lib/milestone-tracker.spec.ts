import { DiveMilestoneTracker, depthBucketFor } from './milestone-tracker.js';

describe('DiveMilestoneTracker', () => {
  it('emits each milestone once as progress deepens', () => {
    const tracker = new DiveMilestoneTracker();
    expect(tracker.update(0.1)).toEqual([]);
    expect(tracker.update(0.26)).toEqual([25]);
    expect(tracker.update(0.3)).toEqual([]);
    expect(tracker.update(0.5)).toEqual([50]);
    expect(tracker.bucket).toBe(50);
  });

  it('is monotonic: scrolling back up and down again never re-fires', () => {
    const tracker = new DiveMilestoneTracker();
    expect(tracker.update(0.55)).toEqual([25, 50]);
    expect(tracker.update(0.1)).toEqual([]);
    expect(tracker.update(0.55)).toEqual([]);
    expect(tracker.update(0.6)).toEqual([]);
    expect(tracker.maxProgress).toBe(0.6);
  });

  it('is jitter-safe around a threshold', () => {
    const tracker = new DiveMilestoneTracker({ tolerance: 0 });
    const fired = [0.249, 0.2501, 0.2499, 0.2502, 0.2498, 0.2503].flatMap((p) =>
      tracker.update(p)
    );
    expect(fired).toEqual([25]);
  });

  it('counts a settling spring as reaching 100%', () => {
    const tracker = new DiveMilestoneTracker();
    expect(tracker.update(0.997)).toEqual([25, 50, 75, 100]);
    expect(tracker.update(1)).toEqual([]);
    expect(tracker.bucket).toBe(100);
  });

  it('ignores non-finite readings and clamps out-of-range ones', () => {
    const tracker = new DiveMilestoneTracker();
    expect(tracker.update(Number.NaN)).toEqual([]);
    expect(tracker.update(-3)).toEqual([]);
    expect(tracker.update(7)).toEqual([25, 50, 75, 100]);
    expect(tracker.maxProgress).toBe(1);
  });

  it('starts at bucket 0', () => {
    expect(new DiveMilestoneTracker().bucket).toBe(0);
  });
});

describe('depthBucketFor', () => {
  it('maps progress to the deepest milestone at or below it', () => {
    expect(depthBucketFor(0)).toBe(0);
    expect(depthBucketFor(0.3)).toBe(25);
    expect(depthBucketFor(0.749)).toBe(75);
    expect(depthBucketFor(Number.NaN)).toBe(0);
  });
});
