# Narrative Canon Deduplication

The narrative-canon library now supports incremental extraction that avoids creating duplicate entities and relationships. This is crucial for building up a narrative knowledge graph over time without redundancy.

## How It Works

### Entity Deduplication

When extracting entities incrementally, the system:

1. **Passes existing entities to the LLM** - The prompt includes a list of already-known entities
2. **LLM avoids duplicates** - The LLM is instructed not to create new entries for existing entities
3. **Post-processing filter** - As a safety measure, extracted entities are filtered to remove any that match existing ones by:
   - ID match
   - Name match (case-insensitive)
   - Alias match (any alias of new entity matches name/alias of existing entity)

### Relationship Deduplication

Similarly for relationships:

1. **Existing relationships included in prompt** - The LLM sees what relationships already exist
2. **LLM instruction** - Explicitly told not to duplicate existing relationships
3. **Post-processing** - Filters out relationships with same source, target, and type

## API Usage

### Basic Incremental Extraction

```typescript
import { NarrativePipeline, GeminiAdapter } from '@narrative/canon';

const llm = new GeminiAdapter(apiKey);
const pipeline = new NarrativePipeline(llm);

// First extraction
const text1 = "Agent Chen infiltrates Oneirocom's data hub in Neo-Tokyo.";
const structure1 = await pipeline.extractNarrative(text1);

// Incremental extraction - won't duplicate Agent Chen, Oneirocom, or Neo-Tokyo
const text2 = "Chen discovers Oneirocom's plans for Timeline-Prime in the data hub.";
const structure2 = await pipeline.extractNarrativeIncremental(text2, structure1);

// structure2 now contains all entities/relationships from both texts without duplicates
```

### Manual Control with ExistingData

```typescript
// You can also manually specify what existing data to consider
const existingData: ExistingNarrativeData = {
  entities: structure1.entities,
  relationships: structure1.relationships,
  scenes: structure1.scenes,
  stateChanges: structure1.stateChanges
};

const structure2 = await pipeline.extractNarrative(text2, existingData);
```

### Entity Extractor Direct Usage

```typescript
import { EntityExtractor, GeminiAdapter } from '@narrative/canon';

const llm = new GeminiAdapter(apiKey);
const extractor = new EntityExtractor(llm);

// Extract with existing entities
const existingEntities = [
  { id: 'char_chen', name: 'Agent Chen', type: 'character' },
  { id: 'org_oneirocom', name: 'Oneirocom Corporation', type: 'organization' }
];

const newEntities = await extractor.extractEntities(text, existingEntities);
// Returns only truly new entities
```

## Example: Building a Story Incrementally

```typescript
// Initialize
const pipeline = new NarrativePipeline(llm);
let narrative = await pipeline.extractNarrative("");

// Chapter 1
const chapter1 = "Agent Chen works for Project 89...";
narrative = await pipeline.extractNarrativeIncremental(chapter1, narrative);
console.log(`After Ch1: ${narrative.entities.length} entities`);

// Chapter 2 - mentions Chen again, won't duplicate
const chapter2 = "Chen reports to Commander Silva...";  
narrative = await pipeline.extractNarrativeIncremental(chapter2, narrative);
console.log(`After Ch2: ${narrative.entities.length} entities`);
// Chen is still only counted once!
```

## Integration with Storage

When using MongoDB storage, you can load existing narrative data and continue building:

```typescript
const storage = new MongoNarrativeAdapter(mongoUri);
await storage.connect();

// Load existing narrative
const existing = await storage.loadNarrative('my-story-id');

// Add new chapter
const newChapter = "...";
const updated = await pipeline.extractNarrativeIncremental(newChapter, existing);

// Save back
await storage.saveNarrative(updated, { storyId: 'my-story-id' });
```

## Performance Benefits

1. **Reduced LLM calls** - No need to re-extract known entities
2. **Smaller prompts** - Only process new content
3. **Consistent IDs** - Entities maintain stable IDs across extractions
4. **Clean knowledge graph** - No duplicate nodes or edges

## Testing Deduplication

Run the deduplication tests:

```bash
npm test deduplication
```

Run the interactive demos:

```bash
# Simple deduplication demo
npx dotenv -e .env -- tsx examples/deduplication-demo.ts

# Timeline Warfare with incremental narrative building  
npx dotenv -e .env -- tsx examples/timeline-warfare-incremental.ts
```

## Best Practices

1. **Always use incremental extraction** when adding to existing narratives
2. **Maintain entity ID stability** - Don't change IDs between extractions
3. **Use consistent naming** - The same entity should have the same primary name
4. **Leverage aliases** - Add variations as aliases rather than new entities
5. **Review extracted data** - Occasionally audit for any duplicates that slipped through

## Troubleshooting

If you see duplicates:

1. Check that existing entities are being passed correctly
2. Ensure entity names are consistent (e.g., "Agent Chen" vs "Chen")
3. Verify the LLM is receiving the deduplication instructions
4. Look for subtle variations (e.g., "Neo-Tokyo" vs "Neo Tokyo")

The deduplication system is designed to be robust while maintaining narrative coherence and preventing knowledge graph pollution.