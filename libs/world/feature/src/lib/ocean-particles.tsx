import { useEffect, useMemo } from 'react';
import type { IUniform } from 'three';
import { splitParticleCount, type OceanParticlesConfig } from './ocean-config.js';
import {
  createParticleGeometry,
  createParticleMaterial,
  type ParticleFieldOptions,
} from './particle-field.js';
import { WATER_VOLUME, type Vec3 } from './world-space.js';

/** Particles fill the lower, camera-visible part of the water volume. */
const PARTICLE_VOLUME_MIN: Vec3 = [WATER_VOLUME.min[0] * 0.6, WATER_VOLUME.min[1], WATER_VOLUME.min[2] * 0.6];
const PARTICLE_VOLUME_SIZE: Vec3 = [
  (WATER_VOLUME.max[0] - WATER_VOLUME.min[0]) * 0.6,
  WATER_VOLUME.max[1] - WATER_VOLUME.min[1],
  (WATER_VOLUME.max[2] - WATER_VOLUME.min[2]) * 0.6,
];

interface ParticleFieldProps {
  readonly options: ParticleFieldOptions;
  readonly time: IUniform<number>;
}

function ParticleField({ options, time }: ParticleFieldProps) {
  const geometry = useMemo(
    () => createParticleGeometry(options.count, options.seed),
    [options.count, options.seed]
  );
  const material = useMemo(() => createParticleMaterial(options, time), [options, time]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  if (options.count === 0) return null;
  // The vertices are placed in the shader, so the geometry's CPU-side bounds are meaningless.
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={1} />;
}

export interface OceanParticlesProps {
  readonly config: OceanParticlesConfig;
  /** Shared scene clock in seconds, already scaled for reduced motion. */
  readonly time: IUniform<number>;
}

/** Drifting plankton and rising bubbles: two instanced draw calls in total. */
export function OceanParticles({ config, time }: OceanParticlesProps) {
  const { plankton, bubbles } = splitParticleCount(config);

  const planktonOptions = useMemo<ParticleFieldOptions>(
    () => ({
      count: plankton,
      seed: 11,
      volumeMin: PARTICLE_VOLUME_MIN,
      volumeSize: PARTICLE_VOLUME_SIZE,
      color: config.planktonColor,
      size: config.planktonSize,
      riseSpeed: config.planktonDriftSpeed,
      wobble: 0.9,
      ring: 0,
      opacity: 0.55,
    }),
    [plankton, config.planktonColor, config.planktonSize, config.planktonDriftSpeed]
  );

  const bubbleOptions = useMemo<ParticleFieldOptions>(
    () => ({
      count: bubbles,
      seed: 23,
      volumeMin: PARTICLE_VOLUME_MIN,
      volumeSize: PARTICLE_VOLUME_SIZE,
      color: config.bubbleColor,
      size: config.bubbleSize,
      riseSpeed: config.bubbleRiseSpeed,
      wobble: 0.25,
      ring: 1,
      opacity: 0.8,
    }),
    [bubbles, config.bubbleColor, config.bubbleSize, config.bubbleRiseSpeed]
  );

  return (
    <>
      <ParticleField options={planktonOptions} time={time} />
      <ParticleField options={bubbleOptions} time={time} />
    </>
  );
}
