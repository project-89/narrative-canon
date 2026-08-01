import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
// Import the pure shape helper directly. Importing the storage factory here
// would initialize its DATA_DIR constant before beforeAll installs the temp
// directory used by the dynamically imported server.
import { createEmptyProjectData } from '../../src/storage/storage-adapter';
import { enqueueSerializedWrite } from '../../src/storage/atomic-write';

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

    const deleted = await request(app).delete(`/api/projects/${encodeURIComponent(projectId)}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toMatchObject({
      success: true,
      deleted: projectId,
      recoverable: true,
    });

    const archiveDir = path.join(testDataDir, deleted.body.archive);
    expect(fs.existsSync(path.join(archiveDir, 'project-metadata.json'))).toBe(true);
    expect(fs.existsSync(path.join(archiveDir, `project_${projectId}.json`))).toBe(true);

    const projects = await request(app).get('/api/projects');
    expect(projects.body.some((project: any) => project.id === projectId)).toBe(false);

    const resurrection = await request(app)
      .post('/api/narrative/interactions')
      .send({ projectId, title: 'Do not recreate an archived world' });
    expect(resurrection.status).toBe(404);
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
    const nitLedger = {
      commits: [{ hash: 'full-hash', operations: [{ type: 'ADD_ENTITY', entityId: 'keeper' }] }],
      branches: { main: { headHash: 'full-hash', lastSnapshot: { entities: [{ id: 'keeper' }] } } },
      futureLedgerField: { preserveMe: true },
    };
    fs.writeFileSync(
      path.join(nitDir, `${exportedProjectId}.json`),
      JSON.stringify(nitLedger),
    );

    const response = await request(app)
      .get(`/api/projects/${encodeURIComponent(exportedProjectId)}/export`);

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
