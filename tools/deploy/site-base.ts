/**
 * The site's public base path from `SITE_BASE`, one rule for every step that needs it: the
 * build (`apps/web/vite.config.mts`), `perf:budget` and `deploy:prepare`. Pure.
 *
 * `/` suits a GitHub Pages user site and any custom domain; a project site sets `SITE_BASE` to
 * `/<repo>/` or just `<repo>`. Always normalised to a leading and trailing slash.
 */

/** Thrown for a `SITE_BASE` the shell turned into a file path. */
export class SiteBaseError extends Error {
  constructor(raw: string) {
    super(
      `SITE_BASE is a file path (${raw}): your shell rewrote "/<repo>/" (Git Bash on Windows does). ` +
        'Write SITE_BASE=<repo> (the slashes are added for you) or set MSYS_NO_PATHCONV=1.',
    );
    this.name = 'SiteBaseError';
  }
}

export function siteBase(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  // Git Bash rewrites a leading-slash value (`/repo/`) into a Windows path before Node sees it.
  if (/^[A-Za-z]:[\\/]/u.test(value)) throw new SiteBaseError(value);
  const trimmed = value.replace(/^\/+|\/+$/gu, '');
  return trimmed === '' ? '/' : `/${trimmed}/`;
}
