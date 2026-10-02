import { BoxGeometry, MeshStandardMaterial, type Group } from 'three';
import { describe, expect, it } from 'vitest';
import { CRAB_JOINTS } from './crab-clerk-model.js';
import { HAMOUR_JOINTS } from './hamour-model.js';
import { createNarratorAnimator, stepNarratorAnimator } from './narrator-animator.js';
import { NARRATOR_CAST, NARRATOR_CAST_IDS } from './narrator-cast.js';
import { buildJointedNarrator, jointRotation, solveLeg, type JointDrive, type JointedCastSpec } from './narrator-jointed.js';
import { BONE, SPONGEBOB_RIG, createRigPose, setBone } from './narrator-rig.js';
import { createNarratorUniforms } from './narrator-uniforms.js';
import { SARDINE_JOINTS } from './sardine-president-model.js';

const out: [number, number, number] = [0, 0, 0];

describe('jointRotation', () => {
  it('sums each drive: some of a bone, per axis, optionally from another axis', () => {
    const pose = createRigPose();
    setBone(pose, BONE.shoulderL, 0.1, 0.2, 0.4);
    setBone(pose, BONE.jaw, 0.5, 0, 0);
    const drives: JointDrive[] = [
      { bone: 'shoulder.L', gain: [1, 0.5, 2] },
      { bone: 'shoulder.L', gain: [0, -1, 0], from: [2, 2, 2] },
      { bone: 'jaw', gain: [-1, 0, 0] },
    ];
    jointRotation(pose, drives, out);
    expect(out[0]).toBeCloseTo(0.1 - 0.5);
    expect(out[1]).toBeCloseTo(0.1 - 0.4);
    expect(out[2]).toBeCloseTo(0.8);
  });

  it('ignores a bone outside the vocabulary and a non-finite channel', () => {
    const pose = createRigPose();
    setBone(pose, BONE.head, Number.NaN, 0.3, 0);
    jointRotation(pose, [{ bone: 'tentacle' as never, gain: [1, 1, 1] }, { bone: 'head', gain: [1, 1, 1] }], out);
    expect(out).toEqual([0, 0.3, 0]);
  });

  it('is zero for no drives (a leg segment the IK turns instead)', () => {
    jointRotation(createRigPose(), [], out);
    expect(out).toEqual([0, 0, 0]);
  });
});

describe('solveLeg', () => {
  const knee: [number, number] = [0.18, 0.08];
  const foot: [number, number] = [0.25, -0.15];
  const angles = { thigh: 0, shin: 0 };
  const tip = (): [number, number] => {
    const a = Math.hypot(...knee);
    const b = Math.hypot(foot[0] - knee[0], foot[1] - knee[1]);
    const t = Math.atan2(knee[1], knee[0]) + angles.thigh;
    const s = Math.atan2(foot[1] - knee[1], foot[0] - knee[0]) + angles.thigh + angles.shin;
    return [a * Math.cos(t) + b * Math.cos(s), a * Math.sin(t) + b * Math.sin(s)];
  };

  it('is still at rest', () => {
    solveLeg(knee, foot, foot, angles);
    expect(angles.thigh).toBeCloseTo(0, 6);
    expect(angles.shin).toBeCloseTo(0, 6);
  });

  it('keeps the foot on its target as the hip drops (the target rises toward the hip)', () => {
    for (const drop of [0.02, 0.05, 0.08]) {
      solveLeg(knee, foot, [foot[0], foot[1] + drop], angles);
      const [x, y] = tip();
      expect(x).toBeCloseTo(foot[0], 5);
      expect(y).toBeCloseTo(foot[1] + drop, 5);
      // The knee lifts (bends further the way it already bends).
      expect(angles.thigh).toBeGreaterThan(0);
    }
  });

  it('clamps an unreachable target, and holds still for nonsense', () => {
    solveLeg(knee, foot, [10, -10], angles);
    expect(Number.isFinite(angles.thigh) && Number.isFinite(angles.shin)).toBe(true);
    solveLeg(knee, foot, [Number.NaN, 0], angles);
    expect(angles).toEqual({ thigh: 0, shin: 0 });
  });
});

describe('buildJointedNarrator', () => {
  const tiny: JointedCastSpec = {
    joints: [
      { name: 'body', parent: null, pivot: [0, 0.5, 0], parts: [0], drives: [{ bone: 'chest', gain: [1, 1, 1] }] },
      { name: 'arm', parent: 'body', pivot: [0.5, 0.5, 0], parts: [1], drives: [{ bone: 'shoulder.L', gain: [0, 0, 1] }] },
    ],
  };
  const parts = () =>
    new Map([
      [0, new BoxGeometry(1, 1, 1).translate(0, 0.5, 0)],
      [1, new BoxGeometry(0.5, 0.1, 0.1).translate(0.75, 0.5, 0)],
    ]);

  it('puts each part on its pivot and maps the pose onto it', () => {
    const narrator = buildJointedNarrator(tiny, SPONGEBOB_RIG, parts(), new MeshStandardMaterial(), createNarratorUniforms());
    expect(narrator.bounds.minY).toBeCloseTo(0);
    expect(narrator.bounds.height).toBeCloseTo(1);
    const pose = createRigPose();
    setBone(pose, BONE.shoulderL, 0, 0, 0.7);
    setBone(pose, BONE.chest, 0.1, 0, 0);
    narrator.apply(pose);
    const arm = narrator.object.getObjectByName('arm') as Group;
    const body = narrator.object.getObjectByName('body') as Group;
    expect(arm.rotation.z).toBeCloseTo(0.7);
    expect(body.rotation.x).toBeCloseTo(0.1);
    // The arm hangs off the body at its own pivot.
    expect(arm.position.x).toBeCloseTo(0.5);
    narrator.dispose();
  });

  it('skips a corrupt pose, and squashes about the feet', () => {
    const narrator = buildJointedNarrator(tiny, SPONGEBOB_RIG, parts(), new MeshStandardMaterial(), createNarratorUniforms());
    const pose = createRigPose();
    pose.squash = 0.8;
    narrator.apply(pose);
    expect(narrator.object.scale.y).toBeCloseTo(0.8);
    expect(narrator.object.position.y).toBeCloseTo(0);
    pose.squash = Number.NaN;
    narrator.apply(pose);
    expect(narrator.object.scale.y).toBeCloseTo(0.8);
    narrator.dispose();
  });

  it('rejects a joint given before its parent', () => {
    const bad: JointedCastSpec = { joints: [{ name: 'arm', parent: 'body', pivot: [0, 0, 0], parts: [], drives: [] }] };
    expect(() => buildJointedNarrator(bad, SPONGEBOB_RIG, new Map(), new MeshStandardMaterial(), createNarratorUniforms())).toThrow(/before its parent/);
  });

  it.each([
    ['crab-clerk', CRAB_JOINTS],
    ['hamour', HAMOUR_JOINTS],
    ['sardine-president', SARDINE_JOINTS],
  ] as const)('%s: every joint drives real bones and names a parent that comes first', (_id, spec) => {
    const seen = new Set<string>();
    for (const joint of spec.joints) {
      if (joint.parent !== null) expect(seen.has(joint.parent), joint.name).toBe(true);
      seen.add(joint.name);
      for (const drive of joint.drives) expect(drive.gain.every(Number.isFinite)).toBe(true);
    }
  });
});

describe('the original cast, posed', () => {
  it.each(NARRATOR_CAST_IDS)('%s stays finite through every clip, and holds its rest pose under reduced motion', (id) => {
    const uniforms = createNarratorUniforms();
    const narrator = NARRATOR_CAST[id].create(uniforms);
    const state = createNarratorAnimator(narrator.spec, 4);
    const pose = createRigPose();
    for (const clip of ['idle', 'talk', 'wave', 'react', 'hop', 'listen'] as const)
      for (let i = 0; i < 40; i++) {
        uniforms.time.value += 1 / 30;
        uniforms.swim.value = clip === 'hop' ? 1 : 0.3;
        stepNarratorAnimator(state, { dt: 1 / 30, phase: 'present', presence: 1, talk: 1, waving: false, poke: 0, reducedMotion: false, hold: { clip } }, narrator.spec, pose);
        narrator.apply(pose);
      }
    narrator.object.traverse((o) => {
      for (const v of [o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z]) expect(Number.isFinite(v)).toBe(true);
    });
    // Reduced motion: the rest pose, so every driven joint is back at zero.
    stepNarratorAnimator(state, { dt: 1 / 30, phase: 'present', presence: 1, talk: 0, waving: false, poke: 0, reducedMotion: true, hold: null }, narrator.spec, pose);
    uniforms.swim.value = 0;
    narrator.apply(pose);
    expect(narrator.object.scale.y).toBeCloseTo(1);
    expect(uniforms.bend.value).toBeCloseTo(0);
    narrator.dispose();
  });

  it("keeps the crab's feet on the floor as it crouches", () => {
    const uniforms = createNarratorUniforms();
    const crab = NARRATOR_CAST['crab-clerk'].create(uniforms);
    const pose = createRigPose();
    const footY = () => {
      crab.object.updateMatrixWorld(true);
      const shin = crab.object.getObjectByName('shin.0');
      const mesh = shin?.children[0];
      if (!mesh || !('geometry' in mesh)) return Number.NaN;
      const geometry = (mesh as unknown as { geometry: BoxGeometry }).geometry;
      geometry.computeBoundingBox();
      const box = geometry.boundingBox?.clone().applyMatrix4(mesh.matrixWorld);
      return box?.min.y ?? Number.NaN;
    };
    crab.apply(pose);
    const rest = footY();
    pose.hipsY = -0.05;
    crab.apply(pose);
    expect(footY()).toBeCloseTo(rest, 2);
    crab.dispose();
  });
});
