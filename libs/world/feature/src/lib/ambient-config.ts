import type { AmbientLifeBudget } from '@qa3elhamor/world-domain';
import type { FishSchoolSpec } from './fish-school.js';
import { DEFAULT_PATROL_TUNING, DEFAULT_VIEW_CLEARANCE, type PatrolTuning, type ViewClearance } from './hamour-patrol.js';
import type { KelpClearing } from './kelp-bed.js';
import { isOceanColour } from './ocean-config.js';
import { WATER_VOLUME, type Vec3 } from './world-space.js';

/**
 * Everything a fork can change about the ambient life, as data. Positions are world units
 * (the camera's units), except `characters`, which are scene-world like landmarks. How much
 * of it renders is the quality tier's call (`QualityProfile.ambientLife`), not this config's.
 */
export interface AmbientLifeConfig {
  /**
   * Fish schools in priority order: a tier rendering `n` schools renders the first `n`, so put
   * the ones every visitor should see first.
   */
  readonly schools: readonly FishSchoolSpec[];
  /** The patrolling grouper, or null for none. */
  readonly hamour: HamourConfig | null;
  /** The kelp bed, or null for none. */
  readonly kelp: KelpBedConfig | null;
  /**
   * Extra manifested models placed in the scene, e.g. the bundled character models. Empty by
   * default: the SpongeBob and Patrick models are Nickelodeon IP, so a site carrying its
   * owner's name does not place them (`.ptah/scope-decisions.md` §IP). A fork that accepts
   * that may list them here; each still obeys its manifest `minimumTier`.
   */
  readonly characters: readonly AmbientCharacterPlacement[];
  /**
   * Speed multiplier for all ambient motion when the visitor asks for reduced motion. 0
   * freezes the life in place; the default keeps it slow rather than dead.
   */
  readonly reducedMotionScale: number;
  readonly seed: number;
}

export interface HamourConfig {
  /** Patrol points, world units, joined into a closed loop. At least 3. */
  readonly patrol: readonly Vec3[];
  /** Body length, world units. */
  readonly length: number;
  readonly tuning: PatrolTuning;
  /** The cone in front of the camera the Hamour never swims into. */
  readonly viewClearance: ViewClearance;
  /** Lowest height its patrol may take it to, world units (keeps it off the seabed). */
  readonly minY: number;
}

export interface KelpBedConfig {
  /** Rectangle the bed may grow in, xz world units. */
  readonly area: { readonly min: readonly [x: number, z: number]; readonly max: readonly [x: number, z: number] };
  /** No kelp roots within these: landmark footprints and the camera's line. */
  readonly clearings: readonly KelpClearing[];
  readonly stalksPerPatch: number;
  readonly patchRadius: number;
  readonly minHeight: number;
  readonly maxHeight: number;
  /** Tip sway, world units. */
  readonly sway: number;
  readonly baseColor: string;
  readonly tipColor: string;
}

export interface AmbientCharacterPlacement {
  /** A `WEB_ASSETS` id, e.g. `'spongebob-character'`. */
  readonly asset: string;
  /** Scene-world units, like landmark placements. */
  readonly position: Vec3;
  readonly rotationY?: number;
  readonly scale?: number;
}

/**
 * The art-directed defaults, around the sample town. `apps/web` replaces the patrol, the
 * school homes and the kelp clearings with ones derived from its dive route.
 */
export const AMBIENT_LIFE_DEFAULTS: AmbientLifeConfig = {
  schools: [
    { center: [12, 8, 12], radius: 6, speed: 2.2, size: 0.42, color: '#9fc4d8' },
    { center: [-10, 6, 8], radius: 5, speed: 1.8, size: 0.5, color: '#e3bf4f' },
    { center: [20, 14, 24], radius: 7, speed: 2.4, size: 0.36, color: '#a9d6cf' },
    { center: [-4, 5, -12], radius: 5, speed: 1.6, size: 0.55, color: '#d98b52' },
    { center: [28, 20, 30], radius: 7, speed: 2.6, size: 0.34, color: '#c6d8e4' },
    { center: [-18, 4, 14], radius: 5, speed: 1.7, size: 0.48, color: '#7fc8b4' },
  ],
  hamour: {
    patrol: [
      [24, 10, 20],
      [6, 7, 12],
      [-14, 6, 10],
      [-20, 7, -8],
      [0, 8, -14],
      [20, 9, -6],
    ],
    length: 3.6,
    tuning: DEFAULT_PATROL_TUNING,
    viewClearance: DEFAULT_VIEW_CLEARANCE,
    minY: 4.5,
  },
  kelp: {
    area: { min: [-45, -40], max: [45, 45] },
    clearings: [],
    stalksPerPatch: 6,
    patchRadius: 1.6,
    minHeight: 2.2,
    maxHeight: 5.5,
    sway: 0.55,
    baseColor: '#264a20',
    tipColor: '#a3b84c',
  },
  characters: [],
  reducedMotionScale: 0.25,
  seed: 1,
};

/** Upper bounds that protect the frame from a mistyped config; the tier is the real budget. */
export const AMBIENT_LIMITS = { schoolRadius: [0.5, 40], fishSize: [0.05, 3], fishSpeed: [0.05, 12] } as const;

const finiteVec = (v: Vec3): boolean => v.length === 3 && v.every(Number.isFinite);
const clamp = (value: number, [min, max]: readonly [number, number]): number => Math.min(max, Math.max(min, value));
const insideWater = (v: Vec3): Vec3 => [
  clamp(v[0], [WATER_VOLUME.min[0], WATER_VOLUME.max[0]]),
  clamp(v[1], [WATER_VOLUME.min[1], WATER_VOLUME.max[1]]),
  clamp(v[2], [WATER_VOLUME.min[2], WATER_VOLUME.max[2]]),
];

/** What a tier actually renders of a config: everything sanitised and cut to the budget. */
export interface ResolvedAmbientLife {
  readonly schools: readonly FishSchoolSpec[];
  readonly fishPerSchool: number;
  readonly neighbourSamples: number;
  readonly hamour: HamourConfig | null;
  readonly kelp: (KelpBedConfig & { readonly count: number }) | null;
  readonly characters: readonly AmbientCharacterPlacement[];
  readonly reducedMotionScale: number;
  readonly seed: number;
}

const warn = (message: string): void => console.warn(`Ambient life config: ${message}`);

/**
 * Cuts a config to a tier's budget and sanitises it: schools with a non-finite home or a bad
 * colour are dropped (with a warning), sizes and speeds clamped; the Hamour is dropped when
 * its patrol has fewer than 3 finite points; patrol points and school homes are kept inside
 * the water volume, and patrol points above `minY`.
 */
export function resolveAmbientLife(config: AmbientLifeConfig, budget: AmbientLifeBudget): ResolvedAmbientLife {
  const schools = config.schools
    .filter((school, index) => {
      const ok = finiteVec(school.center) && isOceanColour(school.color);
      if (!ok) warn(`school ${index} has a non-finite center or a non-hex colour; skipped.`);
      return ok;
    })
    .slice(0, Math.max(0, Math.floor(budget.schools)))
    .map((school) => ({
      ...school,
      center: insideWater(school.center),
      radius: clamp(Number.isFinite(school.radius) ? school.radius : 5, AMBIENT_LIMITS.schoolRadius),
      size: clamp(Number.isFinite(school.size) ? school.size : 0.4, AMBIENT_LIMITS.fishSize),
      speed: clamp(Number.isFinite(school.speed) ? school.speed : 2, AMBIENT_LIMITS.fishSpeed),
    }));

  let hamour: HamourConfig | null = null;
  if (budget.hamour && config.hamour) {
    const patrol = config.hamour.patrol.filter(finiteVec).map((point) => {
      const [x, y, z] = insideWater(point);
      return [x, Math.max(y, config.hamour?.minY ?? y), z] as const;
    });
    if (patrol.length >= 3) hamour = { ...config.hamour, patrol };
    else warn('the Hamour needs at least 3 finite patrol points; it is not placed.');
  }

  const kelpCount = Math.max(0, Math.floor(budget.kelp));
  const kelpOk =
    config.kelp !== null && isOceanColour(config.kelp.baseColor) && isOceanColour(config.kelp.tipColor);
  if (config.kelp && !kelpOk) warn('kelp colours must be #rgb/#rrggbb; the kelp bed is not placed.');

  return {
    schools,
    fishPerSchool: schools.length > 0 ? Math.max(0, Math.floor(budget.fishPerSchool)) : 0,
    neighbourSamples: Math.max(0, Math.floor(budget.neighbourSamples)),
    hamour,
    kelp: config.kelp && kelpOk && kelpCount > 0 ? { ...config.kelp, count: kelpCount } : null,
    characters: config.characters.filter((c) => finiteVec(c.position)),
    reducedMotionScale: clamp(Number.isFinite(config.reducedMotionScale) ? config.reducedMotionScale : 0, [0, 1]),
    seed: Number.isFinite(config.seed) ? Math.floor(config.seed) : 1,
  };
}
