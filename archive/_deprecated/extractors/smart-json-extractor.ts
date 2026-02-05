/**
 * Smart JSON Extractor
 * 
 * Implements minimal JSON patterns to maximize information density
 * within Gemini's 8,192 token output limit
 */

import { z } from 'zod';
import { LLMAdapter } from '../types';
import { Entity, Relationship, StateChange } from '../types';

// Ultra-minimal schemas for maximum information density
const UltraMinimalEntitySchema = z.object({
  e: z.array(z.tuple([
    z.string(), // name
    z.string()  // type (single letter)
  ]))
});

const EventStringSchema = z.object({
  v: z.array(z.string()).max(300) // More events in less space
});

const RelationshipTupleSchema = z.object({
  r: z.array(z.tuple([
    z.string(), // source
    z.string(), // relation 
    z.string()  // target
  ])).max(1000) // More relationships
});

// For state changes, use pipe-delimited strings
const StateChangeStringSchema = z.object({
  s: z.array(z.string()).max(200) // "entity|attribute|before|after"
});

export class SmartJsonExtractor {
  constructor(private llmAdapter: LLMAdapter) {}

  /**
   * Process entire document with smart JSON extraction
   * Respects dependencies: relationships need entities, state changes need both
   */
  async extractDocument(text: string): Promise<{
    entities: Entity[];
    events: any[];
    relationships: Relationship[];
    stateChanges: StateChange[];
  }> {
    console.log(`🎯 Smart JSON extraction: ${text.length} chars (~${Math.ceil(text.length / 4)} tokens)`);
    
    // Phase 1: Extract entities and events in parallel (no dependencies)
    console.log('📍 Phase 1: Extracting entities and events...');
    const [entities, events] = await Promise.all([
      this.extractEntitiesMinimal(text),
      this.extractEventsMinimal(text)
    ]);
    console.log(`   ✅ Found ${entities.length} entities and ${events.length} events`);
    
    // Phase 2: Extract relationships (needs entities)
    console.log('🔗 Phase 2: Extracting relationships...');
    const relationships = await this.extractRelationshipsMinimal(text, entities);
    console.log(`   ✅ Found ${relationships.length} relationships`);
    
    // Phase 3: Extract state changes (needs entities and events for context)
    console.log('🔄 Phase 3: Extracting state changes...');
    const stateChanges = await this.extractStateChangesMinimal(text, entities, events);
    console.log(`   ✅ Found ${stateChanges.length} state changes`);
    
    return { entities, events, relationships, stateChanges };
  }

  /**
   * Extract entities with ultra-minimal format
   */
  private async extractEntitiesMinimal(text: string): Promise<Entity[]> {
    const prompt = `
List ALL unique entities as tuples.

Format: {"e": [["name", "type"], ...]}
Types: c=character, l=location, o=object, g=group

Example:
{"e": [
  ["Frodo Baggins", "c"],
  ["The Shire", "l"],
  ["One Ring", "o"],
  ["Fellowship", "g"]
]}

Be exhaustive. Include ALL entities.
Text follows:

${text}`;

    try {
      const result = await this.llmAdapter.generateStructuredOutput(
        prompt,
        UltraMinimalEntitySchema,
        { 
          temperature: 0.1,
          maxTokens: 8192,
          modelPreference: 'fast'
        }
      );
      
      // Expand minimal format
      const typeMap: Record<string, Entity['type']> = { 
        c: 'character', 
        l: 'location', 
        o: 'object', 
        g: 'organization' 
      };
      
      return result.e.map(([name, type], idx) => ({
        id: `${typeMap[type]}_${name.toLowerCase().replace(/\s+/g, '_')}`,
        name,
        type: typeMap[type],
        description: '',
        aliases: [],
        firstMention: idx
      }));
    } catch (error) {
      console.error('Entity extraction error:', error);
      return [];
    }
  }

  /**
   * Extract events as simple strings
   */
  private async extractEventsMinimal(text: string): Promise<any[]> {
    const prompt = `
List key events chronologically. One line each.

Format: {"v": ["event 1", "event 2", ...]}

Focus on actions and state changes. Max 300 events.
Text follows:

${text}`;

    try {
      const result = await this.llmAdapter.generateStructuredOutput(
        prompt,
        EventStringSchema,
        { 
          temperature: 0.1,
          maxTokens: 8192,
          modelPreference: 'fast'
        }
      );
      
      return result.v.map((event, idx) => ({
        id: `event_${idx}`,
        description: event,
        sequence: idx + 1
      }));
    } catch (error) {
      console.error('Event extraction error:', error);
      return [];
    }
  }

  /**
   * Extract relationships as tuples (needs entities for context)
   */
  private async extractRelationshipsMinimal(text: string, entities: Entity[]): Promise<Relationship[]> {
    // Use entity names to guide relationship extraction
    const entityNames = entities.slice(0, 100).map(e => e.name).join(', ');
    
    const prompt = `
Extract relationships between these entities: ${entityNames}

Format: {"r": [["source", "relation", "target"], ...]}

Example:
{"r": [
  ["Frodo", "carries", "Ring"],
  ["Gandalf", "mentors", "Frodo"],
  ["Sam", "serves", "Frodo"]
]}

Only use entities from the list. Max 1000 relationships.
Text follows:

${text}`;

    try {
      const result = await this.llmAdapter.generateStructuredOutput(
        prompt,
        RelationshipTupleSchema,
        { 
          temperature: 0.1,
          maxTokens: 8192,
          modelPreference: 'fast'
        }
      );
      
      // Map entity names to IDs for proper linking
      const nameToId = new Map(entities.map(e => [e.name, e.id]));
      
      return result.r
        .filter(([source, _, target]) => nameToId.has(source) && nameToId.has(target))
        .map(([source, type, target], idx) => ({
          id: `rel_${idx}`,
          source: nameToId.get(source)!,
          target: nameToId.get(target)!,
          type,
          description: `${source} ${type} ${target}`,
          firstMentioned: 0
        }));
    } catch (error) {
      console.error('Relationship extraction error:', error);
      return [];
    }
  }

  /**
   * Extract state changes as pipe-delimited strings (needs entities and events for context)
   */
  private async extractStateChangesMinimal(text: string, entities: Entity[], events: any[]): Promise<StateChange[]> {
    // Use known entities and key events to guide state change detection
    const entityNames = entities.slice(0, 50).map(e => e.name).join(', ');
    const keyEvents = events.slice(0, 20).map(e => e.description).join('; ');
    
    const prompt = `
Track state changes for these entities: ${entityNames}

Key events context: ${keyEvents}

Format: {"s": ["entity|attribute|before|after", ...]}

Example:
{"s": [
  "Frodo|location|Shire|Rivendell",
  "Ring|owner|Bilbo|Frodo", 
  "Gandalf|power|Grey|White",
  "Aragorn|status|Ranger|King"
]}

Focus on location, ownership, status, power changes. Max 200.
Text follows:

${text}`;

    try {
      const result = await this.llmAdapter.generateStructuredOutput(
        prompt,
        StateChangeStringSchema,
        { 
          temperature: 0.1,
          maxTokens: 8192,
          modelPreference: 'fast'
        }
      );
      
      // Map entity names to IDs for proper linking
      const nameToId = new Map(entities.map(e => [e.name, e.id]));
      
      return result.s
        .map((change, idx) => {
          const [entity, attribute, before, after] = change.split('|');
          if (nameToId.has(entity)) {
            return {
              id: `state_${idx}`,
              entityId: nameToId.get(entity)!,
              entityName: entity,
              attribute,
              before,
              after,
              eventIndex: idx
            };
          }
          return null;
        })
        .filter(s => s !== null) as StateChange[];
    } catch (error) {
      console.error('State change extraction error:', error);
      return [];
    }
  }

  /**
   * Process massive texts with smart batching
   */
  async processEpic(text: string): Promise<any> {
    const estimatedTokens = Math.ceil(text.length / 4);
    
    if (estimatedTokens < 900000) {
      // Process entire text at once
      return this.extractDocument(text);
    }
    
    // Smart splitting for very large texts
    console.log('📚 Text too large, using smart splitting...');
    
    // Find natural break points (chapters, books, etc)
    const breakPoints = this.findNaturalBreaks(text);
    const chunks = this.splitAtBreaks(text, breakPoints);
    
    console.log(`Split into ${chunks.length} natural chunks`);
    
    // Process chunks in parallel (up to 3 at a time)
    const results = [];
    for (let i = 0; i < chunks.length; i += 3) {
      const batch = chunks.slice(i, i + 3);
      const batchResults = await Promise.all(
        batch.map(chunk => this.extractDocument(chunk))
      );
      results.push(...batchResults);
    }
    
    // Merge and deduplicate
    return this.mergeResults(results);
  }

  private findNaturalBreaks(text: string): number[] {
    const breaks: number[] = [];
    
    // Look for chapter markers
    const chapterRegex = /\n(Chapter|CHAPTER|Book|BOOK|Part|PART)\s+\w+/g;
    let match;
    while ((match = chapterRegex.exec(text)) !== null) {
      breaks.push(match.index);
    }
    
    // If no chapters, look for major scene breaks
    if (breaks.length === 0) {
      const sceneRegex = /\n\n\n+|\n\*\s*\*\s*\*/g;
      while ((match = sceneRegex.exec(text)) !== null) {
        breaks.push(match.index);
      }
    }
    
    return breaks.sort((a, b) => a - b);
  }

  private splitAtBreaks(text: string, breaks: number[]): string[] {
    if (breaks.length === 0) {
      // No natural breaks, split evenly
      const mid = Math.floor(text.length / 2);
      return [text.substring(0, mid), text.substring(mid)];
    }
    
    const chunks: string[] = [];
    let start = 0;
    
    for (const breakPoint of breaks) {
      if (breakPoint - start > 100000) { // Minimum chunk size
        chunks.push(text.substring(start, breakPoint));
        start = breakPoint;
      }
    }
    
    // Add the last chunk
    if (start < text.length) {
      chunks.push(text.substring(start));
    }
    
    return chunks;
  }

  private mergeResults(results: any[]): any {
    // Merge all results with deduplication
    const merged = {
      entities: new Map<string, Entity>(),
      events: [] as any[],
      relationships: new Map<string, Relationship>(),
      stateChanges: [] as StateChange[]
    };
    
    for (const result of results) {
      // Dedupe entities by name
      result.entities.forEach((e: Entity) => {
        if (!merged.entities.has(e.name)) {
          merged.entities.set(e.name, e);
        }
      });
      
      // Keep all events (chronological)
      merged.events.push(...result.events);
      
      // Dedupe relationships
      result.relationships.forEach((r: Relationship) => {
        const key = `${r.source}-${r.type}-${r.target}`;
        if (!merged.relationships.has(key)) {
          merged.relationships.set(key, r);
        }
      });
      
      // Keep all state changes
      merged.stateChanges.push(...result.stateChanges);
    }
    
    return {
      entities: Array.from(merged.entities.values()),
      events: merged.events,
      relationships: Array.from(merged.relationships.values()),
      stateChanges: merged.stateChanges
    };
  }
}

export default SmartJsonExtractor;