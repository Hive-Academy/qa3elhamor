import {
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  type IUniform,
} from 'three';
import { seededRandom } from './seeded-random.js';
import type { Vec3 } from './world-space.js';

/**
 * GPU-animated particles: one instanced draw call per field and zero per-frame CPU work
 * beyond a shared time uniform.
 *
 * Each instance carries a 4-float seed (normalised xyz home inside the volume, plus a
 * per-instance random). The vertex shader rises it through the volume with `fract`, adds a
 * sideways wobble and expands a camera-facing quad, so no matrices are rewritten per frame.
 * This is `InstancedBufferGeometry` rather than `InstancedMesh` because an instance matrix
 * would have to be recomputed on the CPU every frame to move anything.
 */
export interface ParticleFieldOptions {
  readonly count: number;
  readonly seed: number;
  readonly volumeMin: Vec3;
  readonly volumeSize: Vec3;
  readonly color: string;
  readonly size: number;
  /** Mean rise speed, world units per second. */
  readonly riseSpeed: number;
  /** Sideways sway amplitude, world units. */
  readonly wobble: number;
  /** 0 renders a soft plankton dot, 1 a bubble rim with a highlight. */
  readonly ring: number;
  readonly opacity: number;
}

/** `count` x 4 floats: normalised home position (xyz in [0,1)) and a per-instance random. */
/**
 * The particle clock wraps at this many seconds. The shader quantises every per-instance
 * frequency (rise cycles and sway) to a whole number of cycles per period, so the wrap is
 * invisible, and the clock never grows large enough for float32 precision to make motion step.
 */
export const PARTICLE_TIME_PERIOD = 3600;

export function createParticleSeeds(count: number, seed: number): Float32Array {
  const random = seededRandom(seed);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = random();
  return seeds;
}

export function createParticleGeometry(count: number, seed: number): InstancedBufferGeometry {
  const quad = new PlaneGeometry(1, 1);
  const geometry = new InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.getAttribute('position'));
  geometry.setAttribute('uv', quad.getAttribute('uv'));
  geometry.setAttribute('aSeed', new InstancedBufferAttribute(createParticleSeeds(count, seed), 4));
  geometry.instanceCount = count;
  return geometry;
}

const VERTEX_SHADER = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

attribute vec4 aSeed;
uniform float uTime;
uniform vec3 uVolumeMin;
uniform vec3 uVolumeSize;
uniform float uSize;
uniform float uRise;
uniform float uWobble;
varying vec2 vUv;
varying float vAlpha;

void main() {
	// Time as a fraction of the wrap period; every motion below completes a whole number of
	// cycles per period, so uTime wrapping to 0 is seamless.
	float cycle = uTime / PERIOD;
	float speed = 0.6 + 0.8 * aSeed.w;
	vec3 home = aSeed.xyz;
	float riseCycles = floor( PERIOD * uRise * speed / uVolumeSize.y + 0.5 );
	home.y = fract( home.y + riseCycles * cycle );
	vec3 world = uVolumeMin + home * uVolumeSize;
	float phase = aSeed.w * 43.0;
	float swayX = floor( 0.7 * speed * PERIOD / PI2 + 0.5 );
	float swayZ = floor( 0.53 * speed * PERIOD / PI2 + 0.5 );
	world.x += sin( PI2 * swayX * cycle + phase ) * uWobble;
	world.z += cos( PI2 * swayZ * cycle + phase * 1.7 ) * uWobble;

	vec4 mvPosition = modelViewMatrix * vec4( world, 1.0 );
	mvPosition.xy += position.xy * uSize * ( 0.5 + aSeed.w );
	gl_Position = projectionMatrix * mvPosition;

	vUv = uv;
	vAlpha = smoothstep( 0.0, 0.06, home.y ) * ( 1.0 - smoothstep( 0.9, 1.0, home.y ) );
	#include <fog_vertex>
}
`;

const FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform vec3 uColor;
uniform float uRing;
uniform float uOpacity;
varying vec2 vUv;
varying float vAlpha;

void main() {
	float d = length( vUv - 0.5 ) * 2.0;
	if ( d > 1.0 ) discard;
	float soft = 1.0 - smoothstep( 0.0, 1.0, d );
	float rim = smoothstep( 0.55, 0.85, d ) * ( 1.0 - smoothstep( 0.85, 1.0, d ) );
	float glint = 1.0 - smoothstep( 0.0, 0.3, length( vUv - vec2( 0.36, 0.64 ) ) * 2.0 );
	float shape = mix( soft, rim + 0.6 * glint, uRing );
	gl_FragColor = vec4( uColor, shape * vAlpha * uOpacity );
	#include <fog_fragment>
	#include <colorspace_fragment>
}
`;

export function createParticleMaterial(
  options: ParticleFieldOptions,
  time: IUniform<number>
): ShaderMaterial {
  const uniforms = UniformsUtils.merge([
    UniformsLib.fog,
    {
      uVolumeMin: { value: new Vector3(...options.volumeMin) },
      uVolumeSize: { value: new Vector3(...options.volumeSize) },
      uSize: { value: options.size },
      uRise: { value: options.riseSpeed },
      uWobble: { value: options.wobble },
      uColor: { value: new Color(options.color) },
      uRing: { value: options.ring },
      uOpacity: { value: options.opacity },
    },
  ]);
  // Shared by reference (merge clones), so one write per frame animates every field.
  uniforms['uTime'] = time;

  return new ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    defines: { PERIOD: PARTICLE_TIME_PERIOD.toFixed(1) },
    fog: true,
    transparent: true,
    depthWrite: false,
  });
}
