import {
  restoreComplaint,
  toSnapshot,
  type ComplaintId,
  type ComplaintSnapshot,
  type PublicComplaint,
} from '@qa3elhamor/complaints-domain';
import {
  compareNewestFirst,
  CorruptComplaintRecordError,
  isAfterCursor,
  type ComplaintPage,
  type ComplaintRepository,
  type ListComplaintsQuery,
} from './complaint-repository.js';
import {
  evaluateRateLimit,
  longestWindowMs,
  type RateLimitDecision,
  type RateLimitRule,
} from './submission-rate-limiter.js';

/**
 * In-process repository for unit tests and database-less local runs. Stores snapshots (not
 * live aggregates) and restores on read, so it exercises the same round trip as Prisma.
 * Single-threaded JS makes each `submitRateLimited` call atomic on its own.
 */
export class InMemoryComplaintRepository implements ComplaintRepository {
  private readonly rows = new Map<string, ComplaintSnapshot>();
  private readonly submissionLog = new Map<string, Date[]>();

  async submitRateLimited(
    complaint: PublicComplaint,
    clientKey: string,
    rules: readonly RateLimitRule[]
  ): Promise<RateLimitDecision> {
    const now = new Date(complaint.submittedAt);
    const horizon = now.getTime() - longestWindowMs(rules);
    const history = (this.submissionLog.get(clientKey) ?? []).filter(
      (d) => d.getTime() > horizon
    );
    const decision = evaluateRateLimit(history, now, rules);
    if (decision.allowed) {
      // Insert before recording, so a failed insert leaves the quota untouched.
      if (this.rows.has(complaint.id)) {
        throw new Error(`Complaint ${complaint.id} already exists`);
      }
      this.rows.set(complaint.id, toSnapshot(complaint));
      history.push(now);
    }
    this.submissionLog.set(clientKey, history);
    return decision;
  }

  async findById(id: ComplaintId): Promise<PublicComplaint | null> {
    const row = this.rows.get(id);
    return row === undefined ? null : restorePublic(row);
  }

  async saveTransition(previous: PublicComplaint, next: PublicComplaint): Promise<boolean> {
    const row = this.rows.get(previous.id);
    if (row === undefined || row.status !== previous.status || row.updatedAt !== previous.updatedAt) {
      return false;
    }
    this.rows.set(next.id, toSnapshot(next));
    return true;
  }

  async listByStatus(query: ListComplaintsQuery): Promise<ComplaintPage> {
    const { after } = query;
    const matching = [...this.rows.values()]
      .filter((row) => row.status === query.status)
      .filter((row) => after === null || isAfterCursor(row, after))
      .sort(compareNewestFirst);
    const page = matching.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      items: page.map(restorePublic),
      nextCursor:
        matching.length > query.limit && last !== undefined
          ? { submittedAt: last.submittedAt, id: last.id }
          : null,
    };
  }
}

const restorePublic = (row: ComplaintSnapshot): PublicComplaint => {
  const restored = restoreComplaint(row);
  if (!restored.ok || restored.value.visibility !== 'public') {
    throw new CorruptComplaintRecordError(row.id);
  }
  return restored.value;
};
