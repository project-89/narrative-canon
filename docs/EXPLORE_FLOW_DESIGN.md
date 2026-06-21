# Explore → Curate → Assemble — Design Spec

**Status**: Design (pre-build). The studio's next north star.
**Author**: 2026-06-20, with Michael.

## Why this exists (the vision)

Filmmaking is **coverage then selection**: you shoot a moment from many angles,
review the takes, keep the frames that sing, and cut from those. The studio
should feel the same — **exploratory and directorial**, not a linear
render-to-export pipeline.

> The unit of work is a **candidate**, not a final. Exploration is cheap;
> commitment is explicit. The agent generates coverage; the creator curates; the
> agent assembles. Nothing you generate is ever lost.

This reframes the whole tool around *discovery*: take a scene, look at many
shots, find the best ones, assemble them into shots, turn those into clips or
full generations — all collaboratively, with the creator directing.

## Principles

1. **Coverage before commitment.** Generate many, choose few. The default verb
   is "explore," not "render the final."
2. **Two engines, one surface.** Every exploration — however generated — pours
   into ONE candidate gallery with ONE "promote to shot" action. The creator's
   curation feel is identical regardless of engine.
3. **Output is stills (for exploration).** Even a flawed exploration *video* is
   useful — mine it for good frames/angles. The keeper is a still you can render
   from, not the video.
4. **Non-destructive.** Candidates never overwrite anything. Promoting a
   candidate *creates* a shot. Everything is recorded in the generated-image
   registry — nothing is wasted (ties to the assets system).
5. **Agent explores, creator curates, agent assembles.** The agent proposes
   coverage + generates it; the creator keeps/rejects; the agent lays the cut on
   request. Agent-first, human-in-the-loop.
6. **Provenance on every candidate.** Each candidate knows its source image,
   engine, prompt, and angle/cut — so you can re-explore, trace, or re-render at
   higher fidelity.
7. **Exploratory UX.** Big images, fast keyboard scrub, keep/reject gestures,
   side-by-side compare, no modal friction. The surface should feel like a
   lightbox/contact sheet, not a form.

## The flow, end to end

```
SEED                 EXPLORE                EXTRACT            CURATE                 ASSEMBLE
(starting image)  →  (engine + N angles) →  (N candidates) →  (keep / reject /     → (promote keepers
 scene / shot /       per-angle render OR    stills land as    compare / upscale /    → shots in order →
 fresh establish      Seedance 15-cut        a candidate SET    re-explore)            animate → timeline)
```

1. **Seed** — pick a starting point: a scene (use its establishing image or
   prose to make one), an existing shot's still, or generate a fresh
   establishing image on the spot.
2. **Explore** — choose an engine + how many angles. The agent composes the
   exploration (per-angle prompts, or the frozen-scene 15-cut shot-script).
   Async, same job model as video.
3. **Extract** — per-angle → N renders; Seedance → ONE video → N stills sampled
   at the cut points.
4. **Candidate set** — the N stills attach to the scene as a CANDIDATE SET (not
   shots yet). Each candidate carries provenance + a `keep` flag.
5. **Curate** — the candidate gallery: scrub, big preview, keep/reject, compare
   two, **upscale a keeper to 4K (Nano Banana)**, **re-explore from a candidate**
   (generate more coverage seeded by it).
6. **Promote** — keepers become real shots in the scene (in the order you
   choose), carrying their angle/composition. This is the only step that mutates
   the scene's shot list.
7. **Animate** — promoted shots → Veo clips (now with dialogue + SFX audio) →
   the timeline + the chop/trim editing.

## The two exploration engines

Both produce a candidate set; the curation + promote path is shared.

### Engine A — Per-angle render (default; no face-gate; works today)
The agent writes N distinct shot prompts (wide / OTS / ECU / low-angle /
reaction / insert…) from the seed, each rendered via the clean `/render` pipe
with the scene's cast/location/style refs. N independent candidates. Works for
**realistic characters** (no Seedance face-scan), reuses everything we have, and
each candidate is independently re-rollable. Cost = N renders.

### Engine B — Seedance "explore-from-image" (the Daubrez/Patrascu technique)
One image → a single Seedance generation prompted as a **frozen scene viewed
through ~15 camera cuts** (statue-still subjects, one new angle per ~1s) → then
**extract each cut as a still**. Cheap mass-coverage in one gen.
- Prompt shape: `A 15-second rapid-cut cinematic exploration of [IMAGE_INPUT].
  Tech spec: <lens/grain>. CUT 1 — WIDE — … motionless. CUT 2 — CLOSE UP — …
  frozen. … Sound design: diegetic SFX only, no music.` (the subjects must be
  explicitly *frozen/still* so the cuts are pure camera coverage, not motion).
- Extraction: sample one frame at each cut's midpoint (proportional, the cut
  count is known from the prompt) → N stills; "snap to cuts" via ffmpeg scdet is
  a later refinement.
- **Caveat (gotcha #21):** Seedance's image-scan rejects clear realistic faces,
  so this engine shines on **face-light / masked / stylized / environment /
  wide** scenes (the technique's canonical examples). For realistic close-up
  characters, prefer Engine A. The UI should pick the sensible default per scene
  and let the creator override.

> Both engines are *exploratory*, so a partial failure (a bad angle, a gated
> Seedance gen) costs little — you keep what works.

## Data model

```
// On the scene (interactions[]):
scene.explorations?: Array<{
  id: string;
  engine: 'angles' | 'seedance-cuts';
  seedImageUrl?: string;          // the starting image
  prompt: string;                 // the composed exploration prompt / shot-script
  status: 'pending' | 'done' | 'error';
  sourceVideoUrl?: string;        // for seedance-cuts: the one mp4 the stills came from
  candidates: Array<{
    id: string;
    url: string;                  // the still (extracted frame or per-angle render)
    label?: string;               // "WIDE", "ECU — eyes", an angle name
    inSec?: number;               // for seedance-cuts: where in the source video
    keep?: boolean;               // curation state
    upscaledUrl?: string;         // 4K Nano Banana pass
    promotedShotId?: string;      // set once promoted → a real frame
  }>;
  createdAt: string;
}>
```
Every candidate URL is also written to the generated-image **registry** (so it
shows in Assets > Generated and nothing is lost). Promote = `insert_frame` with
the candidate's still + label, then stamp `promotedShotId`.

## UX — the candidate gallery

A full-bleed contact-sheet surface (lives in the Scene workbench, or a dedicated
"Explore" sub-view of Production):
- Grid of candidates, big thumbnails; click → large preview with arrow scrub.
- **Keep / reject** with one gesture (`K` / `X`); kept ones get a ring + move to
  a "selects" row.
- **Compare** — pin two candidates side by side.
- **Upscale** a keeper (Nano Banana 4K) in place.
- **Re-explore** — "more like this" generates a fresh candidate set seeded by
  the selected candidate (different angles, or motion).
- **Promote selects → shots** — one action turns the kept candidates (in their
  reordered sequence) into shots on the scene.
- Provenance shown per candidate (engine, prompt, source) — collapsible.

The house style still holds: cinematic, no modal-over-modal, big images, the
chat travels with you (the agent can drive every action — "explore this scene
from 8 angles", "keep the low-angle and the ECU", "promote them as shots 3–4").

## Agent tools (new)

- `explore_scene_angles(sceneId, seedImageUrl?, angles?: string[] | count)` —
  Engine A: compose N angle prompts + render → candidate set.
- `explore_scene_cuts(sceneId, seedImageUrl, cutCount?)` — Engine B: compose the
  frozen-scene shot-script + Seedance gen + extract → candidate set.
- `list_candidates(sceneId, explorationId?)` — what's been explored.
- `keep_candidate / reject_candidate(candidateId)` — curation (agent can assist).
- `upscale_candidate(candidateId)` — 4K Nano Banana pass.
- `promote_candidates(candidateIds[], position?)` — keepers → shots in order.
- `re_explore_from_candidate(candidateId, mode: 'angles'|'motion')` — coverage
  seeded by a keeper.

## Build phases

- **E1 — Curation backbone + Engine A (per-angle).** The candidate data model,
  `explore_scene_angles`, the candidate gallery (keep/reject/compare/promote),
  `promote_candidates`. No Seedance, no ffmpeg. **This is the spine; build first.**
  Works for realistic characters today.
- **E2 — Engine B (Seedance explore-from-image).** `explore_scene_cuts`, the
  frozen-scene shot-script composer, frame extraction (proportional first), the
  face-light default. Reuses the E1 gallery + promote.
- **E3 — Fidelity + recursion.** `upscale_candidate` (Nano Banana 4K),
  `re_explore_from_candidate`, ffmpeg "snap to cuts" extraction, and
  **video-as-input** (`reference_videos`) for consistency/voice carryover.

## Open decisions (resolve before E1)

1. **Surface placement** — does Explore live inside the Scene workbench as a sub-
   view, or as its own Production sub-tab? (Lean: a sub-view of the Scene
   workbench, since exploration is scene-scoped.)
2. **Promote semantics** — does promoting a candidate CREATE a new shot, or can
   it also REPLACE/illustrate an existing shot's still? (Lean: create new shots;
   replacing is a separate "use as this shot's image" action.)
3. **Default angle set** — a fixed director's kit (wide / establishing / OTS /
   ECU / reaction / insert / low / high) the agent prunes per scene, or fully
   agent-authored each time? (Lean: a default kit the agent adapts.)
4. **Candidate persistence** — do un-kept candidates persist on the scene
   forever (history) or get pruned after N sets? (Lean: keep, but a "clear
   explored" action; ties to registry-pruning.)
5. **Seedance extraction fidelity** — proportional sampling for E2, or wait for
   ffmpeg scdet? (Lean: proportional first; scdet in E3.)
