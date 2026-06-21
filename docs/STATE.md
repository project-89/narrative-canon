# STATE — the live project state

> **The single queryable source for: where we are, what's next, what's blocked,
> what's decided, what's verified.** Read at session OPEN; update at session
> CLOSE. The narrative version lives in `STUDIO_DESIGN.md`'s handoff — THIS file
> is the structured truth. If they disagree, this one wins for *"what do I do
> next,"* and you should fix both.

**Last updated:** 2026-06-20 · **by:** Claude (Opus 4.8)

---

## Now / Next / Blocked

- **NOW:** Video pipeline settled (Veo + virtual chop/trim/splice). Design +
  operations docs hardened (this pass).
- **NEXT:** **Explore flow E1** — the curation backbone + Engine A (per-angle).
  Entry doc: `docs/EXPLORE_FLOW_DESIGN.md`. **E1 task #1 is the `mapScenesFromApi`
  seam** (see CHECKPOINT-class note in Decisions). Confirm scope with Michael
  before building (design was explicitly requested before implementation).
- **BLOCKED / AWAITING:** Explore open-decisions #1–#5 in `EXPLORE_FLOW_DESIGN.md`
  are now "leaned" but two (#1 surface placement, #2 promote semantics) should be
  locked with Michael before E1 code.

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
| **E1** | **Explore: curation backbone + Engine A (per-angle)** | **design (next)** | `EXPLORE_FLOW_DESIGN.md` |
| E2 | Explore: Engine B (Seedance explore-from-image) | design | `EXPLORE_FLOW_DESIGN.md` — **gated on ffmpeg frame-extractor** |
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
| 2026-06-20 | **Explore E1 task #1 = the `mapScenesFromApi` seam** | `scene.explorations` rides inside `interactions[]` and survives `loadProjectData` (`...parsed`, server.ts:248) + restart, but the UI whitelist `mapScenesFromApi` drops it until a branch is added (gotcha #16 class). Nothing in E1 renders until this lands. | pending (E1) |
| 2026-06-20 | **ffmpeg is an E2 gate, not E1** | E1 is per-angle renders only ("no Seedance, no ffmpeg"). Frame extraction from a Seedance mp4 needs a video decoder (`sharp` is image-only); add `@ffmpeg-installer/ffmpeg` + `src/visual/video-frame-extractor.ts` at E2. | active |
| ~2026-05-28 | **Assets-as-drawer: DEFERRED (polish)** | The bottom-rail Assets view works; the slide-in drawer is low-friction polish, not blocked. Skip until it's the best use of a session. | active (defer) |

For the 5 LOCKED Seedance decisions (chop fidelity, virtual/physical, run
selection, coexistence, provider), see `SEEDANCE_MULTISHOT_DESIGN.md` →
"Locked decisions."

---

## Typecheck baseline (measure your DELTA, never zero it)

| Target | Baseline | Notes |
|---|---|---|
| `src/api/server.ts` (repo root `npx tsc`) | **~156 errors** | Mostly the benign Express route-overload `TS2769`. PRE-EXISTING. |
| `ui/` (`npx tsc` in `ui/`) | **clean** | Keep it clean. |
| Last measured | 2026-06-20 | Re-measure at OPEN; if server > ~156, you regressed. |

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

**E1 verification targets (seed when building):** `explore_scene_angles` writes N
candidates → `list_candidates` returns them → candidates **survive a server
restart** (the gotcha-#16/#18 round-trip) → `promote_candidates` produces frames
in the chosen order.
