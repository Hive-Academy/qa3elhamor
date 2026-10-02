import {
  narration,
  profile,
  projectItems,
  resumeEntries,
  serviceItems,
  siteCopy,
} from '@qa3elhamor/content-data-access';
import {
  NARRATION_LANDMARKS,
  SITE_COPY_KEYS,
  localize,
  type LocalizedText,
} from '@qa3elhamor/content-domain';
import { describe, expect, it } from 'vitest';
import { LANDMARKS, SITE } from '../../site.config';
import { jobObjects } from '../tiki/job-objects';
import { skillGroupObjects } from '../pineapple/pineapple-scene';

/*
 * Both locales render from the same content entries (`{ en, ar }` per field). Everything a
 * visitor reads in passing (what the narrators say, labels, titles, headlines) carries Arabic;
 * long technical text (résumé highlights, project write-ups) may stay English, and then renders
 * as English inside the Arabic page (`textProps`).
 *
 * Only for a site that speaks Arabic: with `SITE.locales` set to `['en']` (site.config.ts) the
 * content needs no Arabic and these are skipped.
 */
const speaksArabic = SITE.locales.includes('ar');

const hasArabic = (text: LocalizedText | undefined): boolean =>
  text !== undefined && text.ar !== undefined && text.ar.trim() !== '';

/** Lines whose Arabic starts with a Latin letter would read left to right under `dir="auto"`. */
const STARTS_LATIN = /^[\s\p{P}]*[A-Za-z]/u;

describe.skipIf(!speaksArabic)('narration: every line, hint and farewell speaks Arabic', () => {
  for (const landmark of NARRATION_LANDMARKS) {
    const { lines, hints = {}, farewell } = narration.landmarks[landmark];
    const said: [string, LocalizedText][] = [
      ...lines.map((line, i): [string, LocalizedText] => [`lines[${i}]`, line]),
      ...Object.entries(hints).map(([id, hint]): [string, LocalizedText] => [`hints.${id}`, hint]),
      ...(farewell ? [['farewell', farewell] as [string, LocalizedText]] : []),
    ];
    it.each(said)(`${landmark} %s`, (_, text) => {
      expect(hasArabic(text)).toBe(true);
      expect(text.ar).not.toMatch(STARTS_LATIN);
    });
  }
});

describe.skipIf(!speaksArabic)('labels, titles and headlines speak Arabic', () => {
  it('site copy', () => {
    expect(SITE_COPY_KEYS.filter((key) => !hasArabic(siteCopy[key]))).toEqual([]);
  });

  it('profile name, headline, location, bio, skill groups and links', () => {
    expect(hasArabic(profile.name)).toBe(true);
    expect(hasArabic(profile.headline)).toBe(true);
    expect(hasArabic(profile.location)).toBe(true);
    expect(profile.bio.every(hasArabic)).toBe(true);
    expect(profile.skills.every((group) => hasArabic(group.label))).toBe(true);
    expect(profile.links.every((link) => hasArabic(link.label))).toBe(true);
  });

  it('job titles, locations and reviews', () => {
    for (const entry of resumeEntries) {
      expect(hasArabic(entry.role)).toBe(true);
      if (entry.location) expect(hasArabic(entry.location)).toBe(true);
      if (entry.quip) expect(hasArabic(entry.quip)).toBe(true);
    }
  });

  it('service dish names, titles and prices', () => {
    for (const service of serviceItems) {
      expect(hasArabic(service.menuName)).toBe(true);
      expect(hasArabic(service.title)).toBe(true);
      if (service.price) expect(hasArabic(service.price)).toBe(true);
    }
  });

  it('project titles, summaries and roles', () => {
    for (const project of projectItems) {
      expect(hasArabic(project.title)).toBe(true);
      expect(hasArabic(project.summary)).toBe(true);
      if (project.role) expect(hasArabic(project.role)).toBe(true);
    }
  });

  it('landmark labels and captions', () => {
    for (const landmark of LANDMARKS) {
      expect(typeof landmark.label === 'string' ? false : Boolean(landmark.label.ar)).toBe(true);
      if (landmark.caption && typeof landmark.caption !== 'string')
        expect(landmark.caption.ar).toBeTruthy();
    }
  });
});

describe('one entry, two languages', () => {
  it('builds the same objects, by the same ids, in both locales', () => {
    const en = skillGroupObjects(profile, 'en');
    const ar = skillGroupObjects(profile, 'ar');
    expect(ar.map((o) => o.id)).toEqual(en.map((o) => o.id));
    expect(ar.map((o) => o.chips)).toEqual(en.map((o) => o.chips));
    expect(ar.map((o) => o.label)).toEqual(
      profile.skills.map((group) => localize(group.label, 'ar')),
    );

    const jobsEn = jobObjects(resumeEntries, 'en');
    const jobsAr = jobObjects(resumeEntries, 'ar');
    expect(jobsAr.map((o) => o.id)).toEqual(jobsEn.map((o) => o.id));
    expect(jobsAr.map((o) => o.chips)).toEqual(jobsEn.map((o) => o.chips));
  });
});
