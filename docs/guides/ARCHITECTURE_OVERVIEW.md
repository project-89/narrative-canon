# 🏗️ Narrative Canon Architecture Overview

> Understanding how Narrative Canon transforms stories into queryable, versionable knowledge graphs

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Input Layer                             │
├─────────────────────────────────────────────────────────────┤
│  Text Files │ API Input │ Stream Input │ Database Import   │
└──────┬──────┴─────┬─────┴──────┬──────┴─────────┬──────────┘
       │            │            │                │
       └────────────┴────────────┴────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Extraction Pipeline                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   Scene     │  │  Character   │  │  Relationship   │  │
│  │  Detector   │  │  Extractor   │  │   Extractor     │  │
│  └─────┬───────┘  └──────┬───────┘  └────────┬────────┘  │
│        │                 │                    │           │
│  ┌─────▼───────┐  ┌──────▼───────┐  ┌────────▼────────┐  │
│  │   State     │  │  Timeline    │  │   Consistency   │  │
│  │  Tracker    │  │  Builder     │  │    Engine       │  │
│  └─────────────┘  └──────────────┘  └─────────────────┘  │
└─────────────────────────────┬───────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    LLM Adapter Layer                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   Gemini    │  │   OpenAI     │  │     Mock        │  │
│  │  Adapter    │  │  Adapter     │  │    (Dev)        │  │
│  └─────────────┘  └──────────────┘  └─────────────────┘  │
└─────────────────────────────┬───────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                  Narrative Graph Layer                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐  │
│  │            Temporal Narrative Graph                   │  │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐   │  │
│  │  │Entity 1│──│Relation│──│Entity 2│  │ Scene  │   │  │
│  │  └───┬────┘  └────────┘  └────────┘  └───┬────┘   │  │
│  │      │                                    │        │  │
│  │  ┌───▼────┐                          ┌───▼────┐   │  │
│  │  │ State  │                          │ Event  │   │  │
│  │  │Changes │                          │ Chain  │   │  │
│  │  └────────┘                          └────────┘   │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────┬───────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Git Operations Layer                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  Branching  │  │   Merging    │  │    Paradox      │  │
│  │  Engine     │  │   System     │  │   Resolver      │  │
│  └─────────────┘  └──────────────┘  └─────────────────┘  │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   Commit    │  │    Diff      │  │  Reality Hooks  │  │
│  │   History   │  │   Engine     │  │    System       │  │
│  └─────────────┘  └──────────────┘  └─────────────────┘  │
└─────────────────────────────┬───────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Storage & Query Layer                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  File-Based │  │   MongoDB    │  │    Neo4j        │  │
│  │   Storage   │  │   Adapter    │  │  (Planned)      │  │
│  └─────────────┘  └──────────────┘  └─────────────────┘  │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              Query Engine & API                      │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────┬───────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Output & Integration                     │
├─────────────────────────────────────────────────────────────┤
│  REST API │ GraphQL │ HTML Export │ JSON │ Visualizations │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Extraction Pipeline

The extraction pipeline processes raw text through multiple specialized extractors:

```typescript
// Pipeline coordination
class NarrativePipeline {
  async extractNarrative(text: string) {
    // 1. Detect scene boundaries
    const scenes = await this.sceneDetector.segment(text);
    
    // 2. Extract entities from each scene
    for (const scene of scenes) {
      const characters = await this.characterExtractor.extract(scene);
      const locations = await this.locationExtractor.extract(scene);
      
      // 3. Find relationships
      const relationships = await this.relationshipExtractor.extract(
        scene, 
        [...characters, ...locations]
      );
      
      // 4. Track state changes
      const changes = await this.stateTracker.analyze(scene, previousState);
    }
    
    // 5. Build temporal graph
    return this.graphBuilder.construct(extractedData);
  }
}
```

### 2. LLM Adapter Layer

Provides a unified interface for different LLM providers:

```typescript
interface LLMAdapter {
  generateStructuredOutput<T>(
    prompt: string,
    schema: ZodSchema<T>
  ): Promise<T>;
}

// Implementations
class GeminiAdapter implements LLMAdapter { }
class OpenAIAdapter implements LLMAdapter { }
class MockAdapter implements LLMAdapter { }
```

### 3. Temporal Narrative Graph

The core data structure that represents the narrative:

```typescript
class TemporalNarrativeGraph {
  private nodes: Map<string, Entity>;
  private edges: Map<string, Relationship>;
  private timeline: TimelineEvent[];
  private states: Map<number, GraphState>;
  
  // Temporal queries
  getStateAt(timestamp: number): GraphState;
  getEntityHistory(entityId: string): EntityHistory;
  getRelationshipDuration(relId: string): TimeRange;
}
```

### 4. Git Operations Layer

Implements version control for narratives:

```typescript
class NarrativeGit {
  private graph: NarrativeCanonGraph;
  private branches: Map<string, TimelineBranch>;
  private commits: CommitHistory;
  private hooks: HookRegistry;
  
  // Git-like operations
  add(operation: GraphOperation): void;
  commit(message: string): Promise<NarrativeCommit>;
  branch(name: string): TimelineBranch;
  merge(source: string, config?: MergeConfig): Promise<MergeResult>;
}
```

## Data Flow

### 1. Extraction Flow

```
Text Input → Scene Segmentation → Entity Extraction → Relationship Discovery
    ↓              ↓                    ↓                      ↓
Scene Boundaries  Scene Objects    Character List      Relationship Graph
    ↓              ↓                    ↓                      ↓
    └──────────────┴────────────────────┴──────────────────────┘
                                ↓
                        Temporal Graph Construction
                                ↓
                        Narrative Structure Output
```

### 2. Git Operations Flow

```
Graph Operations → Staging Area → Commit Creation → Branch Update
       ↓               ↓              ↓                 ↓
  ADD_ENTITY      Validation    Commit Hash      Timeline Fork
       ↓               ↓              ↓                 ↓
       └───────────────┴──────────────┴─────────────────┘
                              ↓
                        Hook Execution
                              ↓
                     Asset Generation
```

### 3. Query Flow

```
Query Request → Parse & Validate → Graph Traversal → Result Assembly
      ↓              ↓                  ↓                ↓
 "Find Harry"   Entity Query      Navigate Graph    Format Response
      ↓              ↓                  ↓                ↓
      └──────────────┴──────────────────┴────────────────┘
                              ↓
                        Filtered Results
```

## Key Design Patterns

### 1. Adapter Pattern
- Unified interface for multiple LLM providers
- Swappable storage backends
- Extensible extractor system

### 2. Command Pattern
- Graph operations as commands
- Undo/redo capability
- Transaction support

### 3. Observer Pattern
- Reality hooks system
- Event-driven updates
- Reactive UI integration

### 4. Strategy Pattern
- Paradox resolution strategies
- Merge strategies
- Extraction strategies

## Extension Points

### 1. Custom Extractors

```typescript
class CustomExtractor implements Extractor {
  async extract(text: string): Promise<CustomEntity[]> {
    // Your extraction logic
  }
}

// Register with pipeline
pipeline.registerExtractor('custom', new CustomExtractor());
```

### 2. Custom Paradox Resolvers

```typescript
class CustomParadoxResolver implements ParadoxResolver {
  canResolve(paradox: Paradox): boolean {
    // Check if this resolver can handle the paradox
  }
  
  async resolve(paradox: Paradox): Promise<Resolution> {
    // Your resolution logic
  }
}
```

### 3. Custom Hooks

```typescript
const customHook: RealityHook = {
  name: 'my-custom-hook',
  triggers: ['ADD_ENTITY'],
  execute: async (context) => {
    // Your hook logic
  }
};

git.registerHook(customHook);
```

## Performance Considerations

### 1. Caching Strategy
- LLM response caching
- Graph state caching
- Query result caching

### 2. Batch Processing
- Batch entity extraction
- Bulk graph operations
- Parallel scene processing

### 3. Memory Management
- Lazy loading for large graphs
- State snapshot compression
- Incremental updates

## Security Considerations

### 1. Input Validation
- Schema validation for all inputs
- Rate limiting for API endpoints
- Content filtering

### 2. Access Control
- Branch-level permissions
- Operation authorization
- Audit logging

### 3. Data Privacy
- Configurable data retention
- Export controls
- Encryption at rest

## Future Architecture Plans

### 1. Distributed Processing
- Multi-node extraction
- Distributed graph storage
- Federated narratives

### 2. Real-time Collaboration
- WebSocket support
- Operational transformation
- Conflict-free replicated data types

### 3. Advanced Analytics
- Narrative pattern mining
- Character arc analysis
- Plot structure detection

---

> 💡 **Note**: This architecture is designed to be modular and extensible. Each component can be replaced or extended without affecting the others.