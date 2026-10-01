import type { BufferGeometry, Color, MeshStandardMaterial } from 'three';
import { AMBIENT_TIME_UNIFORM } from './ambient-clock.js';
import { LOW_POLY_PART_ATTRIBUTE, LowPolyBuilder } from './low-poly-builder.js';
import { createNarratorMaterial } from './narrator-material.js';
import { cartoonEye, colour, disc, mixColour, normalise, ring, tube } from './narrator-shapes.js';
import type { NarratorUniforms } from './narrator-uniforms.js';
import { seededRandom } from './seeded-random.js';
import type { Vec3 } from './world-space.js';

/**
 * The Sardine President: an original, small, chubby silver sardine with big forward-looking
 * eyes, stern little eyebrows, pink cheeks and a smile, wearing a red-white-black sash and a
 * tiny gold medal. A cartoon of office, not of any person.
 *
 * Authored nose at +Z, back at +Y, about 0.87 units long. Parts: 1 the tail, 2 and 3 the right
 * (+X) and left pectoral fins (they flap when it talks).
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

export const SARDINE_PART = { tail: 1, rightFin: 2, leftFin: 3 } as const;

const PROFILE = {
  u: [0, 0.06, 0.14, 0.24, 0.36, 0.48, 0.6, 0.72, 0.82, 0.92, 1],
  h: [0.055, 0.115, 0.15, 0.165, 0.163, 0.15, 0.13, 0.102, 0.072, 0.046, 0.032],
  w: [0.048, 0.094, 0.115, 0.122, 0.116, 0.104, 0.088, 0.068, 0.048, 0.032, 0.024],
  c: [-0.012, -0.006, 0, 0.004, 0.006, 0.006, 0.005, 0.004, 0.003, 0.002, 0.002],
} as const;

const NOSE_Z = 0.4;
const ROOT_Z = -0.38;
const SEGMENTS = 12;

/** Pectoral fin pivots (x on the +X side; mirrored), shared with the flap shader. */
const FIN_PIVOT = { x: 0.108, y: -0.07, z: 0.16 } as const;

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

export function createSardinePresidentGeometry(seed = 11): BufferGeometry {
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
    builder.withPart(side > 0 ? SARDINE_PART.rightFin : SARDINE_PART.leftFin, () => {
      const steps = 5;
      const point = (k: number): Vec3 => {
        const phi = (-1 + (2 * k) / steps) * 0.85;
        return [pivot[0] + side * (0.03 + 0.025 * Math.cos(phi)), pivot[1] + Math.sin(phi) * 0.05 - 0.02, pivot[2] - 0.1 * (0.4 + 0.6 * Math.cos(phi))];
      };
      for (let i = 0; i < steps; i++) builder.triangle(pivot, point(i), point(i + 1), [pal.fin, pal.finEdge, pal.finEdge]);
    });
    const pelvic = surface(0.42, side * 2.7);
    builder.triangle(pelvic, [pelvic[0] + side * 0.02, pelvic[1] - 0.05, pelvic[2] - 0.06], [pelvic[0], pelvic[1] - 0.01, pelvic[2] - 0.08], finColour());
  }

  return builder.build();
}

/**
 * The cast material (see `createNarratorMaterial`). The vertex patch is a gentle tail
 * wave (stronger while it swims) and the pectoral fins flapping, wider on each talk beat: it
 * gestures as it speaks.
 */
export function createSardinePresidentMaterial({ time, talk, swim }: NarratorUniforms): MeshStandardMaterial {
  const p = FIN_PIVOT;
  return createNarratorMaterial({
    roughness: 0.42,
    glow: 0.38,
    motion: {
      uniforms: { [AMBIENT_TIME_UNIFORM]: time, uNarratorTalk: talk, uNarratorSwim: swim },
      declarations: `uniform float ${AMBIENT_TIME_UNIFORM};\nuniform float uNarratorTalk;\nuniform float uNarratorSwim;\nattribute float ${LOW_POLY_PART_ATTRIBUTE};`,
      transform: /* glsl */ `
        float sardineT = ${AMBIENT_TIME_UNIFORM};
        float sardineRear = 1.0 - smoothstep( -0.45, 0.1, position.z );
        transformed.x += sin( sardineT * 6.0 - position.z * 7.0 ) * 0.05 * sardineRear * sardineRear * ( 0.35 + uNarratorSwim );
        if ( ${LOW_POLY_PART_ATTRIBUTE} > 1.5 && ${LOW_POLY_PART_ATTRIBUTE} < 3.5 ) {
          float finSide = ${LOW_POLY_PART_ATTRIBUTE} < 2.5 ? 1.0 : -1.0;
          float finAngle = finSide * ( 0.22 * sin( sardineT * 5.0 + finSide ) + 0.75 * uNarratorTalk );
          vec2 finPivot = vec2( finSide * ${p.x.toFixed(3)}, ${p.y.toFixed(3)} );
          vec2 finArm = transformed.xy - finPivot;
          float finCos = cos( finAngle );
          float finSin = sin( finAngle );
          transformed.xy = finPivot + vec2( finCos * finArm.x - finSin * finArm.y, finSin * finArm.x + finCos * finArm.y );
        }
      `,
      cacheKey: 'narrator-sardine-president',
    },
  });
}
