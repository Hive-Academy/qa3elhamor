import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DivePath } from '@qa3elhamor/dive-domain';
import { WATER_VOLUME, WORLD_SCALE } from '@qa3elhamor/world-feature';
import { DEFAULT_PLAQUE_FACING, DEFAULT_PLAQUE_POSITION } from '@qa3elhamor/world-ui';
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
    // Every route entry, then the finale.
    expect(spec.controlPoints).toHaveLength(DIVE_CONFIG.route.length + 1);
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
    // The floor is the route's lowest camera point and the gauge keeps the deepest reached, so
    // the dive ends at exactly floorMeters.
    expect(path.depthAt(1)).toBeCloseTo(DIVE_CONFIG.floorMeters, 9);
    expect(path.depth.floorY).toBeCloseTo(path.lowestY, 12);
    for (let i = 0; i <= 100; i++) {
      const p = path.pointAt(i / 100);
      for (let axis = 0; axis < 3; axis++) {
        expect(p[axis]).toBeGreaterThan(WATER_VOLUME.min[axis]);
        expect(p[axis]).toBeLessThan(WATER_VOLUME.max[axis]);
      }
    }
  });

  it('reads a narrative depth: from the surface figure up to floorMeters, never shallower', () => {
    const path = buildDivePath();
    let previous = path.depthAt(0);
    for (let i = 1; i <= 5000; i++) {
      const depth = path.depthAt(i / 5000);
      expect(depth).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(depth).toBeLessThanOrEqual(DIVE_CONFIG.floorMeters + 1e-9);
      previous = depth;
    }
    // Every landmark reads deeper than the one before it, or holds at the floor.
    const stops = path.waypoints.map((w) => path.depthAt(w.progress));
    for (let i = 1; i < stops.length; i++) expect(stops[i]).toBeGreaterThanOrEqual(stops[i - 1]);
  });

  it('ends in front of the credits notice, looking at it', () => {
    const path = buildDivePath();
    const foot = DEFAULT_PLAQUE_POSITION.map((c) => c * WORLD_SCALE);
    const facing = DEFAULT_PLAQUE_FACING.map((c) => c * WORLD_SCALE);
    const end = path.pointAt(1);
    expect(path.endFocus?.[0]).toBeCloseTo(foot[0], 9);
    expect(path.endFocus?.[2]).toBeCloseTo(foot[2], 9);
    // On the side the board faces, at the finale distance from its foot.
    const toFacing = [facing[0] - foot[0], facing[2] - foot[2]];
    const toEnd = [end[0] - foot[0], end[2] - foot[2]];
    const cos = (toFacing[0] * toEnd[0] + toFacing[1] * toEnd[1]) / (Math.hypot(...toFacing) * Math.hypot(...toEnd));
    expect(cos).toBeCloseTo(1, 9);
    expect(Math.hypot(...toEnd)).toBeCloseTo(DIVE_CONFIG.finale.distance, 9);
  });

  it('paces the dive: each stop arrives at its scroll position, with room to linger', () => {
    const path = buildDivePath();
    const stops = DIVE_CONFIG.route.flatMap((e) => (e.kind === 'stop' ? [e] : []));
    for (const stop of stops) {
      expect(path.scrollOf(stop.landmark)).toBe(stop.scroll);
      expect(path.progressAtScroll(stop.scroll)).toBeCloseTo(path.progressOf(stop.landmark), 9);
    }
    // No landmark is crammed: at least a tenth of the scroll between neighbouring stops.
    const scrolls = [0, ...stops.map((s) => s.scroll), 1];
    for (let i = 1; i < scrolls.length; i++) expect(scrolls[i] - scrolls[i - 1]).toBeGreaterThanOrEqual(0.1);
  });

  it('formats depth with a true minus sign', () => {
    expect(formatDepth(142)).toBe('−142 m');
    expect(formatDepth(0)).toBe('0 m');
  });
});
