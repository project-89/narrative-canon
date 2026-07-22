# Transmedia Roadmap — the Studio as the Nit Hub

**Status**: `v2, 2026-07-22` — original vision (2026-07-20) + the build
reality (T0 + T1 SHIPPED), the Chronicle design, the Media Type pattern,
and the named future media. **Read with**:
`TRANSMEDIA_INTEGRATION_REVIEW.md` §9 (the verified architecture),
`CHRONICLE_DESIGN.md` (the bi-temporal event layer + master view),
`HOW_IT_ALL_WORKS.md` (plain language), `STATE.md` (live status).

## The vision (Michael's dream, unchanged)

A coordination system for a **shared narrative world**: character accounts
run by agents that query and update the narrative graph; every account and
system in narrative sync; **divergences become narrative arcs**; a network
of interconnected systems — some producing, some consuming, some *acting as
characters* — coordinated through one graph. The studio is the hub: the nit
graph is the narrative; media are projections; agents are citizens.

**The organizing model (Chronicle era)**: ONE bi-temporal store. The world
layer — entities, relationships, **events on the universe chronology**,
arcs, the graph itself — is managed in ONE place (the Chronicle). Every
medium is a set of points on that graph you can open out, co-author, and
render. Authoring the story is distinct from the media that express it.

## The MEDIA TYPE pattern (how new media plug in — crucial, reusable)

Every medium — built or future — is the SAME shape. To add one, declare:

| Contract element | Meaning | Film (built) | Comic (built) |
|---|---|---|---|
| `format` id | on ProjectProduction | `film` | `comic` |
| **Expression model** | medium-specific structure under the production's scenes | shots → clips → timeline | pages → panels (whole-page gen) |
| **Compose pipeline** | agent tool + REST core + durable job | produce_scene/export_film | compose_comic/export_comic |
| **HITL surfaces** | keep/reject/redo gates + UI rail | takes/dailies/screening room | pages grid (M1) |
| **Event mode** | read-only · two-way · realtime | read-only | read-only |
| **Autonomy dial** | direct/review/autonomous + budget | dream_film | dream-comic (future) |
| **Canonization gate** | how its outputs' events reach canon: creator · vote · rule | creator | creator |
| **Verification fixture** | the real-content battle test | FABLE | Canon Issue #0 |

Rules (unchanged + extended): every capability is agent tool + UI + (T5)
MCP; no pipeline bypasses the graph (G5); renders go through /render (style
pins + graph refs); battle-test with real content; the EVENT layer is the
only cross-media integration point.

## Phase tracks

### SHIPPED (2026-07-21/22, all adversarially reviewed)
- **T0** — the spine: durability (atomic writes, durable jobs, mintId) ·
  multi-production worlds + arcs + switcher · the derived-ops nit ledger
  (bi-temporal transaction clock, per-branch, out-of-blob) · autonomy dial
  stored.
- **T1 — COMIC** (was "the missing organ"): whole-page renderer w/ the
  g89le prompting discipline (page producer, identity-bound refs, craft
  rules), full entity references (multichar/location/object), HITL,
  PDF export. Fixtures: FABLE comic + Canon Issue #0 (Aria/James, real
  refs).

### C-track — the Chronicle (the master view; full spec: CHRONICLE_DESIGN.md)
- **C1** Event model + eventLinks provenance + link/merge tools →
  **C1.5** v1.1 schema (EVENT ops hashed, worldStateAt, temporal-footprint
  validation w/ typed stateChanges → narrative conflicts) →
  **C1b** cross-production backfill w/ merge proposals →
  **C2** the Chronicle rail (spine + coverage lanes + click-through; the
  crucial master UI) → **C2b** span-select create-from-here →
  **C3** draft→canon status flow + production branches (history-honest).
  **MVP = C1+C2**: the rooftop event from comic AND film, one click.

### T2 — SESSION INGEST (unchanged; now lands as EVENTS)
Upload audio/log → transcript → extraction → **draft WorldEvents +
entities appended to the world** (dedupe against the graph) → review →
productions dramatize. The D&D→comic product. Fixture: the lore re-import,
then a real session.

### T3 — REACTIVE (hooks + distribution; gated on C1.5)
Hooks fire on EVENT commits ("something happened") — nightly renders per
production dial; `commit_event` for external producers (two-way media);
distribution connectors (publish human-gated, retraction path); minimal
identity (server-stamped authors, per-source gates).

### M-track — new media types (each = one Media Type declaration)
- **M1 — Comic rail** (pages grid UI — completes T1's HITL surface).
- **M2 — CHARACTER AUTHORSHIP STUDIO**: manage ONE character across
  multiple social accounts. Format `presence`; expression model = account
  personas + post queue; event mode **realtime two-way** (posts/replies are
  events with sourceProductionId; the character's knowledge =
  worldStateAt(now) scoped to what they've witnessed); dial per account;
  canonization = creator gate (T6 relaxes). The bridge to T6 proper.
- **M3 — LIVING CARD GAME**: Michael's card-game pipeline as a first-class
  medium. Format `game`. Three faces:
  1. **Play ingest** (T2 machinery): recorded sessions → draft events on a
     play-branch per session — the D&D flow, gamified.
  2. **Deck generation** (compose pipeline): the world GENERATES scenario
     decks from the current canon state (worldStateAt + arcs = the
     scenario seeds); monthly distribution = an export format.
  3. **MANY-PLAYER BRANCHING + VOTE-TO-CANON**: every table's play =
     a draft-event stream; the **canonization gate = `vote`** — a
     selection mechanism (voting/curation/metrics) flips the winning
     variation's events to canon as the story progresses. This
     generalizes C3's status flip into a pluggable GATE (creator | vote |
     rule) — design it that way from C3 on.
  4. **RULES = AUREUM**: the game's rules are Aureum rules on the graph
     (the DSL's original purpose — nit is a rudimentary text-adventure
     engine; Aureum authors world-rules that trigger mutations/events).
     **The LCG pulls Aureum vendoring forward from T6 to M3.**
- Future media follow the same declaration — the pattern is the product.

### S-track — the SPATIAL layer (seed; design pass before building)
Time-snapshotted space: location entities gain geometry/relations
(contains, adjacent-to, travel-time) + map imagery (rendered like any
asset); the `moved` stateChange kind already tracks position — so
**`whereIs(entity, t)`** falls out of the worldStateAt fold, and a Map
view (or Chronicle overlay) shows who is where at any story moment, and
how places relate. Continuity payoff: travel-time violations become
detectable temporal-consistency checks ("she cannot be in the tower at t+1").

### T4 — FULL NIT (unchanged) 
Event-aware merge; true play-space isolation; grey/green timeline UX
(timelineId); content addressing + hashAssets; cross-dramatization
consistency; log compaction.

### T5 — MCP (unchanged)
The graph + tools + `worldStateAt` served over MCP with per-agent identity;
workspace extraction; external systems become citizens.

### T6 — THE ARG NETWORK (the dream, unchanged)
Character-agents (M2 matured, gates relaxed per dial), continuity policed
by the graph + temporal validation, **merge conflicts as narrative arcs**
(the paradox strategies: amend/retcon/bridge/fork — diegetic by design).

## Build methodology (unchanged, one addition)

AGENTS.md → STATE.md → the active design doc; verify by behavior with real
content; atomic commits; docs closed each session; adversarial review per
phase. **Addition**: every new medium ships as a Media Type declaration
(the table above) — if it can't fill the row, it isn't ready to build.

## Carried threads
- Lore re-import via fixed T2 (canon world already holds Aria/James + the
  Rooftop scene + Issue #0).
- AtlasCloud key (Michael) → gpt-image + Seedance + video-ref chaining.
- Wave-2 audit fixes (G5 legacy endpoints, G3 takes metadata, I1 Veo
  params, I4 turnarounds) · Wren battle test · in-browser click-passes
  (ProductionSwitcher, Explore gallery) · NB2/GPT prompting guides.
