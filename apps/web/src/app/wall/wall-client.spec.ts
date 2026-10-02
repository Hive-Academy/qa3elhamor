import type { WallComplaint } from '@qa3elhamor/shared-api-interfaces';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyWallResponse, createWallClient } from './wall-client';
import { readWallApiUrl } from './wall-env';

const note = (id: string, extra: Partial<WallComplaint> = {}): WallComplaint => ({
  id,
  subject: `Subject ${id}`,
  body: 'The current is too strong.',
  senderName: 'Sam',
  senderSpecies: 'sardine',
  submittedAt: '2026-09-30T10:00:00.000Z',
  ...extra,
});

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const clientWith = (fetch: typeof globalThis.fetch, timeoutMs?: number) =>
  createWallClient({ baseUrl: 'https://wall.example.org/api/', fetch, timeoutMs });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('readWallApiUrl: off unless a usable API root is set', () => {
  it.each([undefined, '', '   ', 42])('is off for %j', (raw) => {
    expect(readWallApiUrl(raw)).toBeNull();
  });

  it.each([
    ['/api', '/api'],
    ['/api/', '/api'],
    ['https://wall.example.org/api', 'https://wall.example.org/api'],
    ['http://localhost:8787/api/', 'http://localhost:8787/api'],
  ])('accepts %s', (raw, root) => {
    expect(readWallApiUrl(raw)).toBe(root);
  });

  it.each([
    '//evil.example/api',
    'http://wall.example.org/api',
    'javascript:alert(1)',
    'https://user:pw@wall.example.org/api',
    'not a url',
  ])('refuses %s (and warns once)', (raw) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(readWallApiUrl(raw)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('WallClient.list: cursor paging', () => {
  it('asks for the first page, anonymously, then passes the cursor back', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(200, { items: [note('a')], nextCursor: 'CUR_1' }))
      .mockResolvedValueOnce(json(200, { items: [note('b')], nextCursor: null }));
    const client = clientWith(fetch);

    const first = await client.list();
    expect(first).toEqual({ ok: true, value: { items: [note('a')], nextCursor: 'CUR_1' } });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://wall.example.org/api/complaints?limit=6');
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer' });

    const second = await client.list({ cursor: 'CUR_1' });
    expect(fetch.mock.calls[1][0]).toBe(
      'https://wall.example.org/api/complaints?limit=6&cursor=CUR_1',
    );
    expect(second.ok && second.value.nextCursor).toBeNull();
  });

  it('drops items that do not have the wall shape, and extra fields on good ones', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      json(200, {
        items: [
          { ...note('a'), status: 'approved', replyEmail: 'leak@example.org' },
          { id: 'b', subject: 3 },
          null,
        ],
        nextCursor: null,
      }),
    );
    const result = await clientWith(fetch).list();
    expect(result).toEqual({ ok: true, value: { items: [note('a')], nextCursor: null } });
  });

  it('fails a page whose items are all unreadable, rather than showing an empty wall', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      json(200, {
        items: [
          { ...note('a'), submittedAt: undefined, created_at: '2026-09-30T10:00:00.000Z' },
          { ...note('b'), submittedAt: 'yesterday' },
        ],
        nextCursor: null,
      }),
    );
    expect(await clientWith(fetch).list()).toMatchObject({
      ok: false,
      failure: { kind: 'unexpected', status: 200 },
    });
    // A truly empty wall is still a page.
    fetch.mockResolvedValue(json(200, { items: [], nextCursor: null }));
    expect(await clientWith(fetch).list()).toEqual({
      ok: true,
      value: { items: [], nextCursor: null },
    });
  });

  it('treats a body that is not a page as unexpected', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json(200, { items: 'no' }));
    const result = await clientWith(fetch).list();
    expect(result).toMatchObject({ ok: false, failure: { kind: 'unexpected', status: 200 } });
  });

  it('maps a stale cursor and an unavailable wall', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(400, { error: { code: 'invalid-cursor', message: 'x' } }))
      .mockResolvedValueOnce(json(503, { error: { code: 'wall-unavailable', message: 'x' } }));
    const client = clientWith(fetch);
    expect(await client.list({ cursor: 'bad' })).toMatchObject({
      ok: false,
      failure: { kind: 'invalid-cursor', code: 'invalid-cursor' },
    });
    expect(await client.list()).toMatchObject({
      ok: false,
      failure: { kind: 'unavailable', status: 503 },
    });
  });

  it('reports a network failure without throwing', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('offline'));
    expect(await clientWith(fetch).list()).toMatchObject({
      ok: false,
      failure: { kind: 'network', status: null },
    });
  });

  it('times out a request that never answers', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>(() => undefined));
    const pending = clientWith(fetch, 1000).list();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ ok: false, failure: { kind: 'timeout' } });
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('times out a body that stalls after the headers', async () => {
    vi.useFakeTimers();
    const stalled = new Response(new ReadableStream({ start: () => undefined }), { status: 200 });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(stalled);
    const pending = clientWith(fetch, 1000).list();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ ok: false, failure: { kind: 'timeout' } });
  });

  it("is cancelled by the caller's signal, and reports it as aborted", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>(() => undefined));
    const controller = new AbortController();
    const pending = clientWith(fetch).list({ signal: controller.signal });
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, failure: { kind: 'aborted' } });
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);

    const already = await clientWith(fetch).list({ signal: controller.signal });
    expect(already).toMatchObject({ ok: false, failure: { kind: 'aborted' } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('WallClient.submit: a public complaint', () => {
  it('posts exactly the four fields the API accepts, uncached', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(json(201, { id: 'c-1', status: 'pending' }));
    const draft = {
      subject: 'Leaky pineapple',
      body: 'Drip.',
      senderName: 'Sam',
      senderSpecies: null,
      replyEmail: 'never@example.org',
      visibility: 'public',
    };
    const result = await clientWith(fetch).submit(draft);
    expect(result).toEqual({ ok: true, value: { id: 'c-1', status: 'pending' } });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://wall.example.org/api/complaints');
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store', credentials: 'omit' });
    expect(JSON.parse(String(init?.body))).toEqual({
      subject: 'Leaky pineapple',
      body: 'Drip.',
      senderName: 'Sam',
      senderSpecies: null,
    });
  });

  it('maps refusals, rate limits (with Retry-After) and unexpected answers', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(400, { error: { code: 'invalid-complaint', message: 'x' } }))
      .mockResolvedValueOnce(
        json(429, { error: { code: 'rate-limited', message: 'x' } }, { 'retry-after': '120' }),
      )
      .mockResolvedValueOnce(json(201, { id: 'c-1', status: 'approved' }))
      .mockResolvedValueOnce(new Response('<html>oops</html>', { status: 500 }));
    const client = clientWith(fetch);
    const draft = { subject: 's', body: 'b', senderName: 'n', senderSpecies: null };
    expect(await client.submit(draft)).toMatchObject({ failure: { kind: 'refused' } });
    expect(await client.submit(draft)).toMatchObject({
      failure: { kind: 'rate-limited', retryAfterSeconds: 120 },
    });
    expect(await client.submit(draft)).toMatchObject({ failure: { kind: 'unexpected' } });
    expect(await client.submit(draft)).toMatchObject({
      failure: { kind: 'unexpected', status: 500, code: null },
    });
  });
});

describe('classifyWallResponse', () => {
  it('treats a forbidden origin as the wall being unavailable here', () => {
    expect(classifyWallResponse(403, { error: { code: 'forbidden-origin' } }).kind).toBe(
      'unavailable',
    );
  });

  it('ignores a Retry-After that is not plain seconds', () => {
    expect(classifyWallResponse(429, null, 'tomorrow')).toEqual({
      kind: 'rate-limited',
      status: 429,
      code: null,
    });
  });
});
