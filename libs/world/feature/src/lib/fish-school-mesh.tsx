import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { DynamicDrawUsage, Sphere, Vector3, type BufferGeometry, type IUniform, type InstancedMesh } from 'three';
import { createFishMaterial } from './fish-mesh.js';
import {
  MAX_SCHOOL_STEP,
  createSchoolState,
  stepSchool,
  writeSchoolMatrices,
  type FishSchoolSpec,
} from './fish-school.js';

export interface FishSchoolMeshProps {
  readonly spec: FishSchoolSpec;
  readonly count: number;
  readonly neighbourSamples: number;
  readonly seed: number;
  /** Shared fish geometry (owned by the caller). */
  readonly geometry: BufferGeometry;
  /** Shared ambient clock: drives the tail beat. */
  readonly time: IUniform<number>;
  /** 1 normally; the reduced-motion scale otherwise (0 freezes the school). */
  readonly motionScale: number;
}

/**
 * One school: a single instanced draw call. Per frame the boids step runs on the CPU
 * (`count x neighbourSamples` reads) and the instance matrices are rewritten in place; the
 * tail beat is in the vertex shader. The bounding sphere covers the school's whole roaming
 * region, so a school out of view is frustum-culled instead of drawn.
 */
export function FishSchoolMesh({
  spec,
  count,
  neighbourSamples,
  seed,
  geometry,
  time,
  motionScale,
}: FishSchoolMeshProps) {
  const mesh = useRef<InstancedMesh>(null);
  const material = useMemo(() => createFishMaterial({ color: spec.color, time }), [spec.color, time]);
  const state = useMemo(() => createSchoolState(spec, count, seed), [spec, count, seed]);

  useEffect(() => () => material.dispose(), [material]);

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    instanced.instanceMatrix.setUsage(DynamicDrawUsage);
    instanced.boundingSphere = new Sphere(new Vector3(...spec.center), spec.radius * 2 + spec.size * 2);
    writeSchoolMatrices(state, spec.size, instanced.instanceMatrix.array as Float32Array);
    instanced.instanceMatrix.needsUpdate = true;
  }, [spec, state]);

  useFrame((_, delta) => {
    const instanced = mesh.current;
    if (!instanced) return;
    const dt = Math.min(delta, MAX_SCHOOL_STEP) * motionScale;
    if (!(dt > 0)) return;
    stepSchool(state, spec, dt, neighbourSamples);
    writeSchoolMatrices(state, spec.size, instanced.instanceMatrix.array as Float32Array);
    instanced.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;
  // Keyed on count by the caller: an InstancedMesh's capacity is fixed at construction.
  return <instancedMesh ref={mesh} args={[geometry, material, count]} />;
}
