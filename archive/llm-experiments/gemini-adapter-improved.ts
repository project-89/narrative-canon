import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { LLMAdapter, LLMOptions } from '../types';

export class GeminiAdapterImproved implements LLMAdapter {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey?: string) {
    if (!apiKey && !process.env.GEMINI_API_KEY) {
      throw new Error('Gemini API key required. Set GEMINI_API_KEY environment variable or pass as constructor argument.');
    }
    
    this.genAI = new GoogleGenerativeAI(apiKey || process.env.GEMINI_API_KEY!);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  async generateStructuredOutput<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options?: LLMOptions
  ): Promise<T> {
    try {
      console.log(`🧠 Gemini processing prompt (${prompt.length} chars)...`);
      
      // Generate better schema example
      const schemaExample = this.generateDetailedSchemaExample(schema);
      
      // Add JSON formatting instruction to prompt
      const structuredPrompt = `${prompt}

CRITICAL: You must respond with ONLY valid JSON that matches this schema exactly.
Do not include any text, markdown, or explanation - just the JSON object.

Required JSON structure:
${schemaExample}

Your response must start with { and end with }
All required fields must be present with the correct types.`;

      // Generate content
      const result = await this.model.generateContent(structuredPrompt);
      const response = await result.response;
      const text = response.text();
      
      console.log(`🤖 Gemini response: ${text.length} chars`);
      
      // Clean the response
      const cleanedText = this.cleanJsonResponse(text);
      
      // Parse and validate
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(cleanedText);
      } catch (parseError) {
        console.error('❌ JSON parse error:', parseError);
        console.error('Raw response (first 500 chars):', text.slice(0, 500));
        console.error('Cleaned response (first 500 chars):', cleanedText.slice(0, 500));
        
        // Try to extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsedResponse = JSON.parse(jsonMatch[0]);
          } catch (e) {
            throw new Error(`Failed to parse LLM response as JSON: ${parseError}`);
          }
        } else {
          throw new Error(`No JSON object found in response: ${parseError}`);
        }
      }
      
      // Validate against schema
      try {
        const validated = schema.parse(parsedResponse);
        console.log('✅ Gemini response validated successfully');
        return validated;
      } catch (validationError) {
        console.error('❌ Schema validation failed');
        console.error('Validation errors:', validationError);
        console.error('Parsed response:', JSON.stringify(parsedResponse, null, 2).slice(0, 1000));
        throw validationError;
      }
      
    } catch (error) {
      console.error('❌ Gemini API error:', error);
      throw error;
    }
  }

  async generateText(
    prompt: string,
    options?: LLMOptions
  ): Promise<string> {
    try {
      console.log(`🧠 Gemini generating text (${prompt.length} chars)...`);
      
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      console.log(`📝 Gemini text response: ${text.length} chars`);
      return text;
      
    } catch (error) {
      console.error('❌ Gemini text generation error:', error);
      throw error;
    }
  }

  // Alias for game compatibility
  async generate(prompt: string, options?: LLMOptions): Promise<string> {
    return this.generateText(prompt, options);
  }

  private cleanJsonResponse(text: string): string {
    // Remove markdown code blocks
    let cleaned = text.trim();
    
    // Remove various markdown formats
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
    cleaned = cleaned.replace(/\n?```\s*$/i, '');
    
    // Remove any leading/trailing whitespace
    cleaned = cleaned.trim();
    
    // If there's text before the JSON, try to extract just the JSON
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    }
    
    return cleaned;
  }

  private generateDetailedSchemaExample(schema: z.ZodSchema): string {
    try {
      // Special handling for common schemas in our system
      const schemaString = schema.toString();
      
      // Character extraction schema
      if (schemaString.includes('entities') && schemaString.includes('character')) {
        return JSON.stringify({
          entities: [
            {
              id: "char_alice_chen",
              name: "Alice Chen",
              type: "character",
              description: "A brave resistance fighter",
              aliases: ["Alice", "Agent A"],
              role: "protagonist",
              species: "human",
              profession: "hacker",
              title: "Lead Operative",
              personality: ["brave", "determined"],
              motivations: ["freedom", "justice"],
              abilities: ["hacking", "combat"],
              significance: 0.9,
              firstMentioned: 0,
              introduction: "Alice appears as a skilled hacker",
              status: "active",
              emotional_state: ["determined"],
              goals: ["defeat Oneirocom"]
            },
            {
              id: "loc_neo_tokyo",
              name: "Neo Tokyo",
              type: "location",
              description: "A sprawling cyberpunk metropolis",
              significance: 0.8,
              firstMentioned: 50
            }
          ]
        }, null, 2);
      }
      
      // Relationship extraction schema
      if (schemaString.includes('relationships')) {
        return JSON.stringify({
          relationships: [
            {
              id: "rel_001",
              source: "Alice Chen",
              target: "Bob Smith",
              type: "ally",
              description: "Alice and Bob work together",
              strength: 0.8,
              directionality: "bidirectional",
              temporality: "permanent",
              confidence: 0.9,
              evidence: ["They plan missions together"],
              firstMentioned: 100,
              lastMentioned: 500,
              metadata: {
                trust_level: "high"
              }
            }
          ]
        }, null, 2);
      }
      
      // Scene extraction schema
      if (schemaString.includes('scenes')) {
        return JSON.stringify({
          scenes: [
            {
              id: "scene_001",
              sequence: 1,
              summary: "Alice infiltrates Oneirocom facility",
              location: "Oneirocom Tower",
              characters: ["Alice Chen", "Security Guard"],
              events: [
                {
                  id: "event_001",
                  description: "Alice hacks the security system",
                  participants: ["Alice Chen"],
                  sequence: 1
                }
              ]
            }
          ]
        }, null, 2);
      }
      
      // Generic nested object handling
      return this.generateGenericExample(schema);
      
    } catch (error) {
      console.warn('Could not generate detailed schema example:', error);
      return JSON.stringify({ 
        example: "Please provide all required fields with correct types" 
      }, null, 2);
    }
  }

  private generateGenericExample(schema: z.ZodSchema, depth = 0): string {
    if (depth > 3) return '"..."'; // Prevent infinite recursion
    
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const example: any = {};
      
      for (const [key, value] of Object.entries(shape)) {
        example[key] = this.getExampleValue(value as z.ZodSchema, depth);
      }
      
      return JSON.stringify(example, null, 2);
    }
    
    return this.getExampleValue(schema, depth);
  }

  private getExampleValue(schema: z.ZodSchema, depth = 0): any {
    if (schema instanceof z.ZodString) {
      return "example_string";
    } else if (schema instanceof z.ZodNumber) {
      return 0.5;
    } else if (schema instanceof z.ZodBoolean) {
      return true;
    } else if (schema instanceof z.ZodArray) {
      const innerType = (schema as any)._def.type;
      return [this.getExampleValue(innerType, depth + 1)];
    } else if (schema instanceof z.ZodEnum) {
      const values = (schema as any)._def.values;
      return values[0];
    } else if (schema instanceof z.ZodUnion) {
      const options = (schema as any)._def.options;
      return this.getExampleValue(options[0], depth + 1);
    } else if (schema instanceof z.ZodOptional) {
      const innerType = (schema as any)._def.innerType;
      return this.getExampleValue(innerType, depth + 1);
    } else if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const example: any = {};
      
      for (const [key, value] of Object.entries(shape)) {
        example[key] = this.getExampleValue(value as z.ZodSchema, depth + 1);
      }
      
      return example;
    }
    
    return "example_value";
  }
}