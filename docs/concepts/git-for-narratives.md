# Git for Narratives

## Overview

Git for Narratives brings version control concepts to storytelling, enabling writers and developers to manage narrative evolution with the same power and flexibility that Git provides for code.

## Core Concepts

### Timeline as Branches

In traditional Git, branches represent different versions of code. In Narrative Canon, branches represent different timelines or narrative paths:

```javascript
// Main timeline
await git.commit('Sarah discovers the conspiracy');

// Create alternate timeline
await git.branch('timeline-dark');
await git.checkout('timeline-dark');

// In this timeline, different events unfold
git.add({
  type: 'UPDATE_ENTITY',
  payload: {
    entityId: 'sarah',
    changes: { status: 'captured' }
  }
});
await git.commit('Sarah is captured by Oneirocom');
```

### Narrative Operations as Commits

Every change to the narrative is tracked as an operation:

- **ADD_ENTITY**: Introduce new characters, locations, or objects
- **UPDATE_ENTITY**: Change properties (status, location, abilities)
- **REMOVE_ENTITY**: Remove from the narrative
- **ADD_RELATIONSHIP**: Form connections between entities
- **REMOVE_RELATIONSHIP**: Break connections

### The Narrative Graph

The system maintains a graph structure that represents:
- **Nodes**: Entities (characters, locations, objects)
- **Edges**: Relationships between entities
- **Properties**: Mutable attributes that change over time

## Key Features

### 1. Timeline Branching

Create "what if" scenarios without affecting the main narrative:

```javascript
// What if the hero takes the left path?
await git.branch('left-path');
await git.checkout('left-path');

// What if they take the right path?
await git.checkout('main');
await git.branch('right-path');
await git.checkout('right-path');
```

### 2. Narrative Merging

Merge divergent timelines back together:

```javascript
// Merge the consequences of both paths
await git.checkout('main');
const result = await git.merge('left-path', {
  strategy: 'three-way',
  conflictResolution: {
    entities: 'keep-both',
    relationships: 'prefer-source'
  }
});
```

### 3. Conflict Resolution

When timelines conflict (e.g., character dead in one, alive in another), the system provides multiple resolution strategies:

- **Quantum Superposition**: Both states exist simultaneously
- **Timeline Echo**: Dead but influence persists
- **Paradox Cascade**: Conflict becomes plot device
- **Selective Merge**: Choose specific events from each timeline

### 4. Commit History

Track how your narrative evolved:

```javascript
const history = git.log();
history.forEach(entry => {
  console.log(`${entry.commit.timestamp}: ${entry.commit.message}`);
  console.log(`  Changed: ${entry.commit.operations.length} operations`);
});
```

### 5. Narrative Diff

Compare different versions of your story:

```javascript
const diff = git.diff('chapter-1', 'chapter-5');
console.log(`Added ${diff.addedEntities.length} characters`);
console.log(`${diff.stats.totalChanges} total changes`);
```

## Practical Applications

### Interactive Fiction

Each player choice creates a new branch:

```javascript
async function playerChoice(choice) {
  const branchName = `choice-${choice.id}`;
  await git.branch(branchName);
  await git.checkout(branchName);
  
  // Apply consequences of choice
  for (const consequence of choice.consequences) {
    git.add(consequence);
  }
  
  await git.commit(`Player chose: ${choice.description}`);
}
```

### Collaborative Writing

Multiple authors work on different branches:

```javascript
// Author A works on romance subplot
await git.branch('romance-subplot');

// Author B works on action sequences
await git.branch('action-sequences');

// Later, merge both contributions
await git.checkout('main');
await git.merge('romance-subplot');
await git.merge('action-sequences');
```

### Save Game Systems

Each save is a branch:

```javascript
// Create save point
await git.branch(`save-${Date.now()}`);

// Load save
await git.checkout('save-1234567890');

// Continue from save
await git.branch('continue-from-save');
```

## Advanced Features

### Reality Hooks

Trigger automatic actions on narrative changes:

```javascript
git.registerHook({
  name: 'death-echo',
  triggers: ['entity.status.dead'],
  async execute(context) {
    // Create ghost/echo entity
    return [{
      type: 'ADD_ENTITY',
      payload: {
        id: `${context.entity.id}_echo`,
        type: 'phenomenon',
        name: `Echo of ${context.entity.name}`
      }
    }];
  }
});
```

### Timeline Metadata

Track probability and canonicity:

```javascript
const timeline = git.branch('experimental', {
  metadata: {
    probability: 0.3,  // Low probability timeline
    isCanon: false,    // Non-canonical branch
    tags: ['what-if', 'experimental']
  }
});
```

## Best Practices

1. **Commit Frequently**: Small, atomic changes are easier to merge
2. **Use Descriptive Messages**: Help future you understand the narrative flow
3. **Branch for Experiments**: Keep main timeline clean
4. **Tag Important Moments**: Mark significant plot points
5. **Test Merges**: Preview merge results before committing

## Comparison with Traditional Git

| Git Concept | Narrative Canon Equivalent |
|------------|---------------------------|
| File | Entity (character, location) |
| Line Change | Property Update |
| Merge Conflict | Timeline Paradox |
| Branch | Alternative Timeline |
| Commit | Narrative Moment |
| Repository | Story Universe |

## Next Steps

- Learn about [Timeline Branching](./timeline-branching.md)
- Explore [Paradox Resolution](./paradox-resolution.md)
- Try the [Timeline Branches Tutorial](../tutorials/timeline-branches.md)