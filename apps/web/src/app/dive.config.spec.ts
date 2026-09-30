import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DivePath } from '@qa3elhamor/dive-domain';
import { WATER_VOLUME, WORLD_SCALE } from '@qa3elhamor/world-feature';
import { describe, expect, it } from 'vitest';
import { formatDepth } from './depth-gauge';
import { DIVE_CONFIG, LANDMARK_PLACEMENTS, buildDivePath, buildDiveSpec } from './dive.config';

const placements = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../public/models/placements.json'), 'utf8')
) as Record<string, { offset: [number, number, number] | null }>;

describe('dive config', () => {
  it('uses the landmark placements the asset pipeline wrote', () => {
    for (const [id, offset] of Object.entries(LANDMARK_PLACEMENTS)) {
      expect(placements[id]?.offset).toEqual(offset);
    }
  });

  it('builds a valid dive with one waypoint per landmark stop, in route order', () => {
    const spec = buildDiveSpec();
    expect(DivePath.validate(spec)).toEqual([]);
    expect(spec.controlPoints).toHaveLength(DIVE_CONFIG.route.length);
    expect(buildDivePath().waypoints.map((w) => w.id)).toEqual([
      'landmark-pineapple',
      'landmark-tiki',
      'landmark-krusty-krab',
      'landmark-bureau',
    ]);
  });

  it('places stops relative to landmarks in world units', () => {
    const path = buildDivePath();
    const bureau = path.waypoint('landmark-bureau');
    const base = LANDMARK_PLACEMENTS['landmark-bureau'].map((c) => c * WORLD_SCALE);
    expect(bureau?.focus?.[0]).toBeCloseTo(base[0], 9);
    expect(bureau?.focus?.[2]).toBeCloseTo(base[2], 9);
  });

  it('starts near the surface, ends deep, and stays inside the water volume', () => {
    const path = buildDivePath();
    expect(path.depthAt(0)).toBeLessThan(30);
    // The last route point is the deepest, so the dive ends at exactly floorMeters.
    expect(path.depthAt(1)).toBeCloseTo(DIVE_CONFIG.floorMeters, 9);
    for (let i = 0; i <= 100; i++) {
      const p = path.pointAt(i / 100);
      for (let axis = 0; axis < 3; axis++) {
        expect(p[axis]).toBeGreaterThan(WATER_VOLUME.min[axis]);
        expect(p[axis]).toBeLessThan(WATER_VOLUME.max[axis]);
      }
    }
  });

  it('formats depth with a true minus sign', () => {
    expect(formatDepth(142)).toBe('−142 m');
    expect(formatDepth(0)).toBe('0 m');
  });
});
