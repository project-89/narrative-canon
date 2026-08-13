# AGENTS.md — start here

**You are an agent about to work on the Narrative Studio.** This is the single
entrypoint: what to read, how we work, where the roadmap and current tasks live,
and how to execute and update. It is a ROUTER — it points at the real docs so
nothing here can drift. Read it fully, then follow the links.

> **The studio in one line:** a cinematic, **agent-first** AI story-authoring
> tool — a writer and an AI agent build a film together from style → world
> (entities) → script → storyboard → production (scenes/shots) → video. The
> creator (Michael, m.sharpe@project89.org) wants it to feel **exploratory and
> directorial**; he redirects readily — give short summaries + clear next-step
> questions, not long unprompted work.

> This repo is the **Narrative Studio app** (`ui/` Next.js studio + `src/` TS
> API). It is NOT the broader Project 89 canon — ignore any reference to numbered
> `00_core…09_metamind` directories or a docs portal; those belong to a different
> repo.

---

## 1. Read these, in this order (the core documents)

| # | Doc | Holds |
|---|---|---|
| 0 | **`docs/STUDIO_BIBLE.md`** | **The whole system in one document** — goals, the five load-bearing ideas, domain model, UX tour, engineering architecture, workflows, gaps, roadmap, and the doc map. Read once for the full picture; it changes only when the system's SHAPE changes. |
| 1 | **`docs/STATE.md`** | **The live state — read this FIRST for "what do I do next."** Now/Next/Blocked, the roadmap with per-phase status, the half-done CHECKPOINT, the decisions log, the typecheck baseline, the verification ledger. Structured + queryable; the authoritative answer to "where's the roadmap + current tasks." |
| 2 | **`docs/STUDIO_DESIGN.md`** | THE anchor / narrative. Vision, the pipeline, the **shipped log**, the numbered **gotchas ledger**, and the **next-agent handoff** (prose). Read top to bottom. |
| 3 | **`docs/AGENT_OPERATIONS.md`** | How we work: the design **principles** (the constitution — single source), the durable-artifact system, task decomposition, the **session lifecycle (open / work / close)**, the two recurring bug classes, multi-agent coordination, anti-patterns. |
| 4 | **The active feature doc** | The big thing in flight has its own spec + STATUS banner: `docs/DIRECTOR_ROADMAP.md` (the current north star — the vibe-director gap analysis + V1–V5), `docs/EXPLORE_FLOW_DESIGN.md` (explore → curate → assemble, E1 shipped), `docs/SEEDANCE_MULTISHOT_DESIGN.md` + `docs/SEEDANCE_PROMPTING_GUIDE.md` (video, **built-but-SHELVED** for realistic faces — read the banner before touching). |
| 5 | **`docs/STORAGE_RECOVERY.md`** | The inspect-first operator runbook for archive, creation, paired canon/world publication, stale locks, and cold catalog loss. Read before touching `.archive-boundary` or recovery evidence. |
| 6 | **Memory** (auto-loaded) | Cross-session state + the creator's intent + the active creative thread. The `narrative-studio-state` note is the fastest orientation. |

Then: `git log --oneline -40` for recent reality. (`CLAUDE.md` is the project's
thematic framing, not the operational guide — this file is.)

---

## 2. Where the roadmap + current tasks live

- **Roadmap / what's next / what's blocked:** **`docs/STATE.md`** — the
  structured truth. Its **Now/Next/Blocked** + roadmap table is where you start.
  The prose version is the handoff at the bottom of `docs/STUDIO_DESIGN.md`.
- **Mid-task pickup:** `STATE.md` → **CHECKPOINT** (filled only when a prior
  agent stopped mid-flight; empty = start from NEXT).
- **In-flight this session:** the harness **task list** — create tasks for
  multi-step work; mark `in_progress` / `completed` honestly (never "done" with a
  failing typecheck or partial work).
- **Decisions already made:** `STATE.md` → **Decisions log** (locked choices +
  deliberate deferrals), plus a feature doc's locked-decisions block where it has
  one (e.g. the Seedance spec).

---

## 3. The methodology (short version; full version in `AGENT_OPERATIONS.md §1`)

The non-negotiables — every change should check out against these:

- **Cinematic, not utilitarian** · big images, full-bleed when focused, no
  modal-over-modal.
- **Agent-first** · every capability is BOTH an agent tool AND a UI surface. The
  UI explores the structure the agent builds.
- **One source of truth for prompts; no invisible injection** · the model gets
  the agent's prompt verbatim; every wrapper is visible (`actualPromptSent`).
- **Snapshot + resync, not live-link** · downstream snapshots upstream; never
  auto-propagate.
- **Exploratory & non-destructive** · coverage before commitment; nothing
  generated is ever lost (the registry).
- **Style is an image leash, not text** · pin a reference IMAGE; style refs are
  `type:'style'`, never `'character'`.
- **Verify by behavior, not greps** · substitute real values, hit endpoints,
  clean up test data you wrote to the creator's project.

---

## 4. How to execute (the loop)

**OPEN** → read §1 docs + memory + `git log`. Run `npm run typecheck`: API and
UI are both zero-error gates, enforced by CI. Do not create a numeric error
baseline. Confirm the API reloaded your code (`tsx watch` hot-reloads on save;
`.env` changes need a restart — gotcha #14).

**WORK** → follow the principles; **thread `projectId` on every project-scoped
call**; **preserve unknown fields at every map seam** (`mapScenesFromApi` in the
UI, `loadProjectData` in the server). After each logical unit: typecheck,
functionally verify any endpoint/flow with real values in a disposable project,
restore the previous active project, and **clean up test data**.
Commit each unit atomically (`why`-focused message + the `Co-Authored-By` trailer).
Treat a stale lock, tombstone, missing catalog/world, or unfinished journal as a
recovery incident: preserve evidence and follow `docs/STORAGE_RECOVERY.md`; never
delete `.archive-boundary` by hand or bootstrap over durable artifacts.

**CLOSE** → update **`docs/STATE.md`** (roadmap status, decisions, verification
ledger, and the CHECKPOINT if you're stopping mid-task), `docs/STUDIO_DESIGN.md`
(shipped log + new numbered gotchas + rewrite the handoff), the active feature
doc's STATUS, and memory if the high-level state shifted. **Commit the docs.**
The next agent trusts these.

### Run it
```bash
npm run dev        # API (:3088) + UI concurrently. API = tsx watch (hot reload on save).
npm test           # jest
npx tsc            # typecheck (repo root); also run inside ui/
npm run archive:recovery -- help  # guarded recovery entrypoints; inspect first
```
The running API/UI are a **living workspace**, not cleanup debris. Inspect and
reuse healthy dev processes; do not terminate them merely to leave a tidy shell.
Restart only when a change actually requires it, and report the interruption.
Env (`.env`): `GEMINI_API_KEY` (Nano Banana images + chat + Veo video) is the
core. Optional: `OPENAI_API_KEY` (GPT Image), `REPLICATE_API_TOKEN` (Seedance).
See `docs/STUDIO_DESIGN.md` → Setup notes.

### Key files
- `ui/app/studio/page.tsx` — the entire studio shell + every workbench (~23k
  lines, monolithic on purpose). Anchors: `FrameDetailView`, `EntityWorkbench`,
  `TimelineView`, `SceneDetailView`, `ExploreGalleryView`, `mapScenesFromApi`.
- `src/api/server.ts` — Express API + AI tool defs/executors + system-prompt
  assembly (~30k lines, 177 tools). Tools in `narrativeWorldTools`; executors in
  `createToolExecutor`; mode/medium scoping in `TOOL_PHASES` +
  `getToolsForPhase(activeRow, mode)`; canonization in `canonizeEventCore`;
  persistence in `loadProjectData` / `saveProjectData` / `saveProjects`.
- `src/git/format/v1/derive.ts` — the canon substrate: `deriveOperations`,
  `worldStateAt(t)`, `validateTemporalConsistency`. 25 round-trip tests.
- `src/storage/project-archive-boundary.ts`, `project-archive-recovery.ts`,
  `project-creation-journal.ts`, `project-publication-journal.ts` —
  cross-checkout ownership, crash intents, semantic canon/world proof, and
  exact-evidence recovery. Operator surface: `docs/STORAGE_RECOVERY.md`.
- `ui/components/studio/` — the only live component directory (`WorldTimeline`,
  `ComicPagesView`, `ProductionsView`, `StyleLibraryPanel`, …).
- `src/visual/` — `image-generator.ts` (Nano Banana), `gpt-image-generator.ts`,
  `seedance-generator.ts`, `grid-composer.ts`, `entity-portrait-generator.ts`.

### Where things are NOT
- `prototypes/timeline-warfare/` — the original game. Preserved, not maintained,
  outside the build/typecheck/test paths. Read its README before reviving it.
- `archive/` — pre-studio library code (extraction-era query engines, the Mongo
  layer, the old library entry). Outside the build. `archive/2026-07-studio-cleanup/README.md`
  flags the parts that are genuine prior art.
- Deleted outright: `mcp-server/` (a T5 rebuild over the REST cores is the plan,
  not a revival) and ~35 legacy UI routes. The UI is now `/studio`, `/stories`,
  `/chronicle`, and `/` → `/studio`.

---

## 5. The traps that recur (full ledger: `STUDIO_DESIGN.md` → gotchas)

- **`projectId` not threaded** (#8, #15) → reads/writes the WRONG project.
- **Field-mapping seams drop unknown fields** (#16, #18) → add the field to the
  seam or it silently vanishes.
- **Stale code** (#14) → if a server change "isn't taking effect," suspect
  reload/persistence FIRST.
- **Style two-file persistence** (#23) → `styleAssetIds` via `saveProjects` +
  assets via `saveProjectData`; write both.
- **Seedance rejects realistic faces** (#21) → don't re-attempt Seedance for
  photoreal; the pipeline is Veo + the chop/trim timeline.
- **Process-local ownership is not cross-checkout safety** (#31) → use the
  filesystem project/catalog boundaries and strict lock order. The boundaries
  are cooperative: a checkout on pre-boundary code checks none of them — stop
  it before sharing its `DATA_DIR` with new code.
- **Parseable JSON can still be data loss** (#32, #35) → missing/empty/corrupt
  authority fails closed; do not normalize or bootstrap it away.
- **Render registration advances CAS before attachment** (#34) → paid media
  uses the bounded stable-ID rebase helper; ordinary writes remain strict.

---

## 6. Where things stand right now

**The studio is WORLD-FIRST.** You land on the world — a chronology of canon
events with production lanes across it — and *descend* into a telling
(film/comic/episode), which swaps in that medium's rail. `/` opens `/studio`.

- **The transmedia spine is built**: `WorldEvent` on a story-time chronology,
  hashed into the nit ledger; `worldStateAt(t)`; `validateTemporalConsistency`;
  scenes ↔ events via `eventLinks`; **C3 canonization** — a gated, validated
  draft→canon flip (gate = creator|vote|rule, plus a temporal-conflict check that
  returns amend/retcon/bridge/fork).
- **The agent is scoped by mode + medium**: world-level = author canon and
  greenlight productions (no frame generation); inside a telling = that medium's
  tools and persona. A global system map rides in every mode, and calling
  `set_active_production` really moves the UI into that telling.
- **Media**: film (Veo single-shot + virtual-chop/trim timeline; Seedance is
  built-but-shelved — rejects realistic faces) and comic (`compose_comic`
  whole-page NB2 + HITL keep/reject + PDF export). *Shorts* and *microdrama* are
  intended but not yet real formats — `create_production` still coerces anything
  outside `film|comic|episode` to `film`.
- Style is a **saved, reusable** named style (world default + per-production
  override), locked by a pinned reference image.
- **Dramaturgy slice 1 is live**: production-owned framing/acts/beats, event
  claims, exact reorder, bind/resync, break into linked scenes, adoption, and
  the v1 board with a STORY_CRAFT persona.
- **The engineering floor is now enforced**: one canonical file store,
  cross-checkout project/catalog ownership, crash-recoverable archive/creation/
  canon publication, strict CAS + narrow render rebasing, semantic canon replay,
  local network/path boundaries, deterministic tests, zero-error root/UI types,
  Node 20 CI, production builds, and clean dependency audits. Mongo selection/
  migration is disabled until lossless.

**Next** is on the roadmap in `docs/STATE.md`: creator click-pass of the newest
rooms, Dramaturgy slice 2, entity draft→canon, sound/formats, source ingest, and
event-aware merge. Remote/multi-user deployment is blocked on auth. For live
detail, `docs/STATE.md` is authoritative; `STUDIO_DESIGN.md` is the prose mirror.
