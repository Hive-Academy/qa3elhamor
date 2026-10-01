# a11y-fallback: notes

## Design

- **Two presentations, one content source.** `App` asks `usePresentation()` for `dive` or `page`:
  - Up front: `readDeviceCapabilities().webgl === false` gives the page (`no-webgl`). Otherwise `?view=page` gives the page (`requested`). Otherwise the dive.
  - At runtime the page is shown with `dive-failed` in three cases. `DiveFailureBoundary` wraps `<Canvas>` and catches the scene errors R3F rethrows. `useCanvasGuard` supplies a `gl` factory that reports a failed `new WebGLRenderer` (R3F creates the renderer in an async effect, where no boundary can see it). It also attaches an `onCreated` watcher that reports a `webglcontextlost` with no `webglcontextrestored` within 3 s; three.js restores short losses itself.
  - Switching views uses the History API: pushState with `?view=page` and back. Back/Forward work, and the URL can be shared. Other params such as `?quality=` are kept. After a switch, focus goes to the page `<h1>` and the window scrolls to the top. A failed dive stays failed for that document. "Try the dive again" is a real navigation that reloads the page.
- **Reduced motion:** checked, not rebuilt. `inWorldAvailable` turns in-world off under reduced motion, and the dive and narrators already get `reducedMotion`. Reduced motion alone does **not** switch to the page view. The dive already respects it, and the skip link is available to everyone.
- **"Skip the dive: read it as a page"**: a real `<a href="?view=page">` in the scene note. It is the first focusable element in the dive (verified: the first Tab lands on it). A plain click switches in place; a modified click opens a new tab.
- **The page** (`page-view/`) contains:
  - Skip link, masthead (Arabic place name in a `<bdi>`, `<h1>` with the owner's name, headline, `siteDescription`, a notice saying why the visitor is on the page plus the way back to the dive), and a sticky section `<nav>`.
  - `<main>` with seven `<section aria-labelledby>`:
    - About: the real Citizenship Card parts (band, identity, links, bio, skill stamps).
    - Experience: every `resumeEntries` entry, including the quip.
    - Projects: every `projectItems` entry, with links and media.
    - Services: every `serviceItems` entry, with menu name and price.
    - Contact: the actual `ComplaintScroll`, with its own `createContactSubmitter(import.meta.env)`.
    - Overheard on the dive: every narration line, hint and farewell per landmark.
    - Credits: `credits.json` entries, then the mandatory CC-BY model credits through world-ui `CreditsList`. A licence error is reported in place.
  - Footer with "Back to top" and the dive link.
  - Heading levels are h1 → h2 → h3 (the card's own h3/h4/h5 sit under About).
- **Bilingual and RTL:** page chrome text is in `PAGE_VIEW_COPY` (`en` + `ar`, with the key set enforced by type). The root sets `lang`/`dir`. Content uses `dir="auto"`. Data (tech names, author) is isolated with `<bdi>`. CSS uses logical properties only. The `ar` locale is covered by a spec; the site itself is `en` today.
- **Styling:** navy body, the card's teal band as the masthead, and the overlays' paper/ink (`--lmk-*` restated on `.page-view`) for sections. Focus rings are #ffd68c on dark and #0b6fa4 on paper. Targets are at least 44 px. Print CSS removes the sea, nav, notice and form, and prints link URLs.

## Files

Created, all under `D:\projects\qa3elhamor\apps\web\src\app\`:

- `page-view/presentation.ts`: choice, hrefs, `usePresentation`
- `page-view/dive-guard.tsx`: boundary, guarded renderer, context-loss watch
- `page-view/page-view.tsx` + `page-view.css`: the page shell
- `page-view/page-parts.tsx`: section, outbound link, tags, period
- `page-view/work-sections.tsx`: experience, projects, services
- `page-view/site-sections.tsx`: about, contact, narration, credits
- `page-view/page-content.ts`: `buildPageContent()` from `@qa3elhamor/content-data-access`
- `page-view/page-copy.ts`: page-only copy, en/ar
- `page-view/read-as-page-link.tsx` + `.css`
- `page-view/index.ts`
- Specs: `page-view/{presentation,dive-guard,page-view}.spec.*` and `app-fallback.spec.tsx`

Modified:

- `app.tsx`:
  - `App` chooses the presentation.
  - `Site` takes `onReadAsPage` and `onDiveFailure`.
  - `<Canvas>` is wrapped in `DiveFailureBoundary`, with `gl` built by `canvasGuard.renderer(...)` (same options as before) and `onCreated`.
  - `ReadAsPageLink` is added to the scene note.
- `credits.tsx`: new `SiteCreditsList` (an inline list that reuses `useCredits`). Prettier also rewrapped a few existing lines in this file; the change is formatting only.
- `app.spec.tsx`: the WebGL probe is mocked to `true`, since jsdom has no WebGL and would now get the page.

## Verification

- `npx nx run-many -t lint,typecheck,test -p web --skipSync`: **passed**. 28 test files and 280 tests passed, with no lint warnings.
- The specs check:
  - Each content array's entry count is rendered (resume, projects in display order, services, narration landmarks, site credits, `shippedCredits()`).
  - Every bio paragraph, skill and link is present, and so is the complaint form.
  - The page is chosen for no-WebGL, `?view=page`, and a canvas that throws.
  - The skip link round trip and popstate.
  - Context-loss grace and restore, and a refused renderer.
  - Arabic `dir`.
- Visual check, Vite on port 4407 (now stopped). Run `capture.mjs` and `sections.mjs` in this folder; the JPGs are in `shots/`:
  - `nowebgl-*`: Chromium with `--disable-webgl --disable-3d-apis`. No canvas, the page loads with the no-WebGL notice, there is no horizontal overflow at 390 px or 1440 px, and the first Tab shows the skip link.
  - `webgl-*-viewpage-*`: `?view=page` with WebGL available.
  - `webgl-*-dive-skiplink` / `dive-to-page`: the link in the dive switches to the page (URL `?view=page`), and "Back to the dive" brings the canvas back.
  - `section-*-1440|390.jpg`: each section on its own.
- **axe-core 4.13** (wcag2a/aa, wcag21a/aa, best-practice), loaded from a temp `npm pack` and not installed into the repo:
  - **0 violations** on all four page runs (no-WebGL and `?view=page`, desktop and phone).
  - axe left `color-contrast` incomplete on 92 nodes. Those nodes sit on gradient or translucent backgrounds, which axe cannot measure. I checked the pairs by hand:
    - sand on teal: 6.2:1
    - foam on navy: 14.6:1
    - ink on paper: 13.2:1
    - soft ink on paper: 7.1:1
    - rust heading on paper: 6.3:1
    - link on paper: 6.6:1
    - tag text: about 9.8:1
    - review label on its tinted background: about 5.6:1

  All pass AA.
- Polish after looking at the screenshots:
  - The Arabic place name is now in a `<bdi>`, so it aligns with the page instead of flushing right.
  - The complaint form's sticky stamp row is unpinned on the page; it was drawing a lighter band.

## Open issues and follow-ups

- **Bundle:** a no-WebGL visitor still downloads the three/R3F chunks, because `app.tsx` imports them statically. `React.lazy` around `Site` would fix this. I did not touch build or chunk configuration because another agent is editing it.
- `PAGE_VIEW_COPY` should move into `content/site.json` once the owner signs it off. That needs new `SITE_COPY_KEYS` in `libs/content/domain`, which was out of scope.
- The page builds its own contact submitter, so with no provider configured the "not configured" warning appears once per surface. Exporting one shared submitter from `landmarks.config.ts` would remove the duplicate.
- Telemetry does not record page-view usage or the fallback reason. A `presentationChosen(reason)` event would show how often the fallback is needed, but it requires a telemetry-domain change.
- The phone section nav scrolls sideways and has no fade hint at its end edge.
- Tiki and Krusty Krab are still "coming soon" placeholders in the dive. The page is currently the only place experience and services can be read.

## Revision 1 (review: code-review-agy.md, approved 8/10 with fixes)

1. **Focus after "Back to the dive".** `ReadAsPageLink` takes `focusOnMount`. `app.tsx` passes `returnedFromPage={view.switched}` through `Site`, so returning to the dive puts focus on "Skip the dive: read it as a page", the dive's first stop. Focus is no longer left on `<body>`. A first visit to the dive takes no focus. Specs are in `app-fallback.spec.tsx`.
2. **Back and Forward.** The popstate handler now marks a switch (`switched`, scroll to top), so focus moves the same way as for a click. Going to the page focuses its `<h1>`; going to the dive focuses the link. Popstate events that do not change the view, such as the section nav's in-page anchors, are ignored: they no longer move focus or scroll. A failed dive stays on the page when the visitor goes Back. All of this is specced in `app-fallback.spec.tsx`.
3. **Dates.** `formatYearMonth` accepts only `YYYY-MM` (month 01 to 12) and builds the date with `Date.UTC`. Any other value is shown exactly as written, so the page never prints "Invalid Date". Specced in `page-view/page-parts.spec.ts`.
4. **One contact submitter.** The new `apps/web/src/app/contact-submitter.ts` creates `CONTACT_SUBMITTER` once. `buildPageContent()` uses it by default (specced). `landmarks.config.ts` is being edited by another agent, so I left it alone. It still calls `createContactSubmitter` itself; the orchestrator should point it at `CONTACT_SUBMITTER`.

Not done, as instructed: the `React.lazy` shell split.

**Verification:** `npx nx run-many -t lint,typecheck,test -p web --skipSync`
- Lint: passed.
- Tests: 29 files and 288 tests passed.
- Typecheck: **failed**, but only in another agent's in-flight files:
  - `narrators/narrated-visit.tsx`
  - `narrators.config.spec.ts` (`bundledCharactersFromEnv`)
  - `pineapple/pineapple-visit.spec.tsx`, `pineapple/pineapple-hud.tsx`, `pineapple/pineapple-scene.tsx` (missing `./skill-selection`, renamed copy keys)

  Running `tsc -p tsconfig.app.json` and ESLint on the page-view files, `contact-submitter.ts`, `app.tsx` and `app-fallback.spec.tsx` reports no errors.
- During one run, the specs that import `landmarks.config.ts` could not load at all, because the other agent's pineapple files were half-renamed. They passed once that work settled.
