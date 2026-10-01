# Code Logic Review — narration as content data (roadmap item: narrators)

Reviewer: code-logic-reviewer (glm-5.3:cloud). Date: 2026-10-01.
Scope: `libs/content/**`, `content/narration.json`, `content/README.md`,
`apps/web/public/admin/config.yml` (current uncommitted state). `libs/world`, `tools/`,
`apps/web/src` excluded per instructions. Read-only review; no source edited.

## Summary

| Metric              | Value    |
| ------------------- | -------- |
| Overall score       | 7/10     |
| Assessment          | APPROVED |
| Blocking issues     | 0        |
| Serious issues      | 0        |
| Moderate issues     | 2        |
| Minor issues        | 3        |

## Verification performed

- `npx nx run content-data-access:validate --skipSync` — passes ("Site content is valid: …
  4 narrated landmarks").
- `npx nx run-many -t lint,typecheck,test -p content-domain content-data-access --skipSync`
  — lint, typecheck and tests all pass for both projects.
- Read in full: `parse-narration.ts`, `reader.ts`, `narration.ts`, `parse-content.ts`,
  `content.ts`, `content-files.ts`, `site-content.ts`, `resolve-content.ts`,
  `validate-content.ts`, `parse-content.spec.ts` (narration fixture + 10 error cases),
  `cms-config.spec.ts`, `site-content.spec.ts`, `content/narration.json`, the narration
  section and anchors of `admin/config.yml`, `.ptah/owner-profile.md`, the worker report.

## Findings by requested check

### 1. Parser / validation — sound

- **Unknown keys rejected at every level.** File level via
  `readObject(r, value, path, ['landmarks'])` (parse-narration.ts:88), landmark level via
  `requiredObject(..., LANDMARK_KEYS)` (parse-narration.ts:61), hint level via
  `readObject(..., ['id','text'])` (parse-narration.ts:50), text level via `textItem`'s
  `readObject(..., LOCALES)` (reader.ts:163). Pinned by the `chum-bucket` case
  (parse-content.spec.ts:409-415).
- **Limits.** 2–5 lines: `readList(..., { min: minLines })` (parse-narration.ts:65) plus
  the `maxLines` check (parse-narration.ts:66-68); ≤140 en for lines
  (parse-narration.ts:69), hints (parse-narration.ts:52), farewell
  (parse-narration.ts:75). All three have error cases in the spec
  (parse-content.spec.ts:349-407). Validated against the real file by the passing
  `validate` target.
- **Hint id rules.** `requiredId` enforces the lowercase-slug regex
  `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` (reader.ts:348-361); duplicates reported at the repeating
  item by `checkUniqueIds` (reader.ts:364-382). Spec cases at parse-content.spec.ts:371-382.
- **Prototype pollution — checked, safe.** `__proto__` cannot pass the slug regex
  (underscores rejected) and `constructor`/`toString` are valid slugs but
  `Object.fromEntries` (parse-narration.ts:80) defines own properties via
  `CreateDataProperty`, so no `Object.prototype` write is possible; `deepFreeze` then walks
  `Object.values` (own properties only, resolve-content.ts:33). An invalid id records an
  error and `parseContent` returns `err` (parse-content.ts:33), so no polluted value ever
  escapes. The only residual oddity — a hint id of `constructor` shadows the prototype
  method on the `hints` record — is harmless (the record is only read by known skill-group
  ids).
- **List-in-file → record-in-type.** `Object.fromEntries(hintList.map(...))`
  (parse-narration.ts:79-81); duplicates are impossible in the emitted record because
  `checkUniqueIds` fails the parse first. Spec pins the conversion
  (parse-content.spec.ts:136-140).
- **Error discipline.** One error per problem: an unreadable parent (the `UNREADABLE`
  sentinel, reader.ts:41-46) suppresses the misleading "required field is missing" from its
  children; the spec asserts exactly one error per case (parse-content.spec.ts:422).
  Missing landmark reports `required field is missing` at `narration.landmarks.<id>`
  (pinned, parse-content.spec.ts:365-368) — the earlier "expected an object, got undefined"
  regression the report mentions is genuinely fixed.
- **Frozen output.** `resolveContent` → `deepFreeze` (resolve-content.ts:30-36, 43-47)
  covers the `landmarks` record, `lines` arrays, the hints record and text objects;
  `narration` is re-exported from the frozen `siteContent` (site-content.ts:34).
  `Object.isFrozen(...lines)` asserted in site-content.spec.ts:44.

### 2. CMS ↔ schema parity — pinned, and the spec really pins it

- Landmark set and field order pinned against `NARRATION_LANDMARKS`
  (cms-config.spec.ts:391-410), including `lines` `min`/`max` against `NARRATION_LIMITS`
  (cms-config.spec.ts:404-408 ↔ config.yml:308, 322, 329, 336).
- One CMS file entry per content file, at the import path — narration included via
  `CONTENT_FILE_PATHS` (cms-config.spec.ts:210-220, content-files.ts:29).
- Required-ness parity in both directions for every field in the tree, hints included
  (descended via `fieldPaths` list logic, cms-config.spec.ts:149-164, 230-257).
- `id` pattern parity in both directions: the `*id` anchor's slug regex
  (config.yml:69-73) is the same regex the parser uses, and the spec feeds bad ids
  through both (cms-config.spec.ts:259-297).
- List min/max enforcement sampled through the parser (cms-config.spec.ts:311-321).
- **YAML alias change.** The landmarks are written out explicitly with a comment
  explaining why (config.yml:293-294); the previous nested-anchor "Excessive alias count"
  failure mode is structurally gone, and the spec parses the file with the same `yaml`
  parser Decap uses (`{ merge: true }`, cms-config.spec.ts:61-64), so a regression to a
  budget-blowing shape would fail the spec at parse time. The report's "headroom ~36 more
  `*l10n` aliases" number is not in the comment — doc nit only.

### 3. Real-content tests — present and meaningful

- `site-content.spec.ts:42-45`: real narration covers exactly the four landmarks; lines frozen.
- `site-content.spec.ts:50-53`: pineapple hint ids equal the real skill-group ids
  (both directions — a new group without a hint, or an orphaned hint, fails). This is the
  right place for it, since the parser deliberately keeps files independent.
  Residual gap: see defect 2.

### 4. Copy — traceable, tone on target; one coverage gap

- Every factual claim traces to `owner-profile.md`: 12+ years / AI Solutions Architect
  (profile Summary, headline), Pro-Estate and Ptah (Summary), all six hint tech lists
  (Skills groups — verified item by item), Khabeer Group 2015 → freelance abroad → Prio
  (role, CI/CD, mentoring) → Miramar 2020 co-founder and current tech lead (Experience
  table + bullets). No invented numbers, clients or prices ("pearls, kelp and sand
  dollars" is clearly a joke, not a rate card).
- Arabic is natural Egyptian colloquial ("أهلاً بيك في الأناناسة", "وصل القاع وكمّل شغل",
  "امشي مع التيار، ومع السردين", "عوم بالسلامة") — no stiff translationese.
- **IP framing: acceptable.** No SpongeBob character name appears anywhere in
  `content/narration.json`. "Krusty Krab" is used strictly as the established landmark
  place name (it is the landmark id in the objective itself), which fits the Egyptian
  trend framing; nothing references characters, imagery or the show. Owner should still
  confirm comfort with a trademarked place name on a portfolio (flagged in the report
  already).
- The remaining copy gap is defect 1 below (missing `ar` on hints and several lines).

### 5. Commands run

Both requested commands pass (see "Verification performed"). Report's claimed results
reproduced.

## Five logic questions

1. **Silent failure?** The one that matters: a skill group added in `content/site.json`
   without a matching hint builds cleanly and ships — `pineapple.hints[newId]` is
   `undefined` and the guard lives only in a test, not the build gate (defect 2).
2. **Unexpected user action?** An Arabic-locale visitor hears the narrator switch
   languages mid-speech (defect 1). A CMS editor can save a 141-char line and only learn
   at build (minor 3).
3. **Wrong answer input?** `__proto__`/`constructor` hint ids: rejected / safely
   own-property — no pollution (verified above). A `hints: []` in the file reads as
   absent — benign, both mean "no hints".
4. **Dependency failure?** Invalid content throws `ContentValidationFailure` loudly at
   import and at the build gate (resolve-content.ts:43-47, validate-content.ts:11-24);
   nothing half-renders. `yaml` parse of a regressed config fails the parity spec.
5. **Missing from requirements?** Full Arabic coverage for hints and all lines was never
   written down; the type makes `ar` optional and the copy follows suit (defect 1).

## Numbered defects

1. **MODERATE — mixed-language speech bubbles in Arabic: 8 of 16 lines and all 6 hints
   have no `ar`.** `content/narration.json:14,17` (pineapple), `:23-55` (all hints),
   `:70,73` (tiki), `:92,95` (krusty-krab), `:111,113` (bureau). `localize` falls back to
   English (localized-text.ts), so an Arabic (RTL) visitor — the site's home audience —
   gets English-only hints and language switches mid-dialogue at every landmark. The type
   allows `ar` optional and the report marks coverage, but no requirement records this
   partial state as intended. **Fix:** decide with the owner; if hints/lines are meant to
   be bilingual, write the missing `ar` values (the parser needs no change), or record the
   en-only decision in `content/README.md` next to the narration row.
2. **MODERATE — pineapple-hint ↔ skill-group pairing is guarded only by a test, not the
   build gate.** `site-content.spec.ts:50-53` catches a skill group without a hint, but
   `validate-content.ts:11-18` (what `web:build` runs) does not: a CMS editor adding a
   skill group in `site.json` can merge and deploy with the new group's hint silently
   absent at runtime. **Fix:** add the cross-file check to `validate-content.ts` (compare
   `Object.keys(narration.landmarks.pineapple.hints ?? {})` with `profile.skills?.map(g
   => g.id)`, non-zero exit on mismatch), keeping the spec for regression pinning.
3. **MINOR — the 140-character English limit is unenforceable in the CMS.** The `lines`
   labels document it (config.yml:308 etc.) but Decap's string widget carries no length
   constraint, so an editor learns of an over-long line only when the build fails. A
   `pattern: ['^[\\s\\S]{0,140}$', …]` on the `en` widgets of narration lines/hints/
   farewell would enforce it client-side; note this also requires extending the pattern
   map in cms-config.spec.ts:268-274 (`bad` has no `en` entry, so the spec would fail
   until taught the new pattern's bad values).
4. **MINOR — `maxEnLength` bounds English only** (narration.ts:14-19, parse-narration.ts:30).
   An Arabic line of any length validates. Arabic is usually shorter per sentence, so the
   risk is low, but a very long `ar` value can still overflow the speech bubble the limit
   exists for. **Fix (optional):** also bound `ar` (same or larger limit) or document the
   en-only rationale at narration.ts:17.
5. **MINOR — the frozen test does not cover the narration hints record.**
   `site-content.spec.ts:34-38,44` freezes the content, bio, a period and `lines`, but not
   `landmarks.pineapple.hints`. `deepFreeze` does freeze it (verified by reading
   resolve-content.ts:30-36), so this is coverage, not correctness. **Fix:** add
   `expect(Object.isFrozen(narration.landmarks.pineapple.hints)).toBe(true)` to
   site-content.spec.ts:42-45.

## Failure modes

No failure mode beyond the defects above survived verification. Specifically examined
and found safe: prototype-pollution via hint ids (rejected/safe, see §1); duplicate ids
reaching the record (parse fails first); error cascades from unreadable parents
(`UNREADABLE` sentinel); partially-written or non-object narration file (single clear
error, path-rooted); frozen-output escape (none — all reachable objects frozen).

## Verdict

- Recommendation: **APPROVED** (score **7/10**)
- Confidence: HIGH for parser/parity/test claims (all code read in full, commands
  reproduced); MEDIUM for copy/tone judgments (inherently subjective; facts fully traced).
- Top risk: an Arabic visitor gets a half-translated narrator (defect 1), and a future
  CMS-only skill-group edit can ship without its hint (defect 2).
- What a robust implementation would add: the build-time cross-file hint check
  (defect 2's fix), the missing `ar` values once the owner decides, and a CMS-side
  length guard for the 140-char limit.