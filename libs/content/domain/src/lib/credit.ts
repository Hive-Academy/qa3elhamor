import type { Branded } from '@qa3elhamor/shared-domain';
import type { LocalizedText } from './localized-text.js';

export type CreditId = Branded<'Credit'>;

export const CREDIT_KINDS = [
  'design',
  'inspiration',
  'font',
  'library',
  'music',
  'other',
] as const;

export type CreditKind = (typeof CREDIT_KINDS)[number];

/**
 * A content-level credit: who designed the site, what inspired it, which fonts or libraries
 * it ships with, and the music it plays (`music`: the track's source in `url`, its licence in
 * `license`; the site's config names the ambient bed's credit by id).
 *
 * Distinct from `Attribution` in `@qa3elhamor/world-domain`, which is the licence-mandated
 * CC-BY credit of each bundled 3D model. Those are tied to assets and live next to the asset
 * manifest so a model cannot ship without its credit; they are not editable content and must
 * not be duplicated here. A `Credit` is editorial and belongs to whoever runs the site.
 */
export interface Credit {
  readonly id: CreditId;
  readonly kind: CreditKind;
  readonly title: LocalizedText;
  readonly author?: string;
  readonly url?: string;
  /** Licence identifier, e.g. "OFL-1.1" or "MIT". */
  readonly license?: string;
  readonly note?: LocalizedText;
}
