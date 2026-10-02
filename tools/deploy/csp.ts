/**
 * Content Security Policies for the two HTML entry points, built from the same build-time
 * `VITE_*` values Vite inlines into the bundle, so the hosts the policy allows are always the
 * hosts the built code talks to. Pure: no file or `process` access. Applied by
 * `csp-plugin.ts` (a Vite plugin) as a `<meta http-equiv>` tag, since GitHub Pages cannot send
 * response headers. Rationale per directive: docs/security.md.
 */
import { resolveAnalyticsConfig } from '../../libs/telemetry/data-access/src/lib/analytics-config';

export type BuildEnv = Readonly<Record<string, unknown>>;

/** `connect-src` origin for each contact provider (docs/contact.md, "Content Security Policy"). */
export const CONTACT_PROVIDER_ORIGINS: Readonly<Record<string, string>> = {
  web3forms: 'https://api.web3forms.com',
  formspree: 'https://formspree.io',
};

/**
 * Umami Cloud's tracker can post to this gateway instead of the script's own origin
 * (docs/analytics.md). Allowed only with the default Umami Cloud script; a self-hosted
 * instance posts to its own origin.
 */
export const UMAMI_CLOUD_GATEWAY = 'https://api-gateway.umami.dev';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Thrown for a build-time value that would produce a wrong policy; fails the build. */
export class CspConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CspConfigError';
  }
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * The origin of `VITE_WALL_API_URL` when the wall API lives on another origin, or `null` when
 * it is unset or a same-origin path (`/api`), which `'self'` already covers. Anything else
 * must be an absolute https URL (http only for a local API) or the build fails, since a
 * policy that silently blocks the wall is worse than no build.
 */
export const wallApiOrigin = (env: BuildEnv): string | null => {
  const raw = text(env['VITE_WALL_API_URL']);
  if (raw === '') return null;
  if (raw.startsWith('//')) return invalidWall();
  if (raw.startsWith('/')) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return invalidWall();
  }
  if (url.username !== '' || url.password !== '') return invalidWall();
  if (url.protocol === 'https:') return url.origin;
  if (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)) return url.origin;
  return invalidWall();
};

const invalidWall = (): never => {
  throw new CspConfigError(
    'VITE_WALL_API_URL must be a same-origin path such as /api, or an absolute https:// URL'
  );
};

/** Third-party origins the public site's own code loads scripts from or connects to. */
export const publicSiteOrigins = (
  env: BuildEnv
): { readonly script: readonly string[]; readonly connect: readonly string[] } => {
  const script: string[] = [];
  const connect: string[] = [];

  const analytics = resolveAnalyticsConfig(env);
  if (analytics.provider !== 'none') {
    const origin = new URL(analytics.scriptSrc).origin;
    script.push(origin);
    connect.push(new URL(analytics.eventEndpoint).origin);
    if (analytics.provider === 'umami' && origin === 'https://cloud.umami.is') {
      connect.push(UMAMI_CLOUD_GATEWAY);
    }
  }

  const contact = CONTACT_PROVIDER_ORIGINS[text(env['VITE_CONTACT_PROVIDER']).toLowerCase()];
  if (contact !== undefined) connect.push(contact);

  const wall = wallApiOrigin(env);
  if (wall !== null) connect.push(wall);

  return { script: [...new Set(script)], connect: [...new Set(connect)] };
};

/**
 * Sources come partly from env vars; a `;`, `,` or whitespace inside one would end its directive
 * and inject another, so the build fails rather than ship a policy it did not mean.
 */
const serialise = (directives: ReadonlyArray<readonly [string, ...string[]]>): string =>
  directives
    .map((parts) => {
      for (const part of parts) {
        if (/[;,\s]/.test(part)) {
          throw new Error(`CSP source ${JSON.stringify(part)} contains ';', ',' or whitespace`);
        }
      }
      return parts.join(' ');
    })
    .join('; ');

/**
 * The public site (index.html, and 404.html which is a copy of it).
 *
 * - `'wasm-unsafe-eval'`: three's Meshopt decoder compiles its WebAssembly module at runtime;
 *   every model is Meshopt-compressed. It permits WebAssembly compilation only, not `eval`.
 * - `blob:` in img/connect/worker: GLTFLoader decodes embedded textures through blob URLs
 *   (fetched by ImageBitmapLoader, hence connect-src); worker-src keeps decoder workers open.
 * - `data:` in img/font/connect: Vite inlines small assets as data URIs; glTF may embed
 *   buffers as data URIs.
 * - No `'unsafe-inline'` or `'unsafe-eval'` anywhere: React applies its `style` props through
 *   the CSSOM, which style-src does not govern, and the build emits no inline script.
 */
export const buildSiteCsp = (env: BuildEnv): string => {
  const origins = publicSiteOrigins(env);
  return serialise([
    ['default-src', "'self'"],
    ['script-src', "'self'", "'wasm-unsafe-eval'", ...origins.script],
    ['style-src', "'self'"],
    ['img-src', "'self'", 'data:', 'blob:'],
    ['font-src', "'self'", 'data:'],
    ['connect-src', "'self'", 'blob:', 'data:', ...origins.connect],
    ['media-src', "'self'", 'blob:'],
    ['worker-src', "'self'", 'blob:'],
    ['manifest-src', "'self'"],
    ['frame-src', "'none'"],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
  ]);
};

/**
 * The moderation console: privileged (it holds the moderation token) and it renders every
 * pending complaint, so it gets the strictest policy the page can run under. Nothing
 * third-party, no WebGL, no workers, and Trusted Types, so even a future DOM-sink mistake
 * (`innerHTML` with complaint text) throws instead of executing.
 */
export const buildModerationCsp = (env: BuildEnv): string => {
  const wall = wallApiOrigin(env);
  return serialise([
    ['default-src', "'none'"],
    ['script-src', "'self'"],
    ['style-src', "'self'"],
    ['img-src', "'self'", 'data:'],
    ['font-src', "'self'"],
    ['connect-src', "'self'", ...(wall === null ? [] : [wall])],
    ['object-src', "'none'"],
    ['base-uri', "'none'"],
    ['form-action', "'self'"],
    ['require-trusted-types-for', "'script'"],
    ['trusted-types', "'none'"],
  ]);
};

/** The policy for an HTML entry, by file name; `null` for a page this build does not know. */
export const cspForPage = (page: string, env: BuildEnv): string | null => {
  if (page === 'index.html' || page === '404.html') return buildSiteCsp(env);
  if (page === 'moderation.html') return buildModerationCsp(env);
  return null;
};

/**
 * The `<meta>` element carrying `policy`. A policy never contains `"`, `&`, `<` or `>` (only
 * keywords in single quotes, schemes and origins), so it is written verbatim; anything else
 * is refused rather than escaped.
 */
export const cspMetaTag = (policy: string): string => {
  if (/["&<>]/.test(policy)) throw new CspConfigError('policy contains a character unsafe in HTML');
  return `<meta http-equiv="Content-Security-Policy" content="${policy}" />`;
};

/** Reads back the policy `cspMetaTag` wrote, for deploy-time verification. */
export const CSP_META_PATTERN = /<meta http-equiv="Content-Security-Policy" content="([^"]+)" \/>/;
