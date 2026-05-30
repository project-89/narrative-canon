# Narrative Studio — Design Document

**Status**: Living doc — vision, architecture, implementation status, and roadmap.
**Last updated**: 2026-05-29 (agent-aware shots/scenes, render history, keyframes, timeline scene boxes, chat persistence)

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

### ⏳ Still pending (pick up here)

1. **Image-to-video step** — feed `firstFrame` + `lastFrame` + the shot prompt to Seedance / an i2v model → a clip per shot, assembled on the timeline. The keyframe groundwork is in place; this is the next big build.
2. **Timeline polish (further)** — trim handles (in/out points distinct from duration), audio waveform display, MP4 export (ffmpeg), real-time multi-author. (Per-clip image-url override intentionally deferred — see Phase B note above.)
2. **Split-canvas Style phase** — left=spec text, right=reference pins + test renders. Polish win.
3. **Prose mode chat sidebar** — prose mode still has its old inline chat, not the right sidebar. Small cleanup.
4. **Migrate Frame workbench manual buttons** off the OLD templated `/visual/frame/:sceneId/:frameId` path onto `/render` (consistency with the AI path + project style/model/aspect inheritance).
5. **Assets-as-drawer** — Assets is now the bottom item of the left rail; the design doc still calls for a slide-in drawer. Minor.

**Future / longer-term** (not in immediate roadmap):
- Seedance video integration (storyboard + shot list → 15s multi-shot clip → chop to frame-aligned segments)
- Image-to-video per frame
- Audio layer (VO / SFX / score)
- Export to MP4 (needs ffmpeg)
- Real-time multi-author collaboration
- Branching narratives UX (data model exists via Nit format)
- Live entity-name linking in script text
- Migrate Frame workbench's manual buttons from `/visual/frame/:sceneId/:frameId` to `/render` (consistency with AI path)
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

- `interactions[]` — scenes. Each has `frames[]` (= SHOTS in the UI). Fields: `scene.actId` (parent act, nullable), `frame.durationSec` (timeline default), `frame.variants[]` (alternate takes — also doubles as render HISTORY via `pushFrameRenderHistory`), `frame.firstFrame` / `frame.lastFrame` (`{url, prompt, generatedAt, backend}` — image-to-video keyframes, separate from the main `imageUrl`). **Any new frame field must be added to `mapScenesFromApi` in the UI or it's silently dropped (gotcha #16).**
  - Shot tools: `add_related_shot` (create+render a consistent follow-up/zoom/filler relative to the focused shot), `generate_shot_keyframes` (first/last keyframes), plus the existing `insert_frame` / `update_frame` / `generate_frame_image` / `generate_shot_variant` / `promote_shot_variant` / `delete_shot_variant`.
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
GEMINI_API_KEY=...              # required for Nano Banana + chat agent
GOOGLE_AI_API_KEY=...           # alternative env var name (either works)
OPENAI_API_KEY=...              # optional, enables GPT Image
OPENAI_IMAGE_MODEL_GENERATE=gpt-image-2   # default
OPENAI_IMAGE_MODEL_EDIT=gpt-image-1       # default (until OpenAI fixes validation)
GEMINI_FAST_MODE=false          # optional, uses Flash everywhere
API_PORT=3088                   # optional
```

Run:
```
npm run dev    # starts API + UI concurrently (API on 3088, UI on Next default)
```

The API runs via `tsx watch src/api/server.ts` (no build step; source edits hot-reload). The UI is Next.js HMR.

> **Gotcha (cost me a whole debugging arc):** the `api:dev` script used to be plain `tsx src/api/server.ts` — **no `watch`** — so the API did NOT hot-reload. Server-side edits looked "done" (committed, typechecking) but the running process kept serving the OLD code, so fixes silently didn't take effect (style refs not attaching, pins re-wiping). If a server-side change isn't behaving, confirm the running process actually reloaded — `tsx watch` now handles it, but a stale long-running process from before the fix won't pick up the script change until restarted.

Data dir: `.narrative-data/` (gitignored). Project JSON files at `.narrative-data/project_<id>.json`. Generated images at `.narrative-data/generated-images/`. Uploaded assets at `.narrative-data/uploaded-assets/`.

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

## For the next agent — when picking this up

1. Read this doc top to bottom, then `git log --oneline -40`.
2. **Where things stand (2026-05-29):** Full pipeline (Style → Story → World → Storyboard → **Script** → Production) built, on a left icon rail. Two-state chat (bottom quick bar ⇄ side panel). Agent-aware shots/scenes: it knows the focused shot (Storyboard browse-focus, timeline clip, or open workbench), sees sibling shots, and `add_related_shot` makes consistent follow-ups. Render history (every re-render keeps the prior take in `variants`, shown in both the Frame workbench + timeline inspector). First/last keyframes (`generate_shot_keyframes`) for image-to-video. Timeline has scene bounding boxes + collapse/expand. Chat images/tool-calls + the timeline now persist across reload. **The API runs `tsx watch` — confirm it actually reloaded after server edits (gotcha #14).** UI typechecks clean; `src/api/server.ts` + `game-server.ts` have ~196 PRE-EXISTING type errors unrelated to this work — measure your delta against that baseline, don't try to zero it.
3. **The committed next move: image-to-video.** Feed a shot's `firstFrame` + `lastFrame` + prompt to Seedance / an i2v model → a clip per shot, dropped onto the timeline. The keyframe groundwork is done. See roadmap item #1.
4. **Templates to match:** `FrameDetailView`, `EntityWorkbench`, `TimelineView`, `SceneDetailView`, `ScreenplayView` in `ui/app/studio/page.tsx`. The cinematic workbench shape (top strip / left canvas / right tabs / bottom action bar) is the house style.
5. **Verify before building:** run `npm run dev`, open the "Anime test" or "Aletheia Protocol" project. Focus a shot (Storyboard thumbnail or timeline clip) and say "add a reaction shot zooming in on her face" → `add_related_shot` should drop a consistent shot inline. Then "give this shot a first and last frame" → keyframes strip appears. Re-render a shot → prior take shows in "Alternate takes". Reload → chat images + timeline survive.
6. When in doubt: cinematic feel > utility, single-source-of-truth prompts, no invisible injection, snapshot+resync not live-link, **thread `projectId` everywhere** (gotchas #8, #15), and **resolve scene+frame focus from ONE source** so they never mismatch. The writer (Michael) redirects readily — short summaries, clear next-step questions.
