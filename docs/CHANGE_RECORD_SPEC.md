# The Change Record — the altitude-2 interchange format

**Status**: `design v0.2` — DRAFT for ratification across four systems.
v0.1 was reviewed from the ArgOS side and found **not ratifiable** (five
blockers); this revision closes all five. See `CHANGE_RECORD_SPEC_REVIEW.md`.
**Author**: Michael + Claude, 2026-07-24.
**Answers**: ArgOS `CANON.md` §6 *"The Change Record and the Commit
**[OPEN — yours to standardise]**"*.
**Read with**: `CHANGE_RECORD_SPEC_REVIEW.md` (the review this answers),
`NIT_FORMAT_SPEC.md`, `MYTHOPIA_COMPARISON.md`, ArgOS `CANON.md` §2/§3/§6/§16.

**Normative language**: MUST / MUST NOT / SHOULD / MAY per RFC 2119.

---

## 0. What this is

Four systems converged on the same object and each built a different part:
**ArgOS** simulates (altitude 1) and narrates (altitude 3) with no record
between; the **Narrative Studio** records and versions that middle and produces
media from it; **Mythopia** derives the physics of story from it; **Aureum** runs
rules that mutate it. This specifies the middle: **one typed, versionable,
replayable record of what changed, who changed it, and why.** A book ingested, a
simulation tick, a human authoring, and a card game being played emit the same
thing. A comic, a film, a microdrama, an episode outline and a running world are
animated from it.

### 0.1 Changelog — what the review changed

| Blocker | Resolution |
|---|---|
| **B1** `NodeId` undefined; examples used name-derived slugs | **§3 Identity** — new, normative. Opaque `<kind>_<ULID>`, globally unique, MUST NOT derive from mutable fields. All examples corrected. |
| **B2** the fold has no defined result | **§8** — normative sort key, one authoritative field per verb, `before` as assertion with a mismatch policy, explicit fold input set. |
| **B3** no identity-reconciliation verb, list declared closed | **`merge` added** (§6.4). Core is now **12 verbs**. Absorbed id becomes a permanent read-time redirect. |
| **B4** replay may re-execute effects | **§9.1** — at-most-once, commit-arrival-driven, never on replay; stable effect ids; consumer execution ledger. |
| **B5** §4/§5 contradictions; §9 misstated nit readiness | §5 is now an explicit discriminated union with a normative field table; `transfer` inversion fixed; one name (`audience`); `link` gains an edge id; **§11.3 states the real nit gap honestly and corrects the hash-gate claim.** |
| Q1, Q2 (was "open") | **Closed** — §12.4 validity intervals; §6.3 reveal/conceal are not redundant. |
| Q3 (was "open") | **Promoted to MUST** — §4: `kind` is a label, never trusted over `changes`. |

---

## 1. The Three Altitudes (adopted from ArgOS §2)

| | Altitude | Shape | Volume |
|---|---|---|---|
| 1 | **Mechanical** | `component.set`, `relation.add`, `entity.create` | tick-rate, high |
| 2 | **Semantic** | `character.moved`, `secret.revealed`, `regard.fell` | event-rate, low |
| 3 | **Narrative** | prose, panels, shot lists, editions | on demand |

**This spec defines altitude 2 only.** Altitude 1 stays local and is NOT
transported. Altitude 3 is derived — prose and panels are views, never storage.

**Two different filters share the word "lift"; they are not the same** (review
U7):

- **The lift (1→2)** decides *what is worth recording*. Rejection is
  **irreversible** — altitude 1 is a local ring buffer. It is **stateful**
  (§8.4).
- **The gate (draft→canon, §11.2)** decides *what is true*. Rejection is
  **reversible** — the draft persists.

The **lower (2→1)** is how an authored world boots as a simulation.

> **Symmetry requirement.** Simulation→Studio and Studio→Simulation are the same
> operation: applying change records to a graph.

---

## 2. The Keystone Rule, made structural

ArgOS §3, written August 2024, never enforced:

> The narrative engine may only act by (a) injecting an entity, (b) modifying a
> component value, or (c) mutating an agent's motivation. It never commands
> agents directly, and it never emits prose unbacked by a graph change.

Enforced here as a schema constraint:

> **An Event carrying zero Changes is invalid and MUST be rejected at commit.**

**Dialogue is not an exception** (review U9). A line that "reveals nothing" still
changes who has heard it. **A speech act IS a knowledge write**: `reveal` with
the utterance as the fact and the listeners as the audience. Dialogue is backed
by construction; the MUST needs no escape hatch. Producers MUST NOT invent
no-op changes to satisfy this rule.

---

## 3. Identity **[NORMATIVE — read before implementing anything else]**

ArgOS `CANON.md` §4 marks identity **[OPEN]** and ranks it *"blocks everything."*
This closes it.

### 3.1 Grammar and opacity

```
NodeId ::= <kind> "_" <ULID>          e.g.  character_01J8F3K2QX7YB4N0WZ5MV6RTAC
```

1. IDs are **opaque**. Consumers MUST compare byte-wise and MUST NOT parse
   beyond the `<kind>` prefix.
2. An ID MUST NOT be derived from `name` or any other mutable field. Names are
   mutable authored data (§12.5); an ID derived from one is not durable.
3. **Deterministic slugs are forbidden.** Two producers independently creating
   "Malcor" would both mint `character_malcor`, and under a component-granular
   merge rule that **silently fuses two different characters**. Opaque IDs fail
   safe; slugs fail silent.

> Today's shipped scheme is `mintId('entity')` → `entity_<ms>_<8hex>`
> (`src/utils/ids.ts:19`), with name-derived fallbacks live at
> `src/extractors/character.ts:95-100` and `server.ts:10585,10691`. Both are
> non-conforming and are named for migration in §11.3.

### 3.2 Uniqueness, minting, kinds

- **Scope**: globally unique across every world, branch, repository and producer
  — explicitly widening `NIT_FORMAT_SPEC.md:62`'s per-narrative scope.
- **Minting**: any producer MAY mint at the moment it emits `create`, without
  coordination. ULID entropy makes independent minting collision-free.
- **`nodeKind`** — one enum, reconciling ours (9 `EntityType`s) with ArgOS's 6:

`character` · `location` · `object` · `organization` · `faction` · `creature` ·
`concept` · `artifact` · **`media-asset`** · **`narrative-node`**

> `media-asset` and `narrative-node` are **new to nit**. `narrative-node` is
> load-bearing: the whole `drama.*` story (§12.2) requires arcs and beats to be
> graph nodes. Our legacy `EntityType.event` is **deprecated** — Events are
> records (§4), not nodes.

### 3.3 Identity reconciliation

"These two characters are one character" is the single most consequential edit a
narrative system performs, and it **ships today as history rewrite** —
`entity-similarity.ts:11` (`'merge' | 'alias' | 'review' | 'separate'`),
`git-chunked-extraction.ts:252,435` (rewrites IDs and both relationship endpoints
before commit), `entity-merging-service.ts:227` (`canonicalEntityId` redirect
then `updateMany`). The format MUST be able to express it, or §12.6's *"change
records are the only writers"* is false. See `merge` (§6.4).

---

## 4. The Event

```jsonc
{
  "specVersion": "0.2",                          // §11.4 — REQUIRED
  "id": "event_01J8F3K2QX7YB4N0WZ5MV6RTAC",      // ULID, lexicographically monotonic
  "kind": "object.acquired",                     // a LABEL — see below
  "title": "Malcor takes the tax coins",
  "description": "…",

  "at": { "t": 412, "worldDate": "3019-01-15", "granularity": "scene" },
  "timelineId": "timeline_01J8…",                // ABSENT (not null) = the canon line

  "participants": ["character_01J8…MALC", "character_01J8…GARR"],
  "location":     "location_01J8…FORG",

  "author":   { "kind": "simulation", "id": "argos:run_9f2" },
  "causedBy": ["event_01J7…"],

  "magnitude": { "value": 0.6,  "basis": "estimated", "confidence": 0.5, "scale": "mythopia/v1" },
  "valence":   { "value": -0.4, "basis": "estimated", "confidence": 0.5, "scale": "mythopia/v1" },

  "changes": [ /* §5 — REQUIRED, non-empty */ ],
  "effects": [ /* §9 — optional, never mutating */ ],

  "extensions": { }
}
```

**`kind` is a label. MUST be derivable from `changes`, and a consumer MUST NOT
trust it over `changes`.** Unknown kinds MUST be tolerated by falling back to
`changes`. (Promoted from v0.1's open question Q3.)

**`magnitude`/`valence` are hints, not measurements.** Four producers estimating
on private scales, summed into one exponential, is noise with a decay constant.
They carry `basis` (`authored` | `estimated` | `derived`), `confidence` and a
named `scale`. Consumers MUST be able to compute their own from `changes` alone.

---

## 5. The Change Record — a discriminated union on `verb`

The precedent is our own `GraphOperationSchema` (`schemas.ts:373`). Publish as
`z.discriminatedUnion('verb', […])`.

| verb | required | `before` | `after` | authoritative field | inverse |
|---|---|---|---|---|---|
| `create` | `subject`, `nodeKind` | — | initial props | `after` | `destroy` |
| `destroy` | `subject` | props | — | `before` | `create` |
| `set` | `subject`, `component` | prior value | new value | **`after`** (LWW) | swap |
| `adjust` | `subject`, `component`, `amount` | prior num | new num | **`amount`** (commutative) | negate `amount` |
| `mark` / `unmark` | `subject`, `component` | bool | bool | `after` | the other |
| `link` / `unlink` | `subject`, `object`, `edgeType`, **`edgeId`** | — | `payload?` | `edgeId` | the other |
| `transfer` | **`object` = the item**, `subject` = the item's owner-scope | **prior holder** | **new holder** | `after` | swap |
| `reveal` / `conceal` | `subject` (fact), **`audience`**, `object?` | prior state | new state | `after` | the other |
| `merge` | `subject` = survivor, `object` = absorbed | absorbed props | `null` | `object` | *not invertible* (§6.4) |

Four v0.1 contradictions this closes (review B5):

1. **`transfer` no longer inverts `object`.** `object` is the **item**;
   `before`/`after` are holders. v0.1 said both and the coins ended up held by
   the coins.
2. **Fields §5 required but §4 omitted** — `nodeKind`, `edgeType`, `payload`,
   `audience`, `edgeId` — are now in the table.
3. **One name for the concealment slot: `audience`.** v0.1 said `audience` in a
   table and `hidden_from` in prose two lines below; the hash gate would have
   treated them as different content and concealment would silently vanish.
4. **`before`/`after` are per-verb, not blanket.** `create` has no `before`,
   `destroy` no `after`, `link`/`unlink` neither. Conformance (§13) states this
   per verb, not universally.

**`link` carries `edgeId`** so `unlink` can address one edge in a multi-edge
graph. Without it the verb is 1:1-shaped and does not close Aureum's 1:1 gap the
way v0.1 §15 claimed.

**Why `before` is mandatory where it applies.** It makes a change *invertible*
without the fold, *composable* for squash, and *narratable* (the panel needs the
fall, not the landing). Recovering it by replay is exactly what a producer at the
lift cannot do.

---

## 6. Verb notes

### 6.1 Existence
Aureum **cannot** `spawn`/`destroy` today — verified: `ChangeOperation` is 7
variants (`rules.ts:13-19`), `applyChanges` handles those 7 (`evaluator.ts:315-335`),
`createEntity` (`world.ts:22`) is an API function not reachable from a rule, and
unknown targets are silently skipped (`evaluator.ts:311`). ArgOS requires both
verbs. Closing this is part of the Aureum vendoring, not optional.

### 6.2 `adjust` vs `set`
`adjust` is **commutative** (concurrent deltas compose); `set` is
**last-write-wins** by sort key. This is the difference that makes concurrent
producers converge, and it is why `amount` — not `after` — is authoritative for
`adjust`.

### 6.3 `reveal` / `conceal` are NOT redundant with a knowledge component
*(closes v0.1 Q2 — reasoning adopted from the review.)*
The **verb is the writer; the component is the fold** — identical to `adjust`
writing and `core.regard` folding. Every core component names the verbs that
write it (§12.1). Deleting these would collapse *concealed* into *unknown* and
destroy the dramatic irony that justifies core status. They need their own verb
rather than `set` because the write is **audience-scoped**: a generic `set` would
require supplying the whole post-state for every audience — whole-world-snapshot
semantics, the exact defect this spec charges against Aureum's adapter.

### 6.4 `merge` — identity reconciliation *(new in v0.2; closes B3)*

```jsonc
{ "verb": "merge", "subject": "character_01J8…SURV", "object": "character_01J8…ABSO",
  "before": { /* absorbed node's props */ }, "after": null }
```

Three normative rules:

1. The absorbed NodeId is **never deleted**. It becomes a permanent **redirect**
   that MUST resolve on read.
2. Resolution is **transitive** and MUST be **cycle-checked**.
3. References (`participants`, `causedBy`, component values, `readSet.node`)
   resolve **through** the redirect at read time and **MUST NOT** be rewritten in
   place.

`merge` is deliberately **not invertible** — un-merging is a new `create` plus
re-attribution, and is out of scope for v0.2.

### 6.5 Semantic kinds (`Event.kind`)
`character.moved` · `relationship.formed` · `relationship.strained` ·
`secret.revealed` · `object.acquired` · `organization.founded` ·
`arc.opened` · `arc.resolved` · `identity.merged` · `world.changed`.
Namespaced and extensible; see §4 on their status as labels.

---

## 7. Time and ordering

| Clock | What | Carried? |
|---|---|---|
| **Story time** — `at.t` | when it happens in the world | **yes — the sole ordering key** |
| **Story date** — `at.worldDate` | calendar position | **yes — but NOT for ordering** |
| **Transaction time** | when it was written | on the Commit |
| **Tick / wall clock** | sim step, publication time | **no** — local buffer / ARG schedule |

**`t` is the sole ordering key** (review U10). It is author-assigned, sparse
(leave gaps for insertion), and **immutable once committed**. A derived-from-date
`t` would renumber on every prequel insertion and silently re-point every stored
read-set (§13) — fatal.

**`worldDate`** is authoritative for **story-day arithmetic only** — Mythopia's
salience, pace and mood-decay windows are computed in story-days and cannot be
derived from an ordinal. It MUST NOT participate in ordering.

**Causality** is a third, independent partial order. `causedBy` need not agree
with story time — reveals, prophecy and foreshadowing are exactly the cases this
format exists to represent. Acyclicity MUST be enforced **at merge**, not only at
write: the cycle-producing construction is amending E1→cite E2 on one branch and
E2→cite E1 on another; neither branch is cyclic, the merge is.

---

## 8. The Fold — normative result *(closes B2)*

> **The same committed log MUST fold to the same state in every implementation.**

### 8.1 Sort key
```
ORDER BY  at.t ASC,  eventId ASC        // eventId is a ULID ⇒ lexicographically monotonic
```
No other key participates. `worldDate` does not (§7). Implementations MUST NOT
invent a tiebreak. *(Our shipped fold uses `|| a.id.localeCompare(b.id)` at
`derive.ts:539` — conforming only once ids are ULIDs.)*

### 8.2 Within an Event
Changes apply **in array order**. An Event **MUST NOT** contain two changes to
the same `(subject, component, object)` triple — validators MUST reject.

### 8.3 Authority and the `before` assertion
Apply the **authoritative field** from §5's table. `before` is an **assertion
about the folded state**, not an input.

- If `before` matches folded state (numeric tolerance `1e-9`), apply normally.
- If it does not, the consumer **MUST** apply the authoritative field anyway and
  **MUST** emit a `before-mismatch` diagnostic. It **MUST NOT** silently diverge,
  and **MUST NOT** hard-fail (that would make async multi-producer
  reconciliation impossible).

> IEEE-754 makes a naive `before + amount === after` check reject this spec's own
> examples. Tolerance is mandatory.

### 8.4 The lift is stateful
`before` at the lift means **the `after` of the previous altitude-2 Event on that
`(subject, component, object)` triple** — not the previous tick's value. Trust
falling `0.7→0.65→0.6→0.45→0.2` over five ticks, lifted as one Event, is
`{before: 0.7, after: 0.2, amount: -0.5}`. A conforming runtime therefore MUST
maintain a shadow map of last-emitted values. This is a contract obligation, not
an implementation detail.

### 8.5 The fold's input set
`fold(events, { include })` where `include` is `'canon'` or `'canon+draft'`.
**There is no default.** Every call site MUST state it.

> Our reference implementation currently disagrees with itself in one file —
> `worldStateAt` defaults `canonOnly:true` (`derive.ts:524`),
> `validateTemporalConsistency` defaults `false` (`:572`). Both are
> non-conforming until the parameter is made explicit.

### 8.6 Canonicalisation before hashing *(review U1)*
Absent, `null`, `[]` and `{}` MUST all canonicalise to **ABSENT** before hashing.
Otherwise `{"timelineId": null}` and `{}` hash differently — and note zod
`.optional()` (`schemas.ts:245`) *rejects* `null` outright, so v0.1's own example
failed our own validator.

---

## 9. Effects — collected, never executed

```jsonc
"effects": [ { "id": "event_01J8…#0", "type": "channel.post", "payload": { … } } ]
```

Effects are **requests**, not writes. The writer collects; a registered consumer
decides whether to run them (Aureum's proven model). Anything an effect changes
returns as a new Event, so the log stays complete. ArgOS's `run_tool` /
`emit_stimulus` are **effects, not verbs**.

### 9.1 At-most-once execution *(closes B4)*

> **Effects execute at most once, driven by commit arrival, never by replay.
> Fold, replay, checkout, `lower(2→1)` and migration operate exclusively over
> `Event.changes`. Once committed, `Event.effects` is opaque historical data.**

Without this clause, a migration tool or branch-materialisation routine that
walks Events and dispatches `effects` is a *correct reading of v0.1* — and
`channel.post` posts to a real account twice, `render.panel` bills a paid model
twice. Both irreversible; both were v0.1's own worked examples.

Each effect carries a stable `id` (`${eventId}#${index}`). Consumers MUST keep an
execution ledger, checked-and-marked **atomically** around dispatch, so a crash
between execution and the returning Event cannot double-fire, and two replicas
watching one stream cannot both pick it up.

---

## 10. Authorship

```jsonc
"author": { "kind": "human"|"simulation"|"agent"|"rule"|"generator"|"ingest",
            "id": "michael" | "argos:run_9f2" | "aureum:rule_17" | "ingest:dune.epub",
            "productionId": "prod_…" }
```

Authorship (who **wrote** it) is distinct from canonization provenance (who
**blessed** it, §11.2). Every prior attempt conflated them.

> `AuthorRefSchema` ships **3** kinds (`user|ai|system`, `schemas.ts:75-79`)
> against the 6 here. ArgOS CANON §6 req 4 is therefore **presently unmet** on our
> side. Named for migration in §11.3.

---

## 11. Commits, canonization, and the honest state of nit

### 11.1 Commit bounds
Simulation → a **beat**. Human authoring → a **session**. Ingest → a
**document/chapter**.

### 11.2 Canonization
Events arrive `draft` and reach `canon` through a gate (`creator | vote | rule`)
plus a temporal-consistency check, returning four narrative resolutions on
conflict (amend / retcon / bridge / fork). **The gate design is proven and
shipped** (`server.ts:4100-4210`).

Two corrections (review U4, U7):

- **`status` should not live inside the hashed Event.** It does today
  (`schemas.ts:252`), mutated in place by `canonizeEventCore` (`server.ts:4145`),
  so a canonization commit carries **zero change records** — contradicting §2.
  It is also a *transaction-time* fact on a *valid-time* record, so "what was
  canon last Tuesday" is unanswerable and uncanonize is destructive.
  **Recommendation: a separate hashed canonization record pointing at the Event;
  derive `status`.**
- **The gate cannot currently filter the firehose.** `canonizeEventCore` selects
  `production?.canonGate || 'creator'` and only resolves a production when
  `sourceProductionId` is set (`server.ts:4158-4162`). Simulation events have no
  production ⇒ they fall to `creator`, which **approves unconditionally**. And the
  `rule` gate is a hard-coded `approved:false` stub (`server.ts:4128-4129`). The
  filter §1 assigns the firehose to is **both unreachable and unimplemented**.

### 11.3 What nit does NOT yet have *(corrects v0.1's worst error)*

v0.1 said the commit layer *"already exists as nit and is unchanged by this
spec."* **That is materially false**, and it is the sentence most likely to cause
a planning error.

`WorldEventSchema` (`schemas.ts:242-257`) has **none** of: `author`, `causedBy`,
`magnitude`, `valence`, `at`/`worldDate`/`granularity`, `changes`, `effects`,
structured `location`. What exists is `stateChanges[]` — a 9-value enum with
free-text `detail` and no before/after (`schemas.ts:236-240`) — **precisely the
defect this spec was written to fix.** Neither `NIT_FORMAT_SPEC.md` nor
`schemas.ts` contains any notion of a *component* or a *fold*.

Mapping §5's 12 verbs onto nit's 19 operations: **6 have no nit op at all**
(`adjust`, `mark`, `unmark`, `transfer`, `reveal`, `conceal`) — plus `merge`, now
7. Every `UPDATE_*` carries `changes: Partial<T>` with new values only;
`shallowChanges` never captures a `before` (`derive.ts:179`). Conversely **10 of
19** nit ops (Scene/Frame/StyleProfile/Scratchpad) have no verb analogue because
they operate on altitude-3 material.

**The hash gate is narrower than v0.1 claimed.** A round-trip failure refuses the
**nit ledger row** (`server.ts:562-565`) — but the studio's own project save
proceeds deliberately (`server.ts:592`: *"The nit ledger must never block the
studio's own commit flow"*), drift is absorbed into the next successful entry with
a `console.error`, and `metadata`/`formatVersion` are pinned before comparison
(`derive.ts:621-629`) so drift there is structurally invisible. It is application
logic at one route, not a library-level property. **It is a useful bar, not the
anti-drift guarantee v0.1 advertised.**

**Migration list** (all REQUIRED for conformance): add `formatVersion` to
`CommitSchema` (`NIT_FORMAT_SPEC.md:516-518` says REQUIRED; `schemas.ts:449-461`
omits it); widen `AuthorRefSchema` to 6 kinds; add `media-asset` and
`narrative-node` node kinds; deprecate `EntityStateChangeSchema` by name; move
`status` out of the hashed Event; adopt ULID ids; **decide where a Change lives**
— a field of the `WorldEvent` payload, or a new top-level `GraphOperation` kind.
Those two hash, diff and merge differently (under the first, an appended change
is a whole-array replacement, `derive.ts:331-344`) and the spec MUST pick one.

### 11.4 `specVersion` and unknown verbs
Every Event carries `specVersion`. **An unknown `verb` MUST be rejected, never
skipped** — skipping silently diverges the fold. Unknown `kind` and unknown
extension namespaces are tolerated (§4, §12.3).

---

## 12. Components

State is components on nodes, folded from changes — never stored.

### 12.1 Core vocabulary
Every core component names the verbs that write it and its fold rule.

| Component | Fold rule | Written by |
|---|---|---|
| `core.exists` / `core.alive` | `flag` | `create`/`destroy`, `mark`/`unmark` |
| `core.position` | `ref` | `set`, `link` |
| `core.containment` | `ref` (`{parent, mode}`) | `set` |
| `core.appearance` | `scalarLastWrite` | `set` |
| `core.knowledge` | `set` (audience-scoped) | `reveal` / `conceal` |
| `core.possession` | `ref` | `transfer` |
| `core.motivation` | `scalarLastWrite` | `set` — *required by the Keystone Rule's third move* |
| **`core.regard`** | `scopedNumeric` (subject→object, −1..1) | `adjust`, `set` |

> **`core.regard` is new in v0.2** (review U13). v0.1's flagship example used
> `core.trust`, which was not in the core table at all. Every system already has
> this state — ArgOS `Knows{familiarity, sentiment}`, nit `Relationship.strength`
> — so it clears the promotion bar (§12.3) on arrival.

### 12.2 Drama vocabulary
Arcs are `narrative-node`s (§3.2), so Mythopia's arc deltas are ordinary
component writes on them:

| Component | Fold rule | Dynamics |
|---|---|---|
| `drama.tension` | `numeric` | persistent; resolution zeroes it |
| `drama.stakes` | `numeric` | ratchets in practice — **not clamped by the fold** |
| `drama.state` | `scalarLastWrite` | `open`/`closed` + `resolvedBy` |

> "Ratchet — rises, rarely falls" is a *narrative tendency*, not a fold rule. If
> the fold clamped it, changes would stop being invertible (§5) and composable
> (§14). Enforcement belongs in the linter, not the substrate.

**Mood is NOT a component.** It is derived from the `magnitude`/`valence` impulse
stream with a closed-form decay, baselined by location atmosphere. Resist
pressure to add `core.mood`.

### 12.3 Fold rules are data; vocabulary is declarable *(review U5)*

The closed set of fold rules:
`flag` · `scalarLastWrite` · `numeric` · `set` · `ref` · `scopedNumeric`

ArgOS invents components at runtime (76 definitions in `v2/data/components/`, each
only `{name, properties}`). A promotion criterion of "has a declared fold rule"
is unsatisfiable for anything GodAI invents, and a stream that introduces
`Paranoia` at t=200 is unreplayable past t=200 by any receiver that has never
heard of it.

**Therefore: a `declare` record.** It introduces a component with its fold rule
and travels in the stream ahead of first use.

```jsonc
{ "verb": "declare", "component": "x.argos.paranoia", "foldRule": "numeric",
  "valueType": "number", "description": "…" }
```

ArgOS CANON §16 already calls this a **vocabulary commit** — the two documents
were converging on it from opposite sides. *(This makes the core 13 records: 12
state verbs + `declare`.)*

### 12.4 Validity intervals *(closes v0.1 Q1)*
A component write is valid **from `t` until the next write to the same
`(subject, component, object)` triple**. Conflict is therefore **interval
overlap**, not field equality. This is not deferrable: §13's precision guarantee
and §15's merge rule both already depend on it.

### 12.5 Authored records are not components
A node's authored identity (`name`, `description`, canonical portrait) stays a
versioned record. Components carry only what varies over story time. Dissolving
records into components buys nothing and breaks every editor. Records are cited
by §13 as `record@version`, not dissolved.

### 12.6 Extension and promotion
`x.<vendor>.<name>`. Unknown namespaces MUST be preserved verbatim through edits,
commits and merges.

Promotion to `core.*`/`drama.*` requires **(a)** two independent producers
writing it, **(b)** a declared fold rule from §12.3's closed set, and **(c)** at
least one system reading it. Vocabulary grows by **selection**, not generation —
ArgOS §7 proves open vocabulary self-corrupts without it. The same bar applies to
edge types and event kinds, and `core.*` is held to it too.

---

## 13. Read-sets and invalidation **[DRAFT — not ratifiable in v0.2]**

Every generated artifact SHOULD record its **read-set**: which components, of
which nodes, at which `t`, on which `timelineId` — plus prompt and reference
hashes.

```jsonc
"readSet": {
  "components": [ { "node": "character_01J8…", "component": "core.appearance",
                    "at": 412, "timelineId": null } ],
  "promptHash": "…", "anchorHashes": ["…"]
}
```

**Downgraded from v0.1's "and nothing else" guarantee**, which was *unsound*, not
merely imprecise (review U6): identity `merge` (§6.4) under-invalidates — panels
depicting a pre-merge face carry no stale flag; canonization changes the
canon-only fold **without writing any component**, so it invalidates nothing; and
retcons have no `t` to key on.

This section is **entirely new construction** — `promptHash`, `readSet` and
`anchorHash` have **zero occurrences** in `src/`. Today's mechanisms are
whole-entity dirty flags (`server.ts:12149-12179`) and whole-event staleness
(`server.ts:3983`).

---

## 14. Squash is a view

> **Squash MUST NOT rewrite history.** The range stays; the summary is derived.

Composition is **per verb-class**, not universal (review U8):

| Class | Composes to |
|---|---|
| `adjust` (numeric) | one `adjust`, summed `amount` — exact |
| `set` / `mark` / `transfer` | one change, first `before` + last `after` |
| `create`+`destroy`, `link`+`unlink`, `transfer(A→B)`+`(B→A)` | **zero changes** — the squashed view is a valid *view* but MUST NOT be committed as an Event (§2) |
| `reveal`+`conceal` | per-audience map, not one change. **MUST NOT collapse** — "A knew, then was deceived" squashing to "A never knew" destroys the irony the verb exists for |
| `magnitude`/`valence` | **no composition rule** — Mythopia's decay kernel is not invariant under replacing N impulses with one. Squashed views MUST recompute from the underlying range |

Mythopia ships the same idea at altitude 3: an Edition's `compressions` collapse
a span into one beat without touching the fabula.

---

## 15. Conformance

| Level | Obligation |
|---|---|
| **L1 — Emit** | Valid Events: non-empty `changes`, per-verb `before`/`after` (§5), `author`, `at.t`, `specVersion`, ULID ids, stateful lift (§8.4) |
| **L2 — Fold** | §8 exactly: sort key, per-verb authority, `before` diagnostics, explicit input set |
| **L3 — Version** | Commit, branch, merge, blame; `merge` redirects resolve transitively |
| **L4 — Analyse** | Systems over the fold (curves, convergence, linter) |

| System | Today | Target |
|---|---|---|
| **ArgOS** | altitudes 1+3, no middle; serialises raw recycled BitECS eids (**no durable identity at all**) | **L1** + L2 locally; consume L2 to boot authored worlds |
| **Narrative Studio** | partial L1, L3 (see §11.3 for the real gap) | **L1–L3** |
| **Mythopia** | L2 + L4 | **L4** |
| **Aureum** | rules over local state | **L1** — rules emit records; `spawn`/`destroy` added |

**§16's mapping table is now VERIFIED at source for all four systems**
(2026-07-27). Verification establishes the table's *facts*; it does **not**
establish agreement. **A maintainer from each system MUST still accept the
conformance obligations above before ratification** — Mythopia to L4, Aureum to
L1 with `spawn`/`destroy` added, ArgOS to L1 (it has already stated in CANON §6
that it will conform to whatever this specifies).

---

## 16. Mapping

**Verification status** (was UNVERIFIED in v0.1/v0.2-draft — the ArgOS reviewer
had neither repo in their workspace):

- **Aureum — VERIFIED 2026-07-27** against
  `g89le/04_wonderlab/03_prototypes/transmedia_engine/packages/aureum/src`.
- **Mythopia — VERIFIED 2026-07-27** against `src/core/types.ts` (cloned working
  copy, `pushed_at` 2026-07-23).
- Verification confirms the *table's facts*. It is **not** ratification —
  §15 still requires a maintainer from each to accept the conformance
  obligations.

| This spec | Ours (`stateChange.kind`) | Aureum (`ChangeOperation`) | ArgOS §6 verbs | Mythopia (`NarrativeEvent`) |
|---|---|---|---|---|
| `create` / `destroy` | `born`, `introduced` / — | **absent — confirmed gap** ¹ | `spawn` / `destroy` | — |
| `set` | `transformed` | `setStat`, `setMeta` | `set_state`, `modify_component` | `restyles[]` → `core.appearance` ² |
| `adjust` | — | `incrementStat` | `modify_component` | `arc_deltas[]`, `stakes_deltas[]` |
| `mark` / `unmark` | `died` (→`core.alive`) | `addTag` / `removeTag` | `add_trait` / `remove_trait` | `resolves[]`/`reopens[]` → `drama.state` |
| `link` / `unlink` | — | `setLink` / `removeLink` ³ | `add_relation` / `remove_relation` | — |
| `set` (containment) | — | `setLink` ³ | — | `reparents[]` → `core.containment` ⁴ |
| `transfer` | `acquired` / `lost` | *(via 1:1 links)* ³ | `transfer` | — |
| `reveal` / `conceal` | `learned` | — | — | `knowledge[]{learners, hidden_from}` ⁵ |
| **`merge`** | *(ships as ID rewrite)* | — | *(name-addressed)* | — |
| `declare` | — | — | *(CANON §16 vocabulary commit)* | — |
| *effects* | — | `sideEffects` ✅ | `emit_stimulus`, `run_tool` | — |
| `causedBy` | `preconditions` *(inert)* | — | *(proposed 3×, abandoned)* | `causes[]` ✅ shipped |

¹ `ChangeOperation` is exactly 7 variants (`rules.ts:13-19`) and `applyChanges`
handles exactly those 7 (`evaluator.ts:315-335`). `createEntity` exists as an API
function (`world.ts:22`) but is **not rule-reachable**, and `applyChanges`
silently skips unknown targets (`evaluator.ts:311`). So an Aureum *rule* cannot
spawn or destroy — confirmed, and it is a real gap to close at vendoring.

² `Restyle{entity, appearance, note?}` — "the new canonical appearance from this
event onward" — is a `set` on `core.appearance`, not a generic property write.

³ `links: Map<string, string>` (`world.ts:17`) is **1:1** — one `location`, one
`owner` per entity. Inventories and many-to-many relations are not representable
in Aureum; nit's `Relationship` (which carries an `id`) is what closes this, and
it is why §5's `link` requires an `edgeId`.

⁴ **Correction to the v0.1 table**, which mapped `reparents` to `link`/`unlink`.
`Reparent{entity, to, mode}` is *containment* (`mode: spatial | mental | virtual
| metaphysical | narrative`), which §12.1 folds as `core.containment` — a `ref`,
not a generic edge.

⁵ `KnowledgeEntry{learners?, hidden_from?, fact}` — one entry carries **both**
directions, so it maps to a `reveal` **and** a `conceal` sharing one `subject`
(the fact) with different `audience`s. See the Mythopia-side review for whether
one `audience` field survives group knowers (`expandKnower`) and edition-scoped
audiences.

---

## 17. Out of scope / still open

**Out of scope for v0.2**: altitude-1 transport; prose in the record;
component-granular **merge semantics** (§15's rule is *draft, non-ratifiable* —
it omits `timelineId` entirely); realtime/CRDT co-editing.

| # | Open |
|---|---|
| O1 | **`timelineId` has no model** — no `forkedFrom`, no `forkPoint`, no statement of whether a fork **inherits** the canon prefix. The shipped fold partitions (`derive.ts:536`); the word "fork" implies inheritance. ArgOS would boot an empty world where the Studio renders full history — neither wrong per this spec. Note `Timeline{parentTimeline, branchPoint}` already exists unversioned at `canon-timeline-manager.ts:31-43`. |
| O2 | **Dangling `causedBy`** has four defensible resolutions; this spec picks none. |
| O3 | **Lift thresholds** — per-world config or learned? (The *stateful* part is settled in §8.4; only thresholds remain open.) |
| O4 | **Ingest confidence** — judgment-tier fields need a confidence so review UIs sort by what needs a human. `magnitude`/`valence` now carry it; `arc_deltas` do not. |
| O5 | **Where a Change lives in nit's op model** (§11.3) — MUST be decided before implementation. |

---

## Sources

Review: `CHANGE_RECORD_SPEC_REVIEW.md` (2026-07-24, ArgOS side) — five blockers,
all accepted; every code claim independently re-verified.
Ours: `NIT_FORMAT_SPEC.md`, `schemas.ts`, `derive.ts`, `server.ts`,
`entity-similarity.ts`, `entity-merging-service.ts`, `git-chunked-extraction.ts`,
`utils/ids.ts`, `canon-timeline-manager.ts`.
ArgOS: `CANON.md` §0/§2/§3/§4/§5/§6/§7/§9/§13/§16.
Mythopia: design spec v0.8 §4/§6/§12/§14; `src/core/store.ts`.
Aureum: `packages/aureum/src/{world,rules,evaluator,serializer}.ts`;
`packages/nit-aureum-adapter/src/adapter.ts`.
