import type { NarrationLandmarkId } from '@qa3elhamor/content-domain';
import {
  SPONGEBOB_RIG,
  isNarratorClipId,
  type NarratorCastId,
  type NarratorClipHold,
  type NarratorRigSpec,
} from '@qa3elhamor/world-feature';
import { NARRATOR_CAST } from '../site.config';

/**
 * Who narrates each landmark: the cast is config (`NARRATOR_CAST` in `src/site.config.ts`), the
 * switch to the bundled models is the deployment's (`VITE_BUNDLED_CHARACTERS`). The default
 * cast is original and built in code (`@qa3elhamor/world-feature`, no asset files, IP-clean).
 * `useBundledCharacters` swaps in the decimated SpongeBob and Patrick models shipped with the
 * template where a landmark names one in `bundled`, giving a mixed cast: Nickelodeon
 * characters, so it is off in the template and an owner turns it on for their own deployment,
 * accepting that risk (`.ptah/scope-decisions.md`, amendments of 2026-10-01 and 2026-10-02).
 *
 * Swapping the cast is config only: no scene code changes.
 */
export interface NarratorsConfig extends NarratorCastConfig {
  /** True: a landmark with a `bundled` character gets it instead of its original cast. */
  readonly useBundledCharacters: boolean;
}

/** The cast as `site.config.ts` declares it. */
export interface NarratorCastConfig {
  /** The original cast, per landmark: the default, and the fallback for a bundled model. */
  readonly cast: Readonly<Record<NarrationLandmarkId, NarratorCastId>>;
  /** The bundled character per landmark, where there is one. The others keep their cast. */
  readonly bundled: Readonly<Partial<Record<NarrationLandmarkId, BundledCharacter>>>;
  /** Whether `bundled` is on when `VITE_BUNDLED_CHARACTERS` is unset. A fork sets `false`. */
  readonly bundledByDefault: boolean;
}

/** A bundled narrator model: a `WEB_ASSETS` id, lazy and gated by the quality tier. */
export interface BundledCharacter {
  readonly asset: 'spongebob-narrator' | 'patrick-narrator';
  /**
   * Rendered height as a multiple of the original cast's height at the same post. A standing
   * character is taller than a fish is high, so it is drawn taller to read at the same size.
   */
  readonly heightFactor: number;
}

/**
 * The deployment's switch: `VITE_BUNDLED_CHARACTERS=true` or `false` overrides; unset (or any
 * other value) uses the site's `bundledByDefault`.
 */
export const bundledCharactersFromEnv = (
  env: { readonly VITE_BUNDLED_CHARACTERS?: string },
  fallback = false,
): boolean => {
  if (env.VITE_BUNDLED_CHARACTERS === 'true') return true;
  if (env.VITE_BUNDLED_CHARACTERS === 'false') return false;
  return fallback;
};

export const NARRATORS_CONFIG: NarratorsConfig = {
  ...NARRATOR_CAST,
  useBundledCharacters: bundledCharactersFromEnv(import.meta.env, NARRATOR_CAST.bundledByDefault),
};

/**
 * Where a landmark's resident narrator stands (`ResidentNarrator`) while the visitor dives past,
 * and where its guide hops out from when the landmark opens (and back to when it closes).
 */
export interface ResidentPlacement {
  /**
   * From the landmark's origin (its base), in the landmark's own frame: scene-world units for an
   * unscaled landmark, as in `LANDMARK_PLACEMENTS`. x and z along the ground, y up (0 is the
   * landmark's base, on the seabed).
   */
  readonly offset: readonly [number, number, number];
  /** Degrees about up in the landmark's frame (0 faces its +z), or 'camera': the stop's eye. */
  readonly facing: number | 'camera';
  /** Multiplies its height (the visit narrator's height x the model's `heightFactor`). Default 1. */
  readonly scale?: number;
}

/** A resident's scale is kept within this (a typo of 10 must not make a giant). */
export const RESIDENT_SCALE_RANGE = { min: 0.2, max: 3 } as const;

/**
 * Where each rigged narrator stands at home. A landmark without an entry keeps its resident at
 * the visit's narrator post. Tune one live with `?place=resident` (development only,
 * `narrators/README.md`), then paste its "Copy config" snippet here.
 */
export const RESIDENT_PLACEMENTS: Readonly<
  Partial<Record<NarrationLandmarkId, ResidentPlacement>>
> = {
  // Beside the Pineapple's door, on the side the dive comes from, facing the camera.
  pineapple: { offset: [0.016, 0, 0.138], facing: 'camera', scale: 0.62 },
};

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * `value` as a resident placement, or null (with a console warning naming `where`) when it is
 * not one: an offset of three finite numbers, a finite facing or 'camera', a finite positive
 * scale (clamped to `RESIDENT_SCALE_RANGE`).
 */
export function residentPlacementOf(
  value: unknown,
  where = 'resident placement',
): ResidentPlacement | null {
  if (value === undefined) return null;
  const v = value as Partial<Record<keyof ResidentPlacement, unknown>> | null;
  const offset = v?.offset;
  const facing = v?.facing;
  const scale = v?.scale ?? 1;
  const valid =
    Array.isArray(offset) &&
    offset.length === 3 &&
    offset.every(finiteNumber) &&
    (facing === 'camera' || finiteNumber(facing)) &&
    finiteNumber(scale) &&
    scale > 0;
  if (!valid) {
    console.warn(
      `Narrators: ignoring an invalid ${where} (it stands at the visit's post instead).`,
      value,
    );
    return null;
  }
  const [x, y, z] = offset as number[];
  return {
    offset: [x ?? 0, y ?? 0, z ?? 0],
    facing: facing as number | 'camera',
    scale: Math.min(
      RESIDENT_SCALE_RANGE.max,
      Math.max(RESIDENT_SCALE_RANGE.min, scale),
    ),
  };
}

/** The resident's setup a bundled narrator carries: its landmark, and where it stands. */
export interface ResidentSetup {
  readonly landmark: NarrationLandmarkId;
  /** Null: at the visit's narrator post. */
  readonly placement: ResidentPlacement | null;
}

/**
 * What a landmark's narrator is: one of the original cast, or a bundled model, which keeps
 * the original cast as its `fallback` for tiers that do not allow the model, and for a model
 * that fails to load.
 */
export type NarratorChoice =
  | { readonly kind: 'cast'; readonly cast: NarratorCastId }
  | {
      readonly kind: 'model';
      readonly asset: BundledCharacter['asset'];
      readonly heightFactor: number;
      readonly fallback: NarratorCastId;
      readonly resident: ResidentSetup;
    };

/** The narrator for `landmark` under `config`, its resident placed from `residents`. */
export function narratorFor(
  landmark: NarrationLandmarkId,
  config: NarratorsConfig = NARRATORS_CONFIG,
  residents: Readonly<
    Partial<Record<NarrationLandmarkId, unknown>>
  > = RESIDENT_PLACEMENTS,
): NarratorChoice {
  const cast = config.cast[landmark];
  const bundled = config.useBundledCharacters
    ? config.bundled[landmark]
    : undefined;
  if (!bundled) return { kind: 'cast', cast };
  const { asset, heightFactor } = bundled;
  const placement = residentPlacementOf(
    residents[landmark],
    `RESIDENT_PLACEMENTS.${landmark}`,
  );
  return {
    kind: 'model',
    asset,
    heightFactor,
    fallback: cast,
    resident: { landmark, placement },
  };
}

/**
 * The config with a development-only override from the page URL: `?narrators=bundled` or
 * `?narrators=original`, for previewing the switch without a rebuild. Production builds ignore
 * the URL, so a deployment's choice cannot be flipped by a visitor.
 */
export function narratorsConfigFor(
  search: string,
  dev: boolean,
  config: NarratorsConfig = NARRATORS_CONFIG,
): NarratorsConfig {
  if (!dev) return config;
  const wanted = new URLSearchParams(search).get('narrators');
  if (wanted === 'bundled') return { ...config, useBundledCharacters: true };
  if (wanted === 'original') return { ...config, useBundledCharacters: false };
  return config;
}

/**
 * Bones for the bundled models that have them (`@qa3elhamor/world-feature`, `narrator-rig.ts`):
 * a rigged model hops, waves, gestures and idles, and idles at its landmark before the visit
 * (`ResidentNarrator`). A model without an entry plays as a static model. Rigging another
 * character is a data addition here (and its `NarratorRigSpec`).
 */
export const NARRATOR_RIGS: Readonly<
  Partial<Record<BundledCharacter['asset'], NarratorRigSpec>>
> = {
  'spongebob-narrator': SPONGEBOB_RIG,
};

/**
 * A development-only preview of one clip on every rigged narrator, from the page URL:
 * `?pose=idle|wave|talk|hop|react|listen|scratch|bounce|look|hips`, optionally frozen with `&poseAt=0..1` (how far through the
 * clip). Production builds ignore the URL (null).
 */
export function narratorPosePreviewFor(
  search: string,
  dev: boolean,
): NarratorClipHold | null {
  if (!dev) return null;
  const params = new URLSearchParams(search);
  const clip = params.get('pose');
  if (!isNarratorClipId(clip)) return null;
  const at = Number.parseFloat(params.get('poseAt') ?? '');
  return Number.isFinite(at) ? { clip, at: Math.min(1, Math.max(0, at)) } : { clip };
}
