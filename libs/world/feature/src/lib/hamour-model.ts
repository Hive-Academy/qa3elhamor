import {
  BufferGeometry,
  Color,
  DoubleSide,
  MeshStandardMaterial,
  type IUniform,
} from 'three';
import { AMBIENT_TIME_UNIFORM } from './ambient-clock.js';
import { LowPolyBuilder } from './low-poly-builder.js';
import { HAMOUR_STYLE } from './narrator-clip-style.js';
import type { CastJoint, JointedCastSpec } from './narrator-jointed.js';
import type { NarratorRigSpec } from './narrator-rig.js';
import type { NarratorUniforms } from './narrator-uniforms.js';
import { seededRandom } from './seeded-random.js';
import { applyVertexMotion } from './vertex-motion.js';
import type { Vec3 } from './world-space.js';

/**
 * The Hamour: an original low-poly grouper authored in code for this project (no asset file,
 * no third-party likeness). Stout, deep body, big head with an underbite, spiny then soft
 * dorsal fin, rounded tail and fins; mottled brown and olive with pale spots.
 *
 * The geometry is 1 unit long, nose at +Z (z = 0.5 is the lower jaw tip), back at +Y; the
 * component scales it to its configured length. About 560 flat-coloured triangles.
 */
export const HAMOUR_PALETTE = {
  darkBrown: '#5a3f26',
  brown: '#7c5a36',
  olive: '#7a703c',
  tan: '#9c7f4e',
  spot: '#eadcb2',
  belly: '#c4ac7e',
  fin: '#5e4627',
  finEdge: '#b8995c',
  mouth: '#1a100a',
  eyeRing: '#e2b85a',
  pupil: '#0b0806',
} as const;

/** Body cross-sections from the nose (u = 0) to the tail root (u = 1). */
const PROFILE = {
  u: [0, 0.05, 0.12, 0.22, 0.34, 0.46, 0.58, 0.7, 0.8, 0.9, 1],
  /** Half height. */
  h: [0.042, 0.088, 0.128, 0.158, 0.168, 0.165, 0.15, 0.124, 0.093, 0.063, 0.048],
  /** Half width: groupers are a little compressed sideways. */
  w: [0.036, 0.076, 0.104, 0.116, 0.118, 0.113, 0.1, 0.082, 0.06, 0.04, 0.028],
  /** Centre line height: the back rises behind the head. */
  c: [-0.028, -0.014, 0, 0.01, 0.014, 0.014, 0.012, 0.01, 0.008, 0.006, 0.005],
} as const;

const NOSE_Z = 0.46;
const ROOT_Z = -0.28;
const SEGMENTS = 12;
const BELLY_FLATTEN = 0.88;

const zAt = (u: number): number => NOSE_Z + (ROOT_Z - NOSE_Z) * u;

function sampleProfile(u: number): { h: number; w: number; c: number } {
  const { u: us, h, w, c } = PROFILE;
  let i = 0;
  while (i < us.length - 2 && u > us[i + 1]) i++;
  const t = Math.min(1, Math.max(0, (u - us[i]) / (us[i + 1] - us[i])));
  const lerp = (a: readonly number[]): number => a[i] + (a[i + 1] - a[i]) * t;
  return { h: lerp(h), w: lerp(w), c: lerp(c) };
}

/** A point on the body surface at length fraction `u` and angle `theta` (0 = top, clockwise seen from the nose). */
function surface(u: number, theta: number): Vec3 {
  const { h, w, c } = sampleProfile(u);
  const cos = Math.cos(theta);
  const y = c + h * cos * (cos < 0 ? BELLY_FLATTEN : 1);
  let z = zAt(u);
  // The underbite: the lower jaw juts past the upper.
  if (cos < -0.3) z += u < 0.025 ? 0.05 : u < 0.08 ? 0.024 : 0;
  return [w * Math.sin(theta), y, z];
}

/** Outward unit normal of the body's elliptical cross-section at (u, theta). */
function surfaceNormal(u: number, theta: number): Vec3 {
  const { h, w } = sampleProfile(u);
  const nx = Math.sin(theta) / w;
  const ny = Math.cos(theta) / h;
  const length = Math.hypot(nx, ny);
  return [nx / length, ny / length, 0];
}

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalise = (v: Vec3): Vec3 => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

/**
 * A small hexagonal disc on the body at (u, theta), lifted `lift` off the surface along its
 * normal, with its centre raised a further `dome`: spots (flat) and eyes (domed, two rings).
 */
function disc(
  builder: LowPolyBuilder,
  u: number,
  theta: number,
  radius: number,
  lift: number,
  dome: number,
  rim: Color,
  centreColour: Color,
  innerShare = 0
): void {
  const base = surface(u, theta);
  const n = surfaceNormal(u, theta);
  const t1 = normalise(cross(n, [0, 0, 1]));
  const t2 = cross(n, t1);
  const at = (r: number, a: number, up: number): Vec3 => [
    base[0] + n[0] * up + (t1[0] * Math.cos(a) + t2[0] * Math.sin(a)) * r,
    base[1] + n[1] * up + (t1[1] * Math.cos(a) + t2[1] * Math.sin(a)) * r,
    base[2] + n[2] * up + (t1[2] * Math.cos(a) + t2[2] * Math.sin(a)) * r,
  ];
  const apex = at(0, 0, lift + dome);
  const SIDES = 6;
  for (let i = 0; i < SIDES; i++) {
    const a0 = (i / SIDES) * Math.PI * 2;
    const a1 = ((i + 1) / SIDES) * Math.PI * 2;
    if (innerShare > 0) {
      const ri = radius * innerShare;
      const upInner = lift + dome * 0.7;
      builder.quad(at(radius, a0, lift), at(radius, a1, lift), at(ri, a1, upInner), at(ri, a0, upInner), rim);
      builder.triangle(at(ri, a0, upInner), at(ri, a1, upInner), apex, centreColour);
    } else {
      builder.triangle(at(radius, a0, lift), at(radius, a1, lift), apex, [rim, rim, centreColour]);
    }
  }
}

const mix = (a: Color, b: Color, t: number): Color => a.clone().lerp(b, t);

export function createHamourGeometry(seed = 7): BufferGeometry {
  return buildHamour(seed, false).build();
}

/** Builder part ids of the jointed Hamour (`createHamourParts`). `L` is its left, +X. */
export const HAMOUR_PART = { body: 0, tail: 1, finL: 2, finR: 3 } as const;

/** The Hamour's parts, one geometry each (`HAMOUR_PART`), for the narrator's `HAMOUR_JOINTS`. */
export function createHamourParts(seed = 7): Map<number, BufferGeometry> {
  return buildHamour(seed, true).buildParts();
}

/** The Hamour's mesh; `jointed` marks the tail and pectoral fins as parts (the ambient fish has none). */
function buildHamour(seed: number, jointed: boolean): LowPolyBuilder {
  const random = seededRandom(seed);
  const pal = Object.fromEntries(
    Object.entries(HAMOUR_PALETTE).map(([key, hex]) => [key, new Color(hex)])
  ) as Record<keyof typeof HAMOUR_PALETTE, Color>;
  const builder = new LowPolyBuilder();
  const part = (id: number, draw: () => void): void => {
    if (jointed) builder.withPart(id, draw);
    else draw();
  };

  // Mottling: low-frequency blotches across the flanks (pale spots are separate discs).
  const bodyColour = (p: Vec3, rel: number): Color => {
    if (rel < -0.58) return mix(pal.belly, pal.tan, random() * 0.4);
    const [x, y, z] = p;
    // Low frequency (a blotch spans several faces) and close tones: mottled, not chequered.
    const m = Math.sin(z * 14 + y * 9) * Math.sin(z * 9 - y * 16 + 1.3) + 0.45 * Math.sin(z * 21 + Math.abs(x) * 12);
    const base = m > 0.45 ? mix(pal.darkBrown, pal.brown, 0.3) : m < -0.35 ? pal.olive : mix(pal.brown, pal.tan, 0.5 + 0.5 * m);
    return mix(rel > 0.6 ? mix(base, pal.darkBrown, 0.3) : base, pal.olive, random() * 0.15);
  };

  // --- Body: rings from nose to tail root, capped at the snout. ---
  const RINGS = PROFILE.u;
  const ring = (u: number): Vec3[] =>
    Array.from({ length: SEGMENTS }, (_, j) => surface(u, (j / SEGMENTS) * Math.PI * 2));
  const rings = RINGS.map(ring);

  for (let r = 0; r < rings.length - 1; r++) {
    const a = rings[r];
    const b = rings[r + 1];
    for (let j = 0; j < SEGMENTS; j++) {
      const k = (j + 1) % SEGMENTS;
      const theta = ((j + 0.5) / SEGMENTS) * Math.PI * 2;
      const rel = Math.cos(theta);
      const centre: Vec3 = [
        (a[j][0] + b[k][0]) / 2,
        (a[j][1] + b[k][1]) / 2,
        (a[j][2] + b[k][2]) / 2,
      ];
      // The wide mouth: a dark gape along the lower side of the head, back under the eye.
      const isMouth = r < 2 && (j === 3 || j === 8);
      const colour = isMouth ? pal.mouth : bodyColour(centre, rel);
      builder.quad(a[j], b[j], b[k], a[k], colour);
    }
  }

  // Snout cap: the upper lip meets at one point, the lower jaw at a lower, further one.
  const upperLip: Vec3 = [0, -0.02, NOSE_Z + 0.022];
  const jawTip: Vec3 = [0, -0.05, NOSE_Z + 0.045];
  const nose = rings[0];
  for (let j = 0; j < SEGMENTS; j++) {
    const k = (j + 1) % SEGMENTS;
    const lower = Math.cos(((j + 0.5) / SEGMENTS) * Math.PI * 2) < -0.1;
    builder.triangle(nose[k], nose[j], lower ? jawTip : upperLip, lower ? pal.tan : pal.brown);
  }
  // The gape between lip and jaw.
  builder.triangle(nose[3], upperLip, jawTip, pal.mouth);
  builder.triangle(nose[9], jawTip, upperLip, pal.mouth);

  // --- Eyes: a gold ring around a domed dark pupil, high on each side of the head. ---
  for (const side of [1, -1]) {
    disc(builder, 0.115, side * 0.9, 0.03, 0.004, 0.012, pal.eyeRing, pal.pupil, 0.55);
  }

  // --- Pale spots: small discs scattered over the flanks and back, none on the belly. ---
  const SPOTS = 44;
  for (let i = 0; i < SPOTS; i++) {
    const u = 0.16 + random() * 0.78;
    const theta = (random() * 2 - 1) * 2.1;
    if (u < 0.2 && Math.abs(Math.abs(theta) - 0.9) < 0.4) continue; // keep clear of the eye
    const colour = mix(pal.spot, pal.tan, random() * 0.3);
    disc(builder, u, theta, 0.011 + random() * 0.008, 0.002, 0, colour, colour);
  }

  // --- Fins (thin, rendered double-sided). ---
  const finColour = (t: number): Color => (random() > 0.75 ? mix(pal.spot, pal.fin, 0.5) : mix(pal.fin, pal.olive, t));

  // Dorsal: spiny front half (alternating spine tips), soft rounded rear.
  const DORSAL_FROM = 0.22;
  const DORSAL_TO = 0.88;
  const DORSAL_STEPS = 16;
  for (let i = 0; i < DORSAL_STEPS; i++) {
    const u0 = DORSAL_FROM + ((DORSAL_TO - DORSAL_FROM) * i) / DORSAL_STEPS;
    const u1 = DORSAL_FROM + ((DORSAL_TO - DORSAL_FROM) * (i + 1)) / DORSAL_STEPS;
    const height = (u: number, index: number): number =>
      u < 0.56
        ? (index % 2 === 0 ? 0.072 : 0.05) * Math.min(1, (u - DORSAL_FROM) / 0.08 + 0.3)
        : 0.085 * Math.sin(Math.PI * Math.min(1, (u - 0.5) / (DORSAL_TO - 0.5)));
    const b0 = surface(u0, 0);
    const b1 = surface(u1, 0);
    const t0: Vec3 = [0, b0[1] + height(u0, i), b0[2] - 0.025];
    const t1: Vec3 = [0, b1[1] + height(u1, i + 1), b1[2] - 0.025];
    builder.quad(b0, b1, t1, t0, finColour(0.3), mix(pal.finEdge, pal.fin, 0.4));
  }

  // Anal fin: soft, rounded, under the rear body.
  const ANAL_FROM = 0.6;
  const ANAL_TO = 0.88;
  for (let i = 0; i < 6; i++) {
    const u0 = ANAL_FROM + ((ANAL_TO - ANAL_FROM) * i) / 6;
    const u1 = ANAL_FROM + ((ANAL_TO - ANAL_FROM) * (i + 1)) / 6;
    const drop = (u: number): number => 0.065 * Math.sin((Math.PI * (u - ANAL_FROM)) / (ANAL_TO - ANAL_FROM));
    const b0 = surface(u0, Math.PI);
    const b1 = surface(u1, Math.PI);
    builder.quad(b1, b0, [0, b0[1] - drop(u0), b0[2] - 0.03], [0, b1[1] - drop(u1), b1[2] - 0.03], finColour(0.2));
  }

  // Tail: a rounded fan from the tail root.
  const root = surface(1, 0);
  const tailRoot: Vec3 = [0, root[1] - 0.048, ROOT_Z];
  const TAIL_STEPS = 10;
  const tailPoint = (i: number): Vec3 => {
    const a = (-75 + (150 * i) / TAIL_STEPS) * (Math.PI / 180);
    return [0, tailRoot[1] + 0.205 * Math.sin(a), ROOT_Z - 0.03 - 0.19 * Math.cos(a)];
  };
  part(HAMOUR_PART.tail, () => {
    for (let i = 0; i < TAIL_STEPS; i++) {
      const edge = i === 0 || i === TAIL_STEPS - 1 ? pal.finEdge : finColour(0.4);
      builder.triangle(tailRoot, tailPoint(i), tailPoint(i + 1), [pal.fin, edge, edge]);
    }
  });

  // Pectoral fins (rounded paddles behind the gills) and pelvic fins (small, below).
  const paddle = (base: Vec3, side: number, length: number, spread: number, droop: number): void => {
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const point = (k: number): Vec3 => {
        const phi = (-1 + (2 * k) / steps) * 0.9;
        return [
          base[0] + side * (0.025 + 0.02 * Math.cos(phi)),
          base[1] + Math.sin(phi) * spread - droop,
          base[2] - length * (0.45 + 0.55 * Math.cos(phi)),
        ];
      };
      builder.triangle(base, point(i), point(i + 1), [pal.fin, pal.finEdge, pal.finEdge]);
    }
  };
  for (const side of [1, -1]) {
    part(side > 0 ? HAMOUR_PART.finL : HAMOUR_PART.finR, () => paddle(surface(0.27, side * 1.85), side, 0.11, 0.055, 0.01));
    paddle(surface(0.31, side * 2.75), side, 0.07, 0.025, 0.035);
  }

  return builder;
}

/** Where the jointed Hamour's tail and pectoral fins pivot, model units. */
const HAMOUR_TAIL_ROOT: Vec3 = [0, surface(1, 0)[1] - 0.048, ROOT_Z];
const HAMOUR_FIN_ROOT = (side: 1 | -1): Vec3 => surface(0.27, side * 1.85);
/** The body bends behind this z (the head stays rigid), most at the tail root. */
const HAMOUR_BEND_FRONT = 0.2;

const finJoint = (side: 1 | -1): CastJoint => {
  const k = side > 0 ? 'L' : 'R';
  return {
    name: `fin.${k}`,
    parent: 'body',
    pivot: HAMOUR_FIN_ROOT(side),
    parts: [side > 0 ? HAMOUR_PART.finL : HAMOUR_PART.finR],
    // The fin points back along the flank: the "arm" lifting tips it up (about x) and flares it
    // out (about y); its swing tips it; the elbow's curl rocks it (a wave).
    drives: [
      { bone: `shoulder.${k}`, gain: [0.6 * side, -0.8, 0], from: [2, 2, 2] },
      { bone: `shoulder.${k}`, gain: [0.6, 0, 0] },
      { bone: `elbow.${k}`, gain: [0.35 * side, 0, 0], from: [2, 2, 2] },
    ],
    flutter: { axis: 1, amplitude: 0.12, rate: 6.4, phase: side > 0 ? 0 : 1.7 },
  };
};

/** The narrator Hamour's joints: body, tail fin on the bend, the two pectoral fins. */
export const HAMOUR_JOINTS: JointedCastSpec = {
  joints: [
    {
      name: 'body',
      parent: null,
      pivot: [0, 0, 0.05],
      parts: [HAMOUR_PART.body],
      drives: [
        { bone: 'hips', gain: [0.4, 1, 0.6] },
        { bone: 'chest', gain: [0.7, 0, 0.3] },
        { bone: 'head', gain: [0.5, 0.6, 0.3] },
      ],
    },
    { name: 'tail', parent: 'body', pivot: HAMOUR_TAIL_ROOT, parts: [HAMOUR_PART.tail], drives: [{ bone: 'tail', gain: [0, 0.6, 0] }], onBend: true },
    finJoint(1),
    finJoint(-1),
  ],
  bend: { gain: 0.5, front: HAMOUR_BEND_FRONT, root: ROOT_Z },
  jaw: { gain: 2.4 },
};

/** The Hamour's rig for the animator (a fish: no legs to crouch on, a tail and a jaw). */
export const HAMOUR_RIG: NarratorRigSpec = {
  id: 'hamour',
  measuredHeight: 0.42,
  joints: {
    root: [0, 0, 0],
    hips: [0, 0.5, 0],
    chest: [0, 0.5, 0.2],
    head: [0, 0.5, 0.6],
    'shoulder.L': [0.25, 0.4, 0.4],
    'elbow.L': [0.3, 0.4, 0.2],
    'hand.L': [0.32, 0.4, 0.1],
    'shoulder.R': [-0.25, 0.4, 0.4],
    'elbow.R': [-0.3, 0.4, 0.2],
    'hand.R': [-0.32, 0.4, 0.1],
    'hip.L': [0.1, 0.2, 0],
    'knee.L': [0.1, 0.1, 0],
    'hip.R': [-0.1, 0.2, 0],
    'knee.R': [-0.1, 0.1, 0],
  },
  capsules: [],
  falloff: 1,
  rest: { armDown: 0, armForward: 0, elbowBend: 0 },
  motion: { bob: 0.035, sway: 0.02, talkStretch: 0.03, talkBounce: 0.015 },
  style: HAMOUR_STYLE,
};

/**
 * The narrator Hamour's material: the presenter's warm lift, and in its vertex stage the body's
 * bend (`uniforms.bend`, from the tail bone) and the jaw (`uniforms.talk`, from the jaw bone, plus
 * a slow breath on its own clock).
 */
export function createHamourNarratorMaterial({ time, talk, bend }: NarratorUniforms): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.82,
    metalness: 0,
    side: DoubleSide,
    emissive: '#5a3a1c',
    emissiveIntensity: 0.75,
  });
  return applyVertexMotion(material, {
    uniforms: { [AMBIENT_TIME_UNIFORM]: time, uNarratorTalk: talk, uNarratorBend: bend },
    declarations: `uniform float ${AMBIENT_TIME_UNIFORM};\nuniform float uNarratorTalk;\nuniform float uNarratorBend;`,
    transform: /* glsl */ `
      float hamourRear = clamp( ( ${HAMOUR_BEND_FRONT.toFixed(3)} - position.z ) / ${(HAMOUR_BEND_FRONT - ROOT_Z).toFixed(3)}, 0.0, 1.0 );
      transformed.x += uNarratorBend * hamourRear * hamourRear;
      float hamourJaw = smoothstep( 0.38, 0.5, position.z ) * ( 1.0 - smoothstep( -0.05, -0.015, position.y ) );
      transformed.y -= ( ( 0.5 + 0.5 * sin( ${AMBIENT_TIME_UNIFORM} * 1.2 ) ) * 0.008 + uNarratorTalk * 0.05 ) * hamourJaw;
    `,
    cacheKey: 'narrator-hamour',
  });
}

export interface HamourMaterialOptions {
  /** Shared ambient clock (seconds). */
  readonly time: IUniform<number>;
  /** Swim effort 0..1+ (tail beat amplitude), written by the component per frame. */
  readonly swim: IUniform<number>;
  /** Talk beat 0..1 (opens the jaw), written by a narrator per frame. Omitted: the jaw only breathes. */
  readonly talk?: IUniform<number>;
}

/**
 * Standard material, flat-shaded and fogged. The vertex patch is the bone-free swim: a
 * travelling wave whose amplitude grows towards the tail, a slight counter-sway of the head,
 * and a slow jaw "breath".
 */
export function createHamourMaterial({ time, swim, talk = { value: 0 } }: HamourMaterialOptions): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.82,
    metalness: 0,
    side: DoubleSide,
    // A faint warm glow keeps the brown reading as brown under the blue light rig.
    emissive: '#3b2612',
    emissiveIntensity: 0.45,
  });
  return applyVertexMotion(material, {
    uniforms: { [AMBIENT_TIME_UNIFORM]: time, uHamourSwim: swim, uHamourTalk: talk },
    declarations: `uniform float ${AMBIENT_TIME_UNIFORM};\nuniform float uHamourSwim;\nuniform float uHamourTalk;`,
    transform: /* glsl */ `
      float hamourTail = 1.0 - smoothstep( -0.5, 0.3, position.z );
      float hamourBeat = ${AMBIENT_TIME_UNIFORM} * 3.2;
      transformed.x += sin( hamourBeat - position.z * 6.5 ) * 0.07 * hamourTail * hamourTail * uHamourSwim;
      transformed.x += sin( hamourBeat + 1.4 ) * 0.01 * uHamourSwim;
      float hamourJaw = smoothstep( 0.38, 0.5, position.z ) * ( 1.0 - smoothstep( -0.05, -0.015, position.y ) );
      transformed.y -= ( ( 0.5 + 0.5 * sin( ${AMBIENT_TIME_UNIFORM} * 1.2 ) ) * 0.012 + uHamourTalk * 0.045 ) * hamourJaw;
    `,
    cacheKey: 'ambient-hamour',
  });
}
