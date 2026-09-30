import type { HitTargetSpec, Vec3 } from '@qa3elhamor/landmarks-domain';
import { Box3, Matrix4, type Mesh, type Object3D } from 'three';

const isMesh = (object: Object3D): object is Mesh =>
  (object as Mesh).isMesh === true;

/**
 * The bounding box of `root` in its parent's space, i.e. the space the hit target and the
 * beacon sit in. Computed from geometry bounds, so it ignores wherever the parent happens to
 * be in the world (the scene-world scale, the landmark's position).
 */
export function localBounds(root: Object3D): Box3 {
  root.updateWorldMatrix(true, true);
  const toParent = root.parent
    ? root.parent.matrixWorld.clone().invert()
    : new Matrix4();
  const box = new Box3();
  const part = new Box3();
  const matrix = new Matrix4();
  root.traverse((object) => {
    if (!isMesh(object)) return;
    const { geometry } = object;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return;
    matrix.multiplyMatrices(toParent, object.matrixWorld);
    box.union(part.copy(geometry.boundingBox).applyMatrix4(matrix));
  });
  return box;
}

/** A concrete hit volume in the landmark's local space. */
export type HitShape =
  | { readonly kind: 'box'; readonly size: Vec3; readonly center: Vec3 }
  | { readonly kind: 'sphere'; readonly radius: number; readonly center: Vec3 };

/**
 * Used when a `bounds` target has no model to measure (it failed to load): big enough to
 * click in scene-world units (about 2 world units across at the default world scale).
 */
export const FALLBACK_HIT_RADIUS = 0.05;

/** Turns a hit target spec into a shape, measuring `bounds` when the spec asks for it. */
export function resolveHitShape(
  spec: HitTargetSpec,
  bounds: Box3 | null,
): HitShape {
  if (spec.kind === 'box')
    return {
      kind: 'box',
      size: spec.size,
      center: spec.center ?? [0, spec.size[1] / 2, 0],
    };
  if (spec.kind === 'sphere')
    return {
      kind: 'sphere',
      radius: spec.radius,
      center: spec.center ?? [0, spec.radius, 0],
    };
  if (!bounds || bounds.isEmpty()) {
    return {
      kind: 'sphere',
      radius: FALLBACK_HIT_RADIUS,
      center: [0, FALLBACK_HIT_RADIUS, 0],
    };
  }
  const pad = (spec.padding ?? 0) * 2;
  return {
    kind: 'box',
    size: [
      bounds.max.x - bounds.min.x + pad,
      bounds.max.y - bounds.min.y + pad,
      bounds.max.z - bounds.min.z + pad,
    ],
    center: [
      (bounds.min.x + bounds.max.x) / 2,
      (bounds.min.y + bounds.max.y) / 2,
      (bounds.min.z + bounds.max.z) / 2,
    ],
  };
}

/** The top of a hit shape, where the beacon floats. */
export const topOf = (shape: HitShape): number =>
  shape.kind === 'box'
    ? shape.center[1] + shape.size[1] / 2
    : shape.center[1] + shape.radius;
