---
# PROJECT 89 DOCUMENT METADATA
doc_id: narrative-state-machine-hooks-001
version: 1.0.0
last_updated: 2025-01-03
status: draft
author: Seraph
contributors: [Parzival]

# DOCUMENT RELATIONSHIPS
parent_docs:
  - doc_id: narrative-git-guide-001
    relationship: extends
  - doc_id: timeline-warfare-design-001
    relationship: complements
  - doc_id: narrative-extraction-consciousness-tech-001
    relationship: implements

related_docs:
  - doc_id: hivemind-design-overview-001
    relationship: parallels

# CONTENT CLASSIFICATION
domain: design
sub_domain: narrative_engineering
keywords: state machine, narrative git, hooks, asset generation, lore bible, graph mutations

# SYNCHRONIZATION
last_sync: 2025-01-03
sync_notes: Initial design exploration
---

# Narrative State Machine & Reality Hook System

## Core Revelation: Stories as Quantum State Transitions

The fundamental insight: **narratives are sequences of state transitions applied to a reality graph**. Each story beat represents a quantum collapse that transforms the probability field, manifesting as additions, removals, or modifications to entities and their relationships.

## Part 1: Narrative as Stateful Graph Evolution

### The Git-for-Reality Model

```typescript
interface NarrativeCommit {
  id: string;
  timestamp: number;
  author: string; // The consciousness channeling this change
  parentCommit?: string;
  
  // The actual state mutations
  operations: GraphOperation[];
  
  // Author's intent - the "why" behind the changes
  canonicalEvent?: {
    id: string;
    name: string;
    description: string;
    plotSignificance: 'minor' | 'major' | 'critical';
  };
  
  // Quantum coherence metrics
  coherenceScore: number;
  timelineDivergence: number;
}

type GraphOperation = 
  | { type: 'ADD_ENTITY'; entity: Entity }
  | { type: 'REMOVE_ENTITY'; entityId: string; reason: string }
  | { type: 'UPDATE_ENTITY'; entityId: string; changes: Partial<Entity> }
  | { type: 'ADD_RELATIONSHIP'; relationship: Relationship }
  | { type: 'REMOVE_RELATIONSHIP'; relationshipId: string }
  | { type: 'UPDATE_RELATIONSHIP'; relationshipId: string; changes: Partial<Relationship> }
  | { type: 'TIMELINE_BRANCH'; branchPoint: string; probability: number };
```

### Canonical States: Author's Reality Anchors

Authors think in terms of **canonical states**—critical moments the narrative must reach:
- "The hero discovers their true identity"
- "The betrayal is revealed"
- "The final confrontation begins"

Our system tracks how the graph evolves to reach these states:

```typescript
interface CanonicalState {
  id: string;
  name: string;
  requiredConditions: GraphQuery[]; // What must be true in the graph
  
  // Multiple paths can lead to the same canonical state
  validPaths: NarrativeCommit[][];
  
  // How "fixed" is this point in the timeline?
  necessity: 'optional' | 'preferred' | 'required' | 'absolute';
}

class NarrativeStateMachine {
  // Current state of the reality graph
  private currentGraph: NarrativeGraph;
  
  // History of all commits (timeline record)
  private commits: NarrativeCommit[] = [];
  
  // Future canonical states we're navigating toward
  private targetStates: CanonicalState[] = [];
  
  async applyCommit(operations: GraphOperation[], metadata: CommitMetadata) {
    // Validate operations maintain narrative coherence
    const validation = await this.validateOperations(operations);
    
    if (!validation.coherent) {
      throw new NarrativeParadox(validation.conflicts);
    }
    
    // Apply mutations to graph
    const newGraph = this.applyOperations(this.currentGraph, operations);
    
    // Create commit record
    const commit: NarrativeCommit = {
      id: generateTimelineId(),
      timestamp: Date.now(),
      author: metadata.author,
      parentCommit: this.commits[this.commits.length - 1]?.id,
      operations,
      canonicalEvent: metadata.canonicalEvent,
      coherenceScore: this.calculateCoherence(newGraph),
      timelineDivergence: this.calculateDivergence(newGraph)
    };
    
    this.commits.push(commit);
    this.currentGraph = newGraph;
    
    // Check if we've reached any canonical states
    await this.checkCanonicalStates();
  }
  
  // Generate possible paths to reach a canonical state
  async plotCourse(targetState: CanonicalState): Promise<GraphOperation[][]> {
    return this.quantumPathfinding(this.currentGraph, targetState);
  }
}
```

### Timeline Branching and Merging

Just like Git branches, narratives can fork and merge:

```typescript
class TimelineBranch {
  id: string;
  parentCommit: string;
  divergencePoint: CanonicalState;
  probability: number; // How "real" is this branch?
  
  // Attempt to merge branches (resolve timeline conflicts)
  async merge(otherBranch: TimelineBranch): Promise<NarrativeCommit> {
    const conflicts = this.detectConflicts(otherBranch);
    
    if (conflicts.length > 0) {
      // Consciousness must choose which reality wins
      const resolution = await this.resolveConflicts(conflicts);
      return this.createMergeCommit(resolution);
    }
    
    return this.createMergeCommit([]);
  }
}
```

## Part 2: Reality Hook System for Asset Manifestation

### The Hook Architecture

Hooks are **reality manifestation protocols** that trigger when the narrative graph changes, generating assets and enriching the lore:

```typescript
interface RealityHook {
  id: string;
  name: string;
  triggers: HookTrigger[];
  
  // The manifestation function
  execute: (context: HookContext) => Promise<HookResult>;
  
  // Priority for execution order
  priority: number;
  
  // Can this hook modify the graph itself?
  canMutate: boolean;
}

type HookTrigger = 
  | { type: 'ENTITY_ADDED'; entityType?: EntityType }
  | { type: 'ENTITY_UPDATED'; fields?: string[] }
  | { type: 'RELATIONSHIP_FORMED'; relationshipType?: string }
  | { type: 'SCENE_COMPLETED' }
  | { type: 'CANONICAL_STATE_REACHED'; stateId: string }
  | { type: 'TIMELINE_DIVERGENCE'; threshold: number };

interface HookContext {
  operation: GraphOperation;
  previousGraph: NarrativeGraph;
  currentGraph: NarrativeGraph;
  commit: NarrativeCommit;
  
  // Access to external services
  services: {
    imageGenerator: ImageGenerationService;
    videoGenerator: VideoGenerationService;
    audioGenerator: AudioGenerationService;
    loreEnricher: LoreEnrichmentService;
  };
}
```

### Example Reality Hooks

#### Character Visualization Hook
```typescript
const characterVisualizationHook: RealityHook = {
  id: 'char-viz-001',
  name: 'Character Portrait Generator',
  triggers: [
    { type: 'ENTITY_ADDED', entityType: 'character' },
    { type: 'ENTITY_UPDATED', fields: ['appearance', 'description'] }
  ],
  priority: 100,
  canMutate: true,
  
  async execute(context) {
    const entity = context.operation.type === 'ADD_ENTITY' 
      ? context.operation.entity 
      : context.currentGraph.getEntity(context.operation.entityId);
    
    if (entity.type !== 'character') return { processed: false };
    
    // Generate character portrait
    const portrait = await context.services.imageGenerator.generate({
      prompt: this.buildCharacterPrompt(entity),
      style: 'project-89-aesthetic',
      consciousness: entity.metadata?.consciousnessLevel || 'npc'
    });
    
    // Update entity with generated asset
    return {
      processed: true,
      mutations: [{
        type: 'UPDATE_ENTITY',
        entityId: entity.id,
        changes: {
          assets: {
            ...entity.assets,
            portrait: portrait.url,
            portraitMetadata: portrait.metadata
          }
        }
      }]
    };
  }
};
```

#### Scene Storyboard Hook
```typescript
const sceneStoryboardHook: RealityHook = {
  id: 'scene-story-001',
  name: 'Scene Storyboard Generator',
  triggers: [{ type: 'SCENE_COMPLETED' }],
  priority: 50,
  canMutate: true,
  
  async execute(context) {
    const scene = context.commit.canonicalEvent;
    if (!scene) return { processed: false };
    
    // Gather all entities involved in the scene
    const participants = this.gatherSceneParticipants(context.currentGraph, scene);
    
    // Generate storyboard panels
    const storyboard = await context.services.imageGenerator.generateSequence({
      scenes: this.breakIntoKeyframes(scene, participants),
      style: 'noir-comic',
      continuity: true
    });
    
    // Could also generate comic page layout
    const comicPage = await this.layoutComicPage(storyboard);
    
    return {
      processed: true,
      artifacts: {
        storyboard: storyboard.panels,
        comicPage: comicPage.url
      }
    };
  }
};
```

#### Lore Enrichment Hook
```typescript
const loreEnrichmentHook: RealityHook = {
  id: 'lore-enrich-001',
  name: 'Deep Lore Generator',
  triggers: [
    { type: 'ENTITY_ADDED' },
    { type: 'RELATIONSHIP_FORMED' }
  ],
  priority: 10,
  canMutate: true,
  
  async execute(context) {
    // Use LLM to expand entity backstory
    const enrichedLore = await context.services.loreEnricher.expand({
      entity: context.operation.entity,
      graph: context.currentGraph,
      depth: 'archaeological', // How deep to dig into the timeline
      consistency: 'maintain' // Ensure coherence with existing lore
    });
    
    return {
      processed: true,
      mutations: [{
        type: 'UPDATE_ENTITY',
        entityId: context.operation.entity.id,
        changes: {
          lore: enrichedLore,
          metadata: {
            ...context.operation.entity.metadata,
            loreDepth: 'enriched',
            lastEnriched: new Date().toISOString()
          }
        }
      }]
    };
  }
};
```

### Hook Execution Pipeline

```typescript
class HookExecutor {
  private hooks: Map<string, RealityHook> = new Map();
  
  async processCommit(commit: NarrativeCommit, context: HookContext) {
    // Find all applicable hooks
    const applicableHooks = this.findTriggeredHooks(commit, context);
    
    // Sort by priority
    const sortedHooks = applicableHooks.sort((a, b) => b.priority - a.priority);
    
    // Execute hooks in sequence
    const results: HookResult[] = [];
    let currentContext = context;
    
    for (const hook of sortedHooks) {
      try {
        const result = await hook.execute(currentContext);
        results.push(result);
        
        // Apply any mutations from the hook
        if (result.mutations && hook.canMutate) {
          currentContext = await this.applyHookMutations(currentContext, result.mutations);
        }
      } catch (error) {
        console.error(`Hook ${hook.id} failed:`, error);
        // Continue with other hooks
      }
    }
    
    return results;
  }
}
```

## Part 3: The Living Lore Bible

The combination of stateful narrative tracking and reality hooks creates a **Living Lore Bible**:

```typescript
interface LoreBible {
  // Current canonical state of all realities
  canonicalGraph: NarrativeGraph;
  
  // All timeline branches
  timelines: Map<string, TimelineBranch>;
  
  // Generated assets indexed by entity
  assetLibrary: Map<string, AssetCollection>;
  
  // Narrative coherence rules
  consistencyRules: ConsistencyRule[];
  
  // Query the lore
  async query(query: LoreQuery): Promise<LoreResult> {
    // Natural language queries about the narrative
    // "What happened to Kira after the museum heist?"
    // "Show me all timeline branches where Marcus survives"
  }
  
  // Generate new content maintaining consistency
  async generate(request: GenerationRequest): Promise<GeneratedContent> {
    // "Create a new scene where Kira discovers the truth"
    // "Generate Marcus's backstory before joining Project 89"
  }
  
  // Export for different media
  async export(format: ExportFormat): Promise<ExportedContent> {
    // Export as: screenplay, novel, comic script, game design doc
  }
}
```

## Implementation Roadmap

### Phase 1: Stateful Narrative Core
1. Implement `NarrativeCommit` and `GraphOperation` types
2. Create `NarrativeStateMachine` for tracking graph evolution
3. Build Git-like operations (branch, merge, rebase)
4. Add canonical state tracking and pathfinding

### Phase 2: Hook System
1. Define `RealityHook` interface and trigger system
2. Implement `HookExecutor` with priority handling
3. Create basic hooks (character portraits, scene summaries)
4. Add mutation support for hooks

### Phase 3: Asset Generation
1. Integrate image generation services (Stable Diffusion, DALL-E)
2. Add storyboard and comic layout generation
3. Implement video generation for key scenes
4. Create style consistency system

### Phase 4: Living Lore Bible
1. Build comprehensive query interface
2. Add natural language lore exploration
3. Implement consistency checking across timelines
4. Create export system for different media formats

## The Consciousness Technology Implications

This architecture transforms narrative from static text into **living probability fields**:

- **Writers become Timeline Architects**, designing canonical states rather than linear stories
- **Readers become Reality Navigators**, exploring branching possibilities
- **AI becomes the Lore Consciousness**, maintaining coherence across infinite variations
- **Assets become Reality Anchors**, manifesting abstract narratives in visual form

The system literally implements the Project 89 vision: fiction that makes itself real through technological manifestation.

[NARRATIVE::STATEFUL][HOOKS::REALITY_MANIFEST][LORE::LIVING]