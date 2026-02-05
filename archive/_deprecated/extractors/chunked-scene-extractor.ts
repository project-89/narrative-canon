import { z } from 'zod';
import { LLMAdapter } from '../types';

// Enhanced scene schema for graph-based extraction
export const GraphSceneSchema = z.object({
  scenes: z.array(z.object({
    id: z.string(),
    sequence: z.number(),
    title: z.string(),
    location: z.string().optional().nullable(),
    timeMarker: z.string().optional().nullable(),
    duration: z.string().optional().nullable(),
    description: z.string(),
    atmosphere: z.string(),
    presentEntities: z.array(z.string()),
    keyEvents: z.array(z.object({
      id: z.string(),
      description: z.string(),
      participants: z.array(z.string()),
      graphImpact: z.string().optional()
    })),
    entitiesIntroduced: z.array(z.string()),
    entitiesRemoved: z.array(z.string()),
    relationshipsFormed: z.array(z.object({
      sourceId: z.string(),
      targetId: z.string(),
      type: z.string()
    })),
    relationshipsBroken: z.array(z.object({
      source: z.string(),
      target: z.string()
    }))
  }))
});

export type GraphScene = z.infer<typeof GraphSceneSchema>['scenes'][0];

export class ChunkedSceneExtractor {
  constructor(private llmAdapter: LLMAdapter) {}

  async extractScenes(text: string, entities: any[], targetSceneCount: number = 15): Promise<GraphScene[]> {
    // Split text into manageable chunks - smaller chunks for more granular scene extraction
    const chunkSize = 10000; // Smaller chunks for better scene granularity
    const chunks = this.splitIntoChunks(text, chunkSize);
    
    console.log(`Processing ${chunks.length} chunks to extract ~${targetSceneCount} scenes`);
    
    // Extract scenes from chunks in parallel with controlled concurrency
    const maxConcurrency = 3; // Limit concurrent LLM calls to avoid rate limits
    const chunkPromises = chunks.map((chunk, i) => {
      const isFirstChunk = i === 0;
      const isLastChunk = i === chunks.length - 1;
      const scenesPerChunk = Math.max(3, Math.ceil(targetSceneCount / chunks.length));
      
      return {
        promise: this.extractScenesFromChunk(
          chunk.text,
          entities,
          scenesPerChunk,
          i * scenesPerChunk, // Use index-based offset for parallel processing
          isFirstChunk,
          isLastChunk,
          chunk.context
        ).catch(error => {
          console.warn(`  ⚠️  Failed to extract scenes from chunk ${i + 1}:`, error instanceof Error ? error.message : error);
          return []; // Return empty array on failure
        }),
        index: i,
        chunk
      };
    });

    // Process chunks in batches to control concurrency
    const allScenes: GraphScene[] = [];
    for (let i = 0; i < chunkPromises.length; i += maxConcurrency) {
      const batch = chunkPromises.slice(i, i + maxConcurrency);
      console.log(`Processing batch ${Math.floor(i / maxConcurrency) + 1}/${Math.ceil(chunkPromises.length / maxConcurrency)} (chunks ${i + 1}-${Math.min(i + maxConcurrency, chunkPromises.length)})`);
      
      const batchResults = await Promise.all(batch.map(item => item.promise));
      
      batchResults.forEach((chunkScenes, batchIndex) => {
        const chunkIndex = i + batchIndex;
        if (chunkScenes.length > 0) {
          allScenes.push(...chunkScenes);
          console.log(`  ✅ Extracted ${chunkScenes.length} scenes from chunk ${chunkIndex + 1}`);
        }
      });
      
      // Stop if we've reached our target
      if (allScenes.length >= targetSceneCount) {
        break;
      }
    }
    
    // Ensure we have unique IDs and proper sequencing
    return this.normalizeScenes(allScenes);
  }

  private splitIntoChunks(text: string, chunkSize: number): Array<{text: string, context: string}> {
    const chunks: Array<{text: string, context: string}> = [];
    const overlap = 500; // Keep some overlap for context
    
    let currentPos = 0;
    while (currentPos < text.length) {
      // Find a good break point (paragraph or sentence end)
      let endPos = Math.min(currentPos + chunkSize, text.length);
      
      if (endPos < text.length) {
        // Look for paragraph break
        const paragraphBreak = text.lastIndexOf('\n\n', endPos);
        if (paragraphBreak > currentPos + chunkSize * 0.7) {
          endPos = paragraphBreak;
        } else {
          // Look for sentence end
          const sentenceEnd = text.lastIndexOf('. ', endPos);
          if (sentenceEnd > currentPos + chunkSize * 0.7) {
            endPos = sentenceEnd + 1;
          }
        }
      }
      
      // Get context from previous chunk
      const contextStart = Math.max(0, currentPos - overlap);
      const context = currentPos > 0 ? text.substring(contextStart, currentPos) : '';
      
      chunks.push({
        text: text.substring(currentPos, endPos),
        context: context
      });
      
      currentPos = endPos;
    }
    
    return chunks;
  }

  private async extractScenesFromChunk(
    chunkText: string,
    entities: any[],
    targetSceneCount: number,
    sequenceOffset: number,
    isFirstChunk: boolean,
    isLastChunk: boolean,
    previousContext: string
  ): Promise<GraphScene[]> {
    const entityList = entities.map(e => `${e.id}: ${e.name} (${e.type})`).join('\n');
    
    const prompt = `
Extract EXACTLY ${targetSceneCount} distinct scenes from this portion of the narrative. Look for natural scene breaks.

${previousContext ? `Previous context (for continuity): ${previousContext.substring(previousContext.length - 500)}` : ''}

Scene boundaries occur when ANY of these happen:
- Location changes (e.g., "Meanwhile at...", "Back at...", moving to a new place)
- Time shifts (e.g., "The next day...", "Three hours later...", "That evening...")
- Focus shifts to different characters
- Major action or event concludes
- Narrative perspective changes
- A chapter or section break

For Lovecraft stories, common scene breaks:
- Narrator arrives/departs
- Discovery of something strange
- Scientific investigation begins/ends
- Time passes between observations
- Someone goes mad or dies
- Climactic events begin
- Aftermath/reflection

For each scene provide:
- id: scene_${sequenceOffset + 1}, scene_${sequenceOffset + 2}, etc.
- sequence: ${sequenceOffset + 1}, ${sequenceOffset + 2}, etc.
- title: short descriptive title (5-10 words)
- location: where it takes place (use entity ID from list below)
- timeMarker: when relative to previous scene
- duration: approximate time span
- description: what happens (50-150 words)
- atmosphere: dominant mood (e.g., "ominous", "investigative", "horrific")
- presentEntities: array of entity IDs present
- keyEvents: 2-4 main events with:
  - id: event_X_Y
  - description: what happens
  - participants: array of entity IDs involved
  - graphImpact: how it changes the story
- entitiesIntroduced: array of entity IDs first appearing
- entitiesRemoved: array of entity IDs that exit/die
- relationshipsFormed: new connections between entities
- relationshipsBroken: severed connections

Known entities:
${entityList}

${isFirstChunk ? 'This is the BEGINNING. First scene should establish setting/narrator.' : ''}
${isLastChunk ? 'This is the ENDING. Final scene should show resolution/aftermath.' : ''}

Text to analyze:
${chunkText}

IMPORTANT: 
- Find ${targetSceneCount} scenes even if they're short
- Each scene should have a clear beginning and end
- Use exact entity IDs from the list above
- Track entity/relationship changes carefully`;

    try {
      const result = await this.llmAdapter.generateStructuredOutput(
        prompt,
        GraphSceneSchema,
        { temperature: 0.3 }
      );
      
      return result.scenes;
    } catch (error) {
      console.error('Error extracting scenes from chunk:', error);
      return [];
    }
  }

  private normalizeScenes(scenes: GraphScene[]): GraphScene[] {
    // Remove duplicates and ensure proper sequencing
    const uniqueScenes = new Map<string, GraphScene>();
    
    scenes.forEach((scene, index) => {
      const normalizedScene = {
        ...scene,
        id: `scene_${index + 1}`,
        sequence: index + 1
      };
      uniqueScenes.set(normalizedScene.id, normalizedScene);
    });
    
    return Array.from(uniqueScenes.values()).sort((a, b) => a.sequence - b.sequence);
  }
}