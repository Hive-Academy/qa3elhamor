/** HTTP-level settings for the API app; the handlers' own settings live in feature-api. */
export interface ApiConfig {
  /** Path prefix every route sits under, e.g. `/api` -> `/api/complaints`. */
  readonly basePath: string;
  /** Extra origins allowed to call the API cross-origin. Same-origin always works. */
  readonly corsAllowedOrigins: ReadonlySet<string>;
  /**
   * Header carrying the client IP as set by the platform edge. Netlify sets
   * `x-nf-client-connection-ip` and overwrites any client-supplied value; the dev server sets
   * it from the socket. Never point this at a header clients can forge.
   */
  readonly clientIpHeader: string;
  /** `null` when unset: the wall answers 503, everything else still works. */
  readonly databaseUrl: string | null;
}

const normaliseBasePath = (raw: string | undefined): string => {
  const trimmed = (raw ?? '/api').trim().replace(/\/+$/, '');
  if (trimmed === '') return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

/**
 * Reads `API_BASE_PATH` (default `/api`), `CORS_ALLOWED_ORIGINS` (comma-separated origins),
 * `CLIENT_IP_HEADER` (default `x-nf-client-connection-ip`) and `DATABASE_URL`.
 */
export const loadApiConfig = (env: Readonly<Record<string, string | undefined>>): ApiConfig => {
  const origins = (env['CORS_ALLOWED_ORIGINS'] ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);
  const databaseUrl = env['DATABASE_URL']?.trim() ?? '';
  return {
    basePath: normaliseBasePath(env['API_BASE_PATH']),
    corsAllowedOrigins: new Set(origins),
    clientIpHeader: (env['CLIENT_IP_HEADER']?.trim() || 'x-nf-client-connection-ip').toLowerCase(),
    databaseUrl: databaseUrl === '' ? null : databaseUrl,
  };
};
