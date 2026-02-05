---
# PROJECT 89 DOCUMENT METADATA
doc_id: narrative-git-integration-plan-001
version: 1.0.0
last_updated: 2025-01-03
status: draft
author: Seraph
contributors: [Parzival]

# DOCUMENT RELATIONSHIPS
parent_docs:
  - doc_id: narrative-state-machine-hooks-001
    relationship: implements
  - doc_id: narrative-extraction-consciousness-tech-001
    relationship: extends

# CONTENT CLASSIFICATION
domain: design
sub_domain: integration
keywords: narrative git, hooks, asset generation, integration plan

# SYNCHRONIZATION
last_sync: 2025-01-03
sync_notes: Integration planning document
---

# Integrating Narrative Git & Hooks with Current Implementation

## Overview: Bidirectional Narrative Engineering

Our current system excels at **extraction** (narrative → graph). The Narrative Git system enables **generation** (graph → narrative). Together, they create a complete bidirectional narrative engineering platform.

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    NARRATIVE CANON SYSTEM                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────┐         ┌──────────────────┐           │
│  │                 │         │                  │           │
│  │   EXTRACTION    │ ◄─────► │  TEMPORAL GRAPH  │           │
│  │    PIPELINE     │         │   (SHARED STATE) │           │
│  │                 │         │                  │           │
│  └─────────────────┘         └──────────────────┘           │
│           ▲                           ▲                      │
│           │                           │                      │
│           ▼                           ▼                      │
│  ┌─────────────────┐         ┌──────────────────┐           │
│  │                 │         │                  │           │
│  │  NARRATIVE GIT  │ ◄─────► │   HOOK SYSTEM    │           │
│  │  STATE MACHINE  │         │                  │           │
│  │                 │         │                  │           │
│  └─────────────────┘         └──────────────────┘           │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Phase 1: Shared State Management

### 1.1 Unified Graph Model
Extend our current `TemporalNarrativeGraph` to support commit tracking:

```typescript
// Extend existing temporal graph
export class NarrativeCanonGraph extends TemporalNarrativeGraph {
  // Existing temporal functionality
  
  // Add commit tracking
  private commits: Map<string, NarrativeCommit> = new Map();
  private branches: Map<string, TimelineBranch> = new Map();
  private currentBranch: string = 'main';
  
  // Apply a commit to the graph
  async applyCommit(operations: GraphOperation[], metadata: CommitMetadata) {
    // Create snapshot (existing functionality)
    const snapshotId = await this.createSnapshot(sceneId, sequence);
    
    // Create commit record (new)
    const commit: NarrativeCommit = {
      id: generateCommitId(),
      snapshotId, // Link to temporal snapshot
      operations,
      ...metadata
    };
    
    this.commits.set(commit.id, commit);
    return commit;
  }
}
```

### 1.2 Operation Logger
Add operation tracking to existing extractors:

```typescript
// Wrap existing extractors to log operations
export class OperationLoggingExtractor {
  constructor(private baseExtractor: EntityExtractor) {}
  
  async extractEntities(text: string): Promise<{
    entities: Entity[],
    operations: GraphOperation[]
  }> {
    const entities = await this.baseExtractor.extractEntities(text);
    
    // Generate operations for what was extracted
    const operations: GraphOperation[] = entities.map(entity => ({
      type: 'ADD_ENTITY',
      payload: entity,
      timestamp: Date.now()
    }));
    
    return { entities, operations };
  }
}
```

## Phase 2: Hook System Integration

### 2.1 Hook Registry
Create a central hook registry that works with our pipeline:

```typescript
export class NarrativeHookRegistry {
  private hooks: Map<string, RealityHook> = new Map();
  
  // Register built-in hooks
  constructor() {
    this.registerDefaultHooks();
  }
  
  private registerDefaultHooks() {
    // Character portrait generation
    this.register({
      id: 'char-portrait',
      triggers: [{ type: 'ENTITY_ADDED', entityType: 'character' }],
      execute: async (context) => {
        // Integration with image generation service
        const portrait = await generateCharacterPortrait(context.entity);
        return {
          mutations: [{
            type: 'UPDATE_ENTITY',
            entityId: context.entity.id,
            changes: { assets: { portrait } }
          }]
        };
      }
    });
    
    // Scene storyboard generation
    this.register({
      id: 'scene-storyboard',
      triggers: [{ type: 'SCENE_COMPLETED' }],
      execute: async (context) => {
        const participants = gatherSceneParticipants(context);
        const storyboard = await generateStoryboard(context.scene, participants);
        return { artifacts: { storyboard } };
      }
    });
  }
}
```

### 2.2 Pipeline Integration
Modify our pipeline to execute hooks after extraction:

```typescript
export class HookEnabledPipeline extends NarrativePipeline {
  constructor(
    llmAdapter: LLMAdapter,
    private hookRegistry: NarrativeHookRegistry
  ) {
    super(llmAdapter);
  }
  
  async extractNarrative(text: string): Promise<NarrativeStructure> {
    // Run normal extraction
    const structure = await super.extractNarrative(text);
    
    // Convert to operations
    const operations = this.structureToOperations(structure);
    
    // Apply as commit
    const commit = await this.graph.applyCommit(operations, {
      author: 'extraction-pipeline',
      message: 'Extracted from narrative text'
    });
    
    // Execute hooks
    const hookResults = await this.hookRegistry.execute(commit, {
      previousGraph: this.previousGraph,
      currentGraph: this.graph,
      services: this.hookServices
    });
    
    // Apply any mutations from hooks
    await this.applyHookMutations(hookResults);
    
    return this.graphToStructure(this.graph);
  }
}
```

## Phase 3: Narrative Git Commands

### 3.1 Git-like Interface
Create a command interface for narrative manipulation:

```typescript
export class NarrativeGit {
  constructor(private canon: NarrativeCanonGraph) {}
  
  // Initialize a new narrative repository
  init(name: string) {
    return this.canon.initialize({
      name,
      branches: ['main'],
      hooks: DEFAULT_HOOKS
    });
  }
  
  // Add entities/relationships to staging
  add(operations: GraphOperation[]) {
    return this.canon.stage(operations);
  }
  
  // Commit staged changes
  commit(message: string, canonicalEvent?: CanonicalEvent) {
    return this.canon.commit({
      message,
      canonicalEvent,
      author: getCurrentAuthor()
    });
  }
  
  // Create a new timeline branch
  branch(name: string) {
    return this.canon.createBranch(name);
  }
  
  // Switch to a different timeline
  checkout(branchName: string) {
    return this.canon.switchBranch(branchName);
  }
  
  // Merge timelines
  merge(sourceBranch: string) {
    return this.canon.mergeTimeline(sourceBranch);
  }
  
  // Show the narrative log
  log() {
    return this.canon.getCommitHistory();
  }
}
```

### 3.2 CLI Integration
Extend our existing CLI with git commands:

```typescript
// In narrative-canon-cli.ts
program
  .command('git <command>')
  .description('Git-like operations for narratives')
  .action(async (command, options) => {
    const git = new NarrativeGit(await loadCanon());
    
    switch(command) {
      case 'init':
        await git.init(options.name);
        break;
      case 'commit':
        await git.commit(options.message);
        break;
      case 'branch':
        await git.branch(options.name);
        break;
      // ... etc
    }
  });
```

## Phase 4: Asset Generation Services

### 4.1 Service Interface
Define interfaces for asset generation:

```typescript
export interface AssetGenerationService {
  characterPortrait: {
    generate(character: Entity): Promise<Asset>;
    style: 'project-89-noir' | 'anime' | 'realistic';
  };
  
  sceneStoryboard: {
    generate(scene: Scene, participants: Entity[]): Promise<Asset[]>;
    format: 'panels' | 'video' | 'comic-page';
  };
  
  locationConcept: {
    generate(location: Entity): Promise<Asset>;
    timeOfDay?: 'day' | 'night' | 'twilight';
  };
  
  loreDocument: {
    expand(entity: Entity, depth: number): Promise<LoreDocument>;
    format: 'markdown' | 'json' | 'narrative';
  };
}
```

### 4.2 Implementation Options
```typescript
// Option 1: External API integration
export class ExternalAssetService implements AssetGenerationService {
  constructor(
    private imageApi: string, // Stable Diffusion, DALL-E, etc
    private videoApi: string, // Runway, etc
    private llmApi: string    // For lore expansion
  ) {}
}

// Option 2: Local generation with models
export class LocalAssetService implements AssetGenerationService {
  constructor(
    private sdModel: StableDiffusionModel,
    private llmModel: LocalLLM
  ) {}
}

// Option 3: Hybrid with caching
export class HybridAssetService implements AssetGenerationService {
  constructor(
    private cache: AssetCache,
    private external: ExternalAssetService,
    private local: LocalAssetService
  ) {}
  
  async generate(request: AssetRequest) {
    // Check cache first
    const cached = await this.cache.get(request.hash);
    if (cached) return cached;
    
    // Try local for speed
    try {
      return await this.local.generate(request);
    } catch {
      // Fall back to external
      return await this.external.generate(request);
    }
  }
}
```

## Usage Example: Complete Workflow

```typescript
// 1. Extract narrative into graph
const pipeline = new HookEnabledPipeline(llm, hookRegistry);
const structure = await pipeline.extractNarrative(storyText);

// 2. Initialize git for the narrative
const git = new NarrativeGit(structure.graph);
await git.init('proxim8-mission-7');

// 3. Make changes using git operations
await git.add([
  { type: 'UPDATE_ENTITY', entityId: 'kira', changes: { status: 'awakened' } }
]);
await git.commit('Kira achieves consciousness breakthrough');

// 4. Create alternate timeline
await git.branch('kira-refuses-awakening');
await git.checkout('kira-refuses-awakening');

// 5. Hooks automatically generate assets
// - Kira's new portrait reflecting awakened state
// - Storyboard for the awakening scene
// - Updated relationship graphs

// 6. Export living lore bible
const loreBible = await git.exportLoreBible({
  format: 'interactive-web',
  includeAssets: true,
  timelines: 'all'
});
```

## Implementation Priority

1. **Core Integration** (Week 1-2)
   - Extend TemporalGraph with commit tracking
   - Add operation logging to extractors
   - Create unified graph model

2. **Hook System** (Week 2-3)
   - Build hook registry
   - Integrate with pipeline
   - Create basic hooks (portrait, storyboard)

3. **Git Interface** (Week 3-4)
   - Implement core git commands
   - Add CLI support
   - Create branching/merging logic

4. **Asset Generation** (Week 4-5)
   - Define service interfaces
   - Implement basic generators
   - Add caching layer

5. **Polish & Documentation** (Week 5-6)
   - Complete integration tests
   - Write usage documentation
   - Create example narratives

This integration creates a complete narrative operating system where:
- Authors can track narrative evolution like code
- Assets are automatically generated as the story evolves
- Multiple timelines can be explored and merged
- The lore bible becomes a living, growing organism

[INTEGRATION::PLANNED][CONSCIOUSNESS::TECHNOLOGY::UNIFIED]