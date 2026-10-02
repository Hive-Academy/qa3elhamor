# Contact form (Bureau)

The site's contact form is the Bureau overlay at the bottom of the dive. It validates input
with the complaints domain value objects and submits through an injected `ComplaintSubmitter`
port. In production on GitHub Pages it posts to a serverless form service; the wall backend is
not involved.

Code: `apps/web/src/app/overlays/complaint-scroll/contact-submitters.ts` (adapters + factory),
`apps/web/src/app/overlays/complaint-scroll/complaint-submitter.ts` (port contract).

## Choosing a provider

| | Web3Forms | Formspree |
| --- | --- | --- |
| Pricing | Free tier (250 submissions/month at time of writing) | Free tier (50 submissions/month at time of writing) |
| Setup | Copy the access key from the dashboard | Copy the form id from the form endpoint URL |
| Reply address | Sent as `email`; replies go to the visitor's address | Sent as `email` and `reply_to` |
| Bot protection | Minimal server-side check via `botcheck: false` | Minimal server-side check via `_gotcha: ''` |

Both access keys and form ids are public by design: they live in the client bundle and are safe
to commit to `.env.example`. Pick whichever dashboard you prefer.

The `botcheck`/`_gotcha` fields only catch naive bots that fill hidden form fields. A stronger
honeypot would require a hidden input in `complaint-scroll.tsx` and a new field on the
`ComplaintDraft` port; that is left for a follow-up UI change.

## Configuration

Set these at **build time** (Vite inlines them). On GitHub Pages, set them as repository secrets /
Actions variables so they are present during the build; locally put them in `.env` (see
`.env.example`).

| Variable | Used by | Value |
| --- | --- | --- |
| `VITE_CONTACT_PROVIDER` | all | `web3forms`, `formspree` or `none` (default) |
| `VITE_WEB3FORMS_ACCESS_KEY` | Web3Forms | The access key from your Web3Forms dashboard |
| `VITE_FORMSPREE_FORM_ID` | Formspree | The form id from your Formspree form endpoint |

Anything missing or malformed (unknown provider, missing key, missing or invalid form id,
whitespace in the key) resolves to the no-op adapter (`pendingSubmitter`), so a fork builds and
runs until it is deliberately configured. In development only, a single `console.warn` explains
the fallback.

At build or deploy time, call `contactConfigProblems(env)` to fail loudly before shipping a dead
form:

```ts
import { contactConfigProblems } from './overlays/complaint-scroll';

const problems = contactConfigProblems(import.meta.env);
if (problems.length > 0) {
  throw new Error(`Contact form misconfigured:\n${problems.join('\n')}`);
}
```

The runtime still falls back to `pendingSubmitter` so visitors are never stuck on a broken page.

## Endpoints

Default endpoints are pinned:

- Web3Forms: `https://api.web3forms.com/submit`
- Formspree: `https://formspree.io/f/<VITE_FORMSPREE_FORM_ID>`

Either can be overridden by passing `endpoint` directly to `web3formsSubmitter` or
`formspreeSubmitter` (useful for a proxy or a forked adapter test).

## Delivery behaviour

- Requests time out after **15 seconds**. The timer covers connection, headers, and body parsing,
  so a stalled response body cannot leave the Bureau stuck in "sending".
- Network errors, non-2xx responses, 429 rate limits, 5xx errors and unparsable JSON are mapped
to a user-safe message. The raw error and provider response never reach the UI.
- The provider key or form id never appears in any error message surfaced to the user.
- Failed deliveries leave the visitor's text in place and show a retry message.
- A timeout or ambiguous 2xx response may mean the provider accepted the message even though we
could not confirm it. A retry can therefore produce a duplicate submission.

## What is sent

The normalised draft from the form becomes:

| Field | Web3Forms | Formspree |
| --- | --- | --- |
| Subject | `subject` | `subject`, `_subject` (notification subject) |
| Message body | `message` | `message` |
| Sender name | `name` | `name` |
| Sender species (optional) | `species` | `species` |
| Reply email (optional) | `email` | `email`, `reply_to` |
| Sender label | `from_name` = "Qaa El-Hamour Complaints Bureau" | — |
| Bot check | `botcheck: false` | `_gotcha: ''` |

The adapters only send fields the port contract already provides. A hidden honeypot field is not
included because the port and the current UI do not expose one; adding one later requires a
small UI change plus a new adapter field.

## Content Security Policy

Implemented by `security-hardening` (docs/security.md): the build adds the chosen provider's
origin to `connect-src` from `VITE_CONTACT_PROVIDER` (`CONTACT_PROVIDER_ORIGINS` in
`tools/deploy/csp.ts`; a new provider must be added there too):

| Provider | `connect-src` |
| --- | --- |
| Web3Forms | `https://api.web3forms.com` |
| Formspree | `https://formspree.io` |

No third-party script is loaded, so `script-src` does not need to change for the contact form.

## Verifying

1. Configure a provider and build the site.
2. Open the Bureau overlay, fill in the form, and submit.
3. The dashboard of the chosen service should show the submission within seconds.
4. To test the fallback, unset the provider variable or give an invalid value: the form should
   still submit but show "delivery is not wired".
5. In a deploy workflow, assert `contactConfigProblems(import.meta.env)` is empty so a
   misconfigured build fails before going live.

## Adding a provider

1. Create a new adapter function in
   `apps/web/src/app/overlays/complaint-scroll/contact-submitters.ts` that implements
   `ComplaintSubmitter`. Map the `ComplaintDraft` fields to the provider's expected payload and
   response shape.
2. Add a `VITE_CONTACT_PROVIDER` case in `createContactSubmitter` and the matching env key
   validation in `contactConfigProblems`.
3. Add the provider to the `VITE_CONTACT_PROVIDER` type in
   `apps/web/src/vite-env.d.ts`.
4. Add a setup row to the table above, a CSP origin row, and the origin to
   `CONTACT_PROVIDER_ORIGINS` in `tools/deploy/csp.ts` (otherwise the CSP blocks the request).
5. Write adapter specs mocking `fetch`, covering success, provider errors, non-2xx, 429, timeout,
   network failure, non-JSON body, stalled body, timer cleanup, and credential leakage.
