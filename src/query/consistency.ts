import { TemporalGraphBuilder, GraphState } from '../graph/temporal';
import { NarrativeStructure } from '../types';

export interface ConsistencyViolation {
  type: 'location' | 'possession' | 'state' | 'relationship' | 'timeline';
  severity: 'error' | 'warning' | 'info';
  sequence: number;
  description: string;
  entities: string[];
  suggestion?: string;
}

export class ConsistencyEngine {
  private violations: ConsistencyViolation[] = [];
  
  /**
   * Check narrative consistency across all dimensions
   */
  checkConsistency(structure: NarrativeStructure, temporalGraph: any): ConsistencyViolation[] {
    this.violations = [];
    
    // Check each state transition
    for (let i = 1; i < temporalGraph.states.length; i++) {
      const prevState = temporalGraph.states[i - 1];
      const currState = temporalGraph.states[i];
      const scene = structure.scenes[i - 1];
      
      this.checkLocationConsistency(prevState, currState, scene);
      this.checkPossessionConsistency(prevState, currState, scene);
      this.checkRelationshipConsistency(prevState, currState, scene);
      this.checkEntityStateConsistency(prevState, currState, scene);
    }
    
    // Check global timeline consistency
    this.checkTimelineConsistency(structure);
    
    return this.violations;
  }
  
  /**
   * Check if characters can be in multiple locations
   */
  private checkLocationConsistency(prev: GraphState, curr: GraphState, scene: any) {
    const characterLocations = new Map<string, string>();
    
    // Build current location map
    scene.characters.forEach((charId: string) => {
      if (scene.location) {
        characterLocations.set(charId, scene.location);
      }
    });
    
    // Check for impossible movements
    // (In a full implementation, would check travel time/distance)
    characterLocations.forEach((location, charId) => {
      const prevLoc = this.getCharacterLocation(prev, charId);
      if (prevLoc && prevLoc !== location) {
        // Check if movement is plausible
        const distance = this.calculateNarrativeDistance(prevLoc, location);
        if (distance > 1) { // Can't skip locations
          this.addViolation({
            type: 'location',
            severity: 'warning',
            sequence: scene.sequence,
            description: `${charId} moved from ${prevLoc} to ${location} without passing through intermediate locations`,
            entities: [charId],
            suggestion: 'Add transitional scene or mention travel'
          });
        }
      }
    });
  }
  
  /**
   * Check object possession consistency
   */
  private checkPossessionConsistency(prev: GraphState, curr: GraphState, scene: any) {
    // Check if objects are possessed by multiple entities
    const possessions = new Map<string, string>();
    
    Object.values(curr.relationships).forEach((rel: any) => {
      if (rel.type === 'carries' || rel.type === 'owns' || rel.type === 'has') {
        if (possessions.has(rel.target)) {
          this.addViolation({
            type: 'possession',
            severity: 'error',
            sequence: scene.sequence,
            description: `${rel.target} possessed by both ${possessions.get(rel.target)} and ${rel.source}`,
            entities: [rel.source, rel.target, possessions.get(rel.target)!],
            suggestion: 'Add explicit transfer or resolve possession conflict'
          });
        }
        possessions.set(rel.target, rel.source);
      }
    });
    
    // Check if character uses object they don't possess
    scene.events.forEach((event: any) => {
      // Would need NLP to detect object usage in event descriptions
      // For now, this is a placeholder
    });
  }
  
  /**
   * Check relationship consistency
   */
  private checkRelationshipConsistency(prev: GraphState, curr: GraphState, scene: any) {
    // Check for contradictory relationships
    const relationships = new Map<string, Set<string>>();
    
    Object.values(curr.relationships).forEach((rel: any) => {
      const key = `${rel.source}-${rel.target}`;
      if (!relationships.has(key)) {
        relationships.set(key, new Set());
      }
      relationships.get(key)!.add(rel.type);
    });
    
    // Check for incompatible relationships
    relationships.forEach((types, key) => {
      if (types.has('friend') && types.has('enemy')) {
        const [source, target] = key.split('-');
        this.addViolation({
          type: 'relationship',
          severity: 'warning',
          sequence: scene.sequence,
          description: `${source} has contradictory relationships with ${target}: both friend and enemy`,
          entities: [source, target],
          suggestion: 'Clarify relationship status or add complexity'
        });
      }
    });
  }
  
  /**
   * Check entity state consistency
   */
  private checkEntityStateConsistency(prev: GraphState, curr: GraphState, scene: any) {
    // Check if dead/inactive entities are still acting
    scene.events.forEach((event: any) => {
      event.participants.forEach((participant: string) => {
        const entity = curr.entities.get(participant);
        if (entity && !entity.active) {
          this.addViolation({
            type: 'state',
            severity: 'error',
            sequence: scene.sequence,
            description: `${participant} participates in event but is marked inactive/dead`,
            entities: [participant],
            suggestion: 'Remove from scene or explain resurrection'
          });
        }
      });
    });
  }
  
  /**
   * Check timeline consistency
   */
  private checkTimelineConsistency(structure: NarrativeStructure) {
    // Check for chronological markers that don't make sense
    const timeMarkers: Array<{sequence: number, marker: string}> = [];
    
    structure.scenes.forEach((scene: any) => {
      // Would extract time markers from scene summaries
      // "next morning", "three days later", etc.
    });
    
    // Verify time progression makes sense
    // This would need more sophisticated time parsing
  }
  
  /**
   * Helper methods
   */
  private getCharacterLocation(state: GraphState, charId: string): string | null {
    // Find location relationships
    for (const rel of Object.values(state.relationships)) {
      if ((rel as any).source === charId && (rel as any).type === 'at' && (rel as any).active) {
        return (rel as any).target;
      }
    }
    return null;
  }
  
  private calculateNarrativeDistance(loc1: string, loc2: string): number {
    // In a full implementation, would have a location graph
    // For now, return 1 if adjacent, 2 otherwise
    const adjacent = new Set([
      'rivendell-misty_mountains',
      'misty_mountains-moria',
      'shire-rivendell'
    ]);
    
    const key = [loc1, loc2].sort().join('-');
    return adjacent.has(key) ? 1 : 2;
  }
  
  private addViolation(violation: ConsistencyViolation) {
    this.violations.push(violation);
  }
  
  /**
   * Generate consistency report
   */
  generateReport(): string {
    if (this.violations.length === 0) {
      return "✅ No consistency violations detected!";
    }
    
    const byType = new Map<string, ConsistencyViolation[]>();
    this.violations.forEach(v => {
      if (!byType.has(v.type)) {
        byType.set(v.type, []);
      }
      byType.get(v.type)!.push(v);
    });
    
    let report = `🔍 Consistency Check Report\n`;
    report += `Found ${this.violations.length} potential issues:\n\n`;
    
    byType.forEach((violations, type) => {
      report += `\n${type.toUpperCase()} ISSUES (${violations.length}):\n`;
      violations.forEach(v => {
        const icon = v.severity === 'error' ? '❌' : v.severity === 'warning' ? '⚠️' : 'ℹ️';
        report += `${icon} Scene ${v.sequence}: ${v.description}\n`;
        if (v.suggestion) {
          report += `   💡 Suggestion: ${v.suggestion}\n`;
        }
      });
    });
    
    return report;
  }
}