/**
 * PRODUCTION-FOCUSED NARRATIVE PIPELINE
 * 
 * Error-resilient pipeline optimized for Gemini API production use
 * with graceful degradation and comprehensive error handling.
 */

import { NarrativePipeline } from './pipeline';
import { GeminiAdapter } from './llm/gemini';
import { MockLLM } from './llm/mock';
import { LLMAdapter, NarrativeStructure } from './types';

export interface ProductionPipelineConfig {
  apiKey?: string;
  debug?: boolean;
  retryAttempts?: number;
  gracefulDegradation?: boolean;
  fallbackToMock?: boolean;
  useEnhancedExtractors?: boolean;
}

export class ProductionNarrativePipeline {
  private pipeline: NarrativePipeline;
  private config: Required<ProductionPipelineConfig>;
  private adapter: LLMAdapter;

  constructor(config: ProductionPipelineConfig = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || '',
      debug: config.debug ?? false,
      retryAttempts: config.retryAttempts ?? 3,
      gracefulDegradation: config.gracefulDegradation ?? true,
      fallbackToMock: config.fallbackToMock ?? false,
      useEnhancedExtractors: config.useEnhancedExtractors ?? true
    };

    this.adapter = this.createAdapter();
    this.pipeline = new NarrativePipeline(this.adapter, this.config.useEnhancedExtractors);
  }

  private createAdapter(): LLMAdapter {
    if (this.config.apiKey) {
      if (this.config.debug) {
        console.log('🔮 Initializing Gemini production adapter...');
      }
      return new GeminiAdapter(this.config.apiKey);
    } else if (this.config.fallbackToMock) {
      if (this.config.debug) {
        console.log('⚠️ No API key found, falling back to Mock LLM...');
      }
      return new MockLLM();
    } else {
      throw new Error('No Gemini API key provided and fallback to Mock LLM is disabled');
    }
  }

  async extractNarrative(text: string): Promise<NarrativeStructure> {
    if (this.config.debug) {
      console.log('📖 Starting production narrative extraction...');
      console.log(`🔧 Configuration: retries=${this.config.retryAttempts}, graceful=${this.config.gracefulDegradation}`);
    }

    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        if (this.config.debug && attempt > 1) {
          console.log(`🔄 Retry attempt ${attempt}/${this.config.retryAttempts}`);
        }

        const result = await this.pipeline.extractNarrative(text);
        
        if (this.config.debug) {
          console.log('✅ Extraction completed successfully');
        }
        
        return result;

      } catch (error) {
        lastError = error as Error;
        
        if (this.config.debug) {
          console.log(`❌ Attempt ${attempt} failed:`, (error as Error).message);
        }

        // Check if it's a retryable error
        if (this.isRetryableError(error as Error)) {
          if (attempt < this.config.retryAttempts) {
            const delay = this.calculateRetryDelay(attempt);
            if (this.config.debug) {
              console.log(`⏰ Waiting ${delay}ms before retry...`);
            }
            await this.sleep(delay);
            continue;
          }
        } else {
          // Non-retryable error, fail immediately
          break;
        }
      }
    }

    // All retries failed
    if (this.config.gracefulDegradation) {
      if (this.config.debug) {
        console.log('🛡️ Applying graceful degradation...');
      }
      return this.createGracefulFallback(text, lastError);
    } else {
      throw lastError || new Error('Extraction failed after all retries');
    }
  }

  private isRetryableError(error: Error): boolean {
    const retryablePatterns = [
      'quota exceeded',
      'rate limit',
      'timeout',
      'network error',
      'temporary',
      'service unavailable',
      '503',
      '429'
    ];

    const errorMessage = error.message.toLowerCase();
    return retryablePatterns.some(pattern => errorMessage.includes(pattern));
  }

  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff with jitter
    const baseDelay = 1000; // 1 second
    const exponential = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000; // 0-1 second jitter
    return Math.min(exponential + jitter, 30000); // Max 30 seconds
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private createGracefulFallback(text: string, error: Error | null): NarrativeStructure {
    if (this.config.debug) {
      console.log('🚨 Creating graceful fallback response...');
    }

    // Basic text analysis for fallback
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/);
    
    // Simple entity detection using heuristics
    const entities = this.extractSimpleEntities(text);
    
    // Create minimal viable narrative structure
    const fallback: NarrativeStructure = {
      entities: entities,
      scenes: [{
        id: 'scene_1',
        title: 'Extracted Scene',
        sequence: 1,
        location: this.detectLocation(text),
        characters: entities.filter(e => e.type === 'character').map(e => e.id),
        description: sentences[0] || 'No description available',
        events: [{
          id: 'event_1',
          sequence: 1,
          sceneId: 'scene_1',
          description: sentences[0] || 'Primary event',
          participants: entities.filter(e => e.type === 'character').map(e => e.id),
        }]
      }],
      relationships: [],
      stateChanges: [],
      chronology: {
        events: [{
          id: 'event_1',
          sequence: 1,
          sceneId: 'scene_1',
          description: sentences[0] || 'Primary event',
          participants: entities.filter(e => e.type === 'character').map(e => e.id),
        }],
        timeline: []
      },
      themes: ['extracted'],
      metadata: {
        extractionMethod: 'graceful_fallback',
        error: error?.message || 'Unknown error',
        textLength: text.length,
        sentenceCount: sentences.length,
        wordCount: words.length,
        timestamp: new Date().toISOString()
      }
    };

    return fallback;
  }

  private extractSimpleEntities(text: string): any[] {
    const entities = [];
    let entityId = 1;

    // Simple capitalized word detection for character names
    const capitalizedWords = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) || [];
    const uniqueNames = [...new Set(capitalizedWords)];

    // Filter out common non-names
    const commonWords = ['The', 'This', 'That', 'When', 'Where', 'Which', 'While', 'Although', 'However'];
    const possibleNames = uniqueNames.filter(name => 
      !commonWords.includes(name) && 
      name.length > 2 &&
      text.split(name).length > 2 // Appears multiple times
    );

    possibleNames.slice(0, 5).forEach(name => {
      entities.push({
        id: `entity_${entityId++}`,
        name: name,
        type: 'character',
        description: `Detected character: ${name}`
      });
    });

    // Add at least one entity if none found
    if (entities.length === 0) {
      entities.push({
        id: 'entity_1',
        name: 'Unknown Character',
        type: 'character',
        description: 'Character detected through fallback extraction'
      });
    }

    return entities;
  }

  private detectLocation(text: string): string {
    // Simple location detection
    const locationPatterns = [
      /\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
      /\bat\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
    ];

    for (const pattern of locationPatterns) {
      const matches = [...text.matchAll(pattern)];
      if (matches.length > 0) {
        return matches[0][1];
      }
    }

    return 'Unknown Location';
  }

  // Statistics and health check methods
  getStats(narrative: NarrativeStructure) {
    return {
      characters: narrative.entities.filter(e => e.type === 'character').length,
      locations: narrative.entities.filter(e => e.type === 'location').length,
      organizations: narrative.entities.filter(e => e.type === 'organization').length,
      scenes: narrative.scenes.length,
      relationships: narrative.relationships.length,
      stateChanges: narrative.stateChanges.length,
      events: narrative.chronology.events.length,
      extractionMethod: narrative.metadata?.extractionMethod || 'full_pipeline'
    };
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'failed'; details: any }> {
    try {
      const testText = "Alice met Bob in the forest.";
      const result = await this.extractNarrative(testText);
      const stats = this.getStats(result);
      
      return {
        status: stats.characters > 0 ? 'healthy' : 'degraded',
        details: {
          ...stats,
          apiKey: !!this.config.apiKey,
          adapter: this.config.apiKey ? 'gemini' : 'mock',
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        status: 'failed',
        details: {
          error: (error as Error).message,
          timestamp: new Date().toISOString()
        }
      };
    }
  }
}

export default ProductionNarrativePipeline;