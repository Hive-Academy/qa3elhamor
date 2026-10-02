# security-hardening notes

Scope: CSP for the static site and the moderation console, wall API hardening (headers, abuse
limits, client-IP trust, CDN purge, validation re-check, output contract), repo hygiene
(audit, secret scan, .gitignore), docs. Owner-facing write-up: `docs/security.md`.

## Findings

Severity is the risk before this change.

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| 1 | Public site had no Content Security Policy, and GitHub Pages cannot send one as a header | High | **Fixed**: a build-time `<meta>` CSP generated from the same `VITE_*` values the bundle uses. Verified in headless Chromium: zero violations with WebGL, all models, every overlay, Credits and the page fallback; Plausible configured loads under it |
| 2 | Moderation console (holds the token, renders every pending complaint) had no CSP | High | **Fixed**: its own `default-src 'none'` policy with Trusted Types (`require-trusted-types-for 'script'; trusted-types 'none'`). Verified that it renders, switches tabs and calls `/api` with no Trusted Types violation |
| 3 | API security headers: only `nosniff`, and only on handler JSON; health, 404, 405 and 204 preflights had none; no CSP, `X-Frame-Options` or `X-Robots-Tag` | Medium | **Fixed**: `API_SECURITY_HEADERS` (nosniff, deny-all CSP + `frame-ancestors 'none'` + `sandbox`, XFO DENY, `no-referrer`, CORP same-origin, `X-Robots-Tag: noindex, nofollow, noarchive`) stamped by the router on every response |
| 4 | Malformed, oversized or invalid requests and wrong moderation tokens were never throttled (validation exhaustion, token-guess loops) | Medium | **Fixed**: `InMemoryFailureLimiter`, 30 refusals / 10 min per IPv4 or IPv6 /64 (`FAILED_REQUEST_LIMITS`), answers 429 before the body is read or the token compared; bounded to 10,000 clients. Best effort per instance; an edge limit is on the owner checklist |
| 5 | Client-IP header forgeable when the API is not behind Netlify's edge, which bypasses every limit | Medium (High off Netlify) | **Mitigated**: optional `EDGE_AUTH_SECRET`/`EDGE_AUTH_HEADER` (requests without the edge's secret get no IP, so 503); `X-Forwarded-For`/`Forwarded` refused as `CLIENT_IP_HEADER` at startup; duplicate headers (`a, b`) already refused. Netlify default documented as trustworthy |
| 6 | No CDN purge when moderation withdraws a complaint: abusive text stays up to about 6 min | Medium | **Fixed (interface)**: `CachePurger` port, called after an approved complaint is deleted (the only transition off the wall); failures reported, decision kept. Wall responses are tagged `Cache-Tag`/`Netlify-Cache-Tag: complaints-wall`. Default `noopCachePurger`; Netlify wiring documented (no Netlify adapter exists yet) |
| 7 | `.env.example` placeholder `MODERATION_TOKEN`/`IP_HASH_SALT` pass the 24-character minimum: a copied example file deploys a public token | Medium | **Fixed**: refused at startup when `NODE_ENV=production` (`change-me` prefix); owner checklist |
| 8 | Body cap 8 KiB was smaller than the longest valid complaint in 4-byte UTF-8 (8,880 B before JSON overhead) | Low | **Fixed**: 12 KiB, with a spec submitting the maximum in emoji |
| 9 | Unpaired UTF-16 surrogates (`\ud800` JSON escapes) accepted, then silently turned into U+FFFD on storage | Low | **Fixed**: refused by the domain as `control-character` |
| 10 | `.gitignore` covered `.env`, `.env.local`, `.env.*.local` but not `.env.production`, `.env.development` (Vite loads both) | Low | **Fixed**: `.env`, `.env.*`, `!.env.example` |
| 11 | Stored-XSS renderer contract | Info | **Verified**: no HTML sink in source (grep below); API returns text verbatim as JSON, pinned by a spec; rule documented in `text-rules.ts` and docs/security.md |
| 12 | complaints-api hand-off: IPv6 /64, scoped `submissionLog.deleteMany`, no reflected keys, missing-IP fail-closed | (was Medium) | **Already fixed before this item**: re-verified in `security.ts`, `prisma.ts:92`, `parseSubmitRequest`, `CLIENT_IP_FALLBACK=reject` |
| 13 | The moderation entry loads `vendor-three`/`vendor-r3f`/`vendor-drei` (the chunk groups capture `scheduler` etc. that React DOM needs); Meshopt's eager WASM init is blocked there and logs a console error, and about 1 MB is downloaded for nothing | Low | **Open**: chunking in `vite.config.mts` (perf, not CSP; not loosened the policy) |
| 14 | `npm audit --omit=dev`: 5 high, all inside the Prisma CLI tree | Low (effective) | **Open**: see audit below |
| 15 | Public site can be framed on Pages (`frame-ancestors`/XFO need headers) and CSP violations are not reported | Low | **Accepted, documented**: no authenticated or one-click state-changing action on the public site; header block for hosts that can send headers is in docs/security.md |
| 16 | No database-level length `CHECK` constraints (the domain is the only length gate) | Low | **Open**: defence in depth; needs a migration and Docker to verify |
| 17 | Decap `/admin` has no CSP (copied from `public/`, not a Vite entry) | Info | Documented in docs/cms.md; excluded from the Pages artefact |

No high or critical finding remains open on the wall path.

## What changed

- CREATED `tools/deploy/csp.ts`: pure policy builder (`buildSiteCsp`, `buildModerationCsp`, `cspForPage`, `publicSiteOrigins`, `wallApiOrigin`, `cspMetaTag`, `CSP_META_PATTERN`); analytics hosts come from `resolveAnalyticsConfig` (single-sourced), contact hosts from `CONTACT_PROVIDER_ORIGINS`, wall from `VITE_WALL_API_URL` (invalid value fails the build).
- CREATED `tools/deploy/csp-plugin.ts`: Vite plugin (`apply: 'build'`), inserts the `<meta>` right after `<meta charset>`; throws for an HTML entry without a policy.
- CREATED `tools/deploy/csp-vite-plugin.mjs` + `.d.mts`: type boundary so `apps/web/tsconfig.spec.json` (composite, rootDir `apps/web`) does not pull `tools/` into its program (TS6059/TS6307). Delete both if that tsconfig ever includes `tools/deploy`.
- CREATED `tools/deploy/csp.spec.ts`, `tools/deploy/vitest.config.mts` (16 specs).
- MODIFIED `tools/deploy/prepare-artefact.ts`: fails (exit 2) when `index.html` has no CSP meta; prints the policy.
- MODIFIED `apps/web/vite.config.mts`: registers the plugin (import + plugins entry only).
- MODIFIED `apps/web/moderation.html`: header comment (headers the host must send; policy injected at build).
- CREATED `libs/complaints/feature-api/src/lib/failure-limiter.ts` (+ spec), `cache-purger.ts`, `hardening.spec.ts`.
- MODIFIED `libs/complaints/feature-api`: `http.ts` (`API_SECURITY_HEADERS`, `rateLimitedResponse`), `config.ts` (`failedRequestLimits`, `FAILED_REQUEST_LIMITS`, 12 KiB cap, production placeholder guard, `parseRateLimits(raw, name)`), `deps.ts` (`failureLimiter`, `cachePurger`), `security.ts` (`secretMatches`), `submit-complaint.handler.ts`, `moderation.handler.ts`, `list-wall.handler.ts` (cache tags), `index.ts`, `config.spec.ts`, `handlers.spec.ts`.
- MODIFIED `apps/api`: `api-config.ts` (`edgeAuth`, forgeable header refusal), `create-api.ts` (`clientIpReader`, new deps), `router.ts` (headers on every response), `dev-server.ts` (plays the edge secret), `router.spec.ts`, `integration/complaints-api.integration.ts` (new deps).
- MODIFIED `libs/complaints/domain/src/lib/text-rules.ts` (surrogates, rendering rule), `complaint-fields.spec.ts`.
- MODIFIED `.gitignore`. CREATED `docs/security.md`; MODIFIED CSP sections of `docs/analytics.md`, `docs/contact.md`, `docs/cms.md`.

New API variables: `FAILED_REQUEST_LIMITS`, `EDGE_AUTH_SECRET`, `EDGE_AUTH_HEADER`, `NODE_ENV` (placeholder guard). New build variable: `VITE_WALL_API_URL` (contract for the complaints-wall client).

## CSP per build mode

Dev server (`nx serve web`): **none** (Vite HMR and React Fast Refresh need inline script).

Public site, default build (no analytics, no contact provider, wall same-origin/absent):

```text
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob: data:; media-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'
```

Public site, configured example (`VITE_ANALYTICS_PROVIDER=plausible`, `VITE_CONTACT_PROVIDER=formspree`, `VITE_WALL_API_URL=https://wall.example.org/api`):

```text
default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://plausible.io; style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob: data: https://plausible.io https://formspree.io https://wall.example.org; media-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'
```

Umami Cloud adds `https://cloud.umami.is` to script/connect and `https://api-gateway.umami.dev` to connect; web3forms adds `https://api.web3forms.com`.

Moderation (default; with `VITE_WALL_API_URL` its origin is appended to `connect-src`):

```text
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; require-trusted-types-for 'script'; trusted-types 'none'
```

What three/drei/meshopt need, measured rather than assumed: `'wasm-unsafe-eval'` is required
(removing it in the browser makes every `.glb` fail with "WebAssembly.instantiate() ...
violates ... script-src"); `'unsafe-eval'` and `'unsafe-inline'` are not needed (drei `<Html>`
and React styles go through the CSSOM). Meta CSP limits: `frame-ancestors`, `report-uri`/
`report-to` and `sandbox` are ignored in `<meta>`; documented.

## Runtime verification

`vite build` to temp dirs, `vite preview` on ports 4517/4518 (stopped afterwards), headless
Chromium via `npx -y playwright@1` (1.63) with SwiftShader, collecting
`securitypolicyviolation` events and console errors:

- Default build: 0 violations; WebGL context ok; environment and 4 landmark models loaded; Pineapple, Tiki, Krusty Krab, Bureau overlays and Credits opened; page-view fallback opened.
- `'wasm-unsafe-eval'` stripped (route interception): every model fails, proving it necessary.
- Configured build (Plausible + Formspree + wall URL): 0 violations; the Plausible script loaded and ran.
- Moderation: 0 Trusted Types violations; one `wasm-eval` report from `vendor-three` (finding 13).
- `VITE_WALL_API_URL=http://evil.example`: build fails with `CspConfigError`.
- `deploy:prepare` on a copy: prints the policy; with the meta removed, exits 2.

## Output sinks (grep)

`dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document.write|new Function(|eval(` over the repo (excluding node_modules/dist/coverage/generated):

- `apps/web/src/app/page-view/dive-guard.spec.tsx:91`: `expect(container.innerHTML).toBe('')` (test read)
- `libs/world/feature/src/lib/narrator.spec.tsx:20,22,38`: `container.innerHTML` (test reads)
- `libs/telemetry/data-access/src/lib/telemetry-data-access.spec.ts:58`: `document.head.innerHTML = ''` (test reset)
- `.ptah/analysis/...` and `.ptah/specs/complaints-moderation/code-review-agy.md`: prose only

No production sink.

## Dependency audit (`npm audit --omit=dev`)

5 high, 0 critical, all reached only through `prisma@7.10.0` (pulled in by `@prisma/client`):

| Package | Advisory | Reachable here? | Fix |
| --- | --- | --- | --- |
| `mysql2@3.15.3` | auth-plugin downgrade, zlib bomb | No: the API uses the Postgres adapter | only via `prisma@6.19.3` (major downgrade): not applied |
| `deepmerge-ts@7.1.5` (via `@prisma/config`) | stack exhaustion on recursive graphs | CLI config loading only, trusted input | same: not applied |
| `fast-uri@3.1.6` (via `ajv` in `@prisma/dev`) | URI authority/host confusion | local Prisma dev server only | `npm audit fix` (non-major); not run (no installs in this task) |
| `@prisma/config`, `prisma` | aggregate of the above | | |

Static site runtime dependencies (react, react-dom, three, drei, fiber): no advisories.

## Secret scan

`git grep` for AWS/GitHub/Slack/OpenAI/Stripe/Google key formats, private-key headers, JWTs,
credentialed connection strings and `secret|token|password|api_key = "<16+ chars>"` over
tracked files, plus the key-format scan over untracked files: no secrets. Only hits are the
docker-compose local credentials (`qa3elhamor:qa3elhamor@localhost`) in `.env.example` and
`apps/api/integration/database-url.ts`, and the `change-me` placeholders (finding 7). No `.env`
other than `.env.example` is tracked.

## Verification

- `npx nx run-many -t lint,typecheck,test,build -p api complaints-domain complaints-data-access complaints-feature-api web --skipSync`: **all succeeded** (domain 209, data-access 12, feature-api 63, api 13, web 335 tests). One earlier run had web test failures in `landmarks.config.spec.ts` and timeouts under load while other agents were editing `apps/web/src`; `web:test` alone and the final run pass.
- `npx vitest run --config tools/deploy/vitest.config.mts`: 16 passed. `npx eslint tools/deploy/...`: clean. Ad hoc `tsc --strict` on the new tools files: clean.
- `npm run api:integration`: **not run**, Docker is not available (`dockerDesktopLinuxEngine` pipe missing). The integration file was updated for the new deps and typechecks.

## Open items

1. Wire a real `CachePurger` when the Netlify function adapter is written (`apps/api/src/lib/create-api.ts`; example in docs/security.md).
2. Add an edge rate limit (Netlify rule) for `POST /api/complaints` and `/api/moderation/*`; the in-process failure limiter is per instance.
3. Add `react/no-danger: error` to `apps/web/eslint.config.mjs` (outside this item's scope) before the complaints-wall lands.
4. Fix the moderation entry's vendor-chunk sharing in `vite.config.mts` `advancedChunks` (finding 13).
5. Run the `tools/deploy` specs in CI (`npx vitest run --config tools/deploy/vitest.config.mts`): needs a CI step or package script, both outside scope.
6. Document `FAILED_REQUEST_LIMITS`, `EDGE_AUTH_SECRET`, `EDGE_AUTH_HEADER`, `NODE_ENV` and `VITE_WALL_API_URL` in `.env.example` (outside scope; documented in docs/security.md).
7. Optional DB `CHECK (char_length(...) <= n)` constraints mirroring `COMPLAINT_LIMITS` (needs a migration and Docker).
8. `npm audit fix` for `fast-uri` (non-major) when installs are allowed; Prisma advisories when Prisma ships fixed 7.x.
9. Netlify/other hosts: apply the header block in docs/security.md (frame-ancestors, moderation `X-Robots-Tag`/`no-store`, access control on `/moderation*`).
10. The `vite.config.mts` native-config-loader warning now also names `tools/deploy/*.ts` (extensionless/CJS-detected ESM); harmless today, like the existing `__dirname` warnings.
