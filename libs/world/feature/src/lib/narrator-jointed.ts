import { Box3, Group, Mesh, Quaternion, Vector3, type BufferGeometry, type Material } from 'three';
import type { NarratorBounds } from './narrator-cast.js';
import { clamp } from './narrator-motion.js';
import { NARRATOR_BONES, rigPoseFinite, type NarratorBoneName, type NarratorRigSpec, type RigPose } from './narrator-rig.js';
import type { NarratorUniforms } from './narrator-uniforms.js';
import type { Vec3 } from './world-space.js';

/*
 * The original cast, posed by the same animator as the bundled models. They are built in code, so
 * instead of skinning they are made of jointed parts: each part of the mesh (a claw, an eye stalk,
 * a fin, a tail, a leg segment) is its own mesh on a pivot group at its joint, and this adapter
 * maps the animator's pose (the shared bone vocabulary, `narrator-rig.ts`) onto those pivots.
 *
 * - Each joint's rotation is a sum of drives: some of a bone's rotation, per axis, optionally from
 *   another of its axes (a fin flares about y when the "arm" lifts about z). Bones a character has
 *   no part for are simply never read.
 * - Legs (a crab's) are solved, not driven: two-segment IK keeps each foot on the floor however the
 *   hips drop, and lifts the feet in turn while it scuttles.
 * - A fish's body bends smoothly in its shader (`uniforms.bend`, from the tail bone) and its jaw opens
 *   in the shader (`uniforms.talk`, from the jaw bone); the tail fin rides the bend.
 * - The whole body takes the pose's offset (a hop) and squash about its feet, like a rigged root.
 *
 * Pure helpers (`jointRotation`, `solveLeg`) are exported for the specs. `apply` allocates nothing.
 */

export type Axis = 0 | 1 | 2;

/** Some of a bone's rotation into a joint: `out[k] += gain[k] * bone[from[k]]`. */
export interface JointDrive {
  readonly bone: NarratorBoneName;
  readonly gain: Vec3;
  /** Which of the bone's axes feeds each of the joint's (default: the same axis). */
  readonly from?: readonly [Axis, Axis, Axis];
}

/** A scale driven by a bone (a mouth that opens): `1 + gain * bone[axis] * along`, per axis. */
export interface JointStretch {
  readonly bone: NarratorBoneName;
  readonly axis: Axis;
  readonly gain: number;
  readonly along: Vec3;
}

export interface CastJoint {
  readonly name: string;
  /** The parent joint's name; null: the cast's root (its feet). */
  readonly parent: string | null;
  /** Pivot, model units (the model's own space). */
  readonly pivot: Vec3;
  /** The builder part ids whose geometry rides on this joint. */
  readonly parts: readonly number[];
  readonly drives: readonly JointDrive[];
  readonly stretch?: JointStretch;
  /** Rides a fish's body bend (`JointedCastSpec.bend`): moved across by it, turned with it. */
  readonly onBend?: boolean;
  /** The joint's hips drop: this joint goes down by the pose's `hipsY` (x height). */
  readonly dropsWithHips?: boolean;
  /**
   * A quick flutter on the narrator's own clock (a fin): `amplitude` radians about `axis` at
   * `rate` rad/s (a multiple of 0.02, so the wrapping clock never steps). Still under reduced
   * motion, where the clock stops.
   */
  readonly flutter?: { readonly axis: Axis; readonly amplitude: number; readonly rate: number; readonly phase: number };
}

/** A leg solved by IK: the thigh's joint pivots at the hip, the shin's at the knee. */
export interface CastLeg {
  readonly thigh: string;
  readonly shin: string;
  /** The foot's tip at rest, model units. */
  readonly foot: Vec3;
  /** Its step phase in a scuttle, radians. */
  readonly phase: number;
}

export interface JointedCastSpec {
  readonly joints: readonly CastJoint[];
  readonly legs?: readonly CastLeg[];
  /** How high a foot lifts while scuttling, model units (at full swim effort). */
  readonly stepHeight?: number;
  /** A fish's body bend: from the tail bone's sweep, along z from `front` to `root`. */
  readonly bend?: { readonly gain: number; readonly front: number; readonly root: number };
  /** A shader jaw: `uniforms.talk` = `gain` x the jaw bone's opening. */
  readonly jaw?: { readonly gain: number };
}

const BONE_INDEX = new Map<string, number>(NARRATOR_BONES.map((name, i) => [name, i]));

/**
 * A joint's Euler XYZ rotation (radians) from the pose, into `out` (summed drives). A drive naming
 * a bone outside the vocabulary is ignored, as is a non-finite channel.
 */
export function jointRotation(pose: RigPose, drives: readonly JointDrive[], out: [number, number, number]): void {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  for (const drive of drives) {
    const bone = BONE_INDEX.get(drive.bone);
    if (bone === undefined) continue;
    for (let k = 0; k < 3; k++) {
      const from = drive.from ? drive.from[k] : k;
      const v = pose.rot[bone * 3 + (from ?? k)] ?? 0;
      if (Number.isFinite(v)) out[k] = (out[k] ?? 0) + (drive.gain[k] ?? 0) * v;
    }
  }
}

/**
 * Two-segment IK in a leg's vertical plane. The hip is at the origin; `knee` and `foot` are the rest
 * positions (u along the ground, v up); `target` is where the foot should be. Returns how far the
 * thigh turns (radians, + is up) and the shin's turn relative to the thigh, keeping the knee on the
 * side it bends at rest. An unreachable target is clamped to the leg's reach.
 */
export function solveLeg(
  knee: readonly [number, number],
  foot: readonly [number, number],
  target: readonly [number, number],
  out: { thigh: number; shin: number }
): void {
  const a = Math.hypot(knee[0], knee[1]);
  const b = Math.hypot(foot[0] - knee[0], foot[1] - knee[1]);
  let tx = target[0];
  let ty = target[1];
  if (!(a > 0) || !(b > 0) || !Number.isFinite(tx) || !Number.isFinite(ty)) {
    out.thigh = 0;
    out.shin = 0;
    return;
  }
  let d = Math.hypot(tx, ty);
  const reach = clamp(d, Math.abs(a - b) + 1e-6, a + b - 1e-6);
  if (d < 1e-9) {
    tx = foot[0];
    ty = foot[1];
    d = Math.hypot(tx, ty);
  }
  tx = (tx / d) * reach;
  ty = (ty / d) * reach;
  // The knee bends to the side it is on at rest (above or below the hip-foot line).
  const bendSide = Math.sign(foot[0] * knee[1] - foot[1] * knee[0]) || 1;
  const along = Math.atan2(ty, tx);
  const spread = Math.acos(clamp((a * a + reach * reach - b * b) / (2 * a * reach), -1, 1));
  const kneeAngle = along + bendSide * spread;
  const kx = a * Math.cos(kneeAngle);
  const ky = a * Math.sin(kneeAngle);
  out.thigh = kneeAngle - Math.atan2(knee[1], knee[0]);
  out.shin = Math.atan2(ty - ky, tx - kx) - Math.atan2(foot[1] - knee[1], foot[0] - knee[0]) - out.thigh;
}

/** A cast built of jointed parts, ready to pose: the same shape as a skinned model (`RiggedNarrator`). */
export interface JointedNarrator {
  readonly object: Group;
  readonly spec: NarratorRigSpec;
  /** The parts' bounds at rest, model units. */
  readonly bounds: NarratorBounds;
  /** Moves the parts to `pose`. A pose with a non-finite number is skipped. */
  apply(pose: RigPose): void;
  /** Releases the part geometries and the material (both are this narrator's own). */
  dispose(): void;
}

interface LegSolve {
  readonly thigh: Group;
  readonly shin: Group;
  readonly axis: Vector3;
  readonly knee: readonly [number, number];
  readonly foot: readonly [number, number];
  readonly phase: number;
}

const rotation: [number, number, number] = [0, 0, 0];
const legAngles = { thigh: 0, shin: 0 };
const targetUV: [number, number] = [0, 0];
const turn = new Quaternion();

/**
 * Builds the jointed narrator from `parts` (builder part id -> geometry, model space) on `joints`,
 * all sharing `material`. Joints are given parents first. Takes ownership of the geometries and
 * the material. `uniforms` carry the shader bend and jaw, and the clock and swim effort a scuttle
 * steps to.
 */
export function buildJointedNarrator(
  cast: JointedCastSpec,
  rig: NarratorRigSpec,
  parts: ReadonlyMap<number, BufferGeometry>,
  material: Material,
  uniforms: NarratorUniforms
): JointedNarrator {
  // Bounds of everything at rest.
  const box = new Box3();
  for (const geometry of parts.values()) {
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (geometry.boundingBox) box.union(geometry.boundingBox);
  }
  const height = Math.max(1e-6, box.max.y - box.min.y);
  const bounds: NarratorBounds = {
    centreX: (box.min.x + box.max.x) / 2,
    centreZ: (box.min.z + box.max.z) / 2,
    minY: box.min.y,
    height,
    width: box.max.x - box.min.x,
    depth: box.max.z - box.min.z,
  };

  // root (offset, squash about the feet) > base (back to the model's origin) > joints.
  const root = new Group();
  root.name = 'jointed-narrator';
  const base = new Group();
  base.position.y = -bounds.minY;
  root.add(base);
  const groups = new Map<string, Group>();
  const pivots = new Map<string, Vec3>();
  const posed: { group: Group; joint: CastJoint; rest: Vector3 }[] = [];
  for (const joint of cast.joints) {
    const group = new Group();
    group.name = joint.name;
    const parentPivot = joint.parent ? pivots.get(joint.parent) : undefined;
    const parent = joint.parent ? groups.get(joint.parent) : base;
    if (!parent) throw new Error(`Jointed narrator: joint ${joint.name} comes before its parent ${joint.parent}.`);
    group.position.set(
      joint.pivot[0] - (parentPivot?.[0] ?? 0),
      joint.pivot[1] - (parentPivot?.[1] ?? 0),
      joint.pivot[2] - (parentPivot?.[2] ?? 0)
    );
    parent.add(group);
    for (const id of joint.parts) {
      const geometry = parts.get(id);
      if (!geometry) continue;
      const mesh = new Mesh(geometry, material);
      mesh.position.set(-joint.pivot[0], -joint.pivot[1], -joint.pivot[2]);
      group.add(mesh);
    }
    groups.set(joint.name, group);
    pivots.set(joint.name, joint.pivot);
    posed.push({ group, joint, rest: group.position.clone() });
  }
  root.position.y = bounds.minY;

  const legs: LegSolve[] = [];
  for (const leg of cast.legs ?? []) {
    const thigh = groups.get(leg.thigh);
    const shin = groups.get(leg.shin);
    const hip = pivots.get(leg.thigh);
    const knee = pivots.get(leg.shin);
    if (!thigh || !shin || !hip || !knee) continue;
    const dx = leg.foot[0] - hip[0];
    const dz = leg.foot[2] - hip[2];
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    // In the leg's plane: u along the ground toward the foot, v up. Turning +u toward +v is a
    // rotation about u x up.
    const uv = (p: Vec3): [number, number] => [(p[0] - hip[0]) * ux + (p[2] - hip[2]) * uz, p[1] - hip[1]];
    legs.push({ thigh, shin, axis: new Vector3(-uz, 0, ux), knee: uv(knee), foot: uv(leg.foot), phase: leg.phase });
  }

  const bendGain = cast.bend?.gain ?? 0;
  const bendLength = cast.bend ? Math.abs(cast.bend.front - cast.bend.root) || 1 : 1;
  const tailBone = BONE_INDEX.get('tail') ?? 0;
  const jawBone = BONE_INDEX.get('jaw') ?? 0;
  const stepHeight = cast.stepHeight ?? 0;
  const restRootY = root.position.y;

  return {
    object: root,
    spec: rig,
    bounds,
    apply(pose: RigPose) {
      if (!rigPoseFinite(pose)) return;
      root.position.set(pose.offsetX * height, restRootY + pose.offsetY * height, pose.offsetZ * height);
      const xz = 1 / Math.sqrt(pose.squash);
      root.scale.set(xz, pose.squash, xz);

      // The fish's bend: the tail root moves across by `bend`, and the body's slope there is the
      // angle the tail fin turns from.
      const sweep = clamp(bendGain * (pose.rot[tailBone * 3 + 1] ?? 0), -1.2, 1.2);
      const bend = (-bendLength * Math.tan(sweep)) / 2;
      uniforms.bend.value = bend;
      if (cast.jaw) uniforms.talk.value = clamp(cast.jaw.gain * (pose.rot[jawBone * 3] ?? 0), 0, 1.5);

      for (const { group, joint, rest } of posed) {
        jointRotation(pose, joint.drives, rotation);
        const flutter = joint.flutter;
        if (flutter) rotation[flutter.axis] += flutter.amplitude * Math.sin(uniforms.time.value * flutter.rate + flutter.phase);
        group.rotation.set(rotation[0], rotation[1], rotation[2], 'XYZ');
        group.position.copy(rest);
        if (joint.dropsWithHips) group.position.y += pose.hipsY * height;
        if (joint.onBend) {
          group.position.x += bend;
          group.rotation.y += sweep;
        }
        if (joint.stretch) {
          const bone = BONE_INDEX.get(joint.stretch.bone);
          const v = bone === undefined ? 0 : (pose.rot[bone * 3 + joint.stretch.axis] ?? 0);
          const k = joint.stretch.gain * (Number.isFinite(v) ? v : 0);
          const [ax, ay, az] = joint.stretch.along;
          group.scale.set(Math.max(0.05, 1 + k * ax), Math.max(0.05, 1 + k * ay), Math.max(0.05, 1 + k * az));
        }
      }

      // Legs: the feet stay put as the hips drop, and step in turn while it scuttles.
      const drop = -pose.hipsY * height;
      const effort = clamp((uniforms.swim.value - 0.35) / 0.65, 0, 1);
      const time = uniforms.time.value;
      for (const leg of legs) {
        const lift = stepHeight * effort * Math.max(0, Math.sin(time * 14 + leg.phase));
        targetUV[0] = leg.foot[0];
        targetUV[1] = leg.foot[1] + drop + lift;
        solveLeg(leg.knee, leg.foot, targetUV, legAngles);
        leg.thigh.quaternion.multiply(turn.setFromAxisAngle(leg.axis, legAngles.thigh));
        leg.shin.quaternion.multiply(turn.setFromAxisAngle(leg.axis, legAngles.shin));
      }
    },
    dispose() {
      for (const geometry of parts.values()) geometry.dispose();
      material.dispose();
    },
  };
}
