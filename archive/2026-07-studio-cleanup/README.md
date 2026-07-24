# Archived 2026-07 — the pre-studio library layer

Code from when this repo was `@narrative/canon`, a narrative-extraction library
with a MongoDB-backed query engine. The repo is now the **Narrative Studio**, and
none of this is reachable from it: the API server (`src/api/server.ts`) imports
none of it, and neither does the UI.

It is archived rather than deleted because some of it is **prior art for work
that is actually planned**. `archive/` sits outside the root `tsconfig`
(`include: src/**/*.ts`) and outside jest's `roots`, so nothing here is
typechecked, built, or run.

The package was never published to npm (`@narrative/canon` → 404), so there are
no external consumers to worry about.

## Worth reading before you rebuild something

**`src/query/consistency.ts`** — a story-consistency checker covering location,
possession, state and timeline conflicts. The studio's live linter is
`validateTemporalConsistency` in `src/git/format/v1/derive.ts`, which today
catches exactly two rules (`participant-dead`, `duplicate-death`).
`docs/MYTHOPIA_COMPARISON.md` §2.1 measures that against a 12-rule comparison —
this file is a source of candidate rules. Note it predates the `WorldEvent`
model, so port the *ideas*, not the code.

**`src/graph/multi-scale-manager.ts`** — a time-scale hierarchy
(millennium → minute) with character-arc phase extraction, over the still-live
`src/graph/temporal.ts`. Adjacent to the curve/convergence engines the same
comparison proposes.

**`src/queries/`** — `graph-query-engine` ("who touched this object", entity
paths, temporal queries) plus `llm-query-interface`, a Zod schema set letting an
LLM issue those queries. Conceptually the ancestor of the studio's agent tools.

## Everything else here

The MongoDB persistence line (`storage/mongodb-adapter`, `services/*`,
`api/narrative-api-adapter`), the old library entry (`index.ts`, `errors.ts`,
`cli.ts`), the superseded pipeline wrappers (`production-pipeline`,
`git-chunked-extraction`, `canon-timeline-manager`, `narrative-query-engine`,
`narrative-canon`), the pre-`WorldEvent` graph model (`graph/builder`,
`core/narrative-versioning`, `core/narrative-repository`), and text-segmentation
helpers (`scene-boundary-detector`, `narrative-taxonomy`).

`tests/` holds the 8 suites that covered this code. All were failing or skipped
before archiving — most needed a MongoDB the CI never had.

## What did NOT come here

The **narrative-extraction** path — `src/extractors/` (all 7), `src/pipeline.ts`,
`src/chunked-extraction.ts` — is still live in `src/`, inside the API server's
import closure. It is the seed of the planned source-ingest work (external
narrative sources → draft `WorldEvent`s), so it stays first-class.
