# Transmedia Integration Review — pulling the pieces together

**Status**: `review` — full-codebase + prototype survey, 2026-07-20.
**Author**: Michael + Fable (3-agent parallel sweep: studio core · g89le engine · ingest/long-arc).
**Read with**: `docs/TRANSMEDIA_ROADMAP.md` (the vision), `docs/NIT_FORMAT_SPEC.md`, `g89le → /Users/parzival/workspace/oneirocom/project89/g89le` (NOT inside this repo).

## The finding in one paragraph

We have **three generations of the same idea**, nearly disjoint: (1) the
original narrative-canon engine in this repo (`src/core`, `src/git`,
`src/extractors`, `src/pipeline.ts`) — a real temporal-graph VCS with typed
commits, branches, merge/paradox resolution, a built hook registry, mature
chunked ingest + dedupe, AND a finished nit v1 format spec with a **lossless
studio→nit migrator** — all dormant, imported by nothing the studio runs;
(2) the **Narrative Studio** (`src/api/server.ts` + `ui/`) — the living,
production-hard film pipeline (~130 agent tools) on a **flat untyped JSON blob
per project** with placeholder commits/branches (every write hardcodes
`branch:'main'`), no hooks, no dedupe, single-film scope; (3) the **g89le
transmedia_engine** — a clean, tested TS monorepo (`packages/nit`, `aureum`,
`nit-aureum-adapter`, `pipeline`) that re-extracted generation 1, added the
Aureum rules engine and the tag-gated producer-consumer pipeline framework,
but is in-memory only with untyped commit payloads. Integration is not
"build the transmedia engine" — it is **wiring the studio's write path onto
machinery that already exists**, then adding the two genuinely missing organs
(long-arc container, deterministic comic renderer).

---

## 1. Inventory — what exists where

### A. This repo: the Studio (the living app)

- `src/api/server.ts` (~23k lines): ~130 agent tools dispatched by one switch
  (`server.ts:13616`), phase-scoped via `TOOL_PHASES`. Capability clusters:
  film production (produce_scene / review_scene / watch_shot / watch_film),
  explore/curate (Engine A + LX suite), dream / dream_film autonomous runs,
  taste memory + prompt-outcome ledger, music/score, export, entity album +
  looks, script ladder, acts + timeline (virtual chop), assets, diegetic
  artifacts (SCP reports, transcripts, myths — already a transmedia surface),
  `propose_*` canon tools.
- Persistence: `.narrative-data/project_<id>.json` — `ProjectData`
  (`src/storage/storage-adapter.ts:196`), mostly `any[]`. `commits`/`branches`
  are **fake VCS**: flat arrays, `branch:'main'` hardcoded at ~8 sites.
  Rich runtime shapes (scene.productionRun, scene.explorations,
  frame.videoTakes, castLooks, tasteProfile, dream state) ride untyped.
- `src/visual/comic-composer.ts` + `panel-generator.ts` **already exist**
  (panels → pages, layouts, gutters, AI composition) plus studio tools
  `generate_storyboard_page` / `extract_storyboard_panel` — comics are
  currently a storyboard byproduct, not a deliverable (no comic data model,
  no export, no phase).
- `mcp-server/`: stdio MCP over the *core* engine — **stale/broken** (imports
  two extractors that no longer exist). Reference only.

### B. This repo: the dormant engine

- `src/core/`: `TemporalNarrativeGraph`, `NarrativeRepository`,
  `NarrativeCommit`/`NarrativeBranch`/merge+consistency engines,
  `EntitySimilarityDetector`.
- `src/git/`: `narrative-git.ts`, typed `GraphOperation`s, `CanonicalEvent`,
  `TimelineBranch`, paradox resolver, **`src/git/hooks/`** — a complete
  `HookRegistry` + `RealityHook` system (`ENTITY_ADDED`, `SCENE_COMPLETED`,
  `COMMIT_CREATED`, `TIMELINE_DIVERGENCE`, `MERGE_COMPLETED`…) with
  generation-service interfaces (image/video/audio/lore/**layout**).
- **`src/git/format/v1/`** — the crown jewel: Zod schemas
  (content-addressed `Commit` with `parentHashes`, `GraphOperation`
  discriminated union, `BranchSummary.isCanon`, `AssetRef` sha256) +
  **`migrate-from-studio.ts`** (lossless studio JSON → nit v1, unknown fields
  preserved under `extensions.studio.*`). Not called by anything;
  `hashAssets()` unimplemented; no nit→studio back-translation.
- Ingest: `src/pipeline.ts` + `chunked-extraction.ts` + `src/extractors/`
  (entity/relationship/scene/interaction/state-change) +
  `EntityMergingService`. Mature, tested — bypassed by the studio.

### C. g89le (sibling repo, `/…/project89/g89le`)

- `04_wonderlab/03_prototypes/transmedia_engine/packages/`:
  - **`nit`** — re-extraction of gen 1 with hooks BUILT + tested
    (`hook-registry.test.ts`); `TimelineBranch{probability, isCanon}`;
    paradox strategies. Gap: in-memory only; `GraphOperation.payload: any` —
    the typed payloads (ScenePayload/FilmPayload/SessionPayload/BeatPayload)
    are **design-only** (DESIGN.md §2.2).
  - **`aureum`** — the most mature package: serializable ECS rules engine
    (tags/stats/links; rule = trigger→conditions→changes→side-effects;
    side effects collected, not executed — consumer registers handlers).
    Reusable as-is. This is the reflex layer.
  - **`nit-aureum-adapter`** — bidirectional bridge, working.
  - **`pipeline`** — producer-consumer framework: phases gate on nit commit
    **tags** (`requires`/`produces`), `PipelineRunner` + events. Framework
    only; no concrete pipelines.
- `04_wonderlab/03_prototypes/microdrama-studio/` (Python, heavily used):
  World→Story→Episode→Visual pipeline + a **writers-room debate
  orchestrator** (personas, generate/critique/revise) with deep canon-bridge
  hooks. Comic branch: per-page briefs → **whole-page generation via NB2 at
  2:3** with reference images + prior-page continuity checks. Real output
  (dozens of runs, comic.pdf). Weaknesses: canon commits partially
  unimplemented; video stub; in-memory canon.
- `02_production/comic/` — framework/series-plan docs (conceptual).
- `02_production/consistency_engine/` — grey/green loom timeline HTML/JSON
  prototype; conceptual parent of `TimelineBranch{isCanon, probability}`.
- `02_production/anime/character_visuals/` — Aria Chen / James Chen visual
  bibles + reference jpgs (note: NOT under 04_wonderlab as the roadmap says).

**Critical lesson from g89le comics**: nowhere in any codebase is there a
deterministic speech-bubble/layout engine — microdrama's comics work by
prompting the image model to render the whole page. Our
`comic-composer.ts` is the only programmatic-composition seed.

---

## 2. The five gaps, honestly

1. **No typed write path.** Studio mutations are direct blob writes; there is
   no operation stream, so nothing to commit, diff, branch, merge, or hook.
   Everything downstream (hooks, branches-as-arcs, external producers)
   blocks on this.
2. **No live hooks/events.** Two built hook registries exist (src/git/hooks
   and g89le packages/nit/hooks — same lineage); neither is bound to the
   studio. No webhook machinery in the server at all.
3. **Ingest is broken at the seams.** `/api/canon/import/commit` persists
   only entities+relationships — **extracted scenes are dropped** even though
   `SceneExtractor` produces rich scene structure and the book job returns
   it. Book jobs are in-memory (die on restart, never auto-commit). No
   audio/transcript path. The mature chunked-ingest+dedupe stack is
   disconnected; studio `propose_*` tools have no dedupe.
4. **Single-film ceiling.** `ProjectData` has ONE `script`, ONE `timeline`;
   `dream_film` = one film. No episode/season/campaign/arc container
   anywhere (not even in the nit v1 spec). Cross-production continuity
   (entity album, looks, style) exists ONLY because project = film; the
   moment we want film #2 in the same world, there is no home for it.
5. **Comics are a byproduct, not a medium.** Composer code exists but no
   comic data model, no `compose_comic` tool, no dialogue→bubble path, no
   PDF export, no phase.

## 3. Lineage decision (needed before building)

Two nit lineages exist. **Recommendation: this repo's `src/git/format/v1/`
is canonical for the FORMAT** (Zod, content-addressed, persistence-shaped,
migrator exists, lives where the data lives); **g89le packages are canonical
for the PATTERNS** we import: Aureum (vendor as-is later), the tag-gated
pipeline-phase model (reimplement thin against studio jobs), the adapter
convention. The v1 spec needs two extensions g89le proved out:
`TimelineBranch.probability` + typed medium payloads (ScenePayload /
FilmPayload / SessionPayload / ComicPayload) — closing g89le's own
`payload: any` gap in the canonical schema.

## 4. Integration plan — seams mapped to roadmap phases

Ordered so each step ships value alone and nothing bypasses the graph (G5).

- **T0 — SPINE (new, before T1): long-arc container + typed operations at
  the write seam.**
  a) Pluralize production: `ProjectData.productions[]` (each = script +
  timeline + exports + format tag `film|comic|episode`), project = the
  WORLD/campaign. Migration: existing script/timeline become
  `productions[0]`. Entity album/looks/style stay project-scoped → cross-
  production continuity falls out for free. Add `arcs[]` at project level
  (long-arc planning above any one production; scenes/productions link to
  arcs).
  b) Route the executor switch (`server.ts:13616`) and REST cores through a
  thin `emitOperation()` that appends typed `GraphOperation`s (v1 schema) to
  a per-project operation log alongside the blob write. Commits = batched
  ops. This is nit-ification without changing the read path — the blob stays
  the materialized view.
- **T1 — COMIC RENDERER** (unchanged, now with a home): `ComicPayload`
  production; panels = frames rendered with graph refs (the V2a resolver —
  no legacy bypass); deterministic layout via `comic-composer.ts` + SVG
  speech bubbles from `frame.dialogue` (grid-badge technique); page-at-once
  NB2 generation (microdrama-proven) as the alternate engine, behind the
  same `compose_comic` tool; PDF export next to export_film. Battle test:
  P89 canon comic with Aria/James refs from
  `g89le/02_production/anime/character_visuals/`.
- **T2 — SESSION INGEST**: fix the seams first (persist scenes at
  `/commit`; durable jobs on disk; auto-append to project with
  `EntityMergingService` dedupe — reconnect the dormant stack), then add
  Gemini native-audio transcript in front. Battle test: a real D&D session
  → appended arc → comic issue.
- **T3 — HOOKS**: bind `HookRegistry` (src/git/hooks) to the T0 operation
  stream; first hooks = the nightly render (on-commit → dream_film /
  compose_comic over the day's events), portrait-on-entity-add. Producer
  REST/MCP endpoint = `commit_event` (typed ops from outside).
- **T4 — FULL NIT**: content-addressed commits + real branches
  (`isCanon`/probability, grey/green loom UX per consistency_engine), merge
  via the existing `NarrativeMergeEngine`/paradox resolver. Merge conflicts
  surface as story beats.
- **T5 — MCP**: rebuild `mcp-server/` over the studio REST cores (not the
  dead core imports) — query/commit/produce/compose tools, per-agent
  identity. Every capability stays the triple: agent tool + UI + MCP.
- **T6 — ARG network**: character-agents = MCP clients with graph-scoped
  knowledge; Aureum vendored as the reflex layer (rules on the graph, side
  effects → commits).

## 5. What we do NOT build

- No second graph engine — the temporal-graph/merge machinery exists twice
  already; we wire, extend schemas, and delete the loser later.
- No deterministic layout engine beyond composer+SVG bubbles unless the
  hybrid comic engine proves insufficient.
- No polling — hooks from T3 on.
- microdrama-studio stays a reference (Python, other stack); we port its
  *patterns* (writers-room, page briefs, prior-page continuity checks) as
  agent prompts, not its code.

## 6. RATIFIED (Michael, 2026-07-20) — decisions + design deltas

The §3 recommendation is **locked**, with refinements:

1. **Lineage**: schema = THIS repo's `src/git/format/v1` (canonical, to be
   solidified); **Aureum = the FULL g89le package, vendored** — DSL, rules,
   evaluator, serializer, reflex (side-effect handler) model. Not patterns —
   the code.
2. **Persistence = modular adapter pattern**: nit storage behind a
   `NitStorageAdapter` interface (mirroring the existing
   `src/storage/storage-adapter.ts` file/Mongo split): file-JSON first, DB
   adapters pluggable. In-memory-only (the g89le blocker) dies here.
3. **Branching + graph exploration are first-class**: `parentHashes`,
   `BranchSummary{isCanon}` + g89le's `probability` field; the graph must be
   explorable (queries across branches, not just checkout-head).
4. **Flexible entities/metadata**: namespaced `extensions.<system>.*` on
   every node (already the migrator's convention — generalize it) so any
   consuming system (game, ARG, comic, social) can annotate without schema
   churn.
5. **Character references MUTATE as stories progress**: an entity's visual
   identity is *temporal* — looks/refs get validity anchors (arc / production
   / commit-range), and the graph-ref resolver picks the look by story-time,
   not just by label. "Aria after the scar" must resolve correctly per scene.
6. **Comic engine: whole-page generation is PRIMARY.** NB2 Pro renders text
   IN the image and produced genuinely good, consistent comics in the
   original pipeline (GPT-Image likely also capable). The
   composer+SVG-bubble path is the fallback/repair engine, not the lead.
   Same `compose_comic` tool fronts both.
7. **The real microdrama/comic gap was HITL between phases** (and
   multi-episode management) — not generation quality. So: the Autonomy Dial
   applies at PHASE granularity — in `review` mode the pipeline runner
   pauses at phase boundaries (world → story → pages → publish) and surfaces
   proposals/keep-reject gates in the UI; `autonomous` runs straight through
   with budget + QC. Multi-episode management = T0a `productions[]` +
   `arcs[]`.
8. **DISTRIBUTION (new)**: automatic social publishing through the system —
   on-publish hooks (commit tagged `publish` → connector posts) and/or
   distributor agents. Posts are themselves commits (events in the world),
   which is exactly the T6 character-agent substrate arriving early. Slots
   in at T3 (hooks) as the first *outbound* consumer.

## 7. Immediate next actions

1. Decide/ratify T0 (this doc → STATE.md decisions log).
2. T0a `productions[]` + `arcs[]` migration (the highest-leverage single
   change; everything else lands into it).
3. T1 comic renderer against the migrated model.
4. Ingest seam fixes (scene persistence + durable jobs) — small, sharp, and
   they unblock T2 whenever a session recording shows up.

Carried unchanged: AtlasCloud key (Michael), wave-2 audit fixes, Wren battle
test, lore re-import (redo via the FIXED ingest path — it never landed;
becomes the T2 fixture).
