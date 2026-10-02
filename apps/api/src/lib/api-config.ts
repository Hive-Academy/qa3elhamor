import { ComplaintsConfigError, MIN_SECRET_LENGTH } from '@qa3elhamor/complaints-feature-api';

/**
 * Proof that a request came through the operator's own edge (reverse proxy / CDN), for hosts
 * where the API origin is reachable directly and the client-IP header could otherwise be
 * forged. The edge adds `header: value`; requests without it get no client IP (and so cannot
 * submit). Not needed on Netlify, whose functions are only reachable through its edge.
 */
export interface EdgeAuth {
  readonly header: string;
  readonly secret: string;
}

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
  /** `null` (the default) trusts `clientIpHeader` on every request. See `EdgeAuth`. */
  readonly edgeAuth: EdgeAuth | null;
  /** `null` when unset: the wall answers 503, everything else still works. */
  readonly databaseUrl: string | null;
}

const normaliseBasePath = (raw: string | undefined): string => {
  const trimmed = (raw ?? '/api').trim().replace(/\/+$/, '');
  if (trimmed === '') return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

/**
 * List-valued forwarding headers: their leftmost entry is whatever the client sent, and a
 * proxy appends rather than replaces. Never a single trustworthy address.
 */
const FORGEABLE_IP_HEADERS = new Set(['x-forwarded-for', 'forwarded']);

const clientIpHeaderFrom = (raw: string | undefined): string => {
  const header = (raw?.trim() || 'x-nf-client-connection-ip').toLowerCase();
  if (FORGEABLE_IP_HEADERS.has(header)) {
    throw new ComplaintsConfigError(
      `CLIENT_IP_HEADER must be a header your edge overwrites with one address, not ${header}`
    );
  }
  return header;
};

const edgeAuthFrom = (
  rawSecret: string | undefined,
  rawHeader: string | undefined
): EdgeAuth | null => {
  const secret = rawSecret?.trim() ?? '';
  if (secret === '') return null;
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new ComplaintsConfigError(`EDGE_AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  return { header: (rawHeader?.trim() || 'x-edge-auth').toLowerCase(), secret };
};

/**
 * Reads `API_BASE_PATH` (default `/api`), `CORS_ALLOWED_ORIGINS` (comma-separated origins),
 * `CLIENT_IP_HEADER` (default `x-nf-client-connection-ip`), `EDGE_AUTH_SECRET` /
 * `EDGE_AUTH_HEADER` (default `x-edge-auth`) and `DATABASE_URL`. Throws
 * `ComplaintsConfigError` at startup for a forgeable IP header or a short edge secret.
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
    clientIpHeader: clientIpHeaderFrom(env['CLIENT_IP_HEADER']),
    edgeAuth: edgeAuthFrom(env['EDGE_AUTH_SECRET'], env['EDGE_AUTH_HEADER']),
    databaseUrl: databaseUrl === '' ? null : databaseUrl,
  };
};
