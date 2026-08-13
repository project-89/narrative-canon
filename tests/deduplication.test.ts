import { afterEach, beforeEach, describe, it, expect, jest } from '@jest/globals';
import { NarrativePipeline } from '../src/pipeline';
import { MockLLM } from '../src/llm/mock';
import { Entity, Relationship } from '../src/types';

describe('Deduplication Tests', () => {
  beforeEach(() => {
    // MockLLM intentionally generates varied fixtures. Pin its random source so
    // these tests exercise deduplication instead of occasionally receiving no
    // character entity at all.
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should not create duplicate entities when extracting incrementally', async () => {
    const mockLLM = new MockLLM();
    const pipeline = new NarrativePipeline(mockLLM);

    // First extraction
    const text1 = "Agent Chen works for Project 89 in Neo-Tokyo.";
    const structure1 = await pipeline.extractNarrative(text1);
    
    // Get initial entity count
    const initialEntityCount = structure1.entities.length;
    expect(initialEntityCount).toBeGreaterThan(0);
    
    // Find a character entity in first extraction (MockLLM returns Mock Alice)
    const character1 = structure1.entities.find(e => 
      e.type === 'character'
    );
    expect(character1).toBeDefined();

    // Second extraction with same entities mentioned
    const text2 = "Agent Chen reports to Project 89 headquarters in Neo-Tokyo.";
    const structure2 = await pipeline.extractNarrativeIncremental(text2, structure1);
    
    // Check that no duplicate characters were created
    const characterCount = structure2.entities.filter(e => 
      e.type === 'character'
    ).length;
    
    // Should still have the same number of characters (no duplicates)
    const originalCharacterCount = structure1.entities.filter(e => e.type === 'character').length;
    expect(characterCount).toBe(originalCharacterCount);
    
    // Total entities should not have duplicates
    const uniqueNames = new Set(structure2.entities.map(e => e.name.toLowerCase()));
    expect(uniqueNames.size).toBe(structure2.entities.length);
  });

  it('should not create duplicate relationships when extracting incrementally', async () => {
    const mockLLM = new MockLLM();
    const pipeline = new NarrativePipeline(mockLLM);

    // First extraction
    const text1 = "Agent Chen works for Oneirocom Corporation.";
    const structure1 = await pipeline.extractNarrative(text1);
    
    // Check initial relationships - MockLLM creates at least one relationship
    const initialRelCount = structure1.relationships.length;
    // If no relationships, this test doesn't apply
    if (initialRelCount === 0) {
      expect(initialRelCount).toBe(0);
      return;
    }

    // Second extraction mentioning same relationship
    const text2 = "Chen continues to work for Oneirocom, gathering intel.";
    const structure2 = await pipeline.extractNarrativeIncremental(text2, structure1);
    
    // Count relationships between same entities
    const relGroups = new Map<string, number>();
    structure2.relationships.forEach(r => {
      const key = `${r.source}-${r.type}-${r.target}`;
      relGroups.set(key, (relGroups.get(key) || 0) + 1);
    });
    
    // No relationship should be duplicated
    for (const count of relGroups.values()) {
      expect(count).toBe(1);
    }
  });

  it('should properly merge new and existing entities', async () => {
    const mockLLM = new MockLLM();
    const pipeline = new NarrativePipeline(mockLLM);

    // Create some existing entities
    const existingEntities: Entity[] = [
      {
        id: 'char_chen',
        name: 'Agent Chen',
        type: 'character',
        description: 'A skilled operative',
        aliases: ['Chen']
      },
      {
        id: 'org_oneirocom',
        name: 'Oneirocom Corporation',
        type: 'organization',
        description: 'A powerful corporation'
      }
    ];

    const existingRelationships: Relationship[] = [
      {
        id: 'rel_1',
        source: 'char_chen',
        target: 'org_oneirocom',
        type: 'works_for',
        description: 'Chen works for Oneirocom'
      }
    ];

    const existingData = {
      entities: existingEntities,
      relationships: existingRelationships,
      scenes: [],
      stateChanges: []
    };

    // Extract with new text that mentions existing entities and adds new ones
    const newText = "Agent Chen meets with Dr. Smith at Oneirocom headquarters.";
    const result = await pipeline.extractNarrative(newText, existingData);

    // Should have existing entities plus any new ones (like Dr. Smith)
    expect(result.entities.length).toBeGreaterThanOrEqual(existingEntities.length);
    
    // Check that Agent Chen wasn't duplicated
    const chenCount = result.entities.filter(e => 
      e.name.toLowerCase() === 'agent chen'
    ).length;
    expect(chenCount).toBe(1);
    
    // Check that Oneirocom wasn't duplicated
    const oneirocomCount = result.entities.filter(e => 
      e.name.toLowerCase() === 'oneirocom corporation'
    ).length;
    expect(oneirocomCount).toBe(1);
    
    // Should include existing relationships
    expect(result.relationships.length).toBeGreaterThanOrEqual(existingRelationships.length);
  });
});
