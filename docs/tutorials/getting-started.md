# Getting Started with Narrative Canon

This guide will walk you through installing and using Narrative Canon for the first time.

## Installation

```bash
npm install @narrative/canon
```

Or with yarn:
```bash
yarn add @narrative/canon
```

## Basic Narrative Extraction

### Your First Extraction

```javascript
const { NarrativeCanon } = require('@narrative/canon');

async function extractStory() {
  // Create instance with mock LLM (no API key needed)
  const canon = new NarrativeCanon();
  
  // Your story text
  const story = `
    Sarah Chen stood at the edge of the cliff, watching the sunset paint 
    the sky in shades of amber. Below, the city of Neo-Tokyo hummed with 
    electric life. She had made her decision - tomorrow, she would join 
    the resistance against Oneirocom.
    
    "Are you sure about this?" asked Marcus, her longtime friend and 
    mentor. He had taught her everything about hacking the neural networks.
    
    Sarah nodded. "They killed my brother. I can't stand by anymore."
  `;
  
  // Extract narrative elements
  const narrative = await canon.extract(story);
  
  // Explore what was found
  console.log('\nCharacters found:');
  narrative.entities
    .filter(e => e.type === 'character')
    .forEach(char => {
      console.log(`- ${char.name}: ${char.description}`);
    });
  
  console.log('\nRelationships:');
  narrative.relationships.forEach(rel => {
    console.log(`- ${rel.source} → ${rel.target} (${rel.type})`);
  });
  
  console.log('\nLocations:');
  narrative.entities
    .filter(e => e.type === 'location')
    .forEach(loc => {
      console.log(`- ${loc.name}`);
    });
}

extractStory();
```

### Using with Gemini API

For production use with real narrative extraction:

```javascript
const { NarrativeCanon } = require('@narrative/canon');

const canon = new NarrativeCanon({
  llm: 'gemini',
  apiKey: process.env.GOOGLE_AI_API_KEY
});

// Extract with more detailed analysis
const narrative = await canon.extract(storyText);
```

## Git for Narratives

### Creating Your First Timeline

```javascript
const { NarrativeGit } = require('@narrative/canon');

async function createTimeline() {
  // Initialize narrative repository
  const git = new NarrativeGit({
    author: 'storyteller'
  });
  
  // Add your protagonist
  git.add({
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'sarah',
      type: 'character',
      name: 'Sarah Chen',
      description: 'Brilliant hacker seeking justice',
      properties: {
        status: 'alive',
        location: 'neo-tokyo',
        skills: ['hacking', 'martial-arts']
      }
    }
  });
  
  // Add her mentor
  git.add({
    type: 'ADD_ENTITY',
    timestamp: Date.now(),
    payload: {
      id: 'marcus',
      type: 'character',
      name: 'Marcus Wei',
      description: 'Veteran resistance fighter and teacher',
      properties: {
        status: 'alive',
        role: 'mentor'
      }
    }
  });
  
  // Create their relationship
  git.add({
    type: 'ADD_RELATIONSHIP',
    timestamp: Date.now(),
    payload: {
      id: 'sarah-marcus-mentorship',
      source: 'marcus',
      target: 'sarah',
      type: 'mentorship',
      description: 'Marcus teaches Sarah hacking and resistance tactics'
    }
  });
  
  // Commit your initial world state
  await git.commit('Establish main characters and relationships');
  
  // View the commit
  const log = git.log();
  console.log('First commit:', log[0].commit.message);
}

createTimeline();
```

### Creating Alternate Timelines

```javascript
async function createAlternateTimelines() {
  const git = new NarrativeGit({ author: 'storyteller' });
  
  // ... setup initial state ...
  
  // Create a branch where Sarah is captured
  await git.branch('captured-timeline');
  await git.checkout('captured-timeline');
  
  git.add({
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'sarah',
      changes: {
        properties: {
          status: 'captured',
          location: 'oneirocom-prison'
        }
      }
    }
  });
  
  await git.commit('Sarah captured during infiltration');
  
  // Create another branch where she succeeds
  await git.checkout('main');
  await git.branch('success-timeline');
  await git.checkout('success-timeline');
  
  git.add({
    type: 'UPDATE_ENTITY',
    timestamp: Date.now(),
    payload: {
      entityId: 'sarah',
      changes: {
        properties: {
          status: 'victorious',
          achievement: 'destroyed-oneirocom-mainframe'
        }
      }
    }
  });
  
  await git.commit('Sarah successfully destroys Oneirocom mainframe');
  
  // Compare timelines
  const branches = git.branches();
  console.log('Available timelines:');
  branches.forEach(branch => {
    console.log(`- ${branch.name}: ${branch.current ? '(current)' : ''}`);
  });
}
```

## Visualizing Narratives

### Generate Timeline Visualization

```javascript
async function visualizeStory() {
  const canon = new NarrativeCanon();
  
  // Extract narrative
  const narrative = await canon.extract(storyText);
  
  // Generate interactive HTML visualization
  await canon.visualize(narrative, 'output/my-story-timeline.html');
  
  console.log('Visualization saved to output/my-story-timeline.html');
  // Open in browser to see interactive timeline
}
```

## Working with Extracted Data

### Query Characters

```javascript
// Find main characters (mentioned most often)
const characterMentions = {};
narrative.scenes.forEach(scene => {
  scene.characters.forEach(charId => {
    characterMentions[charId] = (characterMentions[charId] || 0) + 1;
  });
});

const mainCharacters = Object.entries(characterMentions)
  .sort(([,a], [,b]) => b - a)
  .slice(0, 3)
  .map(([id]) => narrative.entities.find(e => e.id === id));

console.log('Main characters:', mainCharacters.map(c => c.name));
```

### Track Character Journey

```javascript
// Follow a character through scenes
const characterId = 'sarah';
const journey = narrative.scenes
  .filter(scene => scene.characters.includes(characterId))
  .map(scene => ({
    scene: scene.sequence,
    location: scene.location,
    description: scene.description
  }));

console.log(`${characterId}'s journey:`, journey);
```

### Analyze Relationships

```javascript
// Build relationship network
const network = {};
narrative.relationships.forEach(rel => {
  if (!network[rel.source]) network[rel.source] = [];
  network[rel.source].push({
    target: rel.target,
    type: rel.type
  });
});

// Find most connected character
const connections = Object.entries(network)
  .map(([char, rels]) => ({ char, count: rels.length }))
  .sort((a, b) => b.count - a.count);

console.log('Most connected:', connections[0]);
```

## Next Steps

Now that you understand the basics:

1. **Learn More Concepts**:
   - [Git for Narratives](../concepts/git-for-narratives.md)
   - [Timeline Branching](../concepts/timeline-branching.md)
   - [Paradox Resolution](../concepts/paradox-resolution.md)

2. **Try Tutorials**:
   - [Extracting Your First Narrative](./first-extraction.md)
   - [Creating Timeline Branches](./timeline-branches.md)
   - [Building Interactive Fiction](./interactive-fiction.md)

3. **Explore Examples**:
   - [Basic Examples](../examples/basic-extraction.md)
   - [Advanced Timeline Management](../examples/timeline-branching.md)
   - [Self-Healing Narratives](../examples/self-healing.md)

4. **API Reference**:
   - [NarrativeCanon API](../api/narrative-canon.md)
   - [NarrativeGit API](../api/narrative-git.md)
   - [TypeScript Types](../api/types.md)

## Getting Help

- **GitHub Issues**: [Report bugs or request features](https://github.com/project89/narrative-canon/issues)
- **Discussions**: [Join the community](https://github.com/project89/narrative-canon/discussions)
- **Examples**: Check the `/examples` directory for more code samples

Happy storytelling! 🚀