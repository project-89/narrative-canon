/**
 * Narrative Git - Version control for reality engineering
 * 
 * This module provides Git-like operations for managing narrative evolution,
 * enabling timeline branching, reality hooks, and consciousness technology.
 */

// Core types
export * from './types';

// Hook system
export * from './hooks/types';
export { HookRegistry } from './hooks/hook-registry';
export * from './hooks/example-hooks';

// Main classes
export { NarrativeCanonGraph, CommitMetadata } from './narrative-canon-graph';
export { 
  NarrativeGit, 
  initNarrativeGit, 
  GitConfig,
  StatusResult,
  LogEntry,
  BlameResult
} from './narrative-git';
export { ParadoxResolver } from './paradox-resolver';
export { LLMParadoxAnalyzer } from './llm-paradox-analyzer';

// Re-export commonly used types for convenience
export type {
  GraphOperation,
  NarrativeCommit,
  TimelineBranch,
  CanonicalEvent,
  MergeResult,
  GraphDiff
} from './types';

// Export hook types from hooks subdirectory
export type {
  RealityHook,
  HookContext,
  HookResult,
  HookServices,
  GeneratedAsset
} from './hooks/types';

export type {
  ParadoxType,
  ResolutionStrategy,
  ParadoxContext,
  ResolutionResult
} from './paradox-resolver';

/**
 * Quick start example:
 * 
 * ```typescript
 * import { initNarrativeGit, characterPortraitHook } from '@narrative/canon/git';
 * 
 * // Create a new narrative repository
 * const git = initNarrativeGit({
 *   author: 'narrative-architect',
 *   autoExecuteHooks: true
 * });
 * 
 * // Register hooks for asset generation
 * git.registerHook(characterPortraitHook);
 * 
 * // Add a character
 * git.add({
 *   type: 'ADD_ENTITY',
 *   payload: {
 *     id: 'char_kira',
 *     type: 'character',
 *     name: 'Kira',
 *     description: 'Project 89 operative'
 *   }
 * });
 * 
 * // Commit the change
 * await git.commit('Introduce protagonist');
 * 
 * // Create an alternate timeline
 * git.branch('alternate-fate', { checkout: true });
 * ```
 */