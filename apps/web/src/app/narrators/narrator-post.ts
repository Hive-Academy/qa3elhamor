import {
  InstancedMesh,
  Raycaster,
  Vector3,
  type Material,
  type Mesh,
  type Object3D,
} from 'three';
import { screenOf, yawTowards, type Vec3, type ViewFrame } from './view-layout';
import type { NarratorPlacement } from './visit-layout';
import type { ScreenInsets } from './screen-placement';

/*
 * Making sure the narrator is seen. A layout names where the narrator floats; the town may have
 * a building (the Chum Bucket beside the Krusty Krab, say) in the way of that spot, or the spot
 * may push its body off the screen's edge. The kit tries the layout's spot, then its
 * alternatives, then the first spot again nearer the visitor, and takes the first one that is
 * on screen and that the visitor can see: no opaque scene mesh between the eye and the
 * narrator's middle, head and sides. Nothing here moves the narrator while it is on screen: the
 * choice is made as the visit opens, before it swims in.
 */

/** How much of its height the narrator's half width is assumed to be (the crab is wide). */
const HALF_WIDTH = 0.6;
/** How far nearer the visitor the last-resort spot is (fraction of the way to the eye). */
export const NEARER_BY = 0.45;

/**
 * The same spot on screen, nearer the visitor: the post slides along the line of sight towards
 * `eye` by `k`, and the narrator shrinks with it so it looks the same size.
 */
export function nearerPlacement(
  placement: NarratorPlacement,
  eye: Vec3,
  k: number = NEARER_BY,
): NarratorPlacement {
  const middle: Vec3 = [
    placement.post[0],
    placement.post[1] + placement.height / 2,
    placement.post[2],
  ];
  const at: Vec3 = [
    middle[0] + (eye[0] - middle[0]) * k,
    middle[1] + (eye[1] - middle[1]) * k,
    middle[2] + (eye[2] - middle[2]) * k,
  ];
  const height = placement.height * (1 - k);
  const post: Vec3 = [at[0], at[1] - height / 2, at[2]];
  return {
    ...placement,
    post,
    height,
    restYaw: yawTowards(post, eye),
  };
}

/** The points of the narrator that must be in sight: its middle, its head and both its sides. */
export function narratorProbePoints(
  placement: NarratorPlacement,
  right: Vec3,
): Vec3[] {
  const { post, height } = placement;
  const middle: Vec3 = [post[0], post[1] + height / 2, post[2]];
  const side = height * HALF_WIDTH * 0.8;
  return [
    middle,
    [post[0], post[1] + height * 0.9, post[2]],
    [middle[0] - right[0] * side, middle[1], middle[2] - right[2] * side],
    [middle[0] + right[0] * side, middle[1], middle[2] + right[2] * side],
  ];
}

/** Whether the narrator's whole body shows on screen, `margin` px inside the insets. */
export function narratorOnScreen(
  view: ViewFrame,
  placement: NarratorPlacement,
  insets: ScreenInsets,
  margin = 0,
): boolean {
  const { post, height } = placement;
  const middle = screenOf(view, [post[0], post[1] + height / 2, post[2]]);
  const top = screenOf(view, [post[0], post[1] + height, post[2]]);
  const foot = screenOf(view, post);
  if (!(middle.depth > 0)) return false;
  const halfPx = Math.abs(foot.y - top.y) * HALF_WIDTH;
  return (
    middle.x - halfPx >= insets.left + margin &&
    middle.x + halfPx <= view.width - insets.right - margin &&
    top.y >= insets.top + margin &&
    foot.y <= view.height - insets.bottom - margin
  );
}

/**
 * The narrator's spot: the first candidate that is both on screen and in sight; failing that,
 * the first in sight (a body clipped by the screen's edge beats one behind a building); failing
 * that, the last (the nearest, the least likely to be hidden). `index` says which.
 */
export function chooseNarratorPlacement(
  candidates: readonly NarratorPlacement[],
  checks: {
    readonly onScreen: (placement: NarratorPlacement) => boolean;
    readonly inSight: (placement: NarratorPlacement) => boolean;
  },
): { readonly placement: NarratorPlacement; readonly index: number } {
  const seen = candidates.map((candidate) => checks.inSight(candidate));
  const best = candidates.findIndex(
    (candidate, i) => seen[i] && checks.onScreen(candidate),
  );
  const index = best >= 0 ? best : seen.indexOf(true);
  const at = index >= 0 ? index : candidates.length - 1;
  const placement = candidates[at];
  if (!placement) throw new Error('A narrator needs at least one spot.');
  return { placement, index: at };
}

const isOpaque = (material: Material | Material[]): boolean =>
  (Array.isArray(material) ? material : [material]).some(
    (m) => m.visible && !m.transparent && m.colorWrite,
  );

/**
 * Meshes that can hide the narrator: every visible, opaque, non-instanced mesh under `root`
 * except those under `exclude` (the visit itself). Fish, kelp and bubbles (instanced, points)
 * and the landmarks' invisible hit targets never count, as for the landmark beacons.
 */
export function sceneOccluders(
  root: Object3D,
  exclude: Object3D | null,
): Object3D[] {
  const meshes: Object3D[] = [];
  const stack: Object3D[] = [root];
  while (stack.length > 0) {
    const object = stack.pop() as Object3D;
    if (object === exclude || !object.visible) continue;
    const mesh = object as Mesh;
    if (
      mesh.isMesh &&
      !(object instanceof InstancedMesh) &&
      isOpaque(mesh.material)
    )
      meshes.push(object);
    stack.push(...object.children);
  }
  return meshes;
}

const ray = new Raycaster();
const from = new Vector3();
const to = new Vector3();
const direction = new Vector3();

/** Whether every one of `points` is in sight from `eye`: no occluder in front of it. */
export function inSight(
  eye: Vec3,
  points: readonly Vec3[],
  occluders: readonly Object3D[],
): boolean {
  from.set(eye[0], eye[1], eye[2]);
  return points.every((point) => {
    to.set(point[0], point[1], point[2]);
    const distance = from.distanceTo(to);
    direction.subVectors(to, from).normalize();
    ray.set(from, direction);
    ray.near = 0;
    ray.far = distance * 0.98;
    return ray.intersectObjects(occluders as Object3D[], false).length === 0;
  });
}
