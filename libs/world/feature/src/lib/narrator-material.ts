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
  readonly motion: VertexMotionPatch;
}

/**
 * The cast's material: standard, flat-shaded, double-sided, fogged, vertex-coloured, with the
 * cast's vertex-motion patch and an emissive lift tinted by each face's vertex colour.
 */
export function createNarratorMaterial({ roughness, glow, motion }: NarratorMaterialOptions): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness,
    metalness: 0,
    side: DoubleSide,
    emissive: '#ffffff',
    emissiveIntensity: glow,
  });
  applyVertexMotion(material, motion);
  const vertexStage = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    vertexStage.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;'
    );
  };
  return material;
}
