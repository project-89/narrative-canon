# STATE — the live project state

> **The single queryable source for: where we are, what's next, what's blocked,
> what's decided, what's verified.** Read at session OPEN; update at session
> CLOSE. The narrative version lives in `STUDIO_DESIGN.md`'s handoff — THIS file
> is the structured truth. If they disagree, this one wins for *"what do I do
> next,"* and you should fix both.

**Last updated:** 2026-06-20 · **by:** Claude (Opus 4.8)

---

## Now / Next / Blocked

- **NOW:** **Explore flow E1 — SHIPPED (code-complete, verified server+REST; one
  browser pass pending).** Per-angle coverage gallery: explore → curate → promote.
- **NEXT:** (1) **Browser-verify E1** — click through the Explore phase in a
  connected Chrome (the only unrun check; extension was disconnected this session).
  (2) Then **E2** (Seedance explore-from-image) — **gated on adding ffmpeg** (the
  `video-frame-extractor`), or pick up E3 fidelity items / E1 polish.
- **BLOCKED / AWAITING:** nothing blocking. E1 decisions #1/#2 were resolved in the
  doc and implemented (Explore peer phase; promote = non-modal assembly bar).

---

## Roadmap (phases + status)

Status enum: `design · building · review · shipped · shelved · blocked`

| Phase | What | Status | Entry point |
|---|---|---|---|
| P1 | Seedance single-shot backend (Replicate) | **shelved** (built; rejects realistic faces — gotcha #21) | `src/visual/seedance-generator.ts` |
| P2 | Virtual chop + in/out trim/splice timeline | **shipped** | `ui/app/studio/page.tsx` → `TimelineView` |
| P3 | Multi-shot sequence + proportional chop | **shelved** (built; depends on Seedance) | `generate_sequence_video` in `server.ts` |
| — | Veo 3.1 single-shot (Animate) + dialogue/SFX audio | **shipped** | `server.ts` Veo path (~line 6336) |
| P4 | Cut detection ("snap to cuts") + MP4 export | **design** | `SEEDANCE_MULTISHOT_DESIGN.md` (ffmpeg) |
| **E1** | **Explore: curation backbone + Engine A (per-angle)** | **shipped** (browser pass pending) | `server.ts` cores+tools+REST · `ExploreGalleryView` in `page.tsx` |
| E2 | Explore: Engine B (Seedance explore-from-image) | design (next) | `EXPLORE_FLOW_DESIGN.md` — **gated on ffmpeg frame-extractor** |
| E3 | Explore: upscale / re-explore / video-as-input | design | `EXPLORE_FLOW_DESIGN.md` |

---

## CHECKPOINT (half-done handoff)

> Fill this ONLY when stopping mid-task. Empty = clean stopping point; the next
> agent starts from **NEXT** above.

- **Task:** —
- **State:** _(none — clean)_
- **Entry point** (`file:line` + command + what to look for): —
- **Awaiting decision:** —
- **Failing checks:** —

---

## Decisions log (locked choices + deliberate deferrals)

Append-only. Don't re-litigate these without re-reading the "Why."

| Date | Decision | Why | Status |
|---|---|---|---|
| 2026-06-20 | **Seedance shelved for photoreal** | Image-scan rejects realistic faces (even AI) at E005 before reading the prompt; grid-only cleared the sensitive gate but hit the likeness gate. Pipeline = Veo + chop/trim. Plumbing kept for a future stylized project. | active (gotcha #21) |
| 2026-06-20 | **Virtual chop, not physical** | One source mp4 per sequence; clips carry `{sourceVideoUrl,inSec,outSec}`; viewer seeks the range. ffmpeg only at MP4 export (P4). | active |
| 2026-06-20 | **Style = a pinned reference IMAGE** | NB2's realism bias beats any text style spec; style refs typed `'style'` not `'character'` or they leak subjects (gotcha #22). | active |
| 2026-06-20 | **Explore E1 task #1 = the `mapScenesFromApi` seam** | `scene.explorations` rides inside `interactions[]` and survives `loadProjectData` (`...parsed`, server.ts:248) + restart, but the UI whitelist `mapScenesFromApi` drops it until a branch is added (gotcha #16 class). | DONE (E1 — seam landed; `applyStoryGraphDiffs` spreads `...scene` so the GET preserves it too) |
| 2026-06-20 | **E1 render path = self-fetch `/render`, not a refactor** | `explore_scene_angles` mirrors `add_related_shot` (self-`fetch` to the `/render` endpoint) rather than extracting a `renderImageInternal`. Lowest risk, matches house convention, no change to the working render path. | active |
| 2026-06-20 | **E1 surfaces = both, one core** | Each operation (explore/keep/promote) has a shared core called by BOTH the agent tool AND a REST endpoint (the UI uses REST deterministically, no LLM-in-the-loop for a button). Honors agent-first. | active |
| 2026-06-20 | **ffmpeg is an E2 gate, not E1** | E1 is per-angle renders only ("no Seedance, no ffmpeg"). Frame extraction from a Seedance mp4 needs a video decoder (`sharp` is image-only); add `@ffmpeg-installer/ffmpeg` + `src/visual/video-frame-extractor.ts` at E2. | active |
| ~2026-05-28 | **Assets-as-drawer: DEFERRED (polish)** | The bottom-rail Assets view works; the slide-in drawer is low-friction polish, not blocked. Skip until it's the best use of a session. | active (defer) |

For the 5 LOCKED Seedance decisions (chop fidelity, virtual/physical, run
selection, coexistence, provider), see `SEEDANCE_MULTISHOT_DESIGN.md` →
"Locked decisions."

---

## Typecheck baseline (measure your DELTA, never zero it)

| Target | Baseline | Notes |
|---|---|---|
| Whole project (repo root `npx tsc -p .`) | **204 errors** | Was 201 pre-E1; E1 added 3 benign Express route-overload `TS2769` (one per new route). |
| `src/api/server.ts` only | **147 errors** | **118 are `TS2769`** (benign Express overloads); **29 are real** and PRE-EXISTING. Measure your delta against the **29 real** + the TS2769 count. |
| `ui/` (`npx tsc` in `ui/`) | **0 (clean)** | Keep it at 0. |
| Last measured | 2026-06-20 (post-E1) | The docs' old "~156" was stale; these are real. Re-measure at OPEN. |

---

## Verification ledger (what's actually been behavior-checked)

Sign with agent + date. The next agent trusts the shipped log only as far as
this ledger backs it.

| Date | Flow | Verified how | By |
|---|---|---|---|
| 2026-06-20 | P2 virtual chop PATCH round-trip | Real PATCH; clip plays `[inSec,outSec)`; survives reload | Claude |
| 2026-06-20 | P1 Seedance lifecycle | Full create→poll→download on Replicate | Claude |
| 2026-06-20 | P3 grid-only run | Exposed the copyright gate (the shelve verdict) | Claude |
| 2026-06-20 | Assets from-url categorize/pin/unpin/dedup | Real calls; cleaned up test data | Claude |
| 2026-06-20 | Style-ref type change (`'style'`) | Re-render; subject-leak gone | Claude |
| 2026-06-20 | **E1 explore_scene_angles (agent path)** | Chat → 3 candidates rendered + registered + persisted to `scene.explorations` | Claude |
| 2026-06-20 | **E1 keep + promote ORDER CONTRACT (agent path)** | Promoted `[#3,#1]` reversed → frames landed in that order, images carried, candidates stamped | Claude |
| 2026-06-20 | **E1 explore/keep/promote (REST path)** | `POST /scenes/:id/explore` → 3 cands → keep #1,#3 → `promote-candidates [#3,#1]` → frames in reversed order, on disk | Claude |
| 2026-06-20 | **E1 UI data path** | `applyStoryGraphDiffs` spreads `...scene`; GET `/interactions` preserves `explorations`; `mapScenesFromApi` maps it; `ExploreGalleryView` typechecks | Claude |

**E1 — still unrun:** in-browser pixel/click test of `ExploreGalleryView` (the
Chrome extension was disconnected). Open the studio → **Explore** rail icon → pick a
scene → Explore → keep (K) → drag selects → Promote. Everything upstream of the
render is verified; this confirms the React wiring renders + clicks.
