# deploy-static notes

## Decisions

- **Target**: GitHub Pages user site, pushed from `Hive-Academy/qa3elhamor` to `Abdallah-khalil/Abdallah-khalil.github.io` over an SSH deploy key (`PAGES_DEPLOY_KEY`), `peaceiris/actions-gh-pages` v4.1.0 pinned to commit `84c30a85c19949d7eee79c4ff27748b70285e453`, `external_repository` mode.
- **Branch is `master`, not `main`** (read-only `gh api`: default branch `master`, Pages source `master` `/`, legacy build). Target repo and branch come from variables `PAGES_REPOSITORY` / `PAGES_BRANCH`, with no defaults, so a fork can never publish to the owner's repo by accident.
- **Inert**: `workflow_dispatch` only, plus a `publish` boolean (default false = build-and-check dry run). Missing `PAGES_DEPLOY_KEY`/variables fail first, before `npm ci`, with `::error` messages pointing at docs/deploy.md. Push-to-main enabling is described in a comment at the top of the workflow.
- **Checks in the deploy job**: `assets:verify`, `nx sync:check`, `nx run-many -t lint typecheck test`, `deploy:check-contact`, `web:build --skip-nx-cache` (VITE_* values are not part of Nx's cache hash), `perf:budget`, `deploy:prepare`.
- **Contact guard** is single-sourced: `tools/deploy/check-contact-env.ts` imports `contactConfigProblems` from the app (tsx). Verified: unset -> ok; `web3forms` without key -> exit 1 with the message; formspree + id -> ok. It never prints a key.
- **Artefact** (`tools/deploy/prepare-artefact.ts`, idempotent): removes `moderation.html` + chunks only it reaches (computed from the chunk graph, not name-matched), removes `/admin` (Decap needs Netlify OAuth; unusable on Pages; override `PAGES_INCLUDE_ADMIN=true`), adds `404.html` copy and `.nojekyll`. Run on a temp copy: removed `moderation-*.js/css`, `moderation.html`, `admin`; shared chunks kept.
- **History kept** (`force_orphan: false`) so a deploy is revertable; `keep_files: false` so the 2019 files are removed. Backup branch `legacy-2019` is an owner step (commands in docs/deploy.md); I did not run anything against that repo.
- **Vite base**: `SITE_BASE` env, normalised, default `/`; `<base href>` in `index.html` now `%BASE_URL%` (it was hardcoded `/`, which would break project sites). Verified `/repo/` build output.
- **Caching**: Pages fixes `max-age=600`. JS/CSS are content-hashed. Models (`public/models/*.glb`) are not and cannot be hashed from config alone because the URLs are built in source (`assetUrl`). Chosen cheapest approach: accept up to 10 minutes of staleness (revalidated with ETag), document it, and recommend `assetUrl()` append `?v=<hash>` from the manifest (a `libs/world/domain` + build-time change; not done, off-limits). Pages serves `.glb` as `model/gltf-binary`.
- **netlify.toml**: kept, header rewritten as optional (Netlify-hosted forks, Decap OAuth gateway). `docs/cms.md` still describes Netlify setup and says `netlify.toml` supplies the build; it is out of my scope and now reads slightly Netlify-first.
- **Secrets used (names)**: `PAGES_DEPLOY_KEY`, `VITE_WEB3FORMS_ACCESS_KEY` (secret; public by design). **Variables**: `PAGES_REPOSITORY`, `PAGES_BRANCH`, `SITE_BASE`, `VITE_CONTACT_PROVIDER`, `VITE_FORMSPREE_FORM_ID`.

## Files

- CREATED `.github/workflows/deploy-pages.yml`, `.github/workflows/lighthouse.yml`
- CREATED `tools/deploy/check-contact-env.ts`, `tools/deploy/prepare-artefact.ts`
- CREATED `docs/deploy.md`
- MODIFIED `apps/web/vite.config.mts` (base, chunking), `apps/web/index.html` (`<base>`), `package.json` (scripts `deploy:check-contact`, `deploy:prepare`, `perf:budget`), `netlify.toml` (header), `.ptah/scope-decisions.md` (Deployment target amendment), `.github/workflows/ci.yml` (perf gate)

## Verification

- Workflow YAML parses (`yaml` package, all three files); `actionlint` is not available through npx, so the workflows were reviewed by hand (no `secrets` in `if:`; the secret check uses an env var).
- Not run: the workflow itself (would need secrets; also forbidden). Nothing was pushed, no secrets or variables were created, no repo was modified.

## Owner steps

See `docs/deploy.md`: back up to `legacy-2019`, create the deploy key, add public key (write access) to the Pages repo and the private key as `PAGES_DEPLOY_KEY`, set the variables, dry-run, then publish with explicit approval.

## Observations

- `.ptah/handoff.md` says the Pages repo is on `main`-style defaults; it is actually `master`.
- Public-repo prerequisite: `Hive-Academy/qa3elhamor` is private; Actions minutes and deploy-key secrets work on private repos, so no visibility change is needed to deploy.
