# Security

What the site protects, how, and what the owner still has to do. Code references are to the
files that enforce each control; the controls themselves are covered by specs.

## Threat model (summary)

| Surface | Who can reach it | What can go wrong | Main controls |
| --- | --- | --- | --- |
| Public static site (GitHub Pages) | Everyone | Script injection through a third-party script or content, clickjacking, leaking data to unexpected hosts | Build-time CSP `<meta>` (allow-list per configured provider), React text rendering, no inline script |
| Bureau contact form | Everyone | Spam through the form provider | Provider-side limits and bot fields (docs/contact.md); the site holds no secrets for it |
| Complaints wall API (`apps/api`, optional, off by default) | Everyone (submit, read); token holders (moderation) | **Stored XSS**: unauthenticated text shown to every visitor. Abuse: floods, oversized or malformed bodies, rate-limit evasion by rotating IPs or forging the client-IP header, token guessing | Domain validation, JSON-only responses with a deny-all CSP, per-client limits (DB-backed for submissions, in-memory for refused requests), trusted-edge IP handling, constant-time token check |
| Moderation console (`moderation.html`) | Token holders | Token theft through XSS on the page that renders every pending complaint, framing, indexing | Separate entry and bundle, strictest CSP with Trusted Types, sessionStorage-only token, never deployed to Pages |

Out of scope: the hosting providers themselves, the analytics and form providers' own
infrastructure, and denial of service beyond what an application can reasonably absorb
(that needs an edge rate limit; see the owner checklist).

## Stored XSS: the wall path

The wall accepts unauthenticated text and shows it to everyone, so it is the highest-severity
risk in the project. It is handled in layers, each sufficient on its own for the case it
covers:

1. **Input** (`libs/complaints/domain/src/lib/text-rules.ts`): every field is NFC-normalised,
   length-limited in code points (subject 120, body 2000, name 60, species 40), and refused
   if it contains C0/C1 control characters, bidi override/embedding/isolate characters
   (text that reads differently from how it renders), or unpaired UTF-16 surrogates. Markup
   is **kept verbatim**: escaping at input would corrupt text and give a false sense of
   safety in every other output context.
2. **Transport** (`libs/complaints/feature-api`): the request body is capped at 12 KiB
   before parsing (the longest valid complaint in 4-byte UTF-8 fits), must be
   `application/json`, valid UTF-8, an object of exactly the known string fields. Errors
   never echo client input. Responses are `application/json; charset=utf-8` with
   `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'; ...;
   sandbox`, so even a response opened directly as a page cannot run or load anything.
3. **Output**: complaint text is plain text everywhere. **Render it as React text children
   (`{complaint.body}`), `textContent`, or as a glyph source for 3D text. Never pass it to
   `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, `document.write`, a markdown
   or HTML renderer, or into an `href`, `src` or `style` value.** The API deliberately returns
   it unescaped (a spec pins this: `libs/complaints/feature-api/src/lib/hardening.spec.ts`),
   because escaping is only correct for the context it is rendered in, and React already
   escapes text children.
4. **Containment** (CSP, below): no inline script and no third-party script origin beyond the
   configured analytics host, so an injection that slipped past the renderer has nowhere to
   load code from. The moderation console additionally enforces Trusted Types, which turns
   any string-to-DOM-sink write into an exception.

At the time of writing, a repository-wide search for `dangerouslySetInnerHTML`, `innerHTML`,
`outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(` and `new Function(` finds only
test assertions that read `container.innerHTML`. The complaints-wall item must keep it that
way; adding `react/no-danger` to the web ESLint config would enforce it.

## Content Security Policy

GitHub Pages cannot send response headers, so the policy ships in each page as
`<meta http-equiv="Content-Security-Policy">`, written at build time by
`tools/deploy/csp-plugin.ts` (registered in `apps/web/vite.config.mts`) from the policies in
`tools/deploy/csp.ts`. It is generated from the same `VITE_*` values Vite inlines into the
bundle during the same build, so the hosts the policy allows are always the hosts the built
code calls. `npm run deploy:prepare` refuses an `index.html` without the policy.

The dev server (`nx serve web`) runs **without** a policy: Vite's HMR client and React Fast
Refresh need inline script. `vite preview` and every deployed build run under it.

### Public site (`index.html`, `404.html`)

Default build (no analytics, no contact provider, wall API same-origin or absent):

```text
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob: data:; media-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'
```

Configured hosts are appended, and only when configured:

| Build variable | Adds |
| --- | --- |
| `VITE_ANALYTICS_PROVIDER=plausible` (valid config) | `https://plausible.io` to `script-src` and `connect-src` |
| `VITE_ANALYTICS_PROVIDER=umami` (Umami Cloud) | `https://cloud.umami.is` to both; `https://api-gateway.umami.dev` to `connect-src` |
| `VITE_ANALYTICS_SCRIPT_SRC=https://stats.example.org/script.js` | that origin to both, instead of the default host |
| `VITE_CONTACT_PROVIDER=web3forms` / `formspree` | `https://api.web3forms.com` / `https://formspree.io` to `connect-src` |
| `VITE_WALL_API_URL=https://wall.example.org/api` | `https://wall.example.org` to `connect-src` (public site and moderation) |

Analytics that resolves to `none` (missing domain, bad UUID, non-https script) adds nothing,
matching the runtime. `VITE_WALL_API_URL` must be a same-origin path (`/api`) or an absolute
`https://` URL (`http://` only for localhost); anything else fails the build. It is the
variable the complaints-wall client must read for its API base.

Why each non-obvious source is there (all verified in a headless browser, see "Verifying"):

- `'wasm-unsafe-eval'`: every model is Meshopt-compressed and three's Meshopt decoder
  compiles WebAssembly at runtime. Without it every `.glb` fails to load ("WebAssembly.
  instantiate() ... violates ... script-src"). It allows WebAssembly compilation only; JS
  `eval` and `new Function` stay blocked.
- `blob:` in `img-src`/`connect-src`: GLTFLoader hands embedded textures to the image decoder
  through blob URLs (fetched, hence `connect-src`). `worker-src blob:` keeps blob-URL decoder
  workers possible.
- `data:` in `img-src`/`font-src`/`connect-src`: Vite inlines small assets as data URIs and
  glTF may embed buffers as data URIs.
- `style-src 'self'` with no `'unsafe-inline'`: React and drei's `<Html>` set styles through
  the CSSOM (`element.style`), which `style-src` does not govern; the build emits no inline
  `<style>`.
- `form-action 'self'`: the Bureau form submits with `fetch`, never a native post.

Not possible in a `<meta>` policy (browsers ignore them there): `frame-ancestors`,
`report-uri`/`report-to`, `sandbox`. So on Pages the site **can be framed** by another site
(no `X-Frame-Options` either) and violations are not reported anywhere. The public site has no
authenticated or one-click state-changing action, so framing risk is limited to
presentation; a host that can send headers should add the header set below.

### Moderation console (`moderation.html`)

```text
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; require-trusted-types-for 'script'; trusted-types 'none'
```

(`connect-src` also gets the `VITE_WALL_API_URL` origin when set.) No third-party origin, no
WebGL, and Trusted Types with no policies: the console renders every pending complaint while
holding the moderation token, so any `innerHTML`-style write throws instead of executing.
Verified: the console renders, switches tabs and calls `/api` with no Trusted Types
violation.

Known noise: the moderation entry currently shares the `vendor-r3f`/`vendor-drei` chunks
(the chunk groups in `vite.config.mts` capture `scheduler` and friends that React DOM needs),
which drags in `vendor-three`; Meshopt's eager WebAssembly init is then blocked by this policy
and logs one console error. It is harmless (the console never loads a model) and the right fix
is the chunking, not a weaker policy.

### Headers for hosts that can send them

Pages cannot. A Netlify (or other) deployment should add, in `netlify.toml` or `_headers`:

```text
/*
  Content-Security-Policy: frame-ancestors 'none'
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/moderation*
  X-Robots-Tag: noindex, nofollow, noarchive
  Cache-Control: no-store
```

A header CSP and the meta CSP are both enforced (a request must satisfy both), so the header
only needs the directives a meta tag cannot carry. The Decap admin (`/admin/*`) is copied
verbatim from `public/`, is not a Vite entry, and gets no meta policy; its header policy is in
docs/cms.md.

## Complaints wall API

### Response headers

Every response, including health checks, 404/405 and CORS preflights, carries
(`API_SECURITY_HEADERS` in `libs/complaints/feature-api/src/lib/http.ts`, stamped by the router
in `apps/api/src/lib/router.ts`):

```text
X-Content-Type-Options: nosniff
Content-Security-Policy: default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Cross-Origin-Resource-Policy: same-origin
X-Robots-Tag: noindex, nofollow, noarchive
```

CORP `same-origin` only affects no-cors embedding; CORS calls from `CORS_ALLOWED_ORIGINS` work.
HSTS is left to the platform, which terminates TLS.

### Rate limits

| Limit | Applies to | Storage | Default | Variable |
| --- | --- | --- | --- | --- |
| Submission limit | Accepted submissions | Postgres (`submission_log`, HMAC-keyed), exact across instances | 3 / 10 min and 20 / day | `RATE_LIMITS` |
| Refused-request limit | 415, 413, invalid JSON, wrong shape, invalid content, wrong moderation token | Per process, in memory, bounded to 10,000 clients | 30 / 10 min | `FAILED_REQUEST_LIMITS` |

Clients are keyed by IPv4 address or IPv6 /64 (a subscriber's whole prefix), with
IPv4-mapped IPv6 folded to IPv4. A throttled client gets `429` with `Retry-After` before its
body is read or its token compared. The refused-request limit is best effort: each warm
serverless instance counts on its own and forgets on recycle. It raises the cost of a flood
from one client; it does not replace an edge rate limit.

### Client IP trust

The limits are only as good as the client IP. The API reads it from one header,
`CLIENT_IP_HEADER` (default `x-nf-client-connection-ip`), which must be a header the edge
**overwrites** with the connecting address.

- **On Netlify** the default is right: functions are reachable only through Netlify's edge,
  which sets that header and replaces any client-sent value.
- **Anywhere else**, the origin may be reachable directly and any header can be forged. Put a
  reverse proxy or CDN in front that overwrites the IP header, have it add a shared secret
  header too, and set `EDGE_AUTH_SECRET` (at least 24 characters; header name
  `EDGE_AUTH_HEADER`, default `x-edge-auth`). Requests without the matching secret get no
  client IP, so submissions are refused with 503 rather than trusted.
- `X-Forwarded-For` and `Forwarded` are refused as `CLIENT_IP_HEADER` at startup: their
  leftmost entry is client-controlled. A header that arrives twice is joined by the Fetch
  API (`a, b`), is not an IP, and is refused.
- A missing or unusable IP answers 503 `client-ip-unavailable` and is logged
  (`CLIENT_IP_FALLBACK=reject`, the default). `shared` (one bucket for all) is for local
  tooling only.

### Secrets

`IP_HASH_SALT` and `MODERATION_TOKEN` must be at least 24 characters. With
`NODE_ENV=production`, the public placeholders from `.env.example` (`change-me...`) are refused
at startup. Generate real values with
`node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`.
The token is compared in constant time and never logged.

### CDN purge

Wall listings are cacheable (`Cache-Control: public, max-age=30`, `CDN-Cache-Control: s-maxage=60,
stale-while-revalidate=300`) and tagged `Cache-Tag` / `Netlify-Cache-Tag: complaints-wall`.
When moderation deletes a complaint that was on the wall, the handler calls
`deps.cachePurger.purgeWall()` after the decision is committed; a purge failure is reported
and the moderator still gets 200. The default is `noopCachePurger` (correct with no CDN; on a
CDN, withdrawn text can stay visible for up to about 6 minutes). On Netlify, wire the real
purge in `apps/api/src/lib/create-api.ts`, for example:

```ts
import { purgeCache } from '@netlify/functions';
import { WALL_CACHE_TAG } from '@qa3elhamor/complaints-feature-api';

cachePurger: { purgeWall: () => purgeCache({ tags: [WALL_CACHE_TAG] }) },
```

(Check the current `@netlify/functions` API when the Netlify adapter is written; it is not a
dependency yet.) Browsers can still show a withdrawn complaint for up to 30 s.

### Where moderation is hosted

Never on GitHub Pages: `deploy:prepare` deletes `moderation.html` and every chunk only it
uses, because it needs the API beside it and is not a public page. Host it on the same origin
as the API (the Netlify deployment), with the header block above, and preferably behind the
host's access control (Netlify password protection or an IP allow-list for `/moderation*`).

## What is and is not protected on GitHub Pages

Protected: script and connection allow-listing by CSP, no inline script, no plugins
(`object-src 'none'`), no `<base>` hijack, WebAssembly allowed without `eval`, no secrets in the
bundle (the contact keys are public by design), moderation and `/admin` excluded from the
artefact, HTTPS enforced by Pages.

Not protected (needs headers Pages cannot send): framing/clickjacking (`frame-ancestors`,
`X-Frame-Options`), CSP violation reporting, `nosniff` on static files, `Referrer-Policy`
(browsers default to `strict-origin-when-cross-origin`), `Permissions-Policy`. Models are not
content-hashed, so a CDN can serve a stale model for up to 10 minutes (docs/deploy.md).

## Owner checklist

- [ ] Build with the real `VITE_*` values in CI (the policy is generated from them); after the
      first deploy, open the browser console on the live site and confirm there are no CSP
      violations, and with Umami check the Network tab for any collection host not listed.
- [ ] If the wall API is ever deployed: generate fresh `IP_HASH_SALT` and `MODERATION_TOKEN`,
      set `NODE_ENV=production`, keep `CLIENT_IP_HEADER` at the Netlify default (or set
      `EDGE_AUTH_SECRET` behind your own proxy), wire the CDN purge, and add an edge rate limit
      rule for `POST /api/complaints` and `/api/moderation/*`.
- [ ] Host `moderation.html` only beside the API, with the moderation headers and access
      control; share the token out of band and rotate it if it may have leaked.
- [ ] When building the complaints wall: render complaint text as text only (see "Stored
      XSS"), read the API base from `VITE_WALL_API_URL`, and consider adding `react/no-danger`
      to `apps/web/eslint.config.mjs`.
- [ ] Re-run `npm audit --omit=dev` before launch; the open advisories are in the Prisma CLI tree
      (see `.ptah/specs/security-hardening/notes.md`).
- [ ] Never commit a `.env*` file other than `.env.example` (`.gitignore` covers the rest).

## Verifying

- Specs: `npx nx run-many -t test -p complaints-domain complaints-data-access complaints-feature-api api`
  and `npx vitest run --config tools/deploy/vitest.config.mts` (CSP builder and plugin).
- Built policy: `npx nx run web:build`, then look for `Content-Security-Policy` at the top of
  `apps/web/dist/index.html` and `moderation.html`; `npm run deploy:prepare` prints it.
- Runtime: `npx vite preview --config apps/web/vite.config.mts --port <free port>`, open the
  site, dive, open every landmark and the Credits, and check the console for
  "Content Security Policy" errors (or listen for `securitypolicyviolation` events in a
  headless browser).
