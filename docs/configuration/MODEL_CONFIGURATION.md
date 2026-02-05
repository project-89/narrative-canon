# Gemini 3 Model Configuration

Narrative Canon uses the latest Gemini 3 models for maximum narrative extraction quality.

## Available Models

### Default: gemini-3-pro-preview
- **Most Advanced Reasoning** - Tops LMArena at 1501 Elo
- **Best for**: Complex entity classification, relationship analysis, state change detection, maximum quality
- **Temperature**: 0.1 (highly consistent)
- **Max Tokens**: 64,000
- **Thinking Level**: High (extended reasoning for complex tasks)
- **Use Case**: Maximum quality extraction, complex reasoning, critical narrative analysis

### Fast: gemini-3-flash-preview
- **Near Pro-Level at Flash Speed** - Ideal for agentic workflows
- **Best for**: Scene detection, fast extraction, real-time analysis, iterative processing
- **Temperature**: 0.2 (consistent but faster)
- **Max Tokens**: 64,000
- **Thinking Level**: Low (optimized for speed)
- **Use Case**: When speed is prioritized, agentic workflows, high-volume processing

### Fallback Models (if Gemini 3 unavailable)
- `gemini-2.5-pro-preview-05-06` - Previous generation Pro
- `gemini-2.5-flash-preview-05-20` - Previous generation Flash

## Configuration

### Environment Variables

```bash
# Required: Your Google AI API key
export GEMINI_API_KEY='your-api-key-here'
# or
export GOOGLE_AI_API_KEY='your-api-key-here'

# Optional: Enable fast mode (uses gemini-3-flash-preview for all operations)
export GEMINI_FAST_MODE=true
```

### Quick Setup

```bash
# Configure environment and show current settings
./setup-models.sh

# Enable fast mode for current session
./setup-models.sh --fast

# Set API key (get one at https://ai.google.dev/)
export GEMINI_API_KEY='your-key'
```

## Task-Specific Model Selection

Different tasks benefit from different models:

| Task | Default Model | Fast Mode Model | Reason |
|------|---------------|-----------------|---------|
| **Entity Extraction** | gemini-3-pro-preview | gemini-3-flash-preview | Complex classification needs Pro reasoning |
| **Scene Detection** | gemini-3-flash-preview | gemini-3-flash-preview | Fast model sufficient |
| **Relationships** | gemini-3-pro-preview | gemini-3-flash-preview | Complex relationship analysis |
| **State Changes** | gemini-3-pro-preview | gemini-3-flash-preview | Most complex reasoning task |
| **Book Chunking** | gemini-3-flash-preview | gemini-3-flash-preview | Speed matters for many chunks |

## Programmatic Configuration

```typescript
import { GeminiAdapter } from '@narrative/canon';

// Basic usage
const llm = new GeminiAdapter(process.env.GEMINI_API_KEY);

// With custom configuration
const llm = new GeminiAdapter({
  apiKey: process.env.GEMINI_API_KEY,
  timeout: 120000,      // 2 minutes per request
  maxRetries: 3,        // Retry failed requests
  requestDelay: 1000,   // Delay between requests
});

// Using model preference
const result = await llm.generateStructuredOutput(prompt, schema, {
  modelPreference: 'smart',  // Uses gemini-3-pro-preview
  // or
  modelPreference: 'fast',   // Uses gemini-3-flash-preview
  temperature: 0.3,
  maxTokens: 60000,
});
```

## Model Configuration File

The model configuration is centralized in `src/config/models.ts`:

```typescript
import { getModelForTask, getModelConfig, GEMINI_MODELS } from '@narrative/canon/config/models';

// Get model name for a task
const proModel = getModelForTask('smart');  // 'gemini-3-pro-preview'
const flashModel = getModelForTask('fast'); // 'gemini-3-flash-preview'

// Get full configuration
const config = getModelConfig('gemini-3-pro-preview');
console.log(config.bestFor);  // ['complex reasoning', 'entity classification', ...]
```

## Usage Examples

### Timeline Warfare

```bash
# Default mode (maximum quality)
npm run game

# Fast mode
GEMINI_FAST_MODE=true npm run game
```

### Book Extraction

```typescript
import { ChunkedExtractionPipeline, GeminiAdapter } from '@narrative/canon';

const llm = new GeminiAdapter({
  apiKey: process.env.GEMINI_API_KEY,
  timeout: 180000,  // 3 minutes for complex chunks
});

const pipeline = new ChunkedExtractionPipeline(llm, {
  maxChunkSize: 8000,
  respectChapters: true,
});

const result = await pipeline.extractFromBook(bookText);
```

## Quality Improvements with Gemini 3

- **Better Entity Classification**: More accurate distinction between entity types
- **Enhanced Relationship Detection**: Nuanced understanding of connections
- **Improved State Change Analysis**: Better narrative progression tracking
- **Extended Context**: 64,000 token limit enables larger chunks
- **Consistency**: Lower temperature with powerful models reduces hallucination

## Recommendations

### For Maximum Quality (Recommended)
```bash
export GEMINI_API_KEY='your-key'
# Don't set GEMINI_FAST_MODE - uses gemini-3-pro-preview
```

### For Speed (Still High Quality)
```bash
export GEMINI_API_KEY='your-key'
export GEMINI_FAST_MODE=true
# Uses gemini-3-flash-preview
```

### For Development/Testing
```bash
# No API key - uses MockLLM with test patterns
npm test
```

## API Reference

### LLMOptions

```typescript
interface LLMOptions {
  modelPreference?: 'fast' | 'smart' | 'default';
  temperature?: number;    // 0-1, lower = more consistent
  maxTokens?: number;      // Max response length
}
```

### GeminiConfig

```typescript
interface GeminiConfig {
  apiKey: string;
  timeout?: number;        // Request timeout in ms (default: 120000)
  maxRetries?: number;     // Retry count (default: 3)
  requestDelay?: number;   // Delay between requests (default: 1000)
}
```

## Troubleshooting

### Request Timeouts
- Increase timeout in GeminiAdapter config
- Use smaller chunks with ChunkedExtractionPipeline
- Use fast mode for initial testing

### Rate Limiting
- Increase `requestDelay` between requests
- Process chunks sequentially rather than in parallel
- Consider batching with delays

### Model Not Available
- Check if Gemini 3 models are available in your region
- Fallback models will be used automatically if configured
