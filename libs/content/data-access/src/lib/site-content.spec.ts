import { localize, NARRATION_LANDMARKS, SITE_COPY_KEYS } from '@qa3elhamor/content-domain';
import { describe, expect, it } from 'vitest';
import { contentFiles } from './content-files.js';
import { ContentValidationFailure, resolveContent } from './resolve-content.js';
import {
  credits,
  narration,
  profile,
  projectItems,
  resumeEntries,
  serviceItems,
  siteContent,
  siteCopy,
} from './site-content.js';

describe('site content (content/*.json)', () => {
  it('validates and exposes typed content', () => {
    expect(localize(profile.name, 'en')).not.toBe('');
    expect(profile.bio.length).toBeGreaterThan(0);
    expect(Object.keys(siteCopy).sort()).toEqual([...SITE_COPY_KEYS].sort());
    expect(resumeEntries.length).toBeGreaterThan(0);
    expect(serviceItems.every((item) => item.menuName.en !== '')).toBe(true);
    expect(credits.length).toBeGreaterThan(0);
  });

  it('exposes projects in display order', () => {
    expect(projectItems.length).toBe(siteContent.projects.length);
    const ordered = projectItems.filter((p) => p.order !== undefined).map((p) => p.order);
    expect(ordered).toEqual([...ordered].sort((a = 0, b = 0) => a - b));
    expect(projectItems[0]?.order).toBeDefined();
    expect(Object.isFrozen(projectItems)).toBe(true);
  });

  it('is deeply frozen so no consumer can mutate shared content', () => {
    expect(Object.isFrozen(siteContent)).toBe(true);
    expect(Object.isFrozen(profile.bio)).toBe(true);
    expect(Object.isFrozen(resumeEntries[0]?.period)).toBe(true);
  });
});

describe('narration (content/narration.json)', () => {
  it('narrates every landmark', () => {
    expect(Object.keys(narration.landmarks)).toEqual([...NARRATION_LANDMARKS]);
    expect(Object.isFrozen(narration.landmarks.pineapple.lines)).toBe(true);
  });

  // The parser validates each file on its own (skill groups are optional, and hint ids are
  // generic object ids), so the pairing of pineapple hints with the shipped skill groups is
  // pinned here, against the real content.
  it('has exactly one pineapple hint per skill group, keyed by the group id', () => {
    const hintIds = Object.keys(narration.landmarks.pineapple.hints ?? {}).sort();
    expect(hintIds).toEqual(profile.skills.map((group) => group.id).sort());
  });
});

describe('resolveContent', () => {
  it('throws a failure naming the file, field and problem', () => {
    const broken = {
      ...contentFiles,
      resume: { items: [{ id: 'x', company: 'C', role: 'R', period: { start: '2024-13' } }] },
      credits: 'not an object',
    };
    let failure: unknown;
    try {
      resolveContent(broken);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ContentValidationFailure);
    expect((failure as ContentValidationFailure).message).toBe(
      'Invalid site content (2 problems):\n' +
        '  content/resume.json → items[0].period.start: expected a month as YYYY-MM, got "2024-13"\n' +
        '  content/credits.json: expected an object, got string'
    );
    expect((failure as ContentValidationFailure).errors).toHaveLength(2);
  });
});
