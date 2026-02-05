import { z } from 'zod';
import { LLMAdapter } from '../types';
import { GraphMutation, GraphMutationType, GraphMutationSchema } from '../narrative-state-machine';

/**
 * State Machine Extractor
 * 
 * Extracts narrative as a series of graph mutations that can be
 * applied to build the complete story state over time.
 */

// Schema for LLM to extract graph mutations
const NarrativeMutationsSchema = z.object({
  mutations: z.array(z.object({
    timestamp: z.number(),
    type: z.string(),
    entityId: z.string().optional(),
    targetEntityId: z.string().optional(),
    relationshipId: z.string().optional(),
    properties: z.record(z.any()).optional(),
    oldValue: z.any().optional(),
    newValue: z.any().optional(),
    sceneId: z.string(),
    eventId: z.string().optional(),
    description: z.string(),
    impact: z.enum(['minimal', 'minor', 'moderate', 'major', 'transformative']),
    reversible: z.boolean().optional()
  }))
});

export class StateMachineExtractor {
  constructor(private llmAdapter: LLMAdapter) {}

  async extractMutations(
    text: string,
    scenes: any[],
    entities: any[]
  ): Promise<GraphMutation[]> {
    const prompt = `
You are analyzing a narrative to extract it as a series of graph mutations.
Think of the story as a graph that evolves over time:
- Nodes are entities (characters, objects, locations, concepts)
- Edges are relationships between entities
- Properties track the state of entities (health, location, knowledge, etc.)

For "The Colour Out of Space", track these types of changes:

1. ENTITY INTRODUCTIONS:
- The meteorite (a new entity with alien properties)
- The colour entity (emerges from meteorite)
- Each Gardner family member
- Scientists, officials, animals
- Locations (the well, the farm, specific rooms)

2. PROPERTY CHANGES:
- Physical state (healthy → sick → transformed → dead)
- Mental state (sane → disturbed → mad)
- Appearance (normal → grey and brittle)
- Knowledge (unaware → suspicious → horrified)
- Location (where entities are at each point)

3. RELATIONSHIP CHANGES:
- Family bonds weakening as madness spreads
- The colour "infecting" or "draining" entities
- Characters investigating or fleeing from others
- Trust breaking down between characters

4. ENVIRONMENTAL CHANGES:
- The farm's transformation
- Plants and soil corruption
- The well becoming a focal point
- The spreading blight

For each significant narrative event, create a mutation that describes:
- What type of change occurred (use the GraphMutationType enum)
- Which entities are involved
- What properties changed (with old and new values)
- The impact level (how significant is this change)
- A clear description

Scenes provided:
${scenes.map(s => `${s.id}: ${s.description}`).join('\n')}

Known entities:
${entities.map(e => `${e.id}: ${e.name} - ${e.description}`).join('\n')}

Extract mutations in chronological order, focusing on changes that alter the graph structure or entity states.
Use these mutation types:
- entity_introduced: New character/object/location appears
- entity_updated: Properties of an entity change
- entity_removed: Entity dies/disappears/is destroyed
- relationship_formed: New connection between entities
- relationship_strengthened/weakened: Relationship intensity changes
- relationship_transformed: Nature of relationship changes
- relationship_broken: Connection severed
- property_changed: Specific property of entity changes
- knowledge_gained: Character learns something important
- environment_changed: Setting undergoes transformation

Text to analyze:
${text}

Provide 20-30 key mutations that capture the story's progression.`;

    try {
      const result = await this.llmAdapter.generateStructuredOutput(
        prompt,
        NarrativeMutationsSchema
      );

      // Map string types to enum values
      return result.mutations.map((m, index) => ({
        id: `mutation_${index}`,
        timestamp: m.timestamp,
        type: this.mapToMutationType(m.type),
        entityId: m.entityId,
        targetEntityId: m.targetEntityId,
        relationshipId: m.relationshipId,
        properties: m.properties,
        oldValue: m.oldValue,
        newValue: m.newValue,
        sceneId: m.sceneId,
        eventId: m.eventId,
        description: m.description,
        impact: m.impact,
        reversible: m.reversible !== false
      }));
    } catch (error) {
      console.error('Error extracting mutations:', error);
      return this.fallbackMutationExtraction(text, scenes, entities);
    }
  }

  private mapToMutationType(type: string): GraphMutationType {
    const typeMap: Record<string, GraphMutationType> = {
      'entity_introduced': GraphMutationType.ENTITY_INTRODUCED,
      'entity_updated': GraphMutationType.ENTITY_UPDATED,
      'entity_removed': GraphMutationType.ENTITY_REMOVED,
      'entity_moved': GraphMutationType.ENTITY_MOVED,
      'relationship_formed': GraphMutationType.RELATIONSHIP_FORMED,
      'relationship_strengthened': GraphMutationType.RELATIONSHIP_STRENGTHENED,
      'relationship_weakened': GraphMutationType.RELATIONSHIP_WEAKENED,
      'relationship_transformed': GraphMutationType.RELATIONSHIP_TRANSFORMED,
      'relationship_broken': GraphMutationType.RELATIONSHIP_BROKEN,
      'property_changed': GraphMutationType.PROPERTY_CHANGED,
      'property_set': GraphMutationType.PROPERTY_SET,
      'knowledge_gained': GraphMutationType.KNOWLEDGE_GAINED,
      'environment_changed': GraphMutationType.ENVIRONMENT_CHANGED
    };

    return typeMap[type] || GraphMutationType.ENTITY_UPDATED;
  }

  private fallbackMutationExtraction(
    text: string,
    scenes: any[],
    entities: any[]
  ): GraphMutation[] {
    const mutations: GraphMutation[] = [];
    let timestamp = 1;

    // Create introduction mutations for all entities
    entities.forEach(entity => {
      mutations.push({
        id: `mutation_${mutations.length}`,
        timestamp: timestamp++,
        type: GraphMutationType.ENTITY_INTRODUCED,
        entityId: entity.id,
        properties: {
          name: entity.name,
          type: entity.type || 'character',
          description: entity.description,
          location: 'unknown',
          state: 'normal'
        },
        sceneId: scenes[0]?.id || 'scene_1',
        description: `${entity.name} is introduced to the narrative`,
        impact: 'minor',
        reversible: false
      });
    });

    // Create basic relationship mutations
    if (entities.length > 1) {
      for (let i = 0; i < entities.length - 1; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          if (Math.random() > 0.7) { // 30% chance of relationship
            mutations.push({
              id: `mutation_${mutations.length}`,
              timestamp: timestamp++,
              type: GraphMutationType.RELATIONSHIP_FORMED,
              entityId: entities[i].id,
              targetEntityId: entities[j].id,
              relationshipId: `rel_${entities[i].id}_${entities[j].id}`,
              properties: {
                type: 'knows',
                strength: 0.5
              },
              sceneId: scenes[Math.floor(Math.random() * scenes.length)]?.id || 'scene_1',
              description: `${entities[i].name} and ${entities[j].name} form a connection`,
              impact: 'minor',
              reversible: true
            });
          }
        }
      }
    }

    return mutations;
  }
}

/**
 * Extract Lovecraft-specific mutations
 */
export function extractLovecraftMutations(
  text: string,
  scenes: any[],
  entities: any[]
): GraphMutation[] {
  const mutations: GraphMutation[] = [];
  let timestamp = 1;

  // Key mutations for "The Colour Out of Space"
  
  // 1. Meteorite arrives
  mutations.push({
    id: 'mutation_meteorite_arrival',
    timestamp: timestamp++,
    type: GraphMutationType.ENTITY_INTRODUCED,
    entityId: 'entity_meteorite',
    properties: {
      name: 'The Meteorite',
      type: 'object',
      location: 'Gardner farm',
      properties: ['hot', 'shrinking', 'soft', 'magnetic', 'luminous'],
      origin: 'space'
    },
    sceneId: 'scene_3',
    description: 'A strange meteorite falls from space onto the Gardner farm',
    impact: 'major',
    reversible: false
  });

  // 2. The colour emerges
  mutations.push({
    id: 'mutation_colour_emergence',
    timestamp: timestamp++,
    type: GraphMutationType.ENTITY_INTRODUCED,
    entityId: 'entity_colour',
    properties: {
      name: 'The Colour',
      type: 'alien_entity',
      location: 'inside_meteorite',
      nature: 'incomprehensible',
      properties: ['indescribable', 'luminous', 'draining']
    },
    sceneId: 'scene_3',
    description: 'An alien colour entity is discovered within the meteorite',
    impact: 'transformative',
    reversible: false
  });

  // 3. Colour infects the land
  mutations.push({
    id: 'mutation_land_infection',
    timestamp: timestamp++,
    type: GraphMutationType.RELATIONSHIP_FORMED,
    entityId: 'entity_colour',
    targetEntityId: 'location_gardner_farm',
    relationshipId: 'rel_colour_infects_land',
    properties: {
      type: 'infects',
      method: 'seeping into soil and water',
      strength: 0.3
    },
    sceneId: 'scene_4',
    description: 'The colour begins seeping into the soil and water supply',
    impact: 'major',
    reversible: false
  });

  // 4. Plants become corrupted
  mutations.push({
    id: 'mutation_plant_corruption',
    timestamp: timestamp++,
    type: GraphMutationType.ENVIRONMENT_CHANGED,
    entityId: 'location_gardner_farm',
    properties: {
      vegetation_state: 'corrupted',
      plant_appearance: 'wrong colors, oversized, bitter',
      spreading: true
    },
    oldValue: { vegetation_state: 'normal' },
    newValue: { vegetation_state: 'alien_corrupted' },
    sceneId: 'scene_4',
    description: 'Farm vegetation grows wrong - strange colors, bitter fruit',
    impact: 'moderate',
    reversible: false
  });

  // 5. Mrs. Gardner goes mad
  mutations.push({
    id: 'mutation_mrs_gardner_madness',
    timestamp: timestamp++,
    type: GraphMutationType.PROPERTY_CHANGED,
    entityId: 'char_mrsgardner',
    properties: {
      mental_state: 'insane',
      physical_state: 'deteriorating',
      location: 'locked in attic'
    },
    oldValue: { mental_state: 'normal' },
    newValue: { mental_state: 'complete madness' },
    sceneId: 'scene_4',
    description: 'Mrs. Gardner descends into screaming madness',
    impact: 'major',
    reversible: false
  });

  // 6. Family relationships break down
  mutations.push({
    id: 'mutation_family_breakdown',
    timestamp: timestamp++,
    type: GraphMutationType.RELATIONSHIP_WEAKENED,
    entityId: 'char_nahumgardner',
    targetEntityId: 'char_mrsgardner',
    relationshipId: 'rel_nahum_wife',
    properties: {
      type: 'married',
      strength: 0.1,
      state: 'broken by madness'
    },
    sceneId: 'scene_4',
    description: 'The Gardner family bonds break under the strain',
    impact: 'major',
    reversible: false
  });

  // 7. Thaddeus transformation and death
  mutations.push({
    id: 'mutation_thaddeus_death',
    timestamp: timestamp++,
    type: GraphMutationType.ENTITY_REMOVED,
    entityId: 'char_thaddeusgardner',
    properties: {
      manner_of_death: 'transformed by colour',
      final_state: 'grey, brittle, crumbling'
    },
    sceneId: 'scene_5',
    description: 'Thaddeus dies horribly, transformed into grey brittle matter',
    impact: 'major',
    reversible: false
  });

  // 8. Well becomes focal point
  mutations.push({
    id: 'mutation_well_transformation',
    timestamp: timestamp++,
    type: GraphMutationType.ENTITY_UPDATED,
    entityId: 'location_well',
    properties: {
      state: 'corrupted',
      contents: ['the colour', 'remains of victims'],
      danger_level: 'extreme'
    },
    sceneId: 'scene_5',
    description: 'The well becomes the dwelling place of the colour',
    impact: 'transformative',
    reversible: false
  });

  // More mutations would follow...
  
  return mutations;
}