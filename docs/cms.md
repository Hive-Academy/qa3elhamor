# Editing content with the CMS

The site's words live in `content/*.json` (see `content/README.md`). [Decap CMS](https://decapcms.org)
gives them an editing UI at **`/admin/`**. Saving in the UI commits the JSON file to this repository;
the commit triggers a Netlify build; the site redeploys. The site itself contains no auth code:
GitHub (through Netlify's OAuth provider) decides who may edit.

| Piece           | Where                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------- |
| Admin page      | `apps/web/public/admin/index.html` (Decap loaded from a pinned CDN URL with an SRI hash) |
| CMS schema      | `apps/web/public/admin/config.yml`                                                       |
| Uploaded images | `apps/web/public/media/` (served as `/media/...`)                                        |
| Parity test     | `libs/content/data-access/src/lib/cms-config.spec.ts`                                    |

## Schema and the content model

`config.yml` has one `files` collection ("Site content") with one entry per content file
(`site`, `resume`, `services`, `projects`, `credits`). Text that can be translated is an
`English` / `Arabic (RTL)` pair and is written as `{ "en": ..., "ar": ... }`. Decap has no
right-to-left option for its text fields, so the Arabic field is labelled instead.

The content model in `libs/content/domain` is the source of truth. The spec
`cms-config.spec.ts` (run by `npx nx test content-data-access`) builds sample content from the
CMS widgets and feeds it to `parseContent`:

- every widget filled in must validate;
- only the required widgets must validate;
- dropping any single field must fail **exactly** when its widget is required;
- select options must equal the domain enums, all nine `copy` keys must exist, and each file path
  must match the one the site imports.

So adding a field to the model without the CMS (or the reverse) fails CI. When you change the
model, update `config.yml` in the same commit.

Things to know about what the CMS writes:

- Plain-string shorthand (`"bio": ["Some text"]`) is valid in the files, but the CMS edits text as
  `{ en, ar }`: a shorthand entry shows an empty English field and Decap refuses to save until it is
  filled. Write text as `{ "en": ... }` objects in the content files so they open cleanly.
- Decap validates the children of an optional object even when the editor left it empty. So widgets
  under an optional object (`avatar`, `media`, optional text such as `location`) are `required: false`
  in `config.yml` with `parser_required: true` where the model needs them once the object exists; a
  half-filled object fails the build validation with a path, not the CMS form.
- The CMS saves files as pretty-printed JSON, which may reformat a file the first time it is saved.
- Keys starting with `_` (editor notes such as `_sample`) are not part of the schema; delete them
  by hand once you have replaced the sample content.
- Ids must be lowercase slugs and months `YYYY-MM`; the CMS enforces both before saving.

## Local editing

No account or OAuth is needed locally. `local_backend: true` in `config.yml` makes the admin UI talk
to a local proxy that writes straight to the working tree (no commit is made; review with git).

```bash
npm run cms:local          # runs: npx decap-server   (port 8081)
npx nx serve web           # in a second terminal (port 4200)
```

Open <http://localhost:4200/admin/index.html> (the Vite dev server does not map `/admin/` to the folder index; Netlify does), click Login, and edit. Saving
rewrites `content/*.json`; run `npx nx validate content-data-access` to check the result. Nothing
is added to `package.json` for `decap-server`; `npx` fetches it on demand. Only run it on a
machine you trust: it has no authentication and can write to the repository.

## Netlify setup (one-time, owner)

1. **Create the Netlify site** from the GitHub repo `Hive-Academy/qa3elhamor`, branch `main`.
   Build settings come from `netlify.toml`: command `npx nx build web`, publish `apps/web/dist`.
   The build runs `content-data-access:validate` first, so a bad CMS edit fails the build and the
   last good deploy stays live.
2. **Register a GitHub OAuth App** (GitHub → Settings → Developer settings → OAuth Apps → New):
   - Homepage URL: your Netlify site URL
   - Authorization callback URL: `https://api.netlify.com/auth/done`
   - Copy the Client ID and generate a Client Secret.
3. **Install it in Netlify**: Site configuration → Access & security → OAuth → Authentication
   providers → Install provider → GitHub; paste the Client ID and Client Secret.
4. **Custom domain**: add it as a domain on the same Netlify site (Decap finds the site by hostname
   when using Netlify's OAuth gateway).
5. **Give editors access**: editors need write access to the repository (collaborator on
   `Hive-Academy/qa3elhamor` or org team). Anyone who can push to `main` can edit content through
   the CMS; anyone who cannot, cannot.
6. Visit `https://<site>/admin/`, log in with GitHub, edit the bio, publish. A commit
   ("Update Site content") appears on `main` and Netlify redeploys.

The deployed `config.yml` also contains `local_backend: true`; it is ignored unless the page is
opened on `localhost`.

### Editorial workflow (recommended for production)

The file ships with the default simple workflow: Publish commits straight to `main`, and the
Netlify build then validates the content. A bad edit cannot go live (the build fails and the last
deploy stays up) but it does land on `main`. For production, put a check **before** the merge:

1. In `apps/web/public/admin/config.yml`, uncomment the top-level line
   `publish_mode: editorial_workflow`.
2. Decap then saves each edit as a branch and pull request (Draft, In review, Ready columns in the
   CMS). Publish merges the PR into `main`.
3. In Netlify, keep "Deploy previews" enabled for pull requests. The preview runs
   `npx nx build web`, which runs `content-data-access:validate` first, so an invalid edit shows up
   as a failed preview check on the PR and can be fixed before it is merged. Protect `main` with the
   Netlify check as a required status if you want the merge blocked.

Decap has no setting to enable this for the remote backend only: `publish_mode` is global. It is
left off in the file because `decap-server` (local editing) does not support the editorial
workflow. Comment it out again for local editing.

### Editor rules the form cannot enforce

Decap checks required fields and the field patterns, but some rules span fields. A violation is not
caught by the form; it fails `npx nx validate content-data-access` (and so the Netlify build or
the deploy preview) with a message naming the file and path:

- **Link kind and URL must agree.** A contact link of kind `email` must use a `mailto:` URL; the
  other kinds need an `https:` URL. The field pattern accepts either for any kind.
- **Ids must be unique** within a file (skill groups, resume entries, services, projects,
  credits). Decap does not check uniqueness across list items.
- **A period must not end before it starts** (`period.end` earlier than `period.start`).
- **Half-filled optional objects.** If you fill only part of an optional group (Arabic without
  English, an avatar image without alt text, a project period with an end month but no start), the
  form saves it, but validation rejects it. Fill the group completely or clear it.
- **URL and month patterns are shape checks.** The form accepts any `https://host/...` address and
  any `YYYY-MM` month from 01 to 12; it cannot tell you the address works.

### Content Security Policy

security-hardening owns the CSP. The admin page loads Decap from `https://unpkg.com`, so the
policy applied to `/admin/*` must allow:

- `script-src https://unpkg.com` (the pinned script is also SRI-checked), plus `'unsafe-inline'`
  or a hash/nonce for the inline styles and scripts Decap injects;
- `style-src 'unsafe-inline'`; `img-src data: blob: https:`; `font-src https: data:`;
- `connect-src https://api.github.com https://api.netlify.com https://www.githubusercontent.com`
  (and `http://localhost:8081` only for local editing);
- `frame-src https://api.netlify.com` / popup allowed for the GitHub login window.

Scope this to the `/admin/*` path in `netlify.toml` headers so the public site keeps the strict
policy. If unpkg is not acceptable, self-host the file under `apps/web/public/admin/` (same pinned
version, same SRI) and drop the unpkg allowance.

### Upgrading Decap

The version is pinned in `apps/web/public/admin/index.html`. To upgrade, pick a version, then:

```bash
curl -sL https://unpkg.com/decap-cms@<version>/dist/decap-cms.js \
  | openssl dgst -sha384 -binary | openssl base64 -A
```

and put `sha384-<output>` in `integrity` together with the new version in `src`.

## Forking

Only `backend.repo` (and `branch` if not `main`) in `apps/web/public/admin/config.yml` changes,
then repeat the Netlify setup above for your repo. Every other path is relative to the
repository root.
