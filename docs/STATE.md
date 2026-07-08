# STATE — the live project state

> **The single queryable source for: where we are, what's next, what's blocked,
> what's decided, what's verified.** Read at session OPEN; update at session
> CLOSE. The narrative version lives in `STUDIO_DESIGN.md`'s handoff — THIS file
> is the structured truth. If they disagree, this one wins for *"what do I do
> next,"* and you should fix both.

**Last updated:** 2026-06-20 · **by:** Claude (Opus 4.8)

---

## Now / Next / Blocked

- **NOW:** **Michael's top-3 ALL SHIPPED (2026-07-02 overnight run):** ① THE
  DELIVERABLE LOOP — V4 complete: MP4 export (verified film on disk), video
  takes (accumulate/preview/promote, UI strip), produce→assemble (verified),
  Produce/Export buttons with progress, double-buffered video-mastered playback.
  ② TASTE MEMORY (V3) — projectData.tasteProfile + update_taste_profile +
  prompt injection; verified live (fresh turn recalled + self-applied the
  director's prefs). ③ CHAINED ANIMATION — produce_scene {chain:true}: each
  clip starts from the previous clip's final frame (plumbing rides verified
  paths; needs ONE live Veo pair to fully verify).
- **NEXT:** (1) In-browser shakedown of ALL new UI (Explore gallery incl. the
  new project-level sets — the UI gallery does NOT yet show project-level/
  lineage/axes sets, agent-only for now; takes strip; Export/Produce buttons;
  double-buffer playback). (2) Live passes: chained-animation Veo pair,
  explore_style matrix + pin, breed_candidates. (3) NB2 + GPT-Image static prompting guides (the LEDGER half is SHIPPED). (4) UI for
  lineage/axes in the gallery. Then V5 craft depth / E2.
- **NEXT (Michael, 2026-07-06):** (1) **AUDIO — the biggest gap**: per-cut audio
  discontinuity; easiest win = ONE MUSIC BED over the cut — build generate_music
  (Replicate MusicGen; token already plumbed) + export mux (ffmpeg: duck or
  replace concat audio under the bed). Harder: Seedance previous-clip feed-in
  for audio continuity (reference_videos); Veo stays hard. (2) storyboard→
  Seedance flow test (BLOCKED on OpenAI billing — GPT-Image down). (3) **MCP
  EXPOSURE**: surface the studio's tools as MCP so EXTERNAL agents can lock
  characters/locations/arcs — mcp-server/ dir exists; agent-first taken to its
  conclusion. (4) insert_frame collision aftermath audited: prompt-swap twin
  found in the film (pottery duped, child missing) and repaired; v3 exported.
- **THE AUDIT QUEUE (2026-07-08 research sweep — see PIPELINE_AUDIT_2026-07.md):**
  G1 Veo dialogue folding = subtitle burn-in anti-pattern (fix: speaker-colon
  syntax + 'no subtitles/text overlays' clause + dialogue schema gains speaker);
  G2 no post-render QC + no watch_film on exports; G3 takes/keeps metadata
  hemorrhage (states/notes/seed/cost); G4 no budget governance on autonomous
  jobs (dream_film unbounded); G5 UI legacy Generate buttons bypass the V2a
  resolver + style pins (the old /visual/frame migration debt, now crucial).
  Improvements: Veo seed/negativePrompt params, retry/backoff, video outcomes →
  prompt ledger, character turnarounds, mutation re-anchor discipline.
- **BLOCKED / AWAITING:** OpenAI billing top-up (GPT-Image).

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
| E2 | Explore: Engine B (Seedance explore-from-image) | design | `EXPLORE_FLOW_DESIGN.md` — ffmpeg gate clears with V1 |
| E3 | Explore: upscale / re-explore / video-as-input | design | `EXPLORE_FLOW_DESIGN.md` |
| **V1** | **Director foundation: agent senses + brain** (ffmpeg, `watch_shot` native video+audio, curation grid, director prompt, motion field, budget 24, context cap) | **shipped** | `DIRECTOR_ROADMAP.md` · extractor in `src/visual/video-frame-extractor.ts` |
| **V2** | **Long-form Production Engine**: graph-ref resolver (`resolveShotReferences` + `set_scene_looks` wardrobe lock) · `produce_scene`/`check_production` server-side runs · `review_scene` continuity dailies | **shipped** | `DIRECTOR_ROADMAP.md` · all in `server.ts` |
| **V3** | **Taste memory** — tasteProfile + update_taste_profile + injection | **shipped** | `server.ts` |
| **V4** | **Screening room** — export/takes/assemble/UI/playback | **shipped** (browser pass pending) | `film-exporter.ts` + `server.ts` + `page.tsx` |
| **PL** | **Prompt-outcome ledger** — get_prompt_outcomes dataset + record_prompt_lesson + injection (judgedAt discriminator) | **shipped** | server.ts |
| **LX** | **Latent exploration suite** — explore_prompts grid · explore_style matrix (+suppressProjectStyle) · mutation/breed lineages · pin_style_from_candidate · dream/check_dream autonomous runs | **shipped** (grid/mutation/dream verified live; style-matrix+breed share the engine, live pass pending; UI for project-level sets pending) | server.ts runExplorationSet |
| V5 | Craft depth: coverage plans, pacing, transitions, E2/E3 | design | DIRECTOR_ROADMAP.md |
| V6 | Sound (deferred — model-gated; dialogue/SFX ride generation prompts meanwhile) | design | `DIRECTOR_ROADMAP.md` |

---

## CHECKPOINT (half-done handoff)

> Fill this ONLY when stopping mid-task. Empty = clean stopping point; the next
> agent starts from **NEXT** above.

- **Task:** —
- **State:** _(none — clean)_
- **Entry point:** —
- **Awaiting decision:** —
- **Failing checks:** chained animation not yet exercised with real Veo (plumbing only); promote_video_take swap not yet exercised live (endpoint+UI reviewed).

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
| 2026-06-21 | **watch_shot = native video part, frames as fallback** (Michael's call) | Gemini understands video natively — the mp4 attaches as an inlineData part (≤12MB), giving real motion perception AND the audio track; sequence shots window via `videoMetadata` offsets. ffmpeg frames remain the fallback for oversized files + the foundation for export/E2/grids. | active |
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
| 2026-06-21 | **V1 frame extractor** | 6 frames from a real 8s Veo mp4, visually confirmed a frame | Claude |
| 2026-06-21 | **V1 watch_shot (frames path)** | Agent gave an accurate frame-by-frame breakdown of a real clip AND caught a generation artifact (background dropping out) | Claude |
| 2026-06-21 | **V1 curation sight** | Agent described each numbered contact-sheet panel accurately + volunteered a keep opinion | Claude |
| 2026-06-21 | **V1 directing loop ("shoot this scene")** | Beat-authored angles → read dailies → CAUGHT a continuity break (courier changed gender) → rejected it → promoted 1→3→4→5 with editorial logic | Claude |
| 2026-06-21 | **V1 watch_shot (native video+audio)** | `attachedAs: native-video`; agent reported a timestamped soundscape (flint strike, flame hiss, breath, exhale, lighter clack, room tone) | Claude |
| 2026-06-21 | **V2a graph refs (auto)** | Zero agent refs → system attached both cast primaries + location (seeded graph fixture) | Claude |
| 2026-06-21 | **V2a scene wardrobe lock** | `set_scene_looks` "in armor" → Sara resolved to the ARMOR album image + prior-shot anchor auto-attached; persisted `castLooks` | Claude |
| 2026-06-21 | **V2b produce_scene run** | Agent started + checked mid-flight (2/3); run kept 2 existing, rendered the missing shot with 4 graph refs; `scene.productionRun` persisted; done 3/3 | Claude |
| 2026-07-02 | **V4a export** | Mixed timeline (3s chopped Veo + 2s still) → 5.02s h264/aac MP4; frames eyeballed both halves | Claude |
| 2026-07-02 | **V4b takes accumulate** | Re-animate pushed the done clip into videoTakes (prompt preserved) | Claude |
| 2026-07-02 | **V4c assemble** | Produce run laid 2 clips in shot order with durations on the Main track | Claude |
| 2026-07-03 | **LX prompt grid** | 3 parallel prompts → project-level set persisted; agent read each panel | Claude |
| 2026-07-03 | **LX mutation lineage** | 2 directed mutations; parentCandidateIds stamped; agent judged the fitter child | Claude |
| 2026-07-05 | **Chained animation (LIVE)** | 2-shot finale produced with chain:true — both clips done; clip B started from clip A's harvested final frame | Claude |
| 2026-07-05 | **Full film end-to-end** | 'FABLE — a self-portrait': 5 scenes, 17 shots, 5 Veo clips (1 chained pair), assembled, paced, exported 88s h264/aac — QC'd frames from the export | Claude |
| 2026-07-03 | **Prompt-outcome ledger** | Seeded judged set → correct splits (unjudged excluded); agent mined the true pattern, recorded it; fresh turn recalled it | Claude |
| 2026-07-03 | **LX dream run** | Autonomous: explored 4 identities, kept 2 with stated taste, wrote the morning-report note; lastDream done | Claude |
| 2026-07-02 | **V3 taste memory** | Recorded 2 prefs → persisted → FRESH turn recalled + said how it would apply them | Claude |
| 2026-06-21 | **V2c review_scene dailies** | Agent caught REAL wardrobe drift (hood up/down) + blocking discontinuity (case teleports), verified eyelines, proposed anchored re-render fix by panel | Claude |

**E1 — still unrun:** in-browser pixel/click test of `ExploreGalleryView` (the
Chrome extension was disconnected). Open the studio → **Explore** rail icon → pick a
scene → Explore → keep (K) → drag selects → Promote. Everything upstream of the
render is verified; this confirms the React wiring renders + clicks.
