import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { createFishGeometry, createFishMaterial } from './fish-mesh.js';
import { HAMOUR_PALETTE, createHamourGeometry, createHamourMaterial } from './hamour-model.js';

describe('the Hamour model', () => {
  const geometry = createHamourGeometry();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const positions = geometry.getAttribute('position');

  it('is a low-poly mesh, 1 unit long, nose at +Z, deeper than it is wide', () => {
    if (!box) throw new Error('no bounds');
    const triangles = positions.count / 3;
    expect(triangles).toBeGreaterThan(300);
    expect(triangles).toBeLessThan(900);
    expect(box.max.z - box.min.z).toBeCloseTo(1, 1);
    expect(box.max.z).toBeCloseTo(0.5, 1);
    const depth = box.max.y - box.min.y;
    const width = box.max.x - box.min.x;
    expect(depth).toBeGreaterThan(width * 1.2);
    // Symmetric about the midline.
    expect(box.max.x).toBeCloseTo(-box.min.x, 2);
  });

  it('juts its lower jaw past the upper lip (the grouper underbite)', () => {
    let tipY = 0;
    let tipZ = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < positions.count; i++) {
      if (positions.getZ(i) > tipZ) {
        tipZ = positions.getZ(i);
        tipY = positions.getY(i);
      }
    }
    expect(tipY).toBeLessThan(-0.03);
  });

  it('is coloured from its palette, every value finite, deterministically', () => {
    const colours = geometry.getAttribute('color');
    expect(colours.count).toBe(positions.count);
    expect(Array.from(colours.array as Float32Array).every(Number.isFinite)).toBe(true);
    const brown = new Color(HAMOUR_PALETTE.brown);
    expect(brown.r).toBeGreaterThan(brown.b); // warm, not blue
    expect(Array.from(createHamourGeometry().getAttribute('color').array as Float32Array)).toEqual(
      Array.from(colours.array as Float32Array)
    );
  });

  it('swims with a shader body wave on a fogged, flat-shaded material', () => {
    const time = { value: 0 };
    const swim = { value: 1 };
    const material = createHamourMaterial({ time, swim });
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
      fragmentShader: '',
    };
    material.onBeforeCompile(shader as never, undefined as never);
    expect(shader.uniforms['uAmbientTime']).toBe(time);
    expect(shader.uniforms['uHamourSwim']).toBe(swim);
    expect(shader.vertexShader).toMatch(/transformed\.x \+=/);
    expect(material.flatShading).toBe(true);
    expect(material.fog).toBe(true);
    expect(material.customProgramCacheKey()).toBe('ambient-hamour');
  });
});

describe('the school fish', () => {
  it('is 1 unit long, nose at +Z, with a per-instance tail beat', () => {
    const geometry = createFishGeometry();
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.max.z).toBeCloseTo(0.5);
    expect(geometry.boundingBox?.min.z).toBeCloseTo(-0.5);
    const material = createFishMaterial({ color: '#e3bf4f', time: { value: 0 } });
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '' };
    material.onBeforeCompile(shader as never, undefined as never);
    expect(shader.vertexShader).toContain('gl_InstanceID');
  });
});
