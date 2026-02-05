# Gemini Integration Fix Roadmap

## Problem Analysis

The core issue is that we're not properly communicating our schema requirements to Gemini. The Zod errors indicate that Gemini is returning data that doesn't match our expected structure, which means either:

1. Our prompts aren't clear enough
2. We're not using Gemini's structured output features correctly
3. There's a mismatch between what we think Gemini can do and what it actually does

## Current Errors

1. **Missing Required Fields**: Gemini returns objects without required fields like `id`, `type`
2. **Wrong Structure**: Returns data at wrong nesting level (e.g., characters instead of {characters: [...]})
3. **Type Mismatches**: Returns wrong types for fields
4. **Missing Arrays**: Returns undefined instead of empty arrays

## Knowledge Gap Areas

### 1. Gemini API Structured Output
- How does `responseMimeType: "application/json"` actually work?
- What's the best way to specify schema requirements to Gemini?
- Should we use function calling instead of JSON mode?
- How to handle nested objects and arrays properly?

### 2. Prompt Engineering for Structured Data
- How explicit do we need to be about JSON structure?
- Should we provide full examples or just schema?
- How to ensure Gemini understands required vs optional fields?

### 3. Schema Validation Strategy
- Should we use more lenient schemas with .optional() everywhere?
- How to handle graceful degradation when fields are missing?
- Should we post-process Gemini responses before Zod validation?

## Detailed Fix Roadmap

### Phase 1: Research & Understanding (Day 1)

#### 1.1 Study Gemini Documentation
- [ ] Read official Gemini structured output docs
- [ ] Find examples of complex schema usage
- [ ] Understand function calling vs JSON mode
- [ ] Learn about prompt techniques for structured data

#### 1.2 Analyze Successful Patterns
- [ ] Find working examples of Gemini + Zod
- [ ] Study how other projects handle this
- [ ] Identify best practices

### Phase 2: Testing Infrastructure (Day 2)

#### 2.1 Create Gemini Test Suite
```typescript
// src/llm/gemini-test-suite.ts
interface TestCase {
  name: string;
  prompt: string;
  schema: z.ZodSchema;
  expectedFields: string[];
  validate: (result: any) => boolean;
}

class GeminiTestSuite {
  async runAllTests(apiKey: string): Promise<TestReport> {
    // Test each extractor type
    // Test edge cases
    // Test error scenarios
  }
}
```

#### 2.2 Build Schema Test Cases
- [ ] Simple object schema
- [ ] Array of objects
- [ ] Nested objects
- [ ] Optional vs required fields
- [ ] Union types
- [ ] Enum types

### Phase 3: Fix Schema Generation (Day 3-4)

#### 3.1 Experiment with Different Approaches

**Option A: Explicit JSON Schema**
```typescript
const jsonSchema = {
  type: "object",
  properties: {
    entities: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "name", "type"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          type: { type: "string", enum: ["character", "location", ...] }
        }
      }
    }
  },
  required: ["entities"]
};
```

**Option B: TypeScript Interface Style**
```typescript
interface EntityResponse {
  entities: Array<{
    id: string;      // REQUIRED
    name: string;    // REQUIRED  
    type: string;    // REQUIRED
  }>;
}
```

**Option C: Example-Driven**
```typescript
const example = {
  entities: [
    { id: "char_1", name: "Alice", type: "character" },
    { id: "loc_1", name: "Tokyo", type: "location" }
  ]
};
```

#### 3.2 Implement Best Approach
- [ ] Update GeminiAdapter with chosen method
- [ ] Add detailed logging of what we send to Gemini
- [ ] Implement response validation before Zod

### Phase 4: Prompt Engineering (Day 5)

#### 4.1 Optimize Prompts for Each Extractor

**Character Extractor**
```typescript
const TESTED_PROMPT = `
You are a narrative analysis system. Extract all characters from the text.

CRITICAL: You MUST return a JSON object with this EXACT structure:
{
  "entities": [
    {
      "id": "unique_identifier",
      "name": "character name",
      "type": "character"
    }
  ]
}

Rules:
1. ALWAYS include "entities" as the top-level key
2. ALWAYS provide id, name, and type for each character
3. id format: "char_" + lowercase name with underscores
4. type must be exactly "character"

Text: [TEXT]
`;
```

#### 4.2 Test Each Prompt
- [ ] Run 10+ test cases per extractor
- [ ] Measure success rate
- [ ] Identify failure patterns
- [ ] Iterate on prompt design

### Phase 5: Error Handling & Recovery (Day 6)

#### 5.1 Pre-Validation Layer
```typescript
class GeminiResponseValidator {
  static validateAndFix(response: any, expectedSchema: z.ZodSchema): any {
    // Check structure
    // Add missing required fields with defaults
    // Fix type mismatches
    // Log all fixes for debugging
  }
}
```

#### 5.2 Graceful Degradation
- [ ] Implement fallback values for missing fields
- [ ] Add retry logic with rephrased prompts
- [ ] Create diagnostic mode that shows what went wrong

### Phase 6: Integration Testing (Day 7)

#### 6.1 Full Pipeline Tests
- [ ] Test complete extraction pipeline with real texts
- [ ] Test with various narrative styles
- [ ] Test edge cases (empty text, single sentence, etc.)
- [ ] Measure accuracy and completeness

#### 6.2 Performance Optimization
- [ ] Implement caching for repeated extractions
- [ ] Optimize prompt length
- [ ] Test token usage and costs

## Implementation Checklist

### Immediate Actions
1. [ ] Create `gemini-experiments/` folder for testing
2. [ ] Set up test runner with real API key
3. [ ] Create minimal test case that reproduces the error
4. [ ] Log raw Gemini responses to understand what we're getting

### Core Fixes
1. [ ] Fix schema instruction generation
2. [ ] Update all prompts to be more explicit
3. [ ] Add response validation layer
4. [ ] Implement proper error handling

### Testing
1. [ ] Unit tests for each extractor with real API
2. [ ] Integration tests for full pipeline
3. [ ] Edge case handling
4. [ ] Performance benchmarks

### Documentation
1. [ ] Document what works and what doesn't
2. [ ] Create prompt engineering guide
3. [ ] Add troubleshooting section
4. [ ] Include example responses

## Success Criteria

The fix is complete when:
1. ✅ 95%+ success rate on structured output extraction
2. ✅ No Zod validation errors in normal operation  
3. ✅ Clear error messages when things go wrong
4. ✅ Graceful fallbacks for edge cases
5. ✅ Comprehensive test coverage
6. ✅ Documentation of all learnings

## Next Steps

1. Start with Phase 1 - understand what Gemini actually expects
2. Create simple test harness to experiment quickly
3. Focus on one extractor at a time (start with CharacterExtractor)
4. Build up knowledge base of what works
5. Apply learnings to all extractors

This is not just about fixing bugs - it's about deeply understanding how to use LLMs for structured data extraction effectively.