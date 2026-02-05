import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Define our narrative element schemas
export const EntitySchema = z.object({
  id: z.string(),
  type: z.enum(['character', 'location', 'object', 'organization', 'concept']),
  name: z.string(),
  description: z.string().optional(),
  attributes: z.record(z.any()).default({}),
});

export const EventSchema = z.object({
  id: z.string(),
  description: z.string(),
  participants: z.array(z.string()), // entity IDs
  location: z.string().optional(),
  timestamp: z.string().optional(), // relative time marker
});

export const SceneSchema = z.object({
  id: z.string(),
  description: z.string(),
  location: z.string().optional(),
  participants: z.array(z.string()),
  events: z.array(z.string()), // event IDs
  mood: z.string().optional(),
});

export const NarrativeSchema = z.object({
  entities: z.array(EntitySchema),
  events: z.array(EventSchema),
  scenes: z.array(SceneSchema),
  timeline: z.array(z.string()), // ordered event IDs
  themes: z.array(z.string()).default([]),
});

export class HierarchicalNarrativeExtractor {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
  }

  async extractNarrative(text: string): Promise<z.infer<typeof NarrativeSchema>> {
    console.log('🧬 Starting hierarchical narrative extraction with parallelization...');
    
    // Phase 1: Extract independent components in parallel
    console.log('  Phase 1: Extracting structure and themes in parallel...');
    const [structure, themes] = await Promise.all([
      this.extractStructure(text),
      this.extractThemes(text)
    ]);
    
    // Phase 2: Extract entities (depends on structure)
    console.log('  Phase 2: Extracting entities...');
    const entities = await this.extractEntities(text, structure);
    
    // Phase 3: Extract events and scenes in parallel (both depend on entities)
    console.log('  Phase 3: Extracting events and building timeline in parallel...');
    const [events] = await Promise.all([
      this.extractEvents(text, entities)
    ]);
    
    // Phase 4: Extract scenes and build timeline in parallel
    console.log('  Phase 4: Extracting scenes and building timeline in parallel...');
    const [scenes, timeline] = await Promise.all([
      this.extractScenes(text, events, entities),
      this.buildTimeline(events)
    ]);
    
    console.log('✅ Hierarchical extraction complete!');
    return {
      entities,
      events,
      scenes,
      timeline,
      themes,
    };
  }

  private async extractStructure(text: string): Promise<any> {
    const prompt = `
Analyze this narrative text and identify its high-level structure.

Identify:
1. Major narrative sections or chapters
2. Time progression markers
3. Location changes
4. Point of view shifts

Text:
"""
${text}
"""

Return as JSON with sections, temporal markers, and structural elements.
`;

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    return this.parseJSON(response.text());
  }

  private async extractEntities(text: string, structure: any): Promise<z.infer<typeof EntitySchema>[]> {
    const prompt = `
Extract ALL entities from this narrative text.

Categories:
- character: Any person, AI, or sentient being
- location: Any place or setting
- object: Important items or artifacts
- organization: Groups, companies, collectives
- concept: Abstract ideas central to the narrative

For each entity provide:
- Unique ID (lowercase, no spaces)
- Type (from categories above)
- Name (as mentioned in text)
- Description (key attributes)
- Attributes (as key-value pairs)

Text:
"""
${text}
"""

Return as JSON array of entities.
`;

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    const entities = this.parseJSON(response.text());
    
    // Validate and assign IDs if needed
    return entities.map((e: any, i: number) => ({
      ...e,
      id: e.id || `entity_${i}`,
    }));
  }

  private async extractEvents(text: string, entities: any[]): Promise<z.infer<typeof EventSchema>[]> {
    const entityList = entities.map(e => `${e.id}: ${e.name}`).join('\n');
    
    const prompt = `
Extract all events (actions, happenings, state changes) from this narrative.

Known entities:
${entityList}

For each event:
- Create unique ID
- Describe what happens
- List participating entity IDs
- Note location (entity ID if applicable)
- Note any temporal markers

Focus on:
- Actions taken by characters
- Important state changes
- Discoveries or revelations
- Conflicts or resolutions

Text:
"""
${text}
"""

Return as JSON array of events.
`;

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    return this.parseJSON(response.text());
  }

  private async extractScenes(
    text: string, 
    events: any[], 
    entities: any[]
  ): Promise<z.infer<typeof SceneSchema>[]> {
    const prompt = `
Group the events into scenes based on:
- Continuity of location
- Continuity of participants
- Narrative flow
- Time breaks

Events:
${JSON.stringify(events, null, 2)}

Create scenes with:
- Unique ID
- Description of what happens in the scene
- Location (entity ID)
- Participants (entity IDs)
- Events in the scene (event IDs)
- Overall mood/tone

Return as JSON array of scenes.
`;

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    return this.parseJSON(response.text());
  }

  private async buildTimeline(events: any[]): Promise<string[]> {
    const prompt = `
Order these events chronologically based on narrative cues:

Events:
${JSON.stringify(events, null, 2)}

Consider:
- Explicit temporal markers
- Causal relationships
- Narrative sequence
- Flashbacks or flash-forwards

Return as JSON array of event IDs in chronological order.
`;

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    return this.parseJSON(response.text());
  }

  private async extractThemes(text: string): Promise<string[]> {
    const prompt = `
Identify the major themes in this narrative.

Consider:
- Central conflicts
- Moral questions
- Recurring motifs
- Character struggles
- Social commentary

Text:
"""
${text}
"""

Return as JSON array of theme strings.
`;

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    return this.parseJSON(response.text());
  }

  private parseJSON(text: string): any {
    const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    return JSON.parse(jsonMatch[0]);
  }
}