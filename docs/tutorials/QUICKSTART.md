# 🚀 Project 89 Narrative Git - Quick Start Guide

## Overview

The Narrative Git system is a revolutionary tool for tracking and managing narrative evolution in the Project 89 universe. It treats stories as living codebases that can branch, merge, and evolve over time.

## Installation

```bash
# Install dependencies
npm install

# Build the TypeScript code
npm run build

# Run tests to verify everything works
npm test
```

## Basic Usage

### 1. Extract Project 89 Narrative

```bash
# Set your Gemini API key (optional - uses mock data if not set)
export GEMINI_API_KEY=your_api_key_here

# Run the extraction
node extract-project89.js
```

This will:
- Extract narrative from Project 89 markdown files
- Create timeline branches (main, dark, optimal)
- Track entity and relationship evolution
- Export timeline data to `project89-timeline.json`

### 2. Visualize the Timeline

```bash
# Generate interactive visualization
node visualize-project89-timeline.js

# Open in browser
open project89-timeline-viz.html
```

### 3. Use in Your Own Code

```javascript
const { NarrativeGit } = require('./dist/narrative-git');

// Initialize
const git = new NarrativeGit({
  projectName: 'my-story',
  llmConfig: {
    provider: 'gemini',
    apiKey: process.env.GEMINI_API_KEY
  }
});

// Create repository
await git.init();

// Add narrative text
await git.add('Chapter 1: The beginning...');

// Add at specific timeline point
await git.addAtTime(
  'The resistance forms in Neo Tokyo', 
  new Date('2030-03-21'),
  'Resistance origin'
);

// Create branches
await git.branch('alternate-timeline');
await git.checkout('alternate-timeline');

// Query timeline
const timeline = git.timeline();
const events2045 = git.timelineYear(2045);
```

## Key Features

### 🌳 Git-Like Branching
- Create alternate timelines
- Merge storylines with conflict detection
- Track narrative evolution

### ⏰ Non-Linear Timeline
- Add events at any narrative date
- Query by year or date range
- Maintain chronological consistency

### 🔍 Entity & Relationship Tracking
- Automatic character extraction
- Relationship network evolution
- State change tracking

### 🎮 Game Integration
- Generate mission narratives
- Track timeline modifications
- Ensure lore consistency

## File Structure

```
narrative-canon/
├── src/                    # TypeScript source
│   ├── core/              # Core versioning system
│   ├── extractors/        # LLM-based extractors
│   └── visualization/     # Graph builders
├── dist/                  # Compiled JavaScript
├── examples/              # Usage examples
├── extract-project89.js   # Main extraction script
└── test-full-system.js    # System validation
```

## Testing

```bash
# Run all tests
npm test

# Run full system test
node test-full-system.js

# Test with real content
node run-extraction.ts path/to/story.txt
```

## Common Commands

```bash
# Build TypeScript
npm run build

# Run tests
npm test

# Extract from file
node extract.ts story.txt

# Start CLI
node cli.ts
```

## Environment Variables

- `GEMINI_API_KEY` - Google AI API key for Gemini
- `OPENAI_API_KEY` - OpenAI API key (alternative)

## Troubleshooting

### "Cannot find module" errors
```bash
npm run build  # Rebuild TypeScript
```

### API Key errors
```bash
# Use mock provider for testing without API
const git = new NarrativeGit({
  llmConfig: { provider: 'mock' }
});
```

### Memory issues with large narratives
```bash
# Process in chunks
for (const chapter of chapters) {
  await git.add(chapter);
}
```

## Next Steps

1. **Explore the Timeline**: Run `extract-project89.js` to see the system in action
2. **Read the Docs**: Check `NARRATIVE_GIT_COMPLETE_GUIDE.md` for deep dive
3. **Integrate with Games**: Use timeline queries for mission generation
4. **Contribute**: The system is designed for collaborative storytelling

## Support

For issues or questions:
- Check test results: `test-results.json`
- Review logs in extraction output
- Consult `NARRATIVE_GIT_COMPLETE_GUIDE.md`

---

*Reality is a collaborative fiction. Let's write it together.*

🌌 PROJECT 89 - HACK THE NARRATIVE