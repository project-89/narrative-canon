# Seedance 2.0 Prompting Guide (reference for the sequence prompt-composer)

Source: creator guide provided by Michael (2026-05-30). This is the spec the
`generate_sequence_video` prompt-composer implements. Write prompts like a
director: specific subject, concrete motion, intentional camera, explicit
references, realistic about what fits the duration.

## The shot-script format (what we generate for multi-shot)

The highest-quality multi-shot structure. Timecodes are not decoration — they
tell Seedance WHEN each beat happens, and (key for us) **the timecodes we state
become the proportional `shotCuts` for the timeline chop.**

```
【Style】<specific style anchor: director/film/art-movement + palette>
【Duration】<N> seconds

[00:00-00:04] Shot 1: <Shot name> (<camera move + framing>).
<Scene/subject with physical detail>.
<One concrete action beat with specific body language>.
<Audio cue>.

[00:04-00:07] Shot 2: <Shot name> (<camera>).
...

<Consistency constraints>. <Physics requirements>. <Palette notes>.
<Negative directives>.
```

Why it works: temporal precision (actions land on time), narrative arc (named
shots force setup→discovery→payoff), physical grounding (concrete details
constrain the physics).

## The six-ingredient formula (per shot)

`[Subject + specific detail] + [one concrete action beat] + [environment] +
[one camera move + framing] + [lighting source + mood] + [style]`. Always include
subject and motion at minimum. Match complexity to duration — a ~4s shot = one
subject, one action, one camera move, one mood.

## @Tag reference system (omni / "Universal Reference" mode)

- Images `@Image1..@Image9`, videos `@Video1..@Video3`, audio `@Audio1..@Audio3`;
  ≤12 files total. Tags assigned in upload order.
- **Golden rule:** state each reference's ROLE explicitly. Not "use @Video1" —
  "reference @Video1 for camera movement only; character from @Image1."
- Image ref roles: first frame / last frame / character ref / background
  environment / **style ref** / **storyboard frames**.
- First/Last-frame mode and Universal-Reference mode are mutually exclusive
  (matches the Replicate schema: `image` can't combine with `reference_images`).

## Storyboard-to-video (our primary multi-shot reference)

Generate one GPT-Image **storyboard sheet** (a grid of numbered panels: red frame
boxes for framing, blue arrows for motion), then feed it as `@Image1` with:

> Use @Image1 as the authoritative N-second cinematic shot blueprint. Do NOT
> render the storyboard sheet itself — exclude all panel borders, headers, text,
> labels, and page layout. Treat each panel as an individual sequential shot
> guide, not one combined image or split-screen. Follow panel order exactly,
> preserving staging, camera angle, framing, character placement, action beats,
> motion direction, timing rhythm and shot-to-shot continuity. Use the drawings
> for choreography/geography/composition only; translate the rough sketches into
> the intended final <style>. Interpolate natural motion between panels,
> preserving start/end poses and screen direction. Allocate the N seconds across
> panels by visual emphasis. Do not invent new major actions, locations,
> characters, props, or camera setups.

## Camera vocabulary (8 core moves)

push-in/dolly-in · pull-out/dolly-out · pan · tracking/follow · orbit/arc ·
aerial/drone · handheld · fixed/locked-off. Plus: crane up, low-angle tilt up,
whip pan, Hitchcock zoom, rack focus, first-person POV.

**Three camera rules:** (1) ONE primary camera instruction per shot (compound =
"primary then secondary", e.g. "low tracking shot then subtle rise"). (2)
Rhythmic words, not technical specs ("slow, smooth, gradual" — never "24fps,
f/2.8"). (3) **Separate camera movement from subject movement** ("the dancer
spins; camera holds fixed") — mixing them is the #1 cause of shaky output.

## Lighting (highest-leverage single add)

golden hour · rim light · natural/window light · neon · backlit · overcast. If
you add one thing to improve a shot, add lighting.

## Negative prompts (always include)

avoid jitter · avoid bent limbs · avoid temporal flicker · avoid identity drift ·
avoid chaotic composition. **Quality killers to avoid:** bare "fast" (make only
ONE element fast), bare "cinematic"/"epic"/"beautiful" (too vague), "lots of
movement" (→ jitter).

## Generation modes

- **Text-to-video** — full six-ingredient formula, describe everything.
- **Image-to-video** — don't re-describe the image; focus on motion + camera,
  "preserve composition and colors."
- **Single continuous shot** (NOT multi-shot) — end with "No scene cuts
  throughout, one continuous shot." For MULTI-shot sequences we do the opposite:
  the timecoded shot-script implies hard cuts between shots.

## Character consistency across shots/clips

Same reference image every time + explicit appearance descriptors even with a
ref ("same red jacket, short black hair"). For chained clips, use the last frame
of clip N as the first frame of clip N+1.
