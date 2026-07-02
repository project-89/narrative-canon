> ⚠️ **SUPERSEDED RELIC** — this doc predates the Narrative Studio and describes an earlier system. Do NOT use it for orientation; start at [`AGENTS.md`](./AGENTS.md) (adjust path from docs/: `../AGENTS.md`).

---
# PROJECT 89 DOCUMENT METADATA
doc_id: studio-handoff-2026-02-06-001
version: 1.0.0
last_updated: 2026-02-06
status: draft
author: Codex
contributors:
  - Parzival

# DOCUMENT RELATIONSHIPS
parent_docs:
  - doc_id: repository-agents-guide-001
    relationship: follows
child_docs: []
related_docs:
  - doc_id: world-builder-spec-001
    relationship: implements
  - doc_id: studio-implementation-notes-001
    relationship: extends

# CONTENT CLASSIFICATION
domain: production
sub_domain: narrative-studio
keywords: handoff, studio, narrative-git, style-presets, commit-preview

# SYNCHRONIZATION
last_sync: 2026-02-06
sync_notes: Captures current implementation state and restart context after repo split.
---

# Studio Handoff (Feb 6, 2026)

## Purpose
This handoff captures where Narrative Studio stands in the standalone repo and what the next
Codex session should continue immediately.

Repo for next session:
`/Users/parzival/workspace/oneirocom/project89/narrative-canon`

Primary product template:
`/Users/parzival/workspace/oneirocom/project89/narrative-canon/docs/WORLD_BUILDER.md`

## Critical Context Documents
- `AGENTS.md`
- `docs/WORLD_BUILDER.md`
- `docs/STUDIO_IMPLEMENTATION_NOTES.md`
- `docs/NARRATIVE_GIT_COMPLETE_GUIDE.md`
- `README.md`
- `NARRATIVE_WORKBENCH_PLAN.md`

## What Was Implemented In This Session

### 1) Project-level style system (narrative + visual)
- Added project style profile model and persistence through file + Mongo adapters.
- Added backend style normalization/merge helpers and default style profile.
- Added frontend style presets and first-run style setup modal for worlds without style config.
- Settings are now project-scoped (local storage key by project id) and persisted to
  `/api/projects/:id` as `styleProfile`.

Key files:
- `src/storage/storage-adapter.ts`
- `src/storage/file-adapter.ts`
- `src/storage/mongo-project-adapter.ts`
- `src/storage/index.ts`
- `src/api/server.ts`
- `ui/app/studio/page.tsx`

### 2) Global style injection into generation
- Chat now uses effective writing style = project style + per-request style.
- Scene image generation uses effective visual style.
- Frame image generation uses effective visual style.
- Entity portrait generation and preview use effective visual style.

Key file:
- `src/api/server.ts`

### 3) Portrait variation fix (duplicate outputs)
- Added explicit variation handling (`variation`, `forceRegenerate`) on
  `/api/narrative/visual/entity/:entityId`.
- Added variation directions to prompt text.
- Added cache bypass and unique cache keys/suffixes to portrait generation.
- Added unique output filenames per generation to prevent URL overwrite collisions.

Key files:
- `src/api/server.ts`
- `src/visual/entity-portrait-generator.ts`
- `ui/app/studio/page.tsx`

### 4) Frame grounding improvements
- Frame schema now supports `participantRefs` with body/action/pose/expression/placement.
- Frame breakdown prompt asks for participant reference metadata.
- Frame generation stores `participantRefs` and backfills with participant ids/names.
- Frame image generation prompt now includes:
  - global scene anchor
  - frame-specific focus
  - participant blocking/action notes
  - continuity instruction from previous shots

Key files:
- `src/api/server.ts`
- `ui/app/studio/page.tsx`

### 5) Scene/Frame image continuity improvements
- Reference selection now prefers latest portrait/location files (mtime sort) instead of arbitrary
  match order.
- Scene generation prompt includes frame anchor beats when available.

Key file:
- `src/api/server.ts`

### 6) Commit preview with readable story diffs
- Added `buildPendingCommitDelta()` utility.
- Added `GET /api/narrative/commit/preview`.
- Added classification for pending changes (`world`, `story`, `mixed`).
- Added `storyDiffReadable` payload with enters/exits/first appearances/location shifts/issues.
- Frontend adds `Review` button near commit controls and a commit preview modal.

Key files:
- `src/api/server.ts`
- `ui/app/studio/page.tsx`

### 7) Frame image race-condition mitigation in UI
- Changed frame-image apply logic to update from latest state (`setScenes(prev => ...)`) rather
  than stale closure object, preventing one completed frame image from wiping another.

Key file:
- `ui/app/studio/page.tsx`

## Build Validation Done
Executed in standalone repo:
- `npm run build:bundle` -> passed
- `cd ui && npm run build` -> passed

Note: Next build logs include existing dynamic fetch warnings around `/api/projects` usage during
static generation (`DYNAMIC_SERVER_USAGE`). Build still completes.

## Exact Files Touched
- `src/api/server.ts`
- `ui/app/studio/page.tsx`
- `src/storage/storage-adapter.ts`
- `src/storage/file-adapter.ts`
- `src/storage/mongo-project-adapter.ts`
- `src/storage/index.ts`
- `src/visual/entity-portrait-generator.ts`
- `src/visual/types.ts`

## Product Direction (How This Should Work)

### Core operating model
Narrative Studio should feel like one creative surface, not tools stitched together.
- User thinks in story intent.
- System translates intent into graph diffs over time.
- User sees intuitive outputs (scenes, frames, entities, images), not infrastructure.

### Story vs world distinction (critical)
- World graph = static and slowly evolving substrate of entities/relationships.
- Story graph = ordered sequence of scene-level graph diffs over time.
- A scene is not just prose; it is a mutation step with continuity implications.

Implication:
- Reordering/inserting scenes must be treated as timeline rewrites with consistency checks.
- Commit UX must expose both human-readable story diff and continuity impact.

### Collaboration standard for the AI
The assistant should be:
- Grounded: answers from selected context and current graph state.
- Generative: proposes new possibilities when asked for creativity.
- Conservative on facts: no invention when user asks factual questions.

### Visual generation standard
- Entity references are canonical anchors.
- Scene/frame prompts must preserve those anchors and explicit body/action constraints.
- Variation controls should produce meaningful diversity without identity drift.

## Gaps / Risks Still Open
1. Scene drag-reorder conflict UX is not fully implemented in this patch set.
   - Need preview/apply endpoints and UI conflict resolution flow if not already present on another
     branch.
2. Commit preview modal currently focuses on readable diff; it does not yet support selective
   staging/cherry-pick.
3. Style preset setup is implemented, but no dedicated world-creation wizard flow yet.
4. Need runtime validation with real generation calls for:
   - portrait variation distinctness
   - frame participantRefs fidelity
   - scene continuity after multiple insertions

## Recommended Next Work Order
1. End-to-end runtime test pass (`/studio`) with real generation, verify the three high-value flows:
   portrait variations, frame grounding, commit preview readability.
2. Implement scene strip drag-reorder with conflict preview/apply endpoints and optional branch fork
   suggestion when consistency cannot be repaired automatically.
3. Add continuity guardrail after scene edits/reorders:
   - auto-run story consistency
   - show fix suggestions
   - allow branch creation as fallback.
4. Tighten model prompts for factual-vs-creative mode switching and selected-context reporting.

## Fresh Session Bootstrap Prompt
Paste this in the new Codex session rooted at
`/Users/parzival/workspace/oneirocom/project89/narrative-canon`:

```text
Load and follow:
- AGENTS.md
- docs/WORLD_BUILDER.md (primary product spec)
- HANDOFF_STUDIO_2026-02-06.md (current implementation state)

Then do this in order:
1) Run a focused technical audit of /studio end-to-end flow (prompting, selection grounding,
   tool use, scene/frame/image generation, commit preview).
2) Validate that recent patches are functioning in runtime, not just builds.
3) Continue implementation on scene drag-reorder with continuity/conflict detection and optional
   branch fallback when conflicts cannot be resolved.
4) Keep UX simple and collaborative, with narrative git complexity hidden under the hood.

Return findings first (bugs/risks), then concrete patches.
```

## Notes On Working State
This repo already has unrelated local modifications and untracked files.
Do not reset/revert broad workspace state. Work surgically in touched files.
