import { ShaderLib, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { createOceanTextMaterial, patchOceanTextShader } from './ocean-text-material.js';

function basicShader() {
  return { vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader };
}

describe('patchOceanTextShader', () => {
  it("patches three's MeshBasicMaterial shader at its glyph and colour anchors", () => {
    const shader = basicShader();
    patchOceanTextShader(shader);
    const v = shader.vertexShader;
    const f = shader.fragmentShader;
    expect(v.indexOf('attribute vec4 aOceanGlyph;')).toBeLessThan(v.indexOf('void main()'));
    expect(v.indexOf('uOceanRevealHead - aOceanGlyph.z')).toBeGreaterThan(v.indexOf('#include <begin_vertex>'));
    expect(f.indexOf('float oceanCaustic(')).toBeLessThan(f.indexOf('void main()'));
    expect(f.indexOf('oceanCaustic(vOceanWorld')).toBeLessThan(f.indexOf('#include <opaque_fragment>'));
    expect(v.match(/void\s+main\s*\(/gu)).toHaveLength(1);
    expect(f.match(/void\s+main\s*\(/gu)).toHaveLength(1);
  });

  it('refuses a shader without its anchors instead of compiling plain text', () => {
    const shader = basicShader();
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '');
    expect(() => patchOceanTextShader(shader)).toThrow(/begin_vertex/u);
  });
});

describe('createOceanTextMaterial', () => {
  it('hands its own uniform objects to the compiled program, under a constant cache key', () => {
    const { material, uniforms } = createOceanTextMaterial({ shimmer: 0.2 });
    const params = { ...basicShader(), uniforms: {} } as unknown as WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(params, {} as WebGLRenderer);
    expect(params.uniforms['uOceanRevealHead']).toBe(uniforms.uOceanRevealHead);
    expect(uniforms.uOceanShimmer.value).toBe(0.2);
    expect(material.customProgramCacheKey()).toBe(createOceanTextMaterial().material.customProgramCacheKey());
    material.dispose();
  });
});
