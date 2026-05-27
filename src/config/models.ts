/**
 * Model Configuration for Narrative Canon
 *
 * This configuration uses the latest Gemini 3 models.
 *
 * Environment Variables:
 * - GEMINI_FAST_MODE=true: Use Flash model for all operations
 * - GEMINI_API_KEY: Your Google AI API key
 * - GOOGLE_AI_API_KEY: Alternative API key env var
 */

export interface ModelConfig {
  name: string;
  description: string;
  bestFor: string[];
  temperature: number;
  maxTokens?: number;
  thinkingLevel?: 'low' | 'high';
}

export const GEMINI_MODELS: Record<string, ModelConfig> = {
  // Gemini 3.1 Pro Custom Tools — sibling endpoint Google shipped specifically
  // to fix the bias the base 3.1-pro-preview has against custom user-defined
  // function tools. This is the correct model for agentic tool-calling chat.
  // The base 3.1-pro-preview model exhibits a "I'm a text-based assistant"
  // refusal pattern even when given valid tools; -customtools removes that.
  // See: https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview
  'gemini-3.1-pro-preview-customtools': {
    name: 'gemini-3.1-pro-preview-customtools',
    description: 'Gemini 3.1 Pro Custom Tools — same model with proper bias toward user-defined function tools (no spurious refusals).',
    bestFor: ['collaborative writing', 'agentic tool calling', 'narrative chat', 'world-bible grounding'],
    temperature: 0.7,
    maxTokens: 64000,
    thinkingLevel: 'high'
  },

  // Gemini 3.1 Pro (base) — DO NOT USE for chat with our tool surface. The
  // base model deprioritizes custom function tools and produces refusals like
  // "I'm a text-based assistant and can't generate new image files" even when
  // generate_portrait, edit_image etc. are valid and present. Kept here for
  // reference / fallback only.
  'gemini-3.1-pro-preview': {
    name: 'gemini-3.1-pro-preview',
    description: 'Gemini 3.1 Pro Preview - base model. Has a known bias against custom tools — prefer -customtools variant.',
    bestFor: ['fallback only'],
    temperature: 0.7,
    maxTokens: 64000,
    thinkingLevel: 'high'
  },

  // Gemini 3 Pro - Previous generation, kept as fallback
  'gemini-3-pro-preview': {
    name: 'gemini-3-pro-preview',
    description: 'Gemini 3 Pro Preview - Most advanced reasoning model, tops LMArena at 1501 Elo',
    bestFor: ['complex reasoning', 'entity classification', 'relationship analysis', 'state change detection', 'maximum quality'],
    temperature: 0.1,
    maxTokens: 64000,
    thinkingLevel: 'high'
  },

  // Gemini 3 Flash - Fast with near Pro-level performance
  'gemini-3-flash-preview': {
    name: 'gemini-3-flash-preview',
    description: 'Gemini 3 Flash Preview - Near Pro-level at Flash speed, ideal for agentic workflows',
    bestFor: ['scene detection', 'fast extraction', 'real-time analysis', 'speed mode', 'agentic workflows'],
    temperature: 0.2,
    maxTokens: 64000,
    thinkingLevel: 'low'
  },

  // Fallback Gemini 2.5 models
  'gemini-2.5-pro-preview-05-06': {
    name: 'gemini-2.5-pro-preview-05-06',
    description: 'Gemini 2.5 Pro Preview (fallback)',
    bestFor: ['complex reasoning', 'fallback option'],
    temperature: 0.1,
    maxTokens: 32000
  },

  'gemini-2.5-flash-preview-05-20': {
    name: 'gemini-2.5-flash-preview-05-20',
    description: 'Gemini 2.5 Flash Preview (fallback)',
    bestFor: ['speed', 'fallback option'],
    temperature: 0.2,
    maxTokens: 32000
  },

  // Fallback to 1.5 models if needed
  'gemini-1.5-pro': {
    name: 'gemini-1.5-pro',
    description: 'Gemini 1.5 Pro - reliable fallback',
    bestFor: ['complex analysis', 'fallback option'],
    temperature: 0.3,
    maxTokens: 8192
  },

  'gemini-1.5-flash': {
    name: 'gemini-1.5-flash',
    description: 'Gemini 1.5 Flash - fast fallback',
    bestFor: ['speed', 'fallback option'],
    temperature: 0.3,
    maxTokens: 8192
  }
};

export const MODEL_SELECTION_STRATEGY = {
  // Default + smart route to the customtools variant of 3.1 Pro for
  // collaborative chat — needs long context for world bibles AND reliable
  // tool calling, and the base preview is biased against custom tools.
  // Flash stays for background extraction tasks (different code path; no
  // tool calling, just structured extraction).
  default: 'gemini-3.1-pro-preview-customtools',
  fast: 'gemini-3-flash-preview',
  smart: 'gemini-3.1-pro-preview-customtools',

  // Task-specific preferences
  entityExtraction: 'gemini-3-flash-preview',
  sceneDetection: 'gemini-3-flash-preview',
  relationships: 'gemini-3-flash-preview',
  stateChanges: 'gemini-3-flash-preview',
};

export function getModelForTask(task: keyof typeof MODEL_SELECTION_STRATEGY): string {
  const fastMode = process.env.GEMINI_FAST_MODE === 'true';

  if (fastMode) {
    return MODEL_SELECTION_STRATEGY.fast;
  }

  return MODEL_SELECTION_STRATEGY[task] || MODEL_SELECTION_STRATEGY.default;
}

export function getModelConfig(modelName: string): ModelConfig {
  return GEMINI_MODELS[modelName] || GEMINI_MODELS[MODEL_SELECTION_STRATEGY.default];
}

export function logModelSelection(task: string, model: string): void {
  const config = getModelConfig(model);
  const fastMode = process.env.GEMINI_FAST_MODE === 'true';

  console.log(`🤖 ${task}: ${model}${fastMode ? ' (FAST MODE)' : ''}`);
  console.log(`   ${config.description}`);
  console.log(`   Temperature: ${config.temperature}, Max tokens: ${config.maxTokens || 'default'}`);
}

// Environment variable helpers
export function setupEnvironment(): void {
  console.log('🚀 Narrative Canon Model Configuration');
  console.log('====================================');

  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  const fastMode = process.env.GEMINI_FAST_MODE === 'true';

  if (!apiKey) {
    console.log('⚠️  No API key found - using Mock LLM');
    console.log('   Set GOOGLE_AI_API_KEY or GEMINI_API_KEY for real models');
  } else {
    console.log('✅ API key found - using Gemini 3 models');
  }

  console.log(`🏃 Fast Mode: ${fastMode ? 'ENABLED' : 'DISABLED'}`);
  if (!fastMode) {
    console.log('   Set GEMINI_FAST_MODE=true for Flash model');
  }

  console.log(`🎯 Default Model: ${MODEL_SELECTION_STRATEGY.default}`);
  console.log(`⚡ Fast Model: ${MODEL_SELECTION_STRATEGY.fast}`);
  console.log('');
}
