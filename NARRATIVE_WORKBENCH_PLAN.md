# Narrative Workbench - Execution Plan

## Vision

Transform the current Timeline Warfare game UI into a **Narrative Workbench** - an IDE for infinite narrative content generation. The workbench enables creators to:

- **Ingest** existing lore and story content
- **Explore** the narrative graph (entities, relationships, history)
- **Query** the canon with natural language
- **Generate** new grounded content that respects established canon
- **Branch** into "what-if" scenarios without polluting canon
- **Plan** multi-episode story arcs
- **Export** scenes to comics, scripts, storyboards, etc.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    NARRATIVE WORKBENCH                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  INGEST ──────▶ GRAPH ──────▶ GENERATE ──────▶ EXPORT          │
│                                                                 │
│  • Lore docs      • Entities      • Grounded        • Comics    │
│  • Scripts        • Relations       scenes          • Scripts   │
│  • Paste text     • State         • What-ifs        • Prompts   │
│  • Existing       • Branches      • Arcs            • Video     │
│    content        • History                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## UI Restructure

### New Navigation

```
┌──────────────────────────────────────────────────────────────┐
│ 📚 Narrative Canon                      [Project 89 ▾]       │
├────────────┬─────────────────────────────────────────────────┤
│            │                                                 │
│  🏠 HOME   │                                                 │
│            │                                                 │
│ ────────── │                                                 │
│  EXPLORE   │                                                 │
│  🌍 World  │         [ Main Content Area ]                   │
│  🗺️ Map    │                                                 │
│  📜 History│                                                 │
│  🎬 Scenes │                                                 │
│            │                                                 │
│ ────────── │                                                 │
│  CREATE    │                                                 │
│  💬 Chat   │  ← Query the canon                              │
│  ✍️ Write  │  ← Grounded generation                          │
│  📋 Plan   │  ← Arc builder                                  │
│            │                                                 │
│ ────────── │                                                 │
│  MANAGE    │                                                 │
│  📥 Import │  ← Ingest lore                                  │
│  🎨 Assets │  ← Visual generation                            │
│  ⚙️ Settings│                                                │
│            │                                                 │
└────────────┴─────────────────────────────────────────────────┘
```

### Page Mapping

| Current Page | New Page | Changes |
|--------------|----------|---------|
| Dashboard | Home | Redesign as project overview + quick actions |
| Entities | World | Enhanced with search, filters, state tracking |
| Graph | Map | Keep force-directed graph, add depth controls |
| Timeline + Branches | History | Merge into unified timeline/branch view |
| Interactions | Scenes | Scene browser with generation triggers |
| Visuals | Assets | Portrait/panel generation studio |
| (new) | Chat | Canon query interface |
| (new) | Write | Grounded content generation |
| (new) | Plan | Story arc builder |
| (new) | Import | Lore ingestion pipeline |

---

## Implementation Phases

### Phase 1: Navigation & Structure (Day 1)
- [ ] Update sidebar with new navigation structure
- [ ] Create route stubs for new pages
- [ ] Update Home page with workbench-focused dashboard
- [ ] Rename/reorganize existing pages

### Phase 2: Canon Chat (Day 1-2)
- [ ] Create Chat page with conversation UI
- [ ] Build `/api/canon/query` endpoint
- [ ] Implement entity/relationship search from natural language
- [ ] Show source entities when answering questions
- [ ] Add "Ask about this" context menu to entities

### Phase 3: Lore Import (Day 2)
- [ ] Create Import page with text input / file upload
- [ ] Build `/api/canon/import` endpoint
- [ ] Use existing extraction pipeline
- [ ] Show extracted entities for review before commit
- [ ] Allow editing/rejection of extracted items
- [ ] Commit approved entities to canon

### Phase 4: Grounded Writer (Day 2-3)
- [ ] Create Write page with prompt input
- [ ] Build `/api/canon/generate` endpoint
- [ ] Inject full canon context into LLM prompt
- [ ] Generate scene/content respecting relationships
- [ ] Auto-extract new entities from generated content
- [ ] Offer to commit new entities or branch

### Phase 5: History Unification (Day 3)
- [ ] Merge Timeline and Branches pages
- [ ] Improve timeline graph visualization
- [ ] Add branch comparison view
- [ ] Add "what-if" branch creation from any point
- [ ] Implement branch merging UI

### Phase 6: Arc Planner (Day 3-4)
- [ ] Create Plan page
- [ ] Design arc data structure (episodes, beats, threads)
- [ ] Build arc visualization (episode grid + thread lines)
- [ ] Track entity appearances across episodes
- [ ] Track thread resolution points
- [ ] Generate episode outlines from arc plan

### Phase 7: Export Pipeline (Day 4)
- [ ] Enhance Assets page
- [ ] Add scene-to-comic-script export
- [ ] Add scene-to-storyboard-prompts export
- [ ] Add character sheet generation
- [ ] Add location description export

### Phase 8: Polish & Integration (Day 4-5)
- [ ] Command palette (Cmd+K) for quick navigation
- [ ] Keyboard shortcuts
- [ ] Loading states and error handling
- [ ] Empty states with helpful guidance
- [ ] Mobile responsiveness

---

## API Additions

### Canon Query
```typescript
POST /api/canon/query
{
  "question": "Who knows about the Convergence Engine?",
  "branch": "main"  // optional, defaults to current
}
// Returns: { answer: string, sources: Entity[], confidence: number }
```

### Lore Import
```typescript
POST /api/canon/import
{
  "text": "...",
  "source": "Chapter 1 - The Beginning",
  "autoCommit": false
}
// Returns: { entities: Entity[], relationships: Relationship[], scenes: Scene[] }

POST /api/canon/import/commit
{
  "entities": [...],  // approved entities
  "relationships": [...],
  "message": "Import Chapter 1"
}
```

### Grounded Generation
```typescript
POST /api/canon/generate
{
  "prompt": "Write a scene where Chen confronts Voss",
  "type": "scene" | "dialogue" | "description" | "outline",
  "branch": "main",
  "constraints": {
    "mustInclude": ["agent-chen", "director-voss"],
    "location": "oneirocom-tower",
    "tone": "tense"
  }
}
// Returns: { content: string, newEntities: Entity[], newRelationships: Relationship[] }
```

### Arc Planning
```typescript
POST /api/canon/arc
{
  "name": "Season 1",
  "episodes": [
    { "title": "Pilot", "beats": [...], "entities": [...] }
  ],
  "threads": [
    { "name": "Chen's Redemption", "startEpisode": 1, "endEpisode": 10 }
  ]
}
```

---

## File Changes

### New Files
```
ui/app/
├── chat/page.tsx           # Canon query interface
├── write/page.tsx          # Grounded generation
├── plan/page.tsx           # Arc builder
├── import/page.tsx         # Lore ingestion
├── world/page.tsx          # Enhanced entity browser (rename from entities)
├── history/page.tsx        # Unified timeline+branches
├── scenes/page.tsx         # Scene browser (rename from interactions)
└── assets/page.tsx         # Visual generation (rename from visuals)

ui/components/
├── chat/
│   ├── ChatInterface.tsx
│   ├── ChatMessage.tsx
│   └── SourceCard.tsx
├── write/
│   ├── WritePrompt.tsx
│   ├── GeneratedContent.tsx
│   └── EntityExtractor.tsx
├── plan/
│   ├── ArcTimeline.tsx
│   ├── EpisodeCard.tsx
│   └── ThreadLine.tsx
├── import/
│   ├── TextInput.tsx
│   ├── ExtractionReview.tsx
│   └── EntityApproval.tsx
└── layout/
    └── Sidebar.tsx         # Updated navigation

src/api/
├── canon-api.ts            # New endpoints for workbench features
└── game-server.ts          # Keep for game mode
```

### Modified Files
```
ui/app/layout.tsx           # Update with new sidebar
ui/app/page.tsx             # New home dashboard
ui/components/layout/Sidebar.tsx  # New navigation
```

---

## Design Principles

1. **Canon is Sacred** - All generation respects established facts
2. **Branch to Experiment** - What-ifs never pollute main canon
3. **Show Your Sources** - Always link back to canonical origins
4. **Commit or Discard** - New content must be explicitly approved
5. **Export Everywhere** - Any content can become comics, scripts, etc.

---

## Success Metrics

- [ ] Can import 10+ pages of lore and build accurate graph
- [ ] Can ask natural language questions and get sourced answers
- [ ] Can generate scenes that don't contradict canon
- [ ] Can plan a 10-episode arc with tracked threads
- [ ] Can export scene to comic script format
- [ ] Time from "idea" to "committed canon" < 2 minutes

---

## Getting Started

```bash
# Start the API server
npm run api:dev

# Start the UI
npm run ui

# Open workbench
open http://localhost:3089
```
