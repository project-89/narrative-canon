/**
 * @narrative/canon - A general-purpose system for managing large-scale narratives
 *
 * @packageDocumentation
 */

// Core types
export * from "./types";
export * from "./errors";

// Core modules
export { EntitySimilarityDetector } from "./core/entity-similarity";
export { TemporalNarrativeGraph } from "./core/temporal-graph";

// LLM adapters
export { UnifiedLLMAdapter } from "./llm/adapter";
export { GeminiAdapter } from "./llm/gemini";
export { MockLLM } from "./llm/mock";

// Extractors
export { CharacterExtractor } from "./extractors/character";
export { EntityExtractor } from "./extractors/entity-extractor";
export { RelationshipExtractor } from "./extractors/relationship-extractor";
export { SceneExtractor } from "./extractors/scene-extractor";
export { StateChangeExtractor } from "./extractors/state-change-extractor";
export { EnhancedStateChangeExtractor } from "./extractors/enhanced-state-change-extractor";
export { InteractionExtractor } from "./extractors/interaction-extractor";

// Graph management
// export { GraphBuilder } from './graph/builder'; // This file doesn't exist
export { TemporalGraphBuilder } from "./graph/temporal";
export { CanonTimelineManager } from "./canon-timeline-manager";

// Storage & Query
export { FileBasedNarrativeStore } from "./storage/file-store";
export { MongoNarrativeAdapter } from "./storage/mongodb-adapter";
export { MongoNarrativeService } from "./services/mongodb-narrative-service";
export { NarrativeQueryEngine } from "./narrative-query-engine";
export { ConsistencyEngine } from "./query/consistency";

// API Integration
export { NarrativeApiAdapter } from "./api/narrative-api-adapter";
export type { NarrativeApiConfig, RequestWithUser } from "./api/narrative-api-adapter";

// Main pipeline
export { NarrativePipeline, ExistingNarrativeData } from "./pipeline";

// Chunked extraction for book-length texts
export {
  ChunkedExtractionPipeline,
  ChunkingOptions,
  ChunkProgress,
  ChunkResult,
  BookExtractionResult
} from "./chunked-extraction";

// Git-integrated chunked extraction (produces commit history)
export {
  GitChunkedExtraction,
  GitChunkingOptions,
  GitChunkProgress,
  GitExtractionResult
} from "./git-chunked-extraction";

// Main API
export { NarrativeCanon, extractNarrative, extractFromFile } from './narrative-canon';
export type { NarrativeCanonConfig } from './narrative-canon';

// Git-like version control for narratives
export { 
  NarrativeGit, 
  initNarrativeGit,
  NarrativeCanonGraph,
  HookRegistry,
  ParadoxResolver,
  LLMParadoxAnalyzer,
  GitConfig,
  StatusResult,
  LogEntry,
  BlameResult,
  CommitMetadata,
  MergeConfig
} from './git';

// Version
export const VERSION = "0.3.0";
