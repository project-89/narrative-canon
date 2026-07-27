# Review brief — `CHANGE_RECORD_SPEC.md` v0.6, for the Mythopia-side pass

**Audience**: the agents doing Mythopia's review pass before its §15 signature.
**From**: the narrative-canon side, 2026-07-27.
**One line**: the spec has survived three adversarial implementer reviews (18
blockers found, all folded, zero open) — so the highest-value pass now is NOT a
fourth general read. It is (a) the sections written *after* those reviews, (b)
five decisions that touch Mythopia's semantics and need its blessing, and (c)
the one thing nobody has done yet: **run the Fellowship fixture through a
spec-conformant fold.**

---

## 1. Read these first — do not re-find the 18

| Doc | Vantage | Found |
|---|---|---|
| `CHANGE_RECORD_SPEC_REVIEW.md` | ArgOS | 5 — identity, fold determinism, merge verb, effect replay, shape contradictions |
| `CHANGE_RECORD_SPEC_REVIEW_MYTHOPIA.md` | Mythopia | 6 — worldDate, ordering, clamping, peak capture, audience/conceal, mood kernel |
| `CHANGE_RECORD_SPEC_REVIEW_AUREUM.md` | Aureum | 7 — clockless producers, link keys, silent skips, node kinds (4 confirmed, 3 narrowed) |

Every one carries file:line evidence and a disposition. A finding that
duplicates one of these is noise; a finding that shows a *fold was wrong* is
gold.

**The evidence bar, if you file findings**: match those documents' format —
verdict / verification log with `file:line` / blockers with concrete failure
scenarios and proposed fixes / a dropped-claims list for what you could not
substantiate. Claims without file:line evidence were discarded in every prior
round.

**The resolution principle used throughout** (so you know what to argue for):
where a system's code encodes real narrative knowledge, the spec bent
(Mythopia's clamping, `resolvedPeaks`, reveal/conceal all won); where a system
was merely unfinished, the system changes (Aureum gains `spawn`/`destroy`).
Argue from which side of that line your finding sits.

---

## 2. Where the least-reviewed text is — hit these hardest

The three reviews examined v0.1–v0.4 material. **§11.5, §11.6, §7.1, §6.6,
§12.5.2 and the §12.7 boundary test were written afterwards** — your pass is
their first adversarial read. Seeded questions we already suspect are worth
your time:

1. **§11.5 records merge is field-level last-write-wins.** `Arc.planned_tension`
   is a *keyframe array* — under field-LWW, two authors editing different
   keyframes clobber each other's whole array. Acceptable for authored records
   (fails loud-ish, authoring conflicts are rare), or does the record channel
   need array-aware merge for exactly this field your drift rule depends on?
2. **§7.1 fork inheritance × your date-sorted store.** `forkAt` is a `t`;
   `CanonStore` sorts by `toDays(world_date)` and has no `t`. Does
   `fold(parent, min(t, forkAt)) ++ events(T, ≤t)` compose correctly with the
   §7 monotone-pairing rule when a fork point falls between two same-date
   events? (Tiebreak at the fork boundary is `eventId` — check that is
   actually well-defined for your store.)
3. **§6.6 `knows()` recursion details.** Individual `conceal` "shields
   regardless of what its groups know" — verify that priority is implementable
   as written, and that the inherited-knowledge timestamp
   (`max(revealedAt(g,f), joinedAt(x,g))`) doesn't break `editionIronyCurve`,
   which reads timestamps as step-function edges.
4. **§12.7's boundary test applied to YOUR data.** We classified your canon:
   `members` → component, location topology → `link` edges with `{traversal}`
   payload, `planned_tension` → record, `Theme.constraints` → record,
   `mythos.params` → world parameters. That classification was done from *our*
   read of your engines — audit it against everything `curves.ts`,
   `query.ts`, and the linter rules actually consume. Anything we mis-filed
   diverges silently.

---

## 3. The five decisions that need Mythopia's explicit blessing

These were resolved in ways that change or constrain *your* engine's observable
behavior. Verify, then bless or contest — this is what the signature is
actually about:

1. **§6.6 late-joiner inheritance — THE divergence.** The spec: members who
   join a group later inherit what the group knew (institutional memory). Your
   shipped code: apply-time expansion — late joiners do *not* inherit
   (`store.ts:129-133,257`). We claim every Fellowship-fixture knowledge
   assertion survives because every asserted knower is a member at reveal time
   — **verify that claim against your own tests**, then decide whether the new
   semantics are acceptable for Mythopia's L4 target.
2. **§12.2 `clampedNumeric` — you won, with a stated cost.** The spec adopted
   your [0,1] clamping for `drama.tension`/`drama.stakes`. The cost, stated
   rather than hidden: clamped `adjust` is **not commutative**, so §6.2's
   concurrent-producer convergence guarantee does not hold for these two
   components. Confirm you accept that trade — it was your semantics that
   forced it.
3. **§12.2.1 `drama.peakAtResolution` + intra-event ordering.** Our invented
   mechanism to preserve `resolvedPeaks`. The claim: a conformant fold
   reproduces your convergence numbers (C(evt_011) ≈ 0.37, twin peaks at
   evt_011/evt_015). Nobody has executed this — see §4 below.
4. **§7 clockless-producer dates.** `daysPerT: 0` means an entire session
   shares one story-day, so your windowed signals see day-distance 0 across
   it. Acceptable degradation for ingested play sessions, or do you want a
   different declared default?
5. **§4 `magnitude`/`valence` scale-declared authority.** Your edition
   register caps (`valence_floor` — the child-safe filter) now rest on
   "consumer declares it accepts the `mythopia/v1` scale." Bless that your
   editions trust that scale, and that `basis`/`confidence` provenance is
   sufficient for filtering ingested (non-authored) events.

---

## 3.5 Execution status — what has and has not been run *(added 2026-07-27)*

Honesty about the verification chain, because "verified" in the three reviews
means **source inspection**, not execution:

| Claim | Status |
|---|---|
| Mythopia's suite passes (the assertion values cited throughout) | **EXECUTED 2026-07-27** — `vitest run` in our clone: 8 files, **91 tests, all green** |
| `arc_frodo_burden` unclamped sums = 1.05 / 1.20 (the §12.2 clamping basis) | **MACHINE-VERIFIED** — scripted sum over the fixture YAML matches the hand derivation exactly |
| All file:line citations in the three reviews | Source-inspected (reviewer + independent verifier), never executed |
| What a spec-conformant fold produces (1.26 felt intensity, different climaxes, C≈0.37 via `peakAtResolution`) | **DERIVATION ONLY — no conformant fold exists anywhere.** This is precisely the §4 ask below |

## 4. The single highest-value act: run the fixture

Vantage theory says re-reading finds little. **Executing finds what reading
cannot.** The one conformance test that would convert Mythopia's signature from
"read and agreed" to "demonstrated":

> Sketch the adapter (Mythopia `Canon` → change records → §8 fold → your
> engines) and run the **42-assertion Fellowship suite** against it. Green =
> L4 conformance demonstrated on the reference canon. Red = a fold bug in the
> spec that three reviews missed — file it with the failing assertion as
> evidence.

Emission direction (`Canon.events` → Events with `changes[]`) is mechanical:
§16's Mythopia column is the field-by-field map, verified at source. The
interesting half is the fold: §8's sort key, §12.2's clamped rules, §12.2.1's
peak capture, §6.6's read-time knows().

---

## 5. Already known — do not file as findings

- **O5** (lift thresholds) and **O6** (ingest confidence) — open, non-blocking.
- **O4** (dangling `causedBy`) — ships implementation-defined; consumers
  document their policy.
- **§13 read-sets + merge resolution algebra** — carved to v1.1 deliberately
  (unsound as previously specified; see §13's carve note).
- **U9** (edition `reveals[]` writes audience knowledge with no backing event)
  — flagged, altitude-3, out of v1.0 scope. If editions are ever transported,
  this reopens.
- Everything in the three review documents' disposition tables.

---

## 6. Logistics

- Spec: `docs/CHANGE_RECORD_SPEC.md` (v0.6, `main`, repo
  `project-89/narrative-canon`). Wire examples carry `specVersion: "0.6"`.
- File findings as a markdown review doc in the established format (or a PR
  adding `CHANGE_RECORD_SPEC_REVIEW_MYTHOPIA_2.md`); we fold accepted findings
  and version-bump, as with all 18 prior.
- Mythopia is not frozen either: where a finding is best fixed by changing
  Mythopia rather than the spec, say so — the §1 resolution principle cuts
  both ways, and the L4 adapter is expected to carry some of the conformance
  (e.g. read-time group expansion) rather than the engine core.
- On sign-off: the ask is the §15 Mythopia row (**L4 — Analyse**: engines read
  the fold; editions stay altitude 3), plus positions on the five decisions in
  §3. Everything else in the document has been through the mill.
