import { submitComplaint, type ComplaintError } from '@qa3elhamor/complaints-domain';
import type {
  ApiFieldIssue,
  SubmitComplaintRequest,
  SubmitComplaintResponse,
} from '@qa3elhamor/shared-api-interfaces';
import type { ComplaintsApiDeps } from './deps.js';
import { errorResponse, jsonResponse, readJsonBody } from './http.js';
import { clientKeyFor, rateLimitSubject, UNIDENTIFIED_CLIENT } from './security.js';

const REQUIRED = ['subject', 'body', 'senderName'] as const;
const ALLOWED = new Set<string>([...REQUIRED, 'senderSpecies']);

type ShapeResult =
  | { readonly ok: true; readonly value: SubmitComplaintRequest }
  | { readonly ok: false; readonly issues: readonly ApiFieldIssue[] };

/**
 * Checks the JSON shape only: an object of known keys with string values. Content rules
 * (length, control characters, normalisation) belong to the domain, which runs next.
 */
export const parseSubmitRequest = (value: unknown): ShapeResult => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, issues: [{ field: 'request', reason: 'malformed' }] };
  }
  const record = value as Readonly<Record<string, unknown>>;
  const issues: ApiFieldIssue[] = [];
  // Reported as one fixed issue: the unknown key names are client input and are never echoed.
  if (Object.keys(record).some((key) => !ALLOWED.has(key))) {
    issues.push({ field: 'request', reason: 'unknown-field' });
  }
  for (const field of REQUIRED) {
    if (record[field] === undefined) issues.push({ field, reason: 'required' });
    else if (typeof record[field] !== 'string') issues.push({ field, reason: 'malformed' });
  }
  const species = record['senderSpecies'];
  if (species !== undefined && species !== null && typeof species !== 'string') {
    issues.push({ field: 'senderSpecies', reason: 'malformed' });
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      subject: record['subject'] as string,
      body: record['body'] as string,
      senderName: record['senderName'] as string,
      senderSpecies: (species as string | null | undefined) ?? null,
    },
  };
};

const domainIssues = (error: ComplaintError): readonly ApiFieldIssue[] | undefined =>
  error.type === 'invalid-complaint'
    ? error.issues.map((issue) => ({
        field: issue.field,
        reason: issue.reason,
        ...(issue.limit === undefined ? {} : { limit: issue.limit }),
      }))
    : undefined;

/**
 * `POST /complaints`: files a public complaint as `pending`.
 *
 * Order matters for abuse resistance: the client must be identifiable, size and shape are
 * checked before anything is parsed into the domain, and the domain validates before the
 * database is touched, so malformed floods cost CPU but never a write. The limit check and the
 * insert are one transaction, so only stored complaints count toward the limit.
 */
export const handleSubmitComplaint = async (
  request: Request,
  deps: ComplaintsApiDeps
): Promise<Response> => {
  const { wall, config } = deps;
  if (wall === null || config.ipHashSalt === null) return errorResponse(503, 'wall-unavailable');

  const subject = rateLimitSubject(deps.clientIp(request));
  if (subject === null && config.missingClientIp === 'reject') {
    // Never one shared bucket: that would let a single client lock everyone out. On Netlify the
    // edge always sets the header, so reaching this means the deployment is misconfigured.
    deps.reportError(new Error('Submission without a usable client IP; check CLIENT_IP_HEADER'));
    return errorResponse(503, 'client-ip-unavailable');
  }
  const clientKey = clientKeyFor(subject ?? UNIDENTIFIED_CLIENT, config.ipHashSalt);

  const body = await readJsonBody(request, config.maxBodyBytes);
  if (!body.ok) return body.response;
  const shape = parseSubmitRequest(body.value);
  if (!shape.ok) return errorResponse(400, 'invalid-request', { issues: shape.issues });

  const now = deps.now();
  const submitted = submitComplaint(
    { ...shape.value, id: deps.newId(), visibility: 'public' },
    now
  );
  if (!submitted.ok) {
    const issues = domainIssues(submitted.error);
    if (issues === undefined) throw new Error(`Unexpected domain error: ${submitted.error.type}`);
    return errorResponse(400, 'invalid-complaint', { issues });
  }
  const { complaint } = submitted.value;
  if (complaint.visibility !== 'public') throw new Error('Submitted complaint is not public');

  const decision = await wall.complaints.submitRateLimited(complaint, clientKey, config.rateLimits);
  if (!decision.allowed) {
    return errorResponse(429, 'rate-limited', {
      headers: { 'retry-after': String(decision.retryAfterSeconds) },
    });
  }

  const response: SubmitComplaintResponse = { id: complaint.id, status: 'pending' };
  return jsonResponse(201, response);
};
