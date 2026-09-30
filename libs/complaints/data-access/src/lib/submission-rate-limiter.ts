/** At most `max` accepted submissions in any rolling window of `windowSeconds`. */
export interface RateLimitRule {
  readonly max: number;
  readonly windowSeconds: number;
}

export type RateLimitDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

/** The longest window across `rules`, in milliseconds; history older than this is dead. */
export const longestWindowMs = (rules: readonly RateLimitRule[]): number =>
  rules.reduce((longest, rule) => Math.max(longest, rule.windowSeconds * 1000), 0);

/**
 * The pure policy every repository implementation shares. `history` holds earlier accepted
 * submissions for one client, in any order. When a rule is exhausted, `retryAfterSeconds` is
 * the time until enough of its window has expired to admit one more (the largest across rules).
 */
export const evaluateRateLimit = (
  history: readonly Date[],
  now: Date,
  rules: readonly RateLimitRule[]
): RateLimitDecision => {
  const nowMs = now.getTime();
  const sorted = history.map((d) => d.getTime()).sort((a, b) => a - b);
  let retryAfterMs = 0;

  for (const rule of rules) {
    const windowMs = rule.windowSeconds * 1000;
    const inWindow = sorted.filter((t) => t > nowMs - windowMs);
    if (inWindow.length < rule.max) continue;
    // Admitting one more needs the count to fall to max - 1, i.e. this entry to expire.
    const blocking = inWindow[inWindow.length - rule.max] ?? nowMs;
    retryAfterMs = Math.max(retryAfterMs, blocking + windowMs - nowMs);
  }

  return retryAfterMs > 0
    ? { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) }
    : { allowed: true };
};
