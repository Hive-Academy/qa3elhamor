/*
 * Where the credits plaque stands, as plain numbers. Kept apart from `credits-plaque.tsx` (the
 * R3F component) so an app can read the placement, e.g. to aim its dive's finale at the board,
 * without bundling the 3D component with it.
 */

export type PlaqueVec3 = readonly [number, number, number];

/**
 * Default spot, in scene-world units (mount inside `<OceanWorld>`/`<WorldSpace>`): on the
 * seabed at the end of the dive. The app derives the dive's final camera pose from this board
 * (`finalePose` in `apps/web/src/app/dive.config.ts`), so moving the board moves the finale.
 */
export const DEFAULT_PLAQUE_POSITION: PlaqueVec3 = [-1.27, 0.05, 0.9];
/** Default point the notice turns to face: the dive's final camera position. */
export const DEFAULT_PLAQUE_FACING: PlaqueVec3 = [-1.1, 0.14, 0.7];
/** Default board width in scene-world units (5 world units at `WORLD_SCALE` 20). */
export const DEFAULT_PLAQUE_WIDTH = 0.25;

/** Heading (rotation about +y) that turns the board's front (+z) toward `facing`. */
export const plaqueYaw = (position: PlaqueVec3, facing: PlaqueVec3): number =>
  Math.atan2(facing[0] - position[0], facing[2] - position[2]);
