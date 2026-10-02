import { DEFAULT_LOCALE, LOCALES, type Locale } from '@qa3elhamor/content-domain';

/**
 * Which language the site speaks, and where that choice comes from.
 *
 * Resolution order, first match wins:
 * 1. `?lang=ar|en` in the URL: a shared link speaks the language it was shared in.
 * 2. The visitor's own earlier choice, kept in `localStorage` (only the locale, nothing else).
 * 3. The browser's languages: the first `ar*` or `en*` entry (`ar-EG` speaks Arabic).
 * 4. English, the content's required locale.
 */

/** The URL parameter that pins the language: `?lang=ar`. */
export const LOCALE_PARAM = 'lang';

/** The `localStorage` key holding the visitor's choice. Its value is a bare locale id. */
export const LOCALE_STORAGE_KEY = 'qa3elhamor.locale';

export type LocaleSource = 'query' | 'storage' | 'navigator' | 'default';

export interface LocaleResolution {
  readonly locale: Locale;
  readonly source: LocaleSource;
}

const NUMBER_LOCALES: Readonly<Record<Locale, string>> = { en: 'en', ar: 'ar-EG' };

/** A number as the locale writes it: Arabic-Indic digits in Arabic (`١٤٢`, `١٫٨`), Western in English. */
export const formatNumber = (
  value: number,
  locale: Locale,
  options: Intl.NumberFormatOptions = {},
): string => new Intl.NumberFormat(NUMBER_LOCALES[locale], { useGrouping: false, ...options }).format(value);

/** `ltr` or `rtl`, for `dir` attributes. */
export type TextDirection = 'ltr' | 'rtl';

export const directionOf = (locale: Locale): TextDirection =>
  locale === 'ar' ? 'rtl' : 'ltr';

/**
 * Reads a language tag as one of the site's locales: `ar`, `ar-EG`, `AR` → `ar`; `en-GB` → `en`.
 * Anything else (another language, garbage, nothing) is `null`.
 */
export function parseLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const primary = value.trim().toLowerCase().split(/[-_]/u)[0];
  return LOCALES.find((locale) => locale === primary) ?? null;
}

export interface LocaleInputs {
  /** `location.search`. */
  readonly search: string;
  /** What `localStorage` holds under `LOCALE_STORAGE_KEY`, or null. */
  readonly stored: string | null;
  /** `navigator.languages` (or `[navigator.language]`), most preferred first. */
  readonly languages: readonly string[];
}

/** Picks the locale from the URL, then the stored choice, then the browser (see the top). */
export function resolveLocale({
  search,
  stored,
  languages,
}: LocaleInputs): LocaleResolution {
  const fromQuery = parseLocale(new URLSearchParams(search).get(LOCALE_PARAM));
  if (fromQuery) return { locale: fromQuery, source: 'query' };
  const fromStorage = parseLocale(stored);
  if (fromStorage) return { locale: fromStorage, source: 'storage' };
  for (const language of languages) {
    const fromNavigator = parseLocale(language);
    if (fromNavigator) return { locale: fromNavigator, source: 'navigator' };
  }
  return { locale: DEFAULT_LOCALE, source: 'default' };
}

/**
 * `localStorage`, or null where it is missing or refuses access (private modes, blocked
 * storage, sandboxed frames): the choice then lasts for the page only.
 */
function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredLocale(): string | null {
  try {
    return storage()?.getItem(LOCALE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function storeLocale(locale: Locale): void {
  try {
    storage()?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Quota or a refused write: the `?lang=` the switch writes still carries the choice.
  }
}

/** The browser's language list, most preferred first. */
export function navigatorLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  if (navigator.languages?.length) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

/** Resolves the locale for this document from the live URL, storage and browser. */
export const resolveDocumentLocale = (): LocaleResolution =>
  resolveLocale({
    search: typeof window === 'undefined' ? '' : window.location.search,
    stored: readStoredLocale(),
    languages: navigatorLanguages(),
  });

/** Sets `<html lang dir>`: the whole page, overlays included, follows from it. */
export function applyDocumentLocale(locale: Locale, root = document.documentElement): void {
  root.lang = locale;
  root.dir = directionOf(locale);
}

/**
 * `search` with `?lang=` set to `locale`, every other parameter kept. An explicit switch pins
 * the language in the URL: a reload keeps it even where storage is refused (private modes,
 * sandboxed frames), and a copied link opens in the language the visitor was reading.
 */
export function searchWithLocale(search: string, locale: Locale): string {
  const params = new URLSearchParams(search);
  params.set(LOCALE_PARAM, locale);
  return `?${params.toString()}`;
}
