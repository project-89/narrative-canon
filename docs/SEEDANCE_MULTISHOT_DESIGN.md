# Seedance 2.0 Multi-Shot → Timeline Chop — Design Spec

> ⛔ **STATUS (2026-06-20): BUILT but SHELVED for photoreal projects.** P1 (single-shot
> backend), P3 (multi-shot sequence + proportional chop), the grid-only refs strategy,
> and the programmatic grid composer were all implemented and the Replicate mechanics
> verified (create→poll→download, reference-mode accepted). **BUT Seedance rejects clear
> realistic faces — even AI-generated — at an image-scan layer before reading the prompt
> (E005 "sensitive" / "copyright"). The grid-only mitigation cleared the sensitive gate but
> still hit the likeness gate.** So Seedance multi-shot is NOT viable for this realistic
> project. The pipeline is **Veo single-shot + the P2 virtual-chop/trim/splice editing**
> (model-agnostic, all shipped). This spec + the plumbing remain valid for a future
> STYLIZED/illustrated project (illustrated refs pass the scan). See STUDIO_DESIGN gotcha #21.

**Status**: Built; shelved for realistic faces (see banner). The 5 decisions below are LOCKED (resolved with Michael).
**Author**: design pass 2026-05-29; verdict 2026-06-20.

## The idea

Instead of generating one clip per shot (the Veo path), generate a whole
**run of shots as ONE coherent Seedance multi-shot video** (≤15s), then split it
back into the individual timeline clips that match each shot. Cross-shot
coherence — consistent characters, lighting, continuous motion and intentional
cuts — that per-shot generation can't give you. This is the original
"Seedance → chop" vision from the studio design doc.

Seedance 2.0 supports this natively: multi-shot videos up to 15s with synced
audio, and an omni-reference system (up to 9 images + 3 videos + 3 audio, cited
in the prompt as `[Image1]`, `[Video1]`, …).

## The core architectural choice: VIRTUAL chop (recommended)

When Seedance returns one mp4 with internal cuts, we have two ways to turn it
into N timeline clips:

- **Physical chop** — run ffmpeg to cut the mp4 into N segment files. Needs an
  ffmpeg dependency, write N files, and re-cut on every adjustment.
- **Virtual chop (recommended)** — keep ONE source video; each timeline clip
  references it with an in/out range `{ sourceVideoUrl, inSec, outSec }`. The
  viewer plays the source seeked to `[inSec, outSec)`. No ffmpeg, instant
  re-trim, reuses the timeline trim/split work we already have. Export to a
  single MP4 (later) is where ffmpeg finally earns its place.

Virtual chop also unifies with the **in/out trim** feature: a "chop point" is
just an out-point on clip A and an in-point on clip B into the same source.

## Data model

A scene-run video lives once; timeline clips slice it.

```
// On the scene (or a sequences[] if a scene needs >15s split into runs):
scene.sequenceVideo?: {
  url: string;               // the single Seedance mp4
  model: 'seedance-2.0';
  durationSec: number;       // actual generated length
  status: 'pending'|'done'|'error';
  jobId?: string;
  prompt: string;            // the composed multi-shot prompt
  shotCuts: Array<{          // mapping shots → ranges in the source video
    shotId: string;
    inSec: number;
    outSec: number;
    source: 'proportional' | 'detected' | 'manual';
  }>;
  generatedAt: string;
}

// Timeline item gains virtual-chop fields (also used by single-clip trim):
ProjectTimelineItem.sourceVideoUrl?: string;
ProjectTimelineItem.inSec?: number;   // start offset into the source video
ProjectTimelineItem.outSec?: number;  // end offset; playLen = outSec - inSec
```

A shot's timeline clip, when its scene has a `sequenceVideo`, plays
`sequenceVideo.url` over `[inSec, outSec)`. Re-using the same source across
clips is what makes it "one take, many cuts".

## Cut alignment — how we find the boundaries

Seedance decides the exact cut timing inside the mp4; we don't get boundary
timestamps from the API. Three strategies, in increasing fidelity:

1. **Proportional (v1 default)** — split the source by the shots' *intended*
   durations (their `durationSec`, normalized to the generated length). Assumes
   Seedance roughly honored our pacing. Fast, no extra tooling.
2. **Manual adjust** — the user drags the chop points / uses the existing split
   tool to align to the real cuts they see. Always available on top of (1).
3. **Cut detection (v2)** — run a shot-boundary detector (ffmpeg `scdet` /
   scene-change threshold) on the mp4 to find the real cuts, then snap our chop
   points to them. Best fidelity; needs ffmpeg. Build after v1 proves out.

**Recommendation:** ship v1 = proportional + manual adjust. The virtual-chop
model means re-aligning is just dragging an in/out handle — cheap and immediate.
Add cut-detection as a "snap to cuts" button later.

## Scope unit: the "sequence" (≤15s run)

Seedance caps at 15s. A scene's shots often sum to more. So the unit of
generation is a **sequence** = a contiguous run of a scene's shots whose total
intended duration ≤ 15s. A long scene becomes multiple sequences (multiple
generations), each its own source video, concatenated on the timeline. v1 can
require the user to pick a run (or auto-pack greedily to ≤15s).

## Mode: omni-reference, not first/last

Multi-shot uses Seedance's **omni_reference** mode (first/last-frame and
references are mutually exclusive). Keyframes (`firstFrame`/`lastFrame`) stay on
the **single-shot** path (Veo or Seedance first_last_frames mode).

### Primary reference strategy: the single-page storyboard grid (decided 2026-05-29)

The strongest multi-shot reference is **ONE storyboard image holding all the
panels** of the run, not N disconnected stills. GPT Image is excellent at laying
out a single image with 12–16 numbered panels in the locked style. We already
have this surface — the Storyboard "Page" action (`generate_storyboard_page`)
generates a multi-panel page from a scene's prose. So the multi-shot flow is:

1. Generate (or reuse) a **single storyboard-page image** for the run's shots,
   panels numbered in shot order.
2. Feed that ONE image to Seedance as the composition reference, with a detailed
   prompt that walks panel-by-panel and **spells out per-shot timing, order, and
   cuts** ("panel 1 → 0.0–4.0s, hard cut to panel 2 → 4.0–7.0s, …").

One coherent reference of the whole sequence gives Seedance far better
cross-shot continuity than a soup of individual stills. **Fallback / augment:**
cast portraits + location as additional omni-refs cited for identity when the
grid panels are too small to lock a face.

This also tightens the chop: the panel order in the grid IS the shot order, and
the prompt's stated per-panel timings ARE the proportional `shotCuts` (so v1
"proportional" chop is just reading back the timings we told Seedance to use).

## Prompt composition (shot list → one multi-shot prompt)

Compose a single prompt from the run's shots, e.g.:

```
A continuous multi-shot sequence in [project style]. Cast: [Image1]=Sarah, [Image2]=Thorne. Location: [Image3].
Shot 1 (medium, eye-level, ~4s): Sarah types at the terminal, blue glow on her face. [Image4] is the composition.
— hard cut —
Shot 2 (ECU, ~3s): extreme close-up of the chaotic equations on the blackboard. [Image5].
— cut —
Shot 3 (reaction, ~4s): Thorne turns, expression of terror. [Image2] for identity.
Dialogue: "..." . Ambient: hum of servers.
```

The agent already has the per-shot breakdown in context — it can author this.
A new tool `generate_scene_video` (or `generate_sequence_video`) composes it.

## Workflow + UI

1. On a scene (or a selected run of shots), the user/agent triggers
   **"Generate sequence video"** → composed Seedance multi-shot job (async, same
   job model as Veo).
2. On completion, the scene gets `sequenceVideo`; we compute `shotCuts`
   (proportional) and set each shot's timeline clip to `{ sourceVideoUrl, inSec,
   outSec }`.
3. The timeline scene box (Phase C) shows it as one source spanning its clips;
   the viewer plays the source across the run; clips are individually trimmable
   and split-able (virtual). A "snap to cuts" action (v2) realigns to detected
   cuts.
4. Single-shot Veo/Seedance clips and multi-shot sequences coexist on the
   timeline — a clip either has its own `frame.video` or points into a
   `sequenceVideo`.

## Build phases

- **P1 — Single-shot Seedance (parity)**: Seedance backend #2 via Replicate
  (`first_last_frames`, variable duration). Drop-in next to Veo. (Prereq:
  `REPLICATE_API_TOKEN`.) *Not part of multi-shot, but the Replicate plumbing
  this design needs.*
- **P2 — Virtual chop + in/out trim**: `ProjectTimelineItem.{sourceVideoUrl,
  inSec,outSec}`; viewer plays source over the range; left-edge in-point handle.
  (Useful on its own for single videos too.)
- **P3 — Multi-shot generation**: `generate_sequence_video` (compose prompt +
  omni-refs from a ≤15s run), `scene.sequenceVideo`, proportional `shotCuts`,
  wire the run's clips to the source.
- **P4 — Cut detection ("snap to cuts")**: ffmpeg scene-detect → snap chop
  points. Also unlocks MP4 export.

## Locked decisions (resolved 2026-05-29 with Michael)

1. **Chop fidelity for v1**: ✅ **Proportional + manual.** Split the source by
   each shot's intended `durationSec` (normalized to the actual generated
   length); the user drags chop points to fix drift. No ffmpeg in v1.
   Cut-detection ("snap to cuts") lands later as P4.
2. **Virtual vs physical chop**: ✅ **Virtual.** One source mp4 per sequence;
   each timeline clip carries `{ sourceVideoUrl, inSec, outSec }` and the viewer
   seeks the range. ffmpeg only enters at MP4 export (P4).
3. **Run selection**: ✅ **User selects the run.** The user picks the contiguous
   run of shots (≤15s) to generate as one sequence. Auto-pack-greedily is a
   later convenience, not v1.
4. **Coexistence**: ✅ **Side-by-side.** A clip either owns its own
   `frame.video` (single-shot Veo/Seedance) or points into a scene's
   `sequenceVideo` via in/out. The timeline is agnostic; the viewer picks the
   source per clip.
5. **Provider**: ✅ **Seedance via Replicate.** Michael is adding
   `REPLICATE_API_TOKEN` to `.env` this session — unblocks P1 + P3.
