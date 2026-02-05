# Action Plan: Clean Up and Finalize Narrative Canon

## Current State Assessment

### What's Working
1. **Core Pipeline**: Basic extraction pipeline with mock LLM works
2. **Gemini Integration**: `gemini-proper.ts` with responseSchema approach (needs real API testing)
3. **Bundler**: esbuild configuration creates working bundles
4. **Tests**: Integration tests pass with mock adapter
5. **Game**: Timeline warfare concept proven (needs LLM integration)

### What's Not Working
1. **Gemini Tests**: Failing due to mock responses not matching schemas
2. **Multiple Implementations**: 6+ versions of Gemini adapter causing confusion
3. **Messy Root**: 50+ files in root directory
4. **No Clear API**: Missing clean public interface
5. **Documentation**: Scattered across multiple files

## Immediate Actions (2-3 hours)

### 1. Clean Up LLM Adapters (30 min)
```bash
# Keep only the best implementation
mv src/llm/gemini-proper.ts src/llm/gemini.ts

# Archive others
mkdir archive/llm-experiments
mv src/llm/gemini-*.ts archive/llm-experiments/
```

### 2. Fix Failing Tests (45 min)
- Update mock adapter to return properly structured data
- Ensure all test schemas match actual usage
- Skip Gemini-specific tests that need real API

### 3. Clean Root Directory (30 min)
```bash
# Create proper structure
mkdir -p examples/games
mkdir -p examples/samples
mkdir -p tests/integration
mkdir -p archive/experiments

# Move files
mv timeline-warfare-*.js examples/games/
mv test-*.js archive/experiments/
mv sample*.txt examples/samples/
```

### 4. Create Clean Public API (45 min)

Create `src/index.ts`:
```typescript
export { NarrativeCanon } from './narrative-canon';
export { extractNarrative } from './extract';
export { buildGraph } from './graph/builder';
export { createVisualization } from './visualization/html';
export * from './types';
```

Create `src/narrative-canon.ts`:
```typescript
export class NarrativeCanon {
  constructor(config: NarrativeConfig) { }
  
  async extract(text: string): Promise<NarrativeData> { }
  async visualize(outputPath: string): Promise<void> { }
  query(): QueryEngine { }
}
```

## Next Phase Actions (3-4 hours)

### 5. Consolidate Extractors
- Merge enhanced versions into main extractors
- Remove duplicate implementations
- Ensure consistent interfaces

### 6. Update Documentation
- Single README.md with clear usage
- API.md with complete reference
- EXAMPLES.md with working code

### 7. Create Working Examples
```
examples/
├── basic-extraction.js      # Simple character/scene extraction
├── full-pipeline.js         # Complete extraction + visualization
├── with-gemini.js          # Using Gemini API
├── games/
│   └── timeline-warfare.js  # Playable game
└── samples/
    └── sample-narratives/   # Test texts
```

### 8. Set Up Proper Testing
- Unit tests for each component
- Integration tests for full pipeline
- E2E test with real narrative
- Performance benchmarks

## Final Phase (2 hours)

### 9. Package for Distribution
- Update package.json with proper exports
- Set up npm publishing configuration
- Create GitHub release workflow
- Add badges to README

### 10. Create Demo Site
- Host interactive demo
- Show extraction examples
- Link to documentation
- Include Timeline Warfare game

## Success Criteria

✅ **Clean Structure**: No files in root except config/docs
✅ **Working Tests**: All tests pass (mock and real)
✅ **Simple API**: `const canon = new NarrativeCanon(); await canon.extract(text);`
✅ **Documentation**: Clear README, API docs, examples
✅ **Playable Game**: Timeline Warfare using real extraction
✅ **npm Ready**: Can be installed and used as dependency

## Commands to Run

### Phase 1: Clean Up (Do First!)
```bash
# 1. Create archive
mkdir -p archive/2024-11-cleanup
cp -r . archive/2024-11-cleanup/

# 2. Clean up files
mkdir -p examples/games examples/samples tests/fixtures
mv timeline-warfare-*.js examples/games/
mv test-*.js test-*.ts archive/
mv sample*.txt examples/samples/

# 3. Consolidate LLM adapters
mv src/llm/gemini-proper.ts src/llm/gemini.ts
rm src/llm/gemini-*.ts

# 4. Run tests
npm test
```

### Phase 2: Build Clean API
```bash
# Create main entry point
npm run build

# Test the CLI
./dist/cli.js extract examples/samples/story.txt

# Test as library
node examples/basic-extraction.js
```

### Phase 3: Verify Everything
```bash
# Full test suite
npm test

# Build all outputs
npm run build:all

# Check bundle sizes
ls -lah dist/

# Test Timeline Warfare
node dist/games/timeline-warfare.js
```

## Timeline

- **Today**: Complete Phase 1 cleanup + fix tests
- **Tomorrow**: Create clean API + examples
- **Day 3**: Documentation + final polish
- **Day 4**: Publish to npm + demo site

This plan transforms the experimental codebase into a production-ready library while preserving all functionality.