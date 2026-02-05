# NarrativeGit API Reference

The `NarrativeGit` class provides Git-like version control for narrative structures, enabling timeline branching, merging, and history tracking.

## Constructor

```typescript
new NarrativeGit(config?: GitConfig)
```

### Configuration

```typescript
interface GitConfig {
  author?: string;
  hookServices?: HookServices;
  autoExecuteHooks?: boolean;
  defaultBranch?: string;
}
```

- **author**: Default author for commits (default: 'anonymous')
- **hookServices**: Services for reality hooks (image generation, lore expansion, etc.)
- **autoExecuteHooks**: Whether to execute hooks automatically on commits (default: true)
- **defaultBranch**: Name of the default branch (default: 'main')

## Static Methods

### fromNarrativeStructure(structure: NarrativeStructure, config?: GitConfig): Promise\<NarrativeGit\>

Create a NarrativeGit instance from an existing narrative structure.

```typescript
const narrative = await canon.extract(storyText);
const git = await NarrativeGit.fromNarrativeStructure(narrative, {
  author: 'storyteller'
});
```

## Core Git Operations

### add(...operations: GraphOperation[]): void

Stage operations for the next commit.

```typescript
git.add({
  type: 'ADD_ENTITY',
  timestamp: Date.now(),
  payload: {
    id: 'char_sarah',
    type: 'character',
    name: 'Sarah Chen',
    description: 'Brilliant hacker seeking justice'
  }
});
```

### commit(message: string, options?: CommitOptions): Promise\<NarrativeCommit\>

Create a commit with staged operations.

```typescript
const commit = await git.commit('Add protagonist Sarah Chen', {
  canonicalEvent: {
    id: 'character_introduction',
    name: 'Sarah\'s Introduction',
    description: 'The protagonist is introduced',
    plotSignificance: 'major'
  },
  tags: ['character-intro', 'v1.0']
});
```

### reset(): void

Clear all staged operations.

### status(): StatusResult

Get the current repository status.

```typescript
const status = git.status();
console.log(`Current branch: ${status.branch}`);
console.log(`Staged operations: ${status.staged.length}`);
console.log(`Ahead by: ${status.ahead} commits`);
```

## Branching Operations

### branch(name: string, options?: BranchOptions): TimelineBranch

Create a new branch.

```typescript
// Create branch from current HEAD
const feature = git.branch('alternate-ending');

// Create and immediately checkout
git.branch('sarah-captured', { checkout: true });

// Create from specific commit
git.branch('prequel', { from: 'commit_abc123' });
```

### branches(): Array\<BranchInfo\>

List all branches.

```typescript
const branches = git.branches();
branches.forEach(branch => {
  console.log(`${branch.name} ${branch.current ? '(current)' : ''}`);
});
```

### checkout(branchName: string): Promise\<void\>

Switch to a different branch.

```typescript
await git.checkout('alternate-ending');
```

### merge(sourceBranch: string, options?: MergeConfig): Promise\<MergeResult\>

Merge another branch into the current branch.

```typescript
const result = await git.merge('feature-branch', {
  strategy: 'three-way',
  message: 'Merge new character developments',
  conflictResolution: 'manual'
});

if (result.success) {
  console.log(`Merge completed: ${result.commitId}`);
} else {
  console.log(`Conflicts detected: ${result.conflicts.length}`);
}
```

## History and Querying

### log(options?: LogOptions): LogEntry[]

Show commit history.

```typescript
// Get all commits on current branch
const log = git.log();

// Get last 5 commits
const recent = git.log({ limit: 5 });

// Get commits on specific branch
const featureLog = git.log({ branch: 'feature-branch' });

// One-line format
const oneline = git.log({ oneline: true });
```

### diff(from?: string, to?: string): GraphDiff

Show differences between commits.

```typescript
// Compare current HEAD with working directory
const workingDiff = git.diff();

// Compare two commits
const diff = git.diff('commit_abc', 'commit_def');

console.log(`Added entities: ${diff.addedEntities.length}`);
console.log(`Modified entities: ${diff.modifiedEntities.length}`);
console.log(`Total changes: ${diff.stats.totalChanges}`);
```

### blame(entityId: string): BlameResult

Show what commits last modified an entity.

```typescript
const blame = git.blame('char_sarah');
console.log(`Entity: ${blame.entityId}`);
blame.history.forEach(entry => {
  console.log(`${entry.commit.id}: ${entry.change} - ${entry.commit.message}`);
});
```

## Canonical States and Events

### registerCanonicalState(state: CanonicalEvent): void

Register an important narrative state.

```typescript
git.registerCanonicalState({
  id: 'sarah_awakening',
  name: 'Sarah\'s Awakening',
  description: 'Sarah discovers the truth about the simulation',
  plotSignificance: 'critical',
  allowsBranching: true
});
```

### getCanonicalStates(): CanonicalEvent[]

Get all registered canonical states.

## Reality Hooks

### registerHook(hook: RealityHook): void

Register a reality hook for automatic asset generation.

```typescript
git.registerHook({
  id: 'character-portrait-generator',
  name: 'Character Portrait Generator',
  description: 'Generates character portraits when characters are added',
  triggers: [{ type: 'ENTITY_ADDED', entityType: 'character' }],
  priority: 50,
  execute: async (context) => {
    const character = context.operation.payload;
    const portrait = await context.services.imageGenerator.generateCharacterPortrait(character);
    return {
      processed: true,
      artifacts: [portrait]
    };
  }
});
```

## Tagging

### tag(commitId: string, tag: string): void

Add a tag to a commit.

```typescript
const commit = await git.commit('Major story milestone');
git.tag(commit.id, 'v1.0.0');
git.tag(commit.id, 'act-one-complete');
```

## Import/Export

### export(): NarrativeStructure

Export current state as a NarrativeStructure.

```typescript
const narrative = git.export();
await saveToFile(narrative, 'story-v1.json');
```

### getGraph(): NarrativeCanonGraph

Get direct access to the underlying graph for advanced operations.

### getHookRegistry(): HookRegistry

Get access to the hook registry for advanced hook management.

## Graph Operations

Graph operations are the atomic changes that can be applied to a narrative:

### Entity Operations

```typescript
// Add a new entity
{
  type: 'ADD_ENTITY',
  timestamp: Date.now(),
  payload: {
    id: 'char_sarah',
    type: 'character',
    name: 'Sarah Chen',
    description: 'Protagonist',
    properties: {
      status: 'alive',
      location: 'neo-tokyo'
    }
  }
}

// Update an existing entity
{
  type: 'UPDATE_ENTITY',
  timestamp: Date.now(),
  payload: {
    entityId: 'char_sarah',
    changes: {
      properties: {
        status: 'awakened',
        level: 'transcendent'
      }
    },
    mergeArrays: true // Merge array properties instead of replacing
  }
}

// Remove an entity
{
  type: 'REMOVE_ENTITY',
  timestamp: Date.now(),
  payload: {
    entityId: 'char_sarah',
    preserveRelationships: false // Also remove relationships
  }
}
```

### Relationship Operations

```typescript
// Add a relationship
{
  type: 'ADD_RELATIONSHIP',
  timestamp: Date.now(),
  payload: {
    id: 'sarah-marcus-mentorship',
    source: 'char_marcus',
    target: 'char_sarah',
    type: 'mentorship',
    description: 'Marcus teaches Sarah about the resistance'
  }
}

// Update a relationship
{
  type: 'UPDATE_RELATIONSHIP',
  timestamp: Date.now(),
  payload: {
    relationshipId: 'sarah-marcus-mentorship',
    changes: {
      strength: 0.9,
      status: 'strong'
    }
  }
}

// Remove a relationship
{
  type: 'REMOVE_RELATIONSHIP',
  timestamp: Date.now(),
  payload: {
    relationshipId: 'sarah-marcus-mentorship'
  }
}
```

## Types

### NarrativeCommit

```typescript
interface NarrativeCommit {
  id: string;
  author: string;
  timestamp: number;
  message: string;
  parentCommit: string;
  treeHash: string;
  operations: GraphOperation[];
  canonicalEvent?: CanonicalEvent;
  metrics: CommitMetrics;
  branch?: string;
  tags?: string[];
}
```

### TimelineBranch

```typescript
interface TimelineBranch {
  id: string;
  name: string;
  parentCommit: string;
  headCommit: string;
  createdAt: number;
  updatedAt: number;
  probability: number; // Timeline probability (0-1)
  isCanon: boolean;
}
```

### MergeResult

```typescript
interface MergeResult {
  success: boolean;
  commitId?: string;
  conflicts?: MergeConflict[];
  operations?: GraphOperation[];
  metrics?: {
    entitiesMerged: number;
    relationshipsMerged: number;
    conflictsResolved: number;
    timelineDivergence: number;
  };
}
```

### MergeConflict

```typescript
interface MergeConflict {
  type: 'ENTITY_CONFLICT' | 'TIMELINE_PARADOX' | 'PROPERTY_CONFLICT';
  entityId?: string;
  sourceValue: any;
  targetValue: any;
  suggestions: Array<{
    action: string;
    description: string;
    confidence: number;
  }>;
}
```

## Advanced Usage Patterns

### Timeline Branching for What-If Scenarios

```typescript
// Main timeline: Sarah succeeds
await git.commit('Sarah infiltrates Oneirocom');

// Branch for alternate outcome
await git.branch('sarah-captured', { checkout: true });
git.add({
  type: 'UPDATE_ENTITY',
  payload: {
    entityId: 'char_sarah',
    changes: { properties: { status: 'captured' } }
  }
});
await git.commit('Sarah is captured during infiltration');

// Branch for different approach
await git.checkout('main');
await git.branch('stealth-approach', { checkout: true });
git.add({
  type: 'UPDATE_ENTITY',
  payload: {
    entityId: 'char_sarah',
    changes: { properties: { approach: 'stealth' } }
  }
});
await git.commit('Sarah uses stealth approach');
```

### Paradox Resolution

```typescript
// Attempt to merge conflicting timelines
const result = await git.merge('sarah-captured', {
  strategy: 'three-way',
  paradoxResolution: 'quantum-superposition'
});

if (!result.success) {
  // Handle paradoxes manually
  for (const conflict of result.conflicts) {
    if (conflict.type === 'TIMELINE_PARADOX') {
      // Sarah can't be both captured and free
      // Choose canonical state or create branching reality
      await resolveParadox(conflict);
    }
  }
}
```

### Reality Hook Automation

```typescript
// Auto-generate assets when narrative changes
git.registerHook({
  id: 'scene-storyboard',
  triggers: [{ type: 'SCENE_ADDED' }],
  execute: async (context) => {
    const scene = context.operation.payload;
    const participants = scene.characters.map(id => 
      context.currentGraph.getEntity(id)
    );
    
    const storyboard = await context.services.imageGenerator
      .generateSceneStoryboard(scene, participants);
    
    return {
      processed: true,
      artifacts: [storyboard],
      mutations: [{
        type: 'UPDATE_ENTITY',
        payload: {
          entityId: scene.id,
          changes: { storyboardUrl: storyboard.url }
        }
      }]
    };
  }
});
```

### Collaborative Storytelling

```typescript
// Multiple authors working on same story
const git1 = new NarrativeGit({ author: 'author1' });
const git2 = new NarrativeGit({ author: 'author2' });

// Author 1 develops main character
await git1.checkout('character-development');
// ... make changes ...
await git1.commit('Develop Sarah\'s backstory');

// Author 2 works on world-building
await git2.checkout('world-building');
// ... make changes ...
await git2.commit('Expand Oneirocom corporation lore');

// Merge contributions
await git1.merge('world-building');
```

## Performance Considerations

- **Commit Frequency**: Frequent small commits are better than large ones
- **Branch Management**: Clean up unused branches to maintain performance
- **Hook Optimization**: Heavy hooks should be async and non-blocking
- **Memory Usage**: Large timelines with many branches consume more memory
- **Diff Calculation**: Computing diffs on large graphs can be expensive

## Error Handling

```typescript
try {
  await git.commit('Major story change');
} catch (error) {
  if (error instanceof MergeConflictError) {
    // Handle merge conflicts
    console.log('Conflicts detected:', error.conflicts);
  } else if (error instanceof ValidationError) {
    // Handle validation errors
    console.log('Invalid operation:', error.message);
  }
}
```

## Best Practices

1. **Meaningful Commit Messages**: Use descriptive messages that explain the narrative change
2. **Atomic Commits**: Each commit should represent a single logical change
3. **Branch Naming**: Use clear, descriptive branch names (e.g., 'alternate-ending', 'character-death')
4. **Canonical States**: Mark important story points as canonical for easier navigation
5. **Hook Management**: Keep hooks lightweight and focused on specific triggers
6. **Timeline Cleanup**: Regularly merge or delete experimental branches
7. **Conflict Resolution**: Develop strategies for handling timeline paradoxes
8. **Documentation**: Use commit messages and tags to document story development