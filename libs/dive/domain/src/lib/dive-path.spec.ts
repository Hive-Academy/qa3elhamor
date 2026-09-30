import { describe, expect, it } from 'vitest';
import { CatmullRomSpline } from './catmull-rom.js';
import { DivePath, DivePathError, type DivePathSpec } from './dive-path.js';
import { distance, type MutableVec3, type Vec3 } from './vec3.js';

/** Deliberately uneven spacing: a long drop, then short hops, then a long glide. */
const SPEC: DivePathSpec = {
  controlPoints: [
    [30, 30, 30],
    [20, 10, 18],
    [16, 4, 4],
    [12, 4, 2],
    [0, 5, 8],
    [-10, 4, 1],
    [-20, 2, 8],
  ],
  waypoints: [
    { id: 'landmark-pineapple', at: 2, focus: [15.8, 2.7, -2] },
    { id: 'landmark-tiki', at: 3 },
    { id: 'landmark-bureau', at: 5, focus: [-12, 4.7, -0.2] },
  ],
  depth: { surfaceY: 34, floorY: 1.4, floorMeters: 180 },
};

describe('DivePath validation', () => {
  it('accepts a valid spec', () => {
    expect(DivePath.validate(SPEC)).toEqual([]);
    expect(() => DivePath.create(SPEC)).not.toThrow();
  });

  it('needs at least two control points', () => {
    expect(() => DivePath.create({ ...SPEC, controlPoints: [[0, 0, 0]], waypoints: [] })).toThrow(DivePathError);
  });

  it('rejects non-finite coordinates and repeated consecutive points', () => {
    const issues = DivePath.validate({
      ...SPEC,
      waypoints: [],
      controlPoints: [
        [0, 0, 0],
        [1, Number.NaN, 0],
        [2, 2, 2],
        [2, 2, 2],
      ],
    });
    expect(issues.some((i) => i.includes('controlPoints[1]'))).toBe(true);
    expect(issues.some((i) => i.includes('controlPoints[3] repeats'))).toBe(true);
  });

  it('rejects duplicate ids, out-of-order waypoints, bad indices and bad focus', () => {
    const issues = DivePath.validate({
      ...SPEC,
      waypoints: [
        { id: 'a', at: 3 },
        { id: 'a', at: 4 },
        { id: 'b', at: 1 },
        { id: '', at: 5 },
        { id: 'c', at: 99 },
        { id: 'd', at: 6, focus: [0, Infinity, 0] },
      ],
    });
    expect(issues.some((i) => i.includes('not unique'))).toBe(true);
    expect(issues.some((i) => i.includes('out of path order'))).toBe(true);
    expect(issues.some((i) => i.includes('non-empty'))).toBe(true);
    expect(issues.some((i) => i.includes('control point index'))).toBe(true);
    expect(issues.some((i) => i.includes('focus'))).toBe(true);
  });

  it('rejects an inverted depth range', () => {
    const issues = DivePath.validate({ ...SPEC, depth: { surfaceY: 0, floorY: 10, floorMeters: -1 } });
    expect(issues).toHaveLength(2);
  });

  it('lists every issue in the thrown error', () => {
    try {
      DivePath.create({ controlPoints: [], depth: { surfaceY: 0, floorY: 0, floorMeters: 0 } });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DivePathError);
      expect((error as DivePathError).issues.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('is immutable', () => {
    const path = DivePath.create(SPEC);
    expect(Object.isFrozen(path.controlPoints)).toBe(true);
    expect(Object.isFrozen(path.waypoints[0])).toBe(true);
  });
});

describe('DivePath sampling', () => {
  const path = DivePath.create(SPEC);

  it('passes through the first and last control points', () => {
    expect(distance(path.pointAt(0), SPEC.controlPoints[0])).toBeLessThan(1e-9);
    expect(distance(path.pointAt(1), SPEC.controlPoints[6])).toBeLessThan(1e-9);
  });

  it('clamps progress outside [0, 1]', () => {
    expect(path.pointAt(-3)).toEqual(path.pointAt(0));
    expect(path.pointAt(7)).toEqual(path.pointAt(1));
    expect(path.pointAt(Infinity)).toEqual(path.pointAt(1));
    expect(path.pointAt(-Infinity)).toEqual(path.pointAt(0));
  });

  it('treats NaN progress as the surface instead of returning a NaN pose', () => {
    expect(path.pointAt(Number.NaN)).toEqual(path.pointAt(0));
    expect(path.tangentAt(Number.NaN)).toEqual(path.tangentAt(0));
    expect(path.depthAt(Number.NaN)).toBe(path.depthAt(0));
    const raw: MutableVec3 = [0, 0, 0];
    new CatmullRomSpline(SPEC.controlPoints).evaluate(Number.NaN, raw);
    expect(raw).toEqual([...SPEC.controlPoints[0]]);
  });

  it('is arc-length parameterised: equal progress steps cover equal distances', () => {
    const steps = 400;
    const expected = path.length / steps;
    let previous = path.pointAt(0);
    let travelled = 0;
    for (let i = 1; i <= steps; i++) {
      const p = path.pointAt(i / steps);
      const step = distance(previous, p);
      expect(Math.abs(step - expected) / expected).toBeLessThan(0.01);
      travelled += step;
      previous = p;
    }
    expect(Math.abs(travelled - path.length) / path.length).toBeLessThan(0.001);
  });

  it('is monotonic: arc distance from the start grows strictly with progress', () => {
    let arc = 0;
    let previous = path.pointAt(0);
    for (let i = 1; i <= 200; i++) {
      const p = path.pointAt(i / 200);
      const step = distance(previous, p);
      expect(step).toBeGreaterThan(0);
      arc += step;
      previous = p;
    }
    expect(arc).toBeCloseTo(path.length, 1);
  });

  it('differs from the raw spline parameter on unevenly spaced points', () => {
    const spline = new CatmullRomSpline(SPEC.controlPoints);
    const raw: MutableVec3 = [0, 0, 0];
    spline.evaluate(0.5, raw);
    expect(distance(raw, path.pointAt(0.5))).toBeGreaterThan(1);
  });

  it('returns unit tangents pointing in the direction of travel', () => {
    for (const progress of [0, 0.2, 0.5, 0.8, 1]) {
      const t = path.tangentAt(progress);
      expect(Math.hypot(...t)).toBeCloseTo(1, 9);
      const a = path.pointAt(Math.max(0, progress - 0.001));
      const b = path.pointAt(Math.min(1, progress + 0.001));
      const chord: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const dot = (chord[0] * t[0] + chord[1] * t[1] + chord[2] * t[2]) / Math.hypot(...chord);
      expect(dot).toBeGreaterThan(0.99);
    }
  });

  it('writes into caller buffers', () => {
    const point: MutableVec3 = [0, 0, 0];
    const tangent: MutableVec3 = [0, 0, 0];
    path.sampleInto(0.3, point, tangent);
    expect(point).toEqual(path.pointAt(0.3));
    expect(tangent).toEqual(path.tangentAt(0.3));
  });
});

describe('DivePath waypoints', () => {
  const path = DivePath.create(SPEC);

  it('places each waypoint exactly on its control point', () => {
    for (const w of path.waypoints) {
      expect(distance(path.pointAt(w.progress), SPEC.controlPoints[w.controlPoint])).toBeLessThan(1e-6);
    }
  });

  it('orders waypoint progress along the dive', () => {
    const progress = path.waypoints.map((w) => w.progress);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(progress[0]).toBeGreaterThan(0);
    expect(progress[2]).toBeLessThan(1);
  });

  it('looks waypoints up by id', () => {
    expect(path.waypoint('landmark-tiki')?.controlPoint).toBe(3);
    expect(path.waypoint('nope')).toBeUndefined();
    expect(path.progressOf('landmark-bureau')).toBe(path.waypoints[2].progress);
    expect(() => path.progressOf('nope')).toThrow(RangeError);
    expect(path.waypoint('landmark-tiki')?.focus).toBeNull();
  });

  it('finds the nearest, next and previous waypoints', () => {
    const [pineapple, tiki, bureau] = path.waypoints;
    expect(path.nearestWaypoint(0)?.id).toBe(pineapple.id);
    expect(path.nearestWaypoint(1)?.id).toBe(bureau.id);
    expect(path.nearestWaypoint(tiki.progress + 0.001)?.id).toBe(tiki.id);

    expect(path.nextWaypoint(0)?.id).toBe(pineapple.id);
    expect(path.nextWaypoint(pineapple.progress)?.id).toBe(tiki.id);
    expect(path.nextWaypoint(bureau.progress)).toBeNull();

    expect(path.previousWaypoint(1)?.id).toBe(bureau.id);
    expect(path.previousWaypoint(tiki.progress)?.id).toBe(pineapple.id);
    expect(path.previousWaypoint(pineapple.progress)).toBeNull();
  });

  it('handles a path without waypoints', () => {
    const bare = DivePath.create({
      controlPoints: [
        [0, 1, 0],
        [0, 0, 1],
      ],
      depth: SPEC.depth,
    });
    expect(bare.nearestWaypoint(0.5)).toBeNull();
    expect(bare.nextWaypoint(0)).toBeNull();
  });
});

describe('DivePath depth', () => {
  const path = DivePath.create(SPEC);

  it('is 0 at the surface and floorMeters at the floor, clamped outside', () => {
    expect(path.depthOfY(34)).toBe(0);
    expect(path.depthOfY(1.4)).toBe(180);
    expect(path.depthOfY(100)).toBe(0);
    expect(path.depthOfY(-50)).toBe(180);
    expect(path.depthRatioOfY((34 + 1.4) / 2)).toBeCloseTo(0.5, 12);
  });

  it('follows the camera height along the dive', () => {
    expect(path.depthAt(0)).toBeCloseTo(path.depthOfY(30), 9);
    expect(path.depthAt(1)).toBeCloseTo(path.depthOfY(2), 9);
    expect(path.depthAt(1)).toBeGreaterThan(path.depthAt(0));
    expect(path.depthAt(0.5)).toBeCloseTo(path.depthOfY(path.pointAt(0.5)[1]), 9);
  });
});
