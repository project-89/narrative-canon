import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Connection } from 'mongoose';
import { MongoNarrativeAdapter } from '../../src/storage/mongodb-adapter';
import { NarrativeStructure } from '../../src/types';

const runMongoTests = process.env.ALLOW_MONGO_TESTS === 'true';
const describeMongo = runMongoTests ? describe : describe.skip;

describeMongo('MongoNarrativeAdapter', () => {
  let mongoServer: MongoMemoryServer;
  let connection: Connection;
  let adapter: MongoNarrativeAdapter;

  beforeAll(async () => {
    if (!runMongoTests) {
      return;
    }
    // Start in-memory MongoDB server
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    // Create connection
    connection = mongoose.createConnection(mongoUri, {
      dbName: 'test_narrative'
    });
    
    await new Promise((resolve) => {
      connection.once('open', resolve);
    });
    
    // Initialize adapter
    adapter = new MongoNarrativeAdapter({ connection });
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
  });

  describe('Document Operations', () => {
    const mockNarrative: NarrativeStructure = {
      entities: [
        {
          id: 'alice',
          name: 'Alice Chen',
          type: 'character',
          description: 'A skilled hacker from Neo-Tokyo',
          aliases: ['A-Chen', 'Zero-Girl']
        },
        {
          id: 'neo_tokyo',
          name: 'Neo-Tokyo',
          type: 'location',
          description: 'Cyberpunk megacity'
        }
      ],
      relationships: [
        {
          id: 'rel_1',
          source: 'alice',
          target: 'neo_tokyo',
          type: 'lives_in',
          description: 'Alice lives in Neo-Tokyo',
          strength: 0.8
        }
      ],
      scenes: [
        {
          id: 'scene_1',
          sequence: 1,
          title: 'The Meeting',
          description: 'Alice meets Bob in the underground',
          location: 'neo_tokyo',
          characters: ['alice'],
          events: [
            {
              id: 'event_1',
              sequence: 1,
              description: 'Alice enters the underground club',
              sceneId: 'scene_1',
              participants: ['alice']
            }
          ]
        }
      ],
      stateChanges: [],
      chronology: {
        events: [],
        timeline: []
      },
      themes: [],
      metadata: {}
    };

    test('should save and retrieve narrative document', async () => {
      const documentId = 'test_doc_1';
      const title = 'Test Narrative';
      const content = 'Alice met Bob in Neo-Tokyo...';

      const savedId = await adapter.saveNarrativeDocument(
        documentId,
        title,
        content,
        mockNarrative,
        {
          extractionVersion: '1.0.0',
          llmModel: 'MockLLM',
          sourceType: 'manual',
          tags: ['test', 'cyberpunk']
        }
      );

      expect(savedId).toBe(documentId);

      // Check document was saved
      const doc = await adapter.DocumentModel.findOne({ documentId });
      expect(doc).toBeTruthy();
      expect(doc!.title).toBe(title);
      expect(doc!.content).toBe(content);
      expect(doc!.sourceType).toBe('manual');
      expect(doc!.tags).toContain('test');
      expect(doc!.tags).toContain('cyberpunk');
    });

    test('should save entities with correct references', async () => {
      const documentId = 'test_doc_2';
      
      await adapter.saveNarrativeDocument(
        documentId,
        'Entity Test',
        'Content...',
        mockNarrative,
        {
          extractionVersion: '1.0.0',
          llmModel: 'MockLLM',
          sourceType: 'manual'
        }
      );

      // Check entities were saved
      const entities = await adapter.EntityModel.find({ documentId });
      expect(entities).toHaveLength(2);

      const alice = entities.find(e => e.name === 'Alice Chen');
      expect(alice).toBeTruthy();
      expect(alice!.entityId).toBe(`${documentId}_alice`);
      expect(alice!.type).toBe('character');
      expect(alice!.aliases).toContain('A-Chen');
      expect(alice!.canonicalStatus).toBe('extracted');

      const neoTokyo = entities.find(e => e.name === 'Neo-Tokyo');
      expect(neoTokyo).toBeTruthy();
      expect(neoTokyo!.type).toBe('location');
    });

    test('should save relationships with entity references', async () => {
      const documentId = 'test_doc_3';
      
      await adapter.saveNarrativeDocument(
        documentId,
        'Relationship Test',
        'Content...',
        mockNarrative,
        {
          extractionVersion: '1.0.0',
          llmModel: 'MockLLM',
          sourceType: 'manual'
        }
      );

      // Check relationships were saved
      const relationships = await adapter.RelationshipModel.find({ documentId });
      expect(relationships).toHaveLength(1);

      const rel = relationships[0];
      expect(rel.relationshipType).toBe('lives_in');
      expect(rel.sourceEntityId).toBe(`${documentId}_alice`);
      expect(rel.targetEntityId).toBe(`${documentId}_neo_tokyo`);
      expect(rel.strength).toBe(0.8);
      expect(rel.confidenceScore).toBe(75); // Default confidence
    });

    test('should save scenes with events', async () => {
      const documentId = 'test_doc_4';
      
      await adapter.saveNarrativeDocument(
        documentId,
        'Scene Test',
        'Content...',
        mockNarrative,
        {
          extractionVersion: '1.0.0',
          llmModel: 'MockLLM',
          sourceType: 'manual'
        }
      );

      // Check scenes were saved
      const scenes = await adapter.SceneModel.find({ documentId });
      expect(scenes).toHaveLength(1);

      const scene = scenes[0];
      expect(scene.title).toBe('The Meeting');
      expect(scene.sequence).toBe(1);
      expect(scene.location).toBe('neo_tokyo');
      expect(scene.characters).toContain(`${documentId}_alice`);
      expect(scene.events).toHaveLength(1);
      expect(scene.events[0].description).toBe('Alice enters the underground club');
    });

    test('should handle transaction rollback on error', async () => {
      // Mock an error in the save process
      const originalSave = adapter.DocumentModel.prototype.save;
      adapter.DocumentModel.prototype.save = jest.fn().mockRejectedValue(new Error('Save failed'));

      await expect(
        adapter.saveNarrativeDocument(
          'error_doc',
          'Error Test',
          'Content...',
          mockNarrative,
          {
            extractionVersion: '1.0.0',
            llmModel: 'MockLLM',
            sourceType: 'manual'
          }
        )
      ).rejects.toThrow('Save failed');

      // Check nothing was saved
      const docs = await adapter.DocumentModel.find({});
      const entities = await adapter.EntityModel.find({});
      const relationships = await adapter.RelationshipModel.find({});
      const scenes = await adapter.SceneModel.find({});

      expect(docs).toHaveLength(0);
      expect(entities).toHaveLength(0);
      expect(relationships).toHaveLength(0);
      expect(scenes).toHaveLength(0);

      // Restore original method
      adapter.DocumentModel.prototype.save = originalSave;
    });
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      // Set up test data
      const testNarrative: NarrativeStructure = {
        entities: [
          { id: 'char1', name: 'Alice', type: 'character', description: 'Protagonist' },
          { id: 'char2', name: 'Bob', type: 'character', description: 'Antagonist' },
          { id: 'loc1', name: 'Tokyo', type: 'location', description: 'City' },
          { id: 'org1', name: 'Resistance', type: 'organization', description: 'Freedom fighters' }
        ],
        relationships: [
          { id: 'rel1', source: 'char1', target: 'char2', type: 'enemy', strength: 0.9 },
          { id: 'rel2', source: 'char1', target: 'org1', type: 'member', strength: 0.7 }
        ],
        scenes: [],
        stateChanges: [],
        chronology: {
          events: [],
          timeline: []
        },
        themes: [],
        metadata: {}
      };

      await adapter.saveNarrativeDocument(
        'query_test_doc',
        'Query Test',
        'Test content...',
        testNarrative,
        {
          extractionVersion: '1.0.0',
          llmModel: 'MockLLM',
          sourceType: 'lore',
          sourceId: 'lore_123'
        }
      );

      // Update some entities with different consistency scores
      await adapter.updateConsistencyScore('query_test_doc_char1', 85);
      await adapter.updateConsistencyScore('query_test_doc_char2', 65);
      await adapter.updateConsistencyScore('query_test_doc_loc1', 45);
    });

    test('should get entities by type with pagination', async () => {
      const result = await adapter.getEntitiesByType('character', {
        page: 1,
        limit: 10
      });

      expect(result.entities).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.totalPages).toBe(1);

      const names = result.entities.map(e => e.name);
      expect(names).toContain('Alice');
      expect(names).toContain('Bob');
    });

    test('should filter entities by canonical status', async () => {
      // Update one entity to canon status
      await adapter.EntityModel.updateOne(
        { entityId: 'query_test_doc_char1' },
        { canonicalStatus: 'canon' }
      );

      const result = await adapter.getEntitiesByType('character', {
        canonicalStatus: 'canon'
      });

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('Alice');
      expect(result.entities[0].canonicalStatus).toBe('canon');
    });

    test('should filter entities by source type', async () => {
      const result = await adapter.getEntitiesByType('character', {
        sourceType: 'lore'
      });

      expect(result.entities).toHaveLength(2);
      
      // Verify they come from lore source
      const doc = await adapter.DocumentModel.findOne({ 
        documentId: result.entities[0].documentId 
      });
      expect(doc!.sourceType).toBe('lore');
    });

    test('should get entity relationships', async () => {
      const relationships = await adapter.getEntityRelationships('query_test_doc_char1');

      expect(relationships).toHaveLength(2);
      
      const relationshipTypes = relationships.map(r => r.relationshipType);
      expect(relationshipTypes).toContain('enemy');
      expect(relationshipTypes).toContain('member');
    });

    test('should get document scenes in sequence order', async () => {
      // Add some scenes first
      const scenes = [
        { sceneId: 'scene_1', sequence: 2, title: 'Second Scene' },
        { sceneId: 'scene_2', sequence: 1, title: 'First Scene' },
        { sceneId: 'scene_3', sequence: 3, title: 'Third Scene' }
      ].map(s => ({
        ...s,
        documentId: 'query_test_doc',
        description: 'Test scene',
        characters: [],
        entities: [],
        events: [],
        stateChanges: [],
        tags: [],
        canonicalStatus: 'extracted' as const,
        consistencyScore: 50
      }));

      await adapter.SceneModel.insertMany(scenes);

      const retrievedScenes = await adapter.getDocumentScenes('query_test_doc');

      expect(retrievedScenes).toHaveLength(3);
      expect(retrievedScenes[0].title).toBe('First Scene');
      expect(retrievedScenes[1].title).toBe('Second Scene');
      expect(retrievedScenes[2].title).toBe('Third Scene');
    });
  });

  describe('Consistency Operations', () => {
    beforeEach(async () => {
      // Create test entity
      const entity = new adapter.EntityModel({
        entityId: 'test_entity',
        documentId: 'test_doc',
        name: 'Test Entity',
        type: 'character',
        aliases: [],
        traits: {},
        tags: [],
        relatedEntities: [],
        consistencyScore: 50,
        conflictFlags: []
      });
      await entity.save();
    });

    test('should update consistency score', async () => {
      await adapter.updateConsistencyScore('test_entity', 85);

      const entity = await adapter.EntityModel.findOne({ entityId: 'test_entity' });
      expect(entity!.consistencyScore).toBe(85);
      expect(entity!.lastValidated).toBeTruthy();
    });

    test('should flag conflicts', async () => {
      await adapter.flagConflict('test_entity', 'Contradictory character description');

      const entity = await adapter.EntityModel.findOne({ entityId: 'test_entity' });
      expect(entity!.conflictFlags).toContain('Contradictory character description');
    });

    test('should not duplicate conflict flags', async () => {
      const conflictDescription = 'Timeline inconsistency';
      
      await adapter.flagConflict('test_entity', conflictDescription);
      await adapter.flagConflict('test_entity', conflictDescription);

      const entity = await adapter.EntityModel.findOne({ entityId: 'test_entity' });
      const count = entity!.conflictFlags.filter(f => f === conflictDescription).length;
      expect(count).toBe(1);
    });
  });

  describe('Integration Operations', () => {
    beforeEach(async () => {
      // Create test entity
      const entity = new adapter.EntityModel({
        entityId: 'integration_entity',
        documentId: 'test_doc',
        name: 'Integration Entity',
        type: 'character',
        aliases: [],
        traits: {},
        tags: [],
        relatedEntities: [],
        sourceFragments: [],
        timelineEvents: [],
        missionAppearances: []
      });
      await entity.save();
    });

    test('should link to lore fragment', async () => {
      await adapter.linkToLoreFragment('integration_entity', 'lore_fragment_123');

      const entity = await adapter.EntityModel.findOne({ entityId: 'integration_entity' });
      expect(entity!.sourceFragments).toContain('lore_fragment_123');
    });

    test('should link to timeline event', async () => {
      await adapter.linkToTimelineEvent('integration_entity', 'timeline_event_456');

      const entity = await adapter.EntityModel.findOne({ entityId: 'integration_entity' });
      expect(entity!.timelineEvents).toContain('timeline_event_456');
    });

    test('should link to mission', async () => {
      await adapter.linkToMission('integration_entity', 'mission_789');

      const entity = await adapter.EntityModel.findOne({ entityId: 'integration_entity' });
      expect(entity!.missionAppearances).toContain('mission_789');
    });

    test('should not duplicate links', async () => {
      const fragmentId = 'lore_fragment_duplicate_test';
      
      await adapter.linkToLoreFragment('integration_entity', fragmentId);
      await adapter.linkToLoreFragment('integration_entity', fragmentId);

      const entity = await adapter.EntityModel.findOne({ entityId: 'integration_entity' });
      const count = entity!.sourceFragments.filter(f => f === fragmentId).length;
      expect(count).toBe(1);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid entity ID in consistency update', async () => {
      await expect(
        adapter.updateConsistencyScore('nonexistent_entity', 85)
      ).resolves.not.toThrow();

      // Should silently succeed (MongoDB updateOne doesn't throw for no matches)
    });

    test('should handle connection errors gracefully', async () => {
      // Close connection to simulate error
      await connection.close();

      await expect(
        adapter.getEntitiesByType('character')
      ).rejects.toThrow();

      // Reconnect for cleanup
      const mongoUri = mongoServer.getUri();
      connection = mongoose.createConnection(mongoUri, {
        dbName: 'test_narrative'
    });
    
    await new Promise((resolve) => {
      connection.once('open', resolve);
      });
      adapter = new MongoNarrativeAdapter({ connection });
    });
  });

  describe('Schema Validation', () => {
    test('should enforce required fields', async () => {
      const invalidEntity = new adapter.EntityModel({
        // Missing required fields
        documentId: 'test_doc',
        aliases: [],
        traits: {},
        tags: [],
        relatedEntities: []
      });

      await expect(invalidEntity.save()).rejects.toThrow();
    });

    test('should enforce enum values', async () => {
      const invalidEntity = new adapter.EntityModel({
        entityId: 'test_entity',
        documentId: 'test_doc',
        name: 'Test Entity',
        type: 'invalid_type' as any, // Invalid enum value
        aliases: [],
        traits: {},
        tags: [],
        relatedEntities: []
      });

      await expect(invalidEntity.save()).rejects.toThrow();
    });

    test('should enforce consistency score range', async () => {
      const entity = new adapter.EntityModel({
        entityId: 'test_entity',
        documentId: 'test_doc',
        name: 'Test Entity',
        type: 'character',
        aliases: [],
        traits: {},
        tags: [],
        relatedEntities: [],
        consistencyScore: 150 // Invalid: > 100
      });

      await expect(entity.save()).rejects.toThrow();
    });
  });

  describe('Indexing Performance', () => {
    test('should use indexes for common queries', async () => {
      // This test would require MongoDB explain() functionality
      // For now, we'll just verify the indexes exist
      
      const entityIndexes = await adapter.EntityModel.collection.getIndexes();
      const docIndexes = await adapter.DocumentModel.collection.getIndexes();
      
      // Check that our expected indexes exist
      expect(Object.keys(entityIndexes)).toContain('entityId_1');
      expect(Object.keys(entityIndexes)).toContain('type_1_canonicalStatus_1');
      expect(Object.keys(docIndexes)).toContain('documentId_1');
      expect(Object.keys(docIndexes)).toContain('sourceType_1_sourceId_1');
    });
  });
});
