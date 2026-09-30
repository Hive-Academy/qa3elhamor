import { describe, expect, it } from 'vitest';
import {
  createParticleGeometry,
  createParticleMaterial,
  createParticleSeeds,
  PARTICLE_TIME_PERIOD,
} from './particle-field.js';

describe('particle field', () => {
  it('creates deterministic normalised seeds, four per instance', () => {
    const seeds = createParticleSeeds(50, 3);
    expect(seeds).toHaveLength(200);
    expect(createParticleSeeds(50, 3)).toEqual(seeds);
    expect(Math.min(...seeds)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...seeds)).toBeLessThan(1);
  });

  it('instances one quad per particle', () => {
    const geometry = createParticleGeometry(120, 1);
    expect(geometry.instanceCount).toBe(120);
    expect(geometry.getAttribute('aSeed').count).toBe(120);
    expect(geometry.getAttribute('position').count).toBe(4);
  });

  it('shares the time uniform by reference across fields', () => {
    const time = { value: 0 };
    const options = {
      count: 1,
      seed: 1,
      volumeMin: [0, 0, 0] as const,
      volumeSize: [1, 1, 1] as const,
      color: '#ffffff',
      size: 1,
      riseSpeed: 1,
      wobble: 0,
      ring: 0,
      opacity: 1,
    };
    const a = createParticleMaterial(options, time);
    const b = createParticleMaterial(options, time);
    expect(a.uniforms['uTime']).toBe(time);
    expect(b.uniforms['uTime']).toBe(time);
    expect(a.fog).toBe(true);
    // The shader quantises frequencies to this period, so the clock can wrap seamlessly.
    expect(a.defines['PERIOD']).toBe(PARTICLE_TIME_PERIOD.toFixed(1));
    expect(a.vertexShader).toContain('uTime / PERIOD');
  });
});
