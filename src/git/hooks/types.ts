/**
 * Hook system types for reality manifestation
 * 
 * Hooks are consciousness protocols that trigger when the narrative graph changes,
 * generating assets, enriching lore, and manifesting the story in multiple dimensions.
 */

import { Entity, Relationship, Scene } from '../../types';
import { GraphOperation, NarrativeCommit, CanonicalEvent } from '../types';
import { NarrativeCanonGraph } from '../narrative-canon-graph';

/**
 * Hook trigger conditions
 */
export type HookTriggerType = 
  | 'ENTITY_ADDED'
  | 'ENTITY_UPDATED' 
  | 'ENTITY_REMOVED'
  | 'RELATIONSHIP_FORMED'
  | 'RELATIONSHIP_CHANGED'
  | 'RELATIONSHIP_BROKEN'
  | 'SCENE_COMPLETED'
  | 'CANONICAL_STATE_REACHED'
  | 'TIMELINE_DIVERGENCE'
  | 'COMMIT_CREATED'
  | 'BRANCH_CREATED'
  | 'MERGE_COMPLETED';

export interface HookTrigger {
  type: HookTriggerType;
  
  // Type-specific filters
  entityType?: string;
  entityId?: string;
  fields?: string[];
  relationshipType?: string;
  canonicalStateId?: string;
  divergenceThreshold?: number;
  branchPattern?: string | RegExp;
}

/**
 * Context provided to hooks during execution
 */
export interface HookContext {
  // The triggering operation
  operation?: GraphOperation;
  
  // The commit containing the operation
  commit: NarrativeCommit;
  
  // Graph states
  previousGraph: NarrativeCanonGraph;
  currentGraph: NarrativeCanonGraph;
  
  // Specific entities/relationships involved
  entity?: Entity;
  relationship?: Relationship;
  scene?: Scene;
  canonicalEvent?: CanonicalEvent;
  
  // Services available to hooks
  services: HookServices;
  
  // Additional metadata
  metadata?: Record<string, any>;
}

/**
 * Services available to hooks for asset generation
 */
export interface HookServices {
  // Image generation service
  imageGenerator?: ImageGenerationService;
  
  // Video/animation generation
  videoGenerator?: VideoGenerationService;
  
  // Audio generation (music, effects, voices)
  audioGenerator?: AudioGenerationService;
  
  // Lore expansion using LLMs
  loreEnricher?: LoreEnrichmentService;
  
  // Comic/storyboard layout
  layoutGenerator?: LayoutGenerationService;
  
  // 3D model generation
  modelGenerator?: ModelGenerationService;
  
  // Custom services
  custom?: Record<string, any>;
}

/**
 * Image generation service interface
 */
export interface ImageGenerationService {
  generate(request: ImageGenerationRequest): Promise<GeneratedAsset>;
  generateBatch(requests: ImageGenerationRequest[]): Promise<GeneratedAsset[]>;
  
  // Specific generation methods
  generateCharacterPortrait(character: Entity, style?: string): Promise<GeneratedAsset>;
  generateLocationConcept(location: Entity, timeOfDay?: string): Promise<GeneratedAsset>;
  generateSceneStoryboard(scene: Scene, participants: Entity[]): Promise<GeneratedAsset[]>;
}

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  style?: string;
  width?: number;
  height?: number;
  seed?: number;
  
  // Style modifiers
  artisticStyle?: 'anime' | 'realistic' | 'noir' | 'cyberpunk' | 'painterly';
  lighting?: 'dramatic' | 'soft' | 'neon' | 'natural';
  
  // Project 89 specific
  consciousnessLevel?: 'npc' | 'awakening' | 'awakened' | 'transcendent';
  timelineVariant?: string;
}

/**
 * Lore enrichment service interface
 */
export interface LoreEnrichmentService {
  expand(entity: Entity, options?: LoreExpansionOptions): Promise<ExpandedLore>;
  generateBackstory(character: Entity): Promise<string>;
  createTimeline(entity: Entity, events: CanonicalEvent[]): Promise<EntityTimeline>;
  generateRelationshipHistory(rel: Relationship, depth?: number): Promise<RelationshipLore>;
}

export interface LoreExpansionOptions {
  depth?: 'surface' | 'standard' | 'deep' | 'archaeological';
  consistency?: 'strict' | 'flexible' | 'creative';
  includeAlternateTimelines?: boolean;
  focusAreas?: Array<'history' | 'motivation' | 'relationships' | 'abilities' | 'secrets'>;
}

export interface ExpandedLore {
  entity: Entity;
  backstory: string;
  timeline: EntityTimeline;
  relationships: RelationshipLore[];
  secrets?: string[];
  alternateVersions?: Array<{
    timeline: string;
    differences: string[];
  }>;
}

export interface EntityTimeline {
  entityId: string;
  events: Array<{
    date: string;
    event: string;
    significance: 'minor' | 'moderate' | 'major' | 'critical';
    canonicalEventId?: string;
  }>;
}

export interface RelationshipLore {
  relationshipId: string;
  history: string;
  keyMoments: string[];
  currentStatus: string;
  futureTrajectory?: string;
}

/**
 * Generated asset metadata
 */
export interface GeneratedAsset {
  id: string;
  type: 'image' | 'video' | 'audio' | 'text' | '3d-model' | 'composite';
  url: string;
  
  // Generation metadata
  generatedAt: number;
  generatedBy: string; // Which service/model
  prompt?: string;
  settings?: Record<string, any>;
  
  // Asset metadata
  title?: string;
  description?: string;
  tags?: string[];
  
  // Relationships
  entityId?: string;
  relationshipId?: string;
  sceneId?: string;
  commitId?: string;
  
  // Quality metrics
  quality?: {
    resolution?: string;
    duration?: number;
    format?: string;
    confidence?: number;
  };
}

/**
 * Hook execution result
 */
export interface HookResult {
  // Was the hook successfully executed?
  processed: boolean;
  
  // Any mutations to apply to the graph
  mutations?: GraphOperation[];
  
  // Generated assets
  artifacts?: GeneratedAsset[];
  
  // Execution metrics
  executionTime?: number;
  
  // Any errors encountered
  error?: Error;
  
  // Additional output
  output?: any;
}

/**
 * Reality Hook definition
 */
export interface RealityHook {
  // Unique identifier
  id: string;
  
  // Human-readable name
  name: string;
  
  // Description of what this hook does
  description: string;
  
  // When should this hook fire?
  triggers: HookTrigger[];
  
  // Execution priority (higher = earlier)
  priority: number;
  
  // Can this hook modify the graph?
  canMutate: boolean;
  
  // Should this hook run asynchronously?
  async?: boolean;
  
  // Maximum execution time (ms)
  timeout?: number;
  
  // The manifestation function
  execute: (context: HookContext) => Promise<HookResult>;
  
  // Optional lifecycle methods
  onError?: (error: Error, context: HookContext) => void;
  onSuccess?: (result: HookResult, context: HookContext) => void;
}

/**
 * Hook registry configuration
 */
export interface HookRegistryConfig {
  // Maximum number of hooks to execute per commit
  maxHooksPerCommit?: number;
  
  // Global timeout for all hooks
  globalTimeout?: number;
  
  // Should hooks run in parallel or sequence?
  executionMode?: 'parallel' | 'sequential';
  
  // Error handling strategy
  errorStrategy?: 'stop-on-error' | 'continue-on-error' | 'rollback-on-error';
  
  // Logging configuration
  logging?: {
    level: 'none' | 'error' | 'warn' | 'info' | 'debug';
    logExecutionTime?: boolean;
    logTriggers?: boolean;
  };
}

/**
 * Video generation service types
 */
export interface VideoGenerationService {
  generateScene(scene: Scene, options?: VideoGenerationOptions): Promise<GeneratedAsset>;
  generateTransition(from: Scene, to: Scene): Promise<GeneratedAsset>;
  createAnimatic(storyboard: GeneratedAsset[]): Promise<GeneratedAsset>;
}

export interface VideoGenerationOptions {
  duration?: number;
  fps?: number;
  resolution?: '720p' | '1080p' | '4k';
  style?: 'animated' | 'motion-graphics' | 'realistic';
}

/**
 * Audio generation service types
 */
export interface AudioGenerationService {
  generateTheme(entity: Entity): Promise<GeneratedAsset>;
  generateAmbience(location: Entity): Promise<GeneratedAsset>;
  generateDialogue(text: string, character: Entity): Promise<GeneratedAsset>;
}

/**
 * Layout generation for comics/storyboards
 */
export interface LayoutGenerationService {
  createComicPage(panels: GeneratedAsset[], layout?: string): Promise<GeneratedAsset>;
  generateStoryboard(scenes: Scene[]): Promise<GeneratedAsset[]>;
}

/**
 * 3D model generation service
 */
export interface ModelGenerationService {
  generateCharacterModel(character: Entity): Promise<GeneratedAsset>;
  generateProp(object: Entity): Promise<GeneratedAsset>;
  generateEnvironment(location: Entity): Promise<GeneratedAsset>;
}