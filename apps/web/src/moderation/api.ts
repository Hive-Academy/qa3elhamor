import type {
  ApiErrorResponse,
  ModerationAction,
  ModerationActionResponse,
  ModerationComplaint,
  ModerationPageResponse,
  ModerationStatus,
} from '@qa3elhamor/shared-api-interfaces';

/**
 * How a moderation request failed, reduced to what the view has to do about it:
 * `unauthorized` signs the moderator out, `conflict` refreshes the list, `disabled` explains
 * that the server has no token configured, and everything else is shown as a retryable error.
 */
export type ModerationFailureKind =
  | 'unauthorized'
  | 'conflict'
  | 'not-found'
  | 'invalid-cursor'
  | 'disabled'
  | 'unavailable'
  | 'network'
  | 'timeout'
  | 'unexpected';

export interface ModerationFailure {
  readonly kind: ModerationFailureKind;
  /** HTTP status, or `null` when no response arrived. */
  readonly status: number | null;
  readonly message: string;
}

export type ModerationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: ModerationFailure };

export interface ModerationClient {
  list(status: ModerationStatus, cursor?: string | null): Promise<ModerationResult<ModerationPageResponse>>;
  act(id: string, action: ModerationAction): Promise<ModerationResult<ModerationComplaint>>;
}

export interface ModerationClientOptions {
  /** The moderation bearer token. Sent only in the `Authorization` header, never in a URL. */
  readonly token: string;
  /** API root without a trailing slash; the page is served beside the API, so `/api`. */
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  /** Abort a request that has not answered after this long, so the view never spins forever. */
  readonly timeoutMs?: number;
}

const FAILURE_MESSAGES: Readonly<Record<ModerationFailureKind, string>> = {
  unauthorized: 'Invalid token. Enter the moderation token again.',
  conflict: 'This complaint was already moderated, possibly in another tab. The list has been refreshed.',
  'not-found': 'This complaint no longer exists. The list has been refreshed.',
  'invalid-cursor': 'The list changed while paging. It has been reloaded from the start.',
  disabled: 'Moderation is disabled on the server: no moderation token is configured.',
  unavailable: 'The complaints wall is unavailable right now. Try again shortly.',
  network: 'Could not reach the server. Check the connection and try again.',
  timeout: 'The server took too long to answer. Try again.',
  unexpected: 'The server returned an unexpected response. Try again.',
};

const failure = (kind: ModerationFailureKind, status: number | null): ModerationFailure => ({
  kind,
  status,
  message: FAILURE_MESSAGES[kind],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readErrorCode = (body: unknown): ApiErrorResponse['error']['code'] | null => {
  if (!isRecord(body) || !isRecord(body['error'])) return null;
  const code = body['error']['code'];
  return typeof code === 'string' ? (code as ApiErrorResponse['error']['code']) : null;
};

const classify = (status: number, body: unknown): ModerationFailure => {
  const code = readErrorCode(body);
  if (status === 401) return failure('unauthorized', status);
  if (status === 409) return failure('conflict', status);
  if (status === 404) return failure('not-found', status);
  if (status === 400 && code === 'invalid-cursor') return failure('invalid-cursor', status);
  if (status === 503) return failure(code === 'moderation-disabled' ? 'disabled' : 'unavailable', status);
  return failure('unexpected', status);
};

const STATUSES: readonly ModerationStatus[] = ['pending', 'approved', 'rejected', 'deleted'];

const isComplaint = (value: unknown): value is ModerationComplaint =>
  isRecord(value) &&
  typeof value['id'] === 'string' &&
  typeof value['subject'] === 'string' &&
  typeof value['body'] === 'string' &&
  typeof value['senderName'] === 'string' &&
  (value['senderSpecies'] === null || typeof value['senderSpecies'] === 'string') &&
  typeof value['submittedAt'] === 'string' &&
  typeof value['updatedAt'] === 'string' &&
  STATUSES.includes(value['status'] as ModerationStatus);

const isPage = (value: unknown): value is ModerationPageResponse =>
  isRecord(value) &&
  Array.isArray(value['items']) &&
  value['items'].every(isComplaint) &&
  (value['nextCursor'] === null || typeof value['nextCursor'] === 'string');

const isActionResponse = (value: unknown): value is ModerationActionResponse =>
  isRecord(value) && isComplaint(value['complaint']);

/** Parses a JSON body; a body that is not JSON reads as `undefined` and fails validation. */
const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

/** A typed client for `/api/moderation/*`. It never throws and never logs the token. */
export const createModerationClient = ({
  token,
  baseUrl = '/api',
  fetch: fetchImpl = globalThis.fetch.bind(globalThis),
  timeoutMs = 15_000,
}: ModerationClientOptions): ModerationClient => {
  const request = async <T>(
    path: string,
    init: RequestInit,
    accept: (body: unknown) => T | null
  ): Promise<ModerationResult<T>> => {
    const signal = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
        credentials: 'omit',
        cache: 'no-store',
        signal,
      });
    } catch {
      // An aborted signal means our timeout fired; anything else fetch throws is transport.
      return { ok: false, failure: failure(signal.aborted ? 'timeout' : 'network', null) };
    }
    const body = await readJson(response);
    if (!response.ok) return { ok: false, failure: classify(response.status, body) };
    const value = accept(body);
    return value === null ? { ok: false, failure: failure('unexpected', response.status) } : { ok: true, value };
  };

  return {
    list: (status, cursor) => {
      const query = new URLSearchParams({ status });
      if (cursor) query.set('cursor', cursor);
      return request(`/moderation/complaints?${query.toString()}`, { method: 'GET' }, (body) =>
        isPage(body) ? body : null
      );
    },
    act: (id, action) =>
      request(
        `/moderation/complaints/${encodeURIComponent(id)}/${action}`,
        { method: 'POST' },
        (body) => (isActionResponse(body) ? body.complaint : null)
      ),
  };
};
