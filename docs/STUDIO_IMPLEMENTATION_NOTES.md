> ⚠️ **SUPERSEDED RELIC** — this doc predates the Narrative Studio and describes an earlier system. Do NOT use it for orientation; start at [`AGENTS.md`](./AGENTS.md) (adjust path from docs/: `../AGENTS.md`).

# Narrative Studio - Implementation Notes

## Current State (2026-01-31)

### What's Working
1. **Real API Connection** - Studio loads from `/api/narrative/*` endpoints
2. **39 Entities from Eidolon world** - Locations, factions, concepts, objects, artifacts, characters
3. **3D Carousel** - Smooth exploration of entities/scenes
4. **Entity Detail View** - Shows description, traits, type, AND connections
5. **Real LLM Chat** - Gemini connected, grounded in narrative graph
6. **Navigation Commands** - Local intent detection for "Show me X" works
7. **Working Memory** - Pinned entities shown in header
8. **Inline Entity Proposals** - AI proposes new entities/relationships with Accept/Reject UI
9. **Accept All Flow** - Batch acceptance of proposals updates graph and carousel
10. **Entity Creation** - Created entities with traits and relationships
11. **🆕 Focus Mode** - "Focusing on: X" banner with Exit Focus button
12. **🆕 Entity Connections** - Detail view shows clickable relationships with descriptions
13. **🆕 Scene Detection** - AI narrative prose auto-detected and proposed as scenes
14. **🆕 Scene Creation** - Scenes added to storyboard via Accept (Scenes count: 0→1)
15. **🆕 Scene Detail View** - Full prose, Re-roll, Composition, Discuss, Generate Image buttons
16. **🆕 Scene Proposals with Film Icon** - Purple Film icon distinguishes scene proposals

### Architecture
```
UI (Next.js)                    API (Express)
├── /studio                     ├── /api/narrative/entities
│   ├── Carousel3D              ├── /api/narrative/relationships
│   ├── EntityDetailView        ├── /api/narrative/interactions (scenes)
│   ├── SceneDetailView         ├── /api/narrative/chat
│   └── Chat                    ├── /api/narrative/git/*
│                               └── /api/narrative/world
```

### Key Files
- `ui/app/studio/page.tsx` - Main studio component
- `ui/lib/demo-data.ts` - Demo data (fallback)
- `src/api/server.ts` - API with chat endpoint
- `src/config/models.ts` - Gemini model config

---

## WORLD_BUILDER.md Spec Mapping

### ✅ Implemented
| Spec Feature | Implementation |
|--------------|----------------|
| Horizontal scrolling content | 3D Carousel (different visualization, same purpose) |
| Entity detail panel | EntityDetailView with relationships |
| World sidebar | Collapsible drawer on right |
| Chat interface | Floating chat box at bottom |
| Focus on entity | Carousel focus + Working Memory |
| Entity connections | Shown in detail view with avatars |
| Scene participants | Shown in SceneDetailView |

### 🔄 Partial / Needs Work
| Spec Feature | Status | Notes |
|--------------|--------|-------|
| Inline entity proposals | ✅ DONE | Proposals appear inline with Accept/Reject buttons |
| Focus Mode indicator | ✅ DONE | "Focusing on: X" banner with Exit Focus button |
| Image generation | Not connected | Gemini image gen available but not wired |
| Scene auto-creation | ✅ DONE | Chat detects "write a scene" and creates proposals |
| Panel insertion | Missing | No "insert between" flow |
| Draft vs Canon status | ✅ DONE | Status shown with Promote to Canon button |
| Entity detail relationships | ✅ DONE | Detail view shows clickable connections with descriptions |
| Scene editing | ✅ DONE | Edit title/prose with Save Changes/Cancel buttons |
| Storyboard strip | ✅ DONE | Horizontal timeline with thumbnails and Add button |
| Entity extraction from prose | ✅ DONE | Entities auto-extracted from scene prose |

### ❌ Not Yet Implemented
| Spec Feature | Priority | Notes |
|--------------|----------|-------|
| Image generation UI | ✅ DONE | Nano Banana integration with reference images |
| Scene participants linking | MEDIUM | Auto-link focused entities to scenes |
| Checkpoints/branching UI | LOW | Backend supports it, UI doesn't expose |
| Export features | LOW | Future |

---

## Test Flows to Validate

### Flow 1: Starting Fresh (New World)
- [ ] Empty state welcome message
- [ ] User describes world concept
- [ ] AI extracts initial entities
- [ ] Entities appear in carousel
- [ ] User can explore and refine

### Flow 2: Entity Development (Focus Mode) ✅ WORKING
- [x] Navigate to entity via chat
- [x] View entity details
- [x] See relationships (clickable connections with descriptions)
- [x] Focus Mode with "Focusing on: X" banner
- [x] Pre-filled chat input "Tell me more about X"
- [ ] AI adds traits, backstory to graph
- [ ] Generate reference image

### Flow 3: Scene Writing ✅ WORKING
- [x] User asks for a scene (Vesper infiltrating the Locus)
- [x] AI writes narrative prose (beautiful infiltration scene)
- [x] Entities extracted and proposed (The Memory of the Horizon)
- [x] Relationships extracted (claims, hidden_within, threatens_authority_of, infiltrates)
- [x] Scene added to storyboard (Scenes: 0→1)
- [x] Scene detail view with full prose
- [x] Scene has Draft status badge
- [ ] Participants linked
- [ ] Image generated for scene

### Flow 4: Exploration & Discovery ✅ WORKING
- [x] Ask about factions → AI responds with graph knowledge
- [x] "Show me X" → Navigation works
- [x] View entity connections (in detail panel)
- [x] Click related entity → Navigate (connections are clickable)
- [ ] Ask "what's connected to X" → AI uses graph

### Flow 5: Graph Growth ✅ WORKING
- [x] Ask about unexplored aspect (memory thief character)
- [x] AI proposes new entities (Vesper + relationships)
- [x] User approves (Accept All button)
- [x] Graph expands (35 → 36 entities)
- [x] New entities visible in carousel (Vesper navigable)

---

## Implementation Priority Queue

### Phase 1: Core Creation Loop (HIGH)
1. **Entity Extraction** - When AI writes prose, extract and propose entities
2. **Scene Detection** - When AI writes narrative, create scene in storyboard
3. **Approval Gate UI** - Inline proposals with Accept/Reject

### Phase 2: Visual Grounding (MEDIUM)
4. **Image Generation** - Connect Gemini image gen
5. **Entity Portraits** - Generate 4 variations, select canonical
6. **Scene Images** - Generate from prose + participant references

### Phase 3: Navigation & Flow (MEDIUM)
7. **Focus Mode Indicator** - Clear "Focusing on: X" header
8. **Storyboard Strip** - Alternative view for scene sequence
9. **Related Entity Navigation** - Click avatars to navigate

### Phase 4: Polish (LOW)
10. **Checkpoints UI** - Save/restore world states
11. **Branch Visualization** - Show narrative branches
12. **Export** - PDF, images, video storyboard

---

## Current Session Notes

### Testing with Eidolon World
- City of memory trade
- Factions: The Hollows (impoverished), The Polymaths, The Wardens, Fugue-Dredgers
- Concepts: Memory Integration, Echo-Sickness, The Guilt Market
- Locations: The Lucid Heights, The Fugue, The Locus, The Oubliette
- Artifacts: The Obsidian Treaty, The Zero Ampere

### Observed Behaviors
1. LLM responds with world-grounded knowledge ✅
2. Navigation via "Show me X" works ✅
3. Entity detail shows relationships ✅
4. Working Memory pins entities ✅

### Issues Found
1. Navigation sometimes doesn't fire (entity name matching)
2. No scenes in current project (interactions empty)
3. Need to create scenes through chat to test scene flow

---

## Session Progress (2026-01-30)

### Completed This Session
1. ✅ **Added inline entity proposal UI** - Proposals appear in chat with Accept/Reject
2. ✅ **Tested entity creation** - Created Vesper (memory thief) with traits
3. ✅ **Accept All flow works** - Entity count increased 35→36→38
4. ✅ **Navigation to new entity** - "Show me Vesper" works
5. ✅ **Scene writing extracts entities** - Aurelius + The Gilded Atrium from heist scene
6. ✅ **Relationship extraction** - antagonist, owner_of, infiltrated relationships

### New Entities Created This Session
- **Vesper** - Memory thief character (flickering, altruistic, hyper-vigilant, fragmented)
- **Aurelius** - Polymath antagonist who owns the memory vault
- **The Gilded Atrium** - Location where Aurelius hoards "First-Times" memories

---

## Session Progress (2026-01-31)

### Completed This Session
1. ✅ **Focus Mode Indicator** - Added "🎯 Focusing on: X" banner with Exit Focus button
2. ✅ **Entity Connections in Detail View** - Shows clickable relationships with descriptions
3. ✅ **Scene Detection** - Detects "write a scene" / "show me when" type prompts
4. ✅ **Scene Proposals** - Scene content auto-proposed with Film icon (purple)
5. ✅ **Scene Creation Flow** - Accept adds scene to storyboard (Scenes 0→1)
6. ✅ **Scene Detail View** - Full prose display with Re-roll, Composition, Discuss, Generate Image
7. ✅ **Related Entity Click Navigation** - Connections are clickable to navigate
8. ✅ **Scene Editing** - Edit button in SceneDetailView allows inline title/prose editing
9. ✅ **Discuss Scene** - Pre-fills chat with "Let's discuss the scene..." prompt
10. ✅ **Improved Scene Titles** - Extracts title from user request instead of first sentence
11. ✅ **Storyboard Strip** - Horizontal timeline showing scene thumbnails at top
12. ✅ **Add Scene Button** - In storyboard strip, pre-fills chat with scene creation prompt
13. ✅ **Multiple Scene Creation** - Verified scene count growing (1→2 scenes)
14. ✅ **Entity Extraction from Scenes** - New entity "Mnemonic Contamination" auto-extracted
15. ✅ **Relationship Extraction** - Multiple relationships auto-extracted (investigate, hunted_by, threatens)
16. ✅ **Draft → Canon Promotion** - "Promote to Canon" button in SceneDetailView
17. ✅ **Canon Status Display** - Green Canon badge with Award icon, checkmark in storyboard strip

### New Entities Created This Session
- **The Memory of the Horizon** - Root-Memory/artifact hidden in The Oubliette
- **Mnemonic Contamination** - A new concept threatening the Lucid Heights
- Various new relationships (claims, hidden_within, threatens_authority_of, infiltrates, investigate, hunted_by, threatens)

### New Scenes Created This Session
- **"Vesper and Mina: A Meeting in the Fugue"** - Vesper meeting Mina in the Fugue (edited title)
- **"The Wardens discover evidence of forbidden me"** - Wardens investigating memory trafficking in the Gilded Atrium

### Scenes Promoted to Canon
- **"Vesper and Mina: A Meeting in the Fugue"** - First scene promoted to Canon status

### Image Generation Implementation (Nano Banana)
18. ✅ **Nano Banana Integration** - Updated ImageGenerator to use Gemini native image gen models
19. ✅ **Scene Image Generation API** - `/api/narrative/visual/scene/:sceneId` endpoint with reference images
20. ✅ **Multi-Reference Support** - Up to 14 reference images (5 characters, 3 locations, 2 previous shots, etc.)
21. ✅ **Generate Image Button** - Wired up in SceneDetailView with loading state
22. ✅ **Visual Continuity** - Uses previous scene images and entity portraits as references

**Nano Banana Models Used:**
- `gemini-2.5-flash-image` - Fast model for quick iterations (up to 3 refs)
- `gemini-3-pro-image-preview` - Pro model for high quality (up to 14 refs, 4K output)

23. ✅ **Image Generation Working** - Successfully generates 3MB+ scene images via Gemini
24. ✅ **Scene Data Passthrough** - Frontend sends scene prose directly to API (not stored on server)
25. ✅ **Data URL Image Display** - Fixed image display using base64 data URLs for cross-port compatibility

26. ✅ **Panel Insertion** - Insert buttons appear between scenes on hover, opens contextual prompt
27. ✅ **Scene Navigation** - ◀ Previous / Next ▶ buttons in scene detail view with scene counter
28. ✅ **Entity Portrait Generation** - Generate Portrait button in entity detail view
29. ✅ **Entity Portrait API** - `/api/narrative/visual/entity/:entityId` endpoint for portraits
30. ✅ **Image Selection Flow** - Generate 4 Variations button, shows grid with A/B/C/D labels, click to select
31. ✅ **Scene Persistence** - Scenes now persist to API via POST/PUT endpoints
32. ✅ **Scene API Endpoints** - POST/PUT/DELETE `/api/narrative/interactions` for CRUD operations
33. ✅ **Line Break Display** - Entity descriptions and backstories now render line breaks properly using paragraph splitting
34. ✅ **Settings Panel** - New Settings panel accessible from header with Writing Style and Visual Style prompts
35. ✅ **Writing Style Prompt** - Custom prompt injected into LLM chat calls to guide narrative writing style
36. ✅ **Visual Style Prompt** - Custom prompt injected into all image generation calls (portraits, scenes, variations)
37. ✅ **Settings Persistence** - Settings saved to localStorage and persist between sessions

### Next Steps
1. **Fix Storyboard Click** - Add button click sometimes doesn't register (z-index)
2. **Test rejection flow** - Ensure rejected proposals don't add to graph
3. **Context menu** - Right-click for delete, regenerate, insert before/after
4. **Drag panels to reorder** - Reorder scenes in storyboard
5. **Empty state welcome** - Show prompt suggestions when starting fresh
