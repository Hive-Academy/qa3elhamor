import { describe, expect, it } from 'vitest';
import {
  LEG_TIMING,
  easeInOut,
  flightProgress,
  legSeconds,
} from './tour-timing';

describe('legSeconds', () => {
  it('grows with the distance, between 3 and 5 seconds', () => {
    expect(legSeconds(0)).toBe(LEG_TIMING.minS);
    expect(legSeconds(9)).toBeCloseTo(3.05, 2);
    expect(legSeconds(23)).toBeCloseTo(3.75, 2);
    expect(legSeconds(50)).toBe(LEG_TIMING.maxS);
    expect(legSeconds(500)).toBe(LEG_TIMING.maxS);
  });

  it('takes the distance either way, and treats nonsense as none', () => {
    expect(legSeconds(-23)).toBe(legSeconds(23));
    expect(legSeconds(Number.NaN)).toBe(LEG_TIMING.minS);
  });
});

describe('easeInOut', () => {
  it('starts and ends still, is symmetric, and stays in [0, 1]', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 10);
    expect(easeInOut(0.25) + easeInOut(0.75)).toBeCloseTo(1, 10);
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(2)).toBe(1);
    expect(easeInOut(Number.NaN)).toBe(0);
    // Barely moving at the ends.
    expect(easeInOut(0.02)).toBeLessThan(0.001);
  });

  it('never runs backwards', () => {
    let previous = 0;
    for (let i = 1; i <= 100; i++) {
      const value = easeInOut(i / 100);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe('flightProgress', () => {
  it('goes from one stop to the other in the given time, either direction', () => {
    expect(flightProgress(0.2, 0.6, 0, 4)).toBe(0.2);
    expect(flightProgress(0.2, 0.6, 2, 4)).toBeCloseTo(0.4, 10);
    expect(flightProgress(0.2, 0.6, 4, 4)).toBe(0.6);
    expect(flightProgress(0.6, 0.2, 9, 4)).toBe(0.2);
    expect(flightProgress(0.6, 0.2, 0, 0)).toBe(0.2);
  });
});
