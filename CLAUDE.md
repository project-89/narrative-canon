# CLAUDE.md — Narrative Canon: the transmedia studio

> **🧭 Working on the studio? Start at [`AGENTS.md`](./AGENTS.md)** — the single
> operational entrypoint: what to read, where the roadmap and current tasks live,
> and how to execute across sessions. **This file is the framing: what this thing
> is and why it is shaped the way it is.** AGENTS.md is the day-to-day guide.
> For the COMPLETE picture in one document — goals, UX, architecture, every
> moving part — read [`docs/STUDIO_BIBLE.md`](./docs/STUDIO_BIBLE.md).

## What this is

**One world, many tellings.**

A *world* is the shared truth: its cast and locations, the relationships between
them, a reusable visual identity, and — most importantly — a **chronology of
canon events**. A *telling* is one production that dramatizes some stretch of
that chronology in one medium: a film, a comic issue, an episode, a short.

Every telling reads from the same world. A scene in the film and a page in the
comic can dramatize the *same event* from different vantage points — and that
shared link is what makes this transmedia rather than a folder of unrelated
projects.

```
              THE WORLD  (entities · relationships · styles · chronology)
                   │
   ┌───────────────┼───────────────┬────────────────┐
   ▼               ▼               ▼                ▼
  FILM           COMIC          EPISODE        (ingested sources)
 scenes→shots   pages→panels     ...            play sessions, feeds,
   └──────── both dramatize event t=7 ────────┘   documents → draft events
```

Work flows both ways. The world feeds productions; productions birth new
characters and new events, which flow *back* as **draft** events and become canon
only by passing a gate.

## The two clocks

The idea the whole system rests on: **there are two kinds of time, and conflating
them is the bug.**

- **Transaction time** — when an author changed something. The commit ledger
  (`nit`); the ordinary version-control axis.
- **Valid time** — when something happened *in the story*.
  `WorldEvent.chronologyIndex`; the world's own chronology.

A prequel written today happens *early* in story time. So "what does this
character know?" is answered by folding the event stream in **story** order
(`worldStateAt(t)`), never by reading the commit log. And "can this new beat
become canon?" is a **story**-time question: canonizing an event that puts a
character on-panel after they died is a contradiction, whatever order the
authoring happened in.

That is why branching a comic off the middle of a film is safe — the check runs
on the story-time fold.

## Canon is earned, not assumed

Nothing becomes canon by being written. A draft event enters canon only by
passing:

1. **the telling's gate** — `creator` (a human locks it in), `vote` (a quorum),
   or `rule` (a predicate); and
2. **the temporal check** — it must not introduce a contradiction that isn't
   already there.

When it fails, the answer is narrative, not technical: **amend** the draft,
**retcon** the canon it contradicts, author a **bridging** event, or **fork** the
timeline. Four legitimate moves, because a contradiction in a story is a
storytelling problem.

## Principles

The non-negotiables; the fuller version is `AGENTS.md §3`.

- **Agent-first.** Every capability is *both* an agent tool and a UI surface,
  over one shared implementation. The UI explores the structure the agent builds.
- **The agent is scoped to where you stand.** At the world level it authors canon
  and *greenlights* productions — it cannot render frames. Inside a telling it
  gets that medium's kit and craft: a film director is not a comic page-director.
- **Exploratory and non-destructive.** Coverage before commitment; nothing
  generated is ever lost.
- **Style is an image leash, not text.** Pin a reference *image* — a text style
  spec loses to the model's realism bias.
- **Snapshot + resync, never live-link.** Downstream snapshots upstream; edits
  don't silently propagate.
- **Verify by behavior, not greps.** Hit the endpoint with real values; clean up
  test data you wrote.

## Layout

```
src/
├── api/server.ts    the studio API — REST + the agent's tools and executors
├── git/format/v1/   the nit format: schemas, derive, canonicalize, worldStateAt,
│                    validateTemporalConsistency   ← the canon substrate
├── git/             the older narrative-git stack + hooks (tested; the hook
│                    registry seeds the planned reactive/distribution work)
├── extractors/      narrative extraction from raw text   ← the ingest seed
├── pipeline.ts      extraction orchestration
├── visual/          image, video, portrait, film-export generators
├── storage/         adapters (file + Mongo), atomic writes, durable job stores
├── llm/             the Gemini adapter
└── core/ graph/ config/ utils/

ui/app/studio/       the studio itself — world view, per-medium rails, workbenches
prototypes/          preserved, not maintained (read its READMEs)
archive/             pre-studio code kept as prior art; outside the build
```

Two files carry most of the system — `src/api/server.ts` and
`ui/app/studio/page.tsx`, ~26k and ~22k lines. Monolithic on purpose so far, and
a known cost: they are the only remaining source of TypeScript errors, and
nothing typechecks them in CI because there is no CI.

## Commands

```bash
npm run dev     # API (:3088, tsx watch) + UI concurrently
npm test        # jest
npx tsc -p .    # typecheck (repo root); also run inside ui/
npm run game    # the Timeline Warfare prototype — see prototypes/
```

`.env`: `GEMINI_API_KEY` is the core (images, chat, video). Optional:
`OPENAI_API_KEY` (GPT-Image), `REPLICATE_API_TOKEN`.

## Project 89

This is infrastructure for Project 89: tools for authoring worlds that stay
coherent across every medium they appear in, so a story can be told many ways
without fracturing.

The engineering claim is narrow and testable — **a narrative is a versioned graph
of events in story time, and coherence across tellings is something you can
actually check.** That is what the canon gate does, and it either holds or it
doesn't.

The rest — what the worlds are *for* — is the work, not the code.

[WORLD::SHARED][TELLINGS::MANY][CANON::EARNED]
