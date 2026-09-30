import { DivePath, type DivePathSpec, type Vec3 } from '@qa3elhamor/dive-domain';
import { WATER_VOLUME, WORLD_SCALE, sceneToWorld } from '@qa3elhamor/world-feature';

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
   * A stop at a landmark. The camera sits at the landmark plus `viewOffset` (world units) and,
   * when focused by landmark-kernel, looks `focusHeight` world units above the landmark's base.
   * The waypoint id is the landmark id.
   */
  | {
      readonly kind: 'stop';
      readonly landmark: LandmarkId;
      readonly viewOffset: Vec3;
      readonly focusHeight: number;
    };

export interface DiveConfig {
  /** Scroll length of the whole dive, in viewport heights. */
  readonly screens: number;
  /** Depth shown at the seabed, in metres. The scene is not to scale; this is the story's number. */
  readonly floorMeters: number;
  /** The route from the surface to the seabed, in order. */
  readonly route: readonly DiveRouteEntry[];
}

/**
 * The sample dive: down from the surface over the pineapple and the tiki head, across the
 * town to the Krusty Krab, ending at the Complaints Bureau on the seabed. template-config will
 * move this into the forkable config.
 */
export const DIVE_CONFIG: DiveConfig = {
  screens: 8,
  floorMeters: 180,
  route: [
    { kind: 'pass', position: [38, 31, 42] },
    { kind: 'pass', position: [30, 19, 28] },
    { kind: 'pass', position: [23, 9, 14] },
    { kind: 'stop', landmark: 'landmark-pineapple', viewOffset: [3.5, 2.4, 7], focusHeight: 1.3 },
    { kind: 'stop', landmark: 'landmark-tiki', viewOffset: [-2.5, 1.8, 6.5], focusHeight: 1 },
    { kind: 'pass', position: [0, 4.5, 6] },
    { kind: 'stop', landmark: 'landmark-krusty-krab', viewOffset: [6, 2.2, 2.5], focusHeight: 1.2 },
    { kind: 'stop', landmark: 'landmark-bureau', viewOffset: [-3, 2, 6.5], focusHeight: 1.3 },
    { kind: 'pass', position: [-22, 2.8, 14] },
  ],
};

/**
 * Turns the route into a `DivePathSpec` in world units: landmark placements are scaled by the
 * scene's world scale (the same `WORLD_SCALE` `<OceanWorld>` renders with), the surface is the
 * top of the water volume and the floor is the lowest camera position on the route.
 */
export function buildDiveSpec(config: DiveConfig = DIVE_CONFIG, scale: number = WORLD_SCALE): DivePathSpec {
  const controlPoints: Vec3[] = [];
  const waypoints: { id: string; at: number; focus: Vec3 }[] = [];

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
    });
    controlPoints.push([base[0] + dx, base[1] + dy, base[2] + dz]);
  }

  // The floor is the deepest camera position, so the end of the dive reads `floorMeters`.
  const floorY = Math.min(...controlPoints.map((p) => p[1]));
  return {
    controlPoints,
    waypoints,
    depth: { surfaceY: WATER_VOLUME.max[1], floorY, floorMeters: config.floorMeters },
  };
}

export const buildDivePath = (config: DiveConfig = DIVE_CONFIG, scale: number = WORLD_SCALE): DivePath =>
  DivePath.create(buildDiveSpec(config, scale));
