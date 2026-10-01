import { describe, expect, it } from 'vitest';
import { DIVE_FRAMING_DEFAULTS, framingScale } from './framing.js';

describe('framingScale', () => {
  it('leaves the reference aspect and anything wider alone', () => {
    expect(framingScale(1.6)).toBe(1);
    expect(framingScale(16 / 9)).toBe(1);
    expect(framingScale(3)).toBe(1);
  });

  it('pulls back further the narrower the viewport, up to the cap', () => {
    const tablet = framingScale(0.75);
    const phone = framingScale(390 / 844);
    expect(tablet).toBeGreaterThan(1);
    expect(phone).toBeGreaterThan(tablet);
    expect(phone).toBeLessThanOrEqual(DIVE_FRAMING_DEFAULTS.maxScale);
    expect(framingScale(0.05)).toBe(DIVE_FRAMING_DEFAULTS.maxScale);
  });

  it('follows the strength exponent', () => {
    const options = { referenceAspect: 2, strength: 1, maxScale: 10 };
    expect(framingScale(1, options)).toBeCloseTo(2, 12);
    expect(framingScale(1, { ...options, strength: 0.5 })).toBeCloseTo(Math.SQRT2, 12);
    expect(framingScale(1, { ...options, strength: 0 })).toBe(1);
  });

  it('falls back to the default for any option that is not a usable number', () => {
    const phone = 390 / 844;
    const expected = framingScale(phone);
    const bad = [Number.NaN, Infinity, -Infinity];
    for (const value of [...bad, 0, -1]) {
      expect(framingScale(phone, { ...DIVE_FRAMING_DEFAULTS, referenceAspect: value })).toBe(expected);
    }
    for (const value of [...bad, -0.5]) {
      expect(framingScale(phone, { ...DIVE_FRAMING_DEFAULTS, strength: value })).toBe(expected);
    }
    for (const value of [...bad, 0.5, -2]) {
      expect(framingScale(phone, { ...DIVE_FRAMING_DEFAULTS, maxScale: value })).toBe(expected);
    }
    const garbage = { referenceAspect: Number.NaN, strength: Number.NaN, maxScale: Number.NaN };
    for (const aspect of [0.2, phone, 1, 2]) {
      const scale = framingScale(aspect, garbage);
      expect(Number.isFinite(scale)).toBe(true);
      expect(scale).toBeGreaterThanOrEqual(1);
    }
  });

  it('treats a degenerate aspect as wide', () => {
    expect(framingScale(0)).toBe(1);
    expect(framingScale(Number.NaN)).toBe(1);
    expect(framingScale(Infinity)).toBe(1);
    expect(framingScale(-1)).toBe(1);
  });
});
