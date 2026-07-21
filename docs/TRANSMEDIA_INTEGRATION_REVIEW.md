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
  **`migrate-from-studio.ts`** (studio JSON → nit v1; **NOT lossless** —
  adversarial sweep: it reads only entities/relationships/interactions/style/
  scratchpad and DROPS script, acts, timeline, assets, artifacts,
  generatedImages; see FINDINGS simplify-2/writepath-2). Not called by
  anything; `hashAssets()` unimplemented; no nit→studio back-translation.
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

> **⚠ SUPERSEDED BY §9** (the adversarially-verified architecture,
> 2026-07-20). §4 is kept as the historical first draft; where they disagree,
> §10 wins. The sweep disproved this section's central mechanism ("route the
> executor switch through emitOperation(); the blob stays the materialized
> view") — see `TRANSMEDIA_ADVERSARIAL_FINDINGS.md` schema-1, writepath-1,
> writepath-4, durability-1.

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

## 7. USAGE — what working with the system looks like

The mental model: **the world is a repository; every activity is a role
against it** — authorship, management, ingest, and distribution are all typed
commits on branches, differing only in who commits, on which branch, at what
autonomy dial.

### Authorship (three modes, one substrate)
- **Direct**: today's studio — workbenches + agent chat; edits mutate the
  working tree (the blob), and committing derives typed operations over the
  canon-graph subset (§9 — NOT "every action emits ops"); drafting = a
  working branch of the story graph, canon = a merge.
- **Review** (the writers-room mode — the microdrama gap, fixed): "new comic
  issue from the Aria arc" runs phase-by-phase and PAUSES at each boundary —
  beats → approve → page briefs → approve → NB2 pages → keep/reject/redo per
  page (the explore-candidate pattern) → publish gate.
- **Autonomous**: dream-class nightly runs with budget + QC (`watch_film`) +
  morning report → a review queue, not a surprise.
Modes compose per-production: the comic in `review` while the nightly
microdrama runs `autonomous`, against the same graph.

### Managing a narrative (gardening, not writing)
- **Arcs are intentions**: thesis + entities + target states spanning months;
  productions consume arcs; the arc tracks how much of it has become canon.
- **A canon review queue**: all incoming commits land on branches; managing =
  review the story-diff, run consistency, merge or bounce; trusted minor
  events auto-merge (dial).
- **Branches as creative instruments**: "what if James defected" is a branch
  you can produce against — merge it, abandon it, or keep both alive as
  grey/green loom timelines where divergence IS the story.
- Continuity policed by existing machinery (review_scene, storyDiff,
  consistency engine) pointed at the commit stream; temporal looks mean the
  system knows Aria has the scar from arc 2 onward.

### Ingest (everything becomes a commit proposal)
One path: **extract → dedupe against the graph → proposal commits on
`ingest/<source>` → reviewed/merged by dial.** Sources: documents/lore
(fixed import path), session audio (T2), external producers via
`commit_event` (T3 — the text adventure), social replies + Aureum rule side
effects (T6).

### Outbound (hooks subscribe to the commit stream)
Hooks filter on tags/ops/arcs/branches: merge-to-canon of scenes → queue
renders; nightly cron hook → dream_film + compose_comic over the day's
canon delta (*players play by day; canon renders by night*); commit tagged
`publish` → distribution connectors or a distributor agent (picks the frame,
writes the caption, times the post). **Posts are committed back as events**
— the world knows what it has said publicly; that is the T6 character-agent
substrate arriving early.

### A day in the life
Players run the text adventure Tuesday; events stream onto
`ingest/terminal`. At 2am the nightly hook composes 4 comic pages + a 45s
microdrama from the day's delta. Wednesday the queue shows: 12 events (10
auto-merged, 2 flagged — Aria in two places), 4 pages awaiting keeps, 1 clip
QC'd green. Keep 3 pages, repair one panel, resolve the Aria conflict by
FORKING it into a glitch-arc (conflict as content). Tag `publish`; the
distributor posts page 1; @AriaChen_89 answers a fan reply — ingested as
tomorrow's first event.

## 8. THE HUB UI — the studio is the front door for everything

**Rails become production-scoped.** Open a project (world) → pick a
**production**; its format decides the workbenches:
- **Film / microdrama / episode** → the EXISTING pipeline unchanged (story,
  world, storyboard, explore, production, timeline, takes, screening room).
  Opening a nightly microdrama and re-cutting its timeline needs ZERO new UI
  — dream output already writes real scenes/clips/timeline; T0a frees them
  from the one-film project.
- **Comic** → the one new workbench, assembled from existing parts: **pages
  grid** = the Explore-gallery pattern (keep/reject/redo per page = the HITL
  gate); **page detail** = the FrameDetailView pattern (full-bleed, prompt
  visible, repair = the SVG-bubble fallback); script side = the existing
  ladder with a page-brief final rung. The "comic agent" is the same studio
  chat with a `comic` phase in `TOOL_PHASES`.
- Shared across ALL productions in a world: entity album, temporal looks,
  style pin, taste memory, prompt ledger — the continuity moat, and the
  reason the hub must be one studio rather than per-medium apps.

**The one truly new surface: the Canon rail** — the world's inbox:
incoming branches grouped by source with staleness; click → the **diff as
story** (entities/scenes/relationship changes, contradictions flagged);
actions: **merge · bounce with note · fork into an arc** (conflict→content
button). Morning reports land here, deep-linking into the right workbench.

**Total new UI bill**: (1) production switcher (T0a — NOTE: the *UI chrome*
is small but the enabling server work is a pervasive accessor codemod, ~220
`.interactions` sites + 124 `getActiveProjectId` sites; see FINDINGS
product-3/writepath-3), (2) Comic rail (T1, derived components), (3) Canon
rail (T0b/T3 — requires a DURABLE pending-commit substrate that does not
exist yet; today's proposals are in-memory and reset per session, FINDINGS
product-1). Everything else is reuse.

## 9. FINAL ARCHITECTURE (v2) — adversarially verified, 2026-07-20

**Provenance**: 172-agent sweep (`TRANSMEDIA_ADVERSARIAL_FINDINGS.md`: 53
findings → 40 confirmed, 13 critical). Three architecture proposals from
forced stances (minimal-delta / log-purist / product-first), judged by 3
independent judges on different axes. **Winner: minimal-delta (25 pts) with
grafts from product-first (24.5) and log-purist (22).** This section
supersedes §4.

### 9.1 The one inversion that dissolves the critical findings

§4's mechanism — `emitOperation()` threaded through the executor switch,
"blob as materialized view of the op log" — is unbuildable as specced: the
op union covers ~6 of ~20 ProjectData collections; the seam misses 68
self-fetch writes + background jobs; two file writes can't be atomic; every
call would rewrite a 54MB blob. The fix is one move:

> **Ops are DERIVED, never emitted.** The blob stays authoritative (the
> working tree). At an explicit COMMIT BOUNDARY (a /commit action, a
> review-gate merge, the nightly scheduled trigger), the system snapshots
> the world/production and *computes* typed `GraphOperation[]` by diffing
> against the parent snapshot — only over the **canon-graph subset**
> (entities · relationships · scenes · frames · style · scratchpad),
> through explicit field converters (never bare Zod `.parse()`, which
> strips unknown fields), with a round-trip CI test as a hard gate.
> Hooks fire on commit diffs, never on raw saves. Ops can never diverge
> from the blob because they are a pure function of it.

**Two-tier vocabulary** (name it everywhere): the **Canon tier**
(entities/relationships/scenes/frames/style/scratchpad) is log-derived,
branchable, mergeable, hook-visible. The **Production tier** (timeline,
takes, explorations, production runs, script ladder, assets, artifacts)
stays blob-native and single-branch — visible on checkout, not as ops.
"Branch the film's timeline" is a stated limitation deferred past T4.

### 9.2 Core abstractions (six)

1. **World** (Project = World): `productionId` added *additively* on
   interactions/timeline/acts (NOT nested under productions[]), behind a
   `resolveProduction()` accessor defaulting to `productions[0]` — a
   mechanical ~220-site codemod. Entity album / temporal looks / style stay
   world-scoped (the continuity moat). World-level **`arcs[]`** with a real
   record: `ProjectArc { id, thesis, entityIds, targetStates, productionIds,
   branchName?, sourceCommitId?, status, canonProgress }` — this is the
   fork-into-arc substrate. Per-production `acts[]` KEEP their name; the
   colliding `ProjectAct.arc` description field renames to `throughline`.
2. **Commit = snapshot + derived diff**, wrapped in a write-envelope
   `{batchId, author(SERVER-stamped), timestamp, branch, tags}`. Unifies the
   studio's fake `commits[]`, the dormant `NarrativeCommit`, and g89le
   commits. Medium routing via `tags` (`medium:comic`) — NO medium-payload
   schemas (v1 ops are already typed; FINDINGS schema-5). Genesis commit per
   existing project (run the migrator once → ADD_* for the current graph) so
   the Canon rail's first diff isn't empty.
3. **Branch**: reuse the studio's EXISTING working snapshot commit /
   checkout / `findCommonAncestor` 3-way merge (server.ts:21880+ — it works;
   FINDINGS simplify-5), extended to diff scenes+relationships by PORTING
   algorithms from `NarrativeMergeEngine` — never importing it as a second
   engine. Add `isCanon` + `probability` fields (grey/green loom).
4. **Hook**: the existing `HookRegistry` bound to the commit-diff stream.
   Provenance loop-guard (hook-originated commits carry
   `origin:{hookId, sourceCommitId}`; refuse re-trigger on own origin);
   dispatch = fire-and-forget into the durable JobStore; persisted
   HookRunLog (observability); per-window budget gate; the "nightly cron" is
   a SCHEDULED trigger synthesizing an end-of-day pseudo-event into the same
   path.
5. **Connector + Principal** (policed egress): the connector is the SOLE
   credential holder (NitSecretsAdapter — outside the blob and the commit
   stream). Publish chain: moderate → disclose(AI) → rate-limit →
   impersonation-allowlist → post → record external post id (enables
   retraction/correction). `publish` tag settable only by a human studio
   action; global kill-switch; character-agents write to their own branches
   and NEVER hold platform credentials or publish tags (T6).
6. **NitStore** (durability substrate): atomic tmp+`fs.renameSync` writes +
   rolling `.bak`; per-project serialized write queue (`withWorld(id, fn)` —
   critical sections mutate short + synchronously; background jobs included);
   centralized id minting (uuid — kills the Date.now collision class);
   durable JobStore replacing ALL five in-memory job Maps; idle-TTL cache
   sweep. Held in reserve for scale: write-ahead log + `lastAppliedSeq`
   checkpoint replay, per-production scoped blob shards, log compaction (T4).

### 9.3 Amended decisions (supersede parts of §6)

| Was (§6) | Now | Why |
|---|---|---|
| Vendor full Aureum at T0 | **Defer to T6** (first real consumer) | No consumer sooner; speculative vendoring is dead weight (simplify lens) |
| Monorepo extraction now | **Defer to T5** (when MCP makes an external consumer real) | Stay monolithic; extraction pays rent only with a second consumer |
| Typed medium payloads in schema | **DELETED** — `Commit.tags` + `Production.format` config | v1 ops are already typed; payloads duplicated Scene/Frame (schema-5) |
| "Lossless migrator" | Migrator fixed to sweep ALL top-level keys into `extensions.studio.*` (structurally lossless), claim corrected | It drops script/acts/timeline/assets today (simplify-2) |
| emitOperation() at executor seam | **DELETED** — derive-at-commit-boundary | schema-1, writepath-1/4, durability-1 |
| Identity at T5 | **Minimal identity at T2/T3**: server-stamped AuthorRef from T0b; ownership gate on the two NEW surfaces (`commit_event`, connectors); full RBAC still T5 | External writes + auto-posting ship at T3 (security-1/4) |
| Temporal looks "by story-time" (unspecified) | `Scene.chronologyIndex` (branch-local story-time integer, distinct from `position`, defaults to it) + first-class `Entity.looks[] {label, ref, validFrom?, validTo?}` typed AND hashed; existing castLooks chain keeps working until T1 | Authoring-time anchors mis-resolve prequels (schema-4); looks must enter the content hash (schema-3) |
| Hash rule | All `extensions.*` namespaces treated UNIFORMLY; runtime-only fields marked at field level per NIT_FORMAT_SPEC §3.3 | canonicalize singling out `studio` makes hashes asymmetric (schema-3) |

Unchanged and re-affirmed: whole-page NB2 comics primary + composer/SVG
fallback; HITL phase gates; studio-as-hub; Canon rail (now with its REAL
prerequisite: a durable pending-commit substrate — today's proposals are
in-memory, product-1); untrusted ingest never auto-merges regardless of
dial, with an input-screening pass before extraction and
read/quarantine-branch-only agent access (security-2).

### 9.4 Build order (product-first framing — each phase ships something)

| Phase | Ships | Contents |
|---|---|---|
| **T0-SAFETY** (immediate, decoupled) | Data safety | Atomic write + backup + per-project queue; centralized id minting; durable JobStore |
| **T0a-WORLD** | Multi-production worlds | Additive `productionId` + accessor codemod; production switcher chrome; `arcs[]`/ProjectArc; acts under production |
| **T0b-COMMIT** | The Canon rail (v1) | Diff-deriver + converters + round-trip CI gate; genesis commits; write-envelope; durable pending-commit substrate; server-stamped authors |
| **T1-COMIC** | **The P89 canon comic** | `Entity.looks[]` + `chronologyIndex` promoted to typed/hashed; `compose_comic` (NB2 whole-page primary); per-page HITL; PDF export |
| **T2-INGEST** | **A real D&D session → arc → comic issue** | /commit scene-drop fix; ingest branches; EntityMergingService reconnect; server-minted external ids; audio transcript in front |
| **T3-REACTIVE** | **Play-by-day / render-by-night + distribution** | Hooks bound to commit stream; scheduled trigger; auto-merge policy table + digest cap (review-fatigue); Connector chain + retraction; HookRunLog; budget gates |
| **T4-FULL-NIT** | Real branches UX | hashAssets + content-addressing; merge extended to scenes/relationships; grey/green loom UI; diff-based commit storage; log compaction |
| **T5-MCP** | External citizens | mcp-server rebuilt over REST cores; principals + branch-scoped tokens; workspace extraction |
| **T6-ARG** | Character-agents | Graph-scoped MCP clients, own-branch-only; Aureum vendored (reflex layer); merge-conflict-as-arc |

### 9.5 Honest risks (carried from the winning proposal)

Commit friction starving canon (mitigated: nightly auto-commit); O(snapshot)
diff cost (mitigated: canon subset only); partial branch scope (timeline not
versioned until past T4); field-granularity last-writer-wins between human +
nightly on the same production (acceptable single-operator; revisit for
multi-user); whole-page NB2 quality unproven on P89 refs (fallback is the
hedge); social ToS/impersonation risk reduced but not eliminated —
autonomous publish stays gated on the retraction path existing.

## 10. Immediate next actions (per §9.4)

1. **T0-SAFETY** — atomic writes + backup + per-project write queue +
   centralized id minting + durable JobStore. Same-day-scale fixes,
   decoupled from everything, and they protect the creator's existing 54MB
   of work TODAY.
2. **T0a-WORLD** — additive `productionId` codemod + `arcs[]` + switcher.
3. **T0b-COMMIT** — diff-deriver + Canon rail v1.
4. **T1-COMIC** — the P89 canon comic battle test.

Carried unchanged: AtlasCloud key (Michael), wave-2 audit fixes, Wren battle
test, lore re-import (redo via the FIXED T2 ingest path — it never landed;
becomes the T2 fixture).
