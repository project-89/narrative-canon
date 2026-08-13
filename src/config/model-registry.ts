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
export type ModelProvider = 'gemini' | 'openai-direct' | 'atlascloud' | 'replicate' | 'bfl';

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
    /** How reference images bind IDENTITY (faces, wardrobe, a location's
     *  character). 'strong' = refs anchor identity (NB2's trait). 'weak' =
     *  refs are edit/style material, NOT identity anchors (GPT-Image's edit
     *  modality transforms inputs rather than casting them) — cast
     *  consistency silently fails there. Advisory like photorealRefs:
     *  call sites warn the caller, never strip. */
    identityRefs?: 'strong' | 'medium' | 'weak';
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
      capabilities: { refs: true, maxRefs: 14, photorealRefs: true, styleTextObedience: 'medium', identityRefs: 'strong' },
    },
    {
      key: 'nano-banana-pro', kind: 'image', provider: 'gemini',
      providerModelId: 'gemini-3-pro-image-preview', label: 'NB Pro',
      notes: 'Heavier Gemini image model — strongest text-in-image and complex composition on the Gemini side.',
      capabilities: { refs: true, maxRefs: 14, photorealRefs: true, styleTextObedience: 'medium', identityRefs: 'strong' },
    },
    {
      key: 'nano-banana-legacy', kind: 'image', provider: 'gemini',
      providerModelId: 'gemini-2.5-flash-image', label: 'NB Legacy',
      notes: 'Legacy Gemini image model (3-ref cap). Kept for reproducing old renders.',
      capabilities: { refs: true, maxRefs: 3, photorealRefs: true, styleTextObedience: 'low', identityRefs: 'strong' },
    },
    {
      key: 'gpt-image', kind: 'image', provider: 'atlascloud',
      // BASE id — the Atlas client appends the modality (/text-to-image | /edit)
      // from the inputs. Live-verified against their /models catalog 2026-07-31.
      providerModelId: atlasId('gpt-image', 'openai/gpt-image-2'), label: 'GPT-Image 2',
      notes: 'OpenAI GPT Image 2 via AtlasCloud (direct OpenAI is dead — billing). BEST at obeying long/unusual style text, multi-panel layouts, and text rendering. First pick for style matrices, diversify plates, storyboard pages. NOT an identity model: its edit modality treats reference images as material to transform, not faces to cast — for character/location consistency use nano-banana.',
      capabilities: { refs: true, maxRefs: 4, photorealRefs: true, styleTextObedience: 'high', identityRefs: 'weak' },
    },
    {
      key: 'flux-2', kind: 'image', provider: 'bfl',
      providerModelId: 'flux-2-pro', label: 'FLUX.2 Pro',
      notes: 'BFL FLUX.2 [pro] (direct, BFL_API_KEY): generation AND multi-reference EDITING in one model — up to 8 input images addressed BY NUMBER in the prompt ("the woman in image 2 wearing the coat from image 3, in the style of image 4"), which is exactly the studio\'s reference-manifest grammar. EXPLICIT STYLE TRANSFER ("match the style of image N") — a native API for the style-leash doctrine. 32K-token prompts obeyed; strong typography (quote exact text, describe placement + font character); era/camera/film-stock photorealism (name the stock: "Kodak Portra 400", "2000s digicam"). PROMPT SHAPE: subject → action → location → style → camera → lighting → colors → effect; lighting is the single highest-impact slot — describe it like a photographer (source/quality/direction/temperature). Prompt upsampling is DISABLED by the studio (our assembled prompts are authoritative). Identity-holding across refs claimed strong — verify on our cast and record_prompt_lesson. See docs/FLUX_PROMPTING_GUIDE.md.',
      capabilities: { refs: true, maxRefs: 8, photorealRefs: true, styleTextObedience: 'high', identityRefs: 'medium' },
    },
    {
      key: 'seedream', kind: 'image', provider: 'atlascloud',
      providerModelId: atlasId('seedream', 'bytedance/seedream-v5.0-pro'), label: 'Seedream v5 Pro',
      notes: 'ByteDance image model via AtlasCloud — strong prompt following, stylized/anime-adjacent strengths. NEVER attach photoreal/realistic-face references (ByteDance input scan rejects them).',
      capabilities: { refs: true, maxRefs: 4, photorealRefs: false, styleTextObedience: 'high', identityRefs: 'medium' },
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
      key: 'seedance-25', kind: 'video', provider: 'atlascloud',
      providerModelId: atlasId('seedance-25', 'bytedance/seedance-2.5'), label: 'Seedance 2.5',
      notes: 'Seedance 2.5 via AtlasCloud ($0.134/s): 4–30s clips, native audio, up to 30 image refs + 10 video refs + 10 audio refs per request (reference_images/reference_videos/reference_audios API). Its NATIVE citation grammar is @Image1/@Video1 — exactly composeSequencePrompt\'s dialect — and it SHINES on long, super-descriptive prompts: promptDensity "full" is the right profile (the opposite of H3\'s compact). Real-human-face uploads are refused by the provider; model-GENERATED cast refs (our entire deck) are allowed. The 50-ref ceiling is a ceiling, not a target — curated small decks beat kitchen sinks.',
      capabilities: { i2v: true, refs: true, maxRefs: 12, maxDurationSec: 30, audio: true, photorealRefs: true },
    },
    {
      key: 'flux-3', kind: 'video', provider: 'bfl',
      providerModelId: 'flux-3-video', label: 'FLUX 3',
      notes: 'BFL FLUX 3 (direct API, BFL_API_KEY): the LONG-TAKE engine — up to 20s at FHD/24fps in ONE generation, with NATIVE synchronized audio (multilingual dialogue + lipsync: quote the line and the character says it; effects + ambience ride along). Multi-scene cuts hold in a single generation. Exceptional stylistic range: retro, camcorder, VHS, animation, motion design — first pick for period/analog looks. TIMESTAMPED KEYFRAMES: pinned stills become exact frames ([seconds, image] pairs, up to 10) — choreograph a shot through compositions. v2v CONTINUATION extends an existing clip from its final frames. DRAFT DOCTRINE: draft:true costs ~1/3 — explore variants in draft, then ENHANCE the keeper (same generation reproduced full-quality, never a re-roll). CAUTION: keyframes are FRAMES OF THE CLIP, not identity references — never feed cast portraits as keyframes (no Omni Reference yet). ~$0.17/s hd, $0.29/s fhd; drafts $0.06/s.',
      capabilities: { i2v: true, refs: false, maxDurationSec: 20, audio: true, photorealRefs: true },
    },
    {
      key: 'minimax-h3', kind: 'video', provider: 'atlascloud',
      providerModelId: atlasId('minimax-h3', 'minimax/h3'), label: 'MiniMax H3',
      notes: 'MiniMax H3 via AtlasCloud: ≤15s clips, T2V + I2V + reference-to-video with MIXED-MEDIA `refers` (≤9 images + ≤3 videos + ≤3 audio per the live Atlas spec, 2026-08-05) — the PHOTOREAL sequence engine, and the consistency-extension engine (a previous take rides as a reference video: [video continuation]). H3 has a NATIVE prompt grammar (typed <Subject/Picture/Video/Audio N> labels, six-section full-reference format, (Sx)+<d> dialogue) — composed automatically by composeH3SequencePrompt; authored prompts should follow docs/H3_PROMPTING_GUIDE.md. Never send it the @Image scheme (that is Seedance\'s dialect).',
      // audio: TRUE — live-verified 2026-08-05 (a generated take carried a
      // full soundscape incl. the V.O.); the native grammar's soundscape/
      // music sections drive it. The audio:false release note was wrong.
      capabilities: { i2v: true, refs: true, maxRefs: 9, maxDurationSec: 15, audio: true, photorealRefs: true },
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
    case 'bfl': return process.env.BFL_API_KEY ? 'live' : 'down';
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
