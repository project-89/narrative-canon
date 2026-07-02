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
  /** Map of parameter name → JSON-Schema-style descriptor (type, description, enum, items, ...) */
  parameters: Record<string, any>;
  /** Optional array of parameter names that are STRICTLY required. Anything not
   *  listed here is treated as optional by the model. Default: [] (everything
   *  optional, executor validates). Most tools should leave this empty and let
   *  the executor return clear errors for missing fields — that's far more
   *  permissive for the model than forcing it to provide every param up front. */
  required?: string[];
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

// An image attached to a message for multimodal input. Tools may also return
// images by including `_imageParts: ImagePart[]` on their result; the runner
// strips them out before serializing the tool response and appends them as a
// follow-up user message so the model can actually see them.
export interface ImagePart {
  label: string;        // short human-readable caption
  mimeType: string;     // e.g. 'image/png', 'image/jpeg' — or 'video/mp4': Gemini
                        // understands video natively (motion + the AUDIO track)
  base64Data: string;   // base64-encoded payload (no `data:` prefix)
  /** For video parts only: watch a window of the clip instead of all of it
   *  (e.g. one shot's cut range inside a sequence video). Offsets like '3s'. */
  videoMetadata?: { startOffset?: string; endOffset?: string; fps?: number };
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

/**
 * Normalize a JSON-Schema-ish property block to the format Gemini's API
 * actually accepts:
 *   - Lowercase types ("string", "array", "object", ...) → uppercase Type
 *     enum values ("STRING", "ARRAY", "OBJECT", ...). Gemini silently rejects
 *     properties with invalid type strings, leaving tools effectively
 *     parameter-less.
 *   - Recurses into `items` (for arrays), `properties` (for nested objects),
 *     and any other type-bearing nested schemas.
 *   - Strips a few non-Gemini fields some of our tool defs accidentally
 *     include (e.g. `optional` markers we no longer use).
 */
const SCHEMA_TYPE_MAP: Record<string, string> = {
  string: 'STRING',
  number: 'NUMBER',
  integer: 'INTEGER',
  int: 'INTEGER',
  boolean: 'BOOLEAN',
  bool: 'BOOLEAN',
  array: 'ARRAY',
  object: 'OBJECT',
  null: 'NULL',
};

function normalizeSchemaType(type: any): any {
  if (typeof type !== 'string') return type;
  const lower = type.toLowerCase();
  return SCHEMA_TYPE_MAP[lower] || type.toUpperCase();
}

function normalizeSchemaNode(node: any): any {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(normalizeSchemaNode);
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'optional') continue; // strip our convention; required is set at parent level
    if (k === 'type') {
      out[k] = normalizeSchemaType(v);
    } else if (k === 'items') {
      out[k] = normalizeSchemaNode(v);
    } else if (k === 'properties' && v && typeof v === 'object') {
      const props: Record<string, any> = {};
      for (const [pk, pv] of Object.entries(v as Record<string, any>)) {
        props[pk] = normalizeSchemaNode(pv);
      }
      out[k] = props;
    } else if (Array.isArray(v) || (v && typeof v === 'object')) {
      out[k] = normalizeSchemaNode(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function normalizeSchemaProperties(parameters: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [name, schema] of Object.entries(parameters)) {
    out[name] = normalizeSchemaNode(schema);
  }
  return out;
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
    options: LLMOptions & {
      maxIterations?: number;
      imageContext?: ImagePart[];
      /**
       * Optional callback fired the moment each step happens (tool_call,
       * tool_result, or text). Used by SSE streaming to push events to the
       * client live as the agent is working, instead of waiting for the
       * whole loop to complete. Step's `toolResult.result._imageParts` has
       * already been stripped by the time onStep fires for tool_result, so
       * the callback receives the same shape the final return does.
       */
      onStep?: (step: AgentStep) => void;
    } = {}
  ): Promise<AgentResponse<T>> {
    const modelName = this.selectModel(options.modelPreference);
    const maxIterations = options.maxIterations ?? 10;
    const steps: AgentStep[] = [];
    let totalToolCalls = 0;

    logInfo(`🤖 Starting agentic run with ${tools.length} tools, model: ${modelName}`);

    // Convert tools to Gemini format. Two things our tool definitions get
    // wrong that we have to fix here:
    //  1. Types are lowercase ("string", "array") but Gemini expects the Type
    //     enum values ("STRING", "ARRAY"). We normalize.
    //  2. We never set `optional: true` anywhere, so the previous
    //     `!tool.parameters[k].optional` filter marked EVERY param required —
    //     making tools effectively uncallable. We default required to [] and
    //     let executors validate (they all return clear errors for missing
    //     fields, so the model can retry).
    const geminiTools = [{
      functionDeclarations: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: {
          type: Type.OBJECT,
          properties: normalizeSchemaProperties(tool.parameters),
          required: Array.isArray(tool.required) ? tool.required : [],
        },
      })),
    }];

    // Always log the full list of tool names so we can verify nothing is being
    // silently dropped between our definition and what Gemini sees.
    const allToolNames = geminiTools[0].functionDeclarations.map((d: any) => d.name);
    logInfo(`🛠️  All ${allToolNames.length} tools sent to Gemini:`);
    logInfo(`   ${allToolNames.join(', ')}`);

    if (process.env.NARRATIVE_DEBUG_TOOLS === 'true') {
      // Dump full schemas for the visual tools — these are the ones the model
      // keeps claiming it doesn't have.
      const visualToolNames = new Set([
        'generate_portrait', 'edit_image', 'change_camera_angle',
        'generate_scene_image', 'generate_frame_image',
      ]);
      const visualDecls = geminiTools[0].functionDeclarations.filter((d: any) => visualToolNames.has(d.name));
      logInfo(`🔍 Visual tool declarations (${visualDecls.length} of ${visualToolNames.size} expected):`);
      logInfo(JSON.stringify(visualDecls, null, 2));
    }

    // Convert response schema to Gemini's schema format. Gemini 2.0+ supports
    // combining tools with structured output: tool calls happen as intermediate
    // steps and the final response is forced to match the schema. This is the
    // "Direct Combination" pattern from Google's docs and replaces our previous
    // approach of hoping the model produced JSON-shaped text.
    const googleResponseSchema = this.zodToGoogleSchema(responseSchema);

    // Build conversation history. If image context was supplied, attach the
    // images to the initial user message as inlineData parts so the model can
    // actually see what the user is looking at.
    const initialParts: any[] = [];
    const imageContext = options.imageContext || [];
    if (imageContext.length > 0) {
      initialParts.push({
        text: `[Visual context attached below. These are the images the user is currently looking at — actually look at them, they are not just text URLs.]`,
      });
      for (const img of imageContext) {
        initialParts.push({ text: img.label });
        initialParts.push({
          inlineData: { mimeType: img.mimeType, data: img.base64Data },
          ...(img.videoMetadata ? { videoMetadata: img.videoMetadata } : {}),
        });
      }
      initialParts.push({ text: `\n--- User message ---\n${userMessage}` });
      logInfo(`🖼️  Attached ${imageContext.length} image(s) to initial turn`);
    } else {
      initialParts.push({ text: userMessage });
    }

    const contents: any[] = [
      { role: 'user', parts: initialParts },
    ];

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      logInfo(`📤 Agentic iteration ${iteration + 1}/${maxIterations}`);

      try {
        const response = await this.withTimeout(
          this.genAI.models.generateContent({
            // GenerateContentParameters has ONLY model, contents, config.
            // systemInstruction, tools, and toolConfig MUST go inside config —
            // putting them at the top level silently drops them on the floor.
            // This was the root cause of every "model refuses to call tools /
            // doesn't see system prompt" symptom we chased.
            model: modelName,
            contents,
            config: {
              systemInstruction: systemPrompt,
              temperature: options.temperature ?? 0.7,
              maxOutputTokens: options.maxTokens ?? 8000,
              tools: geminiTools,
              toolConfig: {
                functionCallingConfig: {
                  mode: FunctionCallingConfigMode.AUTO,
                },
              },
              // NOTE: deliberately NOT passing responseSchema or responseMimeType
              // here. Combining tools + responseSchema biases gemini-3.x preview
              // models toward the schema route and away from tool calls. The
              // post-loop structured-output call enforces the response shape.
            },
          }),
          this.timeout
        );

        const candidate = response.candidates?.[0];
        if (!candidate?.content?.parts) {
          throw new Error('No response content from Gemini');
        }

        // Check for function calls (both camelCase and snake_case just in case)
        const functionCalls = candidate.content.parts.filter((p: any) => p.functionCall || p.function_call);
        const textParts = candidate.content.parts.filter((p: any) => p.text);

        if (process.env.NARRATIVE_DEBUG_TOOLS === 'true' && functionCalls.length === 0) {
          // Model returned no function calls — dump the raw parts so we can see
          // what it actually emitted (text, alternate function-call shape, etc).
          logInfo(`🔍 [iter ${iteration + 1}] Raw response parts (no function calls detected):`);
          logInfo(JSON.stringify(candidate.content.parts, null, 2).slice(0, 4000));
          // Also dump finish reason / safety ratings — sometimes tools get
          // suppressed by safety or quota.
          logInfo(`   finishReason: ${candidate.finishReason}`);
          if (candidate.safetyRatings) logInfo(`   safetyRatings: ${JSON.stringify(candidate.safetyRatings)}`);
        }

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
          const followUpImageParts: any[] = [];
          for (const part of functionCalls) {
            const fc = part.functionCall;
            const toolCallId = `tc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const toolCall: ToolCall = {
              id: toolCallId,
              name: fc.name,
              arguments: fc.args || {},
            };

            const callStep: AgentStep = {
              type: 'tool_call',
              toolCall,
              timestamp: Date.now(),
            };
            steps.push(callStep);
            options.onStep?.(callStep);

            totalToolCalls++;
            logInfo(`  → Calling tool: ${fc.name}(${JSON.stringify(fc.args)})`);

            try {
              const result = await executeToolFn(fc.name, fc.args || {});

              // Pull off any image parts the tool returned. They cannot fit in
              // a functionResponse payload, so we strip them out, send the rest
              // as the JSON tool response, and queue the images for a follow-up
              // user message before the next model turn.
              let toolImages: ImagePart[] | null = null;
              if (result && Array.isArray(result._imageParts) && result._imageParts.length > 0) {
                toolImages = result._imageParts as ImagePart[];
                delete result._imageParts;
              }

              const toolResult: ToolResult = {
                toolCallId,
                name: fc.name,
                result,
              };

              const resultStep: AgentStep = {
                type: 'tool_result',
                toolResult,
                timestamp: Date.now(),
              };
              steps.push(resultStep);
              options.onStep?.(resultStep);

              toolResults.push({
                functionResponse: {
                  name: fc.name,
                  response: { result: JSON.stringify(result) },
                },
              });

              if (toolImages) {
                const hasVideo = toolImages.some((im) => im.mimeType.startsWith('video/'));
                followUpImageParts.push({
                  text: `[Media returned by ${fc.name} — actually ${hasVideo ? 'WATCH the video (motion AND audio)' : 'look at them'}, don't just read the URLs.]`,
                });
                for (const img of toolImages) {
                  followUpImageParts.push({ text: img.label });
                  followUpImageParts.push({
                    inlineData: { mimeType: img.mimeType, data: img.base64Data },
                    ...(img.videoMetadata ? { videoMetadata: img.videoMetadata } : {}),
                  });
                }
              }

              logInfo(`  ✓ Tool ${fc.name} returned result${toolImages ? ` (+ ${toolImages.length} image(s))` : ''}`);
            } catch (toolError: any) {
              const toolResult: ToolResult = {
                toolCallId,
                name: fc.name,
                result: null,
                error: toolError.message,
              };

              const errResultStep: AgentStep = {
                type: 'tool_result',
                toolResult,
                timestamp: Date.now(),
              };
              steps.push(errResultStep);
              options.onStep?.(errResultStep);

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

          // If any tool returned images, attach them as a follow-up user
          // message so the model can actually look at them on the next turn.
          if (followUpImageParts.length > 0) {
            contents.push({
              role: 'user',
              parts: followUpImageParts,
            });
          }

          // Continue the loop
          continue;
        }

        // No function calls - model is done, get the final text response
        if (textParts.length > 0) {
          const finalText = textParts.map((p: any) => p.text).join('');

          const textStep: AgentStep = {
            type: 'text',
            text: finalText,
            timestamp: Date.now(),
          };
          steps.push(textStep);
          options.onStep?.(textStep);

          logInfo(`✅ Agentic run complete after ${totalToolCalls} tool calls`);

          // The agentic loop ran without a responseSchema constraint so the
          // model could call tools freely. Now we need to coerce the final
          // text into our structured shape. Try fast-path first (model often
          // emits JSON because the system prompt asks for it), then fall back
          // to a separate structured-output call.
          const fastJsonMatch = finalText.match(/```json\n?([\s\S]*?)\n?```/) || finalText.match(/^\s*(\{[\s\S]*\})\s*$/);
          if (fastJsonMatch) {
            try {
              const parsed = JSON.parse(fastJsonMatch[1] || fastJsonMatch[0]);
              const validated = responseSchema.parse(parsed);
              return { finalResponse: validated, steps, totalToolCalls };
            } catch {
              // Fall through to structured re-call
            }
          }

          // Fallback: a separate generateStructuredOutput call that converts
          // the agent's final text + tool history into the structured shape.
          // This is the Multi-Turn Execution pattern from Google's docs.
          try {
            const toolSummary = steps
              .filter((s) => s.type === 'tool_result' && s.toolResult)
              .map((s) => {
                const tool = s.toolResult?.name;
                const result = s.toolResult?.result;
                const compact = JSON.stringify(result).slice(0, 600);
                return `Tool ${tool}: ${compact}`;
              })
              .join('\n');

            const finalizePrompt = `${systemPrompt}\n\n=== USER MESSAGE ===\n${userMessage}\n\n=== TOOLS CALLED THIS TURN ===\n${toolSummary || '(none)'}\n\n=== AGENT'S FINAL PROSE ===\n${finalText}\n\nReturn ONLY a JSON object matching the schema. Use the agent's prose as the "response" field. Set focusedEntities, themes, etc. based on what was discussed.`;
            const structuredFinalize = await this.generateStructuredOutput(
              finalizePrompt,
              responseSchema,
              { ...options, temperature: 0.2 }
            );
            return { finalResponse: structuredFinalize, steps, totalToolCalls };
          } catch (parseError) {
            // Last resort: minimal response with raw text in `response` field.
            logWarn('Structured finalize failed; returning minimal:', parseError);
            const minimalResponse = responseSchema.parse({
              response: finalText,
              focusedEntities: [],
              operationType: 'elaboration',
              suggestCommit: false,
            });
            return { finalResponse: minimalResponse, steps, totalToolCalls };
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
