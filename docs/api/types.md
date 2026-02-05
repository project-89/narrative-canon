# TypeScript Types Reference

Complete reference for all TypeScript interfaces and types used in Narrative Canon.

## Core Narrative Types

### Entity

Represents any named entity in a narrative (characters, locations, objects, events, concepts).

```typescript
interface Entity {
  id: string;                    // Unique identifier
  type: EntityType;              // Entity classification
  name: string;                  // Display name
  description: string;           // Detailed description
  aliases?: string[];            // Alternative names
  properties?: Record<string, any>; // Custom properties
  firstMention?: number;         // Position in text (0-1)
  lastMention?: number;          // Last position in text (0-1)
  metadata?: Record<string, any>; // Additional metadata
}

type EntityType = 'character' | 'location' | 'object' | 'event' | 'concept';
```

### Relationship

Represents connections between entities.

```typescript
interface Relationship {
  id: string;                    // Unique identifier
  type: string;                  // Relationship type (e.g., 'friendship', 'located_at')
  source: string;                // Source entity ID
  target: string;                // Target entity ID
  description?: string;          // Description of the relationship
  strength?: number;             // Relationship strength (0-1)
  properties?: Record<string, any>; // Custom properties
  metadata?: Record<string, any>; // Additional metadata
}
```

### Scene

Represents a segment of the narrative with specific participants and actions.

```typescript
interface Scene {
  id: string;                    // Unique identifier
  sequence: number;              // Order in the story
  summary?: string;              // Brief summary
  description: string;           // Detailed description
  location?: string;             // Location entity ID
  characters: string[];          // Character entity IDs
  objects: string[];             // Object entity IDs
  timeframe?: {                  // Timing information
    start?: number;
    duration?: number;
    sequence?: number;
  };
  mood?: string;                 // Emotional tone
  significance?: SceneSignificance; // Plot importance
  metadata?: Record<string, any>; // Additional metadata
}

type SceneSignificance = 'minor' | 'moderate' | 'major' | 'critical';
```

### StateChange

Represents how entities change throughout the narrative.

```typescript
interface StateChange {
  id: string;                    // Unique identifier
  entityId: string;              // Affected entity ID
  type: StateChangeType;         // Type of change
  description: string;           // Description of the change
  sceneId?: string;              // Scene where change occurred
  timestamp?: number;            // When the change happened
  from?: any;                    // Previous state
  to?: any;                      // New state
  significance?: StateChangeSignificance; // Importance of change
  metadata?: Record<string, any>; // Additional metadata
}

type StateChangeType = 'created' | 'destroyed' | 'moved' | 'transformed' | 'acquired' | 'lost';
type StateChangeSignificance = 'minor' | 'moderate' | 'major' | 'critical';
```

### NarrativeStructure

Complete narrative extracted from text.

```typescript
interface NarrativeStructure {
  entities: Entity[];            // All extracted entities
  relationships: Relationship[]; // All relationships
  scenes: Scene[];               // Story scenes
  stateChanges: StateChange[];   // Entity state changes
  chronology: {                  // Timeline information
    events: ChronologyEvent[];
    timeline: TimelineEntry[];
  };
  themes: Theme[];               // Thematic elements
  metadata?: {                   // Extraction metadata
    extractedAt?: string;
    version?: string;
    source?: string;
    [key: string]: any;
  };
}
```

## Git for Narratives Types

### GraphOperation

Atomic operations that can be applied to the narrative graph.

```typescript
type GraphOperation = 
  | AddEntityOperation
  | RemoveEntityOperation
  | UpdateEntityOperation
  | AddRelationshipOperation
  | RemoveRelationshipOperation
  | UpdateRelationshipOperation
  | TimelineBranchOperation
  | TimelineMergeOperation;

interface BaseOperation {
  id: string;                    // Unique operation ID
  timestamp: number;             // When operation was created
}
```

#### Entity Operations

```typescript
interface AddEntityOperation extends BaseOperation {
  type: 'ADD_ENTITY';
  payload: Entity;               // Entity to add
}

interface RemoveEntityOperation extends BaseOperation {
  type: 'REMOVE_ENTITY';
  payload: {
    entityId: string;            // Entity to remove
    preserveRelationships?: boolean; // Keep relationships
  };
}

interface UpdateEntityOperation extends BaseOperation {
  type: 'UPDATE_ENTITY';
  payload: {
    entityId: string;            // Entity to update
    changes: Partial<Entity>;    // Changes to apply
    mergeArrays?: boolean;       // Merge array properties
  };
}
```

#### Relationship Operations

```typescript
interface AddRelationshipOperation extends BaseOperation {
  type: 'ADD_RELATIONSHIP';
  payload: Relationship;         // Relationship to add
}

interface RemoveRelationshipOperation extends BaseOperation {
  type: 'REMOVE_RELATIONSHIP';
  payload: {
    relationshipId: string;      // Relationship to remove
  };
}

interface UpdateRelationshipOperation extends BaseOperation {
  type: 'UPDATE_RELATIONSHIP';
  payload: {
    relationshipId: string;      // Relationship to update
    changes: Partial<Relationship>; // Changes to apply
  };
}
```

#### Timeline Operations

```typescript
interface TimelineBranchOperation extends BaseOperation {
  type: 'TIMELINE_BRANCH';
  payload: {
    branchName: string;          // New branch name
    fromCommit?: string;         // Source commit
  };
}

interface TimelineMergeOperation extends BaseOperation {
  type: 'TIMELINE_MERGE';
  payload: {
    sourceBranch: string;        // Branch to merge
    strategy: MergeStrategy;     // Merge strategy
  };
}
```

### NarrativeCommit

Represents a committed set of changes to the narrative.

```typescript
interface NarrativeCommit {
  id: string;                    // Unique commit ID
  author: string;                // Commit author
  timestamp: number;             // When committed
  message: string;               // Commit message
  parentCommit: string;          // Parent commit ID
  treeHash: string;              // Graph state hash
  operations: GraphOperation[]; // Applied operations
  canonicalEvent?: CanonicalEvent; // Associated canonical event
  metrics: CommitMetrics;        // Computed metrics
  branch?: string;               // Branch name
  tags?: string[];               // Tags
}

interface CommitMetrics {
  coherenceScore: number;        // Narrative coherence (0-1)
  timelineDivergence: number;    // Divergence from main (0-1)
  entitiesAffected: number;      // Number of entities changed
  relationshipsChanged: number;  // Number of relationships changed
}
```

### TimelineBranch

Represents an alternate timeline or story branch.

```typescript
interface TimelineBranch {
  id: string;                    // Unique branch ID
  name: string;                  // Branch name
  parentCommit: string;          // Branching point
  headCommit: string;            // Latest commit
  createdAt: number;             // Creation timestamp
  updatedAt: number;             // Last update
  probability: number;           // Timeline probability (0-1)
  isCanon: boolean;              // Is canonical timeline
  description?: string;          // Branch description
  metadata?: Record<string, any>; // Additional metadata
}
```

### CanonicalEvent

Represents important story milestones that can serve as branching points.

```typescript
interface CanonicalEvent {
  id: string;                    // Unique event ID
  name: string;                  // Event name
  description: string;           // Event description
  plotSignificance: PlotSignificance; // Story importance
  allowsBranching?: boolean;     // Can create branches here
  conditions?: GraphCondition[]; // Conditions for event
  metadata?: Record<string, any>; // Additional metadata
}

type PlotSignificance = 'minor' | 'moderate' | 'major' | 'critical';
```

### GraphCondition

Represents conditions that must be met for certain operations.

```typescript
type GraphCondition = 
  | EntityExistsCondition
  | PropertyEqualsCondition
  | RelationshipExistsCondition
  | LogicalCondition;

interface EntityExistsCondition {
  type: 'ENTITY_EXISTS';
  entityId: string;              // Entity that must exist
}

interface PropertyEqualsCondition {
  type: 'PROPERTY_EQUALS';
  entityId: string;              // Target entity
  property: string;              // Property name
  value: any;                    // Expected value
}

interface RelationshipExistsCondition {
  type: 'RELATIONSHIP_EXISTS';
  source: string;                // Source entity
  target: string;                // Target entity
  relationshipType?: string;     // Optional relationship type
}

interface LogicalCondition {
  type: 'AND' | 'OR' | 'NOT';
  conditions: GraphCondition[];  // Sub-conditions
}
```

## Merging and Conflict Resolution

### MergeConfig

Configuration for merge operations.

```typescript
interface MergeConfig {
  strategy?: MergeStrategy;      // Merge strategy
  message?: string;              // Merge commit message
  conflictResolution?: ConflictResolution; // How to handle conflicts
  paradoxResolution?: ParadoxResolution; // How to handle paradoxes
  autoResolve?: boolean;         // Automatically resolve simple conflicts
}

type MergeStrategy = 'fast-forward' | 'three-way' | 'recursive' | 'ours' | 'theirs';
type ConflictResolution = 'manual' | 'ours' | 'theirs' | 'merge';
type ParadoxResolution = 'quantum-superposition' | 'timeline-echo' | 'paradox-cascade' | 'schrodinger';
```

### MergeResult

Result of a merge operation.

```typescript
interface MergeResult {
  success: boolean;              // Whether merge succeeded
  commitId?: string;             // Merge commit ID (if successful)
  conflicts?: MergeConflict[];   // Conflicts (if any)
  operations?: GraphOperation[]; // Applied operations
  metrics?: MergeMetrics;        // Merge statistics
}

interface MergeMetrics {
  entitiesMerged: number;        // Entities merged
  relationshipsMerged: number;   // Relationships merged
  conflictsResolved: number;     // Conflicts resolved
  timelineDivergence: number;    // Timeline divergence
}
```

### MergeConflict

Represents conflicts that occur during merges.

```typescript
interface MergeConflict {
  type: ConflictType;            // Type of conflict
  entityId?: string;             // Affected entity (if applicable)
  relationshipId?: string;       // Affected relationship (if applicable)
  sourceValue: any;              // Value from source branch
  targetValue: any;              // Value from target branch
  suggestions: ConflictSuggestion[]; // Suggested resolutions
}

type ConflictType = 'ENTITY_CONFLICT' | 'TIMELINE_PARADOX' | 'PROPERTY_CONFLICT' | 'RELATIONSHIP_CONFLICT';

interface ConflictSuggestion {
  action: string;                // Suggested action
  description: string;           // Action description
  confidence: number;            // Confidence in suggestion (0-1)
  result?: any;                  // Predicted result
}
```

## Diff and History Types

### GraphDiff

Represents differences between two graph states.

```typescript
interface GraphDiff {
  from: string;                  // Source commit ID
  to: string;                    // Target commit ID
  addedEntities: Entity[];       // Entities added
  removedEntities: string[];     // Entity IDs removed
  modifiedEntities: EntityModification[]; // Entities modified
  addedRelationships: Relationship[]; // Relationships added
  removedRelationships: string[]; // Relationship IDs removed
  modifiedRelationships: RelationshipModification[]; // Relationships modified
  stats: DiffStats;              // Summary statistics
}

interface EntityModification {
  entityId: string;              // Modified entity ID
  changes: Partial<Entity>;      // What changed
}

interface RelationshipModification {
  relationshipId: string;        // Modified relationship ID
  changes: Partial<Relationship>; // What changed
}

interface DiffStats {
  totalChanges: number;          // Total number of changes
  entitiesAffected: number;      // Entities affected
  relationshipsAffected: number; // Relationships affected
  timelineDivergence: number;    // Timeline divergence measure
}
```

### LogEntry

Represents an entry in the commit log.

```typescript
interface LogEntry {
  commit: NarrativeCommit;       // The commit
  branch: string;                // Branch name
  tags?: string[];               // Associated tags
  isHead: boolean;               // Is current HEAD
  isMerge: boolean;              // Is merge commit
}
```

### BlameResult

Shows the history of changes to a specific entity.

```typescript
interface BlameResult {
  entityId: string;              // Target entity ID
  history: BlameEntry[];         // Change history
}

interface BlameEntry {
  commit: NarrativeCommit;       // Commit that made change
  operation: GraphOperation;     // Operation that affected entity
  change: string;                // Description of change
}
```

## Hook System Types

### RealityHook

Represents automated systems that respond to narrative changes.

```typescript
interface RealityHook {
  id: string;                    // Unique hook ID
  name: string;                  // Hook name
  description: string;           // Hook description
  triggers: HookTrigger[];       // When to execute
  priority: number;              // Execution priority (0-100)
  canMutate?: boolean;           // Can modify the graph
  execute: (context: HookContext) => Promise<HookResult>; // Hook function
  metadata?: Record<string, any>; // Additional metadata
}

interface HookTrigger {
  type: TriggerType;             // Trigger type
  entityType?: EntityType;       // Entity type filter
  relationshipType?: string;     // Relationship type filter
  conditions?: GraphCondition[]; // Additional conditions
}

type TriggerType = 
  | 'ENTITY_ADDED' 
  | 'ENTITY_REMOVED' 
  | 'ENTITY_UPDATED'
  | 'RELATIONSHIP_ADDED' 
  | 'RELATIONSHIP_REMOVED' 
  | 'RELATIONSHIP_UPDATED'
  | 'COMMIT_CREATED'
  | 'BRANCH_CREATED'
  | 'MERGE_COMPLETED';
```

### HookContext

Context provided to hook execution functions.

```typescript
interface HookContext {
  operation: GraphOperation;     // Triggering operation
  commit: NarrativeCommit;       // Current commit
  previousGraph: NarrativeCanonGraph; // Previous state
  currentGraph: NarrativeCanonGraph;  // Current state
  canonicalEvent?: CanonicalEvent;     // Associated canonical event
  services: HookServices;        // Available services
  metadata?: Record<string, any>; // Additional metadata
}
```

### HookResult

Result returned by hook execution.

```typescript
interface HookResult {
  processed: boolean;            // Whether hook processed successfully
  artifacts?: GeneratedAsset[];  // Generated assets
  mutations?: GraphOperation[];  // Additional operations to apply
  errors?: string[];             // Errors encountered
  metadata?: Record<string, any>; // Additional metadata
}
```

### HookServices

Services available to hooks for asset generation and processing.

```typescript
interface HookServices {
  imageGenerator?: ImageGenerationService;    // Image generation
  videoGenerator?: VideoGenerationService;    // Video generation
  audioGenerator?: AudioGenerationService;    // Audio generation
  loreEnricher?: LoreEnrichmentService;       // Lore expansion
  layoutGenerator?: LayoutGenerationService;  // Layout generation
  modelGenerator?: ModelGenerationService;    // 3D model generation
  custom?: Record<string, any>;               // Custom services
}
```

## Query Types

### CommitQuery

Query parameters for searching commits.

```typescript
interface CommitQuery {
  branch?: string | string[];    // Branch name(s)
  author?: string | string[];    // Author name(s)
  since?: Date | number;         // Start date/timestamp
  until?: Date | number;         // End date/timestamp
  message?: string;              // Message pattern
  offset?: number;               // Pagination offset
  limit?: number;                // Maximum results
}
```

### EntityQuery

Query parameters for searching entities.

```typescript
interface EntityQuery {
  type?: EntityType | EntityType[]; // Entity type(s)
  name?: string;                 // Name pattern
  properties?: Record<string, any>; // Property filters
  hasRelationship?: {            // Relationship filters
    type?: string;
    target?: string;
  };
  limit?: number;                // Maximum results
  offset?: number;               // Pagination offset
}
```

## Status and Information Types

### StatusResult

Current repository status.

```typescript
interface StatusResult {
  branch: string;                // Current branch
  staged: GraphOperation[];      // Staged operations
  unstaged: GraphOperation[];    // Unstaged operations
  untracked: {                   // Untracked entities
    entities: Entity[];
    relationships: Relationship[];
  };
  ahead: number;                 // Commits ahead of remote
  behind: number;                // Commits behind remote
}
```

### BranchInfo

Information about a branch.

```typescript
interface BranchInfo {
  name: string;                  // Branch name
  current: boolean;              // Is current branch
  branch: TimelineBranch;        // Branch details
}
```

## Validation Types

### ValidationError

Error type for validation failures.

```typescript
interface ValidationError extends Error {
  issues: ValidationIssue[];     // Specific validation issues
}

interface ValidationIssue {
  path: string[];                // Path to invalid data
  code: string;                  // Error code
  message: string;               // Error message
  expected?: any;                // Expected value/type
  received?: any;                // Actual value/type
}
```

## Utility Types

### ExtractionOptions

Options for narrative extraction.

```typescript
interface ExtractionOptions {
  entityTypes?: EntityType[];    // Types to extract
  includeScenes?: boolean;       // Extract scenes
  includeStateChanges?: boolean; // Extract state changes
  deduplication?: {              // Deduplication settings
    enabled?: boolean;
    threshold?: number;
    strategy?: 'merge' | 'discard' | 'keep_both';
  };
  chunking?: {                   // Text chunking settings
    enabled?: boolean;
    chunkSize?: number;
    overlap?: number;
  };
}
```

### ExtractionStats

Statistics about extracted narrative.

```typescript
interface ExtractionStats {
  characters: number;            // Number of characters
  locations: number;             // Number of locations
  objects: number;               // Number of objects
  events: number;                // Number of events
  relationships: number;         // Number of relationships
  scenes: number;                // Number of scenes
  stateChanges: number;          // Number of state changes
  totalWords: number;            // Total word count
  extractionRate: number;        // Entities per 100 words
}
```

## Type Guards and Utilities

### Type Guards

```typescript
// Entity type guards
function isCharacter(entity: Entity): entity is Entity & { type: 'character' } {
  return entity.type === 'character';
}

function isLocation(entity: Entity): entity is Entity & { type: 'location' } {
  return entity.type === 'location';
}

// Operation type guards
function isEntityOperation(op: GraphOperation): op is AddEntityOperation | RemoveEntityOperation | UpdateEntityOperation {
  return ['ADD_ENTITY', 'REMOVE_ENTITY', 'UPDATE_ENTITY'].includes(op.type);
}

function isRelationshipOperation(op: GraphOperation): op is AddRelationshipOperation | RemoveRelationshipOperation | UpdateRelationshipOperation {
  return ['ADD_RELATIONSHIP', 'REMOVE_RELATIONSHIP', 'UPDATE_RELATIONSHIP'].includes(op.type);
}
```

### Utility Functions

```typescript
// Create unique IDs
function createEntityId(type: EntityType, name: string): string;
function createRelationshipId(source: string, target: string, type: string): string;
function createCommitId(): string;

// Validation helpers
function validateEntity(entity: Entity): ValidationIssue[];
function validateRelationship(relationship: Relationship, entities: Entity[]): ValidationIssue[];
function validateOperation(operation: GraphOperation): ValidationIssue[];
```

This comprehensive type reference covers all the major interfaces and types used throughout the Narrative Canon library, providing developers with a complete understanding of the data structures and their relationships.