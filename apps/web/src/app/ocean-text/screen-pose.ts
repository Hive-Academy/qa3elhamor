import {
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Vector3,
  type Camera,
  type Object3D,
} from 'three';

/*
 * Posing in-world text where the HTML would have been: an object facing the camera, at a
 * given depth, whose local units are a fixed number of screen pixels. Its words keep their
 * on-screen size (as readable as the HTML they stand in for) while they sit in the water, in
 * the scene's light and depth, with the camera's perspective.
 */

const at = new Vector3();
const viewScratch = new Vector3();
const scale = new Vector3();
const world = new Matrix4();
const parentInverse = new Matrix4();
const facing = new Quaternion();

/** World units one screen pixel spans at `depth` in front of `camera` (perspective; 0 otherwise). */
export function worldPerScreenPx(
  camera: Camera,
  viewportHeight: number,
  depth: number,
): number {
  if (!(camera instanceof PerspectiveCamera) || !(viewportHeight > 0)) return 0;
  const fov = (camera.fov * Math.PI) / 180;
  return (
    (2 * Math.max(depth, 0) * Math.tan(fov / 2)) /
    (viewportHeight * camera.zoom)
  );
}

/** How far in front of the camera `point` (world) is, along its view direction. */
export function viewDepth(camera: Camera, point: Vector3): number {
  return -viewScratch.copy(point).applyMatrix4(camera.matrixWorldInverse).z;
}

/**
 * Writes `object`'s matrix (it must have `matrixAutoUpdate = false`) so that its local origin
 * shows at CSS pixel (`x`, `y`) of a `size` viewport, `depth` world units in front of the
 * camera, facing it, with one local unit spanning `unitPx` screen pixels. Its parent may be
 * anywhere (a landmark's scaled frame): the pose is undone through the parent's world matrix.
 * Returns false (and hides it) where it cannot be posed.
 */
export function poseAtScreenPoint(
  object: Object3D,
  camera: Camera,
  size: { readonly width: number; readonly height: number },
  x: number,
  y: number,
  depth: number,
  unitPx: number,
): boolean {
  const perPx = worldPerScreenPx(camera, size.height, depth);
  if (!(perPx > 0) || !Number.isFinite(x) || !Number.isFinite(y)) {
    object.visible = false;
    return false;
  }
  const ndcX = (x / size.width) * 2 - 1;
  const ndcY = 1 - (y / size.height) * 2;
  // A point on the near plane under that pixel, then pushed out to `depth` along the view.
  at.set(ndcX, ndcY, 0.5).unproject(camera);
  const viewZ = -at.applyMatrix4(camera.matrixWorldInverse).z;
  at.multiplyScalar(depth / Math.max(viewZ, 1e-6)).applyMatrix4(
    camera.matrixWorld,
  );
  camera.getWorldQuaternion(facing);
  const s = perPx * unitPx;
  world.compose(at, facing, scale.set(s, s, s));
  const parent = object.parent;
  if (parent) {
    parent.updateWorldMatrix(true, false);
    world.premultiply(parentInverse.copy(parent.matrixWorld).invert());
  }
  object.matrix.copy(world);
  object.matrixWorldNeedsUpdate = true;
  object.visible = true;
  return true;
}

/**
 * As `poseAtScreenPoint`, for an object that stays where it is in its parent (a label over a
 * landmark): only its turn towards the camera and its scale change, so that one local unit spans
 * `unitPx` screen pixels wherever it is. Returns its depth (0 when it is behind the camera).
 */
export function faceCameraAtPixelScale(
  object: Object3D,
  camera: Camera,
  viewportHeight: number,
  unitPx: number,
): number {
  const parent = object.parent;
  if (parent) parent.updateWorldMatrix(true, false);
  at.copy(object.position);
  if (parent) at.applyMatrix4(parent.matrixWorld);
  const depth = viewDepth(camera, at);
  const perPx = worldPerScreenPx(camera, viewportHeight, depth);
  if (!(depth > 0) || !(perPx > 0)) {
    object.visible = false;
    return 0;
  }
  camera.getWorldQuaternion(facing);
  const s = perPx * unitPx;
  world.compose(at, facing, scale.set(s, s, s));
  if (parent)
    world.premultiply(parentInverse.copy(parent.matrixWorld).invert());
  object.matrix.copy(world);
  object.matrixWorldNeedsUpdate = true;
  object.visible = true;
  return depth;
}

const parentQuat = new Quaternion();
const cameraAt = new Vector3();

/**
 * Turns `object` (auto-updated matrix) to face the camera wherever its parent is, and returns
 * the camera's position in the parent's space in `into` (to push a label towards the viewer).
 */
export function faceCamera(
  object: Object3D,
  camera: Camera,
  into?: Vector3,
): void {
  camera.getWorldQuaternion(facing);
  camera.getWorldPosition(cameraAt);
  const parent = object.parent;
  if (parent) {
    parent.getWorldQuaternion(parentQuat);
    object.quaternion.copy(parentQuat.invert().multiply(facing));
    if (into) into.copy(parent.worldToLocal(cameraAt));
  } else {
    object.quaternion.copy(facing);
    if (into) into.copy(cameraAt);
  }
}
