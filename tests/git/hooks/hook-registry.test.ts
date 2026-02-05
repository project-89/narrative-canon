import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { HookRegistry } from '../../../src/git/hooks/hook-registry';
import {
  RealityHook,
  HookServices,
  HookContext,
  HookResult,
  GeneratedAsset,
  ImageGenerationService,
  LoreEnrichmentService,
  ExpandedLore,
  EntityTimeline,
  RelationshipLore
} from '../../../src/git/hooks/types';
import { NarrativeCanonGraph } from '../../../src/git/narrative-canon-graph';
import { 
  AddEntityOperation, 
  NarrativeCommit,
  UpdateEntityOperation 
} from '../../../src/git/types';

// Typed helper mocks
const createAsset = (id: string): GeneratedAsset => ({
  id,
  type: 'image',
  url: `https://example.com/${id}.jpg`,
  generatedAt: Date.now(),
  generatedBy: 'mock-generator'
});

const mockImageGenerator: ImageGenerationService = {
  generate: jest.fn(async () => createAsset('img_001')) as ImageGenerationService['generate'],
  generateBatch: jest.fn(async () => []) as ImageGenerationService['generateBatch'],
  generateCharacterPortrait: jest.fn(async () => createAsset('portrait_001')) as ImageGenerationService['generateCharacterPortrait'],
  generateLocationConcept: jest.fn(async () => createAsset('location_001')) as ImageGenerationService['generateLocationConcept'],
  generateSceneStoryboard: jest.fn(async () => []) as ImageGenerationService['generateSceneStoryboard']
};

const mockLoreEnricher: LoreEnrichmentService = {
  expand: jest.fn(async () => ({
    entity: { id: 'test', name: 'Test', type: 'character', description: 'Test' },
    backstory: 'Expanded backstory...',
    timeline: { entityId: 'test', events: [] },
    relationships: [],
    secrets: ['Secret 1']
  })) as LoreEnrichmentService['expand'],
  generateBackstory: jest.fn(async () => 'Generated backstory') as LoreEnrichmentService['generateBackstory'],
  createTimeline: jest.fn(async () => ({ entityId: 'test', events: [] })) as LoreEnrichmentService['createTimeline'],
  generateRelationshipHistory: jest.fn(async () => ({
    relationshipId: 'rel_1',
    history: 'Shared missions',
    keyMoments: [],
    currentStatus: 'active'
  })) as LoreEnrichmentService['generateRelationshipHistory']
};

describe('HookRegistry', () => {
  let registry: HookRegistry;
  let services: HookServices;
  let graph: NarrativeCanonGraph;

  beforeEach(() => {
    services = {
      imageGenerator: mockImageGenerator,
      loreEnricher: mockLoreEnricher
    };
    
    registry = new HookRegistry(services);
    graph = new NarrativeCanonGraph();
    
    // Clear mock calls
    jest.clearAllMocks();
  });

  describe('Hook Registration', () => {
    it('should register and retrieve hooks', () => {
      const hook: RealityHook = {
        id: 'test-hook',
        name: 'Test Hook',
        description: 'A test hook',
        triggers: [{ type: 'ENTITY_ADDED' }],
        priority: 50,
        canMutate: false,
        execute: async () => ({ processed: true })
      };

      registry.register(hook);
      const hooks = registry.getHooks();

      expect(hooks).toHaveLength(1);
      expect(hooks[0]).toBe(hook);
    });

    it('should prevent duplicate hook registration', () => {
      const hook: RealityHook = {
        id: 'test-hook',
        name: 'Test Hook',
        description: 'A test hook',
        triggers: [{ type: 'ENTITY_ADDED' }],
        priority: 50,
        canMutate: false,
        execute: async () => ({ processed: true })
      };

      registry.register(hook);
      expect(() => registry.register(hook)).toThrow('already registered');
    });

    it('should unregister hooks', () => {
      const hook: RealityHook = {
        id: 'test-hook',
        name: 'Test Hook',
        description: 'A test hook',
        triggers: [{ type: 'ENTITY_ADDED' }],
        priority: 50,
        canMutate: false,
        execute: async () => ({ processed: true })
      };

      registry.register(hook);
      expect(registry.getHooks()).toHaveLength(1);

      const removed = registry.unregister('test-hook');
      expect(removed).toBe(true);
      expect(registry.getHooks()).toHaveLength(0);
    });
  });

  describe('Hook Execution', () => {
    it('should execute hooks for matching operations', async () => {
      const mockExecute = jest.fn(async (_context: HookContext) => ({
        processed: true,
        artifacts: []
      }));

      const hook: RealityHook = {
        id: 'entity-hook',
        name: 'Entity Hook',
        description: 'Triggers on entity add',
        triggers: [{ type: 'ENTITY_ADDED', entityType: 'character' }],
        priority: 100,
        canMutate: false,
        execute: mockExecute
      };

      registry.register(hook);

      const operation: AddEntityOperation = {
        id: 'op1',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'char_kira',
          type: 'character',
          name: 'Kira',
          description: 'Test character'
        }
      };

      const commit: NarrativeCommit = {
        id: 'commit_001',
        author: 'test',
        timestamp: Date.now(),
        message: 'Add character',
        treeHash: 'abc123',
        operations: [operation],
        metrics: {
          coherenceScore: 0.9,
          timelineDivergence: 0.1,
          entitiesAffected: 1,
          relationshipsChanged: 0
        }
      };

      const results = await registry.executeHooksForCommit(commit, graph, graph);

      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(1);
      expect(results[0].processed).toBe(true);
    });

    it('should respect entity type filters', async () => {
      const characterExecute = jest.fn(async (_context: HookContext) => ({ processed: true }));
      const characterHook: RealityHook = {
        id: 'char-hook',
        name: 'Character Hook',
        description: 'Only for characters',
        triggers: [{ type: 'ENTITY_ADDED', entityType: 'character' }],
        priority: 100,
        canMutate: false,
        execute: characterExecute
      };

      const locationExecute = jest.fn(async (_context: HookContext) => ({ processed: true }));
      const locationHook: RealityHook = {
        id: 'loc-hook',
        name: 'Location Hook',
        description: 'Only for locations',
        triggers: [{ type: 'ENTITY_ADDED', entityType: 'location' }],
        priority: 100,
        canMutate: false,
        execute: locationExecute
      };

      registry.register(characterHook);
      registry.register(locationHook);

      const operation: AddEntityOperation = {
        id: 'op1',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: {
          id: 'char_test',
          type: 'character',
          name: 'Test Character',
          description: 'Test'
        }
      };

      const commit: NarrativeCommit = {
        id: 'commit_001',
        author: 'test',
        timestamp: Date.now(),
        message: 'Add character',
        treeHash: 'abc123',
        operations: [operation],
        metrics: {
          coherenceScore: 0.9,
          timelineDivergence: 0.1,
          entitiesAffected: 1,
          relationshipsChanged: 0
        }
      };

      await registry.executeHooksForCommit(commit, graph, graph);

      expect(characterExecute).toHaveBeenCalledTimes(1);
      expect(locationExecute).not.toHaveBeenCalled();
    });

    it('should execute hooks by priority order', async () => {
      const executionOrder: string[] = [];

      const highPriorityHook: RealityHook = {
        id: 'high-priority',
        name: 'High Priority',
        description: 'Executes first',
        triggers: [{ type: 'ENTITY_ADDED' }],
        priority: 100,
        canMutate: false,
        execute: async () => {
          executionOrder.push('high');
          return { processed: true };
        }
      };

      const lowPriorityHook: RealityHook = {
        id: 'low-priority',
        name: 'Low Priority',
        description: 'Executes second',
        triggers: [{ type: 'ENTITY_ADDED' }],
        priority: 10,
        canMutate: false,
        execute: async () => {
          executionOrder.push('low');
          return { processed: true };
        }
      };

      // Register in reverse order to test sorting
      registry.register(lowPriorityHook);
      registry.register(highPriorityHook);

      const operation: AddEntityOperation = {
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

      const commit: NarrativeCommit = {
        id: 'commit_001',
        author: 'test',
        timestamp: Date.now(),
        message: 'Test',
        treeHash: 'abc123',
        operations: [operation],
        metrics: {
          coherenceScore: 0.9,
          timelineDivergence: 0.1,
          entitiesAffected: 1,
          relationshipsChanged: 0
        }
      };

      // Create sequential execution registry
      const sequentialRegistry = new HookRegistry(services, {
        executionMode: 'sequential'
      });
      sequentialRegistry.register(lowPriorityHook);
      sequentialRegistry.register(highPriorityHook);

      await sequentialRegistry.executeHooksForCommit(commit, graph, graph);

      expect(executionOrder).toEqual(['high', 'low']);
    });

    it('should handle hook timeouts', async () => {
      const timeoutHook: RealityHook = {
        id: 'timeout-hook',
        name: 'Timeout Hook',
        description: 'Times out',
        triggers: [{ type: 'ENTITY_ADDED' }],
        priority: 50,
        canMutate: false,
        timeout: 100,
        execute: async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return { processed: true };
        }
      };

      registry.register(timeoutHook);

      const operation: AddEntityOperation = {
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

      const commit: NarrativeCommit = {
        id: 'commit_001',
        author: 'test',
        timestamp: Date.now(),
        message: 'Test',
        treeHash: 'abc123',
        operations: [operation],
        metrics: {
          coherenceScore: 0.9,
          timelineDivergence: 0.1,
          entitiesAffected: 1,
          relationshipsChanged: 0
        }
      };

      const results = await registry.executeHooksForCommit(commit, graph, graph);

      expect(results).toHaveLength(1);
      expect(results[0].processed).toBe(false);
      expect(results[0].error).toBeDefined();
      expect(results[0].error?.message).toContain('timeout');
    });
  });

  describe('Hook Context', () => {
    it('should provide correct context for entity operations', async () => {
      let capturedContext: HookContext | null = null;

      const hook: RealityHook = {
        id: 'context-hook',
        name: 'Context Hook',
        description: 'Captures context',
        triggers: [{ type: 'ENTITY_ADDED' }],
        priority: 50,
        canMutate: false,
        execute: async (context) => {
          capturedContext = context;
          return { processed: true };
        }
      };

      registry.register(hook);

      const entity = {
        id: 'test_entity',
        type: 'character',
        name: 'Test Entity',
        description: 'Test'
      };

      const operation: AddEntityOperation = {
        id: 'op1',
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: entity
      };

      const commit: NarrativeCommit = {
        id: 'commit_001',
        author: 'test',
        timestamp: Date.now(),
        message: 'Test',
        treeHash: 'abc123',
        operations: [operation],
        metrics: {
          coherenceScore: 0.9,
          timelineDivergence: 0.1,
          entitiesAffected: 1,
          relationshipsChanged: 0
        }
      };

      await registry.executeHooksForCommit(commit, graph, graph);

      expect(capturedContext).not.toBeNull();
      expect(capturedContext!.operation).toBe(operation);
      expect(capturedContext!.commit).toBe(commit);
      expect(capturedContext!.entity).toEqual(entity);
      expect(capturedContext!.services).toBe(services);
    });
  });

  describe('Update Operations', () => {
    it('should trigger hooks for field updates', async () => {
      const updateHookExecute = jest.fn(async (_context: HookContext) => ({ processed: true }));
      const updateHook: RealityHook = {
        id: 'update-hook',
        name: 'Update Hook',
        description: 'Triggers on specific field updates',
        triggers: [{ 
          type: 'ENTITY_UPDATED', 
          fields: ['status', 'appearance'] 
        }],
        priority: 50,
        canMutate: false,
        execute: updateHookExecute
      };

      registry.register(updateHook);

      // Update with matching field
      const updateOp1: UpdateEntityOperation = {
        id: 'op1',
        type: 'UPDATE_ENTITY',
        timestamp: Date.now(),
        payload: {
          entityId: 'test',
          changes: {
            status: 'awakened'
          }
        }
      };

      // Update with non-matching field
      const updateOp2: UpdateEntityOperation = {
        id: 'op2',
        type: 'UPDATE_ENTITY',
        timestamp: Date.now(),
        payload: {
          entityId: 'test',
          changes: {
            location: 'new-location'
          }
        }
      };

      const commit1: NarrativeCommit = {
        id: 'commit_001',
        author: 'test',
        timestamp: Date.now(),
        message: 'Update status',
        treeHash: 'abc123',
        operations: [updateOp1],
        metrics: {
          coherenceScore: 0.9,
          timelineDivergence: 0.1,
          entitiesAffected: 1,
          relationshipsChanged: 0
        }
      };

      const commit2: NarrativeCommit = {
        id: 'commit_002',
        author: 'test',
        timestamp: Date.now(),
        message: 'Update location',
        treeHash: 'def456',
        operations: [updateOp2],
        metrics: {
          coherenceScore: 0.9,
          timelineDivergence: 0.1,
          entitiesAffected: 1,
          relationshipsChanged: 0
        }
      };

      await registry.executeHooksForCommit(commit1, graph, graph);
      await registry.executeHooksForCommit(commit2, graph, graph);

      // Should only trigger for the status update
      expect(updateHookExecute).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle hook errors based on strategy', async () => {
      const errorHook: RealityHook = {
        id: 'error-hook',
        name: 'Error Hook',
        description: 'Throws error',
        triggers: [{ type: 'ENTITY_ADDED' }],
        priority: 100,
        canMutate: false,
        execute: async () => {
          throw new Error('Hook error');
        }
      };

      const successExecute = jest.fn(async (_context: HookContext) => ({ processed: true }));
      const successHook: RealityHook = {
        id: 'success-hook',
        name: 'Success Hook',
        description: 'Succeeds',
        triggers: [{ type: 'ENTITY_ADDED' }],
        priority: 50,
        canMutate: false,
        execute: successExecute
      };

      // Test continue-on-error strategy
      const continueRegistry = new HookRegistry(services, {
        errorStrategy: 'continue-on-error'
      });
      continueRegistry.register(errorHook);
      continueRegistry.register(successHook);

      const operation: AddEntityOperation = {
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

      const commit: NarrativeCommit = {
        id: 'commit_001',
        author: 'test',
        timestamp: Date.now(),
        message: 'Test',
        treeHash: 'abc123',
        operations: [operation],
        metrics: {
          coherenceScore: 0.9,
          timelineDivergence: 0.1,
          entitiesAffected: 1,
          relationshipsChanged: 0
        }
      };

      const results = await continueRegistry.executeHooksForCommit(commit, graph, graph);

      // Both hooks should execute
      expect(results).toHaveLength(2);
      expect(results[0].processed).toBe(false);
      expect(results[0].error).toBeDefined();
      expect(successExecute).toHaveBeenCalled();
    });
  });

  describe('Execution History', () => {
    it('should track execution history', async () => {
      const hook: RealityHook = {
        id: 'history-hook',
        name: 'History Hook',
        description: 'For history tracking',
        triggers: [{ type: 'ENTITY_ADDED' }],
        priority: 50,
        canMutate: false,
        execute: async () => ({
          processed: true,
          artifacts: [
            {
              id: 'asset1',
              type: 'image',
              url: 'test.jpg',
              generatedAt: Date.now(),
              generatedBy: 'test'
            }
          ]
        })
      };

      registry.register(hook);

      const operation: AddEntityOperation = {
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

      const commit: NarrativeCommit = {
        id: 'commit_001',
        author: 'test',
        timestamp: Date.now(),
        message: 'Test',
        treeHash: 'abc123',
        operations: [operation],
        metrics: {
          coherenceScore: 0.9,
          timelineDivergence: 0.1,
          entitiesAffected: 1,
          relationshipsChanged: 0
        }
      };

      await registry.executeHooksForCommit(commit, graph, graph);

      const history = registry.getExecutionHistory('commit_001');
      expect(history).toBeDefined();
      expect(history).toHaveLength(1);
      expect(history![0].success).toBe(true);
      expect(history![0].artifactsGenerated).toBe(1);
    });
  });
});
