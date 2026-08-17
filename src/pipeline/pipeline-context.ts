/**
 * Pipeline Context
 *
 * Shared context object passed through every pipeline phase.
 * Contains the Nit instance (single source of truth), optional Aureum world state,
 * trigger context for hook-invoked pipelines, and series/episode metadata.
 */

import { NarrativeGit } from '../git/narrative-git';
import { HookTriggerType } from '../git/hooks/types';
import { World } from '../engine/world';
import { RuleSet } from '../engine/rules';
import { Entity as NitEntity } from '../types';

// ─── Phase Result ────────────────────────────────────────────────────────────

export interface PhaseResult {
  /** Which phase produced this result */
  phaseId: string;
  /** Nit commit ID created by this phase */
  commitId?: string;
  /** How long the phase took (ms) */
  duration: number;
  /** Phase-specific output data */
  output?: Record<string, unknown>;
  /** Any errors encountered */
  error?: Error;
  /** Whether the phase succeeded */
  success: boolean;
}

// ─── Trigger Context ─────────────────────────────────────────────────────────

export interface PipelineTrigger {
  /** ID of the hook that triggered this pipeline */
  hookId: string;
  /** What type of event triggered the hook */
  triggerType: HookTriggerType;
  /** Entities from the triggering event */
  triggerEntities: NitEntity[];
  /** Optional instructions for the pipeline (from the hook or Aureum rule payload) */
  instructions?: string;
  /** Optional prompt for LLM-based phases */
  prompt?: string;
}

// ─── Series Context ──────────────────────────────────────────────────────────

export interface SeriesContext {
  /** Series identifier */
  seriesId: string;
  /** Current episode number */
  episodeNumber: number;
  /** Commit IDs of previous episodes (for continuity) */
  previousEpisodes: string[];
  /** Optional series-level metadata */
  metadata?: Record<string, unknown>;
}

// ─── Pipeline Context ────────────────────────────────────────────────────────

export interface PipelineContext {
  /** NarrativeGit instance — the single source of truth */
  nit: NarrativeGit;

  /** Current Aureum world state (pulled from Nit or built during pipeline) */
  world?: World;
  ruleSet?: RuleSet;

  /** Entities relevant to this pipeline run (pulled from Nit or provided) */
  entities: NitEntity[];

  /** Unique ID for this pipeline run */
  pipelineId: string;

  /** History of phase executions so far */
  phaseHistory: PhaseResult[];

  /** Hook-provided trigger context (if pipeline was triggered by a hook) */
  trigger?: PipelineTrigger;

  /** Series/episode context for continuation */
  series?: SeriesContext;

  /** Pipeline-level configuration */
  config?: Record<string, unknown>;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a fresh PipelineContext.
 */
export function createPipelineContext(
  nit: NarrativeGit,
  options?: {
    pipelineId?: string;
    entities?: NitEntity[];
    trigger?: PipelineTrigger;
    series?: SeriesContext;
    config?: Record<string, unknown>;
  }
): PipelineContext {
  return {
    nit,
    entities: options?.entities ?? [],
    pipelineId: options?.pipelineId ?? `pipeline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    phaseHistory: [],
    trigger: options?.trigger,
    series: options?.series,
    config: options?.config,
  };
}
