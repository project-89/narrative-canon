# Explore → Curate → Assemble — Design Spec

**Status**: `active` — **E1 shipped** (per-angle exploration, persistent
candidates, curation, promotion, registry, agent/UI surfaces); focused browser
click-pass still pending. E2/E3 remain design. See `STATE.md` for live status.
**Author**: 2026-06-20, with Michael.

> This began as a pre-build spec. E1 now exists; sections describing E2/E3 are
> still targets. When this document and implementation status disagree,
> `STATE.md` wins.

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

> The project-wide constitution lives in `AGENT_OPERATIONS.md §1` (cinematic,
> agent-first, no invisible injection, snapshot+resync, non-destructive,
> style-is-an-image-leash, thread-`projectId`, verify-by-behavior). These hold
> here too — below are only the **feature-specific extensions** for exploration.

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

> **⚠️ E1 task #1 — the survival seam (gotcha #16 class).** `scene.explorations`
> rides inside `interactions[]`, so it survives `loadProjectData` (`...parsed`
> spread, `server.ts:248`) and server restart **automatically** — the drop is
> **UI-only**: `mapScenesFromApi` (`ui/app/studio/page.tsx`) is a field whitelist
> and will silently drop `explorations`, so candidates persist on disk but never
> render. **Nothing in E1 works until you add an `explorations` branch to
> `mapScenesFromApi`** (resolve each candidate `url`/`upscaledUrl` via
> `resolveImageUrl`) and add `explorations?` to the UI `Scene` interface. Build
> this first.

The scene also carries an explicit engine preference (no invisible choice —
principle 1.3): `scene.explorationEnginePreference?: 'angles' | 'seedance-cuts' |
'auto'`. Default heuristic: realistic close-up / character scenes → `angles`
(Engine A, no face-gate); environment / wide / masked / stylized → `seedance-cuts`
(Engine B). The Explore header shows the active engine + lets the creator override,
and `explore_scene_cuts` catches Seedance's E005 face-reject and suggests falling
back to `explore_scene_angles`.

## UX — the candidate gallery

A full-bleed contact-sheet surface — its own **Explore peer phase** on the left
rail (decision #1), with the travelling chat alongside. It should feel like a
lightbox/contact sheet, never a form:
- Grid of candidates, big thumbnails; click → large preview.
- **Keyboard-first scrub:** `←`/`→` cycle the preview, `space` toggles keep, `X`
  rejects, `C` pins for compare. Fast hands, no mouse round-trips.
- **Keep / reject** also by gesture; kept ones get a ring and flow into a
  **persistent, draggable "selects" row** that holds the **reorder state before
  promote** — this row's order is exactly what `promote_candidates` consumes.
- **Batch select** (cmd/ctrl-click) with a **Keep-All / Reject-All / Reject-
  Except** bar for fast triage of a big set.
- **Compare** — pin two candidates side by side.
- **Upscale** ANY candidate (Nano Banana 4K) in place — not just keepers, so you
  can reconsider non-destructively.
- **"More like this"** — a `+` affordance on hover wired to
  `re_explore_from_candidate` (fresh coverage seeded by that candidate: angles or
  motion).
- **Promote selects → shots** — opens the non-modal **Assembly Preview** panel
  (decision #2): keepers in their reordered sequence, a timeline-thumbnail
  preview, Back-to-selects / undo, Confirm → "Add to timeline".
- Provenance + `keepReason` shown per candidate (engine, prompt, source) —
  collapsible.

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
- `upscale_candidate(candidateId)` — 4K Nano Banana pass (works on ANY candidate,
  not just keepers — non-destructive reconsideration).
- `promote_candidates(candidateIds[] /* in final order */, position?)` — keepers
  → shots. **Order contract:** the array order IS the shot order; for each id `i`,
  `insert_frame` at `position + i`, stamp `candidate.promotedShotId`, and return
  the scene with the reordered frames. This is the only step that mutates the
  shot list. Without this contract, promote silently no-ops or stacks wrong.
- `re_explore_from_candidate(candidateId, mode: 'angles'|'motion')` — coverage
  seeded by a keeper.
- `suggest_keepers(explorationId, count?)` — the agent scores the set and
  pre-marks likely keepers (with a visible `candidate.keepReason`); the director
  confirms. Keeps curation agent-assisted, not agent-decided.
- `summarize_candidates(explorationId)` — the agent narrates the set in chat
  ("8 angles; the low-angle ECU and the wide both read well; 3 are soft").

## Build phases

- **E1 — Curation backbone + Engine A (per-angle).** The candidate data model +
  the `mapScenesFromApi` seam (task #1), `explore_scene_angles`, the candidate
  gallery (keep/reject/compare/promote), `promote_candidates` with its order
  contract. **No Seedance, no ffmpeg** — works for realistic characters today.
  **This is the spine; build first.** Buildable now once the seam + 4 core tools
  land (see Build dependencies).
- **E2 — Engine B (Seedance explore-from-image). GATED ON FFMPEG.**
  `explore_scene_cuts`, the frozen-scene shot-script composer, and frame
  extraction. **Blocker:** extracting stills from a Seedance mp4 needs a video
  decoder — `sharp` is image-only and there is none in the codebase. E2 must add
  `@ffmpeg-installer/ffmpeg` + a new `src/visual/video-frame-extractor.ts`
  (proportional sampling at the known cut count first; scdet "snap to cuts" is
  E3). Until that lands, `explore_scene_cuts` can only write a
  `pending-extraction` candidate stub. Reuses the E1 gallery + promote.
- **E3 — Fidelity + recursion.** `upscale_candidate` (Nano Banana 4K),
  `re_explore_from_candidate`, ffmpeg "snap to cuts" extraction, and
  **video-as-input** (`reference_videos`) for consistency/voice carryover.

## Decisions

**Resolved (gate E1 — lock with Michael, then they're done):**

1. **Surface placement → DECIDED: an Explore peer phase on the left rail**, a
   full-bleed gallery with the travelling chat, mirroring the Frame-workbench
   template — NOT a nested Scene sub-view (which would force modal-over-modal,
   violating the cinematic principle). Exploration is scene-scoped but deserves
   its own focused surface.
2. **Promote semantics → DECIDED: promote CREATES new shots.** Replacing an
   existing shot's still is a separate "use as this shot's image" action. Promote
   surfaces as a **non-modal right-side "Assembly Preview" panel** (keepers in
   final order + a timeline-thumbnail preview + Back-to-selects + Confirm), with
   undo/clear-selects. After Confirm → an explicit **"Add to timeline" / "Go to
   Production"** hop (new shots highlighted) so curated shots land somewhere, not
   evaporate.

**Still leaning (resolve during E1, low-risk):**

3. **Default angle set** — a fixed director's kit (wide / establishing / OTS /
   ECU / reaction / insert / low / high) the agent prunes per scene, or fully
   agent-authored each time? (Lean: a default kit the agent adapts.)
4. **Candidate persistence** — do un-kept candidates persist on the scene
   forever (history) or get pruned after N sets? (Lean: keep, but a "clear
   explored" action; ties to registry-pruning.)
5. **Seedance extraction fidelity (E2)** — proportional sampling first, scdet
   "snap to cuts" in E3. (Note: proportional sampling STILL needs the ffmpeg
   decoder — see E2 build phase; the choice is only proportional-vs-detected cut
   boundaries, not whether ffmpeg is required.)

## Build dependencies (the E1 critical path)

Before E1's gallery renders anything, in order:
1. **Seam:** add `explorations` to `mapScenesFromApi` + the UI `Scene` interface
   (gotcha #16 class — see Data model).
2. **4 core tools:** `explore_scene_angles`, `list_candidates`,
   `keep_candidate`/`reject_candidate`, `promote_candidates` (with the order
   contract). Follow the existing `insert_frame` / `add_related_shot` pattern in
   `server.ts`, including mode-gating in the `TOOL_PHASES` registry.
3. Defer `explore_scene_cuts`, `upscale_candidate`, `re_explore_from_candidate`,
   `suggest_keepers`, `summarize_candidates` to E2/E3.

Verify E1 against: `explore_scene_angles` writes N candidates → `list_candidates`
returns them → they **survive a server restart** (the gotcha-#16/#18 round-trip)
→ `promote_candidates` produces frames in the chosen order. Record it in
`STATE.md`'s verification ledger.
