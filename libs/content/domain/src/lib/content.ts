import type { Credit } from './credit.js';
import type { ProjectItem } from './project-item.js';
import type { ResumeEntry } from './resume-entry.js';
import type { ServiceItem } from './service-item.js';
import type { SiteCopy, SiteProfile } from './site-profile.js';

/** All site content, validated. The only shape consumers ever see. */
export interface Content {
  readonly profile: SiteProfile;
  readonly copy: SiteCopy;
  readonly resume: readonly ResumeEntry[];
  readonly services: readonly ServiceItem[];
  /** In file order; use `sortProjects` for display order. */
  readonly projects: readonly ProjectItem[];
  readonly credits: readonly Credit[];
}

/**
 * The raw, untrusted content files, one per key. The key is also the first segment of every
 * validation error path, e.g. `resume.items[2].period.start`.
 */
export interface ContentFiles {
  readonly site: unknown;
  readonly resume: unknown;
  readonly services: unknown;
  readonly projects: unknown;
  readonly credits: unknown;
}

export type ContentFileKey = keyof ContentFiles;
