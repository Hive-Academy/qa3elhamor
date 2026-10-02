import {
  DEFAULT_LOCALE,
  LOCALES,
  localize,
  type Locale,
  type LocalizedText,
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

/**
 * Attributes for an element showing `text` in `locale`: `<p {...textProps(text, lang)}>`.
 *
 * A field with no translation falls back to English (`localize`); in an Arabic page it is marked
 * `lang="en" dir="ltr"`, so it is laid out (punctuation on the right side) and read aloud as
 * English. A translated field adds nothing and follows the page's language and direction.
 */
export const textProps = (
  text: LocalizedText,
  locale: Locale,
): { readonly lang?: Locale; readonly dir?: 'ltr' } =>
  locale !== DEFAULT_LOCALE && localize(text, locale) === text.en && text[locale] !== text.en
    ? { lang: DEFAULT_LOCALE, dir: 'ltr' }
    : {};
