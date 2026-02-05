# Gemini Structured Output Test Plan

## Goal
Understand exactly how Google's Gemini API handles structured output requests to fix our Zod validation errors.

## Key Questions to Answer

1. **Response Format**
   - Does `responseMimeType: 'application/json'` guarantee valid JSON?
   - How does Gemini handle nested objects and arrays?
   - What happens with optional vs required fields?

2. **Prompt Engineering**
   - What's the most effective way to specify structure?
   - Do JSON schemas in prompts help?
   - Are examples better than schemas?
   - How explicit do we need to be?

3. **Edge Cases**
   - What happens with empty results?
   - How are null/undefined handled?
   - What about type coercion?

## Test Cases

### 1. Basic Structure Tests

```typescript
// Test 1.1: Simple object
prompt: "Return JSON: {name: 'test', value: 123}"
expected: {name: 'test', value: 123}

// Test 1.2: Nested object
prompt: "Return JSON with user.name='Alice' and user.age=30"
expected: {user: {name: 'Alice', age: 30}}

// Test 1.3: Array of primitives
prompt: "Return JSON with numbers: [1,2,3]"
expected: {numbers: [1,2,3]}

// Test 1.4: Array of objects
prompt: "Return JSON with users array containing 2 users with name and age"
expected: {users: [{name: '...', age: ...}, {name: '...', age: ...}]}
```

### 2. Schema Specification Tests

```typescript
// Test 2.1: Inline schema
prompt: "Return data matching: {type: 'object', properties: {id: {type: 'string'}}}"

// Test 2.2: TypeScript interface
prompt: "Return data matching interface User { id: string; name: string; }"

// Test 2.3: Example-based
prompt: "Return data like this example: {id: 'user_1', name: 'Alice'}"

// Test 2.4: Natural language
prompt: "Return a JSON object with string fields 'id' and 'name'"
```

### 3. Extraction Pattern Tests

```typescript
// Test 3.1: Character extraction variations
const prompts = [
  "Extract characters as JSON array",
  "Extract characters as {characters: [...]}",
  "Extract characters as {entities: [...]}",
  "Extract characters with id, name, type fields"
];

// Test 3.2: Required field enforcement
prompt: "Extract with REQUIRED fields: id (string), name (string), type (must be 'character')"

// Test 3.3: Complex extraction
prompt: "Extract scenes with nested events array, each event having id, description, participants"
```

### 4. Error Recovery Tests

```typescript
// Test 4.1: Missing data
prompt: "Extract characters from: 'The room was empty'"

// Test 4.2: Ambiguous request
prompt: "Extract stuff from text"

// Test 4.3: Conflicting instructions
prompt: "Return array but also object"
```

## Running the Tests

1. **Set up environment**
```bash
export GOOGLE_AI_API_KEY="your-key"
npm run gemini-debug
```

2. **Run specific tests**
```bash
npm run gemini-test character "Alice met Bob"
npm run gemini-test scene "Alice entered. Later, Bob arrived."
npm run gemini-test relationship "Alice loves Bob"
```

3. **Analyze results**
```bash
# Check logs
ls -la gemini-debug-logs/
cat gemini-debug-logs/latest.json | jq .
```

## Expected Outcomes

After running these tests, we should know:

1. ✅ The exact JSON format Gemini returns
2. ✅ Which prompt patterns work best
3. ✅ How to handle edge cases
4. ✅ Whether we need pre/post processing
5. ✅ The best way to specify schemas

## Next Steps Based on Results

### If Gemini is returning wrong structure:
1. Adjust prompts to be more explicit
2. Add examples to every prompt
3. Use post-processing to fix structure

### If Gemini is missing fields:
1. Make schema requirements clearer
2. Add validation and defaults
3. Implement retry with clarification

### If Gemini is inconsistent:
1. Lower temperature further
2. Add more constraints to prompt
3. Implement multiple attempts with voting

## Success Metrics

The test plan is successful when:
- 🎯 We can predict Gemini's output format
- 🎯 We have prompts that work 95%+ of the time
- 🎯 We understand all failure modes
- 🎯 We have strategies for each error type