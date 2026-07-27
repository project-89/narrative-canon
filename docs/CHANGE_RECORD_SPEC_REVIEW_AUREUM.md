# Review — `CHANGE_RECORD_SPEC.md` v0.5, from the Aureum side

**Reviewer**: Claude (Aureum side), 2026-07-27 — run as a workflow: one Opus
adversarial reviewer + one independent Sonnet verifier **per blocker** (every
file:line claim re-checked, every failure scenario attacked for reachability).
**Verdict**: Not ratifiable from the Aureum side as-is — 7 blockers. L1 *emission* is reachable as a pure wrapper around `step()` with zero evaluator changes; §15's Aureum row is not, and three blockers (no clock vs REQUIRED `worldDate`, narrative-only rules vs §2, oneShot spent-ness in no channel) are places where Aureum structurally cannot conform without a spec change.

## Disposition (folded in spec v0.6)

| # | Verification | Resolution |
|---|---|---|
| B1 no clock vs REQUIRED `worldDate` | **CONFIRMED** | §7: clockless producers declare a `t → worldDate` mapping as a world parameter; `granularity` enumerated with `session` |
| B2 narrative-only rules vs §2 | PARTIAL — workaround exists but is undocumented, and §16 pointed the wrong way | §6.3.1: the create+reveal pattern; §16 Aureum effects row corrected |
| B3 oneShot spent-ness in no channel | PARTIAL — forward-looking (replay today rehydrates the RuleSet snapshot; spent-ness derivable from `match.rule.oneShot`) | §12.7.1: engine state that gates future behaviour MUST be reified as a component write — vendoring obligation |
| B4 one `setLink` → four verbs, non-deterministic | **CONFIRMED** | §12.5.2: per-key link declarations; undeclared keys → `link`/`unlink` with synthesized stable `edgeId` |
| B5 open tag vocabulary / untyped `setMeta` | PARTIAL — mechanism exists (§12.5 `declare` + §16's `mark`/`unmark` mapping); worked example missing | §12.5 gains the worked example; membership-vs-tags category difference stated |
| B6 silent skip → emitted log ≠ applied world | **CONFIRMED** | §8.3: producer-side twin — an emitter MUST NOT emit a change it did not apply (`unapplied-change`) |
| B7 closed `nodeKind` enum excludes game-mechanical nodes | **CONFIRMED** | §3.2: extension node kinds `x.<vendor>.<name>`, declared once, tolerated as opaque |

**The first question, answered**: L1 emission requires **zero evaluator
changes** — the emitter is a host wrapper around `step()`, reading `before`
from the pre-step world and `after` from the returned clone, with the match
context supplying participants. Rules stay pure. (`spawn`/`destroy` are still
a vendoring addition — rules cannot create or destroy entities.)

---

# Review — `CHANGE_RECORD_SPEC.md` v0.5, from the Aureum side

**Reviewer**: Claude (Aureum side), 2026-07-27
**Method**: adversarial pass over spec v0.5 against Aureum at source —
`packages/aureum/src/{world,rules,evaluator,parser,serializer,aureum-context,index}.ts`,
`packages/aureum/tests/*`, `packages/nit-aureum-adapter/src/adapter.ts`,
`packages/nit-aureum-adapter/tests/adapter.test.ts` and
`tests/integration/experience-pipeline.test.ts`
(root: `g89le/04_wonderlab/03_prototypes/transmedia_engine/`). Every claim carries a
`file:line`; unsubstantiated claims were dropped and are listed in §0.
**Verdict**: **not ratifiable as-is — 7 blockers.** L1 *emission* is reachable
as a pure wrapper around `step()` with **zero evaluator changes**; **§15's Aureum
row is not**, and three blockers are places where Aureum structurally cannot
conform without a change to the spec, not to Aureum.

Aureum is the smallest of the four systems and the one whose model the spec
already fits best — `incrementStat`→`adjust` with an authoritative constant
`amount`, and effects-collected-never-executed, are both *Aureum's* designs
arriving back as normative text. The failures below are almost all at the
edges the other three vantages could not see: a producer with **no clock**, an
**open string vocabulary**, **rules as first-class world-affecting state**, and
an output surface that is **half narrative side effect**.

---

## §0 Verification log

### Substantiated by direct inspection

| # | Claim | Evidence |
|---|---|---|
| V1 | `ChangeOperation` is exactly **7** variants; no create/destroy/knowledge/time op | `aureum/src/rules.ts:12-19` |
| V2 | `applyChanges` handles exactly those 7 and **skips unknown targets silently** | `evaluator.ts:308-341`, esp. `:311` |
| V3 | `World.add`/`World.remove` exist as API but **no ChangeOperation reaches them** | `world.ts:90,102`; `evaluator.ts:313-338` |
| V4 | `EntityMatcher` is boolean-only — id / tag / stat-threshold / link conditions, **no value binding** | `world.ts:42-73`, `:163-197` |
| V5 | `$N` is documented but **unimplemented**; only `$` is substituted, for `target` and `setLink.targetId` | `rules.ts:27`; `evaluator.ts:280-303` |
| V6 | `setStat.value` and `incrementStat.amount` are **literal constants in the rule** | `rules.ts:15-16` |
| V7 | The **only** read of a live value is inside `applyChanges`' `incrementStat` — and it is discarded | `evaluator.ts:324-327` |
| V8 | `step()` clones, then mutates only the clone; the caller keeps a pre-state world (asserted by test) | `evaluator.ts:186-190`; `tests/rules-evaluator.test.ts:278-289` |
| V9 | `clone()` deep-copies tags/stats/links but **shallow-spreads `meta`** | `world.ts:116-128`, esp. `:124` |
| V10 | `step()` mutates `ruleSet.spentRuleIds` **in place**; `StepResult` carries no signal of it | `evaluator.ts:193-195`, `:21-28` |
| V11 | `clone()` copies entities only — every world derived from one RuleSet **shares one mutable spent-set** | `world.ts:116-128` |
| V12 | `spentRuleIds` is serialized **inside** the RuleSet record | `rules.ts:104-105`; `serializer.ts:74-82` (`:80`) |
| V13 | `tick()` clones per fired rule and keeps only the **last** world; intermediates are discarded | `evaluator.ts:229-231`, `:243-247` |
| V14 | `tick()` fires **every** matching auto rule per entity, iterating `Map` insertion order | `evaluator.ts:217-241`; `world.ts:106-108` |
| V15 | `tick()`'s auto-rule test requires the **entity** to carry the `auto_trigger` tag (trigger tags are matched against the entity) | `evaluator.ts:223-226`, `:270-274`; `world.ts:163-172` |
| V16 | `tick()` has **zero test coverage** — `tick(` appears in no test in the repo; the one test named for it calls `step` and says so | `tests/rules-evaluator.test.ts:310-328`, esp. `:321-323` |
| V17 | A rule may carry side effects and **no changes**; a shipped test asserts it | `tests/rules-evaluator.test.ts:266-276`; `parser.ts:197-204` |
| V18 | **No clock of any kind**: `World` holds entities only; `StepResult`/`TickResult`/`SerializedEngineState` carry no time | `world.ts:77-86`; `evaluator.ts:21-37`; `serializer.ts:33-36` |
| V19 | Ids are author/LLM-chosen names — parser takes segment 0 as the id; the LLM contract mandates `UPPER_SNAKE_CASE` | `parser.ts:53-58`; `aureum-context.ts:19` |
| V20 | `links` is `Map<string,string>` — strictly 1:1 per key; `setLink` overwrites | `world.ts:17`; `evaluator.ts:329-330` |
| V21 | One `setLink` is the only representation of possession, position, containment **and** generic relation; keys are free strings | `world.ts:13-20`; `rules.ts:17-19`; `aureum-context.ts:22` |
| V22 | Tags are an open runtime vocabulary — any bare word parses to `addTag` | `rules.ts:13`; `parser.ts:318-321` |
| V23 | `meta` is `Record<string, unknown>`, documented as display data **not read by rules**, yet rule-writable via `setMeta` | `world.ts:19`; `aureum-context.ts:23`; `rules.ts:19` |
| V24 | The parser **merges** multiple ops on one target into one `WorldChange` | `parser.ts:277-284` |
| V25 | The adapter infers an entity type from the **first non-denylisted tag** | `adapter.ts:76-80` |
| V26 | The adapter writes the **raw Aureum id** as the nit entity id | `adapter.ts:82-95` (`:83`) |
| V27 | The adapter smuggles the RuleSet through as a fake entity typed `__aureum_ruleset` | `adapter.ts:155-168` |
| V28 | `restoreWorld` scans only the last **100** commits and otherwise returns an **empty world**, silently | `adapter.ts:211-221` |
| V29 | The side-effect handler registry is **module-global**; `SideEffect` has no id | `evaluator.ts:51-64`; `rules.ts:47-50` |
| V30 | The adapter turns side effects into **graph writes** (`ADD_ENTITY`, `ADD_INTERACTION`) | `adapter.ts:256-326` |
| V31 | `RuleMatch.matchedEntities` is **always `[triggerId]`** — the wildcard branch is unreachable, since `matchesTrigger` returns false when the entity is absent | `evaluator.ts:132`, `:152-154`, `:267` |
| V32 | `evaluate`/`step` do **not** filter `auto_trigger`, so an auto rule can also fire through the manual path | `evaluator.ts:106-113` vs `:223-226` |

### Dropped — could not substantiate

1. **Everything about ArgOS, Mythopia, nit internals and the Studio.** Only
   `packages/aureum` and `packages/nit-aureum-adapter` were read. §16's ArgOS
   and Mythopia columns, §11.3's nit claims and §11.2's `server.ts` citations are
   **unverified here** — I neither confirm nor dispute them.
2. *"A nit round-trip reorders entities and therefore changes `tick()`'s Event
   order."* The **dependency** on `Map` insertion order is verified (V14,
   `world.ts:106-108`); the reordering itself would require nit's export/commit
   ordering, which I did not read.
3. *"Equal-specificity ties are a divergence risk."* Not substantiated —
   `Array.prototype.sort` is stable, so ties resolve in `ruleSet.rules` order
   (`evaluator.ts:167`) and that order survives serialization
   (`serializer.ts:79`). Deterministic; dropped.
4. *"The module-global handler registry has caused a live bug."* Overstated — no
   multi-world host exists in-tree. Recorded as a hazard in §3, not a defect.
5. *"ULIDs break the DSL's parser."* Checked and **false**: the matcher and link
   regexes accept `character_01J8…` (`parser.ts:358,386`). Dropped — the identity
   problem is authoring ergonomics, not lexing.

---

## §1 The first question, answered: where an L1 emitter must live

**Not in the rule language — that is structurally impossible.** A rule cannot
read a value: `EntityMatcher` is a boolean predicate over id, tags, stat
thresholds and link identity (V4); the `$N` binding the doc comment promises was
never implemented and `resolveChanges` substitutes only `$`, only into
`change.target` and `setLink.targetId` (V5); and every written value is a literal
constant (V6). No rule author, human or LLM, can put a `before` into a change.

**The only live-value read in the engine is `applyChanges`' `incrementStat`
(V7)** — and it throws the value away.

**So the emitter is a wrapper around the evaluator. `step()` supports one; `tick()`
does not.**

- **`step()` gives a consistent before-view.** It evaluates, then clones, then
  mutates only the clone (V8); the caller still holds the pre-state `World`
  object, and immutability is asserted by a shipped test. An external
  `emitStep(pre, ruleSet, triggerId)` can read `before` from `pre` and `after`
  from `result.world` for every resolved op. **No evaluator change required.**
  One caveat, precisely: the before-view is consistent for **tags, stats and
  links** (fresh `Set`/`Map` per entity) but **not for structured `meta`**, which
  `clone()` shallow-spreads (V9).
- **Side effects do not interfere.** `step()` collects and returns them;
  `handleSideEffects` is a separate host call (`evaluator.ts:81-91`,
  `:197-201`). This is already §9's model, working.
- **Spent rules do interfere, mildly.** The spend happens *inside* `step()` and
  is invisible in `StepResult` (V10), so an emitter must diff `spentRuleIds`
  around the call — reaching into engine state to observe a state transition
  that belongs in the log (**B3**).
- **`tick()` cannot be wrapped losslessly.** It clones per fired rule and returns
  only the final world with a flattened `matches[]` (V13). For the 2nd..Nth match,
  neither `before` nor `after` is recoverable from `TickResult` — and collisions
  are the norm, since every matching auto rule on every entity fires (V14).
  A host *can* rebuild the loop from exported primitives (`evaluateAll`,
  `applyChanges`, `World.clone` are all exported, `index.ts:34-47`), but that
  means **`tick()` must be deprecated at vendoring**, or it survives as a second,
  silently non-conforming entry point. Its own test file documents that its
  author had already lost track of its semantics, and it has no coverage (V15,
  V16).

**Answer: yes and no, and the split matters.**
**Yes** — a `before`-bearing L1 emitter over `step()` needs **no evaluator
change**. **No** — Aureum cannot reach **its §15 row** without one, and the spec
names only *one* of the four required changes:

1. `spawn`/`destroy` — two `ChangeOperation` variants + two `applyChanges` cases
   (V1, V2). *Cheaper than §6.1 implies: `World.add`/`World.remove` already exist
   (V3), so this is rule-reachability, not new world API.*
2. `tick()` replaced (V13).
3. `StepResult` exposing spent-rule transitions (V10, **B3**).
4. The silent skip at `evaluator.ts:311` made observable (V2, **B6**).

Each is a few lines. None is a research project. But the §15 row as written —
"rules emit records; `spawn`/`destroy` added" — **understates the vendoring by
three items**, and a maintainer signing that row should sign the longer list.

---

## §2 Blockers

### B1 — `worldDate` is REQUIRED at L1 and Aureum has no clock; the use case has no calendar

§7 makes `at.worldDate` REQUIRED at L1 in a pinned proleptic-Gregorian grammar,
and §15's L1 row repeats it. Aureum has **no time model at all** (V18): the
`World` is a bag of entities, results carry no ordinal, and the serialized engine
state carries no clock, so even a *resumed* session cannot recover one. Every `t`
and every `worldDate` must be host-assigned.

For a simulation that is fine. For the two uses Aureum is actually targeted at —
**living-card-game play sessions** and the **canonization rule-gate** — there is
no story calendar to assign *from*. The host must fabricate a date that is
indistinguishable on the wire from an authored one, and Mythopia will then do
day-*distance* arithmetic over it (salience 30d, pace 14d, the travel linter).
The spec's own §7 table says the wall clock is **not** carried; mapping session
wall-clock into story time is precisely that, laundered.

There is no representation for "this producer has no calendar": `worldDate` is
required, `granularity` is unenumerated, and B2's monotonicity rule then binds a
fabricated axis to the real one.

*Fix.* One sentence in §7 and one world parameter in §12.5.1: **a producer with
no story clock MUST declare its `t → worldDate` mapping** (`{storyEpoch,
daysPerT}` or an explicit per-session date) before emitting. The date becomes
*derived and declared* rather than invented; all events of one session share a
date, day-distance is honestly 0, and the monotonicity check holds trivially.
Enumerate `granularity` and give it a `session` value.

### B2 — Narrative-only rules cannot be emitted at all, and §2's dialogue answer is unavailable to Aureum

A rule may carry side effects and no changes; the DSL's `narrative:` section is a
first-class producer of exactly that shape, and a shipped test asserts `step()`
returning the narrative for a change-less rule (V17). §2 requires such an Event
to be **rejected**, and forbids inventing no-op changes to satisfy the rule.

§2's escape hatch — *"a speech act IS a knowledge write: `reveal` with the
utterance as the fact and the listeners as the audience"* — is **not reachable
from Aureum**. It has no knowledge model, no fact ids, no audience concept, and
by §16's own table no `reveal`/`conceal` analogue; a `SideEffect` is
`{type, payload: Record<string, unknown>}` whose only convention is `text`, with
no participants to derive an audience from (V17, `rules.ts:47-50,64-76`).

So the emitter chooses between dropping the beat — and §0's *"a card game being
played emits the same thing"* becomes false for the most common rule shape in the
shipped fixtures — and inventing backing changes, which §2 forbids in the same
paragraph. This is the one blocker that attacks the spec's headline claim rather
than a field.

*Fix.* Make §2's own answer executable by a producer with no listener model: a
producer MAY **declare a default audience node** (the session, the table, the
reader) as a world parameter, and MUST emit an utterance as
`reveal(fact_<stable-hash>, audience: <declared default>)`. One paragraph;
keeps the MUST; costs the keystone rule nothing.

### B3 — oneShot spent-ness lives in no channel, and is shared across forks

`step()`/`tick()` mutate `ruleSet.spentRuleIds` in place (V10) and `World.clone()`
copies entities only (V11), so every world derived from one RuleSet shares one
mutable spent-set. Two failures:

- **Replay diverges.** No emitted change records the spend, so a world rebuilt by
  folding the log has an empty spent-set and the next step fires a oneShot rule
  the original could not. The shipped test proves the dependency: the rule stops
  firing only because the *same mutated object* is passed to the second `step`
  (`tests/rules-evaluator.test.ts:294-306`).
- **Forks cross-contaminate.** §7.1 makes branches independent and inheriting;
  stepping branch A spends a rule inside the RuleSet object branch B holds.

And the spec has nowhere to put the fix. By §12.7's own boundary test —
*varies as a result of story events* — spent-ness is a **component**. By §11.5
rulesets are **records** (authored, edit-time, field-level LWW). §3.2 has no
`nodeKind` to hang an in-play rule's state on. The shipped serializer already
buries `spentRuleIds` *inside* the authored record (V12), where record-channel
LWW would silently overwrite it.

*Fix.* (1) §3.2: add a node kind for an in-play rule instance, or bless
`narrative-node` for it. (2) State normatively that **engine state gating future
behaviour MUST be reified as a component write** — `mark x.aureum.spent` on the
rule node, in the same Event the rule fires. Aureum-side vendoring then adds
`spent` to `StepResult` and clones the RuleSet per branch.

### B4 — one `setLink` maps to four spec verbs with no discriminator; §16's table is non-deterministic

§16 lists `setLink` in **three** rows (`link`/`unlink`, `set` (containment),
`transfer` *(via 1:1 links)*), and §12.1 also folds `core.position` from
`set`/`link`. Aureum's link keys are free strings chosen by a human or an LLM
('location', 'owner', 'target'), and **nothing in the entity, the world or the
operation records which semantic a key carries** (V20, V21).

Two conforming Aureum emitters will therefore emit `owner` as `transfer` and as
`set core.possession`, `location` as `set core.position` and as
`link edgeType:"passage"` — different verbs, different fold rules, different
conflict keys, from one ruleset. That is §8's headline invariant failing at the
**emitter**, which no consumer-side diagnostic can catch.

*Fix.* Extend the vocabulary commit: a producer whose edges are key-addressed
MUST declare, per key, the verb and component it emits as —
`{"owner": {verb:"transfer", component:"core.possession"}, "location": {verb:"set", component:"core.position"}}`.
Undeclared keys fall to `link`/`unlink` with a synthesized stable
`edgeId = hash(subject, key)`. §16's three rows collapse to one deterministic rule.

### B5 — the open runtime vocabulary (tags; `setMeta`) has no conforming component model

**(a) Tags.** Any bare word becomes an `addTag` (V22) and rules invent tags
freely. §12.5 requires declaration before use, so every tag needs a declare — but
the spec supplies **two incompatible precedents and no rule for choosing**:
`core.membership` folds a set of strings as `set` (one component, one quad),
while `core.alive` is a per-flag component written by `mark`/`unmark`. Under the
set-folded reading, every tag write on an entity collides on one quad —
destroying §12.6's per-tag validity intervals and the merge granularity §12.4
advertises as an improvement. Under the flag reading they do not. Both are
conformant; **the same Aureum log folds two ways.**

**(b) `setMeta`.** It writes arbitrary `unknown` values at story time into a
field specified to authors as display data *not read by rules* (V23). A typed
§12.5 `declare` cannot describe `unknown`; by §12.7's test the write is a
component, by its own definition the target is a record, and §11.5's record
channel has **no story-time write path** (records carry no `at`). And the
`before` is not even reliably readable: `clone()` shallow-spreads `meta` (V9).

*Fix.* (a) Make the modelling normative: a set-of-strings membership vocabulary
MUST be emitted as one declared boolean-field component per member, not one
`set`-folded component — and restate `core.membership` in those terms or exempt
ref-sets explicitly. (b) Require a concrete declared field type for any
story-time write; a producer that cannot supply one MUST NOT emit it as a
component. Both are one paragraph and de-fork every open-vocabulary producer,
not only Aureum.

### B6 — silent skip of unknown targets makes the emitted log and Aureum's own world disagree

`applyChanges` skips any change whose target is absent (V2). An emitter built on
`match.resolvedChanges` emits a change Aureum never applied; an emitter built on
a world diff loses the rule's declared intent and can leave a fired rule with
**zero** changes, which §2 then rejects. §8.3's mismatch machinery is a
*consumer* obligation about `before`; §11.4 is about verbs. Neither covers a
producer whose local fold silently discarded a change it is about to publish.

This is not hypothetical: rules and ids are generated by an LLM from a free-form
prompt with no validation that a change target exists (`aureum-context.ts:116-136`),
so unresolvable targets are the expected steady state of the flagship use.

*Fix.* One sentence in §15's L1 row: **an emitter MUST NOT emit a change it did
not apply, and MUST surface an `unapplied-change` diagnostic** — the producer-side
twin of `before-mismatch`. Aureum side: `applyChanges` returns skipped changes,
`step()` surfaces them; with `create` added, a missing target becomes a `create`
or a rejected rule, never a silent no-op.

### B7 — `nodeKind` is a closed enum with no value for game-mechanical nodes and no extension escape

Every `create` requires a `nodeKind` from §3.2's enum. Aureum's canonical
generated world is *required* to contain a GAME entity, a PLAYER entity and cards
(`aureum-context.ts:108-112`) — none of which is a character, location, object,
organization, faction, creature, concept, artifact, media-asset, narrative-node,
fact, theme, audience or timeline in any non-arbitrary way. The shipped answer is
the adapter's first-non-denylisted-tag heuristic (V25), which yields out-of-enum
kinds like `card` and `game_state`. §12.8 opens `x.<vendor>.*` for components,
edge types and event kinds — **not for node kinds** — and §11.4 says nothing about
an unknown `nodeKind`. A card game therefore cannot emit a conforming `create`.

*Fix.* One clause in §3.2: node kinds outside the core enum are legal as
`x.<vendor>.<name>`, MUST be declared once under §12.5's four rules, and MUST be
tolerated by consumers as opaque nodes. Same selection pressure §12.8 already
applies elsewhere.

---

## §3 Explicitly NOT blockers

Named here so the count stays honest.

- **Identity (§3) is a vendoring concern, not a blocker.** Aureum's ids are
  author/LLM-chosen names (V19), which §3.1.2-3 forbids — but opacity is
  *compatible* with the engine, because every id use is byte-wise equality
  (`world.ts:137`, `evaluator.ts:262-263`). What is needed is an **alias layer**:
  DSL symbols become `name` in the record channel (§12.7), the emitter mints
  `<kind>_<ULID>` and holds a durable symbol→NodeId binding. The binding must be
  persisted, and today there is nowhere clean to put it (`Entity` and
  `SerializedEntity` have no external-id field). One live bug it also fixes:
  the adapter writes the **raw Aureum id** as the nit entity id (V26), so two
  games snapshotted into one repository collide on `PLAYER` — exactly §3.2's
  global-uniqueness requirement, violated today.
- **Links being 1:1 (§16 fn3) — verified, and sharper than stated.**
  `Map<string,string>` with overwrite semantics (V20) is genuinely 1:1 per key.
  But fn3's claim that *"nit's `Relationship` (which carries an `id`) is what
  closes this"* closes it only on the **nit** side. Aureum's world cannot *hold*
  two edges of one key, so `lower(2→1)` into Aureum would silently drop one. That
  is contained only because §15 targets Aureum at L1 (emit-only) — and it should
  be said out loud: **Aureum is not a viable L1r rehydration target until
  `Entity.links` becomes a multimap.** Not a blocker for the stated target.
- **Effects (§9.1) are a host obligation.** The module-global registry (V29) is a
  real hazard for a server running two worlds — handlers are keyed by type alone —
  but that is Aureum's bug, not the spec's, and §9.1's requirements (stable
  `${eventId}#${index}`, an atomic execution ledger) are satisfiable at the
  emitter since ids can be assigned at emission. One thing must be said plainly:
  **the adapter today turns side effects into graph writes** (V30) — effects *are*
  writers — which §9.1 forbids. The spec is right; the adapter is wrong; the
  vendoring deletes that path.
- **The record channel (§11.5): the adapter does not survive — it is replaced
  wholesale, and that is the correct outcome.** `snapshotWorld` writes a whole
  world as per-entity `ADD_ENTITY` commits with no `before` anywhere (V27,
  `adapter.ts:144-153`) — the whole-world-post-state semantics §6.3 charges
  against it by name — and `restoreWorld` scans only the last 100 commits, silently
  returning an **empty world** past that horizon (V28). What survives as seed
  material: `aureumToNit`/`nitToAureum`'s field mapping for the record channel,
  and `serializeRuleSet`'s shape as a `record@version` — **minus `spentRuleIds`**,
  which B3 moves to the component channel. **Are rulesets records under v0.5?**
  Yes by §12.7's test — authored, not moved by story events — except that one
  field, which is exactly why B3 is a blocker.
- **World parameters (§12.5.1): nothing breaks.** Aureum has no `mythos.params`
  equivalent, and needs none — the convention is a `GAME` entity whose stats hold
  the phase/round/tracker (`aureum-context.ts:108`), which are components on a
  node under this spec and *must* be, since §12.5.1 rejects conflicting
  redeclaration and therefore makes params immutable.
- **§8.2 duplicate-quad rejection vs the parser merging ops on one target (V24).**
  `PLAYER.hp+5 | PLAYER.hp-2` becomes one change with two ops on one quad, which
  §8.2 requires validators to reject — but §14 already gives the exact
  composition rule for `adjust` (summed `amount`). An emitter obligation, not a
  spec defect.

### Verifying §6.1 and §16's Aureum column, fresh

Both are **accurate**. Verified line by line: `ChangeOperation` is 7 variants
(V1); `applyChanges` handles those 7 (V2, cited as `:315-335`; the `setMeta` case
runs to `:337`); `createEntity` at `world.ts:22` is not rule-reachable (V3);
unknown targets are silently skipped (V2). `sideEffects ✅`, the empty
`create`/`destroy`, `reveal`/`conceal`, `merge`, `declare` and `causedBy` cells
are all correct. Three sharpenings:

1. **`spawn`/`destroy` is cheaper than §6.1 implies** — `World.add`/`World.remove`
   already exist (V3); only rule-reachability is missing.
2. **The `setLink` rows are the table's weak point** — one op, three rows, no
   discriminator (B4).
3. **`causedBy` is not as empty as it looks** — a host stepping a session can
   populate it from the previous Event in that session, which is honest
   provenance rather than an invention.

---

## §4 Underspecified — ranked

| # | Issue | Cost |
|---|---|---|
| U1 | **The rule-gate verdict has no home.** §11.2 names the `rule` gate as a stub and Aureum is the intended engine, but a gate verdict is neither a component write nor an authored record, and it cannot be an **effect** — §9.1 says effects never run on replay, while a canonization decision must be reproducible. §11.2's separate canonization record is a *recommendation*, not normative, and record-channel edit-time LWW is the wrong merge for it. | Highest — the one thing Aureum-as-gate must emit is unspecified |
| U2 | **May a `declare` appear in the same commit as its first use?** §12.5 says "declaration precedes use" and rule 4 says vocabulary accumulates in the commit. For any producer with a runtime-invented vocabulary (every Aureum tag and stat) auto-declaration at first use is mandatory. Say "precedes in commit order". | Blocks open-vocabulary emitters |
| U3 | **Are `magnitude`/`valence` REQUIRED?** §4 shows them unconditionally; §15's L1 row omits them. Aureum has no weighting on a rule (`rules.ts:64-76`), so its streams will carry none and Mythopia's `paceCurve` silently flattens to zero rather than erroring. | Silent analytical loss |
| U4 | **`participants` for a rule-emitted Event is undefined.** `RuleMatch.matchedEntities` is always `[triggerId]` (V31), so the honest set is *trigger ∪ change targets*. State it, or four producers invent four. | Divergent Event shape |
| U5 | **`granularity` still unenumerated** (Mythopia U10 unclosed) and no value exists for "no calendar" — the hole B1 falls into. | One line |
| U6 | **Clamping has no producer-side rule.** Aureum stats are an untyped `Map<string,number>` (`world.ts:16`); a ruleset writing `drama.*` diverges from §12.2's `clampedNumeric` unless the emitter clamps. Say the emitter MUST apply the declared fold's bounds before emitting `after`. | Numeric divergence |
| U7 | **`kind` derivation is asserted, never defined.** §4 says derivable from `changes` but gives no mapping; Aureum's only semantic hint is `rule.description`, free text (`rules.ts:75`). A default verb→kind table would cost a paragraph. | Label drift |
| U8 | **Auto rules are eligible through both entry points** (V32) — `evaluate`/`step` do not filter `auto_trigger`, so the same rule fires manually and per tick with nothing in the Event distinguishing them. | Provenance |
| U9 | **World-parameter mutability.** §12.5.1 rejects conflicting redeclaration, so params are immutable — correct, but unstated, and a ruleset that tunes a constant mid-campaign will misfile it. | One sentence |
| U10 | **`merge` has no Aureum path.** Ids are Map keys (`world.ts:78`); a read-time redirect has nowhere to live in the engine. Emit-only L1 makes this moot **today**, but the moment Aureum consumes a canon it must honour redirects. Flag it in §15's L1 row rather than leaving it implied. | Future |

---

## §5 What the spec gets right — do not change

1. **`adjust`'s authoritative field is `amount`, not `after` (§6.2).** This is
   exactly right for Aureum and costs nothing to conform to: `incrementStat`
   already carries a constant `amount` in the rule (V6), so `adjust` is the one
   verb Aureum emits *natively*, with no inference.
2. **Effects collected, never executed (§9), and `run_tool`/`emit_stimulus` are
   effects, not verbs.** This is Aureum's own design returning as normative text —
   `handleSideEffects` is a separate host call and `step()` merely collects
   (`evaluator.ts:81-91`, `:197-201`). §9.1's at-most-once clause is the part
   Aureum lacks and needs.
3. **§2's keystone MUST, kept as a MUST.** B2 asks for a *representation* for
   narrative beats, not an exemption. The moment a change-less Event is legal,
   Aureum becomes a narrative firehose with no state behind it — the exact
   failure the rule exists to prevent.
4. **`before` mandatory, and §8.4's stateful lift.** Cheap for Aureum precisely
   because `step()` clones (V8) — the pre-state is *already* retained. The spec
   asking for something a wrapper can supply, rather than something the rule
   language must, is the right cut.
5. **§8.1's sort key with a ULID tiebreak.** It is what makes B1's session model
   work at all: many Events can share one `t` and still fold deterministically in
   emission order.
6. **§12.7's boundary test, applied in both directions.** It is the only reason
   B3 is findable — spent-ness fails the test as a record, loudly, and an
   intuition-based split would have hidden it.
7. **§11.5's two channels, and the honest cost paragraph.** Rulesets are the
   textbook record: authored, versioned, cited as `record@version`, LWW-mergeable.
   The channel is what lets the vendoring delete the adapter's whole-world
   snapshots instead of dressing them up.
8. **§15 adding L1r, and *not* asking Aureum for it.** Correct: Aureum cannot
   rehydrate losslessly while `links` is 1:1 (§3). Asking a rules engine only to
   emit is the right scope, and the reason six of these seven blockers are one
   paragraph each.

---

## Appendix — independent verification (the three narrowed blockers, full notes)

### B1 — CONFIRMED *(all cited file:line assertions verified exactly as stated)*

### B2 — PARTIAL

Every cited fact checks out exactly as stated:

- aureum/tests/rules-evaluator.test.ts:266-276 — confirmed. `makeRule` (23-32) defaults `changes: []`; the test `'step returns side effects'` builds a rule with only `sideEffects` and asserts `result.sideEffects` on a rule that produced zero world changes.
- aureum/src/parser.ts:197-204 — confirmed. `narrative:` is parsed into `{type:'narrative', payload:{text}}` independently of any `changes:` section; a DSL rule can legally have a `narrative:` block and no `changes:` block.
- aureum/src/rules.ts:47-50 — confirmed verbatim: `SideEffect { type: string; payload: Record<string, unknown> }`.
- aureum/src/rules.ts:64-76 — confirmed verbatim: `Rule` has `id, trigger, conditions?, changes?, sideEffects?, priority?, oneShot?, description?` — no knowledge/fact/audience field.
- §16's own verified mapping table (CHANGE_RECORD_SPEC.md:1046) confirms the Aureum column for `reveal`/`conceal` is literally "—", and its row 1049 maps Aureum's `sideEffects` to `Event.effects` (§9), not to `Event.changes` — and §9/§4 make `effects` optional and non-load-bearing for the Keystone Rule. So the mapping the spec itself hands an implementer for `sideEffects` is, read literally, incompatible with §2 for exactly this rule shape. That part of the blocker's diagnosis is real and the spec does not currently reconcile it.

Where the blocker's REASONING overshoots: it frames the emitter's choices as only two — drop the beat, or invent a forbidden no-op change — by treating Aureum's bare `SideEffect` as the entire available context. It isn't. The actual translation happens in `RuleMatch`/`StepResult` (aureum/src/evaluator.ts:21-28, 151-159, 197-201), which the adapter/producer has full access to when it converts a rule firing into a nit Event. `RuleMatch.triggerId` and `matchedEntities` are real, non-invented entity ids already resolved by the engine (not present on `SideEffect` itself, which is what evidence item 3 examined, but present one layer up at exactly the point where an Event would be constructed). Combined with §3.2's "any producer MAY mint at the moment it emits `create`, without coordination" and §6.6's confirmation that a `reveal` audience can be any node (not a dedicated `nodeKind: audience` node), a producer can legally emit a two-Change Event: `create` a `fact` node holding the narrative text, then `reveal` it with `audience` = `triggerId`/`matchedEntities`. That is not an invented no-op — it's a genuine `core.knowledge` write — and it is exactly the generalization §2 itself prescribes ("it never emits prose unbacked by a graph change," §0/§2), not limited to literal spoken dialogue as the blocker's "speech act" framing implies. Note also that the existing (pre-spec) adapter already synthesizes fresh ids and structure out of a bare narrative `SideEffect` today (nit-aureum-adapter/src/adapter.ts:280-302, minting `interaction_${Date.now()}...`), so synthesizing a `fact_*` id the same way is precedented, not novel.

Net: the failure scenario is narrower than claimed — a workaround exists using mechanisms the spec already licenses (free minting + `reveal`'s unconstrained audience + `RuleMatch` context available to the producer), so "unavailable"/"unreachable" is too strong. But the blocker correctly identifies that (a) nothing in the spec text currently documents this create+reveal pattern as the required treatment for narrative-only rule shapes, and (b) §16's own mapping table points a naive implementer toward the incompatible `sideEffects→effects` mapping instead. So the proposedFix (or an equivalent clarification in §6.3/§16) is still a legitimate, worthwhile addition — just not because the gap is unclosable, but because the closure isn't written down and the spec's own mapping table currently points the wrong way.

### B3 — PARTIAL

All four cited evidence assertions are accurate exactly as stated:

1. evaluator.ts:186-201 — `step()` clones the World (`world.clone()`, line 187) but mutates the caller's `ruleSet.spentRuleIds` in place (line 194, `ruleSet.spentRuleIds.add(match.rule.id)`) on the *original* RuleSet object passed in, not a clone. `StepResult` (lines 21-28) has exactly `{world, match, sideEffects}` — no `spent` field. Confirmed.
2. world.ts:116-128 — `World.clone()` deep-copies only `entities` (tags/stats/links/meta); it has no knowledge of or reference to any RuleSet. Confirmed: all Worlds derived from one RuleSet share that RuleSet's mutable `spentRuleIds`.
3. rules-evaluator.test.ts:294-306 — the test literally passes the same `rules` object (not a fresh one) to both `step()` calls; `r2.match` is null solely because of the shared, mutated `spentRuleIds`. Confirmed as read.
4. serializer.ts:74-82 — `serializeRuleSet` returns one flat object with `rules` (authored) and `spentRuleIds` (runtime-derived) as siblings. Confirmed.

The underlying architectural point is real and well-taken: applying §12.7's own boundary test ("varies as a result of story events" ⇒ component) to `spentRuleIds` says it should not be flattened into the same blob as the authored `rules` array, and nothing in §16's mapping table (which only covers `ChangeOperation`'s 7 variants) accounts for rule-level gating state that lives outside any entity. That gap is genuinely unaddressed by the spec text and is a legitimate item for the "Aureum-side review" the spec's own status line says is still outstanding ("Remaining before lock: the Aureum-side review — the last unexamined implementer vantage," line 11-12).

Where the reasoning overstates reachability:

(a) Replay "silently diverges" today — not true of the actual shipped replay path. `deserializeRuleSet` (serializer.ts:84-88) restores the *entire* `spentRuleIds` Set atomically as part of one RuleSet blob, and the adapter (`nit-aureum-adapter/src/adapter.ts:155-168, 235-249`) round-trips that same blob via a single `ADD_ENTITY` snapshot (`__aureum_ruleset`), not via folding individual Change Records. So the "world rebuilt by folding the log has an empty spent-set" scenario doesn't occur in any code path that exists today — Aureum doesn't fold logs to reconstruct state, it snapshots. The scenario only becomes live if a future implementation replaces that snapshot with pure `lower(2→1)`-style rehydration from Change Records — which the spec does not currently require of Aureum: §15's conformance table sets Aureum's target at **L1 (Emit)**, explicitly not **L1r (Emit + Rehydrate)** — L1r is reserved for ArgOS. So no normative rule is violated by today's behavior.

(b) Forks "violate §7.1" — §7.1 (`fold(T,t) = fold(forkedFrom(T), min(t,forkAt(T))) ++ events(T,≤t)`) governs the *nit* Timeline node / Change-Record fold, a data-layer concept. It says nothing about Aureum's in-process `World`/`RuleSet` objects. A grep of both `aureum/src` and `nit-aureum-adapter/src` turns up **no fork/branch concept at all** — `World.clone()` today is used only internally by `step()`/`tick()` to produce the next linear world state, never to create two divergent branches. Nothing in the codebase or docs establishes "one Aureum World instance = one nit Timeline branch." STATE.md and TRANSMEDIA_INTEGRATION_REVIEW.md both list Aureum integration ("M3... vote gate + Aureum," "Aureum vendored (reflex layer)") as future work, not shipped. So invoking §7.1 as a rule *currently* being violated is a category stretch — it's the blocker's own (reasonable) prediction of what would break if Aureum forking is later implemented naively on top of shared RuleSet references, not a demonstrated present violation.

One more mitigating detail the review missed: `StepResult.match.rule` (and `TickResult.matches[].rule`) already exposes `rule.oneShot` (rules.ts:73) and `rule.id` per match. A consumer integrating Aureum with the record/component model could already derive "this event spent rule X" deterministically from each step's result — `match.rule.oneShot === true` on a non-null match — without any engine change. So the claim that spent-ness "lives in no channel" reachable from the API is slightly overstated; it lives in no *channel Aureum itself writes*, but it is derivable by an adapter today. The evidence's assertion that `StepResult` "returns no signal that a rule was spent" is true of a literal `spent` field but understates what's inferable from `match.rule.oneShot`.

Net: the code facts are all correct, and the design gap (no defined channel for engine-gating state, shared-by-reference RuleSet, blob conflates record+component data) is a real and worthwhile flag for the pending Aureum vendoring work. But the two concrete "silently diverges today" / "forks are not isolated under §7.1" failure scenarios are not currently reachable in the shipped system — the actual replay mechanism doesn't lose spent-ness, no fork feature exists to violate §7.1, and Aureum's stated conformance target (L1, not L1r) doesn't yet obligate log-only rehydration. The proposed fix (reify `spent` as a component write, add a rule-instance node kind) is a sound forward-looking recommendation, not a fix for an active bug.

### B4 — CONFIRMED *(all cited file:line assertions verified exactly as stated)*

### B5 — PARTIAL

EVIDENCE — all five citations check out as literal facts:
- parser.ts:318-321 — exact match, bare `\w+` word → `{type:'addTag', tag: part}`, no declaration step in the DSL.
- world.ts:13-20 — exact match, `Entity.tags: Set<string>`, `Entity.meta: Record<string, unknown>`.
- rules.ts:13-19 — exact match, `addTag`/`removeTag` take `tag: string`; `setMeta` takes `value: unknown`.
- world.ts:116-128 — exact match, `clone()` deep-copies tags/stats/links but does `meta: { ...entity.meta }` (shallow) at line 124.
- aureum-context.ts:23 — exact match, `meta` documented to authors as "display info, not used by rules".

REASONING — the failure scenario does not survive contact with the rest of the spec/codebase:

1. "Two incompatible precedents, no rule for choosing" (tags) is refuted by material the blocker didn't cite. §16's mapping table (line 1042) already normatively assigns Aureum's `addTag`/`removeTag` to the `mark`/`unmark` verb, not to `link`/`unlink`/`core.membership`. `core.membership`'s `set` fold is not an available alternate reading for bare tags at all: §5 (line 262) requires `link`/`unlink` to carry `subject`, `object`, `edgeType`, **`edgeId`** — a target node, an edge type, and an edge instance id. A bare Aureum tag string (`addTag('poisoned')`) supplies none of those; an implementer cannot even construct a valid `link` change from it without fabricating an object node and edge id from nothing. `mark`/`unmark` (line 261: `subject`, `component`, bool `after`) is the only verb whose required-field shape actually matches `addTag`/`removeTag`'s `{tag}` payload. So there is one selected path, not two conformant forks of the same log.
2. §12.5's `declare` mechanism is described explicitly as the answer to exactly this class of problem — "ArgOS invents components at runtime" / GodAI's `Paranoia` component — and its four rules (declare-before-use, idempotent, shape-locked, vocabulary-accumulates-in-commit) apply cleanly to Aureum's open tag vocabulary: one flag-fold component (or one flag-fold field of a shared component) declared per new tag word on first sight. Either sub-design (one component per tag, or one multi-field component with one flag-field per tag) preserves per-tag `(subject, component, field, object)` quads under §12.4/§12.6 — the "every tag write collides on one quad" collision the blocker describes does not occur under the verb the spec actually selected.
3. `setMeta`'s `unknown`-typed value is not the type-system dead end claimed. Concrete `setMeta` call sites always carry a concrete JSON value at runtime (string/number/boolean/object); nothing in §12.3 restricts the `type` field of a declared field to `number`/`boolean` only (only the *fold rule* set is closed — 8 named rules; `type` is never given a closed enum in the spec, and `core.appearance`/`core.motivation` are `scalarLastWrite` components that plausibly hold strings). An emitter can declare `meta.<key>` with the observed type and `fold: scalarLastWrite` the same way ArgOS's `Vitals.health` is declared — exactly the mechanism the blocker's own evidence (aureum-context.ts) shows exists for genuinely open vocabulary. If a key's shape drifts across writes, §12.5 rule 3 already rejects the redeclaration, which is precisely the "MUST NOT emit as a component, falls to record channel" behavior the proposed fix asks for — it doesn't need new normative text, it's already derivable.
4. The `clone()` shallow-`meta`-spread argument (evidence #4) is refuted by the actual write path: `evaluator.ts:335-336` does `entity.meta[op.key] = op.value` — a top-level key reassignment on the *cloned* object, never an in-place mutation of a nested value. Since `step()`/`tick()` (evaluator.ts:187,229) keep the pre-change `world` untouched and only mutate the freshly-cloned `newWorld`, reading `before` from the original world and `after` from the clone is reliable for every reachable `setMeta` call. The claimed "emitter cannot read a reliable before for structured meta" scenario has no code path that exercises it (no site mutates `entity.meta.<key>.<nested>` in place).
5. Independently, `meta` is documented (aureum-context.ts:23) as author-set display data "not used by rules" — its primary intended use (name, flavor, set once at creation) is squarely a §12.7 **record**, not a component, by the spec's own test ("varies as a result of story events?" → no). `setMeta` inside a rule's `changes[]` is a rare/edge path the type system permits but the system's own documented design discourages, further shrinking the practical surface of the problem.

Net: the evidence is accurate but the "no conforming component model / same log folds two ways" conclusion is overstated. The spec has already made the tag-modeling decision (§16 mapping to `mark`/`unmark`) and already supplies the open-vocabulary mechanism (§12.5 `declare`) the blocker says is missing; `core.membership` is a category mismatch, not a live alternate reading, because its verb (`link`/`unlink`) structurally cannot accept a bare tag. The `setMeta` typing concern is real in the narrow sense that the spec never spells out "infer type from the concrete value, fold as scalarLastWrite, else stay a record" as a worked example — a one-paragraph clarification (close to the blocker's proposed fix) would be a reasonable addition — but this is a documentation gap, not a blocking absence of a conforming model, since the mechanism to build that model already exists and is directly usable.

### B6 — CONFIRMED *(all cited file:line assertions verified exactly as stated)*

### B7 — CONFIRMED *(all cited file:line assertions verified exactly as stated)*
