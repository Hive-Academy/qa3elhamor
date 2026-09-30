import { DivePath } from '@qa3elhamor/dive-domain';
import { describe, expect, it, vi } from 'vitest';
import { DiveController } from './dive-controller.js';
import type { ScrollSource } from './scroll-source.js';

const PATH = DivePath.create({
  controlPoints: [
    [30, 30, 30],
    [20, 10, 18],
    [16, 4, 4],
    [0, 5, 8],
    [-20, 2, 8],
  ],
  waypoints: [
    { id: 'pineapple', at: 2, focus: [15.8, 2.7, -2] },
    { id: 'bureau', at: 3 },
  ],
  depth: { surfaceY: 34, floorY: 1.4, floorMeters: 180 },
});

/** A scroll bar under test control. */
function fakeScroll(initial = 0) {
  let progress = initial;
  const listeners = new Set<() => void>();
  const source: ScrollSource = {
    read: () => progress,
    scrollTo: vi.fn((p: number) => {
      progress = p;
      listeners.forEach((l) => l());
    }),
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  const scroll = (p: number) => {
    progress = p;
    listeners.forEach((l) => l());
  };
  return { source, scroll, listenerCount: () => listeners.size };
}

const frames = (c: DiveController, seconds: number, fps = 60) => {
  for (let i = 0; i < Math.round(seconds * fps); i++) c.step(1 / fps);
};

const make = (reducedMotion = false) => new DiveController(PATH, { sway: 0, reducedMotion });

describe('DiveController scroll', () => {
  it('snaps to the scroll position on connect, then eases towards new targets', () => {
    const c = make();
    const { source, scroll } = fakeScroll(0.3);
    c.connect(source);
    c.step(1 / 60);
    expect(c.getState().progress).toBeCloseTo(0.3, 9);

    scroll(0.6);
    c.step(1 / 60);
    const afterOneFrame = c.getState().progress;
    expect(afterOneFrame).toBeGreaterThan(0.3);
    expect(afterOneFrame).toBeLessThan(0.35);
    expect(c.getState().targetProgress).toBe(0.6);
    expect(c.getState().velocity).toBeGreaterThan(0);

    frames(c, 5);
    expect(c.getState().progress).toBe(0.6);
    expect(c.getState().velocity).toBe(0);
  });

  it('places the camera on the path, looking ahead and down the dive', () => {
    const c = make();
    c.connect(fakeScroll(0.5).source);
    c.step(1 / 60);
    const on = PATH.pointAt(0.5);
    c.pose.position.forEach((v, i) => expect(v).toBeCloseTo(on[i], 9));
    const ahead = PATH.pointAt(0.5 + 9 / PATH.length);
    c.pose.lookAt.forEach((v, i) => expect(v).toBeCloseTo(ahead[i], 9));
  });

  it('keeps a look target ahead of the camera at the very end of the dive', () => {
    const c = make();
    c.connect(fakeScroll(1).source);
    c.step(1 / 60);
    const { position, lookAt } = c.pose;
    expect(Math.hypot(lookAt[0] - position[0], lookAt[1] - position[1], lookAt[2] - position[2])).toBeCloseTo(9, 6);
  });

  it('publishes depth, nearest waypoint and the deepest point reached', () => {
    const c = make();
    const { source, scroll } = fakeScroll(0);
    c.connect(source);
    c.step(1 / 60);
    expect(c.getState().depth).toBeCloseTo(PATH.depthAt(0), 9);

    scroll(0.9);
    frames(c, 5);
    scroll(0.2);
    frames(c, 5);
    const s = c.getState();
    expect(s.depth).toBeCloseTo(PATH.depthAt(0.2), 6);
    expect(s.maxProgress).toBeCloseTo(0.9, 6);
    expect(s.maxDepth).toBeGreaterThanOrEqual(PATH.depthAt(0.9) - 1e-6);
    expect(s.nearestWaypointId).toBe(PATH.nearestWaypoint(0.2)?.id);
  });

  it('notifies only while something changes', () => {
    const c = make();
    const { source, scroll } = fakeScroll(0);
    c.connect(source);
    frames(c, 1);
    const listener = vi.fn();
    c.subscribe(listener);
    frames(c, 1);
    expect(listener).not.toHaveBeenCalled();
    scroll(0.5);
    frames(c, 1);
    expect(listener).toHaveBeenCalled();
  });

  it('disconnects from the scroll source', () => {
    const c = make();
    const fake = fakeScroll(0);
    const disconnect = c.connect(fake.source);
    expect(fake.listenerCount()).toBe(1);
    disconnect();
    expect(fake.listenerCount()).toBe(0);
  });
});

describe('DiveController reduced motion', () => {
  it('jumps to the target with no easing and no velocity', () => {
    const c = make(true);
    const { source, scroll } = fakeScroll(0);
    c.connect(source);
    c.step(1 / 60);
    scroll(0.8);
    c.step(1 / 60);
    expect(c.getState().progress).toBe(0.8);
    expect(c.getState().velocity).toBe(0);
  });

  it('has no sway', () => {
    const c = new DiveController(PATH, { sway: 1, reducedMotion: true });
    c.connect(fakeScroll(0.4).source);
    frames(c, 2);
    const on = PATH.pointAt(0.4);
    c.pose.position.forEach((v, i) => expect(v).toBeCloseTo(on[i], 9));
  });

  it('scrolls to a waypoint instantly', () => {
    const c = make(true);
    const fake = fakeScroll(0);
    c.connect(fake.source);
    c.scrollToWaypoint('bureau');
    expect(fake.source.scrollTo).toHaveBeenCalledWith(PATH.progressOf('bureau'), false);
  });
});

describe('DiveController focus and suspension (landmark-kernel API)', () => {
  it('swims to a waypoint, faces its focus, ignores scroll, and restores on release', () => {
    const c = make();
    const fake = fakeScroll(0.1);
    c.connect(fake.source);
    c.step(1 / 60);

    c.focusWaypoint('pineapple');
    expect(c.getState().mode).toBe('focus');
    expect(c.getState().focusedWaypointId).toBe('pineapple');
    fake.scroll(0.95); // the visitor scrolls the overlay's page: ignored
    frames(c, 6);
    expect(c.getState().progress).toBeCloseTo(PATH.progressOf('pineapple'), 6);
    c.pose.lookAt.forEach((v, i) => expect(v).toBeCloseTo([15.8, 2.7, -2][i], 3));

    c.release();
    expect(c.getState().mode).toBe('scroll');
    expect(fake.source.scrollTo).toHaveBeenCalledWith(0.1, false);
    frames(c, 6);
    expect(c.getState().progress).toBeCloseTo(0.1, 6);
    expect(c.getState().focusedWaypointId).toBeNull();
  });

  it('keeps the original return point when switching focus between waypoints', () => {
    const c = make();
    const fake = fakeScroll(0.05);
    c.connect(fake.source);
    c.focusWaypoint('pineapple');
    c.focusWaypoint('bureau');
    frames(c, 6);
    expect(c.getState().progress).toBeCloseTo(PATH.progressOf('bureau'), 6);
    c.release();
    frames(c, 6);
    expect(c.getState().progress).toBeCloseTo(0.05, 6);
  });

  it('suspends scroll control until release', () => {
    const c = make();
    const fake = fakeScroll(0.2);
    c.connect(fake.source);
    frames(c, 1);
    c.suspend();
    expect(c.getState().mode).toBe('suspended');
    fake.scroll(0.7);
    frames(c, 2);
    expect(c.getState().progress).toBeCloseTo(0.2, 9);
    c.release();
    expect(fake.source.read()).toBe(0.2);
  });

  it('suspend during a focus swim stops the camera short, and release still returns', () => {
    const c = make();
    const fake = fakeScroll(0.05);
    c.connect(fake.source);
    c.step(1 / 60);
    c.focusWaypoint('bureau');
    frames(c, 0.2);
    c.suspend();
    expect(c.getState().mode).toBe('suspended');
    frames(c, 6);
    const stoppedAt = c.getState().progress;
    expect(stoppedAt).toBeGreaterThan(0.05);
    expect(stoppedAt).toBeLessThan(PATH.progressOf('bureau') - 0.05);
    c.release();
    frames(c, 6);
    expect(c.getState().progress).toBeCloseTo(0.05, 6);
  });

  it('scrollToWaypoint from focus makes one page move, with no snap back first', () => {
    const c = make();
    const fake = fakeScroll(0.05);
    c.connect(fake.source);
    c.focusWaypoint('pineapple');
    fake.scroll(0.5);
    c.scrollToWaypoint('bureau');
    expect(fake.source.scrollTo).toHaveBeenCalledTimes(1);
    expect(fake.source.scrollTo).toHaveBeenCalledWith(PATH.progressOf('bureau'), true);
    expect(c.getState().mode).toBe('scroll');
    expect(c.getState().focusedWaypointId).toBeNull();
    frames(c, 6);
    expect(c.getState().progress).toBeCloseTo(PATH.progressOf('bureau'), 6);
  });

  it('never produces a NaN pose', () => {
    const c = make();
    c.connect(fakeScroll(0.4).source);
    c.step(Number.NaN);
    c.step(1 / 60);
    [...c.pose.position, ...c.pose.lookAt].forEach((v) => expect(Number.isFinite(v)).toBe(true));
  });

  it('rejects unknown waypoints', () => {
    const c = make();
    expect(() => c.focusWaypoint('nope')).toThrow(RangeError);
    expect(() => c.scrollToWaypoint('nope')).toThrow(RangeError);
  });

  it('scrollToWaypoint animates the page scroll and stays scroll-driven', () => {
    const c = make();
    const fake = fakeScroll(0);
    c.connect(fake.source);
    c.scrollToWaypoint('bureau');
    expect(fake.source.scrollTo).toHaveBeenCalledWith(PATH.progressOf('bureau'), true);
    expect(c.getState().mode).toBe('scroll');
  });
});
