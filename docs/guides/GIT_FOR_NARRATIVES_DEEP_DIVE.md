# 🌿 Git for Narratives: Deep Dive

> A comprehensive guide to using Git-like version control for narrative structures

## Table of Contents

1. [Introduction](#introduction)
2. [Core Concepts](#core-concepts)
3. [Basic Operations](#basic-operations)
4. [Advanced Branching](#advanced-branching)
5. [Paradox Resolution](#paradox-resolution)
6. [Reality Hooks](#reality-hooks)
7. [Collaborative Storytelling](#collaborative-storytelling)
8. [Real-World Examples](#real-world-examples)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

## Introduction

Git for Narratives brings the power of distributed version control to storytelling. Just as Git revolutionized code collaboration, this system enables:

- **Timeline Branching**: Explore alternate story paths
- **Narrative Merging**: Combine divergent storylines
- **Conflict Resolution**: Handle paradoxes intelligently
- **Collaborative Authoring**: Multiple writers, one universe
- **History Tracking**: See how your story evolved

## Core Concepts

### The Narrative Repository

```typescript
import { NarrativeGit } from '@narrative/canon';

// Initialize a new narrative repository
const git = new NarrativeGit({
  author: 'J.K. Rowling',
  defaultBranch: 'canon',
  autoExecuteHooks: true
});
```

### Graph Operations

Every change to your narrative is represented as a Graph Operation:

```typescript
// Adding a character
const addCharacter: GraphOperation = {
  type: 'ADD_ENTITY',
  payload: {
    id: 'harry_potter',
    type: 'character',
    name: 'Harry Potter',
    properties: {
      house: 'Gryffindor',
      status: 'alive',
      role: 'protagonist'
    }
  }
};

// Updating relationships
const addRelationship: GraphOperation = {
  type: 'ADD_RELATIONSHIP',
  payload: {
    id: 'harry_ron_friendship',
    source: 'harry_potter',
    target: 'ron_weasley',
    type: 'friendship',
    properties: {
      strength: 0.9,
      established: 'year-1'
    }
  }
};
```

### Commits and History

```typescript
// Stage changes
git.add(addCharacter);
git.add(addRelationship);

// Commit with meaningful message
const commit = await git.commit('Introduce Harry and establish core friendships');

// View history
const history = git.log();
console.log(history[0].message); // "Introduce Harry and establish core friendships"
```

## Basic Operations

### Creating and Switching Branches

```typescript
// Create alternate timeline where Voldemort wins
await git.branch('timeline-dark-victory');
await git.checkout('timeline-dark-victory');

// Make changes in this timeline
git.add({
  type: 'UPDATE_ENTITY',
  payload: {
    entityId: 'harry_potter',
    changes: {
      properties: {
        status: 'dead',
        deathScene: 'battle-of-hogwarts'
      }
    }
  }
});

await git.commit('Harry falls at the Battle of Hogwarts');
```

### Viewing Differences

```typescript
// Compare timelines
const diff = await git.diff('canon', 'timeline-dark-victory');

console.log(diff.operations);
// Shows: Harry alive in canon, dead in dark-victory

console.log(diff.conflicts);
// Shows: Character status conflict
```

### Merging Timelines

```typescript
// Switch back to main timeline
await git.checkout('canon');

// Attempt merge
const mergeResult = await git.merge('timeline-dark-victory');

if (mergeResult.conflicts.length > 0) {
  console.log('Merge conflicts detected:', mergeResult.conflicts);
  // Handle conflicts...
}
```

## Advanced Branching

### Multi-Level Branching

```typescript
// Create a complex branching structure
await git.branch('book-7-alternate');
await git.checkout('book-7-alternate');

// Branch from the alternate
await git.branch('book-7-alternate-horcrux-survived');
await git.checkout('book-7-alternate-horcrux-survived');

// Create another branch from the alternate
await git.checkout('book-7-alternate');
await git.branch('book-7-alternate-snape-lives');
```

### Timeline Tags

```typescript
// Tag important moments
await git.tag('v1.0-philosophers-stone-complete');
await git.tag('v7.0-deathly-hallows-complete');

// Create branch from tag
await git.branch('epilogue-alternate', { from: 'v7.0-deathly-hallows-complete' });
```

### Cherry-Picking Changes

```typescript
// Apply specific changes from one timeline to another
const cherryPick = await git.cherryPick('commit-id-from-alternate-timeline');

if (cherryPick.success) {
  console.log('Successfully applied changes');
} else {
  console.log('Conflicts during cherry-pick:', cherryPick.conflicts);
}
```

## Paradox Resolution

### Understanding Paradoxes

Paradoxes occur when merging timelines creates logical inconsistencies:

```typescript
// Timeline A: Character is alive and has children
// Timeline B: Character died young
// Paradox: How can someone have children if they died young?
```

### Resolution Strategies

#### 1. Quantum Superposition

```typescript
const mergeResult = await git.merge('timeline-b', {
  paradoxResolution: {
    strategy: 'quantum-superposition',
    config: {
      observerDependent: true,
      probabilityWeights: {
        'timeline-a': 0.7,
        'timeline-b': 0.3
      }
    }
  }
});

// Result: Character exists in superposition
// - 70% of observers see them alive
// - 30% of observers see them dead
```

#### 2. Timeline Echo

```typescript
const mergeResult = await git.merge('timeline-b', {
  paradoxResolution: {
    strategy: 'timeline-echo',
    config: {
      echoDelay: 10, // years
      fadeRate: 0.1  // per year
    }
  }
});

// Result: Character died but their "echo" persists
// - Can still influence events
// - Gradually fades from the narrative
```

#### 3. Branching Reality

```typescript
const mergeResult = await git.merge('timeline-b', {
  paradoxResolution: {
    strategy: 'branching-reality',
    config: {
      splitPoint: 'moment-of-death',
      maintainBoth: true
    }
  }
});

// Result: Reality splits at the paradox point
// - Creates two parallel sub-timelines
// - Characters can be aware of the split
```

### Custom Paradox Handlers

```typescript
git.registerParadoxHandler({
  name: 'resurrection-protocol',
  canHandle: (paradox) => {
    return paradox.type === 'EXISTENCE_PARADOX' && 
           paradox.involves('death');
  },
  resolve: async (paradox, context) => {
    // Custom resurrection logic
    return {
      operations: [
        {
          type: 'ADD_ENTITY',
          payload: {
            id: `${paradox.entityId}_resurrected`,
            type: 'character',
            name: `${paradox.entityName} (Resurrected)`,
            properties: {
              originalId: paradox.entityId,
              resurrectionMethod: 'phoenix-tears'
            }
          }
        }
      ],
      explanation: 'Character resurrected through phoenix tears'
    };
  }
});
```

## Reality Hooks

### Understanding Hooks

Reality Hooks are automated actions triggered by narrative changes:

```typescript
import { RealityHook } from '@narrative/canon';

const characterThemeHook: RealityHook = {
  name: 'character-theme-generator',
  triggers: ['ADD_ENTITY', 'UPDATE_ENTITY'],
  
  shouldExecute: (context) => {
    return context.operation.payload.type === 'character' &&
           context.operation.type === 'ADD_ENTITY';
  },
  
  execute: async (context) => {
    const character = context.operation.payload;
    
    // Generate theme music
    const theme = await generateThemeMusic({
      name: character.name,
      traits: character.properties.traits,
      role: character.properties.role
    });
    
    return {
      assets: [{
        type: 'audio',
        path: `assets/themes/${character.id}.mp3`,
        data: theme
      }],
      sideEffects: [{
        type: 'UPDATE_ENTITY',
        payload: {
          entityId: character.id,
          changes: {
            properties: {
              themeMusic: `assets/themes/${character.id}.mp3`
            }
          }
        }
      }]
    };
  }
};
```

### Registering Hooks

```typescript
// Register hooks before committing
git.registerHook(characterThemeHook);
git.registerHook(locationMapHook);
git.registerHook(relationshipDiagramHook);

// Hooks execute automatically on commit
await git.commit('Add new character');
// → Generates: character portrait, theme music, relationship diagram
```

### Hook Chains

```typescript
// Hooks can trigger other hooks
const plotTwistHook: RealityHook = {
  name: 'plot-twist-analyzer',
  triggers: ['UPDATE_ENTITY'],
  
  shouldExecute: (context) => {
    // Detect major status changes
    const oldStatus = context.previousState?.properties?.status;
    const newStatus = context.operation.payload.changes?.properties?.status;
    return oldStatus === 'alive' && newStatus === 'dead';
  },
  
  execute: async (context) => {
    // Analyze narrative impact
    const impact = await analyzeNarrativeImpact(context);
    
    if (impact.severity > 0.8) {
      // Trigger cascade of updates
      return {
        sideEffects: impact.requiredUpdates,
        metadata: {
          plotTwistSeverity: impact.severity,
          affectedCharacters: impact.characters
        }
      };
    }
  }
};
```

## Collaborative Storytelling

### Setting Up Collaboration

```typescript
// Initialize shared repository
const sharedGit = new NarrativeGit({
  author: 'writing-team',
  remote: 'https://narrative-server.com/harry-potter-expanded',
  collaborationMode: true
});

// Clone for individual author
const authorGit = await NarrativeGit.clone(
  'https://narrative-server.com/harry-potter-expanded',
  {
    author: 'author-sarah',
    localPath: './my-harry-potter-work'
  }
);
```

### Author Workflows

```typescript
// Author creates feature branch
await authorGit.branch('feature/hermione-minister-storyline');
await authorGit.checkout('feature/hermione-minister-storyline');

// Make changes
authorGit.add({
  type: 'UPDATE_ENTITY',
  payload: {
    entityId: 'hermione_granger',
    changes: {
      properties: {
        role: 'minister-of-magic',
        achievements: ['youngest-minister', 'magical-creatures-rights']
      }
    }
  }
});

await authorGit.commit('Hermione becomes Minister of Magic');

// Push to shared repository
await authorGit.push('feature/hermione-minister-storyline');
```

### Review Process

```typescript
// Create pull request
const pr = await authorGit.createPullRequest({
  from: 'feature/hermione-minister-storyline',
  to: 'canon',
  title: 'Hermione Minister of Magic Arc',
  description: 'Develops Hermione political career post-Hogwarts'
});

// Other authors review
const review = await sharedGit.reviewPullRequest(pr.id, {
  reviewer: 'author-john',
  comments: [
    {
      line: 45,
      comment: 'Should we establish her policy positions first?'
    }
  ],
  approval: 'changes-requested'
});
```

### Conflict Resolution in Teams

```typescript
// Multiple authors modify same character
// Author A: Harry becomes an Auror
// Author B: Harry becomes a teacher

const collaborativeMerge = await sharedGit.merge(
  'feature/harry-teacher',
  {
    strategy: 'collaborative',
    conflictResolution: {
      method: 'voting',
      participants: ['author-a', 'author-b', 'author-c'],
      deadline: '2024-12-25T00:00:00Z'
    }
  }
);

// System creates a vote
// Authors vote on preferred outcome
// Majority decision is implemented
```

## Real-World Examples

### Example 1: Game Narrative Branching

```typescript
class GameNarrativeManager {
  constructor(private git: NarrativeGit) {}
  
  async handlePlayerChoice(playerId: string, choice: Choice) {
    // Each player gets their own timeline
    const playerBranch = `player-${playerId}`;
    
    if (!this.git.branchExists(playerBranch)) {
      await this.git.branch(playerBranch, { from: 'main' });
    }
    
    await this.git.checkout(playerBranch);
    
    // Apply choice consequences
    for (const consequence of choice.consequences) {
      this.git.add(consequence);
    }
    
    await this.git.commit(`Player ${playerId}: ${choice.description}`);
    
    // Check for achievements
    const timeline = await this.git.getTimeline();
    const achievements = this.checkAchievements(timeline);
    
    return { consequences: choice.consequences, achievements };
  }
}
```

### Example 2: TV Series Writing Room

```typescript
class TVSeriesNarrative {
  constructor(private git: NarrativeGit) {}
  
  async planSeason(seasonNumber: number) {
    // Create season branch
    await this.git.branch(`season-${seasonNumber}`);
    await this.git.checkout(`season-${seasonNumber}`);
    
    // Each writer works on episodes
    const episodes = [];
    for (let ep = 1; ep <= 10; ep++) {
      await this.git.branch(`s${seasonNumber}e${ep}`, {
        from: `season-${seasonNumber}`
      });
      episodes.push(`s${seasonNumber}e${ep}`);
    }
    
    return episodes;
  }
  
  async integrateEpisodes(seasonNumber: number) {
    await this.git.checkout(`season-${seasonNumber}`);
    
    // Merge episodes in order
    for (let ep = 1; ep <= 10; ep++) {
      const result = await this.git.merge(`s${seasonNumber}e${ep}`, {
        strategy: 'sequential',
        paradoxResolution: {
          strategy: 'timeline-echo',
          autoResolve: true
        }
      });
      
      if (result.conflicts.length > 0) {
        // Writers room meeting to resolve
        await this.scheduleWritersRoom(result.conflicts);
      }
    }
  }
}
```

### Example 3: Interactive Fiction Platform

```typescript
class InteractiveFictionPlatform {
  constructor(private git: NarrativeGit) {}
  
  async createReaderBranch(readerId: string, storyId: string) {
    const mainStory = await this.git.clone(storyId);
    const readerBranch = `reader-${readerId}`;
    
    await mainStory.branch(readerBranch);
    await mainStory.checkout(readerBranch);
    
    return {
      storyId,
      branch: readerBranch,
      checkpoint: await mainStory.getCurrentCommit()
    };
  }
  
  async shareEnding(readerId: string, storyId: string) {
    const readerBranch = `reader-${readerId}`;
    
    // Create shareable ending
    const ending = await this.git.createShareableEnding({
      branch: readerBranch,
      title: 'My Perfect Ending',
      description: 'Everyone lives happily ever after'
    });
    
    // Other readers can merge this ending
    return {
      endingId: ending.id,
      shareUrl: `https://fiction.io/endings/${ending.id}`
    };
  }
}
```

## Best Practices

### 1. Meaningful Commit Messages

```typescript
// Good
await git.commit('Reveal Snape true allegiance through Pensieve memories');

// Bad
await git.commit('Update stuff');
```

### 2. Atomic Commits

```typescript
// Good: One logical change per commit
git.add(revealSnapeMemory);
await git.commit('Snape reveals memory of Lily');

git.add(harryUnderstandsSnape);
await git.commit('Harry processes Snape revelation');

// Bad: Multiple unrelated changes
git.add(revealSnapeMemory);
git.add(ronEatsSandwich);
git.add(hermioneStudies);
await git.commit('Various updates'); // Too vague!
```

### 3. Branch Naming Conventions

```typescript
// Feature branches
'feature/hermione-time-turner-arc'
'feature/marauders-backstory'

// Alternate timelines
'timeline/voldemort-wins'
'timeline/harry-sorted-slytherin'

// Bug fixes
'fix/harry-patronus-inconsistency'
'fix/timeline-loop-year-3'

// Experimental
'experiment/magic-system-redesign'
'experiment/muggle-technology-integration'
```

### 4. Regular Merging

```typescript
// Merge frequently to avoid conflicts
async function weeklyMerge() {
  const branches = await git.getActiveBranches();
  
  for (const branch of branches) {
    try {
      await git.checkout('main');
      const result = await git.merge(branch, {
        strategy: 'three-way',
        paradoxResolution: {
          strategy: 'quantum-superposition',
          autoResolve: true
        }
      });
      
      if (result.success) {
        console.log(`Successfully merged ${branch}`);
      }
    } catch (error) {
      console.log(`Merge conflict in ${branch}, needs manual review`);
    }
  }
}
```

### 5. Documentation

```typescript
// Document major timeline decisions
git.add({
  type: 'ADD_METADATA',
  payload: {
    timelineId: 'voldemort-wins',
    documentation: {
      decision: 'Harry fails to destroy final Horcrux',
      reasoning: 'Explore darker themes and resistance narrative',
      consequences: [
        'Hogwarts falls under Death Eater control',
        'Underground resistance forms',
        'Magic itself begins to corrupt'
      ]
    }
  }
});
```

## Troubleshooting

### Common Issues

#### 1. Merge Conflicts

```typescript
// Conflict: Same character, different fates
try {
  await git.merge('alternate-ending');
} catch (error) {
  if (error.type === 'MERGE_CONFLICT') {
    // Get conflict details
    const conflicts = await git.getConflicts();
    
    // Resolve manually
    for (const conflict of conflicts) {
      const resolution = await resolveConflict(conflict);
      await git.resolveConflict(conflict.id, resolution);
    }
    
    // Complete merge
    await git.completeMerge();
  }
}
```

#### 2. Paradox Loops

```typescript
// Detect circular paradoxes
const paradoxDetector = new ParadoxDetector(git);
const loops = await paradoxDetector.detectLoops();

if (loops.length > 0) {
  console.log('Paradox loops detected:', loops);
  
  // Break loops with temporal anchors
  for (const loop of loops) {
    await git.addTemporalAnchor({
      point: loop.center,
      type: 'fixed-point',
      description: 'Breaking paradox loop'
    });
  }
}
```

#### 3. Large Timeline Divergence

```typescript
// Timelines too different to merge
const divergence = await git.calculateDivergence('main', 'experimental');

if (divergence.score > 0.8) {
  console.log('Timelines have diverged significantly');
  
  // Create bridge timeline
  await git.createBridge({
    from: 'main',
    to: 'experimental',
    strategy: 'gradual-convergence',
    steps: 10
  });
}
```

### Performance Optimization

```typescript
// For large narratives
const config = {
  // Enable caching
  caching: {
    enabled: true,
    strategy: 'lru',
    maxSize: '1GB'
  },
  
  // Batch operations
  batching: {
    enabled: true,
    size: 100
  },
  
  // Lazy loading
  lazyLoad: {
    enabled: true,
    preloadDepth: 2
  }
};

const optimizedGit = new NarrativeGit(config);
```

## Next Steps

- Explore the [Examples](../../examples/) directory for working code
- Read about [Paradox Resolution Strategies](../concepts/paradox-resolution.md)
- Learn about [Reality Hooks](../api/narrative-git.md#reality-hooks)
- Join our [Community Discord](https://discord.gg/narrative-canon)

---

> 💡 **Remember**: In narrative version control, every branch is a possibility, every merge is a creative decision, and every commit shapes the story's future.