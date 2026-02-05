# How to Use the Narrative Extraction Library

## Quick Start with Bun

### 1. Install Bun (if you haven't already)
```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Extract a Narrative

```bash
# Simple extraction (uses mock LLM if no API key)
bun extract.ts test-narrative.txt

# Extract to specific directory
bun extract.ts test-narrative.txt my-output

# With real Gemini API
GEMINI_API_KEY=your-key bun extract.ts story.txt
```

### 3. Use the CLI

```bash
# Extract with CLI
bun cli.ts extract test-narrative.txt

# Serve the visualization
bun cli.ts serve ./narrative-output

# Then open http://localhost:8080 in your browser
```

## What You Get

After extraction, you'll find in your output directory:

1. **narrative.json** - Extracted narrative structure with:
   - Characters/entities
   - Scenes in sequence
   - Relationships between characters
   - State changes throughout the story
   - Chronological timeline

2. **graph.json** - Temporal graph representation

3. **narrative-visualization.html** - Interactive visualization with:
   - Summary dashboard
   - Timeline view
   - Character profiles
   - Scene progression
   - Relationship network
   - Temporal state graph

## API Key Setup

Create a `.env` file:
```
GEMINI_API_KEY=your-gemini-api-key
```

Get a free API key at: https://makersuite.google.com/app/apikey

## Example with Project 89 Document

```bash
# Extract the timeline intervention design doc
bun extract.ts /path/to/timeline_intervention_mvp_design.md project89-output

# View the results
bun cli.ts serve project89-output
```

## Programmatic Usage

```typescript
// your-script.ts
import { NarrativePipeline } from './src/pipeline';
import { UnifiedLLMAdapter } from './src/llm/adapter';

const adapter = new UnifiedLLMAdapter(process.env.GEMINI_API_KEY);
const pipeline = new NarrativePipeline(adapter);

const text = await Bun.file('story.txt').text();
const narrative = await pipeline.extractNarrative(text);

console.log('Found characters:', narrative.entities);
console.log('Found scenes:', narrative.scenes);
```

Run with: `bun your-script.ts`

## Tips

- **No API Key?** The mock LLM works great for testing
- **Large Documents?** The system automatically chunks them
- **Best Results:** Use narrative text (stories, scripts, game designs)
- **File Types:** Plain text, markdown, or any text format

## Troubleshooting

If you see module errors with Node.js, use Bun instead - it handles TypeScript and ES modules natively.