import type { NarrationLandmarkId } from '@qa3elhamor/content-domain';
import {
  RESIDENT_SCALE_RANGE,
  type ResidentPlacement,
} from '../narrators.config';

/*
 * The resident placement tool's editing core (`?place=resident`, development only): which mode
 * the URL asks for, what each key does to a placement, the config snippet it copies, and a tiny
 * store the scene and the panel share. Pure: no React, no three.js, no DOM.
 */

/** `?place=resident` in development; null otherwise (production builds never read the URL). */
export function placeModeFor(search: string, dev: boolean): 'resident' | null {
  if (!dev) return null;
  return new URLSearchParams(search).get('place') === 'resident'
    ? 'resident'
    : null;
}

/** Step sizes: offsets in the landmark's units, turns in degrees, scale as a factor. */
export const PLACEMENT_STEP = {
  move: 0.005,
  fineMove: 0.001,
  turn: 5,
  fineTurn: 1,
  scale: 0.05,
  fineScale: 0.01,
} as const;

/** The placement every resident starts from when its landmark has none configured. */
export const UNPLACED: ResidentPlacement = {
  offset: [0, 0, 0],
  facing: 'camera',
  scale: 1,
};

/**
 * Directions on the ground in the landmark's frame (x, z), unit length: what the arrow keys move
 * along. The tool passes the camera's, so "up" is away from the viewer.
 */
export interface GroundAxes {
  readonly right: readonly [number, number];
  readonly forward: readonly [number, number];
}

export const FRAME_AXES: GroundAxes = { right: [1, 0], forward: [0, -1] };

const round = (x: number, digits: number): number => {
  const k = 10 ** digits;
  const r = Math.round(x * k) / k;
  return Object.is(r, -0) ? 0 : r;
};

const wrapDegrees = (deg: number): number => {
  const d = ((deg % 360) + 360) % 360;
  return round(d > 180 ? d - 360 : d, 2);
};

/**
 * `placement` after `key` (a `KeyboardEvent.key`), or null when the key does nothing here.
 * Arrows move along the ground (`axes`), PageUp / PageDown move up and down, Q / E turn (from
 * `facingNow`, the heading it shows, when it faces the camera), + / - scale. `fine` (Shift)
 * takes the small steps.
 */
export function nudgePlacement(
  placement: ResidentPlacement,
  key: string,
  fine: boolean,
  axes: GroundAxes = FRAME_AXES,
  facingNow = 0,
): ResidentPlacement | null {
  const move = fine ? PLACEMENT_STEP.fineMove : PLACEMENT_STEP.move;
  const turn = fine ? PLACEMENT_STEP.fineTurn : PLACEMENT_STEP.turn;
  const grow = fine ? PLACEMENT_STEP.fineScale : PLACEMENT_STEP.scale;
  const [x, y, z] = placement.offset;
  const along = (dir: readonly [number, number], k: number): ResidentPlacement => ({
    ...placement,
    offset: [round(x + dir[0] * k, 4), y, round(z + dir[1] * k, 4)],
  });
  switch (key) {
    case 'ArrowRight':
      return along(axes.right, move);
    case 'ArrowLeft':
      return along(axes.right, -move);
    case 'ArrowUp':
      return along(axes.forward, move);
    case 'ArrowDown':
      return along(axes.forward, -move);
    case 'PageUp':
      return { ...placement, offset: [x, round(y + move, 4), z] };
    case 'PageDown':
      return { ...placement, offset: [x, round(y - move, 4), z] };
    case 'q':
    case 'Q':
    case 'e':
    case 'E': {
      const from = placement.facing === 'camera' ? facingNow : placement.facing;
      const sign = key.toLowerCase() === 'q' ? 1 : -1;
      return { ...placement, facing: wrapDegrees(from + sign * turn) };
    }
    case '+':
    case '=':
    case '-':
    case '_': {
      const sign = key === '+' || key === '=' ? 1 : -1;
      const scale = (placement.scale ?? 1) + sign * grow;
      return {
        ...placement,
        scale: round(
          Math.min(RESIDENT_SCALE_RANGE.max, Math.max(RESIDENT_SCALE_RANGE.min, scale)),
          3,
        ),
      };
    }
    default:
      return null;
  }
}

/** The line to paste into `RESIDENT_PLACEMENTS` (`narrators.config.ts`). */
export function placementSnippet(
  landmark: NarrationLandmarkId,
  placement: ResidentPlacement,
): string {
  const [x, y, z] = placement.offset.map((v) => round(v, 4));
  const facing =
    placement.facing === 'camera' ? "'camera'" : String(round(placement.facing, 2));
  const key = /^[a-z]+$/.test(landmark) ? landmark : `'${landmark}'`;
  return `${key}: { offset: [${x}, ${y}, ${z}], facing: ${facing}, scale: ${round(placement.scale ?? 1, 3)} },`;
}

/** Live edits per landmark, shared by the scene (the resident) and the panel. */
export interface PlacementStore {
  get(landmark: NarrationLandmarkId): ResidentPlacement | undefined;
  set(landmark: NarrationLandmarkId, placement: ResidentPlacement): void;
  subscribe(listener: () => void): () => void;
}

export function createPlacementStore(): PlacementStore {
  const edits = new Map<NarrationLandmarkId, ResidentPlacement>();
  const listeners = new Set<() => void>();
  return {
    get: (landmark) => edits.get(landmark),
    set(landmark, placement) {
      edits.set(landmark, placement);
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The one store the development tool uses. */
export const PLACEMENT_EDITS: PlacementStore = createPlacementStore();
