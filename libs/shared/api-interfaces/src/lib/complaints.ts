/**
 * Wire contracts for the complaints wall API (`apps/api`). Plain data only: the server maps
 * domain aggregates to these shapes, and the web client consumes them. Only public complaints
 * travel over this API; private complaints go to a form service.
 */

/** `POST /complaints` body. Any other key is refused. */
export interface SubmitComplaintRequest {
  readonly subject: string;
  readonly body: string;
  readonly senderName: string;
  /** Optional; blank or null is treated as absent. */
  readonly senderSpecies?: string | null;
}

/** `201` from `POST /complaints`: the complaint waits for moderation. */
export interface SubmitComplaintResponse {
  readonly id: string;
  readonly status: 'pending';
}

/** One complaint on the public wall. */
export interface WallComplaint {
  readonly id: string;
  readonly subject: string;
  readonly body: string;
  readonly senderName: string;
  readonly senderSpecies: string | null;
  /** ISO-8601 instant. */
  readonly submittedAt: string;
}

/** A newest-first page. Pass `nextCursor` back as `?cursor=`; `null` means no more pages. */
export interface Page<TItem> {
  readonly items: readonly TItem[];
  readonly nextCursor: string | null;
}

/** `200` from `GET /complaints`. */
export type WallPageResponse = Page<WallComplaint>;

export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'deleted';
export type ModerationAction = 'approve' | 'reject' | 'delete';

/** A complaint as a moderator sees it: the wall fields plus its moderation state. */
export interface ModerationComplaint extends WallComplaint {
  readonly status: ModerationStatus;
  /** ISO-8601 instant of the last moderation decision. */
  readonly updatedAt: string;
}

/** `200` from `GET /moderation/complaints`. */
export type ModerationPageResponse = Page<ModerationComplaint>;

/** `200` from `POST /moderation/complaints/:id/:action`. */
export interface ModerationActionResponse {
  readonly complaint: ModerationComplaint;
}

export type ApiErrorCode =
  | 'invalid-json'
  | 'invalid-request'
  | 'invalid-complaint'
  | 'invalid-cursor'
  | 'unsupported-media-type'
  | 'payload-too-large'
  | 'rate-limited'
  | 'unauthorized'
  | 'forbidden-origin'
  | 'not-found'
  | 'method-not-allowed'
  | 'conflict'
  | 'wall-unavailable'
  | 'client-ip-unavailable'
  | 'moderation-disabled'
  | 'internal-error';

/** A field the server refused, with the reason (and the limit for `too-long`). */
export interface ApiFieldIssue {
  readonly field: string;
  readonly reason: string;
  readonly limit?: number;
}

/** Every non-2xx response has this body. `message` is fixed per code, never an internal. */
export interface ApiErrorResponse {
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
    readonly issues?: readonly ApiFieldIssue[];
  };
}
