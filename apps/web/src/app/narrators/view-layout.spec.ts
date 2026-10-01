import { describe, expect, it } from 'vitest';
import { LANDMARK_PLACEMENTS } from '../dive.config';
import {
  pointAtScreen,
  pointAtScreenAbove,
  screenOf,
  spreadAngles,
  viewFrame,
  worldPerPx,
  yawTowards,
  type Vec3,
} from './view-layout';
import { stopView } from './stop-view';

const eye: Vec3 = [3.5, 2.4, 7];
const focus: Vec3 = [0, 1.3, 0];
const desktop = { width: 1440, height: 900 };

describe('viewFrame', () => {
  it('looks from the eye at the focus, which shows at the middle of the screen', () => {
    const view = viewFrame(eye, focus, 55, desktop);
    const centre = screenOf(view, focus);
    expect(centre.x).toBeCloseTo(720, 6);
    expect(centre.y).toBeCloseTo(450, 6);
    expect(centre.depth).toBeCloseTo(Math.hypot(3.5, 1.1, 7), 6);
    // An orthonormal basis, screen-up pointing up the world.
    expect(view.up[1]).toBeGreaterThan(0);
    expect(Math.hypot(...view.right)).toBeCloseTo(1, 9);
  });

  it('pulls the eye back along its line of sight', () => {
    const near = viewFrame(eye, focus, 55, desktop);
    const far = viewFrame(eye, focus, 55, desktop, 2);
    expect(far.focusDepth).toBeCloseTo(near.focusDepth * 2, 9);
    expect(far.forward).toEqual(near.forward);
    expect(viewFrame(eye, focus, 55, desktop, 0.5).focusDepth).toBeCloseTo(
      near.focusDepth,
      9,
    );
  });

  it('gives a usable frame for degenerate input', () => {
    const view = viewFrame(focus, focus, Number.NaN, {
      width: 0,
      height: Number.NaN,
    });
    for (const value of [
      ...view.eye,
      ...view.forward,
      ...view.right,
      ...view.up,
      view.focalPx,
    ])
      expect(Number.isFinite(value)).toBe(true);
  });
});

describe('pointAtScreen and screenOf', () => {
  const view = viewFrame(eye, focus, 55, desktop);

  it('round-trip: a point placed at a screen spot shows there', () => {
    for (const [x, y, depth] of [
      [100, 200, 5],
      [1300, 820, 9],
      [720, 450, 2],
    ] as const) {
      const shown = screenOf(view, pointAtScreen(view, x, y, depth));
      expect(shown.x).toBeCloseTo(x, 6);
      expect(shown.y).toBeCloseTo(y, 6);
      expect(shown.depth).toBeCloseTo(depth, 6);
    }
  });

  it('sizes in pixels: one world unit at depth d is focal / d pixels', () => {
    const a = pointAtScreen(view, 700, 450, 6);
    const b = pointAtScreen(view, 700 + 1 / worldPerPx(view, 6), 450, 6);
    expect(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])).toBeCloseTo(1, 6);
    expect(worldPerPx(view, -1)).toBe(0);
  });

  it('a point behind the eye does not show', () => {
    const behind = screenOf(view, [eye[0] + 1, eye[1], eye[2] + 5]);
    expect(Number.isNaN(behind.x)).toBe(true);
  });

  it('keeps a low point above the seabed by bringing it nearer, still on the same spot', () => {
    const ground = 0;
    const low = pointAtScreen(view, 720, 880, 8);
    expect(low[1]).toBeLessThan(ground);
    const lifted = pointAtScreenAbove(view, 720, 880, 8, ground);
    expect(lifted.point[1]).toBeCloseTo(ground, 6);
    expect(lifted.depth).toBeLessThan(8);
    const shown = screenOf(view, lifted.point);
    expect(shown.x).toBeCloseTo(720, 6);
    expect(shown.y).toBeCloseTo(880, 6);
    // Already above: unchanged.
    const high = pointAtScreenAbove(view, 720, 200, 8, ground);
    expect(high.depth).toBe(8);
  });
});

describe('helpers', () => {
  it('yawTowards: 0 faces +Z, a quarter turn faces +X', () => {
    expect(yawTowards([0, 0, 0], [0, 5, 3])).toBeCloseTo(0, 9);
    expect(yawTowards([0, 0, 0], [2, 0, 0])).toBeCloseTo(Math.PI / 2, 9);
  });

  it('spreadAngles spaces evenly, ends included', () => {
    expect(spreadAngles(3, 90, -90)).toEqual([90, 0, -90]);
    expect(spreadAngles(1, 10, 30)).toEqual([20]);
    expect(spreadAngles(0, 0, 1)).toEqual([]);
  });
});

describe('stopView', () => {
  it('is the dive stop of the landmark, with the seabed at its base', () => {
    const view = stopView('landmark-pineapple');
    expect(view.focus[1]).toBeGreaterThan(view.ground);
    expect(view.ground).toBeCloseTo(
      LANDMARK_PLACEMENTS['landmark-pineapple'][1] * 20,
      6,
    );
    expect(
      Math.hypot(view.eye[0] - view.focus[0], view.eye[2] - view.focus[2]),
    ).toBeGreaterThan(1);
  });

  it('refuses a stop that does not exist', () => {
    expect(() =>
      stopView('landmark-pineapple', {
        controlPoints: [],
        waypoints: [],
        depth: { surfaceY: 0, floorY: -1, floorMeters: 1 },
      }),
    ).toThrow(/No dive stop/);
  });
});
