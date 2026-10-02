import {
  localize,
  type Locale,
  type LocalizedText,
  type Period,
  type ResumeEntry,
} from '@qa3elhamor/content-domain';
import type { VisitObject } from '../narrators/visit-types';
import { fillCopy } from '../overlays/overlay-copy';
import { TIKI_VISIT_COPY } from './tiki-copy';

/** A period as years, short enough for a tablet: "2019 – 2024", "2020 – now", "2015". */
export function yearsOf(period: Period, present: string): string {
  const start = period.start.slice(0, 4);
  if (!period.end) return `${start} – ${present}`;
  const end = period.end.slice(0, 4);
  return end === start ? start : `${start} – ${end}`;
}

/**
 * The resume's jobs (`content/resume.json`, newest first) as the Tiki's tablets: the role carved
 * as the title, the company and years under it; selecting one shows its highlights and tech.
 */
export function jobObjects(
  entries: readonly ResumeEntry[],
  lang: Locale,
): VisitObject[] {
  const words = TIKI_VISIT_COPY[lang];
  return entries.map((entry) => {
    const role = localize(entry.role, lang);
    const company = localize(entry.company, lang);
    return {
      id: entry.id,
      label: role,
      caption: [company, yearsOf(entry.period, words.present)],
      topic: fillCopy(words.reviewOf, { company }),
      detailLabel: fillCopy(words.detailOf, { role, company }),
      notes: entry.highlights.map((highlight) => localize(highlight, lang)),
      chips: entry.tech,
    };
  });
}

/**
 * What the narrator says about each tablet: the job's performance review (`quip`), from the
 * content itself rather than the narration. A job without one is still selectable.
 */
export const jobReviews = (
  entries: readonly ResumeEntry[],
): Readonly<Record<string, LocalizedText | undefined>> =>
  Object.fromEntries(entries.map((entry) => [entry.id, entry.quip]));
