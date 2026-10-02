import {
  complaintId,
  isPublicStatus,
  PUBLIC_ACTIONS,
  transitionComplaint,
  type PublicAction,
} from '@qa3elhamor/complaints-domain';
import type {
  ModerationActionResponse,
  ModerationPageResponse,
} from '@qa3elhamor/shared-api-interfaces';
import { toModerationComplaint, type ComplaintsApiDeps, type WallStores } from './deps.js';
import { errorResponse, jsonResponse, rateLimitedResponse } from './http.js';
import { encodeCursor, readPageQuery } from './pagination.js';
import { hasModerationToken, rateLimitSubject, UNIDENTIFIED_CLIENT } from './security.js';

/**
 * Gate shared by every moderation route. Order: an unset token disables moderation outright
 * (503, so an operator sees a configuration problem rather than a login failure), a client
 * with too many refused requests is throttled (429) before its token is even compared, then
 * the bearer token is checked (401, counted as a refusal), and only then is the database
 * consulted. The token is at least 24 characters, so guessing is already hopeless; the
 * throttle stops a guessing loop from costing a hash per attempt indefinitely.
 */
const authorize = (
  request: Request,
  deps: ComplaintsApiDeps
): { readonly ok: true; readonly wall: WallStores } | { readonly ok: false; readonly response: Response } => {
  const { moderationToken } = deps.config;
  if (moderationToken === null) {
    return { ok: false, response: errorResponse(503, 'moderation-disabled') };
  }
  const client = rateLimitSubject(deps.clientIp(request)) ?? UNIDENTIFIED_CLIENT;
  const now = deps.now();
  const throttle = deps.failureLimiter.check(client, now);
  if (!throttle.allowed) {
    return { ok: false, response: rateLimitedResponse(throttle.retryAfterSeconds) };
  }
  if (!hasModerationToken(request, moderationToken)) {
    deps.failureLimiter.recordFailure(client, now);
    return {
      ok: false,
      response: errorResponse(401, 'unauthorized', {
        headers: { 'www-authenticate': 'Bearer realm="moderation"' },
      }),
    };
  }
  if (deps.wall === null) return { ok: false, response: errorResponse(503, 'wall-unavailable') };
  return { ok: true, wall: deps.wall };
};

/** `GET /moderation/complaints?status=pending&limit=&cursor=`: defaults to the pending queue. */
export const handleListModeration = async (
  request: Request,
  deps: ComplaintsApiDeps
): Promise<Response> => {
  const auth = authorize(request, deps);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? 'pending';
  if (!isPublicStatus(status)) return errorResponse(400, 'invalid-request');
  const query = readPageQuery(url, deps.config.pageSize);
  if (!query.ok) return errorResponse(400, query.code);

  const page = await auth.wall.complaints.listByStatus({
    status,
    limit: query.limit,
    after: query.after,
  });
  const body: ModerationPageResponse = {
    items: page.items.map(toModerationComplaint),
    nextCursor: page.nextCursor === null ? null : encodeCursor(page.nextCursor),
  };
  return jsonResponse(200, body);
};

const isPublicAction = (value: string): value is PublicAction =>
  (PUBLIC_ACTIONS as readonly string[]).includes(value);

/**
 * `POST /moderation/complaints/:id/(approve|reject|delete)`. `delete` leaves a `deleted`
 * tombstone (the domain's terminal state) that no listing but `?status=deleted` returns.
 * An action the lifecycle forbids, or a concurrent decision on the same complaint, is 409.
 */
export const handleModerateComplaint = async (
  request: Request,
  deps: ComplaintsApiDeps,
  target: { readonly id: string; readonly action: string }
): Promise<Response> => {
  const auth = authorize(request, deps);
  if (!auth.ok) return auth.response;

  const id = complaintId(target.id);
  if (!id.ok || !isPublicAction(target.action)) return errorResponse(404, 'not-found');

  const current = await auth.wall.complaints.findById(id.value);
  if (current === null) return errorResponse(404, 'not-found');

  const changed = transitionComplaint(current, target.action, deps.now());
  if (!changed.ok) {
    if (changed.error.type === 'invalid-transition') return errorResponse(409, 'conflict');
    throw new Error(`Moderation transition failed: ${changed.error.type}`);
  }
  const next = changed.value.complaint;
  if (next.visibility !== 'public') throw new Error('Transition changed visibility');

  const saved = await auth.wall.complaints.saveTransition(current, next);
  if (!saved) return errorResponse(409, 'conflict');

  if (current.status === 'approved' && next.status !== 'approved') {
    // The decision is committed; a CDN that cannot be purged must not turn it into an error
    // the moderator would retry. The cache window still bounds how long the text stays up.
    try {
      await deps.cachePurger.purgeWall();
    } catch (error) {
      deps.reportError(error);
    }
  }

  const body: ModerationActionResponse = { complaint: toModerationComplaint(next) };
  return jsonResponse(200, body);
};
