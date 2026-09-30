import type { ComplaintAction, ComplaintStatus } from './complaint-lifecycle.js';
import type { ComplaintId } from './complaint-id.js';
import type { Visibility } from './visibility.js';

export type ComplaintEventType =
  | 'ComplaintSubmitted'
  | 'ComplaintDelivered'
  | 'ComplaintDeliveryFailed'
  | 'ComplaintDeliveryRetried'
  | 'ComplaintApproved'
  | 'ComplaintRejected'
  | 'ComplaintDeleted';

/**
 * What happened, for callers that react to changes (notify the owner of a pending wall post,
 * invalidate a cached wall listing). Deliberately carries no user-authored text.
 */
export interface ComplaintEvent {
  readonly type: ComplaintEventType;
  readonly complaintId: ComplaintId;
  readonly visibility: Visibility;
  /** The status after the event. */
  readonly status: ComplaintStatus;
  /** ISO-8601 instant, taken from the `now` the caller supplied. */
  readonly occurredAt: string;
}

export const EVENT_FOR_ACTION: Readonly<Record<ComplaintAction, ComplaintEventType>> = {
  markDelivered: 'ComplaintDelivered',
  markDeliveryFailed: 'ComplaintDeliveryFailed',
  retryDelivery: 'ComplaintDeliveryRetried',
  approve: 'ComplaintApproved',
  reject: 'ComplaintRejected',
  delete: 'ComplaintDeleted',
};
