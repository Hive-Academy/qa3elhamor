import type { Locale } from '@qa3elhamor/content-domain';
import type { NarratorChoice } from '../narrators.config';

/**
 * Words the narrator's bubble needs around the narration itself (which is content, in
 * `content/narration.json`). Kept here for the prototype; they move into `content/site.json`
 * copy keys once the owner signs the experience off.
 */
export const NARRATOR_COPY = {
  en: {
    bubbleRole: 'speech bubble',
    next: 'Next',
    skip: 'Skip',
    resume: 'Back to the tour',
    lineOf: 'Line {n} of {total}',
  },
  ar: {
    bubbleRole: 'فقاعة كلام',
    next: 'التالي',
    skip: 'تخطَّ',
    resume: 'رجوع للجولة',
    lineOf: 'السطر {n} من {total}',
  },
} as const satisfies Record<Locale, Record<string, string>>;

const NAMES = {
  hamour: { en: 'The Hamour', ar: 'الهامور' },
  'sardine-president': { en: 'The Sardine President', ar: 'رئيس السردين' },
  'crab-clerk': { en: 'The Crab Clerk', ar: 'الكاتب السلطعون' },
  'spongebob-narrator': { en: 'SpongeBob', ar: 'سبونج بوب' },
  'patrick-narrator': { en: 'Patrick', ar: 'باتريك' },
} as const;

/** The name on the bubble's tag for whoever plays `choice`. */
export const narratorName = (choice: NarratorChoice, locale: Locale): string =>
  NAMES[choice.kind === 'cast' ? choice.cast : choice.asset][locale];
