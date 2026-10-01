# Code Logic Review r2 - complaints-contact-adapter

Score: 8/10. Verdict: APPROVED (with one non-blocking follow-up, N1).

Evidence: `npx nx test web --skip-nx-cache` gave 15 files and 161 tests passing, a fresh run with the cache skipped. I did not re-run tsc in this pass.

## Original defects

| # | Defect | Status | Evidence |
| --- | --- | --- | --- |
| D1 | Timeout stopped at headers | FIXED | contact-submitters.ts:73-106. The timer is cleared in `finally` only after `response.json()` settles. The body read is raced against the signal via `abortable` (:41-66). The listener is removed on settle (`once` plus `cleanup`). A late rejection of the inner promise is handled (:55-64), so there is no unhandled rejection. A stalled body now yields the timeout message (:97-99, :110-111). The spec has a stalled-body case and `getTimerCount() === 0` after success and failure (spec:38, 169, 180). |
| D2 | Silent dead form in production | PARTIAL | `contactConfigProblems` exists (:236-273) and `createContactSubmitter` uses it (:295). Nothing calls it at build time. A grep shows only docs and spec references, and `.github/workflows/ci.yml` has no step. See N1. |
| D3 | No spam check / docs overclaim | FIXED (minimal) | `botcheck: false` (:138) and `_gotcha: ''` (:180). Docs now say "minimal" (docs/contact.md:18, 23). A true honeypot still needs a UI field, and that is stated. |
| D4 | Formspree `_subject` | FIXED | :177, spec asserts it. |
| D5 | `cause` and console claim | FIXED | `ContactSubmitterError` has no `cause` (:25-30). Messages are static. The specs assert on `.cause` (spec:191-220, 337-356). |
| D6 | `formId` unvalidated / unencoded | FIXED | Pattern at :224, check at :265-269, `encodeURIComponent` at :171. The spec pins `a%2Fb%20c` (spec:271). The factory falls back on a bad id because `createContactSubmitter` goes through `contactConfigProblems` (:295-298). |
| D7 | Spec gaps | FIXED | Web3Forms 429, Formspree 5xx, `ok:false` (spec:306) and timer-count cases added. |
| D8 | Duplicate on retry | FIXED | Documented at docs/contact.md:77. |
| D9 | Provider trim / unused type | FIXED | `text()` trims and lowercases (:226-228, 237). The `ContactProviderName` export is removed and the type is internal (:222). |

## New defects

### N1 - Moderate: the deploy-time guard is not wired anywhere
- Files: docs/contact.md:44-50, 115; ci.yml.
- The docs snippet calls `contactConfigProblems(import.meta.env)`. `import.meta.env` is not available in Node scripts or in `vite.config`, so the snippet cannot run in a deploy workflow as written. The docs also tell the reader to add the assertion themselves, so the fail-loudly behaviour does not exist yet.
- Fix: add a small script or Vite plugin (using `loadEnv`) that imports `contactConfigProblems` and exits non-zero when the build is a production deploy and the problems list is non-empty. Wire it into the Pages workflow. Alternatively, record it as an explicit follow-up item for the roadmap.
- This is not blocking because the runtime still tells the visitor the truth ("not wired").

### N2 - Minor: the abort path is only covered by a stalled-fetch stub
- File: contact-submitters.ts:95-101.
- A non-abort `json()` rejection becomes `data = null`, which is intended. A real browser abort during the body read rejects `response.json()` itself, and `abortable` handles that too. This is correct and needs no change. Note only that a real `AbortSignal` is not exercised by the spec (it uses a synthetic stalling body).

### N3 - Minor: `contactConfigProblems` is exported but the `index.ts` and dist typings are stale
- `apps/web/dist/.../contact-submitters.d.ts` is a stale build artefact and is not tracked. Ignore it.

## Verdict

APPROVED. The six substantive logic defects (D1, D3, D4, D5, D6, D7) are fixed with evidence. D2 is only half done: the validator exists but no build step calls it (N1). Doing N1 before relying on the form in production is recommended.
