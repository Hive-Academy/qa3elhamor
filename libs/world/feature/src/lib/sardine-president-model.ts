import type { BufferGeometry, Color, MeshStandardMaterial } from 'three';
import { LowPolyBuilder } from './low-poly-builder.js';
import { SARDINE_PRESIDENT_STYLE } from './narrator-clip-style.js';
import type { CastJoint, JointedCastSpec } from './narrator-jointed.js';
import { createNarratorMaterial } from './narrator-material.js';
import type { NarratorRigSpec } from './narrator-rig.js';
import { cartoonEye, colour, disc, mixColour, normalise, ring, tube } from './narrator-shapes.js';
import type { NarratorUniforms } from './narrator-uniforms.js';
import { seededRandom } from './seeded-random.js';
import type { Vec3 } from './world-space.js';

/**
 * The Sardine President: an original, small, chubby silver sardine with big forward-looking
 * eyes, stern little eyebrows, pink cheeks and a smile, wearing a red-white-black sash and a
 * tiny gold medal, and a grand moustache. A cartoon of office, not of any person.
 *
 * Authored nose at +Z, back at +Y, about 0.87 units long. Built of jointed parts
 * (`SARDINE_PART`, posed by `SARDINE_JOINTS`): the body, the tail, the two pectoral fins (his
 * "arms"), the moustache and the mouth.
 */
export const SARDINE_PALETTE = {
  backDark: '#2e5878',
  back: '#4f86ad',
  flank: '#d3dde6',
  shimmer: '#f1f5f8',
  belly: '#fbfcfd',
  spot: '#1f3348',
  fin: '#8db3cf',
  finEdge: '#d7e6f0',
  eyeWhite: '#fbfbf6',
  pupil: '#0d1117',
  glint: '#ffffff',
  brow: '#1d2a38',
  cheek: '#f2a0a6',
  mouth: '#3a1418',
  sashRed: '#c8102e',
  sashWhite: '#f6f6f2',
  sashBlack: '#1a1a1a',
  gold: '#e8b63c',
  goldDark: '#a8761f',
} as const;

/** Builder part ids. `L` is his left, +X (the medal's side). */
export const SARDINE_PART = { body: 0, tail: 1, finL: 2, finR: 3, moustache: 4, mouth: 5 } as const;

const PROFILE = {
  u: [0, 0.06, 0.14, 0.24, 0.36, 0.48, 0.6, 0.72, 0.82, 0.92, 1],
  h: [0.055, 0.115, 0.15, 0.165, 0.163, 0.15, 0.13, 0.102, 0.072, 0.046, 0.032],
  w: [0.048, 0.094, 0.115, 0.122, 0.116, 0.104, 0.088, 0.068, 0.048, 0.032, 0.024],
  c: [-0.012, -0.006, 0, 0.004, 0.006, 0.006, 0.005, 0.004, 0.003, 0.002, 0.002],
} as const;

const NOSE_Z = 0.4;
const ROOT_Z = -0.38;
const SEGMENTS = 12;

/** Pectoral fin pivots (x on the +X side; mirrored). */
const FIN_PIVOT = { x: 0.108, y: -0.07, z: 0.16 } as const;
/** The body bends behind this z (the head stays rigid). */
const BEND_FRONT = 0.15;
/** Where the moustache hangs from (under the nose) and the mouth opens (below it). */
const MOUSTACHE_ROOT: Vec3 = [0, 0.004, NOSE_Z + 0.04];
const MOUTH_AT: Vec3 = [0, -0.032, NOSE_Z + 0.03];

const zAt = (u: number): number => NOSE_Z + (ROOT_Z - NOSE_Z) * u;

function sampleProfile(u: number): { h: number; w: number; c: number } {
  const { u: us, h, w, c } = PROFILE;
  let i = 0;
  while (i < us.length - 2 && u > us[i + 1]) i++;
  const t = Math.min(1, Math.max(0, (u - us[i]) / (us[i + 1] - us[i])));
  const at = (a: readonly number[]): number => a[i] + (a[i + 1] - a[i]) * t;
  return { h: at(h), w: at(w), c: at(c) };
}

/** Body surface at length fraction `u` and angle `theta` (0 = top, +pi/2 = the +X flank). */
function surface(u: number, theta: number, lift = 0): Vec3 {
  const { h, w, c } = sampleProfile(u);
  const n = surfaceNormal(u, theta);
  return [w * Math.sin(theta) + n[0] * lift, c + h * Math.cos(theta) + n[1] * lift, zAt(u) + n[2] * lift];
}

function surfaceNormal(u: number, theta: number): Vec3 {
  const { h, w } = sampleProfile(u);
  return normalise([Math.sin(theta) / w, Math.cos(theta) / h, 0]);
}

/** The sash's centre line: a tilted ring, over the shoulder in front, under the belly behind. */
const sashU = (theta: number): number => 0.34 - 0.09 * Math.cos(theta);

/** The whole sardine as one geometry (a `part` attribute marks the parts). */
export function createSardinePresidentGeometry(seed = 11): BufferGeometry {
  return buildSardinePresident(seed).build();
}

/** The sardine's parts, one geometry each (`SARDINE_PART`), for `SARDINE_JOINTS`. */
export function createSardinePresidentParts(seed = 11): Map<number, BufferGeometry> {
  return buildSardinePresident(seed).buildParts();
}

function buildSardinePresident(seed: number): LowPolyBuilder {
  const random = seededRandom(seed);
  const pal = Object.fromEntries(Object.entries(SARDINE_PALETTE).map(([k, hex]) => [k, colour(hex)])) as Record<
    keyof typeof SARDINE_PALETTE,
    Color
  >;
  const builder = new LowPolyBuilder();

  const bodyColour = (rel: number): Color => {
    if (rel > 0.7) return mixColour(pal.backDark, pal.back, random() * 0.6);
    if (rel > 0.35) return mixColour(pal.back, pal.flank, 0.45 + random() * 0.2);
    if (rel > -0.45) return mixColour(pal.flank, pal.shimmer, random() * 0.6);
    return mixColour(pal.belly, pal.shimmer, random() * 0.4);
  };

  // --- Body loft. ---
  const rings = PROFILE.u.map((u) => Array.from({ length: SEGMENTS }, (_, j) => surface(u, (j / SEGMENTS) * Math.PI * 2)));
  for (let r = 0; r < rings.length - 1; r++) {
    for (let j = 0; j < SEGMENTS; j++) {
      const k = (j + 1) % SEGMENTS;
      const rel = Math.cos(((j + 0.5) / SEGMENTS) * Math.PI * 2);
      builder.quad(rings[r][j], rings[r + 1][j], rings[r + 1][k], rings[r][k], bodyColour(rel));
    }
  }
  const snout: Vec3 = [0, -0.012, NOSE_Z + 0.045];
  for (let j = 0; j < SEGMENTS; j++) {
    const k = (j + 1) % SEGMENTS;
    const rel = Math.cos(((j + 0.5) / SEGMENTS) * Math.PI * 2);
    builder.triangle(rings[0][k], rings[0][j], snout, bodyColour(rel));
  }

  // --- The sash: three stripes (red, white, black) round a tilted ring, lifted off the body. ---
  const SASH_STEPS = 24;
  const STRIPE = 0.034;
  const stripes = [pal.sashRed, pal.sashWhite, pal.sashBlack];
  for (let s = 0; s < 3; s++) {
    for (let i = 0; i < SASH_STEPS; i++) {
      const t0 = (i / SASH_STEPS) * Math.PI * 2;
      const t1 = ((i + 1) / SASH_STEPS) * Math.PI * 2;
      const edge = (theta: number, k: number): Vec3 => surface(sashU(theta) + (k - 1.5) * STRIPE, theta, 0.007);
      builder.quad(edge(t0, s), edge(t0, s + 1), edge(t1, s + 1), edge(t1, s), stripes[s]);
    }
  }

  // --- The medal: a domed gold disc with a darker rim, pinned on the sash on the +X flank. ---
  const medalTheta = 1.5;
  const medalU = sashU(medalTheta);
  const medalNormal = surfaceNormal(medalU, medalTheta);
  const medalAt = surface(medalU, medalTheta, 0.02);
  // A short ribbon from the sash's upper edge down to the medal.
  const ribbonTop = surface(medalU - 0.02, medalTheta - 0.42, 0.012);
  builder.triangle(ribbonTop, surface(medalU - 0.035, medalTheta - 0.05, 0.016), surface(medalU + 0.025, medalTheta - 0.08, 0.016), pal.sashRed);
  disc(builder, medalAt, medalNormal, 0.045, pal.goldDark, pal.gold, 0.016, 8);
  ring(builder, medalAt, medalNormal, 0.045, 0.012, 0.01, pal.goldDark, 8);
  // A little star-like boss in the middle.
  disc(builder, surface(medalU, medalTheta, 0.037), medalNormal, 0.016, pal.gold, colour('#fff1b8'), 0.006, 5);

  // --- Lateral spots: the sardine's row of dark dots along the upper flank. ---
  for (const side of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      const u = 0.6 + i * 0.07;
      const theta = side * 1.0;
      disc(builder, surface(u, theta, 0.003), surfaceNormal(u, theta), 0.013, pal.spot, pal.spot, 0, 5);
    }
  }

  // --- Face: big eyes looking forward, eyebrows, cheeks, a smile. ---
  const eyeColours = { white: pal.eyeWhite, pupil: pal.pupil, glint: pal.glint };
  for (const side of [1, -1]) {
    const theta = side * 0.72;
    const base = surface(0.13, theta);
    const n = surfaceNormal(0.13, theta);
    const radius = 0.074;
    const eye: Vec3 = [base[0] + n[0] * radius * 0.35, base[1] + n[1] * radius * 0.35, base[2] + 0.012];
    cartoonEye(builder, eye, radius, [side * 0.38, 0.04, 1], eyeColours, 0.6);
    // A short, slightly stern brow: lower over the nose than at the outside.
    tube(
      builder,
      [eye[0] - side * 0.045, eye[1] + 0.072, eye[2] + 0.03],
      [eye[0] + side * 0.05, eye[1] + 0.09, eye[2] + 0.005],
      0.011,
      0.009,
      pal.brow,
      4
    );
    const cheekTheta = side * 1.85;
    disc(builder, surface(0.15, cheekTheta, 0.004), surfaceNormal(0.15, cheekTheta), 0.026, pal.cheek, pal.cheek, 0, 6);
  }
  // The smile: a dark strip round the lower front of the snout.
  const SMILE_STEPS = 6;
  for (let i = 0; i < SMILE_STEPS; i++) {
    const t0 = Math.PI - 0.85 + (1.7 * i) / SMILE_STEPS;
    const t1 = Math.PI - 0.85 + (1.7 * (i + 1)) / SMILE_STEPS;
    builder.quad(surface(0.012, t0, 0.004), surface(0.034, t0, 0.004), surface(0.034, t1, 0.004), surface(0.012, t1, 0.004), pal.mouth);
  }
  // The mouth: a dark oval on the snout that opens (stretches) as he talks.
  builder.withPart(SARDINE_PART.mouth, () => {
    disc(builder, MOUTH_AT, normalise([0, -0.35, 1]), 0.024, pal.mouth, colour('#1a0608'), 0.002, 8);
  });
  // The presidential moustache: two thick curls from under the nose, up at the tips.
  builder.withPart(SARDINE_PART.moustache, () => {
    for (const side of [1, -1]) {
      const [x, y, z] = MOUSTACHE_ROOT;
      const points: Vec3[] = [
        [x, y, z],
        [x + side * 0.035, y - 0.012, z - 0.006],
        [x + side * 0.068, y - 0.012, z - 0.02],
        [x + side * 0.092, y + 0.006, z - 0.038],
        [x + side * 0.1, y + 0.026, z - 0.05],
      ];
      const radii = [0.014, 0.015, 0.012, 0.008, 0.004];
      for (let i = 0; i < points.length - 1; i++)
        tube(builder, points[i] as Vec3, points[i + 1] as Vec3, radii[i] ?? 0.01, radii[i + 1] ?? 0.004, pal.brow, 5);
    }
  });

  // --- Fins. ---
  const finColour = (): Color => mixColour(pal.fin, pal.finEdge, random() * 0.4);
  // Dorsal: a little sail.
  const DORSAL = { from: 0.3, to: 0.6, steps: 6, peak: 0.12 };
  for (let i = 0; i < DORSAL.steps; i++) {
    const u0 = DORSAL.from + ((DORSAL.to - DORSAL.from) * i) / DORSAL.steps;
    const u1 = DORSAL.from + ((DORSAL.to - DORSAL.from) * (i + 1)) / DORSAL.steps;
    const tall = (u: number): number => DORSAL.peak * Math.sin(Math.PI * ((u - DORSAL.from) / (DORSAL.to - DORSAL.from)) ** 0.7);
    const b0 = surface(u0, 0);
    const b1 = surface(u1, 0);
    builder.quad(b0, b1, [0, b1[1] + tall(u1), b1[2] - 0.03], [0, b0[1] + tall(u0), b0[2] - 0.03], finColour());
  }
  // Anal fin: small, under the rear.
  for (let i = 0; i < 3; i++) {
    const u0 = 0.66 + i * 0.06;
    const u1 = u0 + 0.06;
    const b0 = surface(u0, Math.PI);
    const b1 = surface(u1, Math.PI);
    const drop = (k: number): number => 0.045 * Math.sin((Math.PI * (k + 0.5)) / 3.5);
    builder.quad(b1, b0, [0, b0[1] - drop(i), b0[2] - 0.02], [0, b1[1] - drop(i + 1), b1[2] - 0.02], finColour());
  }
  // Tail: a forked fan from the root.
  builder.withPart(SARDINE_PART.tail, () => {
    const root: Vec3 = [0, PROFILE.c[PROFILE.c.length - 1], ROOT_Z + 0.01];
    const lobe = (k: number): Vec3 => {
      // k = 0..6, top tip to bottom tip with a notch at 3.
      const a = (-1 + k / 3) * 0.95;
      const reach = k === 3 ? 0.1 : 0.2 - Math.abs(k - 3) * 0.004;
      return [0, root[1] - Math.sin(a) * 0.22, ROOT_Z - 0.02 - reach * Math.cos(a * 0.6)];
    };
    for (let k = 0; k < 6; k++) {
      const edge = k === 0 || k === 5 ? pal.finEdge : finColour();
      builder.triangle(root, lobe(k), lobe(k + 1), [pal.fin, edge, edge]);
    }
  });
  // Pectoral fins: rounded paddles that flap (parts 2 and 3), and small pelvic fins.
  for (const side of [1, -1]) {
    const pivot: Vec3 = [side * FIN_PIVOT.x, FIN_PIVOT.y, FIN_PIVOT.z];
    builder.withPart(side > 0 ? SARDINE_PART.finL : SARDINE_PART.finR, () => {
      const steps = 5;
      const point = (k: number): Vec3 => {
        const phi = (-1 + (2 * k) / steps) * 0.85;
        return [pivot[0] + side * (0.035 + 0.03 * Math.cos(phi)), pivot[1] + Math.sin(phi) * 0.065 - 0.025, pivot[2] - 0.135 * (0.4 + 0.6 * Math.cos(phi))];
      };
      for (let i = 0; i < steps; i++) builder.triangle(pivot, point(i), point(i + 1), [pal.fin, pal.finEdge, pal.finEdge]);
    });
    const pelvic = surface(0.42, side * 2.7);
    builder.triangle(pelvic, [pelvic[0] + side * 0.02, pelvic[1] - 0.05, pelvic[2] - 0.06], [pelvic[0], pelvic[1] - 0.01, pelvic[2] - 0.08], finColour());
  }

  return builder;
}

/**
 * The cast material (see `createNarratorMaterial`). Its vertex stage bends the body behind the
 * head (`uniforms.bend`, from the tail bone); the parts move whole on their joints.
 */
export function createSardinePresidentMaterial({ bend }: NarratorUniforms): MeshStandardMaterial {
  return createNarratorMaterial({
    roughness: 0.42,
    glow: 0.38,
    motion: {
      uniforms: { uNarratorBend: bend },
      declarations: 'uniform float uNarratorBend;',
      transform: /* glsl */ `
        float sardineRear = clamp( ( ${BEND_FRONT.toFixed(3)} - position.z ) / ${(BEND_FRONT - ROOT_Z).toFixed(3)}, 0.0, 1.0 );
        transformed.x += uNarratorBend * sardineRear * sardineRear;
      `,
      cacheKey: 'narrator-sardine-president',
    },
  });
}

const finJoint = (side: 1 | -1): CastJoint => {
  const k = side > 0 ? 'L' : 'R';
  return {
    name: `fin.${k}`,
    parent: 'body',
    pivot: [side * FIN_PIVOT.x, FIN_PIVOT.y, FIN_PIVOT.z],
    parts: [side > 0 ? SARDINE_PART.finL : SARDINE_PART.finR],
    // His fins are his arms. They point back along his flanks, so lifting one tips it up (about
    // x) and flares it out (about y); the swing tips it too; the elbow's curl rocks it (the regal
    // wave).
    drives: [
      { bone: `shoulder.${k}`, gain: [0.75 * side, -0.7, 0.4 * side], from: [2, 2, 2] },
      { bone: `shoulder.${k}`, gain: [0.4, 0, 0] },
      { bone: `elbow.${k}`, gain: [0.35 * side, 0, 0], from: [2, 2, 2] },
    ],
    flutter: { axis: 2, amplitude: 0.1 * side, rate: 5, phase: side > 0 ? 0 : 1.1 },
  };
};

/** The Sardine President's joints: body, tail on the bend, fins, moustache, mouth. */
export const SARDINE_JOINTS: JointedCastSpec = {
  joints: [
    {
      name: 'body',
      parent: null,
      pivot: [0, 0, 0.05],
      parts: [SARDINE_PART.body],
      drives: [
        { bone: 'hips', gain: [0.4, 1, 0.6] },
        { bone: 'chest', gain: [0.9, 0, 0.3] },
        { bone: 'head', gain: [0.6, 0.6, 0.3] },
      ],
    },
    {
      name: 'tail',
      parent: 'body',
      pivot: [0, PROFILE.c[PROFILE.c.length - 1] ?? 0, ROOT_Z + 0.01],
      parts: [SARDINE_PART.tail],
      drives: [{ bone: 'tail', gain: [0, 0.7, 0] }],
      onBend: true,
    },
    finJoint(1),
    finJoint(-1),
    // The moustache twitches up on each syllable and wiggles with his head.
    { name: 'moustache', parent: 'body', pivot: MOUSTACHE_ROOT, parts: [SARDINE_PART.moustache], drives: [{ bone: 'jaw', gain: [-0.5, 0, 0] }, { bone: 'head', gain: [0, 0, 0.8] }] },
    { name: 'mouth', parent: 'body', pivot: MOUTH_AT, parts: [SARDINE_PART.mouth], drives: [], stretch: { bone: 'jaw', axis: 0, gain: 3.6, along: [0.3, 1, 0] } },
  ],
  bend: { gain: 0.45, front: BEND_FRONT, root: ROOT_Z },
};

/** The Sardine President's rig for the animator: a fish, all fins and importance. */
export const SARDINE_PRESIDENT_RIG: NarratorRigSpec = {
  id: 'sardine-president',
  measuredHeight: 0.4,
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
  motion: { bob: 0.04, sway: 0.025, talkStretch: 0.03, talkBounce: 0.015 },
  style: SARDINE_PRESIDENT_STYLE,
};
