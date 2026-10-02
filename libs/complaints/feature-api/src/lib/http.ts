import type {
  ApiErrorCode,
  ApiErrorResponse,
  ApiFieldIssue,
} from '@qa3elhamor/shared-api-interfaces';

/**
 * Fixed, client-safe text per error code. Responses carry only these strings (and the
 * domain's field issues), never an exception message, stack, SQL or configuration detail.
 */
const ERROR_MESSAGES: Readonly<Record<ApiErrorCode, string>> = {
  'invalid-json': 'The request body is not valid JSON.',
  'invalid-request': 'The request is malformed.',
  'invalid-complaint': 'The complaint was refused. See `issues`.',
  'invalid-cursor': 'The pagination cursor is not valid.',
  'unsupported-media-type': 'Send the body as application/json.',
  'payload-too-large': 'The request body is too large.',
  'rate-limited': 'Too many complaints from this reef. Try again later.',
  unauthorized: 'A valid moderation token is required.',
  'forbidden-origin': 'This origin may not call the API.',
  'not-found': 'Not found.',
  'method-not-allowed': 'Method not allowed.',
  conflict: 'The complaint changed or cannot take that action.',
  'wall-unavailable': 'The complaints wall is unavailable.',
  'client-ip-unavailable': 'Submissions are temporarily unavailable.',
  'moderation-disabled': 'Moderation is not configured on this deployment.',
  'internal-error': 'Something went wrong.',
};

/**
 * Sent on every API response (the router in `apps/api` also stamps them on responses it builds
 * itself: health, 404, 405, CORS preflights). The API only ever returns JSON, so the policy is
 * the tightest one possible: if a browser is ever tricked into rendering a response as a
 * document (a complaint body containing markup, opened directly), nothing in it can load,
 * run, be framed or submit anywhere.
 *
 * - `nosniff`: the declared `application/json` is final; no MIME sniffing into HTML or script.
 * - CSP `default-src 'none'` plus the directives that do not fall back to it.
 * - `X-Frame-Options` duplicates `frame-ancestors` for browsers without CSP level 2.
 * - `no-referrer`: API URLs (cursors, complaint ids) never leak onward.
 * - `same-origin` CORP: other sites cannot embed responses through no-cors requests; CORS
 *   fetches from `CORS_ALLOWED_ORIGINS` are unaffected.
 * - `X-Robots-Tag`: the API is not content; keep the wall JSON and every moderation route out
 *   of search indexes and caches.
 */
export const API_SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'content-security-policy':
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox",
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
  'x-robots-tag': 'noindex, nofollow, noarchive',
} as const;

const BASE_HEADERS = {
  ...API_SECURITY_HEADERS,
  'content-type': 'application/json; charset=utf-8',
  // Dynamic by default; the wall listing overrides this with CDN-friendly caching.
  'cache-control': 'no-store',
} as const;

export const jsonResponse = (
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {}
): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } });

export const errorResponse = (
  status: number,
  code: ApiErrorCode,
  options: {
    readonly issues?: readonly ApiFieldIssue[];
    readonly headers?: Readonly<Record<string, string>>;
  } = {}
): Response => {
  const body: ApiErrorResponse = {
    error: {
      code,
      message: ERROR_MESSAGES[code],
      ...(options.issues === undefined ? {} : { issues: options.issues }),
    },
  };
  return jsonResponse(status, body, options.headers);
};

/** 429 with `Retry-After`, for the submission limit and the failure limiter alike. */
export const rateLimitedResponse = (retryAfterSeconds: number): Response =>
  errorResponse(429, 'rate-limited', { headers: { 'retry-after': String(retryAfterSeconds) } });

export type BodyReadResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly response: Response };

const isJsonMediaType = (contentType: string | null): boolean =>
  contentType !== null &&
  (contentType.split(';')[0] ?? '').trim().toLowerCase() === 'application/json';

/**
 * Reads and parses a JSON body under a hard byte cap. `Content-Length` is used only to refuse
 * early; the stream itself is counted, since the header can lie or be absent (chunked).
 */
export const readJsonBody = async (
  request: Request,
  maxBytes: number
): Promise<BodyReadResult> => {
  if (!isJsonMediaType(request.headers.get('content-type'))) {
    return { ok: false, response: errorResponse(415, 'unsupported-media-type') };
  }
  const tooLarge = { ok: false, response: errorResponse(413, 'payload-too-large') } as const;
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) return tooLarge;

  const chunks: Uint8Array[] = [];
  let received = 0;
  if (request.body !== null) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        return tooLarge;
      }
      chunks.push(value);
    }
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    // `fatal` refuses invalid UTF-8 instead of silently substituting U+FFFD.
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    // Deliberately swallowed: the parser's message may quote the input back.
    return { ok: false, response: errorResponse(400, 'invalid-json') };
  }
};
