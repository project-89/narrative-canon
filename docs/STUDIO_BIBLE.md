# THE STUDIO BIBLE — the transmedia studio, whole

> **The one document that holds the entire thing**: what the studio is for, how
> it's experienced, how it's engineered, every moving part, and where it's
> going. Everything else in `docs/` is a deep-dive on one slice; this is the
> map of the territory. When this and a slice doc disagree, the slice doc is
> probably fresher on its slice — fix both.
>
> Live status (what shipped this week, what's blocked) lives in `STATE.md`, not
> here. This document changes when the *shape* of the system changes.

Last full revision: 2026-07-31.

---

## 1. The goal

**One world, many tellings.** The studio exists so a single narrative world —
its cast, places, relationships, visual identity, and above all its
**chronology of canon events** — can be expressed as many productions across
many media (film, comic, episode, shorts, microdrama, and eventually stranger
things: character social accounts, a living card game) without fracturing.

The engineering claim is narrow and testable: **a narrative is a versioned
graph of events in story time, and coherence across tellings is something you
can actually check.** Everything else in the studio is leverage built on that
claim.

This is infrastructure for Project 89. What the worlds are *for* is the work,
not the code.

**The experiential goal** (Michael, 2026-07-31): building a world should feel
like *exploring* one — the creator discovers grit and texture as they author,
trials an actor playing a scene, feels the world push back. The agent is a
**companion who knows filmmaking** — finds the pacing, gets the filler shots,
writes dialogue *with* you, knows what the world is missing — never a generic
scene generator. Every room is a different ALTITUDE on one thing; moving up
and down is intuitive; every level stays connected to every other; nothing
generated is ever unfindable. A control nobody uses or a phase that doesn't
connect is debt, not furniture. The measure of the transmedia structure is
exactly this: **everything remains connected to everything else.**

## 2. The five load-bearing ideas

Everything in the system derives from five decisions. Understand these and the
rest of the architecture is predictable.

### 2.1 Two clocks
There are two kinds of time, and conflating them is *the* bug this system was
built to avoid:
- **Transaction time** — when an author changed something. The commit ledger
  (`nit`), ordinary version control.
- **Valid (story) time** — when something happened *in the story*:
  `WorldEvent.chronologyIndex`.

A prequel written today happens early in story time. "What does this character
know at t=7?" is answered by folding events in **story** order
(`worldStateAt(t)`), never by reading the commit log. Branching a comic off the
middle of a film is safe because the consistency check runs on the story-time
fold.

### 2.2 Canon is earned
Nothing becomes canon by being written. A draft event enters canon only through
a **gate** (per-telling: `creator` — a human locks it; `vote` — a quorum,
scaffolded for the card game; `rule` — a predicate, scaffolded for Aureum) plus
a **temporal check** — canonizing must not introduce a contradiction that
wasn't already there. When it fails, the resolutions are *narrative*, not
technical: **amend** the draft, **retcon** canon, author a **bridging** event,
or **fork** the timeline.

### 2.3 Style is an image leash, not text
Text style specs lose to a model's realism/genericity bias. A **Style** is a
*(prompt + pinned reference images)* pair; the pinned images are the leash. The
whole Style Studio (§4.3) exists to search style space and lock that pair.

### 2.4 Agent-first, one implementation
Every capability is **both** an agent tool and a UI surface over one shared
core. The UI explores the structure the agent builds; a button press is a
deterministic REST call to the same core the agent's tool calls. The agent is
**scoped to where you stand** (§4.4): the world-level agent authors canon and
greenlights productions but cannot render frames; each medium's agent gets that
medium's kit and craft.

### 2.5 Nothing generated is ever lost
**Total archival**: every image and video from every path — one-off renders,
matrix plates, bench tests, clips, sequence videos, film exports — is recorded
in the project registry (`recordGeneratedImage`, 16 call sites) and surfaced in
the Generated tab. Exploration is never waste; curation means deciding what to
*pin*, not what to keep. Corollary: **snapshot + resync, never live-link** —
downstream copies upstream deliberately; edits don't silently propagate.

## 3. The domain model

The world is one JSON blob per project (`.narrative-data/project_<id>.json`)
plus a `projects` catalog. Key entities:

| Thing | What it is | Where |
|---|---|---|
| **Project = World** | The shared truth: entities, relationships, events, styles, assets, productions | `ProjectData` |
| **Entity** | Character/location/object; a *labeled album* of looks (portrait + `imageGallery` with labels like "in armor") | `entities[]` |
| **WorldEvent** | A story-time moment: `chronologyIndex`, participants, typed `stateChanges` (born/died/learned/…), `status: draft\|canon`, `timelineId` for forks, canonization provenance | `events[]` — **hashed canon tier** |
| **Production = Telling** | One expression in one medium: `format: film\|comic\|episode`, own scenes/script/timeline/pages, its own `styleId`, `canonGate`, autonomy dial | `productions[]` |
| **Scene → frames (shots)** | A production's dramatization; `eventLinks` tie scenes to the WorldEvents they dramatize — the transmedia link; `castLooks` lock wardrobe | `interactions[]` |
| **SavedStyle** | A named (visualPrompt + styleAssetIds) pair in the world library; productions bind by `styleId`; world `defaultStyleId` | `styleLibrary[]` |
| **Canvas** | The free-form spatial field: nodes are generations (image or VIDEO — video runs as a durable job the node resumes after reload), edges are wires that carry references (identity by default, click-flipped to style); nodes carry labels, can lock into entity albums (`entityRefs`), or be placed FROM structure with provenance (`source {kind, sceneId, frameId, entityId, sourceUpdatedAt}` — snapshot + resync, click-through back); agent placements/labels stage in `pendingAgentNodes/Edges/Patches` until the client adopts them | `canvas {nodes, edges, viewport}` — GET/PUT `/api/narrative/canvas`, POST `/canvas/place`, POST `/visual/render-video` |
| **Exploration set** | A persisted grid: engine (`style-matrix`/`mutation`/`breed`/`diversify`/scene-angles), candidates with labels/axes/lineage (`parentCandidateIds`), leash state | `explorations[]` (project) or `scene.explorations` |
| **Generated registry** | Every output ever made: url, kind (image/video), sourceType, prompt, backend | `generatedImages[]` |
| **Nit ledger** | The commit history of the canon graph — ops **derived at the commit boundary** by diffing snapshots; per-branch bases; round-trip hash gate | `.narrative-data/nit/<projectId>.json` |

**The canon substrate** (`src/git/format/v1/`): Zod schemas (v1.1),
`deriveOperations`/`applyOperations` (25 round-trip tests), `worldStateAt(t)`
(the story-time fold), `validateTemporalConsistency` (currently 2 rules:
participant-dead, duplicate-death — expanding this toward the 12-rule linter in
`MYTHOPIA_COMPARISON.md` is known headroom).

## 4. The UX

### 4.1 World-first shell
`/` opens `/studio`, which opens at the **world**: a Premiere-style stacked
timeline — the chronology ruler, a canon event track, and production lanes
spanning the story-time each telling covers, filled with content stills.
Branch-vs-main styling shows which tellings still carry un-canonized drafts.
The world rail: **Chronology · Canvas · Entities · Style · Assets · Productions**.

From any event you can greenlight a **new telling** (film/comic/episode);
entering one *descends* into that medium's workspace with its own rail (film:
Style/Story/Cast/Storyboard/Script/Explore/Canvas/Production; comic:
Story/Cast/Storyboard/Canvas/Pages). The World button (and browser Back) ascends.
Routes: `/studio`, `/stories`, `/chronicle` (redirect), and that's the whole UI.

### 4.2 Authoring surfaces
- **Event authoring** lives on the world timeline: inline title/description/
  notes, draft↔canon toggle (runs the real gate — conflicts show violations +
  the four resolutions + override), chronology stepper, participants with
  click-through, told-in coverage across productions, "canonize this telling"
  with dry-run preview and per-telling gate selector.
- **Entity workbench**: the labeled album; agent picks looks per shot.
- **Film**: script (10-stage surface) → storyboard → explore (angle coverage →
  curate → promote to shots) → production (per-shot render/animate via Veo,
  takes, virtual chop/trim timeline) → film export (ffmpeg, QC warnings).
- **Comic**: `compose_comic` whole-page generation (panels, balloons,
  lettering baked in) → keep/reject/redo per page → PDF export.
- **The Canvas** (every rail): the free-form room — double-click spawns a
  generation node, wires pipe upstream images into downstream renders as
  references (a wire is identity by default; clicking it flips it to *style*,
  which rides as a style-typed ref — no subject leak; wires into VIDEO nodes
  always ride plain). Dormant wires draw gray-dashed until their source
  resolves. Re-running a node preserves the old result as a sibling "take".
  Renders inherit the project style leash (a `leashed` chip; `raw` escapes).
  A node flips to **video** before first run: wired images become its
  references (H3 takes several — characters + a location into one clip), and
  the render is a durable job the node resumes across reloads. Nodes take
  **labels** (yours or the agent's); a resolved image **locks into an
  entity's album** ("this IS Aria") via the green button and keeps the link
  chip. **"From world"** places scenes (optionally fanned into their shots)
  or cast as snapshot nodes that stay provenance-linked — chip to jump back,
  resync compares clocks and says "already current", and source nodes are
  read-only (wire them into fresh nodes to riff). Shift-click or drag to
  multi-select; **Combine** spawns a node wired from the whole selection.
  Saves debounce with unload flush + a localStorage dead-letter for oversize
  bodies; the viewport persists too.

### 4.3 The Style Studio (the consistency engine's front door)
Default tab of the Style room; the loop it implements:

```
matrix (pure or LEASHED)  →  explore around/escape a basin  →  mutate/breed
   ↑                                                              ↓
   └── evolve/blend (LLM, prompt-space) ← adopt recipe + pin image
                          ↓
             Save as named Style → productions bind to it
```

Moving parts: matrix lab (editable plates, plate packs, leash-to-pins toggle);
exploration strips (persisted forever; per-candidate **recipe** viewer,
pin/mutate/breed/diversify; lineage badges); **diversify** two-mode (*around*
the basin — many distinct variations within a family, e.g. "anime" → gekiga/
OVA-watercolor/sakuga/60s-pop — vs *escape* to distant basins; recipe-only, no
image anchor, because the anchor is the gravity); **breed** with a default
anti-dominance litter (50/50 holding the realism midpoint, lean-A, lean-B);
**evolve** (LLM rewrites the working prompt per your direction at three
intensities); drag-drop upload (Midjourney refs auto-pin); pinned-refs strip;
**test bench** (editable prompt, NB2/Pro/GPT side-by-side, three style modes:
full / image-leash-only / raw, run history, pin-from-bench). Pinning stores the
image *and* archives its recipe on the asset; "Use as style prompt" adopts the
recipe; both halves + Save = a complete Style.

### 4.4 The agent
One chat, omnipresent, but **scoped by where you stand**:
- **World** → world-architect: authors events/entities/arcs/styles, validates
  chronology, greenlights productions (activating one *moves the UI* into its
  workspace). Media generators are denied here.
- **Film / episode** → director-DP-editor (coverage doctrine, directing loop,
  watch_shot — it watches its own clips with audio).
- **Comic** → page-director (pages/panels/gutters/lettering).
- **Style room** (any mode) → **Style Director**: matrices, mutation, breeding,
  diversify, pinning; sees the pinned refs as actual images; has **exploration
  memory** (`list_explorations` / `view_exploration` re-attach any past contact
  sheet).
- **Canvas** (any mode) → **Canvas Companion**: sees the field (`view_canvas`
  attaches the node images), generates freely (the exploration trio is
  un-denied here, as in the Style room), **places its keepers as nodes**
  (`add_canvas_node` — placements stage server-side and the open canvas
  adopts them live; `source` links placed structure), **keeps the field
  legible** (`label_canvas_node` — labels stage as patches and light the Bot
  badge on arrival), and graduates discoveries into structure only when
  something has earned it: `attach_image_to_entity` is the "lock this one as
  Aria's reference" move (existing url → labeled album entry, `makePrimary`
  optional), with `propose_entities` et al. admitted on the canvas row in
  *both* modes. `dream`/`check_dream` are un-denied on the world-level
  canvas — a dream launched from the canvas inherits the room and wakes the
  creator to new nodes on the field.
A medium-agnostic **system map** rides in every mode so the agent always knows
what modes exist and how to cross. Renders it makes stream into chat as tool
calls; work that outlives the turn shows in the **activity badge** (§5.4).

## 5. The engineering

### 5.1 Layout
```
src/api/server.ts     the API: REST endpoints, agent tools/executors,
                      system-prompt assembly, and job runners (still a large
                      monolith, now behind zero-error types and route tests)
src/git/format/v1/    the canon substrate (schemas, derive, worldStateAt,
                      validateTemporalConsistency, migrator)
src/git/              older narrative-git stack + hook registry (tested; seeds
                      the planned T3 reactive work)
src/extractors/ + pipeline.ts + chunked-extraction.ts
                      narrative extraction from raw text — live in the server
                      closure; the T2 ingest seed
src/visual/           image-generator (NB2/Pro), gpt-image-generator,
                      video-generator (Veo), seedance-generator (kept, gated),
                      film-exporter, grid-composer, portrait generator
src/storage/          authoritative file adapter; atomic writes; cross-process
                      project/catalog ownership; archive, creation, and paired
                      canon/world journals; semantic recovery; durable jobs.
                      The incomplete Mongo adapter is quarantined prior art
src/security/         local-service boundary: safe identifiers/filenames,
                      containment, loopback/origin helpers
src/llm/gemini.ts     the LLM adapter (chat, tools loop, text, video parts)
ui/app/studio/        the shell: page.tsx (22.3k lines) + 16 components
                      (WorldTimeline, StyleStudio, ComicPagesView,
                      CanvasStudio [@xyflow/react], ActivityIndicator, …)
prototypes/           Timeline Warfare — preserved ancestor, outside the build
archive/              pre-studio library layer — outside the build
```

### 5.1.1 Persistence and recovery

The complete file store is the only authority. Every project-scoped writer
loads a private fork carrying its durable revision and publishes through a
filesystem project boundary; catalog changes additionally take the catalog
boundary in project→catalog order. Ordinary stale writes are rejected with a
reloadable conflict. Media generation is the narrow exception: because render
registration advances the world before the caller attaches the result, a
bounded stable-ID mutation rebases only that known attachment onto a fresh fork.

Archive, project creation, and nit→world publication are journalled lifecycles.
Recovery validates the world structure, canon commit hashes/graph/operation
replay, branch snapshots, and latest world acknowledgement. Missing or corrupt
authority never normalizes to empty. Four inspect-first local CLIs require exact
evidence and retain recovery audits; see `STORAGE_RECOVERY.md`.

### 5.2 The render path (where consistency is enforced)
All roads lead to `/api/narrative/visual/render`:
- **Reference resolution**: `resolveShotReferences` reads the graph — cast
  (look-aware: per-call pick → frame → scene `castLooks` → primary), location,
  prior-shot continuity anchor.
- **Style resolution**: `resolveStyleForRender` (explicit styleId → the
  production's style → world default → legacy profile) attaches pinned style
  images typed `'style'` (never `'character'` — subject-leak), wraps the
  prompt in the locked-style directive, and appends a **trailing style
  reinforcement** (recency-weighted models bury a top-only block).
- The legacy UI endpoints (`/visual/frame`, `/visual/scene`) keep their own
  diagnostics engine but are **parity-injected** with the same look-awareness
  and style resolution (G5), so buttons and agent render identically.
- Every result reports `actualPromptSent` + `referencesAttached` — nothing is
  invisibly injected; drift is diagnosable, not mysterious.
- Attachment-capable generated-media paths publish the registry entry before
  stable-ID attachment. Paid artifact/storyboard routes make registration
  fail-closed; scene/shot/gallery/page attachment uses the rebase boundary above
  so a durable registry entry and unrelated concurrent edits survive together.

### 5.3 Background work
Long work runs as durable jobs (restart-recoverable): clip renders (Veo),
`produce_scene` runs (shot-after-shot, idempotent), comic composition, film
export (with ffmpeg QC), dream/dream-film autonomous loops, extraction.
`GET /api/narrative/jobs/active` aggregates them; the header **activity badge**
shows "N working" with per-job progress.

### 5.4 Providers & THE MODEL REGISTRY
Models are managed by a declarative registry (`src/config/model-registry.ts`) —
one table driving the server's dispatch, `GET /api/narrative/models` (which the
UI pickers read, with live/down status computed from present API keys), the
agent's system-prompt model table, and capability guardrails. Upstream model
IDs are env-overridable (`ATLAS_MODEL_<KEY>`), so an upstream rename is a
`.env` edit, not a deploy.

| Model key | Kind | Provider | Use |
|---|---|---|---|
| `nano-banana` / `-pro` / `-legacy` | image | Gemini | identity-anchored production renders (the default) |
| `gpt-image` | image | **AtlasCloud** (OpenAI direct is dead — billing) | best style-text obedience: matrices, diversify, multi-panel, text-in-image |
| `seedream` | image | AtlasCloud (ByteDance) | stylized/anime strengths; **never photoreal refs** (standing rule) |
| `veo` | video | Gemini | photoreal clips ≤8s with **native audio** (speaker-colon dialogue, no-subtitles clause) |
| `seedance-video` | video | AtlasCloud (ByteDance, $0.09/s) | animation/stylized motion ≤15s; **never photoreal refs** |
| `minimax-h3` | video | AtlasCloud (MiniMax) | ≤15s clips, T2V+I2V, photoreal OK; prompting playbook being learned (record_prompt_lesson) |
| (legacy `seedance` via Replicate) | video | Replicate | kept for reproduction; superseded by the Atlas path |
| Flux 3 multimodal | video | — | closed preview; 20s clips; add a registry row when open |

AtlasCloud API: one async pattern — `POST /model/generateImage` /
`generateVideo` → poll `/model/prediction/{id}`; `uploadMedia` for image
inputs; Bearer `ATLASCLOUD_API_KEY`. Client: `src/visual/atlascloud-generator.ts`.
Aspect control (live-verified): images honor **only** the `size` ("WxH")
param — `ratio`/width/height are ignored (`atlasImageSizeFor` maps the
project aspect per model); video takes `ratio` ("16:9"/"9:16"/"1:1").
Capability guardrails (photorealRefs/maxRefs) are **advisory**: violations
surface as `warnings` in the response rather than stripping refs, because
stylized refs are legitimate on the same models.

### 5.5 Quality reality (honest)
- **Typecheck**: API and UI are both zero-error gates. `npm run check` and
  GitHub CI enforce them; the old numeric error ratchet is dead.
- **Tests**: canon derivation/replay, real-SIGKILL storage recovery, two-checkout
  locking/CAS, local filesystem/network boundaries, checked canon mutation,
  project archival/export, render attachment rebasing, visual reference/style
  invariants, git, and pipeline behavior are covered. The 2026-08-01 gate is
  29 root suites / 344 passing (+22 intentionally skipped). UI behavior still
  leans on focused browser smoke tests rather than a component-test suite.
- **Build/dependencies**: CI installs both lockfiles, tests, typechecks, and
  builds on Node 20. Root and UI production audits were clean on 2026-08-01.
- **Monoliths**: `server.ts`/`page.tsx` are ~53k lines combined and growing;
  extract only around stable, tested domain seams.
- **Deployment**: this is a loopback-bound, single-user local service with no
  auth. Remote/multi-user deployment is explicitly out of bounds until an
  authentication and authorization layer exists.

## 6. Key workflows (end to end)

**Author a world → ship a telling → merge it back:**
1. World: create entities, author events on the chronology (or vibe them with
   the agent), lock a Style.
2. Greenlight: from any point on the timeline, create a production; the studio
   descends into its workspace; it inherits world cast + style.
3. Produce: film (script→storyboard→explore→shots→clips→cut→export) or comic
   (scenes→pages→PDF). Production-born events arrive as **drafts**.
4. Canonize: per-event or "canonize this telling" (dry-run first). Conflicts
   resolve narratively. The world timeline now shows the telling as part of
   main.

**Find a look (the style loop):** run a pure matrix (or ask the Style
Director) → *around*-diversify the plate with a pulse → breed the two best →
inspect recipes → adopt the winner's recipe + pin its image → Save as a named
Style → bind it to the production → bench it across models to confirm the
leash holds (image-only mode = the honest test).

## 7. Known gaps & the road

**Structural gaps (named, not hidden):**
- **Entities have no draft→canon lifecycle** — a production-born character
  lands in the shared world immediately. Events got their gate in C3; entities
  are the next slice of the same pattern.
- **Event-aware merge** is still a status flip, not a merge (C4/T4), and
  play-space isolation is history-only.
- `shorts` / `microdrama` formats still coerce to `film` in
  `create_production`.
- Audio: per-cut discontinuity; the one-music-bed-over-the-cut fix is specced,
  unbuilt.
- Agent parity: `diversify`/`evolve`/`blend` are REST-only (the agent works
  around via `explore_style`, but true tools are cleaner).
- The temporal linter has 2 rules; the Mythopia comparison lists ~12 worth
  having (`archive/…/query/consistency.ts` holds prior art).
- **Canvas v2**: node runs are a browser-held fetch, not a durable job (a
  closed tab loses the node's in-flight run — the render itself still
  archives); one canvas per project, shared across world + every telling (no
  named boards); no drag-from-assets/paste onto the field (the agent path —
  "place Aria's look on the canvas" via `add_canvas_node` — covers it
  meanwhile); no cost meter anywhere generation is invited.
- **Mongo mode is hard-disabled (the adapter remains a data-loss trap)**:
  `MongoProjectAdapter` persists a fixed whitelist of collections and drops
  current `ProjectData` fields. Runtime selection is forced back to the complete
  file store and the migration command refuses to run. Build a whole-document
  round-trip and migration proof before reconsidering it.
- **Remote/multi-user service boundary**: API/UI are loopback-only with explicit
  browser origins and constrained filesystem identifiers, but there is no auth
  or per-user authorization. `ALLOW_REMOTE_API=true` is a diagnostic escape
  hatch, not a deployment architecture.
- **Whole-catalog disaster recovery remains explicit operator work**: startup
  refuses a missing `projects.json` when any world/backup/archive evidence
  remains, but there is intentionally no automatic catalog reconstruction.
  Preserve the root and verified catalog backup; follow `STORAGE_RECOVERY.md`.

**Roadmap tracks** (detail: `TRANSMEDIA_ROADMAP.md`): **T2** ingest (external
narrative sources → draft events; extractors are the seed) · **T3** reactive
(hooks fire on canonization → generation → distribution; unblocked by C3) ·
**M2** character-authorship studio (one character across live social accounts)
· **M3** living card game (vote-to-canon gate + Aureum rules) · **C4/T4** true
merge · **T5** MCP exposure (rebuild over REST cores) · **T6** Aureum.

**Adjacent standard**: the **Change Record spec** (`CHANGE_RECORD_SPEC.md`,
v0.6) — the altitude-2 interchange format being ratified across ArgOS /
Mythopia / Aureum, with this studio's nit + events as one implementation. The
Mythopia comparison (`MYTHOPIA_COMPARISON.md`) frames the federation: they are
the story's *physics*, we are the story's *factory*.

## 8. The doc map (what to read for depth)

| Doc | Slice |
|---|---|
| `STATE.md` | **Live status** — now/next/blocked, baselines, decisions log. Read first each session. |
| `AGENTS.md` | How agents (human-directed Claude sessions) operate on this repo |
| `CLAUDE.md` | The short framing — what this is and why it's shaped this way |
| `HOW_IT_ALL_WORKS.md` | The layman's tour of the canon machinery |
| `CHRONICLE_DESIGN.md` | The event layer: two clocks, canonization, build slices |
| `TRANSMEDIA_ROADMAP.md` | The media-type pattern + T/M/C/S tracks |
| `TRANSMEDIA_INTEGRATION_REVIEW.md` | The verified v2 architecture (ops derived at commit boundary) |
| `DRAMATURGY_DESIGN.md` | Active telling-shape design; slice 1 shipped |
| `DIRECTOR_ROADMAP.md` | The film agent's craft stack (V1–V6) |
| `EXPLORE_FLOW_DESIGN.md` | Explore → curate → assemble |
| `STORAGE_RECOVERY.md` | Inspect-first archive/creation/publication/stale-lock incident runbook |
| `VIDEO_PIPELINE_PLAYBOOK.md` / `SEEDANCE_*` | Video prompting + the shelved multi-shot spec |
| `CHANGE_RECORD_SPEC.md` (+ reviews) | The interchange standard |
| `MYTHOPIA_COMPARISON.md` | The federation analysis |
| `PIPELINE_AUDIT_2026-07.md` | The July audit (G1–G5 — G5 since fixed) |

---

*Maintenance rule: this document describes the SHAPE of the system. When a
change alters the shape — a new room, a new lifecycle, a new provider truth, a
new load-bearing idea — update the relevant section here in the same commit.*
