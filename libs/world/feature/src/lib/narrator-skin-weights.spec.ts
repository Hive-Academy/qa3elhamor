import { describe, expect, it } from 'vitest';
import { NARRATOR_BONES, SPONGEBOB_RIG, type NarratorBoneName } from './narrator-rig.js';
import { MAX_INFLUENCES, computeSkinWeights, dominantBone, type RigFrame } from './narrator-skin-weights.js';

// SpongeBob's model space as measured on the LOD: feet on y = 0, centred, 10.033 tall.
const FRAME: RigFrame = { originX: 0, originY: 0, originZ: 0, height: 10.033 };

const weigh = (...points: [number, number, number][]) => computeSkinWeights(points.flat(), SPONGEBOB_RIG, FRAME);
const bone = (name: NarratorBoneName): number => NARRATOR_BONES.indexOf(name);

/** The weight vertex `v` gives `name` (0 if it is not among its influences). */
function weightOf(skin: ReturnType<typeof weigh>, v: number, name: NarratorBoneName): number {
  let w = 0;
  for (let k = 0; k < MAX_INFLUENCES; k++) {
    if (skin.joints[v * MAX_INFLUENCES + k] === bone(name)) w += skin.weights[v * MAX_INFLUENCES + k] ?? 0;
  }
  return w;
}

describe('computeSkinWeights', () => {
  it('gives every vertex at most four influences summing to 1, with valid bone indices', () => {
    const points: [number, number, number][] = [];
    for (let x = -6.4; x <= 6.4; x += 0.8)
      for (let y = 0; y <= 10; y += 0.7) for (let z = -2.5; z <= 2.5; z += 1.25) points.push([x, y, z]);
    const skin = weigh(...points);
    for (let v = 0; v < points.length; v++) {
      let sum = 0;
      for (let k = 0; k < MAX_INFLUENCES; k++) {
        const w = skin.weights[v * MAX_INFLUENCES + k] ?? Number.NaN;
        expect(w).toBeGreaterThanOrEqual(0);
        expect(skin.joints[v * MAX_INFLUENCES + k]).toBeLessThan(NARRATOR_BONES.length);
        sum += w;
      }
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it('gives coincident vertices identical weights (no cracks where two primitives meet)', () => {
    // A seam vertex at the sleeve's edge, as two primitives with different quantisation decode it.
    const a: [number, number, number] = [3.96, 5.12, -0.2];
    const b: [number, number, number] = [3.96 + 1e-6, 5.12 - 1e-6, -0.2];
    const skin = weigh(a, a, b);
    const slice = (v: number) => [
      ...skin.joints.slice(v * MAX_INFLUENCES, (v + 1) * MAX_INFLUENCES),
      ...skin.weights.slice(v * MAX_INFLUENCES, (v + 1) * MAX_INFLUENCES),
    ];
    expect(slice(1)).toEqual(slice(0));
    expect(slice(2)).toEqual(slice(0));
  });

  it('changes weights smoothly with position (no step for nearly coincident vertices)', () => {
    const skin = weigh([3.3, 5.1, -0.2], [3.3005, 5.1, -0.2]);
    for (const name of ['head', 'shoulder.R', 'shoulder.L'] as const)
      expect(Math.abs(weightOf(skin, 0, name) - weightOf(skin, 1, name))).toBeLessThan(1e-3);
  });

  it('lets each limb be dominated by its own bone, on the right side', () => {
    const skin = weigh(
      [6.0, 5.1, -0.2], // left glove (+x)
      [-6.0, 5.1, -0.2], // right glove
      [3.6, 5.1, -0.2], // left sleeve
      [-4.9, 5.1, -0.2], // right forearm ring
      [1.22, 2.0, -0.25], // left thigh
      [-1.22, 0.9, -0.3], // right shin / sock
      [1.2, 0.2, 0.6] // left shoe's toe
    );
    expect(dominantBone(skin, 0)).toBe(bone('hand.L'));
    expect(dominantBone(skin, 1)).toBe(bone('hand.R'));
    expect(dominantBone(skin, 2)).toBe(bone('shoulder.L'));
    expect(dominantBone(skin, 3)).toBe(bone('elbow.R'));
    expect(dominantBone(skin, 4)).toBe(bone('hip.L'));
    expect(dominantBone(skin, 5)).toBe(bone('knee.R'));
    expect(dominantBone(skin, 6)).toBe(bone('knee.L'));
    // Never the other side's limb.
    expect(weightOf(skin, 0, 'hand.R')).toBe(0);
    expect(weightOf(skin, 4, 'hip.R')).toBe(0);
  });

  it('keeps the face rigid on the box: eyes, nose, teeth and lashes follow the head alone', () => {
    const skin = weigh([1.5, 8.0, 1.35], [0, 7.0, 2.5], [-0.5, 5.6, 1.2], [0, 9.0, 0.7], [-2.2, 7.1, 1.25]);
    for (let v = 0; v < 5; v++) expect(weightOf(skin, v, 'head')).toBeGreaterThan(0.99);
  });

  it('puts a non-finite vertex on the root alone, and a far-away one on one bone (the nearest for its reach)', () => {
    const skin = weigh([Number.NaN, 1, 1], [0, Number.POSITIVE_INFINITY, 0], [400, 5.1, -0.2]);
    expect(skin.joints[0]).toBe(bone('root'));
    expect(skin.weights[0]).toBe(1);
    expect(skin.joints[MAX_INFLUENCES]).toBe(bone('root'));
    // Distance over radius: the box's wide capsule reaches furthest.
    expect(dominantBone(skin, 2)).toBe(bone('head'));
    expect(skin.weights[2 * MAX_INFLUENCES]).toBe(1);
  });
});
