import {
  Color,
  FrontSide,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  type ColorRepresentation,
  type IUniform,
} from 'three';

/**
 * An underwater soap bubble: almost clear in the middle, a thin-film (iridescent) rim, a
 * bright window highlight, a soft core glow in the group's colour and a caustic shimmer
 * drifting across it. The surface wobbles gently. Fog-aware (the world's exponential fog), so
 * it sinks into the murk with the rest of the town.
 */
export interface SkillBubbleUniforms {
  readonly [name: string]: IUniform;
  readonly uTime: IUniform<number>;
  /** 0 to 1: grows the rim and glow while the bubble is selected. */
  readonly uHighlight: IUniform<number>;
  /** Overall opacity: 0 inside the door, 1 out in the water; lower when another is selected. */
  readonly uOpacity: IUniform<number>;
  readonly uTint: IUniform<Color>;
  /** Per-bubble phase, so no two wobble together. */
  readonly uSeed: IUniform<number>;
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  varying vec3 vPosW;
  varying vec3 vLocal;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    // A slow, jelly-like wobble along the normal: two lobes travelling round the bubble.
    float wobble = 0.035 * sin(uTime * 1.7 + uSeed + position.y * 3.1)
      + 0.025 * sin(uTime * 2.3 + uSeed * 1.7 + position.x * 2.7);
    vec3 displaced = position + normal * wobble;
    vec4 world = modelMatrix * vec4(displaced, 1.0);
    vPosW = world.xyz;
    vLocal = position;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = cameraPosition - world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uHighlight;
  uniform float uOpacity;
  uniform vec3 uTint;
  uniform float uSeed;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  varying vec3 vPosW;
  varying vec3 vLocal;
  #include <common>
  #include <fog_pars_fragment>

  // Thin-film interference, approximated: a hue that turns with the film's apparent thickness.
  vec3 film(float t) {
    return 0.55 + 0.45 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + t));
  }

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(vViewW);
    float ndv = clamp(dot(n, v), 0.0, 1.0);
    float rim = pow(1.0 - ndv, 2.4);

    vec3 iridescent = film(rim * 1.3 + vLocal.y * 0.35 + uTime * 0.04 + uSeed * 0.1);

    // Caustic shimmer: a net of light drifting across the film, as on the seabed.
    vec3 p = vPosW * 2.6;
    float c = sin(p.x + uTime * 0.9 + sin(p.z * 1.3 + uTime * 0.7))
      * sin(p.z - uTime * 0.8 + sin(p.y * 1.7 - uTime * 0.6));
    float caustic = smoothstep(0.55, 0.95, c) * (0.35 + 0.65 * ndv);

    // The window highlight from the light above, and a faint second one below.
    vec3 lightDir = normalize(vec3(-0.35, 0.85, 0.4));
    float spec = pow(max(dot(reflect(-lightDir, n), v), 0.0), 60.0);
    float spec2 = pow(max(dot(reflect(normalize(vec3(0.4, -0.6, 0.5)), n), v), 0.0), 24.0) * 0.25;

    float core = pow(ndv, 3.0);
    vec3 colour = uTint * (0.26 + 0.42 * core + 0.55 * rim) * (1.0 + 1.2 * uHighlight)
      + iridescent * rim * (0.9 + 0.6 * uHighlight)
      + vec3(0.85, 0.97, 1.0) * caustic * 0.28
      + vec3(1.0) * (spec * 1.4 + spec2);

    float alpha = 0.15 + 0.14 * uHighlight + rim * 0.8 + spec + caustic * 0.12 + core * 0.08;
    gl_FragColor = vec4(colour, clamp(alpha, 0.0, 1.0) * uOpacity);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function createSkillBubbleMaterial(
  tint: ColorRepresentation,
  seed: number,
): ShaderMaterial & { uniforms: SkillBubbleUniforms } {
  const uniforms = UniformsUtils.merge([
    UniformsLib.fog,
    {
      uTime: { value: 0 },
      uHighlight: { value: 0 },
      uOpacity: { value: 0 },
      uTint: { value: new Color(tint) },
      uSeed: { value: seed },
    },
  ]) as SkillBubbleUniforms;
  return new ShaderMaterial({
    name: 'skill-bubble',
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: FrontSide,
    fog: true,
  }) as ShaderMaterial & { uniforms: SkillBubbleUniforms };
}

/** One colour per skill group, in order, cycling: sea glass, coral, sand gold, kelp, anemone. */
export const SKILL_BUBBLE_TINTS: readonly string[] = [
  '#5fe0d0',
  '#ff8a6b',
  '#ffd36b',
  '#8cf0a0',
  '#c79bff',
  '#7cc8ff',
];
