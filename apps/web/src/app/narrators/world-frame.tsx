import { useFrame } from '@react-three/fiber';
import type { HitShape } from '@qa3elhamor/landmarks-feature';
import { useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Vector3, type Group, type Object3D } from 'three';
import { facingPoint } from '../in-world/in-world-pose';
import type { Vec3 } from './view-layout';

/**
 * A group whose children are in world units and world axes, whatever the landmark's frame
 * (which is in scene-world units): a visit is composed in world space against the camera.
 * It also keeps `door` up to date: the point on the model's footprint facing the stop's eye,
 * `doorHeight` of the way up, where the content objects come from.
 */
export function WorldFrame({
  bounds,
  eye,
  door,
  doorHeight,
  children,
}: {
  readonly bounds: HitShape;
  readonly eye: Vec3;
  readonly door: { current: Vec3 };
  /** Fraction of the model's height (0 = its base). */
  readonly doorHeight: number;
  readonly children: ReactNode;
}) {
  const ref = useRef<Group>(null);
  const sync = useCallback(() => {
    const group = ref.current;
    const frame: Object3D | null | undefined = group?.parent;
    if (!group || !frame) return;
    frame.updateWorldMatrix(true, false);
    group.matrix.copy(frame.matrixWorld).invert();
    group.matrixWorldNeedsUpdate = true;
    door.current = doorOf(frame, bounds, eye, doorHeight);
  }, [bounds, eye, door, doorHeight]);
  useLayoutEffect(sync, [sync]);
  useFrame(sync, -1);
  return (
    <group ref={ref} matrixAutoUpdate={false}>
      {children}
    </group>
  );
}

const local = new Vector3();

/** The door in world units: the footprint's side facing `eye`, `doorHeight` up the bounds. */
function doorOf(
  frame: Object3D,
  bounds: HitShape,
  eye: Vec3,
  doorHeight: number,
): Vec3 {
  const [cx, cy, cz] = bounds.center;
  const radius =
    bounds.kind === 'box'
      ? Math.min(bounds.size[0], bounds.size[2]) / 2
      : bounds.radius;
  const height = bounds.kind === 'box' ? bounds.size[1] : bounds.radius * 2;
  const viewer = frame.worldToLocal(local.set(eye[0], eye[1], eye[2]));
  const p = facingPoint({ x: cx, z: cz }, { x: viewer.x, z: viewer.z }, radius);
  const world = frame.localToWorld(
    local.set(p.x, cy - height / 2 + height * doorHeight, p.z),
  );
  return [world.x, world.y, world.z];
}
