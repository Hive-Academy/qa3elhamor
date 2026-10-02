import type { Locale } from '@qa3elhamor/content-domain';
import type { VisitWords } from '../narrators/visit-types';

/**
 * Words only the Tiki visit needs. Kept here like the Pineapple's; they move into
 * `content/site.json` copy keys once the owner signs the experience off.
 */
export const TIKI_VISIT_COPY = {
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
} as const satisfies Record<Locale, VisitWords & Record<string, string>>;
