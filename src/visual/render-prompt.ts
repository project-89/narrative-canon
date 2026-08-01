import {
  applyVisualStyleDirective,
  hasExplicitVisualStyleDirective,
} from './image-generator';

export type RenderStyleDirectiveSource = 'project' | 'default' | 'caller' | 'none';

export interface AssembleVisibleRenderPromptInput {
  callerPrompt: string;
  projectStyleDirective?: string;
  styleTail?: string;
  suppressProjectStyle?: boolean;
  suppressStylePrompt?: boolean;
}

/**
 * Assemble the complete provider prompt at the common boundary shared by all
 * image backends. Every injected word is returned to the caller as part of the
 * prompt; suppression modes stay genuinely raw.
 */
export function assembleVisibleRenderPrompt({
  callerPrompt,
  projectStyleDirective = '',
  styleTail = '',
  suppressProjectStyle = false,
  suppressStylePrompt = false,
}: AssembleVisibleRenderPromptInput): {
  prompt: string;
  styleDirectiveApplied: boolean;
  styleDirectiveSource: RenderStyleDirectiveSource;
} {
  const allowDefaultStyleFallback = projectStyleDirective.length === 0
    && !suppressProjectStyle
    && !suppressStylePrompt;
  const callerHasExplicitStyle = hasExplicitVisualStyleDirective(callerPrompt);
  const promptWithLeadingStyle = allowDefaultStyleFallback
    ? applyVisualStyleDirective(callerPrompt)
    : `${projectStyleDirective}${callerPrompt}`;
  const defaultStyleDirectiveApplied = allowDefaultStyleFallback
    && !callerHasExplicitStyle
    && promptWithLeadingStyle !== callerPrompt;
  const styleDirectiveSource: RenderStyleDirectiveSource = projectStyleDirective.length > 0
    ? 'project'
    : defaultStyleDirectiveApplied
      ? 'default'
      : callerHasExplicitStyle
        ? 'caller'
        : 'none';

  return {
    prompt: `${promptWithLeadingStyle}${styleTail}`,
    styleDirectiveApplied: projectStyleDirective.length > 0 || defaultStyleDirectiveApplied,
    styleDirectiveSource,
  };
}
