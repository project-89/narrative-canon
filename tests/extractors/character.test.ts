import { CharacterExtractor } from '../../src/extractors/character';
import { MockLLM } from '../../src/llm/mock';
import { UnifiedLLMAdapter } from '../../src/llm/adapter';

describe('CharacterExtractor', () => {
  describe('with MockLLM', () => {
    let extractor: CharacterExtractor;

    beforeEach(() => {
      const mockLLM = new MockLLM();
      extractor = new CharacterExtractor(mockLLM);
    });

    it('should extract characters from narrative text', async () => {
      const text = `
        Alice walked into the room where Bob was waiting.
        "Hello," she said to Bob.
        Charlie appeared in the doorway.
      `;

      const characters = await extractor.extractCharacters(text);

      expect(characters).toBeDefined();
      expect(characters.length).toBeGreaterThan(0);
      expect(characters[0]).toHaveProperty('id');
      expect(characters[0]).toHaveProperty('name');
      expect(characters[0]).toHaveProperty('type', 'character');
      expect(characters[0]).toHaveProperty('aliases');
    });

    it('should use fallback extraction when LLM fails', async () => {
      // Create a failing LLM
      const failingLLM = {
        generateStructuredOutput: jest.fn().mockRejectedValue(new Error('API Error')),
        generateText: jest.fn().mockResolvedValue('')
      };
      
      const extractor = new CharacterExtractor(failingLLM);
      
      const text = `
        King Arthur drew his sword.
        Queen Guinevere watched from the tower.
        Sir Lancelot rode into battle.
      `;

      const characters = await extractor.extractCharacters(text);

      expect(characters).toBeDefined();
      expect(characters.length).toBeGreaterThan(0);
      
      // Check that fallback extraction found titled characters
      const names = characters.map(c => c.name);
      expect(names).toContain('King Arthur');
      expect(names).toContain('Queen Guinevere');
    });

    it('should handle empty text', async () => {
      const characters = await extractor.extractCharacters('');
      
      expect(characters).toBeDefined();
      expect(Array.isArray(characters)).toBe(true);
    });

    it('should handle text with no clear characters', async () => {
      const text = 'The wind blew through the empty streets.';
      
      const characters = await extractor.extractCharacters(text);
      
      expect(characters).toBeDefined();
      expect(Array.isArray(characters)).toBe(true);
    });
  });

  describe('with UnifiedLLMAdapter', () => {
    it('should work with mock mode', async () => {
      const adapter = new UnifiedLLMAdapter(undefined, true);
      const extractor = new CharacterExtractor(adapter);

      const text = 'Alice met Bob at the cafe.';
      const characters = await extractor.extractCharacters(text);

      expect(characters).toBeDefined();
      expect(characters.length).toBeGreaterThan(0);
    });
  });

  describe('fallback extraction patterns', () => {
    let extractor: CharacterExtractor;

    beforeEach(() => {
      // Use a failing LLM to force fallback
      const failingLLM = {
        generateStructuredOutput: jest.fn().mockRejectedValue(new Error('Force fallback')),
        generateText: jest.fn().mockResolvedValue('')
      };
      extractor = new CharacterExtractor(failingLLM);
    });

    it('should extract capitalized names', async () => {
      const text = 'John Smith walked down the street. Mary Johnson waved at him.';
      
      const characters = await extractor.extractCharacters(text);
      const names = characters.map(c => c.name);
      
      expect(names).toContain('John Smith');
      expect(names).toContain('Mary Johnson');
    });

    it('should extract titled characters', async () => {
      const text = `
        Doctor Watson examined the patient.
        Professor Smith taught the class.
        Captain Morgan sailed the ship.
        Agent Johnson investigated the case.
      `;
      
      const characters = await extractor.extractCharacters(text);
      const names = characters.map(c => c.name);
      
      expect(names).toContain('Doctor Watson');
      expect(names).toContain('Professor Smith');
      expect(names).toContain('Captain Morgan');
      expect(names).toContain('Agent Johnson');
    });

    it.skip('should extract titles without names', async () => {
      const text = 'The King decreed that the Queen should meet with the Prince.';
      
      const characters = await extractor.extractCharacters(text);
      const names = characters.map(c => c.name);
      
      expect(names).toContain('The King');
      expect(names).toContain('the Queen');
      expect(names).toContain('the Prince');
    });

    it('should not duplicate characters', async () => {
      const text = 'Alice talked to Bob. Then Alice and Bob left together.';
      
      const characters = await extractor.extractCharacters(text);
      const aliceCount = characters.filter(c => c.name === 'Alice').length;
      const bobCount = characters.filter(c => c.name === 'Bob').length;
      
      expect(aliceCount).toBe(1);
      expect(bobCount).toBe(1);
    });

    it('should assign unique IDs to characters', async () => {
      const text = 'Alice, Bob, and Charlie were friends.';
      
      const characters = await extractor.extractCharacters(text);
      const ids = characters.map(c => c.id);
      const uniqueIds = new Set(ids);
      
      expect(uniqueIds.size).toBe(ids.length);
    });
  });
});
