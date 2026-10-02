import { describe, expect, it } from 'vitest';
import { screenOf, viewFrame, worldPerPx } from './view-layout';
import {
  groundPointAtScreen,
  isPortrait,
  pixelSize,
  placeNarrator,
} from './visit-layout';

// A camera 3 up and 10 back, looking a little down, over a seabed at y = 0.
const view = viewFrame([0, 3, 10], [0, 1, 0], 55, { width: 1440, height: 900 });

describe('visit layout', () => {
  it('clamps pixel sizes to their range', () => {
    const size = { ofHeight: 0.1, ofWidth: 0.1, min: 50, max: 80 };
    expect(pixelSize(size, 300, 300)).toBe(50);
    expect(pixelSize(size, 4000, 4000)).toBe(80);
    expect(pixelSize(size, 600, 700)).toBe(60);
  });

  it('tells portrait screens from landscape ones', () => {
    expect(isPortrait(390 / 844)).toBe(true);
    expect(isPortrait(1440 / 900)).toBe(false);
  });

  it('finds the seabed point under a spot low on the screen, where it shows', () => {
    const at = groundPointAtScreen(view, 500, 800, 0, 100);
    expect(at.point[1]).toBeCloseTo(0, 6);
    const shown = screenOf(view, at.point);
    expect(shown.x).toBeCloseTo(500, 4);
    expect(shown.y).toBeCloseTo(800, 4);
    expect(at.depth).toBeCloseTo(shown.depth, 6);
  });

  it('floats at the most distant depth where the line of sight never comes down to the seabed', () => {
    const at = groundPointAtScreen(view, 720, 10, 0, 30);
    expect(at.depth).toBe(30);
    expect(at.point[1]).toBeGreaterThan(0);
  });

  it('places the narrator at its spot on screen, the height it should look, facing the eye', () => {
    const spec = {
      x: 0.25,
      y: 0.45,
      height: { ofHeight: 0.13, ofWidth: 0.09, min: 72, max: 132 },
      depth: 0.8,
    };
    const narrator = placeNarrator(view, spec, 0);
    const middle = screenOf(view, [
      narrator.post[0],
      narrator.post[1] + narrator.height / 2,
      narrator.post[2],
    ]);
    expect(Math.abs(middle.x - 0.25 * 1440)).toBeLessThan(8);
    expect(Math.abs(middle.y - 0.45 * 900)).toBeLessThan(8);
    const px = narrator.height / worldPerPx(view, middle.depth);
    expect(Math.abs(px - 117) / 117).toBeLessThan(0.1);
    expect(narrator.post[1]).toBeGreaterThan(0);
    const toEye = Math.atan2(view.eye[0] - narrator.post[0], view.eye[2] - narrator.post[2]);
    expect(narrator.restYaw).toBeCloseTo(toEye, 9);
  });
});
