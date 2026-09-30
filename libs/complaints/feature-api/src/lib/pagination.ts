import { complaintId } from '@qa3elhamor/complaints-domain';
import type { ComplaintCursor } from '@qa3elhamor/complaints-data-access';

const MAX_CURSOR_LENGTH = 256;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Opaque to clients by convention only: base64url of `[submittedAt, id]`, a keyset position.
 * It is deliberately not signed. A hand-made cursor can only seek to an arbitrary position
 * within one status listing, which the caller is already allowed to read in full by paging
 * (the wall is public; other statuses sit behind the moderation token), and every query still
 * filters by status. Signing would add no access control, and would tie the public, cacheable
 * listing to `IP_HASH_SALT`.
 */
export const encodeCursor = (cursor: ComplaintCursor): string =>
  Buffer.from(JSON.stringify([cursor.submittedAt, cursor.id]), 'utf8').toString('base64url');

/**
 * Decodes a client-supplied cursor, or `undefined` when it is not well formed (bad encoding,
 * wrong shape, a timestamp that is not an ISO instant, an id the domain would refuse). This is
 * input validation, not authentication: a well-formed forged cursor is accepted.
 */
export const decodeCursor = (raw: string): ComplaintCursor | undefined => {
  if (raw.length === 0 || raw.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(raw)) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2) return undefined;
    const [submittedAt, id] = parsed as unknown[];
    if (typeof submittedAt !== 'string' || typeof id !== 'string') return undefined;
    if (!ISO_INSTANT.test(submittedAt) || Number.isNaN(Date.parse(submittedAt))) return undefined;
    if (!complaintId(id).ok) return undefined;
    return { submittedAt, id };
  } catch {
    // Not base64url JSON: the client made it up. Nothing to report beyond "invalid".
    return undefined;
  }
};

export type PageQuery =
  | { readonly ok: true; readonly limit: number; readonly after: ComplaintCursor | null }
  | { readonly ok: false; readonly code: 'invalid-cursor' | 'invalid-request' };

/** Reads `?limit=` (1..max, default otherwise) and `?cursor=` from a listing URL. */
export const readPageQuery = (
  url: URL,
  pageSize: { readonly default: number; readonly max: number }
): PageQuery => {
  const rawLimit = url.searchParams.get('limit');
  let limit = pageSize.default;
  if (rawLimit !== null) {
    if (!/^\d{1,4}$/.test(rawLimit)) return { ok: false, code: 'invalid-request' };
    limit = Number(rawLimit);
    if (limit < 1) return { ok: false, code: 'invalid-request' };
    limit = Math.min(limit, pageSize.max);
  }
  const rawCursor = url.searchParams.get('cursor');
  if (rawCursor === null) return { ok: true, limit, after: null };
  const after = decodeCursor(rawCursor);
  return after === undefined ? { ok: false, code: 'invalid-cursor' } : { ok: true, limit, after };
};
