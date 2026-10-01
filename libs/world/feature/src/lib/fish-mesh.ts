import { BufferGeometry, Color, DoubleSide, MeshLambertMaterial, type IUniform } from 'three';
import { AMBIENT_TIME_UNIFORM } from './ambient-clock.js';
import { LowPolyBuilder } from './low-poly-builder.js';
import { applyVertexMotion } from './vertex-motion.js';
import type { Vec3 } from './world-space.js';

/**
 * One small fish, 1 unit long with its nose at +Z, in 14 flat triangles: a diamond body, a
 * thin peduncle and a forked tail. Vertex colours are multipliers on the school's material
 * colour: a dark back, the flank at 1, a bright belly.
 */
export function createFishGeometry(): BufferGeometry {
  const back = new Color(0.42, 0.45, 0.5);
  const flank = new Color(1, 1, 1);
  const belly = new Color(1.55, 1.55, 1.5);
  const fin = new Color(0.75, 0.78, 0.82);

  const nose: Vec3 = [0, 0, 0.5];
  const top: Vec3 = [0, 0.15, 0.08];
  const bottom: Vec3 = [0, -0.12, 0.08];
  const right: Vec3 = [0.07, 0.01, 0.08];
  const left: Vec3 = [-0.07, 0.01, 0.08];
  const pTop: Vec3 = [0, 0.035, -0.3];
  const pBottom: Vec3 = [0, -0.03, -0.3];
  const pRight: Vec3 = [0.018, 0, -0.3];
  const pLeft: Vec3 = [-0.018, 0, -0.3];
  const tailTop: Vec3 = [0, 0.17, -0.5];
  const tailNotch: Vec3 = [0, 0, -0.41];
  const tailBottom: Vec3 = [0, -0.15, -0.5];

  return new LowPolyBuilder()
    // Head cone.
    .triangle(nose, top, right, back)
    .triangle(nose, right, bottom, belly)
    .triangle(nose, bottom, left, belly)
    .triangle(nose, left, top, back)
    // Body to the peduncle.
    .quad(top, pTop, pRight, right, back, flank)
    .quad(right, pRight, pBottom, bottom, flank, belly)
    .quad(bottom, pBottom, pLeft, left, belly, flank)
    .quad(left, pLeft, pTop, top, flank, back)
    // Forked tail: two lobes meeting at the peduncle.
    .triangle(pTop, tailTop, tailNotch, fin)
    .triangle(pBottom, tailNotch, tailBottom, fin)
    .build();
}

export interface FishMaterialOptions {
  readonly color: string;
  /** Shared ambient clock (seconds). */
  readonly time: IUniform<number>;
}

/**
 * Lambert, flat-shaded, fogged. The vertex patch swings the rear of each fish side to side,
 * with a per-instance phase from `gl_InstanceID` so a school never beats in unison.
 */
export function createFishMaterial({ color, time }: FishMaterialOptions): MeshLambertMaterial {
  const material = new MeshLambertMaterial({
    color,
    vertexColors: true,
    flatShading: true,
    side: DoubleSide,
    // Keeps a school's colour readable under the blue light rig; fog still fades it.
    emissive: color,
    emissiveIntensity: 0.18,
  });
  return applyVertexMotion(material, {
    uniforms: { [AMBIENT_TIME_UNIFORM]: time },
    declarations: `uniform float ${AMBIENT_TIME_UNIFORM};`,
    transform: /* glsl */ `
      float fishPhase = float( gl_InstanceID ) * 2.39996;
      float fishBend = 1.0 - smoothstep( -0.5, 0.3, position.z );
      transformed.x += sin( ${AMBIENT_TIME_UNIFORM} * 9.0 + fishPhase - position.z * 5.0 ) * 0.1 * fishBend;
    `,
    cacheKey: 'ambient-fish',
  });
}
