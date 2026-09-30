/**
 * Every tunable of the deep-ocean atmosphere, in one place.
 *
 * `template-config` (per-fork look) and `quality-tiers` (per-device budget) drive these later;
 * until then the defaults below are the art direction. Colours are sRGB hex strings; distances
 * and sizes are world units (see `WORLD_SCALE` in `world-space.tsx`).
 */
export interface OceanFogConfig {
  /** Fog and clear colour: the deep navy the whole scene fades into. */
  readonly color: string;
  /** `FogExp2` density per world unit. Higher is murkier. */
  readonly density: number;
}

export interface OceanCausticsConfig {
  /** Brightness added to up-facing surfaces at a caustic peak, relative to their albedo. */
  readonly intensity: number;
  /** World units covered by one tile of the caustic pattern. */
  readonly scale: number;
  /** Pattern drift, in tiles per second. */
  readonly speed: number;
  /** Tint of the refracted light. */
  readonly color: string;
}

export interface OceanParticlesConfig {
  /** Total instances across plankton and bubbles. The single knob `quality-tiers` gates. */
  readonly count: number;
  /** Fraction of `count` rendered as bubbles; the rest are plankton. */
  readonly bubbleShare: number;
  readonly planktonColor: string;
  readonly bubbleColor: string;
  /** Billboard edge length in world units, before the per-instance 0.5x-1.5x variation. */
  readonly planktonSize: number;
  readonly bubbleSize: number;
  /** Mean bubble rise speed in world units per second. */
  readonly bubbleRiseSpeed: number;
  /** Mean upward plankton drift in world units per second. */
  readonly planktonDriftSpeed: number;
}

export interface OceanLightsConfig {
  readonly ambientColor: string;
  readonly ambientIntensity: number;
  /** Hemisphere light: faint surface glow from above, near-black from the seabed. */
  readonly skyColor: string;
  readonly groundColor: string;
  readonly hemisphereIntensity: number;
  /** The one directional "sun through the surface" light the caustics imply. */
  readonly sunColor: string;
  readonly sunIntensity: number;
}

export interface OceanEnvironmentConfig {
  readonly fog: OceanFogConfig;
  readonly caustics: OceanCausticsConfig;
  readonly particles: OceanParticlesConfig;
  readonly lights: OceanLightsConfig;
  /**
   * Time multiplier for particle drift and caustic motion when the visitor asks for reduced
   * motion (`prefers-reduced-motion: reduce`). 0 freezes the water; 1 ignores the preference.
   */
  readonly reducedMotionScale: number;
}

export const OCEAN_ENVIRONMENT_DEFAULTS: OceanEnvironmentConfig = {
  fog: { color: '#0a1e3f', density: 0.028 },
  caustics: { intensity: 1.35, scale: 14, speed: 0.035, color: '#bfefff' },
  particles: {
    count: 2400,
    bubbleShare: 0.12,
    planktonColor: '#b8e6d8',
    bubbleColor: '#d8f4ff',
    planktonSize: 0.09,
    bubbleSize: 0.22,
    bubbleRiseSpeed: 1.4,
    planktonDriftSpeed: 0.12,
  },
  lights: {
    ambientColor: '#1d4f7a',
    ambientIntensity: 0.9,
    skyColor: '#5fb4d9',
    groundColor: '#06101f',
    hemisphereIntensity: 1.1,
    sunColor: '#a9dcff',
    sunIntensity: 1.6,
  },
  reducedMotionScale: 0,
};

/** Upper bound on particle instances; protects the GPU from a mistyped config value. */
export const MAX_PARTICLE_COUNT = 20_000;

export interface OceanEnvironmentOverrides {
  readonly fog?: Partial<OceanFogConfig>;
  readonly caustics?: Partial<OceanCausticsConfig>;
  readonly particles?: Partial<OceanParticlesConfig>;
  readonly lights?: Partial<OceanLightsConfig>;
  readonly reducedMotionScale?: number;
}

type Range = readonly [min: number, max: number];
type NumericKeys<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T];
type ColourKeys<T> = { [K in keyof T]: T[K] extends string ? K : never }[keyof T];

/**
 * Accepted range of every numeric field. A value outside it is clamped; a non-number or
 * non-finite value falls back to the default, because NaN in a speed or size silently blanks
 * a whole shader (caustics vanish, a particle field is clipped away).
 */
export const OCEAN_CONFIG_RANGES: {
  readonly fog: Record<NumericKeys<OceanFogConfig>, Range>;
  readonly caustics: Record<NumericKeys<OceanCausticsConfig>, Range>;
  readonly particles: Record<NumericKeys<OceanParticlesConfig>, Range>;
  readonly lights: Record<NumericKeys<OceanLightsConfig>, Range>;
  readonly reducedMotionScale: Range;
} = {
  fog: { density: [0, 1] },
  caustics: { intensity: [0, 10], scale: [0.01, 10_000], speed: [0, 2] },
  particles: {
    count: [0, MAX_PARTICLE_COUNT],
    bubbleShare: [0, 1],
    planktonSize: [0.001, 10],
    bubbleSize: [0.001, 10],
    bubbleRiseSpeed: [0, 20],
    planktonDriftSpeed: [0, 20],
  },
  lights: { ambientIntensity: [0, 20], hemisphereIntensity: [0, 20], sunIntensity: [0, 20] },
  reducedMotionScale: [0, 1],
};

const COLOUR_KEYS: {
  readonly fog: readonly ColourKeys<OceanFogConfig>[];
  readonly caustics: readonly ColourKeys<OceanCausticsConfig>[];
  readonly particles: readonly ColourKeys<OceanParticlesConfig>[];
  readonly lights: readonly ColourKeys<OceanLightsConfig>[];
} = {
  fog: ['color'],
  caustics: ['color'],
  particles: ['planktonColor', 'bubbleColor'],
  lights: ['ambientColor', 'skyColor', 'groundColor', 'sunColor'],
};

const HEX_COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * The colour formats the config accepts: `#rgb` / `#rrggbb` hex. Anything else (a typo, a
 * CSS function, an empty string) would reach `THREE.Color`, which renders it black.
 */
export const isOceanColour = (value: unknown): value is string =>
  typeof value === 'string' && HEX_COLOUR.test(value);

const sanitiseNumber = (value: unknown, fallback: number, [min, max]: Range): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

function sanitiseSection<T extends object>(
  section: string,
  base: T,
  overrides: Partial<T> | undefined,
  ranges: Readonly<Record<string, Range>>,
  colours: readonly (keyof T)[]
): T {
  const defaults = base as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...defaults, ...overrides };

  for (const [key, range] of Object.entries(ranges)) {
    out[key] = sanitiseNumber(out[key], defaults[key] as number, range);
  }
  for (const key of colours) {
    const name = key as string;
    if (!isOceanColour(out[name])) {
      console.warn(
        `Ocean config: ${section}.${name} "${String(out[name])}" is not a #rgb/#rrggbb colour; using ${String(defaults[name])}.`
      );
      out[name] = defaults[name];
    }
  }
  return out as unknown as T;
}

/**
 * Merges overrides section by section over the defaults and sanitises every field: numbers
 * are clamped to `OCEAN_CONFIG_RANGES` (non-finite values fall back to the default) and
 * colours must be hex (invalid ones fall back to the default with a console warning).
 * `particleCount`, when given, wins over `overrides.particles.count` so a quality tier can
 * gate it without restating the rest of the config.
 */
export function resolveOceanConfig(
  overrides: OceanEnvironmentOverrides = {},
  particleCount?: number,
  base: OceanEnvironmentConfig = OCEAN_ENVIRONMENT_DEFAULTS
): OceanEnvironmentConfig {
  const particleOverrides =
    particleCount === undefined ? overrides.particles : { ...overrides.particles, count: particleCount };
  const particles = sanitiseSection(
    'particles',
    base.particles,
    particleOverrides,
    OCEAN_CONFIG_RANGES.particles,
    COLOUR_KEYS.particles
  );

  return {
    fog: sanitiseSection('fog', base.fog, overrides.fog, OCEAN_CONFIG_RANGES.fog, COLOUR_KEYS.fog),
    caustics: sanitiseSection(
      'caustics',
      base.caustics,
      overrides.caustics,
      OCEAN_CONFIG_RANGES.caustics,
      COLOUR_KEYS.caustics
    ),
    particles: { ...particles, count: Math.floor(particles.count) },
    lights: sanitiseSection(
      'lights',
      base.lights,
      overrides.lights,
      OCEAN_CONFIG_RANGES.lights,
      COLOUR_KEYS.lights
    ),
    reducedMotionScale: sanitiseNumber(
      overrides.reducedMotionScale,
      base.reducedMotionScale,
      OCEAN_CONFIG_RANGES.reducedMotionScale
    ),
  };
}

/** Splits the particle budget into plankton and bubble instance counts. */
export function splitParticleCount(particles: OceanParticlesConfig): {
  readonly plankton: number;
  readonly bubbles: number;
} {
  const bubbles = Math.round(particles.count * particles.bubbleShare);
  return { plankton: particles.count - bubbles, bubbles };
}
