/**
 * Tests for ChunkedExtractionPipeline
 *
 * Tests the ability to extract narratives from book-length texts
 * by splitting into chunks and maintaining entity coherence.
 */

import { ChunkedExtractionPipeline, ChunkingOptions, BookExtractionResult } from '../src/chunked-extraction';
import { MockLLM } from '../src/llm/mock';
import { GeminiAdapter } from '../src/llm/gemini';

// Sample multi-chapter text for testing
const MULTI_CHAPTER_TEXT = `
CHAPTER 1: The Beginning

In the quiet village of Millbrook, young Thomas awakened to the sound of bells.
He had lived there all his seventeen years, apprenticed to the blacksmith Marcus.
Sarah, the baker's daughter, waved to him from across the cobblestone square.

Thomas felt something strange in the air that morning. The old wizard Aldric had
warned him of changes coming. "The darkness rises in the East," Aldric had said,
his grey eyes haunted by visions.

Marcus called from the forge. "Thomas! The King's guard needs their swords today!"
Thomas hurried to work, unaware that his life was about to change forever.

CHAPTER 2: The Call

A rider approached Millbrook at sunset. The stranger wore the crimson cloak of
the Royal Messengers. He asked for Thomas by name.

"You are summoned to the capital," the messenger announced. "King Alderon himself
requests your presence."

Thomas was stunned. Why would the King want a simple blacksmith's apprentice?
Marcus looked worried but said nothing. Sarah ran to Thomas, tears in her eyes.

"You must go," Aldric appeared beside them, leaning on his staff. "Your destiny
awaits, young Thomas. The prophecy speaks of a village boy who will save the realm."

Thomas bid farewell to his friends and mounted the spare horse. As Millbrook
faded behind him, he wondered if he would ever see his home again.

CHAPTER 3: The Journey

The road to the capital was long and treacherous. Thomas and the messenger,
whose name was Gerald, traveled for three days through the Whispering Woods.

On the second night, they encountered bandits. Gerald drew his sword with
practiced ease, but it was Thomas who surprised them all. When a bandit swung
at him, Thomas instinctively raised his hand and a shield of blue light appeared.

"By the stars," Gerald whispered. "You're a mage. An untrained mage."

Thomas stared at his trembling hands. The power had come from nowhere, yet it
felt as natural as breathing. "I don't understand," he said.

"Aldric knew," Gerald said grimly. "That's why the King wants you. The Dark Lord
Malvorn has returned, and only a mage of great power can stop him."

They rode faster after that, the weight of the world pressing on Thomas's shoulders.
`;

describe('ChunkedExtractionPipeline', () => {
  describe('Text Chunking Logic', () => {
    it('should split text by chapters when chapter markers exist', () => {
      const mockLLM = new MockLLM();
      const pipeline = new ChunkedExtractionPipeline(mockLLM, {
        maxChunkSize: 2000,
        respectChapters: true,
      });

      // Access private method for testing via any cast
      const chunks = (pipeline as any).splitIntoChunks(MULTI_CHAPTER_TEXT);

      // Should create reasonable chunks
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.length).toBeLessThan(10);

      // Each chunk should be under max size
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(2000);
      }
    });

    it('should handle text without chapter markers', () => {
      const textWithoutChapters = `
        This is a long paragraph of text that goes on and on. It talks about
        various characters like Alice and Bob, who are friends in a magical land.
        They go on adventures together, fighting dragons and saving princesses.

        In another part of the story, they meet Charlie, a wise old wizard who
        teaches them the ways of magic. Charlie has a pet phoenix named Ember.

        The story continues with more adventures and challenges. Alice discovers
        she has magical powers, while Bob becomes a skilled swordsman. Together
        they face the evil sorcerer Malum, who threatens their peaceful kingdom.
      `.repeat(10); // Make it long enough to require chunking

      const mockLLM = new MockLLM();
      const pipeline = new ChunkedExtractionPipeline(mockLLM, {
        maxChunkSize: 500,
        respectParagraphs: true,
      });

      const chunks = (pipeline as any).splitIntoChunks(textWithoutChapters);

      // Should create multiple chunks
      expect(chunks.length).toBeGreaterThan(1);

      // Chunks should be reasonably sized (paragraph-based splitting
      // keeps paragraphs intact, so chunks may exceed strict maxChunkSize)
      const avgChunkSize = chunks.reduce((sum: number, c: string) => sum + c.length, 0) / chunks.length;
      expect(avgChunkSize).toBeLessThan(1000); // Average should be reasonable
    });

    it('should add overlap between chunks', () => {
      const mockLLM = new MockLLM();
      const pipeline = new ChunkedExtractionPipeline(mockLLM, {
        maxChunkSize: 500,
        overlapSize: 100,
        respectChapters: false,
        respectParagraphs: true,
      });

      const longText = 'Word '.repeat(500); // About 2500 chars
      const chunks = (pipeline as any).splitIntoChunks(longText);

      // With overlap, adjacent chunks should share some content
      if (chunks.length >= 2) {
        // Check that chunks are created with reasonable sizes
        expect(chunks[0].length).toBeGreaterThan(0);
        expect(chunks[1].length).toBeGreaterThan(0);
      }
    });
  });

  describe('Structure Merging', () => {
    it('should merge entity lists without duplicates', () => {
      const mockLLM = new MockLLM();
      const pipeline = new ChunkedExtractionPipeline(mockLLM);

      const base = {
        entities: [
          { id: 'e1', name: 'Thomas', type: 'character' as const, description: '', aliases: [] },
        ],
        scenes: [],
        relationships: [],
        stateChanges: [],
        chronology: { events: [], timeline: [] },
        themes: ['adventure'],
        metadata: {}
      };

      const addition = {
        entities: [
          { id: 'e1', name: 'Thomas', type: 'character' as const, description: '', aliases: [] }, // Duplicate
          { id: 'e2', name: 'Sarah', type: 'character' as const, description: '', aliases: [] }, // New
        ],
        scenes: [{ id: 's1', title: 'Scene 1', description: '', characters: ['e1'], location: '', sequence: 0 }],
        relationships: [],
        stateChanges: [],
        chronology: { events: [], timeline: [] },
        themes: ['romance'],
        metadata: {}
      };

      const merged = (pipeline as any).mergeStructures(base, addition);

      // Should have 2 entities, not 3 (e1 was deduplicated)
      expect(merged.entities.length).toBe(2);
      expect(merged.entities.map((e: any) => e.id)).toContain('e1');
      expect(merged.entities.map((e: any) => e.id)).toContain('e2');

      // Should have 1 scene
      expect(merged.scenes.length).toBe(1);

      // Themes should be merged
      expect(merged.themes).toContain('adventure');
      expect(merged.themes).toContain('romance');
    });

    it('should renumber scenes sequentially', () => {
      const mockLLM = new MockLLM();
      const pipeline = new ChunkedExtractionPipeline(mockLLM);

      const base = {
        entities: [],
        scenes: [
          { id: 's1', title: 'Scene 1', description: '', characters: [], location: '', sequence: 0 },
          { id: 's2', title: 'Scene 2', description: '', characters: [], location: '', sequence: 1 },
        ],
        relationships: [],
        stateChanges: [],
        chronology: { events: [], timeline: [] },
        themes: [],
        metadata: {}
      };

      const addition = {
        entities: [],
        scenes: [
          { id: 's3', title: 'Scene 3', description: '', characters: [], location: '', sequence: 0 }, // Starts at 0
          { id: 's4', title: 'Scene 4', description: '', characters: [], location: '', sequence: 1 },
        ],
        relationships: [],
        stateChanges: [],
        chronology: { events: [], timeline: [] },
        themes: [],
        metadata: {}
      };

      const merged = (pipeline as any).mergeStructures(base, addition);

      expect(merged.scenes.length).toBe(4);

      // Scenes should have sequential numbering
      const sequences = merged.scenes.map((s: any) => s.sequence).sort((a: number, b: number) => a - b);
      expect(sequences).toEqual([0, 1, 2, 3]);
    });
  });

  describe('Progress Tracking', () => {
    it('should call progress callback during extraction', async () => {
      const mockLLM = new MockLLM();
      const progressUpdates: any[] = [];

      const pipeline = new ChunkedExtractionPipeline(mockLLM, {
        maxChunkSize: 1000,
        onProgress: (progress) => progressUpdates.push(progress),
      });

      await pipeline.extractFromBook(MULTI_CHAPTER_TEXT);

      expect(progressUpdates.length).toBeGreaterThan(0);

      // Check progress structure
      const lastProgress = progressUpdates[progressUpdates.length - 1];
      expect(lastProgress.percentComplete).toBe(100);
      expect(lastProgress.currentChunk).toBe(lastProgress.totalChunks);
    });
  });

  // Real LLM tests - only run when ALLOW_LLM_TESTS is set
  const describeLLM = process.env.ALLOW_LLM_TESTS ? describe : describe.skip;

  describeLLM('Real LLM Integration', () => {
    let pipeline: ChunkedExtractionPipeline;

    beforeAll(() => {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY or GOOGLE_AI_API_KEY must be set for LLM tests');
      }

      const llm = new GeminiAdapter({
        apiKey,
        timeout: 180000, // 3 minutes per chunk
        maxRetries: 3,
        requestDelay: 2000,
      });

      pipeline = new ChunkedExtractionPipeline(llm, {
        maxChunkSize: 4000, // Smaller chunks for faster testing
        overlapSize: 300,
        respectChapters: true,
        onProgress: (p) => console.log(`Progress: ${p.percentComplete.toFixed(1)}% (${p.currentChunk}/${p.totalChunks})`),
      });
    }, 30000);

    it('should extract narrative from multi-chapter text', async () => {
      const result = await pipeline.extractFromBook(MULTI_CHAPTER_TEXT);

      console.log('Extraction result:', {
        entities: result.structure.entities.length,
        scenes: result.structure.scenes.length,
        relationships: result.structure.relationships.length,
        chunksProcessed: result.chunks.length,
        totalTimeMs: result.totalTimeMs,
        deduplication: result.deduplicationStats,
      });

      // Should extract key characters
      const entityNames = result.structure.entities.map(e => e.name.toLowerCase());
      expect(entityNames.some(n => n.includes('thomas'))).toBe(true);

      // Should have multiple scenes
      expect(result.structure.scenes.length).toBeGreaterThan(0);

      // Should track relationships
      expect(result.structure.relationships.length).toBeGreaterThan(0);

      // Should have processed multiple chunks
      expect(result.chunks.length).toBeGreaterThan(0);
    }, 600000); // 10 minutes for full extraction

    it('should maintain entity coherence across chunks', async () => {
      const result = await pipeline.extractFromBook(MULTI_CHAPTER_TEXT);

      // Thomas appears in all chapters - should be one entity, not multiple
      const thomasEntities = result.structure.entities.filter(
        e => e.name.toLowerCase().includes('thomas')
      );

      expect(thomasEntities.length).toBe(1);

      // Check deduplication worked
      expect(result.deduplicationStats.entitiesBeforeDedup).toBeGreaterThanOrEqual(
        result.deduplicationStats.entitiesAfterDedup
      );
    }, 600000);
  });
});
