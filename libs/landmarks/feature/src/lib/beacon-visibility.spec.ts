import { describe, expect, it } from 'vitest';
import { beaconFade } from './beacon-visibility.js';

describe('beaconFade', () => {
  it('is fully visible up to near, gone from far, linear in between', () => {
    expect(beaconFade(10, [45, 80])).toBe(1);
    expect(beaconFade(45, [45, 80])).toBe(1);
    expect(beaconFade(62.5, [45, 80])).toBeCloseTo(0.5, 9);
    expect(beaconFade(80, [45, 80])).toBe(0);
    expect(beaconFade(500, [45, 80])).toBe(0);
  });

  it('treats a non-finite distance as near', () => {
    expect(beaconFade(Number.NaN, [45, 80])).toBe(1);
  });
});
