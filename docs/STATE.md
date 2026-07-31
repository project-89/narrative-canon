# STATE — the live project state

> **The single queryable source for: where we are, what's next, what's blocked,
> what's decided, what's verified.** Read at session OPEN; update at session
> CLOSE. The narrative version lives in `STUDIO_DESIGN.md`'s handoff — THIS file
> is the structured truth. If they disagree, this one wins for *"what do I do
> next,"* and you should fix both.

**Last updated:** 2026-07-24 · **by:** Claude (Opus 5)

---

## Now / Next / Blocked

- **NOW (2026-07-27b): STYLE PUSH — 4 commits on `movie-pipeline`.** Michael:
  style/consistency is the biggest refinement area; rebuild the style creator.
  (1) **TOTAL ARCHIVAL enforced**: recordGeneratedImage had ONE call site
  (/render) — now 15. Newly recorded: both UI Generate buttons, camera-angle,
  edit-image, entity, portraits (+ now returns imageUrl), bare generate (+ url),
  artifacts, storyboard; and VIDEOS for the first time (Veo clips, sequence
  videos, film exports — kind:'video' in the registry; /assets/generated emits
  them). Registry failures now warn instead of vanishing.
  (2) **STYLE DIRECTOR persona**: standing in the style room flips the agent to
  a style-craft persona in ANY mode; the world-level deny of
  re_explore/breed/explore_prompts is lifted THERE (STYLE_ROOM_DENY_EXCEPTIONS).
  (3) **REST parity**: styleMatrixCore/mutateCandidateCore/breedCandidatesCore
  shared cores; POST /explorations/{style-matrix,mutate,breed}; live-verified
  (matrix→mutate w/ lineage→list).
  (4) **StyleStudio.tsx** — the style room's default tab: matrix lab (plate
  packs, editable plates), persisted exploration strips w/ per-candidate
  Pin/Mutate/Breed, drag-drop style upload (auto-pins; Midjourney as basis),
  multi-model test bench (NB2/Pro/GPT side-by-side, raw toggle, history,
  pin-from-bench). Old editor lives on the "Spec & Refs" tab.
  **ATLASCLOUD IS LIVE (2026-07-31): all 8 registry models verified** — gpt-image 2 (52s) + seedream v5-pro (100s) images, minimax-h3 4s clip through the full video pipeline (job->archive->frame). Live API corrections folded: download_url, modality-suffixed ids from their /models catalog, H3 t2v ratio param; minimax/h3/reference-to-video exists so H3 is a MULTI-REF photoreal sequence engine. **AWAITING: Michael's click-pass of the whole style loop** (built for human
  testing). Then: AtlasCloud (blocked on key), entity draft→canon slice, music
  bed, real shorts/microdrama formats.

- **PRIOR (2026-07-27): MVP PUSH — movie pipeline. G5 SHIPPED + live-verified**
  (branch `movie-pipeline`): the UI's Generate buttons now agree with the agent's
  renders. Legacy /visual/frame + /visual/scene were ignoring the reusable style
  library AND scene.castLooks (drift by construction). Fixed via three parity
  injections keeping the UI's diagnostics contract: look-aware
  resolveEntityReferenceAssets (preferredUrl), resolveLegacyStyleParity (saved
  style prompt + pinned style image as styleRef, incl. identity-repair passes,
  styleApplied in responses), and ImageGenerator.applyStyle no longer prepends
  the photoreal preamble over a locked style block. Verified by behavior: real
  NB2 renders on a fixture; look URL won, style ref attached, preamble gone.
  **NEXT (Michael's MVP order)**: AtlasCloud provider (GPT-Image + Seedance;
  BLOCKED on key — OpenAI direct is DEAD, leaked-key $700; Seedance =
  animation only, never photoreal refs; Flux 3 20s video when preview opens) →
  thin entity draft→canon slice (entities have NO draft/canon lifecycle — the
  open structural gap; events got theirs in C3) → one music bed over the cut +
  export mux → real `shorts`/`microdrama` formats (still coerced to `film`).

- **NOW (2026-07-27): CHANGE RECORD SPEC v0.5 — release candidate for v1.0; Aureum review in flight.**
  v0.5 closes the four structural opens (positions proposed from the ArgOS side, adopted after
  verification): **O1 record channel** (§11.5 — one commit, two channels: Changes on story time w/
  interval algebra, Records on edit time w/ field-LWW; `fold(commitRange, storyTime)`; Studio→Sim
  instantiation = records-then-changes, a FORCED ordering); **O3 forks INHERIT** (§7.1 —
  `fold(T,t)=fold(parent,min(t,forkAt))++events(T,≤t)`; `timeline` nodeKind promoted from the
  unversioned `canon-timeline-manager.ts:31-43` model; `timelineId` joins the conflict key);
  **O2 group knowers** (§6.6 — reveal on the group, `core.membership`, read-time transitive
  `knows()`; deliberate divergence from Mythopia's apply-time expansion, noted); **O7 DECIDED**
  (§11.6 — changes[] in the Event payload; **freeze at canon** scoped to changes[]/at/participants/
  timelineId, NOT whole-Event immutability, which would delete the shipped authoring surface +
  `dramatizedAtEventUpdatedAt` staleness; labels mutable; drafts fluid). Plus **L1r** (emit +
  rehydrate — ArgOS keeps no lossy local altitude-2 table; resolves §15↔CANON§6) and **§13 carved
  to v1.1** as a correctness call (unsound in the unsafe direction). O4 ships implementation-defined.
  **AUREUM REVIEW COMPLETE → SPEC v0.6 (all three implementer vantages examined).**
  Workflow (1 opus reviewer + independent sonnet verifier PER blocker): 7 blockers — 4 CONFIRMED
  (B1 no clock vs REQUIRED worldDate → §7 declared `t→worldDate` mapping + `granularity` enum w/
  `session`; B4 one `setLink`→four verbs → §12.5.2 link-key declarations; B6 silent skips → §8.3
  producer-side `unapplied-change` twin; B7 closed nodeKind enum → §3.2 extension kinds
  `x.<vendor>.<name>`), 3 NARROWED to doc gaps by verification (B2 narrative-only rules → §6.3.1
  create+reveal pattern + §16 effects-row correction; B3 oneShot spent-ness → §12.7.1
  behaviour-gating-state-is-a-component principle, vendoring obligation not active bug; B5 open
  tag vocab → §12.5 worked example). THE FIRST QUESTION ANSWERED: **L1 emission needs ZERO
  evaluator changes** — host wrapper around `step()`, before from pre-step world, after from the
  returned clone; rules stay pure. Review doc: `CHANGE_RECORD_SPEC_REVIEW_AUREUM.md` (disposition
  table + full verification appendix). **REVIEW BRIEF for the Mythopia pass → `CHANGE_RECORD_SPEC_REVIEW_BRIEF.md`** (what his
  agents should attend to: the v0.5/v0.6 sections are the LEAST-reviewed text — first adversarial
  read; the 5 decisions needing Mythopia's blessing incl. §6.6 late-joiner divergence; the
  highest-value act = run the 42-assertion Fellowship suite through a spec-conformant fold;
  known-open items listed so they aren't re-filed). **REMAINING BEFORE v1.0 LOCK: one maintainer signature per
  §15 row** (ArgOS already committed via CANON §6; Mythopia = cofounder; Aureum = Michael's own
  call). Then lock and let implementation find the rest.
- **PRIOR (2026-07-24): REPO CLEANUP — the pre-studio layer is out of the build.**
  ~50k lines removed or relocated. Rules applied: reachable → keep; orphaned but
  tested / seeds a planned phase → keep; orphaned + untested + superseded →
  `archive/`; orphaned + broken → delete; Timeline Warfare → preserved.
  - **DELETED**: `mcp-server/` (imported two modules that no longer existed —
    a T5 rebuild over the REST cores is the plan, not a revival); **~35 legacy UI
    routes / 23.3k lines** — the whole `app/p/[projectId]/*` dashboard, its
    byte-identical top-level twin, 3 generations of explore UI, `world/create`
    incl. WorldChat (2.8k, which STATE previously claimed was already deleted —
    it wasn't); 7 Feb-era root docs; `bun.lockb`; **22 UI deps** (@xyflow, d3,
    dagre, all 11 @radix-ui, zustand, cmdk, date-fns…), 174 packages.
  - **`/` NOW OPENS `/studio`.** It used to redirect to `/p/<id>` — the February
    dashboard — so a fresh visitor never landed on the studio at all.
  - **PRESERVED**: `prototypes/timeline-warfare/` — the first prototype, and the
    visible ancestor of the canon model (TimelineEvent→WorldEvent,
    BranchMergeMinigame→the C3 gate). Moved with the two things it needs that a
    naive cleanup would have deleted under it (`src/visualization/`, the
    panel/comic composers). README records the resurrection path: play session →
    event stream → draft WorldEvents → gate → comic/film.
  - **ARCHIVED** → `archive/2026-07-studio-cleanup/`: the Mongo/query/library
    layer + `examples/` + one-shot bootstrap scripts. README flags the genuine
    prior art (`query/consistency.ts` = candidate linter rules vs our 2;
    `graph/multi-scale-manager.ts` = curve/arc phases).
  - **KEPT deliberately**: `src/extractors/` + `pipeline.ts` +
    `chunked-extraction.ts` — already inside the server's import closure and the
    seed of T2 ingest; `src/git/` (live + tested).
  - **FIXED**: `src/llm/gemini.ts` (22 errors → 0; was cascading into 10 suites)
    and a **latent runtime crash** — `storage/index.ts` awaited
    `MongoProjectAdapter.waitForConnection()`, which never existed, so
    `USE_MONGODB=true` threw. Also the one genuinely-broken studio test
    (`DEFAULT_STYLE` drifted manga→realistic months ago).
  - **RESULT**: tsc **238 → 181, all in `server.ts`**; jest **15 failing suites →
    3** (deduplication flake, git/narrative-git fixtures, llm/mock assertions —
    all pre-existing); `next build` clean; bundle is one artifact
    (`dist/api-server.cjs`) and boots serving real data; C3 canonization verified
    end-to-end after the deletions.
  - **KNOWN GAPS (deliberately not fixed here)**: no CI; the build never
    typechecks; `lint` removed rather than repaired (no eslint config has ever
    existed); `server.ts`/`page.tsx` still 26k/22k lines and hold every remaining
    error; *shorts* and *microdrama* are still coerced to `film` by
    `create_production`.

- **NOW (2026-07-23 — this session, 3 commits):** **AGENT MODE/MEDIUM SCOPING + C3 CANONIZATION shipped.**
  (a) The helper agent is now scoped by WHERE you stand and WHICH medium: `getToolsForPhase(activeRow, mode)` — at the WORLD level it gets world-authoring + greenlight tools only (WORLD_DENY_TOOLS strips the 'always'-tagged generators: dream*, explore_prompts, breed/re_explore, music/score; the rest are storyboard/production-only already), and a world-architect/showrunner persona; inside a telling it gets that medium's kit + a medium-aware persona (film director / comic-studio page-director / microdrama). A medium-agnostic **SYSTEM_MAP** rides in EVERY mode so the agent knows all modes + how to cross between them. Client sends real `activeRow` + `mode` + `medium` (page.tsx). **Mode transitions are REAL**: the client now auto-descends into a telling when the agent calls `set_active_production` (was server-state-only; "opening the comic studio" is no longer a lie). `create_production` still coerces non-film|comic|episode → film (microdrama = roadmap).
  (b) **C3 CANONIZATION SHIPPED + live-verified**: locking a draft event into canon is a GATED, VALIDATED status flip (NOT a merge — merge is C4/T4). `canonizeEventCore` runs the telling's gate (`ProjectProduction.canonGate` = creator|vote|rule; creator fully live, vote/rule scaffolded for M2/M3) then a TEMPORAL check (diff canon-only `validateTemporalConsistency` before/after the simulated flip; only NEW violations block) and returns the four narrative resolutions (amend/retcon/bridge/fork). `canonize_production` bulk-locks a telling (chronology order, non-atomic, dryRun preview). World-authored events (no sourceProductionId) use the world creator gate, never the active telling's. REST: POST /events/:id/canonize|uncanonize, /productions/:id/canonize|canon-gate. Tools: canonize_event/uncanonize_event/canonize_production/set_canon_gate (phase 'always'). PATCH/update_event status→canon now routes through the gate (409 on block). Provenance = non-hashed WorldEvent.canonizedAt/canonizedBy (like `notes`); gate on the blob-native production — NO hashed-schema change. UI: WorldTimeline event toggle → validated canonize with a conflict panel (violations + resolution chips + override); lane panel gains gate selector + "Canonize this telling" (preview/lock). Live smoke test passed: conflict→409+resolutions, force override, uncanonize, vote-gate block, bulk dryRun/real. **REMAINING for the full flow: T2 streams/ingest, T3 hooks+distribution, M2 character studio, M3 living card game (vote gate + Aureum), C4/T4 event-aware MERGE + true play-space isolation.**
- **CHANGE RECORD SPEC v0.2 (2026-07-24) — reviewed from the ArgOS side, five
  blockers accepted and closed.** `docs/CHANGE_RECORD_SPEC_REVIEW.md` (not
  ratifiable as-is) → v0.2 fixes: **§3 Identity is now normative** (opaque
  `<kind>_<ULID>`, globally unique, MUST NOT derive from mutable fields — v0.1's
  `chr_malcor` slugs would have *silently fused* two same-named characters);
  **§8 makes the fold deterministic** (sole sort key `(at.t, eventId)`;
  `worldDate` demoted from ordering; one authoritative field per verb — `amount`
  for `adjust` (commutative), `after` for `set` (LWW); `before` is an assertion
  with a mismatch diagnostic; fold input set explicit); **`merge` verb added**
  (core is 12 + `declare`) since identity reconciliation *ships today* as silent
  ID rewrite (`entity-similarity.ts:11` already has the vocabulary); **§9.1
  effects at-most-once, never on replay** (v0.1 would have double-posted to real
  accounts and double-billed paid models); **§5 is an explicit discriminated
  union** (fixed `transfer` object-inversion, one name `audience`, `edgeId` on
  `link`). Also: `core.regard` added (v0.1's flagship `core.trust` wasn't in the
  core table), fold rules are a closed data set + a `declare` record so ArgOS's
  runtime-invented components can travel, §13 read-sets downgraded to DRAFT
  (unsound under `merge`/canonization), §14 squash restated per verb-class.
  **VERIFIED CORRECTIONS TO OUR OWN CODE**: `worldStateAt` defaults
  `canonOnly:true` while `validateTemporalConsistency` defaults `false` (same
  file); the hash gate refuses only the **ledger row** — the studio save proceeds
  (`server.ts:592`), so v0.1's "a schema that drifts cannot commit" was FALSE;
  `AuthorRefSchema` has 3 kinds vs the spec's 6; **6 of 12 verbs have no nit op**;
  the `rule` gate is an `approved:false` stub AND unreachable for simulation
  events (no `sourceProductionId` ⇒ falls to `creator`, which always approves).
  §11.3 lists the required nit migration. Aureum/Mythopia mapping rows remain
  UNVERIFIED — a maintainer must sign each before ratification.
- **(v0.1 original) → `docs/CHANGE_RECORD_SPEC.md`.**
  The altitude-2 interchange format — the universal narrative record all four
  systems write and read. **Directly answers ArgOS `CANON.md` §6 ("OPEN — yours
  to standardise"), which explicitly defers to us.** Adopts ArgOS's Three
  Altitudes (1 mechanical / 2 semantic / 3 narrative; only altitude 2 is
  transported) and makes its **Keystone Rule structural**: an Event with zero
  Changes is REJECTED at commit, so prose unbacked by a graph change is
  unrepresentable. Change record = `{subject, verb, component, object, before,
  after}` + event-level `author` / `causedBy` / `at` — satisfying all 7 of ArgOS
  §6's hard requirements (we currently fail 3: before/after, authorship,
  causedBy; `causes` is Mythopia-proven). Closed 11-verb core consolidating our 9
  `stateChange` kinds + Aureum's 7 `ChangeOperation`s + ArgOS's 11 scattered
  verbs (adds `spawn`/`destroy`, which Aureum lacks). Components in `core.*` /
  `drama.*` + `x.<vendor>.*` extensions **with a promotion rule** (ArgOS §7 proves
  open vocabulary self-corrupts without selection). Effects are collected-never-
  executed (Aureum's model) so the log stays complete. Adds read-sets → **precise
  invalidation** (the "Bill's hair changed" case) and **squash-as-view** (lossless,
  reversible; Mythopia ships the same idea as edition `compressions`). nit's
  round-trip hash gate is named as the anti-drift bar — ArgOS has EIGHT prior
  failed event-shape attempts, six live simultaneously. Conformance levels L1–L4
  per system. AWAITING RATIFICATION; no code.
- **MYTHOPIA COMPARISON (2026-07-23, no code):** Reviewed Michael's cofounder's
  repo (`HaruHunab1320/mythopia`) against this studio → **`docs/MYTHOPIA_COMPARISON.md`**.
  Finding: two halves of one system — **Mythopia = the story's physics** (curve/
  convergence engines, a **12-check story linter** vs our 2, knowledge ledger w/
  `hidden_from` → dramatic irony + per-audience spoiler check, "loaded guns" =
  accumulated charge of withheld truth, revealed-character, editions w/ POV +
  register); **we = the story's factory** (nit versioning — which literally answers
  his spec §18 open question on branching canon; C3 gates; durability spine;
  comic/film/timeline/export; 161 agent tools). Six independent convergences make
  them interoperable (event-log-as-truth, state-as-fold, one-world-many-tellings,
  temporal looks, ref-image identity, review-before-canon) — and both already run
  NB2 + Veo 3.1. Top takes: (1) his engines over our `WorldEvent[]` behind an
  adapter (read-only, very high value), (2) **VRL** — his closed 10-verb image-edit
  vocabulary + invariance clause + pixel scope validator + golden drift-alarm suite
  (our `edit_image` is free-form prompting; this is our weakest area, his strongest).
  Recommendation = **federation + library extraction**, not a full merge. AWAITING
  Michael + cofounder decision; Phase 0 (agree the shared event schema, incl. his
  ISO `world_date` vs our integer `chronologyIndex`) is a conversation, not code.
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
| Whole project (repo root `npx tsc -p .`) | **181 errors** | Re-measured 2026-07-24 after the cleanup. **ALL 181 are in `src/api/server.ts`** — every other file in `src/` is clean. Was 238 before (the doc said 212: it had silently ratcheted 204 → 212 → 238 because nothing ever checks it). |
| `ui/` (`npx tsc` in `ui/`) | **0 (clean)** | Keep it at 0. |
| `prototypes/timeline-warfare` (`npx tsc -p prototypes/timeline-warfare`) | **18** | Deliberately outside the studio's tsconfig. Informational only. |
| Last measured | 2026-07-24 (post cleanup) | Measure your DELTA with a git-stash A/B when the absolute number matters. |

> **Why this number keeps drifting:** nothing enforces it. There is no CI, the
> build uses esbuild (which strips types without checking them), there is no
> `typecheck` script, and `lint` was removed because no eslint config has ever
> existed. Until that changes, this table is an honour system — re-measure at
> session OPEN rather than trusting it.

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
