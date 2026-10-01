import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Color, Matrix4, Quaternion, Vector3, type IUniform, type InstancedMesh, type Object3D } from 'three';
import type { ResolvedAmbientLife } from './ambient-config.js';
import { createKelpGeometry, createKelpMaterial, planKelpBed, probeSeabed, type KelpStalk } from './kelp-bed.js';
import { WATER_VOLUME } from './world-space.js';

export interface KelpForestProps {
  readonly kelp: NonNullable<ResolvedAmbientLife['kelp']>;
  readonly seed: number;
  /** The loaded seabed to root on, or null while it loads (or if it failed): no kelp then. */
  readonly ground: Object3D | null;
  /** Shared ambient clock: drives the sway. */
  readonly time: IUniform<number>;
}

const Y_AXIS = new Vector3(0, 1, 0);

/** Roots sit this far below the probed surface, so a stalk on a slope never floats. */
const ROOT_SINK = 0.3;

interface RootedStalk extends KelpStalk {
  readonly y: number;
}

/**
 * The kelp bed: one instanced draw call. Clumps are laid out once (`planKelpBed`), rooted by
 * one downward ray per clump onto the loaded seabed (`probeSeabed`), and swayed entirely in
 * the vertex shader, so the per-frame CPU cost is nil.
 */
export function KelpForest({ kelp, seed, ground, time }: KelpForestProps) {
  const mesh = useRef<InstancedMesh>(null);
  const plan = useMemo(
    () =>
      planKelpBed({
        count: kelp.count,
        seed,
        area: kelp.area,
        clearings: kelp.clearings,
        stalksPerPatch: kelp.stalksPerPatch,
        patchRadius: kelp.patchRadius,
        minHeight: kelp.minHeight,
        maxHeight: kelp.maxHeight,
      }),
    [kelp, seed]
  );
  const [stalks, setStalks] = useState<readonly RootedStalk[]>([]);

  useEffect(() => {
    if (!ground) {
      setStalks([]);
      return;
    }
    ground.updateWorldMatrix(true, true);
    const roots = probeSeabed(ground, plan.patches, WATER_VOLUME.max[1] + 10);
    setStalks(
      plan.stalks.flatMap((stalk) => {
        const y = roots[stalk.patch];
        return y === null || y === undefined ? [] : [{ ...stalk, y: y - ROOT_SINK }];
      })
    );
  }, [ground, plan]);

  const geometry = useMemo(() => createKelpGeometry(kelp.baseColor, kelp.tipColor), [kelp.baseColor, kelp.tipColor]);
  const material = useMemo(() => createKelpMaterial({ time, sway: kelp.sway }), [time, kelp.sway]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    const matrix = new Matrix4();
    const rotation = new Quaternion();
    const position = new Vector3();
    const scale = new Vector3();
    const shade = new Color();
    stalks.forEach((stalk, i) => {
      rotation.setFromAxisAngle(Y_AXIS, stalk.yaw);
      matrix.compose(position.set(stalk.x, stalk.y, stalk.z), rotation, scale.set(1, stalk.height, 1));
      instanced.setMatrixAt(i, matrix);
      instanced.setColorAt(i, shade.setScalar(stalk.shade));
    });
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
    instanced.computeBoundingSphere();
    // The sway moves tips up to `sway` sideways.
    if (instanced.boundingSphere) instanced.boundingSphere.radius += kelp.sway + 0.5;
  }, [stalks, kelp.sway]);

  if (stalks.length === 0) return null;
  return <instancedMesh key={stalks.length} ref={mesh} args={[geometry, material, stalks.length]} />;
}
