import type { Locale, LocalizedText } from '@qa3elhamor/content-domain';
import { bilingual } from '../i18n/ui-strings';
import type { NarratorChoice } from '../narrators.config';

/**
 * Words the narrator's bubble needs around the narration itself (which is content, in
 * `content/narration.json`). Interface words, not content: see `i18n/ui-strings.ts`.
 */
export const NARRATOR_COPY = bilingual({
  en: {
    bubbleRole: 'speech bubble',
    next: 'Next',
    skip: 'Skip',
    resume: 'Back to the tour',
    lineOf: 'Line {n} of {total}',
    leave: 'Back to the dive',
    backToGuide: 'Back to the guide',
  },
  ar: {
    bubbleRole: 'فقاعة كلام',
    next: 'التالي',
    skip: 'تخطَّ',
    resume: 'رجوع للجولة',
    lineOf: 'السطر {n} من {total}',
    leave: 'رجوع للغطسة',
    backToGuide: 'رجوع للمرشد',
  },
});

/** Who plays each narrator, by cast or bundled asset id. Every name has both languages. */
export const NARRATOR_NAMES = {
  hamour: { en: 'The Hamour', ar: 'الهامور' },
  'sardine-president': { en: 'The Sardine President', ar: 'الرئيس السرديني' },
  'crab-clerk': { en: 'The Crab Clerk', ar: 'الكاتب السلطعون' },
  'spongebob-narrator': { en: 'SpongeBob', ar: 'سبونج بوب' },
  'patrick-narrator': { en: 'Patrick', ar: 'باتريك' },
} as const satisfies Record<string, Required<LocalizedText>>;

/** The name on the bubble's tag for whoever plays `choice`. */
export const narratorName = (choice: NarratorChoice, locale: Locale): string =>
  NARRATOR_NAMES[choice.kind === 'cast' ? choice.cast : choice.asset][locale];
