import { InMemoryComplaintRepository } from '@qa3elhamor/complaints-data-access';
import {
  loadComplaintsApiConfig,
  type ComplaintsApiDeps,
} from '@qa3elhamor/complaints-feature-api';
import type { ApiErrorResponse } from '@qa3elhamor/shared-api-interfaces';
import { describe, expect, it, vi } from 'vitest';
import { loadApiConfig } from './api-config.js';
import { createApi } from './create-api.js';
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
