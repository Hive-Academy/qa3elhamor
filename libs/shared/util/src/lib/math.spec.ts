import { describe, expect, it } from 'vitest';
import { clamp, lerp, remap, smoothstep } from './math.js';

describe('math helpers', () => {
  it('clamps to the range', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('interpolates linearly', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 0)).toBe(0);
  });

  it('remaps between ranges and clamps the output', () => {
    expect(remap(5, 0, 10, 0, 100)).toBe(50);
    expect(remap(50, 0, 10, 0, 100)).toBe(100);
  });

  it('guards a zero-width input range', () => {
    expect(remap(5, 3, 3, 7, 9)).toBe(7);
  });

  it('eases at the edges', () => {
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });
});
