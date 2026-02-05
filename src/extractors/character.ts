import { z } from 'zod';
import { LLMAdapter } from '../types';

// Define our character schema
export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  firstMention: z.number().optional(), // character position in text
  type: z.literal('character').default('character'),
});

export type Character = z.infer<typeof CharacterSchema>;

const CharactersResponseSchema = z.object({
  characters: z.array(CharacterSchema),
});

export class CharacterExtractor {
  constructor(private llmAdapter: LLMAdapter) {}

  async extractCharacters(text: string): Promise<Character[]> {
    const prompt = `
Extract all characters from this narrative text. For each character, identify:

1. Their full name as mentioned in the text
2. A brief description based on what's revealed about them
3. Any aliases, nicknames, or pronouns used to refer to them
4. The approximate position where they're first mentioned (early, middle, late in text)

Include:
- Named characters (e.g., "John Smith", "Captain Morgan")
- Characters referred to by title/role (e.g., "The King", "The old merchant")
- Groups acting as single entities (e.g., "The Council", "The rebels")

Do not include:
- Generic unnamed individuals (e.g., "a passerby", "some guards")
- The narrator (unless they're a character in the story)

IMPORTANT: For each character, you MUST provide:
- id: A unique ID in the format: char_[name_simplified] (e.g., "char_alice", "char_king_arthur")
- name: The character's name as it appears in the text
- type: Always set to "character"
- description: Brief description (optional)
- aliases: Array of alternative names (can be empty array [])
- firstMention: Number indicating position (optional)

Text to analyze:
${text}

Return the result as a JSON object with a "characters" array.`;

    try {
     const result = await this.llmAdapter.generateStructuredOutput(
       prompt,
       CharactersResponseSchema,
       { 
         temperature: 0.3,
         modelPreference: 'fast' 
       }
     );
     
     // Ensure all characters have required fields
      const mapped = result.characters.map((char: any) => ({
        id: char.id,
        name: char.name,
        type: 'character' as const,
        description: char.description,
        aliases: char.aliases || [],
        firstMention: char.firstMention
      }));
      return mapped;
    } catch (error) {
      console.error('Error extracting characters:', error);
      // Fallback to pattern-based extraction
      return this.fallbackExtraction(text);
    }
  }

  private fallbackExtraction(text: string): Character[] {
    const characters: Character[] = [];
    const seen = new Set<string>();
    let position = 0;

    const matches = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
    for (const raw of matches) {
      const name = raw.trim();
      if (!name) {
        continue;
      }

      const normalized = name.toLowerCase();
      if (seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      characters.push({
        id: `char_${normalized.replace(/[^a-z0-9]/g, '_')}`,
        name,
        aliases: [],
        firstMention: position++,
        type: 'character' as const
      });
    }

    if (characters.length === 0 && text.trim().length > 0) {
      characters.push({
        id: 'char_placeholder',
        name: 'Unnamed Character',
        description: 'Placeholder character extracted via fallback',
        aliases: [],
        firstMention: 0,
        type: 'character'
      });
    }

    return characters;
  }
}

// Legacy function for backward compatibility
export async function extractCharacters(text: string): Promise<Character[]> {
  // Create a mock LLM adapter for the legacy function
  const mockAdapter: LLMAdapter = {
    generateStructuredOutput: async <T>() => ({ characters: [] } as T),
    generateText: async () => ''
  };
  
  const extractor = new CharacterExtractor(mockAdapter);
  return extractor.extractCharacters(text);
}
