import { z } from 'zod';
import { MockLLM } from '../../src/llm/mock';

describe('MockLLM', () => {
  let mockLLM: MockLLM;

  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    mockLLM = new MockLLM();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateStructuredOutput', () => {
    it('should return mock characters when prompt contains "characters"', async () => {
      const schema = z.object({
        characters: z.array(z.object({
          id: z.string(),
          name: z.string(),
          description: z.string().optional(),
        }))
      });

      const result = await mockLLM.generateStructuredOutput(
        'Extract characters from this text',
        schema
      );

      expect(result.characters).toBeDefined();
      expect(result.characters.length).toBeGreaterThan(0);
      expect(result.characters[0]).toHaveProperty('id');
      expect(result.characters[0]).toHaveProperty('name');
    });

    it('should return mock scenes when prompt contains "scenes"', async () => {
      const schema = z.object({
        scenes: z.array(z.object({
          id: z.string(),
          sequence: z.number(),
          summary: z.string(),
        }))
      });

      const result = await mockLLM.generateStructuredOutput(
        'Break down into scenes',
        schema
      );

      expect(result.scenes).toBeDefined();
      expect(result.scenes.length).toBeGreaterThan(0);
      expect(result.scenes[0].sequence).toBe(1);
    });

    it('should return mock relationships when prompt contains "relationships"', async () => {
      const schema = z.object({
        relationships: z.array(z.object({
          source: z.string(),
          target: z.string(),
          type: z.string(),
        }))
      });

      const result = await mockLLM.generateStructuredOutput(
        'Extract all significant relationships between the provided entities',
        schema
      );

      expect(result.relationships).toBeDefined();
      expect(result.relationships.length).toBeGreaterThan(0);
      expect(result.relationships[0]).toHaveProperty('source');
      expect(result.relationships[0]).toHaveProperty('target');
      expect(result.relationships[0]).toHaveProperty('type');
    });

    it('should return mock state changes when prompt contains "state changes"', async () => {
      const schema = z.object({
        stateChanges: z.array(z.object({
          sequence: z.number(),
          sceneId: z.string(),
          type: z.string(),
          entityId: z.string(),
          description: z.string(),
        }))
      });

      const result = await mockLLM.generateStructuredOutput(
        'Identify all significant state changes in the narrative',
        schema
      );

      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges.length).toBeGreaterThan(0);
      expect(result.stateChanges[0]).toHaveProperty('type');
      expect(result.stateChanges[0]).toHaveProperty('description');
    });

    it('should return empty default when no pattern matches', async () => {
      const schema = z.object({
        data: z.array(z.string()).optional(),
      });

      const result = await mockLLM.generateStructuredOutput(
        'Some unrecognized prompt',
        schema
      );

      expect(result).toEqual({});
    });
  });

  describe('generateText', () => {
    it('should generate character description for character prompts', async () => {
      const result = await mockLLM.generateText(
        'Describe the character John'
      );

      expect(result).toContain('emerged from the shadows');
      expect(result.length).toBeGreaterThan(50);
    });

    it('should generate scene description for scene prompts', async () => {
      const result = await mockLLM.generateText(
        'Describe the scene at the tavern'
      );

      expect(result).toContain('space shimmers');
      expect(result.length).toBeGreaterThan(50);
    });

    it('should generate relationship description for relationship prompts', async () => {
      const result = await mockLLM.generateText(
        'Explain the relationship between Alice and Bob'
      );

      expect(result).toContain('connection transcends');
      expect(result.length).toBeGreaterThan(50);
    });

    it('should generate generic text for other prompts', async () => {
      const result = await mockLLM.generateText(
        'Random prompt text'
      );

      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
