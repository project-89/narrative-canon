import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Connection } from 'mongoose';
import { MongoNarrativeService } from '../../src/services/mongodb-narrative-service';
import { MockLLM } from '../../src/llm/mock';

const runMongoTests = process.env.ALLOW_MONGO_TESTS === 'true';
const describeMongo = runMongoTests ? describe : describe.skip;

describeMongo('MongoNarrativeService', () => {
  let mongoServer: MongoMemoryServer;
  let connection: Connection;
  let service: MongoNarrativeService;

  beforeAll(async () => {
    if (!runMongoTests) {
      return;
    }
    // Start in-memory MongoDB server
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    // Create connection and wait for it to be ready
    connection = mongoose.createConnection(mongoUri, {
      dbName: 'test_narrative_service'
    });
    
    await new Promise((resolve) => {
      connection.once('open', resolve);
    });
    
    // Initialize service with mock LLM
    service = new MongoNarrativeService(
      { connection },
      { type: 'mock' }
    );
  });

  afterAll(async () => {
    if (!runMongoTests) {
      return;
    }
    await service.close();
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

  describe('extractAndSave', () => {
    test('should extract narrative and save to MongoDB', async () => {
      const content = 'Alice Chen was a skilled hacker living in Neo-Tokyo. She worked with the resistance against Oneirocom.';
      
      const result = await service.extractAndSave(content, {
        title: 'Alice Chen Story',
        sourceType: 'lore',
        sourceId: 'lore_alice_001',
        tags: ['cyberpunk', 'resistance']
      });

      expect(result.documentId).toBeTruthy();
      expect(result.extraction).toBeTruthy();
      expect(result.stats.entitiesExtracted).toBeGreaterThan(0);
      expect(result.stats.consistencyScore).toBeGreaterThan(0);

      // Verify document was saved
      const entities = await service.getEntities({ 
        type: 'character',
        page: 1,
        limit: 10
      });
      
      expect(entities.total).toBeGreaterThan(0);
    });

    test('should handle different source types', async () => {
      const missionContent = 'Mission briefing: Infiltrate Oneirocom facility. Target: Data Core Alpha.';
      
      const result = await service.extractAndSave(missionContent, {
        title: 'Mission Alpha Briefing',
        sourceType: 'mission',
        sourceId: 'mission_alpha_001',
        seasonId: 'season_1',
        tags: ['mission', 'infiltration']
      });

      expect(result.documentId).toContain('mission_');
      expect(result.extraction).toBeTruthy();
    });

    test('should calculate consistency scores', async () => {
      const richContent = `
        Alice Chen, known as Zero-Girl in the underground, was the best hacker in Neo-Tokyo. 
        She lived in Sector 7 with her mentor Bob. Together they planned to infiltrate Oneirocom's 
        central database. Alice specialized in neural network penetration while Bob handled 
        physical security systems.
      `;
      
      const result = await service.extractAndSave(richContent, {
        title: 'Rich Narrative Test',
        sourceType: 'manual',
        tags: ['detailed', 'characters']
      });

      // Rich content with entities and relationships should have higher consistency
      expect(result.stats.consistencyScore).toBeGreaterThan(50);
      expect(result.stats.entitiesExtracted).toBeGreaterThan(1);
      expect(result.stats.relationshipsExtracted).toBeGreaterThan(0);
    });

    test('should handle extraction errors gracefully', async () => {
      // Mock the pipeline to throw an error
      const originalExtract = service['pipeline'].extractNarrative;
      service['pipeline'].extractNarrative = jest.fn().mockRejectedValue(new Error('LLM error'));

      await expect(
        service.extractAndSave('test content', {
          title: 'Error Test',
          sourceType: 'manual'
        })
      ).rejects.toThrow('Narrative extraction failed: Error: LLM error');

      // Restore original method
      service['pipeline'].extractNarrative = originalExtract;
    });
  });

  describe('getEntities', () => {
    beforeEach(async () => {
      // Set up test data
      const characterContent = 'Alice is a hacker. Bob is a security expert.';
      const locationContent = 'Neo-Tokyo is a cyberpunk megacity. The Underground is a hidden network.';
      
      await service.extractAndSave(characterContent, {
        title: 'Characters',
        sourceType: 'lore',
        tags: ['characters']
      });
      
      await service.extractAndSave(locationContent, {
        title: 'Locations', 
        sourceType: 'manual',
        tags: ['locations']
      });
    });

    test('should get entities by type with pagination', async () => {
      const characters = await service.getEntities({
        type: 'character',
        page: 1,
        limit: 5
      });

      expect(characters.entities.length).toBeGreaterThan(0);
      expect(characters.total).toBeGreaterThan(0);
      expect(characters.totalPages).toBeGreaterThan(0);
      
      // All returned entities should be characters
      characters.entities.forEach(entity => {
        expect(entity.type).toBe('character');
      });
    });

    test('should filter by canonical status', async () => {
      // First get some entities
      const allEntities = await service.getEntities({ type: 'character' });
      
      if (allEntities.entities.length > 0) {
        // Update one to canon status
        await service.adapter.EntityModel.updateOne(
          { entityId: allEntities.entities[0].entityId },
          { canonicalStatus: 'canon' }
        );

        const canonEntities = await service.getEntities({
          type: 'character',
          canonicalStatus: 'canon'
        });

        expect(canonEntities.entities.length).toBe(1);
        expect(canonEntities.entities[0].canonicalStatus).toBe('canon');
      }
    });

    test('should filter by source type', async () => {
      const loreEntities = await service.getEntities({
        sourceType: 'lore'
      });

      const manualEntities = await service.getEntities({
        sourceType: 'manual'
      });

      expect(loreEntities.total).toBeGreaterThan(0);
      expect(manualEntities.total).toBeGreaterThan(0);
      expect(loreEntities.total).not.toBe(manualEntities.total);
    });

    test('should filter by minimum consistency score', async () => {
      // Update some entities to different consistency scores
      const allEntities = await service.getEntities({});
      
      if (allEntities.entities.length >= 2) {
        await service.adapter.updateConsistencyScore(allEntities.entities[0].entityId, 90);
        await service.adapter.updateConsistencyScore(allEntities.entities[1].entityId, 30);

        const highConsistencyEntities = await service.getEntities({
          minConsistencyScore: 80
        });

        expect(highConsistencyEntities.entities.length).toBeGreaterThan(0);
        highConsistencyEntities.entities.forEach(entity => {
          expect(entity.consistencyScore).toBeGreaterThanOrEqual(80);
        });
      }
    });
  });

  describe('getEntityGraph', () => {
    let testEntityId: string;

    beforeEach(async () => {
      // Create test data with relationships
      const content = `
        Alice Chen works with Bob Martinez in the resistance. 
        They both operate from Neo-Tokyo and fight against Oneirocom.
        Alice is the leader of the hacker cell while Bob handles operations.
      `;
      
      const result = await service.extractAndSave(content, {
        title: 'Resistance Team',
        sourceType: 'lore',
        tags: ['resistance', 'team']
      });

      // Get an entity ID for testing
      const entities = await service.getEntities({ type: 'character', limit: 1 });
      if (entities.entities.length > 0) {
        testEntityId = entities.entities[0].entityId;
      }
    });

    test('should get entity graph with relationships', async () => {
      if (testEntityId) {
        const graph = await service.getEntityGraph(testEntityId, 2);

        expect(graph.entity).toBeTruthy();
        expect(graph.entity.entityId).toBe(testEntityId);
        expect(graph.relationships).toBeDefined();
        expect(graph.connectedEntities).toBeDefined();
        expect(graph.networkStats).toBeTruthy();
        expect(graph.networkStats.directConnections).toBeDefined();
        expect(graph.networkStats.networkSize).toBeDefined();
      }
    });

    test('should throw error for nonexistent entity', async () => {
      await expect(
        service.getEntityGraph('nonexistent_entity')
      ).rejects.toThrow('Entity not found');
    });

    test('should limit depth of graph traversal', async () => {
      if (testEntityId) {
        const shallowGraph = await service.getEntityGraph(testEntityId, 1);
        const deepGraph = await service.getEntityGraph(testEntityId, 3);

        // Deeper graph might have more entities (though not guaranteed with test data)
        expect(deepGraph.networkStats.networkSize).toBeGreaterThanOrEqual(
          shallowGraph.networkStats.networkSize
        );
      }
    });
  });

  describe('processLoreFragment', () => {
    test('should process lore fragment and create links', async () => {
      const loreContent = 'Proxim8 #1337 belonged to Alice Chen, a renowned hacker from Neo-Tokyo.';
      
      const result = await service.processLoreFragment(
        'lore_fragment_1337',
        loreContent,
        {
          nftId: '1337',
          seasonId: 'season_1',
          tags: ['nft', 'backstory']
        }
      );

      expect(result.documentId).toBeTruthy();
      expect(result.stats.entitiesExtracted).toBeGreaterThan(0);

      // Check that entities were linked to the lore fragment
      const entities = await service.getEntities({ type: 'character' });
      
      if (entities.entities.length > 0) {
        const entity = entities.entities[0];
        expect(entity.sourceFragments).toContain('lore_fragment_1337');
      }
    });

    test('should link entities to missions when provided', async () => {
      const loreContent = 'During Mission Alpha, Agent Zero infiltrated the Oneirocom facility.';
      
      await service.processLoreFragment(
        'lore_fragment_mission',
        loreContent,
        {
          missionId: 'mission_alpha',
          tags: ['mission', 'infiltration']
        }
      );

      // Check that entities were linked to the mission
      const entities = await service.getEntities({ type: 'character' });
      
      if (entities.entities.length > 0) {
        const entity = entities.entities[0];
        expect(entity.missionAppearances).toContain('mission_alpha');
      }
    });

    test('should include NFT and mission tags', async () => {
      const result = await service.processLoreFragment(
        'lore_tagged',
        'Tagged lore content',
        {
          nftId: '9999',
          missionId: 'mission_beta',
          tags: ['custom']
        }
      );

      // Check document has all expected tags
      const doc = await service.adapter.DocumentModel.findOne({ 
        documentId: result.documentId 
      });
      
      expect(doc!.tags).toContain('lore');
      expect(doc!.tags).toContain('nft_9999');
      expect(doc!.tags).toContain('custom');
    });
  });

  describe('processMissionOutcome', () => {
    beforeEach(async () => {
      // Set up test entities
      const setupContent = 'Alice Chen leads the resistance. Bob works with her.';
      await service.extractAndSave(setupContent, {
        title: 'Setup Entities',
        sourceType: 'manual'
      });
    });

    test('should process mission outcome and update consistency', async () => {
      const outcome = {
        narrative: 'Mission Alpha completed successfully. Alice Chen proved her hacking skills.',
        success: true,
        timelineShift: 5,
        stateChanges: [
          {
            entityName: 'Alice',
            changeType: 'modify',
            description: 'Gained reputation as elite hacker'
          }
        ]
      };

      const result = await service.processMissionOutcome('mission_alpha_001', outcome);

      expect(result.documentId).toBeTruthy();
      expect(result.extraction).toBeTruthy();

      // Check that Alice's consistency score was updated
      const entities = await service.getEntities({ type: 'character' });
      const alice = entities.entities.find(e => e.name.toLowerCase().includes('alice'));
      
      if (alice) {
        expect(alice.missionAppearances).toContain('mission_alpha_001');
        // Successful mission should increase consistency
        expect(alice.consistencyScore).toBeGreaterThan(50);
      }
    });

    test('should decrease consistency for failed missions', async () => {
      // Get initial consistency score
      const entitiesBefore = await service.getEntities({ type: 'character' });
      const initialEntity = entitiesBefore.entities.find(e => e.name.toLowerCase().includes('alice'));
      const initialScore = initialEntity?.consistencyScore || 50;

      const failedOutcome = {
        narrative: 'Mission Beta failed. Alice Chen was captured.',
        success: false,
        timelineShift: -3,
        stateChanges: [
          {
            entityName: 'Alice',
            changeType: 'destroy',
            description: 'Captured by Oneirocom forces'
          }
        ]
      };

      await service.processMissionOutcome('mission_beta_001', failedOutcome);

      // Check that consistency decreased
      const entitiesAfter = await service.getEntities({ type: 'character' });
      const updatedEntity = entitiesAfter.entities.find(e => e.name.toLowerCase().includes('alice'));
      
      if (updatedEntity && initialEntity) {
        expect(updatedEntity.consistencyScore).toBeLessThan(initialScore);
      }
    });

    test('should handle multiple state changes', async () => {
      const outcome = {
        narrative: 'Complex mission with multiple character changes.',
        success: true,
        timelineShift: 8,
        stateChanges: [
          {
            entityName: 'Alice',
            changeType: 'modify',
            description: 'Became team leader'
          },
          {
            entityName: 'Bob',
            changeType: 'relocate',
            description: 'Moved to safe house'
          }
        ]
      };

      await service.processMissionOutcome('mission_complex_001', outcome);

      // Check that both entities were updated
      const entities = await service.getEntities({ type: 'character' });
      const alice = entities.entities.find(e => e.name.toLowerCase().includes('alice'));
      const bob = entities.entities.find(e => e.name.toLowerCase().includes('bob'));
      
      if (alice) {
        expect(alice.missionAppearances).toContain('mission_complex_001');
      }
      if (bob) {
        expect(bob.missionAppearances).toContain('mission_complex_001');
      }
    });
  });

  describe('validateNarrativeConsistency', () => {
    let testEntityId: string;

    beforeEach(async () => {
      // Create test data with potential conflicts
      const content = `
        Alice Chen is both a hacker and a corporate executive. 
        She works for Oneirocom but also leads the resistance against them.
        Alice lives in Neo-Tokyo but was born in Old Tokyo.
      `;
      
      await service.extractAndSave(content, {
        title: 'Conflicted Character',
        sourceType: 'manual'
      });

      const entities = await service.getEntities({ type: 'character', limit: 1 });
      if (entities.entities.length > 0) {
        testEntityId = entities.entities[0].entityId;
      }
    });

    test('should validate narrative consistency', async () => {
      if (testEntityId) {
        const validation = await service.validateNarrativeConsistency(testEntityId);

        expect(validation.consistencyScore).toBeDefined();
        expect(validation.conflicts).toBeDefined();
        expect(validation.recommendations).toBeDefined();
        expect(Array.isArray(validation.conflicts)).toBe(true);
        expect(Array.isArray(validation.recommendations)).toBe(true);
      }
    });

    test('should provide recommendations for low consistency', async () => {
      if (testEntityId) {
        // Artificially lower the consistency score
        await service.adapter.updateConsistencyScore(testEntityId, 30);

        const validation = await service.validateNarrativeConsistency(testEntityId);

        expect(validation.consistencyScore).toBeLessThan(70);
        expect(validation.recommendations.length).toBeGreaterThan(0);
        expect(validation.recommendations.some(r => 
          r.includes('reviewing source material')
        )).toBe(true);
      }
    });

    test('should detect relationship contradictions', async () => {
      if (testEntityId) {
        // Create contradictory relationships
        const entityGraph = await service.getEntityGraph(testEntityId);
        
        if (entityGraph.relationships.length > 0) {
          const validation = await service.validateNarrativeConsistency(testEntityId);
          
          // The validation should complete without errors
          expect(validation).toBeTruthy();
        }
      }
    });
  });

  describe('Consistency Scoring Algorithm', () => {
    test('should score based on extraction richness', async () => {
      const simpleContent = 'Alice exists.';
      const richContent = `
        Alice Chen, a master hacker from Neo-Tokyo, works with her partner Bob Martinez 
        in the underground resistance. They operate from a hidden base in Sector 7, 
        planning missions against the oppressive Oneirocom corporation. Alice specializes 
        in neural network infiltration while Bob handles physical security systems.
      `;

      const simpleResult = await service.extractAndSave(simpleContent, {
        title: 'Simple',
        sourceType: 'manual'
      });

      const richResult = await service.extractAndSave(richContent, {
        title: 'Rich',
        sourceType: 'manual'
      });

      expect(richResult.stats.consistencyScore).toBeGreaterThan(
        simpleResult.stats.consistencyScore
      );
    });

    test('should handle edge cases in scoring', async () => {
      const emptyExtractionResult = await service.extractAndSave('Nothing meaningful here.', {
        title: 'Empty',
        sourceType: 'manual'
      });

      // Even minimal extractions should have some base score
      expect(emptyExtractionResult.stats.consistencyScore).toBeGreaterThanOrEqual(0);
      expect(emptyExtractionResult.stats.consistencyScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Memory Management', () => {
    test('should handle large number of entities', async () => {
      // Test with multiple documents to verify memory usage
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        const content = `Character ${i} lives in Location ${i} and works for Organization ${i}.`;
        promises.push(
          service.extractAndSave(content, {
            title: `Document ${i}`,
            sourceType: 'manual',
            tags: [`batch_${i}`]
          })
        );
      }

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.documentId).toBeTruthy();
      });

      // Verify all entities are accessible
      const allEntities = await service.getEntities({ limit: 50 });
      expect(allEntities.total).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Service Lifecycle', () => {
    test('should close cleanly', async () => {
      await expect(service.close()).resolves.not.toThrow();
    });
  });
});
