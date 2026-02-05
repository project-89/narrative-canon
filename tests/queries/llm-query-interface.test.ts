/**
 * Tests for LLM Query Interface
 * Testing natural language parsing and wildcard functionality
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Connection } from 'mongoose';
import { MongoNarrativeAdapter } from '../../src/storage/mongodb-adapter';
import { TemporalNarrativeGraph } from '../../src/core/temporal-graph';
import { GraphQueryEngine } from '../../src/queries/graph-query-engine';
import { LLMQueryInterface } from '../../src/queries/llm-query-interface';

const runMongoTests = process.env.ALLOW_MONGO_TESTS === 'true';
const describeMongo = runMongoTests ? describe : describe.skip;

describeMongo('LLMQueryInterface', () => {
  let mongoServer: MongoMemoryServer;
  let connection: Connection;
  let adapter: MongoNarrativeAdapter;
  let temporalGraph: TemporalNarrativeGraph;
  let queryEngine: GraphQueryEngine;
  let llmInterface: LLMQueryInterface;

  beforeAll(async () => {
    if (!runMongoTests) {
      return;
    }
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    connection = mongoose.createConnection(mongoUri, {
      dbName: 'test_llm_queries'
    });
    
    await new Promise((resolve) => {
      connection.once('open', resolve);
    });
    
    adapter = new MongoNarrativeAdapter({ connection });
    temporalGraph = new TemporalNarrativeGraph();
    queryEngine = new GraphQueryEngine(adapter, temporalGraph);
    llmInterface = new LLMQueryInterface(queryEngine);
  });

  afterAll(async () => {
    if (!runMongoTests) {
      return;
    }
    await connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    if (!runMongoTests) {
      return;
    }
    // Clear collections before each test
    const collections = await connection.db!.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
    
    // Set up test data
    await setupTestData();
  });

  async function setupTestData() {
    // Create test entities
    const entities = [
      {
        entityId: 'alice',
        documentId: 'test_doc',
        name: 'Alice Chen',
        type: 'character',
        aliases: ['Zero-Girl', 'The Hacker'],
        traits: {},
        tags: [],
        relatedEntities: [],
        canonicalStatus: 'canon',
        consistencyScore: 100,
        conflictFlags: [],
        sourceFragments: [],
        timelineEvents: [],
        missionAppearances: [],
        significance: 'major',
        similarEntities: [],
        mergedFromEntities: []
      },
      {
        entityId: 'bob',
        documentId: 'test_doc',
        name: 'Bob Martinez',
        type: 'character',
        aliases: ['Ghost'],
        traits: {},
        tags: [],
        relatedEntities: [],
        canonicalStatus: 'canon',
        consistencyScore: 100,
        conflictFlags: [],
        sourceFragments: [],
        timelineEvents: [],
        missionAppearances: [],
        significance: 'major',
        similarEntities: [],
        mergedFromEntities: []
      },
      {
        entityId: 'sword',
        documentId: 'test_doc',
        name: 'Neural Sword',
        type: 'object',
        aliases: ['The Blade', 'Digital Katana'],
        traits: { material: 'quantum steel', power: 'high' },
        tags: [],
        relatedEntities: [],
        canonicalStatus: 'canon',
        consistencyScore: 100,
        conflictFlags: [],
        sourceFragments: [],
        timelineEvents: [],
        missionAppearances: [],
        significance: 'major',
        similarEntities: [],
        mergedFromEntities: []
      },
      {
        entityId: 'neo_tokyo',
        documentId: 'test_doc',
        name: 'Neo-Tokyo',
        type: 'location',
        aliases: ['The Megacity'],
        traits: {},
        tags: [],
        relatedEntities: [],
        canonicalStatus: 'canon',
        consistencyScore: 100,
        conflictFlags: [],
        sourceFragments: [],
        timelineEvents: [],
        missionAppearances: [],
        significance: 'major',
        similarEntities: [],
        mergedFromEntities: []
      },
      {
        entityId: 'oneirocom_hq',
        documentId: 'test_doc',
        name: 'Oneirocom Headquarters',
        type: 'location',
        aliases: ['The Tower', 'HQ'],
        traits: {},
        tags: [],
        relatedEntities: [],
        canonicalStatus: 'canon',
        consistencyScore: 100,
        conflictFlags: [],
        sourceFragments: [],
        timelineEvents: [],
        missionAppearances: [],
        significance: 'major',
        similarEntities: [],
        mergedFromEntities: []
      }
    ];

    await adapter.EntityModel.insertMany(entities);

    // Create test relationships
    const relationships = [
      {
        relationshipId: 'rel_alice_sword',
        documentId: 'test_doc',
        sourceEntityId: 'alice',
        targetEntityId: 'sword',
        relationshipType: 'wields',
        description: 'Alice picked up the neural sword',
        strength: 0.9,
        supportingFragments: [],
        contradictingFragments: [],
        confidenceScore: 90,
        canonicalStatus: 'canon',
        tags: []
      },
      {
        relationshipId: 'rel_bob_sword',
        documentId: 'test_doc',
        sourceEntityId: 'bob',
        targetEntityId: 'sword',
        relationshipType: 'touched',
        description: 'Bob examined the neural sword',
        strength: 0.5,
        supportingFragments: [],
        contradictingFragments: [],
        confidenceScore: 75,
        canonicalStatus: 'canon',
        tags: []
      },
      {
        relationshipId: 'rel_alice_bob',
        documentId: 'test_doc',
        sourceEntityId: 'alice',
        targetEntityId: 'bob',
        relationshipType: 'ally',
        description: 'Alice and Bob work together',
        strength: 0.8,
        supportingFragments: [],
        contradictingFragments: [],
        confidenceScore: 85,
        canonicalStatus: 'canon',
        tags: []
      }
    ];

    await adapter.RelationshipModel.insertMany(relationships);

    // Create test scenes with events
    const scenes = [
      {
        sceneId: 'scene_neo_tokyo_mission',
        documentId: 'test_doc',
        title: 'Neo-Tokyo Infiltration',
        sequence: 1,
        location: 'Neo-Tokyo',
        description: 'Alice and Bob infiltrate Neo-Tokyo',
        characters: ['alice', 'bob'],
        entities: ['neo_tokyo', 'sword'],
        events: [
          {
            eventId: 'event_alice_finds_sword',
            sequence: 1,
            description: 'Alice discovers the neural sword in the data vault',
            type: 'discovery',
            participants: ['alice']
          },
          {
            eventId: 'event_bob_examines_sword',
            sequence: 2,
            description: 'Bob examines the neural sword that Alice found',
            type: 'interaction',
            participants: ['bob']
          },
          {
            eventId: 'event_combat_begins',
            sequence: 3,
            description: 'Security forces detect them and combat begins',
            type: 'combat',
            participants: ['alice', 'bob']
          }
        ],
        stateChanges: [
          {
            entityId: 'alice',
            changeType: 'modify',
            description: 'equipment',
            sequence: 1,
            properties: { weapon: 'neural sword' }
          }
        ],
        canonicalStatus: 'canon',
        consistencyScore: 90,
        tags: []
      },
      {
        sceneId: 'scene_oneirocom_escape',
        documentId: 'test_doc',
        title: 'Oneirocom Escape',
        sequence: 2,
        location: 'Oneirocom Headquarters',
        description: 'Escaping from Oneirocom HQ',
        characters: ['alice', 'bob'],
        entities: ['oneirocom_hq', 'sword'],
        events: [
          {
            eventId: 'event_hq_infiltration',
            sequence: 1,
            description: 'Alice and Bob sneak into Oneirocom headquarters',
            type: 'stealth',
            participants: ['alice', 'bob']
          },
          {
            eventId: 'event_sword_glows',
            sequence: 2,
            description: 'The neural sword begins to glow near the quantum core',
            type: 'magical',
            participants: ['alice']
          },
          {
            eventId: 'event_data_extraction',
            sequence: 3,
            description: 'Alice uses the sword to extract critical data',
            type: 'hacking',
            participants: ['alice']
          }
        ],
        stateChanges: [],
        canonicalStatus: 'canon',
        consistencyScore: 85,
        tags: []
      }
    ];

    await adapter.SceneModel.insertMany(scenes);
  }

  describe('natural language query parsing', () => {
    test('should parse location event queries', async () => {
      const queries = [
        "What happened at Neo-Tokyo?",
        "All events at Oneirocom Headquarters",
        "Show me everything that occurred in Neo-Tokyo",
        "Events in the headquarters"
      ];

      for (const query of queries) {
        const result = await llmInterface.executeNaturalLanguageQuery(query);
        
        expect(result.queryType).toBe('location_events');
        expect(result.results.length).toBeGreaterThan(0);
        expect(result.explanation).toContain('events at the specified location');
        expect(result.suggestedFollowups.length).toBeGreaterThan(0);
      }
    });

    test('should parse object interaction queries', async () => {
      const queries = [
        "Who touched the Neural Sword?",
        "Who interacted with the sword?",
        "What happened to the Digital Katana?",
        "Who used the blade?",
        "Show all interactions with the Neural Sword"
      ];

      for (const query of queries) {
        const result = await llmInterface.executeNaturalLanguageQuery(query);
        expect(result.queryType).toBe('object_interactions');
        expect(result.results.length).toBeGreaterThan(0);
        expect(result.explanation).toContain('interactions with the specified object');
        expect(result.suggestedFollowups.length).toBeGreaterThan(0);
      }
    });

    test('should parse entity path queries', async () => {
      const queries = [
        "How are alice and bob connected?",
        "What's the relationship between Alice and Bob?",
        "Find the path from alice to bob",
        "Connect Alice to Bob"
      ];

      for (const query of queries) {
        const result = await llmInterface.executeNaturalLanguageQuery(query);
        
        expect(result.queryType).toBe('entity_path');
        expect(result.explanation).toContain('relationship paths between the entities');
        expect(result.suggestedFollowups.length).toBeGreaterThan(0);
      }
    });

    test('should parse temporal event queries', async () => {
      const queries = [
        "What did Alice do?",
        "Show Bob's timeline",
        "Events involving alice",
        "Trace alice through the story"
      ];

      for (const query of queries) {
        const result = await llmInterface.executeNaturalLanguageQuery(query);
        
        expect(result.queryType).toBe('temporal_events');
        expect(result.explanation).toContain('events in the specified timeline');
        expect(result.suggestedFollowups.length).toBeGreaterThan(0);
      }
    });
  });

  describe('wildcard support', () => {
    test('should handle wildcard in location event types', async () => {
      const result = await llmInterface.executeLocationQuery({
        locationName: 'Neo-Tokyo',
        eventTypes: ['*'] // All event types
      });

      expect(result.length).toBeGreaterThanOrEqual(3); // Should find all events
      
      // Should include different event types
      const eventTypes = result.map(r => r.type);
      expect(eventTypes).toEqual(expect.arrayContaining(['discovery', 'interaction', 'combat']));
    });

    test('should handle wildcard in object interaction types', async () => {
      const result = await llmInterface.executeObjectQuery({
        objectName: 'Neural Sword',
        interactionTypes: ['*'] // All interaction types
      });

      expect(result.length).toBeGreaterThanOrEqual(2);
      
      // Should include different interaction types
      const interactionTypes = result.map(r => r.interactionType);
      expect(interactionTypes).toEqual(expect.arrayContaining(['wields', 'touched']));
    });

    test('should handle wildcard in relationship types', async () => {
      const result = await llmInterface.executePathQuery({
        startEntityId: 'alice',
        endEntityId: 'bob',
        relationshipTypes: ['*'] // All relationship types
      });

      expect(result.length).toBeGreaterThanOrEqual(1);
      
      // Should find the ally relationship
      const allyPath = result.find(p => p.pathDescription.includes('ally'));
      expect(allyPath).toBeTruthy();
    });

    test('should handle wildcard in temporal event types', async () => {
      const result = await llmInterface.executeTemporalQuery({
        entityId: 'alice',
        eventTypes: ['*'] // All event types
      });

      expect(result.length).toBeGreaterThanOrEqual(3);
      
      // Should include different event types
      const eventTypes = result.map(r => r.type);
      expect(eventTypes.length).toBeGreaterThan(1); // Multiple types
    });
  });

  describe('wildcard expansion', () => {
    test('should expand wildcards correctly', async () => {
      // Test the private method through public interface
      const resultWithWildcard = await llmInterface.executeLocationQuery({
        locationName: 'Neo-Tokyo',
        eventTypes: ['*']
      });

      const resultWithoutFilter = await llmInterface.executeLocationQuery({
        locationName: 'Neo-Tokyo'
      });

      // Both should return the same results since wildcard means "all"
      expect(resultWithWildcard.length).toBe(resultWithoutFilter.length);
    });

    test('should handle empty arrays correctly', async () => {
      const result = await llmInterface.executeLocationQuery({
        locationName: 'Neo-Tokyo',
        eventTypes: [] // Empty array should behave like no filter
      });

      expect(result.length).toBeGreaterThan(0);
    });

    test('should handle undefined arrays correctly', async () => {
      const result = await llmInterface.executeLocationQuery({
        locationName: 'Neo-Tokyo'
        // eventTypes undefined
      });

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('natural language parameter extraction', () => {
    test('should extract location names correctly', async () => {
      const queries = [
        { input: "What happened at Neo-Tokyo?", expectedLocation: "Neo-Tokyo" },
        { input: "Events in the headquarters", expectedLocation: "headquarters" },
        { input: "Show me what occurred in Oneirocom Headquarters", expectedLocation: "Oneirocom Headquarters" }
      ];

      for (const { input, expectedLocation } of queries) {
        const result = await llmInterface.executeNaturalLanguageQuery(input);
        expect(result.results.length).toBeGreaterThan(0);
        // Results should be from the expected location
        expect(result.results.every(r => 
          r.location.toLowerCase().includes(expectedLocation.toLowerCase())
        )).toBe(true);
      }
    });

    test('should extract object names correctly', async () => {
      const queries = [
        { input: "Who touched the Neural Sword?", expectedObject: "Neural Sword" },
        { input: "What happened to the Digital Katana?", expectedObject: "Digital Katana" },
        { input: "Interactions with the blade", expectedObject: "blade" }
      ];

      for (const { input, expectedObject } of queries) {
        const result = await llmInterface.executeNaturalLanguageQuery(input);
        expect(result.results.length).toBeGreaterThan(0);
        // Results should involve the expected object
        expect(result.results.every(r => 
          r.objectName.toLowerCase().includes(expectedObject.toLowerCase()) ||
          r.objectName === "Neural Sword" // Alias resolution
        )).toBe(true);
      }
    });

    test('should extract entity names for temporal queries', async () => {
      const queries = [
        { input: "What did alice do?", expectedEntity: "alice" },
        { input: "Show Bob's timeline", expectedEntity: "Bob" },
        { input: "Events involving alice", expectedEntity: "alice" }
      ];

      for (const { input, expectedEntity } of queries) {
        const result = await llmInterface.executeNaturalLanguageQuery(input);
        expect(result.results.length).toBeGreaterThan(0);
        // Results should involve the expected entity
        expect(result.results.some(r => 
          r.participants.includes(expectedEntity.toLowerCase()) ||
          r.participants.includes(expectedEntity)
        )).toBe(true);
      }
    });
  });

  describe('query examples and schemas', () => {
    test('should provide comprehensive query examples', () => {
      const examples = llmInterface.getQueryExamples();
      
      expect(examples.location_events).toContain("What happened at the Dark Castle?");
      expect(examples.location_events).toContain("Events at * locations");
      expect(examples.object_interactions).toContain("Who touched the Ancient Sword?");
      expect(examples.object_interactions).toContain("Show all * interactions with the sword");
      expect(examples.entity_path).toContain("How are Alice and Bob connected?");
      expect(examples.temporal_events).toContain("What did Alice do?");
      
      // Check wildcard examples
      expect(examples.location_events.some(ex => ex.includes('*'))).toBe(true);
      expect(examples.object_interactions.some(ex => ex.includes('*'))).toBe(true);
      expect(examples.entity_path.some(ex => ex.includes('*'))).toBe(true);
      expect(examples.temporal_events.some(ex => ex.includes('*'))).toBe(true);
    });

    test('should provide Zod schemas for LLM integration', () => {
      const schemas = llmInterface.getQuerySchemas();
      
      expect(schemas.location_events).toBeDefined();
      expect(schemas.object_interactions).toBeDefined();
      expect(schemas.entity_path).toBeDefined();
      expect(schemas.temporal_events).toBeDefined();
      expect(schemas.natural_language).toBeDefined();
      
      // Verify schemas can parse example data
      expect(() => {
        schemas.location_events.parse({
          locationName: "Neo-Tokyo",
          eventTypes: ["*"]
        });
      }).not.toThrow();
    });
  });

  describe('complex natural language scenarios', () => {
    test('should handle complex location queries with multiple filters', async () => {
      const result = await llmInterface.executeNaturalLanguageQuery(
        "Show me all combat events at Neo-Tokyo"
      );

      expect(result.queryType).toBe('location_events');
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results.every(r => r.type === 'combat')).toBe(true);
      expect(result.results.every(r => r.location === 'Neo-Tokyo')).toBe(true);
    });

    test('should handle ambiguous queries gracefully', async () => {
      const result = await llmInterface.executeNaturalLanguageQuery(
        "Tell me about alice"
      );

      // Should default to temporal events for ambiguous queries
      expect(result.queryType).toBe('temporal_events');
      expect(result.results.length).toBeGreaterThan(0);
    });

    test('should provide helpful explanations and follow-ups', async () => {
      const result = await llmInterface.executeNaturalLanguageQuery(
        "What happened at Neo-Tokyo?"
      );

      expect(result.explanation).toBeTruthy();
      expect(result.explanation.length).toBeGreaterThan(0);
      expect(result.suggestedFollowups).toBeTruthy();
      expect(result.suggestedFollowups.length).toBeGreaterThan(0);
      
      // Follow-ups should be relevant to location queries
      expect(result.suggestedFollowups.some(f => 
        f.includes('participants') || f.includes('objects') || f.includes('events')
      )).toBe(true);
    });

    test('should track execution time', async () => {
      const result = await llmInterface.executeNaturalLanguageQuery(
        "Who touched the Neural Sword?"
      );

      expect(result.executionTime).toBeGreaterThan(0);
      expect(typeof result.executionTime).toBe('number');
    });
  });

  describe('error handling', () => {
    test('should handle non-existent entities gracefully', async () => {
      const result = await llmInterface.executeNaturalLanguageQuery(
        "What happened to the non-existent object?"
      );

      expect(result.queryType).toBe('object_interactions');
      expect(result.results).toEqual([]);
      expect(result.resultCount).toBe(0);
    });

    test('should handle malformed queries gracefully', async () => {
      const result = await llmInterface.executeNaturalLanguageQuery(
        "asdfghjkl random nonsense query"
      );

      // Should fall back to temporal events
      expect(result.queryType).toBe('temporal_events');
      expect(result.explanation).toBeTruthy();
    });

    test('should handle empty query strings', async () => {
      const result = await llmInterface.executeNaturalLanguageQuery("");

      expect(result.queryType).toBe('temporal_events');
      expect(result.results).toEqual([]);
    });
  });
});
