# 📚 Narrative Canon

> Transform any story into a queryable knowledge graph with temporal awareness and Git-like version control

[![npm version](https://img.shields.io/npm/v/@narrative/canon.svg)](https://www.npmjs.com/package/@narrative/canon)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

Narrative Canon is a powerful TypeScript library that extracts structured data from narrative text using LLMs. It identifies characters, scenes, relationships, and temporal information to build interactive narrative graphs and timelines. **NEW**: Git-like version control for narratives enables timeline branching, merging, and collaborative storytelling.

## ✨ Features

- 🎭 **Character Extraction** - Identify and track characters with descriptions, traits, and aliases
- 🎬 **Scene Detection** - Break narratives into sequential scenes with locations and events  
- 💫 **Relationship Mapping** - Discover typed connections between characters and entities
- ⏰ **Timeline Construction** - Build temporal graphs showing narrative progression
- 🔄 **State Change Tracking** - Monitor how characters and situations evolve
- 📊 **Interactive Visualization** - Generate HTML timeline visualizations
- 🤖 **LLM Integration** - Production-ready Google Gemini API integration with structured output
- 🎮 **Bonus Game** - Includes Timeline Warfare, a playable demonstration of the technology

### 🆕 Git for Narratives

- 🌿 **Timeline Branching** - Create alternate story branches and explore "what if" scenarios
- 🔀 **Narrative Merging** - Merge divergent timelines with intelligent conflict resolution
- 🎯 **Paradox Resolution** - Handle narrative conflicts like character death across timelines
- 🪝 **Reality Hooks** - Automatic asset generation triggered by narrative changes
- 📝 **Commit History** - Track narrative evolution with Git-like commits and diffs
- 🌍 **Collaborative Storytelling** - Multiple authors can work on different timeline branches

## 🚀 Quick Start

### Installation

```bash
npm install @narrative/canon
```

### Basic Usage

```javascript
const { NarrativeCanon } = require('@narrative/canon');

// Create instance (uses mock LLM by default)
const canon = new NarrativeCanon();

// Extract narrative elements
const story = "Alice met Bob in the forest. They decided to search for the lost treasure together.";
const narrative = await canon.extract(story);

// Get statistics
const stats = canon.getStats(narrative);
console.log(`Found ${stats.characters} characters in ${stats.scenes} scenes`);

// Generate visualization
await canon.visualize(narrative, 'output/story-timeline.html');
```

### Using with Gemini API

```javascript
const canon = new NarrativeCanon({
  llm: 'gemini',
  apiKey: process.env.GOOGLE_AI_API_KEY
});

const narrative = await canon.extract(storyText);
```

## 🌿 Git for Narratives

### Creating Timeline Branches

```javascript
import { NarrativeGit } from '@narrative/canon';

// Initialize a narrative repository
const git = new NarrativeGit({
  author: 'storyteller',
  autoExecuteHooks: true
});

// Add a character
git.add({
  type: 'ADD_ENTITY',
  payload: {
    id: 'sarah',
    type: 'character',
    name: 'Sarah Chen',
    properties: { status: 'alive' }
  }
});

// Commit to main timeline
await git.commit('Introduce protagonist');

// Create alternate timeline
await git.branch('timeline-dark');
await git.checkout('timeline-dark');

// In this timeline, Sarah dies
git.add({
  type: 'UPDATE_ENTITY',
  payload: {
    entityId: 'sarah',
    changes: { 
      properties: { status: 'dead' }
    }
  }
});

await git.commit('Sarah dies tragically');

// Create another timeline where she gains powers
await git.checkout('main');
await git.branch('timeline-powers');
await git.checkout('timeline-powers');

git.add({
  type: 'UPDATE_ENTITY',
  payload: {
    entityId: 'sarah',
    changes: { 
      properties: { 
        status: 'alive',
        abilities: ['time-sight', 'reality-bending']
      }
    }
  }
});

await git.commit('Sarah awakens to her powers');
```

### Merging Timelines with Paradox Resolution

```javascript
// Attempt to merge timelines with conflicts
const mergeResult = await git.merge('timeline-dark', {
  strategy: 'three-way',
  paradoxResolution: {
    strategy: 'quantum-superposition',
    preserveBothStates: true
  }
});

// Result: Sarah exists in quantum superposition
// - Dead to some observers
// - Alive to others
// - Creates rich narrative possibilities
```

### Reality Hooks for Asset Generation

```javascript
import { characterPortraitHook, soundtrackHook } from '@narrative/canon';

// Register hooks that trigger on narrative changes
git.registerHook(characterPortraitHook);
git.registerHook(soundtrackHook);

// When you add a character, portrait is auto-generated
git.add({
  type: 'ADD_ENTITY',
  payload: {
    id: 'nova',
    type: 'character',
    name: 'Agent Nova',
    description: 'Cyberpunk hacker with neon hair'
  }
});

// Commit triggers registered hooks
await git.commit('Add new character');
// → Generates: nova_portrait.png, nova_theme.mp3
```

## 📖 What Gets Extracted

### Characters & Entities
- Names and aliases
- Descriptions and traits  
- First appearance tracking
- Entity types (character, location, object, organization)
- Unique IDs for graph building

### Scenes
- Sequential scene breakdown
- Scene summaries and descriptions
- Location tracking
- Character presence per scene
- Events with participants
- Temporal ordering

### Relationships
- Source and target entities
- Relationship types (family, friendship, professional, etc.)
- Relationship descriptions
- First mention tracking
- Directional connections

### State Changes
- Entity status updates
- Location changes
- Relationship formations/dissolutions
- Group formations
- Entity transformations
- Scene/event anchoring

### Chronology
- Unified timeline of all events
- Scene sequencing
- State change integration
- Temporal consistency

## 🎯 API Reference

### NarrativeCanon

Main class for narrative extraction.

```typescript
new NarrativeCanon(config?: {
  llm?: 'gemini' | 'mock';      // LLM provider (default: 'mock')
  apiKey?: string;               // API key for Gemini
  storagePath?: string;          // Path for storing extractions
  debug?: boolean;               // Enable debug logging
})
```

#### Core Methods

```typescript
// Extract narrative from text
extract(text: string): Promise<NarrativeStructure>

// Extract from file
extractFromFile(filePath: string): Promise<NarrativeStructure>

// Batch process multiple files
extractBatch(filePaths: string[]): Promise<Map<string, NarrativeStructure>>

// Generate HTML visualization
visualize(narrative: NarrativeStructure, outputPath: string): Promise<void>

// Get extraction statistics
getStats(narrative: NarrativeStructure): Stats
```

### NarrativeGit

Git-like version control for narratives.

```typescript
const git = new NarrativeGit(config?: {
  author?: string;               // Commit author name
  autoExecuteHooks?: boolean;    // Auto-run hooks on commit
  defaultBranch?: string;        // Default branch name
})
```

#### Git-like Methods

```typescript
// Stage narrative changes
add(operation: GraphOperation): void

// Commit staged changes
commit(message: string): Promise<NarrativeCommit>

// Create/switch branches
branch(name: string): TimelineBranch
checkout(branchName: string): Promise<void>

// Merge timelines
merge(source: string, config?: MergeConfig): Promise<MergeResult>

// View history
log(): LogEntry[]
diff(from?: string, to?: string): GraphDiff

// Register hooks
registerHook(hook: RealityHook): void
```

### Data Structures

```typescript
interface NarrativeStructure {
  entities: Entity[];           // Characters, locations, objects
  scenes: Scene[];              // Sequential story segments
  relationships: Relationship[]; // Connections between entities
  stateChanges: StateChange[];  // How things change over time
  chronology: Chronology;       // Unified timeline
}

interface GraphOperation {
  type: 'ADD_ENTITY' | 'UPDATE_ENTITY' | 'REMOVE_ENTITY' | 
        'ADD_RELATIONSHIP' | 'REMOVE_RELATIONSHIP';
  payload: any;
  timestamp: number;
}

interface MergeConfig {
  strategy: 'fast-forward' | 'three-way' | 'ours' | 'theirs';
  paradoxResolution?: {
    strategy: 'quantum-superposition' | 'timeline-echo' | 
              'paradox-cascade' | 'schrodinger';
    autoResolve?: boolean;
  };
}
```

## 🛠️ Advanced Usage

### Custom Extraction Pipeline

```javascript
import { 
  NarrativePipeline,
  CharacterExtractor,
  SceneExtractor,
  GeminiAdapter 
} from '@narrative/canon';

const adapter = new GeminiAdapter(apiKey);
const pipeline = new NarrativePipeline(adapter);

// Configure extraction parameters
const result = await pipeline.extractNarrative(text);
```

### Timeline Paradox Resolution

```javascript
// Handle complex narrative conflicts
const paradoxResolver = new ParadoxResolver();

// Detect paradoxes when merging
const paradoxes = paradoxResolver.detectParadoxes(
  sourceOperations,
  targetOperations,
  currentState
);

// Resolve with chosen strategy
const resolution = paradoxResolver.resolveParadox(
  paradox,
  'quantum-superposition',
  context
);
```

### Self-Healing Narratives

```javascript
// Narrative adapts to disruptive events
class SelfHealingNarrative {
  async handleCharacterDeath(characterId: string, killerId: string) {
    // Create instance branch for this player
    const instance = `instance-${killerId}`;
    await git.branch(instance);
    await git.checkout(instance);
    
    // Mark character as dead
    git.add({
      type: 'UPDATE_ENTITY',
      payload: { 
        entityId: characterId,
        changes: { status: 'dead' }
      }
    });
    
    // Redistribute narrative functions
    const functions = this.analyzeCharacterFunctions(characterId);
    for (const func of functions) {
      const substitute = await this.findSubstitute(func);
      await this.redistributeFunction(func, substitute);
    }
    
    await git.commit('Narrative adapted to character death');
  }
}
```

## 💻 CLI Usage

```bash
# Install globally
npm install -g @narrative/canon

# Extract narrative
narrative-canon extract story.txt -o output.json

# With visualization
narrative-canon extract story.txt --visualize timeline.html

# Using Gemini API
GOOGLE_AI_API_KEY=your-key narrative-canon extract story.txt --llm gemini

# Git-like operations
narrative-canon init                    # Initialize narrative repo
narrative-canon add character.json      # Stage changes
narrative-canon commit -m "Add hero"    # Commit changes
narrative-canon branch alternate-ending # Create branch
narrative-canon merge alternate-ending  # Merge timelines
```

## 🎮 Example Applications

### Choose Your Own Adventure

```javascript
// Player choices create timeline branches
async function playerChoice(choice) {
  const branches = git.branches();
  if (!branches.includes(choice.branch)) {
    await git.branch(choice.branch);
  }
  await git.checkout(choice.branch);
  // Continue narrative on chosen branch
}
```

### Community-Driven Narratives

```javascript
// Multiple players explore different timelines
class CommunityNarrative {
  async forkTimeline(playerId, fromBranch) {
    const branchName = `player-${playerId}-timeline`;
    await git.branch(branchName, { from: fromBranch });
    return branchName;
  }
  
  async proposeCanonical(playerBranch) {
    // Community votes on timeline merges
    const pr = await git.createPullRequest({
      from: playerBranch,
      to: 'main',
      description: 'Community timeline proposal'
    });
    await this.openVoting(pr);
  }
}
```

## 📚 Documentation

### Quick Links
- [**Documentation Index**](docs/INDEX.md) - Complete documentation directory
- [**Git for Narratives Deep Dive**](docs/guides/GIT_FOR_NARRATIVES_DEEP_DIVE.md) - Comprehensive guide to timeline branching
- [**API Reference**](docs/api/) - Detailed API documentation
- [**Tutorials**](docs/tutorials/) - Step-by-step guides
- [**Examples**](examples/) - Working code examples

## 🌟 Use Cases

### Story Analysis & Writing
- Character arc tracking
- Plot structure analysis
- Relationship dynamics mapping
- Timeline consistency checking
- Story bible generation
- **Alternate ending exploration**
- **What-if scenario testing**

### Game Development
- NPC relationship mapping
- Quest dependency tracking
- World state management
- Narrative branching analysis
- Dialog tree extraction
- **Save game branching**
- **Player choice consequences**

### Collaborative Fiction
- **Multiple author coordination**
- **Timeline merge conflicts**
- **Canon voting systems**
- **Community storytelling**
- **Narrative forking**

### Interactive Media
- **Branching narratives**
- **Audience participation**
- **Live story evolution**
- **Reality TV scripting**
- **Transmedia franchises**

## 📊 Performance

- **Speed**: Processes ~10,000 word narratives in < 30 seconds
- **Accuracy**: 95%+ extraction accuracy with Gemini API
- **Scale**: Handles narratives up to ~30,000 words
- **Batching**: Process multiple files concurrently
- **Caching**: Intelligent caching for repeated extractions
- **Branching**: Unlimited timeline branches
- **Merging**: O(n) merge performance with conflict detection

## 🔧 Development

### Setup

```bash
# Clone repository
git clone https://github.com/project89/narrative-canon
cd narrative-canon

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build
```

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test
npm test src/extractors/character.test.ts

# Test Git operations
npm test src/git/narrative-git.test.ts
```

### Project Structure

```
narrative-canon/
├── src/                  # Source code
│   ├── extractors/       # Extraction modules
│   ├── llm/              # LLM adapters
│   ├── git/              # Git-like operations
│   ├── types.ts          # TypeScript types
│   └── pipeline.ts       # Main pipeline
├── examples/             # Usage examples
│   └── git-for-narratives/ # Timeline demos
├── tests/                # Test suites
└── docs/                 # Documentation
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Areas for Contribution
- Additional paradox resolution strategies
- New hook types for asset generation
- Visualization improvements for timeline branches
- Performance optimizations for large narratives
- Documentation examples
- Language support beyond English

## 📄 License

MIT © Project 89

## 🙏 Acknowledgments

Built as part of Project 89's narrative intelligence research. Special thanks to:
- Google Gemini team for the excellent API
- The Zod library for schema validation
- Git for the version control inspiration
- Our community of timeline weavers and story architects

## 🔗 Links

- [Documentation](https://narrative-canon.dev)
- [NPM Package](https://www.npmjs.com/package/@narrative/canon)
- [GitHub Repository](https://github.com/project89/narrative-canon)
- [Project 89](https://project89.org)

---

**Ready to transform your narratives into living, branching realities? [Get started now!](#-quick-start)**