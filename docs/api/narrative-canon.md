# NarrativeCanon API Reference

The `NarrativeCanon` class is the main interface for extracting narrative elements from text using LLM-powered analysis.

## Constructor

```typescript
new NarrativeCanon(options?: NarrativeCanonOptions)
```

### Options

```typescript
interface NarrativeCanonOptions {
  llm?: 'gemini' | 'openai' | 'mock';
  apiKey?: string;
  debug?: boolean;
  deduplication?: {
    enabled?: boolean;
    threshold?: number;
    strategy?: 'merge' | 'discard' | 'keep_both';
  };
}
```

- **llm**: Which LLM provider to use (default: 'mock')
- **apiKey**: API key for the LLM provider
- **debug**: Enable debug logging (default: false)
- **deduplication**: Entity deduplication settings

## Methods

### extract(text: string, options?: ExtractionOptions): Promise\<NarrativeStructure\>

Extracts narrative elements from text.

**Parameters:**
- `text`: The story text to analyze
- `options`: Optional extraction configuration

**Returns:** Promise resolving to a `NarrativeStructure` containing:
- **entities**: Characters, locations, objects, events
- **relationships**: Connections between entities
- **scenes**: Story segments with participants and actions
- **stateChanges**: How entities change throughout the story
- **chronology**: Timeline of events
- **themes**: Extracted thematic elements

**Example:**
```typescript
const canon = new NarrativeCanon({
  llm: 'gemini',
  apiKey: process.env.GOOGLE_AI_API_KEY
});

const narrative = await canon.extract(`
  Sarah Chen stepped into the abandoned warehouse. Marcus was waiting
  with the encrypted data drive that could expose Oneirocom's conspiracy.
`);

console.log(narrative.entities.length); // Number of extracted entities
console.log(narrative.relationships.length); // Number of relationships
```

### getStats(narrative: NarrativeStructure): ExtractionStats

Get statistics about an extracted narrative.

**Returns:**
```typescript
interface ExtractionStats {
  characters: number;
  locations: number;
  objects: number;
  events: number;
  relationships: number;
  scenes: number;
  stateChanges: number;
  totalWords: number;
  extractionRate: number; // entities per 100 words
}
```

### save(narrative: NarrativeStructure, filepath: string): Promise\<void\>

Save narrative structure to JSON file.

### load(filepath: string): Promise\<NarrativeStructure\>

Load narrative structure from JSON file.

### visualize(narrative: NarrativeStructure, outputPath: string): Promise\<void\>

Generate an interactive HTML visualization of the narrative timeline.

Creates a web page with:
- Interactive timeline of scenes
- Entity relationship graph
- Character journey tracking
- State change visualization

## Types

### Entity

```typescript
interface Entity {
  id: string;
  type: 'character' | 'location' | 'object' | 'event' | 'concept';
  name: string;
  description: string;
  aliases?: string[];
  properties?: Record<string, any>;
  firstMention?: number; // Position in text (0-1)
  lastMention?: number;
  metadata?: Record<string, any>;
}
```

### Relationship

```typescript
interface Relationship {
  id: string;
  type: string; // e.g., 'friendship', 'rivalry', 'located_at'
  source: string; // Entity ID
  target: string; // Entity ID
  description?: string;
  strength?: number; // 0-1
  properties?: Record<string, any>;
  metadata?: Record<string, any>;
}
```

### Scene

```typescript
interface Scene {
  id: string;
  sequence: number;
  summary?: string;
  description: string;
  location?: string; // Entity ID
  characters: string[]; // Entity IDs
  objects: string[]; // Entity IDs
  timeframe?: {
    start?: number;
    duration?: number;
    sequence?: number;
  };
  mood?: string;
  significance?: 'minor' | 'moderate' | 'major' | 'critical';
  metadata?: Record<string, any>;
}
```

### StateChange

```typescript
interface StateChange {
  id: string;
  entityId: string;
  type: 'created' | 'destroyed' | 'moved' | 'transformed' | 'acquired' | 'lost';
  description: string;
  sceneId?: string;
  timestamp?: number;
  from?: any;
  to?: any;
  significance?: 'minor' | 'moderate' | 'major' | 'critical';
  metadata?: Record<string, any>;
}
```

## Error Handling

The library throws specific error types:

```typescript
class ExtractionError extends Error {
  code: string;
  details?: any;
}

class ValidationError extends Error {
  issues: ValidationIssue[];
}

class LLMError extends Error {
  provider: string;
  statusCode?: number;
}
```

**Common error scenarios:**
- **Invalid API key**: `LLMError` with authentication details
- **Rate limiting**: `LLMError` with retry suggestions
- **Malformed text**: `ValidationError` with specific issues
- **Service unavailable**: `ExtractionError` with fallback options

## Configuration Examples

### Basic Setup (Mock LLM)
```typescript
const canon = new NarrativeCanon(); // Uses mock LLM by default
```

### Production Setup (Gemini)
```typescript
const canon = new NarrativeCanon({
  llm: 'gemini',
  apiKey: process.env.GOOGLE_AI_API_KEY,
  debug: process.env.NODE_ENV === 'development'
});
```

### Custom Deduplication
```typescript
const canon = new NarrativeCanon({
  llm: 'gemini',
  apiKey: process.env.GOOGLE_AI_API_KEY,
  deduplication: {
    enabled: true,
    threshold: 0.85, // Merge entities with >85% similarity
    strategy: 'merge' // Combine similar entities
  }
});
```

## Best Practices

1. **Text Preparation**: Clean and structure your text for better extraction
2. **API Key Management**: Store API keys securely using environment variables
3. **Error Handling**: Always wrap extraction calls in try-catch blocks
4. **Rate Limiting**: Implement delays between API calls for large batches
5. **Caching**: Save extracted narratives to avoid re-processing
6. **Validation**: Check extraction quality using the stats() method

## Performance Considerations

- **Text Length**: Optimal chunk size is 1000-5000 words
- **API Costs**: Gemini pricing varies by model and token count
- **Processing Time**: Extraction typically takes 5-30 seconds per chunk
- **Memory Usage**: Large narratives consume more memory for relationship graphs

## Integration Patterns

### Batch Processing
```typescript
async function processBatch(texts: string[]) {
  const results = [];
  for (const text of texts) {
    const narrative = await canon.extract(text);
    results.push(narrative);
    // Add delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return results;
}
```

### Real-time Analysis
```typescript
// Process text as it's being written
function setupRealTimeExtraction(textElement) {
  let timeout;
  textElement.addEventListener('input', () => {
    clearTimeout(timeout);
    timeout = setTimeout(async () => {
      const narrative = await canon.extract(textElement.value);
      updateVisualization(narrative);
    }, 2000); // Debounce for 2 seconds
  });
}
```

### Pipeline Integration
```typescript
// Integrate with existing content processing pipeline
class ContentProcessor {
  async processArticle(article) {
    // Extract narrative elements
    const narrative = await this.canon.extract(article.content);
    
    // Enhance with extracted data
    article.characters = narrative.entities.filter(e => e.type === 'character');
    article.locations = narrative.entities.filter(e => e.type === 'location');
    article.keyEvents = narrative.scenes.filter(s => s.significance === 'critical');
    
    return article;
  }
}
```