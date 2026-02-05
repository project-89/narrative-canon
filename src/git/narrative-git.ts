/**
 * NarrativeGit - Git-like interface for narrative version control
 * 
 * Provides familiar Git commands for managing narrative evolution,
 * making reality engineering accessible through version control metaphors.
 */

import { NarrativeCanonGraph, CommitMetadata } from './narrative-canon-graph';
import { HookRegistry } from './hooks/hook-registry';
import {
  GraphOperation,
  NarrativeCommit,
  TimelineBranch,
  GraphDiff,
  CommitQuery,
  MergeConfig,
  MergeResult,
  CanonicalEvent
} from './types';
import { HookServices } from './hooks/types';
import { Entity, Relationship, NarrativeStructure } from '../types';

export interface GitConfig {
  author?: string;
  hookServices?: HookServices;
  autoExecuteHooks?: boolean;
  defaultBranch?: string;
}

export interface StatusResult {
  branch: string;
  staged: GraphOperation[];
  unstaged: GraphOperation[];
  untracked: {
    entities: Entity[];
    relationships: Relationship[];
  };
  ahead: number;
  behind: number;
}

export interface LogEntry {
  commit: NarrativeCommit;
  branch: string;
  tags?: string[];
  isHead: boolean;
  isMerge: boolean;
}

export interface BlameResult {
  entityId: string;
  history: Array<{
    commit: NarrativeCommit;
    operation: GraphOperation;
    change: string;
  }>;
}

/**
 * Main NarrativeGit class providing Git-like interface
 */
export class NarrativeGit {
  private graph: NarrativeCanonGraph;
  private hookRegistry: HookRegistry;
  private config: Required<GitConfig>;
  private workingOperations: GraphOperation[] = [];
  
  constructor(config: GitConfig = {}) {
    this.graph = new NarrativeCanonGraph();
    this.config = {
      author: config.author || 'anonymous',
      hookServices: config.hookServices || {},
      autoExecuteHooks: config.autoExecuteHooks ?? true,
      defaultBranch: config.defaultBranch || 'main'
    };
    
    this.hookRegistry = new HookRegistry(this.config.hookServices);
  }
  
  /**
   * Initialize from existing narrative structure
   */
  static async fromNarrativeStructure(
    structure: NarrativeStructure, 
    config?: GitConfig
  ): Promise<NarrativeGit> {
    const git = new NarrativeGit(config);
    
    // Convert structure to operations
    const operations: GraphOperation[] = [];
    
    // Add all entities
    for (const entity of structure.entities) {
      operations.push({
        id: `init_entity_${entity.id}`,
        type: 'ADD_ENTITY',
        timestamp: Date.now(),
        payload: entity
      });
    }
    
    // Add all relationships
    for (const rel of structure.relationships) {
      operations.push({
        id: `init_rel_${rel.id}`,
        type: 'ADD_RELATIONSHIP',
        timestamp: Date.now(),
        payload: rel
      });
    }
    
    // Stage and commit
    git.add(...operations);
    await git.commit('Initial import from narrative structure');
    
    return git;
  }
  
  /**
   * Add operations to staging area
   */
  add(...operations: GraphOperation[]): void {
    this.graph.stage(...operations);
  }
  
  /**
   * Remove operations from staging area
   */
  reset(): void {
    this.graph.unstage();
  }
  
  /**
   * Create a commit
   */
  async commit(
    message: string, 
    options?: {
      canonicalEvent?: CanonicalEvent;
      tags?: string[];
      author?: string;
    }
  ): Promise<NarrativeCommit> {
    const metadata: CommitMetadata = {
      author: options?.author || this.config.author,
      message,
      canonicalEvent: options?.canonicalEvent,
      tags: options?.tags
    };
    
    // Get previous state for hooks
    const previousGraph = this.cloneCurrentGraph();
    
    // Create commit
    const commit = await this.graph.commit(metadata);
    
    // Execute hooks if enabled
    if (this.config.autoExecuteHooks) {
      const hookResults = await this.hookRegistry.executeHooksForCommit(
        commit,
        previousGraph,
        this.graph
      );
      
      // Apply any mutations from hooks
      const mutations = hookResults
        .filter(r => r.mutations)
        .flatMap(r => r.mutations!);
        
      if (mutations.length > 0) {
        // Create a follow-up commit with hook mutations
        this.add(...mutations);
        await this.graph.commit({
          author: 'hook-system',
          message: `Applied ${mutations.length} mutations from hooks`,
          tags: ['auto-generated', 'hook-mutations']
        });
      }
    }
    
    return commit;
  }
  
  /**
   * Get current status
   */
  status(): StatusResult {
    const currentBranch = this.graph['currentBranch'];
    const branch = this.graph['branches'].get(currentBranch)!;
    
    return {
      branch: currentBranch,
      staged: [...this.graph['stagedOperations']],
      unstaged: this.workingOperations,
      untracked: {
        entities: [],
        relationships: []
      },
      ahead: 0, // Would calculate commits ahead of remote
      behind: 0  // Would calculate commits behind remote
    };
  }
  
  /**
   * Show commit log
   */
  log(options?: {
    limit?: number;
    branch?: string;
    oneline?: boolean;
  }): LogEntry[] {
    const query: CommitQuery = {
      branch: options?.branch || this.graph['currentBranch'],
      limit: options?.limit
    };
    
    const commits = this.graph.queryCommits(query);
    const currentHead = this.graph['branches'].get(this.graph['currentBranch'])?.headCommit;
    
    return commits.map(commit => ({
      commit,
      branch: commit.branch || 'unknown',
      tags: commit.tags,
      isHead: commit.id === currentHead,
      isMerge: (commit.tags || []).includes('merge')
    }));
  }
  
  /**
   * Create a new branch
   */
  branch(name: string, options?: {
    from?: string;
    checkout?: boolean;
  }): TimelineBranch {
    const branch = this.graph.branch(name, options?.from);
    
    if (options?.checkout) {
      this.checkout(name);
    }
    
    return branch;
  }
  
  /**
   * List all branches
   */
  branches(): Array<{
    name: string;
    current: boolean;
    branch: TimelineBranch;
  }> {
    const currentBranch = this.graph['currentBranch'];
    const branches = this.graph['branches'];
    
    return Array.from(branches.entries()).map(([name, branch]) => ({
      name,
      current: name === currentBranch,
      branch
    }));
  }
  
  /**
   * Switch to a branch
   */
  async checkout(branchName: string): Promise<void> {
    await this.graph.checkout(branchName);
  }
  
  /**
   * Merge a branch
   */
  async merge(
    sourceBranch: string, 
    options?: MergeConfig
  ): Promise<MergeResult> {
    return this.graph.merge(sourceBranch, options);
  }
  
  /**
   * Show differences between commits
   */
  diff(from?: string, to?: string): GraphDiff {
    // Default to comparing HEAD with working directory
    const fromCommit = from || this.getCurrentHead();
    const toCommit = to || this.getCurrentHead();
    
    return this.graph.diff(fromCommit, toCommit);
  }
  
  /**
   * Show what commit last modified an entity
   */
  blame(entityId: string): BlameResult {
    const history: BlameResult['history'] = [];
    const commits = this.graph.queryCommits({});
    
    for (const commit of commits) {
      for (const op of commit.operations) {
        let affects = false;
        let change = '';
        
        switch (op.type) {
          case 'ADD_ENTITY':
            if ((op as any).payload.id === entityId) {
              affects = true;
              change = 'Created entity';
            }
            break;
          case 'UPDATE_ENTITY':
            if ((op as any).payload.entityId === entityId) {
              affects = true;
              change = 'Updated entity';
            }
            break;
          case 'REMOVE_ENTITY':
            if ((op as any).payload.entityId === entityId) {
              affects = true;
              change = 'Removed entity';
            }
            break;
        }
        
        if (affects) {
          history.push({
            commit,
            operation: op,
            change
          });
        }
      }
    }
    
    return {
      entityId,
      history: history.reverse() // Oldest first
    };
  }
  
  /**
   * Add a tag to a commit
   */
  tag(commitId: string, tag: string): void {
    const commit = this.graph['commits'].get(commitId);
    if (commit) {
      commit.tags = commit.tags || [];
      commit.tags.push(tag);
    }
  }
  
  /**
   * Register a canonical state
   */
  registerCanonicalState(state: CanonicalEvent): void {
    this.graph['canonicalStates'].set(state.id, state);
  }
  
  /**
   * Get all canonical states
   */
  getCanonicalStates(): CanonicalEvent[] {
    return Array.from(this.graph['canonicalStates'].values());
  }
  
  /**
   * Register a reality hook
   */
  registerHook(hook: any): void {
    this.hookRegistry.register(hook);
  }
  
  /**
   * Export current state as NarrativeStructure
   */
  export(): NarrativeStructure {
    const entities = Array.from(this.graph['entities'].values());
    const relationships = Array.from(this.graph['relationships'].values());
    const interactions = Array.from(this.graph['interactions'].values());

    return {
      entities,
      relationships,
      interactions,
      scenes: [], // Would extract from commits
      stateChanges: [], // Would extract from operations
      chronology: {
        events: [],
        timeline: []
      },
      themes: [],
      metadata: {
        exportedAt: new Date().toISOString(),
        branch: this.graph['currentBranch'],
        commitCount: this.graph['commits'].size
      }
    };
  }
  
  /**
   * Get the current graph for direct access
   */
  getGraph(): NarrativeCanonGraph {
    return this.graph;
  }
  
  /**
   * Get the hook registry for direct access
   */
  getHookRegistry(): HookRegistry {
    return this.hookRegistry;
  }
  
  // Helper methods
  
  private getCurrentHead(): string {
    const branch = this.graph['branches'].get(this.graph['currentBranch']);
    return branch?.headCommit || '';
  }
  
  private cloneCurrentGraph(): NarrativeCanonGraph {
    // In a real implementation, would properly clone the graph state
    // For now, return the same reference (hooks should not modify it)
    return this.graph;
  }
}

/**
 * Convenience function to create a new narrative git repository
 */
export function initNarrativeGit(config?: GitConfig): NarrativeGit {
  return new NarrativeGit(config);
}