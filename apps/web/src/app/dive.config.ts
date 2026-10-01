import { DivePath, type DivePacingSpec, type DivePathSpec, type Vec3 } from '@qa3elhamor/dive-domain';
import { WATER_VOLUME, WORLD_SCALE, sceneToWorld } from '@qa3elhamor/world-feature';
import { DEFAULT_PLAQUE_FACING, DEFAULT_PLAQUE_POSITION } from '@qa3elhamor/world-ui';

/**
 * Landmark anchors in scene-world units, as written by the asset pipeline to
 * `public/models/placements.json`. They are restated here because the app's TypeScript root
 * is `src/`; `dive.config.spec.ts` fails the build if the two ever disagree.
 */
export const LANDMARK_PLACEMENTS = {
  'landmark-pineapple': [0.7891174902964195, 0.06950939887368529, -0.09919549481878809],
  'landmark-tiki': [0.6515264937685465, 0.07000999830640853, -0.19213949727700275],
  'landmark-krusty-krab': [-0.592705484493699, 0.0724034984617643, -0.3194804883119353],
  'landmark-bureau': [-0.6057479723003212, 0.171782495712135, -0.008706998630456653],
} as const satisfies Record<string, Vec3>;

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
 * The sample dive: down from the surface towards the town, a stop at the pineapple, a short
 * hop to the tiki head beside it, over the rocks to the Krusty Krab, up to the Complaints
 * Bureau, and down to the credits notice on the seabed. Each landmark gets a similar share of
 * the scroll whatever the distance between them, and a hold where the camera only creeps.
 * template-config will move this into the forkable config.
 */
export const DIVE_CONFIG: DiveConfig = {
  screens: 8,
  floorMeters: 180,
  pacing: { dwell: 0.09, creep: 1.2 },
  route: [
    { kind: 'pass', position: [38, 31, 42] },
    { kind: 'pass', position: [30, 19, 28] },
    { kind: 'pass', position: [23, 9, 14] },
    { kind: 'stop', landmark: 'landmark-pineapple', viewOffset: [3.5, 2.4, 7], focusHeight: 1.3, scroll: 0.2 },
    { kind: 'stop', landmark: 'landmark-tiki', viewOffset: [-2.5, 1.8, 6.5], focusHeight: 1, scroll: 0.36 },
    { kind: 'pass', position: [0, 5.5, 8] },
    { kind: 'stop', landmark: 'landmark-krusty-krab', viewOffset: [9, 3.6, 3.75], focusHeight: 0.5, scroll: 0.6 },
    { kind: 'pass', position: [-5.5, 7.5, 9] },
    { kind: 'stop', landmark: 'landmark-bureau', viewOffset: [-3.5, 3.4, 8.5], focusHeight: 1.8, scroll: 0.82 },
  ],
  finale: { distance: 7.5, height: 3, faceHeight: 3.5 },
};

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
