import { DoubleSide, MeshStandardMaterial } from 'three';
import { applyVertexMotion, type VertexMotionPatch } from './vertex-motion.js';

export interface NarratorMaterialOptions {
  readonly roughness: number;
  /**
   * Self-lit share of each face's own vertex colour (0..1). The blue light rig turns small
   * saturated details (a red sash, a gold medal, pink cheeks) to murk; a little of the face's
   * own colour as emissive keeps them reading at any depth. Fog still applies on top.
   */
  readonly glow: number;
  /** A vertex-motion patch; omitted for a cast whose parts are moved whole (jointed). */
  readonly motion?: VertexMotionPatch;
  /** Distinguishes a material without motion in three's program cache. */
  readonly cacheKey?: string;
}

/**
 * The cast's material: standard, flat-shaded, double-sided, fogged, vertex-coloured, with the
 * cast's vertex-motion patch and an emissive lift tinted by each face's vertex colour.
 */
export function createNarratorMaterial({ roughness, glow, motion, cacheKey }: NarratorMaterialOptions): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness,
    metalness: 0,
    side: DoubleSide,
    emissive: '#ffffff',
    emissiveIntensity: glow,
  });
  if (motion) applyVertexMotion(material, motion);
  else if (cacheKey) material.customProgramCacheKey = () => cacheKey;
  const vertexStage = motion ? material.onBeforeCompile : null;
  material.onBeforeCompile = (shader, renderer) => {
    vertexStage?.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;'
    );
  };
  return material;
}
