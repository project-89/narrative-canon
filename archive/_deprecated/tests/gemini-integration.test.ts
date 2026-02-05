import { GeminiAdapter } from "../../src/llm/gemini";
import { CharacterLLMExtractor } from "../../src/extractors/character-llm-extractor";
import { RelationshipLLMExtractor } from "../../src/extractors/relationship-llm-extractor";
import { SceneExtractor } from "../../src/extractors/scene-extractor";

describe("Gemini Integration Tests", () => {
  // Use mock for tests
  const mockAdapter = {
    generateStructuredOutput: jest.fn(),
    generateText: jest.fn(),
  };

  describe("Entity Extraction", () => {
    it("should extract entities with all required fields", async () => {
      const extractor = new CharacterLLMExtractor(mockAdapter as any);

      // Mock the response to match what Gemini should return
      mockAdapter.generateStructuredOutput.mockResolvedValue({
        entities: [
          {
            id: "char_alice_chen",
            name: "Alice Chen",
            type: "character",
            description: "A skilled hacker fighting against Oneirocom",
            aliases: ["Alice", "Ghost"],
            role: "protagonist",
            species: "human",
            profession: "hacker",
            significance: 0.9,
            firstMentioned: 0,
            personality: ["brave", "resourceful"],
            motivations: ["freedom", "justice"],
            abilities: ["hacking", "stealth"],
          },
          {
            id: "org_oneirocom",
            name: "Oneirocom Corporation",
            type: "organization",
            description: "Dystopian megacorp controlling surveillance",
            significance: 0.95,
            firstMentioned: 50,
          },
        ],
      });

      const text = "Alice Chen infiltrated Oneirocom headquarters.";
      const result = await extractor.extractCharacters(text);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: "char_alice_chen",
        name: "Alice Chen",
        type: "character",
      });
      expect(result[1]).toMatchObject({
        id: "org_oneirocom",
        name: "Oneirocom Corporation",
        type: "organization",
      });
    });

    it("should handle missing optional fields gracefully", async () => {
      const extractor = new CharacterLLMExtractor(mockAdapter as any);

      // Minimal response with only required fields
      mockAdapter.generateStructuredOutput.mockResolvedValue({
        entities: [
          {
            id: "char_bob",
            name: "Bob",
            type: "character",
          },
        ],
      });

      const result = await extractor.extractCharacters("Bob walked by.");

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "char_bob",
        name: "Bob",
        type: "character",
        aliases: [], // Should default to empty array
        personality: [],
        motivations: [],
        abilities: [],
        emotional_state: [],
        goals: [],
      });
    });
  });

  describe("Relationship Extraction", () => {
    it("should extract relationships with proper structure", async () => {
      const extractor = new RelationshipLLMExtractor(mockAdapter as any);

      mockAdapter.generateStructuredOutput.mockResolvedValue({
        relationships: [
          {
            source: "Alice Chen",
            target: "Bob Smith",
            type: "ally",
            description: "They work together in the resistance",
            strength: 0.8,
            directionality: "bidirectional",
            temporality: "permanent",
            confidence: 0.9,
            evidence: ["They plan missions together"],
            firstMentioned: 100,
          },
        ],
      });

      const entities = [
        { id: "char_alice", name: "Alice Chen", type: "character" as const },
        { id: "char_bob", name: "Bob Smith", type: "character" as const },
      ];

      const result = await extractor.extractRelationships(
        "Alice and Bob planned the mission together.",
        entities
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        source: "Alice Chen",
        target: "Bob Smith",
        type: "ally",
      });
    });
  });

  describe("Scene Extraction", () => {
    it("should extract scenes with events", async () => {
      const extractor = new SceneExtractor(mockAdapter as any);

      // Mock the LLM response to align with LLMSceneOutputSchema and SceneExtractor logic
      mockAdapter.generateStructuredOutput.mockResolvedValue({
        scenes: [
          {
            id: "scene_001",
            title: "Facility Infiltration", // Provide a title
            sequence: 1,
            detailedDescription: "Alice infiltrates Oneirocom facility", // Main content here
            location: "Oneirocom Tower",
            characters: ["Alice Chen", "Security Guard"],
            keyEvents: [
              {
                description: "Alice bypasses security",
                participants: ["Alice Chen"],
                // significance: 'major' // Optional, can add if testing this mapping
              },
            ],
            // summary: "A brief summary if needed for 'briefSummary' testing" // Optional
          },
        ],
      });

      const entities: any[] = []; // Scene extractor needs entities for its prompt
      const result = await extractor.extractScenes(
        "Alice crept through the shadows of Oneirocom Tower.",
        entities
      );

      expect(result).toHaveLength(1);
      // Update assertion to check for description and title
      expect(result[0]).toMatchObject({
        id: "scene_001",
        title: "Facility Infiltration",
        description: "Alice infiltrates Oneirocom facility",
        characters: ["Alice Chen", "Security Guard"],
      });
      expect(result[0].events).toHaveLength(1);
      expect(result[0].events?.[0]).toMatchObject({
        description: "Alice bypasses security",
        participants: ["Alice Chen"],
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle responses with missing required fields", async () => {
      const extractor = new CharacterLLMExtractor(mockAdapter as any);

      // Response missing required fields
      mockAdapter.generateStructuredOutput.mockResolvedValue({
        entities: [
          {
            name: "Alice", // Missing id and type
          },
        ],
      });

      // The extractor should handle missing fields gracefully
      const result = await extractor.extractCharacters("Alice appeared.");

      // Check that the result has undefined for missing required fields
      expect(result).toHaveLength(1);
      expect(result[0].id).toBeUndefined();
      expect(result[0].type).toBeUndefined();
      expect(result[0].name).toBe("Alice");
    });

    it("should handle empty responses", async () => {
      const extractor = new CharacterLLMExtractor(mockAdapter as any);

      mockAdapter.generateStructuredOutput.mockResolvedValue({
        entities: [],
      });

      const result = await extractor.extractCharacters("The room was empty.");
      expect(result).toHaveLength(0);
    });
  });
});

// Integration test with real schema validation
describe("Schema Generation for Gemini", () => {
  it.skip("should generate proper instructions for entity extraction - outdated test for old prompt engineering approach", async () => {
    // This would test the actual schema generation
    const mockApiKey = "test-key";
    const adapter = new GeminiAdapter(mockApiKey);

    // We can't easily test private methods, but we can test the full flow
    // by mocking the Google AI response
    const mockGenAI = {
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: jest.fn().mockResolvedValue({
          response: {
            text: () =>
              JSON.stringify({
                entities: [
                  {
                    id: "char_test",
                    name: "Test Character",
                    type: "character",
                  },
                ],
              }),
          },
        }),
      }),
    };

    (adapter as any).genAI = mockGenAI;

    // Use the actual CharacterExtractionResponse schema which should trigger detailed instructions
    const { CharacterExtractionResponse } = await import(
      "../../src/extractors/character-llm-extractor"
    );

    // The prompt should include detailed schema when called
    await adapter.generateStructuredOutput(
      "Test prompt",
      CharacterExtractionResponse
    );

    const call =
      mockGenAI.getGenerativeModel().generateContent.mock.calls[0][0];
    const promptText = call.contents[0].parts[0].text;

    // Should include detailed field descriptions for entity extraction
    expect(promptText).toContain("id");
    expect(promptText).toContain("name");
    expect(promptText).toContain("type");
    // The improved adapter should detect entity extraction and provide examples
    expect(promptText).toContain("character");
  });
});
