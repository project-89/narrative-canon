import { describe, it, expect } from '@jest/globals';
import {
  GraphOperation,
  AddEntityOperation,
  UpdateEntityOperation,
  NarrativeCommit,
  CanonicalEvent,
  GraphCondition,
  TimelineBranch,
  MergeConflict,
  GraphDiff
} from '../../src/git/types';

describe('Narrative Git Types', () => {
  describe('GraphOperation', () => {
    it('should create valid entity operations', () => {
      const addOp: AddEntityOperation = {
        id: 'op1',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'char_kira',
          type: 'character',
          name: 'Kira',
          description: 'Project 89 operative',
          properties: {
            location: 'Neo-Tokyo',
            status: 'active'
          }
        },
        metadata: {
          reason: 'Character introduction',
          impact: 'major'
        }
      };

      expect(addOp.type).toBe('ADD_ENTITY');
      expect(addOp.payload.name).toBe('Kira');
      expect(addOp.metadata?.impact).toBe('major');
    });

    it('should create valid update operations', () => {
      const updateOp: UpdateEntityOperation = {
        id: 'op2',
        type: 'UPDATE_ENTITY',
        timestamp: Date.now(),
        payload: {
          entityId: 'char_kira',
          changes: {
            properties: {
              status: 'awakened',
              abilities: ['timeline-perception']
            }
          },
          mergeArrays: true
        }
      };

      expect(updateOp.type).toBe('UPDATE_ENTITY');
      expect(updateOp.payload.changes.properties?.status).toBe('awakened');
    });
  });

  describe('NarrativeCommit', () => {
    it('should create valid commit with operations', () => {
      const commit: NarrativeCommit = {
        id: 'commit_001',
        author: 'test-author',
        timestamp: Date.now(),
        message: 'Kira discovers the glitch',
        treeHash: 'abc123',
        operations: [
          {
            id: 'op1',
            type: 'ADD_ENTITY',
            timestamp: Date.now(),
            payload: { id: 'glitch_001', type: 'phenomenon' }
          }
        ],
        metrics: {
          coherenceScore: 0.95,
          timelineDivergence: 0.1,
          entitiesAffected: 1,
          relationshipsChanged: 0
        }
      };

      expect(commit.operations).toHaveLength(1);
      expect(commit.metrics.coherenceScore).toBe(0.95);
    });

    it('should link to canonical events', () => {
      const canonicalEvent: CanonicalEvent = {
        id: 'event_glitch_discovery',
        name: 'The Glitch Discovery',
        description: 'Kira discovers reality tear',
        plotSignificance: 'critical',
        allowsBranching: true
      };

      const commit: NarrativeCommit = {
        id: 'commit_002',
        author: 'test-author',
        timestamp: Date.now(),
        message: 'Critical plot point',
        treeHash: 'def456',
        operations: [],
        canonicalEvent,
        metrics: {
          coherenceScore: 1.0,
          timelineDivergence: 0.5,
          entitiesAffected: 3,
          relationshipsChanged: 2
        }
      };

      expect(commit.canonicalEvent?.plotSignificance).toBe('critical');
      expect(commit.canonicalEvent?.allowsBranching).toBe(true);
    });
  });

  describe('GraphCondition', () => {
    it('should create entity existence conditions', () => {
      const condition: GraphCondition = {
        id: 'cond1',
        type: 'ENTITY_EXISTS',
        entityId: 'char_kira'
      };

      expect(condition.type).toBe('ENTITY_EXISTS');
      expect(condition.entityId).toBe('char_kira');
    });

    it('should create property equality conditions', () => {
      const condition: GraphCondition = {
        id: 'cond2',
        type: 'PROPERTY_EQUALS',
        entityId: 'char_kira',
        property: 'status',
        value: 'awakened'
      };

      expect(condition.type).toBe('PROPERTY_EQUALS');
      expect(condition.value).toBe('awakened');
    });

    it('should support logical operators', () => {
      const complexCondition: GraphCondition = {
        id: 'cond3',
        type: 'CUSTOM',
        and: [
          {
            id: 'sub1',
            type: 'ENTITY_EXISTS',
            entityId: 'char_kira'
          },
          {
            id: 'sub2',
            type: 'PROPERTY_EQUALS',
            entityId: 'char_kira',
            property: 'location',
            value: 'Sector 7'
          }
        ]
      };

      expect(complexCondition.and).toHaveLength(2);
      expect(complexCondition.and![0].type).toBe('ENTITY_EXISTS');
    });
  });

  describe('TimelineBranch', () => {
    it('should create valid timeline branches', () => {
      const branch: TimelineBranch = {
        id: 'branch_alt_001',
        name: 'Kira Refuses Awakening',
        description: 'Timeline where Kira rejects the truth',
        parentCommit: 'commit_001',
        headCommit: 'commit_005',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        probability: 0.3,
        isCanon: false,
        tags: ['alternate', 'tragic']
      };

      expect(branch.probability).toBe(0.3);
      expect(branch.isCanon).toBe(false);
      expect(branch.tags).toContain('alternate');
    });

    it('should track merge information', () => {
      const mergedBranch: TimelineBranch = {
        id: 'branch_merged',
        name: 'Temporary Branch',
        parentCommit: 'commit_001',
        headCommit: 'commit_003',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        probability: 0.5,
        isCanon: false,
        merged: {
          into: 'main',
          at: 'commit_010',
          resolution: 'three-way'
        }
      };

      expect(mergedBranch.merged?.resolution).toBe('three-way');
    });
  });

  describe('MergeConflict', () => {
    it('should represent entity conflicts', () => {
      const conflict: MergeConflict = {
        type: 'ENTITY_CONFLICT',
        entityId: 'char_kira',
        property: 'status',
        sourceValue: 'awakened',
        targetValue: 'dormant',
        baseValue: 'active',
        suggestions: [
          {
            action: 'prefer-source',
            description: 'Keep Kira as awakened (source branch)',
            confidence: 0.8
          },
          {
            action: 'prefer-target',
            description: 'Keep Kira as dormant (target branch)',
            confidence: 0.2
          }
        ]
      };

      expect(conflict.type).toBe('ENTITY_CONFLICT');
      expect(conflict.suggestions).toHaveLength(2);
      expect(conflict.suggestions[0].confidence).toBe(0.8);
    });

    it('should represent timeline paradoxes', () => {
      const paradox: MergeConflict = {
        type: 'TIMELINE_PARADOX',
        sourceValue: 'Kira saves Marcus',
        targetValue: 'Marcus dies before meeting Kira',
        suggestions: [
          {
            action: 'create-alternate-timeline',
            description: 'Create a new branch to resolve paradox',
            confidence: 0.9
          }
        ]
      };

      expect(paradox.type).toBe('TIMELINE_PARADOX');
    });
  });

  describe('GraphDiff', () => {
    it('should represent differences between commits', () => {
      const diff: GraphDiff = {
        from: 'commit_001',
        to: 'commit_005',
        addedEntities: [
          {
            id: 'char_new',
            type: 'character',
            name: 'New Character',
            description: 'Added in commit'
          }
        ],
        removedEntities: ['char_old'],
        modifiedEntities: [
          {
            entityId: 'char_kira',
            changes: {
              properties: {
                status: 'evolved'
              }
            }
          }
        ],
        addedRelationships: [],
        removedRelationships: [],
        modifiedRelationships: [],
        stats: {
          totalChanges: 3,
          entitiesAffected: 3,
          relationshipsAffected: 0,
          timelineDivergence: 0.15
        }
      };

      expect(diff.stats.totalChanges).toBe(3);
      expect(diff.addedEntities).toHaveLength(1);
      expect(diff.removedEntities).toHaveLength(1);
      expect(diff.modifiedEntities).toHaveLength(1);
    });
  });
});
