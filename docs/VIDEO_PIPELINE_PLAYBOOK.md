# VIDEO PIPELINE PLAYBOOK — State-of-the-Art Generative Video Craft & Orchestration

> Distilled from four deep research passes (Veo craft; multi-shot/reference systems; end-to-end
> pipelines; audio + agentic orchestration), current as of mid-2026. This is the benchmark
> document: it describes what the best AI-film workflows in the world actually do, so we can
> audit our own Studio (`ui/` + `src/api`) against it. Dense, practical, opinionated.
> Source URLs preserved inline. Numeric API limits should be spot-checked against live docs
> before being hard-coded (several official doc pages render as JS shells and were triangulated
> from Google dev-blog posts + third-party wrappers).

---

## 1. The Canonical Pipeline: Stages & Artifacts

Every serious workflow — LTX Studio, Google Flow, mStudio, DeepFiction, Runway Agent, indie
solo stacks — converges on the same macro-pipeline. Tool names differ; the shape does not:

```
Story/Script → Storyboard/Pre-viz → Character & World Bible ("Elements"/"Ingredients")
→ Shot List → Animatic (stills + scratch audio) → Generation (image→video, per shot)
→ Dailies/Take Review (selects/maybes/rejects) → Timeline Assembly → Voice/SFX/Music
→ Color/Export → Distribution
```

Sources: https://www.deepfiction.ai/blog/ai-filmmaking-pipeline-script-to-screen-2026 ,
https://mstudio.ai/blog/ai-filmmaking/script-to-storyboard-to-film-ai-workflow ,
https://ltx.io/studio , https://blog.google/innovation-and-ai/products/google-flow-veo-ai-filmmaking-tool/

### The non-negotiable principles

1. **Lock composition as a still first, then animate it.** Image-to-video / frames-to-video
   beats raw text-to-video for control, everywhere, always. Storyboard keyframes are the real
   creative decision point; video generation is execution. ("Lock your composition in
   storyboarding, then animate it." — DeepFiction)
2. **Separate "visual lock" from "shot execution."** Character/style/location reference assets
   are a distinct persistent layer (LTX "Elements", Flow "Ingredients", Higgsfield "Soul ID/Cast",
   character bibles) that every shot pulls from. Consistency is a property of the asset library,
   not of individual prompts.
3. **Animatic before motion generation.** Assemble storyboard frames with durations + scratch
   VO/music into "a rough cut of a film that doesn't exist yet" (mStudio). Pacing problems are
   cheap to fix on stills, expensive on generated video.
4. **Every generated clip is a formal "take" with metadata.** Prompt, reference images used,
   seed, model/version, rejection notes, reviewer decisions. The named failure mode of naive
   pipelines is **"metadata hemorrhage"** — footage with no memory of how it was made or why a
   take was chosen. Source: https://lotix.io/blog/comparisons/ai-filmmaking-tools/
5. **Dailies discipline ported from traditional production.** Organize takes into review bins;
   mark selects / maybes / rejects / approved; comment threads; regen notes. Raw AI output
   volume makes take management the bottleneck. Auto-triage exists (focus/audio/lighting
   scoring, auto-binning by action): https://beverlyboy.com/film-technology/ai-in-dailies-faster-selects-cleaner-notes-better-handoffs/ ,
   https://www.twelvelabs.io/blog/accelerate-your-film-production-with-twelve-labs
6. **Editing remains the most manual, human-owned stage.** Even the most agentic tools (Runway
   Agent 2.0, Flow SceneBuilder) end at a human timeline for final assembly/QA. Plan for a
   great review/assembly surface, not for its elimination.

### Stage-by-stage artifacts (what a complete system produces)

| Stage | Artifacts | Reference tools |
|---|---|---|
| Script/Story | treatment, beat sheet, character descriptions, scene breakdowns | Claude (structure), GPT (dialogue), DeepFiction |
| Storyboard | keyframe stills per shot, locked style refs, coverage grids | Nano Banana Pro (hero frames), Z-Image (iteration) |
| Character/World bible | ref sheets (front/side/3-quarter), labeled looks, location refs, style bible | Flux Kontext, Nano Banana Pro Edit (up to 14 refs), LoRA when long-term |
| Shot list | shot ID, framing, camera grammar, continuity columns (wardrobe/props/palette/time-of-day/audio cues), assigned refs, seed | Storyflow (single connected canvas), Katalist, mStudio |
| Animatic | timed stills + scratch VO/music/SFX on separate tracks | mStudio stage 3 |
| Generation | takes (clip + full metadata), 2–3 candidate variants per shot | Veo 3.1, Kling 3.0, Seedance 2.0, Runway Gen-4.5, LTX-2 — multi-provider per shot type |
| Dailies | select/maybe/reject/approved states, timecoded comments, drift notes | Frame.io-style review; Twelve Labs auto-binning |
| Assembly | multi-track timeline, per-shot regeneration preserving storyboard source | LTX timeline, Flow SceneBuilder, Resolve/Premiere |
| Audio | VO stems, music stems, SFX, room-tone bed, mix | ElevenLabs, Suno, Lyria; FFmpeg post |
| Export | MP4 at target res/ratio, review links w/ timecoded comments, PDF boards | — |

Worked-example throughput: a 2-minute short in ~95 min total (parse 5, storyboard 25, animatic
15, motion gen 30, assembly/export 20) — mStudio. Cost datapoint: 3-min indie short ≈ $60–175.

**Opinionated read:** the pipeline's connective tissue (shot list ↔ takes ↔ dailies ↔ timeline,
all sharing IDs and metadata) is worth more than any single model integration. Models rotate
quarterly; the production data model is the durable asset.

---

## 2. Model-Specific Craft

### 2.1 Veo 3.x (3.0 / 3.1) — our settled primary backend

Veo 3.1 (Oct 15 2025) is the current flagship. "Veo 4" is rumor only — do not build against it.
Source: https://developers.googleblog.com/en/introducing-veo-3-1-and-new-creative-capabilities-in-the-gemini-api/

**Prompt structure.** Official formula:
`[Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance]`
(https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1).
DeepMind's 7 components: shot framing/motion, style, lighting, character description, location
(sensory, not generic), action, dialogue (https://deepmind.google/models/veo/prompt-guide/).
Community 8-block variant adds explicit Audio block (https://github.com/snubroot/Veo-3-Prompting-Guide).
Rules that matter:
- Front-load the most important element; describe what can be **seen/heard**, not abstractions.
- Specificity wins dramatically ("weathered green trench coat", "shallow depth of field") —
  https://replicate.com/blog/using-and-prompting-veo-3
- **One primary camera movement per clip**; 2–3 modifiers is the practical ceiling.
- Veo parses real cinematography vocabulary directly: dolly/truck/pedestal/crane/orbit/whip-pan,
  Dutch tilt, POV, 180° arc, focal lengths (35mm/85mm), shallow DOF.
  https://james-palm.medium.com/complete-list-of-veo-3-camera-movements-for-ai-filmmaking-40-prompts-cf8ba7d01135
- Lighting: quality + direction + color temperature, not mood words.
- Negative prompts: phrase positively/concretely ("a desolate landscape with no buildings or
  roads", not "no man-made structures").
- Prompt enhancement: use an LLM (Gemini/Claude) to expand terse prompts into cinematic
  language before submission — officially recommended.

**Native audio prompting (Veo's headline differentiator).** Separate labeled lines for
dialogue / SFX / ambience; don't blend into visual prose.
- Dialogue: **colon syntax** (`Character says: "line"`) + explicit "(no subtitles, no text
  overlays)" — quotation-mark syntax triggers burned-in subtitles (~95% prevention reported
  with the combo). Keep dialogue < 8s, one line per clip; add delivery modifiers (softly,
  angrily); spell odd names phonetically; name the speaker in multi-person scenes.
  https://www.veo3ai.io/blog/veo-3-native-audio-prompt-guide-2026
- SFX: `SFX: thunder cracks in the distance`, tied to a visible on-screen action for sync.
- Ambience: `Ambient noise: the quiet hum of a starship bridge`; layer with foreground/
  midground/background terms; ~4 distinct audio layers max before muddying.
  https://skywork.ai/blog/how-to-audio-aware-prompting-veo-3-1-guide/
- Trim priority when crowded: dialogue > primary SFX > ambience > music.
- Audio hallucination (phantom audience laughter etc.): crowd it out by explicitly specifying
  the wanted audio environment ("Audio: quiet office ambiance, no audience sounds").

**Image-to-video & frame control.**
- **First & Last Frame**: supply start + end images; Veo interpolates with audio, guided by a
  text prompt describing the connecting camera/action. The gold-standard workflow: generate
  both frames in an image model (Nano Banana / Gemini image), then bridge.
  API shape: `config=types.GenerateVideosConfig(last_frame=last_frame)`.
  Loops: same image as first AND last frame (no native loop export).
  https://www.veo3ai.io/blog/veo-3-seamless-looping-video-guide-2026
- **Ingredients-to-Video**: up to 3 reference images (official; some wrappers say 4) of
  character/object/style, reused across separate shot generations for consistency — the
  shot/reverse-shot pattern reuses the same ref set with different framing prompts.
  https://blog.google/innovation-and-ai/technology/ai/veo-3-1-ingredients-to-video/
- **Timestamp prompting**: direct a full multi-shot sequence inside one 8s generation with
  bracketed timecodes `[00:00-00:02] ... [00:02-00:04] ...` — pacing control within a clip.

**Extending past 8 seconds (three methods).**
1. Flow Scene Builder "Extend" — auto-seeds next generation from the prior clip's final frame.
2. Manual frames-to-video chaining — save last frame of clip N as first frame of clip N+1
   (pixel-level continuity pin; best for tricky moments: face turns, reveals, logos).
3. Scene Extension API — extends from the final ~1s (24 frames); +7s per hop, up to 20 hops
   (~148s total); 720p only, 16:9/9:16 only; audio extends coherently.
   https://help.apiyi.com/en/veo-3-1-extend-video-api-guide-en.html , https://artlist.io/blog/new-veo-3-1-extend/

**Continuity discipline (strong practitioner consensus).**
- The model has **no memory across generations**: re-state full identity descriptors
  (character, wardrobe, hair, key colors) verbatim in every chained prompt.
- Character bible: 2–3 clean neutral-lit refs per character (front, 3/4, profile).
- Shotlist with continuity columns (identity/wardrobe/props/palette/time-of-day/camera
  grammar/audio cues per shot).
- Match-action cues at cut points ("continues turning right").
- Generate 2–3 candidates per segment, chain from the least-drifted — drift compounds per hop.
- Advanced: quantitative drift metrics — face embedding similarity, wardrobe binary checks,
  palette histograms, optical-flow motion continuity at cuts, audio spectral consistency.
  https://skywork.ai/blog/multi-prompt-multi-shot-consistency-veo-3-1-best-practices/

**Known failure modes & mitigations.**
- Identity drift (semantic prompt overpowers reference): 1–3 high-quality refs, identical
  style descriptors verbatim across prompts, same seed + stronger identity language.
  https://medium.com/google-cloud/veo-3-character-consistency-a-multi-modal-forensically-inspired-approach-972e4c1ceae5
- Temporal/logical drift: model prioritizes smooth pixels over physics/logic — ~62% of tested
  cases "teleport" to a plausible end state via invalid transitions (arXiv MMGR,
  https://arxiv.org/pdf/2512.14691). QC must inspect mid-clip, not just endpoints.
- Object morphing / extra limbs: negative-prompt explicitly ("avoid glitch morphs, no object
  warping, avoid extra limbs").
- Garbled on-screen text (general video-gen limitation): avoid relying on rendered signage.
- Subtitle burn-in and audio hallucination: see audio section above.

**Technical envelope (verify live before hard-coding).** Models: `veo-3.1-generate-preview`,
`veo-3.1-fast-generate-preview`, `veo-3.1-lite-generate-preview` (+3.0 equivalents). 4/6/8s
durations (refs force 8s on 3.1); 720p/1080p @24fps, 4K as upscale pass; 16:9 + 9:16 (9:16 new
in 3.1); `generateAudio` (default true, costs more), `seed`, `sampleCount` 1–2,
`personGeneration` gate; ~60–180s latency per 8s clip; fast tiers reportedly lack i2v; all
output SynthID-watermarked. Live check: https://ai.google.dev/gemini-api/docs/video ,
https://cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos

### 2.2 Seedance 2.0 (ByteDance) — the shelved track, and what it teaches

**Omni-reference @mention system** — the most complete reference API on the market:
`@Image1..9` (identity/product/style/scene), `@Video1..3` (motion blueprint, camera tracking,
pacing), `@Audio1..3` (rhythm, VO sync, beat-aligned cuts). Up to 12 files/generation (9 img,
3 vid, 3 aud); every ref must be role-assigned in prompt text or it's ignored. Example:
"Use @Image1 for character identity. Follow @Video1 for motion. Sync to @Audio1 for rhythm."
Rule of thumb: **text for spatial decisions, reference video for temporal decisions.**
First 20–30 words of prompt carry most weight — lead with who/what + core action.
https://higgsfield.ai/blog/seedance-prompting-guide , https://www.glbgpt.com/hub/seedance-2-0-omni-reference/

**Multi-shot**: 15s single-generation cap; declare structure up front ("Total: 15s / 6 shots /
16:9") then number each shot; model plans 3–6 coherent shots autonomously. Camera locking via
explicit negation: "No cuts, no zoom, natural head movement." Realism: "no 3D, no cartoon,
no VFX" fixes plasticky skin. https://useapi.net/blog/260415

**Consistency workflow**: reference strength 70–80% (over 85% = rigid/uncanny, under 60% =
drift); **re-anchor to the ORIGINAL reference, never a generated frame** (compounding drift);
tightening a ref set from 6 to 2 highly consistent images cut drift ~60%. Practitioner 4-step:
Fixed Character Block (immutable text anchors + ref index) → Variable Scene Block per shot →
Shot-by-Shot Ledger (shot ID, blocks, seed, notes) → explicit "maintain exact appearance from
@ImageX" per shot. https://crepal.ai/blog/aivideo/blog-seedance-2-0-character-consistency/

**The realistic-face rejection (why we shelved it).** ByteDance runs a face classifier BEFORE
generation on i2v/reference inputs; rejects photorealistic human faces (real or AI-generated)
with `InputImageSensitiveContentDetected.PrivacyInformation`. Output faces are fine; the gate
is on INPUT refs (deepfake-liability driven). Two documented adversarial workarounds — the
"character-sheet trick" (red cross over one eye + "CHARACTER SHEET REFERENCE" banner, ~99%
reported success) and sparse-grid facial occlusion via FFmpeg (fools the classifier; the
dense-pixel identity encoder still reconstructs from between grid lines).
https://www.viraltwin.app/blog/pass-seedance-face-filter , https://useapi.net/blog/260415 ,
https://www.mindstudio.ai/blog/seedance-2-0-content-restrictions-workarounds
**Verdict: do not build production on these.** They are classifier-adversarial, explicitly
fragile (patched over time), and ToS-risky. Stylized/non-photoreal characters pass the filter
natively — if the cel-shaded style track matures, Seedance may unshelve itself legitimately.
Also worth a manual check: Runway now hosts Seedance 2.0
(https://help.runwayml.com/hc/en-us/articles/50488490233363-Creating-with-Seedance-2-0) —
unconfirmed whether Runway's wrapper relaxes the native face filter.

### 2.3 Reference & consistency techniques (cross-model)

**The single most consistent rule across ALL platforms: separate "solve identity" from "solve
viewpoint/motion."** Lock a character on one clean reference/generation first; treat every
subsequent shot as reusing that locked identity, never re-deriving it.

- **Kling 3.0**: Element Binding "Visual DNA" (face/hair/clothing vectors anchored through
  generation); up to 4 ref images or 8s clips per element; @image/@element tokens;
  front/side/45° ref trilogy improves 3D understanding; scene-reference (environment) vs
  element-reference (identity) vs text (motion) separation; **Multi-Shot Storyboard: up to 6
  shots per generation** with subject continuity, but ≤15s total.
  https://kling.ai/blog/kling-3-subject-binding-character-consistency , https://www.vidguru.ai/blog/kling-3.0-omni-guide.html
- **Runway Gen-4/4.5**: up to 3 ref images; no native storyboard mode — single continuous shot
  ~10s, multi-shot = separate generations + manual assembly + seed discipline. Recommended
  flow: craft a clean identity-anchor still in an image tool first, then i2v.
  https://runwayml.com/research/introducing-runway-gen-4
- **Luma Ray3 Modify — video-as-reference (genuinely distinct)**: existing footage becomes the
  structural/motion reference and the character in it is REPLACED with your character ref,
  auto-adapting to the footage's lighting/style. Maps to "reshoot with a different character,
  same blocking" — directly relevant to our labeled-looks/character-swap needs. Modify-strength
  slider; start/end keyframe control. Note: Ray3.14 (fast variant) does NOT support character
  reference. https://lumalabs.ai/news/ray3-modify
- **Vidu Q1/Q2**: up to 7 ref images per generation; refs persist in a reusable library
  (different persistence model than per-request uploads); ComfyUI node exists.
  https://vidu.com/ai-reference-to-video
- **Sora 2 Cameos**: reference as hard constraint in diffusion; ~60% consistency with prompting
  alone vs ~95% with cameo + copying the exact clothing-description phrase into every prompt;
  reliable for 1–2 characters, third character conflates identities; async batch API suits
  shot-list batch generation. https://blog.laozhang.ai/en/posts/sora-2-character-creation-guide
- **Pika 2.5**: Ingredients + frame-chaining to 25s; fine within a clip, explicitly unreliable
  across separate clips in multi-scene narratives.
- **Higgsfield Soul ID / Cast**: train identity once from 20+ multi-angle photos (incl. one
  full-body), reuse across Kling/Veo/Seedance backends; Cast = casting-sheet character builder
  (archetype, era, build, marks, outfit), up to 3 characters/project. Cinema Studio: up to 9
  refs + narrative prompt + shot config, "Cinematic Reasoning Engine" for high-level direction.
  https://higgsfield.ai/blog/sould-id-best-character-consistency , https://higgsfield.ai/blog/cinema-studio-3
- **IC-LoRA / LTX (open-source layer)**: inference-time reference conditioning (no per-character
  training) in Canny/Depth/Pose control modes; trained character LoRA only when the same
  character must survive many angles/lightings long-term. IP-Adapter is the conceptual ancestor
  of all native @Image systems. https://ltx.io/blog/how-to-use-ic-lora-in-ltx-2

**Coverage-from-one-locked-still (our "explore → curate → assemble" pattern, validated).**
Solve identity ONCE on a single approved still, then treat everything downstream as viewpoint
exploration:
- Single-image angle-exploration tools → pick winning frame → use it as first frame for video.
  Warning: "solve identity stability first before changing perspective."
  https://maxvideoai.com/blog/multiple-camera-angles-from-one-image
- Storyboard-grid (3×3): generate ALL required angles as tiles of ONE image-gen call — makes
  consistency a property of one generation, not an alignment problem across N.
  https://www.magnific.com/blog/how-to-create-multiple-camera-angles-with-ai/
- LTX 360° orbit trick: one continuous video orbit = free multi-angle consistency ("every frame
  comes from the same continuous generation"). https://civitai.com/articles/27654/character-consistency-without-loras-free-360-viewers-with-ltx-video-23-in-comfyui
- Bullet-time prompt pattern: freeze subject motion, spend the whole generation budget on
  camera-path fidelity.

**Known unsolved problem:** multi-character interaction — identity blurring at contact points
(close-ups, physical contact) is unsolved across Soul ID, Runway, "every other tool"
(Higgsfield's own admission). Design narratives around it; don't promise it.

### 2.4 Multi-shot / chaining — the industry-wide shape

- **~15s single-generation ceiling everywhere** (Seedance, Kling, Pika, Sora; Veo 8s). This is
  a shared architectural constraint — roughly the reliable identity-coherence window before
  drift compounds — not a competitive gap. Scale-out is always chaining/extend.
- **Two complementary mechanisms, not substitutes:** last-frame chaining solves shot-to-shot
  continuity (lighting/composition/position inherit automatically); persistent reference
  images solve character identity across the whole chain. Use both.
  https://ltx.io/blog/how-to-extend-ai-videos , https://app.cinevva.com/guides/long-reference-video-models
- Bidirectional extend exists (target end-frame + current last frame → generated bridge) —
  Envato VideoGen pattern. https://elements.envato.com/learn/videogen-extend
- **@-token reference tagging is the de facto cross-vendor standard** (Seedance @Image/@Video/
  @Audio; Kling @image/@element). If our prompt-construction layer mirrors this convention,
  backends become swappable.
- Research direction: MultiShotMaster (arXiv https://arxiv.org/pdf/2512.03041) — explicit
  consistency constraints at shot transitions beat implicit model knowledge; over-constraining
  reduces diversity (real trade-off). FreeLong++ for single continuous long shots.

---

## 3. Audio & Scoring Integration

### 3.1 Native model audio vs. dedicated audio stack

- **Kling 2.6/3.0** and **Veo 3.1** and **Seedance 2.0** generate synchronized native audio
  (dialogue, ambience, basic Foley) with the visuals. **Runway Gen-4/4.5 is still silent by
  default.** https://rangy.ai/blog/veo-vs-kling-vs-runway/
- Opinion: native audio is the scratch track. A top-tier pipeline treats it as temp/reference
  and layers a dedicated audio pass (VO, music, SFX, room tone) for anything shipping.

### 3.2 Music generation

- **Google Lyria 2/3 (Vertex AI)**: 48kHz stereo, key/BPM/style control, 30s per call,
  "extend" mode preserving tone/style. https://docs.cloud.google.com/vertex-ai/generative-ai/docs/music/generate-music ,
  https://deepmind.google/models/lyria/
- **Suno (via sunoapi.org — no fully official public API)**: generate/extend/cover/add-vocals;
  **timestamped lyrics endpoint** (sync/karaoke); **12 time-aligned WAV stems** (DAW-ready);
  auto music-video endpoint; tracks to 8 min; V5.5 current. https://docs.sunoapi.org/
- **ElevenLabs Music v2**: **composition plans** — per-section (intro/verse/chorus/outro) style/
  lyrics/duration control, 3s–10min tracks; stem-separation endpoint; mid-track genre
  transitions; SFX embedded in tracks. Best API-first scoring control surface found.
  https://elevenlabs.io/docs/eleven-api/guides/how-to/music/composition-plans ,
  https://elevenlabs.io/docs/api-reference/music/separate-stems
- **Udio**: no official public API (third-party beta reports only — https://musicdelta.com/en/articles/udio-api-beta-3-month-review).
- **Open-source**: MusicGen/AudioCraft (https://github.com/facebookresearch/audiocraft);
  **ACE-Step 1.5** (Apache-2.0, diffusion, <10s/song on RTX3090, 8GB VRAM min, ComfyUI node)
  — the self-host option. https://github.com/ace-step/ACE-Step-1.5
- **Sync-licensing-clean scoring**: AIVA Pro (~€49/mo) transfers copyright — the safe choice
  for sync; Soundraw/Beatoven for temp scores (murkier licensing).
  https://www.foximusic.com/blog/ai-post-production-music-tools/
- **Legal watch**: UMG×Udio and Warner×Suno settled into licensing partnerships (late 2025);
  Sony still litigating; fair-use ruling expected summer 2026; Suno's unlicensed-data models
  being retired. Track before committing a commercial pipeline to either.
  https://www.chartlex.com/blog/business/music-industry-ai-lawsuits-tracker-2026

### 3.3 SFX, VO, dialogue

- **ElevenLabs SFX V2**: `text`, `duration_seconds` 0.5–30s, `prompt_influence`, `loop`;
  48kHz; 4 variations per request for auditioning. **Video-to-Sound**: upload video →
  frame-by-frame analysis → 4 matched SFX options (caveat: misses Foley subtleties).
  **Eleven v3 inline audio tags** (`[gunshot]` in the TTS script) give script-level SFX timing.
  **Text-to-Dialogue**: multi-voice {voice, text} arrays with natural turn-taking.
  https://elevenlabsmagazine.com/elevenlabs-ai-sound-effects-guide-2026/ , https://elevenlabs.io/api
- **Voice cloning / ADR**: Resemble AI (film ADR positioning), Respeecher (identity
  preservation across productions). Target control axis: "same character, new line" without
  tonal drift — separate consistency vs expressiveness knobs.
  https://www.resemble.ai/ai-voice-synthesis-tools-film-adr/ , https://www.respeecher.com/blog/ai-voices-adr-voiceover-indie-films
- Stack pattern (OpenMontage): ElevenLabs/Google TTS/OpenAI TTS/Piper(local) for VO; Suno +
  ElevenLabs for music/SFX; **FFmpeg for all post** (mixing, ducking, fades, normalization) —
  free and deterministic.

### 3.4 Continuity & sync patterns

- **Room tone / audio continuity across cuts**: AI-assembled projects drift tonally — a
  replacement line "sits in a different acoustic space; listeners feel it even if they can't
  name it." Fix: generate/replicate a matching ambient bed unifying room tone across cuts.
  https://www.studiobinder.com/blog/what-is-room-tone/ , https://reelmind.ai/blog/ai-powered-room-tone-addition-fill-audio-gaps-naturally
- **Beat-sync**: waveform/beat detection auto-aligns cuts to music (millisecond claims);
  cited Facebook study: strong AV sync → up to 40% higher completion.
  https://www.opus.pro/blog/best-ai-beat-sync
- **The inverse workflow is the interesting one**: supply music FIRST, generate video synced to
  it (Seedance @Audio refs drive beat-aligned cuts and VO sync at generation time, not in the
  edit). https://crepal.ai/blog/aivideo/ai-soundtrack-sync-video/
- **QC the audio too**: OpenMontage's post-render gates include silence/clipping/level
  compliance analysis — audio validation belongs in the same automated QC pass as visual checks.

---

## 4. Agentic & Orchestration Patterns

### 4.1 The reference architecture: OpenMontage (open-source, most concrete found)

https://github.com/calesthio/OpenMontage — agent-first, 3-layer design: Layer 1 capabilities
(tools + YAML pipeline manifests), Layer 2 conventions (markdown skill files = quality
standards), Layer 3 provider knowledge packs. **No central engine — the coding assistant IS
the orchestrator.** Standard per-pipeline flow: research → proposal → script → scene_plan →
assets → edit → compose. Patterns to steal:

- **Vision-based post-render QC gates (mandatory, not optional)**: ffprobe codec/res check;
  frame extraction at 4 sample positions (black frames, broken overlays); audio silence/
  clipping/level analysis; "delivery promise" verification (does output match stated intent);
  subtitle-presence check. **Pre-compose validation gate blocks rendering** on violations.
- **Slideshow risk scoring** (6 dimensions: repetition, decorative visuals, motion coverage,
  shot intent, typography overreliance, unsupported cinematic claims) — prevents "animated
  PowerPoint" output.
- **Provider selection engine**: every tool choice scored on 7 weighted dimensions (task fit
  30%, quality 20%, control 15%, reliability 15%, cost 10%, latency 5%, continuity 5%) with
  logged reasoning + alternatives considered.
- **Long-running job orchestration**: JSON checkpoints after each stage (decision audit trail,
  cost snapshots, approval-gate status); human approval gates at proposal/script/scene-plan/
  assets/publish; budget controls (pre-execution estimate, approval threshold default $0.50,
  budget cap default $10, observe/warn/cap modes).
- **"Backlot" live production board**: web UI derived from production JSON (no DB), per-scene
  asset/cost tracking, contact-sheet storyboard approval gates that pause generation pending
  visual sign-off, run-replay scrubber.
- **Research grounding**: 15–25 live web searches → cited brief before script authoring.
- **Reference-video mode**: paste a YouTube/TikTok link → extract transcript/pacing/scene
  boundaries/style signals → 2–3 differentiated concepts + cost estimates before production.

### 4.2 Self-review / critic loops (the converged academic + industry pattern)

The pattern everywhere: **generate → VLM watches the output → critique → targeted regen or
prompt rewrite → repeat until pass.** Inference-time correction first; weight-level evolution
is the research frontier.

- **"The Script is All You Need"** (https://arxiv.org/abs/2601.17737): ScripterAgent (dialogue
  → executable cinematic script) + DirectorAgent (cross-scene continuous generation with frame
  anchoring) + CriticAgent (technical + cinematic quality eval). ScriptBench benchmark.
- **SPIRAL** (https://arxiv.org/abs/2603.08403): closed-loop think-act-reflect; PlanAgent +
  ContextMemory + CriticAgent + GRPO evolution of the generator itself. +22.6% action quality
  vs open-loop.
- **Genflow Ad Studio** (https://arxiv.org/abs/2605.16748): adversarial multi-agent QC —
  evaluator agents critique frames against brand parameters until consensus; **raised
  production-grade yield from 42% → 89%**. The strongest quantified argument for critic loops.
- **VQQA** (https://arxiv.org/pdf/2603.12310): VLM critiques as "semantic gradients" for
  iterative prompt optimization. **CoTriSyGen** (https://arxiv.org/html/2606.16184): intra-shot
  (targeted regen) + inter-shot (prompt rewrite) refinement split. **VideoAgent**
  (https://arxiv.org/pdf/2410.10076) is the precursor.
- NVIDIA AVI: Retrieve → Perceive → Review (reflect/self-critique/re-perceive) decomposition.
  https://developer.nvidia.com/blog/build-an-agentic-video-workflow-with-video-search-and-summarization/

### 4.3 Multi-agent film-crew role decomposition (validated architecture)

Commercial and academic systems converge on the same roles: **Director / Screenwriter /
Producer (scheduling, retries, resources) / Cinematographer / Critic.**
- ViMax (https://github.com/HKUDS/ViMax): Director, Screenwriter (RAG script segmentation),
  Producer (scheduling/retry/fallback), Video Generator (parallel gen + best-frame selection);
  "Agents Loop" TUI, session reuse, context compaction.
- FilmAgent (https://arxiv.org/abs/2501.12909): multi-agent beat single-agent with a stronger
  model — **coordination > raw model strength.**
- Mind-of-Director (https://arxiv.org/abs/2603.14790): previz in ~25 min/idea, game-engine
  review loop. AnimAgents (https://arxiv.org/abs/2511.17906): hierarchical core-agent +
  specialists, beat single-agent significantly with 16 professional creators (p<.01).
- Commercial: **Runway Agent 2.0** ("idea to finished video in a single conversation" —
  decompose brief → shot list → per-shot gen → identity-locked continuity → rough assembly →
  human timeline for final QA; https://runwayml.com/news/introducing-runway-agent). Showrunner
  (Fable): simulation-driven episodes, persistent character history/goals. Adobe Creative
  Agent (June 2026): production orchestration across Premiere/Photoshop/Frame.io.
- Autonomy calibration across ALL of these: automate planning/generation/continuity/rough
  assembly; humans approve storyboards, regenerate weak shots, own final cut.

### 4.4 MCP & tool integration

- **Video**: Video Jungle MCP (semantic search over footage, NL edit generation, **DaVinci
  Resolve export via OpenTimelineIO**) — https://github.com/burningion/video-editing-mcp ;
  Reap MCP (clipping/captioning/dubbing/reframe) — https://reap.video/mcp ; Jumper (Premiere/
  Resolve/FCP/Avid timeline export) — https://getjumper.io/ai-agents
- **Audio/DAW**: AbletonMCP (~2.5k stars, real session control via Ableton's Python API) —
  https://github.com/ahujasid/ableton-mcp ; note Anthropic's official Ableton connector is
  docs-only, no live control.
- **OpenTimelineIO as the handoff format** between agentic assembly and human NLE is the
  emerging bridge worth adopting.
- a16z taxonomy of agentic video products — Process (organize footage), Orchestrate
  (coordinate gen models), Polish (detail fixes), Adapt (multiformat/multilingual), Optimize
  (taste-driven direction): https://a16z.com/its-time-for-agentic-video-editing/

### 4.5 Taste / preference learning

The bottleneck is no longer generation, it's judgment — "kill the slop"
(https://www.amplifypartners.com/blog-posts/kill-the-slop-announcing-our-investment-in-taste).
- Patterns: per-user preference predictors conditioned on outputs + metadata (PAM∃LA);
  aesthetic preference optimization (TAPO); an "LLM taste layer" refined every interaction.
  https://arxiv.org/pdf/2604.07427 , https://arxiv.org/pdf/2601.17134
- Practical near-term version: **every select/reject in dailies is a labeled preference pair.**
  Capture it with the take metadata and you get a taste dataset for free. Also: agents should
  ask clarifying taste questions rather than guessing ("When to Ask a Question",
  https://arxiv.org/pdf/2605.11240).
- The a16z "Optimize" loop is the product shape: watch footage → ask objectives → draft →
  human feedback ("opening too slow") → correct.

### 4.6 The Claude-native precedent

A free "AI Film Pipeline" skill for Claude structures the whole studio as 5 markdown files:
SKILL.md orchestrator (still grids → video from approved stills), prompt-templates.md,
filter-safety-guide.md (**blocked keywords + successful workarounds learned over time**),
style-guide.md (style bible), story-notes.md, tracking/production-tracker.md (resumable
session state). ~4.7k tokens; expensive model for creative calls, cheap model for logistics;
explicit context-handoff protocol. Closest structural analog to what our Studio's agent layer
should look like. https://theoreticallymedia.beehiiv.com/p/the-ultimate-ai-film-pipeline

---

## 5. CHECKLIST — Capabilities of a Top-Tier Agentic Film Studio

Use this to audit the codebase. Grouped; roughly ordered by leverage within each group.

### A. Production data model (the durable core)
- [ ] Script → scene → shot decomposition with stable IDs threading through every downstream artifact
- [ ] Shot list with continuity columns (identity descriptors, wardrobe, props, palette, time-of-day, camera grammar, audio cues)
- [ ] Every generated clip stored as a **take**: prompt, refs used, seed, model+version, cost, timestamps, parent shot ID
- [ ] Dailies states: select / maybe / reject / approved, with reviewer notes + regen notes (no "metadata hemorrhage")
- [ ] Version history: superseded takes archived, never silently overwritten
- [ ] Decision audit trail: why this take, why this provider, what alternatives were considered

### B. Consistency layer
- [ ] Persistent character/location/style asset library ("Elements"/"Ingredients") reused across shots without re-describing — we have entity album + labeled looks; audit completeness
- [ ] Character bible per entity: 2–3 clean neutral refs (front, 3/4, profile); style bible with locked palette/lighting/film-stock language
- [ ] Prompt constructor that re-states full identity descriptors verbatim in every chained generation (model has no memory)
- [ ] @-token reference tagging convention in the prompt layer (portable across Seedance/Kling; mappable to Veo ingredient slots)
- [ ] Coverage-from-one-locked-still flow: identity solved once → angle exploration → winner becomes first frame (our explore→curate→assemble; validated as best practice)
- [ ] Re-anchor rule enforced: drift recovery always returns to ORIGINAL refs, never a generated frame
- [ ] Drift metrics (even crude): face-embedding similarity, palette histogram, wardrobe checklist per take

### C. Generation engine
- [ ] Image-first workflow: keyframe stills locked before any video generation
- [ ] First/last-frame bridging + last-frame chaining for continuity across the 8–15s ceiling
- [ ] 2–3 candidate variants per shot, chain from least-drifted
- [ ] Multi-provider abstraction with per-shot provider selection (scored: task fit / quality / control / reliability / cost / latency / continuity)
- [ ] Model-specific prompt compilers (Veo block formula + colon-dialogue + "no subtitles"; Seedance shot-numbered structure + role-assigned refs; timestamp prompting)
- [ ] Seed + negative-prompt management per provider
- [ ] Async batch generation with retries/fallbacks; failed jobs don't burn budget

### D. Review & QC (the agentic differentiator)
- [ ] Automated post-render QC gate: codec/res probe, sampled-frame inspection, audio silence/clipping/levels, subtitle-presence, delivery-promise check
- [ ] VLM critic loop: watch generated clip → critique vs shot intent → targeted regen or prompt rewrite (Genflow: 42%→89% yield)
- [ ] Mid-clip inspection, not just endpoints (Veo "teleports" through invalid transitions ~62% of tested cases)
- [ ] Human approval gates at storyboard/assets/final — pausing generation pending sign-off
- [ ] Auto-triage of takes: flag standouts, bin by scene/action, timecoded transcription

### E. Audio
- [ ] Native model audio treated as scratch; dedicated VO/music/SFX pass for shipping output
- [ ] Music: section-level composition control (ElevenLabs composition plans or equivalent), stems export, extend-preserving-style
- [ ] SFX: prompt-generated with duration/loop control; script-inline SFX tags where supported
- [ ] Voice: cloned character voices consistent across scenes ("same character, new line" without tonal drift)
- [ ] Room-tone/ambient bed unification across cuts; audio continuity QC
- [ ] Beat-sync both directions: cut-to-music in the edit AND music-as-generation-reference
- [ ] Licensing posture tracked per music provider (Suno/Udio litigation; AIVA for sync-safe)

### F. Assembly & handoff
- [ ] Animatic stage: timed storyboard stills + scratch audio before motion generation
- [ ] Timeline that supports per-shot regeneration while preserving storyboard/shot-list linkage (our virtual-chop/trim editing lives here)
- [ ] OpenTimelineIO (or equivalent) export to human NLEs
- [ ] Review links with timecoded comments

### G. Orchestration & operations
- [ ] Resumable checkpointed jobs: state snapshot after every stage; sessions resumable across context resets
- [ ] Budget governance: pre-execution cost estimate, per-action approval threshold, total cap, observe/warn/cap modes
- [ ] Live production board derived from job state: per-scene assets, costs, gate status
- [ ] Filter-safety knowledge base: blocked terms + successful rephrasings, learned over time per provider
- [ ] Model-tier routing: expensive model for creative calls, cheap model for logistics
- [ ] Numeric provider limits (durations, ref counts, resolutions) config-driven and re-verified against live docs, never hard-coded from blog posts

### H. Taste
- [ ] Select/reject decisions captured as preference pairs with full take metadata
- [ ] Style-bible-as-prompt-context so taste decisions persist across sessions
- [ ] Agent asks clarifying taste questions instead of guessing
- [ ] (Aspirational) per-project preference model re-ranking candidate takes before human review

### Known-unsolved (don't promise, design around)
- Multi-character physical interaction / identity blur at contact points — unsolved industry-wide
- Legible on-screen text rendering in generated video
- Physics/logical validity of transitions (visual plausibility ≠ logical consistency)
- Seedance realistic-face inputs without adversarial workarounds (stylized characters pass natively)

---

*Compiled 2026-07 from four research passes. Primary sources are inline; where official docs
were unreachable (Google Vertex/Gemini parameter tables, Lyria schemas, Reap tool list), the
text says so — verify live before hard-coding.*
