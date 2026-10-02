# Code Logic Review — `security-hardening`

## Summary

| Metric              | Value                                |
| ------------------- | ------------------------------------ |
| Overall score       | 8.5/10                               |
| Assessment          | APPROVED                             |
| Blocking issues     | 0                                    |
| Serious issues      | 0                                    |
| Moderate issues     | 1                                    |
| Minor / Info issues | 4                                    |
| Failure modes found | 4                                    |

The `security-hardening` implementation provides high-assurance defence-in-depth across the static site build pipeline, API boundary, and moderation console. Content Security Policy is generated directly from build-time Vite environment variables, eliminating configuration drift. The API guarantees strict security headers across all status codes and methods (including CORS preflights, health checks, and 500 errors). Public UGC is guarded against stored XSS with zero HTML sinks across production code, verified plain-text React rendering, and strict Unicode sanitisation (C0/C1, bidi controls, unpaired UTF-16 surrogates). Abuse throttling handles malformed submissions before request bodies are consumed, backed by bounded in-memory LRU storage and constant-time secret comparison.

---

## Five logic questions

### 1. How does this fail silently?
- **Unverified semicolon in URL origin**: In [tools/deploy/csp.ts:48-58](file:///D:/projects/qa3elhamor/tools/deploy/csp.ts#L48-L58) and [libs/telemetry/data-access/src/lib/analytics-config.ts:60-71](file:///D:/projects/qa3elhamor/libs/telemetry/data-access/src/lib/analytics-config.ts#L60-L71), `new URL(raw).origin` permits a semicolon inside the host portion (e.g., `https://wall.example.org;sandbox`). Because the origin is interpolated into the CSP string without sanitising semicolons, it injects a directive boundary silently at build time without failing the build or alerting the developer.
- **CDN Purge failure on approved complaint deletion**: In [libs/complaints/feature-api/src/lib/moderation.handler.ts:114-118](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/moderation.handler.ts#L114-L118), if `deps.cachePurger.purgeWall()` rejects (e.g., CDN API outage or 502), the error is reported via `reportError` and swallowed, returning HTTP 200 to the moderator. While intentional to prevent retry storms on committed state transitions, the stale content remains cached on CDN edge caches for up to 6 minutes without client notification.

### 2. What user action produces unexpected behaviour?
- **Moderator attempting to `reject` an already `approved` complaint**: In [libs/complaints/feature-api/src/lib/moderation.handler.ts:101-102](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/moderation.handler.ts#L101-L102) and [libs/complaints/domain/src/lib/complaint-lifecycle.ts:44-46](file:///D:/projects/qa3elhamor/libs/complaints/domain/src/lib/complaint-lifecycle.ts#L44-L46), `PUBLIC_TRANSITIONS.reject` only defines transitions from `pending -> rejected`. If an operator sends `POST /moderation/complaints/:id/reject` on an approved complaint, the server responds with 409 `conflict`. The only permitted transition off the wall is `POST /moderation/complaints/:id/delete`. While the UI in [apps/web/src/moderation/complaint-card.tsx:14](file:///D:/projects/qa3elhamor/apps/web/src/moderation/complaint-card.tsx#L14) only displays the "Delete" action for approved complaints, API consumers or direct curl scripts receive a 409 error.
- **Client IP header rotation by an attacker**: Rotating spoofed client IP headers directly against the API without passing through the trusted edge proxy produces HTTP 503 `client-ip-unavailable` rather than bypassing rate limits, because `clientIpReader` in [apps/api/src/lib/create-api.ts:20-24](file:///D:/projects/qa3elhamor/apps/api/src/lib/create-api.ts#L20-L24) enforces `EDGE_AUTH_SECRET`.

### 3. What input data produces a wrong answer?
- **Unpaired UTF-16 surrogates in JSON payloads**: JSON escapes such as `\ud800` produce lone surrogates. Prior to hardening, PostgreSQL / Prisma UTF-8 transcoding would convert these to U+FFFD replacement characters. In [libs/complaints/domain/src/lib/text-rules.ts:34-35](file:///D:/projects/qa3elhamor/libs/complaints/domain/src/lib/text-rules.ts#L34-L35), `containsForbiddenCharacter` identifies lone surrogates in the `0xd800-0xdfff` range and rejects the complaint as `control-character`, preventing corrupted storage.
- **Bidi directional isolate overrides**: Unicode characters `U+202A` to `U+202E` and `U+2066` to `U+2069` that flip visual rendering order are rejected at the domain boundary ([libs/complaints/domain/src/lib/text-rules.ts:31-33](file:///D:/projects/qa3elhamor/libs/complaints/domain/src/lib/text-rules.ts#L31-L33)), preventing visual spoofing of moderator text.

### 4. What happens when a dependency fails?
- **Prisma/Database pool unavailable**: In [apps/api/src/lib/create-api.ts:48-51](file:///D:/projects/qa3elhamor/apps/api/src/lib/create-api.ts#L48-L51), when `DATABASE_URL` is omitted or null, `deps.wall` is set to `null`. Wall endpoints (`/api/complaints`, `/api/moderation/*`) return HTTP 503 `wall-unavailable`, while `/health` continues to return HTTP 200 with all `API_SECURITY_HEADERS`.
- **Edge Auth header missing**: In [apps/api/src/lib/create-api.ts:20-25](file:///D:/projects/qa3elhamor/apps/api/src/lib/create-api.ts#L20-L25), if `EDGE_AUTH_SECRET` is configured and a request arrives without the valid proof header, `clientIp` returns `null`. Under default `CLIENT_IP_FALLBACK=reject`, [libs/complaints/feature-api/src/lib/submit-complaint.handler.ts:82](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/submit-complaint.handler.ts#L82) rejects with HTTP 503 `client-ip-unavailable`, preventing forged IP abuse.
- **CDN Purge API rejects or times out**: In [libs/complaints/feature-api/src/lib/moderation.handler.ts:114-118](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/moderation.handler.ts#L114-L118), failure of `purgeWall()` is caught and logged via `deps.reportError`. The moderation response still succeeds with HTTP 200, ensuring state transitions remain durable.

### 5. What is missing that the requirements never mentioned?
- **Check for `PLACEHOLDER_SECRET_PREFIX` in `EDGE_AUTH_SECRET`**: While `IP_HASH_SALT` and `MODERATION_TOKEN` reject the `change-me` prefix when `NODE_ENV=production` ([libs/complaints/feature-api/src/lib/config.ts:92-96](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/config.ts#L92-L96)), [apps/api/src/lib/api-config.ts:54-64](file:///D:/projects/qa3elhamor/apps/api/src/lib/api-config.ts#L54-L64) only validates that `EDGE_AUTH_SECRET` has at least 24 characters and does not check for `change-me` in production.
- **Database-level length constraints**: Length limits (subject 120, body 2000, name 60, species 40) are strictly enforced in domain TypeScript ([libs/complaints/domain/src/lib/complaint-fields.ts](file:///D:/projects/qa3elhamor/libs/complaints/domain/src/lib/complaint-fields.ts)), but PostgreSQL tables lack SQL `CHECK (char_length(...) <= N)` constraints as a final backstop.

---

## Failure modes

### FM-1: CSP Directive Splitting via Semicolon in External URL
- **Trigger**: Setting `VITE_WALL_API_URL` (or `VITE_ANALYTICS_SCRIPT_SRC`) to a value containing a semicolon in the authority (e.g., `https://api.example.com;sandbox`).
- **Symptom**: Generated `<meta>` tag contains an unintended directive separator `;` (e.g., `connect-src 'self' blob: data: https://api.example.com;sandbox; ...`), inadvertently activating directives like `sandbox` or causing CSP parser syntax errors.
- **Evidence**: [tools/deploy/csp.ts:50-58](file:///D:/projects/qa3elhamor/tools/deploy/csp.ts#L50-L58), [libs/telemetry/data-access/src/lib/analytics-config.ts:63-71](file:///D:/projects/qa3elhamor/libs/telemetry/data-access/src/lib/analytics-config.ts#L63-L71).
- **Current handling**: `wallApiOrigin` only tests URL parsing, protocol, username/password, and localhost HTTP; it does not check if the resulting `url.origin` contains `;`.
- **Recommendation**: Validate `url.origin` with `/^[a-z][a-z0-9+.-]*:\/\/[a-z0-9.-]+(:[0-9]+)?$/i` or check `if (url.origin.includes(';')) throw new CspConfigError(...)`.

### FM-2: Placeholder Secret Accidental Use for `EDGE_AUTH_SECRET` in Production
- **Trigger**: Copying `.env.example` to production and setting `EDGE_AUTH_SECRET=change-me-local-dev-edge-auth-secret-12345` with `NODE_ENV=production`.
- **Symptom**: Server starts successfully using a known, public edge secret.
- **Evidence**: [apps/api/src/lib/api-config.ts:54-64](file:///D:/projects/qa3elhamor/apps/api/src/lib/api-config.ts#L54-L64).
- **Current handling**: Verifies `secret.length >= MIN_SECRET_LENGTH` (24 characters), but does not verify against `PLACEHOLDER_SECRET_PREFIX` in production.
- **Recommendation**: Add `if (production && secret.toLowerCase().startsWith(PLACEHOLDER_SECRET_PREFIX)) throw new ComplaintsConfigError(...)`.

### FM-3: In-Memory Limiter Reset During Serverless Scaling
- **Trigger**: Distributed request burst or rapid worker cycling in serverless environments (Netlify functions).
- **Symptom**: An attacker rotating through serverless execution contexts resets the in-memory failure counts.
- **Evidence**: [libs/complaints/feature-api/src/lib/failure-limiter.ts:40-45](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/failure-limiter.ts#L40-L45).
- **Current handling**: Bounded in-process LRU Map (`DEFAULT_MAX_CLIENTS = 10_000`, 30 failures / 10 min window). Documented as best-effort.
- **Recommendation**: Rely on edge-level rate limiting (Netlify edge rules / Cloudflare WAF) for absolute flood protection, as noted on the owner checklist.

### FM-4: Moderator `Reject` on Already Approved Complaint Yields 409
- **Trigger**: Sending `POST /moderation/complaints/:id/reject` for a complaint with status `approved`.
- **Symptom**: API returns 409 `conflict`.
- **Evidence**: [libs/complaints/domain/src/lib/complaint-lifecycle.ts:45](file:///D:/projects/qa3elhamor/libs/complaints/domain/src/lib/complaint-lifecycle.ts#L45), [libs/complaints/feature-api/src/lib/moderation.handler.ts:102](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/moderation.handler.ts#L102).
- **Current handling**: Only `delete` is permitted from `approved` status (`PUBLIC_TRANSITIONS.delete`).
- **Recommendation**: Ensure API documentation clarifies that removing approved content from the wall must use the `/delete` action.

---

## Blocking issues

None. No vulnerability allows stored XSS, secret exfiltration, or unauthenticated state change.

---

## Serious issues

None.

---

## Moderate and minor issues

### Finding 1 [Moderate]: Semicolon character not barred from origin in `wallApiOrigin` and `parseScriptUrl`
- **File**: [tools/deploy/csp.ts:50-58](file:///D:/projects/qa3elhamor/tools/deploy/csp.ts#L50-L58), [libs/telemetry/data-access/src/lib/analytics-config.ts:63-71](file:///D:/projects/qa3elhamor/libs/telemetry/data-access/src/lib/analytics-config.ts#L63-L71)
- **Scenario**: An environment variable `VITE_WALL_API_URL` or `VITE_ANALYTICS_SCRIPT_SRC` containing a semicolon (e.g. `https://api.example.com;sandbox`) produces a valid URL according to the WHATWG parser, whose `.origin` retains the semicolon.
- **Impact**: When formatted into the CSP string, it injects a directive break (`;`), potentially terminating or injecting unintended standalone directives.
- **Fix**: Check `if (url.origin.includes(';') || url.origin.includes(' ')) return invalidWall();`.

### Finding 2 [Minor]: `EDGE_AUTH_SECRET` does not reject `change-me` placeholder prefix in production
- **File**: [apps/api/src/lib/api-config.ts:54-64](file:///D:/projects/qa3elhamor/apps/api/src/lib/api-config.ts#L54-L64)
- **Scenario**: If an operator configures `EDGE_AUTH_SECRET` with the placeholder from `.env.example` in a production environment (`NODE_ENV=production`), the check passes because it satisfies the 24-character minimum.
- **Impact**: Publicly known secret string could be accepted in production.
- **Fix**: Align `edgeAuthFrom` with `secret()` in [libs/complaints/feature-api/src/lib/config.ts:92-96](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/config.ts#L92-L96) to throw on `PLACEHOLDER_SECRET_PREFIX`.

### Finding 3 [Minor / Info]: CDN purge semantics distinction between `reject` and `delete`
- **File**: [libs/complaints/feature-api/src/lib/moderation.handler.ts:111-119](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/moderation.handler.ts#L111-L119)
- **Scenario**: Cache purging only triggers when `current.status === 'approved' && next.status !== 'approved'`. Rejecting a pending complaint never purges (correct, as it was never on the wall). Rejecting an approved complaint returns 409 conflict because `approved -> rejected` is disallowed in domain lifecycle. Only `delete` transitions `approved -> deleted` and calls `deps.cachePurger.purgeWall()`.
- **Impact**: Purely semantic; API consumers must use `delete` to revoke approved items.
- **Fix**: Document this requirement in `docs/security.md` and API specifications.

### Finding 4 [Minor / Info]: Shared bucket fallback for missing client IP creates single rate-limit bottleneck if misconfigured
- **File**: [libs/complaints/feature-api/src/lib/config.ts:100-105](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/config.ts#L100-L105), [libs/complaints/feature-api/src/lib/submit-complaint.handler.ts:87](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/submit-complaint.handler.ts#L87)
- **Scenario**: Setting `CLIENT_IP_FALLBACK=shared` pools all unidentified clients into `UNIDENTIFIED_CLIENT = 'unidentified'`.
- **Impact**: A single client can lock out all other unidentified clients.
- **Fix**: The default is safely `CLIENT_IP_FALLBACK=reject` (returning 503). Maintain `reject` as mandatory in production.

### Finding 5 [Minor / Info]: Moderation console vendor chunk imports Meshopt WASM
- **File**: [apps/web/vite.config.mts:57-60](file:///D:/projects/qa3elhamor/apps/web/vite.config.mts#L57-L60), [apps/web/moderation.html:22](file:///D:/projects/qa3elhamor/apps/web/moderation.html#L22)
- **Scenario**: Moderation HTML bundle imports `vendor-r3f` / `vendor-drei` chunk groupings, pulling in Three.js and triggering Meshopt WebAssembly instantiation attempts in console.
- **Impact**: Blocked safely by moderation CSP (`wasm-eval` violation in console); no security leak, but causes unnecessary JS bundle size download (~1 MB) and benign console noise.
- **Fix**: Separate moderation console vendor chunking in `vite.config.mts` `advancedChunks`.

---

## Data flow

1. **Client Submission Request (`POST /api/complaints`)**
   - **Step 1**: Router matches route, checks CORS origins [apps/api/src/lib/router.ts:114](file:///D:/projects/qa3elhamor/apps/api/src/lib/router.ts#L114) — [OK]
   - **Step 2**: IP header extracted; `EDGE_AUTH_SECRET` validated in constant time via `secretMatches` [apps/api/src/lib/create-api.ts:22](file:///D:/projects/qa3elhamor/apps/api/src/lib/create-api.ts#L22) — [OK]
   - **Step 3**: IP canonicalized via `rateLimitSubject` (IPv4 raw, IPv6 /64 prefix normalized) [libs/complaints/feature-api/src/lib/security.ts:38-55](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/security.ts#L38-L55) — [OK]
   - **Step 4**: `failureLimiter.check()` inspected before reading stream [libs/complaints/feature-api/src/lib/submit-complaint.handler.ts:89](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/submit-complaint.handler.ts#L89) — [OK: 429 returned with unread body if throttled]
   - **Step 5**: Body stream read under strict 12 KiB cap, strict UTF-8 decoding (`fatal: true`), parsed without reflection [libs/complaints/feature-api/src/lib/http.ts:104-145](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/http.ts#L104-L145) — [OK]
   - **Step 6**: Domain validation rejects C0/C1, bidi, and lone UTF-16 surrogates [libs/complaints/domain/src/lib/text-rules.ts:24-35](file:///D:/projects/qa3elhamor/libs/complaints/domain/src/lib/text-rules.ts#L24-L35) — [OK]
   - **Step 7**: DB submission rate limit evaluated transactionally, HMAC-hashed client IP stored [libs/complaints/feature-api/src/lib/submit-complaint.handler.ts:115](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/submit-complaint.handler.ts#L115) — [OK]
   - **Step 8**: Stamped with `API_SECURITY_HEADERS` (`nosniff`, `default-src 'none'; sandbox`, `DENY`, `no-referrer`, `same-origin`, `noindex`) on exit [apps/api/src/lib/router.ts:145](file:///D:/projects/qa3elhamor/apps/api/src/lib/router.ts#L145) — [OK]

2. **Moderator Decision Request (`POST /api/moderation/complaints/:id/:action`)**
   - **Step 1**: Token length pre-checked (< 1024), constant-time SHA-256 digest comparison against `MODERATION_TOKEN` [libs/complaints/feature-api/src/lib/security.ts:77-88](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/security.ts#L77-L88) — [OK]
   - **Step 2**: Throttled on bad token attempts via `InMemoryFailureLimiter` [libs/complaints/feature-api/src/lib/moderation.handler.ts:35-46](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/moderation.handler.ts#L35-L46) — [OK]
   - **Step 3**: Lifecycle transition verified [libs/complaints/domain/src/lib/complaint.ts:226](file:///D:/projects/qa3elhamor/libs/complaints/domain/src/lib/complaint.ts#L226) — [OK]
   - **Step 4**: State committed to database [libs/complaints/feature-api/src/lib/moderation.handler.ts:108](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/moderation.handler.ts#L108) — [OK]
   - **Step 5**: If approved complaint is deleted, `cachePurger.purgeWall()` called; failures caught and logged [libs/complaints/feature-api/src/lib/moderation.handler.ts:111-119](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/moderation.handler.ts#L111-L119) — [OK]

3. **Public Wall Listing & Rendering**
   - **Step 1**: Wall query returns plain text JSON [libs/complaints/feature-api/src/lib/list-wall.handler.ts:38](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/list-wall.handler.ts#L38) — [OK: unescaped in transit, as required by design]
   - **Step 2**: Rendered exclusively as plain text React JSX children (`{complaint.body}`) or textContent [apps/web/src/moderation/complaint-card.tsx:58](file:///D:/projects/qa3elhamor/apps/web/src/moderation/complaint-card.tsx#L58) — [OK: zero HTML sinks]

---

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| CSP per build mode (dev vs prod; WebGL & Analytics support) | COMPLETE | None; verified zero violations with Meshopt WASM and Plausible/Umami |
| Connect-src hosts derived from Vite env without drift | COMPLETE | Linked via shared `resolveAnalyticsConfig` and `publicSiteOrigins` |
| Moderation CSP with Trusted Types | COMPLETE | Enforces `require-trusted-types-for 'script'; trusted-types 'none'` |
| API Security Headers across all responses (errors, preflights) | COMPLETE | Router wrapper ensures all responses carry `API_SECURITY_HEADERS` |
| Failure Limiter (bounded memory, pre-body check, non-bypassable) | COMPLETE | LRU bounded to 10k clients, streams cancelled early upon throttling |
| Client-IP trust & Edge Auth Secret | COMPLETE | Forgeable headers rejected at boot, `EDGE_AUTH_SECRET` compared in constant time |
| Production placeholder secret guard | PARTIAL | Enforced on `IP_HASH_SALT` and `MODERATION_TOKEN`; `EDGE_AUTH_SECRET` lacks the check |
| Body cap (12 KiB) & Surrogate validation | COMPLETE | 12 KiB accommodates worst-case 4-byte UTF-8, surrogates refused as control characters |
| Stored XSS defense & HTML sink verification | COMPLETE | Verbatim storage/transport contract verified; 0 production HTML sinks |
| CDN purge hook on withdrawal | COMPLETE | Fires on `approved -> deleted`; non-blocking error handling |
| Repo hygiene & Secret elimination | COMPLETE | No secrets in git; `.gitignore` protects `.env*` excluding `.env.example` |

Implicit requirements not addressed: None.

---

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| Client sends 100 MB body | YES | Rejected at `declared > maxBytes` or streaming abort after 12 KiB ([libs/complaints/feature-api/src/lib/http.ts:123](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/http.ts#L123)) | None |
| Unpaired high/low UTF-16 surrogate in JSON string | YES | Flagged by `containsForbiddenCharacter` and rejected with 400 `invalid-complaint` | None |
| Client sends duplicate IP headers (`a, b`) | YES | Fetch API joins headers with comma; `rateLimitSubject` fails `isIP` check and returns null | None |
| IPv6 client rotates interface ID within /64 | YES | Subnet normalized to `/64` prefix, sharing rate-limit bucket ([libs/complaints/feature-api/src/lib/security.ts:54](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/security.ts#L54)) | None |
| Attacker floods with 100,000 distinct IP addresses | YES | `InMemoryFailureLimiter` evicts oldest entries once Map reaches 10,000 keys | None; bounded memory |
| Host cannot set headers (GitHub Pages) | YES | Build-time `<meta>` CSP tags injected immediately after `<meta charset>` | Framing/XFO cannot be set via meta (accepted & documented) |

---

## Verdict

- Recommendation: **APPROVED**
- Confidence: **HIGH**
- Top risk: Semicolon in configured external origins (`VITE_WALL_API_URL`) could split directives in the generated CSP `<meta>` string.
- What a robust implementation would add:
  1. Add a semicolon and space sanity check to `wallApiOrigin` and `parseScriptUrl`.
  2. Extend `PLACEHOLDER_SECRET_PREFIX` checks to `EDGE_AUTH_SECRET` in `loadApiConfig`.
  3. Add `react/no-danger: error` to `apps/web/eslint.config.mjs` as a compile-time lint gate for future web development.
