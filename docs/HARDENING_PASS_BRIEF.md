# Hardening Pass Brief — scope, order, and guardrails

**For the agent executing the hardening/cleanup pass.** This brief scopes the
work recommended by the 2026-08-13 external review, ordered by
risk-to-benefit. Read `AGENTS.md` first, then this. The review's findings are
accepted; this document is the execution contract.

## Ground rules (non-negotiable)

1. **Work on a branch** (`hardening-pass`), merged to `main` only when its
   gates pass. Small, single-subject commits.
2. **The dev stack runs from this checkout** (`npm run dev` → tsx watch on
   `src/api/server.ts`). Saving that file live-reloads the running server.
   **Never edit `src/api/server.ts` while paid video jobs are in flight** —
   check `GET /api/narrative/jobs/active` first (want `active: 0`). Safer:
   do server work in a git worktree and merge.
3. **Never call paid generation endpoints or tools.** Anything that renders
   images/video/audio spends real money. Tests must mock the provider layer
   (`src/visual/*-generator.ts` boundaries). `dryRun: true` on
   generate-sequence-video is free and is the sanctioned way to test
   composition.
4. **Never write to `.narrative-data/`** except through the API against
   throwaway projects you create and delete. The worlds in there are the
   creator's real work.
5. **Gates for every commit:** `npx tsc -p . --noEmit` (root), same in
   `ui/`, `npm test`. A commit that moves any of these backward is reverted,
   not patched forward.
6. **Behavior before refactor.** Do not restructure code that has no test
   until you have first written a characterization test against its current
   behavior. This especially applies to the two monoliths.

## Phase 1 — Documentation reconciliation (safe, do first)

The docs are the control plane and they disagree with the code. One truth
pass, guided by two authoritative sources: `git log --oneline` since Aug 5,
and the NOW block at the top of `docs/STATE.md` (accurate, written 08-13).

- `docs/CREATOR_WALKTHROUGH.md` — "Seedance 2.5 unintegrated" is FALSE
  (backend `seedance-25` shipped @d5a4c94/@6766c29); the known-gaps list and
  Phase 6 need a 2.5 path.
- `docs/STUDIO_BIBLE.md` — predates FLUX 2/3, Seedance 2.5, creative-control
  gate, reference reels, provenance registry. Update the model/format
  sections and the doc map.
- `README.md` — Microdrama IS first-class server-side; fix.
- `docs/STATE.md` — roadmap table rows and verification ledger stop at
  Aug 1–5; append the 08-06→08-08 verification entries (they are described
  in the NOW block and in commit messages) and write a clean NEXT/BLOCKED.
- `docs/AGENT_OPERATIONS.md` — next-gotcha counter says 24, ledger reaches
  35; fix the counter and append any gotchas evidenced by the 08-06→08-08
  commits (poller orphan-write is gotcha material).
- `docs/AGENTIC_EDITING_REVIEW.md` — add a STATUS banner: Phases 2–3
  shipped @da280bd/@d4f6003; list what remains.
- Do NOT rewrite history or delete prior entries; demote to PRIOR, banner
  as superseded.

## Phase 2 — Tests for the 08-06→08-08 wave (the review's core gap)

The suite proves storage/canon but not the creative-control machinery. Add
Jest coverage, mocking providers, for:

1. **Generation approvals** — staging (gate intercepts paid tool → proposal
   persisted), decide approve/reject, `__approvedProposalId` server-side
   validation, rebase-staging under write conflict
   (`isProjectWriteConflict` both class and `code` marker).
2. **Sequence composition** — `composeSeedance25SequencePrompt` (ref jobs +
   exclusions, timed beats, `{ }` dialogue with language, single-identity
   line) and `composeH3SequencePrompt` density profiles (compact ~600ch/shot
   shedding order, `full` keeps labels), the 7000-cap preflight returning a
   measured `chunkPlan`, and the `voiceWarning` tripwire (fires only when no
   dialogue AND no narration).
3. **Job-store writes** — the @efbaff2 regression: after `onSubmitted`
   replaces the stored job (spread copy), completion/error must be visible
   via `videoJobs.get(jobId)` — status `done`, `videoUrl` set. This is the
   poller-death bug; it must never come back.
4. **Provenance** — `recordGeneratedImage` persists `referencesAttached` /
   `styleId` / `styleName`; the assets provenance join surfaces them. Fix
   the registry's declared TYPE to match (the review is right that the type
   lags the implementation) — type fix + test together.
5. **Cut plans** — `apply_cut_plan` / `revert_timeline` round-trip on a
   synthetic timeline; `refineSequenceCuts` fallback when detection fails.
6. **Style pins** — `toggle-style-pin` routes through `applyStylePin`
   (@3c9a2e1 split-brain): with a saved style active, pin/unpin mutates the
   saved style's set, response mirrors the resolved set.

## Phase 3 — Contract hardening (incremental, not a rewrite)

- Define a versioned `ProjectData` interface for the highest-risk seams
  ONLY: scenes/interactions, frames (incl. `visual_direction`,
  `videoTakes`), `sequenceTakes` (+`shotCuts`), `generationProposals`,
  `generatedImages`, `styleLibrary`, timeline items/tracks. Replace `any`
  at those seams; leave long-tail `any`s alone this pass.
- Add runtime validation (zod or hand-rolled guards) at mutation
  boundaries: project load, `saveProjectData`, timeline item POST/PATCH,
  proposal decide.
- Do NOT split `server.ts`/`page.tsx` this pass. Typed seams first; the
  monolith split is a later, separately-planned effort.

## Phase 4 — Tool-surface reduction (careful: agent behavior)

- Audit the 81 `always` tools. Target: a small always-pack (read/navigate/
  focus/answer), room packs for the rest. Mechanical criterion: a tool that
  mutates or spends is never `always`.
- Change the MAPPING tables only; do not delete tool implementations.
- After the change, run the existing agent smoke flows (see
  `docs/CREATOR_WALKTHROUGH.md` checkpoints) via `/api/narrative/debug/tool`
  with free tools to confirm no room lost a load-bearing capability.

## Phase 5 — Measurements and small fixes (bundled)

- Whole-world save latency: instrument `saveProjectData`, log >250ms saves
  with world size; report findings — do NOT implement compaction this pass,
  just produce the numbers and a proposal.
- The escaped `\n\n` in one chat message: find the composer emitting
  literal backslash-n (likely a template built in a `.replace` string) and
  fix.
- Unnamed icon buttons: add `aria-label`s in the studio shell and Style
  room.
- Preflight readiness warnings on approval cards ("no locked cast / no
  location ref / no product ref — expect drift"): server computes from the
  same data the Board uses; card renders it. Keep it advisory, never
  blocking.
- Microdrama in `ProductionsView` + `WorldTimeline` creation controls
  (server already supports the format).

## Explicitly OUT of scope for this pass

- New providers, formats, or capabilities.
- Splitting the monoliths.
- Storage compaction/migration (measure only).
- Anything touching paid generation, live worlds, or `.narrative-data`.
- Deleting "archaeological" exploration sets or any creator media.

## Definition of done

- All Phase 1 docs agree with `git log` and each other.
- Phase 2 tests exist, run in CI-less `npm test`, and fail if the guarded
  behavior regresses (verify by mutation: temporarily re-introduce the
  @efbaff2 orphan-write and watch the test fail).
- Root + UI typecheck at zero; `npm audit --omit=dev` clean in both.
- A closing STATE.md entry: what was hardened, what was measured, what the
  next pass should take up.
