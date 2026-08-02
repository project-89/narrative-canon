/**
 * File-Based Storage Adapter
 *
 * Implements the StorageAdapter interface using local JSON files.
 * Good for development and single-user scenarios.
 */

import * as fs from 'fs';
import * as path from 'path';
import { isDeepStrictEqual } from 'util';
import {
  StorageAdapter,
  Project,
  ProjectData,
  createEmptyProjectData,
  createDefaultProject,
} from './storage-adapter';
import { atomicWriteJsonSync } from './atomic-write';
import { mintId } from '../utils/ids';
import { assertSafeProjectId, resolveSafeChild } from '../security/local-boundary';
import {
  acquireProjectBoundaryLock,
  acquireCatalogBoundaryLockAsync,
  acquireProjectBoundaryLockAsync,
  assertProjectNotTombstoned,
  filterTombstonedProjects,
} from './project-archive-boundary';
import { validateRecoveryWorldArtifact } from './project-archive-recovery';
import {
  beginProjectCreationJournal,
  completeProjectCreationJournal,
  markProjectCreationArtifactsPublished,
} from './project-creation-journal';

export class ProjectCatalogWriteConflictError extends Error {
  readonly code = 'PROJECT_CATALOG_WRITE_CONFLICT';
  readonly projectId: string;

  constructor(projectId: string) {
    super(
      `Project catalog row ${projectId} changed in another checkout after this adapter loaded it; `
      + 'the stale bulk replacement was refused. Reload the catalog and retry.',
    );
    this.name = 'ProjectCatalogWriteConflictError';
    this.projectId = projectId;
  }
}

export class FileStorageAdapter implements StorageAdapter {
  private dataDir: string;
  private projectsFile: string;
  /**
   * Raw catalog snapshot, never a tombstone-filtered view. A tombstone can be
   * removed during an archive rollback; destructively filtering this cache
   * would otherwise make the project disappear from this process even after
   * the durable boundary reopened it.
   */
  private projectsCache: Project[] | null = null;
  private projectDataOrigins = new WeakMap<object, { projectId: string; stamp: string | null }>();

  private durableFileStamp(file: string): string | null {
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile()) throw new Error(`Expected a regular project-data file: ${file}`);
      return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    } catch (error: any) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  private rememberProjectData(projectId: string, data: ProjectData, stamp: string | null): ProjectData {
    this.projectDataOrigins.set(data as object, { projectId, stamp });
    return data;
  }

  /** Project catalogs are JSON artifacts, so a JSON round-trip is also the
   * most faithful way to keep callers from mutating the adapter's raw cache. */
  private cloneProjects(projects: Project[]): Project[] {
    return JSON.parse(JSON.stringify(projects)) as Project[];
  }

  /** Read the durable catalog directly. Callers that mutate the result must
   * own the catalog boundary; lock-free readers are safe because publication
   * is an atomic rename. */
  private readDurableProjects(): Project[] | null {
    if (!fs.existsSync(this.projectsFile)) return null;
    const parsed = JSON.parse(fs.readFileSync(this.projectsFile, 'utf-8'));
    if (!Array.isArray(parsed)) {
      throw new Error(`Invalid project catalog at ${this.projectsFile}: expected an array`);
    }
    return this.cloneProjects(parsed as Project[]);
  }

  private assertVirginStoreBeforeBootstrap(): void {
    const evidence: string[] = [];
    if (fs.existsSync(`${this.projectsFile}.bak`)) evidence.push('projects.json.bak');
    for (const entry of fs.readdirSync(this.dataDir, { withFileTypes: true })) {
      if (/^project_.+\.json(?:\.bak)?$/.test(entry.name)) evidence.push(entry.name);
      if (entry.name === '.archive-boundary') evidence.push(entry.name);
      if (entry.name === 'nit' && entry.isDirectory()) {
        const nitFiles = fs.readdirSync(path.join(this.dataDir, entry.name));
        if (nitFiles.some(name => name.endsWith('.json') || name.endsWith('.json.bak'))) {
          evidence.push('nit canon artifacts');
        }
      }
      if (entry.name === 'trash' && entry.isDirectory()) {
        const projectTrash = path.join(this.dataDir, 'trash', 'projects');
        if (fs.existsSync(projectTrash) && fs.readdirSync(projectTrash).length > 0) {
          evidence.push('project archive artifacts');
        }
      }
    }
    if (evidence.length > 0) {
      throw new Error(
        `Project catalog is missing but durable project evidence remains (${[...new Set(evidence)].join(', ')}); recovery is required`,
      );
    }
  }

  /** Publish the caller-owned raw catalog, filtering archive tombstones only
   * at the durable boundary. Keep the pre-filter snapshot in memory: removing
   * a tombstone during an owned rollback must make that row visible again in
   * this process instead of leaving a destructively filtered cache behind. */
  private publishProjects(projects: Project[]): void {
    const publishable = filterTombstonedProjects(this.dataDir, projects);
    atomicWriteJsonSync(this.projectsFile, publishable);
    this.projectsCache = this.cloneProjects(projects);
  }

  /** Every internal catalog change is a small mutation of a freshly-read
   * durable catalog while holding the cross-checkout catalog lock. */
  private async mutateDurableProjects<T>(
    mutate: (projects: Project[]) => T,
  ): Promise<T> {
    const boundary = await acquireCatalogBoundaryLockAsync(this.dataDir);
    try {
      const projects = this.readDurableProjects() ?? [];
      const result = mutate(projects);
      this.publishProjects(projects);
      return result;
    } finally {
      boundary.release();
    }
  }

  /** Project-scoped catalog mutations take locks in the same order as the
   * archive transaction (project, then catalog), closing the tombstone race. */
  private async mutateProjectCatalog<T>(
    projectId: string,
    mutate: (projects: Project[]) => T,
  ): Promise<T> {
    const safeId = assertSafeProjectId(projectId);
    assertProjectNotTombstoned(this.dataDir, safeId);
    const projectBoundary = await acquireProjectBoundaryLockAsync(this.dataDir, safeId, 'publish');
    try {
      assertProjectNotTombstoned(this.dataDir, safeId);
      return await this.mutateDurableProjects(projects => {
        // Keep the decisive check adjacent to the mutation. Holding the
        // project boundary means an archive cannot claim a tombstone between
        // this check and catalog publication.
        assertProjectNotTombstoned(this.dataDir, safeId);
        return mutate(projects);
      });
    } finally {
      projectBoundary.release();
    }
  }

  /** Return a current tombstone-filtered copy without altering the raw cache. */
  private visibleProjects(projects: Project[]): Project[] {
    return this.cloneProjects(filterTombstonedProjects(this.dataDir, projects));
  }

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
    try {
      const durable = this.readDurableProjects();
      if (durable) {
        this.projectsCache = durable;
        return this.visibleProjects(this.projectsCache);
      }
      if (this.projectsCache) {
        throw new Error(
          `Project catalog disappeared after initialization: ${this.projectsFile}`,
        );
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
      // Never replace an unreadable or missing durable catalog with a stale
      // cache/default world. Another checkout's rows are authoritative.
      throw error;
    }

    // Bootstrap only a genuinely virgin store. A missing catalog beside a
    // backup/world/archive is a recovery incident, never permission to invent
    // a replacement default catalog.
    this.assertVirginStoreBeforeBootstrap();
    const defaultProject = createDefaultProject();
    const projectBoundary = acquireProjectBoundaryLock(this.dataDir, defaultProject.id, 'publish');
    try {
      beginProjectCreationJournal(projectBoundary, defaultProject, { activate: true });
      atomicWriteJsonSync(this.projectDataFile(defaultProject.id), createEmptyProjectData());
      markProjectCreationArtifactsPublished(projectBoundary);
      const catalogBoundary = await acquireCatalogBoundaryLockAsync(this.dataDir);
      try { this.publishProjects([{ ...defaultProject, isActive: true }]); } finally { catalogBoundary.release(); }
      completeProjectCreationJournal(projectBoundary);
      return this.visibleProjects(this.projectsCache!);
    } finally {
      projectBoundary.release();
    }
  }

  async saveProjects(projects: Project[]): Promise<void> {
    // This legacy bulk surface is deliberately additive/upsert-only. Its input
    // is often a tombstone-filtered, process-local view; treating omission as
    // deletion would let that stale view erase projects another checkout just
    // created. Destructive removal belongs exclusively to the recoverable
    // archive transaction.
    const incoming = this.cloneProjects(projects);
    const boundary = await acquireCatalogBoundaryLockAsync(this.dataDir);
    try {
      const durable = this.readDurableProjects() ?? [];
      const incomingById = new Map<string, Project>();
      for (const project of incoming) incomingById.set(project.id, project);
      const observedById = new Map(
        (this.projectsCache ?? []).map(project => [project.id, project] as const),
      );

      const merged: Project[] = [];
      const included = new Set<string>();
      for (const project of durable) {
        const replacement = incomingById.get(project.id);
        if (replacement) {
          const observed = observedById.get(project.id);
          // Omitted rows remain additive and idempotent replays remain safe.
          // A genuine same-ID replacement, however, may proceed only from the
          // row this adapter last observed. The catalog lock makes this check
          // and the following publication one compare-and-swap boundary.
          if (
            !isDeepStrictEqual(replacement, project)
            && (!observed || !isDeepStrictEqual(project, observed))
          ) {
            throw new ProjectCatalogWriteConflictError(project.id);
          }
        }
        merged.push(replacement ?? project);
        included.add(project.id);
      }
      for (const project of incoming) {
        if (included.has(project.id)) continue;
        // If the input itself contains duplicate IDs, the final occurrence is
        // the upsert value and the row is still appended only once.
        merged.push(incomingById.get(project.id)!);
        included.add(project.id);
      }

      this.publishProjects(merged);
    } catch (error) {
      console.error('Failed to save projects:', error);
      throw error;
    } finally {
      boundary.release();
    }
  }

  async getProject(id: string): Promise<Project | null> {
    const projects = await this.loadProjects();
    return projects.find(p => p.id === id) || null;
  }

  async createProject(project: Omit<Project, 'id'> & { id?: string }): Promise<Project> {
    const projectId = assertSafeProjectId(project.id ?? mintId('project'));

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

    const projectBoundary = await acquireProjectBoundaryLockAsync(this.dataDir, projectId, 'publish');
    try {
      beginProjectCreationJournal(projectBoundary, newProject, { activate: newProject.isActive });
      atomicWriteJsonSync(this.projectDataFile(projectId), createEmptyProjectData());
      markProjectCreationArtifactsPublished(projectBoundary);
      const catalogBoundary = await acquireCatalogBoundaryLockAsync(this.dataDir);
      try {
        const projects = this.readDurableProjects() ?? [];
        if (projects.some(existing => existing.id === projectId)) {
          throw new Error(`Project ${projectId} already exists`);
        }
        const next = newProject.isActive
          ? [...projects.map(existing => ({ ...existing, isActive: false })), newProject]
          : [...projects, newProject];
        this.publishProjects(next);
      } finally {
        catalogBoundary.release();
      }
      completeProjectCreationJournal(projectBoundary);
    } finally {
      projectBoundary.release();
    }

    return this.cloneProjects([newProject])[0];
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
    const safeId = assertSafeProjectId(id);
    const updated = await this.mutateProjectCatalog(safeId, projects => {
      const index = projects.findIndex(project => project.id === safeId);
      if (index === -1) return null;

      projects[index] = {
        ...projects[index],
        ...updates,
        // A project update may alter metadata, never the storage identity.
        id: safeId,
        updatedAt: Date.now(),
      };
      return projects[index];
    });
    return updated ? this.cloneProjects([updated])[0] : null;
  }

  async deleteProject(id: string): Promise<boolean> {
    assertSafeProjectId(id);
    throw new Error('Direct project deletion is disabled; use the recoverable project archive API');
  }

  async loadProjectData(projectId: string): Promise<ProjectData> {
    const safeId = assertSafeProjectId(projectId);
    assertProjectNotTombstoned(this.dataDir, safeId);
    const projectFile = this.projectDataFile(safeId);
    const openingStamp = this.durableFileStamp(projectFile);

    if (openingStamp !== null) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const before = this.durableFileStamp(projectFile);
        if (before === null) break;
        let parsed: any;
        try {
          parsed = JSON.parse(fs.readFileSync(projectFile, 'utf-8'));
        } catch (error: any) {
          if (this.durableFileStamp(projectFile) !== before) continue;
          throw new Error(
            `Project data for ${safeId} is unreadable; refusing an empty fallback: ${error?.message || error}`,
          );
        }
        const validation = validateRecoveryWorldArtifact(parsed);
        if (!validation.valid) {
          if (this.durableFileStamp(projectFile) !== before) continue;
          throw new Error(
            `Project data for ${safeId} is structurally invalid; refusing an empty fallback: ${validation.error}`,
          );
        }
        const after = this.durableFileStamp(projectFile);
        if (after !== before) continue;

        // T0-SAFETY: spread `parsed` FIRST, then default known fields — the
        // old whitelist here silently DROPPED every field it didn't list
        // (acts, timeline, script, assets, artifacts, generatedImages…).
        const normalized = {
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
        // An archive may have claimed its tombstone while a large JSON file
        // was being parsed. Do not hand stale live state back after that claim.
        assertProjectNotTombstoned(this.dataDir, safeId);
        return this.rememberProjectData(safeId, normalized, after);
      }
      throw new Error(`Project ${safeId} changed repeatedly while it was being read; retry the operation`);
    }

    if (fs.existsSync(`${projectFile}.bak`)) {
      throw new Error(`Primary project data is missing while a backup exists for ${safeId}; recovery is required`);
    }

    // Project creation writes its initial world explicitly. Returning a
    // fabricated empty world here would erase the evidence that a catalogued
    // project's source of truth disappeared.
    assertProjectNotTombstoned(this.dataDir, safeId);
    throw new Error(`Project data is missing for ${safeId}; recovery is required`);
  }

  async saveProjectData(projectId: string, data: ProjectData): Promise<void> {
    const safeId = assertSafeProjectId(projectId);
    // Cheap fast-fail for an already archived project. This is deliberately
    // repeated while holding the boundary below to close the check/write race.
    assertProjectNotTombstoned(this.dataDir, safeId);
    const projectFile = this.projectDataFile(safeId);
    const boundary = await acquireProjectBoundaryLockAsync(this.dataDir, safeId, 'publish');

    try {
      assertProjectNotTombstoned(this.dataDir, safeId);
      const durableStamp = this.durableFileStamp(projectFile);
      const origin = this.projectDataOrigins.get(data as object);
      if (
        (origin && (origin.projectId !== safeId || origin.stamp !== durableStamp))
        || (!origin && durableStamp !== null)
      ) {
        throw new Error(
          `Project ${safeId} changed in another checkout after this operation loaded it; `
          + 'the stale write was refused',
        );
      }
      atomicWriteJsonSync(projectFile, data);
      this.rememberProjectData(safeId, data, this.durableFileStamp(projectFile));

      // Stats are advisory, but when they are updated they remain inside the
      // same project→catalog lock order as the world publication. An archive
      // cannot slip between the content write and this targeted merge.
      try {
        await this.mutateDurableProjects(projects => {
          const project = projects.find(candidate => candidate.id === safeId);
          if (!project) return;
          project.stats = {
            entities: data.entities.length,
            relationships: data.relationships.length,
            commits: data.commits.length,
            branches: data.branches.length,
          };
          project.updatedAt = Date.now();
        });
      } catch (statsError) {
        console.error(`Failed to update advisory project stats for ${projectId}:`, statsError);
      }
    } catch (error) {
      console.error(`Failed to save project data for ${projectId}:`, error);
      throw error;
    } finally {
      boundary.release();
    }

  }

  async getActiveProject(): Promise<Project | null> {
    const projects = await this.loadProjects();
    return projects.find(p => p.isActive) || projects[0] || null;
  }

  async setActiveProject(projectId: string): Promise<void> {
    const safeId = assertSafeProjectId(projectId);
    await this.mutateProjectCatalog(safeId, projects => {
      // Preserve the catalog unchanged when the requested ID does not exist;
      // the old bulk rewrite silently deactivated every project in this case.
      if (!projects.some(project => project.id === safeId)) return;
      for (const project of projects) project.isActive = project.id === safeId;
    });
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
