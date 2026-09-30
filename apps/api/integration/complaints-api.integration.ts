import { randomUUID } from 'node:crypto';
import {
  createPrismaClient,
  PrismaComplaintRepository,
} from '@qa3elhamor/complaints-data-access';
import { loadComplaintsApiConfig } from '@qa3elhamor/complaints-feature-api';
import type {
  ApiErrorResponse,
  ModerationActionResponse,
  ModerationPageResponse,
  SubmitComplaintResponse,
  WallPageResponse,
} from '@qa3elhamor/shared-api-interfaces';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadApiConfig } from '../src/lib/api-config.js';
import { createApi } from '../src/lib/create-api.js';
import { createRouter, type ApiHandler } from '../src/lib/router.js';
import { INTEGRATION_DATABASE_URL } from './database-url.js';

const TOKEN = 'integration-moderation-token-0123';
const ORIGIN = 'http://localhost:8787';

const api = createApi({
  DATABASE_URL: INTEGRATION_DATABASE_URL,
  IP_HASH_SALT: 'integration-salt-integration-salt',
  MODERATION_TOKEN: TOKEN,
  RATE_LIMITS: '3/600,20/86400',
});
const db = createPrismaClient(INTEGRATION_DATABASE_URL);

const submit = (ip: string, body: unknown = {
  subject: 'Bubbles',
  body: 'The neighbour blows bubbles at 3 a.m.',
  senderName: 'Squidward',
  senderSpecies: 'octopus',
}) =>
  api.handle(
    new Request(`${ORIGIN}/api/complaints`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': ip },
      body: JSON.stringify(body),
    })
  );

const moderation = (path: string, init: RequestInit = {}, token: string | null = TOKEN) =>
  api.handle(
    new Request(`${ORIGIN}/api/moderation${path}`, {
      ...init,
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
    })
  );

const wall = async (query = '') =>
  (await (await api.handle(new Request(`${ORIGIN}/api/complaints${query}`))).json()) as WallPageResponse;

/** A router over a Prisma repository with test-controlled options, ids and error sink. */
const routerWith = (options: {
  readonly pruneProbability?: number;
  readonly newId?: () => string;
  readonly reportError?: (error: unknown) => void;
}): ApiHandler => {
  const reportError = options.reportError ?? (() => undefined);
  return createRouter(
    {
      wall: {
        complaints: new PrismaComplaintRepository(db, {
          pruneProbability: options.pruneProbability ?? 0,
          onPruneError: reportError,
        }),
      },
      config: loadComplaintsApiConfig({
        IP_HASH_SALT: 'integration-salt-integration-salt',
        RATE_LIMITS: '3/600,20/86400',
      }),
      now: () => new Date(),
      newId: options.newId ?? (() => randomUUID()),
      clientIp: (request) => request.headers.get('x-nf-client-connection-ip'),
      reportError,
    },
    loadApiConfig({})
  );
};

const submitVia = (handle: ApiHandler, ip: string) =>
  handle(
    new Request(`${ORIGIN}/api/complaints`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': ip },
      body: JSON.stringify({ subject: 'Load', body: 'Concurrency check.', senderName: 'Karen' }),
    })
  );

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE TABLE complaint, submission_log');
});

afterAll(async () => {
  await db.$disconnect();
  await api.close();
});

describe('complaints API against Postgres', () => {
  it('submit -> moderate -> wall, end to end', async () => {
    const created = await submit('198.51.100.1');
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as SubmitComplaintResponse;

    // Pending complaints are not on the wall.
    expect((await wall()).items).toEqual([]);

    const queue = (await (await moderation('/complaints')).json()) as ModerationPageResponse;
    expect(queue.items.map((c) => [c.id, c.status])).toEqual([[id, 'pending']]);

    const approved = await moderation(`/complaints/${id}/approve`, { method: 'POST' });
    expect(approved.status).toBe(200);
    expect(((await approved.json()) as ModerationActionResponse).complaint.status).toBe('approved');

    const listed = await api.handle(new Request(`${ORIGIN}/api/complaints`));
    expect(listed.headers.get('cache-control')).toBe('public, max-age=30');
    const page = (await listed.json()) as WallPageResponse;
    expect(page.items).toEqual([
      expect.objectContaining({ id, subject: 'Bubbles', senderSpecies: 'octopus' }),
    ]);

    // Deleting takes it off the wall; a deleted complaint cannot be approved again.
    expect((await moderation(`/complaints/${id}/delete`, { method: 'POST' })).status).toBe(200);
    expect((await wall()).items).toEqual([]);
    expect((await moderation(`/complaints/${id}/approve`, { method: 'POST' })).status).toBe(409);
  });

  it('rejects, and paginates the wall newest first', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const response = await submit(`198.51.100.${10 + i}`);
      ids.push(((await response.json()) as SubmitComplaintResponse).id);
      // Distinct millisecond timestamps keep the expected order unambiguous.
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const [rejected, ...rest] = ids;
    expect((await moderation(`/complaints/${rejected}/reject`, { method: 'POST' })).status).toBe(200);
    for (const id of rest) {
      expect((await moderation(`/complaints/${id}/approve`, { method: 'POST' })).status).toBe(200);
    }

    const first = await wall('?limit=3');
    expect(first.items.map((c) => c.id)).toEqual([...rest].reverse().slice(0, 3));
    expect(first.nextCursor).not.toBeNull();
    const second = await wall(`?limit=3&cursor=${first.nextCursor ?? ''}`);
    expect(second.items.map((c) => c.id)).toEqual([rest[0]]);
    expect(second.nextCursor).toBeNull();

    const rejectedList = (await (await moderation('/complaints?status=rejected')).json()) as ModerationPageResponse;
    expect(rejectedList.items.map((c) => c.id)).toEqual([rejected]);
  });

  it('rate limits abusive submission rates per client, even when concurrent', async () => {
    const burst = await Promise.all(Array.from({ length: 6 }, () => submit('203.0.113.9')));
    const statuses = burst.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 201, 201, 429, 429, 429]);

    const limited = burst.find((r) => r.status === 429);
    const retryAfter = Number(limited?.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(600);
    expect(((await limited?.json()) as ApiErrorResponse).error.code).toBe('rate-limited');

    // Another client is unaffected, and no raw IP reached the database.
    expect((await submit('203.0.113.10')).status).toBe(201);
    const keys = await db.submissionLog.findMany({ select: { clientKey: true } });
    expect(keys).toHaveLength(4);
    for (const { clientKey } of keys) {
      expect(clientKey).toMatch(/^[0-9a-f]{64}$/);
      expect(clientKey).not.toContain('203.0.113');
    }
    expect(await db.complaint.count()).toBe(4);
  });

  it('refuses invalid submissions without writing anything', async () => {
    const invalid = await submit('198.51.100.50', { subject: '', body: 'x', senderName: 'Plankton' });
    expect(invalid.status).toBe(400);
    const oversized = await submit('198.51.100.50', {
      subject: 'Long',
      body: 'x'.repeat(10_000),
      senderName: 'Plankton',
    });
    expect(oversized.status).toBe(413);
    expect(await db.complaint.count()).toBe(0);
    expect(await db.submissionLog.count()).toBe(0);
  });

  it('401s moderation without a valid token', async () => {
    const created = (await (await submit('198.51.100.60')).json()) as SubmitComplaintResponse;
    expect((await moderation('/complaints', {}, null)).status).toBe(401);
    expect((await moderation('/complaints', {}, 'not-the-token-not-the-token')).status).toBe(401);
    const forged = await moderation(`/complaints/${created.id}/approve`, { method: 'POST' }, 'forged-forged-forged-forged');
    expect(forged.status).toBe(401);
    expect(((await forged.json()) as ApiErrorResponse).error.code).toBe('unauthorized');
    const row = await db.complaint.findUnique({ where: { id: created.id } });
    expect(row?.status).toBe('pending');
  });

  it('does not spend quota when the insert fails (limit check and insert share a transaction)', async () => {
    let nextId = 'fixed-id';
    const reportError = vi.fn();
    const handle = routerWith({ newId: () => nextId, reportError });
    expect((await submitVia(handle, '198.51.100.70')).status).toBe(201);
    // Same id again: the primary key refuses the insert, three times over.
    for (let i = 0; i < 3; i++) expect((await submitVia(handle, '198.51.100.70')).status).toBe(500);
    expect(reportError).toHaveBeenCalledTimes(3);
    expect(await db.submissionLog.count()).toBe(1);

    // The failures cost nothing: two more fit under 3/10 min, then the limit applies.
    nextId = 'second-id';
    expect((await submitVia(handle, '198.51.100.70')).status).toBe(201);
    nextId = 'third-id';
    expect((await submitVia(handle, '198.51.100.70')).status).toBe(201);
    nextId = 'fourth-id';
    expect((await submitVia(handle, '198.51.100.70')).status).toBe(429);
    expect(await db.complaint.count()).toBe(3);
  });

  it('never makes one client wait on another client (no global lock or delete on the hot path)', async () => {
    const otherKey = 'a'.repeat(64);
    await db.submissionLog.create({
      data: { clientKey: otherKey, submittedAt: new Date(Date.now() - 3 * 86_400_000) },
    });

    // Another client's submission transaction is mid-flight: it holds that client's advisory
    // lock and row locks on its (expired) log rows, and does not commit until released.
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let signalLocked = (): void => undefined;
    const locked = new Promise<void>((resolve) => (signalLocked = resolve));
    const holder = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${otherKey}))`;
        await tx.$queryRaw`SELECT id FROM submission_log WHERE client_key = ${otherKey} FOR UPDATE`;
        signalLocked();
        await gate;
      },
      { timeout: 30_000, maxWait: 10_000 }
    );
    await locked;

    // Force the global prune on every submission: it must skip the locked rows, not wait.
    const handle = routerWith({ pruneProbability: 1 });
    const started = Date.now();
    const timeout = new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 5000));
    const outcome = await Promise.race([submitVia(handle, '198.51.100.80'), timeout]);
    const elapsed = Date.now() - started;
    release();
    await holder;

    expect(outcome).not.toBe('timed-out');
    expect((outcome as Response).status).toBe(201);
    expect(elapsed).toBeLessThan(2000);

    // Once released, the next prune removes the abandoned key's expired row.
    expect((await submitVia(handle, '198.51.100.81')).status).toBe(201);
    expect(await db.submissionLog.count({ where: { clientKey: otherKey } })).toBe(0);
  });

  it('serves a concurrent burst from many clients without errors', async () => {
    const handle = routerWith({ pruneProbability: 1 });
    const burst = await Promise.all(
      Array.from({ length: 60 }, (_, i) => submitVia(handle, `2001:db8:${i % 20}::${i}`))
    );
    // 20 distinct /64s x 3 each: all accepted, none failed on locks or deadlocks.
    expect(burst.map((r) => r.status).filter((s) => s !== 201)).toEqual([]);
    const fourth = await submitVia(handle, '2001:db8:7::ffff');
    expect(fourth.status).toBe(429);
  });

  it('the database refuses a private complaint even if code tried to store one', async () => {
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO complaint (id, visibility, status, subject, body, sender_name, submitted_at, updated_at)
         VALUES ('x', 'private', 'pending', 's', 'b', 'n', now(), now())`
      )
    ).rejects.toThrow();
  });
});
