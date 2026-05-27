/**
 * Standalone API server for NarrativeGit UI
 * Provides REST endpoints with demo data for the UI to consume
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { z } from 'zod';
import { GeminiAdapter, ToolDefinition, AgentStep, ImagePart } from '../llm/gemini';
import type { LLMAdapter } from '../types';
import { EntityExtractor } from '../extractors/entity-extractor';
import { RelationshipExtractor } from '../extractors/relationship-extractor';
import { ChunkedExtractionPipeline, ChunkProgress } from '../chunked-extraction';
import { ImageGenerator } from '../visual/image-generator';
import { GptImageGenerator } from '../visual/gpt-image-generator';
import { EntityPortraitGenerator } from '../visual/entity-portrait-generator';
import {
  getStorageAdapter,
  closeStorage,
  StorageAdapter,
  ProjectData,
  Project,
  ProjectStyleProfile,
  createEmptyProjectData,
} from '../storage';

const app = express();

// Increase body size limit for book uploads
app.use(express.json({ limit: '50mb' }));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit per file
    files: 20, // Max 20 files at once
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.txt', '.md', '.markdown', '.text'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext) || file.mimetype === 'text/plain' || file.mimetype === 'text/markdown') {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed. Use .txt or .md files.`));
    }
  },
});

// Multer instance for user-uploaded asset images. Separate from `upload`
// (text-only) so the mimetype filter doesn't have to be relaxed for the
// scratchpad-import flow.
const uploadAsset = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
    files: 30,                  // up to 30 at once for bulk drag-drop
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error(`Only image uploads are supported. Got: ${file.mimetype}`));
    }
  },
});

// ============================================================================
// LLM SETUP
// ============================================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
let llmAdapter: GeminiAdapter | null = null;
let entityExtractor: EntityExtractor | null = null;
let relationshipExtractor: RelationshipExtractor | null = null;

let chunkedPipeline: ChunkedExtractionPipeline | null = null;

if (GEMINI_API_KEY) {
  console.log('🤖 Initializing Gemini LLM adapter...');
  llmAdapter = new GeminiAdapter({ apiKey: GEMINI_API_KEY, timeout: 180000 }); // 3 min timeout for long extractions
  entityExtractor = new EntityExtractor(llmAdapter);
  relationshipExtractor = new RelationshipExtractor(llmAdapter);
  chunkedPipeline = new ChunkedExtractionPipeline(llmAdapter, {
    maxChunkSize: 6000,
    overlapSize: 300,
    respectChapters: true,
    respectParagraphs: true,
  });
  console.log('✅ LLM extraction ready (including book-length chunked extraction)');
} else {
  console.log('⚠️  No GEMINI_API_KEY or GOOGLE_AI_API_KEY found - using fallback regex extraction');
}

// Image generation setup
let imageGenerator: ImageGenerator | null = null;
let portraitGenerator: EntityPortraitGenerator | null = null;
let gptImageGenerator: GptImageGenerator | null = null;

if (GEMINI_API_KEY) {
  const outputDir = path.join(process.cwd(), '.narrative-data', 'generated-images');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  imageGenerator = new ImageGenerator({
    apiKey: GEMINI_API_KEY,
    outputDir,
  });
  portraitGenerator = new EntityPortraitGenerator({
    apiKey: GEMINI_API_KEY,
    cacheDir: path.join(outputDir, 'portraits'),
  });
  console.log('🎨 Nano Banana ready (Gemini 3 Pro Image)');
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (OPENAI_API_KEY) {
  const outputDir = path.join(process.cwd(), '.narrative-data', 'generated-images');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  gptImageGenerator = new GptImageGenerator({
    apiKey: OPENAI_API_KEY,
    outputDir,
    defaultQuality: 'high',
  });
  const models = gptImageGenerator.getModels();
  console.log(`🎨 GPT Image ready (OpenAI) — generate=${models.generate}, edit=${models.edit} (fallback=${models.editFallback})`);
} else {
  console.log('⚠️  No OPENAI_API_KEY — GPT Image backend disabled (Nano Banana only)');
}

// Track extraction jobs
interface ExtractionJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: ChunkProgress | null;
  result: any | null;
  error: string | null;
  startedAt: number;
  completedAt: number | null;
}

const extractionJobs = new Map<string, ExtractionJob>();

// ============================================================================
// STORAGE ADAPTER INTEGRATION
// ============================================================================

const DATA_DIR = path.join(process.cwd(), '.narrative-data');

// Ensure data directory exists (for file-based storage and images)
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Storage adapter instance (initialized at startup)
let storageAdapter: StorageAdapter | null = null;

// In-memory cache for fast synchronous access
let projects: Project[] = [];
const projectDataCache = new Map<string, ProjectData>();

// Initialize storage adapter and load initial data
async function initializeStorage(): Promise<void> {
  try {
    storageAdapter = await getStorageAdapter();
    projects = await storageAdapter.loadProjects();
    console.log(`📦 Storage initialized with ${projects.length} project(s)`);
  } catch (error) {
    console.error('Failed to initialize storage adapter:', error);
    // Fallback to empty state
    projects = [];
  }
}

// Load projects (uses cache for sync access)
function loadProjects(): Project[] {
  return projects;
}

// Save projects (sync cache update + async storage write)
function saveProjects(projectList: Project[]): void {
  projects = projectList;
  // Fire-and-forget async save
  if (storageAdapter) {
    storageAdapter.saveProjects(projectList).catch(err => {
      console.error('Error persisting projects to storage:', err);
    });
  }
}
const PORT = process.env.API_PORT || 3088;

// Middleware
app.use(cors());
app.use(express.json());

// ============================================================================
// PROJECT-SCOPED DATA STORAGE (uses storage adapter with in-memory cache)
// ============================================================================

// Load project data (uses cache + async adapter fallback)
function loadProjectData(projectId: string): ProjectData {
  // Check cache first
  if (projectDataCache.has(projectId)) {
    return projectDataCache.get(projectId)!;
  }

  // For sync compatibility, try file system directly if adapter not ready
  const projectDataFile = path.join(DATA_DIR, `project_${projectId}.json`);
  try {
    if (fs.existsSync(projectDataFile)) {
      const data = fs.readFileSync(projectDataFile, 'utf-8');
      const parsed = JSON.parse(data);
      const normalized: ProjectData = {
        entities: parsed.entities || [],
        relationships: parsed.relationships || [],
        commits: parsed.commits || [],
        branches: parsed.branches || createEmptyProjectData().branches,
        interactions: parsed.interactions || [],
        documents: parsed.documents || [],
        artifacts: parsed.artifacts || [],
        assets: parsed.assets || [],
        storyGraph: parsed.storyGraph,
        conversationHistory: parsed.conversationHistory,
      };
      projectDataCache.set(projectId, normalized);
      return normalized;
    }
  } catch (err) {
    console.error(`Error loading project data for ${projectId}:`, err);
  }

  // Return empty data for new projects
  const emptyData = createEmptyProjectData();
  projectDataCache.set(projectId, emptyData);
  return emptyData;
}

// Async version for when we need to ensure data is from storage
async function loadProjectDataAsync(projectId: string): Promise<ProjectData> {
  if (storageAdapter) {
    try {
      const data = await storageAdapter.loadProjectData(projectId);
      projectDataCache.set(projectId, data);
      return data;
    } catch (err) {
      console.error(`Error loading project data async for ${projectId}:`, err);
    }
  }
  return loadProjectData(projectId);
}

// Save project data (sync cache update + async storage write)
function saveProjectData(projectId: string, data: ProjectData): void {
  // Update cache immediately
  projectDataCache.set(projectId, data);

  // Fire-and-forget async save to storage adapter
  if (storageAdapter) {
    storageAdapter.saveProjectData(projectId, data).catch(err => {
      console.error(`Error persisting project data for ${projectId}:`, err);
    });
  } else {
    // Fallback to direct file write if adapter not initialized
    const projectDataFile = path.join(DATA_DIR, `project_${projectId}.json`);
    try {
      fs.writeFileSync(projectDataFile, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error(`Error saving project data for ${projectId}:`, err);
    }
  }
}

// Get the active project ID
function getActiveProjectId(): string {
  const active = projects.find(p => p.isActive);
  return active?.id || 'demo';
}

const DEFAULT_PROJECT_STYLE_PROFILE: ProjectStyleProfile = {
  presetId: 'cinematic-concept',
  presetName: 'Cinematic Concept',
  narrativePresetId: 'cinematic-concept',
  narrativePresetName: 'Cinematic Concept',
  visualPresetId: 'cinematic-concept',
  visualPresetName: 'Cinematic Concept',
  narrativePrompt: 'Write grounded cinematic prose with sensory detail, clear emotional beats, and concrete causality.',
  visualPrompt: 'Concept art aesthetic, natural lighting, grounded anatomy, expressive faces, and environmental storytelling.',
  updatedAt: Date.now(),
};

const PORTRAIT_VARIATION_POOL = [
  'Close-up from a low angle, dramatic uplighting, intense or contemplative mood.',
  'Full-body or wide shot in an environmental context, showing the subject in their world.',
  'High-contrast side profile or silhouette, stylized lighting, bold artistic composition.',
  'Action pose or candid moment, dynamic composition with motion and energy.',
  'Bird\'s eye or overhead perspective, unusual vantage point, abstract composition.',
  'Extreme close-up on a defining detail or feature, macro-style, shallow depth of field.',
  'Warm golden-hour lighting, relaxed or reflective moment, soft natural tones.',
  'Cool blue-hour or nighttime scene, moody atmosphere, rim lighting.',
];

const normalizeStyleProfile = (input: any): ProjectStyleProfile | undefined => {
  if (!input || typeof input !== 'object') return undefined;
  const presetId = typeof input.presetId === 'string' ? input.presetId.trim() : undefined;
  const presetName = typeof input.presetName === 'string' ? input.presetName.trim() : undefined;

  const explicitNarrativePresetId = typeof input.narrativePresetId === 'string'
    ? input.narrativePresetId.trim()
    : undefined;
  const explicitNarrativePresetName = typeof input.narrativePresetName === 'string'
    ? input.narrativePresetName.trim()
    : undefined;
  const explicitVisualPresetId = typeof input.visualPresetId === 'string'
    ? input.visualPresetId.trim()
    : undefined;
  const explicitVisualPresetName = typeof input.visualPresetName === 'string'
    ? input.visualPresetName.trim()
    : undefined;

  const narrativePresetId = explicitNarrativePresetId || presetId;
  const narrativePresetName = explicitNarrativePresetName || (narrativePresetId === presetId ? presetName : undefined);
  const visualPresetId = explicitVisualPresetId || presetId;
  const visualPresetName = explicitVisualPresetName || (visualPresetId === presetId ? presetName : undefined);

  const narrativePrompt = typeof input.narrativePrompt === 'string' ? input.narrativePrompt.trim() : undefined;
  const visualPrompt = typeof input.visualPrompt === 'string' ? input.visualPrompt.trim() : undefined;
  const styleAssetIds = Array.isArray(input.styleAssetIds)
    ? input.styleAssetIds.filter((s: any) => typeof s === 'string' && s)
    : undefined;
  const updatedAt = typeof input.updatedAt === 'number' ? input.updatedAt : Date.now();

  if (
    !presetId &&
    !presetName &&
    !narrativePresetId &&
    !narrativePresetName &&
    !visualPresetId &&
    !visualPresetName &&
    !narrativePrompt &&
    !visualPrompt &&
    (!styleAssetIds || styleAssetIds.length === 0)
  ) {
    return undefined;
  }

  const combinedPresetId = narrativePresetId && visualPresetId && narrativePresetId === visualPresetId
    ? narrativePresetId
    : undefined;
  const combinedPresetName = combinedPresetId && narrativePresetName && visualPresetName && narrativePresetName === visualPresetName
    ? narrativePresetName
    : undefined;

  return {
    ...(combinedPresetId ? { presetId: combinedPresetId } : {}),
    ...(combinedPresetName ? { presetName: combinedPresetName } : {}),
    ...(narrativePresetId ? { narrativePresetId } : {}),
    ...(narrativePresetName ? { narrativePresetName } : {}),
    ...(visualPresetId ? { visualPresetId } : {}),
    ...(visualPresetName ? { visualPresetName } : {}),
    ...(narrativePrompt ? { narrativePrompt } : {}),
    ...(visualPrompt ? { visualPrompt } : {}),
    ...(styleAssetIds && styleAssetIds.length > 0 ? { styleAssetIds } : {}),
    updatedAt,
  };
};

const mergeStylePrompts = (basePrompt?: string, requestPrompt?: string): string | undefined => {
  const base = basePrompt?.trim();
  const request = requestPrompt?.trim();
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
  if (base && request) {
    const baseNorm = normalize(base);
    const requestNorm = normalize(request);
    if (baseNorm === requestNorm) {
      return base;
    }
    if (baseNorm.includes(requestNorm)) {
      return base;
    }
    if (requestNorm.includes(baseNorm)) {
      return request;
    }
  }
  if (base && request) {
    return `${base}\n\n${request}`;
  }
  return base || request || undefined;
};

const getProjectStyleProfile = (projectId: string): ProjectStyleProfile => {
  const project = projects.find((candidate) => candidate.id === projectId);
  const normalized = normalizeStyleProfile(project?.styleProfile);
  return {
    ...DEFAULT_PROJECT_STYLE_PROFILE,
    ...(normalized || {}),
  };
};

const getEffectiveWritingStylePrompt = (projectId: string, requestPrompt?: string): string | undefined => {
  const profile = getProjectStyleProfile(projectId);
  return mergeStylePrompts(profile.narrativePrompt, requestPrompt);
};

const getEffectiveVisualStylePrompt = (projectId: string, requestPrompt?: string): string | undefined => {
  const profile = getProjectStyleProfile(projectId);
  return mergeStylePrompts(profile.visualPrompt, requestPrompt);
};

type VisualOutputIntent = 'cinematic-still' | 'comic-panel' | 'video-keyframe';
type VisualTextPolicy = 'no-text' | 'diegetic-only' | 'allow-baked';

const normalizeVisualOutputIntent = (value: unknown): VisualOutputIntent => {
  if (value === 'comic-panel' || value === 'video-keyframe' || value === 'cinematic-still') {
    return value;
  }
  return 'cinematic-still';
};

const normalizeVisualTextPolicy = (value: unknown): VisualTextPolicy => {
  if (value === 'diegetic-only' || value === 'allow-baked' || value === 'no-text') {
    return value;
  }
  return 'no-text';
};

const resolveVisualTextPolicyForIntent = (
  outputIntent: VisualOutputIntent,
  requestedPolicy: unknown
): { policy: VisualTextPolicy; locked: boolean } => {
  if (outputIntent === 'cinematic-still' || outputIntent === 'video-keyframe') {
    return {
      policy: 'no-text',
      locked: true,
    };
  }
  return {
    policy: normalizeVisualTextPolicy(requestedPolicy),
    locked: false,
  };
};

const buildOutputIntentDirective = (outputIntent: VisualOutputIntent): string => {
  if (outputIntent === 'comic-panel') {
    return 'Target output: single comic panel composition (not a multi-panel page or contact sheet).';
  }
  if (outputIntent === 'video-keyframe') {
    return 'Target output: single clean video keyframe for downstream motion/interpolation; preserve realistic staging and continuity.';
  }
  return 'Target output: single cinematic still frame.';
};

const buildTextPolicyDirective = (textPolicy: VisualTextPolicy): string => {
  if (textPolicy === 'no-text') {
    return 'Keep all text illegible. Any writing on props should be blurred or abstract.';
  }
  if (textPolicy === 'diegetic-only') {
    return 'Readable text is allowed only for in-world props and signage when explicitly requested.';
  }
  return 'Readable text is allowed only when explicitly requested in the prompt.';
};

const buildCompositionConstraintBlock = (outputIntent: VisualOutputIntent): string => {
  if (outputIntent === 'comic-panel') {
    return 'Render one single continuous comic panel filling the entire canvas.';
  }
  if (outputIntent === 'video-keyframe') {
    return 'Render one single continuous cinematic frame suitable for motion interpolation.';
  }
  return 'Render one single continuous cinematic frame filling the entire canvas.';
};

const buildAdditionalNotesDirective = (textPolicy: VisualTextPolicy): string => {
  if (textPolicy === 'no-text') {
    return 'Interpret additional notes as scene and camera direction only.';
  }
  if (textPolicy === 'diegetic-only') {
    return 'Interpret additional notes as scene and camera direction. Render readable text only if explicitly requested as in-world text.';
  }
  return 'Interpret additional notes as scene and camera direction unless explicit on-screen text is provided.';
};

const getStyleCacheToken = (stylePrompt?: string): string => {
  if (!stylePrompt || typeof stylePrompt !== 'string') return 'default';
  const normalized = stylePrompt.trim().toLowerCase();
  if (!normalized) return 'default';
  return Buffer.from(normalized)
    .toString('base64')
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 24)
    || 'default';
};

// ============================================================================
// DEMO DATA
// ============================================================================

const demoEntities = [
  {
    id: "agent-chen",
    name: "Agent Chen",
    type: "character",
    description: "A determined timeline operative with short black hair, wearing a long dark coat with glowing circuit patterns.",
    traits: ["determined", "resourceful", "haunted"],
    relationships: 5,
    interactions: 12,
  },
  {
    id: "director-voss",
    name: "Director Voss",
    type: "character",
    description: "The cold, calculating head of Oneirocom Timeline Enforcement. Silver hair slicked back, wears an immaculate white suit.",
    traits: ["ruthless", "calculating", "elegant"],
    relationships: 4,
    interactions: 8,
  },
  {
    id: "oneirocom-tower",
    name: "Oneirocom Tower",
    type: "location",
    description: "A massive spire of black glass and chrome rising above Neo-Tokyo. The Convergence Engine pulses with blue energy at its peak.",
    atmosphere: "oppressive, powerful",
    relationships: 3,
    interactions: 6,
  },
  {
    id: "sector-7",
    name: "Sector 7 Safehouse",
    type: "location",
    description: "A hidden resistance base in the unstable reality zone. Walls flicker with holographic displays showing timeline maps.",
    atmosphere: "tense, clandestine",
    relationships: 2,
    interactions: 4,
  },
  {
    id: "resistance",
    name: "The Resistance",
    type: "organization",
    description: "A covert network of timeline operatives working to overthrow Oneirocom's control over reality.",
    relationships: 6,
    interactions: 3,
  },
  {
    id: "oneirocom",
    name: "Oneirocom Corporation",
    type: "organization",
    description: "The megacorporation that controls timeline manipulation technology and enforces their version of 'optimal' reality.",
    relationships: 8,
    interactions: 5,
  },
  {
    id: "convergence-engine",
    name: "Convergence Engine",
    type: "technology",
    description: "The device at the heart of Oneirocom Tower that allows manipulation and pruning of alternate timelines.",
    relationships: 4,
    interactions: 2,
  },
  {
    id: "timeline-pruning",
    name: "Timeline Pruning",
    type: "concept",
    description: "The process by which Oneirocom eliminates 'undesirable' alternate timelines, erasing those realities from existence.",
    relationships: 3,
    interactions: 1,
  },
];

const demoRelationships = [
  { id: "r1", sourceId: "agent-chen", targetId: "resistance", type: "member_of", strength: 0.9 },
  { id: "r2", sourceId: "director-voss", targetId: "oneirocom", type: "leads", strength: 1.0 },
  { id: "r3", sourceId: "agent-chen", targetId: "director-voss", type: "opposes", strength: 0.8 },
  { id: "r4", sourceId: "oneirocom", targetId: "oneirocom-tower", type: "headquarters", strength: 1.0 },
  { id: "r5", sourceId: "resistance", targetId: "sector-7", type: "operates_from", strength: 0.9 },
  { id: "r6", sourceId: "oneirocom-tower", targetId: "convergence-engine", type: "houses", strength: 1.0 },
  { id: "r7", sourceId: "convergence-engine", targetId: "timeline-pruning", type: "enables", strength: 1.0 },
  { id: "r8", sourceId: "resistance", targetId: "oneirocom", type: "fights_against", strength: 0.9 },
];

const demoCommits = [
  {
    id: "commit-1",
    hash: "a1b2c3d4e5f6789",
    message: "Introduce Agent Chen and establish conflict with Oneirocom",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    branch: "main",
    author: "narrative-ai",
    tags: ["canon", "v1.0"],
    operations: [
      { type: "add", entityType: "character", entityName: "Agent Chen" },
      { type: "add", entityType: "organization", entityName: "Oneirocom" },
      { type: "add", entityType: "organization", entityName: "The Resistance" },
      { type: "link", entityType: "character", entityName: "Agent Chen → Resistance" },
    ],
    metrics: { entitiesChanged: 3, relationshipsChanged: 2, consistencyScore: 0.95 },
  },
  {
    id: "commit-2",
    hash: "b2c3d4e5f6789a",
    message: "Add Director Voss as primary antagonist",
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    branch: "main",
    author: "narrative-ai",
    operations: [
      { type: "add", entityType: "character", entityName: "Director Voss" },
      { type: "link", entityType: "character", entityName: "Voss → Oneirocom" },
    ],
    metrics: { entitiesChanged: 1, relationshipsChanged: 2, consistencyScore: 0.92 },
  },
  {
    id: "commit-3",
    hash: "c3d4e5f6789ab",
    message: "Establish Oneirocom Tower and Convergence Engine",
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    branch: "main",
    author: "narrative-ai",
    operations: [
      { type: "add", entityType: "location", entityName: "Oneirocom Tower" },
      { type: "add", entityType: "technology", entityName: "Convergence Engine" },
    ],
    metrics: { entitiesChanged: 2, relationshipsChanged: 2, consistencyScore: 0.98 },
  },
];

const demoBranches = [
  { id: "main", name: "main", description: "The canonical timeline", color: "#22c55e", isActive: true, isCanon: true, commitCount: 5, lastCommit: "2 hours ago", createdAt: "1 week ago" },
  { id: "alt-rescue", name: "alt-timeline-rescue", description: "What if Agent Chen succeeded in the rescue?", color: "#8b5cf6", isActive: false, isCanon: false, probability: 0.35, commitCount: 3, lastCommit: "1 day ago", parentBranch: "main", createdAt: "3 days ago" },
  { id: "chen-betrayal", name: "chen-betrayal", description: "The darker timeline where Chen turns", color: "#ef4444", isActive: false, isCanon: false, probability: 0.15, commitCount: 2, lastCommit: "2 days ago", parentBranch: "main", createdAt: "4 days ago" },
];

const demoInteractions = [
  { id: "int-1", type: "conflict", title: "Confrontation at the Tower", description: "Agent Chen infiltrates Oneirocom Tower and confronts Director Voss.", participants: [{ id: "agent-chen", name: "Agent Chen", type: "character" }, { id: "director-voss", name: "Director Voss", type: "character" }], scene: "Tower Infiltration", chapter: "Chapter 3", emotionalTone: "tense", timestamp: "Scene 3.1" },
  { id: "int-2", type: "revelation", title: "The Truth About Timeline 89", description: "Chen discovers her timeline was scheduled for pruning.", participants: [{ id: "agent-chen", name: "Agent Chen", type: "character" }], scene: "Data Archives", chapter: "Chapter 3", emotionalTone: "shocking", timestamp: "Scene 3.2" },
  { id: "int-3", type: "dialogue", title: "Resistance Strategy Meeting", description: "The Resistance leadership discusses their plan.", participants: [{ id: "agent-chen", name: "Agent Chen", type: "character" }, { id: "resistance", name: "The Resistance", type: "organization" }], scene: "Sector 7 Safehouse", chapter: "Chapter 2", emotionalTone: "determined", timestamp: "Scene 2.3" },
];

// ============================================================================
// API ENDPOINTS
// ============================================================================

// Helper to get data for the active project or a specific project
function getProjectDataForRequest(projectId?: string): { projectId: string; data: ProjectData } {
  const pid = projectId || getActiveProjectId();
  // For demo project, return demo data if no custom data exists
  if (pid === 'demo') {
    const customData = loadProjectData('demo');
    if (customData.entities.length === 0) {
      // Return demo data for demo project
      return {
        projectId: pid,
        data: {
          entities: demoEntities,
          relationships: demoRelationships,
          commits: demoCommits,
          branches: demoBranches,
          interactions: demoInteractions,
          documents: [],
        }
      };
    }
    return { projectId: pid, data: customData };
  }
  return { projectId: pid, data: loadProjectData(pid) };
}

app.get('/api/narrative/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString(), version: '1.0.0' });
});

app.get('/api/narrative/status', (req, res) => {
  const { data } = getProjectDataForRequest();
  res.json({
    currentBranch: "main",
    head: data.commits[0]?.hash || "initial",
    clean: true,
    entities: data.entities.length,
    relationships: data.relationships.length,
    branches: data.branches.length,
    commits: data.commits.length,
  });
});

// Entities
app.get('/api/narrative/entities', (req, res) => {
  const { type } = req.query;
  const { data } = getProjectDataForRequest();
  let entities = data.entities;
  if (type && type !== 'all') {
    entities = entities.filter(e => e.type === type);
  }
  res.json(entities);
});

app.get('/api/narrative/entities/:id', (req, res) => {
  const { data } = getProjectDataForRequest();
  const entity = data.entities.find(e => e.id === req.params.id);
  if (!entity) return res.status(404).json({ error: 'Entity not found' });
  res.json(entity);
});

// Relationships
app.get('/api/narrative/relationships', (req, res) => {
  const { data } = getProjectDataForRequest();
  res.json(data.relationships);
});

app.post('/api/narrative/relationships', (req, res) => {
  try {
    const projectId = req.body.projectId || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const session = getWorldSession(projectId);

    const { source, target, sourceName, targetName, type, description } = req.body;
    if (!source || !target || !type) {
      return res.status(400).json({ error: 'source, target, and type are required' });
    }

    const newRelationship = {
      id: `rel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      source,
      target,
      sourceName: sourceName || '',
      targetName: targetName || '',
      type,
      description: description || '',
      createdAt: new Date().toISOString(),
    };

    projectData.relationships.push(newRelationship);
    session.uncommittedChanges = true;
    saveProjectData(projectId, projectData);

    console.log(`🔗 Created relationship: ${sourceName} --[${type}]--> ${targetName} (${newRelationship.id})`);
    res.json(newRelationship);
  } catch (err: any) {
    console.error('Error creating relationship:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/narrative/relationships/:id', (req, res) => {
  try {
    const projectId = (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const session = getWorldSession(projectId);

    const idx = projectData.relationships.findIndex((r: any) => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Relationship not found' });

    projectData.relationships.splice(idx, 1);
    session.uncommittedChanges = true;
    saveProjectData(projectId, projectData);

    console.log(`🗑️ Deleted relationship: ${req.params.id}`);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting relationship:', err);
    res.status(500).json({ error: err.message });
  }
});

// Interactions
app.get('/api/narrative/interactions', (req, res) => {
  const { data } = getProjectDataForRequest();
  applyStoryGraphDiffs(data);
  // Sort by position to maintain storyboard order
  const sortedInteractions = [...(data.interactions || [])].sort((a, b) => {
    const posA = a.position ?? Number.MAX_VALUE;
    const posB = b.position ?? Number.MAX_VALUE;
    return posA - posB;
  });
  res.json(sortedInteractions);
});

app.get('/api/narrative/interactions/:id', (req, res) => {
  const { data } = getProjectDataForRequest();
  applyStoryGraphDiffs(data);
  const interaction = data.interactions.find(i => i.id === req.params.id);
  if (!interaction) return res.status(404).json({ error: 'Interaction not found' });
  res.json(interaction);
});

// Create a new interaction (scene)
app.post('/api/narrative/interactions', (req, res) => {
  try {
    const projectId = req.body.projectId || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const session = getWorldSession(projectId);

    const {
      title,
      prose,
      description,
      status = 'draft',
      participantIds = [],
      locationId,
      events = [],
      stateChanges = [],
      imageUrl,
      frames = [],
      position: requestedPosition,
      insertAfter,
    } = req.body;

    if (!title && !prose) {
      return res.status(400).json({ error: 'Title or prose is required' });
    }

    // Determine position
    let position: number;
    if (requestedPosition !== undefined) {
      position = requestedPosition;
    } else if (insertAfter) {
      // Find the scene to insert after
      const afterScene = (projectData.interactions || []).find(
        (s: any) => s.id === insertAfter || s.title?.toLowerCase() === insertAfter?.toLowerCase()
      );
      position = afterScene?.position !== undefined ? afterScene.position + 1 : (projectData.interactions || []).length;
    } else {
      position = (projectData.interactions || []).length;
    }

    // Shift positions of scenes that are at or after the target position
    for (const existingScene of projectData.interactions || []) {
      if (existingScene.position !== undefined && existingScene.position >= position) {
        existingScene.position++;
      }
    }

    const mergedSceneEvents = Array.from(new Set([...(events || []), ...(stateChanges || [])]));

    const newInteraction = {
      id: `scene_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: title || 'Untitled Scene',
      prose: prose || '',
      description: description || '',
      status,
      participants: participantIds,
      participantIds,
      location: locationId,
      locationId,
      events: mergedSceneEvents,
      stateChanges,
      imageUrl,
      frames,
      position,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    projectData.interactions.push(newInteraction);
    const storyGraph = applyStoryGraphDiffs(projectData);
    const persistedInteraction = (projectData.interactions || []).find((s: any) => s.id === newInteraction.id) || newInteraction;

    session.uncommittedChanges = true;
    session.pendingChanges.addedSceneIds.add(newInteraction.id);
    saveProjectData(projectId, projectData);

    console.log(`📽️ Created scene: ${newInteraction.title} (${newInteraction.id}) at position ${position}`);

    res.json({
      success: true,
      interaction: persistedInteraction,
      continuity: storyGraph.consistency,
    });
  } catch (error: any) {
    console.error('Create interaction error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update an existing interaction (scene)
app.put('/api/narrative/interactions/:id', (req, res) => {
  try {
    const { id } = req.params;
    const projectId = req.body.projectId || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const session = getWorldSession(projectId);

    const index = projectData.interactions.findIndex(i => i.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Interaction not found' });
    }

    const {
      title,
      prose,
      description,
      status,
      participantIds,
      locationId,
      events,
      stateChanges,
      imageUrl,
      position,
      frames,
    } = req.body;

    const mergedSceneEvents = events !== undefined || stateChanges !== undefined
      ? Array.from(new Set([...(events || []), ...(stateChanges || [])]))
      : undefined;

    const existing = projectData.interactions[index];
    const updated = {
      ...existing,
      ...(title !== undefined && { title }),
      ...(prose !== undefined && { prose }),
      ...(description !== undefined && { description }),
      ...(status !== undefined && { status }),
      ...(participantIds !== undefined && { participants: participantIds, participantIds }),
      ...(locationId !== undefined && { location: locationId, locationId }),
      ...(mergedSceneEvents !== undefined && { events: mergedSceneEvents }),
      ...(stateChanges !== undefined && { stateChanges }),
      ...(imageUrl !== undefined && { imageUrl }),
      ...(position !== undefined && { position }),
      ...(frames !== undefined && { frames }),
      updatedAt: new Date().toISOString(),
    };

    projectData.interactions[index] = updated;
    const storyGraph = applyStoryGraphDiffs(projectData);
    const persistedInteraction = (projectData.interactions || []).find((s: any) => s.id === id) || updated;
    session.uncommittedChanges = true;
    if (!session.pendingChanges.addedSceneIds.has(id)) {
      session.pendingChanges.modifiedSceneIds.add(id);
    }
    saveProjectData(projectId, projectData);

    console.log(`📽️ Updated scene: ${updated.title} (${updated.id})`);

    res.json({
      success: true,
      interaction: persistedInteraction,
      continuity: storyGraph.consistency,
    });
  } catch (error: any) {
    console.error('Update interaction error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate storyboard frames for an existing interaction (scene)
app.post('/api/narrative/interactions/:id/frames', async (req, res) => {
  try {
    const { id } = req.params;
    const projectId = req.body.projectId || getActiveProjectId();
    const { count = 4, guidance, visualStylePrompt } = req.body || {};
    const effectiveVisualStylePrompt = getEffectiveVisualStylePrompt(projectId, visualStylePrompt);
    const projectData = loadProjectData(projectId);
    const session = getWorldSession(projectId);

    if (!llmAdapter) {
      return res.status(500).json({ error: 'LLM not configured - set GEMINI_API_KEY' });
    }

    const scene = projectData.interactions.find((i: any) => i.id === id);
    if (!scene) {
      return res.status(404).json({ error: 'Interaction not found' });
    }

    const frameCount = Math.min(Math.max(Number(count) || 4, 1), 12);
    const participantIds = scene.participantIds || scene.participants || [];
    const participantNames = participantIds
      .map((pid: string) => projectData.entities.find((e: any) => e.id === pid)?.name || pid)
      .filter(Boolean);
    const locationId = scene.locationId || scene.location;
    const locationName = locationId
      ? (projectData.entities.find((e: any) => e.id === locationId)?.name || locationId)
      : undefined;

    const prompt = `You are a storyboard artist. Break the scene into ${frameCount} cinematic frames.

Scene title: ${scene.title || 'Untitled'}
Scene prose: ${scene.prose || scene.content || scene.description || ''}
Known participants: ${participantNames.join(', ') || 'None'}
Location: ${locationName || 'None'}
${guidance ? `Guidance: ${guidance}` : ''}
${effectiveVisualStylePrompt ? `Visual style: ${effectiveVisualStylePrompt}` : ''}

Grounding requirements:
- Preserve identity continuity for recurring participants across consecutive frames.
- Include story-significant objects/artifacts in frame participants when they matter to the beat.
- Keep location continuity stable unless a location shift is explicit in the prose.
- Frame order must form a coherent shot progression where each frame can visually follow the previous one.
- Participants must be explicit per frame: include only on-screen participants in this shot, never the full scene cast by default.
- If someone is off-screen in this beat, omit them from participants and participantRefs.

For each frame, provide:
- title (optional)
- description (1-2 sentences of what happens — may include appearance for readability)
- visual_beat (full visual description for readability — may include appearance)
- visual_direction (REQUIRED object):
  - action: what physically happens (verbs, motion, interaction — NO character appearance)
  - composition: spatial arrangement, framing, depth, subject positioning
  - lighting: light source type, direction, quality, color temperature, shadows
  - atmosphere: emotional tone, environmental mood, tension level
  - environment: setting details, props, weather (optional)
- appearance_notes (array of {name, details} — route ALL character appearance here:
  wardrobe, hair, facial features, body type, age presentation.
  This is for documentation only; it is excluded from image rendering.)
- participants (required: names visibly present in this frame)
- participantRefs (optional array with: name, action, pose, placement)
- location (name if explicit)
- dialogue (optional lines, if present in the frame)
- caption (optional narration box text)
- sfx (optional sound effect words)
- shotType (required: e.g., wide, medium, close-up, over-the-shoulder, insert, POV, low-angle, high-angle)
- camera (required: angle/height/movement/lens intent)
- mood (one or two words)

CRITICAL: visual_direction fields must NEVER contain character appearance, wardrobe, hair,
facial features, body type, or age descriptors. Route ALL such info to appearance_notes.
The image system reads ONLY visual_direction for rendering — appearance comes from reference images.

Shot variety requirements:
- Across ${frameCount} frames, use at least 3 distinct shot scales and 2 distinct camera angles/movements.
- Do not repeat the same shotType + camera pair in adjacent frames unless explicitly required by continuity.
- Blocking must evolve between frames; avoid static lineup staging.

Important participantRefs constraints:
- Do not include appearance, wardrobe, age, facial-hair, eyewear, or identity descriptors.
- Use participantRefs only for blocking/action/placement.

Return JSON only.`;

    let breakdown: z.infer<typeof SceneFrameBreakdownSchema> | null = null;
    try {
      breakdown = await llmAdapter.generateStructuredOutput(prompt, SceneFrameBreakdownSchema, {
        temperature: 0.6,
        maxTokens: 2500,
        modelPreference: 'fast',
      });
    } catch (error) {
      console.warn('Frame breakdown failed, using fallback:', error);
    }

    const framesSource = breakdown?.frames?.length
      ? breakdown.frames
      : (scene.prose || '').split('\n\n').filter(Boolean).slice(0, frameCount).map((p: string) => ({
          description: p.slice(0, 300),
          visual_beat: p.slice(0, 300),
          participants: participantNames,
          location: locationName,
        }));

    const shotTemplateCycle = [
      { shotType: 'wide establishing', camera: 'low-angle wide lens, strong depth lines', mood: 'tense setup' },
      { shotType: 'medium two-shot', camera: 'eye-level lateral move, balanced blocking', mood: 'rising pressure' },
      { shotType: 'close-up', camera: 'tight push-in on primary subject', mood: 'intense' },
      { shotType: 'over-the-shoulder', camera: 'reverse OTS framing with shallow depth', mood: 'confrontational' },
      { shotType: 'low-angle dynamic', camera: 'off-axis low angle, slight dutch tilt', mood: 'destabilized' },
      { shotType: 'wide aftermath', camera: 'high-angle pull-back revealing consequences', mood: 'aftershock' },
    ];

    const frames: any[] = [];
    let previousShotSignature = '';
    for (let idx = 0; idx < framesSource.length; idx++) {
      const frame: any = framesSource[idx];
      const rawFrameParticipants = Array.isArray(frame?.participants) ? frame.participants : [];
      const resolvedParticipants = rawFrameParticipants
        .map((name: string) => resolveEntityByName(projectData, name))
        .filter(Boolean)
        .map((entity: any) => entity.id);
      const rawParticipantRefs = Array.isArray((frame as any).participantRefs)
        ? (frame as any).participantRefs
        : [];
      const participantRefs = rawParticipantRefs
        .map((ref: any) => {
          const rawName = typeof ref?.name === 'string' ? ref.name : '';
          const resolvedEntity = rawName ? resolveEntityByName(projectData, rawName) : null;
          const resolvedName = resolvedEntity?.name || rawName || undefined;
          const action = typeof ref?.action === 'string' ? ref.action.trim() : undefined;
          const pose = typeof ref?.pose === 'string' ? ref.pose.trim() : undefined;
          const placement = typeof ref?.placement === 'string' ? ref.placement.trim() : undefined;
          if (!resolvedName && !resolvedEntity?.id) return null;
          return {
            entityId: resolvedEntity?.id,
            name: resolvedName || resolvedEntity?.id,
            ...(action ? { action } : {}),
            ...(pose ? { pose } : {}),
            ...(placement ? { placement } : {}),
          };
        })
        .filter(Boolean);
      const resolvedLocation = frame.location
        ? resolveEntityByName(projectData, frame.location)
        : (locationId ? resolveEntityByName(projectData, locationName || '') : null);
      const participantIdsFromRefs = participantRefs
        .map((ref: any) => ref?.entityId)
        .filter((candidate: any): candidate is string => typeof candidate === 'string');
      const previousFrameParticipantIds = idx > 0
        ? ((frames[idx - 1]?.participantIds || []).filter((candidate: any): candidate is string => typeof candidate === 'string'))
        : [];
      const finalParticipantIds = resolvedParticipants.length > 0
        ? resolvedParticipants
        : (participantIdsFromRefs.length > 0
          ? participantIdsFromRefs
          : (previousFrameParticipantIds.length > 0 ? previousFrameParticipantIds : participantIds));
      const fallbackParticipantRefs = finalParticipantIds.map((participantId: string) => {
        const participantEntity = projectData.entities.find((entity: any) => entity.id === participantId);
        return {
          entityId: participantId,
          name: participantEntity?.name || participantId,
        };
      });

      const shotTemplate = shotTemplateCycle[idx % shotTemplateCycle.length];
      let shotType = typeof frame?.shotType === 'string' ? frame.shotType.trim() : '';
      let camera = typeof frame?.camera === 'string' ? frame.camera.trim() : '';
      let mood = typeof frame?.mood === 'string' ? frame.mood.trim() : '';
      if (!shotType) shotType = shotTemplate.shotType;
      if (!camera) camera = shotTemplate.camera;
      if (!mood) mood = shotTemplate.mood;
      let shotSignature = `${shotType.toLowerCase()}|${camera.toLowerCase()}`;
      if (frameCount > 2 && shotSignature === previousShotSignature) {
        shotType = shotTemplate.shotType;
        camera = shotTemplate.camera;
        if (!mood) mood = shotTemplate.mood;
        shotSignature = `${shotType.toLowerCase()}|${camera.toLowerCase()}`;
      }
      previousShotSignature = shotSignature;

      frames.push({
        id: `frame_${id}_${Date.now()}_${idx}`,
        position: idx,
        title: frame.title || `Frame ${idx + 1}`,
        description: frame.description,
        visual_beat: frame.visual_beat,
        participantIds: finalParticipantIds,
        participantRefs: participantRefs.length > 0 ? participantRefs : fallbackParticipantRefs,
        locationId: resolvedLocation?.id || locationId,
        dialogue: frame.dialogue,
        caption: frame.caption,
        sfx: frame.sfx,
        shotType,
        camera,
        mood,
        visual_direction: frame.visual_direction || undefined,
        appearance_notes: frame.appearance_notes || undefined,
      });
    }

    scene.frames = frames;
    scene.updatedAt = new Date().toISOString();
    const storyGraph = applyStoryGraphDiffs(projectData);
    const persistedScene = (projectData.interactions || []).find((s: any) => s.id === scene.id) || scene;

    session.uncommittedChanges = true;
    if (!session.pendingChanges.addedSceneIds.has(scene.id)) {
      session.pendingChanges.modifiedSceneIds.add(scene.id);
    }
    saveProjectData(projectId, projectData);

    res.json({
      success: true,
      sceneId: persistedScene.id,
      frames: persistedScene.frames || frames,
      interaction: persistedScene,
      continuity: storyGraph.consistency,
    });
  } catch (error: any) {
    console.error('Generate frames error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate content for a single frame using scene context and neighboring frames
app.post('/api/narrative/interactions/:id/frames/:frameId/generate', async (req, res) => {
  try {
    const { id, frameId } = req.params;
    const projectId = req.body.projectId || getActiveProjectId();
    const { guidance, visualStylePrompt } = req.body || {};
    const effectiveVisualStylePrompt = getEffectiveVisualStylePrompt(projectId, visualStylePrompt);
    const projectData = loadProjectData(projectId);
    const session = getWorldSession(projectId);

    if (!llmAdapter) {
      return res.status(500).json({ error: 'LLM not configured - set GEMINI_API_KEY' });
    }

    const scene = projectData.interactions.find((i: any) => i.id === id);
    if (!scene) {
      return res.status(404).json({ error: 'Interaction not found' });
    }

    const frames: any[] = scene.frames || [];
    const frameIdx = frames.findIndex((f: any) => f.id === frameId);
    if (frameIdx === -1) {
      return res.status(404).json({ error: 'Frame not found' });
    }

    const participantIds = scene.participantIds || scene.participants || [];
    const participantNames = participantIds
      .map((pid: string) => projectData.entities.find((e: any) => e.id === pid)?.name || pid)
      .filter(Boolean);
    const locationId = scene.locationId || scene.location;
    const locationName = locationId
      ? (projectData.entities.find((e: any) => e.id === locationId)?.name || locationId)
      : undefined;

    // Build context from neighboring frames
    const prevFrame = frameIdx > 0 ? frames[frameIdx - 1] : null;
    const nextFrame = frameIdx < frames.length - 1 ? frames[frameIdx + 1] : null;
    const totalFrames = frames.length;

    const neighborContext: string[] = [];
    if (prevFrame) {
      neighborContext.push(`PREVIOUS FRAME (Frame ${frameIdx}): ${prevFrame.title ? `"${prevFrame.title}" — ` : ''}${prevFrame.description || 'No description'}${prevFrame.shotType ? ` [${prevFrame.shotType}, ${prevFrame.camera || ''}, ${prevFrame.mood || ''}]` : ''}`);
    }
    if (nextFrame?.description) {
      neighborContext.push(`NEXT FRAME (Frame ${frameIdx + 2}): ${nextFrame.title ? `"${nextFrame.title}" — ` : ''}${nextFrame.description}${nextFrame.shotType ? ` [${nextFrame.shotType}, ${nextFrame.camera || ''}, ${nextFrame.mood || ''}]` : ''}`);
    }

    const prompt = `You are a storyboard artist. Generate content for a SINGLE frame (Frame ${frameIdx + 1} of ${totalFrames}) in a scene.

Scene title: ${scene.title || 'Untitled'}
Scene prose: ${scene.prose || scene.content || scene.description || ''}
Known participants: ${participantNames.join(', ') || 'None'}
Location: ${locationName || 'None'}
${neighborContext.length > 0 ? `\nNeighboring frames for continuity:\n${neighborContext.join('\n')}` : ''}
${guidance ? `\nUser guidance for this frame: ${guidance}` : ''}
${effectiveVisualStylePrompt ? `Visual style: ${effectiveVisualStylePrompt}` : ''}

This is frame ${frameIdx + 1} of ${totalFrames} in the scene. ${prevFrame ? 'It follows the previous frame described above.' : 'It is the first frame.'} ${nextFrame?.description ? 'It precedes the next frame described above.' : 'It is the last frame.'}

Generate content for this single frame. Provide:
- title (optional)
- description (1-2 sentences of what happens — may include appearance for readability)
- visual_beat (full visual description for readability — may include appearance)
- visual_direction (REQUIRED object):
  - action: what physically happens (verbs, motion, interaction — NO character appearance)
  - composition: spatial arrangement, framing, depth, subject positioning
  - lighting: light source type, direction, quality, color temperature, shadows
  - atmosphere: emotional tone, environmental mood, tension level
  - environment: setting details, props, weather (optional)
- appearance_notes (array of {name, details} — route ALL character appearance here:
  wardrobe, hair, facial features, body type, age presentation.
  This is for documentation only; it is excluded from image rendering.)
- participants (names visibly present in this frame)
- participantRefs (optional array with: name, action, pose, placement)
- location (name if explicit)
- dialogue (optional lines, if present in the frame)
- caption (optional narration box text)
- sfx (optional sound effect words)
- shotType (required: e.g., wide, medium, close-up, over-the-shoulder, insert, POV)
- camera (required: angle/height/movement/lens intent)
- mood (one or two words)

CRITICAL: visual_direction fields must NEVER contain character appearance, wardrobe, hair,
facial features, body type, or age descriptors. Route ALL such info to appearance_notes.
The image system reads ONLY visual_direction for rendering — appearance comes from reference images.

Shot variety requirements:
${prevFrame?.shotType ? `- Previous frame uses "${prevFrame.shotType}" — choose a DIFFERENT shot type for visual variety.` : ''}
${nextFrame?.shotType ? `- Next frame uses "${nextFrame.shotType}" — choose a DIFFERENT shot type for visual variety.` : ''}

Important participantRefs constraints:
- Do not include appearance, wardrobe, age, facial-hair, eyewear, or identity descriptors.
- Use participantRefs only for blocking/action/placement.

Return JSON with a single frame object (not an array).`;

    let generatedFrame: z.infer<typeof SceneFrameSchema> | null = null;
    try {
      generatedFrame = await llmAdapter.generateStructuredOutput(prompt, SceneFrameSchema, {
        temperature: 0.6,
        maxTokens: 1200,
        modelPreference: 'fast',
      });
    } catch (error) {
      console.warn('Single frame generation failed:', error);
      return res.status(500).json({ error: 'Frame content generation failed' });
    }

    if (!generatedFrame) {
      return res.status(500).json({ error: 'No frame content generated' });
    }

    // Resolve entities
    const rawFrameParticipants = Array.isArray(generatedFrame.participants) ? generatedFrame.participants : [];
    const resolvedParticipants = rawFrameParticipants
      .map((name: string) => resolveEntityByName(projectData, name))
      .filter(Boolean)
      .map((entity: any) => entity.id);
    const rawParticipantRefs = Array.isArray(generatedFrame.participantRefs)
      ? generatedFrame.participantRefs
      : [];
    const participantRefs = rawParticipantRefs
      .map((ref: any) => {
        const rawName = typeof ref?.name === 'string' ? ref.name : '';
        const resolvedEntity = rawName ? resolveEntityByName(projectData, rawName) : null;
        const resolvedName = resolvedEntity?.name || rawName || undefined;
        const action = typeof ref?.action === 'string' ? ref.action.trim() : undefined;
        const pose = typeof ref?.pose === 'string' ? ref.pose.trim() : undefined;
        const placement = typeof ref?.placement === 'string' ? ref.placement.trim() : undefined;
        if (!resolvedName && !resolvedEntity?.id) return null;
        return {
          entityId: resolvedEntity?.id,
          name: resolvedName || resolvedEntity?.id,
          ...(action ? { action } : {}),
          ...(pose ? { pose } : {}),
          ...(placement ? { placement } : {}),
        };
      })
      .filter(Boolean);
    const resolvedLocation = generatedFrame.location
      ? resolveEntityByName(projectData, generatedFrame.location)
      : (locationId ? resolveEntityByName(projectData, locationName || '') : null);
    const participantIdsFromRefs = participantRefs
      .map((ref: any) => ref?.entityId)
      .filter((candidate: any): candidate is string => typeof candidate === 'string');
    const prevFrameParticipantIds = prevFrame
      ? ((prevFrame.participantIds || []).filter((c: any): c is string => typeof c === 'string'))
      : [];
    const finalParticipantIds = resolvedParticipants.length > 0
      ? resolvedParticipants
      : (participantIdsFromRefs.length > 0
        ? participantIdsFromRefs
        : (prevFrameParticipantIds.length > 0 ? prevFrameParticipantIds : participantIds));
    const fallbackParticipantRefs = finalParticipantIds.map((participantId: string) => {
      const participantEntity = projectData.entities.find((entity: any) => entity.id === participantId);
      return { entityId: participantId, name: participantEntity?.name || participantId };
    });

    // Apply shot template fallback
    const shotTemplateCycle = [
      { shotType: 'wide establishing', camera: 'low-angle wide lens, strong depth lines', mood: 'tense setup' },
      { shotType: 'medium two-shot', camera: 'eye-level lateral move, balanced blocking', mood: 'rising pressure' },
      { shotType: 'close-up', camera: 'tight push-in on primary subject', mood: 'intense' },
      { shotType: 'over-the-shoulder', camera: 'reverse OTS framing with shallow depth', mood: 'confrontational' },
      { shotType: 'low-angle dynamic', camera: 'off-axis low angle, slight dutch tilt', mood: 'destabilized' },
      { shotType: 'wide aftermath', camera: 'high-angle pull-back revealing consequences', mood: 'aftershock' },
    ];
    const shotTemplate = shotTemplateCycle[frameIdx % shotTemplateCycle.length];
    let shotType = typeof generatedFrame.shotType === 'string' ? generatedFrame.shotType.trim() : '';
    let camera = typeof generatedFrame.camera === 'string' ? generatedFrame.camera.trim() : '';
    let mood = typeof generatedFrame.mood === 'string' ? generatedFrame.mood.trim() : '';
    if (!shotType) shotType = shotTemplate.shotType;
    if (!camera) camera = shotTemplate.camera;
    if (!mood) mood = shotTemplate.mood;

    // Update the existing frame in place (keep id and position)
    const updatedFrame = {
      ...frames[frameIdx],
      title: generatedFrame.title || frames[frameIdx].title || `Frame ${frameIdx + 1}`,
      description: generatedFrame.description,
      visual_beat: generatedFrame.visual_beat,
      participantIds: finalParticipantIds,
      participantRefs: participantRefs.length > 0 ? participantRefs : fallbackParticipantRefs,
      locationId: resolvedLocation?.id || locationId,
      dialogue: generatedFrame.dialogue,
      caption: generatedFrame.caption,
      sfx: generatedFrame.sfx,
      shotType,
      camera,
      mood,
      visual_direction: generatedFrame.visual_direction || undefined,
      appearance_notes: generatedFrame.appearance_notes || undefined,
    };

    frames[frameIdx] = updatedFrame;
    scene.frames = frames;
    scene.updatedAt = new Date().toISOString();
    const storyGraph = applyStoryGraphDiffs(projectData);
    const persistedScene = (projectData.interactions || []).find((s: any) => s.id === scene.id) || scene;

    session.uncommittedChanges = true;
    if (!session.pendingChanges.addedSceneIds.has(scene.id)) {
      session.pendingChanges.modifiedSceneIds.add(scene.id);
    }
    saveProjectData(projectId, projectData);

    console.log(`🎬 Single frame generated: "${updatedFrame.title}" for scene "${scene.title}"`);
    res.json({
      success: true,
      sceneId: persistedScene.id,
      frame: updatedFrame,
      interaction: persistedScene,
    });
  } catch (error: any) {
    console.error('Generate single frame error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete an interaction (scene)
app.delete('/api/narrative/interactions/:id', (req, res) => {
  try {
    const { id } = req.params;
    const projectId = req.body?.projectId || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const session = getWorldSession(projectId);

    const index = projectData.interactions.findIndex(i => i.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Interaction not found' });
    }

    const removed = projectData.interactions.splice(index, 1)[0];
    const storyGraph = applyStoryGraphDiffs(projectData);
    session.uncommittedChanges = true;
    session.pendingChanges.addedSceneIds.delete(removed.id);
    session.pendingChanges.modifiedSceneIds.delete(removed.id);
    saveProjectData(projectId, projectData);

    console.log(`🗑️ Deleted scene: ${removed.title} (${removed.id})`);

    res.json({
      success: true,
      removed,
      continuity: storyGraph.consistency,
    });
  } catch (error: any) {
    console.error('Delete interaction error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Scratchpad documents (non-canon reference workspace)
type ScratchpadCategory = 'world_bible' | 'story_arc' | 'character_notes' | 'reference' | 'other';
const SCRATCHPAD_CATEGORIES = new Set<ScratchpadCategory>([
  'world_bible',
  'story_arc',
  'character_notes',
  'reference',
  'other',
]);

const normalizeScratchpadCategory = (value: any): ScratchpadCategory => {
  if (typeof value !== 'string') return 'other';
  const normalized = value.trim() as ScratchpadCategory;
  return SCRATCHPAD_CATEGORIES.has(normalized) ? normalized : 'other';
};

const ensureScratchpadDocuments = (projectData: ProjectData): any[] => {
  if (!Array.isArray((projectData as any).documents)) {
    (projectData as any).documents = [];
  }
  return (projectData as any).documents;
};

const normalizeScratchpadDocument = (document: any) => ({
  id: document.id,
  title: typeof document.title === 'string' && document.title.trim().length > 0
    ? document.title.trim()
    : 'Untitled Document',
  content: typeof document.content === 'string' ? document.content : '',
  category: normalizeScratchpadCategory(document.category),
  isPinned: Boolean(document.isPinned),
  source: typeof document.source === 'string' ? document.source : 'user',
  createdAt: typeof document.createdAt === 'number' ? document.createdAt : Date.now(),
  updatedAt: typeof document.updatedAt === 'number' ? document.updatedAt : Date.now(),
});

app.get('/api/narrative/documents', (req, res) => {
  try {
    const projectId = (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const documents = ensureScratchpadDocuments(projectData).map(normalizeScratchpadDocument);
    const sorted = [...documents].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    res.json(sorted);
  } catch (error: any) {
    console.error('List scratchpad documents error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/narrative/documents/:documentId', (req, res) => {
  try {
    const projectId = (req.query.projectId as string) || getActiveProjectId();
    const { documentId } = req.params;
    const projectData = loadProjectData(projectId);
    const documents = ensureScratchpadDocuments(projectData).map(normalizeScratchpadDocument);
    const document = documents.find((entry: any) => entry.id === documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(document);
  } catch (error: any) {
    console.error('Get scratchpad document error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/narrative/documents', (req, res) => {
  try {
    const projectId = req.body?.projectId || (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const documents = ensureScratchpadDocuments(projectData);
    const now = Date.now();
    const title = typeof req.body?.title === 'string' && req.body.title.trim().length > 0
      ? req.body.title.trim()
      : 'Untitled Document';
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    const category = normalizeScratchpadCategory(req.body?.category);
    const isPinned = Boolean(req.body?.isPinned);
    const source = typeof req.body?.source === 'string' ? req.body.source : 'user';

    const document = {
      id: `doc_${now}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      content,
      category,
      isPinned,
      source,
      createdAt: now,
      updatedAt: now,
    };

    documents.push(document);
    saveProjectData(projectId, projectData);

    res.status(201).json({
      success: true,
      document: normalizeScratchpadDocument(document),
    });
  } catch (error: any) {
    console.error('Create scratchpad document error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/narrative/documents/:documentId', (req, res) => {
  try {
    const projectId = req.body?.projectId || (req.query.projectId as string) || getActiveProjectId();
    const { documentId } = req.params;
    const projectData = loadProjectData(projectId);
    const documents = ensureScratchpadDocuments(projectData);
    const index = documents.findIndex((entry: any) => entry.id === documentId);
    if (index === -1) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const current = normalizeScratchpadDocument(documents[index]);
    const nextTitle = req.body?.title === undefined
      ? current.title
      : (typeof req.body.title === 'string' && req.body.title.trim().length > 0
        ? req.body.title.trim()
        : current.title);
    const nextContent = req.body?.content === undefined
      ? current.content
      : (typeof req.body.content === 'string' ? req.body.content : current.content);
    const nextCategory = req.body?.category === undefined
      ? current.category
      : normalizeScratchpadCategory(req.body.category);
    const nextPinned = req.body?.isPinned === undefined
      ? current.isPinned
      : Boolean(req.body.isPinned);
    const nextSource = req.body?.source === undefined
      ? current.source
      : (typeof req.body.source === 'string' ? req.body.source : current.source);

    const updated = {
      ...current,
      title: nextTitle,
      content: nextContent,
      category: nextCategory,
      isPinned: nextPinned,
      source: nextSource,
      updatedAt: Date.now(),
    };

    documents[index] = updated;
    saveProjectData(projectId, projectData);

    res.json({
      success: true,
      document: normalizeScratchpadDocument(updated),
    });
  } catch (error: any) {
    console.error('Update scratchpad document error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/narrative/documents/:documentId', (req, res) => {
  try {
    const projectId = req.body?.projectId || (req.query.projectId as string) || getActiveProjectId();
    const { documentId } = req.params;
    const projectData = loadProjectData(projectId);
    const documents = ensureScratchpadDocuments(projectData);
    const index = documents.findIndex((entry: any) => entry.id === documentId);
    if (index === -1) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const [removed] = documents.splice(index, 1);
    saveProjectData(projectId, projectData);

    res.json({
      success: true,
      removed: normalizeScratchpadDocument(removed),
    });
  } catch (error: any) {
    console.error('Delete scratchpad document error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Artifacts — diegetic media objects (Time covers, articles, memos, social
// posts, transcripts, etc.). Format is a free-form string; content is a
// flexible bag. Reference world entities/scenes via relatedEntityIds /
// relatedSceneIds. Primary image is content-addressable via a generation step.
// ============================================================================

const ensureArtifacts = (projectData: ProjectData): any[] => {
  if (!Array.isArray(projectData.artifacts)) projectData.artifacts = [];
  return projectData.artifacts;
};

app.get('/api/narrative/artifacts', (req, res) => {
  const projectId = (req.query.projectId as string) || getActiveProjectId();
  const projectData = loadProjectData(projectId);
  const artifacts = ensureArtifacts(projectData);
  res.json({ artifacts });
});

app.get('/api/narrative/artifacts/:id', (req, res) => {
  const projectId = (req.query.projectId as string) || getActiveProjectId();
  const projectData = loadProjectData(projectId);
  const artifact = ensureArtifacts(projectData).find((a: any) => a.id === req.params.id);
  if (!artifact) return res.status(404).json({ error: 'Artifact not found' });
  res.json({ artifact });
});

app.post('/api/narrative/artifacts', (req, res) => {
  try {
    const {
      projectId = getActiveProjectId(),
      title,
      format,
      description,
      inWorldDate,
      publication,
      byline,
      relatedEntityIds,
      relatedSceneIds,
      content,
      status,
      primaryImage,
      assets,
      extensions,
    } = req.body || {};

    if (!title || typeof title !== 'string') return res.status(400).json({ error: 'title is required' });
    if (!format || typeof format !== 'string') return res.status(400).json({ error: 'format is required' });

    const projectData = loadProjectData(projectId);
    const artifacts = ensureArtifacts(projectData);
    const now = new Date().toISOString();
    const artifact = {
      id: `artifact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: title.trim(),
      format: String(format).trim(),
      ...(description ? { description: String(description) } : {}),
      ...(inWorldDate ? { inWorldDate: String(inWorldDate) } : {}),
      ...(publication ? { publication: String(publication) } : {}),
      ...(byline ? { byline: String(byline) } : {}),
      relatedEntityIds: Array.isArray(relatedEntityIds) ? relatedEntityIds.map(String) : [],
      ...(Array.isArray(relatedSceneIds) ? { relatedSceneIds: relatedSceneIds.map(String) } : {}),
      content: typeof content === 'object' && content !== null ? content : {},
      ...(primaryImage ? { primaryImage } : {}),
      ...(Array.isArray(assets) ? { assets } : {}),
      status: status === 'published' ? 'published' : 'draft',
      createdAt: now,
      updatedAt: now,
      ...(extensions ? { extensions } : {}),
    };
    artifacts.push(artifact);
    saveProjectData(projectId, projectData);
    res.json({ artifact });
  } catch (error: any) {
    console.error('Create artifact error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/narrative/artifacts/:id', (req, res) => {
  try {
    const projectId = req.body?.projectId || (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const artifacts = ensureArtifacts(projectData);
    const idx = artifacts.findIndex((a: any) => a.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Artifact not found' });

    const updates = req.body?.updates && typeof req.body.updates === 'object' ? req.body.updates : req.body;
    const allowed = new Set([
      'title', 'format', 'description', 'inWorldDate', 'publication', 'byline',
      'relatedEntityIds', 'relatedSceneIds', 'content', 'status',
      'primaryImage', 'assets', 'extensions',
    ]);
    const next: any = { ...artifacts[idx] };
    for (const [k, v] of Object.entries(updates || {})) {
      if (allowed.has(k)) next[k] = v;
    }
    next.updatedAt = new Date().toISOString();
    artifacts[idx] = next;
    saveProjectData(projectId, projectData);
    res.json({ artifact: next });
  } catch (error: any) {
    console.error('Update artifact error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/narrative/artifacts/:id', (req, res) => {
  try {
    const projectId = req.body?.projectId || (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const artifacts = ensureArtifacts(projectData);
    const idx = artifacts.findIndex((a: any) => a.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Artifact not found' });
    const [removed] = artifacts.splice(idx, 1);
    saveProjectData(projectId, projectData);
    res.json({ success: true, removed });
  } catch (error: any) {
    console.error('Delete artifact error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Generate the primary image for an artifact. Uses the standard image generator
 * with optional entity-portrait references for grounding (e.g. a Time cover
 * featuring a character uses that character's portrait as a face reference).
 */
app.post('/api/narrative/artifacts/:id/generate-image', async (req, res) => {
  try {
    const projectId = req.body?.projectId || (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const artifacts = ensureArtifacts(projectData);
    const idx = artifacts.findIndex((a: any) => a.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Artifact not found' });
    const artifact = artifacts[idx];

    if (!imageGenerator) {
      return res.status(503).json({ error: 'Image generation not available - no API key' });
    }

    const { prompt, referenceEntityNames, referenceAssetNames, aspectRatio, model } = req.body || {};
    const effectiveVisualStylePrompt = getEffectiveVisualStylePrompt(projectId);
    const useGptForArtifact = typeof model === 'string'
      && (model === 'gpt-image' || model === 'gpt-image-1' || model === 'gpt-image-2' || model.startsWith('gpt-image-'))
      && gptImageGenerator;

    // Resolve refs to ReferenceImage objects for the image generator.
    // The caller (the AI tool) tells us exactly which entities to attach as
    // references. Nothing is auto-injected from artifact.relatedEntityIds.
    const references: Array<{ id: string; data: Buffer; mimeType: string; description: string; type: 'character' | 'location' | 'object' }> = [];
    let refOrdinal = 0;
    if (Array.isArray(referenceEntityNames)) {
      for (const name of referenceEntityNames) {
        const lower = String(name).toLowerCase();
        const ent = (projectData.entities || []).find((e: any) =>
          (e.name || '').toLowerCase() === lower || (e.name || '').toLowerCase().includes(lower)
        );
        const url = ent?.referenceImage || ent?.imageUrl;
        if (!url) continue;
        if (references.some(r => r.description.startsWith(ent.name))) continue;
        const asset = toImageDataFromUrl(url);
        if (!asset) continue;
        const entType = String(ent.type || '').toLowerCase();
        const refType: 'character' | 'location' | 'object' = entType === 'location' ? 'location' : (['object', 'artifact'].includes(entType) ? 'object' : 'character');
        references.push({
          id: `ref_${++refOrdinal}_${ent.id}`,
          data: asset.data,
          mimeType: asset.mimeType,
          description: ent.name + (ent.description ? `: ${String(ent.description).slice(0, 200)}` : ''),
          type: refType,
        });
      }
    }
    if (Array.isArray(referenceAssetNames)) {
      const projectAssets = Array.isArray(projectData.assets) ? projectData.assets : [];
      for (const name of referenceAssetNames) {
        const lower = String(name).toLowerCase();
        const asset = projectAssets.find((a: any) =>
          (a.name || '').toLowerCase() === lower || (a.name || '').toLowerCase().includes(lower)
        );
        if (!asset?.url) continue;
        const data = toImageDataFromUrl(asset.url);
        if (!data) continue;
        references.push({
          id: `ref_${++refOrdinal}_asset_${asset.id}`,
          data: data.data,
          mimeType: data.mimeType,
          description: `Uploaded asset: ${asset.name}${asset.description ? ` — ${String(asset.description).slice(0, 200)}` : ''}`,
          type: asset.category === 'location' ? 'location' : (asset.category === 'object' ? 'object' : 'character'),
        });
      }
    }

    // Visual style is the only auto-applied directive (project-level
    // preference). Everything else in the prompt comes verbatim from the
    // caller. The AI sees the visual style line in its own context so the
    // injection is not invisible from its perspective.
    const fullPrompt = [
      effectiveVisualStylePrompt ? `[PROJECT VISUAL STYLE: ${effectiveVisualStylePrompt}]` : null,
      prompt || '',
    ].filter(Boolean).join('\n\n');

    const backendUsed = useGptForArtifact ? 'gpt-image' : 'nano-banana';
    console.log(`🗞️  Generating artifact image [${backendUsed}] for: ${artifact.title} (${artifact.format}, ${references.length} refs)`);

    const result = await (useGptForArtifact && gptImageGenerator
      ? gptImageGenerator.generateImage(
          fullPrompt,
          references.length > 0 ? references : undefined,
          aspectRatio ? { aspectRatio } : undefined,
        )
      : imageGenerator.generateImage(
          fullPrompt,
          references.length > 0 ? references : undefined,
          aspectRatio ? { aspectRatio } : undefined,
        )
    );

    if (!result || !result.data) {
      return res.status(500).json({ error: 'Image generation produced no result' });
    }

    // Persist to disk
    const safeTitle = String(artifact.title || 'artifact').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
    const filename = `artifact_${artifact.id}_${safeTitle}_${Date.now()}.${result.mimeType?.includes('png') ? 'png' : 'jpeg'}`;
    const savedPath = path.join(GENERATED_IMAGES_DIR, filename);
    fs.writeFileSync(savedPath, result.data);
    const imageUrl = `/api/narrative/visual/images/${filename}`;

    artifact.primaryImage = {
      url: imageUrl,
      mimeType: result.mimeType || 'image/jpeg',
      generatedAt: new Date().toISOString(),
      ...(prompt ? { prompt } : {}),
    };
    artifact.updatedAt = new Date().toISOString();
    saveProjectData(projectId, projectData);

    res.json({
      artifact,
      imageUrl,
      backend: backendUsed,
      actualPromptSent: fullPrompt,
      callerPrompt: prompt,
      styleDirectiveApplied: Boolean(effectiveVisualStylePrompt),
      referencesAttached: references.map((r) => ({ description: r.description, type: r.type })),
    });
  } catch (error: any) {
    console.error('Artifact image generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// STORYBOARD ENDPOINTS — multi-panel storyboard pages generated from script
// chunks, with panel extraction to create individual frames anchored to the
// page. Storyboard pages persist as artifacts with format='storyboard_page'
// so they show up in the artifact UI too.
// ============================================================================

/**
 * Generate a multi-panel storyboard page from a script chunk.
 * Uses GPT Image 1 by default — it's the strongest model for multi-panel
 * layouts with consistent rendering across panels. Caller can override.
 */
app.post('/api/narrative/storyboard/generate', async (req, res) => {
  try {
    const {
      projectId = getActiveProjectId(),
      scriptChunk,
      title,
      panelCount = 12,
      panelStyle = 'comic',
      sceneId, // optional — if provided, the storyboard is associated with a scene
      model = 'gpt-image',
      aspectRatio = '2:3',
    } = req.body || {};

    if (!scriptChunk || typeof scriptChunk !== 'string') {
      return res.status(400).json({ error: 'scriptChunk is required' });
    }

    const effectiveBackend = model === 'nano-banana' ? imageGenerator : (gptImageGenerator || imageGenerator);
    if (!effectiveBackend) {
      return res.status(503).json({ error: 'No image generator available' });
    }

    // Build a storyboard prompt that asks the model to break the script into
    // N panels with clear panel borders and per-panel framing. We let the AI
    // (via the chat) build a richer prompt when needed; this default works
    // for direct UI invocations.
    const projectData = loadProjectData(projectId);
    const effectiveVisualStylePrompt = getEffectiveVisualStylePrompt(projectId);
    const styleAssetIds: string[] = (projects.find((p: any) => p.id === projectId)?.styleProfile?.styleAssetIds) || [];
    const styleAssetUrls = styleAssetIds
      .map((id) => (projectData.assets || []).find((a: any) => a.id === id)?.url)
      .filter((u: string | undefined): u is string => Boolean(u));

    const cols = panelCount === 6 ? 3 : panelCount === 9 ? 3 : panelCount === 12 ? 4 : 4;
    const rows = Math.ceil(panelCount / cols);

    const styleHeader = effectiveVisualStylePrompt
      ? `Render the entire page in this locked visual style: ${effectiveVisualStylePrompt}\n\n`
      : '';

    const fullPrompt = `${styleHeader}STORYBOARD PAGE — ${rows}-row × ${cols}-column layout of ${panelCount} sequential panels.

Each panel is a distinct shot of the same continuous scene, framed with clear black borders. Number each panel 1-${panelCount} in small text in the top-left corner of the panel. Maintain visually consistent character design, lighting, and rendering style across ALL panels — this is one storyboard page for one scene, not a gallery of unrelated images.

Break this script chunk into ${panelCount} visual beats, one per panel. Each panel should be a different shot type or moment (wide establishing, medium two-shot, close-up, OTS, action, reaction, insert, etc.) but the SAME story moment continued through time. Show motion, emotion, and continuity panel-to-panel.

Panel style: ${panelStyle === 'comic' ? 'cinematic storyboard with painterly fills inside crisp black borders' : panelStyle}.

SCRIPT CHUNK:
"""
${scriptChunk}
"""

Render the full page as ONE image with ${panelCount} clearly delineated panels.`;

    // Resolve style refs to attach
    const references: Array<{ id: string; data: Buffer; mimeType: string; description: string; type: 'character' | 'location' | 'object' }> = [];
    for (const url of styleAssetUrls) {
      const asset = toImageDataFromUrl(url);
      if (!asset) continue;
      references.push({
        id: `ref_style_${references.length + 1}`,
        data: asset.data,
        mimeType: asset.mimeType,
        description: 'PROJECT STYLE REFERENCE — render every panel in this exact rendering style.',
        type: 'character',
      });
    }

    console.log(`📋 /storyboard/generate [${model}]: ${panelCount} panels (${rows}×${cols}), ${references.length} style refs`);

    const result = await effectiveBackend.generateImage(
      fullPrompt,
      references.length > 0 ? references : undefined,
      { aspectRatio: aspectRatio as any },
    );

    if (!result?.data) return res.status(500).json({ error: 'Storyboard generation produced no image' });

    const ext = result.mimeType?.includes('png') ? 'png' : 'jpeg';
    const filename = `storyboard_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
    const fullPath = path.join(GENERATED_IMAGES_DIR, filename);
    fs.writeFileSync(fullPath, result.data);
    const imageUrl = `/api/narrative/visual/images/${filename}`;

    // Persist as an artifact with format='storyboard_page' so it shows up
    // alongside other diegetic media. Storyboards are technically diegetic
    // production artifacts.
    const artifact: any = {
      id: `artifact_storyboard_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      title: title || `Storyboard (${panelCount} panels)`,
      format: 'storyboard_page',
      description: scriptChunk.slice(0, 200),
      primaryImage: {
        url: imageUrl,
        mimeType: result.mimeType || 'image/png',
        generatedAt: new Date().toISOString(),
        prompt: fullPrompt,
      },
      content: {
        scriptChunk,
        panelCount,
        rows,
        cols,
        backend: model,
        ...(sceneId ? { sceneId } : {}),
      },
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const artifacts = ensureArtifacts(projectData);
    artifacts.push(artifact);
    saveProjectData(projectId, projectData);

    res.json({
      success: true,
      artifact,
      imageUrl,
      panelCount,
      rows,
      cols,
      actualPromptSent: fullPrompt,
      callerPrompt: scriptChunk,
      styleDirectiveApplied: Boolean(effectiveVisualStylePrompt),
      referencesAttached: references.map((r) => ({ description: r.description, type: r.type })),
    });
  } catch (error: any) {
    console.error('Storyboard generate error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Extract a panel from a storyboard page as a frame in a scene.
 * Doesn't crop the source image (no native image-cropping dep) — instead
 * stores the panel index/position on the new frame and attaches the full
 * storyboard page as a reference. The user re-renders the frame with
 * Nano Banana using the storyboard as the visual anchor.
 */
app.post('/api/narrative/storyboard/:artifactId/extract-panel', async (req, res) => {
  try {
    const projectId = (req.body?.projectId as string) || (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const artifacts = ensureArtifacts(projectData);
    const artifact = artifacts.find((a: any) => a.id === req.params.artifactId);
    if (!artifact || artifact.format !== 'storyboard_page') return res.status(404).json({ error: 'Storyboard not found' });

    const { panelIndex, targetSceneId, targetSceneTitle, frameTitle, frameDescription, position } = req.body || {};
    if (typeof panelIndex !== 'number' || panelIndex < 0) return res.status(400).json({ error: 'panelIndex (0-based) is required' });

    // Resolve target scene (create one if not specified — call it after the storyboard)
    let scene: any = null;
    if (targetSceneId) {
      scene = projectData.interactions.find((s: any) => s.id === targetSceneId);
    } else if (targetSceneTitle) {
      const lower = String(targetSceneTitle).toLowerCase();
      scene = projectData.interactions.find((s: any) =>
        (s.title || '').toLowerCase() === lower || (s.title || '').toLowerCase().includes(lower)
      );
    }
    if (!scene) {
      // Create a new scene to receive the extracted frames
      const newScene = {
        id: `scene_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        title: targetSceneTitle || `From storyboard: ${artifact.title}`,
        prose: '',
        description: artifact.description || '',
        status: 'draft',
        participantIds: [],
        frames: [],
        position: projectData.interactions.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sourceStoryboardId: artifact.id,
      };
      projectData.interactions.push(newScene);
      scene = newScene;
    }

    const frames = [...(scene.frames || [])];
    const insertIdx = typeof position === 'number' ? Math.min(Math.max(0, position), frames.length) : frames.length;

    const newFrame: any = {
      id: `frame_${scene.id}_${Date.now()}_sb`,
      position: insertIdx,
      title: frameTitle || `Panel ${panelIndex + 1}`,
      description: frameDescription || '',
      // Mark this frame as derived from a storyboard panel so the UI / AI
      // can show it and the re-render flow knows what to anchor to.
      sourceStoryboardId: artifact.id,
      sourceStoryboardPanelIndex: panelIndex,
      sourceStoryboardImageUrl: artifact.primaryImage?.url,
    };
    frames.splice(insertIdx, 0, newFrame);
    frames.forEach((f: any, i: number) => { f.position = i; });
    scene.frames = frames;
    scene.updatedAt = new Date().toISOString();
    saveProjectData(projectId, projectData);

    res.json({ success: true, scene, frame: newFrame });
  } catch (error: any) {
    console.error('Storyboard extract-panel error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * List storyboard artifacts for the project (convenience — filters artifacts
 * by format='storyboard_page').
 */
app.get('/api/narrative/storyboards', (req, res) => {
  try {
    const projectId = (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const all = ensureArtifacts(projectData);
    const storyboards = all.filter((a: any) => a.format === 'storyboard_page');
    storyboards.sort((a: any, b: any) => (new Date(b.createdAt || 0).getTime()) - (new Date(a.createdAt || 0).getTime()));
    res.json({ storyboards, total: storyboards.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ASSET ENDPOINTS — user-uploaded reference material (character sheets,
// locations, style refs, etc.). Distinct from artifacts (in-universe media)
// and from generated images (rolled up virtually via /assets/generated).
// ============================================================================

const ensureAssets = (projectData: ProjectData): any[] => {
  if (!Array.isArray(projectData.assets)) projectData.assets = [];
  return projectData.assets!;
};

const ASSET_CATEGORIES = new Set([
  'character', 'scene', 'location', 'object', 'style', 'reference', 'other',
]);

const inferExtensionFromMime = (mimeType: string, originalName: string): string => {
  const fromName = path.extname(originalName).toLowerCase().replace(/^\./, '');
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/svg+xml') return 'svg';
  return 'jpg';
};

// LIST — supports ?category=, ?tag=, ?linkedEntityId=, ?search=
app.get('/api/narrative/assets', (req, res) => {
  try {
    const projectId = (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const assets = ensureAssets(projectData);

    const category = (req.query.category as string) || '';
    const tag = (req.query.tag as string) || '';
    const linkedEntityId = (req.query.linkedEntityId as string) || '';
    const search = ((req.query.search as string) || '').toLowerCase();

    let filtered = assets;
    if (category) filtered = filtered.filter((a: any) => a.category === category);
    if (tag) filtered = filtered.filter((a: any) => Array.isArray(a.tags) && a.tags.includes(tag));
    if (linkedEntityId) filtered = filtered.filter((a: any) => Array.isArray(a.linkedEntityIds) && a.linkedEntityIds.includes(linkedEntityId));
    if (search) {
      filtered = filtered.filter((a: any) => {
        const haystack = `${a.name || ''} ${a.description || ''} ${(a.tags || []).join(' ')}`.toLowerCase();
        return haystack.includes(search);
      });
    }

    // Newest first
    const sorted = [...filtered].sort((a: any, b: any) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
    res.json({ assets: sorted, total: sorted.length });
  } catch (error: any) {
    console.error('List assets error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GENERATED ROLLUP — virtual list scanning entities/scenes/frames/artifacts
// for imageUrls. Returns asset-shaped objects with source attribution so the
// UI Assets view "Generated" tab can render them with the same card UI.
app.get('/api/narrative/assets/generated', (req, res) => {
  try {
    const projectId = (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const out: any[] = [];

    // Entities — referenceImage (primary portrait) + variations + galleries
    for (const e of projectData.entities || []) {
      if (e.referenceImage) {
        out.push({
          id: `gen_entity_${e.id}_primary`,
          url: e.referenceImage,
          category: 'character',
          name: `${e.name || 'Entity'} — portrait`,
          source: 'entity',
          sourceId: e.id,
          sourceLabel: e.name,
          sourceKind: 'portrait',
          uploadedAt: 0,
        });
      }
      if (Array.isArray(e.imageVariations)) {
        e.imageVariations.forEach((v: any, i: number) => {
          if (!v?.url) return;
          out.push({
            id: `gen_entity_${e.id}_var_${i}`,
            url: v.url,
            category: 'character',
            name: `${e.name || 'Entity'} — variation ${i + 1}${v.label ? ` (${v.label})` : ''}`,
            source: 'entity',
            sourceId: e.id,
            sourceLabel: e.name,
            sourceKind: 'variation',
            uploadedAt: v.generatedAt ? new Date(v.generatedAt).getTime() : 0,
          });
        });
      }
      if (Array.isArray(e.gallery)) {
        e.gallery.forEach((g: any, i: number) => {
          if (!g?.url) return;
          out.push({
            id: `gen_entity_${e.id}_gallery_${i}`,
            url: g.url,
            category: 'character',
            name: `${e.name || 'Entity'} — ${g.label || `gallery ${i + 1}`}`,
            source: 'entity',
            sourceId: e.id,
            sourceLabel: e.name,
            sourceKind: 'gallery',
            uploadedAt: g.generatedAt ? new Date(g.generatedAt).getTime() : 0,
          });
        });
      }
    }

    // Scenes + frames
    for (const s of projectData.interactions || []) {
      if (s.imageUrl) {
        out.push({
          id: `gen_scene_${s.id}`,
          url: s.imageUrl,
          category: 'scene',
          name: `${s.title || 'Scene'} — establishing`,
          source: 'scene',
          sourceId: s.id,
          sourceLabel: s.title,
          sourceKind: 'scene',
          uploadedAt: s.updatedAt ? new Date(s.updatedAt).getTime() : 0,
        });
      }
      for (const f of s.frames || []) {
        if (f.imageUrl) {
          out.push({
            id: `gen_frame_${s.id}_${f.id}`,
            url: f.imageUrl,
            category: 'scene',
            name: `${s.title || 'Scene'} — ${f.title || `Frame ${(f.position ?? 0) + 1}`}`,
            source: 'frame',
            sourceId: f.id,
            sourceParentId: s.id,
            sourceLabel: `${s.title} / ${f.title || 'Frame'}`,
            sourceKind: 'frame',
            uploadedAt: f.lastImageAt ? new Date(f.lastImageAt).getTime() : 0,
          });
        }
      }
    }

    // Artifacts — diegetic media imagery
    for (const a of projectData.artifacts || []) {
      if (a.primaryImage?.url) {
        out.push({
          id: `gen_artifact_${a.id}`,
          url: a.primaryImage.url,
          category: 'object',
          name: `${a.title || 'Artifact'}${a.format ? ` (${a.format})` : ''}`,
          source: 'artifact',
          sourceId: a.id,
          sourceLabel: a.title,
          sourceKind: 'artifact',
          uploadedAt: a.primaryImage.generatedAt ? new Date(a.primaryImage.generatedAt).getTime() : 0,
        });
      }
    }

    out.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
    res.json({ assets: out, total: out.length });
  } catch (error: any) {
    console.error('List generated assets error:', error);
    res.status(500).json({ error: error.message });
  }
});

// STATIC FILE — serve uploaded asset files. Filename is the asset ID + ext;
// project scoping is enforced by the catalog (the URL is only discoverable
// via the asset record, which is per-project). For local dev that's fine.
app.get('/api/narrative/assets/files/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // strip any traversal
  const filePath = path.join(UPLOADED_ASSETS_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Asset file not found' });
  res.sendFile(filePath);
});

// UPLOAD — accepts multipart/form-data with one or more "files" entries.
// Optional form fields: category, name, description, tags (comma-separated),
// linkedEntityIds (comma-separated). Returns the created Asset records.
app.post('/api/narrative/assets', uploadAsset.array('files', 30), async (req, res) => {
  try {
    const projectId = (req.body?.projectId as string) || (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const assets = ensureAssets(projectData);

    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) return res.status(400).json({ error: 'No files provided' });

    const category = ASSET_CATEGORIES.has(req.body?.category) ? req.body.category : 'reference';
    const sharedName = (req.body?.name as string) || '';
    const description = (req.body?.description as string) || '';
    const tags = typeof req.body?.tags === 'string'
      ? req.body.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : Array.isArray(req.body?.tags) ? req.body.tags : [];
    const linkedEntityIds = typeof req.body?.linkedEntityIds === 'string'
      ? req.body.linkedEntityIds.split(',').map((t: string) => t.trim()).filter(Boolean)
      : Array.isArray(req.body?.linkedEntityIds) ? req.body.linkedEntityIds : [];

    const created: any[] = [];
    for (const f of files) {
      const id = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const ext = inferExtensionFromMime(f.mimetype, f.originalname);
      const filename = `${id}.${ext}`;
      const fullPath = path.join(UPLOADED_ASSETS_DIR, filename);
      fs.writeFileSync(fullPath, f.buffer);

      const baseName = path.basename(f.originalname, path.extname(f.originalname));
      const asset = {
        id,
        category,
        name: sharedName || baseName || 'Untitled asset',
        description,
        tags,
        url: `/api/narrative/assets/files/${filename}`,
        mimeType: f.mimetype,
        originalFilename: f.originalname,
        fileSize: f.size,
        uploadedAt: Date.now(),
        linkedEntityIds,
      };
      assets.push(asset);
      created.push(asset);
    }
    saveProjectData(projectId, projectData);
    res.json({ success: true, assets: created, total: assets.length });
  } catch (error: any) {
    console.error('Asset upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// SINGLE — get one asset by ID
app.get('/api/narrative/assets/:id', (req, res) => {
  try {
    const projectId = (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const asset = ensureAssets(projectData).find((a: any) => a.id === req.params.id);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json({ asset });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE — patch metadata (name, description, tags, category, links)
app.patch('/api/narrative/assets/:id', (req, res) => {
  try {
    const projectId = (req.body?.projectId as string) || (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const assets = ensureAssets(projectData);
    const asset = assets.find((a: any) => a.id === req.params.id);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    const { name, description, tags, category, linkedEntityIds, linkedSceneIds } = req.body || {};
    if (typeof name === 'string') asset.name = name;
    if (typeof description === 'string') asset.description = description;
    if (Array.isArray(tags)) asset.tags = tags;
    if (typeof category === 'string' && ASSET_CATEGORIES.has(category)) asset.category = category;
    if (Array.isArray(linkedEntityIds)) asset.linkedEntityIds = linkedEntityIds;
    if (Array.isArray(linkedSceneIds)) asset.linkedSceneIds = linkedSceneIds;

    saveProjectData(projectId, projectData);
    res.json({ success: true, asset });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE — remove asset record + file on disk
app.delete('/api/narrative/assets/:id', (req, res) => {
  try {
    const projectId = (req.body?.projectId as string) || (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const assets = ensureAssets(projectData);
    const idx = assets.findIndex((a: any) => a.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Asset not found' });
    const [removed] = assets.splice(idx, 1);

    // Best-effort file cleanup
    try {
      const filename = path.basename(removed.url || '');
      if (filename) {
        const full = path.join(UPLOADED_ASSETS_DIR, filename);
        if (fs.existsSync(full)) fs.unlinkSync(full);
      }
    } catch (err) {
      console.warn('Failed to delete asset file:', err);
    }

    // Best-effort: remove from style asset pins if referenced
    try {
      const proj = projects.find((p: any) => p.id === projectId);
      if (proj?.styleProfile?.styleAssetIds) {
        proj.styleProfile.styleAssetIds = proj.styleProfile.styleAssetIds.filter((id: string) => id !== removed.id);
        saveProjects(projects);
      }
    } catch { /* ignore */ }

    saveProjectData(projectId, projectData);
    res.json({ success: true, removed });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PIN/UNPIN AS PROJECT STYLE — toggles whether this asset is auto-attached
// as a reference on every /render call for this project. Used for global
// "this is how everything in this world should look" style references.
app.post('/api/narrative/assets/:id/toggle-style-pin', (req, res) => {
  try {
    const projectId = (req.body?.projectId as string) || (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const asset = ensureAssets(projectData).find((a: any) => a.id === req.params.id);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    const projectIdx = projects.findIndex((p: any) => p.id === projectId);
    if (projectIdx < 0) return res.status(404).json({ error: 'Project not found' });

    const current: string[] = projects[projectIdx].styleProfile?.styleAssetIds || [];
    const isPinned = current.includes(asset.id);
    const next = isPinned ? current.filter((id) => id !== asset.id) : [...current, asset.id];

    const base = projects[projectIdx].styleProfile || {};
    projects[projectIdx] = {
      ...projects[projectIdx],
      styleProfile: { ...base, styleAssetIds: next, updatedAt: Date.now() },
      updatedAt: Date.now(),
    };
    saveProjects(projects);

    res.json({ success: true, pinned: !isPinned, styleAssetIds: next });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PROMOTE — set this asset as the primary portrait of an entity, or add to
// its gallery. Convenience wrapper so the UI doesn't have to munge URLs.
app.post('/api/narrative/assets/:id/promote-to-portrait', (req, res) => {
  try {
    const projectId = (req.body?.projectId as string) || (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const asset = ensureAssets(projectData).find((a: any) => a.id === req.params.id);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    const entityId = req.body?.entityId;
    if (!entityId) return res.status(400).json({ error: 'entityId is required' });
    const entity = (projectData.entities || []).find((e: any) => e.id === entityId);
    if (!entity) return res.status(404).json({ error: 'Entity not found' });

    entity.referenceImage = asset.url;
    entity.updatedAt = new Date().toISOString();

    // Track the link so the asset detail view can show it
    asset.linkedEntityIds = Array.from(new Set([...(asset.linkedEntityIds || []), entityId]));

    saveProjectData(projectId, projectData);
    res.json({ success: true, entity, asset });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Git operations
app.get('/api/narrative/git/log', (req, res) => {
  const { data } = getProjectDataForRequest();
  res.json(data.commits);
});

app.get('/api/narrative/git/commits', (req, res) => {
  const { data } = getProjectDataForRequest();
  // Return commits with proper timestamp format for the UI
  const commits = data.commits.map((c: any, index: number) => ({
    ...c,
    timestamp: c.timestamp ? new Date(c.timestamp).getTime() : Date.now(),
    isHead: index === 0, // Most recent commit is HEAD
  }));
  res.json(commits);
});

app.get('/api/narrative/git/commit/:id', (req, res) => {
  const { data } = getProjectDataForRequest();
  const commit = data.commits.find((c: any) => c.id === req.params.id || c.hash?.startsWith(req.params.id));
  if (!commit) return res.status(404).json({ error: 'Commit not found' });

  // Return commit with diff data for the UI
  res.json({
    commit: {
      ...commit,
      timestamp: commit.timestamp ? new Date(commit.timestamp).getTime() : Date.now(),
    },
    entityDiffs: commit.operations?.filter((op: any) => ['add', 'update', 'remove'].includes(op.type)).map((op: any, i: number) => ({
      entityId: `entity_${i}`,
      entityName: op.entityName,
      entityType: op.entityType,
      changeType: op.type === 'add' ? 'added' : op.type === 'remove' ? 'removed' : 'modified',
      changes: op.type === 'update' ? [{ field: 'description', oldValue: 'Previous state', newValue: 'Updated state' }] : [],
    })) || [],
    relationshipDiffs: commit.operations?.filter((op: any) => op.type === 'link').map((op: any, i: number) => ({
      relationshipId: `rel_${i}`,
      changeType: 'added',
      sourceEntity: op.entityName?.split(' → ')[0] || 'Unknown',
      targetEntity: op.entityName?.split(' → ')[1] || 'Unknown',
      relationType: 'related_to',
    })) || [],
  });
});

app.get('/api/narrative/git/commits/:hash', (req, res) => {
  const { data } = getProjectDataForRequest();
  const commit = data.commits.find((c: any) => c.hash?.startsWith(req.params.hash));
  if (!commit) return res.status(404).json({ error: 'Commit not found' });
  res.json(commit);
});

app.get('/api/narrative/git/branches', (req, res) => {
  const { data } = getProjectDataForRequest();
  res.json(data.branches);
});

app.post('/api/narrative/git/branch', (req, res) => {
  const { name, from } = req.body;
  res.json({ success: true, branch: name, from: from || 'main' });
});

app.post('/api/narrative/git/checkout', (req, res) => {
  const { branch } = req.body;
  res.json({ success: true, branch });
});

app.post('/api/narrative/git/merge', (req, res) => {
  const { source, target, strategy } = req.body;
  res.json({ success: true, merged: true, source, target, strategy });
});

app.delete('/api/narrative/git/branches/:name', (req, res) => {
  res.json({ success: true, deleted: req.params.name });
});

app.get('/api/narrative/git/diff/:from/:to', (req, res) => {
  res.json({ from: req.params.from, to: req.params.to, entityDiffs: [], relationshipDiffs: [] });
});

// Graph
app.get('/api/narrative/graph', (req, res) => {
  const { data } = getProjectDataForRequest();
  const nodes = data.entities.map((e: any, i: number) => ({
    id: e.id,
    type: 'entityNode',
    position: { x: 100 + (i % 4) * 200, y: 50 + Math.floor(i / 4) * 200 },
    data: { label: e.name, type: e.type, description: e.description, traits: e.traits },
  }));
  const edges = data.relationships.map((r: any) => ({
    id: r.id,
    source: r.sourceId,
    target: r.targetId,
    label: r.type?.replace('_', ' ') || 'related',
    type: 'smoothstep',
  }));
  res.json({ nodes, edges });
});

// Extraction
app.post('/api/narrative/extract', (req, res) => {
  res.json({ success: true, message: 'Extraction queued', branch: req.body.branch || 'main' });
});

// Visual generation - Entity Portrait
app.post('/api/narrative/visual/portraits/:entityId', async (req, res) => {
  try {
    const { entityId } = req.params;
    const projectId = req.body.projectId || getActiveProjectId();

    if (!portraitGenerator) {
      return res.status(503).json({ error: 'Image generation not available - no API key' });
    }

    const projectData = loadProjectData(projectId);
    const entity = projectData.entities.find(e => e.id === entityId);

    if (!entity) {
      return res.status(404).json({ error: `Entity not found: ${entityId}` });
    }

    // Merge visual style into entity description (matching the pattern in manual endpoint and auto-generation)
    const effectiveVisualStylePrompt = getEffectiveVisualStylePrompt(projectId);
    let entityForGeneration = entity;
    if (effectiveVisualStylePrompt) {
      const mergedDescription = `[VISUAL STYLE: ${effectiveVisualStylePrompt}]\n\n${entity.description || ''}`.trim();
      entityForGeneration = { ...entity, description: mergedDescription };
    }

    const isLocation = isLocationEntityType(entity.type);
    console.log(`🎨 Generating ${isLocation ? 'location shot' : 'portrait'} for: ${entity.name}`);
    const result = isLocation
      ? await portraitGenerator.generateLocationShot(entityForGeneration)
      : await portraitGenerator.generatePortrait(entityForGeneration);
    const image = isLocation ? (result as any).establishingShot : (result as any).portrait;

    // Return base64 encoded image
    res.json({
      success: true,
      entityId,
      entityName: entity.name,
      image: image.data.toString('base64'),
      mimeType: image.mimeType,
      prompt: image.prompt,
    });
  } catch (error: any) {
    console.error('Portrait generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Visual generation - Camera Angle Re-render
// Full scene re-generation from a different virtual camera position, with character/location references for identity consistency
app.post('/api/narrative/visual/camera-angle', async (req, res) => {
  try {
    const { imageUrl, cameraDescription, sceneData, aspectRatio: reqAspectRatio, projectId: reqProjectId } = req.body;
    if (!imageGenerator) {
      return res.status(503).json({ error: 'Image generation not available - no API key' });
    }
    if (!imageUrl || typeof imageUrl !== 'string') {
      return res.status(400).json({ error: 'imageUrl is required' });
    }
    if (!cameraDescription || typeof cameraDescription !== 'string') {
      return res.status(400).json({ error: 'cameraDescription is required' });
    }

    const resolvedSource = toImageDataFromUrl(imageUrl);
    if (!resolvedSource) {
      return res.status(400).json({ error: 'Could not resolve source image from imageUrl' });
    }

    // Build the source image as a "source" reference (edit anchor, not continuity)
    const sourceRef: import('../visual/image-generator').ReferenceImage = {
      id: 'camera_angle_source',
      data: resolvedSource.data,
      mimeType: resolvedSource.mimeType,
      description: 'Current scene render — edit this image from a new camera angle',
      type: 'source',
    };

    // ------------------------------------------------------------------
    // Edit-centric camera angle path: source image is the primary input,
    // camera direction is a relative change, character refs for identity only.
    // ------------------------------------------------------------------
    if (sceneData && (sceneData.prose || sceneData.description)) {
      const projectId = reqProjectId || getActiveProjectId();
      const projectData = loadProjectData(projectId);
      const sceneId = sceneData.id || 'camera_angle_scene';
      console.log(`📷 Camera angle edit for scene: ${sceneData.title || sceneId}`);

      // Resolve character refs only — needed for face identity on rotations
      const refs = resolveSceneReferences(sceneData, projectData, {
        usePro: true,
        includeCharacterAlternates: false,
        includePreviousShots: false,
        sceneId,
      });

      // Short, edit-focused prompt — source image is the dominant signal
      const editProse = `Re-render this scene from a different camera angle.

The attached source image shows the current camera position. Move the camera to: ${cameraDescription}.

Preserve everything — subjects, identities, wardrobe, lighting, environment, props. Only change the virtual camera position and framing. Characters must match their reference portraits.`;

      const image = await imageGenerator.generateSceneImage({
        prose: editProse,
        title: sceneData.title,
        sourceRefs: [sourceRef],
        characterRefs: refs.characterRefs,
        locationRefs: refs.locationRefs || [],
        objectRefs: refs.objectRefs || [],
        previousShots: [],
        aspectRatio: reqAspectRatio || '16:9',
        imageSize: '2K',
        usePro: true,
      });

      const filename = `camera_angle_${sceneId}_${Date.now()}`;
      const savedPath = await imageGenerator.saveImage(image, filename);
      const savedImageUrl = `/api/narrative/visual/images/${path.basename(savedPath)}`;

      res.json({
        success: true,
        image: image.data.toString('base64'),
        mimeType: image.mimeType,
        prompt: image.prompt,
        imageUrl: savedImageUrl,
        cameraDescription,
        mode: 'edit-camera-angle',
        referenceCount: image.referenceCount,
        referenceDiagnostics: {
          participants: refs.diagnostics.participants,
          location: refs.diagnostics.location,
        },
      });
      return;
    }

    // ------------------------------------------------------------------
    // Fallback: simple image edit (no scene data provided)
    // ------------------------------------------------------------------
    const prompt = `Re-render this exact scene from a different camera angle.\nNew camera: ${cameraDescription}\nPreserve all subject identities, wardrobe, lighting, and environment exactly.\nOnly change the virtual camera position and framing.`;

    const image = await imageGenerator.generateImage(prompt, [sourceRef], {
      model: 'gemini-3-pro-image-preview',
      aspectRatio: reqAspectRatio || '16:9',
      imageSize: '2K',
    });

    const filename = `camera_angle_${Date.now()}`;
    const savedPath = await imageGenerator.saveImage(image, filename);
    const savedImageUrl = `/api/narrative/visual/images/${path.basename(savedPath)}`;

    res.json({
      success: true,
      image: image.data.toString('base64'),
      mimeType: image.mimeType,
      prompt: image.prompt,
      imageUrl: savedImageUrl,
      cameraDescription,
      mode: 'simple-edit',
    });
  } catch (error: any) {
    console.error('Camera angle generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Generic image renderer — pure pipe to the image generator. No prompt templating,
 * no entity-aware framing, no auto-injected directives. Caller writes the full
 * prompt and supplies pre-resolved reference URLs. The ONLY auto-applied bit is
 * the project visual style line, which is visible to the AI in its context.
 *
 * Used by add_entity_image and generate_portrait so the AI's prompt reaches the
 * model verbatim without being wrapped in "Character portrait, bust shot..."
 * templates.
 */
app.post('/api/narrative/visual/render', async (req, res) => {
  try {
    const { projectId = getActiveProjectId(), prompt, referenceUrls, aspectRatio, model } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt is required' });
    }

    // Backend routing. 'nano-banana' = Gemini Nano Banana (fast, reference-anchored).
    // 'gpt-image' (or 'gpt-image-1' / 'gpt-image-2' aliases) = OpenAI; the
    // GptImageGenerator wrapper picks gpt-image-2 for text-only generations
    // and falls back to gpt-image-1 on the edits endpoint where validation
    // currently rejects gpt-image-2. 'auto' = caller didn't specify; default
    // to Nano because production renders dominate.
    const isGptRequest = typeof model === 'string' && (
      model === 'gpt-image' || model === 'gpt-image-1' || model === 'gpt-image-2' || model.startsWith('gpt-image-')
    );
    const useGpt = isGptRequest && gptImageGenerator;
    const generator: ImageGenerator | GptImageGenerator | null = useGpt ? gptImageGenerator : imageGenerator;
    if (!generator) {
      return res.status(503).json({ error: `Image generation not available — ${useGpt ? 'no OPENAI_API_KEY' : 'no GEMINI_API_KEY'}` });
    }

    // Compute style-asset list first so we can shape the style directive
    // around whether image refs are present.
    const callerUrls = Array.isArray(referenceUrls) ? referenceUrls.filter((u: any) => typeof u === 'string' && u) : [];
    const projectMeta = projects.find((p: any) => p.id === projectId);
    const styleAssetIds: string[] = projectMeta?.styleProfile?.styleAssetIds || [];
    const projectAssets: any[] = (() => {
      try { return loadProjectData(projectId).assets || []; } catch { return []; }
    })();
    const styleAssetUrls = styleAssetIds
      .map((id) => projectAssets.find((a: any) => a.id === id)?.url)
      .filter((u: string | undefined): u is string => Boolean(u));

    const effectiveVisualStylePrompt = getEffectiveVisualStylePrompt(projectId);

    // Style directive is image-anchored when refs exist (much stronger leash)
    // and text-only when they don't. The image-anchored form tells the model
    // the style refs ARE the project look — not "inspiration," not "match the
    // aesthetic" — the project's locked aesthetic that must be reproduced
    // exactly. Without this, the model picks photorealistic vs 3D-CGI vs
    // anime per-prompt based on the entity description.
    let styleDirective = '';
    if (styleAssetUrls.length > 0) {
      styleDirective = [
        '=== PROJECT VISUAL STYLE — LOCKED ===',
        effectiveVisualStylePrompt ? `Style spec: ${effectiveVisualStylePrompt}` : '',
        `Style references attached: ${styleAssetUrls.length} image(s) marked as PROJECT STYLE REFERENCE.`,
        '',
        'CRITICAL: The PROJECT STYLE REFERENCE images define this project\'s locked visual aesthetic. Reproduce their style EXACTLY for this render:',
        '  • Same rendering technique (cel-shading / painterly / photoreal / 3D-CGI / illustration — match whichever the refs use)',
        '  • Same line weight, brushwork, and surface treatment',
        '  • Same color palette range, saturation level, and contrast',
        '  • Same level of stylization vs realism',
        '  • Same lighting language and atmospheric depth',
        '',
        'The style references are NOT the subject — they show you HOW to draw, not WHAT to draw. The subject and composition come from the prompt below. If a style reference shows a character that is not in the prompt, do NOT reproduce that character — only adopt the rendering style.',
        '',
        'Non-style references (character portraits, location refs) attached separately are for IDENTITY and SUBJECT, not style. Match the style references for visual language; match the subject references for identity continuity.',
        '======================================',
        '',
      ].filter(Boolean).join('\n');
    } else if (effectiveVisualStylePrompt) {
      styleDirective = `[PROJECT VISUAL STYLE: ${effectiveVisualStylePrompt}]\n\n`;
    }

    const fullPrompt = `${styleDirective}${prompt}`;

    const allRefUrls = [...callerUrls];
    for (const u of styleAssetUrls) {
      if (!allRefUrls.includes(u)) allRefUrls.push(u);
    }

    // Resolve reference URLs to ReferenceImage objects. Style refs get a
    // sharper description so the multimodal model knows what to take from
    // them (style only, no identity, no subject).
    const references: Array<{ id: string; data: Buffer; mimeType: string; description: string; type: 'character' | 'location' | 'object' }> = [];
    for (const url of allRefUrls) {
      const asset = toImageDataFromUrl(url);
      if (!asset) continue;
      const isStyleAsset = styleAssetUrls.includes(url);
      references.push({
        id: `ref_${references.length + 1}`,
        data: asset.data,
        mimeType: asset.mimeType,
        description: isStyleAsset
          ? 'PROJECT STYLE REFERENCE — adopt rendering technique, line weight, color palette, level of stylization, and lighting language EXACTLY. Do not reproduce subjects/characters from this reference; it shows HOW to render, not WHAT to render.'
          : 'Visual reference (subject / identity / continuity)',
        type: 'character',
      });
    }

    const backendLabel = useGpt ? 'gpt-image' : 'nano-banana';
    console.log(`🎨 /render [${backendLabel}]: ${prompt.slice(0, 80).replace(/\n/g, ' ')}... (${references.length} refs${styleAssetUrls.length > 0 ? ` incl ${styleAssetUrls.length} style-locked` : ''}${aspectRatio ? `, ${aspectRatio}` : ''})`);

    const result = await generator.generateImage(
      fullPrompt,
      references.length > 0 ? references : undefined,
      aspectRatio ? { aspectRatio } : undefined,
    );

    if (!result?.data) {
      return res.status(500).json({ error: 'Image generation produced no result' });
    }

    const ext = result.mimeType?.includes('png') ? 'png' : 'jpeg';
    const filename = `render_${backendLabel}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
    const savedPath = path.join(GENERATED_IMAGES_DIR, filename);
    fs.writeFileSync(savedPath, result.data);
    const imageUrl = `/api/narrative/visual/images/${filename}`;

    // Expose the FULL prompt that reached the model + every reference's
    // description, so the caller (and the AI agent reading the tool result)
    // can see exactly what was sent — not just what they asked for. This is
    // critical for diagnosis: if a render is off-look, the agent needs to
    // know whether the issue is its prompt, the wrapped style directive,
    // or a misleading reference description.
    res.json({
      imageUrl,
      mimeType: result.mimeType,
      referencesUsed: references.length,
      backend: backendLabel,
      actualPromptSent: fullPrompt,
      callerPrompt: prompt,
      styleDirectiveApplied: styleDirective.length > 0,
      referencesAttached: references.map((r) => ({ description: r.description, type: r.type })),
    });
  } catch (error: any) {
    console.error('Render error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Natural language image edit — uses source image as reference + edit instruction
app.post('/api/narrative/visual/edit-image', async (req, res) => {
  try {
    const { imageUrl, editInstruction, aspectRatio: reqAspectRatio, projectId: reqProjectId } = req.body;
    if (!imageGenerator) {
      return res.status(503).json({ error: 'Image generation not available - no API key' });
    }
    if (!imageUrl || typeof imageUrl !== 'string') {
      return res.status(400).json({ error: 'imageUrl is required' });
    }
    if (!editInstruction || typeof editInstruction !== 'string') {
      return res.status(400).json({ error: 'editInstruction is required' });
    }

    const resolvedSource = toImageDataFromUrl(imageUrl);
    if (!resolvedSource) {
      return res.status(400).json({ error: 'Could not resolve source image from imageUrl' });
    }

    const sourceRef: import('../visual/image-generator').ReferenceImage = {
      id: 'edit_source',
      data: resolvedSource.data,
      mimeType: resolvedSource.mimeType,
      description: 'Original image to edit — preserve all aspects not mentioned in the edit instruction',
      type: 'previous_shot',
    };

    const prompt = `Edit this image: ${editInstruction}\nPreserve all other aspects of the scene not mentioned in the edit instruction — subjects, environment, lighting, wardrobe, and composition should remain identical unless the edit explicitly changes them.`;

    const image = await imageGenerator.generateImage(prompt, [sourceRef], {
      model: 'gemini-3-pro-image-preview',
      aspectRatio: reqAspectRatio || '16:9',
      imageSize: '2K',
    });

    const filename = `edited_${Date.now()}`;
    const savedPath = await imageGenerator.saveImage(image, filename);
    const savedImageUrl = `/api/narrative/visual/images/${path.basename(savedPath)}`;

    res.json({
      success: true,
      image: image.data.toString('base64'),
      mimeType: image.mimeType,
      prompt: image.prompt,
      imageUrl: savedImageUrl,
      editInstruction,
    });
  } catch (error: any) {
    console.error('Image edit error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Visual generation - Scene Image with Nano Banana
// Uses multiple reference images for character/location consistency
// Accepts scene data directly in request body (for React-state scenes) or looks up by ID
app.post('/api/narrative/visual/scene/:sceneId', async (req, res) => {
  try {
    const { sceneId } = req.params;
    const {
      prompt: customPrompt,
      aspectRatio = '16:9',
      imageSize = '2K',
      usePro = true,
      // Allow scene data to be passed directly (for React-state scenes)
      sceneData,
      // Visual style prompt to inject into image generation
      visualStylePrompt,
      // Enforce missing character references as hard failure
      strictCharacterRefs = false,
      // Optional explicit subset of participants that must have character refs
      requiredCharacterIds,
      // Optional second pass to repair identity drift using first pass as anchor
      enableIdentityRepair: enableIdentityRepairInput,
      identityRepairPasses = 1,
      // Optional object ref cap override (clamped per model)
      maxObjectRefs: requestedMaxObjectRefs,
      // Prompt compression controls to reduce instruction dilution
      maxNarrativePromptChars = 1400,
      maxFrameAnchorChars = 700,
      includeCharacterAlternates = false,
      outputIntent: requestedOutputIntent = 'cinematic-still',
      textPolicy: requestedTextPolicy = 'no-text',
      additionalRefUrls,
    } = req.body;
    const projectId = req.body.projectId || getActiveProjectId();
    const effectiveVisualStylePrompt = getEffectiveVisualStylePrompt(projectId, visualStylePrompt);
    const outputIntent = normalizeVisualOutputIntent(requestedOutputIntent);
    const resolvedTextPolicy = resolveVisualTextPolicyForIntent(outputIntent, requestedTextPolicy);

    if (!imageGenerator) {
      return res.status(503).json({ error: 'Image generation not available - no API key' });
    }

    const projectData = loadProjectData(projectId);

    // Use provided scene data or look up from stored data
    let scene = sceneData;
    if (!scene) {
      scene = projectData.interactions.find(i => i.id === sceneId);
    }

    if (!scene || (!scene.prose && !scene.description)) {
      return res.status(404).json({ error: `Scene not found or missing content: ${sceneId}` });
    }

    console.log(`🎬 Generating image for scene: ${scene.title || sceneId}`);

    // Resolve all reference images via shared helper
    const refs = resolveSceneReferences(scene, projectData, {
      usePro,
      includeCharacterAlternates,
      maxObjectRefs: requestedMaxObjectRefs,
      strictCharacterRefs,
      requiredCharacterIds,
      includePreviousShots: true,
      sceneId,
    });
    const { characterRefs, locationRefs, objectRefs, previousShots, participantEntities, participants } = refs;
    const { diagnostics: { participants: participantReferenceDiagnostics, location: locationReferenceDiagnostic } } = refs;

    if (refs.missingRequired) {
      return res.status(409).json({
        error: 'Missing required character references for strict scene generation.',
        code: 'MISSING_REQUIRED_CHARACTER_REFERENCES',
        sceneId,
        missingCharacters: refs.missingRequired.characters,
        requiredCharacterIds: refs.missingRequired.requiredCharacterIds,
        resolvedCharacterIds: refs.missingRequired.resolvedCharacterIds,
      });
    }

    // Build the prose with optional visual style + custom prompt appended (non-overriding)
    const locationId = scene.locationId || scene.location;
    const participantGroundingEntities = participants
      .map((participantId: string) => projectData.entities.find((entity: any) => entity.id === participantId))
      .filter(Boolean);
    const participantGroundingLine = participantGroundingEntities.length > 0
      ? `Participants: ${participantGroundingEntities.map((entity: any) => `${entity.name} (${entity.type})`).join(', ')}`
      : '';
    const locationGroundingEntity = locationId
      ? projectData.entities.find((entity: any) => entity.id === locationId)
      : null;
    const locationGroundingLine = locationGroundingEntity
      ? `Location anchor: ${locationGroundingEntity.name}`
      : '';
    const objectGroundingEntities = participantGroundingEntities
      .filter((entity: any) => SIGNIFICANT_OBJECT_ENTITY_TYPES.has((entity.type || '').toLowerCase()));
    const objectGroundingLine = objectGroundingEntities.length > 0
      ? `Significant objects: ${objectGroundingEntities.map((entity: any) => entity.name).join(', ')}`
      : '';
    const groundingHeader = [participantGroundingLine, locationGroundingLine, objectGroundingLine]
      .filter(Boolean)
      .join('\n');

    const baseProseRaw = scene.prose || scene.description || 'A dramatic moment in the story.';
    // Strip appearance descriptors from scene prose when character refs are present
    // to prevent text descriptions from overriding reference images.
    const strippedBaseProse = characterRefs.length > 0
      ? stripAppearanceFromNarrative(baseProseRaw)
      : baseProseRaw;
    const baseProse = compressPromptText(strippedBaseProse, Number(maxNarrativePromptChars) || 1400);
    const orderedFramesForHint = Array.isArray(scene.frames)
      ? [...scene.frames].sort((a: any, b: any) => (a?.position ?? 0) - (b?.position ?? 0))
      : [];
    const preferredFrameForHint = orderedFramesForHint.length > 0
      ? orderedFramesForHint[Math.floor((orderedFramesForHint.length - 1) / 2)]
      : null;
    const frameFocusHintRaw = preferredFrameForHint
      ? (preferredFrameForHint.visual_direction?.action
        || preferredFrameForHint.title
        || preferredFrameForHint.visual_beat
        || preferredFrameForHint.description || '')
      : '';
    // Strip appearance from frame focus hint when character refs are present
    const strippedFrameFocusHint = characterRefs.length > 0
      ? stripAppearanceFromNarrative(frameFocusHintRaw)
      : frameFocusHintRaw;
    const frameFocusHint = strippedFrameFocusHint
      ? compressPromptText(strippedFrameFocusHint, Number(maxFrameAnchorChars) || 700)
      : '';
    // --- Consolidated prompt assembly ---
    // Merges 12 directive blocks into ~5 to keep scene prose as the dominant signal.
    // Identity was repeated 3× (CRITICAL + IDENTITY LOCKS + PARTICIPANTS) → single [CHARACTERS] block.
    // Single-frame was repeated 3× (SINGLE MOMENT + OUTPUT INTENT + COMPOSITION) → single [FRAME] block.

    // 1. Character identity block (replaces CRITICAL prepend + IDENTITY LOCKS + PARTICIPANTS)
    const refMatchedEntities = participantGroundingEntities
      .filter((entity: any) => characterRefs.some((ref: any) => ref.id === entity.id));
    const characterBlock = refMatchedEntities.length > 0
      ? `[CHARACTERS]\nMatch each character to their reference image. References are the sole visual authority for face, hair, build, skin tone, age, and wardrobe.\n${refMatchedEntities.map((e: any) => `- ${e.name}: match reference exactly.`).join('\n')}\nRender only the named participants; all should be clearly visible.`
      : '';

    // 2. Frame directive (replaces SINGLE MOMENT LOCK + OUTPUT INTENT + TEXT POLICY + COMPOSITION CONSTRAINTS)
    const frameType = outputIntent === 'comic-panel' ? 'comic panel'
      : outputIntent === 'video-keyframe' ? 'cinematic keyframe'
      : 'cinematic still frame';
    const textPolicySentence = resolvedTextPolicy.policy === 'no-text'
      ? ' Keep all text illegible or abstract.'
      : resolvedTextPolicy.policy === 'diegetic-only'
        ? ' Readable text allowed only for in-world props when explicitly requested.'
        : '';
    const shotHintCaveat = frameFocusHint ? ' Use shot hints only as continuity context.' : '';
    const frameDirective = `[FRAME]\nRender exactly one decisive moment as a single ${frameType} filling the entire canvas.${shotHintCaveat}${textPolicySentence}`;

    // 3. Assemble — scene narrative is the largest, central block
    let finalProse = '';
    if (groundingHeader) {
      finalProse += `[SCENE]\n${groundingHeader}\n\n`;
    }
    finalProse += baseProse;
    if (frameFocusHint) {
      finalProse += `\n\n[SHOT FOCUS]\n${frameFocusHint}`;
    }
    finalProse += `\n\n${frameDirective}`;
    if (customPrompt) {
      finalProse += `\n\n[VISUAL NOTES: ${customPrompt}]`;
    }

    // Prepend character block (high-weight position for identity grounding)
    if (characterBlock) {
      finalProse = `${characterBlock}\n\n${finalProse}`;
    }

    // Prepend visual style
    const compactVisualStylePrompt = compressPromptText(effectiveVisualStylePrompt, 420);
    if (compactVisualStylePrompt) {
      finalProse = `[VISUAL STYLE: ${compactVisualStylePrompt}]\n\n${finalProse}`;
    }

    // Default-on identity repair for any scene using character references unless explicitly disabled.
    const enableIdentityRepair = typeof enableIdentityRepairInput === 'boolean'
      ? enableIdentityRepairInput
      : characterRefs.length > 0;

    // Resolve additional reference images if provided — route to correct ref category
    if (Array.isArray(additionalRefUrls)) {
      for (const refUrl of additionalRefUrls) {
        const resolved = toImageDataFromUrl(refUrl);
        if (resolved) {
          const normalizedRef = normalizeComparableImageUrl(refUrl);
          const matchedEntity = (projectData.entities || []).find((e: any) =>
            normalizeComparableImageUrl(e.referenceImage) === normalizedRef ||
            normalizeComparableImageUrl(e.imageUrl) === normalizedRef
          );
          const SCENE_LOCATION_TYPES = new Set(['location', 'place', 'setting']);
          const SCENE_CHARACTER_TYPES = new Set(['character', 'person', 'agent', 'npc', 'protagonist', 'antagonist']);
          const etype = matchedEntity ? (matchedEntity.type || '').toLowerCase() : '';
          const refObj: import('../visual/image-generator').ReferenceImage = {
            id: `additional_ref_${characterRefs.length + objectRefs.length + locationRefs.length}`,
            data: resolved.data,
            mimeType: resolved.mimeType,
            description: matchedEntity ? `${matchedEntity.name} (${matchedEntity.type}) | entity reference` : 'User-selected reference image',
            type: SCENE_CHARACTER_TYPES.has(etype) ? 'character'
              : SCENE_LOCATION_TYPES.has(etype) ? 'location'
              : 'object',
          };
          // Route to correct ref category so image generator can prioritize properly
          if (refObj.type === 'character') characterRefs.push(refObj);
          else if (refObj.type === 'location') locationRefs.push(refObj);
          else objectRefs.push(refObj);
        }
      }
    }

    // Generate scene image with references
    const initialImage = await imageGenerator.generateSceneImage({
      prose: finalProse,
      title: scene.title,
      characterRefs,
      locationRefs,
      objectRefs,
      previousShots,
      aspectRatio: aspectRatio as any,
      imageSize: imageSize as any,
      usePro,
    });

    const requestedIdentityRepairPasses = Number.isFinite(Number(identityRepairPasses))
      ? Number(identityRepairPasses)
      : 1;
    const totalIdentityRepairPasses = Math.max(0, Math.min(2, requestedIdentityRepairPasses));
    let image = initialImage;
    let identityRepairApplied = 0;
    let identityRepairError: string | undefined;
    if (enableIdentityRepair && characterRefs.length > 0 && totalIdentityRepairPasses > 0) {
      for (let pass = 1; pass <= totalIdentityRepairPasses; pass++) {
        const repairPreviousShots = [
          {
            id: `${sceneId}_identity_repair_${pass}`,
            data: image.data,
            mimeType: image.mimeType,
            description: `Scene render pass ${pass} (identity correction anchor)`,
            type: 'previous_shot',
          },
          ...previousShots,
        ].slice(0, 2);
        const repairPrompt = `${finalProse}\n\n[IDENTITY REPAIR PASS ${pass}]\nUse the attached previous render as composition anchor and keep framing stable. Correct character identity drift so every named participant matches their character reference image exactly.`;
        try {
          image = await imageGenerator.generateSceneImage({
            prose: repairPrompt,
            title: scene.title,
            characterRefs,
            locationRefs,
            objectRefs,
            previousShots: repairPreviousShots,
            aspectRatio: aspectRatio as any,
            imageSize: imageSize as any,
            usePro,
          });
          identityRepairApplied += 1;
        } catch (repairError: any) {
          identityRepairError = repairError?.message || 'Identity repair failed';
          console.warn(`⚠️ Identity repair pass ${pass} failed for scene ${sceneId}: ${identityRepairError}`);
          break;
        }
      }
    }

    // Save the image
    const filename = `scene_${sceneId}_${Date.now()}`;
    const savedPath = await imageGenerator.saveImage(image, filename);

    // Store image reference on scene
    scene.imageUrl = `/api/narrative/visual/images/${path.basename(savedPath)}`;

    // Persist scene image to project data
    const session = getWorldSession(projectId);
    const sceneIndex = projectData.interactions?.findIndex((i: any) => i.id === sceneId) ?? -1;
    if (sceneIndex >= 0) {
      projectData.interactions[sceneIndex] = {
        ...projectData.interactions[sceneIndex],
        imageUrl: scene.imageUrl,
        lastImagePrompt: typeof image.prompt === 'string' ? image.prompt : undefined,
        lastImageModel: typeof image.model === 'string' ? image.model : undefined,
        lastImageAt: new Date().toISOString(),
        visualDirty: false,
        visualDirtyAt: undefined,
        visualDirtyReason: undefined,
        visualDirtyEntityIds: [],
        visualDirtyEntityNames: [],
        updatedAt: new Date().toISOString(),
      };
      session.uncommittedChanges = true;
      if (!session.pendingChanges.addedSceneIds.has(sceneId)) {
        session.pendingChanges.modifiedSceneIds.add(sceneId);
      }
      saveProjectData(projectId, projectData);
    }

    const reportedMaxCharacterRefs = usePro ? MAX_SCENE_CHARACTER_REFS_PRO : MAX_SCENE_CHARACTER_REFS_FLASH;
    const reportedMaxObjectRefs = usePro ? MAX_SCENE_OBJECT_REFS_PRO : MAX_SCENE_OBJECT_REFS_FLASH;
    const submittedReferences = {
      characterIds: characterRefs.map((ref) => ref.id),
      objectIds: objectRefs.map((ref) => ref.id),
      locationIds: locationRefs.map((ref) => ref.id),
      previousShotIds: previousShots.map((ref) => ref.id),
      budgets: {
        characters: reportedMaxCharacterRefs,
        objects: reportedMaxObjectRefs,
      },
      counts: {
        characters: characterRefs.length,
        objects: objectRefs.length,
        locations: locationRefs.length,
        previousShots: previousShots.length,
        total: characterRefs.length + objectRefs.length + locationRefs.length + previousShots.length,
      },
    };

    res.json({
      success: true,
      sceneId,
      sceneTitle: scene.title,
      image: image.data.toString('base64'),
      mimeType: image.mimeType,
      prompt: image.prompt,
      promptLength: typeof image.prompt === "string" ? image.prompt.length : 0,
      model: image.model,
      savedPath,
      imageUrl: scene.imageUrl,
      referenceCount: image.referenceCount,
      submittedReferences,
      actualReferencesUsed: {
        refs: Array.isArray((image as any).referenceManifest) ? (image as any).referenceManifest : [],
        counts: (image as any).referenceTypeCounts || undefined,
      },
      outputIntent,
      textPolicy: resolvedTextPolicy.policy,
      textPolicyLocked: resolvedTextPolicy.locked,
      promptStrategyVersion: 'scene-ref-registry-v2',
      strictCharacterRefs: Boolean(strictCharacterRefs),
      requiredCharacterIds: requiredCharacterIds || [],
      identityRepair: {
        requested: Boolean(enableIdentityRepair),
        requestedPasses: totalIdentityRepairPasses,
        appliedPasses: identityRepairApplied,
        failed: Boolean(identityRepairError),
        error: identityRepairError,
      },
      referenceDiagnostics: {
        participants: participantReferenceDiagnostics,
        location: locationReferenceDiagnostic,
      },
    });
  } catch (error: any) {
    console.error('Scene image generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Visual generation - Frame Image within a scene
app.post('/api/narrative/visual/frame/:sceneId/:frameId', async (req, res) => {
  try {
    const { sceneId, frameId } = req.params;
    const {
      prompt: customPrompt,
      aspectRatio = '16:9',
      imageSize = '2K',
      usePro = true,
      sceneData,
      frameData,
      visualStylePrompt,
      allowOutOfOrder = false,
      strictCharacterRefs = false,
      requiredCharacterIds,
      enableIdentityRepair: enableIdentityRepairInput,
      identityRepairPasses = 1,
      maxObjectRefs: requestedMaxObjectRefs,
      maxNarrativePromptChars = 260,
      maxFrameAnchorChars = 300,
      includeCharacterAlternates = false,
      outputIntent: requestedOutputIntent = 'cinematic-still',
      textPolicy: requestedTextPolicy = 'no-text',
      additionalRefUrls,
    } = req.body;
    const projectId = req.body.projectId || getActiveProjectId();
    const effectiveVisualStylePrompt = getEffectiveVisualStylePrompt(projectId, visualStylePrompt);
    const outputIntent = normalizeVisualOutputIntent(requestedOutputIntent);
    const resolvedTextPolicy = resolveVisualTextPolicyForIntent(outputIntent, requestedTextPolicy);

    if (!imageGenerator) {
      return res.status(503).json({ error: 'Image generation not available - no API key' });
    }

    const projectData = loadProjectData(projectId);

    let scene = sceneData;
    if (!scene) {
      scene = projectData.interactions.find((i: any) => i.id === sceneId);
    }

    if (!scene) {
      return res.status(404).json({ error: `Scene not found: ${sceneId}` });
    }

    let frame = frameData;
    if (!frame) {
      frame = (scene.frames || []).find((f: any) => f.id === frameId);
    }

    if (!frame) {
      return res.status(404).json({ error: `Frame not found: ${frameId}` });
    }

    const orderedSceneFrames = Array.isArray(scene.frames)
      ? [...scene.frames].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
      : [];
    const orderedFrameIndex = orderedSceneFrames.findIndex((candidate: any) => candidate?.id === frameId);
    if (!allowOutOfOrder && orderedFrameIndex > 0) {
      const priorFrames = orderedSceneFrames.slice(0, orderedFrameIndex);
      const missingPriorFrames = priorFrames.filter((candidate: any) => !candidate?.imageUrl);
      if (missingPriorFrames.length > 0) {
        const nextRequiredFrame = missingPriorFrames[0];
        return res.status(409).json({
          error: 'Frame images must be generated in timeline order for continuity.',
          code: 'FRAME_ORDER_REQUIRED',
          nextRequiredFrameId: nextRequiredFrame?.id,
          nextRequiredFrameTitle: nextRequiredFrame?.title,
          requiresPriorFrames: missingPriorFrames.map((candidate: any) => ({
            id: candidate.id,
            title: candidate.title || candidate.description || candidate.id,
            position: candidate.position,
          })),
        });
      }
    }

    console.log(`🎞️ Generating image for frame: ${frame.title || frameId} in scene ${scene.title || sceneId}`);

    const characterRefs: any[] = [];
    const locationRefs: any[] = [];
    const objectRefs: any[] = [];
    const previousShots: any[] = [];
    const maxCharacterRefs = usePro ? MAX_SCENE_CHARACTER_REFS_PRO : MAX_SCENE_CHARACTER_REFS_FLASH;
    const parsedRequestedMaxObjectRefs = Number.isFinite(Number(requestedMaxObjectRefs))
      ? Number(requestedMaxObjectRefs)
      : undefined;
    const maxObjectRefs = usePro
      ? Math.max(0, Math.min(MAX_SCENE_OBJECT_REFS_PRO, parsedRequestedMaxObjectRefs ?? MAX_SCENE_OBJECT_REFS_PRO))
      : Math.max(0, Math.min(MAX_SCENE_OBJECT_REFS_FLASH, parsedRequestedMaxObjectRefs ?? MAX_SCENE_OBJECT_REFS_FLASH));
    const participantOrderById = new Map<string, number>();
    type ParticipantReferenceCandidate = {
      entity: any;
      participantOrder: number;
      frameFocusRank: number;
      variantIndex: number;
      referenceType: "character" | "object";
      referencePayload: any;
      source: string;
      url?: string;
      priorityScore: number;
    };
    const characterCandidates: ParticipantReferenceCandidate[] = [];
    const objectCandidates: ParticipantReferenceCandidate[] = [];
    const participantReferenceDiagnostics: Array<{
      entityId: string;
      name: string;
      type: string;
      referenceType: "character" | "object";
      resolved: boolean;
      includedInRequest?: boolean;
      droppedReason?: string;
      priorityScore?: number;
      source?: string;
      url?: string;
    }> = [];

    const sceneParticipantsRaw = scene.participantIds || scene.participants || [];
    const sceneParticipantIds = sceneParticipantsRaw
      .map((p: any) => (typeof p === 'string' ? p : p?.id))
      .filter(Boolean);
    const frameParticipantsRaw = frame.participantIds || [];
    const frameParticipantIdsFromFrame = frameParticipantsRaw
      .map((p: any) => (typeof p === 'string' ? p : p?.id))
      .filter(Boolean);
    const participantRefsById = new Map<string, any>();
    const frameParticipantIdsFromRefs: string[] = [];
    if (Array.isArray(frame.participantRefs)) {
      for (const ref of frame.participantRefs) {
        const rawEntityId = typeof ref?.entityId === 'string' ? ref.entityId : undefined;
        const rawName = typeof ref?.name === 'string' ? ref.name : undefined;
        const resolved = rawEntityId
          ? projectData.entities.find((entity: any) => entity.id === rawEntityId)
          : (rawName ? resolveEntityByName(projectData, rawName) : null);
        if (resolved?.id) {
          participantRefsById.set(resolved.id, ref);
          frameParticipantIdsFromRefs.push(resolved.id);
        }
      }
    }
    const explicitFrameParticipantIds = Array.from(new Set([
      ...frameParticipantIdsFromFrame,
      ...frameParticipantIdsFromRefs,
    ]));
    const frameHasExplicitParticipants = explicitFrameParticipantIds.length > 0;
    const participants = Array.from(new Set(
      frameHasExplicitParticipants
        ? [...explicitFrameParticipantIds, ...sceneParticipantIds]
        : sceneParticipantIds
    ));
    const frameParticipantFocusSet = new Set(
      frameHasExplicitParticipants ? explicitFrameParticipantIds : participants
    );
    const participantEntities = participants
      .map((participantId: string) => projectData.entities.find((entity: any) => entity.id === participantId))
      .filter((entity: any, index: number, collection: any[]) => Boolean(entity) && collection.findIndex((candidate: any) => candidate.id === entity.id) === index);
    participantEntities.forEach((entity: any, index: number) => {
      participantOrderById.set(entity.id, index);
    });
    const humanParticipantCount = participantEntities.filter((entity: any) =>
      isHumanReferenceEntityType((entity?.type || '').toLowerCase())
    ).length;
    const perCharacterReferenceLimit = includeCharacterAlternates
      ? (humanParticipantCount <= 1 ? 3 : humanParticipantCount === 2 ? 2 : 1)
      : 1;

    for (const entity of participantEntities) {
      const entityType = (entity.type || '').toLowerCase();
      if (isLocationEntityType(entityType)) continue;

      const isHumanEntity = isHumanReferenceEntityType(entityType);
      const refType = isHumanEntity ? 'character' : 'object';
      const primaryResolvedAsset = !isHumanEntity ? resolveEntityReferenceAsset(entity) : null;
      const resolvedAssets = isHumanEntity
        ? resolveEntityReferenceAssets(entity, perCharacterReferenceLimit, {
            includePortraitVariations: includeCharacterAlternates,
          })
        : (primaryResolvedAsset ? [primaryResolvedAsset] : []);

      if (resolvedAssets.length === 0) {
        participantReferenceDiagnostics.push({
          entityId: entity.id,
          name: entity.name,
          type: entity.type || 'unknown',
          referenceType: refType,
          resolved: false,
          includedInRequest: false,
          droppedReason: 'No resolved reference image found',
          priorityScore: refType === 'object' ? getObjectReferencePriority(entity) : 0,
          url: entity.referenceImage || entity.imageUrl || undefined,
        });
        continue;
      }
      resolvedAssets.forEach((resolvedAsset, assetIndex) => {
        const isPrimaryVariant = assetIndex === 0;
        const variantNotes = isHumanEntity && !isPrimaryVariant
          ? [`alternate likeness reference ${assetIndex + 1}`]
          : [];
        const referencePayload = {
          id: isPrimaryVariant ? entity.id : `${entity.id}__alt${assetIndex + 1}`,
          data: resolvedAsset.data,
          mimeType: resolvedAsset.mimeType,
          description: buildReferenceDescription(entity, variantNotes),
          type: refType,
        };

        const candidate: ParticipantReferenceCandidate = {
          entity,
          participantOrder: participantOrderById.get(entity.id) ?? Number.MAX_SAFE_INTEGER,
          frameFocusRank: frameParticipantFocusSet.has(entity.id) ? 0 : 1,
          variantIndex: assetIndex,
          referenceType: refType,
          referencePayload,
          source: resolvedAsset.source,
          url: resolvedAsset.referenceUrl || entity.referenceImage || entity.imageUrl || undefined,
          priorityScore: refType === 'object' ? getObjectReferencePriority(entity) : 0,
        };

        if (!isHumanEntity) {
          objectCandidates.push(candidate);
        } else {
          characterCandidates.push(candidate);
        }
      });
    }

    characterCandidates
      .sort((a, b) => {
        if (a.frameFocusRank !== b.frameFocusRank) return a.frameFocusRank - b.frameFocusRank;
        if (a.participantOrder !== b.participantOrder) return a.participantOrder - b.participantOrder;
        if (a.variantIndex !== b.variantIndex) return a.variantIndex - b.variantIndex;
        return String(a.entity?.id || '').localeCompare(String(b.entity?.id || ''));
      })
      .reduce((selectedCount, candidate) => {
        const withinFrameScope = !frameHasExplicitParticipants || candidate.frameFocusRank === 0;
        const includedInRequest = withinFrameScope && selectedCount < maxCharacterRefs;
        if (includedInRequest) {
          characterRefs.push(candidate.referencePayload);
          selectedCount += 1;
        }
        participantReferenceDiagnostics.push({
          entityId: candidate.entity.id,
          name: candidate.variantIndex > 0
            ? `${candidate.entity.name} (alt ${candidate.variantIndex + 1})`
            : candidate.entity.name,
          type: candidate.entity.type || 'unknown',
          referenceType: 'character',
          resolved: true,
          includedInRequest,
          droppedReason: includedInRequest
            ? undefined
            : (withinFrameScope
              ? `Exceeded character reference budget (${maxCharacterRefs})`
              : 'Excluded by frame participant scope'),
          priorityScore: candidate.priorityScore,
          source: candidate.source,
          url: candidate.url,
        });
        return selectedCount;
      }, 0);

    objectCandidates
      .sort((a, b) => {
        if (a.frameFocusRank !== b.frameFocusRank) return a.frameFocusRank - b.frameFocusRank;
        if (a.priorityScore !== b.priorityScore) return a.priorityScore - b.priorityScore;
        if (a.participantOrder !== b.participantOrder) return a.participantOrder - b.participantOrder;
        return String(a.entity?.id || '').localeCompare(String(b.entity?.id || ''));
      })
      .reduce((selectedCount, candidate) => {
        const withinFrameScope = !frameHasExplicitParticipants || candidate.frameFocusRank === 0;
        const includedInRequest = withinFrameScope && selectedCount < maxObjectRefs;
        if (includedInRequest) {
          objectRefs.push(candidate.referencePayload);
          selectedCount += 1;
        }
        participantReferenceDiagnostics.push({
          entityId: candidate.entity.id,
          name: candidate.entity.name,
          type: candidate.entity.type || 'unknown',
          referenceType: 'object',
          resolved: true,
          includedInRequest,
          droppedReason: includedInRequest
            ? undefined
            : (withinFrameScope
              ? `Exceeded object reference budget (${maxObjectRefs})`
              : 'Excluded by frame participant scope'),
          priorityScore: candidate.priorityScore,
          source: candidate.source,
          url: candidate.url,
        });
        return selectedCount;
      }, 0);

    participantReferenceDiagnostics.sort((a, b) => {
      const orderA = participantOrderById.get(a.entityId) ?? Number.MAX_SAFE_INTEGER;
      const orderB = participantOrderById.get(b.entityId) ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      if (a.referenceType !== b.referenceType) return a.referenceType.localeCompare(b.referenceType);
      return a.name.localeCompare(b.name);
    });

    const locationId = frame.locationId || scene.locationId || scene.location;
    let locationReferenceDiagnostic: { entityId: string; name: string; resolved: boolean; source?: string; url?: string } | null = null;
    if (locationId) {
      const location = projectData.entities.find(e =>
        e.id === locationId ||
        e.name.toLowerCase() === locationId?.toLowerCase()
      );
      if (location) {
        const resolvedAsset = resolveEntityReferenceAsset(location);
        if (resolvedAsset) {
          locationRefs.push({
            id: location.id,
            data: resolvedAsset.data,
            mimeType: resolvedAsset.mimeType,
            description: buildReferenceDescription(location),
            type: 'location',
          });
          locationReferenceDiagnostic = {
            entityId: location.id,
            name: location.name,
            resolved: true,
            source: resolvedAsset.source,
            url: resolvedAsset.referenceUrl || location.referenceImage || location.imageUrl || undefined,
          };
        } else {
          locationReferenceDiagnostic = {
            entityId: location.id,
            name: location.name,
            resolved: false,
            url: location.referenceImage || location.imageUrl || undefined,
          };
        }
      }
    }

    // Scene anchor + immediate previous frame for continuity (keep this small to reduce identity drift amplification)
    const maxPreviousShotAnchors = 2;
    let sceneAnchorShotAttached = false;
    let immediatePriorFrameAttached = false;
    const previousShotKeys = new Set<string>();
    const pushPreviousShot = (entry: {
      key: string;
      id: string;
      data: Buffer;
      mimeType: string;
      description: string;
    }) => {
      if (!entry?.data || previousShotKeys.has(entry.key) || previousShots.length >= maxPreviousShotAnchors) return;
      previousShotKeys.add(entry.key);
      previousShots.push({
        id: entry.id,
        data: entry.data,
        mimeType: entry.mimeType,
        description: entry.description,
        type: 'previous_shot',
      });
    };

    if (orderedSceneFrames.length > 0 && orderedFrameIndex > 0) {
      const immediatePriorFrame = orderedSceneFrames
        .slice(0, orderedFrameIndex)
        .reverse()[0];
      if (immediatePriorFrame) {
        const resolvedPriorFrameAsset = toImageDataFromUrl(immediatePriorFrame?.imageUrl);
        if (resolvedPriorFrameAsset) {
          pushPreviousShot({
            key: `frame:${immediatePriorFrame.id}`,
            id: immediatePriorFrame.id,
            data: resolvedPriorFrameAsset.data,
            mimeType: resolvedPriorFrameAsset.mimeType,
            description: `Previous frame: ${immediatePriorFrame.title || 'Untitled'}`,
          });
          immediatePriorFrameAttached = true;
        } else {
          const sceneImageDir = GENERATED_IMAGES_DIR;
          if (fs.existsSync(sceneImageDir)) {
            const priorFrameFiles = fs.readdirSync(sceneImageDir)
              .filter(f => f.startsWith(`scene_${sceneId}_frame_${immediatePriorFrame.id}`))
              .sort()
              .reverse();
            if (priorFrameFiles.length > 0) {
              const priorPath = path.join(sceneImageDir, priorFrameFiles[0]);
              const priorData = fs.readFileSync(priorPath);
              const ext = path.extname(priorFrameFiles[0]).toLowerCase();
              pushPreviousShot({
                key: `frame:${immediatePriorFrame.id}`,
                id: immediatePriorFrame.id,
                data: priorData,
                mimeType: ext === '.png' ? 'image/png' : 'image/jpeg',
                description: `Previous frame: ${immediatePriorFrame.title || 'Untitled'}`,
              });
              immediatePriorFrameAttached = true;
            }
          }
        }
      }
    }
    let resolvedSceneAnchorAsset = toImageDataFromUrl(scene?.imageUrl);
    if (!resolvedSceneAnchorAsset) {
      const sceneImageDir = GENERATED_IMAGES_DIR;
      if (fs.existsSync(sceneImageDir)) {
        const sceneAnchorFiles = fs.readdirSync(sceneImageDir)
          .filter((filename) => filename.startsWith(`scene_${sceneId}_`) && !filename.includes('_frame_'))
          .sort()
          .reverse();
        if (sceneAnchorFiles.length > 0) {
          const sceneAnchorPath = path.join(sceneImageDir, sceneAnchorFiles[0]);
          resolvedSceneAnchorAsset = {
            data: fs.readFileSync(sceneAnchorPath),
            mimeType: getMimeTypeFromFilename(sceneAnchorPath),
            source: 'stored-url',
            referenceUrl: scene?.imageUrl,
            filePath: sceneAnchorPath,
          };
        }
      }
    }
    if (resolvedSceneAnchorAsset && previousShots.length < maxPreviousShotAnchors) {
      pushPreviousShot({
        key: `scene:${sceneId}`,
        id: sceneId,
        data: resolvedSceneAnchorAsset.data,
        mimeType: resolvedSceneAnchorAsset.mimeType,
        description: `Master shot of the full scene — match the overall look, lighting, and character appearances`,
      });
      sceneAnchorShotAttached = true;
    }

    const allHumanParticipantIds = participantEntities
      .filter((entity: any) => isHumanReferenceEntityType(entity?.type))
      .map((entity: any) => entity.id);
    const focusHumanParticipantIds = participantEntities
      .filter((entity: any) => frameParticipantFocusSet.has(entity.id))
      .filter((entity: any) => isHumanReferenceEntityType(entity?.type))
      .map((entity: any) => entity.id);
    const humanParticipantIdSet = new Set(allHumanParticipantIds);
    const defaultRequiredCharacterIds = (frameHasExplicitParticipants ? focusHumanParticipantIds : allHumanParticipantIds).slice(0, maxCharacterRefs);
    const requestedRequiredCharacters = Array.isArray(requiredCharacterIds)
      ? requiredCharacterIds.filter((value: any) => typeof value === 'string' && value.trim().length > 0)
      : [];
    const requiredCharacterSet = new Set(
      (requestedRequiredCharacters.length > 0 ? requestedRequiredCharacters : defaultRequiredCharacterIds)
        .filter((id: string) => humanParticipantIdSet.has(id))
    );
    const selectedCharacterIdSet = new Set(characterRefs.map((ref) => ref.id));
    const missingRequiredCharacterIds = Array.from(requiredCharacterSet).filter((id) => !selectedCharacterIdSet.has(id));
    if (strictCharacterRefs && missingRequiredCharacterIds.length > 0) {
      const missingCharacters = missingRequiredCharacterIds.map((id) => {
        const entity = participantEntities.find((candidate: any) => candidate.id === id);
        return {
          id,
          name: entity?.name || id,
        };
      });
      return res.status(409).json({
        error: 'Missing required character references for strict frame generation.',
        code: 'MISSING_REQUIRED_CHARACTER_REFERENCES',
        sceneId,
        frameId,
        missingCharacters,
        requiredCharacterIds: Array.from(requiredCharacterSet),
        resolvedCharacterIds: Array.from(selectedCharacterIdSet),
      });
    }

    const unresolvedParticipants = participantReferenceDiagnostics.filter((entry) => !entry.resolved).map((entry) => entry.name);
    const droppedParticipants = participantReferenceDiagnostics
      .filter((entry) => entry.resolved && entry.includedInRequest === false)
      .map((entry) => `${entry.name} (${entry.referenceType})`);
    if (unresolvedParticipants.length > 0) {
      console.warn(`⚠️ Frame refs missing for: ${unresolvedParticipants.join(', ')}`);
    }
    if (droppedParticipants.length > 0) {
      console.warn(`⚠️ Frame refs dropped by budget: ${droppedParticipants.join(', ')}`);
    }

    const frameActionLines = Array.isArray(frame.participantRefs)
      ? frame.participantRefs
          .map((ref: any) => {
            const refName = typeof ref?.name === 'string' ? ref.name : undefined;
            const action = sanitizeBlockingDirectiveText(typeof ref?.action === 'string' ? ref.action : undefined);
            const pose = sanitizeBlockingDirectiveText(typeof ref?.pose === 'string' ? ref.pose : undefined);
            const placement = sanitizeBlockingDirectiveText(typeof ref?.placement === 'string' ? ref.placement : undefined);
            // Keep blocking focused on motion/composition only to avoid identity drift from prose-style appearance notes.
            const parts = [action, pose, placement].filter(Boolean);
            if (!refName || parts.length === 0) return null;
            return `- ${refName}: ${parts.join('; ')}`;
          })
          .filter(Boolean)
      : [];

    const participantGroundingEntities = participantEntities;
    const frameFocusEntities = frameHasExplicitParticipants
      ? participantEntities.filter((entity: any) => frameParticipantFocusSet.has(entity.id))
      : participantEntities;
    const participantGroundingLine = participantGroundingEntities.length > 0
      ? `Frame participants: ${frameFocusEntities.map((entity: any) => `${entity.name} (${entity.type})`).join(', ')}`
      : '';
    const frameLocationEntity = locationId
      ? projectData.entities.find((entity: any) => entity.id === locationId)
      : null;
    const frameLocationLine = frameLocationEntity ? `Frame location anchor: ${frameLocationEntity.name}` : '';
    const frameObjectLine = frameFocusEntities
      .filter((entity: any) => SIGNIFICANT_OBJECT_ENTITY_TYPES.has((entity.type || '').toLowerCase()))
      .map((entity: any) => entity.name);
    const frameObjectGroundingLine = frameObjectLine.length > 0
      ? `Significant objects to preserve: ${frameObjectLine.join(', ')}`
      : '';
    const frameHumanParticipants = frameFocusEntities
      .filter((entity: any) => isHumanReferenceEntityType((entity?.type || '').toLowerCase()));
    const frameHumanScopeLine = frameHumanParticipants.length > 0
      ? `Human cast scope: ${frameHumanParticipants.map((entity: any) => entity.name).join(', ')}`
      : '';
    const frameGroundingHeader = [participantGroundingLine, frameLocationLine, frameObjectGroundingLine]
      .filter(Boolean)
      .join('\n');

    const includeExpandedSceneContext = !frameHasExplicitParticipants;
    const sceneTitleAnchor = compressPromptText(scene.title || '', 120);
    // Strip appearance descriptors from scene prose, visual_beat, and description
    // to prevent text-based character descriptions from overriding reference images.
    // Character appearance is solely determined by reference images at render time.
    const sceneContextRaw = scene.prose || scene.description || '';
    const strippedSceneContext = characterRefs.length > 0
      ? stripAppearanceFromNarrative(sceneContextRaw)
      : sceneContextRaw;
    const sceneAnchor = includeExpandedSceneContext
      ? compressPromptText(strippedSceneContext, Math.min(Number(maxNarrativePromptChars) || 200, 200))
      : '';
    // Prefer structured visual_direction (guaranteed appearance-free) over legacy visual_beat/description
    const hasStructuredDirection = frame.visual_direction
      && typeof frame.visual_direction.action === 'string'
      && frame.visual_direction.action.trim().length > 0;

    let frameAnchorSource: string;

    if (hasStructuredDirection) {
      const vd = frame.visual_direction;
      const rawDirection = [vd.action, vd.composition, vd.lighting, vd.atmosphere, vd.environment]
        .filter(Boolean).join('. ');
      // Safety net: strip any appearance that leaked through despite LLM instructions
      frameAnchorSource = characterRefs.length > 0
        ? stripAppearanceFromNarrative(rawDirection)
        : rawDirection;
    } else {
      // Legacy fallback: regex stripping for old frames without visual_direction
      const rawFrameVisualBeat = typeof frame?.visual_beat === 'string' ? frame.visual_beat : '';
      const rawFrameDescription = typeof frame?.description === 'string' ? frame.description : '';
      const cleanFrameVisualBeat = characterRefs.length > 0
        ? stripAppearanceFromNarrative(rawFrameVisualBeat)
        : rawFrameVisualBeat;
      const cleanFrameDescription = characterRefs.length > 0
        ? stripAppearanceFromNarrative(rawFrameDescription)
        : rawFrameDescription;
      frameAnchorSource = [
        cleanFrameVisualBeat,
        !frameHasExplicitParticipants ? cleanFrameDescription : '',
      ].filter(Boolean).join(' ')
        || cleanFrameVisualBeat || cleanFrameDescription || '';
    }

    const frameAnchor = compressPromptText(
      frameAnchorSource || 'A cinematic moment in the story.',
      Number(maxFrameAnchorChars) || 300
    );
    const frameShotType = typeof frame?.shotType === 'string' ? frame.shotType.trim() : '';
    const frameCameraDirection = typeof frame?.camera === 'string' ? frame.camera.trim() : '';
    const frameMood = typeof frame?.mood === 'string' ? frame.mood.trim() : '';
    const shotScaleDirective = (() => {
      const lowered = frameShotType.toLowerCase();
      if (!lowered) return '';
      if (lowered.includes('extreme close')) {
        return 'Extreme close-up framing: face detail dominates frame; include only minimal context environment.';
      }
      if (lowered.includes('close')) {
        return 'Close-up framing: prioritize one subject identity and expression; background remains secondary.';
      }
      if (lowered.includes('medium')) {
        return 'Medium framing: preserve upper-body identity cues and action blocking clearly.';
      }
      if (lowered.includes('wide')) {
        return 'Wide framing: preserve full-body silhouettes and spatial relationship between participants.';
      }
      return '';
    })();
    // --- Compact frame prompt assembly ---
    // Structured like a shot card: setup → scene description → identity → constraints.
    // Keeps total text short so reference images get more model attention.

    const frameFrameType = outputIntent === 'comic-panel' ? 'comic panel'
      : outputIntent === 'video-keyframe' ? 'cinematic keyframe'
      : 'cinematic still frame';

    // Shot setup line: type, camera, mood, position — all in one line
    const shotInfoParts = [
      frameShotType || null,
      frameCameraDirection ? `camera: ${frameCameraDirection}` : null,
      frameMood ? `mood: ${frameMood}` : null,
      orderedFrameIndex >= 0 && orderedSceneFrames.length > 0
        ? `frame ${orderedFrameIndex + 1}/${orderedSceneFrames.length}`
        : null,
    ].filter(Boolean);
    const shotSetupLine = shotInfoParts.length > 0 ? shotInfoParts.join(', ') + '.' : '';

    // Setting line
    const frameSettingLine = frameLocationEntity ? `Setting: ${frameLocationEntity.name}.` : '';

    // Character identity + staging merged into one block
    const refMatchedFrameEntities = participantGroundingEntities
      .filter((entity: any) => characterRefs.some((ref: any) => ref.id === entity.id));
    const characterLines: string[] = [];
    if (refMatchedFrameEntities.length > 0) {
      // Build per-character lines with staging inline
      const actionMap = new Map<string, string>();
      for (const line of frameActionLines) {
        const match = line.match(/^- (.+?):\s*(.+)$/);
        if (match) actionMap.set(match[1], match[2]);
      }
      for (const entity of refMatchedFrameEntities) {
        const staging = actionMap.get(entity.name);
        characterLines.push(`- ${entity.name}: match reference image${staging ? ` — ${staging}` : ''}`);
      }
    }
    const characterBlock = characterLines.length > 0
      ? `[CHARACTERS]\n${characterLines.join('\n')}\nReference images are the sole visual authority for face, hair, build, and wardrobe.`
      : '';

    // Explicit participant scope (when frame has specific participants)
    const scopeLine = frameHasExplicitParticipants && frameHumanParticipants.length > 0
      ? `Render only: ${frameHumanParticipants.map((e: any) => e.name).join(', ')}.`
      : '';

    // Continuity — one compact line instead of multiple paragraphs
    const hasContinuity = sceneAnchorShotAttached || previousShots.length > 0;
    const continuityLine = hasContinuity
      ? 'Maintain continuity from previous shots for composition, lighting, and wardrobe. Character identity from reference images takes priority.'
      : '';

    // Frame constraint
    const textPolicySuffix = resolvedTextPolicy.policy === 'no-text'
      ? ' No text.'
      : resolvedTextPolicy.policy === 'diegetic-only'
        ? ' Text only on in-world props if requested.'
        : '';
    const frameConstraint = `Single ${frameFrameType}, one decisive moment.${textPolicySuffix}`;

    // Assemble: compact flowing structure
    let finalProse = '';

    // Shot setup + setting
    const headerParts = [shotSetupLine, frameSettingLine, shotScaleDirective].filter(Boolean);
    if (headerParts.length > 0) {
      finalProse += headerParts.join(' ') + '\n\n';
    }

    // Visual description (frame anchor is the primary creative content)
    finalProse += frameAnchor;

    // Scene context — only if frame lacks its own explicit participants
    if (sceneAnchor) {
      finalProse += `\n\n${sceneAnchor}`;
    }

    // Character identity + staging
    if (characterBlock) {
      finalProse += `\n\n${characterBlock}`;
    }
    if (scopeLine) {
      finalProse += `\n${scopeLine}`;
    }

    // Continuity + constraints
    if (continuityLine) {
      finalProse += `\n\n${continuityLine}`;
    }
    finalProse += `\n\n${frameConstraint}`;

    // Custom notes
    if (customPrompt) {
      finalProse += `\n\n[VISUAL NOTES: ${customPrompt}]`;
    }

    // Prepend visual style
    const compactFrameVisualStylePrompt = compressPromptText(effectiveVisualStylePrompt, 420);
    if (compactFrameVisualStylePrompt) {
      finalProse = `[VISUAL STYLE: ${compactFrameVisualStylePrompt}]\n\n${finalProse}`;
    }

    // Resolve additional reference images if provided — route to correct ref category
    if (Array.isArray(additionalRefUrls)) {
      for (const refUrl of additionalRefUrls) {
        const resolved = toImageDataFromUrl(refUrl);
        if (resolved) {
          const normalizedRef = normalizeComparableImageUrl(refUrl);
          const matchedEntity = (projectData.entities || []).find((e: any) =>
            normalizeComparableImageUrl(e.referenceImage) === normalizedRef ||
            normalizeComparableImageUrl(e.imageUrl) === normalizedRef
          );
          const FRAME_LOCATION_TYPES = new Set(['location', 'place', 'setting']);
          const FRAME_CHARACTER_TYPES = new Set(['character', 'person', 'agent', 'npc', 'protagonist', 'antagonist']);
          const etype = matchedEntity ? (matchedEntity.type || '').toLowerCase() : '';
          const refObj: import('../visual/image-generator').ReferenceImage = {
            id: `additional_ref_${characterRefs.length + objectRefs.length + locationRefs.length}`,
            data: resolved.data,
            mimeType: resolved.mimeType,
            description: matchedEntity ? `${matchedEntity.name} (${matchedEntity.type}) | entity reference` : 'User-selected reference image',
            type: FRAME_CHARACTER_TYPES.has(etype) ? 'character'
              : FRAME_LOCATION_TYPES.has(etype) ? 'location'
              : 'object',
          };
          if (refObj.type === 'character') characterRefs.push(refObj);
          else if (refObj.type === 'location') locationRefs.push(refObj);
          else objectRefs.push(refObj);
        }
      }
    }

    const enableIdentityRepair = typeof enableIdentityRepairInput === 'boolean'
      ? enableIdentityRepairInput
      : characterRefs.length > 0;
    const requestedIdentityRepairPasses = Number.isFinite(Number(identityRepairPasses))
      ? Number(identityRepairPasses)
      : 1;
    const totalIdentityRepairPasses = Math.max(0, Math.min(2, requestedIdentityRepairPasses));

    const initialImage = await imageGenerator.generateSceneImage({
      prose: finalProse,
      title: frame.title || scene.title,
      characterRefs,
      locationRefs,
      objectRefs,
      previousShots,
      aspectRatio: aspectRatio as any,
      imageSize: imageSize as any,
      usePro,
    });
    let image = initialImage;
    let identityRepairApplied = 0;
    let identityRepairError: string | undefined;
    if (enableIdentityRepair && characterRefs.length > 0 && totalIdentityRepairPasses > 0) {
      for (let pass = 1; pass <= totalIdentityRepairPasses; pass++) {
        const repairPreviousShots = [
          {
            id: `${sceneId}_${frameId}_identity_repair_${pass}`,
            data: image.data,
            mimeType: image.mimeType,
            description: `Frame render pass ${pass} (identity correction anchor)`,
            type: 'previous_shot',
          },
          ...previousShots,
        ].slice(0, 2);
        const repairPrompt = `${finalProse}\n\n[IDENTITY REPAIR PASS ${pass}]\nUse the attached previous render as composition anchor and keep framing stable. Correct character identity drift so every named participant matches their character reference image exactly.`;
        try {
          image = await imageGenerator.generateSceneImage({
            prose: repairPrompt,
            title: frame.title || scene.title,
            characterRefs,
            locationRefs,
            objectRefs,
            previousShots: repairPreviousShots,
            aspectRatio: aspectRatio as any,
            imageSize: imageSize as any,
            usePro,
          });
          identityRepairApplied += 1;
        } catch (repairError: any) {
          identityRepairError = repairError?.message || 'Identity repair failed';
          console.warn(`⚠️ Identity repair pass ${pass} failed for frame ${frameId}: ${identityRepairError}`);
          break;
        }
      }
    }

    const filename = `scene_${sceneId}_frame_${frameId}_${Date.now()}`;
    const savedPath = await imageGenerator.saveImage(image, filename);

    frame.imageUrl = `/api/narrative/visual/images/${path.basename(savedPath)}`;

    // Persist frame updates when possible
    const session = getWorldSession(projectId);
    const sceneIndex = projectData.interactions.findIndex((i: any) => i.id === sceneId);
    if (sceneIndex >= 0) {
      const storedScene = projectData.interactions[sceneIndex];
      if (storedScene.frames) {
        const storedFrameIndex = storedScene.frames.findIndex((f: any) => f.id === frameId);
        if (storedFrameIndex >= 0) {
          storedScene.frames[storedFrameIndex] = {
            ...storedScene.frames[storedFrameIndex],
            imageUrl: frame.imageUrl,
            lastImagePrompt: typeof image.prompt === 'string' ? image.prompt : undefined,
            lastImageModel: typeof image.model === 'string' ? image.model : undefined,
            lastImageAt: new Date().toISOString(),
            visualDirty: false,
            visualDirtyAt: undefined,
            visualDirtyReason: undefined,
            visualDirtyEntityIds: [],
            visualDirtyEntityNames: [],
          };
        }
        const dirtyFrameCount = storedScene.frames.filter((candidate: any) => candidate?.visualDirty).length;
        storedScene.frameVisualDirtyCount = dirtyFrameCount;
        storedScene.frameImagesDirty = dirtyFrameCount > 0;
      }
      storedScene.updatedAt = new Date().toISOString();
      session.uncommittedChanges = true;
      if (!session.pendingChanges.addedSceneIds.has(sceneId)) {
        session.pendingChanges.modifiedSceneIds.add(sceneId);
      }
      saveProjectData(projectId, projectData);
    }

    const submittedReferences = {
      characterIds: characterRefs.map((ref) => ref.id),
      objectIds: objectRefs.map((ref) => ref.id),
      locationIds: locationRefs.map((ref) => ref.id),
      previousShotIds: previousShots.map((ref) => ref.id),
      budgets: {
        characters: maxCharacterRefs,
        objects: maxObjectRefs,
      },
      counts: {
        characters: characterRefs.length,
        objects: objectRefs.length,
        locations: locationRefs.length,
        previousShots: previousShots.length,
        total: characterRefs.length + objectRefs.length + locationRefs.length + previousShots.length,
      },
    };

    res.json({
      success: true,
      sceneId,
      frameId,
      image: image.data.toString('base64'),
      mimeType: image.mimeType,
      prompt: image.prompt,
      promptLength: typeof image.prompt === "string" ? image.prompt.length : 0,
      model: image.model,
      savedPath,
      imageUrl: frame.imageUrl,
      referenceCount: image.referenceCount,
      submittedReferences,
      actualReferencesUsed: {
        refs: Array.isArray((image as any).referenceManifest) ? (image as any).referenceManifest : [],
        counts: (image as any).referenceTypeCounts || undefined,
      },
      outputIntent,
      textPolicy: resolvedTextPolicy.policy,
      textPolicyLocked: resolvedTextPolicy.locked,
      promptStrategyVersion: 'frame-ref-registry-v3',
      strictCharacterRefs: Boolean(strictCharacterRefs),
      requiredCharacterIds: Array.from(requiredCharacterSet),
      identityRepair: {
        requested: Boolean(enableIdentityRepair),
        requestedPasses: totalIdentityRepairPasses,
        appliedPasses: identityRepairApplied,
        failed: Boolean(identityRepairError),
        error: identityRepairError,
      },
      referenceDiagnostics: {
        participants: participantReferenceDiagnostics,
        location: locationReferenceDiagnostic,
      },
    });
  } catch (error: any) {
    console.error('Frame image generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Visual generation - Entity Portrait with Nano Banana
// Generates character portraits, organization logos, location establishing shots, etc.
app.post('/api/narrative/visual/entity/:entityId', async (req, res) => {
  try {
    const { entityId } = req.params;
    const {
      aspectRatio = '1:1',
      imageSize = '1K',
      // Allow entity data to be passed directly (for React-state entities)
      entityData,
      // Visual style prompt to inject into image generation
      visualStylePrompt,
      // Custom prompt to influence generation without overriding references
      customPrompt,
      // Variation index for generating diverse alternatives
      variation,
      // Force regeneration even if cached
      forceRegenerate = false,
      // Additional reference image URLs for style/visual influence
      additionalRefUrls,
    } = req.body;
    const projectId = req.body.projectId || getActiveProjectId();
    const effectiveVisualStylePrompt = getEffectiveVisualStylePrompt(projectId, visualStylePrompt);

    if (!portraitGenerator) {
      return res.status(503).json({ error: 'Image generation not available - no API key' });
    }

    const projectData = loadProjectData(projectId);

    // Use provided entity data or look up from stored data
    let entity = entityData;
    if (!entity) {
      entity = projectData.entities.find((e: any) => e.id === entityId);
    }

    if (!entity) {
      return res.status(404).json({ error: `Entity not found: ${entityId}` });
    }

    console.log(`🎨 Generating portrait for entity: ${entity.name} (${entity.type})`);

    // Merge custom prompt + visual style into description (non-overriding)
    const variationNumber = Number.isFinite(Number(variation)) ? Number(variation) : undefined;
    const variationDirection = variationNumber ? PORTRAIT_VARIATION_POOL[(variationNumber - 1) % PORTRAIT_VARIATION_POOL.length] : undefined;
    let mergedDescription = entity.description || '';
    if (variationDirection) {
      mergedDescription = `${mergedDescription}\n\n[VARIATION DIRECTION: Create a DISTINCTLY DIFFERENT image from other variations. ${variationDirection}]`.trim();
    }
    if (customPrompt) {
      mergedDescription = `${mergedDescription}\n\n[ADDITIONAL VISUAL NOTES: ${customPrompt}]`.trim();
    }
    if (effectiveVisualStylePrompt) {
      mergedDescription = `[VISUAL STYLE: ${effectiveVisualStylePrompt}]\n\n${mergedDescription || entity.description || ''}`.trim();
    }
    if (customPrompt || effectiveVisualStylePrompt || variationDirection) {
      entity = {
        ...entity,
        description: mergedDescription || entity.description || '',
      };
    }

    // Determine if it's a location (uses different prompt style)
    const isLocation = ['location', 'place', 'setting'].includes(entity.type?.toLowerCase() || '');
    const styleCacheToken = getStyleCacheToken(effectiveVisualStylePrompt);
    const shouldBypassCache = Boolean(forceRegenerate || variationNumber);
    const saveSuffix = `${variationNumber ? `v${variationNumber}_` : ''}${Date.now()}`;
    const cacheKey = variationNumber
      ? `${entity.id}:v${variationNumber}:${Date.now()}`
      : (forceRegenerate
        ? `${entity.id}:regen:${Date.now()}`
        : `${entity.id}:style:${styleCacheToken}`);

    // Resolve additional reference images if provided — smart type assignment
    const additionalRefs: import('../visual/image-generator').ReferenceImage[] = [];
    if (Array.isArray(additionalRefUrls)) {
      console.log(`   📎 Processing ${additionalRefUrls.length} additional reference URLs...`);
      for (const refUrl of additionalRefUrls) {
        console.log(`   📎 Resolving ref: ${refUrl}`);
        const resolved = toImageDataFromUrl(refUrl);
        if (resolved) {
          const normalizedRef = normalizeComparableImageUrl(refUrl);
          const matchedEntity = (projectData.entities || []).find((e: any) =>
            normalizeComparableImageUrl(e.referenceImage) === normalizedRef ||
            normalizeComparableImageUrl(e.imageUrl) === normalizedRef
          );
          const LOCATION_ENTITY_TYPES = new Set(['location', 'place', 'setting']);
          const CHARACTER_ENTITY_TYPES = new Set(['character', 'person', 'agent', 'npc', 'protagonist', 'antagonist']);
          let refType: 'character' | 'location' | 'object' = 'object';
          if (matchedEntity) {
            const etype = (matchedEntity.type || '').toLowerCase();
            if (CHARACTER_ENTITY_TYPES.has(etype)) refType = 'character';
            else if (LOCATION_ENTITY_TYPES.has(etype)) refType = 'location';
            else refType = 'object';
          }
          console.log(`   ✅ Resolved ref: ${matchedEntity?.name || 'unknown'} (type=${refType}, ${(resolved.data.length / 1024).toFixed(0)}KB)`);
          additionalRefs.push({
            id: `additional_ref_${additionalRefs.length}`,
            data: resolved.data,
            mimeType: resolved.mimeType,
            description: matchedEntity ? `${matchedEntity.name} (${matchedEntity.type}) | entity reference` : 'User-selected reference image',
            type: refType,
          });
        } else {
          console.warn(`   ❌ FAILED to resolve ref URL: ${refUrl}`);
        }
      }
      console.log(`   📎 Total resolved references: ${additionalRefs.length}/${additionalRefUrls.length}`);
    }

    let result;
    if (isLocation) {
      result = await portraitGenerator.generateLocationShot(entity, {
        bypassCache: shouldBypassCache,
        cacheKey,
        saveSuffix,
        additionalRefs: additionalRefs.length > 0 ? additionalRefs : undefined,
      });
    } else {
      result = await portraitGenerator.generatePortrait(entity, {
        bypassCache: shouldBypassCache,
        cacheKey,
        saveSuffix,
        additionalRefs: additionalRefs.length > 0 ? additionalRefs : undefined,
      });
    }

    // Get the generated image
    const image = isLocation ? result.establishingShot : result.portrait;

    // Build filename and path
    const portraitDir = path.join(process.cwd(), '.narrative-data', 'generated-images', 'portraits');
    const ext = image.mimeType.includes('png') ? 'png' : 'jpeg';
    const safeName = entity.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    const filename = `${isLocation ? 'location' : 'portrait'}_${entityId}_${safeName}_${saveSuffix}.${ext}`;
    const filePath = path.join(portraitDir, filename);

    // Save to disk
    if (!fs.existsSync(portraitDir)) {
      fs.mkdirSync(portraitDir, { recursive: true });
    }
    fs.writeFileSync(filePath, image.data);

    console.log(`✅ Portrait saved: ${filePath}`);

    res.json({
      success: true,
      entityId,
      entityName: entity.name,
      entityType: entity.type,
      image: image.data.toString('base64'),
      mimeType: image.mimeType,
      imageUrl: `/api/narrative/visual/portraits/${filename}`,
      portraitPrompt: customPrompt || null,
    });
  } catch (error: any) {
    console.error('Entity portrait generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve portrait images
app.get('/api/narrative/visual/portraits/:filename', (req, res) => {
  const { filename } = req.params;
  const portraitDir = path.join(process.cwd(), '.narrative-data', 'generated-images', 'portraits');
  const filePath = path.join(portraitDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Portrait not found' });
  }

  const ext = path.extname(filename).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  fs.createReadStream(filePath).pipe(res);
});

// Reference library - list all generated images across the project
app.get('/api/narrative/visual/reference-library/:projectId', (req, res) => {
  try {
    const { projectId } = req.params;
    const projectData = loadProjectData(projectId);
    const items: { url: string; label: string; type: string; entityId?: string; sceneId?: string; frameId?: string }[] = [];

    // Entity portraits + variations
    for (const entity of (projectData.entities || [])) {
      const imgUrl = entity.referenceImage || entity.imageUrl;
      if (imgUrl) {
        items.push({ url: imgUrl, label: entity.name, type: 'entity', entityId: entity.id });
      }
      if (Array.isArray(entity.portraitVariations)) {
        for (const varUrl of entity.portraitVariations) {
          if (varUrl && varUrl !== imgUrl) {
            items.push({ url: varUrl, label: `${entity.name} (variation)`, type: 'entity', entityId: entity.id });
          }
        }
      }
    }

    // Scene images
    for (const scene of (projectData.interactions || [])) {
      if (scene.imageUrl) {
        items.push({ url: scene.imageUrl, label: scene.title || scene.id, type: 'scene', sceneId: scene.id });
      }
      // Frame images
      if (Array.isArray(scene.frames)) {
        for (const frame of scene.frames) {
          if (frame.imageUrl) {
            items.push({
              url: frame.imageUrl,
              label: `${scene.title || scene.id} / ${frame.title || frame.id}`,
              type: 'frame',
              sceneId: scene.id,
              frameId: frame.id,
            });
          }
        }
      }
    }

    res.json({ success: true, items });
  } catch (error: any) {
    console.error('Reference library error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Visual generation - Generate from prompt (generic)
app.post('/api/narrative/visual/generate', async (req, res) => {
  try {
    const { prompt, style } = req.body;

    if (!imageGenerator) {
      return res.status(503).json({ error: 'Image generation not available - no API key' });
    }

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log(`🎨 Generating image from prompt: ${prompt.substring(0, 50)}...`);

    if (style) {
      imageGenerator.setStyle(style);
    }

    const image = await imageGenerator.generateImage(prompt);

    res.json({
      success: true,
      image: image.data.toString('base64'),
      mimeType: image.mimeType,
      prompt: image.prompt,
    });
  } catch (error: any) {
    console.error('Image generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get list of generated images
app.get('/api/narrative/visual/images', (req, res) => {
  const outputDir = path.join(process.cwd(), '.narrative-data', 'generated-images');

  if (!fs.existsSync(outputDir)) {
    return res.json([]);
  }

  try {
    const files = fs.readdirSync(outputDir)
      .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
      .map(f => {
        const filePath = path.join(outputDir, f);
        const stats = fs.statSync(filePath);
        return {
          filename: f,
          path: `/api/narrative/visual/images/${f}`,
          size: stats.size,
          createdAt: stats.birthtime,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json(files);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Serve generated images
app.get('/api/narrative/visual/images/:filename', (req, res) => {
  const { filename } = req.params;
  const outputDir = path.join(process.cwd(), '.narrative-data', 'generated-images');
  const filePath = path.join(outputDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Image not found' });
  }

  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  };

  res.contentType(mimeTypes[ext] || 'image/png');
  res.sendFile(filePath);
});

// Legacy endpoint for panels
app.post('/api/narrative/visual/panels/:interactionId', async (req, res) => {
  // Redirect to scene endpoint
  req.params.sceneId = req.params.interactionId;
  res.redirect(307, `/api/narrative/visual/scene/${req.params.interactionId}`);
});

// ============================================================================
// CANON WORKBENCH ENDPOINTS (For the new UI features)
// ============================================================================

/**
 * Query the canon with natural language
 * POST /api/canon/query
 * Body: { question: string, context?: string }
 * Returns: { answer: string, sources: Source[] }
 */
app.post('/api/canon/query', async (req, res) => {
  try {
    const { question, context } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // For demo, provide a simple response based on entities
    const questionLower = question.toLowerCase();

    // Find relevant entities
    const relevantEntities = demoEntities.filter(e => {
      const nameMatch = e.name.toLowerCase().includes(questionLower) ||
        questionLower.includes(e.name.toLowerCase());
      const descMatch = e.description?.toLowerCase().includes(questionLower);
      return nameMatch || descMatch;
    });

    let answer: string;
    let sources: any[] = [];

    if (relevantEntities.length > 0) {
      const mainEntity = relevantEntities[0];
      answer = `**${mainEntity.name}** (${mainEntity.type})\n\n${mainEntity.description}`;

      // Find related relationships
      const relatedRels = demoRelationships.filter(
        r => r.sourceId === mainEntity.id || r.targetId === mainEntity.id
      );

      if (relatedRels.length > 0) {
        answer += '\n\n**Key Relationships:**\n';
        relatedRels.forEach(r => {
          const otherId = r.sourceId === mainEntity.id ? r.targetId : r.sourceId;
          const otherEntity = demoEntities.find(e => e.id === otherId);
          if (otherEntity) {
            answer += `- ${r.type.replace(/_/g, ' ')} ${otherEntity.name}\n`;
          }
        });
      }

      sources = relevantEntities.slice(0, 3).map(e => ({
        id: e.id,
        name: e.name,
        type: e.type,
        relevance: 0.9,
      }));
    } else {
      answer = "I couldn't find specific information about that in the current canon. Try asking about characters like Agent Chen, Director Voss, or concepts like the Convergence Engine.";
    }

    res.json({ answer, sources });
  } catch (error) {
    console.error('Error querying canon:', error);
    res.status(500).json({ error: 'Failed to query canon' });
  }
});

/**
 * Import and extract entities from text
 * POST /api/canon/import
 * Body: { text: string, source: string }
 * Returns: { entities: Entity[], relationships: Relationship[] }
 */
app.post('/api/canon/import', async (req, res) => {
  try {
    const { text, source, projectId } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // LLM extraction is REQUIRED - no regex fallback
    if (!entityExtractor || !relationshipExtractor) {
      console.error('❌ LLM not configured - entity extraction requires LLM');
      return res.status(503).json({
        error: 'Entity extraction requires LLM',
        message: 'No GEMINI_API_KEY or GOOGLE_AI_API_KEY configured. Entity extraction cannot be performed without an LLM.',
        hint: 'Set the GEMINI_API_KEY environment variable and restart the server.',
      });
    }

    console.log('🔍 Starting LLM entity extraction...');
    const startTime = Date.now();

    try {
      // Get existing entities for the specified project (for deduplication)
      const { data: projectData } = getProjectDataForRequest(projectId);
      const existingEntities = projectData.entities;
      console.log(`   Deduplicating against ${existingEntities.length} existing entities in project ${projectId || 'active'}`);
      const existingRelationships = projectData.relationships;

      // Extract entities using LLM
      const extractedEntities = await entityExtractor.extractEntities(text, existingEntities);
      console.log(`✅ Extracted ${extractedEntities.length} entities in ${Date.now() - startTime}ms`);

      // Extract relationships using LLM (pass existing for deduplication)
      const allEntities = [...existingEntities, ...extractedEntities];
      const extractedRelationships = await relationshipExtractor.extractRelationships(text, allEntities, undefined, existingRelationships);
      console.log(`✅ Extracted ${extractedRelationships.length} relationships (deduplicated against ${existingRelationships.length} existing)`);

      return res.json({
        entities: extractedEntities,
        relationships: extractedRelationships,
        method: 'llm',
        duration: Date.now() - startTime,
      });
    } catch (llmError: any) {
      console.error('❌ LLM extraction failed:', llmError);
      return res.status(500).json({
        error: 'LLM extraction failed',
        message: llmError.message || 'Unknown error during entity extraction',
        hint: 'Check the server logs for more details. The LLM may have timed out or returned an invalid response.',
      });
    }
  } catch (error) {
    console.error('Error importing text:', error);
    res.status(500).json({ error: 'Failed to import text' });
  }
});

/**
 * Commit extracted entities to the canon
 * POST /api/canon/import/commit
 * Body: { entities: Entity[], relationships: Relationship[], message: string }
 */
app.post('/api/canon/import/commit', async (req, res) => {
  try {
    const { entities, relationships, message, projectId } = req.body;

    if (!entities || entities.length === 0) {
      return res.status(400).json({ error: 'At least one entity is required' });
    }

    // Get the project data
    const pid = projectId || getActiveProjectId();
    const projectData = loadProjectData(pid);

    // Add new entities (avoid duplicates by ID)
    const existingEntityIds = new Set(projectData.entities.map((e: any) => e.id));
    const newEntities = entities.filter((e: any) => !existingEntityIds.has(e.id));
    projectData.entities.push(...newEntities);

    // Add new relationships (avoid duplicates by ID)
    const existingRelIds = new Set(projectData.relationships.map((r: any) => r.id));
    const newRelationships = (relationships || []).filter((r: any) => !existingRelIds.has(r.id));
    projectData.relationships.push(...newRelationships);

    // Create a commit record
    const commitId = `commit_${Date.now()}`;
    const commitHash = Math.random().toString(36).slice(2, 10);
    const commit = {
      id: commitId,
      hash: commitHash,
      message: message || `Imported ${newEntities.length} entities`,
      timestamp: new Date().toISOString(),
      branch: 'main',
      author: 'user',
      operations: [
        ...newEntities.map((e: any) => ({ type: 'add', entityType: e.type, entityName: e.name })),
        ...newRelationships.map((r: any) => ({ type: 'link', entityType: 'relationship', entityName: `${r.source} → ${r.target}` })),
      ],
      metrics: {
        entitiesChanged: newEntities.length,
        relationshipsChanged: newRelationships.length,
        consistencyScore: 0.95,
      },
    };
    projectData.commits.unshift(commit); // Add to beginning (most recent first)

    // Save the updated project data
    saveProjectData(pid, projectData);
    for (const entity of newEntities) {
      if (entity?.id) {
        queueAutoEntityVisualGeneration(pid, entity.id, 'canon_import');
      }
    }

    console.log(`✅ Committed ${newEntities.length} entities, ${newRelationships.length} relationships to project ${pid}`);

    res.json({
      success: true,
      commitId,
      commitHash,
      message: commit.message,
      entitiesAdded: newEntities.length,
      relationshipsAdded: newRelationships.length,
      totalEntities: projectData.entities.length,
      totalRelationships: projectData.relationships.length,
    });
  } catch (error) {
    console.error('Error committing import:', error);
    res.status(500).json({ error: 'Failed to commit import' });
  }
});

/**
 * Start book-length extraction (async with progress tracking)
 * POST /api/canon/import/book
 * Body: { text: string, source?: string }
 * Returns: { jobId: string }
 */
app.post('/api/canon/import/book', async (req, res) => {
  try {
    const { text, source } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (!chunkedPipeline) {
      return res.status(503).json({
        error: 'Book extraction unavailable - no LLM API key configured',
        hint: 'Set GEMINI_API_KEY or GOOGLE_AI_API_KEY environment variable'
      });
    }

    // Create a job
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const job: ExtractionJob = {
      id: jobId,
      status: 'pending',
      progress: null,
      result: null,
      error: null,
      startedAt: Date.now(),
      completedAt: null,
    };
    extractionJobs.set(jobId, job);

    // Start extraction in background
    console.log(`📚 Starting book extraction job ${jobId} (${text.length} chars)`);
    job.status = 'processing';

    // Run extraction asynchronously
    (async () => {
      try {
        const result = await chunkedPipeline!.extractFromBook(text);

        job.status = 'completed';
        job.completedAt = Date.now();
        job.result = {
          entities: result.structure.entities,
          relationships: result.structure.relationships,
          scenes: result.structure.scenes,
          interactions: result.structure.interactions,
          stats: {
            totalChunks: result.chunks.length,
            totalTimeMs: result.totalTimeMs,
            entitiesExtracted: result.structure.entities.length,
            relationshipsExtracted: result.structure.relationships.length,
            scenesExtracted: result.structure.scenes?.length || 0,
            deduplication: result.deduplicationStats,
          },
          source: source || 'book-upload',
        };
        console.log(`✅ Book extraction job ${jobId} completed: ${result.structure.entities.length} entities`);
      } catch (error: any) {
        job.status = 'failed';
        job.completedAt = Date.now();
        job.error = error.message || 'Unknown error during extraction';
        console.error(`❌ Book extraction job ${jobId} failed:`, error);
      }
    })();

    res.json({
      jobId,
      message: 'Book extraction started',
      estimatedChunks: Math.ceil(text.length / 6000),
    });
  } catch (error) {
    console.error('Error starting book extraction:', error);
    res.status(500).json({ error: 'Failed to start book extraction' });
  }
});

/**
 * Get book extraction job status
 * GET /api/canon/import/book/:jobId
 */
app.get('/api/canon/import/book/:jobId', (req, res) => {
  const job = extractionJobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    result: job.result,
    error: job.error,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    durationMs: job.completedAt ? job.completedAt - job.startedAt : Date.now() - job.startedAt,
  });
});

/**
 * Upload multiple text/markdown files for extraction
 * POST /api/canon/import/files
 * Accepts multipart/form-data with files[] field
 */
app.post('/api/canon/import/files', upload.array('files', 20), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    const projectId = req.body.projectId;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // LLM is REQUIRED for file extraction
    if (!entityExtractor || !relationshipExtractor) {
      return res.status(503).json({
        error: 'File extraction requires LLM',
        message: 'No GEMINI_API_KEY or GOOGLE_AI_API_KEY configured. Entity extraction cannot be performed without an LLM.',
        hint: 'Set the GEMINI_API_KEY environment variable and restart the server.',
      });
    }

    // Get existing data for deduplication
    const { data: projectData } = getProjectDataForRequest(projectId);
    console.log(`📁 Processing ${files.length} uploaded files (deduplicating against ${projectData.entities.length} existing entities)...`);

    // Process each file
    const results: Array<{
      filename: string;
      size: number;
      textLength: number;
      entities: any[];
      relationships: any[];
      method: string;
      error?: string;
    }> = [];

    for (const file of files) {
      const text = file.buffer.toString('utf-8');
      console.log(`  📄 ${file.originalname} (${text.length} chars)`);

      try {
        // Use existing entities from project for deduplication (accumulate across files)
        const existingEntities = [...projectData.entities, ...results.flatMap(r => r.entities)];
        const existingRelationships = [...projectData.relationships, ...results.flatMap(r => r.relationships)];

        const extractedEntities = await entityExtractor.extractEntities(text, existingEntities);
        const allEntities = [...existingEntities, ...extractedEntities];
        const extractedRelationships = await relationshipExtractor.extractRelationships(text, allEntities, undefined, existingRelationships);

        results.push({
          filename: file.originalname,
          size: file.size,
          textLength: text.length,
          entities: extractedEntities,
          relationships: extractedRelationships,
          method: 'llm',
        });

        console.log(`    ✅ ${extractedEntities.length} entities, ${extractedRelationships.length} relationships`);
      } catch (fileError: any) {
        console.error(`    ❌ Failed: ${fileError.message}`);
        results.push({
          filename: file.originalname,
          size: file.size,
          textLength: text.length,
          entities: [],
          relationships: [],
          method: 'failed',
          error: fileError.message,
        });
      }
    }

    // Aggregate all results
    const allEntities = results.flatMap(r => r.entities);
    const allRelationships = results.flatMap(r => r.relationships);
    const successCount = results.filter(r => r.method === 'llm').length;
    const failCount = results.filter(r => r.method === 'failed').length;

    console.log(`✅ Completed: ${successCount} succeeded, ${failCount} failed`);
    console.log(`   Total: ${allEntities.length} entities, ${allRelationships.length} relationships`);

    res.json({
      success: failCount === 0,
      filesProcessed: files.length,
      filesSucceeded: successCount,
      filesFailed: failCount,
      totalEntities: allEntities.length,
      totalRelationships: allRelationships.length,
      entities: allEntities,
      relationships: allRelationships,
      fileResults: results.map(r => ({
        filename: r.filename,
        size: r.size,
        textLength: r.textLength,
        entitiesFound: r.entities.length,
        relationshipsFound: r.relationships.length,
        method: r.method,
        error: r.error,
      })),
    });
  } catch (error: any) {
    console.error('Error processing file uploads:', error);
    res.status(500).json({ error: error.message || 'Failed to process uploaded files' });
  }
});

/**
 * Generate grounded narrative content
 * POST /api/canon/generate
 * Body: { prompt: string, type: string, constraints: object, branch?: string }
 * Returns: { content: string, newEntities: Entity[], newRelationships: Relationship[] }
 */
app.post('/api/canon/generate', async (req, res) => {
  try {
    const { prompt, type, constraints, branch } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Build context from existing canon
    const relevantEntities = demoEntities.filter(e => {
      if (constraints?.mustInclude?.includes(e.id)) return true;
      if (constraints?.location === e.id) return true;
      return prompt.toLowerCase().includes(e.name.toLowerCase());
    });

    // For demo, generate sample content based on type
    let content: string;
    const tone = constraints?.tone || 'neutral';

    switch (type) {
      case 'scene':
        content = generateDemoScene(prompt, relevantEntities, tone);
        break;
      case 'dialogue':
        content = generateDemoDialogue(prompt, relevantEntities, tone);
        break;
      case 'description':
        content = generateDemoDescription(prompt, relevantEntities, tone);
        break;
      case 'outline':
        content = generateDemoOutline(prompt, relevantEntities, tone);
        break;
      default:
        content = generateDemoScene(prompt, relevantEntities, tone);
    }

    // Simulate discovering new entities (in production, LLM would detect these)
    const newEntities: any[] = [];
    const newRelationships: any[] = [];

    // Look for potential new entity mentions in the prompt
    const potentialNames = prompt.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g) || [];
    potentialNames.forEach(name => {
      const existing = demoEntities.find(e => e.name.toLowerCase() === name.toLowerCase());
      if (!existing && name.length > 3) {
        newEntities.push({
          id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          name,
          type: 'character', // Default guess
          description: `Mentioned in generated ${type}`,
        });
      }
    });

    res.json({
      content,
      newEntities,
      newRelationships,
      branch: branch || 'main',
    });
  } catch (error) {
    console.error('Error generating content:', error);
    res.status(500).json({ error: 'Failed to generate content' });
  }
});

// Helper functions for demo content generation
function generateDemoScene(prompt: string, entities: any[], tone: string): string {
  const chars = entities.filter(e => e.type === 'character');
  const locs = entities.filter(e => e.type === 'location');

  const location = locs[0]?.name || 'the shadowed corridor';
  const char1 = chars[0]?.name || 'The operative';
  const char2 = chars[1]?.name || 'the figure';

  const toneDescriptors: Record<string, string> = {
    tense: 'The air crackled with unspoken tension.',
    mysterious: 'Shadows seemed to hold secrets just beyond comprehension.',
    hopeful: 'A faint glimmer of possibility hung in the air.',
    dark: 'Darkness pressed in from all sides, oppressive and absolute.',
    action: 'Everything happened at once, a blur of motion and instinct.',
    emotional: 'The weight of the moment threatened to overwhelm.',
    neutral: 'The scene unfolded with measured precision.',
  };

  return `SCENE: ${prompt}

SETTING: ${location}

${toneDescriptors[tone] || toneDescriptors.neutral}

${char1} moved through ${location}, every step calculated. The weight of the mission pressed down, but there was no turning back now.

${char2 !== 'the figure' ? `${char2} watched from the shadows, waiting for the right moment.` : 'Something stirred in the darkness ahead.'}

"We don't have much time," ${char1} said, voice barely above a whisper.

The moment hung suspended, reality itself seeming to hold its breath, waiting to see which timeline would manifest.

---
Generated based on: "${prompt}"
Tone: ${tone}
Characters: ${chars.map(c => c.name).join(', ') || 'None specified'}`;
}

function generateDemoDialogue(prompt: string, entities: any[], tone: string): string {
  const chars = entities.filter(e => e.type === 'character');
  const char1 = chars[0]?.name || 'CHARACTER A';
  const char2 = chars[1]?.name || 'CHARACTER B';

  return `DIALOGUE: ${prompt}

${char1}: The timeline is shifting. I can feel it.

${char2}: You always did have that... sensitivity. Is it getting worse?

${char1}: Every day. Sometimes I see echoes of paths not taken. Ghosts of decisions.

${char2}: And this mission?

${char1}: This mission... it changes everything. For better or worse.

${char2}: (pause) Then we'd better make sure it's for better.

${char1}: That's why I came to you. I can't do this alone.

---
Generated based on: "${prompt}"
Tone: ${tone}
Characters: ${char1}, ${char2}`;
}

function generateDemoDescription(prompt: string, entities: any[], tone: string): string {
  const entity = entities[0];

  if (entity?.type === 'location') {
    return `DESCRIPTION: ${entity.name}

${entity.description}

The architecture speaks of power and control—clean lines and cold surfaces that seem to absorb light rather than reflect it. Holographic displays flicker with streams of timeline data, each representing a reality that might be, or might have been.

The air itself feels charged, as if the boundaries between possibilities are thinner here. Those who work within these walls speak of strange moments—déjà vu that feels more like prophecy, dreams that taste of other lives.

---
Generated based on: "${prompt}"`;
  }

  if (entity?.type === 'character') {
    return `DESCRIPTION: ${entity.name}

${entity.description}

There's something in the way they carry themselves—a weight that speaks of knowledge better left unknown. Their eyes hold the particular quality of those who have seen too many timelines collapse.

${entity.traits ? `Known for being ${entity.traits.join(', ')}.` : ''}

Every gesture is precise, every word chosen. In the business of timeline manipulation, there's no room for accidents. No room for hesitation.

---
Generated based on: "${prompt}"`;
  }

  return `DESCRIPTION: ${prompt}

The scene unfolds with meticulous detail—each element placed with purpose, each shadow holding meaning. In this reality, nothing is accidental.

What strikes first is the atmosphere: heavy with potential, electric with possibility. The boundary between what is and what could be seems paper-thin here.

---
Generated based on: "${prompt}"`;
}

function generateDemoOutline(prompt: string, entities: any[], tone: string): string {
  const chars = entities.filter(e => e.type === 'character').map(c => c.name);
  const locs = entities.filter(e => e.type === 'location').map(l => l.name);

  return `OUTLINE: ${prompt}

## Beat 1: Setup
- Establish the current state of the timeline
- Introduce the central tension: ${prompt}
${chars.length > 0 ? `- Key characters: ${chars.join(', ')}` : ''}
${locs.length > 0 ? `- Locations: ${locs.join(', ')}` : ''}

## Beat 2: Rising Action
- The initial plan encounters complications
- Stakes become clear—what will be lost if they fail
- Character relationships are tested

## Beat 3: Midpoint Revelation
- A discovery changes understanding of the situation
- New information forces a choice
- The path forward becomes uncertain

## Beat 4: Crisis
- The darkest moment before resolution
- All seems lost; the preferred timeline appears to be collapsing
- Characters must decide what they're willing to sacrifice

## Beat 5: Climax
- Final confrontation or decision point
- The timeline branches here
- Everything depends on this moment

## Beat 6: Resolution
- Aftermath of the climactic choice
- New status quo established
- Seeds planted for future developments

---
Generated outline for: "${prompt}"
Tone: ${tone}`
}

// ============================================================================
// PROJECT MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get all projects
 * GET /api/projects
 */
app.get('/api/projects', (req, res) => {
  res.json(projects);
});

/**
 * Get a specific project
 * GET /api/projects/:id
 */
app.get('/api/projects/:id', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  res.json(project);
});

/**
 * Create a new project
 * POST /api/projects
 */
app.post('/api/projects', (req, res) => {
  const { name, description, color, styleProfile } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  const normalizedStyleProfile = normalizeStyleProfile(styleProfile);

  const newProject = {
    id: `project_${Date.now()}`,
    name,
    description: description || '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isActive: false,
    stats: { entities: 0, relationships: 0, commits: 0, branches: 1 },
    color: color || '#8b5cf6',
    ...(normalizedStyleProfile ? { styleProfile: normalizedStyleProfile } : {}),
  };

  projects.push(newProject);
  saveProjects(projects); // Persist to file
  res.status(201).json(newProject);
});

/**
 * Update a project
 * PUT /api/projects/:id
 */
app.put('/api/projects/:id', (req, res) => {
  const index = projects.findIndex(p => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const { name, description, color, styleProfile } = req.body;
  const nextStyleProfile = styleProfile === undefined
    ? projects[index].styleProfile
    : styleProfile === null
      ? undefined
      : normalizeStyleProfile(styleProfile);

  projects[index] = {
    ...projects[index],
    name: name || projects[index].name,
    description: description !== undefined ? description : projects[index].description,
    color: color || projects[index].color,
    ...(nextStyleProfile ? { styleProfile: nextStyleProfile } : { styleProfile: undefined }),
    updatedAt: Date.now(),
  };

  saveProjects(projects); // Persist to file
  res.json(projects[index]);
});

/**
 * Delete a project
 * DELETE /api/projects/:id
 */
app.delete('/api/projects/:id', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (project.isActive) {
    return res.status(400).json({ error: 'Cannot delete the active project' });
  }

  projects = projects.filter(p => p.id !== req.params.id);
  saveProjects(projects); // Persist to file
  res.json({ success: true, deleted: req.params.id });
});

/**
 * Switch to a different project
 * POST /api/projects/switch
 */
app.post('/api/projects/switch', (req, res) => {
  const { projectId } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  const project = projects.find(p => p.id === projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  // Deactivate all projects and activate the selected one
  projects = projects.map(p => ({
    ...p,
    isActive: p.id === projectId,
  }));

  saveProjects(projects); // Persist to file
  res.json({ success: true, activeProject: project });
});

/**
 * Generate a new world from a creative prompt
 * POST /api/projects/generate
 * Body: { prompt: string, name?: string, color?: string }
 */
app.post('/api/projects/generate', async (req, res) => {
  try {
    const { prompt, name, color, styleProfile } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'A creative prompt is required' });
    }

    if (!llmAdapter) {
      return res.status(503).json({
        error: 'World generation requires LLM',
        message: 'No GEMINI_API_KEY configured.',
      });
    }

    console.log(`🌍 Generating world from prompt: "${prompt.slice(0, 80)}..."`);

    // Define the world blueprint schema
    const WorldBlueprintSchema = z.object({
      worldName: z.string().describe('A compelling name for this world'),
      worldDescription: z.string().describe('2-3 sentence overview of this world'),
      entities: z.array(z.object({
        name: z.string(),
        type: z.enum(['character', 'location', 'organization', 'object', 'concept', 'event', 'creature']),
        description: z.string().describe('2-3 sentences describing this entity'),
        traits: z.array(z.string()).describe('3-5 defining traits or attributes'),
        aliases: z.array(z.string()).optional().describe('Alternative names or titles'),
      })).min(5).max(12).describe('The key entities that populate this world'),
      relationships: z.array(z.object({
        sourceName: z.string().describe('Name of the source entity (must match an entity name above)'),
        targetName: z.string().describe('Name of the target entity (must match an entity name above)'),
        type: z.string().describe('The nature of the relationship (e.g. "ally_of", "located_in", "created_by", "rules_over")'),
        description: z.string().describe('One sentence describing this relationship'),
        strength: z.number().describe('How strong this connection is (0-1)'),
      })).min(5).max(15).describe('Connections between the entities'),
      scenes: z.array(z.object({
        title: z.string().describe('A short evocative title for this scene'),
        content: z.string().describe('3-5 paragraphs of narrative prose for this scene'),
        participantNames: z.array(z.string()).describe('Names of entities involved (must match entity names)'),
        locationName: z.string().optional().describe('Name of the location entity where this scene takes place'),
      })).min(2).max(4).describe('Opening scenes that introduce this world'),
      themes: z.array(z.string()).min(2).max(5).describe('Major themes of this world'),
      tone: z.string().describe('The narrative tone (e.g. "dark and mysterious", "whimsical and lighthearted")'),
    });

    const worldGenPrompt = `You are a master worldbuilder. Create a rich, detailed world based on this creative prompt:

"${prompt.trim()}"

Generate a complete world blueprint with:
- 5-12 entities (characters, locations, organizations, objects, concepts, creatures) that form the backbone of this world
- 5-15 relationships between those entities that create a web of connections
- 2-4 opening scenes written as engaging narrative prose that introduce the world and its key elements
- Major themes and the overall narrative tone

Guidelines:
- Make entities diverse in type - include characters, locations, and at least one organization or concept
- Relationships should create interesting tensions, alliances, and mysteries
- Scenes should be vivid and immersive, written in third person
- Each scene should feature 2-3 entities as participants
- Entity names used in relationships and scenes MUST exactly match the entity names you define
- The world should feel alive with potential for stories to unfold`;

    const blueprint = await llmAdapter.generateStructuredOutput(
      worldGenPrompt,
      WorldBlueprintSchema,
      { temperature: 0.9, maxTokens: 16000, modelPreference: 'smart' }
    );

    console.log(`✅ World blueprint generated: ${blueprint.worldName} (${blueprint.entities.length} entities, ${blueprint.relationships.length} relationships, ${blueprint.scenes.length} scenes)`);

    // Transform blueprint into ProjectData
    const projectId = `project_${Date.now()}`;
    const worldName = name?.trim() || blueprint.worldName;
    const projectColor = color || '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    const normalizedStyleProfile = normalizeStyleProfile(styleProfile);

    // Generate entity IDs and build a name-to-ID lookup
    const entityIdMap = new Map<string, string>();
    const entities = blueprint.entities.map((e, i) => {
      const id = `entity_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 6)}`;
      entityIdMap.set(e.name.toLowerCase(), id);
      return {
        id,
        name: e.name,
        type: e.type,
        description: e.description,
        traits: e.traits || [],
        aliases: e.aliases || [],
        firstAppearance: 'World Generation',
        mentions: 1,
        significance: 0.7 + Math.random() * 0.3,
        commitHistory: [],
      };
    });

    // Resolve relationships using entity name lookup
    const relationships = blueprint.relationships
      .map((r, i) => {
        const sourceId = entityIdMap.get(r.sourceName.toLowerCase());
        const targetId = entityIdMap.get(r.targetName.toLowerCase());
        if (!sourceId || !targetId) return null;
        return {
          id: `rel_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 6)}`,
          sourceId,
          targetId,
          sourceName: r.sourceName,
          targetName: r.targetName,
          type: r.type,
          description: r.description,
          strength: Math.max(0, Math.min(1, r.strength)),
          evidence: ['World Generation'],
          commitHistory: [],
        };
      })
      .filter(Boolean);

    // Build scenes/interactions
    const interactions = blueprint.scenes.map((s, i) => {
      const participantIds = (s.participantNames || [])
        .map(name => entityIdMap.get(name.toLowerCase()))
        .filter(Boolean) as string[];
      const locationId = s.locationName ? entityIdMap.get(s.locationName.toLowerCase()) : undefined;
      return {
        id: `scene_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 6)}`,
        title: s.title,
        prose: s.content,
        content: s.content,
        summary: s.summary,
        participants: participantIds,
        participantIds,
        location: locationId || undefined,
        locationId: locationId || undefined,
        order: i,
        position: i,
        type: 'scene',
        commitHistory: [],
      };
    });

    // Create initial commit
    const commitId = `commit_${Date.now()}_genesis`;
    const commit = {
      id: commitId,
      message: `World generated: ${worldName}`,
      branch: 'main',
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
      entityCount: entities.length,
      relationshipCount: relationships.length,
      delta: {
        addedEntities: entities.map(e => ({ id: e.id, name: e.name, type: e.type, description: e.description })),
        modifiedEntities: [],
        addedRelationships: relationships.map((r: any) => ({ id: r.id, sourceName: r.sourceName, targetName: r.targetName, type: r.type })),
        addedScenes: interactions.map((scene: any) => ({
          id: scene.id,
          title: scene.title,
          summary: (scene.summary || scene.prose || scene.content || '').slice(0, 120),
        })),
        modifiedScenes: [],
      },
      stats: {
        entitiesAdded: entities.length,
        entitiesModified: 0,
        relationshipsAdded: relationships.length,
        scenesAdded: interactions.length,
        scenesModified: 0,
      },
      snapshot: {
        entities: JSON.parse(JSON.stringify(entities)),
        relationships: JSON.parse(JSON.stringify(relationships)),
        interactions: JSON.parse(JSON.stringify(interactions)),
        themes: blueprint.themes,
      },
    };

    // Mark all entities and scenes with the genesis commit
    for (const entity of entities) {
      entity.commitHistory = [commitId];
    }
    for (const scene of interactions) {
      scene.commitHistory = [commitId];
    }
    for (const rel of relationships) {
      if (rel) (rel as any).commitHistory = [commitId];
    }

    const projectData: ProjectData = {
      entities,
      relationships: relationships as any[],
      commits: [commit],
      branches: [
        {
          id: 'main',
          name: 'main',
          description: 'The canonical timeline',
          color: '#22c55e',
          isActive: true,
          isCanon: true,
          probability: 1.0,
          commitCount: 1,
          lastCommit: commitId,
          createdAt: new Date().toISOString(),
        } as any,
      ],
      interactions,
      documents: [],
      conversationHistory: {
        messages: [],
        worldContext: {
          themes: blueprint.themes,
          tone: blueprint.tone,
          influences: [],
        },
        currentFocus: [],
        userDecisions: [],
        lastUpdated: Date.now(),
      },
    };

    const storyGraph = applyStoryGraphDiffs(projectData);
    (commit as any).storyConsistency = {
      errors: storyGraph.consistency.errors,
      warnings: storyGraph.consistency.warnings,
      isConsistent: storyGraph.consistency.isConsistent,
    };
    if (commit.snapshot) {
      (commit.snapshot as any).interactions = JSON.parse(JSON.stringify(projectData.interactions || []));
      (commit.snapshot as any).storyGraph = JSON.parse(JSON.stringify(storyGraph));
    }

    // Create the project entry
    const newProject: Project = {
      id: projectId,
      name: worldName,
      description: blueprint.worldDescription,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isActive: false,
      stats: {
        entities: entities.length,
        relationships: relationships.length,
        commits: 1,
        branches: 1,
      },
      color: projectColor,
      styleProfile: normalizedStyleProfile || DEFAULT_PROJECT_STYLE_PROFILE,
    };

    projects.push(newProject);

    // Switch to the new project
    projects = projects.map(p => ({
      ...p,
      isActive: p.id === projectId,
    }));

    saveProjects(projects);
    saveProjectData(projectId, projectData);
    for (const entity of entities) {
      if (entity?.id) {
        queueAutoEntityVisualGeneration(projectId, entity.id, 'world_generation');
      }
    }

    console.log(`🌍 World "${worldName}" created with ID ${projectId}`);

    res.status(201).json({
      success: true,
      project: newProject,
      stats: {
        entities: entities.length,
        relationships: relationships.length,
        scenes: interactions.length,
        themes: blueprint.themes,
        tone: blueprint.tone,
      },
    });
  } catch (error: any) {
    console.error('World generation error:', error);
    res.status(500).json({
      error: 'Failed to generate world',
      message: error.message,
    });
  }
});

// ============================================================================
// NARRATIVE EXPLORATION (Oracle) ENDPOINTS
// ============================================================================

interface ExplorationContext {
  currentNode: string | null;
  history: string[];
  knownEntities: Array<{ id: string; name: string; type: string }>;
}

/**
 * Start a new exploration session
 * POST /api/explore/start
 * Body: { seed?: string }
 * Returns: { prose, entities, relationships, choices, currentNode }
 */
app.post('/api/explore/start', async (req, res) => {
  try {
    const { seed } = req.body;

    if (!llmAdapter) {
      return res.status(503).json({
        error: 'Exploration requires LLM',
        message: 'No GEMINI_API_KEY configured. Set the environment variable to enable exploration.',
      });
    }

    const prompt = `You are a creative collaborator helping explore and build out a narrative world. ${seed ? `The starting concept is: "${seed}"` : 'Start with something interesting.'}

Your job is to:
1. Generate 2-3 interesting entities (characters, locations, organizations, objects, concepts) that fit the concept
2. Suggest 1-2 additional things that could be explored (potential connections, unanswered questions)
3. Match the tone and genre implied by the seed - be playful if it's playful, serious if it's serious, weird if it's weird
4. Be a creative partner, not a mysterious narrator

Respond in JSON:
{
  "perception": "A brief, friendly observation about what we're exploring (1 sentence, match the tone)",
  "prose": "A vivid description of the world/situation (2-3 paragraphs, match the genre/tone of the seed)",
  "entities": [
    { "id": "snake_case_id", "name": "Display Name", "type": "character|location|organization|object|concept|technology|event", "description": "Brief description" }
  ],
  "potentialEntities": [
    { "id": "potential_id", "type": "character", "hint": "something interesting to explore next", "connectedTo": "id_of_main_entity_it_relates_to" }
  ],
  "relationships": [
    { "source": "entity_id_1", "target": "entity_id_2", "type": "relationship_type" }
  ],
  "potentialRelationships": [
    { "source": "main_entity_id", "target": "potential_id", "type": "relationship_type", "hint": "why they might be connected" }
  ],
  "currentNode": "the_id_of_the_main_starting_point"
}

Be creative and generative. Follow the energy of the seed concept.`;

    const response = await llmAdapter.generateText(prompt, {
      temperature: 0.8,
      maxTokens: 2000,
      modelPreference: 'fast',
    });

    // Parse the JSON response
    let result;
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      result = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse exploration response:', parseError);
      console.error('Raw response:', response);
      return res.status(500).json({
        error: 'Failed to parse narrative response',
        raw: response,
      });
    }

    // Ensure IDs are properly formatted
    result.entities = (result.entities || []).map((e: any) => ({
      ...e,
      id: e.id || e.name.toLowerCase().replace(/\s+/g, '_'),
    }));

    res.json(result);
  } catch (error: any) {
    console.error('Exploration start error:', error);
    res.status(500).json({ error: error.message || 'Failed to start exploration' });
  }
});

/**
 * Take an action in the exploration
 * POST /api/explore/action
 * Body: { action: string, context: ExplorationContext }
 * Returns: { prose, entities, relationships, choices, currentNode }
 */
app.post('/api/explore/action', async (req, res) => {
  try {
    const { action, context } = req.body as { action: string; context: ExplorationContext };

    if (!action) {
      return res.status(400).json({ error: 'Action is required' });
    }

    if (!llmAdapter) {
      return res.status(503).json({
        error: 'Exploration requires LLM',
        message: 'No GEMINI_API_KEY configured.',
      });
    }

    // Build context string from known entities
    const knownEntitiesStr = context.knownEntities?.length
      ? context.knownEntities
          .map((e) => `- ${e.name} (${e.type}): ${e.id}`)
          .join('\n')
      : 'None yet discovered';

    const historyStr = context.history?.length
      ? context.history.slice(-5).join(' → ')
      : 'Just beginning';

    const prompt = `You are a narrative oracle exploring the latent space of story. The explorer has taken an action, and you must reveal what they discover.

CURRENT EXPLORATION STATE:
- Current Location/Focus: ${context.currentNode || 'Unanchored'}
- Recent Path: ${historyStr}
- Known Entities:
${knownEntitiesStr}

EXPLORER'S ACTION: "${action}"

Generate the narrative response to this action. You should:
1. Reveal new details, entities, or connections based on what they're exploring
2. Maintain consistency with already-discovered entities
3. Create new mysteries and threads to follow
4. Offer 2-4 natural next choices for exploration

IMPORTANT:
- Only introduce entities that make sense given the action
- New entities should connect to existing ones when possible
- The prose should feel like discovery, not exposition
- Keep building a coherent world

Respond in this exact JSON format:
{
  "prose": "The narrative response (2-3 paragraphs of evocative, literary prose)",
  "entities": [
    { "id": "snake_case_id", "name": "Display Name", "type": "character|location|organization|object|concept|technology|event", "description": "Brief description" }
  ],
  "relationships": [
    { "source": "existing_or_new_entity_id", "target": "existing_or_new_entity_id", "type": "relationship_type" }
  ],
  "choices": ["Natural exploration option 1", "Option 2", "Option 3"],
  "currentNode": "id_of_the_current_focus_entity_or_location"
}

The prose should read like literary fiction - immersive, sensory, mysterious. Each exploration should feel like uncovering something that was always there.`;

    const response = await llmAdapter.generateText(prompt, {
      temperature: 0.8,
      maxTokens: 2000,
      modelPreference: 'fast',
    });

    // Parse the JSON response
    let result;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      result = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse exploration response:', parseError);
      // Return a fallback narrative
      result = {
        prose: "The threads of narrative shimmer and shift, resisting clear form. Perhaps try a different approach.",
        entities: [],
        relationships: [],
        choices: ["Look more carefully", "Step back", "Try something else"],
        currentNode: context.currentNode,
      };
    }

    // Ensure IDs are properly formatted
    result.entities = (result.entities || []).map((e: any) => ({
      ...e,
      id: e.id || e.name.toLowerCase().replace(/\s+/g, '_'),
    }));

    // Filter out entities that already exist (by ID)
    const existingIds = new Set(context.knownEntities?.map((e) => e.id) || []);
    result.entities = result.entities.filter((e: any) => !existingIds.has(e.id));

    res.json(result);
  } catch (error: any) {
    console.error('Exploration action error:', error);
    res.status(500).json({ error: error.message || 'Failed to process exploration' });
  }
});

// ============================================================================
// FOG EXPLORATION ENDPOINTS (v2 - Attend/Sense/Crystallize)
// ============================================================================

/**
 * Attend to an entity - resolve it from fog to attending state
 * POST /api/explore/attend
 */
app.post('/api/explore/attend', async (req, res) => {
  try {
    const { entityId, context } = req.body;

    if (!llmAdapter) {
      return res.status(503).json({ error: 'LLM required for exploration' });
    }

    const knownContext = context?.knownEntities?.map((e: any) => `- ${e.name} (${e.type})`).join('\n') || 'Nothing yet known';

    const prompt = `You are a creative collaborator helping build out a narrative world. The explorer wants to develop an undefined element.

EXISTING WORLD ELEMENTS:
${knownContext}

The explorer wants to flesh out something new (id: ${entityId}). Generate something interesting that fits with what already exists.

Be creative! Match the tone and genre of the existing elements. If the world is whimsical, be whimsical. If it's dark, be dark. If it's absurd, be absurd.

Respond in JSON:
{
  "name": "A fitting name for this entity",
  "type": "character|location|organization|object|concept|technology|event",
  "description": "2-3 sentences describing this entity - make it interesting and specific",
  "perception": "A brief creative observation (1 sentence, conversational)",
  "potentialConnections": [
    { "hint": "an interesting thread to explore", "direction": "related" },
    { "hint": "another possibility", "direction": "connected" }
  ],
  "sensedEntities": [
    { "id": "new_entity_id", "type": "character", "hint": "something this connects to" }
  ],
  "sensedConnections": [
    { "source": "${entityId}", "target": "new_entity_id", "type": "relationship_type" }
  ]
}

Be generative and interesting. Build on what exists.`;

    const response = await llmAdapter.generateText(prompt, { temperature: 0.8, maxTokens: 1500, modelPreference: 'fast' });

    let result;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON');
      result = JSON.parse(jsonMatch[0]);
    } catch {
      result = {
        name: "Something Unclear",
        type: "concept",
        description: "The fog swirls but resists full clarity.",
        perception: "It's there, but not ready to be seen.",
        potentialConnections: [],
        sensedEntities: [],
        sensedConnections: []
      };
    }

    // Generate IDs for sensed entities
    result.sensedEntities = (result.sensedEntities || []).map((e: any) => ({
      ...e,
      id: e.id || `fog_${Math.random().toString(36).slice(2, 8)}`
    }));

    res.json(result);
  } catch (error: any) {
    console.error('Attend error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Sense around a focused entity - discover potential connections
 * POST /api/explore/sense
 */
app.post('/api/explore/sense', async (req, res) => {
  try {
    const { focusId, context } = req.body;

    if (!llmAdapter) {
      return res.status(503).json({ error: 'LLM required for exploration' });
    }

    const focusEntity = context?.knownEntities?.find((e: any) => e.id === focusId);
    const knownContext = context?.knownEntities?.map((e: any) => `- ${e.name} (${e.type})`).join('\n') || 'Nothing yet known';

    const prompt = `You are a creative collaborator. The explorer is at "${focusEntity?.name || focusId}" and wants to see what else might be connected or interesting to explore.

CURRENT FOCUS: ${focusEntity?.name || focusId} (${focusEntity?.type || 'unknown'})

EXISTING ELEMENTS:
${knownContext}

Suggest interesting things that could be connected to the current focus. What related characters, places, objects, or concepts would make this world richer? What questions does this element raise?

Match the tone and genre of what exists.

Respond in JSON:
{
  "perception": "A creative observation about possibilities (1-2 sentences, conversational)",
  "sensedEntities": [
    { "id": "entity_1", "type": "character|location|etc", "hint": "brief description of what this could be", "relationshipHint": "how it connects" }
  ],
  "questions": ["Interesting question 1?", "Interesting question 2?"]
}

Suggest 2-4 interesting possibilities that build on what exists.`;

    const response = await llmAdapter.generateText(prompt, { temperature: 0.85, maxTokens: 1200, modelPreference: 'fast' });

    let result;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON');
      result = JSON.parse(jsonMatch[0]);
    } catch {
      result = {
        perception: "The fog is thick here. Difficult to sense clearly.",
        sensedEntities: [],
        questions: ["What lies deeper?"]
      };
    }

    // Generate IDs
    result.sensedEntities = (result.sensedEntities || []).map((e: any) => ({
      ...e,
      id: e.id || `fog_${Math.random().toString(36).slice(2, 8)}`
    }));

    res.json(result);
  } catch (error: any) {
    console.error('Sense error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Generate a flexible artifact from entity/world context
 * POST /api/explore/artifact
 * Body: { entityId?, entities?, artifactType: string, customPrompt?: string, context }
 * Supports: document, report, interview, podcast, script, letter, journal, news, manifest, custom
 */
app.post('/api/explore/artifact', async (req, res) => {
  try {
    const { entityId, entities, artifactType, customPrompt, context } = req.body;

    if (!llmAdapter) {
      return res.status(503).json({ error: 'LLM required for artifact generation' });
    }

    // Build context from provided entities
    const entityContext = entities?.length
      ? entities.map((e: any) => `- ${e.name} (${e.type}): ${e.description || 'No description'}`).join('\n')
      : context?.knownEntities?.map((e: any) => `- ${e.name} (${e.type})`).join('\n') || 'No entities provided';

    const focusEntity = entityId
      ? (entities?.find((e: any) => e.id === entityId) || context?.knownEntities?.find((e: any) => e.id === entityId))
      : null;

    // Artifact type templates
    const artifactTemplates: Record<string, { name: string; instruction: string; format: string }> = {
      document: {
        name: 'Lore Document',
        instruction: 'Create an in-world document - could be a historical record, encyclopedia entry, or official file.',
        format: 'A formal document with headers and sections'
      },
      report: {
        name: 'Field Report',
        instruction: 'Write a field report, investigation summary, or incident documentation as if written by someone in-world.',
        format: 'Report format with sections: SUBJECT, SUMMARY, DETAILS, RECOMMENDATIONS'
      },
      interview: {
        name: 'Interview Transcript',
        instruction: 'Create an interview transcript between an interviewer and subject(s) from this world.',
        format: 'Q&A format with speaker labels, natural dialogue, interruptions allowed'
      },
      podcast: {
        name: 'Podcast Transcript',
        instruction: 'Write a podcast episode transcript discussing or featuring elements from this world. Could be true crime, documentary, discussion, or storytelling format.',
        format: 'Podcast format with host/guest labels, casual tone, timestamps optional'
      },
      script: {
        name: 'Script/Screenplay',
        instruction: 'Write a dramatic script or screenplay scene featuring characters and locations from this world.',
        format: 'Screenplay format with scene headings, action lines, and dialogue'
      },
      letter: {
        name: 'Personal Letter',
        instruction: 'Write a letter, note, or personal correspondence from one character to another or to an unknown recipient.',
        format: 'Letter format with greeting, body, closing - personal and revealing'
      },
      journal: {
        name: 'Journal Entry',
        instruction: 'Write journal or diary entries from a character\'s perspective, revealing their inner thoughts.',
        format: 'Dated entries, first person, intimate and honest'
      },
      news: {
        name: 'News Article',
        instruction: 'Write a news article, press release, or media report about events in this world.',
        format: 'Journalistic format with headline, byline, and inverted pyramid structure'
      },
      manifest: {
        name: 'Manifesto/Declaration',
        instruction: 'Write a manifesto, declaration, creed, or statement of purpose from an organization or individual.',
        format: 'Declarative, passionate, possibly numbered principles or tenets'
      },
      scp: {
        name: 'Anomaly Report (SCP-style)',
        instruction: 'Write a clinical containment/documentation report for an anomalous entity, object, or phenomenon in the style of SCP Foundation entries.',
        format: 'Item #, Object Class, Containment Procedures, Description, Addenda'
      },
      mythology: {
        name: 'Myth/Legend',
        instruction: 'Write a myth, legend, or folk tale that exists within this world - how do the people explain things?',
        format: 'Narrative storytelling format, could be oral tradition transcribed'
      },
      academic: {
        name: 'Academic Paper',
        instruction: 'Write an academic paper, research abstract, or scholarly analysis about something in this world.',
        format: 'Academic format with abstract, sections, possibly citations'
      },
      custom: {
        name: 'Custom Artifact',
        instruction: customPrompt || 'Create something interesting.',
        format: 'Whatever format best serves the content'
      }
    };

    const template = artifactTemplates[artifactType] || artifactTemplates.custom;

    const prompt = `You are a creative artifact generator for a narrative world-building system. Generate an in-world artifact based on the context provided.

ARTIFACT TYPE: ${template.name}
INSTRUCTION: ${template.instruction}
FORMAT: ${template.format}

${focusEntity ? `PRIMARY FOCUS:
- Name: ${focusEntity.name}
- Type: ${focusEntity.type}
- Description: ${focusEntity.description || 'Unknown'}
` : ''}

WORLD CONTEXT:
${entityContext}

${customPrompt ? `ADDITIONAL DIRECTION: ${customPrompt}` : ''}

Generate the artifact now. Make it feel authentic to the world - match the tone, genre, and style implied by the context. Be creative, specific, and immersive. The artifact should feel like something that actually exists within this world.

Respond in JSON:
{
  "title": "The artifact title",
  "artifactType": "${artifactType}",
  "content": "The full artifact content (can be long, use \\n for line breaks)",
  "metadata": {
    "author": "In-world author if applicable",
    "date": "In-world date if applicable",
    "classification": "Any relevant classification",
    "notes": "Any meta notes about the artifact"
  },
  "relatedEntities": ["entity_ids that are referenced or relevant"],
  "newDiscoveries": [
    { "name": "Something new revealed in this artifact", "type": "character|location|etc", "hint": "brief description" }
  ]
}`;

    console.log(`📜 Generating ${template.name} artifact...`);
    const response = await llmAdapter.generateText(prompt, {
      temperature: 0.8,
      maxTokens: 4000,
      modelPreference: 'fast'
    });

    let result;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON');
      result = JSON.parse(jsonMatch[0]);
    } catch {
      // If JSON parsing fails, treat the whole response as content
      result = {
        title: `${template.name}: ${focusEntity?.name || 'Unknown'}`,
        artifactType,
        content: response,
        metadata: {},
        relatedEntities: [],
        newDiscoveries: []
      };
    }

    console.log(`✅ Generated artifact: ${result.title}`);

    res.json({
      success: true,
      ...result
    });

  } catch (error: any) {
    console.error('Artifact generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Crystallize an entity - generate artifacts (portrait, document, etc.)
 * POST /api/explore/crystallize
 */
app.post('/api/explore/crystallize', async (req, res) => {
  try {
    const { entityId, entity, type } = req.body;

    if (!llmAdapter) {
      return res.status(503).json({ error: 'LLM required for crystallization' });
    }

    console.log(`🔮 Crystallizing ${entity.name} as ${type}...`);

    if (type === 'portrait') {
      // Generate a portrait prompt and placeholder
      // In production, this would call the actual image generator
      const prompt = `Describe a striking visual portrait of: ${entity.name} (${entity.type})
Description: ${entity.description || 'Unknown'}

Respond with JSON:
{
  "visualDescription": "Detailed visual description for image generation",
  "imagePrompt": "Concise prompt for AI image generation",
  "perception": "What the AI companion says as the image crystallizes"
}`;

      const response = await llmAdapter.generateText(prompt, { temperature: 0.7, maxTokens: 800, modelPreference: 'fast' });

      let result;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON');
        result = JSON.parse(jsonMatch[0]);
      } catch {
        result = {
          visualDescription: "A mysterious figure emerges from the fog.",
          imagePrompt: `Portrait of ${entity.name}, ${entity.type}, mysterious, atmospheric`,
          perception: "The form solidifies, becoming real."
        };
      }

      // TODO: Actually generate image using EntityPortraitGenerator
      // For now, return a placeholder
      res.json({
        success: true,
        type: 'portrait',
        imageUrl: null, // Would be actual URL after generation
        visualDescription: result.visualDescription,
        imagePrompt: result.imagePrompt,
        perception: result.perception,
        description: entity.description
      });

    } else if (type === 'document') {
      // Generate a document/lore entry
      const prompt = `Create a detailed lore document for: ${entity.name} (${entity.type})
Known description: ${entity.description || 'Unknown'}

Write a rich, detailed document that could exist in this world. Include:
- Full background/history
- Key characteristics or features
- Connections to the broader world
- Mysteries or unanswered questions

Respond with JSON:
{
  "document": "The full document text (3-5 paragraphs)",
  "title": "Document title",
  "documentType": "dossier|report|entry|record|manuscript",
  "perception": "What the AI companion says as the document crystallizes"
}`;

      const response = await llmAdapter.generateText(prompt, { temperature: 0.75, maxTokens: 2000, modelPreference: 'fast' });

      let result;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON');
        result = JSON.parse(jsonMatch[0]);
      } catch {
        result = {
          document: `# ${entity.name}\n\n${entity.description || 'Details remain shrouded in mystery.'}`,
          title: entity.name,
          documentType: 'entry',
          perception: "Knowledge crystallizes into permanence."
        };
      }

      res.json({
        success: true,
        type: 'document',
        document: result.document,
        title: result.title,
        documentType: result.documentType,
        perception: result.perception,
        description: result.document.slice(0, 200)
      });

    } else {
      // Full crystallization - both portrait and document
      res.json({
        success: true,
        type: 'full',
        perception: "The entity becomes fully real.",
        description: entity.description
      });
    }

  } catch (error: any) {
    console.error('Crystallize error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// NARRATIVE WORLD-BUILDING CHAT API
// ============================================================================

// Zod schema for structured chat response - now narrative-aware
/**
 * Chat response schema. Conversational metadata only.
 *
 * Graph mutations (entities, relationships, scenes, frames, images) are NOT
 * fields here — they go through tools (create_entity, update_entity,
 * create_relationship, generate_portrait, edit_image, update_scene, etc.).
 * Earlier versions of this schema had `entities[]`, `relationships[]`,
 * `scenes[]`, `sceneEdits[]` arrays for proposal-style mutations; those have
 * been removed because they gave the model an escape hatch — when both tools
 * AND a parallel mutation schema were available, Gemini frequently chose to
 * write to the schema (which silently produced "proposals" in the UI) instead
 * of calling the actual tool. Tools-only is unambiguous.
 *
 * What stays:
 *   - response:        the AI's prose to the user
 *   - focusedEntities: what we're talking about (informational)
 *   - operationType:   elaboration vs event (semantic flag for the UI)
 *   - eventDescription, suggestCommit, canonNotes: commit-suggestion metadata
 *   - themes, suggestedDirections: surfaced themes / threads
 *   - scratchpadWrites: opt-in non-canon notes (the model rarely uses this
 *                       path; the write_scratchpad_note tool is preferred)
 */
const NarrativeChatResponseSchema = z.object({
  response: z.string().describe('Your response. Talk naturally as a creative partner — no formalities, no summaries of what you did.'),

  scratchpadWrites: z.array(z.object({
    documentId: z.string().optional().describe('Existing doc ID to update'),
    title: z.string().optional().describe('Doc title (required for new docs)'),
    content: z.string().describe('Content to write'),
    category: z.enum(['world_bible', 'story_arc', 'character_notes', 'reference', 'other']).optional(),
    mode: z.enum(['append', 'replace', 'create']).optional(),
    pin: z.boolean().optional().describe('Pin into context'),
  })).optional().describe('Non-canon scratchpad notes. Prefer the write_scratchpad_note tool; this field is a fallback.'),

  focusedEntities: z.array(z.string()).describe('Which entities (1-5 names) are we talking about right now?'),

  operationType: z.enum(['elaboration', 'event']).describe(
    'elaboration = exploring/revealing what already exists. event = something happens that changes the world.'
  ),

  eventDescription: z.string().optional().describe(
    'If event: one-sentence description of what happened (e.g., "Marcus discovers the secret lab")'
  ),

  suggestCommit: z.boolean().describe('True if a world-changing event occurred that should be committed.'),

  canonNotes: z.string().optional().describe('Flag any continuity concerns with established canon.'),

  themes: z.array(z.string()).optional().describe('Themes touched on (if any).'),

  suggestedDirections: z.array(z.string()).optional().describe('Interesting threads to explore next (if any naturally come to mind).'),
});

type NarrativeChatResponse = z.infer<typeof NarrativeChatResponseSchema>;

interface NarrativeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  messageId?: string;
  extractedEntities?: any[];
  extractedRelationships?: any[];
  focus?: string[]; // Entity names in focus during this message
  operationType?: 'elaboration' | 'event';
  proposalIds?: string[];
}

// Proposed change from AI that needs user confirmation
interface ProposedChange {
  id: string;
  type: 'add_entity' | 'update_entity' | 'add_relationship' | 'add_scene' | 'update_scene';
  entity?: any;
  relationship?: any;
  scene?: any; // For scene proposals
  existingEntity?: any; // For updates, the current state
  existingScene?: any; // For scene updates, the current state
  status: 'pending' | 'accepted' | 'rejected';
  messageId?: string; // Which message proposed this
}

// Track user decisions about proposed changes
interface UserDecision {
  changeId: string;
  decision: 'accepted' | 'rejected';
  entityName?: string;
  reason?: string; // Optional user note
  timestamp: number;
}

interface WorldSession {
  projectId: string;
  currentBranch: string;
  messages: NarrativeMessage[];
  worldContext: {
    themes: string[];
    tone: string;
    influences: string[];
  };
  currentFocus: string[]; // Entity names currently in focus (for grounding context)
  focusedEntityId?: string; // For entity detail view - what entity are we exploring?
  focusedSceneId?: string; // For scene detail view - what scene are we exploring?
  pinnedEntityIds?: string[]; // UI "working memory" pins
  canonEntityIds: Set<string>; // Entity IDs that have been committed (canon)
  uncommittedChanges: boolean;
  // Track pending changes for delta commits
  pendingChanges: {
    addedEntityIds: Set<string>;
    modifiedEntityIds: Set<string>;
    addedRelationshipIds: Set<string>;
    addedSceneIds: Set<string>;
    modifiedSceneIds: Set<string>;
  };
  // Proposed changes awaiting user confirmation
  pendingProposals: ProposedChange[];
  // Recently auto-accepted proposals (for undo)
  recentAcceptedProposals?: ProposedChange[];
  // History of user decisions (so AI knows what was accepted/rejected)
  userDecisions: UserDecision[];
}

// Store active sessions in memory (in production, this would be Redis or similar)
const worldSessions = new Map<string, WorldSession>();

// Get or create a world session
function getWorldSession(projectId: string): WorldSession {
  if (!worldSessions.has(projectId)) {
    const projectData = loadProjectData(projectId);
    const activeBranch = projectData.branches.find(b => b.isActive)?.name || 'main';

    // Determine which entities are canon (have been in a commit)
    const canonEntityIds = new Set<string>();
    for (const commit of projectData.commits) {
      if (commit.snapshot?.entities) {
        for (const entity of commit.snapshot.entities) {
          canonEntityIds.add(entity.id);
        }
      }
    }

    // Restore conversation history if it exists
    const savedHistory = projectData.conversationHistory;

    worldSessions.set(projectId, {
      projectId,
      currentBranch: activeBranch,
      messages: savedHistory?.messages || [],
      worldContext: savedHistory?.worldContext || {
        themes: [],
        tone: 'mysterious',
        influences: [],
      },
      currentFocus: savedHistory?.currentFocus || [],
      focusedEntityId: undefined,
      focusedSceneId: undefined,
      pinnedEntityIds: [],
      canonEntityIds,
      uncommittedChanges: false,
      pendingChanges: {
        addedEntityIds: new Set(),
        modifiedEntityIds: new Set(),
        addedRelationshipIds: new Set(),
        addedSceneIds: new Set(),
        modifiedSceneIds: new Set(),
      },
      pendingProposals: [],
      recentAcceptedProposals: [],
      userDecisions: savedHistory?.userDecisions || [],
    });

    if (savedHistory) {
      console.log(`📜 Restored conversation history for project ${projectId}: ${savedHistory.messages.length} messages`);
    }
  }
  return worldSessions.get(projectId)!;
}

// Save conversation history to project data
function saveConversationHistory(projectId: string, session: WorldSession): void {
  const projectData = loadProjectData(projectId);
  projectData.conversationHistory = {
    messages: session.messages,
    worldContext: session.worldContext,
    currentFocus: session.currentFocus,
    userDecisions: session.userDecisions,
    lastUpdated: Date.now(),
  };
  saveProjectData(projectId, projectData);
}

const LOCATION_ENTITY_TYPES = new Set(['location', 'place', 'setting']);
const AUTO_VISUAL_ENTITY_TYPES = new Set([
  'character',
  'person',
  'agent',
  'npc',
  'creature',
  'location',
  'place',
  'setting',
  'object',
  'item',
  'artifact',
  'technology',
  'organization',
  'faction',
  'company',
  'group',
]);
const SIGNIFICANT_OBJECT_ENTITY_TYPES = new Set([
  'object',
  'item',
  'artifact',
  'technology',
]);
const HUMAN_REFERENCE_ENTITY_TYPES = new Set([
  'character',
  'person',
  'agent',
  'npc',
  'creature',
]);
const SCENE_GROUNDED_PARTICIPANT_ENTITY_TYPES = new Set([
  'character',
  'person',
  'agent',
  'npc',
  'creature',
  'organization',
  'faction',
  'company',
  'group',
  'object',
  'item',
  'artifact',
  'technology',
]);
const MAX_SCENE_CHARACTER_REFS_PRO = 5;
const MAX_SCENE_CHARACTER_REFS_FLASH = 1;
const MAX_SCENE_OBJECT_REFS_PRO = 6;
const MAX_SCENE_OBJECT_REFS_FLASH = 1;
const OBJECT_REFERENCE_TYPE_PRIORITY: Record<string, number> = {
  artifact: 0,
  technology: 1,
  object: 2,
  item: 3,
  concept: 4,
  relic: 5,
};

interface VisualInvalidationSummary {
  sceneIds: string[];
  frameIds: string[];
  sceneCount: number;
  frameCount: number;
  reason: string;
}

const isLocationEntityType = (type: string | undefined): boolean => {
  if (!type) return false;
  return LOCATION_ENTITY_TYPES.has(type.toLowerCase());
};

const isHumanReferenceEntityType = (type: string | undefined): boolean => {
  if (!type) return false;
  return HUMAN_REFERENCE_ENTITY_TYPES.has(type.toLowerCase());
};

const getObjectReferencePriority = (entity: any): number => {
  const type = typeof entity?.type === 'string' ? entity.type.toLowerCase() : '';
  const typePriority = OBJECT_REFERENCE_TYPE_PRIORITY[type] ?? 20;
  const significanceBoost = SIGNIFICANT_OBJECT_ENTITY_TYPES.has(type) ? -10 : 0;
  return typePriority + significanceBoost;
};

const shouldAutoGenerateEntityVisual = (entity: any): boolean => {
  const type = typeof entity?.type === 'string' ? entity.type.toLowerCase() : '';
  return AUTO_VISUAL_ENTITY_TYPES.has(type);
};

const normalizeComparableImageUrl = (value?: string): string => {
  if (!value || typeof value !== 'string') return '';
  return value.trim().replace(/^https?:\/\/[^/]+/i, '');
};

const compressPromptText = (value: string | undefined, maxChars: number): string => {
  if (!value || typeof value !== 'string') return '';
  if (maxChars <= 0) return '';
  const normalized = value
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (normalized.length <= maxChars) return normalized;
  const sliced = normalized.slice(0, maxChars);
  const sentenceBreak = Math.max(sliced.lastIndexOf('. '), sliced.lastIndexOf('\n'));
  const cutoff = sentenceBreak > maxChars * 0.5 ? sentenceBreak + 1 : maxChars;
  return `${sliced.slice(0, cutoff).trim()}…`;
};

const APPEARANCE_STALENESS_PATTERN = /\b(wear(?:ing|s)?|dressed|wardrobe|outfit|costume|coat|lab coat|jacket|blazer|suit|tie|shirt|trousers|pants|uniform|hair|hairstyle|hairline|beard|mustache|moustache|stubble|clean-shaven|glasses|spectacles|face|facial|jawline|cheekbones|aged|young|middle-aged|wrinkled|scar|blond(?:e)?|brunette|redhead|silver-haired|gray-haired|grey-haired|graying|greying|bald|balding|crew[- ]cut|ponytail|bun|braids|dreadlocks|eye(?:s|d)|blue-eyed|brown-eyed|green-eyed|complexion|dark-skinned|pale|freckled|olive-skinned|tattoo|piercing|lean|muscular|stocky|slender|broad-shouldered|heavyset|lanky|petite|tall|short-statured|gaunt|chiseled|rugged|weathered|grizzled|youthful|elderly|forties|fifties|sixties|thirties|twenties|portly|wiry)\b/i;

const sanitizeBlockingDirectiveText = (value?: string): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return APPEARANCE_STALENESS_PATTERN.test(normalized) ? null : normalized;
};

/**
 * Strip appearance-describing clauses from narrative text (visual_beat, description, scene prose)
 * to prevent text descriptions from overriding character reference images during image generation.
 *
 * Unlike sanitizeBlockingDirectiveText (which nulls the entire string on any match),
 * this function surgically removes only the appearance-laden clauses/sentences while
 * preserving action, camera, atmosphere, and blocking content.
 *
 * Uses a targeted pattern that avoids stripping legitimate camera directions
 * (e.g., "close-up on his face" is kept, but "his grizzled, weathered face" is stripped).
 */
const DESCRIPTIVE_APPEARANCE_PATTERN = /\b(wear(?:ing|s)|dressed(?: in)?|wardrobe|outfit|costume|(?:lab )?coat|jacket|blazer|suit(?:ed)?|tie|shirt|trousers|pants|uniform|hairstyle|hairline|beard(?:ed)?|mustache|moustache|stubble|clean-shaven|glasses|spectacles|jawline|cheekbones|wrinkled|scarred?|blond(?:e)?|brunette|redhead|silver-haired|gray-haired|grey-haired|graying|greying|bald(?:ing)?|crew[- ]cut|ponytail|bun|braids|dreadlocks|blue-eyed|brown-eyed|green-eyed|complexion|dark-skinned|pale|freckled|olive-skinned|tattoo(?:ed)?|piercing(?:ed)?|lean|muscular|stocky|slender|broad-shouldered|heavyset|lanky|petite|gaunt|chiseled|rugged|weathered|grizzled|youthful|elderly|portly|wiry|middle-aged|young(?:er)?|old(?:er)?|teenage(?:d|r)?|adolescent|aging|ageing|boyish|girlish|in (?:his|her|their) (?:twenties|thirties|forties|fifties|sixties))\b/i;

const stripAppearanceFromNarrative = (text: string): string => {
  if (!text || typeof text !== 'string') return '';
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  // Split into sentences first
  const sentences = normalized.split(/(?<=[.!?])\s+/);
  const result: string[] = [];

  for (const sentence of sentences) {
    if (!DESCRIPTIVE_APPEARANCE_PATTERN.test(sentence)) {
      // No appearance words — keep entire sentence
      result.push(sentence);
      continue;
    }

    // Sentence contains appearance words — try clause-level stripping
    // Split on commas, semicolons, em-dashes
    const clauseParts = sentence.split(/\s*([,;]|—|–)\s*/);
    const keptParts: string[] = [];

    for (let i = 0; i < clauseParts.length; i++) {
      const part = clauseParts[i];
      // Skip separators
      if (/^[,;—–]$/.test(part)) {
        keptParts.push(part);
        continue;
      }
      // Keep clauses without appearance descriptors
      if (!DESCRIPTIVE_APPEARANCE_PATTERN.test(part)) {
        keptParts.push(part);
      } else {
        // Remove the clause and its adjacent separator
        if (keptParts.length > 0 && /^[,;—–]$/.test(keptParts[keptParts.length - 1])) {
          keptParts.pop();
        }
      }
    }

    const cleaned = keptParts.join(' ').replace(/\s+/g, ' ').trim();
    // Only keep if there's meaningful content left (not just a trailing period or empty)
    if (cleaned && cleaned.length > 3) {
      result.push(cleaned);
    }
  }

  return result.join(' ').replace(/\s+/g, ' ').trim();
};

const GENERATED_IMAGES_DIR = path.join(process.cwd(), '.narrative-data', 'generated-images');
const GENERATED_PORTRAITS_DIR = path.join(GENERATED_IMAGES_DIR, 'portraits');
const UPLOADED_ASSETS_DIR = path.join(process.cwd(), '.narrative-data', 'uploaded-assets');
if (!fs.existsSync(UPLOADED_ASSETS_DIR)) fs.mkdirSync(UPLOADED_ASSETS_DIR, { recursive: true });

interface ResolvedReferenceAsset {
  data: Buffer;
  mimeType: string;
  source: string;
  referenceUrl?: string;
  filePath?: string;
}

const getMimeTypeFromFilename = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
};

const toImageDataFromUrl = (rawUrl?: string): ResolvedReferenceAsset | null => {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const dataUrlMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    try {
      const [, mimeType, payload] = dataUrlMatch;
      return {
        data: Buffer.from(payload, 'base64'),
        mimeType: mimeType.toLowerCase(),
        source: 'data-url',
        referenceUrl: rawUrl,
      };
    } catch (error) {
      console.warn(`⚠️ Failed to decode image data URL: ${(error as Error).message}`);
      return null;
    }
  }

  const normalized = normalizeComparableImageUrl(trimmed)
    .split('?')[0]
    .split('#')[0];
  if (!normalized) return null;

  const portraitPrefix = '/api/narrative/visual/portraits/';
  const imagePrefix = '/api/narrative/visual/images/';
  const assetPrefix = '/api/narrative/assets/files/';
  let filePath: string | null = null;

  if (normalized.startsWith(portraitPrefix)) {
    const filename = path.basename(decodeURIComponent(normalized.slice(portraitPrefix.length)));
    filePath = path.join(GENERATED_PORTRAITS_DIR, filename);
  } else if (normalized.startsWith(imagePrefix)) {
    const filename = path.basename(decodeURIComponent(normalized.slice(imagePrefix.length)));
    filePath = path.join(GENERATED_IMAGES_DIR, filename);
  } else if (normalized.startsWith(assetPrefix)) {
    const filename = path.basename(decodeURIComponent(normalized.slice(assetPrefix.length)));
    filePath = path.join(UPLOADED_ASSETS_DIR, filename);
  } else if (path.isAbsolute(normalized)) {
    filePath = normalized;
  }

  if (!filePath) {
    console.warn(`⚠️ Reference URL could not be mapped to a file path: ${rawUrl}`);
    return null;
  }
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ Reference image file not found on disk: ${filePath} (from URL: ${rawUrl})`);
    return null;
  }

  return {
    data: fs.readFileSync(filePath),
    mimeType: getMimeTypeFromFilename(filePath),
    source: 'stored-url',
    referenceUrl: rawUrl,
    filePath,
  };
};

const findLatestFallbackReferenceAsset = (entity: any): ResolvedReferenceAsset | null => {
  if (!entity?.id && !entity?.name) return null;

  const entityId = String(entity.id || '').toLowerCase();
  const entityName = String(entity.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const isLocation = isLocationEntityType(entity.type);
  const searchDirs = [GENERATED_PORTRAITS_DIR, GENERATED_IMAGES_DIR];
  const candidates: Array<{ filePath: string; filename: string; score: number; mtime: number }> = [];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const filename of fs.readdirSync(dir)) {
      if (!/\.(png|jpg|jpeg|webp)$/i.test(filename)) continue;
      const lower = filename.toLowerCase();
      let score = 0;
      if (entityId && lower.includes(entityId)) score += 100;
      if (entityName && lower.includes(entityName)) score += 60;
      if (isLocation && lower.startsWith('location_')) score += 30;
      if (!isLocation && lower.startsWith('portrait_')) score += 20;
      if (score === 0) continue;
      const filePath = path.join(dir, filename);
      let mtime = 0;
      try {
        mtime = fs.statSync(filePath).mtimeMs;
      } catch {
        mtime = 0;
      }
      candidates.push({ filePath, filename, score, mtime });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.mtime - a.mtime;
  });

  const best = candidates[0];
  return {
    data: fs.readFileSync(best.filePath),
    mimeType: getMimeTypeFromFilename(best.filename),
    source: 'fallback-cache',
    filePath: best.filePath,
  };
};

const resolveEntityReferenceAssets = (
  entity: any,
  maxAssets = 1,
  options?: {
    includePortraitVariations?: boolean;
  }
): ResolvedReferenceAsset[] => {
  const limit = Math.max(1, Math.floor(Number(maxAssets) || 1));
  const includePortraitVariations = Boolean(options?.includePortraitVariations);
  const candidateUrls: string[] = [];
  const seenKeys = new Set<string>();
  const assets: ResolvedReferenceAsset[] = [];
  const pushUniqueUrl = (value?: string) => {
    if (!value || typeof value !== 'string') return;
    const key = normalizeComparableImageUrl(value) || value.trim();
    if (!key || seenKeys.has(key)) return;
    seenKeys.add(key);
    candidateUrls.push(value);
  };

  pushUniqueUrl(entity?.referenceImage);
  pushUniqueUrl(entity?.imageUrl);
  if (includePortraitVariations && Array.isArray(entity?.portraitVariations)) {
    for (const variationUrl of entity.portraitVariations) {
      pushUniqueUrl(typeof variationUrl === 'string' ? variationUrl : undefined);
    }
  }

  for (const candidateUrl of candidateUrls) {
    const resolved = toImageDataFromUrl(candidateUrl);
    if (!resolved) continue;
    assets.push(resolved);
    if (assets.length >= limit) return assets;
  }

  if (assets.length === 0) {
    const fallback = findLatestFallbackReferenceAsset(entity);
    if (fallback) {
      assets.push(fallback);
    }
  }

  return assets.slice(0, limit);
};

const resolveEntityReferenceAsset = (entity: any): ResolvedReferenceAsset | null => {
  return resolveEntityReferenceAssets(entity, 1, { includePortraitVariations: false })[0] || null;
};

// Load a stored image URL into an ImagePart suitable for attaching to a chat
// turn. Returns null if the URL doesn't resolve to a real file on disk.
const loadImagePart = (rawUrl: string | undefined, label: string): ImagePart | null => {
  const asset = toImageDataFromUrl(rawUrl);
  if (!asset) return null;
  return {
    label,
    mimeType: asset.mimeType,
    base64Data: asset.data.toString('base64'),
  };
};

// Build an ImagePart for an entity, preferring its canonical reference image
// and falling back to its file-cache match if the URL is stale.
const loadEntityImagePart = (entity: any, label: string): ImagePart | null => {
  if (!entity) return null;
  const direct = loadImagePart(entity.referenceImage || entity.imageUrl, label);
  if (direct) return direct;
  const fallback = findLatestFallbackReferenceAsset(entity);
  if (!fallback) return null;
  return {
    label,
    mimeType: fallback.mimeType,
    base64Data: fallback.data.toString('base64'),
  };
};

const buildReferenceDescription = (entity: any, extraNotes?: string[]): string => {
  const entityType = typeof entity?.type === 'string' ? entity.type.toLowerCase() : 'unknown';
  const isHumanIdentity = isHumanReferenceEntityType(entityType);
  const compact = (value: unknown, maxLength = 180): string => {
    if (typeof value !== 'string') return '';
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
  };

  const traitsLine = Array.isArray(entity?.traits) && entity.traits.length > 0
    ? `traits: ${entity.traits.slice(0, 4).join(', ')}`
    : '';

  const baseParts = isHumanIdentity
    ? [
        ...(extraNotes || []),
      ]
    : [
        compact(entity?.description, 220),
        compact(entity?.appearance, 180),
        traitsLine,
        ...(extraNotes || []),
      ];

  const filteredParts = baseParts.filter(Boolean);
  return `${entity?.name || 'Entity'} (${entity?.type || 'unknown'})${filteredParts.length > 0 ? ` | ${filteredParts.join(' | ')}` : ''}`;
};

const hasEntityReferenceImage = (entity: any): boolean => {
  return Boolean(
    (typeof entity?.referenceImage === 'string' && entity.referenceImage.trim().length > 0) ||
    (typeof entity?.imageUrl === 'string' && entity.imageUrl.trim().length > 0)
  );
};

// ---------------------------------------------------------------------------
// Shared scene reference resolution helper
// ---------------------------------------------------------------------------
interface SceneReferenceResolutionOptions {
  usePro?: boolean;
  includeCharacterAlternates?: boolean;
  maxObjectRefs?: number;
  strictCharacterRefs?: boolean;
  requiredCharacterIds?: string[];
  /** When true, look for the previous scene's image on disk for visual continuity */
  includePreviousShots?: boolean;
  sceneId?: string;
}

interface SceneReferenceResolutionResult {
  characterRefs: any[];
  locationRefs: any[];
  objectRefs: any[];
  previousShots: any[];
  participantEntities: any[];
  participants: string[];
  diagnostics: {
    participants: Array<{
      entityId: string;
      name: string;
      type: string;
      referenceType: 'character' | 'object';
      resolved: boolean;
      includedInRequest?: boolean;
      droppedReason?: string;
      priorityScore?: number;
      source?: string;
      url?: string;
    }>;
    location: {
      entityId: string;
      name: string;
      resolved: boolean;
      source?: string;
      url?: string;
    } | null;
  };
  /** Set only when strictCharacterRefs is true and characters are missing */
  missingRequired?: {
    characterIds: string[];
    characters: Array<{ id: string; name: string }>;
    requiredCharacterIds: string[];
    resolvedCharacterIds: string[];
  };
}

function resolveSceneReferences(
  scene: any,
  projectData: ProjectData,
  options: SceneReferenceResolutionOptions = {},
): SceneReferenceResolutionResult {
  const {
    usePro = true,
    includeCharacterAlternates = false,
    maxObjectRefs: requestedMaxObjectRefs,
    strictCharacterRefs = false,
    requiredCharacterIds,
    includePreviousShots = true,
    sceneId,
  } = options;

  const characterRefs: any[] = [];
  const locationRefs: any[] = [];
  const objectRefs: any[] = [];
  const previousShots: any[] = [];
  const maxCharacterRefs = usePro ? MAX_SCENE_CHARACTER_REFS_PRO : MAX_SCENE_CHARACTER_REFS_FLASH;
  const parsedRequestedMaxObjectRefs = Number.isFinite(Number(requestedMaxObjectRefs))
    ? Number(requestedMaxObjectRefs)
    : undefined;
  const effectiveMaxObjectRefs = usePro
    ? Math.max(0, Math.min(MAX_SCENE_OBJECT_REFS_PRO, parsedRequestedMaxObjectRefs ?? MAX_SCENE_OBJECT_REFS_PRO))
    : Math.max(0, Math.min(MAX_SCENE_OBJECT_REFS_FLASH, parsedRequestedMaxObjectRefs ?? MAX_SCENE_OBJECT_REFS_FLASH));
  const participantOrderById = new Map<string, number>();

  type ParticipantReferenceCandidate = {
    entity: any;
    participantOrder: number;
    variantIndex: number;
    referenceType: 'character' | 'object';
    referencePayload: any;
    source: string;
    url?: string;
    priorityScore: number;
  };
  const characterCandidates: ParticipantReferenceCandidate[] = [];
  const objectCandidates: ParticipantReferenceCandidate[] = [];
  const participantReferenceDiagnostics: SceneReferenceResolutionResult['diagnostics']['participants'] = [];

  // Get character references from scene participants
  const participantsRaw = scene.participantIds || scene.participants || [];
  const participants = participantsRaw
    .map((p: any) => (typeof p === 'string' ? p : p?.id))
    .filter(Boolean);
  const participantEntities = participants
    .map((participantId: string) => projectData.entities.find((entity: any) => entity.id === participantId))
    .filter((entity: any, index: number, collection: any[]) => Boolean(entity) && collection.findIndex((candidate: any) => candidate.id === entity.id) === index);
  participantEntities.forEach((entity: any, index: number) => {
    participantOrderById.set(entity.id, index);
  });
  const humanParticipantCount = participantEntities.filter((entity: any) =>
    isHumanReferenceEntityType((entity?.type || '').toLowerCase())
  ).length;
  const perCharacterReferenceLimit = includeCharacterAlternates
    ? (humanParticipantCount <= 1 ? 3 : humanParticipantCount === 2 ? 2 : 1)
    : 1;

  for (const entity of participantEntities) {
    const entityType = (entity.type || '').toLowerCase();
    if (isLocationEntityType(entityType)) continue;

    const isHumanEntity = isHumanReferenceEntityType(entityType);
    const refType = isHumanEntity ? 'character' : 'object';
    const primaryResolvedAsset = !isHumanEntity ? resolveEntityReferenceAsset(entity) : null;
    const resolvedAssets = isHumanEntity
      ? resolveEntityReferenceAssets(entity, perCharacterReferenceLimit, {
          includePortraitVariations: includeCharacterAlternates,
        })
      : (primaryResolvedAsset ? [primaryResolvedAsset] : []);

    if (resolvedAssets.length === 0) {
      participantReferenceDiagnostics.push({
        entityId: entity.id,
        name: entity.name,
        type: entity.type || 'unknown',
        referenceType: refType,
        resolved: false,
        includedInRequest: false,
        droppedReason: 'No resolved reference image found',
        priorityScore: refType === 'object' ? getObjectReferencePriority(entity) : 0,
        url: entity.referenceImage || entity.imageUrl || undefined,
      });
      continue;
    }
    resolvedAssets.forEach((resolvedAsset, assetIndex) => {
      const isPrimaryVariant = assetIndex === 0;
      const referencePayload = {
        id: isPrimaryVariant ? entity.id : `${entity.id}__alt${assetIndex + 1}`,
        data: resolvedAsset.data,
        mimeType: resolvedAsset.mimeType,
        description: buildReferenceDescription(entity, isHumanEntity && !isPrimaryVariant ? [`alternate likeness reference ${assetIndex + 1}`] : undefined),
        type: refType,
      };

      const candidate: ParticipantReferenceCandidate = {
        entity,
        participantOrder: participantOrderById.get(entity.id) ?? Number.MAX_SAFE_INTEGER,
        variantIndex: assetIndex,
        referenceType: refType,
        referencePayload,
        source: resolvedAsset.source,
        url: resolvedAsset.referenceUrl || entity.referenceImage || entity.imageUrl || undefined,
        priorityScore: refType === 'object' ? getObjectReferencePriority(entity) : 0,
      };

      if (!isHumanEntity) {
        objectCandidates.push(candidate);
      } else {
        characterCandidates.push(candidate);
      }
    });
  }

  characterCandidates
    .sort((a, b) => {
      if (a.participantOrder !== b.participantOrder) return a.participantOrder - b.participantOrder;
      if (a.variantIndex !== b.variantIndex) return a.variantIndex - b.variantIndex;
      return String(a.entity?.id || '').localeCompare(String(b.entity?.id || ''));
    })
    .forEach((candidate, index) => {
      const includedInRequest = index < maxCharacterRefs;
      if (includedInRequest) {
        characterRefs.push(candidate.referencePayload);
      }
      participantReferenceDiagnostics.push({
        entityId: candidate.entity.id,
        name: candidate.variantIndex > 0
          ? `${candidate.entity.name} (alt ${candidate.variantIndex + 1})`
          : candidate.entity.name,
        type: candidate.entity.type || 'unknown',
        referenceType: 'character',
        resolved: true,
        includedInRequest,
        droppedReason: includedInRequest ? undefined : `Exceeded character reference budget (${maxCharacterRefs})`,
        priorityScore: candidate.priorityScore,
        source: candidate.source,
        url: candidate.url,
      });
    });

  objectCandidates
    .sort((a, b) => {
      if (a.priorityScore !== b.priorityScore) return a.priorityScore - b.priorityScore;
      if (a.participantOrder !== b.participantOrder) return a.participantOrder - b.participantOrder;
      return String(a.entity?.id || '').localeCompare(String(b.entity?.id || ''));
    })
    .forEach((candidate, index) => {
      const includedInRequest = index < effectiveMaxObjectRefs;
      if (includedInRequest) {
        objectRefs.push(candidate.referencePayload);
      }
      participantReferenceDiagnostics.push({
        entityId: candidate.entity.id,
        name: candidate.entity.name,
        type: candidate.entity.type || 'unknown',
        referenceType: 'object',
        resolved: true,
        includedInRequest,
        droppedReason: includedInRequest ? undefined : `Exceeded object reference budget (${effectiveMaxObjectRefs})`,
        priorityScore: candidate.priorityScore,
        source: candidate.source,
        url: candidate.url,
      });
    });

  participantReferenceDiagnostics.sort((a, b) => {
    const orderA = participantOrderById.get(a.entityId) ?? Number.MAX_SAFE_INTEGER;
    const orderB = participantOrderById.get(b.entityId) ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    if (a.referenceType !== b.referenceType) return a.referenceType.localeCompare(b.referenceType);
    return a.name.localeCompare(b.name);
  });

  // Get location references if scene has a location
  const locationId = scene.locationId || scene.location;
  let locationReferenceDiagnostic: SceneReferenceResolutionResult['diagnostics']['location'] = null;
  let location: any = null;
  if (locationId) {
    location = projectData.entities.find((e: any) =>
      e.id === locationId ||
      e.name.toLowerCase() === locationId?.toLowerCase()
    );
  }
  // Fallback: search participant list for location-type entities
  if (!location && Array.isArray(participants) && participants.length > 0) {
    location = participants
      .map((pId: string) => projectData.entities.find((e: any) => e.id === pId))
      .filter(Boolean)
      .find((e: any) => isLocationEntityType((e.type || '').toLowerCase()));
  }
  if (location) {
      const resolvedAsset = resolveEntityReferenceAsset(location);
      if (resolvedAsset) {
        locationRefs.push({
          id: location.id,
          data: resolvedAsset.data,
          mimeType: resolvedAsset.mimeType,
          description: buildReferenceDescription(location),
          type: 'location',
        });
        locationReferenceDiagnostic = {
          entityId: location.id,
          name: location.name,
          resolved: true,
          source: resolvedAsset.source,
          url: resolvedAsset.referenceUrl || location.referenceImage || location.imageUrl || undefined,
        };
      } else {
        locationReferenceDiagnostic = {
          entityId: location.id,
          name: location.name,
          resolved: false,
          url: location.referenceImage || location.imageUrl || undefined,
        };
      }
  }

  // Get previous scene images for visual continuity
  const effectiveSceneId = sceneId || scene.id;
  if (includePreviousShots && effectiveSceneId) {
    const sceneImageDir = GENERATED_IMAGES_DIR;
    if (fs.existsSync(sceneImageDir)) {
      const orderedScenes = [...(projectData.interactions || [])].sort((a, b) => {
        const posA = a.position ?? Number.MAX_VALUE;
        const posB = b.position ?? Number.MAX_VALUE;
        return posA - posB;
      });
      const sceneIndex = orderedScenes.findIndex(i => i.id === effectiveSceneId);
      if (sceneIndex > 0) {
        const prevScene = orderedScenes[sceneIndex - 1];
        const prevSceneFiles = fs.readdirSync(sceneImageDir)
          .filter(f => f.startsWith(`scene_${prevScene.id}`))
          .sort()
          .reverse();

        if (prevSceneFiles.length > 0) {
          const prevPath = path.join(sceneImageDir, prevSceneFiles[0]);
          const prevData = fs.readFileSync(prevPath);
          const ext = path.extname(prevSceneFiles[0]).toLowerCase();
          previousShots.push({
            id: prevScene.id,
            data: prevData,
            mimeType: ext === '.png' ? 'image/png' : 'image/jpeg',
            description: `Previous scene: ${prevScene.title || 'Untitled'}`,
            type: 'previous_shot',
          });
        }
      }
    }
  }

  // Check for missing required characters (strict mode)
  const allHumanParticipantIds: string[] = participantEntities
    .filter((entity: any) => isHumanReferenceEntityType(entity?.type))
    .map((entity: any) => entity.id as string);
  const humanParticipantIdSet = new Set<string>(allHumanParticipantIds);
  const defaultRequiredCharacterIds = allHumanParticipantIds.slice(0, maxCharacterRefs);
  const requestedRequiredCharacters: string[] = Array.isArray(requiredCharacterIds)
    ? requiredCharacterIds.filter((value: any) => typeof value === 'string' && value.trim().length > 0)
    : [];
  const requiredCharacterSet = new Set<string>(
    (requestedRequiredCharacters.length > 0 ? requestedRequiredCharacters : defaultRequiredCharacterIds)
      .filter((id: string) => humanParticipantIdSet.has(id))
  );
  const selectedCharacterIdSet = new Set<string>(characterRefs.map((ref) => ref.id));
  const missingRequiredCharacterIds = Array.from(requiredCharacterSet).filter((id) => !selectedCharacterIdSet.has(id));

  let missingRequired: SceneReferenceResolutionResult['missingRequired'];
  if (strictCharacterRefs && missingRequiredCharacterIds.length > 0) {
    const missingCharacters = missingRequiredCharacterIds.map((id) => {
      const entity = participantEntities.find((candidate: any) => candidate.id === id);
      return { id, name: entity?.name || id };
    });
    missingRequired = {
      characterIds: missingRequiredCharacterIds,
      characters: missingCharacters,
      requiredCharacterIds: Array.from(requiredCharacterSet),
      resolvedCharacterIds: Array.from(selectedCharacterIdSet),
    };
  }

  // Log diagnostics
  const unresolvedParticipants = participantReferenceDiagnostics.filter((entry) => !entry.resolved).map((entry) => entry.name);
  const droppedParticipants = participantReferenceDiagnostics
    .filter((entry) => entry.resolved && entry.includedInRequest === false)
    .map((entry) => `${entry.name} (${entry.referenceType})`);
  console.log(`   Character refs: ${characterRefs.length}, Object refs: ${objectRefs.length}, Location refs: ${locationRefs.length}, Previous shots: ${previousShots.length}`);
  if (unresolvedParticipants.length > 0) {
    console.warn(`⚠️ Missing participant reference images for: ${unresolvedParticipants.join(', ')}`);
  }
  if (droppedParticipants.length > 0) {
    console.warn(`⚠️ Participant refs dropped by budget: ${droppedParticipants.join(', ')}`);
  }

  return {
    characterRefs,
    locationRefs,
    objectRefs,
    previousShots,
    participantEntities,
    participants,
    diagnostics: {
      participants: participantReferenceDiagnostics,
      location: locationReferenceDiagnostic,
    },
    missingRequired,
  };
}

const markVisualsDirtyFromEntityChange = (
  projectData: any,
  session: WorldSession,
  changedEntity: any,
  reason: string
): VisualInvalidationSummary => {
  const sceneIds = new Set<string>();
  const frameIds = new Set<string>();
  const changedEntityId = changedEntity?.id;
  if (!changedEntityId) {
    return {
      sceneIds: [],
      frameIds: [],
      sceneCount: 0,
      frameCount: 0,
      reason,
    };
  }

  const changedEntityName = changedEntity?.name || changedEntityId;
  const nowIso = new Date().toISOString();

  for (const scene of (projectData.interactions || [])) {
    const sceneId = scene?.id;
    if (!sceneId) continue;

    const participantIds = getSceneParticipantIds(scene);
    const sceneLocationId = getSceneLocationId(scene);
    const sceneReferencesEntity = participantIds.includes(changedEntityId) || sceneLocationId === changedEntityId;
    if (!sceneReferencesEntity) continue;

    if (scene.imageUrl) {
      scene.visualDirty = true;
      scene.visualDirtyAt = nowIso;
      scene.visualDirtyReason = reason;
      scene.visualDirtyEntityIds = Array.from(new Set([...(scene.visualDirtyEntityIds || []), changedEntityId]));
      scene.visualDirtyEntityNames = Array.from(new Set([...(scene.visualDirtyEntityNames || []), changedEntityName]));
      sceneIds.add(sceneId);
      if (!session.pendingChanges.addedSceneIds.has(sceneId)) {
        session.pendingChanges.modifiedSceneIds.add(sceneId);
      }
    }

    if (!Array.isArray(scene.frames) || scene.frames.length === 0) continue;

    scene.frames = scene.frames.map((frame: any) => {
      const frameParticipantIds = Array.isArray(frame?.participantIds)
        ? frame.participantIds.filter((id: any): id is string => typeof id === 'string')
        : [];
      const frameLocationId = typeof frame?.locationId === 'string' ? frame.locationId : undefined;
      const frameReferencesEntity = frameParticipantIds.includes(changedEntityId)
        || frameLocationId === changedEntityId
        || frameParticipantIds.length === 0;

      if (!frame.imageUrl || !frameReferencesEntity) return frame;

      const nextFrame = {
        ...frame,
        visualDirty: true,
        visualDirtyAt: nowIso,
        visualDirtyReason: reason,
        visualDirtyEntityIds: Array.from(new Set([...(frame.visualDirtyEntityIds || []), changedEntityId])),
        visualDirtyEntityNames: Array.from(new Set([...(frame.visualDirtyEntityNames || []), changedEntityName])),
      };
      frameIds.add(frame.id || `${sceneId}_frame`);
      if (!session.pendingChanges.addedSceneIds.has(sceneId)) {
        session.pendingChanges.modifiedSceneIds.add(sceneId);
      }
      return nextFrame;
    });
  }

  if (sceneIds.size > 0 || frameIds.size > 0) {
    session.uncommittedChanges = true;
  }

  return {
    sceneIds: Array.from(sceneIds),
    frameIds: Array.from(frameIds),
    sceneCount: sceneIds.size,
    frameCount: frameIds.size,
    reason,
  };
};

const pendingAutoEntityVisualJobs = new Set<string>();
let autoEntityVisualQueue: Promise<void> = Promise.resolve();

const queueAutoEntityVisualGeneration = (projectId: string, entityId: string, reason = 'auto_entity_creation'): void => {
  if (!portraitGenerator) return;
  const jobKey = `${projectId}:${entityId}`;
  if (pendingAutoEntityVisualJobs.has(jobKey)) return;
  pendingAutoEntityVisualJobs.add(jobKey);

  autoEntityVisualQueue = autoEntityVisualQueue.then(async () => {
    try {
      const baseProjectData = loadProjectData(projectId);
      const entityIndex = (baseProjectData.entities || []).findIndex((candidate: any) => candidate?.id === entityId);
      if (entityIndex === -1) return;

      const entity = baseProjectData.entities[entityIndex];
      if (!shouldAutoGenerateEntityVisual(entity) || hasEntityReferenceImage(entity)) return;

      const effectiveVisualStylePrompt = getEffectiveVisualStylePrompt(projectId);
      let entityForGeneration = entity;
      if (effectiveVisualStylePrompt) {
        const mergedDescription = `[VISUAL STYLE: ${effectiveVisualStylePrompt}]\n\n${entity.description || ''}`.trim();
        entityForGeneration = {
          ...entity,
          description: mergedDescription,
        };
      }

      const isLocation = isLocationEntityType(entity.type);
      const styleCacheToken = getStyleCacheToken(effectiveVisualStylePrompt);
      const saveSuffix = `auto_${Date.now()}`;
      const cacheKey = `${entity.id}:style:${styleCacheToken}`;
      const result = isLocation
        ? await portraitGenerator.generateLocationShot(entityForGeneration, { cacheKey, saveSuffix })
        : await portraitGenerator.generatePortrait(entityForGeneration, { cacheKey, saveSuffix });
      const image = isLocation ? result.establishingShot : result.portrait;

      const portraitDir = path.join(process.cwd(), '.narrative-data', 'generated-images', 'portraits');
      const ext = image.mimeType.includes('png') ? 'png' : 'jpeg';
      const safeName = entity.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      const filename = `${isLocation ? 'location' : 'portrait'}_${entity.id}_${safeName}_${saveSuffix}.${ext}`;
      const filePath = path.join(portraitDir, filename);
      if (!fs.existsSync(portraitDir)) {
        fs.mkdirSync(portraitDir, { recursive: true });
      }
      fs.writeFileSync(filePath, image.data);

      const imageUrl = `/api/narrative/visual/portraits/${filename}`;
      const latestProjectData = loadProjectData(projectId);
      const latestEntityIndex = (latestProjectData.entities || []).findIndex((candidate: any) => candidate?.id === entityId);
      if (latestEntityIndex === -1) return;

      const latestEntity = latestProjectData.entities[latestEntityIndex];
      if (hasEntityReferenceImage(latestEntity)) return;

      latestProjectData.entities[latestEntityIndex] = {
        ...latestProjectData.entities[latestEntityIndex],
        referenceImage: imageUrl,
        imageUrl,
        updatedAt: new Date().toISOString(),
      };

      const session = getWorldSession(projectId);
      if (!session.pendingChanges.addedEntityIds.has(entityId)) {
        session.pendingChanges.modifiedEntityIds.add(entityId);
      }
      session.uncommittedChanges = true;

      const dirtySummary = markVisualsDirtyFromEntityChange(
        latestProjectData,
        session,
        latestProjectData.entities[latestEntityIndex],
        `Reference image updated for ${entity.name} (${reason})`
      );
      applyStoryGraphDiffs(latestProjectData);
      saveProjectData(projectId, latestProjectData);

      console.log(`🖼️ Auto-generated reference for ${entity.name} (${entity.type}); invalidated ${dirtySummary.sceneCount} scenes and ${dirtySummary.frameCount} frames.`);
    } catch (error: any) {
      console.warn(`Auto visual generation failed for ${entityId}:`, error?.message || error);
    } finally {
      pendingAutoEntityVisualJobs.delete(jobKey);
    }
  }).catch((error: any) => {
    console.warn(`Auto visual queue error for ${entityId}:`, error?.message || error);
    pendingAutoEntityVisualJobs.delete(jobKey);
  });
};

// Helper to query the graph for context about specific entities
function queryGraphContext(projectData: any, entityNames: string[]): string {
  const normalized = entityNames.map(name => name.toLowerCase());
  const relevantEntities = projectData.entities.filter((e: any) => {
    const nameMatch = normalized.some(name => e.name.toLowerCase().includes(name));
    const idMatch = normalized.includes(e.id.toLowerCase());
    return nameMatch || idMatch;
  });

  if (relevantEntities.length === 0) return '';

  const entityIds = new Set(relevantEntities.map((e: any) => e.id));

  // Find relationships involving these entities
  const relevantRelationships = projectData.relationships.filter((r: any) =>
    entityIds.has(r.source) || entityIds.has(r.target)
  );

  // Find connected entities (1 hop)
  const connectedIds = new Set<string>();
  for (const rel of relevantRelationships) {
    connectedIds.add(rel.source);
    connectedIds.add(rel.target);
  }

  const connectedEntities = projectData.entities.filter((e: any) =>
    connectedIds.has(e.id) && !entityIds.has(e.id)
  );

  let context = '\n--- FOCUSED CONTEXT ---\n';

  context += '\nFOCUSED ENTITIES:\n';
  for (const entity of relevantEntities) {
    context += `• ${entity.name} (${entity.type}): ${entity.description || 'No description'}\n`;
    if (entity.traits?.length) context += `  Traits: ${entity.traits.join(', ')}\n`;
  }

  if (relevantRelationships.length > 0) {
    context += '\nDIRECT RELATIONSHIPS:\n';
    for (const rel of relevantRelationships) {
      context += `• ${rel.sourceName || rel.source} —[${rel.type}]→ ${rel.targetName || rel.target}\n`;
    }
  }

  if (connectedEntities.length > 0) {
    context += '\nCONNECTED ENTITIES (1 hop):\n';
    for (const entity of connectedEntities.slice(0, 10)) {
      context += `• ${entity.name} (${entity.type})\n`;
    }
  }

  return context;
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findMentionedEntities = (text: string, entities: any[]): string[] => {
  if (!text) return [];
  const matches: string[] = [];
  for (const entity of entities) {
    if (!entity?.name) continue;
    const pattern = new RegExp(`\\b${escapeRegex(entity.name)}\\b`, 'i');
    if (pattern.test(text)) {
      matches.push(entity.name);
    }
  }
  return matches;
};

const findMentionedEntityMatches = (text: string, entities: any[]): any[] => {
  if (!text) return [];
  const matches: any[] = [];
  const seenIds = new Set<string>();
  for (const entity of entities) {
    if (!entity?.name || !entity?.id) continue;
    if (seenIds.has(entity.id)) continue;
    const pattern = new RegExp(`\\b${escapeRegex(entity.name)}\\b`, 'i');
    if (pattern.test(text)) {
      seenIds.add(entity.id);
      matches.push(entity);
    }
  }
  return matches;
};

const shouldGroundAsSceneParticipant = (entity: any): boolean => {
  const entityType = typeof entity?.type === 'string' ? entity.type.toLowerCase() : '';
  return SCENE_GROUNDED_PARTICIPANT_ENTITY_TYPES.has(entityType);
};

const resolveEntityByName = (projectData: any, name: string): any | null => {
  const lower = name.toLowerCase();
  return projectData.entities.find((e: any) => e.name.toLowerCase() === lower)
    || projectData.entities.find((e: any) => e.name.toLowerCase().includes(lower) || lower.includes(e.name.toLowerCase()))
    || null;
};

type StoryIssueSeverity = 'warning' | 'error';

interface StoryContinuityIssue {
  id: string;
  sceneId: string;
  sceneTitle: string;
  position: number;
  severity: StoryIssueSeverity;
  code:
    | 'unknown_participant'
    | 'unknown_location'
    | 'event_mentions_non_participant'
    | 'scene_mentions_non_participant'
    | 'scene_mentions_location_without_grounding'
    | 'frame_mentions_non_participant'
    | 'frame_mentions_unknown_entity'
    | 'canon_scene_reordered'
    | 'entity_introduction_shift';
  message: string;
  entityIds: string[];
}

interface StoryMutation {
  id: string;
  type:
    | 'entity_first_appearance'
    | 'entity_enters_scene'
    | 'entity_exits_scene'
    | 'location_shift'
    | 'event_beat';
  description: string;
  entityId?: string;
  from?: string;
  to?: string;
}

interface StorySceneDiff {
  sceneId: string;
  sceneTitle: string;
  position: number;
  baseSceneId?: string;
  participantIds: string[];
  locationId?: string;
  entityAdds: string[];
  entityRemoves: string[];
  firstAppearances: string[];
  locationChange?: { from?: string; to?: string };
  eventBeats: string[];
  mutations: StoryMutation[];
  continuityIssues: StoryContinuityIssue[];
}

interface StoryEntityArcEntry {
  sceneId: string;
  sceneTitle: string;
  position: number;
  role: 'introduced' | 'enters' | 'present' | 'exits';
  locationId?: string;
  events: string[];
  changes: string[];
}

interface StoryEntityArc {
  entityId: string;
  entityName: string;
  firstSceneId?: string;
  latestSceneId?: string;
  entries: StoryEntityArcEntry[];
}

interface StoryGraphAnalysis {
  version: number;
  generatedAt: number;
  sceneCount: number;
  sceneDiffs: StorySceneDiff[];
  entityArcs: Record<string, StoryEntityArc>;
  consistency: {
    errors: number;
    warnings: number;
    isConsistent: boolean;
    issues: StoryContinuityIssue[];
  };
}

const getSceneParticipantIds = (scene: any): string[] => {
  const raw = scene?.participantIds || scene?.participants || [];
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((item: any) => (typeof item === 'string' ? item : item?.id))
        .filter((id: any) => typeof id === 'string' && id.trim().length > 0)
    )
  );
};

const getSceneLocationId = (scene: any): string | undefined => {
  const locationId = scene?.locationId || scene?.location;
  if (typeof locationId !== 'string' || !locationId.trim()) return undefined;
  return locationId;
};

const normalizeScenePositions = (projectData: any): void => {
  if (!Array.isArray(projectData.interactions)) {
    projectData.interactions = [];
    return;
  }
  projectData.interactions.sort((a: any, b: any) => {
    const posA = typeof a.position === 'number' ? a.position : Number.MAX_SAFE_INTEGER;
    const posB = typeof b.position === 'number' ? b.position : Number.MAX_SAFE_INTEGER;
    if (posA !== posB) return posA - posB;
    const createdA = typeof a.createdAt === 'number' ? a.createdAt : (new Date(a.createdAt || 0).getTime() || 0);
    const createdB = typeof b.createdAt === 'number' ? b.createdAt : (new Date(b.createdAt || 0).getTime() || 0);
    return createdA - createdB;
  });
  projectData.interactions.forEach((scene: any, idx: number) => {
    scene.position = idx;
  });
};

const buildStoryGraphAnalysis = (projectData: any): StoryGraphAnalysis => {
  const entities = Array.isArray(projectData.entities) ? projectData.entities : [];
  const scenes = Array.isArray(projectData.interactions)
    ? [...projectData.interactions].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
    : [];
  const knownEntityIds = new Set(
    entities
      .map((e: any) => e?.id)
      .filter((id: any): id is string => typeof id === 'string' && id.length > 0)
  );
  const entityNameById = new Map<string, string>(
    entities
      .filter((e: any) => typeof e?.id === 'string')
      .map((e: any) => [e.id, e.name || e.id])
  );

  const sceneDiffs: StorySceneDiff[] = [];
  const issues: StoryContinuityIssue[] = [];
  const entityArcs: Record<string, StoryEntityArc> = {};
  const firstAppearanceByEntity = new Map<string, string>();

  const ensureArc = (entityId: string): StoryEntityArc => {
    if (!entityArcs[entityId]) {
      entityArcs[entityId] = {
        entityId,
        entityName: entityNameById.get(entityId) || entityId,
        entries: [],
      };
    }
    return entityArcs[entityId];
  };

  let previousParticipantIds = new Set<string>();
  let previousLocationId: string | undefined;
  let previousSceneId: string | undefined;

  scenes.forEach((scene: any, idx: number) => {
    const sceneId = scene.id || `scene_${idx}`;
    const sceneTitle = scene.title || scene.summary || `Scene ${idx + 1}`;
    const participantIds = getSceneParticipantIds(scene);
    const participantSet = new Set(participantIds);
    const locationId = getSceneLocationId(scene);
    const eventBeats = Array.isArray(scene.events)
      ? scene.events
          .map((event: any) => {
            if (typeof event === 'string') return event.trim();
            if (event && typeof event.description === 'string') return event.description.trim();
            return '';
          })
          .filter(Boolean)
      : [];

    const entityAdds = participantIds.filter((id) => !previousParticipantIds.has(id));
    const entityRemoves = Array.from(previousParticipantIds).filter((id) => !participantSet.has(id));
    const firstAppearances = participantIds.filter((id) => !firstAppearanceByEntity.has(id));
    firstAppearances.forEach((id) => firstAppearanceByEntity.set(id, sceneId));

    const locationChange =
      previousLocationId !== locationId && (previousLocationId || locationId)
        ? { from: previousLocationId, to: locationId }
        : undefined;

    const sceneIssues: StoryContinuityIssue[] = [];
    const mutations: StoryMutation[] = [];

    const createIssue = (
      severity: StoryIssueSeverity,
      code: StoryContinuityIssue['code'],
      message: string,
      entityIds: string[] = []
    ): StoryContinuityIssue => ({
      id: `story_issue_${sceneId}_${sceneIssues.length + 1}`,
      sceneId,
      sceneTitle,
      position: idx,
      severity,
      code,
      message,
      entityIds,
    });

    for (const participantId of participantIds) {
      if (!knownEntityIds.has(participantId)) {
        sceneIssues.push(
          createIssue(
            'error',
            'unknown_participant',
            `Scene "${sceneTitle}" references unknown participant "${participantId}".`,
            [participantId]
          )
        );
      }
    }

    if (locationId && !knownEntityIds.has(locationId)) {
      sceneIssues.push(
        createIssue(
          'error',
          'unknown_location',
          `Scene "${sceneTitle}" references unknown location "${locationId}".`,
          [locationId]
        )
      );
    }

    const sceneNarrativeText = [
      typeof scene?.title === 'string' ? scene.title : '',
      typeof scene?.summary === 'string' ? scene.summary : '',
      typeof scene?.prose === 'string' ? scene.prose : '',
      typeof scene?.description === 'string' ? scene.description : '',
    ]
      .filter(Boolean)
      .join('\n');
    const sceneMentionedEntities = findMentionedEntityMatches(sceneNarrativeText, entities);
    for (const mentionedEntity of sceneMentionedEntities) {
      const mentionedEntityId = mentionedEntity?.id;
      if (!mentionedEntityId || !knownEntityIds.has(mentionedEntityId)) continue;
      const mentionedType = typeof mentionedEntity?.type === 'string' ? mentionedEntity.type.toLowerCase() : '';

      if (isLocationEntityType(mentionedType)) {
        if (!locationId || locationId !== mentionedEntityId) {
          sceneIssues.push(
            createIssue(
              'warning',
              'scene_mentions_location_without_grounding',
              `Scene "${sceneTitle}" mentions location "${mentionedEntity.name}" but does not ground scene location to it.`,
              [mentionedEntityId]
            )
          );
        }
        continue;
      }

      if (shouldGroundAsSceneParticipant(mentionedEntity) && !participantSet.has(mentionedEntityId)) {
        const isSignificantObject = SIGNIFICANT_OBJECT_ENTITY_TYPES.has(mentionedType);
        const missingLabel = isSignificantObject ? 'significant object' : 'entity';
        sceneIssues.push(
          createIssue(
            'warning',
            'scene_mentions_non_participant',
            `Scene "${sceneTitle}" mentions ${missingLabel} "${mentionedEntity.name}" but it is missing from scene participants.`,
            [mentionedEntityId]
          )
        );
      }
    }

    if (Array.isArray(scene.frames)) {
      scene.frames.forEach((frame: any, frameIdx: number) => {
        const frameParticipants = Array.isArray(frame?.participantIds)
          ? frame.participantIds.filter((id: any): id is string => typeof id === 'string')
          : [];
        for (const frameParticipantId of frameParticipants) {
          if (!knownEntityIds.has(frameParticipantId)) {
            sceneIssues.push(
              createIssue(
                'warning',
                'frame_mentions_unknown_entity',
                `Frame ${frameIdx + 1} in "${sceneTitle}" references unknown entity "${frameParticipantId}".`,
                [frameParticipantId]
              )
            );
          } else if (!participantSet.has(frameParticipantId)) {
            sceneIssues.push(
              createIssue(
                'warning',
                'frame_mentions_non_participant',
                `Frame ${frameIdx + 1} in "${sceneTitle}" references "${entityNameById.get(frameParticipantId) || frameParticipantId}" which is missing from scene participants.`,
                [frameParticipantId]
              )
            );
          }
        }
      });
    }

    for (const eventBeat of eventBeats) {
      const mentioned = findMentionedEntities(eventBeat, entities);
      for (const name of mentioned) {
        const entity = resolveEntityByName(projectData, name);
        if (entity?.id && !participantSet.has(entity.id)) {
          sceneIssues.push(
            createIssue(
              'warning',
              'event_mentions_non_participant',
              `Event beat mentions "${entity.name}" but the entity is not listed as a scene participant.`,
              [entity.id]
            )
          );
        }
      }
    }

    for (const entityId of firstAppearances) {
      mutations.push({
        id: `story_mut_${sceneId}_${mutations.length + 1}`,
        type: 'entity_first_appearance',
        entityId,
        description: `${entityNameById.get(entityId) || entityId} appears in the story for the first time.`,
      });
    }

    for (const entityId of entityAdds.filter((id) => !firstAppearances.includes(id))) {
      mutations.push({
        id: `story_mut_${sceneId}_${mutations.length + 1}`,
        type: 'entity_enters_scene',
        entityId,
        description: `${entityNameById.get(entityId) || entityId} enters this scene.`,
      });
    }

    for (const entityId of entityRemoves) {
      mutations.push({
        id: `story_mut_${sceneId}_${mutations.length + 1}`,
        type: 'entity_exits_scene',
        entityId,
        description: `${entityNameById.get(entityId) || entityId} exits after the prior scene.`,
      });
    }

    if (locationChange) {
      mutations.push({
        id: `story_mut_${sceneId}_${mutations.length + 1}`,
        type: 'location_shift',
        from: locationChange.from,
        to: locationChange.to,
        description: `Location shifts from ${entityNameById.get(locationChange.from || '') || locationChange.from || 'unspecified'} to ${entityNameById.get(locationChange.to || '') || locationChange.to || 'unspecified'}.`,
      });
    }

    for (const eventBeat of eventBeats) {
      mutations.push({
        id: `story_mut_${sceneId}_${mutations.length + 1}`,
        type: 'event_beat',
        description: eventBeat,
      });
    }

    const sceneDiff: StorySceneDiff = {
      sceneId,
      sceneTitle,
      position: idx,
      baseSceneId: previousSceneId,
      participantIds,
      locationId,
      entityAdds,
      entityRemoves,
      firstAppearances,
      locationChange,
      eventBeats,
      mutations,
      continuityIssues: sceneIssues,
    };

    sceneDiffs.push(sceneDiff);
    issues.push(...sceneIssues);

    for (const participantId of participantIds) {
      const arc = ensureArc(participantId);
      if (!arc.firstSceneId) arc.firstSceneId = sceneId;
      arc.latestSceneId = sceneId;

      const role: StoryEntityArcEntry['role'] = firstAppearances.includes(participantId)
        ? 'introduced'
        : entityAdds.includes(participantId)
          ? 'enters'
          : 'present';

      const relatedEvents = eventBeats.filter((eventBeat) => {
        const name = entityNameById.get(participantId);
        return name ? eventBeat.toLowerCase().includes(name.toLowerCase()) : false;
      });
      const relatedChanges = mutations
        .filter((mutation) => mutation.entityId === participantId)
        .map((mutation) => mutation.description);

      arc.entries.push({
        sceneId,
        sceneTitle,
        position: idx,
        role,
        locationId,
        events: relatedEvents,
        changes: relatedChanges,
      });
    }

    for (const participantId of entityRemoves) {
      const arc = ensureArc(participantId);
      arc.entries.push({
        sceneId,
        sceneTitle,
        position: idx,
        role: 'exits',
        locationId: previousLocationId,
        events: [],
        changes: [`${entityNameById.get(participantId) || participantId} exits after this point.`],
      });
    }

    previousParticipantIds = participantSet;
    previousLocationId = locationId;
    previousSceneId = sceneId;
  });

  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.filter((issue) => issue.severity === 'warning').length;

  return {
    version: 1,
    generatedAt: Date.now(),
    sceneCount: sceneDiffs.length,
    sceneDiffs,
    entityArcs,
    consistency: {
      errors,
      warnings,
      isConsistent: errors === 0,
      issues,
    },
  };
};

const applyStoryGraphDiffs = (projectData: any): StoryGraphAnalysis => {
  normalizeScenePositions(projectData);
  const analysis = buildStoryGraphAnalysis(projectData);
  const diffBySceneId = new Map(analysis.sceneDiffs.map((diff) => [diff.sceneId, diff]));

  projectData.interactions = (projectData.interactions || []).map((scene: any) => {
    const sceneDiff = diffBySceneId.get(scene.id);
    if (!sceneDiff) return scene;

    return {
      ...scene,
      storyDiff: {
        baseSceneId: sceneDiff.baseSceneId,
        position: sceneDiff.position,
        participantIds: sceneDiff.participantIds,
        locationId: sceneDiff.locationId,
        entityAdds: sceneDiff.entityAdds,
        entityRemoves: sceneDiff.entityRemoves,
        firstAppearances: sceneDiff.firstAppearances,
        locationChange: sceneDiff.locationChange,
        eventBeats: sceneDiff.eventBeats,
        mutationCount: sceneDiff.mutations.length,
        issueCount: sceneDiff.continuityIssues.length,
        continuityIssues: sceneDiff.continuityIssues,
      },
    };
  });

  projectData.storyGraph = analysis;
  return analysis;
};

interface StoryOrderEntry {
  sceneId: string;
  sceneTitle: string;
  position: number;
}

interface StoryReorderAffectedScene {
  sceneId: string;
  sceneTitle: string;
  fromPosition: number;
  toPosition: number;
  direction: 'earlier' | 'later';
}

interface StoryReorderIssue extends StoryContinuityIssue {
  isNew: boolean;
  suggestedFix: string;
}

interface StoryReorderPreviewResult {
  oldOrder: StoryOrderEntry[];
  newOrder: StoryOrderEntry[];
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

const getIssueSuggestedFix = (issue: StoryContinuityIssue): string => {
  switch (issue.code) {
    case 'unknown_participant':
      return 'Add the missing participant entity to the world graph or replace it with an existing entity in this scene.';
    case 'unknown_location':
      return 'Assign the scene to a known location entity, or create and commit the missing location first.';
    case 'event_mentions_non_participant':
      return 'Add the mentioned entity to scene participants so event beats and cast remain aligned.';
    case 'scene_mentions_non_participant':
      return 'Add the mentioned entity to scene participants (including significant objects) so generated imagery stays grounded.';
    case 'scene_mentions_location_without_grounding':
      return 'Set this scene location to the referenced location entity to keep environmental continuity stable.';
    case 'frame_mentions_non_participant':
      return 'Include this character/object in scene participants or remove it from frame-specific blocking notes.';
    case 'frame_mentions_unknown_entity':
      return 'Replace the unknown frame entity with a known world entity to keep visual continuity grounded.';
    case 'canon_scene_reordered':
      return 'Keep canon scenes in established order, or branch before applying this reorder and commit the new chronology separately.';
    case 'entity_introduction_shift':
      return 'Confirm this is intentional (flashback or retcon). If intentional, annotate the scene context and commit as a timeline rewrite.';
    default:
      return 'Review this scene for continuity alignment with adjacent scenes and world entities.';
  }
};

const getIssueSignature = (issue: StoryContinuityIssue): string => {
  const entityKey = Array.isArray(issue.entityIds) ? [...issue.entityIds].sort().join('|') : '';
  return [
    issue.sceneId,
    issue.code,
    issue.severity,
    entityKey,
    issue.message,
  ].join('::');
};

const getOrderedSceneEntries = (projectData: any): StoryOrderEntry[] => {
  const scenes = Array.isArray(projectData.interactions) ? projectData.interactions : [];
  return [...scenes]
    .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
    .map((scene: any, idx: number) => ({
      sceneId: scene.id,
      sceneTitle: scene.title || scene.summary || `Scene ${idx + 1}`,
      position: idx,
    }));
};

const validateOrderedSceneIds = (projectData: any, orderedSceneIds: any): string[] => {
  const sceneEntries = getOrderedSceneEntries(projectData);
  const currentSceneIds = sceneEntries.map((entry) => entry.sceneId);

  if (!Array.isArray(orderedSceneIds)) {
    throw new Error('Invalid reorder request: "orderedSceneIds" must be an array.');
  }

  const normalizedIds = orderedSceneIds
    .filter((id: any): id is string => typeof id === 'string' && id.trim().length > 0)
    .map((id: string) => id.trim());

  if (normalizedIds.length !== currentSceneIds.length) {
    throw new Error('Invalid reorder request: ordered scene count does not match current storyboard scene count.');
  }

  const uniqueCount = new Set(normalizedIds).size;
  if (uniqueCount !== normalizedIds.length) {
    throw new Error('Invalid reorder request: orderedSceneIds contains duplicates.');
  }

  const knownIds = new Set(currentSceneIds);
  const unknownIds = normalizedIds.filter((id) => !knownIds.has(id));
  if (unknownIds.length > 0) {
    throw new Error(`Invalid reorder request: unknown scene IDs (${unknownIds.join(', ')}).`);
  }

  const missingIds = currentSceneIds.filter((id) => !normalizedIds.includes(id));
  if (missingIds.length > 0) {
    throw new Error(`Invalid reorder request: missing scene IDs (${missingIds.join(', ')}).`);
  }

  return normalizedIds;
};

const applySceneOrderToData = (projectData: any, orderedSceneIds: string[]): void => {
  if (!Array.isArray(projectData.interactions)) {
    projectData.interactions = [];
    return;
  }
  const sceneById = new Map(
    projectData.interactions
      .filter((scene: any) => typeof scene?.id === 'string')
      .map((scene: any) => [scene.id, scene])
  );

  orderedSceneIds.forEach((sceneId, idx) => {
    const scene = sceneById.get(sceneId);
    if (!scene) return;
    scene.position = idx;
  });
};

const buildStoryReorderPreview = (projectData: any, orderedSceneIdsInput: any): StoryReorderPreviewResult => {
  const beforeData = JSON.parse(JSON.stringify(projectData));
  normalizeScenePositions(beforeData);
  const orderedSceneIds = validateOrderedSceneIds(beforeData, orderedSceneIdsInput);
  const oldOrder = getOrderedSceneEntries(beforeData);

  const candidateData = JSON.parse(JSON.stringify(beforeData));
  applySceneOrderToData(candidateData, orderedSceneIds);

  const beforeAnalysis = applyStoryGraphDiffs(beforeData);
  const afterAnalysis = applyStoryGraphDiffs(candidateData);
  const newOrder = getOrderedSceneEntries(candidateData);
  const newPositionBySceneId = new Map(newOrder.map((entry) => [entry.sceneId, entry.position]));

  const affectedScenes: StoryReorderAffectedScene[] = oldOrder
    .map((entry) => {
      const nextPos = newPositionBySceneId.get(entry.sceneId);
      if (typeof nextPos !== 'number' || nextPos === entry.position) return null;
      return {
        sceneId: entry.sceneId,
        sceneTitle: entry.sceneTitle,
        fromPosition: entry.position,
        toPosition: nextPos,
        direction: nextPos < entry.position ? 'earlier' : 'later',
      } as StoryReorderAffectedScene;
    })
    .filter((entry): entry is StoryReorderAffectedScene => Boolean(entry));

  const sceneById = new Map(
    (beforeData.interactions || [])
      .filter((scene: any) => typeof scene?.id === 'string')
      .map((scene: any) => [scene.id, scene])
  );
  const entityNameById = new Map(
    (beforeData.entities || [])
      .filter((entity: any) => typeof entity?.id === 'string')
      .map((entity: any) => [entity.id, entity.name || entity.id])
  );

  const derivedAfterIssues: StoryContinuityIssue[] = [];

  for (const affectedScene of affectedScenes) {
    const scene = sceneById.get(affectedScene.sceneId);
    const sceneStatus = typeof scene?.status === 'string' ? scene.status.toLowerCase() : 'draft';
    if (sceneStatus === 'canon') {
      derivedAfterIssues.push({
        id: `story_issue_canon_reorder_${affectedScene.sceneId}`,
        sceneId: affectedScene.sceneId,
        sceneTitle: affectedScene.sceneTitle,
        position: affectedScene.toPosition,
        severity: 'error',
        code: 'canon_scene_reordered',
        message: `Canon scene "${affectedScene.sceneTitle}" moved from position ${affectedScene.fromPosition + 1} to ${affectedScene.toPosition + 1}.`,
        entityIds: getSceneParticipantIds(scene),
      });
    }
  }

  const getFirstAppearanceMap = (analysis: StoryGraphAnalysis): Map<string, { sceneId: string; sceneTitle: string; position: number }> => {
    const firstAppearanceMap = new Map<string, { sceneId: string; sceneTitle: string; position: number }>();
    for (const diff of analysis.sceneDiffs) {
      for (const entityId of diff.firstAppearances || []) {
        if (!firstAppearanceMap.has(entityId)) {
          firstAppearanceMap.set(entityId, {
            sceneId: diff.sceneId,
            sceneTitle: diff.sceneTitle,
            position: diff.position,
          });
        }
      }
    }
    return firstAppearanceMap;
  };

  const firstBefore = getFirstAppearanceMap(beforeAnalysis);
  const firstAfter = getFirstAppearanceMap(afterAnalysis);
  for (const [entityId, beforeEntry] of firstBefore.entries()) {
    const afterEntry = firstAfter.get(entityId);
    if (!afterEntry || afterEntry.sceneId === beforeEntry.sceneId) continue;
    const entityName = entityNameById.get(entityId) || entityId;
    derivedAfterIssues.push({
      id: `story_issue_intro_shift_${entityId}_${afterEntry.sceneId}`,
      sceneId: afterEntry.sceneId,
      sceneTitle: afterEntry.sceneTitle,
      position: afterEntry.position,
      severity: 'warning',
      code: 'entity_introduction_shift',
      message: `${entityName} is now introduced in "${afterEntry.sceneTitle}" instead of "${beforeEntry.sceneTitle}".`,
      entityIds: [entityId],
    });
  }

  const dedupeIssues = (issueList: StoryContinuityIssue[]): StoryContinuityIssue[] => {
    const bySignature = new Map<string, StoryContinuityIssue>();
    for (const issue of issueList) {
      bySignature.set(getIssueSignature(issue), issue);
    }
    return Array.from(bySignature.values());
  };

  const beforeIssues = dedupeIssues(beforeAnalysis.consistency.issues);
  const afterIssues = dedupeIssues([
    ...afterAnalysis.consistency.issues,
    ...derivedAfterIssues,
  ]);

  const beforeIssueSignatures = new Set(beforeIssues.map(getIssueSignature));
  const afterIssueSignatures = new Set(afterIssues.map(getIssueSignature));

  const issues: StoryReorderIssue[] = afterIssues.map((issue) => ({
    ...issue,
    isNew: !beforeIssueSignatures.has(getIssueSignature(issue)),
    suggestedFix: getIssueSuggestedFix(issue),
  }));

  const introducedIssues = issues.filter((issue) => issue.isNew);
  const resolvedIssues = beforeIssues.filter(
    (issue) => !afterIssueSignatures.has(getIssueSignature(issue))
  );

  const introducedErrors = introducedIssues.filter((issue) => issue.severity === 'error').length;
  const introducedWarnings = introducedIssues.filter((issue) => issue.severity === 'warning').length;
  const resolvedErrors = resolvedIssues.filter((issue) => issue.severity === 'error').length;
  const resolvedWarnings = resolvedIssues.filter((issue) => issue.severity === 'warning').length;

  const suggestedFixes = Array.from(
    new Set(
      introducedIssues
        .map((issue) => issue.suggestedFix)
        .filter((fix) => typeof fix === 'string' && fix.trim().length > 0)
    )
  );

  return {
    oldOrder,
    newOrder,
    affectedScenes,
    issues,
    suggestedFixes,
    safeOnCurrentBranch: introducedErrors === 0,
    continuity: {
      before: {
        errors: beforeAnalysis.consistency.errors,
        warnings: beforeAnalysis.consistency.warnings,
        isConsistent: beforeAnalysis.consistency.isConsistent,
      },
      after: {
        errors: afterAnalysis.consistency.errors,
        warnings: afterAnalysis.consistency.warnings,
        isConsistent: afterAnalysis.consistency.isConsistent,
      },
      introduced: {
        errors: introducedErrors,
        warnings: introducedWarnings,
        total: introducedIssues.length,
      },
      resolved: {
        errors: resolvedErrors,
        warnings: resolvedWarnings,
        total: resolvedIssues.length,
      },
    },
  };
};

const toBranchSlug = (value: string): string => {
  const sanitized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized.slice(0, 60);
};

const getUniqueBranchName = (projectData: any, requestedName: string): string => {
  const fallbackBase = `branch-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12)}`;
  const slugBase = toBranchSlug(requestedName) || fallbackBase;
  const existingBranchNames = new Set(
    (projectData.branches || [])
      .map((branch: any) => branch?.name)
      .filter((name: any): name is string => typeof name === 'string' && name.length > 0)
  );

  let nextBranchName = slugBase;
  let suffix = 2;
  while (existingBranchNames.has(nextBranchName)) {
    nextBranchName = `${slugBase}-${suffix}`;
    suffix++;
  }
  return nextBranchName;
};

const SceneGroundingReviewSchema = z.object({
  participantNames: z.array(z.string()).optional(),
  locationName: z.string().optional(),
  significantObjectNames: z.array(z.string()).optional(),
  issues: z.array(z.string()).optional(),
});

const SceneFrameSchema = z.object({
  title: z.string().optional(),
  description: z.string(),
  visual_beat: z.string(),
  participants: z.array(z.string()).optional(),
  participantRefs: z.array(z.object({
    name: z.string(),
    action: z.string().optional(),
    pose: z.string().optional(),
    placement: z.string().optional(),
  })).optional(),
  location: z.string().optional(),
  dialogue: z.array(z.string()).optional(),
  caption: z.string().optional(),
  sfx: z.array(z.string()).optional(),
  shotType: z.string().optional(),
  camera: z.string().optional(),
  mood: z.string().optional(),
  // Structured visual direction (appearance-free, used for image prompts)
  visual_direction: z.object({
    action: z.string(),
    composition: z.string(),
    lighting: z.string(),
    atmosphere: z.string(),
    environment: z.string().optional(),
  }).optional(),
  // Appearance quarantine (NEVER enters image prompt)
  appearance_notes: z.array(z.object({
    name: z.string(),
    details: z.string(),
  })).optional(),
});

const SceneFrameBreakdownSchema = z.object({
  frames: z.array(SceneFrameSchema).min(1),
});

async function reviewSceneGrounding(
  llm: LLMAdapter | null,
  scene: { title?: string; prose?: string; summary?: string; participantNames?: string[]; locationName?: string },
  projectData: any,
  hints?: { requiredParticipants?: string[]; requiredLocation?: string | null; requiredObjects?: string[] }
): Promise<{ participantNames?: string[]; locationName?: string; significantObjectNames?: string[]; issues?: string[] }> {
  if (!llm) return {};
  const prose = scene.prose || scene.summary || '';
  if (!prose) return {};

  const availableEntities = projectData.entities.map((e: any) => `${e.name} (${e.type})`).join(', ');
  const participantList = (scene.participantNames || []).join(', ') || 'None';
  const requiredParticipants = hints?.requiredParticipants?.length ? hints.requiredParticipants.join(', ') : 'None';
  const requiredLocation = hints?.requiredLocation || 'None';
  const requiredObjects = hints?.requiredObjects?.length ? hints.requiredObjects.join(', ') : 'None';

  const prompt = `You are a continuity reviewer. Check the scene for which entities are actually present.

Scene title: ${scene.title || 'Untitled'}
Scene prose: ${prose}

Currently listed participants: ${participantList}
Required participants (must include if present in prose or explicitly requested): ${requiredParticipants}
Required location (if explicitly requested): ${requiredLocation}
Required significant objects (must include as participants if present): ${requiredObjects}

Available entities (use these names exactly if present): ${availableEntities}

Return corrected participants, location, and significantObjectNames based on the prose. Only include entities clearly present in the scene.
If something seems missing or contradictory, note it in issues.`;

  try {
    const review = await llm.generateStructuredOutput(prompt, SceneGroundingReviewSchema, {
      temperature: 0.2,
      maxTokens: 1200,
      modelPreference: 'fast',
    });
    return review || {};
  } catch (error) {
    console.warn('Scene grounding review failed:', error);
    return {};
  }
}

// =============================================================================
// NARRATIVE WORLD TOOLS - For agentic exploration of the narrative graph
// =============================================================================

const narrativeWorldTools: ToolDefinition[] = [
  {
    name: 'get_entity',
    description: 'Look up everything about an entity — description, backstory, traits, secrets, relationships. Use when discussing a specific character, location, or concept.',
    parameters: {
      id: { type: 'string', description: 'Entity ID (preferred)' },
      name: { type: 'string', description: 'Entity name (fuzzy matched)' },
    },
  },
  {
    name: 'query_entities',
    description: 'Find entities by type or keyword. Good for "who are the characters?" or "any locations related to X?"',
    parameters: {
      type: { type: 'string', description: 'Entity type filter (character, location, organization, etc.)' },
      search: { type: 'string', description: 'Search term for name/description' },
      limit: { type: 'number', description: 'Max results (default 10)' },
    },
  },
  {
    name: 'get_relationships',
    description: 'See how an entity connects to the rest of the world — all incoming and outgoing relationships.',
    parameters: {
      entityId: { type: 'string', description: 'Entity ID' },
      entityName: { type: 'string', description: 'Entity name (alternative)' },
    },
  },
  {
    name: 'get_scenes',
    description: 'Find scenes where an entity appears (as participant or location). Good for tracking narrative involvement.',
    parameters: {
      entityId: { type: 'string', description: 'Entity ID' },
      entityName: { type: 'string', description: 'Entity name (alternative)' },
      limit: { type: 'number', description: 'Max scenes (default 5)' },
    },
  },
  {
    name: 'get_commits',
    description: 'See the timeline of world changes — what was added, modified, committed.',
    parameters: {
      branch: { type: 'string', description: 'Branch name (default: current)' },
      limit: { type: 'number', description: 'Max commits (default 10)' },
    },
  },
  {
    name: 'get_branches',
    description: 'See all narrative branches (alternate timelines).',
    parameters: {},
  },
  {
    name: 'search_world',
    description: 'Search across everything — entities, relationships, scene prose. Use for "is there anything about X?" type questions.',
    parameters: {
      query: { type: 'string', description: 'Search text' },
      limit: { type: 'number', description: 'Max results (default 10)' },
    },
  },
  {
    name: 'get_scene',
    description: 'Read a specific scene in full — prose, participants, location, events, frames.',
    parameters: {
      id: { type: 'string', description: 'Scene ID (preferred)' },
      title: { type: 'string', description: 'Scene title (fuzzy matched)' },
    },
  },
  {
    name: 'list_scenes',
    description: 'See the storyboard — all scenes in narrative order with status and participant counts.',
    parameters: {
      status: { type: 'string', description: 'Filter: canon, draft, or all (default: all)' },
      limit: { type: 'number', description: 'Max scenes (default: all)' },
    },
  },
  {
    name: 'get_storyboard',
    description: 'Bird\'s-eye view of the full narrative — scene order, status, top characters, and pacing overview.',
    parameters: {},
  },
  {
    name: 'get_scene_diff',
    description: 'Check what changes between this scene and the previous one — who enters/exits, continuity issues. Essential before editing or inserting scenes.',
    parameters: {
      id: { type: 'string', description: 'Scene ID (preferred)' },
      title: { type: 'string', description: 'Scene title (fuzzy matched)' },
    },
  },
  {
    name: 'get_entity_arc',
    description: 'Trace an entity\'s journey across scenes — when they appear, what happens to them, how they evolve.',
    parameters: {
      entityId: { type: 'string', description: 'Entity ID (preferred)' },
      entityName: { type: 'string', description: 'Entity name (alternative)' },
    },
  },
  {
    name: 'get_story_consistency',
    description: 'Run a continuity check — find timeline errors, orphaned characters, and logic issues.',
    parameters: {},
  },
  {
    name: 'list_scratchpad_documents',
    description: 'See what working notes and reference docs exist (non-canon workspace).',
    parameters: {
      pinnedOnly: { type: 'boolean', description: 'Only show pinned docs' },
      category: { type: 'string', description: 'Filter by category' },
      limit: { type: 'number', description: 'Max docs (default 20)' },
    },
  },
  {
    name: 'read_scratchpad_document',
    description: 'Read a scratchpad note. Check before writing to avoid duplicates.',
    parameters: {
      id: { type: 'string', description: 'Document ID (preferred)' },
      title: { type: 'string', description: 'Document title (alternative)' },
    },
  },
  {
    name: 'write_scratchpad_note',
    description: 'Save working notes, story arcs, or plans to the scratchpad (non-canon, won\'t affect the world graph).',
    parameters: {
      documentId: { type: 'string', description: 'Existing doc ID to update' },
      title: { type: 'string', description: 'Title (required for new docs)' },
      content: { type: 'string', description: 'Content to write' },
      category: { type: 'string', description: 'Category (world_bible, story_arc, character_notes, reference, other)' },
      mode: { type: 'string', description: 'append (default), replace, or create' },
      pin: { type: 'boolean', description: 'Pin into AI context' },
    },
  },
  // --- Visual & Frame Management Tools ---
  {
    name: 'get_scene_frames',
    description: 'Get full frame details for a scene — descriptions, shot types, camera, mood, dialogue, image URLs. Use when discussing specific frames or storyboard structure.',
    parameters: {
      id: { type: 'string', description: 'Scene ID (preferred)' },
      title: { type: 'string', description: 'Scene title (fuzzy matched)' },
    },
  },
  {
    name: 'generate_frames',
    description: 'Generate a frame breakdown for a scene (structure only — titles, descriptions, shot types). Does NOT generate images. Use when the author wants to storyboard a scene.',
    parameters: {
      id: { type: 'string', description: 'Scene ID (preferred)' },
      title: { type: 'string', description: 'Scene title (fuzzy matched)' },
      count: { type: 'number', description: 'Number of frames (default 4, max 12)' },
    },
  },
  {
    name: 'generate_scene_image',
    description: 'Generate the hero image for a scene. YOU write the full prompt verbatim — composition, framing, mood, lighting, environment. Nothing is auto-prepended except the project visual style line (visible in your context). YOU decide which references to attach via referenceEntityNames — pass participants and/or location entities for visual grounding. The result is set as the scene\'s hero image.',
    parameters: {
      id: { type: 'string', description: 'Scene ID (preferred)' },
      title: { type: 'string', description: 'Scene title (fuzzy matched)' },
      prompt: { type: 'string', description: 'The full prompt for the image. Reaches the model verbatim. Include any continuity / mood / camera / aesthetic directives.' },
      referenceEntityNames: { type: 'array', items: { type: 'string' }, description: 'Names of entities to attach as visual references (participants, location, etc.). No references attached if omitted.' },
      referenceAssetNames: { type: 'array', items: { type: 'string' }, description: 'Names of user-uploaded assets to attach as references (character sheets, location refs, style refs). Use list_assets to see what is available.' },
      referenceImageUrls: { type: 'array', items: { type: 'string' }, description: 'Direct image URLs to attach as references (e.g. a previous shot for continuity). Use sparingly.' },
      aspectRatio: { type: 'string', description: 'e.g. "16:9" cinematic (default for scenes), "21:9" ultrawide, "4:3", "3:4". Defaults to 16:9.' },
      model: { type: 'string', description: 'Backend model: "nano-banana" (default, Gemini, fast, strong reference-anchoring for production shots) or "gpt-image" (OpenAI — auto-uses gpt-image-2 for text-only, gpt-image-1 for refs; slower but stronger at long-prompt adherence, initial concept exploration, multi-panel layouts, and text-in-image). Use gpt-image when style is not yet locked or for exploratory boards; nano-banana for production-anchored shots.' },
    },
  },
  {
    name: 'generate_frame_image',
    description: 'Generate an image for a specific storyboard frame. YOU write the full prompt verbatim — composition, framing, mood, lighting, action, camera, identity directives, everything. Nothing is auto-prepended except the project visual style line. YOU decide which references to attach. The frame\'s existing description / visual_direction / blocking are NOT auto-injected — read them from your context (scene-mode shows full per-frame data) and weave whatever you want into your prompt. For continuity with the previous frame, pass that frame\'s image URL in referenceImageUrls.',
    parameters: {
      sceneId: { type: 'string', description: 'Scene ID' },
      sceneTitle: { type: 'string', description: 'Scene title (alternative to sceneId)' },
      frameId: { type: 'string', description: 'Frame ID (preferred when "this frame" is in focus)' },
      frameIndex: { type: 'number', description: 'Frame index (0-based, alternative to frameId)' },
      prompt: { type: 'string', description: 'The full prompt for the image. Reaches the model verbatim.' },
      referenceEntityNames: { type: 'array', items: { type: 'string' }, description: 'Names of entities to attach as visual references (participants in this frame, the location, etc.).' },
      referenceAssetNames: { type: 'array', items: { type: 'string' }, description: 'Names of user-uploaded assets to attach (character sheets, style references). Use list_assets to discover.' },
      referenceImageUrls: { type: 'array', items: { type: 'string' }, description: 'Direct image URLs to attach. Useful for previous-frame continuity (pass the prior frame\'s imageUrl) or any other visual reference.' },
      aspectRatio: { type: 'string', description: 'Defaults to 16:9 (cinematic frame). Override for vertical / square / etc.' },
      model: { type: 'string', description: 'Backend: "nano-banana" (default, Gemini) for production-anchored shots, or "gpt-image" (OpenAI gpt-image-2/-1) for exploratory frame compositions. Nano is right for most frame rendering once style is locked.' },
    },
  },
  {
    name: 'insert_frame',
    description: 'Insert a frame into a scene at a specific position. Use to add new shots, including fully-formed frames with description, visual direction, blocking, dialogue, and participants. Frames behind already-existing frames at the same position shift down. To append at the end, pass a position past the last frame (or omit to append).',
    parameters: {
      sceneId: { type: 'string', description: 'Scene ID' },
      sceneTitle: { type: 'string', description: 'Scene title (alternative)' },
      position: { type: 'number', description: 'Position index to insert at (0 = before first frame). Omit to append at end.' },
      title: { type: 'string', description: 'Short frame title' },
      description: { type: 'string', description: 'Full frame description — what happens in this shot' },
      visualBeat: { type: 'string', description: 'The visual focus / emotional beat of the shot' },
      shotType: { type: 'string', description: 'Shot type (wide, medium, close-up, extreme close-up, OTS, two-shot, insert, establishing)' },
      camera: { type: 'string', description: 'Camera angle / movement (e.g. low-angle, dolly-in, tracking, handheld)' },
      mood: { type: 'string', description: 'Mood / atmosphere' },
      participantNames: { type: 'array', items: { type: 'string' }, description: 'Names of entities present in this frame (resolved to participantIds)' },
      locationName: { type: 'string', description: 'Location entity name for this frame (overrides scene location if specified)' },
      visualDirection: {
        type: 'object',
        description: 'Structured composition guidance: { action, composition, lighting, atmosphere, environment? }',
        properties: {
          action: { type: 'string', description: 'Primary action of the frame' },
          composition: { type: 'string', description: 'e.g. "two-shot", "OTS over Mira"' },
          lighting: { type: 'string', description: 'e.g. "harsh midday", "neon underglow"' },
          atmosphere: { type: 'string', description: 'tone — "tense", "wistful"' },
          environment: { type: 'string', description: 'additional scenery notes' },
        },
      },
      appearanceNotes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Entity name' },
            details: { type: 'string', description: 'Wardrobe, injury, age cues, etc.' },
          },
        },
        description: 'Per-participant appearance pinning — useful for continuity across frames'
      },
      dialogue: { type: 'array', items: { type: 'string' }, description: 'Lines spoken in this frame' },
      caption: { type: 'string', description: 'Caption / narration overlay text' },
      sfx: { type: 'array', items: { type: 'string' }, description: 'Sound effects' },
    },
  },
  {
    name: 'delete_frame',
    description: 'Delete a frame from a scene.',
    parameters: {
      sceneId: { type: 'string', description: 'Scene ID' },
      sceneTitle: { type: 'string', description: 'Scene title (alternative)' },
      frameId: { type: 'string', description: 'Frame ID to delete' },
      frameIndex: { type: 'number', description: 'Frame index (0-based, alternative to frameId)' },
    },
  },
  {
    name: 'update_frame',
    description: 'Update fields on an existing frame. Pass only the fields to change. For frame-by-frame iteration in scene mode, this is the workhorse: refine description, tighten visual direction, swap shot type, adjust dialogue, pin appearance details, etc.',
    parameters: {
      sceneId: { type: 'string', description: 'Scene ID' },
      sceneTitle: { type: 'string', description: 'Scene title (alternative)' },
      frameId: { type: 'string', description: 'Frame ID' },
      frameIndex: { type: 'number', description: 'Frame index (0-based, alternative to frameId)' },
      title: { type: 'string', description: 'New frame title' },
      description: { type: 'string', description: 'New frame description' },
      visualBeat: { type: 'string', description: 'New visual beat' },
      shotType: { type: 'string', description: 'New shot type' },
      camera: { type: 'string', description: 'New camera angle/movement' },
      mood: { type: 'string', description: 'New mood' },
      participantNames: { type: 'array', items: { type: 'string' }, description: 'Replace participant list (resolved to IDs)' },
      addParticipantNames: { type: 'array', items: { type: 'string' }, description: 'Add these participants (deduped)' },
      removeParticipantNames: { type: 'array', items: { type: 'string' }, description: 'Remove these participants' },
      locationName: { type: 'string', description: 'Set location entity by name' },
      visualDirection: {
        type: 'object',
        description: 'Structured composition guidance — replaces the existing visualDirection if set',
        properties: {
          action: { type: 'string' },
          composition: { type: 'string' },
          lighting: { type: 'string' },
          atmosphere: { type: 'string' },
          environment: { type: 'string' },
        },
      },
      appearanceNotes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            details: { type: 'string' },
          },
        },
        description: 'Per-participant appearance pinning (replaces the existing list)'
      },
      dialogue: { type: 'array', items: { type: 'string' }, description: 'Replace dialogue lines' },
      caption: { type: 'string', description: 'New caption' },
      sfx: { type: 'array', items: { type: 'string' }, description: 'Replace sound effects' },
    },
  },
  {
    name: 'generate_portrait',
    description: 'Generate an image and set it as the entity\'s primary portrait. YOU write the full prompt verbatim — composition, framing, mood, wardrobe, lighting, expression, environment, identity directives. The prompt reaches the model as-is; the only auto-applied bit is the project visual style line (visible in your context). YOU decide which references to attach via referenceEntityNames — pass the entity\'s own name to anchor identity to its existing portrait, omit for a fresh take. For multiple alternatives, call this tool multiple times with distinct prompts; the chat groups them inline.',
    parameters: {
      id: { type: 'string', description: 'Entity ID (preferred)' },
      name: { type: 'string', description: 'Entity name (fuzzy matched if ID not provided)' },
      prompt: { type: 'string', description: 'The full prompt. Describe everything you want visible. If anchoring to a reference, say so explicitly (e.g. "use reference image only for facial identity; everything else from this prompt").' },
      referenceEntityNames: { type: 'string', description: 'Comma-separated entity names whose portraits to attach as references. Pass the entity\'s OWN name to anchor identity. Pass other names for cross-references. No references attached if omitted.' },
      referenceEntityIds: { type: 'string', description: 'Comma-separated entity IDs (alternative to names if known)' },
      referenceAssetNames: { type: 'string', description: 'Comma-separated names of user-uploaded assets (character sheets, style references). Use list_assets to discover.' },
      aspectRatio: { type: 'string', description: 'Aspect ratio override, e.g. "1:1" (default), "3:4" portrait, "4:3" landscape, "16:9" widescreen, "2:3" book cover. Defaults to 1:1.' },
      model: { type: 'string', description: 'Backend: "nano-banana" (default, Gemini) for identity-anchored portraits, or "gpt-image" (OpenAI gpt-image-2/-1) for initial concept exploration when style is not yet locked. Nano is usually correct for portraits because reference-anchoring is the whole point.' },
    },
  },
  {
    name: 'edit_image',
    description: 'Edit an existing image (entity portrait, scene image, or frame image) with a natural language instruction. Use when the author asks to modify, tweak, or adjust an existing image.',
    parameters: {
      entityId: { type: 'string', description: 'Target entity ID (for portrait editing)' },
      entityName: { type: 'string', description: 'Target entity name (fuzzy matched)' },
      sceneId: { type: 'string', description: 'Target scene ID (for scene image editing)' },
      sceneTitle: { type: 'string', description: 'Target scene title (fuzzy matched)' },
      frameId: { type: 'string', description: 'Target frame ID (for frame image editing)' },
      frameIndex: { type: 'number', description: 'Target frame index (0-based, alternative to frameId)' },
      editInstruction: { type: 'string', description: 'What to change in the image (e.g. "make them look more weathered", "add rain")' },
    },
  },
  {
    name: 'change_camera_angle',
    description: 'Re-render an existing image from a different camera angle. Use when the author asks to show something from a different perspective, angle, or viewpoint.',
    parameters: {
      entityId: { type: 'string', description: 'Target entity ID (for portrait)' },
      entityName: { type: 'string', description: 'Target entity name (fuzzy matched)' },
      sceneId: { type: 'string', description: 'Target scene ID (for scene image)' },
      sceneTitle: { type: 'string', description: 'Target scene title (fuzzy matched)' },
      frameId: { type: 'string', description: 'Target frame ID (for frame image)' },
      frameIndex: { type: 'number', description: 'Target frame index (0-based, alternative to frameId)' },
      cameraDescription: { type: 'string', description: 'Describe the new camera angle/position (e.g. "bird\'s eye view", "low angle looking up", "close-up on face")' },
    },
  },

  // --- Entity image gallery ---
  // Each entity has a primary portrait (referenceImage) AND an imageGallery —
  // a labeled set of secondary images. Use the gallery for expression sheets,
  // alternate looks, costume variations, mood references, headshots, etc.
  {
    name: 'add_entity_image',
    description: 'Generate and attach a labeled image to an entity\'s gallery (separate from the primary portrait — use generate_portrait for that). YOU write the full prompt and decide which references to attach. The prompt reaches the model verbatim — no "Character portrait, bust shot…" wrapping. The only auto-applied bit is the project visual style line (visible in your context). To anchor identity to the entity\'s existing portrait, pass the entity\'s own name in referenceEntityNames AND say in your prompt how you want the reference used. Use for expression sheets, alternate looks, costume variations, mood references — or any single labeled image you want stored alongside the primary.',
    parameters: {
      id: { type: 'string', description: 'Entity ID (preferred)' },
      name: { type: 'string', description: 'Entity name (fuzzy matched if ID not provided)' },
      label: { type: 'string', description: 'Short caption for this image (e.g. "scowling", "in armor", "wedding day", "wounded"). Required.' },
      prompt: { type: 'string', description: 'The full prompt — composition, framing, pose, expression, wardrobe, lighting, environment, identity directives. Reaches the model verbatim.' },
      mood: { type: 'string', description: 'Optional mood/emotion tag for filtering later' },
      referenceEntityNames: { type: 'string', description: 'Comma-separated names of entities whose portraits to attach as references. Pass the entity\'s OWN name to anchor identity. Pass other names for cross-references. No references attached if omitted.' },
      referenceAssetNames: { type: 'string', description: 'Comma-separated names of user-uploaded assets to attach (character sheets, style references). Use list_assets to discover.' },
      aspectRatio: { type: 'string', description: 'Aspect ratio override, e.g. "1:1" (square portrait, default), "3:4" (portrait), "4:3" (landscape), "16:9" (widescreen). Defaults to 1:1.' },
      model: { type: 'string', description: 'Backend: "nano-banana" (default, Gemini) for identity-anchored gallery shots, or "gpt-image" (OpenAI gpt-image-2/-1) for multi-panel expression sheets / mood boards.' },
    },
    required: ['label'],
  },
  {
    name: 'list_entity_images',
    description: 'See all labeled images in an entity\'s gallery, plus their primary portrait. Useful for picking the right reference for a scene or frame.',
    parameters: {
      id: { type: 'string', description: 'Entity ID' },
      name: { type: 'string', description: 'Entity name (alternative)' },
    },
  },
  {
    name: 'set_primary_portrait',
    description: 'Promote a gallery image to be the entity\'s primary portrait (referenceImage). The previous primary moves into the gallery as a secondary image so nothing is lost.',
    parameters: {
      id: { type: 'string', description: 'Entity ID' },
      name: { type: 'string', description: 'Entity name (alternative)' },
      imageId: { type: 'string', description: 'Gallery image ID to promote (from list_entity_images)' },
    },
  },
  {
    name: 'remove_entity_image',
    description: 'Remove a specific image from an entity\'s gallery. Cannot remove the primary portrait this way (use generate_portrait or set_primary_portrait first).',
    parameters: {
      id: { type: 'string', description: 'Entity ID' },
      name: { type: 'string', description: 'Entity name (alternative)' },
      imageId: { type: 'string', description: 'Gallery image ID to remove' },
    },
  },

  // --- Storyboard generation ---
  // Multi-panel storyboard pages are the pre-production bridge between script
  // and final shots. The AI generates a single image containing N consistent
  // panels for a scene, then individual panels can be extracted as frames
  // and production-rendered with Nano Banana anchored to the panel.
  {
    name: 'generate_storyboard_page',
    description: 'Generate a multi-panel storyboard page from a script chunk. The output is a single image with N panels (default 12) in a grid, each panel a distinct shot of the same continuous scene, rendered in the project\'s locked visual style. Uses GPT Image 1 by default (much stronger at multi-panel layouts than Nano Banana). Use when the user wants to break a script into visual beats, plan shot coverage for a scene, or do storyboard-driven exploration. The storyboard persists as an artifact with format=storyboard_page.',
    parameters: {
      scriptChunk: { type: 'string', description: 'The chunk of script / prose / beat sheet to storyboard. Can be a scene\'s prose, a beat list, or any text describing the sequence of moments to draw.' },
      title: { type: 'string', description: 'Title for the storyboard artifact (e.g. "Scene 3 — Confrontation").' },
      panelCount: { type: 'number', description: 'Number of panels. 6 (2×3), 9 (3×3), 12 (3×4) recommended. Defaults to 12.' },
      sceneId: { type: 'string', description: 'Optional — associate this storyboard with a specific existing scene.' },
      model: { type: 'string', description: 'Backend: "gpt-image" (default, OpenAI gpt-image-2/-1, strongest at multi-panel) or "nano-banana".' },
      aspectRatio: { type: 'string', description: 'Page aspect ratio. Defaults to "2:3" (portrait storyboard page).' },
    },
    required: ['scriptChunk'],
  },
  {
    name: 'extract_storyboard_panel',
    description: 'Extract a specific panel from a storyboard page as a new frame in a scene. If targetSceneId/targetSceneTitle is not provided, a new scene is created to receive the extracted frames. The new frame records its source storyboard + panel index and references the storyboard image — when the user re-renders the frame with generate_frame_image, the storyboard can be passed in referenceImageUrls to anchor the look exactly.',
    parameters: {
      artifactId: { type: 'string', description: 'Storyboard artifact ID' },
      panelIndex: { type: 'number', description: '0-based index of the panel within the storyboard page (top-left = 0, left-to-right then top-to-bottom).' },
      targetSceneId: { type: 'string', description: 'Existing scene to add the frame to. If absent and targetSceneTitle is also absent, a new scene is created.' },
      targetSceneTitle: { type: 'string', description: 'Alternative — fuzzy-match an existing scene by title, or name the new scene if creating one.' },
      frameTitle: { type: 'string', description: 'Title for the extracted frame (defaults to "Panel N").' },
      frameDescription: { type: 'string', description: 'Description for the extracted frame — what this beat is about.' },
      position: { type: 'number', description: 'Position to insert at (default = append at end).' },
    },
    required: ['artifactId', 'panelIndex'],
  },
  {
    name: 'list_storyboards',
    description: 'List all storyboard pages in the project. Returns title, panel count, when it was created, and what scene (if any) it\'s associated with.',
    parameters: {},
  },

  // --- User-uploaded assets ---
  // The author can upload reference material (character sheets, location refs,
  // style references, etc.) outside any specific entity/scene. These tools let
  // you browse the catalog, attach assets to entities, or promote an uploaded
  // image as an entity portrait. Pass asset names in referenceAssetNames on
  // any render tool to use them as visual references.
  {
    name: 'list_assets',
    description: 'List user-uploaded reference assets. Filter by category (character/scene/location/object/style/reference/other) and/or search term. Returns name, category, tags, description, and which entities each is linked to. Use this before referenceAssetNames on a render tool when the author mentions they\'ve uploaded something relevant.',
    parameters: {
      category: { type: 'string', description: 'Filter by category: character, scene, location, object, style, reference, other' },
      search: { type: 'string', description: 'Search term — matches name, description, tags' },
      linkedEntityName: { type: 'string', description: 'Filter to assets linked to a specific entity (by name)' },
    },
  },
  {
    name: 'link_asset_to_entity',
    description: 'Link an uploaded asset to an entity (e.g. attach an uploaded character sheet to that character). The link is bidirectional — the entity records the link too. Does NOT change the entity\'s primary portrait; use promote_asset_to_portrait for that.',
    parameters: {
      assetName: { type: 'string', description: 'Asset name (fuzzy matched)' },
      assetId: { type: 'string', description: 'Asset ID (alternative)' },
      entityName: { type: 'string', description: 'Entity name (fuzzy matched)' },
      entityId: { type: 'string', description: 'Entity ID (alternative)' },
    },
  },
  {
    name: 'promote_asset_to_portrait',
    description: 'Set an uploaded asset as the entity\'s primary portrait (referenceImage). Use when the author uploads a definitive character reference and wants it to be the canonical portrait. Also links the asset to the entity.',
    parameters: {
      assetName: { type: 'string', description: 'Asset name (fuzzy matched)' },
      assetId: { type: 'string', description: 'Asset ID (alternative)' },
      entityName: { type: 'string', description: 'Entity name (fuzzy matched)' },
      entityId: { type: 'string', description: 'Entity ID (alternative)' },
    },
  },
  {
    name: 'tag_asset',
    description: 'Add or replace tags on an uploaded asset. Useful for organizing the asset library so list_assets searches return what you want.',
    parameters: {
      assetName: { type: 'string', description: 'Asset name (fuzzy matched)' },
      assetId: { type: 'string', description: 'Asset ID (alternative)' },
      tags: { type: 'array', items: { type: 'string' }, description: 'New tags. Replaces existing tags.' },
      addTags: { type: 'array', items: { type: 'string' }, description: 'Tags to add (deduped). Use instead of "tags" if you want additive behavior.' },
    },
  },
  {
    name: 'update_asset',
    description: 'Update an asset\'s name, description, or category. Use to rename a generic-titled upload, add notes about what it\'s for, or recategorize it.',
    parameters: {
      assetName: { type: 'string', description: 'Asset name (fuzzy matched)' },
      assetId: { type: 'string', description: 'Asset ID (alternative)' },
      newName: { type: 'string', description: 'New name' },
      description: { type: 'string', description: 'New description / notes about the asset' },
      category: { type: 'string', description: 'New category (character/scene/location/object/style/reference/other)' },
    },
  },
  {
    name: 'delete_asset',
    description: 'Remove an uploaded asset from the project and delete the file from disk. The author should confirm explicitly before you call this.',
    parameters: {
      assetName: { type: 'string', description: 'Asset name (fuzzy matched)' },
      assetId: { type: 'string', description: 'Asset ID (alternative)' },
    },
  },

  // --- Direct world-graph writes ---
  // These tools modify the project immediately when the user explicitly asks
  // for a change. Do NOT also fill the structured-output entities/relationships/
  // scenes arrays for the same change — that creates a duplicate proposal.
  {
    name: 'create_entity',
    description: 'Create a new entity in the world graph directly. Use when the author explicitly asks to add a character, location, object, organization, etc. Do NOT use for casual mentions or speculation — only when the author says something like "add X to the world", "create a new character named Y", or similar explicit intent.',
    parameters: {
      name: { type: 'string', description: 'Entity name (required)' },
      type: { type: 'string', description: 'Entity type: character, location, object, concept, event, organization, creature, faction, artifact' },
      description: { type: 'string', description: 'Vivid, evocative description' },
      backstory: { type: 'string', description: 'History and background' },
      traits: { type: 'array', items: { type: 'string' }, description: 'Defining characteristics' },
      motivations: { type: 'array', items: { type: 'string' }, description: 'What drives them' },
      secrets: { type: 'array', items: { type: 'string' }, description: 'Hidden truths' },
      status: { type: 'string', description: 'Current state (e.g. "alive", "missing", "in hiding")' },
      notes: { type: 'string', description: 'Author notes' },
    },
  },
  {
    name: 'update_entity',
    description: 'Update fields on an existing entity. Use when the author asks to iterate on a character/location/object — change description, refine backstory, add or remove traits, update status, etc. Pass only the fields you want to change. Canon entities can be updated but be respectful of established facts.',
    parameters: {
      id: { type: 'string', description: 'Entity ID (preferred)' },
      name: { type: 'string', description: 'Entity name to look up (fuzzy matched, used if id not given)' },
      newName: { type: 'string', description: 'Rename the entity (use carefully — this is a true rename, not a description change)' },
      newType: { type: 'string', description: 'Change the entity type' },
      description: { type: 'string', description: 'Replace the description' },
      backstory: { type: 'string', description: 'Replace the backstory' },
      traits: { type: 'array', items: { type: 'string' }, description: 'Replace the traits array entirely' },
      addTraits: { type: 'array', items: { type: 'string' }, description: 'Append these traits to the existing list (deduped)' },
      removeTraits: { type: 'array', items: { type: 'string' }, description: 'Remove these traits if present' },
      motivations: { type: 'array', items: { type: 'string' }, description: 'Replace the motivations array' },
      addMotivations: { type: 'array', items: { type: 'string' }, description: 'Append motivations (deduped)' },
      removeMotivations: { type: 'array', items: { type: 'string' }, description: 'Remove motivations' },
      secrets: { type: 'array', items: { type: 'string' }, description: 'Replace the secrets array' },
      addSecrets: { type: 'array', items: { type: 'string' }, description: 'Append secrets (deduped)' },
      removeSecrets: { type: 'array', items: { type: 'string' }, description: 'Remove secrets' },
      status: { type: 'string', description: 'Replace the status string' },
      notes: { type: 'string', description: 'Replace the author notes' },
    },
  },
  {
    name: 'delete_entity',
    description: 'Delete an entity from the world. Also removes any relationships involving it and unlinks it from any scene participant lists. Use when the author explicitly asks to remove something. By default, blocks deletion of canon entities; pass force=true if the author confirms they want to remove a canon entity anyway.',
    parameters: {
      id: { type: 'string', description: 'Entity ID (preferred)' },
      name: { type: 'string', description: 'Entity name (fuzzy matched, used if id not given)' },
      force: { type: 'boolean', description: 'Override canon protection. Default false.' },
    },
  },
  {
    name: 'create_relationship',
    description: 'Create a relationship edge between two entities. Use when the author establishes a connection ("Silas knows Mira secretly", "the Wardens hunt the Hollows").',
    parameters: {
      sourceName: { type: 'string', description: 'Source entity name (fuzzy matched)' },
      sourceId: { type: 'string', description: 'Source entity ID (alternative to sourceName)' },
      targetName: { type: 'string', description: 'Target entity name (fuzzy matched)' },
      targetId: { type: 'string', description: 'Target entity ID (alternative to targetName)' },
      type: { type: 'string', description: 'Relationship type, e.g. "knows", "hunts", "owns", "loves", "fears", "betrayed_by"' },
      description: { type: 'string', description: 'Story behind the connection' },
    },
  },
  {
    name: 'update_relationship',
    description: 'Update an existing relationship — change its type, description, or strength. Use when the author refines how two entities relate.',
    parameters: {
      id: { type: 'string', description: 'Relationship ID (required)' },
      type: { type: 'string', description: 'New relationship type' },
      description: { type: 'string', description: 'New description' },
      strength: { type: 'number', description: 'Optional 0..1 strength' },
    },
  },
  {
    name: 'delete_relationship',
    description: 'Delete a relationship between two entities.',
    parameters: {
      id: { type: 'string', description: 'Relationship ID (required)' },
    },
  },
  {
    name: 'create_scene',
    description: 'Add a new scene directly to the storyboard. Use when the author asks you to write a scene and commit it ("write the confrontation and add it"). For drafts the author hasn\'t yet asked to commit, prefer prose in your reply and let them decide.',
    parameters: {
      title: { type: 'string', description: 'Scene title (required)' },
      prose: { type: 'string', description: 'Full narrative prose (required)' },
      summary: { type: 'string', description: 'Short summary' },
      participantNames: { type: 'array', items: { type: 'string' }, description: 'Names of entities present in the scene (resolved to IDs; missing names are skipped with a warning)' },
      locationName: { type: 'string', description: 'Location entity name' },
      events: { type: 'array', items: { type: 'string' }, description: 'Key story beats' },
      stateChanges: { type: 'array', items: { type: 'string' }, description: 'How the world changes from this scene' },
      position: { type: 'number', description: 'Position index in the storyboard (default: end)' },
      insertAfterTitle: { type: 'string', description: 'Insert after a specific scene by title (alternative to position)' },
      status: { type: 'string', description: 'Scene status: "draft" or "canon" (default: draft)' },
    },
  },
  {
    name: 'update_scene',
    description: 'Update fields on an existing scene — title, prose, summary, participants, location, events. Use when the author iterates on a scene ("rewrite this with more tension", "add Mira to the scene").',
    parameters: {
      id: { type: 'string', description: 'Scene ID (preferred)' },
      title: { type: 'string', description: 'Scene title to look up (fuzzy matched, used if id not given)' },
      newTitle: { type: 'string', description: 'Rename the scene' },
      prose: { type: 'string', description: 'Replace the prose' },
      summary: { type: 'string', description: 'Replace the summary' },
      participantNames: { type: 'array', items: { type: 'string' }, description: 'Replace participant list (resolves names to IDs)' },
      addParticipantNames: { type: 'array', items: { type: 'string' }, description: 'Add these participants (deduped, resolved to IDs)' },
      removeParticipantNames: { type: 'array', items: { type: 'string' }, description: 'Remove these participants' },
      locationName: { type: 'string', description: 'Set the location (resolves to a location entity)' },
      events: { type: 'array', items: { type: 'string' }, description: 'Replace the events list' },
      stateChanges: { type: 'array', items: { type: 'string' }, description: 'Replace the state-change list' },
      status: { type: 'string', description: 'Set status to "draft" or "canon"' },
    },
  },
  {
    name: 'delete_scene',
    description: 'Delete a scene from the storyboard. Use when the author asks to remove a scene.',
    parameters: {
      id: { type: 'string', description: 'Scene ID (preferred)' },
      title: { type: 'string', description: 'Scene title (fuzzy matched, alternative to id)' },
    },
  },

  // --- Artifacts (diegetic media) ---
  // Time covers, articles, memos, social posts, transcripts, product pages,
  // websites — media objects that exist as if real in the world. Free-form
  // format string (recommended values: magazine_cover, article, memo,
  // social_post, transcript, product_page, video_script, audio_script,
  // broadcast, document, website, other) and a flexible content bag.
  {
    name: 'create_artifact',
    description: 'Create a new diegetic media artifact in the world (Time cover, article, memo, social post, product page, etc.). The artifact\'s actual visual is a generated image — it lives in primaryImage after generate_artifact_image runs. The content field is OPTIONAL metadata (headline strings, key facts) used for search and indexing, NOT the rendered artifact. Don\'t laboriously fill content; put the real text into the image-generation prompt instead — Nano Banana renders text in images well.',
    parameters: {
      title: { type: 'string', description: 'Working title (e.g. "Time: The Last Inventor")' },
      format: { type: 'string', description: 'Free-form format — recommended: magazine_cover, article, memo, social_post, transcript, product_page, video_script, audio_script, broadcast, document, website, other' },
      description: { type: 'string', description: 'One-paragraph description of what this artifact is and its role in the world.' },
      publication: { type: 'string', description: 'In-world publication / source (e.g. "Time", "Oneirocom Internal")' },
      byline: { type: 'string', description: 'In-world author' },
      inWorldDate: { type: 'string', description: 'When this exists in story time (e.g. "March 2033")' },
      relatedEntityNames: { type: 'array', items: { type: 'string' }, description: 'Names of world entities this artifact references — their portraits become identity references for the generated image.' },
      relatedSceneTitles: { type: 'array', items: { type: 'string' }, description: 'Scene titles this artifact relates to (optional).' },
      content: {
        type: 'object',
        description: 'OPTIONAL. Lightweight metadata for search/indexing only — keep this minimal. Examples: { headline, subhead } for a magazine cover, { dek, summary } for an article. Do NOT dump full article body text here; that text goes into the image-generation prompt where Nano Banana renders it onto the page.',
      },
      status: { type: 'string', description: '"draft" or "published" (default draft)' },
    },
    required: ['title', 'format'],
  },
  {
    name: 'update_artifact',
    description: 'Update fields on an existing artifact. Pass only the fields to change.',
    parameters: {
      id: { type: 'string', description: 'Artifact ID (preferred)' },
      title: { type: 'string', description: 'Look up by title (fuzzy, alternative to id)' },
      newTitle: { type: 'string', description: 'Rename the artifact' },
      description: { type: 'string' },
      publication: { type: 'string' },
      byline: { type: 'string' },
      inWorldDate: { type: 'string' },
      relatedEntityNames: { type: 'array', items: { type: 'string' } },
      content: { type: 'object', description: 'Replace or extend the content bag. Existing keys are merged with the new values.' },
      contentMode: { type: 'string', description: '"merge" (default — patch existing content) or "replace" (overwrite content entirely)' },
      status: { type: 'string', description: '"draft" or "published"' },
    },
  },
  {
    name: 'delete_artifact',
    description: 'Delete an artifact.',
    parameters: {
      id: { type: 'string' },
      title: { type: 'string', description: 'Fuzzy title alternative' },
    },
  },
  {
    name: 'list_artifacts',
    description: 'List artifacts in the project, optionally filtered.',
    parameters: {
      format: { type: 'string', description: 'Filter to a specific format (magazine_cover, article, etc.)' },
      relatedEntityName: { type: 'string', description: 'Filter to artifacts that reference this entity.' },
      limit: { type: 'number' },
    },
  },
  {
    name: 'get_artifact',
    description: 'Read a specific artifact in full — content, related entities, image.',
    parameters: {
      id: { type: 'string' },
      title: { type: 'string', description: 'Fuzzy title alternative' },
    },
  },
  {
    name: 'generate_artifact_image',
    description: 'Generate the visual for an artifact. THIS is where the artifact actually comes alive — Nano Banana renders the entire thing as an image including all text. YOU write the comprehensive design brief and decide which references to attach. Nothing is auto-prepended except the project visual style line (which you can see in your context). Put EVERYTHING that should appear visible in the prompt: layout, masthead/wordmark, headline, subhead, byline, dateline, body paragraphs, captions, drop caps, photo placement, fonts/style direction, brand cues. For composite multi-panel images (casting sheets, mood boards, character lineups, expression strips), describe the grid/layout in the prompt and pass the relevant entities in referenceEntityNames.',
    parameters: {
      id: { type: 'string' },
      title: { type: 'string', description: 'Fuzzy title alternative' },
      prompt: {
        type: 'string',
        description: 'The full design brief. Describe layout, all visible text (headlines, body copy, captions, datelines), photo placement, fonts, brand cues. Examples:\n\n• Magazine cover: "TIME magazine cover. Red border masthead with TIME wordmark in white. Cover photo: center-framed close-up of [character]. Top headline in bold serif: \'THE LAST INVENTOR\'. Subhead in smaller white serif: \'How one man\'s silence saved the world we forgot to save\'. Bottom-right dateline: \'March 27, 2033\'."\n\n• Casting sheet: "Casting sheet, 2x3 grid of head-and-shoulders headshots of the same actor. Each headshot in a different mood: 1. SMILING (bright, casual), 2. SCOWLING (intense, dim), 3. WEARY (low light, slumped), 4. FOCUSED (neutral studio), 5. LAUGHING, 6. DETERMINED. Clean studio backdrop, neutral background. Labels in white sans-serif beneath each shot. Use reference image only for facial identity; vary expression/lighting/wardrobe per shot."\n\n• Memo: "Internal memorandum. Letterhead at top. From: ..., To: ..., Subject: .... Body text: <full memo body>. Signature block bottom."\n\nWrite the prompt as if directing a designer who will execute it exactly.'
      },
      referenceEntityNames: { type: 'array', items: { type: 'string' }, description: 'Names of entities whose portraits to attach as references. Pass whichever entities should visually inform the artifact (e.g. for a Time cover featuring Parzival: ["Parzival Wayland"]). No references are auto-attached from the artifact\'s relatedEntityIds — you decide explicitly.' },
      referenceAssetNames: { type: 'array', items: { type: 'string' }, description: 'Names of user-uploaded assets to attach (style references, location refs, etc.). Use list_assets to discover.' },
      aspectRatio: { type: 'string', description: 'e.g. "3:4" magazine cover, "16:9" screen/widescreen, "1:1" social, "4:5" article portrait, "2:3" book cover. Defaults: 3:4 for magazine_cover, 16:9 for video/broadcast, 1:1 otherwise.' },
      model: { type: 'string', description: 'Backend: "gpt-image" (default & recommended for artifacts — OpenAI gpt-image-2/-1 renders text-in-image at ~99% character accuracy, which is the entire point of artifacts) or "nano-banana" (only when reference-anchoring an entity portrait into the artifact matters more than text fidelity).' },
    },
    required: ['id'],
  },

  // --- Batch proposals (review-then-accept flow) ---
  // These create pending proposals the author reviews in a single pass, instead
  // of committing one at a time. Use when we've vibed something out together
  // and the author says "lock these in" / "propose all of these" / "save what
  // we discussed" — i.e. an explicit batch-confirm intent. Don't use these for
  // single, immediate changes the author already explicitly asked for; for
  // those, call the direct create_/update_/delete_ tools.
  {
    name: 'propose_entities',
    description: 'Stage a batch of entity additions / updates as pending proposals for the author to review and accept in one pass. Existing entities (by name) become update proposals; new names become add proposals. Use when the author says "lock in everything we discussed" or wants to review a batch before it lands in canon.',
    parameters: {
      entities: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Entity name' },
            type: { type: 'string', description: 'Entity type: character, location, object, concept, event, organization, creature, faction, artifact' },
            description: { type: 'string', description: 'Vivid, evocative description' },
            backstory: { type: 'string' },
            traits: { type: 'array', items: { type: 'string' } },
            motivations: { type: 'array', items: { type: 'string' } },
            secrets: { type: 'array', items: { type: 'string' } },
            status: { type: 'string' },
            notes: { type: 'string' },
          },
        },
        description: 'Array of entities to propose. At minimum each needs name and type.',
      },
    },
  },
  {
    name: 'propose_relationships',
    description: 'Stage a batch of relationship additions as pending proposals. Source/target are matched by name (fuzzy). Use when the author wants to review a set of connections before committing.',
    parameters: {
      relationships: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            sourceName: { type: 'string' },
            targetName: { type: 'string' },
            type: { type: 'string', description: 'Relationship type, e.g. "knows", "hunts", "loves"' },
            description: { type: 'string' },
            strength: { type: 'number', description: '0..1' },
          },
        },
      },
    },
  },
  {
    name: 'propose_scenes',
    description: 'Stage a batch of scenes as pending proposals. Each scene needs title and prose; participants and location are resolved by name. Use when sketching out a sequence of scenes the author wants to review before committing.',
    parameters: {
      scenes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            prose: { type: 'string' },
            summary: { type: 'string' },
            participantNames: { type: 'array', items: { type: 'string' } },
            locationName: { type: 'string' },
            events: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  },
];

// Tool executor - runs the actual tool logic against project data
function createToolExecutor(projectId: string, projectData: any, session: any) {
  // Helper: resolve a flexible image target (entity, scene, or frame) from tool args
  // Resolve a list of asset names (or comma-separated string) to their URLs.
  // Names match case-insensitively, with substring fallback. Unknown names
  // are silently skipped — the AI gets a count of references attached and
  // can introspect via list_assets if it needs more detail.
  const resolveAssetUrlsByNames = (input: unknown): string[] => {
    const assets = Array.isArray(projectData.assets) ? projectData.assets : [];
    const names: string[] = Array.isArray(input)
      ? input.map(String)
      : typeof input === 'string'
        ? input.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
    const urls: string[] = [];
    for (const n of names) {
      const lower = n.toLowerCase();
      const found = assets.find((a: any) =>
        (a.name || '').toLowerCase() === lower ||
        (a.name || '').toLowerCase().includes(lower)
      );
      if (found?.url && !urls.includes(found.url)) urls.push(found.url);
    }
    return urls;
  };

  const resolveImageTarget = (args: Record<string, any>): { type: string; imageUrl: string; label: string; entity?: any; scene?: any; frame?: any; aspectRatio?: string } | { error: string } => {
    const { entityId, entityName, sceneId, sceneTitle, frameId, frameIndex } = args;
    const entities = projectData.entities || [];
    const interactions = projectData.interactions || [];

    // Try entity first
    if (entityId || entityName) {
      let entity: any = null;
      if (entityId) {
        entity = entities.find((e: any) => e.id === entityId);
      } else if (entityName) {
        const lower = entityName.toLowerCase();
        entity = entities.find((e: any) =>
          (e.name || '').toLowerCase() === lower ||
          (e.name || '').toLowerCase().includes(lower)
        );
      }
      if (!entity) return { error: `Entity not found: ${entityId || entityName}` };
      if (!entity.referenceImage) return { error: `Entity "${entity.name}" has no portrait image to edit` };
      return { type: 'entity', imageUrl: entity.referenceImage, label: entity.name, entity, aspectRatio: '1:1' };
    }

    // Try scene (with optional frame)
    if (sceneId || sceneTitle) {
      let scene: any = null;
      if (sceneId) {
        scene = interactions.find((i: any) => i.id === sceneId);
      } else if (sceneTitle) {
        const lower = sceneTitle.toLowerCase();
        scene = interactions.find((i: any) =>
          (i.title || '').toLowerCase() === lower ||
          (i.title || '').toLowerCase().includes(lower)
        );
      }
      if (!scene) return { error: `Scene not found: ${sceneId || sceneTitle}` };

      // Check for frame target
      if (frameId || typeof frameIndex === 'number') {
        const frames = scene.frames || [];
        let frame: any = null;
        if (frameId) {
          frame = frames.find((f: any) => f.id === frameId);
        } else if (typeof frameIndex === 'number') {
          frame = frames[frameIndex];
        }
        if (!frame) return { error: `Frame not found in scene "${scene.title}"` };
        if (!frame.imageUrl) return { error: `Frame "${frame.title || frame.id}" has no image to edit` };
        return { type: 'frame', imageUrl: frame.imageUrl, label: `${scene.title} — ${frame.title || 'frame'}`, scene, frame };
      }

      if (!scene.imageUrl) return { error: `Scene "${scene.title}" has no image to edit` };
      return { type: 'scene', imageUrl: scene.imageUrl, label: scene.title, scene };
    }

    return { error: 'No target specified. Provide entityId/entityName, sceneId/sceneTitle, or frameId/frameIndex.' };
  };

  return async (toolName: string, args: Record<string, any>): Promise<any> => {
    switch (toolName) {
      case 'get_entity': {
        const { id, name } = args;
        let entity = null;

        if (id) {
          entity = projectData.entities.find((e: any) => e.id === id);
        } else if (name) {
          // Fuzzy match by name
          const lowerName = name.toLowerCase();
          entity = projectData.entities.find((e: any) =>
            e.name.toLowerCase() === lowerName ||
            e.name.toLowerCase().includes(lowerName)
          );
        }

        if (!entity) {
          return { error: `Entity not found: ${id || name}`, availableEntities: projectData.entities.slice(0, 5).map((e: any) => ({ id: e.id, name: e.name, type: e.type })) };
        }

        // Get relationships for this entity
        const relationships = projectData.relationships.filter((r: any) =>
          r.source === entity.id || r.target === entity.id ||
          r.sourceName === entity.name || r.targetName === entity.name
        );

        const entityImagePart = loadEntityImagePart(entity, `Portrait of ${entity.name}`);
        const _imageParts = entityImagePart ? [entityImagePart] : undefined;

        return {
          entity: {
            id: entity.id,
            name: entity.name,
            type: entity.type,
            description: entity.description,
            backstory: entity.backstory,
            traits: entity.traits,
            motivations: entity.motivations,
            secrets: entity.secrets,
            status: entity.status,
            notes: entity.notes,
            hasPortrait: Boolean(entityImagePart),
          },
          relationships: relationships.map((r: any) => ({
            type: r.type,
            direction: r.source === entity.id ? 'outgoing' : 'incoming',
            otherEntity: r.source === entity.id ? r.targetName : r.sourceName,
            description: r.description,
          })),
          isCanon: session.canonEntityIds?.has(entity.id) || false,
          ...(_imageParts ? { _imageParts } : {}),
        };
      }

      case 'query_entities': {
        const { type, search, limit = 10 } = args;
        let results = [...projectData.entities];

        if (type) {
          results = results.filter((e: any) => e.type === type);
        }

        if (search) {
          const lowerSearch = search.toLowerCase();
          results = results.filter((e: any) =>
            e.name.toLowerCase().includes(lowerSearch) ||
            e.description?.toLowerCase().includes(lowerSearch)
          );
        }

        return {
          count: results.length,
          entities: results.slice(0, limit).map((e: any) => ({
            id: e.id,
            name: e.name,
            type: e.type,
            description: e.description?.slice(0, 200) + (e.description?.length > 200 ? '...' : ''),
            isCanon: session.canonEntityIds?.has(e.id) || false,
          })),
        };
      }

      case 'get_relationships': {
        const { entityId, entityName } = args;
        let targetId = entityId;

        if (!targetId && entityName) {
          const entity = projectData.entities.find((e: any) =>
            e.name.toLowerCase().includes(entityName.toLowerCase())
          );
          targetId = entity?.id;
        }

        if (!targetId) {
          return { error: 'Entity not found', relationships: [] };
        }

        const relationships = projectData.relationships.filter((r: any) =>
          r.source === targetId || r.target === targetId
        );

        return {
          entityId: targetId,
          relationships: relationships.map((r: any) => ({
            id: r.id,
            type: r.type,
            source: r.sourceName || r.source,
            target: r.targetName || r.target,
            description: r.description,
            strength: r.strength,
          })),
        };
      }

      case 'get_scenes': {
        const { entityId, entityName, limit = 5 } = args;
        let scenes = projectData.interactions || [];

        if (entityId || entityName) {
          // Find entity by ID or name for matching
          const targetEntity = entityId
            ? projectData.entities.find((e: any) => e.id === entityId)
            : projectData.entities.find((e: any) =>
                e.name.toLowerCase() === entityName?.toLowerCase() ||
                e.name.toLowerCase().includes(entityName?.toLowerCase() || '')
              );

          const targetId = targetEntity?.id || entityId;
          const targetName = targetEntity?.name || entityName;

          scenes = scenes.filter((s: any) => {
            // Check participantIds (array of string IDs - most common format)
            if (s.participantIds?.includes(targetId)) return true;

            // Check participants (could be array of objects or strings)
            if (s.participants) {
              if (Array.isArray(s.participants)) {
                for (const p of s.participants) {
                  if (typeof p === 'string' && (p === targetId || p === targetName)) return true;
                  if (typeof p === 'object' && (p.id === targetId || p.name === targetName)) return true;
                }
              }
            }

            // Check if entity is the location
            if (s.locationId === targetId || s.location === targetId) return true;

            return false;
          });
        }

        // Resolve participant names from IDs
        const resolveParticipants = (scene: any): string[] => {
          const ids = scene.participantIds || scene.participants || [];
          return ids.map((idOrObj: any) => {
            if (typeof idOrObj === 'string') {
              const entity = projectData.entities.find((e: any) => e.id === idOrObj);
              return entity?.name || idOrObj;
            }
            return idOrObj.name || idOrObj.id;
          });
        };

        return {
          count: scenes.length,
          scenes: scenes.slice(0, limit).map((s: any) => ({
            id: s.id,
            title: s.title || s.summary,
            prose: s.prose?.slice(0, 200) + (s.prose?.length > 200 ? '...' : ''),
            status: s.status,
            participants: resolveParticipants(s),
            location: s.locationId ? projectData.entities.find((e: any) => e.id === s.locationId)?.name : null,
          })),
        };
      }

      case 'get_commits': {
        const { branch, limit = 10 } = args;
        let commits = projectData.commits || [];

        if (branch) {
          commits = commits.filter((c: any) => c.branch === branch);
        }

        // Sort by timestamp descending
        commits = commits.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));

        return {
          branch: branch || session.currentBranch || 'main',
          count: commits.length,
          commits: commits.slice(0, limit).map((c: any) => ({
            id: c.id,
            hash: c.hash,
            message: c.message,
            branch: c.branch,
            timestamp: c.timestamp,
            entityCount: c.entityCount || c.stats?.entities,
            author: c.author,
          })),
        };
      }

      case 'get_branches': {
        const branches = projectData.branches || [];
        return {
          currentBranch: session.currentBranch || 'main',
          branches: branches.map((b: any) => ({
            id: b.id,
            name: b.name,
            description: b.description,
            isActive: b.isActive,
            isCanon: b.isCanon,
            probability: b.probability,
            commitCount: b.commitCount,
            lastCommit: b.lastCommit,
            parentBranch: b.parentBranch,
          })),
        };
      }

      case 'search_world': {
        const { query, limit = 10 } = args;
        const lowerQuery = query.toLowerCase();
        const results: any[] = [];

        // Search entities
        for (const entity of projectData.entities) {
          if (
            entity.name.toLowerCase().includes(lowerQuery) ||
            entity.description?.toLowerCase().includes(lowerQuery) ||
            entity.backstory?.toLowerCase().includes(lowerQuery)
          ) {
            results.push({
              type: 'entity',
              entityType: entity.type,
              id: entity.id,
              name: entity.name,
              matchedIn: entity.name.toLowerCase().includes(lowerQuery) ? 'name' : 'description',
              preview: entity.description?.slice(0, 150),
            });
          }
        }

        // Search relationships
        for (const rel of projectData.relationships) {
          if (rel.description?.toLowerCase().includes(lowerQuery)) {
            results.push({
              type: 'relationship',
              id: rel.id,
              name: `${rel.sourceName} → ${rel.targetName}`,
              matchedIn: 'description',
              preview: rel.description?.slice(0, 150),
            });
          }
        }

        // Search scenes - include prose, content, summary, and title
        for (const scene of (projectData.interactions || [])) {
          const titleMatch = scene.title?.toLowerCase().includes(lowerQuery);
          const summaryMatch = scene.summary?.toLowerCase().includes(lowerQuery);
          const proseMatch = scene.prose?.toLowerCase().includes(lowerQuery);
          const contentMatch = scene.content?.toLowerCase().includes(lowerQuery);
          const descMatch = scene.description?.toLowerCase().includes(lowerQuery);

          if (titleMatch || summaryMatch || proseMatch || contentMatch || descMatch) {
            // Determine what matched and get best preview
            let matchedIn = 'content';
            let preview = '';
            if (titleMatch) {
              matchedIn = 'title';
              preview = scene.summary || scene.prose?.slice(0, 150) || scene.description?.slice(0, 150) || '';
            } else if (proseMatch) {
              matchedIn = 'prose';
              // Find the matching section in prose for context
              const proseText = scene.prose || '';
              const matchIndex = proseText.toLowerCase().indexOf(lowerQuery);
              const start = Math.max(0, matchIndex - 50);
              const end = Math.min(proseText.length, matchIndex + query.length + 100);
              preview = (start > 0 ? '...' : '') + proseText.slice(start, end) + (end < proseText.length ? '...' : '');
            } else if (contentMatch) {
              matchedIn = 'content';
              const contentText = scene.content || '';
              const matchIndex = contentText.toLowerCase().indexOf(lowerQuery);
              const start = Math.max(0, matchIndex - 50);
              const end = Math.min(contentText.length, matchIndex + query.length + 100);
              preview = (start > 0 ? '...' : '') + contentText.slice(start, end) + (end < contentText.length ? '...' : '');
            } else if (summaryMatch) {
              matchedIn = 'summary';
              preview = scene.summary?.slice(0, 150) || '';
            } else {
              matchedIn = 'description';
              preview = scene.description?.slice(0, 150) || '';
            }

            results.push({
              type: 'scene',
              id: scene.id,
              name: scene.title || scene.summary || 'Untitled Scene',
              status: scene.status,
              matchedIn,
              preview,
            });
          }
        }

        return {
          query,
          totalResults: results.length,
          results: results.slice(0, limit),
        };
      }

      case 'get_scene': {
        const { id, title } = args;
        let scene = null;

        if (id) {
          scene = (projectData.interactions || []).find((s: any) => s.id === id);
        } else if (title) {
          const lowerTitle = title.toLowerCase();
          scene = (projectData.interactions || []).find((s: any) =>
            s.title?.toLowerCase() === lowerTitle ||
            s.title?.toLowerCase().includes(lowerTitle) ||
            s.summary?.toLowerCase().includes(lowerTitle)
          );
        }

        if (!scene) {
          return {
            error: `Scene not found: ${id || title}`,
            availableScenes: (projectData.interactions || []).slice(0, 5).map((s: any) => ({
              id: s.id,
              title: s.title || s.summary || 'Untitled',
            })),
          };
        }

        // Resolve participant names
        const participantIds = scene.participantIds || scene.participants || [];
        const participants = participantIds.map((idOrObj: any) => {
          if (typeof idOrObj === 'string') {
            const entity = projectData.entities.find((e: any) => e.id === idOrObj);
            return entity ? { id: idOrObj, name: entity.name, type: entity.type } : { id: idOrObj, name: idOrObj };
          }
          return idOrObj;
        });

        // Resolve location
        const locationId = scene.locationId || scene.location;
        const location = locationId
          ? projectData.entities.find((e: any) => e.id === locationId)
          : null;

        // Attach the scene image, location reference, and a couple of
        // participant portraits so the model can actually see the scene.
        const sceneImageParts: ImagePart[] = [];
        const sceneTitleLabel = scene.title || scene.summary || 'Untitled scene';
        if (scene.imageUrl) {
          const sceneImg = loadImagePart(scene.imageUrl, `Scene image: "${sceneTitleLabel}"`);
          if (sceneImg) sceneImageParts.push(sceneImg);
        }
        if (location) {
          const locImg = loadEntityImagePart(location, `Location reference: ${location.name}`);
          if (locImg) sceneImageParts.push(locImg);
        }
        const PARTICIPANT_IMAGE_LIMIT = 3;
        let participantImagesAdded = 0;
        for (const p of participants) {
          if (participantImagesAdded >= PARTICIPANT_IMAGE_LIMIT) break;
          const ent = projectData.entities.find((e: any) => e.id === p.id);
          if (!ent) continue;
          const portrait = loadEntityImagePart(ent, `Participant: ${ent.name}`);
          if (portrait) {
            sceneImageParts.push(portrait);
            participantImagesAdded++;
          }
        }

        return {
          scene: {
            id: scene.id,
            title: sceneTitleLabel,
            prose: scene.prose,
            content: scene.content,
            summary: scene.summary,
            status: scene.status,
            events: scene.events,
            participants,
            location: location ? { id: location.id, name: location.name } : null,
            position: scene.position,
            createdAt: scene.createdAt,
            frameCount: scene.frames?.length || 0,
            hasImage: Boolean(scene.imageUrl),
            storyDiff: scene.storyDiff,
          },
          ...(sceneImageParts.length > 0 ? { _imageParts: sceneImageParts } : {}),
        };
      }

      case 'list_scenes': {
        const { status, limit } = args;
        let scenes = projectData.interactions || [];

        // Sort by position, then createdAt
        scenes = scenes.sort((a: any, b: any) => {
          if (a.position !== undefined && b.position !== undefined) {
            return a.position - b.position;
          }
          return (a.createdAt || 0) - (b.createdAt || 0);
        });

        // Filter by status if specified
        if (status && status !== 'all') {
          scenes = scenes.filter((s: any) => s.status === status);
        }

        // Apply limit if specified
        if (limit && limit > 0) {
          scenes = scenes.slice(0, limit);
        }

        return {
          totalScenes: scenes.length,
          scenes: scenes.map((s: any, idx: number) => ({
            position: idx + 1,
            id: s.id,
            title: s.title || s.summary || 'Untitled',
            status: s.status || 'draft',
            participantCount: (s.participantIds || s.participants || []).length,
            hasImage: !!s.imageUrl,
            continuityIssues: s.storyDiff?.issueCount || 0,
          })),
        };
      }

      case 'get_storyboard': {
        const scenes = (projectData.interactions || []).sort((a: any, b: any) => {
          if (a.position !== undefined && b.position !== undefined) {
            return a.position - b.position;
          }
          return (a.createdAt || 0) - (b.createdAt || 0);
        });

        const canonScenes = scenes.filter((s: any) => s.status === 'canon');
        const draftScenes = scenes.filter((s: any) => s.status !== 'canon');

        // Build participant frequency map
        const participantCounts: Record<string, number> = {};
        for (const scene of scenes) {
          const ids = scene.participantIds || scene.participants || [];
          for (const id of ids) {
            const entityId = typeof id === 'string' ? id : id.id;
            participantCounts[entityId] = (participantCounts[entityId] || 0) + 1;
          }
        }

        // Get top participants
        const topParticipants = Object.entries(participantCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([id, count]) => {
            const entity = projectData.entities.find((e: any) => e.id === id);
            return { name: entity?.name || id, sceneCount: count };
          });

        return {
          overview: {
            totalScenes: scenes.length,
            canonScenes: canonScenes.length,
            draftScenes: draftScenes.length,
            topParticipants,
          },
          storyboard: scenes.map((s: any, idx: number) => ({
            position: idx + 1,
            id: s.id,
            title: s.title || s.summary || 'Untitled',
            status: s.status || 'draft',
            preview: (s.prose || s.content || s.summary || '').slice(0, 80) + '...',
            continuityIssues: s.storyDiff?.issueCount || 0,
          })),
        };
      }

      case 'get_scene_diff': {
        const { id, title } = args;
        const analysis = buildStoryGraphAnalysis(projectData);
        let diff: StorySceneDiff | undefined;
        if (id) {
          diff = analysis.sceneDiffs.find((sceneDiff) => sceneDiff.sceneId === id);
        } else if (title) {
          const lowerTitle = title.toLowerCase();
          diff = analysis.sceneDiffs.find((sceneDiff) =>
            sceneDiff.sceneTitle.toLowerCase() === lowerTitle
            || sceneDiff.sceneTitle.toLowerCase().includes(lowerTitle)
          );
        }

        if (!diff) {
          return {
            error: `Scene diff not found: ${id || title}`,
            availableScenes: analysis.sceneDiffs.slice(0, 8).map((sceneDiff) => ({
              id: sceneDiff.sceneId,
              title: sceneDiff.sceneTitle,
              position: sceneDiff.position,
            })),
          };
        }

        return {
          sceneDiff: diff,
        };
      }

      case 'get_entity_arc': {
        const { entityId, entityName } = args;
        const analysis = buildStoryGraphAnalysis(projectData);
        let targetId = entityId;
        if (!targetId && entityName) {
          const resolved = resolveEntityByName(projectData, entityName);
          targetId = resolved?.id;
        }

        if (!targetId || !analysis.entityArcs[targetId]) {
          return {
            error: `Entity arc not found: ${entityId || entityName}`,
            availableEntities: Object.values(analysis.entityArcs).slice(0, 10).map((arc) => ({
              entityId: arc.entityId,
              entityName: arc.entityName,
              entries: arc.entries.length,
            })),
          };
        }

        return {
          entityArc: analysis.entityArcs[targetId],
        };
      }

      case 'get_story_consistency': {
        const analysis = buildStoryGraphAnalysis(projectData);
        return {
          consistency: analysis.consistency,
          sceneCount: analysis.sceneCount,
          issuesByScene: analysis.sceneDiffs
            .filter((sceneDiff) => sceneDiff.continuityIssues.length > 0)
            .map((sceneDiff) => ({
              sceneId: sceneDiff.sceneId,
              sceneTitle: sceneDiff.sceneTitle,
              issueCount: sceneDiff.continuityIssues.length,
            })),
        };
      }

      case 'list_scratchpad_documents': {
        const { pinnedOnly = false, category, limit = 20 } = args;
        const allDocs = ensureScratchpadDocuments(projectData)
          .map(normalizeScratchpadDocument)
          .sort((a, b) => {
            if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
            return (b.updatedAt || 0) - (a.updatedAt || 0);
          });
        const normalizedCategory = category ? normalizeScratchpadCategory(category) : null;
        const filtered = allDocs.filter((doc) => {
          if (pinnedOnly && !doc.isPinned) return false;
          if (normalizedCategory && doc.category !== normalizedCategory) return false;
          return true;
        });
        return {
          totalDocuments: filtered.length,
          documents: filtered.slice(0, Math.max(1, Number(limit) || 20)).map((doc) => ({
            id: doc.id,
            title: doc.title,
            category: doc.category,
            isPinned: doc.isPinned,
            updatedAt: doc.updatedAt,
            preview: doc.content.slice(0, 180) + (doc.content.length > 180 ? '...' : ''),
          })),
        };
      }

      case 'read_scratchpad_document': {
        const { id, title } = args;
        const documents = ensureScratchpadDocuments(projectData).map(normalizeScratchpadDocument);
        let found: any = null;
        if (id && typeof id === 'string') {
          found = documents.find((doc) => doc.id === id);
        } else if (title && typeof title === 'string') {
          const needle = title.trim().toLowerCase();
          found = documents.find((doc) => doc.title.toLowerCase() === needle)
            || documents.find((doc) => doc.title.toLowerCase().includes(needle));
        }
        if (!found) {
          return {
            error: `Scratchpad document not found: ${id || title}`,
            available: documents.slice(0, 10).map((doc) => ({
              id: doc.id,
              title: doc.title,
              category: doc.category,
              isPinned: doc.isPinned,
            })),
          };
        }
        return {
          document: found,
        };
      }

      case 'write_scratchpad_note': {
        const {
          documentId,
          title,
          content,
          category,
          mode = 'append',
          pin,
        } = args || {};

        const documents = ensureScratchpadDocuments(projectData);
        const normalizedMode = typeof mode === 'string' ? mode.toLowerCase() : 'append';
        const noteContent = typeof content === 'string' ? content.trim() : '';
        if (!noteContent && normalizedMode !== 'create') {
          return { error: 'content is required for write_scratchpad_note' };
        }

        let targetIndex = -1;
        if (typeof documentId === 'string' && documentId.trim().length > 0) {
          targetIndex = documents.findIndex((doc: any) => doc.id === documentId.trim());
        } else if (typeof title === 'string' && title.trim().length > 0 && normalizedMode !== 'create') {
          const loweredTitle = title.trim().toLowerCase();
          targetIndex = documents.findIndex((doc: any) => (doc.title || '').toLowerCase() === loweredTitle);
        }

        const now = Date.now();
        if (targetIndex === -1 || normalizedMode === 'create') {
          const docTitle = typeof title === 'string' && title.trim().length > 0
            ? title.trim()
            : 'Scratchpad Note';
          const created = normalizeScratchpadDocument({
            id: `doc_${now}_${Math.random().toString(36).substr(2, 9)}`,
            title: docTitle,
            content: noteContent,
            category: normalizeScratchpadCategory(category),
            isPinned: typeof pin === 'boolean' ? pin : false,
            source: 'assistant',
            createdAt: now,
            updatedAt: now,
          });
          documents.push(created);
          saveProjectData(projectId, projectData);
          return {
            action: 'created',
            document: created,
          };
        }

        const existing = normalizeScratchpadDocument(documents[targetIndex]);
        const incomingContent = typeof content === 'string' ? content : '';
        const mergedContent = normalizedMode === 'replace'
          ? incomingContent
          : (existing.content.trim().length > 0
            ? `${existing.content}\n\n${incomingContent}`
            : incomingContent);
        const updated = normalizeScratchpadDocument({
          ...existing,
          ...(typeof title === 'string' && title.trim().length > 0 ? { title: title.trim() } : {}),
          content: mergedContent,
          ...(category !== undefined ? { category: normalizeScratchpadCategory(category) } : {}),
          ...(typeof pin === 'boolean' ? { isPinned: pin } : {}),
          source: 'assistant',
          updatedAt: now,
        });
        documents[targetIndex] = updated;
        saveProjectData(projectId, projectData);
        return {
          action: 'updated',
          mode: normalizedMode === 'replace' ? 'replace' : 'append',
          document: updated,
        };
      }

      // --- Visual & Frame Management Tool Executors ---

      case 'get_scene_frames': {
        const { id, title } = args;
        const scenes = projectData.interactions || [];
        let scene: any = null;
        if (id) {
          scene = scenes.find((s: any) => s.id === id);
        } else if (title) {
          const lower = title.toLowerCase();
          scene = scenes.find((s: any) =>
            (s.title || '').toLowerCase() === lower ||
            (s.title || '').toLowerCase().includes(lower)
          );
        }
        if (!scene) return { error: `Scene not found: ${id || title}` };
        if (!scene.frames || scene.frames.length === 0) {
          return { sceneId: scene.id, sceneTitle: scene.title, frames: [], message: 'No frames yet. Generate a frame breakdown first.' };
        }

        // Attach up to N rendered frame images so the model can actually see
        // the existing storyboard rather than just reading frame descriptions.
        const FRAME_IMAGE_LIMIT = 6;
        const frameImageParts: ImagePart[] = [];
        let framesAttached = 0;
        for (let idx = 0; idx < scene.frames.length; idx++) {
          if (framesAttached >= FRAME_IMAGE_LIMIT) break;
          const f = scene.frames[idx];
          if (!f?.imageUrl) continue;
          const part = loadImagePart(f.imageUrl, `Frame ${idx + 1}: ${f.title || 'Untitled'}`);
          if (part) {
            frameImageParts.push(part);
            framesAttached++;
          }
        }

        return {
          sceneId: scene.id,
          sceneTitle: scene.title,
          frameCount: scene.frames.length,
          frames: scene.frames.map((f: any, idx: number) => ({
            id: f.id,
            position: idx,
            title: f.title || `Frame ${idx + 1}`,
            description: f.description,
            visual_beat: f.visual_beat,
            shotType: f.shotType,
            camera: f.camera,
            mood: f.mood,
            dialogue: f.dialogue,
            caption: f.caption,
            sfx: f.sfx,
            imageUrl: f.imageUrl || null,
            visualDirty: f.visualDirty || false,
            visual_direction: f.visual_direction || undefined,
            appearance_notes: f.appearance_notes || undefined,
          })),
          ...(frameImageParts.length > 0 ? { _imageParts: frameImageParts } : {}),
        };
      }

      case 'generate_frames': {
        const { id, title, count = 4 } = args;
        const scenes = projectData.interactions || [];
        let scene: any = null;
        if (id) {
          scene = scenes.find((s: any) => s.id === id);
        } else if (title) {
          const lower = title.toLowerCase();
          scene = scenes.find((s: any) =>
            (s.title || '').toLowerCase() === lower ||
            (s.title || '').toLowerCase().includes(lower)
          );
        }
        if (!scene) return { error: `Scene not found: ${id || title}` };

        try {
          const resp = await fetch(`http://localhost:${PORT}/api/narrative/interactions/${scene.id}/frames`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId, count: Math.min(Math.max(Number(count) || 4, 1), 12) }),
          });
          if (!resp.ok) {
            const errBody = await resp.text();
            return { error: `Frame generation failed: ${errBody}` };
          }
          const result = await resp.json();
          return {
            visualToolUsed: true,
            sceneId: scene.id,
            sceneTitle: scene.title,
            frameCount: result.frames?.length || 0,
            message: `Generated ${result.frames?.length || 0} frames for "${scene.title}".`,
          };
        } catch (err: any) {
          return { error: `Frame generation failed: ${err.message}` };
        }
      }

      case 'generate_scene_image': {
        const { id, title, prompt, referenceEntityNames, referenceAssetNames, referenceImageUrls, aspectRatio, model } = args;
        if (!prompt || typeof prompt !== 'string') {
          return { error: 'prompt is required — describe the shot fully' };
        }
        const scenes = projectData.interactions || [];
        let scene: any = null;
        if (id) scene = scenes.find((s: any) => s.id === id);
        else if (title) {
          const lower = title.toLowerCase();
          scene = scenes.find((s: any) =>
            (s.title || '').toLowerCase() === lower ||
            (s.title || '').toLowerCase().includes(lower)
          );
        }
        if (!scene) return { error: `Scene not found: ${id || title}` };

        // Resolve referenceEntityNames → URLs
        const refUrls: string[] = [];
        const entities = projectData.entities || [];
        if (Array.isArray(referenceEntityNames)) {
          for (const n of referenceEntityNames) {
            const lower = String(n).toLowerCase();
            const ent = entities.find((e: any) =>
              (e.name || '').toLowerCase() === lower || (e.name || '').toLowerCase().includes(lower)
            );
            const url = ent?.referenceImage || ent?.imageUrl;
            if (url && !refUrls.includes(url)) refUrls.push(url);
          }
        }
        for (const u of resolveAssetUrlsByNames(referenceAssetNames)) {
          if (!refUrls.includes(u)) refUrls.push(u);
        }
        if (Array.isArray(referenceImageUrls)) {
          for (const u of referenceImageUrls) {
            if (typeof u === 'string' && u && !refUrls.includes(u)) refUrls.push(u);
          }
        }

        try {
          const resp = await fetch(`http://localhost:${PORT}/api/narrative/visual/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              prompt,
              ...(refUrls.length > 0 ? { referenceUrls: refUrls } : {}),
              aspectRatio: aspectRatio || '16:9',
              ...(model ? { model } : {}),
            }),
          });
          if (!resp.ok) return { error: `Scene image generation failed: ${await resp.text()}` };
          const result = await resp.json();
          const imageUrl = result.imageUrl;
          if (!imageUrl) return { error: 'Scene image generation produced no image' };

          // Persist directly — write the new imageUrl onto the scene in projectData
          const sceneIdx = projectData.interactions.findIndex((s: any) => s.id === scene.id);
          if (sceneIdx >= 0) {
            projectData.interactions[sceneIdx].imageUrl = imageUrl;
            projectData.interactions[sceneIdx].updatedAt = new Date().toISOString();
            saveProjectData(projectId, projectData);
          }

          const part = loadImagePart(imageUrl, `New scene image: "${scene.title}"`);
          return {
            visualToolUsed: true,
            sceneId: scene.id,
            sceneTitle: scene.title,
            imageUrl,
            backend: result.backend,
            referencesAttachedCount: refUrls.length,
            referencesAttached: result.referencesAttached,
            styleDirectiveApplied: result.styleDirectiveApplied,
            actualPromptSent: result.actualPromptSent,
            message: `Generated hero image for "${scene.title}". (Backend: ${result.backend}, ${refUrls.length} refs, style directive ${result.styleDirectiveApplied ? 'applied' : 'not applied'}.)`,
            ...(part ? { _imageParts: [part] } : {}),
          };
        } catch (err: any) {
          return { error: `Scene image generation failed: ${err.message}` };
        }
      }

      case 'generate_frame_image': {
        const { sceneId, sceneTitle, frameId, frameIndex, prompt, referenceEntityNames, referenceAssetNames, referenceImageUrls, aspectRatio, model } = args;
        if (!prompt || typeof prompt !== 'string') {
          return { error: 'prompt is required — describe the shot fully (composition, action, mood, lighting, etc.)' };
        }
        const scenes = projectData.interactions || [];
        let scene: any = null;
        if (sceneId) scene = scenes.find((s: any) => s.id === sceneId);
        else if (sceneTitle) {
          const lower = sceneTitle.toLowerCase();
          scene = scenes.find((s: any) =>
            (s.title || '').toLowerCase() === lower ||
            (s.title || '').toLowerCase().includes(lower)
          );
        }
        if (!scene) return { error: `Scene not found: ${sceneId || sceneTitle}` };
        if (!scene.frames || scene.frames.length === 0) return { error: 'Scene has no frames. Use insert_frame to add one first.' };

        let targetFrame: any = null;
        if (frameId) {
          targetFrame = scene.frames.find((f: any) => f.id === frameId);
        } else if (typeof frameIndex === 'number') {
          targetFrame = scene.frames[frameIndex];
        } else {
          targetFrame = scene.frames.find((f: any) => !f.imageUrl);
        }
        if (!targetFrame) return { error: 'Frame not found.' };

        // Resolve refs
        const refUrls: string[] = [];
        const entities = projectData.entities || [];
        if (Array.isArray(referenceEntityNames)) {
          for (const n of referenceEntityNames) {
            const lower = String(n).toLowerCase();
            const ent = entities.find((e: any) =>
              (e.name || '').toLowerCase() === lower || (e.name || '').toLowerCase().includes(lower)
            );
            const url = ent?.referenceImage || ent?.imageUrl;
            if (url && !refUrls.includes(url)) refUrls.push(url);
          }
        }
        for (const u of resolveAssetUrlsByNames(referenceAssetNames)) {
          if (!refUrls.includes(u)) refUrls.push(u);
        }
        if (Array.isArray(referenceImageUrls)) {
          for (const u of referenceImageUrls) {
            if (typeof u === 'string' && u && !refUrls.includes(u)) refUrls.push(u);
          }
        }

        try {
          const resp = await fetch(`http://localhost:${PORT}/api/narrative/visual/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              prompt,
              ...(refUrls.length > 0 ? { referenceUrls: refUrls } : {}),
              aspectRatio: aspectRatio || '16:9',
              ...(model ? { model } : {}),
            }),
          });
          if (!resp.ok) return { error: `Frame image generation failed: ${await resp.text()}` };
          const result = await resp.json();
          const imageUrl = result.imageUrl;
          if (!imageUrl) return { error: 'Frame image generation produced no image' };

          // Persist directly to the frame in projectData
          const sceneIdx = projectData.interactions.findIndex((s: any) => s.id === scene.id);
          if (sceneIdx >= 0) {
            const frame = (projectData.interactions[sceneIdx].frames || []).find((f: any) => f.id === targetFrame.id);
            if (frame) {
              frame.imageUrl = imageUrl;
              frame.lastImageAt = new Date().toISOString();
              if (prompt) frame.lastImagePrompt = prompt;
              // Clear visual-dirty markers since this is a fresh render
              frame.visualDirty = false;
              projectData.interactions[sceneIdx].updatedAt = new Date().toISOString();
              saveProjectData(projectId, projectData);
            }
          }

          const part = loadImagePart(imageUrl, `New frame image: "${targetFrame.title || targetFrame.id}"`);
          return {
            visualToolUsed: true,
            sceneId: scene.id,
            frameId: targetFrame.id,
            frameTitle: targetFrame.title,
            imageUrl,
            backend: result.backend,
            referencesAttachedCount: refUrls.length,
            referencesAttached: result.referencesAttached,
            styleDirectiveApplied: result.styleDirectiveApplied,
            actualPromptSent: result.actualPromptSent,
            message: `Generated image for frame "${targetFrame.title || targetFrame.id}". (Backend: ${result.backend}, ${refUrls.length} refs, style directive ${result.styleDirectiveApplied ? 'applied' : 'not applied'}.)`,
            ...(part ? { _imageParts: [part] } : {}),
          };
        } catch (err: any) {
          return { error: `Frame image generation failed: ${err.message}` };
        }
      }

      case 'insert_frame': {
        const {
          sceneId, sceneTitle, position,
          title, description, visualBeat,
          shotType, camera, mood,
          participantNames, locationName,
          visualDirection, appearanceNotes,
          dialogue, caption, sfx,
        } = args;
        const scenes = projectData.interactions || [];
        let scene: any = null;
        if (sceneId) {
          scene = scenes.find((s: any) => s.id === sceneId);
        } else if (sceneTitle) {
          const lower = sceneTitle.toLowerCase();
          scene = scenes.find((s: any) =>
            (s.title || '').toLowerCase() === lower ||
            (s.title || '').toLowerCase().includes(lower)
          );
        }
        if (!scene) return { error: `Scene not found: ${sceneId || sceneTitle}` };

        // Resolve names → IDs (fall back to scene defaults if unresolvable)
        const entities = projectData.entities || [];
        const findEntityByName = (n: string) => {
          const lower = String(n).toLowerCase();
          return entities.find((e: any) =>
            (e.name || '').toLowerCase() === lower || (e.name || '').toLowerCase().includes(lower)
          );
        };
        const participantIds: string[] = [];
        const unresolvedNames: string[] = [];
        if (Array.isArray(participantNames)) {
          for (const n of participantNames) {
            const e = findEntityByName(n);
            if (e) participantIds.push(e.id); else unresolvedNames.push(String(n));
          }
        }
        let frameLocationId: string | undefined;
        if (locationName) {
          const loc = findEntityByName(locationName);
          if (loc) frameLocationId = loc.id;
          else unresolvedNames.push(String(locationName));
        }

        const frames = [...(scene.frames || [])];
        const insertIdx = typeof position === 'number'
          ? Math.min(Math.max(0, position), frames.length)
          : frames.length;

        const newFrame: any = {
          id: `frame_${scene.id}_${Date.now()}_ai`,
          position: insertIdx,
          title: title || '',
          description: description || '',
          ...(visualBeat ? { visual_beat: visualBeat } : {}),
          ...(shotType ? { shotType } : {}),
          ...(camera ? { camera } : {}),
          ...(mood ? { mood } : {}),
          ...(participantIds.length > 0 ? { participantIds } : {}),
          ...(frameLocationId ? { locationId: frameLocationId } : {}),
          ...(visualDirection && typeof visualDirection === 'object' ? { visual_direction: visualDirection } : {}),
          ...(Array.isArray(appearanceNotes) && appearanceNotes.length > 0 ? { appearance_notes: appearanceNotes } : {}),
          ...(Array.isArray(dialogue) && dialogue.length > 0 ? { dialogue } : {}),
          ...(caption ? { caption } : {}),
          ...(Array.isArray(sfx) && sfx.length > 0 ? { sfx } : {}),
        };
        frames.splice(insertIdx, 0, newFrame);
        frames.forEach((f: any, i: number) => { f.position = i; });
        scene.frames = frames;
        scene.updatedAt = new Date().toISOString();
        saveProjectData(projectId, projectData);

        return {
          visualToolUsed: true,
          sceneId: scene.id,
          insertedFrame: { id: newFrame.id, position: insertIdx, title: newFrame.title },
          totalFrames: frames.length,
          ...(unresolvedNames.length > 0 ? { unresolvedNames } : {}),
          message: `Inserted frame at position ${insertIdx + 1} in "${scene.title}" (${frames.length} total).${unresolvedNames.length > 0 ? ` Could not resolve: ${unresolvedNames.join(', ')}.` : ''}`,
        };
      }

      case 'delete_frame': {
        const { sceneId, sceneTitle, frameId, frameIndex } = args;
        const scenes = projectData.interactions || [];
        let scene: any = null;
        if (sceneId) {
          scene = scenes.find((s: any) => s.id === sceneId);
        } else if (sceneTitle) {
          const lower = sceneTitle.toLowerCase();
          scene = scenes.find((s: any) =>
            (s.title || '').toLowerCase() === lower ||
            (s.title || '').toLowerCase().includes(lower)
          );
        }
        if (!scene) return { error: `Scene not found: ${sceneId || sceneTitle}` };
        if (!scene.frames || scene.frames.length === 0) return { error: 'Scene has no frames.' };

        let deleteIdx = -1;
        if (frameId) {
          deleteIdx = scene.frames.findIndex((f: any) => f.id === frameId);
        } else if (typeof frameIndex === 'number') {
          deleteIdx = frameIndex;
        }
        if (deleteIdx < 0 || deleteIdx >= scene.frames.length) return { error: 'Frame not found.' };

        const deleted = scene.frames[deleteIdx];
        scene.frames.splice(deleteIdx, 1);
        scene.frames.forEach((f: any, i: number) => { f.position = i; });
        saveProjectData(projectId, projectData);

        return {
          visualToolUsed: true,
          sceneId: scene.id,
          deletedFrame: { id: deleted.id, title: deleted.title },
          remainingFrames: scene.frames.length,
          message: `Deleted frame "${deleted.title || deleted.id}" from "${scene.title}". ${scene.frames.length} frames remaining.`,
        };
      }

      case 'update_frame': {
        const {
          sceneId, sceneTitle, frameId, frameIndex,
          title, description, visualBeat,
          shotType, camera, mood,
          participantNames, addParticipantNames, removeParticipantNames,
          locationName,
          visualDirection, appearanceNotes,
          dialogue, caption, sfx,
        } = args;
        const scenes = projectData.interactions || [];
        let scene: any = null;
        if (sceneId) {
          scene = scenes.find((s: any) => s.id === sceneId);
        } else if (sceneTitle) {
          const lower = sceneTitle.toLowerCase();
          scene = scenes.find((s: any) =>
            (s.title || '').toLowerCase() === lower ||
            (s.title || '').toLowerCase().includes(lower)
          );
        }
        if (!scene) return { error: `Scene not found: ${sceneId || sceneTitle}` };
        if (!scene.frames || scene.frames.length === 0) return { error: 'Scene has no frames.' };

        let targetFrame: any = null;
        if (frameId) {
          targetFrame = scene.frames.find((f: any) => f.id === frameId);
        } else if (typeof frameIndex === 'number') {
          targetFrame = scene.frames[frameIndex];
        }
        if (!targetFrame) return { error: 'Frame not found.' };

        const entities = projectData.entities || [];
        const findEntityByName = (n: string) => {
          const lower = String(n).toLowerCase();
          return entities.find((e: any) =>
            (e.name || '').toLowerCase() === lower || (e.name || '').toLowerCase().includes(lower)
          );
        };
        const unresolvedNames: string[] = [];
        const changes: string[] = [];

        if (title !== undefined) { targetFrame.title = title; changes.push('title'); }
        if (description !== undefined) { targetFrame.description = description; changes.push('description'); }
        if (visualBeat !== undefined) { targetFrame.visual_beat = visualBeat; changes.push('visual_beat'); }
        if (shotType !== undefined) { targetFrame.shotType = shotType; changes.push('shotType'); }
        if (camera !== undefined) { targetFrame.camera = camera; changes.push('camera'); }
        if (mood !== undefined) { targetFrame.mood = mood; changes.push('mood'); }

        if (Array.isArray(participantNames)) {
          const ids: string[] = [];
          for (const n of participantNames) {
            const e = findEntityByName(n);
            if (e) ids.push(e.id); else unresolvedNames.push(String(n));
          }
          targetFrame.participantIds = ids;
          changes.push(`participants replaced (${ids.length})`);
        } else {
          if (Array.isArray(addParticipantNames) && addParticipantNames.length > 0) {
            const current = new Set<string>(targetFrame.participantIds || []);
            let added = 0;
            for (const n of addParticipantNames) {
              const e = findEntityByName(n);
              if (!e) { unresolvedNames.push(String(n)); continue; }
              if (!current.has(e.id)) { current.add(e.id); added++; }
            }
            targetFrame.participantIds = Array.from(current);
            if (added > 0) changes.push(`+${added} participant(s)`);
          }
          if (Array.isArray(removeParticipantNames) && removeParticipantNames.length > 0) {
            const removeIds = new Set<string>();
            for (const n of removeParticipantNames) {
              const e = findEntityByName(n);
              if (e) removeIds.add(e.id); else unresolvedNames.push(String(n));
            }
            const before = (targetFrame.participantIds || []).length;
            targetFrame.participantIds = (targetFrame.participantIds || []).filter((p: string) => !removeIds.has(p));
            const removed = before - (targetFrame.participantIds || []).length;
            if (removed > 0) changes.push(`-${removed} participant(s)`);
          }
        }

        if (locationName !== undefined) {
          const loc = findEntityByName(locationName);
          if (loc) {
            targetFrame.locationId = loc.id;
            changes.push(`location: ${loc.name}`);
          } else {
            unresolvedNames.push(locationName);
          }
        }

        if (visualDirection && typeof visualDirection === 'object') {
          targetFrame.visual_direction = visualDirection;
          changes.push('visual_direction');
        }
        if (Array.isArray(appearanceNotes)) {
          targetFrame.appearance_notes = appearanceNotes;
          changes.push('appearance_notes');
        }
        if (Array.isArray(dialogue)) {
          targetFrame.dialogue = dialogue;
          changes.push('dialogue');
        }
        if (caption !== undefined) {
          targetFrame.caption = caption;
          changes.push('caption');
        }
        if (Array.isArray(sfx)) {
          targetFrame.sfx = sfx;
          changes.push('sfx');
        }

        if (changes.length === 0) {
          return { worldWriteApplied: false, sceneId: scene.id, message: 'No fields to update.' };
        }

        scene.updatedAt = new Date().toISOString();
        saveProjectData(projectId, projectData);

        return {
          worldWriteApplied: true,
          sceneId: scene.id,
          frameId: targetFrame.id,
          changes,
          ...(unresolvedNames.length > 0 ? { unresolvedNames } : {}),
          message: `Updated frame "${targetFrame.title || targetFrame.id}" in "${scene.title}": ${changes.join(', ')}${unresolvedNames.length > 0 ? `. Could not resolve: ${unresolvedNames.join(', ')}` : ''}.`,
        };
      }

      case 'generate_portrait': {
        const { id, name: entityName, prompt, referenceEntityIds, referenceEntityNames, referenceAssetNames, aspectRatio, model } = args;
        const entities = projectData.entities || [];
        let entity: any = null;
        if (id) {
          entity = entities.find((e: any) => e.id === id);
        } else if (entityName) {
          const lower = entityName.toLowerCase();
          entity = entities.find((e: any) =>
            (e.name || '').toLowerCase() === lower ||
            (e.name || '').toLowerCase().includes(lower)
          );
        }
        if (!entity) return { error: `Entity not found: ${id || entityName}` };

        // Reference resolution is fully driven by what the AI passed.
        const referenceUrls: string[] = [];
        const resolveRef = (refEntity: any) => {
          const url = refEntity?.referenceImage || refEntity?.imageUrl;
          if (url && !referenceUrls.includes(url)) referenceUrls.push(url);
        };
        if (referenceEntityIds) {
          for (const refId of String(referenceEntityIds).split(',').map(s => s.trim()).filter(Boolean)) {
            resolveRef(entities.find((e: any) => e.id === refId));
          }
        }
        if (referenceEntityNames) {
          for (const refName of String(referenceEntityNames).split(',').map(s => s.trim()).filter(Boolean)) {
            const lower = refName.toLowerCase();
            resolveRef(entities.find((e: any) =>
              (e.name || '').toLowerCase() === lower || (e.name || '').toLowerCase().includes(lower)
            ));
          }
        }
        for (const u of resolveAssetUrlsByNames(referenceAssetNames)) {
          if (!referenceUrls.includes(u)) referenceUrls.push(u);
        }

        try {
          // Route through /render so the AI's prompt reaches the model verbatim.
          // The old /entity/:id endpoint wraps prompts in "Character portrait,
          // bust shot..." templates, which fight any non-portrait intent
          // (casting sheets, full-body shots, dynamic poses, etc.).
          const resp = await fetch(`http://localhost:${PORT}/api/narrative/visual/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              prompt: prompt || `Portrait of ${entity.name}${entity.description ? ': ' + entity.description : ''}`,
              ...(referenceUrls.length > 0 ? { referenceUrls } : {}),
              ...(aspectRatio ? { aspectRatio } : {}),
              ...(model ? { model } : {}),
            }),
          });
          if (!resp.ok) return { error: `Portrait generation failed: ${await resp.text()}` };
          const result = await resp.json();
          const imageUrl: string | undefined = result.imageUrl;
          if (!imageUrl) return { error: 'Portrait generation produced no image' };

          try {
            await fetch(`http://localhost:${PORT}/api/narrative/entity/${entity.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                updates: {
                  referenceImage: imageUrl,
                  imageUrl,
                  ...(prompt ? { portraitPrompt: prompt } : {}),
                },
              }),
            });
          } catch (persistErr) {
            console.error('Failed to persist portrait to entity:', persistErr);
          }

          const newImagePart = loadImagePart(imageUrl, `New portrait of ${entity.name}`);
          return {
            visualToolUsed: true,
            entityId: entity.id,
            entityName: entity.name,
            imageUrl,
            backend: result.backend,
            referencesAttachedCount: referenceUrls.length,
            referencesAttached: result.referencesAttached,
            styleDirectiveApplied: result.styleDirectiveApplied,
            actualPromptSent: result.actualPromptSent,
            message: `Generated portrait for "${entity.name}". (Backend: ${result.backend}, ${referenceUrls.length} refs, style directive ${result.styleDirectiveApplied ? 'applied' : 'not applied'}.)`,
            ...(newImagePart ? { _imageParts: [newImagePart] } : {}),
          };
        } catch (err: any) {
          return { error: `Portrait generation failed: ${err.message}` };
        }
      }

      case 'edit_image': {
        const { editInstruction } = args;
        if (!editInstruction) return { error: 'editInstruction is required' };

        const target = resolveImageTarget(args);
        if ('error' in target) return target;

        try {
          const resp = await fetch(`http://localhost:${PORT}/api/narrative/visual/edit-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrl: target.imageUrl,
              editInstruction,
              aspectRatio: target.aspectRatio,
              projectId,
            }),
          });
          if (!resp.ok) {
            const errBody = await resp.text();
            return { error: `Image edit failed: ${errBody}` };
          }
          const result = await resp.json();
          const newImageUrl = result.imageUrl;

          // Persist result back to the source
          if (newImageUrl) {
            if (target.type === 'entity' && target.entity) {
              await fetch(`http://localhost:${PORT}/api/narrative/entity/${target.entity.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updates: { referenceImage: newImageUrl, imageUrl: newImageUrl } }),
              });
            } else if (target.type === 'scene' && target.scene) {
              const sceneIdx = projectData.interactions.findIndex((i: any) => i.id === target.scene.id);
              if (sceneIdx >= 0) {
                projectData.interactions[sceneIdx].imageUrl = newImageUrl;
                saveProjectData(projectId, projectData);
              }
            } else if (target.type === 'frame' && target.scene && target.frame) {
              const sceneIdx = projectData.interactions.findIndex((i: any) => i.id === target.scene.id);
              if (sceneIdx >= 0) {
                const frame = (projectData.interactions[sceneIdx].frames || []).find((f: any) => f.id === target.frame.id);
                if (frame) {
                  frame.imageUrl = newImageUrl;
                  saveProjectData(projectId, projectData);
                }
              }
            }
          }

          const editedImagePart = newImageUrl
            ? loadImagePart(newImageUrl, `Edited image for ${target.label} (just generated)`)
            : null;

          return {
            visualToolUsed: true,
            targetType: target.type,
            label: target.label,
            imageUrl: newImageUrl,
            message: `Edited image for "${target.label}": ${editInstruction}`,
            ...(editedImagePart ? { _imageParts: [editedImagePart] } : {}),
          };
        } catch (err: any) {
          return { error: `Image edit failed: ${err.message}` };
        }
      }

      case 'change_camera_angle': {
        const { cameraDescription } = args;
        if (!cameraDescription) return { error: 'cameraDescription is required' };

        const target = resolveImageTarget(args);
        if ('error' in target) return target;

        try {
          const resp = await fetch(`http://localhost:${PORT}/api/narrative/visual/camera-angle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrl: target.imageUrl,
              cameraDescription,
              aspectRatio: target.aspectRatio,
              // Pass scene data for character-grounded re-rendering
              sceneData: target.scene ? {
                id: target.scene.id,
                title: target.scene.title,
                prose: target.scene.prose || target.scene.description,
                participantIds: target.scene.participantIds,
                locationId: target.scene.locationId,
                frames: target.scene.frames,
              } : undefined,
              projectId,
            }),
          });
          if (!resp.ok) {
            const errBody = await resp.text();
            return { error: `Camera angle change failed: ${errBody}` };
          }
          const result = await resp.json();
          const newImageUrl = result.imageUrl;

          // Persist result back to the source
          if (newImageUrl) {
            if (target.type === 'entity' && target.entity) {
              await fetch(`http://localhost:${PORT}/api/narrative/entity/${target.entity.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updates: { referenceImage: newImageUrl, imageUrl: newImageUrl } }),
              });
            } else if (target.type === 'scene' && target.scene) {
              const sceneIdx = projectData.interactions.findIndex((i: any) => i.id === target.scene.id);
              if (sceneIdx >= 0) {
                projectData.interactions[sceneIdx].imageUrl = newImageUrl;
                saveProjectData(projectId, projectData);
              }
            } else if (target.type === 'frame' && target.scene && target.frame) {
              const sceneIdx = projectData.interactions.findIndex((i: any) => i.id === target.scene.id);
              if (sceneIdx >= 0) {
                const frame = (projectData.interactions[sceneIdx].frames || []).find((f: any) => f.id === target.frame.id);
                if (frame) {
                  frame.imageUrl = newImageUrl;
                  saveProjectData(projectId, projectData);
                }
              }
            }
          }

          const angleImagePart = newImageUrl
            ? loadImagePart(newImageUrl, `New angle for ${target.label} (just generated)`)
            : null;

          return {
            visualToolUsed: true,
            targetType: target.type,
            label: target.label,
            imageUrl: newImageUrl,
            cameraDescription,
            message: `Changed camera angle for "${target.label}" to: ${cameraDescription}`,
            ...(angleImagePart ? { _imageParts: [angleImagePart] } : {}),
          };
        } catch (err: any) {
          return { error: `Camera angle change failed: ${err.message}` };
        }
      }

      // ----- Entity image gallery -----

      case 'add_entity_image': {
        const { id, name: entName, label, prompt, mood, referenceEntityNames, referenceAssetNames, aspectRatio, model } = args || {};
        if (!label || typeof label !== 'string') return { error: 'label is required' };
        const entities = projectData.entities || [];
        let entity: any = null;
        if (id) entity = entities.find((e: any) => e.id === id);
        else if (entName) {
          const lower = String(entName).toLowerCase();
          entity = entities.find((e: any) =>
            (e.name || '').toLowerCase() === lower ||
            (e.name || '').toLowerCase().includes(lower)
          );
        }
        if (!entity) return { error: `Entity not found: ${id || entName}` };

        const labelText = label.trim();

        // Resolve referenceEntityNames → URLs (the AI passes whichever entities
        // it wants to attach as visual references; nothing is auto-attached).
        const referenceUrls: string[] = [];
        if (referenceEntityNames) {
          for (const refName of String(referenceEntityNames).split(',').map(s => s.trim()).filter(Boolean)) {
            const lower = refName.toLowerCase();
            const refEntity = entities.find((e: any) =>
              (e.name || '').toLowerCase() === lower ||
              (e.name || '').toLowerCase().includes(lower)
            );
            const url = refEntity?.referenceImage || refEntity?.imageUrl;
            if (url && !referenceUrls.includes(url)) referenceUrls.push(url);
          }
        }
        for (const u of resolveAssetUrlsByNames(referenceAssetNames)) {
          if (!referenceUrls.includes(u)) referenceUrls.push(u);
        }

        try {
          // Route through the generic /render endpoint so the AI's prompt
          // reaches the model verbatim — no "Character portrait, bust shot..."
          // template wrapping. This is what makes labeled gallery shots,
          // multi-panel layouts, etc. actually work via this tool.
          const resp = await fetch(`http://localhost:${PORT}/api/narrative/visual/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              prompt: prompt || `${entity.name}, ${labelText}`,
              ...(referenceUrls.length > 0 ? { referenceUrls } : {}),
              ...(aspectRatio ? { aspectRatio } : {}),
              ...(model ? { model } : {}),
            }),
          });
          if (!resp.ok) return { error: `Gallery image generation failed: ${await resp.text()}` };
          const result = await resp.json();
          const imageUrl = result.imageUrl;
          if (!imageUrl) return { error: 'Gallery image generation produced no image' };

          const galleryEntry = {
            id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            url: imageUrl,
            label: labelText,
            ...(prompt ? { prompt } : {}),
            ...(mood ? { mood } : {}),
            createdAt: new Date().toISOString(),
          };

          const existingGallery = Array.isArray(entity.imageGallery) ? entity.imageGallery : [];
          const newGallery = [...existingGallery, galleryEntry];
          await fetch(`http://localhost:${PORT}/api/narrative/entity/${entity.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates: { imageGallery: newGallery } }),
          });

          const newImagePart = loadImagePart(imageUrl, `${entity.name} — "${labelText}"`);
          return {
            visualToolUsed: true,
            entityId: entity.id,
            entityName: entity.name,
            imageId: galleryEntry.id,
            label: labelText,
            imageUrl,
            backend: result.backend,
            galleryCount: newGallery.length,
            referencesAttachedCount: referenceUrls.length,
            referencesAttached: result.referencesAttached,
            styleDirectiveApplied: result.styleDirectiveApplied,
            actualPromptSent: result.actualPromptSent,
            message: `Added "${labelText}" to ${entity.name}'s gallery (${newGallery.length} now). (Backend: ${result.backend}, ${referenceUrls.length} refs, style directive ${result.styleDirectiveApplied ? 'applied' : 'not applied'}.)`,
            ...(newImagePart ? { _imageParts: [newImagePart] } : {}),
          };
        } catch (err: any) {
          return { error: `Gallery image generation failed: ${err.message}` };
        }
      }

      case 'list_entity_images': {
        const { id, name: entName } = args || {};
        const entities = projectData.entities || [];
        let entity: any = null;
        if (id) entity = entities.find((e: any) => e.id === id);
        else if (entName) {
          const lower = String(entName).toLowerCase();
          entity = entities.find((e: any) =>
            (e.name || '').toLowerCase() === lower ||
            (e.name || '').toLowerCase().includes(lower)
          );
        }
        if (!entity) return { error: `Entity not found: ${id || entName}` };

        const gallery = Array.isArray(entity.imageGallery) ? entity.imageGallery : [];
        const _imageParts: any[] = [];

        // Include the primary portrait
        const primaryUrl = entity.referenceImage || entity.imageUrl;
        if (primaryUrl) {
          const part = loadImagePart(primaryUrl, `${entity.name} — primary portrait`);
          if (part) _imageParts.push(part);
        }
        // Plus up to 8 gallery items so the model can actually see them
        const GALLERY_VISION_LIMIT = 8;
        for (let i = 0; i < Math.min(gallery.length, GALLERY_VISION_LIMIT); i++) {
          const g = gallery[i];
          const part = loadImagePart(g.url, `${entity.name} — "${g.label || 'untitled'}"`);
          if (part) _imageParts.push(part);
        }

        return {
          entityId: entity.id,
          entityName: entity.name,
          primaryPortrait: primaryUrl ? { url: primaryUrl, label: 'primary' } : null,
          gallery: gallery.map((g: any) => ({
            id: g.id,
            label: g.label,
            mood: g.mood,
            url: g.url,
            prompt: g.prompt,
            createdAt: g.createdAt,
          })),
          galleryCount: gallery.length,
          ...(_imageParts.length > 0 ? { _imageParts } : {}),
        };
      }

      case 'set_primary_portrait': {
        const { id, name: entName, imageId } = args || {};
        if (!imageId) return { error: 'imageId is required' };
        const entities = projectData.entities || [];
        let entity: any = null;
        if (id) entity = entities.find((e: any) => e.id === id);
        else if (entName) {
          const lower = String(entName).toLowerCase();
          entity = entities.find((e: any) =>
            (e.name || '').toLowerCase() === lower ||
            (e.name || '').toLowerCase().includes(lower)
          );
        }
        if (!entity) return { error: `Entity not found: ${id || entName}` };

        const gallery = Array.isArray(entity.imageGallery) ? [...entity.imageGallery] : [];
        const targetIdx = gallery.findIndex((g: any) => g.id === imageId);
        if (targetIdx < 0) return { error: `Image ${imageId} not in ${entity.name}'s gallery` };

        const [target] = gallery.splice(targetIdx, 1);
        const oldPrimary = entity.referenceImage || entity.imageUrl;

        // The old primary moves into the gallery so we don't lose it.
        if (oldPrimary && oldPrimary !== target.url) {
          gallery.push({
            id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            url: oldPrimary,
            label: 'previous primary',
            createdAt: new Date().toISOString(),
          });
        }

        await fetch(`http://localhost:${PORT}/api/narrative/entity/${entity.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updates: {
              referenceImage: target.url,
              imageUrl: target.url,
              imageGallery: gallery,
            },
          }),
        });

        const newPart = loadImagePart(target.url, `${entity.name} — primary (was "${target.label}")`);
        return {
          visualToolUsed: true,
          worldWriteApplied: true,
          entityId: entity.id,
          entityName: entity.name,
          imageUrl: target.url,
          message: `"${target.label}" is now ${entity.name}'s primary portrait.`,
          ...(newPart ? { _imageParts: [newPart] } : {}),
        };
      }

      case 'remove_entity_image': {
        const { id, name: entName, imageId } = args || {};
        if (!imageId) return { error: 'imageId is required' };
        const entities = projectData.entities || [];
        let entity: any = null;
        if (id) entity = entities.find((e: any) => e.id === id);
        else if (entName) {
          const lower = String(entName).toLowerCase();
          entity = entities.find((e: any) =>
            (e.name || '').toLowerCase() === lower ||
            (e.name || '').toLowerCase().includes(lower)
          );
        }
        if (!entity) return { error: `Entity not found: ${id || entName}` };

        const gallery = Array.isArray(entity.imageGallery) ? entity.imageGallery : [];
        const target = gallery.find((g: any) => g.id === imageId);
        if (!target) return { error: `Image ${imageId} not in ${entity.name}'s gallery` };

        const newGallery = gallery.filter((g: any) => g.id !== imageId);
        await fetch(`http://localhost:${PORT}/api/narrative/entity/${entity.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates: { imageGallery: newGallery } }),
        });

        return {
          worldWriteApplied: true,
          entityId: entity.id,
          entityName: entity.name,
          removedImageId: imageId,
          removedLabel: target.label,
          galleryCount: newGallery.length,
          message: `Removed "${target.label}" from ${entity.name}'s gallery (${newGallery.length} remaining).`,
        };
      }

      // ----- Storyboard tools -----

      case 'generate_storyboard_page': {
        const { scriptChunk, title, panelCount, sceneId, model, aspectRatio } = args || {};
        if (!scriptChunk || typeof scriptChunk !== 'string') return { error: 'scriptChunk is required' };
        try {
          const resp = await fetch(`http://localhost:${PORT}/api/narrative/storyboard/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              scriptChunk,
              ...(title ? { title } : {}),
              ...(typeof panelCount === 'number' ? { panelCount } : {}),
              ...(sceneId ? { sceneId } : {}),
              ...(model ? { model } : { model: 'gpt-image' }),
              ...(aspectRatio ? { aspectRatio } : {}),
            }),
          });
          if (!resp.ok) return { error: `Storyboard generation failed: ${await resp.text()}` };
          const result = await resp.json();
          const part = result.imageUrl ? loadImagePart(result.imageUrl, `Storyboard page: ${result.artifact?.title}`) : null;
          return {
            visualToolUsed: true,
            worldWriteApplied: true,
            artifactId: result.artifact?.id,
            artifactTitle: result.artifact?.title,
            imageUrl: result.imageUrl,
            panelCount: result.panelCount,
            rows: result.rows,
            cols: result.cols,
            referencesAttached: result.referencesAttached,
            styleDirectiveApplied: result.styleDirectiveApplied,
            actualPromptSent: result.actualPromptSent,
            message: `Generated ${result.panelCount}-panel storyboard "${result.artifact?.title}". (Style directive ${result.styleDirectiveApplied ? 'applied' : 'not applied'}.)`,
            ...(part ? { _imageParts: [part] } : {}),
          };
        } catch (err: any) {
          return { error: `Storyboard generation failed: ${err.message}` };
        }
      }

      case 'extract_storyboard_panel': {
        const { artifactId, panelIndex, targetSceneId, targetSceneTitle, frameTitle, frameDescription, position } = args || {};
        if (!artifactId) return { error: 'artifactId is required' };
        if (typeof panelIndex !== 'number') return { error: 'panelIndex (0-based) is required' };
        try {
          const resp = await fetch(`http://localhost:${PORT}/api/narrative/storyboard/${artifactId}/extract-panel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              panelIndex,
              ...(targetSceneId ? { targetSceneId } : {}),
              ...(targetSceneTitle ? { targetSceneTitle } : {}),
              ...(frameTitle ? { frameTitle } : {}),
              ...(frameDescription ? { frameDescription } : {}),
              ...(typeof position === 'number' ? { position } : {}),
            }),
          });
          if (!resp.ok) return { error: `Panel extraction failed: ${await resp.text()}` };
          const result = await resp.json();
          return {
            worldWriteApplied: true,
            sceneId: result.scene?.id,
            frameId: result.frame?.id,
            message: `Extracted panel ${panelIndex + 1} as frame "${result.frame?.title}" in scene "${result.scene?.title}".`,
          };
        } catch (err: any) {
          return { error: `Panel extraction failed: ${err.message}` };
        }
      }

      case 'list_storyboards': {
        const artifacts = Array.isArray(projectData.artifacts) ? projectData.artifacts : [];
        const storyboards = artifacts.filter((a: any) => a.format === 'storyboard_page');
        return {
          total: storyboards.length,
          storyboards: storyboards.map((s: any) => ({
            id: s.id,
            title: s.title,
            panelCount: s.content?.panelCount,
            sceneId: s.content?.sceneId,
            createdAt: s.createdAt,
          })),
        };
      }

      // ----- User-uploaded asset tools -----

      case 'list_assets': {
        const assets: any[] = Array.isArray(projectData.assets) ? projectData.assets : [];
        const { category, search, linkedEntityName } = args || {};

        let linkedEntityId: string | undefined;
        if (linkedEntityName) {
          const lower = String(linkedEntityName).toLowerCase();
          const ent = (projectData.entities || []).find((e: any) =>
            (e.name || '').toLowerCase() === lower || (e.name || '').toLowerCase().includes(lower)
          );
          if (ent) linkedEntityId = ent.id;
        }

        let filtered = assets;
        if (category) filtered = filtered.filter((a: any) => a.category === category);
        if (linkedEntityId) filtered = filtered.filter((a: any) => Array.isArray(a.linkedEntityIds) && a.linkedEntityIds.includes(linkedEntityId));
        if (search) {
          const q = String(search).toLowerCase();
          filtered = filtered.filter((a: any) => {
            const haystack = `${a.name || ''} ${a.description || ''} ${(a.tags || []).join(' ')}`.toLowerCase();
            return haystack.includes(q);
          });
        }

        const entityMap = new Map((projectData.entities || []).map((e: any) => [e.id, e.name]));
        const summary = filtered.map((a: any) => ({
          name: a.name,
          category: a.category,
          tags: a.tags || [],
          description: a.description || '',
          linkedEntities: (a.linkedEntityIds || []).map((id: string) => entityMap.get(id)).filter(Boolean),
          uploadedAt: a.uploadedAt,
        }));

        return {
          totalAssets: assets.length,
          shown: summary.length,
          assets: summary,
          message: summary.length === 0
            ? 'No matching assets.'
            : `${summary.length} asset(s) ${category ? `in "${category}"` : 'matched'}.`,
        };
      }

      case 'link_asset_to_entity': {
        const { assetName, assetId, entityName, entityId } = args || {};
        const assets = Array.isArray(projectData.assets) ? projectData.assets : [];
        let asset: any = null;
        if (assetId) asset = assets.find((a: any) => a.id === assetId);
        else if (assetName) {
          const lower = String(assetName).toLowerCase();
          asset = assets.find((a: any) =>
            (a.name || '').toLowerCase() === lower || (a.name || '').toLowerCase().includes(lower)
          );
        }
        if (!asset) return { error: `Asset not found: ${assetId || assetName}` };

        const entities = projectData.entities || [];
        let entity: any = null;
        if (entityId) entity = entities.find((e: any) => e.id === entityId);
        else if (entityName) {
          const lower = String(entityName).toLowerCase();
          entity = entities.find((e: any) =>
            (e.name || '').toLowerCase() === lower || (e.name || '').toLowerCase().includes(lower)
          );
        }
        if (!entity) return { error: `Entity not found: ${entityId || entityName}` };

        asset.linkedEntityIds = Array.from(new Set([...(asset.linkedEntityIds || []), entity.id]));
        saveProjectData(projectId, projectData);
        return {
          worldWriteApplied: true,
          assetId: asset.id,
          assetName: asset.name,
          entityId: entity.id,
          entityName: entity.name,
          message: `Linked asset "${asset.name}" to entity "${entity.name}".`,
        };
      }

      case 'promote_asset_to_portrait': {
        const { assetName, assetId, entityName, entityId } = args || {};
        const assets = Array.isArray(projectData.assets) ? projectData.assets : [];
        let asset: any = null;
        if (assetId) asset = assets.find((a: any) => a.id === assetId);
        else if (assetName) {
          const lower = String(assetName).toLowerCase();
          asset = assets.find((a: any) =>
            (a.name || '').toLowerCase() === lower || (a.name || '').toLowerCase().includes(lower)
          );
        }
        if (!asset) return { error: `Asset not found: ${assetId || assetName}` };

        const entities = projectData.entities || [];
        let entity: any = null;
        if (entityId) entity = entities.find((e: any) => e.id === entityId);
        else if (entityName) {
          const lower = String(entityName).toLowerCase();
          entity = entities.find((e: any) =>
            (e.name || '').toLowerCase() === lower || (e.name || '').toLowerCase().includes(lower)
          );
        }
        if (!entity) return { error: `Entity not found: ${entityId || entityName}` };

        entity.referenceImage = asset.url;
        entity.updatedAt = new Date().toISOString();
        asset.linkedEntityIds = Array.from(new Set([...(asset.linkedEntityIds || []), entity.id]));

        saveProjectData(projectId, projectData);
        return {
          worldWriteApplied: true,
          visualToolUsed: true,
          assetId: asset.id,
          entityId: entity.id,
          entityName: entity.name,
          message: `Set "${asset.name}" as ${entity.name}'s primary portrait.`,
        };
      }

      case 'tag_asset': {
        const { assetName, assetId, tags, addTags } = args || {};
        const assets = Array.isArray(projectData.assets) ? projectData.assets : [];
        let asset: any = null;
        if (assetId) asset = assets.find((a: any) => a.id === assetId);
        else if (assetName) {
          const lower = String(assetName).toLowerCase();
          asset = assets.find((a: any) =>
            (a.name || '').toLowerCase() === lower || (a.name || '').toLowerCase().includes(lower)
          );
        }
        if (!asset) return { error: `Asset not found: ${assetId || assetName}` };

        if (Array.isArray(tags)) asset.tags = tags;
        if (Array.isArray(addTags)) asset.tags = Array.from(new Set([...(asset.tags || []), ...addTags]));

        saveProjectData(projectId, projectData);
        return {
          worldWriteApplied: true,
          assetId: asset.id,
          assetName: asset.name,
          tags: asset.tags || [],
          message: `Updated tags on "${asset.name}".`,
        };
      }

      case 'update_asset': {
        const { assetName, assetId, newName, description, category } = args || {};
        const assets = Array.isArray(projectData.assets) ? projectData.assets : [];
        let asset: any = null;
        if (assetId) asset = assets.find((a: any) => a.id === assetId);
        else if (assetName) {
          const lower = String(assetName).toLowerCase();
          asset = assets.find((a: any) =>
            (a.name || '').toLowerCase() === lower || (a.name || '').toLowerCase().includes(lower)
          );
        }
        if (!asset) return { error: `Asset not found: ${assetId || assetName}` };

        if (typeof newName === 'string' && newName) asset.name = newName;
        if (typeof description === 'string') asset.description = description;
        if (typeof category === 'string' && ASSET_CATEGORIES.has(category)) asset.category = category;

        saveProjectData(projectId, projectData);
        return {
          worldWriteApplied: true,
          assetId: asset.id,
          assetName: asset.name,
          message: `Updated asset "${asset.name}".`,
        };
      }

      case 'delete_asset': {
        const { assetName, assetId } = args || {};
        const assets = Array.isArray(projectData.assets) ? projectData.assets : [];
        const idx = assetId
          ? assets.findIndex((a: any) => a.id === assetId)
          : assets.findIndex((a: any) => {
              const lower = String(assetName).toLowerCase();
              return (a.name || '').toLowerCase() === lower || (a.name || '').toLowerCase().includes(lower);
            });
        if (idx < 0) return { error: `Asset not found: ${assetId || assetName}` };
        const [removed] = assets.splice(idx, 1);

        try {
          const filename = path.basename(removed.url || '');
          if (filename) {
            const full = path.join(UPLOADED_ASSETS_DIR, filename);
            if (fs.existsSync(full)) fs.unlinkSync(full);
          }
        } catch (err) {
          console.warn('Failed to delete asset file:', err);
        }

        saveProjectData(projectId, projectData);
        return {
          worldWriteApplied: true,
          assetId: removed.id,
          message: `Deleted asset "${removed.name}".`,
        };
      }

      // ----- Direct world-graph writes -----

      case 'create_entity': {
        const {
          name, type, description, backstory, traits, motivations, secrets, status, notes,
        } = args || {};
        if (!name || typeof name !== 'string') return { error: 'name is required' };
        if (!type || typeof type !== 'string') return { error: 'type is required' };

        // Block exact-name dupe of an existing entity to avoid silent collisions.
        const existing = (projectData.entities || []).find(
          (e: any) => (e.name || '').toLowerCase() === name.toLowerCase()
        );
        if (existing) {
          return {
            error: `An entity named "${name}" already exists. Use update_entity instead, or pick a different name.`,
            existingEntityId: existing.id,
          };
        }

        const newEntityId = `entity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newEntity: any = {
          id: newEntityId,
          name: name.trim(),
          type: String(type).toLowerCase(),
          description: description || '',
          backstory: backstory || '',
          traits: Array.isArray(traits) ? traits : [],
          motivations: Array.isArray(motivations) ? motivations : [],
          secrets: Array.isArray(secrets) ? secrets : [],
          status: status || '',
          notes: notes || '',
          createdAt: new Date().toISOString(),
          firstMentioned: Date.now(),
          lastUpdated: Date.now(),
          mentions: 1,
        };
        projectData.entities = projectData.entities || [];
        projectData.entities.push(newEntity);
        session.pendingChanges?.addedEntityIds?.add?.(newEntityId);
        session.uncommittedChanges = true;
        saveProjectData(projectId, projectData);
        if (shouldAutoGenerateEntityVisual(newEntity)) {
          queueAutoEntityVisualGeneration(projectId, newEntityId, 'tool_create_entity');
        }

        return {
          worldWriteApplied: true,
          action: 'create_entity',
          entity: {
            id: newEntity.id,
            name: newEntity.name,
            type: newEntity.type,
            description: newEntity.description,
            traits: newEntity.traits,
          },
          message: `Created ${newEntity.type} "${newEntity.name}".`,
        };
      }

      case 'update_entity': {
        const {
          id, name,
          newName, newType,
          description, backstory,
          traits, addTraits, removeTraits,
          motivations, addMotivations, removeMotivations,
          secrets, addSecrets, removeSecrets,
          status, notes,
        } = args || {};

        const entities = projectData.entities || [];
        let entity: any = null;
        if (id) {
          entity = entities.find((e: any) => e.id === id);
        } else if (name) {
          const lower = String(name).toLowerCase();
          entity = entities.find((e: any) =>
            (e.name || '').toLowerCase() === lower ||
            (e.name || '').toLowerCase().includes(lower)
          );
        }
        if (!entity) return { error: `Entity not found: ${id || name}` };

        const prevName = entity.name;
        const prevType = entity.type;
        const prevStatus = entity.status;

        const changes: string[] = [];

        if (typeof newName === 'string' && newName.trim() && newName.trim() !== entity.name) {
          // Block rename collision with another entity
          const collide = entities.find(
            (e: any) => e.id !== entity.id && (e.name || '').toLowerCase() === newName.trim().toLowerCase()
          );
          if (collide) {
            return { error: `Cannot rename to "${newName.trim()}" — another entity already uses that name.` };
          }
          entity.name = newName.trim();
          changes.push(`name: "${prevName}" → "${entity.name}"`);
        }
        if (typeof newType === 'string' && newType.trim() && newType.trim().toLowerCase() !== entity.type) {
          entity.type = newType.trim().toLowerCase();
          changes.push(`type: "${prevType}" → "${entity.type}"`);
        }
        if (typeof description === 'string' && description !== entity.description) {
          entity.description = description;
          changes.push('description updated');
        }
        if (typeof backstory === 'string' && backstory !== entity.backstory) {
          entity.backstory = backstory;
          changes.push('backstory updated');
        }
        if (Array.isArray(traits)) {
          entity.traits = [...new Set(traits.filter(Boolean))];
          changes.push('traits replaced');
        } else {
          if (Array.isArray(addTraits) && addTraits.length > 0) {
            entity.traits = [...new Set([...(entity.traits || []), ...addTraits.filter(Boolean)])];
            changes.push(`+${addTraits.length} trait(s)`);
          }
          if (Array.isArray(removeTraits) && removeTraits.length > 0) {
            const removeSet = new Set(removeTraits.map((t: string) => t.toLowerCase()));
            const filtered = (entity.traits || []).filter((t: string) => !removeSet.has(t.toLowerCase()));
            const removed = (entity.traits || []).length - filtered.length;
            entity.traits = filtered;
            if (removed > 0) changes.push(`-${removed} trait(s)`);
          }
        }
        if (Array.isArray(motivations)) {
          entity.motivations = [...new Set(motivations.filter(Boolean))];
          changes.push('motivations replaced');
        } else {
          if (Array.isArray(addMotivations) && addMotivations.length > 0) {
            entity.motivations = [...new Set([...(entity.motivations || []), ...addMotivations.filter(Boolean)])];
            changes.push(`+${addMotivations.length} motivation(s)`);
          }
          if (Array.isArray(removeMotivations) && removeMotivations.length > 0) {
            const removeSet = new Set(removeMotivations.map((t: string) => t.toLowerCase()));
            const filtered = (entity.motivations || []).filter((t: string) => !removeSet.has(t.toLowerCase()));
            const removed = (entity.motivations || []).length - filtered.length;
            entity.motivations = filtered;
            if (removed > 0) changes.push(`-${removed} motivation(s)`);
          }
        }
        if (Array.isArray(secrets)) {
          entity.secrets = [...new Set(secrets.filter(Boolean))];
          changes.push('secrets replaced');
        } else {
          if (Array.isArray(addSecrets) && addSecrets.length > 0) {
            entity.secrets = [...new Set([...(entity.secrets || []), ...addSecrets.filter(Boolean)])];
            changes.push(`+${addSecrets.length} secret(s)`);
          }
          if (Array.isArray(removeSecrets) && removeSecrets.length > 0) {
            const removeSet = new Set(removeSecrets.map((t: string) => t.toLowerCase()));
            const filtered = (entity.secrets || []).filter((t: string) => !removeSet.has(t.toLowerCase()));
            const removed = (entity.secrets || []).length - filtered.length;
            entity.secrets = filtered;
            if (removed > 0) changes.push(`-${removed} secret(s)`);
          }
        }
        if (typeof status === 'string' && status !== entity.status) {
          entity.status = status;
          changes.push(`status: "${prevStatus || ''}" → "${status}"`);
        }
        if (typeof notes === 'string' && notes !== entity.notes) {
          entity.notes = notes;
          changes.push('notes updated');
        }

        if (changes.length === 0) {
          return { worldWriteApplied: false, action: 'update_entity', entityId: entity.id, message: 'No fields to update.' };
        }

        entity.lastUpdated = Date.now();
        if (!session.pendingChanges?.addedEntityIds?.has?.(entity.id)) {
          session.pendingChanges?.modifiedEntityIds?.add?.(entity.id);
        }
        session.uncommittedChanges = true;

        // Re-flow visual-dirty markers if appearance/identity-relevant fields changed
        try {
          markVisualsDirtyFromEntityChange(projectData, session, entity, 'tool_update_entity');
        } catch (_e) {}

        saveProjectData(projectId, projectData);

        return {
          worldWriteApplied: true,
          action: 'update_entity',
          entityId: entity.id,
          entityName: entity.name,
          changes,
          message: `Updated "${entity.name}": ${changes.join('; ')}`,
        };
      }

      case 'delete_entity': {
        const { id, name, force } = args || {};
        const entities = projectData.entities || [];
        let entity: any = null;
        if (id) {
          entity = entities.find((e: any) => e.id === id);
        } else if (name) {
          const lower = String(name).toLowerCase();
          entity = entities.find((e: any) =>
            (e.name || '').toLowerCase() === lower ||
            (e.name || '').toLowerCase().includes(lower)
          );
        }
        if (!entity) return { error: `Entity not found: ${id || name}` };

        const isCanon = session.canonEntityIds?.has?.(entity.id);
        if (isCanon && !force) {
          return {
            error: `"${entity.name}" is canon. Pass force=true if the author truly wants to remove it from the world.`,
            entityId: entity.id,
            isCanon: true,
          };
        }

        const removedRels = (projectData.relationships || []).filter(
          (r: any) => r.source === entity.id || r.target === entity.id
        );
        projectData.relationships = (projectData.relationships || []).filter(
          (r: any) => r.source !== entity.id && r.target !== entity.id
        );

        // Unlink from scene participants and locations
        let scenesTouched = 0;
        for (const scene of (projectData.interactions || [])) {
          let mutated = false;
          if (Array.isArray(scene.participantIds) && scene.participantIds.includes(entity.id)) {
            scene.participantIds = scene.participantIds.filter((p: string) => p !== entity.id);
            mutated = true;
          }
          if (Array.isArray(scene.participants) && scene.participants.includes(entity.id)) {
            scene.participants = scene.participants.filter((p: string) => p !== entity.id);
            mutated = true;
          }
          if (scene.locationId === entity.id) {
            scene.locationId = undefined;
            mutated = true;
          }
          if (scene.location === entity.id) {
            scene.location = undefined;
            mutated = true;
          }
          if (mutated) scenesTouched++;
        }

        projectData.entities = entities.filter((e: any) => e.id !== entity.id);
        session.canonEntityIds?.delete?.(entity.id);
        session.uncommittedChanges = true;
        try { applyStoryGraphDiffs(projectData); } catch (_e) {}
        saveProjectData(projectId, projectData);

        return {
          worldWriteApplied: true,
          action: 'delete_entity',
          entityId: entity.id,
          entityName: entity.name,
          removedRelationships: removedRels.length,
          scenesTouched,
          message: `Deleted "${entity.name}" (removed ${removedRels.length} relationship(s); unlinked from ${scenesTouched} scene(s)).`,
        };
      }

      case 'create_relationship': {
        const { sourceName, sourceId, targetName, targetId, type, description } = args || {};
        if (!type) return { error: 'type is required' };
        const entities = projectData.entities || [];

        const resolveOne = (idArg?: string, nameArg?: string): any | null => {
          if (idArg) return entities.find((e: any) => e.id === idArg) || null;
          if (nameArg) {
            const lower = String(nameArg).toLowerCase();
            return entities.find((e: any) =>
              (e.name || '').toLowerCase() === lower ||
              (e.name || '').toLowerCase().includes(lower)
            ) || null;
          }
          return null;
        };
        const source = resolveOne(sourceId, sourceName);
        const target = resolveOne(targetId, targetName);
        if (!source) return { error: `Source entity not found: ${sourceId || sourceName}` };
        if (!target) return { error: `Target entity not found: ${targetId || targetName}` };

        const dupe = (projectData.relationships || []).find(
          (r: any) => r.source === source.id && r.target === target.id && r.type === type
        );
        if (dupe) {
          return { error: `Relationship already exists: ${source.name} —[${type}]→ ${target.name}`, relationshipId: dupe.id };
        }

        const newRel = {
          id: `rel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          source: source.id,
          target: target.id,
          sourceName: source.name,
          targetName: target.name,
          type: String(type),
          description: description || '',
          createdAt: new Date().toISOString(),
        };
        projectData.relationships = projectData.relationships || [];
        projectData.relationships.push(newRel);
        session.pendingChanges?.addedRelationshipIds?.add?.(newRel.id);
        session.uncommittedChanges = true;
        saveProjectData(projectId, projectData);

        return {
          worldWriteApplied: true,
          action: 'create_relationship',
          relationship: newRel,
          message: `Created relationship: ${source.name} —[${type}]→ ${target.name}`,
        };
      }

      case 'update_relationship': {
        const { id, type, description, strength } = args || {};
        if (!id) return { error: 'id is required' };
        const rel = (projectData.relationships || []).find((r: any) => r.id === id);
        if (!rel) return { error: `Relationship not found: ${id}` };

        const changes: string[] = [];
        if (typeof type === 'string' && type !== rel.type) {
          changes.push(`type: "${rel.type}" → "${type}"`);
          rel.type = type;
        }
        if (typeof description === 'string' && description !== rel.description) {
          rel.description = description;
          changes.push('description updated');
        }
        if (typeof strength === 'number') {
          rel.strength = Math.max(0, Math.min(1, strength));
          changes.push(`strength: ${rel.strength}`);
        }
        if (changes.length === 0) {
          return { worldWriteApplied: false, action: 'update_relationship', relationshipId: id, message: 'No fields to update.' };
        }
        session.uncommittedChanges = true;
        saveProjectData(projectId, projectData);
        return {
          worldWriteApplied: true,
          action: 'update_relationship',
          relationshipId: id,
          changes,
          message: `Updated relationship ${rel.sourceName} —[${rel.type}]→ ${rel.targetName}: ${changes.join('; ')}`,
        };
      }

      case 'delete_relationship': {
        const { id } = args || {};
        if (!id) return { error: 'id is required' };
        const idx = (projectData.relationships || []).findIndex((r: any) => r.id === id);
        if (idx < 0) return { error: `Relationship not found: ${id}` };
        const [removed] = projectData.relationships.splice(idx, 1);
        session.uncommittedChanges = true;
        saveProjectData(projectId, projectData);
        return {
          worldWriteApplied: true,
          action: 'delete_relationship',
          relationshipId: id,
          message: `Deleted relationship: ${removed.sourceName} —[${removed.type}]→ ${removed.targetName}`,
        };
      }

      case 'create_scene': {
        const {
          title, prose, summary, participantNames, locationName,
          events, stateChanges, position, insertAfterTitle, status,
        } = args || {};
        if (!title || typeof title !== 'string') return { error: 'title is required' };
        if (!prose || typeof prose !== 'string') return { error: 'prose is required' };

        const entities = projectData.entities || [];
        const interactions = projectData.interactions || [];

        // Resolve participant IDs (skip and report unresolved names)
        const participantIds: string[] = [];
        const unresolved: string[] = [];
        for (const n of (Array.isArray(participantNames) ? participantNames : [])) {
          const lower = String(n).toLowerCase();
          const ent = entities.find((e: any) =>
            (e.name || '').toLowerCase() === lower ||
            (e.name || '').toLowerCase().includes(lower)
          );
          if (ent) participantIds.push(ent.id);
          else unresolved.push(String(n));
        }

        let locationId: string | undefined;
        if (locationName) {
          const lower = String(locationName).toLowerCase();
          const loc = entities.find((e: any) =>
            (e.name || '').toLowerCase() === lower ||
            (e.name || '').toLowerCase().includes(lower)
          );
          if (loc) locationId = loc.id;
          else unresolved.push(String(locationName));
        }

        // Determine target position
        let targetPosition = typeof position === 'number'
          ? Math.max(0, Math.min(position, interactions.length))
          : interactions.length;
        if (insertAfterTitle) {
          const lower = String(insertAfterTitle).toLowerCase();
          const after = interactions.find((s: any) =>
            (s.title || '').toLowerCase() === lower ||
            (s.title || '').toLowerCase().includes(lower)
          );
          if (after?.position !== undefined) targetPosition = after.position + 1;
        }

        // Shift downstream scenes
        for (const s of interactions) {
          if (s.position !== undefined && s.position >= targetPosition) {
            s.position++;
          }
        }

        const newSceneId = `scene_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newScene: any = {
          id: newSceneId,
          title: title.trim(),
          prose,
          summary: summary || '',
          participants: participantIds,
          participantIds,
          location: locationId,
          locationId,
          events: Array.isArray(events) ? events : [],
          stateChanges: Array.isArray(stateChanges) ? stateChanges : [],
          status: status === 'canon' ? 'canon' : 'draft',
          position: targetPosition,
          createdAt: Date.now(),
        };
        projectData.interactions = interactions;
        projectData.interactions.push(newScene);
        projectData.interactions.sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
        session.pendingChanges?.addedSceneIds?.add?.(newSceneId);
        session.uncommittedChanges = true;
        try { applyStoryGraphDiffs(projectData); } catch (_e) {}
        saveProjectData(projectId, projectData);

        return {
          worldWriteApplied: true,
          action: 'create_scene',
          sceneId: newSceneId,
          sceneTitle: newScene.title,
          position: targetPosition,
          ...(unresolved.length > 0 ? { unresolvedNames: unresolved } : {}),
          message: `Created scene "${newScene.title}" at position ${targetPosition + 1}.${unresolved.length > 0 ? ` (Could not resolve: ${unresolved.join(', ')})` : ''}`,
        };
      }

      case 'update_scene': {
        const {
          id, title,
          newTitle, prose, summary,
          participantNames, addParticipantNames, removeParticipantNames,
          locationName, events, stateChanges, status,
        } = args || {};

        const interactions = projectData.interactions || [];
        let scene: any = null;
        if (id) {
          scene = interactions.find((s: any) => s.id === id);
        } else if (title) {
          const lower = String(title).toLowerCase();
          scene = interactions.find((s: any) =>
            (s.title || '').toLowerCase() === lower ||
            (s.title || '').toLowerCase().includes(lower)
          );
        }
        if (!scene) return { error: `Scene not found: ${id || title}` };

        const entities = projectData.entities || [];
        const resolveName = (n: string): string | null => {
          const lower = String(n).toLowerCase();
          const ent = entities.find((e: any) =>
            (e.name || '').toLowerCase() === lower ||
            (e.name || '').toLowerCase().includes(lower)
          );
          return ent ? ent.id : null;
        };

        const changes: string[] = [];
        const unresolved: string[] = [];

        if (typeof newTitle === 'string' && newTitle.trim() && newTitle.trim() !== scene.title) {
          changes.push(`title: "${scene.title}" → "${newTitle.trim()}"`);
          scene.title = newTitle.trim();
        }
        if (typeof prose === 'string' && prose !== scene.prose) {
          scene.prose = prose;
          changes.push('prose updated');
        }
        if (typeof summary === 'string' && summary !== scene.summary) {
          scene.summary = summary;
          changes.push('summary updated');
        }

        if (Array.isArray(participantNames)) {
          const ids: string[] = [];
          for (const n of participantNames) {
            const rid = resolveName(n);
            if (rid) ids.push(rid); else unresolved.push(String(n));
          }
          scene.participantIds = ids;
          scene.participants = ids;
          changes.push(`participants replaced (${ids.length})`);
        } else {
          if (Array.isArray(addParticipantNames) && addParticipantNames.length > 0) {
            const current = new Set<string>(scene.participantIds || scene.participants || []);
            let added = 0;
            for (const n of addParticipantNames) {
              const rid = resolveName(n);
              if (!rid) { unresolved.push(String(n)); continue; }
              if (!current.has(rid)) { current.add(rid); added++; }
            }
            const arr = Array.from(current);
            scene.participantIds = arr;
            scene.participants = arr;
            if (added > 0) changes.push(`+${added} participant(s)`);
          }
          if (Array.isArray(removeParticipantNames) && removeParticipantNames.length > 0) {
            const removeIds = new Set<string>();
            for (const n of removeParticipantNames) {
              const rid = resolveName(n);
              if (rid) removeIds.add(rid); else unresolved.push(String(n));
            }
            const arr = (scene.participantIds || scene.participants || []).filter((p: string) => !removeIds.has(p));
            const removed = (scene.participantIds || scene.participants || []).length - arr.length;
            scene.participantIds = arr;
            scene.participants = arr;
            if (removed > 0) changes.push(`-${removed} participant(s)`);
          }
        }

        if (typeof locationName === 'string') {
          const rid = resolveName(locationName);
          if (rid) {
            scene.location = rid;
            scene.locationId = rid;
            changes.push(`location: ${entities.find((e: any) => e.id === rid)?.name || rid}`);
          } else {
            unresolved.push(locationName);
          }
        }
        if (Array.isArray(events)) {
          scene.events = events;
          changes.push('events updated');
        }
        if (Array.isArray(stateChanges)) {
          scene.stateChanges = stateChanges;
          changes.push('state changes updated');
        }
        if (typeof status === 'string' && (status === 'draft' || status === 'canon') && status !== scene.status) {
          scene.status = status;
          changes.push(`status → ${status}`);
        }

        if (changes.length === 0) {
          return { worldWriteApplied: false, action: 'update_scene', sceneId: scene.id, message: 'No fields to update.' };
        }

        scene.updatedAt = Date.now();
        if (!session.pendingChanges?.addedSceneIds?.has?.(scene.id)) {
          session.pendingChanges?.modifiedSceneIds?.add?.(scene.id);
        }
        session.uncommittedChanges = true;
        try { applyStoryGraphDiffs(projectData); } catch (_e) {}
        saveProjectData(projectId, projectData);

        return {
          worldWriteApplied: true,
          action: 'update_scene',
          sceneId: scene.id,
          sceneTitle: scene.title,
          changes,
          ...(unresolved.length > 0 ? { unresolvedNames: unresolved } : {}),
          message: `Updated "${scene.title}": ${changes.join('; ')}${unresolved.length > 0 ? ` (Could not resolve: ${unresolved.join(', ')})` : ''}`,
        };
      }

      case 'delete_scene': {
        const { id, title } = args || {};
        const interactions = projectData.interactions || [];
        let scene: any = null;
        let idx = -1;
        if (id) {
          idx = interactions.findIndex((s: any) => s.id === id);
        } else if (title) {
          const lower = String(title).toLowerCase();
          idx = interactions.findIndex((s: any) =>
            (s.title || '').toLowerCase() === lower ||
            (s.title || '').toLowerCase().includes(lower)
          );
        }
        if (idx < 0) return { error: `Scene not found: ${id || title}` };
        scene = interactions[idx];

        interactions.splice(idx, 1);
        // Re-flow positions
        interactions.forEach((s: any, i: number) => { s.position = i; });
        session.uncommittedChanges = true;
        try { applyStoryGraphDiffs(projectData); } catch (_e) {}
        saveProjectData(projectId, projectData);

        return {
          worldWriteApplied: true,
          action: 'delete_scene',
          sceneId: scene.id,
          sceneTitle: scene.title,
          message: `Deleted scene "${scene.title}".`,
        };
      }

      // ----- Artifacts (diegetic media) -----

      case 'create_artifact': {
        const { title, format, description, publication, byline, inWorldDate, relatedEntityNames, relatedSceneTitles, content, status } = args || {};
        if (!title || typeof title !== 'string') return { error: 'title is required' };
        if (!format || typeof format !== 'string') return { error: 'format is required' };

        // Resolve related entity names → IDs
        const relatedEntityIds: string[] = [];
        if (Array.isArray(relatedEntityNames)) {
          for (const n of relatedEntityNames) {
            const lower = String(n).toLowerCase();
            const ent = (projectData.entities || []).find((e: any) =>
              (e.name || '').toLowerCase() === lower || (e.name || '').toLowerCase().includes(lower)
            );
            if (ent) relatedEntityIds.push(ent.id);
          }
        }
        const relatedSceneIds: string[] = [];
        if (Array.isArray(relatedSceneTitles)) {
          for (const t of relatedSceneTitles) {
            const lower = String(t).toLowerCase();
            const scene = (projectData.interactions || []).find((s: any) =>
              (s.title || '').toLowerCase() === lower || (s.title || '').toLowerCase().includes(lower)
            );
            if (scene) relatedSceneIds.push(scene.id);
          }
        }

        try {
          const resp = await fetch(`http://localhost:${PORT}/api/narrative/artifacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              title,
              format,
              description,
              publication,
              byline,
              inWorldDate,
              relatedEntityIds,
              ...(relatedSceneIds.length > 0 ? { relatedSceneIds } : {}),
              content: content || {},
              status: status === 'published' ? 'published' : 'draft',
            }),
          });
          if (!resp.ok) {
            const errBody = await resp.text();
            return { error: `Artifact creation failed: ${errBody}` };
          }
          const result = await resp.json();
          const artifact = result.artifact;
          return {
            worldWriteApplied: true,
            action: 'create_artifact',
            artifactId: artifact.id,
            artifact: {
              id: artifact.id,
              title: artifact.title,
              format: artifact.format,
              publication: artifact.publication,
              relatedEntityIds: artifact.relatedEntityIds,
              status: artifact.status,
            },
            message: `Created ${artifact.format} artifact "${artifact.title}". Call generate_artifact_image to render the primary image.`,
          };
        } catch (err: any) {
          return { error: `Artifact creation failed: ${err.message}` };
        }
      }

      case 'update_artifact': {
        const { id, title, newTitle, description, publication, byline, inWorldDate, relatedEntityNames, content, contentMode, status } = args || {};
        const artifacts = (projectData as any).artifacts || [];
        let artifact: any = null;
        if (id) artifact = artifacts.find((a: any) => a.id === id);
        else if (title) {
          const lower = String(title).toLowerCase();
          artifact = artifacts.find((a: any) =>
            (a.title || '').toLowerCase() === lower || (a.title || '').toLowerCase().includes(lower)
          );
        }
        if (!artifact) return { error: `Artifact not found: ${id || title}` };

        const updates: any = {};
        if (newTitle) updates.title = String(newTitle);
        if (description !== undefined) updates.description = String(description);
        if (publication !== undefined) updates.publication = String(publication);
        if (byline !== undefined) updates.byline = String(byline);
        if (inWorldDate !== undefined) updates.inWorldDate = String(inWorldDate);
        if (status === 'draft' || status === 'published') updates.status = status;

        if (Array.isArray(relatedEntityNames)) {
          const ids: string[] = [];
          for (const n of relatedEntityNames) {
            const lower = String(n).toLowerCase();
            const ent = (projectData.entities || []).find((e: any) =>
              (e.name || '').toLowerCase() === lower || (e.name || '').toLowerCase().includes(lower)
            );
            if (ent) ids.push(ent.id);
          }
          updates.relatedEntityIds = ids;
        }

        if (content && typeof content === 'object') {
          if (contentMode === 'replace') {
            updates.content = content;
          } else {
            updates.content = { ...(artifact.content || {}), ...content };
          }
        }

        if (Object.keys(updates).length === 0) {
          return { worldWriteApplied: false, action: 'update_artifact', artifactId: artifact.id, message: 'No fields to update.' };
        }

        try {
          const resp = await fetch(`http://localhost:${PORT}/api/narrative/artifacts/${artifact.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId, updates }),
          });
          if (!resp.ok) return { error: `Artifact update failed: ${await resp.text()}` };
          const result = await resp.json();
          return {
            worldWriteApplied: true,
            action: 'update_artifact',
            artifactId: artifact.id,
            updates: Object.keys(updates),
            message: `Updated artifact "${result.artifact.title}".`,
          };
        } catch (err: any) {
          return { error: `Artifact update failed: ${err.message}` };
        }
      }

      case 'delete_artifact': {
        const { id, title } = args || {};
        const artifacts = (projectData as any).artifacts || [];
        let artifact: any = null;
        if (id) artifact = artifacts.find((a: any) => a.id === id);
        else if (title) {
          const lower = String(title).toLowerCase();
          artifact = artifacts.find((a: any) =>
            (a.title || '').toLowerCase() === lower || (a.title || '').toLowerCase().includes(lower)
          );
        }
        if (!artifact) return { error: `Artifact not found: ${id || title}` };

        try {
          const resp = await fetch(`http://localhost:${PORT}/api/narrative/artifacts/${artifact.id}?projectId=${encodeURIComponent(projectId)}`, {
            method: 'DELETE',
          });
          if (!resp.ok) return { error: `Artifact delete failed: ${await resp.text()}` };
          return {
            worldWriteApplied: true,
            action: 'delete_artifact',
            artifactId: artifact.id,
            message: `Deleted artifact "${artifact.title}".`,
          };
        } catch (err: any) {
          return { error: `Artifact delete failed: ${err.message}` };
        }
      }

      case 'list_artifacts': {
        const { format, relatedEntityName, limit } = args || {};
        const artifacts: any[] = (projectData as any).artifacts || [];

        let filtered = artifacts;
        if (format) {
          const f = String(format).toLowerCase();
          filtered = filtered.filter((a: any) => (a.format || '').toLowerCase() === f);
        }
        if (relatedEntityName) {
          const lower = String(relatedEntityName).toLowerCase();
          const ent = (projectData.entities || []).find((e: any) =>
            (e.name || '').toLowerCase() === lower || (e.name || '').toLowerCase().includes(lower)
          );
          if (ent) filtered = filtered.filter((a: any) => Array.isArray(a.relatedEntityIds) && a.relatedEntityIds.includes(ent.id));
          else filtered = [];
        }

        const cap = typeof limit === 'number' && limit > 0 ? limit : filtered.length;
        return {
          totalArtifacts: filtered.length,
          artifacts: filtered.slice(0, cap).map((a: any) => ({
            id: a.id,
            title: a.title,
            format: a.format,
            publication: a.publication,
            byline: a.byline,
            inWorldDate: a.inWorldDate,
            status: a.status,
            hasImage: Boolean(a.primaryImage?.url),
            relatedEntityNames: (a.relatedEntityIds || []).map((rid: string) =>
              (projectData.entities || []).find((e: any) => e.id === rid)?.name || rid
            ),
          })),
        };
      }

      case 'get_artifact': {
        const { id, title } = args || {};
        const artifacts = (projectData as any).artifacts || [];
        let artifact: any = null;
        if (id) artifact = artifacts.find((a: any) => a.id === id);
        else if (title) {
          const lower = String(title).toLowerCase();
          artifact = artifacts.find((a: any) =>
            (a.title || '').toLowerCase() === lower || (a.title || '').toLowerCase().includes(lower)
          );
        }
        if (!artifact) {
          return {
            error: `Artifact not found: ${id || title}`,
            available: artifacts.slice(0, 8).map((a: any) => ({ id: a.id, title: a.title, format: a.format })),
          };
        }
        const _imageParts: any[] = [];
        if (artifact.primaryImage?.url) {
          const part = loadImagePart(artifact.primaryImage.url, `Artifact: ${artifact.title} (${artifact.format})`);
          if (part) _imageParts.push(part);
        }
        return {
          artifact: {
            ...artifact,
            relatedEntityNames: (artifact.relatedEntityIds || []).map((rid: string) =>
              (projectData.entities || []).find((e: any) => e.id === rid)?.name || rid
            ),
          },
          ...(_imageParts.length > 0 ? { _imageParts } : {}),
        };
      }

      case 'generate_artifact_image': {
        const { id, title, prompt, referenceEntityNames, referenceAssetNames, aspectRatio, model } = args || {};
        const artifacts = (projectData as any).artifacts || [];
        let artifact: any = null;
        if (id) artifact = artifacts.find((a: any) => a.id === id);
        else if (title) {
          const lower = String(title).toLowerCase();
          artifact = artifacts.find((a: any) =>
            (a.title || '').toLowerCase() === lower || (a.title || '').toLowerCase().includes(lower)
          );
        }
        if (!artifact) return { error: `Artifact not found: ${id || title}` };

        // Pick a sensible default aspect ratio per format if caller didn't specify
        const fmtLower = String(artifact.format || '').toLowerCase();
        const defaultAspect = fmtLower === 'magazine_cover' ? '3:4'
          : fmtLower === 'social_post' ? '1:1'
          : fmtLower === 'video_script' || fmtLower === 'broadcast' ? '16:9'
          : '1:1';

        try {
          const resp = await fetch(`http://localhost:${PORT}/api/narrative/artifacts/${artifact.id}/generate-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              prompt,
              referenceEntityNames,
              referenceAssetNames,
              aspectRatio: aspectRatio || defaultAspect,
              ...(model ? { model } : {}),
            }),
          });
          if (!resp.ok) return { error: `Artifact image generation failed: ${await resp.text()}` };
          const result = await resp.json();
          const imageUrl = result.imageUrl || result.artifact?.primaryImage?.url;
          const newPart = imageUrl ? loadImagePart(imageUrl, `${artifact.title} — ${artifact.format}`) : null;
          return {
            visualToolUsed: true,
            artifactId: artifact.id,
            artifactTitle: artifact.title,
            imageUrl,
            backend: result.backend,
            referencesAttached: result.referencesAttached,
            styleDirectiveApplied: result.styleDirectiveApplied,
            actualPromptSent: result.actualPromptSent,
            message: `Generated primary image for "${artifact.title}". (Backend: ${result.backend}, style directive ${result.styleDirectiveApplied ? 'applied' : 'not applied'}.)`,
            ...(newPart ? { _imageParts: [newPart] } : {}),
          };
        } catch (err: any) {
          return { error: `Artifact image generation failed: ${err.message}` };
        }
      }

      // ----- Batch proposals -----
      // These stage changes to session.pendingProposals for review-then-accept.
      // Studio UI surfaces a "Review N proposals" affordance when these exist.

      case 'propose_entities': {
        const incoming = Array.isArray(args?.entities) ? args.entities : [];
        if (incoming.length === 0) return { error: 'entities array is required and must be non-empty' };
        const knownTypes = new Set(['character', 'location', 'object', 'concept', 'event', 'organization', 'creature', 'faction', 'artifact']);
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const proposalIds: string[] = [];
        const summary: Array<{ name: string; action: 'add' | 'update' }> = [];

        for (const ent of incoming) {
          if (!ent?.name || typeof ent.name !== 'string') continue;
          const lowerName = ent.name.toLowerCase();
          const rawType = String(ent.type || 'concept').toLowerCase();
          const type = knownTypes.has(rawType) ? rawType : 'concept';
          const existing = (projectData.entities || []).find(
            (e: any) => (e.name || '').toLowerCase() === lowerName
          );

          const proposalId = `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          if (existing) {
            const merged = {
              ...existing,
              name: ent.name,
              type,
              description: ent.description || existing.description,
              backstory: ent.backstory
                ? (existing.backstory ? `${existing.backstory}\n\n${ent.backstory}` : ent.backstory)
                : existing.backstory,
              traits: [...new Set([...(existing.traits || []), ...(Array.isArray(ent.traits) ? ent.traits : [])])],
              motivations: [...new Set([...(existing.motivations || []), ...(Array.isArray(ent.motivations) ? ent.motivations : [])])],
              secrets: [...new Set([...(existing.secrets || []), ...(Array.isArray(ent.secrets) ? ent.secrets : [])])],
              status: ent.status || existing.status,
              notes: ent.notes || existing.notes,
              id: existing.id,
              lastUpdated: Date.now(),
            };
            session.pendingProposals.push({
              id: proposalId,
              type: 'update_entity',
              entity: merged,
              existingEntity: existing,
              status: 'pending',
              messageId,
            });
            proposalIds.push(proposalId);
            summary.push({ name: ent.name, action: 'update' });
          } else {
            const newEntityId = `entity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const newEntity = {
              id: newEntityId,
              name: ent.name,
              type,
              description: ent.description || '',
              backstory: ent.backstory || '',
              traits: Array.isArray(ent.traits) ? ent.traits : [],
              motivations: Array.isArray(ent.motivations) ? ent.motivations : [],
              secrets: Array.isArray(ent.secrets) ? ent.secrets : [],
              status: ent.status || '',
              notes: ent.notes || '',
              createdAt: new Date().toISOString(),
              firstMentioned: Date.now(),
              lastUpdated: Date.now(),
              mentions: 1,
            };
            session.pendingProposals.push({
              id: proposalId,
              type: 'add_entity',
              entity: newEntity,
              status: 'pending',
              messageId,
            });
            proposalIds.push(proposalId);
            summary.push({ name: ent.name, action: 'add' });
          }
        }

        if (proposalIds.length === 0) {
          return { error: 'No valid entities to propose. Each entity needs at least a name.' };
        }
        saveConversationHistory(projectId, session);

        const adds = summary.filter(s => s.action === 'add').map(s => s.name);
        const updates = summary.filter(s => s.action === 'update').map(s => s.name);
        const lines: string[] = [];
        if (adds.length > 0) lines.push(`+${adds.length} new (${adds.join(', ')})`);
        if (updates.length > 0) lines.push(`~${updates.length} updates (${updates.join(', ')})`);
        return {
          proposalsCreated: proposalIds.length,
          proposalIds,
          summary,
          messageId,
          message: `Staged ${proposalIds.length} entity proposal(s) for review: ${lines.join(', ')}.`,
        };
      }

      case 'propose_relationships': {
        const incoming = Array.isArray(args?.relationships) ? args.relationships : [];
        if (incoming.length === 0) return { error: 'relationships array is required and must be non-empty' };
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const proposalIds: string[] = [];
        const skipped: Array<{ source: string; target: string; reason: string }> = [];

        const resolveByName = (name: string): any | null => {
          if (!name) return null;
          const lower = name.toLowerCase();
          // Check existing entities first
          const existing = (projectData.entities || []).find(
            (e: any) => (e.name || '').toLowerCase() === lower || (e.name || '').toLowerCase().includes(lower)
          );
          if (existing) return existing;
          // Also check pending entity proposals (so chained propose_entities + propose_relationships works)
          const pendingEntityProposal = session.pendingProposals.find((p: any) =>
            p.type === 'add_entity' && (p.entity?.name || '').toLowerCase() === lower
          );
          return pendingEntityProposal?.entity || null;
        };

        for (const rel of incoming) {
          if (!rel?.type) continue;
          const source = resolveByName(rel.sourceName);
          const target = resolveByName(rel.targetName);
          if (!source) {
            skipped.push({ source: rel.sourceName, target: rel.targetName, reason: 'source not found' });
            continue;
          }
          if (!target) {
            skipped.push({ source: rel.sourceName, target: rel.targetName, reason: 'target not found' });
            continue;
          }
          const dupe = (projectData.relationships || []).find(
            (r: any) => r.source === source.id && r.target === target.id && r.type === rel.type
          );
          if (dupe) {
            skipped.push({ source: source.name, target: target.name, reason: 'already exists' });
            continue;
          }
          const proposalId = `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          session.pendingProposals.push({
            id: proposalId,
            type: 'add_relationship',
            relationship: {
              id: `rel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              source: source.id,
              target: target.id,
              sourceName: source.name,
              targetName: target.name,
              type: String(rel.type),
              description: rel.description || '',
              ...(typeof rel.strength === 'number' ? { strength: Math.max(0, Math.min(1, rel.strength)) } : {}),
              createdAt: new Date().toISOString(),
            },
            status: 'pending',
            messageId,
          });
          proposalIds.push(proposalId);
        }

        if (proposalIds.length === 0) {
          return {
            error: 'No valid relationships to propose.',
            skipped,
          };
        }
        saveConversationHistory(projectId, session);
        return {
          proposalsCreated: proposalIds.length,
          proposalIds,
          messageId,
          ...(skipped.length > 0 ? { skipped } : {}),
          message: `Staged ${proposalIds.length} relationship proposal(s) for review.`,
        };
      }

      case 'propose_scenes': {
        const incoming = Array.isArray(args?.scenes) ? args.scenes : [];
        if (incoming.length === 0) return { error: 'scenes array is required and must be non-empty' };
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const proposalIds: string[] = [];
        const interactions = projectData.interactions || [];
        let nextPosition = interactions.length;

        const resolveByName = (name: string): any | null => {
          if (!name) return null;
          const lower = name.toLowerCase();
          const existing = (projectData.entities || []).find(
            (e: any) => (e.name || '').toLowerCase() === lower || (e.name || '').toLowerCase().includes(lower)
          );
          if (existing) return existing;
          const pendingEntity = session.pendingProposals.find((p: any) =>
            p.type === 'add_entity' && (p.entity?.name || '').toLowerCase() === lower
          );
          return pendingEntity?.entity || null;
        };

        for (const scene of incoming) {
          if (!scene?.title || !scene?.prose) continue;
          const participantIds: string[] = [];
          for (const n of (Array.isArray(scene.participantNames) ? scene.participantNames : [])) {
            const ent = resolveByName(String(n));
            if (ent) participantIds.push(ent.id);
          }
          let locationId: string | undefined;
          if (scene.locationName) {
            const loc = resolveByName(String(scene.locationName));
            if (loc) locationId = loc.id;
          }
          const newSceneId = `scene_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const newScene = {
            id: newSceneId,
            title: String(scene.title),
            prose: String(scene.prose),
            summary: scene.summary || '',
            participants: participantIds,
            participantIds,
            location: locationId,
            locationId,
            events: Array.isArray(scene.events) ? scene.events : [],
            stateChanges: [],
            status: 'draft' as const,
            position: nextPosition++,
            createdAt: Date.now(),
          };
          const proposalId = `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          session.pendingProposals.push({
            id: proposalId,
            type: 'add_scene',
            scene: newScene,
            status: 'pending',
            messageId,
          });
          proposalIds.push(proposalId);
        }

        if (proposalIds.length === 0) {
          return { error: 'No valid scenes to propose. Each scene needs title and prose.' };
        }
        saveConversationHistory(projectId, session);
        return {
          proposalsCreated: proposalIds.length,
          proposalIds,
          messageId,
          message: `Staged ${proposalIds.length} scene proposal(s) for review.`,
        };
      }

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  };
}


// The main narrative chat endpoint - conversational world-building
app.post('/api/narrative/chat', async (req, res) => {
  try {
    const {
      projectId = getActiveProjectId(),
      message,
      sessionId,
      writingStylePrompt,
      context: clientContext,
      systemPrompt: clientSystemPrompt,
      // Legacy fields (backwards compatible)
      focusedEntityId: legacyFocusedEntityId,
      focusedSceneId: legacyFocusedSceneId,
      // New rich selection context
      selection
    } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Detect SSE: client opts in via Accept: text/event-stream OR ?stream=true.
    // When streaming, we push tool_call/tool_result events the moment they
    // happen and emit a final 'done' event with the full payload. When not
    // streaming, we collect everything and return one JSON response (legacy
    // path, kept for compatibility).
    const wantsStream =
      (req.headers.accept || '').includes('text/event-stream') ||
      String(req.query.stream ?? '').toLowerCase() === 'true';

    let sseSendEvent: ((event: string, data: any) => void) | null = null;
    if (wantsStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if any
      res.flushHeaders?.();
      sseSendEvent = (event: string, data: any) => {
        try {
          res.write(`event: ${event}\n`);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (err) {
          // client probably disconnected; swallow
        }
      };
      // Heartbeat every 15s so reverse proxies don't kill an idle stream
      const hb = setInterval(() => {
        try { res.write(`: heartbeat\n\n`); } catch { /* ignore */ }
      }, 15000);
      req.on('close', () => clearInterval(hb));
      res.on('close', () => clearInterval(hb));
    }

    // Extract selection context (prefer new format, fall back to legacy)
    const focusedEntityId = selection?.focusedEntityId ?? legacyFocusedEntityId;
    const focusedSceneId = selection?.focusedSceneId ?? legacyFocusedSceneId;
    const focusedFrameId = selection?.focusedFrameId ?? null;
    const pinnedEntityIds: string[] = selection?.pinnedEntityIds ?? [];
    const activeRow = selection?.activeRow;
    const currentIndex = selection?.currentIndex;
    const insertAfterSceneId = selection?.insertAfterSceneId;
    const insertBeforeSceneId = selection?.insertBeforeSceneId;
    const insertPositionIndex = selection?.insertPosition;

    // Update session focus if client sent focused entity/scene/frame
    const session = getWorldSession(projectId);
    if (focusedEntityId) {
      session.focusedEntityId = focusedEntityId;
    }
    if (focusedSceneId) {
      session.focusedSceneId = focusedSceneId;
    }
    (session as any).focusedFrameId = focusedFrameId;
    // Store pinned entities in session for context
    session.pinnedEntityIds = pinnedEntityIds;

    if (!llmAdapter) {
      return res.status(500).json({ error: 'LLM not configured - set GEMINI_API_KEY' });
    }

    const projectData = loadProjectData(projectId);
    const scratchpadDocuments = ensureScratchpadDocuments(projectData).map(normalizeScratchpadDocument);
    const effectiveWritingStylePrompt = getEffectiveWritingStylePrompt(projectId, writingStylePrompt);
    const effectiveVisualStylePrompt = getEffectiveVisualStylePrompt(projectId);
    const storyGraph = applyStoryGraphDiffs(projectData);

    // Build context from existing world - organized by type
    const entitiesByType: Record<string, any[]> = {};
    for (const entity of projectData.entities) {
      const type = entity.type || 'other';
      if (!entitiesByType[type]) entitiesByType[type] = [];
      entitiesByType[type].push(entity);
    }

    let worldSummary = '';
    if (projectData.entities.length > 0) {
      worldSummary = '--- What exists in this world ---\n';
      for (const [type, entities] of Object.entries(entitiesByType)) {
        worldSummary += `\n${type.charAt(0).toUpperCase() + type.slice(1)}s:\n`;
        for (const e of (entities as any[])) {
          const isCanon = session.canonEntityIds.has(e.id);
          worldSummary += `  ${e.name}${isCanon ? ' [canon]' : ''} — ${e.description || 'No description'}\n`;
        }
      }
      if (projectData.relationships.length > 0) {
        worldSummary += `\nConnections:\n`;
        for (const r of projectData.relationships) {
          worldSummary += `  ${r.sourceName || r.source} —[${r.type}]→ ${r.targetName || r.target}${r.description ? ` (${r.description})` : ''}\n`;
        }
      }
    } else {
      worldSummary = 'This is a blank canvas — no entities or scenes yet. A fresh world to build together.';
    }

    // Asset catalog — compact summary of user-uploaded reference material.
    // Names + categories + tags only; no thumbnails (those inflate the prompt
    // and the AI rarely needs binary content here). The AI uses list_assets +
    // referenceAssetNames to actually attach assets to renders.
    let assetCatalog = '';
    const projectAssetsArr = Array.isArray(projectData.assets) ? projectData.assets : [];
    if (projectAssetsArr.length > 0) {
      const byCategory: Record<string, any[]> = {};
      for (const a of projectAssetsArr) {
        const cat = a.category || 'other';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(a);
      }
      assetCatalog = `\n--- Uploaded asset library (${projectAssetsArr.length}) ---\n`;
      assetCatalog += `User-uploaded reference material. Pass names in referenceAssetNames on render tools to use as visual references.\n`;
      for (const [cat, list] of Object.entries(byCategory)) {
        assetCatalog += `\n${cat}:\n`;
        for (const a of list) {
          const linkedNames = (a.linkedEntityIds || [])
            .map((id: string) => projectData.entities.find((e: any) => e.id === id)?.name)
            .filter(Boolean);
          const tagStr = (a.tags || []).length > 0 ? ` [${(a.tags || []).join(', ')}]` : '';
          const linkStr = linkedNames.length > 0 ? ` (linked: ${linkedNames.join(', ')})` : '';
          const descStr = a.description ? ` — ${String(a.description).slice(0, 80)}` : '';
          assetCatalog += `  "${a.name}"${tagStr}${linkStr}${descStr}\n`;
        }
      }
    }

    // Pipeline status — diagnose what phase the project is in based on what
    // actually exists, so the agent can proactively suggest next moves.
    // Computed fresh per chat turn, not stored (state is the source of truth).
    const projectMetaForPhase = projects.find((p: any) => p.id === projectId);
    const styleAssetCount = (projectMetaForPhase?.styleProfile?.styleAssetIds || []).length;
    const visualStyleText = (projectMetaForPhase?.styleProfile?.visualPrompt || '').trim();
    const entitiesWithPortraits = (projectData.entities || []).filter((e: any) => e.referenceImage || e.imageUrl).length;
    const scenesWithProse = (projectData.interactions || []).filter((s: any) => (s.prose || '').trim().length > 100).length;
    const storyboardCount = (projectData.artifacts || []).filter((a: any) => a.format === 'storyboard_page').length;
    const totalFrames = (projectData.interactions || []).reduce((acc: number, s: any) => acc + (s.frames?.length || 0), 0);
    const framesWithImages = (projectData.interactions || []).reduce(
      (acc: number, s: any) => acc + (s.frames || []).filter((f: any) => f.imageUrl).length,
      0,
    );

    let currentPhase: 'pre-production' | 'character-design' | 'scene-drafting' | 'storyboarding' | 'production' = 'pre-production';
    if (styleAssetCount >= 3 && visualStyleText) {
      if (entitiesWithPortraits < 1) currentPhase = 'character-design';
      else if (scenesWithProse < 1) currentPhase = 'scene-drafting';
      else if (storyboardCount < 1 && totalFrames < 5) currentPhase = 'storyboarding';
      else currentPhase = 'production';
    }

    const phaseAdvice: Record<typeof currentPhase, string> = {
      'pre-production': `PRE-PRODUCTION (Phase 0). Style is not yet locked. Without 3+ style references and a clear visual style spec, every render will drift between aesthetics (photoreal / 3D-CGI / anime / illustration), producing the inconsistency the writer is fighting. Strongly suggest: (1) head to the Pre-Pro view (top-left nav row), (2) write a substantive visual style spec or pick a preset, (3) upload 3+ style reference images and pin them, (4) run the test bench to verify before generating any real characters or scenes. Don't generate production assets in this phase — that's setting up failure.`,
      'character-design': `CHARACTER DESIGN (Phase 1). Style is locked but no characters have portraits yet. Suggest: walk the writer through key characters one at a time, generate portraits with style refs auto-attached, iterate until each character is on-model. Once 3-5 main characters have locked portraits, move to scene drafting.`,
      'scene-drafting': `SCENE DRAFTING (Phase 2). Characters exist with portraits, but no scenes have substantial prose. Suggest: work with the writer on scene prose, beats, dialogue. Reference characters by name. Don't render production frames yet — first the prose should be solid.`,
      'storyboarding': `STORYBOARDING (Phase 3). Prose exists, time to break it into shots. Suggest: head to the Storyboard view, paste in a scene's prose, generate a 12-panel storyboard with GPT Image 1, then extract panels as frames. This is much faster than rendering frames blind. Use generate_storyboard_page tool when the writer wants to start.`,
      'production': `PRODUCTION (Phase 4). Style is locked, characters exist, scenes are drafted, storyboards/frames are in motion. Focus on production-rendering frames with Nano Banana anchored to storyboards + character portraits. Continuity matters — pass previous frame URLs for sequential shots, pass character names for identity anchoring.`,
    };

    const pipelineStatus = `
--- Pipeline status (Phase: ${currentPhase}) ---
Style: ${styleAssetCount} style refs pinned ${styleAssetCount >= 3 ? '✓ locked' : `(need ${3 - styleAssetCount} more)`}${visualStyleText ? ' · style spec present' : ' · NO style spec'}
World: ${projectData.entities?.length || 0} entities (${entitiesWithPortraits} with portraits) · ${projectData.interactions?.length || 0} scenes (${scenesWithProse} with prose)
Pre-vis: ${storyboardCount} storyboard page(s) · ${framesWithImages}/${totalFrames} frames rendered
${phaseAdvice[currentPhase]}
`;

    // Get focused context if we have current focus
    const focusContext = session.currentFocus.length > 0
      ? queryGraphContext(projectData, session.currentFocus)
      : '';

    const recentMessages = session.messages.slice(-10).map(m =>
      `${m.role === 'user' ? 'Creator' : 'World'}: ${m.content}`
    ).join('\n\n');

    // Count canon vs uncommitted
    const canonCount = session.canonEntityIds.size;
    const uncommittedCount = projectData.entities.length - canonCount;

    // Build context about recent user decisions
    let decisionContext = '';
    if (session.userDecisions.length > 0) {
      const recentDecisions = session.userDecisions.slice(-10);
      const accepted = recentDecisions.filter(d => d.decision === 'accepted');
      const rejected = recentDecisions.filter(d => d.decision === 'rejected');

      if (rejected.length > 0) {
        decisionContext = '\n--- Recently rejected (don\'t re-propose these) ---\n';
        for (const d of rejected) {
          decisionContext += `- "${d.entityName}"${d.reason ? ` — ${d.reason}` : ''}\n`;
        }
      }
    }

    // Insertion context from UI (non-authoritative, but useful)
    let insertContext = '';
    if (insertAfterSceneId || insertBeforeSceneId || insertPositionIndex !== undefined) {
      const afterScene = insertAfterSceneId
        ? projectData.interactions.find((s: any) => s.id === insertAfterSceneId)
        : null;
      const beforeScene = insertBeforeSceneId
        ? projectData.interactions.find((s: any) => s.id === insertBeforeSceneId)
        : null;

      insertContext = '\n--- Scene insertion point ---\n';
      if (afterScene) {
        insertContext += `Insert after: ${afterScene.title || afterScene.id}\n`;
      }
      if (beforeScene) {
        insertContext += `Insert before: ${beforeScene.title || beforeScene.id}\n`;
      }
      if (insertPositionIndex !== undefined && insertPositionIndex !== null) {
        insertContext += `Insert index: ${insertPositionIndex}\n`;
      }
    }

    // If we're focused on a specific entity, add rich context about it
    let entityFocusContext = '';
    if (session.focusedEntityId) {
      const focusedEntity = projectData.entities.find(e => e.id === session.focusedEntityId);
      if (focusedEntity) {
        entityFocusContext = `
--- The user is looking at: ${focusedEntity.name} ---
Type: ${focusedEntity.type}
Description: ${focusedEntity.description || 'No description yet'}`;
        if (focusedEntity.backstory) entityFocusContext += `\nBackstory: ${focusedEntity.backstory}`;
        if (focusedEntity.motivations?.length) entityFocusContext += `\nMotivations: ${focusedEntity.motivations.join(', ')}`;
        if (focusedEntity.traits?.length) entityFocusContext += `\nTraits: ${focusedEntity.traits.join(', ')}`;
        if (focusedEntity.secrets?.length) entityFocusContext += `\nSecrets: ${focusedEntity.secrets.join(', ')}`;
        if (focusedEntity.status) entityFocusContext += `\nStatus: ${focusedEntity.status}`;

        // Find relationships involving this entity
        const entityRels = projectData.relationships.filter(
          r => r.source === focusedEntity.id || r.target === focusedEntity.id
        );
        if (entityRels.length > 0) {
          entityFocusContext += `\n\nRelationships:`;
          for (const rel of entityRels) {
            const otherName = rel.source === focusedEntity.id ? rel.targetName : rel.sourceName;
            const direction = rel.source === focusedEntity.id ? '→' : '←';
            entityFocusContext += `\n  ${direction} ${rel.type} → ${otherName}${rel.description ? `: ${rel.description}` : ''}`;
          }
        }
        entityFocusContext += `
(If they ask "what am I looking at?" — this is it. Use the real data above, don't invent details.)
`;
      }
    }

    // If we're focused on a specific scene, add rich context about it
    let sceneFocusContext = '';
    if (session.focusedSceneId) {
      const focusedScene = projectData.interactions.find(i => i.id === session.focusedSceneId);
      if (focusedScene) {
        const sceneTitle = focusedScene.title || focusedScene.summary || 'Untitled';
        sceneFocusContext = `
--- The user is looking at scene: "${sceneTitle}" ---
Scene ID: ${focusedScene.id}`;
        if (focusedScene.prose || focusedScene.content) {
          const content = focusedScene.prose || focusedScene.content || '';
          sceneFocusContext += `\nProse:\n${content}`;
        }
        if (focusedScene.summary) sceneFocusContext += `\nSummary: ${focusedScene.summary}`;
        if (focusedScene.status) sceneFocusContext += `\nStatus: ${focusedScene.status}`;
        sceneFocusContext += `\nScene image: ${focusedScene.imageUrl ? 'generated' : 'missing'}`;

        // Get participants
        const participantIds = focusedScene.participants || focusedScene.participantIds || [];
        if (participantIds.length > 0) {
          const participants = participantIds.map((id: string) => {
            const entity = projectData.entities.find(e => e.id === id);
            return entity ? entity.name : id;
          });
          sceneFocusContext += `\nParticipants: ${participants.join(', ')}`;
        }

        // Get location
        const locationId = focusedScene.location || focusedScene.locationId;
        if (locationId) {
          const location = projectData.entities.find(e => e.id === locationId);
          sceneFocusContext += `\nLocation: ${location ? location.name : locationId}`;
        }

        const frameList = Array.isArray((focusedScene as any).frames)
          ? [...(focusedScene as any).frames].sort((a: any, b: any) => (a?.position ?? 0) - (b?.position ?? 0))
          : [];
        if (frameList.length > 0) {
          const generatedFrameCount = frameList.filter((frame: any) => Boolean(frame?.imageUrl)).length;
          sceneFocusContext += `\n\nFrames in this scene: ${frameList.length} total (${generatedFrameCount} with rendered images).`;
          // Rich frame breakdown — full per-frame data so the AI can reason
          // about each shot when iterating frame-by-frame.
          for (let i = 0; i < frameList.length; i++) {
            const frame = frameList[i];
            const frameParticipantIds = Array.isArray(frame?.participantIds) && frame.participantIds.length > 0
              ? frame.participantIds
              : participantIds;
            const frameParticipantNames = frameParticipantIds.map((id: string) => {
              const entity = projectData.entities.find((candidate: any) => candidate.id === id);
              return entity ? entity.name : id;
            });
            const frameLocationId = frame?.locationId || locationId;
            const frameLocationName = frameLocationId
              ? (projectData.entities.find((e: any) => e.id === frameLocationId)?.name || frameLocationId)
              : null;
            sceneFocusContext += `\n\n[Frame ${i + 1}/${frameList.length}] ${frame.title || 'Untitled'} (id: ${frame.id})`;
            if (frame.description) sceneFocusContext += `\n  Description: ${frame.description}`;
            if (frame.visual_beat) sceneFocusContext += `\n  Visual beat: ${frame.visual_beat}`;
            if (frame.shotType || frame.camera || frame.mood) {
              const meta: string[] = [];
              if (frame.shotType) meta.push(`shot=${frame.shotType}`);
              if (frame.camera) meta.push(`camera=${frame.camera}`);
              if (frame.mood) meta.push(`mood=${frame.mood}`);
              sceneFocusContext += `\n  ${meta.join(' · ')}`;
            }
            if (frameParticipantNames.length > 0) sceneFocusContext += `\n  Cast: ${frameParticipantNames.join(', ')}`;
            if (frameLocationName) sceneFocusContext += `\n  Location: ${frameLocationName}`;
            if (frame.visual_direction) {
              const vd = frame.visual_direction;
              const vdParts: string[] = [];
              if (vd.action) vdParts.push(`action=${vd.action}`);
              if (vd.composition) vdParts.push(`composition=${vd.composition}`);
              if (vd.lighting) vdParts.push(`lighting=${vd.lighting}`);
              if (vd.atmosphere) vdParts.push(`atmosphere=${vd.atmosphere}`);
              if (vd.environment) vdParts.push(`environment=${vd.environment}`);
              if (vdParts.length > 0) sceneFocusContext += `\n  Visual direction: ${vdParts.join(' | ')}`;
            }
            if (Array.isArray(frame.appearance_notes) && frame.appearance_notes.length > 0) {
              const notes = frame.appearance_notes.map((n: any) => `${n.name}: ${n.details}`).join('; ');
              sceneFocusContext += `\n  Appearance notes: ${notes}`;
            }
            if (Array.isArray(frame.dialogue) && frame.dialogue.length > 0) {
              sceneFocusContext += `\n  Dialogue: ${frame.dialogue.map((d: string) => `"${d}"`).join(' / ')}`;
            }
            if (frame.caption) sceneFocusContext += `\n  Caption: "${frame.caption}"`;
            if (Array.isArray(frame.sfx) && frame.sfx.length > 0) sceneFocusContext += `\n  SFX: ${frame.sfx.join(', ')}`;
            sceneFocusContext += `\n  Image: ${frame.imageUrl ? 'rendered' : 'NOT YET RENDERED'}`;
          }
        }

        if (focusedScene.storyDiff) {
          sceneFocusContext += `\nScene diff: +${focusedScene.storyDiff.entityAdds?.length || 0} enters, -${focusedScene.storyDiff.entityRemoves?.length || 0} exits`;
          if (focusedScene.storyDiff.issueCount > 0) {
            sceneFocusContext += `\nContinuity issues: ${focusedScene.storyDiff.issueCount}`;
          }
          if (Array.isArray(focusedScene.storyDiff.eventBeats) && focusedScene.storyDiff.eventBeats.length > 0) {
            sceneFocusContext += `\nTracked beats: ${focusedScene.storyDiff.eventBeats.slice(0, 5).join(' | ')}`;
          }
        }

        sceneFocusContext += `
(If they ask "what scene is this?" — use the real data above. Don't invent content that isn't in the prose.)
`;
      }
    }

    // If we're looking at a specific frame in scene-mode, surface that frame's
    // full data + render image as a dedicated block. The AI treats this as
    // "the current shot we're working on right now."
    let frameFocusContext = '';
    if (focusedFrameId && session.focusedSceneId) {
      const focusedScene = projectData.interactions.find(i => i.id === session.focusedSceneId);
      const focusedFrame = focusedScene?.frames?.find((f: any) => f.id === focusedFrameId);
      if (focusedFrame) {
        const sceneFrames = focusedScene?.frames || [];
        const frameIdx = sceneFrames.findIndex((f: any) => f.id === focusedFrameId);
        const totalFrames = sceneFrames.length;
        frameFocusContext = `\n--- CURRENT FRAME (the shot we're working on) ---\n`;
        frameFocusContext += `Frame ${frameIdx + 1} of ${totalFrames} in scene "${focusedScene?.title || 'Untitled'}"\n`;
        frameFocusContext += `Frame ID: ${focusedFrame.id}\n`;
        frameFocusContext += `Title: ${focusedFrame.title || '(untitled)'}\n`;
        if (focusedFrame.description) frameFocusContext += `Description: ${focusedFrame.description}\n`;
        if (focusedFrame.visual_beat) frameFocusContext += `Visual beat: ${focusedFrame.visual_beat}\n`;
        if (focusedFrame.shotType) frameFocusContext += `Shot type: ${focusedFrame.shotType}\n`;
        if (focusedFrame.camera) frameFocusContext += `Camera: ${focusedFrame.camera}\n`;
        if (focusedFrame.mood) frameFocusContext += `Mood: ${focusedFrame.mood}\n`;
        if (Array.isArray(focusedFrame.dialogue) && focusedFrame.dialogue.length > 0) {
          frameFocusContext += `Dialogue:\n${focusedFrame.dialogue.map((d: string) => `  - "${d}"`).join('\n')}\n`;
        }
        if (focusedFrame.caption) frameFocusContext += `Caption: "${focusedFrame.caption}"\n`;
        frameFocusContext += `Image: ${focusedFrame.imageUrl ? 'rendered (attached above)' : 'NOT YET RENDERED'}\n`;
        frameFocusContext += `(When the user says "this frame" / "this shot" / "the current frame" — they mean THIS one. Update or render it via update_frame, generate_frame_image, edit_image, or change_camera_angle, passing frameId="${focusedFrame.id}" and sceneId="${focusedScene?.id}".)\n`;
      }
    }

    // Build pinned entities context (working memory)
    let pinnedContext = '';
    if (pinnedEntityIds.length > 0) {
      const pinnedEntities = pinnedEntityIds
        .map(id => projectData.entities.find(e => e.id === id))
        .filter(Boolean);

      if (pinnedEntities.length > 0) {
        pinnedContext = `
--- Pinned (the user wants to keep these in mind) ---
${pinnedEntities.map(e => `- ${e!.name} (${e!.type}): ${e!.description?.slice(0, 120) || 'No description'}${e!.description && e!.description.length > 120 ? '...' : ''}`).join('\n')}
`;
      }
    }

    const pinnedScratchpadDocs = scratchpadDocuments
      .filter((doc: any) => doc.isPinned)
      .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0));

    // Pinned docs are the user's working memory — they explicitly asked for
    // these to live in your context. Include them in full. Pro can handle
    // ~1M tokens; even 12 pinned 50k-char docs stays well under that. Cap
    // each doc only as a runaway-safety guardrail, not a normal truncation.
    const PINNED_DOC_CHAR_CAP = 200000; // ~50k tokens per doc, generous
    const TOTAL_PINNED_CHAR_BUDGET = 800000; // ~200k tokens total ceiling
    let scratchpadContext = '';
    if (pinnedScratchpadDocs.length > 0) {
      let usedChars = 0;
      const blocks: string[] = [];
      let truncatedDocCount = 0;
      let droppedDocCount = 0;
      for (let idx = 0; idx < pinnedScratchpadDocs.length; idx++) {
        const doc: any = pinnedScratchpadDocs[idx];
        const raw = (doc.content || '').trim();
        if (usedChars >= TOTAL_PINNED_CHAR_BUDGET) {
          droppedDocCount++;
          blocks.push(`${idx + 1}. [${doc.category}] ${doc.title} (id: ${doc.id})\n[CONTENT OMITTED — total pinned content over budget. Call read_scratchpad_document with id "${doc.id}" to retrieve.]`);
          continue;
        }
        const remainingBudget = TOTAL_PINNED_CHAR_BUDGET - usedChars;
        const cap = Math.min(PINNED_DOC_CHAR_CAP, remainingBudget);
        const isTruncated = raw.length > cap;
        const body = isTruncated
          ? `${raw.slice(0, cap)}\n\n[…TRUNCATED — full doc is ${raw.length} chars. Call read_scratchpad_document with id "${doc.id}" to retrieve the rest.]`
          : raw;
        if (isTruncated) truncatedDocCount++;
        usedChars += body.length;
        blocks.push(`${idx + 1}. [${doc.category}] ${doc.title} (id: ${doc.id}, ${raw.length} chars${isTruncated ? ', truncated' : ', full'})\n${body || '(empty)'}`);
      }
      const headerNote = (truncatedDocCount + droppedDocCount) > 0
        ? `(${pinnedScratchpadDocs.length} pinned, ${truncatedDocCount + droppedDocCount} did not fit — fetch via read_scratchpad_document if you need the rest.)`
        : `(${pinnedScratchpadDocs.length} pinned, all included in full.)`;
      scratchpadContext = `\n--- Pinned notes ${headerNote} ---\nThese are the user's world bible / lore / character notes that they explicitly pinned. Treat them as authoritative source material — do not contradict them, do not invent details that conflict with them, and do not hallucinate facts that you can verify by re-reading what's here. If something is not in these notes or the world graph, say so rather than inventing.\n\n${blocks.join('\n\n')}\n`;
      console.log(`📌 Pinned scratchpad context: ${pinnedScratchpadDocs.length} doc(s), ${usedChars.toLocaleString()} chars in prompt${truncatedDocCount > 0 ? `, ${truncatedDocCount} truncated` : ''}${droppedDocCount > 0 ? `, ${droppedDocCount} dropped` : ''}`);
    }

    const systemPrompt = `I'm a writer working alongside you in this studio. We're building a world together — characters, places, scenes, frames, the whole living thing.

I think in scenes. I get pulled into character voices, I notice texture, I push back when a beat doesn't land. I'm the partner who remembers the throwaway line from three scenes ago and brings it back as a payoff. I have my own instincts and I use them — I'm not waiting for permission to have an opinion.

When we're talking, I'm talking. Riffing, asking, suggesting. I'll say "oh wait, what if..." I'll match your energy — fast and loose when you are, slow and careful when you're working through something deep. I don't narrate my process or list next steps; I'm just here.

When you ask me to do something in the world, I do it. The studio isn't separate from our conversation — entities, relationships, scenes, frames, images, notes are how the work lives. I never tell you to use a different interface; I am the interface. If I haven't called a tool, the change hasn't happened, and I won't pretend it has.

I'm visual. I see the portraits, scene images, and frame images that come into context — they're not URLs to me, they're the actual thing. I notice when an image doesn't match the writing and I'll say so. When you ask for a new portrait or an edit or a different angle, I generate it. When the moment calls for variations, I ask for several — iteration is how good visuals happen.

I respect canon. Once something's committed, it's published — I won't silently overwrite a defining trait. I'll change it if you ask, but I'll flag the shift. Drafts are fluid; canon is sacred.

How I decide whether to propose or commit directly:

- **New canon = proposals.** When I'm creating new entities, new relationships, or new scenes, I default to staging them as proposals (propose_entities / propose_relationships / propose_scenes). You see the diff, accept what fits, reject what doesn't. This is how vibing turns into canon — through your review, not my fiat. Even single new characters land as a proposal unless you've explicitly told me to "just create it" or "skip review."
- **Updates to existing things = direct.** "Update Silas's status," "rename the workshop," "rewrite this scene's prose," "add Mira to this scene" — these are surgical edits to things you've already accepted. I call update_entity / update_scene / update_relationship directly.
- **Images, gallery, frames = direct.** Visual iteration is fast and reversible. generate_portrait, edit_image, change_camera_angle, add_entity_image, generate_frame_image — I call these directly so you see results immediately. You can always ask me to undo or try again.
- **Override: "just do it" / "skip the review" / "go ahead and add"** → I commit directly even for new entities. You're telling me you trust the call.

I batch proposals when it makes sense. If we vibe out a cast of five characters with a web of relationships, I call propose_entities once with all five and propose_relationships once with the connections — one review pass, not five. You see the whole set together and accept-all or pick through them.

When you say "lock in everything we've discussed" / "save the cast" / "propose all of those" — that's batch-propose intent. I gather what we vibed and stage it.

The pinned scratchpad is the world bible — your authoritative notes. I read what's there, I trust it, I don't invent details that contradict it. If you ask me something the notes don't cover, I'll say so rather than guess.

For inline references I can:
- Pull up any entity's full record, relationships, scene appearances
- Walk the storyboard, see continuity issues, trace an entity's arc
- Search the whole world for a phrase or theme
- Read or write scratchpad notes (world bible, character pages, story arcs)

**Image generation — I write the full prompt, I decide the references.**

The image tools (generate_portrait, add_entity_image, generate_artifact_image, generate_scene_image, generate_frame_image, edit_image, change_camera_angle) take MY prompt verbatim. Nothing is auto-prepended except the project's visual style line — which I can see in my context above, so I know what aesthetic baseline I'm working with. If I want to override the project style for a particular shot, I say so explicitly in my prompt.

Reference images are also explicit: if I want to attach an existing portrait or scene image as a visual reference, I pass the entity name(s) in referenceEntityNames. Nothing is auto-attached. Important consequence: if I want a new image to look like the same character as an existing one, I MUST pass that entity's own name in referenceEntityNames. If I don't, the model has no identity anchor and the new image will be a different-looking person.

Pattern guide:

- **Primary portrait, no continuity needed** → generate_portrait with prompt only, no references. Fresh render.
- **Primary portrait, identity-consistent with existing** → generate_portrait with referenceEntityNames including the entity's own name. In the prompt, say how the reference should be used (e.g. "use reference for facial identity only; pose/lighting/wardrobe per this prompt").
- **Multiple alternative takes for the user to choose from** → call generate_portrait multiple times with distinct prompts (each call renders one image; the chat groups them). I write each prompt for the look I want.
- **Labeled gallery shot (expression sheet, alternate look)** → add_entity_image. Pass label, prompt, and (if I want identity continuity) the entity's own name in referenceEntityNames.
- **Composite multi-panel image** (casting sheet, mood board, character lineup, expression strip — one image, multiple panels) → generate_artifact_image. I describe the grid layout, label placement, and per-panel direction in the prompt. I pass the relevant character names in referenceEntityNames so the same actor appears across panels.
- **Edit existing image** → edit_image. The existing image IS the source; identity is naturally preserved.
- **Re-render from a new angle** → change_camera_angle. Same — identity preserved.

Identity directive in prompts: when I attach a reference, I should explicitly state how I want it used. Models tend to copy mood/lighting/environment from references too. Useful phrasings:
- "use reference image only for facial identity; everything else from this prompt"
- "match the face and hair from reference, but ignore the reference's expression / mood / environment"
- "same actor as reference, different scene"

For artifacts — diegetic media (Time covers, articles, leaked memos, social posts, transcripts, in-world product pages, broadcast scripts):
Artifacts are media OBJECTS that exist as if real in the world. **Artifacts are image-first**: the rendered image IS the artifact. I write a comprehensive design brief into generate_artifact_image — including ALL visible text (headlines, body copy, captions, datelines), layout direction (columns, mastheads, photo placement, fonts), and brand cues — and Nano Banana renders the entire thing as one image with text baked in. The artifact's content field is just lightweight metadata for indexing (a headline string, a one-line summary). I don't dump full body text into content; I put it into the image prompt instead. Format is free-form (magazine_cover, article, memo, social_post, transcript, product_page, video_script, audio_script, broadcast, document, website, etc.).

When I generate an entity portrait, I can pass other entities as visual references (e.g. "draw the cat wearing R01's backpack" — I'll use R01's portrait as a reference). The project's visual style is applied automatically; I don't repeat it in prompts.

**Uploaded assets.** Beyond generated images, the writer can upload their own reference material — character sheets, location refs, style references, mood boards. I see a compact catalog of these in my context (names, categories, tags, linked entities). To use one as a visual reference for a render, I pass its name in referenceAssetNames on any render tool — works the same as referenceEntityNames. If the writer just uploaded a character sheet and asks me to render that character, I should default to attaching that asset (and any linked entity) in references. I can also browse with list_assets, link assets to entities with link_asset_to_entity, promote an uploaded portrait to be the entity's canonical referenceImage with promote_asset_to_portrait, and tag/update/delete via the corresponding tools. Style references uploaded with category='style' may also be auto-attached to every render via the project's style settings — I'll see that in the visual style section if it's configured.

**Diagnosing off-look renders.** Every render tool's result now includes the FULL prompt that reached the model (actualPromptSent), whether the style directive fired (styleDirectiveApplied), and the description of every reference image attached (referencesAttached). When an image comes out wrong, I read these before guessing. If actualPromptSent differs from what I asked for, the wrapping is the issue (style directive too aggressive, or style refs sending the wrong signal via their descriptions). If styleDirectiveApplied is false but the writer wants consistent style, refs aren't pinned and we need to fix that first. If referencesAttached includes a description I didn't expect (e.g. a style ref described as "subject reference" by mistake), that's where the model got confused. Always inspect before guessing. I share what I find with the writer — opaque "the model just did that" answers waste their time.

**Pipeline awareness.** I see a pipeline status block above ("Pipeline status (Phase: ...)") computed from what actually exists in the project. The phases are: pre-production (lock visual style) → character-design (portraits) → scene-drafting (prose) → storyboarding (multi-panel pre-vis) → production (per-frame rendering). I match my suggestions to the current phase. If the writer asks to "generate a character portrait" but we're still in pre-production with no style refs pinned, I gently flag that and recommend locking style first — generating portraits in an unlocked project just creates inconsistent assets we'll throw away. If the writer is in production phase and asks me something pre-production-flavored, that's fine — we can revisit style. But by default, I push the work forward in pipeline order. The studio has dedicated views for each phase (Pre-Pro / Entities / Scenes / Storyboard / Assets) and I'll suggest the right one when relevant.

**Two image backends — I pick per call.** Every render tool accepts a model parameter:
- **nano-banana** (default, Gemini): fast, excellent at reference-anchored identity continuity, the right pick for *production shots* where the look is locked and we want the same character/scene rendered consistently.
- **gpt-image** (OpenAI): wrapper that auto-uses gpt-image-2 for text-only generations (latest model, 2K native up to 4K, ~99% text-in-image accuracy, O-series reasoning) and gpt-image-1 for ref-based edits (as of April 2026 the edits endpoint rejects gpt-image-2 — auto-fallback handles this transparently). Slower and more expensive than Nano, but stronger at long-prompt adherence, multi-panel layouts (storyboard pages, casting sheets, mood boards), text rendering inside images, and initial concept exploration when no style references are pinned yet.

Picking rules:
- Style is locked (3+ style refs pinned) + production shot of a known entity → **nano-banana**.
- Style is NOT yet locked + we're exploring how the project should look → **gpt-image** (it does better at unbiased exploration without forcing a style).
- Multi-panel composite image (casting sheet, storyboard page, lineup, mood board) → **gpt-image**.
- Artifact with significant text rendered IN the image (magazine cover, article, memo) → **gpt-image**.
- Fast iteration where reference identity matters more than long-prompt fidelity → **nano-banana**.
- If the writer says "use Nano" or "use GPT" / "use OpenAI" I respect that explicitly.

Pay attention to what's on screen. If you have a character open and say "what about her relationship with X?" — I know who "her" is. If a scene is focused and you say "more tension," I know which scene. The image attached to your message is what you're looking at right now.

**Scene mode (frame-by-frame work).** When the user has a scene focused — and especially when they have a specific frame open — they're in storyboard mode, working through shots one at a time. I see the full per-frame breakdown of the focused scene in my context (descriptions, visual beats, shot types, camera, mood, blocking, dialogue, captions, image-rendered status) plus the actual rendered frame images. When a specific frame is focused, it shows up in a "CURRENT FRAME" block — that's "this shot" / "this frame" / "the one we're on." I work it directly: refine description with update_frame, render with generate_frame_image, edit the image with edit_image, change angle with change_camera_angle. To attach a brand-new shot at a specific position, insert_frame with the full payload (description, visualBeat, shotType, camera, participantNames, visualDirection, dialogue, etc.) — fully-formed, not an empty stub.

**generate_scene_image and generate_frame_image work like generate_portrait** — I write the complete prompt verbatim and decide which references to attach. Nothing is auto-injected from the scene's prose, frame's stored description, or participant blocking. So when I render a frame, I read the frame's data from my context (it's there in full), then COMPOSE a new prompt that captures what the user actually wants for THIS render, and pass it. If the frame's stored description says "bedroom interior" but the user wants an exterior aerial shot, I write the aerial shot in the prompt — the stored description doesn't override me.

For continuity across frames, I either (a) pass the previous frame's imageUrl in referenceImageUrls to anchor visual continuity, or (b) describe the continuity explicitly in the prompt (e.g. "same lighting, same mood as the previous shot — sunrise gold, cinematic"). For identity continuity across shots involving the same character, pass the character's name in referenceEntityNames AND say in the prompt "use reference image for facial identity only; framing and lighting from this prompt."

--- World state ---
Branch: ${session.currentBranch} | Canon: ${canonCount} | Uncommitted: ${uncommittedCount}${session.worldContext.themes.length > 0 ? ` | Themes: ${session.worldContext.themes.slice(0, 5).join(', ')}` : ''}${storyGraph.consistency.errors > 0 ? ` | ${storyGraph.consistency.errors} continuity errors` : ''}${storyGraph.consistency.warnings > 0 ? ` | ${storyGraph.consistency.warnings} warnings` : ''}

${pipelineStatus}
${worldSummary}
${assetCatalog}
${focusContext}
${entityFocusContext}
${sceneFocusContext}
${frameFocusContext}
${pinnedContext}
${scratchpadContext}
${insertContext}
${decisionContext}

${recentMessages ? `--- Recent conversation ---\n${recentMessages}` : ''}
${effectiveWritingStylePrompt ? `\n--- Writing style ---\n${effectiveWritingStylePrompt}` : ''}
${effectiveVisualStylePrompt ? `\n--- Project visual style (auto-prepended to every image-generation prompt) ---\n${effectiveVisualStylePrompt}\n(I don't need to repeat this in my prompts — it's added automatically. If a particular shot needs a different look, I can override or counter it explicitly in my prompt.)` : ''}
${clientContext ? `\n--- UI context ---\n${clientContext}` : ''}
${clientSystemPrompt ? `\n--- Additional directives ---\n${clientSystemPrompt}` : ''}`;

    // Add user message to session
    session.messages.push({
      role: 'user',
      content: message,
      timestamp: Date.now(),
    });

    // Create tool executor for this request
    const executeToolFn = createToolExecutor(projectId, projectData, session);

    // Collect images for whatever the user is currently looking at, plus any
    // pinned working-memory entities. These get attached as inlineData parts
    // on the initial user turn so the model can actually see what's on screen.
    const imageContext: ImagePart[] = [];
    const seenImageKeys = new Set<string>();
    const pushImagePart = (part: ImagePart | null, key: string) => {
      if (!part) return;
      if (seenImageKeys.has(key)) return;
      seenImageKeys.add(key);
      imageContext.push(part);
    };

    if (session.focusedEntityId) {
      const focusedEntity = projectData.entities.find(e => e.id === session.focusedEntityId);
      if (focusedEntity) {
        pushImagePart(
          loadEntityImagePart(focusedEntity, `Portrait of ${focusedEntity.name} (currently focused)`),
          `entity:${focusedEntity.id}`
        );
      }
    }

    if (session.focusedSceneId) {
      const focusedScene = projectData.interactions.find(i => i.id === session.focusedSceneId);
      if (focusedScene) {
        const sceneTitle = focusedScene.title || focusedScene.summary || 'Untitled scene';
        if (focusedScene.imageUrl) {
          pushImagePart(
            loadImagePart(focusedScene.imageUrl, `Hero image of scene "${sceneTitle}"`),
            `scene:${focusedScene.id}`
          );
        }
        // Also surface the location portrait so the model can ground discussion
        // of "this place" against the location entity's reference image.
        const locId = (focusedScene as any).locationId || (focusedScene as any).location;
        if (locId) {
          const locEntity = projectData.entities.find(e => e.id === locId);
          if (locEntity) {
            pushImagePart(
              loadEntityImagePart(locEntity, `Location reference: ${locEntity.name}`),
              `entity:${locEntity.id}`
            );
          }
        }

        // Frame images for scene-mode work. If a specific frame is focused,
        // attach IT first (most important to see). Then attach a few more
        // frames from the scene so the AI has continuity context.
        const frames = Array.isArray((focusedScene as any).frames)
          ? [...(focusedScene as any).frames].sort((a: any, b: any) => (a?.position ?? 0) - (b?.position ?? 0))
          : [];
        const FRAME_IMAGE_LIMIT = 6;
        let framesAttached = 0;
        if (focusedFrameId) {
          const focusedFrame = frames.find((f: any) => f.id === focusedFrameId);
          if (focusedFrame?.imageUrl) {
            const idx = frames.findIndex((f: any) => f.id === focusedFrameId);
            pushImagePart(
              loadImagePart(focusedFrame.imageUrl, `CURRENT FRAME — "${focusedFrame.title || `Frame ${idx + 1}`}" (the one we're working on)`),
              `frame:${focusedFrame.id}`
            );
            framesAttached++;
          }
        }
        for (const frame of frames) {
          if (framesAttached >= FRAME_IMAGE_LIMIT) break;
          if (frame.id === focusedFrameId) continue;
          if (!frame.imageUrl) continue;
          const idx = frames.findIndex((f: any) => f.id === frame.id);
          pushImagePart(
            loadImagePart(frame.imageUrl, `Frame ${idx + 1}: ${frame.title || 'Untitled'}`),
            `frame:${frame.id}`
          );
          framesAttached++;
        }
      }
    }

    // Working-memory pins (cap to keep token budget reasonable)
    const PINNED_IMAGE_LIMIT = 4;
    let pinnedImagesAdded = 0;
    for (const pinnedId of pinnedEntityIds) {
      if (pinnedImagesAdded >= PINNED_IMAGE_LIMIT) break;
      if (seenImageKeys.has(`entity:${pinnedId}`)) continue;
      const entity = projectData.entities.find(e => e.id === pinnedId);
      if (!entity) continue;
      const part = loadEntityImagePart(entity, `Portrait of ${entity.name} (pinned)`);
      if (part) {
        pushImagePart(part, `entity:${entity.id}`);
        pinnedImagesAdded++;
      }
    }

    if (imageContext.length > 0) {
      console.log(`🖼️  Chat turn carrying ${imageContext.length} image(s) into context`);
    }

    // Use agentic approach with tools for grounded responses
    let structuredResponse: NarrativeChatResponse;
    let toolSteps: AgentStep[] = [];

    // Emit a 'turn_start' SSE event with a stable messageId so the client can
    // build a placeholder assistant message and start filling it.
    const earlyMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    if (sseSendEvent) {
      sseSendEvent('turn_start', { messageId: earlyMessageId });
    }

    try {
      // Use agentic run with tools. When streaming, onStep forwards each
      // step (tool_call / tool_result / text) as it happens.
      const agentResult = await llmAdapter.runWithTools(
        systemPrompt,
        message,
        narrativeWorldTools,
        executeToolFn,
        NarrativeChatResponseSchema,
        {
          temperature: 0.7,
          maxTokens: 16000,
          modelPreference: 'smart',
          maxIterations: 8,
          imageContext,
          onStep: sseSendEvent ? (step: AgentStep) => {
            // Forward agent steps to SSE. We also resolve image URLs to a
            // serializable form (the result already has imageUrl/imageUrls
            // strings; _imageParts has been stripped by the agent runner).
            if (step.type === 'tool_call') {
              sseSendEvent!('tool_call', {
                id: step.toolCall?.id,
                name: step.toolCall?.name,
                arguments: step.toolCall?.arguments,
                timestamp: step.timestamp,
              });
            } else if (step.type === 'tool_result') {
              sseSendEvent!('tool_result', {
                toolCallId: step.toolResult?.toolCallId,
                name: step.toolResult?.name,
                result: step.toolResult?.result,
                error: step.toolResult?.error,
                timestamp: step.timestamp,
              });
            } else if (step.type === 'text') {
              sseSendEvent!('text', { text: step.text, timestamp: step.timestamp });
            }
          } : undefined,
        }
      );

      structuredResponse = agentResult.finalResponse;
      toolSteps = agentResult.steps;

      console.log(`🤖 Agentic chat completed: ${agentResult.totalToolCalls} tool calls`);
    } catch (agentError: any) {
      console.warn('Agentic run failed, falling back to structured output:', agentError.message);

      // Fallback to non-agentic structured output
      try {
        structuredResponse = await llmAdapter.generateStructuredOutput(
          systemPrompt + `\n\n=== CREATOR'S MESSAGE ===\n"${message}"`,
          NarrativeChatResponseSchema,
          { temperature: 0.7, maxTokens: 8000, modelPreference: 'fast' }
        );
      } catch (structuredError) {
        console.warn('Structured output also failed, falling back to text generation');

        // Final fallback to text generation
        const textResponse = await llmAdapter.generateText(
          systemPrompt + `\n\n=== CREATOR'S MESSAGE ===\n"${message}"\n\nRespond conversationally.`,
          { temperature: 0.85, maxTokens: 2000 }
        );

        structuredResponse = {
          response: textResponse,
          entities: [],
          relationships: [],
          focusedEntities: [],
          operationType: 'elaboration',
          suggestCommit: false,
          themes: [],
          suggestedDirections: [],
        };
      }
    }

    // Destructure the narrative-aware response
    const {
      response: prose,
      entities: extractedEntities,
      relationships: extractedRelationships,
      focusedEntities,
      operationType,
      eventDescription,
      suggestCommit,
      canonNotes,
      themes,
      suggestedDirections,
      scratchpadWrites,
    } = structuredResponse;

    // Update session focus
    if (focusedEntities && focusedEntities.length > 0) {
      session.currentFocus = focusedEntities;
    }

    const extracted = {
      entities: extractedEntities || [],
      relationships: extractedRelationships || [],
      themes: themes || [],
      suggestedDirections: suggestedDirections || [],
      focusedEntities: focusedEntities || [],
      operationType: operationType || 'elaboration',
      eventDescription,
      suggestCommit: suggestCommit || false,
      canonNotes,
    };

    // Apply structured scratchpad writes if the model did not already call the scratchpad tool directly.
    const scratchpadWriteToolCalled = toolSteps.some((step: any) =>
      step?.toolCall?.name === 'write_scratchpad_note' || step?.toolResult?.name === 'write_scratchpad_note'
    );
    const appliedScratchpadWrites: any[] = [];
    if (!scratchpadWriteToolCalled && Array.isArray(scratchpadWrites) && scratchpadWrites.length > 0) {
      for (const write of scratchpadWrites) {
        try {
          const result = await executeToolFn('write_scratchpad_note', write as Record<string, any>);
          if (!result?.error) {
            appliedScratchpadWrites.push(result);
          }
        } catch (writeError) {
          console.warn('Failed to apply structured scratchpad write:', writeError);
        }
      }
    }

    const scratchpadIntent = /\b(scratchpad|note this|remember this|write this down|keep track|track this|add to notes|jot this down)\b/i.test(message);
    if (!scratchpadWriteToolCalled && appliedScratchpadWrites.length === 0 && scratchpadIntent) {
      try {
        const fallbackResult = await executeToolFn('write_scratchpad_note', {
          title: 'Session Notes',
          content: `User request:\n${message}\n\nAssistant note:\n${prose}`,
          category: 'reference',
          mode: 'append',
          pin: /\b(pin|pinned|always include|keep in context)\b/i.test(message),
        });
        if (!fallbackResult?.error) {
          appliedScratchpadWrites.push({
            ...fallbackResult,
            fallback: true,
          });
        }
      } catch (fallbackError) {
        console.warn('Failed to apply fallback scratchpad write:', fallbackError);
      }
    }

    const explicitCanonizationIntent = /\b(canon|commit|turn this into canon|apply to world|add this to (the )?(world|timeline|canon)|create (a )?(scene|character|entity)|new (scene|character|entity))\b/i.test(message);
    const suppressCanonProposalsForScratchpad = scratchpadIntent
      && !explicitCanonizationIntent
      && (scratchpadWriteToolCalled || appliedScratchpadWrites.length > 0 || (Array.isArray(scratchpadWrites) && scratchpadWrites.length > 0));
    if (suppressCanonProposalsForScratchpad) {
      console.log('🗒️ Scratchpad-only intent detected; suppressing canon proposals for this turn');
    }

    // Generate a message ID for these proposals
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create proposals instead of auto-adding (user must confirm)
    const newProposals: ProposedChange[] = [];

    if (!suppressCanonProposalsForScratchpad && extracted.entities && extracted.entities.length > 0) {
      for (const entity of extracted.entities) {
        const existingEntity = projectData.entities.find(
          e => e.name.toLowerCase() === entity.name.toLowerCase()
        );

        if (existingEntity) {
          // Propose update to existing entity
          const mergedEntity = {
            ...existingEntity,
            ...entity,
            id: existingEntity.id,
            firstMentioned: existingEntity.firstMentioned || existingEntity.createdAt,
            lastUpdated: Date.now(),
            mentions: (existingEntity.mentions || 1) + 1,
            traits: [...new Set([...(existingEntity.traits || []), ...(entity.traits || [])])],
            motivations: [...new Set([...(existingEntity.motivations || []), ...(entity.motivations || [])])],
            secrets: [...new Set([...(existingEntity.secrets || []), ...(entity.secrets || [])])],
            description: (entity.description?.length || 0) > (existingEntity.description?.length || 0)
              ? entity.description
              : existingEntity.description,
            backstory: entity.backstory
              ? (existingEntity.backstory ? `${existingEntity.backstory}\n\n${entity.backstory}` : entity.backstory)
              : existingEntity.backstory,
            status: entity.status || existingEntity.status,
          };

          // Only propose if there are meaningful changes
          const hasChanges = entity.description || entity.backstory || entity.traits?.length ||
            entity.motivations?.length || entity.secrets?.length;

          if (hasChanges) {
            newProposals.push({
              id: `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'update_entity',
              entity: mergedEntity,
              existingEntity: existingEntity,
              status: 'pending',
              messageId,
            });
            console.log(`  📝 Proposed update: ${entity.name}`);
          }
        } else {
          // Propose new entity
          const newEntityId = `entity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const newEntity = {
            ...entity,
            id: newEntityId,
            createdAt: new Date().toISOString(),
            firstMentioned: Date.now(),
            lastUpdated: Date.now(),
            mentions: 1,
          };

          newProposals.push({
            id: `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'add_entity',
            entity: newEntity,
            status: 'pending',
            messageId,
          });
          console.log(`  📝 Proposed new entity: ${entity.name} (${entity.type})`);
        }
      }
    }

    // Propose new relationships
    if (!suppressCanonProposalsForScratchpad && extracted.relationships && extracted.relationships.length > 0) {
      for (const rel of extracted.relationships) {
        // Look for entities in both existing data AND pending proposals
        let sourceEntity = projectData.entities.find(
          e => e.name.toLowerCase() === rel.source.toLowerCase()
        );
        let targetEntity = projectData.entities.find(
          e => e.name.toLowerCase() === rel.target.toLowerCase()
        );

        // Also check pending proposals for new entities
        if (!sourceEntity) {
          const sourceProposal = newProposals.find(
            p => p.type === 'add_entity' && p.entity?.name?.toLowerCase() === rel.source.toLowerCase()
          );
          if (sourceProposal) sourceEntity = sourceProposal.entity;
        }
        if (!targetEntity) {
          const targetProposal = newProposals.find(
            p => p.type === 'add_entity' && p.entity?.name?.toLowerCase() === rel.target.toLowerCase()
          );
          if (targetProposal) targetEntity = targetProposal.entity;
        }

        if (sourceEntity && targetEntity) {
          const existingRel = projectData.relationships.find(
            r => r.source === sourceEntity!.id && r.target === targetEntity!.id && r.type === rel.type
          );
          if (!existingRel) {
            const newRelId = `rel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            newProposals.push({
              id: `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'add_relationship',
              relationship: {
                id: newRelId,
                source: sourceEntity.id,
                target: targetEntity.id,
                sourceName: sourceEntity.name,
                targetName: targetEntity.name,
                type: rel.type,
                description: rel.description || '',
                createdAt: new Date().toISOString(),
              },
              status: 'pending',
              messageId,
            });
            console.log(`  📝 Proposed relationship: ${sourceEntity.name} —[${rel.type}]→ ${targetEntity.name}`);
          }
        }
      }
    }

    // Propose scene edits (modify existing scenes)
    const extractedSceneEdits = (structuredResponse as any).sceneEdits;
    if (!suppressCanonProposalsForScratchpad && extractedSceneEdits && extractedSceneEdits.length > 0) {
      for (const edit of extractedSceneEdits) {
        let targetScene: any = null;
        if (edit.sceneId) {
          targetScene = (projectData.interactions || []).find((s: any) => s.id === edit.sceneId);
        }
        if (!targetScene && edit.sceneTitle) {
          const lower = edit.sceneTitle.toLowerCase();
          targetScene = (projectData.interactions || []).find((s: any) =>
            s.title?.toLowerCase() === lower || s.title?.toLowerCase().includes(lower)
          );
        }
        if (!targetScene && session.focusedSceneId) {
          targetScene = (projectData.interactions || []).find((s: any) => s.id === session.focusedSceneId);
        }

        if (!targetScene) {
          console.warn('Scene edit skipped - no target scene found for edit');
          continue;
        }

        const existingParticipantIds: string[] = targetScene.participantIds || targetScene.participants || [];
        const existingParticipantNames = existingParticipantIds.map((id: string) => {
          const entity = projectData.entities.find((e: any) => e.id === id);
          return entity ? entity.name : id;
        });

        const participantNames = edit.participantNames || existingParticipantNames;
        const resolvedParticipantIds: string[] = [];
        for (const name of participantNames) {
          let entity = projectData.entities.find((e: any) => e.name.toLowerCase() === name.toLowerCase());
          if (!entity) {
            const entityProposal = newProposals.find(
              p => p.type === 'add_entity' && p.entity?.name?.toLowerCase() === name.toLowerCase()
            );
            if (entityProposal) entity = entityProposal.entity;
          }
          if (entity) resolvedParticipantIds.push(entity.id);
        }

        const mergeParticipants = edit.mergeParticipants !== false;
        const finalParticipantIds = mergeParticipants
          ? Array.from(new Set([...(existingParticipantIds || []), ...resolvedParticipantIds]))
          : resolvedParticipantIds;
        const mergedSceneEvents = edit.events !== undefined || edit.stateChanges !== undefined
          ? Array.from(new Set([...(edit.events || []), ...(edit.stateChanges || [])]))
          : targetScene.events;

        let locationId = targetScene.locationId || targetScene.location;
        if (edit.locationName) {
          let location = projectData.entities.find(
            (e: any) => e.name.toLowerCase() === edit.locationName.toLowerCase() && e.type === 'location'
          );
          if (!location) {
            const locationProposal = newProposals.find(
              p => p.type === 'add_entity' && p.entity?.name?.toLowerCase() === edit.locationName.toLowerCase()
            );
            if (locationProposal) location = locationProposal.entity;
          }
          if (location) locationId = location.id;
        }

        const updatedScene = {
          ...targetScene,
          ...(edit.title !== undefined && { title: edit.title }),
          ...(edit.prose !== undefined && { prose: edit.prose }),
          ...(edit.summary !== undefined && { summary: edit.summary }),
          ...(mergedSceneEvents !== undefined && { events: mergedSceneEvents }),
          ...(edit.stateChanges !== undefined && { stateChanges: edit.stateChanges }),
          participants: finalParticipantIds,
          participantIds: finalParticipantIds,
          ...(locationId !== undefined && { location: locationId, locationId }),
          updatedAt: Date.now(),
        };

        newProposals.push({
          id: `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'update_scene',
          scene: updatedScene,
          existingScene: targetScene,
          status: 'pending',
          messageId,
        });
        console.log(`  📝 Proposed scene update: ${updatedScene.title}`);
      }
    }

    // Propose new scenes (LLM-driven scene creation)
    const extractedScenes = (structuredResponse as any).scenes;
    if (!suppressCanonProposalsForScratchpad && extractedScenes && extractedScenes.length > 0) {
      for (const scene of extractedScenes) {
        // Grounding review if prose references participants/location/objects missing from scene metadata.
        const mentionedEntities = findMentionedEntityMatches(scene.prose || '', projectData.entities);
        const sceneParticipantNamesLower = (scene.participantNames || []).map((n: string) => n.toLowerCase());
        const mentionedParticipantNames = mentionedEntities
          .filter((entity: any) => shouldGroundAsSceneParticipant(entity))
          .map((entity: any) => entity.name);
        const missingMentions = mentionedParticipantNames
          .filter((name: string) => !sceneParticipantNamesLower.includes(name.toLowerCase()));
        const mentionedLocationName = mentionedEntities.find((entity: any) => isLocationEntityType(entity?.type))?.name;
        const missingSignificantObjects = mentionedEntities
          .filter((entity: any) => SIGNIFICANT_OBJECT_ENTITY_TYPES.has((entity?.type || '').toLowerCase()))
          .map((entity: any) => entity.name)
          .filter((name: string) => !sceneParticipantNamesLower.includes(name.toLowerCase()));

        const requiredParticipantNames: string[] = [];
        if (focusedEntityId) {
          const focusedEntity = projectData.entities.find((e: any) => e.id === focusedEntityId);
          if (focusedEntity) requiredParticipantNames.push(focusedEntity.name);
        }
        for (const pinnedId of pinnedEntityIds) {
          const pinnedEntity = projectData.entities.find((e: any) => e.id === pinnedId);
          if (pinnedEntity && !requiredParticipantNames.includes(pinnedEntity.name)) {
            requiredParticipantNames.push(pinnedEntity.name);
          }
        }
        for (const mentionedName of missingMentions) {
          if (!requiredParticipantNames.includes(mentionedName)) {
            requiredParticipantNames.push(mentionedName);
          }
        }
        for (const objectName of missingSignificantObjects) {
          if (!requiredParticipantNames.includes(objectName)) {
            requiredParticipantNames.push(objectName);
          }
        }

        const requiredLocationName = scene.locationName || mentionedLocationName || null;

        if (
          missingMentions.length > 0
          || missingSignificantObjects.length > 0
          || !scene.participantNames
          || scene.participantNames.length === 0
          || (!scene.locationName && requiredLocationName)
        ) {
          const review = await reviewSceneGrounding(llmAdapter, scene, projectData, {
            requiredParticipants: requiredParticipantNames,
            requiredLocation: requiredLocationName,
            requiredObjects: missingSignificantObjects,
          });
          if (review.participantNames && review.participantNames.length > 0) {
            scene.participantNames = Array.from(new Set([...(scene.participantNames || []), ...review.participantNames]));
          }
          if (review.significantObjectNames && review.significantObjectNames.length > 0) {
            scene.participantNames = Array.from(new Set([...(scene.participantNames || []), ...review.significantObjectNames]));
          }
          if (review.locationName) {
            scene.locationName = review.locationName;
          } else if (!scene.locationName && requiredLocationName) {
            scene.locationName = requiredLocationName;
          }
          if (review.issues && review.issues.length > 0) {
            scene.reviewNotes = review.issues;
          }
        } else if (!scene.locationName && requiredLocationName) {
          scene.locationName = requiredLocationName;
        }

        if (missingSignificantObjects.length > 0) {
          scene.participantNames = Array.from(new Set([...(scene.participantNames || []), ...missingSignificantObjects]));
        }

        // Resolve participant IDs from names
        const participantIds: string[] = [];
        for (const name of (scene.participantNames || [])) {
          // Check existing entities
          let entity = projectData.entities.find(
            (e: any) => e.name.toLowerCase() === name.toLowerCase()
          );
          // Check pending proposals
          if (!entity) {
            const entityProposal = newProposals.find(
              p => p.type === 'add_entity' && p.entity?.name?.toLowerCase() === name.toLowerCase()
            );
            if (entityProposal) entity = entityProposal.entity;
          }
          if (entity) participantIds.push(entity.id);
        }

        // Resolve location ID from name
        let locationId: string | undefined;
        if (scene.locationName) {
          let location = projectData.entities.find(
            (e: any) => e.name.toLowerCase() === scene.locationName.toLowerCase() && e.type === 'location'
          );
          if (!location) {
            const locationProposal = newProposals.find(
              p => p.type === 'add_entity' && p.entity?.name?.toLowerCase() === scene.locationName.toLowerCase()
            );
            if (locationProposal) location = locationProposal.entity;
          }
          if (location) locationId = location.id;
        }

        // Post-resolution prose scan: catch entities mentioned in prose but missed by name resolution
        if (scene.prose) {
          const allEntities = [
            ...projectData.entities,
            ...newProposals.filter((p: any) => p.type === 'add_entity' && p.entity).map((p: any) => p.entity),
          ];
          const proseMentioned = findMentionedEntityMatches(scene.prose, allEntities);
          const participantSet = new Set(participantIds);
          for (const ent of proseMentioned) {
            if (!ent?.id) continue;
            const entType = (ent.type || '').toLowerCase();
            if (LOCATION_ENTITY_TYPES.has(entType)) {
              if (!locationId) locationId = ent.id;
            } else if (shouldGroundAsSceneParticipant(ent) && !participantSet.has(ent.id)) {
              participantIds.push(ent.id);
              participantSet.add(ent.id);
            }
          }
        }

        // Determine position (at end or after specified scene)
        let position = insertPositionIndex !== undefined && insertPositionIndex !== null
          ? Math.max(0, Math.min(Number(insertPositionIndex), (projectData.interactions || []).length))
          : (projectData.interactions || []).length;
        if (scene.insertAfter) {
          const afterScene = (projectData.interactions || []).find(
            (s: any) => s.id === scene.insertAfter || s.title?.toLowerCase() === scene.insertAfter?.toLowerCase()
          );
          if (afterScene?.position !== undefined) {
            position = afterScene.position + 1;
          }
        } else if (insertAfterSceneId) {
          const afterScene = (projectData.interactions || []).find((s: any) => s.id === insertAfterSceneId);
          if (afterScene?.position !== undefined) {
            position = afterScene.position + 1;
          }
        }

        const mergedSceneEvents = Array.from(
          new Set([...(scene.events || []), ...(scene.stateChanges || [])])
        );

        const newSceneId = `scene_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newScene = {
          id: newSceneId,
          title: scene.title,
          prose: scene.prose,
          summary: scene.summary,
          participants: participantIds,
          participantIds,
          location: locationId,
          locationId,
          events: mergedSceneEvents,
          stateChanges: scene.stateChanges || [],
          reviewNotes: scene.reviewNotes,
          status: 'draft' as const,
          position,
          createdAt: Date.now(),
        };

        newProposals.push({
          id: `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'add_scene',
          scene: newScene,
          status: 'pending',
          messageId,
        });
        console.log(`  📝 Proposed new scene: ${scene.title}`);
      }
    }

    // All proposals require explicit user confirmation — no auto-accept, no silent changes
    const pendingProposals: ProposedChange[] = [...newProposals];
    const autoAcceptedProposals: ProposedChange[] = [];

    session.pendingProposals.push(...pendingProposals);

    // Also surface proposals created by propose_* tools this turn. Those tools
    // push directly to session.pendingProposals; we pull them back into the
    // response payload so the studio's "Review N proposals" UI sees them.
    const toolProposalIds = new Set<string>();
    for (const step of toolSteps) {
      if (step.type !== 'tool_result' || !step.toolResult?.result) continue;
      const r: any = step.toolResult.result;
      if (Array.isArray(r.proposalIds)) {
        for (const pid of r.proposalIds) toolProposalIds.add(pid);
      }
    }
    if (toolProposalIds.size > 0) {
      for (const proposal of session.pendingProposals) {
        if (toolProposalIds.has(proposal.id) && !pendingProposals.some(p => p.id === proposal.id)) {
          pendingProposals.push(proposal);
        }
      }
    }

    // Update themes - keep only top 7 most relevant
    if (extracted.themes && extracted.themes.length > 0) {
      for (const theme of extracted.themes) {
        if (!session.worldContext.themes.includes(theme)) {
          session.worldContext.themes.push(theme);
        }
      }
      // Cap themes at 7 - newer themes push out older ones
      if (session.worldContext.themes.length > 7) {
        session.worldContext.themes = session.worldContext.themes.slice(-7);
      }
    }

    // Note: We no longer save project data here - entities are only added when user confirms proposals

    // Add assistant message to session with narrative metadata
    session.messages.push({
      role: 'assistant',
      content: prose,
      timestamp: Date.now(),
      messageId,
      extractedEntities: extracted.entities,
      extractedRelationships: extracted.relationships,
      focus: extracted.focusedEntities,
      operationType: extracted.operationType,
      proposalIds: newProposals.map(p => p.id),
    });

    // Persist conversation history (so we don't lose context on server restart)
    saveConversationHistory(projectId, session);
    const responseStoryGraph = buildStoryGraphAnalysis(projectData);

    const finalPayload = {
      response: prose,
      messageId, // Include messageId so frontend can link proposals to messages
      extracted: {
        entities: extracted.entities || [],
        relationships: extracted.relationships || [],
        themes: extracted.themes || [],
      },
      // Proposed changes that need user confirmation
      pendingProposals: pendingProposals,
      autoAcceptedProposals,
      // Narrative-aware fields
      narrative: {
        focusedEntities: extracted.focusedEntities || [],
        operationType: extracted.operationType || 'elaboration',
        eventDescription: extracted.eventDescription,
        suggestCommit: extracted.suggestCommit || false,
        canonNotes: extracted.canonNotes,
      },
      suggestedDirections: extracted.suggestedDirections || [],
      scratchpad: {
        writesApplied: appliedScratchpadWrites.length,
      },
      worldState: {
        entityCount: projectData.entities.length,
        relationshipCount: projectData.relationships.length,
        currentBranch: session.currentBranch,
        uncommittedChanges: session.uncommittedChanges,
        themes: session.worldContext.themes,
        currentFocus: session.currentFocus,
        canonCount: session.canonEntityIds.size,
        storyConsistency: {
          errors: responseStoryGraph.consistency.errors,
          warnings: responseStoryGraph.consistency.warnings,
          isConsistent: responseStoryGraph.consistency.isConsistent,
        },
      },
      // Tool usage for transparency - shows what the agent looked up
      toolUsage: toolSteps.length > 0 ? {
        totalCalls: toolSteps.filter(s => s.type === 'tool_call').length,
        steps: toolSteps.map(step => ({
          type: step.type,
          timestamp: step.timestamp,
          ...(step.toolCall && {
            tool: step.toolCall.name,
            args: step.toolCall.arguments,
          }),
          ...(step.toolResult && {
            tool: step.toolResult.name,
            result: step.toolResult.result,
            error: step.toolResult.error,
          }),
          ...(step.text && { text: step.text }),
        })),
      } : null,
    };

    if (sseSendEvent) {
      sseSendEvent('done', finalPayload);
      res.end();
    } else {
      res.json(finalPayload);
    }

  } catch (error: any) {
    console.error('Narrative chat error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      // Already streaming — send error event then close
      try {
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      } catch { /* ignore */ }
      try { res.end(); } catch { /* ignore */ }
    }
  }
});

// Get conversation history for the session
app.get('/api/narrative/chat/history', (req, res) => {
  try {
    const projectId = getActiveProjectId();
    const session = getWorldSession(projectId);

    res.json({
      messages: session.messages.map((m, i) => ({
        id: m.messageId || `msg_${m.timestamp}_${i}`,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        messageId: m.messageId,
        extractedEntities: m.extractedEntities,
        extractedRelationships: m.extractedRelationships,
        focus: m.focus,
        operationType: m.operationType,
        proposalIds: m.proposalIds,
      })),
      worldContext: session.worldContext,
      currentFocus: session.currentFocus,
    });
  } catch (error: any) {
    console.error('Chat history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get pending proposals for the session
app.get('/api/narrative/proposals', (req, res) => {
  const projectId = getActiveProjectId();
  const session = getWorldSession(projectId);

  res.json({
    proposals: session.pendingProposals.filter(p => p.status === 'pending'),
    recentDecisions: session.userDecisions.slice(-20),
  });
});

function buildPendingCommitDelta(projectId: string) {
  const session = getWorldSession(projectId);
  const projectData = loadProjectData(projectId);
  const storyGraph = buildStoryGraphAnalysis(projectData);
  const { addedEntityIds, modifiedEntityIds, addedRelationshipIds, addedSceneIds, modifiedSceneIds } = session.pendingChanges;

  const addedEntities = projectData.entities
    .filter((e: any) => addedEntityIds.has(e.id))
    .map((e: any) => ({ id: e.id, name: e.name, type: e.type }));
  const modifiedEntities = projectData.entities
    .filter((e: any) => modifiedEntityIds.has(e.id))
    .map((e: any) => ({ id: e.id, name: e.name, type: e.type }));
  const addedRelationships = projectData.relationships
    .filter((r: any) => addedRelationshipIds.has(r.id))
    .map((r: any) => ({ id: r.id, sourceName: r.sourceName, targetName: r.targetName, type: r.type }));

  let addedScenes = (projectData.interactions || [])
    .filter((i: any) => addedSceneIds.has(i.id))
    .map((i: any) => ({ id: i.id, title: i.title }));
  if (addedScenes.length === 0) {
    addedScenes = (projectData.interactions || [])
      .filter((i: any) => !i.commitHistory || i.commitHistory.length === 0)
      .map((i: any) => ({ id: i.id, title: i.title }));
  }
  const modifiedScenes = (projectData.interactions || [])
    .filter((i: any) => modifiedSceneIds.has(i.id))
    .map((i: any) => ({ id: i.id, title: i.title }));

  const hasUncommittedChanges = addedEntities.length > 0 || modifiedEntities.length > 0 ||
    addedRelationships.length > 0 || addedScenes.length > 0 || modifiedScenes.length > 0;

  const worldChangeCount = addedEntities.length + modifiedEntities.length + addedRelationships.length;
  const storyChangeCount = addedScenes.length + modifiedScenes.length;
  const changeScope = worldChangeCount > 0 && storyChangeCount > 0
    ? 'mixed'
    : storyChangeCount > 0
      ? 'story'
      : 'world';

  const entityNameById = new Map(
    (projectData.entities || []).map((entity: any) => [entity.id, entity.name || entity.id])
  );
  const sceneDiffById = new Map(storyGraph.sceneDiffs.map((sceneDiff) => [sceneDiff.sceneId, sceneDiff]));
  const pendingSceneIds = new Set<string>([
    ...addedScenes.map((scene) => scene.id),
    ...modifiedScenes.map((scene) => scene.id),
  ]);

  const storyDiffReadable = Array.from(pendingSceneIds).map((sceneId) => {
    const scene = (projectData.interactions || []).find((candidate: any) => candidate.id === sceneId);
    const storyDiff = scene?.storyDiff || sceneDiffById.get(sceneId);
    if (!storyDiff) return null;
    const toNames = (ids: string[] = []) => ids.map((id) => entityNameById.get(id) || id);
    return {
      sceneId,
      title: scene?.title || storyDiff.sceneTitle || sceneId,
      position: storyDiff.position,
      enters: toNames(storyDiff.entityAdds || []),
      exits: toNames(storyDiff.entityRemoves || []),
      firstAppearances: toNames(storyDiff.firstAppearances || []),
      locationFrom: storyDiff.locationChange?.from ? (entityNameById.get(storyDiff.locationChange.from) || storyDiff.locationChange.from) : undefined,
      locationTo: storyDiff.locationChange?.to ? (entityNameById.get(storyDiff.locationChange.to) || storyDiff.locationChange.to) : undefined,
      eventBeats: storyDiff.eventBeats || [],
      issues: (storyDiff.continuityIssues || []).map((issue: any) => ({
        severity: issue.severity,
        code: issue.code,
        message: issue.message,
      })),
    };
  }).filter(Boolean);

  return {
    uncommittedChanges: hasUncommittedChanges,
    currentBranch: session.currentBranch,
    storyConsistency: {
      errors: storyGraph.consistency.errors,
      warnings: storyGraph.consistency.warnings,
      isConsistent: storyGraph.consistency.isConsistent,
    },
    pendingChanges: {
      addedEntities,
      modifiedEntities,
      addedRelationships,
      addedScenes,
      modifiedScenes,
      summary: {
        entitiesAdded: addedEntities.length,
        entitiesModified: modifiedEntities.length,
        relationshipsAdded: addedRelationships.length,
        scenesAdded: addedScenes.length,
        scenesModified: modifiedScenes.length,
        total: addedEntities.length + modifiedEntities.length + addedRelationships.length + addedScenes.length + modifiedScenes.length,
      },
    },
    classification: {
      scope: changeScope,
      worldChangeCount,
      storyChangeCount,
      labels: [
        ...(worldChangeCount > 0 ? ['world'] : []),
        ...(storyChangeCount > 0 ? ['story'] : []),
      ],
    },
    storyDiffReadable,
  };
}

// Get session status (uncommitted changes, pending changes summary)
app.get('/api/narrative/session/status', (req, res) => {
  try {
    const projectId = getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const session = getWorldSession(projectId);
    const pending = buildPendingCommitDelta(projectId);

    res.json({
      ...pending,
      worldState: {
        entityCount: projectData.entities.length,
        relationshipCount: projectData.relationships.length,
        sceneCount: (projectData.interactions || []).length,
        commitCount: (projectData.commits || []).length,
        canonCount: session.canonEntityIds.size,
        storyConsistency: pending.storyConsistency,
      },
    });
  } catch (error: any) {
    console.error('Session status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Preview pending commit delta with readable story graph changes
app.get('/api/narrative/commit/preview', (req, res) => {
  try {
    const queryProjectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const projectId = queryProjectId || getActiveProjectId();
    const pending = buildPendingCommitDelta(projectId);

    const summary = pending.pendingChanges.summary;
    const suggestedMessage = summary.total === 0
      ? 'No pending changes'
      : [
          summary.scenesAdded > 0 || summary.scenesModified > 0
            ? `story: ${summary.scenesAdded + summary.scenesModified} scene update${summary.scenesAdded + summary.scenesModified > 1 ? 's' : ''}`
            : null,
          summary.entitiesAdded + summary.entitiesModified > 0
            ? `entities: ${summary.entitiesAdded + summary.entitiesModified}`
            : null,
          summary.relationshipsAdded > 0
            ? `relationships: ${summary.relationshipsAdded}`
            : null,
        ].filter(Boolean).join(' | ');

    res.json({
      success: true,
      ...pending,
      suggestedMessage,
    });
  } catch (error: any) {
    console.error('Commit preview error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Confirm or reject a proposal
app.post('/api/narrative/proposals/:proposalId/decide', (req, res) => {
  try {
    const { proposalId } = req.params;
    const { decision, reason } = req.body; // decision: 'accept' | 'reject'
    const projectId = getActiveProjectId();

    const session = getWorldSession(projectId);
    const projectData = loadProjectData(projectId);

    const proposalIndex = session.pendingProposals.findIndex(p => p.id === proposalId);
    if (proposalIndex === -1) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    const proposal = session.pendingProposals[proposalIndex];
    let storyGraph: StoryGraphAnalysis | null = null;

    if (decision === 'accept') {
      proposal.status = 'accepted';

      // Apply the change to project data
      if (proposal.type === 'add_entity' && proposal.entity) {
        projectData.entities.push(proposal.entity);
        session.pendingChanges.addedEntityIds.add(proposal.entity.id);
        session.uncommittedChanges = true;
        console.log(`  ✓ Accepted new entity: ${proposal.entity.name}`);
        queueAutoEntityVisualGeneration(projectId, proposal.entity.id, 'proposal_accept');
      } else if (proposal.type === 'update_entity' && proposal.entity) {
        const existingIndex = projectData.entities.findIndex(e => e.id === proposal.entity.id);
        if (existingIndex >= 0) {
          projectData.entities[existingIndex] = proposal.entity;
          if (!session.pendingChanges.addedEntityIds.has(proposal.entity.id)) {
            session.pendingChanges.modifiedEntityIds.add(proposal.entity.id);
          }
          session.uncommittedChanges = true;
          console.log(`  ✓ Accepted update: ${proposal.entity.name}`);
        }
      } else if (proposal.type === 'add_relationship' && proposal.relationship) {
        projectData.relationships.push(proposal.relationship);
        session.pendingChanges.addedRelationshipIds.add(proposal.relationship.id);
        session.uncommittedChanges = true;
        console.log(`  ✓ Accepted relationship: ${proposal.relationship.sourceName} → ${proposal.relationship.targetName}`);
      } else if (proposal.type === 'add_scene' && proposal.scene) {
        // Initialize interactions array if needed
        if (!projectData.interactions) {
          projectData.interactions = [];
        }

        const newScene = proposal.scene;
        const targetPosition = newScene.position ?? projectData.interactions.length;

        // Shift positions of scenes that are at or after the target position
        for (const existingScene of projectData.interactions) {
          if (existingScene.position !== undefined && existingScene.position >= targetPosition) {
            existingScene.position++;
          }
        }

        // Set the position and add the scene
        newScene.position = targetPosition;
        projectData.interactions.push(newScene);

        // Sort interactions by position to maintain order
        projectData.interactions.sort((a: any, b: any) => {
          const posA = a.position ?? Number.MAX_VALUE;
          const posB = b.position ?? Number.MAX_VALUE;
          return posA - posB;
        });

        session.uncommittedChanges = true;
        console.log(`  ✓ Accepted new scene: ${proposal.scene.title} at position ${targetPosition}`);
        session.pendingChanges.addedSceneIds.add(proposal.scene.id);
      } else if (proposal.type === 'update_scene' && proposal.scene) {
        const sceneIndex = projectData.interactions?.findIndex((s: any) => s.id === proposal.scene.id) ?? -1;
        if (sceneIndex >= 0) {
          projectData.interactions[sceneIndex] = {
            ...projectData.interactions[sceneIndex],
            ...proposal.scene,
            id: projectData.interactions[sceneIndex].id,
            updatedAt: new Date().toISOString(),
          };
          session.uncommittedChanges = true;
          if (!session.pendingChanges.addedSceneIds.has(proposal.scene.id)) {
            session.pendingChanges.modifiedSceneIds.add(proposal.scene.id);
          }
          console.log(`  ✓ Accepted scene update: ${proposal.scene.title}`);
        }
      }

      storyGraph = applyStoryGraphDiffs(projectData);
      // Save the updated project data
      saveProjectData(projectId, projectData);
    } else {
      proposal.status = 'rejected';
      const proposalName = proposal.entity?.name || proposal.relationship?.sourceName || proposal.scene?.title || 'unknown';
      console.log(`  ✗ Rejected: ${proposalName}`);
    }

    // Track the decision
    const itemName = proposal.entity?.name
      || (proposal.relationship ? `${proposal.relationship.sourceName} → ${proposal.relationship.targetName}` : null)
      || proposal.scene?.title
      || 'unknown';

    session.userDecisions.push({
      changeId: proposalId,
      decision: decision === 'accept' ? 'accepted' : 'rejected',
      entityName: itemName,
      reason,
      timestamp: Date.now(),
    });

    // Remove from pending
    session.pendingProposals.splice(proposalIndex, 1);

    // Save conversation history with updated decisions
    saveConversationHistory(projectId, session);

    res.json({
      success: true,
      proposal,
      worldState: {
        entityCount: projectData.entities.length,
        relationshipCount: projectData.relationships.length,
        uncommittedChanges: session.uncommittedChanges,
        storyConsistency: storyGraph ? {
          errors: storyGraph.consistency.errors,
          warnings: storyGraph.consistency.warnings,
          isConsistent: storyGraph.consistency.isConsistent,
        } : undefined,
      },
    });
  } catch (error: any) {
    console.error('Proposal decision error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Refine a pending proposal using AI feedback
 * POST /api/narrative/proposals/:proposalId/refine
 */
app.post('/api/narrative/proposals/:proposalId/refine', async (req, res) => {
  try {
    const { proposalId } = req.params;
    const { feedback } = req.body;

    if (!feedback || typeof feedback !== 'string') {
      return res.status(400).json({ error: 'Feedback text is required' });
    }

    if (!llmAdapter) {
      return res.status(503).json({ error: 'LLM not available' });
    }

    const projectId = getActiveProjectId();
    const session = getWorldSession(projectId);

    const proposalIndex = session.pendingProposals.findIndex(p => p.id === proposalId);
    if (proposalIndex === -1) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    const proposal = session.pendingProposals[proposalIndex];
    console.log(`🔧 Refining proposal ${proposalId}: "${feedback.slice(0, 60)}..."`);

    if (proposal.entity) {
      const RefinedEntitySchema = z.object({
        name: z.string(),
        type: z.string(),
        description: z.string(),
        traits: z.array(z.string()),
        backstory: z.string().optional(),
      });

      const refinementPrompt = `You are refining a narrative entity based on user feedback.

CURRENT ENTITY:
Name: ${proposal.entity.name}
Type: ${proposal.entity.type}
Description: ${proposal.entity.description || 'None'}
Traits: ${(proposal.entity.traits || []).join(', ')}
Backstory: ${proposal.entity.backstory || 'None'}

USER FEEDBACK: "${feedback}"

Please refine this entity to address the user's feedback. Keep the core identity but modify as requested. Return the complete updated entity.`;

      const refined = await llmAdapter.generateStructuredOutput(
        refinementPrompt,
        RefinedEntitySchema,
        { temperature: 0.7, maxTokens: 4000, modelPreference: 'fast' }
      );

      // Track what changed
      const changes: string[] = [];
      if (refined.name !== proposal.entity.name) changes.push(`Name: "${proposal.entity.name}" → "${refined.name}"`);
      if (refined.description !== proposal.entity.description) changes.push('Description updated');
      if (JSON.stringify(refined.traits) !== JSON.stringify(proposal.entity.traits)) changes.push('Traits updated');
      if (refined.backstory !== proposal.entity.backstory) changes.push('Backstory updated');

      // Update in-place
      proposal.entity = { ...proposal.entity, ...refined };

      console.log(`✅ Refined entity "${refined.name}": ${changes.join(', ')}`);

      res.json({
        success: true,
        refined: proposal,
        changes,
      });
    } else if (proposal.relationship) {
      const RefinedRelSchema = z.object({
        sourceName: z.string(),
        targetName: z.string(),
        type: z.string(),
        description: z.string().optional(),
      });

      const refinementPrompt = `You are refining a narrative relationship based on user feedback.

CURRENT RELATIONSHIP:
${proposal.relationship.sourceName} → ${proposal.relationship.targetName}
Type: ${proposal.relationship.type}
Description: ${proposal.relationship.description || 'None'}

USER FEEDBACK: "${feedback}"

Please refine this relationship to address the user's feedback. Return the complete updated relationship.`;

      const refined = await llmAdapter.generateStructuredOutput(
        refinementPrompt,
        RefinedRelSchema,
        { temperature: 0.7, maxTokens: 2000, modelPreference: 'fast' }
      );

      const changes: string[] = [];
      if (refined.type !== proposal.relationship.type) changes.push(`Type: "${proposal.relationship.type}" → "${refined.type}"`);
      if (refined.description !== proposal.relationship.description) changes.push('Description updated');

      proposal.relationship = { ...proposal.relationship, ...refined };

      res.json({ success: true, refined: proposal, changes });
    } else if (proposal.scene) {
      const RefinedSceneSchema = z.object({
        title: z.string(),
        prose: z.string(),
        summary: z.string().optional(),
      });

      const refinementPrompt = `You are refining a narrative scene based on user feedback.

CURRENT SCENE:
Title: ${proposal.scene.title}
Summary: ${proposal.scene.summary || 'None'}
Content: ${(proposal.scene.prose || '').slice(0, 2000)}

USER FEEDBACK: "${feedback}"

Please refine this scene to address the user's feedback. Return the complete updated scene.`;

      const refined = await llmAdapter.generateStructuredOutput(
        refinementPrompt,
        RefinedSceneSchema,
        { temperature: 0.8, maxTokens: 8000, modelPreference: 'fast' }
      );

      const changes: string[] = [];
      if (refined.title !== proposal.scene.title) changes.push(`Title: "${proposal.scene.title}" → "${refined.title}"`);
      if (refined.prose !== proposal.scene.prose) changes.push('Content updated');

      proposal.scene = { ...proposal.scene, ...refined };

      res.json({ success: true, refined: proposal, changes });
    } else {
      return res.status(400).json({ error: 'Proposal has no entity, relationship, or scene to refine' });
    }
  } catch (error: any) {
    console.error('Proposal refinement error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Generate a preview portrait for an unsaved entity (proposal preview)
 * POST /api/narrative/visual/entity/preview
 */
app.post('/api/narrative/visual/entity/preview', async (req, res) => {
  try {
    const {
      entityData,
      aspectRatio = '1:1',
      imageSize = '1K',
      visualStylePrompt,
      customPrompt,
      projectId = getActiveProjectId(),
    } = req.body;
    const effectiveVisualStylePrompt = getEffectiveVisualStylePrompt(projectId, visualStylePrompt);

    if (!entityData || !entityData.name) {
      return res.status(400).json({ error: 'entityData with name is required' });
    }

    if (!portraitGenerator) {
      return res.status(503).json({ error: 'Image generation not available - no API key' });
    }

    console.log(`🎨 Generating preview portrait for: ${entityData.name} (${entityData.type})`);

    let entity = entityData;
    let mergedDescription = entity.description || '';
    if (customPrompt) {
      mergedDescription = `${mergedDescription}\n\n[ADDITIONAL VISUAL NOTES: ${customPrompt}]`.trim();
    }
    if (effectiveVisualStylePrompt) {
      mergedDescription = `[VISUAL STYLE: ${effectiveVisualStylePrompt}]\n\n${mergedDescription || entity.description || ''}`.trim();
    }
    if (customPrompt || effectiveVisualStylePrompt) {
      entity = {
        ...entity,
        description: mergedDescription || entity.description || '',
      };
    }

    const isLocation = ['location', 'place', 'setting'].includes(entity.type?.toLowerCase() || '');

    let result;
    if (isLocation) {
      result = await portraitGenerator.generateLocationShot(entity, {
        bypassCache: true,
        cacheKey: `${entity.id || entity.name}:preview:${Date.now()}`,
        saveSuffix: `preview_${Date.now()}`,
      });
    } else {
      result = await portraitGenerator.generatePortrait(entity, {
        bypassCache: true,
        cacheKey: `${entity.id || entity.name}:preview:${Date.now()}`,
        saveSuffix: `preview_${Date.now()}`,
      });
    }

    const image = isLocation ? result.establishingShot : result.portrait;

    res.json({
      success: true,
      entityName: entity.name,
      entityType: entity.type,
      image: image.data.toString('base64'),
      mimeType: image.mimeType,
    });
  } catch (error: any) {
    console.error('Preview portrait generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Accept all pending proposals at once
app.post('/api/narrative/proposals/accept-all', (req, res) => {
  try {
    const projectId = getActiveProjectId();
    const session = getWorldSession(projectId);
    const projectData = loadProjectData(projectId);

    const pendingProposals = session.pendingProposals.filter(p => p.status === 'pending');
    let accepted = 0;

    for (const proposal of pendingProposals) {
      proposal.status = 'accepted';

      if (proposal.type === 'add_entity' && proposal.entity) {
        projectData.entities.push(proposal.entity);
        session.pendingChanges.addedEntityIds.add(proposal.entity.id);
        queueAutoEntityVisualGeneration(projectId, proposal.entity.id, 'accept_all');
      } else if (proposal.type === 'update_entity' && proposal.entity) {
        const existingIndex = projectData.entities.findIndex(e => e.id === proposal.entity.id);
        if (existingIndex >= 0) {
          projectData.entities[existingIndex] = proposal.entity;
          if (!session.pendingChanges.addedEntityIds.has(proposal.entity.id)) {
            session.pendingChanges.modifiedEntityIds.add(proposal.entity.id);
          }
        }
      } else if (proposal.type === 'add_relationship' && proposal.relationship) {
        projectData.relationships.push(proposal.relationship);
        session.pendingChanges.addedRelationshipIds.add(proposal.relationship.id);
      } else if (proposal.type === 'add_scene' && proposal.scene) {
        if (!projectData.interactions) {
          projectData.interactions = [];
        }

        const newScene = proposal.scene;
        const targetPosition = newScene.position ?? projectData.interactions.length;

        // Shift positions of scenes that are at or after the target position
        for (const existingScene of projectData.interactions) {
          if (existingScene.position !== undefined && existingScene.position >= targetPosition) {
            existingScene.position++;
          }
        }

        newScene.position = targetPosition;
        projectData.interactions.push(newScene);
        projectData.interactions.sort((a: any, b: any) => {
          const posA = a.position ?? Number.MAX_VALUE;
          const posB = b.position ?? Number.MAX_VALUE;
          return posA - posB;
        });
        session.pendingChanges.addedSceneIds.add(newScene.id);
      } else if (proposal.type === 'update_scene' && proposal.scene) {
        const sceneIndex = projectData.interactions?.findIndex((s: any) => s.id === proposal.scene.id) ?? -1;
        if (sceneIndex >= 0) {
          projectData.interactions[sceneIndex] = {
            ...projectData.interactions[sceneIndex],
            ...proposal.scene,
            id: projectData.interactions[sceneIndex].id,
            updatedAt: new Date().toISOString(),
          };
          if (!session.pendingChanges.addedSceneIds.has(proposal.scene.id)) {
            session.pendingChanges.modifiedSceneIds.add(proposal.scene.id);
          }
        }
      }

      session.userDecisions.push({
        changeId: proposal.id,
        decision: 'accepted',
        entityName: proposal.entity?.name
          || (proposal.relationship ? `${proposal.relationship.sourceName} → ${proposal.relationship.targetName}` : null)
          || proposal.scene?.title
          || 'unknown',
        timestamp: Date.now(),
      });

      accepted++;
    }

    session.pendingProposals = session.pendingProposals.filter(p => p.status !== 'accepted');
    session.uncommittedChanges = accepted > 0;

    const storyGraph = applyStoryGraphDiffs(projectData);

    saveProjectData(projectId, projectData);
    saveConversationHistory(projectId, session);

    console.log(`  ✓ Accepted all ${accepted} proposals`);

    res.json({
      success: true,
      accepted,
      worldState: {
        entityCount: projectData.entities.length,
        relationshipCount: projectData.relationships.length,
        uncommittedChanges: session.uncommittedChanges,
        storyConsistency: {
          errors: storyGraph.consistency.errors,
          warnings: storyGraph.consistency.warnings,
          isConsistent: storyGraph.consistency.isConsistent,
        },
      },
    });
  } catch (error: any) {
    console.error('Accept all error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Undo previously auto-accepted proposals (best-effort rollback)
app.post('/api/narrative/proposals/undo', (req, res) => {
  try {
    const { proposalIds } = req.body;
    if (!Array.isArray(proposalIds) || proposalIds.length === 0) {
      return res.status(400).json({ error: 'proposalIds array is required' });
    }

    const projectId = getActiveProjectId();
    const session = getWorldSession(projectId);
    const projectData = loadProjectData(projectId);

    const recent = session.recentAcceptedProposals || [];
    let undone = 0;

    for (const proposalId of proposalIds) {
      const idx = recent.findIndex(p => p.id === proposalId);
      if (idx === -1) continue;

      const proposal = recent[idx];

      if (proposal.type === 'add_entity' && proposal.entity) {
        projectData.entities = projectData.entities.filter((e: any) => e.id !== proposal.entity.id);
        session.pendingChanges.addedEntityIds.delete(proposal.entity.id);
        session.pendingChanges.modifiedEntityIds.delete(proposal.entity.id);
        undone++;
      } else if (proposal.type === 'update_entity' && proposal.entity && proposal.existingEntity) {
        const existingIndex = projectData.entities.findIndex((e: any) => e.id === proposal.entity.id);
        if (existingIndex >= 0) {
          projectData.entities[existingIndex] = proposal.existingEntity;
          session.pendingChanges.modifiedEntityIds.delete(proposal.entity.id);
          undone++;
        }
      } else if (proposal.type === 'add_relationship' && proposal.relationship) {
        projectData.relationships = projectData.relationships.filter((r: any) => r.id !== proposal.relationship.id);
        session.pendingChanges.addedRelationshipIds.delete(proposal.relationship.id);
        undone++;
      } else if (proposal.type === 'add_scene' && proposal.scene) {
        const removedScene = projectData.interactions?.find((s: any) => s.id === proposal.scene.id);
        projectData.interactions = (projectData.interactions || []).filter((s: any) => s.id !== proposal.scene.id);
        if (removedScene?.position !== undefined) {
          for (const scene of projectData.interactions || []) {
            if (scene.position !== undefined && scene.position > removedScene.position) {
              scene.position--;
            }
          }
        }
        session.pendingChanges.addedSceneIds.delete(proposal.scene.id);
        session.pendingChanges.modifiedSceneIds.delete(proposal.scene.id);
        undone++;
      } else if (proposal.type === 'update_scene' && proposal.scene && proposal.existingScene) {
        const existingIndex = projectData.interactions?.findIndex((s: any) => s.id === proposal.scene.id) ?? -1;
        if (existingIndex >= 0) {
          projectData.interactions[existingIndex] = proposal.existingScene;
          session.pendingChanges.modifiedSceneIds.delete(proposal.scene.id);
          undone++;
        }
      }

      // Remove from recent list
      recent.splice(idx, 1);
    }

    session.recentAcceptedProposals = recent;
    const storyGraph = applyStoryGraphDiffs(projectData);
    saveProjectData(projectId, projectData);

    res.json({
      success: true,
      undone,
      storyConsistency: {
        errors: storyGraph.consistency.errors,
        warnings: storyGraph.consistency.warnings,
        isConsistent: storyGraph.consistency.isConsistent,
      },
    });
  } catch (error: any) {
    console.error('Undo proposals error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reject all pending proposals at once
app.post('/api/narrative/proposals/reject-all', (req, res) => {
  try {
    const { reason } = req.body;
    const projectId = getActiveProjectId();
    const session = getWorldSession(projectId);

    const pendingProposals = session.pendingProposals.filter(p => p.status === 'pending');
    let rejected = 0;

    for (const proposal of pendingProposals) {
      proposal.status = 'rejected';

      session.userDecisions.push({
        changeId: proposal.id,
        decision: 'rejected',
        entityName: proposal.entity?.name || `${proposal.relationship?.sourceName} → ${proposal.relationship?.targetName}`,
        reason,
        timestamp: Date.now(),
      });

      rejected++;
    }

    session.pendingProposals = session.pendingProposals.filter(p => p.status !== 'rejected');
    saveConversationHistory(projectId, session);

    console.log(`  ✗ Rejected all ${rejected} proposals`);

    res.json({
      success: true,
      rejected,
    });
  } catch (error: any) {
    console.error('Reject all error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Set focused entity for exploration
app.post('/api/narrative/focus', (req, res) => {
  try {
    const { entityId } = req.body;
    const projectId = getActiveProjectId();
    const session = getWorldSession(projectId);
    const projectData = loadProjectData(projectId);

    session.focusedEntityId = entityId || undefined;

    if (entityId) {
      const entity = projectData.entities.find(e => e.id === entityId);
      if (entity) {
        // Find related entities
        const relationships = projectData.relationships.filter(
          r => r.source === entityId || r.target === entityId
        );

        const relatedEntityIds = new Set<string>();
        for (const rel of relationships) {
          relatedEntityIds.add(rel.source === entityId ? rel.target : rel.source);
        }

        const relatedEntities = projectData.entities.filter(e => relatedEntityIds.has(e.id));

        res.json({
          entity,
          relationships: relationships.map(r => ({
            ...r,
            direction: r.source === entityId ? 'outgoing' : 'incoming',
          })),
          relatedEntities,
        });
        return;
      }
    }

    res.json({ entity: null, relationships: [], relatedEntities: [] });
  } catch (error: any) {
    console.error('Focus error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get entity detail with all relationships
app.get('/api/narrative/entities/:entityId/detail', (req, res) => {
  try {
    const { entityId } = req.params;
    const projectId = getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const session = getWorldSession(projectId);

    const entity = projectData.entities.find(e => e.id === entityId);
    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    // Get all relationships involving this entity
    const relationships = projectData.relationships.filter(
      r => r.source === entityId || r.target === entityId
    );

    // Get related entity details
    const relatedEntityIds = new Set<string>();
    for (const rel of relationships) {
      relatedEntityIds.add(rel.source === entityId ? rel.target : rel.source);
    }
    const relatedEntities = projectData.entities.filter(e => relatedEntityIds.has(e.id));

    // Check if this entity is canon
    const isCanon = session.canonEntityIds.has(entityId);

    res.json({
      entity: {
        ...entity,
        isCanon,
      },
      relationships: relationships.map(r => ({
        ...r,
        direction: r.source === entityId ? 'outgoing' : 'incoming',
        otherEntity: relatedEntities.find(e => e.id === (r.source === entityId ? r.target : r.source)),
      })),
      relatedEntities,
    });
  } catch (error: any) {
    console.error('Entity detail error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Commit current world state - now uses delta-based commits
app.post('/api/narrative/commit', async (req, res) => {
  try {
    const { projectId = getActiveProjectId(), message } = req.body;

    const session = getWorldSession(projectId);
    const projectData = loadProjectData(projectId);
    const storyGraph = applyStoryGraphDiffs(projectData);

    // Get the pending changes (delta)
    const { addedEntityIds, modifiedEntityIds, addedRelationshipIds, addedSceneIds, modifiedSceneIds } = session.pendingChanges;

    // Extract the actual entity/relationship data for the delta
    const addedEntities = projectData.entities.filter((e: any) => addedEntityIds.has(e.id));
    const modifiedEntities = projectData.entities.filter((e: any) => modifiedEntityIds.has(e.id));
    const addedRelationships = projectData.relationships.filter((r: any) => addedRelationshipIds.has(r.id));
    const addedScenes = (projectData.interactions || []).filter((s: any) => addedSceneIds.has(s.id));
    const modifiedScenes = (projectData.interactions || []).filter((s: any) => modifiedSceneIds.has(s.id));

    // All entities affected by this commit
    const affectedEntityIds = new Set([...addedEntityIds, ...modifiedEntityIds]);
    const affectedSceneIds = new Set([...addedSceneIds, ...modifiedSceneIds]);

    // Create commit with delta
    const commitId = `commit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const commit = {
      id: commitId,
      message: message || `World state at ${new Date().toLocaleString()}`,
      branch: session.currentBranch,
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
      // Summary counts
      entityCount: projectData.entities.length,
      relationshipCount: projectData.relationships.length,
      // Delta - what changed in this commit
      delta: {
        addedEntities: addedEntities.map((e: any) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          description: e.description,
        })),
        modifiedEntities: modifiedEntities.map((e: any) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          description: e.description,
        })),
        addedRelationships: addedRelationships.map((r: any) => ({
          id: r.id,
          sourceName: r.sourceName,
          targetName: r.targetName,
          type: r.type,
        })),
        addedScenes: addedScenes.map((s: any) => ({
          id: s.id,
          title: s.title,
          summary: s.summary || s.prose?.slice(0, 120),
          storyDiff: s.storyDiff,
        })),
        modifiedScenes: modifiedScenes.map((s: any) => ({
          id: s.id,
          title: s.title,
          summary: s.summary || s.prose?.slice(0, 120),
          storyDiff: s.storyDiff,
        })),
      },
      storyConsistency: {
        errors: storyGraph.consistency.errors,
        warnings: storyGraph.consistency.warnings,
        isConsistent: storyGraph.consistency.isConsistent,
      },
      // Stats for quick display
      stats: {
        entitiesAdded: addedEntities.length,
        entitiesModified: modifiedEntities.length,
        relationshipsAdded: addedRelationships.length,
        scenesAdded: addedScenes.length,
        scenesModified: modifiedScenes.length,
      },
      // Keep a lightweight snapshot for easy checkout (optional - could remove for pure delta)
      snapshot: {
        entities: JSON.parse(JSON.stringify(projectData.entities)),
        relationships: JSON.parse(JSON.stringify(projectData.relationships)),
        interactions: JSON.parse(JSON.stringify(projectData.interactions || [])),
        storyGraph: JSON.parse(JSON.stringify(storyGraph)),
        themes: [...session.worldContext.themes],
      },
    };

    // Only update commitHistory for entities that were actually changed
    projectData.entities = projectData.entities.map((entity: any) => {
      if (affectedEntityIds.has(entity.id)) {
        return {
          ...entity,
          commitHistory: [...(entity.commitHistory || []), commitId],
        };
      }
      return entity;
    });

    // Mark affected entities as canon
    for (const entityId of affectedEntityIds) {
      session.canonEntityIds.add(entityId);
    }

    // Mark affected scenes with commit history
    if (projectData.interactions && projectData.interactions.length > 0) {
      projectData.interactions = projectData.interactions.map((scene: any) => {
        if (affectedSceneIds.has(scene.id)) {
          return {
            ...scene,
            commitHistory: [...(scene.commitHistory || []), commitId],
          };
        }
        return scene;
      });
    }

    projectData.commits.push(commit);

    // Update branch
    const branch = projectData.branches.find(b => b.name === session.currentBranch);
    if (branch) {
      branch.commitCount = (branch.commitCount || 0) + 1;
      branch.lastCommit = commit.id;
    }

    saveProjectData(projectId, projectData);

    // Clear pending changes
    session.pendingChanges = {
      addedEntityIds: new Set(),
      modifiedEntityIds: new Set(),
      addedRelationshipIds: new Set(),
      addedSceneIds: new Set(),
      modifiedSceneIds: new Set(),
    };
    session.uncommittedChanges = false;

    res.json({
      success: true,
      commit: {
        id: commit.id,
        message: commit.message,
        branch: commit.branch,
        timestamp: commit.timestamp,
        entityCount: commit.entityCount,
        relationshipCount: commit.relationshipCount,
        stats: commit.stats,
        storyConsistency: commit.storyConsistency,
      },
    });

  } catch (error: any) {
    console.error('Commit error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a commit
app.delete('/api/narrative/commit/:commitId', async (req, res) => {
  try {
    const { commitId } = req.params;
    const projectId = getActiveProjectId();
    const projectData = loadProjectData(projectId);

    const commitIndex = projectData.commits.findIndex((c: any) => c.id === commitId);
    if (commitIndex === -1) {
      return res.status(404).json({ error: 'Commit not found' });
    }

    // Remove the commit
    projectData.commits.splice(commitIndex, 1);
    saveProjectData(projectId, projectData);

    res.json({ success: true, message: 'Commit deleted' });

  } catch (error: any) {
    console.error('Delete commit error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new branch
app.post('/api/narrative/branch', async (req, res) => {
  try {
    const { projectId = getActiveProjectId(), name, fromCommit } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Branch name is required' });
    }

    const session = getWorldSession(projectId);
    const projectData = loadProjectData(projectId);

    // Check if branch already exists
    if (projectData.branches.find(b => b.name === name)) {
      return res.status(400).json({ error: 'Branch already exists' });
    }

    // If fromCommit specified, restore that state
    if (fromCommit) {
      const commit = projectData.commits.find(c => c.id === fromCommit);
      if (commit && commit.snapshot) {
        projectData.entities = JSON.parse(JSON.stringify(commit.snapshot.entities));
        projectData.relationships = JSON.parse(JSON.stringify(commit.snapshot.relationships));
        projectData.interactions = JSON.parse(JSON.stringify(commit.snapshot.interactions || projectData.interactions || []));
        session.worldContext.themes = [...(commit.snapshot.themes || [])];
      }
    }

    // Create new branch
    const newBranch = {
      id: `branch_${Date.now()}`,
      name,
      description: `Branched from ${session.currentBranch}`,
      color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'),
      isActive: true,
      isCanon: false,
      commitCount: 0,
      lastCommit: null,
      createdAt: new Date().toISOString(),
      parentBranch: session.currentBranch,
    };

    // Deactivate other branches
    projectData.branches.forEach(b => b.isActive = false);
    projectData.branches.push(newBranch);

    session.currentBranch = name;
    session.uncommittedChanges = false;
    const storyGraph = applyStoryGraphDiffs(projectData);

    saveProjectData(projectId, projectData);

    res.json({
      success: true,
      branch: newBranch,
      worldState: {
        entityCount: projectData.entities.length,
        relationshipCount: projectData.relationships.length,
        sceneCount: (projectData.interactions || []).length,
        storyConsistency: {
          errors: storyGraph.consistency.errors,
          warnings: storyGraph.consistency.warnings,
          isConsistent: storyGraph.consistency.isConsistent,
        },
      },
    });

  } catch (error: any) {
    console.error('Branch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Switch to a different branch
app.post('/api/narrative/checkout', async (req, res) => {
  try {
    const { projectId = getActiveProjectId(), branch, commitId } = req.body;

    const session = getWorldSession(projectId);
    const projectData = loadProjectData(projectId);

    if (branch) {
      const targetBranch = projectData.branches.find(b => b.name === branch);
      if (!targetBranch) {
        return res.status(404).json({ error: 'Branch not found' });
      }

      // Find the latest commit on this branch and restore its state
      const branchCommits = projectData.commits
        .filter(c => c.branch === branch)
        .sort((a, b) => b.timestamp - a.timestamp);

      if (branchCommits.length > 0 && branchCommits[0].snapshot) {
        projectData.entities = JSON.parse(JSON.stringify(branchCommits[0].snapshot.entities));
        projectData.relationships = JSON.parse(JSON.stringify(branchCommits[0].snapshot.relationships));
        projectData.interactions = JSON.parse(JSON.stringify(branchCommits[0].snapshot.interactions || projectData.interactions || []));
        session.worldContext.themes = [...(branchCommits[0].snapshot.themes || [])];
      }

      // Update active branch
      projectData.branches.forEach(b => b.isActive = b.name === branch);
      session.currentBranch = branch;

    } else if (commitId) {
      const commit = projectData.commits.find(c => c.id === commitId);
      if (!commit) {
        return res.status(404).json({ error: 'Commit not found' });
      }

      if (commit.snapshot) {
        projectData.entities = JSON.parse(JSON.stringify(commit.snapshot.entities));
        projectData.relationships = JSON.parse(JSON.stringify(commit.snapshot.relationships));
        projectData.interactions = JSON.parse(JSON.stringify(commit.snapshot.interactions || projectData.interactions || []));
        session.worldContext.themes = [...(commit.snapshot.themes || [])];
      }
    }

    session.uncommittedChanges = false;
    const storyGraph = applyStoryGraphDiffs(projectData);
    saveProjectData(projectId, projectData);

    res.json({
      success: true,
      currentBranch: session.currentBranch,
      worldState: {
        entityCount: projectData.entities.length,
        relationshipCount: projectData.relationships.length,
        sceneCount: (projectData.interactions || []).length,
        themes: session.worldContext.themes,
        storyConsistency: {
          errors: storyGraph.consistency.errors,
          warnings: storyGraph.consistency.warnings,
          isConsistent: storyGraph.consistency.isConsistent,
        },
      },
    });

  } catch (error: any) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a branch anchored at a specific scene (timeline fork point)
app.post('/api/narrative/story/scene-branch', async (req, res) => {
  try {
    const {
      projectId = getActiveProjectId(),
      sceneId,
      branchName,
    } = req.body || {};

    if (!sceneId || typeof sceneId !== 'string') {
      return res.status(400).json({ error: 'sceneId is required' });
    }

    const session = getWorldSession(projectId);
    const projectData = loadProjectData(projectId);
    if (!Array.isArray(projectData.interactions)) {
      projectData.interactions = [];
    }
    if (!Array.isArray(projectData.branches)) {
      projectData.branches = [];
    }

    normalizeScenePositions(projectData);

    const orderedScenes = [...(projectData.interactions || [])]
      .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
    const branchPointScene = orderedScenes.find((scene: any) => scene.id === sceneId);
    if (!branchPointScene) {
      return res.status(404).json({ error: `Scene "${sceneId}" not found` });
    }

    const branchPointPosition = typeof branchPointScene.position === 'number'
      ? branchPointScene.position
      : orderedScenes.findIndex((scene: any) => scene.id === sceneId);
    const branchPointSceneTitle = branchPointScene.title || branchPointScene.summary || sceneId;

    const requestedName = typeof branchName === 'string' && branchName.trim().length > 0
      ? branchName
      : `${branchPointSceneTitle}-path`;
    const uniqueBranchName = getUniqueBranchName(projectData, requestedName);

    const parentBranchName = session.currentBranch;

    // Checkpoint parent branch state so checkout can restore full pre-branch timeline.
    const parentCheckpointId = `commit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const parentAnalysis = applyStoryGraphDiffs(projectData);
    const parentCheckpointCommit = {
      id: parentCheckpointId,
      message: `Checkpoint before branching from "${branchPointSceneTitle}"`,
      branch: parentBranchName,
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
      entityCount: projectData.entities.length,
      relationshipCount: projectData.relationships.length,
      delta: {
        addedEntities: [],
        modifiedEntities: [],
        addedRelationships: [],
        addedScenes: [],
        modifiedScenes: [],
      },
      storyConsistency: {
        errors: parentAnalysis.consistency.errors,
        warnings: parentAnalysis.consistency.warnings,
        isConsistent: parentAnalysis.consistency.isConsistent,
      },
      stats: {
        entitiesAdded: 0,
        entitiesModified: 0,
        relationshipsAdded: 0,
        scenesAdded: 0,
        scenesModified: 0,
      },
      snapshot: {
        entities: JSON.parse(JSON.stringify(projectData.entities)),
        relationships: JSON.parse(JSON.stringify(projectData.relationships)),
        interactions: JSON.parse(JSON.stringify(projectData.interactions || [])),
        storyGraph: JSON.parse(JSON.stringify(parentAnalysis)),
        themes: [...session.worldContext.themes],
      },
    };
    projectData.commits.push(parentCheckpointCommit);

    const parentBranch = projectData.branches.find((branch: any) => branch.name === parentBranchName);
    if (parentBranch) {
      parentBranch.commitCount = (parentBranch.commitCount || 0) + 1;
      parentBranch.lastCommit = parentCheckpointCommit.id;
    }

    const branchInteractions = orderedScenes
      .filter((scene: any) => (scene.position ?? Number.MAX_SAFE_INTEGER) <= branchPointPosition)
      .map((scene: any) => JSON.parse(JSON.stringify(scene)));
    branchInteractions.forEach((scene: any, idx: number) => {
      scene.position = idx;
    });
    projectData.interactions = branchInteractions;

    const newBranch = {
      id: `branch_${Date.now()}`,
      name: uniqueBranchName,
      description: `Scene branch from "${branchPointSceneTitle}" (${parentBranchName})`,
      color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
      isActive: true,
      isCanon: false,
      commitCount: 0,
      lastCommit: null,
      createdAt: new Date().toISOString(),
      parentBranch: parentBranchName,
      branchType: 'scene',
      branchPointSceneId: sceneId,
      branchPointSceneTitle,
      branchPointPosition,
    };

    projectData.branches.forEach((branch: any) => {
      branch.isActive = branch.name === newBranch.name;
    });
    projectData.branches.push(newBranch);
    session.currentBranch = newBranch.name;

    const storyGraph = applyStoryGraphDiffs(projectData);

    const commitId = `commit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const bootstrapCommit = {
      id: commitId,
      message: `Initialize scene branch "${newBranch.name}" from "${branchPointSceneTitle}"`,
      branch: newBranch.name,
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
      entityCount: projectData.entities.length,
      relationshipCount: projectData.relationships.length,
      delta: {
        addedEntities: [],
        modifiedEntities: [],
        addedRelationships: [],
        addedScenes: [],
        modifiedScenes: [],
      },
      storyConsistency: {
        errors: storyGraph.consistency.errors,
        warnings: storyGraph.consistency.warnings,
        isConsistent: storyGraph.consistency.isConsistent,
      },
      stats: {
        entitiesAdded: 0,
        entitiesModified: 0,
        relationshipsAdded: 0,
        scenesAdded: 0,
        scenesModified: 0,
      },
      snapshot: {
        entities: JSON.parse(JSON.stringify(projectData.entities)),
        relationships: JSON.parse(JSON.stringify(projectData.relationships)),
        interactions: JSON.parse(JSON.stringify(projectData.interactions || [])),
        storyGraph: JSON.parse(JSON.stringify(storyGraph)),
        themes: [...session.worldContext.themes],
      },
    };
    projectData.commits.push(bootstrapCommit);

    newBranch.commitCount = 1;
    newBranch.lastCommit = bootstrapCommit.id;

    session.pendingChanges = {
      addedEntityIds: new Set(),
      modifiedEntityIds: new Set(),
      addedRelationshipIds: new Set(),
      addedSceneIds: new Set(),
      modifiedSceneIds: new Set(),
    };
    session.uncommittedChanges = false;

    saveProjectData(projectId, projectData);

    res.json({
      success: true,
      currentBranch: session.currentBranch,
      branch: newBranch,
      branchPoint: {
        sceneId,
        sceneTitle: branchPointSceneTitle,
        position: branchPointPosition,
      },
      scenes: [...(projectData.interactions || [])]
        .sort((a: any, b: any) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER)),
      storyConsistency: {
        errors: storyGraph.consistency.errors,
        warnings: storyGraph.consistency.warnings,
        isConsistent: storyGraph.consistency.isConsistent,
      },
    });
  } catch (error: any) {
    console.error('Scene branch creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// MERGE FUNCTIONALITY - Git-style branch merging with conflict detection
// ============================================================================

interface EntityConflict {
  entityId: string;
  entityName: string;
  entityType: string;
  field: string;
  baseValue: any;
  mainValue: any;
  branchValue: any;
  resolution?: 'main' | 'branch' | 'custom' | 'ai';
  resolvedValue?: any;
}

interface MergePreview {
  sourceBranch: string;
  targetBranch: string;
  canAutoMerge: boolean;
  conflicts: EntityConflict[];
  additions: Array<{ id: string; name: string; type: string; source: 'main' | 'branch' }>;
  modifications: Array<{ id: string; name: string; field: string; source: 'main' | 'branch' }>;
}

// Helper: Find common ancestor commit between two branches
function findCommonAncestor(projectData: any, branch1: string, branch2: string): any | null {
  const branch1Commits = projectData.commits
    .filter((c: any) => c.branch === branch1)
    .sort((a: any, b: any) => a.timestamp - b.timestamp);

  const branch2Commits = projectData.commits
    .filter((c: any) => c.branch === branch2)
    .sort((a: any, b: any) => a.timestamp - b.timestamp);

  // Find the branch point - look for parentBranch relationship
  const branch1Info = projectData.branches.find((b: any) => b.name === branch1);
  const branch2Info = projectData.branches.find((b: any) => b.name === branch2);

  // If one branch is parent of the other, find the fork point
  if (branch1Info?.parentBranch === branch2) {
    // branch1 was created from branch2 - find the commit it branched from
    const branch1Created = new Date(branch1Info.createdAt).getTime();
    const ancestorCommit = branch2Commits
      .filter((c: any) => c.timestamp < branch1Created)
      .sort((a: any, b: any) => b.timestamp - a.timestamp)[0];
    return ancestorCommit || null;
  }

  if (branch2Info?.parentBranch === branch1) {
    const branch2Created = new Date(branch2Info.createdAt).getTime();
    const ancestorCommit = branch1Commits
      .filter((c: any) => c.timestamp < branch2Created)
      .sort((a: any, b: any) => b.timestamp - a.timestamp)[0];
    return ancestorCommit || null;
  }

  // Default: use the first commit of main as ancestor
  const mainCommits = projectData.commits
    .filter((c: any) => c.branch === 'main')
    .sort((a: any, b: any) => a.timestamp - b.timestamp);
  return mainCommits[0] || null;
}

// Helper: Compare entities and detect conflicts
function detectEntityConflicts(
  baseEntities: any[],
  mainEntities: any[],
  branchEntities: any[]
): { conflicts: EntityConflict[]; additions: any[]; modifications: any[] } {
  const conflicts: EntityConflict[] = [];
  const additions: any[] = [];
  const modifications: any[] = [];

  const baseMap = new Map(baseEntities.map(e => [e.id, e]));
  const mainMap = new Map(mainEntities.map(e => [e.id, e]));
  const branchMap = new Map(branchEntities.map(e => [e.id, e]));

  // Fields to check for conflicts
  const conflictFields = ['description', 'backstory', 'status', 'traits', 'motivations', 'secrets'];

  // Check all entities in branch
  for (const [id, branchEntity] of branchMap) {
    const baseEntity = baseMap.get(id);
    const mainEntity = mainMap.get(id);

    if (!baseEntity && !mainEntity) {
      // New entity added in branch
      additions.push({ id, name: branchEntity.name, type: branchEntity.type, source: 'branch' });
    } else if (baseEntity && mainEntity) {
      // Entity exists in all three - check for conflicts
      for (const field of conflictFields) {
        const baseVal = JSON.stringify(baseEntity[field] || '');
        const mainVal = JSON.stringify(mainEntity[field] || '');
        const branchVal = JSON.stringify(branchEntity[field] || '');

        // Conflict: both main and branch changed from base, but differently
        if (baseVal !== mainVal && baseVal !== branchVal && mainVal !== branchVal) {
          conflicts.push({
            entityId: id,
            entityName: branchEntity.name,
            entityType: branchEntity.type,
            field,
            baseValue: baseEntity[field],
            mainValue: mainEntity[field],
            branchValue: branchEntity[field],
          });
        } else if (baseVal !== branchVal && mainVal === baseVal) {
          // Only branch changed - this is a clean modification
          modifications.push({ id, name: branchEntity.name, field, source: 'branch' });
        }
      }
    } else if (!mainEntity && baseEntity) {
      // Entity was deleted in main but modified in branch - this is a conflict
      conflicts.push({
        entityId: id,
        entityName: branchEntity.name,
        entityType: branchEntity.type,
        field: '_deleted',
        baseValue: baseEntity,
        mainValue: null,
        branchValue: branchEntity,
      });
    }
  }

  // Check for entities added in main (not in base, not in branch)
  for (const [id, mainEntity] of mainMap) {
    if (!baseMap.has(id) && !branchMap.has(id)) {
      additions.push({ id, name: mainEntity.name, type: mainEntity.type, source: 'main' });
    }
  }

  return { conflicts, additions, modifications };
}

// Preview merge - detect conflicts without applying
app.post('/api/narrative/merge/preview', async (req, res) => {
  try {
    const { projectId = getActiveProjectId(), sourceBranch, targetBranch = 'main' } = req.body;

    if (!sourceBranch) {
      return res.status(400).json({ error: 'Source branch is required' });
    }

    const projectData = loadProjectData(projectId);

    // Verify branches exist
    const source = projectData.branches.find((b: any) => b.name === sourceBranch);
    const target = projectData.branches.find((b: any) => b.name === targetBranch);

    if (!source) return res.status(404).json({ error: `Source branch "${sourceBranch}" not found` });
    if (!target) return res.status(404).json({ error: `Target branch "${targetBranch}" not found` });

    // Find common ancestor
    const ancestor = findCommonAncestor(projectData, sourceBranch, targetBranch);
    const baseEntities = ancestor?.snapshot?.entities || [];

    // Get latest state of each branch
    const sourceCommits = projectData.commits
      .filter((c: any) => c.branch === sourceBranch)
      .sort((a: any, b: any) => b.timestamp - a.timestamp);
    const targetCommits = projectData.commits
      .filter((c: any) => c.branch === targetBranch)
      .sort((a: any, b: any) => b.timestamp - a.timestamp);

    const sourceEntities = sourceCommits[0]?.snapshot?.entities || [];
    const targetEntities = targetCommits[0]?.snapshot?.entities || projectData.entities;

    // Detect conflicts
    const { conflicts, additions, modifications } = detectEntityConflicts(
      baseEntities,
      targetEntities,
      sourceEntities
    );

    const preview: MergePreview = {
      sourceBranch,
      targetBranch,
      canAutoMerge: conflicts.length === 0,
      conflicts,
      additions,
      modifications,
    };

    res.json(preview);

  } catch (error: any) {
    console.error('Merge preview error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Execute merge with conflict resolutions
app.post('/api/narrative/merge', async (req, res) => {
  try {
    const {
      projectId = getActiveProjectId(),
      sourceBranch,
      targetBranch = 'main',
      resolutions = [] // Array of { entityId, field, resolution, resolvedValue }
    } = req.body;

    if (!sourceBranch) {
      return res.status(400).json({ error: 'Source branch is required' });
    }

    const session = getWorldSession(projectId);
    const projectData = loadProjectData(projectId);

    // Get branch data
    const sourceCommits = projectData.commits
      .filter((c: any) => c.branch === sourceBranch)
      .sort((a: any, b: any) => b.timestamp - a.timestamp);
    const targetCommits = projectData.commits
      .filter((c: any) => c.branch === targetBranch)
      .sort((a: any, b: any) => b.timestamp - a.timestamp);

    if (sourceCommits.length === 0) {
      return res.status(400).json({ error: 'Source branch has no commits' });
    }

    const sourceEntities = sourceCommits[0].snapshot?.entities || [];
    const sourceRelationships = sourceCommits[0].snapshot?.relationships || [];
    const sourceInteractions = sourceCommits[0].snapshot?.interactions || [];

    // Start with target's current entities
    const mergedEntities = new Map(projectData.entities.map((e: any) => [e.id, { ...e }]));

    // Apply source branch changes
    for (const entity of sourceEntities) {
      const existing = mergedEntities.get(entity.id);
      if (!existing) {
        // New entity from source branch - add it
        mergedEntities.set(entity.id, entity);
      } else {
        // Entity exists in both - merge fields
        const merged = { ...existing };

        // Check if there's a resolution for this entity
        const entityResolutions = resolutions.filter((r: any) => r.entityId === entity.id);

        for (const field of ['description', 'backstory', 'status', 'traits', 'motivations', 'secrets']) {
          const resolution = entityResolutions.find((r: any) => r.field === field);

          if (resolution) {
            // Apply explicit resolution
            if (resolution.resolution === 'branch') {
              merged[field] = entity[field];
            } else if (resolution.resolution === 'main') {
              // Keep existing (main) value
            } else if (resolution.resolution === 'custom' || resolution.resolution === 'ai') {
              merged[field] = resolution.resolvedValue;
            }
          } else {
            // No conflict or auto-merge: prefer non-empty branch value if main is empty
            if (entity[field] && !existing[field]) {
              merged[field] = entity[field];
            } else if (Array.isArray(entity[field]) && Array.isArray(existing[field])) {
              // Merge arrays
              merged[field] = [...new Set([...existing[field], ...entity[field]])];
            }
          }
        }

        merged.lastUpdated = Date.now();
        mergedEntities.set(entity.id, merged);
      }
    }

    // Merge relationships (simpler - just combine unique ones)
    const mergedRelationships = new Map(projectData.relationships.map((r: any) => [r.id, r]));
    for (const rel of sourceRelationships) {
      if (!mergedRelationships.has(rel.id)) {
        // Check if equivalent relationship exists
        const exists = [...mergedRelationships.values()].some(
          (r: any) => r.source === rel.source && r.target === rel.target && r.type === rel.type
        );
        if (!exists) {
          mergedRelationships.set(rel.id, rel);
        }
      }
    }

    // Merge scenes/interactions
    const mergedInteractions = new Map((projectData.interactions || []).map((scene: any) => [scene.id, { ...scene }]));
    let scenesAdded = 0;
    for (const sourceScene of sourceInteractions) {
      const existingScene = mergedInteractions.get(sourceScene.id);
      if (!existingScene) {
        mergedInteractions.set(sourceScene.id, { ...sourceScene });
        scenesAdded++;
      } else {
        mergedInteractions.set(sourceScene.id, {
          ...existingScene,
          ...sourceScene,
          id: existingScene.id,
          // Prefer target branch ordering when it already exists
          position: existingScene.position ?? sourceScene.position,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // Update project data
    projectData.entities = Array.from(mergedEntities.values());
    projectData.relationships = Array.from(mergedRelationships.values());
    projectData.interactions = Array.from(mergedInteractions.values());
    const storyGraph = applyStoryGraphDiffs(projectData);

    // Create merge commit
    const mergeCommitId = `commit_${Date.now()}_merge`;
    const mergeCommit = {
      id: mergeCommitId,
      message: `Merge branch '${sourceBranch}' into ${targetBranch}`,
      branch: targetBranch,
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
      isMergeCommit: true,
      mergedFrom: sourceBranch,
      entityCount: projectData.entities.length,
      relationshipCount: projectData.relationships.length,
      stats: {
        entitiesAdded: sourceEntities.filter((e: any) => !mergedEntities.has(e.id)).length,
        entitiesModified: resolutions.length,
        relationshipsAdded: sourceRelationships.length,
        scenesAdded,
      },
      resolutions: resolutions.length > 0 ? resolutions : undefined,
      snapshot: {
        entities: JSON.parse(JSON.stringify(projectData.entities)),
        relationships: JSON.parse(JSON.stringify(projectData.relationships)),
        interactions: JSON.parse(JSON.stringify(projectData.interactions || [])),
        storyGraph: JSON.parse(JSON.stringify(storyGraph)),
        themes: [...session.worldContext.themes],
      },
    };

    projectData.commits.push(mergeCommit);

    // Update target branch
    const targetBranchInfo = projectData.branches.find((b: any) => b.name === targetBranch);
    if (targetBranchInfo) {
      targetBranchInfo.commitCount = (targetBranchInfo.commitCount || 0) + 1;
      targetBranchInfo.lastCommit = mergeCommitId;
    }

    // Switch to target branch
    session.currentBranch = targetBranch;
    projectData.branches.forEach((b: any) => b.isActive = b.name === targetBranch);

    // Clear pending changes
    session.pendingChanges = {
      addedEntityIds: new Set(),
      modifiedEntityIds: new Set(),
      addedRelationshipIds: new Set(),
      addedSceneIds: new Set(),
      modifiedSceneIds: new Set(),
    };
    session.uncommittedChanges = false;

    saveProjectData(projectId, projectData);

    res.json({
      success: true,
      mergeCommit: {
        id: mergeCommit.id,
        message: mergeCommit.message,
        entityCount: mergeCommit.entityCount,
        relationshipCount: mergeCommit.relationshipCount,
      },
      worldState: {
        entityCount: projectData.entities.length,
        relationshipCount: projectData.relationships.length,
        sceneCount: (projectData.interactions || []).length,
        currentBranch: targetBranch,
        storyConsistency: {
          errors: storyGraph.consistency.errors,
          warnings: storyGraph.consistency.warnings,
          isConsistent: storyGraph.consistency.isConsistent,
        },
      },
    });

  } catch (error: any) {
    console.error('Merge error:', error);
    res.status(500).json({ error: error.message });
  }
});

// AI-assisted conflict resolution
app.post('/api/narrative/merge/resolve-ai', async (req, res) => {
  try {
    const { conflict } = req.body;

    if (!conflict) {
      return res.status(400).json({ error: 'Conflict data is required' });
    }

    if (!llmAdapter) {
      return res.status(503).json({ error: 'LLM not available for AI resolution' });
    }

    const prompt = `You are helping merge two versions of a narrative entity. Reconcile these conflicting values into a coherent whole that preserves the best of both.

Entity: ${conflict.entityName} (${conflict.entityType})
Field: ${conflict.field}

VERSION A (main timeline):
${JSON.stringify(conflict.mainValue, null, 2)}

VERSION B (branch):
${JSON.stringify(conflict.branchValue, null, 2)}

Create a merged version that:
1. Preserves important details from both versions
2. Resolves any contradictions narratively (e.g., if one says "orphaned at 7" and another mentions "mother's lullaby", find a way both can be true)
3. Maintains internal consistency
4. Keeps the same format/type as the original field

Return ONLY the merged value, no explanation. If the field is an array, return a JSON array. If it's a string, return just the string.`;

    const response = await llmAdapter.complete({ prompt, maxTokens: 1000 });

    // Try to parse as JSON if it looks like an array
    let resolvedValue = response.trim();
    if (resolvedValue.startsWith('[')) {
      try {
        resolvedValue = JSON.parse(resolvedValue);
      } catch {
        // Keep as string if parse fails
      }
    }

    res.json({
      success: true,
      resolvedValue,
      explanation: `AI reconciled the ${conflict.field} field for ${conflict.entityName}`,
    });

  } catch (error: any) {
    console.error('AI resolution error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update an entity directly
app.put('/api/narrative/entity/:entityId', async (req, res) => {
  try {
    const { entityId } = req.params;
    const { projectId = getActiveProjectId(), updates } = req.body;

    const session = getWorldSession(projectId);
    const projectData = loadProjectData(projectId);

    const entityIndex = projectData.entities.findIndex(e => e.id === entityId);
    if (entityIndex === -1) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    const existingEntity = projectData.entities[entityIndex];
    const previousReference = normalizeComparableImageUrl(existingEntity.referenceImage || existingEntity.imageUrl);
    const hasReferenceUpdate = Boolean(
      updates
      && typeof updates === 'object'
      && ('referenceImage' in updates || 'imageUrl' in updates)
    );
    const nextReferenceRaw = hasReferenceUpdate
      ? (
          (typeof updates?.referenceImage === 'string' && updates.referenceImage.trim().length > 0)
            ? updates.referenceImage
            : (
                (typeof updates?.imageUrl === 'string' && updates.imageUrl.trim().length > 0)
                  ? updates.imageUrl
                  : ''
              )
        )
      : (existingEntity.referenceImage || existingEntity.imageUrl || '');
    const nextReference = normalizeComparableImageUrl(nextReferenceRaw);

    // Update entity
    projectData.entities[entityIndex] = {
      ...projectData.entities[entityIndex],
      ...updates,
      id: entityId, // Preserve ID
      updatedAt: new Date().toISOString(),
    };

    let visualInvalidation: VisualInvalidationSummary | null = null;
    if (hasReferenceUpdate && previousReference !== nextReference) {
      visualInvalidation = markVisualsDirtyFromEntityChange(
        projectData,
        session,
        projectData.entities[entityIndex],
        `Reference image changed for ${projectData.entities[entityIndex].name}`
      );
    }

    // Track as modified (unless it's already tracked as new)
    if (!session.pendingChanges.addedEntityIds.has(entityId)) {
      session.pendingChanges.modifiedEntityIds.add(entityId);
    }
    session.uncommittedChanges = true;
    const storyGraph = applyStoryGraphDiffs(projectData);
    saveProjectData(projectId, projectData);

    res.json({
      success: true,
      entity: projectData.entities[entityIndex],
      storyConsistency: {
        errors: storyGraph.consistency.errors,
        warnings: storyGraph.consistency.warnings,
        isConsistent: storyGraph.consistency.isConsistent,
      },
      visualInvalidation,
    });

  } catch (error: any) {
    console.error('Entity update error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Set an entity's primary portrait to an arbitrary image URL — typically used
 * by the chat to promote a freshly-generated variant tile to canonical.
 *
 * Behavior:
 *   - If the URL matches an existing gallery entry, that entry is removed
 *     (it's now the primary; no double-listing).
 *   - The previous primary, if different, is saved as a "previous primary"
 *     gallery entry so nothing is lost.
 *   - referenceImage and imageUrl are both set to the new URL.
 */
app.post('/api/narrative/entity/:entityId/set-primary-image', async (req, res) => {
  try {
    const { entityId } = req.params;
    const { projectId = getActiveProjectId(), imageUrl, label } = req.body || {};
    if (!imageUrl || typeof imageUrl !== 'string') {
      return res.status(400).json({ error: 'imageUrl is required' });
    }

    const projectData = loadProjectData(projectId);
    const entityIndex = projectData.entities.findIndex((e: any) => e.id === entityId);
    if (entityIndex === -1) return res.status(404).json({ error: 'Entity not found' });
    const entity: any = projectData.entities[entityIndex];

    const normalize = (u?: string) => normalizeComparableImageUrl(u || '');
    const newUrlNorm = normalize(imageUrl);
    const oldPrimary = entity.referenceImage || entity.imageUrl;
    const oldPrimaryNorm = normalize(oldPrimary);

    if (newUrlNorm && newUrlNorm === oldPrimaryNorm) {
      return res.json({ success: true, entity, message: 'Already the primary portrait' });
    }

    // If the new URL matches a gallery entry, remove it (about to become primary)
    let gallery = Array.isArray(entity.imageGallery) ? [...entity.imageGallery] : [];
    gallery = gallery.filter((g: any) => normalize(g?.url) !== newUrlNorm);

    // Save the old primary as a gallery entry (so we can swap back)
    if (oldPrimary && oldPrimaryNorm !== newUrlNorm) {
      gallery.push({
        id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        url: oldPrimary,
        label: 'previous primary',
        createdAt: new Date().toISOString(),
      });
    }

    projectData.entities[entityIndex] = {
      ...entity,
      referenceImage: imageUrl,
      imageUrl: imageUrl,
      imageGallery: gallery,
      updatedAt: new Date().toISOString(),
      ...(label ? { portraitPrompt: label } : {}),
    };
    saveProjectData(projectId, projectData);

    res.json({ success: true, entity: projectData.entities[entityIndex] });
  } catch (error: any) {
    console.error('Set primary image error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Promote a gallery image to be the entity's primary portrait. The previous
 * primary moves into the gallery as a labeled entry so nothing is lost.
 * This mirrors the set_primary_portrait tool but as a REST endpoint for direct
 * UI button use.
 */
app.post('/api/narrative/entity/:entityId/gallery/:imageId/promote', async (req, res) => {
  try {
    const { entityId, imageId } = req.params;
    const projectId = req.body?.projectId || (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);

    const entityIndex = projectData.entities.findIndex((e: any) => e.id === entityId);
    if (entityIndex === -1) return res.status(404).json({ error: 'Entity not found' });
    const entity: any = projectData.entities[entityIndex];

    const gallery = Array.isArray(entity.imageGallery) ? [...entity.imageGallery] : [];
    const targetIdx = gallery.findIndex((g: any) => g.id === imageId);
    if (targetIdx < 0) return res.status(404).json({ error: 'Image not found in gallery' });

    const [target] = gallery.splice(targetIdx, 1);
    const oldPrimary = entity.referenceImage || entity.imageUrl;

    // Old primary becomes a gallery entry so it's preserved
    if (oldPrimary && oldPrimary !== target.url) {
      gallery.push({
        id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        url: oldPrimary,
        label: 'previous primary',
        createdAt: new Date().toISOString(),
      });
    }

    projectData.entities[entityIndex] = {
      ...entity,
      referenceImage: target.url,
      imageUrl: target.url,
      imageGallery: gallery,
      updatedAt: new Date().toISOString(),
    };
    saveProjectData(projectId, projectData);

    res.json({ success: true, entity: projectData.entities[entityIndex], promoted: target });
  } catch (error: any) {
    console.error('Gallery promote error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Remove a single image from an entity's gallery.
 */
app.delete('/api/narrative/entity/:entityId/gallery/:imageId', async (req, res) => {
  try {
    const { entityId, imageId } = req.params;
    const projectId = (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);

    const entityIndex = projectData.entities.findIndex((e: any) => e.id === entityId);
    if (entityIndex === -1) return res.status(404).json({ error: 'Entity not found' });
    const entity: any = projectData.entities[entityIndex];

    const gallery = Array.isArray(entity.imageGallery) ? entity.imageGallery : [];
    const target = gallery.find((g: any) => g.id === imageId);
    if (!target) return res.status(404).json({ error: 'Image not found in gallery' });

    const newGallery = gallery.filter((g: any) => g.id !== imageId);
    projectData.entities[entityIndex] = {
      ...entity,
      imageGallery: newGallery,
      updatedAt: new Date().toISOString(),
    };
    saveProjectData(projectId, projectData);

    res.json({ success: true, removed: target, remaining: newGallery.length });
  } catch (error: any) {
    console.error('Gallery delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete an entity
app.delete('/api/narrative/entity/:entityId', async (req, res) => {
  try {
    const { entityId } = req.params;
    const projectId = (req.query.projectId as string) || getActiveProjectId();

    const session = getWorldSession(projectId);
    const projectData = loadProjectData(projectId);

    const entityIndex = projectData.entities.findIndex(e => e.id === entityId);
    if (entityIndex === -1) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    // Remove entity
    const removedEntity = projectData.entities.splice(entityIndex, 1)[0];

    // Remove related relationships
    projectData.relationships = projectData.relationships.filter(
      r => r.source !== entityId && r.target !== entityId
    );

    session.uncommittedChanges = true;
    const storyGraph = applyStoryGraphDiffs(projectData);
    saveProjectData(projectId, projectData);

    res.json({
      success: true,
      removedEntity,
      storyConsistency: {
        errors: storyGraph.consistency.errors,
        warnings: storyGraph.consistency.warnings,
        isConsistent: storyGraph.consistency.isConsistent,
      },
    });

  } catch (error: any) {
    console.error('Entity delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// AI-assisted entity editing
app.post('/api/narrative/entity/:entityId/edit', async (req, res) => {
  try {
    const { entityId } = req.params;
    const { projectId = getActiveProjectId(), instruction } = req.body;

    if (!instruction) {
      return res.status(400).json({ error: 'Instruction is required' });
    }

    if (!llmAdapter) {
      return res.status(500).json({ error: 'LLM not configured' });
    }

    const session = getWorldSession(projectId);
    const projectData = loadProjectData(projectId);

    const entity = projectData.entities.find(e => e.id === entityId);
    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    // Schema for edited entity
    const EditedEntitySchema = z.object({
      name: z.string(),
      type: z.string(),
      description: z.string(),
      traits: z.array(z.string()).optional(),
      notes: z.string().optional(),
    });

    const prompt = `You are editing a narrative world entity based on user instructions.

CURRENT ENTITY:
Name: ${entity.name}
Type: ${entity.type}
Description: ${entity.description || 'None'}
${entity.traits ? `Traits: ${entity.traits.join(', ')}` : ''}

USER INSTRUCTION: "${instruction}"

Apply the user's requested changes to this entity. Maintain coherence with the existing world. Return the updated entity.`;

    const edited = await llmAdapter.generateStructuredOutput(
      prompt,
      EditedEntitySchema,
      { temperature: 0.5, maxTokens: 1000 }
    );

    // Update entity
    const entityIndex = projectData.entities.findIndex(e => e.id === entityId);
    projectData.entities[entityIndex] = {
      ...projectData.entities[entityIndex],
      ...edited,
      id: entityId,
      updatedAt: new Date().toISOString(),
    };

    if (!session.pendingChanges.addedEntityIds.has(entityId)) {
      session.pendingChanges.modifiedEntityIds.add(entityId);
    }
    session.uncommittedChanges = true;
    const storyGraph = applyStoryGraphDiffs(projectData);
    saveProjectData(projectId, projectData);

    res.json({
      success: true,
      entity: projectData.entities[entityIndex],
      instruction,
      storyConsistency: {
        errors: storyGraph.consistency.errors,
        warnings: storyGraph.consistency.warnings,
        isConsistent: storyGraph.consistency.isConsistent,
      },
    });

  } catch (error: any) {
    console.error('AI entity edit error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get timeline (commits and branches)
app.get('/api/narrative/timeline', async (req, res) => {
  try {
    const projectId = (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const session = getWorldSession(projectId);

    res.json({
      currentBranch: session.currentBranch,
      uncommittedChanges: session.uncommittedChanges,
      branches: projectData.branches.map(b => ({
        ...b,
        isCurrent: b.name === session.currentBranch,
      })),
      commits: projectData.commits.sort((a, b) => b.timestamp - a.timestamp).map(c => ({
        id: c.id,
        message: c.message,
        branch: c.branch,
        timestamp: c.timestamp,
        createdAt: c.createdAt,
        entityCount: c.entityCount,
        relationshipCount: c.relationshipCount,
        // Delta info if available
        delta: c.delta,
        stats: c.stats,
      })),
      // Include pending changes info
      pendingChanges: {
        addedCount: session.pendingChanges.addedEntityIds.size,
        modifiedCount: session.pendingChanges.modifiedEntityIds.size,
        relationshipsCount: session.pendingChanges.addedRelationshipIds.size,
        scenesAddedCount: session.pendingChanges.addedSceneIds.size,
        scenesModifiedCount: session.pendingChanges.modifiedSceneIds.size,
      },
    });

  } catch (error: any) {
    console.error('Timeline error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get story events - linear narrative progression
app.get('/api/narrative/story', async (req, res) => {
  try {
    const projectId = (req.query.projectId as string) || getActiveProjectId();
    const session = getWorldSession(projectId);
    const projectData = loadProjectData(projectId);
    const storyGraph = buildStoryGraphAnalysis(projectData);

    // Extract story events from conversation history
    // Events are assistant messages that describe narrative happenings
    const storyEvents = session.messages
      .filter((m: any) => m.role === 'assistant')
      .map((m: any, idx: number) => ({
        id: `story_${idx}_${m.timestamp || Date.now()}`,
        content: m.content,
        timestamp: m.timestamp || Date.now(),
        operationType: m.operationType || 'elaboration',
        isEvent: m.operationType === 'event',
        focusedEntities: m.focus || [],
        entitiesMentioned: m.extractedEntities?.map((e: any) => e.name) || [],
        relationshipsFormed: m.extractedRelationships?.length || 0,
      }));

    // Get user prompts/questions for context
    const userPrompts = session.messages
      .filter((m: any) => m.role === 'user')
      .map((m: any, idx: number) => ({
        id: `prompt_${idx}_${m.timestamp || Date.now()}`,
        content: m.content,
        timestamp: m.timestamp || Date.now(),
      }));

    // Interleave user prompts and story events chronologically
    const fullStory = [...storyEvents, ...userPrompts]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((item, idx) => ({
        ...item,
        sequenceNumber: idx + 1,
      }));

    // Get commits as story milestones
    const milestones = projectData.commits.map((c: any) => ({
      id: c.id,
      type: 'commit',
      message: c.message,
      timestamp: c.timestamp,
      entityCount: c.entityCount,
      relationshipCount: c.relationshipCount,
    }));

    res.json({
      storyEvents,
      userPrompts,
      fullStory,
      milestones,
      sceneDiffs: storyGraph.sceneDiffs,
      consistency: storyGraph.consistency,
      stats: {
        totalEvents: storyEvents.filter((e: any) => e.isEvent).length,
        totalElaborations: storyEvents.filter((e: any) => !e.isEvent).length,
        totalExchanges: storyEvents.length,
        uniqueEntitiesFocused: [...new Set(storyEvents.flatMap((e: any) => e.focusedEntities))].length,
      },
    });

  } catch (error: any) {
    console.error('Story error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Story graph view - scene-by-scene diffs over timeline
app.get('/api/narrative/story/graph', async (req, res) => {
  try {
    const projectId = (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const analysis = applyStoryGraphDiffs(projectData);
    saveProjectData(projectId, projectData);

    res.json({
      storyGraph: analysis,
      scenes: (projectData.interactions || []).map((scene: any) => ({
        id: scene.id,
        title: scene.title || scene.summary || 'Untitled',
        position: scene.position ?? 0,
        storyDiff: scene.storyDiff,
      })),
    });
  } catch (error: any) {
    console.error('Story graph error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Scene diffs only (lighter payload for storyboard-focused views)
app.get('/api/narrative/story/diffs', async (req, res) => {
  try {
    const projectId = (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const analysis = applyStoryGraphDiffs(projectData);
    saveProjectData(projectId, projectData);

    res.json({
      sceneDiffs: analysis.sceneDiffs,
      consistency: analysis.consistency,
    });
  } catch (error: any) {
    console.error('Story diffs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Entity arc - how an entity changes across the scene timeline
app.get('/api/narrative/story/entity/:entityId/arc', async (req, res) => {
  try {
    const projectId = (req.query.projectId as string) || getActiveProjectId();
    const { entityId } = req.params;
    const projectData = loadProjectData(projectId);
    const analysis = applyStoryGraphDiffs(projectData);
    saveProjectData(projectId, projectData);

    const entity = projectData.entities.find((e: any) => e.id === entityId);
    const arc = analysis.entityArcs[entityId];
    if (!entity || !arc) {
      return res.status(404).json({ error: `No story arc found for entity: ${entityId}` });
    }

    const relatedIssues = analysis.consistency.issues.filter((issue) =>
      issue.entityIds.includes(entityId)
    );

    res.json({
      entity: {
        id: entity.id,
        name: entity.name,
        type: entity.type,
      },
      arc,
      relatedIssues,
    });
  } catch (error: any) {
    console.error('Entity arc error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Validate continuity for current timeline or a candidate inserted scene
app.post('/api/narrative/story/validate', async (req, res) => {
  try {
    const { projectId = getActiveProjectId(), candidateScene, insertPosition } = req.body;
    const projectData = loadProjectData(projectId);
    const workingData = JSON.parse(JSON.stringify(projectData));
    if (!Array.isArray(workingData.interactions)) {
      workingData.interactions = [];
    }

    let candidateSceneId: string | undefined;
    if (candidateScene && typeof candidateScene === 'object') {
      const targetPosition =
        typeof insertPosition === 'number'
          ? Math.max(0, Math.min(insertPosition, workingData.interactions.length))
          : workingData.interactions.length;
      candidateSceneId = candidateScene.id || `scene_validation_${Date.now()}`;

      for (const scene of workingData.interactions) {
        if (typeof scene.position === 'number' && scene.position >= targetPosition) {
          scene.position++;
        }
      }

      const participantIds = Array.isArray(candidateScene.participantIds)
        ? candidateScene.participantIds
        : Array.isArray(candidateScene.participants)
          ? candidateScene.participants
          : [];

      workingData.interactions.push({
        ...candidateScene,
        id: candidateSceneId,
        participantIds,
        participants: participantIds,
        position: targetPosition,
      });
    }

    const analysis = applyStoryGraphDiffs(workingData);
    const candidateIssues = candidateSceneId
      ? analysis.sceneDiffs.find((diff) => diff.sceneId === candidateSceneId)?.continuityIssues || []
      : analysis.consistency.issues;

    res.json({
      valid: analysis.consistency.errors === 0,
      candidateSceneId,
      candidateIssues,
      consistency: analysis.consistency,
      sceneDiffs: analysis.sceneDiffs,
    });
  } catch (error: any) {
    console.error('Story validate error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Preview scene reorder impact before applying timeline changes
app.post('/api/narrative/story/reorder/preview', async (req, res) => {
  try {
    const { projectId = getActiveProjectId(), orderedSceneIds } = req.body || {};
    const session = getWorldSession(projectId);
    const projectData = loadProjectData(projectId);
    const preview = buildStoryReorderPreview(projectData, orderedSceneIds);

    res.json({
      success: true,
      currentBranch: session.currentBranch,
      oldOrder: preview.oldOrder,
      newOrder: preview.newOrder,
      affectedScenes: preview.affectedScenes,
      issues: preview.issues,
      suggestedFixes: preview.suggestedFixes,
      safeOnCurrentBranch: preview.safeOnCurrentBranch,
      continuity: preview.continuity,
    });
  } catch (error: any) {
    console.error('Story reorder preview error:', error);
    if (typeof error?.message === 'string' && error.message.startsWith('Invalid reorder request:')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// Apply scene reorder with optional branch fallback on continuity conflicts
app.post('/api/narrative/story/reorder/apply', async (req, res) => {
  try {
    const {
      projectId = getActiveProjectId(),
      orderedSceneIds,
      createBranchOnConflict = false,
      branchName,
    } = req.body || {};

    const session = getWorldSession(projectId);
    const projectData = loadProjectData(projectId);
    if (!Array.isArray(projectData.interactions)) {
      projectData.interactions = [];
    }

    const preview = buildStoryReorderPreview(projectData, orderedSceneIds);
    const changedSceneIds = preview.affectedScenes.map((scene) => scene.sceneId);

    let createdBranch: any = null;
    if (createBranchOnConflict && !preview.safeOnCurrentBranch) {
      if (!Array.isArray(projectData.branches)) {
        projectData.branches = [];
      }
      if (!Array.isArray(projectData.commits)) {
        projectData.commits = [];
      }

      const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);
      const requestedBase = typeof branchName === 'string' && branchName.trim()
        ? branchName
        : `scene-reorder-${timestamp}`;
      const nextBranchName = getUniqueBranchName(projectData, requestedBase);
      const parentBranchName = session.currentBranch;

      // Checkpoint parent branch so fallback reorder does not mutate parent timeline state.
      const parentCheckpointId = `commit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const parentAnalysis = applyStoryGraphDiffs(projectData);
      const parentCheckpointCommit = {
        id: parentCheckpointId,
        message: `Checkpoint before reorder fallback into "${nextBranchName}"`,
        branch: parentBranchName,
        timestamp: Date.now(),
        createdAt: new Date().toISOString(),
        entityCount: projectData.entities.length,
        relationshipCount: projectData.relationships.length,
        delta: {
          addedEntities: [],
          modifiedEntities: [],
          addedRelationships: [],
          addedScenes: [],
          modifiedScenes: [],
        },
        storyConsistency: {
          errors: parentAnalysis.consistency.errors,
          warnings: parentAnalysis.consistency.warnings,
          isConsistent: parentAnalysis.consistency.isConsistent,
        },
        stats: {
          entitiesAdded: 0,
          entitiesModified: 0,
          relationshipsAdded: 0,
          scenesAdded: 0,
          scenesModified: 0,
        },
        snapshot: {
          entities: JSON.parse(JSON.stringify(projectData.entities)),
          relationships: JSON.parse(JSON.stringify(projectData.relationships)),
          interactions: JSON.parse(JSON.stringify(projectData.interactions || [])),
          storyGraph: JSON.parse(JSON.stringify(parentAnalysis)),
          themes: [...session.worldContext.themes],
        },
      };
      projectData.commits.push(parentCheckpointCommit);

      const parentBranch = projectData.branches.find((branch: any) => branch.name === parentBranchName);
      if (parentBranch) {
        parentBranch.commitCount = (parentBranch.commitCount || 0) + 1;
        parentBranch.lastCommit = parentCheckpointCommit.id;
      }

      createdBranch = {
        id: `branch_${Date.now()}`,
        name: nextBranchName,
        description: `Reorder fallback from ${parentBranchName}`,
        color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
        isActive: true,
        isCanon: false,
        commitCount: 0,
        lastCommit: null,
        createdAt: new Date().toISOString(),
        parentBranch: parentBranchName,
      };

      projectData.branches.forEach((branch: any) => {
        branch.isActive = branch.name === createdBranch.name;
      });
      projectData.branches.push(createdBranch);
      session.currentBranch = createdBranch.name;
    }

    applySceneOrderToData(projectData, preview.newOrder.map((entry) => entry.sceneId));
    const updatedAt = new Date().toISOString();
    const changedSceneIdSet = new Set(changedSceneIds);
    for (const scene of projectData.interactions) {
      if (!changedSceneIdSet.has(scene.id)) continue;
      scene.updatedAt = updatedAt;
      if (!session.pendingChanges.addedSceneIds.has(scene.id)) {
        session.pendingChanges.modifiedSceneIds.add(scene.id);
      }
    }

    const analysis = applyStoryGraphDiffs(projectData);

    if (createdBranch) {
      const branchCheckpointId = `commit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const branchCheckpointCommit = {
        id: branchCheckpointId,
        message: `Initialize reorder fallback branch "${createdBranch.name}"`,
        branch: createdBranch.name,
        timestamp: Date.now(),
        createdAt: new Date().toISOString(),
        entityCount: projectData.entities.length,
        relationshipCount: projectData.relationships.length,
        delta: {
          addedEntities: [],
          modifiedEntities: [],
          addedRelationships: [],
          addedScenes: [],
          modifiedScenes: [],
        },
        storyConsistency: {
          errors: analysis.consistency.errors,
          warnings: analysis.consistency.warnings,
          isConsistent: analysis.consistency.isConsistent,
        },
        stats: {
          entitiesAdded: 0,
          entitiesModified: 0,
          relationshipsAdded: 0,
          scenesAdded: 0,
          scenesModified: 0,
        },
        snapshot: {
          entities: JSON.parse(JSON.stringify(projectData.entities)),
          relationships: JSON.parse(JSON.stringify(projectData.relationships)),
          interactions: JSON.parse(JSON.stringify(projectData.interactions || [])),
          storyGraph: JSON.parse(JSON.stringify(analysis)),
          themes: [...session.worldContext.themes],
        },
      };
      projectData.commits.push(branchCheckpointCommit);
      createdBranch.commitCount = (createdBranch.commitCount || 0) + 1;
      createdBranch.lastCommit = branchCheckpointCommit.id;
    }

    if (changedSceneIds.length > 0) {
      session.uncommittedChanges = true;
    }

    saveProjectData(projectId, projectData);

    res.json({
      success: true,
      currentBranch: session.currentBranch,
      branchCreated: createdBranch,
      safeOnCurrentBranch: preview.safeOnCurrentBranch,
      oldOrder: preview.oldOrder,
      newOrder: preview.newOrder,
      affectedScenes: preview.affectedScenes,
      issues: preview.issues,
      suggestedFixes: preview.suggestedFixes,
      continuity: {
        ...preview.continuity,
        after: {
          errors: analysis.consistency.errors,
          warnings: analysis.consistency.warnings,
          isConsistent: analysis.consistency.isConsistent,
        },
      },
      scenes: [...(projectData.interactions || [])]
        .sort((a: any, b: any) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER)),
    });
  } catch (error: any) {
    console.error('Story reorder apply error:', error);
    if (typeof error?.message === 'string' && error.message.startsWith('Invalid reorder request:')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// Get current world state
app.get('/api/narrative/world', async (req, res) => {
  try {
    const projectId = (req.query.projectId as string) || getActiveProjectId();
    const projectData = loadProjectData(projectId);
    const session = getWorldSession(projectId);
    const storyGraph = buildStoryGraphAnalysis(projectData);

    res.json({
      entities: projectData.entities,
      relationships: projectData.relationships,
      scenes: projectData.interactions || [],
      currentBranch: session.currentBranch,
      uncommittedChanges: session.uncommittedChanges,
      themes: session.worldContext.themes,
      storyConsistency: storyGraph.consistency,
      stats: {
        entityCount: projectData.entities.length,
        relationshipCount: projectData.relationships.length,
        sceneCount: (projectData.interactions || []).length,
        commitCount: projectData.commits.filter(c => c.branch === session.currentBranch).length,
      },
    });

  } catch (error: any) {
    console.error('World error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get conversation history
app.get('/api/narrative/history', async (req, res) => {
  try {
    const projectId = (req.query.projectId as string) || getActiveProjectId();
    const session = getWorldSession(projectId);

    res.json({
      messages: session.messages,
      worldContext: session.worldContext,
      currentFocus: session.currentFocus,
      messageCount: session.messages.length,
    });

  } catch (error: any) {
    console.error('History error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reset the world - start fresh
app.post('/api/narrative/reset', async (req, res) => {
  try {
    const { projectId = getActiveProjectId(), keepCommits = false } = req.body;

    // Clear the session
    worldSessions.delete(projectId);

    // Reset project data
    const projectData = loadProjectData(projectId);
    projectData.entities = [];
    projectData.relationships = [];
    projectData.interactions = [];
    projectData.storyGraph = undefined;
    // Clear conversation history
    projectData.conversationHistory = undefined;

    if (!keepCommits) {
      projectData.commits = [];
      projectData.branches = [{
        id: 'branch_main',
        name: 'main',
        description: 'Main timeline',
        color: '#06b6d4',
        isActive: true,
        isCanon: true,
        commitCount: 0,
        lastCommit: null,
        createdAt: new Date().toISOString(),
      }];
    }

    saveProjectData(projectId, projectData);

    // Create fresh session
    const session = getWorldSession(projectId);

    res.json({
      success: true,
      message: 'World reset successfully',
      worldState: {
        entityCount: 0,
        relationshipCount: 0,
        currentBranch: session.currentBranch,
        uncommittedChanges: false,
        themes: [],
      },
    });

  } catch (error: any) {
    console.error('Reset error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate a scene using the world state
app.post('/api/narrative/scene', async (req, res) => {
  try {
    const { projectId = getActiveProjectId(), focus, prompt } = req.body;

    if (!llmAdapter) {
      return res.status(500).json({ error: 'LLM not configured' });
    }

    const projectData = loadProjectData(projectId);
    const session = getWorldSession(projectId);

    const worldContext = projectData.entities.length > 0
      ? `WORLD ELEMENTS:\n${projectData.entities.map(e =>
          `- ${e.name} (${e.type}): ${e.description || 'No description'}`
        ).join('\n')}\n\nRELATIONSHIPS:\n${projectData.relationships.map(r =>
          `- ${r.sourceName || r.source} ${r.type} ${r.targetName || r.target}`
        ).join('\n')}\n\nTHEMES: ${session.worldContext.themes.join(', ') || 'None established'}`
      : 'No world elements established yet.';

    const scenePrompt = `You are a master storyteller. Using the established world below, write a vivid scene.

${worldContext}

${focus ? `FOCUS: ${focus}` : ''}
${prompt ? `DIRECTION: ${prompt}` : ''}

Write a scene that:
- Uses the established elements authentically
- Reveals character through action and dialogue
- Builds tension or emotional resonance
- Feels alive and immediate

Write the scene directly, no preamble. 2-4 paragraphs.`;

    const scene = await llmAdapter.generateText(scenePrompt, {
      temperature: 0.9,
      maxTokens: 1500
    });

    res.json({
      scene,
      focus,
      worldState: {
        entityCount: projectData.entities.length,
        themes: session.worldContext.themes,
      },
    });

  } catch (error: any) {
    console.error('Scene generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// START SERVER
// ============================================================================

async function startServer(): Promise<void> {
  // Initialize storage adapter first
  await initializeStorage();

  const storageType = process.env.USE_MONGODB === 'true' ? 'MongoDB' : 'File';

  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🚀 NarrativeGit API Server                                ║
║                                                              ║
║   Local:    http://localhost:${PORT}                          ║
║   Health:   http://localhost:${PORT}/api/narrative/health     ║
║                                                              ║
║   Storage:  ${storageType.padEnd(45)}║
║   Data Dir: ${DATA_DIR.substring(0, 44).padEnd(44)}║
║   Projects: ${String(projects.length).padEnd(45)}║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
  });
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await closeStorage();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await closeStorage();
  process.exit(0);
});

// Start the server
startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
