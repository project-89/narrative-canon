# Seedance 2.5 Prompting Guide (distilled)

Distilled 2026-08-08 from the ByteDance official formula and the major
published guides (Higgsfield, Tryonr, WeShop, Pollo) plus the live Atlas
model spec. The studio's automatic composer for backend `seedance-25` is
`composeSeedance25SequencePrompt` (src/api/server.ts) — it emits everything
below; authored `prompt` overrides should follow this grammar. Compare
`docs/H3_PROMPTING_GUIDE.md`: H3 wants compact typed-label six-section
prompts; **2.5 wants long, structurally scaffolded, super-descriptive
prompts**. Same evidence hierarchy (video > images > text), different
dialect and appetite.

## The official six-part formula

Every prompt covers, in order:

**Subject + Action/Event + Setting + Visual Style + Camera Work + Sound**

```
<Subject> does <main action> in <setting>.
The image is <visual style>.
The camera uses <shot size, position, movement>.
Sound includes <dialogue, ambience, effects, music>.
```

## Timed beats — the anti-drift scaffolding

The #1 cause of character/story drift in long (30s) clips is a loose
single-paragraph prompt. Split the clip into **timestamped beats**, each
stating what is visible, the camera action, and the audio:

```
0.0s–2.5s  Shot 1 — [what's visible] [explicit camera move] [audio]
2.5s–6.0s  Shot 2 — ...
```

Every beat names its camera move explicitly. Timestamps are what hold a
30-second take on course.

## References are jobs, not decoration

Cite attachments as `@Image1`, `@Video1`, `@Audio1`. **Every referenced
file gets a declarative role statement AND an exclusion**:

```
@Image1 provides Kira's appearance — face, hair, wardrobe, gear.
Do not use this image's background, pose, or lighting.

@Video1 provides the look/grade/rhythm reference.
Do not take identity, clothing, or location from this video.
```

- **The single-identity rule:** when multiple images show the same
  character/object, end with *"All these images define one single X.
  There is only ever one X."* Omitting it makes references merge into
  duplicates.
- **Never upload multi-angle grids** — separate images per view. Past ~5
  subjects, single-view images are more stable than multi-view sets.
- **Ratio thresholds (ceilings are not targets):** ≤8 image subjects is
  the sweet spot (stretch 9–12); ≤5 video/audio subjects (stretch 6–10).
  Over-referencing *dilutes* — features blur. Registry maxRefs is 12.
- **Video/audio ref clips: 5–10s each is the sweet spot.** 2s is too
  brief to read; 30s dilutes. (Scene reels at 15s work but a trimmed
  8–10s reel is stronger evidence.) Combined video refs ≤30s.
- **Drop priority under budget pressure:** characters last —
  style → environment → props → characters (keep identity longest).

## Audio syntax (official character mappings)

| Element        | Marker  | Example                       |
|----------------|---------|-------------------------------|
| Music          | `( )`   | `(low synth pulse builds)`    |
| Sound effect   | `< >`   | `<train roar doppler>`        |
| Dialogue       | `{ }`   | `{I thought you'd gone.}`     |
| On-screen text | `【 】` | `【CHAPTER ONE】`             |

Dialogue always names the language and delivery first:

```
American English. Kira says, breathless: {We don't stop.}
```

Silence is declared, not assumed: `No music — only raw diegetic SFX.`

## Negative prompting works

Plain "do not" statements are honored:

```
Do not change the character's face, hair, or wardrobe between shots.
No people in the background. No on-screen text. No flickering.
```

## What NOT to put in the prompt

Resolution, frame rate, and aspect ratio belong in the API parameters
(`resolution`, `ratio`), never in prompt text.

## Failure modes → fixes

| Symptom                          | Fix |
|----------------------------------|-----|
| Character drift over 30s         | Timed beats; identity exclusions; single-identity line |
| Unwanted elements from a ref     | Add the "Do not use ..." exclusion for that ref |
| One character rendered as two    | The single-identity line was omitted |
| Wrong dialogue language          | Name the language before the line |
| Blurred/blended identities       | Deck too big — cut below the ratio thresholds |
| Unwanted extra camera cuts       | State "no cuts" / name the ONLY allowed camera moves |
| Plastic/over-VFX look            | Inline `[VFX: ...]` brackets inside the beat, or "no 3D, no cartoon, no VFX" |

## Editing mode (not yet wired in the studio)

`duration: -1` switches to video editing: `{Video edit: remove everyone
from @Video1 except the lead}`, relights ("change lighting from X to Y"),
appearance changes (lock the unchanged elements first). Output ratio is
forced adaptive; result runs ~0.4s shorter than input. `output_format:
"mov"` (yuv444p) is for multi-round edit pipelines. This is the road to
~3-minute chained pieces — integrate after straight 30s takes are proven.

## Atlas hard limits (live spec 2026-08-08)

Images 0–30 (≤30MB, ≤4K) · videos 0–10 (2–30s each, combined ≤30s,
≤200MB) · audio 0–10 (2–30s, ≤15MB) · duration 4–30 or -1 · resolution
480p/720p · ratio 16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive ·
$0.134/s. Real-human-face uploads refused; model-generated refs pass.
