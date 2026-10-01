import type { IUniform, Material } from 'three';

/**
 * A vertex-shader motion patch for a built-in three material: extra uniforms, declarations
 * placed before `main`, and GLSL that edits `transformed` (object space, before the instance
 * and model matrices) right after `<begin_vertex>`.
 *
 * Built-in materials keep fog, lighting and instancing for free. Use `flatShading: true`
 * where the motion bends a surface: flat shading derives normals from screen-space
 * derivatives, so lighting follows the deformed shape without touching the normals.
 */
export interface VertexMotionPatch {
  /** Shared by reference: writing `.value` once animates every material holding it. */
  readonly uniforms: Readonly<Record<string, IUniform>>;
  readonly declarations: string;
  readonly transform: string;
  /** Distinguishes this patch in three's program cache. */
  readonly cacheKey: string;
}

export function applyVertexMotion<T extends Material>(material: T, patch: VertexMotionPatch): T {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, patch.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${patch.declarations}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${patch.transform}`);
  };
  material.customProgramCacheKey = () => patch.cacheKey;
  return material;
}
