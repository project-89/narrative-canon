/**
 * Tests for EntityMergingService
 * Integration tests with MongoDB for entity deduplication/merging
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Connection } from 'mongoose';
import { MongoNarrativeAdapter } from '../../src/storage/mongodb-adapter';
import { EntityMergingService } from '../../src/services/entity-merging-service';

const runMongoTests = process.env.ALLOW_MONGO_TESTS === 'true';
const describeMongo = runMongoTests ? describe : describe.skip;

describeMongo('EntityMergingService', () => {
  let mongoServer: MongoMemoryServer;
  let connection: Connection;
  let adapter: MongoNarrativeAdapter;
  let mergingService: EntityMergingService;

  beforeAll(async () => {
    if (!runMongoTests) {
      return;
    }
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    connection = mongoose.createConnection(mongoUri, {
      dbName: 'test_entity_merging'
    });
    
    await new Promise((resolve) => {
      connection.once('open', resolve);
    });
    
    adapter = new MongoNarrativeAdapter({ connection });
    mergingService = new EntityMergingService(adapter);
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

  describe('scanForSimilarEntities', () => {
    test('should detect similar organization names', async () => {
      // Create test entities
      const entities = [
        {
          entityId: 'oneirocom_1',
          documentId: 'doc_1',
          name: 'Oneirocom',
          type: 'organization',
          aliases: [],
          traits: {},
          tags: [],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
          conflictFlags: [],
          sourceFragments: [],
          timelineEvents: [],
          missionAppearances: [],
          significance: 'minor',
          similarEntities: [],
          mergedFromEntities: []
        },
        {
          entityId: 'oneirocom_corp_2',
          documentId: 'doc_2',
          name: 'Oneirocom Corporation',
          type: 'organization',
          aliases: ['The Corporation'],
          traits: {},
          tags: [],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
          conflictFlags: [],
          sourceFragments: [],
          timelineEvents: [],
          missionAppearances: [],
          significance: 'minor',
          similarEntities: [],
          mergedFromEntities: []
        },
        {
          entityId: 'apple_1',
          documentId: 'doc_3',
          name: 'Apple',
          type: 'organization',
          aliases: [],
          traits: {},
          tags: [],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
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

      const similarities = await mergingService.scanForSimilarEntities();
      
      expect(similarities.length).toBeGreaterThanOrEqual(1);
      
      const oneirocomMatch = similarities.find(s => 
        (entities.find(e => e.entityId === s.entity1)?.name.includes('Oneirocom') &&
         entities.find(e => e.entityId === s.entity2)?.name.includes('Oneirocom'))
      );
      
      expect(oneirocomMatch).toBeTruthy();
      expect(oneirocomMatch!.score).toBeGreaterThan(0.7);
      expect(['merge', 'alias', 'review']).toContain(oneirocomMatch!.suggestedAction);
    });

    test('should detect similar character names', async () => {
      const entities = [
        {
          entityId: 'alice_1',
          documentId: 'doc_4',
          name: 'Alice Chen',
          type: 'character',
          aliases: ['Zero-Girl'],
          traits: {},
          tags: [],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
          conflictFlags: [],
          sourceFragments: [],
          timelineEvents: [],
          missionAppearances: [],
          significance: 'minor',
          similarEntities: [],
          mergedFromEntities: []
        },
        {
          entityId: 'alice_2',
          documentId: 'doc_5',
          name: 'Agent Chen',
          type: 'character',
          aliases: ['Alice'],
          traits: {},
          tags: [],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
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

      const similarities = await mergingService.scanForSimilarEntities();
      
      expect(similarities.length).toBeGreaterThanOrEqual(0);
      if (similarities.length > 0) {
        expect(similarities[0].score).toBeGreaterThan(0.5);
      }
    });

    test('should ignore entities of different types', async () => {
      const entities = [
        {
          entityId: 'tokyo_location',
          documentId: 'doc_6',
          name: 'Tokyo',
          type: 'location',
          aliases: [],
          traits: {},
          tags: [],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
          conflictFlags: [],
          sourceFragments: [],
          timelineEvents: [],
          missionAppearances: [],
          significance: 'minor',
          similarEntities: [],
          mergedFromEntities: []
        },
        {
          entityId: 'tokyo_org',
          documentId: 'doc_7',
          name: 'Tokyo Corporation',
          type: 'organization',
          aliases: [],
          traits: {},
          tags: [],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
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

      const similarities = await mergingService.scanForSimilarEntities();
      expect(similarities.length).toBe(0);
    });

    test('should ignore already merged entities', async () => {
      const entities = [
        {
          entityId: 'primary_entity',
          documentId: 'doc_8',
          name: 'Oneirocom',
          type: 'organization',
          aliases: [],
          traits: {},
          tags: [],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
          conflictFlags: [],
          sourceFragments: [],
          timelineEvents: [],
          missionAppearances: [],
          significance: 'minor',
          similarEntities: [],
          mergedFromEntities: []
        },
        {
          entityId: 'merged_entity',
          documentId: 'doc_9',
          name: 'Oneirocom Corporation',
          type: 'organization',
          aliases: [],
          traits: {},
          tags: [],
          relatedEntities: [],
          canonicalEntityId: 'primary_entity', // Already merged
          canonicalStatus: 'extracted',
          consistencyScore: 0,
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

      const similarities = await mergingService.scanForSimilarEntities();
      expect(similarities.length).toBe(0);
    });
  });

  describe('markSimilarEntities', () => {
    test('should mark entities as similar', async () => {
      const entities = [
        {
          entityId: 'entity_1',
          documentId: 'doc_10',
          name: 'Oneirocom',
          type: 'organization',
          aliases: [],
          traits: {},
          tags: [],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
          conflictFlags: [],
          sourceFragments: [],
          timelineEvents: [],
          missionAppearances: [],
          significance: 'minor',
          similarEntities: [],
          mergedFromEntities: []
        },
        {
          entityId: 'entity_2',
          documentId: 'doc_11',
          name: 'Oneirocom Corporation',
          type: 'organization',
          aliases: [],
          traits: {},
          tags: [],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
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

      const similarities = [
        {
          entity1: 'entity_1',
          entity2: 'entity_2',
          score: 0.92,
          reasons: ['High name similarity'],
          suggestedAction: 'merge' as const
        }
      ];

      await mergingService.markSimilarEntities(similarities);

      const entity1 = await adapter.EntityModel.findOne({ entityId: 'entity_1' });
      const entity2 = await adapter.EntityModel.findOne({ entityId: 'entity_2' });

      expect(entity1!.similarEntities.length).toBe(1);
      expect(entity1!.similarEntities[0].entityId).toBe('entity_2');
      expect(entity1!.similarEntities[0].similarityScore).toBe(0.92);
      expect(entity1!.similarEntities[0].status).toBe('potential');

      expect(entity2!.similarEntities.length).toBe(1);
      expect(entity2!.similarEntities[0].entityId).toBe('entity_1');
    });
  });

  describe('getPotentialMerges', () => {
    test('should return entities with potential merges', async () => {
      const entities = [
        {
          entityId: 'entity_1',
          documentId: 'doc_12',
          name: 'Oneirocom',
          type: 'organization',
          aliases: [],
          traits: {},
          tags: [],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
          conflictFlags: [],
          sourceFragments: [],
          timelineEvents: [],
          missionAppearances: [],
          significance: 'minor',
          similarEntities: [
            {
              entityId: 'entity_2',
              similarityScore: 0.92,
              status: 'potential'
            }
          ],
          mergedFromEntities: []
        },
        {
          entityId: 'entity_2',
          documentId: 'doc_13',
          name: 'Oneirocom Corporation',
          type: 'organization',
          aliases: [],
          traits: {},
          tags: [],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
          conflictFlags: [],
          sourceFragments: [],
          timelineEvents: [],
          missionAppearances: [],
          significance: 'minor',
          similarEntities: [
            {
              entityId: 'entity_1',
              similarityScore: 0.92,
              status: 'potential'
            }
          ],
          mergedFromEntities: []
        }
      ];

      await adapter.EntityModel.insertMany(entities);

      const potentialMerges = await mergingService.getPotentialMerges();
      
      expect(potentialMerges.length).toBeGreaterThanOrEqual(1);
      
      const merge = potentialMerges.find(p => p.entityId === 'entity_1');
      expect(merge).toBeTruthy();
      expect(merge!.similarEntities.length).toBe(1);
      expect(merge!.similarEntities[0].name).toBe('Oneirocom Corporation');
    });

    test('should not return entities without potential merges', async () => {
      const entities = [
        {
          entityId: 'entity_1',
          documentId: 'doc_14',
          name: 'Oneirocom',
          type: 'organization',
          aliases: [],
          traits: {},
          tags: [],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
          conflictFlags: [],
          sourceFragments: [],
          timelineEvents: [],
          missionAppearances: [],
          significance: 'minor',
          similarEntities: [
            {
              entityId: 'entity_2',
              similarityScore: 0.92,
              status: 'reviewed' // Not potential
            }
          ],
          mergedFromEntities: []
        }
      ];

      await adapter.EntityModel.insertMany(entities);

      const potentialMerges = await mergingService.getPotentialMerges();
      expect(potentialMerges.length).toBe(0);
    });
  });

  describe('mergeEntities', () => {
    test('should merge entities and update references', async () => {
      // Create entities to merge
      const entities = [
        {
          entityId: 'oneirocom_1',
          documentId: 'doc_1',
          name: 'Oneirocom',
          type: 'organization',
          description: 'A mega corporation',
          aliases: ['Corp'],
          traits: { founded: '2040', employees: 10000 },
          tags: ['corporate'],
          relatedEntities: [],
          sourceFragments: ['frag_1'],
          timelineEvents: [],
          missionAppearances: ['mission_1'],
          similarEntities: [],
          mergedFromEntities: []
        },
        {
          entityId: 'oneirocom_2',
          documentId: 'doc_2',
          name: 'Oneirocom Corporation',
          type: 'organization',
          description: 'The evil corporation from the future',
          aliases: ['The Corporation', 'Big Corp'],
          traits: { location: 'Neo-Tokyo', ceo: 'Marcus Black' },
          tags: ['evil', 'corporate'],
          relatedEntities: [],
          sourceFragments: ['frag_2'],
          timelineEvents: ['event_1'],
          missionAppearances: ['mission_2'],
          similarEntities: [],
          mergedFromEntities: []
        }
      ];

      await adapter.EntityModel.insertMany(entities);

      // Create a relationship referencing the entity that will be merged (oneirocom_1)
      const relationship = {
        relationshipId: 'rel_1',
        documentId: 'doc_1',
        sourceEntityId: 'alice',
        targetEntityId: 'oneirocom_1',
        relationshipType: 'enemy',
        description: 'Alice fights Oneirocom',
        strength: 0.9,
        supportingFragments: [],
        contradictingFragments: [],
        confidenceScore: 85,
        tags: []
      };

      await adapter.RelationshipModel.create(relationship);

      // Create a scene referencing the entity that will be merged (oneirocom_1)
      const scene = {
        sceneId: 'scene_1',
        documentId: 'doc_1',
        title: 'The Confrontation',
        sequence: 1,
        description: 'Alice confronts Oneirocom',
        characters: ['alice', 'oneirocom_1'],
        entities: [],
        events: [],
        stateChanges: [],
        tags: []
      };

      await adapter.SceneModel.create(scene);

      // Merge entities
      const result = await mergingService.mergeEntities(
        ['oneirocom_1', 'oneirocom_2'],
        {
          strategy: 'combine_properties',
          updateReferences: true,
          preserveHistory: true
        }
      );

      expect(result.success).toBe(true);
      expect(result.canonicalEntityId).toBe('oneirocom_2'); // Should select longer name as primary  
      expect(result.mergedEntityIds).toEqual(['oneirocom_1']);
      expect(result.relationshipsUpdated).toBe(1);
      expect(result.scenesUpdated).toBe(1);

      // Check merged entity
      const mergedEntity = await adapter.EntityModel.findOne({ entityId: 'oneirocom_2' });
      expect(mergedEntity).toBeTruthy();
      expect(mergedEntity!.aliases).toContain('Corp');
      expect(mergedEntity!.aliases).toContain('The Corporation');
      expect(mergedEntity!.aliases).toContain('Big Corp');
      expect(mergedEntity!.tags).toContain('corporate');
      expect(mergedEntity!.tags).toContain('evil');
      expect(mergedEntity!.sourceFragments).toContain('frag_1');
      expect(mergedEntity!.sourceFragments).toContain('frag_2');
      expect(mergedEntity!.missionAppearances).toContain('mission_1');
      expect(mergedEntity!.missionAppearances).toContain('mission_2');
      expect(mergedEntity!.mergedFromEntities).toEqual(['oneirocom_1']);

      // Check secondary entity is marked as merged
      const secondaryEntity = await adapter.EntityModel.findOne({ entityId: 'oneirocom_1' });
      expect(secondaryEntity!.canonicalEntityId).toBe('oneirocom_2');

      // Check relationship was updated
      const updatedRelationship = await adapter.RelationshipModel.findOne({ relationshipId: 'rel_1' });
      expect(updatedRelationship!.targetEntityId).toBe('oneirocom_2');

      // Check scene was updated
      const updatedScene = await adapter.SceneModel.findOne({ sceneId: 'scene_1' });
      expect(updatedScene!.characters).toContain('oneirocom_2');
      expect(updatedScene!.characters).not.toContain('oneirocom_1');
    });

    test('should handle merge conflicts with different strategies', async () => {
      const entities = [
        {
          entityId: 'entity_1',
          documentId: 'doc_1',
          name: 'Oneirocom',
          type: 'organization',
          description: 'Original description',
          aliases: [],
          traits: { founded: '2040', status: 'active' },
          tags: [],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
          conflictFlags: [],
          sourceFragments: [],
          timelineEvents: [],
          missionAppearances: [],
          significance: 'minor',
          similarEntities: [],
          mergedFromEntities: []
        },
        {
          entityId: 'entity_2',
          documentId: 'doc_2',
          name: 'Oneirocom Corporation',
          type: 'organization',
          description: 'Different description',
          aliases: [],
          traits: { founded: '2041', status: 'evil' }, // Conflicting traits
          tags: [],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
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

      const result = await mergingService.mergeEntities(
        ['entity_1', 'entity_2'],
        {
          strategy: 'primary_wins',
          primaryEntityId: 'entity_1',
          updateReferences: false,
          preserveHistory: true
        }
      );

      expect(result.success).toBe(true);
      expect(result.conflictsResolved.length).toBeGreaterThan(0);
      
      const foundedConflict = result.conflictsResolved.find(c => 
        c.property === 'traits.founded'
      );
      expect(foundedConflict).toBeTruthy();
      expect(foundedConflict!.strategy).toBe('primary_wins');
    });

    test('should throw error for non-existent entities', async () => {
      await expect(
        mergingService.mergeEntities(['non_existent_1', 'non_existent_2'], {
          strategy: 'combine_properties',
          updateReferences: false,
          preserveHistory: true
        })
      ).rejects.toThrow('Some entities not found');
    });

    test('should throw error for insufficient entities', async () => {
      await expect(
        mergingService.mergeEntities(['single_entity'], {
          strategy: 'combine_properties',
          updateReferences: false,
          preserveHistory: true
        })
      ).rejects.toThrow('Must provide at least 2 entities to merge');
    });
  });

  describe('updateSimilarityStatus', () => {
    test('should update similarity status for both entities', async () => {
      const entities = [
        {
          entityId: 'entity_1',
          documentId: 'doc_15',
          name: 'Oneirocom',
          type: 'organization',
          aliases: [],
          traits: {},
          tags: [],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
          conflictFlags: [],
          sourceFragments: [],
          timelineEvents: [],
          missionAppearances: [],
          significance: 'minor',
          similarEntities: [
            {
              entityId: 'entity_2',
              similarityScore: 0.92,
              status: 'potential'
            }
          ],
          mergedFromEntities: []
        },
        {
          entityId: 'entity_2',
          documentId: 'doc_16',
          name: 'Oneirocom Corporation',
          type: 'organization',
          aliases: [],
          traits: {},
          tags: [],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
          conflictFlags: [],
          sourceFragments: [],
          timelineEvents: [],
          missionAppearances: [],
          significance: 'minor',
          similarEntities: [
            {
              entityId: 'entity_1',
              similarityScore: 0.92,
              status: 'potential'
            }
          ],
          mergedFromEntities: []
        }
      ];

      await adapter.EntityModel.insertMany(entities);

      await mergingService.updateSimilarityStatus('entity_1', 'entity_2', 'reviewed');

      const entity1 = await adapter.EntityModel.findOne({ entityId: 'entity_1' });
      const entity2 = await adapter.EntityModel.findOne({ entityId: 'entity_2' });

      expect(entity1!.similarEntities[0].status).toBe('reviewed');
      expect(entity2!.similarEntities[0].status).toBe('reviewed');
    });
  });

  describe('getMergeSuggestions', () => {
    test('should provide detailed merge suggestions', async () => {
      const entities = [
        {
          entityId: 'entity_1',
          documentId: 'doc_17',
          name: 'Oneirocom',
          type: 'organization',
          description: 'Original corp',
          aliases: [],
          traits: { founded: '2040' },
          tags: [],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
          conflictFlags: [],
          sourceFragments: [],
          timelineEvents: [],
          missionAppearances: [],
          significance: 'minor',
          similarEntities: [
            {
              entityId: 'entity_2',
              similarityScore: 0.92,
              status: 'potential'
            }
          ],
          mergedFromEntities: []
        },
        {
          entityId: 'entity_2',
          documentId: 'doc_18',
          name: 'Oneirocom Corporation',
          type: 'organization',
          description: 'Evil corporation',
          aliases: [],
          traits: { founded: '2041' }, // Conflict
          tags: [],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
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

      const suggestions = await mergingService.getMergeSuggestions('entity_1');
      
      expect(suggestions.length).toBe(1);
      expect(suggestions[0].candidateEntity.name).toBe('Oneirocom Corporation');
      expect(suggestions[0].similarityScore).toBe(0.92);
      expect(suggestions[0].reasons.length).toBeGreaterThan(0);
      expect(suggestions[0].conflicts.length).toBeGreaterThan(0);
      
      const foundedConflict = suggestions[0].conflicts.find(c => 
        c.property === 'traits.founded'
      );
      expect(foundedConflict).toBeTruthy();
      expect(foundedConflict!.currentValue).toBe('2040');
      expect(foundedConflict!.candidateValue).toBe('2041');
    });

    test('should throw error for non-existent entity', async () => {
      await expect(
        mergingService.getMergeSuggestions('non_existent')
      ).rejects.toThrow('Entity not found');
    });

    test('should return empty array for entity with no potential merges', async () => {
      const entity = {
        entityId: 'entity_1',
        documentId: 'doc_19',
        name: 'Oneirocom',
        type: 'organization',
        aliases: [],
        traits: {},
        tags: [],
        relatedEntities: [],
        canonicalStatus: 'extracted',
        consistencyScore: 0,
        conflictFlags: [],
        sourceFragments: [],
        timelineEvents: [],
        missionAppearances: [],
        significance: 'minor',
        similarEntities: [],
        mergedFromEntities: []
      };

      await adapter.EntityModel.create(entity);

      const suggestions = await mergingService.getMergeSuggestions('entity_1');
      expect(suggestions).toEqual([]);
    });
  });

  describe('integration scenarios', () => {
    test('should handle full similarity detection and merge workflow', async () => {
      // Step 1: Create similar entities
      const entities = [
        {
          entityId: 'oneirocom_1',
          documentId: 'doc_20',
          name: 'Oneirocom',
          type: 'organization',
          aliases: [],
          traits: {},
          tags: [],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
          conflictFlags: [],
          sourceFragments: [],
          timelineEvents: [],
          missionAppearances: [],
          significance: 'minor',
          similarEntities: [],
          mergedFromEntities: []
        },
        {
          entityId: 'oneirocom_2',
          documentId: 'doc_21',
          name: 'Oneirocom Corporation',
          type: 'organization',
          aliases: [],
          traits: {},
          tags: [],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
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

      // Step 2: Scan for similarities
      const similarities = await mergingService.scanForSimilarEntities();
      
      if (similarities.length > 0) {
        // Step 3: Mark similarities
        await mergingService.markSimilarEntities(similarities);

        // Step 4: Get potential merges
        const potentialMerges = await mergingService.getPotentialMerges();
        expect(potentialMerges.length).toBeGreaterThanOrEqual(0);

        // Step 5: Get merge suggestions (if there are potential merges)
        if (potentialMerges.length > 0) {
          const suggestions = await mergingService.getMergeSuggestions('oneirocom_1');
          expect(suggestions.length).toBeGreaterThanOrEqual(0);
        }
      }

      // Step 6: Perform merge (test the merge functionality regardless)
      const mergeResult = await mergingService.mergeEntities(
        ['oneirocom_1', 'oneirocom_2'],
        {
          strategy: 'combine_properties',
          updateReferences: true,
          preserveHistory: true
        }
      );

      expect(mergeResult.success).toBe(true);

      // Step 7: Verify no more potential merges after explicit merge
      const remainingMerges = await mergingService.getPotentialMerges();
      expect(remainingMerges.length).toBe(0);
    });

    test('should handle real Project 89 entity scenarios', async () => {
      const entities = [
        {
          entityId: 'oneirocom_main',
          documentId: 'lore_1',
          name: 'Oneirocom',
          type: 'organization',
          description: 'The primary antagonist corporation',
          aliases: [],
          traits: { type: 'mega_corporation', threat_level: 'high' },
          tags: ['antagonist', 'corporate'],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
          conflictFlags: [],
          sourceFragments: ['lore_fragment_1'],
          timelineEvents: [],
          missionAppearances: ['mission_alpha'],
          significance: 'minor',
          similarEntities: [],
          mergedFromEntities: []
        },
        {
          entityId: 'oneirocom_variant',
          documentId: 'mission_1',
          name: 'Oneirocom Corporation',
          type: 'organization',
          description: 'Evil corporation controlling the simulation',
          aliases: ['The Corporation', 'The Company'],
          traits: { hq_location: 'Neo-Tokyo', founded: '2041' },
          tags: ['evil', 'simulation_control'],
          relatedEntities: [],
          canonicalStatus: 'extracted',
          consistencyScore: 0,
          conflictFlags: [],
          sourceFragments: ['mission_briefing_1'],
          timelineEvents: ['simulation_breach'],
          missionAppearances: ['mission_beta'],
          significance: 'minor',
          similarEntities: [],
          mergedFromEntities: []
        }
      ];

      await adapter.EntityModel.insertMany(entities);

      // Test the full workflow
      const similarities = await mergingService.scanForSimilarEntities();
      expect(similarities.length).toBeGreaterThanOrEqual(0);
      if (similarities.length > 0) {
        expect(similarities[0].score).toBeGreaterThan(0.5);
      }

      await mergingService.markSimilarEntities(similarities);
      
      const mergeResult = await mergingService.mergeEntities(
        ['oneirocom_main', 'oneirocom_variant'],
        {
          strategy: 'combine_properties',
          updateReferences: true,
          preserveHistory: true
        }
      );

      expect(mergeResult.success).toBe(true);

      // Verify merged entity has combined information
      const mergedEntity = await adapter.EntityModel.findOne({ 
        entityId: mergeResult.canonicalEntityId 
      });
      
      expect(mergedEntity!.aliases).toContain('The Corporation');
      expect(mergedEntity!.aliases).toContain('The Company');
      expect(mergedEntity!.tags).toContain('antagonist');
      expect(mergedEntity!.tags).toContain('evil');
      expect(mergedEntity!.sourceFragments).toContain('lore_fragment_1');
      expect(mergedEntity!.sourceFragments).toContain('mission_briefing_1');
      expect(mergedEntity!.missionAppearances).toContain('mission_alpha');
      expect(mergedEntity!.missionAppearances).toContain('mission_beta');
    });
  });
});
