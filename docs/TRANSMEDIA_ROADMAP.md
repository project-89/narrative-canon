# Transmedia Roadmap — the Studio as the Nit Hub

**Status**: `design` — the north star after the Director Roadmap (V-series).
**Author**: 2026-07-20, Michael + Fable, from the g89le integration review.
**Read with**: `docs/PIPELINE_AUDIT_2026-07.md` (wave 2 still queued), `g89le/04_wonderlab/03_prototypes/transmedia_engine` (nit/Aureum design + working TS packages), `.../microdrama-studio` (multi-agent pipeline prototypes).

## The vision (Michael's ultimate dream, verbatim in spirit)

A coordination system for a **shared narrative world**: character accounts on
social media run by agents that query and update the narrative graph; every
account and system kept in narrative sync and continuity; **where they diverge,
branch merge conflicts become real narrative arcs**; a network of
interconnected agentic systems — some producing content, some consuming, some
*acting as characters* — coordinated through one graph.

The Narrative Studio is the hub: the nit graph is the narrative; media are
projections; agents are citizens.

## The paradigm (from g89le/transmedia_engine, proven compatible)

- **nit = source of truth**: typed commits, branches, canon flags, entity graph.
  Our studio's data model is a sibling (shared `src/core` ancestry) — the
  studio IS the film pipeline of this architecture, already production-hard.
- **Pipelines are producer-consumers**: checkout → run → commit, with typed
  payloads per medium (ScenePayload for comics, FilmPayload, SessionPayload…).
- **Hooks, not polling**: commits fire registered hooks → pipelines react.
  This is the realtime primitive the studio lacks today.
- **Aureum** (rules on the graph, side-effects = commits) = the reflex layer, later.
- microdrama-studio's 4-agent pipeline (World→Story→Episode→Visual) ≈ our
  `dream_film` conceive stages; the prototypes' from-scratch weakness is solved
  by our graph (projects accumulate; import appends to existing arcs).

## The Autonomy Dial (human-in-the-loop, as much or as little as desired)

Formalize what already exists into a per-pipeline setting:
| Level | Behavior | Existing mechanism |
|---|---|---|
| `direct` | Human drives; agent assists | chat + UI (today's default) |
| `review` | Agent produces; human gates | proposals, keep/reject, takes, review_scene |
| `autonomous` | Agent runs; budget + QC + morning report | dream/dream_film (maxClips, guardrails, watch_film) |
Every new pipeline ships with the dial. Every capability remains the triple:
**agent tool + UI surface + (new) MCP tool.**

## Phases

- **T1 — COMIC RENDERER** (the one missing organ; unlocks both dreams):
  `src/visual/comic-composer.ts` — panels = frames (rendered w/ graph refs),
  page layout w/ gutters, **speech bubbles from frame.dialogue** (SVG overlay,
  same technique as grid badges), title/credits page, print-ready PDF
  (sharp → PDF or img2pdf via ffmpeg/ImageMagick). Tools: `compose_comic`
  (sceneIds → pages → PDF in exports) + UI surface + per-page review.
- **T2 — SESSION INGEST PRODUCER** (adds-to-existing-arcs):
  upload audio/log → transcript (Gemini native audio) → existing ExtractionJob
  → entities/scenes APPENDED to a campaign project (dedupe by name against
  the graph). This is the **D&D → comic product**: campaign = project; the
  graph keeps the party consistent issue after issue (the moat vs one-shot
  tools). Prove with a real session audio.
- **T3 — PRODUCER API + HOOKS**: REST/MCP for external systems to commit
  events (the P89 terminal text adventure first). Studio-side hook registry:
  on-commit triggers (e.g. nightly: dream_film in microdrama format + comic
  over the day's events). *Players play by day; canon renders by night.*
- **T4 — NIT-IFICATION**: typed commits + reactive hooks in the studio core;
  adapter to `packages/nit`; branches get real UX (the dual grey/green-loom
  timelines from g89le's consistency_engine seed branches+canon).
- **T5 — MCP EXPOSURE**: the studio's graph + tools served over MCP
  (query_entities, get_scenes, commit_event, explore, produce, compose_comic…)
  with per-agent identity/auth. External agents become first-class citizens.
- **T6 — THE ARG COORDINATION NETWORK** (the dream):
  - **Character-agents**: an agent runs a character's social account; its
    knowledge = graph queries scoped to what that character knows (canon +
    their scenes); its actions = commits (posts become events).
  - **Continuity contract**: all agents sync through the graph; storyDiff +
    consistency checks police cross-account canon.
  - **MERGE CONFLICTS AS NARRATIVE ARCS**: divergent branches aren't errors —
    detection surfaces a conflict as a STORY BEAT (two realities disagree);
    resolution is authored (a scene/arc that canonizes one, or weaves both —
    Project 89's dual-timeline mythos makes this diegetic by design).
  - Roles: producer / consumer / character — one registry, one graph, one world.

## Build methodology (unchanged, extended)

The operating system holds: `AGENTS.md` → `STATE.md` → this doc; verify by
behavior with real content (P89 canon, real session audio); every unit atomic
+ committed; docs closed each session. Additions for transmedia work:
1. Each pipeline declares: role (producer/consumer/both), payload type,
   autonomy dial default, and its verification fixture.
2. No pipeline bypasses the graph (the G5 lesson — legacy paths are how
   continuity dies).
3. Real-content battle tests over synthetic ones (Wren film, P89 canon comic,
   an actual D&D session).

## Carried threads (do not lose)

- **Lore import in flight**: 8 g89le files → "Project 89 Canon" project
  (project_1784587910105) via /api/canon/import/files — CHECK COMPLETION, then
  name-join Aria/James visual refs (`anime/character_visuals/*_reference.md`
  + .jpgs) as portraits/looks. Keyframes doc → first canon scene.
- **AtlasCloud**: awaiting `ATLASCLOUD_API_KEY` from Michael → wire gpt-image
  ($0.004/img, unblocks cards/storyboards) + Seedance ($0.09/s) + **Seedance
  video-reference chaining** (prev clip as reference video — Michael's idea,
  natively supported by their quad-modal API).
- **Wave 2 audit fixes**: G5 legacy-endpoint migration, G3 takes/keeps
  metadata, I1 Veo seed/negativePrompt, I4 turnarounds, I2 retry anchor, UI
  (posterUrl usage, real lineage depth).
- **Wren battle test** + **branch-the-film** design pass.
- OpenAI billing: superseded by AtlasCloud if the key lands.
