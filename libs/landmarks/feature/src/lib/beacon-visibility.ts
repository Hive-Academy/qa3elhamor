import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useMemo, useRef, type RefObject } from 'react';
import {
  InstancedMesh,
  Raycaster,
  Vector3,
  type Material,
  type Mesh,
  type Object3D,
} from 'three';

/** Beacon opacity for a camera distance: 1 up to `near`, fading to 0 at `far` (world units). */
export function beaconFade(
  distance: number,
  [near, far]: readonly [number, number],
): number {
  if (!(distance > near)) return 1;
  if (distance >= far) return 0;
  return 1 - (distance - near) / (far - near);
}

const isOpaque = (material: Material | Material[]): boolean =>
  (Array.isArray(material) ? material : [material]).some(
    (m) => m.visible && !m.transparent && m.colorWrite,
  );

/**
 * Meshes that can hide a beacon: every visible, opaque, non-instanced mesh in the scene
 * except those under `exclude` (the landmarks themselves). Particles (points, instanced
 * bubbles) and the invisible hit targets never count. The list is rebuilt at most every
 * `refreshSeconds`, since models stream in after the first frame.
 */
export function useOccluders(
  exclude: RefObject<Object3D | null>,
  refreshSeconds = 2,
): () => readonly Object3D[] {
  const scene = useThree((state) => state.scene);
  const cache = useRef<{ at: number; meshes: Object3D[] }>({
    at: -Infinity,
    meshes: [],
  });
  return useCallback(() => {
    const now = performance.now() / 1000;
    if (now - cache.current.at < refreshSeconds) return cache.current.meshes;
    const meshes: Object3D[] = [];
    const stack: Object3D[] = [scene];
    while (stack.length > 0) {
      const object = stack.pop() as Object3D;
      if (object === exclude.current || !object.visible) continue;
      const mesh = object as Mesh;
      if (
        mesh.isMesh &&
        !(object instanceof InstancedMesh) &&
        isOpaque(mesh.material)
      )
        meshes.push(object);
      stack.push(...object.children);
    }
    cache.current = { at: now, meshes };
    return meshes;
  }, [scene, exclude, refreshSeconds]);
}

export interface BeaconVisibilityOptions {
  readonly anchor: RefObject<Object3D | null>;
  readonly element: RefObject<HTMLElement | null>;
  readonly range: readonly [number, number];
  /** When set, a beacon behind scene geometry is hidden. */
  readonly occluders?: () => readonly Object3D[];
  /** Hovered or focused beacons stay visible regardless. */
  readonly pinned: boolean;
  /** Seconds between checks. Staggered per beacon so they do not all ray-cast on one frame. */
  readonly interval?: number;
}

/**
 * Fades a beacon with distance and hides it behind terrain, by writing its opacity directly
 * (no React re-render). Checks run a few times a second, not every frame: a ray against the
 * seabed town is cheap once but not free at 60 Hz times every landmark.
 */
export function useBeaconVisibility({
  anchor,
  element,
  range,
  occluders,
  pinned,
  interval = 0.25,
}: BeaconVisibilityOptions): void {
  const clock = useRef(Math.random() * interval);
  const tools = useMemo(
    () => ({
      ray: new Raycaster(),
      at: new Vector3(),
      direction: new Vector3(),
    }),
    [],
  );

  useFrame(({ camera }, delta) => {
    clock.current += delta;
    const node = element.current;
    const origin = anchor.current;
    if (!node || !origin) return;
    if (pinned) {
      write(node, 1);
      return;
    }
    if (clock.current < interval) return;
    clock.current = 0;

    origin.getWorldPosition(tools.at);
    const distance = camera.position.distanceTo(tools.at);
    let opacity = beaconFade(distance, range);
    if (opacity > 0 && occluders) {
      tools.direction.subVectors(tools.at, camera.position).normalize();
      tools.ray.set(camera.position, tools.direction);
      tools.ray.near = camera.near;
      tools.ray.far = distance * 0.98;
      if (
        tools.ray.intersectObjects(occluders() as Object3D[], false).length > 0
      )
        opacity = 0;
    }
    write(node, opacity);
  });
}

function write(node: HTMLElement, opacity: number): void {
  const value = String(Math.round(opacity * 100) / 100);
  if (node.style.opacity === value) return;
  node.style.opacity = value;
  node.toggleAttribute('data-hidden', opacity < 0.05);
}
