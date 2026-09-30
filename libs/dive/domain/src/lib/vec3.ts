/**
 * A point or direction in world units. The dive owns this type rather than importing the
 * world's: `scope:dive` may not depend on `scope:world`, and `apps/web` converts landmark
 * placements into these before it hands them to the dive.
 */
export type Vec3 = readonly [number, number, number];

/**
 * A caller-owned output buffer. Sampling functions write into one instead of returning a new
 * tuple, so a per-frame caller can reuse the same buffer and allocate nothing.
 */
export type MutableVec3 = [number, number, number];

export const isFiniteVec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every((c) => typeof c === 'number' && Number.isFinite(c));

export const distance = (a: Vec3, b: Vec3): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
