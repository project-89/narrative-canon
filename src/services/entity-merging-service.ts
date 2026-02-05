/**
 * Entity merging service for handling similar entities like "Oneirocom" vs "Oneirocom Corporation"
 */

import { MongoNarrativeAdapter } from '../storage/mongodb-adapter';
import { EntitySimilarityDetector, SimilarityMatch, EntityCluster } from '../core/entity-similarity';

export interface EntityMergeResult {
  success: boolean;
  canonicalEntityId: string;
  mergedEntityIds: string[];
  conflictsResolved: Array<{
    property: string;
    strategy: 'primary_wins' | 'combine' | 'manual_choice';
    finalValue: any;
    discardedValues: any[];
  }>;
  relationshipsUpdated: number;
  scenesUpdated: number;
}

export interface EntityMergeOptions {
  strategy: 'primary_wins' | 'combine_properties' | 'manual_review';
  primaryEntityId?: string; // If strategy is primary_wins
  conflictResolution?: Record<string, 'primary' | 'secondary' | any>; // Manual conflict resolution
  updateReferences: boolean;
  preserveHistory: boolean;
}

export class EntityMergingService {
  private adapter: MongoNarrativeAdapter;
  private similarityDetector: EntitySimilarityDetector;
  
  constructor(adapter: MongoNarrativeAdapter) {
    this.adapter = adapter;
    this.similarityDetector = new EntitySimilarityDetector();
  }
  
  /**
   * Scan all entities for potential duplicates/similar entities
   */
  async scanForSimilarEntities(): Promise<SimilarityMatch[]> {
    const entities = await this.adapter.EntityModel.find({
      canonicalEntityId: { $exists: false } // Only check non-merged entities
    }).select('entityId name aliases type').lean();
    
    return this.similarityDetector.detectSimilarEntities(entities);
  }
  
  /**
   * Mark similar entities for review
   */
  async markSimilarEntities(similarityMatches: SimilarityMatch[]): Promise<void> {
    for (const match of similarityMatches) {
      // Update entity1 with similarity to entity2
      await this.adapter.EntityModel.updateOne(
        { entityId: match.entity1 },
        {
          $addToSet: {
            similarEntities: {
              entityId: match.entity2,
              similarityScore: match.score,
              status: match.suggestedAction === 'merge' ? 'potential' : 'reviewed'
            }
          }
        }
      );
      
      // Update entity2 with similarity to entity1
      await this.adapter.EntityModel.updateOne(
        { entityId: match.entity2 },
        {
          $addToSet: {
            similarEntities: {
              entityId: match.entity1,
              similarityScore: match.score,
              status: match.suggestedAction === 'merge' ? 'potential' : 'reviewed'
            }
          }
        }
      );
    }
  }
  
  /**
   * Get entities that are marked as potential merges
   */
  async getPotentialMerges(): Promise<Array<{
    entityId: string;
    name: string;
    type: string;
    similarEntities: Array<{
      entityId: string;
      name: string;
      similarityScore: number;
      status: string;
    }>;
  }>> {
    const entities = await this.adapter.EntityModel.find({
      'similarEntities.status': 'potential',
      canonicalEntityId: { $exists: false }
    }).lean();
    
    const result = [];
    for (const entity of entities) {
      const similarEntitiesWithNames = [];
      
      for (const similar of entity.similarEntities.filter(s => s.status === 'potential')) {
        const similarEntity = await this.adapter.EntityModel.findOne(
          { entityId: similar.entityId }
        ).select('name').lean();
        
        if (similarEntity) {
          similarEntitiesWithNames.push({
            entityId: similar.entityId,
            name: similarEntity.name,
            similarityScore: similar.similarityScore,
            status: similar.status
          });
        }
      }
      
      if (similarEntitiesWithNames.length > 0) {
        result.push({
          entityId: entity.entityId,
          name: entity.name,
          type: entity.type,
          similarEntities: similarEntitiesWithNames
        });
      }
    }
    
    return result;
  }
  
  /**
   * Merge multiple entities into a single canonical entity
   */
  async mergeEntities(
    entityIds: string[], 
    options: EntityMergeOptions
  ): Promise<EntityMergeResult> {
    if (entityIds.length < 2) {
      throw new Error('Must provide at least 2 entities to merge');
    }
    
    // Fetch all entities to merge
    const entities = await this.adapter.EntityModel.find({
      entityId: { $in: entityIds }
    }).lean();
    
    if (entities.length !== entityIds.length) {
      throw new Error('Some entities not found');
    }
    
    // Determine primary entity
    const primaryEntity = this.selectPrimaryEntity(entities, options.primaryEntityId);
    const secondaryEntities = entities.filter(e => e.entityId !== primaryEntity.entityId);
    
    // Merge properties
    const mergedProperties = this.mergeEntityProperties(
      primaryEntity, 
      secondaryEntities, 
      options
    );
    
    // Try to use transactions if supported, fallback to regular operations
    try {
      const session = await this.adapter['connection'].startSession();
      
      try {
        const result = await session.withTransaction(async () => {
          return await this.performMergeOperations(
            primaryEntity, 
            secondaryEntities, 
            mergedProperties, 
            entityIds, 
            options, 
            session
          );
        });
        return result;
      } finally {
        await session.endSession();
      }
    } catch (error: any) {
      // If transactions aren't supported (e.g., MongoDB Memory Server), 
      // fallback to regular operations without transaction
      if (error.message?.includes('Transaction numbers') || error.message?.includes('replica set')) {
        return await this.performMergeOperations(
          primaryEntity, 
          secondaryEntities, 
          mergedProperties, 
          entityIds, 
          options
        );
      }
      throw error;
    }
  }
  
  private async performMergeOperations(
    primaryEntity: any,
    secondaryEntities: any[],
    mergedProperties: any,
    entityIds: string[],
    options: EntityMergeOptions,
    session?: any
  ): Promise<EntityMergeResult> {
    const saveOptions = session ? { session } : {};
    
    // Update canonical entity with merged properties
    await this.adapter.EntityModel.updateOne(
      { entityId: primaryEntity.entityId },
      {
        ...mergedProperties.entity,
        mergedFromEntities: secondaryEntities.map(e => e.entityId),
        $unset: { canonicalEntityId: 1 } // Ensure this isn't marked as merged
      },
      saveOptions
    );
    
    // Mark secondary entities as merged
    await this.adapter.EntityModel.updateMany(
      { entityId: { $in: secondaryEntities.map(e => e.entityId) } },
      {
        canonicalEntityId: primaryEntity.entityId,
        'similarEntities.$[elem].status': 'merged'
      },
      { 
        arrayFilters: [{ 'elem.entityId': { $in: entityIds } }],
        ...saveOptions
      }
    );
    
    let relationshipsUpdated = 0;
    let scenesUpdated = 0;
    
    if (options.updateReferences) {
      // Update relationships to point to canonical entity
      const relationshipUpdateResult = await this.adapter.RelationshipModel.updateMany(
        {
          $or: [
            { sourceEntityId: { $in: secondaryEntities.map(e => e.entityId) } },
            { targetEntityId: { $in: secondaryEntities.map(e => e.entityId) } }
          ]
        },
        [
          {
            $set: {
              sourceEntityId: {
                $cond: {
                  if: { $in: ['$sourceEntityId', secondaryEntities.map(e => e.entityId)] },
                  then: primaryEntity.entityId,
                  else: '$sourceEntityId'
                }
              },
              targetEntityId: {
                $cond: {
                  if: { $in: ['$targetEntityId', secondaryEntities.map(e => e.entityId)] },
                  then: primaryEntity.entityId,
                  else: '$targetEntityId'
                }
              }
            }
          }
        ],
        saveOptions
      );
      
      relationshipsUpdated = relationshipUpdateResult.modifiedCount;
      
      // Update scene character references
      const sceneUpdateResult = await this.adapter.SceneModel.updateMany(
        { characters: { $in: secondaryEntities.map(e => e.entityId) } },
        [
          {
            $set: {
              characters: {
                $map: {
                  input: '$characters',
                  in: {
                    $cond: {
                      if: { $in: ['$$this', secondaryEntities.map(e => e.entityId)] },
                      then: primaryEntity.entityId,
                      else: '$$this'
                    }
                  }
                }
              }
            }
          }
        ],
        saveOptions
      );
      
      scenesUpdated = sceneUpdateResult.modifiedCount;
    }
    
    return {
      success: true,
      canonicalEntityId: primaryEntity.entityId,
      mergedEntityIds: secondaryEntities.map(e => e.entityId),
      conflictsResolved: mergedProperties.conflictsResolved,
      relationshipsUpdated,
      scenesUpdated
    };
  }
  
  /**
   * Update similarity status after manual review
   */
  async updateSimilarityStatus(
    entityId: string, 
    similarEntityId: string, 
    status: 'reviewed' | 'merged' | 'rejected'
  ): Promise<void> {
    await this.adapter.EntityModel.updateOne(
      { 
        entityId: entityId,
        'similarEntities.entityId': similarEntityId
      },
      {
        $set: { 'similarEntities.$.status': status }
      }
    );
    
    // Update the reverse relationship
    await this.adapter.EntityModel.updateOne(
      { 
        entityId: similarEntityId,
        'similarEntities.entityId': entityId
      },
      {
        $set: { 'similarEntities.$.status': status }
      }
    );
  }
  
  /**
   * Get merge suggestions for a specific entity
   */
  async getMergeSuggestions(entityId: string): Promise<Array<{
    candidateEntity: any;
    similarityScore: number;
    reasons: string[];
    suggestedAction: string;
    conflicts: Array<{
      property: string;
      currentValue: any;
      candidateValue: any;
    }>;
  }>> {
    const entity = await this.adapter.EntityModel.findOne({ entityId }).lean();
    if (!entity) {
      throw new Error('Entity not found');
    }
    
    const suggestions = [];
    
    for (const similar of entity.similarEntities.filter(s => s.status === 'potential')) {
      const candidateEntity = await this.adapter.EntityModel.findOne({
        entityId: similar.entityId
      }).lean();
      
      if (!candidateEntity) continue;
      
      // Analyze potential conflicts
      const conflicts = this.analyzePropertyConflicts(entity, candidateEntity);
      
      // Generate reasons for similarity
      const similarityScore = this.similarityDetector.calculateNameSimilarity(
        entity.name, 
        candidateEntity.name
      );
      
      const reasons = [];
      if (similarityScore > 0.9) {
        reasons.push('Very high name similarity');
      } else if (similarityScore > 0.8) {
        reasons.push('High name similarity');
      } else {
        reasons.push('Moderate name similarity');
      }
      
      // Check alias matching
      const allAliases1 = [entity.name, ...(entity.aliases || [])];
      const allAliases2 = [candidateEntity.name, ...(candidateEntity.aliases || [])];
      
      for (const alias1 of allAliases1) {
        for (const alias2 of allAliases2) {
          if (alias1.toLowerCase() === alias2.toLowerCase()) {
            reasons.push('Exact alias match');
          }
        }
      }
      
      const suggestedAction = similarityScore > 0.9 ? 'merge' : 
                             similarityScore > 0.8 ? 'alias' : 'review';
      
      suggestions.push({
        candidateEntity,
        similarityScore: similar.similarityScore,
        reasons,
        suggestedAction,
        conflicts
      });
    }
    
    return suggestions.sort((a, b) => b.similarityScore - a.similarityScore);
  }
  
  private selectPrimaryEntity(entities: any[], preferredId?: string): any {
    if (preferredId) {
      const preferred = entities.find(e => e.entityId === preferredId);
      if (preferred) return preferred;
    }
    
    // Select based on criteria: most complete, longest name, highest consistency score
    return entities.reduce((primary, current) => {
      // Prefer entities with more information
      const primaryScore = this.calculateCompletenessScore(primary);
      const currentScore = this.calculateCompletenessScore(current);
      
      if (currentScore > primaryScore) return current;
      if (currentScore < primaryScore) return primary;
      
      // If equal, prefer longer name
      if (current.name.length > primary.name.length) return current;
      if (current.name.length < primary.name.length) return primary;
      
      // If still equal, prefer higher consistency score
      return (current.consistencyScore || 0) > (primary.consistencyScore || 0) ? current : primary;
    });
  }
  
  private calculateCompletenessScore(entity: any): number {
    let score = 0;
    
    if (entity.description) score += 2;
    if (entity.aliases && entity.aliases.length > 0) score += entity.aliases.length;
    if (entity.traits && Object.keys(entity.traits).length > 0) score += Object.keys(entity.traits).length;
    if (entity.sourceFragments && entity.sourceFragments.length > 0) score += entity.sourceFragments.length;
    if (entity.missionAppearances && entity.missionAppearances.length > 0) score += entity.missionAppearances.length;
    
    return score;
  }
  
  private mergeEntityProperties(
    primary: any, 
    secondaries: any[], 
    options: EntityMergeOptions
  ): {
    entity: any;
    conflictsResolved: Array<{
      property: string;
      strategy: 'primary_wins' | 'combine' | 'manual_choice';
      finalValue: any;
      discardedValues: any[];
    }>;
  } {
    const conflictsResolved: Array<{
      property: string;
      strategy: 'primary_wins' | 'combine' | 'manual_choice';
      finalValue: any;
      discardedValues: any[];
    }> = [];
    
    const mergedEntity = { ...primary };
    
    // Merge arrays (aliases, tags, etc.)
    const arrayProperties = ['aliases', 'tags', 'sourceFragments', 'timelineEvents', 'missionAppearances', 'relatedEntities'];
    
    for (const prop of arrayProperties) {
      const allValues = [primary[prop] || [], ...secondaries.map(s => s[prop] || [])].flat();
      mergedEntity[prop] = [...new Set(allValues)];
    }
    
    // Merge traits/properties objects
    if (primary.traits || secondaries.some(s => s.traits)) {
      mergedEntity.traits = { ...primary.traits };
      
      for (const secondary of secondaries) {
        if (secondary.traits) {
          for (const [key, value] of Object.entries(secondary.traits)) {
            if (mergedEntity.traits[key] && mergedEntity.traits[key] !== value) {
              // Conflict detected
              const resolution = options.conflictResolution?.[key];
              
              if (resolution === 'primary') {
                conflictsResolved.push({
                  property: `traits.${key}`,
                  strategy: 'primary_wins',
                  finalValue: mergedEntity.traits[key],
                  discardedValues: [value]
                });
              } else if (resolution === 'secondary') {
                conflictsResolved.push({
                  property: `traits.${key}`,
                  strategy: 'manual_choice',
                  finalValue: value,
                  discardedValues: [mergedEntity.traits[key]]
                });
                mergedEntity.traits[key] = value;
              } else {
                // Default: combine if possible, otherwise primary wins
                if (Array.isArray(mergedEntity.traits[key]) && Array.isArray(value)) {
                  mergedEntity.traits[key] = [...new Set([...mergedEntity.traits[key], ...value])];
                  conflictsResolved.push({
                    property: `traits.${key}`,
                    strategy: 'combine',
                    finalValue: mergedEntity.traits[key],
                    discardedValues: []
                  });
                } else {
                  conflictsResolved.push({
                    property: `traits.${key}`,
                    strategy: 'primary_wins',
                    finalValue: mergedEntity.traits[key],
                    discardedValues: [value]
                  });
                }
              }
            } else if (!mergedEntity.traits[key]) {
              mergedEntity.traits[key] = value;
            }
          }
        }
      }
    }
    
    return { entity: mergedEntity, conflictsResolved };
  }
  
  private analyzePropertyConflicts(entity1: any, entity2: any): Array<{
    property: string;
    currentValue: any;
    candidateValue: any;
  }> {
    const conflicts: Array<{
      property: string;
      currentValue: any;
      candidateValue: any;
    }> = [];
    
    // Check basic properties
    const simpleProperties = ['description', 'type'];
    
    for (const prop of simpleProperties) {
      if (entity1[prop] && entity2[prop] && entity1[prop] !== entity2[prop]) {
        conflicts.push({
          property: prop,
          currentValue: entity1[prop],
          candidateValue: entity2[prop]
        });
      }
    }
    
    // Check traits
    if (entity1.traits && entity2.traits) {
      for (const [key, value] of Object.entries(entity2.traits)) {
        if (entity1.traits[key] && entity1.traits[key] !== value) {
          conflicts.push({
            property: `traits.${key}`,
            currentValue: entity1.traits[key],
            candidateValue: value
          });
        }
      }
    }
    
    return conflicts;
  }
}