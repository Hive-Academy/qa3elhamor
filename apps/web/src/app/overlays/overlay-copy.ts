import {
  LOCALES,
  localize,
  type Locale,
  type SiteCopy,
  type SiteCopyKey,
} from '@qa3elhamor/content-domain';

/**
 * The kernel hands overlays its `locale` as a plain string; content speaks `Locale`. Anything the
 * content model does not know falls back to English, like a missing translation does.
 */
export const toContentLocale = (locale: string): Locale =>
  (LOCALES as readonly string[]).includes(locale) ? (locale as Locale) : 'en';

/** A `siteCopy` reader bound to one locale: `t('complaintIntro')`. */
export type CopyReader = (key: SiteCopyKey) => string;

export const copyReader =
  (copy: SiteCopy, locale: Locale): CopyReader =>
  (key) =>
    localize(copy[key], locale);

/**
 * Fills `{name}` placeholders in a copy string (`"the limit is {limit} characters"`). Unknown
 * placeholders stay as written so a typo in content is visible rather than silently blank.
 */
export const fillCopy = (
  template: string,
  values: Readonly<Record<string, string | number>>,
): string =>
  template.replace(/\{(\w+)\}/gu, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
