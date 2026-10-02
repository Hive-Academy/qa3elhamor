import { PATRICK_STYLE, SPONGEBOB_STYLE, type ClipStyle } from './narrator-clip-style.js';
import type { NarratorMotionTuning } from './narrator-motion.js';
import type { Vec3 } from './world-space.js';

/*
 * A narrator's rig, as data: the bones every rigged narrator has, a pose (what the clips write
 * and the shell copies onto the bones), and a per-model spec (where the joints sit, which bone
 * owns which part of the mesh, the rest pose). Pure and allocation-free per frame.
 *
 * The bones are one fixed set, so the clips address them by index and a new character is a data
 * addition (a `NarratorRigSpec`), not new clip code. Every bone's bind orientation is the
 * identity (world axes, the model's T-pose), and a pose is Euler XYZ rotations per bone, so
 * three.js applies z first (raising or lowering an arm), then y (swinging it forward), then x.
 */

/** The bones, in hierarchy order (a parent comes before its children). */
export const NARRATOR_BONES = [
  'root',
  'hips',
  'chest',
  'head',
  'shoulder.L',
  'elbow.L',
  'hand.L',
  'shoulder.R',
  'elbow.R',
  'hand.R',
  'hip.L',
  'knee.L',
  'hip.R',
  'knee.R',
  // The extras: a character without the part leaves them unused (a skinned model gives them no
  // capsule; a jointed cast maps only the ones it has).
  'jaw',
  'tail',
  'eye.L',
  'eye.R',
] as const;

export type NarratorBoneName = (typeof NARRATOR_BONES)[number];

/** The bones every character has a joint for. */
export type NarratorCoreBoneName = Exclude<NarratorBoneName, NarratorExtraBoneName>;
/** The optional bones: a jaw, a tail, eye stalks. */
export type NarratorExtraBoneName = 'jaw' | 'tail' | 'eye.L' | 'eye.R';

export const BONE_COUNT = NARRATOR_BONES.length;

/** Index of each bone (`NARRATOR_BONES`). */
export const BONE = {
  root: 0,
  hips: 1,
  chest: 2,
  head: 3,
  shoulderL: 4,
  elbowL: 5,
  handL: 6,
  shoulderR: 7,
  elbowR: 8,
  handR: 9,
  hipL: 10,
  kneeL: 11,
  hipR: 12,
  kneeR: 13,
  jaw: 14,
  tail: 15,
  eyeL: 16,
  eyeR: 17,
} as const;

/** Each bone's parent index (-1 for the root). */
export const BONE_PARENT: readonly number[] = [-1, 0, 1, 2, 3, 4, 5, 3, 7, 8, 1, 10, 1, 12, 3, 1, 3, 3];

/**
 * A pose: what the clips write and the shell copies onto the bones. Rotations are Euler XYZ,
 * radians, relative to the bind pose (identity). Offsets are fractions of the model's height.
 */
export interface RigPose {
  /** `BONE_COUNT * 3`: x, y, z per bone. */
  readonly rot: Float64Array;
  /** The whole body's offset from its post (a hop), x height. */
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  /** The hips' drop (a crouch), x height: negative is lower. */
  hipsY: number;
  /** Vertical scale of the whole body about its feet; x and z keep the volume. */
  squash: number;
}

export const createRigPose = (): RigPose => ({
  rot: new Float64Array(BONE_COUNT * 3),
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
  hipsY: 0,
  squash: 1,
});

export function copyRigPose(from: RigPose, to: RigPose): void {
  to.rot.set(from.rot);
  to.offsetX = from.offsetX;
  to.offsetY = from.offsetY;
  to.offsetZ = from.offsetZ;
  to.hipsY = from.hipsY;
  to.squash = from.squash;
}

/** `out` moves `w` (0..1) of the way from itself toward `target`. */
export function blendRigPose(out: RigPose, target: RigPose, w: number): void {
  if (!(w > 0)) return;
  const k = w >= 1 ? 1 : w;
  const a = out.rot;
  const b = target.rot;
  for (let i = 0; i < a.length; i++) a[i] = (a[i] ?? 0) + ((b[i] ?? 0) - (a[i] ?? 0)) * k;
  out.offsetX += (target.offsetX - out.offsetX) * k;
  out.offsetY += (target.offsetY - out.offsetY) * k;
  out.offsetZ += (target.offsetZ - out.offsetZ) * k;
  out.hipsY += (target.hipsY - out.hipsY) * k;
  out.squash += (target.squash - out.squash) * k;
}

/** Whether every number in the pose is finite (the shell skips a corrupt pose). */
export function rigPoseFinite(pose: RigPose): boolean {
  for (const v of pose.rot) if (!Number.isFinite(v)) return false;
  return (
    Number.isFinite(pose.offsetX) &&
    Number.isFinite(pose.offsetY) &&
    Number.isFinite(pose.offsetZ) &&
    Number.isFinite(pose.hipsY) &&
    Number.isFinite(pose.squash) &&
    pose.squash > 0
  );
}

export function setBone(pose: RigPose, bone: number, x: number, y: number, z: number): void {
  pose.rot[bone * 3] = x;
  pose.rot[bone * 3 + 1] = y;
  pose.rot[bone * 3 + 2] = z;
}

export function addBone(pose: RigPose, bone: number, x: number, y: number, z: number): void {
  pose.rot[bone * 3] = (pose.rot[bone * 3] ?? 0) + x;
  pose.rot[bone * 3 + 1] = (pose.rot[bone * 3 + 1] ?? 0) + y;
  pose.rot[bone * 3 + 2] = (pose.rot[bone * 3 + 2] ?? 0) + z;
}

/** A side of the body: +1 is the model's +x side (the character's left), -1 its right. */
export type Side = 1 | -1;

/** The character's left arm is on +x (it faces +z), its right on -x. */
export const LEFT: Side = 1;
export const RIGHT: Side = -1;

/**
 * An arm's rotation in side-neutral terms, added to `pose`. `lift` raises it in the body's plane
 * (radians up; applied first). `swing` turns it about the shoulders' left-right axis (applied
 * last): a lowered arm swings forward (+z) like a pendulum. `reach` turns it about the vertical:
 * a level arm comes round to the front. The two sides mirror each other across the body's middle
 * (x -> -x), which flips the sign of the y and z rotations.
 */
export function addArm(pose: RigPose, side: Side, lift: number, swing: number, reach = 0): void {
  addBone(pose, side === LEFT ? BONE.shoulderL : BONE.shoulderR, -swing, -reach * side, lift * side);
}

/**
 * An elbow, side-neutral, added to `pose`: `bend` folds the forearm toward the front (+z, in the
 * arm's own frame), `curl` folds it up, in the plane the arm was raised in.
 */
export function addElbow(pose: RigPose, side: Side, bend: number, curl = 0): void {
  addBone(pose, side === LEFT ? BONE.elbowL : BONE.elbowR, 0, -bend * side, curl * side);
}

/**
 * Moves an arm `w` (0..1) of the way from where it is to an absolute shoulder and elbow pose
 * (side-neutral, as `addArm` / `addElbow` but from the T-pose, not added): for a gesture that
 * must land in one place whatever the rest pose and idle did, like a raised, waving arm.
 */
export function mixArm(
  pose: RigPose,
  side: Side,
  w: number,
  arm: { readonly lift: number; readonly swing: number; readonly reach: number },
  elbow: { readonly bend: number; readonly curl: number },
  /** Added to `arm.lift`: the bind's droop (`RigRest.armBind`), so the pose is aimed from horizontal. */
  liftBy = 0
): void {
  const k = w <= 0 ? 0 : w >= 1 ? 1 : w;
  if (k === 0) return;
  const mix = (bone: number, x: number, y: number, z: number): void => {
    const r = pose.rot;
    r[bone * 3] = (r[bone * 3] ?? 0) + (x - (r[bone * 3] ?? 0)) * k;
    r[bone * 3 + 1] = (r[bone * 3 + 1] ?? 0) + (y - (r[bone * 3 + 1] ?? 0)) * k;
    r[bone * 3 + 2] = (r[bone * 3 + 2] ?? 0) + (z - (r[bone * 3 + 2] ?? 0)) * k;
  };
  mix(side === LEFT ? BONE.shoulderL : BONE.shoulderR, -arm.swing, -arm.reach * side, (arm.lift + liftBy) * side);
  mix(side === LEFT ? BONE.elbowL : BONE.elbowR, 0, -elbow.bend * side, elbow.curl * side);
}

/** A hand, side-neutral, added to `pose`: `flex` tips it up (like the elbow's curl). */
export function addHand(pose: RigPose, side: Side, flex: number, twist = 0): void {
  addBone(pose, side === LEFT ? BONE.handL : BONE.handR, twist, 0, flex * side);
}

// ---------------------------------------------------------------------------------------------
// The per-model spec

/** A capsule of the mesh a bone owns: points near its segment follow that bone. */
export interface RigCapsule {
  readonly bone: NarratorBoneName;
  /** Segment ends, x height, from the model's base centre (+x its left, +y up, +z its front). */
  readonly from: Vec3;
  readonly to: Vec3;
  /** Radius, x height: how far the bone's influence reaches before it falls off. */
  readonly radius: number;
}

/** The rest pose's arms (radians): lowered from the T-pose, clear of the body. */
export interface RigRest {
  /** How far the arms come down from horizontal (positive is down). */
  readonly armDown: number;
  /** How far they swing forward. */
  readonly armForward: number;
  /** How far the elbows bend forward. */
  readonly elbowBend: number;
  /**
   * How far the bound (T-pose) arms already hang below horizontal, radians (default 0). A clip that
   * puts an arm somewhere absolute (a wave, hands on hips) aims from horizontal, so a model whose
   * arms are modelled drooping (Patrick's star points) lifts them that much further.
   */
  readonly armBind?: number;
}

/** A rigged character: one bundled model's data. */
export interface NarratorRigSpec {
  /** Names the spec in caches (weights are computed once per model geometry and spec). */
  readonly id: string;
  /** The height the numbers below were measured against, model units (documentation only). */
  readonly measuredHeight: number;
  /**
   * Each bone's pivot, x height, from the model's base centre. The extras (jaw, tail, eye stalks)
   * are optional: one left out sits on its parent's pivot.
   */
  readonly joints: Readonly<Record<NarratorCoreBoneName, Vec3>> & Readonly<Partial<Record<NarratorExtraBoneName, Vec3>>>;
  /** Which bone owns which part of the mesh. A bone may have several; the root may have none. */
  readonly capsules: readonly RigCapsule[];
  /** Weight falloff: `exp(-falloff * (distance / radius)^2)`. Higher is crisper. */
  readonly falloff: number;
  readonly rest: RigRest;
  /** Overrides for the body-level motion (`stepNarrator`) once the clips carry the gestures. */
  readonly motion?: Partial<NarratorMotionTuning>;
  /** How it plays the clips (tempo, amplitudes, fidgets, hop or swim). Omitted: SpongeBob's. */
  readonly style?: ClipStyle;
}

/** The pivot of `bone` in `spec`, x height: an extra left out sits on its parent's. */
export function jointOf(spec: NarratorRigSpec, bone: number): Vec3 {
  for (let at = bone; at >= 0; at = BONE_PARENT[at] ?? -1) {
    const name = NARRATOR_BONES[at];
    const joint = name ? (spec.joints as Readonly<Partial<Record<NarratorBoneName, Vec3>>>)[name] : undefined;
    if (joint) return joint;
  }
  return [0, 0, 0];
}

/** The rest pose (arms lowered, everything else as bound) for `rest`, into `out`. */
export function writeRestPose(rest: RigRest, out: RigPose): void {
  out.rot.fill(0);
  out.offsetX = 0;
  out.offsetY = 0;
  out.offsetZ = 0;
  out.hipsY = 0;
  out.squash = 1;
  for (const side of [LEFT, RIGHT] as const) {
    addArm(out, side, -rest.armDown, rest.armForward);
    addElbow(out, side, rest.elbowBend);
  }
}

// ---------------------------------------------------------------------------------------------
// Leg IK

/**
 * Bends a two-segment leg so its ankle stays straight below the hip while the hip drops by
 * `drop`: the hip's forward swing and the knee's bend (both radians, positive). Lengths in any
 * one unit. A drop of 0 (or less) is a straight leg; a drop the leg cannot reach is clamped.
 */
export function legBend(thigh: number, shin: number, drop: number): { readonly hip: number; readonly knee: number } {
  if (!(thigh > 0) || !(shin > 0) || !(drop > 0) || !Number.isFinite(drop)) return { hip: 0, knee: 0 };
  const reach = Math.max(Math.abs(thigh - shin) + 1e-6, thigh + shin - drop);
  const cosHip = (thigh * thigh + reach * reach - shin * shin) / (2 * thigh * reach);
  const cosKnee = (thigh * thigh + shin * shin - reach * reach) / (2 * thigh * shin);
  const hip = Math.acos(Math.min(1, Math.max(-1, cosHip)));
  const knee = Math.PI - Math.acos(Math.min(1, Math.max(-1, cosKnee)));
  return { hip, knee };
}

const distance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Thigh and shin lengths of `spec`, x height (hip to knee, knee to the knee capsule's end). */
export function legLengths(spec: NarratorRigSpec): { readonly thigh: number; readonly shin: number } {
  const thigh = distance(spec.joints['hip.L'], spec.joints['knee.L']);
  const shinCapsule = spec.capsules.find((c) => c.bone === 'knee.L');
  const shin = shinCapsule ? distance(shinCapsule.from, shinCapsule.to) : thigh;
  return { thigh, shin };
}

/** Crouches `pose` by `drop` (x height): the hips go down and both legs bend to keep the feet put. */
export function addCrouch(pose: RigPose, legs: { readonly thigh: number; readonly shin: number }, drop: number): void {
  if (!(drop > 0)) return;
  const { hip, knee } = legBend(legs.thigh, legs.shin, drop);
  pose.hipsY -= drop;
  addBone(pose, BONE.hipL, -hip, 0, 0);
  addBone(pose, BONE.hipR, -hip, 0, 0);
  addBone(pose, BONE.kneeL, knee, 0, 0);
  addBone(pose, BONE.kneeR, knee, 0, 0);
}

// ---------------------------------------------------------------------------------------------
// SpongeBob

/** The decimated SpongeBob LOD's height (`spongebob-narrator`, standing height in the manifest). */
const SB = 10.033;
/** A point measured on the SpongeBob LOD (model units), as fractions of its height. */
const sb = (x: number, y: number, z: number): Vec3 => [x / SB, y / SB, z / SB];

/**
 * SpongeBob (`spongebob-narrator.glb`), measured on the decimated LOD (T-pose, facing +z, feet
 * on y = 0, centred on x = 0): a rigid sponge box (y 4.1..10, |x| up to 2.8 at arm height, 3.3
 * at the top) with the face, nose and eyelashes on it; a shirt and belt under it (y 3.2..4.3);
 * pants (y 2.2..3.6); stick legs at x +-1.22 (rings every ~0.3 down to the socks and shoes);
 * horizontal arms at y 5.1, z -0.2: a sleeve (x 2.7..4.0), a bare tube with rings only at its
 * ends (x 3.3 and 5.1) and a glove (x 5.1..6.4).
 *
 * The box is one bone (`head`), so the face never shears; the shoulders hang off it at the
 * box's edge (x 3.0), so lowered arms clear the box (`rest`, checked in the spec).
 */
export const SPONGEBOB_RIG: NarratorRigSpec = {
  id: 'spongebob',
  measuredHeight: SB,
  joints: {
    root: [0, 0, 0],
    hips: sb(0, 2.75, -0.15),
    chest: sb(0, 3.45, -0.15),
    head: sb(0, 4.3, -0.2),
    'shoulder.L': sb(3.0, 5.1, -0.2),
    'elbow.L': sb(4.25, 5.1, -0.2),
    'hand.L': sb(5.15, 5.1, -0.2),
    'shoulder.R': sb(-3.0, 5.1, -0.2),
    'elbow.R': sb(-4.25, 5.1, -0.2),
    'hand.R': sb(-5.15, 5.1, -0.2),
    'hip.L': sb(1.22, 2.55, -0.2),
    'knee.L': sb(1.22, 1.4, -0.3),
    'hip.R': sb(-1.22, 2.55, -0.2),
    'knee.R': sb(-1.22, 1.4, -0.3),
  },
  capsules: [
    // The sponge box, the face and everything on it.
    { bone: 'head', from: sb(0, 4.7, -0.5), to: sb(0, 9.6, -0.5), radius: 3.3 / SB },
    // Shirt, belt, tie.
    { bone: 'chest', from: sb(-2.3, 3.8, -0.1), to: sb(2.3, 3.8, -0.1), radius: 0.75 / SB },
    // Pants.
    { bone: 'hips', from: sb(-1.6, 2.85, -0.1), to: sb(1.6, 2.85, -0.1), radius: 0.85 / SB },
    // Arms: sleeve and upper tube, forearm (the tube's far ring), glove.
    { bone: 'shoulder.L', from: sb(2.85, 5.1, -0.2), to: sb(4.25, 5.1, -0.2), radius: 0.6 / SB },
    { bone: 'elbow.L', from: sb(4.25, 5.1, -0.2), to: sb(5.15, 5.1, -0.2), radius: 0.45 / SB },
    { bone: 'hand.L', from: sb(5.15, 5.1, -0.2), to: sb(6.4, 5.1, -0.15), radius: 0.7 / SB },
    { bone: 'shoulder.R', from: sb(-2.85, 5.1, -0.2), to: sb(-4.25, 5.1, -0.2), radius: 0.6 / SB },
    { bone: 'elbow.R', from: sb(-4.25, 5.1, -0.2), to: sb(-5.15, 5.1, -0.2), radius: 0.45 / SB },
    { bone: 'hand.R', from: sb(-5.15, 5.1, -0.2), to: sb(-6.4, 5.1, -0.15), radius: 0.7 / SB },
    // Legs: thigh, shin (down to the ankle), shoe.
    { bone: 'hip.L', from: sb(1.22, 2.65, -0.2), to: sb(1.22, 1.4, -0.3), radius: 0.38 / SB },
    { bone: 'knee.L', from: sb(1.22, 1.4, -0.3), to: sb(1.22, 0.45, -0.3), radius: 0.38 / SB },
    { bone: 'knee.L', from: sb(1.21, 0.3, -0.5), to: sb(1.21, 0.3, 0.55), radius: 0.5 / SB },
    { bone: 'hip.R', from: sb(-1.22, 2.65, -0.2), to: sb(-1.22, 1.4, -0.3), radius: 0.38 / SB },
    { bone: 'knee.R', from: sb(-1.22, 1.4, -0.3), to: sb(-1.22, 0.45, -0.3), radius: 0.38 / SB },
    { bone: 'knee.R', from: sb(-1.21, 0.3, -0.5), to: sb(-1.21, 0.3, 0.55), radius: 0.5 / SB },
  ],
  falloff: 2.2,
  rest: { armDown: 1.15, armForward: 0.18, elbowBend: 0.3 },
  // The clips breathe, sway and gesture; the body-level squash, hop and bob stay small.
  motion: { bob: 0.012, sway: 0.02, talkStretch: 0.02, talkBounce: 0, enterSeconds: 2.1, exitSeconds: 1.6 },
  style: SPONGEBOB_STYLE,
};

// ---------------------------------------------------------------------------------------------
// Patrick

/** The decimated Patrick LOD's height (`patrick-narrator`, standing height in the manifest). */
const PS = 14.889;
/** A point measured on the Patrick LOD (model units), as fractions of its height. */
const ps = (x: number, y: number, z: number): Vec3 => [x / PS, y / PS, z / PS];

/**
 * Patrick (`patrick-narrator.glb`, one mesh, vertex colours), measured on the decimated LOD
 * (facing +z, feet on y = 0, centred on x = 0). A starfish: the top point is his head, with the
 * whole face on it (mouth y 7.5..9, eyes 9..11, brows 11.5) up to the tip at 14.9; the body is a
 * fat cone (widest y 4..5, z +-3.2) in green shorts (y 1..4.5); the side points are his arms,
 * fat cones drooping about 35 degrees from a broad base at |x| ~2.4 (y 3.5..8) to the tip at
 * (+-4.9, 4.5, -1.0), set a little behind his middle; the bottom points are two short legs, apart
 * below y 1.2 (centres at |x| 1.55) and joined by the shorts above.
 *
 * The head point is one rigid bone with the face (`head`), so the face never shears; the chest
 * owns the belly between it and the shorts. Each arm is three segments along its point
 * (shoulder at the base, elbow half way, hand at the tip), so a gesture bends the point rather
 * than swinging a stiff cone out of the body. The arms are bound drooping (`armBind`).
 */
export const PATRICK_RIG: NarratorRigSpec = {
  id: 'patrick',
  measuredHeight: PS,
  joints: {
    root: [0, 0, 0],
    hips: ps(0, 2.3, 0.1),
    chest: ps(0, 4.2, 0.1),
    head: ps(0, 7.4, 0.3),
    'shoulder.L': ps(2.3, 6.2, -0.6),
    'elbow.L': ps(3.6, 5.5, -0.9),
    'hand.L': ps(4.3, 4.85, -1.0),
    'shoulder.R': ps(-2.3, 6.2, -0.6),
    'elbow.R': ps(-3.6, 5.5, -0.9),
    'hand.R': ps(-4.3, 4.85, -1.0),
    'hip.L': ps(1.5, 2.0, 0.1),
    'knee.L': ps(1.55, 0.9, 0.1),
    'hip.R': ps(-1.5, 2.0, 0.1),
    'knee.R': ps(-1.55, 0.9, 0.1),
  },
  capsules: [
    // The head point, and the whole face on its front (mouth, eyes, brows), all one bone.
    { bone: 'head', from: ps(0, 9.0, 0.4), to: ps(0, 13.6, 0.3), radius: 2.3 / PS },
    { bone: 'head', from: ps(0, 7.9, 1.7), to: ps(0, 10.8, 1.5), radius: 1.7 / PS },
    { bone: 'head', from: ps(-1.6, 8.2, 1.5), to: ps(1.6, 8.2, 1.5), radius: 1.1 / PS },
    // The belly.
    { bone: 'chest', from: ps(0, 3.6, 0.1), to: ps(0, 6.2, 0.1), radius: 3.1 / PS },
    // The belly's sides under the arms, where the shorts meet them: they stay with the body.
    { bone: 'chest', from: ps(-2.7, 4.2, -0.4), to: ps(2.7, 4.2, -0.4), radius: 1.3 / PS },
    // The shorts.
    { bone: 'hips', from: ps(-1.4, 2.6, 0.1), to: ps(1.4, 2.6, 0.1), radius: 1.6 / PS },
    // Arms: the base of the point, its middle, its tip.
    { bone: 'shoulder.L', from: ps(2.9, 5.9, -0.7), to: ps(3.6, 5.5, -0.9), radius: 1.2 / PS },
    { bone: 'elbow.L', from: ps(3.6, 5.5, -0.9), to: ps(4.3, 4.85, -1.0), radius: 1.0 / PS },
    { bone: 'hand.L', from: ps(4.3, 4.85, -1.0), to: ps(4.85, 4.5, -1.05), radius: 0.7 / PS },
    { bone: 'shoulder.R', from: ps(-2.9, 5.9, -0.7), to: ps(-3.6, 5.5, -0.9), radius: 1.2 / PS },
    { bone: 'elbow.R', from: ps(-3.6, 5.5, -0.9), to: ps(-4.3, 4.85, -1.0), radius: 1.0 / PS },
    { bone: 'hand.R', from: ps(-4.3, 4.85, -1.0), to: ps(-4.85, 4.5, -1.05), radius: 0.7 / PS },
    // Legs: the shorts' leg and the leg below it.
    { bone: 'hip.L', from: ps(1.5, 2.0, 0.1), to: ps(1.55, 0.9, 0.1), radius: 1.1 / PS },
    { bone: 'knee.L', from: ps(1.55, 0.9, 0.1), to: ps(1.58, 0.1, 0.15), radius: 1.0 / PS },
    { bone: 'hip.R', from: ps(-1.5, 2.0, 0.1), to: ps(-1.55, 0.9, 0.1), radius: 1.1 / PS },
    { bone: 'knee.R', from: ps(-1.55, 0.9, 0.1), to: ps(-1.58, 0.1, 0.15), radius: 1.0 / PS },
  ],
  falloff: 3,
  rest: { armDown: 0, armForward: 0.05, elbowBend: 0.05, armBind: 0.6 },
  // Heavier than SpongeBob: slower in and out, the body-level motion smaller still.
  motion: { bob: 0.01, sway: 0.015, talkStretch: 0.015, talkBounce: 0, enterSeconds: 2.6, exitSeconds: 2 },
  style: PATRICK_STYLE,
};
