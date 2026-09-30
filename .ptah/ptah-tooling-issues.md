# Ptah harness tooling — defect report

Observed during a Stage A workspace bootstrap on 2026-08-24, Windows 11, Ptah MCP server at
`http://localhost:51820` (stdio config in `.mcp.json`).

Ordered by severity. Each entry gives observed behaviour, a reproduction, why it matters to
an agent consuming these tools, and a hypothesis about the cause. Hypotheses are inferred
from tool output only — I have not read the Ptah source.

---

## 1. CRITICAL — `searchSkills` silently returns an empty array on upstream failure

### Observed

The **same query** returned 0 results and then 50 results, minutes apart, with no error
either time.

| # | Query (verbatim) | Result |
|---|---|---|
| 1 | `three.js webgl 3d shaders react-three-fiber` | `{"skills":[],"count":0}` |
| 2 | `threejs` | 50 results |
| 3 | `three.js` | 50 results |
| 4 | `threejs webgl` | 50 results |
| 5 | `three.js webgl 3d shaders react-three-fiber` *(identical to #1)* | **50 results** |

Call #5 is byte-identical to call #1. It returned `react-three-fiber` (1878 installs), the
full `enzed/r3f-skills` set (~1200 installs each), `emalorenzo/three-agent-skills`,
`threejs-impl-react-three-fiber`, and 40+ more — all directly on point.

So this is **not** a query-parsing bug. It is non-deterministic: a transient upstream
failure (network, timeout, rate limit, or a skills.sh 5xx) is being caught and converted
into a successful-looking empty result.

### Why this is the worst bug in the set

`{"skills":[],"count":0}` is **indistinguishable from a true negative.** An agent cannot
tell "the marketplace has nothing" from "the request failed."

Concretely, in this session: I concluded no Three.js skills existed, told the user so in a
written deliverable, and **authored three replacement skills** — work that was partly
redundant, since `r3f-best-practices`, `threejs-loaders`, `threejs-perf`, and
`react-three-fiber-patterns` already exist. A silent empty result did not merely fail; it
caused confidently wrong downstream work and a wrong statement to the user.

Any tool whose failure mode is "looks like a valid negative answer" will produce this class
of error repeatedly.

### Suggested fix

1. **Never map a caught exception to an empty result set.** Propagate it. Return e.g.
   `{"skills":[],"count":0,"error":"upstream_unavailable","detail":"..."}` — or, better,
   fail the MCP call outright so the agent sees a tool error rather than data.
2. **Distinguish the three states explicitly:** success-with-results,
   success-with-genuinely-zero-results, and failure. Consider
   `{"status":"ok"|"empty"|"error"}` in the payload.
3. **Retry idempotent reads** — 2–3 attempts with backoff — before surfacing failure.
4. **Log the upstream status code and latency** so intermittency is diagnosable.
5. Add a regression test that stubs the skills.sh client to throw and asserts the tool does
   **not** return a clean empty list.

---

## 2. HIGH — `searchMcpRegistry`: the `official` source ignores the query entirely

### Observed

Every query returns the same alphabetical head of the unfiltered catalogue:

| Query | First `official` results |
|---|---|
| `playwright browser automation` | `ac.inference.sh/mcp`, `ac.tandem/docs-mcp` |
| `postgresql neon database` | `ac.inference.sh/mcp`, `ac.tandem/docs-mcp` |
| `github` | `ac.inference.sh/mcp`, `ac.tandem/docs-mcp` |
| `postgres` | `ac.inference.sh/mcp` ×4 |
| `playwright browser` (limit 20) | `ac.*`, `ad.inside/*`, `ag.hood/*`, `agency.goji/*`, `agency.kesey/*`, `agency.lona/*`, `ai.1325/*`, `ai.aarna/*`, `ai.abmeter/*`, `ai.actwise/*`, `ai.adadvisor/*`, `ai.adeu/*` |

That last row is decisive: the results are in **strict alphabetical order** from the start of
the registry, with zero relationship to "playwright" or "browser". The `official` path is
fetching an unfiltered listing and slicing the first N.

### Contrast — PulseMCP works correctly

Query `postgres` at `limit: 4` returned genuinely relevant `pulsemcp` entries: `PostgreSQL`,
`SQL`, `A2DB`, `Lilith Gmail` (Postgres-backed). So the query *is* reaching PulseMCP and
being applied there. The defect is confined to the `official` source.

### Suggested fix

Check the request actually sent to `registry.modelcontextprotocol.io`. The likely cause is a
missing or misnamed query parameter — the registry's list endpoint takes `?search=<term>`,
and a call omitting it (or sending `?q=`) returns the unfiltered catalogue, which is exactly
the observed behaviour. Add a test asserting that a query for a known server returns that
server in the top results.

---

## 3. HIGH — `official` results starve every other source

### Observed

`limit` appears to be applied **per source**, but results are concatenated with `official`
first — so a caller's window is consumed by the least relevant source.

| Query | limit | Outcome |
|---|---|---|
| `postgres` | 4 | 4 `official` (irrelevant) + 4 `pulsemcp` (relevant) — 8 returned for limit 4 |
| `playwright browser` | 20 | 20 `official` (all irrelevant, alphabetical). **Zero** `pulsemcp` results shown |

Raising the limit made results *worse*: at 20, the relevant PulseMCP entries disappeared
entirely behind unfiltered alphabetical noise.

This compounds defect #2. Even after the query is passed correctly, unranked concatenation
will keep burying good results.

### Suggested fix

1. **Interleave or rank across sources** rather than concatenating — round-robin, or score by
   relevance and merge.
2. **Apply `limit` to the merged set**, not per source, so the contract matches the parameter
   name.
3. Drop zero-relevance results rather than padding the response to fill `limit`.

---

## 4. MEDIUM — Duplicate entries in `official` results

`ac.inference.sh/mcp` appears **4×** and `ac.tandem/docs-mcp` **3×** in a single response,
with slightly differing descriptions:

```
ac.inference.sh/mcp — "Run 150+ AI apps — image, video, audio, LLMs, 3D and more..."   (×2)
ac.inference.sh/mcp — "run any ai model. compose agents, stack knowledge..."           (×2)
```

Almost certainly multiple published **versions** of the same server, not deduplicated to the
latest. This wastes an already-scarce result window and makes the list read as noise.

**Fix:** group by server name, keep the newest version.

---

## 5. MEDIUM — `searchSkills` returns an empty `description` for every skills.sh result

Across roughly 200 results in this session, **every single skills.sh entry** had
`"description": ""`. Only `displayName` carries meaning, and it is a mechanical title-casing
of the id (`threejs-shaders` → `"Threejs Shaders"`).

This is a significant quality problem in its own right. It is *why* I judged the marketplace
as low-signal even when results did come back: with no description, an agent cannot tell
`threejs-perf` from `threejs-pro`, or judge whether `r3f-best-practices` covers render-loop
discipline. Install count becomes the only usable signal, which rewards popularity over fit.

Local plugin results, by contrast, do carry descriptions — so this is specific to the
skills.sh ingestion path.

**Fix:** populate `description` from the skill's `SKILL.md` frontmatter during ingestion. If
skills.sh's list API does not include it, consider fetching frontmatter for the top N results
before returning, or caching descriptions on first fetch.

---

## 6. MEDIUM — `proposeConfig` is not exposed

The task asked me to finish by calling `proposeConfig(isConfigComplete=true)`. It does not
exist in this session.

**Available harness tools:** `ptah_harness_search_skills`,
`ptah_harness_search_mcp_registry`, `ptah_harness_create_skill`,
`ptah_harness_install_mcp_server`, `ptah_harness_list_installed_mcp`.

**Not present:** any propose / apply / review surface.

`ptah.help()` lists these namespaces — none is `harness`:

```
ide, ide.lsp, ide.editor, ide.actions, ide.testing, workspace, search, context,
relevance, project, files, orchestration, ast, dependencies, diagnostics, json,
agent, corpus
```

I worked around it by writing the proposal to `.ptah/ai-team.md`, but this breaks the
intended review-then-apply flow: there is no way for an agent to hand a structured config to
the user for approval.

**Fix:** either expose `proposeConfig` as an MCP tool alongside the other harness tools, or
document that it is available only inside the Harness Builder UI — so an agent asked to call
it knows immediately rather than discovering the gap at the end of a long task.

---

## 7. LOW — `ptah.help('harness')` returns "topic not found"

Harness tooling is reachable as MCP tools but has **no `help` topic**, so an agent that
starts from `ptah.help()` cannot discover it, and one that starts from the tool list cannot
find the API-level surface. The two discovery paths do not agree.

**Fix:** add a `harness` topic to `ptah.help()` covering the five tools, their relationship,
and whether `proposeConfig` exists.

---

## 8. LOW — `createSkill`'s documented behaviour contradicts what happened

The tool description states:

> it does not register the skill into the current session; the skill becomes available after
> the plugin is enabled.

All three skills I authored (`r3f-scene-patterns`, `webgl-asset-pipeline`,
`qaa-elhamour-art-direction`) became **available in this same session** — they appeared in
the available-skills list on the next turn, without any plugin being enabled.

Whichever behaviour is intended, the two disagree. If auto-registration is intended, the doc
should say so (it is the nicer behaviour). If not, skills are leaking into sessions before
the user has enabled them, which is a consent issue.

Related: `createSkill` writes to `~/.ptah/plugins/` — **user-global**, not workspace-scoped.
A project-specific skill like `qaa-elhamour-art-direction` is meaningful only in this
workspace, but now loads everywhere. A `scope: 'workspace' | 'user'` parameter would fix this.

---

## 9. LOW — Uninformative fields on skill results

- `invocability` is `"unknown"` on **every** result — it carries no information.
- `count` is exactly `50` on every non-empty response, with no `total` and no pagination
  cursor. There is no way to know whether 50 is the whole result set or the first page of
  hundreds, and no way to reach the rest.

**Fix:** return `total` alongside `count`, add an `offset`/`cursor` parameter, and either
populate `invocability` or drop it.

---

## Priority

| # | Issue | Severity | Why |
|---|---|---|---|
| 1 | Silent empty on `searchSkills` failure | **Critical** | Causes confidently wrong agent output; indistinguishable from a real answer |
| 2 | `official` MCP source ignores query | High | Registry search is effectively non-functional |
| 3 | `official` starves other sources | High | Higher limits return worse results |
| 5 | Empty skill descriptions | Medium | Removes the main relevance signal for agents |
| 6 | `proposeConfig` missing | Medium | Breaks the documented propose→approve→apply flow |
| 4 | Duplicate registry entries | Medium | Wastes the result window |
| 7 | No `harness` help topic | Low | Discovery paths disagree |
| 8 | `createSkill` doc vs behaviour; global scope | Low | Consent and scoping concern |
| 9 | `invocability` / no pagination | Low | Minor |

**Fix #1 first.** The others degrade result quality; #1 produces plausible, confident, wrong
work — and it did so in this session, in writing, to the user.

---

## Note on a non-Ptah issue

`nx graph --file=/tmp/graph.json` on Windows resolved to
`C:\Users\abdal\AppData\Local\Temp\graph.json` and silently read a stale `graph.json` left
there by an unrelated project, producing a completely wrong dependency graph. That is my own
path-handling mistake under Git Bash on Windows, not a Ptah defect — recorded only so it is
not mistaken for one.
