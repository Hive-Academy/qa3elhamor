## Frontend implementation revision — `complaints-contact-adapter`

All review items addressed. The code was not committed.

### Fixes

| # | Fix | File:line | Tests |
| --- | --- | --- | --- |
| 1 | Timeout now covers the whole exchange, including body parsing. `postJson` keeps the `AbortController`/`setTimeout` armed until after `response.json()` resolves or rejects, and aborts a stalled body. | `contact-submitters.ts:73-106` | spec: stalled body times out; timer count is 0 after success and after failure |
| 2 | Exported `contactConfigProblems(env): string[]` for deploy-time validation; runtime still falls back to `pendingSubmitter`. Documented in `docs/contact.md`. | `contact-submitters.ts:236-273`, `index.ts` | spec: returns empty when fine; reports unknown provider, missing/malformed Web3Forms key, missing/invalid Formspree id |
| 3 | Spam checks: Web3Forms sends `botcheck: false`, Formspree sends `_gotcha: ''`. Docs updated to call this a minimal server-side check and explain how a real honeypot would need a UI field. | `contact-submitters.ts:138`, `contact-submitters.ts:180`, `docs/contact.md:18-22` | spec: asserts `botcheck` / `_gotcha` in success bodies |
| 4 | Formspree sends `_subject: draft.subject` (notification subject) while keeping `subject` in the payload. | `contact-submitters.ts:175-177` | spec: asserts `_subject` and `subject` |
| 5 | Removed `cause` from `ContactSubmitterError`; the logged error object is now a safe message only. Docs softened to "provider key and response body never reach the UI". | `contact-submitters.ts:25-30`, `contact-submitters.ts:108-114`, `docs/contact.md:51-55` | spec: asserts `error.message` and `error.cause` both exclude the key/form id |
| 6 | `formId` validated against `/^[A-Za-z0-9_-]+$/` in `contactConfigProblems`; default endpoint uses `encodeURIComponent(formId)`. | `contact-submitters.ts:224`, `contact-submitters.ts:265-269`, `contact-submitters.ts:171` | spec: invalid id falls back; default endpoint URL-encodes the id |
| 7 | Added missing spec cases: Web3Forms 429, Formspree 5xx, Formspree HTTP 200 with `ok:false`. | `contact-submitters.spec.ts` | see Web3Forms 429, Formspree 5xx, Formspree `ok:false` |
| 8 | `VITE_CONTACT_PROVIDER` is trimmed and lower-cased. Removed the unused `ContactProviderName` export. | `contact-submitters.ts:222` (internal only), `contact-submitters.ts:237-239`, `index.ts` | spec: `'  WEB3FORMS  '` is accepted |
| 9 | Added docs note that a timeout or ambiguous 2xx may mean the provider accepted the message, so retry can duplicate it. | `docs/contact.md:49-50` | — |

### Verification

```bash
npx nx run-many -t lint,typecheck,test -p web --skipSync --skip-nx-cache
```

Result: all targets passed. `apps/web/src/app/in-world` and `landmarks.config.*` were not touched.

### Deliverables

- `D:\projects\qa3elhamor\apps\web\src\app\overlays\complaint-scroll\contact-submitters.ts`
- `D:\projects\qa3elhamor\apps\web\src\app\overlays\complaint-scroll\contact-submitters.spec.ts`
- `D:\projects\qa3elhamor\apps\web\src\app\overlays\complaint-scroll\index.ts`
- `D:\projects\qa3elhamor\docs\contact.md`
- `D:\projects\qa3elhamor\.ptah\specs\complaints-contact-adapter\report-r2.md`

### Open issues

None. The remaining work is the orchestrator wiring `createContactSubmitter(import.meta.env)`
into `apps/web/src/app/landmarks.config.ts` (another agent).
