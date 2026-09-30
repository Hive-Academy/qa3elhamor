import type { ComplaintAction, ComplaintStatus } from './complaint-lifecycle.js';
import type { ComplaintId } from './complaint-id.js';
import type { Visibility } from './visibility.js';

/**
 * Every input a complaint is built from, named as the form and the API name them. `record`
 * is the stored row as a whole, used when it is not an object at all.
 */
export type ComplaintField =
  | 'record'
  | 'id'
  | 'visibility'
  | 'status'
  | 'subject'
  | 'body'
  | 'senderName'
  | 'senderSpecies'
  | 'replyEmail'
  | 'submittedAt'
  | 'updatedAt';

/**
 * Why a field was refused.
 *
 * - `empty` - nothing left after normalisation (trim + whitespace collapse).
 * - `too-long` - over `limit` code points after normalisation.
 * - `control-character` - contains a C0/C1 control or a bidi override (Trojan-Source style
 *   reordering); tab and newline are whitespace, not refused.
 * - `malformed` - the shape is wrong (an email without a domain, an unknown status).
 * - `not-allowed` - valid on its own but not for this visibility (a reply email on a public
 *   complaint would be published to the wall).
 * - `out-of-order` - a timestamp precedes one it must follow (`updatedAt` before
 *   `submittedAt`).
 */
export type FieldIssueReason =
  | 'empty'
  | 'too-long'
  | 'control-character'
  | 'malformed'
  | 'not-allowed'
  | 'out-of-order';

export interface FieldIssue {
  readonly field: ComplaintField;
  readonly reason: FieldIssueReason;
  /** The maximum length, present only when `reason` is `too-long`. */
  readonly limit?: number;
}

export type ComplaintError =
  /** One or more fields failed validation; all issues are reported, not just the first. */
  | { readonly type: 'invalid-complaint'; readonly issues: readonly FieldIssue[] }
  /** The action is not permitted from the complaint's current status and visibility. */
  | {
      readonly type: 'invalid-transition';
      readonly complaintId: ComplaintId;
      readonly visibility: Visibility;
      readonly from: ComplaintStatus;
      readonly action: ComplaintAction;
    }
  /**
   * The `now` handed in is unusable: not a Date or an Invalid Date (`not-a-date`), or earlier
   * than the complaint's last change (`before-last-update`); refused, never clamped.
   */
  | { readonly type: 'invalid-clock'; readonly reason: ClockIssueReason };

export type ClockIssueReason = 'not-a-date' | 'before-last-update';
