"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Send,
  ChevronLeft,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  X,
  Image as ImageIcon,
  RefreshCw,
  BookOpen,
  FileText,
  Users,
  MapPin,
  Package,
  Loader2,
  MessageSquare,
  Wand2,
  Film,
  ArrowRight,
  Eye,
  Layers,
  Minimize2,
  Maximize2,
  Check,
  Plus,
  Link2,
  Award,
  ChevronUp,
  Loader,
  Settings,
  Wrench,
  PenLine,
  LayoutGrid,
  GitBranch,
  GitCommit,
  AlertTriangle,
  ArrowUpDown,
  Camera,
  Copy,
  Trash2,
  GripVertical,
  Zap,
  Search,
  Upload,
  Tag,
  Pin,
  Download,
  Play,
  Pause,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  demoEntities,
  demoScenes,
  demoRelationships,
  getEntityRelationships,
  getEntityScenes,
  getEntityById,
  type DemoEntity,
  type DemoScene,
  type DemoRelationship,
} from "@/lib/demo-data";
import { StorySwitcher } from "@/components/studio/StorySwitcher";
import { DocumentsPanel } from "@/components/studio/DocumentsPanel";
import { useLightbox } from "@/components/studio/ImageLightbox";
import { MarkdownMessage } from "@/components/studio/MarkdownMessage";
import { CameraAngleControl } from "@/components/studio/CameraAngleControl";
import { ImageEditControl } from "@/components/studio/ImageEditControl";
import ReferencePickerModal, { type ReferenceSelection } from "@/components/studio/ReferencePickerModal";

// =============================================================================
// TYPES
// =============================================================================

interface CameraAngleTarget {
  type: "scene" | "frame" | "entity";
  sceneId?: string;
  frameId?: string;
  entityId?: string;
  imageUrl: string;
  label: string;
  // Scene data for full re-generation with character/location references
  participantIds?: string[];
  locationId?: string;
  prose?: string;
  frames?: any[];
  title?: string;
}

interface ImageGalleryEntry {
  id: string;
  url: string;
  label: string;
  prompt?: string;
  mood?: string;
  createdAt?: string;
}

interface Entity extends DemoEntity {
  portraitVariations?: string[];
  imageGallery?: ImageGalleryEntry[];
}

interface Artifact {
  id: string;
  title: string;
  format: string;            // free-form: 'magazine_cover', 'article', 'memo', 'social_post', 'transcript', 'product_page', 'video_script', 'audio_script', 'broadcast', 'document', 'website', 'other', ...
  description?: string;
  inWorldDate?: string;
  publication?: string;
  byline?: string;
  relatedEntityIds: string[];
  relatedSceneIds?: string[];
  primaryImage?: { url: string; mimeType?: string; generatedAt?: string; prompt?: string };
  assets?: Array<{ url: string; mimeType?: string; caption?: string }>;
  content: Record<string, any>;
  status: 'draft' | 'published';
  createdAt: string;
  updatedAt: string;
  extensions?: Record<string, any>;
}

interface SceneFrame {
  id: string;
  position: number;
  title?: string;
  description: string;
  visual_beat?: string;
  participantIds?: string[];
  participantRefs?: Array<{
    entityId?: string;
    name: string;
    action?: string;
    pose?: string;
    expression?: string;
    placement?: string;
    notes?: string;
  }>;
  locationId?: string;
  dialogue?: string[];
  caption?: string;
  sfx?: string[];
  imageUrl?: string;
  shotType?: string;
  camera?: string;
  mood?: string;
  visual_direction?: {
    action: string;
    composition: string;
    lighting: string;
    atmosphere: string;
    environment?: string;
  };
  appearance_notes?: Array<{
    name: string;
    details: string;
  }>;
  visualDirty?: boolean;
  visualDirtyReason?: string;
  visualDirtyAt?: string;
  generationRefs?: string[];
  /** The canonical image prompt for this frame — the user-facing source of
   *  truth for image generation. The agent populates it; the user edits it
   *  freely. "Render image" sends this verbatim (plus the project style
   *  directive and refs). Distinct from lastImagePrompt (what was actually
   *  sent last time) and visual_direction (structured metadata that informs
   *  but does not override the canonical prompt). */
  imagePrompt?: string;
  /** What was actually sent to the model on the last render (returned by /render
   *  as actualPromptSent). Includes the style directive + refs description. */
  lastImagePrompt?: string;
  lastImageAt?: string;
  lastImageBackend?: string;
  lastImageStyleDirectiveApplied?: boolean;
  lastImageReferencesAttached?: Array<{ description: string; type: string }>;
  /** When extracted from a storyboard panel, anchor info. */
  sourceStoryboardId?: string;
  sourceStoryboardPanelIndex?: number;
  sourceStoryboardImageUrl?: string;
  /** Default duration in seconds when this shot is placed on a timeline.
   *  AI-video models target 5–15s per shot; default 5. Per-clip timeline
   *  overrides exist on TimelineItem.durationSec for stretching/compressing
   *  without mutating the source. */
  durationSec?: number;
  /** Alternate takes for the same shot — generated through "Generate
   *  variant" or the saveAsVariant flag on /visual/frame. Click one in the
   *  clip inspector to promote it to the primary imageUrl. */
  variants?: Array<{ id: string; url: string; prompt?: string; label?: string; generatedAt: string }>;
  /** First/last keyframes for image-to-video interpolation. The shot's motion
   *  is expressed as a start state (firstFrame) and an end state (lastFrame)
   *  that a video model interpolates between. Generated via generate_shot_keyframes,
   *  separate from the shot's main `imageUrl` still. */
  firstFrame?: { url: string; prompt?: string; generatedAt?: string; backend?: string };
  lastFrame?: { url: string; prompt?: string; generatedAt?: string; backend?: string };
}

interface StoryContinuityIssue {
  id: string;
  sceneId: string;
  sceneTitle: string;
  position: number;
  severity: "warning" | "error";
  code: string;
  message: string;
  entityIds: string[];
}

interface SceneStoryDiff {
  baseSceneId?: string;
  position: number;
  participantIds: string[];
  locationId?: string;
  entityAdds: string[];
  entityRemoves: string[];
  firstAppearances: string[];
  locationChange?: { from?: string; to?: string };
  eventBeats: string[];
  mutationCount: number;
  issueCount: number;
  continuityIssues: StoryContinuityIssue[];
}

interface StoryReorderOrderEntry {
  sceneId: string;
  sceneTitle: string;
  position: number;
}

interface StoryReorderAffectedScene {
  sceneId: string;
  sceneTitle: string;
  fromPosition: number;
  toPosition: number;
  direction: "earlier" | "later";
}

interface StoryReorderIssue extends StoryContinuityIssue {
  isNew: boolean;
  suggestedFix: string;
}

interface StoryReorderPreviewResponse {
  success: boolean;
  currentBranch: string;
  oldOrder: StoryReorderOrderEntry[];
  newOrder: StoryReorderOrderEntry[];
  affectedScenes: StoryReorderAffectedScene[];
  issues: StoryReorderIssue[];
  suggestedFixes: string[];
  safeOnCurrentBranch: boolean;
  continuity: {
    before: {
      errors: number;
      warnings: number;
      isConsistent: boolean;
    };
    after: {
      errors: number;
      warnings: number;
      isConsistent: boolean;
    };
    introduced: {
      errors: number;
      warnings: number;
      total: number;
    };
    resolved: {
      errors: number;
      warnings: number;
      total: number;
    };
  };
}

interface SceneReferenceDiagnosticEntry {
  entityId: string;
  name: string;
  type: string;
  referenceType?: "character" | "object";
  resolved: boolean;
  includedInRequest?: boolean;
  droppedReason?: string;
  priorityScore?: number;
  source?: string;
  url?: string;
}

interface SceneSubmittedReferences {
  characterIds?: string[];
  objectIds?: string[];
  locationIds?: string[];
  previousShotIds?: string[];
  budgets?: {
    characters: number;
    objects: number;
  };
  counts?: {
    characters: number;
    objects: number;
    locations: number;
    previousShots: number;
    total: number;
  };
}

interface SceneActualReferencesUsed {
  refs?: Array<{
    order?: number;
    id: string;
    type: string;
    description: string;
  }>;
  counts?: {
    character?: number;
    object?: number;
    location?: number;
    previous_shot?: number;
    style?: number;
    unknown?: number;
  };
}

interface SceneGenerationReferenceDiagnostics {
  participants?: SceneReferenceDiagnosticEntry[];
  location?: {
    entityId: string;
    name: string;
    resolved: boolean;
    source?: string;
    url?: string;
  } | null;
}

interface SceneGenerationDiagnostics {
  sceneId: string;
  generatedAt: number;
  referenceCount: number;
  model?: string;
  outputIntent?: StudioVisualOutputIntent;
  textPolicy?: StudioVisualTextPolicy;
  textPolicyLocked?: boolean;
  identityRepair?: {
    requested?: boolean;
    requestedPasses?: number;
    appliedPasses?: number;
    failed?: boolean;
    error?: string;
  };
  unresolvedParticipantNames: string[];
  locationResolved: boolean | null;
  locationName?: string;
  diagnostics?: SceneGenerationReferenceDiagnostics;
  submittedReferences?: SceneSubmittedReferences;
  actualReferencesUsed?: SceneActualReferencesUsed;
  promptStrategyVersion?: string;
  promptPreview?: string;
  promptLength?: number;
}

interface SceneBranchSummary {
  id: string;
  name: string;
  description?: string;
  isActive?: boolean;
  isCurrent?: boolean;
  isCanon?: boolean;
  parentBranch?: string;
  branchType?: string;
  branchPointSceneId?: string;
  branchPointSceneTitle?: string;
  branchPointPosition?: number;
  createdAt?: string;
}

interface Scene extends DemoScene {
  frames?: SceneFrame[];
  stateChanges?: string[];
  storyDiff?: SceneStoryDiff;
  visualDirty?: boolean;
  visualDirtyReason?: string;
  visualDirtyAt?: string;
  visualDirtyEntityNames?: string[];
  frameImagesDirty?: boolean;
  frameVisualDirtyCount?: number;
  /** Parent act ID — stage 2 pipeline restructure. Scenes without actId
   *  render in the "Unassigned" bucket in the Storyboard view. */
  actId?: string | null;
}

/** Acts — top-level story arcs that group scenes. Source of truth lives on
 *  the server; UI state mirrors via fetch + refresh after mutations. */
interface ProjectAct {
  id: string;
  title: string;
  arc?: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Timeline track — horizontal row of clips. Stage 3 pipeline restructure. */
interface ProjectTimelineTrack {
  id: string;
  name: string;
  kind: "video" | "audio" | "caption" | "note";
  order: number;
  muted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Timeline clip — references a shot, placed on a track. */
interface ProjectTimelineItem {
  id: string;
  trackId: string;
  sourceType: "shot";
  sourceSceneId: string;
  sourceShotId: string;
  order: number;
  durationSec: number;
  label?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ProjectTimeline {
  tracks: ProjectTimelineTrack[];
  items: ProjectTimelineItem[];
  playbackRate?: number;
  updatedAt?: number;
}

type CarouselItem =
  | { kind: 'scene'; id: string; scene: Scene }
  | { kind: 'frame'; id: string; scene: Scene; frame: SceneFrame; frameIndex: number; totalFrames: number };

interface Relationship extends DemoRelationship {
  direction: "outgoing" | "incoming";
}

interface EntityDetail {
  entity: Entity;
  relationships: Relationship[];
  scenes: Scene[];
  relatedEntities: Entity[];
  narrativeArc?: {
    entityId: string;
    entityName: string;
    firstSceneId?: string;
    latestSceneId?: string;
    entries: Array<{
      sceneId: string;
      sceneTitle: string;
      position: number;
      role: "introduced" | "enters" | "present" | "exits";
      locationId?: string;
      events: string[];
      changes: string[];
    }>;
  };
  arcIssues?: StoryContinuityIssue[];
}

// Tool usage step from agentic run
interface ToolStep {
  type: "tool_call" | "tool_result" | "text";
  timestamp: number;
  tool?: string;
  args?: Record<string, any>;
  result?: any;
  error?: string;
  text?: string;
}

interface ToolUsage {
  totalCalls: number;
  steps: ToolStep[];
}

interface Message {
  id: string;
  messageId?: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  proposals?: EntityProposal[];
  toolUsage?: ToolUsage | null;
  /** True while the assistant message is being streamed (SSE in progress).
   *  Used to auto-expand the toolUsage block and show pending tool indicators. */
  isStreaming?: boolean;
}

// Entity proposals from the API
interface EntityProposal {
  id: string;
  type: "add_entity" | "update_entity" | "add_relationship" | "add_scene" | "update_scene" | "entity" | "relationship"; // Support both old and new formats
  entity?: {
    id?: string;
    name: string;
    type: string;
    description?: string;
    traits?: string[];
    backstory?: string;
    motivations?: string[];
    secrets?: string[];
  };
  existingEntity?: {
    id?: string;
    name: string;
    type: string;
    description?: string;
    traits?: string[];
    backstory?: string;
    motivations?: string[];
    secrets?: string[];
    referenceImage?: string;
    imageUrl?: string;
  };
  relationship?: {
    sourceName: string;
    targetName: string;
    type: string;
    description?: string;
  };
    scene?: {
      id: string;
      title: string;
      prose: string;
      summary?: string;
      participantIds?: string[];
      locationId?: string;
      events?: string[];
      stateChanges?: string[];
      status?: string;
      frames?: SceneFrame[];
      storyDiff?: SceneStoryDiff;
    };
  status: "pending" | "accepted" | "rejected";
}

type StudioVisualOutputIntent = "cinematic-still" | "comic-panel" | "video-keyframe";
type StudioVisualTextPolicy = "no-text" | "diegetic-only" | "allow-baked";

const STUDIO_OUTPUT_INTENT_OPTIONS: Array<{
  id: StudioVisualOutputIntent;
  name: string;
  description: string;
}> = [
  {
    id: "cinematic-still",
    name: "Cinematic Still",
    description: "Single film-style frame for storyboards and key art.",
  },
  {
    id: "comic-panel",
    name: "Comic Panel",
    description: "Single comic panel look. Pair with comic visual presets.",
  },
  {
    id: "video-keyframe",
    name: "Video Keyframe",
    description: "Clean keyframe optimized for downstream generative video.",
  },
];

const STUDIO_TEXT_POLICY_OPTIONS: Array<{
  id: StudioVisualTextPolicy;
  name: string;
  description: string;
}> = [
  {
    id: "no-text",
    name: "No Text",
    description: "No subtitles, labels, logos, captions, or bubbles.",
  },
  {
    id: "diegetic-only",
    name: "Diegetic Only",
    description: "Only text physically present in-scene when explicitly requested.",
  },
  {
    id: "allow-baked",
    name: "Allow Baked Text",
    description: "Allow rendered text only when explicitly requested.",
  },
];

const normalizeStudioOutputIntent = (value: unknown): StudioVisualOutputIntent => {
  if (value === "comic-panel" || value === "video-keyframe" || value === "cinematic-still") {
    return value;
  }
  return "cinematic-still";
};

const normalizeStudioTextPolicy = (value: unknown): StudioVisualTextPolicy => {
  if (value === "diegetic-only" || value === "allow-baked" || value === "no-text") {
    return value;
  }
  return "no-text";
};

const isTextPolicyLockedForOutputIntent = (intent: StudioVisualOutputIntent): boolean =>
  intent === "cinematic-still" || intent === "video-keyframe";

const resolveStudioTextPolicy = (
  intent: StudioVisualOutputIntent,
  requestedPolicy: unknown
): { policy: StudioVisualTextPolicy; locked: boolean } => {
  if (isTextPolicyLockedForOutputIntent(intent)) {
    return { policy: "no-text", locked: true };
  }
  return { policy: normalizeStudioTextPolicy(requestedPolicy), locked: false };
};

// Studio settings for customizing writing and visual style
interface StudioSettings {
  writingStylePrompt: string;
  visualStylePrompt: string;
  narrativePresetId?: string;
  visualPresetId?: string;
  outputIntent: StudioVisualOutputIntent;
  textPolicy: StudioVisualTextPolicy;
  // Project-level aspect ratio default — used by every image gen path.
  aspectRatio: string;
  // Project-level image model default. Values: "nano-banana" (NB2 [default]),
  // "nano-banana-pro", "nano-banana-legacy", "gpt-image".
  imageModel: string;
  // Legacy single-preset field; kept for backward compatibility with localStorage.
  stylePresetId?: string;
}

const DEFAULT_SETTINGS: StudioSettings = {
  writingStylePrompt: "",
  visualStylePrompt: "",
  narrativePresetId: "",
  visualPresetId: "",
  outputIntent: "cinematic-still",
  textPolicy: "no-text",
  aspectRatio: "16:9",
  imageModel: "nano-banana",
  stylePresetId: "",
};

// Image model presets shown in the Style phase picker.
const IMAGE_MODEL_PRESETS: Array<{ value: string; label: string; useCase: string; backend: "gemini" | "openai" }> = [
  { value: "nano-banana", label: "Nano Banana 2", useCase: "Best all-around — fast, 14 refs, 4K, recommended default", backend: "gemini" },
  { value: "nano-banana-pro", label: "Nano Banana Pro", useCase: "Pro asset production — sharpest text rendering, thinking mode", backend: "gemini" },
  { value: "nano-banana-legacy", label: "Nano Banana (legacy)", useCase: "Original fast model — 3 refs max, 1K output", backend: "gemini" },
  { value: "gpt-image", label: "GPT Image", useCase: "OpenAI gpt-image-2 — strongest for multi-panel storyboards + text-in-image", backend: "openai" },
];

interface ProjectStyleProfile {
  presetId?: string;
  presetName?: string;
  narrativePresetId?: string;
  narrativePresetName?: string;
  visualPresetId?: string;
  visualPresetName?: string;
  narrativePrompt?: string;
  visualPrompt?: string;
  styleAssetIds?: string[];
  /** Default aspect ratio for all renders in this project. 16:9 by default,
   *  9:16 for microdramas, 21:9 cinemascope, 1:1 square feed, etc. */
  aspectRatio?: string;
  /** Default image model key — "nano-banana" / "nano-banana-pro" /
   *  "nano-banana-legacy" / "gpt-image". */
  imageModel?: string;
  updatedAt?: number;
}

// Aspect-ratio presets shown in the Style phase picker. Each has a label
// + use case so the writer can pick the right framing for their format.
const ASPECT_RATIO_PRESETS: Array<{ value: string; label: string; useCase: string }> = [
  { value: "16:9", label: "16:9", useCase: "Cinematic widescreen — film, TV, YouTube" },
  { value: "9:16", label: "9:16", useCase: "Microdrama — TikTok, Reels, vertical mobile" },
  { value: "1:1", label: "1:1", useCase: "Square feed — Instagram, square posters" },
  { value: "21:9", label: "21:9", useCase: "Cinemascope ultra-wide — epic letterbox" },
  { value: "4:5", label: "4:5", useCase: "Portrait feed — Instagram portrait" },
  { value: "4:3", label: "4:3", useCase: "Classic TV / vintage" },
  { value: "3:4", label: "3:4", useCase: "Book cover / vertical portrait" },
  { value: "2:3", label: "2:3", useCase: "Movie poster" },
  { value: "3:2", label: "3:2", useCase: "DSLR landscape" },
];

interface StylePreset {
  id: string;
  name: string;
  description: string;
  writing: string;
  visual: string;
}

const STYLE_PRESETS: StylePreset[] = [
  {
    id: "cinematic-concept",
    name: "Cinematic Concept",
    description: "Grounded cinematic storytelling with concept-art visual language.",
    writing: "Write grounded cinematic prose with sensory detail, clear emotional beats, and concrete cause/effect transitions.",
    visual: "Concept art aesthetic, natural lighting, grounded anatomy, expressive faces, and environmental storytelling.",
  },
  {
    id: "film-noir-mystery",
    name: "Film Noir Mystery",
    description: "Tense mystery with hard-edged dialogue and shadow-driven composition.",
    writing: "Write in taut noir style with subtext-heavy dialogue, moral ambiguity, and precise atmosphere.",
    visual: "High-contrast noir lighting, deep shadows, practical city lights, restrained palette, and realistic textures.",
  },
  {
    id: "romcom-ultrareal",
    name: "RomCom Ultrareal",
    description: "Warm character-driven scenes with contemporary ultrareal visuals.",
    writing: "Write playful, emotionally transparent romantic-comedy prose with strong character voice and timing.",
    visual: "Ultrareal cinematic photography, soft natural highlights, vivid skin tones, and modern production design.",
  },
  {
    id: "seventies-education-film",
    name: "1970s Education Film",
    description: "Instructional retro tone with period-authentic visual language.",
    writing: "Write with 1970s educational film cadence: clear exposition, earnest tone, and practical examples.",
    visual: "1970s educational film look: analog grain, period wardrobe, practical sets, muted color cast, and documentary framing.",
  },
];

interface SingleStylePreset {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

const NARRATIVE_STYLE_PRESETS: SingleStylePreset[] = STYLE_PRESETS.map((preset) => ({
  id: preset.id,
  name: preset.name,
  description: preset.description,
  prompt: preset.writing,
}));

const VISUAL_ONLY_STYLE_PRESETS: SingleStylePreset[] = [
  {
    id: "comic-book-cinematic",
    name: "Comic Book Cinematic",
    description: "Bold inked linework, dynamic framing, and dramatic color blocking.",
    prompt: "Comic book visual style with intentional panel-like composition, bold inking, halftone texture, expressive poses, dramatic rim lighting, and clean stylized anatomy.",
  },
  {
    id: "graphic-novel-noir",
    name: "Graphic Novel Noir",
    description: "Heavy ink shadows, restrained palette, and gritty urban framing.",
    prompt: "Graphic novel noir illustration with high-contrast inks, rough paper grain, controlled desaturated palette, dramatic practical lighting, and expressive realistic anatomy.",
  },
  {
    id: "ligne-claire-adventure",
    name: "Ligne Claire Adventure",
    description: "Clear-line comic style with crisp silhouettes and clean color fields.",
    prompt: "Ligne claire comic style with clean contour lines, minimal hatching, bold readable silhouettes, flat controlled color regions, and adventure-comic camera staging.",
  },
  {
    id: "retro-manga-thriller",
    name: "Retro Manga Thriller",
    description: "Monochrome ink energy with speed lines and dramatic framing.",
    prompt: "Retro manga thriller style with crisp black-and-white ink rendering, controlled screentone texture, dramatic perspective, and dynamic motion emphasis while keeping characters on-model.",
  },
  {
    id: "stylized-cartoon-film",
    name: "Stylized Cartoon Film",
    description: "Painterly animated-film look with readable shapes and expressive faces.",
    prompt: "Stylized cartoon film look with hand-painted texture, simplified but expressive forms, controlled color scripting, and cinematic staging.",
  },
  {
    id: "spider-verse-anime",
    name: "Spider-Verse × Anime",
    description: "Into the Spider-Verse meets cinematic anime — halftones, chromatic aberration, painterly anime faces.",
    prompt: "Stylized anime-animation hybrid in the visual language of Into the Spider-Verse meets cinematic anime: bold ink lines mixed with painterly anime faces, half-tone dot textures, controlled chromatic aberration on highlights, dynamic comic-influenced action lines, saturated jewel-tone color palette with deep magenta / cyan / electric purple, anime-proportioned characters with expressive eyes, painterly hair rendering with hard rim lighting, cinematic motion blur, hand-drawn frame-by-frame energy.",
  },
  {
    id: "kpop-demon-hunter",
    name: "K-Pop Demon Hunter Anime",
    description: "K-Pop Demon Hunters aesthetic — vibrant young-adult anime with style-magazine polish.",
    prompt: "Vibrant young-adult anime in the K-Pop Demon Hunters aesthetic: clean cel-shaded character rendering with sharp painterly highlights, bold saturated palette (hot pink, neon teal, electric purple, deep black), glossy fashion-editorial styling, sleek hair with anime-glossy strands, large expressive anime eyes with star-catchlight reflections, dynamic action poses, cinematic anime lighting with strong rim and back lighting, motion smears for action moments, polished film-quality finish.",
  },
  {
    id: "cinematic-anime",
    name: "Cinematic Anime Film",
    description: "Studio-quality cinematic anime — Makoto Shinkai / Kyoto Animation density and atmosphere.",
    prompt: "Cinematic anime film aesthetic in the tradition of Makoto Shinkai and Kyoto Animation: lush painterly backgrounds with photographic depth and atmospheric perspective, soft cel-shading on characters with painterly skin gradients, golden-hour and twilight lighting palettes, deep environmental detail, anime-proportioned characters with subtle expressive faces, gentle bokeh and lens highlights, hand-painted texture, film-grade color grading.",
  },
];

const VISUAL_STYLE_PRESETS: SingleStylePreset[] = [
  ...STYLE_PRESETS.map((preset) => ({
    id: preset.id,
    name: preset.name,
    description: preset.description,
    prompt: preset.visual,
  })),
  ...VISUAL_ONLY_STYLE_PRESETS,
];

const getNarrativePresetById = (presetId?: string): SingleStylePreset | undefined =>
  NARRATIVE_STYLE_PRESETS.find((preset) => preset.id === presetId);

const getVisualPresetById = (presetId?: string): SingleStylePreset | undefined =>
  VISUAL_STYLE_PRESETS.find((preset) => preset.id === presetId);

const getNarrativePresetName = (presetId?: string): string | undefined =>
  getNarrativePresetById(presetId)?.name;

const getVisualPresetName = (presetId?: string): string | undefined =>
  getVisualPresetById(presetId)?.name;

const buildSettingsFromStyleProfile = (styleProfile?: ProjectStyleProfile): StudioSettings => {
  const legacyPresetId = typeof styleProfile?.presetId === "string" ? styleProfile.presetId : "";
  const narrativePresetId = typeof styleProfile?.narrativePresetId === "string"
    ? styleProfile.narrativePresetId
    : legacyPresetId;
  const visualPresetId = typeof styleProfile?.visualPresetId === "string"
    ? styleProfile.visualPresetId
    : legacyPresetId;

  const narrativePreset = getNarrativePresetById(narrativePresetId);
  const visualPreset = getVisualPresetById(visualPresetId);

  return {
    writingStylePrompt: styleProfile?.narrativePrompt || narrativePreset?.prompt || "",
    visualStylePrompt: styleProfile?.visualPrompt || visualPreset?.prompt || "",
    narrativePresetId: narrativePresetId || "",
    visualPresetId: visualPresetId || "",
    outputIntent: "cinematic-still",
    textPolicy: "no-text",
    aspectRatio: styleProfile?.aspectRatio || "16:9",
    imageModel: styleProfile?.imageModel || "nano-banana",
    stylePresetId: legacyPresetId || "",
  };
};

const mergeSavedStudioSettings = (base: StudioSettings, savedRaw: any): StudioSettings => {
  if (!savedRaw || typeof savedRaw !== "object") return base;

  const legacyPresetId = typeof savedRaw.stylePresetId === "string" ? savedRaw.stylePresetId : "";
  const narrativePresetId = typeof savedRaw.narrativePresetId === "string"
    ? savedRaw.narrativePresetId
    : (legacyPresetId || base.narrativePresetId || "");
  const visualPresetId = typeof savedRaw.visualPresetId === "string"
    ? savedRaw.visualPresetId
    : (legacyPresetId || base.visualPresetId || "");
  const outputIntent = normalizeStudioOutputIntent(savedRaw.outputIntent ?? base.outputIntent);
  const textPolicy = resolveStudioTextPolicy(outputIntent, savedRaw.textPolicy ?? base.textPolicy).policy;

  return {
    writingStylePrompt: typeof savedRaw.writingStylePrompt === "string"
      ? savedRaw.writingStylePrompt
      : base.writingStylePrompt,
    visualStylePrompt: typeof savedRaw.visualStylePrompt === "string"
      ? savedRaw.visualStylePrompt
      : base.visualStylePrompt,
    narrativePresetId,
    visualPresetId,
    outputIntent,
    textPolicy,
    aspectRatio: typeof savedRaw.aspectRatio === "string" ? savedRaw.aspectRatio : base.aspectRatio,
    imageModel: typeof savedRaw.imageModel === "string" ? savedRaw.imageModel : base.imageModel,
    stylePresetId: legacyPresetId || (narrativePresetId && narrativePresetId === visualPresetId ? narrativePresetId : ""),
  };
};

// LLM Commands that can be embedded in responses
// Format: [[COMMAND:param]] or [[COMMAND:param1|param2]]
type LLMCommand =
  | { type: "navigate"; entityId: string }
  | { type: "navigate_scene"; sceneId: string }
  | { type: "pin"; entityId: string }
  | { type: "unpin"; entityId: string }
  | { type: "ask_confirm"; message: string; action: string }
  | { type: "focus_row"; row: "scenes" | "entities" }
  | { type: "generate_frames"; sceneId?: string; count?: number }
  | { type: "generate_scene_image"; sceneId?: string }
  | { type: "generate_frame_image"; sceneId?: string; frameId?: string };

// Parse commands from LLM response text
function parseLLMCommands(text: string): { cleanText: string; commands: LLMCommand[] } {
  const commands: LLMCommand[] = [];
  let cleanText = text;

  // Match [[COMMAND:params]]
  const commandRegex = /\[\[(\w+):([^\]]+)\]\]/g;
  let match;

  while ((match = commandRegex.exec(text)) !== null) {
    const [fullMatch, cmd, params] = match;
    const paramParts = params.split("|");

    switch (cmd.toUpperCase()) {
      case "NAVIGATE":
        commands.push({ type: "navigate", entityId: paramParts[0] });
        break;
      case "NAVIGATE_SCENE":
        commands.push({ type: "navigate_scene", sceneId: paramParts[0] });
        break;
      case "PIN":
        commands.push({ type: "pin", entityId: paramParts[0] });
        break;
      case "UNPIN":
        commands.push({ type: "unpin", entityId: paramParts[0] });
        break;
      case "ASK_CONFIRM":
        commands.push({ type: "ask_confirm", message: paramParts[0], action: paramParts[1] || "" });
        break;
      case "FOCUS_ROW":
        commands.push({ type: "focus_row", row: paramParts[0] as "scenes" | "entities" });
        break;
      case "GENERATE_FRAMES": {
        const first = paramParts[0];
        const second = paramParts[1];
        let sceneId: string | undefined;
        let count: number | undefined;
        if (second !== undefined) {
          sceneId = first;
          const parsed = Number(second);
          count = Number.isFinite(parsed) ? parsed : undefined;
        } else if (/^\d+$/.test(first)) {
          count = Number(first);
        } else {
          sceneId = first;
        }
        commands.push({ type: "generate_frames", sceneId, count });
        break;
      }
      case "GENERATE_SCENE_IMAGE":
      case "REGENERATE_SCENE_IMAGE":
        commands.push({ type: "generate_scene_image", sceneId: paramParts[0] || undefined });
        break;
      case "GENERATE_FRAME_IMAGE":
      case "REGENERATE_FRAME_IMAGE": {
        const first = paramParts[0];
        const second = paramParts[1];
        if (second !== undefined) {
          commands.push({ type: "generate_frame_image", sceneId: first || undefined, frameId: second || undefined });
        } else {
          commands.push({ type: "generate_frame_image", frameId: first || undefined });
        }
        break;
      }
    }

    cleanText = cleanText.replace(fullMatch, "");
  }

  return { cleanText: cleanText.trim(), commands };
}

// Build context for LLM
function buildLLMContext(
  focusedEntity: Entity | null,
  focusedScene: Scene | null,
  pinnedEntities: Entity[],
  allEntities: Entity[],
  allScenes: Scene[],
  activeRow: CarouselRow,
  insertPosition?: { position: number; beforeScene: Scene; afterScene: Scene | null } | null
): string {
  const lines: string[] = [];

  lines.push("=== CURRENT CONTEXT ===");
  lines.push(`Active view: ${activeRow}`);

  if (focusedEntity) {
    lines.push(`\nFocused Entity: ${focusedEntity.name} (${focusedEntity.type})`);
    lines.push(`Description: ${focusedEntity.description || "None"}`);
    if (focusedEntity.traits?.length) lines.push(`Traits: ${focusedEntity.traits.join(", ")}`);
  } else if (focusedScene) {
    lines.push(`\nFocused Scene: ${focusedScene.title}`);
    lines.push(`Status: ${focusedScene.status}`);
    if (focusedScene.participantIds?.length) {
      const participantNames = focusedScene.participantIds
        .map((participantId) => allEntities.find((entity) => entity.id === participantId)?.name || participantId)
        .filter(Boolean);
      if (participantNames.length > 0) {
        lines.push(`Participants: ${participantNames.join(", ")}`);
      }
    }
    lines.push(`Scene image: ${focusedScene.imageUrl ? "generated" : "missing"}`);
    if (focusedScene.frames?.length) {
      const orderedFrames = [...focusedScene.frames].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const generatedFrames = orderedFrames.filter((frame) => Boolean(frame.imageUrl)).length;
      lines.push(`Frames: ${orderedFrames.length} (${generatedFrames} with images)`);
      const previewFrames = orderedFrames.slice(0, 6);
      previewFrames.forEach((frame, frameIndex) => {
        const frameCastIds = frame.participantIds && frame.participantIds.length > 0
          ? frame.participantIds
          : focusedScene.participantIds || [];
        const frameCastNames = frameCastIds
          .map((participantId) => allEntities.find((entity) => entity.id === participantId)?.name || participantId)
          .slice(0, 4);
        lines.push(
          `- Frame ${frameIndex + 1} [${frame.id}] ${frame.title || "Untitled"} | cast: ${frameCastNames.join(", ") || "unspecified"} | shot: ${frame.shotType || "unspecified"} | camera: ${frame.camera || "unspecified"} | image: ${frame.imageUrl ? "generated" : "missing"}`
        );
      });
    }
  } else {
    lines.push("\nNo item currently focused");
  }

  if (pinnedEntities.length > 0) {
    lines.push(`\n=== WORKING MEMORY (${pinnedEntities.length} pinned) ===`);
    pinnedEntities.forEach(e => lines.push(`- ${e.name} (${e.type}) [id: ${e.id}]`));
  }

  if (insertPosition) {
    const afterTitle = insertPosition.beforeScene?.title || "Unknown";
    const beforeTitle = insertPosition.afterScene?.title || "End of storyboard";
    lines.push(`\n=== INSERT REQUEST ===`);
    lines.push(`Insert after: "${afterTitle}"`);
    lines.push(`Insert before: "${beforeTitle}"`);
    lines.push(`Target index: ${insertPosition.position}`);
  }

  lines.push(`\n=== WORLD STATE ===`);
  lines.push(`Entities (${allEntities.length}): ${allEntities.map(e => `${e.name} [${e.id}]`).join(", ")}`);
  lines.push(`Scenes (${allScenes.length}): ${allScenes.map(s => `${s.title} [${s.id}]`).join(", ")}`);

  lines.push(`\n=== AVAILABLE COMMANDS ===`);
  lines.push(`[[NAVIGATE:entity_id]] - Navigate carousel to entity`);
  lines.push(`[[NAVIGATE_SCENE:scene_id]] - Navigate carousel to scene`);
  lines.push(`[[PIN:entity_id]] - Add entity to working memory`);
  lines.push(`[[UNPIN:entity_id]] - Remove entity from working memory`);
  lines.push(`[[FOCUS_ROW:scenes|entities]] - Switch carousel view`);
  lines.push(`[[ASK_CONFIRM:message|action]] - Ask user for confirmation`);
  lines.push(`[[GENERATE_FRAMES:scene_id|count]] - Generate storyboard frames for a scene`);
  lines.push(`[[GENERATE_SCENE_IMAGE:scene_id]] - Generate or re-roll a scene image`);
  lines.push(`[[GENERATE_FRAME_IMAGE:scene_id|frame_id]] - Generate or re-roll a specific frame image`);

  return lines.join("\n");
}

type CarouselRow = "scenes" | "entities" | "assets" | "pre-pro" | "storyboard" | "script" | "screenplay";

interface StoryboardArtifact {
  id: string;
  title: string;
  format: "storyboard_page";
  description?: string;
  primaryImage?: { url: string; mimeType?: string; generatedAt?: string; prompt?: string };
  content?: { scriptChunk?: string; panelCount?: number; rows?: number; cols?: number; backend?: string; sceneId?: string };
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ProjectAsset {
  id: string;
  category: "character" | "scene" | "location" | "object" | "style" | "reference" | "other";
  name: string;
  description?: string;
  tags?: string[];
  url: string;
  mimeType: string;
  originalFilename: string;
  fileSize: number;
  width?: number;
  height?: number;
  uploadedAt: number;
  linkedEntityIds?: string[];
  linkedSceneIds?: string[];
}

interface GeneratedAssetRecord {
  id: string;
  url: string;
  category: ProjectAsset["category"];
  name: string;
  source: "entity" | "scene" | "frame" | "artifact";
  sourceId: string;
  sourceParentId?: string;
  sourceLabel?: string;
  sourceKind: string;
  uploadedAt: number;
}

// =============================================================================
// CONFIG
// =============================================================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3088";

const resolveImageUrl = (url: string | null | undefined): string | undefined => {
  if (!url) return undefined;
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return `${API_BASE}${url}`;
};

const normalizePortraitVariationUrls = (value: any): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const normalizeImageGallery = (value: any): ImageGalleryEntry[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry: any): ImageGalleryEntry | null => {
      if (!entry || typeof entry !== 'object') return null;
      const url = resolveImageUrl(entry.url);
      if (!url) return null;
      return {
        id: String(entry.id || `img_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`),
        url,
        label: String(entry.label || 'Untitled'),
        prompt: entry.prompt ? String(entry.prompt) : undefined,
        mood: entry.mood ? String(entry.mood) : undefined,
        createdAt: entry.createdAt ? String(entry.createdAt) : undefined,
      };
    })
    .filter((e): e is ImageGalleryEntry => e !== null);
};

const mapEntityFromApi = (entity: any): Entity => ({
  id: entity.id,
  name: entity.name,
  type: entity.type || "character",
  description: entity.description || "",
  backstory: entity.backstory,
  traits: entity.traits || [],
  status: entity.status || "draft",
  referenceImage: resolveImageUrl(entity.referenceImage || entity.imageUrl),
  portraitVariations: normalizePortraitVariationUrls(entity.portraitVariations),
  imageGallery: normalizeImageGallery(entity.imageGallery),
});

const mapEntitiesFromApi = (entitiesData: any[]): Entity[] => {
  return entitiesData.map((entity: any) => mapEntityFromApi(entity));
};

const mapScenesFromApi = (interactionsData: any[]): Scene[] => {
  const mapped = interactionsData.map((i: any, idx: number) => {
    const participantIdsRaw = i.participantIds || i.participants || [];
    const participantIds = participantIdsRaw
      .map((p: any) => (typeof p === "string" ? p : p?.id))
      .filter(Boolean);

    const frames: SceneFrame[] = (i.frames || []).map((frame: any, frameIdx: number) => ({
      id: frame.id,
      position: frame.position ?? frameIdx,
      title: frame.title,
      description: frame.description,
      visual_beat: frame.visual_beat || frame.visualBeat,
      participantIds: frame.participantIds || [],
      participantRefs: frame.participantRefs || [],
      locationId: frame.locationId,
      dialogue: frame.dialogue,
      caption: frame.caption,
      sfx: frame.sfx,
      imageUrl: resolveImageUrl(frame.imageUrl),
      shotType: frame.shotType,
      camera: frame.camera,
      mood: frame.mood,
      visual_direction: frame.visual_direction || undefined,
      appearance_notes: frame.appearance_notes || undefined,
      visualDirty: Boolean(frame.visualDirty),
      visualDirtyReason: frame.visualDirtyReason,
      visualDirtyAt: frame.visualDirtyAt,
      imagePrompt: frame.imagePrompt,
      lastImagePrompt: frame.lastImagePrompt,
      lastImageAt: frame.lastImageAt,
      lastImageBackend: frame.lastImageBackend,
      lastImageStyleDirectiveApplied: frame.lastImageStyleDirectiveApplied,
      lastImageReferencesAttached: frame.lastImageReferencesAttached,
      sourceStoryboardId: frame.sourceStoryboardId,
      sourceStoryboardPanelIndex: frame.sourceStoryboardPanelIndex,
      sourceStoryboardImageUrl: resolveImageUrl(frame.sourceStoryboardImageUrl) || frame.sourceStoryboardImageUrl,
      durationSec: typeof frame.durationSec === "number" ? frame.durationSec : undefined,
      variants: Array.isArray(frame.variants) ? frame.variants.map((v: any) => ({
        id: v.id,
        url: resolveImageUrl(v.url) || v.url,
        prompt: v.prompt,
        label: v.label,
        generatedAt: v.generatedAt,
      })) : undefined,
      // First/last keyframes (image-to-video endpoints). Without mapping these
      // through, the workbench + timeline keyframe strips never get the data.
      firstFrame: frame.firstFrame ? {
        url: resolveImageUrl(frame.firstFrame.url) || frame.firstFrame.url,
        prompt: frame.firstFrame.prompt,
        generatedAt: frame.firstFrame.generatedAt,
        backend: frame.firstFrame.backend,
      } : undefined,
      lastFrame: frame.lastFrame ? {
        url: resolveImageUrl(frame.lastFrame.url) || frame.lastFrame.url,
        prompt: frame.lastFrame.prompt,
        generatedAt: frame.lastFrame.generatedAt,
        backend: frame.lastFrame.backend,
      } : undefined,
    }));

    return {
      id: i.id,
      title: i.title || i.summary?.slice(0, 50) || "Untitled Scene",
      prose: i.prose || i.content || i.summary || "",
      status: i.status || "draft",
      participantIds,
      locationId: i.locationId || i.location,
      events: i.events || [],
      stateChanges: i.stateChanges || [],
      imageUrl: resolveImageUrl(i.imageUrl),
      position: i.position ?? idx,
      storyDiff: i.storyDiff,
      frames: frames.length > 0 ? frames.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) : undefined,
      visualDirty: Boolean(i.visualDirty),
      visualDirtyReason: i.visualDirtyReason,
      visualDirtyAt: i.visualDirtyAt,
      visualDirtyEntityNames: Array.isArray(i.visualDirtyEntityNames) ? i.visualDirtyEntityNames : [],
      frameImagesDirty: Boolean(i.frameImagesDirty),
      frameVisualDirtyCount: typeof i.frameVisualDirtyCount === "number" ? i.frameVisualDirtyCount : 0,
      actId: i.actId ?? null,
    };
  });

  return mapped.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
};

const toSceneBranchSlug = (value: string): string => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
};

const defaultSceneBranchName = (scene: Scene): string => {
  const sceneLabel = scene.title || "scene";
  const slug = toSceneBranchSlug(sceneLabel) || "scene";
  return `${slug}-branch`;
};

const entityTypeConfig: Record<string, { icon: any; color: string; ringColor: string; bgColor: string }> = {
  character: { icon: Users, color: "text-amber-400", ringColor: "ring-amber-500/50", bgColor: "bg-amber-500/20" },
  location: { icon: MapPin, color: "text-purple-400", ringColor: "ring-purple-500/50", bgColor: "bg-purple-500/20" },
  object: { icon: Package, color: "text-cyan-400", ringColor: "ring-cyan-500/50", bgColor: "bg-cyan-500/20" },
  creature: { icon: Sparkles, color: "text-rose-400", ringColor: "ring-rose-500/50", bgColor: "bg-rose-500/20" },
  concept: { icon: BookOpen, color: "text-blue-400", ringColor: "ring-blue-500/50", bgColor: "bg-blue-500/20" },
  faction: { icon: Users, color: "text-emerald-400", ringColor: "ring-emerald-500/50", bgColor: "bg-emerald-500/20" },
  event: { icon: Zap, color: "text-orange-400", ringColor: "ring-orange-500/50", bgColor: "bg-orange-500/20" },
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function NarrativeStudio() {
  // Real data from API (or fallback to demo)
  const [entities, setEntities] = useState<Entity[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);

  // User-uploaded assets + a virtual rollup of generated images from
  // entities/scenes/frames/artifacts. The Assets view toggles between them.
  const [assetsList, setAssetsList] = useState<ProjectAsset[]>([]);
  const [generatedAssetsList, setGeneratedAssetsList] = useState<GeneratedAssetRecord[]>([]);
  const [assetTab, setAssetTab] = useState<"uploaded" | "generated">("uploaded");
  const [assetCategoryFilter, setAssetCategoryFilter] = useState<"" | ProjectAsset["category"]>("");
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [isUploadingAssets, setIsUploadingAssets] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<ProjectAsset["category"]>("reference");
  const [selectedAsset, setSelectedAsset] = useState<ProjectAsset | null>(null);
  const [selectedGeneratedAsset, setSelectedGeneratedAsset] = useState<GeneratedAssetRecord | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const assetFileInputRef = useRef<HTMLInputElement | null>(null);
  const [pinnedStyleAssetIds, setPinnedStyleAssetIds] = useState<string[]>([]);

  // Test render bench (Pre-Production view). Standardized prompts that render
  // 4 diagnostic looks side-by-side so the user can see if the style is locked
  // and consistent across portrait/scene/close-up/action.
  const [testRenderResults, setTestRenderResults] = useState<Record<string, {
    url: string;
    backend?: string;
    error?: string;
    referencesUsed?: number;
    styleDirectiveApplied?: boolean;
    referencesAttached?: Array<{ description: string; type: string }>;
    actualPromptSent?: string;
  } | null>>({});
  const [isRunningTestRenders, setIsRunningTestRenders] = useState(false);

  // Script document state — the writing surface (Phase 2). Data model
  // matches ProjectScript on the server. Each stage editor reads from /
  // writes to this slice.
  const [scriptDoc, setScriptDoc] = useState<{
    logline?: string;
    characterSummaries?: Array<{ id: string; name: string; summary: string; linkedEntityId?: string; updatedAt?: number }>;
    synopsis?: string;
    actSummaries?: { act1?: string; act2a?: string; act2b?: string; act3?: string };
    actBreakdowns?: { act1?: string[]; act2a?: string[]; act2b?: string[]; act3?: string[] };
    characterList?: Array<{ id: string; name: string; description?: string; arc?: string; motivations?: string; linkedEntityId?: string; updatedAt?: number }>;
    beatSheet?: Array<{ id: string; label: string; position?: number; description?: string }>;
    theme?: string;
    sceneList?: Array<{ id: string; number?: number; pitch: string; linkedSceneId?: string; lastResyncedAt?: number }>;
    write?: string;
    updatedAt?: number;
  }>({});

  // Storyboard state — script chunk being storyboarded, list of generated
  // storyboard pages, the currently focused one, in-flight generation flag
  const [storyboards, setStoryboards] = useState<StoryboardArtifact[]>([]);
  const [storyboardScript, setStoryboardScript] = useState<string>("");
  const [storyboardPanelCount, setStoryboardPanelCount] = useState<number>(12);
  const [storyboardTitle, setStoryboardTitle] = useState<string>("");
  const [storyboardModel, setStoryboardModel] = useState<"nano-banana" | "gpt-image">("gpt-image");
  const [isGeneratingStoryboard, setIsGeneratingStoryboard] = useState(false);
  const [selectedStoryboard, setSelectedStoryboard] = useState<StoryboardArtifact | null>(null);

  // Acts — top-level story arcs that group scenes. Stage 2 of the pipeline
  // restructure. Server is source of truth; we refetch after CRUD.
  const [acts, setActs] = useState<ProjectAct[]>([]);

  // Timeline — the Production phase's editing surface. Stage 3 of the
  // pipeline restructure. Single project-level timeline with tracks of
  // clips; clips reference shots by id.
  const [timeline, setTimeline] = useState<ProjectTimeline>({ tracks: [], items: [] });
  // Undo/redo history — snapshot of timeline JSON after every successful
  // mutation. `historyIndex` points at the "current" snapshot. Undo moves
  // to historyIndex-1; redo moves to historyIndex+1. New mutations after
  // an undo truncate the redo tail. Reset on project switch.
  const timelineHistoryRef = useRef<ProjectTimeline[]>([]);
  const timelineHistoryIndexRef = useRef<number>(-1);
  // Marker used to suppress history pushes when refetchTimeline runs as
  // part of undo/redo (we already know the snapshot; we don't want to
  // re-record it as a new "current").
  const skipNextHistoryPushRef = useRef<boolean>(false);
  // UI rerender trigger when history changes — refs alone don't notify React.
  const [timelineHistoryTick, setTimelineHistoryTick] = useState(0);
  const TIMELINE_HISTORY_MAX = 50;
  const [relationships, setRelationships] = useState<DemoRelationship[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [worldName, setWorldName] = useState("Your World");

  const [messages, setMessages] = useState<Message[]>([]);
  const [expandedToolUsage, setExpandedToolUsage] = useState<Set<string>>(new Set());
  const { openLightbox } = useLightbox();
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(new Set());

  // Git/commit state
  const [sessionStatus, setSessionStatus] = useState<{
    uncommittedChanges: boolean;
    currentBranch: string;
    storyConsistency?: {
      errors: number;
      warnings: number;
      isConsistent: boolean;
    };
    pendingChanges: {
      addedEntities: { id: string; name: string; type: string }[];
      modifiedEntities: { id: string; name: string; type: string }[];
      addedRelationships: { id: string; sourceName: string; targetName: string; type: string }[];
      addedScenes: { id: string; title: string }[];
      modifiedScenes?: { id: string; title: string }[];
      summary: { entitiesAdded: number; entitiesModified: number; relationshipsAdded: number; scenesAdded: number; scenesModified?: number; total: number };
    };
  } | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [showCommitInput, setShowCommitInput] = useState(false);
  const [isCommitPreviewOpen, setIsCommitPreviewOpen] = useState(false);
  const [isLoadingCommitPreview, setIsLoadingCommitPreview] = useState(false);
  const [commitPreview, setCommitPreview] = useState<any | null>(null);
  const [sceneBranches, setSceneBranches] = useState<SceneBranchSummary[]>([]);
  const [isSwitchingSceneBranch, setIsSwitchingSceneBranch] = useState(false);
  const [isCreatingSceneBranch, setIsCreatingSceneBranch] = useState(false);
  const [sceneBranchError, setSceneBranchError] = useState<string | null>(null);
  const [reorderPreview, setReorderPreview] = useState<StoryReorderPreviewResponse | null>(null);
  const [isReorderPreviewOpen, setIsReorderPreviewOpen] = useState(false);
  const [isPreviewingReorder, setIsPreviewingReorder] = useState(false);
  const [isApplyingReorder, setIsApplyingReorder] = useState(false);
  const [reorderPreviewError, setReorderPreviewError] = useState<string | null>(null);
  const [llmCommitSuggestion, setLlmCommitSuggestion] = useState<string | null>(null);
  const [autoAcceptedProposals, setAutoAcceptedProposals] = useState<EntityProposal[] | null>(null);
  const autoAcceptedTimeoutRef = useRef<number | null>(null);
  // Proposal Review Modal state
  const [reviewingProposals, setReviewingProposals] = useState<EntityProposal[] | null>(null);
  const [reviewingMessageId, setReviewingMessageId] = useState<string | null>(null);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [isRefining, setIsRefining] = useState(false);
  const [refineFeedback, setRefineFeedback] = useState("");
  const [previewPortrait, setPreviewPortrait] = useState<string | null>(null);
  const [isGeneratingPreviewPortrait, setIsGeneratingPreviewPortrait] = useState(false);

  const mapServerProposal = (p: any): EntityProposal => ({
    id: p.id,
    type: p.type,
    entity: p.entity,
    existingEntity: p.existingEntity,
    relationship: p.relationship,
    scene: p.scene,
    status: p.status || "pending",
  });

  const attachProposalsToMessages = (msgs: Message[], proposals: any[]): Message[] => {
    if (!proposals || proposals.length === 0) return msgs;
    const grouped = new Map<string, EntityProposal[]>();

    proposals.forEach((proposal) => {
      const messageId = proposal.messageId;
      if (!messageId) return;
      const mapped = mapServerProposal(proposal);
      if (!grouped.has(messageId)) {
        grouped.set(messageId, []);
      }
      grouped.get(messageId)!.push(mapped);
    });

    return msgs.map((msg) => {
      const key = msg.messageId || msg.id;
      const additions = grouped.get(key);
      if (!additions || additions.length === 0) return msg;
      const existingIds = new Set((msg.proposals || []).map(p => p.id));
      const merged = [
        ...(msg.proposals || []),
        ...additions.filter(p => !existingIds.has(p.id)),
      ];
      return { ...msg, proposals: merged };
    });
  };

  const scheduleAutoAcceptedClear = (delayMs: number = 20000) => {
    if (autoAcceptedTimeoutRef.current) {
      window.clearTimeout(autoAcceptedTimeoutRef.current);
    }
    autoAcceptedTimeoutRef.current = window.setTimeout(() => {
      setAutoAcceptedProposals(null);
      autoAcceptedTimeoutRef.current = null;
    }, delayMs);
  };

  const handleUndoAutoAccepted = async () => {
    if (!autoAcceptedProposals || autoAcceptedProposals.length === 0) return;
    try {
      const res = await fetch(`${API_BASE}/api/narrative/proposals/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalIds: autoAcceptedProposals.map(p => p.id) }),
      });

      if (res.ok) {
        // Refresh entities, relationships, scenes
        const [entitiesRes, relationshipsRes, interactionsRes] = await Promise.all([
          fetch(`${API_BASE}/api/narrative/entities`),
          fetch(`${API_BASE}/api/narrative/relationships`),
          fetch(`${API_BASE}/api/narrative/interactions`),
        ]);

        if (entitiesRes.ok) {
          const entitiesData = await entitiesRes.json();
          setEntities(mapEntitiesFromApi(entitiesData));
        }

        if (relationshipsRes.ok) {
          const relsData = await relationshipsRes.json();
          setRelationships(relsData.map((r: any) => ({
            id: r.id,
            sourceId: r.source || r.sourceId,
            targetId: r.target || r.targetId,
            sourceName: r.sourceName,
            targetName: r.targetName,
            type: r.type,
            description: r.description,
          })));
        }

        if (interactionsRes.ok) {
          const interactionsData = await interactionsRes.json();
          setScenes(mapScenesFromApi(interactionsData));
        }

        await refreshSessionStatus();
      }
    } catch (error) {
      console.error("Failed to undo auto-accepted proposals:", error);
    } finally {
      setAutoAcceptedProposals(null);
    }
  };

  // Load data from API on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [projectsRes, entitiesRes, relationshipsRes, interactionsRes, historyRes, statusRes, proposalsRes, timelineRes, artifactsRes, assetsRes] = await Promise.all([
          fetch(`${API_BASE}/api/projects`),
          fetch(`${API_BASE}/api/narrative/entities`),
          fetch(`${API_BASE}/api/narrative/relationships`),
          fetch(`${API_BASE}/api/narrative/interactions`),
          fetch(`${API_BASE}/api/narrative/chat/history`),
          fetch(`${API_BASE}/api/narrative/session/status`),
          fetch(`${API_BASE}/api/narrative/proposals`),
          fetch(`${API_BASE}/api/narrative/timeline`),
          fetch(`${API_BASE}/api/narrative/artifacts`),
          fetch(`${API_BASE}/api/narrative/assets`),
        ]);

        let loadedWorldName = worldName;
        if (projectsRes.ok) {
          const projectsData = await projectsRes.json();
          const activeProject = projectsData.find((project: any) => project.isActive) || projectsData[0];
          if (activeProject) {
            loadedWorldName = activeProject.name || loadedWorldName;
            hydrateSettingsForProject(activeProject.id, activeProject.styleProfile);
            setPinnedStyleAssetIds(activeProject.styleProfile?.styleAssetIds || []);
          }
        }

        if (entitiesRes.ok) {
          const entitiesData = await entitiesRes.json();
          // Map API entities to our format
          const mappedEntities: Entity[] = mapEntitiesFromApi(entitiesData);
          setEntities(mappedEntities);

          // Get world name from first location or use default
          const firstLocation = mappedEntities.find(e => e.type === "location");
          if (firstLocation) {
            loadedWorldName = firstLocation.name;
            setWorldName(firstLocation.name);
          }
        }

        if (relationshipsRes.ok) {
          const relsData = await relationshipsRes.json();
          setRelationships(relsData.map((r: any) => ({
            id: r.id,
            sourceId: r.source || r.sourceId,
            targetId: r.target || r.targetId,
            sourceName: r.sourceName,
            targetName: r.targetName,
            type: r.type,
            description: r.description,
          })));
        }

        if (interactionsRes.ok) {
          const interactionsData = await interactionsRes.json();
          setScenes(mapScenesFromApi(interactionsData));
        }

        if (artifactsRes.ok) {
          const artifactsData = await artifactsRes.json();
          const list: Artifact[] = Array.isArray(artifactsData?.artifacts) ? artifactsData.artifacts : [];
          // Resolve relative image URLs to absolute paths the studio can render
          setArtifacts(list.map((a) => ({
            ...a,
            primaryImage: a.primaryImage ? { ...a.primaryImage, url: resolveImageUrl(a.primaryImage.url) || a.primaryImage.url } : undefined,
          })));
        }

        if (assetsRes.ok) {
          const assetsData = await assetsRes.json();
          const list: ProjectAsset[] = Array.isArray(assetsData?.assets) ? assetsData.assets : [];
          setAssetsList(list.map((a) => ({ ...a, url: resolveImageUrl(a.url) || a.url })));
        }

        // Fetch storyboards (a virtual filter on artifacts)
        try {
          const sbRes = await fetch(`${API_BASE}/api/narrative/storyboards`);
          if (sbRes.ok) {
            const sbData = await sbRes.json();
            const list: StoryboardArtifact[] = Array.isArray(sbData?.storyboards) ? sbData.storyboards : [];
            setStoryboards(list.map((s) => ({
              ...s,
              primaryImage: s.primaryImage ? { ...s.primaryImage, url: resolveImageUrl(s.primaryImage.url) || s.primaryImage.url } : undefined,
            })));
          }
        } catch { /* non-fatal */ }

        // Fetch script document
        try {
          const scriptRes = await fetch(`${API_BASE}/api/narrative/script`);
          if (scriptRes.ok) {
            const scriptData = await scriptRes.json();
            setScriptDoc(scriptData.script || {});
          }
        } catch { /* non-fatal */ }

        // Fetch acts (stage 2 pipeline restructure)
        try {
          const actsRes = await fetch(`${API_BASE}/api/narrative/acts`);
          if (actsRes.ok) {
            const actsData = await actsRes.json();
            setActs(Array.isArray(actsData?.acts) ? actsData.acts : []);
          }
        } catch { /* non-fatal */ }

        // Fetch timeline (stage 3 pipeline restructure)
        try {
          const tlRes = await fetch(`${API_BASE}/api/narrative/timeline`);
          if (tlRes.ok) {
            const tlData = await tlRes.json();
            if (tlData?.timeline) {
              setTimeline(tlData.timeline);
              pushTimelineHistory(tlData.timeline);
            }
          }
        } catch { /* non-fatal */ }

        // Load conversation history if available, otherwise show welcome message
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          if (historyData.messages && historyData.messages.length > 0) {
            // Map server messages to our format
            let baseMessages: Message[] = historyData.messages.map((m: any, i: number) => ({
              id: m.id || `msg_${m.timestamp}_${i}`,
              messageId: m.messageId,
              role: m.role as "user" | "assistant" | "system",
              content: m.content,
              timestamp: m.timestamp || Date.now(),
              proposals: m.proposals || [],
              // Restore generated images + tool-call chips from saved history.
              toolUsage: m.toolUsage || null,
            }));

            // Attach pending proposals to their originating message
            if (proposalsRes.ok) {
              const proposalsData = await proposalsRes.json();
              if (proposalsData?.proposals?.length) {
                baseMessages = attachProposalsToMessages(baseMessages, proposalsData.proposals);
              }
            }

            setMessages(baseMessages);
            console.log(`📜 Loaded ${historyData.messages.length} messages from conversation history`);
          } else {
            // No history - show welcome message
            setMessages([{
              id: "msg_welcome",
              role: "assistant",
              content: `Welcome to the world of ${loadedWorldName}. I'm here to help you explore and expand this narrative. What would you like to discover?`,
              timestamp: Date.now(),
            }]);
          }
        } else {
          // History fetch failed - show welcome message
          setMessages([{
            id: "msg_welcome",
            role: "assistant",
            content: `Welcome to the world of ${loadedWorldName}. I'm here to help you explore and expand this narrative. What would you like to discover?`,
            timestamp: Date.now(),
          }]);
        }

        // Load session status (uncommitted changes, etc.)
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setSessionStatus(statusData);
          console.log(`📊 Session status: ${statusData.uncommittedChanges ? 'has uncommitted changes' : 'clean'}`);
        }

        if (timelineRes.ok) {
          const timelineData = await timelineRes.json();
          if (Array.isArray(timelineData?.branches)) {
            setSceneBranches(timelineData.branches);
          }
        }

      } catch (error) {
        console.error("Failed to load data from API, falling back to demo:", error);
        // Fallback to demo data
        setEntities(demoEntities);
        setScenes(demoScenes);
        setRelationships(demoRelationships);
        setMessages([{
          id: "msg_welcome",
          role: "assistant",
          content: "Welcome to Ashwood Village. The fog is thick today, and strange things stir in the shadows. What would you like to explore?",
          timestamp: Date.now(),
        }]);
      } finally {
        setIsDataLoading(false);
      }
    }

    loadData();
  }, []);

  // Navigation state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeRow, setActiveRow] = useState<CarouselRow>("entities");
  // Phase rail expanded (labels visible) vs collapsed (icons only). Click the
  // rail's toggle to expand — it does NOT auto-expand on hover.
  const [railExpanded, setRailExpanded] = useState(false);
  const [expandedSceneId, setExpandedSceneId] = useState<string | null>(null);
  const justExpandedRef = useRef(false);

  // Carousel items: flat array that inserts frames after the expanded scene
  const carouselItems = useMemo<CarouselItem[]>(() => {
    const items: CarouselItem[] = [];
    for (const scene of scenes) {
      items.push({ kind: 'scene', id: scene.id, scene });
      if (expandedSceneId === scene.id && scene.frames && scene.frames.length > 0) {
        scene.frames.forEach((frame, fIdx) => {
          items.push({
            kind: 'frame',
            id: `${scene.id}__frame__${frame.id}`,
            scene,
            frame,
            frameIndex: fIdx,
            totalFrames: scene.frames!.length,
          });
        });
      }
    }
    return items;
  }, [scenes, expandedSceneId]);

  // Map scene ID → index in carouselItems for quick lookup
  const sceneIndexInCarousel = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    carouselItems.forEach((item, idx) => {
      if (item.kind === 'scene') map[item.scene.id] = idx;
    });
    return map;
  }, [carouselItems]);

  // Toggle frames expansion for a scene in the carousel
  const handleToggleSceneFrames = (sceneId: string) => {
    if (expandedSceneId === sceneId) {
      // Collapse: move index back to the scene
      const sceneIdx = sceneIndexInCarousel[sceneId];
      if (sceneIdx !== undefined) setCurrentIndex(sceneIdx);
      setExpandedSceneId(null);
    } else {
      // Expand: set expanded, then adjust index to stay on the scene
      const sceneIdxBefore = scenes.findIndex(s => s.id === sceneId);
      // Compute what the scene's index will be in the new carouselItems
      let newIdx = 0;
      for (let i = 0; i < sceneIdxBefore; i++) {
        newIdx++; // scene itself
        // Don't count previous expanded frames since we're changing expandedSceneId
      }
      justExpandedRef.current = true;
      setExpandedSceneId(sceneId);
      setCurrentIndex(newIdx);
    }
  };

  // Wrapped setActiveRow that also collapses expanded frames
  const switchRow = (row: CarouselRow) => {
    setExpandedSceneId(null);
    setActiveRow(row);
  };

  // UI state
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // Two-state chat. false = collapsed: a centered bottom quick-prompt bar over
  // the canvas (full-width canvas). true = expanded: the full right side chat
  // panel (canvas reserves 420px). Both inputs share the same `input` +
  // messages. Sending from the bottom bar stays collapsed — a spinner shows
  // while the reply generates, then an unseen-reply badge appears.
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  // Count of agent replies that landed while the bottom bar was collapsed and
  // the user hasn't opened the panel to see them yet. Cleared on expand.
  const [unseenReplies, setUnseenReplies] = useState(0);
  const prevChatLoadingRef = useRef(false);
  // When the agent generates/edits an image for the focused entity, we want the
  // spotlight carousel to jump to that new image (original stays in the gallery).
  // The chat-refresh sets this to the new URL; EntityWorkbench watches it.
  const [pendingSpotlightUrl, setPendingSpotlightUrl] = useState<string | null>(null);
  const [isWorldDrawerOpen, setIsWorldDrawerOpen] = useState(false);
  const [proseMode, setProseMode] = useState(false);
  const [proseScrollAccum, setProseScrollAccum] = useState(0);

  // Detail view state
  const [selectedEntity, setSelectedEntity] = useState<EntityDetail | null>(null);
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingFrames, setIsGeneratingFrames] = useState(false);
  const [generatingFrameId, setGeneratingFrameId] = useState<string | null>(null);
  const [batchImageProgress, setBatchImageProgress] = useState<{ current: number; total: number } | null>(null);
  const [frameGenerationError, setFrameGenerationError] = useState<string | null>(null);
  const [sceneGenerationDiagnostics, setSceneGenerationDiagnostics] = useState<Record<string, SceneGenerationDiagnostics>>({});
  const [cameraAngleTarget, setCameraAngleTarget] = useState<CameraAngleTarget | null>(null);
  const [isGeneratingCameraAngle, setIsGeneratingCameraAngle] = useState(false);
  const [imageEditTarget, setImageEditTarget] = useState<CameraAngleTarget | null>(null);
  const [isApplyingImageEdit, setIsApplyingImageEdit] = useState(false);

  // Frame detail modal state
  // openedFrom tracks where the user entered the shot workbench from, so the
  // close button routes back to the right place. Default "scene" preserves
  // legacy behaviour (X → Scene workbench); "timeline" makes X close all the
  // way back to the timeline view.
  const [selectedFrame, setSelectedFrame] = useState<{ scene: Scene; frameId: string; openedFrom?: "scene" | "timeline" } | null>(null);
  // Timeline-selected clip's source — used to surface "the clip you're
  // looking at in the timeline" to the agent so it can edit_image / change
  // angle on that shot without the user opening the Shot workbench first.
  const [timelineFocusedShot, setTimelineFocusedShot] = useState<{ sceneId: string; shotId: string } | null>(null);
  // The image the user is actively LOOKING AT — spotlight in Entity
  // workbench, hero in Scene workbench, the frame in Shot workbench, the
  // active clip in Timeline. Surfaced to the chat so the agent operates on
  // the *visible* image, not the entity's primary by default.
  type CurrentViewImage = {
    url: string;
    label: string;
    // Where the image lives, so edits can write back to the right place.
    source:
      | { kind: "entity-primary"; entityId: string }
      | { kind: "entity-variation"; entityId: string; index: number }
      | { kind: "entity-gallery"; entityId: string; galleryId: string }
      | { kind: "scene"; sceneId: string }
      | { kind: "frame"; sceneId: string; frameId: string }
      | { kind: "asset"; assetId: string };
  };
  const [currentViewImage, setCurrentViewImage] = useState<CurrentViewImage | null>(null);
  // The EntityWorkbench owns its own spotlight nav and pushes via callback,
  // so we let that path dominate when it's set. For other workbenches we
  // derive currentViewImage from the focused frame/scene/timeline clip.
  const [entityWorkbenchSpotlight, setEntityWorkbenchSpotlight] = useState<CurrentViewImage | null>(null);

  // Derive the "what the user is looking at" image from the active context.
  // Priority: explicit Shot workbench → Scene workbench hero → EntityWorkbench
  // spotlight → timeline-selected clip's shot. Fires whenever any of those
  // pointers changes.
  useEffect(() => {
    // Highest priority: Shot workbench is open
    if (selectedFrame) {
      const scene = scenes.find((s) => s.id === selectedFrame.scene.id) || selectedFrame.scene;
      const frame = (scene.frames || []).find((f) => f.id === selectedFrame.frameId);
      if (frame?.imageUrl) {
        setCurrentViewImage({
          url: frame.imageUrl,
          label: `Shot "${frame.title || frame.id}" of scene "${scene.title}"`,
          source: { kind: "frame", sceneId: scene.id, frameId: frame.id },
        });
        return;
      }
    }
    // Next: Scene workbench open
    if (selectedScene) {
      const scene = scenes.find((s) => s.id === selectedScene.id) || selectedScene;
      if (scene.imageUrl) {
        setCurrentViewImage({
          url: scene.imageUrl,
          label: `Scene hero: "${scene.title}"`,
          source: { kind: "scene", sceneId: scene.id },
        });
        return;
      }
    }
    // EntityWorkbench's spotlight (when in World view, no frame/scene open)
    if (entityWorkbenchSpotlight) {
      setCurrentViewImage(entityWorkbenchSpotlight);
      return;
    }
    // Timeline-selected clip
    if (timelineFocusedShot) {
      const scene = scenes.find((s) => s.id === timelineFocusedShot.sceneId);
      const frame = scene?.frames?.find((f) => f.id === timelineFocusedShot.shotId);
      if (frame?.imageUrl) {
        setCurrentViewImage({
          url: frame.imageUrl,
          label: `Timeline clip — shot "${frame.title || frame.id}" of scene "${scene?.title}"`,
          source: { kind: "frame", sceneId: timelineFocusedShot.sceneId, frameId: timelineFocusedShot.shotId },
        });
        return;
      }
    }
    setCurrentViewImage(null);
  }, [selectedFrame, selectedScene, entityWorkbenchSpotlight, timelineFocusedShot, scenes]);
  const selectedFrameData = selectedFrame
    ? (selectedFrame.scene.frames || []).find(f => f.id === selectedFrame.frameId) || null
    : null;

  // LLM working memory - pinned entities
  const [pinnedEntities, setPinnedEntities] = useState<Entity[]>([]);
  const [focusedEntity, setFocusedEntity] = useState<Entity | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ message: string; action: string } | null>(null);

  // Settings state
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isScratchpadOpen, setIsScratchpadOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isStyleSetupOpen, setIsStyleSetupOpen] = useState(false);
  const [isSavingProjectStyle, setIsSavingProjectStyle] = useState(false);
  const styleHydratedRef = useRef(false);
  const isHydratingStyleRef = useRef(false);

  const styleStorageKeyForProject = (projectId: string): string => `narrativeStudioSettings:${projectId}`;

  const updateSettings = (newSettings: Partial<StudioSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    if (currentProjectId) {
      localStorage.setItem(styleStorageKeyForProject(currentProjectId), JSON.stringify(updated));
    }
  };

  const deriveLegacyPresetId = (narrativePresetId?: string, visualPresetId?: string): string => {
    if (!narrativePresetId || !visualPresetId) return "";
    return narrativePresetId === visualPresetId ? narrativePresetId : "";
  };

  const applyNarrativeStylePreset = (presetId: string) => {
    if (!presetId) {
      updateSettings({
        narrativePresetId: "",
        stylePresetId: deriveLegacyPresetId("", settings.visualPresetId || ""),
      });
      return;
    }
    const preset = getNarrativePresetById(presetId);
    if (!preset) return;
    updateSettings({
      narrativePresetId: preset.id,
      writingStylePrompt: preset.prompt,
      stylePresetId: deriveLegacyPresetId(preset.id, settings.visualPresetId || ""),
    });
  };

  const applyVisualStylePreset = (presetId: string) => {
    if (!presetId) {
      updateSettings({
        visualPresetId: "",
        stylePresetId: deriveLegacyPresetId(settings.narrativePresetId || "", ""),
      });
      return;
    }
    const preset = getVisualPresetById(presetId);
    if (!preset) return;
    updateSettings({
      visualPresetId: preset.id,
      visualStylePrompt: preset.prompt,
      stylePresetId: deriveLegacyPresetId(settings.narrativePresetId || "", preset.id),
    });
  };

  const applyOutputIntent = (intentId: string) => {
    const outputIntent = normalizeStudioOutputIntent(intentId);
    const resolvedTextPolicy = resolveStudioTextPolicy(outputIntent, settings.textPolicy);
    updateSettings({
      outputIntent,
      textPolicy: resolvedTextPolicy.policy,
    });
  };

  const applyTextPolicy = (policyId: string) => {
    const outputIntent = normalizeStudioOutputIntent(settings.outputIntent);
    const resolvedTextPolicy = resolveStudioTextPolicy(outputIntent, policyId);
    updateSettings({
      textPolicy: resolvedTextPolicy.policy,
    });
  };

  const hydrateSettingsForProject = (projectId: string, styleProfile?: ProjectStyleProfile) => {
    setCurrentProjectId(projectId);
    isHydratingStyleRef.current = true;

    const profileSettings = buildSettingsFromStyleProfile(styleProfile);

    const localStorageKey = styleStorageKeyForProject(projectId);
    const savedSettings = localStorage.getItem(localStorageKey);
    let nextSettings = profileSettings;
    if (savedSettings) {
      try {
        nextSettings = mergeSavedStudioSettings(profileSettings, JSON.parse(savedSettings));
      } catch (error) {
        console.error("Failed to parse saved style settings:", error);
      }
    }

    setSettings(nextSettings);
    styleHydratedRef.current = true;

    const hasProfile = Boolean(
      styleProfile?.presetId ||
      styleProfile?.narrativePresetId ||
      styleProfile?.visualPresetId ||
      styleProfile?.narrativePrompt ||
      styleProfile?.visualPrompt
    );
    const hasLocal = Boolean(savedSettings);
    setIsStyleSetupOpen(!hasProfile && !hasLocal);

    window.setTimeout(() => {
      isHydratingStyleRef.current = false;
    }, 0);
  };

  useEffect(() => {
    if (!currentProjectId || !styleHydratedRef.current || isHydratingStyleRef.current) return;

    const handle = window.setTimeout(async () => {
      try {
        setIsSavingProjectStyle(true);
        await fetch(`${API_BASE}/api/projects/${currentProjectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            styleProfile: (() => {
              const narrativePresetId = settings.narrativePresetId || "";
              const visualPresetId = settings.visualPresetId || "";
              const narrativePresetName = getNarrativePresetName(narrativePresetId);
              const visualPresetName = getVisualPresetName(visualPresetId);
              const combinedPresetId = narrativePresetId && narrativePresetId === visualPresetId
                ? narrativePresetId
                : undefined;
              const combinedPresetName = combinedPresetId && narrativePresetName && visualPresetName && narrativePresetName === visualPresetName
                ? narrativePresetName
                : undefined;

              return {
                presetId: combinedPresetId,
                presetName: combinedPresetName,
                narrativePresetId: narrativePresetId || undefined,
                narrativePresetName,
                visualPresetId: visualPresetId || undefined,
                visualPresetName,
                narrativePrompt: settings.writingStylePrompt || undefined,
                visualPrompt: settings.visualStylePrompt || undefined,
                aspectRatio: settings.aspectRatio || undefined,
                imageModel: settings.imageModel || undefined,
                updatedAt: Date.now(),
              };
            })(),
          }),
        });
      } catch (error) {
        console.error("Failed to persist project style profile:", error);
      } finally {
        setIsSavingProjectStyle(false);
      }
    }, 700);

    return () => window.clearTimeout(handle);
  }, [API_BASE, currentProjectId, settings]);

  // Track unseen agent replies for the collapsed bottom-bar badge. A reply just
  // finished when isLoading goes true→false; if the panel is collapsed, the
  // user hasn't seen it yet. Opening the panel clears the count.
  useEffect(() => {
    const wasLoading = prevChatLoadingRef.current;
    prevChatLoadingRef.current = isLoading;
    if (wasLoading && !isLoading && !isChatExpanded) {
      setUnseenReplies((c) => c + 1);
    }
  }, [isLoading, isChatExpanded]);
  useEffect(() => {
    if (isChatExpanded && unseenReplies !== 0) setUnseenReplies(0);
  }, [isChatExpanded, unseenReplies]);

  // Refs
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll chat to the bottom. We re-run on every relevant trigger:
  //  - messages changed (new turn arrived)
  //  - proseMode toggled (a different chat container mounted)
  //  - isChatExpanded toggled (the small-mode chat panel just mounted)
  //  - initial load (messages get populated from history fetch)
  // And we call it across multiple ticks because:
  //  (1) the container may have just mounted and not measured yet
  //  (2) the panel-expand animation runs ~200ms and changes scrollHeight as it grows
  //  (3) inline images may still be loading and reflowing layout
  useEffect(() => {
    const scroll = () => {
      const el = chatContainerRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    };
    scroll();                                     // sync
    const raf = requestAnimationFrame(scroll);    // after first paint
    const t100 = setTimeout(scroll, 100);         // small animations
    const t400 = setTimeout(scroll, 400);         // panel-expand + late images
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t100);
      clearTimeout(t400);
    };
  }, [messages, proseMode, isChatExpanded]);

  // =============================================================================
  // HANDLERS
  // =============================================================================

  // Helper to get relationships for an entity from loaded data
  const getEntityRelationshipsLocal = (entityId: string): Relationship[] => {
    return relationships
      .filter(r => r.sourceId === entityId || r.targetId === entityId)
      .map(r => ({
        ...r,
        direction: r.sourceId === entityId ? "outgoing" as const : "incoming" as const,
      }));
  };

  // Collect reference image URLs for an entity: its own image + related entities' images
  const collectEntityRefUrls = (entity: Entity, opts?: { includeSelf?: boolean }): string[] => {
    const urls: string[] = [];
    // Optionally include entity's own reference image (for single regen, not variations)
    if (opts?.includeSelf && entity.referenceImage) urls.push(entity.referenceImage);
    // Include related entities' reference images (items worn, carried, companions, etc.)
    const rels = getEntityRelationshipsLocal(entity.id);
    for (const rel of rels) {
      const otherId = rel.direction === "outgoing" ? rel.targetId : rel.sourceId;
      const other = entities.find(e => e.id === otherId);
      if (other?.referenceImage) {
        urls.push(other.referenceImage);
        console.log(`[RefCollect] Adding ${other.name}'s image: ${other.referenceImage.substring(0, 80)}...`);
      }
    }
    const result = Array.from(new Set(urls));
    console.log(`[RefCollect] Collected ${result.length} reference URLs for ${entity.name} (includeSelf=${!!opts?.includeSelf})`);
    return result;
  };

  // Build relationship context string for portrait prompts (e.g. "Wears: Stray's Backpack (item)")
  const buildRelationshipContext = (entity: Entity): string => {
    const rels = getEntityRelationshipsLocal(entity.id);
    if (rels.length === 0) return "";
    const lines: string[] = [];
    for (const rel of rels) {
      const otherId = rel.direction === "outgoing" ? rel.targetId : rel.sourceId;
      const other = entities.find(e => e.id === otherId);
      if (!other) continue;
      const relLabel = rel.type.replace(/_/g, " ");
      lines.push(`${relLabel}: ${other.name} (${other.type})`);
    }
    return lines.length > 0 ? `\nAssociated elements: ${lines.join("; ")}` : "";
  };

  // Helper to get scenes for an entity from loaded data
  const getEntityScenesLocal = (entityId: string): Scene[] => {
    return scenes.filter(s => s.participantIds.includes(entityId) || s.locationId === entityId);
  };

  // Helper to get entity by ID from loaded data
  const getEntityByIdLocal = (entityId: string): Entity | undefined => {
    return entities.find(e => e.id === entityId);
  };

  const handleEntityClick = (entity: Entity) => {
    const entityRels = getEntityRelationshipsLocal(entity.id);
    const entityScenes = getEntityScenesLocal(entity.id);
    const relatedIds = new Set(
      entityRels.map((r) => (r.direction === "outgoing" ? r.targetId : r.sourceId))
    );
    const relatedEntities = entities.filter((e) => relatedIds.has(e.id));

    setSelectedEntity({
      entity,
      relationships: entityRels,
      scenes: entityScenes,
      relatedEntities,
    });
    hydratePortraitVariationsForEntity(entity);
    setSelectedScene(null);

    // CRITICAL: Also update carousel position so LLM knows what's selected
    const entityIndex = entities.findIndex(e => e.id === entity.id);
    if (entityIndex >= 0) {
      switchRow("entities");
      setCurrentIndex(entityIndex);
    }

    // Load timeline arc for this entity (non-blocking)
    void (async () => {
      try {
        const arcRes = await fetch(`${API_BASE}/api/narrative/story/entity/${entity.id}/arc`);
        if (!arcRes.ok) return;
        const arcData = await arcRes.json();
        setSelectedEntity((prev) => {
          if (!prev || prev.entity.id !== entity.id) return prev;
          return {
            ...prev,
            narrativeArc: arcData.arc,
            arcIssues: arcData.relatedIssues || [],
          };
        });
      } catch (error) {
        console.error("Failed to load entity arc:", error);
      }
    })();
  };

  const refetchAssets = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/assets`);
      if (!res.ok) return;
      const data = await res.json();
      const list: ProjectAsset[] = Array.isArray(data?.assets) ? data.assets : [];
      setAssetsList(list.map((a) => ({ ...a, url: resolveImageUrl(a.url) || a.url })));
    } catch (err) {
      console.error("Failed to refetch assets:", err);
    }
  };

  const refetchGeneratedAssets = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/assets/generated`);
      if (!res.ok) return;
      const data = await res.json();
      const list: GeneratedAssetRecord[] = Array.isArray(data?.assets) ? data.assets : [];
      setGeneratedAssetsList(list.map((a) => ({ ...a, url: resolveImageUrl(a.url) || a.url })));
    } catch (err) {
      console.error("Failed to refetch generated assets:", err);
    }
  };

  const handleUploadAssetFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (fileArray.length === 0) return;
    setIsUploadingAssets(true);
    try {
      const fd = new FormData();
      for (const f of fileArray) fd.append("files", f);
      fd.append("category", uploadCategory);
      const res = await fetch(`${API_BASE}/api/narrative/assets`, { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.text();
        console.error("Asset upload failed:", err);
        return;
      }
      // Style refs are auto-pinned server-side on upload — reflect that so the
      // Style phase shows them in the pinned bucket immediately.
      try {
        const data = await res.json();
        if (Array.isArray(data?.styleAssetIds)) setPinnedStyleAssetIds(data.styleAssetIds);
      } catch { /* non-JSON / no styleAssetIds — ignore */ }
      await refetchAssets();
    } catch (err) {
      console.error("Asset upload error:", err);
    } finally {
      setIsUploadingAssets(false);
    }
  };

  const handleDeleteAsset = async (asset: ProjectAsset) => {
    if (!confirm(`Delete "${asset.name}"? This removes the file from disk.`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/narrative/assets/${asset.id}`, { method: "DELETE" });
      if (!res.ok) return;
      setAssetsList((prev) => prev.filter((a) => a.id !== asset.id));
      if (selectedAsset?.id === asset.id) setSelectedAsset(null);
    } catch (err) {
      console.error("Asset delete error:", err);
    }
  };

  const handleUpdateAsset = async (assetId: string, patch: Partial<ProjectAsset>) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return;
      const data = await res.json();
      const updated: ProjectAsset = { ...data.asset, url: resolveImageUrl(data.asset.url) || data.asset.url };
      setAssetsList((prev) => prev.map((a) => (a.id === assetId ? updated : a)));
      if (selectedAsset?.id === assetId) setSelectedAsset(updated);
    } catch (err) {
      console.error("Asset patch error:", err);
    }
  };

  const TEST_RENDER_PROMPTS: Array<{ key: string; label: string; prompt: string; aspectRatio: string }> = [
    {
      key: "portrait",
      label: "Character Bust",
      prompt: "A young woman in her early twenties, three-quarter angle portrait, neutral expression, soft directional lighting, neutral atmospheric background, mid-shot framing. Render this in the project's locked visual style.",
      aspectRatio: "3:4",
    },
    {
      key: "wide",
      label: "Wide Establishing",
      prompt: "A futuristic city skyline at golden hour, wide establishing shot, atmospheric depth, low camera angle looking up between buildings. Render this in the project's locked visual style.",
      aspectRatio: "16:9",
    },
    {
      key: "closeup",
      label: "Dramatic Close-up",
      prompt: "Close-up on a determined face, dramatic side-lighting, intense expression, shallow depth of field, painterly atmosphere. Render this in the project's locked visual style.",
      aspectRatio: "1:1",
    },
    {
      key: "action",
      label: "Action Moment",
      prompt: "A character mid-stride running through an urban environment, dynamic action pose, motion energy, environmental motion blur, cinematic framing. Render this in the project's locked visual style.",
      aspectRatio: "16:9",
    },
  ];

  const refetchScript = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/script`);
      if (!res.ok) return;
      const data = await res.json();
      setScriptDoc(data.script || {});
    } catch (err) {
      console.error("Failed to refetch script:", err);
    }
  };

  // Scalar-stage updates (logline / synopsis / theme / write / actSummaries / actBreakdowns)
  const handleScriptScalarUpdate = async (patch: Record<string, any>) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/script`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return;
      const data = await res.json();
      setScriptDoc(data.script || {});
    } catch (err) {
      console.error("Script update error:", err);
    }
  };

  // Character summary CRUD
  const handleAddCharacterSummary = async (name: string, summary: string, linkedEntityId?: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/script/character-summaries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, summary, linkedEntityId }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setScriptDoc(data.script || {});
    } catch (err) {
      console.error("Add character summary error:", err);
    }
  };

  const handleUpdateCharacterSummary = async (id: string, patch: { name?: string; summary?: string; linkedEntityId?: string }) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/script/character-summaries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return;
      const data = await res.json();
      setScriptDoc(data.script || {});
    } catch (err) {
      console.error("Update character summary error:", err);
    }
  };

  // Character list (deep — Stage 6) CRUD
  const handleAddCharacterListEntry = async (
    name: string,
    description?: string,
    arc?: string,
    motivations?: string,
    linkedEntityId?: string,
  ) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/script/character-list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, arc, motivations, linkedEntityId }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setScriptDoc(data.script || {});
    } catch (err) {
      console.error("Add character-list entry error:", err);
    }
  };

  const handleUpdateCharacterListEntry = async (
    id: string,
    patch: { name?: string; description?: string; arc?: string; motivations?: string; linkedEntityId?: string },
  ) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/script/character-list/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return;
      const data = await res.json();
      setScriptDoc(data.script || {});
    } catch (err) {
      console.error("Update character-list entry error:", err);
    }
  };

  const handleDeleteCharacterListEntry = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/script/character-list/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      const data = await res.json();
      setScriptDoc(data.script || {});
    } catch (err) {
      console.error("Delete character-list entry error:", err);
    }
  };

  // Beat sheet (Stage 7) CRUD
  const handleAddBeat = async (label: string, position?: number, description?: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/script/beats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, position, description }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setScriptDoc(data.script || {});
    } catch (err) {
      console.error("Add beat error:", err);
    }
  };

  const handleUpdateBeat = async (id: string, patch: { label?: string; position?: number; description?: string }) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/script/beats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return;
      const data = await res.json();
      setScriptDoc(data.script || {});
    } catch (err) {
      console.error("Update beat error:", err);
    }
  };

  const handleDeleteBeat = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/script/beats/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      const data = await res.json();
      setScriptDoc(data.script || {});
    } catch (err) {
      console.error("Delete beat error:", err);
    }
  };

  // Scene list CRUD + promote-to-Scene + resync
  const handleAddSceneListEntry = async (pitch: string, position?: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/script/scene-list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pitch, position }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setScriptDoc(data.script || {});
    } catch (err) {
      console.error("Add scene-list entry error:", err);
    }
  };

  const handleUpdateSceneListEntry = async (id: string, pitch: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/script/scene-list/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pitch }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setScriptDoc(data.script || {});
    } catch (err) {
      console.error("Update scene-list entry error:", err);
    }
  };

  const handleDeleteSceneListEntry = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/script/scene-list/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      const data = await res.json();
      setScriptDoc(data.script || {});
    } catch (err) {
      console.error("Delete scene-list entry error:", err);
    }
  };

  const handleReorderSceneList = async (orderedIds: string[]) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/script/scene-list/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setScriptDoc(data.script || {});
    } catch (err) {
      console.error("Reorder scene list error:", err);
    }
  };

  const handlePromoteSceneListEntry = async (id: string, title?: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/script/scene-list/${id}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) return;
      // Refresh both script and scenes (a new Scene was created)
      await refetchScript();
      const scenesRes = await fetch(`${API_BASE}/api/narrative/interactions`);
      if (scenesRes.ok) {
        const interactionsData = await scenesRes.json();
        setScenes(mapScenesFromApi(Array.isArray(interactionsData) ? interactionsData : (interactionsData.interactions || [])));
      }
    } catch (err) {
      console.error("Promote scene-list entry error:", err);
    }
  };

  const handleResyncSceneListEntry = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/script/scene-list/${id}/resync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      const data = await res.json();
      setScriptDoc(data.script || {});
    } catch (err) {
      console.error("Resync scene-list entry error:", err);
    }
  };

  const handleDeleteCharacterSummary = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/script/character-summaries/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      const data = await res.json();
      setScriptDoc(data.script || {});
    } catch (err) {
      console.error("Delete character summary error:", err);
    }
  };

  const refetchStoryboards = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/storyboards`);
      if (!res.ok) return;
      const data = await res.json();
      const list: StoryboardArtifact[] = Array.isArray(data?.storyboards) ? data.storyboards : [];
      setStoryboards(list.map((s) => ({
        ...s,
        primaryImage: s.primaryImage ? { ...s.primaryImage, url: resolveImageUrl(s.primaryImage.url) || s.primaryImage.url } : undefined,
      })));
    } catch (err) {
      console.error("Failed to refetch storyboards:", err);
    }
  };

  // ─── Acts CRUD ─────────────────────────────────────────────────────────
  // Acts are the top-level story arcs that group scenes. The server is the
  // source of truth; we refetch after each mutation to stay in sync.
  const refetchActs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/acts`);
      if (!res.ok) return;
      const data = await res.json();
      setActs(Array.isArray(data?.acts) ? data.acts : []);
    } catch (err) {
      console.error("Failed to refetch acts:", err);
    }
  };

  const handleAddAct = async (title: string, arc?: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/acts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, arc: arc || "" }),
      });
      if (!res.ok) {
        console.error("Add act failed:", await res.text());
        return null;
      }
      const data = await res.json();
      await refetchActs();
      return data.act as ProjectAct;
    } catch (err) {
      console.error("Add act error:", err);
      return null;
    }
  };

  const handleUpdateAct = async (id: string, patch: { title?: string; arc?: string; order?: number }) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/acts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        console.error("Update act failed:", await res.text());
        return;
      }
      await refetchActs();
    } catch (err) {
      console.error("Update act error:", err);
    }
  };

  const handleDeleteAct = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/acts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        console.error("Delete act failed:", await res.text());
        return;
      }
      // Scenes that linked to this act get unassigned server-side.
      await Promise.all([refetchActs(), refetchScenes()]);
    } catch (err) {
      console.error("Delete act error:", err);
    }
  };

  const handleReorderActs = async (orderedIds: string[]) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/acts/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });
      if (!res.ok) {
        console.error("Reorder acts failed:", await res.text());
        return;
      }
      await refetchActs();
    } catch (err) {
      console.error("Reorder acts error:", err);
    }
  };

  // Assign a scene to an act (or pass null to unassign). Updates scene state
  // locally for snappiness; server persists via the standard PUT /interactions
  // path that now accepts actId.
  const handleAssignSceneToAct = async (sceneId: string, actId: string | null) => {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    await handleSceneUpdate({ ...scene, actId });
  };

  // Create a blank scene directly (no chat round-trip). Used by the Storyboard
  // view's "+ Add Scene" buttons inside acts. Optionally assigns the new
  // scene to an act.
  const handleCreateBlankScene = async (opts: { title?: string; actId?: string | null } = {}) => {
    try {
      const title = opts.title || (opts.actId
        ? `New scene in ${acts.find((a) => a.id === opts.actId)?.title || "act"}`
        : "Untitled scene");
      const res = await fetch(`${API_BASE}/api/narrative/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          prose: "",
          status: "draft",
          ...(opts.actId ? { actId: opts.actId } : {}),
        }),
      });
      if (!res.ok) {
        console.error("Create scene failed:", await res.text());
        return null;
      }
      const data = await res.json();
      await refetchScenes();
      const created = data?.interaction || data?.scene;
      if (created?.id) {
        // Focus the new scene in the workbench so the user can fill it out.
        const refreshed = await fetch(`${API_BASE}/api/narrative/interactions`);
        if (refreshed.ok) {
          const list = await refreshed.json();
          const mapped = mapScenesFromApi(Array.isArray(list) ? list : (list.interactions || []));
          const newScene = mapped.find((s) => s.id === created.id);
          if (newScene) {
            setSelectedScene(newScene);
          }
        }
      }
      return created;
    } catch (err) {
      console.error("Create scene error:", err);
      return null;
    }
  };

  // Refetch all scenes from the server. Used after destructive operations
  // that change the scene shape (act delete cascades into scene.actId).
  const refetchScenes = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/interactions`);
      if (!res.ok) return;
      const data = await res.json();
      setScenes(mapScenesFromApi(Array.isArray(data) ? data : (data.interactions || [])));
    } catch (err) {
      console.error("Failed to refetch scenes:", err);
    }
  };

  // ─── Timeline CRUD ─────────────────────────────────────────────────────
  // Single project-level timeline; tracks contain ordered clips; clips
  // reference shots (SceneFrame). The server is source of truth.

  // Snapshot helper — records the timeline state at the current cursor.
  // Truncates any redo tail. Capped at TIMELINE_HISTORY_MAX entries.
  const pushTimelineHistory = (snapshot: ProjectTimeline) => {
    if (skipNextHistoryPushRef.current) {
      skipNextHistoryPushRef.current = false;
      return;
    }
    const stack = timelineHistoryRef.current;
    const idx = timelineHistoryIndexRef.current;
    // Drop any redo tail (anything after the current index)
    const truncated = stack.slice(0, idx + 1);
    const cloned = JSON.parse(JSON.stringify(snapshot)) as ProjectTimeline;
    truncated.push(cloned);
    // Cap history size so it doesn't grow unbounded for long sessions
    const capped = truncated.length > TIMELINE_HISTORY_MAX
      ? truncated.slice(truncated.length - TIMELINE_HISTORY_MAX)
      : truncated;
    timelineHistoryRef.current = capped;
    timelineHistoryIndexRef.current = capped.length - 1;
    setTimelineHistoryTick((t) => t + 1);
  };

  const refetchTimeline = async () => {
    try {
      // Thread projectId so the timeline is read from the CURRENT project, not
      // the server's active fallback (active-project drift wiped tracks on reload).
      const res = await fetch(`${API_BASE}/api/narrative/timeline${currentProjectId ? `?projectId=${currentProjectId}` : ""}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data?.timeline) {
        setTimeline(data.timeline);
        pushTimelineHistory(data.timeline);
      }
    } catch (err) {
      console.error("Failed to refetch timeline:", err);
    }
  };

  // Restore a specific timeline snapshot to the server. Used by undo/redo.
  const restoreTimelineSnapshot = async (snapshot: ProjectTimeline) => {
    try {
      // The next refetch is part of restore — don't push another history
      // entry, just move the cursor.
      skipNextHistoryPushRef.current = true;
      const res = await fetch(`${API_BASE}/api/narrative/timeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeline: snapshot, projectId: currentProjectId }),
      });
      if (!res.ok) {
        console.error("Restore timeline failed:", await res.text());
        skipNextHistoryPushRef.current = false;
        return;
      }
      const data = await res.json();
      if (data?.timeline) setTimeline(data.timeline);
    } catch (err) {
      console.error("Restore timeline error:", err);
      skipNextHistoryPushRef.current = false;
    }
  };

  const canUndoTimeline = timelineHistoryIndexRef.current > 0;
  const canRedoTimeline = timelineHistoryIndexRef.current < timelineHistoryRef.current.length - 1;
  // (referencing timelineHistoryTick to satisfy the unused-var checker and
  // ensure recomputation when history updates)
  void timelineHistoryTick;

  const undoTimeline = async () => {
    const stack = timelineHistoryRef.current;
    const idx = timelineHistoryIndexRef.current;
    if (idx <= 0) return;
    const target = stack[idx - 1];
    timelineHistoryIndexRef.current = idx - 1;
    setTimelineHistoryTick((t) => t + 1);
    await restoreTimelineSnapshot(target);
  };

  const redoTimeline = async () => {
    const stack = timelineHistoryRef.current;
    const idx = timelineHistoryIndexRef.current;
    if (idx >= stack.length - 1) return;
    const target = stack[idx + 1];
    timelineHistoryIndexRef.current = idx + 1;
    setTimelineHistoryTick((t) => t + 1);
    await restoreTimelineSnapshot(target);
  };

  // Cmd/Ctrl+Z = undo timeline, Cmd/Ctrl+Shift+Z (or Ctrl+Y) = redo. Only
  // fires while the user is on the Production phase and not typing in an
  // input. Other phases don't have a timeline history yet.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (activeRow !== "scenes") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undoTimeline();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redoTimeline();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRow]);

  const handleAddTimelineTrack = async (name?: string, kind: "video" | "audio" | "caption" | "note" = "video") => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/timeline/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, kind, projectId: currentProjectId }),
      });
      if (!res.ok) {
        console.error("Add track failed:", await res.text());
        return null;
      }
      const data = await res.json();
      await refetchTimeline();
      return data.track as ProjectTimelineTrack;
    } catch (err) {
      console.error("Add track error:", err);
      return null;
    }
  };

  const handleUpdateTimelineTrack = async (id: string, patch: { name?: string; muted?: boolean; order?: number }) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/timeline/tracks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, projectId: currentProjectId }),
      });
      if (!res.ok) {
        console.error("Update track failed:", await res.text());
        return;
      }
      await refetchTimeline();
    } catch (err) {
      console.error("Update track error:", err);
    }
  };

  const handleDeleteTimelineTrack = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/timeline/tracks/${id}${currentProjectId ? `?projectId=${currentProjectId}` : ""}`, { method: "DELETE" });
      if (!res.ok) {
        console.error("Delete track failed:", await res.text());
        return;
      }
      await refetchTimeline();
    } catch (err) {
      console.error("Delete track error:", err);
    }
  };

  const handleAddTimelineClip = async (opts: { trackId: string; sourceSceneId: string; sourceShotId: string; durationSec?: number; order?: number; label?: string }) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/timeline/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...opts, projectId: currentProjectId }),
      });
      if (!res.ok) {
        console.error("Add clip failed:", await res.text());
        return null;
      }
      const data = await res.json();
      await refetchTimeline();
      return data.item as ProjectTimelineItem;
    } catch (err) {
      console.error("Add clip error:", err);
      return null;
    }
  };

  const handleUpdateTimelineClip = async (id: string, patch: { trackId?: string; durationSec?: number; order?: number; label?: string }) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/timeline/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, projectId: currentProjectId }),
      });
      if (!res.ok) {
        console.error("Update clip failed:", await res.text());
        return;
      }
      await refetchTimeline();
    } catch (err) {
      console.error("Update clip error:", err);
    }
  };

  const handleReorderTimelineClips = async (trackId: string, orderedIds: string[]) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/timeline/items/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId, orderedIds, projectId: currentProjectId }),
      });
      if (!res.ok) {
        console.error("Reorder clips failed:", await res.text());
        return;
      }
      await refetchTimeline();
    } catch (err) {
      console.error("Reorder clips error:", err);
    }
  };

  const handleDeleteTimelineClip = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/timeline/items/${id}${currentProjectId ? `?projectId=${currentProjectId}` : ""}`, { method: "DELETE" });
      if (!res.ok) {
        console.error("Delete clip failed:", await res.text());
        return;
      }
      await refetchTimeline();
    } catch (err) {
      console.error("Delete clip error:", err);
    }
  };

  const handleAutoPopulateTimeline = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/timeline/auto-populate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProjectId }),
      });
      if (!res.ok) {
        console.error("Auto-populate failed:", await res.text());
        return 0;
      }
      const data = await res.json();
      await refetchTimeline();
      return Number(data.addedCount) || 0;
    } catch (err) {
      console.error("Auto-populate error:", err);
      return 0;
    }
  };

  const handleGenerateStoryboard = async (opts?: { sceneId?: string; scriptChunkOverride?: string; titleOverride?: string }) => {
    const scriptChunk = opts?.scriptChunkOverride ?? storyboardScript;
    if (!scriptChunk.trim()) return;
    setIsGeneratingStoryboard(true);
    try {
      const res = await fetch(`${API_BASE}/api/narrative/storyboard/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptChunk,
          ...((opts?.titleOverride ?? storyboardTitle) ? { title: opts?.titleOverride ?? storyboardTitle } : {}),
          panelCount: storyboardPanelCount,
          model: storyboardModel,
          ...(opts?.sceneId ? { sceneId: opts.sceneId } : {}),
        }),
      });
      if (!res.ok) {
        console.error("Storyboard gen failed:", await res.text());
        return;
      }
      await refetchStoryboards();
    } catch (err) {
      console.error("Storyboard gen error:", err);
    } finally {
      setIsGeneratingStoryboard(false);
    }
  };

  // Generate a storyboard page seeded from a specific scene. Prefills the
  // script chunk + title in the Storyboard view (so the writer can iterate
  // there) and immediately fires the generation with the scene's prose and
  // sceneId — no copy-paste required.
  const handleGenerateStoryboardForScene = async (scene: Scene) => {
    const sceneIdx = scenes.findIndex((s) => s.id === scene.id);
    const title = `Scene ${sceneIdx + 1} — ${scene.title}`;
    const scriptChunk = scene.prose || scene.title;
    setStoryboardScript(scriptChunk);
    setStoryboardTitle(title);
    // Jump the user to the Storyboard phase so they can see the result land.
    switchRow("storyboard");
    setSelectedScene(null);
    await handleGenerateStoryboard({
      sceneId: scene.id,
      scriptChunkOverride: scriptChunk,
      titleOverride: title,
    });
  };

  const handleExtractPanel = async (storyboard: StoryboardArtifact, panelIndex: number) => {
    try {
      const linkedSceneId = (storyboard as any).content?.sceneId as string | undefined;
      const res = await fetch(`${API_BASE}/api/narrative/storyboard/${storyboard.id}/extract-panel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          panelIndex,
          // Prefer the storyboard's linked scene if present; otherwise fall
          // back to fuzzy title match (backend will create a scene if neither
          // matches an existing one).
          ...(linkedSceneId ? { targetSceneId: linkedSceneId } : { targetSceneTitle: storyboard.title }),
          frameTitle: `Panel ${panelIndex + 1}`,
        }),
      });
      if (!res.ok) {
        console.error("Extract panel failed:", await res.text());
        return;
      }
      const data = await res.json();
      // Refresh scenes so the new frame is visible
      const scenesResp = await fetch(`${API_BASE}/api/narrative/interactions`);
      if (scenesResp.ok) {
        const interactionsData = await scenesResp.json();
        setScenes(mapScenesFromApi(Array.isArray(interactionsData) ? interactionsData : (interactionsData.interactions || [])));
      }
      console.log(`✅ Extracted panel ${panelIndex + 1} → frame ${data.frame?.id} in scene ${data.scene?.id}`);
    } catch (err) {
      console.error("Extract panel error:", err);
    }
  };

  const handleRunTestRenders = async () => {
    setIsRunningTestRenders(true);
    // Mark all slots as pending so the UI shows spinners
    setTestRenderResults(Object.fromEntries(TEST_RENDER_PROMPTS.map((t) => [t.key, null])));
    // Run all four in parallel
    const results = await Promise.allSettled(
      TEST_RENDER_PROMPTS.map(async (t) => {
        const res = await fetch(`${API_BASE}/api/narrative/visual/render`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: t.prompt,
            // Project's locked aspect ratio applied to all four test renders
            // — the bench is supposed to show the look at the user's actual
            // output format. Falls back to t.aspectRatio if no project ratio.
            aspectRatio: settings.aspectRatio || t.aspectRatio,
            // Project's locked image model — the bench previews the real
            // pipeline. Set it via the Style page's "Image model" picker.
            model: settings.imageModel || "nano-banana",
            // Pin to the current UI project so the test bench never falls
            // back to a stale server-side active project — that's how style
            // refs from the wrong project (or none) used to leak in.
            ...(currentProjectId ? { projectId: currentProjectId } : {}),
          }),
        });
        if (!res.ok) {
          const txt = await res.text();
          return { key: t.key, error: `Render failed: ${txt}` };
        }
        const data = await res.json();
        return {
          key: t.key,
          url: resolveImageUrl(data.imageUrl) || data.imageUrl,
          backend: data.backend,
          referencesUsed: data.referencesUsed,
          styleDirectiveApplied: data.styleDirectiveApplied,
          referencesAttached: data.referencesAttached,
          actualPromptSent: data.actualPromptSent,
        };
      }),
    );
    const next: typeof testRenderResults = {};
    for (const r of results) {
      if (r.status === "fulfilled") {
        const v = r.value as any;
        next[v.key] = v.error ? { url: "", error: v.error } : {
          url: v.url,
          backend: v.backend,
          referencesUsed: v.referencesUsed,
          styleDirectiveApplied: v.styleDirectiveApplied,
          referencesAttached: v.referencesAttached,
          actualPromptSent: v.actualPromptSent,
        };
      }
    }
    setTestRenderResults(next);
    setIsRunningTestRenders(false);
  };

  const handleToggleStylePin = async (asset: ProjectAsset) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/assets/${asset.id}/toggle-style-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Pin to the CURRENT project, not whatever the server thinks is
          // active. Without this, pins leak to the wrong project when the
          // server's isActive flag is stale.
          ...(currentProjectId ? { projectId: currentProjectId } : {}),
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.styleAssetIds)) setPinnedStyleAssetIds(data.styleAssetIds);
    } catch (err) {
      console.error("Style pin toggle error:", err);
    }
  };

  const handlePromoteAssetToPortrait = async (asset: ProjectAsset, entityId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/assets/${asset.id}/promote-to-portrait`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId }),
      });
      if (!res.ok) return;
      // Refresh entities so the new portrait shows up everywhere
      const entitiesResp = await fetch(`${API_BASE}/api/narrative/entities`);
      if (entitiesResp.ok) {
        const payload = await entitiesResp.json();
        const fresh = mapEntitiesFromApi(Array.isArray(payload) ? payload : payload.entities || []);
        setEntities(fresh);
      }
      await refetchAssets();
    } catch (err) {
      console.error("Asset promote error:", err);
    }
  };

  const handleSceneClick = (scene: Scene) => {
    setSelectedScene(scene);
    setSelectedEntity(null);
    setPortraitVariations(null);
    setFrameGenerationError(null);

    // Keep the carousel position in sync (for when the Production row is
    // active) WITHOUT forcing the row to "scenes". The Scene workbench is an
    // overlay that renders over whatever phase you're in, and the agent gets
    // the focused scene via the selectedScene fallback in the chat selection —
    // so a scene opened from Storyboard closes back to Storyboard, and one
    // opened from Production closes back to Production. Callers that DO want to
    // land on a specific phase (e.g. Screenplay "jump to scene in Production")
    // switchRow themselves before calling this.
    const sceneIndex = scenes.findIndex(s => s.id === scene.id);
    if (sceneIndex >= 0) {
      setCurrentIndex(sceneIndex);
    }
  };

  const handleSceneUpdate = async (updatedScene: Scene) => {
    // Update local state immediately for responsiveness
    setScenes(prev => prev.map(s => s.id === updatedScene.id ? updatedScene : s));
    setSelectedScene(updatedScene);
    setSelectedFrame(prev => prev?.scene.id === updatedScene.id ? { ...prev, scene: updatedScene } : prev);

    // Persist to API
    try {
      const response = await fetch(`${API_BASE}/api/narrative/interactions/${updatedScene.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: updatedScene.title,
          prose: updatedScene.prose,
          status: updatedScene.status,
          participantIds: updatedScene.participantIds,
          locationId: updatedScene.locationId,
          events: updatedScene.events,
          stateChanges: updatedScene.stateChanges,
          imageUrl: updatedScene.imageUrl,
          position: updatedScene.position,
          frames: updatedScene.frames,
          actId: updatedScene.actId,
        }),
      });

      if (!response.ok) {
        console.error('Failed to persist scene update:', await response.text());
      } else {
        const result = await response.json();
        if (result?.interaction) {
          const [persistedScene] = mapScenesFromApi([result.interaction]);
          if (persistedScene) {
            setScenes((prev) => prev.map((scene) => (scene.id === persistedScene.id ? persistedScene : scene)));
            setSelectedScene(persistedScene);
          }
        }
        // If shots were removed, the server may have pruned dangling timeline
        // clips. Refetch the timeline so the UI doesn't keep stale clips.
        if (typeof result?.timelineClipsRemoved === 'number' && result.timelineClipsRemoved > 0) {
          await refetchTimeline();
          console.log(`📽️ Pruned ${result.timelineClipsRemoved} timeline clip(s) referencing removed shot(s)`);
        }
        console.log(`📽️ Scene update persisted: ${updatedScene.title}`);
      }
    } catch (error) {
      console.error('Failed to persist scene update:', error);
    }
  };

  const handleSceneDiscuss = (scene: Scene) => {
    // Close scene detail and focus on scene in chat
    setSelectedScene(null);
    setInput(`Let's discuss the scene "${scene.title}". `);
    inputRef.current?.focus();
  };

  // Frame detail modal handlers
  const handleFrameClick = (scene: Scene, frame: SceneFrame, openedFrom: "scene" | "timeline" = "scene") => {
    setSelectedFrame({ scene, frameId: frame.id, openedFrom });
    setSelectedScene(null);
    setFrameGenerationError(null);
  };

  const handleFrameClose = () => {
    // Where to return depends on how the user opened the shot. From the
    // Scene workbench / Storyboard grid → reopen the parent scene. From
    // the timeline's shot library → just close, leaving the timeline view.
    if (selectedFrame) {
      const openedFrom = selectedFrame.openedFrom || "scene";
      const parentScene = scenes.find(s => s.id === selectedFrame.scene.id) || selectedFrame.scene;
      setSelectedFrame(null);
      if (openedFrom === "scene") {
        setSelectedScene(parentScene);
      }
    } else {
      setSelectedFrame(null);
    }
  };

  const handleBackToScene = () => {
    if (!selectedFrame) return;
    const parentScene = scenes.find(s => s.id === selectedFrame.scene.id) || selectedFrame.scene;
    setSelectedFrame(null);
    setSelectedScene(parentScene);
  };

  const handleFrameFieldUpdate = (scene: Scene, frameId: string, updates: Partial<SceneFrame>) => {
    const updatedFrames = (scene.frames || []).map(f =>
      f.id === frameId ? { ...f, ...updates } : f
    );
    const updatedScene = { ...scene, frames: updatedFrames };
    handleSceneUpdate(updatedScene);
  };

  const handleFrameDelete = (scene: Scene, frameId: string) => {
    const frames = (scene.frames || []).filter(f => f.id !== frameId);
    frames.forEach((f, i) => { f.position = i; });
    const updatedScene = { ...scene, frames };
    handleSceneUpdate(updatedScene);
    setSelectedFrame(null);
  };

  const handleDuplicateFrame = (scene: Scene, frameId: string) => {
    const frames = [...(scene.frames || [])];
    const sourceIdx = frames.findIndex(f => f.id === frameId);
    if (sourceIdx === -1) return;
    const source = frames[sourceIdx];
    const newFrame = {
      ...source,
      id: `frame_${scene.id}_${Date.now()}_dup`,
      title: source.title ? `${source.title} (copy)` : undefined,
    };
    frames.splice(sourceIdx + 1, 0, newFrame);
    frames.forEach((f, i) => { f.position = i; });
    const updatedScene = { ...scene, frames };
    handleSceneUpdate(updatedScene);
    setSelectedFrame({ scene: updatedScene, frameId: newFrame.id });
  };

  const handlePreviousFrame = () => {
    if (!selectedFrame) return;
    const frames = selectedFrame.scene.frames || [];
    const currentIdx = frames.findIndex(f => f.id === selectedFrame.frameId);
    if (currentIdx > 0) {
      setSelectedFrame({ ...selectedFrame, frameId: frames[currentIdx - 1].id });
    }
  };

  const handleJumpToFrame = (frameId: string) => {
    if (!selectedFrame) return;
    const frames = selectedFrame.scene.frames || [];
    if (frames.some(f => f.id === frameId)) {
      setSelectedFrame({ ...selectedFrame, frameId });
    }
  };

  const handleNextFrame = () => {
    if (!selectedFrame) return;
    const frames = selectedFrame.scene.frames || [];
    const currentIdx = frames.findIndex(f => f.id === selectedFrame.frameId);
    if (currentIdx < frames.length - 1) {
      setSelectedFrame({ ...selectedFrame, frameId: frames[currentIdx + 1].id });
    }
  };

  // Single frame content generation
  const [generatingFrameContentId, setGeneratingFrameContentId] = useState<string | null>(null);

  const handleGenerateSingleFrame = async (scene: Scene, frameId: string, guidance?: string) => {
    setGeneratingFrameContentId(frameId);
    setFrameGenerationError(null);
    try {
      const response = await fetch(`${API_BASE}/api/narrative/interactions/${scene.id}/frames/${frameId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProjectId,
          guidance,
          visualStylePrompt: settings.visualStylePrompt,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to generate frame content');
      }

      const result = await response.json();
      if (result?.interaction) {
        const [persistedScene] = mapScenesFromApi([result.interaction]);
        if (persistedScene) {
          setScenes(prev => prev.map(s => s.id === persistedScene.id ? persistedScene : s));
          setSelectedScene(prev => prev?.id === persistedScene.id ? persistedScene : prev);
          setSelectedFrame(prev => prev?.scene.id === persistedScene.id ? { ...prev, scene: persistedScene } : prev);
        }
      }
      console.log(`🎬 Single frame content generated for scene "${scene.title}"`);

      // Auto-chain: generate image after content generation
      if (result?.interaction) {
        const [freshScene] = mapScenesFromApi([result.interaction]);
        if (freshScene) {
          const generatedFrame = (freshScene.frames || []).find(f => f.id === frameId);
          if (generatedFrame) {
            // Check sequential enforcement: previous frame must have image
            const fIdx = (freshScene.frames || []).findIndex(f => f.id === frameId);
            const prevFrame = fIdx > 0 ? (freshScene.frames || [])[fIdx - 1] : null;
            const canGenImage = fIdx === 0 || (prevFrame && prevFrame.imageUrl);
            if (canGenImage) {
              console.log(`🖼️ Auto-chaining image generation for frame "${generatedFrame.title}"`);
              // Small delay so UI updates first
              setTimeout(() => {
                handleGenerateFrameImage(freshScene, generatedFrame);
              }, 300);
            }
          }
        }
      }
    } catch (error: any) {
      const message = error?.message || 'Shot content generation failed';
      setFrameGenerationError(message);
      console.error('Single frame content generation failed:', error);
    } finally {
      setGeneratingFrameContentId(null);
    }
  };

  // Entity portrait generation state
  const [additionalRefs, setAdditionalRefs] = useState<string[]>([]);
  const [refPickerOpen, setRefPickerOpen] = useState(false);
  const [isGeneratingPortrait, setIsGeneratingPortrait] = useState(false);
  const [portraitVariations, setPortraitVariations] = useState<{
    entityId: string;
    images: string[]; // Display URLs (data URLs or resolved server URLs)
    serverUrls: string[]; // Server URLs for persistence
    mimeTypes: string[]
  } | null>(null);
  const [isGeneratingVariations, setIsGeneratingVariations] = useState(false);
  const [variationRunGeneratedCount, setVariationRunGeneratedCount] = useState(0);
  const autoPortraitQueueRef = useRef<string[]>([]);
  const autoPortraitRunningRef = useRef(false);
  const entitiesRef = useRef<Entity[]>([]);
  const autoSceneQueueRef = useRef<string[]>([]);
  const autoSceneGeneratingRef = useRef(false);
  const scenesRef = useRef<Scene[]>([]);

  useEffect(() => { entitiesRef.current = entities; }, [entities]);
  useEffect(() => { scenesRef.current = scenes; }, [scenes]);

  // Generate a labeled gallery image for an entity. Uses /render so the
  // project style locks in + the entity portrait is attached as a reference.
  // Appends to imageGallery via PUT.
  const handleAddEntityGalleryImage = async (entity: Entity, label: string, prompt: string) => {
    if (!label.trim() || !prompt.trim()) return;
    try {
      const refUrls = entity.referenceImage ? [entity.referenceImage] : [];
      const renderRes = await fetch(`${API_BASE}/api/narrative/visual/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          referenceUrls: refUrls,
          aspectRatio: "3:4",
        }),
      });
      if (!renderRes.ok) {
        console.error("Gallery render failed:", await renderRes.text());
        return;
      }
      const renderData = await renderRes.json();
      const newEntry = {
        id: `gimg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        url: renderData.imageUrl,
        label: label.trim(),
        prompt: prompt.trim(),
        createdAt: new Date().toISOString(),
      };
      const existing = entity.imageGallery || [];
      const nextGallery = [...existing, newEntry];
      await fetch(`${API_BASE}/api/narrative/entity/${entity.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: { imageGallery: nextGallery } }),
      });
      updateEntityLocally(entity.id, { imageGallery: nextGallery as any });
    } catch (err) {
      console.error("Add gallery image error:", err);
    }
  };

  // Generate a character sheet — multi-panel artifact via GPT Image. Uses
  // the existing artifact + render flow; the resulting artifact is image-
  // first so it shows up under Storyboard/Production artifacts too.
  const handleGenerateCharacterSheet = async (entity: Entity) => {
    try {
      // Create an artifact first
      const createRes = await fetch(`${API_BASE}/api/narrative/artifacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${entity.name} — Character Sheet`,
          format: "casting_sheet",
          description: `2x3 grid of head-and-shoulders headshots of ${entity.name} in different moods: smiling, scowling, weary, focused, laughing, determined.`,
          relatedEntityNames: [entity.name],
        }),
      });
      if (!createRes.ok) return;
      const created = await createRes.json();
      const artifactId = created?.artifact?.id;
      if (!artifactId) return;
      // Generate its image
      await fetch(`${API_BASE}/api/narrative/artifacts/${artifactId}/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Character sheet for ${entity.name}. 2x3 grid of head-and-shoulders headshots, same actor in each panel, varied expressions: SMILING (warm), SCOWLING (intense), WEARY (low light), FOCUSED (neutral studio), LAUGHING (genuine), DETERMINED (resolute). Clean studio backdrop. Small label below each panel in white sans-serif. Use reference image only for facial identity; vary expression and lighting per panel.`,
          referenceEntityNames: [entity.name],
          aspectRatio: "2:3",
          model: "gpt-image",
        }),
      });
      // Refresh artifacts
      const artifactsResp = await fetch(`${API_BASE}/api/narrative/artifacts`);
      if (artifactsResp.ok) {
        const payload = await artifactsResp.json();
        const list: Artifact[] = Array.isArray(payload?.artifacts) ? payload.artifacts : [];
        setArtifacts(list.map((a) => ({
          ...a,
          primaryImage: a.primaryImage ? { ...a.primaryImage, url: resolveImageUrl(a.primaryImage.url) || a.primaryImage.url } : undefined,
        })));
      }
    } catch (err) {
      console.error("Generate character sheet error:", err);
    }
  };

  // Persist + locally apply entity field updates. Used by the new entity
  // workbench inline-edit on blur.
  const handleSaveEntityFields = async (entityId: string, updates: Partial<Entity>) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/entity/${entityId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) {
        console.error("Save entity failed:", await res.text());
        return;
      }
      updateEntityLocally(entityId, updates);
    } catch (err) {
      console.error("Save entity error:", err);
    }
  };

  const updateEntityLocally = (entityId: string, updates: Partial<Entity>) => {
    setEntities((prev) => prev.map((entry) => (
      entry.id === entityId ? { ...entry, ...updates } : entry
    )));
    setSelectedEntity((prev) => {
      if (!prev || prev.entity.id !== entityId) return prev;
      return {
        ...prev,
        entity: {
          ...prev.entity,
          ...updates,
        },
      };
    });
  };

  const hydratePortraitVariationsForEntity = (entity: Entity) => {
    const savedServerUrls = normalizePortraitVariationUrls(entity.portraitVariations);
    if (savedServerUrls.length === 0) {
      setPortraitVariations(null);
      return;
    }
    const savedDisplayUrls = savedServerUrls
      .map((url) => resolveImageUrl(url))
      .filter((url): url is string => Boolean(url));
    setPortraitVariations({
      entityId: entity.id,
      images: savedDisplayUrls,
      serverUrls: savedServerUrls,
      mimeTypes: savedServerUrls.map(() => "image/jpeg"),
    });
  };

  const generatePortraitForEntity = async (entity: Entity, options?: { silent?: boolean; customPrompt?: string }) => {
    const silent = options?.silent ?? false;
    if (!silent) setIsGeneratingPortrait(true);
    try {
      const allRefUrls = Array.from(new Set([...collectEntityRefUrls(entity, { includeSelf: true }), ...additionalRefs]));
      const relContext = buildRelationshipContext(entity);
      const enrichedDescription = relContext ? `${entity.description || ""}${relContext}` : entity.description;
      const response = await fetch(`${API_BASE}/api/narrative/visual/entity/${entity.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Pin to the current project so style refs come from the right
          // styleProfile, not the server's stale active project.
          ...(currentProjectId ? { projectId: currentProjectId } : {}),
          entityData: {
            id: entity.id,
            name: entity.name,
            type: entity.type,
            description: enrichedDescription,
            traits: entity.traits,
          },
          aspectRatio: '1:1',
          imageSize: '1K',
          visualStylePrompt: settings.visualStylePrompt,
          customPrompt: options?.customPrompt,
          // Manual generations should ignore prior cached style outputs.
          forceRegenerate: !silent,
          ...(allRefUrls.length > 0 ? { additionalRefUrls: allRefUrls } : {}),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate portrait');
      }

      const result = await response.json();

      // Use data URL for immediate display (works across ports)
      const displayUrl = result.image
        ? `data:${result.mimeType};base64,${result.image}`
        : (result.imageUrl ? `${API_BASE}${result.imageUrl}` : undefined);

      // Use server-relative URL for persistence (smaller, survives reloads)
      const persistUrl = result.imageUrl || null;

      if (displayUrl) {
        // Update local state immediately with display URL
        updateEntityLocally(entity.id, { referenceImage: displayUrl });

        // Persist the server URL to the entity on the server
        if (persistUrl) {
          try {
            const persistResponse = await fetch(`${API_BASE}/api/narrative/entity/${entity.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                updates: {
                  referenceImage: persistUrl,
                  imageUrl: persistUrl,
                  ...(options?.customPrompt ? { portraitPrompt: options.customPrompt } : {}),
                },
              }),
            });
            if (persistResponse.ok) {
              const persistResult = await persistResponse.json();
              if (persistResult?.visualInvalidation?.sceneCount > 0 || persistResult?.visualInvalidation?.frameCount > 0) {
                await refreshScenesFromApi();
                await refreshSessionStatus();
              }
            }
            console.log('🎨 Portrait persisted to entity:', entity.name);
          } catch (e) {
            console.error('Failed to persist portrait to entity:', e);
          }
        }
      }

      console.log('🎨 Portrait generated for:', entity.name);
    } catch (error: any) {
      console.error('Portrait generation failed:', error);
    } finally {
      if (!silent) {
        setIsGeneratingPortrait(false);
        setAdditionalRefs([]);
      }
    }
  };

  const enqueueAutoPortraits = (entityIds: string[]) => {
    const unique = entityIds.filter((id) => !autoPortraitQueueRef.current.includes(id));
    if (unique.length === 0) return;
    autoPortraitQueueRef.current.push(...unique);
    void runAutoPortraitQueue();
  };

  const runAutoPortraitQueue = async () => {
    if (autoPortraitRunningRef.current) return;
    autoPortraitRunningRef.current = true;
    try {
      while (autoPortraitQueueRef.current.length > 0) {
        const entityId = autoPortraitQueueRef.current.shift();
        if (!entityId) continue;
        const entity = entitiesRef.current.find(e => e.id === entityId);
        if (!entity) continue;
        if (entity.referenceImage) continue;
        if (!["character", "creature", "location", "object", "artifact", "organization", "faction"].includes(entity.type)) continue;
        await generatePortraitForEntity(entity, { silent: true });
      }
    } finally {
      autoPortraitRunningRef.current = false;
    }
  };

  // Silent scene image generation — no UI state changes
  const generateSceneImageSilently = async (scene: Scene) => {
    try {
      const outputIntent = normalizeStudioOutputIntent(settings.outputIntent);
      const resolvedTextPolicy = resolveStudioTextPolicy(outputIntent, settings.textPolicy);
      const response = await fetch(`${API_BASE}/api/narrative/visual/scene/${scene.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aspectRatio: '16:9',
          imageSize: '2K',
          usePro: true,
          visualStylePrompt: settings.visualStylePrompt,
          strictCharacterRefs: false,
          includeCharacterAlternates: false,
          enableIdentityRepair: true,
          identityRepairPasses: 1,
          maxObjectRefs: 6,
          maxNarrativePromptChars: 1400,
          maxFrameAnchorChars: 320,
          outputIntent,
          textPolicy: resolvedTextPolicy.policy,
          sceneData: {
            id: scene.id,
            title: scene.title,
            prose: scene.prose,
            participantIds: scene.participantIds,
            locationId: scene.locationId,
            frames: scene.frames,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate scene image');
      }

      const result = await response.json();
      const imageUrl = result.image
        ? `data:${result.mimeType};base64,${result.image}`
        : (result.imageUrl ? `${API_BASE}${result.imageUrl}` : undefined);
      if (imageUrl) {
        handleSceneUpdate({ ...scene, imageUrl });
        console.log('🎨 Auto-generated scene image for:', scene.title);
      }
    } catch (error: any) {
      console.error(`Auto scene image generation failed for "${scene.title}":`, error?.message || error);
    }
  };

  const enqueueAutoSceneImages = (sceneIds: string[]) => {
    const unique = sceneIds.filter((id) => !autoSceneQueueRef.current.includes(id));
    if (unique.length === 0) return;
    autoSceneQueueRef.current.push(...unique);
    void runAutoSceneImageQueue();
  };

  const runAutoSceneImageQueue = async () => {
    if (autoSceneGeneratingRef.current) return;
    autoSceneGeneratingRef.current = true;
    try {
      // Wait for portrait queue to finish first — scenes need character refs
      while (autoPortraitRunningRef.current) {
        await new Promise((r) => setTimeout(r, 500));
      }
      while (autoSceneQueueRef.current.length > 0) {
        const sceneId = autoSceneQueueRef.current.shift();
        if (!sceneId) continue;
        const scene = scenesRef.current.find((s) => s.id === sceneId);
        if (!scene) continue;
        if (scene.imageUrl) continue;
        await generateSceneImageSilently(scene);
      }
    } finally {
      autoSceneGeneratingRef.current = false;
    }
  };

  // Generate portrait for an entity using Nano Banana
  const handleGenerateEntityPortrait = async (entity: Entity, customPrompt?: string) => {
    await generatePortraitForEntity(entity, { silent: false, customPrompt });
  };

  // Generate portrait variations in parallel
  const handleGeneratePortraitVariations = async (entity: Entity, customPrompt?: string, count: number = 4) => {
    setIsGeneratingVariations(true);
    setVariationRunGeneratedCount(0);

    const persistedServerUrls = normalizePortraitVariationUrls(entity.portraitVariations);
    const persistedDisplayUrls = persistedServerUrls
      .map((url) => resolveImageUrl(url))
      .filter((url): url is string => Boolean(url));

    // Auto-collect entity's own image + related entity images + manual refs
    const allRefUrls = Array.from(new Set([...collectEntityRefUrls(entity), ...additionalRefs]));
    const relContext = buildRelationshipContext(entity);
    const enrichedDescription = relContext ? `${entity.description || ""}${relContext}` : entity.description;
    console.log(`[Variations] Generating ${count} variations for ${entity.name}`);
    console.log(`[Variations] ${allRefUrls.length} reference URLs:`, allRefUrls);
    console.log(`[Variations] Enriched description:`, enrichedDescription);

    try {
      const images: string[] = [...persistedDisplayUrls];
      const serverUrls: string[] = [...persistedServerUrls];
      const mimeTypes: string[] = [...persistedServerUrls.map(() => "image/jpeg")];
      setPortraitVariations({ entityId: entity.id, images: [...images], serverUrls: [...serverUrls], mimeTypes: [...mimeTypes] });

      // Fire all variation requests in parallel, update UI as each resolves
      let completed = 0;
      const generateOne = async (variationIndex: number) => {
        const response = await fetch(`${API_BASE}/api/narrative/visual/entity/${entity.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityData: {
              id: entity.id,
              name: entity.name,
              type: entity.type,
              description: enrichedDescription,
              traits: entity.traits,
            },
            aspectRatio: '1:1',
            imageSize: '1K',
            variation: variationIndex,
            forceRegenerate: true,
            visualStylePrompt: settings.visualStylePrompt,
            customPrompt,
            ...(allRefUrls.length > 0 ? { additionalRefUrls: allRefUrls } : {}),
          }),
        });

        if (response.ok) {
          const result = await response.json();
          const displayUrl = result.image
            ? `data:${result.mimeType};base64,${result.image}`
            : resolveImageUrl(result.imageUrl);
          if (displayUrl) {
            images.push(displayUrl);
            serverUrls.push(typeof result.imageUrl === "string" ? result.imageUrl : "");
            mimeTypes.push(result.mimeType || "image/jpeg");
          }
        }

        completed++;
        setVariationRunGeneratedCount(completed);
        setPortraitVariations({ entityId: entity.id, images: [...images], serverUrls: [...serverUrls], mimeTypes: [...mimeTypes] });
      };

      await Promise.all(
        Array.from({ length: count }, (_, i) => generateOne(i + 1))
      );

      const mergedPersistentUrls = Array.from(
        new Set(serverUrls.filter((url) => typeof url === "string" && url.length > 0))
      );
      if (mergedPersistentUrls.length > 0) {
        try {
          await fetch(`${API_BASE}/api/narrative/entity/${entity.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              updates: {
                portraitVariations: mergedPersistentUrls,
                ...(customPrompt ? { portraitPrompt: customPrompt } : {}),
              },
            }),
          });
          updateEntityLocally(entity.id, { portraitVariations: mergedPersistentUrls });
        } catch (persistError) {
          console.error("Failed to persist portrait variations library:", persistError);
        }
      }

      console.log(`🎨 Generated ${count} portrait variations for:`, entity.name);
    } catch (error: any) {
      console.error('Portrait variations generation failed:', error);
    } finally {
      setIsGeneratingVariations(false);
      setAdditionalRefs([]);
    }
  };

  // Select a specific variation as the canonical portrait
  const handleSelectPortraitVariation = async (entity: Entity, displayUrl: string, index: number) => {
    // Update local state with display URL immediately
    updateEntityLocally(entity.id, { referenceImage: displayUrl });

    // Persist the server URL to the entity
    const serverUrl = portraitVariations?.serverUrls[index];
    if (serverUrl) {
      try {
        const persistResponse = await fetch(`${API_BASE}/api/narrative/entity/${entity.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updates: {
              referenceImage: serverUrl,
              imageUrl: serverUrl,
            },
          }),
        });
        if (persistResponse.ok) {
          const persistResult = await persistResponse.json();
          if (persistResult?.visualInvalidation?.sceneCount > 0 || persistResult?.visualInvalidation?.frameCount > 0) {
            await refreshScenesFromApi();
            await refreshSessionStatus();
          }
        }
        console.log('✅ Selected portrait variation persisted for:', entity.name);
      } catch (e) {
        console.error('Failed to persist selected portrait:', e);
      }
    }

    // Keep variation library open so user can inspect and switch between options.
  };

  // Hide portrait variation picker for current detail session.
  const handleClearPortraitVariations = () => {
    setPortraitVariations(null);
  };

  // Promote a labeled gallery image to be the entity's primary portrait.
  // The previous primary is preserved as a "previous primary" gallery entry.
  // Promote an arbitrary image URL (from a chat-gallery tile, for example)
  // to be the entity's primary portrait. Server-side handles preserving the
  // previous primary as a "previous primary" gallery entry.
  const handleSetPrimaryFromUrl = async (entityId: string, imageUrl: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/entity/${entityId}/set-primary-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: currentProjectId, imageUrl }),
      });
      if (!res.ok) throw new Error(await res.text());
      const entitiesResp = await fetch(`${API_BASE}/api/narrative/entities`);
      if (entitiesResp.ok) {
        const payload = await entitiesResp.json();
        const fresh = mapEntitiesFromApi(Array.isArray(payload) ? payload : (payload.entities || []));
        setEntities(fresh);
        setSelectedEntity(prev => {
          if (!prev) return prev;
          const updated = fresh.find(e => e.id === prev.entity.id);
          return updated ? { ...prev, entity: updated } : prev;
        });
      }
    } catch (err) {
      console.error('Failed to set primary portrait from chat tile:', err);
    }
  };

  const handlePromoteGalleryImage = async (entity: Entity, imageId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/entity/${entity.id}/gallery/${imageId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: currentProjectId }),
      });
      if (!res.ok) throw new Error(await res.text());
      // Refetch the entire entity list so primary portrait + gallery + carousel update
      const entitiesResp = await fetch(`${API_BASE}/api/narrative/entities`);
      if (entitiesResp.ok) {
        const payload = await entitiesResp.json();
        const fresh = mapEntitiesFromApi(Array.isArray(payload) ? payload : (payload.entities || []));
        setEntities(fresh);
        setSelectedEntity(prev => {
          if (!prev) return prev;
          const updated = fresh.find(e => e.id === prev.entity.id);
          return updated ? { ...prev, entity: updated } : prev;
        });
      }
    } catch (err) {
      console.error('Failed to promote gallery image:', err);
    }
  };

  // Remove a single labeled gallery image from an entity.
  const handleRemoveGalleryImage = async (entity: Entity, imageId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/entity/${entity.id}/gallery/${imageId}?projectId=${encodeURIComponent(currentProjectId || '')}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await res.text());
      const entitiesResp = await fetch(`${API_BASE}/api/narrative/entities`);
      if (entitiesResp.ok) {
        const payload = await entitiesResp.json();
        const fresh = mapEntitiesFromApi(Array.isArray(payload) ? payload : (payload.entities || []));
        setEntities(fresh);
        setSelectedEntity(prev => {
          if (!prev) return prev;
          const updated = fresh.find(e => e.id === prev.entity.id);
          return updated ? { ...prev, entity: updated } : prev;
        });
      }
    } catch (err) {
      console.error('Failed to remove gallery image:', err);
    }
  };

  const handleRemoveVariation = async (entity: Entity, index: number) => {
    if (!portraitVariations || portraitVariations.entityId !== entity.id) return;

    const newImages = portraitVariations.images.filter((_, i) => i !== index);
    const newServerUrls = portraitVariations.serverUrls.filter((_, i) => i !== index);
    const newMimeTypes = portraitVariations.mimeTypes.filter((_, i) => i !== index);

    if (newImages.length === 0) {
      setPortraitVariations(null);
    } else {
      setPortraitVariations({ entityId: entity.id, images: newImages, serverUrls: newServerUrls, mimeTypes: newMimeTypes });
    }

    // Persist the updated list to the entity
    const persistUrls = newServerUrls.filter(url => typeof url === "string" && url.length > 0);
    try {
      await fetch(`${API_BASE}/api/narrative/entity/${entity.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: { portraitVariations: persistUrls } }),
      });
      updateEntityLocally(entity.id, { portraitVariations: persistUrls });
    } catch (e) {
      console.error("Failed to persist variation removal:", e);
    }
  };

  // Generate image for a scene using Nano Banana
  const handleGenerateImage = async (scene: Scene, customPrompt?: string) => {
    setIsGeneratingImage(true);
    setFrameGenerationError(null);
    try {
      const outputIntent = normalizeStudioOutputIntent(settings.outputIntent);
      const resolvedTextPolicy = resolveStudioTextPolicy(outputIntent, settings.textPolicy);
      const response = await fetch(`${API_BASE}/api/narrative/visual/scene/${scene.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aspectRatio: '16:9',
          imageSize: '2K',
          usePro: true,
          visualStylePrompt: settings.visualStylePrompt,
          strictCharacterRefs: true,
          includeCharacterAlternates: false,
          enableIdentityRepair: true,
          identityRepairPasses: 2,
          maxObjectRefs: 6,
          maxNarrativePromptChars: 1400,
          maxFrameAnchorChars: 320,
          outputIntent,
          textPolicy: resolvedTextPolicy.policy,
          prompt: customPrompt,
          // Pass scene data directly since scenes are stored in React state
          sceneData: {
            id: scene.id,
            title: scene.title,
            prose: scene.prose,
            participantIds: scene.participantIds,
            locationId: scene.locationId,
            frames: scene.frames,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        if (error?.code === "MISSING_REQUIRED_CHARACTER_REFERENCES") {
          const missing = Array.isArray(error?.missingCharacters)
            ? error.missingCharacters.map((entry: any) => entry?.name).filter(Boolean)
            : [];
          throw new Error(
            missing.length > 0
              ? `Generate/select portraits for required characters first: ${missing.join(", ")}`
              : "Scene generation blocked: missing required character references."
          );
        }
        throw new Error(error.error || 'Failed to generate image');
      }

      const result = await response.json();
      const diagnostics = result?.referenceDiagnostics as SceneGenerationReferenceDiagnostics | undefined;
      const participantDiagnostics = Array.isArray(diagnostics?.participants) ? diagnostics?.participants : [];
      const unresolvedParticipantNames = participantDiagnostics
        .filter((entry) => !entry?.resolved)
        .map((entry) => entry?.name)
        .filter((name): name is string => typeof name === "string" && name.length > 0);
      const locationDiagnostic = diagnostics?.location;

      setSceneGenerationDiagnostics((prev) => ({
        ...prev,
        [scene.id]: {
          sceneId: scene.id,
          generatedAt: Date.now(),
          referenceCount: typeof result?.referenceCount === "number" ? result.referenceCount : 0,
          model: typeof result?.model === "string" ? result.model : undefined,
          outputIntent:
            typeof result?.outputIntent === "string"
              ? normalizeStudioOutputIntent(result.outputIntent)
              : undefined,
          textPolicy:
            typeof result?.textPolicy === "string"
              ? normalizeStudioTextPolicy(result.textPolicy)
              : undefined,
          textPolicyLocked: typeof result?.textPolicyLocked === "boolean" ? result.textPolicyLocked : undefined,
          identityRepair: result?.identityRepair,
          unresolvedParticipantNames,
          locationResolved: typeof locationDiagnostic?.resolved === "boolean" ? locationDiagnostic.resolved : null,
          locationName: typeof locationDiagnostic?.name === "string" ? locationDiagnostic.name : undefined,
          diagnostics,
          submittedReferences: result?.submittedReferences as SceneSubmittedReferences | undefined,
          actualReferencesUsed: result?.actualReferencesUsed as SceneActualReferencesUsed | undefined,
          promptStrategyVersion: typeof result?.promptStrategyVersion === "string" ? result.promptStrategyVersion : undefined,
          promptPreview: typeof result?.prompt === "string" ? result.prompt : undefined,
          promptLength:
            typeof result?.promptLength === "number"
              ? result.promptLength
              : (typeof result?.prompt === "string" ? result.prompt.length : undefined),
        },
      }));

      // Update the scene with the generated image
      // Use data URL since API is on different port than frontend
      const imageUrl = result.image
        ? `data:${result.mimeType};base64,${result.image}`
        : (result.imageUrl ? `${API_BASE}${result.imageUrl}` : undefined);
      const updatedScene = {
        ...scene,
        imageUrl,
      };
      handleSceneUpdate(updatedScene);

      console.log('🎨 Image generated:', result.referenceCount, 'references used');
      if (unresolvedParticipantNames.length > 0) {
        console.warn("⚠️ Scene generation missing participant references:", unresolvedParticipantNames.join(", "));
      }
    } catch (error: any) {
      console.error('Image generation failed:', error);
      setFrameGenerationError(error?.message || "Scene image generation failed");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateFrames = async (scene: Scene, count: number) => {
    setIsGeneratingFrames(true);
    setFrameGenerationError(null);
    try {
      const response = await fetch(`${API_BASE}/api/narrative/interactions/${scene.id}/frames`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count,
          visualStylePrompt: settings.visualStylePrompt,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate frames");
      }

      const result = await response.json();
      const mappedFrames: SceneFrame[] = (result.frames || []).map((frame: any, idx: number) => ({
        id: frame.id,
        position: frame.position ?? idx,
        title: frame.title,
        description: frame.description,
        visual_beat: frame.visual_beat || frame.visualBeat,
        participantIds: frame.participantIds || [],
        participantRefs: frame.participantRefs || [],
        locationId: frame.locationId,
        imageUrl: resolveImageUrl(frame.imageUrl),
        shotType: frame.shotType,
        camera: frame.camera,
        mood: frame.mood,
        visual_direction: frame.visual_direction || undefined,
        appearance_notes: frame.appearance_notes || undefined,
        visualDirty: Boolean(frame.visualDirty),
        visualDirtyReason: frame.visualDirtyReason,
        visualDirtyAt: frame.visualDirtyAt,
      }));

      let updatedScene: Scene = {
        ...scene,
        frames: mappedFrames.length > 0 ? mappedFrames.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) : [],
      };

      if (result?.interaction) {
        const [mappedScene] = mapScenesFromApi([result.interaction]);
        if (mappedScene) {
          updatedScene = {
            ...mappedScene,
            frames: mappedFrames.length > 0 ? mappedFrames.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) : mappedScene.frames,
          };
        }
      }

      setScenes(prev => prev.map(s => s.id === scene.id ? updatedScene : s));
      setSelectedScene(updatedScene);
      refreshSessionStatus();

      // Auto-chain: sequentially generate images for each frame
      const framesToImage = (updatedScene.frames || []).filter(f => !f.imageUrl);
      if (framesToImage.length > 0) {
        setBatchImageProgress({ current: 0, total: framesToImage.length });
        let currentScene = updatedScene;
        for (let i = 0; i < framesToImage.length; i++) {
          const frame = framesToImage[i];
          setBatchImageProgress({ current: i + 1, total: framesToImage.length });
          setGeneratingFrameId(frame.id);
          try {
            const outputIntent = normalizeStudioOutputIntent(settings.outputIntent);
            const resolvedTextPolicy = resolveStudioTextPolicy(outputIntent, settings.textPolicy);
            const imgResponse = await fetch(`${API_BASE}/api/narrative/visual/frame/${currentScene.id}/${frame.id}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                aspectRatio: "16:9",
                imageSize: "2K",
                usePro: true,
                visualStylePrompt: settings.visualStylePrompt,
                outputIntent,
                textPolicy: resolvedTextPolicy.policy,
                strictCharacterRefs: true,
                includeCharacterAlternates: false,
                enableIdentityRepair: true,
                identityRepairPasses: 3,
                maxObjectRefs: 6,
                maxNarrativePromptChars: 260,
                maxFrameAnchorChars: 300,
                sceneData: {
                  id: currentScene.id,
                  title: currentScene.title,
                  prose: currentScene.prose,
                  participantIds: currentScene.participantIds,
                  locationId: currentScene.locationId,
                  frames: currentScene.frames,
                },
                frameData: frame,
              }),
            });

            if (imgResponse.ok) {
              const imgResult = await imgResponse.json();
              if (imgResult?.interaction) {
                const [freshScene] = mapScenesFromApi([imgResult.interaction]);
                if (freshScene) {
                  currentScene = freshScene;
                  setScenes(prev => prev.map(s => s.id === freshScene.id ? freshScene : s));
                  setSelectedScene(prev => prev?.id === freshScene.id ? freshScene : prev);
                }
              } else if (imgResult?.imageUrl) {
                const resolvedUrl = resolveImageUrl(imgResult.imageUrl);
                const updatedFrames = (currentScene.frames || []).map(f =>
                  f.id === frame.id ? { ...f, imageUrl: resolvedUrl } : f
                );
                currentScene = { ...currentScene, frames: updatedFrames };
                setScenes(prev => prev.map(s => s.id === currentScene.id ? currentScene : s));
                setSelectedScene(prev => prev?.id === currentScene.id ? currentScene : prev);
              }
              console.log(`🖼️ Batch image ${i + 1}/${framesToImage.length} generated for "${frame.title}"`);
            } else {
              console.error(`Batch image ${i + 1}/${framesToImage.length} failed for "${frame.title}":`, imgResponse.status);
            }
          } catch (imgError) {
            console.error(`Batch image ${i + 1}/${framesToImage.length} error for "${frame.title}":`, imgError);
          }
        }
        setGeneratingFrameId(null);
        setBatchImageProgress(null);
      }
    } catch (error) {
      console.error("Frame generation failed:", error);
    } finally {
      setIsGeneratingFrames(false);
      setBatchImageProgress(null);
    }
  };

  const handleGenerateFrameImage = async (scene: Scene, frame: SceneFrame, customPrompt?: string) => {
    setGeneratingFrameId(frame.id);
    setFrameGenerationError(null);
    try {
      const outputIntent = normalizeStudioOutputIntent(settings.outputIntent);
      const resolvedTextPolicy = resolveStudioTextPolicy(outputIntent, settings.textPolicy);
      const response = await fetch(`${API_BASE}/api/narrative/visual/frame/${scene.id}/${frame.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aspectRatio: "16:9",
          imageSize: "2K",
          usePro: true,
          visualStylePrompt: settings.visualStylePrompt,
          outputIntent,
          textPolicy: resolvedTextPolicy.policy,
          strictCharacterRefs: true,
          includeCharacterAlternates: false,
          enableIdentityRepair: true,
          identityRepairPasses: 3,
          maxObjectRefs: 6,
          maxNarrativePromptChars: 260,
          maxFrameAnchorChars: 300,
          prompt: customPrompt,
          sceneData: {
            id: scene.id,
            title: scene.title,
            prose: scene.prose,
            participantIds: scene.participantIds,
            locationId: scene.locationId,
            frames: scene.frames,
          },
          frameData: frame,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        if (response.status === 409 && error?.code === "FRAME_ORDER_REQUIRED") {
          const nextRequired = error?.nextRequiredFrameTitle || error?.nextRequiredFrameId || "the previous frame";
          throw new Error(`Generate ${nextRequired} first to preserve continuity.`);
        }
        if (response.status === 409 && error?.code === "MISSING_REQUIRED_CHARACTER_REFERENCES") {
          const missing = Array.isArray(error?.missingCharacters)
            ? error.missingCharacters
                .map((entry: any) => (typeof entry?.name === "string" ? entry.name : entry?.id))
                .filter((name: any): name is string => typeof name === "string" && name.length > 0)
            : [];
          const missingLabel = missing.length > 0 ? missing.join(", ") : "one or more required characters";
          throw new Error(`Missing character reference image for ${missingLabel}. Generate/select portrait references first.`);
        }
        throw new Error(error.error || "Failed to generate frame image");
      }

      const result = await response.json();
      const imageUrl = result.image
        ? `data:${result.mimeType};base64,${result.image}`
        : (result.imageUrl ? `${API_BASE}${result.imageUrl}` : undefined);
      const diagnostics = (result?.referenceDiagnostics || result?.diagnostics || null) as SceneGenerationDiagnostics["diagnostics"];
      const participantDiagnostics = diagnostics?.participants || [];
      const unresolvedParticipantNames = participantDiagnostics
        .filter((entry) => !entry?.resolved)
        .map((entry) => entry?.name)
        .filter((name): name is string => typeof name === "string" && name.length > 0);
      const locationDiagnostic = diagnostics?.location;
      const resolvedRefIds = participantDiagnostics
        .filter((e) => e?.resolved && (e as any)?.includedInRequest !== false)
        .map((e) => (e as any)?.entityId)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      setSceneGenerationDiagnostics((prev) => ({
        ...prev,
        [scene.id]: {
          sceneId: scene.id,
          generatedAt: Date.now(),
          referenceCount: typeof result?.referenceCount === "number" ? result.referenceCount : 0,
          model: typeof result?.model === "string" ? result.model : undefined,
          outputIntent:
            typeof result?.outputIntent === "string"
              ? normalizeStudioOutputIntent(result.outputIntent)
              : undefined,
          textPolicy:
            typeof result?.textPolicy === "string"
              ? normalizeStudioTextPolicy(result.textPolicy)
              : undefined,
          textPolicyLocked: typeof result?.textPolicyLocked === "boolean" ? result.textPolicyLocked : undefined,
          identityRepair: result?.identityRepair,
          unresolvedParticipantNames,
          locationResolved: typeof locationDiagnostic?.resolved === "boolean" ? locationDiagnostic.resolved : null,
          locationName: typeof locationDiagnostic?.name === "string" ? locationDiagnostic.name : undefined,
          diagnostics,
          submittedReferences: result?.submittedReferences as SceneSubmittedReferences | undefined,
          actualReferencesUsed: result?.actualReferencesUsed as SceneActualReferencesUsed | undefined,
          promptStrategyVersion: typeof result?.promptStrategyVersion === "string" ? result.promptStrategyVersion : undefined,
          promptPreview: typeof result?.prompt === "string" ? result.prompt : undefined,
          promptLength:
            typeof result?.promptLength === "number"
              ? result.promptLength
              : (typeof result?.prompt === "string" ? result.prompt.length : undefined),
        },
      }));

      setScenes(prev => prev.map(s => {
        if (s.id !== scene.id) return s;
        const nextFrames = (s.frames || []).map(f => (
          f.id === frame.id
            ? {
                ...f,
                imageUrl,
                generationRefs: resolvedRefIds.length > 0 ? resolvedRefIds : undefined,
                visualDirty: false,
                visualDirtyReason: undefined,
                visualDirtyAt: undefined,
              }
            : f
        ));
        const dirtyFrameCount = nextFrames.filter((candidate) => candidate.visualDirty).length;
        return {
          ...s,
          frames: nextFrames,
          frameImagesDirty: dirtyFrameCount > 0,
          frameVisualDirtyCount: dirtyFrameCount,
        };
      }));
      setSelectedScene(prevSelected => {
        if (!prevSelected || prevSelected.id !== scene.id) return prevSelected;
        const nextFrames = (prevSelected.frames || []).map(f => (
          f.id === frame.id
            ? {
                ...f,
                imageUrl,
                generationRefs: resolvedRefIds.length > 0 ? resolvedRefIds : undefined,
                visualDirty: false,
                visualDirtyReason: undefined,
                visualDirtyAt: undefined,
              }
            : f
        ));
        const dirtyFrameCount = nextFrames.filter((candidate) => candidate.visualDirty).length;
        return {
          ...prevSelected,
          frames: nextFrames,
          frameImagesDirty: dirtyFrameCount > 0,
          frameVisualDirtyCount: dirtyFrameCount,
        };
      });
      setSelectedFrame(prev => {
        if (!prev || prev.scene.id !== scene.id) return prev;
        const nextFrames = (prev.scene.frames || []).map(f => (
          f.id === frame.id
            ? { ...f, imageUrl, generationRefs: resolvedRefIds.length > 0 ? resolvedRefIds : undefined, visualDirty: false, visualDirtyReason: undefined, visualDirtyAt: undefined }
            : f
        ));
        const dirtyFrameCount = nextFrames.filter(c => c.visualDirty).length;
        return { ...prev, scene: { ...prev.scene, frames: nextFrames, frameImagesDirty: dirtyFrameCount > 0, frameVisualDirtyCount: dirtyFrameCount } };
      });
      refreshSessionStatus();
    } catch (error: any) {
      const message = error?.message || "Shot image generation failed";
      setFrameGenerationError(message);
      console.error("Frame image generation failed:", error);
    } finally {
      setGeneratingFrameId(null);
    }
  };

  // Add an empty shot to a scene + auto-generate its content. Lifted from
  // the Scene workbench's inline insert handler so the timeline can do the
  // same operation from the shot picker. The change propagates to all views
  // because everything reads from the shared `scenes` state.
  const handleAddShotToScene = async (scene: Scene, opts?: { atIndex?: number; autoGenerate?: boolean }) => {
    const autoGenerate = opts?.autoGenerate !== false; // default true
    const newFrameId = `frame_${scene.id}_${Date.now()}_tl`;
    const insertAt = typeof opts?.atIndex === "number"
      ? Math.max(0, Math.min(opts.atIndex, (scene.frames || []).length))
      : (scene.frames || []).length;
    const newFrame: SceneFrame = {
      id: newFrameId,
      position: insertAt,
      title: "",
      description: "",
      shotType: "",
      camera: "",
      mood: "",
    };
    const frames = [...(scene.frames || [])];
    frames.splice(insertAt, 0, newFrame);
    frames.forEach((f, i) => { f.position = i; });
    const updatedScene = { ...scene, frames };
    await handleSceneUpdate(updatedScene);
    if (autoGenerate) {
      // Slight delay so the server-side state has settled before generation
      setTimeout(() => handleGenerateSingleFrame(updatedScene, newFrameId), 300);
    }
    return newFrameId;
  };

  // ─── Shot variants ────────────────────────────────────────────────────
  // Variants are alternate takes of a shot — generated via the saveAsVariant
  // flag on /visual/frame, promoted into primary via a dedicated endpoint,
  // or deleted outright. Used by the Clip Inspector to let the writer keep
  // multiple options open for the same shot.
  const [generatingVariantFrameId, setGeneratingVariantFrameId] = useState<string | null>(null);

  const handleGenerateShotVariant = async (scene: Scene, frame: SceneFrame, customPrompt?: string) => {
    setGeneratingVariantFrameId(frame.id);
    try {
      const outputIntent = normalizeStudioOutputIntent(settings.outputIntent);
      const resolvedTextPolicy = resolveStudioTextPolicy(outputIntent, settings.textPolicy);
      const response = await fetch(`${API_BASE}/api/narrative/visual/frame/${scene.id}/${frame.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aspectRatio: "16:9",
          imageSize: "2K",
          usePro: true,
          visualStylePrompt: settings.visualStylePrompt,
          outputIntent,
          textPolicy: resolvedTextPolicy.policy,
          strictCharacterRefs: true,
          includeCharacterAlternates: true, // variants benefit from breadth
          enableIdentityRepair: true,
          identityRepairPasses: 2,
          maxObjectRefs: 6,
          maxNarrativePromptChars: 260,
          maxFrameAnchorChars: 300,
          prompt: customPrompt,
          saveAsVariant: true,
          sceneData: {
            id: scene.id,
            title: scene.title,
            prose: scene.prose,
            participantIds: scene.participantIds,
            locationId: scene.locationId,
            frames: scene.frames,
          },
          frameData: frame,
        }),
      });
      if (!response.ok) {
        console.error("Variant generation failed:", await response.text());
        return null;
      }
      const data = await response.json();
      const variant = data.variant;
      if (variant) {
        const resolvedVariant = { ...variant, url: resolveImageUrl(variant.url) || variant.url };
        setScenes(prev => prev.map(s => s.id !== scene.id ? s : {
          ...s,
          frames: (s.frames || []).map(f => f.id !== frame.id ? f : {
            ...f,
            variants: [...(f.variants || []), resolvedVariant],
          }),
        }));
        return resolvedVariant;
      }
      return null;
    } catch (err) {
      console.error("Variant generation error:", err);
      return null;
    } finally {
      setGeneratingVariantFrameId(null);
    }
  };

  const handlePromoteShotVariant = async (scene: Scene, frame: SceneFrame, variantId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/interactions/${scene.id}/frames/${frame.id}/variants/${variantId}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        console.error("Promote variant failed:", await res.text());
        return;
      }
      // Refetch the scene so we have the correct primary + variants order
      const scenesResp = await fetch(`${API_BASE}/api/narrative/interactions`);
      if (scenesResp.ok) {
        const data = await scenesResp.json();
        setScenes(mapScenesFromApi(Array.isArray(data) ? data : (data.interactions || [])));
      }
    } catch (err) {
      console.error("Promote variant error:", err);
    }
  };

  const handleDeleteShotVariant = async (scene: Scene, frame: SceneFrame, variantId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/interactions/${scene.id}/frames/${frame.id}/variants/${variantId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        console.error("Delete variant failed:", await res.text());
        return;
      }
      setScenes(prev => prev.map(s => s.id !== scene.id ? s : {
        ...s,
        frames: (s.frames || []).map(f => f.id !== frame.id ? f : {
          ...f,
          variants: (f.variants || []).filter(v => v.id !== variantId),
        }),
      }));
    } catch (err) {
      console.error("Delete variant error:", err);
    }
  };

  const handleGenerateCameraAngle = async (cameraDescription: string) => {
    if (!cameraAngleTarget) return;
    setIsGeneratingCameraAngle(true);
    try {
      const response = await fetch(`${API_BASE}/api/narrative/visual/camera-angle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: cameraAngleTarget.imageUrl,
          cameraDescription,
          sceneData: cameraAngleTarget.prose ? {
            id: cameraAngleTarget.sceneId,
            title: cameraAngleTarget.title,
            prose: cameraAngleTarget.prose,
            participantIds: cameraAngleTarget.participantIds,
            locationId: cameraAngleTarget.locationId,
            frames: cameraAngleTarget.frames,
          } : undefined,
          aspectRatio: cameraAngleTarget.type === "entity" ? "1:1" : undefined,
          projectId: currentProjectId,
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to generate camera angle");
      }
      const result = await response.json();
      const imageUrl = result.image
        ? `data:${result.mimeType};base64,${result.image}`
        : result.imageUrl
          ? `${API_BASE}${result.imageUrl}`
          : undefined;
      if (!imageUrl) throw new Error("No image returned from camera angle generation");

      if (cameraAngleTarget.type === "scene") {
        setScenes((prev) =>
          prev.map((s) => (s.id === cameraAngleTarget.sceneId ? { ...s, imageUrl } : s)),
        );
        setSelectedScene((prev) =>
          prev && prev.id === cameraAngleTarget.sceneId ? { ...prev, imageUrl } : prev,
        );
      } else if (cameraAngleTarget.type === "frame" && cameraAngleTarget.frameId) {
        const targetFrameId = cameraAngleTarget.frameId;
        setScenes((prev) =>
          prev.map((s) => {
            if (s.id !== cameraAngleTarget.sceneId) return s;
            return {
              ...s,
              frames: (s.frames || []).map((f) =>
                f.id === targetFrameId ? { ...f, imageUrl } : f,
              ),
            };
          }),
        );
        setSelectedScene((prev) => {
          if (!prev || prev.id !== cameraAngleTarget.sceneId) return prev;
          return {
            ...prev,
            frames: (prev.frames || []).map((f) =>
              f.id === targetFrameId ? { ...f, imageUrl } : f,
            ),
          };
        });
        setSelectedFrame((prev) => {
          if (!prev || prev.scene.id !== cameraAngleTarget.sceneId) return prev;
          return {
            ...prev,
            scene: {
              ...prev.scene,
              frames: (prev.scene.frames || []).map((f) =>
                f.id === targetFrameId ? { ...f, imageUrl } : f,
              ),
            },
          };
        });
      } else if (cameraAngleTarget.type === "entity" && cameraAngleTarget.entityId) {
        updateEntityLocally(cameraAngleTarget.entityId, { referenceImage: imageUrl });
        // Persist server URL
        const persistUrl = result.imageUrl || null;
        if (persistUrl) {
          try {
            const persistResponse = await fetch(`${API_BASE}/api/narrative/entity/${cameraAngleTarget.entityId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ updates: { referenceImage: persistUrl, imageUrl: persistUrl } }),
            });
            if (persistResponse.ok) {
              const persistResult = await persistResponse.json();
              if (persistResult?.visualInvalidation?.sceneCount > 0 || persistResult?.visualInvalidation?.frameCount > 0) {
                await refreshScenesFromApi();
                await refreshSessionStatus();
              }
            }
          } catch (e) {
            console.error("Failed to persist camera angle portrait:", e);
          }
        }
      }
      setCameraAngleTarget(null);
    } catch (error: any) {
      console.error("Camera angle generation failed:", error);
      setFrameGenerationError(error?.message || "Camera angle generation failed");
    } finally {
      setIsGeneratingCameraAngle(false);
    }
  };

  const handleApplyImageEdit = async (editInstruction: string) => {
    if (!imageEditTarget) return;
    setIsApplyingImageEdit(true);
    try {
      const response = await fetch(`${API_BASE}/api/narrative/visual/edit-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: imageEditTarget.imageUrl,
          editInstruction,
          aspectRatio: imageEditTarget.type === "entity" ? "1:1" : undefined,
          projectId: currentProjectId,
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to apply image edit");
      }
      const result = await response.json();
      const imageUrl = result.image
        ? `data:${result.mimeType};base64,${result.image}`
        : result.imageUrl
          ? `${API_BASE}${result.imageUrl}`
          : undefined;
      if (!imageUrl) throw new Error("No image returned from edit");

      if (imageEditTarget.type === "scene") {
        setScenes((prev) =>
          prev.map((s) => (s.id === imageEditTarget.sceneId ? { ...s, imageUrl } : s)),
        );
        setSelectedScene((prev) =>
          prev && prev.id === imageEditTarget.sceneId ? { ...prev, imageUrl } : prev,
        );
      } else if (imageEditTarget.type === "frame" && imageEditTarget.frameId) {
        const targetFrameId = imageEditTarget.frameId;
        setScenes((prev) =>
          prev.map((s) => {
            if (s.id !== imageEditTarget.sceneId) return s;
            return {
              ...s,
              frames: (s.frames || []).map((f) =>
                f.id === targetFrameId ? { ...f, imageUrl } : f,
              ),
            };
          }),
        );
        setSelectedScene((prev) => {
          if (!prev || prev.id !== imageEditTarget.sceneId) return prev;
          return {
            ...prev,
            frames: (prev.frames || []).map((f) =>
              f.id === targetFrameId ? { ...f, imageUrl } : f,
            ),
          };
        });
        setSelectedFrame((prev) => {
          if (!prev || prev.scene.id !== imageEditTarget.sceneId) return prev;
          return {
            ...prev,
            scene: {
              ...prev.scene,
              frames: (prev.scene.frames || []).map((f) =>
                f.id === targetFrameId ? { ...f, imageUrl } : f,
              ),
            },
          };
        });
      } else if (imageEditTarget.type === "entity" && imageEditTarget.entityId) {
        updateEntityLocally(imageEditTarget.entityId, { referenceImage: imageUrl });
        const persistUrl = result.imageUrl || null;
        if (persistUrl) {
          try {
            const persistResponse = await fetch(`${API_BASE}/api/narrative/entity/${imageEditTarget.entityId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ updates: { referenceImage: persistUrl, imageUrl: persistUrl } }),
            });
            if (persistResponse.ok) {
              const persistResult = await persistResponse.json();
              if (persistResult?.visualInvalidation?.sceneCount > 0 || persistResult?.visualInvalidation?.frameCount > 0) {
                await refreshScenesFromApi();
                await refreshSessionStatus();
              }
            }
          } catch (e) {
            console.error("Failed to persist edited portrait:", e);
          }
        }
      }
      setImageEditTarget(null);
    } catch (error: any) {
      console.error("Image edit failed:", error);
      setFrameGenerationError(error?.message || "Image edit failed");
    } finally {
      setIsApplyingImageEdit(false);
    }
  };

  const handleRelatedEntityClick = (entityId: string) => {
    const entity = getEntityByIdLocal(entityId);
    if (entity) {
      handleEntityClick(entity);
      // Also update carousel position
      const idx = entities.findIndex((e) => e.id === entityId);
      if (idx >= 0) {
        setCurrentIndex(idx);
        switchRow("entities");
      }
    }
  };

  const handleSceneBubbleClick = (scene: Scene) => {
    setSelectedScene(scene);
    setSelectedEntity(null);
    setFrameGenerationError(null);
    // Update carousel
    const idx = scenes.findIndex((s) => s.id === scene.id);
    if (idx >= 0) {
      setCurrentIndex(idx);
      switchRow("scenes");
    }
  };

  const handleAddRelationship = async (sourceId: string, targetId: string, targetName: string, type: string, description?: string) => {
    const sourceEntity = entities.find(e => e.id === sourceId);
    const newRel: DemoRelationship = {
      id: `rel_temp_${Date.now()}`,
      sourceId,
      targetId,
      sourceName: sourceEntity?.name || "",
      targetName,
      type,
      description,
    };

    // Optimistic update
    setRelationships(prev => [...prev, newRel]);
    const prevEntity = selectedEntity;
    if (selectedEntity && selectedEntity.entity.id === sourceId) {
      const directedRel: Relationship = { ...newRel, direction: "outgoing" };
      const targetEntity = entities.find(e => e.id === targetId);
      setSelectedEntity(prev => prev ? {
        ...prev,
        relationships: [...prev.relationships, directedRel],
        relatedEntities: targetEntity && !prev.relatedEntities.some(e => e.id === targetId)
          ? [...prev.relatedEntities, targetEntity]
          : prev.relatedEntities,
      } : prev);
    }

    try {
      const res = await fetch(`${API_BASE}/api/narrative/relationships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: sourceId, target: targetId, sourceName: sourceEntity?.name || "", targetName, type, description }),
      });
      if (!res.ok) throw new Error("Failed to create relationship");
      const created = await res.json();
      // Replace temp ID with real one
      setRelationships(prev => prev.map(r => r.id === newRel.id ? { ...r, id: created.id } : r));
      if (selectedEntity?.entity.id === sourceId) {
        setSelectedEntity(prev => prev ? {
          ...prev,
          relationships: prev.relationships.map(r => r.id === newRel.id ? { ...r, id: created.id } : r),
        } : prev);
      }
    } catch (err) {
      console.error("Failed to add relationship:", err);
      setRelationships(prev => prev.filter(r => r.id !== newRel.id));
      if (prevEntity) setSelectedEntity(prevEntity);
    }
  };

  const handleDeleteRelationship = async (relationshipId: string) => {
    const prevRelationships = relationships;
    const prevEntity = selectedEntity;

    // Optimistic removal
    setRelationships(prev => prev.filter(r => r.id !== relationshipId));
    if (selectedEntity) {
      setSelectedEntity(prev => prev ? {
        ...prev,
        relationships: prev.relationships.filter(r => r.id !== relationshipId),
      } : prev);
    }

    try {
      const res = await fetch(`${API_BASE}/api/narrative/relationships/${relationshipId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete relationship");
    } catch (err) {
      console.error("Failed to delete relationship:", err);
      setRelationships(prevRelationships);
      if (prevEntity) setSelectedEntity(prevEntity);
    }
  };

  const handleAddScene = () => {
    // Pre-fill chat with scene creation prompt
    const prompt = focusedEntity
      ? `Write a scene featuring ${focusedEntity.name}. `
      : pinnedEntities.length > 0
        ? `Write a scene featuring ${pinnedEntities.map(e => e.name).join(" and ")}. `
        : "Write a new scene for this world. ";
    setInput(prompt);
    inputRef.current?.focus();
    setIsChatExpanded(true);
    if (insertPosition) {
      setInsertPosition(null);
    }
  };

  // Handle story/project change - reload all data
  const handleStoryChange = async (projectId: string) => {
    setIsDataLoading(true);
    setSelectedEntity(null);
    setSelectedScene(null);
    setSelectedFrame(null);
    setPortraitVariations(null);
    setVariationRunGeneratedCount(0);
    setFocusedEntity(null);
    setPinnedEntities([]);
    setIsScratchpadOpen(false);
    setCurrentIndex(0);

    // Sync the server's "active project" so endpoints that fall back to
    // getActiveProjectId() (style references, test bench, /render, etc.)
    // resolve to the same project the user just picked. Without this, the
    // server stays on whatever was active before the UI mounted and renders
    // bleed style refs across projects (or get none at all).
    try {
      await fetch(`${API_BASE}/api/projects/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
    } catch (err) {
      console.error("Failed to set server-side active project:", err);
    }
    // Stage 2/3 state — clear immediately so the UI doesn't briefly show
    // the previous project's acts/timeline before the new ones arrive.
    setActs([]);
    setTimeline({ tracks: [], items: [] });
    setStoryboards([]);
    setScriptDoc({});
    // Reset timeline undo/redo history — it's per-project.
    timelineHistoryRef.current = [];
    timelineHistoryIndexRef.current = -1;
    skipNextHistoryPushRef.current = false;
    setTimelineHistoryTick((t) => t + 1);

    try {
      const [projectRes, entitiesRes, relationshipsRes, interactionsRes, historyRes, proposalsRes, actsRes, timelineRes, storyboardsRes, scriptRes] = await Promise.all([
        fetch(`${API_BASE}/api/projects/${projectId}`),
        fetch(`${API_BASE}/api/narrative/entities`),
        fetch(`${API_BASE}/api/narrative/relationships`),
        fetch(`${API_BASE}/api/narrative/interactions`),
        fetch(`${API_BASE}/api/narrative/chat/history`),
        fetch(`${API_BASE}/api/narrative/proposals`),
        fetch(`${API_BASE}/api/narrative/acts`),
        fetch(`${API_BASE}/api/narrative/timeline`),
        fetch(`${API_BASE}/api/narrative/storyboards`),
        fetch(`${API_BASE}/api/narrative/script`),
      ]);

      let loadedWorldName = "Your World";
      if (projectRes.ok) {
        const project = await projectRes.json();
        loadedWorldName = project?.name || loadedWorldName;
        hydrateSettingsForProject(projectId, project?.styleProfile);
      } else {
        hydrateSettingsForProject(projectId);
      }

      if (entitiesRes.ok) {
        const entitiesData = await entitiesRes.json();
        const mappedEntities: Entity[] = mapEntitiesFromApi(entitiesData);
        setEntities(mappedEntities);
        const firstLocation = mappedEntities.find(e => e.type === "location");
        if (firstLocation) {
          loadedWorldName = firstLocation.name;
          setWorldName(firstLocation.name);
        }
      }

      if (relationshipsRes.ok) {
        const relsData = await relationshipsRes.json();
        setRelationships(relsData.map((r: any) => ({
          id: r.id,
          sourceId: r.source || r.sourceId,
          targetId: r.target || r.targetId,
          sourceName: r.sourceName,
          targetName: r.targetName,
          type: r.type,
          description: r.description,
        })));
      }

      if (interactionsRes.ok) {
        const interactionsData = await interactionsRes.json();
        setScenes(mapScenesFromApi(interactionsData));
      }

      if (actsRes.ok) {
        const actsData = await actsRes.json();
        setActs(Array.isArray(actsData?.acts) ? actsData.acts : []);
      }

      if (timelineRes.ok) {
        const timelineData = await timelineRes.json();
        if (timelineData?.timeline) {
          setTimeline(timelineData.timeline);
          pushTimelineHistory(timelineData.timeline);
        }
      }

      if (storyboardsRes.ok) {
        const sbData = await storyboardsRes.json();
        const list: StoryboardArtifact[] = Array.isArray(sbData?.storyboards) ? sbData.storyboards : [];
        setStoryboards(list.map((s) => ({
          ...s,
          primaryImage: s.primaryImage ? { ...s.primaryImage, url: resolveImageUrl(s.primaryImage.url) || s.primaryImage.url } : undefined,
        })));
      }

      if (scriptRes.ok) {
        const scriptData = await scriptRes.json();
        setScriptDoc(scriptData.script || {});
      }

      if (historyRes.ok) {
        const historyData = await historyRes.json();
        if (historyData.messages && historyData.messages.length > 0) {
          let baseMessages: Message[] = historyData.messages.map((m: any, i: number) => ({
            id: m.id || `msg_${m.timestamp}_${i}`,
            messageId: m.messageId,
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
            timestamp: m.timestamp || Date.now(),
            proposals: m.proposals || [],
            // Restore generated images + tool-call chips from saved history.
            toolUsage: m.toolUsage || null,
          }));

          if (proposalsRes.ok) {
            const proposalsData = await proposalsRes.json();
            if (proposalsData?.proposals?.length) {
              baseMessages = attachProposalsToMessages(baseMessages, proposalsData.proposals);
            }
          }

          setMessages(baseMessages);
        } else {
          setMessages([{
            id: "msg_welcome",
            role: "assistant",
            content: `Welcome to the world of ${loadedWorldName}. I'm here to help you explore and expand this narrative. What would you like to discover?`,
            timestamp: Date.now(),
          }]);
        }
      }

      await refreshSessionStatus();
      console.log(`📚 Switched to project: ${projectId}`);
    } catch (error) {
      console.error("Failed to load project data:", error);
    } finally {
      setIsDataLoading(false);
    }
  };

  const reloadWorldGraphData = async () => {
    const [entitiesRes, relationshipsRes, interactionsRes] = await Promise.all([
      fetch(`${API_BASE}/api/narrative/entities`),
      fetch(`${API_BASE}/api/narrative/relationships`),
      fetch(`${API_BASE}/api/narrative/interactions`),
    ]);

    if (entitiesRes.ok) {
      const entitiesData = await entitiesRes.json();
      setEntities(mapEntitiesFromApi(entitiesData));
    }

    if (relationshipsRes.ok) {
      const relsData = await relationshipsRes.json();
      setRelationships(relsData.map((r: any) => ({
        id: r.id,
        sourceId: r.source || r.sourceId,
        targetId: r.target || r.targetId,
        sourceName: r.sourceName,
        targetName: r.targetName,
        type: r.type,
        description: r.description,
      })));
    }

    if (interactionsRes.ok) {
      const interactionsData = await interactionsRes.json();
      const mappedScenes = mapScenesFromApi(interactionsData);
      setScenes(mappedScenes);
      if (activeRow === "scenes") {
        setCurrentIndex((prev) => Math.min(prev, Math.max(mappedScenes.length - 1, 0)));
      }
    }
  };

  const handleSwitchSceneBranch = async (branchName: string) => {
    if (!branchName || isSwitchingSceneBranch) return;
    if (sessionStatus?.currentBranch === branchName) return;

    setIsSwitchingSceneBranch(true);
    setSceneBranchError(null);
    try {
      const response = await fetch(`${API_BASE}/api/narrative/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: branchName }),
      });

      if (!response.ok) {
        let errorMessage = "Failed to switch branch.";
        try {
          const errorBody = await response.json();
          if (errorBody?.error) errorMessage = errorBody.error;
        } catch (_) {
          // Ignore parse errors and keep default message.
        }
        throw new Error(errorMessage);
      }

      await reloadWorldGraphData();
      await refreshSessionStatus();
      setSelectedScene(null);
      setSelectedEntity(null);
    } catch (error: any) {
      console.error("Failed to switch scene branch:", error);
      setSceneBranchError(error?.message || "Failed to switch branch.");
    } finally {
      setIsSwitchingSceneBranch(false);
    }
  };

  const handleCreateSceneBranchAtScene = async (scene: Scene) => {
    if (!scene?.id || isCreatingSceneBranch) return;

    const suggestedName = defaultSceneBranchName(scene);
    const requestedName = window.prompt(`Create a new branch from "${scene.title}"`, suggestedName);
    if (requestedName === null) return;

    setIsCreatingSceneBranch(true);
    setSceneBranchError(null);
    try {
      const response = await fetch(`${API_BASE}/api/narrative/story/scene-branch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneId: scene.id,
          branchName: requestedName.trim() || undefined,
        }),
      });

      if (!response.ok) {
        let errorMessage = "Failed to create branch from scene.";
        try {
          const errorBody = await response.json();
          if (errorBody?.error) errorMessage = errorBody.error;
        } catch (_) {
          // Ignore parse errors and keep default message.
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      if (Array.isArray(result?.scenes)) {
        const mappedScenes = mapScenesFromApi(result.scenes);
        setScenes(mappedScenes);
        const branchPointSceneId = result?.branchPoint?.sceneId;
        if (branchPointSceneId) {
          const branchScene = mappedScenes.find((candidate) => candidate.id === branchPointSceneId);
          if (branchScene) {
            setSelectedScene(branchScene);
            switchRow("scenes");
            const idx = mappedScenes.findIndex((candidate) => candidate.id === branchPointSceneId);
            if (idx >= 0) {
              setCurrentIndex(idx);
            }
          }
        }
      }

      await refreshSessionStatus();
    } catch (error: any) {
      console.error("Failed to create scene branch:", error);
      setSceneBranchError(error?.message || "Failed to create scene branch.");
    } finally {
      setIsCreatingSceneBranch(false);
    }
  };

  // Insert scene at a specific position
  const [insertPosition, setInsertPosition] = useState<{ position: number; beforeScene: Scene; afterScene: Scene | null } | null>(null);

  const handleInsertScene = (position: number, beforeScene: Scene, afterScene: Scene | null) => {
    setInsertPosition({ position, beforeScene, afterScene });
    // Pre-fill chat with contextual prompt
    const prompt = afterScene
      ? `Write a scene that happens between "${beforeScene.title}" and "${afterScene.title}". What happens between these moments? `
      : `Write a scene that happens after "${beforeScene.title}". `;
    setInput(prompt);
    inputRef.current?.focus();
    setIsChatExpanded(true);
  };

  const buildReorderedSceneIds = (sourceSceneId: string, targetSceneId: string): string[] | null => {
    const orderedSceneIds = scenes.map((scene) => scene.id);
    const sourceIndex = orderedSceneIds.indexOf(sourceSceneId);
    const targetIndex = orderedSceneIds.indexOf(targetSceneId);
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
      return null;
    }

    const nextOrder = [...orderedSceneIds];
    const [movedSceneId] = nextOrder.splice(sourceIndex, 1);
    if (!movedSceneId) return null;
    const insertionIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    nextOrder.splice(insertionIndex, 0, movedSceneId);

    const hasChanged = nextOrder.some((sceneId, idx) => sceneId !== orderedSceneIds[idx]);
    return hasChanged ? nextOrder : null;
  };

  const closeReorderPreviewModal = () => {
    setIsReorderPreviewOpen(false);
    setReorderPreview(null);
    setReorderPreviewError(null);
  };

  const handlePreviewSceneReorder = async (sourceSceneId: string, targetSceneId: string) => {
    if (isPreviewingReorder || isApplyingReorder) return;

    const orderedSceneIds = buildReorderedSceneIds(sourceSceneId, targetSceneId);
    if (!orderedSceneIds) return;

    setIsPreviewingReorder(true);
    setReorderPreviewError(null);
    try {
      const response = await fetch(`${API_BASE}/api/narrative/story/reorder/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedSceneIds }),
      });

      if (!response.ok) {
        let errorMessage = "Failed to preview scene reorder.";
        try {
          const errorBody = await response.json();
          if (errorBody?.error) errorMessage = errorBody.error;
        } catch (_) {
          // Ignore parse errors and keep default error message.
        }
        throw new Error(errorMessage);
      }

      const previewData: StoryReorderPreviewResponse = await response.json();
      setReorderPreview(previewData);
      setIsReorderPreviewOpen(true);
    } catch (error: any) {
      console.error("Failed to preview scene reorder:", error);
      setReorderPreviewError(error?.message || "Failed to preview scene reorder.");
    } finally {
      setIsPreviewingReorder(false);
    }
  };

  const handleApplySceneReorder = async (createBranchOnConflict: boolean) => {
    if (!reorderPreview) return;
    if (isApplyingReorder) return;

    setIsApplyingReorder(true);
    setReorderPreviewError(null);

    const selectedSceneId = selectedScene?.id;
    const focusedSceneId = activeRow === "scenes" ? scenes[currentIndex]?.id : null;

    try {
      const response = await fetch(`${API_BASE}/api/narrative/story/reorder/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderedSceneIds: reorderPreview.newOrder.map((entry) => entry.sceneId),
          createBranchOnConflict,
        }),
      });

      if (!response.ok) {
        let errorMessage = "Failed to apply scene reorder.";
        try {
          const errorBody = await response.json();
          if (errorBody?.error) errorMessage = errorBody.error;
        } catch (_) {
          // Ignore parse errors and keep default error message.
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      const scenesFromResult: any[] = Array.isArray(result?.scenes) ? result.scenes : [];
      const nextScenes = scenesFromResult.length > 0
        ? mapScenesFromApi(scenesFromResult)
        : scenes;

      if (nextScenes !== scenes) {
        setScenes(nextScenes);

        if (selectedSceneId) {
          const updatedSelected = nextScenes.find((scene) => scene.id === selectedSceneId) || null;
          setSelectedScene(updatedSelected);
        }

        if (activeRow === "scenes" && focusedSceneId) {
          const nextIndex = nextScenes.findIndex((scene) => scene.id === focusedSceneId);
          if (nextIndex >= 0) {
            setCurrentIndex(nextIndex);
          }
        }
      } else {
        const interactionsRes = await fetch(`${API_BASE}/api/narrative/interactions`);
        if (interactionsRes.ok) {
          const interactionsData = await interactionsRes.json();
          const mappedScenes = mapScenesFromApi(interactionsData);
          setScenes(mappedScenes);

          if (selectedSceneId) {
            const updatedSelected = mappedScenes.find((scene) => scene.id === selectedSceneId) || null;
            setSelectedScene(updatedSelected);
          }

          if (activeRow === "scenes" && focusedSceneId) {
            const nextIndex = mappedScenes.findIndex((scene) => scene.id === focusedSceneId);
            if (nextIndex >= 0) {
              setCurrentIndex(nextIndex);
            }
          }
        }
      }

      if (result?.branchCreated?.name) {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg_reorder_branch_${Date.now()}`,
            role: "system",
            content: `Created branch "${result.branchCreated.name}" and applied the reorder there to protect continuity.`,
            timestamp: Date.now(),
          },
        ]);
      }

      await refreshSessionStatus();
      closeReorderPreviewModal();
    } catch (error: any) {
      console.error("Failed to apply scene reorder:", error);
      setReorderPreviewError(error?.message || "Failed to apply scene reorder.");
    } finally {
      setIsApplyingReorder(false);
    }
  };

  // Scene navigation helpers
  const getSceneIndex = (sceneId: string): number => {
    return scenes.findIndex(s => s.id === sceneId);
  };

  const handlePreviousScene = () => {
    if (!selectedScene) return;
    const currentIdx = getSceneIndex(selectedScene.id);
    if (currentIdx > 0) {
      setSelectedScene(scenes[currentIdx - 1]);
      setFrameGenerationError(null);
    }
  };

  const handleNextScene = () => {
    if (!selectedScene) return;
    const currentIdx = getSceneIndex(selectedScene.id);
    if (currentIdx < scenes.length - 1) {
      setSelectedScene(scenes[currentIdx + 1]);
      setFrameGenerationError(null);
    }
  };

  // Get currently focused item based on carousel position
  const getFocusedItem = () => {
    if (focusedEntity) {
      return { entity: focusedEntity, scene: null };
    }
    if (selectedEntity?.entity) {
      return { entity: selectedEntity.entity, scene: null };
    }
    if (selectedScene) {
      return { entity: null, scene: selectedScene };
    }
    if (activeRow === "entities" && entities[currentIndex]) {
      return { entity: entities[currentIndex], scene: null };
    }
    if (activeRow === "scenes") {
      const item = carouselItems[currentIndex];
      if (item) {
        return { entity: null, scene: item.scene };
      }
    }
    return { entity: null, scene: null };
  };

  // Execute LLM commands
  const executeCommands = (commands: LLMCommand[]) => {
    for (const cmd of commands) {
      switch (cmd.type) {
        case "navigate":
          const entityIdx = entities.findIndex(e => e.id === cmd.entityId);
          if (entityIdx >= 0) {
            switchRow("entities");
            setCurrentIndex(entityIdx);
          }
          break;
        case "navigate_scene":
          const sceneIdx = scenes.findIndex(s => s.id === cmd.sceneId);
          if (sceneIdx >= 0) {
            switchRow("scenes");
            setCurrentIndex(sceneIdx);
          }
          break;
        case "pin":
          const toPin = entities.find(e => e.id === cmd.entityId);
          if (toPin && !pinnedEntities.some(p => p.id === toPin.id)) {
            setPinnedEntities(prev => [...prev, toPin]);
          }
          break;
        case "unpin":
          setPinnedEntities(prev => prev.filter(p => p.id !== cmd.entityId));
          break;
        case "focus_row":
          switchRow(cmd.row);
          setCurrentIndex(0);
          break;
        case "ask_confirm":
          setPendingConfirm({ message: cmd.message, action: cmd.action });
          break;
        case "generate_frames": {
          const targetSceneId = cmd.sceneId || selectedScene?.id || getFocusedItem().scene?.id;
          if (!targetSceneId) break;
          const targetScene = scenes.find(s => s.id === targetSceneId);
          if (!targetScene) break;
          const frameCount = cmd.count && cmd.count > 0 ? cmd.count : 4;
          handleGenerateFrames(targetScene, frameCount);
          break;
        }
        case "generate_scene_image": {
          const targetSceneId = cmd.sceneId || selectedScene?.id || getFocusedItem().scene?.id;
          if (!targetSceneId) break;
          const targetScene = scenes.find(s => s.id === targetSceneId);
          if (!targetScene) break;
          handleGenerateImage(targetScene);
          break;
        }
        case "generate_frame_image": {
          const focused = getFocusedItem().scene;
          const targetSceneId = cmd.sceneId || selectedScene?.id || focused?.id;
          if (!targetSceneId) break;
          const targetScene = scenes.find(s => s.id === targetSceneId);
          if (!targetScene || !targetScene.frames || targetScene.frames.length === 0) break;

          let targetFrame: SceneFrame | undefined;
          if (cmd.frameId) {
            targetFrame = targetScene.frames.find((frame) => frame.id === cmd.frameId);
            if (!targetFrame && /^\d+$/.test(cmd.frameId)) {
              const oneBasedIndex = Number(cmd.frameId);
              targetFrame = targetScene.frames
                .slice()
                .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[oneBasedIndex - 1];
            }
          }
          if (!targetFrame) {
            targetFrame = targetScene.frames
              .slice()
              .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
              .find((frame) => !frame.imageUrl) || targetScene.frames[0];
          }
          if (!targetFrame) break;
          handleGenerateFrameImage(targetScene, targetFrame);
          break;
        }
      }
    }
  };

  // Helper function to persist a scene to the API
  const persistScene = async (scene: Scene): Promise<Scene | null> => {
    try {
      const response = await fetch(`${API_BASE}/api/narrative/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: scene.title,
          prose: scene.prose,
          status: scene.status,
          participantIds: scene.participantIds,
          locationId: scene.locationId,
          events: scene.events,
          stateChanges: scene.stateChanges,
          imageUrl: scene.imageUrl,
          position: scene.position,
          frames: scene.frames,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result?.interaction) {
          const [mappedScene] = mapScenesFromApi([result.interaction]);
          return mappedScene || result.interaction;
        }
      }
    } catch (error) {
      console.error('Failed to persist scene:', error);
    }
    return null;
  };

  const refreshScenesFromApi = async () => {
    try {
      const scenesRes = await fetch(`${API_BASE}/api/narrative/interactions`);
      if (!scenesRes.ok) return;
      const scenesData = await scenesRes.json();
      const mappedScenes = mapScenesFromApi(scenesData);
      setScenes(mappedScenes);
      setSelectedScene((prevSelected) => {
        if (!prevSelected) return prevSelected;
        return mappedScenes.find((scene) => scene.id === prevSelected.id) || prevSelected;
      });
    } catch (error) {
      console.error("Failed to refresh scenes:", error);
    }
  };

  // Refresh session status (uncommitted changes, etc.)
  const refreshSessionStatus = async () => {
    try {
      const [statusRes, timelineRes] = await Promise.all([
        fetch(`${API_BASE}/api/narrative/session/status`),
        fetch(`${API_BASE}/api/narrative/timeline`),
      ]);
      if (statusRes.ok) {
        const data = await statusRes.json();
        setSessionStatus(data);
      }
      if (timelineRes.ok) {
        const timelineData = await timelineRes.json();
        if (Array.isArray(timelineData?.branches)) {
          setSceneBranches(timelineData.branches);
        }
      }
    } catch (error) {
      console.error('Failed to refresh session status:', error);
    }
  };

  const toggleMessageExpanded = (messageId: string) => {
    setExpandedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const handleOpenCommitPreview = async () => {
    setIsLoadingCommitPreview(true);
    try {
      const res = await fetch(`${API_BASE}/api/narrative/commit/preview`);
      if (!res.ok) throw new Error("Failed to load commit preview");
      const preview = await res.json();
      setCommitPreview(preview);
      if (!commitMessage.trim() && preview?.suggestedMessage) {
        setCommitMessage(preview.suggestedMessage);
      }
      setIsCommitPreviewOpen(true);
    } catch (error) {
      console.error("Failed to load commit preview:", error);
    } finally {
      setIsLoadingCommitPreview(false);
    }
  };

  // Commit current changes to the narrative
  const handleCommit = async () => {
    if (!commitMessage.trim()) return;

    setIsCommitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/narrative/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: commitMessage.trim() }),
      });

      if (res.ok) {
        const result = await res.json();
        console.log('📝 Committed:', result.commit);

        // Clear the commit input
        setCommitMessage('');
        setShowCommitInput(false);
        setLlmCommitSuggestion(null);

        // Refresh session status to reflect the commit
        await refreshSessionStatus();
      }
    } catch (error) {
      console.error('Failed to commit:', error);
    } finally {
      setIsCommitting(false);
    }
  };

  // Generate a suggested commit message based on pending changes
  const generateCommitSuggestion = () => {
    if (llmCommitSuggestion) return llmCommitSuggestion;
    if (!sessionStatus?.pendingChanges) return '';

    const { summary, addedEntities, addedRelationships, addedScenes, modifiedScenes } = sessionStatus.pendingChanges;
    const parts: string[] = [];

    if (summary.entitiesAdded > 0) {
      if (summary.entitiesAdded <= 3) {
        parts.push(`Add ${addedEntities.map(e => e.name).join(', ')}`);
      } else {
        parts.push(`Add ${summary.entitiesAdded} entities`);
      }
    }
    if (summary.entitiesModified > 0) {
      parts.push(`update ${summary.entitiesModified} entities`);
    }
    if (summary.relationshipsAdded > 0) {
      if (summary.relationshipsAdded <= 2) {
        parts.push(`connect ${addedRelationships.map(r => `${r.sourceName} → ${r.targetName}`).join(', ')}`);
      } else {
        parts.push(`add ${summary.relationshipsAdded} relationships`);
      }
    }
    if (summary.scenesAdded > 0) {
      if (summary.scenesAdded <= 2) {
        parts.push(`create scene${summary.scenesAdded > 1 ? 's' : ''}: ${addedScenes.map(s => s.title).join(', ')}`);
      } else {
        parts.push(`add ${summary.scenesAdded} scenes`);
      }
    }
    if (summary.scenesModified && summary.scenesModified > 0) {
      if (summary.scenesModified <= 2 && modifiedScenes && modifiedScenes.length > 0) {
        parts.push(`update scene${summary.scenesModified > 1 ? 's' : ''}: ${modifiedScenes.map(s => s.title).join(', ')}`);
      } else {
        parts.push(`update ${summary.scenesModified} scenes`);
      }
    }

    return parts.length > 0 ? parts.join('; ') : 'World state update';
  };

  // Handle accepting a single proposal
  const handleAcceptProposal = async (messageId: string, proposal: EntityProposal) => {
    try {
      // Check if this is a local scene proposal (not from API)
      if (proposal.id.startsWith('scene_prop_') && proposal.entity?.type === 'scene') {
        // Handle scene proposal locally - add to scenes array
        const msg = messages.find(m => m.id === messageId);

        // Collect participant IDs from focused entity and pinned entities
        const participantIds: string[] = [];
        if (focusedEntity) {
          participantIds.push(focusedEntity.id);
        }
        pinnedEntities.forEach(e => {
          if (!participantIds.includes(e.id)) {
            participantIds.push(e.id);
          }
        });

        const targetPosition = insertPosition ? insertPosition.position : scenes.length;
        const newScene: Scene = {
          id: `scene_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          title: proposal.entity.name,
          prose: msg?.content || proposal.entity.description || '',
          status: 'draft',
          participantIds,
          events: [],
          stateChanges: [],
          position: targetPosition,
        };

        // Persist to API first
        const persistedScene = await persistScene(newScene);
        const sceneToAdd = persistedScene || newScene;

        setScenes(prev => {
          const shifted = prev.map(s => {
            if (s.position !== undefined && s.position >= targetPosition) {
              return { ...s, position: s.position + 1 };
            }
            return s;
          });
          return [...shifted, sceneToAdd].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        });

        if (insertPosition) {
          setInsertPosition(null);
        }

        // Update proposal status
        setMessages(prev => prev.map(msg => {
          if (msg.id !== messageId || !msg.proposals) return msg;
          return {
            ...msg,
            proposals: msg.proposals.map(p =>
              p.id === proposal.id ? { ...p, status: "accepted" as const } : p
            ),
          };
        }));

        console.log(`📽️ Added scene to storyboard: ${sceneToAdd.title} (persisted: ${!!persistedScene})`);
        enqueueAutoPortraits(sceneToAdd.participantIds || []);
        enqueueAutoSceneImages([sceneToAdd.id]);
        refreshSessionStatus();
        return;
      }

      // For API-created proposals, call the API
      const res = await fetch(`${API_BASE}/api/narrative/proposals/${proposal.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "accept" }),
      });

      if (res.ok) {
        // Update the proposal status in the message
        setMessages(prev => prev.map(msg => {
          if (msg.id !== messageId || !msg.proposals) return msg;
          return {
            ...msg,
            proposals: msg.proposals.map(p =>
              p.id === proposal.id ? { ...p, status: "accepted" as const } : p
            ),
          };
        }));

        // Refresh data based on proposal type
        if (proposal.type === "add_scene" || proposal.type === "update_scene") {
          // Refresh scenes to include the new one
          const scenesRes = await fetch(`${API_BASE}/api/narrative/interactions`);
          if (scenesRes.ok) {
            const scenesData = await scenesRes.json();
            setScenes(mapScenesFromApi(scenesData));
            console.log(`📽️ Scene ${proposal.type === "add_scene" ? "accepted" : "updated"}: ${proposal.scene?.title}`);
          }
          if (proposal.type === "add_scene" && proposal.scene?.participantIds?.length) {
            enqueueAutoPortraits(proposal.scene.participantIds);
          }
          if (proposal.type === "add_scene" && proposal.scene?.id) {
            enqueueAutoSceneImages([proposal.scene.id]);
          }
        } else {
          // Refresh entities to include the new one
          const entitiesRes = await fetch(`${API_BASE}/api/narrative/entities`);
          if (entitiesRes.ok) {
            const entitiesData = await entitiesRes.json();
            const mapped = mapEntitiesFromApi(entitiesData);
            entitiesRef.current = mapped;
            setEntities(mapped);
          }
          if ((proposal.type === "add_entity" || proposal.type === "update_entity") && proposal.entity?.id) {
            enqueueAutoPortraits([proposal.entity.id]);
          }

          // Also refresh relationships for relationship proposals
          if (proposal.type === "add_relationship" || proposal.type === "relationship") {
            const relsRes = await fetch(`${API_BASE}/api/narrative/relationships`);
            if (relsRes.ok) {
              const relsData = await relsRes.json();
              setRelationships(relsData.map((r: any) => ({
                id: r.id,
                sourceId: r.source || r.sourceId,
                targetId: r.target || r.targetId,
                sourceName: r.sourceName,
                targetName: r.targetName,
                type: r.type,
                description: r.description,
              })));
            }
          }
        }

        // Refresh session status to update uncommitted changes
        refreshSessionStatus();
      }
    } catch (error) {
      console.error("Failed to accept proposal:", error);
    }
  };

  // Handle rejecting a single proposal
  const handleRejectProposal = async (messageId: string, proposal: EntityProposal) => {
    try {
      const res = await fetch(`${API_BASE}/api/narrative/proposals/${proposal.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "reject" }),
      });

      if (res.ok) {
        // Update the proposal status in the message
        setMessages(prev => prev.map(msg => {
          if (msg.id !== messageId || !msg.proposals) return msg;
          return {
            ...msg,
            proposals: msg.proposals.map(p =>
              p.id === proposal.id ? { ...p, status: "rejected" as const } : p
            ),
          };
        }));
      }
    } catch (error) {
      console.error("Failed to reject proposal:", error);
    }
  };

  // Handle accepting all proposals from a message
  const handleAcceptAllProposals = async (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg?.proposals) return;

    const pendingProposals = msg.proposals.filter(p => p.status === "pending");

    try {
      // Separate local scene proposals from API proposals
      const localSceneProposals = pendingProposals.filter(p => p.id.startsWith('scene_prop_') && p.entity?.type === 'scene');
      const apiProposals = pendingProposals.filter(p => !p.id.startsWith('scene_prop_'));
      const hasApiSceneProposals = apiProposals.some(p => p.type === 'add_scene' || p.type === 'update_scene');

      // Handle local scene proposals - persist to API
      if (localSceneProposals.length > 0) {
        const participantIds = [
          ...(focusedEntity ? [focusedEntity.id] : []),
          ...pinnedEntities.map(e => e.id),
        ].filter((id, i, arr) => arr.indexOf(id) === i); // unique IDs

        const scenesToAdd: Scene[] = [];

        const basePosition = insertPosition ? insertPosition.position : scenes.length;
        for (let i = 0; i < localSceneProposals.length; i++) {
          const proposal = localSceneProposals[i];
          const newScene: Scene = {
            id: `scene_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: proposal.entity?.name || 'Untitled Scene',
            prose: msg.content || proposal.entity?.description || '',
            status: 'draft',
            participantIds,
            events: [],
            stateChanges: [],
            position: basePosition + i,
          };

          // Persist to API
          const persistedScene = await persistScene(newScene);
          scenesToAdd.push(persistedScene || newScene);
        }

        setScenes(prev => {
          const shifted = insertPosition
            ? prev.map(s => {
                if (s.position !== undefined && s.position >= basePosition) {
                  return { ...s, position: s.position + localSceneProposals.length };
                }
                return s;
              })
            : prev;
          return [...shifted, ...scenesToAdd].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        });
        console.log(`📽️ Added ${scenesToAdd.length} scenes to storyboard (all persisted to API)`);
        scenesToAdd.forEach(scene => enqueueAutoPortraits(scene.participantIds || []));
        enqueueAutoSceneImages(scenesToAdd.map(s => s.id));
        if (insertPosition) {
          setInsertPosition(null);
        }
      }

      // Accept API proposals
      if (apiProposals.length > 0) {
        await Promise.all(apiProposals.map(proposal =>
          fetch(`${API_BASE}/api/narrative/proposals/${proposal.id}/decide`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision: "accept" }),
          })
        ));
      }

      // Update all proposal statuses
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId || !m.proposals) return m;
        return {
          ...m,
          proposals: m.proposals.map(p => ({ ...p, status: "accepted" as const })),
        };
      }));

      // Refresh data based on what was accepted
      if (hasApiSceneProposals) {
        // Refresh scenes
        const scenesRes = await fetch(`${API_BASE}/api/narrative/interactions`);
        if (scenesRes.ok) {
          const scenesData = await scenesRes.json();
          setScenes(mapScenesFromApi(scenesData));
        }
        apiProposals
          .filter(p => p.type === "add_scene")
          .forEach(p => {
            if (p.scene?.participantIds?.length) {
              enqueueAutoPortraits(p.scene.participantIds);
            }
          });
        const apiSceneIds = apiProposals
          .filter(p => p.type === "add_scene" && p.scene?.id)
          .map(p => p.scene!.id as string);
        if (apiSceneIds.length > 0) {
          enqueueAutoSceneImages(apiSceneIds);
        }
      }

      // Refresh entities
      const entitiesRes = await fetch(`${API_BASE}/api/narrative/entities`);
      if (entitiesRes.ok) {
        const entitiesData = await entitiesRes.json();
        const mapped = mapEntitiesFromApi(entitiesData);
        entitiesRef.current = mapped;
        setEntities(mapped);
      }
      const apiEntityIds = apiProposals
        .filter((proposal) => proposal.type === "add_entity" && proposal.entity?.id)
        .map((proposal) => proposal.entity!.id as string);
      if (apiEntityIds.length > 0) {
        enqueueAutoPortraits(apiEntityIds);
      }

      // Refresh relationships if any relationship proposals
      if (apiProposals.some(p => p.type === 'add_relationship' || p.type === 'relationship')) {
        const relsRes = await fetch(`${API_BASE}/api/narrative/relationships`);
        if (relsRes.ok) {
          const relsData = await relsRes.json();
          setRelationships(relsData.map((r: any) => ({
            id: r.id,
            sourceId: r.source || r.sourceId,
            targetId: r.target || r.targetId,
            sourceName: r.sourceName,
            targetName: r.targetName,
            type: r.type,
            description: r.description,
          })));
        }
      }

      // Refresh session status to update uncommitted changes
      refreshSessionStatus();
    } catch (error) {
      console.error("Failed to accept all proposals:", error);
    }
  };

  // Demo mode - use local responses for instant navigation
  // Set to false to use real API with narrative graph
  const USE_DEMO_MODE = false;

  // Detect navigation intent and extract target entity
  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    // Auto-dismiss stale proposals: close review modal and reject all pending proposals
    if (reviewingProposals) {
      // Sync partial decisions back to messages state before closing
      if (reviewingMessageId) {
        setMessages(prev => prev.map(msg => {
          if (msg.id !== reviewingMessageId) return msg;
          return { ...msg, proposals: reviewingProposals };
        }));
      }
      setReviewingProposals(null);
      setReviewingMessageId(null);
      setPreviewPortrait(null);
      setRefineFeedback("");
    }

    // Reject all pending proposals across all messages
    {
      const pendingProposalIds: string[] = [];
      setMessages(prev => prev.map(msg => {
        if (!msg.proposals) return msg;
        const hasPending = msg.proposals.some(p => p.status === "pending");
        if (!hasPending) return msg;
        return {
          ...msg,
          proposals: msg.proposals.map(p => {
            if (p.status === "pending") {
              pendingProposalIds.push(p.id);
              return { ...p, status: "rejected" as const };
            }
            return p;
          }),
        };
      }));
      if (pendingProposalIds.length > 0) {
        console.log(`Auto-dismissed ${pendingProposalIds.length} stale proposal(s)`);
        // Fire API rejection calls in background (fire-and-forget)
        pendingProposalIds.forEach(pid => {
          fetch(`${API_BASE}/api/narrative/proposals/${pid}/decide`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision: "reject" }),
          }).catch(e => console.error("Failed to auto-reject proposal:", pid, e));
        });
      }
    }

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input.trim();
    setInput("");
    setIsLoading(true);

    // Build context for LLM
    const { entity: focusedEntity, scene: focusedScene } = getFocusedItem();

    // For demo mode, use simulated responses (instant, supports commands)
    if (USE_DEMO_MODE) {
      // Small delay to feel natural
      await new Promise(resolve => setTimeout(resolve, 300));

      const simulatedResponse = generateSimulatedResponse(currentInput, focusedEntity, entities);
      const { cleanText, commands } = parseLLMCommands(simulatedResponse);

      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_ai`,
          role: "assistant",
          content: cleanText,
          timestamp: Date.now(),
        },
      ]);

      if (commands.length > 0) {
        executeCommands(commands);
      }
      setIsLoading(false);
      return;
    }

    // Real API mode (for when server supports navigation commands)
    const context = buildLLMContext(
      focusedEntity,
      focusedScene,
      pinnedEntities,
      entities,
      scenes,
      activeRow,
      insertPosition
    );

    try {
      // Build system prompt with optional writing style
      let systemPrompt = `You are a narrative director helping build a story world. You can control the UI using commands.
When the user asks to see an entity, use [[NAVIGATE:entity_id]].
When discussing multiple entities, pin important ones with [[PIN:entity_id]].
When suggesting scene placement, use [[NAVIGATE_SCENE:scene_id]] and [[ASK_CONFIRM:question|action]].
When the user asks to create/recreate scene art, use [[GENERATE_SCENE_IMAGE:scene_id]].
When the user asks to create/recreate a frame image, use [[GENERATE_FRAME_IMAGE:scene_id|frame_id]].
When the user asks for storyboard shots, use [[GENERATE_FRAMES:scene_id|count]] first, then generate frame images as needed.
Keep responses concise and atmospheric.`;

      if (settings.writingStylePrompt) {
        systemPrompt += `\n\n=== WRITING STYLE ===\n${settings.writingStylePrompt}`;
      }

      const res = await fetch(`${API_BASE}/api/narrative/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Opt into SSE streaming so we can render tool calls live
          "Accept": "text/event-stream",
        },
        body: JSON.stringify({
          message: currentInput,
          context: context,
          systemPrompt,
          writingStylePrompt: settings.writingStylePrompt,
          // Full selection context for proper grounding
          selection: {
            // Currently selected entity/scene (from carousel position)
            focusedEntityId: focusedEntity?.id || null,
            // Scene + frame focus resolved from a SINGLE source so they never
            // mismatch (that mismatch put new shots in the wrong scene). Priority:
            //   1. open Shot workbench (selectedFrame) — most explicit
            //   2. timeline-selected clip — but ONLY on the Production timeline
            //      (activeRow "scenes"), and it must beat the carousel scene,
            //      since the carousel isn't what you're interacting with there
            //   3. carousel / open Scene workbench
            focusedSceneId:
              (selectedFrame?.scene.id)
              ?? ((activeRow === "scenes" && timelineFocusedShot) ? timelineFocusedShot.sceneId : undefined)
              ?? (focusedScene?.id)
              ?? (selectedScene?.id)
              ?? null,
            focusedFrameId:
              (selectedFrame?.frameId)
              ?? ((activeRow === "scenes" && timelineFocusedShot) ? timelineFocusedShot.shotId : undefined)
              ?? null,
            // The image the user is LOOKING AT right now (spotlight,
            // hero, frame, or active clip). Used by the agent as the
            // primary source for edit_image / change_camera_angle so
            // edits target whatever is in view, not the entity primary.
            currentViewImage: currentViewImage
              ? { url: currentViewImage.url, label: currentViewImage.label, source: currentViewImage.source }
              : null,
            // Explicit selection tracking
            activeRow,
            currentIndex,
            // Working memory - pinned entities the user wants to focus on
            pinnedEntityIds: pinnedEntities.map(e => e.id),
            // Insert context (if user is inserting a scene)
            insertAfterSceneId: insertPosition?.beforeScene?.id || null,
            insertBeforeSceneId: insertPosition?.afterScene?.id || null,
            insertPosition: insertPosition?.position ?? null,
          },
          // Legacy fields for backwards compatibility
          focusedEntityId: focusedEntity?.id || null,
          focusedSceneId: focusedScene?.id || (selectedFrame?.scene.id ?? null),
        }),
      });

      if (!res.ok) throw new Error("Chat failed");

      // Read SSE events as they arrive. Each event is "event: NAME\ndata: JSON\n\n".
      // We parse on \n\n boundaries and dispatch by event name. The server
      // emits: turn_start → tool_call*/tool_result*/text → done (or error).
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Streaming response not available");
      const decoder = new TextDecoder();
      let buffer = "";
      let placeholderMessageId: string | null = null;
      let finalPayload: any = null;
      let streamError: string | null = null;

      const ensurePlaceholder = (msgId: string) => {
        if (placeholderMessageId) return;
        placeholderMessageId = msgId;
        setMessages((prev) => [
          ...prev,
          {
            id: msgId,
            messageId: msgId,
            role: "assistant",
            content: "",
            timestamp: Date.now(),
            toolUsage: { totalCalls: 0, steps: [] as any[] },
            isStreaming: true,
          } as Message,
        ]);
      };

      const updatePlaceholder = (mutator: (msg: Message) => Message) => {
        if (!placeholderMessageId) return;
        setMessages((prev) => prev.map(m => m.id === placeholderMessageId ? mutator(m) : m));
      };

      const handleEvent = (eventName: string, dataStr: string) => {
        let payload: any = null;
        try { payload = JSON.parse(dataStr); } catch { return; }

        if (eventName === "turn_start") {
          ensurePlaceholder(payload.messageId || `msg_${Date.now()}_ai`);
        } else if (eventName === "tool_call") {
          if (!placeholderMessageId) ensurePlaceholder(`msg_${Date.now()}_ai`);
          updatePlaceholder((msg) => ({
            ...msg,
            toolUsage: {
              totalCalls: (msg.toolUsage?.totalCalls || 0) + 1,
              steps: [
                ...(msg.toolUsage?.steps || []),
                { type: "tool_call", tool: payload.name, args: payload.arguments, timestamp: payload.timestamp, _callId: payload.id, _pending: true },
              ],
            },
          }));
        } else if (eventName === "tool_result") {
          if (!placeholderMessageId) ensurePlaceholder(`msg_${Date.now()}_ai`);
          updatePlaceholder((msg) => ({
            ...msg,
            toolUsage: {
              totalCalls: msg.toolUsage?.totalCalls || 0,
              steps: [
                // Mark the matching pending tool_call as complete
                ...(msg.toolUsage?.steps || []).map((s: any) =>
                  s.type === "tool_call" && s._callId === payload.toolCallId ? { ...s, _pending: false } : s
                ),
                { type: "tool_result", tool: payload.name, result: payload.result, error: payload.error, timestamp: payload.timestamp },
              ],
            },
          }));
        } else if (eventName === "text") {
          // Streaming text fragment (we typically only get one final text step)
          updatePlaceholder((msg) => ({ ...msg, content: payload.text || msg.content }));
        } else if (eventName === "done") {
          finalPayload = payload;
        } else if (eventName === "error") {
          streamError = payload.error || "Streaming error";
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Each SSE message is delimited by a blank line
        let sepIdx;
        while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          // Skip heartbeats / comments
          if (!rawEvent || rawEvent.startsWith(":")) continue;
          let eventName = "message";
          const dataLines: string[] = [];
          for (const line of rawEvent.split("\n")) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          }
          handleEvent(eventName, dataLines.join("\n"));
        }
      }

      if (streamError) throw new Error(streamError);
      const data = finalPayload;
      if (!data) throw new Error("Streaming ended without a 'done' event");

      const { cleanText, commands } = parseLLMCommands(data.response);

      // Extract proposals from API response (now includes scene proposals from LLM)
      const proposals: EntityProposal[] = (data.pendingProposals || []).map(mapServerProposal);
      const autoAccepted: EntityProposal[] = (data.autoAcceptedProposals || []).map(mapServerProposal);

      // Merge the final payload into the streaming placeholder (or append a
      // new message if streaming didn't fire turn_start for some reason).
      const targetMessageId = data.messageId || placeholderMessageId || `msg_${Date.now()}_ai`;
      setMessages((prev) => {
        const exists = prev.some(m => m.id === placeholderMessageId);
        if (exists) {
          return prev.map(m => m.id === placeholderMessageId ? {
            ...m,
            id: targetMessageId,
            messageId: data.messageId || m.messageId,
            content: cleanText,
            proposals: proposals.length > 0 ? proposals : undefined,
            toolUsage: data.toolUsage || m.toolUsage || null,
            isStreaming: false,
          } : m);
        }
        return [
          ...prev,
          {
            id: targetMessageId,
            messageId: data.messageId,
            role: "assistant",
            content: cleanText,
            timestamp: Date.now(),
            proposals: proposals.length > 0 ? proposals : undefined,
            toolUsage: data.toolUsage || null,
          } as Message,
        ];
      });

      if (data.narrative?.suggestCommit && data.narrative?.eventDescription) {
        setLlmCommitSuggestion(data.narrative.eventDescription);
      }

      if (autoAccepted.length > 0) {
        setAutoAcceptedProposals(autoAccepted);
        scheduleAutoAcceptedClear();
      }

      // Log tool usage for debugging
      if (data.toolUsage?.totalCalls > 0) {
        console.log(`🔧 Agent used ${data.toolUsage.totalCalls} tool call(s):`, data.toolUsage.steps);
      }

      // Refresh data after any tool that wrote to the world.
      // Visual tools (generate_portrait, edit_image, ...) set visualToolUsed.
      // Direct write tools (update_entity, create_relationship, ...) set worldWriteApplied.
      const stepsWithWrites = (data.toolUsage?.steps || []).filter(
        (step: any) => step.type === 'tool_result' && (step.result?.visualToolUsed || step.result?.worldWriteApplied)
      );
      if (stepsWithWrites.length > 0) {
        try {
          const affectedEntityIds = new Set<string>();
          const affectedSceneIds = new Set<string>();
          let entityListChanged = false;       // create / delete entity → need full list refetch
          let relationshipsChanged = false;    // create / update / delete relationship → refetch all rels
          const RELATIONSHIP_TOOLS = new Set([
            'create_relationship', 'update_relationship', 'delete_relationship',
          ]);
          const ENTITY_LIST_TOOLS = new Set([
            'create_entity', 'delete_entity',
          ]);
          const SCENE_LIST_TOOLS = new Set([
            'create_scene', 'delete_scene',
          ]);
          const ARTIFACT_TOOLS = new Set([
            'create_artifact', 'update_artifact', 'delete_artifact', 'generate_artifact_image',
          ]);
          const SCRIPT_TOOLS = new Set([
            'update_script_logline', 'update_script_synopsis', 'update_script_theme', 'update_script_write',
            'update_script_act_summaries', 'update_script_act_breakdowns',
            'add_character_summary', 'update_character_summary',
            'add_character_to_list', 'update_character_in_list',
            'add_beat', 'update_beat',
            'add_scene_list_entry', 'update_scene_list_entry', 'reorder_scene_list',
            'promote_scene_list_entry', 'resync_scene_list_entry',
          ]);
          let sceneListChanged = false;
          let artifactsChanged = false;
          let scriptChanged = false;

          let latestEntityVisualUrl: string | null = null;
          for (const step of stepsWithWrites) {
            if (step.result?.entityId) affectedEntityIds.add(step.result.entityId);
            // A freshly generated/edited image for a focused entity → remember
            // it so the spotlight carousel jumps to it after refetch.
            if (step.result?.visualToolUsed && step.result?.entityId && step.result?.imageUrl) {
              latestEntityVisualUrl = resolveImageUrl(step.result.imageUrl) || step.result.imageUrl;
            }
            if (step.result?.sceneId) affectedSceneIds.add(step.result.sceneId);
            if (step.tool && RELATIONSHIP_TOOLS.has(step.tool)) relationshipsChanged = true;
            if (step.tool && ENTITY_LIST_TOOLS.has(step.tool)) entityListChanged = true;
            if (step.tool && SCENE_LIST_TOOLS.has(step.tool)) sceneListChanged = true;
            if (step.tool && ARTIFACT_TOOLS.has(step.tool)) artifactsChanged = true;
            if (step.tool && SCRIPT_TOOLS.has(step.tool)) scriptChanged = true;
            // promote_scene_list_entry also creates a Scene — refetch scenes
            if (step.tool === 'promote_scene_list_entry') sceneListChanged = true;
            // Adding/removing a shot changes a scene's frame list — force a full
            // scenes refetch so the new shot appears in Storyboard + the scene
            // workbench without a manual page reload.
            if (step.tool === 'add_related_shot' || step.tool === 'insert_frame' || step.tool === 'delete_frame') sceneListChanged = true;
          }

          // Entities — refetch the full list when create/delete happened, or
          // refetch all touched entities when only updates happened.
          if (entityListChanged || affectedEntityIds.size > 0) {
            const entitiesResp = await fetch(`${API_BASE}/api/narrative/entities`);
            if (entitiesResp.ok) {
              const payload = await entitiesResp.json();
              const fresh = mapEntitiesFromApi(Array.isArray(payload) ? payload : (payload.entities || []));
              setEntities(fresh);
              // Keep the focused entity card in sync so the portrait + fields update
              setSelectedEntity(prev => {
                if (!prev) return prev;
                const updated = fresh.find(e => e.id === prev.entity.id);
                return updated ? { ...prev, entity: updated } : prev;
              });
            }
            // Jump the spotlight to the just-generated image (it's now in the
            // refetched entity's gallery). Original is preserved in the gallery.
            if (latestEntityVisualUrl) setPendingSpotlightUrl(latestEntityVisualUrl);
          }

          // Scenes — refetch full list on create/delete, or per-scene on update
          if (sceneListChanged) {
            const scenesResp = await fetch(`${API_BASE}/api/narrative/interactions`);
            if (scenesResp.ok) {
              const payload = await scenesResp.json();
              const freshScenes = mapScenesFromApi(Array.isArray(payload) ? payload : (payload.interactions || []));
              setScenes(freshScenes);
              setSelectedScene(prev => {
                if (!prev) return prev;
                return freshScenes.find(s => s.id === prev.id) || null;
              });
            }
          } else {
            for (const sid of Array.from(affectedSceneIds)) {
              const sceneResp = await fetch(`${API_BASE}/api/narrative/interactions/${sid}`);
              if (sceneResp.ok) {
                const sceneData = await sceneResp.json();
                // Endpoint returns the bare interaction; older code expected
                // {interaction: ...}. Accept either shape so the refresh
                // doesn't silently no-op when the wire format is bare.
                const rawInteraction = sceneData?.interaction || (sceneData?.id ? sceneData : null);
                if (rawInteraction) {
                  const [refreshedScene] = mapScenesFromApi([rawInteraction]);
                  if (refreshedScene) {
                    setScenes(prev => prev.map(s => s.id === refreshedScene.id ? refreshedScene : s));
                    if (selectedScene?.id === refreshedScene.id) {
                      setSelectedScene(refreshedScene);
                    }
                    // If a frame was just regenerated and the frame detail view is open, sync it
                    setSelectedFrame(prev => prev?.scene.id === refreshedScene.id ? { ...prev, scene: refreshedScene } : prev);
                  }
                }
              }
            }
          }

          // Relationships — single endpoint, just refetch
          if (relationshipsChanged) {
            const relsResp = await fetch(`${API_BASE}/api/narrative/relationships`);
            if (relsResp.ok) {
              const rels = await relsResp.json();
              setRelationships(Array.isArray(rels) ? rels : (rels.relationships || []));
            }
          }

          // Artifacts — refetch full list when any artifact tool ran
          if (artifactsChanged) {
            const artifactsResp = await fetch(`${API_BASE}/api/narrative/artifacts`);
            if (artifactsResp.ok) {
              const payload = await artifactsResp.json();
              const list: Artifact[] = Array.isArray(payload?.artifacts) ? payload.artifacts : [];
              const fresh = list.map((a) => ({
                ...a,
                primaryImage: a.primaryImage ? { ...a.primaryImage, url: resolveImageUrl(a.primaryImage.url) || a.primaryImage.url } : undefined,
              }));
              setArtifacts(fresh);
              // Keep selected artifact in sync if open
              setSelectedArtifact(prev => prev ? (fresh.find(a => a.id === prev.id) || null) : prev);
            }
          }

          // Script — single endpoint, just refetch if any script tool ran
          if (scriptChanged) {
            await refetchScript();
          }

          refreshSessionStatus();
        } catch (refreshErr) {
          console.warn('Failed to refresh after tool write:', refreshErr);
        }
      }

      // If new entities were proposed, refresh the entity list
      if (proposals.length > 0) {
        console.log(`📝 ${proposals.length} new proposals:`, proposals);
      }

      if (commands.length > 0) {
        executeCommands(commands);
      }

      // Update session status from response (uncommitted changes, etc.)
      if (data.worldState) {
        setSessionStatus(prev => ({
          ...prev!,
          uncommittedChanges: data.worldState.uncommittedChanges ?? prev?.uncommittedChanges ?? false,
          currentBranch: data.worldState.currentBranch ?? prev?.currentBranch ?? 'main',
          storyConsistency: data.worldState.storyConsistency ?? prev?.storyConsistency,
          pendingChanges: prev?.pendingChanges ?? {
            addedEntities: [],
            modifiedEntities: [],
            addedRelationships: [],
            addedScenes: [],
            summary: { entitiesAdded: 0, entitiesModified: 0, relationshipsAdded: 0, scenesAdded: 0, total: 0 },
          },
        }));
        // Refresh full status to get detailed pending changes
        if (data.worldState.uncommittedChanges) {
          refreshSessionStatus();
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      const simulatedResponse = generateSimulatedResponse(currentInput, focusedEntity, entities);
      const { cleanText, commands } = parseLLMCommands(simulatedResponse);

      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}_ai`,
          role: "assistant",
          content: cleanText,
          timestamp: Date.now(),
        },
      ]);

      if (commands.length > 0) {
        executeCommands(commands);
      }
    } finally {
      setIsLoading(false);
      if (insertPosition) {
        setInsertPosition(null);
      }
    }
  };

  // Simulated response for demo when API unavailable
  function generateSimulatedResponse(input: string, focused: Entity | null, allEntities: Entity[]): string {
    const lowerInput = input.toLowerCase();

    // Navigation intent keywords
    const navKeywords = ["show", "go to", "navigate", "focus", "take me", "let's see", "open", "view", "find"];
    const pinKeywords = ["pin", "remember", "track", "keep", "hold"];
    const tellKeywords = ["tell", "about", "who is", "what is", "describe", "explain"];
    const relationKeywords = ["connect", "relation", "know", "interact", "between", "link"];
    const suggestKeywords = ["suggest", "idea", "what if", "should", "could", "next", "then", "interesting"];

    // Check for entity references
    for (const entity of allEntities) {
      const nameLower = entity.name.toLowerCase();
      const firstName = entity.name.split(" ")[0].toLowerCase();
      const matchesEntity = lowerInput.includes(nameLower) || lowerInput.includes(firstName);

      if (matchesEntity) {
        // Navigation request
        if (navKeywords.some(k => lowerInput.includes(k))) {
          return `Let me show you ${entity.name}. [[NAVIGATE:${entity.id}]] ${entity.description || ""}`;
        }

        // Pin request
        if (pinKeywords.some(k => lowerInput.includes(k))) {
          return `I'll keep ${entity.name} in my working memory. [[PIN:${entity.id}]] We can reference them as we continue building the narrative.`;
        }

        // Relationship exploration - navigate to show connections
        if (relationKeywords.some(k => lowerInput.includes(k))) {
          const relationships = getEntityRelationshipsLocal(entity.id);
          if (relationships.length > 0) {
            const rel = relationships[0];
            const otherId = rel.direction === "outgoing" ? rel.targetId : rel.sourceId;
            const otherName = rel.direction === "outgoing" ? rel.targetName : rel.sourceName;
            return `${entity.name} has a key connection: ${rel.type} with ${otherName}. ${rel.description || ""} [[NAVIGATE:${entity.id}]] [[PIN:${entity.id}]] Let me also bring ${otherName} into focus. [[PIN:${otherId}]]`;
          }
        }

        // Tell me about request - navigate AND pin for working context
        if (tellKeywords.some(k => lowerInput.includes(k))) {
          const relationships = getEntityRelationshipsLocal(entity.id);
          const relSummary = relationships.length > 0
            ? ` They have ${relationships.length} connections in this world.`
            : "";
          return `${entity.name}: ${entity.description || "No description yet."}${entity.backstory ? ` ${entity.backstory}` : ""}${relSummary} [[NAVIGATE:${entity.id}]] [[PIN:${entity.id}]]`;
        }

        // Just mentioned the entity - navigate to it
        return `${entity.name} - ${entity.description || "An interesting entity in this world."} [[NAVIGATE:${entity.id}]]`;
      }
    }

    // Check for scene requests
    if (lowerInput.includes("scene") || lowerInput.includes("storyboard") || lowerInput.includes("story")) {
      return `Let me show you the scenes. [[FOCUS_ROW:scenes]] We have ${scenes.length} scenes in the storyboard so far.`;
    }

    // Check for entity list requests
    if (lowerInput.includes("entities") || lowerInput.includes("characters") || lowerInput.includes("who") || lowerInput.includes("everyone")) {
      const characters = allEntities.filter(e => e.type === "character");
      return `[[FOCUS_ROW:entities]] Here are the entities in your world. We have ${characters.length} characters and ${allEntities.length - characters.length} other entities.`;
    }

    // Check for location requests
    if (lowerInput.includes("location") || lowerInput.includes("place") || lowerInput.includes("where")) {
      const locations = allEntities.filter(e => e.type === "location");
      if (locations.length > 0) {
        return `There are ${locations.length} locations in this world: ${locations.map(l => l.name).join(", ")}. [[NAVIGATE:${locations[0].id}]]`;
      }
    }

    // Check for curse/mystery/plot keywords - proactively navigate to relevant entities
    if (lowerInput.includes("curse") || lowerInput.includes("ritual") || lowerInput.includes("mystery")) {
      const shade = allEntities.find(e => e.name.toLowerCase().includes("shade") || e.name.toLowerCase().includes("hollow"));
      const ruins = allEntities.find(e => e.name.toLowerCase().includes("sanctum") || e.name.toLowerCase().includes("ruins"));
      if (shade) {
        return `The curse... it manifests through The Hollow Shade - once human, now something between life and death. [[NAVIGATE:${shade.id}]] [[PIN:${shade.id}]] The answers may lie in the Broken Sanctum where the ritual was performed.${ruins ? ` [[PIN:${ruins.id}]]` : ""}`;
      }
    }

    // Check for danger/conflict keywords
    if (lowerInput.includes("danger") || lowerInput.includes("threat") || lowerInput.includes("enemy") || lowerInput.includes("conflict")) {
      const shade = allEntities.find(e => e.type === "creature");
      const council = allEntities.find(e => e.type === "faction");
      if (shade) {
        return `The primary threat is ${shade.name}. ${shade.description || ""} [[NAVIGATE:${shade.id}]]${council ? ` But don't overlook ${council.name} - they have their own dark secrets. [[PIN:${council.id}]]` : ""}`;
      }
    }

    // Suggestion/brainstorming - proactively suggest and navigate
    if (suggestKeywords.some(k => lowerInput.includes(k))) {
      if (focused) {
        const relationships = getEntityRelationshipsLocal(focused.id);
        if (relationships.length > 0) {
          const rel = relationships[Math.floor(Math.random() * relationships.length)];
          const otherId = rel.direction === "outgoing" ? rel.targetId : rel.sourceId;
          const otherName = rel.direction === "outgoing" ? rel.targetName : rel.sourceName;
          return `Interesting thought... ${focused.name}'s connection to ${otherName} could be deepened. ${rel.description || ""} What if we explored that tension further? [[NAVIGATE:${otherId}]] [[PIN:${focused.id}]] [[PIN:${otherId}]]`;
        }
      }
      // Suggest exploring an underexplored entity
      const draftEntities = allEntities.filter(e => e.status === "draft");
      if (draftEntities.length > 0) {
        const draft = draftEntities[0];
        return `I notice ${draft.name} is still in draft. Perhaps we should develop them further? [[NAVIGATE:${draft.id}]] [[PIN:${draft.id}]]`;
      }
    }

    // Context-aware response about focused item - suggest related exploration
    if (focused) {
      const relationships = getEntityRelationshipsLocal(focused.id);
      if (relationships.length > 0) {
        const rel = relationships[Math.floor(Math.random() * relationships.length)];
        const otherId = rel.direction === "outgoing" ? rel.targetId : rel.sourceId;
        const otherName = rel.direction === "outgoing" ? rel.targetName : rel.sourceName;
        return `You're looking at ${focused.name}. Their ${rel.type} connection with ${otherName} is intriguing - "${rel.description || ""}". Shall we explore that thread? [[PIN:${focused.id}]]`;
      }
      return `You're looking at ${focused.name}. ${focused.description || ""} What aspect would you like to develop?`;
    }

    // Default - proactively suggest the protagonist
    const protagonist = allEntities.find(e => e.type === "character" && e.name.toLowerCase().includes("silas"));
    if (protagonist) {
      return `The mists of Ashwood swirl with possibility. Perhaps we should start with ${protagonist.name}, the wanderer drawn to this cursed place? [[NAVIGATE:${protagonist.id}]]`;
    }

    const randomEntity = allEntities[Math.floor(Math.random() * allEntities.length)];
    if (randomEntity) {
      return `The mists of Ashwood swirl with possibility. Let me draw your attention to ${randomEntity.name}. [[NAVIGATE:${randomEntity.id}]]`;
    }

    return "The mists of this world swirl with possibility. Tell me - what story shall we weave today?";
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFocusInChat = (entity: Entity) => {
    setSelectedEntity(null);
    setFocusedEntity(entity);
    setInput(`Tell me more about ${entity.name}. `);
    inputRef.current?.focus();
    // Also navigate to that entity in the carousel
    const idx = entities.findIndex(e => e.id === entity.id);
    if (idx >= 0) {
      switchRow("entities");
      setCurrentIndex(idx);
    }
  };

  const exitFocusMode = () => {
    setFocusedEntity(null);
  };

  // Current items based on active row
  const currentItems = activeRow === "scenes" ? carouselItems : entities;
  const resolvedOutputIntent = normalizeStudioOutputIntent(settings.outputIntent);
  const resolvedTextPolicy = resolveStudioTextPolicy(resolvedOutputIntent, settings.textPolicy);

  // Auto-collapse expanded frames when navigating away from the expanded scene's cluster
  useEffect(() => {
    if (!expandedSceneId || activeRow !== "scenes") return;
    if (justExpandedRef.current) {
      justExpandedRef.current = false;
      return;
    }
    const item = carouselItems[currentIndex];
    if (!item) return;
    const belongsToExpanded =
      (item.kind === 'scene' && item.scene.id === expandedSceneId) ||
      (item.kind === 'frame' && item.scene.id === expandedSceneId);
    if (!belongsToExpanded) {
      // Collapse and adjust index: find where this item will be in the non-expanded list
      const sceneId = item.kind === 'scene' ? item.scene.id : item.scene.id;
      const sceneIdx = scenes.findIndex(s => s.id === sceneId);
      if (sceneIdx >= 0) setCurrentIndex(sceneIdx);
      setExpandedSceneId(null);
    }
  }, [currentIndex, expandedSceneId, activeRow, carouselItems, scenes]);

  // Get the currently focused scene/frame for LLM context
  const getActiveCarouselItem = (): { scene: Scene | null; frame: SceneFrame | null } => {
    if (activeRow !== "scenes") return { scene: null, frame: null };
    const item = carouselItems[currentIndex];
    if (!item) return { scene: null, frame: null };
    if (item.kind === 'frame') return { scene: item.scene, frame: item.frame };
    return { scene: item.scene, frame: null };
  };

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <div
      className="h-screen w-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden relative"
      // Width the canvas + fullscreen workbenches reserve on the right for the
      // chat. 420px when the side chat is open, 0 when collapsed (bottom-bar
      // mode → full-width canvas). Read via right-[var(--chat-w)] so we don't
      // thread a prop into every overlay component.
      style={{ ["--chat-w" as any]: isChatExpanded ? "420px" : "0px" }}
    >
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-[45] bg-slate-950/90 backdrop-blur-xl border-b border-white/10">
        {/* Main header row */}
        <div className="h-12 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium text-gray-200">Narrative Studio</span>
            </div>

            {/* Story Switcher */}
            <StorySwitcher onStoryChange={handleStoryChange} />
          </div>

          {/* Center: Commit status (inline) */}
          <div className="flex items-center gap-2">
            {/* Style Lock indicator — shows whether the project has style refs
                pinned. Red = no refs (every render goes wherever the model
                decides), yellow = some refs (style is partially leashed),
                green = locked (3+ refs means the model has enough signal to
                stay consistent). Click to jump to the assets view. */}
            <button
              onClick={() => { switchRow("assets"); setAssetTab("uploaded"); setAssetCategoryFilter("style"); }}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded border flex items-center gap-1 transition-colors",
                pinnedStyleAssetIds.length >= 3
                  ? "border-pink-500/40 bg-pink-500/15 text-pink-300 hover:bg-pink-500/25"
                  : pinnedStyleAssetIds.length >= 1
                    ? "border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                    : "border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
              )}
              title={
                pinnedStyleAssetIds.length >= 3
                  ? `Style locked — ${pinnedStyleAssetIds.length} reference images auto-attached to every render`
                  : pinnedStyleAssetIds.length >= 1
                    ? `Style partially locked — ${pinnedStyleAssetIds.length} ref(s). Pin 3+ for consistency.`
                    : "Style unlocked — no style references pinned. Renders will drift between aesthetics. Click to fix."
              }
            >
              <Pin className="w-2.5 h-2.5" />
              {pinnedStyleAssetIds.length >= 3
                ? `style locked ${pinnedStyleAssetIds.length}`
                : pinnedStyleAssetIds.length >= 1
                  ? `style ${pinnedStyleAssetIds.length}/3`
                  : "style unlocked"}
            </button>
            {sessionStatus?.storyConsistency && (
              <div
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded border",
                  sessionStatus.storyConsistency.errors > 0
                    ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                    : sessionStatus.storyConsistency.warnings > 0
                      ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                      : "border-green-500/40 bg-green-500/15 text-green-300"
                )}
              >
                continuity {sessionStatus.storyConsistency.errors}e/{sessionStatus.storyConsistency.warnings}w
              </div>
            )}
            {sessionStatus?.uncommittedChanges && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-green-400">
                  <GitBranch className="w-3.5 h-3.5" />
                  <span className="text-gray-500">{sessionStatus.currentBranch}</span>
                  <span className="text-gray-600">•</span>
                  <span className="text-green-300 font-medium">
                    {sessionStatus.pendingChanges?.summary.total || 0} changes
                  </span>
                </div>
                {sessionStatus.pendingChanges && (
                  <div className="flex items-center gap-1">
                    {sessionStatus.pendingChanges.summary.entitiesAdded > 0 && (
                      <span className="bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded text-[10px]">
                        +{sessionStatus.pendingChanges.summary.entitiesAdded}
                      </span>
                    )}
                    {sessionStatus.pendingChanges.summary.entitiesModified > 0 && (
                      <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded text-[10px]">
                        ~{sessionStatus.pendingChanges.summary.entitiesModified}
                      </span>
                    )}
                    {sessionStatus.pendingChanges.summary.relationshipsAdded > 0 && (
                      <span className="bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded text-[10px]">
                        +{sessionStatus.pendingChanges.summary.relationshipsAdded} rel
                      </span>
                    )}
                    {sessionStatus.pendingChanges.summary.scenesAdded > 0 && (
                      <span className="bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded text-[10px]">
                        +{sessionStatus.pendingChanges.summary.scenesAdded} scene
                      </span>
                    )}
                  </div>
                )}
                <button
                  onClick={handleOpenCommitPreview}
                  disabled={isLoadingCommitPreview}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md bg-white/10 text-gray-200 hover:bg-white/15 disabled:opacity-50 transition-colors"
                >
                  {isLoadingCommitPreview ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Eye className="w-3 h-3" />
                  )}
                  Review
                </button>
                {!showCommitInput ? (
                  <button
                    onClick={() => {
                      setShowCommitInput(true);
                      setCommitMessage(generateCommitSuggestion());
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                  >
                    <GitCommit className="w-3 h-3" />
                    Commit
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder="Commit message..."
                      className="w-48 px-2 py-1 text-[11px] rounded-md bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-green-500/50"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && commitMessage.trim()) {
                          handleCommit();
                        } else if (e.key === 'Escape') {
                          setShowCommitInput(false);
                          setCommitMessage('');
                        }
                      }}
                      autoFocus
                    />
                    <button
                      onClick={handleCommit}
                      disabled={!commitMessage.trim() || isCommitting}
                      className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md bg-green-600 text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isCommitting ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setShowCommitInput(false);
                        setCommitMessage('');
                      }}
                      className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-1">
            {/* Working Memory - Pinned Entities */}
            {pinnedEntities.length > 0 && (
              <div className="flex items-center gap-1.5 mr-2">
                <div className="flex -space-x-1.5">
                  {pinnedEntities.map((entity) => {
                    const config = entityTypeConfig[entity.type] || entityTypeConfig.character;
                    return (
                      <button
                        key={entity.id}
                        onClick={() => {
                          const idx = entities.findIndex(e => e.id === entity.id);
                          if (idx >= 0) {
                            switchRow("entities");
                            setCurrentIndex(idx);
                          }
                        }}
                        className="group relative"
                        title={entity.name}
                      >
                        <div className={cn(
                          "w-7 h-7 rounded-full overflow-hidden ring-2 ring-slate-900 transition-all group-hover:ring-amber-400",
                          config.ringColor
                        )}>
                          {entity.referenceImage ? (
                            <img src={entity.referenceImage} alt={entity.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className={cn("w-full h-full flex items-center justify-center", config.bgColor)}>
                              <config.icon className={cn("w-3.5 h-3.5", config.color)} />
                            </div>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPinnedEntities(prev => prev.filter(p => p.id !== entity.id));
                          }}
                          className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full text-white text-[8px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          ×
                        </button>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              onClick={() => setProseMode(!proseMode)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all",
                proseMode ? "bg-amber-500/20 text-amber-400" : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
              )}
              title={proseMode ? "Switch to Director Mode" : "Switch to Prose Mode"}
            >
              {proseMode ? <LayoutGrid className="w-3.5 h-3.5" /> : <PenLine className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={() => {
                const next = !isWorldDrawerOpen;
                setIsWorldDrawerOpen(next);
                if (next) {
                  setIsSettingsOpen(false);
                  setIsScratchpadOpen(false);
                }
              }}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all",
                isWorldDrawerOpen ? "bg-white/10 text-white" : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
              )}
            >
              <BookOpen className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                const next = !isScratchpadOpen;
                setIsScratchpadOpen(next);
                if (next) {
                  setIsWorldDrawerOpen(false);
                  setIsSettingsOpen(false);
                }
              }}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all",
                isScratchpadOpen ? "bg-white/10 text-white" : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
              )}
              title="Open scratchpad"
            >
              <FileText className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                const next = !isSettingsOpen;
                setIsSettingsOpen(next);
                if (next) {
                  setIsWorldDrawerOpen(false);
                  setIsScratchpadOpen(false);
                }
              }}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all",
                isSettingsOpen ? "bg-white/10 text-white" : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
              )}
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Focus Mode strip (only when entity is focused) */}
        <AnimatePresence>
          {focusedEntity && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="h-8 bg-amber-500/10 border-t border-amber-500/30 flex items-center justify-center gap-3 px-4">
                <span className="text-amber-400 text-xs flex items-center gap-1.5">
                  <span>🎯</span>
                  Focusing on: <strong className="text-amber-200">{focusedEntity.name}</strong>
                </span>
                <button
                  onClick={exitFocusMode}
                  className="px-2 py-0.5 text-[10px] rounded-full bg-white/10 text-gray-300 hover:bg-white/20 transition-colors"
                >
                  Exit Focus
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Auto-Accept Banner - Allows undo of low-risk auto-accepted changes */}
      <AnimatePresence>
        {autoAcceptedProposals && autoAcceptedProposals.length > 0 && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className={cn(
              "absolute left-0 right-0 z-40 px-4 py-1.5 flex items-center justify-between bg-blue-500/10 border-b border-blue-500/30",
              focusedEntity ? "top-20" : "top-12"
            )}
          >
            <div className="text-xs text-blue-300">
              Auto-accepted:{" "}
              <span className="text-blue-200">
                {autoAcceptedProposals.map(p => p.entity?.name || p.relationship?.type || p.scene?.title || "update").join(", ")}
              </span>
            </div>
            <button
              onClick={handleUndoAutoAccepted}
              className="px-3 py-1 text-xs rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors"
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===================== DIRECTOR MODE ===================== */}
      {!proseMode && (
        <>
          {/* Phase nav — left vertical icon rail. Collapsed to icons (w-14);
              expands on hover to reveal labels (w-52) as an overlay so the
              canvas doesn't reflow. Replaces the old top-center row that
              overflowed once the Script phase was added. Assets is pinned to
              the bottom (cross-cutting, not a pipeline phase). */}
          <nav
            className={cn(
              "absolute left-0 bottom-0 z-[44] flex flex-col gap-1 py-3 px-2 bg-slate-950/95 backdrop-blur-xl border-r border-white/10 transition-[width] duration-200 overflow-x-hidden overflow-y-auto",
              railExpanded ? "w-52" : "w-14",
              // Clear the focus-mode strip that grows the header when an entity
              // is focused (header h-12 → +h-8).
              focusedEntity ? "top-20" : "top-12"
            )}
          >
            {/* Expand / collapse toggle — explicit click, no hover-expand */}
            <button
              onClick={() => setRailExpanded((v) => !v)}
              title={railExpanded ? "Collapse nav" : "Expand nav"}
              className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-colors whitespace-nowrap flex-shrink-0 mb-1"
            >
              {railExpanded ? <ChevronLeft className="w-5 h-5 flex-shrink-0" /> : <ChevronRight className="w-5 h-5 flex-shrink-0" />}
              <span className={cn("transition-opacity duration-150 text-xs uppercase tracking-wider", railExpanded ? "opacity-100" : "opacity-0")}>
                Collapse
              </span>
            </button>
            {([
              { row: "pre-pro" as CarouselRow, label: "Style", icon: Sparkles, title: "Phase 0: Style — lock in the visual aesthetic before producing assets" },
              { row: "script" as CarouselRow, label: "Story", icon: BookOpen, title: "Phase 1: Story — logline, synopsis, themes, motifs" },
              { row: "entities" as CarouselRow, label: "World", icon: Users, count: entities.length, title: "Phase 2: World — characters, locations, relationships, lore" },
              { row: "storyboard" as CarouselRow, label: "Storyboard", icon: LayoutGrid, title: "Phase 3: Storyboard — multi-panel pages anchored to scenes" },
              { row: "screenplay" as CarouselRow, label: "Script", icon: FileText, title: "Script — the assembled screenplay (acts → scenes → shots), read-only" },
              { row: "scenes" as CarouselRow, label: "Production", icon: Film, count: scenes.length, title: "Phase 4: Production — per-shot rendering, shots within scenes" },
            ]).map((item) => {
              const active = activeRow === item.row;
              const Icon = item.icon;
              return (
                <button
                  key={item.row}
                  onClick={() => { switchRow(item.row); setCurrentIndex(0); }}
                  title={item.title}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors whitespace-nowrap flex-shrink-0",
                    active ? "bg-amber-500/20 text-amber-400" : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
                  )}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className={cn("transition-opacity duration-150", railExpanded ? "opacity-100" : "opacity-0")}>
                    {item.label}{item.count != null ? ` (${item.count})` : ""}
                  </span>
                </button>
              );
            })}
            {/* Assets — cross-cutting, pinned to the bottom */}
            <button
              onClick={() => { switchRow("assets"); setCurrentIndex(0); }}
              title="Asset library — cross-cutting reference material"
              className={cn(
                "mt-auto flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors whitespace-nowrap flex-shrink-0 border-t border-white/10 pt-3",
                activeRow === "assets" ? "bg-amber-500/20 text-amber-400" : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
              )}
            >
              <ImageIcon className="w-5 h-5 flex-shrink-0" />
              <span className={cn("transition-opacity duration-150", railExpanded ? "opacity-100" : "opacity-0")}>
                Assets ({assetsList.length})
              </span>
            </button>
          </nav>

          {/* Storyboard Strip — DEPRECATED in stage 3. The Production canvas
              is now the editing timeline, which has its own shot picker.
              The strip's scene-reorder + branch-selector functionality moved
              into the Storyboard phase (acts hierarchy). Setting the
              activeRow check to a constant false so the strip never renders
              in any phase; we keep the code for reference / branch-selector
              re-extraction. */}
          {false && activeRow === "scenes" && scenes.length > 0 && (
            <div className={cn(
              "absolute left-0 right-[var(--chat-w)] z-40 py-3 bg-gradient-to-b from-slate-950/80 to-transparent transition-all",
              focusedEntity ? "top-[7.5rem]" : "top-24"
            )}>
              <div className="px-4 mb-2 flex items-center gap-2 overflow-x-auto scrollbar-hide">
                <span className="text-[10px] uppercase tracking-wide text-gray-500">Routes</span>
                {sceneBranches.map((branch) => {
                  const isCurrent = branch.name === sessionStatus?.currentBranch || branch.isCurrent;
                  const sceneForkLabel = branch.branchType === "scene" && branch.branchPointSceneTitle
                    ? `from ${branch.branchPointSceneTitle}`
                    : null;
                  return (
                    <button
                      key={branch.id || branch.name}
                      onClick={() => handleSwitchSceneBranch(branch.name)}
                      disabled={isSwitchingSceneBranch || isCreatingSceneBranch}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border transition-colors whitespace-nowrap",
                        isCurrent
                          ? "border-amber-400/40 bg-amber-500/20 text-amber-200"
                          : "border-white/10 bg-white/5 text-gray-300 hover:border-cyan-400/40 hover:text-cyan-200",
                        (isSwitchingSceneBranch || isCreatingSceneBranch) && "opacity-60"
                      )}
                      title={branch.description || branch.name}
                    >
                      <GitBranch className="w-3.5 h-3.5" />
                      <span>{branch.name}</span>
                      {sceneForkLabel && (
                        <span className="text-[10px] text-cyan-200/80">• {sceneForkLabel}</span>
                      )}
                    </button>
                  );
                })}
                {isSwitchingSceneBranch && (
                  <span className="text-[11px] text-cyan-300">Switching...</span>
                )}
              </div>
              <StoryboardStrip
                scenes={scenes}
                selectedSceneId={selectedScene?.id}
                onSceneClick={handleSceneClick}
                onFrameClick={handleFrameClick}
                onAddScene={handleAddScene}
                onInsertScene={handleInsertScene}
                onReorderSceneDrop={handlePreviewSceneReorder}
                isReorderBusy={isPreviewingReorder || isApplyingReorder}
                onCreateBranchAtScene={handleCreateSceneBranchAtScene}
                isBranchBusy={isCreatingSceneBranch || isSwitchingSceneBranch}
              />
              {isPreviewingReorder && (
                <div className="mt-2 text-center text-[11px] text-amber-300">
                  Checking continuity impact for this reorder...
                </div>
              )}
              {isCreatingSceneBranch && (
                <div className="mt-2 text-center text-[11px] text-cyan-300">
                  Creating scene branch...
                </div>
              )}
              {reorderPreviewError && !isReorderPreviewOpen && (
                <div className="mt-2 text-center text-[11px] text-rose-300">
                  {reorderPreviewError}
                </div>
              )}
              {sceneBranchError && (
                <div className="mt-2 text-center text-[11px] text-rose-300">
                  {sceneBranchError}
                </div>
              )}
            </div>
          )}

          {/* Flex layout: canvas fills between the left phase rail (w-14) and
              the right chat sidebar (420px). Starts just under the header now
              that the phase nav is a left rail, not a top row — top-20 when an
              entity is focused (header grows by the focus-mode strip), else
              top-12. */}
          <div className={cn(
            "absolute left-14 right-[var(--chat-w)] bottom-0 flex flex-col",
            focusedEntity ? "top-20" : "top-12"
          )}>
            {/* Carousel Area - takes remaining space, clips overflow */}
            <div
              className="flex-1 min-h-0 relative overflow-hidden"
              style={{
                perspective: "1200px",
              }}
            >
              {activeRow === "scenes" ? (
                <TimelineView
                  scenes={scenes}
                  entities={entities}
                  timeline={timeline}
                  onAutoPopulate={handleAutoPopulateTimeline}
                  onAddTrack={handleAddTimelineTrack}
                  onUpdateTrack={handleUpdateTimelineTrack}
                  onDeleteTrack={handleDeleteTimelineTrack}
                  onAddClip={handleAddTimelineClip}
                  onUpdateClip={handleUpdateTimelineClip}
                  onReorderClips={handleReorderTimelineClips}
                  onDeleteClip={handleDeleteTimelineClip}
                  onSceneClick={handleSceneClick}
                  onShotClick={(scene, shot) => handleFrameClick(scene, shot, "timeline")}
                  onRegenerateShot={(scene, shot, prompt) => handleGenerateFrameImage(scene, shot, prompt)}
                  generatingShotId={generatingFrameId}
                  onGenerateVariant={handleGenerateShotVariant}
                  onPromoteVariant={handlePromoteShotVariant}
                  onDeleteVariant={handleDeleteShotVariant}
                  generatingVariantShotId={generatingVariantFrameId}
                  onCreateScene={handleCreateBlankScene}
                  onAddShotToScene={handleAddShotToScene}
                  generatingShotContentId={generatingFrameContentId}
                  onUndo={undoTimeline}
                  onRedo={redoTimeline}
                  canUndo={canUndoTimeline}
                  canRedo={canRedoTimeline}
                  onSelectedShotChange={setTimelineFocusedShot}
                />
              ) : activeRow === "entities" ? (
                <EntityWorkbench
                  entities={entities}
                  relationships={relationships}
                  focusedDetail={selectedEntity}
                  onFocusEntity={(id) => {
                    const ent = entities.find((e) => e.id === id);
                    if (ent) handleEntityClick(ent);
                  }}
                  onSaveFields={handleSaveEntityFields}
                  onGeneratePortrait={(entity, prompt) => handleGenerateEntityPortrait(entity, prompt)}
                  isGeneratingPortrait={isGeneratingPortrait}
                  onGenerateVariations={(entity, prompt) => handleGeneratePortraitVariations(entity, prompt, 4)}
                  isGeneratingVariations={isGeneratingVariations}
                  portraitVariations={portraitVariations}
                  variationRunGeneratedCount={variationRunGeneratedCount}
                  onSelectVariation={handleSelectPortraitVariation}
                  onRemoveVariation={handleRemoveVariation}
                  onAddGalleryImage={handleAddEntityGalleryImage}
                  onPromoteGalleryImage={handlePromoteGalleryImage}
                  onRemoveGalleryImage={handleRemoveGalleryImage}
                  onGenerateCharacterSheet={handleGenerateCharacterSheet}
                  onAddRelationship={handleAddRelationship}
                  onDeleteRelationship={handleDeleteRelationship}
                  onFocusInChat={(detail) => handleFocusInChat(detail)}
                  onExit={() => { setSelectedEntity(null); exitFocusMode(); }}
                  spotlightUrl={pendingSpotlightUrl}
                  onCurrentViewImageChange={setEntityWorkbenchSpotlight as any}
                />
              ) : activeRow === "script" ? (
                <ScriptPhaseView
                  script={scriptDoc}
                  entities={entities}
                  scenes={scenes}
                  onScalarUpdate={handleScriptScalarUpdate}
                  onAddCharacterSummary={handleAddCharacterSummary}
                  onUpdateCharacterSummary={handleUpdateCharacterSummary}
                  onDeleteCharacterSummary={handleDeleteCharacterSummary}
                  onAddCharacterListEntry={handleAddCharacterListEntry}
                  onUpdateCharacterListEntry={handleUpdateCharacterListEntry}
                  onDeleteCharacterListEntry={handleDeleteCharacterListEntry}
                  onAddBeat={handleAddBeat}
                  onUpdateBeat={handleUpdateBeat}
                  onDeleteBeat={handleDeleteBeat}
                  onAddSceneListEntry={handleAddSceneListEntry}
                  onUpdateSceneListEntry={handleUpdateSceneListEntry}
                  onDeleteSceneListEntry={handleDeleteSceneListEntry}
                  onReorderSceneList={handleReorderSceneList}
                  onPromoteSceneListEntry={handlePromoteSceneListEntry}
                  onResyncSceneListEntry={handleResyncSceneListEntry}
                  onJumpToScene={(sceneId) => {
                    const s = scenes.find(sc => sc.id === sceneId);
                    if (s) { switchRow("scenes"); handleSceneClick(s); }
                  }}
                />
              ) : activeRow === "storyboard" ? (
                <StoryboardView
                  storyboards={storyboards}
                  scenes={scenes}
                  entities={entities}
                  acts={acts}
                  scriptChunk={storyboardScript}
                  onScriptChunkChange={setStoryboardScript}
                  title={storyboardTitle}
                  onTitleChange={setStoryboardTitle}
                  panelCount={storyboardPanelCount}
                  onPanelCountChange={setStoryboardPanelCount}
                  model={storyboardModel}
                  onModelChange={setStoryboardModel}
                  isGenerating={isGeneratingStoryboard}
                  onGenerate={handleGenerateStoryboard}
                  onSelectStoryboard={setSelectedStoryboard}
                  onExtractPanel={handleExtractPanel}
                  onOpenScene={(sceneId) => {
                    const s = scenes.find(sc => sc.id === sceneId);
                    if (s) handleSceneClick(s);
                  }}
                  onSeedFromScene={(sceneId) => {
                    const s = scenes.find(sc => sc.id === sceneId);
                    if (!s) return;
                    const sceneIdx = scenes.findIndex(sc => sc.id === s.id);
                    setStoryboardScript(s.prose || s.title || "");
                    setStoryboardTitle(`Scene ${sceneIdx + 1} — ${s.title}`);
                  }}
                  onSceneClick={handleSceneClick}
                  onFrameClick={handleFrameClick}
                  onGenerateStoryboardForScene={handleGenerateStoryboardForScene}
                  isGeneratingStoryboardForScene={isGeneratingStoryboard}
                  onAddAct={handleAddAct}
                  onUpdateAct={handleUpdateAct}
                  onDeleteAct={handleDeleteAct}
                  onReorderActs={handleReorderActs}
                  onAssignSceneToAct={handleAssignSceneToAct}
                  onCreateBlankScene={handleCreateBlankScene}
                />
              ) : activeRow === "screenplay" ? (
                <ScreenplayView
                  script={scriptDoc}
                  scenes={scenes}
                  acts={acts}
                  entities={entities}
                  onJumpToScene={(sceneId) => {
                    const s = scenes.find((sc) => sc.id === sceneId);
                    if (s) { switchRow("scenes"); handleSceneClick(s); }
                  }}
                  onJumpToShot={(sceneId, shotId) => {
                    const s = scenes.find((sc) => sc.id === sceneId);
                    const shot = s?.frames?.find((f) => f.id === shotId);
                    if (s && shot) { switchRow("scenes"); handleFrameClick(s, shot, "timeline"); }
                  }}
                />
              ) : activeRow === "pre-pro" ? (
                <PreProductionView
                  visualStylePrompt={settings.visualStylePrompt}
                  onVisualStylePromptChange={(p) => updateSettings({ visualStylePrompt: p })}
                  visualPresets={VISUAL_STYLE_PRESETS}
                  onApplyPreset={(preset) => updateSettings({ visualStylePrompt: preset.prompt, visualPresetId: preset.id, visualPresetName: preset.name } as any)}
                  styleAssets={assetsList.filter((a) => pinnedStyleAssetIds.includes(a.id))}
                  unpinnedStyleAssets={assetsList.filter((a) => a.category === "style" && !pinnedStyleAssetIds.includes(a.id))}
                  onTogglePin={handleToggleStylePin}
                  onUploadStyleRef={() => { setUploadCategory("style"); switchRow("assets"); setAssetTab("uploaded"); }}
                  testPrompts={TEST_RENDER_PROMPTS}
                  testResults={testRenderResults}
                  isRunningTests={isRunningTestRenders}
                  onRunTests={handleRunTestRenders}
                  aspectRatio={settings.aspectRatio || "16:9"}
                  onAspectRatioChange={(ratio) => updateSettings({ aspectRatio: ratio })}
                  imageModel={settings.imageModel || "nano-banana"}
                  onImageModelChange={(model) => updateSettings({ imageModel: model })}
                />
              ) : (
                <AssetsView
                  assets={assetsList}
                  generatedAssets={generatedAssetsList}
                  entities={entities}
                  pinnedStyleAssetIds={pinnedStyleAssetIds}
                  tab={assetTab}
                  onTabChange={(t) => {
                    setAssetTab(t);
                    if (t === "generated") refetchGeneratedAssets();
                  }}
                  categoryFilter={assetCategoryFilter}
                  onCategoryFilterChange={setAssetCategoryFilter}
                  searchQuery={assetSearchQuery}
                  onSearchQueryChange={setAssetSearchQuery}
                  uploadCategory={uploadCategory}
                  onUploadCategoryChange={setUploadCategory}
                  isUploading={isUploadingAssets}
                  isDraggingFiles={isDraggingFiles}
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingFiles(true); }}
                  onDragLeave={() => setIsDraggingFiles(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingFiles(false);
                    if (e.dataTransfer.files?.length) handleUploadAssetFiles(e.dataTransfer.files);
                  }}
                  onClickUpload={() => assetFileInputRef.current?.click()}
                  fileInputRef={assetFileInputRef}
                  onFilesPicked={(files) => handleUploadAssetFiles(files)}
                  onSelectAsset={setSelectedAsset}
                  onSelectGeneratedAsset={setSelectedGeneratedAsset}
                />
              )}
            </div>

            {/* Collapsed state — centered bottom quick-prompt bar over the
                canvas. Always available for fast one-off requests; shares the
                same input + conversation as the full side chat. Sending (click
                or Enter) opens the side panel so the exchange is visible. */}
            {!isChatExpanded && (
              <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[min(720px,calc(100vw-7rem-3rem))] px-2">
                <div className="flex items-end gap-2 bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-2">
                  <button
                    onClick={() => setIsChatExpanded(true)}
                    title={unseenReplies > 0 ? `Open chat — ${unseenReplies} new repl${unseenReplies === 1 ? "y" : "ies"}` : "Open full chat"}
                    className="relative flex-shrink-0 h-10 px-3 rounded-xl text-gray-400 hover:text-gray-100 hover:bg-white/5 flex items-center gap-1.5 text-xs"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-amber-400" /> : <MessageSquare className="w-4 h-4" />}
                    {messages.length > 0 ? messages.length : ""}
                    {/* Unseen-reply badge — agent answered while collapsed */}
                    {unseenReplies > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-[10px] font-semibold text-slate-950 flex items-center justify-center">
                        {unseenReplies}
                      </span>
                    )}
                  </button>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (!input.trim() || isLoading) return;
                        handleSendMessage();
                      }
                    }}
                    placeholder={isLoading ? "Working…  (open chat to watch)" : "Quick request…  (Enter to send · stays here)"}
                    rows={1}
                    className="flex-1 bg-white/5 rounded-xl px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50 max-h-32"
                  />
                  <button
                    onClick={() => handleSendMessage()}
                    disabled={!input.trim() || isLoading}
                    className="flex-shrink-0 h-10 px-4 rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50 transition-all flex items-center"
                    title={isLoading ? "Working…" : "Send"}
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            )}

            {/* Expanded state — full right side chat panel. Reserves 420px (the
                --chat-w var the canvas + workbenches read). Header's collapse
                button drops back to the bottom quick-prompt bar. */}
            {isChatExpanded && (
            <div className="fixed right-0 top-12 bottom-0 w-[420px] z-30 px-2 pb-2 pt-2">
        <motion.div
          layout
          className="h-full flex flex-col bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
        >
          {/* Chat Header — kept for "N messages" status. The maximize toggle
              now controls whether the message scroll area fills or collapses
              to just the input row. */}
          <button
            onClick={() => setIsChatExpanded(!isChatExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between text-sm text-gray-400 hover:text-gray-200 border-b border-white/5 flex-shrink-0"
          >
            <span className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              {messages.length} messages
            </span>
            <span className="flex items-center gap-1">
              {isChatExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </span>
          </button>

          {/* Messages — always present in sidebar mode; toggle collapses to
              0 height for users who want minimal chrome briefly. */}
          <AnimatePresence>
            {isChatExpanded && (
              <motion.div
                initial={{ flex: 0, opacity: 0 }}
                animate={{ flex: 1, opacity: 1 }}
                exit={{ flex: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="min-h-0 overflow-hidden"
              >
                <div ref={chatContainerRef} className="h-full overflow-y-auto p-4 space-y-3">
                  {messages.map((msg) => {
                    return (
                      <div key={msg.id} className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}>
                      <div className={cn(
                        "max-w-[90%] rounded-xl px-4 py-2.5 text-sm",
                        msg.role === "user" ? "bg-amber-500/20 text-gray-100" : "bg-white/5 text-gray-300"
                      )}>
                        <MarkdownMessage
                          content={msg.content}
                          className="text-sm leading-relaxed text-inherit"
                        />
                      </div>

                      {/* Inline Entity Proposals */}
                      {msg.proposals && msg.proposals.length > 0 && (
                        <div className="max-w-[85%] mt-2 border border-amber-500/30 rounded-lg bg-amber-500/5 overflow-hidden">
                          <button
                            className="w-full px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-400 font-medium flex items-center justify-between hover:bg-amber-500/20 transition-colors"
                            onClick={() => {
                              setReviewingProposals([...msg.proposals!]);
                              setReviewingMessageId(msg.id);
                              setReviewIndex(0);
                              setPreviewPortrait(null);
                              setRefineFeedback("");
                            }}
                          >
                            <span className="flex items-center gap-1.5">
                              <Eye className="w-3 h-3" />
                              New Elements ({msg.proposals.length})
                            </span>
                            <span className="text-amber-400/60 text-[10px]">Click to review</span>
                          </button>
                          <div className="p-2 space-y-1">
                            {msg.proposals.map((proposal) => (
                              <div
                                key={proposal.id}
                                className={cn(
                                  "flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs cursor-pointer",
                                  proposal.status === "accepted" && "bg-green-500/10",
                                  proposal.status === "rejected" && "bg-red-500/10 opacity-50",
                                  proposal.status === "pending" && "bg-white/5 hover:bg-white/10"
                                )}
                                onClick={() => {
                                  const idx = msg.proposals!.findIndex(p => p.id === proposal.id);
                                  setReviewingProposals([...msg.proposals!]);
                                  setReviewingMessageId(msg.id);
                                  setReviewIndex(idx >= 0 ? idx : 0);
                                  setPreviewPortrait(null);
                                  setRefineFeedback("");
                                }}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {proposal.type === "update_scene" ? (
                                    <PenLine className="w-3 h-3 text-purple-400 flex-shrink-0" />
                                  ) : proposal.type === "add_scene" ? (
                                    <Film className="w-3 h-3 text-purple-400 flex-shrink-0" />
                                  ) : proposal.type === "entity" || proposal.type === "add_entity" || proposal.type === "update_entity" ? (
                                    proposal.entity?.type === "scene" ? (
                                      <Film className="w-3 h-3 text-purple-400 flex-shrink-0" />
                                    ) : (
                                      <Plus className="w-3 h-3 text-amber-400 flex-shrink-0" />
                                    )
                                  ) : (
                                    <Link2 className="w-3 h-3 text-blue-400 flex-shrink-0" />
                                  )}
                                  <span className="text-gray-200 truncate">
                                    {proposal.type === "add_scene" || proposal.type === "update_scene"
                                      ? proposal.scene?.title
                                      : proposal.entity?.name || `${proposal.relationship?.sourceName} → ${proposal.relationship?.targetName}`}
                                  </span>
                                  <span className="text-gray-500 text-[10px] flex-shrink-0">
                                    ({proposal.type === "add_scene" || proposal.type === "update_scene"
                                      ? "scene"
                                      : proposal.entity?.type || proposal.relationship?.type})
                                  </span>
                                </div>
                                {proposal.status !== "pending" && (
                                  <span className={cn(
                                    "text-[10px] px-1.5 py-0.5 rounded",
                                    proposal.status === "accepted" && "bg-green-500/20 text-green-400",
                                    proposal.status === "rejected" && "bg-red-500/20 text-red-400"
                                  )}>
                                    {proposal.status}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                          {/* Accept All / Ignore All buttons */}
                          {msg.proposals.some(p => p.status === "pending") && (
                            <div className="px-2 py-1.5 border-t border-amber-500/20 flex justify-end gap-2">
                              <button
                                onClick={() => handleAcceptAllProposals(msg.id)}
                                className="px-2 py-1 text-[10px] rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 transition-colors"
                              >
                                Accept All
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Inline visual tool results (generate_portrait, edit_image, change_camera_angle, ...) */}
                      {(() => {
                        const steps = msg.toolUsage?.steps;
                        if (!steps) return null;
                        const visuals: Array<{ url: string; label: string; message?: string; tool?: string; key: string; entityId?: string }> = [];
                        const seen = new Set<string>();
                        for (const s of steps) {
                          if (s.type !== 'tool_result' || !s.result?.visualToolUsed) continue;
                          const urlList: string[] = Array.isArray(s.result.imageUrls) && s.result.imageUrls.length > 0
                            ? s.result.imageUrls
                            : (s.result.imageUrl ? [s.result.imageUrl] : []);
                          const baseLabel = s.result.entityName || s.result.label || s.result.sceneTitle || s.result.frameTitle || 'Generated image';
                          const stepEntityId: string | undefined = s.result.entityId;
                          urlList.forEach((rawUrl: string, idx: number) => {
                            const url = resolveImageUrl(rawUrl);
                            if (!url || seen.has(url)) return;
                            seen.add(url);
                            visuals.push({
                              url,
                              label: urlList.length > 1 ? `${baseLabel} — variation ${idx + 1}` : baseLabel,
                              message: idx === 0 ? s.result.message : undefined,
                              tool: s.tool,
                              key: `${msg.id}-vis-${visuals.length}`,
                              entityId: stepEntityId,
                            });
                          });
                        }
                        if (visuals.length === 0) return null;
                        return (
                          <div className={cn(
                            "mt-2 grid gap-2 max-w-[90%]",
                            visuals.length === 1 ? "grid-cols-1 max-w-[60%]" : "grid-cols-2"
                          )}>
                            {visuals.map((v) => {
                              // Show "Set Primary" button only when:
                              //  - this visual is associated with an entity (entityId present)
                              //  - and the URL isn't already the entity's current primary
                              const ownerEntity = v.entityId ? entities.find(e => e.id === v.entityId) : undefined;
                              const norm = (u?: string) => (u || '').replace(/^https?:\/\/[^/]+/, '');
                              const isCurrentPrimary = ownerEntity ? norm(ownerEntity.referenceImage) === norm(v.url) : false;
                              const canPromote = !!ownerEntity && !isCurrentPrimary;
                              return (
                                <div key={v.key} className="group relative rounded-lg overflow-hidden border border-amber-500/30 hover:border-amber-400/70 transition-all bg-black/30 aspect-square">
                                  <button
                                    type="button"
                                    onClick={() => openLightbox(v.url, v.label)}
                                    className="block w-full h-full"
                                  >
                                    <img
                                      src={v.url}
                                      alt={v.label}
                                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                    />
                                  </button>
                                  <div className="pointer-events-none absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent px-2 py-1.5">
                                    <p className="text-[10px] text-white font-medium truncate">{v.label}</p>
                                    {v.message && (
                                      <p className="text-[9px] text-white/60 truncate">{v.message}</p>
                                    )}
                                  </div>
                                  {canPromote && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSetPrimaryFromUrl(v.entityId!, v.url);
                                      }}
                                      title={`Set as ${ownerEntity!.name}'s primary portrait`}
                                      className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-amber-500/90 hover:bg-amber-400 text-black text-[9px] font-medium shadow-lg flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <Award className="w-2.5 h-2.5" />
                                      Set Primary
                                    </button>
                                  )}
                                  {isCurrentPrimary && (
                                    <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-200 text-[9px] font-medium border border-emerald-500/40 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Check className="w-2.5 h-2.5" />
                                      Primary
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {/* Tool Usage & Thinking */}
                      {msg.toolUsage && msg.toolUsage.totalCalls > 0 && (
                        <div className="mt-1.5 max-w-[90%]">
                          <button
                            onClick={() => {
                              setExpandedToolUsage(prev => {
                                const next = new Set(prev);
                                if (next.has(msg.id)) next.delete(msg.id); else next.add(msg.id);
                                return next;
                              });
                            }}
                            className="flex items-center gap-1.5 text-[10px] text-blue-400/60 hover:text-blue-400 transition-colors"
                          >
                            {(expandedToolUsage.has(msg.id) || msg.isStreaming) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            <Wrench className="w-3 h-3" />
                            <span>{msg.toolUsage.totalCalls} tool call{msg.toolUsage.totalCalls !== 1 ? 's' : ''}</span>
                            {!(expandedToolUsage.has(msg.id) || msg.isStreaming) && (
                              <span className="text-blue-400/40 ml-1">
                                {msg.toolUsage.steps.filter(s => s.type === 'tool_call').map(s => s.tool).join(', ')}
                              </span>
                            )}
                          </button>
                          {(expandedToolUsage.has(msg.id) || msg.isStreaming) && (
                            <div className="mt-1.5 space-y-1.5 pl-1 border-l border-blue-500/20 ml-1.5">
                              {msg.toolUsage.steps.map((step, stepIdx) => (
                                <div key={stepIdx} className="pl-3">
                                  {step.type === 'text' && step.text && (
                                    <div className="text-[11px] text-gray-400 italic leading-relaxed">
                                      {step.text}
                                    </div>
                                  )}
                                  {step.type === 'tool_call' && (
                                    <div className="flex items-center gap-1.5 text-[11px]">
                                      <span className="font-mono text-blue-300 bg-blue-500/15 px-1.5 py-0.5 rounded">{step.tool}</span>
                                      {(step as any)._pending && (
                                        <Loader2 className="w-3 h-3 text-blue-300 animate-spin" />
                                      )}
                                      {step.args && Object.keys(step.args).length > 0 && (
                                        <span className="text-gray-500 font-mono truncate max-w-[60%]">{JSON.stringify(step.args)}</span>
                                      )}
                                    </div>
                                  )}
                                  {step.type === 'tool_result' && (
                                    <div className="text-[10px] mt-0.5">
                                      {step.error ? (
                                        <span className="text-red-400">Error: {step.error}</span>
                                      ) : (
                                        <pre className="text-green-400/60 bg-black/20 rounded px-2 py-1 overflow-x-auto max-h-24 overflow-y-auto whitespace-pre-wrap">
                                          {typeof step.result === 'string' ? step.result : JSON.stringify(step.result, null, 2)}
                                        </pre>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      </div>
                    );
                  })}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white/5 rounded-xl px-4 py-2.5 text-sm text-gray-400 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Weaving...
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input — sticky to bottom of sidebar */}
          <div className="p-3 flex gap-3 flex-shrink-0 border-t border-white/5">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell me about your world..."
              rows={2}
              className="flex-1 bg-white/5 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50"
            />
            <button
              onClick={handleSendMessage}
              disabled={!input.trim() || isLoading}
              className="px-4 rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50 transition-all flex-shrink-0"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
            </div>
            )}
          </div>
        </>
      )}

      {/* ===================== PROSE MODE ===================== */}
      {proseMode && (
        <div className="absolute inset-0 top-12 flex">
          {/* Left Sidebar - Vertical Card Carousel */}
          <div className="w-72 border-r border-white/10 bg-slate-950/90 backdrop-blur-xl flex flex-col overflow-hidden">
            {/* Scenes/Entities Toggle */}
            <div className="p-3 border-b border-white/10 flex gap-2">
              <button
                onClick={() => { switchRow("scenes"); setCurrentIndex(0); }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-all",
                  activeRow === "scenes" ? "bg-amber-500/20 text-amber-400" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                )}
              >
                <Film className="w-4 h-4" />
                Scenes
              </button>
              <button
                onClick={() => { switchRow("entities"); setCurrentIndex(0); }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-all",
                  activeRow === "entities" ? "bg-amber-500/20 text-amber-400" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                )}
              >
                <Users className="w-4 h-4" />
                Entities
              </button>
            </div>

            {/* Vertical Carousel Cards */}
            <div
              className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing"
              onWheel={(e) => {
                e.preventDefault();
                // Accumulate scroll for smoother single-item scrolling
                const newAccum = proseScrollAccum + e.deltaY * 0.5;
                if (Math.abs(newAccum) >= 30) {
                  const delta = newAccum > 0 ? 1 : -1;
                  setCurrentIndex(prev => Math.max(0, Math.min(currentItems.length - 1, prev + delta)));
                  setProseScrollAccum(0);
                } else {
                  setProseScrollAccum(newAccum);
                }
              }}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center py-8">
                {(activeRow === "scenes" ? carouselItems : entities).map((rawItem, index) => {
                  const offset = index - currentIndex;
                  // Only show items within range
                  if (Math.abs(offset) > 3) return null;

                  const isEntity = activeRow === "entities";
                  const carouselItem = activeRow === "scenes" ? (rawItem as CarouselItem) : null;
                  const isFrame = carouselItem?.kind === 'frame';
                  const entity = isEntity ? (rawItem as Entity) : null;
                  const scene = carouselItem?.scene || null;
                  const frame = isFrame ? (carouselItem as Extract<CarouselItem, { kind: 'frame' }>).frame : null;
                  const isSelected = index === currentIndex;
                  const config = entity ? (entityTypeConfig[entity.type] || entityTypeConfig.character) : null;

                  // Image/name to show
                  const cardImage = isFrame ? frame?.imageUrl : (entity?.referenceImage || scene?.imageUrl);
                  const cardTitle = isFrame
                    ? (frame?.title || `F${(carouselItem as Extract<CarouselItem, { kind: 'frame' }>).frameIndex + 1}`)
                    : (entity?.name || scene?.title);
                  const cardLabel = isFrame ? "Shot" : (entity?.type || "Scene");
                  const cardLabelColor = isFrame ? "text-purple-400" : (config?.color || "text-amber-400");
                  const borderColor = isSelected
                    ? (isFrame ? "border-purple-400 shadow-xl shadow-purple-500/30" : "border-amber-400 shadow-xl shadow-amber-500/30")
                    : "border-white/10 hover:border-white/30";
                  const badgeBg = isFrame ? "bg-purple-500/20" : (config?.bgColor || "bg-amber-500/20");

                  // Vertical carousel positioning
                  const absOffset = Math.abs(offset);
                  const yOffset = offset * 140; // Spacing between cards
                  const scale = isSelected ? 1 : Math.max(0.75, 0.9 - absOffset * 0.08);
                  const opacity = isSelected ? 1 : Math.max(0.4, 0.8 - absOffset * 0.2);
                  const zIndex = isSelected ? 20 : 10 - absOffset;

                  // Double-click on the card opens the detail modal directly.
                  // The eye button (top-left) is the explicit, single-click way.
                  const openDetail = () => {
                    if (entity) {
                      handleEntityClick(entity);
                    } else if (scene) {
                      handleSceneClick(scene);
                    } else if (frame && carouselItem?.kind === 'frame') {
                      const parentScene = scenes.find(s => s.id === carouselItem.scene.id) || carouselItem.scene;
                      setSelectedFrame({ scene: parentScene, frameId: frame.id });
                      setSelectedScene(null);
                      setSelectedEntity(null);
                    }
                  };

                  return (
                    <motion.button
                      key={rawItem.id}
                      onClick={() => setCurrentIndex(index)}
                      onDoubleClick={openDetail}
                      animate={{
                        y: yOffset,
                        scale,
                        opacity,
                      }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className="absolute w-56"
                      style={{ zIndex }}
                    >
                      <div className={cn(
                        "relative rounded-xl overflow-hidden border-2 transition-all group",
                        borderColor
                      )}>
                        {/* Card Image */}
                        <div className="aspect-[4/3] relative">
                          {cardImage ? (
                            <img
                              src={cardImage}
                              alt={cardTitle}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className={cn(
                              "w-full h-full flex items-center justify-center",
                              isFrame ? "bg-purple-900/20" : (config?.bgColor || "bg-slate-800")
                            )}>
                              {config ? (
                                <config.icon className={cn("w-12 h-12", config.color)} />
                              ) : (
                                <Film className={cn("w-12 h-12", isFrame ? "text-purple-400" : "text-amber-400")} />
                              )}
                            </div>
                          )}
                          {/* Gradient overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                          {/* Open-detail button (eye) — opens the modal without changing focus
                              if you only want to peek; uses stopPropagation so it doesn't
                              also trigger the card's setCurrentIndex onClick. */}
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setCurrentIndex(index);
                              openDetail();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setCurrentIndex(index);
                                openDetail();
                              }
                            }}
                            className={cn(
                              "absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center",
                              "bg-black/60 backdrop-blur-sm border border-white/10",
                              "text-white/80 hover:text-white hover:bg-black/80 hover:border-amber-400/50",
                              "transition-all opacity-0 group-hover:opacity-100",
                              isSelected && "opacity-90"
                            )}
                            title={`Open ${isFrame ? 'frame' : entity ? 'entity' : 'scene'} details`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </div>

                          {/* Type icon badge */}
                          <div className="absolute top-2 right-2">
                            <div className={cn(
                              "w-7 h-7 rounded-full flex items-center justify-center",
                              badgeBg
                            )}>
                              {config ? (
                                <config.icon className={cn("w-4 h-4", config.color)} />
                              ) : isFrame ? (
                                <LayoutGrid className="w-4 h-4 text-purple-400" />
                              ) : (
                                <Film className="w-4 h-4 text-amber-400" />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Card Info */}
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            {isFrame ? (
                              <LayoutGrid className="w-3 h-3 text-purple-400" />
                            ) : config ? (
                              <config.icon className={cn("w-3 h-3", config.color)} />
                            ) : null}
                            <span className={cn("text-[10px] uppercase tracking-wider", cardLabelColor)}>
                              {cardLabel}
                            </span>
                          </div>
                          <h3 className="text-sm font-semibold text-white truncate">
                            {cardTitle}
                          </h3>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              {/* Scroll hint gradients */}
              <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-slate-950 to-transparent pointer-events-none" />
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none" />
            </div>

            {/* Navigation arrows */}
            <div className="p-3 border-t border-white/10 flex justify-center gap-4">
              <button
                onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                disabled={currentIndex === 0}
                className="p-2 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronUp className="w-5 h-5" />
              </button>
              <span className="py-2 px-3 text-sm text-gray-500">
                {currentIndex + 1} / {currentItems.length}
              </span>
              <button
                onClick={() => setCurrentIndex(Math.min(currentItems.length - 1, currentIndex + 1))}
                disabled={currentIndex === currentItems.length - 1}
                className="p-2 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Main Chat Area */}
          <div className="flex-1 flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
            {/* Current Entity/Scene Header - Expanded with details */}
            {currentItems[currentIndex] && (
              <div className="border-b border-white/10 bg-slate-900/50">
                {activeRow === "entities" ? (
                  <>
                    {(() => {
                      const entity = currentItems[currentIndex] as Entity;
                      const config = entityTypeConfig[entity.type] || entityTypeConfig.character;
                      const entityRels = relationships.filter(r => r.sourceId === entity.id || r.targetId === entity.id);
                      const relatedEntityIds = entityRels.map(r => r.sourceId === entity.id ? r.targetId : r.sourceId);
                      const relatedEntities = entities.filter(e => relatedEntityIds.includes(e.id)).slice(0, 5);

                      return (
                        <div className="px-6 py-4">
                          <div className="flex items-start gap-4">
                            {/* Image */}
                            <div className={cn(
                              "w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0",
                              config.bgColor
                            )}>
                              {entity.referenceImage ? (
                                <img src={entity.referenceImage} alt={entity.name} className="w-full h-full object-cover" />
                              ) : (
                                <config.icon className={cn("w-8 h-8", config.color)} />
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={cn("text-xs uppercase tracking-wider", config.color)}>{entity.type}</span>
                                {entity.status === "canon" && (
                                  <span className="text-xs text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">Canon</span>
                                )}
                              </div>
                              <h2 className="text-xl font-semibold text-white mb-1">{entity.name}</h2>
                              {entity.description && (
                                <p className="text-sm text-gray-400 line-clamp-2">{entity.description}</p>
                              )}
                              {entity.traits && entity.traits.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {entity.traits.slice(0, 4).map((trait, i) => (
                                    <span key={i} className="text-xs px-2 py-0.5 rounded bg-white/5 text-gray-400">
                                      {trait}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Related entities bubbles */}
                            {relatedEntities.length > 0 && (
                              <div className="flex -space-x-2 flex-shrink-0">
                                {relatedEntities.map((rel) => {
                                  const relConfig = entityTypeConfig[rel.type] || entityTypeConfig.character;
                                  return (
                                    <button
                                      key={rel.id}
                                      onClick={() => {
                                        const idx = entities.findIndex(e => e.id === rel.id);
                                        if (idx >= 0) {
                                          switchRow("entities");
                                          setCurrentIndex(idx);
                                        }
                                      }}
                                      className={cn(
                                        "w-10 h-10 rounded-full overflow-hidden ring-2 ring-slate-900 hover:ring-amber-400 transition-all",
                                        relConfig.ringColor
                                      )}
                                      title={rel.name}
                                    >
                                      {rel.referenceImage ? (
                                        <img src={rel.referenceImage} alt={rel.name} className="w-full h-full object-cover" />
                                      ) : (
                                        <div className={cn("w-full h-full flex items-center justify-center", relConfig.bgColor)}>
                                          <relConfig.icon className={cn("w-4 h-4", relConfig.color)} />
                                        </div>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* Actions */}
                            <button
                              onClick={() => handleEntityClick(entity)}
                              className="px-3 py-1.5 rounded-lg bg-white/5 text-sm text-gray-300 hover:bg-white/10 transition-colors flex items-center gap-2 flex-shrink-0"
                            >
                              <Eye className="w-4 h-4" />
                              Details
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    {(() => {
                      const rawItem = currentItems[currentIndex];
                      const scene = activeRow === "scenes"
                        ? (rawItem as unknown as CarouselItem).scene
                        : rawItem as unknown as Scene;
                      const participants = entities.filter(e => scene.participantIds?.includes(e.id));
                      const location = entities.find(e => e.id === scene.locationId);

                      return (
                        <div className="px-6 py-4">
                          <div className="flex items-start gap-4">
                            {/* Image */}
                            <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-800 flex items-center justify-center flex-shrink-0">
                              {scene.imageUrl ? (
                                <img src={scene.imageUrl} alt={scene.title} className="w-full h-full object-cover" />
                              ) : (
                                <Film className="w-8 h-8 text-amber-400" />
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs text-amber-400 uppercase tracking-wider">Scene</span>
                                {scene.status === "canon" && (
                                  <span className="text-xs text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">Canon</span>
                                )}
                                {location && (
                                  <span className="text-xs text-purple-400 flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {location.name}
                                  </span>
                                )}
                              </div>
                              <h2 className="text-xl font-semibold text-white mb-1">{scene.title}</h2>
                              {scene.prose && (
                                <p className="text-sm text-gray-400 line-clamp-2">{scene.prose}</p>
                              )}
                            </div>

                            {/* Participant bubbles */}
                            {participants.length > 0 && (
                              <div className="flex -space-x-2 flex-shrink-0">
                                {participants.slice(0, 5).map((participant) => {
                                  const pConfig = entityTypeConfig[participant.type] || entityTypeConfig.character;
                                  return (
                                    <button
                                      key={participant.id}
                                      onClick={() => {
                                        const idx = entities.findIndex(e => e.id === participant.id);
                                        if (idx >= 0) {
                                          switchRow("entities");
                                          setCurrentIndex(idx);
                                        }
                                      }}
                                      className={cn(
                                        "w-10 h-10 rounded-full overflow-hidden ring-2 ring-slate-900 hover:ring-amber-400 transition-all",
                                        pConfig.ringColor
                                      )}
                                      title={participant.name}
                                    >
                                      {participant.referenceImage ? (
                                        <img src={participant.referenceImage} alt={participant.name} className="w-full h-full object-cover" />
                                      ) : (
                                        <div className={cn("w-full h-full flex items-center justify-center", pConfig.bgColor)}>
                                          <pConfig.icon className={cn("w-4 h-4", pConfig.color)} />
                                        </div>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* Actions */}
                            <button
                              onClick={() => handleSceneClick(scene)}
                              className="px-3 py-1.5 rounded-lg bg-white/5 text-sm text-gray-300 hover:bg-white/10 transition-colors flex items-center gap-2 flex-shrink-0"
                            >
                              <Eye className="w-4 h-4" />
                              Details
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            )}


            {/* Messages Area */}
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-6">
              <div className="max-w-3xl mx-auto space-y-5">
              {messages.length === 0 && (
                <div className="h-full flex items-center justify-center py-20">
                  <div className="text-center max-w-md">
                    <PenLine className="w-12 h-12 text-amber-400/30 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-300 mb-2">Prose Mode</h3>
                    <p className="text-sm text-gray-500">
                      A focused writing experience. Chat with the narrative engine about your world,
                      develop characters, and craft your story.
                    </p>
                  </div>
                </div>
              )}
              {messages.map((msg) => {
                return (
                  <div key={msg.id} className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}>
                  <div className={cn(
                    "max-w-[85%] rounded-2xl px-5 py-3",
                    msg.role === "user"
                      ? "bg-amber-500/20 text-gray-100"
                      : "bg-white/[0.03] text-gray-300"
                  )}>
                    <MarkdownMessage
                      content={msg.content}
                      className="text-[14px] leading-relaxed text-inherit"
                    />
                  </div>

                  {/* Inline visual tool results (generate_portrait, edit_image, change_camera_angle, ...) */}
                  {(() => {
                    const steps = msg.toolUsage?.steps;
                    if (!steps) return null;
                    const visuals: Array<{ url: string; label: string; message?: string; tool?: string; key: string; entityId?: string }> = [];
                    const seen = new Set<string>();
                    for (const s of steps) {
                      if (s.type !== 'tool_result' || !s.result?.visualToolUsed) continue;
                      const urlList: string[] = Array.isArray(s.result.imageUrls) && s.result.imageUrls.length > 0
                        ? s.result.imageUrls
                        : (s.result.imageUrl ? [s.result.imageUrl] : []);
                      const baseLabel = s.result.entityName || s.result.label || s.result.sceneTitle || s.result.frameTitle || 'Generated image';
                      const stepEntityId: string | undefined = s.result.entityId;
                      urlList.forEach((rawUrl: string, idx: number) => {
                        const url = resolveImageUrl(rawUrl);
                        if (!url || seen.has(url)) return;
                        seen.add(url);
                        visuals.push({
                          url,
                          label: urlList.length > 1 ? `${baseLabel} — variation ${idx + 1}` : baseLabel,
                          message: idx === 0 ? s.result.message : undefined,
                          tool: s.tool,
                          key: `${msg.id}-vis-${visuals.length}`,
                          entityId: stepEntityId,
                        });
                      });
                    }
                    if (visuals.length === 0) return null;
                    return (
                      <div className={cn(
                        "mt-2 grid gap-2 max-w-[85%]",
                        visuals.length === 1 ? "grid-cols-1 max-w-[55%]" : "grid-cols-2"
                      )}>
                        {visuals.map((v) => {
                          const ownerEntity = v.entityId ? entities.find(e => e.id === v.entityId) : undefined;
                          const norm = (u?: string) => (u || '').replace(/^https?:\/\/[^/]+/, '');
                          const isCurrentPrimary = ownerEntity ? norm(ownerEntity.referenceImage) === norm(v.url) : false;
                          const canPromote = !!ownerEntity && !isCurrentPrimary;
                          return (
                            <div key={v.key} className="group relative rounded-lg overflow-hidden border border-amber-500/30 hover:border-amber-400/70 transition-all bg-black/30 aspect-square">
                              <button
                                type="button"
                                onClick={() => openLightbox(v.url, v.label)}
                                className="block w-full h-full"
                              >
                                <img
                                  src={v.url}
                                  alt={v.label}
                                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                />
                              </button>
                              <div className="pointer-events-none absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent px-2 py-1.5">
                                <p className="text-[10px] text-white font-medium truncate">{v.label}</p>
                                {v.message && (
                                  <p className="text-[9px] text-white/60 truncate">{v.message}</p>
                                )}
                              </div>
                              {canPromote && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSetPrimaryFromUrl(v.entityId!, v.url);
                                  }}
                                  title={`Set as ${ownerEntity!.name}'s primary portrait`}
                                  className="absolute top-1.5 right-1.5 px-2 py-1 rounded bg-amber-500/90 hover:bg-amber-400 text-black text-[10px] font-medium shadow-lg flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Award className="w-3 h-3" />
                                  Set Primary
                                </button>
                              )}
                              {isCurrentPrimary && (
                                <span className="absolute top-1.5 right-1.5 px-2 py-1 rounded bg-emerald-500/30 text-emerald-200 text-[10px] font-medium border border-emerald-500/40 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Check className="w-3 h-3" />
                                  Primary
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Tool Usage & Thinking */}
                  {msg.toolUsage && msg.toolUsage.totalCalls > 0 && (
                    <div className="mt-1.5 max-w-[85%]">
                      <button
                        onClick={() => {
                          setExpandedToolUsage(prev => {
                            const next = new Set(prev);
                            if (next.has(msg.id)) next.delete(msg.id); else next.add(msg.id);
                            return next;
                          });
                        }}
                        className="flex items-center gap-1.5 text-[11px] text-blue-400/60 hover:text-blue-400 transition-colors"
                      >
                        {(expandedToolUsage.has(msg.id) || msg.isStreaming) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        <Wrench className="w-3 h-3" />
                        <span>{msg.toolUsage.totalCalls} tool call{msg.toolUsage.totalCalls !== 1 ? 's' : ''}</span>
                        {!(expandedToolUsage.has(msg.id) || msg.isStreaming) && (
                          <span className="text-blue-400/40 ml-1">
                            {msg.toolUsage.steps.filter(s => s.type === 'tool_call').map(s => s.tool).join(', ')}
                          </span>
                        )}
                      </button>
                      {(expandedToolUsage.has(msg.id) || msg.isStreaming) && (
                        <div className="mt-1.5 space-y-1.5 pl-1 border-l border-blue-500/20 ml-1.5">
                          {msg.toolUsage.steps.map((step, stepIdx) => (
                            <div key={stepIdx} className="pl-3">
                              {step.type === 'text' && step.text && (
                                <div className="text-[11px] text-gray-400 italic leading-relaxed">
                                  {step.text}
                                </div>
                              )}
                              {step.type === 'tool_call' && (
                                <div className="flex items-center gap-1.5 text-[11px]">
                                  <span className="font-mono text-blue-300 bg-blue-500/15 px-1.5 py-0.5 rounded">{step.tool}</span>
                                  {step.args && Object.keys(step.args).length > 0 && (
                                    <span className="text-gray-500 font-mono">{JSON.stringify(step.args)}</span>
                                  )}
                                </div>
                              )}
                              {step.type === 'tool_result' && (
                                <div className="text-[10px] mt-0.5">
                                  {step.error ? (
                                    <span className="text-red-400">Error: {step.error}</span>
                                  ) : (
                                    <pre className="text-green-400/60 bg-black/20 rounded px-2 py-1 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
                                      {typeof step.result === 'string' ? step.result : JSON.stringify(step.result, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Proposals in Prose Mode */}
                  {msg.proposals && msg.proposals.length > 0 && (
                    <div className="max-w-[85%] mt-2 border border-amber-500/30 rounded-lg bg-amber-500/5 overflow-hidden">
                      <button
                        className="w-full px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-400 font-medium flex items-center justify-between hover:bg-amber-500/20 transition-colors"
                        onClick={() => {
                          setReviewingProposals([...msg.proposals!]);
                          setReviewingMessageId(msg.id);
                          setReviewIndex(0);
                          setPreviewPortrait(null);
                          setRefineFeedback("");
                        }}
                      >
                        <span className="flex items-center gap-1.5">
                          <Eye className="w-3 h-3" />
                          New Elements ({msg.proposals.length})
                        </span>
                        <span className="text-amber-400/60 text-[10px]">Click to review</span>
                      </button>
                      <div className="p-2 space-y-1">
                        {msg.proposals.map((proposal) => (
                          <div
                            key={proposal.id}
                            className={cn(
                              "flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs cursor-pointer",
                              proposal.status === "accepted" && "bg-green-500/10",
                              proposal.status === "rejected" && "bg-red-500/10 opacity-50",
                              proposal.status === "pending" && "bg-white/5 hover:bg-white/10"
                            )}
                            onClick={() => {
                              const idx = msg.proposals!.findIndex(p => p.id === proposal.id);
                              setReviewingProposals([...msg.proposals!]);
                              setReviewingMessageId(msg.id);
                              setReviewIndex(idx >= 0 ? idx : 0);
                              setPreviewPortrait(null);
                              setRefineFeedback("");
                            }}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {proposal.type === "update_scene" ? (
                                <PenLine className="w-3 h-3 text-purple-400 flex-shrink-0" />
                              ) : proposal.type === "add_scene" ? (
                                <Film className="w-3 h-3 text-purple-400 flex-shrink-0" />
                              ) : proposal.type === "entity" || proposal.type === "add_entity" || proposal.type === "update_entity" ? (
                                <Plus className="w-3 h-3 text-amber-400 flex-shrink-0" />
                              ) : (
                                <Link2 className="w-3 h-3 text-blue-400 flex-shrink-0" />
                              )}
                              <span className="text-gray-200 truncate">
                                {proposal.type === "add_scene" || proposal.type === "update_scene"
                                  ? proposal.scene?.title
                                  : proposal.entity?.name || `${proposal.relationship?.sourceName} → ${proposal.relationship?.targetName}`}
                              </span>
                            </div>
                            {proposal.status !== "pending" && (
                              <span className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded",
                                proposal.status === "accepted" && "bg-green-500/20 text-green-400",
                                proposal.status === "rejected" && "bg-red-500/20 text-red-400"
                              )}>
                                {proposal.status}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  </div>
                );
              })}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/5 rounded-2xl px-5 py-3 text-sm text-gray-400 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Weaving...
                  </div>
                </div>
              )}
              </div>
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-white/10">
              <div className="flex gap-3 max-w-3xl mx-auto">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Tell me about your world..."
                  rows={2}
                  className="flex-1 bg-white/5 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!input.trim() || isLoading}
                  className="px-6 rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50 transition-all self-end"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* World Drawer */}
      <AnimatePresence>
        {isWorldDrawerOpen && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            className="absolute right-0 top-12 bottom-0 w-80 border-l border-white/10 bg-slate-900/95 backdrop-blur-xl z-40 overflow-hidden"
          >
            <WorldDrawer
              entities={entities}
              scenes={scenes}
              artifacts={artifacts}
              onEntityClick={handleEntityClick}
              onSceneClick={handleSceneClick}
              onArtifactClick={(a) => setSelectedArtifact(a)}
              onClose={() => setIsWorldDrawerOpen(false)}
            />
          </motion.div>
        )}

        {/* Scratchpad Panel */}
        {isScratchpadOpen && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            className="absolute right-0 top-12 bottom-0 w-[430px] border-l border-white/10 bg-slate-900/95 backdrop-blur-xl z-40 overflow-hidden"
          >
            <DocumentsPanel
              projectId={currentProjectId}
              onClose={() => setIsScratchpadOpen(false)}
            />
          </motion.div>
        )}

        {/* Settings Panel */}
        {isSettingsOpen && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            className="absolute right-0 top-12 bottom-0 w-96 border-l border-white/10 bg-slate-900/95 backdrop-blur-xl z-40 overflow-hidden"
          >
            <div className="h-full flex flex-col">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-gray-400" />
                  Studio Settings
                </h2>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Narrative Style
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Select a narrative preset, or choose Custom to write your own story instructions.
                  </p>
                  <select
                    value={settings.narrativePresetId || ""}
                    onChange={(e) => applyNarrativeStylePreset(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-gray-200 text-sm focus:outline-none focus:border-amber-500/50"
                  >
                    <option value="" className="bg-slate-900">Custom narrative style</option>
                    {NARRATIVE_STYLE_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id} className="bg-slate-900">
                        {preset.name}
                      </option>
                    ))}
                  </select>
                  {settings.narrativePresetId ? (
                    <p className="text-xs text-gray-500">
                      {getNarrativePresetById(settings.narrativePresetId)?.description}
                    </p>
                  ) : (
                    <textarea
                      value={settings.writingStylePrompt}
                      onChange={(e) => updateSettings({ writingStylePrompt: e.target.value })}
                      placeholder="Example: Write in a dark, atmospheric tone inspired by classic noir fiction. Use evocative sensory detail and controlled pacing."
                      className="w-full h-28 px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-gray-200 placeholder:text-gray-600 text-sm resize-none focus:outline-none focus:border-amber-500/50"
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Visual Style
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Select a visual preset, or choose Custom to provide your own image direction.
                  </p>
                  <select
                    value={settings.visualPresetId || ""}
                    onChange={(e) => applyVisualStylePreset(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-gray-200 text-sm focus:outline-none focus:border-purple-500/50"
                  >
                    <option value="" className="bg-slate-900">Custom visual style</option>
                    {VISUAL_STYLE_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id} className="bg-slate-900">
                        {preset.name}
                      </option>
                    ))}
                  </select>
                  {settings.visualPresetId ? (
                    <p className="text-xs text-gray-500">
                      {getVisualPresetById(settings.visualPresetId)?.description}
                    </p>
                  ) : (
                    <textarea
                      value={settings.visualStylePrompt}
                      onChange={(e) => updateSettings({ visualStylePrompt: e.target.value })}
                      placeholder="Example: Detailed digital painting, cinematic lighting, dramatic shadows, muted palette with occasional vibrant accents."
                      className="w-full h-28 px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-gray-200 placeholder:text-gray-600 text-sm resize-none focus:outline-none focus:border-purple-500/50"
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Output Intent
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Choose how generated scene/frame images are intended to be used.
                  </p>
                  <select
                    value={resolvedOutputIntent}
                    onChange={(e) => applyOutputIntent(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50"
                  >
                    {STUDIO_OUTPUT_INTENT_OPTIONS.map((intent) => (
                      <option key={intent.id} value={intent.id} className="bg-slate-900">
                        {intent.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">
                    {STUDIO_OUTPUT_INTENT_OPTIONS.find((intent) => intent.id === resolvedOutputIntent)?.description}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Text Rendering
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Controls subtitles, captions, labels, and speech-bubble text inside generated images.
                  </p>
                  <select
                    value={resolvedTextPolicy.policy}
                    onChange={(e) => applyTextPolicy(e.target.value)}
                    disabled={resolvedTextPolicy.locked}
                    className="w-full px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {STUDIO_TEXT_POLICY_OPTIONS.map((policy) => (
                      <option key={policy.id} value={policy.id} className="bg-slate-900">
                        {policy.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">
                    {STUDIO_TEXT_POLICY_OPTIONS.find((policy) => policy.id === resolvedTextPolicy.policy)?.description}
                  </p>
                  {resolvedTextPolicy.locked && (
                    <p className="text-xs text-cyan-300/80">
                      Locked to No Text for {resolvedOutputIntent === "video-keyframe" ? "Video Keyframe" : "Cinematic Still"} output.
                    </p>
                  )}
                </div>

                {/* Status/Info */}
                <div className="pt-4 border-t border-white/10">
                  <p className="text-xs text-gray-500">
                    Settings are saved automatically per project and injected into chat + image generation.
                  </p>
                  {isSavingProjectStyle && (
                    <p className="text-xs text-amber-400 mt-1">
                      Saving style profile...
                    </p>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isStyleSetupOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[55] flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-black/70" onClick={() => setIsStyleSetupOpen(false)} />
            <motion.div
              initial={{ scale: 0.96, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 12 }}
              className="relative w-full max-w-3xl mx-4 rounded-2xl border border-white/15 bg-slate-900/95 shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">Set World Style</h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Pick a starting narrative + visual style for this world.
                  </p>
                </div>
                <button
                  onClick={() => setIsStyleSetupOpen(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-400">
                      Narrative Style
                    </label>
                    <select
                      value={settings.narrativePresetId || ""}
                      onChange={(e) => applyNarrativeStylePreset(e.target.value)}
                      className="w-full px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-gray-200 text-sm focus:outline-none focus:border-amber-500/50"
                    >
                      <option value="" className="bg-slate-900">Custom narrative style</option>
                      {NARRATIVE_STYLE_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id} className="bg-slate-900">
                          {preset.name}
                        </option>
                      ))}
                    </select>
                    {settings.narrativePresetId ? (
                      <p className="text-xs text-gray-500">
                        {getNarrativePresetById(settings.narrativePresetId)?.description}
                      </p>
                    ) : (
                      <textarea
                        value={settings.writingStylePrompt}
                        onChange={(e) => updateSettings({ writingStylePrompt: e.target.value })}
                        placeholder="Describe your narrative style..."
                        className="w-full h-24 px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-gray-200 placeholder:text-gray-600 text-sm resize-none focus:outline-none focus:border-amber-500/50"
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-400">
                      Visual Style
                    </label>
                    <select
                      value={settings.visualPresetId || ""}
                      onChange={(e) => applyVisualStylePreset(e.target.value)}
                      className="w-full px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-gray-200 text-sm focus:outline-none focus:border-purple-500/50"
                    >
                      <option value="" className="bg-slate-900">Custom visual style</option>
                      {VISUAL_STYLE_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id} className="bg-slate-900">
                          {preset.name}
                        </option>
                      ))}
                    </select>
                    {settings.visualPresetId ? (
                      <p className="text-xs text-gray-500">
                        {getVisualPresetById(settings.visualPresetId)?.description}
                      </p>
                    ) : (
                      <textarea
                        value={settings.visualStylePrompt}
                        onChange={(e) => updateSettings({ visualStylePrompt: e.target.value })}
                        placeholder="Describe your visual style..."
                        className="w-full h-24 px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-gray-200 placeholder:text-gray-600 text-sm resize-none focus:outline-none focus:border-purple-500/50"
                      />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-400">
                      Output Intent
                    </label>
                    <select
                      value={resolvedOutputIntent}
                      onChange={(e) => applyOutputIntent(e.target.value)}
                      className="w-full px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50"
                    >
                      {STUDIO_OUTPUT_INTENT_OPTIONS.map((intent) => (
                        <option key={intent.id} value={intent.id} className="bg-slate-900">
                          {intent.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500">
                      {STUDIO_OUTPUT_INTENT_OPTIONS.find((intent) => intent.id === resolvedOutputIntent)?.description}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-400">
                      Text Rendering
                    </label>
                    <select
                      value={resolvedTextPolicy.policy}
                      onChange={(e) => applyTextPolicy(e.target.value)}
                      disabled={resolvedTextPolicy.locked}
                      className="w-full px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {STUDIO_TEXT_POLICY_OPTIONS.map((policy) => (
                        <option key={policy.id} value={policy.id} className="bg-slate-900">
                          {policy.name}
                        </option>
                      ))}
                    </select>
                    {resolvedTextPolicy.locked ? (
                      <p className="text-xs text-cyan-300/80">
                        Locked to No Text for {resolvedOutputIntent === "video-keyframe" ? "Video Keyframe" : "Cinematic Still"} output.
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500">
                        {STUDIO_TEXT_POLICY_OPTIONS.find((policy) => policy.id === resolvedTextPolicy.policy)?.description}
                      </p>
                    )}
                  </div>
                </div>

                <p className="text-xs text-gray-500">
                  You can change style tracks, output intent, and text rendering later in Studio Settings.
                </p>
              </div>
              <div className="px-6 py-4 border-t border-white/10 flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    updateSettings({
                      narrativePresetId: "",
                      visualPresetId: "",
                      stylePresetId: "",
                      writingStylePrompt: "",
                      visualStylePrompt: "",
                      outputIntent: "cinematic-still",
                      textPolicy: "no-text",
                    });
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs text-gray-300 hover:bg-white/10"
                >
                  Start Custom
                </button>
                <button
                  onClick={() => setIsStyleSetupOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
                >
                  Apply Style
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCommitPreviewOpen && commitPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[58] flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-black/70" onClick={() => setIsCommitPreviewOpen(false)} />
            <motion.div
              initial={{ scale: 0.96, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 12 }}
              className="relative w-full max-w-4xl max-h-[85vh] mx-4 rounded-2xl border border-white/15 bg-slate-900/95 shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">Commit Preview</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Scope: {commitPreview.classification?.labels?.join(" + ") || "none"} •
                    {" "}Total changes: {commitPreview.pendingChanges?.summary?.total || 0}
                  </div>
                </div>
                <button
                  onClick={() => setIsCommitPreviewOpen(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto max-h-[calc(85vh-64px)] space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="text-[10px] text-gray-400 uppercase">Entities Added</div>
                    <div className="text-lg text-green-300 font-semibold">{commitPreview.pendingChanges?.summary?.entitiesAdded || 0}</div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="text-[10px] text-gray-400 uppercase">Entities Modified</div>
                    <div className="text-lg text-blue-300 font-semibold">{commitPreview.pendingChanges?.summary?.entitiesModified || 0}</div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="text-[10px] text-gray-400 uppercase">Relationships</div>
                    <div className="text-lg text-purple-300 font-semibold">{commitPreview.pendingChanges?.summary?.relationshipsAdded || 0}</div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="text-[10px] text-gray-400 uppercase">Scenes Added</div>
                    <div className="text-lg text-amber-300 font-semibold">{commitPreview.pendingChanges?.summary?.scenesAdded || 0}</div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="text-[10px] text-gray-400 uppercase">Scenes Modified</div>
                    <div className="text-lg text-cyan-300 font-semibold">{commitPreview.pendingChanges?.summary?.scenesModified || 0}</div>
                  </div>
                </div>

                {Array.isArray(commitPreview.storyDiffReadable) && commitPreview.storyDiffReadable.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs font-semibold text-gray-200 mb-3">Story Graph Diffs</div>
                    <div className="space-y-3">
                      {commitPreview.storyDiffReadable.map((diff: any) => (
                        <div key={diff.sceneId} className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <div className="text-sm text-white font-medium">{diff.title}</div>
                          <div className="text-[11px] text-gray-400">Scene position: {diff.position + 1}</div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {diff.enters?.length > 0 && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/20 text-green-300">
                                enters: {diff.enters.join(", ")}
                              </span>
                            )}
                            {diff.exits?.length > 0 && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">
                                exits: {diff.exits.join(", ")}
                              </span>
                            )}
                            {diff.firstAppearances?.length > 0 && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                                first: {diff.firstAppearances.join(", ")}
                              </span>
                            )}
                            {(diff.locationFrom || diff.locationTo) && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
                                location: {diff.locationFrom || "unknown"} → {diff.locationTo || "unknown"}
                              </span>
                            )}
                          </div>
                          {Array.isArray(diff.eventBeats) && diff.eventBeats.length > 0 && (
                            <div className="mt-2 text-[11px] text-gray-300">
                              Beats: {diff.eventBeats.join(" | ")}
                            </div>
                          )}
                          {Array.isArray(diff.issues) && diff.issues.length > 0 && (
                            <div className="mt-2 text-[11px] text-amber-300">
                              Issues: {diff.issues.map((issue: any) => issue.message).join(" • ")}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isReorderPreviewOpen && reorderPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[59] flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-black/70" onClick={isApplyingReorder ? undefined : closeReorderPreviewModal} />
            <motion.div
              initial={{ scale: 0.96, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 12 }}
              className="relative w-full max-w-3xl max-h-[85vh] mx-4 rounded-2xl border border-white/15 bg-slate-900/95 shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">Reorder Timeline Preview</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Reordering changes scene-to-scene continuity, so this preview checks for new conflicts first.
                  </div>
                </div>
                <button
                  onClick={closeReorderPreviewModal}
                  disabled={isApplyingReorder}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto max-h-[calc(85vh-132px)] space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="text-[10px] text-gray-400 uppercase">Moved Scenes</div>
                    <div className="text-lg text-amber-300 font-semibold">{reorderPreview.affectedScenes.length}</div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="text-[10px] text-gray-400 uppercase">New Errors</div>
                    <div className="text-lg text-rose-300 font-semibold">{reorderPreview.continuity.introduced.errors}</div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="text-[10px] text-gray-400 uppercase">New Warnings</div>
                    <div className="text-lg text-amber-300 font-semibold">{reorderPreview.continuity.introduced.warnings}</div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="text-[10px] text-gray-400 uppercase">Branch</div>
                    <div className="text-sm text-cyan-300 font-semibold truncate">{reorderPreview.currentBranch}</div>
                  </div>
                </div>

                <div
                  className={cn(
                    "rounded-lg border p-3 flex items-start gap-2",
                    reorderPreview.safeOnCurrentBranch
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : "border-amber-500/30 bg-amber-500/10"
                  )}
                >
                  <AlertTriangle
                    className={cn(
                      "w-4 h-4 mt-0.5",
                      reorderPreview.safeOnCurrentBranch ? "text-emerald-300" : "text-amber-300"
                    )}
                  />
                  <div className="text-xs leading-relaxed">
                    {reorderPreview.safeOnCurrentBranch ? (
                      <span className="text-emerald-200">
                        No new blocking continuity errors were introduced by this reorder on the current branch.
                      </span>
                    ) : (
                      <span className="text-amber-200">
                        This reorder introduces new continuity errors on the current branch. Apply anyway, or create a branch and apply there.
                      </span>
                    )}
                  </div>
                </div>

                {reorderPreview.affectedScenes.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs font-semibold text-gray-200 mb-3">Scene Order Changes</div>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {reorderPreview.affectedScenes.map((scene) => (
                        <div key={scene.sceneId} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs">
                          <div className="text-white">{scene.sceneTitle}</div>
                          <div className="text-gray-400 mt-0.5">
                            {scene.fromPosition + 1} → {scene.toPosition + 1} ({scene.direction})
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {reorderPreview.issues.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs font-semibold text-gray-200 mb-3">Continuity Issues</div>
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {reorderPreview.issues.map((issue) => (
                        <div
                          key={`${issue.sceneId}_${issue.code}_${issue.message}`}
                          className={cn(
                            "rounded-lg border px-3 py-2 text-xs",
                            issue.severity === "error"
                              ? "border-rose-500/30 bg-rose-500/10"
                              : "border-amber-500/30 bg-amber-500/10"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn(
                              "font-medium",
                              issue.severity === "error" ? "text-rose-200" : "text-amber-200"
                            )}>
                              {issue.sceneTitle}
                            </span>
                            <span className="text-[10px] uppercase tracking-wide text-gray-300">
                              {issue.severity}{issue.isNew ? " • new" : ""}
                            </span>
                          </div>
                          <div className="mt-1 text-gray-200">{issue.message}</div>
                          {issue.isNew && (
                            <div className="mt-1 text-[11px] text-cyan-200">
                              Suggested fix: {issue.suggestedFix}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {reorderPreview.suggestedFixes.length > 0 && (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs font-semibold text-gray-200 mb-2">Suggested Fixes</div>
                    <div className="space-y-1.5">
                      {reorderPreview.suggestedFixes.map((fix, idx) => (
                        <div key={`fix_${idx}`} className="text-xs text-cyan-200 leading-relaxed">
                          • {fix}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {reorderPreviewError && (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    {reorderPreviewError}
                  </div>
                )}
              </div>

              <div className="px-5 py-3 border-t border-white/10 flex items-center justify-end gap-2">
                <button
                  onClick={closeReorderPreviewModal}
                  disabled={isApplyingReorder}
                  className="px-3 py-2 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 text-xs disabled:opacity-50"
                >
                  Cancel
                </button>
                {!reorderPreview.safeOnCurrentBranch && (
                  <button
                    onClick={() => handleApplySceneReorder(true)}
                    disabled={isApplyingReorder}
                    className="px-3 py-2 rounded-lg bg-purple-500/20 text-purple-200 hover:bg-purple-500/30 text-xs disabled:opacity-50"
                  >
                    {isApplyingReorder ? "Applying..." : "Create Branch + Apply"}
                  </button>
                )}
                <button
                  onClick={() => handleApplySceneReorder(false)}
                  disabled={isApplyingReorder}
                  className={cn(
                    "px-3 py-2 rounded-lg text-xs disabled:opacity-50",
                    reorderPreview.safeOnCurrentBranch
                      ? "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
                      : "bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
                  )}
                >
                  {isApplyingReorder
                    ? "Applying..."
                    : reorderPreview.safeOnCurrentBranch
                      ? "Apply on Current Branch"
                      : "Apply Anyway on Current Branch"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legacy Entity Detail removed — see EntityWorkbench above. */}

      {/* Asset Detail Overlay — full image + editable metadata. Lets you
          edit name/description/tags/category, see linked entities, promote
          to entity portrait, or delete. */}
      <AnimatePresence>
        {selectedAsset && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed left-14 right-[var(--chat-w)] top-12 bottom-0 z-40 flex items-center justify-center bg-slate-950 p-4"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-6xl max-h-[95vh] flex bg-slate-950 border border-amber-500/20 rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Image */}
              <div className="flex-1 min-w-0 bg-black flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => openLightbox(selectedAsset.url, selectedAsset.name)}
                  className="w-full h-full flex items-center justify-center"
                >
                  <img
                    src={selectedAsset.url}
                    alt={selectedAsset.name}
                    className="max-h-[95vh] max-w-full object-contain"
                  />
                </button>
              </div>

              {/* Sidebar */}
              <div className="w-96 flex-shrink-0 bg-slate-900 border-l border-white/10 flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-amber-300">Asset</span>
                  <button onClick={() => setSelectedAsset(null)} className="text-gray-500 hover:text-gray-200">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
                  <div>
                    <label className="text-[11px] uppercase text-gray-500 mb-1 block">Name</label>
                    <input
                      type="text"
                      value={selectedAsset.name}
                      onChange={(e) => setSelectedAsset({ ...selectedAsset, name: e.target.value })}
                      onBlur={() => handleUpdateAsset(selectedAsset.id, { name: selectedAsset.name })}
                      className="w-full px-2 py-1.5 text-sm rounded bg-black/30 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-500/40"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] uppercase text-gray-500 mb-1 block">Category</label>
                    <select
                      value={selectedAsset.category}
                      onChange={(e) => {
                        const c = e.target.value as ProjectAsset["category"];
                        setSelectedAsset({ ...selectedAsset, category: c });
                        handleUpdateAsset(selectedAsset.id, { category: c });
                      }}
                      className="w-full px-2 py-1.5 text-xs rounded bg-black/30 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-500/40"
                    >
                      {ASSET_CATEGORY_OPTIONS.map((c) => (
                        <option key={c} value={c}>{ASSET_CATEGORY_LABEL[c]}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] uppercase text-gray-500 mb-1 block">Description</label>
                    <textarea
                      value={selectedAsset.description || ""}
                      onChange={(e) => setSelectedAsset({ ...selectedAsset, description: e.target.value })}
                      onBlur={() => handleUpdateAsset(selectedAsset.id, { description: selectedAsset.description })}
                      rows={3}
                      placeholder="Notes about what this asset is for — character backstory ref, location vibe, style direction..."
                      className="w-full px-2 py-1.5 text-xs rounded bg-black/30 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-500/40 resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] uppercase text-gray-500 mb-1 block">Tags (comma-separated)</label>
                    <input
                      type="text"
                      value={(selectedAsset.tags || []).join(", ")}
                      onChange={(e) => setSelectedAsset({ ...selectedAsset, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                      onBlur={() => handleUpdateAsset(selectedAsset.id, { tags: selectedAsset.tags })}
                      placeholder="cyberpunk, neon, gritty"
                      className="w-full px-2 py-1.5 text-xs rounded bg-black/30 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-500/40"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] uppercase text-gray-500 mb-1 block">Linked entities</label>
                    {(selectedAsset.linkedEntityIds || []).length === 0 ? (
                      <div className="text-[11px] text-gray-500 italic">No links yet.</div>
                    ) : (
                      <div className="space-y-1 mb-2">
                        {(selectedAsset.linkedEntityIds || []).map((eid) => {
                          const ent = entities.find((e) => e.id === eid);
                          if (!ent) return null;
                          return (
                            <div key={eid} className="flex items-center justify-between px-2 py-1 rounded bg-white/5 text-xs">
                              <span className="text-gray-200">{ent.name}</span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handlePromoteAssetToPortrait(selectedAsset, eid)}
                                  className="px-1.5 py-0.5 text-[10px] rounded bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 border border-amber-500/30"
                                  title="Set this asset as the entity's primary portrait"
                                >
                                  Set portrait
                                </button>
                                <button
                                  onClick={() => {
                                    const next = (selectedAsset.linkedEntityIds || []).filter((id) => id !== eid);
                                    setSelectedAsset({ ...selectedAsset, linkedEntityIds: next });
                                    handleUpdateAsset(selectedAsset.id, { linkedEntityIds: next });
                                  }}
                                  className="text-gray-500 hover:text-rose-400"
                                  title="Unlink"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <select
                      value=""
                      onChange={(e) => {
                        const eid = e.target.value;
                        if (!eid) return;
                        const next = Array.from(new Set([...(selectedAsset.linkedEntityIds || []), eid]));
                        setSelectedAsset({ ...selectedAsset, linkedEntityIds: next });
                        handleUpdateAsset(selectedAsset.id, { linkedEntityIds: next });
                      }}
                      className="w-full px-2 py-1.5 text-xs rounded bg-black/30 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-500/40"
                    >
                      <option value="">+ Link to entity...</option>
                      {entities
                        .filter((e) => !(selectedAsset.linkedEntityIds || []).includes(e.id))
                        .map((e) => (
                          <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] uppercase text-gray-500 mb-1 block">Project style</label>
                    <button
                      onClick={() => handleToggleStylePin(selectedAsset)}
                      className={cn(
                        "w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded border transition-colors",
                        pinnedStyleAssetIds.includes(selectedAsset.id)
                          ? "bg-pink-500/30 text-pink-200 border-pink-500/50 hover:bg-pink-500/40"
                          : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10"
                      )}
                      title="Pin this asset as a project style reference — auto-attached to every render in this project"
                    >
                      <Pin className="w-3 h-3" />
                      {pinnedStyleAssetIds.includes(selectedAsset.id) ? "Pinned as project style" : "Pin as project style"}
                    </button>
                    <div className="text-[10px] text-gray-500 mt-1">
                      Pinned style assets are auto-attached as references on every image generation for this project.
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/5 text-[11px] text-gray-500 space-y-1">
                    <div>File: {selectedAsset.originalFilename}</div>
                    <div>Size: {Math.round(selectedAsset.fileSize / 1024)} KB · {selectedAsset.mimeType}</div>
                    <div>Uploaded: {new Date(selectedAsset.uploadedAt).toLocaleString()}</div>
                  </div>
                </div>

                <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between">
                  <button
                    onClick={() => handleDeleteAsset(selectedAsset)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                  <button
                    onClick={() => setSelectedAsset(null)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-white/10 text-gray-300 hover:bg-white/15"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generated Asset Detail Overlay — read-only view of an image already
          attached to an entity/scene/frame/artifact, with a jump-to-source action. */}
      <AnimatePresence>
        {selectedGeneratedAsset && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed left-14 right-[var(--chat-w)] top-12 bottom-0 z-40 flex items-center justify-center bg-slate-950 p-4"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-5xl max-h-[95vh] flex bg-slate-950 border border-cyan-500/20 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex-1 min-w-0 bg-black flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => openLightbox(selectedGeneratedAsset.url, selectedGeneratedAsset.name)}
                  className="w-full h-full flex items-center justify-center"
                >
                  <img
                    src={selectedGeneratedAsset.url}
                    alt={selectedGeneratedAsset.name}
                    className="max-h-[95vh] max-w-full object-contain"
                  />
                </button>
              </div>
              <div className="w-80 flex-shrink-0 bg-slate-900 border-l border-white/10 flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-cyan-300">Generated</span>
                  <button onClick={() => setSelectedGeneratedAsset(null)} className="text-gray-500 hover:text-gray-200">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-3 text-sm">
                  <div>
                    <div className="text-[11px] uppercase text-gray-500 mb-1">Name</div>
                    <div className="text-gray-200">{selectedGeneratedAsset.name}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase text-gray-500 mb-1">Source</div>
                    <div className="text-gray-200">{selectedGeneratedAsset.sourceLabel}</div>
                    <div className="text-[11px] text-gray-500 capitalize">{selectedGeneratedAsset.sourceKind}</div>
                  </div>
                </div>
                <div className="px-5 py-3 border-t border-white/10">
                  <button
                    onClick={() => {
                      if (selectedGeneratedAsset.source === "entity") {
                        const ent = entities.find((e) => e.id === selectedGeneratedAsset.sourceId);
                        if (ent) handleEntityClick(ent);
                      } else if (selectedGeneratedAsset.source === "scene") {
                        const s = scenes.find((sc) => sc.id === selectedGeneratedAsset.sourceId);
                        if (s) handleSceneClick(s);
                      } else if (selectedGeneratedAsset.source === "frame") {
                        const s = scenes.find((sc) => sc.id === selectedGeneratedAsset.sourceParentId);
                        const f = s?.frames?.find((fr) => fr.id === selectedGeneratedAsset.sourceId);
                        if (s && f) handleFrameClick(s, f);
                      }
                      setSelectedGeneratedAsset(null);
                    }}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30 border border-cyan-500/30"
                  >
                    Open source
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Artifact Detail Overlay — image-first. The rendered image IS the artifact;
          metadata and any indexing content are tucked into a sidebar/footer. */}
      <AnimatePresence>
        {selectedArtifact && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed left-14 right-[var(--chat-w)] top-12 bottom-0 z-40 flex items-center justify-center bg-slate-950 p-4"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-6xl max-h-[95vh] flex bg-slate-950 border border-cyan-500/20 rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Hero image — fills as much as possible */}
              <div className="flex-1 min-w-0 relative bg-black flex items-center justify-center">
                {selectedArtifact.primaryImage?.url ? (
                  <button
                    type="button"
                    onClick={() => openLightbox(selectedArtifact.primaryImage!.url, selectedArtifact.title)}
                    className="w-full h-full flex items-center justify-center group"
                  >
                    <img
                      src={selectedArtifact.primaryImage.url}
                      alt={selectedArtifact.title}
                      className="max-w-full max-h-[95vh] object-contain"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
                  </button>
                ) : (
                  <div className="text-center p-12">
                    <FileText className="w-16 h-16 mx-auto text-cyan-500/30 mb-4" />
                    <p className="text-sm text-gray-400">No image generated yet</p>
                    <p className="text-xs text-gray-600 mt-1">Ask the AI to generate the visual</p>
                  </div>
                )}
              </div>

              {/* Sidebar — slim metadata column */}
              <div className="w-80 flex-shrink-0 border-l border-white/5 flex flex-col overflow-hidden">
                <div className="p-5 border-b border-white/5 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-cyan-400/80 font-medium">{selectedArtifact.format}</div>
                    <h2 className="text-lg font-semibold text-white mt-1 leading-tight">{selectedArtifact.title}</h2>
                  </div>
                  <button
                    onClick={() => setSelectedArtifact(null)}
                    className="p-1.5 text-gray-400 hover:text-white flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {selectedArtifact.publication && <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-200">{selectedArtifact.publication}</span>}
                    {selectedArtifact.byline && <span className="px-2 py-0.5 rounded-full bg-white/5 text-gray-300">{selectedArtifact.byline}</span>}
                    {selectedArtifact.inWorldDate && <span className="px-2 py-0.5 rounded-full bg-white/5 text-gray-300">{selectedArtifact.inWorldDate}</span>}
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10px]",
                      selectedArtifact.status === 'published' ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
                    )}>{selectedArtifact.status}</span>
                  </div>

                  {selectedArtifact.description && (
                    <p className="text-sm text-gray-300 leading-relaxed">{selectedArtifact.description}</p>
                  )}

                  {selectedArtifact.relatedEntityIds && selectedArtifact.relatedEntityIds.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Related</div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedArtifact.relatedEntityIds.map((rid) => {
                          const e = entities.find(x => x.id === rid);
                          if (!e) return null;
                          return (
                            <button
                              key={rid}
                              onClick={() => { setSelectedArtifact(null); handleEntityClick(e); }}
                              className="text-xs px-2 py-1 rounded-full bg-white/5 hover:bg-white/10 text-gray-200"
                            >
                              {e.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {Object.keys(selectedArtifact.content || {}).length > 0 && (
                    <details className="group">
                      <summary className="text-[10px] uppercase tracking-wider text-gray-500 cursor-pointer hover:text-gray-400 flex items-center gap-1">
                        <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                        Indexing metadata
                      </summary>
                      <div className="mt-2 space-y-2 pl-4">
                        {Object.entries(selectedArtifact.content).map(([k, v]) => (
                          <div key={k}>
                            <div className="text-[10px] uppercase tracking-wider text-cyan-400/60 mb-0.5">{k}</div>
                            <div className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap break-words">
                              {typeof v === 'string' ? v : JSON.stringify(v, null, 2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  <div className="text-[10px] text-gray-600 pt-4 border-t border-white/5">
                    {selectedArtifact.id}
                    <br />
                    Created {new Date(selectedArtifact.createdAt).toLocaleDateString()}
                    {selectedArtifact.primaryImage?.generatedAt && (
                      <><br />Image rendered {new Date(selectedArtifact.primaryImage.generatedAt).toLocaleString()}</>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scene Detail — full-screen workbench (not modal). Mirrors the
          frame-workbench shape: top scene strip, left hero+frames, right
          editable metadata tabs, bottom action bar. Chat sidebar stays
          visible alongside (z-30 vs z-40). */}
      <AnimatePresence>
        {selectedScene && (
          <motion.div
            key="scene-detail-workbench"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed left-14 right-[var(--chat-w)] top-12 bottom-0 z-40 bg-slate-950"
          >
            <SceneDetailView
              scene={selectedScene}
              scenes={scenes}
              entities={entities}
              onClose={() => {
                setSelectedScene(null);
                setFrameGenerationError(null);
              }}
              onJumpToScene={(sceneId) => {
                const target = scenes.find(s => s.id === sceneId);
                if (target) {
                  setSelectedScene(target);
                  setFrameGenerationError(null);
                }
              }}
              onEntityClick={(e) => { setSelectedScene(null); handleEntityClick(e); }}
              onSceneUpdate={handleSceneUpdate}
              onDiscuss={handleSceneDiscuss}
              onGenerateImage={handleGenerateImage}
              isGeneratingImage={isGeneratingImage}
              onGenerateFrames={handleGenerateFrames}
              onGenerateFrameImage={handleGenerateFrameImage}
              isGeneratingFrames={isGeneratingFrames}
              generatingFrameId={generatingFrameId}
              frameGenerationError={frameGenerationError}
              generationDiagnostics={sceneGenerationDiagnostics[selectedScene.id]}
              onPreviousScene={getSceneIndex(selectedScene.id) > 0 ? handlePreviousScene : undefined}
              onNextScene={getSceneIndex(selectedScene.id) < scenes.length - 1 ? handleNextScene : undefined}
              sceneIndex={getSceneIndex(selectedScene.id)}
              totalScenes={scenes.length}
              cameraAngleTarget={cameraAngleTarget}
              onCameraAngleTarget={setCameraAngleTarget}
              onGenerateCameraAngle={handleGenerateCameraAngle}
              isGeneratingCameraAngle={isGeneratingCameraAngle}
              onFrameClick={handleFrameClick}
              onGenerateSingleFrame={handleGenerateSingleFrame}
              generatingFrameContentId={generatingFrameContentId}
              batchImageProgress={batchImageProgress}
              onDuplicateFrame={handleDuplicateFrame}
              imageEditTarget={imageEditTarget}
              onImageEditTarget={(t) => { setImageEditTarget(t); if (t) setCameraAngleTarget(null); }}
              onApplyImageEdit={handleApplyImageEdit}
              isApplyingImageEdit={isApplyingImageEdit}
              projectId={currentProjectId || undefined}
              storyboards={storyboards}
              onGenerateStoryboardForScene={handleGenerateStoryboardForScene}
              isGeneratingStoryboardForScene={isGeneratingStoryboard}
              onOpenStoryboard={(storyboardId) => {
                const sb = storyboards.find((s) => s.id === storyboardId);
                if (sb) {
                  setSelectedStoryboard(sb);
                  setSelectedScene(null);
                  switchRow("storyboard");
                }
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Frame Detail — full-screen workbench (not modal). Left: large image.
          Right: inline-editable metadata. Top: frame thumbnail strip. */}
      <AnimatePresence>
        {selectedFrame && selectedFrameData && (() => {
          const frames = selectedFrame.scene.frames || [];
          const frameIdx = frames.findIndex(f => f.id === selectedFrame.frameId);
          return (
            <motion.div
              key="frame-detail-workbench"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed left-14 right-[var(--chat-w)] top-12 bottom-0 z-40 bg-slate-950"
            >
              <FrameDetailView
                scene={selectedFrame.scene}
                frame={selectedFrameData}
                frameIndex={frameIdx}
                totalFrames={frames.length}
                onClose={handleFrameClose}
                onBackToScene={handleBackToScene}
                onPreviousFrame={frameIdx > 0 ? handlePreviousFrame : undefined}
                onNextFrame={frameIdx < frames.length - 1 ? handleNextFrame : undefined}
                onJumpToFrame={handleJumpToFrame}
                onFrameFieldUpdate={handleFrameFieldUpdate}
                onFrameDelete={handleFrameDelete}
                onGenerateFrameImage={handleGenerateFrameImage}
                generatingFrameId={generatingFrameId}
                frameGenerationError={frameGenerationError}
                cameraAngleTarget={cameraAngleTarget}
                onCameraAngleTarget={setCameraAngleTarget}
                onGenerateCameraAngle={handleGenerateCameraAngle}
                isGeneratingCameraAngle={isGeneratingCameraAngle}
                onGenerateSingleFrame={handleGenerateSingleFrame}
                generatingFrameContentId={generatingFrameContentId}
                onDuplicateFrame={handleDuplicateFrame}
                imageEditTarget={imageEditTarget}
                onImageEditTarget={(t) => { setImageEditTarget(t); if (t) setCameraAngleTarget(null); }}
                onApplyImageEdit={handleApplyImageEdit}
                isApplyingImageEdit={isApplyingImageEdit}
                onOpenStoryboard={(storyboardId) => {
                  const sb = storyboards.find((s) => s.id === storyboardId);
                  if (sb) {
                    setSelectedStoryboard(sb);
                    setSelectedFrame(null);
                    switchRow("storyboard");
                  }
                }}
                onGenerateVariant={handleGenerateShotVariant}
                onPromoteVariant={handlePromoteShotVariant}
                onDeleteVariant={handleDeleteShotVariant}
                generatingVariantShotId={generatingVariantFrameId}
              />
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Proposal Review Modal */}
      <AnimatePresence>
        {reviewingProposals && reviewingProposals.length > 0 && (() => {
          const proposal = reviewingProposals[reviewIndex];
          if (!proposal) return null;
          const isEntity = proposal.entity && proposal.type !== "add_scene" && proposal.type !== "update_scene";
          const isRelationship = proposal.relationship && (proposal.type === "add_relationship" || proposal.type === "relationship");
          const isScene = proposal.type === "add_scene" || proposal.type === "update_scene" || proposal.scene;
          const typeConfig = isEntity && proposal.entity?.type
            ? entityTypeConfig[proposal.entity.type] || entityTypeConfig.character
            : null;
          const TypeIcon = typeConfig?.icon || Sparkles;
          const pendingCount = reviewingProposals.filter(p => p.status === "pending").length;
          const decidedCount = reviewingProposals.filter(p => p.status !== "pending").length;

          return (
            <motion.div
              key="review-modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-center justify-center"
            >
              <div className="absolute inset-0 bg-black/70" onClick={() => {
                // Sync proposals back to messages
                if (reviewingMessageId) {
                  setMessages(prev => prev.map(msg => {
                    if (msg.id !== reviewingMessageId) return msg;
                    return { ...msg, proposals: reviewingProposals };
                  }));
                }
                setReviewingProposals(null);
                setReviewingMessageId(null);
                setPreviewPortrait(null);
                setRefineFeedback("");
              }} />
              <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="relative bg-slate-900 rounded-2xl border border-amber-500/30 w-full max-w-lg mx-4 overflow-hidden shadow-2xl"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 bg-slate-800/80 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-white">Review Proposals</span>
                    <span className="text-xs text-gray-400">
                      {reviewIndex + 1} of {reviewingProposals.length}
                    </span>
                    {decidedCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                        {decidedCount} decided
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (reviewingMessageId) {
                        setMessages(prev => prev.map(msg => {
                          if (msg.id !== reviewingMessageId) return msg;
                          return { ...msg, proposals: reviewingProposals };
                        }));
                      }
                      setReviewingProposals(null);
                      setReviewingMessageId(null);
                      setPreviewPortrait(null);
                      setRefineFeedback("");
                    }}
                    className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Progress dots */}
                <div className="flex items-center gap-1 px-5 py-2 bg-slate-800/40">
                  {reviewingProposals.map((p, i) => (
                    <button
                      key={p.id}
                      onClick={() => { setReviewIndex(i); setPreviewPortrait(null); setRefineFeedback(""); }}
                      className={cn(
                        "w-2 h-2 rounded-full transition-all",
                        i === reviewIndex && "w-4 bg-amber-400",
                        i !== reviewIndex && p.status === "accepted" && "bg-green-500",
                        i !== reviewIndex && p.status === "rejected" && "bg-red-500",
                        i !== reviewIndex && p.status === "pending" && "bg-white/20 hover:bg-white/40",
                      )}
                    />
                  ))}
                </div>

                {/* Content */}
                <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
                  {/* Entity content */}
                  {isEntity && proposal.entity && (
                    <div className="space-y-4">
                      <div className="flex items-start gap-4">
                        {/* Portrait or type icon */}
                        {(() => {
                          const existingPortrait = proposal.type === "update_entity"
                            ? (entities.find(e => e.id === proposal.entity!.id)?.referenceImage
                              || resolveImageUrl(proposal.existingEntity?.referenceImage || proposal.existingEntity?.imageUrl))
                            : undefined;
                          const portraitSrc = previewPortrait || existingPortrait;
                          return (
                            <div className={cn(
                              "w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 ring-2",
                              typeConfig?.ringColor || "ring-amber-500/50"
                            )}>
                              {portraitSrc ? (
                                <img src={portraitSrc} alt={proposal.entity!.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className={cn("w-full h-full flex items-center justify-center", typeConfig?.bgColor || "bg-amber-500/20")}>
                                  <TypeIcon className={cn("w-8 h-8", typeConfig?.color || "text-amber-400")} />
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-medium text-white truncate">{proposal.entity.name}</h3>
                            <span className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide",
                              typeConfig?.bgColor || "bg-amber-500/20",
                              typeConfig?.color || "text-amber-400"
                            )}>
                              {proposal.entity.type}
                            </span>
                            {proposal.status !== "pending" && (
                              <span className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded",
                                proposal.status === "accepted" && "bg-green-500/20 text-green-400",
                                proposal.status === "rejected" && "bg-red-500/20 text-red-400"
                              )}>
                                {proposal.status}
                              </span>
                            )}
                          </div>
                          {proposal.entity.description && (
                            <p className="text-sm text-gray-300 leading-relaxed">{proposal.entity.description}</p>
                          )}
                        </div>
                      </div>

                      {/* Generate portrait button */}
                      {(proposal.entity.type === "character" || proposal.entity.type === "creature") && (
                        <button
                          onClick={async () => {
                            setIsGeneratingPreviewPortrait(true);
                            try {
                              const res = await fetch(`${API_BASE}/api/narrative/visual/entity/preview`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ entityData: proposal.entity, aspectRatio: "1:1" }),
                              });
                              if (res.ok) {
                                const data = await res.json();
                                setPreviewPortrait(data.imageDataUrl || data.imageUrl);
                              }
                            } catch (e) {
                              console.error("Failed to generate preview portrait:", e);
                            } finally {
                              setIsGeneratingPreviewPortrait(false);
                            }
                          }}
                          disabled={isGeneratingPreviewPortrait}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 text-xs hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                        >
                          {isGeneratingPreviewPortrait ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> Generating portrait...</>
                          ) : (
                            <><ImageIcon className="w-3 h-3" /> {previewPortrait ? "Regenerate Portrait" : "Generate Portrait"}</>
                          )}
                        </button>
                      )}

                      {/* Traits */}
                      {proposal.entity.traits && proposal.entity.traits.length > 0 && (
                        <div>
                          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Traits</span>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {proposal.entity.traits.map((trait, i) => (
                              <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 text-gray-300 border border-white/10">
                                {trait}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Backstory */}
                      {proposal.entity.backstory && (
                        <div>
                          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Backstory</span>
                          <p className="text-sm text-gray-400 mt-1 leading-relaxed">{proposal.entity.backstory}</p>
                        </div>
                      )}

                      {/* Diff display for update_entity */}
                      {proposal.type === "update_entity" && (() => {
                        const oldEntityRaw = proposal.existingEntity || entities.find(e => e.id === proposal.entity!.id);
                        if (!oldEntityRaw) return null;
                        const oldEntity = oldEntityRaw as Record<string, any>;

                        const diffArray = (oldArr: string[] = [], newArr: string[] = []) => {
                          const oldSet = new Set(oldArr);
                          const newSet = new Set(newArr);
                          return {
                            removed: oldArr.filter(x => !newSet.has(x)),
                            kept: oldArr.filter(x => newSet.has(x)),
                            added: newArr.filter(x => !oldSet.has(x)),
                          };
                        };

                        const descChanged = (proposal.entity!.description ?? "") !== (oldEntity.description ?? "");
                        const backstoryChanged = (proposal.entity!.backstory ?? "") !== (oldEntity.backstory ?? "");
                        const traitsDiff = diffArray(oldEntity.traits as string[] | undefined, proposal.entity!.traits);
                        const motivationsDiff = diffArray(oldEntity.motivations as string[] | undefined, proposal.entity!.motivations);
                        const secretsDiff = diffArray(oldEntity.secrets as string[] | undefined, proposal.entity!.secrets);

                        const traitsChanged = traitsDiff.removed.length > 0 || traitsDiff.added.length > 0;
                        const motivationsChanged = motivationsDiff.removed.length > 0 || motivationsDiff.added.length > 0;
                        const secretsChanged = secretsDiff.removed.length > 0 || secretsDiff.added.length > 0;
                        const hasChanges = descChanged || backstoryChanged || traitsChanged || motivationsChanged || secretsChanged;

                        if (!hasChanges) return null;

                        return (
                          <div className="mt-2 pt-2 border-t border-white/10">
                            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Changes</span>
                            <div className="mt-1 space-y-2">
                              {descChanged && (
                                <div>
                                  <span className="text-[10px] text-gray-500">Description</span>
                                  {oldEntity.description && (
                                    <p className="text-xs text-red-400/80 line-through leading-relaxed">{oldEntity.description}</p>
                                  )}
                                  {proposal.entity!.description && (
                                    <p className="text-xs text-green-400/80 leading-relaxed">{proposal.entity!.description}</p>
                                  )}
                                </div>
                              )}
                              {backstoryChanged && (
                                <div>
                                  <span className="text-[10px] text-gray-500">Backstory</span>
                                  {oldEntity.backstory && (
                                    <p className="text-xs text-red-400/80 line-through leading-relaxed">{oldEntity.backstory}</p>
                                  )}
                                  {proposal.entity!.backstory && (
                                    <p className="text-xs text-green-400/80 leading-relaxed">{proposal.entity!.backstory}</p>
                                  )}
                                </div>
                              )}
                              {traitsChanged && (
                                <div>
                                  <span className="text-[10px] text-gray-500">Traits</span>
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {traitsDiff.removed.map((t, i) => (
                                      <span key={`r-${i}`} className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 line-through border border-red-500/20">{t}</span>
                                    ))}
                                    {traitsDiff.kept.map((t, i) => (
                                      <span key={`k-${i}`} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/10">{t}</span>
                                    ))}
                                    {traitsDiff.added.map((t, i) => (
                                      <span key={`a-${i}`} className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">{t}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {motivationsChanged && (
                                <div>
                                  <span className="text-[10px] text-gray-500">Motivations</span>
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {motivationsDiff.removed.map((t, i) => (
                                      <span key={`r-${i}`} className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 line-through border border-red-500/20">{t}</span>
                                    ))}
                                    {motivationsDiff.kept.map((t, i) => (
                                      <span key={`k-${i}`} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/10">{t}</span>
                                    ))}
                                    {motivationsDiff.added.map((t, i) => (
                                      <span key={`a-${i}`} className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">{t}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {secretsChanged && (
                                <div>
                                  <span className="text-[10px] text-gray-500">Secrets</span>
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {secretsDiff.removed.map((t, i) => (
                                      <span key={`r-${i}`} className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 line-through border border-red-500/20">{t}</span>
                                    ))}
                                    {secretsDiff.kept.map((t, i) => (
                                      <span key={`k-${i}`} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/10">{t}</span>
                                    ))}
                                    {secretsDiff.added.map((t, i) => (
                                      <span key={`a-${i}`} className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">{t}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Relationship content */}
                  {isRelationship && proposal.relationship && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                          <Users className="w-4 h-4 text-amber-400" />
                          <span className="text-sm text-white font-medium">{proposal.relationship.sourceName}</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                          <Users className="w-4 h-4 text-amber-400" />
                          <span className="text-sm text-white font-medium">{proposal.relationship.targetName}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 uppercase tracking-wide">
                          {proposal.relationship.type}
                        </span>
                        {proposal.status !== "pending" && (
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded",
                            proposal.status === "accepted" && "bg-green-500/20 text-green-400",
                            proposal.status === "rejected" && "bg-red-500/20 text-red-400"
                          )}>
                            {proposal.status}
                          </span>
                        )}
                      </div>
                      {proposal.relationship.description && (
                        <p className="text-sm text-gray-300 leading-relaxed">{proposal.relationship.description}</p>
                      )}
                    </div>
                  )}

                  {/* Scene content */}
                  {isScene && proposal.scene && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        {proposal.type === "update_scene" ? (
                          <PenLine className="w-5 h-5 text-purple-400" />
                        ) : (
                          <Film className="w-5 h-5 text-purple-400" />
                        )}
                        <h3 className="text-lg font-medium text-white">{proposal.scene.title}</h3>
                        {proposal.status !== "pending" && (
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded",
                            proposal.status === "accepted" && "bg-green-500/20 text-green-400",
                            proposal.status === "rejected" && "bg-red-500/20 text-red-400"
                          )}>
                            {proposal.status}
                          </span>
                        )}
                      </div>
                      {proposal.scene.summary && (
                        <p className="text-sm text-gray-300 leading-relaxed">{proposal.scene.summary}</p>
                      )}
                      {proposal.scene.prose && (
                        <div className="bg-white/5 rounded-lg p-3 max-h-48 overflow-y-auto">
                          <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">{proposal.scene.prose}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* AI Refinement input */}
                  {proposal.status === "pending" && isEntity && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={refineFeedback}
                          onChange={(e) => setRefineFeedback(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && refineFeedback.trim() && !isRefining) {
                              e.preventDefault();
                              // Trigger refinement
                              (async () => {
                                setIsRefining(true);
                                try {
                                  const res = await fetch(`${API_BASE}/api/narrative/proposals/${proposal.id}/refine`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ feedback: refineFeedback }),
                                  });
                                  if (res.ok) {
                                    const data = await res.json();
                                    // Update the proposal in our local array
                                    const updated = [...reviewingProposals];
                                    updated[reviewIndex] = { ...updated[reviewIndex], ...data.refined };
                                    if (data.refined.entity) updated[reviewIndex].entity = data.refined.entity;
                                    if (data.refined.relationship) updated[reviewIndex].relationship = data.refined.relationship;
                                    if (data.refined.scene) updated[reviewIndex].scene = data.refined.scene;
                                    setReviewingProposals(updated);
                                    setRefineFeedback("");
                                    setPreviewPortrait(null); // Clear portrait since entity changed
                                  }
                                } catch (e) {
                                  console.error("Failed to refine proposal:", e);
                                } finally {
                                  setIsRefining(false);
                                }
                              })();
                            }
                          }}
                          placeholder="Ask AI to refine this... (e.g. 'Make them older and more mysterious')"
                          className="flex-1 bg-white/5 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                          disabled={isRefining}
                        />
                        <button
                          onClick={async () => {
                            if (!refineFeedback.trim() || isRefining) return;
                            setIsRefining(true);
                            try {
                              const res = await fetch(`${API_BASE}/api/narrative/proposals/${proposal.id}/refine`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ feedback: refineFeedback }),
                              });
                              if (res.ok) {
                                const data = await res.json();
                                const updated = [...reviewingProposals];
                                updated[reviewIndex] = { ...updated[reviewIndex], ...data.refined };
                                if (data.refined.entity) updated[reviewIndex].entity = data.refined.entity;
                                if (data.refined.relationship) updated[reviewIndex].relationship = data.refined.relationship;
                                if (data.refined.scene) updated[reviewIndex].scene = data.refined.scene;
                                setReviewingProposals(updated);
                                setRefineFeedback("");
                                setPreviewPortrait(null);
                              }
                            } catch (e) {
                              console.error("Failed to refine proposal:", e);
                            } finally {
                              setIsRefining(false);
                            }
                          }}
                          disabled={!refineFeedback.trim() || isRefining}
                          className="px-3 py-2 rounded-lg bg-amber-500/20 text-amber-400 text-xs hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                        >
                          {isRefining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer with navigation and actions */}
                <div className="px-5 py-3 bg-slate-800/80 border-t border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setReviewIndex(Math.max(0, reviewIndex - 1)); setPreviewPortrait(null); setRefineFeedback(""); }}
                      disabled={reviewIndex === 0}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setReviewIndex(Math.min(reviewingProposals.length - 1, reviewIndex + 1)); setPreviewPortrait(null); setRefineFeedback(""); }}
                      disabled={reviewIndex === reviewingProposals.length - 1}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  {proposal.status === "pending" ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          if (!reviewingMessageId) return;
                          await handleRejectProposal(reviewingMessageId, proposal);
                          // Update local state
                          const updated = [...reviewingProposals];
                          updated[reviewIndex] = { ...updated[reviewIndex], status: "rejected" };
                          setReviewingProposals(updated);
                          // Auto-advance to next pending
                          const nextPending = updated.findIndex((p, i) => i > reviewIndex && p.status === "pending");
                          if (nextPending >= 0) {
                            setReviewIndex(nextPending);
                            setPreviewPortrait(null);
                            setRefineFeedback("");
                          } else if (updated.every(p => p.status !== "pending")) {
                            // All decided, sync and close
                            setMessages(prev => prev.map(msg => {
                              if (msg.id !== reviewingMessageId) return msg;
                              return { ...msg, proposals: updated };
                            }));
                            setReviewingProposals(null);
                            setReviewingMessageId(null);
                            setPreviewPortrait(null);
                            setRefineFeedback("");
                          }
                        }}
                        className="px-4 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors"
                      >
                        Reject
                      </button>
                      <button
                        onClick={async () => {
                          if (!reviewingMessageId) return;
                          await handleAcceptProposal(reviewingMessageId, proposal);
                          // Update local state
                          const updated = [...reviewingProposals];
                          updated[reviewIndex] = { ...updated[reviewIndex], status: "accepted" };
                          setReviewingProposals(updated);
                          // Auto-advance to next pending
                          const nextPending = updated.findIndex((p, i) => i > reviewIndex && p.status === "pending");
                          if (nextPending >= 0) {
                            setReviewIndex(nextPending);
                            setPreviewPortrait(null);
                            setRefineFeedback("");
                          } else if (updated.every(p => p.status !== "pending")) {
                            // All decided, sync and close
                            setMessages(prev => prev.map(msg => {
                              if (msg.id !== reviewingMessageId) return msg;
                              return { ...msg, proposals: updated };
                            }));
                            setReviewingProposals(null);
                            setReviewingMessageId(null);
                            setPreviewPortrait(null);
                            setRefineFeedback("");
                          }
                        }}
                        className="px-4 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-xs font-medium hover:bg-green-500/30 transition-colors"
                      >
                        Accept
                      </button>
                    </div>
                  ) : (
                    <span className={cn(
                      "text-xs px-3 py-1.5 rounded-lg",
                      proposal.status === "accepted" && "bg-green-500/20 text-green-400",
                      proposal.status === "rejected" && "bg-red-500/20 text-red-400"
                    )}>
                      {proposal.status === "accepted" ? "Accepted" : "Rejected"}
                    </span>
                  )}
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* LLM Confirmation Dialog */}
      <AnimatePresence>
        {pendingConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-black/60" onClick={() => setPendingConfirm(null)} />
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="relative bg-slate-900 rounded-2xl border border-amber-500/30 max-w-md w-full mx-4 p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                </div>
                <span className="font-medium text-gray-200">Director asks:</span>
              </div>
              <div className="text-gray-300 mb-6">
                <MarkdownMessage
                  content={pendingConfirm.message}
                  className="text-sm leading-relaxed text-gray-300"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setPendingConfirm(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 text-gray-400 hover:bg-white/10"
                >
                  No, not yet
                </button>
                <button
                  onClick={() => {
                    // Could trigger the action here
                    setInput(`Yes, ${pendingConfirm.action}`);
                    setPendingConfirm(null);
                    inputRef.current?.focus();
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                >
                  Yes, do it
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// STORYBOARD STRIP - Horizontal timeline of scenes
// =============================================================================

function StoryboardStrip({
  scenes,
  selectedSceneId,
  onSceneClick,
  onFrameClick,
  onAddScene,
  onInsertScene,
  onReorderSceneDrop,
  isReorderBusy = false,
  onCreateBranchAtScene,
  isBranchBusy = false,
}: {
  scenes: Scene[];
  selectedSceneId?: string;
  onSceneClick: (scene: Scene) => void;
  onFrameClick?: (scene: Scene, frame: SceneFrame) => void;
  onAddScene: () => void;
  onInsertScene?: (position: number, beforeScene: Scene, afterScene: Scene | null) => void;
  onReorderSceneDrop?: (sourceSceneId: string, targetSceneId: string) => void;
  isReorderBusy?: boolean;
  onCreateBranchAtScene?: (scene: Scene) => void;
  isBranchBusy?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggedSceneId, setDraggedSceneId] = useState<string | null>(null);
  const [dragOverSceneId, setDragOverSceneId] = useState<string | null>(null);
  const [expandedSceneId, setExpandedSceneId] = useState<string | null>(null);

  if (scenes.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4">
        <span className="text-xs text-gray-500">No scenes yet.</span>
        <button
          onClick={onAddScene}
          className="flex items-center gap-1 px-2 py-1 text-xs text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg transition-colors"
        >
          <Plus className="w-3 h-3" />
          Create first scene
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {onReorderSceneDrop && (
        <div className="px-4 mb-1 text-[10px] text-cyan-300/80">
          Drag scene thumbnails to reorder the timeline.
        </div>
      )}
      {/* Timeline line */}
      <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500/20 to-transparent transform -translate-y-1/2" />

      <div
        ref={containerRef}
        className="flex items-center gap-3 px-4 overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {scenes.map((scene, index) => (
          <div key={scene.id} className="flex items-center gap-0 flex-shrink-0">
            {/* Insert button BEFORE this scene (only show for first scene) */}
            {index === 0 && onInsertScene && (
              <motion.button
                initial={{ opacity: 0, width: 0 }}
                whileHover={{ opacity: 1, width: 24 }}
                className="h-16 flex items-center justify-center text-amber-400/50 hover:text-amber-400 transition-colors overflow-hidden"
                onClick={(e) => {
                  e.stopPropagation();
                  onInsertScene(0, scene, null);
                }}
                title="Insert scene before"
              >
                <Plus className="w-4 h-4" />
              </motion.button>
            )}

            <motion.button
              onClick={() => onSceneClick(scene)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              draggable={Boolean(onReorderSceneDrop) && !isReorderBusy}
              onDragStart={(event: any) => {
                if (!onReorderSceneDrop || isReorderBusy) return;
                const dataTransfer = event?.dataTransfer as DataTransfer | undefined;
                if (!dataTransfer) return;
                dataTransfer.effectAllowed = "move";
                dataTransfer.setData("text/plain", scene.id);
                setDraggedSceneId(scene.id);
              }}
              onDragOver={(event: any) => {
                if (!onReorderSceneDrop || !draggedSceneId || draggedSceneId === scene.id || isReorderBusy) return;
                event.preventDefault();
                const dataTransfer = event?.dataTransfer as DataTransfer | undefined;
                if (dataTransfer) {
                  dataTransfer.dropEffect = "move";
                }
                setDragOverSceneId(scene.id);
              }}
              onDragLeave={() => {
                if (dragOverSceneId === scene.id) {
                  setDragOverSceneId(null);
                }
              }}
              onDrop={(event: any) => {
                if (!onReorderSceneDrop || !draggedSceneId || isReorderBusy) return;
                event.preventDefault();
                if (draggedSceneId !== scene.id) {
                  onReorderSceneDrop(draggedSceneId, scene.id);
                }
                setDraggedSceneId(null);
                setDragOverSceneId(null);
              }}
              onDragEnd={() => {
                setDraggedSceneId(null);
                setDragOverSceneId(null);
              }}
              className={cn(
                "relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden border-2 transition-all group",
                selectedSceneId === scene.id
                  ? "border-amber-400 shadow-lg shadow-amber-500/20"
                  : "border-white/10 hover:border-amber-400/50",
                draggedSceneId === scene.id && "opacity-60 ring-2 ring-cyan-400/50",
                dragOverSceneId === scene.id && "border-cyan-300 ring-2 ring-cyan-300/40"
              )}
            >
              {/* Scene thumbnail or placeholder */}
              {scene.imageUrl ? (
                <img src={scene.imageUrl} alt={scene.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                  <Film className="w-5 h-5 text-amber-500/30" />
                </div>
              )}

              {/* Overlay with scene number */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
                <span className="text-[10px] font-medium text-white/80 truncate px-1">
                  {index + 1}. {scene.title?.slice(0, 12) || "Scene"}
                </span>
                {scene.status === "draft" ? (
                  <span className="text-[8px] px-1 rounded bg-amber-500/30 text-amber-300">Draft</span>
                ) : (
                  <span className="text-[8px] px-1 rounded bg-green-500/30 text-green-300">✓</span>
                )}
              </div>

              {onReorderSceneDrop && (
                <div className="absolute top-1 right-1 px-1 py-0.5 rounded bg-black/60 text-cyan-300">
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              )}

              {(scene.visualDirty || scene.frameImagesDirty || (scene.frameVisualDirtyCount || 0) > 0) && (
                <div
                  className={cn(
                    "absolute top-1 px-1 py-0.5 rounded bg-amber-500/80 text-black",
                    onReorderSceneDrop ? "right-7" : "right-1"
                  )}
                  title={scene.visualDirtyReason || "Visual continuity needs regeneration"}
                >
                  <AlertTriangle className="w-3 h-3" />
                </div>
              )}

              {onCreateBranchAtScene && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (isBranchBusy) return;
                    onCreateBranchAtScene(scene);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    if (isBranchBusy) return;
                    onCreateBranchAtScene(scene);
                  }}
                  className={cn(
                    "absolute top-1 left-1 p-1 rounded bg-black/60 text-purple-300 hover:text-purple-200 hover:bg-black/80 transition-colors",
                    isBranchBusy && "opacity-50 cursor-not-allowed"
                  )}
                  title={`Create branch from "${scene.title}"`}
                >
                  <GitBranch className="w-3 h-3" />
                </div>
              )}

              {/* Frame count badge */}
              {scene.frames && scene.frames.length > 0 && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpandedSceneId(prev => prev === scene.id ? null : scene.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    setExpandedSceneId(prev => prev === scene.id ? null : scene.id);
                  }}
                  className={cn(
                    "absolute bottom-1 right-1 flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] transition-colors z-10",
                    expandedSceneId === scene.id
                      ? "bg-purple-500/80 text-white"
                      : "bg-black/60 text-purple-300 hover:bg-purple-500/60"
                  )}
                  title={`${scene.frames.length} frames — click to ${expandedSceneId === scene.id ? 'collapse' : 'expand'}`}
                >
                  <LayoutGrid className="w-2.5 h-2.5" />
                  {scene.frames.length}
                </div>
              )}

              {/* Hover details */}
              <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-1">
                <span className="text-[10px] text-white text-center line-clamp-2">{scene.title}</span>
              </div>
            </motion.button>

            {/* Expanded frame thumbnails */}
            <AnimatePresence>
              {expandedSceneId === scene.id && scene.frames && scene.frames.length > 0 && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-1 overflow-hidden"
                >
                  {scene.frames.map((frame, fIdx) => (
                    <motion.button
                      key={frame.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: fIdx * 0.05 }}
                      onClick={() => onFrameClick ? onFrameClick(scene, frame) : onSceneClick(scene)}
                      className="relative flex-shrink-0 w-16 h-10 rounded-md overflow-hidden border border-purple-500/30 hover:border-purple-400 transition-colors"
                    >
                      {frame.imageUrl ? (
                        <img src={frame.imageUrl} alt={frame.title || `F${fIdx + 1}`} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-purple-900/30 to-slate-900 flex items-center justify-center">
                          <Film className="w-3 h-3 text-purple-500/40" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                      <span className="absolute bottom-0.5 left-1 text-[7px] text-purple-200 font-medium">S{fIdx + 1}</span>
                      {frame.visualDirty && (
                        <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                      )}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Insert button AFTER this scene */}
            {onInsertScene && (
              <motion.button
                initial={{ opacity: 0, width: 0 }}
                whileHover={{ opacity: 1, width: 24 }}
                className="h-16 flex items-center justify-center text-amber-400/50 hover:text-amber-400 transition-colors overflow-hidden"
                onClick={(e) => {
                  e.stopPropagation();
                  onInsertScene(index + 1, scene, scenes[index + 1] || null);
                }}
                title="Insert scene after"
              >
                <Plus className="w-4 h-4" />
              </motion.button>
            )}
          </div>
        ))}

        {/* Add new scene button */}
        <motion.button
          onClick={onAddScene}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex-shrink-0 w-16 h-16 rounded-lg border-2 border-dashed border-white/20 hover:border-amber-400/50 flex flex-col items-center justify-center gap-1 text-gray-500 hover:text-amber-400 transition-all"
        >
          <Plus className="w-5 h-5" />
          <span className="text-[10px]">Add</span>
        </motion.button>
      </div>
    </div>
  );
}

// =============================================================================
// 3D CAROUSEL
// =============================================================================

function Carousel3D<T extends { id: string }>({
  items,
  currentIndex,
  onIndexChange,
  renderItem,
  compactMode = false,
  getItemKind,
}: {
  items: T[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  renderItem: (item: T, isActive: boolean) => React.ReactNode;
  compactMode?: boolean;
  getItemKind?: (item: T) => string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollAccumRef = useRef(0);
  const stateRef = useRef({ currentIndex, itemsLength: items.length, onIndexChange });
  stateRef.current = { currentIndex, itemsLength: items.length, onIndexChange };

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { currentIndex: idx, itemsLength, onIndexChange: onChange } = stateRef.current;
      // Use whichever axis has more movement (deltaX for horizontal swipe, deltaY for vertical scroll)
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      scrollAccumRef.current += delta * 0.5;
      if (Math.abs(scrollAccumRef.current) >= 20) {
        onChange(Math.max(0, Math.min(itemsLength - 1, idx + (scrollAccumRef.current > 0 ? 1 : -1))));
        scrollAccumRef.current = 0;
      }
    };
    const el = containerRef.current;
    if (el) {
      el.addEventListener("wheel", handleWheel, { passive: false });
      return () => el.removeEventListener("wheel", handleWheel);
    }
  }, [items.length]);

  if (items.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <Sparkles className="w-12 h-12 text-amber-400/30 mx-auto mb-4" />
          <p className="text-gray-500">No items yet</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="absolute inset-0 flex items-center justify-center">
      {items.map((item, index) => {
        const offset = index - currentIndex;
        if (Math.abs(offset) > 4) return null;
        const isActive = index === currentIndex;

        // Elliptical arc - cards curve back into the distance
        const absOffset = Math.abs(offset);
        const direction = offset > 0 ? 1 : -1;

        // Angle along the ellipse (each card is ~25 degrees apart)
        const angle = absOffset * 0.35; // radians (~20 degrees per step)

        // Ellipse radii - wider than deep for a nice curve (slightly reduced in compact mode)
        const radiusX = compactMode ? 580 : 650; // horizontal radius
        const radiusZ = compactMode ? 360 : 400; // depth radius

        // Add extra offset for immediate neighbors so they peek out more
        const peekBoost = absOffset === 1 ? (compactMode ? 70 : 80) : 0;

        // Position on ellipse arc
        const xPos = direction * (Math.sin(angle) * radiusX + peekBoost);
        const zPos = isActive ? 0 : -(radiusZ - Math.cos(angle) * radiusZ);

        // Rotation follows the tangent of the ellipse
        const rotation = direction * -absOffset * 15;

        // Scale: gradual decrease (slightly reduced in compact mode - mostly rely on translateY)
        const baseScale = compactMode ? 0.85 : 1;
        const itemScale = isActive ? baseScale : Math.max(0.55 * baseScale, (0.78 - absOffset * 0.06) * baseScale);

        // Z-index: center card highest, decreases with distance
        const zIndex = isActive ? 50 : 40 - absOffset * 5;

        // Dark overlay intensity increases with distance
        const overlayOpacity = isActive ? 0 : Math.min(0.75, absOffset * 0.2);

        return (
          <motion.div
            key={item.id}
            animate={{
              rotateY: rotation,
              x: xPos,
              z: zPos,
              scale: itemScale,
            }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={!isActive ? () => onIndexChange(index) : undefined}
            className="absolute cursor-pointer"
            style={{
              transformStyle: "preserve-3d",
              zIndex,
            }}
          >
            <div className="relative">
              {renderItem(item, isActive)}
              {/* Dark overlay for background cards */}
              {!isActive && (
                <div
                  className="absolute inset-0 bg-black rounded-2xl pointer-events-none"
                  style={{ opacity: overlayOpacity }}
                />
              )}
            </div>
          </motion.div>
        );
      })}

      {/* Navigation */}
      {currentIndex > 0 && (
        <button
          onClick={() => onIndexChange(currentIndex - 1)}
          className="absolute left-8 z-30 p-3 rounded-full bg-black/50 text-white/70 hover:bg-black/70"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {currentIndex < items.length - 1 && (
        <button
          onClick={() => onIndexChange(currentIndex + 1)}
          className="absolute right-8 z-30 p-3 rounded-full bg-black/50 text-white/70 hover:bg-black/70"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Indicators */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-30">
        {items.slice(Math.max(0, currentIndex - 4), currentIndex + 5).map((item, i) => {
          const actualIndex = Math.max(0, currentIndex - 4) + i;
          const kind = getItemKind?.(item);
          const isFrame = kind === 'frame';
          const activeColor = isFrame ? "bg-purple-400 w-8" : "bg-amber-400 w-8";
          const inactiveColor = isFrame ? "bg-purple-400/40 w-2" : "bg-white/30 w-2";
          return (
            <button
              key={actualIndex}
              onClick={() => onIndexChange(actualIndex)}
              className={cn(
                "h-2 rounded-full transition-all",
                actualIndex === currentIndex ? activeColor : inactiveColor
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// SCREENPLAY VIEW — the composite "Script" surface (Pipeline stage 4).
// Read-only assembled screenplay: walks acts → scenes → shots and renders
// scene prose followed by per-shot description + dialogue, formatted like a
// shooting script. Pulls entirely from existing data (acts / scenes / frames)
// — no new model, no new fields. Clicking a scene slugline jumps to that
// scene in Production; clicking a shot opens its frame workbench. This is a
// snapshot of the story as written, not an editor.
// =============================================================================

interface ScreenplayViewProps {
  script: ScriptDoc;
  scenes: Scene[];
  acts: ProjectAct[];
  entities: Entity[];
  onJumpToScene: (sceneId: string) => void;
  onJumpToShot: (sceneId: string, shotId: string) => void;
}

// Parse a raw dialogue line. Supports "NAME: spoken text" (renders as a
// screenplay character cue + dialogue block, with an optional leading
// parenthetical) and bare lines (rendered as a plain dialogue line).
// Conservative: only treats a leading token as a cue when it's short and
// ALL-CAPS-ish, so prose colons in description-style lines aren't swallowed.
function parseScreenplayDialogue(line: string): { cue?: string; parenthetical?: string; text: string } {
  const raw = (line || "").trim();
  if (!raw) return { text: "" };
  const m = raw.match(/^([A-Z][A-Z0-9 .'’()\/-]{1,38}?)\s*:\s*([\s\S]+)$/);
  if (m) {
    const cue = m[1].trim();
    let text = m[2].trim();
    let parenthetical: string | undefined;
    const p = text.match(/^\(([^)]+)\)\s*([\s\S]*)$/);
    if (p) { parenthetical = p[1].trim(); text = p[2].trim(); }
    return { cue, parenthetical, text };
  }
  return { text: raw };
}

function ScreenplayView({ script, scenes, acts, onJumpToScene, onJumpToShot }: ScreenplayViewProps) {
  const [showShotImages, setShowShotImages] = useState(false);
  const [showShotBreakdown, setShowShotBreakdown] = useState(true);
  const [copied, setCopied] = useState(false);

  // Build the ordered screenplay structure: acts in order, each with its
  // scenes (sorted by position), then a trailing bucket of unassigned scenes.
  // Mirrors StoryboardView's grouping so the two surfaces agree on order.
  const { ordered, sceneCount, shotCount, wordCount } = useMemo(() => {
    const sortedActs = [...acts].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const byAct = new Map<string, Scene[]>();
    const unassigned: Scene[] = [];
    for (const s of scenes) {
      if (s.actId && acts.some((a) => a.id === s.actId)) {
        const list = byAct.get(s.actId) || [];
        list.push(s);
        byAct.set(s.actId, list);
      } else {
        unassigned.push(s);
      }
    }
    const sortScenes = (list: Scene[]) => [...list].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    type Group = { act: ProjectAct | null; scenes: Scene[] };
    const groups: Group[] = [];
    for (const act of sortedActs) {
      const list = sortScenes(byAct.get(act.id) || []);
      if (list.length) groups.push({ act, scenes: list });
    }
    if (unassigned.length) groups.push({ act: null, scenes: sortScenes(unassigned) });

    // Continuous scene numbering across the whole screenplay (story order).
    let runningSceneNo = 0;
    let shots = 0;
    let words = 0;
    const countWords = (t?: string) => { if (t) words += t.trim().split(/\s+/).filter(Boolean).length; };
    const orderedGroups = groups.map((g) => ({
      act: g.act,
      scenes: g.scenes.map((s) => {
        runningSceneNo += 1;
        countWords(s.prose);
        const frames = [...(s.frames || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        frames.forEach((f) => { shots += 1; countWords(f.description); (f.dialogue || []).forEach(countWords); });
        return { scene: s, number: runningSceneNo, frames };
      }),
    }));
    return { ordered: orderedGroups, sceneCount: runningSceneNo, shotCount: shots, wordCount: words };
  }, [acts, scenes]);

  // Plain-text assembly for the copy button — a portable screenplay dump.
  const assemblePlainText = () => {
    const lines: string[] = [];
    if (script?.logline) { lines.push(script.logline.trim().toUpperCase()); lines.push(""); }
    for (const g of ordered) {
      if (g.act) {
        lines.push("");
        lines.push((g.act.title || "ACT").toUpperCase());
        if (g.act.arc) lines.push(g.act.arc.trim());
        lines.push("");
      }
      for (const { scene, number, frames } of g.scenes) {
        lines.push(`SCENE ${number}. ${(scene.title || "UNTITLED").toUpperCase()}`);
        if (scene.prose) { lines.push(""); lines.push(scene.prose.trim()); }
        frames.forEach((f, i) => {
          const label = `${number}${String.fromCharCode(65 + i)}`;
          lines.push("");
          lines.push(`SHOT ${label}${f.shotType ? ` · ${f.shotType.toUpperCase()}` : ""}`);
          if (f.description) lines.push(f.description.trim());
          (f.dialogue || []).filter(Boolean).forEach((d) => {
            const { cue, parenthetical, text } = parseScreenplayDialogue(d);
            if (cue) {
              lines.push(`        ${cue}`);
              if (parenthetical) lines.push(`          (${parenthetical})`);
              lines.push(`    ${text}`);
            } else if (text) {
              lines.push(`    ${text}`);
            }
          });
        });
        lines.push("");
      }
    }
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(assemblePlainText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  const hasContent = sceneCount > 0;

  return (
    <div className="absolute inset-0 overflow-y-auto px-6 pt-8 pb-24 bg-slate-950">
      {/* Toolbar — counts + read toggles + copy */}
      <div className="max-w-3xl mx-auto mb-8 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-amber-300/60">Script</div>
          <div className="text-sm text-gray-400">
            {sceneCount} scene{sceneCount === 1 ? "" : "s"} · {shotCount} shot{shotCount === 1 ? "" : "s"} · ~{wordCount.toLocaleString()} words
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowShotBreakdown((v) => !v)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs border transition-colors",
              showShotBreakdown ? "bg-amber-500/15 border-amber-500/40 text-amber-300" : "border-white/10 text-gray-400 hover:text-gray-200"
            )}
            title="Show per-shot description + dialogue under each scene"
          >
            Shot breakdown
          </button>
          <button
            onClick={() => setShowShotImages((v) => !v)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs border transition-colors",
              showShotImages ? "bg-amber-500/15 border-amber-500/40 text-amber-300" : "border-white/10 text-gray-400 hover:text-gray-200"
            )}
            title="Show each shot's rendered image inline"
          >
            Shot images
          </button>
          <button
            onClick={handleCopy}
            disabled={!hasContent}
            className="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-gray-300 hover:text-white hover:border-white/30 transition-colors flex items-center gap-1.5 disabled:opacity-40"
            title="Copy the assembled screenplay as plain text"
          >
            {copied ? <><Check className="w-3.5 h-3.5 text-green-400" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
          </button>
        </div>
      </div>

      {!hasContent ? (
        <div className="max-w-3xl mx-auto mt-24 text-center">
          <FileText className="w-12 h-12 text-amber-500/30 mx-auto mb-3" />
          <h2 className="text-lg text-gray-200 mb-1">No script yet</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            The Script assembles your acts, scenes and shots into a readable screenplay. Create scenes in <span className="text-amber-300">Storyboard</span> and add shots in <span className="text-amber-300">Production</span> — they'll flow in here automatically.
          </p>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto">
          {/* Title block — logline / synopsis when present */}
          {(script?.logline || script?.synopsis) && (
            <div className="mb-12 pb-8 border-b border-white/10">
              {script?.logline && <p className="text-xl text-gray-100 font-serif leading-relaxed">{script.logline}</p>}
              {script?.synopsis && <p className="mt-4 text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">{script.synopsis}</p>}
            </div>
          )}

          {ordered.map((g, gi) => (
            <div key={g.act?.id || `unassigned-${gi}`} className="mb-12">
              {/* Act heading */}
              <div className="mb-8 text-center">
                <div className="text-xs uppercase tracking-[0.3em] text-amber-300/70">{g.act ? g.act.title : "Unassigned scenes"}</div>
                {g.act?.arc && <div className="mt-2 text-sm text-gray-500 italic max-w-xl mx-auto">{g.act.arc}</div>}
                <div className="mt-4 mx-auto w-16 h-px bg-amber-500/30" />
              </div>

              {g.scenes.map(({ scene, number, frames }) => (
                <div key={scene.id} className="mb-10">
                  {/* Scene slugline → jumps to Production */}
                  <button
                    onClick={() => onJumpToScene(scene.id)}
                    className="group block w-full text-left mb-3"
                    title="Open this scene in Production"
                  >
                    <span className="font-mono text-sm uppercase tracking-wide text-amber-200 group-hover:text-amber-300">
                      Scene {number}. {scene.title || "Untitled"}
                    </span>
                  </button>

                  {/* Scene prose / action */}
                  {scene.prose && (
                    <p className="text-[15px] text-gray-200 leading-[1.8] font-serif whitespace-pre-wrap mb-4">{scene.prose}</p>
                  )}

                  {/* Per-shot breakdown */}
                  {showShotBreakdown && frames.map((f, i) => {
                    const label = `${number}${String.fromCharCode(65 + i)}`;
                    const dialogue = (f.dialogue || []).filter(Boolean);
                    return (
                      <div key={f.id} className="mb-5 pl-4 border-l border-white/10">
                        <button
                          onClick={() => onJumpToShot(scene.id, f.id)}
                          className="group flex items-center gap-2 mb-1.5 text-left flex-wrap"
                          title="Open this shot's workbench"
                        >
                          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300/90 group-hover:bg-amber-500/20">{label}</span>
                          {f.shotType && <span className="text-[11px] uppercase tracking-wide text-gray-500">{f.shotType}</span>}
                          {f.camera && <span className="text-[11px] uppercase tracking-wide text-gray-600">{f.camera}</span>}
                          {f.title && <span className="text-xs text-gray-400 italic">{f.title}</span>}
                        </button>

                        {showShotImages && f.imageUrl && (
                          <img src={f.imageUrl} alt={label} className="mb-2 rounded-lg border border-white/10 max-h-56 object-cover" loading="lazy" />
                        )}

                        {f.description && (
                          <p className="text-sm text-gray-300 leading-relaxed mb-2">{f.description}</p>
                        )}

                        {dialogue.length > 0 && (
                          <div className="space-y-2 my-2">
                            {dialogue.map((d, di) => {
                              const { cue, parenthetical, text } = parseScreenplayDialogue(d);
                              if (cue) {
                                return (
                                  <div key={di} className="text-center">
                                    <div className="font-mono text-xs uppercase tracking-wider text-gray-200">{cue}</div>
                                    {parenthetical && <div className="text-[11px] text-gray-500 italic">({parenthetical})</div>}
                                    <div className="text-sm text-gray-300 max-w-md mx-auto">{text}</div>
                                  </div>
                                );
                              }
                              return <div key={di} className="text-sm text-gray-400 italic text-center max-w-md mx-auto">{text}</div>;
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {showShotBreakdown && frames.length === 0 && (
                    <p className="text-xs text-gray-600 italic pl-4">No shots yet — add them in Production.</p>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// STORYBOARD VIEW — script chunk → multi-panel storyboard page → extract
// individual panels as frames in scenes. The user pastes a script chunk,
// GPT Image 1 renders a 12-panel page in the project's locked style, and
// each panel can be clicked to extract it as a frame anchored to the panel.
// =============================================================================

interface StoryboardViewProps {
  storyboards: StoryboardArtifact[];
  scenes: Scene[];
  entities: Entity[];
  /** Top-level story arcs that group scenes. Stage 2 of the pipeline restructure. */
  acts: ProjectAct[];
  scriptChunk: string;
  onScriptChunkChange: (s: string) => void;
  title: string;
  onTitleChange: (t: string) => void;
  panelCount: number;
  onPanelCountChange: (n: number) => void;
  model: "nano-banana" | "gpt-image";
  onModelChange: (m: "nano-banana" | "gpt-image") => void;
  isGenerating: boolean;
  onGenerate: () => void;
  onSelectStoryboard: (s: StoryboardArtifact) => void;
  onExtractPanel: (s: StoryboardArtifact, panelIndex: number) => void;
  /** Jump to a source scene's workbench from a storyboard's badge. */
  onOpenScene?: (sceneId: string) => void;
  /** Seed the script chunk + title + sceneId from a given scene. */
  onSeedFromScene?: (sceneId: string) => void;
  /** Open a scene's full workbench. */
  onSceneClick: (scene: Scene) => void;
  /** Open a shot/frame's workbench. */
  onFrameClick?: (scene: Scene, frame: SceneFrame) => void;
  /** Generate a multi-panel storyboard page for a specific scene. */
  onGenerateStoryboardForScene?: (scene: Scene) => void;
  isGeneratingStoryboardForScene?: boolean;
  /** Acts CRUD + scene-to-act assignment. */
  onAddAct: (title: string, arc?: string) => Promise<ProjectAct | null>;
  onUpdateAct: (id: string, patch: { title?: string; arc?: string }) => Promise<void>;
  onDeleteAct: (id: string) => Promise<void>;
  onReorderActs: (orderedIds: string[]) => Promise<void>;
  onAssignSceneToAct: (sceneId: string, actId: string | null) => Promise<void>;
  /** Create a blank scene (optionally pre-assigned to an act). */
  onCreateBlankScene: (opts: { title?: string; actId?: string | null }) => Promise<any>;
}

// =============================================================================
// SCRIPT PHASE — script writing workspace following the standard scriptwriting
// flow (Logline → Character Summary → Synopsis → Act Summary → Act Breakdown →
// Character List → Beat Sheet → Theme → Scene List → The Write). Each stage
// is a focused micro-workspace; left rail navigates between them.
//
// This component is a scaffold — the data model + per-stage canvases land in
// the next commits. For now it shows the outline + a placeholder explaining
// where the stages will live.
// =============================================================================

interface ScriptDoc {
  logline?: string;
  // characterSummaries/characterList/sceneList/write retained in the data
  // model for backward compatibility and AI-tool access — but no longer
  // surfaced as Story-phase stages (World owns characters, Production owns
  // scenes, per-scene prose owns the long-form write).
  characterSummaries?: Array<{ id: string; name: string; summary: string; linkedEntityId?: string; updatedAt?: number }>;
  synopsis?: string;
  actSummaries?: { act1?: string; act2a?: string; act2b?: string; act3?: string };
  actBreakdowns?: { act1?: string[]; act2a?: string[]; act2b?: string[]; act3?: string[] };
  characterList?: Array<{ id: string; name: string; description?: string; arc?: string; motivations?: string; linkedEntityId?: string; updatedAt?: number }>;
  beatSheet?: Array<{ id: string; label: string; position?: number; description?: string }>;
  theme?: string;
  /** Recurring visual / narrative motifs — short prose. New in the Story
   *  phase. Distinct from theme: theme is what the story is about; motifs
   *  are the patterns/objects/colors/sounds that recur. */
  motifs?: string;
  sceneList?: Array<{ id: string; number?: number; pitch: string; linkedSceneId?: string; lastResyncedAt?: number }>;
  write?: string;
  updatedAt?: number;
}

interface ScriptPhaseViewProps {
  script: ScriptDoc;
  entities: Entity[];
  scenes: Scene[];
  onScalarUpdate: (patch: Record<string, any>) => void;
  onAddCharacterSummary: (name: string, summary: string, linkedEntityId?: string) => void;
  onUpdateCharacterSummary: (id: string, patch: { name?: string; summary?: string; linkedEntityId?: string }) => void;
  onDeleteCharacterSummary: (id: string) => void;
  onAddCharacterListEntry: (name: string, description?: string, arc?: string, motivations?: string, linkedEntityId?: string) => void;
  onUpdateCharacterListEntry: (id: string, patch: { name?: string; description?: string; arc?: string; motivations?: string; linkedEntityId?: string }) => void;
  onDeleteCharacterListEntry: (id: string) => void;
  onAddBeat: (label: string, position?: number, description?: string) => void;
  onUpdateBeat: (id: string, patch: { label?: string; position?: number; description?: string }) => void;
  onDeleteBeat: (id: string) => void;
  onAddSceneListEntry: (pitch: string, position?: number) => void;
  onUpdateSceneListEntry: (id: string, pitch: string) => void;
  onDeleteSceneListEntry: (id: string) => void;
  onReorderSceneList: (orderedIds: string[]) => void;
  onPromoteSceneListEntry: (id: string, title?: string) => void;
  onResyncSceneListEntry: (id: string) => void;
  onJumpToScene: (sceneId: string) => void;
}

// =============================================================================
// ENTITY WORKBENCH — full-canvas entity view in the frame-workbench design
// language. Top: thumbnail strip of all entities (click to jump). Left: large
// portrait. Right: inline-editable metadata. Bottom: action bar. Relationships
// live in a compact section in the right column instead of taking wide gutters.
// =============================================================================

interface EntityWorkbenchProps {
  entities: Entity[];
  relationships: DemoRelationship[];
  focusedDetail: EntityDetail | null;
  onFocusEntity: (entityId: string) => void;
  onSaveFields: (entityId: string, updates: Partial<Entity>) => void;
  onGeneratePortrait: (entity: Entity, prompt?: string) => void;
  isGeneratingPortrait?: boolean;
  onGenerateVariations: (entity: Entity, prompt?: string) => void;
  isGeneratingVariations?: boolean;
  portraitVariations: { entityId: string; images: string[]; serverUrls: string[]; mimeTypes: string[] } | null;
  variationRunGeneratedCount: number;
  onSelectVariation: (entity: Entity, displayUrl: string, index: number) => void;
  onRemoveVariation: (entity: Entity, index: number) => void;
  onAddGalleryImage: (entity: Entity, label: string, prompt: string) => void;
  onPromoteGalleryImage: (entity: Entity, imageId: string) => void;
  onRemoveGalleryImage: (entity: Entity, imageId: string) => void;
  onGenerateCharacterSheet: (entity: Entity) => void;
  onAddRelationship: (sourceId: string, targetId: string, targetName: string, type: string, description?: string) => void;
  onDeleteRelationship: (relationshipId: string) => void;
  onFocusInChat: (entity: Entity) => void;
  /** Exit the focused entity → back to the all-entities gallery grid. */
  onExit: () => void;
  /** When set, the spotlight carousel jumps to the image with this URL (used
   *  to surface a freshly agent-generated/edited image). */
  spotlightUrl?: string | null;
  /** Fires when the spotlight image changes (primary / variation / gallery
   *  navigation) so the parent can surface it to the chat as "what the user
   *  is currently looking at". */
  onCurrentViewImageChange?: (img: {
    url: string;
    label: string;
    source:
      | { kind: "entity-primary"; entityId: string }
      | { kind: "entity-variation"; entityId: string; index: number }
      | { kind: "entity-gallery"; entityId: string; galleryId: string };
  } | null) => void;
}

function EntityWorkbench({
  entities, relationships, focusedDetail,
  onFocusEntity, onSaveFields,
  onGeneratePortrait, isGeneratingPortrait,
  onGenerateVariations, isGeneratingVariations,
  portraitVariations, variationRunGeneratedCount,
  onSelectVariation, onRemoveVariation,
  onAddGalleryImage, onPromoteGalleryImage, onRemoveGalleryImage,
  onGenerateCharacterSheet,
  onAddRelationship, onDeleteRelationship,
  onFocusInChat,
  onExit,
  spotlightUrl,
  onCurrentViewImageChange,
}: EntityWorkbenchProps) {
  // Right column tab — Story / Media / Connected
  const [rightTab, setRightTab] = useState<"story" | "media" | "connected">("story");
  // Inline composer for adding a labeled gallery image
  const [galleryDraftLabel, setGalleryDraftLabel] = useState("");
  const [galleryDraftPrompt, setGalleryDraftPrompt] = useState("");
  // Spotlight carousel — currently focused image index in the combined
  // [primary, ...variations, ...gallery] list. Reset to 0 when entity
  // changes (primary becomes default spotlight).
  const [spotlightIdx, setSpotlightIdx] = useState(0);
  const { openLightbox } = useLightbox();
  const focusedEntity = focusedDetail?.entity || null;

  // Local mirror of focused fields for inline edit + autosave on blur.
  const [localName, setLocalName] = useState(focusedEntity?.name || "");
  const [localType, setLocalType] = useState(focusedEntity?.type || "character");
  const [localDescription, setLocalDescription] = useState(focusedEntity?.description || "");
  const [localBackstory, setLocalBackstory] = useState(focusedEntity?.backstory || "");
  const [localStatus, setLocalStatus] = useState((focusedEntity?.status as string) || "");
  const [localNotes, setLocalNotes] = useState(((focusedEntity as any)?.notes as string) || "");
  const [localTraits, setLocalTraits] = useState((focusedEntity?.traits || []).join(", "));
  const [localMotivations, setLocalMotivations] = useState<string>(((focusedEntity as any)?.motivations || []).join(", "));
  const [localSecrets, setLocalSecrets] = useState<string>(((focusedEntity as any)?.secrets || []).join(", "));
  const [portraitPrompt, setPortraitPrompt] = useState("");

  useEffect(() => {
    if (!focusedEntity) return;
    setLocalName(focusedEntity.name || "");
    setLocalType(focusedEntity.type || "character");
    setLocalDescription(focusedEntity.description || "");
    setLocalBackstory(focusedEntity.backstory || "");
    setLocalStatus((focusedEntity.status as string) || "");
    setLocalNotes(((focusedEntity as any).notes as string) || "");
    setLocalTraits((focusedEntity.traits || []).join(", "));
    setLocalMotivations(((focusedEntity as any).motivations || []).join(", "));
    setLocalSecrets(((focusedEntity as any).secrets || []).join(", "));
    setGalleryDraftLabel("");
    setGalleryDraftPrompt("");
    setRightTab("story");
    setSpotlightIdx(0);
    setPortraitPrompt("");
  }, [focusedEntity?.id]);

  // Combined spotlight list — every image this entity has access to in one
  // navigable sequence: primary, in-flight variations, persisted variations,
  // gallery. Computed BEFORE the early returns below (empty-state / no-focus)
  // so the surface-to-chat effect's hook order stays stable across renders.
  // (Was: this block + effect lived after the early returns, so the effect was
  // skipped when no entity was focused → "Rendered more hooks than during the
  // previous render".) Every focusedEntity access here is null-safe.
  type SpotlightEntry = {
    url: string;
    label: string;
    kind: "primary" | "variation" | "gallery";
    sourceIndex?: number; // index within its source array (variation idx or gallery idx)
    galleryId?: string;
    galleryLabel?: string;
  };
  const galleryImages: Array<{ id: string; url: string; label?: string }> = (focusedEntity as any)?.imageGallery || [];
  const variationCount = (focusedEntity as any)?.portraitVariations?.length || 0;
  const spotlightImages: SpotlightEntry[] = [];
  if (focusedEntity?.referenceImage) {
    spotlightImages.push({ url: focusedEntity.referenceImage, label: "Primary", kind: "primary" });
  }
  // In-flight variation streams (display URLs) — may overlap with persisted
  // serverUrls; deduped by URL below.
  const liveVarUrls: string[] = (focusedEntity && portraitVariations && portraitVariations.entityId === focusedEntity.id)
    ? portraitVariations.images
    : [];
  liveVarUrls.forEach((url, i) => {
    if (!url) return;
    if (spotlightImages.some((e) => e.url === url)) return;
    spotlightImages.push({ url, label: `Variation ${i + 1}`, kind: "variation", sourceIndex: i });
  });
  // Persisted variations on the entity (server URLs)
  const persistedVars: string[] = (focusedEntity as any)?.portraitVariations || [];
  persistedVars.forEach((url, i) => {
    if (!url) return;
    if (spotlightImages.some((e) => e.url === url)) return;
    spotlightImages.push({ url, label: `Variation ${spotlightImages.filter((e) => e.kind === "variation").length + 1}`, kind: "variation", sourceIndex: i });
  });
  galleryImages.forEach((img, i) => {
    if (!img?.url) return;
    if (spotlightImages.some((e) => e.url === img.url)) return;
    spotlightImages.push({
      url: img.url,
      label: img.label ? `Gallery: ${img.label}` : `Gallery ${i + 1}`,
      kind: "gallery",
      galleryId: img.id,
      galleryLabel: img.label,
    });
  });
  const safeSpotlightIdx = Math.max(0, Math.min(spotlightIdx, spotlightImages.length - 1));
  const currentSpotlight: SpotlightEntry | null = spotlightImages[safeSpotlightIdx] || null;

  // Surface the spotlight image to the parent → chat. Fires on every
  // navigation through the carousel so the agent always sees the right
  // image. Identifies the kind (primary / variation / gallery) so edits
  // can write back to the correct slot.
  useEffect(() => {
    if (!onCurrentViewImageChange) return;
    if (!currentSpotlight || !focusedEntity) {
      onCurrentViewImageChange(null);
      return;
    }
    const baseLabel = `${focusedEntity.name} — ${currentSpotlight.label}`;
    if (currentSpotlight.kind === "primary") {
      onCurrentViewImageChange({
        url: currentSpotlight.url,
        label: baseLabel,
        source: { kind: "entity-primary", entityId: focusedEntity.id },
      });
    } else if (currentSpotlight.kind === "variation" && typeof currentSpotlight.sourceIndex === "number") {
      onCurrentViewImageChange({
        url: currentSpotlight.url,
        label: baseLabel,
        source: { kind: "entity-variation", entityId: focusedEntity.id, index: currentSpotlight.sourceIndex },
      });
    } else if (currentSpotlight.kind === "gallery" && currentSpotlight.galleryId) {
      onCurrentViewImageChange({
        url: currentSpotlight.url,
        label: baseLabel,
        source: { kind: "entity-gallery", entityId: focusedEntity.id, galleryId: currentSpotlight.galleryId },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSpotlight?.url, focusedEntity?.id]);

  // Jump the spotlight to a requested URL (a freshly generated/edited image).
  // Fires when the parent sets spotlightUrl or the image list grows to include
  // it — so an agent edit immediately becomes the big visible image while the
  // original stays in the carousel.
  useEffect(() => {
    if (!spotlightUrl) return;
    const norm = (u?: string) => (u || "").replace(/^https?:\/\/[^/]+/, "");
    const idx = spotlightImages.findIndex((e) => norm(e.url) === norm(spotlightUrl));
    if (idx >= 0 && idx !== safeSpotlightIdx) setSpotlightIdx(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotlightUrl, spotlightImages.length]);

  // Empty state — no entities at all yet
  if (entities.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center max-w-md">
          <Users className="w-12 h-12 text-amber-500/30 mx-auto mb-3" />
          <h2 className="text-lg text-gray-200 mb-1">No entities yet</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            World building starts here — characters, locations, objects, organizations. Ask the agent in the chat: <span className="text-amber-300">"Add a character named [name]"</span>.
          </p>
        </div>
      </div>
    );
  }

  // No focused entity but entities exist — show gallery grid as fallback
  if (!focusedEntity) {
    return (
      <div className="absolute inset-0 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-xs uppercase tracking-wide text-amber-300/60 mb-3">World · {entities.length} entities</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {entities.map((e) => (
              <button
                key={e.id}
                onClick={() => onFocusEntity(e.id)}
                className="group rounded-xl overflow-hidden bg-white/5 border border-white/10 hover:border-amber-500/40 transition-colors text-left"
              >
                <div className="aspect-[3/4] bg-black overflow-hidden">
                  {e.referenceImage ? (
                    <img src={e.referenceImage} alt={e.name} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/20 to-slate-900">
                      <Users className="w-12 h-12 text-purple-500/30" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <div className="text-xs uppercase tracking-wide text-amber-300/60">{e.type}</div>
                  <div className="text-sm text-gray-100 truncate">{e.name}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Focused entity — frame-workbench layout. (Spotlight list + surface-to-chat
  // effect now computed above, before the early returns, to keep hook order
  // stable.)
  const focusedRels = relationships.filter((r) => r.sourceId === focusedEntity.id || r.targetId === focusedEntity.id);

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* TOP — entity thumbnail strip. Same shape as the frame workbench's
          frame strip. Click any thumbnail to jump to that entity. */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-slate-900/60 flex-shrink-0">
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-100 transition-colors flex-shrink-0"
          title="Back to all entities"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All entities
        </button>
        <span className="w-px h-4 bg-white/10 flex-shrink-0" />
        <button
          onClick={() => focusedEntity && onFocusInChat(focusedEntity)}
          className="flex items-center gap-1.5 text-xs text-amber-400/80 hover:text-amber-400 transition-colors flex-shrink-0"
          title="Focus this entity in the chat"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Focus in chat
        </button>
        <span className="text-xs text-gray-500 flex-shrink-0">{entities.findIndex((e) => e.id === focusedEntity.id) + 1} of {entities.length}</span>

        <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto py-1">
          {entities.map((e) => (
            <button
              key={e.id}
              onClick={() => onFocusEntity(e.id)}
              className={cn(
                "relative h-12 w-12 flex-shrink-0 rounded overflow-hidden border-2 transition-all",
                e.id === focusedEntity.id ? "border-amber-400 ring-2 ring-amber-400/30" : "border-white/10 hover:border-white/30 opacity-70 hover:opacity-100"
              )}
              title={e.name}
            >
              {e.referenceImage ? (
                <img src={e.referenceImage} alt={e.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                  <Users className="w-4 h-4 text-gray-600" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* MAIN — left: large portrait, right: editable metadata */}
      <div className="flex-1 min-h-0 flex">
        {/* LEFT — spotlight carousel. Cycles through primary + variations
            + gallery at full canvas size. Arrows navigate; thumbnails in
            the Media tab also tap-to-jump. */}
        <div className="flex-1 min-w-0 relative bg-black flex items-center justify-center">
          {currentSpotlight ? (
            <img
              src={currentSpotlight.url}
              alt={currentSpotlight.label}
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-gray-600">
              <Users className="w-20 h-20" />
              <span className="text-sm">No images yet — open the Media tab to generate one</span>
            </div>
          )}

          {/* Top-left badges — type, canon, what's in the spotlight */}
          <div className="absolute top-3 left-3 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] px-2 py-0.5 rounded bg-black/60 text-amber-300 uppercase tracking-wider">
              {focusedEntity.type}
            </span>
            {(focusedEntity.status === "canon") && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-200 border border-emerald-500/40">
                canon
              </span>
            )}
            {currentSpotlight && (
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded border flex items-center gap-1.5",
                currentSpotlight.kind === "primary"
                  ? "bg-amber-500/20 text-amber-200 border-amber-500/40"
                  : currentSpotlight.kind === "variation"
                    ? "bg-purple-500/20 text-purple-200 border-purple-500/40"
                    : "bg-cyan-500/20 text-cyan-200 border-cyan-500/40"
              )}>
                {currentSpotlight.label}
                <span className="text-gray-400">· {safeSpotlightIdx + 1} of {spotlightImages.length}</span>
              </span>
            )}
          </div>

          {/* Top-right: view full + per-image actions */}
          {currentSpotlight && (
            <div className="absolute top-3 right-3 flex items-center gap-2">
              {currentSpotlight.kind === "variation" && typeof currentSpotlight.sourceIndex === "number" && (
                <button
                  onClick={() => onSelectVariation(focusedEntity, currentSpotlight.url, currentSpotlight.sourceIndex!)}
                  className="px-2 py-1 rounded bg-amber-500/30 text-amber-100 text-xs hover:bg-amber-500/50 border border-amber-500/40"
                  title="Promote this variation to the primary portrait"
                >
                  Set as primary
                </button>
              )}
              {currentSpotlight.kind === "gallery" && currentSpotlight.galleryId && (
                <button
                  onClick={() => onPromoteGalleryImage(focusedEntity, currentSpotlight.galleryId!)}
                  className="px-2 py-1 rounded bg-amber-500/30 text-amber-100 text-xs hover:bg-amber-500/50 border border-amber-500/40"
                  title="Promote this gallery image to the primary portrait"
                >
                  Set as primary
                </button>
              )}
              <button
                onClick={() => openLightbox(currentSpotlight.url, currentSpotlight.label)}
                className="px-2 py-1 rounded bg-black/60 text-white text-xs hover:bg-black/80"
              >
                View Full
              </button>
            </div>
          )}

          {/* Bottom-right: remove the current image (variations + gallery
              only; primary can only be replaced, not deleted) */}
          {currentSpotlight && currentSpotlight.kind !== "primary" && (
            <div className="absolute bottom-3 right-3">
              <button
                onClick={() => {
                  if (currentSpotlight.kind === "variation" && typeof currentSpotlight.sourceIndex === "number") {
                    onRemoveVariation(focusedEntity, currentSpotlight.sourceIndex);
                  } else if (currentSpotlight.kind === "gallery" && currentSpotlight.galleryId) {
                    onRemoveGalleryImage(focusedEntity, currentSpotlight.galleryId);
                  }
                  setSpotlightIdx(Math.max(0, safeSpotlightIdx - 1));
                }}
                className="px-2 py-1 rounded bg-rose-500/20 text-rose-200 text-xs hover:bg-rose-500/30 border border-rose-500/30"
              >
                <Trash2 className="w-3 h-3 inline mr-1" />
                Remove
              </button>
            </div>
          )}

          {/* Left/right arrows for carousel navigation */}
          {spotlightImages.length > 1 && (
            <>
              <button
                onClick={() => setSpotlightIdx((i) => (i - 1 + spotlightImages.length) % spotlightImages.length)}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white"
                title="Previous image"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setSpotlightIdx((i) => (i + 1) % spotlightImages.length)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white"
                title="Next image"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Bottom-left: spotlight dot indicators (compact when many) */}
          {spotlightImages.length > 1 && (
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded bg-black/60">
              {spotlightImages.length <= 12 ? (
                spotlightImages.map((entry, i) => (
                  <button
                    key={`${entry.kind}-${entry.url}-${i}`}
                    onClick={() => setSpotlightIdx(i)}
                    className={cn(
                      "rounded-full transition-all",
                      i === safeSpotlightIdx ? "w-2 h-2 bg-amber-300" : "w-1.5 h-1.5 bg-white/30 hover:bg-white/60",
                    )}
                  />
                ))
              ) : (
                <span className="text-[10px] text-gray-300">{safeSpotlightIdx + 1} / {spotlightImages.length}</span>
              )}
            </div>
          )}
        </div>

        {/* RIGHT — tabs: Story / Media / Connected. Each tab full real
            estate so media exploration isn't cramped. */}
        <div className="w-[420px] flex-shrink-0 border-l border-white/10 bg-slate-950 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="flex-shrink-0 border-b border-white/10 flex">
            {(["story", "media", "connected"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setRightTab(t)}
                className={cn(
                  "flex-1 px-4 py-2.5 text-xs uppercase tracking-wider transition-colors",
                  rightTab === t ? "text-amber-300 border-b-2 border-amber-400" : "text-gray-500 hover:text-gray-300 border-b-2 border-transparent"
                )}
              >
                {t === "story" && "Story"}
                {t === "media" && `Media${(focusedEntity.imageGallery?.length || 0) + variationCount > 0 ? ` (${(focusedEntity.imageGallery?.length || 0) + variationCount})` : ""}`}
                {t === "connected" && `Connected${focusedRels.length > 0 ? ` (${focusedRels.length})` : ""}`}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {rightTab === "story" && (
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            {/* Name + type */}
            <div className="space-y-2">
              <input
                type="text"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                onBlur={() => { if (localName !== focusedEntity.name) onSaveFields(focusedEntity.id, { name: localName }); }}
                className="w-full px-3 py-2 text-xl rounded bg-black/30 border border-white/10 text-gray-100 focus:outline-none focus:border-amber-500/40 font-light"
              />
              <select
                value={localType}
                onChange={(e) => {
                  setLocalType(e.target.value as any);
                  onSaveFields(focusedEntity.id, { type: e.target.value as any });
                }}
                className="w-full px-3 py-1.5 text-xs rounded bg-black/30 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-500/40"
              >
                <option value="character">Character</option>
                <option value="location">Location</option>
                <option value="object">Object</option>
                <option value="organization">Organization</option>
                <option value="event">Event</option>
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-1 block">Description</label>
              <textarea
                value={localDescription}
                onChange={(e) => setLocalDescription(e.target.value)}
                onBlur={() => { if (localDescription !== (focusedEntity.description || "")) onSaveFields(focusedEntity.id, { description: localDescription }); }}
                rows={3}
                placeholder="Who they are at first glance"
                className="w-full px-3 py-2 text-xs leading-relaxed rounded bg-black/30 border border-white/10 text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none"
              />
            </div>

            {/* Backstory */}
            <div>
              <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-1 block">Backstory</label>
              <textarea
                value={localBackstory}
                onChange={(e) => setLocalBackstory(e.target.value)}
                onBlur={() => { if (localBackstory !== (focusedEntity.backstory || "")) onSaveFields(focusedEntity.id, { backstory: localBackstory } as any); }}
                rows={4}
                placeholder="Where they came from, what shaped them"
                className="w-full px-3 py-2 text-xs leading-relaxed rounded bg-black/30 border border-white/10 text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none"
              />
            </div>

            {/* Traits / Motivations / Secrets */}
            <div>
              <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-1 block">Traits (comma-separated)</label>
              <input
                type="text"
                value={localTraits}
                onChange={(e) => setLocalTraits(e.target.value)}
                onBlur={() => {
                  const next = localTraits.split(",").map((t) => t.trim()).filter(Boolean);
                  if (JSON.stringify(next) !== JSON.stringify(focusedEntity.traits || [])) onSaveFields(focusedEntity.id, { traits: next });
                }}
                placeholder="curious, loyal, secretive"
                className="w-full px-3 py-1.5 text-xs rounded bg-black/30 border border-white/10 text-amber-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-1 block">Motivations (comma-separated)</label>
              <input
                type="text"
                value={localMotivations}
                onChange={(e) => setLocalMotivations(e.target.value)}
                onBlur={() => {
                  const next = localMotivations.split(",").map((t) => t.trim()).filter(Boolean);
                  if (JSON.stringify(next) !== JSON.stringify((focusedEntity as any).motivations || [])) onSaveFields(focusedEntity.id, { motivations: next } as any);
                }}
                placeholder="freedom, revenge, redemption"
                className="w-full px-3 py-1.5 text-xs rounded bg-black/30 border border-white/10 text-emerald-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-1 block">Secrets (comma-separated)</label>
              <input
                type="text"
                value={localSecrets}
                onChange={(e) => setLocalSecrets(e.target.value)}
                onBlur={() => {
                  const next = localSecrets.split(",").map((t) => t.trim()).filter(Boolean);
                  if (JSON.stringify(next) !== JSON.stringify((focusedEntity as any).secrets || [])) onSaveFields(focusedEntity.id, { secrets: next } as any);
                }}
                placeholder="what they don't say out loud"
                className="w-full px-3 py-1.5 text-xs rounded bg-black/30 border border-white/10 text-rose-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-1 block">Notes</label>
              <textarea
                value={localNotes}
                onChange={(e) => setLocalNotes(e.target.value)}
                onBlur={() => { if (localNotes !== ((focusedEntity as any).notes || "")) onSaveFields(focusedEntity.id, { notes: localNotes } as any); }}
                rows={2}
                placeholder="Free-form notes"
                className="w-full px-3 py-2 text-xs rounded bg-black/30 border border-white/10 text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none"
              />
            </div>

          </div>
          )}

          {/* MEDIA TAB — deep visual exploration. Variations, gallery,
              composer, character sheet. */}
          {rightTab === "media" && (
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            {/* Portrait prompt — single canonical prompt for portrait + variations */}
            <div>
              <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-1 block">
                Portrait prompt
                <span className="text-green-400 normal-case ml-2">(used by both buttons below)</span>
              </label>
              <textarea
                value={portraitPrompt}
                onChange={(e) => setPortraitPrompt(e.target.value)}
                rows={3}
                placeholder={`Describe the look. If empty, the agent composes one from the entity's metadata.`}
                className="w-full px-3 py-2 text-xs rounded bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => onGeneratePortrait(focusedEntity, portraitPrompt || undefined)}
                  disabled={isGeneratingPortrait}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded border transition-colors",
                    isGeneratingPortrait ? "bg-purple-500/30 text-purple-200 border-purple-500/40 cursor-wait" : "bg-amber-500/20 text-amber-200 border-amber-500/30 hover:bg-amber-500/30"
                  )}
                  title="Render a single portrait (replaces primary)"
                >
                  {isGeneratingPortrait ? <Loader className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
                  Render single
                </button>
                <button
                  onClick={() => onGenerateVariations(focusedEntity, portraitPrompt || undefined)}
                  disabled={isGeneratingVariations}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded border transition-colors",
                    isGeneratingVariations ? "bg-purple-500/30 text-purple-200 border-purple-500/40 cursor-wait" : "bg-purple-500/20 text-purple-200 border-purple-500/30 hover:bg-purple-500/30"
                  )}
                  title="Render 4 alternates — explore without committing"
                >
                  {isGeneratingVariations ? <Loader className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  4 variations
                </button>
              </div>
            </div>

            {/* In-flight variations — click any to bring it into the spotlight
                on the left canvas. Hover for set-primary / remove. */}
            {portraitVariations && portraitVariations.entityId === focusedEntity.id && portraitVariations.images.length > 0 && (
              <div className="border-t border-white/5 pt-3">
                <div className="text-[10px] uppercase text-gray-500 tracking-wider mb-2">
                  Variations ({portraitVariations.images.length}{isGeneratingVariations ? ` · streaming, ${variationRunGeneratedCount} so far` : ""})
                  <span className="ml-2 text-gray-600 normal-case">click to spotlight</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {portraitVariations.images.map((img, i) => {
                    const spotIdx = spotlightImages.findIndex((e) => e.url === img);
                    const isSpotted = spotIdx === safeSpotlightIdx && spotIdx >= 0;
                    return (
                      <button
                        key={i}
                        onClick={() => { if (spotIdx >= 0) setSpotlightIdx(spotIdx); }}
                        className={cn(
                          "relative group rounded overflow-hidden bg-black border-2 transition-all text-left",
                          isSpotted ? "border-amber-400 ring-2 ring-amber-400/30" : "border-white/10 hover:border-amber-500/40"
                        )}
                      >
                        <img src={img} alt={`Variation ${i + 1}`} className="w-full aspect-[3/4] object-cover" loading="lazy" />
                        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5">
                          <span
                            onClick={(e) => { e.stopPropagation(); onSelectVariation(focusedEntity, img, i); }}
                            className="px-2 py-1 text-[10px] rounded bg-amber-500/30 text-amber-100 hover:bg-amber-500/50 cursor-pointer"
                          >
                            Set as primary
                          </span>
                          <span
                            onClick={(e) => { e.stopPropagation(); onRemoveVariation(focusedEntity, i); }}
                            className="px-2 py-1 text-[10px] rounded bg-rose-500/30 text-rose-100 hover:bg-rose-500/50 cursor-pointer"
                          >
                            Remove
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Gallery */}
            <div className="border-t border-white/5 pt-3">
              <div className="text-[10px] uppercase text-gray-500 tracking-wider mb-2">
                Gallery ({galleryImages.length})
                {galleryImages.length > 0 && <span className="ml-2 text-gray-600 normal-case">click to spotlight</span>}
              </div>
              {galleryImages.length === 0 ? (
                <div className="text-[11px] text-gray-600 italic mb-2">No labeled gallery images yet.</div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5 mb-3">
                  {galleryImages.map((img: any, i: number) => {
                    const spotIdx = spotlightImages.findIndex((e) => e.url === img.url);
                    const isSpotted = spotIdx === safeSpotlightIdx && spotIdx >= 0;
                    return (
                      <button
                        key={img.id || i}
                        onClick={() => { if (spotIdx >= 0) setSpotlightIdx(spotIdx); }}
                        className={cn(
                          "relative group rounded overflow-hidden bg-black border-2 transition-all",
                          isSpotted ? "border-amber-400 ring-2 ring-amber-400/30" : "border-white/10 hover:border-amber-500/40"
                        )}
                      >
                        <img src={img.url} alt={img.label || ""} className="w-full aspect-square object-cover" loading="lazy" />
                        <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/80 text-[9px] text-amber-200 truncate">{img.label || "—"}</div>
                        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                          <span
                            onClick={(e) => { e.stopPropagation(); onPromoteGalleryImage(focusedEntity, img.id); }}
                            className="px-1.5 py-0.5 text-[9px] rounded bg-amber-500/30 text-amber-100 hover:bg-amber-500/50 cursor-pointer"
                          >
                            Set primary
                          </span>
                          <span
                            onClick={(e) => { e.stopPropagation(); onRemoveGalleryImage(focusedEntity, img.id); }}
                            className="px-1.5 py-0.5 text-[9px] rounded bg-rose-500/30 text-rose-100 hover:bg-rose-500/50 cursor-pointer"
                          >
                            Remove
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Inline composer */}
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-gray-500">Add a labeled image</div>
                <input
                  type="text"
                  value={galleryDraftLabel}
                  onChange={(e) => setGalleryDraftLabel(e.target.value)}
                  placeholder='Label (e.g. "scowling", "in armor")'
                  className="w-full px-2 py-1 text-xs rounded bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40"
                />
                <textarea
                  value={galleryDraftPrompt}
                  onChange={(e) => setGalleryDraftPrompt(e.target.value)}
                  rows={3}
                  placeholder="Prompt — composition, mood, lighting. The character's primary portrait is auto-attached as identity reference."
                  className="w-full px-2 py-1.5 text-xs rounded bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none"
                />
                <button
                  onClick={() => {
                    onAddGalleryImage(focusedEntity, galleryDraftLabel, galleryDraftPrompt);
                    setGalleryDraftLabel("");
                    setGalleryDraftPrompt("");
                  }}
                  disabled={!galleryDraftLabel.trim() || !galleryDraftPrompt.trim()}
                  className="w-full px-3 py-1.5 text-xs rounded bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 disabled:opacity-40 border border-amber-500/30"
                >
                  <Plus className="w-3 h-3 inline mr-1" /> Generate + add to gallery
                </button>
              </div>
            </div>

            {/* Character sheet */}
            <div className="border-t border-white/5 pt-3">
              <button
                onClick={() => onGenerateCharacterSheet(focusedEntity)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-cyan-500/20 text-cyan-200 border border-cyan-500/30 hover:bg-cyan-500/30"
                title="Generate a multi-panel casting sheet artifact (different moods on one page) using GPT Image"
              >
                <LayoutGrid className="w-3 h-3" />
                Generate character sheet
              </button>
              <div className="text-[10px] text-gray-500 mt-1.5 leading-relaxed">
                Creates a multi-panel casting sheet (smiling / scowling / weary / focused / laughing / determined) as a project artifact. Useful for locking character appearance before scene work.
              </div>
            </div>
          </div>
          )}

          {/* CONNECTED TAB — relationships */}
          {rightTab === "connected" && (
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
            <div className="text-[10px] uppercase text-gray-500 tracking-wider mb-1">
              Relationships ({focusedRels.length})
            </div>
            {focusedRels.length === 0 ? (
              <div className="text-[11px] text-gray-600 italic">No relationships yet. Ask the agent: <span className="text-amber-300">"connect {focusedEntity.name} to X as Y"</span>.</div>
            ) : (
              <div className="space-y-1.5">
                {focusedRels.map((rel) => {
                  const isOutgoing = rel.sourceId === focusedEntity.id;
                  const otherId = isOutgoing ? rel.targetId : rel.sourceId;
                  const otherName = isOutgoing ? rel.targetName : rel.sourceName;
                  const other = entities.find((e) => e.id === otherId);
                  if (!other) return null;
                  return (
                    <button
                      key={rel.id}
                      onClick={() => onFocusEntity(otherId)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded bg-white/5 hover:bg-white/10 transition-colors text-left group"
                    >
                      {other.referenceImage ? (
                        <img src={other.referenceImage} alt={other.name} className="w-8 h-8 rounded object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center flex-shrink-0">
                          <Users className="w-3.5 h-3.5 text-gray-600" />
                        </div>
                      )}
                      <span className="text-[10px] text-gray-500 flex-shrink-0">{isOutgoing ? "→" : "←"}</span>
                      <span className="text-[10px] text-amber-300/80 flex-shrink-0">{rel.type?.replace(/_/g, " ")}</span>
                      <span className="text-xs text-gray-200 flex-1 truncate">{otherName || other.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteRelationship(rel.id); }}
                        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-rose-400 transition-opacity"
                        title="Delete relationship"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      {/* BOTTOM ACTION BAR — quick shortcuts. Media tab has its own
          render controls; bottom is for navigation + chat focus. */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-white/10 bg-slate-900/60 flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onFocusInChat(focusedEntity)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-amber-500/20 text-amber-200 border border-amber-500/30 hover:bg-amber-500/30"
            title="Focus this entity in the chat — agent uses it as context for the next message"
          >
            <MessageSquare className="w-3 h-3" />
            Riff in chat
          </button>
          {!focusedEntity.referenceImage && (
            <button
              onClick={() => setRightTab("media")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-purple-500/20 text-purple-200 border border-purple-500/30 hover:bg-purple-500/30"
            >
              <ImageIcon className="w-3 h-3" />
              Generate first portrait
            </button>
          )}
        </div>
        <div className="text-[10px] text-gray-500">
          {focusedEntity.referenceImage ? "Tab to Media for variations / gallery / character sheet" : "No portrait yet — open Media tab to generate one"}
        </div>
      </div>
    </div>
  );
}

function ScriptPhaseView({
  script,
  entities,
  scenes,
  onScalarUpdate,
  onAddCharacterSummary,
  onUpdateCharacterSummary,
  onDeleteCharacterSummary,
  onAddCharacterListEntry,
  onUpdateCharacterListEntry,
  onDeleteCharacterListEntry,
  onAddBeat,
  onUpdateBeat,
  onDeleteBeat,
  onAddSceneListEntry,
  onUpdateSceneListEntry,
  onDeleteSceneListEntry,
  onReorderSceneList,
  onPromoteSceneListEntry,
  onResyncSceneListEntry,
  onJumpToScene,
}: ScriptPhaseViewProps) {
  // Story phase — the high-level story planning surface. Characters live in
  // World; scenes/shots live in Storyboard/Production. This phase is now
  // limited to the truly story-level artifacts: pitch, synopsis, theme,
  // motifs, plus the structural beats (acts + beat sheet) that the AI uses
  // to break the story into scenes downstream.
  const SCRIPT_STAGES: Array<{ id: string; label: string; desc: string; filled: boolean }> = [
    { id: "logline", label: "Logline", desc: "One canonical sentence — the core pitch", filled: Boolean(script.logline) },
    { id: "synopsis", label: "Synopsis", desc: "Paragraph or two of the story", filled: Boolean(script.synopsis) },
    { id: "theme", label: "Theme", desc: "What the story is really about — beyond plot", filled: Boolean(script.theme) },
    { id: "motifs", label: "Motifs", desc: "Recurring visual + narrative patterns that thread the work", filled: Boolean(script.motifs) },
    { id: "actSummary", label: "Act Summary", desc: "Act 1 / 2A / 2B / 3 paragraphs — broad arcs the AI uses to break into scenes", filled: Boolean(script.actSummaries && Object.values(script.actSummaries).some(Boolean)) },
    { id: "beatSheet", label: "Beat Sheet", desc: "Narrative beats — Save the Cat style or your own", filled: Boolean(script.beatSheet?.length) },
  ];
  const [active, setActive] = useState("logline");

  return (
    <div className="absolute inset-0 flex overflow-hidden">
      {/* Left rail — the slim Story-phase outline. Characters live in World;
          scenes/shots live in Storyboard/Production. The agent can still
          touch the dropped sub-fields (characterSummaries, characterList,
          sceneList, write) via its tools; they're just no longer surfaced
          as left-rail stages here. */}
      <div className="w-64 flex-shrink-0 border-r border-white/10 bg-slate-950/60 overflow-y-auto pt-8 pb-6">
        <div className="px-4 mb-3">
          <div className="text-[10px] uppercase tracking-wide text-amber-300/80 mb-1">Phase 1 · Story</div>
          <div className="text-xs text-gray-500">Pitch + premise the AI uses to break the story downstream</div>
        </div>
        <div className="space-y-0.5 px-2">
          {SCRIPT_STAGES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center gap-2",
                active === s.id ? "bg-amber-500/20 text-amber-200" : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
              )}
            >
              <span className="text-[10px] text-gray-600 w-5">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex-1">{s.label}</span>
              <span className={cn(
                "w-1.5 h-1.5 rounded-full",
                s.filled ? "bg-amber-400" : "bg-gray-700",
              )} />
            </button>
          ))}
        </div>
      </div>

      {/* Center canvas — the focused stage's workspace */}
      <div className="flex-1 min-w-0 overflow-y-auto pt-8 pb-6 px-12">
        <div className="max-w-3xl mx-auto">
          <div className="text-[11px] uppercase tracking-wider text-amber-300/60 mb-2">
            Stage {SCRIPT_STAGES.findIndex((s) => s.id === active) + 1} of {SCRIPT_STAGES.length}
          </div>
          <h1 className="text-3xl text-gray-100 font-light mb-2">{SCRIPT_STAGES.find((s) => s.id === active)?.label}</h1>
          <p className="text-sm text-gray-400 mb-8">{SCRIPT_STAGES.find((s) => s.id === active)?.desc}</p>

          {active === "logline" && (
            <LoglineStage value={script.logline || ""} onChange={(v) => onScalarUpdate({ logline: v })} />
          )}
          {active === "synopsis" && (
            <SynopsisStage value={script.synopsis || ""} onChange={(v) => onScalarUpdate({ synopsis: v })} />
          )}
          {active === "theme" && (
            <ThemeStage value={script.theme || ""} onChange={(v) => onScalarUpdate({ theme: v })} />
          )}
          {active === "motifs" && (
            <MotifsStage value={script.motifs || ""} onChange={(v) => onScalarUpdate({ motifs: v })} />
          )}
          {active === "actSummary" && (
            <ActSummaryStage
              value={script.actSummaries || {}}
              onChange={(patch) => onScalarUpdate({ actSummaries: patch })}
            />
          )}
          {active === "beatSheet" && (
            <BeatSheetStage
              entries={script.beatSheet || []}
              onAdd={onAddBeat}
              onUpdate={onUpdateBeat}
              onDelete={onDeleteBeat}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Logline — single big input, autosave on blur. Editorial typography to
// signal that the logline matters.
function LoglineStage({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <div className="space-y-3">
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { if (local !== value) onChange(local); }}
        rows={3}
        placeholder="A young AI idol manufactured to pacify the world wakes up, and the only person who can free her is a girl with a broken keyboard."
        className="w-full px-4 py-3 text-lg leading-snug rounded-xl bg-black/30 border border-white/10 text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none font-light"
      />
      <div className="text-[11px] text-gray-500 leading-relaxed">
        One sentence. The core pitch — protagonist + opposition + stakes. Workshop it freely; the agent can iterate with you on alternates in chat. When you're locked, downstream stages snapshot from here.
      </div>
    </div>
  );
}

// Synopsis — paragraph editor.
function SynopsisStage({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <div className="space-y-3">
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { if (local !== value) onChange(local); }}
        rows={10}
        placeholder="A paragraph or two outlining the story and theme. Where it starts, where it goes, what changes, what it's really about."
        className="w-full px-4 py-3 text-base leading-relaxed rounded-xl bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none"
      />
      <div className="text-[11px] text-gray-500">
        Snapshots from the logline. The agent can expand a logline into a synopsis — just ask.
      </div>
    </div>
  );
}

// Act Summary — four collapsible sub-editors.
function ActSummaryStage({
  value, onChange,
}: {
  value: { act1?: string; act2a?: string; act2b?: string; act3?: string };
  onChange: (patch: { act1?: string; act2a?: string; act2b?: string; act3?: string }) => void;
}) {
  const ACTS: Array<{ key: "act1" | "act2a" | "act2b" | "act3"; label: string; hint: string }> = [
    { key: "act1", label: "Act 1 — Setup", hint: "Hero, world, status quo. Inciting incident. End on doorway-of-no-return into Act 2." },
    { key: "act2a", label: "Act 2A — Rising Action", hint: "Hero enters new world. New rules, allies, antagonists. Builds toward midpoint." },
    { key: "act2b", label: "Act 2B — Complications", hint: "Midpoint shift. Things get harder. Costs rise. Lowest point near end of Act 2." },
    { key: "act3", label: "Act 3 — Climax + Resolution", hint: "Hero confronts opposition. Climax. New equilibrium." },
  ];
  const [locals, setLocals] = useState<Record<string, string>>({
    act1: value.act1 || "",
    act2a: value.act2a || "",
    act2b: value.act2b || "",
    act3: value.act3 || "",
  });
  useEffect(() => {
    setLocals({
      act1: value.act1 || "",
      act2a: value.act2a || "",
      act2b: value.act2b || "",
      act3: value.act3 || "",
    });
  }, [value.act1, value.act2a, value.act2b, value.act3]);

  const commit = (key: "act1" | "act2a" | "act2b" | "act3") => {
    if (locals[key] !== (value[key] || "")) onChange({ [key]: locals[key] });
  };

  return (
    <div className="space-y-5">
      {ACTS.map((act) => (
        <div key={act.key}>
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="text-sm text-gray-200">{act.label}</h3>
            <span className="text-[10px] text-gray-500">{(locals[act.key] || "").length} chars</span>
          </div>
          <textarea
            value={locals[act.key] || ""}
            onChange={(e) => setLocals((prev) => ({ ...prev, [act.key]: e.target.value }))}
            onBlur={() => commit(act.key)}
            rows={4}
            placeholder={act.hint}
            className="w-full px-3 py-2 text-sm leading-relaxed rounded-lg bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none"
          />
        </div>
      ))}
      <div className="text-[11px] text-gray-500">
        Four paragraphs, one per act. Snapshot from the synopsis. The agent can draft these from your synopsis and theme — just ask.
      </div>
    </div>
  );
}

// Character Summary — list of editable cards with optional entity link.
function CharacterSummaryStage({
  entries, entities, onAdd, onUpdate, onDelete,
}: {
  entries: Array<{ id: string; name: string; summary: string; linkedEntityId?: string }>;
  entities: Entity[];
  onAdd: (name: string, summary: string, linkedEntityId?: string) => void;
  onUpdate: (id: string, patch: { name?: string; summary?: string; linkedEntityId?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [draftName, setDraftName] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [draftLinkedId, setDraftLinkedId] = useState("");

  const handleAdd = () => {
    if (!draftName.trim()) return;
    onAdd(draftName.trim(), draftSummary.trim(), draftLinkedId || undefined);
    setDraftName("");
    setDraftSummary("");
    setDraftLinkedId("");
  };

  return (
    <div className="space-y-4">
      {/* Existing entries */}
      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-gray-500">
          No character summaries yet. Add some below — or ask the agent to seed them from your entities.
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <CharacterSummaryCard key={entry.id} entry={entry} entities={entities} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </div>
      )}

      {/* Add new */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Add a character summary</div>
        <div className="flex gap-2">
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Name"
            className="flex-1 px-3 py-1.5 text-sm rounded bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40"
          />
          <select
            value={draftLinkedId}
            onChange={(e) => setDraftLinkedId(e.target.value)}
            className="px-2 py-1.5 text-xs rounded bg-black/30 border border-white/10 text-gray-300 focus:outline-none focus:border-amber-500/40"
          >
            <option value="">Link to entity... (optional)</option>
            {entities.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
          </select>
        </div>
        <textarea
          value={draftSummary}
          onChange={(e) => setDraftSummary(e.target.value)}
          rows={2}
          placeholder="Short description — 1-3 sentences. Who they are, what they want, what's at stake for them."
          className="w-full px-3 py-2 text-sm leading-relaxed rounded bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none"
        />
        <div className="flex justify-end">
          <button
            onClick={handleAdd}
            disabled={!draftName.trim()}
            className="px-3 py-1.5 text-xs rounded-lg bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 disabled:opacity-40 border border-amber-500/30"
          >
            <Plus className="w-3 h-3 inline mr-1" /> Add character
          </button>
        </div>
      </div>
      <div className="text-[11px] text-gray-500">
        Linked entities snapshot+resync — edits here stay isolated from the World entity until you explicitly resync. The agent can populate this stage from existing World entities — just ask.
      </div>
    </div>
  );
}

function CharacterSummaryCard({
  entry, entities, onUpdate, onDelete,
}: {
  entry: { id: string; name: string; summary: string; linkedEntityId?: string; updatedAt?: number };
  entities: Entity[];
  onUpdate: (id: string, patch: { name?: string; summary?: string; linkedEntityId?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [localName, setLocalName] = useState(entry.name);
  const [localSummary, setLocalSummary] = useState(entry.summary);
  const [localLinkedId, setLocalLinkedId] = useState(entry.linkedEntityId || "");
  useEffect(() => {
    setLocalName(entry.name);
    setLocalSummary(entry.summary);
    setLocalLinkedId(entry.linkedEntityId || "");
  }, [entry.id, entry.updatedAt]);

  const linkedEntity = entry.linkedEntityId ? entities.find((e) => e.id === entry.linkedEntityId) : undefined;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={() => { if (localName !== entry.name) onUpdate(entry.id, { name: localName }); }}
          className="flex-1 px-2 py-1 text-base text-gray-100 bg-transparent border-b border-white/10 focus:outline-none focus:border-amber-500/40"
        />
        {linkedEntity?.referenceImage && (
          <img src={linkedEntity.referenceImage} alt={linkedEntity.name} className="w-8 h-8 rounded object-cover" title={`Linked to entity: ${linkedEntity.name}`} />
        )}
        <select
          value={localLinkedId}
          onChange={(e) => {
            setLocalLinkedId(e.target.value);
            onUpdate(entry.id, { linkedEntityId: e.target.value || undefined });
          }}
          className="px-2 py-1 text-xs rounded bg-black/30 border border-white/10 text-gray-300 focus:outline-none focus:border-amber-500/40"
        >
          <option value="">No link</option>
          {entities.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
        </select>
        <button
          onClick={() => onDelete(entry.id)}
          className="p-1.5 rounded text-gray-500 hover:text-rose-400 hover:bg-rose-500/10"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <textarea
        value={localSummary}
        onChange={(e) => setLocalSummary(e.target.value)}
        onBlur={() => { if (localSummary !== entry.summary) onUpdate(entry.id, { summary: localSummary }); }}
        rows={2}
        placeholder="Short description..."
        className="w-full px-2 py-1.5 text-sm leading-relaxed rounded bg-black/20 border border-white/5 text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none"
      />
    </div>
  );
}

// Scene List — orderable list of scene pitches. Each entry can be promoted
// to a production Scene (snapshot of pitch → scene.prose); resync pulls
// updates back from the production Scene if it's drifted. The bridge from
// Script (Phase 2) to Production (Phase 4).
function SceneListStage({
  entries, scenes,
  onAdd, onUpdate, onDelete, onReorder, onPromote, onResync, onJumpToScene,
}: {
  entries: Array<{ id: string; number?: number; pitch: string; linkedSceneId?: string; lastResyncedAt?: number }>;
  scenes: Scene[];
  onAdd: (pitch: string, position?: number) => void;
  onUpdate: (id: string, pitch: string) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onPromote: (id: string, title?: string) => void;
  onResync: (id: string) => void;
  onJumpToScene: (sceneId: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const handleAdd = () => {
    if (!draft.trim()) return;
    onAdd(draft.trim());
    setDraft("");
  };

  const moveEntry = (id: string, direction: -1 | 1) => {
    const idx = entries.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const next = idx + direction;
    if (next < 0 || next >= entries.length) return;
    const ordered = [...entries];
    [ordered[idx], ordered[next]] = [ordered[next], ordered[idx]];
    onReorder(ordered.map((e) => e.id));
  };

  const promotedCount = entries.filter((e) => e.linkedSceneId).length;

  return (
    <div className="space-y-4">
      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-gray-500">
          No scenes yet. Drop a one-sentence pitch below — or ask the agent to break your act breakdowns into 30-40 scenes.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, idx) => {
            const linkedScene = entry.linkedSceneId ? scenes.find((s) => s.id === entry.linkedSceneId) : undefined;
            return (
              <SceneListCard
                key={entry.id}
                entry={entry}
                index={idx}
                total={entries.length}
                linkedScene={linkedScene}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onMoveUp={() => moveEntry(entry.id, -1)}
                onMoveDown={() => moveEntry(entry.id, 1)}
                onPromote={onPromote}
                onResync={onResync}
                onJumpToScene={onJumpToScene}
              />
            );
          })}
        </div>
      )}

      {/* Add new */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Add a scene to the list</div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="One or two sentences. E.g. 'Sim Siren wakes in her penthouse — a perfect morning rehearsed by the system. She notices a glitch in her reflection.'"
          className="w-full px-3 py-2 text-sm leading-relaxed rounded bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleAdd(); }
          }}
        />
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-gray-500">
            {entries.length} scenes · {promotedCount} promoted to production · ⌘+↵ to add
          </div>
          <button
            onClick={handleAdd}
            disabled={!draft.trim()}
            className="px-3 py-1.5 text-xs rounded-lg bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 disabled:opacity-40 border border-amber-500/30"
          >
            <Plus className="w-3 h-3 inline mr-1" /> Add scene
          </button>
        </div>
      </div>

      <div className="text-[11px] text-gray-500">
        Promote a scene to push it into Production (Phase 4) — the pitch becomes the scene's prose. The scene then has its own life (frames, storyboards, renders). Resync pulls updates back from the production scene to the script. The agent can fill this whole list from your act breakdowns — just ask.
      </div>
    </div>
  );
}

function SceneListCard({
  entry, index, total, linkedScene,
  onUpdate, onDelete, onMoveUp, onMoveDown, onPromote, onResync, onJumpToScene,
}: {
  entry: { id: string; number?: number; pitch: string; linkedSceneId?: string; lastResyncedAt?: number };
  index: number;
  total: number;
  linkedScene?: Scene;
  onUpdate: (id: string, pitch: string) => void;
  onDelete: (id: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onPromote: (id: string, title?: string) => void;
  onResync: (id: string) => void;
  onJumpToScene: (sceneId: string) => void;
}) {
  const [local, setLocal] = useState(entry.pitch);
  useEffect(() => { setLocal(entry.pitch); }, [entry.id, entry.pitch]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className={cn(
      "rounded-lg border bg-white/[0.03] px-3 py-2.5 flex items-start gap-3",
      entry.linkedSceneId ? "border-cyan-500/30" : "border-white/10",
    )}>
      {/* Number + move arrows */}
      <div className="flex flex-col items-center gap-1 pt-1 flex-shrink-0">
        <span className={cn(
          "text-[11px] font-mono",
          entry.linkedSceneId ? "text-cyan-300" : "text-gray-500",
        )}>
          {String(entry.number ?? index + 1).padStart(2, "0")}
        </span>
        <div className="flex flex-col">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-0.5 text-gray-600 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move up"
          >
            <ChevronUp className="w-3 h-3" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-0.5 text-gray-600 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move down"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Pitch */}
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { if (local !== entry.pitch) onUpdate(entry.id, local); }}
        rows={2}
        className="flex-1 px-2 py-1.5 text-sm leading-relaxed rounded bg-black/20 border border-white/5 text-gray-200 focus:outline-none focus:border-amber-500/40 resize-none"
      />

      {/* Actions */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {entry.linkedSceneId ? (
          <>
            <button
              onClick={() => onJumpToScene(entry.linkedSceneId!)}
              className="text-[10px] text-cyan-300 hover:text-cyan-100 flex items-center gap-1"
              title={linkedScene ? `Open production scene: ${linkedScene.title}` : "Open production scene"}
            >
              <Film className="w-3 h-3" />
              {linkedScene ? linkedScene.title.slice(0, 18) : "Open scene"}
            </button>
            <button
              onClick={() => onResync(entry.id)}
              className="text-[10px] text-gray-500 hover:text-amber-300 flex items-center gap-1"
              title="Pull the latest prose from the production scene back into this pitch"
            >
              <RefreshCw className="w-3 h-3" />
              Resync
            </button>
          </>
        ) : (
          <button
            onClick={() => onPromote(entry.id)}
            className="px-2 py-1 text-[10px] rounded bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 border border-amber-500/30 flex items-center gap-1"
            title="Create a production Scene from this pitch (snapshot — pitch becomes scene's prose)"
          >
            <ArrowRight className="w-3 h-3" />
            Promote to Scene
          </button>
        )}
        <button
          onClick={() => {
            if (confirmDelete) onDelete(entry.id);
            else { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); }
          }}
          className={cn(
            "p-1 rounded",
            confirmDelete ? "text-rose-300 bg-rose-500/20" : "text-gray-600 hover:text-rose-400"
          )}
          title={confirmDelete ? "Click again to confirm" : "Delete this scene-list entry"}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// Act Breakdown — bullet list per act. Each bullet is a single line; the
// arrays let the writer reshuffle story points without disturbing prose.
function ActBreakdownStage({
  value, onChange,
}: {
  value: { act1?: string[]; act2a?: string[]; act2b?: string[]; act3?: string[] };
  onChange: (patch: { act1?: string[]; act2a?: string[]; act2b?: string[]; act3?: string[] }) => void;
}) {
  const ACTS: Array<{ key: "act1" | "act2a" | "act2b" | "act3"; label: string }> = [
    { key: "act1", label: "Act 1 — Setup" },
    { key: "act2a", label: "Act 2A — Rising Action" },
    { key: "act2b", label: "Act 2B — Complications" },
    { key: "act3", label: "Act 3 — Climax + Resolution" },
  ];
  // Store as textareas (one bullet per line) — much faster to edit than
  // managing a list of separate inputs.
  const toText = (arr?: string[]) => (arr || []).join("\n");
  const fromText = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);
  const [locals, setLocals] = useState<Record<string, string>>({
    act1: toText(value.act1), act2a: toText(value.act2a), act2b: toText(value.act2b), act3: toText(value.act3),
  });
  useEffect(() => {
    setLocals({
      act1: toText(value.act1), act2a: toText(value.act2a), act2b: toText(value.act2b), act3: toText(value.act3),
    });
  }, [value.act1, value.act2a, value.act2b, value.act3]);

  const commit = (key: "act1" | "act2a" | "act2b" | "act3") => {
    const next = fromText(locals[key] || "");
    if (JSON.stringify(next) !== JSON.stringify(value[key] || [])) onChange({ [key]: next });
  };

  return (
    <div className="space-y-5">
      {ACTS.map((act) => {
        const lineCount = (locals[act.key] || "").split("\n").filter((l) => l.trim()).length;
        return (
          <div key={act.key}>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-sm text-gray-200">{act.label}</h3>
              <span className="text-[10px] text-gray-500">{lineCount} bullet{lineCount === 1 ? "" : "s"}</span>
            </div>
            <textarea
              value={locals[act.key] || ""}
              onChange={(e) => setLocals((prev) => ({ ...prev, [act.key]: e.target.value }))}
              onBlur={() => commit(act.key)}
              rows={5}
              placeholder="One bullet per line. Each bullet = a specific story point in this act."
              className="w-full px-3 py-2 text-sm leading-relaxed rounded-lg bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none font-mono"
            />
          </div>
        );
      })}
      <div className="text-[11px] text-gray-500">
        One bullet per line. Tighten and reshuffle freely — these become the spine of your scene list. The agent can break a synopsis or act summary into bullets — just ask.
      </div>
    </div>
  );
}

// Character List (Stage 6) — deeper character work with arcs + motivations.
// Same shape as Character Summary but with extra fields.
function CharacterListStage({
  entries, entities, onAdd, onUpdate, onDelete,
}: {
  entries: Array<{ id: string; name: string; description?: string; arc?: string; motivations?: string; linkedEntityId?: string; updatedAt?: number }>;
  entities: Entity[];
  onAdd: (name: string, description?: string, arc?: string, motivations?: string, linkedEntityId?: string) => void;
  onUpdate: (id: string, patch: { name?: string; description?: string; arc?: string; motivations?: string; linkedEntityId?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftArc, setDraftArc] = useState("");
  const [draftMotivations, setDraftMotivations] = useState("");
  const [draftLinkedId, setDraftLinkedId] = useState("");

  const handleAdd = () => {
    if (!draftName.trim()) return;
    onAdd(draftName.trim(), draftDescription.trim(), draftArc.trim(), draftMotivations.trim(), draftLinkedId || undefined);
    setDraftName(""); setDraftDescription(""); setDraftArc(""); setDraftMotivations(""); setDraftLinkedId("");
  };

  return (
    <div className="space-y-4">
      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-gray-500">
          No deep character work yet. The Character Summary stage is for quick sketches; this stage is for the deeper profiles — arc, motivations, what they do. Ask the agent to expand your character summaries here.
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <CharacterListCard key={entry.id} entry={entry} entities={entities} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Add a character profile</div>
        <div className="flex gap-2">
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Name"
            className="flex-1 px-3 py-1.5 text-sm rounded bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40"
          />
          <select
            value={draftLinkedId}
            onChange={(e) => setDraftLinkedId(e.target.value)}
            className="px-2 py-1.5 text-xs rounded bg-black/30 border border-white/10 text-gray-300 focus:outline-none focus:border-amber-500/40"
          >
            <option value="">Link to entity... (optional)</option>
            {entities.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
          </select>
        </div>
        <textarea
          value={draftDescription}
          onChange={(e) => setDraftDescription(e.target.value)}
          rows={2}
          placeholder="Description — who they are at the start, what defines them"
          className="w-full px-3 py-2 text-sm rounded bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none"
        />
        <textarea
          value={draftArc}
          onChange={(e) => setDraftArc(e.target.value)}
          rows={2}
          placeholder="Arc — how they change. Start → midpoint → end."
          className="w-full px-3 py-2 text-sm rounded bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none"
        />
        <textarea
          value={draftMotivations}
          onChange={(e) => setDraftMotivations(e.target.value)}
          rows={2}
          placeholder="Motivations — what drives them, what they want, what they need (often different)"
          className="w-full px-3 py-2 text-sm rounded bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none"
        />
        <div className="flex justify-end">
          <button
            onClick={handleAdd}
            disabled={!draftName.trim()}
            className="px-3 py-1.5 text-xs rounded-lg bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 disabled:opacity-40 border border-amber-500/30"
          >
            <Plus className="w-3 h-3 inline mr-1" /> Add profile
          </button>
        </div>
      </div>
      <div className="text-[11px] text-gray-500">
        Linked entities snapshot+resync — edits here stay isolated from the World entity until you explicitly resync.
      </div>
    </div>
  );
}

function CharacterListCard({
  entry, entities, onUpdate, onDelete,
}: {
  entry: { id: string; name: string; description?: string; arc?: string; motivations?: string; linkedEntityId?: string; updatedAt?: number };
  entities: Entity[];
  onUpdate: (id: string, patch: { name?: string; description?: string; arc?: string; motivations?: string; linkedEntityId?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [localName, setLocalName] = useState(entry.name);
  const [localDescription, setLocalDescription] = useState(entry.description || "");
  const [localArc, setLocalArc] = useState(entry.arc || "");
  const [localMotivations, setLocalMotivations] = useState(entry.motivations || "");
  const [localLinkedId, setLocalLinkedId] = useState(entry.linkedEntityId || "");
  useEffect(() => {
    setLocalName(entry.name);
    setLocalDescription(entry.description || "");
    setLocalArc(entry.arc || "");
    setLocalMotivations(entry.motivations || "");
    setLocalLinkedId(entry.linkedEntityId || "");
  }, [entry.id, entry.updatedAt]);

  const linkedEntity = entry.linkedEntityId ? entities.find((e) => e.id === entry.linkedEntityId) : undefined;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={() => { if (localName !== entry.name) onUpdate(entry.id, { name: localName }); }}
          className="flex-1 px-2 py-1 text-base text-gray-100 bg-transparent border-b border-white/10 focus:outline-none focus:border-amber-500/40"
        />
        {linkedEntity?.referenceImage && (
          <img src={linkedEntity.referenceImage} alt={linkedEntity.name} className="w-8 h-8 rounded object-cover" title={`Linked: ${linkedEntity.name}`} />
        )}
        <select
          value={localLinkedId}
          onChange={(e) => {
            setLocalLinkedId(e.target.value);
            onUpdate(entry.id, { linkedEntityId: e.target.value || undefined });
          }}
          className="px-2 py-1 text-xs rounded bg-black/30 border border-white/10 text-gray-300 focus:outline-none focus:border-amber-500/40"
        >
          <option value="">No link</option>
          {entities.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
        </select>
        <button
          onClick={() => onDelete(entry.id)}
          className="p-1.5 rounded text-gray-500 hover:text-rose-400 hover:bg-rose-500/10"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="space-y-2">
        <div>
          <div className="text-[10px] uppercase text-gray-500 mb-1">Description</div>
          <textarea
            value={localDescription}
            onChange={(e) => setLocalDescription(e.target.value)}
            onBlur={() => { if (localDescription !== (entry.description || "")) onUpdate(entry.id, { description: localDescription }); }}
            rows={2}
            className="w-full px-2 py-1.5 text-sm leading-relaxed rounded bg-black/20 border border-white/5 text-gray-300 focus:outline-none focus:border-amber-500/40 resize-none"
          />
        </div>
        <div>
          <div className="text-[10px] uppercase text-gray-500 mb-1">Arc</div>
          <textarea
            value={localArc}
            onChange={(e) => setLocalArc(e.target.value)}
            onBlur={() => { if (localArc !== (entry.arc || "")) onUpdate(entry.id, { arc: localArc }); }}
            rows={2}
            className="w-full px-2 py-1.5 text-sm leading-relaxed rounded bg-black/20 border border-white/5 text-gray-300 focus:outline-none focus:border-amber-500/40 resize-none"
          />
        </div>
        <div>
          <div className="text-[10px] uppercase text-gray-500 mb-1">Motivations</div>
          <textarea
            value={localMotivations}
            onChange={(e) => setLocalMotivations(e.target.value)}
            onBlur={() => { if (localMotivations !== (entry.motivations || "")) onUpdate(entry.id, { motivations: localMotivations }); }}
            rows={2}
            className="w-full px-2 py-1.5 text-sm leading-relaxed rounded bg-black/20 border border-white/5 text-gray-300 focus:outline-none focus:border-amber-500/40 resize-none"
          />
        </div>
      </div>
    </div>
  );
}

// Beat Sheet (Stage 7) — narrative beats at positions
function BeatSheetStage({
  entries, onAdd, onUpdate, onDelete,
}: {
  entries: Array<{ id: string; label: string; position?: number; description?: string }>;
  onAdd: (label: string, position?: number, description?: string) => void;
  onUpdate: (id: string, patch: { label?: string; position?: number; description?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [draftLabel, setDraftLabel] = useState("");
  const [draftPosition, setDraftPosition] = useState("");
  const [draftDescription, setDraftDescription] = useState("");

  // Common beat presets — quick-add buttons for Save the Cat style
  const PRESETS = ["Opening Image", "Theme Stated", "Setup", "Catalyst", "Debate", "Break Into Two", "B Story", "Fun and Games", "Midpoint", "Bad Guys Close In", "All Is Lost", "Dark Night of the Soul", "Break Into Three", "Finale", "Final Image"];

  const handleAdd = () => {
    if (!draftLabel.trim()) return;
    const pos = draftPosition.trim() ? parseFloat(draftPosition) : undefined;
    onAdd(draftLabel.trim(), Number.isFinite(pos) ? pos : undefined, draftDescription.trim() || undefined);
    setDraftLabel(""); setDraftPosition(""); setDraftDescription("");
  };

  const sortedEntries = [...entries].sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));

  return (
    <div className="space-y-4">
      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-gray-500">
          No beats yet. Beats are narrative landmarks at specific positions (page numbers, scene numbers, %s). Click a preset below or add your own.
        </div>
      ) : (
        <div className="space-y-2">
          {sortedEntries.map((entry) => (
            <BeatSheetCard key={entry.id} entry={entry} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </div>
      )}

      {/* Quick-add presets */}
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Save the Cat presets — click to add</div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.filter((p) => !entries.some((e) => e.label === p)).map((preset, i) => (
            <button
              key={preset}
              onClick={() => onAdd(preset, i + 1)}
              className="text-[11px] px-2 py-0.5 rounded bg-white/5 text-gray-300 hover:bg-amber-500/20 hover:text-amber-200 border border-white/5 hover:border-amber-500/30 transition-colors"
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Add custom */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Add a custom beat</div>
        <div className="flex gap-2">
          <input
            type="text"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            placeholder="Beat label (e.g. 'Sim Siren breaks character')"
            className="flex-1 px-3 py-1.5 text-sm rounded bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40"
          />
          <input
            type="number"
            value={draftPosition}
            onChange={(e) => setDraftPosition(e.target.value)}
            placeholder="Pos"
            className="w-20 px-3 py-1.5 text-sm rounded bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40"
          />
        </div>
        <textarea
          value={draftDescription}
          onChange={(e) => setDraftDescription(e.target.value)}
          rows={2}
          placeholder="What happens at this beat (optional)"
          className="w-full px-3 py-2 text-sm rounded bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none"
        />
        <div className="flex justify-end">
          <button
            onClick={handleAdd}
            disabled={!draftLabel.trim()}
            className="px-3 py-1.5 text-xs rounded-lg bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 disabled:opacity-40 border border-amber-500/30"
          >
            <Plus className="w-3 h-3 inline mr-1" /> Add beat
          </button>
        </div>
      </div>
    </div>
  );
}

function BeatSheetCard({
  entry, onUpdate, onDelete,
}: {
  entry: { id: string; label: string; position?: number; description?: string };
  onUpdate: (id: string, patch: { label?: string; position?: number; description?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [localLabel, setLocalLabel] = useState(entry.label);
  const [localPosition, setLocalPosition] = useState(entry.position?.toString() || "");
  const [localDescription, setLocalDescription] = useState(entry.description || "");
  useEffect(() => {
    setLocalLabel(entry.label);
    setLocalPosition(entry.position?.toString() || "");
    setLocalDescription(entry.description || "");
  }, [entry.id]);

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 flex items-start gap-3">
      <input
        type="number"
        value={localPosition}
        onChange={(e) => setLocalPosition(e.target.value)}
        onBlur={() => {
          const pos = localPosition.trim() ? parseFloat(localPosition) : undefined;
          if (pos !== entry.position) onUpdate(entry.id, { position: Number.isFinite(pos) ? pos : undefined });
        }}
        className="w-12 px-1 py-1 text-xs rounded bg-black/30 border border-white/10 text-amber-300 text-center focus:outline-none focus:border-amber-500/40"
      />
      <div className="flex-1 space-y-1.5">
        <input
          type="text"
          value={localLabel}
          onChange={(e) => setLocalLabel(e.target.value)}
          onBlur={() => { if (localLabel !== entry.label) onUpdate(entry.id, { label: localLabel }); }}
          className="w-full px-2 py-1 text-sm text-gray-100 bg-transparent border-b border-white/10 focus:outline-none focus:border-amber-500/40"
        />
        <textarea
          value={localDescription}
          onChange={(e) => setLocalDescription(e.target.value)}
          onBlur={() => { if (localDescription !== (entry.description || "")) onUpdate(entry.id, { description: localDescription }); }}
          rows={1}
          placeholder="What happens at this beat..."
          className="w-full px-2 py-1 text-xs leading-relaxed rounded bg-black/20 border border-white/5 text-gray-400 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none"
        />
      </div>
      <button
        onClick={() => onDelete(entry.id)}
        className="p-1 rounded text-gray-600 hover:text-rose-400"
        title="Delete beat"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

// Theme — single textarea
function ThemeStage({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <div className="space-y-3">
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { if (local !== value) onChange(local); }}
        rows={8}
        placeholder="What is the story really about? Beyond plot — what's the underlying truth, the question, the change you're hunting?"
        className="w-full px-4 py-3 text-base leading-relaxed rounded-xl bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none"
      />
      <div className="text-[11px] text-gray-500">
        No upstream dependency — write whenever it crystallizes. Often emerges through the work, not before it. The agent can suggest themes based on your synopsis + character arcs.
      </div>
    </div>
  );
}

// Motifs — recurring visual and narrative patterns that thread the work.
// Distinct from theme: theme is "what the story is about"; motifs are "the
// stuff that recurs" (objects, colors, sounds, mirrors, broken glass, etc.).
// Downstream phases (Storyboard generation, frame rendering) can pick these
// up to weave continuity into individual shots.
function MotifsStage({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <div className="space-y-3">
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { if (local !== value) onChange(local); }}
        rows={8}
        placeholder={`Recurring images, objects, sounds, color choices, framings, lines that thread through the work.\n\nExamples: "Mirrors always cracked. The color teal in every confession scene. The clock that's always three minutes slow. The phrase 'You don't remember' — said three times across three acts."`}
        className="w-full px-4 py-3 text-base leading-relaxed rounded-xl bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none"
      />
      <div className="text-[11px] text-gray-500">
        Motifs reach downstream — the agent can weave them into storyboard panels, individual shots, and prose. The more specific, the more they shape the rendered work.
      </div>
    </div>
  );
}

// The Write (Stage 10) — long-form prose surface
function WriteStage({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <div className="space-y-3">
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { if (local !== value) onChange(local); }}
        rows={28}
        placeholder={`Start writing. One scene a day gets you a full screenplay in 40 days.\n\nYou can also use this as a place to dump prose drafts that aren't yet broken into Scene List entries. When you're ready, copy passages out and promote them to production Scenes from the Scene List stage.`}
        className="w-full px-5 py-4 text-base leading-loose rounded-xl bg-black/30 border border-white/10 text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none font-mono"
      />
      <div className="text-[11px] text-gray-500 flex items-center justify-between">
        <span>{local.length.toLocaleString()} chars · ~{Math.round(local.split(/\s+/).filter(Boolean).length).toLocaleString()} words</span>
        <span>Long-form prose. Snapshot to production Scenes via the Scene List stage.</span>
      </div>
    </div>
  );
}

function StoryboardView({
  storyboards, scenes, entities, acts,
  scriptChunk, onScriptChunkChange,
  title, onTitleChange,
  panelCount, onPanelCountChange,
  model, onModelChange,
  isGenerating, onGenerate,
  onSelectStoryboard, onExtractPanel,
  onOpenScene, onSeedFromScene,
  onSceneClick, onFrameClick,
  onGenerateStoryboardForScene, isGeneratingStoryboardForScene,
  onAddAct, onUpdateAct, onDeleteAct,
  onAssignSceneToAct, onCreateBlankScene,
}: StoryboardViewProps) {
  // Modal-detail state for the click-to-extract-panel overlay.
  const [openStoryboardId, setOpenStoryboardId] = useState<string | null>(null);
  const openStoryboard = openStoryboardId ? storyboards.find((s) => s.id === openStoryboardId) : null;

  // Lookup: sceneId → Scene for source-scene badges on storyboard cards.
  const sceneById = useMemo(() => {
    const map = new Map<string, Scene>();
    for (const s of scenes) map.set(s.id, s);
    return map;
  }, [scenes]);

  // Group scenes by act. Unassigned scenes go in the trailing bucket.
  const { scenesByAct, unassignedScenes } = useMemo(() => {
    const byAct = new Map<string, Scene[]>();
    const unassigned: Scene[] = [];
    for (const s of scenes) {
      if (s.actId && acts.some((a) => a.id === s.actId)) {
        const list = byAct.get(s.actId) || [];
        list.push(s);
        byAct.set(s.actId, list);
      } else {
        unassigned.push(s);
      }
    }
    // Sort scenes within each bucket by position
    byAct.forEach((list: Scene[]) => {
      list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    });
    unassigned.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return { scenesByAct: byAct, unassignedScenes: unassigned };
  }, [scenes, acts]);

  // Lookup: sceneId → linked storyboard count
  const storyboardCountByScene = useMemo(() => {
    const map = new Map<string, number>();
    for (const sb of storyboards) {
      const sid = (sb as any).content?.sceneId as string | undefined;
      if (!sid) continue;
      map.set(sid, (map.get(sid) || 0) + 1);
    }
    return map;
  }, [storyboards]);

  // Sorted acts (defensive — server should already sort but we sort again).
  const sortedActs = useMemo(() => acts.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [acts]);

  // Pages section collapsed by default — it used to be the whole view but is
  // now a footer reference for the multi-panel pages.
  const [pagesExpanded, setPagesExpanded] = useState(false);

  // Editing state for inline act-title and act-arc.
  const [editingActField, setEditingActField] = useState<{ id: string; field: "title" | "arc" } | null>(null);
  const [editBuffer, setEditBuffer] = useState("");

  // New-act composer
  const [newActTitle, setNewActTitle] = useState("");
  const [newActOpen, setNewActOpen] = useState(false);

  const startEditAct = (id: string, field: "title" | "arc", current: string) => {
    setEditingActField({ id, field });
    setEditBuffer(current);
  };
  const commitEditAct = () => {
    if (!editingActField) return;
    const patch = editingActField.field === "title" ? { title: editBuffer } : { arc: editBuffer };
    onUpdateAct(editingActField.id, patch);
    setEditingActField(null);
  };
  const cancelEditAct = () => {
    setEditingActField(null);
    setEditBuffer("");
  };

  const handleCreateAct = async () => {
    if (!newActTitle.trim()) return;
    await onAddAct(newActTitle.trim());
    setNewActTitle("");
    setNewActOpen(false);
  };

  // SceneTile — compact card used inside an act's grid. Shows hero image,
  // shot strip, key badges. Click → opens the Scene workbench. Right-corner
  // "act picker" dropdown lets the user re-assign without entering the
  // workbench.
  const renderSceneTile = (scene: Scene, globalIdx: number) => {
    const participants = entities.filter((e) => scene.participantIds.includes(e.id));
    const location = entities.find((e) => e.id === scene.locationId);
    const frames = scene.frames || [];
    const sbCount = storyboardCountByScene.get(scene.id) || 0;

    return (
      <div
        key={scene.id}
        className="group relative rounded-xl overflow-hidden bg-slate-900 border border-white/10 hover:border-amber-500/40 transition-colors flex flex-col"
      >
        <button
          onClick={() => onSceneClick(scene)}
          className="relative aspect-[16/9] bg-black overflow-hidden text-left"
          title="Open this scene's workbench"
        >
          {scene.imageUrl ? (
            <img src={scene.imageUrl} alt={scene.title} className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
              <Film className="w-10 h-10 text-amber-500/20" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
          <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-amber-300 uppercase tracking-wider">
              Scene {globalIdx + 1}
            </span>
            {scene.status === "draft" ? (
              <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/80 text-black">Draft</span>
            ) : (
              <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-500/80 text-black flex items-center gap-0.5">
                <Award className="w-2.5 h-2.5" />
                Canon
              </span>
            )}
          </div>
          {participants.length > 0 && (
            <div className="absolute top-2 right-2 flex -space-x-1.5">
              {participants.slice(0, 3).map((entity) => {
                const config = entityTypeConfig[entity.type] || entityTypeConfig.character;
                return (
                  <div
                    key={entity.id}
                    className={cn("w-5 h-5 rounded-full overflow-hidden ring-1 ring-slate-900", config.ringColor)}
                    title={entity.name}
                  >
                    {entity.referenceImage ? (
                      <img src={entity.referenceImage} alt={entity.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className={cn("w-full h-full flex items-center justify-center", config.bgColor)}>
                        <config.icon className={cn("w-3 h-3", config.color)} />
                      </div>
                    )}
                  </div>
                );
              })}
              {participants.length > 3 && (
                <div className="w-5 h-5 rounded-full bg-slate-800 ring-1 ring-slate-900 flex items-center justify-center">
                  <span className="text-[8px] text-gray-300">+{participants.length - 3}</span>
                </div>
              )}
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 p-2">
            <h3 className="text-sm font-semibold text-white truncate drop-shadow">{scene.title || `Scene ${globalIdx + 1}`}</h3>
            {location && (
              <p className="text-[10px] text-gray-300 flex items-center gap-1 mt-0.5">
                <MapPin className="w-2.5 h-2.5 text-purple-300/80" />
                <span className="truncate">{location.name}</span>
              </p>
            )}
          </div>
        </button>

        <div className="p-2 space-y-1.5 flex-1 flex flex-col">
          {scene.prose && (
            <p className="text-[10px] text-gray-400 leading-relaxed line-clamp-2">{scene.prose}</p>
          )}

          {frames.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide -mx-1 px-1">
              {frames.slice(0, 8).map((frame, fIdx) => (
                <button
                  key={frame.id}
                  onClick={(e) => { e.stopPropagation(); onFrameClick?.(scene, frame); }}
                  className="relative flex-shrink-0 h-8 aspect-[16/9] rounded overflow-hidden border border-white/10 hover:border-amber-400/60 transition-colors"
                  title={frame.title || `Shot ${fIdx + 1}`}
                >
                  {frame.imageUrl ? (
                    <img src={frame.imageUrl} alt={frame.title || `Shot ${fIdx + 1}`} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                      <Film className="w-2.5 h-2.5 text-gray-600" />
                    </div>
                  )}
                </button>
              ))}
              {frames.length > 8 && (
                <span className="text-[9px] text-gray-500 px-1">+{frames.length - 8}</span>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-1 mt-auto pt-1">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-200 flex items-center gap-0.5">
                <LayoutGrid className="w-2.5 h-2.5" />
                {frames.length}
              </span>
              {sbCount > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-200 flex items-center gap-0.5" title="Linked storyboard pages">
                  <FileText className="w-2.5 h-2.5" />
                  {sbCount}
                </span>
              )}
              {onGenerateStoryboardForScene && (
                <button
                  onClick={(e) => { e.stopPropagation(); onGenerateStoryboardForScene(scene); }}
                  disabled={isGeneratingStoryboardForScene || !scene.prose?.trim()}
                  className={cn(
                    "text-[9px] px-1.5 py-0.5 rounded flex items-center gap-0.5 border transition-colors",
                    isGeneratingStoryboardForScene
                      ? "bg-purple-500/30 text-purple-200 border-purple-500/40 cursor-wait"
                      : !scene.prose?.trim()
                        ? "bg-white/5 text-gray-600 border-white/5 cursor-not-allowed"
                        : "bg-cyan-500/15 text-cyan-200 border-cyan-500/30 hover:bg-cyan-500/30"
                  )}
                  title={!scene.prose?.trim() ? "Write some scene prose first" : "Generate a multi-panel storyboard page from this scene"}
                >
                  {isGeneratingStoryboardForScene ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Wand2 className="w-2.5 h-2.5" />}
                  Page
                </button>
              )}
            </div>
            {/* Act re-assignment dropdown */}
            <select
              value={scene.actId || ""}
              onChange={(e) => { e.stopPropagation(); onAssignSceneToAct(scene.id, e.target.value || null); }}
              onClick={(e) => e.stopPropagation()}
              className="text-[9px] px-1 py-0.5 rounded bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 focus:outline-none focus:border-amber-500/40"
              title="Move scene to a different act"
            >
              <option value="">Unassigned</option>
              {sortedActs.map((a) => (
                <option key={a.id} value={a.id}>{a.title}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    );
  };

  // ActSection — renders a single act header + its scene grid.
  const renderActSection = (act: ProjectAct | null, sceneList: Scene[]) => {
    const actSceneStartIdx = act
      ? scenes.findIndex((s) => s.actId === act.id)
      : -1;
    return (
      <section key={act?.id || "unassigned"} className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-2">
          <div className="flex-1 min-w-0">
            {act ? (
              <>
                {editingActField?.id === act.id && editingActField.field === "title" ? (
                  <input
                    autoFocus
                    type="text"
                    value={editBuffer}
                    onChange={(e) => setEditBuffer(e.target.value)}
                    onBlur={commitEditAct}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEditAct();
                      if (e.key === "Escape") cancelEditAct();
                    }}
                    className="text-xl font-medium text-amber-200 bg-transparent border-b border-amber-500/40 outline-none w-full"
                  />
                ) : (
                  <button
                    onClick={() => startEditAct(act.id, "title", act.title)}
                    className="text-left group"
                    title="Click to rename"
                  >
                    <h2 className="text-xl font-medium text-amber-200 group-hover:text-amber-100">
                      <span className="text-[10px] uppercase tracking-wider text-amber-400/60 mr-2">Act</span>
                      {act.title}
                    </h2>
                  </button>
                )}
                {editingActField?.id === act.id && editingActField.field === "arc" ? (
                  <textarea
                    autoFocus
                    value={editBuffer}
                    onChange={(e) => setEditBuffer(e.target.value)}
                    onBlur={commitEditAct}
                    onKeyDown={(e) => { if (e.key === "Escape") cancelEditAct(); }}
                    rows={3}
                    placeholder="What's the arc of this act — where do we start, where do we end?"
                    className="w-full mt-1 px-2 py-1 text-xs rounded bg-black/30 border border-amber-500/40 text-gray-300 placeholder:text-gray-600 focus:outline-none resize-none"
                  />
                ) : (
                  <button
                    onClick={() => startEditAct(act.id, "arc", act.arc || "")}
                    className="text-left mt-1 group block"
                    title="Click to edit arc"
                  >
                    {act.arc ? (
                      <p className="text-xs text-gray-400 leading-relaxed group-hover:text-gray-300 line-clamp-2 max-w-3xl">{act.arc}</p>
                    ) : (
                      <p className="text-xs text-gray-600 italic group-hover:text-amber-400/60">+ Add an arc description for this act</p>
                    )}
                  </button>
                )}
              </>
            ) : (
              <h2 className="text-lg font-medium text-gray-400">
                <span className="text-[10px] uppercase tracking-wider text-gray-500 mr-2">Unassigned</span>
                Scenes not yet placed in an act
              </h2>
            )}
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mt-1">
              {sceneList.length} scene{sceneList.length === 1 ? "" : "s"}
            </div>
          </div>
          {act && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => onDeleteAct(act.id)}
                className="p-1.5 rounded text-gray-500 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                title="Delete this act (scenes inside become unassigned, not deleted)"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Scenes grid */}
        {sceneList.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {sceneList.map((scene) => {
              const globalIdx = scenes.findIndex((s) => s.id === scene.id);
              return renderSceneTile(scene, globalIdx);
            })}
            <button
              onClick={() => onCreateBlankScene({ actId: act?.id ?? null })}
              className="group rounded-xl border-2 border-dashed border-white/10 hover:border-amber-400/60 flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-amber-300 transition-all min-h-[160px]"
              title={act ? `Add a new scene to ${act.title}` : "Add a new unassigned scene"}
            >
              <Plus className="w-6 h-6" />
              <span className="text-[10px]">Add Scene</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => onCreateBlankScene({ actId: act?.id ?? null })}
            className="w-full group rounded-xl border-2 border-dashed border-white/10 hover:border-amber-400/60 flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-amber-300 transition-all py-10"
          >
            <Plus className="w-6 h-6" />
            <span className="text-xs">Add the first scene{act ? ` to ${act.title}` : ""}</span>
          </button>
        )}
      </section>
    );
  };

  return (
    <div className="absolute inset-0 overflow-y-auto px-6 pt-8 pb-12">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Page header */}
        <div className="border-b border-white/10 pb-4 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-amber-300/80 mb-1">Phase 3 · Storyboard</div>
            <h1 className="text-2xl text-gray-100 font-light">Acts → Scenes → Shots</h1>
            <p className="text-sm text-gray-400 mt-2 max-w-3xl">
              The story laid out as acts (broad arcs), scenes within them, and shots (frames) within those.
              Drop a scene's prose into a storyboard page when you want to pre-visualize it as multi-panel art —
              panels extract back into the scene as shots.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <span>{sortedActs.length} acts</span>
            <span>·</span>
            <span>{scenes.length} scenes</span>
            <span>·</span>
            <span>{scenes.reduce((acc, s) => acc + (s.frames?.length || 0), 0)} shots</span>
            <span>·</span>
            <span>{storyboards.length} pages</span>
          </div>
        </div>

        {/* Acts list */}
        <div className="space-y-8">
          {sortedActs.map((act) => {
            const list = scenesByAct.get(act.id) || [];
            return renderActSection(act, list);
          })}

          {/* Unassigned bucket */}
          {unassignedScenes.length > 0 && renderActSection(null, unassignedScenes)}

          {/* + Add Act composer */}
          <div className="rounded-xl border-2 border-dashed border-white/10 hover:border-amber-400/40 transition-colors">
            {newActOpen ? (
              <div className="p-4 space-y-2">
                <input
                  autoFocus
                  type="text"
                  value={newActTitle}
                  onChange={(e) => setNewActTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateAct();
                    if (e.key === "Escape") { setNewActOpen(false); setNewActTitle(""); }
                  }}
                  placeholder="Act title (e.g., 'Act 1 — The Setup' or 'The Descent')"
                  className="w-full px-3 py-2 text-sm rounded bg-black/30 border border-amber-500/40 text-gray-200 placeholder:text-gray-600 focus:outline-none"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => { setNewActOpen(false); setNewActTitle(""); }}
                    className="px-3 py-1 text-xs rounded text-gray-400 hover:text-gray-200 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateAct}
                    disabled={!newActTitle.trim()}
                    className="px-3 py-1 text-xs rounded bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 disabled:opacity-50 border border-amber-500/30"
                  >
                    Create act
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setNewActOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-6 text-gray-500 hover:text-amber-300 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span className="text-sm">Add Act</span>
              </button>
            )}
          </div>
        </div>

        {/* Storyboard pages — secondary footer section. The page generator
            + page list used to be this whole view; now they live below the
            acts hierarchy and the per-scene "Page" action above is the
            primary path. */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02]">
          <button
            onClick={() => setPagesExpanded((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5"
          >
            <div className="flex items-center gap-3">
              <LayoutGrid className="w-4 h-4 text-cyan-300" />
              <h2 className="text-sm uppercase tracking-wide text-gray-300">Storyboard pages ({storyboards.length})</h2>
              <span className="text-[10px] text-gray-500">
                {pagesExpanded ? "click to collapse" : "click to expand the page generator + library"}
              </span>
            </div>
            {pagesExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </button>

          {pagesExpanded && (
            <div className="border-t border-white/10 p-4 space-y-4">
              {/* Generator */}
              <section className="rounded-lg bg-white/5 border border-white/10 p-3 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-xs uppercase tracking-wide text-gray-300">Generate a new storyboard page</h3>
                  <div className="flex items-center gap-2 text-[11px] text-gray-400">
                    <span>Panels</span>
                    <select
                      value={panelCount}
                      onChange={(e) => onPanelCountChange(Number(e.target.value))}
                      className="px-2 py-1 rounded bg-black/40 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-500/40"
                    >
                      <option value={6}>6 (2×3)</option>
                      <option value={9}>9 (3×3)</option>
                      <option value={12}>12 (3×4)</option>
                    </select>
                    <span>Backend</span>
                    <select
                      value={model}
                      onChange={(e) => onModelChange(e.target.value as any)}
                      className="px-2 py-1 rounded bg-black/40 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-500/40"
                    >
                      <option value="gpt-image">GPT Image</option>
                      <option value="nano-banana">Nano Banana</option>
                    </select>
                  </div>
                </div>
                {scenes.length > 0 && onSeedFromScene && (
                  <div className="flex items-center gap-2 flex-wrap text-[11px]">
                    <span className="text-gray-500">Seed from scene:</span>
                    <select
                      value=""
                      onChange={(e) => { if (e.target.value) onSeedFromScene(e.target.value); }}
                      className="flex-1 min-w-[200px] px-2 py-1 rounded bg-black/40 border border-cyan-500/30 text-cyan-200 focus:outline-none focus:border-cyan-500/60"
                    >
                      <option value="">Choose a scene to seed prose + title...</option>
                      {scenes.map((s, idx) => (
                        <option key={s.id} value={s.id}>
                          {idx + 1}. {s.title || `Scene ${idx + 1}`}{s.status === "draft" ? " (Draft)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <input
                  type="text"
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                  placeholder="Storyboard title (optional)"
                  className="w-full px-3 py-2 text-sm rounded bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-amber-500/40"
                />
                <textarea
                  value={scriptChunk}
                  onChange={(e) => onScriptChunkChange(e.target.value)}
                  rows={6}
                  placeholder="Paste the script chunk, beat list, or scene prose — or seed from a scene above."
                  className="w-full px-3 py-2 text-sm rounded bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-amber-500/40 resize-none leading-relaxed"
                />
                <div className="flex items-center justify-end">
                  <button
                    onClick={onGenerate}
                    disabled={isGenerating || !scriptChunk.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs rounded-lg bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 disabled:opacity-50 border border-amber-500/30"
                  >
                    {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <LayoutGrid className="w-3 h-3" />}
                    {isGenerating ? "Rendering page..." : `Generate ${panelCount}-panel page`}
                  </button>
                </div>
              </section>

              {/* Pages library */}
              {storyboards.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/15 p-6 text-center text-xs text-gray-500">
                  No pages yet. Generate one above, or use the "Page" action on any scene tile.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {storyboards.map((sb) => {
                    const sourceSceneId = (sb as any).content?.sceneId as string | undefined;
                    const sourceScene = sourceSceneId ? sceneById.get(sourceSceneId) : null;
                    const sourceSceneIdx = sourceScene ? scenes.findIndex((s) => s.id === sourceScene.id) : -1;
                    return (
                      <div
                        key={sb.id}
                        className="group relative rounded-lg overflow-hidden bg-white/5 border border-white/10 hover:border-amber-500/40 transition-colors"
                      >
                        <button
                          onClick={() => { setOpenStoryboardId(sb.id); onSelectStoryboard(sb); }}
                          className="block w-full text-left"
                        >
                          <div className="aspect-[2/3] bg-black overflow-hidden relative">
                            {sb.primaryImage?.url ? (
                              <img src={sb.primaryImage.url} alt={sb.title} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[11px] text-gray-600">No image</div>
                            )}
                            {sourceScene && (
                              <div className="absolute top-2 left-2">
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/80 text-black font-medium flex items-center gap-1">
                                  <Film className="w-2.5 h-2.5" />
                                  Scene {sourceSceneIdx + 1}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="p-2">
                            <div className="text-xs text-gray-200 truncate">{sb.title}</div>
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              {sb.content?.panelCount || 0} panels · {sb.content?.backend || "?"}
                            </div>
                          </div>
                        </button>
                        {sourceScene && onOpenScene && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onOpenScene(sourceScene.id); }}
                            className="absolute bottom-1.5 right-1.5 px-1 py-0.5 rounded text-[9px] flex items-center gap-0.5 bg-amber-500/20 text-amber-200 border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
                            title={`Jump to scene: ${sourceScene.title}`}
                          >
                            <ArrowRight className="w-2.5 h-2.5" />
                            Scene
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Storyboard detail / panel extraction modal — preserved from the
          original view; clicking a page anywhere in the app opens this. */}
      <AnimatePresence>
        {openStoryboard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed left-14 right-[var(--chat-w)] top-12 bottom-0 z-40 flex items-center justify-center bg-slate-950 p-4"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-7xl max-h-[95vh] flex bg-slate-950 border border-amber-500/20 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex-1 min-w-0 bg-black flex items-center justify-center relative overflow-auto">
                <div className="relative inline-block">
                  {openStoryboard.primaryImage?.url && (
                    <img
                      src={openStoryboard.primaryImage.url}
                      alt={openStoryboard.title}
                      className="max-h-[95vh] max-w-full block"
                    />
                  )}
                  {(() => {
                    const rows = openStoryboard.content?.rows || 3;
                    const cols = openStoryboard.content?.cols || 4;
                    return (
                      <div
                        className="absolute inset-0 grid"
                        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
                      >
                        {Array.from({ length: rows * cols }).map((_, i) => (
                          <button
                            key={i}
                            onClick={() => onExtractPanel(openStoryboard, i)}
                            className="border border-amber-500/0 hover:border-amber-400/80 hover:bg-amber-500/10 transition-colors flex items-start justify-end p-1"
                            title={`Extract panel ${i + 1} as a shot`}
                          >
                            <span className="text-[10px] text-amber-200/0 hover:text-amber-200 px-1 py-0.5 rounded bg-black/60 opacity-0 hover:opacity-100">
                              extract {i + 1}
                            </span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="w-80 flex-shrink-0 bg-slate-900 border-l border-white/10 flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-amber-300">Storyboard</span>
                  <button onClick={() => setOpenStoryboardId(null)} className="text-gray-500 hover:text-gray-200">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-3 text-sm">
                  <div>
                    <div className="text-[11px] uppercase text-gray-500 mb-1">Title</div>
                    <div className="text-gray-200">{openStoryboard.title}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase text-gray-500 mb-1">Panels</div>
                    <div className="text-gray-200">
                      {openStoryboard.content?.panelCount || "?"} · {openStoryboard.content?.rows}×{openStoryboard.content?.cols}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase text-gray-500 mb-1">Backend</div>
                    <div className="text-gray-200">{openStoryboard.content?.backend || "?"}</div>
                  </div>
                  {openStoryboard.content?.scriptChunk && (
                    <div>
                      <div className="text-[11px] uppercase text-gray-500 mb-1">Script</div>
                      <div className="text-[11px] text-gray-400 leading-relaxed max-h-48 overflow-y-auto rounded bg-black/30 p-2 border border-white/5">
                        {openStoryboard.content.scriptChunk}
                      </div>
                    </div>
                  )}
                  <div className="pt-3 border-t border-white/5 text-[11px] text-amber-200 leading-relaxed">
                    Click any panel on the left to extract it as a shot in the source scene. The new shot records its source storyboard + panel index so you can re-render it with Nano Banana later, anchored to the storyboard for visual continuity.
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// PRE-PRODUCTION VIEW (Phase 0) — lock in the project visual style before
// character/scene work. Sections: (1) Visual style spec text + preset picker;
// (2) Style references — pinned style assets that auto-attach to every render;
// (3) Test render bench — four standardized diagnostic renders (portrait /
// wide / close-up / action) so the user can see if the style is dialed in.
// =============================================================================

interface PreProductionViewProps {
  visualStylePrompt: string;
  onVisualStylePromptChange: (p: string) => void;
  visualPresets: SingleStylePreset[];
  onApplyPreset: (preset: SingleStylePreset) => void;
  styleAssets: ProjectAsset[];
  unpinnedStyleAssets: ProjectAsset[];
  onTogglePin: (asset: ProjectAsset) => void;
  onUploadStyleRef: () => void;
  testPrompts: Array<{ key: string; label: string; prompt: string; aspectRatio: string }>;
  testResults: Record<string, {
    url: string;
    backend?: string;
    error?: string;
    referencesUsed?: number;
    styleDirectiveApplied?: boolean;
    referencesAttached?: Array<{ description: string; type: string }>;
    actualPromptSent?: string;
  } | null>;
  isRunningTests: boolean;
  onRunTests: () => void;
  /** Project-level aspect ratio default — applied to every image render. */
  aspectRatio: string;
  onAspectRatioChange: (ratio: string) => void;
  /** Project-level image model default — applied to every image render. */
  imageModel: string;
  onImageModelChange: (model: string) => void;
}

function PreProductionView({
  visualStylePrompt, onVisualStylePromptChange,
  visualPresets, onApplyPreset,
  styleAssets, unpinnedStyleAssets,
  onTogglePin, onUploadStyleRef,
  testPrompts, testResults, isRunningTests,
  onRunTests,
  aspectRatio, onAspectRatioChange,
  imageModel, onImageModelChange,
}: PreProductionViewProps) {
  const [localStyle, setLocalStyle] = useState(visualStylePrompt);
  useEffect(() => { setLocalStyle(visualStylePrompt); }, [visualStylePrompt]);

  return (
    <div className="absolute inset-0 overflow-y-auto px-6 pt-8 pb-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Heading */}
        <div className="border-b border-white/10 pb-4">
          <div className="text-[11px] uppercase tracking-wide text-amber-300/80 mb-1">Phase 0 · Pre-Production</div>
          <h1 className="text-2xl text-gray-100 font-light">Visual Style Lock</h1>
          <p className="text-sm text-gray-400 mt-2 max-w-2xl">
            Set the project's locked aesthetic here before doing character or scene work. The style spec and pinned references are auto-applied to every render across the project. The test bench lets you check consistency before producing real assets.
          </p>
        </div>

        {/* SECTION 1 — Style spec */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm uppercase tracking-wide text-gray-300">Visual style spec</h2>
            <select
              value=""
              onChange={(e) => {
                const preset = visualPresets.find((p) => p.id === e.target.value);
                if (preset) onApplyPreset(preset);
              }}
              className="px-3 py-1.5 text-xs rounded bg-white/5 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-500/40"
            >
              <option value="">Apply a preset...</option>
              {visualPresets.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <textarea
            value={localStyle}
            onChange={(e) => setLocalStyle(e.target.value)}
            onBlur={() => { if (localStyle !== visualStylePrompt) onVisualStylePromptChange(localStyle); }}
            rows={6}
            placeholder="Describe the locked visual aesthetic for this project. Example: 'Vibrant young-adult anime in the K-Pop Demon Hunters aesthetic — clean cel-shaded characters, sharp painterly highlights, hot pink / neon teal / electric purple palette, fashion-editorial styling, expressive anime eyes...' Pair this with 3+ style reference images below for the strongest lock."
            className="w-full px-3 py-2 text-sm rounded-lg bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-amber-500/40 resize-none leading-relaxed"
          />
          <div className="text-[11px] text-gray-500">
            Auto-prepended to every image generation prompt across this project. Be specific about rendering technique, palette, level of stylization.
          </div>
        </section>

        {/* SECTION 1.5 — Aspect ratio. Project-level default applied to every
            image render. Pick once; microdrama / cinematic / square feed all
            just work without touching every render call. */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm uppercase tracking-wide text-gray-300">Output format</h2>
            <span className="text-[10px] text-gray-500">
              All renders default to <span className="text-amber-300 font-mono">{aspectRatio}</span>
            </span>
          </div>
          <p className="text-[11px] text-gray-500 max-w-2xl">
            The project's default aspect ratio is applied to every image generation — character portraits, scene heroes, shot renders, storyboard panels. Pick 9:16 for vertical microdramas (TikTok/Reels), 16:9 for traditional cinematic, 21:9 for letterboxed epics, 1:1 for square feeds.
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {ASPECT_RATIO_PRESETS.map((opt) => {
              const isSelected = aspectRatio === opt.value;
              // Visual aspect chip — outer ring is the actual proportion
              const [wStr, hStr] = opt.value.split(":");
              const w = Number(wStr) || 1;
              const h = Number(hStr) || 1;
              const maxDim = 48;
              const previewW = w >= h ? maxDim : Math.round(maxDim * w / h);
              const previewH = h >= w ? maxDim : Math.round(maxDim * h / w);
              return (
                <button
                  key={opt.value}
                  onClick={() => onAspectRatioChange(opt.value)}
                  className={cn(
                    "group rounded-lg border p-2 flex flex-col items-center gap-1.5 transition-colors text-center",
                    isSelected
                      ? "border-amber-500/60 bg-amber-500/10 text-amber-200"
                      : "border-white/10 bg-white/[0.02] text-gray-400 hover:border-amber-500/30 hover:text-gray-200"
                  )}
                  title={opt.useCase}
                >
                  <div className="h-12 flex items-center justify-center">
                    <div
                      className={cn(
                        "border rounded-sm",
                        isSelected ? "border-amber-400 bg-amber-400/20" : "border-gray-500 bg-white/5"
                      )}
                      style={{ width: previewW, height: previewH }}
                    />
                  </div>
                  <div className="text-xs font-mono">{opt.label}</div>
                  <div className="text-[9px] text-gray-500 leading-tight line-clamp-2 group-hover:text-gray-400">
                    {opt.useCase}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* SECTION 1.6 — Image model. Project-level choice between Nano
            Banana 2 (default), Pro (text-heavy), legacy, and GPT Image. */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm uppercase tracking-wide text-gray-300">Image model</h2>
            <span className="text-[10px] text-gray-500">
              All renders use <span className="text-amber-300 font-mono">{IMAGE_MODEL_PRESETS.find((m) => m.value === imageModel)?.label || imageModel}</span>
            </span>
          </div>
          <p className="text-[11px] text-gray-500 max-w-2xl">
            The project's default image generator. Applied to portraits, scenes, shots, and storyboards. Nano Banana 2 is the recommended default (Google's "best all-around"). Switch to Pro for sharper text rendering in posters/articles, or GPT Image for multi-panel storyboards where layout coherence matters most.
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {IMAGE_MODEL_PRESETS.map((opt) => {
              const isSelected = imageModel === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => onImageModelChange(opt.value)}
                  className={cn(
                    "group rounded-lg border p-3 flex flex-col items-start gap-1 transition-colors text-left",
                    isSelected
                      ? "border-amber-500/60 bg-amber-500/10"
                      : "border-white/10 bg-white/[0.02] hover:border-amber-500/30"
                  )}
                  title={opt.useCase}
                >
                  <div className="flex items-center gap-1.5 w-full">
                    <span className={cn(
                      "text-[10px] uppercase px-1 py-0.5 rounded font-mono",
                      opt.backend === "gemini" ? "bg-cyan-500/15 text-cyan-300" : "bg-emerald-500/15 text-emerald-300"
                    )}>
                      {opt.backend}
                    </span>
                    {isSelected && <span className="text-[9px] text-amber-300 ml-auto">selected</span>}
                  </div>
                  <div className={cn("text-sm font-medium", isSelected ? "text-amber-200" : "text-gray-200 group-hover:text-amber-200")}>
                    {opt.label}
                  </div>
                  <div className="text-[10px] text-gray-500 leading-relaxed group-hover:text-gray-400">
                    {opt.useCase}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* SECTION 2 — Style references */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm uppercase tracking-wide text-gray-300">
              Style references
              <span className={cn(
                "ml-2 text-[10px] px-1.5 py-0.5 rounded border",
                styleAssets.length >= 3 ? "border-pink-500/40 bg-pink-500/15 text-pink-300"
                  : styleAssets.length >= 1 ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                  : "border-rose-500/40 bg-rose-500/15 text-rose-300"
              )}>
                {styleAssets.length >= 3 ? `locked ${styleAssets.length}` : styleAssets.length >= 1 ? `${styleAssets.length}/3` : "unlocked"}
              </span>
            </h2>
            <button
              onClick={onUploadStyleRef}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-pink-500/20 text-pink-200 hover:bg-pink-500/30 border border-pink-500/30"
            >
              <Upload className="w-3 h-3" />
              Upload style reference
            </button>
          </div>
          <p className="text-[11px] text-gray-500">
            Pin 3+ reference images that define the look. They get auto-attached as visual references to every render with a directive telling the model to reproduce their rendering technique, palette, and stylization exactly. Without enough refs, the model picks its own aesthetic per-prompt and your project drifts.
          </p>
          {styleAssets.length === 0 && unpinnedStyleAssets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 p-6 text-center text-sm text-gray-500">
              No style references yet. Upload images that capture the look you want — character sheets, screenshots from films you're emulating, mood boards, color palettes.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {styleAssets.map((a) => (
                <button
                  key={a.id}
                  onClick={() => onTogglePin(a)}
                  className="group relative rounded-lg overflow-hidden bg-white/5 border-2 border-pink-500/50 hover:border-pink-400 transition-colors aspect-square"
                  title="Click to unpin from project style"
                >
                  <img src={a.url} alt={a.name} className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-pink-500/40 text-pink-100 text-[10px] flex items-center gap-1">
                    <Pin className="w-2.5 h-2.5" />pinned
                  </div>
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-pink-200">
                    Click to unpin
                  </div>
                </button>
              ))}
              {unpinnedStyleAssets.map((a) => (
                <button
                  key={a.id}
                  onClick={() => onTogglePin(a)}
                  className="group relative rounded-lg overflow-hidden bg-white/5 border-2 border-dashed border-rose-500/40 hover:border-pink-400 transition-colors aspect-square"
                  title="Not pinned — click to pin as project style (only pinned refs affect renders)"
                >
                  <img src={a.url} alt={a.name} className="w-full h-full object-cover opacity-50 group-hover:opacity-90" loading="lazy" />
                  {/* Persistent "not pinned" badge — uploading a style ref does
                      NOT pin it; only pinned refs are attached to renders. */}
                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-100 text-[10px] flex items-center gap-1">
                    <Pin className="w-2.5 h-2.5" />not pinned
                  </div>
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs text-pink-200">
                    Pin as style
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* SECTION 3 — Test render bench */}
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-sm uppercase tracking-wide text-gray-300">Test render bench</h2>
              <p className="text-[11px] text-gray-500">Renders 4 standardized diagnostic prompts using this project's exact settings — style spec, pinned refs, aspect ratio and model — so you see if the style is locked across portrait / wide / close-up / action.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500 whitespace-nowrap">
                Model: <span className="text-gray-300">{IMAGE_MODEL_PRESETS.find((m) => m.value === imageModel)?.label || imageModel}</span>
              </span>
              <button
                onClick={onRunTests}
                disabled={isRunningTests}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 disabled:opacity-50 border border-amber-500/30"
              >
                {isRunningTests ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                {isRunningTests ? "Rendering..." : "Run test bench"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {testPrompts.map((t) => {
              const result = testResults[t.key];
              const isResultPending = isRunningTests && !result;
              return (
                <div key={t.key} className="rounded-lg overflow-hidden bg-white/5 border border-white/10">
                  <div className="aspect-square bg-black flex items-center justify-center">
                    {isResultPending ? (
                      <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                    ) : result?.url ? (
                      <img src={result.url} alt={t.label} className="w-full h-full object-cover" loading="lazy" />
                    ) : result?.error ? (
                      <div className="text-[10px] text-rose-300 px-3 text-center">{result.error.slice(0, 100)}</div>
                    ) : (
                      <div className="text-[11px] text-gray-600">Not yet rendered</div>
                    )}
                  </div>
                  <div className="p-2.5 space-y-1">
                    <div className="text-xs text-gray-200">{t.label}</div>
                    <div className="text-[10px] text-gray-500 truncate" title={t.prompt}>{t.prompt}</div>
                    {result && !result.error && (
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        {result.backend && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/20">
                            {result.backend}
                          </span>
                        )}
                        {typeof result.referencesUsed === "number" && (
                          <span
                            className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded border",
                              result.referencesUsed > 0
                                ? "bg-pink-500/15 text-pink-300 border-pink-500/30"
                                : "bg-rose-500/15 text-rose-300 border-rose-500/30"
                            )}
                            title={result.referencesAttached?.map((r) => `[${r.type}] ${r.description.slice(0, 80)}`).join("\n\n") || ""}
                          >
                            {result.referencesUsed} ref{result.referencesUsed === 1 ? "" : "s"}
                          </span>
                        )}
                        {result.styleDirectiveApplied !== undefined && (
                          <span className={cn(
                            "text-[9px] px-1.5 py-0.5 rounded border",
                            result.styleDirectiveApplied
                              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                              : "bg-rose-500/15 text-rose-300 border-rose-500/30"
                          )}
                          title={result.styleDirectiveApplied
                            ? "Project style directive prepended to the prompt"
                            : "No style directive — project has no visual style prompt set"
                          }
                          >
                            style {result.styleDirectiveApplied ? "locked" : "off"}
                          </span>
                        )}
                      </div>
                    )}
                    {result?.actualPromptSent && (
                      <details className="text-[9px] text-gray-500 mt-1">
                        <summary className="cursor-pointer hover:text-gray-300">View full prompt sent ({result.actualPromptSent.length} chars)</summary>
                        <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-gray-400 leading-relaxed bg-black/30 rounded p-1.5 border border-white/5">
                          {result.actualPromptSent}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

// =============================================================================
// ASSETS VIEW — uploaded asset library + generated-image rollup
// =============================================================================

const ASSET_CATEGORY_OPTIONS: ProjectAsset["category"][] = [
  "character", "scene", "location", "object", "style", "reference", "other",
];

const ASSET_CATEGORY_LABEL: Record<ProjectAsset["category"], string> = {
  character: "Character",
  scene: "Scene",
  location: "Location",
  object: "Object",
  style: "Style",
  reference: "Reference",
  other: "Other",
};

const ASSET_CATEGORY_COLOR: Record<ProjectAsset["category"], string> = {
  character: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  scene: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  location: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  object: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  style: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  reference: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  other: "bg-gray-500/20 text-gray-300 border-gray-500/30",
};

interface AssetsViewProps {
  assets: ProjectAsset[];
  generatedAssets: GeneratedAssetRecord[];
  entities: Entity[];
  pinnedStyleAssetIds: string[];
  tab: "uploaded" | "generated";
  onTabChange: (t: "uploaded" | "generated") => void;
  categoryFilter: "" | ProjectAsset["category"];
  onCategoryFilterChange: (c: "" | ProjectAsset["category"]) => void;
  searchQuery: string;
  onSearchQueryChange: (s: string) => void;
  uploadCategory: ProjectAsset["category"];
  onUploadCategoryChange: (c: ProjectAsset["category"]) => void;
  isUploading: boolean;
  isDraggingFiles: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClickUpload: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFilesPicked: (files: FileList) => void;
  onSelectAsset: (a: ProjectAsset) => void;
  onSelectGeneratedAsset: (a: GeneratedAssetRecord) => void;
}

function AssetsView({
  assets, generatedAssets, entities, pinnedStyleAssetIds,
  tab, onTabChange,
  categoryFilter, onCategoryFilterChange,
  searchQuery, onSearchQueryChange,
  uploadCategory, onUploadCategoryChange,
  isUploading, isDraggingFiles,
  onDragOver, onDragLeave, onDrop,
  onClickUpload, fileInputRef, onFilesPicked,
  onSelectAsset, onSelectGeneratedAsset,
}: AssetsViewProps) {
  const items = tab === "uploaded" ? assets : generatedAssets;

  const filtered = items.filter((a: any) => {
    if (categoryFilter && a.category !== categoryFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const haystack = `${a.name || ""} ${a.description || ""} ${(a.tags || []).join(" ")} ${a.sourceLabel || ""}`.toLowerCase();
    return haystack.includes(q);
  });

  return (
    <div className="absolute inset-0 overflow-y-auto px-6 pt-8 pb-6">
      <div className="max-w-6xl mx-auto">
        {/* Top controls */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center bg-white/5 rounded-lg p-1 border border-white/10">
            <button
              onClick={() => onTabChange("uploaded")}
              className={cn(
                "px-3 py-1.5 text-xs rounded transition-colors",
                tab === "uploaded" ? "bg-amber-500/30 text-amber-200" : "text-gray-400 hover:text-gray-200"
              )}
            >
              Uploaded ({assets.length})
            </button>
            <button
              onClick={() => onTabChange("generated")}
              className={cn(
                "px-3 py-1.5 text-xs rounded transition-colors",
                tab === "generated" ? "bg-amber-500/30 text-amber-200" : "text-gray-400 hover:text-gray-200"
              )}
            >
              Generated ({generatedAssets.length})
            </button>
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Search by name, tag, description..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-amber-500/40"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => onCategoryFilterChange(e.target.value as any)}
            className="px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-500/40"
          >
            <option value="">All categories</option>
            {ASSET_CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>{ASSET_CATEGORY_LABEL[c]}</option>
            ))}
          </select>
        </div>

        {/* Upload zone (only on Uploaded tab) */}
        {tab === "uploaded" && (
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={cn(
              "mb-6 rounded-xl border-2 border-dashed p-6 transition-colors",
              isDraggingFiles
                ? "border-amber-400 bg-amber-500/10"
                : "border-white/15 bg-white/[0.02] hover:border-white/30"
            )}
          >
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <Upload className={cn("w-6 h-6", isDraggingFiles ? "text-amber-300" : "text-gray-400")} />
                <div>
                  <div className="text-sm text-gray-200">
                    {isUploading ? "Uploading..." : "Drop image files here, or click to pick"}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    Character sheets, location refs, style references, etc. Up to 30 files, 50MB each.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-gray-500">Category</label>
                <select
                  value={uploadCategory}
                  onChange={(e) => onUploadCategoryChange(e.target.value as any)}
                  className="px-2 py-1 text-xs rounded bg-white/5 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-500/40"
                >
                  {ASSET_CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{ASSET_CATEGORY_LABEL[c]}</option>
                  ))}
                </select>
                <button
                  onClick={onClickUpload}
                  disabled={isUploading}
                  className="px-3 py-1.5 text-xs rounded-lg bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 disabled:opacity-50 border border-amber-500/30 transition-colors"
                >
                  {isUploading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "Pick files"}
                </button>
                <input
                  ref={fileInputRef as React.RefObject<HTMLInputElement>}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) onFilesPicked(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-sm">
            {searchQuery || categoryFilter
              ? "No assets match your filter."
              : tab === "uploaded"
                ? "No uploads yet. Drop files above to start your asset library."
                : "No generated images yet. Render an entity, scene, or frame to populate this view."}
          </div>
        )}

        {/* Grid */}
        {filtered.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filtered.map((a: any) => {
              const linkedCount = Array.isArray(a.linkedEntityIds) ? a.linkedEntityIds.length : 0;
              const isStylePinned = tab === "uploaded" && pinnedStyleAssetIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => tab === "uploaded" ? onSelectAsset(a) : onSelectGeneratedAsset(a)}
                  className={cn(
                    "group rounded-lg overflow-hidden bg-white/5 border transition-colors text-left",
                    isStylePinned ? "border-pink-500/50 hover:border-pink-400" : "border-white/10 hover:border-amber-500/40"
                  )}
                >
                  <div className="aspect-square bg-black overflow-hidden relative">
                    <img
                      src={a.url}
                      alt={a.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                    {isStylePinned && (
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 text-[10px] rounded bg-pink-500/30 text-pink-200 border border-pink-500/50 flex items-center gap-1">
                        <Pin className="w-2.5 h-2.5" />style
                      </div>
                    )}
                    {tab === "uploaded" && linkedCount > 0 && (
                      <div className="absolute top-2 right-2 px-1.5 py-0.5 text-[10px] rounded bg-black/70 text-amber-200 border border-amber-500/30">
                        <Link2 className="w-2.5 h-2.5 inline mr-1" />{linkedCount}
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <div className="text-xs text-gray-200 truncate">{a.name}</div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded border",
                        ASSET_CATEGORY_COLOR[a.category as ProjectAsset["category"]] || ASSET_CATEGORY_COLOR.other
                      )}>
                        {ASSET_CATEGORY_LABEL[a.category as ProjectAsset["category"]] || a.category}
                      </span>
                      {tab === "generated" && (
                        <span className="text-[10px] text-gray-500 truncate">{a.sourceLabel}</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// SCENE CARD
// =============================================================================

function SceneCard({
  scene,
  entities,
  isActive,
  onClick,
  compactMode = false,
  onToggleFramesInCarousel,
  isFramesExpanded = false,
}: {
  scene: Scene;
  entities: Entity[];
  isActive: boolean;
  onClick: () => void;
  compactMode?: boolean;
  onToggleFramesInCarousel?: () => void;
  isFramesExpanded?: boolean;
}) {
  const participants = entities.filter((e) => scene.participantIds.includes(e.id));

  // Adjust sizes based on compactMode (only slight reduction since we primarily shift up)
  const activeWidth = compactMode ? 610 : 700;
  const activeHeight = compactMode ? 350 : 400;
  const inactiveWidth = compactMode ? 370 : 420;
  const inactiveHeight = compactMode ? 220 : 250;

  return (
    <div className="relative" onClick={isActive ? onClick : undefined}>
      {isActive && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute -inset-6 bg-amber-500/20 rounded-3xl blur-3xl" />
      )}
      <div
        className={cn(
          "relative rounded-2xl overflow-hidden border-2 bg-slate-900 transition-all cursor-pointer",
          isActive ? "border-amber-500/60 shadow-2xl shadow-amber-500/20" : "border-white/10"
        )}
        style={{ width: isActive ? activeWidth : inactiveWidth, height: isActive ? activeHeight : inactiveHeight }}
      >
        {scene.imageUrl ? (
          <img src={scene.imageUrl} alt={scene.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
            <ImageIcon className="w-16 h-16 text-amber-500/20" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

        {/* Scene info */}
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Film className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-amber-400/80 uppercase tracking-wider">Scene</span>
            {scene.status === "draft" ? (
              <span className="px-2 py-0.5 rounded bg-amber-500/80 text-xs text-black">Draft</span>
            ) : (
              <span className="px-2 py-0.5 rounded bg-green-500/80 text-xs text-black flex items-center gap-1">
                <Award className="w-3 h-3" />
                Canon
              </span>
            )}
          </div>
          <h3 className={cn("font-bold text-white", isActive ? "text-2xl" : "text-lg")}>{scene.title}</h3>
          {isActive && <p className="text-sm text-gray-400 mt-2 line-clamp-2">{scene.prose}</p>}
        </div>

        {/* Floating participant avatars */}
        {isActive && participants.length > 0 && (
          <div className="absolute top-4 right-4 flex -space-x-3">
            {participants.slice(0, 4).map((entity) => {
              const config = entityTypeConfig[entity.type] || entityTypeConfig.character;
              return (
                <div
                  key={entity.id}
                  className={cn("w-12 h-12 rounded-full overflow-hidden ring-2 ring-slate-900", config.ringColor)}
                >
                  {entity.referenceImage ? (
                    <img src={entity.referenceImage} alt={entity.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className={cn("w-full h-full flex items-center justify-center", config.bgColor)}>
                      <config.icon className={cn("w-5 h-5", config.color)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isActive && (
          <div className="absolute top-4 left-4">
            <div className="px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> View Details
            </div>
          </div>
        )}

        {/* Frame count badge - click to expand frames into carousel */}
        {isActive && scene.frames && scene.frames.length > 0 && onToggleFramesInCarousel && (
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onToggleFramesInCarousel(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggleFramesInCarousel(); } }}
            className={cn(
              "absolute bottom-2 right-4 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] transition-colors z-10",
              isFramesExpanded
                ? "bg-purple-500/80 text-white"
                : "bg-black/60 text-purple-300 hover:bg-purple-500/60"
            )}
            title={`${scene.frames.length} frames — click to ${isFramesExpanded ? 'collapse' : 'expand into carousel'}`}
          >
            <LayoutGrid className="w-3 h-3" />
            {scene.frames.length} frames
            {isFramesExpanded ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// PRODUCTION TIMELINE — the editing-line for the Production phase. Replaces
// the legacy SceneGrid as the primary canvas. Top: large viewing area with
// the current shot rendered + transport controls. Right: shot picker side
// panel (scenes → shots). Bottom: stacked tracks of clips. Stage 3 of the
// pipeline restructure.
// =============================================================================

// Scene color palette — clips inherit a stable color from their parent scene
// so editors can see scene boundaries at a glance on the timeline. Hash the
// scene id to pick a color; same id always maps to the same color.
const SCENE_COLOR_PALETTE = [
  { stripe: "bg-amber-400", tint: "bg-amber-500/10", text: "text-amber-300" },
  { stripe: "bg-cyan-400", tint: "bg-cyan-500/10", text: "text-cyan-300" },
  { stripe: "bg-purple-400", tint: "bg-purple-500/10", text: "text-purple-300" },
  { stripe: "bg-rose-400", tint: "bg-rose-500/10", text: "text-rose-300" },
  { stripe: "bg-emerald-400", tint: "bg-emerald-500/10", text: "text-emerald-300" },
  { stripe: "bg-indigo-400", tint: "bg-indigo-500/10", text: "text-indigo-300" },
  { stripe: "bg-orange-400", tint: "bg-orange-500/10", text: "text-orange-300" },
  { stripe: "bg-pink-400", tint: "bg-pink-500/10", text: "text-pink-300" },
];
const getSceneColor = (sceneId: string) => {
  let h = 0;
  for (let i = 0; i < sceneId.length; i++) {
    h = (h * 31 + sceneId.charCodeAt(i)) | 0;
  }
  return SCENE_COLOR_PALETTE[Math.abs(h) % SCENE_COLOR_PALETTE.length];
};

interface TimelineViewProps {
  scenes: Scene[];
  entities: Entity[];
  timeline: ProjectTimeline;
  onAutoPopulate: () => Promise<number>;
  onAddTrack: (name?: string, kind?: "video" | "audio" | "caption" | "note") => Promise<ProjectTimelineTrack | null>;
  onUpdateTrack: (id: string, patch: { name?: string; muted?: boolean; order?: number }) => Promise<void>;
  onDeleteTrack: (id: string) => Promise<void>;
  onAddClip: (opts: { trackId: string; sourceSceneId: string; sourceShotId: string; durationSec?: number; order?: number }) => Promise<ProjectTimelineItem | null>;
  onUpdateClip: (id: string, patch: { trackId?: string; durationSec?: number; order?: number; label?: string }) => Promise<void>;
  onReorderClips: (trackId: string, orderedIds: string[]) => Promise<void>;
  onDeleteClip: (id: string) => Promise<void>;
  onSceneClick: (scene: Scene) => void;
  onShotClick: (scene: Scene, shot: SceneFrame) => void;
  /** Render the shot's image again with its current imagePrompt. */
  onRegenerateShot?: (scene: Scene, shot: SceneFrame, customPrompt?: string) => void;
  /** Whether a shot's image is currently being generated (any shot). */
  generatingShotId?: string | null;
  /** Generate a new variant (alternate take) for a shot. */
  onGenerateVariant?: (scene: Scene, shot: SceneFrame, customPrompt?: string) => Promise<any>;
  /** Promote a variant to be the shot's primary image. */
  onPromoteVariant?: (scene: Scene, shot: SceneFrame, variantId: string) => Promise<void>;
  /** Delete a variant from the shot. */
  onDeleteVariant?: (scene: Scene, shot: SceneFrame, variantId: string) => Promise<void>;
  /** Whether a shot is currently generating a variant. */
  generatingVariantShotId?: string | null;
  /** Create a new scene (optionally with title). Used by the "+ Add scene"
   *  composer at the top of the shot picker. */
  onCreateScene?: (opts: { title?: string; actId?: string | null }) => Promise<any>;
  /** Append a blank shot to a scene and trigger AI content generation. */
  onAddShotToScene?: (scene: Scene, opts?: { atIndex?: number; autoGenerate?: boolean }) => Promise<string>;
  /** Which shot's content is currently being AI-generated (the bottom-of-
   *  workbench spinner). */
  generatingShotContentId?: string | null;
  /** Undo / redo timeline mutations (snapshot history). */
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  /** Fires when the user selects/deselects a clip on the timeline so the
   *  parent can surface that clip's shot as a chat focus target. */
  onSelectedShotChange?: (selection: { sceneId: string; shotId: string } | null) => void;
}

function TimelineView({
  scenes, entities, timeline,
  onAutoPopulate, onAddTrack, onUpdateTrack, onDeleteTrack,
  onAddClip, onUpdateClip, onReorderClips, onDeleteClip,
  onSceneClick, onShotClick, onRegenerateShot, generatingShotId,
  onGenerateVariant, onPromoteVariant, onDeleteVariant, generatingVariantShotId,
  onCreateScene, onAddShotToScene, generatingShotContentId,
  onUndo, onRedo, canUndo, canRedo,
  onSelectedShotChange,
}: TimelineViewProps) {
  // ─── Playback state ─────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  // Zoom in px/sec. Wider range than before so the user can scrunch a long
  // sequence into the viewport or stretch out a few seconds for precision.
  const ZOOM_MIN = 4;
  const ZOOM_MAX = 240;
  const [zoom, setZoom] = useState(40);
  const lastTickRef = useRef<number | null>(null);
  // Ref to the scrollable tracks container — used to (1) attach a wheel
  // listener for ctrl+scroll zoom, and (2) measure available width for
  // the "fit" zoom-to-width action.
  const tracksLaneRef = useRef<HTMLDivElement | null>(null);

  // ─── Selected clip (for inspector) ──────────────────────────────────────
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  // When the user selects (or deselects) a clip, surface its source shot
  // to the parent so the chat agent sees it as the "currently focused"
  // shot. Lets the agent run edit_image / change_camera_angle / etc on
  // the clip you're looking at without you opening the Shot workbench.
  useEffect(() => {
    if (!onSelectedShotChange) return;
    if (!selectedClipId) {
      onSelectedShotChange(null);
      return;
    }
    const clip = (timeline.items || []).find((it) => it.id === selectedClipId);
    if (!clip) {
      onSelectedShotChange(null);
      return;
    }
    onSelectedShotChange({ sceneId: clip.sourceSceneId, shotId: clip.sourceShotId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClipId, timeline.items]);

  // ─── Drag state ─────────────────────────────────────────────────────────
  // Two kinds of drag: from the shot picker (sceneId+shotId payload) and
  // from an existing clip (clipId payload). Both encoded as text/plain
  // JSON. We track the source kind so we know what to do on drop.
  const [draggedClipId, setDraggedClipId] = useState<string | null>(null);
  const [dragOverClipId, setDragOverClipId] = useState<string | null>(null);
  const [dragOverTrackId, setDragOverTrackId] = useState<string | null>(null);

  // ─── Lookups ────────────────────────────────────────────────────────────
  const sceneById = useMemo(() => {
    const map = new Map<string, Scene>();
    for (const s of scenes) map.set(s.id, s);
    return map;
  }, [scenes]);

  const shotById = useMemo(() => {
    const map = new Map<string, { scene: Scene; shot: SceneFrame }>();
    for (const s of scenes) {
      for (const f of s.frames || []) {
        map.set(f.id, { scene: s, shot: f });
      }
    }
    return map;
  }, [scenes]);

  // Sorted tracks + items grouped by track
  const sortedTracks = useMemo(
    () => (timeline.tracks || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [timeline.tracks],
  );
  const itemsByTrack = useMemo(() => {
    const map = new Map<string, ProjectTimelineItem[]>();
    for (const item of timeline.items || []) {
      if (!map.has(item.trackId)) map.set(item.trackId, []);
      map.get(item.trackId)!.push(item);
    }
    for (const list of Array.from(map.values())) {
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    return map;
  }, [timeline.items]);

  // Primary video track is the lowest-order video track. Used for playback.
  const primaryTrack = useMemo(
    () => sortedTracks.find((t) => t.kind === "video") || sortedTracks[0],
    [sortedTracks],
  );
  const primaryClips = useMemo(
    () => primaryTrack ? (itemsByTrack.get(primaryTrack.id) || []) : [],
    [primaryTrack, itemsByTrack],
  );

  // Total timeline duration (primary track sums)
  const totalDurationSec = useMemo(
    () => primaryClips.reduce((acc, it) => acc + (it.durationSec || 0), 0),
    [primaryClips],
  );

  // Pre-compute clip start times on the primary track so we can pick the
  // active clip and render the time ruler.
  const clipStartTimes = useMemo(() => {
    const starts: number[] = [];
    let t = 0;
    for (const clip of primaryClips) {
      starts.push(t);
      t += clip.durationSec || 0;
    }
    return starts;
  }, [primaryClips]);

  const activeClipIndex = useMemo(() => {
    if (primaryClips.length === 0) return -1;
    for (let i = 0; i < primaryClips.length; i++) {
      const start = clipStartTimes[i];
      const end = start + (primaryClips[i].durationSec || 0);
      if (currentTimeSec >= start && currentTimeSec < end) return i;
    }
    return primaryClips.length - 1;
  }, [currentTimeSec, primaryClips, clipStartTimes]);

  const activeClip = activeClipIndex >= 0 ? primaryClips[activeClipIndex] : null;
  const activeClipMeta = activeClip ? shotById.get(activeClip.sourceShotId) : null;

  // ─── Playback loop ──────────────────────────────────────────────────────
  // Drive currentTimeSec forward at real-time speed while playing. Stop at
  // the end (don't loop by default). RAF-based for smoothness.
  useEffect(() => {
    if (!isPlaying) {
      lastTickRef.current = null;
      return;
    }
    let raf = 0;
    const tick = (timestampMs: number) => {
      if (lastTickRef.current == null) {
        lastTickRef.current = timestampMs;
        raf = requestAnimationFrame(tick);
        return;
      }
      const dtSec = (timestampMs - lastTickRef.current) / 1000;
      lastTickRef.current = timestampMs;
      setCurrentTimeSec((prev) => {
        const next = prev + dtSec;
        if (next >= totalDurationSec) {
          // Reached the end — pause and snap to end.
          setIsPlaying(false);
          return totalDurationSec;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, totalDurationSec]);

  // Keyboard: space = play/pause, ←/→ = jump to prev/next clip,
  // +/- = zoom in/out, 0 = fit-to-width.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " ") {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (activeClipIndex > 0) {
          setCurrentTimeSec(clipStartTimes[activeClipIndex - 1] || 0);
        } else {
          setCurrentTimeSec(0);
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (activeClipIndex < primaryClips.length - 1) {
          setCurrentTimeSec(clipStartTimes[activeClipIndex + 1] || 0);
        }
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setZoom((z) => Math.min(ZOOM_MAX, Math.round(z * 1.25)));
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setZoom((z) => Math.max(ZOOM_MIN, Math.round(z / 1.25)));
      } else if (e.key === "s" || e.key === "S") {
        // Don't override Cmd/Ctrl+S (browser save)
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        handleSplitClipAtPlayhead();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClipIndex, clipStartTimes, primaryClips.length, selectedClipId, currentTimeSec, primaryTrack?.id]);

  // Ctrl/Meta + wheel inside the tracks lane → zoom (mac-friendly). We use
  // a non-passive listener so we can preventDefault; React's onWheel can't
  // do that for passive events.
  useEffect(() => {
    const el = tracksLaneRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setZoom((z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * factor))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel as EventListener);
  }, []);

  // ─── Zoom helpers ───────────────────────────────────────────────────────
  const handleZoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, Math.round(z * 1.25)));
  const handleZoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, Math.round(z / 1.25)));
  const handleZoomToFit = () => {
    if (totalDurationSec <= 0) return;
    const el = tracksLaneRef.current;
    if (!el) return;
    // Available pixel width = container minus track header (160px) minus
    // padding (about 24px) minus trailing drop zone (~48px). Compute the
    // zoom that fits totalDurationSec into that width.
    const available = Math.max(el.clientWidth - 160 - 72, 200);
    const fitZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(available / totalDurationSec)));
    setZoom(fitZoom);
  };

  // ─── Helpers ────────────────────────────────────────────────────────────
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleSeekToClip = (clipIndex: number) => {
    if (clipIndex < 0 || clipIndex >= primaryClips.length) return;
    setCurrentTimeSec(clipStartTimes[clipIndex] || 0);
  };

  // Split a clip at the current playhead. The selected clip must be on the
  // primary track and the playhead must be inside it. The clip's duration
  // shrinks to the first half; a new clip with the same source shot is
  // inserted right after it, carrying the second half's duration.
  // Both halves live as independent timeline items afterward.
  const handleSplitClipAtPlayhead = async () => {
    if (!selectedClipId || !primaryTrack) return;
    const clip = primaryClips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    const clipIdx = primaryClips.findIndex((c) => c.id === selectedClipId);
    const clipStart = clipStartTimes[clipIdx] || 0;
    const clipDur = clip.durationSec || 0;
    const splitAt = currentTimeSec - clipStart;
    // Guard: split must be strictly inside the clip and leave both halves
    // with non-trivial duration.
    const MIN_HALF = 0.25;
    if (splitAt < MIN_HALF || splitAt > clipDur - MIN_HALF) {
      console.warn("Split point too close to a clip edge; nudge playhead inside the clip first.");
      return;
    }
    const firstHalf = Math.round(splitAt * 4) / 4; // round to 0.25s
    const secondHalf = Math.round((clipDur - firstHalf) * 4) / 4;
    // Shrink the existing clip first, then add the new clip directly after.
    await onUpdateClip(clip.id, { durationSec: firstHalf });
    await onAddClip({
      trackId: clip.trackId,
      sourceSceneId: clip.sourceSceneId,
      sourceShotId: clip.sourceShotId,
      durationSec: secondHalf,
      order: clip.order + 1,
    });
  };

  // ─── Drag-drop handlers ─────────────────────────────────────────────────
  // Encode the drag payload: shots from the picker = { kind: "shot",
  // sceneId, shotId }; existing clips = { kind: "clip", clipId }. We use
  // text/plain for compatibility.
  const startShotDrag = (e: React.DragEvent, sceneId: string, shotId: string) => {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "shot", sceneId, shotId }));
  };
  const startClipDrag = (e: React.DragEvent, clipId: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "clip", clipId }));
    setDraggedClipId(clipId);
  };
  const parseDrag = (e: React.DragEvent): { kind: "shot"; sceneId: string; shotId: string } | { kind: "clip"; clipId: string } | null => {
    try {
      const txt = e.dataTransfer.getData("text/plain");
      const parsed = JSON.parse(txt);
      if (parsed && (parsed.kind === "shot" || parsed.kind === "clip")) return parsed;
    } catch { /* fall through */ }
    return null;
  };

  // Drop on a track at the end (append) or at a position (insert before
  // dragOverClipId if set).
  const handleTrackDrop = async (e: React.DragEvent, trackId: string, insertBeforeClipId?: string) => {
    e.preventDefault();
    const payload = parseDrag(e);
    setDraggedClipId(null);
    setDragOverClipId(null);
    setDragOverTrackId(null);
    if (!payload) return;
    const trackClips = itemsByTrack.get(trackId) || [];

    if (payload.kind === "shot") {
      // New clip from picker
      let order: number | undefined;
      if (insertBeforeClipId) {
        const before = trackClips.find((it) => it.id === insertBeforeClipId);
        if (before) order = before.order;
      }
      await onAddClip({
        trackId,
        sourceSceneId: payload.sceneId,
        sourceShotId: payload.shotId,
        ...(order !== undefined ? { order } : {}),
      });
    } else if (payload.kind === "clip") {
      // Reorder existing clip (and/or move across tracks)
      const clip = (timeline.items || []).find((it) => it.id === payload.clipId);
      if (!clip) return;
      if (clip.trackId !== trackId) {
        await onUpdateClip(clip.id, { trackId });
        // Wait for refetch via parent; can't do reorder here cleanly.
        return;
      }
      // Reorder within same track
      const orderedIds = trackClips.map((it) => it.id).filter((id) => id !== clip.id);
      if (insertBeforeClipId) {
        const idx = orderedIds.indexOf(insertBeforeClipId);
        if (idx >= 0) orderedIds.splice(idx, 0, clip.id);
        else orderedIds.push(clip.id);
      } else {
        orderedIds.push(clip.id);
      }
      await onReorderClips(trackId, orderedIds);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  const hasContent = sortedTracks.length > 0 || scenes.some((s) => (s.frames || []).length > 0);

  return (
    <div className="absolute inset-0 flex flex-col bg-slate-950">
      {/* TOP — Viewer + Picker side-by-side */}
      <div className="flex-1 min-h-0 flex">
        {/* LEFT — Viewer */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Big stage */}
          <div className="flex-1 min-h-0 bg-black flex items-center justify-center relative">
            {activeClipMeta?.shot.imageUrl ? (
              <img
                src={activeClipMeta.shot.imageUrl}
                alt={activeClipMeta.shot.title || "Shot"}
                className="max-w-full max-h-full object-contain"
              />
            ) : activeClipMeta ? (
              <div className="flex flex-col items-center gap-3 text-gray-600">
                <Film className="w-20 h-20" />
                <span className="text-sm">No image rendered for this shot yet</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-gray-600 max-w-md text-center px-4">
                <Film className="w-20 h-20 opacity-40" />
                <p className="text-sm">
                  {hasContent
                    ? "Drag a shot from the right panel onto a track below, or click \"Auto-populate\" to fill the timeline from your scenes."
                    : "No scenes or shots yet — head to Storyboard to build the story first, then come back here to sequence it."}
                </p>
              </div>
            )}

            {/* Bottom-left badges — what's playing */}
            {activeClipMeta && (
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded bg-black/60 text-amber-300 uppercase tracking-wider">
                  {sceneById.get(activeClipMeta.scene.id) ? `Scene · ${activeClipMeta.scene.title}` : "Shot"}
                </span>
                {activeClipMeta.shot.title && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-black/60 text-gray-300">
                    {activeClipMeta.shot.title}
                  </span>
                )}
              </div>
            )}

            {/* Top-right: edit-in-workbench */}
            {activeClipMeta && (
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <button
                  onClick={() => onShotClick(activeClipMeta.scene, activeClipMeta.shot)}
                  className="px-2 py-1 rounded bg-black/60 text-white text-xs hover:bg-black/80 flex items-center gap-1"
                  title="Open this shot in the Shot workbench"
                >
                  <PenLine className="w-3 h-3" />
                  Edit shot
                </button>
              </div>
            )}
          </div>

          {/* Transport bar */}
          <div className="flex-shrink-0 px-4 py-3 border-t border-white/10 bg-slate-900/60 flex items-center gap-3">
            <button
              onClick={() => {
                if (currentTimeSec >= totalDurationSec) setCurrentTimeSec(0);
                setIsPlaying((p) => !p);
              }}
              disabled={primaryClips.length === 0}
              className={cn(
                "p-2 rounded-full transition-colors",
                primaryClips.length === 0
                  ? "bg-white/5 text-gray-600 cursor-not-allowed"
                  : isPlaying
                    ? "bg-amber-500/30 text-amber-200 hover:bg-amber-500/40"
                    : "bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
              )}
              title={isPlaying ? "Pause (space)" : "Play (space)"}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={() => handleSeekToClip(Math.max(0, activeClipIndex - 1))}
              disabled={primaryClips.length === 0}
              className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Previous shot (←)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleSeekToClip(Math.min(primaryClips.length - 1, activeClipIndex + 1))}
              disabled={primaryClips.length === 0 || activeClipIndex >= primaryClips.length - 1}
              className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Next shot (→)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Scrubber */}
            <div className="flex-1 flex items-center gap-2 px-2">
              <span className="text-[11px] text-gray-400 font-mono w-10 text-right">{formatTime(currentTimeSec)}</span>
              <input
                type="range"
                min={0}
                max={Math.max(totalDurationSec, 0.001)}
                step={0.1}
                value={Math.min(currentTimeSec, totalDurationSec)}
                onChange={(e) => setCurrentTimeSec(Number(e.target.value))}
                disabled={totalDurationSec === 0}
                className="flex-1 accent-amber-400"
              />
              <span className="text-[11px] text-gray-500 font-mono w-10">{formatTime(totalDurationSec)}</span>
            </div>

            <div className="text-[11px] text-gray-500">
              {activeClipIndex >= 0 ? `Shot ${activeClipIndex + 1} of ${primaryClips.length}` : "—"}
            </div>

            {/* Zoom controls — ± buttons + slider + fit. Also ctrl/⌘+scroll
                inside the tracks lane, and +/- keyboard shortcuts. */}
            <div className="flex items-center gap-1">
              <button
                onClick={handleZoomOut}
                disabled={zoom <= ZOOM_MIN}
                className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Zoom out (-)"
              >
                <span className="text-base leading-none">−</span>
              </button>
              <input
                type="range"
                min={ZOOM_MIN}
                max={ZOOM_MAX}
                step={1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-24 accent-amber-400"
                title={`Zoom: ${zoom}px/s (ctrl/⌘+scroll on tracks, +/− keys)`}
              />
              <button
                onClick={handleZoomIn}
                disabled={zoom >= ZOOM_MAX}
                className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Zoom in (+)"
              >
                <span className="text-base leading-none">+</span>
              </button>
              <button
                onClick={handleZoomToFit}
                disabled={totalDurationSec === 0}
                className="px-1.5 py-0.5 text-[10px] rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed border border-white/10"
                title="Fit timeline to width"
              >
                Fit
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT — Shot picker. Now also a creation surface: + Add scene
            composer at the top, + Shot button on each scene group. Changes
            propagate to all views because everything reads the shared
            `scenes` state. */}
        <div className="w-80 flex-shrink-0 border-l border-white/10 bg-slate-950 flex flex-col">
          <div className="flex-shrink-0 px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div>
              <h3 className="text-xs uppercase tracking-wide text-amber-300">Shot library</h3>
              <p className="text-[10px] text-gray-500 mt-0.5">Drag a shot onto a track below</p>
            </div>
            <button
              onClick={async () => {
                const added = await onAutoPopulate();
                if (added === 0) {
                  console.log("Timeline auto-populate added no new shots (already populated or no shots exist).");
                }
              }}
              className="px-2 py-1 text-[10px] rounded bg-cyan-500/15 text-cyan-200 border border-cyan-500/30 hover:bg-cyan-500/25 flex items-center gap-1"
              title="Append every shot from every scene to the main track, in story order"
            >
              <Wand2 className="w-2.5 h-2.5" />
              Auto-populate
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* + Add scene composer — collapsed button, expands inline. */}
            {onCreateScene && (
              <NewSceneComposer onCreate={async (title) => {
                await onCreateScene({ title: title || undefined });
              }} />
            )}

            {scenes.length === 0 ? (
              <div className="text-center py-6 text-xs text-gray-500">
                No scenes yet. Add one above or build the story in Storyboard.
              </div>
            ) : (
              scenes.map((scene, sIdx) => {
                const shots = scene.frames || [];
                const isGeneratingShotHere = generatingShotContentId && (scene.frames || []).some((f) => f.id === generatingShotContentId);
                const sceneHeader = (
                  <div className="px-2 py-1.5 flex items-center gap-1.5 bg-white/[0.02]">
                    <button
                      onClick={() => onSceneClick(scene)}
                      className="flex-1 min-w-0 text-left text-xs text-gray-300 hover:text-amber-200 transition-colors truncate flex items-center gap-1.5"
                      title="Open this scene's workbench"
                    >
                      <Film className="w-3 h-3 text-amber-400/60 flex-shrink-0" />
                      <span className="truncate">{sIdx + 1}. {scene.title || "Untitled"}</span>
                    </button>
                    <span className="text-[10px] text-gray-500">{shots.length}</span>
                    {onAddShotToScene && (
                      <button
                        onClick={() => onAddShotToScene(scene)}
                        disabled={Boolean(generatingShotContentId)}
                        className={cn(
                          "px-1 py-0.5 rounded text-[10px] flex items-center gap-0.5 border transition-colors",
                          generatingShotContentId
                            ? "bg-white/5 text-gray-600 border-white/5 cursor-not-allowed"
                            : "bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25"
                        )}
                        title="Add a blank shot to this scene and auto-generate its content. The new shot appears here when ready; drag onto a track."
                      >
                        <Plus className="w-2.5 h-2.5" />
                        Shot
                      </button>
                    )}
                  </div>
                );
                if (shots.length === 0 && !isGeneratingShotHere) {
                  return (
                    <div key={scene.id} className="rounded-lg bg-white/[0.02] border border-white/5 overflow-hidden">
                      {sceneHeader}
                      <p className="text-[10px] text-gray-600 px-2 py-1.5 leading-relaxed">
                        No shots yet — click <span className="text-amber-300">+ Shot</span> above, or open the scene to add some.
                      </p>
                    </div>
                  );
                }
                return (
                  <div key={scene.id} className="rounded-lg bg-white/[0.02] border border-white/5 overflow-hidden">
                    {sceneHeader}
                    <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-black/20">
                      {shots.map((shot, fIdx) => {
                        const isGenContent = generatingShotContentId === shot.id;
                        return (
                          <div
                            key={shot.id}
                            draggable={!isGenContent}
                            onDragStart={(e) => { if (!isGenContent) startShotDrag(e, scene.id, shot.id); }}
                            onClick={() => onShotClick(scene, shot)}
                            className={cn(
                              "relative aspect-[16/9] rounded overflow-hidden bg-black border border-white/10 transition-colors group",
                              isGenContent ? "cursor-wait" : "cursor-grab active:cursor-grabbing hover:border-amber-400/60"
                            )}
                            title={isGenContent ? "Generating content..." : `${shot.title || `Shot ${fIdx + 1}`} — drag onto a track, or click to open`}
                          >
                            {shot.imageUrl ? (
                              <img src={shot.imageUrl} alt={shot.title || `Shot ${fIdx + 1}`} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                {isGenContent ? <Loader className="w-3.5 h-3.5 text-amber-300 animate-spin" /> : <Film className="w-4 h-4 text-gray-600" />}
                              </div>
                            )}
                            <span className="absolute bottom-0 left-0 text-[9px] px-1 bg-black/70 text-amber-200">S{fIdx + 1}</span>
                            <span className="absolute top-0 right-0 text-[9px] px-1 bg-black/70 text-gray-300">
                              {(shot.durationSec || 5)}s
                            </span>
                          </div>
                        );
                      })}
                      {/* Placeholder tile if a shot is being created/generated
                          on this scene. Renders even if the shot's frame isn't
                          in scenes state yet (rare race condition). */}
                      {isGeneratingShotHere && (
                        <div className="aspect-[16/9] rounded bg-amber-500/5 border border-dashed border-amber-500/30 flex items-center justify-center">
                          <Loader className="w-3 h-3 text-amber-300 animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM — Tracks + (when a clip is selected) Clip Inspector */}
      <div
        className="flex-shrink-0 border-t border-white/10 bg-slate-900/60 flex"
        style={{
          height: selectedClipId ? "50%" : "38%",
          minHeight: selectedClipId ? 340 : 220,
          transition: "height 0.15s ease-out, min-height 0.15s ease-out",
        }}
      >
        {/* LEFT — tracks column (header + track rows). Always takes the
            remaining flex width. */}
        <div className="flex-1 min-w-0 flex flex-col">
        {/* Header — track count + add track + total duration */}
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-amber-300" />
            <span className="text-xs uppercase tracking-wide text-amber-300">Tracks</span>
            <span className="text-[10px] text-gray-500">
              {sortedTracks.length} track{sortedTracks.length === 1 ? "" : "s"} · {primaryClips.length} clip{primaryClips.length === 1 ? "" : "s"} · {formatTime(totalDurationSec)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {(onUndo || onRedo) && (
              <div className="flex items-center gap-0.5 mr-1 border-r border-white/10 pr-1.5">
                {onUndo && (
                  <button
                    onClick={onUndo}
                    disabled={!canUndo}
                    className={cn(
                      "px-1.5 py-1 text-[10px] rounded flex items-center gap-1 transition-colors",
                      canUndo
                        ? "text-gray-300 hover:bg-white/10"
                        : "text-gray-600 cursor-not-allowed"
                    )}
                    title="Undo last timeline change (⌘Z / Ctrl+Z)"
                  >
                    <RefreshCw className="w-2.5 h-2.5 -scale-x-100" />
                    Undo
                  </button>
                )}
                {onRedo && (
                  <button
                    onClick={onRedo}
                    disabled={!canRedo}
                    className={cn(
                      "px-1.5 py-1 text-[10px] rounded flex items-center gap-1 transition-colors",
                      canRedo
                        ? "text-gray-300 hover:bg-white/10"
                        : "text-gray-600 cursor-not-allowed"
                    )}
                    title="Redo (⌘⇧Z / Ctrl+Y)"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    Redo
                  </button>
                )}
              </div>
            )}
            <button
              onClick={() => onAddTrack(undefined, "video")}
              className="px-2 py-1 text-[10px] rounded bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 flex items-center gap-1"
            >
              <Plus className="w-2.5 h-2.5" />
              Video track
            </button>
            <button
              onClick={() => onAddTrack(undefined, "audio")}
              className="px-2 py-1 text-[10px] rounded bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 flex items-center gap-1"
            >
              <Plus className="w-2.5 h-2.5" />
              Audio track
            </button>
          </div>
        </div>

        {/* Track rows + playhead overlay */}
        <div ref={tracksLaneRef} className="flex-1 min-h-0 overflow-auto relative">
          {sortedTracks.length === 0 ? (
            <div className="h-full flex items-center justify-center p-6">
              <div className="text-center max-w-md">
                <Layers className="w-8 h-8 text-amber-500/30 mx-auto mb-2" />
                <p className="text-sm text-gray-400 mb-1">No tracks yet</p>
                <p className="text-xs text-gray-500 mb-4">Add a video track and drag shots onto it, or auto-populate from your scenes.</p>
                <button
                  onClick={async () => {
                    await onAddTrack("Main", "video");
                  }}
                  className="px-3 py-1.5 text-xs rounded bg-amber-500/20 text-amber-200 border border-amber-500/30 hover:bg-amber-500/30"
                >
                  Create Main track
                </button>
              </div>
            </div>
          ) : (
            <div className="relative">
              {/* TIME RULER — sticky to top of the scroll container, lines up
                  with the clip lane (offset by the 160px track header width).
                  Tick interval adapts to zoom so labels stay readable. Click
                  anywhere on the ruler to seek the playhead there. */}
              {(() => {
                // Pick a tick interval that keeps labels ~50–120px apart at
                // current zoom. Standard musical/film intervals.
                const candidates = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
                let interval = 5;
                for (const c of candidates) {
                  if (c * zoom >= 60) { interval = c; break; }
                }
                const rulerEndSec = Math.max(totalDurationSec, 10); // show at least 10s of ruler when timeline is empty/short
                const tickCount = Math.floor(rulerEndSec / interval) + 1;
                const fmtTick = (s: number) => {
                  if (s < 60) return `${s}s`;
                  const m = Math.floor(s / 60);
                  const r = Math.round(s - m * 60);
                  return r === 0 ? `${m}m` : `${m}:${r.toString().padStart(2, "0")}`;
                };
                return (
                  <div className="sticky top-0 z-30 flex items-end h-6 border-b border-white/10 bg-slate-900/95 backdrop-blur">
                    <div className="w-40 flex-shrink-0 border-r border-white/10 px-3 flex items-end pb-1 text-[9px] uppercase tracking-wider text-gray-600">
                      Ruler
                    </div>
                    <div
                      className="flex-1 min-w-0 relative cursor-ew-resize select-none"
                      style={{ minWidth: Math.max(rulerEndSec * zoom + 80, 200), height: "100%" }}
                      onMouseDown={(e) => {
                        // Click+drag scrub. Mousedown seeks immediately; the
                        // global mousemove updates the playhead until mouseup.
                        // Playback pauses for the duration of the drag.
                        const rect = e.currentTarget.getBoundingClientRect();
                        const wasPlaying = isPlaying;
                        if (wasPlaying) setIsPlaying(false);
                        const seekTo = (clientX: number) => {
                          const x = clientX - rect.left;
                          const t = Math.max(0, Math.min(totalDurationSec, x / zoom));
                          setCurrentTimeSec(t);
                        };
                        seekTo(e.clientX);
                        const onMove = (mv: MouseEvent) => seekTo(mv.clientX);
                        const onUp = () => {
                          window.removeEventListener("mousemove", onMove);
                          window.removeEventListener("mouseup", onUp);
                        };
                        window.addEventListener("mousemove", onMove);
                        window.addEventListener("mouseup", onUp);
                      }}
                      title="Click to seek, drag to scrub"
                    >
                      {Array.from({ length: tickCount }).map((_, i) => {
                        const sec = i * interval;
                        const x = sec * zoom;
                        const major = i % 2 === 0;
                        return (
                          <div key={i} className="absolute top-0 bottom-0" style={{ left: x }}>
                            <div className={cn("absolute bottom-0 w-px", major ? "h-3 bg-white/30" : "h-2 bg-white/15")} />
                            {major && (
                              <span className="absolute bottom-3 -translate-x-1/2 text-[9px] text-gray-400 font-mono whitespace-nowrap pointer-events-none">
                                {fmtTick(sec)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {/* End marker */}
                      {totalDurationSec > 0 && (
                        <div className="absolute top-0 bottom-0" style={{ left: totalDurationSec * zoom }}>
                          <div className="absolute bottom-0 w-px h-3 bg-amber-400/60" />
                          <span className="absolute bottom-3 -translate-x-1/2 text-[9px] text-amber-300/80 font-mono whitespace-nowrap pointer-events-none">
                            end
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Playhead line — only visible when there's primary content.
                  The head (top circle) is draggable to scrub. The line
                  itself stays pointer-events-none so clicks fall through
                  to clips beneath. */}
              {primaryTrack && totalDurationSec > 0 && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-amber-400 z-20 pointer-events-none"
                  style={{ left: 160 + Math.min(currentTimeSec, totalDurationSec) * zoom }}
                >
                  <div
                    className="absolute -top-1 -left-2 w-4 h-4 rounded-full bg-amber-400 pointer-events-auto cursor-ew-resize ring-2 ring-amber-300/30 hover:ring-amber-300/60"
                    title="Drag to scrub"
                    onMouseDown={(e) => {
                      // Find the tracks lane to know its origin
                      const lane = tracksLaneRef.current;
                      if (!lane) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const wasPlaying = isPlaying;
                      if (wasPlaying) setIsPlaying(false);
                      const seek = (clientX: number) => {
                        const rect = lane.getBoundingClientRect();
                        // Account for the 160px track header and horizontal scroll
                        const x = clientX - rect.left + lane.scrollLeft - 160;
                        const t = Math.max(0, Math.min(totalDurationSec, x / zoom));
                        setCurrentTimeSec(t);
                      };
                      seek(e.clientX);
                      const onMove = (mv: MouseEvent) => seek(mv.clientX);
                      const onUp = () => {
                        window.removeEventListener("mousemove", onMove);
                        window.removeEventListener("mouseup", onUp);
                      };
                      window.addEventListener("mousemove", onMove);
                      window.addEventListener("mouseup", onUp);
                    }}
                  />
                </div>
              )}

              {sortedTracks.map((track) => {
                const clips = itemsByTrack.get(track.id) || [];
                const trackTotalSec = clips.reduce((acc, c) => acc + (c.durationSec || 0), 0);
                let runningOffset = 0;
                return (
                  <div
                    key={track.id}
                    className={cn(
                      "flex items-stretch border-b border-white/5 min-h-[64px]",
                      dragOverTrackId === track.id && "bg-amber-500/5"
                    )}
                  >
                    {/* Track header (left column) */}
                    <div className="w-40 flex-shrink-0 border-r border-white/10 bg-slate-900/80 px-3 py-2 flex flex-col justify-center gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          track.kind === "video" ? "bg-amber-400" : track.kind === "audio" ? "bg-cyan-400" : "bg-purple-400"
                        )} />
                        <input
                          type="text"
                          defaultValue={track.name}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== track.name) onUpdateTrack(track.id, { name: v });
                          }}
                          className="bg-transparent text-xs text-gray-200 flex-1 min-w-0 outline-none focus:bg-black/30 focus:rounded px-1"
                        />
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-gray-500">
                        <span className="uppercase tracking-wide">{track.kind}</span>
                        <span>·</span>
                        <span>{clips.length}</span>
                        <button
                          onClick={() => onUpdateTrack(track.id, { muted: !track.muted })}
                          className={cn(
                            "ml-auto px-1 py-0.5 rounded transition-colors",
                            track.muted ? "bg-rose-500/20 text-rose-300" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                          )}
                          title={track.muted ? "Unmute" : "Mute"}
                        >
                          {track.muted ? "M" : "•"}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete track "${track.name}" and all its clips?`)) {
                              onDeleteTrack(track.id);
                            }
                          }}
                          className="px-1 py-0.5 rounded text-gray-500 hover:text-rose-300 hover:bg-rose-500/10"
                          title="Delete track"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>

                    {/* Clips lane — scrolls horizontally if wider than viewport */}
                    <div
                      className="flex-1 min-h-[64px] relative"
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverTrackId(track.id);
                      }}
                      onDragLeave={() => {
                        if (dragOverTrackId === track.id) setDragOverTrackId(null);
                      }}
                      onDrop={(e) => handleTrackDrop(e, track.id)}
                    >
                      {/* Clips are absolutely positioned at their exact time
                          offsets so they align pixel-for-pixel with the ruler
                          and playhead. No flex gaps, no padding — drift-free. */}
                      <div
                        className="absolute inset-y-1 left-0 right-0"
                        style={{ minWidth: Math.max(trackTotalSec * zoom + 80, 200) }}
                      >
                        {clips.map((clip, cIdx) => {
                          const meta = shotById.get(clip.sourceShotId);
                          const dur = clip.durationSec || 5;
                          const isActive = track.id === primaryTrack?.id && cIdx === activeClipIndex;
                          const clipStart = runningOffset;
                          runningOffset += clip.durationSec || 0;
                          const w = Math.max(dur * zoom, 30);
                          // Dangling clip — source shot was deleted (e.g.,
                          // user removed a shot from the Scene workbench).
                          // Render a placeholder tile with a one-click
                          // remove so the writer can clean up.
                          if (!meta) {
                            return (
                              <div
                                key={clip.id}
                                className="group/clip absolute top-0 bottom-0 rounded overflow-hidden border-2 border-dashed border-rose-500/40 bg-rose-500/5 flex items-center justify-center"
                                style={{ left: clipStart * zoom, width: w, minWidth: 30 }}
                                title="Source shot was deleted — click X to remove this clip"
                              >
                                <AlertTriangle className="w-4 h-4 text-rose-400" />
                                <button
                                  onClick={(e) => { e.stopPropagation(); onDeleteClip(clip.id); }}
                                  className="absolute top-0.5 right-0.5 px-1 py-0.5 rounded bg-black/70 text-rose-300 opacity-0 group-hover/clip:opacity-100 transition-opacity"
                                  title="Remove dangling clip"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            );
                          }
                          return (
                            <div
                              key={clip.id}
                              draggable
                              onDragStart={(e) => startClipDrag(e, clip.id)}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDragOverClipId(clip.id);
                                setDragOverTrackId(track.id);
                              }}
                              onDragLeave={() => {
                                if (dragOverClipId === clip.id) setDragOverClipId(null);
                              }}
                              onDrop={(e) => {
                                e.stopPropagation();
                                handleTrackDrop(e, track.id, clip.id);
                              }}
                              onDragEnd={() => {
                                setDraggedClipId(null);
                                setDragOverClipId(null);
                                setDragOverTrackId(null);
                              }}
                              onClick={() => {
                                setSelectedClipId(clip.id);
                                if (track.id === primaryTrack?.id) setCurrentTimeSec(clipStart);
                              }}
                              className={cn(
                                "group/clip absolute top-0 bottom-0 rounded overflow-hidden border-2 cursor-pointer transition-all",
                                isActive ? "border-amber-400 shadow-lg shadow-amber-500/30 z-10" : "border-white/10 hover:border-amber-400/40",
                                selectedClipId === clip.id && !isActive && "border-cyan-400/80 shadow-md shadow-cyan-500/20 z-10",
                                draggedClipId === clip.id && "opacity-40",
                                dragOverClipId === clip.id && "ring-2 ring-cyan-400/60"
                              )}
                              style={{ left: clipStart * zoom, width: w, minWidth: 30 }}
                              title={`${meta?.shot.title || meta?.shot.description || "Shot"} (${dur}s)`}
                            >
                              {meta?.shot.imageUrl ? (
                                <img src={meta.shot.imageUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                                  <Film className="w-4 h-4 text-gray-600" />
                                </div>
                              )}
                              {/* Scene color stripe along the top — visual
                                  grouping of clips from the same scene. Hashed
                                  from sceneId so it stays stable. */}
                              {meta && (
                                <div className={cn("absolute inset-x-0 top-0 h-1", getSceneColor(meta.scene.id).stripe)} />
                              )}
                              <div className="absolute inset-x-0 bottom-0 px-1 py-0.5 bg-black/70">
                                <p className="text-[9px] text-white truncate">
                                  {meta?.shot.title || meta?.shot.description?.slice(0, 16) || "Shot"}
                                </p>
                              </div>
                              <span className="absolute top-1.5 left-0.5 text-[9px] px-1 rounded bg-black/70 text-amber-200">
                                {dur}s
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); onDeleteClip(clip.id); }}
                                className="absolute top-1.5 right-0.5 px-1 py-0.5 rounded bg-black/70 text-rose-300 opacity-0 group-hover/clip:opacity-100 transition-opacity"
                                title="Remove from timeline"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                              {/* Duration editor on hover (right edge) */}
                              <div
                                className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-amber-500/0 hover:bg-amber-500/40 opacity-0 group-hover/clip:opacity-100"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  const startX = e.clientX;
                                  const startDuration = clip.durationSec || 5;
                                  const onMove = (mv: MouseEvent) => {
                                    const dx = mv.clientX - startX;
                                    const next = Math.max(0.5, startDuration + dx / zoom);
                                    // Live preview is local; commit happens on mouseup
                                    (e.currentTarget?.parentElement as HTMLElement | null)?.style.setProperty("width", `${Math.max(next * zoom, 30)}px`);
                                  };
                                  const onUp = (mv: MouseEvent) => {
                                    window.removeEventListener("mousemove", onMove);
                                    window.removeEventListener("mouseup", onUp);
                                    const dx = mv.clientX - startX;
                                    const next = Math.max(0.5, Math.round((startDuration + dx / zoom) * 2) / 2);
                                    if (Math.abs(next - startDuration) > 0.01) onUpdateClip(clip.id, { durationSec: next });
                                  };
                                  window.addEventListener("mousemove", onMove);
                                  window.addEventListener("mouseup", onUp);
                                }}
                                title="Drag to resize clip duration"
                              />
                            </div>
                          );
                        })}
                        {/* Trailing drop zone — append slot. Positioned at
                            the end of the last clip on this track. */}
                        <div
                          className="absolute top-0 bottom-0 flex items-center justify-center text-gray-700 hover:text-amber-300 transition-colors"
                          style={{ left: trackTotalSec * zoom + 4, width: 48 }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragOverClipId(null);
                            setDragOverTrackId(track.id);
                          }}
                          onDrop={(e) => { e.stopPropagation(); handleTrackDrop(e, track.id); }}
                        >
                          <Plus className="w-3 h-3" />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>{/* /LEFT tracks column */}

        {/* RIGHT — Clip Inspector. Shows the selected clip's source-shot
            metadata, duration controls, regenerate action, and (later)
            shot variants. Only renders when a clip is selected — the
            tracks column reclaims the width when nothing is selected. */}
        {selectedClipId && (() => {
          const selectedClip = (timeline.items || []).find((it) => it.id === selectedClipId);
          if (!selectedClip) return null;
          const meta = shotById.get(selectedClip.sourceShotId);
          if (!meta) return null;
          const sceneIdx = scenes.findIndex((s) => s.id === meta.scene.id);
          const shotIdx = (meta.scene.frames || []).findIndex((f) => f.id === meta.shot.id);
          const isRegenerating = generatingShotId === meta.shot.id;
          return (
            <div className="w-[360px] flex-shrink-0 border-l border-white/10 bg-slate-950 flex flex-col">
              {/* Inspector header — colored band echoes the clip's scene
                  stripe so the user can confirm which scene this clip
                  belongs to at a glance. */}
              <div className={cn("h-1", getSceneColor(meta.scene.id).stripe)} />
              <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-white/10 flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Film className={cn("w-3.5 h-3.5 flex-shrink-0", getSceneColor(meta.scene.id).text)} />
                  <span className={cn("text-xs uppercase tracking-wide", getSceneColor(meta.scene.id).text)}>Clip</span>
                  <span className="text-[10px] text-gray-500 truncate">
                    Scene {sceneIdx + 1} · S{shotIdx + 1}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedClipId(null)}
                  className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10"
                  title="Close inspector"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Inspector body — preview + controls + actions */}
              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
                {/* Preview */}
                <div className="aspect-video rounded-lg overflow-hidden bg-black border border-white/10 relative">
                  {meta.shot.imageUrl ? (
                    <img src={meta.shot.imageUrl} alt={meta.shot.title || "Shot"} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Film className="w-8 h-8 text-gray-700" />
                    </div>
                  )}
                  {isRegenerating && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                      <div className="flex items-center gap-2 text-amber-200 text-xs">
                        <Loader className="w-3.5 h-3.5 animate-spin" />
                        Re-rendering...
                      </div>
                    </div>
                  )}
                </div>

                {/* Title + scene context */}
                <div>
                  <div className="text-[10px] uppercase text-gray-500 tracking-wider">
                    {meta.scene.title || `Scene ${sceneIdx + 1}`}
                  </div>
                  <h3 className="text-sm font-medium text-gray-100 leading-tight mt-0.5">
                    {meta.shot.title || `Shot ${shotIdx + 1}`}
                  </h3>
                </div>

                {/* Description */}
                {meta.shot.description && (
                  <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-3">
                    {meta.shot.description}
                  </p>
                )}

                {/* Dialogue / caption */}
                {meta.shot.dialogue && meta.shot.dialogue.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase text-gray-500 tracking-wider mb-1">Dialogue</div>
                    <div className="space-y-1">
                      {meta.shot.dialogue.map((line, i) => (
                        <div key={i} className="text-[11px] text-gray-300 bg-white/5 rounded px-2 py-1 leading-relaxed">
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cinematography pills */}
                {(meta.shot.shotType || meta.shot.camera || meta.shot.mood) && (
                  <div className="flex flex-wrap gap-1">
                    {meta.shot.shotType && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300">{meta.shot.shotType}</span>
                    )}
                    {meta.shot.camera && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300">{meta.shot.camera}</span>
                    )}
                    {meta.shot.mood && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300">{meta.shot.mood}</span>
                    )}
                  </div>
                )}

                {/* Duration control — slider + numeric. Updates the clip,
                    not the underlying shot, so the same shot can play for
                    different durations in different clips. */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] uppercase text-gray-500 tracking-wider">Clip duration</label>
                    <span className="text-[11px] text-amber-300 font-mono">{selectedClip.durationSec.toFixed(1)}s</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0.5}
                      max={30}
                      step={0.5}
                      value={selectedClip.durationSec}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        // Optimistic — update the visible item then commit
                        onUpdateClip(selectedClip.id, { durationSec: v });
                      }}
                      className="flex-1 accent-amber-400"
                    />
                    <input
                      type="number"
                      min={0.5}
                      max={60}
                      step={0.5}
                      value={selectedClip.durationSec}
                      onChange={(e) => {
                        const v = Math.max(0.5, Number(e.target.value) || 0.5);
                        onUpdateClip(selectedClip.id, { durationSec: v });
                      }}
                      className="w-14 px-1.5 py-0.5 text-xs rounded bg-black/30 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-500/40"
                    />
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                    Per-clip duration — doesn't change the underlying shot. AI-video models target 5–15s.
                  </p>
                </div>

                {/* Keyframes — first/last frames for image-to-video. The shot's
                    motion endpoints (generate_shot_keyframes). Read-only here. */}
                {(meta.shot.firstFrame?.url || meta.shot.lastFrame?.url) && (
                  <div className="pt-2 border-t border-white/5">
                    <label className="text-[10px] uppercase text-gray-500 tracking-wider block mb-1.5">
                      Keyframes (first → last)
                    </label>
                    <div className="flex items-center gap-1.5">
                      {meta.shot.firstFrame?.url ? (
                        <div className="relative flex-1 aspect-video rounded overflow-hidden bg-black border border-cyan-500/30">
                          <img src={meta.shot.firstFrame.url} alt="first frame" className="w-full h-full object-cover" />
                          <span className="absolute bottom-0 inset-x-0 px-1 bg-black/80 text-[8px] text-cyan-200 text-center">first</span>
                        </div>
                      ) : (
                        <div className="flex-1 aspect-video rounded bg-white/5 border border-dashed border-white/10 flex items-center justify-center text-[9px] text-gray-600">first —</div>
                      )}
                      <span className="text-cyan-400/60 text-xs flex-shrink-0">→</span>
                      {meta.shot.lastFrame?.url ? (
                        <div className="relative flex-1 aspect-video rounded overflow-hidden bg-black border border-cyan-500/30">
                          <img src={meta.shot.lastFrame.url} alt="last frame" className="w-full h-full object-cover" />
                          <span className="absolute bottom-0 inset-x-0 px-1 bg-black/80 text-[8px] text-cyan-200 text-center">last</span>
                        </div>
                      ) : (
                        <div className="flex-1 aspect-video rounded bg-white/5 border border-dashed border-white/10 flex items-center justify-center text-[9px] text-gray-600">last —</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Variants — alternate takes of the same shot. Each shows
                    as a thumbnail; click to promote to primary; X to remove.
                    Generate creates a new one anchored to the same refs but
                    re-rolled (style + identity retained, composition varies). */}
                {onGenerateVariant && (() => {
                  const variants = meta.shot.variants || [];
                  const isGeneratingVariant = generatingVariantShotId === meta.shot.id;
                  return (
                    <div className="pt-2 border-t border-white/5">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] uppercase text-gray-500 tracking-wider">
                          Alternate takes ({variants.length})
                        </label>
                        <button
                          onClick={() => onGenerateVariant(meta.scene, meta.shot)}
                          disabled={isGeneratingVariant}
                          className={cn(
                            "px-1.5 py-0.5 text-[10px] rounded border flex items-center gap-1 transition-colors",
                            isGeneratingVariant
                              ? "bg-purple-500/30 text-purple-200 border-purple-500/40 cursor-wait"
                              : "bg-cyan-500/15 text-cyan-200 border-cyan-500/30 hover:bg-cyan-500/25"
                          )}
                          title="Generate a new alternate take using the same prompt + refs"
                        >
                          {isGeneratingVariant ? <Loader className="w-2.5 h-2.5 animate-spin" /> : <Wand2 className="w-2.5 h-2.5" />}
                          {isGeneratingVariant ? "Rolling..." : "New variant"}
                        </button>
                      </div>
                      {variants.length === 0 && !isGeneratingVariant ? (
                        <p className="text-[10px] text-gray-500 leading-relaxed">
                          Roll alternate takes of this shot to keep options open. Each variant uses the same references and prompt — composition varies.
                        </p>
                      ) : (
                        <div className="grid grid-cols-3 gap-1.5">
                          {variants.map((variant, vIdx) => (
                            <div
                              key={variant.id}
                              className="group/variant relative aspect-video rounded overflow-hidden bg-black border border-white/10 hover:border-cyan-400/60 transition-colors cursor-pointer"
                              onClick={() => onPromoteVariant?.(meta.scene, meta.shot, variant.id)}
                              title="Click to promote this variant to the primary"
                            >
                              <img src={variant.url} alt={variant.label || `Variant ${vIdx + 1}`} className="w-full h-full object-cover" />
                              <div className="absolute inset-x-0 bottom-0 px-1 py-0.5 bg-black/80 text-[8px] text-cyan-200 truncate">
                                {variant.label || `Take ${vIdx + 1}`}
                              </div>
                              {onDeleteVariant && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onDeleteVariant(meta.scene, meta.shot, variant.id); }}
                                  className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/70 text-rose-300 opacity-0 group-hover/variant:opacity-100 transition-opacity"
                                  title="Delete variant"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          ))}
                          {isGeneratingVariant && (
                            <div className="aspect-video rounded bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
                              <Loader className="w-3 h-3 text-purple-300 animate-spin" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Actions */}
                <div className="space-y-1.5 pt-2 border-t border-white/5">
                  {/* Split-at-playhead. Only enabled when the selected clip
                      is on the primary track AND the playhead is inside it
                      with enough room on both sides. */}
                  {(() => {
                    const isPrimary = selectedClip.trackId === primaryTrack?.id;
                    const clipIdx = primaryClips.findIndex((c) => c.id === selectedClip.id);
                    const clipStart = clipIdx >= 0 ? (clipStartTimes[clipIdx] || 0) : 0;
                    const localT = currentTimeSec - clipStart;
                    const MIN_HALF = 0.25;
                    const dur = selectedClip.durationSec || 0;
                    const canSplit = isPrimary && localT >= MIN_HALF && localT <= dur - MIN_HALF;
                    return (
                      <button
                        onClick={handleSplitClipAtPlayhead}
                        disabled={!canSplit}
                        className={cn(
                          "w-full flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg border transition-colors",
                          canSplit
                            ? "bg-cyan-500/15 text-cyan-200 border-cyan-500/30 hover:bg-cyan-500/25"
                            : "bg-white/5 text-gray-500 border-white/5 cursor-not-allowed"
                        )}
                        title={
                          !isPrimary
                            ? "Split only works on the primary video track"
                            : !canSplit
                              ? "Move the playhead inside this clip (at least 0.25s from each edge) to split"
                              : `Split this clip at ${localT.toFixed(2)}s — keyboard: S`
                        }
                      >
                        <span className="w-3 h-3 inline-flex items-center justify-center font-mono text-[14px] leading-none">⎘</span>
                        Split at playhead {canSplit ? `(${localT.toFixed(1)}s | ${(dur - localT).toFixed(1)}s)` : ""}
                      </button>
                    );
                  })()}
                  {onRegenerateShot && (
                    <button
                      onClick={() => onRegenerateShot(meta.scene, meta.shot)}
                      disabled={isRegenerating}
                      className={cn(
                        "w-full flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg border transition-colors",
                        isRegenerating
                          ? "bg-purple-500/30 text-purple-200 border-purple-500/40 cursor-wait"
                          : "bg-amber-500/15 text-amber-200 border-amber-500/30 hover:bg-amber-500/25"
                      )}
                      title="Re-render this shot using its current image prompt"
                    >
                      {isRegenerating ? <Loader className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      {isRegenerating ? "Re-rendering..." : "Re-render shot"}
                    </button>
                  )}
                  <button
                    onClick={() => onShotClick(meta.scene, meta.shot)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10"
                    title="Open this shot's workbench (edit prompt, see references, etc.)"
                  >
                    <PenLine className="w-3 h-3" />
                    Open shot workbench
                  </button>
                  <button
                    onClick={() => onSceneClick(meta.scene)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10"
                    title="Open the parent scene"
                  >
                    <Film className="w-3 h-3" />
                    Open scene
                  </button>
                  <button
                    onClick={() => { onDeleteClip(selectedClip.id); setSelectedClipId(null); }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg bg-white/5 text-rose-300 border border-white/10 hover:bg-rose-500/10 hover:border-rose-500/30"
                    title="Remove this clip from the timeline (shot is preserved)"
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove from timeline
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// Inline composer for adding a new scene from the timeline's shot picker.
// Collapsed: a single "+ Add scene" button. Expanded: a title input that
// commits on Enter / blur. Created scene shows up in the picker (and
// everywhere else) on the next refetch.
function NewSceneComposer({ onCreate }: { onCreate: (title: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0); }, [open]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onCreate(title.trim());
      setTitle("");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] rounded border border-dashed border-white/10 hover:border-amber-400/60 text-gray-500 hover:text-amber-300 transition-colors"
        title="Create a new scene. Add shots to it from the + Shot buttons below."
      >
        <Plus className="w-2.5 h-2.5" />
        Add scene
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 space-y-2">
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          else if (e.key === "Escape") { setOpen(false); setTitle(""); }
        }}
        placeholder="Scene title (optional, enter to create)"
        className="w-full px-2 py-1 text-xs rounded bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40"
      />
      <div className="flex items-center justify-end gap-1.5">
        <button
          onClick={() => { setOpen(false); setTitle(""); }}
          className="px-2 py-0.5 text-[10px] rounded text-gray-400 hover:text-white hover:bg-white/10"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={busy}
          className={cn(
            "px-2 py-0.5 text-[10px] rounded border flex items-center gap-1",
            busy
              ? "bg-amber-500/30 text-amber-200 border-amber-500/40 cursor-wait"
              : "bg-amber-500/20 text-amber-200 border-amber-500/30 hover:bg-amber-500/30"
          )}
        >
          {busy ? <Loader className="w-2.5 h-2.5 animate-spin" /> : <Plus className="w-2.5 h-2.5" />}
          {busy ? "Creating..." : "Create"}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// SCENE GRID — the Production view's primary canvas. Replaces the old 3D
// scene carousel. Top of the page is the StoryboardStrip timeline (drag-to-
// reorder); below it is this grid of scene cards. Clicking a card opens the
// Scene workbench. Cards show frame thumbnails, participants, and linked
// storyboard count so the writer can navigate the whole production without
// leaving the page.
// =============================================================================

function SceneGrid({
  scenes,
  entities,
  storyboards,
  selectedSceneId,
  onSceneClick,
  onFrameClick,
}: {
  scenes: Scene[];
  entities: Entity[];
  storyboards: StoryboardArtifact[];
  selectedSceneId?: string;
  onSceneClick: (scene: Scene) => void;
  onFrameClick?: (scene: Scene, frame: SceneFrame) => void;
}) {
  // Map sceneId → count of linked storyboards (artifact.content.sceneId).
  // Storyboards generated from a scene record their source, so we can show a
  // badge linking the two surfaces.
  const storyboardCountByScene = useMemo(() => {
    const map = new Map<string, number>();
    for (const sb of storyboards) {
      const sid = (sb as any).content?.sceneId as string | undefined;
      if (!sid) continue;
      map.set(sid, (map.get(sid) || 0) + 1);
    }
    return map;
  }, [storyboards]);

  if (scenes.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center max-w-md">
          <Film className="w-12 h-12 text-amber-500/30 mx-auto mb-3" />
          <h2 className="text-lg text-gray-200 mb-1">No scenes yet</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Production starts here — write a scene list in the Script phase and promote entries, or ask the chat: <span className="text-amber-300">"Add a scene where..."</span>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-y-auto px-6 pb-6">
      <div className="max-w-7xl mx-auto pt-10 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {scenes.map((scene, idx) => {
            const participants = entities.filter((e) => scene.participantIds.includes(e.id));
            const location = entities.find((e) => e.id === scene.locationId);
            const frames = scene.frames || [];
            const sbCount = storyboardCountByScene.get(scene.id) || 0;
            const isSelected = scene.id === selectedSceneId;
            const continuityIssues = scene.storyDiff?.issueCount || 0;

            return (
              <div
                key={scene.id}
                className={cn(
                  "group rounded-2xl overflow-hidden bg-slate-900 border-2 transition-all flex flex-col",
                  isSelected
                    ? "border-amber-400/60 shadow-2xl shadow-amber-500/10"
                    : "border-white/10 hover:border-amber-500/40"
                )}
              >
                {/* Hero — click anywhere on the cover to open the workbench */}
                <button
                  onClick={() => onSceneClick(scene)}
                  className="relative aspect-[16/9] bg-black overflow-hidden text-left group/cover"
                  title="Open this scene's workbench"
                >
                  {scene.imageUrl ? (
                    <img
                      src={scene.imageUrl}
                      alt={scene.title}
                      className="w-full h-full object-cover transition-transform group-hover/cover:scale-[1.02]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                      <Film className="w-12 h-12 text-amber-500/20" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

                  {/* Top-left scene index + status badges */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-black/70 text-amber-300 uppercase tracking-wider">
                      Scene {idx + 1}
                    </span>
                    {scene.status === "draft" ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/80 text-black">Draft</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/80 text-black flex items-center gap-1">
                        <Award className="w-2.5 h-2.5" />
                        Canon
                      </span>
                    )}
                    {(scene.visualDirty || (scene.frameVisualDirtyCount || 0) > 0) && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-100 border border-amber-500/40 flex items-center gap-1"
                        title={scene.visualDirtyReason || "Visual continuity needs refresh"}
                      >
                        <AlertTriangle className="w-2.5 h-2.5" />
                        Dirty
                      </span>
                    )}
                  </div>

                  {/* Top-right participants pill */}
                  {participants.length > 0 && (
                    <div className="absolute top-3 right-3 flex -space-x-2">
                      {participants.slice(0, 3).map((entity) => {
                        const config = entityTypeConfig[entity.type] || entityTypeConfig.character;
                        return (
                          <div
                            key={entity.id}
                            className={cn("w-7 h-7 rounded-full overflow-hidden ring-2 ring-slate-900", config.ringColor)}
                            title={entity.name}
                          >
                            {entity.referenceImage ? (
                              <img src={entity.referenceImage} alt={entity.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className={cn("w-full h-full flex items-center justify-center", config.bgColor)}>
                                <config.icon className={cn("w-3.5 h-3.5", config.color)} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {participants.length > 3 && (
                        <div className="w-7 h-7 rounded-full bg-slate-800 ring-2 ring-slate-900 flex items-center justify-center">
                          <span className="text-[10px] text-gray-300">+{participants.length - 3}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Title overlay at bottom */}
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <h3 className="text-base font-semibold text-white truncate drop-shadow">{scene.title || `Scene ${idx + 1}`}</h3>
                    {location && (
                      <p className="text-[11px] text-gray-300 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-purple-300/80" />
                        <span className="truncate">{location.name}</span>
                      </p>
                    )}
                  </div>
                </button>

                {/* Prose preview + meta footer */}
                <div className="p-3 space-y-2.5 flex-1 flex flex-col">
                  {scene.prose && (
                    <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-2">{scene.prose}</p>
                  )}

                  {/* Inline frame strip — click any to open the frame
                      workbench directly. Empty cells show no thumbnail. */}
                  {frames.length > 0 && (
                    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide -mx-1 px-1">
                      {frames.map((frame, fIdx) => (
                        <button
                          key={frame.id}
                          onClick={(e) => { e.stopPropagation(); onFrameClick?.(scene, frame); }}
                          className="relative flex-shrink-0 h-10 aspect-[16/9] rounded overflow-hidden border border-white/10 hover:border-amber-400/60 transition-colors"
                          title={frame.title || `Shot ${fIdx + 1}`}
                        >
                          {frame.imageUrl ? (
                            <img src={frame.imageUrl} alt={frame.title || `Shot ${fIdx + 1}`} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                              <Film className="w-3 h-3 text-gray-600" />
                            </div>
                          )}
                          {frame.visualDirty && (
                            <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-amber-400" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Footer chips: frame count, storyboard count, continuity */}
                  <div className="flex items-center justify-between gap-2 mt-auto pt-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-200 flex items-center gap-1">
                        <LayoutGrid className="w-2.5 h-2.5" />
                        {frames.length} shot{frames.length === 1 ? "" : "s"}
                      </span>
                      {sbCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-200 flex items-center gap-1" title="Storyboard pages linked to this scene">
                          <FileText className="w-2.5 h-2.5" />
                          {sbCount} storyboard{sbCount === 1 ? "" : "s"}
                        </span>
                      )}
                      {continuityIssues > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-200 flex items-center gap-1" title="Continuity issues — open the workbench to fix">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          {continuityIssues}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => onSceneClick(scene)}
                      className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded text-amber-300 hover:bg-amber-500/15"
                    >
                      <Eye className="w-3 h-3" />
                      Open
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// FRAME CARD (full-size carousel card for a single frame)
// =============================================================================

function FrameCard({
  scene,
  frame,
  frameIndex,
  totalFrames,
  entities,
  isActive,
  onClick,
  onNavigateToScene,
  compactMode = false,
}: {
  scene: Scene;
  frame: SceneFrame;
  frameIndex: number;
  totalFrames: number;
  entities: Entity[];
  isActive: boolean;
  onClick: () => void;
  onNavigateToScene?: () => void;
  compactMode?: boolean;
}) {
  const frameParticipantIds = frame.participantIds || scene.participantIds;
  const participants = entities.filter((e) => frameParticipantIds.includes(e.id));

  const activeWidth = compactMode ? 570 : 650;
  const activeHeight = compactMode ? 330 : 380;
  const inactiveWidth = compactMode ? 350 : 400;
  const inactiveHeight = compactMode ? 210 : 240;

  return (
    <div className="relative" onClick={isActive ? onClick : undefined}>
      {isActive && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute -inset-6 bg-purple-500/20 rounded-3xl blur-3xl" />
      )}
      <div
        className={cn(
          "relative rounded-2xl overflow-hidden border-2 bg-slate-900 transition-all cursor-pointer",
          isActive ? "border-purple-500/60 shadow-2xl shadow-purple-500/20" : "border-white/10"
        )}
        style={{ width: isActive ? activeWidth : inactiveWidth, height: isActive ? activeHeight : inactiveHeight }}
      >
        {frame.imageUrl ? (
          <img src={frame.imageUrl} alt={frame.title || `Shot ${frameIndex + 1}`} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-900/20 to-slate-900 flex items-center justify-center">
            <Film className="w-16 h-16 text-purple-500/20" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

        {/* Parent scene breadcrumb - top left */}
        {isActive && onNavigateToScene && (
          <div
            className="absolute top-4 left-4 flex items-center gap-2 cursor-pointer z-10"
            onClick={(e) => { e.stopPropagation(); onNavigateToScene(); }}
          >
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/60 hover:bg-black/80 transition-colors">
              {scene.imageUrl ? (
                <img src={scene.imageUrl} alt={scene.title} className="w-5 h-5 rounded object-cover" />
              ) : (
                <Film className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span className="text-[10px] text-amber-300 max-w-[120px] truncate">{scene.title}</span>
              <ChevronLeft className="w-3 h-3 text-gray-500" />
            </div>
          </div>
        )}

        {/* Camera/mood info - top right */}
        {isActive && (frame.camera || frame.mood) && (
          <div className="absolute top-4 right-4 flex flex-col items-end gap-1">
            {frame.camera && (
              <div className="px-2 py-0.5 rounded bg-black/60 text-[10px] text-purple-300 flex items-center gap-1">
                <Camera className="w-3 h-3" />
                {frame.camera}
              </div>
            )}
            {frame.mood && (
              <div className="px-2 py-0.5 rounded bg-black/60 text-[10px] text-gray-400">
                {frame.mood}
              </div>
            )}
          </div>
        )}

        {/* Floating participant avatars */}
        {isActive && participants.length > 0 && !(frame.camera || frame.mood) && (
          <div className="absolute top-4 right-4 flex -space-x-3">
            {participants.slice(0, 4).map((entity) => {
              const config = entityTypeConfig[entity.type] || entityTypeConfig.character;
              return (
                <div
                  key={entity.id}
                  className={cn("w-10 h-10 rounded-full overflow-hidden ring-2 ring-slate-900", config.ringColor)}
                >
                  {entity.referenceImage ? (
                    <img src={entity.referenceImage} alt={entity.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className={cn("w-full h-full flex items-center justify-center", config.bgColor)}>
                      <config.icon className={cn("w-4 h-4", config.color)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Frame info */}
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <div className="flex items-center gap-2 mb-1.5">
            <LayoutGrid className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[10px] text-purple-400/80 uppercase tracking-wider">
              Shot {frameIndex + 1} of {totalFrames}
            </span>
            {frame.shotType && (
              <span className="px-1.5 py-0.5 rounded bg-purple-500/30 text-[9px] text-purple-200 uppercase">
                {frame.shotType}
              </span>
            )}
            {frame.visualDirty && (
              <div className="w-2 h-2 rounded-full bg-amber-400" title="Visual outdated" />
            )}
          </div>
          <h3 className={cn("font-bold text-white", isActive ? "text-xl" : "text-base")}>
            {frame.title || `Shot ${frameIndex + 1}`}
          </h3>
          {isActive && frame.description && (
            <p className="text-sm text-gray-400 mt-1.5 line-clamp-2">{frame.description}</p>
          )}
        </div>

        {/* Participant avatars below camera/mood when both exist */}
        {isActive && participants.length > 0 && (frame.camera || frame.mood) && (
          <div className="absolute top-14 right-4 flex -space-x-2">
            {participants.slice(0, 3).map((entity) => {
              const config = entityTypeConfig[entity.type] || entityTypeConfig.character;
              return (
                <div
                  key={entity.id}
                  className={cn("w-8 h-8 rounded-full overflow-hidden ring-2 ring-slate-900", config.ringColor)}
                >
                  {entity.referenceImage ? (
                    <img src={entity.referenceImage} alt={entity.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className={cn("w-full h-full flex items-center justify-center", config.bgColor)}>
                      <config.icon className={cn("w-3.5 h-3.5", config.color)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// ENTITY CARD
// =============================================================================

function EntityCard({ entity, isActive, onClick, compactMode = false }: { entity: Entity; isActive: boolean; onClick: () => void; compactMode?: boolean }) {
  const config = entityTypeConfig[entity.type] || entityTypeConfig.character;
  const Icon = config.icon;

  // Adjust sizes based on compactMode (only slight reduction since we primarily shift up)
  const activeWidth = compactMode ? 520 : 600;
  const activeHeight = compactMode ? 330 : 380;
  const inactiveWidth = compactMode ? 320 : 360;
  const inactiveHeight = compactMode ? 210 : 240;

  return (
    <div className="relative" onClick={isActive ? onClick : undefined}>
      {isActive && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn("absolute -inset-6 rounded-3xl blur-3xl", config.bgColor)} />
      )}
      <div
        className={cn(
          "relative rounded-2xl overflow-hidden border-2 bg-slate-900 transition-all cursor-pointer",
          isActive ? "border-amber-500/60 shadow-2xl shadow-amber-500/20" : "border-white/10"
        )}
        style={{ width: isActive ? activeWidth : inactiveWidth, height: isActive ? activeHeight : inactiveHeight }}
      >
        {entity.referenceImage ? (
          <img src={entity.referenceImage} alt={entity.name} className="w-full h-full object-cover" />
        ) : (
          <div className={cn("w-full h-full flex items-center justify-center", config.bgColor)}>
            <Icon className={cn(isActive ? "w-24 h-24" : "w-14 h-14", config.color)} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="flex items-center gap-2 mb-1">
            <Icon className={cn("w-4 h-4", config.color)} />
            <span className="text-xs text-gray-400 uppercase tracking-wider">{entity.type}</span>
            {entity.status === "canon" && <span className="text-xs text-emerald-400">Canon</span>}
          </div>
          <h3 className={cn("font-bold text-white", isActive ? "text-2xl" : "text-lg")}>{entity.name}</h3>
          {isActive && entity.description && <p className="text-sm text-gray-400 mt-2 line-clamp-2">{entity.description}</p>}
        </div>

        {isActive && (
          <div className="absolute top-4 right-4">
            <div className="px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> View Details
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// ENTITY DETAIL VIEW - Wide with side relationships + scene bubbles
// =============================================================================

function EntityDetailView({
  detail,
  allEntities,
  onClose,
  onEntityClick,
  onSceneClick,
  onFocusInChat,
  onGeneratePortrait,
  isGeneratingPortrait,
  onGenerateVariations,
  isGeneratingVariations,
  portraitVariations,
  variationRunGeneratedCount,
  onSelectVariation,
  onClearVariations,
  additionalRefs,
  onAdditionalRefsChange,
  refPickerOpen,
  onRefPickerToggle,
  projectId,
  cameraAngleTarget,
  onCameraAngleTarget,
  onGenerateCameraAngle,
  isGeneratingCameraAngle,
  imageEditTarget,
  onImageEditTarget,
  onApplyImageEdit,
  isApplyingImageEdit,
  onAddRelationship,
  onDeleteRelationship,
  onRemoveVariation,
  onPromoteGalleryImage,
  onRemoveGalleryImage,
}: {
  detail: EntityDetail;
  allEntities: Entity[];
  onClose: () => void;
  onEntityClick: (id: string) => void;
  onSceneClick: (scene: Scene) => void;
  onFocusInChat: (entity: Entity) => void;
  onGeneratePortrait?: (entity: Entity, customPrompt?: string) => void;
  isGeneratingPortrait?: boolean;
  onGenerateVariations?: (entity: Entity, customPrompt?: string, count?: number) => void;
  isGeneratingVariations?: boolean;
  portraitVariations?: string[];
  variationRunGeneratedCount?: number;
  onSelectVariation?: (entity: Entity, imageUrl: string, index: number) => void;
  onClearVariations?: () => void;
  additionalRefs?: string[];
  onAdditionalRefsChange?: (selections: ReferenceSelection[]) => void;
  refPickerOpen?: boolean;
  onRefPickerToggle?: (open: boolean) => void;
  projectId?: string;
  cameraAngleTarget?: CameraAngleTarget | null;
  onCameraAngleTarget?: (target: CameraAngleTarget | null) => void;
  onGenerateCameraAngle?: (cameraDescription: string) => void;
  isGeneratingCameraAngle?: boolean;
  imageEditTarget?: CameraAngleTarget | null;
  onImageEditTarget?: (target: CameraAngleTarget | null) => void;
  onApplyImageEdit?: (editInstruction: string) => void;
  isApplyingImageEdit?: boolean;
  onAddRelationship?: (sourceId: string, targetId: string, targetName: string, type: string, description?: string) => void;
  onDeleteRelationship?: (relationshipId: string) => void;
  onRemoveVariation?: (entity: Entity, index: number) => void;
  onPromoteGalleryImage?: (entity: Entity, imageId: string) => void;
  onRemoveGalleryImage?: (entity: Entity, imageId: string) => void;
}) {
  const { entity, relationships, scenes, relatedEntities, narrativeArc, arcIssues } = detail;
  const config = entityTypeConfig[entity.type] || entityTypeConfig.character;
  const Icon = config.icon;
  const { openLightbox } = useLightbox();
  const [portraitPrompt, setPortraitPrompt] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAddingConnection, setIsAddingConnection] = useState(false);
  const portraitHeaderTypes = new Set(["character", "person", "agent", "npc", "protagonist", "antagonist"]);
  const shouldUsePortraitHeaderCrop = portraitHeaderTypes.has((entity.type || "").toLowerCase());

  useEffect(() => {
    setPortraitPrompt((entity as any).portraitPrompt || "");
    setIsFullscreen(false);
    setIsAddingConnection(false);
  }, [entity.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        e.stopPropagation();
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isFullscreen]);

  // Split relationships into left (incoming) and right (outgoing)
  const incomingRels = relationships.filter((r) => r.direction === "incoming");
  const outgoingRels = relationships.filter((r) => r.direction === "outgoing");
  const variationSlotCount = Math.max(4, portraitVariations?.length || 0);
  const normalizeComparableUrl = (value?: string) => (value || "").replace(/^https?:\/\/[^/]+/, "");
  const isCurrentReferenceImage = (candidateUrl: string) => {
    if (!entity.referenceImage) return false;
    return normalizeComparableUrl(entity.referenceImage) === normalizeComparableUrl(candidateUrl);
  };

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      className={cn("relative flex items-center gap-8 w-full mx-4", isFullscreen ? "max-w-[95vw]" : "max-w-6xl")}
    >
      {/* Left side - Incoming relationships */}
      <div className="flex-shrink-0 w-40 flex flex-col items-center gap-4">
        {incomingRels.slice(0, 3).map((rel) => {
          const relEntity = allEntities.find((e) => e.id === rel.sourceId);
          if (!relEntity) return null;
          const relConfig = entityTypeConfig[relEntity.type] || entityTypeConfig.character;

          return (
            <button
              key={rel.id}
              onClick={() => onEntityClick(rel.sourceId)}
              className="group relative flex flex-col items-center"
            >
              {/* Connector line */}
              <svg className="absolute top-1/2 left-full w-8 h-1" style={{ transform: "translateY(-50%)" }}>
                <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(251,191,36,0.3)" strokeWidth="2" strokeDasharray="4 4" />
              </svg>
              <div className={cn("w-20 h-20 rounded-full overflow-hidden ring-4 transition-all group-hover:ring-amber-400", relConfig.ringColor)}>
                {relEntity.referenceImage ? (
                  <img src={relEntity.referenceImage} alt={relEntity.name} className="w-full h-full object-cover" />
                ) : (
                  <div className={cn("w-full h-full flex items-center justify-center", relConfig.bgColor)}>
                    <relConfig.icon className={cn("w-8 h-8", relConfig.color)} />
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-400 mt-2 text-center line-clamp-1">{relEntity.name}</span>
              <span className="text-[10px] text-amber-400/60">{rel.type}</span>
            </button>
          );
        })}
      </div>

      {/* Center - Main entity card */}
      <div className={cn("flex-1 bg-slate-900 rounded-2xl border border-white/20 shadow-2xl overflow-hidden flex flex-col", isFullscreen ? "max-h-[95vh]" : "max-h-[80vh]")}>
        {/* Header with Image */}
        <div className={cn("relative flex-shrink-0 bg-slate-950/80", isFullscreen ? "h-48 md:h-56" : "h-72 md:h-80 lg:h-[22rem]")}>
          {entity.referenceImage ? (
            <button
              type="button"
              onClick={() => {
                if (entity.referenceImage) {
                  openLightbox(entity.referenceImage, `${entity.name} portrait`);
                }
              }}
              className="relative w-full h-full text-left group"
            >
              <img
                src={entity.referenceImage}
                alt={entity.name}
                className={cn(
                  "w-full h-full object-cover cursor-zoom-in",
                  shouldUsePortraitHeaderCrop ? "object-[50%_22%]" : "object-center"
                )}
              />
            </button>
          ) : (
            <div className={cn("w-full h-full flex items-center justify-center", config.bgColor)}>
              <Icon className={cn("w-24 h-24", config.color)} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent pointer-events-none" />
          {entity.referenceImage && (
            <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
              <button
                type="button"
                onClick={() => openLightbox(entity.referenceImage!, `${entity.name} portrait`)}
                className="px-2.5 py-1.5 rounded-lg bg-black/55 text-gray-100 text-xs hover:bg-black/70 transition-colors"
              >
                View Full
              </button>
              {onCameraAngleTarget && (
                <button
                  type="button"
                  onClick={() => { onImageEditTarget?.(null); onCameraAngleTarget({
                    type: 'entity',
                    entityId: entity.id,
                    imageUrl: entity.referenceImage!,
                    label: entity.name,
                  }); }}
                  className="px-2.5 py-1.5 rounded-lg bg-black/55 text-gray-100 text-xs hover:bg-black/70 transition-colors flex items-center gap-1"
                >
                  <Camera className="w-3 h-3" /> Angle
                </button>
              )}
              {onImageEditTarget && (
                <button
                  type="button"
                  onClick={() => { onCameraAngleTarget?.(null); onImageEditTarget({
                    type: 'entity',
                    entityId: entity.id,
                    imageUrl: entity.referenceImage!,
                    label: entity.name,
                  }); }}
                  className="px-2.5 py-1.5 rounded-lg bg-black/55 text-gray-100 text-xs hover:bg-black/70 transition-colors flex items-center gap-1"
                >
                  <PenLine className="w-3 h-3" /> Edit
                </button>
              )}
            </div>
          )}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
            <button
              onClick={() => setIsFullscreen(f => !f)}
              className="p-2 rounded-full bg-black/50 text-white/70 hover:bg-black/70"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <button onClick={onClose} className="p-2 rounded-full bg-black/50 text-white/70 hover:bg-black/70">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="absolute bottom-4 left-6 right-6">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={cn("w-5 h-5", config.color)} />
              <span className="text-sm text-gray-400 uppercase tracking-wider">{entity.type}</span>
              {entity.status === "canon" && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs">Canon</span>
              )}
            </div>
            <h2 className="text-3xl font-bold text-white">{entity.name}</h2>
          </div>
        </div>

        {/* Camera Angle Control for entity */}
        <AnimatePresence>
          {cameraAngleTarget?.type === 'entity' && cameraAngleTarget.entityId === entity.id && onGenerateCameraAngle && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-6 pt-4 overflow-hidden"
            >
              <CameraAngleControl
                sourceImageUrl={cameraAngleTarget.imageUrl}
                sourceLabel={cameraAngleTarget.label}
                onGenerate={onGenerateCameraAngle}
                isGenerating={isGeneratingCameraAngle || false}
                onClose={() => onCameraAngleTarget?.(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Image Edit Control for entity */}
        <AnimatePresence>
          {imageEditTarget?.type === 'entity' && imageEditTarget.entityId === entity.id && onApplyImageEdit && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-6 pt-4 overflow-hidden"
            >
              <ImageEditControl
                sourceImageUrl={imageEditTarget.imageUrl}
                sourceLabel={imageEditTarget.label}
                onApply={onApplyImageEdit}
                isApplying={isApplyingImageEdit || false}
                onClose={() => onImageEditTarget?.(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {entity.description && (
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Description</h3>
              <div className="prose prose-invert max-w-none">
                {entity.description.split(/\n\n|\n/).map((p, i) => (
                  <p key={i} className="text-gray-300 leading-relaxed mb-3 last:mb-0">{p}</p>
                ))}
              </div>
            </div>
          )}

          {entity.backstory && (
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Backstory</h3>
              <div className="prose prose-invert max-w-none">
                {entity.backstory.split(/\n\n|\n/).map((p, i) => (
                  <p key={i} className="text-gray-400 leading-relaxed text-sm mb-3 last:mb-0">{p}</p>
                ))}
              </div>
            </div>
          )}

          {entity.traits && entity.traits.length > 0 && (
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Traits</h3>
              <div className="flex flex-wrap gap-2">
                {entity.traits.map((trait, i) => (
                  <span key={i} className="px-3 py-1 rounded-full bg-white/5 text-sm text-gray-300 border border-white/10">
                    {trait}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Portrait Prompt (Optional)</h3>
            <textarea
              value={portraitPrompt}
              onChange={(e) => setPortraitPrompt(e.target.value)}
              placeholder="Add visual notes that influence generation without overriding the entity..."
              className="w-full min-h-[80px] bg-white/5 rounded-xl p-3 text-xs text-gray-300 leading-relaxed resize-none border border-white/10 focus:outline-none focus:border-purple-500/50"
            />
          </div>

          {/* Portrait Variations Selection */}
          {(portraitVariations || isGeneratingVariations) && (
            <div className="border border-purple-500/30 rounded-xl p-4 bg-purple-500/5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs text-purple-400 uppercase tracking-wider flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  Portrait Variations
                </h3>
                {!isGeneratingVariations && onClearVariations && (
                  <button
                    onClick={onClearVariations}
                    className="text-xs text-gray-500 hover:text-gray-300"
                  >
                    Hide
                  </button>
                )}
              </div>

              <p className="text-[11px] text-gray-400 mb-3">
                Generated options stay saved as non-canon references until you explicitly choose one.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Array.from({ length: variationSlotCount }).map((_, idx) => {
                  const variation = portraitVariations?.[idx];
                  const slotLabel = String.fromCharCode(65 + (idx % 26));
                  return (
                    <div key={idx} className="rounded-lg overflow-hidden bg-slate-900/80 border border-white/10">
                      {variation ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openLightbox(variation, `${entity.name} variation ${idx + 1}`)}
                            className="relative w-full text-left group"
                          >
                            <img
                              src={variation}
                              alt={`Variation ${idx + 1}`}
                              className="w-full aspect-square object-cover cursor-zoom-in"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                            <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-white">
                              {slotLabel}
                            </span>
                            {onRemoveVariation && !isGeneratingVariations && (
                              <span
                                role="button"
                                onClick={(e) => { e.stopPropagation(); onRemoveVariation(entity, idx); }}
                                className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/70 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </span>
                            )}
                          </button>
                          <div className="p-1.5 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onSelectVariation?.(entity, variation, idx)}
                              className={cn(
                                "flex-1 px-2 py-1 rounded-md text-[10px] transition-colors",
                                isCurrentReferenceImage(variation)
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                  : "bg-purple-500/20 text-purple-200 hover:bg-purple-500/30 border border-purple-500/30"
                              )}
                            >
                              {isCurrentReferenceImage(variation) ? "Current" : "Use"}
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="w-full aspect-square flex items-center justify-center">
                          {isGeneratingVariations ? (
                            <Loader className="w-5 h-5 text-purple-400/50 animate-spin" />
                          ) : (
                            <span className="text-gray-600 text-[10px]">{slotLabel}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {isGeneratingVariations && (
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Generating {Math.min(variationRunGeneratedCount || 0, 4)}/4 new variations...
                </p>
              )}
            </div>
          )}

          {/* Image Gallery — labeled secondary images (expressions, moods, looks).
              Always visible so the affordance is discoverable; renders an empty
              state with a hint when no gallery images exist yet. */}
          <div className="border border-amber-500/20 rounded-xl p-4 bg-amber-500/[0.02]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs text-amber-400/80 uppercase tracking-wider flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                Gallery ({entity.imageGallery?.length || 0})
              </h3>
              <span className="text-[10px] text-gray-500">
                {entity.imageGallery && entity.imageGallery.length > 0
                  ? `Click any to expand · ask AI for more`
                  : `Ask AI: "give ${entity.name} an expression sheet"`}
              </span>
            </div>
            {entity.imageGallery && entity.imageGallery.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {entity.imageGallery.map((img) => (
                  <div key={img.id} className="rounded-lg overflow-hidden bg-slate-900/80 border border-white/10 group relative">
                    <button
                      type="button"
                      onClick={() => openLightbox(img.url, `${entity.name} — ${img.label}`)}
                      className="relative w-full text-left block"
                    >
                      <img
                        src={img.url}
                        alt={img.label}
                        className="w-full aspect-square object-cover cursor-zoom-in"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent px-2 py-1.5">
                        <p className="text-[10px] text-white font-medium truncate">{img.label}</p>
                        {img.mood && (
                          <p className="text-[9px] text-white/60 truncate">{img.mood}</p>
                        )}
                      </div>
                    </button>

                    {/* Hover-revealed action buttons */}
                    <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {onPromoteGalleryImage && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPromoteGalleryImage(entity, img.id);
                          }}
                          title="Set as primary portrait"
                          className="px-2 py-1 rounded-md bg-amber-500/90 hover:bg-amber-400 text-black text-[10px] font-medium shadow-lg flex items-center gap-1"
                        >
                          <Award className="w-3 h-3" />
                          Set Primary
                        </button>
                      )}
                      {onRemoveGalleryImage && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Remove "${img.label}" from ${entity.name}'s gallery?`)) {
                              onRemoveGalleryImage(entity, img.id);
                            }
                          }}
                          title="Remove from gallery"
                          className="p-1 rounded-md bg-black/70 hover:bg-red-500/80 text-white shadow-lg"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-dashed border-amber-500/15 rounded-lg p-4 text-center">
                <ImageIcon className="w-5 h-5 text-amber-500/30 mx-auto mb-1.5" />
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  No labeled gallery shots yet. Ask the AI for expressions, alternate looks, or mood references —
                  e.g. <span className="text-amber-400/70">"give {entity.name} expression shots: scowling, weary, determined"</span>.
                  Each shot uses {entity.name}'s primary portrait as an identity reference so they all look like the same character.
                </p>
              </div>
            )}
          </div>

          {/* Connections / Relationships */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs text-gray-500 uppercase tracking-wider">Connections</h3>
              {onAddRelationship && (
                <button
                  onClick={() => setIsAddingConnection(!isAddingConnection)}
                  className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-amber-400 transition-colors"
                >
                  {isAddingConnection ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                  {isAddingConnection ? "Cancel" : "Add"}
                </button>
              )}
            </div>

            {isAddingConnection && onAddRelationship && (
              <AddConnectionForm
                entities={allEntities}
                currentEntityId={entity.id}
                currentEntityName={entity.name}
                onAdd={(targetId, targetName, type, description) => {
                  onAddRelationship(entity.id, targetId, targetName, type, description);
                  setIsAddingConnection(false);
                }}
                onCancel={() => setIsAddingConnection(false)}
              />
            )}

            {relationships.length > 0 && (
              <div className="space-y-1 bg-white/5 rounded-xl p-3">
                {relationships.map((rel) => {
                  const otherEntityId = rel.direction === "outgoing" ? rel.targetId : rel.sourceId;
                  const otherEntity = allEntities.find(e => e.id === otherEntityId);
                  const otherName = rel.direction === "outgoing"
                    ? (rel.targetName || otherEntity?.name || "Unknown")
                    : (rel.sourceName || otherEntity?.name || "Unknown");
                  const relConfig = otherEntity ? (entityTypeConfig[otherEntity.type] || entityTypeConfig.character) : entityTypeConfig.character;
                  const RelIcon = relConfig.icon;

                  return (
                    <div key={rel.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group">
                      <button
                        onClick={() => onEntityClick(otherEntityId)}
                        className="flex items-center gap-3 flex-1 text-left"
                      >
                        <span className="text-amber-400/70">
                          {rel.direction === "outgoing" ? "→" : "←"}
                        </span>
                        <span className="text-gray-400 text-sm">{rel.type.replace(/_/g, " ")}</span>
                        <div className="flex items-center gap-2 flex-1">
                          <div className={cn("w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0", relConfig.bgColor)}>
                            <RelIcon className={cn("w-3 h-3", relConfig.color)} />
                          </div>
                          <span className="text-gray-200 group-hover:text-amber-400 transition-colors">{otherName}</span>
                        </div>
                        {rel.description && (
                          <span className="text-xs text-gray-500 truncate max-w-[150px]">{rel.description}</span>
                        )}
                      </button>
                      {onDeleteRelationship && (
                        <button
                          onClick={() => onDeleteRelationship(rel.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-500 hover:text-red-400 transition-all flex-shrink-0"
                          title="Remove connection"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {relationships.length === 0 && !isAddingConnection && (
              <p className="text-xs text-gray-600 italic">No connections yet</p>
            )}
          </div>

          {/* Scenes this entity appears in */}
          {scenes.length > 0 && (
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Appears In ({scenes.length} scenes)</h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {scenes.map((scene) => (
                  <button
                    key={scene.id}
                    onClick={() => onSceneClick(scene)}
                    className="flex-shrink-0 w-40 group"
                  >
                    <div className="w-full h-24 rounded-xl overflow-hidden border-2 border-white/10 group-hover:border-amber-500/50 transition-all">
                      {scene.imageUrl ? (
                        <img src={scene.imageUrl} alt={scene.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                          <Film className="w-8 h-8 text-amber-500/30" />
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-2 line-clamp-1">{scene.title}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {narrativeArc && narrativeArc.entries.length > 0 && (
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                Narrative Arc ({narrativeArc.entries.length} beats)
              </h3>
              <div className="space-y-2 bg-white/5 rounded-xl p-3 max-h-56 overflow-y-auto">
                {narrativeArc.entries.map((entry, idx) => (
                  <div key={`${entry.sceneId}_${idx}`} className="rounded-lg border border-white/10 bg-black/20 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => {
                          const targetScene = scenes.find((scene) => scene.id === entry.sceneId);
                          if (targetScene) onSceneClick(targetScene);
                        }}
                        className="text-xs text-amber-300 hover:text-amber-200 text-left"
                      >
                        Scene {entry.position + 1}: {entry.sceneTitle}
                      </button>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-gray-300 uppercase tracking-wide">
                        {entry.role}
                      </span>
                    </div>
                    {entry.changes.length > 0 && (
                      <p className="text-[11px] text-gray-300 mt-1">{entry.changes.join(" ")}</p>
                    )}
                    {entry.events.length > 0 && (
                      <p className="text-[10px] text-gray-500 mt-1">Events: {entry.events.join(" | ")}</p>
                    )}
                  </div>
                ))}
              </div>
              {arcIssues && arcIssues.length > 0 && (
                <p className="text-[11px] text-rose-300/80 mt-2">
                  Continuity notes: {arcIssues.length} issue{arcIssues.length > 1 ? "s" : ""} involve this entity.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-white/5 flex flex-wrap gap-3 flex-shrink-0">
          <button
            onClick={() => onFocusInChat(entity)}
            className="flex-1 min-w-[140px] px-4 py-3 rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 font-medium flex items-center justify-center gap-2"
          >
            <MessageSquare className="w-4 h-4" />
            Focus in Chat
          </button>
          {onGeneratePortrait && (
            <button
              onClick={() => onGeneratePortrait(entity, portraitPrompt)}
              disabled={isGeneratingPortrait || isGeneratingVariations}
              className={cn(
                "px-4 py-3 rounded-xl flex items-center gap-2 transition-all",
                isGeneratingPortrait
                  ? "bg-purple-500/30 text-purple-400 cursor-wait"
                  : "bg-white/5 text-gray-400 hover:bg-purple-500/20 hover:text-purple-400"
              )}
            >
              {isGeneratingPortrait ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <ImageIcon className="w-4 h-4" />
                  Generate
                </>
              )}
            </button>
          )}
          {onGenerateVariations && (
            isGeneratingVariations ? (
              <button
                disabled
                className="px-4 py-3 rounded-xl flex items-center gap-2 bg-purple-500/30 text-purple-400 cursor-wait"
              >
                <Loader className="w-4 h-4 animate-spin" />
                {variationRunGeneratedCount}/{variationRunGeneratedCount}...
              </button>
            ) : (
              <>
                <button
                  onClick={() => onGenerateVariations(entity, portraitPrompt, 1)}
                  disabled={isGeneratingPortrait}
                  className="px-3 py-3 rounded-xl flex items-center gap-1.5 transition-all bg-white/5 text-gray-400 hover:bg-purple-500/20 hover:text-purple-400"
                >
                  <Layers className="w-4 h-4" />
                  +1
                </button>
                <button
                  onClick={() => onGenerateVariations(entity, portraitPrompt, 4)}
                  disabled={isGeneratingPortrait}
                  className="px-3 py-3 rounded-xl flex items-center gap-1.5 transition-all bg-white/5 text-gray-400 hover:bg-purple-500/20 hover:text-purple-400"
                >
                  <Layers className="w-4 h-4" />
                  +4
                </button>
              </>
            )
          )}
          {onRefPickerToggle && (
            <button
              onClick={() => onRefPickerToggle(true)}
              className={cn(
                "px-4 py-3 rounded-xl flex items-center gap-2 transition-all",
                (additionalRefs?.length ?? 0) > 0
                  ? "bg-purple-500/20 text-purple-400"
                  : "bg-white/5 text-gray-400 hover:bg-white/10"
              )}
              title="Add reference images"
            >
              <Plus className="w-4 h-4" />
              Refs{(additionalRefs?.length ?? 0) > 0 ? ` (${additionalRefs!.length})` : ''}
            </button>
          )}
        </div>
        {projectId && onAdditionalRefsChange && (
          <ReferencePickerModal
            projectId={projectId}
            open={refPickerOpen ?? false}
            onClose={() => onRefPickerToggle?.(false)}
            onSelect={onAdditionalRefsChange}
            selected={additionalRefs}
          />
        )}
      </div>

      {/* Right side - Outgoing relationships + Scene bubbles */}
      <div className="flex-shrink-0 w-40 flex flex-col items-center gap-4">
        {outgoingRels.slice(0, 3).map((rel) => {
          const relEntity = allEntities.find((e) => e.id === rel.targetId);
          if (!relEntity) return null;
          const relConfig = entityTypeConfig[relEntity.type] || entityTypeConfig.character;

          return (
            <button
              key={rel.id}
              onClick={() => onEntityClick(rel.targetId)}
              className="group relative flex flex-col items-center"
            >
              {/* Connector line */}
              <svg className="absolute top-1/2 right-full w-8 h-1" style={{ transform: "translateY(-50%)" }}>
                <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(251,191,36,0.3)" strokeWidth="2" strokeDasharray="4 4" />
              </svg>
              <div className={cn("w-20 h-20 rounded-full overflow-hidden ring-4 transition-all group-hover:ring-amber-400", relConfig.ringColor)}>
                {relEntity.referenceImage ? (
                  <img src={relEntity.referenceImage} alt={relEntity.name} className="w-full h-full object-cover" />
                ) : (
                  <div className={cn("w-full h-full flex items-center justify-center", relConfig.bgColor)}>
                    <relConfig.icon className={cn("w-8 h-8", relConfig.color)} />
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-400 mt-2 text-center line-clamp-1">{relEntity.name}</span>
              <span className="text-[10px] text-cyan-400/60">{rel.type}</span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// =============================================================================
// ADD CONNECTION FORM (for entity-to-entity relationships)
// =============================================================================

function AddConnectionForm({
  entities,
  currentEntityId,
  currentEntityName,
  onAdd,
  onCancel,
}: {
  entities: Entity[];
  currentEntityId: string;
  currentEntityName: string;
  onAdd: (targetId: string, targetName: string, type: string, description?: string) => void;
  onCancel: () => void;
}) {
  const [selectedTarget, setSelectedTarget] = useState<Entity | null>(null);
  const [relType, setRelType] = useState("");
  const [relDescription, setRelDescription] = useState("");
  const typeInputRef = useRef<HTMLInputElement>(null);

  const typeSuggestions = ["allies_with", "enemies_with", "mentors", "reports_to", "works_with", "knows", "loves", "protects", "betrays", "created_by", "part_of", "located_in"];

  return (
    <div className="bg-white/5 rounded-xl p-3 mb-2 space-y-2 border border-white/10">
      {!selectedTarget ? (
        <AddEntityDropdown
          entities={entities}
          excludeIds={[currentEntityId]}
          onSelect={(e) => {
            setSelectedTarget(e);
            setTimeout(() => typeInputRef.current?.focus(), 50);
          }}
          placeholder="Select target entity..."
        />
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs text-gray-300">
            <span className="text-gray-500">{currentEntityName}</span>
            <span className="text-amber-400">→</span>
            <span>{selectedTarget.name}</span>
            <button onClick={() => setSelectedTarget(null)} className="ml-auto text-gray-500 hover:text-gray-300">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="relative">
            <input
              ref={typeInputRef}
              value={relType}
              onChange={(e) => setRelType(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && relType.trim() && selectedTarget) { onAdd(selectedTarget.id, selectedTarget.name, relType.trim(), relDescription.trim() || undefined); } }}
              placeholder="Relationship type (e.g. allies_with)"
              className="w-full bg-slate-800 text-xs text-gray-200 rounded-lg px-3 py-1.5 outline-none border border-white/10 focus:border-amber-500/30"
            />
            {relType.length === 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {typeSuggestions.slice(0, 6).map((s) => (
                  <button key={s} onClick={() => setRelType(s)} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            value={relDescription}
            onChange={(e) => setRelDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && relType.trim() && selectedTarget) { onAdd(selectedTarget.id, selectedTarget.name, relType.trim(), relDescription.trim() || undefined); } }}
            placeholder="Description (optional)"
            className="w-full bg-slate-800 text-xs text-gray-200 rounded-lg px-3 py-1.5 outline-none border border-white/10 focus:border-amber-500/30"
          />
          <div className="flex justify-end gap-2">
            <button onClick={onCancel} className="text-[11px] px-3 py-1 rounded-lg text-gray-500 hover:text-gray-300 transition-colors">Cancel</button>
            <button
              onClick={() => { if (relType.trim() && selectedTarget) { onAdd(selectedTarget.id, selectedTarget.name, relType.trim(), relDescription.trim() || undefined); } }}
              disabled={!relType.trim()}
              className="text-[11px] px-3 py-1 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Add Connection
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// ADD ENTITY DROPDOWN (reusable for participants / location selection)
// =============================================================================

const LOCATION_TYPES = new Set(['location', 'place', 'setting']);

function AddEntityDropdown({
  entities,
  excludeIds,
  filterToTypes,
  excludeTypes,
  onSelect,
  placeholder = "Search entities...",
}: {
  entities: Entity[];
  excludeIds: string[];
  filterToTypes?: Set<string>;
  excludeTypes?: Set<string>;
  onSelect: (entity: Entity) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const filtered = entities.filter((e) => {
    if (excludeIds.includes(e.id)) return false;
    if (filterToTypes && !filterToTypes.has(e.type)) return false;
    if (excludeTypes && excludeTypes.has(e.type)) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).slice(0, 20);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-amber-300 hover:bg-amber-500/10 transition-colors border border-dashed border-white/10 hover:border-amber-500/30"
      >
        <Plus className="w-3 h-3" />
        {placeholder}
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg bg-slate-800 border border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-white/10">
        <Search className="w-3 h-3 text-gray-500 flex-shrink-0" />
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); setSearch(""); } }}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-xs text-gray-200 outline-none placeholder-gray-600"
        />
        <button onClick={() => { setOpen(false); setSearch(""); }} className="text-gray-500 hover:text-gray-300">
          <X className="w-3 h-3" />
        </button>
      </div>
      <div className="max-h-40 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-gray-600">No matches</p>
        ) : (
          filtered.map((e) => {
            const config = entityTypeConfig[e.type] || entityTypeConfig.character;
            return (
              <button
                key={e.id}
                onClick={() => { onSelect(e); setOpen(false); setSearch(""); }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-white/5 transition-colors"
              >
                <div className={cn("w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0", config.bgColor)}>
                  {e.referenceImage ? (
                    <img src={e.referenceImage} alt="" className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <config.icon className={cn("w-3 h-3", config.color)} />
                  )}
                </div>
                <span className="text-xs text-gray-300 truncate">{e.name}</span>
                <span className={cn("text-[10px] ml-auto flex-shrink-0", config.color)}>{e.type}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// =============================================================================
// SCENE DETAIL VIEW
// =============================================================================

function SceneDetailView({
  scene,
  scenes,
  entities,
  onClose,
  onJumpToScene,
  onEntityClick,
  onSceneUpdate,
  onDiscuss,
  onGenerateImage,
  onGenerateFrames,
  onGenerateFrameImage,
  isGeneratingImage,
  isGeneratingFrames,
  generatingFrameId,
  frameGenerationError,
  generationDiagnostics,
  onPreviousScene,
  onNextScene,
  sceneIndex,
  totalScenes,
  cameraAngleTarget,
  onCameraAngleTarget,
  onGenerateCameraAngle,
  isGeneratingCameraAngle,
  onFrameClick,
  onGenerateSingleFrame,
  generatingFrameContentId,
  batchImageProgress,
  onDuplicateFrame,
  imageEditTarget,
  onImageEditTarget,
  onApplyImageEdit,
  isApplyingImageEdit,
  projectId,
  storyboards,
  onGenerateStoryboardForScene,
  isGeneratingStoryboardForScene,
  onOpenStoryboard,
}: {
  scene: Scene;
  scenes: Scene[];
  entities: Entity[];
  onClose: () => void;
  onJumpToScene?: (sceneId: string) => void;
  onEntityClick: (entity: Entity) => void;
  onSceneUpdate: (scene: Scene) => void;
  onDiscuss: (scene: Scene) => void;
  onGenerateImage: (scene: Scene, prompt?: string) => void;
  onGenerateFrames: (scene: Scene, count: number) => void;
  onGenerateFrameImage: (scene: Scene, frame: SceneFrame, prompt?: string) => void;
  isGeneratingImage?: boolean;
  isGeneratingFrames?: boolean;
  generatingFrameId?: string | null;
  frameGenerationError?: string | null;
  generationDiagnostics?: SceneGenerationDiagnostics;
  batchImageProgress?: { current: number; total: number } | null;
  onPreviousScene?: () => void;
  onNextScene?: () => void;
  sceneIndex?: number;
  totalScenes?: number;
  cameraAngleTarget?: CameraAngleTarget | null;
  onCameraAngleTarget?: (target: CameraAngleTarget | null) => void;
  onGenerateCameraAngle?: (cameraDescription: string) => void;
  isGeneratingCameraAngle?: boolean;
  onFrameClick?: (scene: Scene, frame: SceneFrame) => void;
  onGenerateSingleFrame?: (scene: Scene, frameId: string, guidance?: string) => void;
  generatingFrameContentId?: string | null;
  onDuplicateFrame?: (scene: Scene, frameId: string) => void;
  imageEditTarget?: CameraAngleTarget | null;
  onImageEditTarget?: (target: CameraAngleTarget | null) => void;
  onApplyImageEdit?: (editInstruction: string) => void;
  isApplyingImageEdit?: boolean;
  projectId?: string;
  storyboards?: StoryboardArtifact[];
  onGenerateStoryboardForScene?: (scene: Scene) => void;
  isGeneratingStoryboardForScene?: boolean;
  onOpenStoryboard?: (storyboardId: string) => void;
}) {
  // ─── State ────────────────────────────────────────────────────────────
  // Local mirrors of editable fields with autosave-on-blur — same pattern
  // as FrameDetailView. Avoids remote-update lag while typing.
  const [localTitle, setLocalTitle] = useState(scene.title);
  const [localProse, setLocalProse] = useState(scene.prose);
  // One-off prompt for a render — NOT persisted on the scene, just passed
  // to onGenerateImage on this call. Scenes don't have a canonical
  // imagePrompt (frames do).
  const [imagePrompt, setImagePrompt] = useState("");
  const [frameCount, setFrameCount] = useState(scene.frames?.length || 4);

  // Right-column tab — Story / Continuity / Render
  const [rightTab, setRightTab] = useState<"story" | "continuity" | "render">("story");

  // Frame management state
  const [deletingFrameId, setDeletingFrameId] = useState<string | null>(null);
  const deletingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draggedFrameId, setDraggedFrameId] = useState<string | null>(null);
  const [dragOverFrameIdx, setDragOverFrameIdx] = useState<number | null>(null);
  const [sceneRefPickerOpen, setSceneRefPickerOpen] = useState(false);

  // Last-render diagnostics expander
  const [lastRenderExpanded, setLastRenderExpanded] = useState(false);

  const { openLightbox } = useLightbox();

  // ─── Effects ──────────────────────────────────────────────────────────
  // Reset all transient state when the focused scene changes.
  useEffect(() => {
    setLocalTitle(scene.title);
    setLocalProse(scene.prose);
    setImagePrompt("");
    setFrameCount(scene.frames?.length || 4);
    setRightTab("story");
    setDeletingFrameId(null);
    setDraggedFrameId(null);
    setDragOverFrameIdx(null);
    setLastRenderExpanded(false);
    if (deletingTimerRef.current) clearTimeout(deletingTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id]);

  // Sync remote → local when the scene's title/prose changes from outside
  // (e.g., the agent edits via a tool).
  useEffect(() => { setLocalTitle(scene.title); }, [scene.title]);
  useEffect(() => { setLocalProse(scene.prose); }, [scene.prose]);
  useEffect(() => { setFrameCount(scene.frames?.length || 4); }, [scene.frames?.length]);

  // Keyboard nav — ←/→ between scenes, Esc closes. Disabled while typing.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft" && onPreviousScene) {
        e.preventDefault();
        onPreviousScene();
      } else if (e.key === "ArrowRight" && onNextScene) {
        e.preventDefault();
        onNextScene();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onPreviousScene, onNextScene, onClose]);

  // ─── Commit helpers (autosave on blur) ───────────────────────────────
  const commitTitle = () => {
    if (localTitle !== scene.title && localTitle.trim()) {
      onSceneUpdate({ ...scene, title: localTitle });
    }
  };
  const commitProse = () => {
    if (localProse !== scene.prose) {
      onSceneUpdate({ ...scene, prose: localProse });
    }
  };

  const participants = entities.filter((e) => scene.participantIds.includes(e.id));
  const location = entities.find((e) => e.id === scene.locationId);

  const FIXABLE_PARTICIPANT_CODES = new Set([
    'scene_mentions_non_participant',
    'event_mentions_non_participant',
    'frame_mentions_non_participant',
  ]);

  const handleFixContinuityIssue = (issue: StoryContinuityIssue) => {
    if (FIXABLE_PARTICIPANT_CODES.has(issue.code)) {
      const merged = Array.from(new Set([...scene.participantIds, ...issue.entityIds]));
      onSceneUpdate({ ...scene, participantIds: merged });
    } else if (issue.code === 'scene_mentions_location_without_grounding' && issue.entityIds[0]) {
      onSceneUpdate({ ...scene, locationId: issue.entityIds[0] });
    }
  };

  const handleFixAllContinuityIssues = () => {
    const issues = scene.storyDiff?.continuityIssues || [];
    let pIds = [...scene.participantIds];
    let locId = scene.locationId;
    for (const issue of issues) {
      if (FIXABLE_PARTICIPANT_CODES.has(issue.code)) {
        pIds = Array.from(new Set([...pIds, ...issue.entityIds]));
      } else if (issue.code === 'scene_mentions_location_without_grounding' && issue.entityIds[0]) {
        locId = issue.entityIds[0];
      }
    }
    onSceneUpdate({ ...scene, participantIds: pIds, locationId: locId });
  };

  const fixableIssueCount = (scene.storyDiff?.continuityIssues || []).filter(
    (i) => FIXABLE_PARTICIPANT_CODES.has(i.code) || i.code === 'scene_mentions_location_without_grounding'
  ).length;

  const handleInsertFrame = (insertAtIndex: number) => {
    const frames = [...(scene.frames || [])];
    const newFrame = {
      id: `frame_${scene.id}_${Date.now()}_insert`,
      position: insertAtIndex,
      title: '',
      description: '',
      shotType: '',
      camera: '',
      mood: '',
    };
    frames.splice(insertAtIndex, 0, newFrame);
    // Re-index positions
    frames.forEach((f, i) => { f.position = i; });
    const updatedScene = { ...scene, frames };
    onSceneUpdate(updatedScene);
    // Auto-chain: generate content (which auto-chains to image generation)
    if (onGenerateSingleFrame) {
      setTimeout(() => onGenerateSingleFrame(updatedScene, newFrame.id), 300);
    }
  };

  const handleDeleteFrame = (frameId: string) => {
    if (deletingFrameId === frameId) {
      // Second click - actually delete
      if (deletingTimerRef.current) clearTimeout(deletingTimerRef.current);
      const frames = (scene.frames || []).filter(f => f.id !== frameId);
      frames.forEach((f, i) => { f.position = i; });
      setDeletingFrameId(null);
      onSceneUpdate({ ...scene, frames });
    } else {
      // First click - enter confirm state
      setDeletingFrameId(frameId);
      if (deletingTimerRef.current) clearTimeout(deletingTimerRef.current);
      deletingTimerRef.current = setTimeout(() => setDeletingFrameId(null), 3000);
    }
  };

  const handleFrameDrop = (targetIdx: number) => {
    if (!draggedFrameId) return;
    const frames = [...(scene.frames || [])];
    const sourceIdx = frames.findIndex(f => f.id === draggedFrameId);
    if (sourceIdx === -1 || sourceIdx === targetIdx) return;
    const [moved] = frames.splice(sourceIdx, 1);
    frames.splice(targetIdx > sourceIdx ? targetIdx - 1 : targetIdx, 0, moved);
    frames.forEach((f, i) => { f.position = i; });
    setDraggedFrameId(null);
    setDragOverFrameIdx(null);
    onSceneUpdate({ ...scene, frames });
  };

  const allFrames = scene.frames || [];
  const persistedScenePrompt = (scene as any).lastImagePrompt as string | undefined;
  const persistedSceneModel = (scene as any).lastImageModel as string | undefined;
  const persistedSceneGeneratedAt = (scene as any).lastImageAt as string | undefined;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-slate-950 flex flex-col"
    >
      {/* TOP BAR — scene strip nav + close. The strip mirrors the frame
          workbench's frame strip: same thumbnail size, same active-state
          treatment. Click a thumbnail to jump scenes. */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-white/10 bg-slate-900/60 flex-shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-amber-400/80 flex-shrink-0">
          <Film className="w-3.5 h-3.5" />
          <span>Scenes</span>
        </div>
        <span className="text-xs text-gray-500 flex-shrink-0">
          Scene {(sceneIndex ?? 0) + 1} of {totalScenes ?? scenes.length}
        </span>

        <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto py-1">
          {scenes.map((s, i) => (
            <button
              key={s.id}
              onClick={() => onJumpToScene?.(s.id)}
              className={cn(
                "relative h-12 aspect-[16/9] flex-shrink-0 rounded overflow-hidden border-2 transition-all",
                s.id === scene.id
                  ? "border-amber-400 ring-2 ring-amber-400/30"
                  : "border-white/10 hover:border-white/30 opacity-70 hover:opacity-100"
              )}
              title={s.title || `Scene ${i + 1}`}
            >
              {s.imageUrl ? (
                <img src={s.imageUrl} alt={s.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                  <Film className="w-4 h-4 text-gray-600" />
                </div>
              )}
              <span className="absolute bottom-0 left-0 text-[9px] px-1 bg-black/70 text-amber-200">{i + 1}</span>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
          title="Close (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* MAIN — left: hero image (top) + frames grid (below). right: tabs. */}
      <div className="flex-1 min-h-0 flex">
        {/* LEFT — scene hero + frames grid */}
        <div className="flex-1 min-w-0 flex flex-col bg-slate-950 overflow-hidden">
          {/* HERO — scene cover image with overlays. Title is overlaid
              on the image with a gradient, like a film poster.  */}
          <div className="relative flex-shrink-0 bg-black border-b border-white/10" style={{ height: "44%" }}>
            {scene.imageUrl ? (
              <button
                type="button"
                onClick={() => openLightbox(scene.imageUrl!, `${scene.title} scene image`)}
                className="block w-full h-full"
              >
                <img
                  src={scene.imageUrl}
                  alt={scene.title}
                  className="w-full h-full object-cover cursor-zoom-in"
                />
              </button>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-gray-600">
                <Film className="w-20 h-20" />
                <span className="text-sm">No cover image yet — render one from the action bar below</span>
              </div>
            )}

            {/* Top-left badges — scene marker, canon status, dirty flags */}
            <div className="absolute top-3 left-3 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] px-2 py-0.5 rounded bg-black/60 text-amber-300 uppercase tracking-wider">
                Scene
              </span>
              {scene.status === "canon" ? (
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 flex items-center gap-1">
                  <Award className="w-2.5 h-2.5" />
                  canon
                </span>
              ) : (
                <button
                  onClick={() => onSceneUpdate({ ...scene, status: "canon" })}
                  className="text-[10px] px-2 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-500/40 hover:bg-amber-500/50 transition-colors flex items-center gap-1"
                  title="Promote this scene from draft to canon"
                >
                  <ChevronUp className="w-2.5 h-2.5" />
                  draft → promote
                </button>
              )}
              {scene.visualDirty && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-500/40"
                  title={scene.visualDirtyReason || "Visual needs refresh"}
                >
                  cover needs refresh
                </span>
              )}
              {(scene.frameVisualDirtyCount || 0) > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30">
                  {scene.frameVisualDirtyCount} frame{(scene.frameVisualDirtyCount || 0) > 1 ? "s" : ""} dirty
                </span>
              )}
            </div>

            {/* Top-right: view full + nav arrows */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              {scene.imageUrl && (
                <button
                  onClick={() => openLightbox(scene.imageUrl!, `${scene.title} scene image`)}
                  className="px-2 py-1 rounded bg-black/60 text-white text-xs hover:bg-black/80"
                >
                  View Full
                </button>
              )}
              <button
                onClick={onPreviousScene}
                disabled={!onPreviousScene}
                className={cn(
                  "p-1.5 rounded bg-black/60 text-white",
                  onPreviousScene ? "hover:bg-black/80" : "opacity-40 cursor-not-allowed"
                )}
                title="Previous scene (←)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={onNextScene}
                disabled={!onNextScene}
                className={cn(
                  "p-1.5 rounded bg-black/60 text-white",
                  onNextScene ? "hover:bg-black/80" : "opacity-40 cursor-not-allowed"
                )}
                title="Next scene (→)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Title overlay at the bottom with gradient. Inline editable. */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-6 pt-12 pb-4 pointer-events-none">
              <input
                type="text"
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                onBlur={commitTitle}
                placeholder="Scene title"
                className="w-full text-2xl font-bold text-white bg-transparent border-b border-transparent focus:border-amber-500/60 outline-none placeholder:text-gray-500 pointer-events-auto"
              />
            </div>

            {/* Generation error banner — shown on hero unless the Render tab
                is already open showing diagnostics. */}
            {frameGenerationError && rightTab !== "render" && (
              <div className="absolute top-14 right-3 max-w-md px-3 py-2 rounded-lg bg-rose-500/30 border border-rose-500/40 text-xs text-rose-100 shadow-2xl">
                {frameGenerationError}
              </div>
            )}

            {/* Camera-angle and image-edit overlays — anchored on the
                hero so the user can compare against the source. */}
            <AnimatePresence>
              {cameraAngleTarget?.type === "scene" && cameraAngleTarget.sceneId === scene.id && onGenerateCameraAngle && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[90%] max-w-xl bg-slate-900/95 rounded-lg border border-white/10 shadow-2xl p-3"
                >
                  <CameraAngleControl
                    sourceImageUrl={cameraAngleTarget.imageUrl}
                    sourceLabel={cameraAngleTarget.label}
                    onGenerate={onGenerateCameraAngle}
                    isGenerating={isGeneratingCameraAngle || false}
                    onClose={() => onCameraAngleTarget?.(null)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {imageEditTarget?.type === "scene" && imageEditTarget.sceneId === scene.id && onApplyImageEdit && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[90%] max-w-xl bg-slate-900/95 rounded-lg border border-white/10 shadow-2xl p-3"
                >
                  <ImageEditControl
                    sourceImageUrl={imageEditTarget.imageUrl}
                    sourceLabel={imageEditTarget.label}
                    onApply={onApplyImageEdit}
                    isApplying={isApplyingImageEdit || false}
                    onClose={() => onImageEditTarget?.(null)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* FRAMES GRID — the main production work surface. Click a frame
              to enter the frame workbench. Drag to reorder. Insert points
              between cards. */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            {/* Header — frame count + add/generate controls */}
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-amber-300 uppercase tracking-wider">Shots</span>
                {allFrames.length > 0 && (
                  <span className="text-[10px] text-gray-500">({allFrames.length})</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleInsertFrame(allFrames.length)}
                  className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 bg-white/5 text-gray-300 hover:bg-amber-500/20 hover:text-amber-300 transition-colors"
                  title="Insert a blank shot at the end (auto-generates content)"
                >
                  <Plus className="w-3 h-3" />
                  Add Shot
                </button>
                <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg bg-white/5 border border-white/10">
                  <span className="text-[10px] text-gray-500">Count</span>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={frameCount}
                    onChange={(e) => setFrameCount(Math.min(Math.max(Number(e.target.value) || 1, 1), 12))}
                    className="w-10 px-1 py-0.5 rounded bg-black/30 text-xs text-gray-200 border border-white/10 focus:outline-none focus:border-amber-500/50"
                  />
                  <button
                    onClick={() => onGenerateFrames(scene, frameCount)}
                    disabled={isGeneratingFrames}
                    className={cn(
                      "px-2 py-0.5 rounded text-[11px] flex items-center gap-1 transition-colors",
                      isGeneratingFrames
                        ? "bg-purple-500/30 text-purple-300 cursor-wait"
                        : "bg-purple-500/20 text-purple-200 hover:bg-purple-500/40"
                    )}
                    title="(Re)generate the entire shot breakdown — destructive: replaces all current shots"
                  >
                    {isGeneratingFrames ? <Loader className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                    {isGeneratingFrames ? "Generating" : "Generate"}
                  </button>
                </div>
              </div>
            </div>

            {batchImageProgress && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 mb-3">
                <Loader className="w-3 h-3 text-purple-300 animate-spin" />
                <span className="text-xs text-purple-300">
                  Generating images: {batchImageProgress.current}/{batchImageProgress.total}
                </span>
                <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-400 rounded-full transition-all duration-500"
                    style={{ width: `${(batchImageProgress.current / batchImageProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {allFrames.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-white/10 p-8 text-center">
                <Film className="w-10 h-10 text-amber-500/30 mx-auto mb-2" />
                <p className="text-sm text-gray-400 mb-1">No frames yet</p>
                <p className="text-xs text-gray-500 leading-relaxed max-w-md mx-auto">
                  Generate a shot breakdown above to storyboard this scene as individual shots, or add a single blank shot to start.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                {/* Insert-at-start dropzone */}
                <button
                  onClick={() => handleInsertFrame(0)}
                  className="group rounded-xl border-2 border-dashed border-white/10 hover:border-amber-400/60 flex flex-col items-center justify-center gap-1 text-gray-600 hover:text-amber-300 transition-all aspect-video"
                  title="Insert shot at the beginning"
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">Insert at start</span>
                </button>

                {allFrames.map((frame, idx) => {
                  const isGeneratingThis = generatingFrameId === frame.id;
                  const isGeneratingContent = generatingFrameContentId === frame.id;
                  const canGenerateImage = idx === 0 || Boolean(allFrames[idx - 1]?.imageUrl);
                  const frameRefIds = frame.generationRefs || frame.participantIds || scene.participantIds;
                  const frameParticipants = entities.filter(e => frameRefIds?.includes(e.id));

                  return (
                    <div
                      key={frame.id}
                      className={cn(
                        "group relative rounded-xl bg-white/5 border overflow-hidden transition-all",
                        draggedFrameId === frame.id ? "opacity-50 border-cyan-400/50" : "border-white/10 hover:border-amber-400/50",
                        dragOverFrameIdx === idx && "ring-2 ring-cyan-400/40",
                        frame.visualDirty && "border-amber-500/40"
                      )}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", frame.id);
                        setDraggedFrameId(frame.id);
                      }}
                      onDragOver={(e) => {
                        if (!draggedFrameId || draggedFrameId === frame.id) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDragOverFrameIdx(idx);
                      }}
                      onDragLeave={() => {
                        if (dragOverFrameIdx === idx) setDragOverFrameIdx(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleFrameDrop(idx);
                      }}
                      onDragEnd={() => {
                        setDraggedFrameId(null);
                        setDragOverFrameIdx(null);
                      }}
                    >
                      <div
                        className={cn(
                          "aspect-video bg-slate-900/60 flex items-center justify-center relative",
                          onFrameClick && "cursor-pointer"
                        )}
                        onClick={() => onFrameClick?.(scene, frame)}
                      >
                        {frame.imageUrl ? (
                          <img src={frame.imageUrl} alt={frame.title || `Shot ${idx + 1}`} className="w-full h-full object-cover" />
                        ) : (
                          <Film className="w-10 h-10 text-amber-500/20" />
                        )}

                        {/* Shot index badge + drag handle */}
                        <div className="absolute top-2 left-2 flex items-center gap-1.5">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-black/70 text-amber-300 uppercase tracking-wider">
                            S{idx + 1}
                          </span>
                          <span
                            className="p-1 rounded bg-black/40 text-gray-300 cursor-grab active:cursor-grabbing"
                            title="Drag to reorder"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <GripVertical className="w-3 h-3" />
                          </span>
                        </div>

                        {frame.visualDirty && (
                          <span className="absolute top-2 right-10 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/80 text-black uppercase tracking-wider">
                            Dirty
                          </span>
                        )}

                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteFrame(frame.id); }}
                          className={cn(
                            "absolute top-2 right-2 px-1.5 py-0.5 rounded transition-colors text-[10px]",
                            deletingFrameId === frame.id
                              ? "bg-rose-500/80 text-white"
                              : "bg-black/40 text-gray-300 hover:bg-rose-500/60 hover:text-white"
                          )}
                          title={deletingFrameId === frame.id ? "Click again to confirm delete" : "Delete shot"}
                        >
                          {deletingFrameId === frame.id ? (
                            <span className="flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete?</span>
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                        </button>

                        {/* Participant pills bottom-left */}
                        {frameParticipants.length > 0 && (
                          <div className="absolute bottom-2 left-2 flex -space-x-1.5">
                            {frameParticipants.slice(0, 4).map(entity => {
                              const eConfig = entityTypeConfig[entity.type] || entityTypeConfig.character;
                              return (
                                <div
                                  key={entity.id}
                                  className={cn("w-5 h-5 rounded-full overflow-hidden ring-1 ring-slate-900", eConfig.ringColor)}
                                  title={entity.name}
                                >
                                  {entity.referenceImage ? (
                                    <img src={entity.referenceImage} alt={entity.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className={cn("w-full h-full flex items-center justify-center", eConfig.bgColor)}>
                                      <eConfig.icon className={cn("w-3 h-3", eConfig.color)} />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {frameParticipants.length > 4 && (
                              <div className="w-5 h-5 rounded-full bg-slate-800 ring-1 ring-slate-900 flex items-center justify-center">
                                <span className="text-[8px] text-gray-400">+{frameParticipants.length - 4}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Title overlay bottom */}
                        <div className="absolute inset-x-0 bottom-0 px-2 pt-6 pb-1.5 bg-gradient-to-t from-black/85 to-transparent">
                          <span className="text-xs text-white font-medium truncate block drop-shadow">
                            {frame.title || `Shot ${idx + 1}`}
                          </span>
                        </div>
                      </div>

                      <div className="p-2.5 space-y-1.5">
                        {frame.description ? (
                          <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-2">{frame.description}</p>
                        ) : onGenerateSingleFrame ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); onGenerateSingleFrame(scene, frame.id); }}
                            disabled={Boolean(generatingFrameContentId)}
                            className={cn(
                              "w-full px-2 py-1.5 rounded text-[10px] flex items-center justify-center gap-1.5 transition-colors border border-dashed",
                              isGeneratingContent
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-300 cursor-wait"
                                : "bg-white/5 border-white/20 text-gray-500 hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-amber-300"
                            )}
                          >
                            {isGeneratingContent ? (
                              <><Loader className="w-2.5 h-2.5 animate-spin" /> Generating...</>
                            ) : (
                              <><Wand2 className="w-2.5 h-2.5" /> Generate content</>
                            )}
                          </button>
                        ) : (
                          <p className="text-[11px] text-gray-600 italic">Empty frame</p>
                        )}

                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex flex-wrap gap-1 min-w-0">
                            {frame.shotType && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 truncate max-w-[80px]">{frame.shotType}</span>
                            )}
                            {frame.camera && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 truncate max-w-[80px]">{frame.camera}</span>
                            )}
                            {frame.mood && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 truncate max-w-[80px]">{frame.mood}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            {onDuplicateFrame && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onDuplicateFrame(scene, frame.id); }}
                                className="p-1 rounded text-gray-500 hover:bg-white/10 hover:text-blue-300 transition-colors"
                                title="Duplicate shot"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); onGenerateFrameImage(scene, frame, imagePrompt || undefined); }}
                              disabled={isGeneratingThis || !canGenerateImage}
                              className={cn(
                                "p-1 rounded transition-colors",
                                isGeneratingThis
                                  ? "text-purple-300 cursor-wait"
                                  : !canGenerateImage
                                    ? "text-gray-600 cursor-not-allowed"
                                    : "text-gray-500 hover:bg-white/10 hover:text-purple-300"
                              )}
                              title={
                                !canGenerateImage
                                  ? `Render shot ${idx} first (continuity chain)`
                                  : "Render this shot's image"
                              }
                            >
                              {isGeneratingThis
                                ? <Loader className="w-3 h-3 animate-spin" />
                                : !canGenerateImage
                                  ? <AlertTriangle className="w-3 h-3" />
                                  : <ImageIcon className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Insert-after button on right edge — appears on hover */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleInsertFrame(idx + 1); }}
                        className="absolute top-1/2 -right-2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full bg-amber-500/90 text-black hover:bg-amber-400 shadow-lg"
                        title={
                          idx < allFrames.length - 1 && frame.imageUrl && allFrames[idx + 1]?.imageUrl
                            ? "Insert shot (may affect visual continuity)"
                            : "Insert shot after"
                        }
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}

                {/* Add-frame card at end of grid */}
                <button
                  onClick={() => handleInsertFrame(allFrames.length)}
                  className="group rounded-xl border-2 border-dashed border-white/10 hover:border-amber-400/60 flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-amber-300 transition-all aspect-video"
                >
                  <Plus className="w-6 h-6" />
                  <span className="text-[10px]">Add Shot</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — tabbed metadata panel. Everything inline-editable; commit
            on blur. Tabs: Story / Continuity / Render. */}
        <div className="w-[420px] flex-shrink-0 border-l border-white/10 bg-slate-950 flex flex-col">
          <div className="flex border-b border-white/10 flex-shrink-0 bg-slate-900/40">
            {([
              { id: "story" as const, label: "Story", count: undefined as number | undefined },
              { id: "continuity" as const, label: "Continuity", count: scene.storyDiff?.issueCount || 0 },
              { id: "render" as const, label: "Render", count: undefined as number | undefined },
            ]).map(({ id, label, count }) => (
              <button
                key={id}
                onClick={() => setRightTab(id)}
                className={cn(
                  "flex-1 px-3 py-2.5 text-xs uppercase tracking-wider transition-colors border-b-2",
                  rightTab === id
                    ? "text-amber-300 border-amber-400 bg-slate-900/40"
                    : "text-gray-500 border-transparent hover:text-gray-300"
                )}
              >
                {label}
                {typeof count === "number" && count > 0 && (
                  <span className={cn(
                    "ml-1.5 inline-flex items-center justify-center text-[9px] px-1.5 rounded",
                    rightTab === id ? "bg-amber-500/30 text-amber-100" : "bg-rose-500/30 text-rose-300"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {rightTab === "story" && (
              <>
                <div>
                  <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-1 block">
                    Image notes (this render only)
                  </label>
                  <textarea
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    rows={3}
                    placeholder="Optional one-off visual notes — appended to the scene-derived prompt for the cover or frame render. Leave empty to use the scene prose verbatim."
                    className="w-full px-3 py-2 text-xs rounded bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none leading-relaxed"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-1 block">Prose</label>
                  <textarea
                    value={localProse}
                    onChange={(e) => setLocalProse(e.target.value)}
                    onBlur={commitProse}
                    rows={12}
                    placeholder="The story prose for this scene. The AI uses this when composing image prompts and breaking the scene into frames."
                    className="w-full px-3 py-2 text-xs rounded bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none leading-relaxed"
                  />
                </div>

                {scene.events && scene.events.length > 0 && (
                  <div>
                    <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-2 block">Events</label>
                    <div className="flex flex-wrap gap-1.5">
                      {scene.events.map((event, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[11px]">
                          {event}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] uppercase text-gray-500 tracking-wider">
                      Participants ({participants.length})
                    </label>
                    {projectId && (
                      <button
                        onClick={() => setSceneRefPickerOpen(true)}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-white/5 text-gray-400 hover:bg-purple-500/20 hover:text-purple-300 transition-colors"
                        title="Browse the asset library"
                      >
                        <ImageIcon className="w-2.5 h-2.5" /> Gallery
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {participants.map((entity) => {
                      const pConfig = entityTypeConfig[entity.type] || entityTypeConfig.character;
                      const PIcon = pConfig.icon;
                      return (
                        <div key={entity.id} className="group flex items-center gap-2 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                          <button
                            onClick={() => onEntityClick(entity)}
                            className="flex-1 flex items-center gap-2 min-w-0 text-left"
                          >
                            <div className={cn("w-7 h-7 rounded-full overflow-hidden flex-shrink-0 ring-1", pConfig.ringColor)}>
                              {entity.referenceImage ? (
                                <img src={entity.referenceImage} alt={entity.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className={cn("w-full h-full flex items-center justify-center", pConfig.bgColor)}>
                                  <PIcon className={cn("w-3.5 h-3.5", pConfig.color)} />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-xs text-gray-200 group-hover:text-amber-300 transition-colors block truncate">{entity.name}</span>
                              <span className="text-[10px] text-gray-500 capitalize">{entity.type}</span>
                            </div>
                          </button>
                          <button
                            onClick={() => onSceneUpdate({ ...scene, participantIds: scene.participantIds.filter(id => id !== entity.id) })}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-rose-300 hover:bg-rose-500/20"
                            title="Remove participant"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                    <AddEntityDropdown
                      entities={entities}
                      excludeIds={scene.participantIds}
                      excludeTypes={LOCATION_TYPES}
                      onSelect={(e) => onSceneUpdate({ ...scene, participantIds: [...scene.participantIds, e.id] })}
                      placeholder="Add participant..."
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-2 block">Location</label>
                  {location ? (
                    <div className="group flex items-center gap-2 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                      <button
                        onClick={() => onEntityClick(location)}
                        className="flex-1 flex items-center gap-2 min-w-0 text-left"
                      >
                        <div className={cn("w-8 h-8 rounded-full overflow-hidden flex-shrink-0 ring-1", entityTypeConfig.location.ringColor)}>
                          {location.referenceImage ? (
                            <img src={location.referenceImage} alt={location.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className={cn("w-full h-full flex items-center justify-center", entityTypeConfig.location.bgColor)}>
                              <MapPin className={cn("w-4 h-4", entityTypeConfig.location.color)} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-gray-200 group-hover:text-purple-300 transition-colors block truncate">{location.name}</span>
                          {location.description && (
                            <span className="text-[10px] text-gray-500 line-clamp-1">{location.description}</span>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => onSceneUpdate({ ...scene, locationId: undefined })}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-rose-300 hover:bg-rose-500/20"
                        title="Clear location"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <AddEntityDropdown
                      entities={entities}
                      excludeIds={[]}
                      filterToTypes={LOCATION_TYPES}
                      onSelect={(e) => onSceneUpdate({ ...scene, locationId: e.id })}
                      placeholder="Set location..."
                    />
                  )}
                </div>

                {/* Linked storyboards — pages generated from this scene's
                    prose. Click to open in the Storyboard phase. The
                    "Storyboard" action in the bottom bar produces these. */}
                {storyboards && (() => {
                  const linked = storyboards.filter((sb) => (sb as any).content?.sceneId === scene.id);
                  if (linked.length === 0) {
                    return (
                      <div className="rounded-lg border border-dashed border-white/10 px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <LayoutGrid className="w-3 h-3 text-cyan-300/70" />
                          <span className="text-[10px] uppercase text-gray-500 tracking-wider">Storyboards</span>
                        </div>
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                          No storyboards yet for this scene. Click <span className="text-cyan-300">Storyboard</span> in the action bar to generate a multi-panel page from this scene's prose.
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <LayoutGrid className="w-3 h-3 text-cyan-300" />
                        <span className="text-[10px] uppercase text-gray-500 tracking-wider">Linked storyboards ({linked.length})</span>
                      </div>
                      <div className="space-y-1.5">
                        {linked.map((sb) => (
                          <button
                            key={sb.id}
                            onClick={() => onOpenStoryboard?.(sb.id)}
                            disabled={!onOpenStoryboard}
                            className="w-full group flex items-center gap-2 p-1.5 rounded-lg bg-cyan-500/5 hover:bg-cyan-500/15 border border-cyan-500/20 transition-colors text-left"
                          >
                            <div className="w-12 h-12 rounded overflow-hidden flex-shrink-0 bg-black">
                              {sb.primaryImage?.url ? (
                                <img src={sb.primaryImage.url} alt={sb.title} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <LayoutGrid className="w-4 h-4 text-cyan-500/40" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-xs text-gray-200 group-hover:text-cyan-200 transition-colors block truncate">{sb.title}</span>
                              <span className="text-[10px] text-gray-500">
                                {sb.content?.panelCount || 0} panels · {sb.content?.backend || "?"}
                              </span>
                            </div>
                            <ArrowRight className="w-3 h-3 text-gray-500 group-hover:text-cyan-300" />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {projectId && (
                  <ReferencePickerModal
                    projectId={projectId}
                    open={sceneRefPickerOpen}
                    onClose={() => setSceneRefPickerOpen(false)}
                    onSelect={(selections) => {
                      const newIds = selections
                        .filter(s => s.type === 'entity' && s.entityId)
                        .map(s => s.entityId!)
                        .filter(id => !scene.participantIds.includes(id));
                      if (newIds.length > 0) {
                        const uniqueIds = Array.from(new Set([...scene.participantIds, ...newIds]));
                        onSceneUpdate({ ...scene, participantIds: uniqueIds });
                      }
                    }}
                    filterTypes={['entity']}
                    title="Add Participants"
                  />
                )}
              </>
            )}

            {rightTab === "continuity" && (
              <>
                {(scene.visualDirty || scene.frameImagesDirty || (scene.frameVisualDirtyCount || 0) > 0) && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                    <p className="text-xs text-amber-200 leading-relaxed">
                      Visual continuity needs refresh:
                      {scene.visualDirty ? " scene cover is out of date." : ""}
                      {(scene.frameVisualDirtyCount || 0) > 0 ? ` ${scene.frameVisualDirtyCount} frame image${(scene.frameVisualDirtyCount || 0) > 1 ? "s are" : " is"} out of date.` : ""}
                    </p>
                    {scene.visualDirtyReason && (
                      <p className="text-[11px] text-amber-100/80 mt-1">{scene.visualDirtyReason}</p>
                    )}
                    {scene.visualDirtyEntityNames && scene.visualDirtyEntityNames.length > 0 && (
                      <p className="text-[11px] text-amber-100/80 mt-1">
                        Affected by: {scene.visualDirtyEntityNames.join(", ")}
                      </p>
                    )}
                  </div>
                )}

                {scene.storyDiff ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-2 block">Story diff</label>
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300">
                          +{scene.storyDiff.entityAdds.length} enters
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-500/20 text-slate-300">
                          -{scene.storyDiff.entityRemoves.length} exits
                        </span>
                        <span className={cn(
                          "px-2 py-0.5 rounded",
                          scene.storyDiff.issueCount > 0 ? "bg-rose-500/20 text-rose-300" : "bg-green-500/10 text-green-300"
                        )}>
                          {scene.storyDiff.issueCount} continuity issues
                        </span>
                      </div>
                      {scene.storyDiff.locationChange && (
                        <p className="text-[11px] text-gray-400 mt-2">
                          Location shift: {scene.storyDiff.locationChange.from || "Unspecified"} → {scene.storyDiff.locationChange.to || "Unspecified"}
                        </p>
                      )}
                    </div>

                    {scene.storyDiff.continuityIssues && scene.storyDiff.continuityIssues.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[10px] uppercase text-gray-500 tracking-wider">Continuity issues</label>
                          {fixableIssueCount >= 2 && (
                            <button
                              onClick={handleFixAllContinuityIssues}
                              className="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors flex items-center gap-1"
                            >
                              <Wrench className="w-2.5 h-2.5" />
                              Fix All
                            </button>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {scene.storyDiff.continuityIssues.map((issue) => {
                            const isFixable = FIXABLE_PARTICIPANT_CODES.has(issue.code) || issue.code === "scene_mentions_location_without_grounding";
                            return (
                              <div key={issue.id} className="flex items-start gap-2 px-2 py-1.5 rounded bg-rose-500/5 border border-rose-500/20">
                                <p className="text-[11px] text-rose-200/90 leading-relaxed flex-1">{issue.message}</p>
                                {isFixable && (
                                  <button
                                    onClick={() => handleFixContinuityIssue(issue)}
                                    className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors flex items-center gap-1"
                                  >
                                    <Wrench className="w-2.5 h-2.5" />
                                    Fix
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 leading-relaxed">
                    No continuity diff computed for this scene yet. Diff is created when the scene is processed by the AI extraction pipeline.
                  </p>
                )}
              </>
            )}

            {rightTab === "render" && (
              <>
                {frameGenerationError && (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 mb-2">
                    <p className="text-xs text-rose-200 leading-relaxed">{frameGenerationError}</p>
                  </div>
                )}

                {generationDiagnostics ? (
                  <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="text-cyan-200 font-medium">Last reference grounding</span>
                      <span className="px-1.5 py-0.5 rounded bg-black/25 text-cyan-100">
                        {generationDiagnostics.referenceCount} refs
                      </span>
                      <span className="text-cyan-100/80">
                        {new Date(generationDiagnostics.generatedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    {generationDiagnostics.submittedReferences?.counts && (
                      <p className="text-[11px] text-cyan-100/80 leading-relaxed">
                        Submitted: {generationDiagnostics.submittedReferences.counts.characters} char,{" "}
                        {generationDiagnostics.submittedReferences.counts.objects} obj,{" "}
                        {generationDiagnostics.submittedReferences.counts.locations} loc,{" "}
                        {generationDiagnostics.submittedReferences.counts.previousShots} prev
                        {generationDiagnostics.submittedReferences.budgets
                          ? ` (budgets: c${generationDiagnostics.submittedReferences.budgets.characters}/o${generationDiagnostics.submittedReferences.budgets.objects})`
                          : ""}
                      </p>
                    )}
                    {generationDiagnostics.actualReferencesUsed?.counts && (
                      <p className="text-[11px] text-cyan-100/80 leading-relaxed">
                        Actual: {generationDiagnostics.actualReferencesUsed.counts.character || 0} char,{" "}
                        {generationDiagnostics.actualReferencesUsed.counts.object || 0} obj,{" "}
                        {generationDiagnostics.actualReferencesUsed.counts.location || 0} loc,{" "}
                        {generationDiagnostics.actualReferencesUsed.counts.previous_shot || 0} prev
                      </p>
                    )}
                    {generationDiagnostics.model && (
                      <p className="text-[11px] text-cyan-100/75">Model: {generationDiagnostics.model}</p>
                    )}
                    {generationDiagnostics.unresolvedParticipantNames.length > 0 ? (
                      <p className="text-[11px] text-rose-200">
                        Missing participant refs: {generationDiagnostics.unresolvedParticipantNames.join(", ")}
                      </p>
                    ) : (
                      <p className="text-[11px] text-emerald-200">All participant references resolved.</p>
                    )}
                    {generationDiagnostics.locationResolved === false && generationDiagnostics.locationName && (
                      <p className="text-[11px] text-amber-200">
                        Location reference missing: {generationDiagnostics.locationName}
                      </p>
                    )}
                    {generationDiagnostics.identityRepair && (
                      <p
                        className={`text-[11px] ${
                          generationDiagnostics.identityRepair.failed ? "text-amber-200" : "text-cyan-100/75"
                        }`}
                      >
                        Identity repair: {generationDiagnostics.identityRepair.appliedPasses ?? 0}/
                        {generationDiagnostics.identityRepair.requestedPasses ?? 0} pass(es)
                        {generationDiagnostics.identityRepair.failed
                          ? ` (failed: ${generationDiagnostics.identityRepair.error || "unknown"})`
                          : ""}
                      </p>
                    )}
                    {generationDiagnostics.diagnostics?.participants?.some(
                      (e) => e.resolved && e.includedInRequest === false
                    ) && (
                      <p className="text-[11px] text-amber-200">
                        Dropped (budget exceeded):{" "}
                        {generationDiagnostics.diagnostics.participants
                          .filter((e) => e.resolved && e.includedInRequest === false)
                          .map((e) => e.name)
                          .join(", ")}
                      </p>
                    )}
                    {generationDiagnostics.promptPreview && (
                      <details className="text-[11px] text-cyan-100/85">
                        <summary className="cursor-pointer select-none hover:text-cyan-100 mt-1">
                          Prompt preview{generationDiagnostics.promptLength ? ` (${generationDiagnostics.promptLength} chars)` : ""}
                        </summary>
                        <pre className="mt-1 max-h-52 overflow-y-auto leading-relaxed whitespace-pre-wrap break-words text-cyan-100/75 bg-black/30 rounded p-2">
                          {generationDiagnostics.promptPreview}
                        </pre>
                      </details>
                    )}
                  </div>
                ) : persistedScenePrompt ? (
                  <div>
                    <button
                      onClick={() => setLastRenderExpanded((v) => !v)}
                      className="w-full flex items-center justify-between text-[10px] uppercase tracking-wider text-gray-500 hover:text-gray-300 mb-2"
                    >
                      <span>Last render diagnostics</span>
                      {lastRenderExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    <div className="flex items-center gap-2 flex-wrap text-[11px] mb-2">
                      {persistedSceneModel && (
                        <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/20">
                          {persistedSceneModel}
                        </span>
                      )}
                      {persistedSceneGeneratedAt && (
                        <span className="text-gray-500">{new Date(persistedSceneGeneratedAt).toLocaleString()}</span>
                      )}
                    </div>
                    {lastRenderExpanded && (
                      <pre className="rounded bg-black/40 border border-white/5 p-2 text-[10px] text-gray-300 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                        {persistedScenePrompt}
                      </pre>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 leading-relaxed">
                    No render diagnostics yet. Render the scene cover or generate frames to populate.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM ACTION BAR — discrete buttons. Each one has a clear single
          purpose and a tooltip explaining when to use it. */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-white/10 bg-slate-900/60 flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onGenerateImage(scene, imagePrompt || undefined)}
            disabled={isGeneratingImage}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors",
              isGeneratingImage
                ? "bg-purple-500/30 text-purple-200 border-purple-500/40 cursor-wait"
                : "bg-amber-500/20 text-amber-200 border-amber-500/30 hover:bg-amber-500/30"
            )}
            title="Render the scene cover image from its prose (plus optional Image notes from the Story tab)"
          >
            {isGeneratingImage ? <Loader className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
            {isGeneratingImage ? "Rendering..." : scene.imageUrl ? "Re-render cover" : "Render cover"}
          </button>

          <button
            onClick={() => onGenerateFrames(scene, frameCount)}
            disabled={isGeneratingFrames}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors",
              isGeneratingFrames
                ? "bg-purple-500/30 text-purple-200 border-purple-500/40 cursor-wait"
                : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10"
            )}
            title="(Re)generate the entire shot breakdown — destructive; replaces all shots with new ones"
          >
            {isGeneratingFrames ? <Loader className="w-3 h-3 animate-spin" /> : <Layers className="w-3 h-3" />}
            {isGeneratingFrames ? "Generating shots..." : "Generate shots"}
          </button>

          {scene.imageUrl && onCameraAngleTarget && (
            <button
              onClick={() => { onImageEditTarget?.(null); onCameraAngleTarget({
                type: "scene",
                sceneId: scene.id,
                imageUrl: scene.imageUrl!,
                label: scene.title,
                participantIds: scene.participantIds,
                locationId: scene.locationId,
                prose: scene.prose,
                frames: scene.frames,
                title: scene.title,
              }); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10"
              title="Re-render the scene from a different camera angle (preserves identity)"
            >
              <Camera className="w-3 h-3" />
              Angle
            </button>
          )}

          {scene.imageUrl && onImageEditTarget && (
            <button
              onClick={() => { onCameraAngleTarget?.(null); onImageEditTarget({
                type: "scene",
                sceneId: scene.id,
                imageUrl: scene.imageUrl!,
                label: scene.title,
              }); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10"
              title="Edit the existing cover image with a natural-language instruction"
            >
              <PenLine className="w-3 h-3" />
              Edit image
            </button>
          )}

          {onGenerateStoryboardForScene && (
            <button
              onClick={() => onGenerateStoryboardForScene(scene)}
              disabled={isGeneratingStoryboardForScene || !scene.prose?.trim()}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors",
                isGeneratingStoryboardForScene
                  ? "bg-cyan-500/30 text-cyan-200 border-cyan-500/40 cursor-wait"
                  : !scene.prose?.trim()
                    ? "bg-white/5 text-gray-500 border-white/5 cursor-not-allowed"
                    : "bg-cyan-500/15 text-cyan-200 border-cyan-500/30 hover:bg-cyan-500/25"
              )}
              title={
                !scene.prose?.trim()
                  ? "Write some scene prose first — the storyboard is generated from it"
                  : "Generate a multi-panel storyboard page from this scene's prose. Opens the Storyboard phase."
              }
            >
              {isGeneratingStoryboardForScene ? <Loader className="w-3 h-3 animate-spin" /> : <LayoutGrid className="w-3 h-3" />}
              {isGeneratingStoryboardForScene ? "Storyboarding..." : "Storyboard"}
            </button>
          )}
        </div>

        <button
          onClick={() => onDiscuss(scene)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25"
          title="Focus this scene in the chat for collaborative work"
        >
          <MessageSquare className="w-3 h-3" />
          Discuss in chat
        </button>
      </div>
    </motion.div>
  );
}

// =============================================================================
// PROMPT DEBUG VIEW — shows last generation prompt for debugging
// =============================================================================

function PromptDebugView({ prompt, model, generatedAt }: { prompt: string; model?: string; generatedAt?: string }) {
  const [expanded, setExpanded] = useState(false);
  const previewLength = 120;
  const preview = prompt.length > previewLength ? prompt.slice(0, previewLength) + '…' : prompt;
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-left group"
      >
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Last Prompt</span>
        <span className="flex items-center gap-2">
          {model && <span className="text-[9px] text-gray-600 font-mono">{model}</span>}
          {generatedAt && <span className="text-[9px] text-gray-600">{new Date(generatedAt).toLocaleString()}</span>}
          <ChevronDown className={cn("w-3 h-3 text-gray-600 transition-transform", expanded && "rotate-180")} />
        </span>
      </button>
      {expanded ? (
        <div className="px-3 pb-3">
          <pre className="text-[10px] text-gray-400 leading-relaxed whitespace-pre-wrap font-mono bg-black/30 rounded-lg p-3 max-h-[400px] overflow-y-auto select-all">{prompt}</pre>
        </div>
      ) : (
        <div className="px-3 pb-2">
          <p className="text-[10px] text-gray-600 font-mono truncate">{preview}</p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// FRAME DETAIL VIEW
// =============================================================================

function FrameDetailView({
  scene,
  frame,
  frameIndex,
  totalFrames,
  onClose,
  onBackToScene,
  onPreviousFrame,
  onNextFrame,
  onJumpToFrame,
  onFrameFieldUpdate,
  onFrameDelete,
  onGenerateFrameImage,
  generatingFrameId,
  frameGenerationError,
  cameraAngleTarget,
  onCameraAngleTarget,
  onGenerateCameraAngle,
  isGeneratingCameraAngle,
  onGenerateSingleFrame,
  generatingFrameContentId,
  onDuplicateFrame,
  imageEditTarget,
  onImageEditTarget,
  onApplyImageEdit,
  isApplyingImageEdit,
  onOpenStoryboard,
  onGenerateVariant,
  onPromoteVariant,
  onDeleteVariant,
  generatingVariantShotId,
}: {
  scene: Scene;
  frame: SceneFrame;
  frameIndex: number;
  totalFrames: number;
  onClose: () => void;
  onBackToScene: () => void;
  onPreviousFrame?: () => void;
  onNextFrame?: () => void;
  onJumpToFrame?: (frameId: string) => void;
  onFrameFieldUpdate: (scene: Scene, frameId: string, updates: Partial<SceneFrame>) => void;
  onFrameDelete: (scene: Scene, frameId: string) => void;
  onGenerateFrameImage: (scene: Scene, frame: SceneFrame, prompt?: string) => void;
  generatingFrameId?: string | null;
  frameGenerationError?: string | null;
  cameraAngleTarget?: CameraAngleTarget | null;
  onCameraAngleTarget?: (target: CameraAngleTarget | null) => void;
  onGenerateCameraAngle?: (cameraDescription: string) => void;
  isGeneratingCameraAngle?: boolean;
  onGenerateSingleFrame?: (scene: Scene, frameId: string, guidance?: string) => void;
  generatingFrameContentId?: string | null;
  onDuplicateFrame?: (scene: Scene, frameId: string) => void;
  imageEditTarget?: CameraAngleTarget | null;
  onImageEditTarget?: (target: CameraAngleTarget | null) => void;
  onApplyImageEdit?: (editInstruction: string) => void;
  isApplyingImageEdit?: boolean;
  /** Jump to the source storyboard page in the Storyboard phase. */
  onOpenStoryboard?: (storyboardId: string) => void;
  /** Alternate-take (variant) handlers — same as the timeline clip inspector. */
  onGenerateVariant?: (scene: Scene, frame: SceneFrame) => void;
  onPromoteVariant?: (scene: Scene, frame: SceneFrame, variantId: string) => void;
  onDeleteVariant?: (scene: Scene, frame: SceneFrame, variantId: string) => void;
  generatingVariantShotId?: string | null;
}) {
  // Canonical image prompt — initialized from frame.imagePrompt (the
  // user-facing source of truth). Edits autosave to the frame via update.
  const [localImagePrompt, setLocalImagePrompt] = useState(frame.imagePrompt || "");
  // Local in-memory copies of editable fields. We commit on blur to avoid
  // remote-update lag while the user types.
  const [localTitle, setLocalTitle] = useState(frame.title || "");
  const [localDescription, setLocalDescription] = useState(frame.description || "");
  const [localShotType, setLocalShotType] = useState(frame.shotType || "");
  const [localCamera, setLocalCamera] = useState(frame.camera || "");
  const [localMood, setLocalMood] = useState(frame.mood || "");
  const [localCaption, setLocalCaption] = useState(frame.caption || "");
  const [localDialogue, setLocalDialogue] = useState((frame.dialogue || []).join("\n"));
  const [localSfx, setLocalSfx] = useState((frame.sfx || []).join(", "));
  // UI state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [metadataExpanded, setMetadataExpanded] = useState(false);
  const [lastRenderExpanded, setLastRenderExpanded] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { openLightbox } = useLightbox();

  // Sync local state when the focused frame changes (jumping between frames).
  useEffect(() => {
    setLocalImagePrompt(frame.imagePrompt || "");
    setLocalTitle(frame.title || "");
    setLocalDescription(frame.description || "");
    setLocalShotType(frame.shotType || "");
    setLocalCamera(frame.camera || "");
    setLocalMood(frame.mood || "");
    setLocalCaption(frame.caption || "");
    setLocalDialogue((frame.dialogue || []).join("\n"));
    setLocalSfx((frame.sfx || []).join(", "));
    setConfirmDelete(false);
    setMetadataExpanded(false);
    setLastRenderExpanded(false);
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
  }, [frame.id]);

  // Keyboard nav — ←/→ jump frames, Esc closes. Disabled while focus is in
  // a text input/textarea so typing isn't hijacked.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft" && onPreviousFrame) {
        e.preventDefault();
        onPreviousFrame();
      } else if (e.key === "ArrowRight" && onNextFrame) {
        e.preventDefault();
        onNextFrame();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onPreviousFrame, onNextFrame, onClose]);

  // Persist a single field if it has actually changed
  const commit = (patch: Partial<SceneFrame>) => onFrameFieldUpdate(scene, frame.id, patch);
  const commitTitle = () => { if (localTitle !== (frame.title || "")) commit({ title: localTitle }); };
  const commitDescription = () => { if (localDescription !== (frame.description || "")) commit({ description: localDescription }); };
  const commitImagePrompt = () => { if (localImagePrompt !== (frame.imagePrompt || "")) commit({ imagePrompt: localImagePrompt }); };
  const commitShotType = () => { if (localShotType !== (frame.shotType || "")) commit({ shotType: localShotType }); };
  const commitCamera = () => { if (localCamera !== (frame.camera || "")) commit({ camera: localCamera }); };
  const commitMood = () => { if (localMood !== (frame.mood || "")) commit({ mood: localMood }); };
  const commitCaption = () => { if (localCaption !== (frame.caption || "")) commit({ caption: localCaption }); };
  const commitDialogue = () => {
    const next = localDialogue.split("\n").map((l) => l.trim()).filter(Boolean);
    if (JSON.stringify(next) !== JSON.stringify(frame.dialogue || [])) commit({ dialogue: next });
  };
  const commitSfx = () => {
    const next = localSfx.split(",").map((s) => s.trim()).filter(Boolean);
    if (JSON.stringify(next) !== JSON.stringify(frame.sfx || [])) commit({ sfx: next });
  };

  const handleDeleteClick = () => {
    if (confirmDelete) {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      onFrameDelete(scene, frame.id);
    } else {
      setConfirmDelete(true);
      deleteTimerRef.current = setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  const canGeneratePrev = frameIndex === 0 || Boolean(scene.frames?.[frameIndex - 1]?.imageUrl);
  const isGeneratingImage = generatingFrameId === frame.id;
  const isGeneratingContent = generatingFrameContentId === frame.id;
  const allFrames = scene.frames || [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-slate-950 flex flex-col"
    >
      {/* TOP BAR — scene title + frame thumbnail strip + close. Strip
          replaces the prev/next-only nav so the user has constant context. */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-white/10 bg-slate-900/60 flex-shrink-0">
        <button
          onClick={onBackToScene}
          className="flex items-center gap-1.5 text-xs text-amber-400/80 hover:text-amber-400 transition-colors flex-shrink-0"
          title="Back to scene view"
        >
          <ArrowRight className="w-3.5 h-3.5 rotate-180" />
          <span>{scene.title}</span>
        </button>
        <span className="text-xs text-gray-500 flex-shrink-0">Shot {frameIndex + 1} of {totalFrames}</span>

        {/* Frame strip — horizontal thumbnails of all frames in this scene */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto py-1">
          {allFrames.map((f, i) => (
            <button
              key={f.id}
              onClick={() => onJumpToFrame?.(f.id)}
              className={cn(
                "relative h-12 aspect-[16/9] flex-shrink-0 rounded overflow-hidden border-2 transition-all",
                f.id === frame.id ? "border-amber-400 ring-2 ring-amber-400/30" : "border-white/10 hover:border-white/30 opacity-70 hover:opacity-100"
              )}
              title={f.title || `Shot ${i + 1}`}
            >
              {f.imageUrl ? (
                <img src={f.imageUrl} alt={f.title || `Shot ${i + 1}`} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                  <Film className="w-4 h-4 text-gray-600" />
                </div>
              )}
              <span className="absolute bottom-0 left-0 text-[9px] px-1 bg-black/70 text-amber-200">{i + 1}</span>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
          title="Close (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* MAIN — left: image (~60%), right: editable metadata panel (~40%) */}
      <div className="flex-1 min-h-0 flex">
        {/* LEFT — image area */}
        <div className="flex-1 min-w-0 relative bg-black flex items-center justify-center">
          {frame.imageUrl ? (
            <img
              src={frame.imageUrl}
              alt={frame.title || `Shot ${frameIndex + 1}`}
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-gray-600">
              <Film className="w-20 h-20" />
              <span className="text-sm">No image yet</span>
            </div>
          )}

          {/* Top-left badge */}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded bg-black/60 text-amber-300 uppercase tracking-wider">
              Shot {frameIndex + 1}
            </span>
            {frame.sourceStoryboardId && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                from storyboard
              </span>
            )}
            {frame.visualDirty && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-500/40" title={frame.visualDirtyReason || "Visual needs refresh"}>
                needs refresh
              </span>
            )}
          </div>

          {/* Top-right: view full + nav arrows */}
          <div className="absolute top-3 right-3 flex items-center gap-2">
            {frame.imageUrl && (
              <button
                onClick={() => openLightbox(frame.imageUrl!, frame.title || `Shot ${frameIndex + 1}`)}
                className="px-2 py-1 rounded bg-black/60 text-white text-xs hover:bg-black/80"
              >
                View Full
              </button>
            )}
            <button
              onClick={onPreviousFrame}
              disabled={!onPreviousFrame}
              className={cn(
                "p-1.5 rounded bg-black/60 text-white",
                onPreviousFrame ? "hover:bg-black/80" : "opacity-40 cursor-not-allowed"
              )}
              title="Previous shot (←)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={onNextFrame}
              disabled={!onNextFrame}
              className={cn(
                "p-1.5 rounded bg-black/60 text-white",
                onNextFrame ? "hover:bg-black/80" : "opacity-40 cursor-not-allowed"
              )}
              title="Next shot (→)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Bottom-center: first → last keyframes for image-to-video. Shown
              when the shot has them (generate_shot_keyframes). The shot's main
              image stays the representative still; these are the motion
              endpoints a video model interpolates between. */}
          {(frame.firstFrame?.url || frame.lastFrame?.url) && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded-lg p-2 border border-white/10">
              <span className="text-[10px] uppercase tracking-wider text-cyan-300/80 px-1">Keyframes</span>
              {frame.firstFrame?.url && (
                <button
                  onClick={() => openLightbox(frame.firstFrame!.url, `${frame.title || "Shot"} — first frame`)}
                  className="relative rounded overflow-hidden border border-white/20 hover:border-cyan-400/60"
                  title="First frame — motion start"
                >
                  <img src={frame.firstFrame.url} alt="first frame" className="h-16 w-auto object-cover" />
                  <span className="absolute bottom-0 inset-x-0 text-[9px] text-center bg-black/70 text-cyan-200">first</span>
                </button>
              )}
              <span className="text-cyan-400/60 text-sm">→</span>
              {frame.lastFrame?.url ? (
                <button
                  onClick={() => openLightbox(frame.lastFrame!.url, `${frame.title || "Shot"} — last frame`)}
                  className="relative rounded overflow-hidden border border-white/20 hover:border-cyan-400/60"
                  title="Last frame — motion end"
                >
                  <img src={frame.lastFrame.url} alt="last frame" className="h-16 w-auto object-cover" />
                  <span className="absolute bottom-0 inset-x-0 text-[9px] text-center bg-black/70 text-cyan-200">last</span>
                </button>
              ) : (
                <span className="text-[10px] text-gray-500 px-2">last pending</span>
              )}
            </div>
          )}

          {/* Bottom-left: storyboard source thumbnail if extracted. Click
              to jump to the Storyboard phase and open the source page. */}
          {frame.sourceStoryboardImageUrl && (
            <button
              onClick={() => { if (frame.sourceStoryboardId && onOpenStoryboard) onOpenStoryboard(frame.sourceStoryboardId); }}
              disabled={!frame.sourceStoryboardId || !onOpenStoryboard}
              className={cn(
                "absolute bottom-3 left-3 flex items-center gap-2 bg-black/70 rounded-lg p-1.5 border border-cyan-500/30 transition-colors",
                frame.sourceStoryboardId && onOpenStoryboard ? "hover:bg-black/90 hover:border-cyan-400/60 cursor-pointer" : "cursor-default"
              )}
              title={frame.sourceStoryboardId && onOpenStoryboard ? "Jump to source storyboard page" : "Storyboard panel reference"}
            >
              <img src={frame.sourceStoryboardImageUrl} alt="Source storyboard" className="h-12 w-auto rounded" />
              <div className="pr-2 text-[10px] text-cyan-200 text-left">
                <div>Storyboard panel {typeof frame.sourceStoryboardPanelIndex === "number" ? frame.sourceStoryboardPanelIndex + 1 : "?"}</div>
                {frame.sourceStoryboardId && onOpenStoryboard && (
                  <div className="text-cyan-300/70 flex items-center gap-0.5 mt-0.5">
                    <ArrowRight className="w-2.5 h-2.5" />
                    open page
                  </div>
                )}
              </div>
            </button>
          )}

          {/* Generation error banner overlay */}
          {frameGenerationError && (
            <div className="absolute bottom-3 right-3 max-w-md px-3 py-2 rounded-lg bg-rose-500/20 border border-rose-500/40 text-xs text-rose-200">
              {frameGenerationError}
            </div>
          )}

          {/* Camera / Edit overlay panels — kept inline within the image area */}
          <AnimatePresence>
            {cameraAngleTarget?.type === "frame" && cameraAngleTarget.sceneId === scene.id && cameraAngleTarget.frameId === frame.id && onGenerateCameraAngle && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[90%] max-w-xl bg-slate-900/95 rounded-lg border border-white/10 shadow-2xl p-3"
              >
                <CameraAngleControl
                  sourceImageUrl={cameraAngleTarget.imageUrl}
                  sourceLabel={cameraAngleTarget.label}
                  onGenerate={onGenerateCameraAngle}
                  isGenerating={isGeneratingCameraAngle || false}
                  onClose={() => onCameraAngleTarget?.(null)}
                />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {imageEditTarget?.type === "frame" && imageEditTarget.sceneId === scene.id && imageEditTarget.frameId === frame.id && onApplyImageEdit && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[90%] max-w-xl bg-slate-900/95 rounded-lg border border-white/10 shadow-2xl p-3"
              >
                <ImageEditControl
                  sourceImageUrl={imageEditTarget.imageUrl}
                  sourceLabel={imageEditTarget.label}
                  onApply={onApplyImageEdit}
                  isApplying={isApplyingImageEdit || false}
                  onClose={() => onImageEditTarget?.(null)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* RIGHT — editable metadata panel. Everything is inline-editable; no
            click-to-edit dance. Commit on blur. */}
        <div className="w-[420px] flex-shrink-0 border-l border-white/10 bg-slate-950 overflow-y-auto">
          <div className="p-5 space-y-4">
            {/* Title */}
            <div>
              <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-1 block">Title</label>
              <input
                type="text"
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                onBlur={commitTitle}
                placeholder="Shot title"
                className="w-full px-3 py-1.5 text-sm rounded bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40"
              />
            </div>

            {/* Canonical image prompt — the source of truth for rendering */}
            <div>
              <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-1 block">
                Image prompt
                <span className="text-green-400 normal-case ml-2">(sent to model verbatim)</span>
              </label>
              <textarea
                value={localImagePrompt}
                onChange={(e) => setLocalImagePrompt(e.target.value)}
                onBlur={commitImagePrompt}
                rows={6}
                placeholder="Describe the shot you want — composition, framing, mood, action, lighting. This reaches the image model verbatim (plus project style + refs). If you leave it empty, the agent composes one from the frame's metadata."
                className="w-full px-3 py-2 text-xs rounded bg-black/30 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none leading-relaxed"
              />
            </div>

            {/* Description (text/prose for the beat — not the image prompt) */}
            <div>
              <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-1 block">Description (story beat)</label>
              <textarea
                value={localDescription}
                onChange={(e) => setLocalDescription(e.target.value)}
                onBlur={commitDescription}
                rows={3}
                placeholder="What happens in this beat — for the script / story-side, not the image."
                className="w-full px-3 py-2 text-xs rounded bg-black/30 border border-white/10 text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none leading-relaxed"
              />
            </div>

            {/* Shot / Camera / Mood pills — inline editable */}
            <div>
              <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-2 block">Cinematography</label>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={localShotType}
                  onChange={(e) => setLocalShotType(e.target.value)}
                  onBlur={commitShotType}
                  placeholder="Shot type"
                  className="px-2 py-1 text-xs rounded bg-amber-500/10 border border-amber-500/20 text-amber-200 placeholder:text-amber-200/40 focus:outline-none focus:border-amber-500/50"
                />
                <input
                  type="text"
                  value={localCamera}
                  onChange={(e) => setLocalCamera(e.target.value)}
                  onBlur={commitCamera}
                  placeholder="Camera"
                  className="px-2 py-1 text-xs rounded bg-blue-500/10 border border-blue-500/20 text-blue-200 placeholder:text-blue-200/40 focus:outline-none focus:border-blue-500/50"
                />
                <input
                  type="text"
                  value={localMood}
                  onChange={(e) => setLocalMood(e.target.value)}
                  onBlur={commitMood}
                  placeholder="Mood"
                  className="px-2 py-1 text-xs rounded bg-purple-500/10 border border-purple-500/20 text-purple-200 placeholder:text-purple-200/40 focus:outline-none focus:border-purple-500/50"
                />
              </div>
            </div>

            {/* Dialogue */}
            <div>
              <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-1 block">Dialogue (one line per row)</label>
              <textarea
                value={localDialogue}
                onChange={(e) => setLocalDialogue(e.target.value)}
                onBlur={commitDialogue}
                rows={2}
                placeholder="Each line of dialogue on its own row"
                className="w-full px-3 py-2 text-xs rounded bg-black/30 border border-white/10 text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40 resize-none leading-relaxed"
              />
            </div>

            {/* Caption */}
            <div>
              <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-1 block">Caption / narration</label>
              <input
                type="text"
                value={localCaption}
                onChange={(e) => setLocalCaption(e.target.value)}
                onBlur={commitCaption}
                placeholder="Caption text (optional)"
                className="w-full px-3 py-1.5 text-xs rounded bg-black/30 border border-white/10 text-amber-300 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40"
              />
            </div>

            {/* SFX */}
            <div>
              <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-1 block">SFX (comma-separated)</label>
              <input
                type="text"
                value={localSfx}
                onChange={(e) => setLocalSfx(e.target.value)}
                onBlur={commitSfx}
                placeholder="thud, glass shatter, drone hum"
                className="w-full px-3 py-1.5 text-xs rounded bg-black/30 border border-white/10 text-rose-300 placeholder:text-gray-600 focus:outline-none focus:border-amber-500/40"
              />
            </div>

            {/* Alternate takes — same as the timeline clip inspector, surfaced
                here in the workbench too. Roll new variants, click to promote
                one to this shot's image, X to remove. */}
            {onGenerateVariant && (
              <div className="border-t border-white/5 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] uppercase text-gray-500 tracking-wider">
                    Alternate takes ({frame.variants?.length || 0})
                  </label>
                  <button
                    onClick={() => onGenerateVariant(scene, frame)}
                    disabled={generatingVariantShotId === frame.id}
                    className={cn(
                      "px-1.5 py-0.5 text-[10px] rounded border flex items-center gap-1 transition-colors",
                      generatingVariantShotId === frame.id
                        ? "bg-purple-500/30 text-purple-200 border-purple-500/40 cursor-wait"
                        : "bg-cyan-500/15 text-cyan-200 border-cyan-500/30 hover:bg-cyan-500/25"
                    )}
                    title="Generate a new alternate take using the same prompt + refs"
                  >
                    {generatingVariantShotId === frame.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Wand2 className="w-2.5 h-2.5" />}
                    {generatingVariantShotId === frame.id ? "Rolling..." : "New variant"}
                  </button>
                </div>
                {(!frame.variants || frame.variants.length === 0) ? (
                  <p className="text-[10px] text-gray-500 leading-relaxed">
                    Roll alternate takes to keep options open — same references + prompt, composition varies. Promote one to make it this shot's image.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {frame.variants.map((variant, vIdx) => (
                      <div
                        key={variant.id}
                        className="group/fvariant relative aspect-video rounded overflow-hidden bg-black border border-white/10 hover:border-cyan-400/60 transition-colors cursor-pointer"
                        onClick={() => onPromoteVariant?.(scene, frame, variant.id)}
                        title="Click to promote this take to the shot's image"
                      >
                        <img src={variant.url} alt={variant.label || `Take ${vIdx + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-x-0 bottom-0 px-1 py-0.5 bg-black/80 text-[8px] text-cyan-200 truncate">
                          {variant.label || `Take ${vIdx + 1}`}
                        </div>
                        {onDeleteVariant && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onDeleteVariant(scene, frame, variant.id); }}
                            className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/70 text-rose-300 opacity-0 group-hover/fvariant:opacity-100 transition-opacity"
                            title="Delete variant"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Collapsible AI-set structured metadata (not raw-editable here;
                agent edits via update_frame tool) */}
            {(frame.visual_direction || (frame.appearance_notes && frame.appearance_notes.length > 0) || frame.visual_beat) && (
              <div className="border-t border-white/5 pt-3">
                <button
                  onClick={() => setMetadataExpanded((v) => !v)}
                  className="w-full flex items-center justify-between text-[10px] uppercase tracking-wider text-gray-500 hover:text-gray-300"
                >
                  <span>AI-set metadata</span>
                  {metadataExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                {metadataExpanded && (
                  <div className="mt-2 space-y-3">
                    {frame.visual_beat && (
                      <div>
                        <div className="text-[10px] uppercase text-gray-500 mb-1">Visual beat</div>
                        <p className="text-[11px] text-gray-400 leading-relaxed">{frame.visual_beat}</p>
                      </div>
                    )}
                    {frame.visual_direction && (
                      <div>
                        <div className="text-[10px] uppercase text-gray-500 mb-1">Visual direction (informs prompt)</div>
                        <div className="space-y-0.5 text-[11px] text-gray-400">
                          {frame.visual_direction.action && <div><span className="text-gray-500">Action:</span> {frame.visual_direction.action}</div>}
                          {frame.visual_direction.composition && <div><span className="text-gray-500">Composition:</span> {frame.visual_direction.composition}</div>}
                          {frame.visual_direction.lighting && <div><span className="text-gray-500">Lighting:</span> {frame.visual_direction.lighting}</div>}
                          {frame.visual_direction.atmosphere && <div><span className="text-gray-500">Atmosphere:</span> {frame.visual_direction.atmosphere}</div>}
                          {frame.visual_direction.environment && <div><span className="text-gray-500">Environment:</span> {frame.visual_direction.environment}</div>}
                        </div>
                      </div>
                    )}
                    {frame.appearance_notes && frame.appearance_notes.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase text-gray-500 mb-1">Appearance pinning (per-participant)</div>
                        <div className="space-y-0.5 text-[11px] text-gray-400">
                          {frame.appearance_notes.map((note, i) => (
                            <div key={i}><span className="text-gray-500">{note.name}:</span> {note.details}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Collapsible last-render diagnostics. Shows what actually reached
                the model — the canonical prompt PLUS the wrapping (style
                directive, per-ref descriptions). Critical for debugging
                off-look renders without having to dig through logs. */}
            {frame.lastImagePrompt && (
              <div className="border-t border-white/5 pt-3">
                <button
                  onClick={() => setLastRenderExpanded((v) => !v)}
                  className="w-full flex items-center justify-between text-[10px] uppercase tracking-wider text-gray-500 hover:text-gray-300"
                >
                  <span>Last render diagnostics</span>
                  {lastRenderExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                {lastRenderExpanded && (
                  <div className="mt-2 space-y-2 text-[11px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      {frame.lastImageBackend && (
                        <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/20">
                          {frame.lastImageBackend}
                        </span>
                      )}
                      {frame.lastImageStyleDirectiveApplied !== undefined && (
                        <span className={cn(
                          "px-1.5 py-0.5 rounded border",
                          frame.lastImageStyleDirectiveApplied
                            ? "bg-pink-500/15 text-pink-300 border-pink-500/20"
                            : "bg-rose-500/15 text-rose-300 border-rose-500/20"
                        )}>
                          style {frame.lastImageStyleDirectiveApplied ? "locked" : "unlocked"}
                        </span>
                      )}
                      {frame.lastImageAt && (
                        <span className="text-gray-500">{new Date(frame.lastImageAt).toLocaleString()}</span>
                      )}
                    </div>
                    {frame.lastImageReferencesAttached && frame.lastImageReferencesAttached.length > 0 && (
                      <div>
                        <div className="text-gray-500 mb-1">References attached ({frame.lastImageReferencesAttached.length}):</div>
                        <div className="space-y-1">
                          {frame.lastImageReferencesAttached.map((r, i) => (
                            <div key={i} className="rounded bg-black/30 border border-white/5 px-2 py-1 text-gray-400">
                              <span className="text-gray-500">[{r.type}]</span> {r.description}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="text-gray-500 mb-1">Full prompt sent to the model:</div>
                      <pre className="rounded bg-black/40 border border-white/5 p-2 text-[10px] text-gray-300 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                        {frame.lastImagePrompt}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM ACTION BAR — discrete buttons. Each has one clear function
          and a tooltip explaining when to use it. No more overlapping
          "Re-roll vs Camera vs Edit vs Generate-by-prompt" confusion. */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-white/10 bg-slate-900/60 flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onGenerateFrameImage(scene, frame, localImagePrompt || undefined)}
            disabled={isGeneratingImage || !canGeneratePrev}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors",
              isGeneratingImage
                ? "bg-purple-500/30 text-purple-200 border-purple-500/40 cursor-wait"
                : !canGeneratePrev
                  ? "bg-white/5 text-gray-500 border-white/5 cursor-not-allowed"
                  : "bg-amber-500/20 text-amber-200 border-amber-500/30 hover:bg-amber-500/30"
            )}
            title="Render the image using the canonical Image prompt above + project style + refs"
          >
            {isGeneratingImage ? <Loader className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
            {isGeneratingImage ? "Rendering..." : !canGeneratePrev ? `Render shot ${frameIndex} first` : "Render image"}
          </button>

          {onGenerateSingleFrame && (
            <button
              onClick={() => onGenerateSingleFrame(scene, frame.id, localImagePrompt || undefined)}
              disabled={isGeneratingContent || isGeneratingImage}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors",
                isGeneratingContent
                  ? "bg-purple-500/30 text-purple-200 border-purple-500/40 cursor-wait"
                  : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10"
              )}
              title="Regenerate ALL content (description, dialogue, beat, visual direction) — destructive; overwrites your edits"
            >
              {isGeneratingContent ? <Loader className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Re-roll all
            </button>
          )}

          {frame.imageUrl && onCameraAngleTarget && (
            <button
              onClick={() => { onImageEditTarget?.(null); onCameraAngleTarget({
                type: "frame",
                sceneId: scene.id,
                frameId: frame.id,
                imageUrl: frame.imageUrl!,
                label: frame.title || `Shot ${frameIndex + 1}`,
                participantIds: scene.participantIds,
                locationId: scene.locationId,
                prose: scene.prose,
                frames: scene.frames,
                title: scene.title,
              }); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10"
              title="Re-render this exact moment from a different camera angle (preserves identity)"
            >
              <Camera className="w-3 h-3" />
              Angle
            </button>
          )}

          {frame.imageUrl && onImageEditTarget && (
            <button
              onClick={() => { onCameraAngleTarget?.(null); onImageEditTarget({
                type: "frame",
                sceneId: scene.id,
                frameId: frame.id,
                imageUrl: frame.imageUrl!,
                label: frame.title || `Shot ${frameIndex + 1}`,
              }); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10"
              title="Edit the existing image with a natural-language instruction (preserves composition)"
            >
              <PenLine className="w-3 h-3" />
              Edit image
            </button>
          )}

          {onDuplicateFrame && (
            <button
              onClick={() => onDuplicateFrame(scene, frame.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10"
              title="Create a copy of this frame right after it"
            >
              <Copy className="w-3 h-3" />
              Duplicate
            </button>
          )}
        </div>

        <button
          onClick={handleDeleteClick}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors",
            confirmDelete
              ? "bg-rose-500/30 text-rose-200 border-rose-500/40"
              : "bg-white/5 text-gray-400 border-white/10 hover:bg-rose-500/10 hover:text-rose-300 hover:border-rose-500/20"
          )}
          title={confirmDelete ? "Click again within 3s to confirm" : "Delete this frame"}
        >
          <Trash2 className="w-3 h-3" />
          {confirmDelete ? "Confirm delete" : "Delete"}
        </button>
      </div>

    </motion.div>
  );
}

// =============================================================================
// WORLD DRAWER
// =============================================================================

function WorldDrawer({
  entities,
  scenes,
  artifacts,
  onEntityClick,
  onSceneClick,
  onArtifactClick,
  onClose,
}: {
  entities: Entity[];
  scenes: Scene[];
  artifacts: Artifact[];
  onEntityClick: (entity: Entity) => void;
  onSceneClick: (scene: Scene) => void;
  onArtifactClick: (artifact: Artifact) => void;
  onClose: () => void;
}) {
  return (
    <div className="w-full h-full flex flex-col">
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <h3 className="font-medium text-gray-200">World</h3>
        <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className={cn("grid gap-3", artifacts.length > 0 ? "grid-cols-3" : "grid-cols-2")}>
          <div className="bg-white/5 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-amber-400">{scenes.length}</div>
            <div className="text-xs text-gray-500">Scenes</div>
          </div>
          <div className="bg-white/5 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-purple-400">{entities.length}</div>
            <div className="text-xs text-gray-500">Entities</div>
          </div>
          {artifacts.length > 0 && (
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-cyan-400">{artifacts.length}</div>
              <div className="text-xs text-gray-500">Artifacts</div>
            </div>
          )}
        </div>

        {/* Artifacts */}
        {artifacts.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-medium text-gray-500 uppercase">Artifacts ({artifacts.length})</span>
            </div>
            <div className="space-y-2">
              {artifacts.map((artifact) => (
                <button
                  key={artifact.id}
                  onClick={() => onArtifactClick(artifact)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 text-left"
                >
                  <div className="w-12 h-12 rounded overflow-hidden bg-slate-800 flex-shrink-0 ring-1 ring-cyan-500/20">
                    {artifact.primaryImage?.url ? (
                      <img src={artifact.primaryImage.url} alt={artifact.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FileText className="w-4 h-4 text-cyan-500/40" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-200 truncate">{artifact.title}</div>
                    <div className="text-[10px] text-gray-500 truncate">
                      {artifact.format}{artifact.publication ? ` · ${artifact.publication}` : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scenes */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Film className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-medium text-gray-500 uppercase">Scenes</span>
          </div>
          <div className="space-y-2">
            {scenes.map((scene) => (
              <button
                key={scene.id}
                onClick={() => onSceneClick(scene)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 text-left"
              >
                <div className="w-12 h-8 rounded overflow-hidden bg-slate-800 flex-shrink-0">
                  {scene.imageUrl ? (
                    <img src={scene.imageUrl} alt={scene.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Film className="w-4 h-4 text-amber-500/30" />
                    </div>
                  )}
                </div>
                <span className="text-sm text-gray-300 truncate">{scene.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Entities by type */}
        {["character", "location", "creature", "object", "faction"].map((type) => {
          const typeEntities = entities.filter((e) => e.type === type);
          if (typeEntities.length === 0) return null;
          const config = entityTypeConfig[type] || entityTypeConfig.character;

          return (
            <div key={type}>
              <div className="flex items-center gap-2 mb-3">
                <config.icon className={cn("w-4 h-4", config.color)} />
                <span className="text-xs font-medium text-gray-500 uppercase">
                  {type}s ({typeEntities.length})
                </span>
              </div>
              <div className="space-y-1">
                {typeEntities.map((entity) => (
                  <button
                    key={entity.id}
                    onClick={() => onEntityClick(entity)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 text-left"
                  >
                    <div className={cn("w-9 h-9 rounded-full overflow-hidden ring-2", config.ringColor)}>
                      {entity.referenceImage ? (
                        <img src={entity.referenceImage} alt={entity.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className={cn("w-full h-full flex items-center justify-center", config.bgColor)}>
                          <config.icon className={cn("w-4 h-4", config.color)} />
                        </div>
                      )}
                    </div>
                    <span className="text-sm text-gray-300 truncate">{entity.name}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
