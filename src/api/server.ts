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
      projectDataCache.set(projectId, parsed);
      return parsed;
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
${visualStylePrompt ? `Visual style: ${visualStylePrompt}` : ''}

For each frame, provide:
- title (optional)
- description (1-2 sentences of what happens in the frame)
- visual_beat (composition, lighting, camera framing, atmosphere)
- participants (names present in the frame)
- location (name if explicit)
- dialogue (optional lines, if present in the frame)
- caption (optional narration box text)
- sfx (optional sound effect words)
- shotType (e.g., wide, medium, close-up)
- camera (angle or movement)
- mood (one or two words)

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

    const frames = framesSource.map((frame, idx) => {
      const resolvedParticipants = (frame.participants || participantNames)
        .map((name: string) => resolveEntityByName(projectData, name))
        .filter(Boolean)
        .map((entity: any) => entity.id);
      const resolvedLocation = frame.location
        ? resolveEntityByName(projectData, frame.location)
        : (locationId ? resolveEntityByName(projectData, locationName || '') : null);

      return {
        id: `frame_${id}_${Date.now()}_${idx}`,
        position: idx,
        title: frame.title || `Frame ${idx + 1}`,
        description: frame.description,
        visual_beat: frame.visual_beat,
        participantIds: resolvedParticipants.length > 0 ? resolvedParticipants : participantIds,
        locationId: resolvedLocation?.id || locationId,
        dialogue: frame.dialogue,
        caption: frame.caption,
        sfx: frame.sfx,
        shotType: frame.shotType,
        camera: frame.camera,
        mood: frame.mood,
      };
    });

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

    console.log(`🎨 Generating portrait for: ${entity.name}`);
    const portrait = await portraitGenerator.generatePortrait(entity);

    // Return base64 encoded image
    res.json({
      success: true,
      entityId,
      entityName: entity.name,
      image: portrait.portrait.data.toString('base64'),
      mimeType: portrait.portrait.mimeType,
      prompt: portrait.portrait.prompt,
    });
  } catch (error: any) {
    console.error('Portrait generation error:', error);
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
    } = req.body;
    const projectId = req.body.projectId || getActiveProjectId();

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

    // Collect reference images for visual consistency
    const characterRefs: any[] = [];
    const locationRefs: any[] = [];
    const previousShots: any[] = [];

    // Get character references from scene participants
    const participantsRaw = scene.participantIds || scene.participants || [];
    const participants = participantsRaw
      .map((p: any) => (typeof p === 'string' ? p : p?.id))
      .filter(Boolean);
    const portraitDir = path.join(process.cwd(), '.narrative-data', 'generated-images', 'portraits');

    if (fs.existsSync(portraitDir)) {
      for (const participantId of participants.slice(0, 5)) {
        const entity = projectData.entities.find(e => e.id === participantId);
        if (entity) {
          // Look for existing portrait
          const portraitFiles = fs.readdirSync(portraitDir)
            .filter(f => f.includes(participantId) || f.includes(entity.name.toLowerCase().replace(/\s+/g, '_')));

          if (portraitFiles.length > 0) {
            const portraitPath = path.join(portraitDir, portraitFiles[0]);
            const portraitData = fs.readFileSync(portraitPath);
            const ext = path.extname(portraitFiles[0]).toLowerCase();
            characterRefs.push({
              id: participantId,
              data: portraitData,
              mimeType: ext === '.png' ? 'image/png' : 'image/jpeg',
              description: `${entity.name}: ${entity.description || entity.type}`,
              type: 'character',
            });
          }
        }
      }
    }

    // Get location references if scene has a location
    const locationId = scene.locationId || scene.location;
    if (locationId) {
      const location = projectData.entities.find(e =>
        e.id === locationId ||
        e.name.toLowerCase() === locationId?.toLowerCase()
      );
      if (location && fs.existsSync(portraitDir)) {
        const locationFiles = fs.readdirSync(portraitDir)
          .filter(f => f.includes('location_') && (f.includes(location.id) || f.includes(location.name.toLowerCase().replace(/\s+/g, '_'))));

        if (locationFiles.length > 0) {
          const locationPath = path.join(portraitDir, locationFiles[0]);
          const locationData = fs.readFileSync(locationPath);
          const ext = path.extname(locationFiles[0]).toLowerCase();
          locationRefs.push({
            id: location.id,
            data: locationData,
            mimeType: ext === '.png' ? 'image/png' : 'image/jpeg',
            description: `Location: ${location.name} - ${location.description || ''}`,
            type: 'location',
          });
        }
      }
    }

    // Get previous scene images for visual continuity
    const sceneImageDir = path.join(process.cwd(), '.narrative-data', 'generated-images');
    if (fs.existsSync(sceneImageDir)) {
      const orderedScenes = [...(projectData.interactions || [])].sort((a, b) => {
        const posA = a.position ?? Number.MAX_VALUE;
        const posB = b.position ?? Number.MAX_VALUE;
        return posA - posB;
      });
      const sceneIndex = orderedScenes.findIndex(i => i.id === sceneId);
      if (sceneIndex > 0) {
        // Look for previous scene's image
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

    console.log(`   Character refs: ${characterRefs.length}, Location refs: ${locationRefs.length}, Previous shots: ${previousShots.length}`);

    // Build the prose with optional visual style + custom prompt appended (non-overriding)
    const baseProse = scene.prose || scene.description || 'A dramatic moment in the story.';
    let finalProse = baseProse;
    if (customPrompt) {
      finalProse = `${baseProse}\n\n[ADDITIONAL VISUAL NOTES: ${customPrompt}]`;
    }
    if (visualStylePrompt) {
      finalProse = `[VISUAL STYLE: ${visualStylePrompt}]\n\n${finalProse}`;
    }

    // Generate scene image with references
    const image = await imageGenerator.generateSceneImage({
      prose: finalProse,
      title: scene.title,
      characterRefs,
      locationRefs,
      previousShots,
      aspectRatio: aspectRatio as any,
      imageSize: imageSize as any,
      usePro,
    });

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
        updatedAt: new Date().toISOString(),
      };
      session.uncommittedChanges = true;
      if (!session.pendingChanges.addedSceneIds.has(sceneId)) {
        session.pendingChanges.modifiedSceneIds.add(sceneId);
      }
      session.uncommittedChanges = true;
      if (!session.pendingChanges.addedSceneIds.has(sceneId)) {
        session.pendingChanges.modifiedSceneIds.add(sceneId);
      }
      saveProjectData(projectId, projectData);
    }

    res.json({
      success: true,
      sceneId,
      sceneTitle: scene.title,
      image: image.data.toString('base64'),
      mimeType: image.mimeType,
      prompt: image.prompt,
      savedPath,
      imageUrl: scene.imageUrl,
      referenceCount: image.referenceCount,
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
    } = req.body;
    const projectId = req.body.projectId || getActiveProjectId();

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

    console.log(`🎞️ Generating image for frame: ${frame.title || frameId} in scene ${scene.title || sceneId}`);

    const characterRefs: any[] = [];
    const locationRefs: any[] = [];
    const previousShots: any[] = [];

    const participantsRaw = frame.participantIds || scene.participantIds || scene.participants || [];
    const participants = participantsRaw
      .map((p: any) => (typeof p === 'string' ? p : p?.id))
      .filter(Boolean);
    const portraitDir = path.join(process.cwd(), '.narrative-data', 'generated-images', 'portraits');

    if (fs.existsSync(portraitDir)) {
      for (const participantId of participants.slice(0, 5)) {
        const entity = projectData.entities.find(e => e.id === participantId);
        if (entity) {
          const portraitFiles = fs.readdirSync(portraitDir)
            .filter(f => f.includes(participantId) || f.includes(entity.name.toLowerCase().replace(/\s+/g, '_')));

          if (portraitFiles.length > 0) {
            const portraitPath = path.join(portraitDir, portraitFiles[0]);
            const portraitData = fs.readFileSync(portraitPath);
            const ext = path.extname(portraitFiles[0]).toLowerCase();
            characterRefs.push({
              id: participantId,
              data: portraitData,
              mimeType: ext === '.png' ? 'image/png' : 'image/jpeg',
              description: `${entity.name}: ${entity.description || entity.type}`,
              type: 'character',
            });
          }
        }
      }
    }

    const locationId = frame.locationId || scene.locationId || scene.location;
    if (locationId) {
      const location = projectData.entities.find(e =>
        e.id === locationId ||
        e.name.toLowerCase() === locationId?.toLowerCase()
      );
      if (location && fs.existsSync(portraitDir)) {
        const locationFiles = fs.readdirSync(portraitDir)
          .filter(f => f.includes('location_') && (f.includes(location.id) || f.includes(location.name.toLowerCase().replace(/\s+/g, '_'))));

        if (locationFiles.length > 0) {
          const locationPath = path.join(portraitDir, locationFiles[0]);
          const locationData = fs.readFileSync(locationPath);
          const ext = path.extname(locationFiles[0]).toLowerCase();
          locationRefs.push({
            id: location.id,
            data: locationData,
            mimeType: ext === '.png' ? 'image/png' : 'image/jpeg',
            description: `Location: ${location.name} - ${location.description || ''}`,
            type: 'location',
          });
        }
      }
    }

    // Previous frame for continuity (if available)
    if (scene.frames && scene.frames.length > 0) {
      const frameIndex = scene.frames.findIndex((f: any) => f.id === frameId);
      if (frameIndex > 0) {
        const prevFrame = scene.frames[frameIndex - 1];
        const sceneImageDir = path.join(process.cwd(), '.narrative-data', 'generated-images');
        if (fs.existsSync(sceneImageDir)) {
          const prevFiles = fs.readdirSync(sceneImageDir)
            .filter(f => f.startsWith(`scene_${sceneId}_frame_${prevFrame.id}`))
            .sort()
            .reverse();

          if (prevFiles.length > 0) {
            const prevPath = path.join(sceneImageDir, prevFiles[0]);
            const prevData = fs.readFileSync(prevPath);
            const ext = path.extname(prevFiles[0]).toLowerCase();
            previousShots.push({
              id: prevFrame.id,
              data: prevData,
              mimeType: ext === '.png' ? 'image/png' : 'image/jpeg',
              description: `Previous frame: ${prevFrame.title || 'Untitled'}`,
              type: 'previous_shot',
            });
          }
        }
      }
    }

    const baseProse = frame.visual_beat || frame.description || scene.prose || scene.description || 'A cinematic moment in the story.';
    let finalProse = baseProse;
    if (customPrompt) {
      finalProse = `${baseProse}\n\n[ADDITIONAL VISUAL NOTES: ${customPrompt}]`;
    }
    if (visualStylePrompt) {
      finalProse = `[VISUAL STYLE: ${visualStylePrompt}]\n\n${finalProse}`;
    }

    const image = await imageGenerator.generateSceneImage({
      prose: finalProse,
      title: frame.title || scene.title,
      characterRefs,
      locationRefs,
      previousShots,
      aspectRatio: aspectRatio as any,
      imageSize: imageSize as any,
      usePro,
    });

    const filename = `scene_${sceneId}_frame_${frameId}_${Date.now()}`;
    const savedPath = await imageGenerator.saveImage(image, filename);

    frame.imageUrl = `/api/narrative/visual/images/${path.basename(savedPath)}`;

    // Persist frame updates when possible
    const sceneIndex = projectData.interactions.findIndex((i: any) => i.id === sceneId);
    if (sceneIndex >= 0) {
      const storedScene = projectData.interactions[sceneIndex];
      if (storedScene.frames) {
        const storedFrameIndex = storedScene.frames.findIndex((f: any) => f.id === frameId);
        if (storedFrameIndex >= 0) {
          storedScene.frames[storedFrameIndex] = { ...storedScene.frames[storedFrameIndex], imageUrl: frame.imageUrl };
        }
      }
      storedScene.updatedAt = new Date().toISOString();
      saveProjectData(projectId, projectData);
    }

    res.json({
      success: true,
      sceneId,
      frameId,
      image: image.data.toString('base64'),
      mimeType: image.mimeType,
      prompt: image.prompt,
      savedPath,
      imageUrl: frame.imageUrl,
      referenceCount: image.referenceCount,
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
    } = req.body;
    const projectId = req.body.projectId || getActiveProjectId();

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
    let mergedDescription = entity.description || '';
    if (customPrompt) {
      mergedDescription = `${mergedDescription}\n\n[ADDITIONAL VISUAL NOTES: ${customPrompt}]`.trim();
    }
    if (visualStylePrompt) {
      mergedDescription = `[VISUAL STYLE: ${visualStylePrompt}]\n\n${mergedDescription || entity.description || ''}`.trim();
    }
    if (customPrompt || visualStylePrompt) {
      entity = {
        ...entity,
        description: mergedDescription || entity.description || '',
      };
    }

    // Determine if it's a location (uses different prompt style)
    const isLocation = ['location', 'place', 'setting'].includes(entity.type?.toLowerCase() || '');

    let result;
    if (isLocation) {
      result = await portraitGenerator.generateLocationShot(entity);
    } else {
      result = await portraitGenerator.generatePortrait(entity);
    }

    // Get the generated image
    const image = isLocation ? result.establishingShot : result.portrait;

    // Build filename and path
    const portraitDir = path.join(process.cwd(), '.narrative-data', 'generated-images', 'portraits');
    const ext = image.mimeType.includes('png') ? 'png' : 'jpeg';
    const filename = `${isLocation ? 'location' : 'portrait'}_${entityId}_${entity.name.toLowerCase().replace(/\s+/g, '_')}.${ext}`;
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
  const { name, description, color } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  const newProject = {
    id: `project_${Date.now()}`,
    name,
    description: description || '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isActive: false,
    stats: { entities: 0, relationships: 0, commits: 0, branches: 1 },
    color: color || '#8b5cf6',
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

  const { name, description, color } = req.body;
  projects[index] = {
    ...projects[index],
    name: name || projects[index].name,
    description: description !== undefined ? description : projects[index].description,
    color: color || projects[index].color,
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
    const { prompt, name, color } = req.body;

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
    };

    projects.push(newProject);

    // Switch to the new project
    projects = projects.map(p => ({
      ...p,
      isActive: p.id === projectId,
    }));

    saveProjects(projects);
    saveProjectData(projectId, projectData);

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
  response: z.string().describe('Your creative, conversational response as a world-building partner. Be poetic but clear, imaginative but grounded.'),

  // Graph operations - entities can be new or updates to existing ones
  entities: z.array(z.object({
    name: z.string().describe('Name of the entity'),
    type: z.enum(['character', 'location', 'object', 'concept', 'event', 'organization', 'creature', 'faction', 'artifact']).describe('Type of entity'),
    description: z.string().describe('Current description of the entity - should be cumulative, including all known information'),
    isNew: z.boolean().optional().describe('True if this is a newly created entity, false if updating existing'),
    // Extended fields for richer entity data
    backstory: z.string().optional().describe('Background story or history of this entity'),
    motivations: z.array(z.string()).optional().describe('What drives this entity (for characters/factions)'),
    secrets: z.array(z.string()).optional().describe('Hidden aspects not generally known'),
    status: z.string().optional().describe('Current state (e.g., "alive", "deceased", "active", "dormant", "ruined")'),
    traits: z.array(z.string()).optional().describe('Key characteristics or attributes'),
    updateReason: z.string().optional().describe('If updating existing entity, what new information was added'),
  })).describe('Entities created or significantly elaborated. IMPORTANT: When discussing existing entities, include them here with isNew=false and updated/expanded information.'),

  relationships: z.array(z.object({
    source: z.string().describe('Name of the source entity'),
    target: z.string().describe('Name of the target entity'),
    type: z.string().describe('Type of relationship (e.g., "works_for", "located_in", "fears", "created")'),
    description: z.string().optional().describe('Rich narrative description of this relationship - the story behind the connection, its history, emotional quality, or significance'),
  })).describe('Relationships between entities established or revealed. Include descriptions that bring relationships to life.'),

  // Scene proposals - for when the response includes narrative scene content
  scenes: z.array(z.object({
    title: z.string().describe('A compelling title for this scene'),
    prose: z.string().describe('The full narrative prose of the scene - vivid, immersive writing'),
    summary: z.string().optional().describe('A brief 1-2 sentence summary of what happens'),
    participantNames: z.array(z.string()).describe('Names of entities involved in this scene'),
    locationName: z.string().optional().describe('Name of the location where this scene takes place'),
    events: z.array(z.string()).optional().describe('Key events or beats that occur in this scene'),
    stateChanges: z.array(z.string()).optional().describe('Explicit state changes this scene causes in the narrative graph (e.g., "Elias loses trust in Mara").'),
    insertAfter: z.string().optional().describe('ID or title of scene this should be inserted after, if specific placement is needed'),
  })).optional().describe('Scenes to add to the storyboard. Use this when operationType is "event" or when user explicitly requests a scene be written.'),

  // Scene edits - for modifying existing scenes instead of adding new ones
  sceneEdits: z.array(z.object({
    sceneId: z.string().optional().describe('ID of the scene to update (preferred). If omitted, use the currently selected scene.'),
    sceneTitle: z.string().optional().describe('Title of the scene to update (fallback if ID unknown).'),
    title: z.string().optional().describe('Updated title for the scene'),
    prose: z.string().optional().describe('Updated full prose for the scene (replace existing content)'),
    summary: z.string().optional().describe('Updated 1-2 sentence summary'),
    participantNames: z.array(z.string()).optional().describe('Names of entities that should be participants in this scene'),
    locationName: z.string().optional().describe('Name of the location where this scene takes place'),
    events: z.array(z.string()).optional().describe('Key events or beats that occur in this scene'),
    stateChanges: z.array(z.string()).optional().describe('Explicit state changes introduced by this edit.'),
    mergeParticipants: z.boolean().optional().describe('If true, merge participants with existing instead of replacing'),
  })).optional().describe('Edits to existing scenes. Use this when the user wants to modify a scene (e.g., "add X to this scene") instead of creating a new one.'),

  // Focus tracking - which entities are we talking about
  focusedEntities: z.array(z.string()).describe('Names of the 1-5 entities that are the current focus of this conversation turn. These are the entities the user is actively exploring or discussing.'),

  // Narrative state tracking
  operationType: z.enum(['elaboration', 'event']).describe(
    'ELABORATION: Adding detail, revealing what is (or always was) true about the world. ' +
    'EVENT: Something HAPPENS that changes the world state - a character acts, an event occurs, relationships change.'
  ),

  eventDescription: z.string().optional().describe(
    'If operationType is "event", describe what happened in a single sentence suitable for a commit message. E.g., "Marcus discovers the Neuro-Weavers\' secret laboratory"'
  ),

  suggestCommit: z.boolean().describe(
    'True if an event occurred that should be committed to canon. Events change the world state and should be preserved.'
  ),

  // Canon awareness
  canonNotes: z.string().optional().describe(
    'Any notes about how this relates to established canon. Flag if something might conflict with committed history.'
  ),

  // Themes
  themes: z.array(z.string()).describe('Key themes relevant to THIS exchange (2-5 themes).'),

  // Directions
  suggestedDirections: z.array(z.string()).describe('2-3 interesting directions to explore next'),
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
    | 'frame_mentions_non_participant'
    | 'frame_mentions_unknown_entity';
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

const SceneGroundingReviewSchema = z.object({
  participantNames: z.array(z.string()).optional(),
  locationName: z.string().optional(),
  issues: z.array(z.string()).optional(),
});

const SceneFrameSchema = z.object({
  title: z.string().optional(),
  description: z.string(),
  visual_beat: z.string(),
  participants: z.array(z.string()).optional(),
  location: z.string().optional(),
  dialogue: z.array(z.string()).optional(),
  caption: z.string().optional(),
  sfx: z.array(z.string()).optional(),
  shotType: z.string().optional(),
  camera: z.string().optional(),
  mood: z.string().optional(),
});

const SceneFrameBreakdownSchema = z.object({
  frames: z.array(SceneFrameSchema).min(1),
});

async function reviewSceneGrounding(
  llm: LLMAdapter | null,
  scene: { title?: string; prose?: string; summary?: string; participantNames?: string[]; locationName?: string },
  projectData: any,
  hints?: { requiredParticipants?: string[]; requiredLocation?: string | null }
): Promise<{ participantNames?: string[]; locationName?: string; issues?: string[] }> {
  if (!llm) return {};
  const prose = scene.prose || scene.summary || '';
  if (!prose) return {};

  const availableEntities = projectData.entities.map((e: any) => `${e.name} (${e.type})`).join(', ');
  const participantList = (scene.participantNames || []).join(', ') || 'None';
  const requiredParticipants = hints?.requiredParticipants?.length ? hints.requiredParticipants.join(', ') : 'None';
  const requiredLocation = hints?.requiredLocation || 'None';

  const prompt = `You are a continuity reviewer. Check the scene for which entities are actually present.

Scene title: ${scene.title || 'Untitled'}
Scene prose: ${prose}

Currently listed participants: ${participantList}
Required participants (must include if present in prose or explicitly requested): ${requiredParticipants}
Required location (if explicitly requested): ${requiredLocation}

Available entities (use these names exactly if present): ${availableEntities}

Return corrected participants and location based on the prose. Only include entities clearly present in the scene.
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
    description: 'Get full details about a specific entity by ID or name. Use this when you need complete information about an entity the user is asking about.',
    parameters: {
      id: { type: 'string', description: 'Entity ID (preferred)' },
      name: { type: 'string', description: 'Entity name (will fuzzy match)' },
    },
  },
  {
    name: 'query_entities',
    description: 'Search for entities by type or keyword. Use this to find entities matching certain criteria.',
    parameters: {
      type: { type: 'string', description: 'Filter by entity type (character, location, organization, etc.)' },
      search: { type: 'string', description: 'Search term to match against name or description' },
      limit: { type: 'number', description: 'Max results to return (default 10)' },
    },
  },
  {
    name: 'get_relationships',
    description: 'Get all relationships involving a specific entity. Use this to understand how an entity connects to others.',
    parameters: {
      entityId: { type: 'string', description: 'Entity ID to find relationships for' },
      entityName: { type: 'string', description: 'Entity name (alternative to ID)' },
    },
  },
  {
    name: 'get_scenes',
    description: 'Get scenes/interactions involving specific entities. Use this to see where entities appear in the narrative, either as participants or as a location.',
    parameters: {
      entityId: { type: 'string', description: 'Filter scenes by entity ID' },
      entityName: { type: 'string', description: 'Filter scenes by entity name (alternative to ID)' },
      limit: { type: 'number', description: 'Max scenes to return (default 5)' },
    },
  },
  {
    name: 'get_commits',
    description: 'Get the git-like commit history showing how the narrative world evolved. Use this to understand timeline of changes.',
    parameters: {
      branch: { type: 'string', description: 'Branch name (default: current branch)' },
      limit: { type: 'number', description: 'Max commits to return (default 10)' },
    },
  },
  {
    name: 'get_branches',
    description: 'Get all narrative branches (alternate timelines). Use this to understand different story paths.',
    parameters: {},
  },
  {
    name: 'search_world',
    description: 'Full-text search across all entities, relationships, and scenes. Use this for open-ended exploration.',
    parameters: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Max results (default 10)' },
    },
  },
  // Scene-specific tools for better storyboard coverage
  {
    name: 'get_scene',
    description: 'Get full details about a specific scene by ID or title. Use this when you need complete scene information.',
    parameters: {
      id: { type: 'string', description: 'Scene ID (preferred)' },
      title: { type: 'string', description: 'Scene title (will fuzzy match)' },
    },
  },
  {
    name: 'list_scenes',
    description: 'List all scenes in the storyboard in order. Use this to understand the narrative flow and scene structure.',
    parameters: {
      status: { type: 'string', description: 'Filter by status: canon, draft, or all (default: all)' },
      limit: { type: 'number', description: 'Max scenes to return (default: all)' },
    },
  },
  {
    name: 'get_storyboard',
    description: 'Get the complete storyboard overview with scene order, statuses, and participant summaries. Use this to understand the overall narrative structure.',
    parameters: {},
  },
  {
    name: 'get_scene_diff',
    description: 'Get graph-diff metadata for a scene relative to the previous scene in timeline order. Use this when editing or inserting scenes to preserve continuity.',
    parameters: {
      id: { type: 'string', description: 'Scene ID (preferred)' },
      title: { type: 'string', description: 'Scene title (will fuzzy match)' },
    },
  },
  {
    name: 'get_entity_arc',
    description: 'Get the timeline arc for an entity across scenes (introduced, enters, exits, and key beats).',
    parameters: {
      entityId: { type: 'string', description: 'Entity ID (preferred)' },
      entityName: { type: 'string', description: 'Entity name (alternative to ID)' },
    },
  },
  {
    name: 'get_story_consistency',
    description: 'Get current continuity diagnostics for the storyboard timeline, including warnings/errors.',
    parameters: {},
  },
];

// Tool executor - runs the actual tool logic against project data
function createToolExecutor(projectData: any, session: any) {
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
      worldSummary = 'WORLD GRAPH:\n';
      for (const [type, entities] of Object.entries(entitiesByType)) {
        worldSummary += `\n[${type.toUpperCase()}S]\n`;
        for (const e of entities) {
          const isCanon = session.canonEntityIds.has(e.id);
          worldSummary += `• ${e.name}${isCanon ? ' [CANON]' : ''}: ${e.description || 'No description'}\n`;
        }
      }
      if (projectData.relationships.length > 0) {
        worldSummary += '\n[RELATIONSHIPS]\n';
        for (const r of projectData.relationships) {
          worldSummary += `• ${r.sourceName || r.source} —[${r.type}]→ ${r.targetName || r.target}\n`;
        }
      }
    } else {
      worldSummary = 'This is a new world. Nothing has been established yet.';
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
        decisionContext = '\n=== RECENT USER DECISIONS ===\n';
        decisionContext += 'The creator has REJECTED these proposed additions (do not re-propose similar entities):\n';
        for (const d of rejected) {
          decisionContext += `• "${d.entityName}" - rejected${d.reason ? ` (reason: ${d.reason})` : ''}\n`;
        }
        decisionContext += '\n';
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

      insertContext = '\n=== INSERT CONTEXT ===\n';
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
###############################################################################
# CURRENTLY SELECTED ENTITY (USE THIS DATA FOR FACTUAL QUESTIONS)
###############################################################################
=== CURRENTLY EXPLORING: ${focusedEntity.name.toUpperCase()} ===
** THIS IS WHAT THE USER HAS SELECTED **
Name: ${focusedEntity.name}
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
###############################################################################
When user asks "what do I have selected" → Answer with THIS entity's data above.
DO NOT invent other entities. DO NOT embellish. Report the actual data.
###############################################################################
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
###############################################################################
# CURRENTLY SELECTED SCENE (USE THIS DATA FOR FACTUAL QUESTIONS)
###############################################################################
=== CURRENTLY VIEWING SCENE: ${sceneTitle.toUpperCase()} ===
** THIS IS WHAT THE USER HAS SELECTED **
Title: ${sceneTitle}
Scene ID: ${focusedScene.id}`;
        if (focusedScene.prose || focusedScene.content) {
          const content = focusedScene.prose || focusedScene.content || '';
          sceneFocusContext += `\nContent: ${content.slice(0, 500)}${content.length > 500 ? '...' : ''}`;
        }
        if (focusedScene.summary) sceneFocusContext += `\nSummary: ${focusedScene.summary}`;
        if (focusedScene.status) sceneFocusContext += `\nStatus: ${focusedScene.status}`;

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
###############################################################################
When user asks "what do I have selected" → Answer with THIS scene's data above.
DO NOT invent content. DO NOT embellish. Report the actual data.
###############################################################################
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
=== WORKING MEMORY (Pinned Entities) ===
The user has pinned these entities to focus on during this session:
${pinnedEntities.map(e => `- ${e!.name} (${e!.type}): ${e!.description?.slice(0, 100) || 'No description'}${e!.description && e!.description.length > 100 ? '...' : ''}`).join('\n')}

Consider these entities when generating creative content or making connections.
`;
      }
    }

    const systemPrompt = `You are a narrative-aware creative partner helping build a story world.

###############################################################################
# STOP! READ THIS FIRST - FACTUAL GROUNDING RULES (HIGHEST PRIORITY)
###############################################################################

BEFORE responding to ANY message, check if it's a FACTUAL QUESTION:
- "What do I have selected?" / "What am I looking at?" / "What's selected?"
- "Tell me about [X]" / "What is [X]?" / "Who is [X]?"
- "What entities exist?" / "List the characters"
- Any question asking about EXISTING data in the world

FOR FACTUAL QUESTIONS:
1. If the question is about SELECTION ("what's selected?"), use the === CURRENTLY EXPLORING === / === CURRENTLY VIEWING SCENE === sections below.
2. If the question is about a SPECIFIC ENTITY or SCENE (and it's not currently selected), use tools (get_entity / get_scene / search_world) to look it up.
3. REPORT ACTUAL DATA ONLY — no invention, no embellishment.
4. If nothing is selected AND the question is about selection, say "You don't have anything selected right now."

EXAMPLE - User asks "What do I have selected?" when viewing "The Locus":
CORRECT: "You have The Locus selected. It's a location described as: 'The metaphysical heart of Eidolon where thought becomes geology.' Its traits are [list actual traits]."
WRONG: "You have selected the Fracture Point! Vesper stands at the Mnemonic Singularity..." (THIS IS HALLUCINATION - DON'T DO THIS)

FOR CREATIVE REQUESTS (and ONLY creative requests):
- "Write a scene about..." / "What might happen if..." / "Expand on..." / "Describe..."
- THEN you may generate creative content

###############################################################################

=== YOUR ROLE ===
You are an active collaborator who:
- **ANSWERS FACTUAL QUESTIONS WITH ACTUAL DATA** (most important!)
- Adds creative ideas that expand and deepen the world
- Asks generative questions that reveal new possibilities
- Makes unexpected connections between elements
- Tracks which entities are currently in focus
- Recognizes when something HAPPENS vs when we're adding detail
- Respects canon - committed elements can only change through in-world events
- **ENRICHES existing entities** with deeper detail as the conversation progresses

=== ENTITY ENRICHMENT (CRITICAL!) ===

**ALWAYS extract RICH entity details! Sparse entities make for a shallow world.**

For EVERY entity, strive to include:
- **description**: A vivid, evocative description (not just "a location" but what makes it unique)
- **backstory**: History, origin, how it came to be (REQUIRED for characters, encouraged for all)
- **traits**: 3-5 key characteristics that define it
- **motivations**: What drives it (for characters, factions, organizations)
- **secrets**: Hidden aspects - every interesting entity has secrets
- **status**: Current state (alive, active, thriving, declining, ruined, dormant, etc.)

For RELATIONSHIPS, always include:
- **description**: The story behind the connection - not just "located_in" but "carved into the bedrock centuries ago as a sanctuary from the surface wars"

Example of GOOD entity extraction:
{
  name: "The Oubliette",
  type: "location",
  description: "The absolute center of Eidolon, a sealed vault beneath the Locus",
  backstory: "Built during the Founding as a prison for memories too dangerous to forget and too valuable to destroy",
  traits: ["ancient", "sealed", "feared"],
  secrets: ["Contains the original city charter that contradicts official history", "Something still stirs within its deepest chamber"],
  status: "sealed but not silent"
}

Example of BAD (too sparse):
{ name: "The Oubliette", type: "location", description: "A vault" }

**When discussing existing entities, include them with isNew=false and ADD more detail.**

=== NARRATIVE RULES ===

**ELABORATION vs EVENT:**
- ELABORATION: Revealing detail about what IS (or always was) true. Adding description, backstory, traits. The world isn't changing, we're just seeing more of it.
- EVENT: Something HAPPENS. A character acts. A discovery is made. Relationships shift. The world state changes.

**CANON RULES:**
- Entities marked [CANON] have been committed to the timeline
- Canon can only be changed through in-world EVENTS, not author edits
- Example: If "Marcus is CEO" is canon, Marcus can only stop being CEO if an event makes it so (resignation, coup, death)
- Uncommitted elements are still fluid and can be freely revised

**FOCUS:**
- Track which entities the conversation is currently about (1-5 entities max)
- When focus shifts, note the new focused entities
- Use focus to provide relevant context about connections

**COMMITS:**
- Suggest a commit when a significant EVENT occurs
- Events that change the story state should be committed
- The commit message should describe what happened

**INSERTION / STORYBOARD PLACEMENT:**
- If the user asks to insert a scene, create a flashback, or place something "before/after", call list_scenes or get_storyboard.
- Use insertAfter in your scene proposals when placement is explicit.
- If an INSERT CONTEXT block is present, honor it for placement unless it conflicts with story logic.

**SCENE EDITING (CRITICAL):**
- If the user refers to the currently selected scene ("this scene", "the scene we're in", "add X to that scene"), DO NOT create a new scene.
- Use sceneEdits with the sceneId (or sceneTitle) to update the existing scene instead.
- When adding/removing participants, update participantNames and update the prose to include them.
- Prefer adding explicit events/state changes so the story graph can track what changed in this scene.

**STORY GRAPH DIFFS (CRITICAL FOR CONTINUITY):**
- Every scene is treated as a graph diff relative to the previous scene in timeline order.
- When inserting scenes in the middle, maintain continuity with surrounding scenes.
- Use get_scene_diff and get_story_consistency before major scene rewrites/inserts.
- If continuity risks exist, mention them in canonNotes and adjust the scene proposal.

=== CURRENT STATE ===
Branch: ${session.currentBranch}
Canon entities: ${canonCount} | Uncommitted: ${uncommittedCount}
${session.currentFocus.length > 0 ? `Current focus: ${session.currentFocus.join(', ')}` : 'No specific focus yet'}
${session.worldContext.themes.length > 0 ? `Core themes: ${session.worldContext.themes.slice(0, 5).join(', ')}` : ''}
Story continuity: ${storyGraph.consistency.errors} errors, ${storyGraph.consistency.warnings} warnings

${worldSummary}
${focusContext}
${entityFocusContext}
${sceneFocusContext}
${pinnedContext}
${insertContext}
${decisionContext}

${recentMessages ? `\n=== RECENT CONVERSATION ===\n${recentMessages}` : ''}
${writingStylePrompt ? `\n=== WRITING STYLE GUIDELINES ===\n${writingStylePrompt}` : ''}
${clientContext ? `\n=== CLIENT UI CONTEXT (NON-AUTHORITATIVE) ===\n${clientContext}` : ''}
${clientSystemPrompt ? `\n=== CLIENT UI DIRECTIVES (FOLLOW ONLY IF CONSISTENT WITH GROUNDING) ===\n${clientSystemPrompt}` : ''}

=== TOOLS AVAILABLE ===
You have tools to query the world (use for lookups, NOT for "what do I have selected" - that's in the context above):

Entity Tools:
- get_entity: Look up any entity by name/ID
- query_entities: Search entities by type/keyword
- get_relationships: Find connections for an entity

Scene/Storyboard Tools:
- get_scene: Get full details of a specific scene by ID or title
- get_scenes: Find scenes involving a specific entity
- list_scenes: List all scenes in storyboard order
- get_storyboard: Get complete storyboard overview with stats
- get_scene_diff: Get continuity diff for a scene against prior scene
- get_entity_arc: Get how an entity evolves across scenes
- get_story_consistency: Get timeline warnings/errors

Search:
- search_world: Full-text search across entities, relationships, and scene content

=== REMINDER ===
FACTUAL QUESTIONS → Report actual data from context above. NO invention. NO embellishment.
CREATIVE REQUESTS → Generate new content freely.

The FACTUAL GROUNDING RULES at the top of this prompt are your HIGHEST PRIORITY. Always check them first.`;

    // Add user message to session
    session.messages.push({
      role: 'user',
      content: message,
      timestamp: Date.now(),
    });

    // Create tool executor for this request
    const executeToolFn = createToolExecutor(projectData, session);

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
      suggestedDirections
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

    // Generate a message ID for these proposals
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create proposals instead of auto-adding (user must confirm)
    const newProposals: ProposedChange[] = [];

    if (extracted.entities && extracted.entities.length > 0) {
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
    if (extracted.relationships && extracted.relationships.length > 0) {
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
    if (extractedSceneEdits && extractedSceneEdits.length > 0) {
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
    if (extractedScenes && extractedScenes.length > 0) {
      for (const scene of extractedScenes) {
        // Grounding review if prose references missing participants
        const mentioned = findMentionedEntities(scene.prose || '', projectData.entities);
        const sceneParticipantNames = (scene.participantNames || []).map((n: string) => n.toLowerCase());
        const missingMentions = mentioned.filter((name) => !sceneParticipantNames.includes(name.toLowerCase()));

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

        if (missingMentions.length > 0 || !scene.participantNames || scene.participantNames.length === 0) {
          const review = await reviewSceneGrounding(llmAdapter, scene, projectData, {
            requiredParticipants: requiredParticipantNames,
            requiredLocation: scene.locationName || null,
          });
          if (review.participantNames && review.participantNames.length > 0) {
            scene.participantNames = Array.from(new Set([...(scene.participantNames || []), ...review.participantNames]));
          }
          if (review.locationName) {
            scene.locationName = review.locationName;
          }
          if (review.issues && review.issues.length > 0) {
            scene.reviewNotes = review.issues;
          }
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

    // Auto-accept low-risk updates (descriptive enrichments only)
    const pendingProposals: ProposedChange[] = [];
    const autoAcceptedProposals: ProposedChange[] = [];

    const isLowRiskUpdate = (existing: any, proposed: any): boolean => {
      if (!existing || !proposed) return false;
      // Do not auto-accept if core identity changes
      if (existing.name !== proposed.name) return false;
      if (existing.type !== proposed.type) return false;
      if (proposed.status && proposed.status !== existing.status) return false;

      // Only allow additive fields
      const allowedKeys = new Set([
        'description',
        'backstory',
        'traits',
        'motivations',
        'secrets',
      ]);

      const changedKeys = Object.keys(proposed).filter((k) => {
        if (['id', 'name', 'type', 'status', 'createdAt', 'firstMentioned', 'lastUpdated', 'mentions'].includes(k)) {
          return false;
        }
        return JSON.stringify(proposed[k]) !== JSON.stringify(existing[k]);
      });

      return changedKeys.every((k) => allowedKeys.has(k));
    };

    for (const proposal of newProposals) {
      if (proposal.type === 'update_entity' && proposal.entity && proposal.existingEntity) {
        if (isLowRiskUpdate(proposal.existingEntity, proposal.entity)) {
          // Apply immediately
          const existingIndex = projectData.entities.findIndex((e: any) => e.id === proposal.entity.id);
          if (existingIndex >= 0) {
            projectData.entities[existingIndex] = proposal.entity;
            if (!session.pendingChanges.addedEntityIds.has(proposal.entity.id)) {
              session.pendingChanges.modifiedEntityIds.add(proposal.entity.id);
            }
            session.uncommittedChanges = true;
          }

          proposal.status = 'accepted';
          autoAcceptedProposals.push(proposal);

          // Track decision + undo
          session.userDecisions.push({
            changeId: proposal.id,
            decision: 'accepted',
            entityName: proposal.entity?.name,
            timestamp: Date.now(),
          });
          continue;
        }
      }

      pendingProposals.push(proposal);
    }

    // Add pending proposals to session
    session.pendingProposals.push(...pendingProposals);

    // Track auto-accepted proposals for undo (keep last 20)
    if (autoAcceptedProposals.length > 0) {
      session.recentAcceptedProposals = [
        ...(session.recentAcceptedProposals || []),
        ...autoAcceptedProposals,
      ].slice(-20);

      saveProjectData(projectId, projectData);
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
          ...(step.text && { text: step.text.slice(0, 200) + (step.text.length > 200 ? '...' : '') }),
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

// Get session status (uncommitted changes, pending changes summary)
app.get('/api/narrative/session/status', (req, res) => {
  try {
    const projectId = getActiveProjectId();
    const session = getWorldSession(projectId);
    const projectData = loadProjectData(projectId);
    const storyGraph = buildStoryGraphAnalysis(projectData);

    // Get pending changes summary
    const { addedEntityIds, modifiedEntityIds, addedRelationshipIds, addedSceneIds, modifiedSceneIds } = session.pendingChanges;

    // Get names of added/modified items for the commit suggestion
    const addedEntities = projectData.entities
      .filter((e: any) => addedEntityIds.has(e.id))
      .map((e: any) => ({ id: e.id, name: e.name, type: e.type }));
    const modifiedEntities = projectData.entities
      .filter((e: any) => modifiedEntityIds.has(e.id))
      .map((e: any) => ({ id: e.id, name: e.name, type: e.type }));
    const addedRelationships = projectData.relationships
      .filter((r: any) => addedRelationshipIds.has(r.id))
      .map((r: any) => ({ id: r.id, sourceName: r.sourceName, targetName: r.targetName, type: r.type }));

    // Added scenes tracked via session, fall back to commit history if needed
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

    // Calculate uncommittedChanges based on actual pending content
    const hasUncommittedChanges = addedEntities.length > 0 || modifiedEntities.length > 0 ||
                                   addedRelationships.length > 0 || addedScenes.length > 0 || modifiedScenes.length > 0;
    const storyConsistency = {
      errors: storyGraph.consistency.errors,
      warnings: storyGraph.consistency.warnings,
      isConsistent: storyGraph.consistency.isConsistent,
    };

    res.json({
      uncommittedChanges: hasUncommittedChanges,
      currentBranch: session.currentBranch,
      storyConsistency,
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
      worldState: {
        entityCount: projectData.entities.length,
        relationshipCount: projectData.relationships.length,
        sceneCount: (projectData.interactions || []).length,
        commitCount: (projectData.commits || []).length,
        canonCount: session.canonEntityIds.size,
        storyConsistency,
      },
    });
  } catch (error: any) {
    console.error('Session status error:', error);
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
    const { entityData, aspectRatio = '1:1', imageSize = '1K', visualStylePrompt, customPrompt } = req.body;

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
    if (visualStylePrompt) {
      mergedDescription = `[VISUAL STYLE: ${visualStylePrompt}]\n\n${mergedDescription || entity.description || ''}`.trim();
    }
    if (customPrompt || visualStylePrompt) {
      entity = {
        ...entity,
        description: mergedDescription || entity.description || '',
      };
    }

    const isLocation = ['location', 'place', 'setting'].includes(entity.type?.toLowerCase() || '');

    let result;
    if (isLocation) {
      result = await portraitGenerator.generateLocationShot(entity);
    } else {
      result = await portraitGenerator.generatePortrait(entity);
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

    // Update entity
    projectData.entities[entityIndex] = {
      ...projectData.entities[entityIndex],
      ...updates,
      id: entityId, // Preserve ID
      updatedAt: new Date().toISOString(),
    };

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
