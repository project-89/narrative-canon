/**
 * THE MODEL REGISTRY — one declarative table for every generation model the
 * studio can use (Michael 2026-07-31: "consider the best ways to manage many
 * models in our studio").
 *
 * The registry is the single source of truth for:
 *   - the SERVER's dispatch (/render + video jobs route by `provider`)
 *   - the UI's model pickers (GET /api/narrative/models — labels, status)
 *   - the AGENT's knowledge (a compact model table in the system prompt)
 *   - GUARDRAILS (capabilities like photorealRefs/maxRefs are ADVISORY: call
 *     sites surface a warning to the caller/agent rather than stripping refs,
 *     because photoreal-ness can't be classified reliably in code and
 *     stylized refs are legitimate on those same models — the rule lives in
 *     the agent's registry notes and the returned `warnings`)
 *
 * Upstream model IDs are DATA, not code: every AtlasCloud id can be overridden
 * via env (ATLAS_MODEL_<KEY>) so a renamed upstream model is a .env edit, not
 * a deploy. Availability is computed from which API keys are present.
 */

export type ModelKind = 'image' | 'video';
export type ModelProvider = 'gemini' | 'openai-direct' | 'atlascloud' | 'replicate';

export interface StudioModel {
  /** Studio-wide handle — what UI/agent/tools pass as `model`/`backend`. */
  key: string;
  kind: ModelKind;
  provider: ModelProvider;
  /** Exact upstream model identifier (env-overridable for atlascloud). */
  providerModelId: string;
  label: string;
  /** Why/when to pick it — surfaced to the agent verbatim. */
  notes: string;
  capabilities: {
    /** Accepts reference images at all. */
    refs?: boolean;
    maxRefs?: number;
    /** Image-to-video (first-frame anchoring). */
    i2v?: boolean;
    maxDurationSec?: number;
    /** Generates audio natively. */
    audio?: boolean;
    /** STANDING RULE (advisory): models with photorealRefs:false must never
     *  receive photoreal/realistic-face reference images — Seedance's input
     *  scan rejects them (E005). Call sites warn the caller (response
     *  `warnings`) instead of stripping refs, since stylized refs are
     *  legitimate on these models and photoreal-ness isn't classifiable. */
    photorealRefs?: boolean;
    /** How well long/unusual style TEXT is obeyed. */
    styleTextObedience?: 'high' | 'medium' | 'low';
  };
}

const atlasId = (key: string, fallback: string): string => {
  const envKey = `ATLAS_MODEL_${key.toUpperCase().replace(/-/g, '_')}`;
  return process.env[envKey] || fallback;
};

/** The catalog. Order matters only for display. */
export function getModelRegistry(): StudioModel[] {
  return [
    // ---- IMAGE ----
    {
      key: 'nano-banana', kind: 'image', provider: 'gemini',
      providerModelId: 'gemini-3.1-flash-image-preview', label: 'NB2',
      notes: 'Fast, excellent reference-anchored identity continuity. The production default for shots of known characters with a locked style.',
      capabilities: { refs: true, maxRefs: 14, photorealRefs: true, styleTextObedience: 'medium' },
    },
    {
      key: 'nano-banana-pro', kind: 'image', provider: 'gemini',
      providerModelId: 'gemini-3-pro-image-preview', label: 'NB Pro',
      notes: 'Heavier Gemini image model — strongest text-in-image and complex composition on the Gemini side.',
      capabilities: { refs: true, maxRefs: 14, photorealRefs: true, styleTextObedience: 'medium' },
    },
    {
      key: 'nano-banana-legacy', kind: 'image', provider: 'gemini',
      providerModelId: 'gemini-2.5-flash-image', label: 'NB Legacy',
      notes: 'Legacy Gemini image model (3-ref cap). Kept for reproducing old renders.',
      capabilities: { refs: true, maxRefs: 3, photorealRefs: true, styleTextObedience: 'low' },
    },
    {
      key: 'gpt-image', kind: 'image', provider: 'atlascloud',
      // BASE id — the Atlas client appends the modality (/text-to-image | /edit)
      // from the inputs. Live-verified against their /models catalog 2026-07-31.
      providerModelId: atlasId('gpt-image', 'openai/gpt-image-2'), label: 'GPT-Image 2',
      notes: 'OpenAI GPT Image 2 via AtlasCloud (direct OpenAI is dead — billing). BEST at obeying long/unusual style text, multi-panel layouts, and text rendering. First pick for style matrices, diversify plates, storyboard pages.',
      capabilities: { refs: true, maxRefs: 4, photorealRefs: true, styleTextObedience: 'high' },
    },
    {
      key: 'seedream', kind: 'image', provider: 'atlascloud',
      providerModelId: atlasId('seedream', 'bytedance/seedream-v5.0-pro'), label: 'Seedream v5 Pro',
      notes: 'ByteDance image model via AtlasCloud — strong prompt following, stylized/anime-adjacent strengths. NEVER attach photoreal/realistic-face references (ByteDance input scan rejects them).',
      capabilities: { refs: true, maxRefs: 4, photorealRefs: false, styleTextObedience: 'high' },
    },
    // ---- VIDEO ----
    {
      key: 'veo', kind: 'video', provider: 'gemini',
      providerModelId: 'veo-3.1', label: 'Veo 3.1',
      notes: 'The photoreal workhorse: single-shot clips with NATIVE AUDIO (dialogue speaker-colon syntax + no-subtitles clause). First/last-frame interpolation supported.',
      capabilities: { i2v: true, maxDurationSec: 8, audio: true, photorealRefs: true },
    },
    {
      key: 'seedance-video', kind: 'video', provider: 'atlascloud',
      // BASE id — modality (/text-to-video | /image-to-video | /reference-to-video)
      // appended by the client from the inputs.
      providerModelId: atlasId('seedance-video', 'bytedance/seedance-2.0'), label: 'Seedance 2.0',
      notes: 'ByteDance QUAD-MODAL video via AtlasCloud ($0.09/s) — reference inputs span text/image/video/audio ("Universal Reference", reference-to-video). Excellent for ANIMATION/stylized motion; the sequence engine for stylized multi-shot takes. STANDING RULE (advisory — see header): animation only — never photoreal/realistic-face inputs. WATCH: Seedance 2.5 announced (up to 50 refs, 30s clips, ~3min consistent video) — add a registry row the day it appears in the Atlas catalog.',
      capabilities: { i2v: true, refs: true, maxRefs: 8, maxDurationSec: 15, audio: false, photorealRefs: false },
    },
    {
      key: 'minimax-h3', kind: 'video', provider: 'atlascloud',
      providerModelId: atlasId('minimax-h3', 'minimax/h3'), label: 'MiniMax H3',
      notes: 'MiniMax H3 via AtlasCloud (released 2026-07): 15-second clips, T2V + I2V + REFERENCE-to-video (multi-ref!), strong instruction following, photoreal OK — the PHOTOREAL sequence engine (the role Seedance could never take). Prompting strategy still being learned — record lessons in the prompt ledger as we go.',
      capabilities: { i2v: true, refs: true, maxRefs: 4, maxDurationSec: 15, audio: false, photorealRefs: true },
    },
  ];
}

/** Availability, computed from the environment. A model is 'live' when its
 *  provider's key is present; 'down' otherwise (shown but not selectable-by-
 *  default in UIs; the server refuses with a clear reason). */
export function getModelStatus(m: StudioModel): 'live' | 'down' {
  switch (m.provider) {
    case 'gemini': return (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY) ? 'live' : 'down';
    case 'atlascloud': return process.env.ATLASCLOUD_API_KEY ? 'live' : 'down';
    case 'replicate': return process.env.REPLICATE_API_TOKEN ? 'live' : 'down';
    case 'openai-direct': return 'down'; // dead by policy (billing hard limit) — AtlasCloud replaces it
  }
}

export function findModel(key: string | undefined): StudioModel | undefined {
  if (!key) return undefined;
  return getModelRegistry().find((m) => m.key === key);
}

/** Compact table for the agent's system prompt. */
export function describeModelRegistryForAgent(): string {
  return getModelRegistry().map((m) => {
    const st = getModelStatus(m);
    const caps = [
      m.capabilities.maxDurationSec ? `≤${m.capabilities.maxDurationSec}s` : null,
      m.capabilities.audio ? 'audio' : null,
      m.capabilities.i2v ? 'i2v' : null,
      m.capabilities.photorealRefs === false ? 'NO-PHOTOREAL-REFS' : null,
      m.capabilities.styleTextObedience === 'high' ? 'style-text:high' : null,
    ].filter(Boolean).join(', ');
    return `- ${m.key} (${m.label}, ${m.kind}, ${st.toUpperCase()}${caps ? `; ${caps}` : ''}): ${m.notes}`;
  }).join('\n');
}
