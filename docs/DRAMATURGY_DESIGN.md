# THE DRAMATURGY ROOM — design (v1.1, AWAITING RATIFICATION)

> The Story tab, rebuilt on the world's spine. Synthesized 2026-07-31 from a
> three-vantage design panel (dramaturg / systems / agent-first) over the
> recon of the existing surface; an adversarial design-check pass (10
> findings, 3 blockers) is folded in — the blockers all lived where this doc
> touched the existing event code paths, and their resolutions are marked
> **[DC-n]** inline. Predecessor analysis: the Story tab is a
> 2026-05 fossil — `ProjectScript` is a parallel story database with no
> `eventId`/`chronologyIndex` anywhere, nothing reads it, 4 of its 10 stages
> are unmounted dead code, its one bridge (`promote_scene_list_entry`) has no
> UI entry point, and no persona ever tells the agent to use it.
>
> **Michael's brief:** rebuild it as the telling's dramaturgy room — beats
> event-backed, acts over the chronology stretch, promote-to-scene born with
> `eventLinks`, a STORY_CRAFT persona that starts from shape.

---

## 1. The thesis: a telling has three clocks

The studio already holds two clocks — transaction time (the nit ledger) and
story time (`chronologyIndex`). A telling adds a third: **presentation time**
— the order the *audience* receives the story. Dramaturgy is what lives in
the gap between story time and presentation time. A flashback is not a
chronology edit; it is a presentation choice. That gap is currently
inexpressible anywhere in the studio, and it is the entire craft of
adaptation.

So:

- **A beat is one telling's editorial claim on a WorldEvent.** The event is
  the noun (world-owned, gated, canon-tier); the beat is the per-telling
  stance: where it lands in presentation order, how much weight it gets,
  whose vantage this telling takes. Nothing about the story lives twice.
- **The board is free; the world is deliberate.** Reordering beats never
  touches `chronologyIndex`. Writing the world from this room happens only
  through explicit, temporally-checked acts.
- **The link is born correct.** Promoting a beat to a scene pre-wires
  `eventLinks` — the transmedia connection stops being two manual hops
  nobody makes.

## 2. What survives, what dies

**Survives (genuinely per-telling):** logline, synopsis, theme, motifs
(whose field is silently DROPPED today — `PATCH /script` never destructures
it and it's absent from `ProjectScript`; the migration fixes the bug).

**Dies (duplicated ontology):** `characterSummaries`/`characterList` (the
world owns cast), `actSummaries{act1,act2a,act2b,act3}` (four hardcoded
Hollywood slots in a many-media system → `ProjectAct.summary`),
`actBreakdowns` (bullets that were beats wearing a different name → beats),
`sceneList` + its 6 endpoints + 5 tools (a beat rail one level down; its one
good idea is absorbed by `promote_beat_to_scene`), `write` (no consumer),
and the four unmounted stage components (~620 lines).

Everything migrates losslessly (§8); the raw `ProjectScript` is archived
verbatim on the new doc. Nothing is ever lost.

## 3. The data model

```ts
/** A telling's editorial claim on one WorldEvent, or a structural device.
 *  Lives at production.dramaturgy — ONLY on ProjectProduction (incl. the
 *  default production), deliberately not mirrored on ProjectData, so the new
 *  field does not repeat the script/timeline split-brain. */
export interface Beat {
  id: string;
  /** 'event' = dramatic beat, resolves to a WorldEvent.
   *  'device' = structural tissue (montage/title-card/time-skip/motif/act
   *  break) that never claims an event. Named explicitly so orphan beats
   *  can't creep back in as the default. */
  kind: 'event' | 'device';
  eventId?: string;                 // the claim (kind:'event')
  /** Claim provenance — snapshot + resync, same doctrine as scene.eventLinks
   *  but richer: an AUTHORING surface needs a field diff, not a staleness
   *  bit. Snapshot is also the recovery source if the event is deleted. */
  claim?: {
    claimedAtEventUpdatedAt: string;
    snapshot: { title: string; chronologyIndex: number; status: 'draft' | 'canon';
                entityIds: string[]; timelineId?: string };
    note?: string;                  // 'merged from evt_x' | 'event deleted …'
  };

  /** PRESENTATION order — the third clock. Fractional so inserts never
   *  renumber. Dragging this NEVER touches chronologyIndex.
   *  [DC-10] A normalize pass rewrites positions to 1..N×1000 whenever a gap
   *  falls under ε, rescaling structure.markers in the same transaction;
   *  reorder_beats takes the full ordered id list and the SERVER assigns
   *  positions. */
  position: number;
  /** ProjectAct.id — the SAME acts the storyboard groups scenes under.
   *  [DC-5] This is the ONLY stored act membership. The act bar's range is
   *  DERIVED ([min,max] position over member beats); dragging a divider is a
   *  bulk actId reassign; a beat whose position sits outside its act's
   *  derived range is a lint, not a constraint. Act CRUD must take an
   *  explicit productionId (today activeProductionStamp guesses). */
  actId?: string;

  label: string;                    // imperative shorthand; the only required field
  intent?: string;                  // what this beat DOES dramaturgically
  /** Value polarity after this beat, -5..+5, set by dragging card height.
   *  The polyline through beats in presentation order IS the tension curve.
   *  The only declared scalar — everything else about rhythm is derived. */
  charge?: number;
  /** Structural role — FREE STRING with template-suggested vocabulary
   *  ('catalyst', 'midpoint', 'page-turn'), never an enum. */
  functionTag?: string;

  /** The transmedia stance made data: how much weight THIS telling gives the
   *  event, and whose eyes it uses. The rooftop is the comic's spine and the
   *  film's aside — queryable, not vibes. */
  emphasis?: 'spine' | 'major' | 'minor' | 'aside';
  vantage?: { entityId?: string; note?: string; omits?: string };

  deviceKind?: 'montage' | 'title-card' | 'time-skip' | 'motif' | 'act-break' | 'other';
  /** [DC-6] REMOVED from storage: scene.sourceBeatId is the ONLY stored edge;
   *  a beat's scenes, the orphan row, coverage bars, and card stills are all
   *  DERIVED from it on read (two truths for one edge is what §11 refuses). */
  // sceneIds — derived, never stored
  notes?: string;
  createdAt: string; updatedAt: string;
}

export interface ProductionDramaturgy {
  logline?: string; synopsis?: string; theme?: string; motifs?: string;
  /** The dramatic question; posed/answered bind to beats → a bracket on the
   *  board and a real note when it resolves at beat 9 of 30. */
  question?: { text: string; posedAtBeatId?: string; answeredAtBeatId?: string };
  /** Template seeds GHOST MARKERS on the presentation axis, never slots.
   *  'free' disables structural diagnostics — a mood piece is not a broken
   *  thriller. */
  structure?: { template: 'free' | 'three-act' | 'stc' | 'tv-5' | 'kishotenketsu' | 'heros-journey';
                markers?: Array<{ id: string; label: string; position: number }> };
  beats: Beat[];
  /** Staged agent proposal — the canvas pendingAgentNodes pattern. A whole
   *  board the writer accepts wholesale / per act / per beat. Never live. */
  pendingStructure?: { id: string; createdAt: string; rationale?: string;
    acts?: any[]; beats: any[] };
  archivedScript?: ProjectScript;   // the fossil, verbatim; nothing is lost
  migratedAt?: string; updatedAt: number;
}
```

**`ProjectAct` gains** `kind?: 'act'|'issue'|'episode'|'chapter'|'sequence'`,
`summary?` (absorbing `actSummaries`), `turn?` (one line: "she stops
running"), `spanIntent?: {fromIndex,toIndex}` — an *intention* in the
`ProjectArc.thesis` spirit, linted against the derived span, never a
constraint. The Story room's acts and the Storyboard's acts become the same
records. An act's actual chronology span is **derived** from its beats'
claimed events on every read — storing it would be a live-link.

**`Scene` gains** `sourceBeatId?` (replacing `sourceScriptSceneId`).

**`WorldEvent` changes: none.** The world layer was already right; the
fossil was on the wrong side of the boundary.

**Per-medium profile is config, not schema** (`DRAMATURGY_PROFILES`): film
acts vs comic chapters differ in label, weight unit, and template
vocabulary — forking the Beat schema per medium is refused (that's how two
dramaturgy models slowly stop agreeing about what a beat is).

## 4. Claim states and the canon guarantee

`claimState` is always derived, never stored: **current · stale · orphaned ·
off-timeline · unbound · n/a(device)**. **[DC-3] Staleness is derived by
FIELD-DIFFING the claim snapshot against the live event — `updatedAt` is a
fast-path hint only, never the verdict** — because `PATCH /events/:id`
deliberately does not bump `updatedAt` for `chronologyIndex`, `status`, or
`timelineId` (correct for scene.eventLinks, fatal here: those three fields
are the ribbon position, the canon slate, and the off-timeline state this
room is built on). Stale claims render their snapshot with the field diff;
resync is explicit. When an event is merged
away, `merge_events` gains a beat pass that repoints to the survivor and
force-stales. When an event is deleted, the beat is **orphaned, not
stripped** — the snapshot survives and the room offers "re-author the event
from this beat" or "drop the beat."

> **Decision needed (D1):** `DELETE /events/:id` currently *strips*
> `eventLinks` from scenes. Two bereavement semantics for two link types is
> a smell. Proposal: scenes adopt orphan-not-strip too (keep the link with a
> `deletedAt` note). One rule everywhere.

Writing the world from the room is one path, gated:

- `resync_beat` — world → beat, explicit.
- `push_beat_to_event` — beat → world. **[DC-4] Specified per claim state,
  and gated on ownership, not just status:**

  | claimState / target | behaviour |
  |---|---|
  | own draft (`sourceProductionId` = this telling) | free |
  | foreign draft (another telling's) | explicit confirm, listing that telling's coverage — a shared noun has no silent rewrites even pre-canon |
  | canon | blocked without `retcon:true` → temporal diff + amend/retcon/bridge/fork |
  | stale | **refused** — resync first (pushing a stale snapshot is last-write-wins over edits the beat never saw) |
  | orphaned | mint-and-rebind (re-author the event from the snapshot) |
  | unbound | error — bind or mint first |

  Implementation: factor `mutateEventChecked()` out of `canonizeEventCore` —
  **[DC-1] and route `PATCH /api/narrative/events/:id` through it too**:
  today PATCH edits title/description/entityIds/stateChanges/chronologyIndex
  on a *canon* event with no temporal check at all, so without this the
  room's most tactile gestures (Amend, connector-foot drag) would bypass the
  guarantee the agent tool honors. One temporal check, every caller. The
  "beats never silently mutate canon" rule is a code path, not a prompt
  convention.

Canonization is **surfaced** here, never re-implemented: beats never change
an event's status themselves; the Inspector's Canonize button and the
beat-by-beat `canonize_production --dry-run` preview call the same world
cores with the same gates ([DC-1] — §5's buttons and §4's guarantee are the
same code path). The room renders canon state (locked-slate canon-backed
beats vs the telling's own draft-backed ones) and carries a **draft-debt**
header — **[DC-7] partitioned into "mine" vs "waiting on ‹telling›"**, since
`canonize_production` only flips drafts whose `sourceProductionId` is this
production; adopted foreign-draft claims get a distinct pip and never count
as debt this telling can pay. The contradiction check moves upstream:
`validateTemporalConsistency` runs at *outline* time — **[DC-7] folding
canon + this production's own drafts only, scoped by `timelineId`** (folding
every telling's parallel explorations would turn "exploratory and
non-destructive" into a linter that nags every room).

## 5. The room

One canvas, four instruments, a right drawer. No stage rail, no wizard.

```
┌─ FRAME BAR ──── logline · dramatic question · theme · motifs ────────────────┐
├─ ACT BAR ────── ranges over presentation order · draggable turns · Δcharge ──┤
├─ BEAT BOARD ─── x = PRESENTATION order · y = CHARGE ─────────────────────────┤
│    the polyline through the cards IS the tension curve                       │
│    cards: label · still (first rendered frame under the beat) · coverage bar │
│           binding pip (claimed ━ / proposed ┅ / unbound ╌ / device)          │
│    ┊ connectors drop from each beat to its event on the ribbon below —       │
│    a linear film is a clean fan; a flashback visibly crosses.                │
├─ CHRONOLOGY RIBBON ── x = STORY time · the world's own axis ─────────────────┤
│    drag-select a span → THE QUARRY (right drawer): events as raw material —  │
│    heat (irreversible stateChanges weigh most) · told-in coverage w/ stills  │
│    · untold/contested filters · a worldStateAt(t) prose header ("at t=7:     │
│    Chen is dead; Aria knows the pattern").                                   │
│    CLAIMING = drag a quarry card onto the board: drop point sets position +  │
│    charge, beat born with eventId + snapshot + connector. One drag.          │
└─ ORPHAN ROW ─── scenes in this production with no beat — no shaming ─────────┘
```

Gesture grammar (the two-clocks rule made tactile): horizontal drag =
presentation order (free) · vertical drag = charge (free) · dragging a
connector's foot on the ribbon = story time (different surface, different
cursor, canon opens the temporal preview) · editing beat text never writes
the event · "Amend event" is an explicit Inspector button.

**Beat Inspector** (right drawer): BEAT (label/intent/charge/act) · EVENT
(read-only; Amend / Canonize / Resync / Unbind) · VANTAGE (whose POV, what
this telling omits — with the *other* tellings' vantages and stills side by
side: multi-vantage at the point of authoring) · SCENES (+ Break into
scenes).

**Break into scenes** — the bridge, finally with a door: mints N draft
scenes with `sourceBeatId`, `actId`, participants seeded from the event, and
**`eventLinks` pre-wired with provenance** ([DC-6] it does *not* write
`scene.chronologyIndex` — the Chronicle deliberately derives a scene's
story-time from `eventLinks[0]`, and promote must not reintroduce a second
story-time field); jumps to Storyboard. Refuses an unbound event-beat with a one-click "mint the draft
event first" offer — nothing promotes ungrounded, and nothing auto-drafts
silently.

**THE READ** — diagnostics as notes, never grades. All arithmetic, no LLM:
flatline (≥3 beats, no turn) · non-turning act break · unpaid setup /
unearned payoff / dropped thread · dropped character · uncovered beat (big
charge, zero footage) · uncovered event ("the film steps over t=14: Chen's
arrest" — the single best creative prompt in the room, and it's a set
difference) · stale claims · temporal violations at outline time · mass-vs-
intent mismatch (runtime under a beat vs its charge). Each note carries the
craft consequence and a one-click move that is also an agent tool. An
optional LLM `deepen` tier reads intent/theme for soft notes; additive,
never required. `free` template turns the structural rules off.

**Threads** (v2): select beats → a named arc over the board, nodes typed
plant/turn/pay; may bind to an entity or a `ProjectArc` so a telling's craft
feeds the world's arc progress.

## 6. The three entry flows

- **Shape first** (the screenwriter): frame → quarry a chronology span →
  drag events onto the board → add device beats and proposals → run the
  read → break into scenes.
- **Scenes first** (the actual state of every existing production): the
  orphan row shows scenes with no beat; **"Find the shape"** has the agent
  propose one beat per scene-cluster — charges, act boundaries, claims where
  scenes already carry eventLinks — arriving as a **ghost overlay**
  (`pendingStructure`), accepted per beat / per act / wholesale. Nothing
  lands until accepted.
- **World hands you a shape**: greenlighting a production from a chronology
  span seeds the board with one claimed beat per canon event in the span,
  chronology order, charges flat. The director's first act is to reorder and
  re-charge — the adaptation problem, posed correctly.

Plus the missing direction, world → story, as a first-class gesture:
`adopt_events_as_beats({fromIndex,toIndex} | {eventIds})` — "make a comic
about what happened to Chen during the movie" adopts t=12..28, and the world
timeline's overlap lanes light up because the data is real.

## 7. The agent: STORY_CRAFT

A seventh room persona, selected the way Canvas and Style already are
(`inStoryRoom`, above the medium personas — a comic's Story tab needs a
dramaturg, not a page-director). Stance: *I start from SHAPE, not shots. I
work the telling's spine against the world's chronology. I claim before I
invent. The board is free; the ribbon is deliberate. I never push a beat
into a canon event without saying the word retcon. I don't render here.*

First move in the room, always: `get_dramaturgy` (the whole derived view —
beats, claim states, act spans, lints), then it reports shape before writing
a line: "act 2B has a nine-event gap nothing touches, three beats are still
unbound."

Tool surface (each a thin wrapper over the same core the REST route calls;
~14 legacy script tools out, ~14 spine-backed tools in):

| Tool | Notes |
|---|---|
| `get_dramaturgy` | replaces `list_script_state`; returns the DramaturgyView incl. lints |
| `set_framing` | one tool, not five (logline/synopsis/theme/motifs/question) |
| `add_beat` | requires `eventId` \| `mintEvent:true` for kind:'event' — the invariant lives in the API, not the prompt; `kind:'device'` for tissue |
| `update_beat` / `reorder_beats` / `delete_beat` | telling-local; documented as never touching chronology; delete never deletes the event |
| `bind_beat_to_event` / `bind_beats_bulk` | the migration ritual; bulk = agent proposes matches by label/entity similarity |
| `resync_beat` / `push_beat_to_event` | §4; push is the only room→world write, retcon-gated |
| `adopt_events_as_beats` / `adopt_scene_as_beat` | world→story + orphan-scene backfill |
| `promote_beat_to_scene` | eventLinks/actId/chronologyIndex/cast born correct |
| `get_read` | the notes, with moves attached |
| `outline_telling` / `dream_structure` | the autonomous composite: adopt → group → charge/emphasize/vantage → lint → **stage in pendingStructure** — never live |
| acts: `create/update/reorder_act` + `assign_beat_to_act` | existing tools extended (`kind`, `summary`, `turn`, `spanIntent`) |

UI refresh: the new tools join the existing `stepsWithWrites` sets;
`draft`/`claim`/`push` additionally set `worldTimelineChanged` (they touch
events).

**The autonomy backstop (new, general):** thread `isAutonomous` from
`dream`/`dream_film` into the internal chat call. **[DC-2] The mechanism is
a capability guard inside the cores** — `canonizeEventCore` and the PATCH
status branch refuse when `isAutonomous` — because a tool-name deny list
alone is bypassable: `update_event` exposes `status`, and PATCH routes
`status:'canon'` straight into canonization (and `status:'draft'` into a
free demotion). The `DREAM_DENY_TOOLS` name list (`canonize_event`,
`canonize_production`, `uncanonize_event`, `delete_event`, `merge_events`,
`set_canon_gate`) is belt-and-braces on top. A dream can draft a whole
telling overnight (`dream_structure` staged as a ghost board + a morning
report); it can never touch the canon gate — canon is earned, and never by
a sleeping agent. The production `autonomy` dial remains the policy layer.

## 8. Migration (lazy, idempotent, lossless)

Runs on first dramaturgy read (`ensureDefaultProduction` pattern), writes a
nit commit, archives the whole `ProjectScript` on the new doc:

| Fossil | Becomes |
|---|---|
| logline/synopsis/theme/motifs | copied (motifs bug fixed) |
| `beatSheet[]` | beats, `unbound` — a migration never invents world events |
| `actSummaries` | `ProjectAct.summary` (create up to 4 acts only if none exist) |
| `actBreakdowns` bullets | real, bindable beats in their acts — the biggest win |
| `sceneList` promoted | beats w/ `sceneIds` + a live claim if the scene has an eventLink |
| `sceneList` unpromoted | unbound beats (pitch → intent) |
| characterSummaries/List, write | archived only |
| `scene.sourceScriptSceneId` | `scene.sourceBeatId` |

**[DC-8] Migration is a cutover, not a field mapping** — three additions:

- **Consumers repointed in the same slice**: `ScreenplayView` (the separate
  read-only Script tab renders `script.logline`/`synopsis` as its title
  block), the agent's "Script status" prompt block, and `list_script_state`
  all read `dramaturgy` post-migration — otherwise the frame bar and the
  Script tab diverge on first edit.
- **Tombstone the split-brain**: the default production's fossil lives at
  `ProjectData.script`, others at `production.script` (`scriptFor`). The
  migration reads through `scriptFor`, then stamps `ProjectData.script`
  with `{migratedTo: productionId}`; `PATCH /api/narrative/script` becomes
  a shim onto `dramaturgy` framing (or 410) so the old endpoint can't
  reopen the split.
- **Non-film formats**: act minting sources `kind` from
  `DRAMATURGY_PROFILES[format]` and is skipped entirely when the fossil
  carries no act text — a comic must not wake up with four Hollywood acts.

`unbound` is a deliberately **soft** state — the room is fully usable with
40 unbound beats, and binding is a guided ritual (`bind_beats_bulk`), never
a wall. **The first-open experience must lead with the board and the orphan
row, not the lint count** (see R4).

## 9. Build order

1. **Data + migration + cores + REST/tools** (beats, act extensions,
   `scene.sourceBeatId`, promote-with-eventLinks, adopt, the autonomy core
   guard, **[DC-1] PATCH-through-`mutateEventChecked`**, and **[DC-9] the
   fractional `chronologyIndex` allocator** — today `nextChronologyIndex` is
   max+1 and cannot insert between events at all; R1 is unmitigable without
   it). Invisible; unblocks everything.
2. **Board + act bar + charge drag + orphan row + a minimal event
   typeahead on Bind** — [DC-9] without *some* claim affordance, every
   step-2 beat is unbound or mints a draft, which is R1 by construction.
   Already better than the fossil on day one.
3. **Ribbon + Quarry + claim-by-drag** — the reason the room exists.
4. **Stills + coverage bars on cards** — the emotional hook (the board
   becomes a contact sheet of the film coming into being); cheap once
   `sourceBeatId` exists.
5. **THE READ** (highest note-to-code-ratio rules first).
6. **STORY_CRAFT + dream_structure staging + "Find the shape."**
7. **Threads · vantage side-by-side panel · question bracket.**

## 10. Risks (named, not hidden)

- **R1 — Draft-event inflation.** A 40-beat outline that mints events puts
  40 drafts on the world timeline, and `nextChronologyIndex` (max+1) can't
  insert between events without a fractional allocator. Mitigations: default
  to claiming over minting; let low-emphasis beats stay unbound; a
  fractional-index allocator + world-timeline lane collapsing before the
  room ships. Measure on a live world first.
- **R2 — The two-order UI can read as a lie.** If the story-order toggle or
  flashback badges are ambiguous, an author drags a beat and concludes the
  outline drives the chronology — the exact conflation the system exists to
  prevent. The gesture split (board vs ribbon) is the defense; click-test it
  early.
- **R3 — Beat/scene collapse.** If authors promote 1:1 and `beat.sceneIds`
  never holds more than one id in real use, the beat layer is a second
  storyboard and isn't earning its keep. Watch this; the device/emphasis/
  vantage fields are what a scene can't express.
- **R4 — The chore wall.** A real migration lands ~40 unbound beats. If the
  first open says "40 beats need binding," the room re-fossilizes. Lead with
  the board; binding is background music.
- **R5 — The comic bites the profile.** For a multi-issue comic an *issue*
  is plausibly a production, not an act. The profile makes this a one-line
  change when it bites; don't pre-build the three-level hierarchy.
- **D1 — orphan-not-strip** divergence with scene.eventLinks (§4) — needs a
  call, one rule everywhere.

## 11. Cut list (refused, with reasons)

A beat-level canonization gate (two answers to "is this canon") · live-
linking beats to events (destroys the resync diff) · per-medium Beat schema
forks (profiles are config) · beat-level version history (non-destructive is
for generated media; text rows get a graveyard nobody reads) · any LLM
outline path that writes events without the draft tier · storing derived
spans/coverage/claim state (a cache to invalidate and a second truth).

---

*Companion docs: `CHRONICLE_DESIGN.md` (the event layer this builds on),
`STUDIO_BIBLE.md` §3/§4 (update both in the implementing commit — the
maintenance rule applies).*
