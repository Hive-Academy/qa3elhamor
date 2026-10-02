import type { BufferGeometry, Color, MeshStandardMaterial } from 'three';
import { LowPolyBuilder } from './low-poly-builder.js';
import { CRAB_CLERK_STYLE } from './narrator-clip-style.js';
import type { CastJoint, CastLeg, JointedCastSpec } from './narrator-jointed.js';
import { createNarratorMaterial } from './narrator-material.js';
import type { NarratorRigSpec } from './narrator-rig.js';
import { cartoonEye, colour, disc, ellipsoid, mixColour, ring, tube } from './narrator-shapes.js';
import { seededRandom } from './seeded-random.js';
import type { Vec3 } from './world-space.js';

/**
 * The Crab Clerk: an original red-orange crab bureaucrat. Round shell, eyes on stalks behind
 * little round reading glasses under a green accountant's eyeshade, a small smile, oversized
 * claws: the +X one holds a rubber stamp.
 *
 * Authored standing on y = 0, facing +Z, about 1.1 units wide and 0.56 tall. It is built of
 * jointed parts (`CRAB_PART`), each moved whole on its pivot by the animator (`CRAB_JOINTS`):
 * the shell, the eyeshade, each eye stalk, each claw's upper arm, forearm, pincer and moving
 * finger, and each leg's thigh and shin.
 */
export const CRAB_PALETTE = {
  shellDark: '#bf4420',
  shell: '#e6602e',
  shellLight: '#f88f4e',
  underside: '#f8c08a',
  spot: '#ffd29a',
  claw: '#ea6631',
  clawTip: '#3a1d14',
  leg: '#dd5d2b',
  eyeWhite: '#fbf8f0',
  pupil: '#120c0a',
  glint: '#ffffff',
  glasses: '#3a2618',
  visor: '#3fae74',
  visorDark: '#2a8556',
  mouth: '#3a1410',
  cheek: '#f7a1a0',
  handle: '#8a5a33',
  knob: '#5e3a20',
  stampMount: '#4a2e1c',
  ink: '#b3232b',
} as const;

/** Builder part ids. `L` is the character's left, +X (its stamp claw); `R` is -X. */
export const CRAB_PART = {
  shell: 0,
  shade: 1,
  eyeL: 2,
  eyeR: 3,
  upperArmL: 4,
  forearmL: 5,
  pincerL: 6,
  fingerL: 7,
  upperArmR: 8,
  forearmR: 9,
  pincerR: 10,
  fingerR: 11,
  /** Leg `i` (0..2 on +X, 3..5 on -X): thigh `legs + 2i`, shin `legs + 2i + 1`. */
  legs: 12,
} as const;

const SHELL_CENTRE: Vec3 = [0, 0.21, 0];
const SHELL_RADII: Vec3 = [0.34, 0.13, 0.25];
const EYE_BASE: Vec3 = [0, 0.29, 0.15];
const LEG_ROWS = [0.05, -0.07, -0.18] as const;

/** One side's claw joints, `side` +1 (+X) or -1. */
const clawPoints = (side: number) => {
  const s = (v: Vec3): Vec3 => [side * v[0], v[1], v[2]];
  return {
    shoulder: s([0.28, 0.2, 0.12]),
    elbow: s([0.46, 0.24, 0.25]),
    wrist: s([0.42, 0.29, 0.41]),
    hinge: s([0.4, 0.36, 0.585]),
    s,
  };
};

/** Leg `i`'s hip, knee and foot (0..2 on +X, 3..5 on -X). */
const legPoints = (i: number): { hip: Vec3; knee: Vec3; foot: Vec3 } => {
  const side = i < 3 ? 1 : -1;
  const z = LEG_ROWS[i % 3] ?? 0;
  return {
    hip: [side * 0.27, 0.15, z],
    knee: [side * 0.45, 0.23, z * 1.3 - 0.02],
    foot: [side * 0.52, 0, z * 1.55 - 0.05],
  };
};

/** A point on the shell's front surface at (x, y), lifted `lift` toward the viewer. */
function shellFront(x: number, y: number, lift = 0): Vec3 {
  const nx = x / SHELL_RADII[0];
  const ny = (y - SHELL_CENTRE[1]) / SHELL_RADII[1];
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return [x, y, SHELL_CENTRE[2] + SHELL_RADII[2] * nz + lift];
}

function buildCrabClerk(seed: number): LowPolyBuilder {
  const random = seededRandom(seed);
  const pal = Object.fromEntries(Object.entries(CRAB_PALETTE).map(([k, hex]) => [k, colour(hex)])) as Record<
    keyof typeof CRAB_PALETTE,
    Color
  >;
  const builder = new LowPolyBuilder();

  // --- Shell: a flattened ellipsoid, darker on top, cream below. ---
  ellipsoid(builder, SHELL_CENTRE, SHELL_RADII, (_c, n) => {
    if (n[1] < -0.35) return mixColour(pal.underside, pal.shellLight, random() * 0.3);
    if (n[1] > 0.75) return mixColour(pal.shellDark, pal.shell, 0.4 + random() * 0.3);
    return mixColour(pal.shell, pal.shellLight, random() * 0.55);
  }, 5, 14);
  // Pale freckles on the top of the shell.
  for (const [x, z, r] of [
    [0.16, -0.05, 0.022],
    [-0.13, -0.09, 0.018],
    [0.04, -0.15, 0.016],
    [-0.2, 0.04, 0.015],
    [0.22, 0.08, 0.014],
  ] as const) {
    const nx = x / SHELL_RADII[0];
    const nz = z / SHELL_RADII[2];
    const y = SHELL_CENTRE[1] + SHELL_RADII[1] * Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz)) + 0.003;
    disc(builder, [x, y, z], [nx * 0.5, 1, nz * 0.5], r, pal.spot, pal.spot, 0, 6);
  }

  // --- Face: a smile and pink cheeks on the front of the shell. ---
  const SMILE = 5;
  for (let i = 0; i < SMILE; i++) {
    const x0 = -0.055 + (0.11 * i) / SMILE;
    const x1 = -0.055 + (0.11 * (i + 1)) / SMILE;
    const y = (x: number): number => 0.165 + 9 * x * x;
    tube(builder, shellFront(x0, y(x0), 0.004), shellFront(x1, y(x1), 0.004), 0.009, 0.009, pal.mouth, 4, false);
  }
  for (const side of [1, -1]) {
    const at = shellFront(side * 0.13, 0.19, 0.004);
    disc(builder, at, [side * 0.5, 0.1, 1], 0.026, pal.cheek, pal.cheek, 0, 6);
  }

  // --- Eyes on stalks, each with its round lens (one part per stalk). ---
  const eyeColours = { white: pal.eyeWhite, pupil: pal.pupil, glint: pal.glint };
  const EYE_RADIUS = 0.062;
  const GLASS_Z = 0.268;
  for (const side of [1, -1]) {
    builder.withPart(side > 0 ? CRAB_PART.eyeL : CRAB_PART.eyeR, () => {
      const eye: Vec3 = [side * 0.09, 0.455, 0.19];
      tube(builder, [side * 0.07, 0.3, 0.15], [side * 0.088, 0.42, 0.18], 0.023, 0.018, pal.shell, 5);
      cartoonEye(builder, eye, EYE_RADIUS, [side * 0.12, -0.02, 1], eyeColours, 0.58);
      ring(builder, [eye[0], eye[1], GLASS_Z], [0, 0, 1], 0.07, 0.014, 0.012, pal.glasses, 12);
      // Temple arm back over the stalk.
      tube(builder, [side * 0.16, 0.462, GLASS_Z - 0.004], [side * 0.15, 0.47, 0.16], 0.007, 0.007, pal.glasses, 3, false);
    });
  }

  // --- The glasses' bridge and the green eyeshade, on a band behind the eyes. ---
  builder.withPart(CRAB_PART.shade, () => {
    tube(builder, [-0.021, 0.47, GLASS_Z], [0.021, 0.47, GLASS_Z], 0.008, 0.008, pal.glasses, 4, false);
    const BRIM = 8;
    const brim = (k: number, front: boolean): Vec3 => {
      const x = -0.2 + (0.4 * k) / BRIM;
      const bow = 0.9 * x * x;
      return front ? [x * 1.12, 0.5 + bow * 0.25, 0.32 - bow] : [x, 0.532, 0.17 - bow * 0.5];
    };
    for (let k = 0; k < BRIM; k++) {
      const shade = k % 2 === 0 ? pal.visor : mixColour(pal.visor, pal.visorDark, 0.35);
      builder.quad(brim(k, false), brim(k, true), brim(k + 1, true), brim(k + 1, false), shade);
      const b0 = brim(k, false);
      const b1 = brim(k + 1, false);
      builder.quad([b0[0], b0[1] - 0.045, b0[2] - 0.01], b0, b1, [b1[0], b1[1] - 0.045, b1[2] - 0.01], pal.visorDark);
    }
  });

  // --- Claws: upper arm, forearm, pincer (with its fixed finger) and the moving finger. ---
  for (const side of [1, -1]) {
    const { shoulder, elbow, wrist, s } = clawPoints(side);
    const left = side > 0;
    builder.withPart(left ? CRAB_PART.upperArmL : CRAB_PART.upperArmR, () => {
      tube(builder, shoulder, elbow, 0.042, 0.038, pal.claw, 6);
    });
    builder.withPart(left ? CRAB_PART.forearmL : CRAB_PART.forearmR, () => {
      tube(builder, elbow, wrist, 0.04, 0.045, pal.claw, 6);
    });
    builder.withPart(left ? CRAB_PART.pincerL : CRAB_PART.pincerR, () => {
      ellipsoid(builder, s([0.4, 0.31, 0.5]), [0.105, 0.088, 0.125], (_c, n) =>
        n[1] > 0.3 ? mixColour(pal.claw, pal.shellLight, 0.4) : mixColour(pal.claw, pal.shellDark, 0.25)
      , 4, 8);
      tube(builder, s([0.4, 0.27, 0.585]), s([0.385, 0.285, 0.72]), 0.044, 0.016, pal.claw, 5);
      tube(builder, s([0.385, 0.285, 0.72]), s([0.38, 0.295, 0.77]), 0.016, 0, pal.clawTip, 5);
      if (left) {
        // The rubber stamp gripped in the +X claw: knob, handle, mount and the red rubber.
        const x = 0.39;
        const z = 0.66;
        ellipsoid(builder, [x, 0.455, z], [0.038, 0.034, 0.038], pal.knob, 3, 6);
        tube(builder, [x, 0.2, z], [x, 0.43, z], 0.02, 0.022, pal.handle, 6);
        tube(builder, [x, 0.14, z], [x, 0.2, z], 0.07, 0.07, pal.stampMount, 4);
        tube(builder, [x, 0.118, z], [x, 0.14, z], 0.072, 0.072, pal.ink, 4);
      }
    });
    builder.withPart(left ? CRAB_PART.fingerL : CRAB_PART.fingerR, () => {
      tube(builder, s([0.4, 0.36, 0.585]), s([0.385, 0.345, 0.715]), 0.046, 0.016, pal.claw, 5);
      tube(builder, s([0.385, 0.345, 0.715]), s([0.38, 0.33, 0.765]), 0.016, 0, pal.clawTip, 5);
    });
  }

  // --- Legs: three a side, bent at the knee, feet on y = 0. ---
  for (let i = 0; i < 6; i++) {
    const { hip, knee, foot } = legPoints(i);
    const tone = mixColour(pal.leg, pal.shellLight, random() * 0.3);
    builder.withPart(CRAB_PART.legs + 2 * i, () => tube(builder, hip, knee, 0.03, 0.024, tone, 5));
    builder.withPart(CRAB_PART.legs + 2 * i + 1, () => tube(builder, knee, foot, 0.024, 0, tone, 5));
  }
  return builder;
}

/** The whole crab as one geometry (a `part` attribute marks the parts). */
export function createCrabClerkGeometry(seed = 5): BufferGeometry {
  return buildCrabClerk(seed).build();
}

/** The crab's parts, one geometry each (`CRAB_PART`), for `CRAB_JOINTS`. */
export function createCrabClerkParts(seed = 5): Map<number, BufferGeometry> {
  return buildCrabClerk(seed).buildParts();
}

/** The cast material, its colour-tinted glow keeping the red reading as red under the blue light rig. */
export function createCrabClerkMaterial(): MeshStandardMaterial {
  return createNarratorMaterial({ roughness: 0.7, glow: 0.4, cacheKey: 'narrator-crab-clerk' });
}

const clawJoints = (side: 1 | -1): CastJoint[] => {
  const { shoulder, elbow, wrist, hinge } = clawPoints(side);
  const left = side > 0;
  const k = left ? 'L' : 'R';
  const bone = <B extends string>(b: B) => `${b}.${k}` as `${B}.L` | `${B}.R`;
  return [
    {
      name: `shoulder.${k}`,
      parent: 'chest',
      pivot: shoulder,
      parts: [left ? CRAB_PART.upperArmL : CRAB_PART.upperArmR],
      // The claws point forward, so "lifting the arm" pitches the claw up (about x) more than it
      // swings it out (about z); the swing tips it too.
      drives: [
        { bone: bone('shoulder'), gain: [-0.65 * side, 0.5, 0.3], from: [2, 1, 2] },
        { bone: bone('shoulder'), gain: [0.5, 0, 0] },
      ],
    },
    {
      name: `elbow.${k}`,
      parent: `shoulder.${k}`,
      pivot: elbow,
      parts: [left ? CRAB_PART.forearmL : CRAB_PART.forearmR],
      drives: [{ bone: bone('elbow'), gain: [-0.6 * side, 0.5, 0.2], from: [2, 1, 2] }],
    },
    {
      name: `hand.${k}`,
      parent: `elbow.${k}`,
      pivot: wrist,
      parts: [left ? CRAB_PART.pincerL : CRAB_PART.pincerR],
      drives: [{ bone: bone('hand'), gain: [0.6, 0, 0.25] }],
    },
    {
      // The moving finger opens (up, about x) as the hand flexes, and clacks with the jaw's beat.
      name: `finger.${k}`,
      parent: `hand.${k}`,
      pivot: hinge,
      parts: [left ? CRAB_PART.fingerL : CRAB_PART.fingerR],
      drives: [
        { bone: bone('hand'), gain: [-0.9 * side, 0, 0], from: [2, 2, 2] },
        { bone: 'jaw', gain: [-1.2, 0, 0] },
      ],
    },
  ];
};

const LEGS: CastLeg[] = Array.from({ length: 6 }, (_, i) => ({
  thigh: `thigh.${i}`,
  shin: `shin.${i}`,
  foot: legPoints(i).foot,
  // A tripod gait: alternate legs on a side step together, opposite to the other side's.
  phase: ((i % 3) % 2) * Math.PI + (i < 3 ? 0 : Math.PI),
}));

/** The crab's joints and legs: the animator's pose, onto its parts. */
export const CRAB_JOINTS: JointedCastSpec = {
  joints: [
    { name: 'hips', parent: null, pivot: [0, 0.15, 0], parts: [], drives: [{ bone: 'hips', gain: [1, 1, 1] }], dropsWithHips: true },
    { name: 'chest', parent: 'hips', pivot: [0, 0.2, 0], parts: [CRAB_PART.shell], drives: [{ bone: 'chest', gain: [1, 1, 1] }] },
    { name: 'head', parent: 'chest', pivot: EYE_BASE, parts: [CRAB_PART.shade], drives: [{ bone: 'head', gain: [0.6, 0.5, 0.6] }] },
    {
      name: 'eye.L',
      parent: 'head',
      pivot: [0.07, 0.3, 0.15],
      parts: [CRAB_PART.eyeL],
      drives: [{ bone: 'eye.L', gain: [1, 1, 1] }, { bone: 'head', gain: [0.5, 0.4, 0] }],
    },
    {
      name: 'eye.R',
      parent: 'head',
      pivot: [-0.07, 0.3, 0.15],
      parts: [CRAB_PART.eyeR],
      drives: [{ bone: 'eye.R', gain: [1, 1, 1] }, { bone: 'head', gain: [0.5, 0.4, 0] }],
    },
    ...clawJoints(1),
    ...clawJoints(-1),
    ...LEGS.flatMap((leg, i): CastJoint[] => {
      const { hip, knee } = legPoints(i);
      return [
        { name: leg.thigh, parent: 'hips', pivot: hip, parts: [CRAB_PART.legs + 2 * i], drives: [] },
        { name: leg.shin, parent: leg.thigh, pivot: knee, parts: [CRAB_PART.legs + 2 * i + 1], drives: [] },
      ];
    }),
  ],
  legs: LEGS,
  stepHeight: 0.045,
};

/** The crab's model height, for the rig's fractions. */
const CH = 0.56;
const ch = (x: number, y: number, z: number): Vec3 => [x / CH, y / CH, z / CH];

/** The crab's rig for the animator: its leg lengths (for the crouch), its rest, its style. */
export const CRAB_CLERK_RIG: NarratorRigSpec = {
  id: 'crab-clerk',
  measuredHeight: CH,
  joints: {
    root: [0, 0, 0],
    hips: ch(0, 0.15, 0),
    chest: ch(0, 0.2, 0),
    head: ch(0, 0.29, 0.15),
    'shoulder.L': ch(0.28, 0.2, 0.12),
    'elbow.L': ch(0.46, 0.24, 0.25),
    'hand.L': ch(0.42, 0.29, 0.41),
    'shoulder.R': ch(-0.28, 0.2, 0.12),
    'elbow.R': ch(-0.46, 0.24, 0.25),
    'hand.R': ch(-0.42, 0.29, 0.41),
    'hip.L': ch(0.27, 0.15, 0),
    'knee.L': ch(0.45, 0.23, 0),
    'hip.R': ch(-0.27, 0.15, 0),
    'knee.R': ch(-0.45, 0.23, 0),
    'eye.L': ch(0.07, 0.3, 0.15),
    'eye.R': ch(-0.07, 0.3, 0.15),
  },
  capsules: [],
  falloff: 1,
  rest: { armDown: 0, armForward: 0, elbowBend: 0 },
  motion: { bob: 0.004, sway: 0.012, talkStretch: 0.03, talkBounce: 0.01 },
  style: CRAB_CLERK_STYLE,
};
