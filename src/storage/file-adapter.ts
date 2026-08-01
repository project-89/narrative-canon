/**
 * File-Based Storage Adapter
 *
 * Implements the StorageAdapter interface using local JSON files.
 * Good for development and single-user scenarios.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  StorageAdapter,
  Project,
  ProjectData,
  createEmptyProjectData,
  createDefaultProject,
} from './storage-adapter';
import { atomicWriteJsonSync, enqueueSerializedWrite } from './atomic-write';
import { mintId } from '../utils/ids';
import { assertSafeProjectId, resolveSafeChild } from '../security/local-boundary';

export class FileStorageAdapter implements StorageAdapter {
  private dataDir: string;
  private projectsFile: string;
  private projectsCache: Project[] | null = null;

  private projectDataFile(projectId: string): string {
    const safeId = assertSafeProjectId(projectId);
    return resolveSafeChild(this.dataDir, `project_${safeId}.json`);
  }

  constructor(dataDir?: string) {
    this.dataDir = dataDir || path.join(process.cwd(), '.narrative-data');
    this.projectsFile = path.join(this.dataDir, 'projects.json');

    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  async loadProjects(): Promise<Project[]> {
    if (this.projectsCache) {
      return this.projectsCache;
    }

    try {
      if (fs.existsSync(this.projectsFile)) {
        const data = fs.readFileSync(this.projectsFile, 'utf-8');
        this.projectsCache = JSON.parse(data);
        return this.projectsCache!;
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }

    // Return default project if no projects file exists
    const defaultProject = createDefaultProject();
    this.projectsCache = [defaultProject];
    await this.saveProjects(this.projectsCache);
    return this.projectsCache;
  }

  async saveProjects(projects: Project[]): Promise<void> {
    try {
      atomicWriteJsonSync(this.projectsFile, projects);
      this.projectsCache = projects;
    } catch (error) {
      console.error('Failed to save projects:', error);
      throw error;
    }
  }

  async getProject(id: string): Promise<Project | null> {
    const projects = await this.loadProjects();
    return projects.find(p => p.id === id) || null;
  }

  async createProject(project: Omit<Project, 'id'> & { id?: string }): Promise<Project> {
    const projectId = assertSafeProjectId(project.id ?? mintId('project'));
    const projects = await this.loadProjects();

    const newProject: Project = {
      id: projectId,
      name: project.name,
      description: project.description || '',
      createdAt: project.createdAt || Date.now(),
      updatedAt: project.updatedAt || Date.now(),
      isActive: project.isActive || false,
      stats: project.stats || { entities: 0, relationships: 0, commits: 0, branches: 1 },
      color: project.color || '#8b5cf6',
      styleProfile: project.styleProfile,
    };

    projects.push(newProject);
    await this.saveProjects(projects);

    // Create empty project data file
    await this.saveProjectData(newProject.id, createEmptyProjectData());

    return newProject;
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
    const projects = await this.loadProjects();
    const index = projects.findIndex(p => p.id === id);

    if (index === -1) {
      return null;
    }

    projects[index] = {
      ...projects[index],
      ...updates,
      updatedAt: Date.now(),
    };

    await this.saveProjects(projects);
    return projects[index];
  }

  async deleteProject(id: string): Promise<boolean> {
    const safeId = assertSafeProjectId(id);
    const projects = await this.loadProjects();
    const index = projects.findIndex(p => p.id === safeId);

    if (index === -1) {
      return false;
    }

    // Don't allow deleting active project
    if (projects[index].isActive) {
      return false;
    }

    projects.splice(index, 1);
    await this.saveProjects(projects);

    // Delete project data file
    const projectFile = this.projectDataFile(safeId);
    if (fs.existsSync(projectFile)) {
      fs.unlinkSync(projectFile);
    }

    return true;
  }

  async loadProjectData(projectId: string): Promise<ProjectData> {
    const projectFile = this.projectDataFile(projectId);

    try {
      if (fs.existsSync(projectFile)) {
        const data = fs.readFileSync(projectFile, 'utf-8');
        const parsed = JSON.parse(data);

        // T0-SAFETY: spread `parsed` FIRST, then default known fields — the
        // old whitelist here silently DROPPED every field it didn't list
        // (acts, timeline, script, assets, artifacts, generatedImages…).
        // loadProjectDataAsync caches this adapter's result, so the next
        // saveProjectData would persist the lobotomized object: real data
        // loss. Mirrors the identical fix in server.ts loadProjectData
        // (gotcha #16 class).
        return {
          ...parsed,
          entities: parsed.entities || [],
          relationships: parsed.relationships || [],
          commits: parsed.commits || [],
          branches: parsed.branches || createEmptyProjectData().branches,
          interactions: parsed.interactions || [],
          documents: parsed.documents || [],
          storyGraph: parsed.storyGraph,
          conversationHistory: parsed.conversationHistory,
        };
      }
    } catch (error) {
      console.error(`Failed to load project data for ${projectId}:`, error);
    }

    return createEmptyProjectData();
  }

  async saveProjectData(projectId: string, data: ProjectData): Promise<void> {
    const projectFile = this.projectDataFile(projectId);

    try {
      atomicWriteJsonSync(projectFile, data);

      // Update project stats — ON THE SHARED 'projects' CHAIN. projects.json
      // has two async writers (the server's saveProjects and this stats
      // side-effect); if this ran un-serialized from a stale projectsCache
      // (e.g. before a queued create-project save landed), it could clobber
      // a newly created project. Reading loadProjects() INSIDE the chain link
      // guarantees it sees every prior queued write.
      await enqueueSerializedWrite('projects', async () => {
        const projects = await this.loadProjects();
        const project = projects.find(p => p.id === projectId);
        if (project) {
          project.stats = {
            entities: data.entities.length,
            relationships: data.relationships.length,
            commits: data.commits.length,
            branches: data.branches.length,
          };
          project.updatedAt = Date.now();
          await this.saveProjects(projects);
        }
      });
    } catch (error) {
      console.error(`Failed to save project data for ${projectId}:`, error);
      throw error;
    }
  }

  async getActiveProject(): Promise<Project | null> {
    const projects = await this.loadProjects();
    return projects.find(p => p.isActive) || projects[0] || null;
  }

  async setActiveProject(projectId: string): Promise<void> {
    const projects = await this.loadProjects();

    // Deactivate all projects
    for (const project of projects) {
      project.isActive = false;
    }

    // Activate the selected project
    const target = projects.find(p => p.id === projectId);
    if (target) {
      target.isActive = true;
    }

    await this.saveProjects(projects);
  }

  async isHealthy(): Promise<boolean> {
    try {
      return fs.existsSync(this.dataDir);
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    // Nothing to close for file-based storage
    this.projectsCache = null;
  }
}

export default FileStorageAdapter;
