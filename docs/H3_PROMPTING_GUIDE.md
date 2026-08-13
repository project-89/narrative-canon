# MiniMax H3 Prompting Guide — the studio distillation

> Distilled 2026-08-05 from the two OFFICIAL MiniMaxAI/MiniMax-H3 guides
> (preserved verbatim in `docs/reference/H3_OFFICIAL_base_mode.md` and
> `docs/reference/H3_OFFICIAL_ref_mode.md`). This is the operational version:
> what H3 actually wants, mapped onto our pipeline's asset roles. Where this
> guide and a hunch disagree, this guide wins — it is transcribed from the
> model's own documentation, not vibes.

## 0. The one-paragraph mental model

H3 is not "a video model that accepts a caption." It reads a **screenplay in a
formal grammar**: typed reference labels, numbered shots with millisecond cut
times, a fixed camera vocabulary, speaker IDs, tagged dialogue, and separated
sound layers. It can ingest **up to 9 images, 3 video clips, and 3 audio
tracks in one generation** and carries identity, performance, camera movement,
composition, soundscape, and editing rhythm from whatever you hand it. The
more of its native grammar the prompt speaks, the more control you actually
have. Our legacy `@Image N` scheme is a foreign accent — it works, but it is
NOT the native tongue.

## 1. Two prompt modes — pick one per generation

| Mode | When | Structure |
| --- | --- | --- |
| **Base** (T2VA / I2VA / FL2VA / L2VA) | Text-only, or images used strictly as first/last frame anchors | optional alignment instruction + 3 core fields |
| **Full-reference** | Any identity/style/storyboard refs, reference video, or reference audio — i.e. almost every studio sequence | 6 sections with typed labels |

Base-mode task variants:
- **T2VA** — text only, no instruction line.
- **I2VA** — image is the literal first frame. Instruction line (verbatim):
  `For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.`
- **FL2VA** — first AND last frame. `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot N) aligns with the S.SS-second mark of the target video.` Favors a SINGLE shot so the model can interpolate.
- **L2VA** — last frame only; the video converges onto the image.

The instruction line is the FIRST line, then one blank line, then the core
fields. `S.SS` is the effective duration with exactly two decimals.

## 2. The three core fields (base mode)

```text
integrated_multimodal_description: [Shot 1] ...

overall_soundscape: ...

non_diegetic_music: ...
```

- `integrated_multimodal_description` — visuals, actions, shots, speakers,
  dialogue, and diegetic sound along the timeline. THE body.
- `overall_soundscape` — 1–4 sentences: ambience, physical sounds, non-verbal
  human sounds for the WHOLE video. Never repeat dialogue here. `N/A` only for
  explicitly requested total silence.
- `non_diegetic_music` — 1–3 sentences: audience-only score. Instrumentation,
  tempo, rhythm, dynamics. **No mood words** ("melancholy piano" ✗ →
  "sparse solo piano at a slow tempo, sustained low cello underneath" ✓).
  `N/A` when no score.

## 3. Shots, cuts, and the camera vocabulary

- `[Shot 1]` opens with NO timestamp. Every later shot: `[Shot N] At MM:SS.mmm, the camera cuts to ...` — strictly increasing times inside the duration.
- Cut verbs: `the camera cuts to`, `the shot cuts to / transitions to / changes to / switches to`. Dissolve/fade/wipe only when deliberately chosen.
- A cut must introduce NEW information (subject, space, state, viewpoint, time). A distance/angle tweak is camera MOTION, not a cut.
- Open `[Shot 1]` with the style + initial composition: `[Shot 1] Live-action, cinematic, a medium-wide shot frames ...`

Camera motion = **type + amplitude + speed**, written as natural prose inside
the shot (never stacked labels at the end):

| Types | |
| --- | --- |
| `Zoom In / Zoom Out` | focal length change, camera static |
| `Push In / Pull Out` | camera moves forward/backward |
| `Pan Left / Pan Right` | lens pivots horizontally in place |
| `Truck Left / Truck Right` | camera translates horizontally |
| `Tilt Up / Tilt Down` | lens pivots vertically in place |
| `Pedestal Up / Pedestal Down` | whole camera rises/descends |
| `Arc Shot` / `Tracking Shot` / `Static Shot` / `POV` | |
| `Shake Slightly / Shake Strongly` | |
| `Roll Clockwise / Roll Counterclockwise` | |

Amplitude: `with small amplitude` / `with large amplitude`. Speed: `at slow
speed` / `at fast speed`. Omit when medium/normal.

```text
The camera pushes in with small amplitude at slow speed toward the folded letter in her hands.
```

## 4. Speakers, dialogue, on-screen text

- Vocal sources get stable IDs `(S1)`, `(S2)`; joint lines use `(S1,S2)`. IDs
  persist across shots; silent characters get none. Assign in order of first
  actual vocal event.
- First appearance: establish identity OUTSIDE the tag (age, timbre, pace),
  then the line INSIDE `<d>[Language] ...</d>` — content verbatim, never
  translated, punctuation normalized to `, . ? !`.

```text
The young woman with a quiet, breathy voice (S1) says: <d>[English] I get off at the next station.</d>
```

- Voiceover uses the EXACT phrase `says in an off-screen voiceover` and, right
  after the `<d>` block, `while his lips remain completely closed.`
- Dialogue crossing a cut: `<scenetrans>` at both connecting points + an
  explicit continuity phrase (`continues seamlessly across the cut`). Speech
  truncated by video end: `<cutoff>`.
- Visible text (signs, subtitles, neon): English double quotes, verbatim, no
  translation: `A red neon sign reading "营业中" glows above the doorway.`

## 5. Full-reference mode — the six sections (our default)

Order is fixed:

| Section | What it is |
| --- | --- |
| `subject_definitions` | one line per tracked reference, assigning its label |
| `summary` | one paragraph, starts with a `[task type]` prefix |
| `retention_analysis` | per label: how faithfully it's carried |
| `detailed_description` | the shot-by-shot body (base-mode grammar + labels) |
| `overall_soundscape` | as base mode |
| `non_diegetic_music` | as base mode |

### 5.1 The label system

| Label | Meaning | Our pipeline mapping |
| --- | --- | --- |
| `<Subject N>` | reusable visible content: a person, environment, prop, style, action | cast portraits, location refs, the STYLE PIN |
| `<Picture N>` | an image that IS a concrete frame (first/key/last) or a storyboard/shot-planning anchor | shot stills used as frame anchors; the storyboard grid |
| `<Video N>` | whole-video relationship: edit source, **continuation start**, temporal/rhythm structure | a previous take for EXTEND mode |
| `<Audio N>` | copied or referenced audio signal | VO recordings, temp score, a previous take's soundtrack |

Key discipline:
- An image that only defines a character/scene/style does NOT get its own
  `<Picture N>` — cite it INSIDE the `<Subject N>` definition:
  `<Subject 1> is the young woman in <Picture 1>, with long dark hair ...` —
  actually, when it needs no separate analysis, simply:
  `<Subject 1> is the woman whose appearance comes from <Picture 1> and whose walking motion comes from <Video 1>.`
- A storyboard grid IS a standalone `<Picture N>`:
  `<Picture 3> is a storyboard reference for [Shot 1] and [Shot 2], defining their viewpoint, subject placement, and shot order.`
- A person/prop reused FROM a reference video is still a `<Subject N>`;
  `<Video N>` names only the structural/continuation source.
- `<Video N>` and `<Audio N>` number independently; same source file may be
  `<Video 1>` + `<Audio 2>`. A video does not spawn an `<Audio N>` just
  because its file has sound — only when the audio is actually reused/referenced.
- Labels keep one meaning across ALL six sections. Never introduce a new label
  after `subject_definitions`.

### 5.2 `summary` task-type prefixes

Combine with ` + `, no repeats: `[video continuation + keyframe completion]`.

| Type | When |
| --- | --- |
| `keyframe completion` | an image is a literal first/key/last frame |
| `reference generation` | assets guide character/scene/style/camera/storyboard without being frames or the edited/continued video |
| `video editing` | a source video is directly modified |
| `video continuation` | new content continues/extends a source video |
| `audio reuse` | the signal itself is copied (fully or partly) |
| `audio reference` | only style/timbre/content/beat is followed, signal not copied |

A reference video that provides only camera movement/cuts/rhythm is
`reference generation`, NOT `video editing`. For edits keeping original audio:
`[video editing + audio reuse]`. Editing tasks open the summary with
`The target video is an edited version of <Video 1>.`

### 5.3 `retention_analysis` markers

Visible content: `fully_preserved` · `partially_preserved` ·
`attribute_transfer` · `weak_reference`.
Audio: `fully_copy` · `partially_copy` · `reference` · `weak_reference`.

```text
<Subject 1> (appears in [Shot 1], [Shot 3]): fully_preserved - identity, long hair, and pink shirt are retained.
<Picture 2> ([Shot 1] first frame): fully_preserved - ...
<Video 1> (cut and pacing structure): weak_reference - ...
<Audio 1>: reference - the target speaker follows its timbre without copying the signal.
```

New actions/backgrounds/plot in the target are NOT fidelity losses — don't
downgrade a marker for them. No `(Sx)` IDs in this section.

### 5.4 `detailed_description` rules

- Style opening comes BEFORE `[Shot 1]` (one or two sentences) — unlike base
  mode, where style opens inside Shot 1.
- **350–500 English words** for generation tasks. Dialogue-dense content
  prioritizes the full spoken timeline over word count. Do NOT write a plot
  summary or a list of reference relationships — describe what is literally
  on screen and audible: composition, appearance and position, environment
  and light, actions and state changes, camera movement, sound, and WHERE
  each reference takes effect.
- First clear appearance of a `<Subject N>`: describe its referenced traits,
  frame position, current action. Reuse the bare label afterward.
- Frame anchors in natural phrasing: `the shot begins from <Picture 1>`,
  `the shot's keyframe corresponds to <Picture 2>`, `the shot ends on <Picture 3>`.
- A referenced subject that speaks: `<Subject 2> (S1) turns and says, <d>[English] ...</d>`.
- Verbal content living only inside a reused soundtrack keeps `<Audio N>` as
  its source — do NOT invent an `(Sx)` for it. Reused lyrics/dialogue are
  verbatim in `<d>`; `[unclear]` for unintelligible spans, never guessed.
- When only timbre/rhythm/emotion is referenced, do NOT carry the reference
  audio's words into the target.

## 6. The consistency-extension play (why this doc exists)

H3's `[video continuation]` + `<Video N>` is a first-class mechanism, which
means the FLUX-3-only assumption for extends is obsolete on the prompt side:

1. Attach the previous take as `<Video 1>` (and, if its sound should carry,
   its track as `<Audio 1>` with `reference` or `partially_copy`).
2. Define recurring characters as `<Subject N>` sourced from BOTH the cast
   portrait and the previous take: `<Subject 1> is the man whose appearance
   comes from <Picture 1> and whose on-screen look comes from <Video 1>.`
3. Summary: `[video continuation + reference generation] The target video
   continues from the end of <Video 1> ...`
4. `retention_analysis`: `<Video 1> (continuation source): fully_preserved`,
   subjects `fully_preserved`.
5. The description's Shot 1 picks up the final state of `<Video 1>` and moves
   forward.

Same-cast-across-scenes without continuation: pass the previous take as a
pure `reference generation` source — identity rides `<Subject N>`, and the
take's grade/lighting/rhythm can ride `<Video 1>` as `weak_reference` for
look-consistency without inheriting its timeline.

Input budget per generation: **9 images / 3 videos / 3 audio.** Spend it in
this order for our sequences: style pin → cast → storyboard grid →
first-frame still → prev-take video → location → remaining shot stills.

> ✅ Transport VERIFIED (2026-08-05, atlascloud.ai/models/minimax/h3/
> reference-to-video API tab): H3 r2v takes `refers: [{url, type:
> "image"|"video"|"audio"}]` — any mix, ≥1 item, at least one image OR video
> (audio never alone). Formats: PNG/JPEG/JPG/WebP · MP4/MOV · MP3/WAV.
> Also: `resolution: "768P"|"2K"` (default 2K), integer `duration` 4–15,
> `ratio` incl. `"adaptive"` (default), `"21:9"`, `"4:3"`. Implemented in
> `AtlasCloudGenerator.generateVideo` via `mediaRefs` (the refers path);
> images keep the verified `image_url(s)` path when no video/audio rides.
> First real video-ref generation should still be treated as a probe —
> record the outcome here and in the prompt ledger.

## 7. Studio pipeline mapping (what our code should emit)

| Our asset | H3 construct |
| --- | --- |
| Style pin image | `<Subject N>` ("the visual style abstracted from <Picture 1>") + style-opening sentences before `[Shot 1]` |
| Cast portrait (entity referenceImage) | `<Subject N>` citing its `<Picture N>` inline |
| Location ref | `<Subject N>` (environment) |
| Storyboard / composed shot grid | standalone `<Picture N>` mapped to its shots |
| Shot still as literal opener | `<Picture N>` + `keyframe completion` + "the shot begins from `<Picture N>`" (or base-mode I2VA when it's the only ref) |
| Shot stills as composition guidance | cite inside `<Subject N>`s or storyboard `<Picture N>`; do NOT make every still a standalone Picture |
| Previous take (extend) | `<Video N>` + `[video continuation]` |
| Previous take (look/rhythm only) | `<Video N>` as `weak_reference` structure source |
| VO / temp score | `<Audio N>` with the right copy/reference marker |
| Our shot list + durations | `[Shot N] At MM:SS.mmm` cuts — H3's stated cut times ARE our chop map, same contract as today |

## 8. Anti-patterns (each one is a documented rule violated)

- ✗ `@Image N` role manifests — H3's grammar is `<Subject/Picture/Video/Audio N>`.
- ✗ Timestamping `[Shot 1]`.
- ✗ Camera moves as trailing tags (`...vibrating. Push in, slow.`) — write prose.
- ✗ Mood words in `non_diegetic_music` ("haunting", "melancholy") — name
  instruments, tempo, dynamics.
- ✗ Dialogue repeated in `overall_soundscape`.
- ✗ A standalone `<Picture N>` for every identity image.
- ✗ New labels invented mid-description.
- ✗ Cutting when only distance changes — that's a push/pull, not a cut.
- ✗ Under ~350 words for a multi-shot sequence body (thin prompts under-use
  the model; our terse "VISUAL FACTS" style is tuned for Seedance, not H3).
- ✗ Guessing unintelligible reused lyrics — `[unclear]`.

## 9. Worked example — a Creed-shaped sequence, native grammar

```text
subject_definitions:
<Subject 1> is the visual style abstracted from <Picture 1>: high-contrast black-and-white 16mm film with heavy grain, scratches, crushed blacks, and blown-out whites.
<Subject 2> is Parzival, the exhausted man in <Picture 2>, with unkempt dark hair and a worn gray shirt.
<Picture 3> is a storyboard reference for [Shot 2] and [Shot 3], defining their composition and shot order.

summary:
[reference generation] The target video is a continuous 15-second black-and-white sequence in which <Subject 2> speaks into a recorder while cutaways show vibration phenomena, following the compositions planned in <Picture 3>.

retention_analysis:
<Subject 1> (governs all shots): fully_preserved - the grain, contrast, and monochrome palette are retained in every frame.
<Subject 2> (appears in [Shot 1]): fully_preserved - identity, hair, and clothing are retained.
<Picture 3> ([Shot 2], [Shot 3] planning): fully_preserved - viewpoint and shot order are followed.

detailed_description:
The target video is a high-contrast black-and-white film sequence with heavy 16mm grain, deep shadows, and harsh single-source practical lighting, in the style of <Subject 1>.
[Shot 1] A close-up frames <Subject 2> (S1) in a cramped gray apartment, his face lit hard from one side as he leans toward a handheld recorder. The camera pushes in with small amplitude at slow speed. <Subject 2> (S1) says in a flat, exhausted voice, <d>[English] Restate my assumptions. One — everything is vibration.</d> His lips close as his thumb stays on the recorder switch.
[Shot 2] At 00:04.000, the shot cuts to an extreme close-up of a struck wine glass on a scarred wooden table, its rim vibrating as concentric rings tremble across the liquid. The camera holds a static shot while the vibration blurs the glass edge.
[Shot 3] At 00:08.000, the shot cuts to an extreme close-up of sand on a black speaker cone leaping into a sharp geometric pattern. <Subject 2> (S1) says in an off-screen voiceover: <d>[English] Two — things that synchronize become stronger together.</d> while his lips remain completely closed.
[Shot 4] At 00:11.000, the shot cuts to a close-up of a thin wedding ring on a dirty windowsill, buzzing faintly against the wood, its motion accelerating until the final frame.

overall_soundscape: Low room tone and tape hiss continue throughout, joined by the thin ring of vibrating glass, the dry rustle of leaping sand, and the rapid metallic buzz of the ring against wood.

non_diegetic_music: A single sustained low sine tone that rises very slowly in volume across the video and stops on the final frame.
```

[GRAMMAR::NATIVE][REFS::TYPED][CONTINUATION::FIRST-CLASS]
