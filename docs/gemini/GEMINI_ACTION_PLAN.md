# Gemini Integration Action Plan

## Key Discovery

The main issue is that we've been using only `responseMimeType: 'application/json'` when we should be using the `responseSchema` parameter for true structured output.

## Immediate Actions

### 1. Update Gemini Adapter (Priority: HIGH)

Replace the current approach with proper responseSchema usage:

```typescript
const model = this.genAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: {
      type: SchemaType.OBJECT,
      properties: {
        entities: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              id: { type: SchemaType.STRING },
              name: { type: SchemaType.STRING },
              type: { type: SchemaType.STRING }
            },
            required: ['id', 'name', 'type']
          }
        }
      },
      required: ['entities']
    }
  }
});
```

### 2. Test Each Extractor (Priority: HIGH)

Run comprehensive tests with the new adapter:

```bash
# Test character extraction
npm run gemini-proper

# Debug specific issues
npm run gemini-debug

# Test with real game
GOOGLE_AI_API_KEY=your-key node timeline-warfare-simple.js
```

### 3. Update All Extractors (Priority: HIGH)

Modify each extractor to:
- Use simpler, clearer prompts (schema handles structure)
- Remove redundant JSON instructions from prompts
- Focus on extraction logic, not format

### 4. Error Handling Strategy (Priority: MEDIUM)

Implement robust error handling:

```typescript
class GeminiResponseValidator {
  static preValidate(response: any, expectedSchema: z.ZodSchema): any {
    // Log raw response
    console.log('Raw response:', JSON.stringify(response));
    
    // Check for common issues
    if (!response) {
      throw new Error('Empty response from Gemini');
    }
    
    // Add missing defaults
    if (Array.isArray(response) && !response.length) {
      return { entities: [] }; // or appropriate wrapper
    }
    
    return response;
  }
}
```

### 5. Prompt Optimization (Priority: MEDIUM)

Simplify prompts since responseSchema handles structure:

**Before:**
```
Extract characters and return as JSON with structure {entities: [{id, name, type}]}
MUST include id, name, type fields...
```

**After:**
```
Extract all characters from this text.
```

## Implementation Steps

### Day 1: Core Fix
1. [ ] Implement GeminiProperAdapter with responseSchema
2. [ ] Test with simple schemas
3. [ ] Verify JSON Schema generation from Zod works correctly

### Day 2: Extractor Updates
1. [ ] Update CharacterExtractor to use new adapter
2. [ ] Update SceneExtractor
3. [ ] Update RelationshipExtractor
4. [ ] Update StateChangeExtractor

### Day 3: Testing
1. [ ] Create test suite with 20+ test cases per extractor
2. [ ] Test edge cases (empty text, no entities, etc.)
3. [ ] Measure success rate
4. [ ] Document any remaining issues

### Day 4: Integration
1. [ ] Update NarrativePipeline to use new adapter
2. [ ] Test full pipeline with various texts
3. [ ] Update Timeline Warfare game
4. [ ] Run end-to-end tests

### Day 5: Polish
1. [ ] Add comprehensive error messages
2. [ ] Create troubleshooting guide
3. [ ] Update documentation
4. [ ] Create migration guide

## Success Metrics

- [ ] Zero Zod validation errors in normal operation
- [ ] 95%+ success rate on structured extraction
- [ ] Clear error messages when failures occur
- [ ] Game runs smoothly with Gemini API
- [ ] All tests passing

## Known Limitations

Based on documentation:
- responseSchema requires Gemini 1.5 Pro or Flash
- Complex schemas may hit token limits
- Overly complex schemas can cause 400 errors
- All fields are optional by default (need explicit required)

## Next Steps

1. Start with `npm run gemini-proper` to test the new approach
2. If successful, migrate all extractors
3. Update documentation with learnings
4. Consider creating a schema library for common patterns

## Resources

- [Official Structured Output Docs](https://ai.google.dev/gemini-api/docs/structured-output)
- [JSON Mode Guide](https://ai.google.dev/gemini-api/docs/json-mode)
- [@google/generative-ai SDK](https://www.npmjs.com/package/@google/generative-ai)

This approach should completely solve our Zod validation issues by ensuring Gemini returns exactly the structure we expect!