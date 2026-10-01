import type { Locale } from '@qa3elhamor/content-domain';

/**
 * Words only the Pineapple visit needs. Kept here for the prototype; they move into
 * `content/site.json` copy keys once the owner signs the experience off.
 */
export const PINEAPPLE_VISIT_COPY = {
  en: {
    openCard: 'Open the full Citizenship Card',
    leave: 'Back to the dive',
    backToGuide: 'Back to the guide',
    skillsList: 'His specialties, as bubbles',
    skillsOf: '{group}: skills',
  },
  ar: {
    openCard: 'افتح بطاقة المواطنة كاملة',
    leave: 'رجوع للغطسة',
    backToGuide: 'رجوع للمرشد',
    skillsList: 'تخصصاته، فقاعات',
    skillsOf: '{group}: المهارات',
  },
} as const satisfies Record<Locale, Record<string, string>>;
