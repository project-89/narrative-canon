/**
 * Modern Gemini Adapter using the latest @google/genai package
 *
 * Based on the most up-to-date Google AI documentation:
 * https://ai.google.dev/gemini-api/docs/structured-output
 */

import { GoogleGenAI, Type, FunctionCallingConfigMode } from "@google/genai";
import { z } from "zod";
import { LLMAdapter, LLMOptions } from "../types";
import { getModelForTask, getModelConfig } from "../config/models";

// Tool definition for function calling
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

// Tool call made by the model
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

// Result of executing a tool
export interface ToolResult {
  toolCallId: string;
  name: string;
  result: any;
  error?: string;
}

// A single step in the agentic loop
export interface AgentStep {
  type: 'tool_call' | 'tool_result' | 'text';
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  text?: string;
  timestamp: number;
}

// Full response from agentic run
export interface AgentResponse<T = any> {
  finalResponse: T;
  steps: AgentStep[];
  totalToolCalls: number;
}

const isTestEnv = process.env.NODE_ENV === "test";
const logInfo = (...args: unknown[]) => {
  if (!isTestEnv) {
    console.log(...args);
  }
};
const logWarn = (...args: unknown[]) => {
  if (!isTestEnv) {
    console.warn(...args);
  }
};
const logError = (...args: unknown[]) => {
  if (!isTestEnv) {
    console.error(...args);
  }
};

export interface GeminiConfig {
  apiKey: string;
  timeout?: number; // Timeout in milliseconds
  maxRetries?: number;
  requestDelay?: number; // Delay between requests to avoid rate limits
}

export class GeminiAdapter implements LLMAdapter {
  private genAI: GoogleGenAI;
  private timeout: number;
  private maxRetries: number;
  private requestDelay: number;

  constructor(config: string | GeminiConfig) {
    if (typeof config === 'string') {
      // Backwards compatibility
      this.genAI = new GoogleGenAI({ apiKey: config });
      this.timeout = 120000; // 2 minutes default for complex extractions
      this.maxRetries = 3;
      this.requestDelay = 1000; // 1 second delay
    } else {
      this.genAI = new GoogleGenAI({ apiKey: config.apiKey });
      this.timeout = config.timeout ?? 120000;
      this.maxRetries = config.maxRetries ?? 3;
      this.requestDelay = config.requestDelay ?? 1000;
    }
  }

  async generateStructuredOutput<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options: LLMOptions = {}
  ): Promise<T> {
    const modelName = this.selectModel(options.modelPreference);
    logInfo(`🤖 Using model: ${modelName}`);

    // Convert Zod schema to Google GenAI schema format
    const responseSchema = this.zodToGoogleSchema(schema);

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logInfo(`📤 Sending request to Gemini API... (attempt ${attempt}/${this.maxRetries})`);
        
        // Add delay between requests to avoid rate limits
        if (attempt > 1) {
          await this.sleep(this.requestDelay * attempt);
        }

        const response = await this.withTimeout(
          this.genAI.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: responseSchema,
              temperature: options.temperature ?? 0.3,
              maxOutputTokens: options.maxTokens ?? 60000,
            },
          }),
          this.timeout
        );

      logInfo("📥 Received response from Gemini API");
      logInfo("🔍 Response structure:", JSON.stringify(response, null, 2));

      // Check if response was truncated due to MAX_TOKENS
      const finishReason = response.candidates?.[0]?.finishReason;
      if (finishReason === "MAX_TOKENS") {
        logWarn(
          "⚠️ Response truncated due to MAX_TOKENS, retrying with higher limit..."
        );

        // Retry with higher token limit
        const retryResponse = await this.genAI.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            temperature: options.temperature ?? 0.3,
            maxOutputTokens: 60000, // Max tokens for retry
          },
        });

        const retryText =
          retryResponse.text ||
          retryResponse.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!retryText) {
          logError("❌ Retry response structure:", retryResponse);
          throw new Error("No text response from Gemini API after retry");
        }

        logInfo("✅ Retry successful");
        const parsed = JSON.parse(retryText);
        return schema.parse(parsed);
      }

      // Check different possible response formats based on modern API
      const text =
        response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        logError("❌ Response structure:", response);
        throw new Error(
          "No text response from Gemini API - check response structure"
        );
      }

      logInfo("📥 Raw Gemini response:", text.substring(0, 200) + "...");

      // Parse JSON response
      const parsed = JSON.parse(text);

        // Validate with Zod for extra safety
        const validated = schema.parse(parsed);
        logInfo("✅ Response validated successfully");

        return validated;
        
      } catch (error: any) {
        logError(`❌ Gemini API error (attempt ${attempt}/${this.maxRetries}):`, error);
        
        // If this is the last attempt, throw the error
        if (attempt === this.maxRetries) {
          throw error;
        }
        
        // Log that we're retrying
        logInfo(`🔄 Retrying in ${this.requestDelay * attempt}ms...`);
      }
    }
    
    // This should never be reached, but TypeScript requires it
    throw new Error('Unexpected error in Gemini API call');
  }

  async generateText(
    prompt: string,
    options: LLMOptions = {}
  ): Promise<string> {
    const modelName = this.selectModel(options.modelPreference);

    const response = await this.genAI.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 60000,
      },
    });

    const text =
      response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      logError("❌ Response structure:", response);
      throw new Error(
        "No text response from Gemini API - check response structure"
      );
    }

    return text;
  }

  /**
   * Run an agentic loop with function calling
   * The model can call tools multiple times before returning a final structured response
   */
  async runWithTools<T>(
    systemPrompt: string,
    userMessage: string,
    tools: ToolDefinition[],
    executeToolFn: (name: string, args: Record<string, any>) => Promise<any>,
    responseSchema: z.ZodSchema<T>,
    options: LLMOptions & { maxIterations?: number } = {}
  ): Promise<AgentResponse<T>> {
    const modelName = this.selectModel(options.modelPreference);
    const maxIterations = options.maxIterations ?? 10;
    const steps: AgentStep[] = [];
    let totalToolCalls = 0;

    logInfo(`🤖 Starting agentic run with ${tools.length} tools, model: ${modelName}`);

    // Convert tools to Gemini format
    const geminiTools = [{
      functionDeclarations: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: {
          type: Type.OBJECT,
          properties: tool.parameters,
          required: Object.keys(tool.parameters).filter(k => !tool.parameters[k].optional),
        },
      })),
    }];

    // Build conversation history
    const contents: any[] = [
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      logInfo(`📤 Agentic iteration ${iteration + 1}/${maxIterations}`);

      try {
        const response = await this.withTimeout(
          this.genAI.models.generateContent({
            model: modelName,
            systemInstruction: systemPrompt,
            contents,
            config: {
              temperature: options.temperature ?? 0.7,
              maxOutputTokens: options.maxTokens ?? 8000,
            },
            tools: geminiTools,
            toolConfig: {
              functionCallingConfig: {
                mode: FunctionCallingConfigMode.AUTO,
              },
            },
          }),
          this.timeout
        );

        const candidate = response.candidates?.[0];
        if (!candidate?.content?.parts) {
          throw new Error('No response content from Gemini');
        }

        // Check for function calls
        const functionCalls = candidate.content.parts.filter((p: any) => p.functionCall);
        const textParts = candidate.content.parts.filter((p: any) => p.text);

        if (functionCalls.length > 0) {
          // Model wants to call tools
          logInfo(`🔧 Model requested ${functionCalls.length} tool call(s)`);

          // Add assistant's response to history
          contents.push({
            role: 'model',
            parts: candidate.content.parts,
          });

          // Execute each tool call
          const toolResults: any[] = [];
          for (const part of functionCalls) {
            const fc = part.functionCall;
            const toolCallId = `tc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const toolCall: ToolCall = {
              id: toolCallId,
              name: fc.name,
              arguments: fc.args || {},
            };

            steps.push({
              type: 'tool_call',
              toolCall,
              timestamp: Date.now(),
            });

            totalToolCalls++;
            logInfo(`  → Calling tool: ${fc.name}(${JSON.stringify(fc.args)})`);

            try {
              const result = await executeToolFn(fc.name, fc.args || {});

              const toolResult: ToolResult = {
                toolCallId,
                name: fc.name,
                result,
              };

              steps.push({
                type: 'tool_result',
                toolResult,
                timestamp: Date.now(),
              });

              toolResults.push({
                functionResponse: {
                  name: fc.name,
                  response: { result: JSON.stringify(result) },
                },
              });

              logInfo(`  ✓ Tool ${fc.name} returned result`);
            } catch (toolError: any) {
              const toolResult: ToolResult = {
                toolCallId,
                name: fc.name,
                result: null,
                error: toolError.message,
              };

              steps.push({
                type: 'tool_result',
                toolResult,
                timestamp: Date.now(),
              });

              toolResults.push({
                functionResponse: {
                  name: fc.name,
                  response: { error: toolError.message },
                },
              });

              logWarn(`  ✗ Tool ${fc.name} failed: ${toolError.message}`);
            }
          }

          // Add tool results to history
          contents.push({
            role: 'user',
            parts: toolResults,
          });

          // Continue the loop
          continue;
        }

        // No function calls - model is done, get the final text response
        if (textParts.length > 0) {
          const finalText = textParts.map((p: any) => p.text).join('');

          steps.push({
            type: 'text',
            text: finalText,
            timestamp: Date.now(),
          });

          logInfo(`✅ Agentic run complete after ${totalToolCalls} tool calls`);

          // Try to parse as structured response
          try {
            // First try to extract JSON from the response
            const jsonMatch = finalText.match(/```json\n?([\s\S]*?)\n?```/) ||
                             finalText.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
              const jsonStr = jsonMatch[1] || jsonMatch[0];
              const parsed = JSON.parse(jsonStr);
              const validated = responseSchema.parse(parsed);

              return {
                finalResponse: validated,
                steps,
                totalToolCalls,
              };
            }

            // If no JSON, attempt a structured re-generation using tool results
            const toolSummary = steps
              .filter((s) => s.type === 'tool_result' && s.toolResult)
              .map((s) => {
                const tool = s.toolResult?.name;
                const result = s.toolResult?.result;
                return `TOOL ${tool} RESULT:\n${JSON.stringify(result).slice(0, 2000)}`;
              })
              .join('\n\n');

            const fallbackPrompt = `${systemPrompt}\n\n=== USER MESSAGE ===\n${userMessage}\n\n=== TOOL RESULTS ===\n${toolSummary || 'No tool calls were made.'}\n\nReturn ONLY valid JSON matching the schema.`;
            const structuredFallback = await this.generateStructuredOutput(
              fallbackPrompt,
              responseSchema,
              {
                ...options,
                temperature: Math.min(options.temperature ?? 0.7, 0.3),
              }
            );

            return {
              finalResponse: structuredFallback,
              steps,
              totalToolCalls,
            };
          } catch (parseError) {
            logWarn('Could not parse final response as structured, returning raw text');
            // Return with a minimal valid response
            const minimalResponse = responseSchema.parse({
              response: finalText,
              entities: [],
              relationships: [],
              focusedEntities: [],
              operationType: 'elaboration',
              suggestCommit: false,
              themes: [],
              suggestedDirections: [],
            });

            return {
              finalResponse: minimalResponse,
              steps,
              totalToolCalls,
            };
          }
        }

        // No text and no function calls - shouldn't happen
        throw new Error('Model returned neither text nor function calls');

      } catch (error: any) {
        logError(`Agentic iteration ${iteration + 1} failed:`, error);
        throw error;
      }
    }

    throw new Error(`Agentic run exceeded max iterations (${maxIterations})`);
  }

  /**
   * Convert Zod schema to Google GenAI schema format using Type enum
   */
  private zodToGoogleSchema(schema: z.ZodSchema<any>): any {
    return this.zodTypeToGoogleType(schema);
  }

  private zodTypeToGoogleType(schema: z.ZodSchema<any>): any {
    // Handle different Zod types and convert to Google GenAI Type format
    if (schema instanceof z.ZodString) {
      return { type: Type.STRING };
    }

    if (schema instanceof z.ZodNumber) {
      return { type: Type.NUMBER };
    }

    if (schema instanceof z.ZodBoolean) {
      return { type: Type.BOOLEAN };
    }

    if (schema instanceof z.ZodArray) {
      return {
        type: Type.ARRAY,
        items: this.zodTypeToGoogleType(schema.element),
      };
    }

    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const properties: any = {};
      const required: string[] = [];
      const propertyOrdering: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        const fieldSchema = value as z.ZodSchema<any>;
        propertyOrdering.push(key);

        // Check if field is optional
        if (fieldSchema instanceof z.ZodOptional) {
          properties[key] = this.zodTypeToGoogleType(fieldSchema.unwrap());
        } else {
          properties[key] = this.zodTypeToGoogleType(fieldSchema);
          required.push(key);
        }
      }

      return {
        type: Type.OBJECT,
        properties,
        required: required.length > 0 ? required : undefined,
        propertyOrdering,
      };
    }

    if (schema instanceof z.ZodOptional) {
      return this.zodTypeToGoogleType(schema.unwrap());
    }

    if (schema instanceof z.ZodNullable) {
      // Google GenAI doesn't have explicit nullable, so we'll use the inner type
      return this.zodTypeToGoogleType(schema.unwrap());
    }

    if (schema instanceof z.ZodLiteral) {
      const value = schema.value;
      if (typeof value === "string") {
        return { type: Type.STRING, enum: [value] };
      }
      if (typeof value === "number") {
        return { type: Type.NUMBER, enum: [value] };
      }
      if (typeof value === "boolean") {
        return { type: Type.BOOLEAN, enum: [value] };
      }
    }

    if (schema instanceof z.ZodEnum) {
      const values = schema.options;
      return {
        type: Type.STRING,
        enum: values,
      };
    }

    if (schema instanceof z.ZodUnion) {
      // For unions, try to handle common cases
      const options = schema.options;

      // For now, default to the first option (could be enhanced)
      if (options.length > 0) {
        return this.zodTypeToGoogleType(options[0]);
      }
    }

    if (schema instanceof z.ZodRecord) {
      return {
        type: Type.OBJECT,
        // For record types, we'll allow any properties
        additionalProperties: true,
      };
    }

    if (schema instanceof z.ZodDefault) {
      // Handle default values by processing the inner type
      return this.zodTypeToGoogleType(schema._def.innerType);
    }

    // Default fallback
    logWarn("Unknown Zod type, defaulting to string:", schema);
    return { type: Type.STRING };
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timeoutId));
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private selectModel(preference?: "fast" | "smart" | "default"): string {
    // Use centralized model configuration
    const taskMap = {
      fast: "fast" as const,
      smart: "smart" as const,
      default: "default" as const,
    };

    const task = taskMap[preference || "default"];
    return getModelForTask(task);
  }
}

export default GeminiAdapter;

// Re-export types
export type { ToolDefinition, ToolCall, ToolResult, AgentStep, AgentResponse };
