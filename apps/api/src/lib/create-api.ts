import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaComplaintRepository } from '@qa3elhamor/complaints-data-access';
import {
  loadComplaintsApiConfig,
  type ComplaintsApiDeps,
} from '@qa3elhamor/complaints-feature-api';
import { loadApiConfig, type ApiConfig } from './api-config.js';
import { createRouter, type ApiHandler } from './router.js';

export interface Api {
  readonly handle: ApiHandler;
  readonly config: ApiConfig;
  /** Releases the database pool, if one was opened. */
  readonly close: () => Promise<void>;
}

/**
 * The composition root. Builds everything from environment variables once per process (a
 * warm serverless instance reuses it). With no `DATABASE_URL` the wall is simply absent: the
 * wall endpoints answer 503 `wall-unavailable` and `/health` still works, so the site builds
 * and deploys without a database. Misconfigured secrets throw here, at startup.
 */
export const createApi = (env: Readonly<Record<string, string | undefined>>): Api => {
  const config = loadApiConfig(env);
  const prisma = config.databaseUrl === null ? null : createPrismaClient(config.databaseUrl);
  // The function log is private to the operator; clients only ever see `internal-error`.
  const reportError = (error: unknown) => console.error('[api] unexpected error', error);
  const deps: ComplaintsApiDeps = {
    wall:
      prisma === null
        ? null
        : { complaints: new PrismaComplaintRepository(prisma, { onPruneError: reportError }) },
    config: loadComplaintsApiConfig(env),
    now: () => new Date(),
    newId: () => randomUUID(),
    clientIp: (request) => request.headers.get(config.clientIpHeader)?.trim() || null,
    reportError,
  };
  return {
    handle: createRouter(deps, config),
    config,
    close: async () => {
      await prisma?.$disconnect();
    },
  };
};
