# Scope Decisions — Qaa El-Hamour

Recorded during Stage A discovery (saas-workspace-initializer). Each section states the
chosen value and the rationale. These answers override every default in the initializer skill.

---

## Round 1 — Business

### What are you building?

An interactive Three.js/WebGL brand website themed on the viral Egyptian trend
**"Qaa El-Hamour" (قاع الهامور)** — the August 2026 phenomenon in which ~1.8M Egyptians
projected their bureaucratic and economic frustrations onto the underwater setting of
Bikini Bottom.

The site is a scroll-driven camera dive through an underwater scene. Interactive landmarks
map to portfolio sections: the Pineapple (about), Squidward's Tiki head (resume), the Krusty
Krab (services menu), and a Municipal Complaints Bureau (contact). It doubles as the subject
of a build video for the owner's content channel.

Source blueprint: `assets/qaa-elhamour-threejs-concept.md`.

### Who is the customer?

**A shippable template others fork and deploy.**

Primary visitor is another developer evaluating the codebase, not a hiring manager. This is
the single most architecturally consequential answer in discovery: **all content must be
config/data-driven, never hardcoded.** A forker changes data files and assets — never
component internals — to make the site their own.

Rationale: the owner explicitly chose the template framing over personal-portfolio framing.
Combined with the monetization answer below, this reads as an open-source starter used as a
brand play rather than a paid product.

> **Amended (2026-10-01, owner).** The owner's own deployment is also their **personal
> website**, showcasing their experience. This does not change the architecture — it raises
> the bar on the content model: the owner's real bio, experience, and services must be fully
> expressible as content data, and the repository itself doubles as a portfolio piece, so code
> quality and documentation are part of the product. Nothing personal is hardcoded; the owner
> is simply the first "forker".

### Core jobs-to-be-done

Four capability areas, all selected as real functionality rather than static decoration:

1. **Contact submissions** — the Complaints Bureau actually delivers.
2. **Editable content (CMS)** — bio, resume, and services editable without a redeploy.
3. **Visitor analytics / telemetry** — dive depth, landmark clicks, drop-off, device/FPS tier.
4. **Public visitor complaints wall** — visitors post satirical complaints and read others'.

### MVP scope

**Dive + two landmarks.** Ship the underwater environment and scroll-driven camera path with
two fully interactive landmarks (About and Contact), proving the interaction pattern
end-to-end. The Tiki head and Krusty Krab become Stage B roadmap items.

Rationale: the environment and the landmark interaction pattern are the two risky unknowns.
Proving both against two landmarks de-risks the remaining two, which then become repetitions
rather than inventions.

### Monetization

**No — pure personal brand.** The site never charges anyone. No billing, no accounts, no
subscription infrastructure at any phase.

> **Noted tension, resolved as deliberate.** "Template others buy" (audience) plus "no
> monetization" is read as: a config-driven **open-source** starter given away as the brand
> play. The template framing drives the architecture; the no-monetization answer means zero
> billing scaffolding, now or later. Flagged to the user; not contradicted.

---

## Round 2 — Stack

### Frontend

**React + React Three Fiber (+ drei).**

Rationale: the dominant Three.js ecosystem. Declarative scene graph, mature helper library
for loaders/controls/postprocessing, and the best-documented path for scroll-driven camera
work. Decisive factor given the template audience: more developers can fork R3F than any
alternative.

Consequence: `react-best-practices` and `react-nx-patterns` load during Stage B.

### API / backend shape

**Static-first, with one serverless seam.**

The site is a statically generated bundle. Three of four capabilities are served by
third-party services with no server of ours:

| Capability | Mechanism |
|---|---|
| Contact submissions | Form service (Web3Forms / Formspree) |
| Editable content | Git-based CMS (Decap / Tina) — commits to the repo |
| Analytics | Hosted script tag (Plausible / Umami / Vercel Analytics) |

The **public complaints wall** is the sole exception: it cannot run fully static, and the
owner chose to preserve it as real UGC rather than fake or cut it. It gets a minimal
serverless seam — functions plus a managed Postgres — exposing exactly three operations:
submit a complaint, list approved complaints, moderate (token-protected).

Rationale: keeps the forker's deployment story near-trivial (push to Vercel/Netlify; add one
DB env var only if they want the wall) while still delivering the UGC feature as specified.

### DB / ORM

**Managed Postgres (Neon or Supabase) + Prisma**, scoped to the wall only.

Rationale: Prisma gives typed access and migrations for the two tables the wall needs.
ZenStack is **not** adopted — its value is row-level access policy enforcement for
multi-tenant apps, which this project explicitly is not.

### Auth shape

**No auth in our codebase.**

Visitors are fully anonymous — they browse, submit contact forms, and post to the wall
without accounts. The CMS handles its own authentication through the provider (GitHub OAuth
via Decap/Tina), so content editing requires no auth code of ours. Wall moderation is
protected by a single shared secret in an environment variable, not a user system.

Rationale: the smallest surface that still covers every selected capability. Also the right
call for a template — forkers inherit no auth provider dependency and no user table.

### Tenancy

**Single-tenant per deployment, but tenant-ready.**

Each person who forks the template runs their own instance with their own content and
database. No tenant column and no tenant middleware are built.

"Tenant-ready" is a discipline, not infrastructure: the data model and query layer stay
shaped so a tenant dimension could be added later without a rewrite. Concretely — no global
singletons holding site config, and wall queries go through a repository layer rather than
inline Prisma calls.

Consequence: the initializer's multi-tenant foundation trigger does **not** fire. No
tenant-context middleware, no `libs/shared/infrastructure/tenant`.

---

## Conditional answers

### Billing model

Not applicable — monetization is No.

### Compliance

None flagged. One note: the complaints wall collects free-text user submissions, and
analytics collects visitor telemetry. If the site ships to an EU audience, a cookieless
analytics provider (Plausible/Umami) keeps it out of consent-banner territory. This informed
the analytics recommendation above.

### Inbound integrations

None. No webhooks land on day one. The `webhook-architecture` skill does not activate for
this project.

### Deployment target

Not specified by the user. **Assumption: Vercel or Netlify** — static hosting with
serverless functions in the same deploy, which is exactly the shape the wall seam needs and
the lowest-friction target for forkers. Revisit if the owner has a fixed target.

> **Decided (2026-10-01, orchestrator, during cms-integration): Netlify.** Decap CMS's GitHub
> backend can authenticate through Netlify's built-in OAuth provider, which keeps "zero auth
> code" true without running our own OAuth handshake; Vercel would need one. Netlify Functions
> take Fetch-API `Request → Response` handlers, so `apps/api` stays host-agnostic and the
> Netlify adapter is a thin wrapper. `deploy-static` may still revisit this.

> **Amended (2026-10-02, owner; deploy-static): GitHub Pages user site.** The site is published
> to https://abdallah-khalil.github.io/ (repository `Abdallah-khalil/Abdallah-khalil.github.io`,
> branch `master`), pushed from `Hive-Academy/qa3elhamor` by `.github/workflows/deploy-pages.yml`
> over an SSH deploy key (`PAGES_DEPLOY_KEY`). It is static only: the complaints wall stays off
> (no `VITE_WALL_API_URL`), contact goes through a form service, and `moderation.html` and
> `/admin` are excluded from the artefact. The workflow is manual (`workflow_dispatch`) until the
> owner approves the first publish. Vite `base` is `/` and is overridable with `SITE_BASE` for
> forkers on a project site. This supersedes the Netlify decision above for the owner's
> deployment; `netlify.toml` is kept as an optional path (a Netlify-hosted fork, or the Decap
> CMS's Netlify OAuth gateway) and says so. Details and owner steps: `docs/deploy.md`.

---

## Asset and licensing constraints

Four 3D models are present in `assets/`, all **CC-BY-4.0** (commercial use allowed,
attribution required):

| Asset | Author | Size |
|---|---|---|
| Bikini Bottom Map 3D Model | spongebob.evolution | 5.0 MB |
| Sbfbb-SpongeBob House (pineapple) | Sajin Mickey Firey fan 1342 | 2.3 MB |
| Sponge On The Run: SpongeBob Base Model | NickBob | 17 MB |
| Sponge On The Run: Patrick Base Model (Textured) | NickBob | 3.3 MB |

Two constraints follow, both load-bearing on the build:

1. **Attribution is mandatory and must be visible.** Each of the four models requires a
   credit line. This is a real UI element, not a README footnote — planned as an in-world
   credits plaque so it fits the art direction instead of fighting it. Attribution text is
   held as data alongside the asset manifest so it cannot drift from the models it covers.

2. **SpongeBob is Nickelodeon/Paramount IP.** The Sketchfab licenses cover the *mesh files*,
   not the underlying characters. Parody use of a viral meme sits differently from a
   commercial brand site trading on the IP. This does not change the technical build, but it
   shapes naming: **lean on the Egyptian trend framing** (Qaa El-Hamour, the Sardine
   President, the complaints bureau, "we reached the bottom") rather than SpongeBob branding.
   The no-monetization answer materially reduces this exposure.

   > **Amended (2026-10-01, owner).** Landmarks get talking **narrators**. Default cast is
   > original and authored in code (the Hamour as guide, the Sardine President, a crab clerk —
   > IP-clean); the bundled SpongeBob/Patrick models become a **config switch** (off by default
   > in the template; the owner may enable them on their own deployment, accepting the IP risk
   > explained to them). Presentation direction: narrator speech bubbles + content as 3D scene
   > objects, with the accessible HTML card one tap away and kept as the reduced-motion /
   > low-tier fallback — no full-screen panels.
   >
   > **Amended (2026-10-02, owner).** The owner signed off on the narrated Pineapple ("gives it
   > more life and freshness") and wants **all downloaded characters used** on their deployment.
   > Mixed cast: Pineapple → SpongeBob, Tiki → Patrick, Krusty Krab → crab clerk, Bureau →
   > Sardine President, the Hamour as dive guide + ambient. The bundled characters are enabled
   > per deployment by `VITE_BUNDLED_CHARACTERS=true` (set for the owner's Pages deploy); the
   > template default stays off. Original cast remains the fallback (low tier, load failure).
   >
   > **Amended (2026-10-02, owner, later).** Bundled characters ON by default for the owner's site
   > (`site.config.ts` `NARRATOR_CAST.bundledByDefault: true`; forks set false;
   > `VITE_BUNDLED_CHARACTERS=true|false` still overrides). **Explicit OK** to replace
   > `Abdallah-khalil.github.io` completely (no backup needed — the 2019 page is not wanted) and
   > to make `Hive-Academy/qa3elhamor` public. New asks for the next session: soft aquarium
   > background music; SpongeBob/Patrick should move and interact (not only talk).

3. **Raw asset weight is 27.6 MB** — far past a usable first-load budget. Draco/Meshopt
   compression plus KTX2 texture transcoding is a Phase 2 requirement, not an optimization
   afterthought. The 17 MB SpongeBob model alone exceeds any reasonable budget untouched.
