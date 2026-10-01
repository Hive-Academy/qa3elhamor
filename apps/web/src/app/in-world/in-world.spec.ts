import { describe, expect, it } from 'vitest';
import { inWorldAvailable } from './in-world-mode';
import {
  DEFAULT_IN_WORLD_TIMING,
  IN_WORLD_DISTANCE_FACTOR,
  bobAt,
  createBob,
  emergeProgress,
  facingPoint,
  focalLengthPx,
  htmlScaleFor,
  leaveProgress,
  worldPerPixel,
} from './in-world-pose';

describe('inWorldAvailable', () => {
  const ok = { reducedMotion: false, tier: 'high', webgl: true } as const;

  it('runs in-world presentations on capable, motion-tolerant pages', () => {
    expect(inWorldAvailable(ok)).toBe(true);
    expect(inWorldAvailable({ ...ok, tier: 'medium' })).toBe(true);
  });

  it('keeps the DOM dialogs for reduced motion, the low tier and no WebGL', () => {
    expect(inWorldAvailable({ ...ok, reducedMotion: true })).toBe(false);
    expect(inWorldAvailable({ ...ok, tier: 'low' })).toBe(false);
    expect(inWorldAvailable({ ...ok, webgl: false })).toBe(false);
  });
});

describe('crisp in-world HTML', () => {
  it("matches three.js's focal length (projectionMatrix[5] * height / 2)", () => {
    const fov = 55;
    const height = 900;
    const p5 = 1 / Math.tan((fov * Math.PI) / 360);
    expect(focalLengthPx(fov, height)).toBeCloseTo((p5 * height) / 2, 9);
  });

  it('picks the scale that shows one CSS pixel as one screen pixel, at any depth', () => {
    const focal = focalLengthPx(55, 844);
    for (const depth of [0.5, 2, 9]) {
      const scale = htmlScaleFor(depth, focal);
      // drei: CSS px -> world = scale * distanceFactor / 400; perspective: * focal / depth.
      const shown = (scale * (IN_WORLD_DISTANCE_FACTOR / 400) * focal) / depth;
      expect(shown).toBeCloseTo(1, 12);
    }
    expect(htmlScaleFor(2, focal, 0.5)).toBeCloseTo(htmlScaleFor(2, focal) / 2);
  });

  it('never yields NaN or Infinity: unusable inputs give 0 (nothing drawn, no offset)', () => {
    expect(focalLengthPx(55, 0)).toBe(0);
    expect(focalLengthPx(0, 900)).toBe(0);
    expect(focalLengthPx(Number.NaN, 900)).toBe(0);
    for (const focal of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(htmlScaleFor(2, focal)).toBe(0);
      expect(worldPerPixel(2, focal)).toBe(0);
    }
    for (const depth of [0, -1, Number.NaN]) {
      expect(htmlScaleFor(depth, 800)).toBe(0);
      expect(worldPerPixel(depth, 800)).toBe(0);
    }
    expect(htmlScaleFor(2, 800, Number.NaN)).toBe(0);
  });

  it('converts on-screen pixel offsets to world units at the card depth', () => {
    const focal = focalLengthPx(55, 900);
    expect(worldPerPixel(2, focal) * focal).toBeCloseTo(2);
  });
});

describe('card timeline', () => {
  const { delay, emerge, leave } = DEFAULT_IN_WORLD_TIMING;

  it('waits at the door for the curtain, then eases out to settle exactly', () => {
    expect(emergeProgress(0)).toBe(0);
    expect(emergeProgress(delay)).toBe(0);
    const mid = emergeProgress(delay + emerge / 2);
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(1);
    expect(emergeProgress(delay + emerge)).toBe(1);
    expect(emergeProgress(delay + emerge + 10)).toBe(1);
  });

  it('returns to the door from wherever it was when closed', () => {
    expect(leaveProgress(0, 1)).toBe(1);
    expect(leaveProgress(0, 0.4)).toBeCloseTo(0.4);
    expect(leaveProgress(leave, 1)).toBe(0);
    expect(leaveProgress(leave / 2, 1)).toBeGreaterThan(0.5);
  });

  it('holds perfectly still when calmed', () => {
    expect(
      Object.values(bobAt(12.3, 0, createBob())).every((v) => v === 0),
    ).toBe(true);
    const moving = bobAt(12.3, 1, createBob());
    expect(Math.abs(moving.y)).toBeLessThanOrEqual(6);
    expect(Math.abs(moving.yaw)).toBeLessThanOrEqual(0.02);
  });

  it('writes the bob into the scratch it is given, allocating nothing per frame', () => {
    const scratch = createBob();
    expect(bobAt(1, 1, scratch)).toBe(scratch);
    expect(bobAt(2, 1, scratch)).toBe(scratch);
    expect(Object.values(bobAt(Number.NaN, Number.NaN, scratch))).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('turns round from where it was when re-opened on its way back in', () => {
    // No wait for the curtain, no jump back to the door.
    expect(emergeProgress(0, DEFAULT_IN_WORLD_TIMING, 0.6)).toBeCloseTo(0.6);
    expect(emergeProgress(0.05, DEFAULT_IN_WORLD_TIMING, 0.6)).toBeGreaterThan(
      0.6,
    );
    expect(emergeProgress(emerge, DEFAULT_IN_WORLD_TIMING, 0.6)).toBe(1);
  });
});

describe('facingPoint', () => {
  it('is the footprint edge on the viewer side', () => {
    const p = facingPoint({ x: 1, z: 1 }, { x: 1, z: 11 }, 0.5);
    expect(p.x).toBeCloseTo(1);
    expect(p.z).toBeCloseTo(1.5);
  });

  it('survives a viewer straight above the centre', () => {
    expect(facingPoint({ x: 0, z: 0 }, { x: 0, z: 0 }, 2)).toEqual({
      x: 0,
      z: 2,
    });
  });
});
