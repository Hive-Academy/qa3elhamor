import { describe, expect, it } from 'vitest';
import { SiteBaseError, siteBase } from './site-base';

describe('siteBase', () => {
  it.each([
    [undefined, '/'],
    ['', '/'],
    ['/', '/'],
    ['repo', '/repo/'],
    ['/repo/', '/repo/'],
    ['//repo', '/repo/'],
    [' repo/ ', '/repo/'],
  ])('reads %j as %s', (raw, base) => {
    expect(siteBase(raw)).toBe(base);
  });

  it.each(['C:/Program Files/Git/repo/', 'c:\\repo', 'D:/x'])(
    'refuses a path the shell rewrote: %s',
    (raw) => {
      expect(() => siteBase(raw)).toThrow(SiteBaseError);
      expect(() => siteBase(raw)).toThrow(/SITE_BASE=<repo>/u);
    },
  );
});
