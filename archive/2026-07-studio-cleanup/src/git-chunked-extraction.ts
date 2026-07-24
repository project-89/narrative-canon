/**
 * Git-Integrated Chunked Extraction
 *
 * Extracts narratives from book-length texts and produces a series of
 * git-like commits that build up the narrative graph incrementally.
 *
 * The state of the graph at any point = replay all commits up to that point.
 */

import { NarrativeGit, GitConfig } from './git/narrative-git';
import { GraphOperation, NarrativeCommit } from './git/types';
import { NarrativePipeline } from './pipeline';
import { LLMAdapter, NarrativeStructure, Entity, Relationship, Scene, StateChange } from './types';
import { EntitySimilarityDetector } from './core/entity-similarity';

export interface GitChunkingOptions {
  /** Maximum characters per chunk (default: 8000) */
  maxChunkSize?: number;
  /** Overlap between chunks in characters (default: 500) */
  overlapSize?: number;
  /** Prefer splitting at chapter boundaries */
  respectChapters?: boolean;
  /** Prefer splitting at paragraph boundaries */
  respectParagraphs?: boolean;
  /** Progress callback */
  onProgress?: (progress: GitChunkProgress) => void;
  /** Git configuration */
  gitConfig?: GitConfig;
  /** Commit author name */
  author?: string;
}

export interface GitChunkProgress {
  currentChunk: number;
  totalChunks: number;
  chunkTitle: string;
  commitHash?: string;
  entitiesTotal: number;
  relationshipsTotal: number;
  scenesTotal: number;
  percentComplete: number;
}

export interface GitExtractionResult {
  /** The NarrativeGit instance with full commit history */
  git: NarrativeGit;
  /** All commits in order */
  commits: NarrativeCommit[];
  /** Final state (convenience - same as git.export()) */
  finalState: NarrativeStructure;
  /** Processing stats */
  stats: {
    totalChunks: number;
    totalCommits: number;
    totalEntities: number;
    totalRelationships: number;
    totalScenes: number;
    processingTimeMs: number;
    entitiesMerged: number;
  };
}

/**
 * Extracts narratives from books and produces git-like commit history
 */
export class GitChunkedExtraction {
  private pipeline: NarrativePipeline;
  private entitySimilarityDetector: EntitySimilarityDetector;
  private options: Required<Omit<GitChunkingOptions, 'gitConfig'>> & { gitConfig?: GitConfig };

  constructor(llmAdapter: LLMAdapter, options: GitChunkingOptions = {}) {
    this.pipeline = new NarrativePipeline(llmAdapter);
    this.entitySimilarityDetector = new EntitySimilarityDetector();
    this.options = {
      maxChunkSize: options.maxChunkSize ?? 8000,
      overlapSize: options.overlapSize ?? 500,
      respectChapters: options.respectChapters ?? true,
      respectParagraphs: options.respectParagraphs ?? true,
      onProgress: options.onProgress ?? (() => {}),
      gitConfig: options.gitConfig,
      author: options.author ?? 'narrative-extractor',
    };
  }

  /**
   * Extract narrative from book text into a git repository
   */
  async extractToGit(text: string, bookTitle?: string): Promise<GitExtractionResult> {
    const startTime = Date.now();
    const git = new NarrativeGit({
      ...this.options.gitConfig,
      author: this.options.author,
    });

    const chunks = this.splitIntoChunks(text);
    const commits: NarrativeCommit[] = [];

    // Track known entities for deduplication
    const knownEntities = new Map<string, Entity>();
    const entityIdMapping = new Map<string, string>(); // old ID -> canonical ID
    let totalEntitiesMerged = 0;

    console.log(`📚 Starting git-based extraction: ${chunks.length} chunks`);
    if (bookTitle) {
      console.log(`📖 Book: ${bookTitle}`);
    }

    // Accumulated context for incremental extraction
    let accumulatedStructure: NarrativeStructure = {
      entities: [],
      scenes: [],
      relationships: [],
      stateChanges: [],
      interactions: [],
      chronology: { events: [], timeline: [] },
      themes: [],
      metadata: { source: bookTitle || 'book-extraction' }
    };

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkTitle = this.detectChunkTitle(chunk, i);

      console.log(`\n📖 Processing chunk ${i + 1}/${chunks.length}: ${chunkTitle}`);

      try {
        // Extract from this chunk with context of what we've seen
        const chunkStructure = await this.pipeline.extractNarrativeIncremental(
          chunk,
          accumulatedStructure
        );

        // Deduplicate entities against known entities
        const {
          deduplicatedEntities,
          newMapping,
          mergedCount
        } = this.deduplicateEntities(chunkStructure.entities, knownEntities);

        totalEntitiesMerged += mergedCount;

        // Update entity ID mapping
        for (const [oldId, newId] of newMapping) {
          entityIdMapping.set(oldId, newId);
        }

        // Add new entities to known set
        for (const entity of deduplicatedEntities) {
          if (!knownEntities.has(entity.id)) {
            knownEntities.set(entity.id, entity);
          }
        }

        // Create operations for this chunk
        const operations = this.structureToOperations(
          chunkStructure,
          entityIdMapping,
          i,
          accumulatedStructure
        );

        // Stage all operations
        if (operations.length > 0) {
          git.add(...operations);

          // Commit with descriptive message
          const commitMessage = this.generateCommitMessage(
            chunkTitle,
            i + 1,
            chunks.length,
            operations
          );

          const commit = await git.commit(commitMessage, {
            author: this.options.author,
            tags: [`chunk-${i + 1}`, `section-${chunkTitle.replace(/\s+/g, '-').toLowerCase()}`]
          });

          commits.push(commit);
          console.log(`✅ Committed: ${commit.id.slice(0, 8)} - ${operations.length} operations`);
        }

        // Update accumulated structure
        accumulatedStructure = this.mergeIntoAccumulated(
          accumulatedStructure,
          chunkStructure,
          entityIdMapping
        );

        // Report progress
        this.options.onProgress({
          currentChunk: i + 1,
          totalChunks: chunks.length,
          chunkTitle,
          commitHash: commits[commits.length - 1]?.id,
          entitiesTotal: knownEntities.size,
          relationshipsTotal: accumulatedStructure.relationships.length,
          scenesTotal: accumulatedStructure.scenes.length,
          percentComplete: ((i + 1) / chunks.length) * 100,
        });

      } catch (error) {
        console.error(`❌ Error processing chunk ${i + 1}:`, error);
        // Continue with other chunks
      }
    }

    const finalState = git.export();
    const processingTime = Date.now() - startTime;

    console.log(`\n🎉 Git extraction complete!`);
    console.log(`   Commits: ${commits.length}`);
    console.log(`   Entities: ${knownEntities.size} (${totalEntitiesMerged} merged)`);
    console.log(`   Time: ${(processingTime / 1000 / 60).toFixed(1)} minutes`);

    return {
      git,
      commits,
      finalState,
      stats: {
        totalChunks: chunks.length,
        totalCommits: commits.length,
        totalEntities: knownEntities.size,
        totalRelationships: accumulatedStructure.relationships.length,
        totalScenes: accumulatedStructure.scenes.length,
        processingTimeMs: processingTime,
        entitiesMerged: totalEntitiesMerged,
      }
    };
  }

  /**
   * Convert extracted structure to git operations
   */
  private structureToOperations(
    structure: NarrativeStructure,
    entityIdMapping: Map<string, string>,
    chunkIndex: number,
    existingStructure: NarrativeStructure
  ): GraphOperation[] {
    const operations: GraphOperation[] = [];
    const timestamp = Date.now();

    // Track what already exists
    const existingEntityIds = new Set(existingStructure.entities.map(e => e.id));
    const existingRelKeys = new Set(
      existingStructure.relationships.map(r => `${r.source}-${r.target}-${r.type}`)
    );

    // Add new entities
    for (const entity of structure.entities) {
      const canonicalId = entityIdMapping.get(entity.id) || entity.id;

      if (!existingEntityIds.has(canonicalId)) {
        operations.push({
          id: `add_entity_${canonicalId}_chunk${chunkIndex}`,
          type: 'ADD_ENTITY',
          timestamp,
          payload: {
            ...entity,
            id: canonicalId,
          }
        });
        existingEntityIds.add(canonicalId);
      }
    }

    // Add new relationships (with remapped entity IDs)
    for (const rel of structure.relationships) {
      const sourceId = entityIdMapping.get(rel.source) || rel.source;
      const targetId = entityIdMapping.get(rel.target) || rel.target;
      const relKey = `${sourceId}-${targetId}-${rel.type}`;

      if (!existingRelKeys.has(relKey)) {
        operations.push({
          id: `add_rel_${rel.id || `${sourceId}_${targetId}`}_chunk${chunkIndex}`,
          type: 'ADD_RELATIONSHIP',
          timestamp,
          payload: {
            ...rel,
            source: sourceId,
            target: targetId,
          }
        });
        existingRelKeys.add(relKey);
      }
    }

    // Add state changes as entity updates
    for (const stateChange of structure.stateChanges) {
      const entityId = entityIdMapping.get(stateChange.entityId) || stateChange.entityId;

      operations.push({
        id: `state_change_${entityId}_${stateChange.changeType}_chunk${chunkIndex}`,
        type: 'UPDATE_ENTITY',
        timestamp,
        payload: {
          entityId,
          changes: {
            stateChange: {
              type: stateChange.changeType,
              before: stateChange.before,
              after: stateChange.after,
              description: stateChange.description,
              sceneId: stateChange.sceneId,
            }
          }
        }
      });
    }

    // Add scenes as special operations
    for (const scene of structure.scenes) {
      operations.push({
        id: `add_scene_${scene.id}_chunk${chunkIndex}`,
        type: 'ADD_SCENE' as any, // Extend operation types
        timestamp,
        payload: {
          ...scene,
          characters: scene.characters.map(c => entityIdMapping.get(c) || c),
        }
      });
    }

    return operations;
  }

  /**
   * Deduplicate entities against known entities
   */
  private deduplicateEntities(
    newEntities: Entity[],
    knownEntities: Map<string, Entity>
  ): {
    deduplicatedEntities: Entity[];
    newMapping: Map<string, string>;
    mergedCount: number;
  } {
    const newMapping = new Map<string, string>();
    const deduplicatedEntities: Entity[] = [];
    let mergedCount = 0;

    const knownArray = Array.from(knownEntities.values());

    for (const entity of newEntities) {
      // Check if this entity matches any known entity
      let matchedEntity: Entity | null = null;

      for (const known of knownArray) {
        if (this.entitiesMatch(entity, known)) {
          matchedEntity = known;
          break;
        }
      }

      if (matchedEntity) {
        // Map new ID to existing ID
        newMapping.set(entity.id, matchedEntity.id);
        mergedCount++;

        // Merge any new aliases or descriptions
        this.mergeEntityInfo(matchedEntity, entity);
      } else {
        // New entity
        newMapping.set(entity.id, entity.id);
        deduplicatedEntities.push(entity);
      }
    }

    return { deduplicatedEntities, newMapping, mergedCount };
  }

  /**
   * Check if two entities match (same character/location/etc)
   */
  private entitiesMatch(a: Entity, b: Entity): boolean {
    // Must be same type
    if (a.type !== b.type) return false;

    // Check name similarity
    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();

    if (nameA === nameB) return true;

    // Check aliases
    const aliasesA = (a.aliases || []).map(x => x.toLowerCase());
    const aliasesB = (b.aliases || []).map(x => x.toLowerCase());

    if (aliasesA.includes(nameB) || aliasesB.includes(nameA)) return true;

    // Use similarity detector for fuzzy matching
    const similarity = this.entitySimilarityDetector.calculateSimilarity(
      { entityId: a.id, name: a.name, aliases: a.aliases || [], type: a.type },
      { entityId: b.id, name: b.name, aliases: b.aliases || [], type: b.type }
    );

    return similarity > 0.8;
  }

  /**
   * Merge info from new entity into existing entity
   */
  private mergeEntityInfo(existing: Entity, newEntity: Entity): void {
    // Add new aliases
    const existingAliases = new Set((existing.aliases || []).map(a => a.toLowerCase()));
    for (const alias of newEntity.aliases || []) {
      if (!existingAliases.has(alias.toLowerCase())) {
        existing.aliases = existing.aliases || [];
        existing.aliases.push(alias);
      }
    }

    // Use longer description if available
    if (newEntity.description && newEntity.description.length > (existing.description?.length || 0)) {
      existing.description = newEntity.description;
    }
  }

  /**
   * Merge chunk structure into accumulated structure
   */
  private mergeIntoAccumulated(
    accumulated: NarrativeStructure,
    chunk: NarrativeStructure,
    entityIdMapping: Map<string, string>
  ): NarrativeStructure {
    const existingEntityIds = new Set(accumulated.entities.map(e => e.id));
    const existingRelKeys = new Set(
      accumulated.relationships.map(r => `${r.source}-${r.target}-${r.type}`)
    );

    // Add new entities
    for (const entity of chunk.entities) {
      const canonicalId = entityIdMapping.get(entity.id) || entity.id;
      if (!existingEntityIds.has(canonicalId)) {
        accumulated.entities.push({ ...entity, id: canonicalId });
        existingEntityIds.add(canonicalId);
      }
    }

    // Add new relationships with remapped IDs
    for (const rel of chunk.relationships) {
      const sourceId = entityIdMapping.get(rel.source) || rel.source;
      const targetId = entityIdMapping.get(rel.target) || rel.target;
      const relKey = `${sourceId}-${targetId}-${rel.type}`;

      if (!existingRelKeys.has(relKey)) {
        accumulated.relationships.push({
          ...rel,
          source: sourceId,
          target: targetId,
        });
      }
    }

    // Add scenes with renumbered sequence
    const maxSequence = Math.max(0, ...accumulated.scenes.map(s => s.sequence));
    for (const scene of chunk.scenes) {
      accumulated.scenes.push({
        ...scene,
        sequence: maxSequence + scene.sequence + 1,
        characters: scene.characters.map(c => entityIdMapping.get(c) || c),
      });
    }

    // Add state changes
    accumulated.stateChanges.push(...chunk.stateChanges);

    // Merge themes
    accumulated.themes = [...new Set([...accumulated.themes, ...chunk.themes])];

    return accumulated;
  }

  /**
   * Generate commit message summarizing the operations
   */
  private generateCommitMessage(
    chunkTitle: string,
    chunkNum: number,
    totalChunks: number,
    operations: GraphOperation[]
  ): string {
    const entityOps = operations.filter(o => o.type === 'ADD_ENTITY').length;
    const relOps = operations.filter(o => o.type === 'ADD_RELATIONSHIP').length;
    const sceneOps = operations.filter(o => (o.type as string) === 'ADD_SCENE').length;
    const updateOps = operations.filter(o => o.type === 'UPDATE_ENTITY').length;

    const parts: string[] = [];
    if (entityOps > 0) parts.push(`+${entityOps} entities`);
    if (relOps > 0) parts.push(`+${relOps} relationships`);
    if (sceneOps > 0) parts.push(`+${sceneOps} scenes`);
    if (updateOps > 0) parts.push(`${updateOps} updates`);

    return `[${chunkNum}/${totalChunks}] ${chunkTitle}\n\n${parts.join(', ')}`;
  }

  /**
   * Detect chapter/section title from chunk text
   */
  private detectChunkTitle(chunk: string, index: number): string {
    // Look for chapter markers
    const chapterMatch = chunk.match(/^[\s\n]*(?:CHAPTER|Chapter|BOOK|Book|Part)\s+(\d+|[IVXLC]+)[:\s\-]*(.*?)[\n\r]/i);
    if (chapterMatch) {
      const number = chapterMatch[1];
      const title = chapterMatch[2]?.trim();
      return title ? `Chapter ${number}: ${title}` : `Chapter ${number}`;
    }

    // Look for markdown headers
    const headerMatch = chunk.match(/^[\s\n]*#{1,3}\s+(.+?)[\n\r]/);
    if (headerMatch) {
      return headerMatch[1].trim();
    }

    // Default to chunk number
    return `Section ${index + 1}`;
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
      ];

      for (const pattern of chapterPatterns) {
        const parts = text.split(pattern);
        if (parts.length > 1) {
          let currentChunk = '';
          for (const section of parts) {
            if (currentChunk.length + section.length <= maxChunkSize) {
              currentChunk += section;
            } else {
              if (currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
              }
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

    // Fall back to character-based splitting
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
          const overlapText = currentChunk.slice(-overlap);
          currentChunk = overlapText + '\n\n' + para;
        } else {
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
}

export default GitChunkedExtraction;
