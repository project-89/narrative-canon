# STAGING_DESIGN — the scene as a world-state, the camera as a vantage

**Status: DESIGNED — pressure-tested, not yet scheduled.** Sequenced after the
creator click-pass and dramaturgy slice 2 (scenes must be born from beats
before their inner state is worth tracking). Ratify before building.

Adversarially reviewed 2026-08-03 by a three-lens panel (authoring-burden,
codebase-fit, value-per-token) — all three returned *sound-with-changes*; the
changes are folded in below. The panel read the live code and the live
`.narrative-data`; the numbers in the Evidence section are real.

## The insight (Michael, 2026-08-03)

> The scene is a world state that is modified over time. Characters may move
> something, or walk somewhere in the room, or modify the state. And the
> camera at any given point is recreating that.

A scene has ONE stable inner truth — who is present, where they stand, what
they hold, what visible state the room is in — advanced by discrete changes
(she crosses to the window; the vial moves from desk to pocket; the lamp is
knocked over). Every shot is a **camera vantage sampling that truth at a
story moment**. This recurses the studio's founding architecture downward:

- shots are to the scene what tellings are to the world;
- the scene's inner clock is a fourth clock — transaction time, story time,
  presentation time, and now **scene time**;
- and the two-clocks rule recurses with it: a shot samples a **story moment
  in the scene**, never its **cut position**. A flashback shot inside a scene
  is a reorder of presentation, not of scene time. (`sceneStateAt(shotIndex)`
  would re-commit the exact conflation CLAUDE.md names as *the* bug.)

Film's own lesson bounds the ambition: productions fail continuity daily
(takes across days, smudges, script supervisors losing to entropy) and the
audience forgives because attention follows the story. **The bar is not
perfection; it is unnoticed imperfection.** So this is a script supervisor's
notebook, not a physics engine: track only what the camera can contradict,
and triage by attention — faces, eyelines, held objects, wardrobe are
blockers; the background mug is a note.

## What we are NOT building (and why)

**Not a persisted simulation.** The graveyard of tools like this is full of
world-simulators nobody maintains. A stored ledger rots the moment prose is
edited — and today prose edits invalidate *nothing* (the only invalidation
machinery, `markVisualsDirtyFromEntityChange`, fires on entity changes only).
Stale staging data is worse than none: it would inject wrong facts into paid
renders.

**Not prompt-text state injection.** The studio's hardest-won rule — text
loses to the model's bias; style is an image leash — applies with a twist the
panel sharpened: models don't ignore state text, they **obey it wrongly**.
"The vial is in her pocket" is a *concealment* claim; image models render
nouns, so the text summons the vial into frame. For video it's structural:
Veo takes no reference images at all — the first frame IS the only state
channel — and mid-clip drift is a watch-and-review problem by definition.
Before this channel is ever built, run the free experiment already on disk:
`appearance_notes` is authored on 22 real shots and never reaches the
renderer; wire it behind a flag, render a fixture scene both ways, and
`record_prompt_lesson` the result.

## The build, in earn-your-keep order

### v1 — the dailies questions (ephemeral, zero authoring cost)

Extend `review_scene` with a **stateful continuity pass**: at review time,
one constrained LLM call over (scene prose + ordered shot list + the closed
entity-name list) returns per-panel continuity questions —

> "Panel 4 shows the vial on the desk; the prose has her pocket it before
> panel 3."

Nothing is persisted, so staleness is impossible *by construction* — it
always reads the current prose. Findings are triaged attention-weighted:
identity/eyeline/held-object/wardrobe violations are blockers with the fix
named per class (re-render on anchor refs, `set_scene_looks`, `edit_image`);
background drift is a note. This is an edit to a checklist string
`review_scene` already composes, it costs no render budget, and it is the
only channel with logged catches in this repo (wardrobe drift, the
teleporting case, the courier gender flip).

Alongside it, decoupled and deterministic (no LLM):
- **`sideOfLine`** on the shot record — the one camera field that does not
  already exist (`shotType`/`camera`/`visual_direction` already carry
  angle/lens/distance/movement) — plus a **180°-line lint** over promoted
  coverage.

v1 ships nothing else. Within one production it tells us whether the fold
catches anything the dailies strip doesn't.

### v2 — only if v1 earns it

- **Corrections persist; derivations never do.** When the creator overrules
  a derived question ("no — she pockets it in shot 2"), store *that row*,
  keyed by `sha(scene.prose)` + the shot-id list. On hash mismatch the
  corrections resurface as "restage?" — inert, lint-only (the beat-claim
  safety property).
- **The look-image manifest** — the highest-ceiling channel, because it's
  the one this studio has proven (reference images win). The ledger's second
  output is the list of look/state images a scene needs (Aria soaked; the
  case open), rendered ONCE into entity albums, selected per shot by the
  fold. "Style is an image leash," recursed to state. Evidence this is the
  bottleneck: 0/84 real shots use `entityLooks`; 6/112 entities have a
  labeled look.
- A `scene.staging` ledger proper (typed deltas: WHO position/enter/exit,
  OBJECT-entity possession/state, LOCATION visible-state), IF the corrections
  volume shows it's wanted.

## Codebase landmines (from the fit review — bind these at build time)

1. **The name `scene.stateChanges` is taken** — it exists as a *hashed*
   `string[]` in the v1 canon schema; objects there would hash as
   `"[object Object]"` into canon snapshots. The field is `scene.staging`.
2. **Anchor ledger entries by `afterFrameId`, never by index** —
   `insert_frame`/`delete_frame` renumber every frame.
3. **`worldStateAt(t)` is inclusive** — seeding a scene's *opening* state
   from its own event's chronologyIndex samples the world *after* that event
   fired. The seed needs an `exclusive` option — and it is additive-only
   anyway: eventLinks are ~0 across live projects, so the graph fallback
   (cast + castLooks + location) is the primary seed, not the degraded one.
4. **There is no single prompt seam.** `resolveShotReferences` returns URLs
   only; prompts are composed at ~11 `/render` call sites and the UI's
   Generate button uses a separate ~900-line builder that never calls it.
   Any future prompt-side consumption must land inside
   `/api/narrative/visual/render` or the button and the agent will render
   different continuity.
5. **The canon boundary is free but silent** — an unknown scene field rides
   `extensions.studio` and is stripped from the hash. Staging stays out of
   canon *by default*; lifting a scene-time change to a world event is an
   explicit move (and must not share the `EventStateChange` kind vocabulary).

## Evidence (live data, 2026-08-03)

- `entityLooks` used by 0/84 shots; 6/112 entities carry a labeled look.
- `appearance_notes` authored on 22/84 shots; never reaches any renderer.
- The prompt-outcome ledger holds 3 lessons; none about state text.
- Largest real production: 5 scenes / 20 shots — a checklist is right-sized;
  a persisted fold is over-machinery at this scale.
- `review_scene`'s logged catches: wardrobe drift, "case teleports", courier
  gender flip, missing silver streak.
- Found and fixed during the review: the comic ref resolver indexed
  `castLooks` (an array) as a map — every comic wardrobe lock silently
  ignored (`b0bd999`).

[SCENE::A-WORLD-STATE][SHOTS::VANTAGES][BAR::UNNOTICED-IMPERFECTION]
