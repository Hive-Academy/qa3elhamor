import { describe, expect, it } from 'vitest';
import { InMemoryFailureLimiter } from './failure-limiter.js';

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 1, 12, 0, seconds));

describe('InMemoryFailureLimiter', () => {
  it('allows a client until its failures reach the rule, then reports when it may retry', () => {
    const limiter = new InMemoryFailureLimiter([{ max: 3, windowSeconds: 60 }]);
    for (let s = 0; s < 3; s++) {
      expect(limiter.check('a', at(s))).toEqual({ allowed: true });
      limiter.recordFailure('a', at(s));
    }
    // The oldest failure (t=0) leaves the 60 s window at t=60; now is t=10.
    expect(limiter.check('a', at(10))).toEqual({ allowed: false, retryAfterSeconds: 50 });
    expect(limiter.check('b', at(10))).toEqual({ allowed: true });
    expect(limiter.check('a', at(61))).toEqual({ allowed: true });
  });

  it('applies every rule', () => {
    const limiter = new InMemoryFailureLimiter([
      { max: 5, windowSeconds: 10 },
      { max: 2, windowSeconds: 3600 },
    ]);
    limiter.recordFailure('a', at(0));
    limiter.recordFailure('a', at(20));
    expect(limiter.check('a', at(40)).allowed).toBe(false);
  });

  it('forgets clients whose failures have all expired', () => {
    const limiter = new InMemoryFailureLimiter([{ max: 1, windowSeconds: 60 }]);
    limiter.recordFailure('a', at(0));
    expect(limiter.size).toBe(1);
    expect(limiter.check('a', at(61))).toEqual({ allowed: true });
    expect(limiter.size).toBe(0);
  });

  it('bounds memory: past maxClients the least recently failed client is dropped', () => {
    const limiter = new InMemoryFailureLimiter([{ max: 1, windowSeconds: 600 }], { maxClients: 2 });
    limiter.recordFailure('a', at(0));
    limiter.recordFailure('b', at(1));
    limiter.recordFailure('a', at(2));
    limiter.recordFailure('c', at(3));
    expect(limiter.size).toBe(2);
    expect(limiter.check('b', at(4))).toEqual({ allowed: true });
    expect(limiter.check('a', at(4)).allowed).toBe(false);
    expect(limiter.check('c', at(4)).allowed).toBe(false);
  });

  it('keeps at most the largest rule max per client', () => {
    const limiter = new InMemoryFailureLimiter([{ max: 2, windowSeconds: 600 }]);
    for (let s = 0; s < 50; s++) limiter.recordFailure('a', at(s));
    // Only the newest two (t=48, t=49) remain; t=48 leaves the window at t=648.
    expect(limiter.check('a', at(100))).toEqual({ allowed: false, retryAfterSeconds: 548 });
  });
});
