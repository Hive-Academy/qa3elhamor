# Handoff — Qaa El-Hamour (قاع الهامور)

> Written 2026-10-01 at the end of an orchestration session. Read this first, then
> `.ptah/roadmap.md` (task list + per-item **Outcome** notes) and `.ptah/scope-decisions.md`
> (discovery record, amendments, hosting decision).

## 1. Mission and operating mode

Build the whole roadmap (`.ptah/roadmap.md`) until the site is **live, open source, and
published at https://abdallah-khalil.github.io/**. The owner's deployment is their
**personal website** showcasing their experience; the repo doubles as a forkable
open-source template and a portfolio piece (scope-decisions amendment, 2026-10-01).

**Mode: full auto** (owner's standing instruction). Do not ask the owner questions except
for things only they can provide (credentials, accounts, personal content) or irreversible /
outward actions they haven't approved yet (see §7). Otherwise decide, record the decision,
and keep going.

**Process per roadmap item** (followed for every item so far):

1. Orchestrator pre-creates package stubs for new libs and runs `npm install` **once**
   (parallel agents must never run `npm install` concurrently — see §5).
2. **Subagents implement** (Agent tool: `frontend-developer`, `backend-developer`,
   `devops-engineer`), in parallel only when file-disjoint. Each brief restates the charter
   verbatim, lists read-first files, exact scope, boundary rules, verification commands, and
   "never commit/push/stash/reset/restore/checkout".
3. Orchestrator runs checks itself:
   `npx nx run-many -t lint,typecheck,test,build,validate` (+ `npm run assets:verify`).
   Look at screenshots for UI work.
4. **Cross-side review by CLI lanes** (in-process author → CLI reviewer):
   - **Glm** — `ptah_agent_spawn` with `ptahCliId: pc-355b645d-35af-4974-84cf-9cf961ea0164`,
     `modelTier: opus`, `role: code-logic-reviewer`.
     **Glm cannot read images.** Always write "NEVER open .png or other binary files" in its
     task. A session that tried to read an image is poisoned and cannot be resumed — respawn
     fresh.
   - **agy** — `cli: antigravity`, `role: code-logic-reviewer` (can read images).
   - Deliverable: `.ptah/specs/<item>/code-logic-review-glm.md` or `code-review-agy.md`
     (`-r2`, `-r3` for re-reviews). Always pass `deliverables` + a 20-min `timeout`.
     Resume with `resume_session_id` for re-reviews.
   - Max 3 lanes in flight. Revise cap: 2 author/reviewer rounds, then one bounded
     correction + independent check.
5. Fixes go back to the original author (SendMessage) as numbered items with file:line.
6. On approval: mark the item `[x]` in the roadmap with an **Outcome.** note (what shipped,
   deferred items, hand-offs), commit with a conventional message ending in
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, push, confirm CI is green.
   Stage specific paths only (never `git add -A`). **Do not commit `.agents/mcp_config.json*`
   or `.mcp.json*`** — machine-local.

## 2. Repository

- Remote: `https://github.com/Hive-Academy/qa3elhamor` (**private** for now), branch `main`.
- CI: `.github/workflows/ci.yml` — `npm ci`, `nx affected -t lint typecheck test build`,
  `npm run assets:verify`. Green on every pushed commit so far.
- Commits: `49cab3d` initial → `2ef49cd` asset-compression → `47f6649` swc fix →
  `6b1de0f` batch 1 → `3863828` batch 2 → `ab7b10e` cms-integration.

## 3. Roadmap status

**Done (committed):** workspace-init, shared-primitives, asset-manifest, ci-baseline,
asset-audit, asset-compression, world-environment, content-model, complaints-domain,
dive-camera, complaints-api, cms-integration.

**Batch 3 — implemented, NOT yet committed (in the working tree):**

| Item | State | Review |
|---|---|---|
| complaints-moderation | done | agy APPROVED 9/10 (`-r3`) |
| telemetry-events | done, wired into app | Glm APPROVED 9/10 (`-r2`); 1 docs minor: `trackOverlayOpened` has no caller yet |
| landmark-kernel | **revision round 1 in progress at handoff** | agy REVISE 6/10 (`code-review-agy.md`) |

landmark-kernel revision asked for: non-dialog landmarks (`presentation: dialog | in-world`
+ in-scene R3F slot, needed by krusty-krab's 3D menu and complaints-wall), inert background +
focus trap, focus return when opened from the canvas, switching between landmarks while one
is focused, scroll-lock vs dive `suspend/release` ordering, `useCompressedModel` single-
instance issue, beacon occlusion. **Next session:** inspect the working tree; if the revision
is incomplete, finish it (new subagent with the review file as the brief); then fix
`apps/web/src/app/telemetry.spec.ts` (it broke on the kernel's `CloseReason` change — the
moderation agent saw `"dismiss"` not assignable), run all checks, re-review the kernel with
agy (resume session `d4a2841c-dc09-4655-9fd8-ea5f68fc90e3` if still valid, else fresh), then
commit batch 3 (three items, one commit or one per item) and push.

**Remaining, in planned batch order:**

- **Batch 4 (MVP):** landmark-pineapple (Citizenship Card: bio + skills from content),
  landmark-bureau (contact scroll form), **asset-attribution-ui** (pulled forward: must exist
  before the repo goes public), quality-tiers (also wires `trackQualityTier`).
- **Batch 5:** complaints-contact-adapter (Web3Forms/Formspree), complaints-wall (in-world
  board; uses kernel `in-world` presentation), landmark-tiki, landmark-krusty-krab,
  i18n-bilingual (content is already `{ en, ar? }`; locale is hard-coded `en` in app.tsx).
- **Batch 6:** template-config, deploy (see §4), perf-budget, security-hardening (collect the
  hand-off lists in `.ptah/specs/complaints-api/*`, `complaints-moderation/*`,
  `docs/cms.md` CSP section, `docs/analytics.md` CSP section), a11y-fallback, qa-smoke,
  launch-checklist (open source + publish).

## 4. Deployment target — CHANGED by the owner

Owner wants **GitHub Pages at https://abdallah-khalil.github.io/** (user site) and the repo
**open-sourced after they validate** locally. Consequences to design `deploy-static` around:

- `Abdallah-khalil/Abdallah-khalil.github.io` exists, public, holds a 2019 "coming soon"
  page (index.html, coming_soon.css, background jpg, favicon). **Back it up to a branch
  (e.g. `legacy-2019`) before replacing, and get the owner's explicit OK before the first
  publish.**
- Publishing: code stays in `Hive-Academy/qa3elhamor`; a GitHub Action builds `apps/web`
  and pushes `apps/web/dist` to the Pages repo (needs a deploy key or fine-grained PAT stored
  as a secret — owner must create it). Vite `base` must be `/` for a user site. SPA fallback:
  copy `index.html` → `404.html` if routes are added. Keep `moderation.html` out of Pages
  or behind the API host (decide in deploy-static).
- GitHub Pages is **static only**: `apps/api` (complaints wall + moderation, Postgres) needs a
  separate host (Netlify Functions, Render, Fly, …) or the wall stays disabled; the Bureau
  form can use a form service only. Decap CMS login can still use Netlify purely as the
  OAuth provider, or content is edited in-repo. Update `.ptah/scope-decisions.md`
  (Deployment target section currently says Netlify) when deploy-static decides.
- `netlify.toml` (build section only) exists from cms-integration; keep or remove per the
  decision.

## 5. Conventions and gotchas (learned the hard way)

- **New lib scaffold:** package.json stub (`name @qa3elhamor/<name>`, `exports` → `src/index.ts`,
  `nx.name`, `nx.tags` with `scope:`, `type:`, `platform:`), `src/index.ts`, then one
  `npm install`. Agents create tsconfig/eslint/vitest by mirroring an existing lib.
- **Boundaries** (`eslint.config.mjs`, never loosen): each `scope:` imports only itself +
  `scope:shared`; `apps/web` is the only composition root joining world/dive/landmarks/
  content/telemetry. Tools: `type:tool`/`scope:tools`/`platform:node`; content files:
  `type:data` (`content/` is workspace package `@qa3elhamor/content-files`).
- Run `npx nx sync` after dependency changes; if other agents are mid-edit, use `--skipSync`.
  If Nx says the project graph failed, check for a nameless package.json or a BOM in a
  tsconfig.
- `web:build` depends on `content-data-access:validate` — invalid content cannot build.
- npm workspaces use `"*"`, never `workspace:*`.
- `.gitattributes` pins LF; don't `git add --renormalize .` while agents have work in flight
  (it stages their files).
- Windows reserves ports above ~49152: Docker Postgres is on **15432**. Port 4200 is often
  held by a stray agent dev server — use `vite --port 4400 --strictPort`.
- Prisma **7.10.0** (not the 8.x RC), generated client git-ignored, generated by the
  `prisma-generate` target before typecheck/build/test.
- `WORLD_SCALE = 20`, single-sourced through `OceanWorld` → `useWorldScale`/`useSceneToWorld`;
  landmarks sit in raw scene-world units inside `<WorldSpace>`.
- Textures are WebP (KTX-Software not installable without admin); switch documented in
  `tools/asset-pipeline/README.md`. Environment asset is at ~95% of its 1,200 KiB budget.
- Main JS chunk is ~1 MB (Vite warns) — perf-budget should code-split three/drei.

## 6. Running it locally

```bash
npm ci
npx nx serve web                 # or: cd apps/web && npx vite --port 4400 --strictPort
# complaints API (optional):
npm run db:up && cp .env.example .env && npm run db:migrate && npm run api:dev   # :8787/api
npm run api:integration          # Docker Postgres integration suite
npm run cms:local                # Decap local backend; then open /admin/index.html
npm run assets:compress | assets:verify
```

## 7. Needs from the owner (ask only when the item that needs it starts)

1. **Real content** for `content/*.json` (currently SAMPLE "Your Name"): confirmed bio,
   headline, location, experience entries with dates, skills, projects (with links),
   services, social links, public contact email, avatar photo, Arabic versions (optional).
   Known background to draft from (confirm before publishing): 12+ years software engineer;
   ~4 years tech lead at Prio (getprio.com) — architected their SaaS platform and onboarded
   an Egyptian engineering team; co-founded Miramar Staffing (Cairo outsourcing firm);
   creator of **Ptah** (AI coding-agent extension, full-time ~1 year) and the open-source
   **Anubis-MCP** (7k+ npm installs, 120+ stars); GitHub `Abdallah-khalil`.
   Do **not** publish the owner's work email unless they say so.
2. **Explicit go-ahead** to (a) make `Hive-Academy/qa3elhamor` public, (b) replace the
   `Abdallah-khalil.github.io` site.
3. **Secrets/accounts:** Pages deploy key or PAT; API host account + managed Postgres (if the
   wall ships); form-service key (Web3Forms/Formspree); analytics provider (Plausible/Umami,
   optional — default is off); GitHub OAuth app for the CMS (optional).
4. IP framing (scope-decisions §IP): lean on the Egyptian trend, not SpongeBob branding;
   CC-BY credits plaque must ship before going public.
