import { ChildProcess, fork } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { atomicWriteJsonSync } from '../../src/storage/atomic-write';
import { createEmptyProjectData } from '../../src/storage/storage-adapter';
import {
  acquireCatalogBoundaryLock,
  acquireProjectBoundaryLock,
  inspectCatalogBoundaryLock,
  inspectProjectBoundaryLock,
} from '../../src/storage/project-archive-boundary';
import {
  recoverStaleCatalogLock,
  recoverStaleProjectPublishLock,
} from '../../src/storage/stale-lock-recovery';

describe('guarded stale lock recovery', () => {
  let dataDir: string;
  const children = new Set<ChildProcess>();
  const workerFile = path.join(__dirname, 'fixtures', 'project-boundary-worker.ts');

  function waitForMessage(child: ChildProcess, type: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 5_000);
      const onMessage = (message: any) => {
        if (message?.type !== type) return;
        clearTimeout(timeout);
        child.off('message', onMessage);
        resolve(message);
      };
      child.on('message', onMessage);
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
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'narrative-stale-lock-'));
  });

  afterEach(async () => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    await Promise.all([...children].map(child => waitForExit(child).catch(() => undefined)));
    children.clear();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('clears an exact abandoned plain publisher only after validating its world and catalog', () => {
    const projectId = 'project_plain_stale';
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [{ id: projectId }], { backup: false });
    atomicWriteJsonSync(path.join(dataDir, `project_${projectId}.json`), createEmptyProjectData(), { backup: false });
    const abandoned = acquireProjectBoundaryLock(dataDir, projectId, 'publish', { now: () => 1 });

    expect(() => recoverStaleProjectPublishLock(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedOperationId: 'wrong-owner',
      reason: 'publisher was killed',
      staleAfterMs: 10,
      now: () => 1_000,
    })).toThrow(new RegExp(abandoned.owner.operationId));

    const recovered = recoverStaleProjectPublishLock(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedOperationId: abandoned.owner.operationId,
      reason: 'publisher was killed and its atomic world is readable',
      staleAfterMs: 10,
      now: () => 1_000,
    });
    expect(recovered).toMatchObject({ kind: 'project-publish', recovered: true });
    expect(inspectProjectBoundaryLock(dataDir, projectId).exists).toBe(false);
    expect(fs.existsSync(path.join(dataDir, recovered.auditFile))).toBe(true);
  });

  it('does not clear a stale publisher over a parseable empty-world shell', () => {
    const projectId = 'project_plain_stale_empty_shell';
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [{ id: projectId }], { backup: false });
    atomicWriteJsonSync(path.join(dataDir, `project_${projectId}.json`), {}, { backup: false });
    const abandoned = acquireProjectBoundaryLock(dataDir, projectId, 'publish', { now: () => 1 });

    expect(() => recoverStaleProjectPublishLock(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedOperationId: abandoned.owner.operationId,
      reason: 'must prove the world before clearing its publisher',
      staleAfterMs: 10,
      now: () => 1_000,
    })).toThrow(/load-bearing array/);
    expect(inspectProjectBoundaryLock(dataDir, projectId).exists).toBe(true);
  });

  it('refuses a plain unlock when a paired publication journal exists', async () => {
    const projectId = 'project_paired_stale';
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [{ id: projectId }], { backup: false });
    atomicWriteJsonSync(path.join(dataDir, `project_${projectId}.json`), createEmptyProjectData(), { backup: false });
    const { beginProjectPublicationJournal } = await import('../../src/storage/project-publication-journal');
    const abandoned = acquireProjectBoundaryLock(dataDir, projectId, 'publish', { now: () => 1 });
    beginProjectPublicationJournal(abandoned, '7'.repeat(64));

    expect(() => recoverStaleProjectPublishLock(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedOperationId: abandoned.owner.operationId,
      reason: 'must select paired recovery',
      staleAfterMs: 10,
      now: () => 1_000,
    })).toThrow(/use publication recovery/);
    expect(inspectProjectBoundaryLock(dataDir, projectId).exists).toBe(true);
  });

  it('retries a recovery owner killed after acquisition when its initiated audit matches exactly', async () => {
    const projectId = 'project_recovery_retry';
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [{ id: projectId }], { backup: false });
    atomicWriteJsonSync(path.join(dataDir, `project_${projectId}.json`), createEmptyProjectData(), { backup: false });
    const abandoned = acquireProjectBoundaryLock(dataDir, projectId, 'publish', { now: () => 1 });

    const child = fork(workerFile, [
      'recover-project-and-hold',
      dataDir,
      projectId,
      '10',
      abandoned.owner.operationId,
    ], {
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    children.add(child);
    const acquired = await waitForMessage(child, 'recovery-locked');
    child.kill('SIGKILL');
    await waitForExit(child);

    const staleRecovery = inspectProjectBoundaryLock(dataDir, projectId, {
      staleAfterMs: 10,
      now: () => 2_000,
    });
    expect(staleRecovery).toMatchObject({
      exists: true,
      stale: true,
      owner: { purpose: 'recovery', operationId: acquired.operationId },
    });

    const result = recoverStaleProjectPublishLock(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedOperationId: acquired.operationId,
      reason: 'resume the exact initiated recovery after SIGKILL',
      staleAfterMs: 10,
      now: () => 2_000,
    });
    expect(result).toMatchObject({ kind: 'project-publish', recovered: true });
    expect(inspectProjectBoundaryLock(dataDir, projectId).exists).toBe(false);
    const audit = JSON.parse(fs.readFileSync(path.join(dataDir, result.auditFile), 'utf8'));
    expect(audit).toMatchObject({
      state: 'complete',
      projectId,
      recoveryOperationId: acquired.operationId,
    });
  });

  it('refuses to clear an unbound stale recovery owner', () => {
    const projectId = 'project_unbound_recovery';
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [{ id: projectId }], { backup: false });
    atomicWriteJsonSync(path.join(dataDir, `project_${projectId}.json`), createEmptyProjectData(), { backup: false });
    const unbound = acquireProjectBoundaryLock(dataDir, projectId, 'recovery', { now: () => 1 });

    expect(() => recoverStaleProjectPublishLock(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedOperationId: unbound.owner.operationId,
      reason: 'there is deliberately no audit authority',
      staleAfterMs: 10,
      now: () => 1_000,
    })).toThrow(/not bound to an initiated project recovery audit/);
    expect(inspectProjectBoundaryLock(dataDir, projectId).exists).toBe(true);
  });

  it('clears an exact abandoned catalog owner only when projects.json is readable', () => {
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [{ id: 'project_catalog_safe' }], { backup: false });
    const abandoned = acquireCatalogBoundaryLock(dataDir, { now: () => 1 });
    const result = recoverStaleCatalogLock(dataDir, {
      expectedOperationId: abandoned.owner.operationId,
      reason: 'catalog writer was killed after an atomic rename',
      staleAfterMs: 10,
      now: () => 1_000,
    });
    expect(result).toMatchObject({ kind: 'catalog', recovered: true });
    expect(inspectCatalogBoundaryLock(dataDir).exists).toBe(false);
  });
});
