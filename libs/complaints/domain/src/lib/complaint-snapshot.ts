import { err, ok, type Result } from '@qa3elhamor/shared-domain';
import type { ComplaintError, FieldIssue } from './complaint-errors.js';
import { assembleComplaint, validateContent, type Complaint } from './complaint.js';
import {
  isPrivateStatus,
  isPublicStatus,
  type ComplaintStatus,
} from './complaint-lifecycle.js';
import { isVisibility, type Visibility } from './visibility.js';

/**
 * The aggregate as primitives, for persistence and transport. Produced by `toSnapshot`;
 * turned back into an aggregate only through `restoreComplaint`, which re-validates.
 */
export interface ComplaintSnapshot {
  readonly id: string;
  readonly visibility: Visibility;
  readonly status: ComplaintStatus;
  readonly subject: string;
  readonly body: string;
  readonly senderName: string;
  readonly senderSpecies: string | null;
  readonly replyEmail: string | null;
  readonly submittedAt: string;
  readonly updatedAt: string;
}

export const toSnapshot = (complaint: Complaint): ComplaintSnapshot => ({
  id: complaint.id,
  visibility: complaint.visibility,
  status: complaint.status,
  subject: complaint.subject.value,
  body: complaint.body.value,
  senderName: complaint.sender.name.value,
  senderSpecies: complaint.sender.species?.value ?? null,
  replyEmail: complaint.visibility === 'private' ? (complaint.replyEmail?.value ?? null) : null,
  submittedAt: complaint.submittedAt,
  updatedAt: complaint.updatedAt,
});

const isIsoInstant = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
  !Number.isNaN(Date.parse(value));

const invalid = (...issues: FieldIssue[]): Result<never, ComplaintError> =>
  err({ type: 'invalid-complaint', issues });

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const REQUIRED_TEXT = ['id', 'subject', 'body', 'senderName'] as const;
const OPTIONAL_TEXT = ['senderSpecies', 'replyEmail'] as const;

/**
 * Rebuilds an aggregate from storage. The stored row is external input and is typed
 * `unknown`: a non-object, a non-string field, a status outside the visibility's lifecycle (a
 * private complaint claiming `approved`), or `updatedAt` earlier than `submittedAt` is refused
 * with an `invalid-complaint` error. It never throws.
 */
export const restoreComplaint = (stored: unknown): Result<Complaint, ComplaintError> => {
  if (!isRecord(stored)) return invalid({ field: 'record', reason: 'malformed' });
  const { visibility, status, submittedAt, updatedAt } = stored;
  if (!isVisibility(visibility)) return invalid({ field: 'visibility', reason: 'malformed' });

  const issues: FieldIssue[] = [];
  const statusValid =
    visibility === 'private' ? isPrivateStatus(status) : isPublicStatus(status);
  if (!statusValid) issues.push({ field: 'status', reason: 'malformed' });

  const submittedOk = typeof submittedAt === 'string' && isIsoInstant(submittedAt);
  const updatedOk = typeof updatedAt === 'string' && isIsoInstant(updatedAt);
  if (!submittedOk) issues.push({ field: 'submittedAt', reason: 'malformed' });
  if (!updatedOk) issues.push({ field: 'updatedAt', reason: 'malformed' });
  if (submittedOk && updatedOk && Date.parse(updatedAt) < Date.parse(submittedAt)) {
    issues.push({ field: 'updatedAt', reason: 'out-of-order' });
  }

  // Wrong types are reported here; the text rules below would otherwise call string methods
  // on them.
  for (const field of REQUIRED_TEXT) {
    if (typeof stored[field] !== 'string') issues.push({ field, reason: 'malformed' });
  }
  for (const field of OPTIONAL_TEXT) {
    const value = stored[field];
    if (value !== null && value !== undefined && typeof value !== 'string') {
      issues.push({ field, reason: 'malformed' });
    }
  }
  if (issues.length > 0) return invalid(...issues);

  const content = validateContent({
    id: stored['id'] as string,
    visibility,
    subject: stored['subject'] as string,
    body: stored['body'] as string,
    senderName: stored['senderName'] as string,
    senderSpecies: stored['senderSpecies'] as string | null | undefined,
    replyEmail: stored['replyEmail'] as string | null | undefined,
  });
  if (!content.ok) return content;

  return ok(
    assembleComplaint(
      content.value,
      visibility,
      status as ComplaintStatus,
      submittedAt as string,
      updatedAt as string
    )
  );
};
