import { z } from "zod";
import { LLMAdapter } from "./types";
import { CharacterExtractor } from "./extractors/character";
import { EntityExtractor } from "./extractors/entity-extractor";
import { SceneExtractor } from "./extractors/scene-extractor";
import { RelationshipExtractor } from "./extractors/relationship-extractor";
import { StateChangeExtractor } from "./extractors/state-change-extractor";
import { EnhancedStateChangeExtractor } from "./extractors/enhanced-state-change-extractor";
import { InteractionExtractor } from "./extractors/interaction-extractor";
import { EntitySimilarityDetector, EntityCluster } from "./core/entity-similarity";
// import { HierarchicalNarrativeExtractor } from "./extractors/hierarchical"; // Not currently used
import { TemporalGraphBuilder } from "./graph/temporal";
import {
  Entity,
  NarrativeStructure,
  Scene, // Canonical Scene from types.ts
  Relationship, // Canonical Relationship from types.ts
  StateChange, // Canonical StateChange from types.ts
  Interaction, // Canonical Interaction from types.ts
  Event,
} from "./types";

// No local Zod schema for the final NarrativeStructure here, rely on interfaces from types.ts

export interface ExistingNarrativeData {
  entities?: Entity[];
  relationships?: Relationship[];
  scenes?: Scene[];
  stateChanges?: StateChange[];
  interactions?: Interaction[];
}

const isTestEnv = process.env.NODE_ENV === "test";

export class NarrativePipeline {
  private characterExtractor: CharacterExtractor;
  private entityExtractor: EntityExtractor;
  private sceneExtractor: SceneExtractor;
  private relationshipExtractor: RelationshipExtractor;
  private stateChangeExtractor: StateChangeExtractor;
  private enhancedStateChangeExtractor: EnhancedStateChangeExtractor;
  private interactionExtractor: InteractionExtractor;
  private entitySimilarityDetector: EntitySimilarityDetector;
  private temporalGraphBuilder: TemporalGraphBuilder;

  constructor(private llmAdapter: LLMAdapter, private useEnhancedExtractors = true) {
    this.characterExtractor = new CharacterExtractor(llmAdapter);
    this.entityExtractor = new EntityExtractor(llmAdapter);
    this.sceneExtractor = new SceneExtractor(llmAdapter);
    this.relationshipExtractor = new RelationshipExtractor(llmAdapter);
    this.stateChangeExtractor = new StateChangeExtractor(llmAdapter);
    this.enhancedStateChangeExtractor = new EnhancedStateChangeExtractor(llmAdapter);
    this.interactionExtractor = new InteractionExtractor(llmAdapter);
    this.entitySimilarityDetector = new EntitySimilarityDetector();
    this.temporalGraphBuilder = new TemporalGraphBuilder();
  }

  async extractNarrative(text: string, existingData?: ExistingNarrativeData): Promise<NarrativeStructure> {
    if (!isTestEnv) {
      console.log("📖 Starting narrative extraction pipeline...");
    }

    if (!isTestEnv) {
      console.log("  Phase 1: Extracting entities...");
    }
    const newEntities: Entity[] = await this.entityExtractor.extractEntities(text, existingData?.entities);
    let allEntities: Entity[] = [...(existingData?.entities || []), ...newEntities];

    if (!isTestEnv) {
      console.log("  Phase 1.5: Deduplicating entities (reality coherence enforcement)...");
    }
    allEntities = await this.deduplicateEntities(allEntities);

    if (!isTestEnv) {
      console.log("  Phase 2: Breaking down into scenes...");
    }
    const scenes: Scene[] = await this.sceneExtractor.extractScenes(
      text,
      allEntities
    );

    if (!isTestEnv) {
      console.log(
        "  Phase 3-5: Extracting relationships, state changes, and interactions in parallel..."
      );
    }
    const [extractedRelationships, extractedStateChangesFromExtractor, extractedInteractions] =
      await Promise.all([
        this.relationshipExtractor.extractRelationships(text, allEntities, scenes, existingData?.relationships),
        this.useEnhancedExtractors
          ? this.enhancedStateChangeExtractor.extractStateChanges(text, scenes, allEntities)
          : this.stateChangeExtractor.extractStateChanges(text, scenes, allEntities),
        this.interactionExtractor.extractInteractions(text, allEntities),
      ]);

    const relationships: Relationship[] = [...(existingData?.relationships || []), ...extractedRelationships];
    // Ensure extractedStateChangesFromExtractor is correctly typed as StateChange[] from types.ts
    const stateChanges: StateChange[] = [...(existingData?.stateChanges || []), ...extractedStateChangesFromExtractor];
    const interactions: Interaction[] = [...(existingData?.interactions || []), ...extractedInteractions];

    if (!isTestEnv) {
      console.log("  Phase 5: Building chronology...");
    }
    const chronologyEvents = this.buildChronology(scenes, stateChanges);

    const structure: NarrativeStructure = {
      entities: allEntities,
      scenes,
      relationships,
      stateChanges,
      interactions,
      chronology: {
        events: chronologyEvents,
        timeline: chronologyEvents.map((e) => e.id), // Assuming chronology events have IDs
      },
      themes: [], // Placeholder
      metadata: {
        entityDeduplicationApplied: true,
        enhancedExtractorsUsed: this.useEnhancedExtractors,
        interactionExtractionEnabled: true,
        timelineCoherenceLevel: this.calculateCoherenceLevel(allEntities, stateChanges)
      },
    };

    if (!isTestEnv) {
      console.log("✅ Narrative extraction complete!");
    }
    return structure;
  }

  /**
   * Extract narrative incrementally, avoiding duplication of existing entities and relationships
   */
  async extractNarrativeIncremental(
    text: string,
    existingStructure: NarrativeStructure
  ): Promise<NarrativeStructure> {
    const existingData: ExistingNarrativeData = {
      entities: existingStructure.entities,
      relationships: existingStructure.relationships,
      scenes: existingStructure.scenes,
      stateChanges: existingStructure.stateChanges,
      interactions: existingStructure.interactions
    };

    return this.extractNarrative(text, existingData);
  }

  buildGraph(structure: NarrativeStructure): any {
    // This method remains unimplemented as per original code, or could use NarrativeGraphBuilder
    return null;
  }

  buildTemporalGraph(structure: NarrativeStructure): any {
    const builder = new TemporalGraphBuilder();
    structure.entities.forEach((entity) => builder.addEntity(entity));
    structure.relationships.forEach((relationship) =>
      builder.addRelationship(relationship)
    );
    // Ensure 'change' here is the canonical StateChange from types.ts
    // which should have the optional 'changes' field.
    structure.stateChanges.forEach((change) =>
      builder.applyStateChange(change)
    );
    const temporalGraph = builder.build();
    return {
      currentState: temporalGraph.graphSnapshots.get(
        Math.max(...temporalGraph.sequences)
      ) || { entities: new Map(), relationships: new Map(), metadata: {} },
      history: temporalGraph.graphSnapshots,
    };
  }

  private buildChronology(
    scenes: Scene[],
    stateChanges: StateChange[] // Ensure this is the canonical StateChange from types.ts
  ): Event[] {
    // Return type is canonical Event[]
    const chronology: Event[] = [];

    scenes.forEach((scene) => {
      chronology.push({
        id: scene.id,
        sequence: scene.sequence,
        sceneId: scene.id,
        description: scene.title || scene.description,
        participants: scene.characters,
        type: "scene_start",
      });

      if (scene.events) {
        scene.events.forEach((event) => {
          chronology.push({ ...event, sceneId: scene.id });
        });
      }
    });

    stateChanges.forEach((change) => {
      // Ensure 'change' object conforms to canonical StateChange from types.ts
      chronology.push({
        id: `state_change_${change.sceneId}_${change.eventId || "na"}_${change.sequence}`,
        sequence: change.sequence,
        sceneId: change.sceneId,
        description: change.description,
        participants: change.entityId ? [change.entityId] : [], // Use entityId
        type: `state_change_${change.type}`,
      });
    });

    chronology.sort((a, b) => {
      const sceneA = scenes.find((s) => s.id === a.sceneId);
      const sceneB = scenes.find((s) => s.id === b.sceneId);
      if (sceneA && sceneB && sceneA.sequence !== sceneB.sequence) {
        return sceneA.sequence - sceneB.sequence;
      }
      return a.sequence - b.sequence;
    });

    return chronology.map((event, index) => ({
      ...event,
      id: event.id || `chrono_event_${index}`,
      sequence: index + 1,
    }));
  }

  /**
   * Deduplicate entities to maintain narrative reality coherence
   * This ensures the same consciousness pattern isn't duplicated across timelines
   */
  private async deduplicateEntities(entities: Entity[]): Promise<Entity[]> {
    if (entities.length <= 1) return entities;

    // Convert Entity[] to the format expected by clusterSimilarEntities
    const entityData = entities.map(entity => ({
      entityId: entity.id,
      name: entity.name,
      aliases: entity.aliases || [],
      type: entity.type
    }));

    const clusters = this.entitySimilarityDetector.clusterSimilarEntities(entityData);
    const deduplicatedEntities: Entity[] = [];

    for (const cluster of clusters) {
      if (cluster.entities.length === 1) {
        // No duplicates found
        const entityData = entities.find(e => e.id === cluster.entities[0].entityId);
        if (entityData) deduplicatedEntities.push(entityData);
      } else {
        // Merge similar entities into canonical form
        const canonicalEntity = this.mergeEntitiesInCluster(cluster, entities);
        deduplicatedEntities.push(canonicalEntity);
        
        console.log(`🔗 Merged ${cluster.entities.length} similar entities into: ${canonicalEntity.name}`);
      }
    }

    return deduplicatedEntities;
  }

  /**
   * Merge entities in a cluster to create canonical representation
   */
  private mergeEntitiesInCluster(cluster: EntityCluster, allEntities: Entity[]): Entity {
    const clusterEntities = cluster.entities
      .map((ce: {entityId: string, name: string, confidence: number}) => allEntities.find(e => e.id === ce.entityId))
      .filter((e: Entity | undefined): e is Entity => e !== undefined);

    // Primary entity (highest confidence)
    const primary = clusterEntities[0];
    
    // Merge properties from all entities
    const mergedEntity: Entity = {
      ...primary,
      name: cluster.canonicalName,
      aliases: [
        ...(primary.aliases || []),
        ...clusterEntities.slice(1).map(e => e.name),
        ...clusterEntities.flatMap(e => e.aliases || [])
      ].filter((alias, index, arr) => arr.indexOf(alias) === index), // Remove duplicates
      description: this.combineDescriptions(clusterEntities),
      metadata: {
        ...primary.metadata,
        mergedFrom: clusterEntities.map(e => e.id),
        mergeStrategy: cluster.mergeStrategy,
        timelineMerged: new Date().toISOString()
      }
    };

    return mergedEntity;
  }

  /**
   * Combine descriptions from multiple entities intelligently
   */
  private combineDescriptions(entities: Entity[]): string {
    const descriptions = entities
      .map(e => e.description)
      .filter(d => d && d.trim().length > 0);
    
    if (descriptions.length === 0) return '';
    if (descriptions.length === 1) return descriptions[0];
    
    // Return the longest description as primary, with others as additional context
    const sorted = descriptions.sort((a, b) => b.length - a.length);
    return sorted[0]; // For now, use the most detailed description
  }

  /**
   * Calculate timeline coherence level for consciousness technology metrics
   */
  private calculateCoherenceLevel(entities: Entity[], stateChanges: StateChange[]): number {
    // Coherence metrics:
    // - Entity consistency (no duplicates)
    // - State change continuity
    // - Temporal logical flow
    
    let coherenceScore = 1.0;
    
    // Penalize if we find potential duplicates that weren't merged
    const potentialDuplicates = this.findPotentialUnmergedDuplicates(entities);
    coherenceScore -= potentialDuplicates.length * 0.1;
    
    // Bonus for well-tracked state changes
    const stateChangeRatio = stateChanges.length / Math.max(entities.length, 1);
    coherenceScore += Math.min(stateChangeRatio * 0.1, 0.2);
    
    return Math.max(0, Math.min(1, coherenceScore));
  }

  /**
   * Find entities that might be duplicates but weren't caught by deduplication
   */
  private findPotentialUnmergedDuplicates(entities: Entity[]): Array<{entity1: string, entity2: string, score: number}> {
    const duplicates: Array<{entity1: string, entity2: string, score: number}> = [];
    
    for (let i = 0; i < entities.length - 1; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const similarity = this.entitySimilarityDetector.calculateNameSimilarity(
          entities[i].name, 
          entities[j].name
        );
        
        if (similarity > 0.7) { // Threshold for potential duplicates
          duplicates.push({
            entity1: entities[i].name,
            entity2: entities[j].name,
            score: similarity
          });
        }
      }
    }
    
    return duplicates;
  }
}
