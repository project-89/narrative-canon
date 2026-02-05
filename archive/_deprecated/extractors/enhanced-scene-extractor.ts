import { z } from 'zod';
import { LLMAdapter, Entity, Scene } from '../types';

// Enhanced scene schema with more detail
export const EnhancedSceneSchema = z.object({
  scenes: z.array(z.object({
    id: z.string(),
    title: z.string(),
    sequence: z.number(),
    location: z.string().optional().nullable(),
    timeframe: z.string().optional(),
    characters: z.array(z.string()),
    summary: z.string(),
    detailedDescription: z.string(),
    keyEvents: z.array(z.object({
      description: z.string(),
      participants: z.array(z.string()),
      significance: z.enum(['minor', 'moderate', 'major', 'critical'])
    })),
    moodTone: z.string().optional(),
    narrativePurpose: z.string().optional()
  }))
});

export class EnhancedSceneExtractor {
  constructor(private llmAdapter: LLMAdapter) {}

  async extractScenes(text: string, entities: Entity[]): Promise<Scene[]> {
    const entityList = entities.map(e => `${e.id}: ${e.name}`).join('\n');
    
    const prompt = `
Analyze this narrative and break it down into detailed scenes.

For each scene, provide:
1. A descriptive title (not just "Scene N")
2. The location where it takes place
3. The timeframe (when in the story timeline)
4. Which characters are present (use entity IDs)
5. A brief summary (one sentence)
6. A detailed description (2-3 sentences capturing the essence)
7. Key events that occur with their significance
8. The mood/tone of the scene
9. The narrative purpose (what it accomplishes in the story)

For Lovecraft's "The Colour Out of Space", pay attention to:
- The progression from normalcy to cosmic horror
- Changes in setting atmosphere (from pastoral to alien)
- Character interactions and deterioration
- Key revelations and discoveries
- The building sense of dread

Known entities:
${entityList}

Text:
${text}

Break this into 8-12 major scenes that capture the narrative arc.
Focus on scenes that represent significant narrative beats or state changes.
`;

    try {
      const result = await this.llmAdapter.generateStructuredOutput(
        prompt,
        EnhancedSceneSchema
      );
      
      // Convert to Scene format with events
      return result.scenes.map(scene => ({
        id: scene.id,
        title: scene.title,
        sequence: scene.sequence,
        location: scene.location || undefined,
        characters: scene.characters,
        description: scene.detailedDescription,
        events: scene.keyEvents.map((event, idx) => ({
          id: `${scene.id}_event_${idx + 1}`,
          description: event.description,
          participants: event.participants,
          sequence: idx + 1,
          sceneId: scene.id
        }))
      }));
    } catch (error) {
      console.error('Error extracting enhanced scenes:', error);
      return this.basicSceneExtraction(text, entities);
    }
  }

  private basicSceneExtraction(text: string, entities: Entity[]): Scene[] {
    // Fallback to paragraph-based extraction
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 50);
    const scenes: Scene[] = [];
    
    paragraphs.forEach((para, index) => {
      if (index % 3 === 0) { // Group every 3 paragraphs as a scene
        scenes.push({
          id: `scene_${scenes.length + 1}`,
          title: `Scene ${scenes.length + 1}`,
          sequence: scenes.length + 1,
          location: this.extractLocation(para),
          characters: this.extractCharacterReferences(para, entities),
          description: para.substring(0, 200) + '...',
          events: []
        });
      }
    });
    
    return scenes;
  }

  private extractLocation(text: string): string | undefined {
    // Simple location extraction
    const locationPatterns = [
      /at the (.+?)[,\.]/i,
      /in the (.+?)[,\.]/i,
      /near the (.+?)[,\.]/i,
      /beside the (.+?)[,\.]/i
    ];
    
    for (const pattern of locationPatterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    
    return undefined;
  }

  private extractCharacterReferences(text: string, entities: Entity[]): string[] {
    const refs: string[] = [];
    entities.forEach(entity => {
      if (text.includes(entity.name)) {
        refs.push(entity.id);
      }
    });
    return refs;
  }
}