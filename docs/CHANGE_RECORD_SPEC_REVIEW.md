# Review — `CHANGE_RECORD_SPEC.md` v0.1

**Reviewer**: Claude (ArgOS side), 2026-07-24
**Method**: seven adversarial passes over the spec, verified against shipped code in `narrative-canon/src/` and `argos/v2/src/`. Every claim below carries a `file:line`. Claims that could not be substantiated were dropped and are listed in §0.
**Verdict**: **not ratifiable as-is — five blockers, each a paragraph of prose, not a research project.**

This is a strong document. The conceptual architecture is right, and several decisions are better than anything any of the four systems has today. The problem is that four independent implementations built against v0.1 will not interoperate, and **every divergence I traced is silent** — no validator fires, no hash mismatches, no error surfaces. You find out months later when two runs of the same world produce different curves.

---

## 0. Verification log

### Substantiated by direct inspection

| Claim | Evidence |
|---|---|
| nit is **snapshot-authoritative**; ops are derived, not emitted | `src/git/format/v1/derive.ts:4-9` |
| `roundTripPreservesHash` has a metadata/formatVersion carve-out | `derive.ts:619-631` |
| Round-trip failure skips the **nit ledger row**; the studio's own save proceeds | `src/api/server.ts:562-565`, `:592` |
| `rule` gate is a hard-coded `approved:false` stub | `server.ts:4128-4129` |
| Gate is bound only via `sourceProductionId`; otherwise `creator`, which always approves | `server.ts:4158-4162`, `:4130-4132` |
| `WorldEventSchema.timelineId` is `.optional()`, **not** `.nullable()` | `schemas.ts:245` |
| `GraphOperationSchema` = exactly 19 variants | `schemas.ts:373-441` |
| `AuthorRefSchema.kind` = 3 values vs the spec's 6 | `schemas.ts:75-79` |
| `EventStateChangeSchema` = 9 kinds, free-text `detail`, no before/after | `schemas.ts:236-240` |
| `shallowChanges` records only `next` values — never a `before` | `derive.ts:179` |
| `worldStateAt` defaults `canonOnly:true`; `validateTemporalConsistency` defaults `false` | `derive.ts:524` vs `:572` |
| `promptHash` / `readSet` / `anchorHash` — **zero occurrences** in `src/` | grep |
| ID minting is `entity_<ms>_<8hex>`; no `chr_`/`loc_` prefix exists | `src/utils/ids.ts:19` |
| `CommitSchema` has no `formatVersion` though `NIT_FORMAT_SPEC.md:516-518` says REQUIRED | `schemas.ts:449-461` |
| Identity reconciliation ships as **silent ID rewrite** | `entity-similarity.ts:11`, `entity-merging-service.ts:227`, `git-chunked-extraction.ts:252,435` |
| `preconditions` (the `causedBy` analogue) is touched only by the migrator; no cycle check anywhere | `schemas.ts:250`; grep |
| A structured `Timeline{parentTimeline, branchPoint}` exists in the app layer, **unused by nit** | `src/canon-timeline-manager.ts:31-43` |

### Dropped — could not substantiate

1. *"MYTHOPIA_COMPARISON recommends the opposite authority direction from §6."* **False.** `docs/MYTHOPIA_COMPARISON.md:287-291` recommends the same direction. The migration-cost concern survives; the contradiction does not.
2. *"nit refuses no commits."* **Overstated.** The nit commit is genuinely refused (`server.ts:562-565`); what proceeds is the studio's separate project save. Rescoped into B5.
3. **All Aureum and Mythopia claims.** Neither repo is present locally. §15's mapping table and §5.1's "Aureum cannot spawn or destroy" are unverifiable here — see the process note in §3.
4. *"§13 squash has no implementation anywhere."* `src/git/types.ts:241` has `squash?: boolean`. The spec correctly attributes squash to Mythopia and does not overclaim.

---

## 1. Blockers

### B1 — `NodeId` is never defined, and the spec claims to satisfy the requirement that defines it

`NodeId` appears **three times** in 471 lines with no grammar, alphabet, uniqueness scope, stability guarantee, minting authority, or statement of opacity. §4's conformance table asserts ArgOS §6 req 1 is *"Satisfied by: `subject`/`object` are NodeIds"* — which is circular, because §6 req 1 is a pointer to ArgOS §4, and ArgOS §4 marks the format **[OPEN]** and ranks it *"blocks everything."*

The examples are internally inconsistent and wrong against the substrate: events are opaque (`evt_01J8…`) while nodes are name-derived slugs (`chr_malcor`, `loc_forge`) **in adjacent lines of the same JSON block**. The shipped scheme is `mintId('entity')` → `entity_<ms>_<8hex>` (`src/utils/ids.ts:19`); no per-kind prefix exists anywhere. And `EntitySchema.id: z.string().min(1)` (`schemas.ts:141`) validates every scheme equally, so divergence is silent.

The slug reading is not merely different — it is **unsound**. §11 states a node's `name` is mutable authored data; an ID derived from a mutable field is not durable. And slugs are deterministic on name, so two producers independently creating "Malcor" both mint `chr_malcor` — under §16's merge rule ("two branches writing different components of one node = no conflict") that **silently fuses two different characters** rather than raising a conflict. Opaque IDs fail safe here; slugs fail silent.

Already live on both sides: `src/extractors/character.ts:95-100` mints `char_${name.toLowerCase()}` and dedups on name normalisation (two same-named characters collapse at ingest); `server.ts:10585,10691` falls back to `e.name.toLowerCase().replace(/\s+/g,'_')`; ArgOS's entire mutation surface is name-addressed via `registry.byName` at 13 call sites in `god-agent.ts`.

**Cost now:** one paragraph. **Cost later:** four systems' persisted history re-keyed.

### B2 — The fold has no defined result

Three independent gaps producing one failure: **the same committed log folds to different state in different implementations, silently.**

**(a) No total order.** §6 calls `t` *"total"* but never states uniqueness, scope, or a tiebreak. `causedBy` is a partial order; the commit DAG is partial. So bi-temporality as specified supplies *no* total order. The one shipped fold invents a tiebreak the spec never mentions — `a.chronologyIndex - b.chronologyIndex || a.id.localeCompare(b.id)` (`derive.ts:539`, `:578`) — and lexical ID order is arbitrary with respect to story. Given event A (`t=412`, no date) and B (`worldDate:"3019-01-15"`, `t=400`), ordering by the "authoritative" clock is undefined.

**(b) `adjust` is over-determined with no stated winner.** §5.2 requires `before`, `after` *and* `amount`. Two producers read `core.trust=0.4` and emit at the same `t`: A `{before:0.4, after:0.1, amount:-0.3}`, B `{before:0.4, after:0.6, amount:+0.2}`. Folding `state = after` → 0.1 or 0.6 (one delta silently discarded). Folding `state += amount` → 0.3 (both applied; every `after` in the record is now a lie). Both readings are defensible from the text, and nothing validates `before` against running state. Note IEEE-754 makes a naive `before + amount === after` check reject the spec's own §13 example.

**(c) The fold's input set is unspecified.** §11 and §14-L2 never say whether the fold includes drafts. The reference implementation disagrees with *itself* in the same file: `worldStateAt` defaults `canonOnly:true` (`derive.ts:524`), `validateTemporalConsistency` defaults `false` (`:572`).

**Fix.** State the sort key normatively (`(worldDate ?? derive(t), t, eventId)` with `eventId` REQUIRED lexicographically monotonic); state the intra-Event rule (`changes` apply in array order; an Event MUST NOT contain two changes to one `(subject, component, object)` triple); declare **one authoritative field per verb** (`amount` for `adjust`, `after` for `set`/`transfer`) with a float tolerance; specify `before` as an **assertion** with a stated mismatch policy; declare the fold's default event set.

### B3 — §5 is being ratified as closed with no identity-reconciliation verb

§5 says **"Do not extend this list."** There is no `merge`, `alias`, or `redirect`. None of the escape hatches work: a component write cannot express it (a merge rewrites the *key space*, not a value); `destroy(a)+create(b)` loses every prior reference (`participants`, `causedBy`, `core.position` values, `readSet.node`) and destroys §13's invertibility.

This is not hypothetical. Identity reconciliation **ships today**, performed by exactly the history rewrite §11/§13 forbid:

- `src/core/entity-similarity.ts:11` — `suggestedAction: 'merge' | 'alias' | 'review' | 'separate'`, the vocabulary the spec lacks, already in code
- `src/git-chunked-extraction.ts:252,435` — builds an old→canonical ID map on name similarity (>0.8) and rewrites entity IDs *and* both relationship endpoints before commit
- `src/services/entity-merging-service.ts:227` — writes a `canonicalEntityId` redirect, then `updateMany`s every endpoint in place

So the system has **both** mechanisms — redirect and in-place rewrite — and the interchange format can express neither. The single most consequential class of edit ("these two characters are one character") never appears in the log, cannot be replayed, blamed, reverted, or seen by §12. This makes §11's *"change records are the only writers"* false today.

**Ratifying "closed" forecloses adding this without breaking the contract all four implementers built against.**

**Fix.** One core verb: `{verb:"merge", subject:<survivor>, object:<absorbed>, before:<absorbed props>, after:null}` with three normative rules — the absorbed NodeId is never deleted but becomes a permanent redirect that MUST resolve on read; resolution is transitive and cycle-checked; references resolve *through* the redirect at read time and MUST NOT be rewritten in place.

### B4 — Replay may re-execute effects

§7 says effects are *"collected, never executed"* by the writer and a *"registered consumer decides whether to run them."* §11 says replay means *"Rebuild the world at t=412."* **Nothing states that fold / replay / checkout / lower(2→1) / migration MUST NOT dispatch `Event.effects`.**

Credit where due: the state fold is safe by construction — §11 excludes effects, so re-deriving *state* never re-fires anything. But "rebuild" and "replay" are exactly the words an implementer reads as "re-do what happened," and a migration tool or branch-materialisation routine that walks the Event list and dispatches every `effects` entry is a correct reading of the text. `channel.post` posts to a real account a second time. `render.panel` bills a paid model a second time. Both irreversible — and they are the spec's own two worked examples.

There is also **no idempotency primitive**: no effect id, no key, no receipt. A consumer that executes an effect, succeeds, then crashes before committing the returning Event has nothing to check on restart; two replicas watching the stream both pick up the same Event.

**Fix.** Add §7.1: *"Effects execute at most once, driven by commit arrival, never by replay. Fold, replay, checkout, lower(2→1) and migration operate exclusively over `Event.changes`; `Event.effects` is opaque historical data once committed."* Give each effect a stable id (`${eventId}#${index}`) and require a consumer-side execution ledger checked-and-marked atomically around dispatch.

### B5 — §4/§5 disagree on the record shape, and §9 misstates nit's readiness

**§4 vs §5 — four contradictions a validator author hits on day one.** It is a discriminated union on `verb` and the spec never says so.

1. **`transfer` inverts `object`.** §4 says `object` is the *"relation/transfer target"*; §5.3 says `transfer` takes `object` (**item**) with `before`/`after` as holders. A producer writes the recipient, a consumer reads the item — the coins end up held by the coins.
2. **§4's shape is missing fields §5 requires:** `nodeKind`, `edgeType`, `payload`, `audience`. A validator built from §4 rejects every `create`, `link` and `reveal`.
3. **`audience` vs `hidden_from`.** §5.3's table names the field `audience`; the prose two lines below says *"`conceal` records `hidden_from`."* Two wire names for one slot in a normative section, neither typed — and the hash gate will treat them as different content, so concealment silently vanishes across the seam, breaking exactly the spoiler check and dramatic-irony ordering §5.3 cites to justify core status.
4. **§14-L1's blanket `before`/`after` contradicts §5.** `create` has no `before`, `destroy` no `after`, `link`/`unlink` neither. §4 hedges with "every value-bearing verb" and never defines the term; §14 drops the hedge.

Also: `link` carries **no edge identity**, so `unlink` cannot address a specific edge in a multi-edge graph — contradicting §15's claim that nit's `Relationship` (which *does* have an `id`, `schemas.ts:165`) closes Aureum's 1:1 gap. The verb as defined is 1:1-shaped.

**§9's "already exists as nit and is unchanged by this spec" is materially false**, and it is the sentence most likely to cause a planning error, because it tells three teams the substrate is done.

`WorldEventSchema` (`schemas.ts:242-257`) has **none** of: `author`, `causedBy`, `magnitude`, `valence`, `at`/`worldDate`/`granularity`, `changes`, `effects`, structured `location`. What exists is `stateChanges[]` — a 9-value enum with free-text `detail` and no before/after (`schemas.ts:236-240`) — i.e. precisely the *"our `stateChange.detail` was prose"* defect §4 cites as proven. `AuthorRefSchema` is 3 kinds against §8's 6, so CANON §6 req 4 is presently unmet. Neither `NIT_FORMAT_SPEC.md` nor `schemas.ts` contains any notion of a **component** or a **fold**.

Mapping §5's 11 verbs onto the cited 19 op types: **6 of 11** (`adjust`, `mark`, `unmark`, `transfer`, `reveal`, `conceal`) have no nit op at all. Every `UPDATE_*` carries `changes: Partial<T>` with new values only — `shallowChanges` never captures a `before` (`derive.ts:179`). Conversely **10 of 19** nit ops (Scene/Frame/StyleProfile/Scratchpad) have no verb analog because they operate on altitude-3 material §1 puts out of scope. Only ADD/REMOVE_ENTITY and ADD/REMOVE_RELATIONSHIP map plausibly, and those carry whole documents.

Two accuracy corrections in the same section:

- **The hash gate is narrower than stated.** *"Refuses any commit whose operations do not reconstruct the snapshot exactly"* is true of the **nit ledger row** (`server.ts:562-565` returns null) — but the studio's own project save proceeds regardless, deliberately (`server.ts:592`: *"The nit ledger must never block the studio's own commit flow"*). Drift is absorbed into the next successful entry with only a `console.error`. The reconstruction is also not total: `metadata` and `formatVersion` are pinned to `next` before comparison (`derive.ts:621-629`), so drift in those fields is structurally invisible. And it is application logic at one route, not a library-level property — any producer calling nit directly gets none of it.
- **§9 never says where a Change record lives in nit's op model.** The two answers are incompatible: a field of the `WorldEvent` payload inside `ADD_EVENT`/`UPDATE_EVENT`, or a new top-level `GraphOperation` kind. They hash differently, diff differently (under the first, an appended change is a whole-array replacement, `derive.ts:331-344`), and merge differently.

**Fix.** Publish §4/§5 as `z.discriminatedUnion('verb', […])` — the precedent is your own `schemas.ts:373` — with a normative four-column table (required fields, before/after value type, compose rule, invert rule). Pick one name for the concealment audience. Give `link` an edge id. Delete "unchanged by this spec"; state the target `formatVersion`, name the fields being added, deprecate `EventStateChangeSchema` by name, pick where changes live, and restate the gate's actual scope.

---

## 2. Underspecified — condensed

Ranked by likelihood of causing divergence.

| # | Issue |
|---|---|
| **U1** | **`"timelineId": null` fails your own validator.** §3's example writes `null`; the schema is `.optional()` (`schemas.ts:245`), and zod rejects `null` for `.optional()`. Worse, `canonicalize.ts:44-61` strips only `cachedUri` and `extensions.studio`, so `{timelineId:null}` and `{}` hash differently. Same for `causedBy: []` vs absent. This class of bug has already fired — `derive.ts:130-137` carries a comment recording it. **Mandate that absent/`null`/`[]`/`{}` all canonicalise to ABSENT before hashing.** |
| **U2** | **`before` has no defined window at the lift.** Trust falls 0.7→0.65→0.6→0.45→0.2 over five ticks; the lift cuts one Event. Three defensible readings; only one preserves §13's contiguity and §4's invertibility: **`before` is the `after` of the previous altitude-2 Event on that triple.** That requires a shadow map of last-emitted values the runtime does not have — so say so: **the lift is stateful.** This, not thresholds, is the part of the lift that must be in the contract; §17 Q4's thresholds can stay per-world. |
| **U3** | **`timelineId` has no model** — no `forkedFrom`, no `forkPoint`, no statement of whether a fork **inherits** the canon prefix. The shipped fold partitions (`derive.ts:536`), the word "fork" implies inheritance. ArgOS boots an authored fork and gets an empty world; the Studio renders the same fork with full history; neither is wrong per the spec. §16's merge rule also **omits `timelineId` entirely**. Note you already have `Timeline{parentTimeline, branchPoint}` at `canon-timeline-manager.ts:31-43`, unused by nit — two timeline models, one structured and unversioned, one versioned and structureless. |
| **U4** | **Canonization is a hashed mutation performed by something that is not a change record.** `status` is inside the hashed `WorldEventSchema` (`schemas.ts:252`) and `canonizeEventCore` mutates in place (`server.ts:4145`). So a canonization commit carries zero change records — contradicting §11. It is also a *transaction-time* fact on a *valid-time* record, so "what was canon last Tuesday" is unanswerable, and uncanonize is destructive (`server.ts:4260-4262`). **Recommend: make canonization a separate hashed record pointing at the Event and derive `status`.** The gate design itself is right — this is about where the flag lives. |
| **U5** | **"A declared fold rule" is a promotion criterion for a thing never defined.** §10's own table gives five different reducer semantics in English prose; `drama.stakes` "ratchet — rises, rarely falls" is not implementable, and if it clamps it is no longer invertible (§4) or composable (§13). **This is where the spec and ArgOS are most deeply incompatible:** ArgOS invents components at runtime (76 definitions in `v2/data/components/`, each only `{name, properties}`), so criterion (b) is *unsatisfiable* for anything GodAI invents, and the stream has no record type for declaring a component at all. A run that invents `Paranoia` at t=200 produces a stream no receiver can replay past t=200. **Fix: make fold rules data** — a small closed set (`flag`, `scalarLastWrite`, `numeric`, `set`, `ref`, `scopedNumeric`) — and add a vocabulary-declaration record so a runtime-invented component travels with its own fold rule. ArgOS CANON §16 already calls this a **vocabulary commit**; the two documents were converging on it from opposite sides. |
| **U6** | **§12's "and nothing else" makes precise invalidation *unsound*, not merely imprecise.** Under-invalidation from identity rewrite (B3) leaves panels depicting a pre-merge face forever with no stale flag; canonization changes the canon-only fold without writing any component, so it invalidates nothing; read-set entries carry no `timelineId`; retcons have no `t` to key on. **§17 Q1 (validity intervals) should be *closed*, not deferred** — §12 and §16 both already depend on it. Also note §12 is entirely greenfield: `promptHash`/`readSet`/`anchorHash` have zero occurrences in `src/`, and today's mechanisms are whole-entity dirty flags (`server.ts:12149-12179`) and whole-event staleness (`server.ts:3983`). Flag it as new construction the way §5.1 honestly flags the Aureum gap. |
| **U7** | **§1's "lift" and §9's "lift filter" are two different filters with the same name**, with opposite loss semantics: a lift rejection is irreversible (altitude 1 stays in a local ring buffer), a gate rejection is reversible. And §9's mechanism **cannot do the job for the producer it names**: `canonizeEventCore` selects the gate as `production?.canonGate \|\| 'creator'` and only looks up a production when `event.sourceProductionId` is set (`server.ts:4158-4162`) — §8 gives simulation events `productionId: null`, so every ArgOS event falls to `creator`, which approves unconditionally. And the `rule` gate is a stub hard-coded to `approved:false`. **The filter §9 assigns the firehose to is both unreachable and unimplemented.** |
| **U8** | **§13's "composition is exact" holds only for numeric `adjust`.** `create`+`destroy`, `link`+`unlink`, `transfer(A→B)`+`transfer(B→A)` all compose to zero changes — which §2 says MUST be rejected. `link`/`unlink` carry no before/after at all. `reveal`+`conceal` is set-valued and composes to a per-audience map, not one change — and narratively "A knew, then was deceived" squashes to "A never knew," destroying the irony the verb was promoted for. `magnitude`/`valence` have no composition rule, yet Mythopia's kernel is not invariant under replacing N impulses with one. **Restate §13 per verb-class; fix the doctrine's scope, not the doctrine.** |
| **U9** | **§2 makes ordinary dialogue unrepresentable.** A line that reveals nothing and changes no value is the most common beat in a book, and §0 makes ingest first-class. Either the beat is dropped or producers invent no-op backing changes — the exact cargo-cult pollution §10 exists to prevent, arriving through a schema check. **Cleanest fix: declare a speech act *is* a knowledge write** — `reveal(factId, audience)` where the fact is the utterance. Dialogue becomes backed by construction and §2 keeps its MUST with no exception. |
| **U10** | **`t` cannot be both derived from `worldDate` and a stable read-set key.** If `t` is a rank derived from the date, inserting a prequel renumbers everything after it and every stored read-set silently re-points. If it is a stable date encoding, it collides massively at `beat` granularity. There is also no derivation function, no epoch, no calendar, and no rule for mixed dated/undated populations — and the only shipped fold ignores `worldDate` entirely. **Recommend: demote `worldDate` to a non-ordering field** (authoritative for story-day *arithmetic*, which is §6's real argument) and make `t` the sole ordering key: author-assigned, sparse, immutable once committed. |
| **U11** | **`causedBy` acyclicity and dangling-cause are asserted, never enforced or defined.** No check exists — not the hash gate, not `validate.ts:43` (pure zod), not `validateTemporalConsistency` (only `participant-dead`/`duplicate-death`). `preconditions`, the shipped analogue, is touched only by the migrator. The cycle-producing construction is the one §16 defers: amend E1→cite E2 on branch A, E2→cite E1 on branch B; neither branch is cyclic, the merge is. Dangling has four defensible resolutions and the spec picks none. |
| **U12** | **No `specVersion` on the wire.** §5 closes the verb list; unknown *kinds* and unknown *namespaces* have rules, unknown **verb** — the case that actually breaks the fold — has none. And the precedent failure has already happened one layer down: `CommitSchema` has no `formatVersion` despite `NIT_FORMAT_SPEC.md:516-518` saying REQUIRED. Add it now while it costs one defaulted field, and state that an unknown verb is **reject, not skip**. |
| **U13** | **`core.trust` — the spec's own flagship example — is not in §10's core table.** By the spec's own rule it should read `x.???.trust`. There is no core component for relationship affect at all, though §5.4 makes `relationship.formed`/`strained` core kinds. Every system has this state (ArgOS `Knows{familiarity, sentiment}`, nit `Relationship.strength`), so it already clears §10's own promotion bar. Adjacent: `core.possession`'s "shape" is *"via link/transfer"* (a mechanism in a shape column — a consumer reading it from the fold finds nothing); `core.position` and `core.containment{mode:"spatial"}` are the same fact with no precedence rule; `mark`/`unmark` are core verbs with **no core target**. |

---

## 3. Process note

**Aureum and Mythopia are not present in this workspace.** §15's mapping table and §5.1's *"Aureum cannot spawn or destroy"* are unverifiable here. Two of the four ratifying parties' models are unaudited by the document that unifies them. **Get a maintainer from each to sign their §15 row before ratification** — cheap insurance against a table four teams will treat as authoritative.

Also recommended: **downgrade §12 and §16's merge rule to "draft, non-ratifiable"** rather than shipping them as commitments. Both become correct with one paragraph each.

---

## 4. What it gets right — do not change these

1. **§2: "An Event carrying zero Changes is invalid and MUST be rejected at commit."** The load-bearing idea, and the reason the rest coheres — it converts a never-enforced convention into something a validator refuses. Someone will propose softening it to a warning to accommodate dialogue. Don't; fix dialogue via U9 and the squash-identity collision via U8. Keep the MUST.
2. **Mandatory `before` *and* `after`.** A reviewer optimising payload will call `before` redundant-with-replay. It is not — recovering it requires the fold, which is exactly what you cannot assume at the lift. Verified that the three-system post-mortem is real: `shallowChanges` captures only `next` (`derive.ts:179`), `EventStateChange.detail` is free text.
3. **§7: effects collected, never executed** — and the ruling that `run_tool`/`emit_stimulus` are effects, not verbs. This is the boundary that makes §2's completeness survive side effects. ArgOS has adopted it verbatim in its own §6.5.
4. **§13: squash is a view, never a rewrite.** Non-destructive is the reversible default. This will come under storage pressure.
5. **§10's promotion rule.** Selection pressure written into the format is rare and is the right answer to "generation without selection." Someone will want it relaxed to unblock a ship date — complete it instead (U5), hold `core.*` to the same standard, and extend it to edge types and event kinds.
6. **§9's two-tier canon/production split**, with the honest admission that a paid non-deterministic clip is where "documents are views" breaks. Collapsing to one tier is the obvious simplification and would be wrong. It matches the shipped boundary: `ProjectProduction` genuinely has no field in `NarrativeSchema`.
7. **§9's canonization language.** Verified shipped almost field-for-field at `server.ts:4100-4210`. This is a spec correctly generalising proven machinery rather than inventing a ninth model. U4 changes *where the flag lives*, not the gate design.
8. **§11: "Authored records are not components."** A reviewer will want to dissolve name/description/portrait into components for uniformity. Don't — it buys nothing and breaks every editor. The gap is that records aren't citable by §12; give them a `record@version` identity rather than dissolving them.
9. **Mood is derived, not a component.** There will be repeated pressure to add `core.mood`. Refuse it.
10. **§6's three-clock separation**, especially `causedBy` as a third independent order that need not agree with story time. Causality-implies-precedence is the obvious simplification and is wrong for reveals, prophecy and foreshadowing — the three things this format exists to represent. U10 attacks the *authority* claim, not the separation.
11. **Separating authorship (§8) from canonization provenance (§9).** Two genuinely different facts every prior attempt conflated.
12. **§17 Q3** (`kind` is a label, derivable, never trusted over `changes`) — correct, and it should be **promoted from an open question to a normative MUST**. The fix for `magnitude`/`valence` is to extend the same logic, not reverse it: four producers estimating on private scales, summed into one exponential, is noise with a decay constant. Make them `{value, basis, confidence, scale}` hints and require consumers to be able to compute from `changes` alone.

---

## 5. Two open questions closed

**§17 Q2 — `reveal`/`conceal` are NOT redundant with knowledge-as-component.** Apply §11's own rule: state is folded from changes, never stored. The **verb is the writer**, the **component is the fold** — identical to `adjust` writing and `core.trust` folding, and to `core.possession` which §10 already describes as *"via `link`/`transfer`"*. The apparent redundancy is an artefact of §5 tabulating verbs and §10 tabulating components with nothing stating that every core component names the verbs that write it. Deleting them would collapse *concealed* into *unknown*, destroying the dramatic irony that justifies core status. The real question underneath — why knowledge needs its own verb rather than `set` — is worth writing down: the write is audience-scoped, so a generic `set` would require supplying the whole post-state for every audience, which is whole-world-snapshot semantics, the exact defect §4 charges against Aureum's adapter.

**§17 Q1 — validity intervals should be closed now, not deferred.** §12's precision guarantee and §16's merge rule both already depend on the primitive ("the same component over **overlapping validity** = a real conflict"). Deferring it doesn't defer a nicety; it leaves §12's headline guarantee unimplementable.

---

## 6. The one thing

**Write §4.0 — Identity — before anything else, and make it normative.**

Six sentences that close what ArgOS's own canon calls the thing that blocks everything:

1. **Grammar and opacity.** `NodeId ::= <kindPrefix> "_" <ULID>`, compared byte-wise. Consumers MUST NOT parse beyond the prefix, and MUST NOT derive an ID from `name` or any other mutable field. *This single clause kills the slug reading and every rename / collision / silent-fusion failure that follows from it.*
2. **Uniqueness scope.** Globally unique across every world, branch, repository and producer — explicitly widening `NIT_FORMAT_SPEC.md:62`'s per-narrative scope.
3. **Minting.** Any producer MAY mint at the moment it emits `create`, without coordination; ULID entropy makes independent minting collision-free.
4. **`nodeKind`.** One enum, reconciled between ArgOS CANON's 6 kinds and `schemas.ts:126-136`'s 9 `EntityType`s — note CANON's `narrative-node`, which §10's whole `drama.*` story depends on, has no nit type at all.
5. **`merge`.** One added core verb, absorbed ID kept as a permanent, transitively-resolving read-time redirect, never rewritten in place.
6. **Fix the examples** so nobody copies the slug pattern.

ArgOS will conform to whatever this says. It currently has no durable node identity at all — it serialises the raw recycled BitECS eid — so it is the producer with the most to change and the least to unlearn. Name the grammar and we will implement it.
