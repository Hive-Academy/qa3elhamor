# Code Logic Review - complaints-contact-adapter

| Metric | Value |
| --- | --- |
| Score | 6.5/10 |
| Verdict | REVISE (small, targeted fixes) |
| Blocking | 0 |
| Serious | 2 |
| Moderate | 4 |
| Minor | 4 |

Evidence: `npx nx test web --skipSync` returned 15 files / 145 tests passing, but Nx served it from cache (1/1 hit), so it is not a fresh run. `npx tsc -p apps/web/tsconfig.app.json --noEmit` printed no errors. I read the provider docs from memory and could not check them live, so item 1 is unverified against the current docs.

## Answers to the review questions

1. Request shapes.
   - Web3Forms matches the known API. It POSTs JSON to `https://api.web3forms.com/submit` (contact-submitters.ts:94, 60-68) with `access_key`, `subject`, `name`, `email`, `message`, and reads `success` (:114).
   - Formspree matches the known API. It POSTs to `https://formspree.io/f/{id}` with `Accept: application/json` (:62-65, 137) and reads `ok` / `errors` (:155-163).
   - `subject` is a plain field on Formspree. Formspree's email-subject field is `_subject`, so the notification email will have a generic subject (:142). See D6.
2. Failure mapping.
   - The timeout, network error, non-2xx (including 429 and 5xx), non-JSON body and Web3Forms HTTP 200 with `success:false` cases all map to a user-safe rejection (:74-80, 111-116, 155-165).
   - Gap: the timeout covers only the headers phase (D1).
   - There is no in-flight guard in the adapter. The UI guards double-submit via `phase.kind === 'sending'` (complaint-scroll.tsx:160). That is adequate.
   - The abort listener is internal to `fetch`, and the timer is cleared in `finally` (:69-71). Neither leaks.
3. Secrets.
   - Error messages are static strings (:16-25).
   - `ContactSubmitterError.cause` keeps the raw error (:33). complaint-scroll.tsx:176 does `console.error('...', error)`, which logs it.
   - The cause is a fetch `TypeError` or `DOMException`, not the provider body, and does not contain the key. However, docs/contact.md:54-55 claims "or in the console", and nothing pins that. The Formspree id is also in the request URL, so it is visible in DevTools regardless.
   - The Web3Forms key is in the request body of every call (public by design, as documented).
4. Factory and typing.
   - An unset provider resolves to `none` and a missing or unknown value falls back to `pendingSubmitter`. DEV/MODE gate the warn (:187-199, 206-237).
   - `apps/web/src/vite-env.d.ts` is new (untracked) and no other `ImportMetaEnv` declaration exists in apps or libs.
   - It extends `vite/client` through interface merging with no import or export, so it is global and does not clobber anything. The `readonly env` redeclaration is the same pattern Vite uses. The existing `VITE_ANALYTICS_*` vars are untyped (Vite's index signature is `any`) and are unaffected.
   - tsc is clean.
5. Spam: no honeypot (D3).
6. Docs: mostly accurate. Defects D4 and D5 below.
7. Specs: they pin the request shape, response mapping, trim and fallback. Weaknesses are in D7.

## Defects

### D1 - Serious: the timeout does not cover the response body
- File: contact-submitters.ts:57-71, 109-110, 153-154.
- `finally { clearTimeout }` runs as soon as `fetch` resolves with headers. `response.json()` then runs in `parseJson` with no timer and no signal.
- A stalled body leaves the promise pending forever. The Bureau stays in `sending`, the submit button is aria-disabled, and the visitor has no retry path. The 15 s guarantee in docs/contact.md:51 is therefore false.
- Fix: keep the timer armed until the body is parsed. For example, `postJson` returns `{status, data}` after reading and parsing the body inside the try, and clears the timer in `finally` afterwards. Aborting the controller also aborts a body read.
- Add a spec using a Response whose `json()` never resolves, with an assertion that it rejects with "timed out".

### D2 - Serious: a silent production misconfiguration ships a dead form
- File: contact-submitters.ts:187-199, 209-237. No `.github` workflow references any `VITE_*` var (grep was empty).
- If the secrets are not wired into the Pages build, or the key is misspelled, production silently falls back to `pendingSubmitter` and shows "not wired". The warn is dev-only, so nobody finds out. The charter's success criterion is "delivers a real message".
- Fix: add a CI or build check (a vite `define` or plugin that fails the build when `VITE_CONTACT_PROVIDER` is set but its credential is empty, or when a production deploy has provider `none`). At minimum, document the check in docs/contact.md "Verifying" and add it to the deploy workflow. Note that this agent's brief excluded workflows, so it needs a follow-up item.

### D3 - Moderate: no spam protection, and the docs overstate it
- File: contact-submitters.ts:98-106, 141-150; docs/contact.md:18, 71-73.
- The docs table says "Built-in honeypot on the provider side". For Web3Forms the honeypot only works if the request includes a `botcheck` field (checkbox, expected false/empty). For Formspree it needs a `_gotcha` field. Neither is sent, so the claim is misleading.
- A static public endpoint with a public key is an open mailbox spam target. The free quota (250 / 50 per month) can be exhausted by a bot, which also silently kills delivery for real visitors.
- Cheapest fix compatible with the port (no UI or port change): send `botcheck: false` on Web3Forms (the server enables its bot check and rejects when truthy) and `_gotcha: ''` on Formspree. This only catches naive bots that fill fields. A bot filling a hidden DOM field needs a hidden input in complaint-scroll.tsx, which is a UI change.
- Better, with a small port change: add an optional `honeypot` to the draft, with a visually hidden `tabindex=-1 autocomplete=off` input, and silently treat a filled value as `delivered`.
- Also rewrite the docs to say "supported, sent as `botcheck` / `_gotcha`" rather than "built-in".

### D4 - Moderate: Formspree `subject` is the wrong field
- File: contact-submitters.ts:142.
- Formspree uses `_subject` to set the notification email subject. `subject` is just a body field. The owner receives "New submission" for every complaint.
- Fix: send `_subject: draft.subject` (keep `subject` if you want the field in the payload). Update the spec at :215-222 and the docs table at :64.

### D5 - Moderate: `console.error` of the wrapped error and a docs claim that is not pinned
- File: complaint-scroll.tsx:176 with contact-submitters.ts:33; docs/contact.md:54-55.
- The docs promise "never in the console". The cause is the raw fetch error, which logs. Today it is harmless (browser fetch errors do not include the key), but nothing enforces it.
- Fix: either drop `cause` or soften the doc to "provider key and response body never reach the UI". The leak specs at spec:160-189 and :271-292 assert only on `error.message`. The `new TypeError(ACCESS_KEY)` case passes trivially because the network branch uses a static message. They do not exercise the console or the cause.

### D6 - Moderate: `formId` is interpolated into the URL unvalidated and unencoded
- File: contact-submitters.ts:137, 223-230.
- The factory only trims. An id containing `/`, `?` or `#` changes the request path. docs/contact.md:35 says malformed values resolve to the no-op, but only missing ones do.
- Fix: validate `/^[A-Za-z0-9_-]+$/` in the factory (fall back and dev-warn otherwise) and `encodeURIComponent` the id. Validate the Web3Forms key shape loosely, as a non-empty string with no whitespace.

### D7 - Minor: spec gaps
- No assertion that the timer is cleared (e.g. `vi.getTimerCount()` is 0 after success, failure and timeout), and none that a late abort after settle is harmless (spec:152-158, 263-269).
- No Web3Forms 429, Formspree 5xx or Formspree HTTP 200 with `ok:false` case.
- The timeout test advances 16 s but never pins the abort at exactly 15 s.
- `ContactSubmitterError` is not exported, so callers cannot discriminate between failures. That is fine for now.
- The Web3Forms honeypot and Formspree `_subject` have no specs (they get added with D3 and D4).

### D8 - Minor: a timeout or non-JSON 200 may mean the message was delivered, so retry duplicates it
- File: contact-submitters.ts:163-165 (Formspree HTTP 200 with a non-JSON body is treated as a failure) and 77.
- The form keeps text and offers retry (complaint-scroll.tsx:177), so a duplicate message is possible. This is inherent to the design, but a note in the docs would help. Treating a 2xx with a non-JSON body as "unexpected" is defensible.

### D9 - Minor: input hygiene and types
- `VITE_CONTACT_PROVIDER` is not trimmed (:207). `" web3forms"` gives "Unknown provider".
- The d.ts narrows it to the three literals but the runtime accepts any string. This is harmless.
- The `ContactProviderName` type is exported but unused.

### D10 - Minor: docs/contact.md
- CSP hosts are correct (`https://api.web3forms.com`, `https://formspree.io`; :77-82).
- Free-tier numbers should stay labelled "at time of writing". The `index.ts` re-exports are fine.
- The "Verifying" step 4 wording ("should still submit but show 'delivery is not wired'") matches `complaintPendingBody` behaviour.

## Data flow

1. The form builds the draft (complaint-scroll.tsx:164).
2. `submitter.submit` is called (:170). OK: the UI guards double-submit at :160.
3. `postJson` posts with a 15 s abort timer. Gap: the timer is cleared after headers (D1).
4. Body parse (:45-51). Gap: no timeout (D1).
5. Response mapping (:111-116, 155-165). OK.
6. A rejection logs and re-edits the form (:174-178). OK: text is kept.
7. A resolve stamps the form (:172). OK.

## Requirements

| Requirement | Status | Gap |
| --- | --- | --- |
| Adapter interface plus Web3Forms and Formspree | COMPLETE | |
| Swap by env var plus one adapter file | COMPLETE | Plus a union entry in the d.ts and a factory case (documented at docs/contact.md:94-104). |
| Static path stays static | COMPLETE | No new script and no new dependency. |
| Real message delivered | PARTIAL | Unverified against live providers (needs a real key). Wiring is pending (another agent). Production misconfiguration is silent (D2). |

## Verdict

REVISE. Fix D1, D3, D4 and D6, and add a deploy-time guard for D2. The rest are minor. After that this should score 8 or better.
