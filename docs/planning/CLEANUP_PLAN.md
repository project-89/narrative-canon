# Narrative Canon Cleanup Plan

## Goal
Transform the current experimental codebase into a clean, production-ready library with:
- Clear API surface
- Comprehensive tests
- Working examples
- Proper documentation
- No duplicate code

## Target Structure

```
narrative-canon/
├── src/                      # Core library source
│   ├── index.ts             # Main export
│   ├── types.ts             # Core types
│   ├── errors.ts            # Error types
│   ├── pipeline.ts          # Main pipeline
│   ├── extractors/          # Extraction modules
│   │   ├── index.ts
│   │   ├── character.ts
│   │   ├── scene.ts
│   │   ├── relationship.ts
│   │   └── state-change.ts
│   ├── llm/                 # LLM adapters
│   │   ├── index.ts
│   │   ├── adapter.ts       # Base interface
│   │   ├── mock.ts          # Mock for testing
│   │   └── gemini.ts        # Gemini implementation (using responseSchema)
│   ├── graph/               # Graph building
│   │   ├── index.ts
│   │   ├── builder.ts
│   │   └── temporal.ts
│   ├── query/               # Query engine
│   │   ├── index.ts
│   │   ├── engine.ts
│   │   └── consistency.ts
│   ├── storage/             # Storage adapters
│   │   ├── index.ts
│   │   └── file.ts
│   └── visualization/       # Output generation
│       ├── index.ts
│       └── html.ts
├── tests/                   # All tests
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── fixtures/           # Test data
├── examples/               # Example usage
│   ├── basic/             # Basic examples
│   ├── advanced/          # Advanced features
│   └── games/             # Game implementations
│       └── timeline-warfare/
├── docs/                   # Documentation
│   ├── api/               # API docs
│   ├── guides/            # Usage guides
│   └── internals/         # Technical details
├── scripts/               # Build/utility scripts
├── dist/                  # Built output (gitignored)
├── package.json
├── tsconfig.json
├── jest.config.js
├── esbuild.config.js
├── .gitignore
├── README.md
├── LICENSE
└── CHANGELOG.md
```

## Step-by-Step Cleanup Process

### Phase 1: Backup and Prepare
1. Create `archive/` directory
2. Copy entire current state to archive
3. Create new branch for cleanup

### Phase 2: Core Library Cleanup
1. **LLM Adapters**
   - Keep only `gemini-proper.ts` (rename to `gemini.ts`)
   - Remove all other gemini variants
   - Update imports throughout codebase

2. **Extractors**
   - Consolidate duplicate extractors
   - Keep enhanced versions where they exist
   - Ensure consistent naming

3. **Remove Duplicates**
   - Keep `src/cli.ts`, remove others
   - Consolidate pipeline variants

### Phase 3: Organize Examples
1. Move all game files to `examples/games/timeline-warfare/`
2. Move sample narratives to `examples/samples/`
3. Create basic examples showing each feature

### Phase 4: Test Reorganization
1. Move all `*.test.ts` files to `tests/unit/`
2. Create integration test suite in `tests/integration/`
3. Move test fixtures to `tests/fixtures/`

### Phase 5: Documentation
1. Merge all documentation into coherent structure
2. Create API reference from TypeScript
3. Write usage guides for each major feature

### Phase 6: Build System
1. Update `esbuild.config.js` for new structure
2. Create npm scripts for common tasks
3. Set up proper exports in `package.json`

### Phase 7: Final Cleanup
1. Update `.gitignore`
2. Remove all generated files
3. Run full test suite
4. Create example outputs

## Files to Remove/Archive

### Remove Completely
- All `test-*.js/ts` files in root
- All `timeline-warfare-*.js` variants except the best one
- Build artifacts (`dist/`, `narrative-extract`)
- Output directories (`*-output/`)
- Temporary test files

### Archive for Reference
- Alternative implementations (gemini variants)
- Experimental features not yet integrated
- Design documents (GEMINI_*.md, etc.)

## New Files to Create

1. `src/index.ts` - Clean public API
2. `examples/README.md` - Example documentation
3. `docs/API.md` - API reference
4. `CONTRIBUTING.md` - Contribution guidelines
5. `.github/workflows/test.yml` - CI configuration

## Migration Checklist

- [ ] Backup current state
- [ ] Create cleanup branch
- [ ] Consolidate LLM adapters
- [ ] Organize extractors
- [ ] Move examples
- [ ] Reorganize tests
- [ ] Update imports
- [ ] Clean root directory
- [ ] Update documentation
- [ ] Test everything
- [ ] Update package.json
- [ ] Create release

## Expected Outcome

A clean, professional library that:
- Has a clear API (`import { extractNarrative } from 'narrative-canon'`)
- Works reliably with Gemini API
- Includes comprehensive examples
- Is well-documented
- Can be published to npm
- Maintains all current functionality

## Time Estimate

- Phase 1-2: 2 hours (core cleanup)
- Phase 3-4: 1 hour (organization)
- Phase 5: 2 hours (documentation)
- Phase 6-7: 1 hour (build/final)

Total: ~6 hours of focused work