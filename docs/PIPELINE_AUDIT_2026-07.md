# Pipeline Audit — July 2026

**Codebase vs. `VIDEO_PIPELINE_PLAYBOOK.md`** — merged findings from six parallel audits:

| # | Audit scope |
|---|---|
| A1 | Agent tool surface (`narrativeWorldTools`, `TOOL_PHASES`, executors) vs. underlying REST/generators |
| A2 | System-prompt doctrine + the code paths it drives, vs. playbook §2 (model craft) and §4.5 (taste loops) |
| A3 | Video pipeline internals (generate-video, job runners, video/seedance/film/music generators) |
| A4 | Consistency architecture (resolveShotReferences, looks/castLooks, style pins, lineage, review/taste) |
| A5 | Studio UI (`ui/app/studio/page.tsx`) vs. backend capability parity |
| A6 | Data model + orchestration (jobs, persistence, schemas) vs. playbook checklist A/F/G |

Findings are deduped; each gap lists which auditors flagged it. Line numbers refer to
`src/api/server.ts` unless otherwise noted.

---

## 1. CRUCIAL GAPS (ranked)

### G1. Veo dialogue compilation uses the exact documented subtitle-burn-in anti-pattern — *A1, A2, A3*

**Evidence.** The only live code path that folds dialogue into a Veo prompt wraps lines in bare
quotation marks with no speaker attribution and no suppression directive:
`Dialogue, spoken aloud and lip-synced: ${frame.dialogue.map(d => `"${d}"`).join(' ')}`
(server.ts:6395–6404); the Seedance shot-script does the same (server.ts:6549). The playbook is
explicit (lines 106–112) that quotation-mark-only syntax is the #1 cause of Veo burning subtitles
into the frame, and that `Character says: "line"` colon syntax + an explicit
`(no subtitles, no text overlays)` clause prevents it ~95% of the time. Grep for "no subtitles" /
"says:" across server.ts: zero hits. The schema makes a proper fix impossible without a change:
`dialogue: array of string` (insert_frame server.ts:11617, update_frame server.ts:11927, zod at
11296) has **no speaker field**, so multi-person scenes can't attribute lines even if the fold were
rewritten. This path runs unconditionally in the shipped `produce_scene`/chain flow (6941–6947,
which passes no prompt override), and the doctrine (19236–19254) plus the quoted in-context
dialogue format (19105, 19150) teach the agent the same anti-pattern for hand-written prompts.

**Failure scenario.** Any dialogue-bearing shot animated via `generate_shot_video` or
`produce_scene(animate:true)` is a live candidate for burned-in subtitle text; in 2+ character
scenes the model cannot know who speaks which line, causing misattributed lip-sync.

**Recommendation.** (a) Change `frame.dialogue` to `{speaker, line}[]` (or resolve speaker from
`participantIds`); (b) rewrite the auto-fold to emit `<Speaker> says: "<line>"` and always append
`(no subtitles, no text overlays)` — both Veo and Seedance paths; (c) add the same syntax rule to
the system-prompt doctrine so agent-authored motion prompts follow it (see G12).

---

### G2. No deterministic post-render QC, and no way to watch the final export — *A1, A3*

**Evidence.** Every quality check in the pipeline is agent-vision-only (`watch_shot`,
`review_scene`). There is no ffprobe codec/resolution/duration probe, no audio silence/clipping
analysis, and no subtitle-presence detection anywhere in `runVideoJob`, `runSequenceJob`, or
`src/visual/film-exporter.ts`. `check_export` (15422–15443) reports only job progress + structural
skip warnings. No `watch_film` tool exists — `watch_shot` (15542–15580) reaches a single shot's
clip or one windowed cut of a scene sequence, never the exported MP4. This violates the playbook's
"mandatory, not optional" pre-compose/post-render QC gate (checklist D) **and** the studio's own
vision-honesty doctrine ("never describe a video you haven't watched") at the highest-stakes
moment: the deliverable the creator downloads.

**Failure scenario.** A clip with burned-in subtitles (G1), a truncated/corrupt mp4, or a silent or
clipped audio mux ships as "done" — nothing deterministic or agentic would ever flag it.

**Recommendation.** (a) A lightweight ffprobe gate (stream/codec/duration sanity + `silencedetect`)
that runs automatically after `runVideoJob` and `exportSegmentsToMp4`, surfacing warnings on the
job/export result the way film-exporter already does for missing segments. (b) A `watch_film` tool
that ffprobes the export, samples N frames as image parts, and carries forward export warnings —
reusing the existing video-frame-extractor + grid-composer machinery from `watch_shot`.

---

### G3. Metadata hemorrhage: no dailies states, no reviewer notes, no seed/cost/refs on takes — *A1, A3, A5, A6*

The playbook names this failure mode verbatim (lines 44–45, checklist A: "prompt, refs used, seed,
model+version, cost, timestamps, parent shot ID" + "select/maybe/reject/approved with reviewer
notes + regen notes"). Four auditors independently hit it from four directions:

- **Image candidates:** `keep_candidate`/`reject_candidate` take only `candidateId` (11669–11681)
  and set a bare boolean (setCandidateKeepCore, 14943–14949). No maybe state, no note — a rejected
  take's WHY evaporates at the moment of rejection.
- **Video takes:** `frame.videoTakes` entries carry only `{url, status, backend, prompt,
  generatedAt, takenAt}` (6420–6429, 7317–7327; ui page.tsx:218–225). No select/maybe/reject/
  approved state, no notes, and the UI take-strip (page.tsx:21151–21216) offers only
  Preview/Promote — a regression vs. the stills Explore gallery, on the *more expensive* artifact.
- **Seed:** Veo's `VeoVideoOptions` (src/visual/video-generator.ts:32–43) has no seed field at all;
  Seedance's existing seed support (seedance-generator.ts:52) is never surfaced. The playbook's
  drift-recovery pattern ("same seed + stronger identity language", "chain from the least-drifted
  candidate") is unusable.
- **Cost + refs:** no cost field exists on any job or take (VideoJob 6170–6190, ProductionJob
  6798–6812, DreamFilmJob 7348–7354); stills record `lastImageReferencesAttached` but
  `frame.video` has no refs-used equivalent.
- **Review verdicts:** `review_scene` (15451–15492) and `watch_shot` critiques write nothing back
  onto the frame/take — the judgment lives only in the chat transcript, so a later session must
  re-watch and re-judge from scratch.

**Recommendation.** One coherent fix: (a) add `state: 'select'|'maybe'|'reject'|'approved'` +
`note` to both exploration candidates and videoTakes, settable via keep/reject (extended) and a
small take-verdict tool; (b) have `review_scene` write per-panel verdicts back onto shots; (c)
persist `seed`, `refUrls`, `model+version`, and a `costEstimate` on `frame.video`/`videoTakes`,
mirroring what stills already record; (d) thread seed through `VeoVideoOptions` and the Seedance
path.

---

### G4. No enforced budget/cost governance anywhere — *A1, A5, A6*

**Evidence.** Every "budget" in the codebase is a render *count* (dream `renderBudget` 11769–11774,
clamped 4–40 at 15202) or a reference-count cap — never a dollar figure, and never enforced in
code. The only cost guardrails are prose in tool descriptions ("ANIMATE COSTS REAL MONEY",
19252; "Confirm cost with the creator… unless pre-authorized", 11756) that the LLM can simply
not follow. `dream_film` — the fully-autonomous, human-absent-by-design overnight job
(7365–7443) — has **no budget field at all**: CONCEIVE can produce 3–5 scenes × 2–4 shots and
PRODUCE then animates/chains every one unconditionally with nobody online to confirm. No running
spend total, per-action estimate, or approval threshold exists in the tool surface or the UI
(playbook checklist G2; OpenMontage's concrete defaults: $0.50 approval threshold, $10 cap).

**Recommendation.** (a) A static $-per-call table by model/backend; (b) a project-level running
spend total surfaced in tool results and near the Produce/Export UI; (c) a hard budget field
(clip count + $ cap) on DreamFilmJob/ProductionJob, computed pre-execution and enforced
(pause/stop) mid-run; (d) UI cost-estimate + confirm gate on scene-wide animate.

---

### G5. The UI's own render buttons bypass the consistency layer and pinned style images — *A4*

**Evidence.** V2a's graph-reference unification (commit c7a2ad5, "the narrative graph IS the
resolver") patched only the agent-tool executors (14326, 14408, 14524, 14746, 13012). The two raw
Express endpoints the UI calls directly — `POST /api/narrative/visual/scene/:sceneId` (4445) and
`POST /api/narrative/visual/frame/:sceneId/:frameId` (4801), backing the UI's primary "Generate
Scene Image" / "Generate Frame Image" buttons (page.tsx:4254–4260, 4505–4511, plus 3931 and
4714) — still run the legacy resolver (`resolveSceneReferences` 9876 + `resolveEntityReferenceAssets`
9712–9759), which reads only `entity.referenceImage`/`imageUrl`/`portraitVariations` and **never
consults `imageGallery` (labeled looks), `scene.castLooks` (the wardrobe lock), or per-frame
`entityLooks`**. Verified: zero occurrences of castLooks/entityLooks/imageGallery in lines
4445–5780. The same endpoints also never attach the project's pinned style-reference **images**
(`styleProfile.styleAssetIds`) — text-only style — directly contradicting the locked decision in
STATE.md (2026-06-20: "Style = a pinned reference IMAGE; NB2's realism bias beats any text style
spec") and the code's own comment at 4091–4096. `/render` (4151), `buildProjectStyleForEdit`
(4098), and the portrait endpoint (5891–5919) all do it correctly.

**Failure scenario.** A human clicking the UI's core render buttons silently breaks a wardrobe
lock or drifts off-style in ways the agent path would never allow — the exact bug class V2a set
out to eliminate, now split across two code paths.

**Recommendation.** Route both endpoints through `resolveShotReferences` + the style-pin
attachment (or have them proxy `/render` entirely) so there is one source of truth for reference
and style application.

---

### G6. Chained animation never re-anchors identity; drift compounds unchecked — *A2, A4*

**Evidence.** `chain:true` (6941–6947, 6970–6990) passes only `firstFrameUrlOverride` (the prior
clip's harvested last frame) into `/generate-video`. No character/location reference images travel
with the video call — `VeoVideoOptions` has no referenceImages/ingredients field at all (only
firstFrame/lastFrame) — and the motion prompt never restates identity/wardrobe descriptors (only
dialogue/SFX are folded, 6376–6404). This is the playbook's strongest continuity rule violated
twice over: "the model has no memory across generations — re-state full identity descriptors
verbatim" and "re-anchor to the ORIGINAL reference, never a generated frame… drift compounds per
hop" (lines 143–153, 192–196). The doctrine (19244–19254) gives no chain-length cap or
re-anchoring guidance. Related: `re_explore_from_candidate` (15094–15122) always mutates from the
most recent *generated* candidate with no depth cap and no forced re-inclusion of the original
portrait — the same anti-pattern in the stills lane (see I5).

**Recommendation.** (a) Fold a short verbal identity/wardrobe line (drawn from the already-resolved
castLooks) into every chained motion prompt — the data is already computed, costs nothing;
(b) doctrine: cap chain length and prescribe periodic re-anchor to the original portrait/still
rather than always the prior clip's tail frame; (c) if/when the SDK exposes Veo
Ingredients-to-Video, thread the resolved refUrls into the video call (see I9).

---

### G7. Non-atomic project persistence — one crash can corrupt the whole project — *A6*

**Evidence.** `saveProjectData` (294–320) does a direct `fs.writeFileSync` over the single
`project_<id>.json` — no write-to-temp-then-rename. This one file is the sole source of truth for
the entire project and is rewritten on **every step of every long-running job** (every shot
render/animate in runProductionJob: 6862, 6883, 6996, 7044; every dream-film stage: 7357–7363). A
crash mid-write during a multi-minute unattended run can truncate the file and corrupt every
scene/entity/timeline, not just the in-flight job.

**Recommendation.** Write to a temp file and `rename()` over the target (atomic on POSIX). This is
a ~5-line fix with catastrophic-downside coverage; do it first.

---

### G8. Agent cannot control duration/resolution/backend — every clip is a full-price 8s render — *A1, A3*

**Evidence.** The `generate_shot_video` tool exposes only `{sceneId, frameId, prompt}`
(11559–11567) and the executor forwards nothing else (14600–14623), yet the REST endpoint and job
runner already accept `backend`, `resolution`, and `duration` (6351–6436;
video-generator.ts:32–43 supports 720p/1080p/4k). The `duration` param exists end-to-end but **no
caller ever populates it** — not the UI (`handleGenerateShotVideo`, page.tsx:4857–4877) and not the
tool — so every Veo generation requests a full 8s clip (video-generator.ts:76) even for a 2s
cutaway whose `frame.durationSec` is already tracked, wasting money/latency on frames that get
virtually chopped away. Single-shot Seedance is architecturally unreachable from chat.

**Recommendation.** Add optional `durationSec`, `resolution`, `backend` to the tool schema and
thread them through the existing plumbing; default `duration` to the shot's `frame.durationSec`
clamped to Veo's {4, 6, 8}; expose duration on the UI Animate control.

---

### G9. The human director is locked out of shipped capabilities — agent-first features have no UI surface — *A5*

A consistent pattern: the newest, highest-leverage capabilities (V2a/V2c/V3/V4d) were built
chat-first and never surfaced, even where the artifact already exists on disk:

- **Dailies/review invisibility (most concrete):** `review_scene` and `watch_shot` return their
  composed grid/clip only as base64 `_imageParts`, which are stripped before the SSE payload
  reaches the browser (19550–19568); neither result includes an `imageUrl`. `buildCandidateGridPart`
  (13311–13335) even writes the composed PNG to disk but never returns a servable path. The chat
  UI's inline-visual renderer (page.tsx:8013–8039) only picks up `result.imageUrl`/`imageUrls`.
  The human sees only the agent's prose — never the numbered dailies strip or the clip. No
  dedicated Dailies view exists anywhere in page.tsx.
- **Batch/chained video is chat-only:** `handleProduceScene` (page.tsx:18942–18966) hardcodes
  `animate: false`; no toggle for animate/chain exists anywhere in the UI, even though the backend
  fully supports scene-wide video with last-frame chaining — the single most expensive/valuable
  capability in the pipeline has no button.
- **Taste memory invisible:** `tasteProfile` has zero references in page.tsx, directly violating
  the roadmap's own design principle ("the director can read and edit their own taste profile —
  not invisible prompt injection"). Taste *is* invisible prompt injection today.
- **Wardrobe lock invisible:** `castLooks`/`set_scene_looks` have zero UI matches. The look
  *album* is visible (EntityWorkbench gallery, page.tsx:11766–11809) but the binding (which look
  is locked for which scene) is chat-only.

**Recommendation.** (a) Return servable URLs from review_scene/watch_shot so the existing inline
renderer picks them up for free (near-zero cost, high trust payoff); (b) animate/chain toggles +
cost confirm on Produce scene; (c) a small editable taste-profile panel; (d) castLooks editor in
SceneDetailView's continuity tab (character → look dropdown from the labeled gallery); (e) longer
term, a Dailies board modeled on the Explore gallery's contact-sheet + keep/reject shape.

---

### G10. Long-running autonomous jobs are not restart-recoverable — no auto-resume exists — *A6*

**Evidence.** VideoJob/ProductionJob/DreamFilmJob live in in-memory Maps (6191, 6814, 7150, 7355)
and are checkpointed to disk after every step, but `startServer()` (23067–23089) does no boot-time
scan to resume jobs whose persisted status is pending/processing. GET endpoints only offer
diagnostic fallbacks ("Server restarted mid-run… re-run produce-scene to continue", 7116) —
nothing restarts the work, and there is **no resume endpoint for dream_film at all** (POST
/dream-film, 7445, always starts a fresh job at 'conceive'). A crash mid-way through the flagship
overnight job permanently strands it; the on-disk status also stays stuck in-progress forever
(no 'interrupted' terminal state is ever written).

**Recommendation.** Boot-time sweep over `scene.productionRun`/`lastDreamFilm` for non-terminal
statuses → either auto-resume from persisted progress or mark 'interrupted' so the UI/agent
prompts a resume. Tighten DIRECTOR_ROADMAP's "restart-recoverable" language to
"restart-diagnosable, manually resumable" until then (see Notes).

---

### G11. Audio: the tool shape and UI are absent, not just the features — *A1, A3, A5*

STATE.md already flags audio as "the biggest gap"; these audits sharpen it to the specific
blocking shapes:

- The only generation tools are `generate_music` (single MusicGen loop) and `compose_score`
  (bespoke synth), both writing to one project-level `musicTrack` field (11816–11830,
  15373–15399). No VO/TTS, no SFX, no stems, no room-tone (grep for ElevenLabs/TTS/voice/stems:
  nothing).
- **Structural blocker:** `add_timeline_track` allows `kind:'audio'` (12165–12171) but
  `add_timeline_clip` requires `sourceSceneId`+`sourceShotId` (12181–12192) — there is no way to
  place any generated audio asset on an audio track at all; the music bed bypasses the timeline
  entirely. Same hard-requirement in the UI (`handleAddTimelineClip`, page.tsx:3045).
- **Zero UI:** `musicTrack`/`generate_music`/`compose_score` have no matches in page.tsx. A
  director cannot know a score exists, hear it, replace it, or remove it without exporting the
  whole film.
- **Licensing:** `generate_music` uses MusicGen (several checkpoints non-commercial) with no
  licensing note; `compose_score` is the sync-safe path but nothing steers anyone toward it
  (playbook §3.2 requires tracking music licensing before committing a commercial pipeline).

**Recommendation (for V6).** (a) `add_audio_clip` timeline tool accepting an asset URL directly
(no sourceShotId); (b) a VO tool first — the higher-leverage slice per the playbook's OpenMontage
stack — before section-level music; (c) surface `musicTrack` in the Timeline with an inline player
+ replace/remove; (d) licensing note on generate_music pointing at compose_score for anything
shipping.

---

### G12. Zero model-specific craft in the system prompt — the doctrine never names Veo — *A2, A3*

**Evidence.** The persona/craft doctrine (19216–19366) is strong DP-theory (shot grammar, lens
psychology, eyelines, editorial rhythm) but never mentions Veo, Seedance, or any backend, and
encodes none of the playbook's model-specific syntax: no Veo 5-part formula
([Cinematography]+[Subject]+[Action]+[Context]+[Style&Ambiance]), no colon-dialogue +
no-subtitles rule, no `SFX:`/`Ambient noise:` labeled-line convention or ~4-layer cap, no audio
trim priority (dialogue > SFX > ambience > music), no positive-phrasing negative-prompt rule, no
"one primary camera movement + 2–3 modifiers" ceiling, no Veo-parseable movement vocabulary
(dolly/truck/pedestal/crane/orbit/whip-pan) or focal-length language. The Animate step (19249)
demands "a real MOTION prompt" but gives the agent no craft sheet for what makes one good on Veo —
quality depends on incidental model knowledge, and the anti-patterns in context (quoted dialogue,
19105/19150) actively teach the wrong syntax.

**Recommendation.** Add a compact "Veo prompt craft" doctrine block near the Animate step encoding
the items above, in the same pass as the G1 compiler fix so doctrine and code agree.

---

### G13. No canonical shared Scene/Frame/Take schema — types are duplicated by hand — *A6*

**Evidence.** `src/types.ts`'s Scene/SceneFrame (41–95) is a vestigial skeleton
(`[key: string]: any`) never actually used by server.ts. The real runtime shape (video,
videoTakes, castLooks, productionRun, explorations, variants…) exists only as (a) ad hoc
`any`-typed mutation across ~23k lines of server.ts and (b) a separately hand-maintained client
interface (page.tsx:129–226). STATE.md has already logged the resulting bug class once: "the old
whitelist silently DROPPED top-level fields… on server restart the timeline vanished"
(server.ts:246–251 comment; mapScenesFromApi gotcha #16).

**Recommendation.** One shared zod-validated schema for Scene/Frame/Job types imported by both
server and UI, replacing the duplicated interfaces.

---

### G14. No animatic stage — motion budget is spent before pacing is validated — *A5, A6*

**Evidence.** Zero occurrences of "animatic" anywhere in the repo. The playbook calls timed
stills + scratch audio before motion generation a non-negotiable (lines 39–41; checklist F):
"pacing problems are cheap to fix on stills, expensive on generated video." `produce_scene`
interleaves render and animate in the same serial loop (6887–6968) with no stills-first pacing
gate, and no doctrine nudges assembling/reviewing stills on the timeline before `animate:true`.
The timeline already supports mixed still/video cuts (V4a verified a 3s-video + 2s-still export),
so the infrastructure exists.

**Recommendation.** A lightweight "Animatic" mode within the existing Timeline (stills-only clips
+ durations + scratch audio once G11 lands), plus one doctrine line: assemble and watch the
animatic before spending on motion.

---

## 2. IMPROVEMENTS worth doing

**I1. Veo generation params: seed, negativePrompt, sampleCount, generateAudio** — *A1, A2, A3, A5.*
`VeoVideoOptions` (video-generator.ts:32–43, 71–84) never sets seed, negativePrompt, or
sampleCount despite all being live, documented Veo 3.1 params the playbook names; there's no
`generateAudio` toggle on the Veo path (Seedance's sequence tool has one), so audio always
generates even for purely-visual shots. Negative prompts are also the named mitigation for
morphing/extra-limb failures — currently the agent has no lever besides blind re-rolls. Plumb all
four through `generate_shot_video` → `/generate-video` → the config object; optionally an
"advanced" seed/negative field in the UI Animate controls.

**I2. Retry/backoff + variants for video jobs** — *A1, A3.* runProductionJob (6887–6968) and
runVideoJob (6268–6280) make exactly one attempt per step; a transient rate-limit/timeout on an
8-minute run kills that shot outright. Add a bounded retry (1–2 attempts with backoff) before
marking error; consider an optional `variants: N` on generate_shot_video landing N takes in
`frame.videoTakes` for A/B via watch_shot ("2–3 candidates, chain from least-drifted" per
playbook checklist C).

**I3. Feed video outcomes into the taste/prompt ledger** — *A2, A3.* `get_prompt_outcomes`
(15250–15283) harvests exclusively from image exploration candidates and `frame.renderHistory`.
watch_shot verdicts and videoTakes are never read, so no Veo/motion-prompt lesson (dialogue
syntax, chain-drift thresholds, audio layering) can ever be legitimately recorded under the
ledger's own evidence rule — motion craft cannot compound the way image craft does. Extend the
harvest to judged video outcomes once G3's take verdicts exist.

**I4. Character-bible turnarounds + converge the fragmented entity image arrays** — *A4.*
`buildCharacterPrompt` (entity-portrait-generator.ts:322–345) produces a single frontal bust per
entity; there is no front/¾/profile triplet flow, so `resolveShotReferences` attaches the same
frontal portrait no matter how far the shot's camera diverges. Separately, `imageGallery`
(labeled looks; the V2a system) and `portraitVariations` (unlabeled alternates; legacy resolver
only, 9932–9946) are never reconciled — each resolver is blind to the other's array. Add a
`generate_entity_angles` (grid-mode, one generation) storing labeled gallery entries; prefer
closest-angle look when camera direction is known; converge on `imageGallery` as the single array.

**I5. Re-anchor discipline + true lineage depth for exploration mutations** — *A4.*
`re_explore_from_candidate` (15094–15122) always mutates from the latest generated candidate —
the literal playbook anti-pattern ("re-anchor to the ORIGINAL reference, never a generated
frame") — with no depth cap, and the UI lineage badge always reads "gen 2" regardless of actual
chain depth (page.tsx:20642–20643). Auto-include the entity's canonical portrait alongside the
mutation anchor for identity-bearing mutations; track and surface real depth.

**I6. Reference-cap priority ordering + style-pin growth cap** — *A4.* `resolveShotReferences`'
cap (default 8, 13443–13447) truncates in insertion order, so a large ensemble can silently drop
the location ref or continuity anchor; style refs ride on top uncapped, and
`pin_style_from_candidate` grows `styleAssetIds` indefinitely. Reserve slots for location/anchor
before filling cast (or let NB2's real 14-ref ceiling drive the cap); soft-cap/warn on style-pin
growth.

**I7. Quantitative drift pre-flags** — *A4.* Zero programmatic drift signal exists (no
embedding/histogram/phash anywhere); all consistency QC is LLM-vision. Even a crude perceptual-
hash/palette-delta between a shot and its resolved reference would let review_scene auto-flag
likely-drifted panels before the LLM looks, cutting review cost on long scenes.

**I8. Grid-mode for explore_scene_angles** — *A1.* Each angle is a separate generation
re-anchored to the seed; `generate_storyboard_page` (12031–12042) already implements the better
pattern the playbook praises — all panels as tiles of ONE generation ("consistency a property of
one generation, not an alignment problem across N"). Offer a grid-mode variant for scenes where
identity consistency across angles matters most.

**I9. Identity conditioning in the video call itself** — *A3, A4.* Veo generation conditions on a
single firstFrame only; Seedance already implements `referenceImages` (up to 9). When the SDK
exposes Veo Ingredients-to-Video, thread the refUrls `resolveShotReferences` already computes into
the video call. (The cheap text-level insurance is part of G6.)

**I10. Export parity, history, and handoff** — *A5, A6.* The UI Export button POSTs only
`{projectId}` while `export_film` accepts `resolution`; `lastExport` is a single overwritten
object (no `exportHistory[]`); no OTIO export or review-links exist anywhere (playbook checklist
F). Pass through a resolution selector (+ music toggle once audio UI exists); keep an export
history; scope OTIO separately if human NLE handoff becomes a priority.

**I11. Continuity-columns shot list** — *A5, A6.* SceneFrame has no discrete
wardrobe/props/palette/time-of-day fields (wardrobe is per-scene castLooks only; palette/ToD live
in prose), and no view renders shots as a scannable continuity table. Add the structured columns +
a table toggle on ScreenplayView/Production so continuity checks can diff fields, not re-parse
prose.

**I12. Orchestration hygiene** — *A6.* (a) `dream_film` has no concurrency guard (produce_scene's
scene-scoped 409 exists, 7073–7079; nothing stops two dream_films or an overlap with a manual
run) — add a project-scoped guard, especially before MCP exposure; (b) stale persisted job
statuses after restart should be rewritten as 'interrupted' by the fallback GET paths; (c) the
five in-memory job Maps are never pruned (`.delete()` never called) — add a terminal-state sweep;
(d) a `GET /jobs?projectId=` registry endpoint aggregating all job Maps, as the substrate for a
future production board (playbook checklist G).

**I13. Seedance honesty in the UI** — *A5.* The Animate backend control (page.tsx:21816–21834)
presents Veo and Seedance as unwarned peers despite the STATE.md decision that Seedance rejects
photoreal faces (E005 gate). Hide it from the default toggle or add a caveat tooltip.

**I14. MusicGen licensing note** — *A3.* (Folded into G11's recommendation; listed here because it
is shippable standalone in one sentence of tool description.)

### Notes (small/deferred)

- **TOOL_PHASES dead key:** `list_timeline_clips` (12929) doesn't match the actual tool
  `list_timeline` (12155); the defensive default makes it always-available instead of
  production-scoped. Rename the key. — *A1*
- **Doc language:** DIRECTOR_ROADMAP's "restart-recoverable" for produce_scene overstates —
  it's restart-*diagnosable* and manually resumable. Tighten until G10 lands. — *A6*
- **Seedance @Video/@Audio omni-reference slots** (motion blueprint, VO/beat sync) are
  unimplemented — only relevant if the cel-shaded track unshelves Seedance. Extend
  SeedanceVideoOptions then, and fix the negative-phrase constraint line at 6571 ("avoid X" →
  positive phrasing) in the same pass. — *A2, A3*
- **@-token portability:** the /render path's type/description reference tagging is Gemini-native
  and works, but won't transfer if Kling/Runway/Seedance stills ever return; worth an internal
  role-labeling scheme that compiles to either convention. — *A4*

---

## 3. CONFIRMED ALIGNED (state-of-the-art already)

1. **resolveShotReferences is the real thing** — *A1, A4, A6.* One function (13359–13449) is the
   single source of truth across ~9 call sites, with a well-reasoned look priority (per-call
   entityLooks → frame-persisted → scene.castLooks → entity primary) and `describeRefBreakdown`
   surfacing the resolved set on every call — a faithful implementation of the playbook's "two
   complementary mechanisms" rule and its "nothing is invisible" requirement. The reference model
   for fixing G5.
2. **watch_shot's native video+audio ingestion exceeds the playbook** — *A2, A3.* The actual mp4
   attaches as a native Gemini video part (motion AND audio, with videoMetadata windowing for
   sequence cuts) with frame-sampling fallback — satisfying the VLM-critic-loop and mid-clip
   inspection requirements (Veo's ~62% "teleport" failure mode needs exactly this).
3. **Chaining mechanics are correct** — *A1, A2, A3.* `produce_scene {chain:true}` implements the
   playbook's manual frames-to-video chaining method faithfully, breaks the chain on a failed clip
   rather than leaping shots (the documented anti-drift-compounding behavior), and the
   anti-boomerang interpolation-prompt fix shows real empirical Veo debugging. (Identity
   re-anchoring is the missing companion — G6.)
4. **review_scene is a strong critic-loop instantiation** — *A4.* Ordered numbered contact sheet,
   intended-cast + locked-looks statement so intent is compared against what rendered, and a
   script-supervisor pass discipline ("name problems BY PANEL NUMBER, propose the concrete fix") —
   matching the Genflow-style adversarial pattern (42%→89% yield) the playbook cites.
5. **Taste profile + prompt-outcome ledger implement playbook §4.5 almost exactly** — *A4.*
   `judgedAt` distinguishes real rejections from un-curated candidates; outcomes are queryable per
   backend; lessons require ≥3 examples of evidence. (Image-only for now — I3.)
6. **The latent-exploration suite is a genuine differentiator** — *A1, A5.* Batch exploration,
   style-axis matrices, directed mutation lineages, and candidate breeding with parent tracking
   exceed anything in the playbook's checklist; the Explore gallery UI (keyboard-first curation,
   lineage badges, axis chips, drag-to-order promote) is the template a future Dailies board
   should copy.
7. **The phase rail maps cleanly to the canonical pipeline** — *A5.* Style → Story → World →
   Storyboard → Script → Explore → Production with Assets cross-cutting — including a dedicated
   Explore/curate stage most competitors don't separate. Give future Dailies/Audio their own rail
   slots rather than burying them.
8. **Checkpointing, virtual-chop timeline, and image version history are solid foundations** —
   *A6.* Per-shot progress mirrors to disk after every step with graceful disk-backed GET
   fallbacks (the substrate G10 needs); the inSec/outSec virtual-chop timeline matches checklist
   F's per-shot-regeneration requirement; `frame.variants` (capped 12) implements "superseded
   takes never silently overwritten" for stills.
9. **The Seedance @-token compiler is production-quality and correctly shelved** — *A1, A3.*
   composeSequencePrompt/assembleSequenceRefs correctly implement the cross-vendor @-token
   role-assignment convention; shelving Seedance over photoreal-face rejection matches the
   playbook's own verdict. Ready to reuse if the cel-shaded track matures.
10. **Docs are honest** — *A6.* STATE.md's roadmap statuses and verification ledger checked out
    against code everywhere spot-checked; "restart-recoverable" is the single overstatement.

---

## 4. PROPOSED BUILD ORDER

Ordered by (risk removed × cost), respecting dependencies. Waves 0–2 are mostly small diffs to
existing code; the plumbing for much of it already exists one layer down.

### Wave 0 — same-day safety patches (hours)
1. **Atomic writes** (G7): temp-file + rename in `saveProjectData`. Five lines; removes the
   whole-project-corruption tail risk before any more overnight runs.
2. **Dialogue fix** (G1): colon syntax + `(no subtitles, no text overlays)` in the runVideoJob
   fold (and Seedance script); add `speaker` to the dialogue schema.
3. **Expose duration/resolution/backend on generate_shot_video** (G8); default duration from
   `frame.durationSec` clamped to {4,6,8}. Immediate cost savings on every short shot.
4. **Servable URLs from review_scene/watch_shot** (G9a): buildCandidateGridPart already writes the
   PNG — return the path so the chat inline renderer shows dailies for free.
5. TOOL_PHASES key rename (note).

### Wave 1 — stop the metadata and money bleed (days)
6. **Dailies states + notes** (G3): select/maybe/reject/approved + note on candidates and
   videoTakes; review_scene writes verdicts back onto shots.
7. **Take metadata** (G3): seed, refUrls, model+version, costEstimate persisted on
   frame.video/videoTakes; seed threaded through VeoVideoOptions.
8. **Budget governance** (G4): static $-table, running project spend in tool results,
   enforced cap checked by produce_scene/dream_film/generate_shot_video; budget field +
   concurrency guard on dream_film (I12a).
9. **Retry/backoff in runVideoJob/produce_scene** (I2).

### Wave 2 — consistency correctness (days)
10. **Legacy UI endpoints → graph resolver + style pins** (G5): proxy `/render` or call
    resolveShotReferences; closes the wardrobe/style bypass.
11. **Chain identity re-anchoring** (G6): castLooks identity line folded into every chained motion
    prompt; doctrine chain-cap + re-anchor rule.
12. **Veo craft doctrine block** (G12): 5-part formula, colon dialogue, one-camera-movement
    ceiling, audio layer conventions, positive negatives — shipped in the same PR as 11 so code
    and doctrine agree.

### Wave 3 — QC and trust (about a week)
13. **Deterministic QC gate** (G2): ffprobe + silencedetect after runVideoJob and export, warnings
    on job results.
14. **watch_film tool** (G2): probe + frame-sample + warnings for the final export.
15. **Video outcomes → taste ledger** (I3), now that take verdicts exist (6).

### Wave 4 — human-director parity (UI sprint)
16. Animate/chain toggles + cost-estimate confirm on Produce scene (G9b, uses 8).
17. castLooks editor in the scene continuity tab (G9d).
18. Taste-profile panel (G9c).
19. Export resolution selector + exportHistory (I10); Seedance caveat/hide (I13).
20. Dailies board (G9e) — clone the Explore gallery shape onto rendered shots/takes.

### Wave 5 — structural + V6 audio
21. Shared zod schema for Scene/Frame/Take (G13) — do before audio adds new shapes.
22. Boot-time job sweep + 'interrupted' terminal state + dream_film resume (G10, I12b/c);
    jobs registry endpoint (I12d).
23. Animatic mode on the existing timeline (G14).
24. **Audio V6** (G11): `add_audio_clip` (URL-based, no sourceShotId) → VO tool → music UI
    surfacing → licensing note (I14) → then section-level music/stems.

### Wave 6 — opportunistic craft improvements
25. Character turnarounds + entity-array convergence (I4); re-anchor/lineage depth (I5);
    ref-cap ordering + style-pin cap (I6); drift pre-flags (I7); grid-mode angles (I8);
    Veo params seed/negative/sampleCount/generateAudio (I1, partially landed in Wave 1's seed);
    Ingredients-to-Video when the SDK allows (I9); continuity columns (I11); OTIO scoping (I10).

---

*Sources: six audit passes over `src/api/server.ts`, `src/visual/*` (video-generator,
seedance-generator, film-exporter, music-generator, score-composer, entity-portrait-generator),
`ui/app/studio/page.tsx`, `src/types.ts`, against `docs/VIDEO_PIPELINE_PLAYBOOK.md`,
`docs/STATE.md`, and `docs/DIRECTOR_ROADMAP.md`. Line references are to the audited revision
(branch `studio/script-view-nav-rail-style-fixes`, July 2026).*
