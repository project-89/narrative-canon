# FLUX PROMPTING — the studio's craft rules for FLUX.2 (image) and FLUX 3 (video)

Distilled from BFL's guides (docs.bfl.ai) into OUR pipeline's terms. The
compact essentials live in the model registry notes (the agent always sees
those); this file is the full reference. Record what our own renders teach
with `record_prompt_lesson` — these rules are priors, not gospel.

## The one rule above all

**Specific beats long.** Start with subject + action, add only what changes
the image. Filler ("highly detailed, masterpiece, best quality") hurts.
FLUX.2 obeys up to 32K tokens — which means our long assembled prompts
(style directive + reference manifest + scene prose) actually land, but
every sentence should be doing work.

## Image (FLUX.2 [pro] — `flux-2`)

### Prompt shape

```
[IMAGE TYPE], [SUBJECT + ACTION], [LOCATION],
[STYLE], [CAMERA], [LIGHTING], [COLORS], [EFFECT], [SUPPORTING DETAILS]
```

A template, not a checklist — use the slots that change the image. Order
matters: **subject first**. If FLUX keeps pulling wide, lead with the
subject and push environment later ("Person with a determined expression,
forest fire in the background, close-up" — not "Person standing inside a
forest fire... close-up").

### Lighting is the highest-impact slot

Describe it like a photographer — source, quality, direction, temperature,
interaction. "Good lighting" is nothing; "harsh single-source practical
desk lamp, strong chiaroscuro, warm tungsten against cold window blue" is a
look. Named setups work: Rembrandt, split, golden hour, blue hour, neon
practicals.

### Photorealism = name the hardware

Cameras, lenses, film stocks, eras are the levers: "shot on Kodak Portra
400, natural grain", "2000s digicam, slight noise, flash photography,
candid", "Hasselblad X2D, 80mm, f/2.8". This is the vocabulary of Michael's
retro/camcorder styles — a named film stock beats three adjectives.

### Multi-reference: address images BY NUMBER

Up to 8 `input_image`s. FLUX.2's native grammar is exactly the studio's
reference manifest: **"the woman in image 2 sitting on the swing in image
1, in the style of image 4."** Our render boundary appends the indexed
manifest automatically (identity refs are named — "Image 2: Sophia"), so
prompts can and should refer to attachments by number and name. Say what
each image CONTRIBUTES — identity, garment, location, material, style.

### Style transfer is explicit

"In the style of image N" / "match the style of image 2" is a first-class
operation — the style-leash doctrine as an API verb. Keep the pinned style
image as a typed style ref (the manifest labels it STYLE — do not
reproduce its subjects) and reference it by number for transfer.

### Editing verbs, not vibes

Good: "Change her dress from blue to deep burgundy", "Zoom out to reveal
the factory interior", "Replace the wolf with a silver fox, same pose".
Bad: "make it better", "improve the lighting", "fix it". Be specific about
what changes and clear about the target state; everything unmentioned tends
to hold.

### Text in images

1) Quote the exact string: `"OPEN"`. 2) Describe placement ("in red neon
letters above the door"). 3) Name the font character (serif/sans/script,
weathered/chrome/carved). Front-load the text description; keep strings
short; hex codes work for brand colors.

### Studio integration notes

- Prompt upsampling (`disable_pup`) is **OFF by design** — our assembled
  prompts (style directives, manifests) must reach the model verbatim.
- ~1MP output dims keep headroom in the 9MP input+output budget when many
  references ride.
- Identity-holding across refs is CLAIMED strong; verify against our cast
  before trusting it for coverage, and `record_prompt_lesson` the result.
  Until verified the registry rates it identityRefs:'medium' — NB2 remains
  the identity default.

## Video (FLUX 3 — `flux-3`)

### The long-take mindset

One generation holds up to 20s, multiple scenes, cuts that keep character
and look, and a single audio bed. Write the SEQUENCE — shot by shot, with
the joins — rather than one still description with "and then" glued on.

### Audio is part of the prompt

Sound generates WITH the frames: name the soundscape ("rain patter and
quiet kitchen sounds", "footsteps and laughter echoing off the walls").
**Dialogue: quote the line and the character says it** — lipsynced,
multilingual, accents respected.

### Camera behavior is a subject

"the camera chasing them", "slow push-in", "handheld, nervous" — say what
the camera does and how the shot ENDS. An un-ended motion prompt drifts.

### Keyframes are FRAMES, not references

A pinned image IS that frame at that second. One image = opening frame;
two = start and end; `[seconds, image]` pairs choreograph a shot through
exact compositions. **Never feed cast portraits as keyframes** — they will
literally appear on screen (Omni Reference is not out yet; identity rides
the opening frame or the prompt).

### Draft → enhance, never re-roll the keeper

Drafts cost ~1/3. A fresh full render is a DIFFERENT generation; only
`draft_enhance` reproduces the draft you approved. Studio flow: explore in
draft, curate, enhance THE one (`render-video {enhanceFromJobId}` — the
bundle is saved beside every draft clip automatically).

### Continuation (v2v)

Feed a clip, and generation carries on from its final frames — momentum,
framing, and scene logic preserved, no cut. The road to takes beyond 20s:
generate, continue, chop on our timeline.

[SPECIFIC::BEATS-LONG][LIGHTING::THE-LEVER][IMAGE-N::THE-GRAMMAR]
