import { GeminiAdapter } from "../../src/llm/gemini";
import { z } from "zod";

// Schema for testing
const TestResponseSchema = z.object({
  entities: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
    })
  ),
});

describe("GeminiAdapter", () => {
  describe("schema instructions", () => {
    it("should generate proper schema instructions", async () => {
      const mockApiKey = "test-key";
      const adapter = new GeminiAdapter(mockApiKey);

      // Mock the generateContent method to inspect the prompt
      const mockGenerateContent = jest.fn().mockResolvedValue({
        // Updated mock response structure
        text: JSON.stringify({
          entities: [{ id: "char_alice", name: "Alice", type: "character" }],
        }),
      });

      // Replace the genAI model with our mock
      (adapter as any).genAI = {
        // Ensure this path matches how genAI is used in the adapter
        models: {
          generateContent: mockGenerateContent,
        },
      };

      const prompt = "Extract entities from: Alice walked into the room.";
      await adapter.generateStructuredOutput(prompt, TestResponseSchema);

      // Check that the generationConfig includes the responseSchema
      const generationConfig = mockGenerateContent.mock.calls[0][0].config;
      expect(generationConfig).toBeDefined();
      expect(generationConfig.responseMimeType).toBe("application/json");
      expect(generationConfig.responseSchema).toBeDefined();
      // Optionally, add more specific checks for the converted schema if needed
      // For example, check for specific properties based on TestResponseSchema
      expect(generationConfig.responseSchema.properties.entities.type).toBe(
        "ARRAY"
      );
      expect(
        generationConfig.responseSchema.properties.entities.items.properties.id
          .type
      ).toBe("STRING");

      // The prompt itself should no longer contain explicit schema instructions
      // as that's handled by responseSchema in the config now.
      const calledPromptText = mockGenerateContent.mock.calls[0][0].contents;
      expect(calledPromptText).toBe(prompt);
    });
  });

  describe("error handling", () => {
    it("should provide helpful error messages when Zod validation fails", async () => {
      const mockApiKey = "test-key";
      const adapter = new GeminiAdapter(mockApiKey);

      // Mock to return incomplete data that will fail Zod parsing
      const mockGenerateContent = jest.fn().mockResolvedValue({
        // Updated mock response structure
        text: JSON.stringify({
          entities: [
            { name: "Alice" }, // Missing id and type, will fail TestResponseSchema
          ],
        }),
      });

      (adapter as any).genAI = {
        // Ensure this path matches how genAI is used in the adapter
        models: {
          generateContent: mockGenerateContent,
        },
      };

      const prompt = "Extract entities";

      await expect(
        adapter.generateStructuredOutput(prompt, TestResponseSchema)
      ).rejects.toThrow(z.ZodError); // Expecting a ZodError due to schema mismatch
    });

    it("should throw an error if the API returns no text", async () => {
      const mockApiKey = "test-key";
      const adapter = new GeminiAdapter(mockApiKey);

      const mockGenerateContent = jest.fn().mockResolvedValue({}); // No text field

      (adapter as any).genAI = {
        models: {
          generateContent: mockGenerateContent,
        },
      };

      const prompt = "Extract entities";
      await expect(
        adapter.generateStructuredOutput(prompt, TestResponseSchema)
      ).rejects.toThrow(
        "No text response from Gemini API - check response structure"
      );
    });
  });
});
