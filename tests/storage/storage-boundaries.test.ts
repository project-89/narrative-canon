import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createEmptyProjectData } from '../../src/storage/storage-adapter';
import { FileStorageAdapter } from '../../src/storage/file-adapter';
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
