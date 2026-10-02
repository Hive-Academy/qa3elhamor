import { BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, SkinnedMesh, Vector3, type Bone, type Object3D } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { measureNarratorModel } from './narrator-cast.js';
import {
  BONE,
  LEFT,
  RIGHT,
  SPONGEBOB_RIG,
  addArm,
  addCrouch,
  createRigPose,
  legBend,
  legLengths,
  writeRestPose,
} from './narrator-rig.js';
import { NARRATOR_HIT_PROXY, rigNarratorModel } from './narrator-skinning.js';

const H = 10.033;

/** A stand-in for the SpongeBob LOD: two primitives with their own node transforms, as the GLB has. */
function fakeSpongeBob(): Group {
  const root = new Group();
  const box = new Mesh(new BoxGeometry(2, 2, 2), new MeshStandardMaterial());
  // The sponge box: scaled and lifted by its node, like a quantised primitive.
  box.scale.set(3.3, 2.95, 2);
  box.position.set(0, 7.08, -0.5);
  const arms = new Mesh(new BoxGeometry(12.8, 0.6, 0.6, 16, 1, 1), new MeshStandardMaterial());
  arms.position.set(0, 5.1, -0.2);
  const legs = new Mesh(new BoxGeometry(2.6, 4.2, 0.6, 2, 8, 1), new MeshStandardMaterial());
  legs.position.set(0, 2.1, -0.25);
  root.add(box, arms, legs);
  return root;
}

const skinnedMeshes = (object: Object3D): SkinnedMesh[] => {
  const found: SkinnedMesh[] = [];
  object.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) found.push(o as SkinnedMesh);
  });
  return found;
};

const boneNamed = (object: Object3D, name: string): Bone => {
  const bone = object.getObjectByName(name);
  if (!bone) throw new Error(`no bone ${name}`);
  return bone as Bone;
};

describe('rigNarratorModel', () => {
  it('skins a clone on one shared skeleton, leaving the source untouched', () => {
    const source = fakeSpongeBob();
    const rig = rigNarratorModel(source, SPONGEBOB_RIG, measureNarratorModel(source));
    const meshes = skinnedMeshes(rig.object);
    expect(meshes).toHaveLength(3);
    const skeleton = meshes[0]?.skeleton;
    expect(skeleton?.bones).toHaveLength(14);
    for (const mesh of meshes) {
      expect(mesh.skeleton).toBe(skeleton);
      expect(mesh.frustumCulled).toBe(false);
      expect(mesh.geometry.getAttribute('skinIndex').count).toBe(mesh.geometry.getAttribute('position').count);
    }
    expect(skinnedMeshes(source)).toHaveLength(0);
    expect(source.children.every((c) => c instanceof Mesh && !(c instanceof SkinnedMesh))).toBe(true);
  });

  it('disables ray casts on the skinned meshes and adds an invisible hit proxy', () => {
    const source = fakeSpongeBob();
    const rig = rigNarratorModel(source, SPONGEBOB_RIG, measureNarratorModel(source));
    const hits: unknown[] = [];
    for (const mesh of skinnedMeshes(rig.object)) mesh.raycast(undefined as never, hits as never);
    expect(hits).toHaveLength(0);
    const proxy = rig.object.getObjectByName(NARRATOR_HIT_PROXY) as Mesh | undefined;
    expect(proxy).toBeDefined();
    const material = proxy?.material as MeshStandardMaterial;
    expect(material.colorWrite).toBe(false);
    expect(material.depthWrite).toBe(false);
  });

  it('computes the weights once per geometry: a second clone shares the skinned geometry', () => {
    const source = fakeSpongeBob();
    const bounds = measureNarratorModel(source);
    const a = skinnedMeshes(rigNarratorModel(source, SPONGEBOB_RIG, bounds).object);
    const b = skinnedMeshes(rigNarratorModel(source, SPONGEBOB_RIG, bounds).object);
    expect(b[0]?.geometry).toBe(a[0]?.geometry);
    expect(b[0]?.skeleton).not.toBe(a[0]?.skeleton);
  });

  it('binds so the rest of the skeleton reproduces the model (no jump at bind)', () => {
    const source = fakeSpongeBob();
    const rig = rigNarratorModel(source, SPONGEBOB_RIG, measureNarratorModel(source));
    rig.object.updateMatrixWorld(true);
    const [mesh] = skinnedMeshes(rig.object);
    if (!mesh) throw new Error('no mesh');
    mesh.skeleton.update();
    const skinned = new Vector3();
    const expected = new Vector3();
    for (let i = 0; i < mesh.geometry.getAttribute('position').count; i += 7) {
      mesh.getVertexPosition(i, skinned).applyMatrix4(mesh.matrixWorld);
      expected.fromBufferAttribute(mesh.geometry.getAttribute('position'), i).applyMatrix4(mesh.matrixWorld);
      expect(skinned.distanceTo(expected)).toBeLessThan(1e-4);
    }
  });

  it('applies a pose to the bones, and skips a pose with a non-finite number', () => {
    const source = fakeSpongeBob();
    const rig = rigNarratorModel(source, SPONGEBOB_RIG, measureNarratorModel(source));
    const pose = createRigPose();
    writeRestPose(SPONGEBOB_RIG.rest, pose);
    pose.offsetY = 0.1;
    rig.apply(pose);
    const shoulder = boneNamed(rig.object, 'shoulder.R');
    expect(shoulder.rotation.z).toBeCloseTo(SPONGEBOB_RIG.rest.armDown, 6);
    expect(boneNamed(rig.object, 'root').position.y).toBeCloseTo(0.1 * H, 3);
    pose.rot[BONE.shoulderR * 3 + 2] = Number.NaN;
    rig.apply(pose);
    expect(shoulder.rotation.z).toBeCloseTo(SPONGEBOB_RIG.rest.armDown, 6);
  });

  it('throws for a model it cannot rig (the narrator falls back to the static model)', () => {
    expect(() => rigNarratorModel(new Group(), SPONGEBOB_RIG, measureNarratorModel(fakeSpongeBob()))).toThrow();
  });

  it('releases the skeleton and the hit proxy on dispose', () => {
    const source = fakeSpongeBob();
    const rig = rigNarratorModel(source, SPONGEBOB_RIG, measureNarratorModel(source));
    const skeleton = skinnedMeshes(rig.object)[0]?.skeleton;
    const spy = vi.spyOn(skeleton as NonNullable<typeof skeleton>, 'dispose');
    rig.dispose();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('the SpongeBob rest pose', () => {
  /**
   * Points along the arm in the T-pose (model units) and the bone that carries each, from the
   * sleeve's end out (the sleeve's root comes out of the box's side by design).
   */
  const ARM_POINTS: [number, string][] = [
    [3.96, 'shoulder'],
    [4.25, 'elbow'],
    [5.15, 'hand'],
    [5.8, 'hand'],
    [6.4, 'hand'],
  ];
  const boxHalfWidth = (y: number): number => (y < 5 ? 2.79 : y < 6 ? 2.87 : y < 7 ? 2.92 : y < 8 ? 3.04 : 3.34);
  /** Half the arm's thickness, model units (the sleeve is the thickest part). */
  const ARM_RADIUS = 0.4;

  it('lowers both arms clear of the sponge box and the shirt (no clipping)', () => {
    const source = fakeSpongeBob();
    const rig = rigNarratorModel(source, SPONGEBOB_RIG, measureNarratorModel(source));
    const pose = createRigPose();
    writeRestPose(SPONGEBOB_RIG.rest, pose);
    rig.apply(pose);
    rig.object.updateMatrixWorld(true);
    for (const [side, suffix] of [
      [1, 'L'],
      [-1, 'R'],
    ] as const) {
      let lowest = Number.POSITIVE_INFINITY;
      for (const [x, part] of ARM_POINTS) {
        const bone = boneNamed(rig.object, `${part}.${suffix}`);
        const p = new Vector3(side * x, 5.1, -0.2);
        // Bone space at bind is a translation by the pivot: undo it, then apply the posed bone.
        const pivot = new Vector3().setFromMatrixPosition(bone.matrixWorld);
        const bindPivot = new Vector3(...(SPONGEBOB_RIG.joints[`${part}.${suffix}` as 'hand.L'] as [number, number, number])).multiplyScalar(H);
        const world = p.clone().sub(bindPivot).applyMatrix4(new Matrix4().extractRotation(bone.matrixWorld)).add(pivot);
        lowest = Math.min(lowest, world.y);
        const inner = Math.abs(world.x) - ARM_RADIUS;
        // The box's measured half width by height (y 4.12..10), and the shirt under it (y 3.5..4.2).
        if (world.y > 4.1) expect(inner).toBeGreaterThan(boxHalfWidth(world.y));
        else if (world.y > 3.4) expect(inner).toBeGreaterThan(3.0);
      }
      // Really lowered: the hand ends near the hips, not out to the side.
      expect(lowest).toBeLessThan(3.2);
    }
  });

  it('mirrors the arms: the same lift raises both sides', () => {
    const pose = createRigPose();
    addArm(pose, LEFT, 0.5, 0.2);
    addArm(pose, RIGHT, 0.5, 0.2);
    expect(pose.rot[BONE.shoulderL * 3]).toBe(pose.rot[BONE.shoulderR * 3]);
    expect(pose.rot[BONE.shoulderL * 3 + 2]).toBe(-(pose.rot[BONE.shoulderR * 3 + 2] ?? 0));
  });
});

describe('legBend / addCrouch', () => {
  it('keeps the ankle straight below the hip, the drop lower', () => {
    const { thigh, shin } = legLengths(SPONGEBOB_RIG);
    for (const drop of [0.01, 0.03, 0.06]) {
      const { hip, knee } = legBend(thigh, shin, drop);
      // Sagittal plane: the thigh swings forward by `hip`, the shin back by `knee` from it.
      const kneeZ = thigh * Math.sin(hip);
      const kneeY = -thigh * Math.cos(hip);
      const ankleZ = kneeZ - shin * Math.sin(knee - hip);
      const ankleY = kneeY - shin * Math.cos(knee - hip);
      expect(ankleZ).toBeCloseTo(0, 6);
      expect(-ankleY).toBeCloseTo(thigh + shin - drop, 6);
    }
  });

  it('is a straight leg for no drop, and safe for nonsense', () => {
    expect(legBend(1, 1, 0)).toEqual({ hip: 0, knee: 0 });
    expect(legBend(1, 1, Number.NaN)).toEqual({ hip: 0, knee: 0 });
    const deep = legBend(1, 1, 10);
    expect(Number.isFinite(deep.hip) && Number.isFinite(deep.knee)).toBe(true);
    const pose = createRigPose();
    addCrouch(pose, legLengths(SPONGEBOB_RIG), 0.05);
    expect(pose.hipsY).toBeCloseTo(-0.05, 9);
    expect(pose.rot[BONE.kneeL * 3]).toBeGreaterThan(0);
  });
});
