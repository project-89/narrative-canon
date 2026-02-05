import { z } from 'zod';
import { LLMAdapter, LLMOptions } from '../types';
import { MockLLM } from './mock';
import { GeminiAdapter } from './gemini';

const isTestEnv = process.env.NODE_ENV === 'test';

export class UnifiedLLMAdapter implements LLMAdapter {
  private adapter: LLMAdapter;

  constructor(apiKey?: string, useMock: boolean = false) {
    if (useMock || !apiKey) {
      if (!isTestEnv) {
        console.log('Using Mock LLM');
      }
      this.adapter = new MockLLM();
    } else {
      if (!isTestEnv) {
        console.log('Using Gemini API for extraction');
      }
      this.adapter = new GeminiAdapter(apiKey);
    }
  }

  async generateStructuredOutput<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options?: LLMOptions
  ): Promise<T> {
    return this.adapter.generateStructuredOutput(prompt, schema, options);
  }

  async generateText(
    prompt: string,
    options?: LLMOptions
  ): Promise<string> {
    return this.adapter.generateText(prompt, options);
  }

  // Helper to test if we're using the real API
  isUsingRealAPI(): boolean {
    return !(this.adapter instanceof MockLLM);
  }
}
