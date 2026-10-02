import type { Locale } from '@qa3elhamor/content-domain';
import { bilingual } from '../i18n/ui-strings';
import type { VisitWords } from '../narrators/visit-types';

/**
 * Words only the Tiki visit needs. Interface words, not content: see
 * `i18n/ui-strings.ts`.
 */
export const TIKI_VISIT_COPY = bilingual({
  en: {
    openFull: 'Read the full record',
    objectsList: 'Performance reviews, carved in stone',
    reviewOf: 'Review · {company}',
    detailOf: '{role}, {company}: highlights and tech',
    present: 'now',
  },
  ar: {
    openFull: 'اقرأ السجل كاملاً',
    objectsList: 'تقييمات الأداء، محفورة في الحجر',
    reviewOf: 'تقييم · {company}',
    detailOf: '{role}، {company}: أبرز الإنجازات والتقنيات',
    present: 'الآن',
  },
}) satisfies Readonly<Record<Locale, VisitWords>>;
