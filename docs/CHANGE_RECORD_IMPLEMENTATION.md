# Implementing the Change Record — the coordination plan

**Status**: `active` — 2026-07-27. The spec (`CHANGE_RECORD_SPEC.md` v0.7) is
**implementation-ready**: contract agreed through three implementer reviews +
F1/F2; every remaining open item is additive or carved to v1.1. This document
is the work-order sheet — what each system builds, against which interfaces,
with which dependencies.

**The premise**: all agents implement their pieces **in parallel, now**, each
against the spec's contracts — not against each other's code and not against a
shared library that doesn't exist yet. The generalized library (`@org/fold`)
swaps in later *without holding up development*, under the rule below.

---

## 1. The rule that makes parallel work safe

> **The first shared artifact is the conformance test suite, not the library.**

Two implementations that pass the same golden fixtures are interchangeable by
construction — that is the entire safety argument for "swap it in when ready."
Concretely:

- `conformance/` (this repo, beside the spec): golden **fixture canons** as
  change-record streams + **expected fold outputs** at named `(commitRange, t)`
  coordinates + expected diagnostics (`before-mismatch`, `unapplied-change`,
  `order-sensitive-merge`).
- Seed fixtures: the **Fellowship canon** (the Mythopia-side run already
  committed to producing it — one act, three deliverables), a **synthetic
  minimal canon** (every verb exercised once, incl. `merge` redirects, fork
  inheritance, group knowers, clamp order-sensitivity), and the **rooftop
  canon** (our own world, exercising draft/canon + gates).
- **Any implementation that goes green is conformant. The suite is the
  integration point; no repo blocks on another repo's code.**
- When `@org/fold` extracts (their Phase 3 — pulled by a real consumer, not
  speculative), it must pass the same suite before any host swaps to it. The
  swap is then a dependency change, not a migration.

Implementations pin `specVersion: "0.7"` on the wire. Spec changes continue
findings→disposition→version-bump; the v1.0 tag lands when the fixture run
returns and §15 signatures complete.

---

## 2. Work orders by system (the §15 target rows, as assignments)

Each is independently executable today. Cross-repo dependencies are listed in
§4 — there are only two.

### ArgOS (owner: Michael, via the ArgOS instance) — target L1 + L1r
1. **§3 Identity first** — normative and stable; ArgOS serialises raw recycled
   BitECS eids today, so it has the most to gain and least to unlearn. ULID
   minting + `nodeKind` mapping (+ `x.argos.*` kinds for what the core enum
   lacks).
2. The **lift emitter** (stateful, §8.4): shadow-map of last-emitted values;
   altitude-1 stays local.
3. **L1r rehydrate**: boot an authored world — records first, then changes
   (§11.5's forced ordering).
4. Conform CANON §6 text to the spec vocabulary (its side already committed).

### Aureum (owner: Michael) — target L1, via the wrapper
The Aureum review's work list, verbatim — days-scale:
1. The **host wrapper around `step()`** — zero evaluator changes; `before`
   from the pre-step world, `after` from the returned clone, participants from
   the match context.
2. `spawn`/`destroy` in `ChangeOperation`; surface skipped changes
   (`unapplied-change`, §8.3); link-key declarations (§12.5.2); declared clock
   mapping (§7, `daysPerT`); narrative rules emitted as create+reveal
   (§6.3.1); spent-ness reified (`mark x.aureum.spent`, §12.7.1).

### Mythopia (owner: cofounder) — target L4
1. The **adapter + fixture conformance run** (already committed on their
   side): `Canon` → change records → §8 fold → their engines → the 91-test
   suite. Green = signature evidence AND the first conformance fixtures.
2. Adapter carries the conformance deltas (read-time group expansion §6.6;
   clamped folds are already their semantics).

### narrative-canon (us) — target L1–L3, the biggest lift
Phased so nothing breaks the shipped studio; each phase lands behind the
existing surface:

| Phase | What | Notes |
|---|---|---|
| **NC-0** | `src/change-record/` — the contract module: Zod schemas (Event + per-verb discriminated union, §5), ULID ids, canonicalisation (§8.6), validation (§2 non-empty, §8.2 quad uniqueness) | Pure, no I/O. **This is the piece `@org/fold` later replaces** — same types, since both implement one spec |
| **NC-1** | `conformance/` — the suite + our rooftop fixture; wire the synthetic canon | The §1 integration point; do this *second*, not last |
| **NC-2** | The fold (L2): typed component tables replacing `states: string[]`; sort key, per-verb authority, `before` diagnostics, explicit input set, fork inheritance | New fold beside `worldStateAt`; cut over when conformance is green |
| **NC-3** | Emit (L1) + the nit migration (§11.3 list): `stateChanges` → `changes[]` via the migrator, ULIDs, `AuthorRef` 6 kinds, `status` out of the hashed Event, `changes[]` frozen at canon | **The risky one** — hashed-schema bump; remember the v1.1 `formatVersion` regression (a bump silently skipped ALL commits). Gate on round-trip tests before shipping |
| **NC-4** | **L0 capture**: instrument the ~78 generation call-sites to emit `x.fold.activity` records (clockless mapping declared; `causedBy` populated at emit) | Unblocks the Fold Platform's Phase 1 slice — the one external dependency on us |
| **NC-5** | Swap: when `@org/fold` passes `conformance/`, NC-0/NC-2 internals become a dependency | The payoff of §1 |

---

## 3. What everyone codes against (the interfaces)

1. **The wire**: §4 Event + §5 change-record union, `specVersion`-stamped.
2. **The fold signature**: `fold(commitRange, storyTime, {include}) →
   component tables` (§8, §11.5) with the three diagnostics.
3. **The fixtures**: `conformance/` — the only shared code-adjacent artifact
   until the library exists.

Nothing else is shared. No repo imports another repo's implementation during
this phase.

---

## 4. Cross-repo dependencies (only two)

| Dependency | Direction | When |
|---|---|---|
| Fellowship fixture run → Mythopia §15 signature + seed fixtures | Mythopia → the suite | already committed, in flight |
| NC-4 activity events → Fold Platform Phase 1 slice | us → them | after NC-0 (the schemas) — NC-4 does not need NC-2/NC-3 |

Everything else proceeds independently. A finding discovered mid-implementation
follows the standing process: file with evidence → disposition → spec bump —
same as all 20 so far.

---

## 5. Sign-off ledger

| Row | State |
|---|---|
| narrative-canon | signed (author) |
| ArgOS | owner-signed (Michael; CANON §6 pre-committed) — implementation start = the signature in practice |
| Aureum | owner-signed (Michael) — the review's work list is the vendoring plan |
| Mythopia | pending the fixture run (evidence-backed signature, by design) |

v1.0 tags when the last row fills.
