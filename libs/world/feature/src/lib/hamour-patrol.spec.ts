import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PATROL_TUNING,
  DEFAULT_VIEW_CLEARANCE,
  advancePatrol,
  createPatrolLoop,
  loopGap,
  nearestLoopFraction,
  viewClearanceOffset,
  wrapFraction,
} from './hamour-patrol.js';
import type { Vec3 } from './world-space.js';

/** A 40 x 40 square loop at y = 5. */
const SQUARE: Vec3[] = [
  [0, 5, 0],
  [40, 5, 0],
  [40, 5, 40],
  [0, 5, 40],
];

describe('createPatrolLoop', () => {
  it('needs three finite points', () => {
    expect(createPatrolLoop([])).toBeNull();
    expect(createPatrolLoop(SQUARE.slice(0, 2))).toBeNull();
    expect(createPatrolLoop([[0, 0, 0], [1, 0, 0], [Number.NaN, 0, 0]])).toBeNull();
    expect(createPatrolLoop(SQUARE)?.length).toBeGreaterThan(120);
  });
});

describe('nearestLoopFraction', () => {
  const loop = createPatrolLoop(SQUARE);
  if (!loop) throw new Error('loop');

  it('finds the nearest stretch of loop', () => {
    const u = nearestLoopFraction(loop, 40, 5, 0);
    const point = loop.curve.getPointAt(u);
    expect(Math.hypot(point.x - 40, point.z)).toBeLessThan(3);
  });

  it('prefers the stretch around the hint unless another is clearly closer', () => {
    // Midway between the x = 0 and x = 40 legs, slightly nearer x = 40.
    const nearRight = nearestLoopFraction(loop, 21, 5, 20);
    const leftU = nearestLoopFraction(loop, 0, 5, 20);
    expect(loopGap(nearestLoopFraction(loop, 21, 5, 20, leftU), leftU)).toBeCloseTo(0, 1);
    expect(loopGap(nearestLoopFraction(loop, 21, 5, 20), nearRight)).toBe(0);
    // Right next to the other leg, the hint gives way.
    const far = nearestLoopFraction(loop, 39, 5, 20, leftU);
    expect(Math.abs(loopGap(far, leftU))).toBeGreaterThan(0.3);
  });
});

describe('loop arithmetic', () => {
  it('wraps fractions and takes the short way round', () => {
    expect(wrapFraction(1.25)).toBeCloseTo(0.25);
    expect(wrapFraction(-0.25)).toBeCloseTo(0.75);
    expect(loopGap(0.9, 0.1)).toBeCloseTo(0.2);
    expect(loopGap(0.1, 0.9)).toBeCloseTo(-0.2);
  });
});

describe('advancePatrol', () => {
  const loop = { length: 200 };
  const lead = DEFAULT_PATROL_TUNING.lead / loop.length;

  it('cruises when it is where it likes to be', () => {
    const step = advancePatrol(0.5 + lead, 0.5, loop, 1);
    expect(step.speed).toBeCloseTo(DEFAULT_PATROL_TUNING.cruiseSpeed);
    expect(step.u).toBeCloseTo(0.5 + lead + DEFAULT_PATROL_TUNING.cruiseSpeed / loop.length);
  });

  it('hurries to catch up and dawdles when ahead, within the speed band', () => {
    const behind = advancePatrol(0.5 - 30 / loop.length, 0.5, loop, 1);
    const ahead = advancePatrol(0.5 + 60 / loop.length, 0.5, loop, 1);
    expect(behind.speed).toBeGreaterThan(DEFAULT_PATROL_TUNING.cruiseSpeed * 2);
    expect(behind.speed).toBeLessThanOrEqual(DEFAULT_PATROL_TUNING.cruiseSpeed * DEFAULT_PATROL_TUNING.maxSpeedFactor);
    expect(ahead.speed).toBeCloseTo(DEFAULT_PATROL_TUNING.cruiseSpeed * DEFAULT_PATROL_TUNING.minSpeedFactor);
  });

  it('never swims backwards and holds still on a zero step', () => {
    expect(advancePatrol(0.3, 0.1, loop, 0).u).toBe(0.3);
    expect(advancePatrol(0.3, 0.1, loop, -1).u).toBe(0.3);
  });

  it('moves out of sight to just behind a camera that jumped, but only when allowed', () => {
    const jumped = advancePatrol(0.1, 0.7, loop, 1 / 60);
    expect(jumped.speed).toBe(0);
    expect(jumped.u).toBeCloseTo(wrapFraction(0.7 - DEFAULT_PATROL_TUNING.snapBehind / loop.length));

    const visible = advancePatrol(0.1, 0.7, loop, 1 / 60, DEFAULT_PATROL_TUNING, false);
    expect(visible.speed).toBeGreaterThan(0);
    expect(visible.u).toBeGreaterThan(0.1);
  });
});

describe('viewClearanceOffset', () => {
  const camera = { x: 0, y: 0, z: 0 };
  const forward = { x: 0, y: 0, z: -1 };
  const clearance = DEFAULT_VIEW_CLEARANCE;
  const offset = { x: 0, y: 0, z: 0 };

  const isClear = (x: number, y: number, z: number): boolean => {
    const along = -z;
    const off = Math.hypot(x, y);
    const inCone = along > 0 && along <= clearance.distance && off < clearance.radius + clearance.slope * along - 1e-6;
    return !inCone && Math.hypot(x, y, z) >= clearance.minDistance - 1e-6;
  };

  it('leaves a point that is already clear alone', () => {
    viewClearanceOffset(20, 0, -15, camera, forward, clearance, offset);
    expect(offset).toEqual({ x: 0, y: 0, z: 0 });
    viewClearanceOffset(1, 0, 15, camera, forward, clearance, offset); // behind the camera
    expect(offset).toEqual({ x: 0, y: 0, z: 0 });
    viewClearanceOffset(0, 0, -40, camera, forward, clearance, offset); // beyond the cone
    expect(offset).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('pushes a point in the cone sideways, just out of it', () => {
    viewClearanceOffset(1, 0, -12, camera, forward, clearance, offset);
    expect(offset.x).toBeGreaterThan(0);
    expect(offset.y).toBeCloseTo(0);
    expect(offset.z).toBeCloseTo(0);
    expect(isClear(1 + offset.x, offset.y, -12 + offset.z)).toBe(true);
  });

  it('pushes a point dead on the view axis upward', () => {
    viewClearanceOffset(0, 0, -12, camera, forward, clearance, offset);
    expect(offset.y).toBeGreaterThan(0);
    expect(isClear(offset.x, offset.y, -12 + offset.z)).toBe(true);
  });

  it('keeps its distance from the camera, even beside or behind it', () => {
    for (const [x, y, z] of [
      [3, 0, 0],
      [0, 2, 3],
      [0.5, 0, -2],
      [0, 0, 0],
    ] as const) {
      viewClearanceOffset(x, y, z, camera, forward, clearance, offset);
      expect(isClear(x + offset.x, y + offset.y, z + offset.z)).toBe(true);
    }
  });
});
