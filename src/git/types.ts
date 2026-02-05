/**
 * Core types for the Narrative Git system
 * These define the fundamental operations and structures for tracking narrative evolution
 */

import { Entity, Relationship, Scene, StateChange, Interaction } from '../types';

/**
 * Operations that can be applied to the narrative graph
 */
export type GraphOperationType =
  | 'ADD_ENTITY'
  | 'REMOVE_ENTITY'
  | 'UPDATE_ENTITY'
  | 'ADD_RELATIONSHIP'
  | 'REMOVE_RELATIONSHIP'
  | 'UPDATE_RELATIONSHIP'
  | 'ADD_SCENE'
  | 'UPDATE_SCENE'
  | 'ADD_INTERACTION'
  | 'UPDATE_INTERACTION'
  | 'TIMELINE_BRANCH'
  | 'TIMELINE_MERGE';

export interface GraphOperation {
  id: string;
  type: GraphOperationType;
  timestamp: number;
  payload: any;
  metadata?: {
    reason?: string;
    impact?: 'minor' | 'moderate' | 'major' | 'critical';
    reversible?: boolean;
  };
}

/**
 * Specific operation payloads
 */
export interface AddEntityOperation extends GraphOperation {
  type: 'ADD_ENTITY';
  payload: Entity;
}

export interface RemoveEntityOperation extends GraphOperation {
  type: 'REMOVE_ENTITY';
  payload: {
    entityId: string;
    reason: string;
    preserveRelationships?: boolean;
  };
}

export interface UpdateEntityOperation extends GraphOperation {
  type: 'UPDATE_ENTITY';
  payload: {
    entityId: string;
    changes: Partial<Entity>;
    mergeArrays?: boolean;
  };
}

export interface AddRelationshipOperation extends GraphOperation {
  type: 'ADD_RELATIONSHIP';
  payload: Relationship;
}

export interface RemoveRelationshipOperation extends GraphOperation {
  type: 'REMOVE_RELATIONSHIP';
  payload: {
    relationshipId: string;
    reason: string;
  };
}

export interface UpdateRelationshipOperation extends GraphOperation {
  type: 'UPDATE_RELATIONSHIP';
  payload: {
    relationshipId: string;
    changes: Partial<Relationship>;
  };
}

export interface AddInteractionOperation extends GraphOperation {
  type: 'ADD_INTERACTION';
  payload: Interaction;
}

export interface UpdateInteractionOperation extends GraphOperation {
  type: 'UPDATE_INTERACTION';
  payload: {
    interactionId: string;
    changes: Partial<Interaction>;
  };
}

export interface TimelineBranchOperation extends GraphOperation {
  type: 'TIMELINE_BRANCH';
  payload: {
    branchPoint: string;
    branches: Array<{
      id: string;
      name: string;
      probability: number;
      description?: string;
    }>;
  };
}

/**
 * A commit represents a set of operations applied atomically
 */
export interface NarrativeCommit {
  id: string;
  author: string;
  timestamp: number;
  message: string;
  
  // Git-like properties
  parentCommit?: string;
  treeHash: string; // Hash of the graph state after this commit
  
  // The actual changes
  operations: GraphOperation[];
  
  // Link to narrative significance
  canonicalEvent?: CanonicalEvent;
  
  // Metrics
  metrics: {
    coherenceScore: number;
    timelineDivergence: number;
    entitiesAffected: number;
    relationshipsChanged: number;
  };
  
  // Branch information
  branch?: string;
  tags?: string[];
}

/**
 * Represents a significant plot point in the narrative
 */
export interface CanonicalEvent {
  id: string;
  name: string;
  description: string;
  plotSignificance: 'minor' | 'major' | 'critical';
  
  // What makes this event canonical?
  requiredConditions?: GraphCondition[];
  
  // Can the narrative branch from here?
  allowsBranching?: boolean;
  
  // Associated assets
  assets?: {
    storyboard?: string;
    soundtrack?: string;
    concept?: string;
  };
}

/**
 * Conditions that can be checked against the graph state
 */
export interface GraphCondition {
  id: string;
  type: 'ENTITY_EXISTS' | 'RELATIONSHIP_EXISTS' | 'PROPERTY_EQUALS' | 
        'PROPERTY_CONTAINS' | 'COUNT_GREATER_THAN' | 'CUSTOM';
  
  // Type-specific parameters
  entityId?: string;
  entityType?: string;
  relationshipType?: string;
  property?: string;
  value?: any;
  count?: number;
  
  // For complex conditions
  customCheck?: (graph: any) => boolean;
  
  // Logical operators for combining conditions
  and?: GraphCondition[];
  or?: GraphCondition[];
  not?: boolean;
}

/**
 * Represents a timeline branch
 */
export interface TimelineBranch {
  id: string;
  name: string;
  description?: string;
  
  // Git-like branch properties
  parentCommit: string;
  headCommit: string;
  createdAt: number;
  updatedAt: number;
  
  // Narrative properties
  probability: number; // 0-1, how "real" is this timeline?
  isCanon: boolean;
  divergencePoint?: CanonicalEvent;
  
  // Metadata
  tags?: string[];
  locked?: boolean; // Prevent further commits?
  merged?: {
    into: string;
    at: string;
    resolution: 'fast-forward' | 'merge' | 'rebase' | 'three-way';
  };
}

/**
 * Configuration for merge operations
 */
export interface MergeConfig {
  strategy: 'fast-forward' | 'three-way' | 'recursive' | 'ours' | 'theirs';
  
  // Conflict resolution
  conflictResolution?: {
    entities?: 'keep-both' | 'prefer-source' | 'prefer-target' | 'manual';
    relationships?: 'keep-both' | 'prefer-source' | 'prefer-target' | 'manual';
    properties?: 'prefer-source' | 'prefer-target' | 'merge' | 'manual';
  };
  
  // Paradox resolution for narrative conflicts
  paradoxResolution?: {
    strategy?: 'quantum-superposition' | 'timeline-echo' | 'paradox-cascade' | 
               'schrodinger' | 'branching-reality' | 'retrocausal' | 'narrative-glitch';
    autoResolve?: boolean;
    preserveBothStates?: boolean;
  };
  
  // Options
  squash?: boolean;
  noCommit?: boolean;
  message?: string;
}

/**
 * Represents a merge conflict that needs resolution
 */
export interface MergeConflict {
  type: 'ENTITY_CONFLICT' | 'RELATIONSHIP_CONFLICT' | 'PROPERTY_CONFLICT' | 
        'EXISTENCE_CONFLICT' | 'TIMELINE_PARADOX';
  
  // What's in conflict
  entityId?: string;
  relationshipId?: string;
  property?: string;
  
  // The conflicting values
  sourceValue: any;
  targetValue: any;
  baseValue?: any; // From common ancestor
  
  // Suggested resolutions
  suggestions: Array<{
    action: string;
    description: string;
    confidence: number;
  }>;
}

/**
 * Result of a merge operation
 */
export interface MergeResult {
  success: boolean;
  commitId?: string;
  conflicts?: MergeConflict[];
  
  // Changes made during merge
  operations?: GraphOperation[];
  
  // Metrics
  metrics?: {
    entitiesMerged: number;
    relationshipsMerged: number;
    conflictsResolved: number;
    timelineDivergence: number;
  };
}

/**
 * Query interface for narrative history
 */
export interface CommitQuery {
  // Filter by branch
  branch?: string | string[];
  
  // Filter by time
  since?: number | Date;
  until?: number | Date;
  
  // Filter by author
  author?: string | string[];
  
  // Filter by content
  search?: string;
  affectsEntity?: string;
  affectsRelationship?: string;
  
  // Pagination
  limit?: number;
  offset?: number;
  
  // Include related data
  include?: Array<'operations' | 'metrics' | 'canonicalEvent'>;
}

/**
 * Diff between two graph states
 */
export interface GraphDiff {
  from: string; // Commit ID
  to: string;   // Commit ID
  
  // What changed
  addedEntities: Entity[];
  removedEntities: string[];
  modifiedEntities: Array<{
    entityId: string;
    changes: Partial<Entity>;
  }>;
  
  addedRelationships: Relationship[];
  removedRelationships: string[];
  modifiedRelationships: Array<{
    relationshipId: string;
    changes: Partial<Relationship>;
  }>;
  
  // Summary statistics
  stats: {
    totalChanges: number;
    entitiesAffected: number;
    relationshipsAffected: number;
    timelineDivergence: number;
  };
}