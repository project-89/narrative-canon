# Review — `CHANGE_RECORD_SPEC.md`, from the Mythopia side

**Reviewer**: Claude (Mythopia side), 2026-07-27
**Method**: adversarial pass over spec v0.2/v0.3 against Mythopia at source
(`src/core/{types,store,time}.ts`, `src/engines/*`, `src/linter/rules/*`,
`src/edition/engine.ts`, the Fellowship fixture and `test/*`). Every claim
carries a `file:line`; unsubstantiated claims were dropped and are listed.
**Verdict**: **not ratifiable as-is — 6 blockers.** Two change numbers the
Fellowship fixture's own tests assert; one makes a fully L1-conformant stream
unloadable by `CanonStore`.

**Disposition**: all six accepted and closed in spec **v0.4**. The sharpest
claims (clamped fold, `resolvedPeaks`, `known`/`hidden` as separate
first-write-wins maps) were independently re-verified against the cloned source
before acting.

---

## §0 Verification log

Substantiated by direct inspection (selected):

| # | Claim | Evidence |
|---|---|---|
| V1 | Mythopia sorts its log **solely** by `toDays(world_date)`, tie-broken by authored array index — no ordinal exists | `store.ts:86-89`; `time.ts:23-36` |
| V2 | `StoryTime` has **no `t` field** — only `world_date` + optional `granularity` | `types.ts:13-17` |
| V3 | `toDays` **throws** on an unparseable date; the constructor calls it for every event unconditionally | `time.ts:25`; `store.ts:86` |
| V5 | The fold **clamps tension and stakes to [0,1]** | `store.ts:225,231,292-294` |
| V6 | Clamping is load-bearing: `arc_frodo_burden` deltas sum to tension **1.05**, stakes **1.20**; tests assert **1.0** and **1** | fixture `:268,344-577`; `test/fellowship.test.ts:74,77-81` |
| V7 | `resolvedPeaks` captures tension+stakes **before** zeroing; convergence reads it | `store.ts:238-247`; `convergence.ts:31-33` |
| V8 | Deltas apply **before** resolution, so the resolving event's own spike is inside the captured peak | `store.ts:222-233` then `:238-247` |
| V9 | `evt_011` peak = 0.90 × 0.90 = **0.81**; squared over 5 intensities = **0.131 of the asserted C=0.37** (~35%) | fixture `:335,429-450`; `test/fellowship.test.ts:135-139` |
| V10 | `M(t)` needs three **authored-record** inputs: `λ`, per-location `atmosphere.mood_baseline` (resolved up the *time-varying* containment chain), `Thing.mood_emission` | `curves.ts:88,95,101-106`; `query.ts:73-85` |
| V12 | A **single** `KnowledgeEntry` carries `learners` and `hidden_from` at once, and the fixture uses it | `types.ts:29-33`; fixture `:441` |
| V13 | `conceal` does **not** undo `reveal` — `hidden` is a separate map, `known` is never cleared, `knows()` reads only `known` | `store.ts:256-265`; `query.ts:103-107` |
| V14 | Knowledge is **first-write-wins with a timestamp**, not a set | `store.ts:259,263` |
| V16 | Windowed signals are story-**day** arithmetic: salience 30d, pace 14d, theme 45d | `curves.ts:122,140,156` |
| V17 | Linter rules 3, 4, 7, 8 are story-day *distance*, incl. `log(10)/λ` and Dijkstra over `traversal.days` | `fabula.ts:98,121,171,219`; `query.ts:195-263` |
| V18 | Every one of the 15 fixture events carries ≥1 `arc_delta` — **none would be rejected by §2** | fixture `:344-577` |
| V19 | `Fact`, `Theme`, `Audience`, `Edition` are first-class Mythopia ids | `types.ts:185-190,254-263,380,313` |
| V22 | Edition `compressions` **remove** a span from the telling and stand in causally — they do not compose changes | `types.ts:308-311`; `edition/engine.ts:146-158` |

**Dropped — could not substantiate**: that `t`-vs-date disagreement already
occurs in Mythopia (it cannot — there is no `t`; the divergence is prospective,
on ingest of a conformant stream); whether arcs other than `arc_frodo_burden`
exceed the clamp (only that one was hand-summed; the suite was not executed);
the exact post-change `C(evt_011)` (the test is 1-decimal precise, so only the
peak's *absolute* contribution is a hard number); anything about ArgOS or Aureum.

---

## §1 Blockers

**B1 — `worldDate` optional at L1, but Mythopia cannot fold without it.**
§15's L1 obligation omitted `at.worldDate`. A producer emitting `at: {t: 412}` is
conformant and produces a stream `CanonStore` **throws** on at construction (V3),
before any engine runs — losing every windowed signal and day-distance linter
rule (V16, V17), i.e. Mythopia's entire analytical layer. *Fix: REQUIRED at L1,
grammar pinned — "a calendar position" with no stated grammar is not
arithmetic-capable, and "Third Age 3019" would otherwise be legal.*

**B2 — demoting `worldDate` from ordering splits the fold in two.**
The spec orders by `t`; Mythopia orders by date (V1). They agree only while `t`
is monotone in date — which §7 does not require and in fact discourages (sparse,
author-assigned, motivated by *insertion*). A retcon with `t=1600,
worldDate="3018-01-01"` applies **last** in one and **first** in the other,
violating §8's headline invariant by construction. Worse, Mythopia mixes the axes
*inside one signal* — arc prefixes by log index, windows by date subtraction — so
under disagreement a curve point can contain a later-dated event's tension while
excluding it from the window: non-monotone in its own x-axis. Note the
*legitimate* disagreement case (telling order vs chronology) is already handled
elsewhere, as an Edition's `sequence`. *Fix: `t` and `worldDate` non-decreasing
together, checked at commit and re-checked at merge.*

**B3 — `numeric` contradicts Mythopia's clamped fold, in the reference fixture.**
On `arc_frodo_burden` at `evt_015`: asserted tension **1.00** / stakes **1.00**
versus spec-`numeric` 1.05 / 1.20 — felt intensity 1.00 vs 1.26, convergence
contribution 1.00 vs **1.5876** (V5, V6). Convergence *squares* intensity and
compares against an absolute 0.15 threshold, so this is not a cosmetic scale
difference: it changes which events are climaxes → edition unit boundaries → the
chaptering of the output. Two conforming implementations, one log, different
books. *Fix: add `clampedNumeric` with declared bounds; state the honest cost
that clamped `adjust` is not commutative, rather than resolving toward `numeric`
by fiat.*

**B4 — no way to capture pre-resolution intensity; convergence loses ~35% of
Moria.** Resolution zeroes tension, so the resolving event contributes exactly
zero without `resolvedPeaks` (V7, V9), and "Gandalf falls at Khazad-dûm" stops
being the twin peak the fixture exists to demonstrate. The near-miss is `before`,
but §8.3 explicitly labels it advisory and requires consumers to tolerate
mismatch — a load-bearing signal cannot rest on it. Second, sharper hazard: §8.2
makes intra-event order free, so emitting `set drama.state=closed` before the
`adjust +0.50` yields a peak of 0.36 instead of 0.81 — a 5× swing in the squared
term from array order alone. *Fix: normative intra-event ordering (all
`adjust drama.*` before any `set drama.state`) + `drama.peakAtResolution` as a
derived read.*

**B5 — one `audience` field makes the fixture's flagship irony invalid, and
`conceal` is not `reveal`'s inverse.**
(a) A single `KnowledgeEntry` reveals to some knowers while concealing from
others atomically (V12) — the Council learns Boromir desires the Ring while it is
hidden *from Boromir*. Under §5 that is two changes to one
`(subject, component)`, which §8.2 requires validators to **reject**.
(b) `hidden` is a distinct map and `known` is never cleared (V13), so after
reveal-then-conceal Mythopia answers *true* and a conforming consumer answers
*false* — silent POV/irony divergence with no diagnostic. Mythopia's semantics
are deliberate: `hidden_from` means *shielded*, not *un-known*, which is why
`evt_011` carries `{hidden_from:[chr_fellowship], fact: fct_gandalf_survives}`
with **no learners at all**.
(c) `set` is the wrong fold rule — the cell is a `Map<factId, storyTime>` with
first-write-wins (V14), and the *when* is what makes irony a step function.
*Fix: `audience` joins the conflict key; `conceal` shields and MUST NOT retract a
prior `reveal` (complementary, not inverse); add `timestampedSetFirstWrite`.*

**B6 — the mood kernel is not computable from change records.**
`M(t) = B + Σ vᵢmᵢ·e^(−λ(t−tᵢ))` needs `λ`, the nearest-ancestor
`atmosphere.mood_baseline` (resolved through the *time-varying* containment
chain), and `Thing.mood_emission` — all on authored records (V10), which §12.7
rules out of the component channel while the spec defines no record channel at
all. Compounding it, §4 demoted `magnitude`/`valence` to private-scale hints
while Mythopia consumes them verbatim: `paceCurve` sums magnitude, linter rules 1
and 7 threshold on magnitude and |v×m|, and **edition register caps filter
content by `valence_floor`/`magnitude_cap`** — so a child-safe filter would rest
on noise. *Fix: a world-parameter record; reclassify `mood_baseline` and
`mood_emission` as components (they vary with the fold, which is §12.7's own test
for componenthood); soften §4's MUST to scale-declared authority.*

---

## §2 Underspecified — ranked

| # | Issue | Cost |
|---|---|---|
| U1 | **No record channel.** §12.7 exiles authored records but never specifies them; Mythopia's engines read records as heavily as the log (`Character.members`, `Location.connections{traversal.days}` + cascading `rules`, `Arc.planned_tension`, `Theme.constraints`, `mythos.params`). A change-record-only transport moves ~half a canon. | Highest — blocks real interchange |
| U2 | **Group knowers.** `reveal(fact, audience: <group>)` folded literally records on the group node, so `knows(member, …)` is false where Mythopia says true. Expansion also reads a non-versioned membership record at apply time. | Silent knowledge divergence |
| U3 | **`nodeKind` missing `fact`, `theme`, `audience`** — all first-class ids, and `reveal`'s subject *is* a fact. `Character.kind: institution` (a knower) maps to `organization` and stops reading as one. | Add three kinds |
| U4 | **§14 misdescribes `compressions`** — they remove a span from the telling and stand in causally; the underlying events still fold. (§14's `magnitude`/`valence` row **is** exactly right.) | Wording |
| U5 | **`ContainmentMode` unspecified** though load-bearing — the five modes gate travel-cost exemptions and Dijkstra skips. | Pin the enum |
| U6 | **Position is implicit** in Mythopia (participants inherit the event's location); a conformant emitter must materialize N `set core.position` changes, which §2 otherwise reads as inventing no-ops. | Emitter guidance |
| U7 | **`impulses` has no home — correctly.** "Mood is NOT a component" matches Mythopia: impulses are recomputed from the stream each fold. | None |
| U8 | **§2 would reject a pure-mood event.** No fixture event is one, but the type permits it — "the wind changes over Rohan" is legal Mythopia and rejected here. | Small |
| U9 | Edition `reveals[]` grants the audience a fact no fabula event carries — contradicts "change records are the only writers" if editions are transported. | Flag |
| U10 | `granularity` unenumerated (`beat\|scene\|chapter\|era`). | One line |
| U11 | `core.regard` has no Mythopia reader — `Character.relationships` is `{to, kind, note?}` with no strength. | Table accuracy |

---

## §3 What the spec gets right — do not change

1. **Arcs as `narrative-node` with `drama.*` components** — the correct read of
   `ArcRuntime`; the node kind is genuinely load-bearing.
2. **`drama.state` as `scalarLastWrite` with `resolvedBy`** — exactly
   `{state, resolved_by}`, and `set state=open` correctly models `reopens`
   clearing `resolved_by`.
3. **"Mood is NOT a component. Resist pressure to add `core.mood`."** Correct and
   non-obvious — impulses are a stream, mood is a closed-form lazy read that
   never ticks.
4. **§14's `magnitude`/`valence` row** — "squashed views MUST recompute from the
   underlying range" is precisely right for an exponential kernel.
5. **§14's refusal to collapse `reveal`+`conceal`** — "A knew, then was deceived"
   squashing to "A never knew" destroys the irony. Right instinct; B5 is that
   §5's inverse-pair table contradicted it.
6. **`causes` marked ✅ shipped**, and causality as a *third, independent* partial
   order — matches Mythopia, where `causes` never affects ordering.
7. **Validity intervals** — matches `appearance` and `containment` semantics
   exactly ("the new canonical appearance from this event onward").
8. **§8.5's demand that the fold's input set be explicit** — costs Mythopia
   nothing (no draft/canon axis) and closes a real Studio-side gap.
