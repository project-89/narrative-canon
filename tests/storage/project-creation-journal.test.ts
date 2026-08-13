import { ChildProcess, fork } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { atomicWriteJsonSync } from '../../src/storage/atomic-write';
import { inspectProjectBoundaryLock } from '../../src/storage/project-archive-boundary';
import {
  inspectProjectCreation,
  readProjectCreationJournal,
  recoverProjectCreation,
} from '../../src/storage/project-creation-journal';

describe('durable project creation journal', () => {
  let dataDir: string;
  const children = new Set<ChildProcess>();
  const workerFile = path.join(__dirname, 'fixtures', 'project-boundary-worker.ts');

  function waitForMessage(child: ChildProcess, type: string): Promise<any> {
    return new Promise((resolve, reject) => {
      let stderr = '';
      const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}: ${stderr}`)), 5_000);
      child.stderr?.on('data', chunk => { stderr += chunk.toString(); });
      child.on('message', (message: any) => {
        if (message?.type !== type) return;
        clearTimeout(timeout);
        resolve(message);
      });
      child.once('error', reject);
    });
  }

  function waitForExit(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    return new Promise((resolve, reject) => {
      child.once('exit', () => resolve());
      child.once('error', reject);
    });
  }

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'narrative-creation-journal-'));
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [{
      id: 'project_existing',
      name: 'Existing world',
      description: '',
      createdAt: 1,
      updatedAt: 1,
      isActive: true,
      stats: { entities: 0, relationships: 0, commits: 0, branches: 1 },
      color: '#000000',
    }], { backup: false });
  });

  afterEach(async () => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    await Promise.all([...children].map(child => waitForExit(child).catch(() => undefined)));
    children.clear();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('publishes exactly one complete catalog row after SIGKILL between world and catalog', async () => {
    const projectId = 'project_creation_sigkill';
    const child = fork(workerFile, [
      'hold-interrupted-creation',
      dataDir,
      projectId,
      '10',
    ], {
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    children.add(child);
    const published = await waitForMessage(child, 'creation-artifacts-published');
    child.kill('SIGKILL');
    await waitForExit(child);

    const inspection = inspectProjectCreation(dataDir, projectId, {
      staleAfterMs: 10,
      now: () => 1_000,
    });
    expect(inspection).toMatchObject({
      catalogContainsProject: false,
      world: { exists: true, valid: true },
      journal: { operationId: published.operationId, state: 'artifacts-published' },
      lock: { exists: true, stale: true },
    });

    const result = recoverProjectCreation(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedJournalOperationId: published.operationId,
      expectedProjectLockOperationId: published.operationId,
      reason: 'creator process was SIGKILLed after the atomic world rename',
      staleAfterMs: 10,
      now: () => 1_000,
    });
    expect(result).toMatchObject({
      project: { id: projectId, name: 'Interrupted creation', isActive: true },
      catalogAction: 'published',
    });
    const catalog = JSON.parse(fs.readFileSync(path.join(dataDir, 'projects.json'), 'utf8'));
    expect(catalog.filter((row: any) => row.id === projectId)).toHaveLength(1);
    expect(catalog.filter((row: any) => row.isActive).map((row: any) => row.id)).toEqual([projectId]);
    expect(readProjectCreationJournal(dataDir, projectId)).toBeNull();
    expect(inspectProjectBoundaryLock(dataDir, projectId).exists).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, result.auditFile), 'utf8')))
      .toMatchObject({ state: 'complete', catalogAction: 'published' });
  });

  it('fails closed when the journalled creation world is semantically empty', async () => {
    const projectId = 'project_creation_corrupt';
    const child = fork(workerFile, [
      'hold-interrupted-creation',
      dataDir,
      projectId,
      '10',
    ], {
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    children.add(child);
    const published = await waitForMessage(child, 'creation-artifacts-published');
    child.kill('SIGKILL');
    await waitForExit(child);
    atomicWriteJsonSync(path.join(dataDir, `project_${projectId}.json`), {}, { backup: false });

    expect(() => recoverProjectCreation(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedJournalOperationId: published.operationId,
      expectedProjectLockOperationId: published.operationId,
      reason: 'must not publish a fabricated empty world',
      staleAfterMs: 10,
      now: () => 1_000,
    })).toThrow(/Creation world is not recoverable|changed after it was journalled/);
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'projects.json'), 'utf8'))
      .some((row: any) => row.id === projectId)).toBe(false);
    expect(inspectProjectBoundaryLock(dataDir, projectId).exists).toBe(true);
  });
});
