# Timeline Warfare — the first prototype

**Status:** preserved, not maintained. Outside the studio's build, typecheck, and
test paths. Kept deliberately, for resurrection.

This is where the whole thing started. Written in one pass and committed on
**2026-02-05**, before the Narrative Studio existed, Timeline Warfare was a
playable CLI/web game about **branching timelines you edit and merge**. It was
the prototype that proved the mechanisms the studio is now built on.

## Why it is kept

Read the exports and the studio's core model is already visible in them:

| Timeline Warfare (2026-02) | what it became |
|---|---|
| `TimelineEvent`, `TimelineState` | `WorldEvent` + `worldStateAt(t)`, the story-time fold |
| `TimelineBranch`, `TimelineConflict` | production branches + `validateTemporalConsistency` |
| `BranchMergeMinigame` | the C3 canonization gate — draft → canon with amend/retcon/bridge/fork |
| `CascadeSystem`, `CascadeEffect`, `OneirocomCounterCascade` | cascade / butterfly-effect work, still unbuilt |
| `MissionGenerator`, `Mission`, `MissionStrategy` | generated scenario decks (roadmap M3) |
| `WorldState` | the world graph the studio's tellings all share |

The game asked the question the studio answers: *if a story is a branching graph
of events, what does it mean to edit one branch without breaking another?* In the
game that was a merge minigame. In the studio it is a validated canonization gate.

## The resurrection path

The intent is a **playable prototype whose sessions become media** — the same
shape as the roadmap's M3 living-card-game phase:

```
play session
  -> event stream (TimelineEvent)
  -> draft WorldEvents on the world chronology
  -> canonization gate (creator | vote | rule)
  -> a production: comic pages / film shots
  -> published through the studio's existing pipelines
```

Everything downstream of "draft WorldEvents" already exists and is live. The work
is the adapter from a play session to `WorldEvent[]`, not a rebuild.

## What is here

```
src/games/         the game: timeline manager, mission generator,
                   branch-merge minigame, git-backed variant, visualizer
src/game/          cascade-system.ts — butterfly effects
src/api/           game-server.ts — its own Express server
src/visualization/ static HTML explorers (html-generator, enhanced-narrative-explorer)
src/experimental/  narrative-state-machine.ts — a git-like state-transition PoC
src/visual/        panel-generator, comic-composer, scene-director
                   — the FIRST comic pipeline; the studio's is compose_comic now
ui/                the playable web UI (app/play + components/game + game-store)
examples/          13 runnable demo scripts
tests/             visual-panels.test.ts.txt — panel/comic tests, preserved as .txt
                   so no runner picks them up
```

## Notes for whoever revives this

- **The TypeScript half is import-correct.** Its references into the studio were
  rewritten to `../../../../src/...` when it moved here, and one import that had
  been broken for months (`enhanced-narrative-explorer` → `narrative-state-machine`)
  was repaired in the move.
- **It carries its own 18 TypeScript errors** — 14 in `game-server.ts`, 3 in
  `timeline-warfare-git.ts`, 1 in `enhanced-narrative-explorer.ts` — which is part
  of why it lives outside the studio's `tsconfig`. `npx tsc -p prototypes/timeline-warfare`
  shows them (plus whatever the studio's own `src/llm/gemini.ts` contributes, since
  the prototype imports it). Fix them when you revive it, not before.
- **The UI half is a snapshot.** `ui/app/play/page.tsx` and `ui/components/game/*`
  used Next.js `@/` aliases that resolved against the studio's `ui/` root
  (`@/lib/utils`, `@/lib/stores/game-store`). Those aliases do not resolve from
  here; re-wire them when you mount it again.
- **It depends on the studio's live code** — `src/pipeline.ts`, `src/extractors/`,
  `src/llm/gemini.ts`, `src/git/`, `src/visual/{image-generator,entity-portrait-generator,types}`.
  Those are all still maintained, so the prototype should not rot silently — but
  nothing typechecks it, so verify before trusting it.

## Running it (historical)

```bash
npm run game       # timeline-warfare
npm run game:git   # the git-backed variant
```

Both are wired to this directory's esbuild config. They were last exercised in
February 2026 — treat them as a starting point, not a working build.
