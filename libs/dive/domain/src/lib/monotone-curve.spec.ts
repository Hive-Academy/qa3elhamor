import { describe, expect, it } from 'vitest';
import { MonotoneCurve } from './monotone-curve.js';

const XS = [0, 0.2, 0.25, 0.3, 0.7, 1];
const YS = [0, 0.4, 0.41, 0.42, 0.8, 1];

describe('MonotoneCurve', () => {
  const curve = new MonotoneCurve(XS, YS);

  it('passes through every knot', () => {
    XS.forEach((x, i) => expect(curve.at(x)).toBeCloseTo(YS[i], 12));
  });

  it('never decreases and never leaves the knots’ range (no overshoot)', () => {
    let previous = curve.at(0);
    for (let i = 1; i <= 2000; i++) {
      const y = curve.at(i / 2000);
      expect(y).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = y;
    }
    // Inside a flat-ish hold it stays between its knots.
    for (let x = 0.2; x <= 0.3; x += 0.001) {
      expect(curve.at(x)).toBeGreaterThanOrEqual(0.4 - 1e-12);
      expect(curve.at(x)).toBeLessThanOrEqual(0.42 + 1e-12);
    }
  });

  it('has a continuous slope across knots (no velocity jumps)', () => {
    const h = 1e-6;
    for (const x of XS.slice(1, -1)) {
      const left = (curve.at(x) - curve.at(x - h)) / h;
      const right = (curve.at(x + h) - curve.at(x)) / h;
      expect(Math.abs(left - right)).toBeLessThan(1e-3);
    }
  });

  it('clamps outside the knot range and treats NaN as the start', () => {
    expect(curve.at(-1)).toBe(0);
    expect(curve.at(2)).toBe(1);
    expect(curve.at(Number.NaN)).toBe(0);
  });

  it('inverts', () => {
    for (let i = 0; i <= 100; i++) {
      const x = i / 100;
      expect(curve.inverse(curve.at(x))).toBeCloseTo(x, 9);
    }
    expect(curve.inverse(-1)).toBe(0);
    expect(curve.inverse(5)).toBe(1);
  });

  it('inverts onto the start of a plateau', () => {
    const plateau = new MonotoneCurve([0, 0.5, 1], [0, 1, 1]);
    expect(plateau.inverse(1)).toBe(0.5);
  });

  it('is the identity on two knots at the corners', () => {
    const identity = new MonotoneCurve([0, 1], [0, 1]);
    for (const x of [0, 0.25, 0.5, 0.9, 1]) expect(identity.at(x)).toBeCloseTo(x, 12);
  });

  it('rejects knots that are not ordered', () => {
    expect(() => new MonotoneCurve([0], [0])).toThrow(RangeError);
    expect(() => new MonotoneCurve([0, 1], [0])).toThrow(RangeError);
    expect(() => new MonotoneCurve([0, 0, 1], [0, 0.5, 1])).toThrow(RangeError);
    expect(() => new MonotoneCurve([0, 0.5, 1], [0, 0.6, 0.5])).toThrow(RangeError);
  });
});
