import { WEB_ASSETS, type AssetEntry } from './asset-manifest.js';
import { tierAllows, type QualityTier } from './quality-tier.js';

/**
 * The assets a device at `tier` may load at all.
 *
 * Call sites: `assetAllowed` gates `useLandmarkModel` in `apps/web/src/app/landmark-ports.ts`,
 * the one manifest-driven model loader, which passes `null` to `useCompressedModel` for an
 * asset the tier does not allow, so nothing is fetched. The environment (`app.tsx`) is
 * `minimumTier: 'low'` and always allowed. Any new manifest-driven loader must gate the same
 * way; `assetsForTier` is the list form, for preloading or budgeting.
 */
export const assetsForTier = (
  tier: QualityTier,
  assets: readonly AssetEntry[] = WEB_ASSETS
): readonly AssetEntry[] => assets.filter((asset) => tierAllows(tier, asset.minimumTier));

/** True when the manifested asset `id` may be loaded at `tier`; false for unknown ids. */
export const assetAllowed = (
  id: string,
  tier: QualityTier,
  assets: readonly AssetEntry[] = WEB_ASSETS
): boolean => {
  const asset = assets.find((candidate) => candidate.id === id);
  return asset !== undefined && tierAllows(tier, asset.minimumTier);
};
