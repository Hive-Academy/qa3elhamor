import { Vector3, type Camera } from 'three';
import { PICKABLE_FROM } from './object-selection';
import {
  placePanel,
  type PanelSide,
  type ScreenInsets,
  type ScreenPoint,
} from './screen-placement';
import type { Vec3 } from './view-layout';

/*
 * Keeping a content object's crisp DOM over it: its label button (the whole object is the
 * button) and, for the selected one, its detail panel beside it. Called from the objects'
 * `useFrame` with the object's current world pose; writes styles directly (no React render per
 * frame). The label exposes the object's on-screen size as `--object-w` / `--object-h`.
 */

const scratch = new Vector3();
const camSpace = new Vector3();

/** Where `point` (world) shows, in CSS pixels from the top left. */
export function screenPointOf(
  camera: Camera,
  size: { readonly width: number; readonly height: number },
  point: Vec3,
): ScreenPoint {
  scratch.set(point[0], point[1], point[2]).project(camera);
  return {
    x: ((scratch.x + 1) / 2) * size.width,
    y: ((1 - scratch.y) / 2) * size.height,
  };
}

export interface ObjectDomInput {
  readonly camera: Camera;
  readonly size: { readonly width: number; readonly height: number };
  /** The object's centre (world) this frame. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Half its width and height (world), as drawn this frame. */
  readonly halfWidth: number;
  readonly halfHeight: number;
  /** 0 hidden (inside the landmark, under the sand), 1 out. */
  readonly progress: number;
  /** Another object is selected: this one's label steps back. */
  readonly faded: boolean;
  readonly label: HTMLElement | null | undefined;
  /** The detail panel, when this object is the selected one. */
  readonly panel: HTMLElement | null | undefined;
  /** The landmark on screen: the panel opens on the object's far side from it. */
  readonly hub: ScreenPoint;
  readonly insets: ScreenInsets;
  /** The panel's first choice of side (`placePanel`); default the side away from `hub`. */
  readonly panelSide?: PanelSide;
}

/** How far out an object must be before its label shows, and over how much it fades in. */
const LABEL_FROM = 0.6;
const LABEL_FADE = 0.3;

export function placeObjectDom({
  camera,
  size,
  x,
  y,
  z,
  halfWidth,
  halfHeight,
  progress,
  faded,
  label,
  panel,
  hub,
  insets,
  panelSide,
}: ObjectDomInput): void {
  if (!label) return;
  scratch.set(x, y, z);
  camSpace.copy(scratch).applyMatrix4(camera.matrixWorldInverse);
  const depth = -camSpace.z;
  const at = screenPointOf(camera, size, [x, y, z]);
  const focal =
    (camera.projectionMatrix.elements[5] ?? 1) * (size.height / 2);
  const shown = depth > 0.05 && progress > LABEL_FROM;
  label.style.transform = `translate3d(${Math.round(at.x)}px, ${Math.round(at.y)}px, 0) translate(-50%, -50%)`;
  const fade = Math.min(Math.max((progress - LABEL_FROM) / LABEL_FADE, 0), 1);
  label.style.opacity = shown ? String(fade * (faded ? 0.7 : 1)) : '0';
  label.style.visibility = shown ? 'visible' : 'hidden';
  // Not a target until it is (nearly) out.
  label.style.pointerEvents = progress >= PICKABLE_FROM ? '' : 'none';
  const perWorld = depth > 0.05 ? focal / depth : 0;
  const halfW = halfWidth * perWorld;
  const halfH = halfHeight * perWorld;
  label.style.setProperty('--object-w', `${Math.round(halfW * 2)}px`);
  label.style.setProperty('--object-h', `${Math.round(halfH * 2)}px`);

  if (!panel) return;
  const place = placePanel({
    centre: at,
    radius: Math.max(halfW, halfH),
    extent: { x: halfW, y: halfH },
    hub,
    size: { width: panel.offsetWidth, height: panel.offsetHeight },
    viewport: size,
    insets,
    gap: 12,
    prefer: panelSide,
  });
  panel.style.transform = `translate3d(${place.left}px, ${place.top}px, 0)`;
  panel.dataset['side'] = place.side;
  panel.style.visibility = shown ? 'visible' : 'hidden';
}
