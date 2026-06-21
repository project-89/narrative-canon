# Agent Operations — how many agents build this app across many sessions

**Status**: Living process doc. Read this second (after `STUDIO_DESIGN.md`).
**Author**: 2026-06-20.

This is the **operating system** for the project: how work is decomposed, how
context survives across sessions and agents, the design methodology, and the
session lifecycle. It exists because the studio is built by a series of agents,
each starting with NO memory of the last — so context must live in **durable
artifacts**, not in any one session's head.

---

## 1. Design methodology & principles (the constitution)

Every change should be checkable against these. They're the distilled values of
the project; violating one is a smell.

1. **Cinematic, not utilitarian.** Each surface commits to one focused thing.
   Full-bleed when focused. No modal-over-modal. Big images. The Frame workbench
   is the house style (top strip / left canvas / right tabs / bottom action bar).
2. **Agent-first.** Every capability is BOTH an agent tool and a UI surface. The
   UI explores the structure the agent builds. If only the UI can do a thing,
   that's a gap. The chat travels with the creator, sees focus, can act.
3. **Single source of truth for prompts; no invisible injection.** The agent
   writes the prompt; the model receives it verbatim (+ the project style
   directive). Every wrapper that gets added is visible somewhere
   (`actualPromptSent`, `referencesAttached`, `styleDirectiveApplied`).
4. **Snapshot + resync, not live-link.** Downstream stages snapshot upstream;
   edits stay isolated until an explicit resync. Never auto-propagate.
5. **Exploratory & non-destructive.** Coverage before commitment; promoting is
   explicit; nothing generated is ever lost (the generated-image registry).
6. **Style is an image leash, not text.** A pinned style-reference IMAGE beats
   any text spec (the model's realism bias wins otherwise). Style refs are
   `type:'style'`, never `'character'` (or they leak the reference's subjects).
7. **Thread `projectId` everywhere; preserve unknown fields at every map seam.**
   The two recurring classes of bug. See §5.
8. **Verify by behavior, not by greps.** Substitute real values, hit endpoints,
   check the actual result. A passing typecheck is necessary, not sufficient.

The creator (Michael) wants the tool to *feel* exploratory and directorial, and
redirects readily — favor short summaries + clear next-step questions over long
unprompted work.

---

## 2. The artifact system (where context lives)

Context survives in five durable places. Keeping them current IS the job, not a
chore on top of it.

| Artifact | Holds | Read when | Updated when |
|---|---|---|---|
| **`docs/STUDIO_DESIGN.md`** | Vision, pipeline, shipped log, roadmap, **gotchas ledger** (numbered), next-agent handoff. THE anchor. | Start of every session, top to bottom. | End of every session: shipped log + new gotchas + handoff. |
| **Per-feature design docs** (`docs/<FEATURE>_DESIGN.md`) | Full spec + decisions + a **STATUS banner** (design / building / shipped / shelved) for a big feature (Seedance, Explore). | Before touching that feature. | When the feature's status or design changes. |
| **Memory** (`~/.claude/.../memory/`) | Cross-session project state, the creator's preferences, the active creative thread. | Auto-loaded each session. | When the high-level state or the creator's intent shifts. |
| **The gotchas ledger** (numbered, in STUDIO_DESIGN) | Hard-won traps. Never repeat. | Scanned at session start; consulted when something "isn't taking effect." | Append a numbered entry whenever a non-obvious trap costs time. |
| **Git history** | The actual change record. Atomic commits, descriptive messages focused on the *why*. | `git log --oneline -40` at start. | Every logical unit of work → one commit with the `Co-Authored-By` trailer. |

**Rule:** if a fact matters to the next agent and isn't derivable from the code,
it goes in one of these — not in a session's working memory.

---

## 3. Task & context decomposition

- **Milestone → Phase (Pn) → Task.** A milestone is a creative goal (e.g.
  "explore flow"). A phase is a shippable slice (E1 curation backbone). A task is
  one logical commit with a clear DONE criterion.
- **DONE criterion is explicit and behavioral.** Not "implemented" but
  "typecheck delta 0 against baseline AND the behavior verified (endpoint hit /
  value substituted / cleaned up after)."
- **Size a task to one coherent commit.** If it needs two unrelated commits,
  it's two tasks.
- **The in-session task list** tracks active work (create at start of multi-step
  work, mark in_progress/completed honestly — never mark done with failing
  typecheck or partial work).
- **The roadmap** is the "Still pending" + handoff in STUDIO_DESIGN. Keep it
  honest: what's next, why, and any blockers/decisions awaited.

---

## 4. Session lifecycle (the protocol)

### OPEN (orient before touching anything)
1. Read `STUDIO_DESIGN.md` (shipped block + gotchas + handoff), the relevant
   feature design doc, and memory.
2. `git log --oneline -40` to see recent reality.
3. Establish the **typecheck baseline**: `npx tsc` server + UI, note the counts
   (currently ~156 server errors are PRE-EXISTING, mostly the benign Express
   route-overload `TS2769`). You measure your DELTA against this, never try to
   zero it.
4. Confirm the API is running and **reloaded** your code (gotcha #14: `tsx
   watch` reloads on source save; `.env` changes need a restart).

### WORK (build with discipline)
- Follow the principles (§1) and avoid the gotchas (§5).
- Make independent tool calls in parallel; prefer dedicated file/search tools.
- After each logical unit: typecheck (delta), and where it's an endpoint/flow,
  **functionally verify** — hit it with real values, read the result, and **clean
  up any test data you wrote to the creator's project**.
- Commit each logical unit atomically with a *why*-focused message.

### CLOSE (leave it better-documented than you found it)
1. Update `STUDIO_DESIGN.md`: append to the shipped log, add any new numbered
   gotchas, rewrite the handoff to point at what's actually next.
2. Update feature design docs' STATUS where it changed.
3. Update memory if the high-level state or the creator's intent shifted.
4. Commit the docs.

---

## 5. The two recurring bug classes (internalize these)

Most regressions in this codebase are one of these. Check them reflexively.

- **`projectId` not threaded** (gotchas #8, #15). The server falls back to its
  "active" project when `projectId` is omitted → reads/writes the WRONG
  project's data. EVERY client call that's project-scoped must pass `projectId`
  (body for POST/PATCH/PUT, query for GET/DELETE). Includes refetches.
- **Field-mapping seams drop unknown fields** (gotchas #16, #18). `mapScenesFromApi`
  (UI) and `loadProjectData` (server) reshape data field-by-field; a new field is
  silently dropped unless added to the seam. `loadProjectData` is now `...parsed`-
  safe for top-level fields; nested frame/scene fields still need the UI mapper.

Plus: **stale code/persistence** (gotcha #14 — confirm reload first when a
server change "isn't taking effect"), and **two-file style persistence** (gotcha
#23 — `styleAssetIds` in `projects` via `saveProjects`, assets in `projectData`
via `saveProjectData`; write both).

---

## 6. Multi-agent coordination (parallel work)

- **The design doc is the shared truth.** Agents working in parallel sync through
  it, not through each other. Before parallel work, the roadmap should name who
  owns which phase.
- **Worktree isolation** for agents that mutate files concurrently (avoids
  conflicts); the change merges back through normal git.
- **One feature, one design doc, one status banner** — so a second agent never
  re-attempts a shelved/blocked feature (e.g. Seedance multi-shot's BUILT-but-
  SHELVED banner).
- **Verification gates merges.** A phase isn't "done" until its DONE criteria are
  met and recorded — the next agent trusts the shipped log, so it must be true.

---

## 7. Anti-patterns (don't)

- Don't try to zero the pre-existing typecheck errors; measure your delta.
- Don't claim a feature works without a behavioral check (and cleanup).
- Don't add a UI-only capability with no agent tool (breaks agent-first).
- Don't inject prompt wrappers the agent/creator can't see.
- Don't auto-propagate across snapshot links.
- Don't re-attempt a shelved feature without re-reading why it was shelved.
- Don't leave the design doc/handoff stale at session close — the next agent is
  flying blind without it.
