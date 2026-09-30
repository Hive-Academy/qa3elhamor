# Code Logic Review — `cms-integration`, round 2 (GLM)

## Summary

| Metric           | Value    |
| ---------------- | -------- |
| Overall score    | 7/10     |
| Assessment      | APPROVED |
| Blocking issues  | 0        |
| New defects      | 2 moderate, 2 minor |
| Tests            | 163/163 pass (forced uncached run; r1 had 161), `validate` passes |

Scope of this round: the correction diff — two-way pattern and list checks in `libs/content/data-access/src/lib/cms-config.spec.ts`, the URL/contact-link patterns in `apps/web/public/admin/config.yml`, the commented-out `publish_mode`, the new `docs/cms.md` sections, the `site.json` shorthand normalization, and the `yaml` root devDependency. Read-only; the PNGs in the task folder were not opened.

Verification performed:

- `npx nx run-many -t test,validate -p content-data-access --skip-nx-cache` — **163/163 pass, validate passes**. (The first re-run replayed both tasks from cache — see N-2.)
- Every bad value in the new two-way test checked by hand against the parser: `ftp://`, bare domain (`URL.canParse` false), `javascript:` (protocol not in `WEB_URL`), `https://` (canParse false), `mailto:` (empty path fails `EMAIL_ADDRESS`, reader.ts:231,255) all fail both the new CMS regexes and `parseContent`. The contact-link branch exclusion (spec:279-281) correctly does *not* demand the contact URL reject a valid mailto, while the `extra: ['mailto:a@example.com']` case still forces every non-mailto URL field to reject it.
- The new mailto regex `mailto:[^@\s]+@[^@\s]+\.[^@\s]+` (config.yml:94) is structurally identical to the parser's `EMAIL_ADDRESS` (reader.ts:231) for the multi-`@` and query-string cases I traced; `mailto:junk` is now blocked at the form.
- Regression check requested by the charter: **the new URL pattern does not over-reject values the parser accepts elsewhere.** Site-relative `/media/...` and `mailto:` are only accepted by the parser on `ASSET_URL`/`LINK_URL` fields (reader.ts:226-227); those are the image widgets (config.yml:61,226 — pattern-free) and the contact URL (config.yml:94 — carries its own mailto branch). The three `^https?://[^\s/]+\S*$` fields (companyUrl config.yml:125, project links url :220, credits url :256) all sit on `WEB_URL` fields, which never accepted either form. Existing content URLs round-trip the new pattern (all have hosts, verified in the r1 scan).
- Docs accuracy: `publish_mode` is global in Decap (cannot be scoped per backend) and `decap-server` does not support editorial workflow — both claims (docs/cms.md:102-104, config.yml:13-14) are correct, and the workflow mechanics in docs:87-100 match the verified build wiring (preview runs `nx build web` → `validate` first).
- `yaml` confirmed as a root devDependency (`^2.9.0`).

## Status of round-1 findings

| r1 finding | Status | Evidence |
| ---------- | ------ | -------- |
| S-1: CMS can save content the parser rejects (kind/email pairing, malformed mailto, duplicate ids, `end < start`, half-filled optional objects, whitespace-only strings) | **ADDRESSED** — form-side: malformed mailto, non-https schemes, `javascript:`, host-less URLs now blocked by patterns (config.yml:94,125,220,256); residual cross-field holes are inherent to Decap and are now explicitly documented for editors at docs/cms.md:106-121 ("Editor rules the form cannot enforce"), which was r1's recommended fix. Docs:112-113 honestly states the pattern accepts either form for any kind. |
| M-1: pattern checks one-directional (cms-config.spec.ts:93-94 accepted valid samples only) | **FIXED** — spec:256-294 asserts every patterned widget's bad values fail BOTH the CMS regex and `parseContent`; `expect(values).toBeDefined()` (spec:278) forces any future patterned field into the bad-value table; `checked >= 6` guards against the table silently not running (13 fields actually checked). |
| M-2: `fieldPaths`/enum visitor skip `list.field` interiors | **FIXED IN EFFECT** — spec:296-322 asserts every single-field inner widget is a `required` string (spec:313-314), rejects `['']` and accepts real items, and enforces `min` lists rejecting `[]`. A select or optional inner field in a single-field list now fails the suite, transitively closing the enum-visitor gap (spec:357 still skips `f.field`, but nothing but a required string can get through). The exhaustive drop test still does not descend into `list.field`, but for scalar strings the new assertions are equivalent coverage. |
| M-3: no committed golden fixture pinning Decap's real serialization | **OPEN** (minor) — the only real-Decap-output evidence is still the untracked `.ptah/specs/cms-integration/site.json.after-cms-edit.txt`. |
| Minor: stale `yaml` comment (spec:23) | **OPEN** (trivial) — still says "transitive dependency (nx)"; `yaml` is now a declared root devDependency. |
| Minor: `""` vs `null` asymmetry for cleared optional strings (reader.ts:115 vs :61) | **OPEN**, unchanged. |
| Minor: docs framing that implied the form was the only gate | **FIXED** — docs:47 now sits beside docs:106-121, which names every rule the form cannot enforce. |

## New defects

### N-1. [Moderate] Shorthand normalization applied to `site.json` only — 4 of 5 content files still violate the docs' own advice

- File: `content/resume.json`, `content/services.json`, `content/projects.json`, `content/credits.json` (verified by a full scan; `content/site.json` is clean).
- Scenario: an editor opens Resume, Services, Projects or Credits in the CMS for the first time. Every bare-string shorthand value — the form the object widget cannot read — renders as an **empty English field**, and Decap blocks the save until each is refilled. I count ~27 object-level fields (`resume.items[0].company`, `.location`, `.summary`, `.quip`; `resume.items[1].role`; `services.items[*].title/description/price`; `projects.items[1].title`, `.summary`, `roles`, `description`; `credits.items[2].title` = "three.js") plus 9 more inside `highlights` lists (`resume.items[0].highlights[0..2]`, `resume.items[1].highlights[0..1]`, `resume.items[2].highlights[0..1]`, `projects.items[0].highlights[0..1]`).
- Impact: the English copy the sample content ships is invisible to the form across 4 of the 5 files; the first CMS save of any of them demands re-authoring ~36 fields or does not happen. `docs/cms.md:37-39` tells users "write text as `{ "en": ... }` objects in the content files so they open cleanly" — the shipped sample content contradicts that advice everywhere except `site.json` (the one file the CMS walkthrough evidence covers).
- Fix: apply the same `{en}` wrap to the other four files (mechanical, no parser change needed — the shorthand remains valid, this is editor-experience hygiene).

### N-2. [Moderate] The parity test's Nx cache key does not include `config.yml` — a config-only edit replays a stale PASS

- File: `libs/content/data-access/src/lib/cms-config.spec.ts:58-61` reads `apps/web/public/admin/config.yml`; verified target inputs (`nx show project content-data-access --json`): `default`, `^production`, tsconfig filesets, `externalDependencies: ["vitest"]`, `CI` env. `config.yml` appears in **none** of them, and `web` is not a dependency of `content-data-access` (the arrow points the other way), so `^production` does not capture it either.
- Scenario: someone edits `config.yml` (a new field, a loosened pattern, `media_folder` change) and runs `nx test content-data-access`. The cache key is unchanged → Nx replays the previous green run **without the spec ever reading the new file**. Observed live in this session: my first r2 re-run replayed both tasks from cache (100% hit) — the entry happened to be fresh only because the spec itself had also changed.
- Impact: the guarantee printed at `config.yml:2` ("the spec fails when they drift") silently lapses whenever only the config changed. CI is cold-cached (`NX_DAEMON=false`, no persisted Nx cache in netlify.toml), so production builds are safe; local runs are where the stale green misleads.
- Fix: declare the input in `libs/content/data-access/package.json`'s nx `targets.test.inputs`: append `"{workspaceRoot}/apps/web/public/admin/config.yml"` (the `validate` target needs nothing — it only reads `content/*.json`, covered by `^production`).

### N-3. [Minor] The new URL regex over-rejects relative to the parser, and the test cannot see that direction

- File: `config.yml:94,125,220,256`.
- Scenario: an editor pastes `HTTPS://EXAMPLE.COM` — the parser accepts it (WHATWG URL normalizes the scheme), but the form rejects it (the regex is lowercase-only, no `i` flag). Same for a value with leading/trailing whitespace that `reader.ts:114` would trim. Harmless direction (form stricter than gate), but the two-way test proves only "regex rejects what the parser rejects" for the listed bad values — it cannot catch a future regex tightening that starts rejecting values the parser accepts, so these asymmetries will accumulate silently.
- Fix: none required now; note the case-sensitivity in the field's error message, or add the `i` behavior only if an editor ever hits it.

### N-4. [Minor] Residual narrow regex hole and the r1 `""`/`null` asymmetry, both unchanged

- `https://[` still passes `^https?://[^\s/]+\S*$` and fails `URL.canParse` — far narrower than r1's holes, same build-gated class. The `""`-vs-`null` question for cleared optional strings (reader.ts:115 vs :61) remains open with the same residual uncertainty.

## Regression check on the corrected code

- The two-way test's `setAt` placement is sound: bad values are injected into the full sample at the exact path, including under optional parents (`companyUrl`, projects `period.end`, projects `links[0].url`), so the parser rejection it asserts is the field's own rule, not a missing-parent artifact. Verified each of the five `badUrls` against `WEB_URL`/`LINK_URL`/`ASSET_URL` and the email-kind rule by hand.
- The contact-link regex's mailto branch matches the parser's `EMAIL_ADDRESS` on every case I could construct (multi-`@`, query strings, no-dot domains all rejected by both).
- `publish_mode: editorial_workflow` commented out (config.yml:13-14) is inert and correctly cross-referenced; when uncommented for production, docs:87-100 describes accurate mechanics. One nuance: with `main` protected by the Netlify check, a CMS "Publish" merge will also be blocked until the check passes — the docs say this is the point ("if you want the merge blocked"), so no defect.
- `site.json` normalization: verified clean — no bare strings remain under any LocalizedText key or in `bio` items.
- New docs sections verified accurate against code and bundle behaviour established in r1 (SRI, local_backend gating, validate-before-build).

## Verdict

- Recommendation: **APPROVED**
- Confidence: HIGH
- Top risk: a config-only edit to `config.yml` can be validated against a stale cache PASS locally (N-2), and 4 of the 5 content files still open in the CMS with ~36 invisible-English shorthand fields (N-1) — both are cheap, mechanical fixes.
- What remains open for the next pass: normalize shorthand in `resume/services/projects/credits` (N-1); add `config.yml` to the test target's Nx inputs (N-2); commit a golden CMS-save fixture (r1 M-3); refresh the stale `yaml` comment (spec:23).