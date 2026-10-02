import { InMemoryComplaintRepository } from '@qa3elhamor/complaints-data-access';
import {
  DEFAULT_FAILED_REQUEST_LIMITS,
  InMemoryFailureLimiter,
  loadComplaintsApiConfig,
  noopCachePurger,
  type ComplaintsApiDeps,
} from '@qa3elhamor/complaints-feature-api';
import type { ApiErrorResponse } from '@qa3elhamor/shared-api-interfaces';
import { describe, expect, it, vi } from 'vitest';
import { loadApiConfig } from './api-config.js';
import { clientIpReader, createApi } from './create-api.js';
import { createRouter } from './router.js';

const BASE = 'https://reef.example';

const makeRouter = (overrides: Partial<ComplaintsApiDeps> = {}, env: Record<string, string> = {}) => {
  let seq = 0;
  const deps: ComplaintsApiDeps = {
    wall: { complaints: new InMemoryComplaintRepository() },
    config: loadComplaintsApiConfig({ IP_HASH_SALT: 'router-spec-salt-router-spec' }),
    now: () => new Date('2026-10-01T12:00:00.000Z'),
    newId: () => `r${++seq}`,
    clientIp: () => '127.0.0.1',
    reportError: vi.fn(),
    failureLimiter: new InMemoryFailureLimiter(DEFAULT_FAILED_REQUEST_LIMITS),
    cachePurger: noopCachePurger,
    ...overrides,
  };
  return { deps, handle: createRouter(deps, loadApiConfig(env)) };
};

const code = async (response: Response) => ((await response.json()) as ApiErrorResponse).error.code;

describe('router', () => {
  it('serves routes under the base path only', async () => {
    const { handle } = makeRouter();
    expect((await handle(new Request(`${BASE}/api/health`))).status).toBe(200);
    expect((await handle(new Request(`${BASE}/api/complaints`))).status).toBe(200);
    expect((await handle(new Request(`${BASE}/complaints`))).status).toBe(404);
    expect(await code(await handle(new Request(`${BASE}/api/nope`)))).toBe('not-found');
  });

  it('answers 405 with Allow for a known path and wrong method', async () => {
    const { handle } = makeRouter();
    const response = await handle(new Request(`${BASE}/api/complaints`, { method: 'DELETE' }));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, POST');
  });

  it('routes moderation actions with decoded params', async () => {
    const { handle } = makeRouter({
      config: loadComplaintsApiConfig({ MODERATION_TOKEN: 'router-spec-token-router-spec' }),
    });
    const response = await handle(
      new Request(`${BASE}/api/moderation/complaints/abc/approve`, {
        method: 'POST',
        headers: { authorization: 'Bearer router-spec-token-router-spec' },
      })
    );
    expect(response.status).toBe(404);
  });

  it('is same-origin by default and honours the allow-list', async () => {
    const closed = makeRouter().handle;
    const preflight = (origin: string) =>
      new Request(`${BASE}/api/complaints`, { method: 'OPTIONS', headers: { origin } });
    expect((await closed(preflight('https://evil.example'))).status).toBe(403);
    const crossPost = await closed(
      new Request(`${BASE}/api/complaints`, {
        method: 'POST',
        headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
        body: '{}',
      })
    );
    expect(crossPost.status).toBe(403);
    const sameOrigin = await closed(new Request(`${BASE}/api/complaints`, { headers: { origin: BASE } }));
    expect(sameOrigin.status).toBe(200);
    expect(sameOrigin.headers.get('access-control-allow-origin')).toBeNull();

    const open = makeRouter({}, { CORS_ALLOWED_ORIGINS: 'http://localhost:4200/' }).handle;
    const allowed = await open(preflight('http://localhost:4200'));
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:4200');
    expect(allowed.headers.get('access-control-allow-headers')).toContain('authorization');
    const get = await open(new Request(`${BASE}/api/complaints`, { headers: { origin: 'http://localhost:4200' } }));
    expect(get.headers.get('vary')).toBe('Origin');
  });

  it('turns an unexpected failure into a generic 500 and reports it', async () => {
    const failing = new InMemoryComplaintRepository();
    failing.listByStatus = () => Promise.reject(new Error('connection refused to 10.0.0.5:5432'));
    const { handle, deps } = makeRouter({
      wall: { complaints: failing },
    });
    const response = await handle(new Request(`${BASE}/api/complaints`));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toContain('internal-error');
    expect(text).not.toContain('10.0.0.5');
    expect(deps.reportError).toHaveBeenCalledOnce();
  });
});

describe('createApi without a database', () => {
  it('keeps health up and answers 503 wall-unavailable on wall routes', async () => {
    const api = createApi({});
    expect((await api.handle(new Request(`${BASE}/api/health`))).status).toBe(200);
    const list = await api.handle(new Request(`${BASE}/api/complaints`));
    expect(list.status).toBe(503);
    expect(await code(list)).toBe('wall-unavailable');
    const moderation = await api.handle(new Request(`${BASE}/api/moderation/complaints`));
    expect(await code(moderation)).toBe('moderation-disabled');
    await api.close();
  });
});

describe('security headers', () => {
  it('stamps them on every response, including health, 404, 405 and preflights', async () => {
    const { handle } = makeRouter({}, { CORS_ALLOWED_ORIGINS: 'http://localhost:4200' });
    const responses = [
      await handle(new Request(`${BASE}/api/health`)),
      await handle(new Request(`${BASE}/elsewhere`)),
      await handle(new Request(`${BASE}/api/nope`)),
      await handle(new Request(`${BASE}/api/complaints`, { method: 'DELETE' })),
      await handle(
        new Request(`${BASE}/api/complaints`, {
          method: 'OPTIONS',
          headers: { origin: 'http://localhost:4200' },
        })
      ),
      await handle(new Request(`${BASE}/api/moderation/complaints`)),
    ];
    for (const response of responses) {
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
      expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
      expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    }
  });
});

describe('client IP trust', () => {
  const request = (headers: Record<string, string>) =>
    new Request(`${BASE}/api/complaints`, { headers });

  it('reads the configured edge header, and refuses list-valued forwarding headers', () => {
    const read = clientIpReader(loadApiConfig({}));
    expect(read(request({ 'x-nf-client-connection-ip': ' 203.0.113.7 ' }))).toBe('203.0.113.7');
    expect(read(request({ 'x-forwarded-for': '203.0.113.7' }))).toBeNull();
    expect(() => loadApiConfig({ CLIENT_IP_HEADER: 'X-Forwarded-For' })).toThrow(/CLIENT_IP_HEADER/);
    expect(() => loadApiConfig({ CLIENT_IP_HEADER: 'forwarded' })).toThrow(/CLIENT_IP_HEADER/);
  });

  it('with EDGE_AUTH_SECRET, ignores the IP header on requests that bypassed the edge', () => {
    const secret = 'edge-proof-edge-proof-edge-proof';
    const config = loadApiConfig({ CLIENT_IP_HEADER: 'x-real-ip', EDGE_AUTH_SECRET: secret });
    const read = clientIpReader(config);
    expect(read(request({ 'x-real-ip': '203.0.113.7', 'x-edge-auth': secret }))).toBe('203.0.113.7');
    expect(read(request({ 'x-real-ip': '203.0.113.7' }))).toBeNull();
    expect(read(request({ 'x-real-ip': '203.0.113.7', 'x-edge-auth': 'guess' }))).toBeNull();
    expect(
      loadApiConfig({ EDGE_AUTH_SECRET: secret, EDGE_AUTH_HEADER: 'X-Proxy-Proof' }).edgeAuth?.header
    ).toBe('x-proxy-proof');
  });

  it('refuses a short edge secret without echoing it', () => {
    expect(() => loadApiConfig({ EDGE_AUTH_SECRET: 'short-proof' })).toThrow(/EDGE_AUTH_SECRET must be/);
    try {
      loadApiConfig({ EDGE_AUTH_SECRET: 'short-proof' });
    } catch (error) {
      expect(String(error)).not.toContain('short-proof');
    }
  });

  it('answers 503 to a forged submission that did not come through the edge', async () => {
    const secret = 'edge-proof-edge-proof-edge-proof';
    const config = loadApiConfig({ EDGE_AUTH_SECRET: secret });
    const { handle } = makeRouter({ clientIp: clientIpReader(config) }, { EDGE_AUTH_SECRET: secret });
    const submit = (headers: Record<string, string>) =>
      handle(
        new Request(`${BASE}/api/complaints`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({ subject: 'Noise', body: 'Again.', senderName: 'Patrick' }),
        })
      );
    const forged = await submit({ 'x-nf-client-connection-ip': '198.51.100.1' });
    expect(forged.status).toBe(503);
    expect(await code(forged)).toBe('client-ip-unavailable');
    const viaEdge = await submit({ 'x-nf-client-connection-ip': '198.51.100.1', 'x-edge-auth': secret });
    expect(viaEdge.status).toBe(201);
  });
});
