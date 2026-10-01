## Frontend implementation — `complaints-contact-adapter`

**Tasks completed**:

- Implemented `web3formsSubmitter` and `formspreeSubmitter` adapters behind the existing
  `ComplaintSubmitter` port.
- Implemented `createContactSubmitter(env)` factory that selects by `VITE_CONTACT_PROVIDER`.
- Added `apps/web/src/vite-env.d.ts` typing for the three contact env vars.
- Added vitest specs covering success, provider error body, non-2xx, 429, timeout, network
  failure, non-JSON body, factory selection, fallback, and credential leakage.
- Updated `.env.example` with a "Contact form (Bureau)" section.
- Added `docs/contact.md` with provider setup, CSP, verification, and extension guide.

**Files**:

- CREATED `D:\projects\qa3elhamor\apps\web\src\app\overlays\complaint-scroll\contact-submitters.ts` — Web3Forms/Formspree adapters + factory.
- CREATED `D:\projects\qa3elhamor\apps\web\src\app\overlays\complaint-scroll\contact-submitters.spec.ts` — adapter/factory unit tests.
- CREATED `D:\projects\qa3elhamor\apps\web\src\vite-env.d.ts` — `VITE_CONTACT_PROVIDER`, `VITE_WEB3FORMS_ACCESS_KEY`, `VITE_FORMSPREE_FORM_ID` types.
- CREATED `D:\projects\qa3elhamor\docs\contact.md` — setup and extension documentation.
- MODIFIED `D:\projects\qa3elhamor\apps\web\src\app\overlays\complaint-scroll\index.ts` — exports the new adapters, factory, and types.
- MODIFIED `D:\projects\qa3elhamor\.env.example` — documented the three contact form env vars.

**Stack observed**: React 19 + Vite (from `package.json`), Vitest/jsdom tests
(`apps/web/vite.config.mts`), no additional runtime dependencies.

**Design fidelity**: No visual design change; the existing `ComplaintScroll` success/failure
states (`complaintSuccessBody`, `complaintFailureBody`, `complaintPendingBody`) are reused as-is.

**States covered**:

- `delivered` on provider success.
- `delivery-not-wired` fallback when env is missing/invalid/`none`.
- Failure: network, timeout, non-2xx, 429, 5xx, non-JSON body, provider error body — all mapped
  to user-safe messages; the UI already shows `complaintFailureBody` and preserves input.
- Accessibility: no UI change; existing keyboard/focus/ARIA behaviour unchanged.

**Verification**:

```bash
npx nx run-many -t lint,typecheck,test -p web --skipSync
```

Result: all targets passed (`19/19` cache hits after first run; first run had 145 tests passing,
0 failing). `apps/web/src/app/in-world` and `landmarks.config.*` were not touched.

**Plan deviations**: None. The port contract already included all fields needed; no UI field or
honeypot was added because the contract and current template do not expose one. This is noted in
`docs/contact.md`.

**Out-of-scope observations**: None.

---

### Wiring for the orchestrator

In `apps/web/src/app/landmarks.config.ts`:

1. Replace the import from `./overlays/complaint-scroll`:

   ```ts
   import {
     createComplaintScrollOverlay,
     createContactSubmitter,
   } from './overlays/complaint-scroll';
   ```

2. Replace `submitter: pendingSubmitter` with:

   ```ts
   bureau: createComplaintScrollOverlay({
     copy: siteCopy,
     submitter: createContactSubmitter(import.meta.env),
   }),
   ```

### Env vars

| Variable | Provider | Notes |
| --- | --- | --- |
| `VITE_CONTACT_PROVIDER` | all | `web3forms` \| `formspree` \| `none` (default) |
| `VITE_WEB3FORMS_ACCESS_KEY` | Web3Forms | public by design, safe in client bundle |
| `VITE_FORMSPREE_FORM_ID` | Formspree | public by design, safe in client bundle |

### Open issues

None. The adapter layer is complete and verified; only the single landmarks.config.ts wiring
above remains.
