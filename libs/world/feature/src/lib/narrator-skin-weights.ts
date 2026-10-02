import { NARRATOR_BONES, type NarratorRigSpec } from './narrator-rig.js';

/*
 * Skin weights from positions alone: each bone owns capsules of the mesh (`NarratorRigSpec`),
 * and a vertex follows the bones whose capsules it is near, with a smooth falloff. Because the
 * weights are a function of the position only (snapped to a fine grid first), vertices that
 * coincide across primitives (a sleeve's edge on the arm, the collar on the box) always get the
 * same weights, so the mesh cannot open a crack where two materials meet. Pure: no three.js.
 */

/** Influences per vertex (three.js skins with four). */
export const MAX_INFLUENCES = 4;

/** A weight below this share of the vertex's strongest one is dropped. */
const MIN_SHARE = 0.02;

/** The grid positions snap to, x height, before weighting. */
const SNAP = 1e-4;

/** Where the model's spec coordinates start, and their unit, in the model's own space. */
export interface RigFrame {
  readonly originX: number;
  readonly originY: number;
  readonly originZ: number;
  /** Model units per spec unit: the model's measured height. */
  readonly height: number;
}

/** Capsules resolved to the model's units: flat arrays, one entry per capsule. */
export interface ResolvedCapsules {
  readonly count: number;
  readonly bone: Uint8Array;
  /** Segment start and direction (end - start), 3 per capsule. */
  readonly start: Float64Array;
  readonly axis: Float64Array;
  /** Squared length of `axis`. */
  readonly length2: Float64Array;
  readonly radius: Float64Array;
}

export function resolveCapsules(spec: NarratorRigSpec, frame: RigFrame): ResolvedCapsules {
  const count = spec.capsules.length;
  const bone = new Uint8Array(count);
  const start = new Float64Array(count * 3);
  const axis = new Float64Array(count * 3);
  const length2 = new Float64Array(count);
  const radius = new Float64Array(count);
  const origin = [frame.originX, frame.originY, frame.originZ] as const;
  spec.capsules.forEach((capsule, i) => {
    const index = NARRATOR_BONES.indexOf(capsule.bone);
    if (index < 0) throw new Error(`Rig ${spec.id}: unknown bone ${capsule.bone}`);
    bone[i] = index;
    let len2 = 0;
    for (let k = 0; k < 3; k++) {
      const a = origin[k] + (capsule.from[k] ?? 0) * frame.height;
      const b = origin[k] + (capsule.to[k] ?? 0) * frame.height;
      start[i * 3 + k] = a;
      axis[i * 3 + k] = b - a;
      len2 += (b - a) * (b - a);
    }
    length2[i] = len2;
    radius[i] = Math.max(1e-9, capsule.radius * frame.height);
  });
  return { count, bone, start, axis, length2, radius };
}

/** Squared distance from (x, y, z) to capsule `i`'s segment, over its squared radius. */
function scaledDistance2(c: ResolvedCapsules, i: number, x: number, y: number, z: number): number {
  const sx = c.start[i * 3] ?? 0;
  const sy = c.start[i * 3 + 1] ?? 0;
  const sz = c.start[i * 3 + 2] ?? 0;
  const ax = c.axis[i * 3] ?? 0;
  const ay = c.axis[i * 3 + 1] ?? 0;
  const az = c.axis[i * 3 + 2] ?? 0;
  const len2 = c.length2[i] ?? 0;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - sx) * ax + (y - sy) * ay + (z - sz) * az) / len2)) : 0;
  const dx = x - (sx + ax * t);
  const dy = y - (sy + ay * t);
  const dz = z - (sz + az * t);
  const r = c.radius[i] ?? 1;
  return (dx * dx + dy * dy + dz * dz) / (r * r);
}

export interface SkinWeights {
  /** `MAX_INFLUENCES` bone indices per vertex (unused slots 0, with weight 0). */
  readonly joints: Uint16Array;
  /** `MAX_INFLUENCES` weights per vertex, summing to 1. */
  readonly weights: Float32Array;
}

/**
 * Joints and weights for `positions` (x, y, z per vertex, in the model's space, the frame's
 * units). Every vertex gets at most `MAX_INFLUENCES` bones, strongest first, summing to 1. A
 * vertex with a non-finite coordinate follows the root alone.
 */
export function computeSkinWeights(
  positions: ArrayLike<number>,
  spec: NarratorRigSpec,
  frame: RigFrame
): SkinWeights {
  const capsules = resolveCapsules(spec, frame);
  const count = Math.floor(positions.length / 3);
  const joints = new Uint16Array(count * MAX_INFLUENCES);
  const weights = new Float32Array(count * MAX_INFLUENCES);
  const perBone = new Float64Array(NARRATOR_BONES.length);
  const nearest = new Float64Array(NARRATOR_BONES.length);
  const top = new Int32Array(MAX_INFLUENCES);
  const snap = SNAP * Math.abs(frame.height || 1);
  const falloff = spec.falloff > 0 ? spec.falloff : 1;

  for (let v = 0; v < count; v++) {
    const x = Math.round((positions[v * 3] ?? Number.NaN) / snap) * snap;
    const y = Math.round((positions[v * 3 + 1] ?? Number.NaN) / snap) * snap;
    const z = Math.round((positions[v * 3 + 2] ?? Number.NaN) / snap) * snap;
    const base = v * MAX_INFLUENCES;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || capsules.count === 0) {
      joints[base] = 0;
      weights[base] = 1;
      continue;
    }

    // Each bone's weight is its nearest capsule's.
    perBone.fill(0);
    nearest.fill(Number.POSITIVE_INFINITY);
    for (let i = 0; i < capsules.count; i++) {
      const bone = capsules.bone[i] ?? 0;
      const s2 = scaledDistance2(capsules, i, x, y, z);
      if (s2 < (nearest[bone] ?? Number.POSITIVE_INFINITY)) nearest[bone] = s2;
    }
    let strongest = 0;
    let closestBone = 0;
    for (let b = 0; b < perBone.length; b++) {
      const s2 = nearest[b] ?? Number.POSITIVE_INFINITY;
      if (s2 < (nearest[closestBone] ?? Number.POSITIVE_INFINITY)) closestBone = b;
      const w = Number.isFinite(s2) ? Math.exp(-falloff * s2) : 0;
      perBone[b] = w;
      if (w > strongest) strongest = w;
    }
    // Far from every capsule (the weights underflowed): the nearest bone takes it alone.
    if (!(strongest > 1e-300)) {
      joints[base] = closestBone;
      weights[base] = 1;
      continue;
    }

    // The strongest few, in a stable order (ties go to the lower bone index).
    top.fill(-1);
    for (let b = 0; b < perBone.length; b++) {
      const w = perBone[b] ?? 0;
      if (w < strongest * MIN_SHARE) continue;
      for (let slot = 0; slot < MAX_INFLUENCES; slot++) {
        const held = top[slot] ?? -1;
        if (held < 0 || w > (perBone[held] ?? 0)) {
          for (let k = MAX_INFLUENCES - 1; k > slot; k--) top[k] = top[k - 1] ?? -1;
          top[slot] = b;
          break;
        }
      }
    }
    let sum = 0;
    for (let slot = 0; slot < MAX_INFLUENCES; slot++) {
      const b = top[slot] ?? -1;
      if (b >= 0) sum += perBone[b] ?? 0;
    }
    for (let slot = 0; slot < MAX_INFLUENCES; slot++) {
      const b = top[slot] ?? -1;
      joints[base + slot] = b >= 0 ? b : 0;
      weights[base + slot] = b >= 0 ? (perBone[b] ?? 0) / sum : 0;
    }
  }
  return { joints, weights };
}

/** The bone with the largest weight on vertex `v`. */
export const dominantBone = (skin: SkinWeights, v: number): number => skin.joints[v * MAX_INFLUENCES] ?? 0;
