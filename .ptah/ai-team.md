# Proposed AI Team — Qaa El-Hamour

> **Not applied.** `proposeConfig` is not exposed in this session (the Ptah API here offers
> `searchSkills`, `searchMcpRegistry`, `createSkill`, `installMcpServer`, and
> `listInstalledMcp` — no propose/apply surface). This file is the proposal in the form it
> would have carried. Applying any of it is your call.
>
> The three skills below were **authored to disk** by `createSkill` and are inert until the
> plugin is enabled. Nothing else here has been installed.

---

## Agents

Drawn from the 14 specialists in `ptah.orchestration`. The default catalogue is
backend-heavy; this project is almost entirely frontend, 3D, and content, so the useful move
is narrowing rather than adding.

| Agent | Role here | Roadmap items |
|---|---|---|
| **frontend-developer** | The primary implementer. Nearly every item is React/R3F. | Phases 3, 4, 6 |
| **software-architect** | Owns the landmark kernel abstraction and the config-driven seam that makes the template forkable. | `landmark-kernel`, `template-config` |
| **visual-reviewer** | The only reviewer that can judge a WebGL scene. Fog density, silhouette legibility, and art-direction drift are invisible to text review. | Phases 3, 4, 8 |
| **senior-tester** | Playwright smoke plus canvas visual regression. | `qa-smoke`, `a11y-fallback` |
| **backend-developer** | Narrow scope: the single serverless seam only. | Phase 5 |
| **devops-engineer** | Static hosting, cache headers, CI budget gates. | Phase 7 |
| **researcher-expert** | For the asset audit — determining what geometry the bundled map actually contains. | `asset-audit` |

**Deliberately excluded:** `project-manager` (the roadmap already is the plan; a PM pass per
item is overhead), and `code-logic-reviewer` as a standing gate (worth invoking for Phase 5's
public write endpoint, not for scene code).

---

## Skills

### Authored for this project

> [!IMPORTANT]
> **Correction.** An earlier version of this file claimed a marketplace search for Three.js
> returned zero results. That was wrong — `searchSkills` had failed and returned an empty
> array indistinguishable from a real negative (see `.ptah/ptah-tooling-issues.md`, defect
> #1). The same query later returned 50 relevant skills. **Evaluate the existing skills
> below before relying solely on the authored ones.**

Worth evaluating from skills.sh, now that search works:

| Skill | Source | Installs |
|---|---|---|
| `r3f-best-practices` | `emalorenzo/three-agent-skills` | ~1,020 |
| `r3f-fundamentals`, `r3f-shaders`, `r3f-loaders`, `r3f-animation`, `r3f-materials`, `r3f-lighting`, `r3f-textures`, `r3f-geometry` | `enzed/r3f-skills` | ~1,100–1,260 each |
| `threejs-gltf-loading`, `threejs-scene-setup` | `gamedev-skills/awesome-gamedev-agent-skills` | ~1,315–1,338 |
| `threejs-perf` | `playableintelligence/game-creator` | ~451 |
| `scroll-world-storytelling` | `mengto/skills` | ~252 |
| `react-three-fiber-patterns` | `organvm-iv-taxis/a-i--skills` | ~13 |

Install with `npx skills add <owner/repo> --skill <id> -y`. Caveat: every skills.sh result
returns an **empty description** (defect #5), so these cannot be judged on fit without
reading each `SKILL.md` — install counts are the only available signal, and they measure
popularity, not suitability.

The three skills below were still written rather than installed. Two of them stand up
regardless of what exists on the marketplace; one is now partly redundant:

| Skill | Standing | Why |
|---|---|---|
| **`qaa-elhamour-art-direction`** | **Keep — nothing can replace it** | Project-specific by definition: the IP guardrail, the deadpan-municipal voice, Egyptian colloquial Arabic and RTL, fog and colour direction, accessibility as art direction. No marketplace skill knows this project. |
| **`webgl-asset-pipeline`** | **Keep — no close equivalent found** | 27.6 MB of raw models against a sub-5 MB budget. gltf-transform inspection, prune/dedupe/resize, Meshopt vs Draco, KTX2 transcoding, baking, loader wiring, CI budget gates. The marketplace skills cover authoring, not shipping-weight discipline. |
| **`r3f-scene-patterns`** | **Overlaps `r3f-best-practices` and the `enzed/r3f-skills` set** | Still worth keeping for the frame-loop rules and the jsdom-testing section, but compare against `r3f-best-practices` first and drop whichever is weaker rather than running both. |

On-disk locations:

```
~/.ptah/plugins/ptah-harness-r3f-scene-patterns/skills/r3f-scene-patterns/SKILL.md
~/.ptah/plugins/ptah-harness-webgl-asset-pipeline/skills/webgl-asset-pipeline/SKILL.md
~/.ptah/plugins/ptah-harness-qaa-elhamour-art-direction/skills/qaa-elhamour-art-direction/SKILL.md
```

### Already installed and relevant

- **`nx-workspace-architect`** — re-invoked per module in Stage B for each new library.
- **`review-code`, `review-logic`, `review-security`** — `review-security` matters
  disproportionately at `complaints-api`, the site's only unauthenticated write endpoint.
- **`orchestrate`** — the Stage B entry point.

### Installed but not applicable

`nestjs-backend-patterns`, `nestjs-deployment`, `resilient-nestjs-patterns`,
`saas-platform-patterns`, `webhook-architecture`, and
`extract-and-relocate-angular-component-feature` all assume a NestJS/Angular stack this
project does not use. There are no webhooks and no billing. Leave them installed; they
simply will not trigger.

### Missing

**`ddd-architecture`** is referenced by `saas-workspace-initializer` Step a2 but is not
installed in this workspace. I named the bounded contexts inline to its spec instead. Worth
installing before Stage B if you want its domain-modelling guidance per module.

---

## MCP servers

> [!WARNING]
> **`searchMcpRegistry` is partly broken** (see `.ptah/ptah-tooling-issues.md`, defects
> #2–#4). The `official` source ignores the query entirely and returns the catalogue in
> alphabetical order; it then crowds out the `pulsemcp` source, which *does* work. Raising
> `limit` makes results worse, not better. The servers below are proposed from prior
> knowledge, **not** confirmed against the registry — verify each package before installing.

Currently configured: **`ptah`** only (`.mcp.json`, http://localhost:51820).

| Server | Why | When |
|---|---|---|
| **Playwright MCP** (`@playwright/mcp`, Microsoft) | Drive a real browser with WebGL. The only way an agent can actually see whether the scene renders — jsdom cannot, and the canvas is invisible to text assertions. Highest value of any server here. | Before Phase 3 |
| **GitHub MCP** | CI runs, PRs, and Actions logs. GitHub hosts a remote endpoint; confirm the current URL from GitHub's own docs rather than trusting a third-party listing. | Phase 7 |
| **Postgres / Neon MCP** | Inspect the wall's schema and data during Phase 5. Not needed before then, since nothing else touches a database. | Phase 5 |

Ptah's browser tools (`ptah_browser_navigate`, `ptah_browser_screenshot`,
`ptah_browser_evaluate`) may already cover the Playwright case. Check those before adding a
second browser stack.

---

## How to apply

- **Skills:** enable the three `ptah-harness-*` plugins in Ptah's plugin settings. They are
  written to disk but inactive until enabled, and only register for a *new* session.
- **MCP servers:** verify each package first, then install via Ptah's harness UI or by
  editing `.mcp.json`. Newly installed servers also only reach a new session.
- **Agents:** the specialist list above is guidance for Stage B `/orchestrate` runs, not a
  config file — no action needed.
