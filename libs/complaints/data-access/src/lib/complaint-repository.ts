import type { ComplaintId, PublicComplaint, PublicStatus } from '@qa3elhamor/complaints-domain';
import type { RateLimitDecision, RateLimitRule } from './submission-rate-limiter.js';

/**
 * A position in a newest-first listing: the last item already returned. Listings order by
 * `submittedAt` descending, then `id` descending, so the pair is a total, stable order.
 */
export interface ComplaintCursor {
  /** ISO-8601 instant. */
  readonly submittedAt: string;
  readonly id: string;
}

export interface ListComplaintsQuery {
  readonly status: PublicStatus;
  /** Maximum items to return; the caller caps it. */
  readonly limit: number;
  /** Return only items strictly after this position; `null` starts from the newest. */
  readonly after: ComplaintCursor | null;
}

export interface ComplaintPage {
  readonly items: readonly PublicComplaint[];
  /** Pass back as `after` for the next page; `null` when this page is the last. */
  readonly nextCursor: ComplaintCursor | null;
}

/**
 * Persistence for the public wall. Only public complaints are stored: private complaints go
 * to the form service and never reach this port. Every row read back is re-validated through
 * `restoreComplaint`, so storage is never trusted.
 */
export interface ComplaintRepository {
  /**
   * Files a new complaint under the per-client submission limits, atomically: the limit check,
   * the submission-log entry and the complaint insert commit together or not at all. A refused
   * attempt records nothing (hammering a 429 does not push the reset out), and a failed insert
   * rolls the log entry back, so a server error never costs the client quota. Concurrent
   * submissions from one `clientKey` are serialised; different keys never wait on each other.
   *
   * `clientKey` is already a salted hash of the client's address; only it and a timestamp are
   * stored.
   */
  submitRateLimited(
    complaint: PublicComplaint,
    clientKey: string,
    rules: readonly RateLimitRule[]
  ): Promise<RateLimitDecision>;

  findById(id: ComplaintId): Promise<PublicComplaint | null>;

  /**
   * Persists a transition only if the stored row is still exactly `previous` (same status and
   * `updatedAt`). Returns `false` when a concurrent moderator changed it first, so two
   * decisions on the same complaint cannot both win.
   */
  saveTransition(previous: PublicComplaint, next: PublicComplaint): Promise<boolean>;

  listByStatus(query: ListComplaintsQuery): Promise<ComplaintPage>;
}

/** A stored row failed re-validation. Carries the id only, never the row's content. */
export class CorruptComplaintRecordError extends Error {
  constructor(readonly complaintId: string) {
    super(`Stored complaint ${complaintId} failed validation`);
    this.name = 'CorruptComplaintRecordError';
  }
}

/** Newest-first order shared by every implementation: `submittedAt` desc, then `id` desc. */
export const compareNewestFirst = (
  a: { readonly submittedAt: string; readonly id: string },
  b: { readonly submittedAt: string; readonly id: string }
): number => {
  const byTime = Date.parse(b.submittedAt) - Date.parse(a.submittedAt);
  if (byTime !== 0) return byTime;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
};

/** True when `item` comes strictly after `cursor` in newest-first order. */
export const isAfterCursor = (
  item: { readonly submittedAt: string; readonly id: string },
  cursor: ComplaintCursor
): boolean => compareNewestFirst(cursor, item) < 0;
