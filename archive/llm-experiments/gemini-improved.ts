import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { LLMAdapter, LLMOptions } from '../types';

export class GeminiAdapterImproved implements LLMAdapter {
  private genAI: GoogleGenerativeAI;
  
  constructor(private apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateStructuredOutput<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options: LLMOptions = {}
  ): Promise<T> {
    const model = this.genAI.getGenerativeModel({
      model: this.selectModel(options.modelPreference),
    });

    // Generate comprehensive schema instructions and example
    const { instructions, example } = this.generateDetailedSchemaInfo(schema);
    
    const enhancedPrompt = `${prompt}

CRITICAL INSTRUCTIONS:
1. You MUST return ONLY a valid JSON object
2. Do NOT include any text, markdown, or explanations
3. The JSON must match this EXACT structure:

${instructions}

Here is a complete example of the expected JSON format:
${example}

Remember: Return ONLY the JSON object, nothing else.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: enhancedPrompt }] }],
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 8192,
        responseMimeType: 'application/json',
      },
    });

    const response = result.response;
    const text = response.text();
    
    try {
      const parsed = JSON.parse(text);
      const validated = schema.parse(parsed);
      console.log('✅ Gemini response validated successfully');
      return validated;
    } catch (error) {
      console.error('Failed to parse Gemini response:', error);
      console.error('Raw response:', text.substring(0, 500));
      
      if (error instanceof z.ZodError) {
        console.error('Validation errors:', JSON.stringify(error.errors, null, 2));
        console.error('Schema expected:', instructions);
      }
      
      throw error;
    }
  }

  private generateDetailedSchemaInfo(schema: z.ZodSchema<any>): { instructions: string; example: string } {
    // Handle specific known schemas for better results
    const schemaStr = JSON.stringify(schema);
    
    // Entity extraction schema
    if (schemaStr.includes('entities') && schemaStr.includes('character')) {
      return {
        instructions: `{
  "entities": [
    {
      "id": string (REQUIRED - e.g., "char_alice_chen", "loc_neo_tokyo"),
      "name": string (REQUIRED - e.g., "Alice Chen", "Neo Tokyo"),
      "type": "character" | "location" | "object" | "organization" | "concept" | "event" (REQUIRED),
      "description": string (optional),
      "aliases": string[] (optional),
      "significance": number between 0-1 (optional),
      "firstMentioned": number (optional - character position in text),
      // For characters:
      "role": "protagonist" | "antagonist" | "supporting" | "minor" | "background" (optional),
      "species": string (optional),
      "profession": string (optional),
      "title": string (optional),
      "personality": string[] (optional),
      "motivations": string[] (optional),
      "abilities": string[] (optional),
      "introduction": string (optional),
      "status": string (optional),
      "emotional_state": string[] (optional),
      "goals": string[] (optional)
    }
  ]
}`,
        example: JSON.stringify({
          entities: [
            {
              id: "char_alice_chen",
              name: "Alice Chen",
              type: "character",
              description: "A skilled hacker and resistance fighter against Oneirocom",
              aliases: ["Alice", "Ghost"],
              role: "protagonist",
              species: "human",
              profession: "hacker",
              significance: 0.9,
              firstMentioned: 0
            },
            {
              id: "org_oneirocom",
              name: "Oneirocom Corporation",
              type: "organization",
              description: "Dystopian megacorp controlling global surveillance",
              significance: 0.95,
              firstMentioned: 45
            }
          ]
        }, null, 2)
      };
    }
    
    // Relationship extraction schema
    if (schemaStr.includes('relationships')) {
      return {
        instructions: `{
  "relationships": [
    {
      "id": string (optional - e.g., "rel_001"),
      "source": string (REQUIRED - character/entity name),
      "target": string (REQUIRED - character/entity name),
      "type": string (REQUIRED - e.g., "ally", "enemy", "loves", "works_for"),
      "description": string (optional),
      "strength": number 0-1 (optional),
      "directionality": "unidirectional" | "bidirectional" (optional),
      "temporality": "permanent" | "temporary" | "evolving" (optional),
      "confidence": number 0-1 (optional),
      "evidence": string[] (optional),
      "firstMentioned": number (optional)
    }
  ]
}`,
        example: JSON.stringify({
          relationships: [
            {
              source: "Alice Chen",
              target: "Bob Smith",
              type: "ally",
              description: "They work together in the resistance",
              strength: 0.8,
              directionality: "bidirectional"
            }
          ]
        }, null, 2)
      };
    }
    
    // Scene extraction schema
    if (schemaStr.includes('scenes')) {
      return {
        instructions: `{
  "scenes": [
    {
      "id": string (REQUIRED - e.g., "scene_001"),
      "sequence": number (REQUIRED - scene order),
      "summary": string (REQUIRED - brief description),
      "location": string (optional),
      "characters": string[] (REQUIRED - character names in scene),
      "events": [
        {
          "id": string (REQUIRED - e.g., "event_001"),
          "description": string (REQUIRED),
          "participants": string[] (REQUIRED),
          "sequence": number (REQUIRED)
        }
      ]
    }
  ]
}`,
        example: JSON.stringify({
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
        }, null, 2)
      };
    }
    
    // Generic fallback with better structure parsing
    return {
      instructions: this.generateGenericInstructions(schema),
      example: this.generateGenericExample(schema)
    };
  }

  private generateGenericInstructions(schema: z.ZodSchema<any>, indent = 0): string {
    const spaces = '  '.repeat(indent);
    
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const fields: string[] = [];
      
      fields.push(spaces + '{');
      
      for (const [key, value] of Object.entries(shape)) {
        const fieldSchema = value as z.ZodTypeAny;
        const isOptional = fieldSchema.isOptional();
        const fieldDesc = this.describeField(fieldSchema, indent + 1);
        fields.push(`${spaces}  "${key}": ${fieldDesc}${isOptional ? ' (optional)' : ' (REQUIRED)'},`);
      }
      
      fields.push(spaces + '}');
      return fields.join('\n');
    }
    
    return this.describeField(schema, indent);
  }

  private describeField(schema: z.ZodTypeAny, indent = 0): string {
    if (schema instanceof z.ZodString) return 'string';
    if (schema instanceof z.ZodNumber) return 'number';
    if (schema instanceof z.ZodBoolean) return 'boolean';
    if (schema instanceof z.ZodLiteral) return `"${schema.value}"`;
    
    if (schema instanceof z.ZodArray) {
      const elementType = this.describeField(schema.element, indent);
      // If it's an object array, show the structure
      if (schema.element instanceof z.ZodObject) {
        return `[\n${this.generateGenericInstructions(schema.element, indent + 1)}\n${'  '.repeat(indent)}]`;
      }
      return `${elementType}[]`;
    }
    
    if (schema instanceof z.ZodOptional) {
      return this.describeField(schema.unwrap(), indent);
    }
    
    if (schema instanceof z.ZodUnion) {
      const options = schema.options.map((opt: any) => this.describeField(opt, indent));
      return options.join(' | ');
    }
    
    if (schema instanceof z.ZodEnum) {
      const values = schema.options;
      return values.map((v: any) => `"${v}"`).join(' | ');
    }
    
    if (schema instanceof z.ZodObject) {
      return this.generateGenericInstructions(schema, indent);
    }
    
    return 'any';
  }

  private generateGenericExample(schema: z.ZodSchema<any>): string {
    try {
      if (schema instanceof z.ZodObject) {
        const shape = schema.shape;
        const example: any = {};
        
        for (const [key, value] of Object.entries(shape)) {
          example[key] = this.getExampleValue(value as z.ZodTypeAny);
        }
        
        return JSON.stringify(example, null, 2);
      }
      
      return JSON.stringify(this.getExampleValue(schema), null, 2);
    } catch (error) {
      return '{}';
    }
  }

  private getExampleValue(schema: z.ZodTypeAny): any {
    if (schema instanceof z.ZodString) {
      return "example_string";
    }
    if (schema instanceof z.ZodNumber) {
      return 0.5;
    }
    if (schema instanceof z.ZodBoolean) {
      return true;
    }
    if (schema instanceof z.ZodLiteral) {
      return schema.value;
    }
    if (schema instanceof z.ZodArray) {
      return [this.getExampleValue(schema.element)];
    }
    if (schema instanceof z.ZodOptional) {
      // Sometimes include optional fields in examples
      if (Math.random() > 0.5) {
        return this.getExampleValue(schema.unwrap());
      }
      return undefined;
    }
    if (schema instanceof z.ZodUnion) {
      // Pick first option for example
      return this.getExampleValue(schema.options[0]);
    }
    if (schema instanceof z.ZodEnum) {
      return schema.options[0];
    }
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const example: any = {};
      
      for (const [key, value] of Object.entries(shape)) {
        const val = this.getExampleValue(value as z.ZodTypeAny);
        if (val !== undefined) {
          example[key] = val;
        }
      }
      
      return example;
    }
    
    return "example_value";
  }

  async generateText(
    prompt: string,
    options: LLMOptions = {}
  ): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: this.selectModel(options.modelPreference),
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 8192,
      },
    });

    return result.response.text();
  }

  private selectModel(preference?: 'fast' | 'smart' | 'default'): string {
    switch (preference) {
      case 'fast':
        return 'gemini-1.5-flash';
      case 'smart':
        return 'gemini-1.5-pro';
      default:
        return 'gemini-1.5-flash';
    }
  }
}