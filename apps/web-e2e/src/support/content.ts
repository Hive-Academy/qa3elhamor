import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Counts come from the CMS-owned content files, so editing content does not break the suite. */
const WORKSPACE_ROOT = resolve(import.meta.dirname, '../../../..');
const CONTENT_DIR = resolve(WORKSPACE_ROOT, 'content');
if (!existsSync(CONTENT_DIR)) throw new Error(`content/ not found at ${CONTENT_DIR}`);

const contentFile = <T>(name: string): T =>
  JSON.parse(readFileSync(resolve(CONTENT_DIR, name), 'utf8')) as T;

export const serviceCount = contentFile<{ items: unknown[] }>('services.json').items.length;
export const resumeEntryCount = contentFile<{ items: unknown[] }>('resume.json').items.length;
/** Skill groups on the Citizenship Card (content/site.json `profile.skills`). */
export const skillGroupCount = 6;
