/**
 * Maximal Context Extractor
 * 
 * Designed to use Gemini's full 1M token context window
 * by processing entire books/documents at once
 */

import { z } from 'zod';
import { LLMAdapter } from '../types';
import { Entity, Scene, Relationship, StateChange } from '../types';

// Smart JSON schemas - minimal keys for maximum information density
const MinimalEntitySchema = z.object({
  e: z.array(z.object({
    n: z.string(), // name
    t: z.enum(['c', 'l', 'o', 'g']), // character/location/object/group
    a: z.array(z.string()).optional() // aliases
  }))
});

const EventListSchema = z.object({
  v: z.array(z.string()).max(200) // events as simple strings
});

const RelationshipListSchema = z.object({
  r: z.array(z.tuple([
    z.string(), // source
    z.string(), // type
    z.string()  // target
  ])).max(500) // relationships as tuples
});

export class MaximalContextExtractor {
  constructor(private llmAdapter: LLMAdapter) {}

  /**
   * Process an entire book/document in one shot
   * Maximizes context window usage, respects dependencies
   */
  async extractFullDocument(text: string): Promise<{
    entities: Entity[];
    events: any[];
    relationships: Relationship[];
  }> {
    console.log(`📚 Processing document: ${text.length} characters (~${Math.ceil(text.length / 4)} tokens)`);
    
    // Phase 1: Extract entities and events in parallel (independent)
    console.log('📍 Phase 1: Extracting entities and events...');
    const [entities, events] = await Promise.all([
      this.extractEntities(text),
      this.extractEvents(text)
    ]);
    console.log(`✅ Found ${entities.length} entities and ${events.length} events`);
    
    // Phase 2: Extract relationships (needs entities)
    console.log('🔗 Phase 2: Extracting relationships...');
    const relationships = await this.extractRelationships(text, entities);
    console.log(`✅ Found ${relationships.length} relationships`);
    
    return { entities, events, relationships };
  }

  /**
   * Extract just entity names - very condensed output
   */
  private async extractEntities(text: string): Promise<Entity[]> {
    const prompt = `
Extract ALL unique entities from this text.

Format: {"e": [{"n": "name", "t": "type", "a": ["aliases"]}]}
Types: c=character, l=location, o=object, g=group/organization

Example:
{"e": [
  {"n": "Frodo Baggins", "t": "c", "a": ["Frodo", "Mr. Underhill"]},
  {"n": "The Shire", "t": "l"},
  {"n": "The One Ring", "t": "o", "a": ["The Ring", "Precious"]}
]}

Be exhaustive. Include ALL entities. No descriptions.
Text follows:

${text}`;

    try {
      const result = await this.llmAdapter.generateStructuredOutput(
        prompt,
        MinimalEntitySchema,
        { 
          temperature: 0.1,
          maxTokens: 8192, // Output limit
          modelPreference: 'fast'
        }
      );
      
      // Convert minimal JSON to full Entity objects
      const typeMap = { c: 'character', l: 'location', o: 'object', g: 'organization' };
      return result.e.map((e, idx) => ({
        id: `${typeMap[e.t]}_${e.n.toLowerCase().replace(/\s+/g, '_')}`,
        name: e.n,
        type: typeMap[e.t] as Entity['type'],
        description: '', // Will enrich later if needed
        aliases: e.a || [],
        firstMention: idx
      }));
    } catch (error) {
      console.error('Entity extraction error:', error);
      return [];
    }
  }

  /**
   * Extract chronological events - condensed format
   */
  private async extractEvents(text: string): Promise<any[]> {
    const prompt = `
Extract KEY events chronologically.

Format: {"v": ["event 1", "event 2", ...]}

Example:
{"v": [
  "Bilbo vanishes at his birthday party",
  "Frodo inherits the Ring",
  "Gandalf reveals Ring's true nature",
  "Fellowship forms at Rivendell"
]}

One line per event. Major plot points only. Max 200 events.
Text follows:

${text}`;

    try {
      const result = await this.llmAdapter.generateStructuredOutput(
        prompt,
        EventListSchema,
        { 
          temperature: 0.1,
          maxTokens: 8192,
          modelPreference: 'fast'
        }
      );
      
      // Convert event strings to objects
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
   * Extract relationships between entities
   */
  private async extractRelationships(text: string, entities: Entity[]): Promise<Relationship[]> {
    // Only use top 100 entities to keep prompt manageable
    const topEntities = entities.slice(0, 100);
    const entityNames = topEntities.map(e => e.name).join(', ');
    
    const prompt = `
Extract relationships between these entities: ${entityNames}

Format: {"r": [["source", "type", "target"], ...]}

Example:
{"r": [
  ["Frodo", "carries", "Ring"],
  ["Sam", "serves", "Frodo"],
  ["Gandalf", "mentors", "Frodo"],
  ["Aragorn", "loves", "Arwen"]
]}

Only explicit relationships. Max 500.
Text follows:

${text}`;

    try {
      const result = await this.llmAdapter.generateStructuredOutput(
        prompt,
        RelationshipListSchema,
        { 
          temperature: 0.1,
          maxTokens: 8192,
          modelPreference: 'fast'
        }
      );
      
      // Convert names to entity IDs
      const nameToId = new Map(entities.map(e => [e.name, e.id]));
      
      return result.r
        .filter(([source, _, target]) => nameToId.has(source) && nameToId.has(target))
        .map(([source, type, target]) => ({
          id: `rel_${nameToId.get(source)}_${nameToId.get(target)}`,
          source: nameToId.get(source)!,
          target: nameToId.get(target)!,
          type: type,
          description: `${source} ${type} ${target}`,
          firstMentioned: 0
        }));
    } catch (error) {
      console.error('Relationship extraction error:', error);
      return [];
    }
  }

  /**
   * Process Lord of the Rings sized texts
   * ~470k words = ~1.5M tokens (fits in context!)
   */
  async processEpicNovel(text: string): Promise<any> {
    console.log('🏰 Processing epic novel with maximal context strategy');
    
    // Check if we need to split (only if > 900k tokens)
    const estimatedTokens = Math.ceil(text.length / 4);
    
    if (estimatedTokens > 900000) {
      // Split into books if too large
      return this.processInBooks(text);
    } else {
      // Process entire novel at once!
      console.log('📖 Entire novel fits in context window!');
      return this.extractFullDocument(text);
    }
  }

  /**
   * Split very large texts by detecting book boundaries
   */
  private async processInBooks(text: string): Promise<any> {
    // Simple book detection
    const bookMatches = text.matchAll(/Book\s+\w+|Part\s+\w+/gi);
    const bookBoundaries = Array.from(bookMatches).map(m => ({
      position: m.index!,
      title: m[0]
    }));
    
    if (bookBoundaries.length < 2) {
      // No clear books, just process whole thing
      return this.extractFullDocument(text);
    }
    
    // Process each book
    const results = {
      entities: [] as Entity[],
      events: [] as any[],
      relationships: [] as Relationship[]
    };
    
    for (let i = 0; i < bookBoundaries.length; i++) {
      const start = bookBoundaries[i].position;
      const end = i < bookBoundaries.length - 1 ? 
        bookBoundaries[i + 1].position : 
        text.length;
      
      const bookText = text.substring(start, end);
      console.log(`\n📖 Processing ${bookBoundaries[i].title}`);
      
      const bookResult = await this.extractFullDocument(bookText);
      
      // Merge results (with deduplication)
      results.entities.push(...bookResult.entities);
      results.events.push(...bookResult.events);
      results.relationships.push(...bookResult.relationships);
    }
    
    return this.deduplicateResults(results);
  }

  /**
   * Deduplicate entities and relationships across books
   */
  private deduplicateResults(results: any): any {
    // Dedupe entities by name
    const uniqueEntities = new Map<string, Entity>();
    results.entities.forEach((e: Entity) => {
      if (!uniqueEntities.has(e.name)) {
        uniqueEntities.set(e.name, e);
      }
    });
    
    // Dedupe relationships
    const uniqueRels = new Map<string, Relationship>();
    results.relationships.forEach((r: Relationship) => {
      const key = `${r.source}-${r.type}-${r.target}`;
      if (!uniqueRels.has(key)) {
        uniqueRels.set(key, r);
      }
    });
    
    return {
      entities: Array.from(uniqueEntities.values()),
      events: results.events, // Keep all events
      relationships: Array.from(uniqueRels.values())
    };
  }
}

export default MaximalContextExtractor;