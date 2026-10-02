import { DivePath, type DivePacingSpec, type DivePathSpec, type Vec3 } from '@qa3elhamor/dive-domain';
import { WATER_VOLUME, WORLD_SCALE, sceneToWorld } from '@qa3elhamor/world-feature';
import { DEFAULT_PLAQUE_FACING, DEFAULT_PLAQUE_POSITION } from '@qa3elhamor/world-ui';
import { DIVE_CONFIG, LANDMARK_PLACEMENTS } from '../site.config';

/*
 * How the dive is built from its route. The route itself, and the spots it stops at, are
 * config: `DIVE_CONFIG` and `LANDMARK_PLACEMENTS` in `src/site.config.ts`.
 */

/** A named spot on the seabed (`LANDMARK_PLACEMENTS`): what a dive stop is named after. */
export type LandmarkId = keyof typeof LANDMARK_PLACEMENTS;

/** One control point of the dive. */
export type DiveRouteEntry =
  /** Open water the camera swims through, in world units. */
  | { readonly kind: 'pass'; readonly position: Vec3 }
  /**
   * A stop at a landmark. The camera sits at the landmark plus `viewOffset` (world units) and
   * looks `focusHeight` world units above the landmark's base: while scrolling past (it turns
   * towards it over the approach) and when focused by landmark-kernel. `scroll` is how far down
   * the page, in [0, 1], the camera arrives. The waypoint id is the landmark id.
   */
  | {
      readonly kind: 'stop';
      readonly landmark: LandmarkId;
      readonly viewOffset: Vec3;
      readonly focusHeight: number;
      readonly scroll: number;
    };

/**
 * The last view of the dive: the credits notice board. The camera ends `distance` world units
 * in front of the board's face (on the side it faces), `height` above its foot, looking at the
 * middle of the notice.
 */
export interface DiveFinale {
  readonly distance: number;
  readonly height: number;
  /** Height of the notice's centre above the board's foot, in world units. */
  readonly faceHeight: number;
}

export interface DiveConfig {
  /** Scroll length of the whole dive, in viewport heights. */
  readonly screens: number;
  /** Depth shown at the seabed, in metres. The scene is not to scale; this is the story's number. */
  readonly floorMeters: number;
  /** How long the camera lingers at each stop; see `DivePacingSpec`. */
  readonly pacing: DivePacingSpec;
  /** The route from the surface to the seabed, in order; the finale follows the last entry. */
  readonly route: readonly DiveRouteEntry[];
  readonly finale: DiveFinale;
}

/**
 * The finale's camera position and look target in world units, from the credits plaque's
 * placement (`@qa3elhamor/world-ui` defaults, scene-world units, as `<SceneCredits>` mounts it).
 */
export function finalePose(finale: DiveFinale, scale: number = WORLD_SCALE): { position: Vec3; focus: Vec3 } {
  const foot = sceneToWorld(DEFAULT_PLAQUE_POSITION, scale);
  const facing = sceneToWorld(DEFAULT_PLAQUE_FACING, scale);
  const dx = facing[0] - foot[0];
  const dz = facing[2] - foot[2];
  const len = Math.hypot(dx, dz) || 1;
  return {
    position: [foot[0] + (dx / len) * finale.distance, foot[1] + finale.height, foot[2] + (dz / len) * finale.distance],
    focus: [foot[0], foot[1] + finale.faceHeight, foot[2]],
  };
}

/**
 * Turns the route into a `DivePathSpec` in world units: landmark placements are scaled by the
 * scene's world scale (the same `WORLD_SCALE` `<OceanWorld>` renders with), the finale is the
 * last control point and the end focus, the surface is the top of the water volume and the
 * floor is the lowest camera height on the route.
 */
export function buildDiveSpec(config: DiveConfig = DIVE_CONFIG, scale: number = WORLD_SCALE): DivePathSpec {
  const controlPoints: Vec3[] = [];
  const waypoints: { id: string; at: number; focus: Vec3; scroll: number }[] = [];

  for (const entry of config.route) {
    if (entry.kind === 'pass') {
      controlPoints.push(entry.position);
      continue;
    }
    const base = sceneToWorld(LANDMARK_PLACEMENTS[entry.landmark], scale);
    const [dx, dy, dz] = entry.viewOffset;
    waypoints.push({
      id: entry.landmark,
      at: controlPoints.length,
      focus: [base[0], base[1] + entry.focusHeight, base[2]],
      scroll: entry.scroll,
    });
    controlPoints.push([base[0] + dx, base[1] + dy, base[2] + dz]);
  }

  const finale = finalePose(config.finale, scale);
  controlPoints.push(finale.position);

  // The floor is the lowest the camera goes anywhere on the route (sampled along the curve, not
  // just at control points), so that point reads exactly `floorMeters`. The gauge follows the
  // deepest point reached so far (`DivePath.depthAt`): it never winds back, and from the
  // lowest point on (on this route, the dip just before the tiki stop, scroll ~0.29) it holds
  // at `floorMeters` to the end.
  const floorY = DivePath.lowestYOf(controlPoints);
  return {
    controlPoints,
    waypoints,
    depth: { surfaceY: WATER_VOLUME.max[1], floorY, floorMeters: config.floorMeters },
    pacing: config.pacing,
    endFocus: finale.focus,
  };
}

export const buildDivePath = (config: DiveConfig = DIVE_CONFIG, scale: number = WORLD_SCALE): DivePath =>
  DivePath.create(buildDiveSpec(config, scale));
