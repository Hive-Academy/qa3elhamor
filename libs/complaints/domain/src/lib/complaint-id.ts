import { brandId, err, ok, type Branded, type Result } from '@qa3elhamor/shared-domain';
import type { FieldIssue } from './complaint-errors.js';

export type ComplaintId = Branded<'Complaint'>;

export const COMPLAINT_ID_MAX_LENGTH = 64;

// URL- and database-safe: covers UUIDs, cuids and nanoids without admitting anything that
// would need escaping in a route segment.
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Validates an externally generated id. The domain never mints ids itself - generation is
 * I/O-adjacent (crypto, database sequences) and belongs to the caller.
 */
export const complaintId = (raw: string): Result<ComplaintId, FieldIssue> => {
  if (raw.length === 0) return err({ field: 'id', reason: 'empty' });
  if (raw.length > COMPLAINT_ID_MAX_LENGTH) {
    return err({ field: 'id', reason: 'too-long', limit: COMPLAINT_ID_MAX_LENGTH });
  }
  if (!ID_PATTERN.test(raw)) return err({ field: 'id', reason: 'malformed' });
  return ok(brandId<'Complaint'>(raw));
};
