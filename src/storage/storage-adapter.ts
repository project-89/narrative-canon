/**
 * Storage Adapter Interface
 *
 * Defines the contract for storage backends (file-based, MongoDB, etc.)
 * All storage operations are async to support both local and remote backends.
 */

export interface ConversationHistory {
  messages: any[];
  worldContext: {
    themes: string[];
    tone: string;
    influences: string[];
  };
  currentFocus: string[];
  userDecisions: any[];
  lastUpdated: number;
}

export interface ScratchpadDocument {
  id: string;
  title: string;
  content: string;
  category: 'world_bible' | 'story_arc' | 'character_notes' | 'reference' | 'other';
  isPinned: boolean;
  source?: 'user' | 'assistant' | 'system';
  createdAt: number;
  updatedAt: number;
}

/** Uploaded asset metadata. Source files live on disk (or storage backend);
 *  this record points at them and carries the user-curated metadata.
 *  category 'style' = visual style reference; 'character/scene/location/object'
 *  = subject reference material; 'reference' = anything else useful for AI
 *  context; 'other' = catch-all. */
export interface Asset {
  id: string;
  category: 'character' | 'scene' | 'location' | 'object' | 'style' | 'reference' | 'other';
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

export interface ProjectData {
  entities: any[];
  relationships: any[];
  commits: any[];
  branches: any[];
  interactions: any[];
  documents: ScratchpadDocument[];
  /** Diegetic media objects — Time covers, articles, memos, social posts, etc.
   *  See createEmptyProjectData() for the empty default. */
  artifacts?: any[];
  /** User-uploaded reference assets — character sheets, location refs, style
   *  references, etc. Separate from artifacts (which are in-universe media). */
  assets?: Asset[];
  storyGraph?: any;
  conversationHistory?: ConversationHistory;
}

export interface ProjectStats {
  entities: number;
  relationships: number;
  commits: number;
  branches: number;
}

export interface ProjectStyleProfile {
  presetId?: string;
  presetName?: string;
  narrativePresetId?: string;
  narrativePresetName?: string;
  visualPresetId?: string;
  visualPresetName?: string;
  narrativePrompt?: string;
  visualPrompt?: string;
  /** Asset IDs (from ProjectData.assets) that should be auto-attached as
   *  reference images on every /render call. Lets a project pin its visual
   *  style references once and have them propagate to all generations. */
  styleAssetIds?: string[];
  updatedAt?: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
  stats: ProjectStats;
  color: string;
  styleProfile?: ProjectStyleProfile;
}

export interface StorageAdapter {
  // Project operations
  loadProjects(): Promise<Project[]>;
  saveProjects(projects: Project[]): Promise<void>;
  getProject(id: string): Promise<Project | null>;
  createProject(project: Omit<Project, 'id'> & { id?: string }): Promise<Project>;
  updateProject(id: string, updates: Partial<Project>): Promise<Project | null>;
  deleteProject(id: string): Promise<boolean>;

  // Project data operations
  loadProjectData(projectId: string): Promise<ProjectData>;
  saveProjectData(projectId: string, data: ProjectData): Promise<void>;

  // Convenience methods
  getActiveProject(): Promise<Project | null>;
  setActiveProject(projectId: string): Promise<void>;

  // Health check
  isHealthy(): Promise<boolean>;

  // Cleanup
  close?(): Promise<void>;
}

// Default empty project data
export function createEmptyProjectData(): ProjectData {
  return {
    entities: [],
    relationships: [],
    commits: [],
    branches: [
      {
        id: 'main',
        name: 'main',
        description: 'The canonical timeline',
        color: '#22c55e',
        isActive: true,
        isCanon: true,
        probability: 1.0,
        commitCount: 0,
        lastCommit: 'never',
        createdAt: new Date().toISOString(),
      }
    ],
    interactions: [],
    documents: [],
    artifacts: [],
    assets: [],
  };
}

// Default demo project
export function createDefaultProject(): Project {
  return {
    id: 'demo',
    name: 'Demo Universe',
    description: 'A sample narrative universe to explore the workbench features',
    createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 2 * 60 * 60 * 1000,
    isActive: true,
    stats: { entities: 0, relationships: 0, commits: 0, branches: 1 },
    color: '#06b6d4',
    styleProfile: {
      presetId: 'cinematic-concept',
      presetName: 'Cinematic Concept',
      narrativePresetId: 'cinematic-concept',
      narrativePresetName: 'Cinematic Concept',
      visualPresetId: 'cinematic-concept',
      visualPresetName: 'Cinematic Concept',
      narrativePrompt: 'Cinematic prose with concrete sensory detail, emotional clarity, and clear cause/effect transitions.',
      visualPrompt: 'Concept art with natural lighting, grounded anatomy, atmospheric depth, and strong environmental storytelling.',
      updatedAt: Date.now(),
    },
  };
}
