/**
 * Rendering tiers, resolved at runtime from device capability and sustained frame rate.
 *
 * Every asset declares the lowest tier it may load at, so tier selection alone determines
 * the download budget. See the `quality-tiers` roadmap item for the resolution logic.
 */
export const QUALITY_TIERS = ['low', 'medium', 'high'] as const;

export type QualityTier = (typeof QUALITY_TIERS)[number];

const TIER_ORDER: Record<QualityTier, number> = { low: 0, medium: 1, high: 2 };

/** True when `available` is at or below the tier the device resolved to. */
export const tierAllows = (
  resolved: QualityTier,
  available: QualityTier
): boolean => TIER_ORDER[available] <= TIER_ORDER[resolved];
