# قاع الهامور — Qaa El-Hamour

An interactive WebGL brand website themed on the viral Egyptian trend **"Qaa El-Hamour"**
(قاع الهامور) — the August 2026 phenomenon in which some 1.8 million Egyptians projected
their bureaucratic and economic frustrations onto an underwater parallel state.

The site is a scroll-driven camera dive through an ocean scene. Interactive landmarks stand
in for the sections of a personal brand site: the Pineapple is the bio, Squidward's Tiki head
is the résumé, the Krusty Krab is the services menu, and a Municipal Complaints Bureau
replaces the contact form — visitors file a complaint instead of sending an email.

It is built as a **config-driven, open-source template**. Content, branding, and assets
resolve from data files; the scene libraries never import them directly. Forking should mean
editing configuration, not components.

## Use this template

Fork it, then make it yours by editing content, config and assets only:

```bash
npm install
npm run template:reset        # swap the owner's profile for neutral sample content
# edit content/*.json and apps/web/src/site.config.ts (brand, theme, languages, landmarks, cast)
npx nx dev web
```

[`docs/template.md`](docs/template.md) walks through it in about 30 minutes: content, brand and
theme, the narrator cast, moving or replacing landmarks (including swapping a landmark's 3D model
through the asset pipeline, with its licence credit), providers, and deploying to your own GitHub
Pages. It was written by rebranding a fork end to end.

---

## Status

**Stage A foundation is complete.** The workspace, build tooling, module boundaries, CI, and
the shared/world primitives exist. No scene, camera, landmark, or backend feature is built
yet — those are Stage B roadmap items.

What renders today is a fogged, empty ocean volume that proves the R3F → Vite → Nx pipeline
works end to end and that the world asset manifest resolves across library boundaries.

- **Roadmap:** [`.ptah/roadmap.md`](.ptah/roadmap.md) — the phased plan. Each unchecked item
  is its own task.
- **Decisions:** [`.ptah/scope-decisions.md`](.ptah/scope-decisions.md) — what was chosen
  during discovery, and why.
- **Source blueprint:** [`assets/qaa-elhamour-threejs-concept.md`](assets/qaa-elhamour-threejs-concept.md)

---

## Getting started

```bash
npm install
npx nx dev web        # http://localhost:4200
```

Verify the whole workspace:

```bash
npx nx run-many -t lint typecheck test build
```

---

## Architecture

| Layer | Choice | Why |
|---|---|---|
| 3D | Three.js via React Three Fiber + drei | Largest Three.js ecosystem; the most forkable option |
| Build | Vite, Nx monorepo | Fast HMR; enforced library boundaries |
| Hosting | Static bundle | Almost everything is prerendered |
| Backend | One serverless seam | Only the public complaints wall needs a server |
| Database | Managed Postgres via Prisma | Scoped to the wall alone |
| Auth | None in this codebase | Visitors are anonymous; the CMS owns its own login |

### Workspace layout

```
apps/
  web/                     React + R3F site. The composition root.
  api/                     Serverless handlers (Fetch API shape). Health only today.
libs/
  shared/domain/           Result, branded ids, value-object base
  shared/util/             Pure math: clamp, lerp, remap, smoothstep
  shared/api-interfaces/   The only type channel between web and api
  world/domain/            Asset manifest, quality tiers, CC-BY attribution records
```

Stage B adds `world/feature`, `dive/*`, `landmarks/*`, `content/*`, `complaints/*`, and
`telemetry/*` as their roadmap items are built.

### Module boundaries

Libraries carry three tag dimensions — `scope:` (bounded context), `type:` (layer), and
`platform:` (web / serverless / shared) — enforced by `@nx/enforce-module-boundaries` in
[`eslint.config.mjs`](eslint.config.mjs).

The rule that matters most: **bounded contexts are strictly isolated.** A scene library may
not import content. Landmarks receive their copy as props, and `apps/web` is the only place
allowed to wire the two together. Without that rule, content references leak into scene
internals and a fork stops being a matter of editing data. Apps deliberately carry no
`scope:` tag, which is what lets them compose across contexts.

Handlers in `apps/api` are written against the Fetch API (`Request` → `Response`) rather than
any vendor's signature, so the deployment target stays an open decision.

---

## Assets and licensing

Four models are committed under `assets/`, all **CC-BY-4.0** — commercial use permitted,
**attribution required**:

| Model | Author |
|---|---|
| Bikini Bottom Map 3D Model | [spongebob.evolution](https://sketchfab.com/spongebob.evolution) |
| Sbfbb-SpongeBob House | [Sajin Mickey Firey fan 1342](https://sketchfab.com/cherylhill28) |
| Sponge On The Run: SpongeBob Base Model | [NickBob](https://sketchfab.com/nickbob) |
| Sponge On The Run: Patrick Base Model (Textured) | [NickBob](https://sketchfab.com/nickbob) |

The full credit strings live in `libs/world/domain/src/lib/attribution.ts` and are rendered
in-world by the `asset-attribution-ui` roadmap item. A unit test fails the build if a model
is added to the manifest without its credit.

> **Two constraints worth knowing before you fork.**
>
> The licences cover the **mesh files**, not the characters. SpongeBob is Nickelodeon /
> Paramount intellectual property, and parody use of a viral meme sits differently from a
> commercial site trading on that IP. This project therefore leans on the Egyptian trend's
> own vocabulary — the Sardine President, the complaints bureau, *"we reached the bottom"* —
> rather than SpongeBob branding.
>
> The raw assets total **27.6 MB**, with a single 17 MB model among them. Compression
> (Meshopt/Draco geometry, KTX2 textures) is a prerequisite, not an optimisation pass.

---

## Contributing

Work proceeds one roadmap item per session. Pick an unchecked item from
[`.ptah/roadmap.md`](.ptah/roadmap.md), check its `Depends on:` line, and run
`/orchestrate <slug>` in a fresh chat.
