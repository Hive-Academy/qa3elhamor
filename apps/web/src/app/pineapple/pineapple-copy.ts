import type { Locale } from '@qa3elhamor/content-domain';
import type { VisitWords } from '../narrators/visit-types';

/**
 * Words only the Pineapple visit needs. Kept here for the prototype; they move into
 * `content/site.json` copy keys once the owner signs the experience off.
 */
export const PINEAPPLE_VISIT_COPY = {
  en: {
    openFull: 'Open the full Citizenship Card',
    objectsList: 'His specialties, as bubbles',
    skillsOf: '{group}: skills',
  },
  ar: {
    openFull: 'افتح بطاقة المواطنة كاملة',
    objectsList: 'تخصصاته، فقاعات',
    skillsOf: '{group}: المهارات',
  },
} as const satisfies Record<Locale, VisitWords & Record<string, string>>;
