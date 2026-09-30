import { describe, expect, it } from 'vitest';
import {
  ComplaintsConfigError,
  DEFAULT_RATE_LIMITS,
  loadComplaintsApiConfig,
  parseRateLimits,
} from './config.js';
import { clientKeyFor, rateLimitSubject } from './security.js';

describe('loadComplaintsApiConfig', () => {
  it('defaults to 3/10 min + 20/day with secrets disabled', () => {
    const config = loadComplaintsApiConfig({});
    expect(config.rateLimits).toEqual(DEFAULT_RATE_LIMITS);
    expect(config.ipHashSalt).toBeNull();
    expect(config.moderationToken).toBeNull();
  });

  it('parses RATE_LIMITS', () => {
    expect(parseRateLimits('5/60, 100/3600')).toEqual([
      { max: 5, windowSeconds: 60 },
      { max: 100, windowSeconds: 3600 },
    ]);
    expect(() => parseRateLimits('5 per minute')).toThrow(ComplaintsConfigError);
    expect(() => parseRateLimits('0/60')).toThrow(ComplaintsConfigError);
  });

  it('refuses short secrets without echoing them', () => {
    expect(() => loadComplaintsApiConfig({ MODERATION_TOKEN: 'hunter2' })).toThrow(
      /MODERATION_TOKEN must be at least/
    );
    try {
      loadComplaintsApiConfig({ IP_HASH_SALT: 'short-salt' });
    } catch (error) {
      expect(String(error)).not.toContain('short-salt');
    }
  });
});

describe('CLIENT_IP_FALLBACK', () => {
  it('defaults to reject and accepts only reject or shared', () => {
    expect(loadComplaintsApiConfig({}).missingClientIp).toBe('reject');
    expect(loadComplaintsApiConfig({ CLIENT_IP_FALLBACK: 'shared' }).missingClientIp).toBe('shared-bucket');
    expect(() => loadComplaintsApiConfig({ CLIENT_IP_FALLBACK: 'yes' })).toThrow(ComplaintsConfigError);
  });
});

describe('rateLimitSubject', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    [' 203.0.113.7 ', '203.0.113.7'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['::FFFF:cb00:7107', '203.0.113.7'],
    ['0:0:0:0:0:ffff:203.0.113.7', '203.0.113.7'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['2001:0DB8:0000:0000:0000:0000:0000:0001', '2001:db8:0:0::/64'],
    ['2001:db8:0:0:ffff:1:2:3', '2001:db8:0:0::/64'],
    ['2001:db8:aa:bb::1', '2001:db8:aa:bb::/64'],
    ['fe80::1%eth0', 'fe80:0:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    ['::', '0:0:0:0::/64'],
    ['64:ff9b::192.0.2.1', '64:ff9b:0:0::/64'],
  ])('%s -> %s', (raw, expected) => {
    expect(rateLimitSubject(raw)).toBe(expected);
  });

  it.each([null, '', 'unknown', '1.2.3', '01.2.3.4', '256.0.0.1', '2001:db8::g', 'a'.repeat(80)])(
    'refuses %s',
    (raw) => {
      expect(rateLimitSubject(raw)).toBeNull();
    }
  );
});

describe('clientKeyFor', () => {
  it('is a salted, fixed-length hash that never contains the IP', () => {
    const key = clientKeyFor('203.0.113.7', 'salt-a-salt-a-salt-a-salt-a');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain('203.0.113.7');
    expect(clientKeyFor('203.0.113.7', 'salt-b-salt-b-salt-b-salt-b')).not.toBe(key);
  });
});
