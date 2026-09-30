import type { Branded } from '@qa3elhamor/shared-domain';
import type { LocalizedText } from './localized-text.js';

export type ResumeEntryId = Branded<'ResumeEntry'>;

/** A calendar month, `YYYY-MM`. Validated on parse, so string comparison orders it correctly. */
export type YearMonth = Branded<'YearMonth'>;

export interface Period {
  readonly start: YearMonth;
  /** Absent while the position is ongoing. */
  readonly end?: YearMonth;
}

/** One position in the owner's experience. */
export interface ResumeEntry {
  readonly id: ResumeEntryId;
  readonly company: LocalizedText;
  readonly companyUrl?: string;
  readonly role: LocalizedText;
  readonly location?: LocalizedText;
  readonly period: Period;
  readonly summary?: LocalizedText;
  readonly highlights: readonly LocalizedText[];
  /** Technologies used. Names are data and are not localized. */
  readonly tech: readonly string[];
  /** Optional playful line, e.g. the grumpy "Performance Review" the Tiki head reads out. */
  readonly quip?: LocalizedText;
}
