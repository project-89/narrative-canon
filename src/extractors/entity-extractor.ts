import { z } from 'zod';
import { LLMAdapter, Entity } from '../types';

// Re-export Entity type for modules that import from this file
export type { Entity } from '../types';

// Define entity schema with proper types
export const EntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['character', 'organization', 'location', 'object', 'technology', 'event']),
  description: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  firstMention: z.number().optional(),
});

const EntitiesResponseSchema = z.object({
  entities: z.array(EntitySchema),
});

export class EntityExtractor {
  constructor(private llmAdapter: LLMAdapter) {}

  async extractEntities(text: string, existingEntities?: Entity[]): Promise<Entity[]> {
    // Build context about existing entities
    const existingContext = existingEntities && existingEntities.length > 0 
      ? `

EXISTING ENTITIES (DO NOT DUPLICATE THESE):
${existingEntities.map(e => 
          `- ${e.name} (${e.type}): ${e.id}${e.aliases?.length ? ` [aliases: ${e.aliases.join(', ')}]` : ''}`
        ).join('\n')}

IMPORTANT: If you find any of these entities in the text, DO NOT create new entries for them. Only extract NEW entities not in the list above.`
      : '';

    const prompt = `
Extract all significant NAMED entities from this text. The text may be narrative prose, an outline, notes, a concept document, or a mix of formats.

ENTITY TYPES:
- "character": Individual people/beings with names (e.g., "Kira", "Agent Chen", "Alexander Moebius")
- "organization": Named companies, corporations, factions, groups (e.g., "Oneirocom", "The Resistance", "Project 89")
- "location": Named places, buildings, areas (e.g., "Neo-Tokyo", "Sector 7", "Oneirocom Tower")
- "object": Specific named items/artifacts (e.g., "the hard drive", "suspension tank")
- "technology": Named systems, devices, protocols (e.g., "Convergence Engine", "Neurolinguistic Virus", "HIVEMIND app")
- "event": Named happenings/phenomena (e.g., "The Convergence", "The Hard Drive Heist")

CRITICAL RULES - READ CAREFULLY:
1. ONLY extract proper nouns and specific named things - NOT generic descriptions
2. DO NOT extract sentence fragments, descriptions, or plot summaries
3. DO NOT extract things like "the corporation's plans" or "their attempts" - these are descriptions, not entity names
4. Entity names should be SHORT (1-4 words typically) - if it reads like a sentence, it's NOT an entity
5. When text describes an entity, extract the NAME not the description
   - WRONG: "This catastrophic event fragmented his consciousness"
   - RIGHT: "The Convergence" (the actual name of the event)
6. For concept documents/outlines, focus on the defined terms, character names, location names, etc.
7. Merge duplicates: "Oneirocom" and "Oneirocom Corporation" = ONE entity named "Oneirocom Corporation"

EXAMPLES OF VALID ENTITIES:
- "Kira" (character)
- "Agent Zero" (character)
- "Seraph" (character)
- "Alexander Moebius" (character)
- "Oneirocom" (organization)
- "The Resistance" (organization)
- "Project 89" (organization/event)
- "Neo-Tokyo" (location)
- "Oneirocom Tower" (location)
- "The Clone Farm" (location)
- "Neurolinguistic Virus" (technology)
- "The Convergence" (event)
- "Proxim8 Collective" (organization/technology)

EXAMPLES OF INVALID "ENTITIES" - DO NOT EXTRACT THESE:
- "recognizing that collapse would end all realities" (sentence fragment)
- "Their attempts to maintain control" (description)
- "was horrified by the corporation" (sentence fragment)
- "the scene inc" (not a real entity name)

For each valid entity provide:
- id: Unique ID like "char_kira", "org_oneirocom", "loc_neo_tokyo"
- name: The canonical name (short, proper noun)
- type: One of the 6 types above
- description: Brief 1-2 sentence description
- aliases: Array of alternative names/spellings

Text to analyze:
${text}
${existingContext}

Return as JSON with an "entities" array. Only include clearly named entities.`;

    try {
      const result = await this.llmAdapter.generateStructuredOutput(
        prompt,
        EntitiesResponseSchema,
        {
          temperature: 0.1,  // Lower temperature for more consistent classification with powerful model
          modelPreference: 'smart'  // Use most powerful model for complex entity classification
        }
      );

      // Defensive check: ensure result has entities array
      if (!result || !result.entities || !Array.isArray(result.entities)) {
        console.error('❌ LLM returned invalid entity response - cannot extract entities without LLM');
        throw new Error('LLM returned invalid response. Entity extraction requires a working LLM.');
      }

      // Filter out any entities that match existing ones
      const newEntities = result.entities.filter((entity: any) => {
        if (!existingEntities) return true;

        // Check if this entity already exists by ID or name/aliases
        return !existingEntities.some(existing =>
          existing.id === entity.id ||
          existing.name.toLowerCase() === entity.name.toLowerCase() ||
          existing.aliases?.some((alias: string) => alias.toLowerCase() === entity.name.toLowerCase()) ||
          entity.aliases?.some((alias: string) =>
            alias.toLowerCase() === existing.name.toLowerCase() ||
            existing.aliases?.some((ea: string) => ea.toLowerCase() === alias.toLowerCase())
          )
        );
      });

      return newEntities.map((entity: any) => ({
        id: entity.id,
        name: entity.name,
        type: entity.type,
        description: entity.description,
        aliases: entity.aliases || [],
        firstMention: entity.firstMention
      }));
    } catch (error) {
      console.error('❌ Error extracting entities:', error);
      // Re-throw the error instead of falling back to regex
      throw error;
    }
  }

}