import {
  BufferGeometry,
  Color,
  DoubleSide,
  MeshLambertMaterial,
  Raycaster,
  Vector3,
  type IUniform,
  type Object3D,
} from 'three';
import { AMBIENT_TIME_UNIFORM } from './ambient-clock.js';
import { LowPolyBuilder } from './low-poly-builder.js';
import { seededRandom } from './seeded-random.js';
import { applyVertexMotion } from './vertex-motion.js';
import type { Vec3 } from './world-space.js';

/** A circle on the seabed (xz distance, world units) where no kelp may root. */
export interface KelpClearing {
  readonly center: Vec3;
  readonly radius: number;
}

export interface KelpPlanOptions {
  /** Stalks in the whole bed. */
  readonly count: number;
  readonly seed: number;
  /** Rectangle the bed may occupy, xz world units. */
  readonly area: { readonly min: readonly [x: number, z: number]; readonly max: readonly [x: number, z: number] };
  readonly clearings: readonly KelpClearing[];
  /** Stalks per clump. */
  readonly stalksPerPatch: number;
  /** Clump radius, world units. */
  readonly patchRadius: number;
  /** Stalk height range, world units. */
  readonly minHeight: number;
  readonly maxHeight: number;
}

export interface KelpPatch {
  readonly x: number;
  readonly z: number;
}

export interface KelpStalk {
  readonly patch: number;
  readonly x: number;
  readonly z: number;
  readonly height: number;
  readonly yaw: number;
  /** Brightness multiplier, so a clump is not one flat colour. */
  readonly shade: number;
}

export interface KelpPlan {
  readonly patches: readonly KelpPatch[];
  readonly stalks: readonly KelpStalk[];
}

const CANDIDATES_PER_PATCH = 48;
/** Share of clumps grown next to an existing one: kelp reads as beds, not as scattered noise. */
const CLUSTERING = 0.65;

const clearOf = (x: number, z: number, margin: number, clearings: readonly KelpClearing[]): boolean =>
  clearings.every((c) => {
    const dx = x - c.center[0];
    const dz = z - c.center[2];
    const r = c.radius + margin;
    return dx * dx + dz * dz >= r * r;
  });

/**
 * Lays out a kelp bed: clumps of stalks, mostly grown next to earlier clumps so they form
 * beds, every clump outside every clearing (landmark footprints, the camera's line) and
 * inside `area`. Deterministic for a seed. A clump that finds no legal spot is dropped, so
 * a crowded map yields fewer stalks rather than illegal ones.
 */
export function planKelpBed(options: KelpPlanOptions): KelpPlan {
  const { area, clearings, patchRadius } = options;
  const random = seededRandom(options.seed);
  const perPatch = Math.max(1, Math.floor(options.stalksPerPatch));
  const patchCount = Math.ceil(Math.max(0, Math.floor(options.count)) / perPatch);
  const patches: KelpPatch[] = [];
  const spacing = patchRadius * 2.2;

  const inArea = (x: number, z: number): boolean =>
    x >= area.min[0] && x <= area.max[0] && z >= area.min[1] && z <= area.max[1];
  const legal = (x: number, z: number): boolean =>
    inArea(x, z) &&
    clearOf(x, z, patchRadius, clearings) &&
    patches.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 >= spacing * spacing);

  for (let p = 0; p < patchCount; p++) {
    for (let attempt = 0; attempt < CANDIDATES_PER_PATCH; attempt++) {
      let x: number;
      let z: number;
      if (patches.length > 0 && random() < CLUSTERING) {
        const near = patches[Math.floor(random() * patches.length)];
        const angle = random() * Math.PI * 2;
        const distance = spacing * (1 + random() * 0.8);
        x = near.x + Math.cos(angle) * distance;
        z = near.z + Math.sin(angle) * distance;
      } else {
        x = area.min[0] + random() * (area.max[0] - area.min[0]);
        z = area.min[1] + random() * (area.max[1] - area.min[1]);
      }
      if (legal(x, z)) {
        patches.push({ x, z });
        break;
      }
    }
  }

  const stalks: KelpStalk[] = [];
  const total = Math.max(0, Math.floor(options.count));
  patches.forEach((patch, index) => {
    for (let s = 0; s < perPatch && stalks.length < total; s++) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * patchRadius;
      const t = random();
      stalks.push({
        patch: index,
        x: patch.x + Math.cos(angle) * distance,
        z: patch.z + Math.sin(angle) * distance,
        height: options.minHeight + (options.maxHeight - options.minHeight) * t * t,
        yaw: random() * Math.PI * 2,
        shade: 0.75 + random() * 0.5,
      });
    }
  });
  return { patches, stalks };
}

const DOWN = new Vector3(0, -1, 0);

/**
 * Heights of the seabed under each patch, found by casting one ray straight down per patch
 * onto `ground` (world units; the ground's world matrices must be current). `null` where the
 * ray misses or lands on a steep face (a wall, a rock flank): no kelp there.
 */
export function probeSeabed(
  ground: Object3D,
  patches: readonly KelpPatch[],
  fromY: number,
  maxSlope = 0.55
): (number | null)[] {
  const raycaster = new Raycaster();
  const origin = new Vector3();
  const normal = new Vector3();
  return patches.map(({ x, z }) => {
    raycaster.set(origin.set(x, fromY, z), DOWN);
    const hit = raycaster.intersectObject(ground, true)[0];
    if (!hit) return null;
    if (hit.face) {
      normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      if (normal.y < 1 - maxSlope) return null;
    }
    return hit.point.y;
  });
}

/**
 * One kelp stalk, 1 unit tall: two crossed ribbons (readable from any side) with a
 * wavy, tapering edge of alternating blade lobes. Vertex colours run from a dark root to a
 * sunlit tip; `width` is in world units (the instance scales height only).
 */
export function createKelpGeometry(baseColor: string, tipColor: string, width = 0.56): BufferGeometry {
  const base = new Color(baseColor);
  const tip = new Color(tipColor);
  const builder = new LowPolyBuilder();
  const SEGMENTS = 8;
  for (const angle of [0, Math.PI / 2]) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const edge = (i: number, side: number): Vec3 => {
      const y = i / SEGMENTS;
      const lobe = i % 2 === 0 ? 1 : 0.45;
      const half = (width / 2) * (1 - 0.7 * y) * lobe * (i === 0 ? 0.25 : 1);
      const sway = Math.sin(y * 5 + angle) * 0.04;
      return [cos * half * side + sway * sin, y, sin * half * side - sway * cos];
    };
    for (let i = 0; i < SEGMENTS; i++) {
      const c0 = base.clone().lerp(tip, i / SEGMENTS);
      const c1 = base.clone().lerp(tip, (i + 1) / SEGMENTS);
      const a = edge(i, -1);
      const b = edge(i, 1);
      const c = edge(i + 1, 1);
      const d = edge(i + 1, -1);
      builder.triangle(a, b, c, [c0, c0, c1]).triangle(a, c, d, [c0, c1, c1]);
    }
  }
  return builder.build();
}

export interface KelpMaterialOptions {
  readonly time: IUniform<number>;
  /** Tip sway, world units. */
  readonly sway: number;
}

/**
 * Lambert, flat-shaded, fogged, double-sided. The vertex patch bends each stalk with the
 * square of its height in two slow, detuned sines, phased by the stalk's root position so
 * the bed ripples rather than nodding in unison.
 */
export function createKelpMaterial({ time, sway }: KelpMaterialOptions): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide });
  return applyVertexMotion(material, {
    uniforms: { [AMBIENT_TIME_UNIFORM]: time, uKelpSway: { value: sway } },
    declarations: `uniform float ${AMBIENT_TIME_UNIFORM};\nuniform float uKelpSway;`,
    transform: /* glsl */ `
      #ifdef USE_INSTANCING
        vec3 kelpRoot = vec3( instanceMatrix[3] );
      #else
        vec3 kelpRoot = vec3( 0.0 );
      #endif
      float kelpPhase = kelpRoot.x * 0.37 + kelpRoot.z * 0.23;
      float kelpBend = position.y * position.y * uKelpSway;
      float kelpTime = ${AMBIENT_TIME_UNIFORM};
      transformed.x += ( sin( kelpTime * 0.7 + kelpPhase ) + 0.35 * sin( kelpTime * 1.9 + kelpPhase * 2.0 ) ) * kelpBend;
      transformed.z += cos( kelpTime * 0.56 + kelpPhase * 1.3 ) * 0.6 * kelpBend;
    `,
    cacheKey: 'ambient-kelp',
  });
}
