# Deploying to GitHub Pages

The site is static. `.github/workflows/deploy-pages.yml` builds `apps/web` and pushes the output
to a GitHub Pages repository. The owner's target is the user site
<https://abdallah-khalil.github.io/> (repository `Abdallah-khalil/Abdallah-khalil.github.io`,
publishing branch `master`). The code stays in `Hive-Academy/qa3elhamor`.

The workflow is **manual only** (`workflow_dispatch`) and publishes nothing unless you tick
`publish`. Unticked, it is a full build-and-check dry run.

## What a deploy does

1. Fails immediately (when publishing) if `PAGES_DEPLOY_KEY`, `PAGES_REPOSITORY` or `PAGES_BRANCH` is missing.
2. `npm ci`, `assets:verify`, `nx sync:check`, `nx run-many -t lint typecheck test`.
3. `npm run deploy:check-contact` fails the run if `VITE_CONTACT_PROVIDER` is set but misconfigured
   (it calls the app's own `contactConfigProblems()`, so the rule has one source).
4. `nx run web:build --skip-nx-cache` with `base` taken from `SITE_BASE` (default `/`).
5. `npm run perf:budget` (see [perf-budget.md](perf-budget.md)).
6. `npm run deploy:prepare` shapes the artefact (below). It edits `apps/web/dist` in place (removes `moderation.html`, `/admin`), so rebuild before a local `vite preview`.
7. With `publish` ticked, pushes `apps/web/dist` to the Pages repository over SSH
   (`peaceiris/actions-gh-pages`, pinned to the v4.1.0 commit). History is kept, so every deploy
   is a commit you can revert.

### The artefact

| Decision | Why |
| --- | --- |
| `moderation.html` and the chunks only it uses are **removed** | The moderation console talks to the complaints API, which a static host does not have, and it is not a public page. Leaving it would publish dead UI and the API shape. |
| `/admin` (Decap CMS) is **removed** (override: `PAGES_INCLUDE_ADMIN=true`) | The CMS logs in through a Netlify OAuth gateway (see [cms.md](cms.md)); on Pages it cannot authenticate, and exposing the editor's config helps no one. Edit `content/*.json` in the repo, or run `npm run cms:local`. |
| `index.html` is copied to `404.html` | Pages serves `404.html` for unknown paths, so a deep link still loads the app. |
| `.nojekyll` is added | Stops Pages running Jekyll over the files. |
| The complaints wall is off | `VITE_WALL_API_URL` is not set by the workflow. |

## Owner steps (one time)

Nothing here has been run for you. Replace nothing in the commands; the names are the real ones.

### 1. Back up the current 2019 site

The Pages repo currently holds a 2019 "coming soon" page on `master`. Keep it on a branch so it
can be restored. Run on your machine:

```bash
git clone git@github.com:Abdallah-khalil/Abdallah-khalil.github.io.git
cd Abdallah-khalil.github.io
git branch legacy-2019 master
git push origin legacy-2019
cd .. && rm -rf Abdallah-khalil.github.io
```

The first deploy replaces the files on `master`; `legacy-2019` keeps the old ones.

### 2. Create an SSH deploy key

```bash
ssh-keygen -t ed25519 -N "" -C "qa3elhamor-pages-deploy" -f pages_deploy_key
```

- Public half (`pages_deploy_key.pub`): in `Abdallah-khalil/Abdallah-khalil.github.io` go to
  Settings, Deploy keys, Add deploy key. Paste it and **tick "Allow write access"**.
- Private half (`pages_deploy_key`): in `Hive-Academy/qa3elhamor` go to Settings, Secrets and
  variables, Actions, New repository secret. Name it `PAGES_DEPLOY_KEY` and paste the whole file.
- Then delete both local files: `rm pages_deploy_key pages_deploy_key.pub`.

### 3. Set the repository variables and secrets

In `Hive-Academy/qa3elhamor`, Settings, Secrets and variables, Actions:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `PAGES_REPOSITORY` | `Abdallah-khalil/Abdallah-khalil.github.io` |
| Variable | `PAGES_BRANCH` | `master` (the Pages repo's publishing branch) |
| Variable | `SITE_BASE` | leave unset for a user site |
| Variable | `SITE_URL` | `https://abdallah-khalil.github.io/` (optional: social previews get absolute `og:url`/`og:image`) |
| Variable | `VITE_CONTACT_PROVIDER` | `web3forms` or `formspree` (or leave unset: the form shows "not wired") |
| Secret | `VITE_WEB3FORMS_ACCESS_KEY` | Web3Forms access key (when the provider is `web3forms`) |
| Variable | `VITE_FORMSPREE_FORM_ID` | Formspree form id (when the provider is `formspree`) |
| Variable | `VITE_BUNDLED_CHARACTERS` | `true` for the SpongeBob/Patrick narrators (the owner's deploy); unset keeps the original cast |

Provider details: [contact.md](contact.md). The key and form id are public in the shipped
bundle by design; the secret slot only keeps the key out of the repository.

In the Pages repository, Settings, Pages must be "Deploy from a branch", branch `master`, folder
`/ (root)`. It already is (checked read-only).

### 4. Dry run, then publish

1. Actions, "Deploy to GitHub Pages", Run workflow, leave `publish` **unticked**. Confirm it is green.
2. Run it again with `publish` **ticked** (only once you are happy to replace the 2019 page).
3. Open <https://abdallah-khalil.github.io/>. Pages can take a minute to update.

### Rolling back

- Revert the deploy commit on the Pages repo's `master` (it is a normal commit), or
- `git push --force origin legacy-2019:master` from a clone of the Pages repo to restore the 2019 page.

### Deploying on every push later

Not enabled. The comment at the top of the workflow shows the change. Do it in a reviewed commit,
and only after you are happy with manual deploys.

## Caching behaviour

GitHub Pages cannot set response headers: every file gets `Cache-Control: max-age=600` (10
minutes) with `ETag`/`Last-Modified`, so browsers revalidate and get a cheap `304`.

- **JavaScript and CSS** are content-hashed by Vite (`assets/main-<hash>.js`). A new deploy changes
  the file names, so there is no stale-asset problem, and the vendor chunks (three, R3F, drei) keep
  their names until their code changes.
- **`.glb` models** live in `public/models/` and are not hashed. After a deploy, a returning visitor
  can see a model up to 10 minutes stale (a mismatch with new code is the only risk, and the models
  change rarely). Pages serves `.glb` as `model/gltf-binary`. The cheapest robust fix is for
  `assetUrl()` (`libs/world/domain`) to append `?v=<content hash from the manifest>`; that is a source
  change, recorded in `.ptah/specs/deploy-static/notes.md` as a recommendation.

## Forkers

Fork the repository, then pick one.

**Project site** (`https://<you>.github.io/<repo>/`): no second repository is needed.

1. Set the repository variable `SITE_BASE` to `/<repo>/` (and, optionally, `SITE_URL` to
   `https://<you>.github.io/<repo>/`). Rebranding first: [template.md](template.md).
2. Use the standard Pages flow (Settings, Pages, Source: GitHub Actions) with your own workflow, or
   build locally and push `apps/web/dist` to a `gh-pages` branch:

   ```bash
   SITE_BASE=/<repo>/ npx nx run web:build
   SITE_BASE=/<repo>/ npm run deploy:prepare
   ```

**Your own user site** (`https://<you>.github.io/`): follow the owner steps above with your own
Pages repository (`<you>/<you>.github.io`), your own deploy key, and `PAGES_REPOSITORY`/`PAGES_BRANCH`
set to match. `SITE_BASE` stays unset.

Custom domains work with `SITE_BASE` unset; add a `CNAME` file under `apps/web/public/` and it is
copied into the artefact.

Run `npm run deploy:check-contact` locally with your `VITE_*` values exported to check the form config.
