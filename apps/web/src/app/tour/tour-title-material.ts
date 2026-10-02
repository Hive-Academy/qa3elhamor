import { Color, MeshPhysicalMaterial, type Texture } from 'three';

/*
 * The hero title's "aquarium" material: mother-of-pearl (a thin-film iridescence over a pale,
 * clear-coated body, lit by a small studio environment) with caustics rippling across it, the
 * light of the surface as it would play over a shell on the seabed.
 */

/** A layered-sine water caustic, after the well-known "water turbulence" shader. */
const CAUSTIC_GLSL = /* glsl */ `
uniform float uTitleTime;
uniform float uTitleCaustics;
varying vec3 vTitlePosition;
float titleCaustic(vec2 uv, float t) {
  // The pattern repeats every unit of uv; the large offset is what keeps the base dark and
  // leaves only the bright filaments.
  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
  vec2 i = p;
  float c = 1.0;
  const float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}
`;

export interface TitleMaterial {
  readonly material: MeshPhysicalMaterial;
  readonly uniforms: {
    readonly uTitleTime: { value: number };
    /** Caustic strength, 0 for none. */
    readonly uTitleCaustics: { value: number };
  };
}

export function createTitleMaterial(envMap: Texture | null): TitleMaterial {
  const uniforms = { uTitleTime: { value: 0 }, uTitleCaustics: { value: 1 } };
  const material = new MeshPhysicalMaterial({
    color: new Color('#d3ecf5'),
    metalness: 0.32,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    iridescence: 1,
    iridescenceIOR: 1.45,
    iridescenceThicknessRange: [120, 1100],
    sheen: 0.7,
    sheenRoughness: 0.35,
    sheenColor: new Color('#8fe6ff'),
    emissive: new Color('#0b3a55'),
    emissiveIntensity: 0.45,
    envMap,
    envMapIntensity: 0.9,
    transparent: true,
    fog: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uTitleTime'] = uniforms.uTitleTime;
    shader.uniforms['uTitleCaustics'] = uniforms.uTitleCaustics;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vTitlePosition;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvTitlePosition = position;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${CAUSTIC_GLSL}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float titleLight = titleCaustic(vTitlePosition.xy * 0.35 + vec2(vTitlePosition.z * 0.2), uTitleTime * 0.5);
        totalEmissiveRadiance += vec3(0.42, 0.86, 1.0) * titleLight * 1.3 * uTitleCaustics;`,
      );
  };
  // One program for every title, whatever the uniforms' values.
  material.customProgramCacheKey = () => 'qaa-title-pearl';
  return { material, uniforms };
}
