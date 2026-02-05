# Testing Guide for MongoDB Narrative Adapter

This guide covers testing the MongoDB integration for the narrative-canon library.

## Test Structure

### Test Categories

1. **Unit Tests** (`*.test.ts`)
   - Test individual components in isolation
   - Mock external dependencies
   - Fast execution

2. **Integration Tests** (`integration/*.test.ts`)
   - Test complete workflows end-to-end
   - Use real MongoDB instances (in-memory)
   - Test cross-component interactions

3. **MongoDB-Specific Tests** (`*mongodb*.test.ts`)
   - Test database operations
   - Schema validation
   - Query performance

## Prerequisites

### Install Dependencies

```bash
cd experiments/narrative-extraction/narrative-canon
npm install
```

This will install:
- `mongoose` - MongoDB ODM
- `mongodb-memory-server` - In-memory MongoDB for testing
- `jest` and `ts-jest` - Testing framework

### Environment Setup

No external MongoDB instance required! Tests use MongoDB Memory Server for isolation.

## Running Tests

### All Tests
```bash
npm test
```

### Specific Test Categories
```bash
# Unit tests only (excludes integration)
npm run test:unit

# MongoDB-specific tests only
npm run test:mongo

# Integration tests only
npm run test:integration

# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage
```

### Individual Test Files
```bash
# MongoDB adapter tests
npm test -- --testPathPattern=mongodb-adapter.test.ts

# Service layer tests
npm test -- --testPathPattern=mongodb-narrative-service.test.ts

# End-to-end integration tests
npm test -- --testPathPattern=mongodb-integration.test.ts
```

## Test Coverage

### MongoDB Adapter Tests (`mongodb-adapter.test.ts`)

**Document Operations:**
- ✅ Save and retrieve narrative documents
- ✅ Save entities with correct references
- ✅ Save relationships with entity references
- ✅ Save scenes with events
- ✅ Transaction rollback on errors

**Query Operations:**
- ✅ Get entities by type with pagination
- ✅ Filter by canonical status
- ✅ Filter by source type
- ✅ Get entity relationships
- ✅ Get document scenes in sequence order

**Consistency Operations:**
- ✅ Update consistency scores
- ✅ Flag conflicts
- ✅ Prevent duplicate flags

**Integration Operations:**
- ✅ Link to lore fragments
- ✅ Link to timeline events
- ✅ Link to missions
- ✅ Prevent duplicate links

**Error Handling:**
- ✅ Invalid entity IDs
- ✅ Connection errors
- ✅ Schema validation
- ✅ Enum enforcement
- ✅ Range validation

**Performance:**
- ✅ Index verification
- ✅ Query optimization

### Service Layer Tests (`mongodb-narrative-service.test.ts`)

**Core Operations:**
- ✅ Extract narrative and save to MongoDB
- ✅ Handle different source types
- ✅ Calculate consistency scores
- ✅ Error handling in extraction

**Entity Management:**
- ✅ Get entities with pagination and filtering
- ✅ Filter by canonical status, source type, consistency
- ✅ Entity graph retrieval with relationships

**Proxim8 Integration:**
- ✅ Process lore fragments
- ✅ Link entities to lore and missions
- ✅ Process mission outcomes
- ✅ Update consistency based on mission success/failure

**Consistency Validation:**
- ✅ Narrative consistency validation
- ✅ Conflict detection
- ✅ Recommendations generation

**Advanced Features:**
- ✅ Consistency scoring algorithms
- ✅ Memory management for large datasets
- ✅ Service lifecycle management

### Integration Tests (`mongodb-integration.test.ts`)

**End-to-End Workflows:**
- ✅ Complete narrative processing pipeline
- ✅ Timeline progression across multiple missions
- ✅ Concurrent operation handling
- ✅ Referential integrity maintenance

**Performance & Scalability:**
- ✅ Large narrative extraction efficiency
- ✅ Query performance with large datasets
- ✅ Memory usage optimization

**Error Recovery:**
- ✅ Partial extraction failure handling
- ✅ Database error consistency
- ✅ Connection failure recovery

**Data Management:**
- ✅ Version handling across extractions
- ✅ Document updates and versioning
- ✅ Cross-collection consistency

## Performance Benchmarks

### Target Performance Metrics

- **Small narrative (< 500 words)**: < 5 seconds extraction
- **Medium narrative (500-2000 words)**: < 15 seconds extraction
- **Large narrative (2000+ words)**: < 30 seconds extraction
- **Entity queries**: < 2 seconds with pagination
- **Relationship graph queries**: < 5 seconds (depth ≤ 3)

### Memory Usage

- **MongoDB Memory Server**: ~50MB per test suite
- **Test execution**: < 200MB peak memory usage
- **Concurrent tests**: Limited to 1 worker to prevent conflicts

## Common Test Patterns

### Testing with Mock Data

```typescript
const mockNarrative: NarrativeStructure = {
  entities: [
    {
      id: 'test_char',
      name: 'Test Character',
      type: 'character',
      description: 'A test character'
    }
  ],
  relationships: [],
  scenes: []
};

await adapter.saveNarrativeDocument(
  'test_doc',
  'Test Document',
  'Content...',
  mockNarrative,
  {
    extractionVersion: '1.0.0',
    llmModel: 'MockLLM',
    sourceType: 'manual'
  }
);
```

### Testing Error Conditions

```typescript
// Test connection failures
await connection.close();
await expect(
  adapter.getEntitiesByType('character')
).rejects.toThrow();

// Test validation failures
const invalidEntity = new adapter.EntityModel({
  type: 'invalid_type' // Wrong enum value
});
await expect(invalidEntity.save()).rejects.toThrow();
```

### Testing Consistency

```typescript
// Create test data
await service.extractAndSave(content, metadata);

// Verify consistency
const validation = await service.validateNarrativeConsistency(entityId);
expect(validation.consistencyScore).toBeGreaterThan(50);
```

## Debugging Tests

### Verbose Output
```bash
npm test -- --verbose
```

### Specific Test Focus
```bash
npm test -- --testNamePattern="should save and retrieve"
```

### Debug Mode
```bash
npm test -- --detectOpenHandles --forceExit
```

### Common Issues

1. **MongoDB Connection Timeouts**
   - Solution: Increase `testTimeout` in Jest config
   - Check: Ensure MongoDB Memory Server starts correctly

2. **Memory Leaks**
   - Solution: Ensure all connections are closed in `afterAll`
   - Check: Use `--detectOpenHandles` to find leaked resources

3. **Test Isolation**
   - Solution: Clear collections in `beforeEach`
   - Check: Verify test data doesn't leak between tests

4. **Flaky Tests**
   - Solution: Use `maxWorkers: 1` for MongoDB tests
   - Check: Ensure proper async/await usage

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test MongoDB Integration
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
    - run: npm ci
    - run: npm run test:mongo
    - run: npm run test:integration
```

### Docker Testing

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm test
```

## Adding New Tests

### Test File Structure

```typescript
describe('New Feature', () => {
  let mongoServer: MongoMemoryServer;
  let connection: Connection;
  let service: MongoNarrativeService;

  beforeAll(async () => {
    // Setup MongoDB and service
  });

  afterAll(async () => {
    // Cleanup connections
  });

  beforeEach(async () => {
    // Clear test data
  });

  describe('Feature Category', () => {
    test('should do something specific', async () => {
      // Test implementation
    });
  });
});
```

### Best Practices

1. **Descriptive Test Names**: Use "should [expected behavior] when [condition]"
2. **Single Responsibility**: One assertion per test when possible
3. **Test Data Isolation**: Don't depend on other tests' data
4. **Async/Await**: Always use proper async handling
5. **Error Testing**: Test both success and failure cases
6. **Performance Awareness**: Keep tests under timeout limits

## Monitoring Test Health

### Coverage Goals
- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 85%
- **Lines**: > 80%

### Key Metrics to Track
- Test execution time trends
- Memory usage during tests
- Coverage percentage over time
- Flaky test frequency

This comprehensive test suite ensures the MongoDB adapter is production-ready and maintains data integrity across all operations.