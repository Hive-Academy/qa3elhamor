import { Color, MeshBasicMaterial, type ColorRepresentation, type WebGLProgramParametersWithUniforms } from 'three';

/**
 * The underwater look for troika SDF text (drei `<Text>`): animated world-space caustic shimmer,
 * a per-glyph wave wobble, a per-glyph "surfacing" pop-in driven by a reveal head, and a slight
 * chromatic tint. The aqua glow itself is troika's own outline pass (`outlineWidth` /
 * `outlineBlur`), which this shader also shimmers.
 *
 * How it hooks in (troika-three-text 0.52): troika wraps whatever base material a Text mesh is
 * given in its own derived material and calls the base's `onBeforeCompile` first, on the plain
 * MeshBasicMaterial shader. This patch runs there, so after troika renames `position`, the
 * `transformed` vertex below is the glyph corner already laid out by troika, and the patched
 * `main()` body sits after troika's declarations (`vTroikaGlyphUV`, `uTroikaBlurRadius`, ...).
 *
 * Glyph order comes from our own `aOceanGlyph` instance attribute (set from troika's glyph bounds
 * on every sync, see `oceanGlyphData`), not from `aTroikaGlyphIndex`: that is the glyph's slot in
 * the SDF atlas, shared by repeated letters, not its position in the text.
 */

export interface OceanTextUniforms {
  /** Seconds, from the scene clock; held at 0 under reduced motion. */
  readonly uOceanTime: { value: number };
  /** 1 animates wobble and pop-in; 0 is the static, reduced-motion look. */
  readonly uOceanMotion: { value: number };
  /** Glyphs surfaced so far (fractional: the next glyph is mid-pop). */
  readonly uOceanRevealHead: { value: number };
  /** The text's font size in local units, the scale for wobble and rise. */
  readonly uOceanEm: { value: number };
  /** Caustic shimmer strength, 0..1. */
  readonly uOceanShimmer: { value: number };
  /** Chromatic tint strength, 0..1. */
  readonly uOceanTint: { value: number };
  /** Colour of the caustic highlights. */
  readonly uOceanCausticColor: { value: Color };
}

export interface OceanTextMaterialOptions {
  readonly shimmer?: number;
  readonly tint?: number;
  readonly causticColor?: ColorRepresentation;
}

export interface OceanTextMaterial {
  /** Pass as drei `<Text material={...}>`; troika derives its SDF material from it. */
  readonly material: MeshBasicMaterial;
  readonly uniforms: OceanTextUniforms;
}

/** Bumped whenever the GLSL below changes, so three and troika recompile instead of reusing. */
const PROGRAM_KEY = 'ocean-text/1';

/**
 * A cheap animated caustic field (three warped interference layers), shared with the bubble.
 * Returns ~0..1.4, bright filaments on a dim base.
 */
export const OCEAN_CAUSTIC_GLSL = /* glsl */ `
float oceanCaustic(vec3 p, float t) {
  vec2 uv = p.xy * 1.6 + vec2(p.z * 0.45, p.z * 0.2);
  float c = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 q = uv * (1.0 + fi * 0.45) + vec2(fi * 1.7, fi * 2.3);
    q += vec2(sin(q.y * 1.3 + t * (0.55 + fi * 0.12)), cos(q.x * 1.1 - t * (0.47 + fi * 0.1)));
    float ridge = abs(sin(q.x + sin(q.y * 0.8 + t * 0.3)) * cos(q.y - t * 0.21));
    c += pow(1.0 - ridge, 6.0);
  }
  return c * 0.55;
}
`;

const VERTEX_DEFS = /* glsl */ `
attribute vec4 aOceanGlyph;
uniform float uOceanTime;
uniform float uOceanMotion;
uniform float uOceanRevealHead;
uniform float uOceanEm;
varying vec3 vOceanWorld;
varying float vOceanReveal;
float oceanEaseOutBack(float x) {
  float c1 = 1.70158;
  float c3 = c1 + 1.0;
  float y = x - 1.0;
  return 1.0 + c3 * y * y * y + c1 * y * y;
}
`;

const VERTEX_GLYPH = /* glsl */ `
{
  float oceanP = clamp(uOceanRevealHead - aOceanGlyph.z, 0.0, 1.0);
  float oceanPop = oceanEaseOutBack(oceanP);
  vec2 oceanCenter = aOceanGlyph.xy;
  // Surfacing: each glyph grows from 35% and rises half an em into place.
  float oceanScale = mix(1.0, mix(0.35, 1.0, oceanPop), uOceanMotion);
  transformed.xy = oceanCenter + (transformed.xy - oceanCenter) * oceanScale;
  transformed.y -= (1.0 - clamp(oceanPop, 0.0, 1.0)) * 0.5 * uOceanEm * uOceanMotion;
  // Wave: a slow swell travelling along the line. The phase follows the glyph's x, not its order,
  // so neighbours move almost together and Arabic's joined letters never step apart.
  float oceanPhase = uOceanTime * 1.6 + oceanCenter.x / max(uOceanEm, 1e-4) * 0.45;
  transformed.y += sin(oceanPhase) * 0.035 * uOceanEm * uOceanMotion;
  transformed.x += cos(oceanPhase * 0.7) * 0.008 * uOceanEm * uOceanMotion;
  vOceanReveal = oceanP;
  vOceanWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
}
`;

const FRAGMENT_DEFS = /* glsl */ `
uniform float uOceanTime;
uniform float uOceanShimmer;
uniform float uOceanTint;
uniform vec3 uOceanCausticColor;
varying vec3 vOceanWorld;
varying float vOceanReveal;
${OCEAN_CAUSTIC_GLSL}
`;

// Runs inside main(), after troika's declarations, so troika's varyings and uniforms are in scope.
const FRAGMENT_COLOR = /* glsl */ `
{
  bool oceanGlow = uTroikaBlurRadius > 0.0 || uTroikaEdgeOffset > 0.0;
  float oceanC = oceanCaustic(vOceanWorld, uOceanTime);
  // A slow diagonal glint sweeping across the line, like light through a moving surface.
  float oceanSweep = pow(0.5 + 0.5 * sin(vOceanWorld.x * 0.9 + vOceanWorld.y * 0.6 - uOceanTime * 1.1), 14.0);
  float oceanLift = uOceanShimmer * (oceanC * (oceanGlow ? 0.9 : 0.45) + oceanSweep * (oceanGlow ? 0.5 : 0.35));
  outgoingLight = outgoingLight * (1.0 - 0.12 * uOceanShimmer) + mix(outgoingLight, uOceanCausticColor, 0.55) * oceanLift;
  if (!oceanGlow) {
    // Chromatic tint: cooler at the glyph's foot, warmer at its crown.
    vec3 oceanTintColor = mix(vec3(0.84, 0.98, 1.12), vec3(1.1, 1.03, 0.9), clamp(vTroikaGlyphUV.y, 0.0, 1.0));
    outgoingLight = mix(outgoingLight, outgoingLight * oceanTintColor, uOceanTint);
  }
  diffuseColor.a *= smoothstep(0.0, 0.55, vOceanReveal);
}
`;

const VERTEX_ANCHOR = '#include <begin_vertex>';
const FRAGMENT_ANCHOR = '#include <opaque_fragment>';
const MAIN_RE = /\bvoid\s+main\s*\(\s*\)\s*\{/u;

/**
 * Applies the ocean patch to a MeshBasicMaterial's shader sources. Throws when an anchor is
 * missing (a three.js upgrade that moved a chunk), rather than compiling text without effects.
 */
export function patchOceanTextShader(shader: { vertexShader: string; fragmentShader: string }): void {
  const { vertexShader, fragmentShader } = shader;
  if (!vertexShader.includes(VERTEX_ANCHOR) || !MAIN_RE.test(vertexShader)) {
    throw new Error(`ocean-text: vertex shader has no ${VERTEX_ANCHOR} or main()`);
  }
  if (!fragmentShader.includes(FRAGMENT_ANCHOR) || !MAIN_RE.test(fragmentShader)) {
    throw new Error(`ocean-text: fragment shader has no ${FRAGMENT_ANCHOR} or main()`);
  }
  shader.vertexShader = vertexShader
    .replace(MAIN_RE, (main) => `${VERTEX_DEFS}\n${main}`)
    .replace(VERTEX_ANCHOR, `${VERTEX_ANCHOR}\n${VERTEX_GLYPH}`);
  shader.fragmentShader = fragmentShader
    .replace(MAIN_RE, (main) => `${FRAGMENT_DEFS}\n${main}`)
    .replace(FRAGMENT_ANCHOR, `${FRAGMENT_COLOR}\n${FRAGMENT_ANCHOR}`);
}

/**
 * One base material per `OceanText` (its uniforms carry that text's reveal head). The shader
 * program is shared by every instance: the GLSL is identical and the cache key is constant.
 */
export function createOceanTextMaterial(options: OceanTextMaterialOptions = {}): OceanTextMaterial {
  const uniforms: OceanTextUniforms = {
    uOceanTime: { value: 0 },
    uOceanMotion: { value: 1 },
    uOceanRevealHead: { value: 0 },
    uOceanEm: { value: 0.1 },
    uOceanShimmer: { value: options.shimmer ?? 0.6 },
    uOceanTint: { value: options.tint ?? 0.35 },
    uOceanCausticColor: { value: new Color(options.causticColor ?? '#b9fbff') },
  };
  // Unlit so the words stay readable in deep-water lighting; fogged so they sit in the water.
  const material = new MeshBasicMaterial({ toneMapped: false, transparent: true });
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    patchOceanTextShader(shader);
    Object.assign(shader.uniforms, uniforms);
  };
  material.customProgramCacheKey = () => PROGRAM_KEY;
  return { material, uniforms };
}
