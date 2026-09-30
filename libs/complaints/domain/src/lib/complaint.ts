import { err, ok, type Result } from '@qa3elhamor/shared-domain';
import type { ComplaintError, FieldIssue } from './complaint-errors.js';
import { EVENT_FOR_ACTION, type ComplaintEvent } from './complaint-events.js';
import {
  ComplaintBody,
  ComplaintSubject,
  ReplyEmail,
  SenderName,
  SenderSpecies,
} from './complaint-fields.js';
import { complaintId, type ComplaintId } from './complaint-id.js';
import {
  initialStatus,
  isPrivateAction,
  isPublicAction,
  PRIVATE_TRANSITIONS,
  PUBLIC_TRANSITIONS,
  type ComplaintAction,
  type ComplaintStatus,
  type PrivateStatus,
  type PublicStatus,
} from './complaint-lifecycle.js';
import type { Visibility } from './visibility.js';

export interface Sender {
  readonly name: SenderName;
  readonly species: SenderSpecies | null;
}

interface ComplaintBase {
  readonly id: ComplaintId;
  readonly subject: ComplaintSubject;
  readonly body: ComplaintBody;
  readonly sender: Sender;
  /** ISO-8601 instant of submission. */
  readonly submittedAt: string;
  /** ISO-8601 instant of the last transition (equal to `submittedAt` until one happens). */
  readonly updatedAt: string;
}

/** A contact message: routed to the owner's inbox, never moderated, never displayed. */
export interface PrivateComplaint extends ComplaintBase {
  readonly visibility: 'private';
  readonly status: PrivateStatus;
  readonly replyEmail: ReplyEmail | null;
}

/** A wall post: moderated, and listed on the wall only once approved. Carries no email. */
export interface PublicComplaint extends ComplaintBase {
  readonly visibility: 'public';
  readonly status: PublicStatus;
}

/**
 * The aggregate. Instances are frozen plain objects; every operation returns a new instance.
 * Visibility is chosen once, at submission, and no operation changes it.
 */
export type Complaint = PrivateComplaint | PublicComplaint;

/** A successful operation: the new state and the event it produced. */
export interface ComplaintChange<TComplaint extends Complaint = Complaint> {
  readonly complaint: TComplaint;
  readonly event: ComplaintEvent;
}

/** Raw, untrusted submission input, as it arrives from the form or the API body. */
export interface ComplaintSubmission {
  readonly id: string;
  readonly visibility: Visibility;
  readonly subject: string;
  readonly body: string;
  readonly senderName: string;
  /** Optional; blank is treated as absent. */
  readonly senderSpecies?: string | null;
  /** Private complaints only; blank is treated as absent. Refused on a public complaint. */
  readonly replyEmail?: string | null;
}

interface ValidContent {
  readonly id: ComplaintId;
  readonly subject: ComplaintSubject;
  readonly body: ComplaintBody;
  readonly sender: Sender;
  readonly replyEmail: ReplyEmail | null;
}

const isBlank = (value: string | null | undefined): value is null | undefined | '' =>
  value === null || value === undefined || value.trim().length === 0;

/** Converts `now` to an ISO instant, refusing an Invalid Date instead of throwing. */
export const toInstant = (now: unknown): Result<string, ComplaintError> => {
  // `now` crosses from untyped callers (JS, deserialised payloads), so its type is checked,
  // not trusted; the tag check also accepts Dates from another realm.
  const isDate = Object.prototype.toString.call(now) === '[object Date]';
  if (!isDate || Number.isNaN((now as Date).getTime())) {
    return err({ type: 'invalid-clock', reason: 'not-a-date' });
  }
  return ok((now as Date).toISOString());
};

/** Validates every content field, collecting all issues rather than stopping at the first. */
export const validateContent = (
  input: ComplaintSubmission
): Result<ValidContent, ComplaintError> => {
  const issues: FieldIssue[] = [];
  const collect = <T>(result: Result<T, FieldIssue>): T | undefined => {
    if (result.ok) return result.value;
    issues.push(result.error);
    return undefined;
  };

  const id = collect(complaintId(input.id));
  const subject = collect(ComplaintSubject.create(input.subject));
  const body = collect(ComplaintBody.create(input.body));
  const name = collect(SenderName.create(input.senderName));
  const species = isBlank(input.senderSpecies)
    ? null
    : collect(SenderSpecies.create(input.senderSpecies));

  let replyEmail: ReplyEmail | null | undefined = null;
  if (!isBlank(input.replyEmail)) {
    // A public complaint is published; an address on it would be published too.
    if (input.visibility === 'public') {
      issues.push({ field: 'replyEmail', reason: 'not-allowed' });
    } else {
      replyEmail = collect(ReplyEmail.create(input.replyEmail));
    }
  }

  if (
    issues.length > 0 ||
    id === undefined ||
    subject === undefined ||
    body === undefined ||
    name === undefined ||
    species === undefined ||
    replyEmail === undefined
  ) {
    return err({ type: 'invalid-complaint', issues });
  }
  return ok({ id, subject, body, sender: Object.freeze({ name, species }), replyEmail });
};

/** Assembles a frozen aggregate from already-validated parts. */
export const assembleComplaint = (
  content: ValidContent,
  visibility: Visibility,
  status: ComplaintStatus,
  submittedAt: string,
  updatedAt: string
): Complaint => {
  const base = {
    id: content.id,
    subject: content.subject,
    body: content.body,
    sender: content.sender,
    submittedAt,
    updatedAt,
  };
  return visibility === 'private'
    ? Object.freeze<PrivateComplaint>({
        ...base,
        visibility,
        status: status as PrivateStatus,
        replyEmail: content.replyEmail,
      })
    : Object.freeze<PublicComplaint>({ ...base, visibility, status: status as PublicStatus });
};

const eventFor = (
  complaint: Complaint,
  type: ComplaintEvent['type'],
  occurredAt: string
): ComplaintEvent =>
  Object.freeze({
    type,
    complaintId: complaint.id,
    visibility: complaint.visibility,
    status: complaint.status,
    occurredAt,
  });

/**
 * Files a new complaint. Private complaints start `submitted`, public ones `pending`.
 * `now` is supplied by the caller so the domain stays deterministic.
 */
export const submitComplaint = (
  submission: ComplaintSubmission,
  now: Date
): Result<ComplaintChange, ComplaintError> => {
  const instant = toInstant(now);
  if (!instant.ok) return instant;
  const content = validateContent(submission);
  if (!content.ok) return content;
  const complaint = assembleComplaint(
    content.value,
    submission.visibility,
    initialStatus(submission.visibility),
    instant.value,
    instant.value
  );
  return ok({ complaint, event: eventFor(complaint, 'ComplaintSubmitted', instant.value) });
};

/** The status `action` would move `complaint` to, or `undefined` when it is not allowed. */
const nextStatus = (
  complaint: Complaint,
  action: ComplaintAction
): ComplaintStatus | undefined => {
  if (complaint.visibility === 'private') {
    return isPrivateAction(action) ? PRIVATE_TRANSITIONS[action][complaint.status] : undefined;
  }
  return isPublicAction(action) ? PUBLIC_TRANSITIONS[action][complaint.status] : undefined;
};

/** True when `action` is permitted from the complaint's current state. */
export const canTransition = (complaint: Complaint, action: ComplaintAction): boolean =>
  nextStatus(complaint, action) !== undefined;

/**
 * Applies a lifecycle action. Never throws: an action that does not apply to the
 * complaint's visibility or current status returns an `invalid-transition` error, and a
 * `now` earlier than the last change returns `invalid-clock` rather than being clamped, so
 * `updatedAt` never moves backwards. Equal instants are allowed.
 */
export const transitionComplaint = (
  complaint: Complaint,
  action: ComplaintAction,
  now: Date
): Result<ComplaintChange, ComplaintError> => {
  const instant = toInstant(now);
  if (!instant.ok) return instant;
  if (Date.parse(instant.value) < Date.parse(complaint.updatedAt)) {
    return err({ type: 'invalid-clock', reason: 'before-last-update' });
  }
  const status = nextStatus(complaint, action);
  if (status === undefined) {
    return err({
      type: 'invalid-transition',
      complaintId: complaint.id,
      visibility: complaint.visibility,
      from: complaint.status,
      action,
    });
  }
  const next =
    complaint.visibility === 'private'
      ? Object.freeze<PrivateComplaint>({
          ...complaint,
          status: status as PrivateStatus,
          updatedAt: instant.value,
        })
      : Object.freeze<PublicComplaint>({
          ...complaint,
          status: status as PublicStatus,
          updatedAt: instant.value,
        });
  return ok({ complaint: next, event: eventFor(next, EVENT_FOR_ACTION[action], instant.value) });
};

export const markDelivered = (complaint: Complaint, now: Date) =>
  transitionComplaint(complaint, 'markDelivered', now);
export const markDeliveryFailed = (complaint: Complaint, now: Date) =>
  transitionComplaint(complaint, 'markDeliveryFailed', now);
export const retryDelivery = (complaint: Complaint, now: Date) =>
  transitionComplaint(complaint, 'retryDelivery', now);
export const approveComplaint = (complaint: Complaint, now: Date) =>
  transitionComplaint(complaint, 'approve', now);
export const rejectComplaint = (complaint: Complaint, now: Date) =>
  transitionComplaint(complaint, 'reject', now);
export const deleteComplaint = (complaint: Complaint, now: Date) =>
  transitionComplaint(complaint, 'delete', now);

/** The single rule for what the wall may show: public and approved, nothing else. */
export const isListedOnWall = (
  complaint: Complaint
): complaint is PublicComplaint & { readonly status: 'approved' } =>
  complaint.visibility === 'public' && complaint.status === 'approved';

/** Public complaints waiting for a moderator. */
export const awaitsModeration = (complaint: Complaint): complaint is PublicComplaint =>
  complaint.visibility === 'public' && complaint.status === 'pending';
