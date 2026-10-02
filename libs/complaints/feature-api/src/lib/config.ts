import type { RateLimitRule } from '@qa3elhamor/complaints-data-access';

export interface ComplaintsApiConfig {
  /** Every rule must pass for a submission to be accepted. */
  readonly rateLimits: readonly RateLimitRule[];
  /**
   * Refused requests (malformed, oversized, invalid content, bad moderation token) a client may
   * make before it is answered 429 without the request being read. Per process, best effort.
   */
  readonly failedRequestLimits: readonly RateLimitRule[];
  /** HMAC key for client IP hashing; `null` disables submissions (503). */
  readonly ipHashSalt: string | null;
  /** Bearer token for moderation; `null` disables moderation (503). */
  readonly moderationToken: string | null;
  /**
   * What to do with a submission whose client IP is missing or not an IP. `reject` (the
   * default, and the only safe production value) answers 503 `client-ip-unavailable` and
   * reports it, because it means the platform header is misconfigured. `shared-bucket` puts
   * every such request in one bucket: acceptable only for local tooling, since one client can
   * then exhaust the limit for all of them.
   */
  readonly missingClientIp: 'reject' | 'shared-bucket';
  readonly maxBodyBytes: number;
  readonly pageSize: { readonly default: number; readonly max: number };
}

/** 3 per 10 minutes and 20 per day, per client. */
export const DEFAULT_RATE_LIMITS: readonly RateLimitRule[] = [
  { max: 3, windowSeconds: 600 },
  { max: 20, windowSeconds: 86_400 },
];

/** 30 refused requests per 10 minutes, per client. Generous for a person fixing a typo. */
export const DEFAULT_FAILED_REQUEST_LIMITS: readonly RateLimitRule[] = [
  { max: 30, windowSeconds: 600 },
];

/**
 * The domain caps content at 2,220 code points across all fields. At the UTF-8 worst case
 * (4 bytes each, e.g. all emoji) that is 8,880 bytes before JSON keys and quotes, so the cap
 * is 12 KiB: a legitimate maximum-length complaint always fits, and anything larger cannot be
 * valid and is refused before it is parsed.
 */
export const DEFAULT_MAX_BODY_BYTES = 12 * 1024;
export const MIN_SECRET_LENGTH = 24;

/** A misconfigured deployment. Thrown at startup so it fails loudly, never per request. */
export class ComplaintsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComplaintsConfigError';
  }
}

const RULE_PATTERN = /^(\d+)\/(\d+)$/;

/**
 * Parses a rule list such as `RATE_LIMITS`, e.g. `3/600,20/86400` (max/windowSeconds,
 * comma-separated). `name` is the variable named in the error.
 */
export const parseRateLimits = (raw: string, name = 'RATE_LIMITS'): readonly RateLimitRule[] => {
  const rules = raw.split(',').map((part) => {
    const match = RULE_PATTERN.exec(part.trim());
    const max = Number(match?.[1]);
    const windowSeconds = Number(match?.[2]);
    if (match === null || max < 1 || windowSeconds < 1) {
      throw new ComplaintsConfigError(
        `${name} must be comma-separated max/windowSeconds pairs, e.g. 3/600,20/86400`
      );
    }
    return { max, windowSeconds };
  });
  return rules;
};

/**
 * `.env.example` ships working local values that all start with this prefix. They are public
 * (committed), so a production deployment that copied the example file must not start.
 */
export const PLACEHOLDER_SECRET_PREFIX = 'change-me';

const secret = (
  value: string | undefined,
  name: string,
  production: boolean
): string | null => {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) return null;
  if (trimmed.length < MIN_SECRET_LENGTH) {
    throw new ComplaintsConfigError(`${name} must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  if (production && trimmed.toLowerCase().startsWith(PLACEHOLDER_SECRET_PREFIX)) {
    throw new ComplaintsConfigError(
      `${name} is the public placeholder from .env.example; generate a real secret for production`
    );
  }
  return trimmed;
};

const missingClientIpPolicy = (raw: string | undefined): ComplaintsApiConfig['missingClientIp'] => {
  const value = raw?.trim().toLowerCase() ?? '';
  if (value === '' || value === 'reject') return 'reject';
  if (value === 'shared') return 'shared-bucket';
  throw new ComplaintsConfigError('CLIENT_IP_FALLBACK must be "reject" (default) or "shared"');
};

const rulesOrDefault = (
  raw: string | undefined,
  fallback: readonly RateLimitRule[],
  name: string
): readonly RateLimitRule[] => {
  const trimmed = raw?.trim() ?? '';
  return trimmed === '' ? fallback : parseRateLimits(trimmed, name);
};

/**
 * Reads the handlers' configuration from environment variables: `RATE_LIMITS`,
 * `FAILED_REQUEST_LIMITS`, `IP_HASH_SALT`, `MODERATION_TOKEN`, `CLIENT_IP_FALLBACK`, and
 * `NODE_ENV` (with `production`, the `.env.example` placeholder secrets are refused). Secret
 * values are never logged.
 */
export const loadComplaintsApiConfig = (
  env: Readonly<Record<string, string | undefined>>
): ComplaintsApiConfig => {
  const production = env['NODE_ENV']?.trim() === 'production';
  return {
    missingClientIp: missingClientIpPolicy(env['CLIENT_IP_FALLBACK']),
    rateLimits: rulesOrDefault(env['RATE_LIMITS'], DEFAULT_RATE_LIMITS, 'RATE_LIMITS'),
    failedRequestLimits: rulesOrDefault(
      env['FAILED_REQUEST_LIMITS'],
      DEFAULT_FAILED_REQUEST_LIMITS,
      'FAILED_REQUEST_LIMITS'
    ),
    ipHashSalt: secret(env['IP_HASH_SALT'], 'IP_HASH_SALT', production),
    moderationToken: secret(env['MODERATION_TOKEN'], 'MODERATION_TOKEN', production),
    maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
    pageSize: { default: 20, max: 50 },
  };
};
