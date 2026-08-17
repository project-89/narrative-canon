---
# PROJECT 89 DOCUMENT METADATA
doc_id: narrative-canon-agent-tools-001
version: 1.0.0
last_updated: 2026-03-11
status: draft
author: Seraph
contributors: [Parzival]

# DOCUMENT RELATIONSHIPS
parent_docs:
  - doc_id: 05_framework-transmedia-engine-001
    relationship: implements
related_docs:
  - doc_id: 04_wonderlab-cardgame-microdrama-001
    relationship: supports

# CONTENT CLASSIFICATION
domain: prototypes
sub_domain: agent_tooling
keywords: agent tools, NarrativeGit, Aureum, ADK, transmedia

# SYNCHRONIZATION
last_sync: 2026-03-11
sync_notes: Initial creation
---

# Agent Tools Specification

## Overview

Any ADK agent becomes a transmedia participant by receiving two tool sets: **NarrativeGit** (world state) and **Aureum** (rule logic). This document specifies both interfaces and their integration patterns.

---

## 1. NarrativeGit Tools

These tools give an agent access to the versioned narrative graph — the shared world state.

### Entity Operations

| Tool | Parameters | Returns | Description |
|------|-----------|---------|-------------|
| `add_entity` | `{id, name, type, ...properties}` | `{entityId}` | Create a new entity (character, location, object, organization, concept) |
| `update_entity` | `{entityId, changes}` | `{updated: true}` | Modify entity properties |
| `remove_entity` | `{entityId, reason}` | `{removed: true}` | Remove an entity from the graph |
| `get_entity` | `{entityId}` | `Entity` | Get full entity details |
| `get_entities` | `{type?, branch?}` | `Entity[]` | List entities, optionally filtered by type |

### Relationship Operations

| Tool | Parameters | Returns | Description |
|------|-----------|---------|-------------|
| `add_relationship` | `{source, target, type, strength?, ...}` | `{relationshipId}` | Create a typed connection between entities |
| `update_relationship` | `{relationshipId, changes}` | `{updated: true}` | Modify relationship properties |
| `remove_relationship` | `{relationshipId, reason}` | `{removed: true}` | Remove a relationship |

### Narrative Content Operations

| Tool | Parameters | Returns | Description |
|------|-----------|---------|-------------|
| `add_interaction` | `{type, participants, visual_beat, emotional_tone, narrative_weight, ...}` | `{interactionId}` | Record a significant narrative moment |
| `add_scene` | `{title, location, characters, description, sequence}` | `{sceneId}` | Add a scene container |

### Version Control Operations

| Tool | Parameters | Returns | Description |
|------|-----------|---------|-------------|
| `commit` | `{message, tags?}` | `{commitId}` | Commit staged operations |
| `branch` | `{name, metadata?}` | `{branchName}` | Create a new timeline branch |
| `checkout` | `{branch}` | `{currentBranch}` | Switch to a branch |
| `merge` | `{source, strategy?, conflictResolution?}` | `MergeResult` | Merge a branch into current |
| `log` | `{branch?, limit?}` | `CommitEntry[]` | View commit history |
| `diff` | `{from, to}` | `GraphDiff` | Compare two branches or commits |
| `blame` | `{entityId}` | `BlameEntry[]` | Who changed this entity and when |
| `export` | `{branch?}` | `GraphExport` | Full graph state export |
| `status` | `{}` | `GraphStatus` | Current branch, staged operations |
| `branches` | `{}` | `BranchInfo[]` | List all branches |

---

## 2. Aureum Tools

These tools give an agent access to the rule engine — game mechanics and simulation.

### Game Management

| Tool | Parameters | Returns | Description |
|------|-----------|---------|-------------|
| `load_game` | `{gameJson?, gameFilePath?}` | `GameSummary` | Load a game into the engine |
| `save_game` | `{filename?, directory?}` | `{filePath}` | Save current game to disk |
| `get_game_state` | `{}` | `{entities, ruleCount}` | Inspect current world state |

### Evaluation & Simulation

| Tool | Parameters | Returns | Description |
|------|-----------|---------|-------------|
| `step` | `{entityId}` | `StepResult` | Evaluate rules for one entity step |
| `validate_game` | `{useCurrentGame?}` | `{status, issues}` | Check game structural validity |
| `simulate_game` | `{numGames, useCurrentGame?}` | `SimulationResults` | Run N automated games with statistics |

### DSL Operations

| Tool | Parameters | Returns | Description |
|------|-----------|---------|-------------|
| `validate_dsl` | `{dslSource}` | `{valid, issues}` | Validate ArgOS DSL syntax |
| `load_dsl` | `{dslSource}` | `GameSummary` | Parse DSL into engine |

---

## 3. Bridge Tools (New)

These tools connect the rule engine to the narrative graph.

| Tool | Parameters | Returns | Description |
|------|-----------|---------|-------------|
| `init_game_from_graph` | `{branch?, entityFilter?}` | `GameSummary` | Initialize Aureum world from narrative graph entities |
| `play_card` | `{cardId, target?}` | `{stepResult, narrativeCommit?}` | Step a card entity and emit narrative commits |
| `start_game_session` | `{gameName, branch?}` | `{sessionBranch}` | Create a timeline branch for a game session |
| `end_game_session` | `{sessionBranch, merge?}` | `{commitId, mergeResult?}` | Finalize a game session branch |
| `generate_cards_from_graph` | `{theme?, count?}` | `CardEntity[]` | Generate card entities from current graph state |

---

## 4. Agent Archetypes

### Dramatist Agent
**Tools**: NarrativeGit (read + write), Bridge (`init_game_from_graph` for context)
**Role**: Reads the graph for world state, character history, and recent events. Writes episodes as scene and interaction operations. Commits on episode branches.

### Game Designer Agent
**Tools**: NarrativeGit (read), Aureum (all), Bridge (generate_cards, init_game)
**Role**: Reads narrative tensions from graph. Generates card games with balanced mechanics. Uses Aureum simulator to validate. Commits game definitions to graph.

### Canon Keeper Agent
**Tools**: NarrativeGit (read: log, blame, diff, export)
**Role**: Validates proposed changes against existing canon. Checks for contradictions, timeline violations, and entity conflicts. Reports issues before commits.

### Show Runner Agent
**Tools**: NarrativeGit (read), Bridge (external trigger tools)
**Role**: Monitors graph for significant interactions. Triggers external actions — social posts, notifications, phone calls — when narrative conditions are met.

### World Builder Agent
**Tools**: NarrativeGit (read + write)
**Role**: Extends the world — new locations, organizations, background characters, historical events. Fills in the gaps that game and episode generation need.

### Community Manager Agent
**Tools**: NarrativeGit (write), External APIs (read)
**Role**: Listens to external signals (social media, Discord, community activity). Translates real-world events into graph entities and interactions.

### Balance Critic Agent
**Tools**: Aureum (validate, simulate), NarrativeGit (read)
**Role**: Evaluates game definitions for balance. Runs simulations. Reports on win rates, stuck states, and difficulty curves. Suggests mechanical adjustments.

### Voice Interpreter Agent
**Tools**: Bridge (play_card, start/end_game_session), Aureum (step)
**Role**: Receives voice-interpreted game actions. Translates natural language into entity steps. Maintains live game state during physical play sessions.

---

## 5. Multi-Agent Composition

Agents can be composed using ADK orchestration patterns:

### Sequential: Episode Production
```
World Builder → Game Designer → Balance Critic → Dramatist → Canon Keeper
```

### Parallel: Multi-Consumer Rendering
```
Game Session Branch ──┬──▶ Dramatist (episode)
                      ├──▶ Comic Agent (panels)
                      ├──▶ Social Agent (posts)
                      └──▶ Dashboard Agent (visualization)
```

### Loop: Game Generation + Testing
```
Game Designer → Balance Critic → (iterate up to 3x) → Save
```

### Event-Driven: Live Session
```
Voice Interpreter ──▶ Aureum Step ──▶ Bridge ──▶ Graph Commit
                                                     │
                                              (triggers on commit)
                                                     │
                                    Show Runner ──▶ External Action
```

---

## 6. Implementation Notes

### Existing Tools
- Aureum ADK tools: `aureum-adk-tools.ts` (load, save, validate, simulate, get_state)
- Aureum DSL tools: `validate-dsl.ts` (validate_dsl, load_dsl)
- Canon Bridge: `canon_bridge.py` → `bridge.ts` (JSON-RPC, all NarrativeGit operations)
- Canon MCP: `mcp-server/` (NarrativeGit as MCP tools — alternative to direct bridge)

### To Build
- Bridge tools (TypeScript): `bridge/aureum-narrative-bridge.ts`
- Bridge ADK tools: `bridge/bridge-adk-tools.ts`
- Voice interpreter: `adapters/voice-interpreter.ts`
- External action triggers: `adapters/external-actions.ts`

### Tool Discovery
Agents discover available tools through ADK's `FunctionTool` registration. Each tool set is a module that exports `allTools` arrays. Agent configurations specify which modules to include:

```typescript
const dramatistAgent = new LlmAgent({
  name: 'dramatist',
  tools: [...narrativeGitTools, ...bridgeTools],
  // ... system prompt, model config
});

const gameDesignerAgent = new LlmAgent({
  name: 'game_designer',
  tools: [...narrativeGitTools, ...aureumTools, ...bridgeTools],
  // ...
});
```
