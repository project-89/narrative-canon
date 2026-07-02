> ⚠️ **SUPERSEDED RELIC** — this doc predates the Narrative Studio and describes an earlier system. Do NOT use it for orientation; start at [`AGENTS.md`](./AGENTS.md) (adjust path from docs/: `../AGENTS.md`).

# 🚨 Real LLM Integration Status

## Current State: BROKEN

The library's core functionality - using real LLMs to extract narrative data - is currently **not working reliably**.

## Critical Issues

### 1. Gemini API Timeouts
- Simple 2-sentence stories timeout after 30-60 seconds
- The API calls are hanging indefinitely
- No proper timeout configuration in the Gemini adapter

### 2. Architectural Problems

Looking at the extraction pipeline, it makes **4 parallel API calls**:
```javascript
// From pipeline.ts
const [relationships, stateChanges] = await Promise.all([
    this.relationshipExtractor.extract(text, entities, scenes),
    this.stateChangeExtractor.extract(text, entities, scenes)
]);
```

This is problematic because:
- Each call to Gemini takes 10-30 seconds
- Parallel calls may hit rate limits
- No way to configure sequential processing

### 3. Missing Error Handling

The Gemini adapter doesn't handle:
- Timeout errors properly
- Rate limit responses
- Network failures
- Partial responses

## What Needs to Be Fixed

### 1. Add Timeout Configuration
```typescript
// Need to add to GeminiAdapter
interface GeminiConfig {
  apiKey: string;
  timeout?: number; // Add this
  maxRetries?: number; // Add this
  requestDelay?: number; // Add this for rate limiting
}
```

### 2. Sequential Processing Option
```typescript
// Add to pipeline configuration
interface PipelineConfig {
  parallel?: boolean; // Default true, but allow sequential
  apiDelay?: number; // Delay between API calls
}
```

### 3. Better Error Handling
- Catch and handle timeout errors
- Implement exponential backoff
- Add progress callbacks
- Handle partial extraction failures

### 4. Request Optimization
- Reduce prompt sizes
- Combine some extraction steps
- Cache intermediate results

## Testing Real LLM Integration

To properly test with Gemini:

```javascript
import { NarrativeCanon } from '@narrative/canon';

const canon = new NarrativeCanon({
  llm: 'gemini',
  apiKey: process.env.GEMINI_API_KEY,
  debug: true
});

// Test with increasing complexity
const tests = [
  "Alice met Bob.", // Minimal
  "Alice met Bob in the park. They became friends.", // Simple
  "Alice met Bob in the park. They talked about their dreams. Bob revealed he was a time traveler.", // Medium
];

for (const story of tests) {
  console.time(`Extracting: ${story.substring(0, 20)}...`);
  try {
    const result = await canon.extract(story);
    console.timeEnd(`Extracting: ${story.substring(0, 20)}...`);
    console.log(`Success! Entities: ${result.entities.length}`);
  } catch (error) {
    console.timeEnd(`Extracting: ${story.substring(0, 20)}...`);
    console.error(`Failed: ${error.message}`);
  }
}
```

## Immediate Actions Required

1. **Fix Timeouts**: Add proper timeout handling to GeminiAdapter
2. **Add Sequential Mode**: Allow disabling parallel API calls
3. **Implement Retries**: Add retry logic with exponential backoff
4. **Add Progress Tracking**: Show which extraction phase is running

## Bottom Line

**The library cannot reliably process even simple stories with real LLMs right now.** This is a critical issue that must be fixed before the library can be considered functional.

The Mock LLM should only be used for:
- Unit tests
- Development when the LLM isn't needed
- Quick demos of the Git functionality

But the core value proposition - extracting narrative structure using LLMs - is currently broken.