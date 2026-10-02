/**
 * Where the public complaints wall API lives, read once from the build's `VITE_WALL_API_URL`.
 *
 * The wall ships off: unset (the GitHub Pages default), `readWallApiUrl` returns `null` and the
 * site renders nothing of the wall and never calls it. The accepted shapes are the ones the
 * build's CSP accepts (`tools/deploy/csp.ts`, `wallApiOrigin`): a same-origin path such as
 * `/api`, an absolute `https://` URL, or `http://` for a local API. Anything else turns the wall
 * off here too (the CSP build step already fails on it), with one console warning.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** The API root without a trailing slash, or `null` when the wall is off. */
export function readWallApiUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value === '') return null;
  const root = value.replace(/\/+$/u, '');
  if (value.startsWith('/') && !value.startsWith('//')) return root;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return refuse();
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    return refuse();
  }
  if (url.protocol === 'https:') return root;
  if (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)) return root;
  return refuse();
}

const refuse = (): null => {
  console.warn(
    'VITE_WALL_API_URL must be a same-origin path such as /api or an https:// URL; the complaints wall stays off.',
  );
  return null;
};

const RAW_WALL_API_URL = import.meta.env.VITE_WALL_API_URL;

/**
 * This build's wall API root; `null` keeps the wall off. Unset, Vite inlines `undefined` here,
 * so the bundler folds this to `null` and drops the wall code and words the site would otherwise
 * carry (`wall-port.ts`): a build without the wall ships none of them.
 */
export const WALL_API_URL: string | null =
  RAW_WALL_API_URL === undefined ? null : readWallApiUrl(RAW_WALL_API_URL);
