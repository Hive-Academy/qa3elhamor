# Code Logic Review — `complaints-api`

## Summary

| Metric              | Value                                |
| ------------------- | ------------------------------------ |
| Overall score       | 7/10                                 |
| Assessment          | REVISE                               |
| Blocking issues     | 0                                    |
| Serious issues      | 2                                    |
| Moderate issues     | 3                                    |
| Minor issues        | 3                                    |
| Failure modes found | 5                                    |

The `complaints-api` implementation is cleanly architected with strong domain boundaries, parameterized SQL operations, database-level CHECK constraints, constant-time bearer authentication, and stream-based body caps. However, revision is required before deployment due to two serious logic issues:
1. **IPv6 Rate-Limiting Bypass:** Lack of `/64` subnet grouping and IP canonicalization enables attackers on IPv6 connections to rotate addresses and bypass submission limits completely.
2. **Global Delete Contention in Rate Limiter Transaction:** `PrismaSubmissionRateLimiter.consume` performs an unbounded, table-wide `deleteMany` across all clients' submission logs on every single submission inside an advisory-locked transaction, risking deadlocks and lock escalation under concurrent traffic.

---

## Five Logic Questions

### 1. How does this fail silently?
- **IPv6 Subnet Evasion:** In [`libs/complaints/feature-api/src/lib/security.ts:8-11`](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/security.ts#L8-L11), `clientKeyFor` computes HMAC-SHA256 directly on the raw IP string without subnet masking. An attacker allocating a standard IPv6 `/64` prefix generates a distinct hash for each submission, appearing as distinct clients. The rate limiter reports `{ allowed: true }` silently for what is actually an automated flood.
- **Untrusted Header Direct Access:** In [`apps/api/src/lib/create-api.ts:41`](file:///D:/projects/qa3elhamor/apps/api/src/lib/create-api.ts#L41), `request.headers.get(config.clientIpHeader)` trusts the configured header. If the service is accessed directly (bypassing Netlify edge proxies) or if a proxy does not strip client headers, a client can forge the header with arbitrary strings, creating separate rate-limit buckets without triggering warnings.

### 2. What user action produces unexpected behaviour?
- **Legitimate Users Locked Out When Client IP Header is Absent:** If `CLIENT_IP_HEADER` is absent or stripped by an upstream misconfiguration, [`apps/api/src/lib/create-api.ts:41`](file:///D:/projects/qa3elhamor/apps/api/src/lib/create-api.ts#L41) returns `null`. In [`libs/complaints/feature-api/src/lib/security.ts:10`](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/security.ts#L10), `ip ?? 'unknown'` causes **all** clients without an IP header to share a single HMAC bucket. Once any 3 submissions occur globally within 10 minutes, all other legitimate visitors worldwide receive `429 rate-limited`.
- **User Charged Rate Limit Slot on 500 Server Error:** If a client posts a valid complaint, the rate limiter records the submission in `SubmissionLog` ([`libs/complaints/data-access/src/lib/prisma.ts:133`](file:///D:/projects/qa3elhamor/libs/complaints/data-access/src/lib/prisma.ts#L133)). If `wall.complaints.insert(complaint)` subsequently fails ([`libs/complaints/feature-api/src/lib/submit-complaint.handler.ts:103`](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/submit-complaint.handler.ts#L103)) due to a database glitch or connection error, the client receives a 500 error, but their submission quota has already been permanently consumed. Retrying leads to 429.

### 3. What input data produces a wrong answer?
- **Unknown JSON Property Names Echoed in Error Bodies:** In [`libs/complaints/feature-api/src/lib/submit-complaint.handler.ts:31`](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/submit-complaint.handler.ts#L31), unknown keys are parsed and sliced to 64 chars (`key.slice(0, MAX_ECHOED_FIELD_LENGTH)`), then placed into `issues: [{ field: key, reason: 'not-allowed' }]`. Submitting JSON with hundreds of keys containing arbitrary strings or payload snippets causes the server to reflect that untrusted input back to the caller in the response body, contradicting the project invariant that error bodies never echo input.
- **Unnormalized IPv6 Address Variations:** Submitting from `2001:db8::1` versus `2001:0db8:0000:0000:0000:0000:0000:0001` generates completely different HMAC keys because the raw string is hashed directly without canonicalization.

### 4. What happens when a dependency fails?
- **Postgres Down on Startup:** If `DATABASE_URL` is set but the database host is unreachable, `createPrismaClient` initializes the client, but the first database query fails, correctly returning 500 `internal-error` and reporting to `deps.reportError` without exposing credentials or internal errors ([`apps/api/src/lib/router.ts:139`](file:///D:/projects/qa3elhamor/apps/api/src/lib/router.ts#L139)).
- **Postgres Absent by Design:** If `DATABASE_URL` is unset, [`apps/api/src/lib/create-api.ts:29`](file:///D:/projects/qa3elhamor/apps/api/src/lib/create-api.ts#L29) sets `wall: null`. Handlers cleanly return 503 `wall-unavailable` ([`libs/complaints/feature-api/src/lib/submit-complaint.handler.ts:75`](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/submit-complaint.handler.ts#L75)), while `/api/health` remains healthy at 200 OK.
- **Corrupt Database Row:** If a stored complaint fails domain restoration, `fromRow` throws `CorruptComplaintRecordError` ([`libs/complaints/data-access/src/lib/prisma.ts:49`](file:///D:/projects/qa3elhamor/libs/complaints/data-access/src/lib/prisma.ts#L49)), which `router.ts` catches and maps to 500 without leaking the corrupted row.

### 5. What is missing that the requirements never mentioned?
- **Cache Invalidation on Moderation Actions:** Wall listings have `CDN-Cache-Control: public, s-maxage=60, stale-while-revalidate=300` ([`libs/complaints/feature-api/src/lib/list-wall.handler.ts:14`](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/list-wall.handler.ts#L14)). When a moderator subsequently deletes or rejects an abusive or illegal post ([`libs/complaints/feature-api/src/lib/moderation.handler.ts:76`](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/moderation.handler.ts#L76)), no purge or cache-tag eviction event is dispatched. The deleted content can remain publicly visible on CDN edges for up to 5 minutes.
- **L7 Pre-Validation Rate Limiting:** The handler validates body shape, text rules, and profanity/length limits *before* calling the rate limiter ([`libs/complaints/feature-api/src/lib/submit-complaint.handler.ts:83-96`](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/submit-complaint.handler.ts#L83-L96)). Malformed or invalid requests do not count toward limits. While this protects database storage, an attacker can flood the API with millions of invalid complaints to exhaust CPU/memory without ever triggering rate limits.

---

## Failure Modes

### 1. IPv6 Address Rotation Bypass
- **Trigger:** An attacker submits requests from an IPv6 connection, changing the interface identifier (last 64 bits) on each request.
- **Symptom:** Rate limiting never triggers; submission flood succeeds.
- **Evidence:** [`libs/complaints/feature-api/src/lib/security.ts:8-11`](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/security.ts#L8-L11).
- **Current handling:** Hashes the exact `ip` string verbatim.
- **Recommendation:** Normalize the IP address and, if IPv6, truncate/mask to the `/64` prefix before HMAC calculation.

### 2. Deadlock and Contention During Global Submission Log Deletion
- **Trigger:** High burst of concurrent valid submissions from multiple clients.
- **Symptom:** Postgres reports deadlock or lock timeout errors; requests fail with 500 `internal-error`.
- **Evidence:** [`libs/complaints/data-access/src/lib/prisma.ts:136`](file:///D:/projects/qa3elhamor/libs/complaints/data-access/src/lib/prisma.ts#L136).
- **Current handling:** Inside the client's transaction (protected by an advisory lock on `clientKey`), `deleteMany({ where: { submittedAt: { lte: horizon } } })` runs across the entire table without filtering by `clientKey`.
- **Recommendation:** Scope the delete to `{ clientKey, submittedAt: { lte: horizon } }`, or offload table pruning to a background cron job / maintenance task.

### 3. Shared Bucket Denial of Service on Missing IP Header
- **Trigger:** Upstream CDN / reverse proxy configuration error where `x-nf-client-connection-ip` is stripped or not set.
- **Symptom:** All clients worldwide share the string `'unknown'`, reaching the 3-complaints-per-10-minute limit almost immediately.
- **Evidence:** [`apps/api/src/lib/create-api.ts:41`](file:///D:/projects/qa3elhamor/apps/api/src/lib/create-api.ts#L41) and [`libs/complaints/feature-api/src/lib/security.ts:10`](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/security.ts#L10).
- **Current handling:** Defaults `ip` to `null`, which `clientKeyFor` substitutes with `'unknown'`.
- **Recommendation:** In production mode, if `clientIpHeader` is absent, reject submissions with 500 or 503 rather than sharing a global bucket.

### 4. Quota Consumption on Complaint Storage Failure
- **Trigger:** Database transient error or constraint failure during `wall.complaints.insert(complaint)` after rate limiter check.
- **Symptom:** User sees 500 `internal-error`, but their rate limit budget is decremented. Retrying leads to 429.
- **Evidence:** [`libs/complaints/feature-api/src/lib/submit-complaint.handler.ts:96-103`](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/submit-complaint.handler.ts#L96-L103).
- **Current handling:** Rate limiter commits its row in `wall.submissions.consume` before `wall.complaints.insert` is attempted.
- **Recommendation:** Roll back or combine the submission log record with complaint creation in a single transaction, or delete the log entry on insert failure.

### 5. Untrusted Property Names Reflected in Error Responses
- **Trigger:** Attacker sends JSON with extraneous keys containing custom text, special characters, or payload snippets.
- **Symptom:** The response echoes user-supplied property names in the `issues` array.
- **Evidence:** [`libs/complaints/feature-api/src/lib/submit-complaint.handler.ts:30-32`](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/submit-complaint.handler.ts#L30-L32).
- **Current handling:** `issues.push({ field: key.slice(0, MAX_ECHOED_FIELD_LENGTH), reason: 'not-allowed' })`.
- **Recommendation:** Stop processing on the first unknown key and return `{ field: 'request', reason: 'unexpected-fields' }` without echoing user input.

---

## Serious Issues

### Finding 1: Lack of IPv6 Subnet Masking Permits Trivial Rate-Limit Bypass
- **File:** [`libs/complaints/feature-api/src/lib/security.ts:8-11`](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/security.ts#L8-L11)
- **Scenario:** A user connected via standard IPv6 receives a `/64` prefix from their ISP. By generating a new interface identifier for each POST request, they submit unlimited complaints without hitting the 3-per-10-minute limit.
- **Impact:** Abuse protection on the public unauthenticated submission endpoint is rendered ineffective for IPv6 traffic.
- **Fix:** Parse and normalize incoming IP addresses using a standard library (e.g., `ipaddr.js` or standard node utilities). For IPv6, mask the address to its `/64` prefix before hashing.

### Finding 2: Unscoped Global `deleteMany` in Advisory-Locked Transaction Causes Contention
- **File:** [`libs/complaints/data-access/src/lib/prisma.ts:136`](file:///D:/projects/qa3elhamor/libs/complaints/data-access/src/lib/prisma.ts#L136)
- **Scenario:** Multiple clients submit complaints concurrently. Each transaction acquires a client-specific advisory lock via `pg_advisory_xact_lock(hashtext(${clientKey}))`, but then proceeds to execute `DELETE FROM submission_log WHERE submitted_at <= horizon`.
- **Impact:** Multiple concurrent transactions attempting global index scans and page deletions on `submission_log` contend for row/page locks, leading to Postgres deadlock exceptions (`40P01`) and failed requests under load.
- **Fix:** Change line 136 to filter by `clientKey`:
  ```ts
  await tx.submissionLog.deleteMany({ where: { clientKey, submittedAt: { lte: horizon } } });
  ```
  This leverages the composite index `[clientKey, submittedAt]` and stays strictly within the advisory lock boundary.

---

## Moderate Issues

### Finding 3: Error Bodies Echo Unknown JSON Key Names
- **File:** [`libs/complaints/feature-api/src/lib/submit-complaint.handler.ts:30-32`](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/submit-complaint.handler.ts#L30-L32)
- **Scenario:** A client sends unknown keys in the JSON body. The keys are sliced to 64 characters and returned in `issues`.
- **Impact:** Violates the project design principle that error bodies never echo input, and allows reflection of arbitrary user-supplied strings.
- **Fix:** Do not reflect arbitrary property names back in the issue objects. Return a fixed error issue such as `{ field: 'request', reason: 'unknown-fields' }`.

### Finding 4: Missing Client IP Causes Global Denial of Service
- **File:** [`apps/api/src/lib/create-api.ts:41`](file:///D:/projects/qa3elhamor/apps/api/src/lib/create-api.ts#L41) & [`libs/complaints/feature-api/src/lib/security.ts:10`](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/security.ts#L10)
- **Scenario:** The client IP header is absent or misnamed. `clientIp(request)` returns `null`, and `clientKeyFor` falls back to `'unknown'`.
- **Impact:** All users share one submission bucket, locking out all submissions after 3 requests globally.
- **Fix:** Fail closed in production if `clientIp` is missing, or log a high-priority operational warning when requests lack the client IP header.

### Finding 5: Rate Limiting Consumes Quota Before Database Insertion Succeeds
- **File:** [`libs/complaints/feature-api/src/lib/submit-complaint.handler.ts:96-103`](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/submit-complaint.handler.ts#L96-L103)
- **Scenario:** Rate limiter accepts the submission and commits a `SubmissionLog` entry. `wall.complaints.insert` subsequently throws an error.
- **Impact:** The client receives 500 Internal Server Error, yet their submission allowance has been decremented.
- **Fix:** Coordinate the submission logging and complaint insertion so that failed insertions do not count towards the user's rate limit quota.

---

## Minor Issues

### Finding 6: Unsigned Cursor Misrepresented as Tamper-Evident
- **File:** [`libs/complaints/feature-api/src/lib/pagination.ts:11-28`](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/pagination.ts#L11-L28)
- **Scenario:** The JSDoc comment states the function returns `undefined when it is not one we issued`, but cursors are plain base64url-encoded JSON without HMAC signatures.
- **Impact:** While input validation (`ISO_INSTANT`, `complaintId`) prevents SQL injection, any client can forge arbitrary timestamps and IDs to seek across listings.
- **Fix:** Update the JSDoc to reflect that cursors are opaque keyset representations rather than cryptographically authenticated tokens, or sign cursors with HMAC.

### Finding 7: Lack of Stale Cache Purge Mechanism on Moderation Revocation
- **File:** [`libs/complaints/feature-api/src/lib/list-wall.handler.ts:14`](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/list-wall.handler.ts#L14)
- **Scenario:** A complaint is approved, and later deleted or rejected by a moderator.
- **Impact:** Due to `cdn-cache-control: public, s-maxage=60, stale-while-revalidate=300`, CDN edge nodes continue serving the deleted complaint for up to 300 seconds.
- **Fix:** Add a cache purge / surrogate-key tag mechanism for CDN cache eviction when status transitions to `deleted` or `rejected`.

### Finding 8: `lint` Target in `complaints-data-access` Lacks Explicit `prisma-generate` Dependency
- **File:** [`libs/complaints/data-access/package.json:57-75`](file:///D:/projects/qa3elhamor/libs/complaints/data-access/package.json#L57-L75)
- **Scenario:** In a clean CI run without pre-generated files, `nx affected -t lint typecheck test --parallel=3` is invoked.
- **Impact:** `typecheck`, `build`, and `test` declare `"dependsOn": ["prisma-generate"]`, but `lint` (generated by `@nx/eslint/plugin`) does not.
- **Fix:** Add `lint` to `targets` in `complaints-data-access/package.json` with `"dependsOn": ["prisma-generate"]`.

---

## Data Flow

| Step | Operation | Status | Annotation |
| :--- | :--- | :--- | :--- |
| 1. Entry | `createRouter` receives `Request` | OK | Same-origin verified; untrusted cross-origin POST rejected with 403. |
| 2. Routing | Method & path regex matching | OK | Method not allowed returns 405 with `Allow` header; 404 on unmapped paths. |
| 3. Auth Gate | `authorize(request, deps)` on moderation routes | OK | Constant-time comparison with SHA-256 pre-hashing; 503 if token unset. |
| 4. Ingestion | `readJsonBody(request, maxBytes)` | OK | Enforces byte limit on body stream; UTF-8 fatal validation; parser errors swallowed. |
| 5. Shape Validation | `parseSubmitRequest(body.value)` | GAP | Unknown keys rejected, but key names are echoed in `issues` (Finding 3). |
| 6. Domain Validation | `submitComplaint(...)` | OK | Domain rules enforced before rate-limiter write; private complaints/emails rejected. |
| 7. Rate Limit Gate | `wall.submissions.consume(...)` | GAP | Advisory lock prevents races, but IPv6 bypass exists (Finding 1) and global delete risks contention (Finding 2). |
| 8. Persistence | `wall.complaints.insert(...)` | GAP | Database CHECK constraints prevent email/private leaks, but failure leaves rate limit slot consumed (Finding 5). |
| 9. Response | `jsonResponse(201, ...)` / `WALL_CACHE_HEADERS` | OK | Public complaints response has `cache-control: no-store`; approved wall cached with CDN headers. |

---

## Requirements Fulfilment

| Requirement | Status | Gap |
| :--- | :--- | :--- |
| Rate limiting race safety (advisory lock) | COMPLETE | `pg_advisory_xact_lock(hashtext(${clientKey}))` serializes submissions per client key. |
| Rate limiting key derivation (HMAC IP_HASH_SALT) | COMPLETE | Uses `createHmac('sha256', salt)`; salt >= 24 chars enforced. |
| IPv6 /64 grouping | MISSING | No subnet truncation or canonicalization is performed (Finding 1). |
| IP spoofing protection outside Netlify | PARTIAL | Reliant entirely on edge proxy overwriting `CLIENT_IP_HEADER`. |
| Body size cap on stream | COMPLETE | Capped chunk-by-chunk with reader cancellation. |
| Content-Type enforcement | COMPLETE | Rejects non-JSON with 415. |
| Unknown keys rejection | COMPLETE | Rejects unexpected keys with 400. |
| Error bodies never echo input | PARTIAL | Unknown property names are echoed in `issues` (Finding 3). |
| Moderation auth constant-time compare | COMPLETE | Both sides hashed with SHA-256 before `timingSafeEqual`. |
| Moderation token-unset behavior | COMPLETE | Unset token returns 503 `moderation-disabled`. |
| Optimistic concurrency (409) | COMPLETE | Compare-and-set on `(status, updatedAt)` returns 409 on conflict. |
| SQL safety & CHECK constraints | COMPLETE | Parameterized queries; database CHECK constraints enforce public-only & known status. |
| Prisma 7 config & database-less build | COMPLETE | Config allows unset `DATABASE_URL` during client generation; clean build passes. |
| CORS / allow-list correctness | COMPLETE | 403 on untrusted cross-origin POST/OPTIONS; preflight headers properly configured. |
| Cursor pagination tamper safety | COMPLETE | Strict ISO date & ID regex validation; status filter enforced independently. |
| Cache headers & moderation isolation | COMPLETE | Moderation routes never cached; wall cache headers specified cleanly. |
| PII protection (IP / email) | COMPLETE | Raw IP never stored; reply email rejected and prevented by CHECK constraint. |

---

## Edge Cases

| Case | Handled | How | Concern |
| :--- | :--- | :--- | :--- |
| Zero-length or huge Authorization header | YES | Capped at 1024 chars in `hasModerationToken`. | None. |
| Malformed percent-encoded route params | YES | `matchParams` falls back to raw string; domain rejects invalid id with 404. | None. |
| Empty request body | YES | `readJsonBody` rejects with 400 `invalid-json`. | None. |
| Chunked body exceeding byte limit | YES | Stream reader cancels early and returns 413. | None. |
| Unknown query params on wall listing | YES | `readPageQuery` ignores unmapped parameters. | None. |
| Invalid cursor timestamp or ID | YES | `decodeCursor` returns `undefined`, yielding 400 `invalid-cursor`. | None. |
| High burst of submissions from same IP | YES | Advisory lock queues concurrent requests; 4th request gets 429. | Global delete causes cross-client contention. |
| High burst of submissions across IPv6 /64 | NO | Each IPv6 address gets a distinct hash. | Allows rate limit evasion. |

---

## Hand-off to Security-Hardening

The following items should be addressed during the security-hardening phase:
1. **IPv6 Prefix Masking (`/64`):** Implement IPv6 address canonicalization and mask IPv6 addresses to `/64` subnets before HMAC generation in [`libs/complaints/feature-api/src/lib/security.ts`](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/security.ts).
2. **Scope Submission Log Deletion:** Change `tx.submissionLog.deleteMany` in [`libs/complaints/data-access/src/lib/prisma.ts`](file:///D:/projects/qa3elhamor/libs/complaints/data-access/src/lib/prisma.ts) to filter by `{ clientKey, submittedAt: { lte: horizon } }`, or migrate global pruning to an asynchronous scheduled worker.
3. **Suppress Input Reflection in Error Responses:** Refactor `parseSubmitRequest` in [`libs/complaints/feature-api/src/lib/submit-complaint.handler.ts`](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/submit-complaint.handler.ts) to avoid echoing unknown key strings in `issues`.
4. **Missing IP Header Handling:** Guard against global bucket collapse (`'unknown'`) by failing closed or generating per-request synthetic keys when running behind an unverified proxy.
5. **CDN Cache Invalidation:** Integrate Netlify / CDN cache tag purging into moderation status transitions (`delete`, `reject`) in [`libs/complaints/feature-api/src/lib/moderation.handler.ts`](file:///D:/projects/qa3elhamor/libs/complaints/feature-api/src/lib/moderation.handler.ts).
6. **L7 Rate Limiting on Invalid Requests:** Implement a lightweight in-memory or edge rate limiter for failed/malformed requests to prevent validation exhaustion attacks.
7. **Security Headers:** Add `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and Content Security Policy headers across all API responses.

---

## Verdict

- **Recommendation:** REVISE
- **Confidence:** HIGH
- **Top risk:** Attackers on IPv6 can bypass public complaint rate limits completely by rotating addresses within their assigned `/64` subnet, and high-concurrency submission bursts risk database transaction deadlocks due to global submission log deletions.
- **What a robust implementation would add:**
  1. IPv6 `/64` prefix masking in `clientKeyFor`.
  2. Scoped client-specific cleanup in `PrismaSubmissionRateLimiter.consume`.
  3. Sanitized/non-reflected error reporting for unknown JSON property names.
