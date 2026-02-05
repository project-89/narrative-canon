/**
 * Tests for GraphQueryEngine
 * Testing complex narrative graph queries
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Connection } from 'mongoose';
import { MongoNarrativeAdapter } from '../../src/storage/mongodb-adapter';
import { TemporalNarrativeGraph } from '../../src/core/temporal-graph';
import { GraphQueryEngine } from '../../src/queries/graph-query-engine';

const runMongoTests = process.env.ALLOW_MONGO_TESTS === 'true';
const describeMongo = runMongoTests ? describe : describe.skip;

describeMongo('GraphQueryEngine', () => {
  let mongoServer: MongoMemoryServer;
  let connection: Connection;
  let adapter: MongoNarrativeAdapter;
  let temporalGraph: TemporalNarrativeGraph;
  let queryEngine: GraphQueryEngine;

  beforeAll(async () => {
    if (!runMongoTests) {
      return;
    }
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    connection = mongoose.createConnection(mongoUri, {
      dbName: 'test_graph_queries'
    });
    
    await new Promise((resolve) => {
      connection.once('open', resolve);
    });
    
    adapter = new MongoNarrativeAdapter({ connection });
    temporalGraph = new TemporalNarrativeGraph();
    queryEngine = new GraphQueryEngine(adapter, temporalGraph);
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
        aliases: ['Zero-Girl'],
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
        aliases: [],
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
        name: 'Ancient Sword',
        type: 'object',
        aliases: ['The Blade', 'Excalibur'],
        traits: { material: 'enchanted steel', power: 'high' },
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
        entityId: 'castle',
        documentId: 'test_doc',
        name: 'Dark Castle',
        type: 'location',
        aliases: ['The Fortress'],
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
        entityId: 'forest',
        documentId: 'test_doc',
        name: 'Enchanted Forest',
        type: 'location',
        aliases: [],
        traits: {},
        tags: [],
        relatedEntities: [],
        canonicalStatus: 'canon',
        consistencyScore: 100,
        conflictFlags: [],
        sourceFragments: [],
        timelineEvents: [],
        missionAppearances: [],
        significance: 'minor',
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
        description: 'Alice picked up the ancient sword',
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
        description: 'Bob briefly handled the sword',
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
        description: 'Alice and Bob are companions',
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
        sceneId: 'scene_castle_fight',
        documentId: 'test_doc',
        title: 'The Castle Battle',
        sequence: 1,
        location: 'Dark Castle',
        description: 'Epic battle in the castle courtyard',
        characters: ['alice', 'bob'],
        entities: ['castle', 'sword'],
        events: [
          {
            eventId: 'event_alice_finds_sword',
            sequence: 1,
            description: 'Alice discovers the ancient sword hidden in the castle',
            type: 'discovery',
            participants: ['alice']
          },
          {
            eventId: 'event_bob_touches_sword',
            sequence: 2,
            description: 'Bob examines the ancient sword that Alice found',
            type: 'interaction',
            participants: ['bob']
          },
          {
            eventId: 'event_battle_begins',
            sequence: 3,
            description: 'The battle begins as enemies approach the castle',
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
            properties: { weapon: 'ancient sword' }
          }
        ],
        canonicalStatus: 'canon',
        consistencyScore: 90,
        tags: []
      },
      {
        sceneId: 'scene_forest_journey',
        documentId: 'test_doc',
        title: 'Forest Journey',
        sequence: 2,
        location: 'Enchanted Forest',
        description: 'Traveling through the mysterious forest',
        characters: ['alice', 'bob'],
        entities: ['forest', 'sword'],
        events: [
          {
            eventId: 'event_forest_walk',
            sequence: 1,
            description: 'Alice and Bob walk through the enchanted forest',
            type: 'travel',
            participants: ['alice', 'bob']
          },
          {
            eventId: 'event_sword_glows',
            sequence: 2,
            description: 'The ancient sword begins to glow in the magical forest',
            type: 'magical',
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

  describe('getEventsAtLocation', () => {
    test('should find all events that happened at Dark Castle', async () => {
      const events = await queryEngine.getEventsAtLocation({
        locationName: 'Dark Castle'
      });

      expect(events.length).toBe(3);
      expect(events[0].eventId).toBe('event_alice_finds_sword');
      expect(events[0].location).toBe('Dark Castle');
      expect(events[0].description).toBe('Alice discovers the ancient sword hidden in the castle');
      
      expect(events[1].eventId).toBe('event_bob_touches_sword');
      expect(events[2].eventId).toBe('event_battle_begins');
      
      // Should be sorted by sequence
      expect(events[0].sequence).toBe(1);
      expect(events[1].sequence).toBe(2);
      expect(events[2].sequence).toBe(3);
    });

    test('should filter events by type', async () => {
      const combatEvents = await queryEngine.getEventsAtLocation({
        locationName: 'Dark Castle',
        eventTypes: ['combat']
      });

      expect(combatEvents.length).toBe(1);
      expect(combatEvents[0].eventId).toBe('event_battle_begins');
      expect(combatEvents[0].type).toBe('combat');
    });

    test('should find events at Enchanted Forest', async () => {
      const events = await queryEngine.getEventsAtLocation({
        locationName: 'Enchanted Forest'
      });

      expect(events.length).toBe(2);
      expect(events[0].eventId).toBe('event_forest_walk');
      expect(events[1].eventId).toBe('event_sword_glows');
      expect(events.every(e => e.location === 'Enchanted Forest')).toBe(true);
    });

    test('should return empty array for non-existent location', async () => {
      const events = await queryEngine.getEventsAtLocation({
        locationName: 'Nonexistent Place'
      });

      expect(events).toEqual([]);
    });
  });

  describe('getObjectInteractions', () => {
    test('should find all people who touched the Ancient Sword', async () => {
      const interactions = await queryEngine.getObjectInteractions({
        objectName: 'Ancient Sword'
      });

      expect(interactions.length).toBeGreaterThanOrEqual(2);
      
      // Should find Alice's interaction
      const aliceInteraction = interactions.find(i => i.entityName === 'Alice Chen');
      expect(aliceInteraction).toBeTruthy();
      expect(aliceInteraction!.interactionType).toBe('wields');
      expect(aliceInteraction!.objectName).toBe('Ancient Sword');
      
      // Should find Bob's interaction  
      const bobInteraction = interactions.find(i => i.entityName === 'Bob Martinez');
      expect(bobInteraction).toBeTruthy();
      expect(bobInteraction!.interactionType).toBe('touched');
    });

    test('should filter interactions by type', async () => {
      const wieldInteractions = await queryEngine.getObjectInteractions({
        objectName: 'Ancient Sword',
        interactionTypes: ['wield']
      });

      expect(wieldInteractions.length).toBeGreaterThanOrEqual(1);
      expect(wieldInteractions.every(i => i.interactionType.includes('wield'))).toBe(true);
    });

    test('should handle object aliases', async () => {
      const interactions = await queryEngine.getObjectInteractions({
        objectName: 'The Blade' // This is an alias for Ancient Sword
      });

      expect(interactions.length).toBeGreaterThanOrEqual(1);
      expect(interactions[0].objectName).toBe('Ancient Sword');
    });

    test('should return empty array for non-existent object', async () => {
      const interactions = await queryEngine.getObjectInteractions({
        objectName: 'Nonexistent Object'
      });

      expect(interactions).toEqual([]);
    });
  });

  describe('findEntityPath', () => {
    test('should find path between Alice and Bob', async () => {
      const paths = await queryEngine.findEntityPath({
        startEntityId: 'alice',
        endEntityId: 'bob'
      });

      expect(paths.length).toBeGreaterThanOrEqual(1);
      
      // Find the direct ally relationship path
      const directPath = paths.find(p => 
        p.totalHops === 1 && 
        p.pathDescription.includes('ally') &&
        p.path[0].entityId === 'alice' &&
        p.path[1].entityId === 'bob'
      );
      
      expect(directPath).toBeTruthy();
      expect(directPath!.path[0].entityName).toBe('Alice Chen');
      expect(directPath!.path[1].entityName).toBe('Bob Martinez');
      expect(directPath!.pathDescription).toContain('ally');
    });

    test('should find path through shared object', async () => {
      // Both Alice and Bob have relationships with the sword
      const paths = await queryEngine.findEntityPath({
        startEntityId: 'alice', 
        endEntityId: 'sword'
      });

      expect(paths.length).toBeGreaterThanOrEqual(1);
      
      const swordPath = paths.find(p => p.path.some(node => node.entityId === 'sword'));
      expect(swordPath).toBeTruthy();
    });

    test('should respect max hops limit', async () => {
      const paths = await queryEngine.findEntityPath({
        startEntityId: 'alice',
        endEntityId: 'bob',
        maxHops: 1
      });

      expect(paths.every(p => p.totalHops <= 1)).toBe(true);
    });
  });

  describe('getTemporalEvents', () => {
    test('should get all events involving Alice', async () => {
      const events = await queryEngine.getTemporalEvents({
        entityId: 'alice'
      });

      expect(events.length).toBeGreaterThanOrEqual(3);
      
      const aliceEvents = events.filter(e => e.participants.includes('alice'));
      expect(aliceEvents.length).toBeGreaterThanOrEqual(3);
    });

    test('should filter events by sequence range', async () => {
      const events = await queryEngine.getTemporalEvents({
        sequenceRange: { start: 1, end: 1 }
      });

      expect(events.every(e => e.sequence === 1)).toBe(true);
    });

    test('should include state changes', async () => {
      const events = await queryEngine.getTemporalEvents({
        entityId: 'alice'
      });

      const eventWithStateChange = events.find(e => e.stateChanges.length > 0);
      expect(eventWithStateChange).toBeTruthy();
      expect(eventWithStateChange!.stateChanges[0].entityId).toBe('alice');
    });
  });

  describe('getEntitiesAtEvent', () => {
    test('should get all entities present at sword discovery event', async () => {
      const entities = await queryEngine.getEntitiesAtEvent('event_alice_finds_sword');

      expect(entities.length).toBeGreaterThanOrEqual(2);
      
      // Should include Alice as participant
      const alice = entities.find(e => e.entityName === 'Alice Chen');
      expect(alice).toBeTruthy();
      expect(alice!.role).toBe('participant');
      
      // Should include castle as location
      const castle = entities.find(e => e.entityName === 'Dark Castle');
      expect(castle).toBeTruthy();
      expect(castle!.role).toBe('location');
    });

    test('should return empty array for non-existent event', async () => {
      const entities = await queryEngine.getEntitiesAtEvent('nonexistent_event');
      expect(entities).toEqual([]);
    });
  });

  describe('complex query scenarios', () => {
    test('should handle multi-step object interaction tracking', async () => {
      // Find who touched the sword, then find what events they were in
      const swordInteractions = await queryEngine.getObjectInteractions({
        objectName: 'Ancient Sword'
      });

      expect(swordInteractions.length).toBeGreaterThanOrEqual(2);

      // For each person who touched the sword, find their other events
      for (const interaction of swordInteractions) {
        const personEvents = await queryEngine.getTemporalEvents({
          entityId: interaction.entityId
        });
        
        expect(personEvents.length).toBeGreaterThan(0);
        expect(personEvents.some(e => e.participants.includes(interaction.entityId))).toBe(true);
      }
    });

    test('should cross-reference location events with entity interactions', async () => {
      // Find all events at the castle
      const castleEvents = await queryEngine.getEventsAtLocation({
        locationName: 'Dark Castle'
      });

      // Find all sword interactions
      const swordInteractions = await queryEngine.getObjectInteractions({
        objectName: 'Ancient Sword'
      });

      // Verify overlap
      const overlappingEvents = castleEvents.filter(event => 
        swordInteractions.some(interaction => interaction.eventId === event.eventId)
      );

      expect(overlappingEvents.length).toBeGreaterThanOrEqual(1);
    });

    test('should trace object movement through scenes', async () => {
      // The sword appears in both castle and forest scenes
      const swordInCastle = await queryEngine.getEventsAtLocation({
        locationName: 'Dark Castle'
      });

      const swordInForest = await queryEngine.getEventsAtLocation({
        locationName: 'Enchanted Forest'
      });

      // Verify the sword is mentioned in both locations
      const castleEventWithSword = swordInCastle.find(e => 
        e.description.toLowerCase().includes('sword')
      );
      const forestEventWithSword = swordInForest.find(e => 
        e.description.toLowerCase().includes('sword')
      );

      expect(castleEventWithSword).toBeTruthy();
      expect(forestEventWithSword).toBeTruthy();
    });
  });
});
