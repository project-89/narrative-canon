# The Change Record — the altitude-2 interchange format

**Status**: `design v0.1` — DRAFT for ratification across four systems. Nothing
implemented yet; this is the contract to agree before code.
**Author**: Michael + Claude, 2026-07-24.
**Answers**: ArgOS `CANON.md` §6 *"The Change Record and the Commit
**[OPEN — yours to standardise]**"* — *"ArgOS should conform to it rather than
invent a parallel one."* This is that standard.
**Read with**: `NIT_FORMAT_SPEC.md` (the document + commit layer this rides on),
`MYTHOPIA_COMPARISON.md` (the analytical engines that read it),
`CHRONICLE_DESIGN.md` (bi-temporality), ArgOS `CANON.md` §2/§3/§6.

---

## 0. What this is, in one paragraph

Four systems in this ecosystem independently converged on the same object and
each built a different part of it: **ArgOS** simulates worlds (altitude 1) and
narrates them (altitude 3) but has no record in between; the **Narrative Studio**
records and versions that middle and produces media from it; **Mythopia** derives
the physics of story from it; **Aureum** runs rules that mutate it. This document
specifies the middle: **one typed, versionable, replayable record of what
changed, who changed it, and why** — the format every producer writes and every
consumer reads. A book ingested, a simulation tick, a human authoring on a
canvas, and a card game being played all emit the same thing. A comic, a film, a
microdrama, an episode outline and a running world are all animated from it.

---

## 1. The Three Altitudes (adopted from ArgOS §2)

| | Altitude | Shape | Volume |
|---|---|---|---|
| 1 | **Mechanical** | `component.set`, `relation.add`, `entity.create` | tick-rate, high |
| 2 | **Semantic** | `character.moved`, `secret.revealed`, `trust.fell` | event-rate, low |
| 3 | **Narrative** | prose, panels, shot lists, editions | on demand |

**This spec defines altitude 2, and only altitude 2.**

- Altitude 1 stays local to each runtime (BitECS in ArgOS, an in-memory world in
  Aureum). It is *not* transported. `Needs.hunger: 40 → 42` never enters the
  stream.
- Altitude 3 is derived. Prose, panels and editions are **views**, never storage.
- The **lift** (1→2) is the "is this worth recording?" filter. The **lower**
  (2→1) is how an authored world boots as a simulation. These are the only
  sanctioned translation points.

> **Symmetry requirement.** Simulation→Studio and Studio→Simulation are the same
> operation: applying change records to a graph. Every rule below preserves this.

---

## 2. The Keystone Rule, made structural

ArgOS §3, written August 2024, never enforced:

> The narrative engine may only act by (a) injecting an entity, (b) modifying a
> component value, or (c) mutating an agent's motivation. It never commands
> agents directly, and it never emits prose unbacked by a graph change.

This spec enforces it **as a schema constraint, not a discipline**:

> **An Event carrying zero Changes is invalid and MUST be rejected at commit.**

That single rule buys: a *complete* log (nothing happened that isn't in it),
*meaningful* squash (a range is the whole truth), *exact* replay, and grounding
that is structural rather than a prompt instruction. Hallucinated narration has
nowhere to live, because prose is altitude 3 and altitude 3 is derived.

Corollary — **effects are not changes** (§7). A request to the outside world
(render an image, post to a channel, call a tool) is *collected, never executed*
by the writer, exactly as Aureum's rules engine already does. If an effect
changes the world, it returns as a new Event.

---

## 3. The Event

The unit of altitude 2. What a panel depicts, what a reader experiences, what the
curves consume.

```jsonc
{
  "id": "evt_01J8…",
  "kind": "secret.revealed",              // semantic verb — see §5.4
  "title": "Malcor takes the tax coins",
  "description": "…",                      // optional, human-facing

  "at":        { "t": 412, "worldDate": "3019-01-15", "granularity": "scene" },
  "timelineId": null,                      // universe fork; null = the canon line

  "participants": ["chr_malcor", "chr_garrick"],
  "location":     "loc_forge",

  "author":   { "kind": "simulation", "id": "argos:run_9f2", "productionId": null },
  "causedBy": ["evt_01J7…"],

  "magnitude": 0.6,                        // 0..1 — how much the world changes
  "valence":  -0.4,                        // -1..1 — mood impulse direction

  "changes": [ /* §4 — REQUIRED, non-empty */ ],
  "effects": [ /* §7 — optional, never mutating */ ],

  "status": "draft",                       // draft | canon  (§9)
  "extensions": { }                        // §10
}
```

`magnitude` and `valence` are event-level because they describe *the event*, not
any one entity; they feed Mythopia's mood curve (`M(t) = B + Σ vᵢmᵢ·e^(−λ(t−tᵢ))`)
and the pace signal. They are the only quantitative fields at event level.

---

## 4. The Change Record

Satisfies all seven of ArgOS §6's hard requirements.

```jsonc
{
  "subject":   "chr_garrick",           // 1. durable NodeId, never a runtime eid
  "verb":      "adjust",                // 2. closed core vocabulary (§5)
  "component": "core.trust",            // namespaced key
  "object":    "chr_malcor",            // relation/transfer target, or the scoped peer
  "before":    0.4,                     // 3. value-level delta — MANDATORY
  "after":     0.1,
  "amount":   -0.3                      // required for `adjust`
}
```

| ArgOS §6 requirement | Satisfied by |
|---|---|
| 1. Durable subject/object identity | `subject` / `object` are NodeIds |
| 2. The mutation verb | `verb`, closed core (§5) |
| 3. **Before and after values** | `before` / `after` on every value-bearing verb |
| 4. **Authorship** | `Event.author` (§8) |
| 5. **Causality** | `Event.causedBy` (§6) |
| 6. Logical clock | `Event.at.t` (§6) |
| 7. Commit grouping | The Commit (§9) |

**Why before *and* after.** *"Bob's trust in Jane fell from 0.7 to 0.2"* is the
archetypal narrative event. BitECS observers track presence only; our
`stateChange.detail` was prose; Aureum's adapter snapshotted whole worlds. The
same defect in three systems. Recording `before` makes a change **invertible**
(undo without replay), **squashable** (compose a range into one delta), and
**narratable** (the panel needs the fall, not the landing).

---

## 5. The verb vocabulary

Closed core. Consolidates our 9 `stateChange` kinds, Aureum's 7 `ChangeOperation`
variants, and ArgOS's 11 scattered verbs. **Do not extend this list** — extend
via components (§10).

### 5.1 Existence
| Verb | Meaning | Fields |
|---|---|---|
| `create` | bring a node into being | `subject`, `nodeKind`, `after` (initial props) |
| `destroy` | remove it | `subject`, `before` |

> Aureum **cannot** spawn or destroy today; ArgOS requires it. This is a real gap
> to close in the Aureum vendoring, not an optional extra.

### 5.2 Components
| Verb | Meaning | Fields |
|---|---|---|
| `set` | absolute component value | `component`, `before`, `after` |
| `adjust` | numeric delta | `component`, `before`, `after`, `amount` |
| `mark` / `unmark` | set/clear a tag-shaped component | `component`, `before`, `after` |

### 5.3 Relations
| Verb | Meaning | Fields |
|---|---|---|
| `link` / `unlink` | typed edge, optional payload | `object`, `edgeType`, `payload?` |
| `transfer` | possession/containment move | `object` (item), `before` (holder), `after` (holder) |
| `reveal` / `conceal` | knowledge-ledger write | `object` (factId), `audience`, `before`, `after` |

`reveal`/`conceal` earn core status because per-audience knowledge is what makes
dramatic irony, mystery-vs-Columbo ordering, and the spoiler check computable.
`conceal` records `hidden_from` — a fact may be hidden from **its own subject**
(self-directed irony) with no extra machinery.

### 5.4 Semantic event kinds (`Event.kind`)
Altitude-2 *names* for what happened, independent of the changes beneath:
`character.moved` · `relationship.formed` · `relationship.strained` ·
`secret.revealed` · `object.acquired` · `organization.founded` ·
`arc.opened` · `arc.resolved` · `world.changed`. Namespaced, extensible under
§10; consumers MUST tolerate unknown kinds and fall back to reading `changes`.

---

## 6. Time — three clocks, one carried

| Clock | What | Where |
|---|---|---|
| **Story time** (valid time) | when it happens *in the world* | `Event.at` — **carried** |
| **Transaction time** | when it was written | the Commit — **carried** |
| **Tick / wall clock** | sim step, real-world publication | local ring buffer / ARG schedule — **not carried** |

`at` carries **both** an ordinal and a calendar:

```jsonc
"at": { "t": 412, "worldDate": "3019-01-15", "granularity": "beat|scene|chapter|era" }
```

- `t` — a logical ordinal (ArgOS §6 req 6; our `chronologyIndex`). Cheap, total,
  UI-ready.
- `worldDate` — ISO-8601 on a proleptic calendar admitting fictional years
  (Mythopia). **Authoritative when present**, because windowed signals — salience,
  pace, mood decay — are arithmetic in *story-days* and cannot be computed from an
  ordinal. `t` is derivable from `worldDate`; the reverse is not.

Causality is a third, independent order: `causedBy` forms a DAG. It need not
agree with story time (a reveal explains an earlier cause), and it powers
impact-analysis before an edit and the dangling-cause check.

---

## 7. Effects — collected, never executed

```jsonc
"effects": [
  { "type": "render.panel", "payload": { "sceneId": "…" } },
  { "type": "channel.post", "payload": { "account": "@aria", "draft": "…" } }
]
```

Effects are **requests**, not writes. The writer collects them; a registered
consumer decides whether to run them (Aureum's proven model, and the reason its
rules engine is safe to embed). Anything an effect changes comes back as a new
Event with its own changes, so the log stays complete.

This is also the tool-call boundary: ArgOS's `run_tool` / `emit_stimulus` are
effects, not verbs.

---

## 8. Authorship

ArgOS §6: *"Provenance appears nowhere in the entire corpus. A graph with
multiple writers cannot function without it."* Three producers write one graph.

```jsonc
"author": {
  "kind": "human" | "simulation" | "agent" | "rule" | "generator" | "ingest",
  "id":   "michael" | "argos:run_9f2" | "chr_aria" | "aureum:rule_17" | "gemini-3-pro" | "ingest:dune.epub",
  "productionId": "prod_…"          // which telling, when applicable
}
```

Authorship is **not** the same as canonization provenance (`canonizedBy`, §9) —
one says who *wrote* it, the other who *blessed* it.

---

## 9. The Commit, the gate, and the anti-drift bar

Change records group into commits — atomic, addressable, replayable
(ArgOS §6 req 7). This layer already exists as **nit** and is unchanged by this
spec.

**Commit bounds** (per ArgOS's recommendation):
- simulation-produced → a **beat** (altitude-2 aligned; what a panel depicts)
- human authoring → a **session**
- ingest → a **document** or chapter

**The hash gate is the anti-proliferation device.** ArgOS §6 records *eight prior
attempts* at an event shape, six live simultaneously sharing no schema, with the
UI already drifted 11 type literals from the server. The defence is mechanical,
not cultural:

> nit derives operations at the commit boundary by diffing snapshots and refuses
> any commit whose operations do not reconstruct the snapshot exactly. **A schema
> that drifts cannot commit.**

**Two tiers.** Canon tier (nodes, relations, events, change records) is hashed,
branchable, mergeable. Production tier (rendered media, takes, timelines) is
blob-native — a paid, non-deterministic Veo clip is not a regenerable view, and
pretending otherwise is the one place "documents are views" breaks.

**Canonization.** Events arrive `draft` and become `canon` through a gate
(`creator | vote | rule`) plus a temporal-consistency check. This is where the
firehose meets the record: a simulation emits thousands of draft events; the
`rule` gate is the **lift filter** that decides which are worth canon. Blocked
events return the four narrative resolutions: amend, retcon, bridge, fork.

---

## 10. Components, extension, and promotion

State is **components on nodes**, folded from changes — never stored directly.

**Core namespace** (`core.*`) — every conforming system reads these:

| Component | Shape | Sources |
|---|---|---|
| `core.exists` / `core.alive` | bool | ours (`born`/`died`) |
| `core.position` | NodeId | ArgOS, Aureum `links.location` |
| `core.containment` | `{parent, mode}` | Mythopia — `spatial\|mental\|virtual\|metaphysical\|narrative` |
| `core.appearance` | lookId | ours (temporal looks), Mythopia (`restyles`) |
| `core.knowledge` | set of factIds (+ concealed) | Mythopia |
| `core.possession` | via `link`/`transfer` | ArgOS, Aureum |
| `core.motivation` | goal/desire | **ArgOS — required by the Keystone Rule's third move** |

**Drama namespace** (`drama.*`) — arcs are nodes (ArgOS's `narrative-node`), so
Mythopia's arc deltas are ordinary component writes on them:

| Component | Dynamics |
|---|---|
| `drama.tension` | **persistent** — only events move it; resolution zeroes it |
| `drama.stakes` | **ratchet** — rises, rarely falls |
| `drama.state` | `open` / `closed` + `resolvedBy` |

Mood is *not* a component — it is derived from the `magnitude`/`valence` impulse
stream with a closed-form decay, baselined by the location's atmosphere.

**Extension**: `x.<vendor>.<name>` — e.g. `x.lcg.cardStats`, `x.studio.visualDirty`.
Unknown namespaces MUST be preserved verbatim through edits, commits and merges.

**Promotion (the missing selection pressure).** ArgOS §7 proves open vocabulary
*self-corrupts* — "generation without selection." An extension component may be
promoted to `core.*`/`drama.*` only when it has: **(a)** two independent
producers writing it, **(b)** a declared fold rule, and **(c)** at least one
system reading it. Anything else stays namespaced. Vocabulary grows by
*selection*, not by generation.

---

## 11. The Fold

State is never stored; it is `fold(changes up to t)`. Entities are IDs;
components are sparse tables keyed by ID; systems are pure read-only functions.
**Change records are the only writers.**

The fold is what makes every downstream promise hold:

- *"Rebuild the world at t=412"* — replay to t.
- *"What does Garrick know here?"* — read `core.knowledge` at t.
- *"Boot this authored world"* — lower the fold into a runtime (2→1).
- *"Is this render stale?"* — §12.

**Authored records are not components.** A node's authored identity (name,
description, canonical portrait) stays a versioned record. Components carry only
what varies over story time. Dissolving authored records into pure components
buys nothing and breaks every editor.

---

## 12. Read-sets and precise invalidation

Every generated artifact (panel, shot, portrait, page, edition) MUST record its
**read-set**: which components, of which nodes, at which story time — plus the
prompt and reference-asset hashes.

```jsonc
"readSet": {
  "components": [ { "node": "chr_bill", "component": "core.appearance", "at": 412 } ],
  "promptHash": "…", "anchorHashes": ["…"]
}
```

Invalidation becomes exact instead of coarse:

> A change writes `core.appearance[chr_bill]` at t=380. Invalidate exactly those
> artifacts whose read-set includes `core.appearance[chr_bill]` at t ≥ 380 —
> **and nothing else** — with the reason attached ("Bill's appearance changed at
> t=380"), not a bare stale flag.

Without this, any edit to an event invalidates every dramatization of it.

---

## 13. Squash is a view

Squashing composes a range into a summary. Because every change carries
`before`/`after`, composition is exact: `adjust(0.7→0.4)` then `adjust(0.4→0.2)`
composes to `adjust(0.7→0.2)`.

> **Squash MUST NOT rewrite history.** The range stays; the summary is derived.
> A squashed commit is therefore lossless and reversible.

Mythopia already ships this at the telling level — an Edition's `compressions`
collapse an event span into one beat without touching the fabula. Same idea, two
altitudes.

---

## 14. Conformance

| Level | Obligation |
|---|---|
| **L1 — Emit** | Produce valid Events: non-empty `changes`, `before`/`after`, `author`, `at`. |
| **L2 — Fold** | Derive component state by replaying changes. |
| **L3 — Version** | Commit, branch, merge, blame over change records. |
| **L4 — Analyse** | Run systems (curves, convergence, linter) over the fold. |

| System | Today | Target |
|---|---|---|
| **ArgOS** | altitude 1 + 3, no middle | **L1** emit at the lift; **L2** locally; consume L2 to boot authored worlds |
| **Narrative Studio** | L1 (weak), L3 | **L1–L3** — the versioning home + altitude-3 media |
| **Mythopia** | L2 + L4 | **L4** — the engines read the fold; keep editions at altitude 3 |
| **Aureum** | rules over local state | **L1** — rules emit change records instead of mutating in place; `spawn`/`destroy` added |

---

## 15. Mapping — every system's vocabulary onto this

| This spec | Ours (`stateChange.kind`) | Aureum (`ChangeOperation`) | ArgOS §6 verbs | Mythopia |
|---|---|---|---|---|
| `create` / `destroy` | `born`, `introduced` / — | *(absent — gap)* | `spawn` / `destroy` | — |
| `set` | `transformed` | `setStat`, `setMeta` | `set_state`, `modify_component` | `restyles` |
| `adjust` | — | `incrementStat` | `modify_component` | `arc_deltas`, `stakes_deltas` |
| `mark` / `unmark` | `died` (→`core.alive`) | `addTag` / `removeTag` | `add_trait` / `remove_trait` | tags |
| `link` / `unlink` | — | `setLink` / `removeLink` | `add_relation` / `remove_relation` | `reparents` |
| `transfer` | `acquired` / `lost` | *(via links)* | `transfer` | — |
| `reveal` / `conceal` | `learned` | — | — | `knowledge{learners, hidden_from}` |
| *effects* | — | `sideEffects` | `emit_stimulus`, `run_tool` | — |
| `causedBy` | `preconditions` *(inert)* | — | `causedBy` *(proposed 3×, abandoned)* | `causes` ✅ shipped |

**Note the two structural gaps this closes:** Aureum has no `spawn`/`destroy`
and only 1:1 `links` (so inventories and many-to-many relations are
unrepresentable — nit's `Relationship` covers that); and nothing but Mythopia has
ever shipped `causedBy`.

---

## 16. What this deliberately does not do

- **No altitude-1 transport.** Tick-rate deltas stay local. If you need them for
  debugging, keep a ring buffer.
- **No prose in the record.** `title`/`description` are labels, not the telling.
  Renderers own altitude 3.
- **No merge semantics yet.** Component-granular merge (two branches writing
  different components of one node = no conflict; the same component over
  overlapping validity = a real conflict) is specified separately with the
  event-aware merge work.
- **No realtime/CRDT story.** Multi-source async reconciliation works because
  logs append and folds are deterministic; live co-editing is a separate design.

## 17. Open questions

1. **Validity intervals.** A component write is valid from `t` until the next
   write. Conflict is therefore *interval overlap*, not field equality. Worth
   modelling explicitly now or deferring to the merge work?
2. **Knowledge as component vs verb.** `reveal`/`conceal` are core here; they are
   also expressible as set-valued components. Keeping both is redundant.
3. **`Event.kind` authority.** Is the semantic kind authoritative, or purely a
   label derived from `changes`? Recommend: label, derivable, never trusted over
   `changes`.
4. **Lift thresholds.** What magnitude of altitude-1 delta earns an Event? Fixed
   thresholds, per-world config, or a learned filter?
5. **Ingest fidelity.** A book yields events with confident participants and
   locations but guessed magnitudes. Mark judgment-tier fields with a confidence
   so the review UI can sort by what needs a human.

---

## Sources

Ours: `NIT_FORMAT_SPEC.md` §1.9/§3.1, `src/storage/storage-adapter.ts`
(`WorldEvent`), `src/git/format/v1/derive.ts` (`worldStateAt`,
`validateTemporalConsistency`), `src/git/format/v1/schemas.ts` (19 op types),
C3 canonization (`canonizeEventCore`).
ArgOS: `CANON.md` §0 thesis, §2 altitudes, §3 keystone rule, §5 node/edge model,
§6 change record requirements + eight prior attempts, §7 vocabulary evolution,
§9 BitECS verdict, §13 narrative director.
Mythopia: design spec v0.8 §4 event schema, §6 curves, §12 locations, §14
editions; `src/core/store.ts` (`WorldState` component tables).
Aureum: `packages/aureum/src/{world,rules,evaluator,serializer}.ts`,
`packages/nit-aureum-adapter/src/adapter.ts`.
