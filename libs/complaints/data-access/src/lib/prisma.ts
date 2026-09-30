import { PrismaPg } from '@prisma/adapter-pg';
import {
  restoreComplaint,
  toSnapshot,
  type ComplaintId,
  type PublicComplaint,
} from '@qa3elhamor/complaints-domain';
import { PrismaClient, type Complaint as ComplaintRow } from '../generated/prisma/client.js';
import {
  CorruptComplaintRecordError,
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

export type ComplaintsPrismaClient = PrismaClient;

/**
 * Builds a client over the `pg` driver adapter (Prisma 7 has no built-in engine connection).
 * Serverless callers should create one per warm instance and reuse it.
 */
export const createPrismaClient = (databaseUrl: string): ComplaintsPrismaClient =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const toRow = (complaint: PublicComplaint): ComplaintRow => {
  const snapshot = toSnapshot(complaint);
  return {
    ...snapshot,
    submittedAt: new Date(snapshot.submittedAt),
    updatedAt: new Date(snapshot.updatedAt),
  };
};

/** Rows are external input: re-validated through the domain, never cast. */
const fromRow = (row: ComplaintRow): PublicComplaint => {
  const restored = restoreComplaint({
    ...row,
    submittedAt: row.submittedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
  if (!restored.ok || restored.value.visibility !== 'public') {
    throw new CorruptComplaintRecordError(row.id);
  }
  return restored.value;
};

export interface PrismaComplaintRepositoryOptions {
  /** Chance, per accepted submission, of running one global prune batch. Default 0.02. */
  readonly pruneProbability?: number;
  /** Rows deleted per prune batch. Default 500. */
  readonly pruneBatchSize?: number;
  readonly random?: () => number;
  /** Receives a failed prune. The submission has already committed; the next prune retries. */
  readonly onPruneError?: (error: unknown) => void;
}

export class PrismaComplaintRepository implements ComplaintRepository {
  private readonly pruneProbability: number;
  private readonly pruneBatchSize: number;
  private readonly random: () => number;
  private readonly onPruneError: (error: unknown) => void;

  constructor(
    private readonly prisma: ComplaintsPrismaClient,
    options: PrismaComplaintRepositoryOptions = {}
  ) {
    this.pruneProbability = options.pruneProbability ?? 0.02;
    this.pruneBatchSize = options.pruneBatchSize ?? 500;
    this.random = options.random ?? Math.random;
    this.onPruneError = options.onPruneError ?? (() => undefined);
  }

  async submitRateLimited(
    complaint: PublicComplaint,
    clientKey: string,
    rules: readonly RateLimitRule[]
  ): Promise<RateLimitDecision> {
    const now = new Date(complaint.submittedAt);
    const horizon = new Date(now.getTime() - longestWindowMs(rules));
    const decision = await this.prisma.$transaction(async (tx) => {
      // Serialises submissions from one client until commit, so a parallel burst cannot all
      // read the same "under the limit" history. The lock is per key: other clients never wait.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${clientKey}))`;
      // Everything below touches only this key's rows, which only the lock holder writes, so
      // it cannot contend with another client's transaction.
      await tx.submissionLog.deleteMany({ where: { clientKey, submittedAt: { lte: horizon } } });
      const history = await tx.submissionLog.findMany({
        where: { clientKey },
        select: { submittedAt: true },
      });
      const verdict = evaluateRateLimit(
        history.map((row) => row.submittedAt),
        now,
        rules
      );
      if (verdict.allowed) {
        // Same transaction: if the insert fails, the log entry rolls back with it.
        await tx.complaint.create({ data: toRow(complaint) });
        await tx.submissionLog.create({ data: { clientKey, submittedAt: now } });
      }
      return verdict;
    });
    if (decision.allowed && this.random() < this.pruneProbability) {
      await this.pruneExpiredSubmissions(horizon);
    }
    return decision;
  }

  /**
   * Deletes one bounded batch of log rows older than `olderThan` (keys that never came back;
   * returning keys are pruned inside their own transaction). Runs outside any submission
   * transaction and skips rows another transaction holds, so it never blocks a submission and
   * a submission never blocks it. Returns the number of rows deleted.
   */
  async pruneExpiredSubmissions(olderThan: Date): Promise<number> {
    try {
      return await this.prisma.$executeRaw`
        DELETE FROM submission_log WHERE id IN (
          SELECT id FROM submission_log
          WHERE submitted_at <= ${olderThan}::timestamptz
          ORDER BY submitted_at
          LIMIT ${this.pruneBatchSize}
          FOR UPDATE SKIP LOCKED
        )`;
    } catch (error) {
      // Housekeeping only: a failure delays cleanup but must not fail the caller's request.
      this.onPruneError(error);
      return 0;
    }
  }
  async findById(id: ComplaintId): Promise<PublicComplaint | null> {
    const row = await this.prisma.complaint.findUnique({ where: { id } });
    return row === null ? null : fromRow(row);
  }

  async saveTransition(previous: PublicComplaint, next: PublicComplaint): Promise<boolean> {
    // Compare-and-set on (status, updatedAt): a concurrent decision leaves count at 0.
    const { count } = await this.prisma.complaint.updateMany({
      where: {
        id: previous.id,
        status: previous.status,
        updatedAt: new Date(previous.updatedAt),
      },
      data: { status: next.status, updatedAt: new Date(next.updatedAt) },
    });
    return count === 1;
  }

  async listByStatus(query: ListComplaintsQuery): Promise<ComplaintPage> {
    const { after } = query;
    const afterAt = after === null ? null : new Date(after.submittedAt);
    const rows = await this.prisma.complaint.findMany({
      where: {
        status: query.status,
        ...(after !== null && afterAt !== null
          ? {
              OR: [
                { submittedAt: { lt: afterAt } },
                { submittedAt: afterAt, id: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      // One extra row tells us whether another page exists without a COUNT.
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      items: page.map(fromRow),
      nextCursor:
        rows.length > query.limit && last !== undefined
          ? { submittedAt: last.submittedAt.toISOString(), id: last.id }
          : null,
    };
  }
}
