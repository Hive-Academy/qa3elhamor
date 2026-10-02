import type { Locale } from '@qa3elhamor/content-domain';
import type { VisitWords } from '../narrators/visit-types';

/**
 * Words only the Krusty Krab visit needs. Kept here like the Pineapple's and the Tiki's; they
 * move into `content/site.json` copy keys once the owner signs the experience off.
 */
export const KRUSTY_VISIT_COPY = {
  en: {
    openFull: 'See the full menu',
    objectsList: "Today's menu: every dish is a service",
    priceOf: 'Price · {dish}',
    detailOf: '{dish}, {service}: what you get',
    priceNote: 'Price: {price}',
  },
  ar: {
    openFull: 'شوف المنيو كامل',
    objectsList: 'منيو النهارده: كل طبق خدمة',
    priceOf: 'السعر · {dish}',
    detailOf: '{dish}، {service}: هتاخد إيه',
    priceNote: 'السعر: {price}',
  },
} as const satisfies Record<Locale, VisitWords & Record<string, string>>;
