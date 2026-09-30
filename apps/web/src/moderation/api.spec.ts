import type { ModerationComplaint } from '@qa3elhamor/shared-api-interfaces';
import { describe, expect, it, vi } from 'vitest';
import { createModerationClient } from './api';

const TOKEN = 'secret-moderation-token-0123456789';

const complaint: ModerationComplaint = {
  id: '0b8e7a3c-0000-4000-8000-000000000001',
  subject: 'Too many sardines',
  body: 'Line one\nLine two',
  senderName: 'Hamour',
  senderSpecies: 'grouper',
  submittedAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  status: 'pending',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const errorBody = (code: string) => ({ error: { code, message: 'x' } });

const clientWith = (response: Response | Error) => {
  const fetchMock = vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  return { fetchMock, client: createModerationClient({ token: TOKEN, fetch: fetchMock }) };
};

describe('createModerationClient', () => {
  it('lists a status with the bearer token in the header and never in the URL', async () => {
    const { client, fetchMock } = clientWith(json(200, { items: [complaint], nextCursor: 'c2' }));

    const result = await client.list('pending', 'c1');

    expect(result).toEqual({ ok: true, value: { items: [complaint], nextCursor: 'c2' } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/moderation/complaints?status=pending&cursor=c1');
    expect(String(url)).not.toContain(TOKEN);
    expect((init?.headers as Record<string, string>)['authorization']).toBe(`Bearer ${TOKEN}`);
    expect(init?.method).toBe('GET');
  });

  it('posts an action and returns the moderated complaint', async () => {
    const approved = { ...complaint, status: 'approved' };
    const { client, fetchMock } = clientWith(json(200, { complaint: approved }));

    const result = await client.act(complaint.id, 'approve');

    expect(result).toEqual({ ok: true, value: approved });
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/moderation/complaints/${complaint.id}/approve`);
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
  });

  it.each([
    [401, 'unauthorized', 'unauthorized'],
    [409, 'conflict', 'conflict'],
    [404, 'not-found', 'not-found'],
    [400, 'invalid-cursor', 'invalid-cursor'],
    [400, 'invalid-request', 'unexpected'],
    [503, 'moderation-disabled', 'disabled'],
    [503, 'wall-unavailable', 'unavailable'],
    [500, 'internal-error', 'unexpected'],
  ] as const)('maps HTTP %i %s to the %s failure', async (status, code, kind) => {
    const { client } = clientWith(json(status, errorBody(code)));

    const result = await client.act(complaint.id, 'reject');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe(kind);
      expect(result.failure.status).toBe(status);
      expect(result.failure.message).not.toContain(TOKEN);
    }
  });

  it('treats a 401 with a non-JSON body as unauthorized', async () => {
    const { client } = clientWith(new Response('nope', { status: 401 }));
    const result = await client.list('pending');
    expect(!result.ok && result.failure.kind).toBe('unauthorized');
  });

  it('reports a network failure without throwing', async () => {
    const { client } = clientWith(new TypeError('Failed to fetch'));
    const result = await client.list('approved');
    expect(result).toEqual({ ok: false, failure: expect.objectContaining({ kind: 'network', status: null }) });
  });

  it('gives up on a request that never answers and reports a timeout', async () => {
    const hang = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        })
    );
    const client = createModerationClient({ token: TOKEN, fetch: hang, timeoutMs: 20 });

    const result = await client.list('pending');

    expect(!result.ok && result.failure.kind).toBe('timeout');
  });

  it('rejects a 200 whose body does not match the contract', async () => {
    const { client } = clientWith(json(200, { items: [{ id: 1 }], nextCursor: null }));
    const result = await client.list('pending');
    expect(!result.ok && result.failure.kind).toBe('unexpected');
  });
});
