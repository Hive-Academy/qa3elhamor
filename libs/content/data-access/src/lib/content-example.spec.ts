import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { localize, type ContentFileKey, type ContentFiles } from '@qa3elhamor/content-domain';
import { describe, expect, it } from 'vitest';
import { CONTENT_FILE_PATHS, contentFiles } from './content-files.js';
import { resolveContent } from './resolve-content.js';

/*
 * `content.example/` is the neutral sample a fork starts from (`npm run template:reset` copies it
 * over `content/`, docs/template.md). It must stay valid against the same content model, and it
 * must stay free of the owner's identity, or a fork ships someone else's name.
 */
const repoRoot = resolve(import.meta.dirname, '../../../../..');

const exampleFiles = (): ContentFiles => {
  const read = (key: ContentFileKey): unknown =>
    JSON.parse(
      readFileSync(
        resolve(repoRoot, CONTENT_FILE_PATHS[key].replace(/^content\//u, 'content.example/')),
        'utf8',
      ),
    );
  return {
    site: read('site'),
    resume: read('resume'),
    services: read('services'),
    projects: read('projects'),
    credits: read('credits'),
    narration: read('narration'),
  };
};

describe('content.example (the sample a fork starts from)', () => {
  it('has one file for every content file, and nothing else', () => {
    expect(Object.keys(exampleFiles()).sort()).toEqual(Object.keys(contentFiles).sort());
  });

  it('validates against the content model', () => {
    const content = resolveContent(exampleFiles());
    expect(localize(content.profile.name, 'en')).toBe('Sam Reef');
  });

  it("carries none of the site owner's identity", () => {
    const owner = resolveContent(contentFiles);
    const example = JSON.stringify(exampleFiles());
    if (localize(owner.profile.name, 'en') === 'Sam Reef') return; // A fork still on the sample.
    // The name in every language it is written in (Arabic included), word by word.
    const names = [owner.profile.name.en, owner.profile.name.ar ?? ''];
    for (const word of names.join(' ').split(/\s+/u).filter((part) => part.length > 2))
      expect(example, `"${word}" from content/site.json`).not.toContain(word);
    // Links, and what identifies the owner inside them (a mailto address, a profile handle).
    for (const link of owner.profile.links) {
      expect(example, link.url).not.toContain(link.url);
      const handle = link.url.replace(/^mailto:/u, '').replace(/^https?:\/\/[^/]+\//u, '');
      if (handle.length > 3) expect(example, handle).not.toContain(handle);
    }
  });
});
