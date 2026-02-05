# 🎯 Smart JSON Extraction Strategy

## The Problem: JSON Overhead

### ❌ Current Approach (Wasteful JSON)
```json
{
  "scenes": [
    {
      "id": "scene_1",
      "title": "A Long Expected Party",
      "sequence": 1,
      "location": "Bag End, Hobbiton, The Shire",
      "timeframe": "Bilbo's 111th Birthday",
      "characters": ["char_bilbo", "char_gandalf", "char_frodo"],
      "summary": "Bilbo celebrates his eleventy-first birthday...",
      "detailedDescription": "The party is a grand affair with...",
      "keyEvents": [
        {
          "description": "Bilbo gives his speech",
          "participants": ["char_bilbo"],
          "significance": "major"
        }
      ],
      "moodTone": "Festive yet mysterious",
      "narrativePurpose": "Introduces the ring's power..."
    }
  ]
}
```
**Token cost: ~200 tokens per scene = 40,000 tokens for 200 scenes!** ❌

### ✅ Smart Approach (Minimal JSON)
```json
{
  "entities": [
    {"n": "Frodo Baggins", "t": "c"},
    {"n": "The Shire", "t": "l"},
    {"n": "One Ring", "t": "o"}
  ],
  "events": [
    "Bilbo vanishes at party",
    "Frodo inherits ring",
    "Gandalf reveals danger"
  ],
  "rels": [
    ["Frodo", "friend", "Sam"],
    ["Gandalf", "mentors", "Frodo"]
  ]
}
```
**Token cost: ~20 tokens per 10 items = 2,000 tokens for everything!** ✅

## The Solution: Structured but Minimal

### 1. Use JSON for Structure, Not Verbosity

```javascript
// Configure Gemini for minimal JSON
const schema = z.object({
  // Use short keys
  e: z.array(z.object({
    n: z.string(), // name
    t: z.enum(['c', 'l', 'o', 'g']) // character/location/object/group
  })),
  // Events as simple strings
  v: z.array(z.string()),
  // Relations as tuples
  r: z.array(z.tuple([z.string(), z.string(), z.string()]))
});
```

### 2. Strategic Extraction Passes

```javascript
// Pass 1: Entities only (minimal fields)
const entitiesResult = await llm.generateStructuredOutput(
  `Extract all entities from this text as JSON.
   Format: {e: [{n: "name", t: "type"}]}
   Types: c=character, l=location, o=object, g=group`,
  minimalEntitySchema
);

// Pass 2: Events only (just descriptions)
const eventsResult = await llm.generateStructuredOutput(
  `List key events as JSON array of strings.
   Format: {v: ["event 1", "event 2"]}`,
  eventArraySchema  
);

// Pass 3: Relationships (as tuples)
const relsResult = await llm.generateStructuredOutput(
  `List relationships as JSON.
   Format: {r: [["source", "type", "target"]]}`,
  relationTupleSchema
);
```

### 3. Post-Process to Full Structure

```javascript
// Convert minimal JSON to full internal format
function expandMinimalJson(minimal) {
  return {
    entities: minimal.e.map((e, idx) => ({
      id: `${e.t}_${e.n.toLowerCase().replace(/\s+/g, '_')}`,
      name: e.n,
      type: expandType(e.t),
      description: '', // Enrich later if needed
      firstMention: idx
    })),
    
    events: minimal.v.map((event, idx) => ({
      id: `event_${idx}`,
      description: event,
      sequence: idx + 1
    })),
    
    relationships: minimal.r.map(([source, type, target]) => ({
      id: `rel_${source}_${target}`,
      source: findEntityId(source),
      target: findEntityId(target),
      type: type
    }))
  };
}
```

## Optimal JSON Patterns

### Pattern 1: Flat Arrays for Homogeneous Data
```json
{
  "characters": ["Frodo", "Sam", "Gandalf", "Aragorn"],
  "locations": ["Shire", "Rivendell", "Mordor"]
}
```

### Pattern 2: Tuples for Relationships
```json
{
  "relationships": [
    ["Frodo", "carries", "Ring"],
    ["Sam", "serves", "Frodo"],
    ["Gandalf", "guides", "Fellowship"]
  ]
}
```

### Pattern 3: Abbreviated Objects
```json
{
  "entities": [
    {"n": "Frodo", "t": "c", "a": ["Ringbearer", "Mr. Underhill"]}
  ]
}
```

### Pattern 4: Event Strings with Embedded Data
```json
{
  "events": [
    "Frodo|inherits|Ring|Shire",
    "Fellowship|forms|Rivendell",
    "Boromir|dies|Amon Hen"
  ]
}
```

## Implementation Example

```javascript
class SmartJsonExtractor {
  async extractFromBook(bookText) {
    // Use minimal JSON schemas
    const minimalSchemas = {
      entities: z.object({
        e: z.array(z.object({
          n: z.string(),
          t: z.enum(['c', 'l', 'o', 'g'])
        }))
      }),
      
      events: z.object({
        v: z.array(z.string()).max(200) // Limit quantity
      }),
      
      relationships: z.object({
        r: z.array(z.tuple([
          z.string(),
          z.string(), 
          z.string()
        ])).max(500)
      })
    };
    
    // Extract with entire book as context
    const entities = await this.extract(bookText, 'entities', minimalSchemas.entities);
    const events = await this.extract(bookText, 'events', minimalSchemas.events);
    const rels = await this.extract(bookText, 'relationships', minimalSchemas.relationships);
    
    // Expand to full format
    return this.expandResults(entities, events, rels);
  }
}
```

## Token Savings Comparison

### Scene Extraction
- **Verbose JSON**: ~200 tokens per scene
- **Minimal JSON**: ~10 tokens per scene
- **Savings**: 95%

### Entity Extraction  
- **Verbose JSON**: ~50 tokens per entity
- **Minimal JSON**: ~5 tokens per entity
- **Savings**: 90%

### For LOTR (Estimated)
- **Verbose approach**: 40,000+ tokens (exceeds limit!)
- **Minimal approach**: 4,000 tokens (fits easily!)

## Best Practices

1. **Use single-letter keys for high-frequency fields**
   ```json
   {"n": "name", "t": "type", "d": "description"}
   ```

2. **Prefer arrays over objects when possible**
   ```json
   // Not this
   {"source": "Frodo", "type": "carries", "target": "Ring"}
   
   // This
   ["Frodo", "carries", "Ring"]
   ```

3. **Embed data in strings for events**
   ```json
   "CharacterName|Action|Location|Time"
   ```

4. **Set explicit limits in schema**
   ```javascript
   z.array(z.string()).max(200) // Prevent runaway extraction
   ```

5. **Use post-processing to enrich**
   ```javascript
   // Get minimal data first
   const minimal = await extract(book);
   
   // Then enrich specific items if needed
   const enriched = await enrichSelected(minimal.mainCharacters);
   ```

## Conclusion

**YES, we still use JSON!** But we use it intelligently:
- Minimal schemas that pack maximum information
- Strategic extraction in multiple passes
- Post-processing to expand to full format
- Stay within the 8,192 token output limit

This gives us the best of both worlds: structured data that Zod can validate, but efficient enough to process entire books at once.