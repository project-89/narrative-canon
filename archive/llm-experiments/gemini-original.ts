import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { LLMAdapter, LLMOptions } from '../types';

export class GeminiAdapter implements LLMAdapter {
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

    // Add schema instructions to the prompt
    const schemaInstructions = this.generateSchemaInstructions(schema);
    const enhancedPrompt = `${prompt}

IMPORTANT: You must return a valid JSON object that follows this exact schema:
${schemaInstructions}

Ensure all required fields are present with appropriate values.`;

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
      return schema.parse(parsed);
    } catch (error) {
      console.error('Failed to parse Gemini response:', error);
      console.error('Raw response:', text);
      
      // If it's a Zod error, provide more details
      if (error instanceof z.ZodError) {
        console.error('Validation errors:', JSON.stringify(error.errors, null, 2));
      }
      
      throw new Error('Failed to parse structured output from Gemini');
    }
  }

  private generateSchemaInstructions(schema: z.ZodSchema<any>): string {
    // This is a simplified schema description
    // In a real implementation, you might want to use a library like zod-to-json-schema
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const fields: string[] = [];
      
      for (const [key, value] of Object.entries(shape)) {
        const fieldSchema = value as z.ZodTypeAny;
        const isOptional = fieldSchema.isOptional();
        const typeName = this.getZodTypeName(fieldSchema);
        fields.push(`  "${key}": ${typeName}${isOptional ? ' (optional)' : ' (required)'}`);
      }
      
      return `{
${fields.join(',\n')}
}`;
    }
    
    return 'Follow the expected JSON structure.';
  }

  private getZodTypeName(schema: z.ZodTypeAny): string {
    if (schema instanceof z.ZodString) return 'string';
    if (schema instanceof z.ZodNumber) return 'number';
    if (schema instanceof z.ZodBoolean) return 'boolean';
    if (schema instanceof z.ZodArray) {
      const elementType = this.getZodTypeName(schema.element);
      return `${elementType}[]`;
    }
    if (schema instanceof z.ZodObject) return 'object';
    if (schema instanceof z.ZodLiteral) return `"${schema.value}"`;
    if (schema instanceof z.ZodOptional) return this.getZodTypeName(schema.unwrap());
    if (schema instanceof z.ZodDefault) return this.getZodTypeName(schema._def.innerType);
    if (schema instanceof z.ZodUnion) {
      const options = schema.options.map((opt: any) => this.getZodTypeName(opt));
      return options.join(' | ');
    }
    if (schema instanceof z.ZodEnum) {
      const values = schema.options;
      return values.map((v: any) => `"${v}"`).join(' | ');
    }
    
    return 'any';
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
        return 'gemini-1.5-flash'; // Default to fast model
    }
  }
}