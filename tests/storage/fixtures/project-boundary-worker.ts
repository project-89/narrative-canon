import {
  acquireCatalogBoundaryLock,
  acquireProjectBoundaryLock,
  ProjectBoundaryLockedError,
} from '../../../src/storage/project-archive-boundary';
import { atomicWriteJsonSync } from '../../../src/storage/atomic-write';
import { beginProjectPublicationJournal } from '../../../src/storage/project-publication-journal';
import { recoverStaleProjectPublishLock } from '../../../src/storage/stale-lock-recovery';
import {
  beginProjectCreationJournal,
  markProjectCreationArtifactsPublished,
} from '../../../src/storage/project-creation-journal';
import { createEmptyProjectData } from '../../../src/storage/storage-adapter';
import * as path from 'path';

type WorkerMessage = { type: string; [key: string]: unknown };

const send = (message: WorkerMessage) => {
  if (process.send) process.send(message);
};

const [action, dataDir, projectId = 'project_ipc', staleAfterRaw, expectedOperationId] = process.argv.slice(2);
const staleAfterMs = Number(staleAfterRaw) || undefined;

function finish(message: WorkerMessage): void {
  send(message);
  setImmediate(() => process.disconnect?.());
}

try {
  if (action === 'hold-project') {
    const lock = acquireProjectBoundaryLock(dataDir, projectId, 'publish', { waitMs: 0, staleAfterMs });
    send({ type: 'locked', operationId: lock.owner.operationId, lockDir: lock.lockDir });
    process.on('message', message => {
      if ((message as WorkerMessage)?.type !== 'release') return;
      lock.release();
      finish({ type: 'released' });
    });
  } else if (action === 'try-project') {
    const lock = acquireProjectBoundaryLock(dataDir, projectId, 'publish', { waitMs: 0, staleAfterMs });
    const operationId = lock.owner.operationId;
    lock.release();
    finish({ type: 'acquired', operationId });
  } else if (action === 'hold-catalog') {
    const lock = acquireCatalogBoundaryLock(dataDir, { waitMs: 0, staleAfterMs });
    send({ type: 'locked', operationId: lock.owner.operationId, lockDir: lock.lockDir });
    process.on('message', message => {
      if ((message as WorkerMessage)?.type !== 'release') return;
      lock.release();
      finish({ type: 'released' });
    });
  } else if (action === 'try-catalog') {
    const lock = acquireCatalogBoundaryLock(dataDir, { waitMs: 0, staleAfterMs });
    const operationId = lock.owner.operationId;
    lock.release();
    finish({ type: 'acquired', operationId });
  } else if (action === 'hold-interrupted-publication') {
    const priorHash = '1'.repeat(64);
    const childNextHash = '6'.repeat(64);
    const lock = acquireProjectBoundaryLock(dataDir, projectId, 'publish', {
      waitMs: 0,
      staleAfterMs,
      now: () => 1,
    });
    beginProjectPublicationJournal(lock, childNextHash);
    atomicWriteJsonSync(path.join(dataDir, 'nit', `${projectId}.json`), {
      commits: [{ hash: priorHash }, { hash: childNextHash }],
      branches: {},
    });
    send({ type: 'nit-published', operationId: lock.owner.operationId, lockDir: lock.lockDir });
    // Parent deliberately SIGKILLs this process; no release/rollback hook.
    setInterval(() => undefined, 1_000);
  } else if (action === 'recover-project-and-hold') {
    recoverStaleProjectPublishLock(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedOperationId,
      reason: 'SIGKILL regression: take durable recovery ownership',
      staleAfterMs,
      now: () => 1_000,
      onRecoveryLockAcquired: operationId => {
        send({ type: 'recovery-locked', operationId });
        // The parent kills us here. This deliberately leaves the precommitted
        // recovery owner and initiated audit on disk.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
      },
    });
  } else if (action === 'hold-interrupted-creation') {
    const lock = acquireProjectBoundaryLock(dataDir, projectId, 'publish', {
      waitMs: 0,
      staleAfterMs,
      now: () => 1,
    });
    const project = {
      id: projectId,
      name: 'Interrupted creation',
      description: 'Complete bytes, missing catalog row',
      createdAt: 1,
      updatedAt: 1,
      isActive: false,
      stats: { entities: 0, relationships: 0, commits: 0, branches: 1 },
      color: '#123456',
    };
    beginProjectCreationJournal(lock, project, { activate: true });
    atomicWriteJsonSync(
      path.join(dataDir, `project_${projectId}.json`),
      createEmptyProjectData(),
      { backup: false },
    );
    markProjectCreationArtifactsPublished(lock);
    send({ type: 'creation-artifacts-published', operationId: lock.owner.operationId });
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  } else {
    finish({ type: 'error', code: 'UNKNOWN_ACTION', message: String(action) });
  }
} catch (error: any) {
  finish({
    type: 'error',
    code: error?.code || 'UNEXPECTED',
    stale: error instanceof ProjectBoundaryLockedError ? error.stale : undefined,
    message: error?.message || String(error),
  });
}
