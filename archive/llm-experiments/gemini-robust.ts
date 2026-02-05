import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { LLMAdapter, LLMOptions } from "../types";

/**
 * Robust Gemini adapter that handles format mismatches
 */
export class RobustGeminiAdapter implements LLMAdapter {
  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
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

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 8192,
        responseMimeType: "application/json",
      },
    });

    const response = result.response;
    const text = response.text();

    try {
      const parsed = JSON.parse(text);

      // Pre-process the response to handle common Gemini format issues
      const processed = this.preprocessGeminiResponse(parsed);

      return schema.parse(processed);
    } catch (error) {
      console.error("Failed to parse Gemini response:", error);
      console.error("Raw response:", text);

      // Try to salvage what we can
      try {
        const salvaged = this.salvageResponse(JSON.parse(text), schema);
        return schema.parse(salvaged);
      } catch (salvageError) {
        throw new Error("Failed to parse structured output from Gemini");
      }
    }
  }

  private preprocessGeminiResponse(data: any): any {
    if (Array.isArray(data)) {
      return data.map((item) => this.preprocessGeminiResponse(item));
    }

    if (data && typeof data === "object") {
      const processed: any = {};

      for (const [key, value] of Object.entries(data)) {
        // Handle arrays where strings are expected
        if (
          Array.isArray(value) &&
          value.length === 1 &&
          typeof value[0] === "string"
        ) {
          processed[key] = value[0];
        }
        // Handle arrays where strings are expected (multiple values)
        else if (
          Array.isArray(value) &&
          key === "location" &&
          value.length > 0
        ) {
          processed[key] = value.join(", ");
        }
        // Handle graphImpact arrays
        else if (
          Array.isArray(value) &&
          key === "graphImpact" &&
          value.length > 0
        ) {
          processed[key] = value[0] || "minor";
        }
        // Handle entity_id -> id conversion
        else if (key === "entity_id") {
          processed.id = value;
        }
        // Handle scene_id -> id conversion
        else if (key === "scene_id") {
          processed.id = value;
        }
        // Handle character name mapping
        else if (key === "character_name" || key === "fullName") {
          processed.name = value;
        }
        // Handle null aliases
        else if (key === "aliases" && (value === null || value === "null")) {
          processed[key] = [];
        }
        // Handle string aliases that should be arrays
        else if (key === "aliases" && typeof value === "string") {
          processed[key] = value
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s && s !== "null");
        }
        // Handle participants/entitiesRemoved/entitiesIntroduced as string -> array
        else if (
          (key === "participants" ||
            key === "entitiesRemoved" ||
            key === "entitiesIntroduced" ||
            key === "presentEntities" ||
            key === "relationshipsFormed" ||
            key === "relationshipsBroken") &&
          typeof value === "string"
        ) {
          // Handle empty or "null" strings
          if (!value || value === "null" || value.trim() === "") {
            processed[key] = [];
          } else {
            // Try to split by comma if it contains multiple items
            const items = value.split(",").map(s => s.trim()).filter(s => s && s !== "null");
            processed[key] = items.length > 0 ? items : [value];
          }
        }
        // Handle array fields that come as single strings
        else if (
          (key === "participants" ||
            key === "entitiesRemoved" ||
            key === "entitiesIntroduced" ||
            key === "presentEntities" ||
            key === "relationshipsFormed" ||
            key === "relationshipsBroken") &&
          !Array.isArray(value) &&
          value !== null &&
          value !== undefined
        ) {
          processed[key] = Array.isArray(value) ? value : [value];
        }
        // Recursively process nested objects and arrays
        else if (value && typeof value === "object") {
          processed[key] = this.preprocessGeminiResponse(value);
        } else {
          processed[key] = value;
        }
      }

      // Special handling for mutations to ensure required fields
      if (processed.mutations && Array.isArray(processed.mutations)) {
        processed.mutations = processed.mutations.map(
          (m: any, index: number) => ({
            timestamp: m.timestamp ?? index * 10,
            type: m.type || m.mutationType || "unknown",
            sceneId: m.sceneId || `scene_${Math.floor(index / 3) + 1}`,
            impact: this.mapImpactLevel(m.impact || m.impactLevel),
            description: m.description || "",
            entityId: m.entityId || m.entities?.[0] || null,
            targetEntityId: m.targetEntityId || m.entities?.[1] || null,
            properties: m.properties || {},
            reversible: m.reversible ?? true,
          })
        );
      }

      return processed;
    }

    return data;
  }

  private salvageResponse(data: any, schema: z.ZodSchema<any>): any {
    // For characters, try to fix the format
    if (data.characters && Array.isArray(data.characters)) {
      const characters = data.characters.map((c: any, index: number) => ({
        id: c.id || c.character_id || `char_${index}`,
        name: c.name || c.character_name || c.fullName || "Unknown",
        description: c.description || "",
        aliases: this.processAliases(c.aliases),
        firstMention: c.firstMention,
        type: "character",
      }));

      return { characters };
    }

    // For mutations, try to convert the Gemini format to our format
    if (data.mutations && Array.isArray(data.mutations)) {
      const mutations = data.mutations.map((m: any, index: number) => ({
        id: `mutation_${index}`,
        timestamp: index + 1,
        type: m.mutationType || "property_changed",
        entityId: m.entities?.[0] || "unknown",
        targetEntityId: m.entities?.[1],
        properties: m.properties || {},
        sceneId: "scene_1",
        description: m.description || "Unknown change",
        impact: this.mapImpactLevel(m.impactLevel),
        reversible: m.mutationType !== "entity_removed",
      }));

      return { mutations };
    }

    return data;
  }

  private processAliases(aliases: any): string[] {
    if (!aliases) return [];
    if (Array.isArray(aliases)) return aliases;
    if (typeof aliases === "string") {
      return aliases
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && s !== "null");
    }
    return [];
  }

  private mapImpactLevel(level: string | undefined): string {
    const mapping: Record<string, string> = {
      high: "major",
      medium: "moderate",
      low: "minor",
      none: "minimal",
    };

    return mapping[level || ""] || "minor";
  }

  async generateText(
    prompt: string,
    options: LLMOptions = {}
  ): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: this.selectModel(options.modelPreference),
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 8192,
      },
    });

    return result.response.text();
  }

  private selectModel(preference?: string): string {
    if (preference === "fast") {
      return "Gemini 2.5 Flash Preview 05-20";
    }
    if (preference === "quality") {
      return "gemini-2.5-pro-preview-05-06";
    }
    // Default to flash for speed
    return "Gemini 2.5 Flash Preview 05-20";
  }
}
