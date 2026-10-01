import { QUALITY_PROFILES } from '@qa3elhamor/world-domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AMBIENT_LIFE_DEFAULTS, resolveAmbientLife, type AmbientLifeConfig } from './ambient-config.js';
import { WATER_VOLUME } from './world-space.js';

const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
afterEach(() => warn.mockClear());

describe('resolveAmbientLife', () => {
  it('cuts the defaults to each tier budget', () => {
    for (const tier of ['low', 'medium', 'high'] as const) {
      const budget = QUALITY_PROFILES[tier].ambientLife;
      const life = resolveAmbientLife(AMBIENT_LIFE_DEFAULTS, budget);
      expect(life.schools).toHaveLength(Math.min(budget.schools, AMBIENT_LIFE_DEFAULTS.schools.length));
      expect(life.fishPerSchool).toBe(budget.fishPerSchool);
      expect(life.kelp?.count).toBe(budget.kelp);
      expect(life.hamour).not.toBeNull();
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps the first schools: the config lists them in priority order', () => {
    const life = resolveAmbientLife(AMBIENT_LIFE_DEFAULTS, QUALITY_PROFILES.low.ambientLife);
    expect(life.schools.map((s) => s.color)).toEqual(AMBIENT_LIFE_DEFAULTS.schools.slice(0, 2).map((s) => s.color));
  });

  it('turns parts off when the budget says so', () => {
    const life = resolveAmbientLife(AMBIENT_LIFE_DEFAULTS, {
      schools: 0,
      fishPerSchool: 30,
      neighbourSamples: 4,
      kelp: 0,
      hamour: false,
    });
    expect(life.schools).toEqual([]);
    expect(life.fishPerSchool).toBe(0);
    expect(life.kelp).toBeNull();
    expect(life.hamour).toBeNull();
  });

  it('drops broken schools, clamps sizes and keeps homes in the water', () => {
    const config: AmbientLifeConfig = {
      ...AMBIENT_LIFE_DEFAULTS,
      schools: [
        { center: [Number.NaN, 0, 0], radius: 5, speed: 2, size: 0.4, color: '#ffffff' },
        { center: [0, 4, 0], radius: 5, speed: 2, size: 0.4, color: 'red' },
        { center: [500, 999, -500], radius: 1e6, speed: -3, size: 40, color: '#abc' },
      ],
    };
    const life = resolveAmbientLife(config, QUALITY_PROFILES.high.ambientLife);
    expect(life.schools).toHaveLength(1);
    const [school] = life.schools;
    expect(school.center).toEqual([WATER_VOLUME.max[0], WATER_VOLUME.max[1], WATER_VOLUME.min[2]]);
    expect(school.radius).toBe(40);
    expect(school.size).toBe(3);
    expect(school.speed).toBe(0.05);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('needs three finite patrol points and lifts them above minY', () => {
    const base = AMBIENT_LIFE_DEFAULTS.hamour;
    if (!base) throw new Error('defaults have a Hamour');
    const few = resolveAmbientLife(
      { ...AMBIENT_LIFE_DEFAULTS, hamour: { ...base, patrol: [[0, 5, 0], [1, 5, 0], [Number.NaN, 1, 1]] } },
      QUALITY_PROFILES.high.ambientLife
    );
    expect(few.hamour).toBeNull();
    expect(warn).toHaveBeenCalled();

    const low = resolveAmbientLife(
      { ...AMBIENT_LIFE_DEFAULTS, hamour: { ...base, minY: 5, patrol: [[0, 0, 0], [9, 1, 0], [0, 8, 9]] } },
      QUALITY_PROFILES.high.ambientLife
    );
    expect(low.hamour?.patrol.map((p) => p[1])).toEqual([5, 5, 8]);
  });

  it('drops a kelp bed with a broken colour and clamps the reduced-motion scale', () => {
    const base = AMBIENT_LIFE_DEFAULTS.kelp;
    if (!base) throw new Error('defaults have kelp');
    const life = resolveAmbientLife(
      { ...AMBIENT_LIFE_DEFAULTS, kelp: { ...base, tipColor: 'green' }, reducedMotionScale: 4 },
      QUALITY_PROFILES.high.ambientLife
    );
    expect(life.kelp).toBeNull();
    expect(life.reducedMotionScale).toBe(1);
  });

  it('places no characters by default (the bundled ones are third-party IP)', () => {
    expect(AMBIENT_LIFE_DEFAULTS.characters).toEqual([]);
    expect(resolveAmbientLife(AMBIENT_LIFE_DEFAULTS, QUALITY_PROFILES.high.ambientLife).characters).toEqual([]);
  });
});
