import { describe, expect, it } from 'vitest';
import { CONTACT_SUBMITTER } from '../contact-submitter';
import { buildPageContent } from './page-content';
import { formatYearMonth } from './page-parts';

describe('formatYearMonth', () => {
  it('reads a YYYY-MM month in the content locale', () => {
    expect(formatYearMonth('2020-01', 'en')).toBe('Jan 2020');
    expect(formatYearMonth('2024-12', 'en')).toBe('Dec 2024');
  });

  it('never prints "Invalid Date": anything else is shown as written', () => {
    for (const raw of ['2020-13', '2020-00', '2020', 'soon', '', '2020-1'])
      expect(formatYearMonth(raw, 'en')).toBe(raw);
  });
});

describe('buildPageContent', () => {
  it('sends through the site-wide contact submitter, not a second one', () => {
    expect(buildPageContent().submitter).toBe(CONTACT_SUBMITTER);
  });
});
