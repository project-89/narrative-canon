/**
 * CORE NARRATIVE VERSIONING SYSTEM
 * 
 * This is the heart of our "git for narrative" architecture.
 * It provides version control, branching, merging, and consistency tracking
 * for collaborative storytelling at scale.
 */

import { z } from 'zod';

// ============================================================================
// CORE DATA TYPES
// ============================================================================

export interface NarrativeCommit {
  id: string;
  hash: string; // SHA-256 hash for integrity
  parentCommits: string[];
  timestamp: Date; // When this was committed (real world time)
  author: string;
  message: string;
  
  // Narrative timeline placement
  narrativeDate?: Date; // When this happens in the story world
  narrativeOrder?: number; // Explicit ordering for same-date events
  timelineContext?: { // Additional temporal metadata
    year: number;
    month?: number;
    day?: number;
    era?: string; // e.g., "pre-resistance", "post-breach"
  };
  
  // Narrative changes in this commit
  entities: EntityChange[];
  relationships: RelationshipChange[];
  scenes: SceneChange[];
  worldState: WorldStateSnapshot;
  
  // Metadata
  branch: string;
  tags: string[];
  significance: number; // 0-1 importance score
  conflictResolutions: ConflictResolution[];
}

export interface EntityChange {
  changeType: 'create' | 'update' | 'delete' | 'merge';
  entityId: string;
  entity?: NarrativeEntity;
  previousVersion?: NarrativeEntity;
  changes: Partial<NarrativeEntity>;
  evidence: string[]; // Text evidence for this change
}

export interface RelationshipChange {
  changeType: 'create' | 'update' | 'delete' | 'strengthen' | 'weaken';
  relationshipId: string;
  relationship?: NarrativeRelationship;
  previousVersion?: NarrativeRelationship;
  changes: Partial<NarrativeRelationship>;
  evidence: string[];
}

export interface SceneChange {
  changeType: 'create' | 'update' | 'split' | 'merge' | 'reorder';
  sceneId: string;
  scene?: NarrativeScene;
  previousVersion?: NarrativeScene;
  changes: Partial<NarrativeScene>;
  position: number; // Order in timeline
}

// ============================================================================
// WORLD STATE & CONSISTENCY
// ============================================================================

export interface WorldStateSnapshot {
  commitId: string;
  timestamp: Date;
  
  // Entity states at this point in time
  entityStates: Map<string, EntityState>;
  
  // Active relationships
  activeRelationships: Map<string, RelationshipState>;
  
  // Scene timeline
  sceneTimeline: SceneTimelineEntry[];
  
  // Consistency checks
  consistencyScore: number; // 0-1
  inconsistencies: Inconsistency[];
  
  // Narrative metrics
  metrics: NarrativeMetrics;
}

export interface EntityState {
  entityId: string;
  lastModified: string; // commit hash
  properties: Record<string, any>;
  location?: string;
  status: 'active' | 'inactive' | 'unknown' | 'destroyed';
  significance: number;
  relationshipCount: number;
}

export interface RelationshipState {
  relationshipId: string;
  lastModified: string;
  source: string;
  target: string;
  type: string;
  strength: number;
  active: boolean;
  evidence: string[];
}

export interface SceneTimelineEntry {
  sceneId: string;
  position: number;
  timestamp?: Date;
  duration?: number; // in narrative time
  significance: number;
  entities: string[]; // entities present
  events: string[]; // what happens
}

// ============================================================================
// CONSISTENCY & CONFLICT RESOLUTION
// ============================================================================

export interface Inconsistency {
  id: string;
  type: 'entity_conflict' | 'relationship_conflict' | 'temporal_paradox' | 'logical_contradiction';
  severity: 'minor' | 'major' | 'critical';
  description: string;
  affectedCommits: string[];
  affectedEntities: string[];
  suggestedResolution?: string;
  autoResolvable: boolean;
}

export interface ConflictResolution {
  conflictId: string;
  resolutionType: 'auto_merge' | 'manual_choice' | 'community_vote' | 'ai_arbitration';
  resolution: 'accept_ours' | 'accept_theirs' | 'merge_both' | 'create_branch' | 'custom';
  justification: string;
  confidence: number; // 0-1
  resolver: string; // who/what resolved it
}

export interface NarrativeMetrics {
  totalEntities: number;
  totalRelationships: number;
  totalScenes: number;
  narrativeComplexity: number; // derived metric
  characterDevelopment: number; // how much characters change
  plotCohesion: number; // how well scenes connect
  worldConsistency: number; // how consistent the world is
  temporalCoherence: number; // timeline makes sense
}

// ============================================================================
// BRANCHING & MERGING
// ============================================================================

export interface NarrativeBranch {
  name: string;
  createdFrom: string; // commit hash
  createdAt: Date;
  creator: string;
  description: string;
  
  // Branch state
  head: string; // current commit hash
  commits: string[];
  active: boolean;
  
  // Merge info
  mergedInto?: string; // branch name
  mergedAt?: Date;
  mergeCommit?: string;
  
  // Branch type
  type: 'main' | 'feature' | 'experimental' | 'alternative' | 'hotfix';
  
  // Collaboration
  contributors: string[];
  reviewers: string[];
  status: 'active' | 'merged' | 'abandoned' | 'archived';
}

export interface MergeRequest {
  id: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
  author: string;
  
  // Merge analysis
  conflicts: MergeConflict[];
  autoMergeable: boolean;
  impactAssessment: MergeImpact;
  
  // Review process
  reviewers: string[];
  approvals: string[];
  rejections: string[];
  status: 'open' | 'approved' | 'rejected' | 'merged' | 'closed';
  
  // Resolution
  resolutionStrategy: MergeStrategy;
  resolvedConflicts: ConflictResolution[];
}

export interface MergeConflict {
  type: 'entity_divergence' | 'relationship_change' | 'scene_reorder' | 'timeline_split';
  entityId?: string;
  relationshipId?: string;
  sceneId?: string;
  
  ourVersion: any;
  theirVersion: any;
  commonAncestor?: any;
  
  severity: 'trivial' | 'minor' | 'major' | 'blocking';
  autoResolvable: boolean;
  suggestedResolution?: any;
}

export interface MergeImpact {
  entitiesAffected: string[];
  relationshipsAffected: string[];
  scenesAffected: string[];
  
  consistencyImpact: number; // -1 to 1 (negative = worse, positive = better)
  narrativeImpact: number;
  
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

export type MergeStrategy = 
  | 'fast_forward'     // No conflicts, simple append
  | 'three_way_merge'  // Standard git-style merge
  | 'narrative_merge'  // AI-assisted story merge
  | 'community_vote'   // Let community decide
  | 'parallel_canon'   // Keep both as alternative timelines
  | 'cherry_pick';     // Select specific changes

// ============================================================================
// NARRATIVE ENTITIES (Enhanced)
// ============================================================================

export interface NarrativeEntity {
  id: string;
  name: string;
  type: 'character' | 'location' | 'object' | 'organization' | 'concept' | 'event';
  
  // Core properties
  description?: string;
  aliases: string[];
  significance: number;
  
  // Character-specific
  role?: 'protagonist' | 'antagonist' | 'supporting' | 'minor' | 'background';
  species?: string;
  profession?: string;
  personality: string[];
  motivations: string[];
  abilities: string[];
  
  // Contextual
  introduction?: string;
  status?: string;
  emotional_state: string[];
  goals: string[];
  
  // Versioning
  firstMentioned: number;
  lastModified: string; // commit hash
  version: number;
  changeHistory: EntityChange[];
}

export interface NarrativeRelationship {
  id: string;
  source: string;
  target: string;
  type: string;
  
  // Properties
  description: string;
  strength: number;
  directionality: 'unidirectional' | 'bidirectional';
  temporality: 'permanent' | 'temporary' | 'evolving';
  
  // Context
  evidence: string[];
  source_emotion?: string;
  target_emotion?: string;
  overall_tone: 'positive' | 'negative' | 'neutral' | 'complex';
  
  // Timeline
  first_mentioned: number;
  scene_context?: string;
  
  // Versioning
  lastModified: string;
  version: number;
  changeHistory: RelationshipChange[];
}

export interface NarrativeScene {
  id: string;
  title: string;
  content: string;
  
  // Structure
  position: number;
  significance: number;
  boundaryType?: string;
  
  // Participants
  entities: string[];
  relationships: string[];
  
  // Events
  events: SceneEvent[];
  
  // Context
  location?: string;
  timeframe?: string;
  mood?: string;
  
  // Versioning
  lastModified: string;
  version: number;
  changeHistory: SceneChange[];
}

export interface SceneEvent {
  id: string;
  description: string;
  participants: string[];
  sequence: number;
  significance: number;
  outcomes: string[];
}

// ============================================================================
// CONSISTENCY ALGORITHMS
// ============================================================================

export class NarrativeConsistencyEngine {
  
  /**
   * Check world state consistency after a commit
   */
  async checkConsistency(worldState: WorldStateSnapshot): Promise<Inconsistency[]> {
    const inconsistencies: Inconsistency[] = [];
    
    // Entity consistency checks
    inconsistencies.push(...await this.checkEntityConsistency(worldState));
    
    // Relationship consistency checks
    inconsistencies.push(...await this.checkRelationshipConsistency(worldState));
    
    // Temporal consistency checks
    inconsistencies.push(...await this.checkTemporalConsistency(worldState));
    
    // Logical consistency checks
    inconsistencies.push(...await this.checkLogicalConsistency(worldState));
    
    return inconsistencies;
  }
  
  private async checkEntityConsistency(worldState: WorldStateSnapshot): Promise<Inconsistency[]> {
    const inconsistencies: Inconsistency[] = [];
    
    for (const [entityId, state] of worldState.entityStates) {
      // Check for impossible states
      if (state.status === 'destroyed' && state.relationshipCount > 0) {
        inconsistencies.push({
          id: `entity_${entityId}_destroyed_with_relationships`,
          type: 'entity_conflict',
          severity: 'major',
          description: `Entity ${entityId} is marked as destroyed but still has active relationships`,
          affectedCommits: [state.lastModified],
          affectedEntities: [entityId],
          autoResolvable: true
        });
      }
      
      // Check for location paradoxes
      if (state.location) {
        const locationState = worldState.entityStates.get(state.location);
        if (locationState?.status === 'destroyed') {
          inconsistencies.push({
            id: `entity_${entityId}_in_destroyed_location`,
            type: 'logical_contradiction',
            severity: 'major',
            description: `Entity ${entityId} is located in destroyed location ${state.location}`,
            affectedCommits: [state.lastModified],
            affectedEntities: [entityId, state.location],
            autoResolvable: false
          });
        }
      }
    }
    
    return inconsistencies;
  }
  
  private async checkRelationshipConsistency(worldState: WorldStateSnapshot): Promise<Inconsistency[]> {
    const inconsistencies: Inconsistency[] = [];
    
    for (const [relId, rel] of worldState.activeRelationships) {
      const sourceState = worldState.entityStates.get(rel.source);
      const targetState = worldState.entityStates.get(rel.target);
      
      // Check if entities exist
      if (!sourceState || !targetState) {
        inconsistencies.push({
          id: `relationship_${relId}_missing_entities`,
          type: 'relationship_conflict',
          severity: 'critical',
          description: `Relationship ${relId} references non-existent entities`,
          affectedCommits: [rel.lastModified],
          affectedEntities: [rel.source, rel.target],
          autoResolvable: true
        });
      }
      
      // Check for conflicting relationships
      if (rel.type === 'enemy' && rel.strength > 0.7) {
        // Look for friendship relationships between same entities
        for (const [otherId, otherRel] of worldState.activeRelationships) {
          if (otherId !== relId && 
              ((otherRel.source === rel.source && otherRel.target === rel.target) ||
               (otherRel.source === rel.target && otherRel.target === rel.source)) &&
              otherRel.type === 'friendship' && otherRel.strength > 0.7) {
            
            inconsistencies.push({
              id: `relationship_conflict_${relId}_${otherId}`,
              type: 'relationship_conflict',
              severity: 'major',
              description: `Strong enemy and friendship relationships between same entities`,
              affectedCommits: [rel.lastModified, otherRel.lastModified],
              affectedEntities: [rel.source, rel.target],
              autoResolvable: false
            });
          }
        }
      }
    }
    
    return inconsistencies;
  }
  
  private async checkTemporalConsistency(worldState: WorldStateSnapshot): Promise<Inconsistency[]> {
    const inconsistencies: Inconsistency[] = [];
    
    // Get all commits with narrative dates
    const timedCommits = this.getAllCommitsWithNarrativeDates();
    const sortedCommits = timedCommits.sort((a, b) => 
      (a.narrativeDate?.getTime() || 0) - (b.narrativeDate?.getTime() || 0)
    );
    
    // Track entity lifecycle across narrative timeline
    const entityLifecycle = new Map<string, {
      created: Date | null,
      destroyed: Date | null,
      lastSeen: Date | null
    }>();
    
    // Build lifecycle map
    for (const commit of sortedCommits) {
      for (const change of commit.entities) {
        const lifecycle = entityLifecycle.get(change.entityId) || {
          created: null,
          destroyed: null,
          lastSeen: null
        };
        
        if (change.changeType === 'create' && commit.narrativeDate) {
          lifecycle.created = commit.narrativeDate;
        } else if (change.changeType === 'delete' && commit.narrativeDate) {
          lifecycle.destroyed = commit.narrativeDate;
        }
        
        if (commit.narrativeDate) {
          lifecycle.lastSeen = commit.narrativeDate;
        }
        
        entityLifecycle.set(change.entityId, lifecycle);
      }
    }
    
    // Check for temporal violations
    for (const [entityId, lifecycle] of entityLifecycle) {
      // Entity appears after destruction
      if (lifecycle.destroyed && lifecycle.lastSeen && 
          lifecycle.lastSeen > lifecycle.destroyed) {
        inconsistencies.push({
          id: `temporal_${entityId}_resurrection`,
          type: 'temporal_paradox',
          severity: 'critical',
          description: `Entity ${entityId} appears after being destroyed`,
          affectedCommits: [],
          affectedEntities: [entityId],
          suggestedResolution: 'Create resurrection event or alternate timeline',
          autoResolvable: false
        });
      }
    }
    
    // Check for causality violations in relationships
    for (const [relId, relState] of worldState.activeRelationships) {
      const sourceLife = entityLifecycle.get(relState.source);
      const targetLife = entityLifecycle.get(relState.target);
      
      if (sourceLife?.destroyed && targetLife?.created && 
          sourceLife.destroyed < targetLife.created) {
        inconsistencies.push({
          id: `temporal_relationship_${relId}_impossible`,
          type: 'temporal_paradox',
          severity: 'major',
          description: `Relationship between ${relState.source} and ${relState.target} impossible - source destroyed before target created`,
          affectedCommits: [],
          affectedEntities: [relState.source, relState.target],
          autoResolvable: false
        });
      }
    }
    
    return inconsistencies;
  }
  
  private getAllCommitsWithNarrativeDates(): NarrativeCommit[] {
    // This would be implemented by the repository
    // For now, return empty array
    return [];
  }
  
  private async checkLogicalConsistency(worldState: WorldStateSnapshot): Promise<Inconsistency[]> {
    const inconsistencies: Inconsistency[] = [];
    
    // Check for logical impossibilities
    // e.g., character being in two places at once
    // e.g., using technology that doesn't exist yet
    // e.g., knowing information they shouldn't have access to
    
    // This would be enhanced with domain-specific rules
    // For Project 89: check simulation rules, technology constraints, etc.
    
    return inconsistencies;
  }
}

// ============================================================================
// MERGE ALGORITHMS
// ============================================================================

export class NarrativeMergeEngine {
  
  async analyzeMerge(
    sourceCommits: NarrativeCommit[], 
    targetCommits: NarrativeCommit[],
    commonAncestor: NarrativeCommit
  ): Promise<MergeRequest> {
    
    const conflicts: MergeConflict[] = [];
    const entitiesAffected = new Set<string>();
    const relationshipsAffected = new Set<string>();
    const scenesAffected = new Set<string>();
    
    // Find all changes since common ancestor in both branches
    const sourceChanges = this.extractChanges(sourceCommits, commonAncestor);
    const targetChanges = this.extractChanges(targetCommits, commonAncestor);
    
    // Detect entity conflicts
    conflicts.push(...this.detectEntityConflicts(sourceChanges.entities, targetChanges.entities));
    
    // Detect relationship conflicts
    conflicts.push(...this.detectRelationshipConflicts(sourceChanges.relationships, targetChanges.relationships));
    
    // Detect scene conflicts
    conflicts.push(...this.detectSceneConflicts(sourceChanges.scenes, targetChanges.scenes));
    
    // Collect affected items
    conflicts.forEach(conflict => {
      if (conflict.entityId) entitiesAffected.add(conflict.entityId);
      if (conflict.relationshipId) relationshipsAffected.add(conflict.relationshipId);
      if (conflict.sceneId) scenesAffected.add(conflict.sceneId);
    });
    
    // Assess impact
    const impactAssessment: MergeImpact = {
      entitiesAffected: Array.from(entitiesAffected),
      relationshipsAffected: Array.from(relationshipsAffected),
      scenesAffected: Array.from(scenesAffected),
      consistencyImpact: this.calculateConsistencyImpact(conflicts),
      narrativeImpact: this.calculateNarrativeImpact(conflicts),
      riskLevel: this.assessRiskLevel(conflicts),
      recommendations: this.generateRecommendations(conflicts)
    };
    
    // Determine merge strategy
    const resolutionStrategy = this.selectMergeStrategy(conflicts, impactAssessment);
    
    return {
      id: `merge_${Date.now()}`,
      sourceBranch: 'source', // Would come from actual branch names
      targetBranch: 'target',
      title: `Merge ${sourceCommits.length} commits`,
      description: `Merging changes with ${conflicts.length} conflicts`,
      author: 'system',
      conflicts,
      autoMergeable: conflicts.every(c => c.autoResolvable),
      impactAssessment,
      reviewers: [],
      approvals: [],
      rejections: [],
      status: 'open',
      resolutionStrategy,
      resolvedConflicts: []
    };
  }
  
  private extractChanges(commits: NarrativeCommit[], since: NarrativeCommit) {
    const entities = new Map<string, EntityChange>();
    const relationships = new Map<string, RelationshipChange>();
    const scenes = new Map<string, SceneChange>();
    
    commits.forEach(commit => {
      commit.entities.forEach(change => {
        entities.set(change.entityId, change);
      });
      commit.relationships.forEach(change => {
        relationships.set(change.relationshipId, change);
      });
      commit.scenes.forEach(change => {
        scenes.set(change.sceneId, change);
      });
    });
    
    return { entities, relationships, scenes };
  }
  
  private detectEntityConflicts(
    sourceChanges: Map<string, EntityChange>,
    targetChanges: Map<string, EntityChange>
  ): MergeConflict[] {
    const conflicts: MergeConflict[] = [];
    
    // Find entities changed in both branches
    for (const [entityId, sourceChange] of sourceChanges) {
      const targetChange = targetChanges.get(entityId);
      if (targetChange) {
        // Both branches modified same entity
        if (this.areChangesConflicting(sourceChange.changes, targetChange.changes)) {
          conflicts.push({
            type: 'entity_divergence',
            entityId,
            ourVersion: sourceChange,
            theirVersion: targetChange,
            severity: this.assessConflictSeverity(sourceChange, targetChange),
            autoResolvable: this.canAutoResolveEntityConflict(sourceChange, targetChange),
            suggestedResolution: this.suggestEntityResolution(sourceChange, targetChange)
          });
        }
      }
    }
    
    return conflicts;
  }
  
  private detectRelationshipConflicts(
    sourceChanges: Map<string, RelationshipChange>,
    targetChanges: Map<string, RelationshipChange>
  ): MergeConflict[] {
    const conflicts: MergeConflict[] = [];
    
    for (const [relId, sourceChange] of sourceChanges) {
      const targetChange = targetChanges.get(relId);
      if (targetChange) {
        if (this.areChangesConflicting(sourceChange.changes, targetChange.changes)) {
          conflicts.push({
            type: 'relationship_change',
            relationshipId: relId,
            ourVersion: sourceChange,
            theirVersion: targetChange,
            severity: this.assessConflictSeverity(sourceChange, targetChange),
            autoResolvable: this.canAutoResolveRelationshipConflict(sourceChange, targetChange)
          });
        }
      }
    }
    
    return conflicts;
  }
  
  private detectSceneConflicts(
    sourceChanges: Map<string, SceneChange>,
    targetChanges: Map<string, SceneChange>
  ): MergeConflict[] {
    const conflicts: MergeConflict[] = [];
    
    for (const [sceneId, sourceChange] of sourceChanges) {
      const targetChange = targetChanges.get(sceneId);
      if (targetChange) {
        // Scene reordering conflicts
        if (sourceChange.position !== targetChange.position) {
          conflicts.push({
            type: 'scene_reorder',
            sceneId,
            ourVersion: sourceChange,
            theirVersion: targetChange,
            severity: 'minor',
            autoResolvable: true
          });
        }
      }
    }
    
    return conflicts;
  }
  
  private areChangesConflicting(changes1: any, changes2: any): boolean {
    const keys1 = Object.keys(changes1);
    const keys2 = Object.keys(changes2);
    
    // Check if they modify the same properties with different values
    for (const key of keys1) {
      if (keys2.includes(key) && changes1[key] !== changes2[key]) {
        return true;
      }
    }
    return false;
  }
  
  private assessConflictSeverity(change1: any, change2: any): 'trivial' | 'minor' | 'major' | 'blocking' {
    // Simple heuristic - would be more sophisticated in real implementation
    if (change1.changeType === 'delete' || change2.changeType === 'delete') {
      return 'major';
    }
    if (change1.changeType === 'create' && change2.changeType === 'create') {
      return 'blocking'; // Same ID created twice
    }
    return 'minor';
  }
  
  private canAutoResolveEntityConflict(change1: EntityChange, change2: EntityChange): boolean {
    // Auto-resolve if changes are complementary (different properties)
    const keys1 = Object.keys(change1.changes);
    const keys2 = Object.keys(change2.changes);
    return !keys1.some(key => keys2.includes(key));
  }
  
  private canAutoResolveRelationshipConflict(change1: RelationshipChange, change2: RelationshipChange): boolean {
    // Similar logic for relationships
    const keys1 = Object.keys(change1.changes);
    const keys2 = Object.keys(change2.changes);
    return !keys1.some(key => keys2.includes(key));
  }
  
  private suggestEntityResolution(change1: EntityChange, change2: EntityChange): any {
    // Merge both changes where possible
    return {
      ...change1.changes,
      ...change2.changes,
      // Special handling for arrays - combine them
      aliases: [...(change1.changes.aliases || []), ...(change2.changes.aliases || [])],
      personality: [...(change1.changes.personality || []), ...(change2.changes.personality || [])]
    };
  }
  
  private calculateConsistencyImpact(conflicts: MergeConflict[]): number {
    // Return impact on consistency (-1 to 1)
    if (conflicts.length === 0) return 0;
    
    const severityWeights = { trivial: 0.1, minor: 0.3, major: 0.7, blocking: 1.0 };
    const totalImpact = conflicts.reduce((sum, conflict) => {
      return sum + severityWeights[conflict.severity];
    }, 0);
    
    return Math.min(totalImpact / conflicts.length, 1.0) * -1; // Negative because conflicts reduce consistency
  }
  
  private calculateNarrativeImpact(conflicts: MergeConflict[]): number {
    // Calculate impact on narrative quality
    return conflicts.filter(c => c.severity === 'major' || c.severity === 'blocking').length / Math.max(conflicts.length, 1);
  }
  
  private assessRiskLevel(conflicts: MergeConflict[]): 'low' | 'medium' | 'high' | 'critical' {
    const blockingCount = conflicts.filter(c => c.severity === 'blocking').length;
    const majorCount = conflicts.filter(c => c.severity === 'major').length;
    
    if (blockingCount > 0) return 'critical';
    if (majorCount > 3) return 'high';
    if (majorCount > 0 || conflicts.length > 10) return 'medium';
    return 'low';
  }
  
  private generateRecommendations(conflicts: MergeConflict[]): string[] {
    const recommendations: string[] = [];
    
    if (conflicts.some(c => c.severity === 'blocking')) {
      recommendations.push('Manual review required for blocking conflicts');
    }
    
    if (conflicts.filter(c => c.type === 'entity_divergence').length > 5) {
      recommendations.push('Consider splitting into smaller merges');
    }
    
    if (conflicts.every(c => c.autoResolvable)) {
      recommendations.push('All conflicts can be auto-resolved');
    }
    
    return recommendations;
  }
  
  private selectMergeStrategy(conflicts: MergeConflict[], impact: MergeImpact): MergeStrategy {
    if (conflicts.length === 0) return 'fast_forward';
    if (conflicts.every(c => c.autoResolvable)) return 'three_way_merge';
    if (impact.riskLevel === 'critical') return 'community_vote';
    if (impact.riskLevel === 'high') return 'narrative_merge';
    return 'three_way_merge';
  }
  
  async executeMerge(mergeRequest: MergeRequest): Promise<NarrativeCommit> {
    // Create merged world state
    const mergedState = this.createMergedState(mergeRequest);
    
    // Create merge commit
    const mergeCommit: NarrativeCommit = {
      id: `commit_${Date.now()}`,
      hash: this.generateCommitHash(mergedState),
      parentCommits: [], // Would include both branch heads
      timestamp: new Date(),
      author: mergeRequest.author,
      message: `Merge ${mergeRequest.sourceBranch} into ${mergeRequest.targetBranch}`,
      entities: this.extractEntityChanges(mergeRequest),
      relationships: this.extractRelationshipChanges(mergeRequest),
      scenes: this.extractSceneChanges(mergeRequest),
      worldState: mergedState,
      branch: mergeRequest.targetBranch,
      tags: ['merge'],
      significance: 0.8, // Merges are significant
      conflictResolutions: mergeRequest.resolvedConflicts
    };
    
    return mergeCommit;
  }
  
  private createMergedState(mergeRequest: MergeRequest): WorldStateSnapshot {
    // Implementation would create the merged world state
    // This is complex and would involve applying all resolved conflicts
    
    return {
      commitId: `merge_${Date.now()}`,
      timestamp: new Date(),
      entityStates: new Map(),
      activeRelationships: new Map(),
      sceneTimeline: [],
      consistencyScore: 0.95, // Would be calculated
      inconsistencies: [],
      metrics: {
        totalEntities: 0,
        totalRelationships: 0,
        totalScenes: 0,
        narrativeComplexity: 0,
        characterDevelopment: 0,
        plotCohesion: 0,
        worldConsistency: 0,
        temporalCoherence: 0
      }
    };
  }
  
  private extractEntityChanges(mergeRequest: MergeRequest): EntityChange[] {
    // Extract resolved entity changes from merge request
    return [];
  }
  
  private extractRelationshipChanges(mergeRequest: MergeRequest): RelationshipChange[] {
    // Extract resolved relationship changes from merge request
    return [];
  }
  
  private extractSceneChanges(mergeRequest: MergeRequest): SceneChange[] {
    // Extract resolved scene changes from merge request
    return [];
  }
  
  private generateCommitHash(state: WorldStateSnapshot): string {
    // Generate deterministic hash from world state
    const stateString = JSON.stringify(state);
    return btoa(stateString).substring(0, 40); // Simple hash for demo
  }
}

// ============================================================================
// EXPORT ALL TYPES (already exported above as interfaces)
// ============================================================================