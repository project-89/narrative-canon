# 📚 Chunking Strategy for Large Narratives

## Overview

Processing large works like **Lord of the Rings** (~470,000 words) requires intelligent chunking to handle API limits, processing time, and memory constraints while maintaining narrative coherence.

## Current Status

✅ **Implemented**: `ChunkedExtractionPipeline` - Full chunking system with:
- Chapter/paragraph/sentence boundary detection
- Configurable chunk sizes and overlap
- Incremental extraction for entity coherence
- Final entity deduplication pass
- Progress tracking with callbacks

**Usage:**
```typescript
import { ChunkedExtractionPipeline, GeminiAdapter } from '@narrative/canon';

const llm = new GeminiAdapter({ apiKey: process.env.GEMINI_API_KEY });
const pipeline = new ChunkedExtractionPipeline(llm, {
  maxChunkSize: 8000,
  overlapSize: 500,
  respectChapters: true,
  onProgress: (p) => console.log(`${p.percentComplete.toFixed(1)}% complete`)
});

const result = await pipeline.extractFromBook(bookText);
console.log(`Found ${result.structure.entities.length} entities in ${result.structure.scenes.length} scenes`);
```

## Chunking Strategies by Size

### 1. Small Stories (< 5,000 words)
- **Strategy**: Single pass processing
- **Time**: ~20 seconds
- **Example**: Short stories, single chapters

### 2. Medium Stories (5,000 - 20,000 words)
- **Strategy**: Chapter-based chunking
- **Chunk Size**: 8,000 characters (~1,200 words)
- **Overlap**: 1,000 characters
- **Time**: ~3-5 minutes

### 3. Large Novels (20,000 - 100,000 words)
- **Strategy**: Hierarchical chunking with batching
- **Chunk Size**: 6,000 characters (~900 words)
- **Overlap**: 1,500 characters
- **Batch Size**: 3 chunks at a time
- **Time**: ~15-30 minutes

### 4. Epic Novels (100,000+ words)
- **Strategy**: Book-by-book processing
- **Approach**: Detect major sections, process separately, then merge
- **Time**: 1-3 hours for Lord of the Rings

## Lord of the Rings Processing Plan

### Phase 1: Pre-processing
```
1. Split into major sections:
   - The Fellowship of the Ring
   - The Two Towers  
   - The Return of the King
   - Appendices (optional)

2. Detect chapters within each book
3. Create chunk hierarchy
```

### Phase 2: Entity Extraction Strategy
```
Book 1: Fellowship
├── Prologue + Ch 1-4: Hobbiton chunks
├── Ch 5-8: Journey to Rivendell  
├── Ch 9-12: Council and departure
└── Merge entities across chunks

Book 2: Two Towers
├── Continue with existing entities
├── Add new characters (Rohan, Gondor)
└── Track entity relationships

Book 3: Return of the King
├── Final character arcs
├── Resolution tracking
└── Complete entity graph
```

### Phase 3: Processing Configuration
```javascript
const LOTR_CONFIG = {
  chunkSize: 5000,          // ~750 words per chunk
  overlap: 2000,            // Large overlap for continuity
  batchSize: 2,             // Process 2 chunks at a time
  timeout: 60000,           // 60 seconds per API call
  retries: 3,               // Retry failed chunks
  progressSaving: true,     // Save after each book
  fastMode: true           // Use Gemini Flash
};
```

## Implementation Details

### Chunk Boundary Detection
```javascript
function findGoodBreakPoint(text, position) {
  // Prefer chapter breaks
  const chapterBreak = text.lastIndexOf('Chapter', position);
  if (chapterBreak > position * 0.8) return chapterBreak;
  
  // Then paragraph breaks
  const paragraphBreak = text.lastIndexOf('\n\n', position);
  if (paragraphBreak > position * 0.8) return paragraphBreak;
  
  // Finally sentence breaks
  const sentenceEnd = text.lastIndexOf('. ', position);
  return sentenceEnd > position * 0.7 ? sentenceEnd : position;
}
```

### Entity Deduplication Across Chunks
```javascript
class EntityMerger {
  mergeEntities(chunk1Entities, chunk2Entities) {
    // 1. Exact name matches
    // 2. Alias matching  
    // 3. Description similarity
    // 4. Context-based matching
    return mergedEntities;
  }
}
```

### Progress Tracking
```javascript
const progress = {
  totalChunks: 150,
  processedChunks: 0,
  currentBook: "Fellowship",
  entitiesFound: 0,
  scenesExtracted: 0,
  estimatedTimeRemaining: "45 minutes"
};
```

## Expected Results for Lord of the Rings

### Entities (~200-300)
- **Characters**: ~150 (Frodo, Gandalf, Aragorn, etc.)
- **Locations**: ~100 (Shire, Rivendell, Mordor, etc.)
- **Organizations**: ~20 (Fellowship, Rangers, etc.)
- **Objects**: ~30 (One Ring, Sting, Anduril, etc.)

### Scenes (~200-400)
- **Fellowship**: ~80 scenes
- **Two Towers**: ~100 scenes  
- **Return of the King**: ~120 scenes

### Relationships (~500-1000)
- Character relationships
- Location connections
- Object ownership
- Group memberships

### Processing Time
- **Estimated**: 2-3 hours total
- **Entity extraction**: ~45 minutes
- **Scene detection**: ~60 minutes
- **Relationship mapping**: ~45 minutes
- **Final assembly**: ~15 minutes

## Optimization Strategies

### 1. Parallel Processing
```javascript
// Process multiple books simultaneously
const books = ['fellowship', 'towers', 'king'];
const bookPromises = books.map(book => processBook(book));
const results = await Promise.all(bookPromises);
```

### 2. Smart Caching
```javascript
// Cache entity extractions to avoid reprocessing
const entityCache = new Map();
if (entityCache.has(chunkHash)) {
  return entityCache.get(chunkHash);
}
```

### 3. Incremental Processing
```javascript
// Resume from last successful chunk
const checkpoint = loadCheckpoint();
const remainingChunks = allChunks.slice(checkpoint.lastProcessed);
```

## API Usage Estimates

### For Lord of the Rings (~470,000 words)
- **Chunks**: ~150 chunks of 900 words each
- **API Calls**: ~600 calls (4 per chunk)
- **Tokens**: ~300,000 tokens total
- **Cost**: ~$15-30 depending on model

### Rate Limiting Strategy
```javascript
const rateLimiter = {
  callsPerMinute: 10,
  delay: 6000, // 6 seconds between calls
  batchDelay: 30000 // 30 seconds between batches
};
```

## Error Handling

### Chunk Failure Recovery
```javascript
async function processChunkWithRetry(chunk, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await processChunk(chunk);
    } catch (error) {
      if (attempt === maxRetries) {
        // Skip this chunk and continue
        console.warn(`Skipping chunk ${chunk.id} after ${maxRetries} failures`);
        return getEmptyChunkResult();
      }
      // Exponential backoff
      await sleep(1000 * Math.pow(2, attempt));
    }
  }
}
```

## Command Line Usage

```bash
# Process Lord of the Rings
node examples/process-large-story.js ./books/lotr-complete.txt ./output/lotr/

# Process with custom settings
GEMINI_FAST_MODE=true \
CHUNK_SIZE=5000 \
TIMEOUT=60000 \
node examples/process-large-story.js ./books/lotr.txt ./output/

# Resume from checkpoint
node examples/process-large-story.js --resume ./output/lotr/checkpoint.json
```

## Future Improvements

1. **GPU Acceleration**: Use local models for basic extraction
2. **Distributed Processing**: Split across multiple API keys
3. **Smart Chunking**: ML-based optimal chunk boundary detection
4. **Interactive Mode**: Human oversight for difficult passages
5. **Format-Aware**: Handle different text formats (PDF, EPUB, etc.)

## Conclusion

Processing epic novels like Lord of the Rings is **absolutely feasible** with proper chunking strategies. The key is:

1. **Small enough chunks** to avoid timeouts (~900 words)
2. **Sufficient overlap** to maintain context
3. **Robust error handling** for failed chunks
4. **Progressive saving** to avoid losing work
5. **Entity deduplication** across chunks

**Estimated processing time for LOTR: 2-3 hours**  
**Expected quality: High fidelity narrative extraction with complete character arcs, location mapping, and relationship tracking**