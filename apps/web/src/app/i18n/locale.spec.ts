import { afterEach, describe, expect, it } from 'vitest';
import {
  LOCALE_STORAGE_KEY,
  applyDocumentLocale,
  directionOf,
  parseLocale,
  readStoredLocale,
  resolveLocale,
  searchWithLocale,
  storeLocale,
} from './locale';

describe('parseLocale', () => {
  it.each([
    ['ar', 'ar'],
    ['ar-EG', 'ar'],
    ['AR_sa', 'ar'],
    ['en', 'en'],
    ['en-GB', 'en'],
  ])('reads %s as %s', (tag, locale) => {
    expect(parseLocale(tag)).toBe(locale);
  });

  it.each([null, undefined, '', 'fr', 'arabic', 'e'])('rejects %s', (tag) => {
    expect(parseLocale(tag)).toBeNull();
  });
});

describe('resolveLocale: query, then storage, then the browser, then English', () => {
  it('lets ?lang= win over everything', () => {
    expect(
      resolveLocale({ search: '?view=page&lang=ar', stored: 'en', languages: ['en-US'] }),
    ).toEqual({ locale: 'ar', source: 'query' });
    expect(
      resolveLocale({ search: '?lang=en', stored: 'ar', languages: ['ar-EG'] }),
    ).toEqual({ locale: 'en', source: 'query' });
  });

  it('falls through an unknown ?lang= to the stored choice', () => {
    expect(
      resolveLocale({ search: '?lang=fr', stored: 'ar', languages: ['en'] }),
    ).toEqual({ locale: 'ar', source: 'storage' });
  });

  it('uses the stored choice over the browser', () => {
    expect(resolveLocale({ search: '', stored: 'en', languages: ['ar-EG'] })).toEqual({
      locale: 'en',
      source: 'storage',
    });
  });

  it('takes the first supported browser language: ar* speaks Arabic', () => {
    expect(
      resolveLocale({ search: '', stored: null, languages: ['fr-FR', 'ar-EG', 'en'] }),
    ).toEqual({ locale: 'ar', source: 'navigator' });
    expect(
      resolveLocale({ search: '', stored: 'garbage', languages: ['en-US', 'ar'] }),
    ).toEqual({ locale: 'en', source: 'navigator' });
  });

  it('defaults to English', () => {
    expect(resolveLocale({ search: '', stored: null, languages: ['de', 'fr'] })).toEqual({
      locale: 'en',
      source: 'default',
    });
  });
});

describe('storage', () => {
  afterEach(() => localStorage.clear());

  it('keeps only the bare locale id', () => {
    storeLocale('ar');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ar');
    expect(readStoredLocale()).toBe('ar');
    expect(localStorage.length).toBe(1);
  });
});

describe('the document', () => {
  afterEach(() => applyDocumentLocale('en'));

  it('sets <html lang dir>', () => {
    applyDocumentLocale('ar');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    applyDocumentLocale('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('writes Arabic right to left', () => {
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('en')).toBe('ltr');
  });
});

describe('searchWithLocale', () => {
  it('updates a pinned ?lang= and keeps every other parameter', () => {
    expect(searchWithLocale('?view=page&lang=en', 'ar')).toBe('?view=page&lang=ar');
  });

  it('pins the language on a URL without ?lang=, so a reload keeps it without storage', () => {
    expect(searchWithLocale('?view=page', 'ar')).toBe('?view=page&lang=ar');
    expect(searchWithLocale('', 'ar')).toBe('?lang=ar');
  });
});
