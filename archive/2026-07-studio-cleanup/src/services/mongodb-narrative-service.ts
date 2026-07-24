import { NarrativePipeline } from '../pipeline';
import { MongoNarrativeAdapter } from '../storage/mongodb-adapter';
import { LLMAdapter } from '../types';
import { GeminiAdapter } from '../llm/gemini';
import { MockLLM } from '../llm/mock';

/**
 * Production-ready narrative service that integrates narrative-canon 
 * with MongoDB storage following Proxim8 patterns
 */
export class MongoNarrativeService {
  public adapter: MongoNarrativeAdapter;
  private pipeline: NarrativePipeline;
  private llm: LLMAdapter;

  constructor(
    mongoConfig: {
      connection?: any;
      mongoUrl?: string;
      dbName?: string;
    },
    llmConfig: {
      type: 'gemini' | 'mock';
      apiKey?: string;
      model?: string;
    } = { type: 'mock' }
  ) {
    this.adapter = new MongoNarrativeAdapter(mongoConfig);
    
    // Initialize LLM adapter
    if (llmConfig.type === 'gemini' && llmConfig.apiKey) {
      this.llm = new GeminiAdapter(llmConfig.apiKey);
    } else {
      this.llm = new MockLLM();
    }

    this.pipeline = new NarrativePipeline(this.llm);
  }

  /**
   * Extract narrative from text and save to MongoDB
   * Follows Proxim8 patterns for consistency tracking
   */
  async extractAndSave(
    content: string,
    metadata: {
      title: string;
      sourceType: 'lore' | 'mission' | 'manual' | 'generated';
      sourceId?: string;
      seasonId?: string;
      tags?: string[];
      userId?: string; // For tracking who initiated extraction
    }
  ): Promise<{
    documentId: string;
    extraction: any;
    stats: {
      entitiesExtracted: number;
      relationshipsExtracted: number;
      scenesExtracted: number;
      consistencyScore: number;
    };
  }> {
    try {
      // Generate unique document ID (Proxim8 pattern)
      const documentId = `${metadata.sourceType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Extract narrative using the pipeline
      const extraction = await this.pipeline.extractNarrative(content);

      // Calculate initial consistency score
      const consistencyScore = this.calculateConsistencyScore(extraction);

      // Save to MongoDB with metadata
      await this.adapter.saveNarrativeDocument(
        documentId,
        metadata.title,
        content,
        extraction,
        {
          extractionVersion: '1.0.0',
          llmModel: this.llm.constructor.name,
          sourceType: metadata.sourceType,
          sourceId: metadata.sourceId,
          seasonId: metadata.seasonId,
          tags: metadata.tags || [],
        }
      );

      // Update consistency scores for all entities
      if (extraction.entities) {
        for (const entity of extraction.entities) {
          const entityId = `${documentId}_${entity.id}`;
          await this.adapter.updateConsistencyScore(entityId, consistencyScore);
        }
      }

      return {
        documentId,
        extraction,
        stats: {
          entitiesExtracted: extraction.entities?.length || 0,
          relationshipsExtracted: extraction.relationships?.length || 0,
          scenesExtracted: extraction.scenes?.length || 0,
          consistencyScore,
        },
      };
    } catch (error) {
      console.error('Error in extractAndSave:', error);
      throw new Error(`Narrative extraction failed: ${error}`);
    }
  }

  /**
   * Get entities with Proxim8-style pagination and filtering
   */
  async getEntities(options: {
    type?: string;
    canonicalStatus?: 'canon' | 'disputed' | 'extracted' | 'validated';
    sourceType?: 'lore' | 'mission' | 'manual' | 'generated';
    seasonId?: string;
    page?: number;
    limit?: number;
    minConsistencyScore?: number;
  } = {}) {
    const {
      type,
      canonicalStatus,
      sourceType,
      page = 1,
      limit = 10,
      minConsistencyScore,
    } = options;

    if (type) {
      const result = await this.adapter.getEntitiesByType(type, {
        page,
        limit,
        canonicalStatus,
        sourceType,
      });

      // Filter by consistency score if provided
      if (minConsistencyScore !== undefined) {
        result.entities = result.entities.filter(
          e => e.consistencyScore >= minConsistencyScore
        );
      }

      return result;
    }

    // If no type specified, return all entities (admin use case)
    return this.adapter.getEntitiesByType('', {
      page,
      limit,
      canonicalStatus,
      sourceType,
    });
  }

  /**
   * Get narrative graph for an entity (following Proxim8 relationship patterns)
   */
  async getEntityGraph(entityId: string, depth: number = 2) {
    const [entity, relationships, connectedData] = await Promise.all([
      this.adapter.EntityModel.findOne({ entityId }),
      this.adapter.getEntityRelationships(entityId),
      this.adapter.getConnectedEntities(entityId, depth),
    ]);

    if (!entity) {
      throw new Error('Entity not found');
    }

    return {
      entity,
      relationships,
      connectedEntities: connectedData.entities,
      networkStats: {
        directConnections: relationships.length,
        networkSize: connectedData.entities.length,
        avgConsistencyScore: this.calculateAverageConsistency(connectedData.entities),
      },
    };
  }

  /**
   * Integration with Proxim8 Lore System
   */
  async processLoreFragment(
    loreFragmentId: string,
    content: string,
    metadata: {
      nftId?: string;
      seasonId?: string;
      missionId?: string;
      tags?: string[];
    }
  ) {
    // Extract narrative from lore content
    const result = await this.extractAndSave(content, {
      title: `Lore Fragment ${loreFragmentId}`,
      sourceType: 'lore',
      sourceId: loreFragmentId,
      seasonId: metadata.seasonId,
      tags: [...(metadata.tags || []), 'lore', metadata.nftId ? `nft_${metadata.nftId}` : ''].filter(Boolean),
    });

    // Link entities to the lore fragment
    if (result.extraction.entities) {
      for (const entity of result.extraction.entities) {
        const entityId = `${result.documentId}_${entity.id}`;
        await this.adapter.linkToLoreFragment(entityId, loreFragmentId);
        
        // If mission-related, link to mission
        if (metadata.missionId) {
          await this.adapter.linkToMission(entityId, metadata.missionId);
        }
      }
    }

    return result;
  }

  /**
   * Integration with Mission System (Timeline Updates)
   */
  async processMissionOutcome(
    missionId: string,
    outcome: {
      narrative: string;
      success: boolean;
      timelineShift: number;
      stateChanges: Array<{
        entityName: string;
        changeType: string;
        description: string;
      }>;
    }
  ) {
    // Extract narrative from mission outcome
    const result = await this.extractAndSave(outcome.narrative, {
      title: `Mission ${missionId} Outcome`,
      sourceType: 'mission',
      sourceId: missionId,
      tags: ['mission', 'outcome', outcome.success ? 'success' : 'failure'],
    });

    // Process state changes and update entity consistency
    for (const change of outcome.stateChanges) {
      // Find entities matching the changed entity name
      const entities = await this.adapter.EntityModel.find({
        name: new RegExp(change.entityName, 'i'),
      });

      for (const entity of entities) {
        // Link to mission
        await this.adapter.linkToMission(entity.entityId, missionId);
        
        // Update consistency based on change type
        const consistencyImpact = this.calculateConsistencyImpact(change, outcome.success);
        const newScore = Math.max(0, Math.min(100, entity.consistencyScore + consistencyImpact));
        
        await this.adapter.updateConsistencyScore(entity.entityId, newScore);
      }
    }

    return result;
  }

  /**
   * Consistency validation across narrative network
   */
  async validateNarrativeConsistency(entityId: string): Promise<{
    consistencyScore: number;
    conflicts: Array<{
      type: string;
      description: string;
      severity: 'low' | 'medium' | 'high';
      affectedEntities: string[];
    }>;
    recommendations: string[];
  }> {
    const entityGraph = await this.getEntityGraph(entityId, 3);
    const conflicts: any[] = [];
    const recommendations: string[] = [];

    // Check for contradictory relationships
    const contradictions = this.findRelationshipContradictions(entityGraph.relationships);
    conflicts.push(...contradictions);

    // Check for timeline inconsistencies
    const timelineIssues = await this.findTimelineInconsistencies(entityId);
    conflicts.push(...timelineIssues);

    // Calculate overall consistency score
    const consistencyScore = this.calculateNetworkConsistency(entityGraph);

    // Generate recommendations
    if (consistencyScore < 70) {
      recommendations.push('Consider reviewing source material for conflicts');
    }
    if (conflicts.some(c => c.severity === 'high')) {
      recommendations.push('High-severity conflicts detected - requires manual review');
    }

    return {
      consistencyScore,
      conflicts,
      recommendations,
    };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private calculateConsistencyScore(extraction: any): number {
    // Simple consistency scoring algorithm
    let score = 50; // Base score

    // More entities = higher confidence in extraction
    if (extraction.entities) {
      score += Math.min(20, extraction.entities.length * 2);
    }

    // Relationships indicate deeper understanding
    if (extraction.relationships) {
      score += Math.min(15, extraction.relationships.length * 3);
    }

    // Scenes indicate narrative structure
    if (extraction.scenes) {
      score += Math.min(15, extraction.scenes.length * 5);
    }

    return Math.min(100, Math.max(0, score));
  }

  private calculateAverageConsistency(entities: any[]): number {
    if (entities.length === 0) return 0;
    const sum = entities.reduce((acc, e) => acc + (e.consistencyScore || 0), 0);
    return sum / entities.length;
  }

  private calculateConsistencyImpact(
    change: { changeType: string; description: string },
    missionSuccess: boolean
  ): number {
    // Mission success generally increases consistency
    const baseImpact = missionSuccess ? 5 : -3;
    
    // Different change types have different impacts
    const typeModifiers: Record<string, number> = {
      create: 8,
      modify: 3,
      destroy: -5,
      relocate: 2,
    };

    const modifier = typeModifiers[change.changeType] || 0;
    return baseImpact + modifier;
  }

  private findRelationshipContradictions(relationships: any[]): any[] {
    const conflicts: any[] = [];
    
    // Simple contradiction detection (can be enhanced)
    const relationshipMap = new Map<string, any[]>();
    
    relationships.forEach(rel => {
      const key = `${rel.sourceEntityId}_${rel.targetEntityId}`;
      if (!relationshipMap.has(key)) {
        relationshipMap.set(key, []);
      }
      relationshipMap.get(key)!.push(rel);
    });

    // Check for contradictory relationship types
    relationshipMap.forEach((rels, key) => {
      if (rels.length > 1) {
        const types = rels.map(r => r.relationshipType);
        const contradictoryTypes = ['enemy', 'ally'];
        
        if (contradictoryTypes.every(type => types.includes(type))) {
          conflicts.push({
            type: 'relationship_contradiction',
            description: `Entity has contradictory relationships: ${types.join(', ')}`,
            severity: 'high',
            affectedEntities: [rels[0].sourceEntityId, rels[0].targetEntityId],
          });
        }
      }
    });

    return conflicts;
  }

  private async findTimelineInconsistencies(entityId: string): Promise<any[]> {
    // Placeholder for timeline consistency checking
    // In production, this would check against TimelineEvent data
    return [];
  }

  private calculateNetworkConsistency(entityGraph: any): number {
    const { entity, connectedEntities } = entityGraph;
    
    // Network consistency is average of all connected entities
    const allEntities = [entity, ...connectedEntities];
    return this.calculateAverageConsistency(allEntities);
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    await this.adapter.close();
  }
}

// Export for integration with Proxim8 controllers
export { MongoNarrativeAdapter };