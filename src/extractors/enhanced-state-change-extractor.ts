import { z } from 'zod';
import { LLMAdapter, Entity, Scene, StateChange } from '../types';

const isTestEnv = process.env.NODE_ENV === 'test';
const logError = (...args: unknown[]) => {
  if (!isTestEnv) {
    logError(...args);
  }
};

// Enhanced schema for narrative state changes
export const EnhancedStateChangeSchema = z.object({
  stateChanges: z.array(z.object({
    sceneId: z.string(),
    eventId: z.string().optional(),
    type: z.enum([
      'entity_introduced',      // New character/entity appears
      'entity_transformed',     // Entity undergoes significant change
      'entity_removed',        // Entity dies/leaves
      'relationship_formed',   // New relationship established
      'relationship_changed',  // Relationship nature changes
      'relationship_broken',   // Relationship ends
      'location_changed',      // Entity moves to new location
      'property_changed',      // Entity property changes (health, mental state, etc.)
      'knowledge_gained',      // Character learns something
      'object_introduced',     // New important object appears
      'environment_changed'    // Environmental state change
    ]),
    entityId: z.string().optional(),
    targetEntityId: z.string().optional(),
    relationshipType: z.string().optional(),
    property: z.string().optional(),
    oldValue: z.any().optional(),
    newValue: z.any().optional(),
    description: z.string(),
    impact: z.enum(['minor', 'moderate', 'major', 'catastrophic']).optional()
  }))
});

export class EnhancedStateChangeExtractor {
  constructor(private llmAdapter: LLMAdapter) {}

  async extractStateChanges(
    text: string,
    scenes: Scene[],
    entities: Entity[]
  ): Promise<StateChange[]> {
    const entityList = entities.map(e => `${e.id}: ${e.name}`).join('\n');
    const sceneList = scenes.map(s => `${s.id}: ${s.description}`).join('\n');

    const prompt = `
Analyze this narrative and identify all significant state changes that modify the story graph.
Focus on changes that:
1. Introduce new entities (characters, important objects, locations)
2. Transform entities (physical, mental, or circumstantial changes)
3. Create, modify, or break relationships between entities
4. Change entity properties (location, health, knowledge, possessions)
5. Alter the environment or setting

For Lovecraft's "The Colour Out of Space", pay special attention to:
- The arrival and influence of the meteorite/colour
- Progressive corruption of land, plants, animals, and people
- Mental deterioration of the Gardner family
- Disappearances and deaths
- Changes in relationships as fear and madness spread

Entities:
${entityList}

Scenes:
${sceneList}

Text:
${text}

For each state change, specify:
- Which scene it occurs in
- The type of change (from the enum list)
- Which entities are affected
- What specifically changed
- A clear description of the change
- The impact level (minor/moderate/major/catastrophic)

Focus on changes that would alter a graph representation of the narrative.
`;

    try {
      const result = await this.llmAdapter.generateStructuredOutput(
        prompt,
        EnhancedStateChangeSchema
      );
      
      // Convert to StateChange format with proper sequence numbers
      return result.stateChanges.map((change, index) => ({
        sequence: index + 1,
        sceneId: change.sceneId,
        eventId: change.eventId,
        type: this.mapToGraphChangeType(change.type),
        entityId: change.entityId,
        relationshipId: change.type.includes('relationship') ? 
          `rel_${change.entityId}_${change.targetEntityId}` : undefined,
        changes: {
          type: change.type,
          property: change.property,
          oldValue: change.oldValue,
          newValue: change.newValue,
          targetEntity: change.targetEntityId,
          relationshipType: change.relationshipType,
          impact: change.impact
        },
        description: change.description
      }));
    } catch (error) {
      logError('Error extracting enhanced state changes:', error);
      return this.fallbackExtraction(scenes, entities);
    }
  }

  private mapToGraphChangeType(type: string): 'entity_update' | 'relationship_add' | 'relationship_remove' | 'entity_add' | 'entity_remove' {
    switch (type) {
      case 'entity_introduced':
        return 'entity_add';
      case 'entity_removed':
        return 'entity_remove';
      case 'relationship_formed':
        return 'relationship_add';
      case 'relationship_broken':
        return 'relationship_remove';
      case 'relationship_changed':
        return 'relationship_add'; // Update by re-adding
      default:
        return 'entity_update';
    }
  }

  private fallbackExtraction(scenes: Scene[], entities: Entity[]): StateChange[] {
    // Basic fallback that creates state changes for major events
    const changes: StateChange[] = [];
    let sequence = 1;

    // Add entity introductions
    entities.forEach(entity => {
      changes.push({
        sequence: sequence++,
        sceneId: scenes[0]?.id || 'scene_1',
        type: 'entity_add',
        entityId: entity.id,
        changes: {
          name: entity.name,
          type: entity.type,
          description: entity.description
        },
        description: `${entity.name} is introduced to the narrative`
      });
    });

    return changes;
  }
}
