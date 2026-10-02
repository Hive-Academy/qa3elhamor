import { InMemoryComplaintRepository } from '@qa3elhamor/complaints-data-access';
import type {
  ApiErrorResponse,
  ModerationPageResponse,
  WallPageResponse,
} from '@qa3elhamor/shared-api-interfaces';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { noopCachePurger } from './cache-purger.js';
import { DEFAULT_FAILED_REQUEST_LIMITS, loadComplaintsApiConfig } from './config.js';
import type { ComplaintsApiDeps } from './deps.js';
import { InMemoryFailureLimiter } from './failure-limiter.js';
import { handleListWall } from './list-wall.handler.js';
import { handleListModeration, handleModerateComplaint } from './moderation.handler.js';
import { handleSubmitComplaint } from './submit-complaint.handler.js';

const TOKEN = 'moderation-token-for-hardening-tests';
const ORIGIN = 'http://localhost';
const LIMIT = DEFAULT_FAILED_REQUEST_LIMITS[0]?.max ?? 0;

let clock: number;
let seq: number;
let deps: ComplaintsApiDeps;

const makeDeps = (overrides: Partial<ComplaintsApiDeps> = {}): ComplaintsApiDeps => ({
  wall: { complaints: new InMemoryComplaintRepository() },
  config: loadComplaintsApiConfig({
    IP_HASH_SALT: 'hardening-salt-hardening-salt',
    MODERATION_TOKEN: TOKEN,
  }),
  now: () => new Date(clock),
  newId: () => `id-${String(++seq).padStart(4, '0')}`,
  clientIp: (request) => request.headers.get('x-test-ip'),
  reportError: () => undefined,
  failureLimiter: new InMemoryFailureLimiter(DEFAULT_FAILED_REQUEST_LIMITS),
  cachePurger: noopCachePurger,
  ...overrides,
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/complaints`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-test-ip': '10.0.0.1', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const valid = { subject: 'Noise', body: 'The clarinet again.', senderName: 'Patrick' };

const moderate = (id: string, action: string, token = TOKEN) =>
  handleModerateComplaint(
    new Request(`${ORIGIN}/moderation/complaints/${id}/${action}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    }),
    deps,
    { id, action }
  );

const listModeration = (query: string, headers: Record<string, string> = {}) =>
  handleListModeration(
    new Request(`${ORIGIN}/moderation/complaints${query}`, {
      headers: { authorization: `Bearer ${TOKEN}`, ...headers },
    }),
    deps
  );

const errorCode = async (response: Response) =>
  ((await response.json()) as ApiErrorResponse).error.code;

beforeEach(() => {
  clock = Date.parse('2026-10-01T12:00:00.000Z');
  seq = 0;
  deps = makeDeps();
});

describe('abuse limits on refused requests', () => {
  it('throttles a client that keeps sending refused submissions, without reading the body', async () => {
    const refusals = [
      () => post('{"subject": <script>'),
      () => post(valid, { 'content-type': 'text/plain' }),
      () => post({ ...valid, subject: 7 }),
      () => post({ ...valid, subject: '   ' }),
      () => post(JSON.stringify({ ...valid, body: 'x'.repeat(13_000) })),
    ];
    for (let i = 0; i < LIMIT; i++) {
      const make = refusals[i % refusals.length];
      if (make === undefined) throw new Error('unreachable');
      const refused = await handleSubmitComplaint(make(), deps);
      expect(refused.status).toBeGreaterThanOrEqual(400);
      expect(refused.status).toBeLessThan(429);
    }

    // Even a valid request from that client is now refused, and its body is never consumed.
    const request = post(valid);
    const throttled = await handleSubmitComplaint(request, deps);
    expect(throttled.status).toBe(429);
    expect(await errorCode(throttled)).toBe('rate-limited');
    expect(Number(throttled.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(request.bodyUsed).toBe(false);

    // Other clients are unaffected, and the window expiring lifts the throttle.
    expect((await handleSubmitComplaint(post(valid, { 'x-test-ip': '10.0.0.9' }), deps)).status).toBe(201);
    clock += 601_000;
    expect((await handleSubmitComplaint(post(valid), deps)).status).toBe(201);
  });

  it('throttles an IPv6 client across its whole /64', async () => {
    deps = makeDeps({ failureLimiter: new InMemoryFailureLimiter([{ max: 2, windowSeconds: 600 }]) });
    await handleSubmitComplaint(post('x', { 'x-test-ip': '2001:db8:1:2::a' }), deps);
    await handleSubmitComplaint(post('x', { 'x-test-ip': '2001:db8:1:2::b' }), deps);
    const rotated = await handleSubmitComplaint(post(valid, { 'x-test-ip': '2001:db8:1:2:ffff::1' }), deps);
    expect(rotated.status).toBe(429);
  });

  it('does not count accepted or submission-limited requests as refusals', async () => {
    deps = makeDeps({ failureLimiter: new InMemoryFailureLimiter([{ max: 1, windowSeconds: 600 }]) });
    for (let i = 0; i < 3; i++) {
      expect((await handleSubmitComplaint(post(valid), deps)).status).toBe(201);
    }
    expect((await handleSubmitComplaint(post(valid), deps)).status).toBe(429);
    // The failure limiter has seen nothing yet: the first refused request is answered normally.
    expect((await handleSubmitComplaint(post('nope'), deps)).status).toBe(400);
    expect((await handleSubmitComplaint(post('nope'), deps)).status).toBe(429);
  });

  it('throttles moderation token guessing per client, even with a correct token next', async () => {
    const guess = (token: string, ip: string) =>
      handleListModeration(
        new Request(`${ORIGIN}/moderation/complaints`, {
          headers: { authorization: `Bearer ${token}`, 'x-test-ip': ip },
        }),
        deps
      );
    for (let i = 0; i < LIMIT; i++) {
      expect((await guess(`guess-${i}`, '10.9.0.1')).status).toBe(401);
    }
    expect((await guess(TOKEN, '10.9.0.1')).status).toBe(429);
    expect((await guess(TOKEN, '10.9.0.2')).status).toBe(200);
  });
});

describe('response hardening', () => {
  it('stamps security headers on every JSON response, errors included', async () => {
    const responses = [
      await handleSubmitComplaint(post(valid), deps),
      await handleSubmitComplaint(post('{bad'), deps),
      await handleListWall(new Request(`${ORIGIN}/complaints`), deps),
      await handleListModeration(new Request(`${ORIGIN}/moderation/complaints`), deps),
    ];
    for (const response of responses) {
      expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
      expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
      expect(response.headers.get('x-robots-tag')).toContain('noindex');
    }
  });

  it('stores and returns markup verbatim as JSON text: escaping is the renderer job', async () => {
    const markup = {
      subject: '<img src=x onerror=alert(1)>',
      body: '<script>alert("wall")</script>\n"quotes" & \'apostrophes\'',
      senderName: '</textarea><svg onload=alert(1)>',
    };
    expect((await handleSubmitComplaint(post(markup), deps)).status).toBe(201);
    expect((await moderate('id-0001', 'approve')).status).toBe(200);

    const response = await handleListWall(new Request(`${ORIGIN}/complaints`), deps);
    const raw = await response.text();
    // JSON-encoded, neither HTML-escaped nor stripped: a client must render it as text.
    const [item] = (JSON.parse(raw) as WallPageResponse).items;
    expect(item?.subject).toBe(markup.subject);
    expect(item?.body).toBe(markup.body);
    expect(item?.senderName).toBe(markup.senderName);
    expect(raw).not.toContain('&lt;');
  });

  it('accepts a maximum-length complaint of 4-byte characters under the body cap', async () => {
    const fish = String.fromCodePoint(0x1f41f);
    const longest = {
      subject: fish.repeat(120),
      body: fish.repeat(2000),
      senderName: fish.repeat(60),
      senderSpecies: fish.repeat(40),
    };
    expect((await handleSubmitComplaint(post(longest), deps)).status).toBe(201);
    const tooLong = { ...longest, body: fish.repeat(2001) };
    const refused = await handleSubmitComplaint(post(tooLong, { 'x-test-ip': '10.0.0.2' }), deps);
    expect(refused.status).toBe(400);
    expect(await errorCode(refused)).toBe('invalid-complaint');
  });
});

describe('CDN purge on moderation', () => {
  it('purges the wall when an approved complaint is deleted, and only then', async () => {
    const purgeWall = vi.fn(() => Promise.resolve());
    deps = makeDeps({ cachePurger: { purgeWall } });
    await handleSubmitComplaint(post(valid), deps);
    await handleSubmitComplaint(post(valid, { 'x-test-ip': '10.0.0.2' }), deps);
    await handleSubmitComplaint(post(valid, { 'x-test-ip': '10.0.0.3' }), deps);

    expect((await moderate('id-0001', 'approve')).status).toBe(200);
    expect((await moderate('id-0002', 'reject')).status).toBe(200);
    expect((await moderate('id-0003', 'delete')).status).toBe(200);
    expect((await moderate('id-0002', 'delete')).status).toBe(200);
    expect(purgeWall).not.toHaveBeenCalled();

    expect((await moderate('id-0001', 'delete')).status).toBe(200);
    expect(purgeWall).toHaveBeenCalledOnce();
  });

  it('keeps the committed decision and reports a purge failure', async () => {
    const reportError = vi.fn();
    deps = makeDeps({
      reportError,
      cachePurger: { purgeWall: () => Promise.reject(new Error('purge API 502')) },
    });
    await handleSubmitComplaint(post(valid), deps);
    expect((await moderate('id-0001', 'approve')).status).toBe(200);

    expect((await moderate('id-0001', 'delete')).status).toBe(200);
    expect(reportError).toHaveBeenCalledOnce();
    const deleted = (await (await listModeration('?status=deleted')).json()) as ModerationPageResponse;
    expect(deleted.items.map((c) => c.id)).toEqual(['id-0001']);
  });
});
