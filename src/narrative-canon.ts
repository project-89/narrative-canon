/**
 * NarrativeCanon - Main entry point for the narrative extraction system
 * Production-focused with Gemini optimization
 */

import { ProductionNarrativePipeline } from "./production-pipeline";
import { NarrativePipeline } from "./pipeline";
import { UnifiedLLMAdapter } from "./llm/adapter";
import { GeminiAdapter } from "./llm/gemini";
import { MockLLM } from "./llm/mock";
import { generateVisualizationHTML } from "./visualization/html-generator";
import type {
  NarrativeStructure,
  Entity,
  Scene,
  Relationship,
  StateChange,
  LLMAdapter,
} from "./types";

export interface NarrativeCanonConfig {
  llm?: "gemini" | "mock";
  apiKey?: string;
  storagePath?: string;
  debug?: boolean;
  useProductionPipeline?: boolean;
  retryAttempts?: number;
  gracefulDegradation?: boolean;
}

export class NarrativeCanon {
  private pipeline: NarrativePipeline | ProductionNarrativePipeline;
  private config: NarrativeCanonConfig;
  private isProductionMode: boolean;

  constructor(config: NarrativeCanonConfig = {}) {
    this.config = {
      llm: "mock",
      storagePath: "./narrative-data",
      debug: false,
      useProductionPipeline: true, // Default to production pipeline
      retryAttempts: 3,
      gracefulDegradation: true,
      ...config,
    };

    this.isProductionMode = this.config.useProductionPipeline ?? true;

    if (this.isProductionMode) {
      // Use production pipeline for better error handling
      this.pipeline = new ProductionNarrativePipeline({
        apiKey: this.config.apiKey,
        debug: this.config.debug,
        retryAttempts: this.config.retryAttempts,
        gracefulDegradation: this.config.gracefulDegradation,
        fallbackToMock: this.config.llm === "mock",
      });
    } else {
      // Use legacy pipeline
      const adapter = this.createAdapter();
      this.pipeline = new NarrativePipeline(adapter);
    }
  }

  /**
   * Extract narrative elements from text
   */
  async extract(text: string): Promise<NarrativeStructure> {
    if (this.config.debug) {
      console.log(
        "🔍 Extracting narrative from text:",
        text.substring(0, 100) + "..."
      );
      console.log(
        `🔧 Using ${this.isProductionMode ? "production" : "legacy"} pipeline`
      );
    }

    const result = await this.pipeline.extractNarrative(text);
    return result;
  }

  /**
   * Get extraction statistics
   */
  getStats(narrative: NarrativeStructure) {
    if (this.isProductionMode && "getStats" in this.pipeline) {
      return (this.pipeline as ProductionNarrativePipeline).getStats(narrative);
    }

    // Fallback stats calculation
    return {
      characters:
        narrative.entities?.filter((e) => e.type === "character").length || 0,
      locations:
        narrative.entities?.filter((e) => e.type === "location").length || 0,
      organizations:
        narrative.entities?.filter((e) => e.type === "organization").length ||
        0,
      scenes: narrative.scenes?.length || 0,
      relationships: narrative.relationships?.length || 0,
      stateChanges: narrative.stateChanges?.length || 0,
      events: narrative.chronology?.events?.length || 0,
      extractionMethod: "unknown",
    };
  }

  /**
   * Health check for the system
   */
  async healthCheck() {
    if (this.isProductionMode && "healthCheck" in this.pipeline) {
      return (this.pipeline as ProductionNarrativePipeline).healthCheck();
    }

    // Basic health check for legacy pipeline
    try {
      const testResult = await this.extract("Test text for health check.");
      return {
        status: "healthy" as const,
        details: {
          legacy: true,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        status: "failed" as const,
        details: {
          error: (error as Error).message,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Generate HTML visualization of a narrative
   */
  async visualize(
    narrative: NarrativeStructure,
    outputPath: string
  ): Promise<void> {
    // Create visualization data from extraction
    const nodes = [
      ...narrative.entities.map((e: Entity, i: number) => ({
        id: e.id,
        label: e.name,
        type: e.type,
        x: i * 100,
        y: 100,
      })),
      ...narrative.scenes.map((s: Scene, i: number) => ({
        id: s.id,
        label: s.description || `Scene ${s.sequence}`,
        type: "scene",
        x: i * 100,
        y: 200,
      })),
    ];

    const edges = narrative.relationships.map((r: Relationship) => ({
      source: r.source,
      target: r.target,
      label: r.type,
    }));

    // Generate HTML
    const html = await generateVisualizationHTML({
      narrative: {
        ...narrative,
        themes: [],
        metadata: {},
      } as any,
      graph: { nodes, edges },
    });

    // Write to file
    const fs = await import("fs");
    fs.writeFileSync(outputPath, html);

    if (this.config.debug) {
      console.log(`📊 Visualization saved to: ${outputPath}`);
    }
  }

  /**
   * Extract from file
   */
  async extractFromFile(filePath: string): Promise<NarrativeStructure> {
    const fs = await import("fs");
    const text = fs.readFileSync(filePath, "utf-8");
    return this.extract(text);
  }

  /**
   * Batch extraction from multiple files
   */
  async extractBatch(
    filePaths: string[]
  ): Promise<Map<string, NarrativeStructure>> {
    const results = new Map<string, NarrativeStructure>();

    for (const filePath of filePaths) {
      try {
        const result = await this.extractFromFile(filePath);
        results.set(filePath, result);
      } catch (error) {
        console.error(`Failed to extract from ${filePath}:`, error);
      }
    }

    return results;
  }

  private createAdapter(): LLMAdapter {
    switch (this.config.llm) {
      case "gemini":
        if (!this.config.apiKey) {
          throw new Error("API key required for Gemini adapter");
        }
        return new GeminiAdapter(this.config.apiKey);

      case "mock":
      default:
        return new MockLLM();
    }
  }
}

/**
 * Convenience function for quick extraction
 */
export async function extractNarrative(
  text: string,
  config?: NarrativeCanonConfig
): Promise<NarrativeStructure> {
  const canon = new NarrativeCanon(config);
  return canon.extract(text);
}

/**
 * Convenience function for file extraction
 */
export async function extractFromFile(
  filePath: string,
  config?: NarrativeCanonConfig
): Promise<NarrativeStructure> {
  const canon = new NarrativeCanon(config);
  return canon.extractFromFile(filePath);
}
