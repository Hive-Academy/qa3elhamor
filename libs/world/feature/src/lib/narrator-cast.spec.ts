import { BoxGeometry, Group, Mesh, MeshBasicMaterial, type BufferGeometry, type MeshStandardMaterial } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORLD_SCALE } from './world-space.js';
import { createCrabClerkGeometry, CRAB_PART } from './crab-clerk-model.js';
import { createHamourGeometry } from './hamour-model.js';
import { LOW_POLY_PART_ATTRIBUTE } from './low-poly-builder.js';
import {
  NARRATOR_CAST,
  NARRATOR_CAST_IDS,
  NARRATOR_FALLBACK_CAST,
  NARRATOR_SCENE_WORLD_SCALE,
  NARRATOR_SPEECH_HEADROOM,
  isNarratorCastId,
  measureNarratorGeometry,
  measureNarratorModel,
  narratorHeight,
  narratorMotion,
  narratorScaleIn,
  narratorSpeechAnchor,
  resolveNarratorCast,
  type NarratorCastId,
} from './narrator-cast.js';
import { DEFAULT_NARRATOR_MOTION } from './narrator-motion.js';
import { createNarratorUniforms } from './narrator-uniforms.js';
import { SARDINE_PART, createSardinePresidentGeometry } from './sardine-president-model.js';

const triangles = (geometry: BufferGeometry): number => geometry.getAttribute('position').count / 3;
const allFinite = (geometry: BufferGeometry, name: string): boolean =>
  Array.from(geometry.getAttribute(name).array as Float32Array).every(Number.isFinite);

function compile(material: MeshStandardMaterial) {
  const time = { value: 0 };
  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
    fragmentShader: 'void main() {\n#include <emissivemap_fragment>\n}',
  };
  material.onBeforeCompile(shader as never, undefined as never);
  return { shader, time };
}

describe('the narrator cast', () => {
  it.each(NARRATOR_CAST_IDS)('%s is a readable low-poly mesh (300-1500 triangles), finite and deterministic', (id) => {
    const uniforms = createNarratorUniforms();
    const { geometry, material } = NARRATOR_CAST[id].create(uniforms);
    const count = triangles(geometry);
    expect(count).toBeGreaterThanOrEqual(300);
    expect(count).toBeLessThanOrEqual(1500);
    expect(allFinite(geometry, 'position')).toBe(true);
    expect(allFinite(geometry, 'color')).toBe(true);
    const again = NARRATOR_CAST[id].create(createNarratorUniforms());
    expect(Array.from(again.geometry.getAttribute('position').array)).toEqual(Array.from(geometry.getAttribute('position').array));
    expect(Array.from(again.geometry.getAttribute('color').array)).toEqual(Array.from(geometry.getAttribute('color').array));
    for (const m of [material, again.material]) m.dispose();
    geometry.dispose();
    again.geometry.dispose();
  });

  it.each(NARRATOR_CAST_IDS)('%s has a fogged, flat-shaded material driven by its narrator uniforms', (id) => {
    const uniforms = createNarratorUniforms();
    const { geometry, material } = NARRATOR_CAST[id].create(uniforms);
    const standard = material as MeshStandardMaterial;
    expect(standard.fog).toBe(true);
    expect(standard.flatShading).toBe(true);
    expect(standard.vertexColors).toBe(true);
    const { shader } = compile(standard);
    expect(Object.values(shader.uniforms)).toContain(uniforms.time);
    expect(Object.values(shader.uniforms)).toContain(uniforms.talk);
    expect(Object.values(shader.uniforms)).toContain(uniforms.swim);
    expect(shader.vertexShader).toMatch(/transformed/);
    geometry.dispose();
    material.dispose();
  });

  it('is in proportion: the Hamour guide is the biggest, the sardine the smallest', () => {
    expect(NARRATOR_CAST.hamour.height).toBeGreaterThan(NARRATOR_CAST['crab-clerk'].height);
    expect(NARRATOR_CAST['crab-clerk'].height).toBeGreaterThan(NARRATOR_CAST['sardine-president'].height);
  });

  it('keeps the existing Hamour geometry and its plain material for the ambient fish', () => {
    const geometry = createHamourGeometry();
    expect(geometry.getAttribute(LOW_POLY_PART_ATTRIBUTE)).toBeUndefined();
    const { geometry: presenter, material } = NARRATOR_CAST.hamour.create(createNarratorUniforms());
    expect(Array.from(presenter.getAttribute('position').array)).toEqual(Array.from(geometry.getAttribute('position').array));
    const { shader } = compile(material as MeshStandardMaterial);
    expect(shader.vertexShader).toContain('uHamourTalk');
    material.dispose();
  });

  it('tags the limbs the shaders move', () => {
    const sardine = createSardinePresidentGeometry().getAttribute(LOW_POLY_PART_ATTRIBUTE);
    const crab = createCrabClerkGeometry().getAttribute(LOW_POLY_PART_ATTRIBUTE);
    const ids = (attribute: typeof sardine) => new Set(Array.from(attribute.array as Float32Array));
    expect(ids(sardine)).toEqual(new Set([0, ...Object.values(SARDINE_PART)]));
    expect(ids(crab)).toEqual(new Set([0, ...Object.values(CRAB_PART)]));
  });

  it('stands the crab on y = 0 and keeps its claws oversized (wider than its shell)', () => {
    const geometry = createCrabClerkGeometry();
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.min.y).toBeCloseTo(0, 3);
    expect((geometry.boundingBox?.max.x ?? 0) - (geometry.boundingBox?.min.x ?? 0)).toBeGreaterThan(0.68 * 1.4);
  });

  it('lifts each face by its own colour (emissive x vertex colour), fogged as usual', () => {
    const { material } = NARRATOR_CAST['crab-clerk'].create(createNarratorUniforms());
    const { shader } = compile(material as MeshStandardMaterial);
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance *= vColor.rgb');
    material.dispose();
  });

  it('recognises cast ids', () => {
    expect(isNarratorCastId('crab-clerk')).toBe(true);
    expect(isNarratorCastId('spongebob')).toBe(false);
    expect(isNarratorCastId(3)).toBe(false);
  });
});

describe('model narrators and the speech anchor', () => {
  const tallBox = (): Group => {
    const root = new Group();
    const mesh = new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial());
    mesh.position.set(0.5, 1, 0);
    root.add(mesh);
    return root;
  };

  it('measures a loaded model in its own space, once', () => {
    const model = tallBox();
    const bounds = measureNarratorModel(model);
    expect(bounds.height).toBeCloseTo(2);
    expect(bounds.minY).toBeCloseTo(0);
    expect(bounds.centreX).toBeCloseTo(0.5);
    // Parenting it under a scaled group later does not change the cached measure.
    const parent = new Group();
    parent.scale.setScalar(5);
    parent.add(model);
    parent.updateMatrixWorld(true);
    expect(measureNarratorModel(model)).toBe(bounds);
  });

  it('measures a model already parented elsewhere without its parent transform', () => {
    const model = tallBox();
    const parent = new Group();
    parent.scale.setScalar(3);
    parent.position.set(10, 10, 10);
    parent.add(model);
    parent.updateMatrixWorld(true);
    expect(measureNarratorModel(model).height).toBeCloseTo(2);
  });

  it('measures an empty model as 1 tall rather than 0 (no divide by zero)', () => {
    expect(measureNarratorModel(new Group()).height).toBe(1);
  });

  it('uses the given height for a model, else its measured one, times scale', () => {
    const object = tallBox();
    expect(narratorHeight({ object }, 1)).toBeCloseTo(2);
    expect(narratorHeight({ object, height: 0.8 }, 2)).toBeCloseTo(1.6);
    expect(narratorHeight({ object, height: Number.NaN }, Number.NaN)).toBeCloseTo(2);
    expect(narratorHeight('sardine-president', 2)).toBeCloseTo(NARRATOR_CAST['sardine-president'].height * 2);
  });

  it('merges a model narrator motion override over the defaults', () => {
    const motion = narratorMotion({ object: new Group(), motion: { facingOffset: Math.PI / 2 } });
    expect(motion.facingOffset).toBeCloseTo(Math.PI / 2);
    expect(motion.bob).toBe(DEFAULT_NARRATOR_MOTION.bob);
    expect(narratorMotion('crab-clerk').travelYawOffset).toBeCloseTo(-Math.PI / 2);
  });

  it('puts the speech anchor just above the head, guarding non-finite positions', () => {
    const height = NARRATOR_CAST.hamour.height * 3;
    expect(narratorSpeechAnchor('hamour', [1, 2, 3], 3)).toEqual([1, 2 + height * (1 + NARRATOR_SPEECH_HEADROOM), 3]);
    expect(narratorSpeechAnchor('crab-clerk', [Number.NaN, 0, Number.POSITIVE_INFINITY]).every(Number.isFinite)).toBe(true);
    expect(narratorSpeechAnchor({ object: tallBox(), height: 1 }, [0, 0, 0])[1]).toBeCloseTo(1 + NARRATOR_SPEECH_HEADROOM);
  });

  it('measures cast geometry bounds for the base pivot', () => {
    const geometry = createSardinePresidentGeometry();
    const bounds = measureNarratorGeometry(geometry);
    expect(bounds.height).toBeGreaterThan(0.3);
    expect(bounds.minY).toBeLessThan(0);
  });

  it('reports width and depth, so a wide (T-posed) model can be framed', () => {
    const root = new Group().add(new Mesh(new BoxGeometry(3, 1.5, 0.4), new MeshBasicMaterial()));
    const bounds = measureNarratorModel(root);
    expect(bounds.width).toBeCloseTo(3);
    expect(bounds.depth).toBeCloseTo(0.4);
    expect(bounds.height).toBeCloseTo(1.5);
    const crab = measureNarratorGeometry(createCrabClerkGeometry());
    expect(crab.width).toBeGreaterThan(crab.height);
  });

  it('tolerates a model that has not loaded yet (null / undefined)', () => {
    expect(measureNarratorModel(null)).toEqual({ centreX: 0, centreZ: 0, minY: 0, height: 1, width: 1, depth: 1 });
    expect(measureNarratorModel(undefined).height).toBe(1);
    expect(narratorHeight({ object: null }, 2)).toBe(2);
    expect(narratorHeight({ object: undefined, height: 0.6 })).toBeCloseTo(0.6);
    expect(narratorSpeechAnchor({ object: null }, [0, 0, 0]).every(Number.isFinite)).toBe(true);
  });
});

describe('the cast boundary (cast ids come from content config)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('plays the fallback cast for an unknown id, warning once per distinct id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const typo = 'crab-clerck' as NarratorCastId;
    expect(resolveNarratorCast(typo)).toBe(NARRATOR_FALLBACK_CAST);
    expect(narratorHeight(typo)).toBe(NARRATOR_CAST[NARRATOR_FALLBACK_CAST].height);
    expect(narratorMotion(typo)).toBe(NARRATOR_CAST[NARRATOR_FALLBACK_CAST].motion);
    expect(narratorSpeechAnchor(typo, [0, 0, 0]).every(Number.isFinite)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('crab-clerck');
    resolveNarratorCast('patrick-unknown');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('passes known ids and model narrators through untouched', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const model = { object: null };
    expect(resolveNarratorCast('sardine-president')).toBe('sardine-president');
    expect(resolveNarratorCast(model)).toBe(model);
    expect(warn).not.toHaveBeenCalled();
  });

  it('treats a missing cast as unknown rather than throwing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(resolveNarratorCast(undefined)).toBe(NARRATOR_FALLBACK_CAST);
    expect(resolveNarratorCast(null)).toBe(NARRATOR_FALLBACK_CAST);
  });
});

describe('placing narrators inside <WorldSpace>', () => {
  it('scales by the inverse world scale', () => {
    expect(narratorScaleIn()).toBeCloseTo(1 / WORLD_SCALE);
    expect(NARRATOR_SCENE_WORLD_SCALE).toBeCloseTo(0.05);
    expect(narratorScaleIn(10)).toBeCloseTo(0.1);
    // Inside the scaled group the rendered world-unit height is unchanged.
    expect(narratorHeight('crab-clerk', narratorScaleIn(20)) * 20).toBeCloseTo(NARRATOR_CAST['crab-clerk'].height);
    expect(narratorScaleIn(0)).toBeCloseTo(1 / WORLD_SCALE);
    expect(narratorScaleIn(Number.NaN)).toBeCloseTo(1 / WORLD_SCALE);
  });
});
