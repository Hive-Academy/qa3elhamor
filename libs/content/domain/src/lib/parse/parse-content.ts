import { err, ok, type Result } from '@qa3elhamor/shared-domain';
import type { Content, ContentFiles } from '../content.js';
import {
  readCreditsFile,
  readResumeFile,
  readServicesFile,
} from './parse-collections.js';
import { readNarrationFile } from './parse-narration.js';
import { readProjectsFile } from './parse-projects.js';
import { readSiteFile } from './parse-site.js';
import { ContentReader, type ContentValidationError } from './reader.js';

/**
 * Validates the raw content files and assembles the typed `Content`.
 *
 * Every problem across all files is reported in one pass, each with a path rooted at its file
 * key (`site.profile.bio[0]`, `services.items[1].menuName.ar`).
 */
export function parseContent(
  files: ContentFiles
): Result<Content, readonly ContentValidationError[]> {
  const r = new ContentReader();
  const { profile, copy } = readSiteFile(r, files.site, 'site');
  const content: Content = {
    profile,
    copy,
    resume: readResumeFile(r, files.resume, 'resume'),
    services: readServicesFile(r, files.services, 'services'),
    projects: readProjectsFile(r, files.projects, 'projects'),
    credits: readCreditsFile(r, files.credits, 'credits'),
    narration: readNarrationFile(r, files.narration, 'narration'),
  };
  return r.errors.length === 0 ? ok(content) : err(r.errors);
}

/** One error per line, `path: message`, for build logs and thrown errors. */
export const formatContentErrors = (
  errors: readonly ContentValidationError[]
): string => errors.map(({ path, message }) => `${path}: ${message}`).join('\n');
