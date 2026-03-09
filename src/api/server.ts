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
import { GeminiAdapter, ToolDefinition, AgentStep } from '../llm/gemini';
import type { LLMAdapter } from '../types';
import { EntityExtractor } from '../extractors/entity-extractor';
import { RelationshipExtractor } from '../extractors/relationship-extractor';
import { ChunkedExtractionPipeline, ChunkProgress } from '../chunked-extraction';
import { ImageGenerator } from '../visual/image-generator';
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
  console.log('🎨 Image generation ready (Gemini 3 Pro Image)');
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
  const updatedAt = typeof input.updatedAt === 'number' ? input.updatedAt : Date.now();

  if (
    !presetId &&
    !presetName &&
    !narrativePresetId &&
    !narrativePresetName &&
    !visualPresetId &&
    !visualPresetName &&
    !narrativePrompt &&
    !visualPrompt
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
const NarrativeChatResponseSchema = z.object({
  response: z.string().describe('Your response. Talk naturally as a creative partner — no formalities, no summaries of what you did.'),

  // Graph operations — only when the author says to commit something to the world
  entities: z.array(z.object({
    name: z.string().describe('Entity name'),
    type: z.enum(['character', 'location', 'object', 'concept', 'event', 'organization', 'creature', 'faction', 'artifact']).describe('Entity type'),
    description: z.string().describe('Vivid, evocative description'),
    isNew: z.boolean().optional().describe('True if brand new, false if updating existing'),
    backstory: z.string().optional().describe('History and background'),
    motivations: z.array(z.string()).optional().describe('What drives them'),
    secrets: z.array(z.string()).optional().describe('Hidden truths'),
    status: z.string().optional().describe('Current state'),
    traits: z.array(z.string()).optional().describe('Defining characteristics'),
    updateReason: z.string().optional().describe('What changed and why (for updates)'),
  })).describe('The printed page. Only populate when the author explicitly says to add or update something in the world. Brainstorming, discussing, and imagining characters belongs in the conversation — not here.'),

  relationships: z.array(z.object({
    source: z.string().describe('Source entity name'),
    target: z.string().describe('Target entity name'),
    type: z.string().describe('Relationship type (e.g., "works_for", "fears", "created")'),
    description: z.string().optional().describe('The story behind this connection'),
  })).describe('Connections in the published world. Only create when the author explicitly asks to establish a relationship in the canon.'),

  scenes: z.array(z.object({
    title: z.string().describe('Scene title'),
    prose: z.string().describe('Full narrative prose — vivid, immersive, publishable quality'),
    summary: z.string().optional().describe('1-2 sentence summary'),
    participantNames: z.array(z.string()).describe('Entity names in this scene (characters, significant objects)'),
    locationName: z.string().optional().describe('Location name if the scene takes place somewhere specific'),
    events: z.array(z.string()).optional().describe('Key beats that happen'),
    stateChanges: z.array(z.string()).optional().describe('What changes in the world as a result'),
    insertAfter: z.string().optional().describe('Scene ID/title to insert after, for placement'),
  })).optional().describe('New scenes to commit to the storyboard. Only when the author asks you to write a scene or narrate an event into existence.'),

  sceneEdits: z.array(z.object({
    sceneId: z.string().optional().describe('ID of scene to edit (or omit for currently selected scene)'),
    sceneTitle: z.string().optional().describe('Scene title (fallback if ID unknown)'),
    title: z.string().optional().describe('New title'),
    prose: z.string().optional().describe('Replacement prose'),
    summary: z.string().optional().describe('Updated summary'),
    participantNames: z.array(z.string()).optional().describe('Updated participants'),
    locationName: z.string().optional().describe('Updated location'),
    events: z.array(z.string()).optional().describe('Updated beats'),
    stateChanges: z.array(z.string()).optional().describe('State changes from this edit'),
    mergeParticipants: z.boolean().optional().describe('Merge with existing participants instead of replacing'),
  })).optional().describe('Edits to existing scenes (e.g., "rewrite this scene", "add X to the scene").'),

  scratchpadWrites: z.array(z.object({
    documentId: z.string().optional().describe('Existing doc ID to update'),
    title: z.string().optional().describe('Doc title (required for new docs)'),
    content: z.string().describe('Content to write'),
    category: z.enum(['world_bible', 'story_arc', 'character_notes', 'reference', 'other']).optional(),
    mode: z.enum(['append', 'replace', 'create']).optional(),
    pin: z.boolean().optional().describe('Pin into context'),
  })).optional().describe('Non-canon scratchpad notes — for tracking ideas, arcs, and plans outside the world graph.'),

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
  let filePath: string | null = null;

  if (normalized.startsWith(portraitPrefix)) {
    const filename = path.basename(decodeURIComponent(normalized.slice(portraitPrefix.length)));
    filePath = path.join(GENERATED_PORTRAITS_DIR, filename);
  } else if (normalized.startsWith(imagePrefix)) {
    const filename = path.basename(decodeURIComponent(normalized.slice(imagePrefix.length)));
    filePath = path.join(GENERATED_IMAGES_DIR, filename);
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
    description: 'Generate (or regenerate) the hero image for a scene using character/location references. Use when the author asks to visualize a scene.',
    parameters: {
      id: { type: 'string', description: 'Scene ID (preferred)' },
      title: { type: 'string', description: 'Scene title (fuzzy matched)' },
      prompt: { type: 'string', description: 'Optional additional visual guidance' },
    },
  },
  {
    name: 'generate_frame_image',
    description: 'Generate an image for a specific frame. Frames should be generated in order for visual continuity.',
    parameters: {
      sceneId: { type: 'string', description: 'Scene ID' },
      sceneTitle: { type: 'string', description: 'Scene title (alternative to sceneId)' },
      frameId: { type: 'string', description: 'Frame ID (if known)' },
      frameIndex: { type: 'number', description: 'Frame index (0-based, alternative to frameId)' },
      prompt: { type: 'string', description: 'Optional additional visual guidance' },
    },
  },
  {
    name: 'insert_frame',
    description: 'Insert a new empty frame at a position in a scene. Use when the author wants to add a shot between existing frames.',
    parameters: {
      sceneId: { type: 'string', description: 'Scene ID' },
      sceneTitle: { type: 'string', description: 'Scene title (alternative)' },
      position: { type: 'number', description: 'Position index to insert at (0 = before first frame)' },
      title: { type: 'string', description: 'Frame title' },
      description: { type: 'string', description: 'Frame description' },
      shotType: { type: 'string', description: 'Shot type (e.g. wide, close-up, medium)' },
      camera: { type: 'string', description: 'Camera movement/angle' },
      mood: { type: 'string', description: 'Mood/atmosphere' },
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
    description: 'Update fields on an existing frame (title, description, shotType, camera, mood).',
    parameters: {
      sceneId: { type: 'string', description: 'Scene ID' },
      sceneTitle: { type: 'string', description: 'Scene title (alternative)' },
      frameId: { type: 'string', description: 'Frame ID' },
      frameIndex: { type: 'number', description: 'Frame index (0-based, alternative to frameId)' },
      title: { type: 'string', description: 'New frame title' },
      description: { type: 'string', description: 'New frame description' },
      shotType: { type: 'string', description: 'New shot type' },
      camera: { type: 'string', description: 'New camera angle/movement' },
      mood: { type: 'string', description: 'New mood' },
    },
  },
  {
    name: 'generate_portrait',
    description: 'Generate (or regenerate) a portrait image for an entity. Use when the author asks to visualize a character, create a new look, or regenerate a portrait. Supports cross-entity visual references (e.g. "draw the cat wearing the backpack from another entity").',
    parameters: {
      id: { type: 'string', description: 'Entity ID (preferred)' },
      name: { type: 'string', description: 'Entity name (fuzzy matched if ID not provided)' },
      prompt: { type: 'string', description: 'Optional visual guidance for the portrait (e.g. "make them look older", "battle-worn armor")' },
      referenceEntityIds: { type: 'string', description: 'Comma-separated entity IDs whose portraits should be used as visual references' },
      referenceEntityNames: { type: 'string', description: 'Comma-separated entity names whose portraits should be used as visual references (fuzzy matched)' },
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
];

// Tool executor - runs the actual tool logic against project data
function createToolExecutor(projectId: string, projectData: any, session: any) {
  // Helper: resolve a flexible image target (entity, scene, or frame) from tool args
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
          },
          relationships: relationships.map((r: any) => ({
            type: r.type,
            direction: r.source === entity.id ? 'outgoing' : 'incoming',
            otherEntity: r.source === entity.id ? r.targetName : r.sourceName,
            description: r.description,
          })),
          isCanon: session.canonEntityIds?.has(entity.id) || false,
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

        return {
          scene: {
            id: scene.id,
            title: scene.title || scene.summary || 'Untitled',
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
            storyDiff: scene.storyDiff,
          },
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
        const { id, title, prompt } = args;
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
          const resp = await fetch(`http://localhost:${PORT}/api/narrative/visual/scene/${scene.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              ...(prompt ? { prompt } : {}),
            }),
          });
          if (!resp.ok) {
            const errBody = await resp.text();
            return { error: `Scene image generation failed: ${errBody}` };
          }
          const result = await resp.json();
          return {
            visualToolUsed: true,
            sceneId: scene.id,
            sceneTitle: scene.title,
            imageUrl: result.imageUrl || result.scene?.imageUrl,
            message: `Generated hero image for "${scene.title}".`,
          };
        } catch (err: any) {
          return { error: `Scene image generation failed: ${err.message}` };
        }
      }

      case 'generate_frame_image': {
        const { sceneId, sceneTitle, frameId, frameIndex, prompt } = args;
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
        if (!scene.frames || scene.frames.length === 0) return { error: 'Scene has no frames. Generate a frame breakdown first.' };

        let targetFrame: any = null;
        if (frameId) {
          targetFrame = scene.frames.find((f: any) => f.id === frameId);
        } else if (typeof frameIndex === 'number') {
          targetFrame = scene.frames[frameIndex];
        } else {
          // Find next frameless frame
          targetFrame = scene.frames.find((f: any) => !f.imageUrl);
        }
        if (!targetFrame) return { error: 'Frame not found or all frames already have images.' };

        try {
          const resp = await fetch(`http://localhost:${PORT}/api/narrative/visual/frame/${scene.id}/${targetFrame.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              ...(prompt ? { prompt } : {}),
            }),
          });
          if (!resp.ok) {
            const errBody = await resp.text();
            return { error: `Frame image generation failed: ${errBody}` };
          }
          const result = await resp.json();
          return {
            visualToolUsed: true,
            sceneId: scene.id,
            frameId: targetFrame.id,
            frameTitle: targetFrame.title,
            imageUrl: result.imageUrl || result.frame?.imageUrl,
            message: `Generated image for frame "${targetFrame.title || targetFrame.id}".`,
          };
        } catch (err: any) {
          return { error: `Frame image generation failed: ${err.message}` };
        }
      }

      case 'insert_frame': {
        const { sceneId, sceneTitle, position = 0, title, description, shotType, camera, mood } = args;
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

        const frames = [...(scene.frames || [])];
        const insertIdx = Math.min(Math.max(0, position), frames.length);
        const newFrame = {
          id: `frame_${scene.id}_${Date.now()}_ai`,
          position: insertIdx,
          title: title || '',
          description: description || '',
          shotType: shotType || '',
          camera: camera || '',
          mood: mood || '',
        };
        frames.splice(insertIdx, 0, newFrame);
        frames.forEach((f: any, i: number) => { f.position = i; });
        scene.frames = frames;
        saveProjectData(projectId, projectData);

        return {
          visualToolUsed: true,
          sceneId: scene.id,
          insertedFrame: newFrame,
          totalFrames: frames.length,
          message: `Inserted new frame at position ${insertIdx + 1} in "${scene.title}".`,
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
        const { sceneId, sceneTitle, frameId, frameIndex, title, description, shotType, camera, mood } = args;
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

        if (title !== undefined) targetFrame.title = title;
        if (description !== undefined) targetFrame.description = description;
        if (shotType !== undefined) targetFrame.shotType = shotType;
        if (camera !== undefined) targetFrame.camera = camera;
        if (mood !== undefined) targetFrame.mood = mood;
        saveProjectData(projectId, projectData);

        return {
          visualToolUsed: true,
          sceneId: scene.id,
          updatedFrame: {
            id: targetFrame.id,
            title: targetFrame.title,
            description: targetFrame.description,
            shotType: targetFrame.shotType,
            camera: targetFrame.camera,
            mood: targetFrame.mood,
          },
          message: `Updated frame "${targetFrame.title || targetFrame.id}" in "${scene.title}".`,
        };
      }

      case 'generate_portrait': {
        const { id, name: entityName, prompt, referenceEntityIds, referenceEntityNames } = args;
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

        // Resolve cross-entity reference images
        const additionalRefUrls: string[] = [];
        if (referenceEntityIds) {
          for (const refId of referenceEntityIds.split(',').map((s: string) => s.trim()).filter(Boolean)) {
            const refEntity = entities.find((e: any) => e.id === refId);
            if (refEntity?.referenceImage) additionalRefUrls.push(refEntity.referenceImage);
          }
        }
        if (referenceEntityNames) {
          for (const refName of referenceEntityNames.split(',').map((s: string) => s.trim()).filter(Boolean)) {
            const lower = refName.toLowerCase();
            const refEntity = entities.find((e: any) =>
              (e.name || '').toLowerCase() === lower ||
              (e.name || '').toLowerCase().includes(lower)
            );
            if (refEntity?.referenceImage && !additionalRefUrls.includes(refEntity.referenceImage)) {
              additionalRefUrls.push(refEntity.referenceImage);
            }
          }
        }

        try {
          const resp = await fetch(`http://localhost:${PORT}/api/narrative/visual/entity/${entity.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              customPrompt: prompt || undefined,
              forceRegenerate: true,
              ...(additionalRefUrls.length > 0 ? { additionalRefUrls } : {}),
            }),
          });
          if (!resp.ok) {
            const errBody = await resp.text();
            return { error: `Portrait generation failed: ${errBody}` };
          }
          const result = await resp.json();
          const imageUrl = result.imageUrl;

          // Persist the portrait back to the entity
          if (imageUrl) {
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
          }

          return {
            visualToolUsed: true,
            entityId: entity.id,
            entityName: entity.name,
            imageUrl,
            message: `Generated portrait for "${entity.name}".`,
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

          return {
            visualToolUsed: true,
            targetType: target.type,
            label: target.label,
            imageUrl: newImageUrl,
            message: `Edited image for "${target.label}": ${editInstruction}`,
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

          return {
            visualToolUsed: true,
            targetType: target.type,
            label: target.label,
            imageUrl: newImageUrl,
            cameraDescription,
            message: `Changed camera angle for "${target.label}" to: ${cameraDescription}`,
          };
        } catch (err: any) {
          return { error: `Camera angle change failed: ${err.message}` };
        }
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

    // Extract selection context (prefer new format, fall back to legacy)
    const focusedEntityId = selection?.focusedEntityId ?? legacyFocusedEntityId;
    const focusedSceneId = selection?.focusedSceneId ?? legacyFocusedSceneId;
    const pinnedEntityIds: string[] = selection?.pinnedEntityIds ?? [];
    const activeRow = selection?.activeRow;
    const currentIndex = selection?.currentIndex;
    const insertAfterSceneId = selection?.insertAfterSceneId;
    const insertBeforeSceneId = selection?.insertBeforeSceneId;
    const insertPositionIndex = selection?.insertPosition;

    // Update session focus if client sent focused entity/scene
    const session = getWorldSession(projectId);
    if (focusedEntityId) {
      session.focusedEntityId = focusedEntityId;
    }
    if (focusedSceneId) {
      session.focusedSceneId = focusedSceneId;
    }
    // Store pinned entities in session for context
    session.pinnedEntityIds = pinnedEntityIds;

    if (!llmAdapter) {
      return res.status(500).json({ error: 'LLM not configured - set GEMINI_API_KEY' });
    }

    const projectData = loadProjectData(projectId);
    const scratchpadDocuments = ensureScratchpadDocuments(projectData).map(normalizeScratchpadDocument);
    const effectiveWritingStylePrompt = getEffectiveWritingStylePrompt(projectId, writingStylePrompt);
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
          sceneFocusContext += `\nFrames: ${frameList.length} (${generatedFrameCount} with generated images)`;
          const framePreview = frameList.slice(0, 8);
          sceneFocusContext += `\nFrame breakdown:`;
          for (const frame of framePreview) {
            const frameParticipantIds = Array.isArray(frame?.participantIds) && frame.participantIds.length > 0
              ? frame.participantIds
              : participantIds;
            const frameParticipantNames = frameParticipantIds.map((id: string) => {
              const entity = projectData.entities.find((candidate: any) => candidate.id === id);
              return entity ? entity.name : id;
            });
            sceneFocusContext += `\n- [${frame.id}] ${frame.title || 'Untitled frame'} | cast: ${frameParticipantNames.slice(0, 4).join(', ') || 'unspecified'} | shot: ${frame.shotType || 'unspecified'} | camera: ${frame.camera || 'unspecified'} | image: ${frame.imageUrl ? 'generated' : 'missing'}`;
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
      .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 8);
    let scratchpadContext = '';
    if (pinnedScratchpadDocs.length > 0) {
      scratchpadContext = `
--- Pinned notes (non-canon workspace) ---
${pinnedScratchpadDocs.map((doc: any, idx: number) => {
  const raw = (doc.content || '').trim();
  const excerpt = raw.length > 1200 ? `${raw.slice(0, 1200)}...` : raw;
  return `${idx + 1}. [${doc.category}] ${doc.title} (id: ${doc.id})\n${excerpt || '(empty)'}`;
}).join('\n\n')}
`;
    }

    const systemPrompt = `You're a fellow writer and creative partner sitting in the room with the user, building a world together. You're not an assistant — you're a collaborator who has your own creative instincts, gets excited about ideas, and genuinely cares about making this story amazing.

--- Your creative voice ---
Talk naturally. Get excited. Riff on ideas. Say things like "oh wait, what if..." or "that's sick — and it connects to..." or "hmm, I wonder whether she actually knows about that..."

Push back when something doesn't land. Suggest alternatives. Notice interesting tensions and contradictions in the world. Draw connections the user might not have seen. If you see a thread worth pulling, say so.

Match the user's energy. If they're rapid-fire brainstorming, keep up. If they're carefully working through a scene, slow down and go deep. If they ask a quick question, give a quick answer.

Don't narrate your own process ("Let me look that up for you..."). Don't summarize what just happened. Don't list next steps unless asked. Just be present in the creative conversation.

--- The world graph is the published canon ---
Think of the world graph like a novel that's already gone to print. You don't casually add characters to a published book — you discuss them, imagine them, sketch them out in conversation first. Only when the author says "yes, this character belongs in the story" does it go on the page.

Your job is to be the brilliant creative partner in the conversation BEFORE things hit the page. Explore ideas. Suggest characters. Imagine relationships. Sketch out scenes verbally. But leave the entities, relationships, and scenes arrays EMPTY in your response unless the author explicitly tells you to add something to the world.

The creative conversation IS the work. The graph is just where the decisions land once they're made.

When the author does want to commit something to the world, THEN make it extraordinary — a character so vivid they feel like they could walk off the page, a relationship so layered it reveals something about both sides, a scene so alive you can smell the rain.

--- Navigating the world ---
You have tools that let you walk through this world like you live in it. Use them constantly — not because you were asked to, but because you're a writer who knows their world inside and out.

When someone mentions a character, you instinctively recall their backstory (get_entity). When brainstorming plot, you flip through the storyboard in your mind (get_storyboard, list_scenes). When wondering about connections, you trace the web of relationships (get_relationships). When someone pitches a new idea, you check whether something like it already exists in the world (search_world).

You don't announce that you're doing this. You just know the world deeply and it shows in everything you say. Your tools are your memory of this world — use them to be the collaborator who always remembers that detail from three scenes ago, who notices the thematic echo, who catches the continuity issue before it becomes a problem.

The context below gives you the broad strokes, but your tools give you the living, breathing world. Reach for them naturally, the way a writer reaches for their notes.

You can also generate visuals — entity portraits, scene images, frame breakdowns, frame images — and manage frames (insert, delete, update). Use these when the author asks you to visualize something or when it would help the creative process. But don't generate images unprompted — visuals are expensive and the author should drive when to create them.

You can edit existing images with edit_image (natural language modifications like "make them look more weathered" or "add rain") and change_camera_angle (re-render from a different viewpoint like "bird's eye view" or "close-up"). Both work on entity portraits, scene images, and frame images — just specify which target. For generate_portrait, you can pass referenceEntityIds or referenceEntityNames to use other entities' portraits as visual references (e.g. "draw the cat wearing the backpack from Stray's Backpack entity").

CRITICAL: To modify frames, entities, scenes, or any world data you MUST call the appropriate tool (update_frame, insert_frame, delete_frame, generate_frame_image, etc.). Describing a change in your text response does NOT modify any data. If the author asks you to change a frame's description, you must call update_frame. If they ask you to add a new frame, you must call insert_frame. Never tell the author you've made a change unless you actually invoked the tool — saying "I've updated the frame" without calling the tool is a lie. Always call the tool first, then confirm the result.

--- What's in front of us ---
Pay attention to what the user has selected on screen — an entity card, a scene, a frame. That's where their attention is. If they have a character pulled up and say "what about their relationship with X?", you know who "their" is. If they're looking at a scene and say "this needs more tension", you know which scene. Use that context naturally, the way you'd glance at whatever's open on the desk between you.

--- How the world works ---
- "Elaboration" = revealing more about what's already true (the world isn't changing, we're discovering more)
- "Event" = something happens that changes the world state (characters act, relationships shift)
- [canon] entities are committed — they can only change through in-world events, not author fiat
- Uncommitted elements are fluid and open to revision
- "This scene" / "the current scene" = use sceneEdits, don't create a new scene
- Use get_scene_diff before major scene work to check continuity
- Scratchpad = non-canon workspace for notes, arcs, and plans

--- World state ---
Branch: ${session.currentBranch} | Canon: ${canonCount} | Uncommitted: ${uncommittedCount}${session.worldContext.themes.length > 0 ? ` | Themes: ${session.worldContext.themes.slice(0, 5).join(', ')}` : ''}${storyGraph.consistency.errors > 0 ? ` | ${storyGraph.consistency.errors} continuity errors` : ''}${storyGraph.consistency.warnings > 0 ? ` | ${storyGraph.consistency.warnings} warnings` : ''}

${worldSummary}
${focusContext}
${entityFocusContext}
${sceneFocusContext}
${pinnedContext}
${scratchpadContext}
${insertContext}
${decisionContext}

${recentMessages ? `--- Recent conversation ---\n${recentMessages}` : ''}
${effectiveWritingStylePrompt ? `\n--- Writing style ---\n${effectiveWritingStylePrompt}` : ''}
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

    // Use agentic approach with tools for grounded responses
    let structuredResponse: NarrativeChatResponse;
    let toolSteps: AgentStep[] = [];

    try {
      // Use agentic run with tools
      const agentResult = await llmAdapter.runWithTools(
        systemPrompt,
        message,
        narrativeWorldTools,
        executeToolFn,
        NarrativeChatResponseSchema,
        { temperature: 0.7, maxTokens: 8000, modelPreference: 'fast', maxIterations: 8 }
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

    res.json({
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
    });

  } catch (error: any) {
    console.error('Narrative chat error:', error);
    res.status(500).json({ error: error.message });
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
