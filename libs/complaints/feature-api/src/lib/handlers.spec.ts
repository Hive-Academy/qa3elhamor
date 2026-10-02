import { InMemoryComplaintRepository } from '@qa3elhamor/complaints-data-access';
import type {
  ApiErrorResponse,
  ModerationActionResponse,
  ModerationPageResponse,
  SubmitComplaintResponse,
  WallPageResponse,
} from '@qa3elhamor/shared-api-interfaces';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { noopCachePurger, WALL_CACHE_TAG } from './cache-purger.js';
import { DEFAULT_FAILED_REQUEST_LIMITS, loadComplaintsApiConfig } from './config.js';
import type { ComplaintsApiDeps } from './deps.js';
import { InMemoryFailureLimiter } from './failure-limiter.js';
import { handleListWall } from './list-wall.handler.js';
import { handleListModeration, handleModerateComplaint } from './moderation.handler.js';
import { handleSubmitComplaint } from './submit-complaint.handler.js';

const TOKEN = 'moderation-token-for-unit-tests';
const ORIGIN = 'http://localhost';

let clock: number;
let seq: number;
let deps: ComplaintsApiDeps;

const makeDeps = (overrides: Partial<ComplaintsApiDeps> = {}): ComplaintsApiDeps => ({
  wall: { complaints: new InMemoryComplaintRepository() },
  config: loadComplaintsApiConfig({
    IP_HASH_SALT: 'unit-test-salt-unit-test-salt',
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

const errorCode = async (response: Response) =>
  ((await response.json()) as ApiErrorResponse).error.code;

beforeEach(() => {
  clock = Date.parse('2026-10-01T12:00:00.000Z');
  seq = 0;
  deps = makeDeps();
});

describe('POST /complaints', () => {
  it('files a pending complaint that is not yet on the wall', async () => {
    const response = await handleSubmitComplaint(post(valid), deps);
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as SubmitComplaintResponse;
    expect(body).toEqual({ id: 'id-0001', status: 'pending' });

    const wall = await handleListWall(new Request(`${ORIGIN}/complaints`), deps);
    expect(((await wall.json()) as WallPageResponse).items).toEqual([]);
  });

  it('refuses a non-JSON content type', async () => {
    const response = await handleSubmitComplaint(post(valid, { 'content-type': 'text/plain' }), deps);
    expect(response.status).toBe(415);
  });

  it('refuses a body over the size cap before parsing it', async () => {
    const huge = JSON.stringify({ ...valid, body: 'x'.repeat(13_000) });
    const response = await handleSubmitComplaint(post(huge), deps);
    expect(response.status).toBe(413);
    expect(await errorCode(response)).toBe('payload-too-large');
  });

  it('refuses invalid JSON without echoing the parser message', async () => {
    const response = await handleSubmitComplaint(post('{"subject": <script>'), deps);
    expect(response.status).toBe(400);
    const body = (await response.json()) as ApiErrorResponse;
    expect(body.error).toEqual({ code: 'invalid-json', message: expect.any(String) });
    expect(body.error.message).not.toContain('script');
  });

  it('refuses unknown keys, wrong types and missing fields', async () => {
    const response = await handleSubmitComplaint(
      post({ subject: 1, body: 'x', replyEmail: 'a@b.co', visibility: 'private' }),
      deps
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('invalid-request');
    expect(body.error.issues).toEqual(
      expect.arrayContaining([
        { field: 'request', reason: 'unknown-field' },
        { field: 'subject', reason: 'malformed' },
        { field: 'senderName', reason: 'required' },
      ])
    );
  });

  it('never echoes unknown key names', async () => {
    const response = await handleSubmitComplaint(
      post({ ...valid, '<img src=x onerror=alert(1)>': 1 }),
      deps
    );
    const text = await response.text();
    expect(response.status).toBe(400);
    expect(text).not.toContain('onerror');
    expect(text).toContain('unknown-field');
  });

  it('shares one bucket across an IPv6 /64 and across IPv4-mapped spellings', async () => {
    const from = (ip: string) => handleSubmitComplaint(post(valid, { 'x-test-ip': ip }), deps);
    expect((await from('2001:db8:1:2::a')).status).toBe(201);
    expect((await from('2001:0db8:0001:0002:ffff:0:0:b')).status).toBe(201);
    expect((await from('2001:db8:1:2:dead:beef:1:2%eth0')).status).toBe(201);
    expect((await from('2001:db8:1:2::c')).status).toBe(429);
    expect((await from('2001:db8:1:3::a')).status).toBe(201);

    expect((await from('::ffff:192.0.2.7')).status).toBe(201);
    expect((await from('192.0.2.7')).status).toBe(201);
    expect((await from('::ffff:c000:207')).status).toBe(201);
    expect((await from('192.0.2.7')).status).toBe(429);
  });

  it('refuses (503) a submission without a usable client IP by default, and reports it', async () => {
    const reportError = vi.fn();
    for (const ip of [null, '', 'not-an-ip', '999.1.1.1']) {
      const response = await handleSubmitComplaint(
        post(valid),
        makeDeps({ reportError, clientIp: () => ip })
      );
      expect(response.status).toBe(503);
      expect(await errorCode(response)).toBe('client-ip-unavailable');
    }
    expect(reportError).toHaveBeenCalledTimes(4);
  });

  it('uses one shared bucket for unidentified clients only when CLIENT_IP_FALLBACK=shared', async () => {
    deps = makeDeps({
      config: loadComplaintsApiConfig({
        IP_HASH_SALT: 'unit-test-salt-unit-test-salt',
        CLIENT_IP_FALLBACK: 'shared',
      }),
      clientIp: () => null,
    });
    for (let i = 0; i < 3; i++) expect((await handleSubmitComplaint(post(valid), deps)).status).toBe(201);
    expect((await handleSubmitComplaint(post(valid), deps)).status).toBe(429);
  });

  it('reports domain validation issues', async () => {
    const response = await handleSubmitComplaint(post({ ...valid, subject: '   ' }), deps);
    expect(response.status).toBe(400);
    const body = (await response.json()) as ApiErrorResponse;
    expect(body.error.code).toBe('invalid-complaint');
    expect(body.error.issues).toEqual([{ field: 'subject', reason: 'empty' }]);
  });

  it('rate limits per client with Retry-After, and does not count invalid attempts', async () => {
    await handleSubmitComplaint(post({ ...valid, subject: '' }), deps);
    for (let i = 0; i < 3; i++) {
      expect((await handleSubmitComplaint(post(valid), deps)).status).toBe(201);
      clock += 60_000;
    }
    const limited = await handleSubmitComplaint(post(valid), deps);
    expect(limited.status).toBe(429);
    expect(await errorCode(limited)).toBe('rate-limited');
    // The first accepted submission (t=0) leaves the 10-minute window at t=600s; now is t=180s.
    expect(limited.headers.get('retry-after')).toBe('420');

    const otherClient = await handleSubmitComplaint(post(valid, { 'x-test-ip': '10.0.0.2' }), deps);
    expect(otherClient.status).toBe(201);
  });

  it('answers 503 when no database or salt is configured', async () => {
    expect((await handleSubmitComplaint(post(valid), makeDeps({ wall: null }))).status).toBe(503);
    const noSalt = makeDeps({ config: loadComplaintsApiConfig({}) });
    const response = await handleSubmitComplaint(post(valid), noSalt);
    expect(response.status).toBe(503);
    expect(await errorCode(response)).toBe('wall-unavailable');
  });
});

describe('GET /complaints', () => {
  const approveAll = async (count: number) => {
    for (let i = 0; i < count; i++) {
      await handleSubmitComplaint(post(valid, { 'x-test-ip': `10.1.0.${i}` }), deps);
      clock += 1000;
    }
    for (let i = 1; i <= count; i++) {
      expect((await moderate(`id-${String(i).padStart(4, '0')}`, 'approve')).status).toBe(200);
    }
  };

  it('pages approved complaints newest first with CDN cache headers', async () => {
    await approveAll(3);
    const first = await handleListWall(new Request(`${ORIGIN}/complaints?limit=2`), deps);
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('public, max-age=30');
    expect(first.headers.get('cdn-cache-control')).toContain('s-maxage=60');
    expect(first.headers.get('cache-tag')).toBe(WALL_CACHE_TAG);
    expect(first.headers.get('netlify-cache-tag')).toBe(WALL_CACHE_TAG);
    const page1 = (await first.json()) as WallPageResponse;
    expect(page1.items.map((c) => c.id)).toEqual(['id-0003', 'id-0002']);
    expect(page1.items[0]).not.toHaveProperty('status');
    expect(page1.nextCursor).toEqual(expect.any(String));

    const second = await handleListWall(
      new Request(`${ORIGIN}/complaints?limit=2&cursor=${page1.nextCursor ?? ''}`),
      deps
    );
    const page2 = (await second.json()) as WallPageResponse;
    expect(page2.items.map((c) => c.id)).toEqual(['id-0001']);
    expect(page2.nextCursor).toBeNull();
  });

  it('caps the page size and refuses bad parameters', async () => {
    await approveAll(1);
    expect((await handleListWall(new Request(`${ORIGIN}/complaints?limit=5000`), deps)).status).toBe(200);
    expect((await handleListWall(new Request(`${ORIGIN}/complaints?limit=0`), deps)).status).toBe(400);
    const bad = await handleListWall(new Request(`${ORIGIN}/complaints?cursor=bm9wZQ`), deps);
    expect(bad.status).toBe(400);
    expect(await errorCode(bad)).toBe('invalid-cursor');
  });

  it('answers 503 wall-unavailable without a database', async () => {
    const response = await handleListWall(new Request(`${ORIGIN}/complaints`), makeDeps({ wall: null }));
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

describe('moderation', () => {
  const list = (token: string | null, query = '') =>
    handleListModeration(
      new Request(`${ORIGIN}/moderation/complaints${query}`, {
        headers: token === null ? {} : { authorization: `Bearer ${token}` },
      }),
      deps
    );

  it('401s a missing or wrong token', async () => {
    const missing = await list(null);
    expect(missing.status).toBe(401);
    expect(missing.headers.get('www-authenticate')).toContain('Bearer');
    expect((await list('wrong-token')).status).toBe(401);
    expect((await list(`${TOKEN}x`)).status).toBe(401);
    expect((await moderate('id-0001', 'approve', 'nope')).status).toBe(401);
  });

  it('is disabled (503) when no token is configured', async () => {
    deps = makeDeps({ config: loadComplaintsApiConfig({ IP_HASH_SALT: 'unit-test-salt-unit-test-salt' }) });
    const response = await list(TOKEN);
    expect(response.status).toBe(503);
    expect(await errorCode(response)).toBe('moderation-disabled');
  });

  it('lists pending, approves, rejects and deletes', async () => {
    for (let i = 0; i < 3; i++) {
      await handleSubmitComplaint(post(valid, { 'x-test-ip': `10.2.0.${i}` }), deps);
      clock += 1000;
    }
    const queue = (await (await list(TOKEN)).json()) as ModerationPageResponse;
    expect(queue.items.map((c) => [c.id, c.status])).toEqual([
      ['id-0003', 'pending'],
      ['id-0002', 'pending'],
      ['id-0001', 'pending'],
    ]);

    const approved = (await (await moderate('id-0001', 'approve')).json()) as ModerationActionResponse;
    expect(approved.complaint.status).toBe('approved');
    expect((await moderate('id-0002', 'reject')).status).toBe(200);
    expect((await moderate('id-0001', 'delete')).status).toBe(200);

    // Rejected is final; approve after reject is a lifecycle conflict.
    expect((await moderate('id-0002', 'approve')).status).toBe(409);
    expect((await moderate('id-9999', 'approve')).status).toBe(404);
    expect((await moderate('id-0003', 'publish')).status).toBe(404);
    expect((await moderate('bad id!', 'approve')).status).toBe(404);

    const deleted = (await (await list(TOKEN, '?status=deleted')).json()) as ModerationPageResponse;
    expect(deleted.items.map((c) => c.id)).toEqual(['id-0001']);
    expect((await list(TOKEN, '?status=bogus')).status).toBe(400);
  });
});
