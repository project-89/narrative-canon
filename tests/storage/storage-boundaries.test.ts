import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createEmptyProjectData, Project } from '../../src/storage/storage-adapter';
import {
  FileStorageAdapter,
  ProjectCatalogWriteConflictError,
} from '../../src/storage/file-adapter';
import {
  closeStorage,
  getStorageAdapter,
  resetStorageInstance,
} from '../../src/storage';

describe('file storage boundaries', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'narrative-storage-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rejects project IDs that could escape the data directory', async () => {
    const adapter = new FileStorageAdapter(dir);
    await expect(adapter.loadProjectData('../outside')).rejects.toThrow('Invalid projectId');
    await expect(adapter.saveProjectData('../outside', createEmptyProjectData())).rejects.toThrow(
      'Invalid projectId'
    );
    await expect(adapter.deleteProject('../outside')).rejects.toThrow('Invalid projectId');
  });

  it('rejects an unsafe caller-supplied ID before adding the project index entry', async () => {
    const adapter = new FileStorageAdapter(dir);
    await expect(
      adapter.createProject({
        id: '../outside',
        name: 'Unsafe',
        description: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isActive: false,
        stats: { entities: 0, relationships: 0, commits: 0, branches: 1 },
        color: '#000000',
      })
    ).rejects.toThrow('Invalid projectId');

    const projects = await adapter.loadProjects();
    expect(projects.some(project => project.name === 'Unsafe')).toBe(false);
  });

  it('refuses a stale same-ID bulk replacement while still merging omitted and new rows', async () => {
    const staleAdapter = new FileStorageAdapter(dir);
    const winningAdapter = new FileStorageAdapter(dir);
    const original: Project = {
      id: 'project_catalog_cas',
      name: 'Original',
      description: '',
      createdAt: 1,
      updatedAt: 1,
      isActive: false,
      stats: { entities: 0, relationships: 0, commits: 0, branches: 1 },
      color: '#123456',
    };

    await winningAdapter.saveProjects([original]);
    const staleSnapshot = await staleAdapter.loadProjects();
    const winningSnapshot = await winningAdapter.loadProjects();
    await winningAdapter.saveProjects(
      winningSnapshot.map(project => ({ ...project, name: 'Durable winner', updatedAt: 2 })),
    );

    await expect(staleAdapter.saveProjects(staleSnapshot)).rejects.toMatchObject({
      name: ProjectCatalogWriteConflictError.name,
      code: 'PROJECT_CATALOG_WRITE_CONFLICT',
      projectId: original.id,
    });

    const additive = { ...original, id: 'project_catalog_additive', name: 'Additive row' };
    await staleAdapter.saveProjects([additive]);

    const durable = await new FileStorageAdapter(dir).loadProjects();
    expect(durable.map(project => project.id)).toEqual([original.id, additive.id]);
    expect(durable.find(project => project.id === original.id)?.name).toBe('Durable winner');
  });
});

describe('runtime storage selection', () => {
  let dir: string;
  let oldDataDir: string | undefined;
  let oldUseMongo: string | undefined;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'narrative-storage-factory-'));
    oldDataDir = process.env.DATA_DIR;
    oldUseMongo = process.env.USE_MONGODB;
    process.env.DATA_DIR = dir;
    delete process.env.USE_MONGODB;
    resetStorageInstance();
  });

  afterEach(async () => {
    await closeStorage();
    oldDataDir === undefined ? delete process.env.DATA_DIR : (process.env.DATA_DIR = oldDataDir);
    oldUseMongo === undefined
      ? delete process.env.USE_MONGODB
      : (process.env.USE_MONGODB = oldUseMongo);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('uses the canonical DATA_DIR for file storage', async () => {
    const adapter = await getStorageAdapter();
    expect(adapter).toBeInstanceOf(FileStorageAdapter);
    await adapter.loadProjects();
    expect(fs.existsSync(path.join(dir, 'projects.json'))).toBe(true);
  });

  it('hard-disables the lossy Mongo selection and keeps file writes enabled', async () => {
    process.env.USE_MONGODB = 'true';
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const adapter = await getStorageAdapter();

    expect(adapter).toBeInstanceOf(FileStorageAdapter);
    expect(process.env.USE_MONGODB).toBe('false');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('legacy Mongo adapter drops'));
    error.mockRestore();
  });
});
