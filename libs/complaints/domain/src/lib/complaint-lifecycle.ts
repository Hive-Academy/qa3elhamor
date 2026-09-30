import type { Visibility } from './visibility.js';

/**
 * The two lifecycles, one per visibility.
 *
 * Private (contact):  submitted -> delivered | failed;  failed -> submitted (retry).
 *   No moderation and no deletion - a private complaint is delivered to the owner's inbox by
 *   the form service and is never stored for display.
 *
 * Public (wall):  pending -> approved | rejected;  pending | approved | rejected -> deleted.
 *   Delete is allowed from every live state so a moderator can remove spam without first
 *   rejecting it, and can take down something approved in error. Approve and reject are a
 *   single decision: an approved complaint is removed by deleting it, not by rejecting it,
 *   and a rejected one is never revived. `deleted` is terminal (a tombstone; the data layer
 *   may purge it).
 *
 * The status sets do not overlap, so a private complaint's status can never be `approved`.
 */
export const PRIVATE_STATUSES = ['submitted', 'delivered', 'failed'] as const;
export const PUBLIC_STATUSES = ['pending', 'approved', 'rejected', 'deleted'] as const;

export type PrivateStatus = (typeof PRIVATE_STATUSES)[number];
export type PublicStatus = (typeof PUBLIC_STATUSES)[number];
export type ComplaintStatus = PrivateStatus | PublicStatus;

export const PRIVATE_ACTIONS = ['markDelivered', 'markDeliveryFailed', 'retryDelivery'] as const;
export const PUBLIC_ACTIONS = ['approve', 'reject', 'delete'] as const;

export type PrivateAction = (typeof PRIVATE_ACTIONS)[number];
export type PublicAction = (typeof PUBLIC_ACTIONS)[number];
export type ComplaintAction = PrivateAction | PublicAction;

export const PRIVATE_TRANSITIONS: Readonly<
  Record<PrivateAction, Readonly<Partial<Record<PrivateStatus, PrivateStatus>>>>
> = {
  markDelivered: { submitted: 'delivered' },
  markDeliveryFailed: { submitted: 'failed' },
  retryDelivery: { failed: 'submitted' },
};

export const PUBLIC_TRANSITIONS: Readonly<
  Record<PublicAction, Readonly<Partial<Record<PublicStatus, PublicStatus>>>>
> = {
  approve: { pending: 'approved' },
  reject: { pending: 'rejected' },
  delete: { pending: 'deleted', approved: 'deleted', rejected: 'deleted' },
};

/** The status a complaint of this visibility starts in. */
export const initialStatus = (visibility: Visibility): ComplaintStatus =>
  visibility === 'private' ? 'submitted' : 'pending';

export const isPrivateStatus = (value: unknown): value is PrivateStatus =>
  typeof value === 'string' && (PRIVATE_STATUSES as readonly string[]).includes(value);

export const isPublicStatus = (value: unknown): value is PublicStatus =>
  typeof value === 'string' && (PUBLIC_STATUSES as readonly string[]).includes(value);

export const isPrivateAction = (action: ComplaintAction): action is PrivateAction =>
  (PRIVATE_ACTIONS as readonly string[]).includes(action);

export const isPublicAction = (action: ComplaintAction): action is PublicAction =>
  (PUBLIC_ACTIONS as readonly string[]).includes(action);
