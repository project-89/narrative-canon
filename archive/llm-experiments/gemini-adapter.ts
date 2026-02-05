import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { LLMAdapter, LLMOptions } from '../types';

export class GeminiAdapter implements LLMAdapter {
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
      
      // Add JSON formatting instruction to prompt
      const structuredPrompt = `${prompt}

IMPORTANT: Respond with valid JSON that matches this exact structure. Do not include any text before or after the JSON.

Required JSON schema example:
${this.generateSchemaExample(schema)}

Your response must be parseable JSON only.`;

      // Generate content
      const result = await this.model.generateContent(structuredPrompt);
      const response = await result.response;
      const text = response.text();
      
      console.log(`🤖 Gemini response: ${text.length} chars`);
      
      // Clean the response (remove markdown code blocks if present)
      const cleanedText = this.cleanJsonResponse(text);
      
      // Parse and validate
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(cleanedText);
      } catch (parseError) {
        console.error('❌ JSON parse error:', parseError);
        console.error('Raw response (first 500 chars):', text.slice(0, 500));
        console.error('Cleaned response (first 500 chars):', cleanedText.slice(0, 500));
        throw new Error(`Failed to parse LLM response as JSON: ${parseError}`);
      }
      
      // Validate against schema
      try {
        const validated = schema.parse(parsedResponse);
        console.log('✅ Gemini response validated successfully');
        return validated;
      } catch (validationError) {
        console.error('❌ Schema validation failed');
        console.error('Parsed response structure:', JSON.stringify(parsedResponse, null, 2).slice(0, 1000));
        throw validationError;
      }
      
    } catch (error) {
      console.error('❌ Gemini API error:', error);
      if (error instanceof z.ZodError) {
        console.error('Schema validation errors:', error.errors);
      }
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

  private cleanJsonResponse(text: string): string {
    // Remove markdown code blocks
    let cleaned = text.trim();
    
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    
    return cleaned.trim();
  }

  private generateSchemaExample(schema: z.ZodSchema): string {
    // Generate a basic example based on schema type
    // This is a simplified version - in production you'd want more sophisticated schema introspection
    try {
      if (schema instanceof z.ZodObject) {
        const shape = schema.shape;
        const example: any = {};
        
        for (const [key, value] of Object.entries(shape)) {
          if (value instanceof z.ZodString) {
            example[key] = "example_string";
          } else if (value instanceof z.ZodNumber) {
            example[key] = 0.5;
          } else if (value instanceof z.ZodArray) {
            example[key] = ["example_item"];
          } else if (value instanceof z.ZodEnum) {
            const enumValues = (value as any)._def.values;
            example[key] = enumValues[0];
          } else {
            example[key] = "example_value";
          }
        }
        
        return JSON.stringify(example, null, 2);
      }
    } catch (error) {
      console.warn('Could not generate schema example:', error);
    }
    
    return '{ "example": "structure" }';
  }
}