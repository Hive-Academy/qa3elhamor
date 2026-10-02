import type { QualityTier } from '@qa3elhamor/world-domain';
import type { OceanFontStatus } from './ocean-font';

/** What the visitor's settings allow: SDF text animates, so not under reduced motion nor on the low tier. */
export const oceanTextAllowed = ({
  reducedMotion,
  tier,
}: {
  readonly reducedMotion: boolean;
  readonly tier: QualityTier;
}): boolean => !reducedMotion && tier !== 'low';

/**
 * Whether the dive's words show as SDF text: allowed, and the font has arrived. While it loads,
 * or when it fails, the HTML text shows.
 */
export const oceanTextShown = ({
  allowed,
  font,
}: {
  readonly allowed: boolean;
  readonly font: OceanFontStatus;
}): boolean => allowed && font === 'ready';
