# Unified Narrative Extraction Pipeline

## Overview

The Narrative Canon library provides a complete pipeline for extracting structured data from narrative text using LLMs with validated schemas. This document describes the unified end-to-end pipeline architecture.

## Core Pipeline Flow

```
Text Input → Extraction Pipeline → Structured Output → Graph Building → Querying/Visualization
```

## 1. Library API

### Basic Usage
```typescript
import { NarrativeCanon } from 'narrative-canon';

const canon = new NarrativeCanon({
  llm: 'gemini',
  apiKey: process.env.GOOGLE_AI_API_KEY
});

// Extract everything
const narrative = await canon.extract(text);

// Query the narrative
const characters = canon.query().getCharacters();
const timeline = canon.query().getTimeline();
const conflicts = canon.query().getConflicts();

// Visualize
await canon.visualize('output.html');
```

### Advanced Usage
```typescript
// Custom extraction configuration
const canon = new NarrativeCanon({
  llm: 'gemini',
  apiKey: process.env.GOOGLE_AI_API_KEY,
  extractors: {
    character: { confidence: 0.8 },
    scene: { granularity: 'detailed' },
    relationship: { includeImplicit: true },
    stateChange: { trackAllChanges: true }
  }
});

// Incremental extraction
await canon.addText(chapter1);
await canon.addText(chapter2);

// Version control
const v1 = await canon.commit('First two chapters');
await canon.addText(chapter3);
const v2 = await canon.commit('Added chapter 3');

// Diff versions
const changes = await canon.diff(v1, v2);
```

## 2. Extraction Pipeline Architecture

### Pipeline Stages

```typescript
interface ExtractionPipeline {
  // Stage 1: Text Preprocessing
  preprocess(text: string): ProcessedText;
  
  // Stage 2: Parallel Extraction
  extract(text: ProcessedText): {
    characters: Character[];
    scenes: Scene[];
    relationships: Relationship[];
    stateChanges: StateChange[];
  };
  
  // Stage 3: Graph Construction
  buildGraph(extracted: ExtractedData): NarrativeGraph;
  
  // Stage 4: Consistency Checking
  validateConsistency(graph: NarrativeGraph): ValidationResult;
  
  // Stage 5: Storage
  store(graph: NarrativeGraph): Promise<void>;
}
```

### Extractor Interface

Each extractor follows this pattern:

```typescript
interface Extractor<T> {
  name: string;
  schema: z.ZodSchema<T>;
  
  extract(text: string, context?: ExtractionContext): Promise<T>;
  validate(result: T): ValidationResult;
  merge(results: T[]): T;
}
```

## 3. LLM Integration

### Gemini Adapter (Primary)

Using the `responseSchema` approach for guaranteed structured output:

```typescript
class GeminiAdapter implements LLMAdapter {
  async generateStructuredOutput<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options?: LLMOptions
  ): Promise<T> {
    // Convert Zod → JSON Schema
    const jsonSchema = zodToJsonSchema(schema);
    
    // Use Gemini's responseSchema
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: jsonSchema
      }
    });
    
    // Parse and validate
    return schema.parse(JSON.parse(result.response.text()));
  }
}
```

### Mock Adapter (Testing)

Deterministic responses for testing:

```typescript
class MockAdapter implements LLMAdapter {
  async generateStructuredOutput<T>(
    prompt: string,
    schema: z.ZodSchema<T>
  ): Promise<T> {
    // Return pre-configured responses based on schema type
    return this.getMockResponse(schema);
  }
}
```

## 4. Data Flow

### Input Processing
```
Raw Text → Sentence Splitting → Scene Detection → Chunking → Extraction Queue
```

### Extraction Flow
```
Chunk → Parallel Extractors → Results → Validation → Merging → Graph Update
```

### Output Generation
```
Graph → Query Engine → Filtered Data → Visualization/Export
```

## 5. Key Components

### NarrativeGraph
- Central data structure
- Temporal awareness
- Relationship tracking
- State management

### ConsistencyEngine
- Timeline validation
- Character state tracking
- Relationship coherence
- Conflict detection

### QueryEngine
- Timeline queries
- Character arc analysis
- Relationship network queries
- State change tracking

### Visualization
- HTML timeline view
- Interactive graph explorer
- Character relationship maps
- State change animations

## 6. Storage & Versioning

### File Store
```typescript
interface Storage {
  save(id: string, data: NarrativeGraph): Promise<void>;
  load(id: string): Promise<NarrativeGraph>;
  list(): Promise<string[]>;
  delete(id: string): Promise<void>;
}
```

### Version Control
```typescript
interface VersionControl {
  commit(message: string): Promise<Version>;
  checkout(version: Version): Promise<void>;
  diff(v1: Version, v2: Version): Promise<Changes>;
  merge(v1: Version, v2: Version): Promise<Version>;
}
```

## 7. Error Handling

### Extraction Errors
- Retry with backoff
- Fallback to simpler prompts
- Partial result handling

### Validation Errors
- Schema mismatch recovery
- Consistency warning levels
- Manual override options

## 8. Performance Optimization

### Caching
- LLM response caching
- Extraction result caching
- Graph computation caching

### Parallel Processing
- Concurrent chunk extraction
- Parallel extractor execution
- Batch LLM requests

### Incremental Updates
- Delta extraction
- Graph patching
- Minimal recomputation

## 9. Testing Strategy

### Unit Tests
- Each extractor independently
- Schema validation
- Graph operations

### Integration Tests
- Full pipeline flow
- LLM adapter switching
- Error scenarios

### End-to-End Tests
- Complete narratives
- Performance benchmarks
- Consistency validation

## 10. CLI Interface

```bash
# Basic extraction
narrative-canon extract story.txt -o output.json

# With visualization
narrative-canon extract story.txt --visualize timeline.html

# Interactive mode
narrative-canon repl story.txt

# Batch processing
narrative-canon batch stories/*.txt -o results/
```

## Implementation Priority

1. **Phase 1: Core Pipeline** ✓
   - Basic extractors
   - Gemini integration
   - Simple visualization

2. **Phase 2: Production Ready** (Current)
   - Error handling
   - Performance optimization
   - Comprehensive tests

3. **Phase 3: Advanced Features**
   - Version control
   - Incremental extraction
   - Advanced queries

4. **Phase 4: Ecosystem**
   - Plugin system
   - Multiple LLM support
   - Cloud storage

## Success Metrics

- **Accuracy**: 95%+ extraction accuracy on test corpus
- **Performance**: <30s for 10k word narrative
- **Reliability**: 99.9% uptime with retry logic
- **Usability**: Single-command extraction with useful defaults

This unified pipeline provides a complete solution for narrative extraction, from raw text to queryable knowledge graph, with robust error handling and extensibility.