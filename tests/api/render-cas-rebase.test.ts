import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { atomicWriteJsonSync } from '../../src/storage/atomic-write';

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'narrative-render-rebase-'));

beforeAll(() => {
  process.env.DATA_DIR = testDataDir;
  process.env.NARRATIVE_DISABLE_AUTOSTART = 'true';
});

afterAll(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  delete process.env.NARRATIVE_DISABLE_AUTOSTART;
});

describe('render attachment compare-and-save rebasing', () => {
  let app: typeof import('../../src/api/server').default;

  beforeAll(async () => {
    ({ default: app } = await import('../../src/api/server'));
  });

  it('preserves registry publications and concurrent fields while attaching shot keyframes', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Render rebase target' });
    expect(created.status).toBe(201);
    const projectId = created.body.id as string;
    const frameId = 'frame_render_rebase';

    const sceneResponse = await request(app)
      .post('/api/narrative/interactions')
      .send({
        projectId,
        title: 'The Durable Shot',
        prose: 'A lantern changes hands beneath the floorboards.',
        frames: [{ id: frameId, position: 0, title: 'Passing the flame' }],
      });
    expect(sceneResponse.status).toBe(200);
    const sceneId = sceneResponse.body.interaction.id as string;
    const worldFile = path.join(testDataDir, `project_${projectId}.json`);

    let renderNumber = 0;
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async input => {
      expect(String(input)).toContain('/api/narrative/visual/render');
      renderNumber += 1;
      const imageUrl = `/api/narrative/visual/images/rebase-${renderNumber}.png`;

      // This is the write the real /visual/render route performs before it
      // returns: publish the generated-output registry on a new world inode.
      // Include an unrelated concurrent field to prove the caller rebases a
      // narrow stable-ID attachment instead of copying its old fork wholesale.
      const durable = JSON.parse(fs.readFileSync(worldFile, 'utf-8'));
      durable.generatedImages = [
        ...(durable.generatedImages || []),
        {
          id: `genimg_rebase_${renderNumber}`,
          url: imageUrl,
          kind: 'image',
          sourceType: 'render',
          generatedAt: new Date().toISOString(),
        },
      ];
      durable.concurrentRenderState = {
        publication: renderNumber,
        untouched: `registry-${renderNumber}`,
      };
      atomicWriteJsonSync(worldFile, durable);

      return new Response(JSON.stringify({
        imageUrl,
        backend: 'test-renderer',
        actualPromptSent: `actual prompt ${renderNumber}`,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    let response: request.Response;
    try {
      response = await request(app)
        .post('/api/narrative/visual/generate-keyframes')
        .send({
          projectId,
          sceneId,
          frameId,
          firstFramePrompt: 'The lantern approaches.',
          lastFramePrompt: 'The lantern changes hands.',
          useShotImageAsReference: false,
        });
    } finally {
      fetchSpy.mockRestore();
    }

    expect(response.status).toBe(200);
    expect(renderNumber).toBe(2);

    const durable = JSON.parse(fs.readFileSync(worldFile, 'utf-8'));
    expect(durable.generatedImages.map((entry: any) => entry.url)).toEqual([
      '/api/narrative/visual/images/rebase-1.png',
      '/api/narrative/visual/images/rebase-2.png',
    ]);
    expect(durable.concurrentRenderState).toEqual({
      publication: 2,
      untouched: 'registry-2',
    });
    const scene = durable.interactions.find((candidate: any) => candidate.id === sceneId);
    const frame = scene.frames.find((candidate: any) => candidate.id === frameId);
    expect(frame.firstFrame).toMatchObject({
      url: '/api/narrative/visual/images/rebase-1.png',
      backend: 'test-renderer',
    });
    expect(frame.lastFrame).toMatchObject({
      url: '/api/narrative/visual/images/rebase-2.png',
      backend: 'test-renderer',
    });
  });
});
