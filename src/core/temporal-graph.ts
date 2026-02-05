/**
 * Temporal graph state tracking system
 * Tracks how the narrative world changes over time
 */

export interface GraphStateSnapshot {
  snapshotId: string;
  sceneId: string;
  sequence: number;
  timestamp: Date;
  entities: Map<string, EntityState>;
  relationships: Map<string, RelationshipState>;
  previousSnapshot?: string;
  changeLog: DetailedStateChange[];
}

export interface EntityState {
  entityId: string;
  properties: Record<string, any>;
  location?: string;
  status: 'active' | 'inactive' | 'destroyed' | 'transformed';
  version: number;
  lastModified: Date;
}

export interface RelationshipState {
  relationshipId: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: string;
  strength: number;
  properties: Record<string, any>;
  active: boolean;
  version: number;
  lastModified: Date;
}

export interface DetailedStateChange {
  changeId: string;
  entityId?: string;
  relationshipId?: string;
  changeType: StateChangeType;
  propertyPath: string; // e.g., "traits.health", "relationships.alice"
  previousValue: any;
  newValue: any;
  causedBy: {
    eventId: string;
    sceneId: string;
    description: string;
  };
  confidence: number;
  evidence: string[];
  timestamp: Date;
  sequence: number;
}

export type StateChangeType = 
  | "entity_creation" 
  | "entity_destruction"
  | "entity_transformation"
  | "property_modification"
  | "relationship_formation"
  | "relationship_dissolution"
  | "relationship_strengthening"
  | "relationship_weakening"
  | "location_transition"
  | "status_change"
  | "knowledge_acquisition"
  | "memory_formation"
  | "goal_establishment"
  | "goal_achievement"
  | "conflict_initiation"
  | "conflict_resolution";

export interface TemporalQuery {
  entityId?: string;
  relationshipId?: string;
  timeRange?: {
    start: Date;
    end: Date;
  };
  sceneRange?: {
    startScene: string;
    endScene: string;
  };
  changeTypes?: StateChangeType[];
  propertyPath?: string;
}

export interface EntityHistory {
  entityId: string;
  timeline: Array<{
    snapshot: string;
    sceneId: string;
    sequence: number;
    timestamp: Date;
    state: EntityState;
    changes: DetailedStateChange[];
  }>;
  significantEvents: Array<{
    eventType: 'birth' | 'death' | 'transformation' | 'major_change';
    sceneId: string;
    description: string;
    impact: 'low' | 'medium' | 'high' | 'critical';
  }>;
}

export class TemporalNarrativeGraph {
  private snapshots: Map<string, GraphStateSnapshot> = new Map();
  private entityHistories: Map<string, EntityHistory> = new Map();
  
  /**
   * Create a new graph state snapshot after scene processing
   */
  createSnapshot(
    sceneId: string, 
    sequence: number,
    entities: EntityState[],
    relationships: RelationshipState[],
    changes: DetailedStateChange[],
    previousSnapshotId?: string
  ): GraphStateSnapshot {
    const snapshotId = `snapshot_${sceneId}_${sequence}_${Date.now()}`;
    
    const snapshot: GraphStateSnapshot = {
      snapshotId,
      sceneId,
      sequence,
      timestamp: new Date(),
      entities: new Map(entities.map(e => [e.entityId, e])),
      relationships: new Map(relationships.map(r => [r.relationshipId, r])),
      previousSnapshot: previousSnapshotId,
      changeLog: changes
    };
    
    this.snapshots.set(snapshotId, snapshot);
    this.updateEntityHistories(snapshot);
    
    return snapshot;
  }
  
  /**
   * Get the graph state at a specific point in time
   */
  getGraphAtSnapshot(snapshotId: string): GraphStateSnapshot | null {
    return this.snapshots.get(snapshotId) || null;
  }
  
  /**
   * Get graph state at a specific scene
   */
  getGraphAtScene(sceneId: string, sequence?: number): GraphStateSnapshot | null {
    const sceneSnapshots = Array.from(this.snapshots.values())
      .filter(s => s.sceneId === sceneId)
      .sort((a, b) => a.sequence - b.sequence);
    
    if (sequence !== undefined) {
      return sceneSnapshots.find(s => s.sequence === sequence) || null;
    }
    
    return sceneSnapshots[sceneSnapshots.length - 1] || null;
  }
  
  /**
   * Get the complete history of an entity
   */
  getEntityHistory(entityId: string): EntityHistory | null {
    return this.entityHistories.get(entityId) || null;
  }
  
  /**
   * Track state changes for an entity over time
   */
  getEntityStateChanges(entityId: string, query?: TemporalQuery): DetailedStateChange[] {
    const allChanges: DetailedStateChange[] = [];
    
    for (const snapshot of this.snapshots.values()) {
      const entityChanges = snapshot.changeLog.filter(change => 
        change.entityId === entityId
      );
      allChanges.push(...entityChanges);
    }
    
    return this.filterChangesByQuery(allChanges, query);
  }
  
  /**
   * Get relationship evolution over time
   */
  getRelationshipHistory(relationshipId: string): Array<{
    snapshot: string;
    sceneId: string;
    sequence: number;
    timestamp: Date;
    state: RelationshipState;
    changes: DetailedStateChange[];
  }> {
    const history: Array<{
      snapshot: string;
      sceneId: string;
      sequence: number;
      timestamp: Date;
      state: RelationshipState;
      changes: DetailedStateChange[];
    }> = [];
    
    for (const snapshot of this.snapshots.values()) {
      const relationship = snapshot.relationships.get(relationshipId);
      if (relationship) {
        const changes = snapshot.changeLog.filter(c => c.relationshipId === relationshipId);
        history.push({
          snapshot: snapshot.snapshotId,
          sceneId: snapshot.sceneId,
          sequence: snapshot.sequence,
          timestamp: snapshot.timestamp,
          state: relationship,
          changes
        });
      }
    }
    
    return history.sort((a, b) => a.sequence - b.sequence);
  }
  
  /**
   * Detect temporal inconsistencies in the graph
   */
  detectTemporalInconsistencies(): Array<{
    type: 'entity_timeline' | 'relationship_causality' | 'property_contradiction';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    affectedEntities: string[];
    evidence: string[];
    suggestedResolution: string;
  }> {
    const inconsistencies: Array<{
      type: 'entity_timeline' | 'relationship_causality' | 'property_contradiction';
      severity: 'low' | 'medium' | 'high' | 'critical';
      description: string;
      affectedEntities: string[];
      evidence: string[];
      suggestedResolution: string;
    }> = [];
    
    // Check for entities being active after destruction
    for (const [entityId, history] of this.entityHistories) {
      const timeline = history.timeline.sort((a, b) => a.sequence - b.sequence);
      
      let destroyed = false;
      for (const point of timeline) {
        if (point.state.status === 'destroyed') {
          destroyed = true;
        } else if (destroyed && point.state.status === 'active') {
          inconsistencies.push({
            type: 'entity_timeline',
            severity: 'high',
            description: `Entity ${entityId} is active after being destroyed`,
            affectedEntities: [entityId],
            evidence: [
              `Destroyed in scene ${timeline.find(t => t.state.status === 'destroyed')?.sceneId}`,
              `Active again in scene ${point.sceneId}`
            ],
            suggestedResolution: 'Review entity lifecycle or add resurrection/transformation event'
          });
        }
      }
    }
    
    // Check for property contradictions
    for (const [entityId, history] of this.entityHistories) {
      const contradictions = this.findPropertyContradictions(history);
      inconsistencies.push(...contradictions);
    }
    
    return inconsistencies;
  }
  
  /**
   * Generate temporal analytics
   */
  generateTemporalAnalytics(): {
    totalSnapshots: number;
    totalStateChanges: number;
    entitiesTracked: number;
    relationshipsTracked: number;
    averageChangesPerScene: number;
    mostActiveEntities: Array<{entityId: string, changeCount: number}>;
    temporalConsistencyScore: number;
  } {
    const totalSnapshots = this.snapshots.size;
    const totalStateChanges = Array.from(this.snapshots.values())
      .reduce((sum, snapshot) => sum + snapshot.changeLog.length, 0);
    const entitiesTracked = this.entityHistories.size;
    
    const relationshipCount = new Set();
    for (const snapshot of this.snapshots.values()) {
      for (const relId of snapshot.relationships.keys()) {
        relationshipCount.add(relId);
      }
    }
    
    const entityChangeCounts = new Map<string, number>();
    for (const snapshot of this.snapshots.values()) {
      for (const change of snapshot.changeLog) {
        if (change.entityId) {
          entityChangeCounts.set(
            change.entityId, 
            (entityChangeCounts.get(change.entityId) || 0) + 1
          );
        }
      }
    }
    
    const mostActiveEntities = Array.from(entityChangeCounts.entries())
      .map(([entityId, changeCount]) => ({ entityId, changeCount }))
      .sort((a, b) => b.changeCount - a.changeCount)
      .slice(0, 10);
    
    const inconsistencies = this.detectTemporalInconsistencies();
    const temporalConsistencyScore = Math.max(0, 100 - (inconsistencies.length * 5));
    
    return {
      totalSnapshots,
      totalStateChanges,
      entitiesTracked,
      relationshipsTracked: relationshipCount.size,
      averageChangesPerScene: totalSnapshots > 0 ? totalStateChanges / totalSnapshots : 0,
      mostActiveEntities,
      temporalConsistencyScore
    };
  }
  
  private updateEntityHistories(snapshot: GraphStateSnapshot): void {
    for (const [entityId, entityState] of snapshot.entities) {
      let history = this.entityHistories.get(entityId);
      
      if (!history) {
        history = {
          entityId,
          timeline: [],
          significantEvents: []
        };
        this.entityHistories.set(entityId, history);
      }
      
      const changes = snapshot.changeLog.filter(c => c.entityId === entityId);
      
      history.timeline.push({
        snapshot: snapshot.snapshotId,
        sceneId: snapshot.sceneId,
        sequence: snapshot.sequence,
        timestamp: snapshot.timestamp,
        state: entityState,
        changes
      });
      
      // Detect significant events
      for (const change of changes) {
        if (change.changeType === 'entity_creation') {
          history.significantEvents.push({
            eventType: 'birth',
            sceneId: snapshot.sceneId,
            description: `Entity created: ${change.causedBy.description}`,
            impact: 'high'
          });
        } else if (change.changeType === 'entity_destruction') {
          history.significantEvents.push({
            eventType: 'death',
            sceneId: snapshot.sceneId,
            description: `Entity destroyed: ${change.causedBy.description}`,
            impact: 'critical'
          });
        }
      }
    }
  }
  
  private filterChangesByQuery(changes: DetailedStateChange[], query?: TemporalQuery): DetailedStateChange[] {
    if (!query) return changes;
    
    return changes.filter(change => {
      if (query.changeTypes && !query.changeTypes.includes(change.changeType)) {
        return false;
      }
      
      if (query.propertyPath && change.propertyPath !== query.propertyPath) {
        return false;
      }
      
      if (query.timeRange) {
        const changeTime = change.timestamp;
        if (changeTime < query.timeRange.start || changeTime > query.timeRange.end) {
          return false;
        }
      }
      
      return true;
    });
  }
  
  private findPropertyContradictions(history: EntityHistory): Array<{
    type: 'property_contradiction';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    affectedEntities: string[];
    evidence: string[];
    suggestedResolution: string;
  }> {
    const contradictions: Array<{
      type: 'property_contradiction';
      severity: 'low' | 'medium' | 'high' | 'critical';
      description: string;
      affectedEntities: string[];
      evidence: string[];
      suggestedResolution: string;
    }> = [];
    
    // Check for contradictory property changes within short time windows
    const timeline = history.timeline.sort((a, b) => a.sequence - b.sequence);
    
    for (let i = 0; i < timeline.length - 1; i++) {
      const current = timeline[i];
      const next = timeline[i + 1];
      
      // Look for rapid contradictory changes (within 3 scenes)
      if (next.sequence - current.sequence <= 3) {
        for (const change of next.changes) {
          if (change.propertyPath && change.previousValue !== undefined) {
            // Check if this contradicts recent changes
            const recentChanges = current.changes.filter(c => 
              c.propertyPath === change.propertyPath
            );
            
            for (const recentChange of recentChanges) {
              if (this.areValuesContradictory(recentChange.newValue, change.newValue)) {
                contradictions.push({
                  type: 'property_contradiction',
                  severity: 'medium',
                  description: `Property ${change.propertyPath} has contradictory values in nearby scenes`,
                  affectedEntities: [history.entityId],
                  evidence: [
                    `Scene ${current.sceneId}: ${JSON.stringify(recentChange.newValue)}`,
                    `Scene ${next.sceneId}: ${JSON.stringify(change.newValue)}`
                  ],
                  suggestedResolution: 'Review property changes for logical consistency'
                });
              }
            }
          }
        }
      }
    }
    
    return contradictions;
  }
  
  private areValuesContradictory(value1: any, value2: any): boolean {
    // Simple contradiction detection
    if (typeof value1 === 'boolean' && typeof value2 === 'boolean') {
      return value1 !== value2;
    }
    
    if (typeof value1 === 'string' && typeof value2 === 'string') {
      // Check for opposite meanings (this would need a more sophisticated implementation)
      const opposites = [
        ['alive', 'dead'],
        ['healthy', 'sick'],
        ['strong', 'weak'],
        ['young', 'old']
      ];
      
      const v1 = value1.toLowerCase();
      const v2 = value2.toLowerCase();
      
      for (const [opp1, opp2] of opposites) {
        if ((v1.includes(opp1) && v2.includes(opp2)) || 
            (v1.includes(opp2) && v2.includes(opp1))) {
          return true;
        }
      }
    }
    
    return false;
  }
}