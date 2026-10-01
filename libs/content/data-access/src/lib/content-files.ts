import type { ContentFileKey, ContentFiles } from '@qa3elhamor/content-domain';
// Static JSON imports from the `content/` workspace package: the bundler inlines the content at
// build time, so there is no runtime file system access and no fetch. The files are written by
// the CMS (see content/README.md) and are typed `unknown` by `../content-files.d.ts`.
import credits from '@qa3elhamor/content-files/credits.json' with { type: 'json' };
import narration from '@qa3elhamor/content-files/narration.json' with { type: 'json' };
import projects from '@qa3elhamor/content-files/projects.json' with { type: 'json' };
import resume from '@qa3elhamor/content-files/resume.json' with { type: 'json' };
import services from '@qa3elhamor/content-files/services.json' with { type: 'json' };
import site from '@qa3elhamor/content-files/site.json' with { type: 'json' };

/** The raw, unvalidated content files. */
export const contentFiles: ContentFiles = {
  site,
  resume,
  services,
  projects,
  credits,
  narration,
};

/** Repository path of each content file, for error messages a CMS editor can act on. */
export const CONTENT_FILE_PATHS: Readonly<Record<ContentFileKey, string>> = {
  site: 'content/site.json',
  resume: 'content/resume.json',
  services: 'content/services.json',
  projects: 'content/projects.json',
  credits: 'content/credits.json',
  narration: 'content/narration.json',
};
