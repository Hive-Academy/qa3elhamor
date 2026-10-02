import type { ComplaintRepository } from '@qa3elhamor/complaints-data-access';
import type { PublicComplaint } from '@qa3elhamor/complaints-domain';
import type {
  ModerationComplaint,
  WallComplaint,
} from '@qa3elhamor/shared-api-interfaces';
import type { CachePurger } from './cache-purger.js';
import type { ComplaintsApiConfig } from './config.js';
import type { FailureLimiter } from './failure-limiter.js';

/** The wall's persistence. Present only when a database is configured. */
export interface WallStores {
  readonly complaints: ComplaintRepository;
}

/**
 * Everything a handler needs, supplied by the composition root (`apps/api`). Handlers are
 * `(request, deps) => Promise<Response>` over the Fetch API, so a hosting adapter only has to
 * build `deps` once per warm instance and pass requests through.
 */
export interface ComplaintsApiDeps {
  /** `null` when no database is configured: wall endpoints answer 503. */
  readonly wall: WallStores | null;
  readonly config: ComplaintsApiConfig;
  readonly now: () => Date;
  /** Mints complaint ids (the domain never does); must satisfy `complaintId`. */
  readonly newId: () => string;
  /**
   * The client IP as established by the hosting platform (never a client-controlled header
   * such as a raw `X-Forwarded-For`), or `null` when unknown. Normalised by the handler
   * (IPv6 -> /64, IPv4-mapped -> IPv4); anything that is not an IP counts as unknown.
   */
  readonly clientIp: (request: Request) => string | null;
  /** Receives unexpected failures; the client only ever sees `internal-error`. */
  readonly reportError: (error: unknown) => void;
  /**
   * Counts refused requests per client and throttles repeat offenders (one instance per warm
   * process, built from `config.failedRequestLimits`).
   */
  readonly failureLimiter: FailureLimiter;
  /** Purges the public wall from shared caches when moderation withdraws a complaint. */
  readonly cachePurger: CachePurger;
}

export const toWallComplaint = (complaint: PublicComplaint): WallComplaint => ({
  id: complaint.id,
  subject: complaint.subject.value,
  body: complaint.body.value,
  senderName: complaint.sender.name.value,
  senderSpecies: complaint.sender.species?.value ?? null,
  submittedAt: complaint.submittedAt,
});

export const toModerationComplaint = (complaint: PublicComplaint): ModerationComplaint => ({
  ...toWallComplaint(complaint),
  status: complaint.status,
  updatedAt: complaint.updatedAt,
});
