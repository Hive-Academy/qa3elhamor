import {
  sortProjects,
  type Content,
  type Credit,
  type Narration,
  type ProjectItem,
  type ResumeEntry,
  type ServiceItem,
  type SiteCopy,
  type SiteProfile,
} from '@qa3elhamor/content-domain';
import { contentFiles } from './content-files.js';
import { resolveContent } from './resolve-content.js';

/**
 * The site's content, validated once when this module is first imported. Invalid content
 * throws here; the `validate` target runs the same check before `web:build`.
 *
 * Only `apps/web` (the composition root) imports this; landmarks receive content as props.
 */
export const siteContent: Content = resolveContent(contentFiles);

export const profile: SiteProfile = siteContent.profile;
export const siteCopy: SiteCopy = siteContent.copy;
/** Experience entries in the order the content file lists them. */
export const resumeEntries: readonly ResumeEntry[] = siteContent.resume;
export const serviceItems: readonly ServiceItem[] = siteContent.services;
/** Projects in display order: explicit `order` first, then file order. */
export const projectItems: readonly ProjectItem[] = Object.freeze(
  sortProjects(siteContent.projects)
);
export const credits: readonly Credit[] = siteContent.credits;
/** Narration lines and hints for every underwater landmark. */
export const narration: Narration = siteContent.narration;
