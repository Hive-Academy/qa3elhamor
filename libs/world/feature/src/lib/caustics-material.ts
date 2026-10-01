import {
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RedFormat,
  RepeatWrapping,
  UnsignedByteType,
  type IUniform,
  type Material,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { createCausticsPattern } from './caustics-pattern.js';
import type { OceanCausticsConfig } from './ocean-config.js';

/**
 * Caustics projected straight down onto every lit surface of the map.
 *
 * Rather than a separate decal mesh, the map's own materials are patched: the vertex stage
 * passes the world position through, the fragment stage samples one shared caustics texture
 * twice at world XZ (two scales drifting in different directions; `min` of the pair gives
 * the shifting filament look) and adds it to up-facing surfaces before fog, so distant
 * caustics fade into the murk. One texture, one set of shared uniforms, no extra draw calls.
 */
export interface CausticsUniforms {
  readonly uCausticsMap: IUniform<Texture>;
  /** Pattern offset in tiles; advanced by the scene clock (`speed` x elapsed). */
  readonly uCausticsTime: IUniform<number>;
  readonly uCausticsIntensity: IUniform<number>;
  readonly uCausticsScale: IUniform<number>;
  readonly uCausticsColor: IUniform<Color>;
  [uniform: string]: IUniform;
}

const VERTEX_ANCHOR = '#include <project_vertex>';
const FRAGMENT_ANCHOR = '#include <tonemapping_fragment>';
const PROGRAM_KEY = 'ocean-caustics';

/**
 * Caustics time wraps at this many tiles. Every drift vector in the fragment patch has
 * components that are multiples of 0.01, so after 100 tiles both samples are back on whole
 * texture repeats and the wrap is seamless, while float32 precision stays fine forever.
 */
export const CAUSTICS_TIME_PERIOD = 100;

const patterns = new Map<number, Uint8Array>();

/**
 * The pattern is content-identical for a given size, so it is generated once per page. That
 * keeps StrictMode's double-invoked initialisers (and remounts) from redoing the CPU work;
 * the `DataTexture` wrapper itself holds no GPU memory until it is first rendered.
 */
const cachedPattern = (size: number): Uint8Array => {
  let pattern = patterns.get(size);
  if (!pattern) {
    pattern = createCausticsPattern(size);
    patterns.set(size, pattern);
  }
  return pattern;
};

export function createCausticsTexture(size = 256): DataTexture {
  const texture = new DataTexture(
    cachedPattern(size),
    size,
    size,
    RedFormat,
    UnsignedByteType
  );
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function createCausticsUniforms(
  texture: Texture,
  config: OceanCausticsConfig
): CausticsUniforms {
  return {
    uCausticsMap: { value: texture },
    uCausticsTime: { value: 0 },
    uCausticsIntensity: { value: config.intensity },
    uCausticsScale: { value: config.scale },
    uCausticsColor: { value: new Color(config.color) },
  };
}

/** Writes config changes into live uniforms without recompiling any program. */
export function updateCausticsUniforms(
  uniforms: CausticsUniforms,
  config: OceanCausticsConfig
): void {
  uniforms.uCausticsIntensity.value = config.intensity;
  uniforms.uCausticsScale.value = config.scale;
  uniforms.uCausticsColor.value.set(config.color);
}

const requireAnchor = (source: string, anchor: string, stage: string): void => {
  if (!source.includes(anchor)) {
    throw new Error(`Caustics patch: ${stage} shader has no "${anchor}" to inject after.`);
  }
};

/** Adds the world-position varying to a built-in three.js vertex shader. */
export function injectCausticsVertex(source: string): string {
  requireAnchor(source, VERTEX_ANCHOR, 'vertex');
  return `varying vec3 vCausticsWorld;\n${source.replace(
    VERTEX_ANCHOR,
    `${VERTEX_ANCHOR}
	vec4 causticsWorld = vec4( transformed, 1.0 );
	#ifdef USE_INSTANCING
		causticsWorld = instanceMatrix * causticsWorld;
	#endif
	vCausticsWorld = ( modelMatrix * causticsWorld ).xyz;`
  )}`;
}

/** Adds the caustics term to a built-in three.js fragment shader, before tone mapping and fog. */
export function injectCausticsFragment(source: string): string {
  requireAnchor(source, FRAGMENT_ANCHOR, 'fragment');
  return `varying vec3 vCausticsWorld;
uniform sampler2D uCausticsMap;
uniform float uCausticsTime;
uniform float uCausticsIntensity;
uniform float uCausticsScale;
uniform vec3 uCausticsColor;
${source.replace(
  FRAGMENT_ANCHOR,
  `{
		vec2 causticsUv = vCausticsWorld.xz / uCausticsScale;
		float causticsA = texture2D( uCausticsMap, causticsUv + uCausticsTime * vec2( 0.83, 0.47 ) ).r;
		float causticsB = texture2D( uCausticsMap, causticsUv * 1.37 + vec2( 0.31, 0.62 ) - uCausticsTime * vec2( 0.52, 0.79 ) ).r;
		vec3 causticsCross = cross( dFdx( vCausticsWorld ), dFdy( vCausticsWorld ) );
		float causticsCrossLength = length( causticsCross );
		// Degenerate derivatives (edge-on or sub-pixel geometry) would normalise a zero vector
		// into NaN; treat those fragments as not up-facing instead.
		float causticsFacing = causticsCrossLength > 1e-10
			? smoothstep( 0.35, 0.9, abs( causticsCross.y ) / causticsCrossLength )
			: 0.0;
		float causticsLight = min( causticsA, causticsB ) * causticsFacing * uCausticsIntensity;
		gl_FragColor.rgb += diffuseColor.rgb * uCausticsColor * causticsLight;
	}
	${FRAGMENT_ANCHOR}`
)}`;
}

type PatchableMaterial = Material & {
  readonly isMeshStandardMaterial?: boolean;
  readonly isMeshBasicMaterial?: boolean;
  readonly isMeshLambertMaterial?: boolean;
  readonly isMeshPhongMaterial?: boolean;
};

/** Built-in mesh materials whose shaders carry both anchors and a `diffuseColor`. */
export const isCausticsCompatible = (material: Material): boolean => {
  const m = material as PatchableMaterial;
  return Boolean(
    m.isMeshStandardMaterial ||
      m.isMeshBasicMaterial ||
      m.isMeshLambertMaterial ||
      m.isMeshPhongMaterial
  );
};

/**
 * Binds a material to the given caustics uniforms. Idempotent: re-binding the same uniforms
 * is a no-op, binding new ones (a remount) forces one recompile. Returns false for materials
 * the patch does not support, which are left untouched.
 */
export function applyCaustics(material: Material, uniforms: CausticsUniforms): boolean {
  if (!isCausticsCompatible(material)) return false;
  if (material.userData['causticsUniforms'] === uniforms) return true;

  material.userData['causticsUniforms'] = uniforms;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = injectCausticsVertex(shader.vertexShader);
    shader.fragmentShader = injectCausticsFragment(shader.fragmentShader);
  };
  material.customProgramCacheKey = () => PROGRAM_KEY;
  material.needsUpdate = true;
  return true;
}

/**
 * Undoes `applyCaustics`: restores the material's built-in shader hooks and forces one
 * recompile, so a tier with caustics off pays nothing for them. No-op on unpatched materials.
 */
export function removeCaustics(material: Material): void {
  if (!('causticsUniforms' in material.userData)) return;
  delete material.userData['causticsUniforms'];
  // The patch set own properties; deleting them re-exposes three's prototype defaults.
  Reflect.deleteProperty(material, 'onBeforeCompile');
  Reflect.deleteProperty(material, 'customProgramCacheKey');
  material.needsUpdate = true;
}
