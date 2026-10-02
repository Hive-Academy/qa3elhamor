import { describe, expect, it } from 'vitest';
import { createNarratorAnimator, stepNarratorAnimator } from './narrator-animator.js';
import { NARRATOR_BONES, PATRICK_RIG, createRigPose, legLengths, rigPoseFinite, type NarratorBoneName } from './narrator-rig.js';
import { MAX_INFLUENCES, computeSkinWeights, dominantBone, type RigFrame } from './narrator-skin-weights.js';

// Patrick's model space as measured on the LOD: feet on y = 0, centred, 14.889 tall.
const FRAME: RigFrame = { originX: 0, originY: 0, originZ: 0, height: 14.889 };
const weigh = (...points: [number, number, number][]) => computeSkinWeights(points.flat(), PATRICK_RIG, FRAME);
const bone = (name: NarratorBoneName): number => NARRATOR_BONES.indexOf(name);

function weightOf(skin: ReturnType<typeof weigh>, v: number, name: NarratorBoneName): number {
  let w = 0;
  for (let k = 0; k < MAX_INFLUENCES; k++)
    if (skin.joints[v * MAX_INFLUENCES + k] === bone(name)) w += skin.weights[v * MAX_INFLUENCES + k] ?? 0;
  return w;
}

describe('PATRICK_RIG', () => {
  it('gives every vertex of his bounds at most four influences, normalised, on real bones', () => {
    const points: [number, number, number][] = [];
    for (let x = -4.9; x <= 4.9; x += 0.7)
      for (let y = 0; y <= 14.9; y += 0.6) for (let z = -3.2; z <= 3.2; z += 1.6) points.push([x, y, z]);
    const skin = weigh(...points);
    for (let v = 0; v < points.length; v++) {
      let sum = 0;
      for (let k = 0; k < MAX_INFLUENCES; k++) {
        expect(skin.joints[v * MAX_INFLUENCES + k]).toBeLessThan(NARRATOR_BONES.length);
        sum += skin.weights[v * MAX_INFLUENCES + k] ?? 0;
      }
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it('gives coincident vertices identical weights (no cracks), and nearby ones nearly the same', () => {
    const a: [number, number, number] = [2.9, 5.7, -0.75];
    const b: [number, number, number] = [2.9 + 1e-6, 5.7 - 1e-6, -0.75];
    const skin = weigh(a, a, b, [2.9005, 5.7, -0.75]);
    const slice = (v: number) => [
      ...skin.joints.slice(v * MAX_INFLUENCES, (v + 1) * MAX_INFLUENCES),
      ...skin.weights.slice(v * MAX_INFLUENCES, (v + 1) * MAX_INFLUENCES),
    ];
    expect(slice(1)).toEqual(slice(0));
    expect(slice(2)).toEqual(slice(0));
    for (const name of ['chest', 'shoulder.L', 'elbow.L'] as const)
      expect(Math.abs(weightOf(skin, 0, name) - weightOf(skin, 3, name))).toBeLessThan(1e-3);
  });

  it('keeps the face rigid on the head point: eyes, brows and the top follow the head alone, the mouth almost', () => {
    const skin = weigh([0.7, 10.2, 1.9], [-0.5, 10.5, 2.1], [0.8, 11.6, 1.4], [0, 14.5, 0.4], [1.3, 8.3, 1.8], [-1.3, 8.3, 1.8]);
    for (let v = 0; v < 4; v++) expect(weightOf(skin, v, 'head')).toBeGreaterThan(0.99);
    for (let v = 4; v < 6; v++) expect(weightOf(skin, v, 'head')).toBeGreaterThan(0.9);
  });

  it('lets each star point follow its own bone, on its own side', () => {
    const skin = weigh(
      [4.8, 4.5, -1.0], // left arm tip (+x)
      [-4.8, 4.5, -1.0], // right arm tip
      [3.5, 5.5, -0.9], // left arm's middle
      [0, 5.0, 3.1], // belly
      [1.55, 0.3, 0.1], // left foot
      [-1.5, 1.6, 0.1], // right leg of the shorts
    );
    expect(dominantBone(skin, 0)).toBe(bone('hand.L'));
    expect(dominantBone(skin, 1)).toBe(bone('hand.R'));
    expect([bone('shoulder.L'), bone('elbow.L')]).toContain(dominantBone(skin, 2));
    expect(dominantBone(skin, 3)).toBe(bone('chest'));
    expect(dominantBone(skin, 4)).toBe(bone('knee.L'));
    expect(dominantBone(skin, 5)).toBe(bone('hip.R'));
    expect(weightOf(skin, 0, 'hand.R')).toBe(0);
    expect(weightOf(skin, 4, 'knee.R')).toBe(0);
  });

  it('keeps the shorts by the armpits with the body when an arm lifts', () => {
    const skin = weigh([2.6, 4.2, -0.4], [-2.6, 4.2, -0.4]);
    expect(weightOf(skin, 0, 'chest')).toBeGreaterThan(0.95);
    expect(weightOf(skin, 1, 'chest')).toBeGreaterThan(0.95);
  });

  it('has short legs it can crouch on, droopy arms, and his own style', () => {
    const legs = legLengths(PATRICK_RIG);
    expect(legs.thigh).toBeGreaterThan(0);
    expect(legs.thigh + legs.shin).toBeLessThan(0.2);
    expect(PATRICK_RIG.rest.armBind).toBeGreaterThan(0);
    expect(PATRICK_RIG.style?.id).toBe('patrick');
  });

  it('plays every clip finitely, and the rest pose under reduced motion', () => {
    const state = createNarratorAnimator(PATRICK_RIG, 9);
    const pose = createRigPose();
    for (const clip of ['idle', 'talk', 'wave', 'react', 'hop', 'listen', 'doze', 'belly'] as const)
      for (let i = 0; i < 30; i++) {
        stepNarratorAnimator(state, { dt: 1 / 30, phase: 'present', presence: 1, talk: 1, waving: false, poke: 0, reducedMotion: false, hold: { clip } }, PATRICK_RIG, pose);
        expect(rigPoseFinite(pose)).toBe(true);
      }
  });
});
