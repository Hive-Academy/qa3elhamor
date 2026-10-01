import type { NarrationLandmarkId } from '@qa3elhamor/content-domain';
import type { NarratorCastId } from '@qa3elhamor/world-feature';

/**
 * Who narrates each landmark. The default cast is original and built in code
 * (`@qa3elhamor/world-feature`, no asset files, IP-clean). `useBundledCharacters` swaps in
 * the decimated SpongeBob and Patrick models shipped with the template instead: Nickelodeon
 * characters, so it is off in the template and an owner turns it on for their own deployment,
 * accepting that risk (`.ptah/scope-decisions.md`, amendment of 2026-10-01).
 *
 * Swapping the cast is config only: no scene code changes. Only the Pineapple is wired today.
 */
export interface NarratorsConfig {
  /** The original cast, per landmark. */
  readonly cast: Readonly<Record<NarrationLandmarkId, NarratorCastId>>;
  /** True: the bundled character models below replace the original cast. */
  readonly useBundledCharacters: boolean;
  /** The bundled character per landmark, used only when `useBundledCharacters` is true. */
  readonly bundled: Readonly<Record<NarrationLandmarkId, BundledCharacter>>;
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

export const NARRATORS_CONFIG: NarratorsConfig = {
  cast: {
    pineapple: 'hamour',
    tiki: 'hamour',
    'krusty-krab': 'crab-clerk',
    bureau: 'sardine-president',
  },
  useBundledCharacters: false,
  bundled: {
    pineapple: { asset: 'spongebob-narrator', heightFactor: 1.9 },
    tiki: { asset: 'patrick-narrator', heightFactor: 1.9 },
    'krusty-krab': { asset: 'spongebob-narrator', heightFactor: 1.9 },
    bureau: { asset: 'patrick-narrator', heightFactor: 1.9 },
  },
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
  if (!config.useBundledCharacters) return { kind: 'cast', cast };
  const { asset, heightFactor } = config.bundled[landmark];
  return { kind: 'model', asset, heightFactor, fallback: cast };
}

/**
 * The config with a development-only override from the page URL: `?narrators=bundled` or
 * `?narrators=original`, for previewing the switch without editing this file. Production
 * builds ignore the URL, so a deployment's choice cannot be flipped by a visitor.
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
