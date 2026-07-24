import { TemporalGraphBuilder, GraphState } from '../graph/temporal';
import { NarrativeStructure } from '../types';

export interface QueryResult {
  answer: any;
  context: string[];
  relevantStates: number[];
  confidence: number;
}

export interface NarrativeContext {
  summary: string;
  currentState: any;
  recentEvents: string[];
  activeEntities: any[];
  activeRelationships: any[];
  constraints: string[];
}

/**
 * Query engine for narrative intelligence
 * Allows AI agents to query the narrative state and generate consistent content
 */
export class NarrativeQueryEngine {
  constructor(
    private narrative: NarrativeStructure,
    private temporalGraph: any
  ) {}

  /**
   * Query the narrative at a specific point in time
   */
  query(question: string, atSequence?: number): QueryResult {
    const sequence = atSequence ?? this.temporalGraph.states.length - 1;
    const state = this.temporalGraph.states[sequence];
    
    // Parse query type
    const queryType = this.detectQueryType(question);
    
    switch (queryType) {
      case 'location':
        return this.queryLocation(question, state, sequence);
      case 'possession':
        return this.queryPossession(question, state, sequence);
      case 'relationship':
        return this.queryRelationship(question, state, sequence);
      case 'history':
        return this.queryHistory(question, sequence);
      case 'state':
        return this.queryEntityState(question, state, sequence);
      default:
        return this.generalQuery(question, state, sequence);
    }
  }

  /**
   * Generate context for AI content generation
   */
  generateContext(
    forSequence: number,
    options: {
      includeHistory?: boolean;
      maxHistoryEvents?: number;
      focusEntities?: string[];
      missionType?: string;
    } = {}
  ): NarrativeContext {
    const state = this.temporalGraph.states[forSequence];
    const scene = this.narrative.scenes[forSequence - 1];
    
    // Build current state summary
    const activeEntities = Object.values(state.entities)
      .filter((e: any) => e.active)
      .filter((e: any) => !options.focusEntities || options.focusEntities.includes(e.id));
    
    const activeRelationships = Object.values(state.relationships)
      .filter((r: any) => r.active)
      .filter((r: any) => 
        !options.focusEntities || 
        options.focusEntities.includes(r.source) || 
        options.focusEntities.includes(r.target)
      );
    
    // Get recent events
    const recentEvents: string[] = [];
    if (options.includeHistory) {
      const maxEvents = options.maxHistoryEvents || 5;
      const startSeq = Math.max(1, forSequence - maxEvents);
      
      for (let seq = startSeq; seq <= forSequence; seq++) {
        const changes = this.temporalGraph.changes.filter((c: any) => c.sequence === seq);
        recentEvents.push(...changes.map((c: any) => c.description));
      }
    }
    
    // Generate constraints based on current state
    const constraints = this.generateConstraints(state, scene, options.missionType);
    
    return {
      summary: this.generateStateSummary(state, scene),
      currentState: {
        sequence: forSequence,
        location: scene?.location,
        presentCharacters: scene?.characters || [],
      },
      recentEvents,
      activeEntities: activeEntities.map((e: any) => ({
        id: e.id,
        ...e.properties
      })),
      activeRelationships: activeRelationships.map((r: any) => ({
        source: r.source,
        target: r.target,
        type: r.type,
        ...r.properties
      })),
      constraints
    };
  }

  /**
   * Generate prompt context for LLM mission/story generation
   */
  generatePromptContext(
    atSequence: number,
    missionType: string,
    additionalContext?: string
  ): string {
    const context = this.generateContext(atSequence, {
      includeHistory: true,
      maxHistoryEvents: 10,
      missionType
    });
    
    return `
## Current Narrative State

${context.summary}

## Recent Events
${context.recentEvents.map(e => `- ${e}`).join('\n')}

## Active Entities
${context.activeEntities.map(e => 
  `- ${e.name} (${e.type}): ${e.description || 'No description'}`
).join('\n')}

## Current Relationships
${context.activeRelationships.map(r => 
  `- ${r.source} ${r.type} ${r.target}`
).join('\n')}

## Constraints for New Content
${context.constraints.map(c => `- ${c}`).join('\n')}

## Mission Type: ${missionType}
${additionalContext || ''}

Please generate content that:
1. Maintains consistency with the current state
2. Respects all active relationships and entity states
3. Follows the constraints listed above
4. Advances the narrative without creating contradictions
`;
  }

  /**
   * Check if a proposed change is valid
   */
  validateProposedChange(
    change: {
      type: string;
      entities: string[];
      description: string;
    },
    atSequence: number
  ): { valid: boolean; issues: string[] } {
    const state = this.temporalGraph.states[atSequence];
    const issues: string[] = [];
    
    // Check if entities exist and are active
    change.entities.forEach(entityId => {
      const entity = state.entities[entityId];
      if (!entity) {
        issues.push(`Entity ${entityId} does not exist`);
      } else if (!entity.active) {
        issues.push(`Entity ${entityId} is inactive/dead`);
      }
    });
    
    // Check specific change types
    if (change.type === 'possession_transfer') {
      // Verify source has the object
      // Verify target can receive it
    }
    
    if (change.type === 'location_change') {
      // Verify movement is possible
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Private query methods
   */
  private queryLocation(question: string, state: GraphState, sequence: number): QueryResult {
    // Extract entity from question
    const entity = this.extractEntityFromQuestion(question);
    if (!entity) {
      return {
        answer: "Could not identify entity in question",
        context: [],
        relevantStates: [sequence],
        confidence: 0.2
      };
    }
    
    // Find location relationships
    const locationRel = Object.values(state.relationships).find(
      (r: any) => r.source === entity && r.type === 'at' && (r as any).active
    ) as any;
    
    const scene = this.narrative.scenes[sequence - 1];
    const location = locationRel?.target || scene?.location;
    
    return {
      answer: location ? 
        `${entity} is at ${this.getEntityName(location)}` : 
        `Location of ${entity} is unknown`,
      context: [
        `Scene ${sequence}: ${scene?.description || 'No scene data'}`
      ],
      relevantStates: [sequence],
      confidence: location ? 0.9 : 0.3
    };
  }

  private queryPossession(question: string, state: GraphState, sequence: number): QueryResult {
    const entity = this.extractEntityFromQuestion(question);
    const object = this.extractObjectFromQuestion(question);
    
    if (object) {
      // Who has X?
      const possession = Object.values(state.relationships).find(
        (r: any) => r.target === object && 
        (r.type === 'carries' || r.type === 'owns' || r.type === 'has') && 
        r.active
      ) as any;
      
      return {
        answer: possession ? 
          `${this.getEntityName(possession.source)} has ${this.getEntityName(object)}` :
          `No one currently has ${this.getEntityName(object)}`,
        context: this.getRelevantChanges(object, sequence),
        relevantStates: [sequence],
        confidence: 0.8
      };
    }
    
    if (entity) {
      // What does X have?
      const possessions = Object.values(state.relationships).filter(
        (r: any) => r.source === entity && 
        (r.type === 'carries' || r.type === 'owns' || r.type === 'has') && 
        r.active
      );
      
      return {
        answer: possessions.length > 0 ?
          `${entity} has: ${possessions.map((p: any) => this.getEntityName(p.target)).join(', ')}` :
          `${entity} has no tracked possessions`,
        context: this.getRelevantChanges(entity, sequence),
        relevantStates: [sequence],
        confidence: 0.8
      };
    }
    
    return {
      answer: "Could not parse possession query",
      context: [],
      relevantStates: [sequence],
      confidence: 0.2
    };
  }

  private queryRelationship(question: string, state: GraphState, sequence: number): QueryResult {
    const entities = this.extractEntitiesFromQuestion(question);
    if (entities.length < 2) {
      return {
        answer: "Need at least two entities for relationship query",
        context: [],
        relevantStates: [sequence],
        confidence: 0.2
      };
    }
    
    const [entity1, entity2] = entities;
    const relationships = Object.values(state.relationships).filter(
      (r: any) => 
        ((r.source === entity1 && r.target === entity2) ||
         (r.source === entity2 && r.target === entity1)) &&
        r.active
    );
    
    return {
      answer: relationships.length > 0 ?
        relationships.map((r: any) => 
          `${this.getEntityName(r.source)} ${r.type} ${this.getEntityName(r.target)}`
        ).join('; ') :
        `No active relationship between ${entity1} and ${entity2}`,
      context: this.getRelationshipHistory(entity1, entity2, sequence),
      relevantStates: [sequence],
      confidence: 0.9
    };
  }

  private queryHistory(question: string, sequence: number): QueryResult {
    const entity = this.extractEntityFromQuestion(question);
    const changes = this.temporalGraph.changes.filter((c: any) => 
      c.sequence <= sequence &&
      (c.entityId === entity || 
       c.relationshipId?.includes(entity) ||
       c.description.toLowerCase().includes(entity))
    );
    
    return {
      answer: changes.map((c: any) => 
        `Scene ${c.sequence}: ${c.description}`
      ),
      context: changes.map((c: any) => c.description),
      relevantStates: [...new Set(changes.map((c: any) => c.sequence))].map(s => Number(s)),
      confidence: 0.8
    };
  }

  private queryEntityState(question: string, state: GraphState, sequence: number): QueryResult {
    const entity = this.extractEntityFromQuestion(question);
    if (!entity) {
      return {
        answer: "Could not identify entity",
        context: [],
        relevantStates: [sequence],
        confidence: 0.2
      };
    }
    
    const entityData = state.entities.get(entity);
    if (!entityData) {
      return {
        answer: `${entity} does not exist in the narrative`,
        context: [],
        relevantStates: [sequence],
        confidence: 0.9
      };
    }
    
    return {
      answer: {
        exists: true,
        active: entityData.active,
        properties: entityData.properties,
        state: entityData.active ? 'active' : 'inactive/dead'
      },
      context: this.getRelevantChanges(entity, sequence),
      relevantStates: [sequence],
      confidence: 0.9
    };
  }

  private generalQuery(question: string, state: GraphState, sequence: number): QueryResult {
    // Fallback for complex queries
    // In production, would use NLP or LLM to parse and answer
    return {
      answer: "Query type not recognized. Please be more specific.",
      context: [`Current scene: ${this.narrative.scenes[sequence - 1]?.description}`],
      relevantStates: [sequence],
      confidence: 0.1
    };
  }

  /**
   * Helper methods
   */
  private detectQueryType(question: string): string {
    const q = question.toLowerCase();
    if (q.includes('where') || q.includes('location')) return 'location';
    if (q.includes('who has') || q.includes('what does') || q.includes('possess')) return 'possession';
    if (q.includes('relationship') || q.includes('between')) return 'relationship';
    if (q.includes('history') || q.includes('happened')) return 'history';
    if (q.includes('alive') || q.includes('dead') || q.includes('active')) return 'state';
    return 'general';
  }

  private extractEntityFromQuestion(question: string): string | null {
    // In production, would use NER
    // For now, simple pattern matching
    const entities = this.narrative.entities;
    
    for (const entity of entities) {
      if (question.toLowerCase().includes(entity.name.toLowerCase())) {
        return entity.id;
      }
    }
    return null;
  }

  private extractEntitiesFromQuestion(question: string): string[] {
    const entities = this.narrative.entities;
    
    return entities
      .filter(e => question.toLowerCase().includes(e.name.toLowerCase()))
      .map(e => e.id);
  }

  private extractObjectFromQuestion(question: string): string | null {
    const objects = this.narrative.entities.filter(e => e.type === 'object');
    for (const obj of objects) {
      if (question.toLowerCase().includes(obj.name.toLowerCase())) {
        return obj.id;
      }
    }
    return null;
  }

  private getEntityName(id: string): string {
    const entity = this.narrative.entities.find(e => e.id === id);
    return entity?.name || id;
  }

  private getRelevantChanges(entityId: string, beforeSequence: number): string[] {
    return this.temporalGraph.changes
      .filter((c: any) => 
        c.sequence <= beforeSequence &&
        (c.entityId === entityId || c.description.includes(entityId))
      )
      .map((c: any) => `Scene ${c.sequence}: ${c.description}`);
  }

  private getRelationshipHistory(entity1: string, entity2: string, beforeSequence: number): string[] {
    return this.temporalGraph.changes
      .filter((c: any) => 
        c.sequence <= beforeSequence &&
        c.type.includes('relationship') &&
        c.description.includes(entity1) &&
        c.description.includes(entity2)
      )
      .map((c: any) => `Scene ${c.sequence}: ${c.description}`);
  }

  private generateStateSummary(state: GraphState, scene: any): string {
    const activeChars = Object.values(state.entities)
      .filter((e: any) => e.active && e.properties.type === 'character')
      .length;
    
    const activeRels = Object.values(state.relationships)
      .filter((r: any) => r.active)
      .length;
    
    return `Scene ${scene?.sequence || 'Unknown'} at ${scene?.location || 'unknown location'}. ` +
           `${activeChars} active characters, ${activeRels} active relationships. ` +
           `${scene?.description || 'No scene description available.'}`;
  }

  private generateConstraints(state: GraphState, scene: any, missionType?: string): string[] {
    const constraints: string[] = [];
    
    // Location constraints
    if (scene?.location) {
      constraints.push(`Current location is ${this.getEntityName(scene.location)}`);
      constraints.push(`Only characters present: ${scene.characters.map((c: string) => this.getEntityName(c)).join(', ')}`);
    }
    
    // Possession constraints
    const possessions = Object.values(state.relationships)
      .filter((r: any) => r.active && (r.type === 'carries' || r.type === 'owns'));
    
    possessions.forEach((p: any) => {
      constraints.push(`${this.getEntityName(p.source)} currently has ${this.getEntityName(p.target)}`);
    });
    
    // State constraints
    const inactiveEntities = Object.values(state.entities)
      .filter((e: any) => !e.active)
      .map((e: any) => e.id);
    
    if (inactiveEntities.length > 0) {
      constraints.push(`These entities are inactive/dead: ${inactiveEntities.join(', ')}`);
    }
    
    // Mission-specific constraints
    if (missionType === 'combat') {
      constraints.push('Ensure all participants are physically present');
      constraints.push('Check weapon availability');
    } else if (missionType === 'dialogue') {
      constraints.push('Only present characters can speak');
      constraints.push('Maintain character voice consistency');
    } else if (missionType === 'travel') {
      constraints.push('Consider travel time and geography');
      constraints.push('Update location relationships');
    }
    
    return constraints;
  }
}