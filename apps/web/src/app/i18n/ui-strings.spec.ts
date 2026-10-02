import { LOCALES } from '@qa3elhamor/content-domain';
import { describe, expect, it } from 'vitest';
import { BUREAU_VISIT_COPY, FILED_LINES } from '../bureau/bureau-copy';
import { KRUSTY_VISIT_COPY } from '../krusty-krab/krusty-copy';
import { NARRATOR_COPY, NARRATOR_NAMES } from '../narrators/narrator-copy';
import { IN_WORLD_CARD_COPY } from '../overlays/citizenship-card/citizenship-card-in-world';
import { PAGE_VIEW_COPY } from '../page-view/page-copy';
import { PINEAPPLE_VISIT_COPY } from '../pineapple/pineapple-copy';
import { TIKI_VISIT_COPY } from '../tiki/tiki-copy';
import { CHROME_COPY, LOCALE_NAMES } from './ui-strings';

/** Every interface-word table the site renders. A new table is added here. */
const TABLES = {
  CHROME_COPY,
  NARRATOR_COPY,
  PINEAPPLE_VISIT_COPY,
  TIKI_VISIT_COPY,
  KRUSTY_VISIT_COPY,
  BUREAU_VISIT_COPY,
  IN_WORLD_CARD_COPY,
  PAGE_VIEW_COPY,
} as const;

/** Strings keyed by id, each carrying every locale (`{ en, ar }` per entry). */
const ENTRY_TABLES = {
  NARRATOR_NAMES,
  FILED_LINES,
  LOCALE_NAMES: Object.fromEntries(
    Object.entries(LOCALE_NAMES).map(([id, names]) => [id, { en: names.short, ar: names.name }]),
  ),
} as const;

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/gu)].map((match) => match[1]).sort();

const ARABIC = /[؀-ۿ]/u;

describe.each(Object.entries(TABLES))('%s', (_, table) => {
  const en: Readonly<Record<string, string>> = table.en;
  const keys = Object.keys(en);

  it.each(LOCALES)('has every key in %s, and nothing else', (locale) => {
    expect(Object.keys(table[locale]).sort()).toEqual([...keys].sort());
  });

  it.each(keys)('"%s" is non-empty in both, with the same placeholders', (key) => {
    const ar: Readonly<Record<string, string>> = table.ar;
    expect(en[key].trim()).not.toBe('');
    expect(ar[key].trim()).not.toBe('');
    expect(placeholders(ar[key])).toEqual(placeholders(en[key]));
  });

  it('is actually translated: every Arabic string that has letters has Arabic ones', () => {
    const ar: Readonly<Record<string, string>> = table.ar;
    const untranslated = keys.filter(
      (key) => /\p{L}/u.test(ar[key]) && !ARABIC.test(ar[key]),
    );
    expect(untranslated).toEqual([]);
  });
});

describe.each(Object.entries(ENTRY_TABLES))('%s', (_, table) => {
  it('carries every locale for every entry', () => {
    for (const entry of Object.values(table)) {
      for (const locale of LOCALES) {
        const text: string | undefined = (entry as Record<string, string>)[locale];
        expect(text?.trim()).toBeTruthy();
      }
    }
  });
});
