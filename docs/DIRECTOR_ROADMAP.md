# Director Roadmap — becoming the best vibe-directing video agent

**Status**: `design` (V1 is `building` — see `STATE.md`).
**Author**: 2026-06-21, from a three-audit fresh review (docs/vision · agent
architecture/prompts · director UX) requested by Michael.

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
| **V1 — FOUNDATION: the director's senses + brain** (building) | The agent can SEE everything it makes and thinks like a filmmaker. | ffmpeg + `video-frame-extractor` · `watch_shot` (video eyes) · curation contact-sheet grid (reuse `grid-composer`) · film-director system prompt (craft + directing-loop doctrine + self-critique) · step budget 8→24 · motion-prompt field on Animate · worldSummary cap |
| **V2 — SOUND** | The missing half of vibe. | Music/score generation (Replicate backend — token already plumbed) · functional audio tracks (`audioUrl` on clips + playback + `add_timeline_clip` accepts audio assets) · VO/voice casting later · ffmpeg (V1) enables the export mux |
| **V3 — TASTE MEMORY** | Taste accumulates and biases generation. | Per-project `tasteProfile` in projectData: agent-written notes from director reactions + auto-signals from keep/reject labels · injected into the system prompt + render composition · `update_taste_profile` tool |
| **V4 — SCREENING ROOM** | Watch the cut; manage takes. | MP4 export (ffmpeg concat honoring virtual chop + audio mux) · double-buffered playback + element-driven clock · `frame.videoTakes[]` with A/B + promote · dailies strip · per-shot notes/ratings (feeds V3) |
| **V5 — CRAFT DEPTH** | Plan coverage; refine rhythm. | Coverage-plan artifact + planned-vs-captured · pacing targets per scene/act · rendered transitions · E2 Seedance explorer (ffmpeg from V1) · `suggest_keepers`/`summarize_candidates` · `re_explore_from_candidate`/`upscale_candidate` (E3) |

**V2–V5 order is Michael's call — re-orderable at any phase boundary.** V1 is
the prerequisite for most of them (ffmpeg, the agent's eyes, the doctrine).

## Design principles carried into this roadmap

- Every new capability is BOTH an agent tool AND a UI surface (agent-first).
- The agent must SEE what it makes before judging it (extends the vision-honesty
  rule from stills to video and candidate sets).
- Taste lives where it compounds: an explicit, inspectable profile — not
  invisible prompt injection (the director can read and edit their own taste
  profile).
- ffmpeg enters once (V1) and pays four times (frames, export, E2, audio mux).
