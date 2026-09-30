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
import { errorResponse, jsonResponse } from './http.js';
import { encodeCursor, readPageQuery } from './pagination.js';
import { hasModerationToken } from './security.js';

/**
 * Gate shared by every moderation route. Order: an unset token disables moderation outright
 * (503, so an operator sees a configuration problem rather than a login failure), then the
 * bearer token is checked (401), and only then is the database consulted.
 */
const authorize = (
  request: Request,
  deps: ComplaintsApiDeps
): { readonly ok: true; readonly wall: WallStores } | { readonly ok: false; readonly response: Response } => {
  const { moderationToken } = deps.config;
  if (moderationToken === null) {
    return { ok: false, response: errorResponse(503, 'moderation-disabled') };
  }
  if (!hasModerationToken(request, moderationToken)) {
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

  const body: ModerationActionResponse = { complaint: toModerationComplaint(next) };
  return jsonResponse(200, body);
};
