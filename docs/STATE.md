# STATE — the live project state

> **The single queryable source for: where we are, what's next, what's blocked,
> what's decided, what's verified.** Read at session OPEN; update at session
> CLOSE. The narrative version lives in `STUDIO_DESIGN.md`'s handoff — THIS file
> is the structured truth. If they disagree, this one wins for *"what do I do
> next,"* and you should fix both.

**Last updated:** 2026-07-23 · **by:** Claude (Opus 4.8)

---

## Now / Next / Blocked

- **NOW (2026-07-23 — this session, 3 commits):** **AGENT MODE/MEDIUM SCOPING + C3 CANONIZATION shipped.**
  (a) The helper agent is now scoped by WHERE you stand and WHICH medium: `getToolsForPhase(activeRow, mode)` — at the WORLD level it gets world-authoring + greenlight tools only (WORLD_DENY_TOOLS strips the 'always'-tagged generators: dream*, explore_prompts, breed/re_explore, music/score; the rest are storyboard/production-only already), and a world-architect/showrunner persona; inside a telling it gets that medium's kit + a medium-aware persona (film director / comic-studio page-director / microdrama). A medium-agnostic **SYSTEM_MAP** rides in EVERY mode so the agent knows all modes + how to cross between them. Client sends real `activeRow` + `mode` + `medium` (page.tsx). **Mode transitions are REAL**: the client now auto-descends into a telling when the agent calls `set_active_production` (was server-state-only; "opening the comic studio" is no longer a lie). `create_production` still coerces non-film|comic|episode → film (microdrama = roadmap).
  (b) **C3 CANONIZATION SHIPPED + live-verified**: locking a draft event into canon is a GATED, VALIDATED status flip (NOT a merge — merge is C4/T4). `canonizeEventCore` runs the telling's gate (`ProjectProduction.canonGate` = creator|vote|rule; creator fully live, vote/rule scaffolded for M2/M3) then a TEMPORAL check (diff canon-only `validateTemporalConsistency` before/after the simulated flip; only NEW violations block) and returns the four narrative resolutions (amend/retcon/bridge/fork). `canonize_production` bulk-locks a telling (chronology order, non-atomic, dryRun preview). World-authored events (no sourceProductionId) use the world creator gate, never the active telling's. REST: POST /events/:id/canonize|uncanonize, /productions/:id/canonize|canon-gate. Tools: canonize_event/uncanonize_event/canonize_production/set_canon_gate (phase 'always'). PATCH/update_event status→canon now routes through the gate (409 on block). Provenance = non-hashed WorldEvent.canonizedAt/canonizedBy (like `notes`); gate on the blob-native production — NO hashed-schema change. UI: WorldTimeline event toggle → validated canonize with a conflict panel (violations + resolution chips + override); lane panel gains gate selector + "Canonize this telling" (preview/lock). Live smoke test passed: conflict→409+resolutions, force override, uncanonize, vote-gate block, bulk dryRun/real. **REMAINING for the full flow: T2 streams/ingest, T3 hooks+distribution, M2 character studio, M3 living card game (vote gate + Aureum), C4/T4 event-aware MERGE + true play-space isolation.**
- **NOW (prior):** **TRANSMEDIA ERA — architecture v2 adversarially verified (172-agent sweep).** Read docs/TRANSMEDIA_INTEGRATION_REVIEW.md **§9 (FINAL ARCHITECTURE — supersedes §4)** + docs/TRANSMEDIA_ADVERSARIAL_FINDINGS.md (40 confirmed findings, 13 critical). Core inversion: **ops are DERIVED at the commit boundary by diffing snapshots (canon-graph subset only) — emitOperation()-at-the-seam is DELETED**; blob stays authoritative; two tiers (Canon = branchable/mergeable/hooked; Production = blob-native). **T0-SAFETY + T0a-WORLD (server) SHIPPED 2026-07-21** — durability spine (atomic+fsync, .bak, serialized chains, 5 durable JobStores, mintId, adapter-whitelist fix) AND multi-production worlds (additive productionId + accessors; ProjectProduction/ProjectArc; production+arc REST/tools incl. move_scene_to_production + delete_production; export/tool/act scoping). Both adversarially reviewed same-day (9+13 findings fixed). T0a-ii UI switcher SHIPPED (browser click-pass pending). **T0b-COMMIT SHIPPED** — derived-ops nit ledger (out-of-blob, per-branch bases, 20-test round-trip gate, refuse-corrupt; get_canon_log tool; durable proposals; Dial settable). **T0 COMPLETE + T1-COMIC SHIPPED (2026-07-22)**: compose_comic whole-page renderer (panel briefs from shots w/ speaker-parsed balloons; graph char refs + style pins + prior-page continuity; long scenes split ≤5 panels/page; stable page numbering; aspect config) + keep/reject/redo HITL + pdf-lib export + 6 agent tools; reviewed same-day (12 findings fixed). BATTLE-TESTED: 'FABLE — The Comic' lives in the FABLE project — pages 1-2 kept, page 3 left DRAFT in the creator's queue; 2-page PDF in exports. chronologyIndex on scenes (validated). Read docs/HOW_IT_ALL_WORKS.md (the layman's guide). **C1 SHIPPED + REVIEWED** (WorldEvent + eventLinks provenance + link/merge/coverage/from-scene/delete; 8 findings fixed same-day: draft-only merge+delete guards, honest staleness on repoint, selective updatedAt, defensive coverage, ledger caveat in tool descriptions, UI eventLinks seam. Rooftop event CANON w/ both vantages in coverage). **C2 + M1 SHIPPED, then C2 LIFTED (2026-07-22)**: Michael's correction on first sight — the world timeline cannot live under the production switcher (hierarchy inversion). NOW: **/chronicle = the WORLD VIEW**, a full-page parent to the studio (world selector, big spine, production lanes as threads w/ derived STAGE chips + draft badges, click-through coverage, open-production descends into the studio; studio header gains a World ascent link; the in-studio rail entry is REMOVED). Plus the comic production surface (ComicPagesView replaces the video timeline for format:comic — keep/reject/redo/compose/export in the UI at last; ProductionSwitcher feeds format up). WORLD-FIRST SHELL SHIPPED (2026-07-22 wave 5): world rail (Chronology/Entities/Style/Assets/Productions — sections stay at world level), per-media specialization rails (comic: Story/Cast/Storyboard/Pages; film: full pipeline) each w/ persistent '◂ World' ascent, ProductionsView registry (stage+branch cards, create+descend), landing = world chronology. **C1.5 SHIPPED (2026-07-22)**: events are now HASHED canon-tier — v1.1 schema (WorldEvent/EventLink/ADD-UPDATE-REMOVE_EVENT ops), migrator carries events+eventLinks, worldStateAt(t) story-time fold, validateTemporalConsistency (participant-dead/duplicate-death w/ narrative-resolution guidance), REST /chronology/validate+/state-at, tools validate_chronology+world_state_at; 25 derive tests. Verified live: canon-world genesis commit carries ADD_EVENT; prequel-death conflict flagged then cleared. FIXED regression: formatVersion carve-out in round-trip gate (a 1.0->1.1 bump silently skipped ALL commits). Browser-history world↔production nav. World timeline is a PREMIERE-STYLE STACKED TIMELINE (React Flow retired): tracks=productions, x=chronology axis+ruler, spanning bars filled w/ content stills, canon-track main line, branch-vs-main styling, playhead scrub, EXPANDABLE LANES→filmstrip, rich EVENT DETAIL (participants + typed stateChanges + told-in coverage), world-at-a-glance. World-first NAV fixed: World button = pure ascend (no toggle bug), ?p= URL routing + browser back/forward, breadcrumb replaces the production dropdown, comic descends to PAGES (not video — the format-stale bug). + agent CHRONICLE system-prompt block. In-browser pass = Michael (active). REMAINING for the full flow: C1.5 machinery (hashed events/worldStateAt/footprint validation → real merge + conflict resolution for branch-from-mid-movie), C3 gates (creator|vote|rule), T2 streams, M3 Aureum rules. WAVE 4 was: world-FIRST landing (worldMode default true; chat now ALIVE in world mode — it was trapped in the !worldMode wrapper; nav rail hidden at world level; entities-from-world = workbench w/o production chrome + '◂ World · entities' breadcrumb). TARGET SHELL SPECCED in CHRONICLE_DESIGN (world rail w/ own sections; per-media specialization rails; shared entity surface; Michael's full flow verbatim) = the next UI build. WAVE 3 was: Michael's inheritance correction → **worldMode INSIDE the studio shell** (proseMode pattern): real chat (world-aware context, ALL tools via activeRow:undefined), real entity workbench, in-app descend (no reload), switcher hidden+refreshToken, /chronicle = redirect, WorldChat deleted. WorldTimeline.tsx = the canvas component (spine/lanes/branch chips/coverage/new-telling). Michael actively click-testing. NEXT = **C1.5** (EVENT ops hashed + worldStateAt + temporal-footprint validation — gates T3), then C1b backfill, C2b span-select, T2-INGEST. ROADMAP v2 FOLDED (docs/TRANSMEDIA_ROADMAP.md: Media Type pattern; M-track incl. M2 character-authorship studio + M3 living card game w/ vote-to-canon gate + Aureum pulled forward; S-track spatial seed). NORTH STAR DESIGN: **docs/CHRONICLE_DESIGN.md v2** (Michael's transmedia vision + bi-temporal resolution + design-check findings folded — AWAITING RATIFICATION). MVP = C1+C2: WorldEvent model w/ eventLinks provenance + the Chronicle rail; demo target = the rooftop event linked from comic AND film, click-through both vantages. Then C1.5 (EVENT ops v1.1 — gates T3 hooks), M1 Comic rail, C3 draft→canon. T2-INGEST still queued (lore re-import = fixture). Canon rail UI = with T3. Lore import NEVER LANDED — redo via fixed T2 ingest (canon project now holds Aria+James w/ real refs + the Rooftop scene + Issue #0). g89le at `../g89le`; Aria/James refs under `g89le/02_production/anime/character_visuals/`.  REUSABLE STYLES shipped: world-scoped SavedStyle library (name+visualPrompt+styleAssetIds leash+outputIntent), ProjectProduction.styleId + world defaultStyleId; resolveStyleForRender precedence (explicit→production→world-default→legacy); /render+comic pipeline apply per-production style (verified: noir on comic, not leaking to default); REST+tools (list/save_style/set_production_style/set_default_style); StyleLibraryPanel UI above the creator. Style popup no longer auto-fires; metadata above swimlane; /chronicle clean redirect.  Event-AUTHORING surface (inline title/description/notes edit, draft↔canon toggle, chronology stepper, pacing context, participant add/remove); agent has FULL event authority (update_event/delete_event tools added; world context spells out the toolkit). StyleLibrary/PreProduction overlap fixed. Films shipped: FABLE + The Last Lighthouse.
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
| **T0-SAFETY** | **Durability spine**: atomic writes (+.bak, fsync) · serialized write chains (one projects.json chain) · durable JobStores ×5 (interrupted-marking, eviction, terminal-flush) · mintId (70+ sites) · file-adapter whitelist data-loss fix | **shipped** (2026-07-21; 2 commits incl. adversarial review wave; 15 unit tests) | `src/storage/atomic-write.ts` · `job-store.ts` · `src/utils/ids.ts` |
| **T0a-WORLD** | **Multi-production worlds**: additive productionId + accessors (scenesFor/actsFor/timelineFor/scriptFor) · ProjectProduction + ProjectArc · REST+tools (list/create/activate/move/delete production, arcs CRUD) · export/tool scoping | **shipped (server)** (2026-07-21; 2 commits incl. review wave, 13 findings fixed). UI switcher chrome = T0a-ii, pending | `server.ts` accessors ~line 330 · `storage-adapter.ts` ProjectProduction/ProjectArc |
| **T0a-ii** | **UI production switcher** — header dropdown next to StorySwitcher (list + activate + quick-create w/ format picker); switch → clears selection + refetches scenes/script/acts/timeline (server accessors do the scoping) | **shipped** (tsc 0; **in-browser click pass PENDING** — UI dev server wasn't running, 3089 held by another app) | `ui/components/studio/ProductionSwitcher.tsx` · header wiring in `page.tsx` |
| **T1-COMIC** | **Comic renderer**: compose_comic (whole-page gen, panel briefs from shots, speaker balloons, char refs + style pins + prior-page continuity, page splitting, stable numbering, aspect config) · keep/reject/redo HITL · pdf-lib export · 6 tools + REST | **shipped** (2026-07-22; 2 commits incl. review wave, 12 findings fixed; battle-tested: FABLE comic, 3 pages + PDF) | server.ts 'T1-COMIC' section · production.comicPages |
| **T0b-COMMIT** | **Derived-ops commit boundary**: derive.ts (deriveOperations/apply/normalize/stabilize/strip — 20-test round-trip CI gate) · out-of-blob nit ledger (.narrative-data/nit/, per-BRANCH diff bases, refuse-corrupt) · wired at commit/merge/world-gen · GET /nit/log + get_canon_log · durable pendingProposals · Dial settable (PATCH /productions) | **shipped** (2026-07-21; 2 commits incl. review wave — 15 findings fixed, 3 critical) | `src/git/format/v1/derive.ts` · `deriveAndAppendNitCommit` in server.ts |
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
| 2026-07-20 | **Transmedia lineage: v1 schema here + full Aureum vendored** | Two nit lineages existed; canonical FORMAT = `src/git/format/v1` (Zod, migrator exists); g89le's `packages/aureum` comes over WHOLE (DSL+rules+reflex). See TRANSMEDIA_INTEGRATION_REVIEW.md §6. | active |
| 2026-07-20 | **T0 spine before T1 comics** | `productions[]` + `arcs[]` (project = world/campaign) + typed-operation emission at the executor seam; everything else lands into it. | active |
| 2026-07-20 | **Comic engine = whole-page NB2 Pro primary** | Text-in-image page gen produced the good consistent comics; composer+SVG is fallback/repair. HITL phase gates (Autonomy Dial per phase) are the real gap to fix, not generation. | active |
| 2026-07-20 | **Nit persistence via modular storage adapters; entity refs are temporal** | File-JSON first, DB pluggable; looks/refs carry validity anchors so character appearance mutates with story progression. | active |
| 2026-07-20 | **v2: ops DERIVED at commit boundary; emitOperation() DELETED** | 13 critical findings killed the §4 write path (op union covers ~6/20 collections; seam misses 68 self-fetch writes; non-atomic 54MB dual-write). Winner of 3-proposal judged panel. See REVIEW §9 + FINDINGS doc. | active (supersedes "T0 spine" mechanism) |
| 2026-07-20 | **v2 amendments: Aureum→T6, monorepo→T5, medium payloads DELETED, minimal identity pulled to T2/T3** | No consumer sooner (Aureum/monorepo); v1 ops already typed + Commit.tags routes media (schema-5); external writes ship at T3 so identity can't wait for T5 (security-1). | active (amends 2026-07-20 lineage decision) |
| 2026-07-20 | **Temporal looks = Scene.chronologyIndex + Entity.looks[] validity intervals, typed AND hashed** | Authoring-time anchors mis-resolve prequels (schema-4); looks outside the hash = identical hashes for different-looking worlds (schema-3). | active |
| 2026-07-22 | **Bi-temporal nit: one store, two clocks** | Transaction time = commit log (T0b); valid time = chronology AS DATA (WorldEvent.chronologyIndex; defaults to arrival order — "the log is the chronology until you say otherwise"). Universe forks = event.timelineId (grey/green), distinct from authoring branches. worldStateAt(t) = story-order fold. See CHRONICLE_DESIGN.md. | **ratified** (Michael 2026-07-22) |
| 2026-07-22 | **Events are canon-tier, hashed EARLY (C1.5, not C4)** | T3 hooks fire on events; un-hashed extensions events would strand reactivity (design-check scope-2/substrate-1). | **ratified** (Michael 2026-07-22) |
| 2026-07-22 | **Branch honesty: branchName = history isolation ONLY; draft/canon = WorldEvent.status** | Working tree is one blob — branched play-spaces mutate shared state immediately; v1 draft's "branch play never pollutes main" withdrawn. Lock-into-canon = reviewed status flip until T4's event-aware merge. | **ratified** (Michael 2026-07-22) |
| 2026-07-23 | **C3 canonization = GATED + VALIDATED status flip (not a merge)** | Locking a draft into canon runs the telling's gate (canonGate creator\|vote\|rule — creator live, vote/rule scaffolded so M2/M3 slot in) then a temporal-conflict check (diff canon-only violations before/after the simulated flip; only NEW ones block) with the 4 narrative resolutions. Provenance non-hashed (canonizedAt/By like `notes`); gate on the blob-native production → no hashed-schema change. Event-aware MERGE stays C4/T4. | active |
| 2026-07-23 | **Agent scoped by mode+medium; world = greenlight-not-generate; transitions are real** | World agent gets world-authoring + create/set_active_production only (WORLD_DENY_TOOLS strips 'always'-tagged generators); medium-aware personas; a global SYSTEM_MAP in every mode; client auto-descends on set_active_production so "enter a mode" actually moves the UI. | active |
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
| Whole project (repo root `npx tsc -p .`) | **212 errors** | Re-measured 2026-07-21 (the old 204 was stale — drift from the July feature commits, NOT T0-SAFETY, which measured delta-0 via git-stash A/B). |
| `ui/` (`npx tsc` in `ui/`) | **0 (clean)** | Keep it at 0. |
| Last measured | 2026-07-21 (post T0-SAFETY) | Measure your DELTA with a git-stash A/B when the absolute number matters. |

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
| 2026-07-21 | **T0-SAFETY atomic write + .bak + mintId** | Live: act create on grdtest → `act_<ms>_<8hex>` id, `.bak` created, zero tmp litter; probe deleted after | Fable |
| 2026-07-21 | **T0-SAFETY JobStore restart survival** | Live: seeded pending video job → forced tsx reload → poller returned `error: Interrupted by server restart`; probe cleaned | Fable |
| 2026-07-21 | **T0-SAFETY unit suite** | 15 tests: atomicity, .bak throttle, chain ordering+failure, store reload/interrupt/eviction/in-place flush, adapter whitelist round-trip (unknown fields), mintId burst | Fable |
| 2026-07-21 | **T0a productions end-to-end (grdtest, restored after)** | Comic production create+activate → scene stamped; lists scoped 3 ways (explicit comic/explicit default/active); timeline track + script logline landed on the COMIC production, default untouched; arc created | Fable |
| 2026-07-21 | **T0a review-wave fixes** | Move scene → productionId flipped + acId rules; unknown productionId → 400; delete_production → scenes/acts to default, active falls back, default undeletable | Fable |
| 2026-07-21 | **T0b nit ledger end-to-end (grdtest, restored)** | Genesis (parents:[], ADD_SCENE×2) → incremental chained (delta-only) → EMPTY commit derives zero entries (no phantom ops); ledger in own 4.5KB file, blob clean; refuse-on-corrupt proved live (skipped during a contract violation, delta folded into next success) | Fable |
| 2026-07-22 | **T1 AGENTIC pass (the agent-first proof)** | One chat turn, zero hand-holding: agent chained 15 tool calls — list/switch production → list pages → get_scenes → compose_comic → polled check_comic → verified page 4 draft w/ stable number → get_canon_log — and reported accurately | Fable |
| 2026-07-22 | **C2 chronicle aggregation (canon world)** | GET /chronicle: rooftop event + BOTH production lanes (film + comic) derived from eventLinks; ui tsc 0; full next build green | Fable |
| 2026-07-22 | **C1 events end-to-end (canon world)** | evt_rooftop created w/ typed stateChanges → linked → coverage returned BOTH vantages (film scene + comic page) → canonized; merge/delete canon guards 400; reposition leaves stale:false; from-scene promoted a FABLE scene w/ sourceProductionId | Fable |
| 2026-07-22 | **T1 MULTI-CHARACTER canon test (Aria+James, real refs)** | Seeded canon world w/ g89le reference jpgs + bibles; 'The Rooftop Meeting' page: both characters distinct+consistent all panels, placements/dialogue/props as authored; QC caught missing silver streak → redo → streak in every panel + badge + glasses. Canon Comic Issue #0 draft awaits Michael | Fable |
| 2026-07-22 | **T1 prompting v2 (the g89le discipline)** | Page 3 redone via the producer pass: real comic craft — caption open, tailed balloons (no name prefixes), small→small→large panel drama per feedback, integrated SFX, page-turn pull; take preserved. Character NUMBER-binding awaits a cast-heavy project (FABLE has no participant entities) | Fable |
| 2026-07-22 | **Graph-state separation proven on FABLE** | Genesis commit recorded ADD_SCENE×5 + WRITE_SCRATCHPAD×2; empty commit → 0 new entries; FOUR comic pages → 0 canon ops (production tier is canon-silent, as architected) | Fable |
| 2026-07-21 | **T0b round-trip CI gate** | 20 tests: hash-preserving derive→apply across all op types, sparse positions, dup-id refusal, schema validation of every derived op, hash-invisible zero-op, migrator+stabilize end-to-end | Fable |

**E1 — still unrun:** in-browser pixel/click test of `ExploreGalleryView` (the
Chrome extension was disconnected). Open the studio → **Explore** rail icon → pick a
scene → Explore → keep (K) → drag selects → Promote. Everything upstream of the
render is verified; this confirms the React wiring renders + clicks.
