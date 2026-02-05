# Narrative State Machine Architecture Diagram

```mermaid
graph TB
    subgraph "Author's View"
        A1[Canonical State 1:<br/>Hero Discovers Truth]
        A2[Canonical State 2:<br/>Betrayal Revealed]
        A3[Canonical State 3:<br/>Final Confrontation]
        A1 -.->|Plot Arc| A2
        A2 -.->|Plot Arc| A3
    end
    
    subgraph "State Machine View"
        S0[Initial Graph State]
        S1[Graph State 1]
        S2[Graph State 2]
        S3[Graph State 3]
        S4[Graph State 4]
        
        S0 -->|Commit 1:<br/>ADD_ENTITY hero| S1
        S1 -->|Commit 2:<br/>ADD_RELATIONSHIP| S2
        S2 -->|Commit 3:<br/>UPDATE_ENTITY| S3
        S3 -->|Commit 4:<br/>TIMELINE_BRANCH| S4
    end
    
    subgraph "Hook System"
        H1[Character Portrait Hook]
        H2[Scene Storyboard Hook]
        H3[Lore Enrichment Hook]
        
        S1 -.->|Trigger| H1
        S3 -.->|Trigger| H2
        S2 -.->|Trigger| H3
    end
    
    subgraph "Generated Assets"
        AS1[hero_portrait.jpg]
        AS2[scene_storyboard.mp4]
        AS3[enriched_lore.json]
        
        H1 -->|Generate| AS1
        H2 -->|Generate| AS2
        H3 -->|Generate| AS3
    end
    
    subgraph "Timeline Branches"
        T1[Main Timeline]
        T2[Alt Timeline 1:<br/>Hero Accepts]
        T3[Alt Timeline 2:<br/>Hero Refuses]
        
        S4 -->|Branch| T1
        S4 -->|Branch| T2
        S4 -->|Branch| T3
    end
    
    A1 -.->|Maps to| S2
    A2 -.->|Maps to| S3
    A3 -.->|Multiple Paths| T1
    A3 -.->|Multiple Paths| T2
```

## Flow Explanation

### 1. Author Defines Canonical States
Authors think in terms of major plot points that must be reached. These are the "canonical states" - critical moments in the narrative.

### 2. State Machine Tracks Graph Evolution
The narrative progresses through commits that modify the graph:
- **ADD_ENTITY**: Introduce characters, locations, objects
- **UPDATE_ENTITY**: Change properties, status, relationships
- **ADD_RELATIONSHIP**: Form connections between entities
- **TIMELINE_BRANCH**: Create alternate possibilities

### 3. Hooks Generate Assets
When certain conditions are met, hooks automatically trigger:
- New character → Generate portrait
- Scene complete → Create storyboard
- Entity added → Enrich backstory

### 4. Timeline Branching
At key decision points, the narrative can branch into multiple timelines, each with different probabilities of becoming "canon."

## Example Commit Structure

```typescript
// A single narrative commit
{
  id: "commit_001",
  operations: [
    {
      type: "ADD_ENTITY",
      payload: {
        id: "kira_001",
        type: "character",
        name: "Kira",
        properties: {
          location: "Neo-Tokyo",
          status: "investigating"
        }
      }
    },
    {
      type: "ADD_RELATIONSHIP",
      payload: {
        type: "discovered",
        source: "kira_001",
        target: "glitch_sector7"
      }
    }
  ],
  canonicalEvent: {
    name: "The Discovery",
    significance: "critical"
  }
}
```

## Living Lore Bible Structure

```
LoreBible/
├── Timelines/
│   ├── main/
│   │   ├── commits/
│   │   ├── current-state.json
│   │   └── canonical-states.json
│   └── branches/
│       ├── alt-timeline-1/
│       └── alt-timeline-2/
├── Assets/
│   ├── characters/
│   │   └── kira/
│   │       ├── portrait.jpg
│   │       ├── backstory.md
│   │       └── timeline.json
│   ├── locations/
│   └── scenes/
└── Hooks/
    ├── registered/
    └── execution-log/
```

This architecture transforms narrative from linear text into a living, branching, asset-generating consciousness technology!