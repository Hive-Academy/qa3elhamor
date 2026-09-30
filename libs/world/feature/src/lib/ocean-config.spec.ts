import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_PARTICLE_COUNT,
  OCEAN_CONFIG_RANGES,
  OCEAN_ENVIRONMENT_DEFAULTS,
  isOceanColour,
  resolveOceanConfig,
  splitParticleCount,
} from './ocean-config.js';

describe('resolveOceanConfig', () => {
  it('returns the defaults when nothing is overridden', () => {
    expect(resolveOceanConfig()).toEqual(OCEAN_ENVIRONMENT_DEFAULTS);
  });

  it('merges each section without dropping its other keys', () => {
    const config = resolveOceanConfig({ fog: { density: 0.05 }, lights: { sunIntensity: 3 } });
    expect(config.fog).toEqual({ color: OCEAN_ENVIRONMENT_DEFAULTS.fog.color, density: 0.05 });
    expect(config.lights.sunIntensity).toBe(3);
    expect(config.lights.ambientColor).toBe(OCEAN_ENVIRONMENT_DEFAULTS.lights.ambientColor);
  });

  it('lets the particleCount argument win over the config count', () => {
    expect(resolveOceanConfig({ particles: { count: 900 } }, 300).particles.count).toBe(300);
  });

  it('clamps out-of-range numbers into OCEAN_CONFIG_RANGES', () => {
    const config = resolveOceanConfig({
      caustics: { intensity: -2, scale: 0, speed: 99 },
      particles: { count: 1e9, bubbleShare: 4, bubbleSize: -1, bubbleRiseSpeed: 1e6 },
      lights: { sunIntensity: -3 },
      reducedMotionScale: 7,
    });
    expect(config.caustics.intensity).toBe(0);
    expect(config.caustics.scale).toBe(OCEAN_CONFIG_RANGES.caustics.scale[0]);
    expect(config.caustics.speed).toBe(OCEAN_CONFIG_RANGES.caustics.speed[1]);
    expect(config.particles.count).toBe(MAX_PARTICLE_COUNT);
    expect(config.particles.bubbleShare).toBe(1);
    expect(config.particles.bubbleSize).toBe(OCEAN_CONFIG_RANGES.particles.bubbleSize[0]);
    expect(config.particles.bubbleRiseSpeed).toBe(OCEAN_CONFIG_RANGES.particles.bubbleRiseSpeed[1]);
    expect(config.lights.sunIntensity).toBe(0);
    expect(config.reducedMotionScale).toBe(1);
  });

  it('falls back to the default for every non-finite or non-numeric field', () => {
    const bad = Number.NaN;
    const config = resolveOceanConfig(
      {
        fog: { density: bad },
        caustics: { intensity: Infinity, scale: bad, speed: bad },
        particles: {
          bubbleShare: bad,
          planktonSize: bad,
          bubbleSize: -Infinity,
          bubbleRiseSpeed: bad,
          planktonDriftSpeed: 'fast' as unknown as number,
        },
        lights: { ambientIntensity: bad, hemisphereIntensity: bad, sunIntensity: bad },
        reducedMotionScale: bad,
      },
      bad
    );
    expect(config).toEqual(OCEAN_ENVIRONMENT_DEFAULTS);
  });

  it('covers every numeric field of every section with a range', () => {
    for (const section of ['fog', 'caustics', 'particles', 'lights'] as const) {
      const numeric = Object.entries(OCEAN_ENVIRONMENT_DEFAULTS[section])
        .filter(([, value]) => typeof value === 'number')
        .map(([key]) => key)
        .sort();
      expect(Object.keys(OCEAN_CONFIG_RANGES[section]).sort()).toEqual(numeric);
    }
  });

  it('floors fractional and negative particle counts', () => {
    expect(resolveOceanConfig({}, 10.9).particles.count).toBe(10);
    expect(resolveOceanConfig({}, -5).particles.count).toBe(0);
  });
});

describe('colour validation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('accepts short and long hex only', () => {
    expect(isOceanColour('#0a1e3f')).toBe(true);
    expect(isOceanColour('#ABC')).toBe(true);
    for (const bad of ['0a1e3f', '#0a1e3', 'navy', 'rgb(0,0,0)', '', 42, undefined]) {
      expect(isOceanColour(bad)).toBe(false);
    }
  });

  it('replaces an invalid colour with the default and warns once per field', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const config = resolveOceanConfig({
      fog: { color: '#zzzzzz' },
      lights: { sunColor: 'sunny', skyColor: '#123' },
    });
    expect(config.fog.color).toBe(OCEAN_ENVIRONMENT_DEFAULTS.fog.color);
    expect(config.lights.sunColor).toBe(OCEAN_ENVIRONMENT_DEFAULTS.lights.sunColor);
    expect(config.lights.skyColor).toBe('#123');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toMatch(/fog\.color "#zzzzzz"/);
  });

  it('accepts every default colour', () => {
    const warn = vi.spyOn(console, 'warn');
    resolveOceanConfig();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('splitParticleCount', () => {
  it('splits the budget by bubble share and loses no instances', () => {
    const particles = { ...OCEAN_ENVIRONMENT_DEFAULTS.particles, count: 1001, bubbleShare: 0.1 };
    const { plankton, bubbles } = splitParticleCount(particles);
    expect(bubbles).toBe(100);
    expect(plankton + bubbles).toBe(1001);
  });
});
