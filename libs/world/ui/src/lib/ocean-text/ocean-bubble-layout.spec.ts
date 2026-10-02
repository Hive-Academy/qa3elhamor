import { describe, expect, it } from 'vitest';
import { boundsFromTroika, bubbleLayout, sameBounds } from './ocean-bubble-layout.js';

const block = { minX: -1, minY: -0.25, maxX: 1, maxY: 0.25 };

describe('boundsFromTroika', () => {
  it('reads [minX, minY, maxX, maxY] and rejects anything malformed', () => {
    expect(boundsFromTroika([-1, -0.25, 1, 0.25])).toEqual(block);
    expect(boundsFromTroika([0, 0, 1])).toBeNull();
    expect(boundsFromTroika([0, 0, Number.NaN, 1])).toBeNull();
    expect(boundsFromTroika([1, 0, 0, 1])).toBeNull();
  });
});

describe('sameBounds', () => {
  it('treats sub-epsilon differences as equal, so re-layouts do not loop', () => {
    expect(sameBounds(block, { ...block, maxX: 1 + 1e-6 })).toBe(true);
    expect(sameBounds(block, { ...block, maxX: 1.1 })).toBe(false);
    expect(sameBounds(null, null)).toBe(true);
    expect(sameBounds(block, null)).toBe(false);
  });
});

describe('bubbleLayout', () => {
  it('pads the text block on every side and centres on it', () => {
    const layout = bubbleLayout({ minX: 0, minY: 0, maxX: 2, maxY: 0.5 }, 0.1, 'none');
    expect(layout.centerX).toBeCloseTo(1);
    expect(layout.centerY).toBeCloseTo(0.25);
    expect(layout.halfWidth).toBeCloseTo(1.1);
    expect(layout.halfHeight).toBeCloseTo(0.35);
    expect(layout.radius).toBeLessThanOrEqual(layout.halfHeight);
    expect(layout.tail.every((c) => c.r === 0)).toBe(true);
  });

  it('trails the tail down and out on the chosen side, shrinking bubble by bubble', () => {
    const left = bubbleLayout(block, 0.1, 'left');
    const right = bubbleLayout(block, 0.1, 'right');
    const [lobe, mid, tip] = left.tail;
    expect(lobe.x).toBeLessThan(0);
    expect(mid.x).toBeLessThan(lobe.x);
    expect(tip.y).toBeLessThan(mid.y);
    expect(mid.y).toBeLessThan(-left.halfHeight);
    expect(lobe.r).toBeGreaterThan(mid.r);
    expect(mid.r).toBeGreaterThan(tip.r);
    expect(right.tail.map((c) => c.x)).toEqual(left.tail.map((c) => -c.x));
  });

  it('draws into a quad that holds the body, the whole tail and a glow margin', () => {
    const layout = bubbleLayout(block, 0.1, 'left');
    const { quad } = layout;
    expect(quad.maxX).toBeGreaterThan(layout.halfWidth);
    expect(quad.maxY).toBeGreaterThan(layout.halfHeight);
    for (const c of layout.tail) {
      expect(c.x - c.r).toBeGreaterThan(quad.minX);
      expect(c.y - c.r).toBeGreaterThan(quad.minY);
    }
  });
});
