import { resumeEntries } from '@qa3elhamor/content-data-access';
import { localize } from '@qa3elhamor/content-domain';
import { describe, expect, it } from 'vitest';
import { visitScript } from '../narrators/visit-script';
import { jobObjects, jobReviews, yearsOf } from './job-objects';

describe('yearsOf', () => {
  it('reads a period as years, short enough to carve', () => {
    expect(yearsOf({ start: '2019-01', end: '2024-10' } as never, 'now')).toBe('2019 – 2024');
    expect(yearsOf({ start: '2020-01' } as never, 'now')).toBe('2020 – now');
    expect(yearsOf({ start: '2015-05', end: '2015-12' } as never, 'now')).toBe('2015');
  });
});

describe('jobObjects', () => {
  it('carves one tablet per job, newest first, from the resume content', () => {
    const tablets = jobObjects(resumeEntries, 'en');
    expect(tablets.map((t) => t.id)).toEqual(resumeEntries.map((e) => e.id));
    resumeEntries.forEach((entry, i) => {
      const tablet = tablets[i];
      const company = localize(entry.company, 'en');
      expect(tablet?.label).toBe(localize(entry.role, 'en'));
      expect(tablet?.caption?.[0]).toBe(company);
      expect(tablet?.topic).toBe(`Review · ${company}`);
      expect(tablet?.notes).toEqual(entry.highlights.map((h) => localize(h, 'en')));
      expect(tablet?.chips).toEqual(entry.tech);
    });
  });

  it('reads the role in Arabic where the content has it', () => {
    const [first] = jobObjects(resumeEntries, 'ar');
    const [entry] = resumeEntries;
    if (!entry || !first) throw new Error('No resume entries.');
    expect(first.label).toBe(localize(entry.role, 'ar'));
    expect(first.caption?.[1]).toMatch(/الآن|\d{4}$/u);
  });
});

describe('jobReviews', () => {
  it("gives the narrator each job's performance review as its comment", () => {
    const script = visitScript(
      { lines: [{ en: 'Welcome.' }] },
      'en',
      jobReviews(resumeEntries),
    );
    for (const entry of resumeEntries)
      expect(script.hints[entry.id]).toBe(entry.quip && localize(entry.quip, 'en'));
  });
});
