import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaComplaintRepository } from '@qa3elhamor/complaints-data-access';
import {
  InMemoryFailureLimiter,
  loadComplaintsApiConfig,
  noopCachePurger,
  secretMatches,
  type ComplaintsApiDeps,
} from '@qa3elhamor/complaints-feature-api';
import { loadApiConfig, type ApiConfig } from './api-config.js';

/**
 * The client IP as the trusted edge reported it, or `null`. With `EDGE_AUTH_SECRET` set, a
 * request that does not carry the edge's secret header did not come through the edge, so its
 * IP header is attacker-chosen and ignored (the submit handler then refuses it with 503).
 */
export const clientIpReader =
  (config: ApiConfig) =>
  (request: Request): string | null => {
    if (config.edgeAuth !== null) {
      const proof = request.headers.get(config.edgeAuth.header);
      if (!secretMatches(proof, config.edgeAuth.secret)) return null;
    }
    return request.headers.get(config.clientIpHeader)?.trim() || null;
  };
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
  const complaintsConfig = loadComplaintsApiConfig(env);
  const deps: ComplaintsApiDeps = {
    wall:
      prisma === null
        ? null
        : { complaints: new PrismaComplaintRepository(prisma, { onPruneError: reportError }) },
    config: complaintsConfig,
    now: () => new Date(),
    newId: () => randomUUID(),
    clientIp: clientIpReader(config),
    reportError,
    failureLimiter: new InMemoryFailureLimiter(complaintsConfig.failedRequestLimits),
    // No shared cache in front of the API by default. A CDN deployment swaps in its purge
    // call here (docs/security.md, "CDN purge").
    cachePurger: noopCachePurger,
  };
  return {
    handle: createRouter(deps, config),
    config,
    close: async () => {
      await prisma?.$disconnect();
    },
  };
};
