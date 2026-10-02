# Make it yours in 30 minutes

This repository is a template: the dive, the landmarks and the narrators are the product, and
the site's owner is only its first user. Rebranding it is editing **content**, **config** and
**assets**. You never edit a component.

| You change            | Where                                                   | Who reads it                          |
| --------------------- | ------------------------------------------------------- | ------------------------------------- |
| Words about you       | `content/*.json` (or the CMS, [cms.md](cms.md))         | the site, validated at build          |
| Brand, theme, languages, landmarks, dive, cast | `apps/web/src/site.config.ts`  | the site and the build (`<head>`, CSS) |
| 3D models and credits | `assets/`, `libs/world/domain` (asset manifest)         | the asset pipeline, the credits       |
| Keys and deploy target | environment variables (`.env.example`)                 | the build                             |

Everything below was done end to end on a throwaway fork before it was written down
(`.ptah/specs/template-config/notes.md`); the commands are the ones that ran.

## 0. Start from sample content (2 minutes)

The `content/` folder ships the original owner's real profile. **Do not deploy it as yours.**
Replace it with the neutral sample first:

```bash
npm run template:reset   # copies content.example/*.json over content/ (refuses over uncommitted edits)
```

`content.example/` is a complete fictional resident, "Sam Reef", and is checked by the test suite
against the content model, so it always builds. Every file carries a `"_sample"` note: delete it
once the file is yours.

Also not yours, and to replace or delete: `apps/web/public/media/` (CMS uploads),
`apps/web/public/favicon.ico`, and the owner's URLs in `docs/deploy.md` and the two workflow
descriptions (`.github/workflows/e2e.yml`, `lighthouse.yml`).

## 1. Content (10 minutes)

Edit `content/*.json`; the rules are in [`content/README.md`](../content/README.md). In short:
`site.json` is you (name, headline, bio, skills, links) and the interface copy, `resume.json`
your jobs, `services.json` the menu, `projects.json` your work, `narration.json` what the
narrators say at each landmark, `credits.json` your own credits.

```bash
npx nx validate content-data-access   # names the file, field and problem if anything is wrong
```

The page `<title>` and description are `copy.siteTitle` and `copy.siteDescription` in
`site.json`; the build writes them into the page (and its social preview). The interface copy
that names you (`complaintIntro`, `complaintPrivateLabel`, `complaintFiledLine`, ...) is there
too, and the sample says "Sam" in it.

Renaming the place (section 2)? The sample copy still says Qaa El-Hamour in a few lines (the
Citizenship Card's title and issuer, a credit, the Arabic motto `citizenStatusMotto`):
`grep -rn "Qaa El-Hamour\|قاع الهامور\|بقينا" content/`. A motto in your own language is fine;
it reads in its own direction.

## 2. Brand and theme (5 minutes)

`apps/web/src/site.config.ts` → `SITE`:

- `brand.place`: the place the dive is set in, in running text ("You are reading {place} as a
  page"). `brand.mark`: the masthead sign over the dive and the page, in one fixed language.
  `brand.contactFromName`: who contact-form emails come from.
- `meta.siteName`, `meta.favicon` (a file in `apps/web/public`), `meta.ogImage` (optional,
  about 1200x630, written only when `SITE_URL` is set: crawlers need an absolute URL).
- `theme`: thirteen colours and two font stacks. The build turns them into CSS custom properties
  (`--theme-sea`, `--theme-paper`, ..., `--font-ui`) that every surface uses; `sea` is also the
  browser's theme colour. A value that is not one CSS value fails the build.
- `ocean`: the 3D water: fog colour and density, caustics, particles, lights. Only what you set
  changes (defaults: `OCEAN_ENVIRONMENT_DEFAULTS` in `libs/world/feature`). Match `ocean.fog.color`
  to `theme.sea` so the page and the water meet without a seam.
- `locales`: `['en', 'ar']` (the default first) or `['en']`. One language: no switch, `?lang=`
  is ignored, content needs no Arabic, and the Arabic checks are skipped.

Fonts: the Arabic face is self-hosted under `apps/web/public/fonts/` and declared in
`apps/web/src/styles.css`; add your own `@font-face` there and name it in `theme.fontUi`.

## 3. Narrators: original or bundled cast (2 minutes)

`NARRATOR_CAST` in `site.config.ts`. `cast` picks, per landmark, one of the original
characters built in code (`hamour`, `sardine-president`, `crab-clerk`): IP-clean, always
available, and the fallback on low-end devices. `bundled` names the shipped SpongeBob and
Patrick models; they replace the cast **only** when the build sets `VITE_BUNDLED_CHARACTERS=true`.

They are Nickelodeon characters. The model licences (CC-BY-4.0) cover the meshes, not the
characters, so the template keeps them off. Turn them on for your own deployment only if you
accept that risk. In development, `?narrators=bundled` / `?narrators=original` previews either.

## 4. Landmarks: move, rename, remove, add (5 minutes)

All in `site.config.ts`:

- **Rename**: `label` and `caption` in `LANDMARKS`.
- **Move the camera**: the `stop` entries in `DIVE_CONFIG.route` (`viewOffset`, `focusHeight`,
  `scroll`), and the open-water `pass` points between them. Positions are world units
  (scene-world x 20). `dive.config.spec.ts` checks the dive is valid and paced.
- **Move a landmark**: its `position` (scene-world units). A landmark cut from the map can only
  sit where it was cut (`placements.json`; the spec enforces it), because the town has a hole
  there. A whole model of yours can stand anywhere: see 5.
- **Remove one**: delete its entry in `LANDMARKS` and its `stop` in `DIVE_CONFIG.route`. Its
  scene is not built and nothing else changes. Its narration stays in `narration.json`, unused.
- **Checked at build**: a landmark whose stop is missing, a stop no landmark uses, a duplicate or
  non-slug id, an in-world landmark without a scene, or stops out of scroll order fail
  `nx build web` with one line per problem.
- **Add one with new content**: that is code, a scene or overlay component; follow
  [`libs/landmarks/README.md`](../libs/landmarks/README.md), "Add your own landmark". A landmark
  reusing an existing scene or overlay key is config only.

## 5. Replace a landmark's model (10 minutes)

Worked example, as run on the fork: the Krusty Krab's building becomes a lighthouse.

1. **The file and its licence.** Put the model under `assets/<folder>/` as `scene.gltf` or
   `scene.glb`, with its licence text beside it (`license.txt`). Author it in scene-world units
   (the town's buildings are 0.1 to 0.3 units across) with its origin at its base; or fix the
   size later with `scale`.
2. **The manifest** (`libs/world/domain/src/lib/asset-manifest.ts`):
   - add the source's id to `SourceModelId` and an entry to `SOURCE_MODELS` (`path`, and `bytes`,
     the folder's real total);
   - add a `WEB_ASSETS` entry: `id`, `sourceModel`, `compressedPath: 'models/<id>.glb'`,
     `budgetBytes` (below the source's `bytes`), `minimumTier: 'low'`, `lazy: false`.
3. **The credit** (`libs/world/domain/src/lib/attribution.ts`): an `ATTRIBUTIONS` entry for the
   new source, exactly as its licence asks (title, author, URLs). This is a legal obligation of
   CC-BY, not a nicety: the type does not compile without it, a test fails without it, and the
   site renders it in the credits dialog and on the in-world plaque. Only CC-BY-4.0 models are
   modelled today; for your own work, license it CC-BY-4.0 and credit yourself.
4. **Compress**: `npm run assets:compress`. Any manifest entry that is not cut from the map is a
   whole model and needs no recipe (knobs, if you need them, are `OPTIONS` in
   `tools/asset-pipeline/compress.ts`). It writes `apps/web/public/models/<id>.glb`,
   `placements.json` and the size table in `docs/asset-compression-report.md`, and fails on an
   output over budget. Commit all three.
5. **Point the landmark at it** (`site.config.ts`): `model: '<id>'`, a `position` (to stand on the
   seabed where a cut building stood, use its spot's x and z and the ground height under it),
   and `scale` / `rotation` if needed. Keep the replaced building's own `WEB_ASSETS` entry and
   recipe: that is what keeps it cut out of the town. Set its `lazy: true`, since nothing loads it
   any more and it should not count against the first-load budget.

Then `npm run assets:verify`, `npx nx test web`, `npm run perf:budget` after a build.

To swap in a different building of the bundled town instead, it has to be cut out of the map:
that is a recipe in `tools/asset-pipeline/landmarks.ts` with audited node ids
(`docs/asset-inventory.md`), more work than a model of your own.

## 6. Providers (5 minutes)

Environment variables, set in `.env` locally and as repository variables or secrets for the
deploy workflow. `.env.example` lists them all.

| Feature           | Variables                                                                   | Docs                          |
| ----------------- | --------------------------------------------------------------------------- | ----------------------------- |
| Contact form      | `VITE_CONTACT_PROVIDER`, `VITE_WEB3FORMS_ACCESS_KEY` / `VITE_FORMSPREE_FORM_ID` | [contact.md](contact.md)  |
| Analytics         | `VITE_ANALYTICS_PROVIDER`, `VITE_ANALYTICS_DOMAIN` / `VITE_ANALYTICS_WEBSITE_ID` | [analytics.md](analytics.md) |
| Complaints wall   | `VITE_WALL_API_URL` (needs the API hosted somewhere)                         | [security.md](security.md)    |
| Bundled narrators | `VITE_BUNDLED_CHARACTERS`                                                    | section 3 above               |
| CMS               | `backend.repo` in `apps/web/public/admin/config.yml` (your `owner/repo`)     | [cms.md](cms.md)              |

Unset, each is off and the site still builds: the form says it is not wired yet, nothing is
tracked, the wall is absent. The Content Security Policy follows these values on its own.

## 7. Deploy to your own GitHub Pages

[deploy.md](deploy.md) has the workflow. For a fork:

- **Project site** (`https://<you>.github.io/<repo>/`): repository variable `SITE_BASE=/<repo>/`.
- **User site** (`https://<you>.github.io/`): `SITE_BASE` unset, and the Pages repository and
  deploy key as in deploy.md.
- `SITE_URL` (optional): the address above, for social previews.

Locally, the same build the workflow runs:

```bash
SITE_BASE=<repo> SITE_URL=https://<you>.github.io/<repo>/ npx nx run web:build --skip-nx-cache
SITE_BASE=<repo> npm run perf:budget
SITE_BASE=<repo> npm run deploy:prepare
```

- `--skip-nx-cache` matters: the build inlines `VITE_*` and `SITE_*` values, which Nx does not
  hash.
- `SITE_BASE=<repo>` without slashes is the same as `/<repo>/` and survives Git Bash on Windows,
  which rewrites a leading-slash value into a file path (the build refuses one with a hint).
- `perf:budget` and `deploy:prepare` need the same `SITE_BASE` as the build (the workflow sets it
  for every step).

## What you must not ship

- **The original owner's content.** `npm run template:reset`, then make it yours. A test fails if
  `content.example/` ever picks up the owner's name or links.
- **Missing model credits.** Every model under `assets/` keeps its CC-BY-4.0 credit, whether or
  not you ship a derivative of it, and anything you add brings its own.
- **The bundled characters, unknowingly.** Off unless `VITE_BUNDLED_CHARACTERS=true`.
- **Secrets.** Only `VITE_*` values reach the bundle, and the contact keys are public by design.
  `MODERATION_TOKEN`, `IP_HASH_SALT` and `DATABASE_URL` are for the wall's API, never the site.

## Checks

```bash
npx nx run-many -t lint,typecheck,test,build,validate
npm run assets:verify
npm run perf:budget        # after a build
```

The end-to-end suite (`apps/web-e2e`) is written against the shipped site's names and words
(`apps/web-e2e/src/support/site.ts`); update those to your landmarks and copy, or run only the
smoke spec, after rebranding.
