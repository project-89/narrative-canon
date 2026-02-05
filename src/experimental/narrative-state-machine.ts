/**
 * NARRATIVE STATE MACHINE - Proof of Concept
 * 
 * Treats narratives as sequences of state transitions on a reality graph
 * Inspired by Git's model but for consciousness and timeline manipulation
 */

import { Entity, Relationship, NarrativeStructure, StateChange } from '../types';

// Core state machine types
export interface GraphOperation {
  id: string;
  type: 'ADD_ENTITY' | 'REMOVE_ENTITY' | 'UPDATE_ENTITY' | 
        'ADD_RELATIONSHIP' | 'REMOVE_RELATIONSHIP' | 'UPDATE_RELATIONSHIP' |
        'TIMELINE_BRANCH' | 'TIMELINE_MERGE';
  timestamp: number;
  payload: any;
}

export interface NarrativeCommit {
  id: string;
  author: string;
  timestamp: number;
  message: string;
  parentCommit?: string;
  operations: GraphOperation[];
  
  // Link to author's intent
  canonicalEvent?: {
    id: string;
    name: string;
    description: string;
    plotSignificance: 'minor' | 'major' | 'critical';
  };
  
  // Reality coherence metrics
  coherenceScore: number;
  timelineDivergence: number;
}

export interface CanonicalState {
  id: string;
  name: string;
  description: string;
  
  // Conditions that must be true in the graph
  requiredConditions: GraphCondition[];
  
  // How essential is this state to the narrative?
  necessity: 'optional' | 'preferred' | 'required' | 'absolute';
  
  // Can branch from here?
  allowsBranching: boolean;
}

export interface GraphCondition {
  type: 'ENTITY_EXISTS' | 'RELATIONSHIP_EXISTS' | 'PROPERTY_EQUALS';
  entityId?: string;
  relationshipType?: string;
  property?: string;
  value?: any;
}

export interface TimelineBranch {
  id: string;
  name: string;
  parentCommit: string;
  headCommit: string;
  probability: number; // 0-1, how "real" is this timeline?
  isCanon: boolean;
}

/**
 * Hook system for asset generation and lore enrichment
 */
export interface RealityHook {
  id: string;
  name: string;
  description: string;
  
  // When should this hook fire?
  triggers: HookTrigger[];
  
  // Execution priority (higher = earlier)
  priority: number;
  
  // Can this hook modify the graph?
  canMutate: boolean;
  
  // The manifestation function
  execute: (context: HookContext) => Promise<HookResult>;
}

export interface HookTrigger {
  type: 'ENTITY_ADDED' | 'ENTITY_UPDATED' | 'RELATIONSHIP_FORMED' | 
        'SCENE_COMPLETED' | 'CANONICAL_STATE_REACHED' | 'TIMELINE_DIVERGENCE';
  entityType?: string;
  fields?: string[];
  relationshipType?: string;
  stateId?: string;
  threshold?: number;
}

export interface HookContext {
  operation: GraphOperation;
  commit: NarrativeCommit;
  previousGraph: NarrativeGraph;
  currentGraph: NarrativeGraph;
  services: HookServices;
}

export interface HookServices {
  imageGenerator?: {
    generate: (prompt: string, style?: string) => Promise<{ url: string; metadata: any }>;
  };
  loreEnricher?: {
    expand: (entity: Entity, depth?: string) => Promise<any>;
  };
  // Add more services as needed
}

export interface HookResult {
  processed: boolean;
  mutations?: GraphOperation[];
  artifacts?: Record<string, any>;
  error?: Error;
}

/**
 * The narrative graph at a point in time
 */
export class NarrativeGraph {
  entities: Map<string, Entity> = new Map();
  relationships: Map<string, Relationship> = new Map();
  metadata: Record<string, any> = {};
  
  clone(): NarrativeGraph {
    const cloned = new NarrativeGraph();
    cloned.entities = new Map(this.entities);
    cloned.relationships = new Map(this.relationships);
    cloned.metadata = { ...this.metadata };
    return cloned;
  }
  
  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }
  
  addEntity(entity: Entity) {
    this.entities.set(entity.id, entity);
  }
  
  removeEntity(id: string) {
    this.entities.delete(id);
    // Also remove relationships involving this entity
    for (const [relId, rel] of this.relationships) {
      if (rel.source === id || rel.target === id) {
        this.relationships.delete(relId);
      }
    }
  }
  
  updateEntity(id: string, updates: Partial<Entity>) {
    const entity = this.entities.get(id);
    if (entity) {
      this.entities.set(id, { ...entity, ...updates });
    }
  }
}

/**
 * Main narrative state machine
 */
export class NarrativeStateMachine {
  private currentGraph: NarrativeGraph = new NarrativeGraph();
  private commits: NarrativeCommit[] = [];
  private branches: Map<string, TimelineBranch> = new Map();
  private currentBranch: string = 'main';
  private canonicalStates: CanonicalState[] = [];
  private hooks: RealityHook[] = [];
  
  constructor(private hookServices: HookServices = {}) {
    // Initialize main branch
    this.branches.set('main', {
      id: 'main',
      name: 'Primary Timeline',
      parentCommit: '',
      headCommit: '',
      probability: 1.0,
      isCanon: true
    });
  }
  
  /**
   * Apply a series of operations as a single commit
   */
  async commit(operations: GraphOperation[], metadata: {
    author: string;
    message: string;
    canonicalEvent?: NarrativeCommit['canonicalEvent'];
  }): Promise<NarrativeCommit> {
    // Create new graph state
    const newGraph = this.applyOperations(this.currentGraph.clone(), operations);
    
    // Calculate metrics
    const coherenceScore = this.calculateCoherence(newGraph);
    const timelineDivergence = this.calculateDivergence(newGraph);
    
    // Create commit
    const commit: NarrativeCommit = {
      id: this.generateCommitId(),
      author: metadata.author,
      timestamp: Date.now(),
      message: metadata.message,
      parentCommit: this.getCurrentHead(),
      operations,
      canonicalEvent: metadata.canonicalEvent,
      coherenceScore,
      timelineDivergence
    };
    
    // Store commit and update state
    this.commits.push(commit);
    this.currentGraph = newGraph;
    this.updateBranchHead(commit.id);
    
    // Execute hooks
    await this.executeHooks(commit, this.currentGraph);
    
    // Check if we've reached any canonical states
    this.checkCanonicalStates(newGraph);
    
    return commit;
  }
  
  /**
   * Create a new timeline branch
   */
  branch(name: string, fromCommit?: string): TimelineBranch {
    const parentCommit = fromCommit || this.getCurrentHead();
    
    const newBranch: TimelineBranch = {
      id: this.generateBranchId(),
      name,
      parentCommit,
      headCommit: parentCommit,
      probability: 0.5, // New branches start at 50% probability
      isCanon: false
    };
    
    this.branches.set(newBranch.id, newBranch);
    return newBranch;
  }
  
  /**
   * Switch to a different timeline branch
   */
  checkout(branchId: string) {
    if (!this.branches.has(branchId)) {
      throw new Error(`Branch ${branchId} does not exist`);
    }
    
    this.currentBranch = branchId;
    // Rebuild graph from commits up to branch head
    this.currentGraph = this.buildGraphAtCommit(this.getCurrentHead());
  }
  
  /**
   * Register a new canonical state the narrative should reach
   */
  addCanonicalState(state: CanonicalState) {
    this.canonicalStates.push(state);
  }
  
  /**
   * Register a reality hook
   */
  registerHook(hook: RealityHook) {
    this.hooks.push(hook);
    this.hooks.sort((a, b) => b.priority - a.priority);
  }
  
  /**
   * Find paths to reach a canonical state
   */
  async plotCourse(targetStateId: string): Promise<GraphOperation[][]> {
    const targetState = this.canonicalStates.find(s => s.id === targetStateId);
    if (!targetState) {
      throw new Error(`Canonical state ${targetStateId} not found`);
    }
    
    // This would use pathfinding algorithms to find sequences of operations
    // that transform currentGraph to meet targetState.requiredConditions
    // For now, return empty array as placeholder
    return [];
  }
  
  // Private helper methods
  
  private applyOperations(graph: NarrativeGraph, operations: GraphOperation[]): NarrativeGraph {
    for (const op of operations) {
      switch (op.type) {
        case 'ADD_ENTITY':
          graph.addEntity(op.payload);
          break;
        case 'REMOVE_ENTITY':
          graph.removeEntity(op.payload.entityId);
          break;
        case 'UPDATE_ENTITY':
          graph.updateEntity(op.payload.entityId, op.payload.changes);
          break;
        // ... handle other operation types
      }
    }
    return graph;
  }
  
  private async executeHooks(commit: NarrativeCommit, graph: NarrativeGraph) {
    const previousGraph = this.buildGraphAtCommit(commit.parentCommit!);
    
    for (const operation of commit.operations) {
      const triggeredHooks = this.hooks.filter(hook => 
        this.isHookTriggered(hook, operation, commit)
      );
      
      for (const hook of triggeredHooks) {
        try {
          const context: HookContext = {
            operation,
            commit,
            previousGraph,
            currentGraph: graph,
            services: this.hookServices
          };
          
          const result = await hook.execute(context);
          
          if (result.mutations && hook.canMutate) {
            // Apply mutations from hook
            graph = this.applyOperations(graph, result.mutations);
          }
        } catch (error) {
          console.error(`Hook ${hook.id} failed:`, error);
        }
      }
    }
  }
  
  private isHookTriggered(hook: RealityHook, operation: GraphOperation, commit: NarrativeCommit): boolean {
    return hook.triggers.some(trigger => {
      switch (trigger.type) {
        case 'ENTITY_ADDED':
          return operation.type === 'ADD_ENTITY' && 
            (!trigger.entityType || operation.payload.type === trigger.entityType);
        case 'CANONICAL_STATE_REACHED':
          return commit.canonicalEvent?.id === trigger.stateId;
        // ... check other trigger types
        default:
          return false;
      }
    });
  }
  
  private calculateCoherence(graph: NarrativeGraph): number {
    // Measure narrative coherence based on:
    // - Entity consistency
    // - Relationship logic
    // - Temporal continuity
    return 0.85; // Placeholder
  }
  
  private calculateDivergence(graph: NarrativeGraph): number {
    // Measure how far this timeline has diverged from main
    return 0.15; // Placeholder
  }
  
  private checkCanonicalStates(graph: NarrativeGraph) {
    for (const state of this.canonicalStates) {
      const conditionsMet = state.requiredConditions.every(condition => 
        this.checkCondition(graph, condition)
      );
      
      if (conditionsMet) {
        console.log(`Canonical state reached: ${state.name}`);
        // Could emit event or trigger special handling
      }
    }
  }
  
  private checkCondition(graph: NarrativeGraph, condition: GraphCondition): boolean {
    switch (condition.type) {
      case 'ENTITY_EXISTS':
        return graph.entities.has(condition.entityId!);
      case 'RELATIONSHIP_EXISTS':
        return Array.from(graph.relationships.values()).some(
          rel => rel.type === condition.relationshipType
        );
      // ... check other condition types
      default:
        return false;
    }
  }
  
  private getCurrentHead(): string {
    return this.branches.get(this.currentBranch)?.headCommit || '';
  }
  
  private updateBranchHead(commitId: string) {
    const branch = this.branches.get(this.currentBranch);
    if (branch) {
      branch.headCommit = commitId;
    }
  }
  
  private buildGraphAtCommit(commitId: string): NarrativeGraph {
    const graph = new NarrativeGraph();
    
    // Find all commits up to commitId
    const commitsToApply: NarrativeCommit[] = [];
    let current = this.commits.find(c => c.id === commitId);
    
    while (current) {
      commitsToApply.unshift(current);
      current = current.parentCommit ? 
        this.commits.find(c => c.id === current!.parentCommit) : 
        undefined;
    }
    
    // Apply all operations in order
    for (const commit of commitsToApply) {
      this.applyOperations(graph, commit.operations);
    }
    
    return graph;
  }
  
  private generateCommitId(): string {
    return `commit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private generateBranchId(): string {
    return `branch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Example hooks for demonstration
 */
export const exampleHooks = {
  characterPortraitHook: {
    id: 'char-portrait',
    name: 'Character Portrait Generator',
    description: 'Generates portraits for new characters',
    triggers: [{ type: 'ENTITY_ADDED', entityType: 'character' }],
    priority: 100,
    canMutate: true,
    
    async execute(context: HookContext): Promise<HookResult> {
      if (!context.services.imageGenerator) {
        return { processed: false };
      }
      
      const character = context.operation.payload;
      const portrait = await context.services.imageGenerator.generate(
        `Portrait of ${character.name}: ${character.description}`,
        'project-89-noir'
      );
      
      return {
        processed: true,
        mutations: [{
          id: context.operation.id + '_portrait',
          type: 'UPDATE_ENTITY',
          timestamp: Date.now(),
          payload: {
            entityId: character.id,
            changes: {
              metadata: {
                ...character.metadata,
                portrait: portrait.url
              }
            }
          }
        }]
      };
    }
  } as RealityHook
};