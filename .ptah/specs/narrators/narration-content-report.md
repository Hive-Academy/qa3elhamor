# Narration as content data: report

Date: 2026-10-01. Scope: `libs/content/**`, `content/narration.json`, `content/README.md`,
`apps/web/public/admin/config.yml`. Nothing under `apps/web/src`, `libs/world` or
`tools/asset-pipeline` was touched.

## API

`@qa3elhamor/content-domain` (from `libs/content/domain/src/lib/narration.ts`):

```ts
export const NARRATION_LANDMARKS = ['pineapple', 'tiki', 'krusty-krab', 'bureau'] as const;
export type NarrationLandmarkId = (typeof NARRATION_LANDMARKS)[number];
export const NARRATION_LIMITS = { minLines: 2, maxLines: 5, maxEnLength: 140 } as const;

export interface LandmarkNarration {
  readonly lines: readonly LocalizedText[];
  readonly hints?: Readonly<Record<string, LocalizedText>>; // key = object id (pineapple: skill group id)
  readonly farewell?: LocalizedText;
}
export interface Narration {
  readonly landmarks: Readonly<Record<NarrationLandmarkId, LandmarkNarration>>;
}
```

`Content` gained `readonly narration: Narration`, and `ContentFiles` gained `narration: unknown`.
Parsing goes through the existing `parseContent`; the internal reader is `readNarrationFile` in
`parse/parse-narration.ts` (not exported from the package, same as the other file readers).

`@qa3elhamor/content-data-access`: `export const narration: Narration` (validated and deeply
frozen, like `profile` / `siteCopy`).

### How apps/web should read it

Same as the other content: the composition root imports it and passes it down as props.

```ts
import { narration } from '@qa3elhamor/content-data-access';
import { localize } from '@qa3elhamor/content-domain';

const pineapple = narration.landmarks.pineapple;        // typed by NarrationLandmarkId
pineapple.lines.map((line) => localize(line, locale));  // speech bubbles in order
const hint = pineapple.hints?.[skillGroup.id];          // SkillGroup.id from profile.skills
const bye = pineapple.farewell && localize(pineapple.farewell, locale);
```

All four landmarks are always present. `hints` and `farewell` are absent rather than empty when unused.

## File format (`content/narration.json`)

```json
{ "landmarks": { "pineapple": {
  "lines": [ { "en": "...", "ar": "..." }, "plain string = en only" ],
  "hints": [ { "id": "frontend", "text": { "en": "...", "ar": "..." } } ],
  "farewell": { "en": "...", "ar": "..." } }, "tiki": { ... }, "krusty-krab": { ... }, "bureau": { ... } } }
```

**Deviation from the intended shape, in the file only (the TS type is unchanged):** hints are
stored as a list of `{ id, text }` and exposed as a `Record<id, LocalizedText>`. Decap has no
map widget. The previous on-disk config worked around that by hard-coding one CMS field per
current skill group, so an editor could never add a hint for a new group or object.

### Validation (same reader and style as the other files)

- Unknown keys are rejected at every level: the file, `landmarks`, each landmark, each hint, and text objects.
- All four landmarks are required. A missing one reports `required field is missing`.
- `lines` must have 2 to 5 entries.
- English must be non-empty, and at most 140 characters for every line, hint and farewell.
- Hint `id` must be a lowercase slug and unique within its landmark.
- Pineapple hint ids are **not** cross-checked against `site.json` in the parser. Each file is
  validated on its own, skill groups are optional, and hint ids are generic object ids.
  Instead, `site-content.spec.ts` pins against the real content that the set of pineapple
  hint ids equals the set of skill group ids.

Pineapple hint keys are the skill group `id`s from `content/site.json`. Every group has an
explicit `id`, so no slugging was needed: `ai-llm-ops`, `architecture`, `backend`,
`databases`, `frontend`, `devops-tooling`.

## Review of the previous worker's edits, and fixes

1. `Narration` was a flat `Record<landmark, …>`, but the parser, `validate-content.ts` and both
   specs read `.narration.landmarks`. Typecheck would have failed. Changed to `{ landmarks }`.
2. `parse-narration.ts` re-implemented `isFields`, `isAbsent`, `describe` and `requiredObject`
   locally, and a missing landmark reported "expected an object, got undefined". It is now built
   on `reader.ts` helpers: `requiredObject`, `readList`, `optionalText`, `requiredId`,
   `checkUniqueIds`.
3. Hint keys and lengths were not validated, and the farewell length was not checked. Both are added.
4. CMS config: the hints were hard-coded per skill group. They are now a generic list with
   `{ id (slug pattern), text }`, and `lines` gets `max: 5`. A nested `&landmark` anchor blew the
   `yaml` alias budget ("Excessive alias count"). Decap 3.16.3 also loads config with `yaml`,
   so the landmarks are written out explicitly. Headroom is about 36 more `*l10n` aliases;
   a comment in config.yml explains why.
5. The domain spec mutated `Json`-typed values (a type error). The fixture is now typed.
6. The original lines invented UI ("skill bubbles", "tap a dish") and leaked file names
   ("content/services.json"). All lines were rewritten from the owner profile.

## Files

- MODIFIED `libs/content/domain/src/lib/narration.ts`: types, `NARRATION_LANDMARKS`, `NARRATION_LIMITS`
- MODIFIED `libs/content/domain/src/lib/parse/parse-narration.ts`: rewritten on the reader helpers
- `libs/content/domain/src/lib/content.ts`, `parse/parse-content.ts`, `src/index.ts`: wiring (kept from the previous worker)
- MODIFIED `libs/content/domain/src/lib/parse/parse-content.spec.ts`: typed fixture and 10 narration error cases
- `libs/content/data-access/src/lib/content-files.ts`, `site-content.ts`, `src/index.ts`, `bin/validate-content.ts`: load, expose and validate (kept)
- MODIFIED `libs/content/data-access/src/lib/cms-config.spec.ts`: generic `max` check on list widgets; landmark set and field parity with the domain
- MODIFIED `libs/content/data-access/src/lib/site-content.spec.ts`: real narration covers every landmark; one pineapple hint per skill group
- MODIFIED `apps/web/public/admin/config.yml`: Narration file entry
- MODIFIED `content/narration.json`, `content/README.md`

## Lines for owner review (en; `ar` present where marked)

### pineapple
- (ar) Welcome to the pineapple, home of Abdallah Khalil. Registered resident of Qaa El-Hamour: the bottom, officially.
- (ar) He's an AI Solutions Architect with 12+ years of SaaS platforms behind him. He reached the bottom and kept shipping.
- Lately: two production AI-native platforms, Pro-Estate and Ptah. Agents, MCP and context engineering, mostly.
- The card lists his underwater specialties. Pick one and I'll give you the short tour, no sales pitch.
- hint `ai-llm-ops`: LangChain, LangGraph, MCP, RAG. Agents that cooperate, and harnesses that don't mind which model is on shift.
- hint `architecture`: Hexagonal, Clean Architecture, DDD, multi-tenancy. He draws the boxes first, so the code has somewhere to live.
- hint `backend`: NestJS 11 and TypeScript, with Prisma, ZenStack and Bull queues. The plumbing that keeps the reef running.
- hint `databases`: PostgreSQL, MongoDB, Neo4j, Redis, sqlite-vec. A different fish for every current.
- hint `frontend`: Angular 21 with signals and SSR, in Nx monorepos. Even the bottom deserves a good-looking interface.
- hint `devops-tooling`: Docker, Kubernetes, GitHub Actions, Nx. If it isn't in the pipeline, it didn't ship.
- farewell (ar): Next stop: Performance Reviews. Follow the current, and the sardines.

### tiki
- (ar) Welcome to Performance Reviews. Every job is on file here, newest first.
- It starts at Khabeer Group in 2015, then years of freelance work for startups abroad.
- Then Prio, as Lead Software Development Engineer: owning architecture, CI/CD and mentoring senior engineers.
- (ar) In 2020 he co-founded Miramar Staffing, and he still leads its tech. Reviews: consistently above sea level.
- farewell (ar): Reviews filed. The Krusty Krab is just down the current, and the menu is open.

### krusty-krab
- (ar) Welcome to the Krusty Krab. Today's menu is short, and every dish is a real service.
- The names are for fun. Underneath: AI agent and MCP architecture, SaaS platforms, leadership, bilingual delivery.
- Prices are in pearls, kelp and sand dollars. Serious orders go through the Complaints Bureau. Don't ask.
- farewell (ar): Enjoy your meal. The Bureau is next, for complaints and project ideas alike.

### bureau
- (ar) This is the Municipal Complaints Bureau. Complaints, questions and project ideas all go in the same tray.
- It goes privately to Abdallah's desk. The Sardine President reads every one, eventually.
- Leave a reply address if you want an answer. The Municipality is efficient, not psychic.
- (ar) We reached the bottom, and we still answer the mail.
- farewell (ar): Thanks for visiting Qaa El-Hamour. Swim safe, and come back down anytime.

Every fact is taken from `.ptah/owner-profile.md` or `content/site.json` / `services.json`.
Owner points to check:
- "Pick one and I'll give you the short tour" assumes the UI shows a hint when a skill group is selected.
- "Krusty Krab" is used by name, following the landmark id.
- "Leave a reply address" matches the optional email field on the complaint form.

## Checks

- `npx nx run content-data-access:validate --skipSync --skip-nx-cache`: passed. "Site content is
  valid: 4 resume entries, 3 projects, 4 services, 3 credits, 4 narrated landmarks."
- `npx nx run-many -t lint,typecheck,test -p content-domain content-data-access --skipSync --skip-nx-cache`:
  all passed. content-domain 40 tests; content-data-access 315 tests (cms-config 309,
  site-content 6). No lint warnings.
- `npx nx test web --skipSync`: 160 passed and 1 failed. The failure is the expected
  `app.spec.tsx > reports the manifested asset count from the world library` (another agent's
  in-flight manifest change). There were no other failures.
