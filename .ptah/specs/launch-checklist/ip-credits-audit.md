# IP and credits audit (launch-checklist)

Read-only audit, 2026-10-02. No app code was changed. Method: grep for SpongeBob, Patrick, Bikini
Bottom, Nickelodeon, Squidward and the Krusty Krab / Pineapple / Tiki landmark names across
`content/*.json`, `content.example/*.json`, `apps/web/index.html`, `apps/web/src/**` and `docs/`;
read the credits code and its specs. Nothing was run in a browser.

## Verdict

- **Branding is clean.** No title, meta tag, heading, description or masthead names SpongeBob,
  Patrick, Bikini Bottom or Nickelodeon. The brand strings are "Qaa El-Hamour" / "قاع الهامور".
- **All four CC-BY credits and the music credit are reachable on every surface** by code and spec
  reading (credits dialog, page view, in-world plaque). No browser-level e2e test covers them (finding 6).
- **Main risks:** the bundled characters are on by default in the repo (finding 1), a stale doc says
  the opposite (finding 2), and Nickelodeon-universe place names are used as landmark labels
  (finding 3).

## Findings

Severity: High = would mislead a forker or breach a stated decision; Medium = IP exposure worth a
conscious decision; Low = tidy-up.

### 1. High - The repository ships the characters on; the brief and docs say "off by default"

`apps/web/src/site.config.ts:256` has `bundledByDefault: true`, with a mixed cast at lines 252-255
(SpongeBob at the Pineapple, Patrick at the Tiki). A fork that does not edit it, and does not set
`VITE_BUNDLED_CHARACTERS=false`, deploys Nickelodeon characters. `docs/template.md` section 3 and the
"What you must not ship" list say they are "Off unless `VITE_BUNDLED_CHARACTERS=true`" (template.md,
last section), which is no longer true.
Fix: either keep `true` for the owner and make the template reset (`tools/template/reset.ts`) also
flip `bundledByDefault` to `false`, or flip the default to `false` and give the owner's deploy
`VITE_BUNDLED_CHARACTERS=true` (the workflow already passes that variable,
`.github/workflows/deploy-pages.yml:55`). The second keeps the template safe by default and is
the smaller change. The README and NOTICE.md currently say "true in this repository; a fork should
set false", which is accurate today.

### 2. High - `docs/deploy.md:79` contradicts the config

The row says `VITE_BUNDLED_CHARACTERS` "unset keeps the original cast". With
`bundledByDefault: true` (finding 1) unset gives the bundled cast
(`apps/web/src/app/narrators.config.ts:49-57`: only `'true'` / `'false'` override).
For the owner's deploy this means the characters appear whether or not the variable is set.
Fix: reword the row after deciding finding 1.

### 3. Medium - Landmark names are Nickelodeon-universe names, in branding positions

`apps/web/src/site.config.ts:167` "The Pineapple" / بيت الأناناس, `:179` "Tiki Head",
`:191` "The Krusty Krab" / مطعم كراستي كراب. These are the landmark labels shown in the on-screen
list, the tour caption ("Now at The Pineapple") and accessible names. "Krusty Krab" is a
trademarked place name. Also the intro copy in `content/narration.json:6` ("Welcome to the
pineapple") and `:91`, `:98` ("The Krusty Krab ... Welcome to the Krusty Krab"). These are
in-character lines, not titles, so they are lower risk, but they stay when the characters are off
(the Hamour then says them).
Fix (optional, a content/config edit only): label the landmarks with the trend's vocabulary
(for example "Citizenship Office" for the Pineapple, "The Canteen" for the Krusty Krab), or accept it
as parody and say so in NOTICE.md (it now does, generally). Note `libs/landmarks`, e2e names
(`apps/web-e2e/src/support/site.ts`) and specs reference these labels, so renaming touches tests.

### 4. Medium - Narrator display names "SpongeBob" / "Patrick" appear in the UI when on

`apps/web/src/app/narrators/narrator-copy.ts:37-38` (`SpongeBob` / سبونج بوب, `Patrick` / باتريك)
render as the name tag on the speech bubble (visible in
`.ptah/specs/cinematic-tour/screens/stop-narration.jpg`). This is the character name used as an
in-character label, not as site branding; it only shows when the bundled cast is on. Covered by
finding 1.

### 5. Low - Narrators and ambient config are consistent with the IP stance

`apps/web/src/app/ambient.config.ts:17-20` keeps `characters: []` and documents why (no bundled
character is placed in the ambient scene). `apps/web/src/dev/ocean-text-preview.tsx:147` has
`text="SpongeBob"` in a dev-only preview page; check it is not part of the Pages build (the build
inputs are `index.html` and `moderation.html`, `apps/web/vite.config.mts:61-62`, so it is not).
No change needed. A stray "Squidward" remains only in
`apps/api/integration/complaints-api.integration.ts` (test data) and `docs/asset-inventory.md`
(model node names): harmless.

### 6. Low - Credits are tested in jsdom only, not in a real browser

Evidence that all credits render:

| Surface | Code | Proof read |
| --- | --- | --- |
| "Credits" button and dialog on the dive (DOM, needs no WebGL) | `apps/web/src/app/credits.tsx` (`SiteCredits`), mounted at `apps/web/src/app/dive-shell.tsx:245` | `credits.spec.tsx` "shows every required credit string, verbatim" asserts every `SOURCE_MODELS` entry's `creditLine(ATTRIBUTIONS[id])` is listed |
| Music credit in that dialog | `credits.tsx` `MusicCredit`, via `musicCredit(AUDIO, credits)` | `credits.spec.tsx` "credits the ambient music under the models" |
| Page view (no WebGL / `?view=page`) | `apps/web/src/app/page-view/page-view.tsx` credits section (`modelCredits`, site credits from `content/credits.json`, which includes the CC0 music entry) | `page-view.spec.tsx` "credits the site and every CC-BY model" (counts shippedCredits() and credits.json items) |
| In-world notice board at the end of the dive | `apps/web/src/app/scene-credits.tsx`, mounted at `dive-shell.tsx:234` | `libs/world/ui/src/lib/credits-plaque.spec.ts` (layout only); it lists the four model credits, not the music |
| Credits derived from the manifest, all four models | `libs/world/domain/src/lib/credits.ts` (`shippedCredits`), `attribution.ts` | `credits.spec.ts` "covers all four bundled models today", "refuses to render when a shipped asset has no attribution record" |

Observations: (a) the four credits are listed from the manifest, so they render even when the
bundled characters are off (the models still ship, lazily). That is the safe direction. (b) The
plaque does not show the music credit; the dialog and page view do. CC0 needs no credit, so this is
acceptable. (c) The jsdom specs do not prove the plaque draws legibly in WebGL, and there is no
Playwright spec for credits (`apps/web-e2e/src` has none). Suggested: add a smoke assertion that the
"Credits" button opens a dialog containing the four titles in the e2e suite; also look at the
plaque once in a screenshot.

### 7. Low - Licence data needs one human check before going public

- `attribution.ts:55` credits the pineapple model's author as "Sajin Mickey Firey fan 1342 from
  Cheryl hill" with profile `cherylhill28`; this is transcribed from the model's `license.txt` and
  is the required credit string, but confirm the Sketchfab page still shows that author.
- `assets/audio-src/SOURCES.md` records that the music was chosen without listening to it
  ("a human listen is needed before shipping") and that OpenGameArt licences are self-declared by
  the uploader. Confirm the owner has listened and that `apps/web/public/audio/aquarium-bed.*` is
  the encoded Underwater Theme II (the repo does not record the encoding step).
- `docs/template.md` says a test fails if `content.example/` picks up the owner's name; the sample
  `credits.json` still lists the Qaa El-Hamour trend and three.js, which is fine.

### 8. Low - Deploy path for a project site is documented but not exercised

README and `docs/deploy.md` describe the project-site route as a manual local build and push. The
included workflow publishes to a Pages repository with a deploy key; pointing `PAGES_REPOSITORY` at
the fork itself with `PAGES_BRANCH=gh-pages` looks supported by the workflow inputs, but nobody has
run it, so the README does not claim it. To meet the success criterion ("a fresh fork deploys by
following the README alone") for the project-site path, run a dry run on a throwaway fork and, if it
works, add that as the documented project-site route.

## What the README now commits to (so these can be checked)

- Fork-and-deploy order: fork and `npm ci`, `npm run template:reset`, validate content, rebrand via
  `site.config.ts` and set `bundledByDefault: false`, optional contact provider, deploy as user site
  (deploy key, `PAGES_*` variables, dry run then publish) or project site (`SITE_BASE`, local build,
  `deploy:prepare`, push `apps/web/dist`).
- Every command in the README exists in `package.json` scripts, the Nx targets
  (`serve`, `dev`, `build`, `validate`, `web-e2e:e2e`) or the workflow files; every linked path
  exists. Not run: `npx nx serve web` was not started, and `npx nx validate content-data-access`
  was not executed in this pass.
