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

/** Plain path-following: no sway, a 9-unit look-ahead and no turn towards stops. */
const make = (reducedMotion = false) =>
  new DiveController(PATH, { sway: 0, lookAhead: 9, attention: { inner: 0, outer: 0 }, reducedMotion });

const distanceTo = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

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

/** The same route with paced stops: scroll and progress differ, and the end has a subject. */
const PACED = DivePath.create({
  controlPoints: [
    [30, 30, 30],
    [20, 10, 18],
    [16, 4, 4],
    [0, 5, 8],
    [-20, 2, 8],
  ],
  waypoints: [
    { id: 'pineapple', at: 2, focus: [15.8, 2.7, -2], scroll: 0.3 },
    { id: 'bureau', at: 3, focus: [-2, 4, 0], scroll: 0.7 },
  ],
  depth: { surfaceY: 34, floorY: 1.4, floorMeters: 180 },
  pacing: { dwell: 0.1, creep: 1 },
  endFocus: [-26, 4, 14],
});

const makePaced = () => new DiveController(PACED, { sway: 0, lookAhead: 9, attention: { inner: 3, outer: 20 } });

describe('DiveController pacing', () => {
  it('turns scroll into progress through the path pacing', () => {
    const c = makePaced();
    const fake = fakeScroll(0.3);
    c.connect(fake.source);
    c.step(1 / 60);
    expect(c.getState().progress).toBeCloseTo(PACED.progressOf('pineapple'), 9);
    fake.scroll(0.33); // inside the hold: the camera only creeps
    frames(c, 5);
    expect((c.getState().progress - PACED.progressOf('pineapple')) * PACED.length).toBeLessThan(0.5 + 1e-9);
  });

  it('scrolls the page to a waypoint by its scroll position, not its progress', () => {
    const c = makePaced();
    const fake = fakeScroll(0);
    c.connect(fake.source);
    c.scrollToWaypoint('bureau');
    expect(fake.source.scrollTo).toHaveBeenCalledWith(0.7, true);
    frames(c, 6);
    expect(c.getState().progress).toBeCloseTo(PACED.progressOf('bureau'), 6);
  });

  it('restores the scroll position, and the matching progress, after a focus', () => {
    const c = makePaced();
    const fake = fakeScroll(0.5);
    c.connect(fake.source);
    c.step(1 / 60);
    c.focusWaypoint('pineapple');
    fake.scroll(0.9);
    frames(c, 6);
    c.release();
    expect(fake.source.scrollTo).toHaveBeenCalledWith(0.5, false);
    frames(c, 6);
    expect(c.getState().progress).toBeCloseTo(PACED.progressAtScroll(0.5), 6);
  });

  it('holds the progress, not the scroll, when there is no scroll source', () => {
    const c = makePaced();
    c.scrollToWaypoint('bureau');
    frames(c, 6);
    c.focusWaypoint('pineapple');
    frames(c, 6);
    c.release();
    frames(c, 6);
    expect(c.getState().progress).toBeCloseTo(PACED.progressOf('bureau'), 6);
  });
});

describe('DiveController attention', () => {
  it('looks at the stop it is scrolled to, without a focus call', () => {
    const c = makePaced();
    c.connect(fakeScroll(0.7).source);
    c.step(1 / 60);
    c.pose.lookAt.forEach((v, i) => expect(v).toBeCloseTo([-2, 4, 0][i], 9));
    expect(c.getState().mode).toBe('scroll');
  });

  it('looks along the path far from any stop', () => {
    const c = makePaced();
    c.connect(fakeScroll(0).source);
    c.step(1 / 60);
    const ahead = PACED.pointAt(9 / PACED.length);
    c.pose.lookAt.forEach((v, i) => expect(v).toBeCloseTo(ahead[i], 9));
  });

  it('ends looking at the end focus', () => {
    const c = makePaced();
    c.connect(fakeScroll(1).source);
    c.step(1 / 60);
    c.pose.lookAt.forEach((v, i) => expect(v).toBeCloseTo([-26, 4, 14][i], 9));
  });

  it('turns smoothly: no jump in the look target between neighbouring scroll positions', () => {
    const c = new DiveController(PACED, { sway: 0, lookAhead: 9, attention: { inner: 3, outer: 20 }, reducedMotion: true });
    const fake = fakeScroll(0);
    c.connect(fake.source);
    c.step(1 / 60);
    let previous = [...c.pose.lookAt];
    for (let i = 1; i <= 1000; i++) {
      fake.scroll(i / 1000);
      c.step(1 / 60);
      expect(distanceTo(c.pose.lookAt, previous)).toBeLessThan(1.5);
      previous = [...c.pose.lookAt];
    }
  });
});

describe('DiveController framing', () => {
  it('stands further back from a stop on a portrait viewport, along the line of sight', () => {
    const wide = makePaced();
    wide.setViewAspect(1.6);
    wide.connect(fakeScroll(0.7).source);
    wide.step(1 / 60);
    const tall = makePaced();
    tall.setViewAspect(390 / 844);
    tall.connect(fakeScroll(0.7).source);
    tall.step(1 / 60);

    const focus = [-2, 4, 0];
    const wideDistance = distanceTo(wide.pose.position, focus);
    const tallDistance = distanceTo(tall.pose.position, focus);
    expect(tallDistance / wideDistance).toBeGreaterThan(1.5);
    // Same direction from the subject, so it stays centred.
    const dir = (p: readonly number[], d: number) => p.map((v, i) => (v - focus[i]) / d);
    dir(tall.pose.position, tallDistance).forEach((v, i) => expect(v).toBeCloseTo(dir(wide.pose.position, wideDistance)[i], 9));
    tall.pose.lookAt.forEach((v, i) => expect(v).toBeCloseTo(focus[i], 9));
  });

  it('leaves open-water travel on the path whatever the aspect', () => {
    const c = makePaced();
    c.setViewAspect(0.4);
    c.connect(fakeScroll(0).source);
    c.step(1 / 60);
    const on = PACED.pointAt(0);
    c.pose.position.forEach((v, i) => expect(v).toBeCloseTo(on[i], 9));
  });
});

describe('DiveController focus switching (look-at continuity)', () => {
  const PINEAPPLE = [15.8, 2.7, -2];
  const BUREAU = [-2, 4, 0];

  it('pans the gaze from one focused landmark to the next instead of cutting', () => {
    const c = makePaced();
    c.connect(fakeScroll(0.5).source);
    c.step(1 / 60);
    c.focusWaypoint('pineapple');
    frames(c, 6);
    c.pose.lookAt.forEach((v, i) => expect(v).toBeCloseTo(PINEAPPLE[i], 6));

    c.focusWaypoint('bureau');
    c.step(1 / 60);
    // One frame later the gaze has barely left the pineapple...
    expect(distanceTo(c.pose.lookAt, PINEAPPLE)).toBeLessThan(0.5);
    // ...and it never jumps on the way across.
    let previous = [...c.pose.lookAt];
    for (let i = 0; i < 360; i++) {
      c.step(1 / 60);
      expect(distanceTo(c.pose.lookAt, previous)).toBeLessThan(1);
      previous = [...c.pose.lookAt];
    }
    c.pose.lookAt.forEach((v, i) => expect(v).toBeCloseTo(BUREAU[i], 6));
  });

  it('still eases in from the path on a first focus, and snaps with reduced motion', () => {
    const c = makePaced();
    c.connect(fakeScroll(0).source);
    c.step(1 / 60);
    const before = [...c.pose.lookAt];
    c.focusWaypoint('bureau');
    c.step(1 / 60);
    expect(distanceTo(c.pose.lookAt, before)).toBeLessThan(1);

    const reduced = new DiveController(PACED, { sway: 0, lookAhead: 9, reducedMotion: true });
    reduced.connect(fakeScroll(0.5).source);
    reduced.focusWaypoint('pineapple');
    reduced.step(1 / 60);
    reduced.focusWaypoint('bureau');
    reduced.step(1 / 60);
    reduced.pose.lookAt.forEach((v, i) => expect(v).toBeCloseTo(BUREAU[i], 9));
  });

  it('fades the old focus out when switching to a stop with nothing to face', () => {
    const c = make();
    c.connect(fakeScroll(0.05).source);
    c.step(1 / 60);
    c.focusWaypoint('pineapple');
    frames(c, 6);
    c.focusWaypoint('bureau'); // no focus on PATH's bureau
    c.step(1 / 60);
    expect(distanceTo(c.pose.lookAt, [15.8, 2.7, -2])).toBeLessThan(2);
  });
});

describe('DiveController framing transitions', () => {
  const pullBack = (c: DiveController) => distanceTo(c.pose.position, PACED.pointAt(PACED.progressOf('bureau')));

  it('applies the first aspect at once: no pull-back animation on page load', () => {
    const c = makePaced();
    c.setViewAspect(390 / 844);
    c.connect(fakeScroll(0.7).source);
    c.step(1 / 60);
    const settled = makePaced();
    settled.setViewAspect(390 / 844);
    settled.connect(fakeScroll(0.7).source);
    frames(settled, 5);
    expect(pullBack(c)).toBeCloseTo(pullBack(settled), 9);
    expect(pullBack(c)).toBeGreaterThan(1);
  });

  it('eases a rotation instead of jumping, and is frame-rate independent', () => {
    const run = (fps: number) => {
      const c = makePaced();
      c.setViewAspect(390 / 844);
      c.connect(fakeScroll(0.7).source);
      frames(c, 1, fps);
      const portrait = pullBack(c);
      c.setViewAspect(844 / 390);
      frames(c, 0.25, fps);
      return { c, portrait, quarter: pullBack(c) };
    };
    const at60 = run(60);
    expect(at60.quarter).toBeGreaterThan(0.05);
    expect(at60.quarter).toBeLessThan(at60.portrait);
    expect(run(144).quarter).toBeCloseTo(at60.quarter, 6);
    frames(at60.c, 5);
    expect(pullBack(at60.c)).toBeLessThan(1e-6);
  });

  it('jumps straight to the new framing with reduced motion', () => {
    const c = new DiveController(PACED, { sway: 0, lookAhead: 9, reducedMotion: true });
    c.setViewAspect(390 / 844);
    c.connect(fakeScroll(0.7).source);
    c.step(1 / 60);
    c.setViewAspect(1.6);
    c.step(1 / 60);
    expect(pullBack(c)).toBeLessThan(1e-9);
  });
});
