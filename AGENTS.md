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
| 1 | **`docs/STATE.md`** | **The live state — read this FIRST for "what do I do next."** Now/Next/Blocked, the roadmap with per-phase status, the half-done CHECKPOINT, the decisions log, the typecheck baseline, the verification ledger. Structured + queryable; the authoritative answer to "where's the roadmap + current tasks." |
| 2 | **`docs/STUDIO_DESIGN.md`** | THE anchor / narrative. Vision, the pipeline, the **shipped log**, the numbered **gotchas ledger**, and the **next-agent handoff** (prose). Read top to bottom. |
| 3 | **`docs/AGENT_OPERATIONS.md`** | How we work: the design **principles** (the constitution — single source), the durable-artifact system, task decomposition, the **session lifecycle (open / work / close)**, the two recurring bug classes, multi-agent coordination, anti-patterns. |
| 4 | **The active feature doc** | The big thing in flight has its own spec + STATUS banner: `docs/DIRECTOR_ROADMAP.md` (the current north star — the vibe-director gap analysis + V1–V5), `docs/EXPLORE_FLOW_DESIGN.md` (explore → curate → assemble, E1 shipped), `docs/SEEDANCE_MULTISHOT_DESIGN.md` + `docs/SEEDANCE_PROMPTING_GUIDE.md` (video, **built-but-SHELVED** for realistic faces — read the banner before touching). |
| 5 | **Memory** (auto-loaded) | Cross-session state + the creator's intent + the active creative thread. The `narrative-studio-state` note is the fastest orientation. |

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

**OPEN** → read §1 docs + memory + `git log`. Establish the **typecheck baseline**
(`npx tsc` in repo root + in `ui/`) and compare against **`docs/STATE.md` →
"Typecheck baseline"** — the single source for the current counts (the errors are
PRE-EXISTING, mostly the benign Express `TS2769`; measure your DELTA, never zero
it). Confirm the API reloaded your code (`tsx watch` hot-reloads on save; `.env`
changes need a restart — gotcha #14).

**WORK** → follow the principles; **thread `projectId` on every project-scoped
call**; **preserve unknown fields at every map seam** (`mapScenesFromApi` in the
UI, `loadProjectData` in the server). After each logical unit: typecheck (delta),
functionally verify any endpoint/flow with real values, and **clean up test data**.
Commit each unit atomically (`why`-focused message + the `Co-Authored-By` trailer).

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
```
Env (`.env`): `GEMINI_API_KEY` (Nano Banana images + chat + Veo video) is the
core. Optional: `OPENAI_API_KEY` (GPT Image), `REPLICATE_API_TOKEN` (Seedance).
See `docs/STUDIO_DESIGN.md` → Setup notes.

### Key files
- `ui/app/studio/page.tsx` — the entire studio shell + every workbench (~20k
  lines, monolithic on purpose). Anchors: `FrameDetailView`, `EntityWorkbench`,
  `TimelineView`, `SceneDetailView`, `mapScenesFromApi`.
- `src/api/server.ts` — Express API + AI tool defs/executors + system-prompt
  assembly (~19k lines). Tools in `narrativeWorldTools`; executors in
  `createToolExecutor`; phase-scoping in `TOOL_PHASES`; persistence in
  `loadProjectData` / `saveProjectData` / `saveProjects`.
- `src/visual/` — `image-generator.ts` (Nano Banana), `gpt-image-generator.ts`,
  `seedance-generator.ts`, `grid-composer.ts`, `entity-portrait-generator.ts`.

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

---

## 6. Where things stand right now

Pipeline (Style → Story → World → Storyboard → Script → Production) on a left
icon rail. **Video = Veo single-shot + the virtual-chop/trim/splice timeline**
(Seedance multi-shot is built but shelved — rejects realistic faces). Entity
workbench is a **labeled album**; the agent picks looks per shot. Style is locked
by a **pinned reference image**. Assets are overhauled (every generation
registered; generated images are first-class). Dialogue + SFX now fold into Veo
prompts. **The next north star is the explore → curate → assemble flow**
(`docs/EXPLORE_FLOW_DESIGN.md`, phase E1 first). For live detail, the
`STUDIO_DESIGN.md` handoff is authoritative.
