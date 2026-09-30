import { createContext, useCallback, useContext, type ReactNode } from 'react';

/**
 * WORLD SCALE CONVENTION (landmark-kernel and dive-camera depend on this).
 *
 * The compressed map and every landmark are authored in scene-world units: raw map
 * coordinates x 0.01 (docs/asset-compression-report.md, "Scale"). In those units the town
 * floor is about 7 units across and the pineapple about 0.13 units tall, which is too small
 * for sensible fog, particle and camera numbers.
 *
 * The site therefore works in world units = scene-world x world scale. The default is
 * `WORLD_SCALE` (20): the town floor is about 140 units across and the pineapple about 2.6
 * units tall.
 *
 * The scale has exactly one source per scene: `<OceanWorld worldScale>` (default
 * `WORLD_SCALE`) provides it through context, and everything else reads it from there.
 *
 * - Anything loaded from a GLB (the map, landmarks, characters) is a child of `<OceanWorld>`
 *   (or of any `<WorldSpace>` below it) and is positioned in scene-world units: a landmark is
 *   `<primitive object={landmark} position={placements[id].offset} />`, nothing more.
 * - Everything else (camera, controls, particles, fog, lights) is in world units. To aim the
 *   camera at a landmark, convert its offset with `useSceneToWorld()`, which reads the same
 *   context as the transform and so cannot disagree with it.
 */
export const WORLD_SCALE = 20;

export type Vec3 = readonly [number, number, number];

const WorldScaleContext = createContext<number>(WORLD_SCALE);

export interface WorldScaleProviderProps {
  readonly scale: number;
  readonly children?: ReactNode;
}

/** Sets the scene's world scale. `OceanWorld` mounts this; consumers rarely need it. */
export function WorldScaleProvider({ scale, children }: WorldScaleProviderProps) {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError(`World scale must be a positive finite number, got ${scale}.`);
  }
  return <WorldScaleContext.Provider value={scale}>{children}</WorldScaleContext.Provider>;
}

/** The scale of the enclosing scene (`WORLD_SCALE` outside any provider). */
export const useWorldScale = (): number => useContext(WorldScaleContext);

/**
 * Converts a scene-world point to world units with an explicit scale. Prefer
 * `useSceneToWorld()` inside the scene; this form is for code that already holds the scale.
 */
export const sceneToWorld = (point: Vec3, scale: number): Vec3 => [
  point[0] * scale,
  point[1] * scale,
  point[2] * scale,
];

/** Scene-world to world converter bound to the enclosing scene's scale. */
export function useSceneToWorld(): (point: Vec3) => Vec3 {
  const scale = useWorldScale();
  return useCallback((point: Vec3) => sceneToWorld(point, scale), [scale]);
}

/**
 * The swimmable water volume in world units: the town floor footprint, from just below the
 * seabed to well above the tallest landmark. Camera limits and particles derive from it. It is
 * tuned for `WORLD_SCALE`; a different scale should revisit it (and the fog density).
 */
export const WATER_VOLUME: { readonly min: Vec3; readonly max: Vec3 } = {
  min: [-70, -4, -70],
  max: [70, 34, 70],
};

export interface WorldSpaceProps {
  readonly children?: ReactNode;
}

/** The transform from scene-world to world units, at the scale the context provides. */
export function WorldSpace({ children }: WorldSpaceProps) {
  const scale = useWorldScale();
  return <group scale={scale}>{children}</group>;
}
