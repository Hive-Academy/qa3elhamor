import type { NarrationLandmarkId } from '@qa3elhamor/content-domain';
import type { NarratorCastId } from '@qa3elhamor/world-feature';
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
    };

/** The narrator for `landmark` under `config`. */
export function narratorFor(
  landmark: NarrationLandmarkId,
  config: NarratorsConfig = NARRATORS_CONFIG,
): NarratorChoice {
  const cast = config.cast[landmark];
  const bundled = config.useBundledCharacters
    ? config.bundled[landmark]
    : undefined;
  if (!bundled) return { kind: 'cast', cast };
  const { asset, heightFactor } = bundled;
  return { kind: 'model', asset, heightFactor, fallback: cast };
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
