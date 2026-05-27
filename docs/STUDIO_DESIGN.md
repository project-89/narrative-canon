# Narrative Studio — Design Document

**Status**: Draft — captures vision and architecture before the script/shell rebuild.
**Last updated**: 2026-05-27

## Vision

Narrative Studio is a **cinematic AI-collaborative authoring tool**. A writer and an AI agent build a story together — from initial style and concept through to per-shot production renders ready for video. Every surface commits to one focused thing at a time. The chat travels with you, sees what you're focused on, can act on it.

The studio mirrors how stories are actually built: **non-linear iteration across distinct phases**, with each phase's output flowing forward as a snapshot that can be re-synced when upstream changes.

## Core principles

1. **Cinematic, not utilitarian.** Each phase is its own canvas. Full-bleed when focused. No modals stacked over modals.
2. **Chat travels with you.** The AI agent is a persistent sidebar — sees focus, can act, can diagnose. Not a popup, not a separate tool.
3. **Snapshot + resync, everywhere.** Downstream stages snapshot from upstream. Edit either side freely. Resync is always explicit.
4. **The agent owns the loop, the writer owns the vision.** Agent fills, suggests, renders. Writer edits freely, redirects, decides.
5. **Style is a leash, not a suggestion.** Visual style locked at Phase 0 governs every render across the project, until you change it.

## The pipeline

```
Style → World → Script → Storyboard → Production → Post
                                     ↑          ↑        ↑
                                  Scenes     Frames   Editing line
```

Linear pipeline. Every phase clickable always. Style and World inform everything downstream. Iteration loops back freely (you'll be in Frame work and decide a character needs a new outfit; you'll be in Script work and realize the logline is wrong; this is normal).

---

### Phase 0 — Style

**Goal**: Lock the visual aesthetic before producing any real assets.

**Surface**: Pre-Pro view (built).
- Visual style spec (text) — with anime-tuned presets (Spider-Verse × Anime, K-Pop Demon Hunters, Cinematic Anime).
- Style references (image pins) — auto-attached to every render via project.styleAssetIds.
- Test render bench — four standardized diagnostic prompts (portrait / wide / close-up / action) to verify consistency.

**Why first**: Without 3+ style refs pinned, every render drifts between aesthetics. Producing characters in an unlocked project creates throwaway assets.

---

### Phase 1 — World

**Goal**: Build the world graph. Characters, locations, events, relationships, objects.

**Surface**: World canvas with multiple sub-views.
- **Entity gallery** — full-bleed cards. Click any to enter fullscreen entity workbench (same cinematic treatment as the frame workbench).
- **Relationship constellation** — graph view of who's tied to whom and how.
- **World bible** — long-form scratchpad notes. Drag-drop external documents (.txt / .md / .pdf) for AI to import + extract entities.
- **Character design deep-dive** — per-character: backstory, outfits, character sheets, expression variations, alternate looks gallery.

**Inputs**: external documents (the writer's existing world bible). AI extracts entities, relationships, scenes into the graph.

**Outputs**: entity records used everywhere downstream — referenced in script, attached as identity refs on renders, embedded in production frames.

---

### Phase 2 — Script

**Goal**: Write the story. The actual prose unfolding through the pipeline below.

**Framework**: 10 stages following the standard scriptwriting flow. Each stage is its own micro-workspace. Left-rail nav between stages with completion dots.

1. **Logline** — single canonical sentence. Big typography. AI suggests, writer locks.
2. **Character Summary** — short descriptions per character. Linked to World entities (snapshot + resync).
3. **Synopsis** — paragraph or two. Snapshots from logline.
4. **Act Summary** — Act 1 / Act 2A / Act 2B / Act 3 (four paragraphs).
5. **Act Breakdown** — bullet points per act, specific story points.
6. **Character List** — deeper character work: arcs, motivations, actions. Linked + resyncable with World entities.
7. **Beat Sheet** — narrative beats at positions (Save the Cat style or custom).
8. **Theme** — exploration of theme. No upstream dependency; write whenever.
9. **Scene List** — 30-40 scenes as drag-orderable cards, each 1-2 sentence pitch.
10. **The Write** — long-form prose. Scenes flow continuously. Highlight passage → "Make this Scene N" → promotes to production Scene.

**Snapshot + resync chain**: each stage snapshots from upstream. Resync button pulls upstream changes through. Edits at any stage stay isolated until you explicitly resync.

**The writer may not do every stage** — sometimes you go straight from Logline to The Write. Stages are scaffolding, not gates.

---

### Phase 3 — Storyboard

**Goal**: Visualize script passages as multi-panel pages before production.

**Surface**: built.
- Paste a script chunk (or scene's prose) → GPT Image 2 generates an N-panel page in the locked style.
- Click any panel → extract as frame in a target scene.
- Frame records `sourceStoryboardPanelIndex` and `sourceStoryboardImageUrl` so re-render can anchor to the panel.

**Optional**: iterate on individual shots directly without storyboard pages. Writer's call.

---

### Phase 4 — Production (Scenes + Frames)

**Goal**: Per-shot rendering. Each frame = one camera shot.

**Surface**:
- **Scene workbench** — full-canvas view of a scene with all its frames laid out cinematically. Click any frame to enter the frame workbench.
- **Frame workbench** (built, locked in as the model for everything else) — full-screen. Large image left. Inline-editable metadata right. Thumbnail strip top. Clear action bar bottom. Single canonical `imagePrompt`. Last-render diagnostics surfaced.

---

### Phase 5 — Post (editing line)

**Goal**: Sequence frames into a final cut. Eventually export to video.

**Surface (planned)**:
- Horizontal timeline of all frames in order.
- Per-frame duration (default 4s), drag-to-resize.
- Scene grouping with visual separators.
- Drag to reorder within / across scenes.
- Scrub preview (still sequence playing at the timeline rate).
- Per-frame transition tag (cut / fade / dissolve — metadata only until video export).

**Video model integration (forward-looking)**:
- **Seedance**: takes a storyboard image + shot-by-shot prompt → 15s clip with multiple shots. The editing line should be able to chop this clip back into segments matching the source frames.
- **Image-to-video** per frame for single-shot motion clips (other models).
- **Audio**: parallel track for VO / SFX / score. Deferred.

**Export**: deferred. Needs ffmpeg or equivalent.

---

## UI shell (cross-phase)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Header: project switcher · Style Lock badge · Continuity · Assets    │
├──────────────────────────────────────────────────────────────────────┤
│ Phase nav: Style · World · Script · Storyboard · Production · Post   │
├────────────────────────────────────────────────┬─────────────────────┤
│                                                │                     │
│                                                │                     │
│   Phase canvas                                 │   Chat sidebar      │
│   (full-bleed, no modals)                      │   (resizable,       │
│                                                │   collapsible)      │
│                                                │                     │
│                                                │                     │
├────────────────────────────────────────────────┴─────────────────────┤
│ Quick prompt input (single line, always available)                   │
└──────────────────────────────────────────────────────────────────────┘
```

**Right sidebar — persistent chat**:
- Resizable from left edge (drag).
- Collapsible to thin icon strip (~40px) when you want max canvas.
- Sees focus context (current phase, entity/scene/frame focused).
- Shares state with the quick-prompt input below — sending in either appends to the same conversation.
- Tool calls and results surface live (SSE streaming, already built).

**Center canvas**:
- Full-bleed by default. Carousel / gallery / outline depending on phase.
- When something is focused (entity / scene / frame / artifact / script stage), the canvas becomes its workbench in the same area — **no modal overlay**.
- "Back" returns to phase root.

**Bottom**:
- Single-line quick prompt input. Always there. Submits to the same chat that lives in the sidebar.

**Assets drawer**:
- Triggered from a header button (or keyboard shortcut).
- Slides in from the right edge, over the chat.
- Browse all uploaded + generated assets. Drag-drop into the canvas to attach to whatever's focused.

---

## Cross-cutting concerns

### Snapshot + resync model

Default behavior across the studio:
- Downstream items snapshot upstream at creation.
- Edits on either side stay isolated until you press resync.
- Resync surfaces a diff so you can pick what to accept.

Where it applies:
- Logline → Synopsis → Act Summary → Act Breakdown → Beat Sheet (script chain)
- Character Summary ↔ Character List ↔ World Entity
- Scene List entry → production Scene
- The Write passage → production Scene
- Storyboard panel → frame
- Frame → Post-Pro timeline item

### The Agent's role

Always-available conversational partner. Specific responsibilities:
- Knows the current phase, suggests phase-appropriate next moves.
- Sees focused content (entity / scene / frame / script stage).
- Writes the full prompt for image renders. Exposes `actualPromptSent` in tool results so issues can be diagnosed.
- Picks the right backend per call (Nano Banana for reference-anchored production; GPT Image for exploration / multi-panel / text-in-image).
- Stages new entities/relationships/scenes as proposals for review, commits direct edits (updates, image renders) immediately.

The chat sidebar is where the agent lives.

### Backend model routing

- **Nano Banana (Gemini)**: production-anchored renders, identity continuity, fast iteration. Default for portraits, frames once style is locked, scene heroes.
- **GPT Image (OpenAI)** — gpt-image-2 for generations, gpt-image-1 for edits with auto-fallback. Storyboard pages, casting sheets, mood boards, artifacts with text, initial concept exploration.
- **(Future) Seedance** — storyboard + shot list → multi-shot 15s clip. The editing line chops output back into frame-aligned segments.

### Asset library

Cross-cutting concern, not a phase.
- User-uploaded references (character sheets, location refs, mood boards, style refs).
- Generated assets (rolled up virtually across entities/scenes/frames/artifacts).
- Pin uploaded assets as project style refs → auto-attached to every render with a "locked aesthetic" directive.

Accessed via a drawer, available from any phase.

---

## Open questions / future

1. **Real-time collaboration** — multiple writers + multiple AI agents on the same project. Not in MVP.
2. **Branching narratives** — Git-style branch/merge of story decisions. Data model exists (the Nit spec); UX deferred.
3. **Audio layer** — VO / SFX / score in Post-Pro. Deferred.
4. **Export to MP4** — needs ffmpeg or equivalent. Deferred until video models are integrated.
5. **Version comparison** — side-by-side diff of two renders of the same frame. Useful for iteration; potentially a v2 of the frame workbench.
6. **Live entity-name linking in script** — when you write "Sim Siren walked in", her name auto-links to her entity; click opens her in a side panel without leaving the script. Nice-to-have; might land with the Script phase or shortly after.

---

## Build order

Captured in code as task list. High-level:

**This session (~half day, will land as 3-4 commits)**:
1. **Shell restructure** — chat as right sidebar, phase nav with 5 phases, inline detail views (no more modals), Assets as drawer. Everything currently working still works inside the new shell.
2. **Script phase scaffolding** — `Project.script` data model with the 10 stages, left-rail outline navigation, empty stage canvases.
3. **First 4 stages working end-to-end** — Logline, Character Summary (linked to entities), Synopsis, Act Summary.
4. **Scene List + promote-to-Scene** — bridge to production, unblocks the existing storyboard/frames flow.

**Next session (~half to full day)**:
5. Remaining Script stages — Act Breakdown, Character List (deep), Beat Sheet, Theme.
6. The Write — full long-form editor with passage-to-scene extraction.
7. Entity workbench gets the cinematic treatment (full canvas, not modal).
8. Scene workbench likewise.

**Future**:
9. Post-Pro phase — editing line (frame sequence + per-frame duration + scrub preview).
10. Seedance integration for multi-shot clips.
11. Per-frame image-to-video.
12. Audio + export.

---

## Locked decisions

- **Snapshot + resync** is the default everywhere (not live-link).
- **Theme** has no upstream dependency in the Script stage chain.
- **One canonical Logline per project** (alternates go in scratchpad / chat).
- **Assets become a drawer**, removed from the top-level phase nav.
- **The frame workbench's design language** (cinematic, full-screen, single-source-of-truth prompt, last-render diagnostics) is the template for every other workbench.
