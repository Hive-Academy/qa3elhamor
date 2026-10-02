import type { WallPageResponse } from '@qa3elhamor/shared-api-interfaces';
import { WALL_CACHE_TAG } from './cache-purger.js';
import { toWallComplaint, type ComplaintsApiDeps } from './deps.js';
import { errorResponse, jsonResponse } from './http.js';
import { encodeCursor, readPageQuery } from './pagination.js';

/**
 * Browsers revalidate after 30 s; a shared CDN (Netlify honours `CDN-Cache-Control`) keeps it
 * for 60 s and may serve a stale copy for 5 more minutes while it refetches.
 *
 * The same window applies in reverse: a complaint that is rejected or deleted after approval
 * can stay visible on CDN edges for up to about 6 minutes (60 s fresh + 300 s stale), plus
 * 30 s in a browser, unless the deployment wires a real `CachePurger`: moderation then purges
 * every response tagged `WALL_CACHE_TAG` (both the generic `Cache-Tag` and Netlify's
 * `Netlify-Cache-Tag`), leaving only the 30 s browser window.
 */
export const WALL_CACHE_HEADERS = {
  'cache-control': 'public, max-age=30',
  'cdn-cache-control': 'public, s-maxage=60, stale-while-revalidate=300',
  'cache-tag': WALL_CACHE_TAG,
  'netlify-cache-tag': WALL_CACHE_TAG,
} as const;

/** `GET /complaints?limit=&cursor=`: approved public complaints, newest first. */
export const handleListWall = async (
  request: Request,
  deps: ComplaintsApiDeps
): Promise<Response> => {
  if (deps.wall === null) return errorResponse(503, 'wall-unavailable');
  const query = readPageQuery(new URL(request.url), deps.config.pageSize);
  if (!query.ok) return errorResponse(400, query.code);

  const page = await deps.wall.complaints.listByStatus({
    status: 'approved',
    limit: query.limit,
    after: query.after,
  });
  const body: WallPageResponse = {
    items: page.items.map(toWallComplaint),
    nextCursor: page.nextCursor === null ? null : encodeCursor(page.nextCursor),
  };
  return jsonResponse(200, body, WALL_CACHE_HEADERS);
};
