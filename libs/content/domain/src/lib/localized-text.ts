/**
 * Localization model (the decision `i18n-bilingual` builds on).
 *
 * Every piece of human-readable copy is a `LocalizedText`: one object carrying all
 * translations of that string side by side, `{ "en": "...", "ar": "..." }`, rather than one
 * content file per locale.
 *
 * Why inline per field rather than per-locale files:
 * - One entry, every language. Both locales must render "from the same content entries".
 *   Per-locale files would duplicate ids, dates, URLs and tech lists per language and let
 *   them drift (an entry added to the English file but not the Arabic one). Inline, the
 *   non-translatable data exists exactly once.
 * - Partial translation degrades gracefully. `ar` is optional and falls back to `en`, so a
 *   forker who writes only English never has to think about i18n, and translations can land
 *   one field at a time.
 * - CMS friendly. Decap and Tina both model a nested object field directly, so an editor sees
 *   both languages next to each other.
 * - Only prose is localized. Data (URLs, dates, ids, skill and tech names, licence ids) stays
 *   a plain string.
 *
 * Content files may write a bare string as shorthand for `{ "en": string }`; the parser
 * normalizes it, so consumers always receive the object form.
 */
export const LOCALES = ['en', 'ar'] as const;

export type Locale = (typeof LOCALES)[number];

/** The locale every `LocalizedText` must provide, and the fallback for the others. */
export const DEFAULT_LOCALE = 'en' satisfies Locale;

export interface LocalizedText {
  readonly en: string;
  readonly ar?: string;
}

/**
 * Resolves a text for `locale`, falling back to English when no translation exists. A blank
 * translation counts as none (the parser rejects one, but a value built in code may carry it).
 */
export function localize(text: LocalizedText, locale: Locale): string {
  const translated = text[locale];
  return translated !== undefined && translated.trim() !== '' ? translated : text.en;
}
