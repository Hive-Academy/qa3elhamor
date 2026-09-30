/**
 * Build-time analytics configuration, read from `import.meta.env` by the app and passed in
 * here (the library never reads `import.meta.env` itself, so it stays testable and a fork can
 * configure it from anywhere). Anything missing or malformed resolves to `none`: a fork sends
 * nothing until it is deliberately configured.
 */

export type AnalyticsProviderName = 'plausible' | 'umami' | 'none';

/** Official hosted endpoints. The script URL is pinned unless `VITE_ANALYTICS_SCRIPT_SRC` is set. */
export const PLAUSIBLE_SCRIPT_SRC = 'https://plausible.io/js/script.js';
export const UMAMI_SCRIPT_SRC = 'https://cloud.umami.is/script.js';

export interface PlausibleConfig {
  readonly provider: 'plausible';
  /** The site as registered in Plausible (`data-domain`), e.g. `example.org`. */
  readonly domain: string;
  readonly scriptSrc: string;
  /** Events API used on the page-exit path: `<script origin>/api/event`. */
  readonly eventEndpoint: string;
}

export interface UmamiConfig {
  readonly provider: 'umami';
  /** The website UUID from the Umami dashboard (`data-website-id`). */
  readonly websiteId: string;
  readonly scriptSrc: string;
  /** Collection API used on the page-exit path: `<script origin>/api/send`. */
  readonly eventEndpoint: string;
}

export interface DisabledConfig {
  readonly provider: 'none';
  /** Why analytics is off, for logs and tests. */
  readonly reason: string;
}

export type AnalyticsConfig = PlausibleConfig | UmamiConfig | DisabledConfig;

/** The env keys read. Values are `unknown` because `import.meta.env` is untyped input. */
export const ANALYTICS_ENV_KEYS = {
  provider: 'VITE_ANALYTICS_PROVIDER',
  domain: 'VITE_ANALYTICS_DOMAIN',
  websiteId: 'VITE_ANALYTICS_WEBSITE_ID',
  scriptSrc: 'VITE_ANALYTICS_SCRIPT_SRC',
} as const;

// One or more comma-separated hostnames (Plausible accepts a list for roll-up sites).
const DOMAIN_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)+(,[a-z0-9-]+(\.[a-z0-9-]+)+)*$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const disabled = (reason: string): DisabledConfig => ({ provider: 'none', reason });

/**
 * A script override (self-hosted instance) must be an absolute https URL; plain http is
 * accepted only for a local instance. Returns null when invalid.
 */
function parseScriptUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol === 'https:') return url;
  if (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)) return url;
  return null;
}

export function resolveAnalyticsConfig(env: Readonly<Record<string, unknown>>): AnalyticsConfig {
  const provider = text(env[ANALYTICS_ENV_KEYS.provider]).toLowerCase();
  if (provider === '' || provider === 'none') return disabled('provider not configured');
  if (provider !== 'plausible' && provider !== 'umami') {
    return disabled(`unknown provider "${provider}"`);
  }

  const override = text(env[ANALYTICS_ENV_KEYS.scriptSrc]);
  const script = parseScriptUrl(
    override || (provider === 'plausible' ? PLAUSIBLE_SCRIPT_SRC : UMAMI_SCRIPT_SRC)
  );
  if (script === null) return disabled(`${ANALYTICS_ENV_KEYS.scriptSrc} must be an https URL`);

  if (provider === 'plausible') {
    // Plausible matches `data-domain` exactly against the lowercase site domain.
    const domain = text(env[ANALYTICS_ENV_KEYS.domain]).toLowerCase();
    if (!DOMAIN_PATTERN.test(domain)) {
      return disabled(`${ANALYTICS_ENV_KEYS.domain} missing or invalid`);
    }
    return {
      provider,
      domain,
      scriptSrc: script.href,
      eventEndpoint: `${script.origin}/api/event`,
    };
  }

  const websiteId = text(env[ANALYTICS_ENV_KEYS.websiteId]);
  if (!UUID_PATTERN.test(websiteId)) {
    return disabled(`${ANALYTICS_ENV_KEYS.websiteId} missing or not a UUID`);
  }
  return {
    provider,
    websiteId,
    scriptSrc: script.href,
    eventEndpoint: `${script.origin}/api/send`,
  };
}
