import type { Locale, LocalizedText } from '@qa3elhamor/content-domain';

/**
 * The Bureau visit's own words, around the narration (`content/narration.json`) and the form's
 * copy (`content/site.json`). Hard-coded en/ar like the other visits' (`tiki/tiki-copy.ts`);
 * they move into `content/site.json` copy keys once the owner signs the visit off.
 */
export interface BureauWords {
  /** The last line's action: the scroll comes out of the tube. */
  readonly openScroll: string;
  /** Under the unrolled scroll: put it away unsent (the draft is kept). */
  readonly rollUp: string;
  /** The accessible name of the unrolled scroll. */
  readonly scrollLabel: string;
}

export const BUREAU_VISIT_COPY = {
  en: {
    openScroll: 'File a complaint',
    rollUp: 'Roll it back up',
    scrollLabel: 'Complaint scroll',
  },
  ar: {
    openScroll: 'قدّم شكوى',
    rollUp: 'لفّها تاني',
    scrollLabel: 'ورقة الشكوى',
  },
} as const satisfies Record<Locale, BureauWords>;

/**
 * What the Sardine President says once the bottle is on its way: one line per delivery outcome,
 * by the id the dialogue knows it under. Honest about a Bureau with no post office wired up.
 */
export const FILED_LINES = {
  filed: {
    en: "Stamped, bottled and off on the current. It reaches Abdallah's desk before the next tide.",
    ar: 'اتختمت، واتقفلت في إزازة، وماشية مع التيار. هتوصل مكتب عبدالله قبل المدّ الجاي.',
  },
  'filed-unsent': {
    en: "Stamped and bottled, but between us: the Bureau's post office has not opened yet, so this bottle is going nowhere. The links on the Citizenship Card reach him.",
    ar: 'اتختمت واتقفلت في إزازة، بس بيني وبينك: مكتب بريد البلدية لسه ما فتحش، فالإزازة دي مش رايحة في حتة. روابط بطاقة المواطن بتوصله.',
  },
} as const satisfies Record<string, LocalizedText>;

export type FiledLineId = keyof typeof FILED_LINES;
