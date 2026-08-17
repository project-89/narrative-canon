/**
 * Pipeline Module — Composable Nit-First Pipeline Infrastructure
 *
 * Provides the framework for building multi-phase content pipelines
 * that read from and write to NarrativeGit as their single source of truth.
 */

// Context
export {
  PipelineContext,
  PhaseResult,
  PipelineTrigger,
  SeriesContext,
  createPipelineContext,
} from './pipeline-context';

// Phase
export {
  PipelinePhase,
  PipelineDefinition,
  BasePipelinePhase,
  createPhase,
} from './pipeline-phase';

// Runner
export {
  PipelineRunner,
  PipelineRunnerOptions,
  PipelineEvent,
  PipelineEventType,
  PipelineEventListener,
  createPipelineRunner,
} from './pipeline-runner';
