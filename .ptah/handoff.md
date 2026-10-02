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

**Batch 3 — COMMITTED (moderation, telemetry, landmark-kernel; all APPROVED). The notes below are kept for history:**

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

- **Batch 4 (MVP) — COMMITTED, all APPROVED:** landmark-pineapple (Citizenship Card: bio + skills from content),
  landmark-bureau (contact scroll form), **asset-attribution-ui** (pulled forward: must exist
  before the repo goes public), quality-tiers (also wires `trackQualityTier`).
- **LIVE STATUS — session 2026-10-02 (afternoon), keep updated:**
  - **Owner: reviews PAUSED "until we have everything working"** — run the real checks + look at screenshots, but no cross-side review rounds until the owner re-enables them.
  - **All CLI lanes out of quota today:** agy (429, resets ~2026-10-07), codex (until 2026-10-03 20:10), opencode/Kimi (unknown error = limit), Glm (quota). Owner said Glm is out; when reviews resume, owner picked codex first; fallback in-process `code-logic-reviewer` subagent labelled "weaker evidence".
  - `ambient-audio` committed `7754afb` (world-audio lib, CC0 "Underwater Theme II" by Cleyton Kauffman, synthesized ambience) — **awaiting owner mood sign-off** before `[x]`. Open questions to owner: ducking per line vs whole visit; should Tab count as the first gesture.
  - `character-animation`: research + review in `.ptah/specs/character-animation/`; decision = **option (d) runtime-generated skin weights at load** (GLB unchanged). SpongeBob spike in progress, plus "resident" idle narrators visible at landmarks during the dive (owner: show movement before clicking).
  - New owner items (roadmap): `cinematic-tour`, `voice-sfx` (in progress in world-audio), `ocean-text` (hybrid A+C+B chosen; SDF component committed `d489a9d`, dev preview `/ocean-text-preview.html` — **owner: "the text preview is awesome" (look signed off)**; next: wire into the speech bubbles after cinematic-tour lands; troika needs `useWorker:false` under CSP).
  - Committed this session: `7754afb` audio, `27aadaf` voice/sfx lib, `517dcf4` SpongeBob runtime skinning + resident idle, `d489a9d` ocean-text, `37ec1e6` voice wiring + poke-to-react. Then `3bc7172` cinematic tour (`?tour=on` forces intro) and `baabe78` SpongeBob flow + door placement (`?place=resident`). **Owner: likes the SpongeBob animation → do the same for every character; convert all text to the agreed hybrid 3D text.** In progress (parallel, file-disjoint): `cast-animator` (Patrick skinning rig + jointed code-built crab clerk / Sardine President / Hamour, residents at every stop) and `ocean-text-integration` (3D speech bubbles with DOM a11y layer, SDF labels, canvas boards, tour double-whoosh fix). Awaiting owner: music mood, tour feel.
  - **Owner 2026-10-02 evening:** "that's all great" = sign-off on music mood, tour, dive feel, characters. Tour must open on EVERY visit (tour-entry.ts: stored choice no longer skips the intro; automated browsers / `?tour=off` still skip). Content confirmed: email, LinkedIn, ptah.live, getprio.com all correct; Anubis MCP ships without link/figures. Contact = Web3Forms (**key still to be pasted by owner** → `gh secret set VITE_WEB3FORMS_ACCESS_KEY`). Deploy key created via gh (deploy key "qa3elhamor-pages-deploy" write on the Pages repo; secret PAGES_DEPLOY_KEY; vars PAGES_REPOSITORY, PAGES_BRANCH=master, SITE_URL, VITE_CONTACT_PROVIDER=web3forms). Publish steps left: commit text + cast + LICENSE/README → dry-run deploy → publish → Linux baselines dispatch → flip repo public → verify live.
- **NEXT SESSION (written 2026-10-02 at end of session) — READ THIS FIRST:**
  - **State:** every original roadmap item is built, cross-side reviewed and committed; CI and push/PR E2E are green on `main` (`27b1f04` and earlier). Narrator-dependent e2e flows run in the nightly `e2e-inworld` job (frame-bound on software GL — see docs/testing.md).
  - **Just changed:** SpongeBob (Pineapple) and Patrick (Tiki) are now ON by default for the owner's site (`apps/web/src/site.config.ts` → `NARRATOR_CAST.bundledByDefault: true`; env `VITE_BUNDLED_CHARACTERS=true|false` overrides). They are lazy and need the **medium tier or higher** — on the low tier / no WebGL the original cast (Hamour) stands in. If the owner still sees only the fish locally: check `?quality=high`, the tier readout bottom-left, and the console for a model load error.
  - **Owner approvals now on record (scope-decisions, 2026-10-02 later):** (a) replace `Abdallah-khalil.github.io` completely — **no `legacy-2019` backup needed** (ignore that step in docs/deploy.md; update the doc); (b) make `Hive-Academy/qa3elhamor` public. Both are allowed when the launch-checklist item runs — still do them as deliberate, announced steps, and only after the site builds green with the owner's real settings.
  - **New work for this session (roadmap items, in order):**
    1. `ambient-audio` — soft aquarium music + ambience, gesture-gated, persistent mute toggle, lazy, licence-clean (CC0 or attributed in credits; no SpongeBob music), CSP `media-src`, perf budget.
    2. `character-animation` — SpongeBob/Patrick move (idle, wave, talk gestures, hop in/out, click reaction). The LODs are **unrigged T-pose** meshes: research rigging options first (auto-rig service vs pipeline-generated skeleton vs vertex-shader limb masks), prototype on SpongeBob, owner sign-off with screenshots + local preview, then Patrick.
    3. `character-interactions` — click/tap reactions with content-driven quips, glance at pointer, first-visit greetings, idle bits, cameo waves during the dive; bilingual, reduced-motion aware, keyboard-reachable; keep `data-visit-state` semantics for e2e.
    4. `launch-checklist` — once the owner provides: content ⚠ confirmations (`.ptah/specs/owner-content/`, Arabic in `.ptah/specs/i18n-bilingual/notes.md`), Web3Forms key or Formspree id, Pages deploy key + repo variables (`docs/deploy.md`; `VITE_BUNDLED_CHARACTERS` no longer needed), dive-feel sign-off. Then LICENSE, README, publish, Linux visual baselines (E2E `update_snapshots` dispatch), repo public, verify live.
  - **Process (unchanged, §1):** subagents implement (file-disjoint parallel; orchestrator does `npm install` / stubs); orchestrator runs `npx nx run-many -t lint,typecheck,test,build,validate --parallel=2` + `npm run assets:verify` + `npm run perf:budget` + `npx vitest run --config tools/deploy/vitest.config.mts`; look at screenshots for UI; cross-side review by CLI lanes — **agy** (`cli: antigravity`, role `code-logic-reviewer`, can view images; often exits code 1 AFTER writing its file — check the file; transient 503 → retry) and **Glm** (ptah-cli `pc-355b645d-35af-4974-84cf-9cf961ea0164`, modelTier opus, NEVER images; hit its Ollama Cloud quota last session — try it, fall back to agy); **opencode/Kimi** (`model: opencode-go/kimi-k2.7-code`; `opencode/…` has no funds) hit its Go usage limit — try once, else give its work to subagents. Max 2 revise rounds. Commit specific paths with the Co-Authored-By trailer, push, confirm CI + E2E green, keep this file current.
  - **Gotchas learned:** convert screenshots to JPEG before committing (`.ptah/specs/**`; PNGs bloated a commit to 80 MB once); `.ptah/roadmap.md` is CRLF (use the Edit tool, not node string replace); each push cancels the previous E2E run (concurrency) — judge E2E on the latest run only; the owner watches `http://localhost:4400` (`cd apps/web && npx vite --port 4400 --strictPort`) — agents must use other ports; Windows Git Bash mangles `SITE_BASE=/repo/` (use `SITE_BASE=repo`).
- **Session 2026-10-02 — status (history):**
  - **Every build item is done and committed** (roadmap all `[x]` except `dive-tuning` = awaiting the owner's explicit feel sign-off, `deploy-static` = built but never published, `launch-checklist`). Latest: narrated Tiki/Krusty Krab/Bureau on the shared kit + mixed cast (`fc58225`), security-hardening (`11d676b`), a11y-fallback (`3eb92fa`), i18n (`f75e50c`), e2e (`6bd0c76` … `abc05be`, in-world label picking runs nightly), lazy 3D shell + complaints wall (`4a6b8a6`), template-config (`36a0557`).
  - **Owner decisions this session:** narration signed off; ALL downloaded characters used → mixed cast via `VITE_BUNDLED_CHARACTERS=true` (Pineapple SpongeBob, Tiki Patrick, Krusty crab clerk, Bureau Sardine President; template default off).
  - **launch-checklist needs the owner:** (1) content ⚠ confirmations (`.ptah/specs/owner-content/`, plus Arabic strings in `.ptah/specs/i18n-bilingual/notes.md`); (2) Web3Forms key / Formspree id → repo vars; (3) deploy key per `docs/deploy.md` + repo variables (`PAGES_REPOSITORY`, `PAGES_BRANCH=master`, `VITE_BUNDLED_CHARACTERS=true`, contact vars); (4) explicit OK to back up `Abdallah-khalil.github.io` to `legacy-2019` and replace it; (5) explicit OK to make `Hive-Academy/qa3elhamor` public; (6) run the E2E `update_snapshots` dispatch once for Linux visual baselines.
  - **Lanes:** Kimi (opencode Go) and Glm (Ollama Cloud) hit usage limits this session; agy carried all reviews (it sometimes exits 1 after writing — check the file; transient 503s → retry).
- **Session 2026-10-01 (evening) — status:**
  - Committed & CI green: owner content (`6f51622`), dive-tuning (`3965805`, awaiting owner sign-off on feel), ambient-life + governor fix (`b250e36`), contact adapter (`6400194`; wiring in `7942fb3`), in-world kernel stage + first card prototype (`7942fb3`), narrator foundations — original cast, SpongeBob/Patrick LODs, narration content (`5664a5c`), narrated Pineapple with 3D skill bubbles (`4e169b6`, agy APPROVED 9/10 r2).
  - **Owner re-scoped presentation** (scope-decisions amendment + roadmap `diegetic-overlays` "Re-scoped" + new `narrators` item): narrator characters + content as 3D objects, no full-screen panels; cast original by default, SpongeBob/Patrick a config switch (`narrators.config.ts useBundledCharacters`, dev preview `?narrators=bundled`).
  - **Waiting on owner:** sign-off on the narrated Pineapple (then roll out Tiki tablets / Krusty menu board / Bureau counter scroll), whether their deployment uses bundled characters, content ⚠ confirmations (`.ptah/specs/owner-content/`), Web3Forms key or Formspree id.
  - **Lanes:** Kimi (`opencode`, model `opencode-go/kimi-k2.7-code`; `opencode/…` has no funds) hit the opencode Go usage limit — dropped; Glm and agy healthy (agy often exits code 1 AFTER writing its deliverable — check the file).
  - Follow-ups recorded: deploy-time `contactConfigProblems` guard (deploy item); narration `ar` coverage + hint↔skill-group build gate (i18n); kelp roof tagging, Hamour degenerate-patrol warn (world); ambient Hamour should hide while the guide Hamour narrates; pineapple highlight tint too strong; UI strings (Next/Skip/…) → content; scroll-to-leave should continue the dive (libs/dive).
  - Screenshots in `.ptah/specs/**` are JPEG (convert PNG before committing — repo size).
- **Batch 4.5 (owner feedback 2026-10-01):** owner content into `content/*.json`, `dive-tuning` (camera framing/scroll feel), **`diegetic-overlays`** (owner wants the modal popups replaced by in-world presentations — prototype the Pineapple card first, get sign-off, then roll out; see the roadmap charter), `ambient-life` (fish schools + an original Hamour hero creature; SpongeBob/Patrick stay unplaced — IP). See the new roadmap items.
- **Batch 5:** complaints-contact-adapter (Web3Forms/Formspree), complaints-wall (in-world
  board; uses kernel `in-world` presentation), landmark-tiki, landmark-krusty-krab,
  i18n-bilingual (content is already `{ en, ar? }`; locale is hard-coded `en` in app.tsx).
- **Batch 6:** template-config, deploy (see §4), perf-budget, security-hardening (collect the
  hand-off lists in `.ptah/specs/complaints-api/*`, `complaints-moderation/*`,
  `docs/cms.md` CSP section, `docs/analytics.md` CSP section), a11y-fallback, qa-smoke,
  launch-checklist (open source + publish).

## 4. Deployment target — CHANGED by the owner

**Backend decision (2026-10-01):** the site is static on GitHub Pages; the complaints *wall* is the only backend feature and ships disabled by default (enabled via `VITE_WALL_API_URL` when a forker/owner hosts `apps/api`). Contact form → form service, no backend. See the Phase 5 scope note in the roadmap.

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

1. **Real content** — RECEIVED 2026-10-01, transcribed in `.ptah/owner-profile.md` (phone deliberately omitted; ⚠ items need confirmation: email spelling, LinkedIn slug, Ptah URL, Anubis star figure). Write it into `content/*.json` right after batch 4 (the MVP-landmarks agent edits `content/site.json` during batch 4). Original note: confirmed bio,
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
