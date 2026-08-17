/**
 * Pipeline Runner
 *
 * Composable pipeline orchestrator. Executes phases in order, supports
 * resume from a specific phase, single-phase invocation, and phase
 * dependency checking via Nit commit tags.
 *
 * Design: The runner is a simple TypeScript orchestrator, not ADK-based.
 * Individual phases can use ADK agents internally if they want to.
 */

import { PipelineDefinition, PipelinePhase } from './pipeline-phase';
import { PipelineContext, PhaseResult } from './pipeline-context';

// ─── Runner Events ───────────────────────────────────────────────────────────

export type PipelineEventType =
  | 'pipeline:start'
  | 'pipeline:complete'
  | 'pipeline:error'
  | 'phase:start'
  | 'phase:complete'
  | 'phase:skip'
  | 'phase:error';

export interface PipelineEvent {
  type: PipelineEventType;
  pipelineId: string;
  phaseId?: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export type PipelineEventListener = (event: PipelineEvent) => void;

// ─── Runner ──────────────────────────────────────────────────────────────────

export interface PipelineRunnerOptions {
  /** Stop pipeline on first phase error (default: true) */
  stopOnError?: boolean;
  /** Event listener for pipeline progress */
  onEvent?: PipelineEventListener;
  /** Whether to check phase prerequisites before running (default: true) */
  checkPrerequisites?: boolean;
}

export class PipelineRunner {
  private options: Required<PipelineRunnerOptions>;

  constructor(
    private definition: PipelineDefinition,
    options: PipelineRunnerOptions = {}
  ) {
    this.options = {
      stopOnError: options.stopOnError ?? true,
      onEvent: options.onEvent ?? (() => {}),
      checkPrerequisites: options.checkPrerequisites ?? true,
    };
  }

  /**
   * Run the full pipeline from scratch.
   * Executes all phases in order.
   */
  async run(ctx: PipelineContext): Promise<PipelineContext> {
    this.emit({
      type: 'pipeline:start',
      pipelineId: ctx.pipelineId,
      timestamp: Date.now(),
      data: {
        pipelineName: this.definition.name,
        phaseCount: this.definition.phases.length,
      },
    });

    let currentCtx = ctx;

    for (const phase of this.definition.phases) {
      currentCtx = await this.executePhase(currentCtx, phase);

      // Check for errors
      const lastResult = currentCtx.phaseHistory[currentCtx.phaseHistory.length - 1];
      if (lastResult && !lastResult.success && this.options.stopOnError) {
        this.emit({
          type: 'pipeline:error',
          pipelineId: ctx.pipelineId,
          phaseId: phase.id,
          timestamp: Date.now(),
          data: { error: lastResult.error?.message },
        });
        break;
      }
    }

    this.emit({
      type: 'pipeline:complete',
      pipelineId: ctx.pipelineId,
      timestamp: Date.now(),
      data: {
        phasesCompleted: currentCtx.phaseHistory.filter((r) => r.success).length,
        phasesFailed: currentCtx.phaseHistory.filter((r) => !r.success).length,
        totalDuration: currentCtx.phaseHistory.reduce((sum, r) => sum + r.duration, 0),
      },
    });

    return currentCtx;
  }

  /**
   * Resume pipeline from a specific phase.
   * Skips all phases before the target phase, then runs from there.
   */
  async resume(ctx: PipelineContext, fromPhaseId: string): Promise<PipelineContext> {
    const phaseIndex = this.definition.phases.findIndex((p) => p.id === fromPhaseId);
    if (phaseIndex === -1) {
      throw new Error(`Phase "${fromPhaseId}" not found in pipeline "${this.definition.id}"`);
    }

    this.emit({
      type: 'pipeline:start',
      pipelineId: ctx.pipelineId,
      timestamp: Date.now(),
      data: {
        pipelineName: this.definition.name,
        resumeFrom: fromPhaseId,
        phaseCount: this.definition.phases.length - phaseIndex,
      },
    });

    let currentCtx = ctx;

    // Skip phases before the resume point
    for (let i = 0; i < phaseIndex; i++) {
      this.emit({
        type: 'phase:skip',
        pipelineId: ctx.pipelineId,
        phaseId: this.definition.phases[i].id,
        timestamp: Date.now(),
      });
    }

    // Run from the resume point
    for (let i = phaseIndex; i < this.definition.phases.length; i++) {
      const phase = this.definition.phases[i];
      currentCtx = await this.executePhase(currentCtx, phase);

      const lastResult = currentCtx.phaseHistory[currentCtx.phaseHistory.length - 1];
      if (lastResult && !lastResult.success && this.options.stopOnError) {
        this.emit({
          type: 'pipeline:error',
          pipelineId: ctx.pipelineId,
          phaseId: phase.id,
          timestamp: Date.now(),
          data: { error: lastResult.error?.message },
        });
        break;
      }
    }

    this.emit({
      type: 'pipeline:complete',
      pipelineId: ctx.pipelineId,
      timestamp: Date.now(),
    });

    return currentCtx;
  }

  /**
   * Run a single phase independently.
   * Checks prerequisites unless `checkPrerequisites` is false.
   */
  async runPhase(ctx: PipelineContext, phaseId: string): Promise<PipelineContext> {
    const phase = this.definition.phases.find((p) => p.id === phaseId);
    if (!phase) {
      throw new Error(`Phase "${phaseId}" not found in pipeline "${this.definition.id}"`);
    }

    if (this.options.checkPrerequisites && !phase.canRun(ctx)) {
      const result: PhaseResult = {
        phaseId: phase.id,
        duration: 0,
        success: false,
        error: new Error(
          `Prerequisites not met for phase "${phase.id}". ` +
          `Requires: [${phase.requires.join(', ')}]`
        ),
      };
      return {
        ...ctx,
        phaseHistory: [...ctx.phaseHistory, result],
      };
    }

    return this.executePhase(ctx, phase);
  }

  /**
   * Get all phases that can currently run given the Nit state.
   */
  getRunnable(ctx: PipelineContext): PipelinePhase[] {
    return this.definition.phases.filter((phase) => phase.canRun(ctx));
  }

  /**
   * Get phases that have already completed (based on phase history).
   */
  getCompleted(ctx: PipelineContext): string[] {
    return ctx.phaseHistory
      .filter((r) => r.success)
      .map((r) => r.phaseId);
  }

  /**
   * Get the next phase that should run (first incomplete phase whose prerequisites are met).
   */
  getNext(ctx: PipelineContext): PipelinePhase | null {
    const completed = new Set(this.getCompleted(ctx));
    for (const phase of this.definition.phases) {
      if (completed.has(phase.id)) continue;
      if (phase.canRun(ctx)) return phase;
    }
    return null;
  }

  /**
   * Get the pipeline definition.
   */
  getDefinition(): PipelineDefinition {
    return this.definition;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async executePhase(
    ctx: PipelineContext,
    phase: PipelinePhase
  ): Promise<PipelineContext> {
    this.emit({
      type: 'phase:start',
      pipelineId: ctx.pipelineId,
      phaseId: phase.id,
      timestamp: Date.now(),
      data: { phaseName: phase.name },
    });

    const startTime = Date.now();

    try {
      // Check prerequisites
      if (this.options.checkPrerequisites && !phase.canRun(ctx)) {
        const result: PhaseResult = {
          phaseId: phase.id,
          duration: Date.now() - startTime,
          success: false,
          error: new Error(
            `Prerequisites not met: requires [${phase.requires.join(', ')}]`
          ),
        };

        this.emit({
          type: 'phase:error',
          pipelineId: ctx.pipelineId,
          phaseId: phase.id,
          timestamp: Date.now(),
          data: { error: result.error!.message },
        });

        return {
          ...ctx,
          phaseHistory: [...ctx.phaseHistory, result],
        };
      }

      // Execute the phase
      const updatedCtx = await phase.execute(ctx);

      const result: PhaseResult = {
        phaseId: phase.id,
        duration: Date.now() - startTime,
        success: true,
        commitId: updatedCtx.phaseHistory.find((r) => r.phaseId === phase.id)?.commitId,
      };

      // If the phase didn't add its own result, add one
      const hasOwnResult = updatedCtx.phaseHistory.some((r) => r.phaseId === phase.id);
      const finalCtx = hasOwnResult
        ? updatedCtx
        : {
            ...updatedCtx,
            phaseHistory: [...updatedCtx.phaseHistory, result],
          };

      this.emit({
        type: 'phase:complete',
        pipelineId: ctx.pipelineId,
        phaseId: phase.id,
        timestamp: Date.now(),
        data: { duration: result.duration },
      });

      return finalCtx;
    } catch (error) {
      const result: PhaseResult = {
        phaseId: phase.id,
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };

      this.emit({
        type: 'phase:error',
        pipelineId: ctx.pipelineId,
        phaseId: phase.id,
        timestamp: Date.now(),
        data: { error: result.error!.message },
      });

      return {
        ...ctx,
        phaseHistory: [...ctx.phaseHistory, result],
      };
    }
  }

  private emit(event: PipelineEvent): void {
    try {
      this.options.onEvent(event);
    } catch {
      // Never let event listener errors break the pipeline
    }
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a pipeline runner from a definition.
 */
export function createPipelineRunner(
  definition: PipelineDefinition,
  options?: PipelineRunnerOptions
): PipelineRunner {
  return new PipelineRunner(definition, options);
}
