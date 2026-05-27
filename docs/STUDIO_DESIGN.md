# Narrative Studio — Design Document

**Status**: Living doc — vision, architecture, implementation status, and roadmap.
**Last updated**: 2026-05-27 (end of long build session)

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

## Implementation status (as of 2026-05-27)

What's shipped, ordered by commit. Use `git log --oneline` to inspect.

**Pipeline phases (top-level nav)**:
- ✅ Style (Pre-Pro view) — visual style spec, style ref pins, test render bench
- ✅ World — EntityWorkbench (rebuilt 2026-05-27): top entity thumb strip, left spotlight carousel cycling through primary/variations/gallery, right Story/Media/Connected tabs, bottom action bar
- ✅ Script — all 10 stages with editors (Logline, Character Summary, Synopsis, Act Summary, Act Breakdown, Character List, Beat Sheet, Theme, Scene List, The Write)
- ✅ Storyboard — multi-panel page generation via GPT Image, panel extraction to production scenes
- ✅ Production — scene carousel + Frame workbench (the gold standard)
- ⏳ Post-Pro — not started

**UI shell**:
- ✅ Right-side persistent chat sidebar (director mode only; prose mode still has its old inline chat)
- ✅ Inline detail workbenches (no modals): Entity, Scene, Frame, Artifact, Asset, Storyboard all use `fixed left-0 right-[420px] top-12 bottom-0 z-40 bg-slate-950`
- ❌ Bottom quick-prompt input (deferred)
- ❌ Assets-as-drawer (still a top-nav tab)
- ❌ Resizable/collapsible chat sidebar (fixed 420px for now)

**Image generation**:
- ✅ GPT Image 2 (generations) + GPT Image 1 (edits) with auto-fallback for OpenAI's edits-validation bug
- ✅ Nano Banana (Gemini) — production-anchored renders, identity continuity
- ✅ Backend routing per-call: AI picks; env vars `OPENAI_IMAGE_MODEL_GENERATE` and `OPENAI_IMAGE_MODEL_EDIT` override
- ✅ Style lock — `styleAssetIds` on project, auto-attached to every /render with locked-style directive
- ✅ Reference cap removed (limited by OpenAI's 50MB request size)
- ✅ Tool results expose `actualPromptSent`, `referencesAttached`, `styleDirectiveApplied`, `backend` — agent can diagnose off-look renders without grep

**Agent capabilities**:
- ✅ Sees: current phase, script status (which stages are filled), world summary, asset catalog, focused entity/scene/frame, pinned entities
- ✅ Phase-aware tool emphasis (system prompt teaches which tools fit which phase)
- ✅ Snapshot+resync awareness (don't auto-propagate across links; suggest resync)
- ✅ 17 script tools, 35+ total tools, SSE streaming of tool calls + results to the chat

**Frame workbench (the cinematic template)**:
- ✅ Full-canvas layout: top frame strip, left big image (with overlays for camera/edit), right tabbed inline-editable metadata, bottom action bar
- ✅ Single canonical `imagePrompt` field per frame — replaces the three-way fight between description / image_prompt / visual_direction
- ✅ Last-render diagnostics on each frame: lastImagePrompt (full prompt sent), backend, styleDirectiveApplied, referencesAttached — surfaced in collapsible section
- ✅ Storyboard-source thumbnail when frame was extracted from a panel
- ⚠️ Manual buttons (Re-render image, Camera Angle, Edit) still call the OLD templated `/api/narrative/visual/frame/:sceneId/:frameId` endpoint, not the clean `/render` path. Should migrate.

---

## Roadmap — committed order (for the next session)

1. **Scene workbench (Production)** — the missing peer to Frame and Entity workbenches. Currently a SceneCard carousel; needs the cinematic rebuild. Why first: most-used phase after Script, completes design-language consistency across the whole pipeline.

2. **Split-canvas Storyboard + Style** — both phases work; restructure their canvases as left=text, right=images. Smaller scope, fast polish wins.

3. **Post-Pro editing line** — new phase. Horizontal timeline of all frames with per-frame duration, drag reorder, scrub preview. Opens the door to Seedance multi-shot integration. Defer until Production is robust so the timeline shows real sequenced work.

4. **Prose mode chat sidebar** — tiny cleanup. Prose mode still has its old inline chat. Knock out alongside any of the above or last.

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

- `ui/app/studio/page.tsx` — the entire studio shell + every workbench (~13,400 lines, monolithic on purpose for state coherence)
- `src/api/server.ts` — Express API + AI tool executors + system prompt assembly (~16,000+ lines)
- `src/llm/gemini.ts` — Gemini SDK adapter, multi-turn tool execution, SSE streaming
- `src/visual/image-generator.ts` — Nano Banana (Gemini) wrapper
- `src/visual/gpt-image-generator.ts` — GPT Image wrapper with dual-model fallback
- `src/storage/storage-adapter.ts` — `ProjectData`, `ProjectScript`, `Asset`, `ProjectStyleProfile` types
- `src/config/models.ts` — model IDs + selection strategy. Default is `gemini-3.1-pro-preview-customtools` (NOT the base 3.1-pro — see comment in that file for why)

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

### Open todos (from the just-finished session)

- Frame workbench manual buttons still hit `/visual/frame/:sceneId/:frameId` (old templated path). Migrate to `/render` for consistency with AI path + style lock benefits.
- Storyboard-extracted frames don't auto-pass `sourceStoryboardImageUrl` as a reference on first re-render. The thumbnail shows on the workbench but the agent must explicitly pass it.
- Prose mode chat block still inline at the old bottom position. Director mode moved to right sidebar; prose mode is the parallel cleanup.
- Assets are still in the top phase nav as a tab. Per the design doc, they should be a drawer accessible from anywhere. Punted because the top-nav placement still works.

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

The API runs via `tsx src/api/server.ts` (no build step needed; source edits live-reload). The UI is Next.js HMR.

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

1. Read this doc top to bottom.
2. Read `git log --oneline -30` to see recent history.
3. Check the open task list (use `TaskList` tool).
4. The roadmap section above lists the committed next move: **Scene workbench cinematic treatment**.
5. The Frame workbench (`function FrameDetailView` in `ui/app/studio/page.tsx`) and Entity workbench (`function EntityWorkbench` same file) are the templates. Scene workbench should match.
6. When in doubt: cinematic feel > utility. The writer cares about how it feels to work in.
