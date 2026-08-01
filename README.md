# Narrative Studio

Narrative Studio is a cinematic, agent-first story-authoring environment. A
creator and an AI collaborator build a world, shape one or more tellings, write
the dramaturgy and scenes, explore visual coverage, assemble storyboards, and
produce films or comics from the same canon spine.

This repository is the Studio application: a Next.js workspace in `ui/` and a
TypeScript/Express API in `src/`. It is not the broader Project 89 canon or its
documentation portal.

## What is here

- A world-first chronology with typed canon events, provenance, temporal
  validation, and draft-to-canon gates.
- Multiple productions inside one world, with medium-scoped agent behavior and
  film/comic workspaces.
- A dramaturgy room where presentation-order beats claim world events without
  rewriting story time.
- Exploratory image workflows, reusable visual styles, entity look albums, a
  free-form visual canvas, and a complete generated-asset registry.
- Film production with shot references, Veo clips, takes, virtual chop/trim,
  timeline assembly, dailies, and MP4 export.
- Whole-page comic generation with keep/reject/redo review and PDF export.
- A derived-operations canon ledger (`nit`) built from authoritative world
  snapshots at commit boundaries.

The current roadmap, verification record, and explicit gaps live in
[`docs/STATE.md`](docs/STATE.md). Do not infer current status from old feature
proposals alone.

## Quick start

Requirements:

- Node.js 20.9 or newer (`.nvmrc` tracks Node 20)
- npm
- A Gemini API key for the core chat, image, and Veo workflows

```bash
nvm use
npm ci
npm --prefix ui ci
cp .env.example .env
cp ui/.env.local.example ui/.env.local
npm run dev
```

Open [http://127.0.0.1:3089/studio](http://127.0.0.1:3089/studio). The API
listens on `127.0.0.1:3088` and the UI on `127.0.0.1:3089` by default.

At minimum, set one of these in `.env`:

```dotenv
GEMINI_API_KEY=your_key
# GOOGLE_AI_API_KEY=your_alternative_key
```

AtlasCloud, direct OpenAI image fallback, and Replicate are optional. The
checked-in [`.env.example`](.env.example) documents every runtime switch. Never
put provider secrets in a `NEXT_PUBLIC_*` variable.

## Commands

```bash
npm run dev          # API watch process + Next.js UI
npm run typecheck    # API and UI; both are required to remain at zero
npm test             # root Jest suite + UI typecheck test
npm run build        # bundled API + production Next.js build
npm run verify       # CI-equivalent tests, typechecks, and builds
npm start            # run already-built production artifacts
```

`npm start` intentionally refuses to boot when either production artifact is
missing. Run `npm run build` first.

## System shape

```text
world chronology + entities + styles
                 │
                 ├── production: film
                 │      dramaturgy → scenes → coverage → shots → clips → cut
                 │
                 ├── production: comic
                 │      dramaturgy → scenes → pages → review → PDF
                 │
                 └── future tellings and interactive formats

creator/UI ⇄ REST cores ⇄ agent tool executors
                         │
                         ├── authoritative project snapshots
                         └── derived canon-operation ledger
```

The central implementation files are intentionally large while the product
shape is still moving:

- `ui/app/studio/page.tsx` — studio shell and workbench orchestration
- `ui/components/studio/` — live extracted studio surfaces
- `src/api/server.ts` — REST API, shared cores, agent tools, and prompt assembly
- `src/git/format/v1/derive.ts` — canonical snapshot-to-operation derivation
- `src/storage/` — complete local-file persistence and durability machinery
- `src/visual/` — image, video, composition, extraction, and export adapters

## Data, recovery, and local security

The file store is authoritative. It defaults to `.narrative-data/` and can be
relocated with `DATA_DIR`. Writes are atomic, fsynced, backed up, and serialized
per logical key. Project deletion is recoverable: metadata, the world blob, its
backup, and its nit ledger move under `trash/projects/` within the data root.

The Studio is a local single-user application, not a hardened multi-tenant
service. There is no authentication layer. The API and UI therefore bind to
loopback by default, browser origins are allowlisted, project IDs and served
filenames are constrained, and request/upload sizes are bounded. Binding the
API to a non-loopback address requires the explicit `ALLOW_REMOTE_API=true`
escape hatch; doing so without an authenticating reverse proxy is unsafe.

The legacy Mongo adapter is deliberately disabled because it cannot round-trip
the complete Studio document. The migration command fails loudly instead of
performing a lossy conversion.

## How to work in this repository

Start with [`AGENTS.md`](AGENTS.md), then read these in order:

1. [`docs/STUDIO_BIBLE.md`](docs/STUDIO_BIBLE.md) — system shape and product
   doctrine
2. [`docs/STATE.md`](docs/STATE.md) — authoritative Now/Next/Blocked, roadmap,
   decisions, and verification ledger
3. [`docs/STUDIO_DESIGN.md`](docs/STUDIO_DESIGN.md) — narrative design history,
   shipped log, and gotchas
4. [`docs/AGENT_OPERATIONS.md`](docs/AGENT_OPERATIONS.md) — engineering and
   verification discipline
5. The active feature specification, currently
   [`docs/DRAMATURGY_DESIGN.md`](docs/DRAMATURGY_DESIGN.md) and
   [`docs/DIRECTOR_ROADMAP.md`](docs/DIRECTOR_ROADMAP.md)

The load-bearing rules are simple: every capability must exist for both agent
and creator; thread `projectId` and `productionId` explicitly; preserve unknown
fields across mapping seams; show the prompt actually sent; snapshot and resync
instead of invisible propagation; and verify behavior with disposable data.

## Known boundaries

- The application is local-first and single-user; remote collaboration and
  authentication are not implemented.
- `server.ts` and the studio page remain monoliths. Their size is now guarded by
  clean types and integration tests, but extraction should follow stable domain
  boundaries rather than cosmetic line-count targets.
- Canonization is a gated, validated status transition. Event-aware branch
  merge and richer temporal rules remain roadmap work.
- Shorts and microdrama are not yet first-class formats.
- Seedance support remains available for stylized work but is intentionally
  shelved for realistic faces; Veo plus the editing timeline is the photoreal
  path.

## License

[MIT](LICENSE) © Project 89.
