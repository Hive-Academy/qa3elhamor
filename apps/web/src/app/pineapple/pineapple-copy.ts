import type { Locale } from '@qa3elhamor/content-domain';
import { bilingual } from '../i18n/ui-strings';
import type { VisitWords } from '../narrators/visit-types';

/**
 * Words only the Pineapple visit needs. Interface words, not content: see
 * `i18n/ui-strings.ts`.
 */
export const PINEAPPLE_VISIT_COPY = bilingual({
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
}) satisfies Readonly<Record<Locale, VisitWords>>;
