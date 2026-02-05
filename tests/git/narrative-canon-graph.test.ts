import { describe, it, expect, beforeEach } from '@jest/globals';
import { NarrativeCanonGraph } from '../../src/git/narrative-canon-graph';
import { 
  AddEntityOperation,
  UpdateEntityOperation,
  AddRelationshipOperation,
  RemoveEntityOperation
} from '../../src/git/types';

describe('NarrativeCanonGraph', () => {
  let graph: NarrativeCanonGraph;

  beforeEach(() => {
    graph = new NarrativeCanonGraph();
  });

  describe('Basic Operations', () => {
    it('should initialize with main branch', () => {
      const branches = graph['branches'];
      expect(branches.has('main')).toBe(true);
      expect(branches.get('main')?.isCanon).toBe(true);
      expect(branches.get('main')?.probability).toBe(1.0);
    });

    it('should stage and commit operations', async () => {
      const addOp: AddEntityOperation = {
        id: 'op1',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'char_kira',
          type: 'character',
          name: 'Kira',
          description: 'Project 89 operative'
        }
      };

      graph.stage(addOp);
      
      const commit = await graph.commit({
        author: 'test-author',
        message: 'Add Kira character'
      });

      expect(commit.operations).toHaveLength(1);
      expect(commit.operations[0]).toBe(addOp);
      expect(commit.author).toBe('test-author');
      expect(commit.message).toBe('Add Kira character');
      expect(commit.branch).toBe('main');
    });

    it('should clear staged operations after commit', async () => {
      const op: AddEntityOperation = {
        id: 'op1',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'test_entity',
          type: 'object',
          name: 'Test',
          description: 'Test entity'
        }
      };

      graph.stage(op);
      await graph.commit({
        author: 'test',
        message: 'Test commit'
      });

      // Staged operations should be cleared
      expect(graph['stagedOperations']).toHaveLength(0);
    });

    it('should apply entity operations correctly', async () => {
      // Add entity
      const addOp: AddEntityOperation = {
        id: 'op1',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'char_kira',
          type: 'character',
          name: 'Kira',
          description: 'Initial description',
          properties: {
            status: 'active'
          }
        }
      };

      graph.stage(addOp);
      await graph.commit({
        author: 'test',
        message: 'Add Kira'
      });

      const entity = graph.getEntity('char_kira');
      expect(entity).toBeDefined();
      expect(entity?.name).toBe('Kira');

      // Update entity
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
          }
        }
      };

      graph.stage(updateOp);
      await graph.commit({
        author: 'test',
        message: 'Kira awakens'
      });

      const updated = graph.getEntity('char_kira');
      expect(updated?.properties?.status).toBe('awakened');
      expect(updated?.properties?.abilities).toContain('timeline-perception');
    });

    it('should handle relationship operations', async () => {
      // First add entities
      const addKira: AddEntityOperation = {
        id: 'op1',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'char_kira',
          type: 'character',
          name: 'Kira',
          description: 'Agent'
        }
      };

      const addGlitch: AddEntityOperation = {
        id: 'op2',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'glitch_001',
          type: 'phenomenon',
          name: 'Reality Glitch',
          description: 'Anomaly'
        }
      };

      graph.stage(addKira, addGlitch);
      await graph.commit({
        author: 'test',
        message: 'Add entities'
      });

      // Add relationship
      const addRel: AddRelationshipOperation = {
        id: 'op3',
        type: 'ADD_RELATIONSHIP',
        timestamp: Date.now(),
        payload: {
          id: 'rel_discovers',
          type: 'discovered',
          source: 'char_kira',
          target: 'glitch_001',
          properties: {
            when: '2089-03-15'
          }
        }
      };

      graph.stage(addRel);
      await graph.commit({
        author: 'test',
        message: 'Kira discovers glitch'
      });

      const rel = graph.getRelationship('rel_discovers');
      expect(rel).toBeDefined();
      expect(rel?.type).toBe('discovered');
      expect(rel?.source).toBe('char_kira');
      expect(rel?.target).toBe('glitch_001');
    });
  });

  describe('Branching', () => {
    it('should create new branches', async () => {
      // First create a commit to branch from
      const op: AddEntityOperation = {
        id: 'op1',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'test',
          type: 'object',
          name: 'Test',
          description: 'Test'
        }
      };

      graph.stage(op);
      const commit = await graph.commit({
        author: 'test',
        message: 'Initial commit'
      });

      // Create branch
      const branch = graph.branch('alternate-timeline');

      expect(branch.name).toBe('alternate-timeline');
      expect(branch.parentCommit).toBe(commit.id);
      expect(branch.headCommit).toBe(commit.id);
      expect(branch.probability).toBe(0.5);
      expect(branch.isCanon).toBe(false);
    });

    it('should switch between branches', async () => {
      // Create initial commit on main
      const op1: AddEntityOperation = {
        id: 'op1',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'entity_main',
          type: 'object',
          name: 'Main Entity',
          description: 'On main branch'
        }
      };

      graph.stage(op1);
      await graph.commit({
        author: 'test',
        message: 'Main branch commit'
      });

      // Create and switch to new branch
      graph.branch('feature');
      await graph.checkout('feature');

      expect(graph['currentBranch']).toBe('feature');

      // Add entity on feature branch
      const op2: AddEntityOperation = {
        id: 'op2',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'entity_feature',
          type: 'object',
          name: 'Feature Entity',
          description: 'On feature branch'
        }
      };

      graph.stage(op2);
      const featureCommit = await graph.commit({
        author: 'test',
        message: 'Feature branch commit'
      });

      expect(featureCommit.branch).toBe('feature');

      // Entities should exist
      expect(graph.hasEntity('entity_main')).toBe(true);
      expect(graph.hasEntity('entity_feature')).toBe(true);
    });

    it('should throw error for non-existent branch', async () => {
      await expect(graph.checkout('non-existent')).rejects.toThrow();
    });
  });

  describe('Commit History', () => {
    it('should track parent commits', async () => {
      const op1: AddEntityOperation = {
        id: 'op1',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'entity1',
          type: 'object',
          name: 'Entity 1',
          description: 'First'
        }
      };

      graph.stage(op1);
      const commit1 = await graph.commit({
        author: 'test',
        message: 'First commit'
      });

      const op2: AddEntityOperation = {
        id: 'op2',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'entity2',
          type: 'object',
          name: 'Entity 2',
          description: 'Second'
        }
      };

      graph.stage(op2);
      const commit2 = await graph.commit({
        author: 'test',
        message: 'Second commit'
      });

      expect(commit2.parentCommit).toBe(commit1.id);
    });

    it('should query commits by various criteria', async () => {
      // Create several commits
      for (let i = 0; i < 5; i++) {
        const op: AddEntityOperation = {
          id: `op${i}`,
          type: 'ADD_ENTITY',
          timestamp: Date.now(),
          payload: {
            id: `entity${i}`,
            type: 'object',
            name: `Entity ${i}`,
            description: `Test ${i}`
          }
        };

        graph.stage(op);
        await graph.commit({
          author: i % 2 === 0 ? 'author1' : 'author2',
          message: `Commit ${i}`,
          tags: i === 2 ? ['important'] : undefined
        });

        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Query by author
      const author1Commits = graph.queryCommits({ author: 'author1' });
      expect(author1Commits).toHaveLength(3);
      expect(author1Commits.every(c => c.author === 'author1')).toBe(true);

      // Query with limit
      const limitedCommits = graph.queryCommits({ limit: 2 });
      expect(limitedCommits).toHaveLength(2);

      // Query by branch
      const mainCommits = graph.queryCommits({ branch: 'main' });
      expect(mainCommits).toHaveLength(5);
    });
  });

  describe('Metrics', () => {
    it('should calculate commit metrics correctly', async () => {
      // Add multiple operations
      const ops = [
        {
          id: 'op1',
          type: 'ADD_ENTITY' as const,
          timestamp: Date.now(),
          payload: {
            id: 'entity1',
            type: 'character',
            name: 'Character 1',
            description: 'Test'
          }
        },
        {
          id: 'op2',
          type: 'ADD_ENTITY' as const,
          timestamp: Date.now(),
          payload: {
            id: 'entity2',
            type: 'location',
            name: 'Location 1',
            description: 'Test'
          }
        },
        {
          id: 'op3',
          type: 'ADD_RELATIONSHIP' as const,
          timestamp: Date.now(),
          payload: {
            id: 'rel1',
            type: 'located_at',
            source: 'entity1',
            target: 'entity2'
          }
        }
      ];

      graph.stage(...ops);
      const commit = await graph.commit({
        author: 'test',
        message: 'Multiple operations'
      });

      expect(commit.metrics.entitiesAffected).toBe(2);
      expect(commit.metrics.relationshipsChanged).toBe(1);
      expect(commit.metrics.coherenceScore).toBeGreaterThan(0);
      expect(commit.metrics.coherenceScore).toBeLessThanOrEqual(1);
    });

    it('should calculate timeline divergence', async () => {
      // Create commit on main
      const op1: AddEntityOperation = {
        id: 'op1',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'entity1',
          type: 'object',
          name: 'Entity',
          description: 'Test'
        }
      };

      graph.stage(op1);
      const mainCommit = await graph.commit({
        author: 'test',
        message: 'Main commit'
      });

      expect(mainCommit.metrics.timelineDivergence).toBe(0);

      // Create branch and commit
      graph.branch('alternate', mainCommit.id);
      await graph.checkout('alternate');

      const op2: AddEntityOperation = {
        id: 'op2',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'entity2',
          type: 'object',
          name: 'Alt Entity',
          description: 'On alternate timeline'
        }
      };

      graph.stage(op2);
      const altCommit = await graph.commit({
        author: 'test',
        message: 'Alternate timeline commit'
      });

      // Divergence should be 0.5 (1 - 0.5 probability)
      expect(altCommit.metrics.timelineDivergence).toBe(0.5);
    });
  });

  describe('Canonical Events', () => {
    it('should track canonical events', async () => {
      const canonicalEvent = {
        id: 'event_discovery',
        name: 'The Discovery',
        description: 'Major plot point',
        plotSignificance: 'critical' as const,
        allowsBranching: true
      };

      const op: AddEntityOperation = {
        id: 'op1',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'glitch',
          type: 'phenomenon',
          name: 'Reality Glitch',
          description: 'Anomaly discovered'
        }
      };

      graph.stage(op);
      const commit = await graph.commit({
        author: 'test',
        message: 'Discovery of the glitch',
        canonicalEvent
      });

      expect(commit.canonicalEvent).toBe(canonicalEvent);
      expect(graph['canonicalStates'].has('event_discovery')).toBe(true);
    });
  });

  describe('Entity Removal', () => {
    it('should remove entities and their relationships', async () => {
      // Setup: Add entities and relationship
      const setupOps = [
        {
          id: 'op1',
          type: 'ADD_ENTITY' as const,
          timestamp: Date.now(),
          payload: {
            id: 'char1',
            type: 'character',
            name: 'Character 1',
            description: 'Test'
          }
        },
        {
          id: 'op2',
          type: 'ADD_ENTITY' as const,
          timestamp: Date.now(),
          payload: {
            id: 'char2',
            type: 'character',
            name: 'Character 2',
            description: 'Test'
          }
        },
        {
          id: 'op3',
          type: 'ADD_RELATIONSHIP' as const,
          timestamp: Date.now(),
          payload: {
            id: 'rel1',
            type: 'knows',
            source: 'char1',
            target: 'char2'
          }
        }
      ];

      graph.stage(...setupOps);
      await graph.commit({
        author: 'test',
        message: 'Setup entities and relationship'
      });

      // Verify setup
      expect(graph.hasEntity('char1')).toBe(true);
      expect(graph.hasEntity('char2')).toBe(true);
      expect(graph.hasRelationship('rel1')).toBe(true);

      // Remove entity
      const removeOp: RemoveEntityOperation = {
        id: 'op4',
        type: 'REMOVE_ENTITY',
        timestamp: Date.now(),
        payload: {
          entityId: 'char1',
          reason: 'Character dies',
          preserveRelationships: false
        }
      };

      graph.stage(removeOp);
      await graph.commit({
        author: 'test',
        message: 'Remove character 1'
      });

      // Entity and its relationships should be gone
      expect(graph.hasEntity('char1')).toBe(false);
      expect(graph.hasRelationship('rel1')).toBe(false);
      expect(graph.hasEntity('char2')).toBe(true); // Other entity remains
    });
  });
});
