import type { BufferGeometry, Color, MeshStandardMaterial } from 'three';
import { AMBIENT_TIME_UNIFORM } from './ambient-clock.js';
import { LOW_POLY_PART_ATTRIBUTE, LowPolyBuilder } from './low-poly-builder.js';
import { createNarratorMaterial } from './narrator-material.js';
import { cartoonEye, colour, disc, ellipsoid, mixColour, ring, tube } from './narrator-shapes.js';
import type { NarratorUniforms } from './narrator-uniforms.js';
import { seededRandom } from './seeded-random.js';
import type { Vec3 } from './world-space.js';

/**
 * The Crab Clerk: an original red-orange crab bureaucrat. Round shell, eyes on stalks behind
 * little round reading glasses under a green accountant's eyeshade, a small smile, oversized
 * claws: the left one clacks as it talks, the right one holds a rubber stamp and thumps it on
 * each beat.
 *
 * Authored standing on y = 0, facing +Z, about 1.1 units wide and 0.56 tall. Parts: 1 legs,
 * 2 the left claw's moving finger, 3 the right (stamp) arm, 4 the eyes with glasses and shade.
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

export const CRAB_PART = { legs: 1, leftFinger: 2, stampArm: 3, eyes: 4 } as const;

/** Pivots shared with the vertex patch. */
const LEFT_FINGER_HINGE: Vec3 = [-0.4, 0.36, 0.585];
const STAMP_SHOULDER: Vec3 = [0.28, 0.2, 0.12];
const EYE_BASE: Vec3 = [0, 0.29, 0.15];

const SHELL_CENTRE: Vec3 = [0, 0.21, 0];
const SHELL_RADII: Vec3 = [0.34, 0.13, 0.25];

/** A point on the shell's front surface at (x, y), lifted `lift` toward the viewer. */
function shellFront(x: number, y: number, lift = 0): Vec3 {
  const nx = x / SHELL_RADII[0];
  const ny = (y - SHELL_CENTRE[1]) / SHELL_RADII[1];
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return [x, y, SHELL_CENTRE[2] + SHELL_RADII[2] * nz + lift];
}

const fmt = (v: Vec3): string => `vec3( ${v.map((n) => n.toFixed(3)).join(', ')} )`;

export function createCrabClerkGeometry(seed = 5): BufferGeometry {
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

  // --- Eyes on stalks, round reading glasses, the green eyeshade (part 4, they wobble together). ---
  builder.withPart(CRAB_PART.eyes, () => {
    const eyeColours = { white: pal.eyeWhite, pupil: pal.pupil, glint: pal.glint };
    const EYE_RADIUS = 0.062;
    const GLASS_Z = 0.268;
    for (const side of [1, -1]) {
      const eye: Vec3 = [side * 0.09, 0.455, 0.19];
      tube(builder, [side * 0.07, 0.3, 0.15], [side * 0.088, 0.42, 0.18], 0.023, 0.018, pal.shell, 5);
      cartoonEye(builder, eye, EYE_RADIUS, [side * 0.12, -0.02, 1], eyeColours, 0.58);
      ring(builder, [eye[0], eye[1], GLASS_Z], [0, 0, 1], 0.07, 0.014, 0.012, pal.glasses, 12);
      // Temple arms back over the stalk.
      tube(builder, [side * 0.16, 0.462, GLASS_Z - 0.004], [side * 0.15, 0.47, 0.16], 0.007, 0.007, pal.glasses, 3, false);
    }
    tube(builder, [-0.021, 0.47, GLASS_Z], [0.021, 0.47, GLASS_Z], 0.008, 0.008, pal.glasses, 4, false);

    // Eyeshade: a curved green brim over the glasses, on a band behind the eyes.
    const BRIM = 8;
    const brim = (k: number, front: boolean): Vec3 => {
      const x = -0.2 + (0.4 * k) / BRIM;
      const bow = 0.9 * x * x;
      return front ? [x * 1.12, 0.5 + bow * 0.25, 0.32 - bow] : [x, 0.532, 0.17 - bow * 0.5];
    };
    for (let k = 0; k < BRIM; k++) {
      const shade = k % 2 === 0 ? pal.visor : mixColour(pal.visor, pal.visorDark, 0.35);
      builder.quad(brim(k, false), brim(k, true), brim(k + 1, true), brim(k + 1, false), shade);
      // The band: a strip dropping behind the eyes.
      const b0 = brim(k, false);
      const b1 = brim(k + 1, false);
      builder.quad([b0[0], b0[1] - 0.045, b0[2] - 0.01], b0, b1, [b1[0], b1[1] - 0.045, b1[2] - 0.01], pal.visorDark);
    }
  });

  // --- Claws: oversized, the left one clacking (part 2), the right one holding the stamp (part 3). ---
  const claw = (side: number): void => {
    const s = (v: Vec3): Vec3 => [side * v[0], v[1], v[2]];
    const shoulder = s([0.28, 0.2, 0.12]);
    const elbow = s([0.46, 0.24, 0.25]);
    const wrist = s([0.42, 0.29, 0.41]);
    tube(builder, shoulder, elbow, 0.042, 0.038, pal.claw, 6);
    tube(builder, elbow, wrist, 0.04, 0.045, pal.claw, 6);
    ellipsoid(builder, s([0.4, 0.31, 0.5]), [0.105, 0.088, 0.125], (_c, n) =>
      n[1] > 0.3 ? mixColour(pal.claw, pal.shellLight, 0.4) : mixColour(pal.claw, pal.shellDark, 0.25)
    , 4, 8);
    // Fixed (lower) finger.
    tube(builder, s([0.4, 0.27, 0.585]), s([0.385, 0.285, 0.72]), 0.044, 0.016, pal.claw, 5);
    tube(builder, s([0.385, 0.285, 0.72]), s([0.38, 0.295, 0.77]), 0.016, 0, pal.clawTip, 5);
    // Moving (upper) finger.
    const upper = (): void => {
      tube(builder, s([0.4, 0.36, 0.585]), s([0.385, 0.345, 0.715]), 0.046, 0.016, pal.claw, 5);
      tube(builder, s([0.385, 0.345, 0.715]), s([0.38, 0.33, 0.765]), 0.016, 0, pal.clawTip, 5);
    };
    if (side < 0) builder.withPart(CRAB_PART.leftFinger, upper);
    else upper();
  };
  claw(-1);
  builder.withPart(CRAB_PART.stampArm, () => {
    claw(1);
    // The rubber stamp gripped in the right claw: knob, handle, mount and the red rubber.
    const x = 0.39;
    const z = 0.66;
    ellipsoid(builder, [x, 0.455, z], [0.038, 0.034, 0.038], pal.knob, 3, 6);
    tube(builder, [x, 0.2, z], [x, 0.43, z], 0.02, 0.022, pal.handle, 6);
    tube(builder, [x, 0.14, z], [x, 0.2, z], 0.07, 0.07, pal.stampMount, 4);
    tube(builder, [x, 0.118, z], [x, 0.14, z], 0.072, 0.072, pal.ink, 4);
  });

  // --- Legs: three a side, bent at the knee, feet on y = 0 (part 1). ---
  builder.withPart(CRAB_PART.legs, () => {
    for (const side of [1, -1]) {
      for (const z of [0.05, -0.07, -0.18]) {
        const hip: Vec3 = [side * 0.27, 0.15, z];
        const knee: Vec3 = [side * 0.45, 0.23, z * 1.3 - 0.02];
        const foot: Vec3 = [side * 0.52, 0, z * 1.55 - 0.05];
        const tone = mixColour(pal.leg, pal.shellLight, random() * 0.3);
        tube(builder, hip, knee, 0.03, 0.024, tone, 5);
        tube(builder, knee, foot, 0.024, 0, tone, 5);
      }
    }
  });

  return builder.build();
}

/**
 * The cast material (see `createNarratorMaterial`), its colour-tinted glow keeping the red
 * reading as red under the blue light rig. The vertex patch: the left claw's finger clacks open on each talk
 * beat, the stamp arm lifts on the beat and thumps down between, the eyes wobble on their
 * stalks, the legs shuffle.
 */
export function createCrabClerkMaterial({ time, talk, swim }: NarratorUniforms): MeshStandardMaterial {
  const part = LOW_POLY_PART_ATTRIBUTE;
  return createNarratorMaterial({ roughness: 0.7, glow: 0.4, motion: {
    uniforms: { [AMBIENT_TIME_UNIFORM]: time, uNarratorTalk: talk, uNarratorSwim: swim },
    declarations: `uniform float ${AMBIENT_TIME_UNIFORM};\nuniform float uNarratorTalk;\nuniform float uNarratorSwim;\nattribute float ${part};\n${ROTATE_GLSL}`,
    transform: /* glsl */ `
      float crabT = ${AMBIENT_TIME_UNIFORM};
      if ( abs( ${part} - 2.0 ) < 0.5 ) {
        float open = 0.12 + 0.06 * sin( crabT * 1.4 ) + 0.5 * uNarratorTalk;
        transformed = crabRotateX( transformed, ${fmt(LEFT_FINGER_HINGE)}, open );
      } else if ( abs( ${part} - 3.0 ) < 0.5 ) {
        float lift = 0.04 * sin( crabT * 1.2 + 1.0 ) + 0.3 * uNarratorTalk;
        transformed = crabRotateX( transformed, ${fmt(STAMP_SHOULDER)}, lift );
      } else if ( abs( ${part} - 4.0 ) < 0.5 ) {
        transformed = crabRotateZ( transformed, ${fmt(EYE_BASE)}, 0.06 * sin( crabT * 1.8 ) );
        transformed = crabRotateX( transformed, ${fmt(EYE_BASE)}, 0.04 * sin( crabT * 1.3 + 0.5 ) - 0.08 * uNarratorTalk );
      } else if ( abs( ${part} - 1.0 ) < 0.5 ) {
        float phase = position.z * 18.0 + sign( position.x ) * 1.6;
        // Fixed frequencies (a swim-dependent one would sweep the phase as the clock grows): a
        // slow idle shuffle, plus a quick scuttle that swim effort fades in.
        float lift = max( 0.0, sin( crabT * 3.0 + phase ) ) * 0.006 + max( 0.0, sin( crabT * 10.0 + phase ) ) * 0.03 * uNarratorSwim;
        transformed.y += lift * step( 0.01, position.y );
      }
    `,
    cacheKey: 'narrator-crab-clerk',
  } });
}

/** Rotations about an axis through a pivot (positive X lifts +Z points up). */
const ROTATE_GLSL = /* glsl */ `
vec3 crabRotateX( vec3 p, vec3 pivot, float a ) {
  vec3 d = p - pivot;
  float c = cos( a );
  float s = sin( a );
  return pivot + vec3( d.x, c * d.y + s * d.z, -s * d.y + c * d.z );
}
vec3 crabRotateZ( vec3 p, vec3 pivot, float a ) {
  vec3 d = p - pivot;
  float c = cos( a );
  float s = sin( a );
  return pivot + vec3( c * d.x - s * d.y, s * d.x + c * d.y, d.z );
}
`;
