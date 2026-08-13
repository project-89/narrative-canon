import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { atomicWriteJsonSync } from '../../src/storage/atomic-write';
import { ImageGenerator } from '../../src/visual/image-generator';

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'narrative-generated-media-rebase-'));
const originalEnv = {
  dataDir: process.env.DATA_DIR,
  disableAutostart: process.env.NARRATIVE_DISABLE_AUTOSTART,
  geminiKey: process.env.GEMINI_API_KEY,
  openaiKey: process.env.OPENAI_API_KEY,
  atlasKey: process.env.ATLASCLOUD_API_KEY,
};

const restoreEnv = (name: string, value: string | undefined) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

describe('legacy generated-media attachment rebasing', () => {
  let app: typeof import('../../src/api/server').default;
  let generateImageSpy: jest.SpyInstance;

  beforeAll(async () => {
    process.env.DATA_DIR = testDataDir;
    process.env.NARRATIVE_DISABLE_AUTOSTART = 'true';
    process.env.GEMINI_API_KEY = 'test-image-key';
    // Force both routes through the mocked Nano Banana instance even when the
    // developer running the suite has real provider keys in their environment.
    process.env.OPENAI_API_KEY = '';
    process.env.ATLASCLOUD_API_KEY = '';
    generateImageSpy = jest.spyOn(ImageGenerator.prototype, 'generateImage');
    ({ default: app } = await import('../../src/api/server'));
  });

  afterEach(() => {
    generateImageSpy.mockReset();
  });

  afterAll(() => {
    generateImageSpy.mockRestore();
    fs.rmSync(testDataDir, { recursive: true, force: true });
    restoreEnv('DATA_DIR', originalEnv.dataDir);
    restoreEnv('NARRATIVE_DISABLE_AUTOSTART', originalEnv.disableAutostart);
    restoreEnv('GEMINI_API_KEY', originalEnv.geminiKey);
    restoreEnv('OPENAI_API_KEY', originalEnv.openaiKey);
    restoreEnv('ATLASCLOUD_API_KEY', originalEnv.atlasKey);
  });

  const mockPaidRenderWithConcurrentWorldWrite = (
    worldFile: string,
    mutateConcurrentRevision: (world: any) => void,
  ) => {
    generateImageSpy.mockImplementationOnce(async (prompt: string) => {
      const concurrentWorld = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
      mutateConcurrentRevision(concurrentWorld);
      atomicWriteJsonSync(worldFile, concurrentWorld);
      return {
        data: Buffer.from('paid-generated-image'),
        mimeType: 'image/png',
        prompt,
        referenceCount: 0,
        generatedAt: new Date(),
        model: 'test-image-model',
      };
    });
  };

  it('keeps a concurrent world revision while registering and attaching an artifact image', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Artifact render rebase target' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;

    const artifactResponse = await request(app)
      .post('/api/narrative/artifacts')
      .send({ projectId, title: 'The Old Headline', format: 'magazine_cover' });
    expect(artifactResponse.status).toBe(200);
    const artifactId = artifactResponse.body.artifact.id as string;
    const worldFile = path.join(testDataDir, `project_${projectId}.json`);

    mockPaidRenderWithConcurrentWorldWrite(worldFile, world => {
      world.concurrentRenderState = { owner: 'other-checkout', keep: true };
      const artifact = world.artifacts.find((candidate: any) => candidate.id === artifactId);
      artifact.title = 'The Concurrent Headline';
      artifact.extensions = { concurrentEditorNote: 'do not overwrite me' };
    });

    const rendered = await request(app)
      .post(`/api/narrative/artifacts/${artifactId}/generate-image`)
      .send({ projectId, prompt: 'A precise magazine cover.', model: 'nano-banana' });

    expect(rendered.status).toBe(200);
    expect(rendered.body.artifact).toMatchObject({
      id: artifactId,
      title: 'The Concurrent Headline',
      extensions: { concurrentEditorNote: 'do not overwrite me' },
      primaryImage: { url: rendered.body.imageUrl },
    });

    const durable = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
    expect(durable.concurrentRenderState).toEqual({ owner: 'other-checkout', keep: true });
    expect(durable.generatedImages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        url: rendered.body.imageUrl,
        sourceType: 'artifact',
        backend: 'nano-banana',
      }),
    ]));
    expect(durable.artifacts.find((candidate: any) => candidate.id === artifactId)).toMatchObject({
      title: 'The Concurrent Headline',
      extensions: { concurrentEditorNote: 'do not overwrite me' },
      primaryImage: { url: rendered.body.imageUrl },
    });
  });

  it('keeps a concurrent world revision while registering and attaching a storyboard artifact', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Storyboard render rebase target' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;
    const worldFile = path.join(testDataDir, `project_${projectId}.json`);

    mockPaidRenderWithConcurrentWorldWrite(worldFile, world => {
      world.concurrentStoryboardState = { owner: 'other-checkout', keep: true };
      world.artifacts = [
        ...(world.artifacts || []),
        {
          id: 'artifact_from_other_checkout',
          title: 'Concurrent artifact',
          format: 'memo',
          status: 'draft',
        },
      ];
    });

    const rendered = await request(app)
      .post('/api/narrative/storyboard/generate')
      .send({
        projectId,
        scriptChunk: 'A hand carries the lantern through the underfloor dark.',
        title: 'Lantern Passage',
        panelCount: 6,
        model: 'nano-banana',
      });

    expect(rendered.status).toBe(200);
    expect(rendered.body.artifact).toMatchObject({
      id: expect.stringMatching(/^artifact_storyboard_/),
      title: 'Lantern Passage',
      format: 'storyboard_page',
      primaryImage: { url: rendered.body.imageUrl },
    });

    const durable = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
    expect(durable.concurrentStoryboardState).toEqual({ owner: 'other-checkout', keep: true });
    expect(durable.generatedImages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        url: rendered.body.imageUrl,
        sourceType: 'storyboard',
        backend: 'nano-banana',
      }),
    ]));
    expect(durable.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'artifact_from_other_checkout', title: 'Concurrent artifact' }),
      expect.objectContaining({
        id: rendered.body.artifact.id,
        format: 'storyboard_page',
        primaryImage: expect.objectContaining({ url: rendered.body.imageUrl }),
      }),
    ]));
  });
});
