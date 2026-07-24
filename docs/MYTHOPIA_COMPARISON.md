# Mythopia ↔ Narrative Canon — architecture comparison & merge value

**Status**: `review` — architecture comparison + integration roadmap, 2026-07-23.
No code written; both codebases untouched pending a decision.
**Author**: Michael + Claude (repo clone + design-spec read + 2-agent deep sweep:
canon model/engines/linter · media stack/server/web).
**Subject**: [`HaruHunab1320/mythopia`](https://github.com/HaruHunab1320/mythopia)
— public, TypeScript, created 2026-07-06, last push 2026-07-23.
**Read with**: `STATE.md` (our state), `CHRONICLE_DESIGN.md` (our event layer),
`TRANSMEDIA_ROADMAP.md` (where the taken items would land).

## The finding in one paragraph

Mythopia and Narrative Canon are **two halves of the same system**, built from
the same core insight, with strikingly little overlap in what each actually
implements. Mythopia is the story's **physics**: it can tell you whether a story
*works* — where the climax lands, which subplot has gone slack, who knows what,
whether a reveal leaks, how much weight has accumulated behind an unspoken truth.
Narrative Canon is the story's **factory**: it can make and ship the thing —
comic issues, films, shots, styles, identity-locked characters — and version it
like source code. Neither is a subset of the other. They converged independently
on six architectural decisions (including event-log-as-truth and state-as-fold),
which is precisely what makes them interoperable: **Mythopia's engines are pure
read-only functions over an event log whose shape we already have.**

---

## 1. Where we independently converged (the merge surface)

| Idea | Mythopia | Narrative Canon |
|---|---|---|
| **Event log is ground truth** | *fabula* — `Canon.events`, world-chronological | `ProjectData.events` — `WorldEvent[]` on `chronologyIndex` |
| **State is a fold, never stored** | `CanonStore.foldTo(t)` → `WorldState` | `worldStateAt(t)` → `Map<entityId, EntityWorldState>` |
| **One world → many tellings** | `Edition` (syuzhet): selection/order/packaging/register | `ProjectProduction` (film/comic/episode) |
| **Character look changes over time** | `restyles: {entity, appearance}` as an event field | entity albums + labeled looks + `set_scene_looks` |
| **Identity via reference images + roles** | CIP anchors + `RefRole` legends | `resolveShotReferences` + style-vs-character ref typing |
| **Nothing enters canon unreviewed** | the review-screen "ceremony" | our C3 canonization gate |

The provider stack matches too: **both use Gemini "Nano Banana 2" for stills and
Veo 3.1 for video.** His is Gemini-only (+ Anthropic for text); ours adds
gpt-image and Replicate.

The vocabulary rhymes: his *"canon holds what's true; editions tell it"* is our
*"the world is the master; productions are specializations."*

Positioning differs usefully: his lander sells to **writers**; ours is a
**production studio**. Same substrate, two audiences.

---

## 2. What Mythopia has that we don't

### 2.1 A real story linter — 12 checks vs our 2
Ours (`validateTemporalConsistency`) catches exactly `participant-dead` and
`duplicate-death` — physical continuity only. His catches *craft* failures, all
test-covered against a real fixture:

| # | Rule | Catches |
|---|---|---|
| 0 | `theme-hard-conflict` | unsatisfiable require/forbid pair on one scope |
| 1 | `missing-arc` | a big event convergence under-scores → an arc you haven't modeled |
| 2 | `drift` | actual tension diverging from authored intent |
| 3 | `slack-arc` | subplot simmering with no screen-time — the audience will forget it |
| 4 | `mood-monotony` | tonal flatness (one quadrant too long) |
| 5 | `stakes-inflation` | escalation with no payoff |
| 6 | `unresolved-arc-at-edition-end` | dropped thread (unless flagged sequel hook) |
| 7 | `unprocessed-impulse` | no room to grieve/celebrate after a heavy beat |
| 8 | `impossible-travel` | continuity error via Dijkstra over the location graph |
| 9 | `dormant-theme` | a theme declared but never dramatized |
| 10 | `dangling-cause` | an effect whose explanation got cut |
| 11 | `leaked-reveal` | **computed spoiler check, per audience** |

Rules 8 and 11 are `error`; the rest warn/inform. Rule 1 was *derived from a
failed prediction* on the Fellowship fixture — the method is honest.

### 2.2 Narrative physics (curves, convergence, the plane)
- **Tension persists; mood decays** — deliberately different dynamics. Mood is
  closed-form: `M(t) = B + Σ vᵢmᵢ·e^(−λ(t−tᵢ))`, where `B` comes from the
  *location's* `atmosphere.mood_baseline` and λ is a per-mythos "tonal metabolism."
- **Convergence** `C(t) = mean over open arcs of (tension × stakes)²` — squaring
  rewards simultaneous alignment. Finds climaxes *unaided*: on the Fellowship
  fixture it independently picks Amon Hen as primary and the Bridge of
  Khazad-dûm as twin peak, asserted numerically in tests.
- **Scene-type plane** — tension × mood quadrants (dread/thrill/grief/comfort),
  independently reconstructing Russell's circumplex. Genre becomes a density map;
  "this chapter feels off" becomes computable.
- Plus salience (screen-time), pace, theme-expression and irony curves.

We have **none** of this. `ProjectArc` carries `thesis` + a 0–1 `canonProgress`
and no curve model at all.

### 2.3 The knowledge ledger — dramatic irony as a queryable property
Events carry `knowledge: [{learners, hidden_from, fact}]`; state folds to `known`
**and** `hidden`, with timestamps. Consequences:
- POV is just a knowledge filter (`pov: chr_frodo` re-tells the same fabula).
- The audience is *a knower owned by the edition*, so **mystery vs dramatic irony
  is an edition-level choice, not a story property** — the same crime fabula
  reordered is a whodunit or a Columbo. There's a test proving exactly that.
- Self-directed irony (a fact hidden from its own subject) falls out free.

Ours has a `learned` stateChange kind and nothing that reads it.

### 2.4 "Loaded guns" — the strongest single idea in the repo
`server/loaded.ts` derives the **potential energy of withheld truth**: per
(fact, character-in-the-dark) pair it accumulates `held_days`,
`scenes_in_ignorance`, a `charge` (summed magnitude of blind scenes), which past
moments the reveal would *recolor*, and a **suggested magnitude/valence for the
revelation if fired now**.

> You don't set a realization's magnitude up front; you write the withholding,
> and the tool tells you how much weight has accumulated behind it.

A genuinely novel authoring primitive. Nothing like it on our side.

### 2.5 Revealed character (planned-vs-actual for people)
`server/behavior.ts` classifies each scene a character is in
(`brought-to-an-end`, `raised-the-pressure`, `walked-into-darkness`…) and
compares against authored traits: *the writer authored who they meant them to be;
the log reveals who they've become.* A test asserts Frodo reads as "an instigator"
despite being written gentle.

### 2.6 VRL + validator + golden suite — rigour where we're weakest
A **closed, versioned vocabulary of 10 image-edit verbs** (RECOLOR, RESTYLE,
EXPRESSION, POSE, ADD, REMOVE, RELIGHT, BACKGROUND, CAMERA, CLEANUP), each with a
tested template, marked `verified` or `experimental`, compiled with one shared
**invariance clause**: *"Apply ONLY the edits listed above. Everything else —
identity, face, pose, framing, lighting, palette, background — must remain
exactly as in the source image."*

Backed by three things we don't have:
- **A pixel scope validator** on every edit — verdict `surgical` (<8% pixels
  moved) / `contained` (<45%) / `sweeping`, surfaced as a badge.
- **`scripts/vrl-lab.ts`** — controlled A/B experiments (4 edit dimensions × 3
  prompt strategies × pinned seeds), judged by both the pixel validator and a
  vision judge. Findings recorded honestly, including negatives: the invariance
  clause beat plain instructions *and* itemized KEEP/CHANGE checklists; the
  checklist actively **hurt** pose edits; a background swap always relights the
  subject (explicit "do NOT relight" failed 9/9), so the template concedes it.
- **`scripts/vrl-golden.ts`** — a golden regression run per verb with committed
  results (`latest.json`: 10/10 pass, `gemini-3.1-flash-image`, 2026-07-18). A
  drop is the **drift alarm when a provider silently changes a model.**

Our `edit_image` / `change_camera_angle` are free-form prompting with no
vocabulary, no scope check, no regression suite, no drift defence. This is our
weakest area and his strongest.

### 2.7 Prompts derived from narrative state
`server/imagery.ts` compiles a scene prompt from the fold: location kind +
`atmosphere.palette` + motifs + `art_direction`, each character's **folded look at
that moment**, then the mood quadrant mapped through a `QUADRANT_LIGHT` lighting
vocabulary, then house style + universal negatives. A different philosophy from
ours (our agent authors prompts verbatim) — his is more reproducible, ours more
expressive. The *mood → light* derivation is worth taking regardless.

### 2.8 Richer location and theme models
- **Locations**: containment tree with typed modes (`spatial | mental | virtual |
  metaphysical | narrative` — a mindscape anchors *mentally* to a character and
  travels with them), typed connections with traversal costs, **rules that cascade
  like CSS**, and `atmosphere.mood_baseline` feeding the mood curve. Ours are flat
  entities. This is also our unstarted S-track (spatial/maps).
- **Themes**: statement + constraint bundle (`require`/`forbid`/`bias`) + **motifs
  (visual/verbal/sonic)** + relations (`opposes`/`refines`/`echoes`). Caveat: the
  constraints are currently **inert data** — nothing consumes `curve_shape` or
  `trait_distribution`, so "generation is constraint satisfaction" is aspirational
  there. The motifs are live and already feed his image prompts.

### 2.9 The proposer — prose in, canon out
Paste a draft → *"find the events in this draft"* → an LLM proposes the events
underneath, split into a **mechanical tier** (participants, location, knowledge —
reliably extracted, shown as chips) and a **judgment tier** (magnitude, valence,
deltas — tunable bars with the model's rationale) → *Add to canon* folds the card
into the timeline and every curve and linter reacts.

His stress test concluded **"the review UI is the product"**, and the author's
tuning history is training signal. This is precisely our unbuilt **T2 ingest**.

### 2.10 Smaller ideas worth lifting
- **The Moment** — one global scrubber; *everything* (portraits, cards, oracle,
  character voice) is answered "as of" that event. Our playhead is timeline-local.
- **The Playground** — a story-less workspace where "characters are discovered,
  then promoted into stories"; promote can target *any* mythos.
- **The attic** — a repaint never destroys the old likeness; it's renamed aside
  and restorable.
- **Determinism ledger** — one JSONL line per generation: model, prompt_hash,
  anchor_hashes, subjects.
- **Content-hash job dedupe** (`jobIdentity`, FNV-1a over canonical params) —
  identical work can't be double-spent while in flight. We pay for re-renders.
- **Sequence PIN seams** — between two clips, extract A's tail frame and B's head
  frame via ffmpeg, generate a Veo bridge with `lastFrame` interpolation, then
  concat-stitch. Our chained animation is plumbing **never exercised with real
  Veo** (STATE.md). His works.

---

## 3. What we have that Mythopia doesn't

### 3.1 Real version control — and it answers his #1 open question
His spec §18 asks outright: *"Branching canon… Branch the event log
(version-control style), or treat alternates as separate mythos records?"*

His current answer is **filesystem git**: each mythos folder is a repo, debounced
2.5s checkpoint commits, `undo` = `git reset --hard HEAD~1`, `restore` = checkout.
No semantic diff, no branching, no merge; the code comment is candid that
branching is the future payoff.

We have **nit**: 19 typed operation types (`ADD_EVENT`/`UPDATE_EVENT`/`ADD_SCENE`/…)
*derived at the commit boundary* by diffing canon snapshots, a round-trip hash
gate, per-branch diff bases, an out-of-blob ledger, bi-temporal separation
(transaction time = commit log; valid time = `chronologyIndex`), plus `timelineId`
for universe forks.

**We are his §18, already implemented.**

### 3.2 Canonization gates (C3)
Draft→canon is a gated, validated flip: a per-telling gate (`creator | vote |
rule`, pluggable) then a temporal-conflict check that diffs canon-only violations
before/after and returns four narrative resolutions (amend / retcon / bridge /
fork), with bulk "canonize the telling" + dry-run and recorded provenance.

He has the *ceremony* but no gate policy, no conflict adjudication, no
multi-party canonization. His vote/rule cases are exactly the gates we scaffolded.

### 3.3 The durability spine (T0-SAFETY)
Atomic writes + `.bak` + fsync, serialized write chains, five **durable** job
stores with interrupted-marking and eviction, SSE streaming.

His media queue is **in-process and dies with the process** — a crash strands
nodes as `running`; no durable job store, no result cache (dedupe only),
concurrency fixed at 2 with variations *sequential inside a node*, poll-only (no
SSE), no auth, and images ride as base64 inside 30 MB JSON bodies.

### 3.4 Production reach
He has a media *graph*; we have a media *pipeline*. Ours additionally covers:
script → acts → scenes → shots, explore→curate→promote coverage, `produce_scene`
server-side runs, `watch_shot` (the agent watches its own output, audio included),
continuity dailies, the editing timeline with virtual chop/trim, film export,
**whole-page comic generation with lettering baked in + PDF export**, music, and
the reusable style library.

He has no comic pipeline, no screenplay/script model, no timeline editor, no
long-form export.

### 3.5 The agent surface
Ours: ~26k-line API server, ~22k-line studio, **161 agent tools**, 211 REST
routes, mode- and medium-scoped agent personas, world↔production navigation, an
autonomy dial. His has six well-crafted LLM personas (proposer, oracle, epitaph,
weaver, seed, muse) but no agentic tool-calling studio. His codebase is far
smaller and cleaner (~148 files) — a *strength for extraction*, not a criticism.

### 3.6 Typed physical state
Our `stateChanges` are typed (`died | born | introduced | learned | acquired |
lost | moved | transformed | custom`) and drive the validator. **He has no
alive/dead flag at all** — Gandalf's death is knowledge-ledger facts plus an arc
resolution. His fold is exactly {position, knowledge, appearance} + arcs.

---

## 4. Where we both built the same thing (and who's ahead)

| Capability | Mythopia | Narrative Canon | Ahead |
|---|---|---|---|
| Identity continuity | CIP anchors, round-robin multi-subject, turnarounds, expression palettes, determinism ledger | graph-resolved refs, albums, labeled looks, scene look-locks | **split** — his rigour, our integration |
| Reference role typing | 6 `RefRole`s with explicit legends | style-vs-character typing (gotcha #22) | **his** (generalized) |
| Combinatorial exploration | `matrix` nodes, lazy cells, shared seed | `explore_prompts`, `explore_style` matrix, breed, lineages, dream | **ours** (richer) |
| Provenance | append-only DAG, leaf-only prune, files never deleted | nit ledger + takes/variations preserved | **split** — his for media, ours for canon |
| Video | Veo 3.1 + **working PIN-seam bridging** + ffmpeg stitch | Veo 3.1 + virtual chop/trim + export; chaining unexercised | **his** on bridging, **ours** on editing |
| Persistence | YAML + JSON files, git per folder, `canonRev` optimistic concurrency | JSON blob + nit + storage adapters (file/Mongo) | **ours** |

---

## 5. The honest tensions in a merge

1. **"Documents are views, never storage" doesn't survive contact with generated
   media.** His purity is right for text (cheap, regenerable, deterministic) and
   wrong for a paid, non-deterministic, human-curated Veo clip. We already solved
   this with the **two-tier split** (canon tier hashed/branchable; production tier
   blob-native) — and his own mediagraph quietly concedes it by gitignoring images
   as "regenerable" while keeping an append-only DAG and an attic. Any merge
   should adopt the two-tier model explicitly.
2. **Event schema is a superset problem, not a conflict.** His adds the dramatic
   quantities (`magnitude`, `valence`, `arc_deltas`, `stakes_deltas`,
   `resolves`/`reopens`, `knowledge`, `causes`); ours adds typed physical
   `stateChanges`, draft/canon `status`, `sourceProductionId`, canonization
   provenance. They compose. `causes` (a real DAG, walkable both ways for "why is
   this happening" and for impact analysis before editing an event) is a genuinely
   missing primitive for us.
3. **Story-time is the one painful migration.** He uses ISO-8601 `world_date` on a
   hand-rolled proleptic calendar (fictional years work); we use an integer
   `chronologyIndex`. His is strictly richer and *required* for his windowed curves
   — salience, pace and mood decay are all arithmetic in story-days. Recommend
   adopting `world_date` and keeping `chronologyIndex` as a derived ordinal so our
   UI is untouched.
4. **Stack friction is mild.** Both TypeScript. His: ESM, Express 5, React 19 +
   Vite, npm workspaces, vitest, no DB. Ours: Next.js, Express, Zod, storage
   adapters. His engines are dependency-light pure functions — the easy part to lift.
5. **Don't budget for what's typed but inert on his side**: theme constraints,
   `epitaphs`, `plannedConvergenceSeries`, ARG `schedule`, location rule
   *enforcement*, and all of `packages/stagecraft` (the parallax/props pipeline is
   data-model-and-math only; `scene-decompose` returns a hard 400 and
   `REPLICATE_API_TOKEN` is read by nothing).

---

## 6. Integration opportunities, ranked

| # | Take | Value | Effort | Risk |
|---|---|---|---|---|
| 1 | **Linter + curve/convergence engines** over our `WorldEvent[]` behind an adapter | Very high | Medium | Low — pure fns, no writes |
| 2 | **VRL + pixel scope validator + golden suite** into our render/edit path | High | Low–Med | Low, self-contained |
| 3 | **Knowledge ledger + reveal scheduling** (rule 11 spoiler check) | High — direct fit for P89 ARG/transmedia | Medium | Med (schema change) |
| 4 | **Loaded guns + revealed character** | High, distinctive | Low (needs #3) | Low |
| 5 | **Proposer** as our T2 ingest, landing into our C3 gate | High — closes our loop | Medium | Low |
| 6 | **Our nit → his §18** (branching canon) | High (for him) | Medium | Med |
| 7 | **Our durability spine → his media queue** | High (for him) | Low–Med | Low |
| 8 | **Sequence PIN-seam bridging + job dedupe** into our video path | Medium–High | Low | Low |
| 9 | **Editions as text renderers** beside our visual productions | Medium | Medium | Low |
| 10 | **Location containment/rules/traversal + theme motifs** | Medium (unlocks S-track) | Med–High | Med |

**The standouts:** #1 (an entire analytical brain for the price of an adapter,
because our event log already has the right shape) and #2 (a cheap, self-contained
fix for our weakest area, with recorded evidence behind it).

---

## 7. Recommended sequencing

**Phase 0 — agree the substrate (a conversation, not code).** The prize is one
shared canon/event schema: his dramatic quantities + knowledge ledger + `causes`,
our typed `stateChanges` + draft/canon status + provenance, and a decision on
story-time (recommend his `world_date`, with `chronologyIndex` derived).
Everything else follows from this one decision — and retrofitting story-time later
is the only genuinely painful migration in the plan.

**Phase 1 — lift the engines (read-only, reversible).** Adapter from our
`WorldEvent[]` to his `Canon`; run curves/convergence/linter; surface findings in
the world timeline beside the chronology. No writes, so it cannot corrupt
anything, and it immediately makes the world view far smarter.

**Phase 2 — VRL into the render path.** Verb vocabulary + invariance clause on
`edit_image`/`change_camera_angle`, the scope validator on every edit result, and
a golden suite against our providers as a drift alarm.

**Phase 3 — close the authoring loop.** His proposer as our T2 ingest → drafts
land as draft events → our C3 gate canonizes them. His review UI is the front
half; our gate is the back half; together it's the whole ceremony.

**Phase 4 — trade the other direction.** Our nit and durability spine into
Mythopia (his §18 and his crash-safety gap).

---

## 8. The strategic fork (a decision for Michael + cofounder)

- **One product.** Highest ceiling, highest cost; both roadmaps stop.
- **Federation — the default recommendation.** Keep both apps; make the shared
  canon schema the contract. Author and analyze in Mythopia; produce film and
  comics in Narrative Canon; produced events flow back as canon. Both roadmaps
  survive and the audiences stay distinct (his = writers, ours = producers).
- **Library extraction.** His `src/core` + `src/engines` + `src/linter` become a
  package both consume. Cheapest, and already *architecturally* true — pure
  functions with no I/O.

Federation and library extraction compose, and together they're the low-regret
move: extract the engines, agree the schema, keep two front ends.

---

## Sources

**Mythopia**: `docs/mythopia-design-spec-v0.8.md` (431 lines, the governing
document), `docs/media-generation-graph.md`, `src/core/types.ts`, `src/engines/*`,
`src/linter/rules/*`, `src/edition/*`, `packages/{mediagraph,identity,stagecraft}`,
`server/{index,proposer,mediagraph,history,loaded,behavior,derived,imagery}.ts`,
`web/src/pages/WorkshopPage.tsx`, `test/*` (42 assertions on the Fellowship
fixture), and the committed `packages/mediagraph/golden/latest.json`.

**Ours**: `src/storage/storage-adapter.ts` (`WorldEvent`, `ProjectArc`,
`ProjectProduction`), `src/git/format/v1/derive.ts` (`TemporalViolation` = 2
codes; `worldStateAt`), `src/git/format/v1/schemas.ts` (19 op types),
`src/api/server.ts` (161 tools, 211 routes), `docs/STATE.md`.
