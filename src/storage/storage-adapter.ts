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

export interface ProjectData {
  entities: any[];
  relationships: any[];
  commits: any[];
  branches: any[];
  interactions: any[];
  storyGraph?: any;
  conversationHistory?: ConversationHistory;
}

export interface ProjectStats {
  entities: number;
  relationships: number;
  commits: number;
  branches: number;
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
  };
}
