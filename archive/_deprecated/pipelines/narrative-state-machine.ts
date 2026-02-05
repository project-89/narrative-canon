import { z } from 'zod';
import { Entity, Relationship, StateChange } from './types';

/**
 * Narrative State Machine
 * 
 * Represents a narrative as a series of graph mutations over time.
 * Each state change modifies the graph (adds/removes/updates nodes and edges).
 * This creates a complete history that can be:
 * - Traversed forward/backward (like git commits)
 * - Branched (for alternate timelines)
 * - Diffed (to compare narrative states)
 * - Merged (to combine narrative branches)
 */

// Enhanced state change types for narrative graph mutations
export enum GraphMutationType {
  // Entity (Node) Operations
  ENTITY_INTRODUCED = 'entity_introduced',
  ENTITY_UPDATED = 'entity_updated',
  ENTITY_REMOVED = 'entity_removed',
  ENTITY_MOVED = 'entity_moved',
  
  // Relationship (Edge) Operations
  RELATIONSHIP_FORMED = 'relationship_formed',
  RELATIONSHIP_STRENGTHENED = 'relationship_strengthened',
  RELATIONSHIP_WEAKENED = 'relationship_weakened',
  RELATIONSHIP_TRANSFORMED = 'relationship_transformed',
  RELATIONSHIP_BROKEN = 'relationship_broken',
  
  // Property Operations
  PROPERTY_SET = 'property_set',
  PROPERTY_CHANGED = 'property_changed',
  PROPERTY_REMOVED = 'property_removed',
  
  // Knowledge/Information Operations
  KNOWLEDGE_GAINED = 'knowledge_gained',
  KNOWLEDGE_SHARED = 'knowledge_shared',
  KNOWLEDGE_LOST = 'knowledge_lost',
  
  // Environmental Operations
  ENVIRONMENT_CHANGED = 'environment_changed',
  LOCATION_DISCOVERED = 'location_discovered',
  LOCATION_TRANSFORMED = 'location_transformed'
}

// Detailed graph mutation schema
export const GraphMutationSchema = z.object({
  id: z.string(),
  timestamp: z.number(), // Narrative time (scene/sequence number)
  type: z.nativeEnum(GraphMutationType),
  
  // What changed
  entityId: z.string().optional(),
  targetEntityId: z.string().optional(),
  relationshipId: z.string().optional(),
  
  // Details of the change
  properties: z.record(z.any()).optional(),
  oldValue: z.any().optional(),
  newValue: z.any().optional(),
  
  // Metadata
  sceneId: z.string(),
  eventId: z.string().optional(),
  description: z.string(),
  impact: z.enum(['minimal', 'minor', 'moderate', 'major', 'transformative']),
  reversible: z.boolean().default(true),
  
  // For branching narratives
  branchId: z.string().optional(),
  conflictsWith: z.array(z.string()).optional()
});

export type GraphMutation = z.infer<typeof GraphMutationSchema>;

// Complete graph state at a point in time
export interface GraphSnapshot {
  timestamp: number;
  entities: Map<string, Entity>;
  relationships: Map<string, Relationship>;
  properties: Map<string, Map<string, any>>; // entity/relationship ID -> properties
  metadata: {
    sceneId: string;
    description: string;
    hash?: string; // For efficient comparison
  };
}

// Commit-like structure for narrative changes
export interface NarrativeCommit {
  id: string;
  timestamp: number;
  parentId: string | null;
  mutations: GraphMutation[];
  message: string;
  author?: string; // Could be character POV or narrator
  tags?: string[]; // For marking important moments
}

export class NarrativeStateMachine {
  private commits: Map<string, NarrativeCommit> = new Map();
  private snapshots: Map<number, GraphSnapshot> = new Map();
  private currentCommitId: string | null = null;
  private branches: Map<string, string> = new Map(); // branch name -> commit ID
  
  constructor() {
    // Initialize with empty state
    this.createInitialCommit();
  }
  
  private createInitialCommit() {
    const initialCommit: NarrativeCommit = {
      id: 'root',
      timestamp: 0,
      parentId: null,
      mutations: [],
      message: 'Initial empty narrative state'
    };
    
    this.commits.set(initialCommit.id, initialCommit);
    this.currentCommitId = initialCommit.id;
    this.branches.set('main', initialCommit.id);
    
    // Create initial empty snapshot
    this.snapshots.set(0, {
      timestamp: 0,
      entities: new Map(),
      relationships: new Map(),
      properties: new Map(),
      metadata: {
        sceneId: 'scene_0',
        description: 'Before the story begins'
      }
    });
  }
  
  /**
   * Apply a series of mutations as a single commit
   */
  commit(mutations: GraphMutation[], message: string, author?: string): string {
    if (!this.currentCommitId) {
      throw new Error('No current commit');
    }
    
    const timestamp = Math.max(...mutations.map(m => m.timestamp), 0);
    const commitId = this.generateCommitId(timestamp, message);
    
    const commit: NarrativeCommit = {
      id: commitId,
      timestamp,
      parentId: this.currentCommitId,
      mutations,
      message,
      author
    };
    
    // Validate mutations don't conflict
    this.validateMutations(mutations);
    
    // Apply mutations to create new snapshot
    const newSnapshot = this.applyMutations(mutations);
    
    // Store commit and snapshot
    this.commits.set(commitId, commit);
    this.snapshots.set(timestamp, newSnapshot);
    this.currentCommitId = commitId;
    
    return commitId;
  }
  
  /**
   * Apply mutations to current state to create new snapshot
   */
  private applyMutations(mutations: GraphMutation[]): GraphSnapshot {
    const currentSnapshot = this.getCurrentSnapshot();
    const newSnapshot: GraphSnapshot = {
      timestamp: Math.max(...mutations.map(m => m.timestamp)),
      entities: new Map(currentSnapshot.entities),
      relationships: new Map(currentSnapshot.relationships),
      properties: new Map(currentSnapshot.properties),
      metadata: {
        sceneId: mutations[mutations.length - 1]?.sceneId || currentSnapshot.metadata.sceneId,
        description: mutations.map(m => m.description).join('; ')
      }
    };
    
    // Apply each mutation
    for (const mutation of mutations) {
      this.applyMutation(newSnapshot, mutation);
    }
    
    // Generate hash for efficient comparison
    newSnapshot.metadata.hash = this.generateSnapshotHash(newSnapshot);
    
    return newSnapshot;
  }
  
  /**
   * Apply a single mutation to a snapshot
   */
  private applyMutation(snapshot: GraphSnapshot, mutation: GraphMutation) {
    switch (mutation.type) {
      case GraphMutationType.ENTITY_INTRODUCED:
        if (mutation.entityId && mutation.properties) {
          snapshot.entities.set(mutation.entityId, {
            id: mutation.entityId,
            name: mutation.properties.name || mutation.entityId,
            type: mutation.properties.type || 'unknown',
            ...mutation.properties
          });
          snapshot.properties.set(mutation.entityId, new Map(Object.entries(mutation.properties)));
        }
        break;
        
      case GraphMutationType.ENTITY_UPDATED:
        if (mutation.entityId) {
          const entity = snapshot.entities.get(mutation.entityId);
          if (entity && mutation.properties) {
            Object.assign(entity, mutation.properties);
            const props = snapshot.properties.get(mutation.entityId) || new Map();
            Object.entries(mutation.properties).forEach(([k, v]) => props.set(k, v));
            snapshot.properties.set(mutation.entityId, props);
          }
        }
        break;
        
      case GraphMutationType.ENTITY_REMOVED:
        if (mutation.entityId) {
          snapshot.entities.delete(mutation.entityId);
          snapshot.properties.delete(mutation.entityId);
          // Also remove relationships involving this entity
          snapshot.relationships.forEach((rel, id) => {
            if (rel.source === mutation.entityId || rel.target === mutation.entityId) {
              snapshot.relationships.delete(id);
              snapshot.properties.delete(id);
            }
          });
        }
        break;
        
      case GraphMutationType.RELATIONSHIP_FORMED:
        if (mutation.entityId && mutation.targetEntityId && mutation.properties) {
          const relId = mutation.relationshipId || `${mutation.entityId}_${mutation.targetEntityId}_${mutation.properties.type}`;
          snapshot.relationships.set(relId, {
            id: relId,
            source: mutation.entityId,
            target: mutation.targetEntityId,
            type: mutation.properties.type || 'unknown',
            strength: mutation.properties.strength || 1,
            ...mutation.properties
          });
          snapshot.properties.set(relId, new Map(Object.entries(mutation.properties)));
        }
        break;
        
      case GraphMutationType.RELATIONSHIP_BROKEN:
        if (mutation.relationshipId) {
          snapshot.relationships.delete(mutation.relationshipId);
          snapshot.properties.delete(mutation.relationshipId);
        }
        break;
        
      case GraphMutationType.PROPERTY_CHANGED:
        if (mutation.entityId && mutation.properties) {
          const props = snapshot.properties.get(mutation.entityId) || new Map();
          Object.entries(mutation.properties).forEach(([k, v]) => {
            props.set(k, v);
          });
          snapshot.properties.set(mutation.entityId, props);
        }
        break;
        
      case GraphMutationType.KNOWLEDGE_GAINED:
        if (mutation.entityId && mutation.properties) {
          const entity = snapshot.entities.get(mutation.entityId);
          if (entity) {
            const knowledge = entity.knowledge || [];
            knowledge.push(mutation.properties.knowledge);
            entity.knowledge = knowledge;
          }
        }
        break;
        
      // Add more mutation handlers as needed
    }
  }
  
  /**
   * Get the current state of the narrative graph
   */
  getCurrentSnapshot(): GraphSnapshot {
    if (!this.currentCommitId) {
      throw new Error('No current commit');
    }
    
    const commit = this.commits.get(this.currentCommitId);
    if (!commit) {
      throw new Error('Current commit not found');
    }
    
    return this.snapshots.get(commit.timestamp) || this.snapshots.get(0)!;
  }
  
  /**
   * Get state at a specific timestamp
   */
  getSnapshotAt(timestamp: number): GraphSnapshot | null {
    // Find the latest snapshot at or before the timestamp
    let latestSnapshot: GraphSnapshot | null = null;
    let latestTime = -1;
    
    this.snapshots.forEach((snapshot, time) => {
      if (time <= timestamp && time > latestTime) {
        latestSnapshot = snapshot;
        latestTime = time;
      }
    });
    
    return latestSnapshot;
  }
  
  /**
   * Compute diff between two timestamps
   */
  diff(timestamp1: number, timestamp2: number): GraphMutation[] {
    const snapshot1 = this.getSnapshotAt(timestamp1);
    const snapshot2 = this.getSnapshotAt(timestamp2);
    
    if (!snapshot1 || !snapshot2) {
      throw new Error('Invalid timestamps for diff');
    }
    
    const mutations: GraphMutation[] = [];
    const startTime = Math.min(timestamp1, timestamp2);
    const endTime = Math.max(timestamp1, timestamp2);
    
    // Find all commits between the timestamps
    this.commits.forEach(commit => {
      if (commit.timestamp > startTime && commit.timestamp <= endTime) {
        mutations.push(...commit.mutations);
      }
    });
    
    return mutations;
  }
  
  /**
   * Create a branch from current state
   */
  branch(branchName: string): string {
    if (!this.currentCommitId) {
      throw new Error('No current commit');
    }
    
    this.branches.set(branchName, this.currentCommitId);
    return this.currentCommitId;
  }
  
  /**
   * Switch to a different branch or commit
   */
  checkout(target: string) {
    // Check if it's a branch name
    const commitId = this.branches.get(target) || target;
    
    if (!this.commits.has(commitId)) {
      throw new Error(`Commit or branch not found: ${target}`);
    }
    
    this.currentCommitId = commitId;
  }
  
  /**
   * Get narrative history as a list of commits
   */
  getHistory(limit?: number): NarrativeCommit[] {
    const history: NarrativeCommit[] = [];
    let currentId: string | null = this.currentCommitId;
    
    while (currentId && (!limit || history.length < limit)) {
      const commit = this.commits.get(currentId);
      if (!commit) break;
      
      history.push(commit);
      currentId = commit.parentId;
    }
    
    return history;
  }
  
  /**
   * Export for visualization or persistence
   */
  export() {
    return {
      commits: Array.from(this.commits.entries()),
      snapshots: Array.from(this.snapshots.entries()).map(([time, snapshot]) => ({
        timestamp: time,
        entities: Array.from(snapshot.entities.values()),
        relationships: Array.from(snapshot.relationships.values()),
        properties: Array.from(snapshot.properties.entries()).map(([id, props]) => ({
          id,
          properties: Object.fromEntries(props)
        })),
        metadata: snapshot.metadata
      })),
      branches: Array.from(this.branches.entries()),
      currentCommitId: this.currentCommitId
    };
  }
  
  /**
   * Validate mutations don't conflict
   */
  private validateMutations(mutations: GraphMutation[]) {
    const entityOps = new Map<string, GraphMutation[]>();
    const relOps = new Map<string, GraphMutation[]>();
    
    for (const mutation of mutations) {
      if (mutation.entityId) {
        const ops = entityOps.get(mutation.entityId) || [];
        ops.push(mutation);
        entityOps.set(mutation.entityId, ops);
      }
      
      if (mutation.relationshipId) {
        const ops = relOps.get(mutation.relationshipId) || [];
        ops.push(mutation);
        relOps.set(mutation.relationshipId, ops);
      }
    }
    
    // Check for conflicting operations on same entity
    entityOps.forEach((ops, entityId) => {
      const hasRemove = ops.some(op => op.type === GraphMutationType.ENTITY_REMOVED);
      const hasUpdate = ops.some(op => op.type === GraphMutationType.ENTITY_UPDATED);
      
      if (hasRemove && hasUpdate) {
        throw new Error(`Conflicting operations on entity ${entityId}: cannot update and remove`);
      }
    });
  }
  
  private generateCommitId(timestamp: number, message: string): string {
    return `commit_${timestamp}_${message.substring(0, 20).replace(/\s/g, '_')}`;
  }
  
  private generateSnapshotHash(snapshot: GraphSnapshot): string {
    const content = JSON.stringify({
      entities: Array.from(snapshot.entities.keys()).sort(),
      relationships: Array.from(snapshot.relationships.keys()).sort(),
      properties: Array.from(snapshot.properties.keys()).sort()
    });
    
    // Simple hash for now
    return Buffer.from(content).toString('base64').substring(0, 8);
  }
}