/**
 * Chunked Extraction Pipeline
 *
 * Handles book-length narratives by splitting into manageable chunks,
 * extracting incrementally, and maintaining entity coherence across chunks.
 *
 * Designed for extracting from texts like Lord of the Rings.
 */

import { NarrativePipeline } from './pipeline';
import { LLMAdapter, NarrativeStructure, Entity, Relationship, Scene, StateChange } from './types';
import { EntitySimilarityDetector } from './core/entity-similarity';

export interface ChunkingOptions {
  /** Maximum characters per chunk (default: 8000) */
  maxChunkSize?: number;
  /** Overlap between chunks in characters (default: 500) */
  overlapSize?: number;
  /** Prefer splitting at chapter boundaries */
  respectChapters?: boolean;
  /** Prefer splitting at paragraph boundaries */
  respectParagraphs?: boolean;
  /** Progress callback */
  onProgress?: (progress: ChunkProgress) => void;
}

export interface ChunkProgress {
  currentChunk: number;
  totalChunks: number;
  chunkText: string;
  entitiesExtracted: number;
  scenesExtracted: number;
  percentComplete: number;
}

export interface ChunkResult {
  chunkIndex: number;
  structure: NarrativeStructure;
  processingTimeMs: number;
}

export interface BookExtractionResult {
  /** Combined narrative structure */
  structure: NarrativeStructure;
  /** Results from each chunk */
  chunks: ChunkResult[];
  /** Total processing time */
  totalTimeMs: number;
  /** Deduplication statistics */
  deduplicationStats: {
    entitiesBeforeDedup: number;
    entitiesAfterDedup: number;
    mergedCount: number;
  };
}

export class ChunkedExtractionPipeline {
  private pipeline: NarrativePipeline;
  private entitySimilarityDetector: EntitySimilarityDetector;
  private options: Required<ChunkingOptions>;

  constructor(llmAdapter: LLMAdapter, options: ChunkingOptions = {}) {
    this.pipeline = new NarrativePipeline(llmAdapter);
    this.entitySimilarityDetector = new EntitySimilarityDetector();
    this.options = {
      maxChunkSize: options.maxChunkSize ?? 8000,
      overlapSize: options.overlapSize ?? 500,
      respectChapters: options.respectChapters ?? true,
      respectParagraphs: options.respectParagraphs ?? true,
      onProgress: options.onProgress ?? (() => {}),
    };
  }

  /**
   * Extract narrative from a full book-length text
   */
  async extractFromBook(text: string): Promise<BookExtractionResult> {
    const startTime = Date.now();
    const chunks = this.splitIntoChunks(text);
    const chunkResults: ChunkResult[] = [];

    let accumulatedStructure: NarrativeStructure = {
      entities: [],
      scenes: [],
      relationships: [],
      stateChanges: [],
      interactions: [],
      chronology: { events: [], timeline: [] },
      themes: [],
      metadata: { source: 'book-extraction' }
    };

    console.log(`📚 Starting book extraction: ${chunks.length} chunks`);
    console.log(`📊 Text length: ${text.length} characters`);

    for (let i = 0; i < chunks.length; i++) {
      const chunkStart = Date.now();
      const chunk = chunks[i];

      console.log(`\n📖 Processing chunk ${i + 1}/${chunks.length} (${chunk.length} chars)...`);

      try {
        // Use incremental extraction to maintain coherence
        const chunkStructure = await this.pipeline.extractNarrativeIncremental(
          chunk,
          accumulatedStructure
        );

        // Merge into accumulated structure
        accumulatedStructure = this.mergeStructures(accumulatedStructure, chunkStructure);

        const processingTime = Date.now() - chunkStart;
        chunkResults.push({
          chunkIndex: i,
          structure: chunkStructure,
          processingTimeMs: processingTime
        });

        // Report progress
        this.options.onProgress({
          currentChunk: i + 1,
          totalChunks: chunks.length,
          chunkText: chunk.substring(0, 100) + '...',
          entitiesExtracted: accumulatedStructure.entities.length,
          scenesExtracted: accumulatedStructure.scenes.length,
          percentComplete: ((i + 1) / chunks.length) * 100
        });

        console.log(`✅ Chunk ${i + 1} complete: ${chunkStructure.entities.length} new entities, ${chunkStructure.scenes.length} scenes`);
        console.log(`   Total entities so far: ${accumulatedStructure.entities.length}`);

      } catch (error) {
        console.error(`❌ Error processing chunk ${i + 1}:`, error);
        // Continue with other chunks even if one fails
      }
    }

    // Final deduplication pass
    const entitiesBeforeDedup = accumulatedStructure.entities.length;
    accumulatedStructure = await this.finalDeduplication(accumulatedStructure);
    const entitiesAfterDedup = accumulatedStructure.entities.length;

    // Rebuild chronology with all data
    accumulatedStructure.chronology = this.buildCompleteChronology(accumulatedStructure);

    const totalTime = Date.now() - startTime;

    console.log(`\n🎉 Book extraction complete!`);
    console.log(`   Total time: ${(totalTime / 1000 / 60).toFixed(1)} minutes`);
    console.log(`   Entities: ${entitiesAfterDedup} (${entitiesBeforeDedup - entitiesAfterDedup} merged)`);
    console.log(`   Scenes: ${accumulatedStructure.scenes.length}`);
    console.log(`   Relationships: ${accumulatedStructure.relationships.length}`);

    return {
      structure: accumulatedStructure,
      chunks: chunkResults,
      totalTimeMs: totalTime,
      deduplicationStats: {
        entitiesBeforeDedup,
        entitiesAfterDedup,
        mergedCount: entitiesBeforeDedup - entitiesAfterDedup
      }
    };
  }

  /**
   * Split text into manageable chunks
   */
  private splitIntoChunks(text: string): string[] {
    const chunks: string[] = [];
    const { maxChunkSize, overlapSize, respectChapters, respectParagraphs } = this.options;

    // Try to split by chapters first
    if (respectChapters) {
      const chapterPatterns = [
        /\n\s*CHAPTER\s+\d+/gi,
        /\n\s*Chapter\s+\d+/g,
        /\n\s*BOOK\s+\d+/gi,
        /\n\s*Part\s+\d+/gi,
        /\n\s*#{1,3}\s+Chapter/gi
      ];

      for (const pattern of chapterPatterns) {
        const matches = text.split(pattern);
        if (matches.length > 1) {
          // Found chapter markers
          let currentChunk = '';
          for (const section of matches) {
            if (currentChunk.length + section.length <= maxChunkSize) {
              currentChunk += section;
            } else {
              if (currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
              }
              // If section is too long, split by paragraphs
              if (section.length > maxChunkSize) {
                chunks.push(...this.splitByParagraphs(section, maxChunkSize, overlapSize));
                currentChunk = '';
              } else {
                currentChunk = section;
              }
            }
          }
          if (currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
          }
          return chunks.filter(c => c.length > 0);
        }
      }
    }

    // Fall back to paragraph-based splitting
    if (respectParagraphs) {
      return this.splitByParagraphs(text, maxChunkSize, overlapSize);
    }

    // Fall back to simple character-based splitting with overlap
    return this.splitByCharacters(text, maxChunkSize, overlapSize);
  }

  private splitByParagraphs(text: string, maxSize: number, overlap: number): string[] {
    const paragraphs = text.split(/\n\s*\n/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const para of paragraphs) {
      if (currentChunk.length + para.length + 2 <= maxSize) {
        currentChunk += (currentChunk ? '\n\n' : '') + para;
      } else {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          // Add overlap from end of current chunk
          const overlapText = currentChunk.slice(-overlap);
          currentChunk = overlapText + '\n\n' + para;
        } else {
          // Paragraph itself is too long, split by sentences
          chunks.push(...this.splitBySentences(para, maxSize, overlap));
          currentChunk = '';
        }
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter(c => c.length > 0);
  }

  private splitBySentences(text: string, maxSize: number, overlap: number): string[] {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length <= maxSize) {
        currentChunk += sentence;
      } else {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private splitByCharacters(text: string, maxSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + maxSize, text.length);
      chunks.push(text.slice(start, end));
      start = end - overlap;
    }

    return chunks;
  }

  /**
   * Merge two narrative structures
   */
  private mergeStructures(base: NarrativeStructure, addition: NarrativeStructure): NarrativeStructure {
    // Avoid adding duplicate entities (by ID)
    const existingEntityIds = new Set(base.entities.map(e => e.id));
    const newEntities = addition.entities.filter(e => !existingEntityIds.has(e.id));

    // Avoid adding duplicate relationships (by source-target-type)
    const existingRelKeys = new Set(base.relationships.map(r => `${r.source}-${r.target}-${r.type}`));
    const newRelationships = addition.relationships.filter(
      r => !existingRelKeys.has(`${r.source}-${r.target}-${r.type}`)
    );

    // Scenes get appended with sequential numbering
    const nextSequence = Math.max(0, ...base.scenes.map(s => s.sequence)) + 1;
    const renumberedScenes = addition.scenes.map((s, i) => ({
      ...s,
      sequence: nextSequence + i
    }));

    return {
      entities: [...base.entities, ...newEntities],
      scenes: [...base.scenes, ...renumberedScenes],
      relationships: [...base.relationships, ...newRelationships],
      stateChanges: [...base.stateChanges, ...addition.stateChanges],
      interactions: [...(base.interactions || []), ...(addition.interactions || [])],
      chronology: base.chronology, // Will rebuild at end
      themes: [...new Set([...base.themes, ...addition.themes])],
      metadata: {
        ...base.metadata,
        chunksProcessed: (base.metadata.chunksProcessed || 0) + 1
      }
    };
  }

  /**
   * Final deduplication pass across all chunks
   */
  private async finalDeduplication(structure: NarrativeStructure): Promise<NarrativeStructure> {
    console.log('🔗 Running final entity deduplication...');

    const entityData = structure.entities.map(entity => ({
      entityId: entity.id,
      name: entity.name,
      aliases: entity.aliases || [],
      type: entity.type
    }));

    const clusters = this.entitySimilarityDetector.clusterSimilarEntities(entityData);
    const deduplicatedEntities: Entity[] = [];
    const entityIdMapping: Map<string, string> = new Map();

    for (const cluster of clusters) {
      if (cluster.entities.length === 1) {
        const entity = structure.entities.find(e => e.id === cluster.entities[0].entityId);
        if (entity) {
          deduplicatedEntities.push(entity);
          entityIdMapping.set(entity.id, entity.id);
        }
      } else {
        // Merge cluster
        const clusterEntities = cluster.entities
          .map(ce => structure.entities.find(e => e.id === ce.entityId))
          .filter((e): e is Entity => e !== undefined);

        const merged = this.mergeEntityCluster(cluster.canonicalName, clusterEntities);
        deduplicatedEntities.push(merged);

        // Map all old IDs to new merged ID
        for (const ce of cluster.entities) {
          entityIdMapping.set(ce.entityId, merged.id);
        }

        console.log(`   Merged: ${clusterEntities.map(e => e.name).join(', ')} → ${merged.name}`);
      }
    }

    // Update relationships to use new entity IDs
    const updatedRelationships = structure.relationships.map(rel => ({
      ...rel,
      source: entityIdMapping.get(rel.source) || rel.source,
      target: entityIdMapping.get(rel.target) || rel.target
    }));

    // Update scenes to use new entity IDs
    const updatedScenes = structure.scenes.map(scene => ({
      ...scene,
      characters: scene.characters.map(c => entityIdMapping.get(c) || c)
    }));

    return {
      ...structure,
      entities: deduplicatedEntities,
      relationships: updatedRelationships,
      scenes: updatedScenes,
      metadata: {
        ...structure.metadata,
        finalDeduplicationApplied: true,
        entityMappings: Object.fromEntries(entityIdMapping)
      }
    };
  }

  private mergeEntityCluster(canonicalName: string, entities: Entity[]): Entity {
    const primary = entities[0];

    return {
      ...primary,
      id: primary.id,
      name: canonicalName,
      aliases: [
        ...new Set([
          ...entities.flatMap(e => [e.name, ...(e.aliases || [])])
        ])
      ].filter(a => a !== canonicalName),
      description: entities
        .map(e => e.description)
        .filter(d => d)
        .sort((a, b) => b.length - a.length)[0] || '',
      metadata: {
        mergedFrom: entities.map(e => e.id),
        mergedAt: new Date().toISOString()
      }
    };
  }

  private buildCompleteChronology(structure: NarrativeStructure): NarrativeStructure['chronology'] {
    const events = structure.scenes.map(scene => ({
      id: scene.id,
      sequence: scene.sequence,
      sceneId: scene.id,
      description: scene.title || scene.description,
      participants: scene.characters,
      type: 'scene'
    }));

    return {
      events: events.sort((a, b) => a.sequence - b.sequence),
      timeline: events.map(e => e.id)
    };
  }
}

export default ChunkedExtractionPipeline;
