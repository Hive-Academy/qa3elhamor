import {
  evaluateRateLimit,
  longestWindowMs,
  type RateLimitDecision,
  type RateLimitRule,
} from '@qa3elhamor/complaints-data-access';

/**
 * Counts refused requests (malformed, oversized, wrong media type, invalid content, a bad
 * moderation token) per client, so a client that keeps sending garbage is answered 429 before
 * its next body is read or its next token is compared.
 *
 * Only successful submissions reach the database-backed limiter; without this, a flood of
 * invalid requests costs CPU on every request and is never throttled.
 */
export interface FailureLimiter {
  /** Whether `key` may make another request now. Read-only. */
  check(key: string, now: Date): RateLimitDecision;
  /** Records one refused request for `key`. */
  recordFailure(key: string, now: Date): void;
}

export interface InMemoryFailureLimiterOptions {
  /**
   * Upper bound on tracked clients. Past it, the client seen least recently is forgotten, so
   * memory stays bounded however many addresses an attacker rotates through.
   */
  readonly maxClients?: number;
}

const DEFAULT_MAX_CLIENTS = 10_000;

/**
 * Per-process failure limiter. Best effort by design: a serverless platform runs several warm
 * instances and recycles them, so each instance counts on its own and forgets on restart. It
 * raises the cost of a flood from one client; it is not a substitute for an edge rate limit
 * (docs/security.md, owner checklist). Keys are rate-limit subjects (IPv4 or IPv6 /64) held in
 * memory only, never persisted or logged.
 */
export class InMemoryFailureLimiter implements FailureLimiter {
  private readonly failures = new Map<string, number[]>();
  private readonly maxClients: number;
  private readonly horizonMs: number;
  private readonly maxPerClient: number;

  constructor(
    private readonly rules: readonly RateLimitRule[],
    options: InMemoryFailureLimiterOptions = {}
  ) {
    this.maxClients = Math.max(1, options.maxClients ?? DEFAULT_MAX_CLIENTS);
    this.horizonMs = longestWindowMs(rules);
    this.maxPerClient = rules.reduce((largest, rule) => Math.max(largest, rule.max), 1);
  }

  check(key: string, now: Date): RateLimitDecision {
    const history = this.live(key, now);
    if (history.length === 0) return { allowed: true };
    return evaluateRateLimit(
      history.map((ms) => new Date(ms)),
      now,
      this.rules
    );
  }

  recordFailure(key: string, now: Date): void {
    const history = this.live(key, now);
    history.push(now.getTime());
    // Only the newest `max` entries can ever decide a rule, so older ones are dead weight.
    const kept = history.slice(-this.maxPerClient);
    // Re-insert so Map iteration order is least-recently-failed first.
    this.failures.delete(key);
    this.failures.set(key, kept);
    while (this.failures.size > this.maxClients) {
      const oldest = this.failures.keys().next();
      if (oldest.done === true) break;
      this.failures.delete(oldest.value);
    }
  }

  /** Tracked clients; for tests and diagnostics. */
  get size(): number {
    return this.failures.size;
  }

  /** The key's failures still inside the longest window; drops the key when none remain. */
  private live(key: string, now: Date): number[] {
    const recorded = this.failures.get(key);
    if (recorded === undefined) return [];
    const cutoff = now.getTime() - this.horizonMs;
    const kept = recorded.filter((ms) => ms > cutoff);
    if (kept.length === 0) this.failures.delete(key);
    else if (kept.length !== recorded.length) this.failures.set(key, kept);
    return kept;
  }
}
