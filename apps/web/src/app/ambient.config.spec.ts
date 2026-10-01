import { QUALITY_PROFILES } from '@qa3elhamor/world-domain';
import { WATER_VOLUME, resolveAmbientLife } from '@qa3elhamor/world-feature';
import { describe, expect, it } from 'vitest';
import { AMBIENT_ART, buildAmbientLife, buildHamourPatrol, buildKelpClearings, buildSchools } from './ambient.config';
import { buildDivePath } from './dive.config';

/** Whatever the dive currently routes: these specs hold for any valid route. */
const PATH = buildDivePath();
const foci = PATH.waypoints.flatMap((w) => (w.focus ? [w.focus] : []));
const xzDistance = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0] - b[0], a[2] - b[2]);

describe('ambient config, fitted to the dive', () => {
  it('builds a finite Hamour patrol loop that keeps clear of every landmark', () => {
    const patrol = buildHamourPatrol(PATH);
    expect(patrol).toHaveLength(AMBIENT_ART.patrolSamples * 2);
    for (const point of patrol) {
      expect(point.every(Number.isFinite)).toBe(true);
      for (const focus of foci) expect(xzDistance(point, focus)).toBeGreaterThanOrEqual(AMBIENT_ART.landmarkClearance - 1e-9);
    }
  });

  it('runs the near leg of the patrol beside the camera line, not on it', () => {
    const patrol = buildHamourPatrol(PATH).slice(0, AMBIENT_ART.patrolSamples);
    for (const point of patrol) {
      const nearest = Math.min(
        ...Array.from({ length: 101 }, (_, i) => {
          const p = PATH.pointAt(i / 100);
          return Math.hypot(p[0] - point[0], p[1] - point[1], p[2] - point[2]);
        })
      );
      expect(nearest).toBeGreaterThanOrEqual(AMBIENT_ART.patrolCameraClearance - 0.5);
      expect(nearest).toBeLessThan(AMBIENT_ART.patrolNear.side + 8);
    }
  });

  it('homes one school per art entry, in priority order, in the water and off the landmarks', () => {
    const schools = buildSchools(PATH);
    expect(schools.map((s) => s.color)).toEqual(AMBIENT_ART.schools.map((s) => s.color));
    for (const { center } of schools) {
      expect(center[1]).toBeGreaterThanOrEqual(4);
      expect(center[1]).toBeLessThanOrEqual(WATER_VOLUME.max[1]);
      for (const focus of foci) expect(xzDistance(center, focus)).toBeGreaterThanOrEqual(AMBIENT_ART.landmarkClearance - 1e-9);
    }
  });

  it('clears kelp from every landmark and from the low stretches of the camera line', () => {
    const clearings = buildKelpClearings(PATH);
    for (const focus of foci) {
      expect(clearings.some((c) => xzDistance(c.center, focus) < 1e-9 && c.radius >= AMBIENT_ART.landmarkClearance)).toBe(true);
    }
    for (let i = 0; i <= 40; i++) {
      const p = PATH.pointAt(i / 40);
      if (p[1] > AMBIENT_ART.cameraClearanceBelowY) continue;
      expect(clearings.some((c) => xzDistance(c.center, p) <= c.radius - AMBIENT_ART.cameraClearance + 1e-9)).toBe(true);
    }
  });

  it('resolves cleanly at every tier, with the SpongeBob/Patrick models left unplaced', () => {
    const config = buildAmbientLife(PATH);
    expect(config.characters).toEqual([]);
    for (const tier of ['low', 'medium', 'high'] as const) {
      const life = resolveAmbientLife(config, QUALITY_PROFILES[tier].ambientLife);
      expect(life.hamour?.patrol.length).toBe(AMBIENT_ART.patrolSamples * 2);
      expect(life.schools.length).toBe(QUALITY_PROFILES[tier].ambientLife.schools);
      expect(life.kelp?.count).toBe(QUALITY_PROFILES[tier].ambientLife.kelp);
    }
  });
});
