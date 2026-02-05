import { z } from 'zod';
import { LLMAdapter } from '../types';
import { SceneBoundaryType } from '../scene-boundary-detector';

export const SceneBoundarySchema = z.object({
  position: z.number().optional(),
  type: z.enum([
    'location_change', 'character_arrival', 'character_departure',
    'major_revelation', 'conflict_start', 'conflict_resolution',
    'decision_point', 'time_jump', 'emotional_shift', 'power_dynamic_change',
    'narrative_shift', 'perspective_change', 'tension_change', 'mood_shift',
    'plot_advancement', 'character_development', 'world_building', 'exposition'
  ]).optional(),
  description: z.string(),
  significance: z.number().min(0).max(1).optional(),
  
  // Multiple possible field names for text snippet
  textSnippet: z.string().optional(),
  text_snippet: z.string().optional(),
  snippet: z.string().optional(),
  excerpt: z.string().optional(),
  context: z.string().optional()
}).transform((data) => {
  return {
    position: data.position || 0,
    type: data.type || 'narrative_shift',
    description: data.description,
    significance: data.significance || 0.8,
    textSnippet: data.textSnippet || data.text_snippet || data.snippet || data.excerpt || data.context || ''
  };
});

// Input schema for raw LLM response
const SceneBoundaryInputSchema = z.object({
  position: z.number().optional(),
  type: z.enum([
    'location_change', 'character_arrival', 'character_departure',
    'major_revelation', 'conflict_start', 'conflict_resolution',
    'decision_point', 'time_jump', 'emotional_shift', 'power_dynamic_change',
    'narrative_shift', 'perspective_change', 'tension_change', 'mood_shift',
    'plot_advancement', 'character_development', 'world_building', 'exposition'
  ]).optional(),
  description: z.string(),
  significance: z.number().min(0).max(1).optional(),
  
  // Multiple possible field names for text snippet
  textSnippet: z.string().optional(),
  text_snippet: z.string().optional(),
  snippet: z.string().optional(),
  excerpt: z.string().optional(),
  context: z.string().optional()
});

export const SceneBoundariesResponse = z.object({
  boundaries: z.array(SceneBoundaryInputSchema)
});

// Output type for transformed boundaries
export type SceneBoundaryOutput = {
  position: number;
  type: string;
  description: string;
  significance: number;
  textSnippet: string;
};

export class SceneBoundaryLLMExtractor {
  constructor(private llmAdapter: LLMAdapter) {}

  async detectBoundaries(text: string): Promise<SceneBoundaryOutput[]> {
    const prompt = `
You are an expert narrative analyst. Analyze the following text and identify ATOMIC SCENE BOUNDARIES - points where the story shifts into a new narrative unit.

ATOMIC SCENE DEFINITION:
A scene is an atomic narrative unit representing a major turning point. Each scene should:
- Represent a significant shift in the narrative graph
- Be substantial enough to contain meaningful character/relationship development
- Have clear dramatic focus and purpose
- End at natural breaking points in the story flow

BOUNDARY TYPES TO DETECT:

1. LOCATION_CHANGE (0.7 significance)
   - Characters move between meaningful spaces
   - "went to the tavern", "arrived at the castle", "left the forest"
   - Only major location shifts, not minor movements

2. CHARACTER_ARRIVAL (0.8 significance) 
   - Important characters enter the scene
   - "Gandalf appeared", "the dwarves arrived", "she came running"
   - Focus on arrivals that change story dynamics

3. CHARACTER_DEPARTURE (0.8 significance)
   - Key characters leave the narrative space
   - "he departed", "they vanished", "she walked away"
   - Departures that shift story focus or relationships

4. MAJOR_REVELATION (0.9 significance)
   - Critical information revealed that changes everything
   - "discovered the truth", "realized the secret", "learned that"
   - Information that fundamentally alters character understanding

5. DECISION_POINT (0.7 significance)
   - Characters make important choices
   - "decided to join", "chose to fight", "resolved to leave"
   - Decisions that drive plot forward significantly

6. CONFLICT_START (0.9 significance)
   - Major conflicts or confrontations begin
   - "the battle began", "they started fighting", "war erupted"
   - Significant dramatic escalations

7. TIME_JUMP (0.6 significance)
   - Narrative jumps forward in time
   - "the next day", "years later", "meanwhile"
   - Only substantial time shifts, not minor transitions

8. EMOTIONAL_SHIFT (0.6 significance)
   - Major emotional/psychological changes
   - "grief overcame him", "hope returned", "fear gripped them"
   - Significant emotional turning points

9. POWER_DYNAMIC_CHANGE (0.8 significance)
   - Shifts in authority, control, or influence
   - "became the leader", "lost all power", "seized control"
   - Changes in character relationships and influence

ANALYSIS INSTRUCTIONS:
1. Read the entire text carefully
2. Identify boundary points using the criteria above
3. For each boundary, note the character position in the text
4. Provide a brief description of what makes this a boundary
5. Rate significance (0.6-0.9) based on narrative impact
6. Include a 20-30 word snippet showing the boundary moment

IMPORTANT CONSTRAINTS:
- Mark ALL significant turning points - stories can have many boundaries naturally
- Boundaries should create scenes of 100-800 characters each (flexible based on content)
- Focus on meaningful narrative shifts, but don't artificially limit the count
- Each boundary should represent a clear shift in narrative state
- Let the story's organic structure determine the number of scenes

TEXT TO ANALYZE:
"""
${text}
"""

Return boundaries in order of appearance in the text. Focus on atomic narrative units that represent true turning points.`;

    const response = await this.llmAdapter.generateStructuredOutput(
      prompt,
      SceneBoundariesResponse
    );

    // Transform the raw boundaries to the expected output format
    return response.boundaries.map(boundary => ({
      position: boundary.position || 0,
      type: boundary.type || 'narrative_shift',
      description: boundary.description,
      significance: boundary.significance || 0.8,
      textSnippet: boundary.textSnippet || boundary.text_snippet || boundary.snippet || boundary.excerpt || boundary.context || ''
    }));
  }
}

// Enhanced scene content extractor that works on atomic segments
export const AtomicSceneSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  narrativeFunction: z.enum([
    'setup', 'inciting_incident', 'rising_action', 'climax', 
    'falling_action', 'resolution', 'character_development',
    'world_building', 'relationship_change', 'revelation'
  ]),
  dramaticTension: z.number().min(0).max(1),
  location: z.string().optional(),
  timeframe: z.string().optional(),
  mainCharacters: z.array(z.string()),
  keyEvents: z.array(z.object({
    description: z.string(),
    participants: z.array(z.string()),
    significance: z.number().min(0).max(1)
  })),
  relationshipChanges: z.array(z.object({
    characters: z.array(z.string()),
    changeType: z.enum(['formation', 'strengthening', 'weakening', 'transformation', 'dissolution']),
    description: z.string()
  })),
  narrativeConsequences: z.array(z.string())
});

export const AtomicSceneResponse = z.object({
  scene: AtomicSceneSchema
});

export class AtomicSceneContentExtractor {
  constructor(private llmAdapter: LLMAdapter) {}

  async extractSceneContent(
    text: string, 
    sceneNumber: number,
    existingEntities: any[] = [],
    existingRelationships: any[] = []
  ): Promise<z.infer<typeof AtomicSceneSchema>> {
    
    const prompt = `
You are analyzing an ATOMIC NARRATIVE SCENE - a self-contained story unit representing a major turning point.

SCENE ANALYSIS FRAMEWORK:
This scene is part of a larger narrative being processed as atomic commits in a narrative version control system. Each scene should be substantial enough to represent meaningful story development.

ANALYSIS REQUIREMENTS:

1. NARRATIVE FUNCTION - What role does this scene play?
   - setup: Establishing characters, world, situation
   - inciting_incident: Event that starts the main conflict
   - rising_action: Building tension, developing conflict
   - climax: Peak dramatic moment
   - falling_action: Aftermath and consequences
   - resolution: Conflict conclusion
   - character_development: Focus on character growth
   - world_building: Expanding the story world
   - relationship_change: Shifts in character dynamics
   - revelation: Important information revealed

2. DRAMATIC ELEMENTS:
   - Assign dramatic tension (0.0 = calm, 1.0 = peak intensity)
   - Identify key location and timeframe
   - List main characters actively participating
   - Extract significant events in order of occurrence

3. RELATIONSHIP ANALYSIS:
   - Track how character relationships change
   - formation: New relationships created
   - strengthening: Existing bonds grow stronger
   - weakening: Relationships become strained
   - transformation: Relationships change nature (friend to enemy, etc.)
   - dissolution: Relationships end permanently

4. NARRATIVE CONSEQUENCES:
   - What changes because of this scene?
   - What new possibilities or constraints emerge?
   - How does this affect the overall story trajectory?

EXISTING CONTEXT:
Known Characters: ${existingEntities.map(e => e.name).join(', ') || 'None yet'}
Known Relationships: ${existingRelationships.map(r => `${r.source}-${r.type}->${r.target}`).join(', ') || 'None yet'}

SCENE TEXT (Scene #${sceneNumber}):
"""
${text}
"""

Provide a comprehensive analysis that captures how this atomic scene unit contributes to the larger narrative structure.`;

    const response = await this.llmAdapter.generateStructuredOutput(
      prompt,
      AtomicSceneResponse
    );

    return response.scene;
  }
}