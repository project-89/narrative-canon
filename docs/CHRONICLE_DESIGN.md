# The Chronicle — the world's timeline as the management space

**Status**: `design v2` — Michael's transmedia vision (2026-07-22) + the
bi-temporal resolution + the adversarial design check (9 confirmed + 4
split-real findings folded in; the v1 draft's branch/merge and backfill
claims were disproven and corrected below).
**Read with**: `TRANSMEDIA_INTEGRATION_REVIEW.md` §9, `TRANSMEDIA_ROADMAP.md`.

## The vision (Michael, condensed, in his terms)

A management space per world showing all comics, episodes, movies — *in the
chronology they occupy in the universe*. Canon events **overlap**: the same
event seen from different vantage points in the comic and the movie — true
transmedia. Each medium is an artifact along that timeline; the universal
elements (entities, story beats, scenes, the transformations of the story
world over time) are the broad layer. At any point, you or the AI select a
point to create media off of. All events are media-agnostic. Some media
read AND write the timeline; some are realtime (character accounts whose
decisions affect the timeline and thus other media). Authoring the story is
distinct from the media that express it. New media may be play-spaces that
are eventually locked into canon.

## THE TWO CLOCKS (the bi-temporal resolution)

Michael's original instinct: the nit history IS the chronology — each
commit a scene advancing the world. The resolved model: **one store, two
clocks, never one axis.**

- **Transaction time** (when we recorded it) = the nit commit log. Already
  built (T0b). Auditable authoring history, per-branch.
- **Valid time** (when it happens in the universe) = **chronology as
  DATA**: `WorldEvent.chronologyIndex`, ordered events in the canon
  snapshot. Reordering the universe's history is itself a committable,
  diffable operation.

Why they must not be one axis: prequels/retcons (authored late, happen
early), edits-that-aren't-events, the multi-vantage requirement itself
(two authoring moments, one story moment), and the two distinct kinds of
branching (authoring branches vs UNIVERSE forks — grey/green loom).

What is true in the original instinct becomes the DEFAULT: when authoring
in story order — first drafts, and realtime media committing events as
they happen — the clocks coincide. `chronologyIndex` defaults to arrival
order; explicit values are the override for non-linear authoring. **The
log is the chronology until you say otherwise.**

Two derived primitives fall out:

- **`worldStateAt(chronologyIndex)`** — fold events (with their entity
  state-changes) in STORY order → the world as it stood at any universe
  moment. This is what "select a point and create media off it" actually
  needs (not a git checkout — that's the other clock). Resurrects the
  gen-1 `TemporalNarrativeGraph` idea at the right layer.
- **Universe forks as data**: `WorldEvent.timelineId?` against declared
  story-timelines (carrying the lineage `probability`/`isCanon` fields).
  Parallel valid-time tracks (both looms canon) while authoring proceeds
  on ordinary branches. The two kinds of branching stop competing.

This bi-temporal Narrative — entities, relationships, **events (chronology
+ state deltas)**, scenes (dramatizations), arcs, style, scratchpad — plus
the typed commit log IS the standardized narrative interchange format
(NIT_FORMAT_SPEC v1.1). External citizens read `worldStateAt(now)`;
auditors read the log; neither confuses the clocks.

## The Event primitive

```ts
interface WorldEvent {
  id: string;
  chronologyIndex: number;      // UNIVERSE time (valid time). Defaults to arrival order.
  timelineId?: string;          // universe fork (default: the canon timeline)
  title: string;
  description?: string;
  entityIds: string[];
  stateChanges?: Array<{
    entityId: string;
    kind: 'died' | 'born' | 'introduced' | 'learned' | 'acquired' | 'lost' | 'moved' | 'transformed' | 'custom';
    detail?: string;
  }>; // feeds worldStateAt() AND deterministic conflict checks
  preconditions?: string[];     // explicit requirements (LLM-checked tier, C4)
  arcId?: string;
  status: 'draft' | 'canon';    // on the SHARED timeline (see Branch honesty)
  sourceProductionId?: string;  // two-way media: the telling that birthed it
  createdAt: string; updatedAt: string;
}
// ProjectData.events?: WorldEvent[]        (world-scoped)
// scene.eventLinks?: Array<{ eventId: string; dramatizedAtEventUpdatedAt: string }>
```

- **`eventLinks` carries provenance, not a bare reference** (design-check
  product-3): the link records the event's `updatedAt` at dramatization
  time, so staleness is COMPUTABLE (`event.updatedAt >
  link.dramatizedAtEventUpdatedAt` → the scene dramatizes an outdated
  event) and "resync" has a baseline to diff against. This is the concrete
  form of the snapshot+resync doctrine.
- **True transmedia is a shared eventId**: the film scene and the comic
  scene both link `evt_rooftop` — structurally connected, side-by-side
  viewable, consistency-checkable across vantage points.
- **Events are CANON-TIER and must be hashed** (design-check substrate-1/
  scope-2): `ADD_EVENT/UPDATE_EVENT/REMOVE_EVENT` + `eventLinks` on Scene
  enter the v1.1 schema EARLY (slice C1.5, not the tail) — T3's hooks fire
  on "something happened in the world," so events cannot live un-hashed in
  `extensions` when reactivity arrives. Interim (C1 only, AS BUILT): events live in the typed top-level
  `ProjectData.events` field — the migrator's known-key allowlist keeps
  them OUT of the nit snapshot/hash (same un-hashed interim semantics,
  better typing than the originally-specced extensions bag). Hooks/
  storyDiff/Canon-rail do NOT see them until C1.5; the agent tool
  descriptions state this.

## Temporal consistency: conflicts are evaluated on the STORY-TIME fold

(Michael, 2026-07-22: "Nit is just a graph — you reconstruct it at any
point by composing the diffs. The temporal axis is part of the graph, and a
commit can insert ANYWHERE in it. The benefit of nit is that we resolve
NARRATIVE conflicts: a character still alive can't merge into a branch
where, at THAT point in time, they're dead. A prequel's commit is way down
the log but its temporal position is before everything — nothing committed
downstream temporally may conflict.")

- **Every commit has a TEMPORAL FOOTPRINT**: the chronology range its ops
  touch (the min/max `chronologyIndex` of events added/changed, plus any
  event whose stateChanges it edits). Transaction position is irrelevant
  to validity; the footprint is what gets validated.
- **Validation = fold from the footprint forward.** Inserting/changing
  anything at story-time `t` re-runs `worldStateAt` from `t` through the
  end of the chronology and checks every later event's requirements
  against the recomputed state. A prequel that kills a character who
  appears alive later SURFACES as a contradiction at the first violating
  event — with story-time coordinates, not diff hunks.
- **Two validation levels**:
  1. **Deterministic invariants** over a small TYPED stateChange
     vocabulary — `{ entityId, kind: 'died' | 'born' | 'introduced' |
     'learned' | 'acquired' | 'lost' | 'moved' | 'transformed' | 'custom',
     detail?: string }` — plus built-in participation invariants (an
     entity in `event.entityIds` must exist and not be dead at that
     event's chronology). Cheap, exact, runs on every commit/status-flip
     whose footprint demands it.
  2. **Semantic checks** (LLM) for soft contradictions (knowledge,
     motivation, tone) — the consistency engine's job, advisory tier.
- **Events may carry explicit `preconditions`** (resurrecting gen-1's
  `CanonicalEvent.requiredConditions` — this exact primitive exists in
  `src/git/types.ts`): "requires: James still trusts Aria." Checked by
  level 2; the built-ins need no authoring.
- **Violations are NARRATIVE CONFLICTS with narrative resolutions** (the
  paradox-resolver strategies from gen-1, now with a concrete trigger):
  amend the insertion · retcon the downstream event (a reviewed edit) ·
  author a bridging event ("he survived — here's how") · or FORK THE
  TIMELINE (`timelineId` — the contradiction becomes a canon alternate
  track, the grey/green move). Merge/lock flows present these as choices;
  nothing auto-resolves.
- **Scope**: the typed stateChange vocabulary + participation invariants +
  footprint validation land with **C1.5** (they ride the same schema
  moment as EVENT ops); explicit preconditions + the LLM tier with C4's
  consistency work.

## Cross-production linking is a first-class feature (not a backfill byproduct)

The v1 draft assumed backfill would produce the shared events; the check
proved it produces SILOS (one private event set per production describing
the same moments). Corrected:

- **C1 ships the linking actions**: `link_scene_to_event` (agent + REST +
  Chronicle click), `merge_events` (two draft events are the same moment →
  one survivor, links repointed), `create_event_from_scene`.
- **C1b backfill proposes MERGES across productions**: candidate detection
  by shared entityIds + adjacent chronologyIndex + beat similarity → a
  human-confirmed merge queue (LLM-assisted, cost-bearing, own slice).
- **Honesty**: the multi-vantage view is EMPTY until links exist. For the
  live fixtures (FABLE + Canon Issue #0) the first links are made by hand
  — that act is the demo.

## Branch honesty (the v1 draft overclaimed)

`production.branchName` gives **HISTORY isolation only** — the per-branch
nit ledger bases (T0b). The working tree is ONE blob: a "branched"
production editing shared entities or events mutates them for every
production IMMEDIATELY, merge or no merge. The v1 draft's "branch play
never pollutes main" was wrong for the working tree and is withdrawn.

Corrected model:
- **Draft/canon lives on the shared timeline as `WorldEvent.status`** —
  not on branches. A play-space's events are `draft`: visible to all,
  clearly marked, excluded from `worldStateAt(t, {canonOnly: true})` and
  from canon-triggered hooks. **Locking into canon = flipping status (a
  reviewed, committed act)** — buildable NOW (C3), no merge machinery.
- **Authoring branches remain what they are**: commit-history lanes
  (checkout/restore per the existing studio machinery). TRUE working-tree
  isolation for play-spaces — and event-aware MERGE (the endpoint today
  diffs entities/scenes but NOT events) — are T4 scope, stated as such
  (design-check scope-1/substrate-3): until then, lock-into-canon is the
  status flip, not a merge.

## The Chronicle rail

**The horizontal axis is `WorldEvent.chronologyIndex` ONLY** (design-check
substrate-4). `scene.chronologyIndex` is a different, branch-local
coordinate for temporal LOOK resolution and is not the Chronicle's axis.

```
ARCS      ├────────── Aria discovers the pattern ──────────┤
EVENTS    ●──────●────────●───────●────────●──────●        (the spine)
FILM      ▬▬▬▬▬▬▬▬▬▬▬▬ FABLE ▬▬▬▬▬▬▬▬
COMIC              ▬▬▬ Issue #0 ▬▬▬▬▬▬▬▬▬▬▬     ← overlap = same events,
                                                   two vantage points
```

- Production lanes span min→max `event.chronologyIndex` over the events
  their scenes LINK (never scene.chronologyIndex). Gaps = unadapted
  stretches; overlaps = multi-vantage coverage.
- Click an event → every dramatization across productions, side by side
  (film frame beside comic panel — leans on T1 page/frame thumbnails).
- **Honest sizing** (design-check product-4): this is a BESPOKE timeline
  component, not a gallery derivative. C2 v1 = static spine + derived
  lanes + click-through. Span-select create-from-here + entity-presence
  overlays are C2b.
- The authoring-time ledger view stays a separate tab. Two clocks, two
  views, never conflated.

## Build slices (reordered per the check)

| Slice | What | Notes |
|---|---|---|
| **C1** | WorldEvent model + `eventLinks` provenance + tools/REST: create/list/link/merge events, `create_event_from_scene`, `get_event_coverage` | Events in typed `ProjectData.events` (un-hashed via migrator allowlist) w/ explicit interim caveat |
| **C1.5** | **v1.1 schema: EVENT ops + Scene.eventLinks hashed** + `worldStateAt(t)` fold + **temporal-footprint validation** (typed stateChanges, participation invariants, fold-forward conflict surfacing) | The gating primitive for T3 hooks + event merge + narrative conflicts; ships alone, early |
| **C1b** | LLM backfill w/ CROSS-PRODUCTION merge proposals + confirm queue | Cost-bearing; own slice; empty-until-linked stated |
| **C2** | Chronicle rail v1: spine + derived lanes + click-through (bespoke component) | Leans on T1 thumbnails; MVP endpoint (below) |
| **C2b** | Span-select create-production-from-here + overlays | After C2 proves the axis |
| **C3** | `WorldEvent.status` draft→canon flow + `production.branchName` (history-only, honest) + lock-into-canon = reviewed status flip | No merge dependency |
| **M1** | Per-media rails: comic production → Comic rail (pages grid) instead of the film timeline | The per-media half of the ask; independent of C-track |
| **C4/T4** | Event-aware merge + true play-space isolation + cross-dramatization consistency checks | With the T4 branch work |

**The minimal demonstrable slice is C1 + C2** (design-check scope-3): the
rooftop event linked from BOTH the Canon comic page and a film scene, one
click showing both vantage points. That demo is the ratification target.

## What this deliberately does NOT do

- No conflation of the clocks: the Chronicle axis is event chronology;
  the nit log is authoring history; scene.chronologyIndex is a look-
  resolution coordinate. Three roles, named, kept apart.
- No forced migration: worlds without events show an empty spine.
- No live-link: `eventLinks` provenance + computable staleness, resync as
  an explicit act.
