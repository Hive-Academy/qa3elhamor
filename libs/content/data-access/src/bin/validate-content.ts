/**
 * Build gate: validates `content/*.json` and exits non-zero if any file is invalid.
 *
 * Runs as the `content-data-access:validate` Nx target, which `web:build` depends on, because
 * `vite build` bundles the content without executing it and would otherwise ship invalid
 * content that only fails in the visitor's browser.
 */
import { contentFiles } from '../lib/content-files.js';
import { ContentValidationFailure, resolveContent } from '../lib/resolve-content.js';

try {
  const content = resolveContent(contentFiles);
  console.log(
    `Site content is valid: ${content.resume.length} resume entries, ` +
      `${content.projects.length} projects, ${content.services.length} services, ` +
      `${content.credits.length} credits.`
  );
} catch (error) {
  // Only a content failure gets the friendly report; anything else is a bug and is rethrown.
  if (!(error instanceof ContentValidationFailure)) throw error;
  console.error(error.message);
  process.exitCode = 1;
}
