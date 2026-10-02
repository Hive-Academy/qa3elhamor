import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

const MAX_IP_LENGTH = 64;

/** Expands a valid IPv6 literal (zone already stripped) into its eight 16-bit groups. */
const ipv6Groups = (ip: string): number[] => {
  // Rewrite an embedded IPv4 tail (`::ffff:192.0.2.1`) as its two hex groups first.
  const lastColon = ip.lastIndexOf(':');
  const last = ip.slice(lastColon + 1);
  let text = ip;
  if (last.includes('.')) {
    const [a = 0, b = 0, c = 0, d = 0] = last.split('.').map(Number);
    const hex = (n: number) => n.toString(16);
    text = `${ip.slice(0, lastColon + 1)}${hex((a << 8) | b)}:${hex((c << 8) | d)}`;
  }
  const parse = (part: string) =>
    part === '' ? [] : part.split(':').map((group) => parseInt(group, 16));
  const [head = '', rest] = text.split('::');
  if (rest === undefined) return parse(head);
  const headGroups = parse(head);
  const restGroups = parse(rest);
  const zeros = Array<number>(8 - headGroups.length - restGroups.length).fill(0);
  return [...headGroups, ...zeros, ...restGroups];
};

/**
 * The rate-limit subject for a client address, or `null` when `raw` is not an IP address.
 *
 * - IPv4 is used as is (Node's `isIP` refuses leading zeros, so it is already canonical).
 * - IPv4-mapped IPv6 (`::ffff:192.0.2.1`, `::ffff:c000:201`) is the IPv4 address it maps, so
 *   a dual-stack socket cannot give one client two buckets.
 * - Other IPv6 collapses to its /64 prefix: an ISP hands a subscriber a whole /64, and the
 *   interface identifier (the low 64 bits) can be rotated freely, so limiting per address
 *   would limit nothing. Spelling variants (`2001:db8::1` vs `2001:0db8:0:0::1`) and zone ids
 *   (`fe80::1%eth0`) normalise to the same prefix.
 */
export const rateLimitSubject = (raw: string | null): string | null => {
  const trimmed = raw?.trim() ?? '';
  if (trimmed.length === 0 || trimmed.length > MAX_IP_LENGTH) return null;
  if (isIP(trimmed) === 4) return trimmed;

  const zone = trimmed.indexOf('%');
  const ip = zone === -1 ? trimmed : trimmed.slice(0, zone);
  if (isIP(ip) !== 6) return null;
  const g = ipv6Groups(ip);
  if (g.length !== 8) return null;

  const isMapped = g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff;
  if (isMapped) {
    const [hi = 0, lo = 0] = g.slice(6);
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  return `${g.slice(0, 4).map((x) => x.toString(16)).join(':')}::/64`;
};

/** Stands in for every client without a usable IP when the shared-bucket fallback is on. */
export const UNIDENTIFIED_CLIENT = 'unidentified';

/**
 * The rate-limit key for a subject: HMAC-SHA256 under a server-side salt, as 64 hex
 * characters. Without the salt the IPv4 space is small enough to reverse a plain hash, so
 * the address is not recoverable from the database.
 */
export const clientKeyFor = (subject: string, salt: string): string =>
  createHmac('sha256', salt).update(subject).digest('hex');

const MAX_AUTHORIZATION_LENGTH = 1024;

const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

/**
 * Constant-time comparison of a presented secret with the expected one. Both sides are hashed
 * to a fixed length first, so `timingSafeEqual` leaks neither the content nor the length.
 * `null` (header absent) never matches.
 */
export const secretMatches = (presented: string | null, expected: string): boolean => {
  if (presented === null || presented.length > MAX_AUTHORIZATION_LENGTH) return false;
  return timingSafeEqual(digest(presented), digest(expected));
};

/** True when `Authorization: Bearer <token>` matches `expected`, in constant time. */
export const hasModerationToken = (request: Request, expected: string): boolean => {
  const header = request.headers.get('authorization');
  if (header === null || header.length > MAX_AUTHORIZATION_LENGTH) return false;
  const match = /^Bearer[ ]+(\S+)[ ]*$/i.exec(header);
  return secretMatches(match?.[1] ?? null, expected);
};
