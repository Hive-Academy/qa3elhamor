import { QUALITY_TIERS, type QualityTier } from './quality-tier.js';

/**
 * Per-tier rendering budgets, as data. The quality provider selects one of these; nothing in
 * the scene reads the tier name itself, so changing a budget never means changing code.
 */
export interface QualityProfile {
  readonly tier: QualityTier;
  /**
   * Device pixel ratio range: the canvas renders at `devicePixelRatio` clamped into it. The
   * largest single lever on a phone, whose native ratio (2.5-3.5) multiplies fragment work.
   */
  readonly dpr: readonly [min: number, max: number];
  /**
   * MSAA on the WebGL context. The context is created once, so this applies at the tier the
   * page started at; a later governor downgrade cannot turn it off. See `shouldAntialias`.
   */
  readonly antialias: boolean;
  /** Instance counts of the two particle fields. */
  readonly particles: { readonly plankton: number; readonly bubbles: number };
  /** Projected caustics: off removes the shader patch; resolution is the texture edge in px. */
  readonly caustics: { readonly enabled: boolean; readonly resolution: number };
  /** Anisotropic filtering applied to the environment's textures (capped by the GPU). */
  readonly anisotropy: number;
  /** Line-of-sight raycasts that hide landmark beacons behind the map. */
  readonly beaconOcclusion: boolean;
  /** Shadow maps. Off at every tier: the caustics carry the lighting. */
  readonly shadows: boolean;
  /** Post-processing chain. None ships yet; the field is where one would be gated. */
  readonly postprocessing: 'none';
  /** Budgets of the ambient life (fish, the Hamour, kelp). See `AmbientLifeBudget`. */
  readonly ambientLife: AmbientLifeBudget;
}

/**
 * How much ambient life a tier renders. Each fish school and the kelp bed are one instanced
 * draw call; the Hamour is one. The CPU cost is the fish: `schools x fishPerSchool` boids,
 * each reading `neighbourSamples` others per frame (O(n), never O(n^2)).
 */
export interface AmbientLifeBudget {
  /** Fish schools rendered, at most: the first `schools` of the configured list. */
  readonly schools: number;
  readonly fishPerSchool: number;
  /** School-mates each fish looks at per frame for cohesion, alignment and separation. */
  readonly neighbourSamples: number;
  /** Kelp stalks in the whole bed. */
  readonly kelp: number;
  /** The patrolling grouper: one draw call of a few hundred triangles. */
  readonly hamour: boolean;
}

export const QUALITY_PROFILES: Readonly<Record<QualityTier, QualityProfile>> = {
  low: {
    tier: 'low',
    dpr: [1, 1],
    antialias: false,
    particles: { plankton: 352, bubbles: 48 },
    caustics: { enabled: false, resolution: 128 },
    anisotropy: 1,
    beaconOcclusion: false,
    shadows: false,
    postprocessing: 'none',
    // The hero creature stays even here: it is one cheap draw call and the site's namesake.
    ambientLife: { schools: 2, fishPerSchool: 12, neighbourSamples: 3, kelp: 36, hamour: true },
  },
  medium: {
    tier: 'medium',
    dpr: [1, 1.5],
    antialias: false,
    particles: { plankton: 1056, bubbles: 144 },
    caustics: { enabled: true, resolution: 128 },
    anisotropy: 4,
    // Occlusion raycasts the 65k-triangle map every frame: measured as the main CPU cost
    // left once the GPU budgets are cut, so only the high tier pays for it.
    beaconOcclusion: false,
    shadows: false,
    postprocessing: 'none',
    ambientLife: { schools: 4, fishPerSchool: 22, neighbourSamples: 4, kelp: 96, hamour: true },
  },
  high: {
    tier: 'high',
    dpr: [1, 2],
    antialias: true,
    particles: { plankton: 2112, bubbles: 288 },
    caustics: { enabled: true, resolution: 256 },
    anisotropy: 8,
    beaconOcclusion: true,
    shadows: false,
    postprocessing: 'none',
    ambientLife: { schools: 6, fishPerSchool: 36, neighbourSamples: 6, kelp: 180, hamour: true },
  },
};

/** The canvas pixel ratio a profile renders at on a device with the given native ratio. */
export const profilePixelRatio = (profile: QualityProfile, devicePixelRatio: number): number => {
  const [min, max] = profile.dpr;
  const native = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(max, Math.max(min, native));
};

/**
 * MSAA only where the profile allows it and the pixel ratio is below 1.5: at 1.5 or more the
 * canvas already renders 2.25-4x the fragments, which smooths edges on its own, so MSAA on
 * top would double the cost where it is least visible.
 */
export const shouldAntialias = (profile: QualityProfile, devicePixelRatio: number): boolean =>
  profile.antialias && profilePixelRatio(profile, devicePixelRatio) < 1.5;

/** The next tier down, or `undefined` at the bottom. */
export const lowerTier = (tier: QualityTier): QualityTier | undefined =>
  QUALITY_TIERS[QUALITY_TIERS.indexOf(tier) - 1];

/** The next tier up, or `undefined` at the top. */
export const higherTier = (tier: QualityTier): QualityTier | undefined =>
  QUALITY_TIERS[QUALITY_TIERS.indexOf(tier) + 1];

export const isQualityTier = (value: unknown): value is QualityTier =>
  typeof value === 'string' && (QUALITY_TIERS as readonly string[]).includes(value);

/**
 * The manual override from a query string (`?quality=low|medium|high`). Anything else,
 * including an absent or misspelled value, is no override. Never persisted: a visitor's
 * choice lives in the URL they share or bookmark, not in storage.
 */
export const parseQualityOverride = (search: string): QualityTier | null => {
  const value = new URLSearchParams(search).get('quality')?.trim().toLowerCase();
  return isQualityTier(value) ? value : null;
};
