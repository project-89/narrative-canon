/**
 * NarrativeCanonGraph - Extends TemporalNarrativeGraph with Git-like commit tracking
 * 
 * This is the core data structure that combines temporal graph evolution
 * with version control concepts for narrative engineering.
 */

import { TemporalNarrativeGraph } from '../core/temporal-graph';
import { Entity, Relationship, Interaction } from '../types';
import {
  GraphOperation,
  NarrativeCommit,
  TimelineBranch,
  CanonicalEvent,
  GraphCondition,
  MergeConfig,
  MergeResult,
  MergeConflict,
  GraphDiff,
  CommitQuery,
  AddEntityOperation,
  RemoveEntityOperation,
  UpdateEntityOperation,
  AddRelationshipOperation,
  RemoveRelationshipOperation,
  UpdateRelationshipOperation,
  AddInteractionOperation,
  UpdateInteractionOperation
} from './types';
import { createHash } from 'crypto';

export interface CommitMetadata {
  author: string;
  message: string;
  canonicalEvent?: CanonicalEvent;
  tags?: string[];
}

export class NarrativeCanonGraph extends TemporalNarrativeGraph {
  // Git-like structures
  private commits: Map<string, NarrativeCommit> = new Map();
  private branches: Map<string, TimelineBranch> = new Map();
  private currentBranch: string = 'main';
  private stagedOperations: GraphOperation[] = [];
  
  // Canonical states tracking
  private canonicalStates: Map<string, CanonicalEvent> = new Map();
  
  // Make entities, relationships, and interactions accessible from parent class
  protected entities: Map<string, Entity> = new Map();
  protected relationships: Map<string, Relationship> = new Map();
  protected interactions: Map<string, Interaction> = new Map();

  constructor() {
    super();
    this.initializeMainBranch();
  }
  
  private initializeMainBranch() {
    const now = Date.now();
    this.branches.set('main', {
      id: 'main',
      name: 'Primary Timeline',
      parentCommit: '',
      headCommit: '',
      createdAt: now,
      updatedAt: now,
      probability: 1.0,
      isCanon: true
    });
  }
  
  /**
   * Stage operations for the next commit
   */
  stage(...operations: GraphOperation[]): void {
    this.stagedOperations.push(...operations);
  }
  
  /**
   * Clear staged operations
   */
  unstage(): void {
    this.stagedOperations = [];
  }
  
  /**
   * Create a commit from staged operations
   */
  async commit(metadata: CommitMetadata): Promise<NarrativeCommit> {
    if (this.stagedOperations.length === 0) {
      throw new Error('No operations staged for commit');
    }
    
    // Apply operations to create new state
    const operations = [...this.stagedOperations];
    await this.applyOperations(operations);
    
    // Calculate metrics
    const metrics = this.calculateCommitMetrics(operations);
    
    // Create commit
    const commit: NarrativeCommit = {
      id: this.generateCommitId(),
      author: metadata.author,
      timestamp: Date.now(),
      message: metadata.message,
      parentCommit: this.getCurrentHead(),
      treeHash: this.calculateTreeHash(),
      operations,
      canonicalEvent: metadata.canonicalEvent,
      metrics,
      branch: this.currentBranch,
      tags: metadata.tags
    };
    
    // Store commit and update branch
    this.commits.set(commit.id, commit);
    this.updateBranchHead(commit.id);
    
    // Clear staged operations
    this.stagedOperations = [];
    
    // Check if we've reached any canonical states
    if (metadata.canonicalEvent) {
      this.canonicalStates.set(metadata.canonicalEvent.id, metadata.canonicalEvent);
    }
    
    return commit;
  }
  
  /**
   * Apply operations to the graph
   */
  private async applyOperations(operations: GraphOperation[]): Promise<void> {
    for (const op of operations) {
      await this.applyOperation(op);
    }
  }
  
  /**
   * Apply a single operation
   */
  private async applyOperation(operation: GraphOperation): Promise<void> {
    switch (operation.type) {
      case 'ADD_ENTITY':
        const addOp = operation as AddEntityOperation;
        this.entities.set(addOp.payload.id, addOp.payload);
        break;
        
      case 'REMOVE_ENTITY':
        const removeOp = operation as RemoveEntityOperation;
        this.entities.delete(removeOp.payload.entityId);
        if (!removeOp.payload.preserveRelationships) {
          // Remove associated relationships
          for (const [relId, rel] of this.relationships) {
            if (rel.source === removeOp.payload.entityId || 
                rel.target === removeOp.payload.entityId) {
              this.relationships.delete(relId);
            }
          }
        }
        break;
        
      case 'UPDATE_ENTITY':
        const updateOp = operation as UpdateEntityOperation;
        const entity = this.entities.get(updateOp.payload.entityId);
        if (entity) {
          const updated = this.mergeEntityUpdate(entity, updateOp.payload.changes, updateOp.payload.mergeArrays);
          this.entities.set(entity.id, updated);
        }
        break;
        
      case 'ADD_RELATIONSHIP':
        const addRelOp = operation as AddRelationshipOperation;
        this.relationships.set(addRelOp.payload.id, addRelOp.payload);
        break;
        
      case 'REMOVE_RELATIONSHIP':
        const removeRelOp = operation as RemoveRelationshipOperation;
        this.relationships.delete(removeRelOp.payload.relationshipId);
        break;
        
      case 'UPDATE_RELATIONSHIP':
        const updateRelOp = operation as UpdateRelationshipOperation;
        const rel = this.relationships.get(updateRelOp.payload.relationshipId);
        if (rel) {
          const updated = { ...rel, ...updateRelOp.payload.changes };
          this.relationships.set(rel.id, updated);
        }
        break;

      case 'ADD_INTERACTION':
        const addIntOp = operation as AddInteractionOperation;
        this.interactions.set(addIntOp.payload.id, addIntOp.payload);
        break;

      case 'UPDATE_INTERACTION':
        const updateIntOp = operation as UpdateInteractionOperation;
        const interaction = this.interactions.get(updateIntOp.payload.interactionId);
        if (interaction) {
          const updated = { ...interaction, ...updateIntOp.payload.changes };
          this.interactions.set(interaction.id, updated as Interaction);
        }
        break;

      // Timeline operations handled separately
      case 'TIMELINE_BRANCH':
      case 'TIMELINE_MERGE':
        // These are handled at a higher level
        break;
    }
  }
  
  /**
   * Merge entity updates intelligently
   */
  private mergeEntityUpdate(entity: Entity, changes: Partial<Entity>, mergeArrays?: boolean): Entity {
    const updated = { ...entity };
    
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) continue;
      
      if (Array.isArray(value) && Array.isArray(entity[key as keyof Entity]) && mergeArrays) {
        // Merge arrays by combining unique values
        const existing = entity[key as keyof Entity] as any[];
        const combined = [...existing, ...value];
        (updated as any)[key] = [...new Set(combined)];
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Deep merge objects
        (updated as any)[key] = {
          ...(entity[key as keyof Entity] as any || {}),
          ...value
        };
      } else {
        // Direct replacement
        (updated as any)[key] = value;
      }
    }
    
    return updated;
  }
  
  /**
   * Create a new branch
   */
  branch(name: string, fromCommit?: string): TimelineBranch {
    if (this.branches.has(name)) {
      throw new Error(`Branch '${name}' already exists`);
    }
    
    const parentCommit = fromCommit || this.getCurrentHead();
    const now = Date.now();
    
    const newBranch: TimelineBranch = {
      id: `branch_${name}_${now}`,
      name,
      parentCommit,
      headCommit: parentCommit,
      createdAt: now,
      updatedAt: now,
      probability: 0.5, // New branches start at 50% probability
      isCanon: false
    };
    
    this.branches.set(name, newBranch);
    return newBranch;
  }
  
  /**
   * Switch to a different branch
   */
  async checkout(branchName: string): Promise<void> {
    if (!this.branches.has(branchName)) {
      throw new Error(`Branch '${branchName}' does not exist`);
    }
    
    // Clear any staged operations
    this.stagedOperations = [];
    
    // Switch branch
    this.currentBranch = branchName;
    
    // Rebuild graph state at branch head
    const headCommit = this.getCurrentHead();
    if (headCommit) {
      await this.resetToCommit(headCommit);
    }
  }
  
  /**
   * Merge another branch into current branch
   */
  async merge(sourceBranch: string, config?: MergeConfig): Promise<MergeResult> {
    const source = this.branches.get(sourceBranch);
    const target = this.branches.get(this.currentBranch);
    
    if (!source || !target) {
      throw new Error('Invalid branch for merge');
    }
    
    // Find common ancestor
    const commonAncestor = this.findCommonAncestor(source.headCommit, target.headCommit);
    
    // Get operations from source branch since common ancestor
    const sourceOps = this.getOperationsSince(commonAncestor, source.headCommit);
    const targetOps = this.getOperationsSince(commonAncestor, target.headCommit);
    
    // Detect conflicts
    const conflicts = this.detectConflicts(sourceOps, targetOps);
    
    if (conflicts.length > 0 && !config?.conflictResolution) {
      return {
        success: false,
        conflicts
      };
    }
    
    // Apply merge strategy
    const mergedOps = await this.applyMergeStrategy(
      sourceOps, 
      targetOps, 
      conflicts, 
      config
    );
    
    // Create merge commit
    const mergeCommit = await this.commit({
      author: 'merge',
      message: config?.message || `Merge branch '${sourceBranch}' into ${this.currentBranch}`,
      tags: ['merge']
    });
    
    return {
      success: true,
      commitId: mergeCommit.id,
      operations: mergedOps,
      metrics: {
        entitiesMerged: mergedOps.filter(op => op.type.includes('ENTITY')).length,
        relationshipsMerged: mergedOps.filter(op => op.type.includes('RELATIONSHIP')).length,
        conflictsResolved: conflicts.length,
        timelineDivergence: this.calculateTimelineDivergence()
      }
    };
  }
  
  /**
   * Get the diff between two commits
   */
  diff(fromCommit: string, toCommit: string): GraphDiff {
    const fromState = this.getGraphStateAtCommit(fromCommit);
    const toState = this.getGraphStateAtCommit(toCommit);
    
    const diff: GraphDiff = {
      from: fromCommit,
      to: toCommit,
      addedEntities: [],
      removedEntities: [],
      modifiedEntities: [],
      addedRelationships: [],
      removedRelationships: [],
      modifiedRelationships: [],
      stats: {
        totalChanges: 0,
        entitiesAffected: 0,
        relationshipsAffected: 0,
        timelineDivergence: 0
      }
    };
    
    // Compare entities
    for (const [id, entity] of toState.entities) {
      if (!fromState.entities.has(id)) {
        diff.addedEntities.push(entity);
      } else {
        const fromEntity = fromState.entities.get(id)!;
        const changes = this.getEntityChanges(fromEntity, entity);
        if (Object.keys(changes).length > 0) {
          diff.modifiedEntities.push({ entityId: id, changes });
        }
      }
    }
    
    for (const [id] of fromState.entities) {
      if (!toState.entities.has(id)) {
        diff.removedEntities.push(id);
      }
    }
    
    // Compare relationships (similar logic)
    // ... implementation ...
    
    // Calculate stats
    diff.stats.totalChanges = 
      diff.addedEntities.length + 
      diff.removedEntities.length + 
      diff.modifiedEntities.length +
      diff.addedRelationships.length +
      diff.removedRelationships.length +
      diff.modifiedRelationships.length;
      
    diff.stats.entitiesAffected = 
      diff.addedEntities.length +
      diff.removedEntities.length +
      diff.modifiedEntities.length;
      
    diff.stats.relationshipsAffected =
      diff.addedRelationships.length +
      diff.removedRelationships.length +
      diff.modifiedRelationships.length;
    
    return diff;
  }
  
  /**
   * Query commit history
   */
  queryCommits(query: CommitQuery): NarrativeCommit[] {
    let commits: NarrativeCommit[];
    
    // Filter by branch - get all commits reachable from branch HEAD
    if (query.branch) {
      const branches = Array.isArray(query.branch) ? query.branch : [query.branch];
      const reachableCommits = new Set<NarrativeCommit>();
      
      for (const branchName of branches) {
        const branch = this.branches.get(branchName);
        if (branch && branch.headCommit) {
          const chain = this.getCommitChain(branch.headCommit);
          chain.forEach(c => reachableCommits.add(c));
        }
      }
      
      commits = Array.from(reachableCommits);
    } else {
      commits = Array.from(this.commits.values());
    }
    
    // Filter by time
    if (query.since) {
      const since = typeof query.since === 'number' ? query.since : query.since.getTime();
      commits = commits.filter(c => c.timestamp >= since);
    }
    
    if (query.until) {
      const until = typeof query.until === 'number' ? query.until : query.until.getTime();
      commits = commits.filter(c => c.timestamp <= until);
    }
    
    // Filter by author
    if (query.author) {
      const authors = Array.isArray(query.author) ? query.author : [query.author];
      commits = commits.filter(c => authors.includes(c.author));
    }
    
    // Sort by timestamp descending
    commits.sort((a, b) => b.timestamp - a.timestamp);
    
    // Apply pagination
    if (query.offset) {
      commits = commits.slice(query.offset);
    }
    
    if (query.limit) {
      commits = commits.slice(0, query.limit);
    }
    
    return commits;
  }
  
  // Helper methods
  
  private getCurrentHead(): string {
    const branch = this.branches.get(this.currentBranch);
    return branch?.headCommit || '';
  }
  
  private updateBranchHead(commitId: string): void {
    const branch = this.branches.get(this.currentBranch);
    if (branch) {
      branch.headCommit = commitId;
      branch.updatedAt = Date.now();
    }
  }
  
  private generateCommitId(): string {
    return `commit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private calculateTreeHash(): string {
    // Create a deterministic hash of the current graph state
    const entities = Array.from(this.entities.entries()).sort(([a], [b]) => a.localeCompare(b));
    const relationships = Array.from(this.relationships.entries()).sort(([a], [b]) => a.localeCompare(b));
    
    const stateString = JSON.stringify({ entities, relationships });
    return createHash('sha256').update(stateString).digest('hex').substr(0, 16);
  }
  
  private calculateCommitMetrics(operations: GraphOperation[]) {
    const entitiesAffected = new Set<string>();
    const relationshipsChanged = new Set<string>();
    
    for (const op of operations) {
      switch (op.type) {
        case 'ADD_ENTITY':
        case 'REMOVE_ENTITY':
        case 'UPDATE_ENTITY':
          entitiesAffected.add(
            (op as any).payload.id || (op as any).payload.entityId
          );
          break;
        case 'ADD_RELATIONSHIP':
        case 'REMOVE_RELATIONSHIP':
        case 'UPDATE_RELATIONSHIP':
          relationshipsChanged.add(
            (op as any).payload.id || (op as any).payload.relationshipId
          );
          break;
      }
    }
    
    return {
      coherenceScore: this.calculateCoherence(),
      timelineDivergence: this.calculateTimelineDivergence(),
      entitiesAffected: entitiesAffected.size,
      relationshipsChanged: relationshipsChanged.size
    };
  }
  
  private calculateCoherence(): number {
    // Measure narrative coherence based on graph structure
    // This is a simplified version - could be much more sophisticated
    const entityCount = this.entities.size;
    const relationshipCount = this.relationships.size;
    
    if (entityCount === 0) return 1.0;
    
    // Ideal ratio of relationships to entities (connected graph)
    const idealRatio = 1.5;
    const actualRatio = relationshipCount / entityCount;
    
    // Score based on how close we are to ideal ratio
    const ratioScore = 1 - Math.abs(idealRatio - actualRatio) / idealRatio;
    
    return Math.max(0, Math.min(1, ratioScore));
  }
  
  private calculateTimelineDivergence(): number {
    // Measure how far this timeline has diverged from main
    if (this.currentBranch === 'main') return 0;
    
    const branch = this.branches.get(this.currentBranch);
    if (!branch) return 0;
    
    // Simple version: inverse of probability
    return 1 - branch.probability;
  }
  
  private async resetToCommit(commitId: string): Promise<void> {
    // Clear current state
    this.entities.clear();
    this.relationships.clear();
    
    // Replay commits up to target
    const commits = this.getCommitChain(commitId);
    for (const commit of commits) {
      await this.applyOperations(commit.operations);
    }
  }
  
  private getCommitChain(toCommit: string): NarrativeCommit[] {
    const chain: NarrativeCommit[] = [];
    let current = this.commits.get(toCommit);
    
    while (current) {
      chain.unshift(current);
      current = current.parentCommit ? this.commits.get(current.parentCommit) : undefined;
    }
    
    return chain;
  }
  
  private findCommonAncestor(commit1: string, commit2: string): string {
    const ancestors1 = new Set<string>();
    let current = this.commits.get(commit1);
    
    while (current) {
      ancestors1.add(current.id);
      current = current.parentCommit ? this.commits.get(current.parentCommit) : undefined;
    }
    
    current = this.commits.get(commit2);
    while (current) {
      if (ancestors1.has(current.id)) {
        return current.id;
      }
      current = current.parentCommit ? this.commits.get(current.parentCommit) : undefined;
    }
    
    return '';
  }
  
  private getOperationsSince(fromCommit: string, toCommit: string): GraphOperation[] {
    const operations: GraphOperation[] = [];
    const chain = this.getCommitChain(toCommit);
    
    let foundStart = false;
    for (const commit of chain) {
      if (foundStart) {
        operations.push(...commit.operations);
      }
      if (commit.id === fromCommit) {
        foundStart = true;
      }
    }
    
    return operations;
  }
  
  private detectConflicts(sourceOps: GraphOperation[], targetOps: GraphOperation[]): MergeConflict[] {
    const conflicts: MergeConflict[] = [];
    
    // Simplified conflict detection - could be much more sophisticated
    const sourceEntities = new Set<string>();
    const targetEntities = new Set<string>();
    
    for (const op of sourceOps) {
      if (op.type === 'UPDATE_ENTITY') {
        sourceEntities.add((op as UpdateEntityOperation).payload.entityId);
      }
    }
    
    for (const op of targetOps) {
      if (op.type === 'UPDATE_ENTITY') {
        targetEntities.add((op as UpdateEntityOperation).payload.entityId);
      }
    }
    
    // Check for entities modified in both branches
    for (const entityId of sourceEntities) {
      if (targetEntities.has(entityId)) {
        conflicts.push({
          type: 'ENTITY_CONFLICT',
          entityId,
          sourceValue: 'modified in source',
          targetValue: 'modified in target',
          suggestions: [
            {
              action: 'manual-merge',
              description: 'Manually merge entity changes',
              confidence: 0.5
            }
          ]
        });
      }
    }
    
    return conflicts;
  }
  
  private async applyMergeStrategy(
    sourceOps: GraphOperation[],
    targetOps: GraphOperation[],
    conflicts: MergeConflict[],
    config?: MergeConfig
  ): Promise<GraphOperation[]> {
    // Simple merge strategy - in reality would be much more sophisticated
    const strategy = config?.strategy || 'three-way';
    
    switch (strategy) {
      case 'ours':
        return targetOps;
      case 'theirs':
        return sourceOps;
      default:
        // Three-way merge: apply both sets of operations
        return [...targetOps, ...sourceOps];
    }
  }
  
  private getGraphStateAtCommit(commitId: string) {
    // This would actually rebuild the graph state at a specific commit
    // For now, return current state
    return {
      entities: new Map(this.entities),
      relationships: new Map(this.relationships)
    };
  }
  
  private getEntityChanges(from: Entity, to: Entity): Partial<Entity> {
    const changes: Partial<Entity> = {};
    
    // Compare all properties
    for (const key of Object.keys(to) as Array<keyof Entity>) {
      if (JSON.stringify(from[key]) !== JSON.stringify(to[key])) {
        (changes as any)[key] = to[key];
      }
    }
    
    return changes;
  }

  // Public accessor methods for tests and external use
  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  hasEntity(id: string): boolean {
    return this.entities.has(id);
  }

  getRelationship(id: string): Relationship | undefined {
    return this.relationships.get(id);
  }

  hasRelationship(id: string): boolean {
    return this.relationships.has(id);
  }

  getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  getAllRelationships(): Relationship[] {
    return Array.from(this.relationships.values());
  }
}