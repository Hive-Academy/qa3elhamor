import { Color } from 'three';
import type { LowPolyBuilder } from './low-poly-builder.js';
import type { Vec3 } from './world-space.js';

/**
 * Low-poly building blocks for the narrator cast (eyes, limbs, glasses), written onto a
 * `LowPolyBuilder`. Build-time only: they allocate freely and never run per frame.
 */

/** A face colour, or a function of the face's centre and outward direction. */
export type FacePaint = Color | ((centre: Vec3, outward: Vec3) => Color);

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const normalise = (v: Vec3): Vec3 => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

/** Two unit vectors perpendicular to `axis` and to each other. */
export function perpendiculars(axis: Vec3): readonly [Vec3, Vec3] {
  const n = normalise(axis);
  const helper: Vec3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalise(cross(helper, n));
  return [u, cross(n, u)];
}

const paint = (fill: FacePaint, centre: Vec3, outward: Vec3): Color =>
  fill instanceof Color ? fill : fill(centre, outward);

const centroid = (a: Vec3, b: Vec3, c: Vec3): Vec3 => [
  (a[0] + b[0] + c[0]) / 3,
  (a[1] + b[1] + c[1]) / 3,
  (a[2] + b[2] + c[2]) / 3,
];

/** An orthonormal frame: `x`, `y` and `z` axes (a rotation), applied to local offsets. */
export interface Frame {
  readonly x: Vec3;
  readonly y: Vec3;
  readonly z: Vec3;
}

export const IDENTITY_FRAME: Frame = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/** A frame whose +Z points along `forward`, +Y as close to `up` as possible. */
export function frameLooking(forward: Vec3, up: Vec3 = [0, 1, 0]): Frame {
  const z = normalise(forward);
  const x = normalise(cross(up, z));
  return { x, y: cross(z, x), z };
}

const inFrame = (f: Frame, v: Vec3): Vec3 => [
  f.x[0] * v[0] + f.y[0] * v[1] + f.z[0] * v[2],
  f.x[1] * v[0] + f.y[1] * v[1] + f.z[1] * v[2],
  f.x[2] * v[0] + f.y[2] * v[1] + f.z[2] * v[2],
];

/**
 * An ellipsoid of `rings` latitude bands and `segments` longitudes, poles on its local Y.
 * About `2 * segments * (rings - 1)` triangles.
 */
export function ellipsoid(
  builder: LowPolyBuilder,
  centre: Vec3,
  radii: Vec3,
  fill: FacePaint,
  rings = 4,
  segments = 8,
  frame: Frame = IDENTITY_FRAME
): void {
  const point = (i: number, j: number): Vec3 => {
    const phi = (i / rings) * Math.PI;
    const theta = (j / segments) * Math.PI * 2;
    const local: Vec3 = [
      radii[0] * Math.sin(phi) * Math.sin(theta),
      radii[1] * Math.cos(phi),
      radii[2] * Math.sin(phi) * Math.cos(theta),
    ];
    return add(centre, inFrame(frame, local));
  };
  const face = (a: Vec3, b: Vec3, c: Vec3): void => {
    const mid = centroid(a, b, c);
    builder.triangle(a, b, c, paint(fill, mid, normalise(sub(mid, centre))));
  };
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = point(i, j);
      const b = point(i + 1, j);
      const c = point(i + 1, j + 1);
      const d = point(i, j + 1);
      if (i === 0) face(a, b, c);
      else if (i === rings - 1) face(a, b, d);
      else {
        face(a, b, c);
        face(a, c, d);
      }
    }
  }
}

/** A tapered, capped tube from `a` (radius `ra`) to `b` (radius `rb`). */
export function tube(
  builder: LowPolyBuilder,
  a: Vec3,
  b: Vec3,
  ra: number,
  rb: number,
  fill: FacePaint,
  sides = 5,
  caps = true
): void {
  const axis = sub(b, a);
  const [u, v] = perpendiculars(axis);
  const at = (base: Vec3, r: number, k: number): Vec3 => {
    const angle = (k / sides) * Math.PI * 2;
    return add(base, add(scale(u, Math.cos(angle) * r), scale(v, Math.sin(angle) * r)));
  };
  const mid = lerp3(a, b, 0.5);
  for (let k = 0; k < sides; k++) {
    const a0 = at(a, ra, k);
    const a1 = at(a, ra, k + 1);
    const b0 = at(b, rb, k);
    const b1 = at(b, rb, k + 1);
    const centre = lerp3(lerp3(a0, b1, 0.5), lerp3(a1, b0, 0.5), 0.5);
    builder.quad(a0, a1, b1, b0, paint(fill, centre, normalise(sub(centre, mid))));
    if (caps) {
      const axisDir = normalise(axis);
      if (ra > 0) builder.triangle(a, a1, a0, paint(fill, a, scale(axisDir, -1)));
      if (rb > 0) builder.triangle(b, b0, b1, paint(fill, b, axisDir));
    }
  }
}

/** A flat ring (annulus) with a short outer band, facing along `normal`: glasses rims, a medal edge. */
export function ring(
  builder: LowPolyBuilder,
  centre: Vec3,
  normal: Vec3,
  radius: number,
  width: number,
  depth: number,
  fill: FacePaint,
  segments = 10
): void {
  const [u, v] = perpendiculars(normal);
  const n = normalise(normal);
  const at = (r: number, k: number, back: number): Vec3 => {
    const angle = (k / segments) * Math.PI * 2;
    return add(add(centre, scale(n, -back)), add(scale(u, Math.cos(angle) * r), scale(v, Math.sin(angle) * r)));
  };
  const inner = radius - width / 2;
  const outer = radius + width / 2;
  for (let k = 0; k < segments; k++) {
    const front = paint(fill, at(radius, k + 0.5, 0), n);
    builder.quad(at(inner, k, 0), at(outer, k, 0), at(outer, k + 1, 0), at(inner, k + 1, 0), front);
    if (depth > 0) {
      const side = paint(fill, at(outer, k + 0.5, depth / 2), normalise(sub(at(outer, k + 0.5, 0), centre)));
      builder.quad(at(outer, k, 0), at(outer, k, depth), at(outer, k + 1, depth), at(outer, k + 1, 0), side);
    }
  }
}

/** A flat filled disc (a fan) facing along `normal`, its centre raised `dome` toward the normal. */
export function disc(
  builder: LowPolyBuilder,
  centre: Vec3,
  normal: Vec3,
  radius: number,
  rim: Color,
  middle: Color = rim,
  dome = 0,
  segments = 6
): void {
  const [u, v] = perpendiculars(normal);
  const n = normalise(normal);
  const apex = add(centre, scale(n, dome));
  for (let k = 0; k < segments; k++) {
    const angle0 = (k / segments) * Math.PI * 2;
    const angle1 = ((k + 1) / segments) * Math.PI * 2;
    const p0 = add(centre, add(scale(u, Math.cos(angle0) * radius), scale(v, Math.sin(angle0) * radius)));
    const p1 = add(centre, add(scale(u, Math.cos(angle1) * radius), scale(v, Math.sin(angle1) * radius)));
    builder.triangle(p0, p1, apex, [rim, rim, middle]);
  }
}

/**
 * A cartoon eye: a white ball, a big dark pupil pushed toward `gaze`, and a highlight glint up
 * and to the side. Reads from the front and the side alike.
 */
export function cartoonEye(
  builder: LowPolyBuilder,
  centre: Vec3,
  radius: number,
  gaze: Vec3,
  colours: { readonly white: Color; readonly pupil: Color; readonly glint: Color },
  pupilShare = 0.62
): void {
  const g = normalise(gaze);
  ellipsoid(builder, centre, [radius, radius * 1.08, radius], colours.white, 4, 8);
  const pupilRadius = radius * pupilShare;
  const pupilCentre = add(centre, scale(g, radius - pupilRadius * 0.55));
  ellipsoid(builder, pupilCentre, [pupilRadius, pupilRadius * 1.1, pupilRadius], colours.pupil, 3, 6, frameLooking(g));
  const [side, up] = perpendiculars(g);
  const upward = up[1] >= 0 ? up : scale(up, -1);
  const glint = add(
    add(pupilCentre, scale(g, pupilRadius * 0.75)),
    add(scale(upward, pupilRadius * 0.4), scale(side, pupilRadius * 0.3))
  );
  ellipsoid(builder, glint, [radius * 0.17, radius * 0.17, radius * 0.17], colours.glint, 2, 4);
}

/** Hex colour to `Color`, for palettes. */
export const colour = (hex: string): Color => new Color(hex);
export const mixColour = (a: Color, b: Color, t: number): Color => a.clone().lerp(b, t);
