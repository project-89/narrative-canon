# Director Roadmap — becoming the best vibe-directing video agent

**Status**: `active` — **V1 SHIPPED 2026-06-21** (verified live); V2–V5 `design`,
order is Michael's call. See `STATE.md` for the live table.
**Author**: 2026-06-21, from a three-audit fresh review (docs/vision · agent
architecture/prompts · director UX) requested by Michael.

> **V1 shipped notes:** `watch_shot` went one better than designed — per
> Michael's call it attaches the ACTUAL clip as a native Gemini video part
> (motion + **audio** perception; timestamped-soundscape verified) with the
> ffmpeg sampled-frames path as fallback for oversized files. The directing-loop
> doctrine verified live: the agent authored beat-specific coverage, caught a
> continuity break in its own dailies, and promoted in stated editorial order.

## The diagnosis (one paragraph)

The studio is a strong **image-generation pipeline** with a genuinely good
collaborative persona. What's missing is the *director*: the agent has no
**eyes on video** (fire-and-forget jobs, never sees a frame of what it made),
no **eyes while curating** (candidate lists carry no images), no **film craft
doctrine** (the persona is a novelist, not a DP/editor), no **ears** (audio
tracks are stubs; no music/VO), and no **taste memory** (keep/reject signals
evaporate). The director has no **deliverable** (no MP4 export), no **dailies
loop** (video is single-slot, no takes/A-B/notes), and playback isn't a
screening (per-cut jank, clock drift). The "vibe" half of vibe-directing —
sound, motion, rhythm, accumulated taste — is the unbuilt half.

## The findings (F1–F9, with anchors)

Anchors are approximate (the monoliths shift); symbol names are the stable
reference.

- **F1 — Agent is blind to video (highest impact).** `generate_shot_video` /
  `generate_sequence_video` executors return "it is NOT done yet" and the agent
  never sees the finished clip or a single frame (`runVideoJob` ~server.ts:6187;
  executors ~13413/13438). No `_videoParts`, no frame extraction, no motion
  critique loop. → **V1 `watch_shot`**.
- **F2 — Agent is blind while curating.** `list_candidates` (~13735) returns
  URLs with no `_imageParts`; `explore_scene_angles` attaches only the first
  candidate. The agent curates coverage it cannot see. `src/visual/grid-composer.ts`
  (sharp, numbered grid) already exists — reuse. → **V1 curation grid**.
- **F3 — No craft doctrine.** The system prompt (inline template,
  ~server.ts:17282–17404) has real strengths — vision honesty (~17290), render
  diagnostics (~17351), proposal discipline — but zero cinematography: no
  coverage doctrine, 180°/eyelines, lens psychology, blocking, editorial
  rhythm; never told to default to explore→curate→promote for "shoot this
  scene"; no self-critique step. → **V1 director prompt**.
- **F4 — No sound.** Audio track *kind* exists (~11256) but nothing can be
  placed on one (`add_timeline_clip` is shot-only ~11271); no `audioUrl`
  anywhere; no music generation; no VO/voice casting. Only Veo-native per-shot
  audio (dialogue+SFX folded into the generation prompt ~6385). → **V2**.
- **F5 — No taste memory.** keep/reject toggles a boolean and nothing reads it
  back; `session.userDecisions` feedback covers narrative proposals only
  (~17010). Nothing accumulates "loves low-angle ECUs, hates soft focus" into a
  durable per-project profile that biases future generation. The biggest
  *conceptual* hole for vibe-directing. → **V3**.
- **F6 — No deliverable + playback isn't a screening.** Zero ffmpeg/concat/
  export path. Playback: single `<video>` with per-clip src swap, no preload
  (hitch at every cut), RAF clock drifts from the element (~page.tsx:15290–15352).
  Transitions are metadata-only. → **V1 ffmpeg foundation, V4 export+playback**.
- **F7 — No video takes / dailies.** `frame.video` is single-slot (re-animate
  overwrites ~6244); image takes exist (`frame.variants`) but video has no
  takes, no A/B, no stars/notes, no review surface. → **V4**.
- **F8 — Quick wins.** (a) Animate can't take a motion prompt — the handler
  accepts one but both UI call sites pass `undefined` (~page.tsx:20596, 21228);
  (b) `maxIterations: 8` (~17583) can't shoot a whole scene; (c) context decay —
  history `slice(-10)` flattened to text (~17001) + unbounded `worldSummary`
  (~16883); (d) 8s video poll latency. → **V1 (a,b,c)**.
- **F9 — Doc hygiene.** Stale "~156" typecheck baseline restated in
  `AGENTS.md`/`AGENT_OPERATIONS.md`/`STUDIO_DESIGN.md` (STATE.md has the real
  numbers); STUDIO_DESIGN's Vision section shows the pre-restructure phase
  order; relic docs carry no superseded banner; numbering glitches. → **V1.0**.

## The roadmap

| Phase | What | Key pieces |
|---|---|---|
| **V1 — FOUNDATION: the director's senses + brain** (SHIPPED 2026-06-21) | The agent can SEE everything it makes and thinks like a filmmaker. | ffmpeg + `video-frame-extractor` · `watch_shot` (native video + AUDIO perception) · curation contact-sheet grid (reuse `grid-composer`) · film-director system prompt (craft + directing-loop doctrine + self-critique) · step budget 8→24 · motion-prompt field on Animate · worldSummary cap |
| **V2 — LONG-FORM PRODUCTION ENGINE** (Michael's pick, 2026-06-21) | Vibe-direct it ALL from the agent at scale: right references every time, consistency across shots/scenes, complex long-form content. **Framing correction (Michael): this is NOT a new layer — the narrative-git graph already locks cast/location per scene (`participantIds`/`locationId`/`storyDiff`) and entities already carry the reference layer (referenceImage, labeled looks, linked assets). The 2026-06-21 scout found ~11 render sites that just don't consistently READ it (3 different cast behaviors; location attached by 1 path; video gets no refs at all). V2a = make every render path consult the graph.** | **V2a Graph-ref unification** — one `resolveShotReferences(scene, frame)` reading the EXISTING graph (participants→look-aware portraits, location ref, prior-shot anchor, linked assets) feeding `/render`'s existing style layer; agent args become overrides; everything stays visible in `referencesAttached` · **V2b `produce_scene`** — the pipeline as literal scene-producer: server-side async run (render every shot via the unified refs, optionally animate, per-shot progress — ExtractionJob's ChunkProgress is the template; persist run state on the scene, serial loop, no unbounded fan-out), agent supervises, human directs · **V2c `review_scene`** — continuity dailies (ordered scene strip, identity/wardrobe/lighting/style drift, proposed fixes) |
| **V3 — TASTE MEMORY** | Taste accumulates and biases generation. | Per-project `tasteProfile` in projectData: agent-written notes from director reactions + auto-signals from keep/reject labels · injected into the system prompt + render composition · `update_taste_profile` tool |
| **V4 — SCREENING ROOM** | Watch the cut; manage takes. | MP4 export (ffmpeg concat honoring virtual chop + audio mux) · double-buffered playback + element-driven clock · `frame.videoTakes[]` with A/B + promote · dailies strip · per-shot notes/ratings (feeds V3) |
| **V5 — CRAFT DEPTH** | Plan coverage; refine rhythm. | Coverage-plan artifact + planned-vs-captured · pacing targets per scene/act · rendered transitions · E2 Seedance explorer (ffmpeg from V1) · `suggest_keepers`/`summarize_candidates` · `re_explore_from_candidate`/`upscale_candidate` (E3) |
| **V6 — SOUND** (deferred — Michael, 2026-06-21: "sound is hard right now; the only way it really works is detailed Seedance prompting to the clips") | The missing half of vibe — when the model support is there. | Music/score generation · functional audio tracks (`audioUrl` on clips + playback + `add_timeline_clip` accepts audio) · VO/voice casting · until then: dialogue+SFX ride the Veo/Seedance generation prompts (already wired) |

**V3–V6 order is Michael's call — re-orderable at any phase boundary.**

## Design principles carried into this roadmap

- Every new capability is BOTH an agent tool AND a UI surface (agent-first).
- The agent must SEE what it makes before judging it (extends the vision-honesty
  rule from stills to video and candidate sets).
- Taste lives where it compounds: an explicit, inspectable profile — not
  invisible prompt injection (the director can read and edit their own taste
  profile).
- ffmpeg enters once (V1) and pays four times (frames, export, E2, audio mux).
