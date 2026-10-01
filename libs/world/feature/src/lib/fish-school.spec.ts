import { describe, expect, it } from 'vitest';
import {
  MAX_SCHOOL_STEP,
  createSchoolState,
  stepSchool,
  writeSchoolMatrices,
  type FishSchoolSpec,
} from './fish-school.js';

const SPEC: FishSchoolSpec = { center: [10, 6, -4], radius: 5, speed: 2, size: 0.4, color: '#9fc4d8' };

const run = (count: number, samples: number, steps: number, seed = 3) => {
  const state = createSchoolState(SPEC, count, seed);
  for (let i = 0; i < steps; i++) stepSchool(state, SPEC, 1 / 60, samples);
  return state;
};

describe('fish school boids', () => {
  it('is deterministic for a seed', () => {
    expect(Array.from(run(20, 4, 300).positions)).toEqual(Array.from(run(20, 4, 300).positions));
    expect(Array.from(run(20, 4, 10, 1).positions)).not.toEqual(Array.from(run(20, 4, 10, 2).positions));
  });

  it('stays finite, near home and within the speed band over a long run', () => {
    const state = run(36, 6, 60 * 120); // two minutes at 60 fps
    for (let i = 0; i < state.count; i++) {
      const [x, y, z] = [state.positions[i * 3], state.positions[i * 3 + 1], state.positions[i * 3 + 2]];
      const [vx, vy, vz] = [state.velocities[i * 3], state.velocities[i * 3 + 1], state.velocities[i * 3 + 2]];
      expect([x, y, z, vx, vy, vz].every(Number.isFinite)).toBe(true);
      expect(Math.hypot(x - SPEC.center[0], y - SPEC.center[1], z - SPEC.center[2])).toBeLessThan(SPEC.radius * 2);
      const speed = Math.hypot(vx, vy, vz);
      expect(speed).toBeGreaterThanOrEqual(SPEC.speed * 0.55 - 1e-4);
      expect(speed).toBeLessThanOrEqual(SPEC.speed * 1.45 + 1e-4);
      expect(Math.abs(vy)).toBeLessThanOrEqual(Math.max(Math.hypot(vx, vz), SPEC.speed * 0.55) * 0.3 + 1e-4);
    }
  });

  it('keeps school-mates apart and together', () => {
    const state = run(30, 6, 60 * 30);
    let nearest = 0;
    for (let i = 0; i < state.count; i++) {
      let best = Number.POSITIVE_INFINITY;
      for (let j = 0; j < state.count; j++) {
        if (i === j) continue;
        const d = Math.hypot(
          state.positions[i * 3] - state.positions[j * 3],
          state.positions[i * 3 + 1] - state.positions[j * 3 + 1],
          state.positions[i * 3 + 2] - state.positions[j * 3 + 2]
        );
        best = Math.min(best, d);
      }
      nearest += best / state.count;
    }
    // Mean nearest-neighbour distance: neither stacked on one point nor scattered.
    expect(nearest).toBeGreaterThan(SPEC.size * 0.3);
    expect(nearest).toBeLessThan(SPEC.radius);
  });

  it('handles tiny schools, oversized neighbour counts and empty steps', () => {
    expect(() => run(0, 6, 10)).not.toThrow();
    const one = run(1, 6, 100);
    expect(Array.from(one.positions).every(Number.isFinite)).toBe(true);
    const two = run(2, 50, 100);
    expect(Array.from(two.positions).every(Number.isFinite)).toBe(true);

    const state = createSchoolState(SPEC, 5, 1);
    const before = Array.from(state.positions);
    stepSchool(state, SPEC, 0, 3);
    stepSchool(state, SPEC, -1, 3);
    stepSchool(state, SPEC, Number.NaN, 3);
    expect(Array.from(state.positions)).toEqual(before);
  });

  it('caps a long frame at MAX_SCHOOL_STEP', () => {
    const a = createSchoolState(SPEC, 8, 4);
    const b = createSchoolState(SPEC, 8, 4);
    stepSchool(a, SPEC, 5, 3);
    stepSchool(b, SPEC, MAX_SCHOOL_STEP, 3);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
  });
});

describe('writeSchoolMatrices', () => {
  it('places, scales and turns each fish nose-first along its velocity without roll', () => {
    const state = createSchoolState(SPEC, 3, 9);
    state.velocities.set([0, 0, 2, 2, 0, 0, 1, 1, -1], 0);
    const out = new Float32Array(3 * 16);
    writeSchoolMatrices(state, 0.5, out);

    for (let i = 0; i < 3; i++) {
      const m = out.subarray(i * 16, i * 16 + 16);
      const s = 0.5 * state.scales[i];
      const forward = [m[8] / s, m[9] / s, m[10] / s];
      const v = [state.velocities[i * 3], state.velocities[i * 3 + 1], state.velocities[i * 3 + 2]];
      const vl = Math.hypot(v[0], v[1], v[2]);
      forward.forEach((f, k) => expect(f).toBeCloseTo(v[k] / vl, 5));
      // Columns are orthogonal and of length `s`; the side axis stays horizontal (no roll).
      expect(Math.hypot(m[0], m[1], m[2])).toBeCloseTo(s, 5);
      expect(Math.hypot(m[4], m[5], m[6])).toBeCloseTo(s, 5);
      expect(m[0] * m[8] + m[1] * m[9] + m[2] * m[10]).toBeCloseTo(0, 5);
      expect(m[4] * m[8] + m[5] * m[9] + m[6] * m[10]).toBeCloseTo(0, 5);
      expect(m[1]).toBe(0);
      expect([m[12], m[13], m[14]]).toEqual([state.positions[i * 3], state.positions[i * 3 + 1], state.positions[i * 3 + 2]]);
      expect(m[15]).toBe(1);
    }
  });

  it('writes no more fish than the buffer holds', () => {
    const state = createSchoolState(SPEC, 4, 1);
    const out = new Float32Array(2 * 16 + 5);
    expect(() => writeSchoolMatrices(state, 1, out)).not.toThrow();
    expect(Array.from(out.subarray(32))).toEqual([0, 0, 0, 0, 0]);
  });
});
