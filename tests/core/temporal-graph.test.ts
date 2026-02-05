/**
 * Tests for TemporalNarrativeGraph
 * Critical for tracking graph state changes over time
 */

import { 
  TemporalNarrativeGraph, 
  EntityState, 
  RelationshipState, 
  DetailedStateChange,
  StateChangeType 
} from '../../src/core/temporal-graph';

describe('TemporalNarrativeGraph', () => {
  let temporalGraph: TemporalNarrativeGraph;

  beforeEach(() => {
    temporalGraph = new TemporalNarrativeGraph();
  });

  describe('createSnapshot', () => {
    test('should create a snapshot with correct structure', () => {
      const entities: EntityState[] = [
        {
          entityId: 'alice',
          properties: { name: 'Alice Chen', health: 100 },
          location: 'neo_tokyo',
          status: 'active',
          version: 1,
          lastModified: new Date()
        }
      ];

      const relationships: RelationshipState[] = [
        {
          relationshipId: 'rel_alice_bob',
          sourceEntityId: 'alice',
          targetEntityId: 'bob',
          type: 'ally',
          strength: 0.8,
          properties: {},
          active: true,
          version: 1,
          lastModified: new Date()
        }
      ];

      const changes: DetailedStateChange[] = [
        {
          changeId: 'change_1',
          entityId: 'alice',
          changeType: 'entity_creation',
          propertyPath: 'status',
          previousValue: undefined,
          newValue: 'active',
          causedBy: {
            eventId: 'event_1',
            sceneId: 'scene_1',
            description: 'Alice enters the story'
          },
          confidence: 1.0,
          evidence: ['Scene 1 introduction'],
          timestamp: new Date(),
          sequence: 1
        }
      ];

      const snapshot = temporalGraph.createSnapshot(
        'scene_1', 
        1, 
        entities, 
        relationships, 
        changes
      );

      expect(snapshot.snapshotId).toContain('snapshot_scene_1_1');
      expect(snapshot.sceneId).toBe('scene_1');
      expect(snapshot.sequence).toBe(1);
      expect(snapshot.entities.size).toBe(1);
      expect(snapshot.relationships.size).toBe(1);
      expect(snapshot.changeLog).toEqual(changes);
    });

    test('should link snapshots with previous snapshot', () => {
      const entities: EntityState[] = [];
      const relationships: RelationshipState[] = [];
      const changes: DetailedStateChange[] = [];

      const snapshot1 = temporalGraph.createSnapshot('scene_1', 1, entities, relationships, changes);
      const snapshot2 = temporalGraph.createSnapshot('scene_2', 2, entities, relationships, changes, snapshot1.snapshotId);

      expect(snapshot2.previousSnapshot).toBe(snapshot1.snapshotId);
    });
  });

  describe('getGraphAtSnapshot', () => {
    test('should retrieve specific snapshot', () => {
      const entities: EntityState[] = [{
        entityId: 'alice',
        properties: { name: 'Alice Chen' },
        status: 'active',
        version: 1,
        lastModified: new Date()
      }];

      const snapshot = temporalGraph.createSnapshot('scene_1', 1, entities, [], []);
      const retrieved = temporalGraph.getGraphAtSnapshot(snapshot.snapshotId);

      expect(retrieved).toBeTruthy();
      expect(retrieved!.snapshotId).toBe(snapshot.snapshotId);
      expect(retrieved!.entities.get('alice')).toBeTruthy();
    });

    test('should return null for non-existent snapshot', () => {
      const retrieved = temporalGraph.getGraphAtSnapshot('non_existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('getGraphAtScene', () => {
    test('should retrieve latest snapshot for scene', () => {
      const entities: EntityState[] = [{
        entityId: 'alice',
        properties: { name: 'Alice Chen', health: 100 },
        status: 'active',
        version: 1,
        lastModified: new Date()
      }];

      temporalGraph.createSnapshot('scene_1', 1, entities, [], []);
      
      const updatedEntities: EntityState[] = [{
        entityId: 'alice',
        properties: { name: 'Alice Chen', health: 80 },
        status: 'active',
        version: 2,
        lastModified: new Date()
      }];
      
      temporalGraph.createSnapshot('scene_1', 2, updatedEntities, [], []);

      const retrieved = temporalGraph.getGraphAtScene('scene_1');
      expect(retrieved).toBeTruthy();
      expect(retrieved!.sequence).toBe(2);
      expect(retrieved!.entities.get('alice')!.properties.health).toBe(80);
    });

    test('should retrieve specific sequence for scene', () => {
      const entities: EntityState[] = [{
        entityId: 'alice',
        properties: { health: 100 },
        status: 'active',
        version: 1,
        lastModified: new Date()
      }];

      temporalGraph.createSnapshot('scene_1', 1, entities, [], []);
      
      const updatedEntities: EntityState[] = [{
        entityId: 'alice',
        properties: { health: 80 },
        status: 'active',
        version: 2,
        lastModified: new Date()
      }];
      
      temporalGraph.createSnapshot('scene_1', 2, updatedEntities, [], []);

      const retrieved = temporalGraph.getGraphAtScene('scene_1', 1);
      expect(retrieved).toBeTruthy();
      expect(retrieved!.sequence).toBe(1);
      expect(retrieved!.entities.get('alice')!.properties.health).toBe(100);
    });
  });

  describe('getEntityHistory', () => {
    test('should track entity changes across snapshots', () => {
      const entityV1: EntityState = {
        entityId: 'alice',
        properties: { name: 'Alice Chen', health: 100, status: 'healthy' },
        location: 'neo_tokyo',
        status: 'active',
        version: 1,
        lastModified: new Date()
      };

      const change1: DetailedStateChange = {
        changeId: 'change_1',
        entityId: 'alice',
        changeType: 'entity_creation',
        propertyPath: 'status',
        previousValue: undefined,
        newValue: 'active',
        causedBy: {
          eventId: 'event_1',
          sceneId: 'scene_1',
          description: 'Alice enters'
        },
        confidence: 1.0,
        evidence: [],
        timestamp: new Date(),
        sequence: 1
      };

      temporalGraph.createSnapshot('scene_1', 1, [entityV1], [], [change1]);

      const entityV2: EntityState = {
        ...entityV1,
        properties: { ...entityV1.properties, health: 50, status: 'injured' },
        version: 2,
        lastModified: new Date()
      };

      const change2: DetailedStateChange = {
        changeId: 'change_2',
        entityId: 'alice',
        changeType: 'property_modification',
        propertyPath: 'health',
        previousValue: 100,
        newValue: 50,
        causedBy: {
          eventId: 'event_2',
          sceneId: 'scene_2',
          description: 'Alice injured in fight'
        },
        confidence: 0.9,
        evidence: [],
        timestamp: new Date(),
        sequence: 2
      };

      temporalGraph.createSnapshot('scene_2', 2, [entityV2], [], [change2]);

      const history = temporalGraph.getEntityHistory('alice');
      expect(history).toBeTruthy();
      expect(history!.entityId).toBe('alice');
      expect(history!.timeline.length).toBe(2);
      
      // Check timeline order
      expect(history!.timeline[0].sequence).toBe(1);
      expect(history!.timeline[1].sequence).toBe(2);
      
      // Check significant events
      expect(history!.significantEvents.length).toBe(1); // birth event
      expect(history!.significantEvents[0].eventType).toBe('birth');
    });

    test('should return null for non-existent entity', () => {
      const history = temporalGraph.getEntityHistory('non_existent');
      expect(history).toBeNull();
    });
  });

  describe('getEntityStateChanges', () => {
    test('should filter changes by entity', () => {
      const aliceChanges: DetailedStateChange[] = [
        {
          changeId: 'change_1',
          entityId: 'alice',
          changeType: 'entity_creation',
          propertyPath: 'status',
          previousValue: undefined,
          newValue: 'active',
          causedBy: { eventId: 'e1', sceneId: 's1', description: 'test' },
          confidence: 1.0,
          evidence: [],
          timestamp: new Date(),
          sequence: 1
        },
        {
          changeId: 'change_2',
          entityId: 'alice',
          changeType: 'property_modification',
          propertyPath: 'health',
          previousValue: 100,
          newValue: 80,
          causedBy: { eventId: 'e2', sceneId: 's2', description: 'test' },
          confidence: 1.0,
          evidence: [],
          timestamp: new Date(),
          sequence: 2
        }
      ];

      const bobChanges: DetailedStateChange[] = [
        {
          changeId: 'change_3',
          entityId: 'bob',
          changeType: 'entity_creation',
          propertyPath: 'status',
          previousValue: undefined,
          newValue: 'active',
          causedBy: { eventId: 'e3', sceneId: 's1', description: 'test' },
          confidence: 1.0,
          evidence: [],
          timestamp: new Date(),
          sequence: 1
        }
      ];

      temporalGraph.createSnapshot('scene_1', 1, [], [], [...aliceChanges, ...bobChanges]);

      const aliceStateChanges = temporalGraph.getEntityStateChanges('alice');
      expect(aliceStateChanges.length).toBe(2);
      expect(aliceStateChanges.every(c => c.entityId === 'alice')).toBe(true);

      const bobStateChanges = temporalGraph.getEntityStateChanges('bob');
      expect(bobStateChanges.length).toBe(1);
      expect(bobStateChanges[0].entityId).toBe('bob');
    });

    test('should filter changes by temporal query', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 1000000);
      const future = new Date(now.getTime() + 1000000);

      const changes: DetailedStateChange[] = [
        {
          changeId: 'change_1',
          entityId: 'alice',
          changeType: 'entity_creation',
          propertyPath: 'status',
          previousValue: undefined,
          newValue: 'active',
          causedBy: { eventId: 'e1', sceneId: 's1', description: 'test' },
          confidence: 1.0,
          evidence: [],
          timestamp: past,
          sequence: 1
        },
        {
          changeId: 'change_2',
          entityId: 'alice',
          changeType: 'property_modification',
          propertyPath: 'health',
          previousValue: 100,
          newValue: 80,
          causedBy: { eventId: 'e2', sceneId: 's2', description: 'test' },
          confidence: 1.0,
          evidence: [],
          timestamp: now,
          sequence: 2
        }
      ];

      temporalGraph.createSnapshot('scene_1', 1, [], [], changes);

      const filteredChanges = temporalGraph.getEntityStateChanges('alice', {
        timeRange: { start: past, end: past }
      });

      expect(filteredChanges.length).toBe(1);
      expect(filteredChanges[0].changeId).toBe('change_1');
    });
  });

  describe('getRelationshipHistory', () => {
    test('should track relationship evolution', () => {
      const relationship: RelationshipState = {
        relationshipId: 'rel_alice_bob',
        sourceEntityId: 'alice',
        targetEntityId: 'bob',
        type: 'ally',
        strength: 0.5,
        properties: {},
        active: true,
        version: 1,
        lastModified: new Date()
      };

      temporalGraph.createSnapshot('scene_1', 1, [], [relationship], []);

      const updatedRelationship: RelationshipState = {
        ...relationship,
        strength: 0.9,
        version: 2,
        lastModified: new Date()
      };

      const change: DetailedStateChange = {
        changeId: 'change_1',
        relationshipId: 'rel_alice_bob',
        changeType: 'relationship_strengthening',
        propertyPath: 'strength',
        previousValue: 0.5,
        newValue: 0.9,
        causedBy: { eventId: 'e1', sceneId: 's2', description: 'trust building' },
        confidence: 1.0,
        evidence: [],
        timestamp: new Date(),
        sequence: 2
      };

      temporalGraph.createSnapshot('scene_2', 2, [], [updatedRelationship], [change]);

      const history = temporalGraph.getRelationshipHistory('rel_alice_bob');
      expect(history.length).toBe(2);
      expect(history[0].state.strength).toBe(0.5);
      expect(history[1].state.strength).toBe(0.9);
      expect(history[1].changes.length).toBe(1);
    });
  });

  describe('detectTemporalInconsistencies', () => {
    test('should detect entity active after destruction', () => {
      const entityDestroyed: EntityState = {
        entityId: 'alice',
        properties: { name: 'Alice Chen' },
        status: 'destroyed',
        version: 1,
        lastModified: new Date()
      };

      const destroyChange: DetailedStateChange = {
        changeId: 'change_1',
        entityId: 'alice',
        changeType: 'entity_destruction',
        propertyPath: 'status',
        previousValue: 'active',
        newValue: 'destroyed',
        causedBy: { eventId: 'e1', sceneId: 's1', description: 'Alice dies' },
        confidence: 1.0,
        evidence: [],
        timestamp: new Date(),
        sequence: 1
      };

      temporalGraph.createSnapshot('scene_1', 1, [entityDestroyed], [], [destroyChange]);

      const entityActiveAgain: EntityState = {
        ...entityDestroyed,
        status: 'active',
        version: 2,
        lastModified: new Date()
      };

      temporalGraph.createSnapshot('scene_2', 2, [entityActiveAgain], [], []);

      const inconsistencies = temporalGraph.detectTemporalInconsistencies();
      expect(inconsistencies.length).toBeGreaterThan(0);
      
      const contradiction = inconsistencies.find(i => 
        i.type === 'entity_timeline' && 
        i.description.includes('active after being destroyed')
      );
      expect(contradiction).toBeTruthy();
      expect(contradiction!.severity).toBe('high');
    });

    test('should detect property contradictions', () => {
      const entity1: EntityState = {
        entityId: 'alice',
        properties: { status: 'alive' },
        status: 'active',
        version: 1,
        lastModified: new Date()
      };

      const change1: DetailedStateChange = {
        changeId: 'change_1',
        entityId: 'alice',
        changeType: 'property_modification',
        propertyPath: 'status',
        previousValue: undefined,
        newValue: 'alive',
        causedBy: { eventId: 'e1', sceneId: 's1', description: 'Alice is alive' },
        confidence: 1.0,
        evidence: [],
        timestamp: new Date(),
        sequence: 1
      };

      temporalGraph.createSnapshot('scene_1', 1, [entity1], [], [change1]);

      const entity2: EntityState = {
        ...entity1,
        properties: { status: 'dead' },
        version: 2,
        lastModified: new Date()
      };

      const change2: DetailedStateChange = {
        changeId: 'change_2',
        entityId: 'alice',
        changeType: 'property_modification',
        propertyPath: 'status',
        previousValue: 'alive',
        newValue: 'dead',
        causedBy: { eventId: 'e2', sceneId: 's2', description: 'Alice dies' },
        confidence: 1.0,
        evidence: [],
        timestamp: new Date(),
        sequence: 2
      };

      temporalGraph.createSnapshot('scene_2', 2, [entity2], [], [change2]);

      const entity3: EntityState = {
        ...entity2,
        properties: { status: 'alive' },
        version: 3,
        lastModified: new Date()
      };

      const change3: DetailedStateChange = {
        changeId: 'change_3',
        entityId: 'alice',
        changeType: 'property_modification',
        propertyPath: 'status',
        previousValue: 'dead',
        newValue: 'alive',
        causedBy: { eventId: 'e3', sceneId: 's3', description: 'Alice is alive again' },
        confidence: 1.0,
        evidence: [],
        timestamp: new Date(),
        sequence: 3
      };

      temporalGraph.createSnapshot('scene_3', 3, [entity3], [], [change3]);

      const inconsistencies = temporalGraph.detectTemporalInconsistencies();
      expect(inconsistencies.length).toBeGreaterThan(0);
      
      const contradiction = inconsistencies.find(i => 
        i.type === 'property_contradiction' && 
        i.description.includes('contradictory values')
      );
      expect(contradiction).toBeTruthy();
    });
  });

  describe('generateTemporalAnalytics', () => {
    test('should generate comprehensive analytics', () => {
      const entities: EntityState[] = [
        {
          entityId: 'alice',
          properties: { name: 'Alice Chen' },
          status: 'active',
          version: 1,
          lastModified: new Date()
        },
        {
          entityId: 'bob',
          properties: { name: 'Bob Martinez' },
          status: 'active',
          version: 1,
          lastModified: new Date()
        }
      ];

      const relationships: RelationshipState[] = [
        {
          relationshipId: 'rel_1',
          sourceEntityId: 'alice',
          targetEntityId: 'bob',
          type: 'ally',
          strength: 0.8,
          properties: {},
          active: true,
          version: 1,
          lastModified: new Date()
        }
      ];

      const changes: DetailedStateChange[] = [
        {
          changeId: 'change_1',
          entityId: 'alice',
          changeType: 'entity_creation',
          propertyPath: 'status',
          previousValue: undefined,
          newValue: 'active',
          causedBy: { eventId: 'e1', sceneId: 's1', description: 'Alice enters' },
          confidence: 1.0,
          evidence: [],
          timestamp: new Date(),
          sequence: 1
        },
        {
          changeId: 'change_2',
          entityId: 'bob',
          changeType: 'entity_creation',
          propertyPath: 'status',
          previousValue: undefined,
          newValue: 'active',
          causedBy: { eventId: 'e2', sceneId: 's1', description: 'Bob enters' },
          confidence: 1.0,
          evidence: [],
          timestamp: new Date(),
          sequence: 1
        }
      ];

      temporalGraph.createSnapshot('scene_1', 1, entities, relationships, changes);

      const analytics = temporalGraph.generateTemporalAnalytics();

      expect(analytics.totalSnapshots).toBe(1);
      expect(analytics.totalStateChanges).toBe(2);
      expect(analytics.entitiesTracked).toBe(2);
      expect(analytics.relationshipsTracked).toBe(1);
      expect(analytics.averageChangesPerScene).toBe(2);
      expect(analytics.mostActiveEntities.length).toBeGreaterThan(0);
      expect(analytics.temporalConsistencyScore).toBeGreaterThanOrEqual(0);
      expect(analytics.temporalConsistencyScore).toBeLessThanOrEqual(100);
    });

    test('should identify most active entities', () => {
      const changes: DetailedStateChange[] = [
        {
          changeId: 'change_1',
          entityId: 'alice',
          changeType: 'property_modification',
          propertyPath: 'health',
          previousValue: 100,
          newValue: 90,
          causedBy: { eventId: 'e1', sceneId: 's1', description: 'Alice hurt' },
          confidence: 1.0,
          evidence: [],
          timestamp: new Date(),
          sequence: 1
        },
        {
          changeId: 'change_2',
          entityId: 'alice',
          changeType: 'property_modification',
          propertyPath: 'health',
          previousValue: 90,
          newValue: 80,
          causedBy: { eventId: 'e2', sceneId: 's1', description: 'Alice hurt more' },
          confidence: 1.0,
          evidence: [],
          timestamp: new Date(),
          sequence: 1
        },
        {
          changeId: 'change_3',
          entityId: 'bob',
          changeType: 'property_modification',
          propertyPath: 'mood',
          previousValue: 'happy',
          newValue: 'sad',
          causedBy: { eventId: 'e3', sceneId: 's1', description: 'Bob sad' },
          confidence: 1.0,
          evidence: [],
          timestamp: new Date(),
          sequence: 1
        }
      ];

      temporalGraph.createSnapshot('scene_1', 1, [], [], changes);

      const analytics = temporalGraph.generateTemporalAnalytics();
      expect(analytics.mostActiveEntities.length).toBeGreaterThan(0);
      expect(analytics.mostActiveEntities[0].entityId).toBe('alice');
      expect(analytics.mostActiveEntities[0].changeCount).toBe(2);
    });
  });

  describe('edge cases', () => {
    test('should handle empty snapshots', () => {
      const snapshot = temporalGraph.createSnapshot('scene_1', 1, [], [], []);
      expect(snapshot.entities.size).toBe(0);
      expect(snapshot.relationships.size).toBe(0);
      expect(snapshot.changeLog.length).toBe(0);
    });

    test('should handle snapshots with same entity across multiple scenes', () => {
      const entity: EntityState = {
        entityId: 'alice',
        properties: { name: 'Alice Chen' },
        status: 'active',
        version: 1,
        lastModified: new Date()
      };

      temporalGraph.createSnapshot('scene_1', 1, [entity], [], []);
      temporalGraph.createSnapshot('scene_2', 1, [entity], [], []);

      const history = temporalGraph.getEntityHistory('alice');
      expect(history!.timeline.length).toBe(2);
    });

    test('should handle analytics with no data', () => {
      const analytics = temporalGraph.generateTemporalAnalytics();
      expect(analytics.totalSnapshots).toBe(0);
      expect(analytics.totalStateChanges).toBe(0);
      expect(analytics.entitiesTracked).toBe(0);
      expect(analytics.relationshipsTracked).toBe(0);
      expect(analytics.averageChangesPerScene).toBe(0);
      expect(analytics.mostActiveEntities).toEqual([]);
      expect(analytics.temporalConsistencyScore).toBe(100); // No inconsistencies
    });
  });
});
