import { ChildProcess, fork } from 'child_process';
import fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createEmptyProjectData, Project } from '../../src/storage/storage-adapter';
import { FileStorageAdapter } from '../../src/storage/file-adapter';
import { restoreProjectArchive } from '../../src/storage/project-archive-recovery';
import {
  adoptProjectArchiveTombstone,
  acquireCatalogBoundaryLock,
  acquireProjectBoundaryLock,
  assertProjectNotTombstoned,
  clearStaleCatalogBoundaryLock,
  clearStaleProjectBoundaryLock,
  createProjectArchiveTombstone,
  filterTombstonedProjectsForRestore,
  inspectCatalogBoundaryLock,
  inspectProjectBoundaryLock,
  markProjectArchiveCatalogRemoved,
  markProjectArchiveComplete,
  markProjectArchiveMove,
  ProjectArchiveJournalError,
  ProjectBoundaryLockedError,
  ProjectTombstonedError,
  projectArchiveTombstonePath,
  readProjectArchiveTombstone,
  removeProjectArchiveTombstone,
} from '../../src/storage/project-archive-boundary';

const workerFile = path.join(__dirname, 'fixtures', 'project-boundary-worker.ts');

type ChildMessage = { type: string; code?: string; stale?: boolean; lockDir?: string; [key: string]: unknown };

function spawnWorker(args: string[]): ChildProcess {
  return fork(workerFile, args, {
    execArgv: ['--import', 'tsx'],
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
}

function nextMessage(child: ChildProcess, wanted?: string): Promise<ChildMessage> {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for child message${stderr ? `: ${stderr}` : ''}`));
    }, 5_000);
    const onStderr = (chunk: Buffer | string) => { stderr += chunk.toString(); };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`Child exited before message (${code})${stderr ? `: ${stderr}` : ''}`));
    };
    const onMessage = (message: ChildMessage) => {
      if (wanted && message.type !== wanted) return;
      cleanup();
      resolve(message);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      child.off('message', onMessage);
      child.off('error', onError);
      child.off('exit', onExit);
      child.stderr?.off('data', onStderr);
    };
    child.on('message', onMessage);
    child.on('error', onError);
    child.on('exit', onExit);
    child.stderr?.on('data', onStderr);
  });
}

function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    child.once('exit', () => resolve());
    child.once('error', reject);
  });
}

function project(id: string, name = id): Project {
  return {
    id,
    name,
    description: '',
    createdAt: 1,
    updatedAt: 1,
    isActive: false,
    stats: { entities: 0, relationships: 0, commits: 0, branches: 1 },
    color: '#123456',
  };
}

function archiveMoves(projectId: string, archiveDir: string): Array<{ from: string; to: string }> {
  return [
    `project_${projectId}.json`,
    `project_${projectId}.json.bak`,
    path.join('nit', `${projectId}.json`),
    path.join('nit', `${projectId}.json.bak`),
  ].map(from => ({ from, to: path.join(archiveDir, from) }));
}

function markOtherArchiveMovesMissing(
  lock: ReturnType<typeof acquireProjectBoundaryLock>,
  retainedSources: string[],
): void {
  const retained = new Set(retainedSources);
  for (const move of archiveMoves(lock.projectId, 'unused')) {
    if (!retained.has(move.from)) markProjectArchiveMove(lock, move.from, 'missing');
  }
}

describe('durable project archive boundary', () => {
  let root: string;
  let shared: string;
  let aliasA: string;
  let aliasB: string;
  const children = new Set<ChildProcess>();

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'narrative-archive-boundary-'));
    shared = path.join(root, 'shared-data');
    fs.mkdirSync(shared);
    const checkoutA = path.join(root, 'checkout-a');
    const checkoutB = path.join(root, 'checkout-b');
    fs.mkdirSync(checkoutA);
    fs.mkdirSync(checkoutB);
    aliasA = path.join(checkoutA, '.narrative-data');
    aliasB = path.join(checkoutB, '.narrative-data');
    fs.symlinkSync(shared, aliasA, 'dir');
    fs.symlinkSync(shared, aliasB, 'dir');
  });

  afterEach(async () => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    await Promise.all([...children].map(child => waitForExit(child).catch(() => undefined)));
    children.clear();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('coordinates two checkout processes through symlinked DATA_DIR aliases and never steals stale ownership', async () => {
    const holder = spawnWorker(['hold-project', aliasA, 'project_shared']);
    children.add(holder);
    const held = await nextMessage(holder, 'locked');

    const contender = spawnWorker(['try-project', aliasB, 'project_shared']);
    children.add(contender);
    const blocked = await nextMessage(contender);
    expect(blocked).toMatchObject({ type: 'error', code: 'PROJECT_BOUNDARY_LOCKED', stale: false });
    await waitForExit(contender);

    // Kill the owner and age its durable heartbeat. A new process reports a
    // recovery boundary; it never deletes/steals the abandoned directory.
    holder.kill('SIGKILL');
    await waitForExit(holder);
    const ownerFile = path.join(String(held.lockDir), 'owner.json');
    const owner = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    fs.writeFileSync(ownerFile, JSON.stringify({ ...owner, heartbeatAt: 1 }));

    const afterCrash = spawnWorker(['try-project', aliasB, 'project_shared', '10']);
    children.add(afterCrash);
    const stale = await nextMessage(afterCrash);
    expect(stale).toMatchObject({ type: 'error', code: 'PROJECT_BOUNDARY_STALE', stale: true });
    await waitForExit(afterCrash);
    expect(fs.existsSync(String(held.lockDir))).toBe(true);
  });

  it('concludes staleness immediately for a provably dead owner, without aging the heartbeat', async () => {
    const holder = spawnWorker(['hold-project', aliasA, 'project_dead_owner']);
    children.add(holder);
    const held = await nextMessage(holder, 'locked');
    holder.kill('SIGKILL');
    await waitForExit(holder);

    // The heartbeat is FRESH (the owner just died); only ESRCH says stale.
    const inspection = inspectProjectBoundaryLock(aliasB, 'project_dead_owner');
    expect(inspection).toMatchObject({ exists: true, stale: true, ownerDead: true });
    expect(fs.existsSync(String(held.lockDir))).toBe(true); // never auto-cleared
  });

  it('never lets a live pid rescue an elapsed-stale lock (pid reuse is not freshness)', async () => {
    const bystander = spawnWorker(['hold-project', aliasA, 'project_bystander']);
    children.add(bystander);
    await nextMessage(bystander, 'locked');

    // A lock whose heartbeat is ancient but whose recorded pid happens to be a
    // LIVE process (as pid recycling produces): elapsed time must still win.
    const lock = acquireProjectBoundaryLock(aliasA, 'project_recycled_pid', 'publish');
    try {
      const ownerFile = path.join(lock.lockDir, 'owner.json');
      const owner = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
      fs.writeFileSync(ownerFile, JSON.stringify({ ...owner, pid: bystander.pid, heartbeatAt: 1 }));
      const inspection = inspectProjectBoundaryLock(aliasB, 'project_recycled_pid');
      expect(inspection.stale).toBe(true);
      expect(inspection.ownerDead).toBeUndefined();
    } finally {
      lock.release();
    }
  });

  it('clears only the exact stale project or catalog owner an operator inspected', () => {
    const fresh = acquireProjectBoundaryLock(aliasA, 'project_fresh_owner', 'publish', { now: () => 100 });
    try {
      const inspection = inspectProjectBoundaryLock(aliasB, 'project_fresh_owner', {
        staleAfterMs: 100,
        now: () => 150,
      });
      expect(inspection).toMatchObject({ exists: true, stale: false, owner: { operationId: fresh.owner.operationId } });
      expect(() => clearStaleProjectBoundaryLock(aliasB, 'project_fresh_owner', {
        staleAfterMs: 100,
        now: () => 150,
        expectedOperationId: fresh.owner.operationId,
      })).toThrow(ProjectBoundaryLockedError);
      expect(fs.existsSync(fresh.lockDir)).toBe(true);
    } finally {
      fresh.release();
    }

    const staleProject = acquireProjectBoundaryLock(aliasA, 'project_stale_owner', 'archive', { now: () => 1 });
    const staleProjectInspection = inspectProjectBoundaryLock(aliasB, 'project_stale_owner', {
      staleAfterMs: 10,
      now: () => 1_000,
    });
    expect(staleProjectInspection).toMatchObject({ exists: true, stale: true });
    expect(() => clearStaleProjectBoundaryLock(aliasB, 'project_stale_owner', {
      staleAfterMs: 10,
      now: () => 1_000,
    })).toThrow(/expectedOperationId/);
    expect(() => clearStaleProjectBoundaryLock(aliasB, 'project_stale_owner', {
      staleAfterMs: 10,
      now: () => 1_000,
      expectedOperationId: 'a-different-owner',
    })).toThrow(/owner changed/);
    const clearedProject = clearStaleProjectBoundaryLock(aliasB, 'project_stale_owner', {
      staleAfterMs: 10,
      now: () => 1_000,
      expectedOperationId: staleProject.owner.operationId,
    });
    expect(clearedProject).toMatchObject({ cleared: true, inspection: { stale: true } });
    expect(inspectProjectBoundaryLock(aliasA, 'project_stale_owner').exists).toBe(false);
    const replacementProjectOwner = acquireProjectBoundaryLock(aliasB, 'project_stale_owner', 'recovery');
    replacementProjectOwner.release();

    const staleCatalog = acquireCatalogBoundaryLock(aliasA, { now: () => 1 });
    const staleCatalogInspection = inspectCatalogBoundaryLock(aliasB, { staleAfterMs: 10, now: () => 1_000 });
    expect(staleCatalogInspection).toMatchObject({
      exists: true,
      stale: true,
      owner: { operationId: staleCatalog.owner.operationId },
    });
    const clearedCatalog = clearStaleCatalogBoundaryLock(aliasB, {
      staleAfterMs: 10,
      now: () => 1_000,
      expectedOperationId: staleCatalog.owner.operationId,
    });
    expect(clearedCatalog.cleared).toBe(true);
    expect(inspectCatalogBoundaryLock(aliasA).exists).toBe(false);
    const replacementCatalogOwner = acquireCatalogBoundaryLock(aliasB);
    replacementCatalogOwner.release();
  });

  it('requires explicit confirmation before clearing an unreadable stale owner', () => {
    const stale = acquireProjectBoundaryLock(aliasA, 'project_unreadable_owner', 'archive', { now: () => 1 });
    fs.writeFileSync(path.join(stale.lockDir, 'owner.json'), '{not-json');
    const old = new Date(0);
    fs.utimesSync(stale.lockDir, old, old);

    const inspection = inspectProjectBoundaryLock(aliasB, 'project_unreadable_owner', {
      staleAfterMs: 10,
      now: () => 1_000,
    });
    expect(inspection).toMatchObject({ exists: true, stale: true, unreadableOwner: true });
    expect(() => clearStaleProjectBoundaryLock(aliasB, 'project_unreadable_owner', {
      staleAfterMs: 10,
      now: () => 1_000,
    })).toThrow(/allowUnreadableOwner=true/);
    expect(clearStaleProjectBoundaryLock(aliasB, 'project_unreadable_owner', {
      staleAfterMs: 10,
      now: () => 1_000,
      allowUnreadableOwner: true,
    }).cleared).toBe(true);
  });

  it('journals a recoverable archive and keeps the completed tombstone as the resurrection barrier', () => {
    const lock = acquireProjectBoundaryLock(aliasA, 'project_journal', 'archive');
    try {
      createProjectArchiveTombstone(lock, {
        archiveDir: 'trash/projects/project_journal_op',
        moves: archiveMoves('project_journal', 'trash/projects/project_journal_op'),
      });

      expect(() => markProjectArchiveComplete(lock)).toThrow(ProjectArchiveJournalError);
      markProjectArchiveMove(lock, 'project_project_journal.json', 'restored');
      markProjectArchiveMove(lock, 'nit/project_journal.json', 'missing');
      markOtherArchiveMovesMissing(lock, [
        'project_project_journal.json',
        'nit/project_journal.json',
      ]);
      markProjectArchiveCatalogRemoved(lock);
      // A rollback-restored source cannot be mislabeled as a completed
      // archive even though no journal entries remain "pending".
      expect(() => markProjectArchiveComplete(lock)).toThrow(ProjectArchiveJournalError);
      markProjectArchiveMove(lock, 'project_project_journal.json', 'moved');
      const completed = markProjectArchiveComplete(lock);
      expect(completed.state).toBe('archived');
    } finally {
      lock.release();
    }

    const durable = readProjectArchiveTombstone(aliasB, 'project_journal');
    expect(durable).toMatchObject({
      state: 'archived',
      journal: {
        catalog: 'removed',
        moves: expect.arrayContaining([
          expect.objectContaining({ from: 'project_project_journal.json', status: 'moved' }),
          expect.objectContaining({ from: 'nit/project_journal.json', status: 'missing' }),
        ]),
      },
    });
    expect(() => assertProjectNotTombstoned(aliasB, 'project_journal')).toThrow(ProjectTombstonedError);
  });

  it('binds archive journals to the target project and rejects a forged catalog/other-world move', () => {
    const projectId = 'project_forged_journal';
    const lock = acquireProjectBoundaryLock(aliasA, projectId, 'archive');
    const archiveDir = `trash/projects/${projectId}_op`;
    try {
      expect(() => createProjectArchiveTombstone(lock, {
        archiveDir: 'trash/projects/different_project_op',
        moves: [{
          from: `project_${projectId}.json`,
          to: `trash/projects/different_project_op/project_${projectId}.json`,
        }],
      })).toThrow(/project-owned directory/);
      expect(() => createProjectArchiveTombstone(lock, {
        archiveDir,
        moves: [{ from: 'projects.json', to: `${archiveDir}/projects.json` }],
      })).toThrow(/not owned/);
      expect(() => createProjectArchiveTombstone(lock, {
        archiveDir,
        moves: archiveMoves(projectId, archiveDir).slice(1),
      })).toThrow(/must contain exactly/);

      createProjectArchiveTombstone(lock, {
        archiveDir,
        moves: archiveMoves(projectId, archiveDir),
      });
    } finally {
      lock.release();
    }

    const marker = projectArchiveTombstonePath(aliasA, projectId);
    const forged = JSON.parse(fs.readFileSync(marker, 'utf8'));
    fs.writeFileSync(marker, JSON.stringify({
      ...forged,
      journal: { ...forged.journal, moves: forged.journal.moves.slice(1) },
    }));
    expect(() => readProjectArchiveTombstone(aliasB, projectId)).toThrow(ProjectTombstonedError);
    fs.writeFileSync(marker, JSON.stringify(forged));
    forged.journal.moves[0] = {
      from: 'projects.json',
      to: `${archiveDir}/projects.json`,
      status: 'moved',
    };
    fs.writeFileSync(marker, JSON.stringify(forged));
    const catalogBefore = JSON.stringify([project(projectId), project('project_survivor')]);
    fs.writeFileSync(path.join(shared, 'projects.json'), catalogBefore);
    const otherWorld = path.join(shared, 'project_project_survivor.json');
    fs.writeFileSync(otherWorld, JSON.stringify({ sentinel: 'untouched' }));
    fs.mkdirSync(path.join(shared, archiveDir), { recursive: true });
    fs.writeFileSync(path.join(shared, archiveDir, 'projects.json'), '[]');

    expect(() => readProjectArchiveTombstone(aliasB, projectId)).toThrow(ProjectTombstonedError);
    expect(() => restoreProjectArchive(aliasB, projectId, {
      confirmProjectId: projectId,
      expectedTombstoneOperationId: forged.operationId,
      reason: 'forged journals must never reach the copy loop',
    })).toThrow(/No archive tombstone/);
    expect(fs.readFileSync(path.join(shared, 'projects.json'), 'utf8')).toBe(catalogBefore);
    expect(JSON.parse(fs.readFileSync(otherWorld, 'utf8'))).toEqual({ sentinel: 'untouched' });
    expect(fs.existsSync(marker)).toBe(true);
  });

  it('permits catalog rollback only while the tombstoned project boundary is owned', () => {
    const lock = acquireProjectBoundaryLock(aliasA, 'project_restore', 'archive');
    try {
      createProjectArchiveTombstone(lock, {
        archiveDir: 'trash/projects/project_restore_op',
        moves: archiveMoves('project_restore', 'trash/projects/project_restore_op'),
      });
      const restored = filterTombstonedProjectsForRestore(
        aliasB,
        [project('project_restore'), project('project_other')],
        lock,
      );
      expect(restored.map(item => item.id)).toEqual(['project_restore', 'project_other']);
    } finally {
      lock.release();
    }
  });

  it('refuses tombstone bypass by a different lock until an explicit restore/recovery adoption', () => {
    const original = acquireProjectBoundaryLock(aliasA, 'project_adopt', 'archive');
    const originalOperationId = original.owner.operationId;
    createProjectArchiveTombstone(original, {
      archiveDir: 'trash/projects/project_adopt_op',
      moves: archiveMoves('project_adopt', 'trash/projects/project_adopt_op'),
    });
    original.release();

    const publish = acquireProjectBoundaryLock(aliasB, 'project_adopt', 'publish');
    try {
      expect(() => filterTombstonedProjectsForRestore(
        aliasA,
        [project('project_adopt')],
        publish,
      )).toThrow(/publish boundary cannot bypass/);
      expect(() => adoptProjectArchiveTombstone(publish, {
        expectedOperationId: originalOperationId,
        reason: 'operator chose restore',
      })).toThrow(/publish boundary cannot adopt/);
      expect(() => removeProjectArchiveTombstone(publish)).toThrow(/publish boundary cannot remove/);
    } finally {
      publish.release();
    }

    const restore = acquireProjectBoundaryLock(aliasB, 'project_adopt', 'restore');
    try {
      expect(() => filterTombstonedProjectsForRestore(
        aliasA,
        [project('project_adopt')],
        restore,
      )).toThrow(/is not owned by lock/);
      expect(() => removeProjectArchiveTombstone(restore)).toThrow(/is not owned by lock/);
      expect(() => adoptProjectArchiveTombstone(restore, {
        expectedOperationId: 'wrong-operation',
        reason: 'operator chose restore',
      })).toThrow(/expected wrong-operation/);

      const adopted = adoptProjectArchiveTombstone(restore, {
        expectedOperationId: originalOperationId,
        reason: 'operator verified the archived file pairs',
      });
      expect(adopted).toMatchObject({
        operationId: restore.owner.operationId,
        state: 'archiving',
        owner: { purpose: 'restore' },
        adoptionHistory: [{
          previousOperationId: originalOperationId,
          previousState: 'archiving',
          adoptedBy: { operationId: restore.owner.operationId, purpose: 'restore' },
          reason: 'operator verified the archived file pairs',
        }],
      });
      expect(filterTombstonedProjectsForRestore(
        aliasA,
        [project('project_adopt'), project('project_other')],
        restore,
      ).map(item => item.id)).toEqual(['project_adopt', 'project_other']);
      removeProjectArchiveTombstone(restore);
    } finally {
      restore.release();
    }
  });

  it('clears an abandoned archive owner and adopts its valid journal for recovery', () => {
    const abandoned = acquireProjectBoundaryLock(aliasA, 'project_recovery_adopt', 'archive', { now: () => 1 });
    const abandonedOperationId = abandoned.owner.operationId;
    createProjectArchiveTombstone(abandoned, {
      archiveDir: 'trash/projects/project_recovery_adopt_op',
      moves: archiveMoves('project_recovery_adopt', 'trash/projects/project_recovery_adopt_op'),
    });

    const inspection = inspectProjectBoundaryLock(aliasB, 'project_recovery_adopt', {
      staleAfterMs: 10,
      now: () => 1_000,
    });
    expect(clearStaleProjectBoundaryLock(aliasB, 'project_recovery_adopt', {
      staleAfterMs: 10,
      now: () => 1_000,
      expectedOperationId: inspection.owner!.operationId,
    }).cleared).toBe(true);

    const recovery = acquireProjectBoundaryLock(aliasB, 'project_recovery_adopt', 'recovery');
    try {
      const adopted = adoptProjectArchiveTombstone(recovery, {
        expectedOperationId: abandonedOperationId,
        reason: 'previous process was confirmed stopped',
      });
      expect(adopted).toMatchObject({
        operationId: recovery.owner.operationId,
        state: 'recovery-required',
        error: 'Adopted for recovery: previous process was confirmed stopped',
      });
      markProjectArchiveMove(recovery, 'project_project_recovery_adopt.json', 'restored');
      expect(readProjectArchiveTombstone(aliasA, 'project_recovery_adopt'))
        .toMatchObject({
          journal: {
            moves: expect.arrayContaining([
              expect.objectContaining({
                from: 'project_project_recovery_adopt.json',
                status: 'restored',
              }),
            ]),
          },
        });
      removeProjectArchiveTombstone(recovery);
    } finally {
      recovery.release();
    }
  });

  it('removes its own partial tombstone on creation failure and fails closed if cleanup also fails', () => {
    const cleanedProjectId = 'project_partial_cleaned';
    const cleanedLock = acquireProjectBoundaryLock(aliasA, cleanedProjectId, 'archive');
    const cleanedMarker = projectArchiveTombstonePath(aliasA, cleanedProjectId);
    const fsyncFailure = jest.spyOn(fs, 'fsyncSync').mockImplementationOnce(() => {
      throw new Error('injected tombstone fsync failure');
    });
    try {
      expect(() => createProjectArchiveTombstone(cleanedLock, {
        archiveDir: 'trash/projects/project_partial_cleaned_op',
        moves: archiveMoves('project_partial_cleaned', 'trash/projects/project_partial_cleaned_op'),
      })).toThrow(/injected tombstone fsync failure/);
    } finally {
      fsyncFailure.mockRestore();
      cleanedLock.release();
    }
    expect(fs.existsSync(cleanedMarker)).toBe(false);

    const blockedProjectId = 'project_partial_blocked';
    const blockedLock = acquireProjectBoundaryLock(aliasA, blockedProjectId, 'archive');
    const blockedMarker = projectArchiveTombstonePath(aliasA, blockedProjectId);
    const realUnlink = fs.unlinkSync.bind(fs);
    const fsyncFailureWithCleanupFailure = jest.spyOn(fs, 'fsyncSync').mockImplementationOnce(() => {
      throw new Error('injected tombstone fsync failure');
    });
    const unlinkFailure = jest.spyOn(fs, 'unlinkSync').mockImplementation(((target: fs.PathLike) => {
      if (String(target) === blockedMarker) throw new Error('injected marker cleanup failure');
      return realUnlink(target);
    }) as typeof fs.unlinkSync);
    try {
      expect(() => createProjectArchiveTombstone(blockedLock, {
        archiveDir: 'trash/projects/project_partial_blocked_op',
        moves: archiveMoves('project_partial_blocked', 'trash/projects/project_partial_blocked_op'),
      })).toThrow(/partial marker could not be removed; explicit recovery is required/);
      expect(fs.existsSync(blockedMarker)).toBe(true);
      expect(() => assertProjectNotTombstoned(aliasB, blockedProjectId)).toThrow(ProjectTombstonedError);
    } finally {
      unlinkFailure.mockRestore();
      fsyncFailureWithCleanupFailure.mockRestore();
      if (fs.existsSync(blockedMarker)) fs.unlinkSync(blockedMarker);
      blockedLock.release();
    }
  });

  it('checks the tombstone inside the project publication lock and filters stale catalog caches under the catalog lock', async () => {
    const staleAdapter = new FileStorageAdapter(aliasA);
    const archiveAdapter = new FileStorageAdapter(aliasB);
    const archivedProject = project('project_archived', 'Do not resurrect');
    const survivor = project('project_survivor', 'Keep me');

    await staleAdapter.saveProjects([archivedProject, survivor]);
    // Populate a checkout-local stale cache before the other checkout archives.
    expect((await staleAdapter.loadProjects()).map(item => item.id)).toContain('project_archived');

    const original = { ...createEmptyProjectData(), entities: [{ id: 'before', name: 'Before archive', type: 'character' }] };
    await staleAdapter.saveProjectData('project_archived', original);

    const lock = acquireProjectBoundaryLock(aliasB, 'project_archived', 'archive');
    try {
      createProjectArchiveTombstone(lock, {
        archiveDir: 'trash/projects/project_archived_op',
        moves: archiveMoves('project_archived', 'trash/projects/project_archived_op'),
      });
      markProjectArchiveMove(lock, 'project_project_archived.json', 'moved');
      markOtherArchiveMovesMissing(lock, ['project_project_archived.json']);
      markProjectArchiveCatalogRemoved(lock);
      markProjectArchiveComplete(lock);
    } finally {
      lock.release();
    }

    const replacement = { ...createEmptyProjectData(), entities: [{ id: 'after', name: 'Resurrected', type: 'character' }] };
    await expect(staleAdapter.saveProjectData('project_archived', replacement)).rejects.toBeInstanceOf(ProjectTombstonedError);

    // The stale adapter tries to republish the exact old catalog. Its catalog
    // write re-reads durable tombstone filenames while holding the shared lock.
    await staleAdapter.saveProjects([archivedProject, survivor]);
    const catalog = JSON.parse(fs.readFileSync(path.join(shared, 'projects.json'), 'utf8')) as Project[];
    expect(catalog.map(item => item.id)).toEqual(['project_survivor']);
    expect((await archiveAdapter.loadProjects()).map(item => item.id)).toEqual(['project_survivor']);

    const persisted = JSON.parse(fs.readFileSync(path.join(shared, 'project_project_archived.json'), 'utf8'));
    expect(persisted.entities.map((entity: any) => entity.id)).toEqual(['before']);
    expect(fs.existsSync(projectArchiveTombstonePath(aliasA, 'project_archived'))).toBe(true);
  });

  it('makes catalog ownership cross-process as well as process-local', async () => {
    const adapter = new FileStorageAdapter(aliasB);
    const archived = project('project_catalog_race');
    const survivor = project('project_catalog_survivor');
    await adapter.saveProjects([archived, survivor]);

    const holder = spawnWorker(['hold-catalog', aliasA]);
    children.add(holder);
    await nextMessage(holder, 'locked');

    const contender = spawnWorker(['try-catalog', aliasB]);
    children.add(contender);
    const blocked = await nextMessage(contender);
    expect(blocked).toMatchObject({ type: 'error', code: 'PROJECT_BOUNDARY_LOCKED', stale: false });
    await waitForExit(contender);

    // This adapter begins with a stale list but cannot reach the publication
    // boundary while the other process owns it. Claim a tombstone during that
    // wait; filtering after acquisition must see it.
    const pendingCatalogSave = adapter.saveProjects([archived, survivor]);
    const projectLock = acquireProjectBoundaryLock(aliasA, archived.id, 'archive');
    try {
      createProjectArchiveTombstone(projectLock, {
        archiveDir: 'trash/projects/project_catalog_race_op',
        moves: archiveMoves('project_catalog_race', 'trash/projects/project_catalog_race_op'),
      });
    } finally {
      projectLock.release();
    }

    const released = nextMessage(holder, 'released');
    holder.send({ type: 'release' });
    await released;
    await waitForExit(holder);
    await pendingCatalogSave;

    const catalog = JSON.parse(fs.readFileSync(path.join(shared, 'projects.json'), 'utf8')) as Project[];
    expect(catalog.map(item => item.id)).toEqual(['project_catalog_survivor']);
  });

  it('treats tombstone filtering as a reversible view instead of destroying the raw cache', async () => {
    const adapter = new FileStorageAdapter(aliasA);
    const rollback = project('project_rollback');
    const survivor = project('project_rollback_survivor');
    await adapter.saveProjects([rollback, survivor]);

    const lock = acquireProjectBoundaryLock(aliasB, rollback.id, 'archive');
    try {
      createProjectArchiveTombstone(lock, {
        archiveDir: 'trash/projects/project_rollback_op',
        moves: archiveMoves('project_rollback', 'trash/projects/project_rollback_op'),
      });

      expect((await adapter.loadProjects()).map(item => item.id)).toEqual([survivor.id]);

      // A verified rollback removes the marker last. The same adapter must be
      // able to reveal its untouched raw snapshot immediately afterwards.
      removeProjectArchiveTombstone(lock);
      expect((await adapter.loadProjects()).map(item => item.id)).toEqual([rollback.id, survivor.id]);
    } finally {
      if (fs.existsSync(projectArchiveTombstonePath(aliasB, rollback.id))) {
        removeProjectArchiveTombstone(lock);
      }
      lock.release();
    }
  });

  it('merges stale public catalog saves without deleting durable rows omitted from the filtered input', async () => {
    const staleAdapter = new FileStorageAdapter(aliasA);
    const otherCheckout = new FileStorageAdapter(aliasB);
    const first = project('project_merge_first');
    const omitted = project('project_merge_omitted');
    const external = project('project_merge_external');

    await staleAdapter.saveProjects([first, omitted]);
    await staleAdapter.loadProjects(); // pin the checkout-local snapshot
    await otherCheckout.saveProjects([external]);

    // This intentionally resembles a stale, filtered bulk payload: it knows
    // about only one old row. Omission is no longer a destructive instruction.
    await staleAdapter.saveProjects([{ ...first, name: 'Upserted safely' }]);

    const durable = JSON.parse(fs.readFileSync(path.join(shared, 'projects.json'), 'utf8')) as Project[];
    expect(durable.map(item => item.id)).toEqual([first.id, omitted.id, external.id]);
    expect(durable.find(item => item.id === first.id)?.name).toBe('Upserted safely');
  });

  it('refreshes public catalog reads when another checkout creates or edits a project', async () => {
    const firstCheckout = new FileStorageAdapter(aliasA);
    const otherCheckout = new FileStorageAdapter(aliasB);
    const original = project('project_refresh_original', 'Original name');

    await firstCheckout.saveProjects([original]);
    expect((await firstCheckout.loadProjects()).map(item => item.id)).toEqual([original.id]);

    const external = project('project_refresh_external', 'External world');
    await otherCheckout.saveProjects([external]);
    await otherCheckout.updateProject(original.id, { name: 'Edited elsewhere' });

    const refreshed = await firstCheckout.loadProjects();
    expect(refreshed.map(item => item.id)).toEqual([original.id, external.id]);
    expect(refreshed.find(item => item.id === original.id)?.name).toBe('Edited elsewhere');
  });

  it('rejects a stale world snapshot instead of overwriting a later checkout revision', async () => {
    const firstCheckout = new FileStorageAdapter(aliasA);
    const otherCheckout = new FileStorageAdapter(aliasB);
    const projectId = 'project_world_cas';
    await firstCheckout.saveProjects([project(projectId)]);
    await firstCheckout.saveProjectData(projectId, createEmptyProjectData());

    const stale = await firstCheckout.loadProjectData(projectId);
    const current = await otherCheckout.loadProjectData(projectId);
    current.entities.push({ id: 'other-checkout', name: 'Other Checkout', type: 'character' });
    await otherCheckout.saveProjectData(projectId, current);

    stale.entities.push({ id: 'stale-checkout', name: 'Stale Checkout', type: 'character' });
    await expect(firstCheckout.saveProjectData(projectId, stale)).rejects.toThrow(/stale write was refused/);

    const durable = JSON.parse(fs.readFileSync(path.join(shared, `project_${projectId}.json`), 'utf8'));
    expect(durable.entities.map((entity: any) => entity.id)).toEqual(['other-checkout']);
    expect((await firstCheckout.loadProjectData(projectId)).entities.map(entity => entity.id))
      .toEqual(['other-checkout']);
  });

  it('fails closed on corrupt or backup-only project data instead of returning an empty world', async () => {
    const adapter = new FileStorageAdapter(aliasA);
    const corruptId = 'project_corrupt_world';
    fs.writeFileSync(path.join(shared, `project_${corruptId}.json`), '{not-json');
    await expect(adapter.loadProjectData(corruptId)).rejects.toThrow(/refusing an empty fallback/);

    const backupOnlyId = 'project_backup_only_world';
    fs.writeFileSync(
      path.join(shared, `project_${backupOnlyId}.json.bak`),
      JSON.stringify({ ...createEmptyProjectData(), entities: [{ id: 'backup-survivor' }] }),
    );
    await expect(adapter.loadProjectData(backupOnlyId)).rejects.toThrow(/backup exists/);
  });

  it('uses fresh targeted catalog mutations for create, update, activation, and stats', async () => {
    const staleAdapter = new FileStorageAdapter(aliasA);
    const otherCheckout = new FileStorageAdapter(aliasB);
    const alpha = project('project_target_alpha');
    const beta = project('project_target_beta');
    await staleAdapter.saveProjects([alpha, beta]);
    await staleAdapter.loadProjects();

    const externalUpdate = project('project_external_update');
    await otherCheckout.saveProjects([externalUpdate]);
    await staleAdapter.updateProject(alpha.id, { name: 'Fresh update' });
    let durable = JSON.parse(fs.readFileSync(path.join(shared, 'projects.json'), 'utf8')) as Project[];
    expect(durable.map(item => item.id)).toEqual([alpha.id, beta.id, externalUpdate.id]);
    expect(durable.find(item => item.id === alpha.id)?.name).toBe('Fresh update');

    const externalCreate = project('project_external_create');
    await otherCheckout.saveProjects([externalCreate]);
    const created = await staleAdapter.createProject({
      ...project('project_target_created'),
      id: 'project_target_created',
    });
    durable = JSON.parse(fs.readFileSync(path.join(shared, 'projects.json'), 'utf8')) as Project[];
    expect(durable.map(item => item.id)).toEqual([
      alpha.id,
      beta.id,
      externalUpdate.id,
      externalCreate.id,
      created.id,
    ]);

    const externalActive = project('project_external_active');
    await otherCheckout.saveProjects([externalActive]);
    await staleAdapter.setActiveProject(beta.id);
    durable = JSON.parse(fs.readFileSync(path.join(shared, 'projects.json'), 'utf8')) as Project[];
    expect(durable.map(item => item.id)).toContain(externalActive.id);
    expect(durable.filter(item => item.isActive).map(item => item.id)).toEqual([beta.id]);

    const externalStats = project('project_external_stats');
    await otherCheckout.saveProjects([externalStats]);
    await staleAdapter.saveProjectData(alpha.id, {
      ...createEmptyProjectData(),
      entities: [{ id: 'entity_stats', name: 'Count me', type: 'character' }],
    });
    durable = JSON.parse(fs.readFileSync(path.join(shared, 'projects.json'), 'utf8')) as Project[];
    expect(durable.map(item => item.id)).toContain(externalStats.id);
    expect(durable.find(item => item.id === alpha.id)?.stats.entities).toBe(1);
  });

  it('rechecks the archive boundary before returning empty data from a missing-file path', async () => {
    const adapter = new FileStorageAdapter(aliasA);
    const projectId = 'project_missing_race';
    // Match the adapter's intentionally lexical symlink spelling; the two
    // aliases converge at the filesystem, not through path.resolve().
    const projectFile = path.join(aliasA, `project_${projectId}.json`);
    const lock = acquireProjectBoundaryLock(aliasB, projectId, 'archive');
    const originalStatSync = fs.statSync.bind(fs);
    let injected = false;
    const stat = jest.spyOn(fs, 'statSync').mockImplementation(((candidate: fs.PathLike, options?: any) => {
      if (!injected && path.resolve(String(candidate)) === path.resolve(projectFile)) {
        injected = true;
        createProjectArchiveTombstone(lock, {
          archiveDir: 'trash/projects/project_missing_race_op',
          moves: archiveMoves(projectId, 'trash/projects/project_missing_race_op'),
        });
        const missing: NodeJS.ErrnoException = new Error('injected missing file');
        missing.code = 'ENOENT';
        throw missing;
      }
      return originalStatSync(candidate, options);
    }) as typeof fs.statSync);

    try {
      await expect(adapter.loadProjectData(projectId)).rejects.toBeInstanceOf(ProjectTombstonedError);
      expect(injected).toBe(true);
    } finally {
      stat.mockRestore();
      if (fs.existsSync(projectArchiveTombstonePath(aliasB, projectId))) {
        removeProjectArchiveTombstone(lock);
      }
      lock.release();
    }
  });

  it('hard-disables direct deletion and leaves both catalog and project data intact', async () => {
    const adapter = new FileStorageAdapter(aliasA);
    const victim = project('project_no_direct_delete');
    await adapter.saveProjects([victim]);
    await adapter.saveProjectData(victim.id, createEmptyProjectData());

    await expect(adapter.deleteProject(victim.id)).rejects.toThrow('recoverable project archive API');

    const durable = JSON.parse(fs.readFileSync(path.join(shared, 'projects.json'), 'utf8')) as Project[];
    expect(durable.map(item => item.id)).toContain(victim.id);
    expect(fs.existsSync(path.join(shared, `project_${victim.id}.json`))).toBe(true);
  });

  it('treats an unreadable tombstone as present instead of reopening the project', () => {
    const tombstone = projectArchiveTombstonePath(aliasA, 'project_corrupt');
    fs.mkdirSync(path.dirname(tombstone), { recursive: true });
    fs.writeFileSync(tombstone, '{not-json');

    expect(() => assertProjectNotTombstoned(aliasB, 'project_corrupt')).toThrow(ProjectTombstonedError);
  });
});
