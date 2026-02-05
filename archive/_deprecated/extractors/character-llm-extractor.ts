import { z } from 'zod';
import { LLMAdapter } from '../types';
import { EntityType } from '../narrative-taxonomy';

// Ultra-flexible schema that handles any LLM output format
export const CharacterEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['character', 'location', 'object', 'organization', 'concept', 'event']),
  
  // All fields optional with flexible types
  description: z.string().optional(),
  aliases: z.union([z.string(), z.array(z.string())]).optional(),
  
  // Handle various attribute formats
  role: z.enum(['protagonist', 'antagonist', 'supporting', 'minor', 'background']).optional(),
  species: z.string().optional(),
  profession: z.string().optional(),
  title: z.string().optional(),
  personality: z.union([z.string(), z.array(z.string())]).optional(),
  motivations: z.union([z.string(), z.array(z.string())]).optional(),
  abilities: z.union([z.string(), z.array(z.string())]).optional(),
  
  significance: z.number().min(0).max(1).optional(),
  
  // Various naming conventions for position
  first_mention: z.number().optional(),
  firstMentioned: z.number().optional(),
  
  // Ultra-flexible context handling - can be object, string, or missing
  context: z.union([
    z.object({
      introduction: z.string().optional(),
      status: z.string().optional(),
      emotional_state: z.union([z.string(), z.array(z.string())]).optional(),
      goals: z.union([z.string(), z.array(z.string())]).optional()
    }),
    z.string() // Sometimes LLM returns context as string
  ]).optional(),
  
  // Also allow flat fields
  introduction: z.string().optional(),
  status: z.string().optional(),
  emotional_state: z.union([z.string(), z.array(z.string())]).optional(),
  goals: z.union([z.string(), z.array(z.string())]).optional()
}).transform((data) => {
  // Smart normalization that handles any format
  const safeArray = (val: any): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return [val];
  };
  
  // Extract context data intelligently
  const contextData = typeof data.context === 'object' ? data.context : {};
  
  return {
    id: data.id,
    name: data.name,
    type: data.type,
    description: data.description,
    aliases: safeArray(data.aliases),
    role: data.role,
    species: data.species,
    profession: data.profession,
    title: data.title,
    personality: safeArray(data.personality),
    motivations: safeArray(data.motivations),
    abilities: safeArray(data.abilities),
    significance: data.significance || 0.5,
    firstMentioned: data.firstMentioned || data.first_mention || 0,
    introduction: data.introduction || contextData.introduction,
    status: data.status || contextData.status,
    emotional_state: safeArray(data.emotional_state || contextData.emotional_state),
    goals: safeArray(data.goals || contextData.goals)
  };
});

// Input schema for raw LLM response (without transform)
const CharacterEntityInputSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['character', 'location', 'object', 'organization', 'concept', 'event']),
  
  // All fields optional with flexible types
  description: z.string().optional(),
  aliases: z.union([z.string(), z.array(z.string())]).optional(),
  
  // Handle various attribute formats
  role: z.enum(['protagonist', 'antagonist', 'supporting', 'minor', 'background']).optional(),
  species: z.string().optional(),
  profession: z.string().optional(),
  title: z.string().optional(),
  personality: z.union([z.string(), z.array(z.string())]).optional(),
  motivations: z.union([z.string(), z.array(z.string())]).optional(),
  abilities: z.union([z.string(), z.array(z.string())]).optional(),
  
  significance: z.number().min(0).max(1).optional(),
  
  // Various naming conventions for position
  first_mention: z.number().optional(),
  firstMentioned: z.number().optional(),
  
  // Ultra-flexible context handling - can be object, string, or missing
  context: z.union([
    z.object({
      introduction: z.string().optional(),
      status: z.string().optional(),
      emotional_state: z.union([z.string(), z.array(z.string())]).optional(),
      goals: z.union([z.string(), z.array(z.string())]).optional()
    }),
    z.string() // Sometimes LLM returns context as string
  ]).optional(),
  
  // Also allow flat fields
  introduction: z.string().optional(),
  status: z.string().optional(),
  emotional_state: z.union([z.string(), z.array(z.string())]).optional(),
  goals: z.union([z.string(), z.array(z.string())]).optional()
});

export const CharacterExtractionResponse = z.object({
  entities: z.array(CharacterEntityInputSchema)
});

export class CharacterLLMExtractor {
  constructor(private llmAdapter: LLMAdapter) {}

  async extractCharacters(
    text: string, 
    existingEntities: any[] = [],
    sceneContext?: {sceneNumber: number, narrativeFunction: string}
  ): Promise<z.infer<typeof CharacterEntitySchema>[]> {
    
    const existingNames = existingEntities.map(e => e.name).join(', ');
    
    const prompt = `
You are extracting CHARACTER ENTITIES from a narrative scene for a story graph system that tracks relationships and story evolution.

EXTRACTION GUIDELINES:

1. ENTITY TYPES TO EXTRACT:
   - character: People, animals, sentient beings
   - location: Places, buildings, geographical features
   - object: Important items, weapons, artifacts, tools
   - organization: Groups, institutions, companies, factions
   - concept: Ideas, philosophies, magical systems, technologies
   - event: Significant happenings referenced in the text

2. CHARACTER ANALYSIS DEPTH:
   For characters, provide comprehensive analysis:
   
   ROLE CLASSIFICATION:
   - protagonist: Main character driving the story
   - antagonist: Primary opposition/conflict source
   - supporting: Important to plot but not central
   - minor: Named but limited story impact
   - background: Mentioned but minimal development

   ATTRIBUTES TO EXTRACT:
   - Species (human, elf, dragon, etc.)
   - Profession/role/title
   - Personality traits (brave, cunning, wise, etc.)
   - Motivations (what they want/need)
   - Abilities (skills, powers, expertise)
   - Significance (0.1 = background mention, 1.0 = central character)

   CONTEXTUAL INFORMATION:
   - How they're introduced in this text
   - Current status/situation
   - Emotional state if described
   - Apparent goals or objectives

3. IDENTIFICATION RULES:
   - Use clear, consistent names (prefer full names over nicknames)
   - Generate meaningful IDs (char_bilbo_baggins, loc_rivendell, obj_ring)
   - Include common aliases/nicknames
   - Note position of first mention (character count from start)

4. SIGNIFICANCE SCORING:
   - 0.9-1.0: Protagonist level (story revolves around them)
   - 0.7-0.8: Main supporting characters (major plot impact)
   - 0.5-0.6: Secondary characters (named, some development)
   - 0.3-0.4: Minor characters (named, limited role)
   - 0.1-0.2: Background mentions (briefly referenced)

EXISTING ENTITIES TO AVOID DUPLICATING:
${existingNames || 'None yet'}

${sceneContext ? `
SCENE CONTEXT:
This is scene #${sceneContext.sceneNumber} with narrative function: ${sceneContext.narrativeFunction}
Focus on entities that are actively participating in this scene's events.
` : ''}

TEXT TO ANALYZE:
"""
${text}
"""

Extract ALL significant entities mentioned in this text. For characters, provide detailed analysis to support relationship extraction and story tracking.`;

    const response = await this.llmAdapter.generateStructuredOutput(
      prompt,
      CharacterExtractionResponse
    );

    // Transform each entity using the transform logic
    return response.entities.map(entity => {
      // Smart normalization that handles any format
      const safeArray = (val: any): string[] => {
        if (!val) return [];
        if (Array.isArray(val)) return val;
        return [val];
      };
      
      // Extract context data intelligently
      const contextData = typeof entity.context === 'object' && entity.context !== null ? entity.context : {};
      
      return {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        description: entity.description,
        aliases: safeArray(entity.aliases),
        role: entity.role,
        species: entity.species,
        profession: entity.profession,
        title: entity.title,
        personality: safeArray(entity.personality),
        motivations: safeArray(entity.motivations),
        abilities: safeArray(entity.abilities),
        significance: entity.significance || 0.5,
        firstMentioned: entity.firstMentioned || entity.first_mention || 0,
        introduction: entity.introduction || contextData.introduction,
        status: entity.status || contextData.status,
        emotional_state: safeArray(entity.emotional_state || contextData.emotional_state),
        goals: safeArray(entity.goals || contextData.goals)
      };
    });
  }
}