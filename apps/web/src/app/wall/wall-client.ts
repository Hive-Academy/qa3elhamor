import type {
  ApiErrorCode,
  SubmitComplaintRequest,
  SubmitComplaintResponse,
  WallComplaint,
  WallPageResponse,
} from '@qa3elhamor/shared-api-interfaces';

/**
 * A typed client for the public complaints wall API (`apps/api`, `libs/complaints/feature-api`):
 * `GET {root}/complaints?limit=&cursor=` (approved complaints, newest first) and
 * `POST {root}/complaints` (a public complaint, filed as pending moderation).
 *
 * It never throws: every outcome is a `WallResult`. Each request has a timeout covering the whole
 * exchange (headers and body), and the caller's own `signal` cancels it. Responses are untrusted:
 * a page item that does not have the wall's shape is dropped, never rendered. Complaint text is
 * returned exactly as stored; it is plain text and must be rendered as text (docs/security.md).
 */

/** What went wrong, reduced to what the wall's views do about it. */
export type WallFailureKind =
  /** The server refused the complaint (`invalid-complaint`, `invalid-request`, 413, 415). */
  | 'refused'
  /** The cursor is stale or forged: start again from the first page. */
  | 'invalid-cursor'
  /** Too many complaints from this client; `retryAfterSeconds` says when to try again. */
  | 'rate-limited'
  /** The wall is switched off or broken on the server (503) or this origin is not allowed. */
  | 'unavailable'
  | 'network'
  | 'timeout'
  /** The caller's signal cancelled it: nothing to show. */
  | 'aborted'
  | 'unexpected';

export interface WallFailure {
  readonly kind: WallFailureKind;
  /** HTTP status, or `null` when no response arrived. */
  readonly status: number | null;
  /** The server's error code, when it sent one. */
  readonly code: ApiErrorCode | null;
  /** For `rate-limited`, from `Retry-After`. */
  readonly retryAfterSeconds?: number;
}

export type WallResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: WallFailure };

export interface WallListRequest {
  /** `nextCursor` from the previous page; absent for the first page. */
  readonly cursor?: string | null;
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

export interface WallClient {
  list(request?: WallListRequest): Promise<WallResult<WallPageResponse>>;
  submit(
    complaint: SubmitComplaintRequest,
    signal?: AbortSignal,
  ): Promise<WallResult<SubmitComplaintResponse>>;
}

export interface WallClientOptions {
  /** The API root without a trailing slash (`WALL_API_URL`): `/api` or `https://host/api`. */
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
  /** Abort a request that has not fully answered after this long. Default 12 s. */
  readonly timeoutMs?: number;
}

export const WALL_TIMEOUT_MS = 12_000;
/** Notes per page of the board. The server caps `limit` itself. */
export const WALL_PAGE_SIZE = 6;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** One wall item, checked field by field: anything else is not rendered. */
export const isWallComplaint = (value: unknown): value is WallComplaint =>
  isRecord(value) &&
  typeof value['id'] === 'string' &&
  typeof value['subject'] === 'string' &&
  typeof value['body'] === 'string' &&
  typeof value['senderName'] === 'string' &&
  (value['senderSpecies'] === null || typeof value['senderSpecies'] === 'string') &&
  typeof value['submittedAt'] === 'string' &&
  // A date the browser cannot read is a broken item, not a note without a date.
  !Number.isNaN(Date.parse(value['submittedAt']));

/** Keeps only the wall's own fields, so nothing unexpected rides along into view state. */
const toWallComplaint = (item: WallComplaint): WallComplaint => ({
  id: item.id,
  subject: item.subject,
  body: item.body,
  senderName: item.senderName,
  senderSpecies: item.senderSpecies,
  submittedAt: item.submittedAt,
});

const readPage = (body: unknown): WallPageResponse | null => {
  if (!isRecord(body) || !Array.isArray(body['items'])) return null;
  const cursor = body['nextCursor'];
  if (cursor !== null && typeof cursor !== 'string') return null;
  const raw: readonly unknown[] = body['items'];
  const items = raw.filter(isWallComplaint).map(toWallComplaint);
  // Items sent but none readable is a broken response (schema drift, a bug), never an empty
  // wall: it fails as `unexpected` and the board offers a retry instead of "nothing pinned".
  if (raw.length > 0 && items.length === 0) return null;
  return { items, nextCursor: cursor };
};

const readSubmitted = (body: unknown): SubmitComplaintResponse | null =>
  isRecord(body) && typeof body['id'] === 'string' && body['status'] === 'pending'
    ? { id: body['id'], status: 'pending' }
    : null;

const readErrorCode = (body: unknown): ApiErrorCode | null => {
  if (!isRecord(body) || !isRecord(body['error'])) return null;
  const code = body['error']['code'];
  return typeof code === 'string' ? (code as ApiErrorCode) : null;
};

const REFUSED_CODES: ReadonlySet<ApiErrorCode> = new Set([
  'invalid-complaint',
  'invalid-request',
  'invalid-json',
  'payload-too-large',
  'unsupported-media-type',
]);

/** Seconds from `Retry-After` (delta-seconds only; the API never sends a date). */
const retryAfter = (header: string | null): number | undefined => {
  if (header === null || !/^\d{1,6}$/u.test(header.trim())) return undefined;
  return Number(header.trim());
};

export const classifyWallResponse = (
  status: number,
  body: unknown,
  retryAfterHeader: string | null = null,
): WallFailure => {
  const code = readErrorCode(body);
  const base = { status, code };
  if (status === 429) {
    const seconds = retryAfter(retryAfterHeader);
    return {
      ...base,
      kind: 'rate-limited',
      ...(seconds === undefined ? {} : { retryAfterSeconds: seconds }),
    };
  }
  if (code === 'invalid-cursor') return { ...base, kind: 'invalid-cursor' };
  if (status === 503 || status === 403) return { ...base, kind: 'unavailable' };
  if ((status === 400 || status === 413 || status === 415) && code !== null && REFUSED_CODES.has(code)) {
    return { ...base, kind: 'refused' };
  }
  return { ...base, kind: 'unexpected' };
};

const noResponse = (kind: WallFailureKind): WallFailure => ({ kind, status: null, code: null });

/** Settles with `promise`, or rejects as soon as `signal` aborts. */
const untilAborted = <T>(promise: Promise<T>, signal: AbortSignal): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });

export function createWallClient({
  baseUrl,
  fetch: fetchImpl = (input, init) => globalThis.fetch(input, init),
  timeoutMs = WALL_TIMEOUT_MS,
}: WallClientOptions): WallClient {
  const root = baseUrl.replace(/\/+$/u, '');

  const exchange = async <T>(
    path: string,
    init: RequestInit,
    accept: (body: unknown) => T | null,
    callerSignal?: AbortSignal,
  ): Promise<WallResult<T>> => {
    if (callerSignal?.aborted) return { ok: false, failure: noResponse('aborted') };
    // One controller for the whole exchange: the timer and the caller both abort it, and the
    // body read is raced against it too, so a stalled body cannot hang the board.
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onCallerAbort = () => controller.abort();
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
    const lost = (): WallResult<T> => ({
      ok: false,
      failure: noResponse(timedOut ? 'timeout' : callerSignal?.aborted ? 'aborted' : 'network'),
    });
    try {
      let response: Response;
      try {
        response = await untilAborted(
          fetchImpl(`${root}${path}`, {
            ...init,
            // Public and anonymous: no cookies, no referrer leaking the visitor's page.
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            mode: 'cors',
            signal: controller.signal,
          }),
          controller.signal,
        );
      } catch {
        return lost();
      }
      let body: unknown;
      try {
        body = await untilAborted(response.json() as Promise<unknown>, controller.signal);
      } catch {
        if (controller.signal.aborted) return lost();
        body = undefined;
      }
      if (!response.ok) {
        return {
          ok: false,
          failure: classifyWallResponse(response.status, body, response.headers.get('retry-after')),
        };
      }
      const value = accept(body);
      return value === null
        ? { ok: false, failure: { kind: 'unexpected', status: response.status, code: null } }
        : { ok: true, value };
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    }
  };

  return {
    list: ({ cursor, limit = WALL_PAGE_SIZE, signal } = {}) => {
      const query = new URLSearchParams({ limit: String(limit) });
      if (cursor) query.set('cursor', cursor);
      return exchange(
        `/complaints?${query.toString()}`,
        { method: 'GET', headers: { accept: 'application/json' } },
        readPage,
        signal,
      );
    },
    submit: (complaint, signal) => {
      // Exactly the four keys the API accepts; it refuses any other.
      const payload: SubmitComplaintRequest = {
        subject: complaint.subject,
        body: complaint.body,
        senderName: complaint.senderName,
        senderSpecies: complaint.senderSpecies ?? null,
      };
      return exchange(
        '/complaints',
        {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          cache: 'no-store',
        },
        readSubmitted,
        signal,
      );
    },
  };
}
