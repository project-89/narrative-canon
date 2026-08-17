/**
 * Pipeline Phase
 *
 * Interface for composable pipeline phases. Each phase declares what it
 * requires (prerequisite phase IDs) and what it produces (Nit commit tags),
 * enabling the runner to determine which phases can execute given current state.
 */

import { PipelineContext, PhaseResult } from './pipeline-context';

// ─── Phase Interface ─────────────────────────────────────────────────────────

export interface PipelinePhase {
  /** Unique phase identifier */
  id: string;

  /** Human-readable phase name */
  name: string;

  /** Description of what this phase does */
  description?: string;

  /**
   * IDs of prerequisite phases. The phase can only run if all
   * prerequisites have completed (their commit tags exist in Nit).
   */
  requires: string[];

  /**
   * Nit commit tags that this phase produces when it completes.
   * Used by the runner to track phase completion.
   */
  produces: string[];

  /**
   * Check if this phase can run given the current context.
   * Default implementation checks that all required phases have produced their tags.
   */
  canRun(ctx: PipelineContext): boolean;

  /**
   * Execute the phase, returning the (possibly modified) pipeline context.
   * The phase should:
   * 1. Read from `ctx.nit` and `ctx.entities`
   * 2. Do its work (call LLMs, process data, etc.)
   * 3. Commit results to `ctx.nit` with tags from `this.produces`
   * 4. Add a PhaseResult to `ctx.phaseHistory`
   * 5. Return the updated context
   */
  execute(ctx: PipelineContext): Promise<PipelineContext>;
}

// ─── Pipeline Definition ─────────────────────────────────────────────────────

export interface PipelineDefinition {
  /** Unique pipeline identifier */
  id: string;

  /** Human-readable pipeline name */
  name: string;

  /** Description of the pipeline's purpose */
  description?: string;

  /** Ordered list of phases */
  phases: PipelinePhase[];

  /** Maximum iterations if the pipeline loops */
  maxIterations?: number;
}

// ─── Base Phase Implementation ───────────────────────────────────────────────

/**
 * Abstract base class for pipeline phases with default `canRun` implementation.
 */
export abstract class BasePipelinePhase implements PipelinePhase {
  abstract id: string;
  abstract name: string;
  description?: string;
  requires: string[] = [];
  produces: string[] = [];

  /**
   * Default implementation: check that all required phase tags
   * exist in the Nit commit history.
   */
  canRun(ctx: PipelineContext): boolean {
    if (this.requires.length === 0) return true;

    const log = ctx.nit.log({ limit: 200 });
    const allTags = new Set<string>();
    for (const entry of log) {
      for (const tag of entry.commit.tags ?? []) {
        allTags.add(tag);
      }
    }

    return this.requires.every((reqTag) => allTags.has(reqTag));
  }

  abstract execute(ctx: PipelineContext): Promise<PipelineContext>;
}

/**
 * Create a simple phase from a function (no subclassing needed).
 */
export function createPhase(config: {
  id: string;
  name: string;
  description?: string;
  requires?: string[];
  produces?: string[];
  execute: (ctx: PipelineContext) => Promise<PipelineContext>;
}): PipelinePhase {
  const phase = new (class extends BasePipelinePhase {
    id = config.id;
    name = config.name;
    description = config.description;
    requires = config.requires ?? [];
    produces = config.produces ?? [];

    execute(ctx: PipelineContext): Promise<PipelineContext> {
      return config.execute(ctx);
    }
  })();

  return phase;
}
