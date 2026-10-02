import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Vector3,
  type Object3D,
} from 'three';
import type { NarratorBounds } from './narrator-cast.js';
import {
  BONE,
  BONE_COUNT,
  BONE_PARENT,
  NARRATOR_BONES,
  jointOf,
  rigPoseFinite,
  type NarratorRigSpec,
  type RigPose,
} from './narrator-rig.js';
import { MAX_INFLUENCES, computeSkinWeights, type RigFrame } from './narrator-skin-weights.js';

/*
 * The imperative shell of the rig: turns a loaded, static narrator model into a skinned one at
 * load time (the GLB is unchanged), and copies poses onto its bones. The weights come from
 * `computeSkinWeights` (pure); this file only builds three.js objects around them.
 *
 * It works on its own clone of the model (`source.clone(true)`: own nodes, shared geometry and
 * materials), so the cached model is never touched and no `SkeletonUtils.clone` is needed: the
 * skeleton is built on the clone it belongs to. All of a narrator's meshes share one skeleton.
 */

/** A narrator model with bones, ready to pose. */
export interface RiggedNarrator {
  /** The skinned clone to mount (in place of the static model). */
  readonly object: Object3D;
  readonly spec: NarratorRigSpec;
  /** Copies `pose` onto the bones. A pose with a non-finite number is skipped. */
  apply(pose: RigPose): void;
  /** Releases what this clone owns: the skeleton's bone texture and the hit proxy. */
  dispose(): void;
}

/** Name of the invisible capsule that stands in for the narrator's body in ray casts. */
export const NARRATOR_HIT_PROXY = 'narrator-hit-proxy';

const NO_RAYCAST: Mesh['raycast'] = () => undefined;

/**
 * Skinned geometries, per source geometry and spec: the weights are computed once per model
 * (per URL, since the loader caches one geometry per primitive) and shared by every clone, as
 * the source geometry is. Released with the source geometry.
 */
const skinnedGeometries = new WeakMap<BufferGeometry, Map<string, BufferGeometry>>();

const isMesh = (object: Object3D): object is Mesh => (object as Mesh).isMesh === true;

/**
 * The skinned version of `geometry`: the same attributes (shared, not copied) plus
 * `skinIndex` / `skinWeight` from the vertices' positions in the model's space (`toModel`).
 */
function skinnedGeometry(geometry: BufferGeometry, toModel: Matrix4, spec: NarratorRigSpec, frame: RigFrame): BufferGeometry {
  let bySpec = skinnedGeometries.get(geometry);
  const cached = bySpec?.get(spec.id);
  if (cached) return cached;

  const position = geometry.getAttribute('position');
  if (!position || position.itemSize < 3) throw new Error('Narrator rig: a mesh has no positions.');
  // Dequantized (getX applies the normalisation) and moved into the model's space.
  const positions = new Float64Array(position.count * 3);
  const v = new Vector3();
  for (let i = 0; i < position.count; i++) {
    v.set(position.getX(i), position.getY(i), position.getZ(i)).applyMatrix4(toModel);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
  }
  const skin = computeSkinWeights(positions, spec, frame);

  const skinned = new BufferGeometry();
  skinned.name = geometry.name;
  skinned.setIndex(geometry.getIndex());
  for (const [name, attribute] of Object.entries(geometry.attributes)) skinned.setAttribute(name, attribute);
  skinned.morphAttributes = geometry.morphAttributes;
  skinned.morphTargetsRelative = geometry.morphTargetsRelative;
  for (const group of geometry.groups) skinned.addGroup(group.start, group.count, group.materialIndex);
  skinned.setAttribute('skinIndex', new BufferAttribute(skin.joints, MAX_INFLUENCES));
  skinned.setAttribute('skinWeight', new BufferAttribute(skin.weights, MAX_INFLUENCES));
  if (geometry.boundingBox) skinned.boundingBox = geometry.boundingBox.clone();
  if (geometry.boundingSphere) skinned.boundingSphere = geometry.boundingSphere.clone();
  // Goes with the source: the model's eviction disposes it (`disposeObjectTree`).
  geometry.addEventListener('dispose', () => skinned.dispose());

  if (!bySpec) {
    bySpec = new Map();
    skinnedGeometries.set(geometry, bySpec);
  }
  bySpec.set(spec.id, skinned);
  return skinned;
}

/**
 * A skinned clone of `source` rigged by `spec`. `bounds` are the source's (`measureNarratorModel`):
 * the spec's fractions are of its height, from its base centre. Throws if the model cannot be
 * rigged (no meshes, a geometry without positions); the caller falls back to the static model.
 */
export function rigNarratorModel(source: Object3D, spec: NarratorRigSpec, bounds: NarratorBounds): RiggedNarrator {
  if (!(bounds.height > 0) || !Number.isFinite(bounds.height)) throw new Error('Narrator rig: the model has no height.');
  const frame: RigFrame = { originX: bounds.centreX, originY: bounds.minY, originZ: bounds.centreZ, height: bounds.height };
  const root = source.clone(true);
  // The clone's own space is the model's: its transform is not part of the rig.
  root.updateWorldMatrix(false, true);
  const toRoot = new Matrix4().copy(root.matrixWorld).invert();

  // --- Bones: identity rotations (the bind pose is the model's T-pose), pivots from the spec. ---
  const bones: Bone[] = [];
  const pivots: Vector3[] = [];
  NARRATOR_BONES.forEach((name, i) => {
    const joint = jointOf(spec, i);
    const pivot = new Vector3(
      frame.originX + joint[0] * frame.height,
      frame.originY + joint[1] * frame.height,
      frame.originZ + joint[2] * frame.height
    );
    if (!Number.isFinite(pivot.x + pivot.y + pivot.z)) throw new Error(`Narrator rig: bad joint ${name}.`);
    const bone = new Bone();
    bone.name = name;
    const parent = BONE_PARENT[i] ?? -1;
    const parentPivot = parent >= 0 ? pivots[parent] : undefined;
    const parentBone = parent >= 0 ? bones[parent] : undefined;
    bone.position.copy(pivot);
    if (parentPivot) bone.position.sub(parentPivot);
    if (parentBone) parentBone.add(bone);
    bones.push(bone);
    pivots.push(pivot);
  });
  const rootBone = bones[BONE.root];
  if (!rootBone || bones.length !== BONE_COUNT) throw new Error('Narrator rig: incomplete skeleton.');
  const boneInverses = pivots.map((p) => new Matrix4().makeTranslation(-p.x, -p.y, -p.z));
  const skeleton = new Skeleton(bones, boneInverses);

  // --- Every mesh becomes a skinned mesh on the shared skeleton. ---
  const meshes: Mesh[] = [];
  root.traverse((object) => {
    if (isMesh(object)) meshes.push(object);
  });
  if (meshes.length === 0) throw new Error('Narrator rig: the model has no meshes.');
  for (const mesh of meshes) {
    const toModel = new Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld);
    const skinned = new SkinnedMesh(skinnedGeometry(mesh.geometry, toModel, spec, frame), mesh.material);
    skinned.name = mesh.name;
    skinned.position.copy(mesh.position);
    skinned.quaternion.copy(mesh.quaternion);
    skinned.scale.copy(mesh.scale);
    skinned.castShadow = mesh.castShadow;
    skinned.receiveShadow = mesh.receiveShadow;
    skinned.renderOrder = mesh.renderOrder;
    skinned.userData = { ...mesh.userData };
    // Bind-pose bounds miss a raised arm, and ray casts would skin every vertex on the CPU:
    // never culled, never hit (the hit proxy below stands in for clicks).
    skinned.frustumCulled = false;
    skinned.raycast = NO_RAYCAST;
    skinned.bind(skeleton, toModel);
    for (const child of [...mesh.children]) skinned.add(child);
    const parent = mesh.parent;
    if (parent) {
      parent.add(skinned);
      parent.remove(mesh);
    }
  }
  root.add(rootBone);

  // --- A capsule for future clicks: invisible, writes neither colour nor depth. ---
  // The body's middle, a little narrower than the arm span, the whole height; it follows the chest.
  const proxyRadius = frame.height * 0.22;
  const proxyGeometry = new CapsuleGeometry(proxyRadius, frame.height - 2 * proxyRadius, 2, 8);
  const proxyMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
  const proxy = new Mesh(proxyGeometry, proxyMaterial);
  proxy.name = NARRATOR_HIT_PROXY;
  const chestPivot = pivots[BONE.chest] ?? new Vector3();
  proxy.position.set(frame.originX, frame.originY + frame.height / 2, frame.originZ).sub(chestPivot);
  bones[BONE.chest]?.add(proxy);

  const rest = rootBone.position.clone();
  const hipsBone = bones[BONE.hips];
  const hipsRest = hipsBone ? hipsBone.position.clone() : new Vector3();
  const height = frame.height;

  return {
    object: root,
    spec,
    apply(pose: RigPose) {
      if (!rigPoseFinite(pose)) return;
      for (let i = 0; i < BONE_COUNT; i++) {
        bones[i]?.rotation.set(pose.rot[i * 3] ?? 0, pose.rot[i * 3 + 1] ?? 0, pose.rot[i * 3 + 2] ?? 0, 'XYZ');
      }
      rootBone.position.set(
        rest.x + pose.offsetX * height,
        rest.y + pose.offsetY * height,
        rest.z + pose.offsetZ * height
      );
      const xz = 1 / Math.sqrt(pose.squash);
      rootBone.scale.set(xz, pose.squash, xz);
      hipsBone?.position.set(hipsRest.x, hipsRest.y + pose.hipsY * height, hipsRest.z);
    },
    dispose() {
      skeleton.dispose();
      proxyGeometry.dispose();
      proxyMaterial.dispose();
    },
  };
}
