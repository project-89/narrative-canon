/**
 * Modern Gemini Adapter using the new @google/genai package
 * 
 * Based on the latest Google AI documentation and supports
 * structured output with proper schema validation.
 */

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { z } from 'zod';
import { LLMAdapter, LLMOptions } from '../types';
import { getModelForTask, getModelConfig } from '../config/models';

export class GeminiAdapter implements LLMAdapter {
  private genAI: GoogleGenerativeAI;

  constructor(private apiKey: string) {
    this.genAI = new GoogleGenerativeAI(this.apiKey);
  }

  async generateStructuredOutput<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options: LLMOptions = {}
  ): Promise<T> {
    const modelName = this.selectModel(options.modelPreference);
    console.log(`🤖 Using model: ${modelName}`);
    
    // Enhance prompt with JSON formatting instructions
    const enhancedPrompt = this.enhancePromptForJSON(prompt, schema);
    
    try {
      console.log('📤 Sending request to Gemini API...');
      
      // Use the new genAI.generateContent method
      const response = await this.genAI.generateContent({
        model: modelName,
        contents: [{
          role: 'user',
          parts: [{ text: enhancedPrompt }]
        }],
        generationConfig: {
          temperature: options.temperature ?? 0.3,
          maxOutputTokens: options.maxTokens ?? 8192,
          responseMimeType: 'application/json'
        }
      });

      console.log('📥 Received response from Gemini API');
      
      if (!response.text) {
        throw new Error('No text response from Gemini API');
      }

      const text = response.text;
      console.log('📥 Raw Gemini response:', text.substring(0, 200) + '...');
      
      // Parse JSON response
      const parsed = JSON.parse(text);
      
      // Validate with Zod for extra safety
      const validated = schema.parse(parsed);
      console.log('✅ Response validated successfully');
      
      return validated;
    } catch (error: any) {
      console.error('❌ Gemini structured output error:', error);
      throw error;
    }
  }

  async generateText(prompt: string, options: LLMOptions = {}): Promise<string> {
    const modelName = this.selectModel(options.modelPreference);
    
    const response = await this.genAI.generateContent({
      model: modelName,
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 8192
      }
    });

    if (!response.text) {
      throw new Error('No text response from Gemini API');
    }

    return response.text;
  }

  /**
   * Enhanced prompt engineering for JSON output
   * The new @google/genai package handles structured output differently
   */
  private enhancePromptForJSON(prompt: string, schema: z.ZodSchema<any>): string {
    // Add JSON format instructions to the prompt
    const jsonInstructions = `

IMPORTANT: Respond with valid JSON only. No additional text or explanation.

The response must be a valid JSON object that matches this structure:
${this.getSchemaExample(schema)}

Ensure all required fields are included and properly formatted.`;

    return prompt + jsonInstructions;
  }

  private getSchemaExample(schema: z.ZodSchema<any>): string {
    // Generate a simple example based on common schema patterns
    try {
      // Try to generate an example based on the schema
      if (schema._def?.typeName === 'ZodObject') {
        const shape = (schema as any).shape;
        const example: any = {};
        
        for (const [key, value] of Object.entries(shape)) {
          const fieldSchema = value as any;
          if (key === 'entities') {
            example[key] = []; // Array field
          } else if (key === 'scenes') {
            example[key] = []; // Array field
          } else if (key === 'relationships') {
            example[key] = []; // Array field
          } else if (key === 'stateChanges') {
            example[key] = []; // Array field
          } else if (key === 'missions') {
            example[key] = []; // Array field
          } else if (fieldSchema._def?.typeName === 'ZodString') {
            example[key] = "example_string";
          } else if (fieldSchema._def?.typeName === 'ZodNumber') {
            example[key] = 0;
          } else if (fieldSchema._def?.typeName === 'ZodArray') {
            example[key] = [];
          } else {
            example[key] = null;
          }
        }
        
        return JSON.stringify(example, null, 2);
      }
    } catch (e) {
      // Fallback to generic example
    }
    
    return '{ "result": [] }';
  }

  private selectModel(preference?: 'fast' | 'smart' | 'default'): string {
    // Use centralized model configuration
    const taskMap = {
      'fast': 'fast' as const,
      'smart': 'smart' as const, 
      'default': 'default' as const
    };
    
    const task = taskMap[preference || 'default'];
    return getModelForTask(task);
  }
}

// Test functionality moved to dedicated test files