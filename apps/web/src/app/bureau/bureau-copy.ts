import type { Locale, LocalizedText, SiteCopy } from '@qa3elhamor/content-domain';
import { bilingual } from '../i18n/ui-strings';

/**
 * The Bureau visit's own words, around the narration (`content/narration.json`) and the form's
 * copy (`content/site.json`). Interface words, not content, like the other
 * visits' (`i18n/ui-strings.ts`).
 */
export interface BureauWords {
  /** The last line's action: the scroll comes out of the tube. */
  readonly openScroll: string;
  /** Under the unrolled scroll: put it away unsent (the draft is kept). */
  readonly rollUp: string;
  /** The accessible name of the unrolled scroll. */
  readonly scrollLabel: string;
  /** The last line's action when the public wall is on: the notice wall comes out. */
  readonly openWall: string;
  /** Under the notice wall: back to the President. */
  readonly closeWall: string;
}

export const BUREAU_VISIT_COPY = bilingual({
  en: {
    openScroll: 'File a complaint',
    rollUp: 'Roll it back up',
    scrollLabel: 'Complaint scroll',
    openWall: 'Read the public wall',
    closeWall: 'Back to the President',
  },
  ar: {
    openScroll: 'قدّم شكوى',
    rollUp: 'لفّها تاني',
    scrollLabel: 'ورقة الشكوى',
    openWall: 'اقرا لوحة الشكاوى العامة',
    closeWall: 'ارجع للرئيس',
  },
}) satisfies Readonly<Record<Locale, BureauWords>>;

/**
 * What the Sardine President says once the bottle is on its way: one line per delivery outcome,
 * by the id the dialogue knows it under. Honest about a Bureau with no post office wired up.
 * They name the site's owner, so they are content (`content/site.json` → `copy`).
 */
export const filedLines = (
  copy: SiteCopy,
): Readonly<Record<FiledLineId, LocalizedText>> => ({
  filed: copy.complaintFiledLine,
  'filed-unsent': copy.complaintFiledUnsentLine,
  'filed-public': copy.complaintFiledPublicLine,
});

export type FiledLineId = 'filed' | 'filed-unsent' | 'filed-public';
