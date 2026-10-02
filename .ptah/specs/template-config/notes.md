# template-config: notes

Roadmap item: forkability pass. Outcome: a throwaway fork was rebranded end to end ("Coral
Deep", Sam Reef, purple theme, English only, reshuffled original cast, Krusty Krab replaced by a
new lighthouse model through the asset pipeline, project-site base path) by editing content,
config and assets only. Every snag it hit was fixed in the template. The owner's site renders as
it did before.

## Audit summary

Full table: [audit.md](audit.md). Before this item, the owner and the brand leaked out of content
in four places: the page `<head>` (title, description, theme colour, favicon, all hard-coded in
`index.html`/`moderation.html`), the UI string tables (the owner's name in the wall choice and the
Sardine President's "filed" lines), brand marks in components (the Arabic masthead, the place
name in two copy strings, the contact `from_name`), and ~40 colour literals restated across a
dozen stylesheets. Landmarks, dive and cast were already data, but spread over three files and
mixed with code.

## The config surface

| Layer | File | Holds |
| --- | --- | --- |
| Content | `content/*.json` | everything about the person, incl. 5 new copy keys that name them (`complaintPrivateLabel`, `complaintPrivateHint`, `complaintFiledLine`, `complaintFiledUnsentLine`, `complaintFiledPublicLine`; model, CMS config and both content sets updated) |
| Sample content | `content.example/*.json` + `npm run template:reset` (`tools/template/reset.ts`) | neutral "Sam Reef"; reset refuses over uncommitted `content/` edits (`--force`); `content-example.spec.ts` validates it and fails if it ever contains the owner's name or links |
| Config | `apps/web/src/site.config.ts` (types-only imports) | `SITE` (brand, meta, theme ×15, ocean, locales), `LANDMARK_PLACEMENTS`, `LANDMARKS`, `DIVE_CONFIG`, `NARRATOR_CAST` |
| Build | `apps/web/src/site-build.ts` + `siteTemplate()` in `vite.config.mts` | `<head>` at `<!-- site:head -->` in both HTML entries, `virtual:site-theme.css`, `SITE_URL` validation, input validation (CSS values, public paths) |
| Env | `.env.example`, deploy workflow | unchanged provider keys; new optional `SITE_URL`; `SITE_BASE` now refuses a Git-Bash-mangled path |
| Assets | `libs/world/domain` manifest + attribution, `tools/asset-pipeline` | whole models no longer need a recipe list edit |
| Docs | `docs/template.md` ("Make it yours in 30 minutes"), README "Use this template", content/README, landmarks/narrators READMEs, deploy.md, perf-budget.md, asset-pipeline README | |

Code that consumed the moved data now reads it from config: `dive.config.ts` (types + builder
only), `narrators.config.ts` (types + env switch), `landmarks.config.ts` (scenes built only for
configured landmarks, at their own stop), `locale.ts`/`language-toggle.tsx` (`SITE.locales`),
`app.tsx`/`page-view.tsx` (mark), `contact-submitter.ts` (`fromName`), `dive-shell.tsx`
(`SITE.ocean`). `landmark-definitions.ts` is deleted (its data is `LANDMARKS`).

## Fork verification log

Throwaway worktree `../qa3-fork` (`git worktree add ../qa3-fork HEAD`, this item's diff applied
and committed there as a baseline). No `npm install`: `node_modules` was built from junctions to
the main tree's packages, with `@qa3elhamor/*` pointing at the fork's own sources (as npm would
link them), so the fork's content and libs were really the ones compiled. Removed afterwards
(junctions unlinked first so the removal could not follow them into the main tree).

Steps, as a forker, following docs/template.md:

1. `npm run template:reset` → Sam Reef sample in `content/`.
2. `site.config.ts`: place/mark "Coral Deep" (mark in English), `contactFromName`, `siteName`,
   `ogImage`, theme (purple sea `#241238`, mint paper, coral accent, plum lagoon), `ocean` fog
   `#241238` + pink caustics + plum ambient, `locales: ['en']`, cast tiki→crab clerk,
   krusty-krab→Hamour, landmark labels in English only.
3. Content: place name in the card title/issuer, an English motto, `_sample` note removed.
4. Model swap: `assets/fork-lighthouse/scene.glb` (a box-built lighthouse standing in for a
   Blender export, origin at its base, scene-world units) + `license.txt` (CC-BY-4.0, credited
   to the fork's author); `SourceModelId` + `SOURCE_MODELS` (15,067 bytes) + `WEB_ASSETS`
   `landmark-lighthouse` (12 KiB budget, low tier, initial); `ATTRIBUTIONS` entry; the Krusty Krab
   cut kept (so the lot stays empty) and set `lazy: true`; `npm run assets:compress` → 9,328 B,
   132 tris, `offset: null`; `LANDMARKS['krusty-krab']` → `model: 'landmark-lighthouse'`,
   `position` on the old building's lot, `scale: 0.8`.
5. CMS: `backend.repo: sam-reef/coral-deep`. OG image: `apps/web/public/og-image.jpg`.
6. Build as a project site: `SITE_BASE=coral-deep SITE_URL=https://sam-reef.github.io/coral-deep/`,
   then `perf:budget`, `deploy:prepare` with the same base.

Forker footprint (`fork/fork-diffstat.txt`, `fork/fork-config.diff`): `site.config.ts`,
`content/*.json`, `admin/config.yml`, the asset manifest + attribution, the new asset and its
licence, pipeline outputs (`.glb`, `placements.json`, compression report), `og-image.jpg`. No
component, stylesheet or spec edits.

Checks in the fork (final state): `nx run-many -t lint,typecheck,test,build,validate` green
(web: 651 passed, 34 skipped: the Arabic-only suites), `assets:verify` OK, `perf:budget` OK
(initial models 1,230.6 / 1,662 KiB), deploy specs 17/17, `deploy:prepare` OK, the built site
carries no "Abdallah"/"عبدالله", and the lighthouse's credit ships in the credits.

Screenshots (`fork/`, served from the prepared artefact under `/coral-deep/`, port 4630):
`fork-start.jpg` (purple fog, "Coral Deep" mark, no language switch, lighthouse beacon),
`fork-pineapple.jpg`, `fork-krusty.jpg` (the lighthouse on the Krusty Krab's lot),
`fork-open.jpg` (visiting it: the Hamour narrates, as cast), `fork-page.jpg` (2D page in the fork
theme, "You are reading Coral Deep as a page").

## Snags the fork hit, and the template fix for each

| # | Snag | Fix |
| --- | --- | --- |
| 1 | `template:reset` refused: it expected a `content.example/package.json` | only content JSON is compared (`package.json` is not content) |
| 2 | 15 web specs pinned the shipped config: Arabic switch, the cast, the mark "قاع الهامور", four landmark names | specs follow `site.config.ts`: Arabic suites `skipIf` one language, cast/landmarks/mark read from config, a one-language case added to `locale.spec.ts` |
| 3 | Git Bash rewrote `SITE_BASE=/coral-deep/` into `C:/Program Files/Git/coral-deep/`, silently shipping broken URLs | `vite.config.mts` refuses a drive-letter base with the fix in the message; docs use `SITE_BASE=<repo>` (slashes optional) |
| 4 | `npm run perf:budget` failed on the project-site build | it reads `SITE_BASE`; docs now pass it (the workflow already sets it job-wide) |
| 5 | The 2D page and Citizenship Card stayed teal: a second sea palette (`#0f5e6e`, `#0a3d4a`, links `#0b5874`) and the nav bar were outside the theme | `theme.lagoon`, `lagoonDeep`, `link`; nav from `--theme-sea` |
| 6 | An English motto rendered right to left (".We reached the bottom"): the motto was forced `lang="ar" dir="rtl"` | `dir="auto"`, `lang="ar"` only for Arabic script |
| 7 | `citizenship-card.spec` assumed the profile name has Arabic | fixture name |
| 8 | Place name still in sample copy after renaming the place | docs/template.md gives the grep; content stays the editor's |
| 9 | A syntax error in `site.config.ts` surfaces as an Nx project-graph error (the Vite config imports it) | message names the file and line; noted, no change |

Also found while building the surface (main tree, before the fork): removing a landmark from
config would have thrown at load (`stopView` of a missing stop) because every scene was built
unconditionally; the landmark specs required exact overlay keys and a map placement for every
model; adding a whole model meant editing the pipeline's `WHOLE_MODEL_IDS`. All fixed (above).

## The owner's site, before and after

Built with the owner's settings (`VITE_BUNDLED_CHARACTERS=true`), served on its own port (4620+),
1440x900, reduced motion, SwiftShader. JPEGs in this folder:
`before-start/pineapple/krusty/page.jpg` (HEAD before this item) and `after-*.jpg` (final).

Mean absolute pixel difference (0-255 per channel), and channels off by more than 40:

| Shot | before vs after | before vs a second "before" run (noise) |
| --- | --- | --- |
| dive start | 0.085 (1,371) | 0.075 (653) |
| pineapple stop | 0.331 (6,662) | 0.302 (5,276) |
| Krusty Krab stop | 0.008 (0) | n/a |
| page view | 0.000 (0) | n/a |

The only differences are the fish schools, which are time-dependent run to run (their region,
measured, is where the residual sits). The page view is pixel-identical, including the
lagoon masthead, nav bar and the Arabic motto. Intentional non-visual changes on the owner's
site: the tab title is now the content's `siteTitle` ("Abdallah Khalil, Qaa El-Hamour", in the
visitor's language), and the page gained `og:*`/`twitter:card` tags (absolute URL and image once
`SITE_URL` and `meta.ogImage` are set).

Perf (main, owner build): initial JS 91.8 KiB gzip / 105 (before: 94.4; the theme module adds a
tiny shared chunk), CSS 7.2 KiB (+0.2), models 1,272.3 / 1,800 KiB.

## Checks (main tree)

- `npx nx run-many -t lint,typecheck,test,build,validate --parallel=2`: green, 22 projects (lint
  warnings only, none new from this item's files beyond the pre-existing pattern).
- `npm run perf:budget`: OK. `npm run assets:verify`: OK. `npx vitest run --config
  tools/deploy/vitest.config.mts`: 17 passed.
- New specs: `apps/web/src/site-build.spec.ts` (theme CSS, escaping, preview-image rules,
  `SITE_URL`, public-path guard, both HTML entries, the Vite plugin's virtual module),
  `libs/content/data-access/src/lib/content-example.spec.ts`, config-driven landmark/dive/
  narrator/locale/app specs.

## Open / follow-ups

- Only CC-BY-4.0 models are modelled (`Attribution.license`, the credits copy says CC BY 4.0). A
  CC0 or other licence needs the type and the credits wording widened; docs say to license your
  own work CC-BY-4.0 for now.
- Adding a landmark with *new* narration still needs code: `NARRATION_LANDMARKS` is a closed set in
  `libs/content/domain`, and a new scene is a component (documented in landmarks/narrators READMEs).
- The e2e suite is the shipped site's (`apps/web-e2e/src/support/site.ts`); forks update it.
  Arabic e2e (`locale.spec.ts` in web-e2e) does not yet skip for a one-language site.
- `robots.txt` disallows `/moderation` at the root only (irrelevant under a project-site base,
  where the artefact drops moderation anyway).
- The README's "Status" section predates Stage B; the full fork-and-deploy README is the
  launch-checklist item.
- The theme module is shared by both entries, so Vite emits a near-empty shared JS chunk next to
  its CSS (one extra modulepreload, ~0 bytes of code).

## Revision 1 (agy review, REVISE 8/10: `code-review-agy.md`)

| Finding | Fix | Pinned by |
| --- | --- | --- |
| Serious 1: page background, text and font had no fallback before the theme stylesheet applies (dev injects it from JS) | `styles.css` `var(--theme-sea, #0a1e3f)`, `var(--theme-foam, #e6f2ff)`, `var(--font-ui, system-ui, sans-serif)`; `moderation.css` likewise. The built page already links the theme in `<head>`; rendering unchanged | `site-build.spec.ts` (fallbacks equal the shipped colours) |
| Serious 2: the sample-privacy test only checked the owner's English name | checks every language of the name (Arabic included) word by word, every link URL, and the identifying part of each link (email address, profile handle) | `content-example.spec.ts` |
| Moderate 3: `deploy:prepare` (and `perf:budget`) did not refuse a Git-Bash-mangled `SITE_BASE` | one rule, `tools/deploy/site-base.ts` (`siteBase`, `SiteBaseError`), used by `vite.config.mts` (through the existing `csp-vite-plugin.mjs` type boundary), `prepare-artefact.ts` and `perf-budget/check.ts`; the copy in `vite.config.mts` is gone | `tools/deploy/site-base.spec.ts` (deploy suite now 27 tests); `SITE_BASE=C:/x npm run perf:budget` fails with the hint |
| Moderate 4: landmarks/dive mismatches only failed in the browser | `landmarkConfigProblems()` (`site-build.ts`, no scene code needed) runs in the plugin's `buildStart`: waypoint not a stop, stop with no landmark, unknown spot, duplicate or non-slug id, in-world without scene, dialog without overlay, stops out of scroll order. `nx build web` fails listing each | `site-build.spec.ts` |
| Minor 5: `og:image` silently dropped without `SITE_URL` | build warning (Vite logger) when `meta.ogImage` is set and `SITE_URL` is not | `site-build.spec.ts` |
| Review notes (also cheap) | `meta.favicon`/`ogImage` refuse `public/...` and `apps/web/public/...` prefixes (would 404); `template:reset` refuses without `--force` when git cannot report `content/` changes (zip download, no git) | `site-build.spec.ts`; reset message checked by hand |

Not changed: CSS value *syntax* (`'bleu'`) is not validated; a browser drops it like any CSS typo
and the theme's other values still apply. Scene/overlay *keys* are checked at page start
(`buildLandmarkRegistry`) and in `landmarks.config.spec.ts`, not at build (they live in React
modules the config bundler cannot load).

Checks: `nx run-many -t lint,typecheck,test,build,validate` green (22 projects), `perf:budget` OK,
deploy specs 27/27.
