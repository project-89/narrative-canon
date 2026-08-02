import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
// Import the pure shape helper directly. Importing the storage factory here
// would initialize its DATA_DIR constant before beforeAll installs the temp
// directory used by the dynamically imported server.
import { createEmptyProjectData, type Project } from '../../src/storage/storage-adapter';
import { atomicWriteJsonSync, enqueueSerializedWrite } from '../../src/storage/atomic-write';
import {
  acquireProjectBoundaryLock,
  inspectProjectBoundaryLock,
  projectArchiveTombstonePath,
  readProjectArchiveTombstone,
} from '../../src/storage/project-archive-boundary';
import { commitContentHash, workingTreeHash } from '../../src/git/format/v1/canonicalize';

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'narrative-api-boundary-'));

beforeAll(() => {
  process.env.DATA_DIR = testDataDir;
  process.env.NARRATIVE_DISABLE_AUTOSTART = 'true';
});

afterAll(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  delete process.env.NARRATIVE_DISABLE_AUTOSTART;
});

describe('API local-service boundary', () => {
  let app: typeof import('../../src/api/server').default;

  const seedProjectData = (
    projectId: string,
    overrides: Partial<ReturnType<typeof createEmptyProjectData>>,
  ) => {
    const data = { ...createEmptyProjectData(), ...overrides };
    fs.writeFileSync(
      path.join(testDataDir, `project_${projectId}.json`),
      JSON.stringify(data, null, 2),
    );
  };

  beforeAll(async () => {
    ({ default: app } = await import('../../src/api/server'));
  });

  it('rejects unsafe project IDs before they reach file storage', async () => {
    const response = await request(app)
      .get('/api/narrative/entities')
      .query({ projectId: '../outside' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid projectId' });
  });

  it('rejects an encoded filename traversal instead of normalizing it', async () => {
    const response = await request(app)
      .get('/api/narrative/visual/images/%252e%252e%252fproject_demo.json');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid image filename');
  });

  it('allows the local studio origin without reflecting arbitrary origins', async () => {
    const local = await request(app)
      .get('/api/narrative/health')
      .set('Origin', 'http://localhost:3089');
    expect(local.headers['access-control-allow-origin']).toBe('http://localhost:3089');

    const foreign = await request(app)
      .get('/api/narrative/health')
      .set('Origin', 'https://attacker.example');
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sets baseline hardening headers and does not advertise Express', async () => {
    const response = await request(app).get('/api/narrative/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('accepts bounded asset batches and returns typed JSON for rejected multipart uploads', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Bounded asset upload target' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;

    let accepted = request(app)
      .post('/api/narrative/assets')
      .field('projectId', projectId)
      .field('category', 'reference');
    for (let index = 0; index < 4; index += 1) {
      accepted = accepted.attach(
        'files',
        Buffer.from(`image-${index}`),
        { filename: `image-${index}.png`, contentType: 'image/png' },
      );
    }
    const acceptedResponse = await accepted;
    expect(acceptedResponse.status).toBe(200);
    expect(acceptedResponse.body.assets).toHaveLength(4);

    let tooMany = request(app)
      .post('/api/narrative/assets')
      .field('projectId', projectId)
      .field('category', 'reference');
    for (let index = 0; index < 5; index += 1) {
      tooMany = tooMany.attach(
        'files',
        Buffer.from(`overflow-${index}`),
        { filename: `overflow-${index}.png`, contentType: 'image/png' },
      );
    }
    const tooManyResponse = await tooMany;
    expect(tooManyResponse.status).toBe(413);
    expect(tooManyResponse.headers['content-type']).toContain('application/json');
    expect(tooManyResponse.body).toMatchObject({
      code: 'LIMIT_FILE_COUNT',
      limits: { maxFiles: 4, maxFileSizeBytes: 50 * 1024 * 1024 },
    });

    const wrongType = await request(app)
      .post('/api/narrative/assets')
      .field('projectId', projectId)
      .attach('files', Buffer.from('not an image'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(wrongType.status).toBe(415);
    expect(wrongType.headers['content-type']).toContain('application/json');
    expect(wrongType.body).toMatchObject({ code: 'UPLOAD_UNSUPPORTED_TYPE' });

    const unscoped = await request(app)
      .post('/api/narrative/assets')
      .attach('files', Buffer.from('image'), { filename: 'unscoped.png', contentType: 'image/png' });
    expect(unscoped.status).toBe(400);
    expect(unscoped.body).toEqual({ error: 'projectId is required for asset uploads' });
  });

  it('keeps the legacy text-import route honest about its eight-file parser cap', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Bounded text import target' });
    expect(created.status).toBe(201);

    let importRequest = request(app)
      .post('/api/canon/import/files')
      .field('projectId', created.body.id);
    for (let index = 0; index < 9; index += 1) {
      importRequest = importRequest.attach(
        'files',
        Buffer.from(`# document ${index}`),
        { filename: `document-${index}.md`, contentType: 'text/markdown' },
      );
    }
    const response = await importRequest;

    expect(response.status).toBe(413);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toMatchObject({
      code: 'LIMIT_FILE_COUNT',
      limits: { maxFiles: 8, maxFileSizeBytes: 10 * 1024 * 1024 },
    });
  });

  it('archives an inactive project and its world data instead of orphaning or destroying it', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Disposable archive test' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;

    const scene = await request(app)
      .post('/api/narrative/interactions')
      .send({ projectId, title: 'A world worth recovering' });
    expect(scene.status).toBe(200);

    const marker = projectArchiveTombstonePath(testDataDir, projectId);
    const realOpen = fs.openSync.bind(fs);
    let metadataExistedAtClaim = false;
    const openSpy = jest.spyOn(fs, 'openSync').mockImplementation(((target, flags, mode) => {
      if (String(target) === marker && flags === 'wx') {
        const archiveRoot = path.join(testDataDir, 'trash', 'projects');
        const archiveEntry = fs.readdirSync(archiveRoot)
          .find(entry => entry.startsWith(`${projectId}_`));
        metadataExistedAtClaim = Boolean(
          archiveEntry
          && fs.existsSync(path.join(archiveRoot, archiveEntry, 'project-metadata.json')),
        );
      }
      return realOpen(target, flags, mode);
    }) as typeof fs.openSync);

    let deleted: request.Response;
    try {
      deleted = await request(app).delete(`/api/projects/${encodeURIComponent(projectId)}`);
    } finally {
      openSpy.mockRestore();
    }
    expect(deleted.status).toBe(200);
    expect(metadataExistedAtClaim).toBe(true);
    expect(deleted.body).toMatchObject({
      success: true,
      deleted: projectId,
      recoverable: true,
    });

    const archiveDir = path.join(testDataDir, deleted.body.archive);
    expect(fs.existsSync(path.join(archiveDir, 'project-metadata.json'))).toBe(true);
    expect(fs.existsSync(path.join(archiveDir, `project_${projectId}.json`))).toBe(true);
    expect(readProjectArchiveTombstone(testDataDir, projectId)).toMatchObject({
      state: 'archived',
      journal: {
        catalog: 'removed',
        moves: expect.arrayContaining([
          expect.objectContaining({ from: `project_${projectId}.json`, status: 'moved' }),
        ]),
      },
    });

    const projects = await request(app).get('/api/projects');
    expect(projects.body.some((project: any) => project.id === projectId)).toBe(false);

    const resurrection = await request(app)
      .post('/api/narrative/interactions')
      .send({ projectId, title: 'Do not recreate an archived world' });
    expect(resurrection.status).toBe(410);
    expect(resurrection.body).toMatchObject({
      code: 'PROJECT_TOMBSTONED',
      state: 'archived',
    });
  });

  it('refuses to acknowledge an archive with no primary world blob or backup', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Missing archive source' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;

    const primary = path.join(testDataDir, `project_${projectId}.json`);
    fs.unlinkSync(primary);
    const backup = `${primary}.bak`;
    if (fs.existsSync(backup)) fs.unlinkSync(backup);

    const response = await request(app).delete(`/api/projects/${encodeURIComponent(projectId)}`);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'PROJECT_ARCHIVE_SOURCE_MISSING' });
    expect(fs.existsSync(projectArchiveTombstonePath(testDataDir, projectId))).toBe(false);

    const catalog = await request(app).get('/api/projects');
    expect(catalog.body.some((candidate: Project) => candidate.id === projectId)).toBe(true);
  });

  it.each(['symlink', 'directory', 'empty-shell'] as const)(
    'refuses to plant an archive tombstone when the only world source is a %s',
    async sourceKind => {
      const created = await request(app)
        .post('/api/projects')
        .send({ name: `Invalid archive source: ${sourceKind}` });
      expect(created.status).toBe(201);
      const projectId = created.body.id as string;
      const primary = path.join(testDataDir, `project_${projectId}.json`);
      const backup = `${primary}.bak`;
      if (fs.existsSync(primary)) fs.rmSync(primary, { force: true });
      if (fs.existsSync(backup)) fs.rmSync(backup, { force: true });

      if (sourceKind === 'symlink') {
        const target = path.join(testDataDir, `${projectId}_symlink_target.json`);
        atomicWriteJsonSync(target, createEmptyProjectData(), { backup: false });
        fs.symlinkSync(target, primary);
      } else if (sourceKind === 'directory') {
        fs.mkdirSync(primary);
      } else {
        fs.writeFileSync(primary, '{}');
      }

      const response = await request(app).delete(`/api/projects/${encodeURIComponent(projectId)}`);
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'PROJECT_ARCHIVE_SOURCE_INVALID' });
      expect(fs.existsSync(projectArchiveTombstonePath(testDataDir, projectId))).toBe(false);
      const catalog = await request(app).get('/api/projects');
      expect(catalog.body.some((candidate: Project) => candidate.id === projectId)).toBe(true);
    },
  );

  it('allows archiving a corrupt regular primary only when a valid backup remains', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Valid backup archive source' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;
    const primary = path.join(testDataDir, `project_${projectId}.json`);
    fs.writeFileSync(primary, '{}');
    atomicWriteJsonSync(`${primary}.bak`, createEmptyProjectData(), { backup: false });

    const response = await request(app).delete(`/api/projects/${encodeURIComponent(projectId)}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, recoverable: true });
    const archiveDir = path.join(testDataDir, response.body.archive);
    expect(fs.readFileSync(path.join(archiveDir, `project_${projectId}.json`), 'utf8')).toBe('{}');
    expect(JSON.parse(fs.readFileSync(path.join(archiveDir, `project_${projectId}.json.bak`), 'utf8')))
      .toMatchObject({ entities: [], relationships: [], commits: [], interactions: [] });
  });

  it('rejects a parseable empty world at the live server load seam', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Empty shell live-load boundary' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;
    const primary = path.join(testDataDir, `project_${projectId}.json`);
    fs.writeFileSync(primary, '{}');

    const response = await request(app)
      .get('/api/narrative/entities')
      .query({ projectId });
    expect(response.status).toBe(500);
    expect(response.text).toMatch(/structurally invalid/);
    expect(fs.readFileSync(primary, 'utf8')).toBe('{}');
  });

  it('refuses a catalogued project whose world and backup are both missing', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Missing world live-load boundary' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;
    const primary = path.join(testDataDir, `project_${projectId}.json`);
    fs.unlinkSync(primary);
    if (fs.existsSync(`${primary}.bak`)) fs.unlinkSync(`${primary}.bak`);

    const response = await request(app)
      .get('/api/narrative/entities')
      .query({ projectId });
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).toMatch(/World data.*missing.*recovery is required/i);
    expect(fs.existsSync(primary)).toBe(false);
  });

  it('maps fresh and abandoned cross-checkout project ownership without stealing either lock', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Durable boundary HTTP target' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;

    const fresh = acquireProjectBoundaryLock(testDataDir, projectId, 'archive');
    try {
      const response = await request(app)
        .get('/api/narrative/entities')
        .query({ projectId });
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'PROJECT_BOUNDARY_LOCKED', recoveryRequired: false });

      const put = await request(app)
        .put(`/api/projects/${encodeURIComponent(projectId)}`)
        .send({ name: 'Must not be acknowledged' });
      expect(put.status).toBe(409);
      expect(put.body).toMatchObject({ code: 'PROJECT_BOUNDARY_LOCKED' });

      const switched = await request(app)
        .post('/api/projects/switch')
        .send({ projectId });
      expect(switched.status).toBe(409);
      expect(switched.body).toMatchObject({ code: 'PROJECT_BOUNDARY_LOCKED' });
    } finally {
      fresh.release();
    }

    const unchanged = await request(app).get(`/api/projects/${encodeURIComponent(projectId)}`);
    expect(unchanged.body.name).toBe('Durable boundary HTTP target');

    const abandoned = acquireProjectBoundaryLock(testDataDir, projectId, 'archive', { now: () => 1 });
    try {
      // A dead owner's leftover lock must not black out READS: durable files
      // only ever change by atomic rename, and a genuinely torn multi-file
      // transaction announces itself through the tombstone, not through lock
      // presence.
      const response = await request(app)
        .get('/api/narrative/entities')
        .query({ projectId });
      expect(response.status).toBe(200);

      // WRITES still contend at acquire time and must refuse to steal the
      // stale owner — clearing it stays an explicit operator decision.
      const write = await request(app)
        .post('/api/narrative/documents')
        .send({ projectId, title: 'Must not be written' });
      expect(write.status).toBe(423);
      expect(write.body).toMatchObject({ code: 'PROJECT_BOUNDARY_STALE', recoveryRequired: true });
      expect(fs.existsSync(abandoned.lockDir)).toBe(true);
    } finally {
      abandoned.release();
    }
  });

  it('rolls an interrupted archive back without clobbering unrelated catalog changes', async () => {
    const targetCreated = await request(app)
      .post('/api/projects')
      .send({ name: 'Archive rollback target' });
    const bystanderCreated = await request(app)
      .post('/api/projects')
      .send({ name: 'Bystander before external edit' });
    expect(targetCreated.status).toBe(201);
    expect(bystanderCreated.status).toBe(201);
    const projectId = targetCreated.body.id as string;
    const bystanderId = bystanderCreated.body.id as string;

    seedProjectData(projectId, {
      entities: [{ id: 'rollback-witness', name: 'Rollback Witness', type: 'character' }],
    });
    const nitDir = path.join(testDataDir, 'nit');
    fs.mkdirSync(nitDir, { recursive: true });
    fs.writeFileSync(path.join(nitDir, `${projectId}.json`), JSON.stringify({ commits: [], branches: {} }));

    const realRename = fs.renameSync.bind(fs);
    let injectedExternalEdit = false;
    const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(((from: fs.PathLike, to: fs.PathLike) => {
      const fromPath = String(from);
      if (fromPath === path.join(testDataDir, `project_${projectId}.json`)) {
        const result = realRename(from, to);
        const catalogFile = path.join(testDataDir, 'projects.json');
        const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8')) as Project[];
        const bystander = catalog.find(candidate => candidate.id === bystanderId)!;
        bystander.name = 'Bystander edited by another checkout';
        fs.writeFileSync(catalogFile, JSON.stringify(catalog, null, 2));
        injectedExternalEdit = true;
        return result;
      }
      if (fromPath === path.join(nitDir, `${projectId}.json`)) {
        throw new Error('injected archive interruption');
      }
      return realRename(from, to);
    }) as typeof fs.renameSync);

    let response: any;
    try {
      response = await request(app).delete(`/api/projects/${encodeURIComponent(projectId)}`);
    } finally {
      renameSpy.mockRestore();
    }

    expect(injectedExternalEdit).toBe(true);
    expect(response!.status).toBe(500);
    expect(fs.existsSync(path.join(testDataDir, `project_${projectId}.json`))).toBe(true);
    expect(fs.existsSync(projectArchiveTombstonePath(testDataDir, projectId))).toBe(false);

    const catalog = await request(app).get('/api/projects');
    expect(catalog.body.find((candidate: Project) => candidate.id === projectId)).toBeTruthy();
    expect(catalog.body.find((candidate: Project) => candidate.id === bystanderId)?.name)
      .toBe('Bystander edited by another checkout');
  });

  it('keeps a recovery tombstone when archive rollback cannot restore every moved file', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Archive recovery-required test' });
    const bystanderCreated = await request(app)
      .post('/api/projects')
      .send({ name: 'Recovery bystander before external edit' });
    expect(created.status).toBe(201);
    expect(bystanderCreated.status).toBe(201);
    const projectId = created.body.id as string;
    const bystanderId = bystanderCreated.body.id as string;

    seedProjectData(projectId, {
      entities: [{ id: 'recovery-witness', name: 'Recovery Witness', type: 'character' }],
    });
    const nitDir = path.join(testDataDir, 'nit');
    fs.mkdirSync(nitDir, { recursive: true });
    fs.writeFileSync(path.join(nitDir, `${projectId}.json`), JSON.stringify({ commits: [], branches: {} }));

    const realRename = fs.renameSync.bind(fs);
    let injectedExternalEdit = false;
    const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(((from: fs.PathLike, to: fs.PathLike) => {
      const fromPath = String(from);
      const toPath = String(to);
      if (fromPath === path.join(testDataDir, `project_${projectId}.json`)) {
        const result = realRename(from, to);
        const catalogFile = path.join(testDataDir, 'projects.json');
        const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8')) as Project[];
        const bystander = catalog.find(candidate => candidate.id === bystanderId)!;
        bystander.name = 'Recovery bystander edited by another checkout';
        fs.writeFileSync(catalogFile, JSON.stringify(catalog, null, 2));
        injectedExternalEdit = true;
        return result;
      }
      if (fromPath === path.join(nitDir, `${projectId}.json`)) {
        throw new Error('injected archive move failure');
      }
      if (
        fromPath.includes(`${path.sep}trash${path.sep}projects${path.sep}`)
        && fromPath.endsWith(`${path.sep}project_${projectId}.json`)
        && toPath === path.join(testDataDir, `project_${projectId}.json`)
      ) {
        throw new Error('injected rollback failure');
      }
      return realRename(from, to);
    }) as typeof fs.renameSync);

    let response: request.Response;
    try {
      response = await request(app).delete(`/api/projects/${encodeURIComponent(projectId)}`);
    } finally {
      renameSpy.mockRestore();
    }

    expect(response!.status).toBe(423);
    expect(injectedExternalEdit).toBe(true);
    expect(response!.body).toMatchObject({ recoveryRequired: true });
    expect(readProjectArchiveTombstone(testDataDir, projectId)).toMatchObject({
      state: 'recovery-required',
      journal: {
        moves: expect.arrayContaining([
          expect.objectContaining({ from: `project_${projectId}.json`, status: 'moved' }),
        ]),
      },
    });
    expect(fs.existsSync(projectArchiveTombstonePath(testDataDir, projectId))).toBe(true);

    const mutation = await request(app)
      .post('/api/narrative/interactions')
      .send({ projectId, title: 'The tombstone must hold' });
    expect(mutation.status).toBe(410);

    const visibleCatalog = await request(app).get('/api/projects');
    expect(visibleCatalog.body.some((candidate: Project) => candidate.id === projectId)).toBe(false);
    expect(visibleCatalog.body.find((candidate: Project) => candidate.id === bystanderId)?.name)
      .toBe('Recovery bystander edited by another checkout');
  });

  it('refreshes external catalog rows and preserves them across a targeted project update', async () => {
    const targetCreated = await request(app)
      .post('/api/projects')
      .send({ name: 'Target before local update' });
    const bystanderCreated = await request(app)
      .post('/api/projects')
      .send({ name: 'Bystander before external update' });
    expect(targetCreated.status).toBe(201);
    expect(bystanderCreated.status).toBe(201);

    const targetId = targetCreated.body.id as string;
    const bystanderId = bystanderCreated.body.id as string;
    const externalId = 'project_external_catalog_probe';
    const catalogFile = path.join(testDataDir, 'projects.json');
    const externallyEdited = JSON.parse(fs.readFileSync(catalogFile, 'utf8')) as Project[];
    externallyEdited.find(candidate => candidate.id === bystanderId)!.name = 'Bystander edited externally';
    externallyEdited.push({
      id: externalId,
      name: 'External checkout world',
      description: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isActive: false,
      stats: { entities: 0, relationships: 0, commits: 0, branches: 1 },
      color: '#123456',
    });
    fs.writeFileSync(catalogFile, JSON.stringify(externallyEdited, null, 2));

    const refreshed = await request(app).get('/api/projects');
    expect(refreshed.body.find((candidate: Project) => candidate.id === bystanderId)?.name)
      .toBe('Bystander edited externally');
    expect(refreshed.body.some((candidate: Project) => candidate.id === externalId)).toBe(true);

    const updated = await request(app)
      .put(`/api/projects/${encodeURIComponent(targetId)}`)
      .send({ name: 'Target updated locally' });
    expect(updated.status).toBe(200);

    const durable = JSON.parse(fs.readFileSync(catalogFile, 'utf8')) as Project[];
    expect(durable.find(candidate => candidate.id === targetId)?.name).toBe('Target updated locally');
    expect(durable.find(candidate => candidate.id === bystanderId)?.name).toBe('Bystander edited externally');
    expect(durable.some(candidate => candidate.id === externalId)).toBe(true);
  });

  it('serializes archive ownership and rejects concurrent DELETE and PUT mutations', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Archive race original' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;

    const scene = await request(app)
      .post('/api/narrative/interactions')
      .send({ projectId, title: 'The blob that must move exactly once' });
    expect(scene.status).toBe(200);

    let releaseBlockedWrite!: () => void;
    const blockedWrite = new Promise<void>((resolve) => {
      releaseBlockedWrite = resolve;
    });
    const queuedWrite = enqueueSerializedWrite(
      `projectData:${projectId}`,
      async () => blockedWrite,
    );

    const firstDelete = request(app)
      .delete(`/api/projects/${encodeURIComponent(projectId)}`)
      .then((response) => response);

    let observedArchiveLock = false;
    let secondDelete: { status: number; body: any } | undefined;
    let concurrentPut: { status: number; body: any } | undefined;
    try {
      // The held write keeps DELETE parked after it claims the tombstone. Probe
      // read-only middleware until that state is visible, avoiding a timing-
      // based test that merely hopes the first request won the race.
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const probe = await request(app)
          .get('/api/narrative/entities')
          .query({ projectId });
        if (probe.status === 409) {
          observedArchiveLock = true;
          break;
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
      }

      [secondDelete, concurrentPut] = await Promise.all([
        request(app).delete(`/api/projects/${encodeURIComponent(projectId)}`),
        // Deliberately omit body.projectId: this exercises the exact
        // /api/projects/:id mutation guard, not the generic query/body guard.
        request(app)
          .put(`/api/projects/${encodeURIComponent(projectId)}`)
          .send({ name: 'A write that must not be acknowledged' }),
      ]);
    } finally {
      releaseBlockedWrite();
    }

    await queuedWrite;
    const archived = await firstDelete;

    expect(observedArchiveLock).toBe(true);
    expect(secondDelete?.status).toBe(409);
    expect(secondDelete?.body).toEqual({ error: 'Project is being archived' });
    expect(concurrentPut?.status).toBe(409);
    expect(concurrentPut?.body).toEqual({ error: 'Project is being archived' });
    expect(archived.status).toBe(200);

    const archiveRoot = path.join(testDataDir, 'trash', 'projects');
    const matchingArchives = fs.readdirSync(archiveRoot)
      .filter((entry) => entry.startsWith(`${projectId}_`));
    expect(matchingArchives).toHaveLength(1);

    const archiveDir = path.join(archiveRoot, matchingArchives[0]);
    const metadata = JSON.parse(fs.readFileSync(path.join(archiveDir, 'project-metadata.json'), 'utf8'));
    expect(metadata.name).toBe('Archive race original');
    expect(fs.existsSync(path.join(archiveDir, `project_${projectId}.json`))).toBe(true);
  });

  it('exports one explicit world losslessly without changing the active project', async () => {
    const activeCreated = await request(app)
      .post('/api/projects')
      .send({ name: 'World that stays active' });
    const exportedCreated = await request(app)
      .post('/api/projects')
      .send({ name: 'Moon / "Cairn"\r\nHeader bait', description: 'The world under export' });
    expect(activeCreated.status).toBe(201);
    expect(exportedCreated.status).toBe(201);
    const activeProjectId = activeCreated.body.id as string;
    const exportedProjectId = exportedCreated.body.id as string;

    const switched = await request(app)
      .post('/api/projects/switch')
      .send({ projectId: activeProjectId });
    expect(switched.status).toBe(200);

    seedProjectData(exportedProjectId, {
      entities: [{ id: 'keeper', name: 'Keeper', type: 'character' }],
      assets: [{
        id: 'external-image',
        name: 'Referenced image',
        url: '/api/narrative/visual/images/keeper.png',
        type: 'image',
      }],
      // This is deliberately foreign to the current ProjectData type. The
      // export must preserve future/extension fields rather than whitelist
      // only what this server release understands.
      futureSubsystem: {
        schemaVersion: 7,
        nested: { signal: ['scrap', 'spark'] },
      },
    } as any);

    const nitDir = path.join(testDataDir, 'nit');
    fs.mkdirSync(nitDir, { recursive: true });
    const fixtureTimestamp = '2026-08-01T00:00:00.000Z';
    const keeper = {
      id: 'keeper',
      name: 'Keeper',
      type: 'character' as const,
      createdAt: fixtureTimestamp,
      updatedAt: fixtureTimestamp,
    };
    const firstSnapshot = {
      formatVersion: '1.1.0',
      metadata: {
        id: exportedProjectId,
        title: 'Export ledger fixture',
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp,
      },
      entities: [keeper],
      relationships: [],
      scenes: [],
    };
    const firstCommitBase = {
      parentHashes: [] as string[],
      author: { kind: 'system' as const, name: 'Export test' },
      timestamp: 1,
      message: 'Initial export fixture',
      branch: 'main',
      operations: [{ type: 'ADD_ENTITY' as const, payload: keeper }],
      workingTreeHash: workingTreeHash(firstSnapshot),
    };
    const firstCommit = { ...firstCommitBase, hash: commitContentHash(firstCommitBase) };
    const nitLedger = {
      commits: [firstCommit],
      branches: { main: { headHash: firstCommit.hash, lastSnapshot: firstSnapshot } },
      futureLedgerField: { preserveMe: true },
    };
    fs.writeFileSync(
      path.join(nitDir, `${exportedProjectId}.json`),
      JSON.stringify(nitLedger),
    );

    const worldFile = path.join(testDataDir, `project_${exportedProjectId}.json`);
    const linkedWorld = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
    linkedWorld.commits = [{
      id: 'world-export-1',
      branch: 'main',
      nitHash: firstCommit.hash,
    }];
    atomicWriteJsonSync(worldFile, linkedWorld);
    const nitFile = path.join(nitDir, `${exportedProjectId}.json`);
    const realReadFile = fs.readFileSync.bind(fs);
    const snapshotOwners: string[] = [];
    const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, options?: any) => {
      const candidate = typeof file === 'string' ? path.resolve(file) : '';
      if (candidate === path.resolve(worldFile) || candidate === path.resolve(nitFile)) {
        const inspection = inspectProjectBoundaryLock(testDataDir, exportedProjectId);
        if (inspection.owner?.operationId) snapshotOwners.push(inspection.owner.operationId);
      }
      return realReadFile(file, options);
    }) as typeof fs.readFileSync);
    let response: request.Response;
    try {
      response = await request(app)
        .get(`/api/projects/${encodeURIComponent(exportedProjectId)}/export`);
    } finally {
      readSpy.mockRestore();
    }
    expect(new Set(snapshotOwners).size).toBe(1);
    expect(snapshotOwners.length).toBeGreaterThanOrEqual(2);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['access-control-expose-headers']).toBe('Content-Disposition');
    expect(response.headers['content-disposition']).toMatch(
      new RegExp(`^attachment; filename="[a-zA-Z0-9._-]+--${exportedProjectId}\\.narrative-world\\.v1\\.json"$`),
    );
    expect(response.headers['content-disposition']).not.toMatch(/[\r\n]/);

    expect(response.body).toMatchObject({
      format: 'narrative-studio/world-data',
      formatVersion: '1.0.0',
      projectId: exportedProjectId,
      project: {
        id: exportedProjectId,
        name: 'Moon / "Cairn"\r\nHeader bait',
        description: 'The world under export',
      },
      projectData: {
        futureSubsystem: {
          schemaVersion: 7,
          nested: { signal: ['scrap', 'spark'] },
        },
      },
      canon: {
        nitLedgerStatus: 'included',
        nitLedger,
      },
      files: {
        mode: 'references-only',
        mediaBinariesIncluded: false,
        referencesPreservedVerbatim: true,
        inlineDataUrlsRemainEmbedded: true,
      },
    });
    expect(response.body.projectData.assets[0].url).toBe('/api/narrative/visual/images/keeper.png');

    const witness = {
      id: 'witness',
      name: 'Witness',
      type: 'character' as const,
      createdAt: fixtureTimestamp,
      updatedAt: fixtureTimestamp,
    };
    const secondSnapshot = { ...firstSnapshot, entities: [...firstSnapshot.entities, witness] };
    const secondCommitBase = {
      parentHashes: [firstCommit.hash],
      author: { kind: 'system' as const, name: 'Export test' },
      timestamp: 2,
      message: 'External export fixture advance',
      branch: 'main',
      operations: [{ type: 'ADD_ENTITY' as const, payload: witness }],
      workingTreeHash: workingTreeHash(secondSnapshot),
    };
    const secondCommit = { ...secondCommitBase, hash: commitContentHash(secondCommitBase) };
    const externallyAdvancedLedger = {
      ...nitLedger,
      commits: [...nitLedger.commits, secondCommit],
      branches: { main: { headHash: secondCommit.hash, lastSnapshot: secondSnapshot } },
      futureLedgerField: { preserveMe: true, externalRevision: 2 },
    };
    atomicWriteJsonSync(path.join(nitDir, `${exportedProjectId}.json`), externallyAdvancedLedger);
    const externallyAdvancedWorld = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
    externallyAdvancedWorld.commits.push({
      id: 'world-export-2',
      branch: 'main',
      nitHash: secondCommit.hash,
    });
    atomicWriteJsonSync(worldFile, externallyAdvancedWorld);
    const refreshedExport = await request(app)
      .get(`/api/projects/${encodeURIComponent(exportedProjectId)}/export`);
    expect(refreshedExport.status).toBe(200);
    expect(refreshedExport.body.canon.nitLedger).toEqual(externallyAdvancedLedger);

    const projectsAfter = await request(app).get('/api/projects');
    expect(projectsAfter.body.find((project: any) => project.isActive)?.id).toBe(activeProjectId);
    expect(projectsAfter.body.find((project: any) => project.id === exportedProjectId)?.isActive).toBe(false);
  });

  it('refuses a partial world export when an existing canon ledger is unreadable', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Corrupt canon export test' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;

    const nitDir = path.join(testDataDir, 'nit');
    fs.mkdirSync(nitDir, { recursive: true });
    fs.writeFileSync(path.join(nitDir, `${projectId}.json`), '{ definitely-not-json');

    const response = await request(app)
      .get(`/api/projects/${encodeURIComponent(projectId)}/export`);

    expect(response.status).toBe(500);
    expect(response.headers['content-disposition']).toBeUndefined();
    expect(response.body.error).toMatch(/Nit ledger exists but is unreadable; refusing a partial export/);
  });

  it('does not invent new canon history when the world references a missing nit ledger', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Missing canon sidecar boundary' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;
    const worldFile = path.join(testDataDir, `project_${projectId}.json`);
    const nitFile = path.join(testDataDir, 'nit', `${projectId}.json`);
    const world = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
    world.commits = [{ id: 'world-commit', nitHash: 'a'.repeat(64) }];
    atomicWriteJsonSync(worldFile, world);
    if (fs.existsSync(nitFile)) fs.unlinkSync(nitFile);
    if (fs.existsSync(`${nitFile}.bak`)) fs.unlinkSync(`${nitFile}.bak`);

    const exported = await request(app)
      .get(`/api/projects/${encodeURIComponent(projectId)}/export`);
    expect(exported.status).toBe(500);
    expect(exported.body.error).toMatch(/World\/canon pair is inconsistent|nit ledger is absent/i);

    const scene = await request(app)
      .post('/api/narrative/interactions')
      .send({ projectId, title: 'Mutation must not mint replacement canon' });
    expect(scene.status).toBe(200);
    const committed = await request(app)
      .post('/api/narrative/commit')
      .send({ projectId, message: 'Must fail against missing canon history' });
    expect(committed.status).toBe(500);
    expect(JSON.stringify(committed.body)).toMatch(/Nit ledger is missing.*recovery is required/i);
    expect(fs.existsSync(nitFile)).toBe(false);
  });

  it('invalidates a cached world when another checkout publishes a new atomic revision', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Cross-checkout world refresh' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;

    const firstRead = await request(app)
      .get('/api/narrative/entities')
      .query({ projectId });
    expect(firstRead.status).toBe(200);
    expect(firstRead.body).toEqual([]);

    const worldFile = path.join(testDataDir, `project_${projectId}.json`);
    const externalWorld = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
    externalWorld.entities = [{ id: 'external-entity', name: 'External Entity', type: 'character' }];
    externalWorld.futureCheckoutField = { keep: 'this revision' };
    atomicWriteJsonSync(worldFile, externalWorld);

    const refreshed = await request(app)
      .get('/api/narrative/entities')
      .query({ projectId });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.map((entity: any) => entity.id)).toEqual(['external-entity']);

    const appended = await request(app)
      .post('/api/narrative/interactions')
      .send({ projectId, title: 'Built on the external revision' });
    expect(appended.status).toBe(200);
    const durable = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
    expect(durable.entities.map((entity: any) => entity.id)).toEqual(['external-entity']);
    expect(durable.futureCheckoutField).toEqual({ keep: 'this revision' });
  });

  it('observes an external catalog style pin inside the current request', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Cross-checkout style guard refresh' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;
    const worldFile = path.join(testDataDir, `project_${projectId}.json`);
    const catalogFile = path.join(testDataDir, 'projects.json');
    const externalCatalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
    externalCatalog.forEach((candidate: any) => {
      if (candidate.id !== projectId) return;
      candidate.styleProfile = {
        ...(candidate.styleProfile || {}),
        visualPrompt: 'Externally published ink-and-copper style',
        styleAssetIds: ['external-style-pin'],
        updatedAt: Date.now(),
      };
    });

    const realStat = fs.statSync.bind(fs);
    let injected = false;
    const statSpy = jest.spyOn(fs, 'statSync').mockImplementation(((target: fs.PathLike, options?: any) => {
      if (!injected && path.resolve(String(target)) === path.resolve(worldFile)) {
        // Request middleware has already accepted the old catalog revision;
        // publish the pin before the route's style guard reads the catalog.
        atomicWriteJsonSync(catalogFile, externalCatalog);
        injected = true;
      }
      return realStat(target, options);
    }) as typeof fs.statSync);

    let response: request.Response;
    try {
      response = await request(app)
        .post('/api/narrative/visual/produce-scene')
        .send({ projectId, sceneId: 'missing-scene' });
    } finally {
      statSpy.mockRestore();
    }

    expect(injected).toBe(true);
    // A stale catalog read returns 412 "No style reference pinned" here.
    // Freshness lets the request pass the style guard and reach scene lookup.
    expect(response!.status).toBe(404);
    expect(response!.body.error).toBe('Scene not found: missing-scene');
  });

  it('rebuilds a stale world session when an external world revision advances', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Cross-checkout session refresh' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;
    const worldFile = path.join(testDataDir, `project_${projectId}.json`);

    expect((await request(app)
      .post('/api/narrative/branch')
      .send({ projectId, name: 'branch-a' })).status).toBe(200);
    expect((await request(app)
      .post('/api/narrative/interactions')
      .send({ projectId, title: 'Local pending scene' })).status).toBe(200);

    const externalWorld = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
    externalWorld.interactions = [];
    externalWorld.branches = [
      ...externalWorld.branches.map((candidate: any) => ({ ...candidate, isActive: false })),
      {
        id: 'branch-b',
        name: 'branch-b',
        description: 'Published by another checkout',
        isActive: true,
        isCanon: false,
        commitCount: 0,
        createdAt: new Date().toISOString(),
        parentBranch: 'main',
      },
    ];
    externalWorld.futureCheckoutField = { branchOwner: 'branch-b' };
    atomicWriteJsonSync(worldFile, externalWorld);

    // Commit asks for its session before it loads ProjectData. It therefore
    // proves the central session accessor itself notices revision B, rather
    // than relying on a status read to clear revision A first.
    const mutation = await request(app)
      .post('/api/narrative/commit')
      .send({ projectId, message: 'Checkpoint on the externally active branch' });
    expect(mutation.status).toBe(200);
    expect(mutation.body.commit.branch).toBe('branch-b');

    const status = await request(app)
      .get('/api/narrative/session/status')
      .query({ projectId });
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({
      currentBranch: 'branch-b',
      uncommittedChanges: false,
      pendingChanges: { summary: { total: 0 } },
      worldState: { sceneCount: 0 },
    });
  });

  it('returns a reload conflict instead of acknowledging an in-flight stale scene save', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Cross-checkout write conflict' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;
    const worldFile = path.join(testDataDir, `project_${projectId}.json`);
    const now = new Date().toISOString();
    seedProjectData(projectId, {
      interactions: [{
        id: 'scene-write-conflict',
        title: 'Original scene title',
        prose: '',
        description: '',
        status: 'draft',
        participantIds: [],
        events: [],
        stateChanges: [],
        frames: [],
        position: 0,
        createdAt: now,
        updatedAt: now,
      }],
    });
    const externallyPublished = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
    externallyPublished.futureCheckoutField = { winner: 'external revision' };

    const realStat = fs.statSync.bind(fs);
    let worldStatCount = 0;
    let injected = false;
    const statSpy = jest.spyOn(fs, 'statSync').mockImplementation(((target: fs.PathLike, options?: any) => {
      if (path.resolve(String(target)) === path.resolve(worldFile)) {
        worldStatCount += 1;
        // First load brackets the file with three stats; session hydration
        // validates the cache with one more. The fifth is save-time CAS.
        if (worldStatCount === 5) {
          atomicWriteJsonSync(worldFile, externallyPublished);
          injected = true;
        }
      }
      return realStat(target, options);
    }) as typeof fs.statSync);

    let response: request.Response;
    try {
      response = await request(app)
        .put('/api/narrative/interactions/scene-write-conflict')
        .send({ projectId, title: 'Stale title that must not land' });
    } finally {
      statSpy.mockRestore();
    }

    expect(injected).toBe(true);
    expect(response!.status).toBe(409);
    expect(response!.body).toMatchObject({
      code: 'PROJECT_WRITE_CONFLICT',
      reloadRequired: true,
    });
    const durable = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
    expect(durable.interactions[0].title).toBe('Original scene title');
    expect(durable.futureCheckoutField).toEqual({ winner: 'external revision' });
  });

  it('maps a stale scene create to 409 and discards its phantom session state', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Cross-checkout session conflict' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;
    const worldFile = path.join(testDataDir, `project_${projectId}.json`);

    // Give the process-local session a branch that an external checkout will
    // supersede. The refused scene request below also adds a pending scene id
    // before its save reaches CAS, exercising both kinds of phantom state.
    const branch = await request(app)
      .post('/api/narrative/branch')
      .send({ projectId, name: 'local-phantom-branch' });
    expect(branch.status).toBe(200);

    const externallyPublished = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
    externallyPublished.futureCheckoutField = { winner: 'external revision' };
    externallyPublished.branches = externallyPublished.branches.map((candidate: any) => ({
      ...candidate,
      isActive: candidate.name === 'main',
    }));

    const realStat = fs.statSync.bind(fs);
    let worldStatCount = 0;
    let injected = false;
    const statSpy = jest.spyOn(fs, 'statSync').mockImplementation(((target: fs.PathLike, options?: any) => {
      if (path.resolve(String(target)) === path.resolve(worldFile)) {
        worldStatCount += 1;
        // The first stat validates the cached request snapshot. The second is
        // save-time CAS, after the handler has mutated its session and fork.
        if (worldStatCount === 2) {
          atomicWriteJsonSync(worldFile, externallyPublished);
          injected = true;
        }
      }
      return realStat(target, options);
    }) as typeof fs.statSync);

    let response: request.Response;
    try {
      response = await request(app)
        .post('/api/narrative/interactions')
        .send({ projectId, title: 'Scene that must remain a phantom' });
    } finally {
      statSpy.mockRestore();
    }

    expect(injected).toBe(true);
    expect(response!.status).toBe(409);
    expect(response!.body).toMatchObject({
      code: 'PROJECT_WRITE_CONFLICT',
      reloadRequired: true,
    });

    const durable = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
    expect(durable.interactions).toEqual([]);
    expect(durable.futureCheckoutField).toEqual({ winner: 'external revision' });

    const status = await request(app)
      .get('/api/narrative/session/status')
      .query({ projectId });
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({
      currentBranch: 'main',
      uncommittedChanges: false,
      pendingChanges: { summary: { total: 0 } },
    });

    const preview = await request(app)
      .get('/api/narrative/commit/preview')
      .query({ projectId });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      currentBranch: 'main',
      uncommittedChanges: false,
      pendingChanges: { summary: { total: 0 } },
      suggestedMessage: 'No pending changes',
    });
  });

  it('scopes relationship, interaction, chat, proposal, and session reads to projectId', async () => {
    const [createdA, createdB] = await Promise.all([
      request(app).post('/api/projects').send({ name: 'Scoped reads A' }),
      request(app).post('/api/projects').send({ name: 'Scoped reads B' }),
    ]);
    expect(createdA.status).toBe(201);
    expect(createdB.status).toBe(201);
    const projectA = createdA.body.id as string;
    const projectB = createdB.body.id as string;
    const now = new Date().toISOString();

    const historyFor = (marker: string) => ({
      messages: [{ role: 'assistant', content: `history-${marker}`, timestamp: marker === 'a' ? 1 : 2 }],
      worldContext: { themes: [marker], tone: `tone-${marker}`, influences: [] },
      currentFocus: [`focus-${marker}`],
      userDecisions: [{ changeId: `decision-${marker}`, decision: 'accepted', timestamp: 1 }],
      pendingProposals: [{
        id: `proposal-${marker}`,
        type: 'add_entity',
        status: 'pending',
        entity: { id: `entity-proposed-${marker}`, name: `Proposed ${marker}` },
      }],
      lastUpdated: 1,
    });
    const sceneFor = (marker: string) => ({
      id: `scene-${marker}`,
      title: `Scene ${marker.toUpperCase()}`,
      prose: '',
      description: '',
      status: 'draft',
      participantIds: [],
      events: [],
      stateChanges: [],
      frames: [],
      position: 0,
      createdAt: now,
      updatedAt: now,
    });

    seedProjectData(projectA, {
      entities: [{ id: 'entity-a', name: 'Entity A', type: 'character' }],
      relationships: [{ id: 'relationship-a', source: 'entity-a', target: 'entity-a', type: 'echo' }],
      commits: [{ id: 'commit-a', hash: 'hash-a-123', message: 'Commit A', branch: 'branch-a', timestamp: 1 }],
      branches: [{ id: 'branch-a', name: 'branch-a', isActive: true }],
      interactions: [sceneFor('a')],
      conversationHistory: historyFor('a'),
    });
    seedProjectData(projectB, {
      entities: [
        { id: 'entity-b-1', name: 'Entity B1', type: 'character' },
        { id: 'entity-b-2', name: 'Entity B2', type: 'character' },
      ],
      relationships: [{ id: 'relationship-b', source: 'entity-b-1', target: 'entity-b-2', type: 'pair' }],
      commits: [{ id: 'commit-b', hash: 'hash-b-123', message: 'Commit B', branch: 'branch-b', timestamp: 2 }],
      branches: [{ id: 'branch-b', name: 'branch-b', isActive: true }],
      interactions: [sceneFor('b')],
      conversationHistory: historyFor('b'),
    });

    const [relationshipsA, relationshipsB] = await Promise.all([
      request(app).get('/api/narrative/relationships').query({ projectId: projectA }),
      request(app).get('/api/narrative/relationships').query({ projectId: projectB }),
    ]);
    expect(relationshipsA.body.map((relationship: any) => relationship.id)).toEqual(['relationship-a']);
    expect(relationshipsB.body.map((relationship: any) => relationship.id)).toEqual(['relationship-b']);

    const interactionA = await request(app)
      .get('/api/narrative/interactions/scene-a')
      .query({ projectId: projectA });
    const interactionFromWrongProject = await request(app)
      .get('/api/narrative/interactions/scene-a')
      .query({ projectId: projectB });
    expect(interactionA.status).toBe(200);
    expect(interactionA.body.title).toBe('Scene A');
    expect(interactionFromWrongProject.status).toBe(404);

    const [entityA, entityFromWrongProject, entityDetailA, entityDetailFromWrongProject] = await Promise.all([
      request(app).get('/api/narrative/entities/entity-a').query({ projectId: projectA }),
      request(app).get('/api/narrative/entities/entity-a').query({ projectId: projectB }),
      request(app).get('/api/narrative/entities/entity-a/detail').query({ projectId: projectA }),
      request(app).get('/api/narrative/entities/entity-a/detail').query({ projectId: projectB }),
    ]);
    expect(entityA.status).toBe(200);
    expect(entityA.body.name).toBe('Entity A');
    expect(entityFromWrongProject.status).toBe(404);
    expect(entityDetailA.status).toBe(200);
    expect(entityDetailA.body.entity.name).toBe('Entity A');
    expect(entityDetailFromWrongProject.status).toBe(404);

    const [historyA, historyB, proposalsA, proposalsB, statusA, statusB, graphA] = await Promise.all([
      request(app).get('/api/narrative/chat/history').query({ projectId: projectA }),
      request(app).get('/api/narrative/chat/history').query({ projectId: projectB }),
      request(app).get('/api/narrative/proposals').query({ projectId: projectA }),
      request(app).get('/api/narrative/proposals').query({ projectId: projectB }),
      request(app).get('/api/narrative/session/status').query({ projectId: projectA }),
      request(app).get('/api/narrative/session/status').query({ projectId: projectB }),
      request(app).get('/api/narrative/graph').query({ projectId: projectA }),
    ]);
    expect(historyA.body.messages[0].content).toBe('history-a');
    expect(historyB.body.messages[0].content).toBe('history-b');
    expect(proposalsA.body.proposals[0].id).toBe('proposal-a');
    expect(proposalsB.body.proposals[0].id).toBe('proposal-b');
    expect(statusA.body.worldState.entityCount).toBe(1);
    expect(statusB.body.worldState.entityCount).toBe(2);
    expect(graphA.body.nodes.map((node: any) => node.id)).toEqual(['entity-a']);

    const [legacyStatusA, legacyStatusB, gitLogA, gitCommitsB, gitCommitA, wrongGitCommit, gitHashA, wrongGitHash, branchesA] = await Promise.all([
      request(app).get('/api/narrative/status').query({ projectId: projectA }),
      request(app).get('/api/narrative/status').query({ projectId: projectB }),
      request(app).get('/api/narrative/git/log').query({ projectId: projectA }),
      request(app).get('/api/narrative/git/commits').query({ projectId: projectB }),
      request(app).get('/api/narrative/git/commit/commit-a').query({ projectId: projectA }),
      request(app).get('/api/narrative/git/commit/commit-a').query({ projectId: projectB }),
      request(app).get('/api/narrative/git/commits/hash-a').query({ projectId: projectA }),
      request(app).get('/api/narrative/git/commits/hash-a').query({ projectId: projectB }),
      request(app).get('/api/narrative/git/branches').query({ projectId: projectA }),
    ]);
    expect(legacyStatusA.body.entities).toBe(1);
    expect(legacyStatusB.body.entities).toBe(2);
    expect(gitLogA.body[0].id).toBe('commit-a');
    expect(gitCommitsB.body[0].id).toBe('commit-b');
    expect(gitCommitA.body.commit.id).toBe('commit-a');
    expect(wrongGitCommit.status).toBe(404);
    expect(gitHashA.body.id).toBe('commit-a');
    expect(wrongGitHash.status).toBe(404);
    expect(branchesA.body[0].id).toBe('branch-a');
  });

  it('returns the requested production timeline together with branch history', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Timeline scope test' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;
    const now = new Date().toISOString();

    seedProjectData(projectId, {
      commits: [{
        id: 'commit-alt',
        message: 'The branch remembers',
        branch: 'main',
        timestamp: 42,
        createdAt: now,
        entityCount: 0,
        relationshipCount: 0,
      }],
      timeline: {
        tracks: [{ id: 'track-default', name: 'Default cut', kind: 'video', order: 0 }],
        items: [],
      },
      productions: [
        { id: 'prod_default', title: 'Main production', format: 'film', createdAt: now },
        {
          id: 'prod-alt',
          title: 'Alternate cut',
          format: 'film',
          createdAt: now,
          timeline: {
            tracks: [{ id: 'track-alt', name: 'Alternate cut', kind: 'video', order: 0 }],
            items: [],
          },
        },
      ],
      activeProductionId: 'prod_default',
    });

    const defaultTimeline = await request(app)
      .get('/api/narrative/timeline')
      .query({ projectId });
    const alternateTimeline = await request(app)
      .get('/api/narrative/timeline')
      .query({ projectId, productionId: 'prod-alt' });

    expect(defaultTimeline.status).toBe(200);
    expect(defaultTimeline.body.timeline.tracks[0].id).toBe('track-default');
    expect(alternateTimeline.status).toBe(200);
    expect(alternateTimeline.body.timeline.tracks[0].id).toBe('track-alt');
    expect(alternateTimeline.body).toMatchObject({
      currentBranch: 'main',
      uncommittedChanges: false,
      pendingChanges: {
        addedCount: 0,
        modifiedCount: 0,
        relationshipsCount: 0,
        scenesAddedCount: 0,
        scenesModifiedCount: 0,
      },
    });
    expect(alternateTimeline.body.branches[0].isCurrent).toBe(true);
    expect(alternateTimeline.body.commits[0]).toMatchObject({
      id: 'commit-alt',
      message: 'The branch remembers',
    });
  });

  it('rolls the canon ledger back when the paired world-blob publication fails', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Paired canon publication' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;
    const worldFile = path.join(testDataDir, `project_${projectId}.json`);
    const nitFile = path.join(testDataDir, 'nit', `${projectId}.json`);

    expect((await request(app)
      .post('/api/narrative/interactions')
      .send({ projectId, title: 'First committed scene' })).status).toBe(200);
    expect((await request(app)
      .post('/api/narrative/commit')
      .send({ projectId, message: 'First stable commit' })).status).toBe(200);
    expect((await request(app)
      .put('/api/narrative/interactions/' + encodeURIComponent(
        JSON.parse(fs.readFileSync(worldFile, 'utf8')).interactions[0].id,
      ))
      .send({ projectId, title: 'Scene change before failed commit' })).status).toBe(200);

    const worldBefore = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
    const nitBefore = JSON.parse(fs.readFileSync(nitFile, 'utf8'));
    const realRename = fs.renameSync.bind(fs);
    let injected = false;
    const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(((from: fs.PathLike, to: fs.PathLike) => {
      if (!injected && String(to) === worldFile && String(from).startsWith(`${worldFile}.tmp-`)) {
        injected = true;
        throw new Error('injected paired world publication failure');
      }
      return realRename(from, to);
    }) as typeof fs.renameSync);

    let failed: request.Response;
    try {
      failed = await request(app)
        .post('/api/narrative/commit')
        .send({ projectId, message: 'Commit that must not split the pair' });
    } finally {
      renameSpy.mockRestore();
    }

    expect(injected).toBe(true);
    expect(failed!.status).toBe(500);
    expect(failed!.body.error).toContain('injected paired world publication failure');
    expect(JSON.parse(fs.readFileSync(nitFile, 'utf8'))).toEqual(nitBefore);
    expect(JSON.parse(fs.readFileSync(worldFile, 'utf8'))).toEqual(worldBefore);

    const reloaded = await request(app)
      .get('/api/narrative/git/commits')
      .query({ projectId });
    expect(reloaded.body.map((commit: any) => commit.message)).not.toContain(
      'Commit that must not split the pair',
    );

    let injectedAfterRename = false;
    const postRenameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(((from: fs.PathLike, to: fs.PathLike) => {
      if (!injectedAfterRename && String(to) === worldFile && String(from).startsWith(`${worldFile}.tmp-`)) {
        realRename(from, to);
        injectedAfterRename = true;
        throw new Error('injected error after the world rename landed');
      }
      return realRename(from, to);
    }) as typeof fs.renameSync);
    let landed: request.Response;
    try {
      landed = await request(app)
        .post('/api/narrative/commit')
        .send({ projectId, message: 'Rename landed despite the thrown syscall wrapper' });
    } finally {
      postRenameSpy.mockRestore();
    }
    expect(injectedAfterRename).toBe(true);
    expect(landed!.status).toBe(200);
    const landedWorld = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
    const landedCommit = landedWorld.commits.at(-1);
    const landedNit = JSON.parse(fs.readFileSync(nitFile, 'utf8'));
    expect(landedCommit.message).toBe('Rename landed despite the thrown syscall wrapper');
    expect(landedNit.commits.some((commit: any) => commit.hash === landedCommit.nitHash)).toBe(true);
  });

  it('blocks a canon commit when its existing nit ledger is corrupt', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Corrupt nit commit boundary' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;
    expect((await request(app)
      .post('/api/narrative/interactions')
      .send({ projectId, title: 'World change awaiting canon' })).status).toBe(200);

    const nitDir = path.join(testDataDir, 'nit');
    fs.mkdirSync(nitDir, { recursive: true });
    const nitFile = path.join(nitDir, `${projectId}.json`);
    fs.writeFileSync(nitFile, '{corrupt-canon-ledger');
    const worldFile = path.join(testDataDir, `project_${projectId}.json`);
    const worldBefore = fs.readFileSync(worldFile, 'utf8');

    const response = await request(app)
      .post('/api/narrative/commit')
      .send({ projectId, message: 'Must not bypass corrupt canon' });
    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/Nit ledger is unreadable/);
    expect(fs.readFileSync(nitFile, 'utf8')).toBe('{corrupt-canon-ledger');
    expect(fs.readFileSync(worldFile, 'utf8')).toBe(worldBefore);
  });

  it('blocks a canon commit when its nit ledger parses but would normalize to empty history', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Malformed nit shape boundary' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;
    expect((await request(app)
      .post('/api/narrative/interactions')
      .send({ projectId, title: 'World change awaiting protected canon' })).status).toBe(200);

    const nitDir = path.join(testDataDir, 'nit');
    fs.mkdirSync(nitDir, { recursive: true });
    const nitFile = path.join(nitDir, `${projectId}.json`);
    fs.writeFileSync(nitFile, JSON.stringify({ commits: 'not-an-array', branches: {} }));
    const worldFile = path.join(testDataDir, `project_${projectId}.json`);
    const worldBefore = fs.readFileSync(worldFile, 'utf8');

    const response = await request(app)
      .post('/api/narrative/commit')
      .send({ projectId, message: 'Must not normalize malformed canon to empty' });
    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/structurally invalid canon history/);
    expect(JSON.parse(fs.readFileSync(nitFile, 'utf8'))).toEqual({ commits: 'not-an-array', branches: {} });
    expect(fs.readFileSync(worldFile, 'utf8')).toBe(worldBefore);
  });

  it('routes canon creation and later content edits through the checked mutation boundary', async () => {
    const project = await request(app)
      .post('/api/projects')
      .send({ name: 'Canon boundary test' });
    expect(project.status).toBe(201);
    const projectId = project.body.id as string;
    const created = await request(app)
      .post('/api/narrative/events')
      .send({
        projectId,
        title: 'The first signal',
        description: 'A clean canonical event.',
        chronologyIndex: 1,
        entityIds: [],
        status: 'canon',
      });

    expect(created.status).toBe(200);
    expect(created.body.event.status).toBe('canon');
    const eventId = created.body.event.id as string;

    const blocked = await request(app)
      .patch(`/api/narrative/events/${encodeURIComponent(eventId)}`)
      .send({ projectId, title: 'A silent retcon' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.reason).toBe('retcon');

    const afterBlock = await request(app)
      .get('/api/narrative/events')
      .query({ projectId });
    expect(afterBlock.body.events.find((event: any) => event.id === eventId).title).toBe('The first signal');

    const forced = await request(app)
      .patch(`/api/narrative/events/${encodeURIComponent(eventId)}`)
      .send({ projectId, title: 'The deliberate retcon', force: true, actor: 'test-suite' });
    expect(forced.status).toBe(200);
    expect(forced.body.forced).toBe(true);
    expect(forced.body.event.title).toBe('The deliberate retcon');
  });
});
