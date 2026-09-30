import type { RateLimitRule } from '@qa3elhamor/complaints-data-access';

export interface ComplaintsApiConfig {
  /** Every rule must pass for a submission to be accepted. */
  readonly rateLimits: readonly RateLimitRule[];
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

/** The domain caps content at ~2.2k code points; 8 KiB leaves room for JSON and UTF-8. */
export const DEFAULT_MAX_BODY_BYTES = 8 * 1024;
export const MIN_SECRET_LENGTH = 24;

/** A misconfigured deployment. Thrown at startup so it fails loudly, never per request. */
export class ComplaintsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComplaintsConfigError';
  }
}

const RULE_PATTERN = /^(\d+)\/(\d+)$/;

/** Parses `RATE_LIMITS`, e.g. `3/600,20/86400` (max/windowSeconds, comma-separated). */
export const parseRateLimits = (raw: string): readonly RateLimitRule[] => {
  const rules = raw.split(',').map((part) => {
    const match = RULE_PATTERN.exec(part.trim());
    const max = Number(match?.[1]);
    const windowSeconds = Number(match?.[2]);
    if (match === null || max < 1 || windowSeconds < 1) {
      throw new ComplaintsConfigError(
        'RATE_LIMITS must be comma-separated max/windowSeconds pairs, e.g. 3/600,20/86400'
      );
    }
    return { max, windowSeconds };
  });
  return rules;
};

const secret = (value: string | undefined, name: string): string | null => {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) return null;
  if (trimmed.length < MIN_SECRET_LENGTH) {
    throw new ComplaintsConfigError(`${name} must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  return trimmed;
};

const missingClientIpPolicy = (raw: string | undefined): ComplaintsApiConfig['missingClientIp'] => {
  const value = raw?.trim().toLowerCase() ?? '';
  if (value === '' || value === 'reject') return 'reject';
  if (value === 'shared') return 'shared-bucket';
  throw new ComplaintsConfigError('CLIENT_IP_FALLBACK must be "reject" (default) or "shared"');
};

/**
 * Reads the handlers' configuration from environment variables: `RATE_LIMITS`,
 * `IP_HASH_SALT`, `MODERATION_TOKEN`, `CLIENT_IP_FALLBACK`. Secret values are never logged.
 */
export const loadComplaintsApiConfig = (
  env: Readonly<Record<string, string | undefined>>
): ComplaintsApiConfig => {
  const rawLimits = env['RATE_LIMITS']?.trim();
  return {
    missingClientIp: missingClientIpPolicy(env['CLIENT_IP_FALLBACK']),
    rateLimits:
      rawLimits === undefined || rawLimits === '' ? DEFAULT_RATE_LIMITS : parseRateLimits(rawLimits),
    ipHashSalt: secret(env['IP_HASH_SALT'], 'IP_HASH_SALT'),
    moderationToken: secret(env['MODERATION_TOKEN'], 'MODERATION_TOKEN'),
    maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
    pageSize: { default: 20, max: 50 },
  };
};
