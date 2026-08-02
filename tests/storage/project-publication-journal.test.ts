import { ChildProcess, fork } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { atomicWriteJsonSync } from '../../src/storage/atomic-write';
import {
  acquireProjectBoundaryLock,
  inspectProjectBoundaryLock,
} from '../../src/storage/project-archive-boundary';
import {
  beginProjectPublicationJournal,
  recoverProjectPublication,
  reconcileProjectPublicationJournal,
  settleCurrentProjectPublicationJournal,
} from '../../src/storage/project-publication-journal';

describe('paired project publication journal', () => {
  let dataDir: string;
  const projectId = 'project_paired_publication';
  const oldNitHash = '1'.repeat(64);
  const nextNitHash = '2'.repeat(64);
  const currentNitHash = '3'.repeat(64);
  const missingNitHash = '4'.repeat(64);
  const inactiveNitHash = '5'.repeat(64);
  const worldFile = () => path.join(dataDir, `project_${projectId}.json`);
  const nitFile = () => path.join(dataDir, 'nit', `${projectId}.json`);
  const workerFile = path.join(__dirname, 'fixtures', 'project-boundary-worker.ts');

  function nextMessage(child: ChildProcess): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for publication worker')), 5_000);
      child.once('message', message => { clearTimeout(timeout); resolve(message); });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
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
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'narrative-publication-journal-'));
    fs.mkdirSync(path.join(dataDir, 'nit'), { recursive: true });
    atomicWriteJsonSync(worldFile(), { commits: [{ id: 'old-world' }] }, { backup: false });
    atomicWriteJsonSync(nitFile(), { commits: [{ hash: oldNitHash }], branches: {} }, { backup: false });
  });

  afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));

  it('rolls an ahead ledger back after an interrupted publication', () => {
    const originalNit = fs.readFileSync(nitFile(), 'utf8');
    const abandoned = acquireProjectBoundaryLock(dataDir, projectId, 'publish');
    beginProjectPublicationJournal(abandoned, nextNitHash);
    atomicWriteJsonSync(nitFile(), { commits: [{ hash: oldNitHash }, { hash: nextNitHash }], branches: {} });
    abandoned.release();

    const recovery = acquireProjectBoundaryLock(dataDir, projectId, 'recovery');
    try {
      expect(reconcileProjectPublicationJournal(recovery)).toMatchObject({ action: 'rolled-back' });
    } finally {
      recovery.release();
    }
    expect(fs.readFileSync(nitFile(), 'utf8')).toBe(originalNit);
  });

  it('recognizes a world and ledger pair that both reached disk before interruption', () => {
    const abandoned = acquireProjectBoundaryLock(dataDir, projectId, 'publish');
    beginProjectPublicationJournal(abandoned, nextNitHash);
    atomicWriteJsonSync(nitFile(), { commits: [{ hash: oldNitHash }, { hash: nextNitHash }], branches: {} });
    atomicWriteJsonSync(worldFile(), { commits: [{ id: 'new-world', nitHash: nextNitHash }] });
    abandoned.release();

    const recovery = acquireProjectBoundaryLock(dataDir, projectId, 'recovery');
    try {
      expect(reconcileProjectPublicationJournal(recovery)).toMatchObject({ action: 'completed' });
    } finally {
      recovery.release();
    }
    expect(JSON.parse(fs.readFileSync(nitFile(), 'utf8')).commits.at(-1).hash).toBe(nextNitHash);
  });

  it('settles the current owner based on what the authoritative world actually published', () => {
    const publish = acquireProjectBoundaryLock(dataDir, projectId, 'publish');
    try {
      beginProjectPublicationJournal(publish, currentNitHash);
      atomicWriteJsonSync(nitFile(), { commits: [{ hash: currentNitHash }], branches: {} });
      expect(reconcileProjectPublicationJournal(publish).action).toBe('active-current-operation');
      expect(settleCurrentProjectPublicationJournal(publish).action).toBe('rolled-back');
    } finally {
      publish.release();
    }
  });

  it('never exposes a markerless active transaction when preparation fails', () => {
    const publish = acquireProjectBoundaryLock(dataDir, projectId, 'publish');
    const writeFailure = jest.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('injected marker publication failure');
    });
    try {
      expect(() => beginProjectPublicationJournal(publish, inactiveNitHash)).toThrow(
        /injected marker publication failure/,
      );
    } finally {
      writeFailure.mockRestore();
      publish.release();
    }
    const root = path.join(
      dataDir,
      '.archive-boundary',
      'publications',
      'projects',
      projectId,
    );
    expect(fs.existsSync(root) ? fs.readdirSync(root).filter(name => name.endsWith('.txn')) : []).toEqual([]);
  });

  it('refuses a publication intent that is not a real nit hash', () => {
    const publish = acquireProjectBoundaryLock(dataDir, projectId, 'publish');
    try {
      expect(() => beginProjectPublicationJournal(publish, 'friendly-placeholder'))
        .toThrow(/64-character hexadecimal nit hash/);
    } finally {
      publish.release();
    }
  });

  it('fails closed when the world references a missing nit revision', () => {
    const abandoned = acquireProjectBoundaryLock(dataDir, projectId, 'publish');
    beginProjectPublicationJournal(abandoned, missingNitHash);
    atomicWriteJsonSync(worldFile(), { commits: [{ nitHash: missingNitHash }] });
    abandoned.release();

    const recovery = acquireProjectBoundaryLock(dataDir, projectId, 'recovery');
    try {
      expect(() => reconcileProjectPublicationJournal(recovery)).toThrow(/ledger does not contain/);
    } finally {
      recovery.release();
    }
  });

  it('recovers the exact prior ledger after a real publisher is SIGKILLed between files', async () => {
    const originalNit = fs.readFileSync(nitFile(), 'utf8');
    const child = fork(workerFile, [
      'hold-interrupted-publication',
      dataDir,
      projectId,
      '10',
    ], {
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    const published = await nextMessage(child);
    expect(published.type).toBe('nit-published');
    child.kill('SIGKILL');
    await waitForExit(child);

    const inspection = inspectProjectBoundaryLock(dataDir, projectId, {
      staleAfterMs: 10,
      now: () => 1_000,
    });
    expect(inspection).toMatchObject({ exists: true, stale: true });
    const settlement = recoverProjectPublication(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedJournalOperationId: published.operationId,
      expectedProjectLockOperationId: published.operationId,
      reason: 'test operator confirmed the killed publisher',
      staleAfterMs: 10,
      now: () => 1_000,
    });
    expect(settlement.action).toBe('rolled-back');
    expect(fs.readFileSync(nitFile(), 'utf8')).toBe(originalNit);
    const auditDir = path.join(
      dataDir,
      '.archive-boundary',
      'recoveries',
      'publications',
    );
    const audits = fs.readdirSync(auditDir);
    expect(audits).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(auditDir, audits[0]), 'utf8'))).toMatchObject({
      state: 'complete',
      projectId,
      abandonedOperationId: published.operationId,
      reason: 'test operator confirmed the killed publisher',
      settlement: { action: 'rolled-back' },
    });
  });
});
