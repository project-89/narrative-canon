# Narrative Studio — Design Document

> **Companion docs:** `docs/AGENT_OPERATIONS.md` (how agents build this across
> sessions — principles, the artifact system, the session lifecycle; read it
> SECOND) · `docs/DRAMATURGY_DESIGN.md` (the active telling-shape build) ·
> `docs/DIRECTOR_ROADMAP.md` (the vibe-director gap analysis + V1–V6) · `docs/EXPLORE_FLOW_DESIGN.md` (explore →
> curate → assemble, E1 shipped) · `docs/SEEDANCE_*` (built-but-shelved video). 

**Status**: Living doc — vision, architecture, implementation status, and roadmap.
**Last updated**: 2026-08-01 (world-first/transmedia Studio, Dramaturgy slice 1,
and the first-pass integrity/security/reliability hardening are reflected in the
latest shipped block and handoff; older chronological sections remain history).

## Vision

Narrative Studio is a **cinematic, agent-first authoring tool**. A creator and
an AI collaborator build a world, then descend into one or more tellings — film,
comic, episode, and future formats — from dramaturgy through production and
export. Every surface commits to one focused thing at a time. The chat travels
with you, sees the current scope, and can act through the same cores as the UI.

The studio mirrors how stories are actually built: **non-linear iteration across distinct phases**, with each phase's output flowing forward as a snapshot that can be re-synced when upstream changes.

## Core principles

1. **Cinematic, not utilitarian.** Each phase is its own canvas. Full-bleed when focused. No modals stacked over modals.
2. **Chat travels with you.** The AI agent is a persistent sidebar — sees focus, can act, can diagnose. Not a popup, not a separate tool.
3. **Snapshot + resync, everywhere.** Downstream stages snapshot from upstream. Edit either side freely. Resync is always explicit.
4. **The agent owns the loop, the writer owns the vision.** Agent fills, suggests, renders. Writer edits freely, redirects, decides.
5. **Style is a leash, not a suggestion.** Visual style locked at Phase 0 governs every render across the project, until you change it.

## The pipeline

**As shipped (the left icon rail):**

```
Style → Story → World → Storyboard → Script → Explore → Production
                                       ↑          ↑         ↑
                                    Scenes    read-only   coverage gallery →
                                    /shots    screenplay  timeline + editing
```

> ⚠️ The Phase 0–5 write-ups below are the ORIGINAL design and use the old
> phase order/names (`Style → World → Script → Storyboard → Production → Post`).
> Shipped reality differs: **"Script" was renamed "Story"** (logline/synopsis/
> beats), a read-only **Script** (screenplay assembly) view was added later,
> **Post was folded into Production** (the timeline + chop/trim editing), and
> the **Explore** phase (coverage gallery, E1) was added 2026-06-20. Trust the
> Implementation-status section + `STATE.md` for what exists; read the write-ups
> below for design *intent* per surface.

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
- **Assets become a drawer**, removed from the top-level phase nav. (Still in top nav as of last commit — pending move to drawer.)
- **The frame workbench's design language** (cinematic, full-screen, single-source-of-truth prompt, last-render diagnostics) is the template for every other workbench.

---

## Implementation status (as of 2026-05-28)

What's shipped, ordered by commit. Use `git log --oneline` to inspect.

**Pipeline phases** — current order: Style → Story → World → Storyboard → **Script** → Production, with **Assets** pinned below. Nav is now a **left vertical icon rail** (click-toggle to expand labels), not the old top-center row. The `screenplay` row is the read-only composite Script view.
- ✅ Style (Pre-Pro view) — visual style spec, style ref pins, test render bench. **Now also: project-level Output Format picker (aspect ratio — 9-preset grid incl. 9:16 microdrama) and Image Model picker (NB2 / Pro / legacy / GPT Image), both stored on `styleProfile` and applied to every render. Test bench shows per-tile diagnostics (backend, ref count, style-locked badge, full prompt sent).** The agent can see pinned style refs here and write the style prompt via tools.
- ✅ Story (was "Script") — slim Pre-Production phase. Stages: Logline, Synopsis, Theme, Motifs, Act Summary, Beat Sheet. The character/scene-list/The-Write surfaces dropped (World owns characters; Storyboard owns scenes; per-scene prose owns long-form). Data model preserves the dropped fields for backward compat.
- ✅ World — EntityWorkbench (rebuilt 2026-05-27): top entity thumb strip, left spotlight carousel cycling through primary/variations/gallery, right Story/Media/Connected tabs, bottom action bar
- ✅ Storyboard (rebuilt 2026-05-27 stage 2) — **the master organizing surface**: Acts → Scenes → Shots hierarchy. ProjectAct data model (id, title, arc, order). Scene cards grouped under their parent act; unassigned scenes in a trailing bucket. Inline-editable act titles + arc descriptions. + Add Act / + Add Scene controls. Per-scene "Page" action generates a multi-panel storyboard from scene prose. The page generator + library are a collapsible footer section.
- ✅ Production (rebuilt 2026-05-27 stage 3) — **the editing timeline**. Top: large viewer rendering the active clip's shot image + transport (play/pause/seek, prev/next shot, scrubber, zoom controls with ± buttons, fit-to-width, ctrl/⌘+scroll zoom, +/- keyboard shortcuts). Right: scene-grouped shot picker (drag shots onto tracks). Bottom: multi-track timeline with editable track names, mute, delete; clips drag to reorder within and across tracks, right-edge handle resizes duration, per-clip remove. Click a clip → opens a 360px **clip inspector** beside the tracks: preview image, scene/shot info, duration slider+input, dialogue, cinematography pills, alternate-takes gallery, action buttons (re-render shot, open workbench, open scene, remove). Playhead overlay line. Auto-populate button fills the main video track from acts → scenes → shots in story order.
- ✅ Post-Pro — folded into Production. The legacy "Post" phase is no longer separate; the editing line lives in Production.

**Vocabulary** — user-facing only; data fields unchanged:
- "Frame" → "Shot" everywhere in the UI (data field stays `scene.frames`, type `SceneFrame`, AI tools `generate_frame_image` etc. for backward compat)
- "Script" phase → "Story" phase

**UI shell**:
- ✅ **Two-state chat** (director mode): collapsed = centered bottom quick-prompt bar over a full-width canvas; expanded = full right side chat panel. Both share the same `input` + conversation; sending from the bottom bar opens the panel. State = `isChatExpanded` (default false → bottom bar). Prose mode still has its old inline chat.
- ✅ **Chat-width is a CSS var.** The root sets `--chat-w` (`420px` when expanded, `0px` collapsed); the canvas + all fullscreen workbenches use `right-[var(--chat-w)]` so they go full-width in bottom-bar mode without threading a prop into every overlay component.
- ✅ Inline detail workbenches (no modals): Entity, Scene, Frame, Artifact, Asset, Storyboard all use `fixed left-14 right-[var(--chat-w)] top-12 bottom-0 z-40 bg-slate-950` (`left-14` clears the phase rail).
- ❌ Assets-as-drawer (Assets is now the bottom item of the left rail; slide-in drawer still unbuilt)
- ❌ Resizable chat sidebar (fixed 420px when expanded)

**Image generation**:
- ✅ **Nano Banana 2 (`gemini-3.1-flash-image-preview`) is now the default** — Google's recommended best-all-around model. 14 refs (10 object + 4 char fidelity), 4K, ultra-wide ratios (1:4/4:1/1:8/8:1), 512 fast tier. `ImageGenerator.defaultModel` + `isGen3` flag (covers Pro + NB2 for 14-ref + imageConfig support; legacy 2.5 caps at 3).
- ✅ Nano Banana Pro (`gemini-3-pro-image-preview`) + legacy (`gemini-2.5-flash-image`) selectable per-project.
- ✅ GPT Image 2 (generations) + GPT Image 1 (edits) with auto-fallback for OpenAI's edits-validation bug
- ✅ **Project-level model + aspect ratio** on `styleProfile.imageModel` / `styleProfile.aspectRatio`. Server helpers `getProjectImageModel()` / `getProjectAspectRatio()` resolve them with per-call override precedence. Applied across `/render`, `/visual/entity/:id` (portraits + locations), `/visual/edit-image`, `/visual/camera-angle`.
- ✅ Style lock — `styleAssetIds` on project, auto-attached to every `/render` AND now the templated portrait endpoint (`/visual/entity/:id`) as image references with the strong "PROJECT STYLE REFERENCE — adopt rendering technique EXACTLY" directive. (Was the cause of photoreal portraits ignoring an anime style spec — text-only directive lost to training bias; image refs are the real leash.)
- ✅ Tool results expose `actualPromptSent`, `referencesAttached`, `styleDirectiveApplied`, `backend` — agent can diagnose off-look renders without grep
- ⚠️ **Active-project drift gotcha (fixed but watch for regressions):** the server tracks an `isActive` project; endpoints fall back to it when `projectId` is omitted. The UI now (a) POSTs `/api/projects/switch` on project change and (b) passes `projectId` explicitly on style-pin / test-bench / portrait calls. If renders ever pull the wrong project's style refs again, this is the first place to look.

**Agent capabilities**:
- ✅ Sees: current phase, script status (which stages are filled), world summary, asset catalog, focused entity/scene/frame, pinned entities
- ✅ Phase-aware tool emphasis (system prompt teaches which tools fit which phase)
- ✅ Snapshot+resync awareness (don't auto-propagate across links; suggest resync)
- ✅ ~95 total tools, SSE streaming of tool calls + results to the chat
- ✅ **Phase-scoped tool filtering (stage 3)** — each tool is tagged with its phase(s) in `TOOL_PHASES`; at chat time the active UI row (`UI_ROW_TO_PHASE`) picks the phase and `getToolsForPhase()` sends only relevant + always-available tools to Gemini. ~90 → ~30–40 per turn.
- ✅ **Sees THE on-screen image (not the entity primary).** `currentViewImage` is derived in the UI from the active workbench (Shot frame → Scene hero → EntityWorkbench carousel spotlight → timeline-selected clip) and sent in `selection.currentViewImage`. The server attaches it FIRST in the image context with an unmissable "THE IMAGE THE USER IS CURRENTLY LOOKING AT — URL: ..." label.
- ✅ **Edits the on-screen image.** `edit_image` and `change_camera_angle` take an `imageUrl` param that overrides entity/scene/frame lookup. When passed + an entity is focused, the result lands in that entity's `imageGallery` (original preserved). System prompt has an explicit 3-lane guide: edit_image (surgical) / change_camera_angle (new perspective) / generate_* (full re-roll).
- ✅ **Visual honesty directive** — system prompt instructs the agent to describe what's ACTUALLY in the attached image, flag style mismatches ("the portrait we have is photoreal — doesn't match the anime style"), and say "I don't have a visual yet" rather than confabulating from the description. (Was parroting the style spec back as if it were the image.)
- ✅ **Style-phase asset sight** — pinned style refs auto-attach to chat in the Style phase. New tools: `look_at_asset` (load any asset into visual context), `update_visual_style_prompt` (write the locked style spec). Plus `update_script_motifs`.
- ✅ **Acts + timeline tools** — `create_act` / `update_act` / `delete_act` / `reorder_acts` / `assign_scene_to_act` / `list_acts`; `list_timeline` / `auto_populate_timeline` / `add_timeline_track` / `delete_timeline_track` / `add_timeline_clip` / `update_timeline_clip` / `delete_timeline_clip` / `reorder_timeline_clips`; `generate_shot_variant` / `promote_shot_variant` / `delete_shot_variant`.

**Frame workbench (the cinematic template)**:
- ✅ Full-canvas layout: top frame strip, left big image (with overlays for camera/edit), right tabbed inline-editable metadata, bottom action bar
- ✅ Single canonical `imagePrompt` field per frame — replaces the three-way fight between description / image_prompt / visual_direction
- ✅ Last-render diagnostics on each frame: lastImagePrompt (full prompt sent), backend, styleDirectiveApplied, referencesAttached — surfaced in collapsible section
- ✅ Storyboard-source thumbnail when frame was extracted from a panel
- ⚠️ Manual buttons (Re-render image, Camera Angle, Edit) still call the OLD templated `/api/narrative/visual/frame/:sceneId/:frameId` endpoint, not the clean `/render` path. Should migrate.

---

## Roadmap

### ✅ Shipped (this multi-session run — all 2026-05-27/28)

The entire 4-stage pipeline restructure + extensive timeline polish + an image/agent-vision overhaul landed. In commit order:
- **Scene workbench** cinematic rebuild → **drop scene carousel** + Script↔Storyboard↔Frame integration.
- **Pipeline stage 1** — Script→Story slim (logline/synopsis/theme/motifs/acts/beats; dropped character/scene-list/Write surfaces; phase reorder to Style→Story→World→Storyboard→Production).
- **Pipeline stage 2** — Acts→Scenes→Shots hierarchy in Storyboard (ProjectAct model, CRUD, AI tools, Frames→Shots relabel).
- **Pipeline stage 3** — Production becomes the editing timeline (ProjectTimeline model, TimelineView, AI tools, phase-scoped tool filtering).
- **Timeline polish 3.1–3.4** — zoom controls, clip inspector, shot variants, time ruler, create-from-timeline, ruler/clip alignment fix, dangling-clip cleanup, project-switch refetch, undo/redo, drag-to-scrub, scene color-coding, split-at-playhead.
- **Image pipeline + agent vision (3.5)** — NB2 default; project aspect-ratio + model pickers; portrait style-ref images (anime-fix); active-project-drift fixes; test-bench diagnostics; agent sees+edits the on-screen image; visual-honesty directive; look_at_asset / update_visual_style_prompt tools.

### ✅ Shipped (2026-05-28 session)

- **Pipeline stage 4 — Script composite view** (`ScreenplayView` in `ui/app/studio/page.tsx`). Read-only assembled screenplay: walks acts → scenes → shots, renders scene prose + per-shot description + dialogue (auto-formats `NAME: line` as character cues + parentheticals). Continuous scene numbering, unassigned-scenes bucket, toggles for shot-breakdown / shot-images, Copy-to-clipboard plain-text dump. Slugline → jumps to scene in Production; shot → opens frame workbench. New nav row `screenplay` (→ `'storyboard'` phase in `UI_ROW_TO_PHASE`). No data-model changes.
- **Left phase nav rail** — replaced the top-center nav row (which overflowed once Script was added). Vertical icon rail on the left edge, **click-toggle** to expand labels (`railExpanded` state — NOT hover). Assets pinned to the bottom. Canvas shifted to `left-14`; inline workbenches to `left-14`; phase-view `pt-32` → `pt-8`; rail + canvas use `top-20` when an entity is focused (focus strip grows the header), else `top-12`.
- **EntityWorkbench**: added a "← All entities" exit button (clears `selectedEntity` + focus); fixed a hooks-order crash (spotlight derivation + surface-to-chat `useEffect` were after the early returns → "Rendered more hooks than during the previous render"; now hoisted above the returns, null-safe).
- **Image pipeline / style-pin fixes** (see gotchas #11–#13):
  - **Style-pin persistence bug fixed** — pins were silently wiped. `PUT /api/projects/:id` now preserves `styleAssetIds` when the client omits them.
  - **Auto-pin style refs on upload** — "Upload style reference" now pins server-side. Unpinned style tiles show a persistent "not pinned" badge.
  - **camera-angle / edit-image now apply project style** — shared `buildProjectStyleForEdit()` attaches the style directive + pinned style-ref images (mirrors `/render`); both honor the project's model + aspect ratio. Executors return `entityId` so the gallery/carousel refresh.
  - **Assets panel rollup fix** — `/assets/generated` read non-existent `e.gallery` / `e.imageVariations`; corrected to `e.imageGallery` / `e.portraitVariations` (string URLs).
  - **Test bench uses the project's model** — the bench's model dropdown was removed; it now renders with `styleProfile.imageModel` (set via the Style page's Image-model picker, which has all four options incl. Pro). The bench is now a faithful preview of the real pipeline (spec + pinned refs + aspect + model).

### ✅ Shipped (2026-05-29 session)

**The big theme: agent-aware shots/scenes + render history + keyframes + a hardened persistence layer.** In commit order (`git log --oneline`):

- **Two-state chat** — collapsed = centered bottom quick-prompt bar over a full-width canvas; expanded = full right side chat. Chat width is a CSS var `--chat-w` (`420px`/`0px`) the canvas + all overlays read (`right-[var(--chat-w)]`). Sending from the bottom bar stays collapsed with a spinner + an unseen-reply badge.
- **`tsx watch` fix (critical)** — `api:dev` was plain `tsx` (no watch); the running API never reloaded source edits, so a whole arc of server fixes silently didn't take effect. Now `tsx watch`. See gotcha #14.
- **Carousel auto-switch** — agent-generated/edited entity images jump the spotlight to the new image (original preserved).
- **Phase A — agent-aware shots/scenes:**
  - `add_related_shot` tool — one-move "follow-up / zoom / reaction / filler" shot: inserts after the reference shot, inherits cast + location, renders with continuity refs (cast portraits + reference shot image + project style). Existing shots untouched.
  - Focus is sent consistently from a SINGLE source (open Shot workbench → timeline clip on the Production row → Storyboard browse-focus → carousel/Scene workbench) so scene + frame never mismatch (that mismatch put new shots in the wrong scene).
  - **Storyboard browse-focus** — click a shot thumbnail in the Storyboard grid to focus it for chat (highlight) WITHOUT opening the workbench; hover Maximize2 to open it. `storyboardFocus` state.
  - The agent already gets a rich sibling-shot breakdown when a scene is focused + a CURRENT-FRAME block when a shot is focused (this existed); guidance now points at `add_related_shot` / `generate_shot_keyframes`.
- **Phase B — render history + alternates everywhere:**
  - `pushFrameRenderHistory()` — every re-render/edit (chat tools + manual workbench buttons) preserves the prior render as a take in `frame.variants` (deduped, ~12). So "Alternate takes" doubles as a revertible history.
  - The "Alternate takes" gallery now shows in BOTH the timeline clip inspector AND the Frame workbench (roll / promote / delete).
  - Per-clip `imageUrlOverride` deliberately NOT built — judged low-value (promote covers the 90% case; override only matters for the same shot reused with different takes). Revisit if the reuse case shows up.
- **Phase C — timeline scene boxes + collapse/expand** — each scene's run of clips gets a labeled colored bounding box; the chevron collapses a scene into one block (count · duration + thumbnail); "Collapse all / Expand all" in the toolbar. Collapsing keeps the time span so the ruler stays aligned. `sceneSegments` computed per primary track; `collapsedScenes` Set.
- **First/last keyframes** (`generate_shot_keyframes`) — a shot's image-to-video endpoints: agent writes a START-state + END-state prompt, renders both (last anchored to first for consistency), stored as `frame.firstFrame` / `frame.lastFrame` (separate from the main still). Shown as a "first → last" strip in the Frame workbench + timeline clip inspector.
- **Chat persistence** — generated images + tool-call chips now survive reload: a sanitized `toolUsage` (base64 `_imageParts` stripped) is saved on the assistant message + returned from `/chat/history` + restored in the UI. New conversations only.
- **Timeline persistence (projectId threading)** — every timeline call now threads `currentProjectId`; previously they hit the server's active project (drift wiped tracks on reload). See gotcha #15.
- **Scene workbench returns to the phase it was opened from** (Storyboard vs Production) — dropped the forced `switchRow("scenes")` in `handleSceneClick`.
- **🎬 VIDEO — Veo 3.1 image-to-video (single shot)** is LIVE. `src/visual/video-generator.ts` (`VideoGenerator`, Veo via the existing `@google/genai` SDK + `GEMINI_API_KEY`). Async job model: `POST /visual/generate-video` (uses a shot's `firstFrame`→`lastFrame` keyframes, else its still, as the start/end) → returns a jobId; server polls Veo, downloads the mp4 to `.narrative-data/generated-videos/`, persists `frame.video`, serves it; UI polls `GET /visual/video-job/:id`. Agent tool `generate_shot_video` ("animate this shot"). Frame-workbench **Animate** button + clip player (defaults to the video, center play button, spacebar). **Timeline plays video clips** in the viewer synced to the transport (durationSec acts as a trim — plays the first N seconds); clip "clip" badge; center play button. Spec-verified against the official Veo docs; gotcha: `durationSeconds` must be a NUMBER, `personGeneration: "allow_adult"` required for i2v.
- **Persistence hardening** — timeline/acts now survive server restart (the load-normalize was dropping them; gotcha #18), and `saveProjectData` writes the local file synchronously (gotcha #19).
- **Timeline UX** — resizable viewer/tracks split (drag handle), and the collapsed quick-chat bar now floats above fullscreen workbenches (`z-[44]`).

### ✅ Shipped (2026-06-20 session — the big one: chop/trim, Seedance built+judged, GPT-Image, entity album/looks, style-leash, assets overhaul)

34 commits. In rough order (`git log --oneline 7fda46b..HEAD`):

**Seedance decisions + spec (`docs/SEEDANCE_MULTISHOT_DESIGN.md`, `docs/SEEDANCE_PROMPTING_GUIDE.md`)** — locked the 5 open decisions with Michael: proportional+manual chop, **virtual** chop, user-selected runs, single/sequence clips coexist, Seedance via Replicate. The single-page storyboard grid is the primary multi-shot reference.

**Timeline — P2 virtual chop + the editing toolkit** (model-agnostic, works on Veo clips):
- `ProjectTimelineItem.{sourceVideoUrl, inSec, outSec}` — a clip plays a `[inSec,outSec)` window of a source video. INVARIANT: `durationSec === outSec - inSec` (footprint = played length), so all the existing duration-driven playhead/ruler math is untouched. Source priority at playback: `clip.sourceVideoUrl` (a chopped sequence) over the shot's own `frame.video`.
- **Trim handles** — left edge = in-point (slides the window), right edge = duration/out. A `resizingClipRef` guard stops the clip's native HTML5 drag from hijacking the handle (gotcha #20).
- **Splice workflow** — `S` split / `[ In` (`I`) / `Out ]` (`O`) act on whatever clip the playhead is inside (not just the selected one); split is virtual-chop-correct (both halves play contiguous slices of one source). Toolbar + keyboard.
- **Sequence lane** — a dedicated lane under the primary track shows one bracket BAR per ≤15s chunk (the run that becomes one Seedance clip), with the generate/regenerate control. Replaced the old whole-scene-compress approach.

**Video — Veo fix + Seedance backend (P1) + multi-shot (P3):**
- **Veo boomerang fix** — first→last clips were drifting back to the opening frame; the Animate prompt defaulted to the STATIC still description, so Veo padded the locked 8s by returning. Now reframed as a one-way "end on the last frame, no loop/reverse" directive. (API wiring was correct — image→config.lastFrame verified against `@google/genai` 1.35.)
- **P1 — `src/visual/seedance-generator.ts`** (ByteDance `bytedance/seedance-2.0` via Replicate predictions API, raw fetch). Single-shot interpolation + reference (omni) mode. Wired as video backend #2 behind the same async job model; a Veo/Seedance toggle on the Animate button. Verified end-to-end against Replicate.
- **P3 — multi-shot sequence + proportional chop** — `POST /visual/generate-sequence-video` composes a timecoded shot-script from a run of shots, assembles refs, runs an async Seedance job, then writes `scene.sequenceVideo` and **chops it across the run's timeline clips** via the P2 in/out fields. Agent tool `generate_sequence_video`. `≤15s` chunking computed on the timeline; per-chunk "Seq" bars.
- **Composer rewrite per the Seedance filter guide** — `@Image` role assignments at the top, a PRODUCTION BRIEF header (so the content filter reads it as a film), per-shot visual facts only, no character re-description (the ref image carries identity).
- **grid-only refs + programmatic grid composer** — `src/visual/grid-composer.ts` (sharp) composites a run's shot stills into one numbered grid → Seedance's `@Image1`, dropping the tight cast portraits (the face-scan mitigation). Auto-attaches a GPT storyboard grid when shots came from one.

**⛔ THE SEEDANCE VERDICT (critical — see gotcha #21):** Seedance's image-scan rejects clear **realistic faces, even AI-generated**, *before* it reads the prompt (E005 "sensitive" / "copyright"). This project is photoreal, so **Seedance multi-shot is a dead end here.** The grid-only path got *past* the sensitive flag but then hit a copyright/likeness flag — it's a platform limit, not a prompt problem. **Resolution: Veo single-shot is the workhorse (it handles these exact faces); the entire P2 chop/trim/splice editing is model-agnostic and works on Veo clips. The full Seedance plumbing stays — it'd work for a stylized/anime project.**

**GPT-Image fixes** (`src/visual/gpt-image-generator.ts`):
- Sizes: only `1024x1024 / 1536x1024 / 1024x1536` are accepted now (the old 2K/3K sizes 400'd). `aspectToGptSize` maps by orientation.
- Edits run on **gpt-image-2** (works on /edits now; the April-2026 block is gone). `input_fidelity:'high'` is sent ONLY for the gpt-image-1 family (gpt-image-2 rejects it). For the strongest style-lock from refs, set `OPENAI_IMAGE_MODEL_EDIT=gpt-image-1.5`.

**Entity workbench — the album model:**
- **Render single ACCUMULATES** — the first portrait establishes the primary `referenceImage`; every render after that lands in `imageGallery` (auto-labeled), it never silently replaces the primary. The primary changes only via "Set as primary".
- **Labeled looks** — album images are relabel-able ("general", "in armor", "scowling"). An editable label sits over the spotlight.
- **Agent picks the look per shot** — `entityLooks:[{name,look}]` on `generate_frame_image` / `add_related_shot` resolves the labeled `imageGallery` image (else the primary). Scene focus context lists each cast member's looks.
- **Unified All-media album** in the Media tab (primary + variations + gallery + linked assets), and the Media tab now surfaces **linked assets** (was missing).
- Entity portraits/variations now honor the **GPT-Image project model** (the endpoint was Gemini-only).

**Style — the image leash:**
- **`set_style_reference` agent tool + `POST /assets/style-reference-from-url`** — pin a render (URL) as the project style reference. The agent could edit the style TEXT but couldn't pin an IMAGE, which is the real leash (gotcha #9).
- **Subject-leak fix (gotcha #22)** — style refs were typed `'character'`, so the model copied the reference's people (the Arcane-leak). Retyped to `'style'` everywhere; widened the ref-type annotations.
- Strengthened the text-only style directive (imperative "do NOT default to photorealism").

**Storyboard** — `/storyboard/generate` now attaches the scene's cast portraits + location (was style-refs-only → generic invented people).

**Assets — every generation captured, generated images first-class:**
- **Registry** — `ProjectData.generatedImages` + `recordGeneratedImage()` called in `/render` records EVERY render (even free-form exploration not attached to anything). The Generated rollup also emits frame **videos**, **keyframes**, and **takes** (`frame.variants`), and appends registry orphans (deduped by url). Nothing is wasted.
- **Generated tiles get parity** — inline category dropdown + pin/unpin via **materialize-on-action** (`POST /assets/from-url` creates/reuses a real asset). The generated detail modal mirrors the uploaded ASSET modal (one consistent modal; first edit materializes + opens the full editor). Materialized assets carry metadata so the modal no longer shows NaN/Invalid Date.
- **Live-refresh** the Generated tab on scene/entity changes; threads `projectId` (gotcha #8) on `refetchGeneratedAssets`.
- Recategorize an upload from its grid tile; asset-grid bottom padding so the last row clears the floating chat bar.

### ✅ Shipped (2026-06-20 — later: agent operating system + Explore E1)

**The agent operating system** (`AGENTS.md` single entrypoint replacing a stale canon guide; `docs/STATE.md` durable roadmap/decisions/baseline/verification ledger; `docs/AGENT_OPERATIONS.md` principles + session lifecycle + abort-on-smells + parallel protocol; `docs/EXPLORE_FLOW_DESIGN.md` hardened from an adversarial-review workflow). **Historical note:** this session measured 204 total / 147 in server.ts / 0 UI; the 2026-08-01 hardening pass later replaced that debt baseline with a CI-enforced zero-error gate.

**Explore → Curate → Assemble — E1 (per-angle coverage gallery):** the studio's new north star, phase E1.
- **5 agent tools + 3 REST endpoints over shared cores** (`exploreSceneAnglesCore` / `setCandidateKeepCore` / `promoteCandidatesCore`). `explore_scene_angles` (Engine A) renders N angle candidates into `scene.explorations[]` — inheriting cast/location/style, recorded in the registry, NOT shots. `keep_/reject_candidate`, `list_candidates`, and `promote_candidates` (the ASSEMBLE step — the only shot-list mutation; **ORDER CONTRACT**: `candidateIds[]` order IS the shot order; stamps `promotedShotId`). Agent-first: the agent drives the tools, the UI drives the same cores via REST (no LLM for a button click). Render path mirrors `add_related_shot` (self-`fetch` `/render`).
- **The seam (gotcha #16):** `explorations` added to the UI `Scene` interface + `mapScenesFromApi`. `scene.explorations` rides in `interactions[]` → survives `loadProjectData` (`...parsed`) + restart, and `applyStoryGraphDiffs` spreads `...scene` so the GET preserves it — but the UI whitelist dropped it until this branch landed.
- **`ExploreGalleryView`** — a new **Explore** left-rail peer phase: keyboard-first contact sheet (←/→ scrub, K keep, X reject, C compare), big focused preview, a draggable **selects row** (order = promote order), and a non-modal **promote bar** → shots.
- Verified end-to-end (both agent + REST paths; the order contract proved by promoting a reversed selection). **Pending: one in-browser pixel/click pass** (Chrome extension was disconnected this session).

### ✅ Shipped (2026-06-21 — Director Foundation V1: the agent's senses + brain)

From the three-audit review in `DIRECTOR_ROADMAP.md`; all verified live on throwaway projects (cleaned up):
- **ffmpeg enters the codebase** (`src/visual/video-frame-extractor.ts` — `FFMPEG_PATH` → bundled `@ffmpeg-installer` → PATH; duration from the `-i` banner, no ffprobe). Foundation for export (V4), E2, audio mux.
- **`watch_shot` — the agent watches its clips.** Attaches the ACTUAL mp4 as a native Gemini video part (motion + **audio** perception — verified with a timestamped soundscape report; Michael's call, better than sampled stills); sequence shots window via `videoMetadata` offsets; oversized files fall back to ffmpeg frames. `ImagePart` in `src/llm/gemini.ts` now carries video mimeTypes + `videoMetadata`.
- **Curation sight** — `list_candidates` + `explore_scene_angles` attach a numbered contact-sheet grid (reuses `composeShotGrid`), so the agent sees every take it curates.
- **The film-director persona** — DP/editor craft layer in the system prompt (coverage doctrine, shot grammar with intent, lens psychology, 180°/eyelines, editorial rhythm), the **directing loop** as default for "shoot this scene" (explore → look → curate → promote → animate → WATCH), self-critique before presenting. Verified: agent caught a continuity break in its own dailies and cut in stated editorial order. `maxIterations` 8 → 24.
- **Motion-note field** on Animate (both call sites — the strongest Veo guide was UI-unreachable); **bounded worldSummary** (full lines for first 40 + focused/pinned, name-only beyond; relationships capped at 120).

### ✅ Shipped (2026-08-01 — foundation hardening and connection pass)

- **Scoped UI state is now a contract.** Production cards activate the target
  before descent and hydrate by explicit project+production; project switches
  invalidate stale loads. Canvas and Documents flush pending writes against the
  project that owns them, expose failures, and retain a dead-letter when unload
  cannot send. Scene/frame mappers preserve unknown fields.
- **Core domain boundaries were made truthful.** Final renders expose the actual
  provider prompt, ordered/clamped references, style application, output, and
  archive record. Per-call style options no longer bleed across requests. Canon
  event writes share one checked boundary; editing canon requires an explicit
  retcon override. Dramaturgy reorder rejects partial/duplicate sets and legacy
  script mutation surfaces cannot reopen the split-brain.
- **The local service has a real boundary.** API and UI bind loopback; CORS is an
  allowlist; identifiers and served filenames are contained; request/upload
  sizes are bounded; project deletion drains queued writes and archives the
  recoverable world package. The incomplete Mongo path is disabled.
- **The engineering floor is enforceable.** Root and UI typechecks are zero,
  deterministic tests are green, CI installs/tests/types/builds on Node 20,
  production start checks its artifacts, and both production dependency audits
  are clean. The stale library README was replaced with the Studio's real
  architecture and runbook.
- **Browser proof:** disposable world with Film B active → click Film A → Film A
  became active before hydration and its A-only scene appeared. Coherence was
  restored; FABLE was untouched; fixture data was cleaned.

### ✅ Shipped (2026-08-01 — cross-checkout recovery and integrity pass)

- **The file store is now a transaction system, not a pile of optimistic
  renames.** Project and catalog locks are visible across symlinked checkouts;
  archives carry an exact four-file move journal and a durable tombstone;
  project creation and nit→world publication carry crash intents with exact
  pre-publication evidence. Real SIGKILL tests prove both recovery paths.
- **Recovery is guarded operator work.** Archive, creation, publication, and
  ordinary stale-lock incidents each have an inspect-first CLI. Fresh owners
  are never stolen and changed evidence aborts. Creation, publication, and lock
  recovery record intent before mutation; archive restoration stays governed
  by its adopted tombstone and records a prepared audit before removing it.
  Every path retains a durable audit and its archives/backups. The runbook is
  `docs/STORAGE_RECOVERY.md`.
- **Parseable is no longer mistaken for sound.** World loads require the
  load-bearing arrays. Canon ledgers prove schema, commit content hashes,
  parent ordering/reachability, operation replay, every branch snapshot, and
  latest world acknowledgement. Missing primaries/backups, parseable empty
  shells, stale sidecars, torn pairs, and cold catalog loss fail closed. All 30
  existing world artifacts pass the stronger proof.
- **Concurrency is explicit.** Project blobs and same-ID catalog replacements
  use compare-and-save; external file revisions invalidate caches and world
  sessions; API conflicts return 409 + `reloadRequired`. Media workflows use a
  bounded stable-ID rebase only for their known attachment fields, so a paid
  render's registry entry, shot/gallery/page attachment, and unrelated
  concurrent fields all survive without turning authoring into last-write-wins.
  The legacy artifact and storyboard routes now register first and fail closed
  on registry publication instead of saving a stale pre-render world.
- **The deferred connection pass landed too.** UI + agent have one lossless
  world-data export; export snapshots catalog/world/nit under one project
  boundary and fails on incoherence. Superseded loads are cancellation, deep
  links hydrate the requested production, scene saves serialize and visibly
  roll back, the inspectable styleless render directive is restored, and real
  asset drops batch through the bounded upload contract.
- **Adversarial gate:** no residual P1/P2 integrity defect; 29/29 root suites,
  344 passing tests (+22 intentional skips), both TypeScript trees at zero,
  API + Next 16 production builds clean, production audits at zero. The living
  :3088/:3089 stack remained up throughout.

### ⏳ Still pending (pick up here)

> **The live, structured roadmap is `docs/STATE.md`** (per-phase status, Now/Next/
> Blocked, decisions, baseline). This section is its prose mirror — keep both honest.

1. **Creator click-pass:** Dramaturgy slice 1, the Style loop, Canvas, and the
   focused E1 Explore flow. The production-descent integrity path is verified;
   these richer interaction surfaces still need the creator's eye.
2. **Dramaturgy slice 2:** chronology ribbon + Quarry claim-by-drag, THE READ,
   dream_structure staging, threads, fuller vantage comparison, question
   bracket. See `DRAMATURGY_DESIGN.md`.
3. **Canon depth:** entity draft→canon lifecycle, richer temporal rules, and C4
   event-aware branch merge/conflict resolution. Canonization today is an
   honest gated status transition, not a merge.
4. **Formats and sound:** one music bed over the cut, then first-class shorts
   and microdrama instead of coercion to film. V5/V6 remain the Director-roadmap
   design work; V1–V4 are shipped.
5. **Ingest and distribution:** T2 source ingest, then reactive hooks and
   distribution. The Stories page's fake partial import and empty-shell
   duplicate and story-package export actions were removed until lossless
   equivalents exist. Film and comic deliverable exports remain in their
   production workbenches.
6. **Deployment boundary:** local single-user is shored up. Remote/multi-user
   use is blocked on authentication, authorization, and an intentional shared
   state model.
7. **Structural extraction:** `server.ts` and `page.tsx` remain monoliths.
   Extract around tested domain cores as the shape stabilizes; do not perform a
   cosmetic rewrite that breaks agent/UI parity.

**Future / longer-term** (not in immediate roadmap):
- Seedance exploration for stylized projects only (photoreal stays shelved)
- Deeper audio (VO / SFX / score and waveform editing)
- Real-time multi-author collaboration
- Full event-aware branching and merge UX
- Live entity-name linking in script text
- Storyboard-extracted frames auto-anchor on first re-render

---

## Architecture patterns established (for the next agent)

### The cinematic workbench pattern

Every workbench follows the same shape:

```
┌─────────────────────────────────────────────────────────┐
│ Top bar — thumb strip + back nav + close                │
├──────────────────────────────┬──────────────────────────┤
│                              │                          │
│   Left: large image canvas   │  Right (420px): tabs     │
│   with arrow nav + overlays  │  with inline-editable    │
│                              │  metadata, autosave-on-  │
│                              │  blur                    │
├──────────────────────────────┴──────────────────────────┤
│ Bottom action bar — discrete labeled buttons            │
└─────────────────────────────────────────────────────────┘
```

Templates: see `FrameDetailView` (in `ui/app/studio/page.tsx`) and `EntityWorkbench` (same file). Scene workbench, when built, should follow the same shape with a frame strip on top.

### Outer wrapper for inline workbenches

All inline detail views use:
```jsx
<motion.div
  className="fixed left-0 right-[420px] top-12 bottom-0 z-40 bg-slate-950"
>
```

`left-0` = no left offset, `right-[420px]` reserves the chat sidebar, `top-12` clears the header, `z-40` is below modals (z-50) but above the chat (z-30). This pattern is used for every inline workbench.

### Chat sidebar

Fixed-position right sidebar in director mode. **Location in code**: the chat JSX block lives at roughly `ui/app/studio/page.tsx:~6171` (director mode block). It was MOVED to a fixed wrapper but the chat content is still inline JSX, not extracted to a component. Prose mode chat still lives at its original bottom position — needs a parallel move.

Wrapper:
```jsx
<div className="fixed right-0 top-12 bottom-0 w-[420px] z-30 px-2 pb-2 pt-2">
  <motion.div className="h-full flex flex-col bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
    {/* header */}
    {/* AnimatePresence messages */}
    {/* input */}
  </motion.div>
</div>
```

### Spotlight carousel pattern

When a focused subject has multiple images (variations, gallery), combine them into one navigable sequence with the canvas as the spotlight. Don't show big primary + tiny thumbnails — every image deserves the same canvas size. Right-column thumbnails are click-to-jump indicators with hover-actions.

Implementation reference: `EntityWorkbench` left canvas in `ui/app/studio/page.tsx`. The combined list is built per-render from `[primary, ...inFlightVariations, ...persistedVariations, ...gallery]`, deduped by URL.

### Snapshot + resync chain

Locations where snapshot+resync is implemented:
- **Script stages**: each downstream stage snapshots from upstream conceptually; explicit resync via UI buttons or AI tools (`resync_scene_list_entry`)
- **Script.sceneList → production Scene**: `linkedSceneId` on the entry; `promote_scene_list_entry` tool creates the Scene; `resync_scene_list_entry` pulls back
- **Script characterSummary/characterList ↔ World entity**: `linkedEntityId` on the entry; edits stay isolated until explicit resync
- **Storyboard panel → frame**: `sourceStoryboardId`, `sourceStoryboardPanelIndex`, `sourceStoryboardImageUrl` on the extracted frame

Design rule: **never auto-propagate across snapshot links**. The agent can SUGGEST resync when drift is visible, but only acts on it with the writer's consent.

### Agent context — what's in the system prompt every turn

Order matters. Each block is computed fresh from project state:
1. Pipeline status (current phase + status counts + phase-appropriate advice)
2. Script status (which of the 10 stages are filled + previews)
3. World summary (entities by type + relationships)
4. Asset catalog (compact summary by category)
5. Focus context (queryGraphContext for currently-focused subject)
6. Entity / Scene / Frame focus context (rich detail block when focused)
7. Pinned context (working-memory entities)
8. Scratchpad context (world-bible docs)
9. Insert position / decision context
10. Recent messages (last 10)
11. Writing style + visual style profiles
12. UI context from client
13. Additional system prompt from client

This block is built in `src/api/server.ts:~12340-12500`. Update it carefully — order affects how the agent interprets the world.

### Image generation routing

```
/api/narrative/visual/render    ←  the clean pipe (no template injection)
                                   - AI's prompt → model verbatim
                                   - + project style directive auto-prepended
                                   - + project styleAssetIds auto-attached
                                   - backend picked from `model` param
                                     "nano-banana" → ImageGenerator (Gemini)
                                     "gpt-image" / "gpt-image-1" / "gpt-image-2" → GptImageGenerator (OpenAI)
                                   - GptImageGenerator internally:
                                     - text-only → /images/generations on gpt-image-2
                                     - with refs → /images/edits on gpt-image-1 (auto-fallback from gpt-image-2)
                                   - Returns: imageUrl, actualPromptSent, styleDirectiveApplied,
                                     referencesAttached[], backend
```

Every render tool executor (`generate_portrait`, `generate_frame_image`, `generate_scene_image`, `add_entity_image`, `generate_artifact_image`, `generate_storyboard_page`) routes through `/render` with the agent's prompt. The OLD templated endpoints (`/visual/frame/:sceneId/:frameId`, `/visual/scene/:sceneId`, etc.) still exist for the UI's manual buttons but should be migrated.

### Key files

- `ui/app/studio/page.tsx` — the entire studio shell + every workbench (~17,500 lines, monolithic on purpose for state coherence). Key components: `EntityWorkbench`, `SceneDetailView`, `FrameDetailView`, `SceneGrid` (legacy, prose-mode only), `TimelineView`, `StoryboardView`, `ScriptPhaseView`, `PreProductionView`, `NewSceneComposer`.
- `src/api/server.ts` — Express API + AI tool executors + system prompt assembly (~17,000+ lines). Tool defs in `narrativeWorldTools`; executors in `createToolExecutor`; phase-scoping in `TOOL_PHASES` / `getToolsForPhase`; chat handler + image-context assembly near the bottom (~line 14,700+).
- `src/llm/gemini.ts` — Gemini SDK adapter, multi-turn tool execution, SSE streaming, `imageContext` attachment
- `src/visual/image-generator.ts` — Nano Banana (Gemini) wrapper. `NanoBananaModel` union, `isGen3` flag, per-model ref/size budgets. NB2 default.
- `src/visual/entity-portrait-generator.ts` — portrait/location wrapper around ImageGenerator. Now takes `aspectRatio` / `imageSize` / `model` options.
- `src/visual/gpt-image-generator.ts` — GPT Image wrapper with dual-model fallback
- `src/storage/storage-adapter.ts` — `ProjectData`, `ProjectScript`, `Asset`, `ProjectStyleProfile`, **`ProjectAct`, `ProjectTimeline` / `ProjectTimelineTrack` / `ProjectTimelineItem`** types. `ProjectStyleProfile` now carries `aspectRatio` + `imageModel`.
- `src/config/models.ts` — chat model IDs + selection strategy. Default is `gemini-3.1-pro-preview-customtools` (NOT the base 3.1-pro — see comment in that file for why). NOTE: image-model defaults live in `image-generator.ts`, not here.

### Data model quick reference (server-side, on `ProjectData`)

- `interactions[]` — scenes. Each has `frames[]` (= SHOTS in the UI). Fields: `scene.actId` (parent act, nullable), `frame.durationSec` (timeline default), `frame.variants[]` (alternate takes — also doubles as render HISTORY via `pushFrameRenderHistory`), `frame.firstFrame` / `frame.lastFrame` (`{url, prompt, generatedAt, backend}` — image-to-video keyframes, separate from the main `imageUrl`), `frame.video` (`{url, status, jobId, model, usedInterpolation, firstFrameUrl, lastFrameUrl, generatedAt}` — the generated Veo clip). **Any new frame field must be added to `mapScenesFromApi` in the UI (gotcha #16) AND survive `loadProjectData` on the server (gotcha #18 — now `...parsed`-spread, so top-level fields are safe; nested frame fields ride inside `interactions`).**
  - Shot tools: `add_related_shot` (create+render a consistent follow-up/zoom/filler relative to the focused shot), `generate_shot_keyframes` (first/last keyframes), `generate_shot_video` (Veo 3.1 animate, async), plus the existing `insert_frame` / `update_frame` / `generate_frame_image` / `generate_shot_variant` / `promote_shot_variant` / `delete_shot_variant`.
- `acts[]` — `ProjectAct { id, title, arc, order }`. Top-level story arcs; scenes link via `actId`.
- `timeline` — `ProjectTimeline { tracks[], items[], playbackRate? }`. `track { id, name, kind, order, muted }`; `item { id, trackId, sourceType:'shot', sourceSceneId, sourceShotId, order, durationSec, label }`. Items reference shots by id — never duplicate image data.
- `script` — `ProjectScript`. Slim Story phase surfaces logline/synopsis/theme/`motifs`/actSummaries/beatSheet; characterSummaries/characterList/sceneList/write retained for backward-compat but not surfaced.
- `assets[]` — uploaded refs. Entities also carry `imageGallery[]` (where agent edits land) + `portraitVariations[]`.
- Project (separate `projects` array, not ProjectData): `styleProfile.{ visualPrompt, styleAssetIds, aspectRatio, imageModel }`.

---

## Known issues / gotchas

### From building this — don't repeat

1. **`@google/genai` SDK shape**: `GenerateContentParameters` only accepts `model`, `contents`, `config`. Anything else (tools, toolConfig, systemInstruction) at the TOP level is silently dropped. Everything must nest under `config`. We hit this once — the agent's tool calls were all dropped because we put `tools` at top-level. See `src/llm/gemini.ts` `runWithTools`.

2. **gemini-3.1-pro-preview vs -customtools**: The base 3.1-pro model has a bias against custom user-defined function tools and produces refusals like "I'm a text-based assistant and can't generate images" even when the tools exist. Use the `-customtools` variant. Set in `src/config/models.ts`.

3. **`responseSchema` + `tools` conflict on Gemini 3.1 Pro**: combining both makes the model ignore the tools. The chat path uses tools-only multi-turn execution (Pattern C); structured-output extraction lives in a different code path.

4. **Schema casing**: Gemini's tool schema wants `Type.STRING` / `Type.OBJECT` etc. (uppercase), not the OpenAPI lowercase `'string'` / `'object'`. We have a normalizer `normalizeSchemaNode` that recursively uppercases.

5. **gpt-image-2 on /edits endpoint**: OpenAI rejects gpt-image-2 model on the edits endpoint as of April 2026 (issue openai-node #1844, unresolved). Auto-fallback to gpt-image-1 in `GptImageGenerator`. When OpenAI fixes it, just set `OPENAI_IMAGE_MODEL_EDIT=gpt-image-2` in `.env` and restart.

6. **`/api/narrative/interactions/:id` returns the bare interaction** (not `{interaction: ...}`). The UI's per-scene refetch must accept either shape, otherwise edits made by the agent silently fail to appear in the UI.

7. **Async saveProjectData is fire-and-forget** but updates the in-memory cache synchronously. The cache is authoritative for the lifetime of the process. Concurrent tool calls all share the same projectData reference — mutations stick, just be aware.

8. **Active-project drift (the big one this session).** The server keeps an `isActive` flag on one project; any endpoint that omits `projectId` falls back to `getActiveProjectId()`. If the UI doesn't sync the server's active project, renders / style-pins / test-bench pull the WRONG project's style. Mitigations now in place: UI POSTs `/api/projects/switch` on project change, and passes `projectId` explicitly on style-pin, test-bench, portrait, and render calls. **Rule for new endpoints: always thread `projectId` from the client; never trust the server's active fallback for anything project-scoped.**

9. **Text-only style directives lose to training bias.** A photoreal-leaning model + "anime hybrid 3D" as text won't produce anime — the pinned style-reference IMAGES are the actual leash. Any new image path must attach `styleProfile.styleAssetIds` as image references (see how `/render` and `/visual/entity/:id` do it), not just inject the style as prompt text.

10. **Project-level model/aspect-ratio resolution.** `getProjectImageModel()` / `getProjectAspectRatio()` resolve from `styleProfile` with per-call override precedence. The friendly keys (`nano-banana` / `nano-banana-pro` / `nano-banana-legacy` / `gpt-image`) map to concrete Gemini ids inside each endpoint — `nano-banana` → ImageGenerator's NB2 default (no explicit model passed). Keep that mapping consistent if you add a new render path.

11. **The style-pin wipe (the big one, 2026-05-28). `styleProfile` is REPLACED, not merged, on `PUT /api/projects/:id`.** The Style phase has a debounced effect (`ui/app/studio/page.tsx` ~line 1959) that PUTs the *entire* `styleProfile` rebuilt from `settings` — and `settings` does NOT carry `styleAssetIds`. The server PUT replaced the stored profile with `normalizeStyleProfile(incoming)`, so every settings change (and even hydration round-trips) silently wiped the user's pinned style refs → `styleAssetIds: []` → every render ran with zero style references → drift. Symptom: "I pinned a style but it doesn't stick." Fix in place: the PUT handler carries existing `styleAssetIds` forward when the client omits them. **Rule: any client write that rebuilds `styleProfile` from `settings` must either include `styleAssetIds` or rely on the server-side merge — never assume a PUT preserves fields it didn't send.** Pins are owned by `toggle-style-pin` + the upload endpoint, which send them explicitly.

12. **Uploading a style ref ≠ pinning it (now auto-pinned).** Style-category assets used to upload into an unpinned bucket and silently affect nothing. The upload endpoint now auto-adds them to `styleProfile.styleAssetIds`. Unpinned style tiles in the Style phase show a persistent "not pinned" badge so the state is unambiguous.

13. **Edit endpoints must apply project style too.** `camera-angle` / `edit-image` originally bypassed the style leash entirely (no directive, no style refs) — a re-angle reverted to the model's default look. They now use the shared `buildProjectStyleForEdit(projectId)` helper (mirrors `/render`'s directive + style-ref attachment) and honor the project model + aspect. The executors return `entityId` so the UI refetches and the new gallery image appears. Note: still 1 ref on the sample project — 3+ pinned refs give the strongest lock.

14. **The API did not hot-reload (cost a whole debugging arc).** `api:dev` used to be plain `tsx src/api/server.ts` — **no `watch`** — so the long-running API process kept serving OLD code. Server-side edits looked done (committed, typechecking) but silently had no effect (style refs not attaching, pins re-wiping). Now `tsx watch`. **If a server-side change isn't behaving, first confirm the process actually reloaded** — and note a stale process started before the script fix won't pick it up until restarted (`tsx watch` restarts on save with a ~2–4s window where :3088 is briefly down — a curl mid-restart returns 000, not a real failure).

15. **Timeline active-project drift.** The UI timeline calls (load / refetch / track+clip CRUD / reorder / auto-populate / undo-redo restore) used to omit `projectId`, so the server wrote/read the timeline against its *active* project — drift wiped the track on reload. Now every timeline call threads `currentProjectId` (body for POST/PATCH/PUT, query for GET/DELETE). Same rule as gotcha #8: never trust the server's active fallback for project-scoped data. The init bootstrap still adopts server-active on fresh load (consistent there).

16. **`mapScenesFromApi` drops unmapped frame fields.** The API→UI scene mapper lists frame fields *explicitly*. A new field added server-side (e.g. `firstFrame`/`lastFrame`, `variants`) is silently dropped on the way to the UI unless you add it to the mapping — it'll persist on disk + show in chat tool results but never render in the workbench/timeline. If a new shot field "isn't showing up," check the mapper first.

18. **`loadProjectData`'s normalize WHITELIST silently dropped top-level fields on restart.** The sync `loadProjectData` (used by every request handler) read the project JSON and rebuilt it field-by-field — and the whitelist omitted `timeline` and `acts`. During a session the in-memory cache hid it; on server restart (cache empty → read disk) the timeline/acts were stripped even though they were saved on disk. Symptom: "timeline gone after the server resets." Fix: spread `...parsed` FIRST, then apply known-field defaults — so no top-level field is ever dropped (future-proofs `sequenceVideo` etc.). Same lesson as gotcha #16 (mapScenesFromApi), but on the server read.

19. **`saveProjectData` now writes the local file SYNCHRONOUSLY (file backend).** It used to be fire-and-forget async; a restart (incl. frequent `tsx watch` restarts) before the write flushed lost the last change. The sync `fs.writeFileSync` closes that window — the disk is always current for the sync load path. (MongoDB backend keeps the async adapter write.)

17. **Chat history persistence = the message must carry `toolUsage`.** Generated images + tool-call chips only survive reload because a sanitized `toolUsage` (base64 `_imageParts` stripped — the UI renders from `result.imageUrl`, which points at the on-disk generated image) is saved on the assistant message, returned from `/chat/history`, and restored in the UI's two history-mapping spots. Anything you want to survive reload must be on the saved message, not just in the live SSE payload. Pre-existing history (saved before the fix) has no `toolUsage`.

20. **`draggable` clips swallow handle drags.** A timeline clip `<div>` has the HTML5 `draggable` attribute, so a mousedown-then-move on ANY child (the trim/resize handles) starts the browser's native clip-move drag — which preempts the handle's own mouse listeners and drops the clip at the end of the track. Guard with a `resizingClipRef` set on handle mousedown and checked in the clip's `onDragStart` (`preventDefault` aborts the native drag). Also `draggable={false}` + `onDragStart→preventDefault` on the handles. Same trap for any draggable element with interactive children.

21. **⛔ SEEDANCE REJECTS REALISTIC FACES (the verdict).** ByteDance Seedance 2.0 has an image-scan layer that rejects clear realistic faces — *even AI-generated* — BEFORE it reads the prompt, surfacing async as E005 "flagged as sensitive" or a "copyright restrictions" error. No prompt rewrite or ref-packaging trick gets past it for a photoreal project. The grid-only strategy (composite shot stills into one grid so faces are tiny panels) cleared the *sensitive* gate but still hit the *copyright/likeness* gate on the big-face panels. **Conclusion: Seedance multi-shot is not viable for realistic characters. Veo single-shot is the workhorse (no such gate); the P2 chop/trim/splice editing is model-agnostic and works on Veo clips.** The Seedance plumbing (P1/P3, grid composer) is correct and stays — it'd work for a stylized/illustrated project (the guide says illustrated refs pass). The full mechanics WERE verified against Replicate (create→poll→download, reference-mode accepted) — it's a content-policy wall, not a code bug.

22. **Style refs must be `type:'style'`, NOT `'character'`.** The image generator labels a `'character'` ref "(person)" and frames it to the model as "maintain this identity" → a pinned STYLE image leaks its subjects (pin an Arcane frame, get the Arcane characters). The generator has full `'style'`-type support (labeled "(style)") — style refs just weren't using it. Every PROJECT STYLE REFERENCE push (`/render`, `buildProjectStyleForEdit`, entity portrait endpoint, storyboard) must tag `'style'`. Related: **text style alone loses to model realism bias (gotcha #9)** — the real leash is a pinned style-reference IMAGE; the agent can now pin one via `set_style_reference` / the UI's "Use as style reference".

23. **Generated-tab images are SYNTHETIC rollup records, not assets.** `GET /assets/generated` builds records on the fly (ids like `gen_entity_X_primary`) from entity/scene/frame/artifact scans + the `generatedImages` registry — they have NO backing `projectData.assets` record. So you cannot pin/categorize one by its id (it resolves to nothing at render time). To act on a generated image you must MATERIALIZE a real asset from its URL first (`POST /assets/from-url` / `style-reference-from-url`, idempotent dedup-by-url). The pin lives in `projects[].styleProfile.styleAssetIds` (persist via `saveProjects`) while the asset lives in `projectData.assets` (persist via `saveProjectData`) — BOTH must be written or the pin is inert.

24. **Activate a production BEFORE descending and hydrating it.** A production
card used to change the UI mode first, while the API still considered the old
production active. The first scene/script/timeline fetch therefore returned the
old telling and the UI could look empty or cross-contaminated. The descent path
must await `POST /productions/:id/activate`, then set the client production, then
hydrate with explicit `projectId` + `productionId`. This is browser-tested with
an A-only scene while B began active.

25. **A delayed save belongs to the state that scheduled it, not whatever is
active when the timer fires.** Canvas/Documents debounce and unload work can
cross a project switch. Capture the owner project ID, flush/cancel before
clearing, reject stale acknowledgements, and retain unsent work visibly. Never
read `currentProjectId` lazily inside an old timer.

26. **Provider objects are process-scoped; request overrides are not.** Mutating
an image generator's default model/style for one render leaks into concurrent
or later renders. Compute effective options per call and return a manifest of
the exact prompt/reference order/provider actually used. A requested model is
not evidence that it ran.

27. **The API has no auth, so loopback is a load-bearing safety boundary.** Do
not bind API or UI to `0.0.0.0` for convenience. Browser origins are explicitly
allowlisted; path-derived identifiers are validated; payloads are bounded.
Remote bind requires `ALLOW_REMOTE_API=true`, but that is only an escape hatch,
not security — put authentication and authorization in front first.

28. **A scoped URL is only scoped if the handler consumes it.** Adding
`?projectId=` or `?productionId=` in the UI is cosmetic when the server still
reads its mutable active fallback. Project-scoped GETs now resolve the explicit
ID, and the two colliding `/narrative/timeline` handlers are one response:
production edit-line data plus branch/commit history. Duplicate Express routes
are dead code with a successful-looking API surface; search registrations, not
just callers.

29. **Archiving is a concurrency boundary, not a rename at the end.** Claim a
per-project tombstone synchronously before the first `await`, reject every
later mutation, drain the project and catalog write queues, then move the
package and publish the new catalog. Without that order, overlapping DELETEs
can create two partial archives and an acknowledged PUT can vanish into the
gap.

30. **`DATA_DIR` freezes when the runtime-path module is imported.** Boundary
tests must install their temporary `DATA_DIR` before dynamically importing the
server or storage factory. A top-level runtime import can quietly point the
test at the creator's real store. Import pure types/helpers directly, then
prove archive output exists under the temp root. If isolation ever slips, stop,
restore `projects.json` from its verified `.bak`, and quarantine only the named
fixtures before continuing.

31. **A process-local lock is theatre when two checkouts share `DATA_DIR`.** An
in-memory archive set, promise queue, or cache only coordinates one Node
process. Project and catalog ownership must be represented below the canonical
data root, acquired in project→catalog order, heartbeated, and released only by
the exact owner. Never clear an apparent stale owner without re-inspecting its
operation ID and checking for a creation/publication journal.

32. **Valid JSON is not valid world or canon.** `{}` parses and used to
normalize into a fresh empty world. A nit ledger can have hash-shaped rows while
its operations reconstruct a different snapshot. Load/export/recovery must
prove the world's load-bearing arrays and the ledger's schema, content hashes,
parent graph, operation replay, branch snapshots, and world acknowledgement.
Unknown fields are preserved; missing authority is never defaulted.

33. **A lossless export is a multi-file snapshot.** Reading project metadata,
the world blob, and nit sidecar under separate locks can export a pair that
never existed. Hold one project boundary across catalog/world/nit reads, then
validate world↔nit coherence before releasing. Export must not switch the active
project, whitelist fields, or silently omit an unreadable sidecar.

34. **Registering a render advances the same world revision its caller later
wants to attach to.** `/render` records every output before returning. A caller
that then saves its pre-render fork deterministically conflicts with itself—or,
without CAS, overwrites the registry. Keep ordinary CAS strict; for paid media
only, reload a fresh fork and reapply the known stable-ID attachment with a
bounded retry. Advance an agent's long-lived fork only after durable success.

35. **Missing authority is recovery, not virgin bootstrap.** A missing
`projects.json` beside any world, backup, nit, archive, or boundary evidence
must stop API startup. Likewise, a catalogued project missing both world copies
must fail rather than mint an empty document. Bootstrap the demo only when the
entire store is genuinely virgin; preserve evidence and use the recovery
runbook otherwise.

### Open todos (carried forward)

- Frame workbench manual buttons still hit `/visual/frame/:sceneId/:frameId` (old templated path). Migrate to `/render` for consistency + project style/model/aspect inheritance.
- **Per-clip image override on the timeline** — variants live on the SHOT, so promoting a variant changes every clip referencing that shot. To pin a specific variant to a specific clip, add an optional `imageUrlOverride` to `ProjectTimelineItem`.
- Storyboard-extracted frames don't auto-pass `sourceStoryboardImageUrl` as a reference on first re-render.
- Prose mode chat block still inline at the old bottom position (director mode uses the right sidebar).
- Assets is now the bottom item of the left phase rail (no longer a top-nav tab); the slide-in drawer the design doc calls for is still unbuilt.

---

## Setup notes

Env vars expected in `.env`:
```
GEMINI_API_KEY=...              # required for Nano Banana + chat agent + Veo video
GOOGLE_AI_API_KEY=...           # alternative env var name (either works)
ATLASCLOUD_API_KEY=...          # optional, preferred extra media backends
OPENAI_API_KEY=...              # optional direct image fallback
ALLOW_OPENAI_DIRECT_FALLBACK=false
REPLICATE_API_TOKEN=r8_...      # optional, enables Seedance 2.0 video (but Seedance rejects realistic faces — gotcha #21)
GEMINI_FAST_MODE=false          # optional, uses Flash everywhere
API_HOST=127.0.0.1              # default; see gotcha #27
API_PORT=3088                   # optional
DATA_DIR=.narrative-data        # one canonical durable root
USE_MONGODB=false               # Mongo path is intentionally disabled
```

Run:
```
npm run dev    # API 127.0.0.1:3088 + UI 127.0.0.1:3089
npm run verify # tests + zero-error typechecks + production builds
```

The API runs via `tsx watch src/api/server.ts` (no build step; source edits hot-reload). The UI is Next.js HMR.

> **Gotcha (cost me a whole debugging arc):** the `api:dev` script used to be plain `tsx src/api/server.ts` — **no `watch`** — so the API did NOT hot-reload. Server-side edits looked "done" (committed, typechecking) but the running process kept serving the OLD code, so fixes silently didn't take effect (style refs not attaching, pins re-wiping). If a server-side change isn't behaving, confirm the running process actually reloaded — `tsx watch` now handles it, but a stale long-running process from before the fix won't pick up the script change until restarted.

Data dir: `DATA_DIR` (defaults to `.narrative-data/`, gitignored). Project JSON
files are `project_<id>.json`; generated images and uploaded assets live below
the same root. Deleting a project archives its recoverable package below
`trash/projects/`. If startup reports a missing catalog/world, a stale boundary,
or an unfinished transaction, preserve the root and follow
`docs/STORAGE_RECOVERY.md`; the guarded entrypoints are `archive:recovery`,
`creation:recovery`, `publication:recovery`, and `lock:recovery`.

---

## Working style / collaboration patterns

Things the writer (Michael) has consistently steered toward:

- **Cinematic feel over utilitarian** — workbenches that respect the focus, no modals stacked on modals, no cramped surfaces. The Frame workbench is the standard.
- **Single source of truth for prompts** — the agent should see what we actually send to the image model, not just what it asked for. `actualPromptSent` in tool results is non-negotiable.
- **No invisible prompt injection** — every wrapping that gets added to a prompt is visible somewhere the writer/agent can find it. Style directive shows up in `styleDirectiveApplied`; reference descriptions show in `referencesAttached`.
- **Snapshot + resync, not live link** — locked decision. Don't add auto-propagation between stages.
- **The agent's chat is always alongside the work** — not buried, not below, not in a popup. Right sidebar persistent.
- **Logical commit checkpoints** — meaningful unit per commit, descriptive message focused on the why. We use `🤖 Co-Authored-By: Claude` trailer.
- **Tight communication** — short summaries with clear next-step questions. The writer is happy to redirect; assume they will.

---

## For the next agent — current handoff (2026-08-01)

1. Start at `AGENTS.md`, then trust `docs/STATE.md` for live Now/Next/Blocked,
   roadmap status, decisions, and verification. The current active feature is
   `docs/DRAMATURGY_DESIGN.md`; slice 1 is live and hardened.
2. The Studio is world-first and transmedia. Film and comic tellings descend
   from one chronology; the agent is scoped by mode and medium. Canvas, Style,
   Explore, dramaturgy, production, canon gates, and film/comic export all exist.
3. The 2026-08-01 passes established a hard engineering floor: Node 20, CI,
   deterministic Jest, zero root/UI type errors, clean production audits,
   local-only listeners, contained paths, one canonical file store, strict CAS,
   and crash-recoverable archive/creation/canon publication across checkouts.
   Run `npm run verify`; do not restore an error baseline, re-enable Mongo, or
   delete a lock/tombstone by hand. Incident runbook: `STORAGE_RECOVERY.md`.
   The running dev stack is a living workspace: reuse it when healthy and never
   kill it merely as session cleanup.
4. Integrity rules that must survive every feature: explicit `projectId` and
   `productionId`; activate before production hydration; preserve unknown fields
   at every map/read seam; capture the owner of delayed writes; never mutate
   process-scoped provider defaults per request; canon writes go through the
   checked mutation boundary; the response must report what the model actually
   received and produced; ordinary stale writes fail, while paid render
   attachments alone may use the bounded stable-ID rebase helper.
5. The next human work is Michael's click-pass of Dramaturgy, Style, Canvas, and
   focused E1 Explore. The next product work is dramaturgy slice 2, entity
   draft→canon, a music bed, real shorts/microdrama, T2 ingest, and C4
   event-aware merge. Remote/multi-user use is blocked on auth, not on a bind
   flag.
7. FABLE is creator data. Do not use it as a test fixture. Use a disposable
   project, restore the prior active project, and clean the fixture after any
   live check.

## Historical handoff (2026-06-20 — superseded, retained as archaeology)

> The status and instructions below describe the pre-world-first Studio. They
> are retained only to explain old implementation choices; do not execute them
> as a current plan.

1. **Start at `AGENTS.md` (the single entrypoint) → `docs/STATE.md` (the live roadmap/Now-Next-Blocked/CHECKPOINT).** Then read this doc top to bottom (esp. the **2026-06-20 shipped block** + gotchas #20–23), then `git log --oneline -40`.
2. **Where things stand (2026-06-20):** Full pipeline (Style → Story → World → Storyboard → Script → Production) on a left icon rail. The **video pipeline is settled: Veo 3.1 single-shot is the workhorse + the P2 virtual-chop/trim/splice timeline** (model-agnostic). **Seedance multi-shot is BUILT but shelved** — it rejects realistic faces (gotcha #21); the plumbing stays for a future stylized project. Entity workbench is an **album** (render-single accumulates, labeled looks, agent picks looks via `entityLooks`). Style is locked by **pinned reference IMAGES** (`set_style_reference`; style refs typed `'style'` — gotcha #22). Assets are overhauled: **every generation is registered** (nothing wasted), generated images are first-class (categorize/pin/full modal via materialize-on-action — gotcha #23). UI typechecks clean; `src/api/server.ts` carries PRE-EXISTING type errors (mostly the benign Express route-overload `TS2769` every route triggers) — the current counts live in **`STATE.md` → "Typecheck baseline"** (the single source; don't trust numbers restated elsewhere); measure your DELTA, don't zero it. **API runs `tsx watch`** — confirm it reloaded after server edits (gotcha #14); `.env` changes need a process restart. This is historical context only: preserve a healthy living stack instead of killing it as cleanup.
3. **The named next milestone is the Explore → Curate → Assemble flow** (`docs/EXPLORE_FLOW_DESIGN.md`, phase E1 first — read it before building; E1 task #1 is the `mapScenesFromApi` seam). Confirm scope with Michael first (design was requested before implementation). Other polish in the queue: a **motion-prompt field** on the Animate button (best Veo guide); **MP4 export (P4)** via ffmpeg (concatenate the Veo clips honoring virtual-chop in/out); extend `entityLooks` to keyframes/sequences; a **"remove from Generated"/registry-pruning** action. The actual creative thread Michael is on: **dialing in the project's cel-shaded/painterly style** — generate a plate he loves on GPT Image (obeys style text better than NB2), `set_style_reference` it, then everything locks. And building out characters (e.g. "Wren") as album entities.
4. **Templates to match:** `FrameDetailView`, `EntityWorkbench`, `TimelineView`, `SceneDetailView`, `ScreenplayView` in `ui/app/studio/page.tsx`. Cinematic workbench shape (top strip / left canvas / right tabs / bottom action bar) is the house style. New: `src/visual/seedance-generator.ts`, `src/visual/grid-composer.ts` (sharp).
5. **Verify before building:** `npm run dev`, open "Aletheia Protocol". Focus a shot → "add a reaction shot in armor" (`add_related_shot` + `entityLooks`), "animate this shot" (Veo, ~1–3 min). On the timeline: drag a clip's left edge (in-point), `S`/`I`/`O` to splice, hit a chunk's "Seq" bar (Seedance — expect E005 on photoreal scenes, that's gotcha #21). Assets > Generated: every render shows; click one → the full asset modal; pin one as style.
6. **Session notes (2026-06-20):**
   - **The Seedance arc is the headline lesson:** we built P1+P3 fully and verified the Replicate mechanics, but Seedance's face-scan kills it for photoreal. Don't re-attempt multi-shot for realistic characters; reach for Veo + the chop editing (all shipped). Revisit Seedance only for a stylized project.
   - **Style = an IMAGE, not text.** NB2's realism bias beats any text style spec (gotcha #9). The whole style loop is now: generate → pin a good plate as a style reference → it locks. And style refs MUST be `type:'style'` (#22) or they leak the reference's subjects.
   - **Two persisted stores for style pins:** assets in `projectData` (`saveProjectData`), `styleAssetIds` in the `projects` array (`saveProjects`). Write BOTH (#23).
   - **Field-mapping seams** still bite: `mapScenesFromApi` (UI, #16) and `loadProjectData` (`...parsed`-safe, #18). New top-level field `ProjectData.generatedImages` (the registry).
   - Historical note: the background API was sometimes a detached `tsx watch`
     (`/tmp/narrative-api.log` was often stale). Current rule: probe and reuse a
     healthy process; restart intentionally only when the change requires it.
7. When in doubt: cinematic feel > utility, single-source-of-truth prompts, no invisible injection, snapshot+resync not live-link, **thread `projectId` everywhere** (#8, #15, and now `refetchGeneratedAssets`), **resolve scene+frame focus from ONE source**, **preserve unknown fields** on every read/map seam, and **style is an image leash**. Michael wants an **agent-first** experience (the UI explores structure the agent builds) and redirects readily — short summaries, clear next-step questions.
