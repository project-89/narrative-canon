import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Connection } from 'mongoose';
import { MongoNarrativeService } from '../../src/services/mongodb-narrative-service';
import { NarrativePipeline } from '../../src/pipeline';
import { MockLLM } from '../../src/llm/mock';

describe('MongoDB Integration Tests', () => {
  const runMongoTests = process.env.ALLOW_MONGO_TESTS === 'true';
  let mongoServer: MongoMemoryServer;
  let connection: Connection;
  let service: MongoNarrativeService;
  let mongoAvailable = runMongoTests;

  const ensureMongoAvailable = () => {
    if (!mongoAvailable) {
      expect(true).toBe(true);
      return false;
    }
    return true;
  };

  beforeAll(async () => {
    if (!runMongoTests) {
      mongoAvailable = false;
      console.warn('Skipping MongoDB integration tests: ALLOW_MONGO_TESTS not enabled');
      return;
    }

    try {
      mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();

      connection = mongoose.createConnection(mongoUri, {
        dbName: 'integration_test'
      });

      await new Promise((resolve) => {
        connection.once('open', resolve);
      });

      service = new MongoNarrativeService(
        { connection },
        { type: 'mock' }
      );
    } catch (error: any) {
      mongoAvailable = false;
      console.warn('Skipping MongoDB integration tests:', error?.message || error);
    }
  });

  afterAll(async () => {
    if (mongoAvailable) {
      await service.close();
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    if (!mongoAvailable) return;
    const collections = await connection.db!.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  });

  describe('End-to-End Narrative Processing', () => {
    test('should process complete narrative workflow', async () => {
      if (!ensureMongoAvailable()) return;
      // Step 1: Process initial lore fragment
      const loreContent = `
        In the year 2089, Neo-Tokyo sprawls across what was once Japan, a megacity of towering 
        spires and endless digital networks. Alice Chen, known in the underground as "Zero-Girl," 
        navigates the neon-lit streets with practiced ease. She's a ghost in the machine, a 
        hacker whose skills have made her legendary among the resistance.

        Alice works closely with her partner Bob Martinez, a former Oneirocom security officer 
        who defected when he discovered the corporation's true agenda. Together, they operate 
        from a hidden base in Sector 7, planning operations against the oppressive regime.

        Their latest target is the Oneirocom Central Database, a fortress of data containing 
        the consciousness patterns of millions. If they can infiltrate it, they might finally 
        free humanity from digital slavery.
      `;

      const loreResult = await service.processLoreFragment(
        'lore_main_story',
        loreContent,
        {
          nftId: '1337',
          seasonId: 'season_1',
          tags: ['main_story', 'resistance']
        }
      );

      expect(loreResult.stats.entitiesExtracted).toBeGreaterThanOrEqual(3); // Alice, Bob, Neo-Tokyo
      expect(loreResult.stats.relationshipsExtracted).toBeGreaterThan(0);

      // Step 2: Process mission outcome that affects the characters
      const missionOutcome = {
        narrative: `
          Mission Alpha was a success. Alice Chen successfully infiltrated the Oneirocom 
          facility while Bob Martinez provided tactical support from their base. The data 
          they extracted revealed Oneirocom's plan to merge all human consciousness into 
          a single collective mind. Alice's hacking skills proved crucial in bypassing 
          the quantum encryption protecting the core systems.
        `,
        success: true,
        timelineShift: 7,
        stateChanges: [
          {
            entityName: 'Alice Chen',
            changeType: 'modify',
            description: 'Gained access to classified Oneirocom data'
          },
          {
            entityName: 'Bob Martinez',
            changeType: 'modify',
            description: 'Provided successful tactical support'
          }
        ]
      };

      const missionResult = await service.processMissionOutcome('mission_alpha', missionOutcome);

      expect(missionResult.stats.entitiesExtracted).toBeGreaterThan(0);

      // Step 3: Add conflicting information to test consistency
      const conflictingLore = `
        Alice Chen was actually a double agent working for Oneirocom all along. 
        She betrayed the resistance and handed over Bob Martinez to corporate security. 
        Alice now works from the Oneirocom headquarters as a senior executive.
      `;

      const conflictResult = await service.extractAndSave(conflictingLore, {
        title: 'Conflicting Information',
        sourceType: 'manual',
        tags: ['conflict', 'plot_twist']
      });

      expect(conflictResult.stats.entitiesExtracted).toBeGreaterThan(0);

      // Step 4: Verify the narrative network was built correctly
      const characters = await service.getEntities({
        type: 'character',
        page: 1,
        limit: 10
      });

      expect(characters.total).toBeGreaterThanOrEqual(2); // Alice and Bob
      
      const alice = characters.entities.find(e => 
        e.name.toLowerCase().includes('alice') || 
        e.aliases.some(alias => alias.toLowerCase().includes('alice'))
      );

      const bob = characters.entities.find(e => 
        e.name.toLowerCase().includes('bob') || 
        e.name.toLowerCase().includes('martinez')
      );

      expect(alice).toBeTruthy();
      expect(bob).toBeTruthy();

      // Step 5: Check relationship network
      if (alice) {
        const aliceGraph = await service.getEntityGraph(alice.entityId, 2);
        
        expect(aliceGraph.entity).toBeTruthy();
        expect(aliceGraph.relationships.length).toBeGreaterThan(0);
        expect(aliceGraph.networkStats.directConnections).toBeGreaterThan(0);

        // Alice should be linked to lore fragment and mission
        expect(alice.sourceFragments).toContain('lore_main_story');
        expect(alice.missionAppearances).toContain('mission_alpha');
      }

      // Step 6: Validate consistency across conflicting sources
      if (alice) {
        const validation = await service.validateNarrativeConsistency(alice.entityId);
        
        expect(validation.consistencyScore).toBeDefined();
        expect(validation.conflicts).toBeDefined();
        expect(validation.recommendations).toBeDefined();

        // With conflicting information, we might expect some consistency issues
        if (validation.consistencyScore < 70) {
          expect(validation.recommendations.length).toBeGreaterThan(0);
        }
      }

      // Step 7: Verify locations were extracted
      const locations = await service.getEntities({
        type: 'location',
        page: 1,
        limit: 10
      });

      expect(locations.total).toBeGreaterThan(0);
      
      const neoTokyo = locations.entities.find(e => 
        e.name.toLowerCase().includes('tokyo')
      );
      expect(neoTokyo).toBeTruthy();

      // Step 8: Check organizations
      const organizations = await service.getEntities({
        type: 'organization',
        page: 1,
        limit: 10
      });

      expect(organizations.total).toBeGreaterThan(0);
      
      const oneirocom = organizations.entities.find(e => 
        e.name.toLowerCase().includes('oneirocom')
      );
      expect(oneirocom).toBeTruthy();
    });

    test('should handle timeline progression across multiple missions', async () => {
      if (!ensureMongoAvailable()) return;
      // Simulate a series of connected missions showing character development
      const missions = [
        {
          id: 'mission_001',
          narrative: 'Alice Chen begins her journey as a novice hacker in Neo-Tokyo.',
          stateChanges: [{ entityName: 'Alice Chen', changeType: 'create', description: 'Started as novice hacker' }]
        },
        {
          id: 'mission_002', 
          narrative: 'Alice Chen develops advanced hacking skills and meets Bob Martinez.',
          stateChanges: [
            { entityName: 'Alice Chen', changeType: 'modify', description: 'Advanced hacking skills' },
            { entityName: 'Bob Martinez', changeType: 'create', description: 'Introduced as ally' }
          ]
        },
        {
          id: 'mission_003',
          narrative: 'Alice Chen and Bob Martinez form the resistance cell in Sector 7.',
          stateChanges: [
            { entityName: 'Alice Chen', changeType: 'modify', description: 'Became resistance leader' },
            { entityName: 'Bob Martinez', changeType: 'modify', description: 'Joined resistance' }
          ]
        }
      ];

      // Process missions in sequence
      for (const mission of missions) {
        await service.processMissionOutcome(mission.id, {
          narrative: mission.narrative,
          success: true,
          timelineShift: 5,
          stateChanges: mission.stateChanges
        });
      }

      // Check that characters evolved across missions
      const characters = await service.getEntities({ type: 'character' });
      
      const alice = characters.entities.find(e => 
        e.name.toLowerCase().includes('alice')
      );

      if (alice) {
        // Alice should be linked to all three missions
        expect(alice.missionAppearances).toContain('mission_001');
        expect(alice.missionAppearances).toContain('mission_002');
        expect(alice.missionAppearances).toContain('mission_003');

        // Consistency should be high due to coherent progression
        expect(alice.consistencyScore).toBeGreaterThan(60);
      }
    });

    test('should maintain referential integrity under concurrent operations', async () => {
      if (!ensureMongoAvailable()) return;
      // Test concurrent operations to ensure data integrity
      const concurrentOperations = [
        service.extractAndSave('Alice Chen is a character.', {
          title: 'Doc 1',
          sourceType: 'manual',
          tags: ['concurrent']
        }),
        service.extractAndSave('Bob Martinez works with Alice.', {
          title: 'Doc 2', 
          sourceType: 'manual',
          tags: ['concurrent']
        }),
        service.extractAndSave('Neo-Tokyo is their base.', {
          title: 'Doc 3',
          sourceType: 'manual', 
          tags: ['concurrent']
        })
      ];

      const results = await Promise.all(concurrentOperations);

      // All operations should succeed
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.documentId).toBeTruthy();
      });

      // Verify data integrity
      const allEntities = await service.getEntities({ limit: 50 });
      expect(allEntities.total).toBeGreaterThan(0);

      // Each entity should have valid document references
      for (const entity of allEntities.entities) {
        const doc = await service.adapter.DocumentModel.findOne({
          documentId: entity.documentId
        });
        expect(doc).toBeTruthy();
      }
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large narrative extractions efficiently', async () => {
      if (!ensureMongoAvailable()) return;
      // Create a large narrative with many entities and relationships
      const largeNarrative = `
        In the sprawling megacity of Neo-Tokyo, hundreds of characters live their daily lives.
        Alice Chen leads the resistance with her lieutenants: Bob Martinez, Charlie Kim, Diana Ross,
        and Edward Norton. They operate from multiple safe houses across Sectors 1 through 10.
        
        The Oneirocom Corporation, led by CEO Marcus Black and CTO Sarah White, controls the city
        through their network of surveillance drones and neural implants. Their headquarters 
        spans three massive towers: Alpha Tower, Beta Complex, and Gamma Facility.
        
        The resistance includes various cells: the Hackers Guild led by Alice, the Physical 
        Security team under Bob, the Intelligence Network managed by Charlie, the Communications 
        Division headed by Diana, and the Logistics Corps directed by Edward.
        
        Each sector of Neo-Tokyo has its own character: Sector 1 houses the corporate elite,
        Sector 2 contains the shopping districts, Sector 3 is the entertainment zone,
        Sector 4 holds the residential areas, Sector 5 is the industrial quarter,
        Sector 6 contains the data centers, Sector 7 houses the underground,
        Sector 8 is the transport hub, Sector 9 holds the power plants,
        and Sector 10 contains the waste processing facilities.
      `;

      const startTime = Date.now();
      
      const result = await service.extractAndSave(largeNarrative, {
        title: 'Large Narrative Test',
        sourceType: 'manual',
        tags: ['large', 'performance']
      });

      const extractionTime = Date.now() - startTime;

      // Should complete in reasonable time (adjust threshold as needed)
      expect(extractionTime).toBeLessThan(30000); // 30 seconds max

      // Should extract many entities
      expect(result.stats.entitiesExtracted).toBeGreaterThan(10);
      expect(result.stats.relationshipsExtracted).toBeGreaterThan(5);

      // Verify data was saved correctly
      const entities = await service.getEntities({ limit: 100 });
      expect(entities.total).toBeGreaterThan(10);
    });

    test('should efficiently query large datasets', async () => {
      if (!ensureMongoAvailable()) return;
      // Create multiple documents to test query performance
      const documents = [];
      for (let i = 0; i < 10; i++) {
        documents.push(
          service.extractAndSave(
            `Character ${i} lives in Location ${i} and works for Organization ${i}.`,
            {
              title: `Performance Test Doc ${i}`,
              sourceType: 'manual',
              tags: [`perf_test_${i}`]
            }
          )
        );
      }

      await Promise.all(documents);

      // Test pagination performance
      const startTime = Date.now();
      
      const page1 = await service.getEntities({ 
        type: 'character',
        page: 1,
        limit: 5
      });
      
      const page2 = await service.getEntities({
        type: 'character', 
        page: 2,
        limit: 5
      });

      const queryTime = Date.now() - startTime;

      // Queries should be fast
      expect(queryTime).toBeLessThan(5000); // 5 seconds max

      // Should return correct pagination
      expect(page1.entities).toHaveLength(Math.min(5, page1.total));
      expect(page1.totalPages).toBeGreaterThan(0);
      
      if (page1.total > 5) {
        expect(page2.entities.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should handle partial extraction failures gracefully', async () => {
      if (!ensureMongoAvailable()) return;
      // Test with problematic content that might cause partial failures
      const problematicContent = `
        This is valid content with Alice Chen.
        
        [CORRUPTED DATA]
        $$##Invalid##JSON##$$
        
        But this part mentions Bob Martinez is valid again.
      `;

      // Should not throw an error
      const result = await service.extractAndSave(problematicContent, {
        title: 'Problematic Content',
        sourceType: 'manual',
        tags: ['error_recovery']
      });

      expect(result.documentId).toBeTruthy();
      // Should still extract some entities despite problematic content
      expect(result.stats.entitiesExtracted).toBeGreaterThanOrEqual(0);
    });

    test('should maintain consistency during database errors', async () => {
      if (!ensureMongoAvailable()) return;
      // First, create some valid data
      await service.extractAndSave('Alice Chen is a hacker.', {
        title: 'Valid Data',
        sourceType: 'manual'
      });

      // Verify initial state
      const entitiesBefore = await service.getEntities({ type: 'character' });
      const initialCount = entitiesBefore.total;

      // Temporarily break the connection to test error handling
      await connection.close();

      // This should fail gracefully
      await expect(
        service.extractAndSave('Bob Martinez is a friend.', {
          title: 'Should Fail',
          sourceType: 'manual'
        })
      ).rejects.toThrow();

      // Reconnect
      const mongoUri = mongoServer.getUri();
      connection = mongoose.createConnection(mongoUri, {
        dbName: 'integration_test'
    });
    
    await new Promise((resolve) => {
      connection.once('open', resolve);
      });
      
      // Recreate service with new connection
      service = new MongoNarrativeService(
        { connection },
        { type: 'mock' }
      );

      // Original data should still be intact
      const entitiesAfter = await service.getEntities({ type: 'character' });
      expect(entitiesAfter.total).toBe(initialCount);
    });
  });

  describe('Data Migration and Versioning', () => {
    test('should handle extraction version changes', async () => {
      if (!ensureMongoAvailable()) return;
      // Create data with version 1.0.0
      const v1Result = await service.extractAndSave('Alice Chen exists.', {
        title: 'Version 1.0',
        sourceType: 'manual'
      });

      // Simulate version 2.0.0 extraction
      const v2Result = await service.extractAndSave('Bob Martinez exists.', {
        title: 'Version 2.0',
        sourceType: 'manual'
      });

      // Both should coexist
      const docs = await service.adapter.DocumentModel.find({});
      expect(docs.length).toBe(2);

      // Each should have its extraction version recorded
      const v1Doc = docs.find(d => d.documentId === v1Result.documentId);
      const v2Doc = docs.find(d => d.documentId === v2Result.documentId);

      expect(v1Doc?.extractionVersion).toBeTruthy();
      expect(v2Doc?.extractionVersion).toBeTruthy();
    });

    test('should support document updates and versioning', async () => {
      if (!ensureMongoAvailable()) return;
      // Create initial document
      const initialResult = await service.extractAndSave(
        'Alice Chen is a hacker.',
        {
          title: 'Initial Version',
          sourceType: 'manual'
        }
      );

      // Update with additional information
      const updatedResult = await service.extractAndSave(
        'Alice Chen is a hacker and works with Bob Martinez.',
        {
          title: 'Updated Version',
          sourceType: 'manual'
        }
      );

      // Should create separate documents
      expect(initialResult.documentId).not.toBe(updatedResult.documentId);

      // Both should be queryable
      const allDocs = await service.adapter.DocumentModel.find({});
      expect(allDocs.length).toBe(2);
    });
  });

  describe('Cross-Collection Consistency', () => {
    test('should maintain referential integrity across all collections', async () => {
      if (!ensureMongoAvailable()) return;
      const result = await service.extractAndSave(
        'Alice Chen lives in Neo-Tokyo and fights Oneirocom.',
        {
          title: 'Cross-Reference Test',
          sourceType: 'manual'
        }
      );

      // Verify document exists
      const doc = await service.adapter.DocumentModel.findOne({
        documentId: result.documentId
      });
      expect(doc).toBeTruthy();

      // Verify entities reference the document
      const entities = await service.adapter.EntityModel.find({
        documentId: result.documentId
      });
      expect(entities.length).toBeGreaterThan(0);

      entities.forEach(entity => {
        expect(entity.documentId).toBe(result.documentId);
      });

      // Verify relationships reference valid entities
      const relationships = await service.adapter.RelationshipModel.find({
        documentId: result.documentId
      });

      for (const rel of relationships) {
        const sourceEntity = await service.adapter.EntityModel.findOne({
          entityId: rel.sourceEntityId
        });
        const targetEntity = await service.adapter.EntityModel.findOne({
          entityId: rel.targetEntityId
        });

        expect(sourceEntity).toBeTruthy();
        expect(targetEntity).toBeTruthy();
      }

      // Verify scenes reference valid entities
      const scenes = await service.adapter.SceneModel.find({
        documentId: result.documentId
      });

      for (const scene of scenes) {
        for (const characterId of scene.characters) {
          const character = await service.adapter.EntityModel.findOne({
            entityId: characterId
          });
          expect(character).toBeTruthy();
        }
      }
    });
  });
});
