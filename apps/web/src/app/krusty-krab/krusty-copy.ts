import type { Locale } from '@qa3elhamor/content-domain';
import { bilingual } from '../i18n/ui-strings';
import type { VisitWords } from '../narrators/visit-types';

/**
 * Words only the Krusty Krab visit needs. Interface words, not
 * content: see `i18n/ui-strings.ts`.
 */
export const KRUSTY_VISIT_COPY = bilingual({
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
}) satisfies Readonly<Record<Locale, VisitWords>>;
