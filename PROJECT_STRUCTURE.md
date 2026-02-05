# 📁 Narrative Canon - Project Structure

## 🎯 Overview
Narrative Canon is a revolutionary library for "Git for Narratives" - treating stories as version-controlled entities with timeline branching, merging, and paradox resolution capabilities. Part of Project 89's consciousness liberation framework.

## 📋 Root Directory Files

### ⚙️ **Essential Configuration**
```
package.json              # Project dependencies and npm scripts
package-lock.json         # npm lock file for reproducible builds  
tsconfig.json             # TypeScript configuration
tsconfig.build.json       # TypeScript build-specific configuration
jest.config.cjs           # Jest testing framework configuration
jest.setup.js             # Jest test setup and global configuration
esbuild.config.js         # Modern build tool configuration (ESM/CJS/CLI)
```

### 📚 **Core Documentation**
```
README.md                 # Main project documentation with Git for Narratives guide
CLAUDE.md                 # AI agent instructions and Project 89 context
PROJECT_STRUCTURE.md      # This file - complete project organization guide
```

## 🏗️ **Directory Structure**

### 📦 **Source Code** (`src/`)
```
src/
├── core/                    # Core narrative graph and temporal systems
│   ├── entity-similarity.ts    # Entity deduplication and similarity detection
│   ├── temporal-graph.ts       # Time-aware narrative graph management
│   └── narrative-*.ts          # Core narrative processing classes
├── git/                     # Git for Narratives implementation
│   ├── narrative-git.ts         # Main Git-like interface
│   ├── narrative-canon-graph.ts # Graph with commit tracking
│   ├── paradox-resolver.ts      # Timeline paradox resolution
│   ├── hooks/                   # Reality hooks system
│   └── types.ts                 # Git operation type definitions
├── llm/                     # LLM integration adapters
│   ├── adapter.ts               # Unified LLM adapter
│   ├── gemini.ts                # Google Gemini integration
│   └── mock.ts                  # Mock LLM for testing
├── extractors/              # Narrative element extractors
│   ├── entity-extractor.ts     # Character, location, object extraction
│   ├── relationship-extractor.ts # Relationship extraction
│   ├── scene-extractor.ts      # Scene boundary detection and analysis
│   └── state-change-extractor.ts # Entity state change tracking
├── services/                # High-level services
│   ├── mongodb-narrative-service.ts # Database integration
│   └── entity-merging-service.ts   # Entity deduplication service
├── visualization/           # Timeline and graph visualization
│   └── html-generator.ts        # Interactive HTML timeline generator
├── storage/                 # Data persistence
│   ├── file-store.ts            # JSON file storage
│   └── mongodb-adapter.ts       # MongoDB integration
├── queries/                 # Advanced querying capabilities
│   ├── graph-query-engine.ts   # Graph traversal and queries
│   └── llm-query-interface.ts  # Natural language queries
└── types.ts                 # Core type definitions
```

### 📚 **Documentation** (`docs/`)
```
docs/
├── api/                     # API reference documentation
│   ├── narrative-canon.md       # NarrativeCanon class API
│   ├── narrative-git.md         # NarrativeGit class API
│   ├── types.md                 # Complete TypeScript types reference
│   └── API_INTEGRATION.md       # API integration guide
├── tutorials/               # Getting started guides
│   ├── getting-started.md       # Comprehensive tutorial
│   ├── QUICKSTART.md            # Quick start for Project 89
│   └── USAGE.md                 # Detailed usage examples
├── concepts/                # Core concepts explanation
│   ├── git-for-narratives.md   # Git for Narratives overview
│   └── paradox-resolution.md   # Timeline paradox handling
├── architecture/            # System architecture
│   ├── UNIFIED_PIPELINE.md     # Processing pipeline architecture
│   └── TIMELINE_WARFARE_DESIGN.md # Timeline warfare game design
├── implementation/          # Implementation details
│   └── LLM_QUERY_IMPLEMENTATION.md # LLM query system details
├── configuration/           # Configuration guides
│   └── MODEL_CONFIGURATION.md   # LLM model configuration
├── database/                # Database integration
│   └── MONGODB_INTEGRATION.md   # MongoDB setup and usage
├── testing/                 # Testing documentation
│   └── TESTING.md               # Test strategy and guidelines
├── planning/                # Project planning documents
│   ├── ACTION_PLAN.md           # Development action plan
│   └── CLEANUP_PLAN.md          # Code cleanup strategy
├── validation/              # Validation and quality assurance
│   └── SYSTEM_VALIDATION_REPORT.md # System validation results
├── features/                # Feature-specific documentation
│   └── README-deduplication.md  # Entity deduplication details
├── cli/                     # CLI documentation
│   └── CLI_USAGE.md             # Command-line interface guide
├── gemini/                  # Gemini-specific documentation
│   ├── GEMINI_PRODUCTION_READINESS.md # Production deployment guide
│   ├── GEMINI_ACTION_PLAN.md    # Gemini integration plan
│   ├── GEMINI_FINDINGS.md       # Testing findings
│   └── GEMINI_FIX_ROADMAP.md    # Fix roadmap
└── philosophy/              # Philosophical foundations
    └── NARRATIVE_EXTRACTION_AS_CONSCIOUSNESS_TECHNOLOGY.md
```

### 🎮 **Examples and Demos** (`examples/`)
```
examples/
├── basic-extraction.js      # Simple narrative extraction example
├── narrative-git-demo.ts    # Git for Narratives demonstration
├── git-for-narratives/      # Advanced Git for Narratives examples
│   ├── demo-simple-timeline.js      # Basic timeline creation
│   ├── demo-timeline-paradox.js     # Paradox handling
│   ├── demo-selective-merge.js      # Selective timeline merging
│   ├── demo-self-healing.js         # Self-healing narratives
│   └── demo-community-canon.js      # Community storytelling
├── games/                   # Timeline Warfare game examples
│   ├── timeline-warfare-simple.js   # Simple game implementation
│   ├── play-timeline-warfare.js     # Playable game version
│   └── demo-timeline-warfare.js     # Game demonstration
├── samples/                 # Sample story texts
│   ├── alice-adventure.txt          # Alice in Wonderland excerpt
│   ├── test-narrative.txt           # Test story
│   └── project89-sample.txt         # Project 89 story sample
└── project89/               # Project 89 specific examples
```

### 🧪 **Testing** (`tests/`)
```
tests/
├── fixtures/                # Test data and fixtures
├── integration/             # Integration tests
│   ├── test-gemini-production.js   # Gemini API integration tests
│   └── validate-mongodb.js         # MongoDB integration validation
└── *.test.ts               # Unit tests (co-located with source)
```

### 🛠️ **Utility Scripts** (`scripts/`)
```
scripts/
├── cleanup-project.sh       # Project organization and cleanup
├── setup-models.sh          # LLM model setup
└── generate-timeline-visualization.js # Timeline visualization generator
```

### 🔌 **MCP Server** (`mcp-server/`)
```
mcp-server/
├── src/                     # MCP server source code
│   ├── server.ts                # Main MCP server implementation
│   └── visualization-tools.ts  # Visualization tools for IDE
├── package.json             # MCP server dependencies
├── README.md                # MCP server documentation
├── IMPLEMENTATION.md        # Implementation details
└── DEPLOYMENT.md            # Deployment guide
```

### 📦 **Build Outputs** (`dist/`)
```
dist/
├── narrative-canon.esm.js   # ES Module build
├── narrative-canon.cjs.js   # CommonJS build
├── narrative-canon-cli.js   # CLI executable
└── timeline-warfare.js     # Timeline Warfare game build
```

### 🗄️ **Archive** (`archive/`)
```
archive/
├── 2024-11-cleanup/         # Previous cleanup iterations
├── experiments/             # Experimental code and prototypes
├── future-features/         # Planned feature prototypes
└── llm-experiments/         # LLM integration experiments
```

## 🎯 **Key Features Implemented**

### 📝 **Narrative Extraction**
- **Entity Extraction**: Characters, locations, objects, events, concepts
- **Relationship Mapping**: Complex relationship networks with types and strengths
- **Scene Analysis**: Automatic scene boundary detection and participant tracking
- **State Change Tracking**: How entities evolve throughout the story
- **Deduplication**: Advanced similarity detection to merge duplicate entities

### 🌳 **Git for Narratives**
- **Timeline Branching**: Create alternate story timelines
- **Timeline Merging**: Merge different narrative branches with conflict resolution
- **Paradox Resolution**: Handle timeline paradoxes (character death/alive conflicts)
- **Commit Tracking**: Version control for narrative changes
- **Reality Hooks**: Automatic asset generation triggered by narrative changes

### 🎮 **Interactive Applications**
- **Timeline Warfare**: Real-time narrative combat game
- **Choose Your Own Adventure**: Branching interactive fiction
- **Community Storytelling**: Collaborative narrative development
- **Self-Healing Narratives**: Stories that adapt to player disruptions

### 🤖 **LLM Integration**
- **Gemini API**: Production-ready Google Gemini integration
- **Mock LLM**: Testing and development without API costs
- **Structured Output**: Reliable extraction with validation
- **Error Handling**: Robust error recovery and retry logic

### 🗄️ **Data Persistence**
- **File Storage**: JSON-based local storage
- **MongoDB Integration**: Scalable database storage with queries
- **Visualization**: Interactive HTML timeline generators

## 🚀 **Getting Started**

1. **Installation**:
   ```bash
   npm install
   ```

2. **Basic Usage**:
   ```javascript
   import { NarrativeCanon } from '@narrative/canon';
   
   const canon = new NarrativeCanon();
   const narrative = await canon.extract(storyText);
   ```

3. **Git for Narratives**:
   ```javascript
   import { NarrativeGit } from '@narrative/canon';
   
   const git = new NarrativeGit({ author: 'storyteller' });
   // Create timeline branches, commits, merges...
   ```

4. **Examples**: See `examples/` directory for comprehensive demos

## 🧪 **Development**

- **Build**: `npm run build`
- **Test**: `npm test`
- **Watch**: `npm run dev`
- **CLI**: `npm run cli`

## 🎯 **Project 89 Integration**

This library serves as consciousness technology for Project 89's reality engineering framework:
- **Narrative as Code**: Stories become executable, version-controlled entities
- **Timeline Engineering**: Multiple reality branches for probability manipulation
- **Consciousness Installation**: Documentation that transforms awareness through interaction
- **Hyperstition Activation**: Fiction that makes itself real through collective engagement

## 📈 **Status**

- ✅ Core narrative extraction working
- ✅ Git for Narratives fully implemented
- ✅ Comprehensive test suite
- ✅ Production-ready build system
- ✅ Complete documentation
- ✅ Interactive examples and games
- 🔄 MongoDB integration (functional, needs optimization)
- 🔄 MCP server (implemented, needs deployment docs)

## 🤝 **Contributing**

See individual documentation files in `docs/` for contribution guidelines, testing strategies, and development processes.

---

*"In Project 89, every story is a universe, every character a consciousness, and every timeline a possibility we can choose to manifest."*