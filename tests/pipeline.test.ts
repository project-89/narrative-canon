import { NarrativePipeline } from '../src/pipeline';
import { MockLLM } from '../src/llm/mock';
import { UnifiedLLMAdapter } from '../src/llm/adapter';

describe('NarrativePipeline', () => {
  const sampleNarrative = `
    Chapter 1: The Meeting
    
    Alice entered the old library where Bob was studying ancient texts.
    "I found something important," she whispered, showing him a mysterious key.
    Bob's eyes widened. "This could change everything," he said.
    
    Chapter 2: The Discovery
    
    Together, they descended into the library's hidden basement.
    The key unlocked a door that had been sealed for centuries.
    Inside, they found scrolls describing a lost civilization.
    
    Chapter 3: The Decision
    
    "We need to tell Dr. Morgan about this," Alice suggested.
    Bob hesitated. "Can we trust him? He works for OneiroCom."
    They decided to investigate further before revealing their discovery.
  `;

  describe('with MockLLM', () => {
    let pipeline: NarrativePipeline;

    beforeEach(() => {
      const mockLLM = new MockLLM();
      pipeline = new NarrativePipeline(mockLLM);
    });

    it('should extract complete narrative structure', async () => {
      const result = await pipeline.extractNarrative(sampleNarrative);

      expect(result).toBeDefined();
      expect(result.entities).toBeDefined();
      expect(result.scenes).toBeDefined();
      expect(result.relationships).toBeDefined();
      expect(result.stateChanges).toBeDefined();
      expect(result.chronology).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('should extract entities with canonical identity fields', async () => {
      const result = await pipeline.extractNarrative(sampleNarrative);

      expect(result.entities.length).toBeGreaterThan(0);
      for (const entity of result.entities) {
        expect(entity).toHaveProperty('id');
        expect(entity).toHaveProperty('name');
        expect(entity).toHaveProperty('type');
        expect(typeof entity.id).toBe('string');
        expect(typeof entity.name).toBe('string');
        expect(typeof entity.type).toBe('string');
      }
    });

    it('should extract scenes with proper structure', async () => {
      const result = await pipeline.extractNarrative(sampleNarrative);

      expect(result.scenes.length).toBeGreaterThan(0);
      
      const firstScene = result.scenes[0];
      expect(firstScene).toHaveProperty('id');
      expect(firstScene).toHaveProperty('title');
      expect(firstScene).toHaveProperty('sequence');
      expect(firstScene).toHaveProperty('description');
      expect(firstScene).toHaveProperty('characters');
      expect(firstScene).toHaveProperty('events');
    });

    it.skip('should extract relationships with IDs', async () => {
      const result = await pipeline.extractNarrative(sampleNarrative);

      expect(result.relationships.length).toBeGreaterThan(0);
      
      const firstRel = result.relationships[0];
      expect(firstRel).toHaveProperty('id');
      expect(firstRel).toHaveProperty('source');
      expect(firstRel).toHaveProperty('target');
      expect(firstRel).toHaveProperty('type');
    });

    it.skip('should extract state changes with sequence numbers', async () => {
      const result = await pipeline.extractNarrative(sampleNarrative);

      expect(result.stateChanges.length).toBeGreaterThan(0);
      
      const firstChange = result.stateChanges[0];
      expect(firstChange).toHaveProperty('sequence');
      expect(firstChange).toHaveProperty('type');
      expect(firstChange).toHaveProperty('description');
      expect(firstChange).toHaveProperty('changes');
    });

    it('should build chronology from scenes and state changes', async () => {
      const result = await pipeline.extractNarrative(sampleNarrative);

      expect(result.chronology).toBeDefined();
      expect(result.chronology.events).toBeDefined();
      expect(result.chronology.timeline).toBeDefined();
      expect(Array.isArray(result.chronology.events)).toBe(true);
      expect(Array.isArray(result.chronology.timeline)).toBe(true);
    });

    it.skip('should handle empty narrative', async () => {
      const result = await pipeline.extractNarrative('');

      expect(result).toBeDefined();
      expect(result.entities).toEqual([]);
      expect(result.scenes.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle narrative with no clear structure', async () => {
      const simpleText = 'The sun was shining. Birds were singing.';
      const result = await pipeline.extractNarrative(simpleText);

      expect(result).toBeDefined();
      expect(result.entities).toBeDefined();
      expect(result.scenes).toBeDefined();
    });
  });

  describe('buildTemporalGraph', () => {
    let pipeline: NarrativePipeline;

    beforeEach(() => {
      const mockLLM = new MockLLM();
      pipeline = new NarrativePipeline(mockLLM);
    });

    it('should build temporal graph from narrative structure', async () => {
      const structure = await pipeline.extractNarrative(sampleNarrative);
      const graph = pipeline.buildTemporalGraph(structure);

      expect(graph).toBeDefined();
      expect(graph.currentState).toBeDefined();
      expect(graph.history).toBeDefined();
      expect(graph.history).toBeInstanceOf(Map);
    });

    it('should include entities in initial state', async () => {
      const structure = await pipeline.extractNarrative(sampleNarrative);
      const graph = pipeline.buildTemporalGraph(structure);

      const state = graph.currentState;
      expect(state.entities).toBeDefined();
      expect(state.entities).toBeInstanceOf(Map);
    });

    it('should include relationships in initial state', async () => {
      const structure = await pipeline.extractNarrative(sampleNarrative);
      const graph = pipeline.buildTemporalGraph(structure);

      const state = graph.currentState;
      expect(state.relationships).toBeDefined();
      expect(state.relationships).toBeInstanceOf(Map);
    });
  });

  describe('with UnifiedLLMAdapter', () => {
    it('should work in mock mode', async () => {
      const adapter = new UnifiedLLMAdapter(undefined, true);
      const pipeline = new NarrativePipeline(adapter);

      const result = await pipeline.extractNarrative(sampleNarrative);

      expect(result).toBeDefined();
      expect(result.entities.length).toBeGreaterThan(0);
      expect(result.scenes.length).toBeGreaterThan(0);
    });

    it('should report using mock mode correctly', () => {
      const adapter = new UnifiedLLMAdapter(undefined, true);
      expect(adapter.isUsingRealAPI()).toBe(false);
    });
  });
});
