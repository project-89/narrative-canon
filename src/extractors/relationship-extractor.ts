import { z } from "zod";
import {
  LLMAdapter,
  Scene,
  Entity,
  Relationship as CanonicalRelationship,
} from "../types";

const isTestEnv = process.env.NODE_ENV === "test";
const logError = (...args: unknown[]) => {
  if (!isTestEnv) {
    console.error(...args);
  }
};
const logWarn = (...args: unknown[]) => {
  if (!isTestEnv) {
    console.warn(...args);
  }
};

// Re-export Relationship type for modules that import from this file
export type { Relationship } from "../types";

// Local Relationship schema for LLM interaction and internal use within this module
export const LocalRelationshipSchema = z.object({
  source: z.string(),
  target: z.string(),
  type: z.string(),
  description: z.string().optional().nullable(),
  firstMentioned: z.number(), // Scene sequence number where first mentioned or strongly implied
});

export type LocalRelationship = z.infer<typeof LocalRelationshipSchema>;

const RelationshipsResponseSchema = z.object({
  relationships: z.array(LocalRelationshipSchema),
});

export class RelationshipExtractor {
  constructor(private llmAdapter: LLMAdapter) {}

  async extractRelationships(
    text: string,
    entities: Entity[],
    scenes?: Scene[],
    existingRelationships?: CanonicalRelationship[]
  ): Promise<CanonicalRelationship[]> {
    const entityListText = entities
      .map((e) => `- ${e.id}: ${e.name} (${e.type})`)
      .join("\n");
    const sceneListText = scenes && scenes.length > 0
      ? scenes.map(
          (s) =>
            `Scene ${s.sequence} (ID: ${s.id}): ${s.title} - ${s.description ? s.description.substring(0, 70) + "..." : "No description."}`
        ).join("\n")
      : "(No scene breakdown available - extract relationships based on text content)";

    // Build context about existing relationships
    const existingContext = existingRelationships && existingRelationships.length > 0 
      ? `

EXISTING RELATIONSHIPS (DO NOT DUPLICATE THESE):
${existingRelationships.map(r => 
          `- ${r.source} ${r.type} ${r.target}${r.description ? `: ${r.description}` : ''}`
        ).join('\n')}

IMPORTANT: If you find any of these relationships already exist between the same entities, DO NOT create new entries for them. Only extract NEW relationships not in the list above.`
      : '';

    const prompt = `
Analyze this narrative text and extract all significant relationships between the provided entities. Consider the context provided by the scene breakdown.

For each identified relationship, specify:
- "source": The ID of the source entity.
- "target": The ID of the target entity.
- "type": A descriptive type for the relationship (e.g., "friend_of", "enemy_of", "works_for", "family_member_of", "located_at", "uses_object", "interacted_with").
- "description": A brief sentence describing the nature or context of the relationship. (Optional)
- "firstMentioned": The sequence number of the scene where this relationship is first clearly established or strongly implied.

Focus on explicit relationships or those very strongly implied by direct interactions or narrative statements. Avoid overly speculative relationships.

Known Entities (use these IDs for source/target):
${entityListText}

Scene Context (provides temporal and co-occurrence information):
${sceneListText}

Narrative Text to Analyze:
---
${text}
---
${existingContext}

Return your response as a valid JSON object with a single root key "relationships", which is an array of relationship objects structured according to the details above.
Ensure entity IDs in "source" and "target" fields exactly match IDs from the "Known Entities" list.
`;

    try {
      const result = await this.llmAdapter.generateStructuredOutput(
        prompt,
        RelationshipsResponseSchema,
        {
          temperature: 0.25,
          modelPreference: "smart",
        }
      );

      // Defensive check: ensure result has relationships array
      if (!result || !result.relationships || !Array.isArray(result.relationships)) {
        logError("LLM returned invalid relationship response");
        throw new Error("LLM returned invalid response for relationship extraction");
      }

      // Filter out any relationships that match existing ones
      const newRelationships = result.relationships.filter((rel) => {
        if (!existingRelationships) return true;
        
        // Check if this relationship already exists
        return !existingRelationships.some(existing => 
          existing.source === rel.source && 
          existing.target === rel.target && 
          existing.type === rel.type
        );
      });

      // Map LocalRelationship to CanonicalRelationship, ensuring a unique ID for each
      return newRelationships.map((rel, index) => ({
        id: `${rel.source}_${rel.type}_${rel.target}_${index}_${Date.now()}`,
        source: rel.source,
        target: rel.target,
        type: rel.type,
        description: rel.description || undefined,
        firstMentioned: rel.firstMentioned,
      }));
    } catch (error) {
      logError("Error extracting relationships via LLM:", error);
      // Re-throw instead of falling back - we want to know when LLM fails
      throw error;
    }
  }

  private fallbackExtraction(
    entities: Entity[],
    scenes?: Scene[]
  ): CanonicalRelationship[] {
    const relationships: CanonicalRelationship[] = [];

    // If no scenes, return empty - we can't extract relationships without LLM or scenes
    if (!scenes || scenes.length === 0) {
      return relationships;
    }

    scenes.forEach((scene) => {
      const charactersInScene = scene.characters || [];

      // Interactions between characters in the same scene
      for (let i = 0; i < charactersInScene.length; i++) {
        for (let j = i + 1; j < charactersInScene.length; j++) {
          const charId1 = charactersInScene[i];
          const charId2 = charactersInScene[j];

          const interactionId = `${charId1}_interacts_with_${charId2}_scene${scene.sequence}`;
          if (
            !relationships.some(
              (r) =>
                r.id === interactionId ||
                (r.source === charId1 &&
                  r.target === charId2 &&
                  r.type === "interacts_with")
            )
          ) {
            relationships.push({
              id: interactionId,
              source: charId1,
              target: charId2,
              type: "interacts_with",
              description: `Characters ${charId1} and ${charId2} appear together in scene ${scene.sequence} (${scene.title}).`,
              firstMentioned: scene.sequence,
            });
          }
        }
      }

      // Character appearing in a location
      if (scene.location) {
        charactersInScene.forEach((charId: string) => {
          const appearsInId = `${charId}_appears_in_${scene.location}_scene${scene.sequence}`;
          if (!relationships.some((r) => r.id === appearsInId)) {
            relationships.push({
              id: appearsInId,
              source: charId,
              target: scene.location!,
              type: "appears_in_location",
              description: `Character ${charId} is in location ${scene.location!} during scene ${scene.sequence} (${scene.title}).`,
              firstMentioned: scene.sequence,
            });
          }
        });
      }
    });

    return relationships;
  }
}
