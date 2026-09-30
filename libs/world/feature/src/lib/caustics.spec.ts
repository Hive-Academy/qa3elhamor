import { MeshBasicMaterial, MeshStandardMaterial, ShaderLib, ShaderMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyCaustics,
  createCausticsTexture,
  createCausticsUniforms,
  injectCausticsFragment,
  injectCausticsVertex,
} from './caustics-material.js';
import { createCausticsPattern } from './caustics-pattern.js';
import { OCEAN_ENVIRONMENT_DEFAULTS } from './ocean-config.js';

describe('createCausticsPattern', () => {
  const size = 64;
  const pattern = createCausticsPattern(size, 4);

  it('is deterministic', () => {
    expect(createCausticsPattern(size, 4)).toEqual(pattern);
  });

  it('has both bright filaments and dark cells', () => {
    let max = 0;
    let dark = 0;
    for (const value of pattern) {
      max = Math.max(max, value);
      if (value === 0) dark++;
    }
    expect(max).toBeGreaterThan(200);
    expect(dark / pattern.length).toBeGreaterThan(0.3);
  });

  it('tiles seamlessly: opposite edges differ no more than neighbouring rows do', () => {
    const edgeGap = (a: number, b: number) => {
      let sum = 0;
      for (let x = 0; x < size; x++) sum += Math.abs(pattern[a * size + x] - pattern[b * size + x]);
      return sum / size;
    };
    expect(edgeGap(size - 1, 0)).toBeLessThanOrEqual(edgeGap(1, 0) * 2 + 8);
  });

  it('rejects unusable sizes', () => {
    expect(() => createCausticsPattern(3)).toThrow(RangeError);
    expect(() => createCausticsPattern(64, 1)).toThrow(RangeError);
  });
});

describe('caustics shader patch', () => {
  it('injects into the built-in standard and basic shaders', () => {
    for (const lib of [ShaderLib.standard, ShaderLib.basic]) {
      expect(injectCausticsVertex(lib.vertexShader)).toContain('vCausticsWorld = ( modelMatrix');
      const fragment = injectCausticsFragment(lib.fragmentShader);
      expect(fragment).toContain('uniform sampler2D uCausticsMap;');
      expect(fragment.indexOf('uCausticsIntensity;')).toBeLessThan(
        fragment.indexOf('#include <fog_fragment>')
      );
    }
  });

  it('guards the derivative normal against degenerate (zero-length) crosses', () => {
    const fragment = injectCausticsFragment(ShaderLib.standard.fragmentShader);
    expect(fragment).not.toMatch(/normalize\(\s*cross/);
    expect(fragment).toContain('causticsCrossLength > 1e-10');
  });

  it('shares one generated pattern between textures of the same size', () => {
    expect(createCausticsTexture(32).image.data).toBe(createCausticsTexture(32).image.data);
  });

  it('fails loudly when three.js moves the injection anchors', () => {
    expect(() => injectCausticsVertex('void main() {}')).toThrow(/project_vertex/);
    expect(() => injectCausticsFragment('void main() {}')).toThrow(/tonemapping_fragment/);
  });

  it('binds supported materials once and leaves custom shaders alone', () => {
    const uniforms = createCausticsUniforms(createCausticsTexture(16), OCEAN_ENVIRONMENT_DEFAULTS.caustics);
    const standard = new MeshStandardMaterial();
    const initialVersion = standard.version;

    expect(applyCaustics(standard, uniforms)).toBe(true);
    const afterFirst = standard.version;
    expect(afterFirst).toBeGreaterThan(initialVersion);
    expect(applyCaustics(standard, uniforms)).toBe(true);
    expect(standard.version).toBe(afterFirst);

    expect(applyCaustics(new MeshBasicMaterial(), uniforms)).toBe(true);
    expect(applyCaustics(new ShaderMaterial(), uniforms)).toBe(false);
  });
});
