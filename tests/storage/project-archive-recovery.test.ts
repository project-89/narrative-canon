import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { atomicWriteJsonSync } from '../../src/storage/atomic-write';
import { commitContentHash, workingTreeHash } from '../../src/git/format/v1/canonicalize';
import {
  acquireCatalogBoundaryLock,
  acquireProjectBoundaryLock,
  createProjectArchiveTombstone,
  inspectCatalogBoundaryLock,
  inspectProjectBoundaryLock,
  markProjectArchiveCatalogRemoved,
  markProjectArchiveComplete,
  markProjectArchiveMove,
  projectArchiveTombstonePath,
  readProjectArchiveTombstone,
} from '../../src/storage/project-archive-boundary';
import {
  inspectProjectArchiveRecovery,
  quarantineUnreadableProjectArchiveTombstone,
  restoreProjectArchive,
  validateRecoveryNitArtifact,
  validateRecoveryWorldNitCoherence,
} from '../../src/storage/project-archive-recovery';
import { Project } from '../../src/storage/storage-adapter';

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

it('rejects a canon ledger whose parent hash is absent from the commit set', () => {
  const missingParent = 'a'.repeat(64);
  const child = 'b'.repeat(64);
  expect(validateRecoveryNitArtifact({
    commits: [{ hash: child, parentHashes: [missingParent] }],
    branches: { main: { headHash: child, lastSnapshot: {} } },
  })).toEqual({
    valid: false,
    error: `Nit commit 0 points to missing parent ${missingParent}`,
  });
});

it('rejects canon commits that are unreachable from every branch head', () => {
  const root = '1'.repeat(64);
  const head = '2'.repeat(64);
  const orphan = '3'.repeat(64);
  expect(validateRecoveryNitArtifact({
    commits: [
      { hash: root },
      { hash: head, parentHashes: [root] },
      { hash: orphan },
    ],
    branches: { main: { headHash: head, lastSnapshot: {} } },
  })).toEqual({
    valid: false,
    error: `Nit commit is unreachable from every branch head: ${orphan}`,
  });
});

const replayTimestamp = '2026-08-01T00:00:00.000Z';
const replayEntity = (id: string) => ({
  id,
  name: id,
  type: 'character' as const,
  createdAt: replayTimestamp,
  updatedAt: replayTimestamp,
});
const replaySnapshot = (entities: ReturnType<typeof replayEntity>[] = []) => ({
  formatVersion: '1.1.0',
  metadata: {
    id: 'recovery-proof',
    title: 'Recovery proof',
    createdAt: replayTimestamp,
    updatedAt: replayTimestamp,
  },
  entities,
  relationships: [],
  scenes: [],
});
const replayCommit = (
  parentHashes: string[],
  operations: any[],
  snapshot: ReturnType<typeof replaySnapshot>,
  timestamp: number,
) => {
  const core = {
    parentHashes,
    author: { kind: 'system' as const, name: 'Recovery test' },
    timestamp,
    message: `replay ${timestamp}`,
    branch: 'main',
    operations,
  };
  return {
    ...core,
    hash: commitContentHash(core),
    workingTreeHash: workingTreeHash(snapshot),
  };
};

it('rejects a hash-valid commit whose operations cannot reconstruct its claimed snapshot', () => {
  const snapshot = replaySnapshot([replayEntity('keeper')]);
  const commit = replayCommit([], [], snapshot, 1);

  expect(validateRecoveryNitArtifact({
    commits: [commit],
    branches: { main: { headHash: commit.hash, lastSnapshot: snapshot } },
  })).toEqual({
    valid: false,
    error: `Nit commit ${commit.hash} operations do not reconstruct its working tree under any known format version`,
  });
});

// The round-trip gate at commit time (derive.ts) deliberately carves out
// formatVersion so a schema bump mid-lineage is legal to WRITE. These prove
// the replayer can READ such a lineage — the pre-fix validator re-hashed
// every commit under the head's version and permanently refused any project
// whose genesis predated a version bump.
describe('mixed-formatVersion lineages', () => {
  const keeper = replayEntity('keeper');
  const witness = replayEntity('witness');
  const oldSnapshot = { ...replaySnapshot([keeper]), formatVersion: '1.0.0' };
  const newSnapshot = replaySnapshot([keeper, witness]); // 1.1.0

  const genesis = replayCommit([], [{ type: 'ADD_ENTITY', payload: keeper }], oldSnapshot, 1);
  const bumped = replayCommit(
    [genesis.hash],
    [{ type: 'ADD_ENTITY', payload: witness }],
    newSnapshot,
    2,
  );

  it('replays an untagged 1.0.0 genesis under a 1.1.0 head via the known-version rescue', () => {
    expect(validateRecoveryNitArtifact({
      commits: [genesis, bumped],
      branches: { main: { headHash: bumped.hash, lastSnapshot: newSnapshot } },
    })).toEqual({ valid: true });
  });

  it('replays the same lineage when commits carry their formatVersion tag', () => {
    expect(validateRecoveryNitArtifact({
      commits: [
        { ...genesis, formatVersion: '1.0.0' },
        { ...bumped, formatVersion: '1.1.0' },
      ],
      branches: { main: { headHash: bumped.hash, lastSnapshot: newSnapshot } },
    })).toEqual({ valid: true });
  });

  it('still rejects an untagged commit hashed under a version no release ever shipped', () => {
    const alienSnapshot = { ...replaySnapshot([keeper]), formatVersion: '0.9.0' };
    const alienGenesis = replayCommit([], [{ type: 'ADD_ENTITY', payload: keeper }], alienSnapshot, 1);
    const alienBumped = replayCommit(
      [alienGenesis.hash],
      [{ type: 'ADD_ENTITY', payload: witness }],
      newSnapshot,
      2,
    );
    expect(validateRecoveryNitArtifact({
      commits: [alienGenesis, alienBumped],
      branches: { main: { headHash: alienBumped.hash, lastSnapshot: newSnapshot } },
    })).toEqual({
      valid: false,
      error: `Nit commit ${alienGenesis.hash} operations do not reconstruct its working tree under any known format version`,
    });
  });

  it('rejects a tagged commit whose tag does not reproduce its stored hash', () => {
    expect(validateRecoveryNitArtifact({
      commits: [
        { ...genesis, formatVersion: '1.1.0' }, // lies: hashed under 1.0.0
        { ...bumped, formatVersion: '1.1.0' },
      ],
      branches: { main: { headHash: bumped.hash, lastSnapshot: newSnapshot } },
    })).toEqual({
      valid: false,
      error: `Nit commit ${genesis.hash} operations do not reconstruct its working tree`,
    });
  });
});

it('rejects a valid ledger head that is ahead of the world acknowledgement', () => {
  const keeper = replayEntity('keeper');
  const firstSnapshot = replaySnapshot([keeper]);
  const first = replayCommit([], [{ type: 'ADD_ENTITY', payload: keeper }], firstSnapshot, 1);
  const witness = replayEntity('witness');
  const secondSnapshot = replaySnapshot([keeper, witness]);
  const second = replayCommit(
    [first.hash],
    [{ type: 'ADD_ENTITY', payload: witness }],
    secondSnapshot,
    2,
  );

  expect(validateRecoveryWorldNitCoherence(
    worldDataWithCommits([{ id: 'world-1', branch: 'main', nitHash: first.hash }]),
    {
      commits: [first, second],
      branches: { main: { headHash: second.hash, lastSnapshot: secondSnapshot } },
    },
  )).toEqual({
    valid: false,
    error: 'Nit branch main is ahead of or divergent from the world acknowledgement',
  });
});

function worldData(marker?: string): Record<string, unknown> {
  return {
    entities: marker ? [{ id: marker }] : [],
    relationships: [],
    commits: [],
    branches: [],
    interactions: [],
  };
}

function worldDataWithCommits(commits: unknown[]): Record<string, unknown> {
  return { ...worldData(), commits };
}

interface ArchivedFixture {
  archiveDir: string;
  operationId: string;
  moves: Array<{ from: string; to: string; content?: string }>;
}

function prepareArchive(
  dataDir: string,
  projectId: string,
  options: {
    livePrimary?: boolean;
    archivePrimary?: boolean;
    primaryStatus?: 'missing' | 'moved';
  } = {},
): ArchivedFixture {
  const archiveDir = path.join('trash', 'projects', `${projectId}_archive`);
  const moves = [
    {
      from: `project_${projectId}.json`,
      to: path.join(archiveDir, `project_${projectId}.json`),
      content: JSON.stringify(worldData('archive-world')),
    },
    {
      from: `project_${projectId}.json.bak`,
      to: path.join(archiveDir, `project_${projectId}.json.bak`),
      content: JSON.stringify(worldData('archive-backup')),
    },
    {
      from: path.join('nit', `${projectId}.json`),
      to: path.join(archiveDir, 'nit', `${projectId}.json`),
      content: JSON.stringify({ version: 1, commits: [], branches: {} }),
    },
    {
      from: path.join('nit', `${projectId}.json.bak`),
      to: path.join(archiveDir, 'nit', `${projectId}.json.bak`),
    },
  ];

  const lock = acquireProjectBoundaryLock(dataDir, projectId, 'archive');
  const operationId = lock.owner.operationId;
  try {
    createProjectArchiveTombstone(lock, { archiveDir, moves });
    fs.mkdirSync(path.join(dataDir, archiveDir), { recursive: true });
    atomicWriteJsonSync(path.join(dataDir, archiveDir, 'project-metadata.json'), project(projectId), { backup: false });
    for (const move of moves) {
      const isPrimary = move.from === `project_${projectId}.json`;
      const shouldWriteArchive = move.content !== undefined
        && (!isPrimary || options.archivePrimary !== false);
      if (shouldWriteArchive) {
        const destination = path.join(dataDir, move.to);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, move.content!);
      }
      if (isPrimary && options.livePrimary) {
        fs.writeFileSync(path.join(dataDir, move.from), move.content!);
      }
      markProjectArchiveMove(lock, move.from,
        isPrimary && options.primaryStatus
          ? options.primaryStatus
          : move.content === undefined ? 'missing' : 'moved');
    }
    markProjectArchiveCatalogRemoved(lock);
    markProjectArchiveComplete(lock);
  } finally {
    lock.release();
  }
  return { archiveDir, operationId, moves };
}

function setMoveStatus(
  dataDir: string,
  projectId: string,
  operationId: string,
  from: string,
  status: 'missing' | 'moved' | 'restored',
): void {
  const marker = projectArchiveTombstonePath(dataDir, projectId);
  const tombstone = JSON.parse(fs.readFileSync(marker, 'utf8'));
  expect(tombstone.operationId).toBe(operationId);
  tombstone.journal.moves = tombstone.journal.moves.map((move: { from: string }) => (
    move.from === from ? { ...move, status } : move
  ));
  atomicWriteJsonSync(marker, tombstone, { backup: false });
}

describe('project archive operator recovery', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'narrative-archive-recovery-'));
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('inspects without creating ownership or changing the archive journal', () => {
    const projectId = 'project_inspect_only';
    const fixture = prepareArchive(dataDir, projectId);
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [project('survivor')]);
    const marker = projectArchiveTombstonePath(dataDir, projectId);
    const markerBefore = fs.readFileSync(marker, 'utf8');

    const inspection = inspectProjectArchiveRecovery(dataDir, projectId);

    expect(inspection).toMatchObject({
      projectId,
      tombstone: { operationId: fixture.operationId, state: 'archived' },
      projectLock: { exists: false },
      catalogLock: { exists: false },
      metadata: { exists: true, valid: true, project: { id: projectId } },
      canRestoreFiles: true,
    });
    expect(inspection.moves.map(move => move.disposition)).toEqual([
      'copy-from-archive',
      'copy-from-archive',
      'copy-from-archive',
      'expected-missing',
    ]);
    expect(fs.readFileSync(marker, 'utf8')).toBe(markerBefore);
    expect(inspectProjectBoundaryLock(dataDir, projectId).exists).toBe(false);
    expect(inspectCatalogBoundaryLock(dataDir).exists).toBe(false);
  });

  it('requires project-bound confirmation, restores every artifact, and preserves unrelated catalog edits', () => {
    const projectId = 'project_restore_complete';
    const fixture = prepareArchive(dataDir, projectId);
    const externallyEdited = {
      ...project('survivor', 'Edited by another checkout'),
      updatedAt: 999,
      unknownFutureField: { keep: true },
    } as Project;
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [externallyEdited]);
    const markerBefore = fs.readFileSync(projectArchiveTombstonePath(dataDir, projectId), 'utf8');

    expect(() => restoreProjectArchive(dataDir, projectId, {
      confirmProjectId: 'different_project',
      expectedTombstoneOperationId: fixture.operationId,
      reason: 'verified archive contents',
    })).toThrow(/exactly equal/);
    expect(fs.readFileSync(projectArchiveTombstonePath(dataDir, projectId), 'utf8')).toBe(markerBefore);

    const result = restoreProjectArchive(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedTombstoneOperationId: fixture.operationId,
      reason: 'verified archive contents and selected a full restore',
    });

    expect(result).toMatchObject({
      projectId,
      tombstoneRemoved: true,
      archiveArtifactsRetained: true,
      restoredFiles: fixture.moves.slice(0, 3).map(move => move.from),
      absentFiles: [fixture.moves[3].from],
    });
    for (const move of fixture.moves.slice(0, 3)) {
      expect(fs.readFileSync(path.join(dataDir, move.from), 'utf8')).toBe(move.content);
      expect(fs.readFileSync(path.join(dataDir, move.to), 'utf8')).toBe(move.content);
    }
    const catalog = JSON.parse(fs.readFileSync(path.join(dataDir, 'projects.json'), 'utf8'));
    expect(catalog).toEqual([externallyEdited, project(projectId)]);
    expect(fs.existsSync(projectArchiveTombstonePath(dataDir, projectId))).toBe(false);
    const restoreAudit = JSON.parse(fs.readFileSync(path.join(dataDir, result.auditFile), 'utf8'));
    expect(restoreAudit).toMatchObject({
      projectId,
      action: 'restore',
      reason: 'verified archive contents and selected a full restore',
      state: 'complete',
      tombstoneRemoved: true,
    });
  });

  it('clears only exact stale project and catalog owners observed by the operator', () => {
    const projectId = 'project_stale_recovery';
    const fixture = prepareArchive(dataDir, projectId);
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [project('survivor')]);
    const abandonedProject = acquireProjectBoundaryLock(dataDir, projectId, 'recovery', { now: () => 1 });
    const abandonedCatalog = acquireCatalogBoundaryLock(dataDir, { now: () => 1 });
    const clock = { staleAfterMs: 10, now: () => 1_000 };

    expect(() => restoreProjectArchive(dataDir, projectId, {
      ...clock,
      confirmProjectId: projectId,
      expectedTombstoneOperationId: fixture.operationId,
      reason: 'owners were verified stopped',
    })).toThrow(new RegExp(abandonedProject.owner.operationId));
    expect(inspectProjectBoundaryLock(dataDir, projectId, clock).exists).toBe(true);
    expect(inspectCatalogBoundaryLock(dataDir, clock).exists).toBe(true);

    const result = restoreProjectArchive(dataDir, projectId, {
      ...clock,
      confirmProjectId: projectId,
      expectedTombstoneOperationId: fixture.operationId,
      expectedProjectLockOperationId: abandonedProject.owner.operationId,
      expectedCatalogLockOperationId: abandonedCatalog.owner.operationId,
      reason: 'owners were verified stopped',
    });

    expect(result.tombstoneRemoved).toBe(true);
    expect(inspectProjectBoundaryLock(dataDir, projectId).exists).toBe(false);
    expect(inspectCatalogBoundaryLock(dataDir).exists).toBe(false);
  });

  it('resumes a crash after copy-before-journal when both copies are byte-identical', () => {
    const projectId = 'project_copy_resume';
    const fixture = prepareArchive(dataDir, projectId, { livePrimary: true });
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [project('survivor')]);

    const inspection = inspectProjectArchiveRecovery(dataDir, projectId);
    expect(inspection.moves[0].disposition).toBe('already-restored');

    const result = restoreProjectArchive(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedTombstoneOperationId: fixture.operationId,
      reason: 'resuming a verified copy-before-journal crash',
    });

    expect(result.alreadyLiveFiles).toContain(`project_${projectId}.json`);
    expect(fs.existsSync(projectArchiveTombstonePath(dataDir, projectId))).toBe(false);
  });

  it('resumes the server rollback moved/live-only crash state after validating the live primary', () => {
    const projectId = 'project_rollback_resume';
    const fixture = prepareArchive(dataDir, projectId);
    const primaryMove = fixture.moves[0];
    fs.renameSync(path.join(dataDir, primaryMove.to), path.join(dataDir, primaryMove.from));
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [project('survivor')]);

    const inspection = inspectProjectArchiveRecovery(dataDir, projectId);
    expect(inspection.moves[0]).toMatchObject({ status: 'moved', disposition: 'already-restored' });

    const result = restoreProjectArchive(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedTombstoneOperationId: fixture.operationId,
      reason: 'server rollback restored the live file before journalling it',
    });
    expect(result.alreadyLiveFiles).toContain(primaryMove.from);
  });

  it('promotes a validated backup-only archive into the required live primary', () => {
    const projectId = 'project_backup_only';
    const fixture = prepareArchive(dataDir, projectId, {
      archivePrimary: false,
      primaryStatus: 'missing',
    });
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [project('survivor')]);

    const inspection = inspectProjectArchiveRecovery(dataDir, projectId);
    expect(inspection).toMatchObject({
      canRestoreFiles: true,
      world: { canPublishPrimary: true, needsBackupPromotion: true },
    });

    const result = restoreProjectArchive(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedTombstoneOperationId: fixture.operationId,
      reason: 'the validated backup is the only durable world copy',
    });
    const primary = path.join(dataDir, `project_${projectId}.json`);
    const backup = `${primary}.bak`;
    expect(JSON.parse(fs.readFileSync(primary, 'utf8'))).toEqual(worldData('archive-backup'));
    expect(fs.readFileSync(primary)).toEqual(fs.readFileSync(backup));
    expect(result.restoredFiles).toContain(`project_${projectId}.json`);
    expect(result.absentFiles).not.toContain(`project_${projectId}.json`);
  });

  it('refuses a syntactically valid world backup that would normalize into an empty world', () => {
    const projectId = 'project_empty_world_backup';
    const fixture = prepareArchive(dataDir, projectId, {
      archivePrimary: false,
      primaryStatus: 'missing',
    });
    fs.writeFileSync(path.join(dataDir, fixture.moves[1].to), '{}');
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [project('survivor')]);

    const inspection = inspectProjectArchiveRecovery(dataDir, projectId);
    expect(inspection.canRestoreFiles).toBe(false);
    expect(inspection.world.error).toMatch(/load-bearing array/);
    expect(() => restoreProjectArchive(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedTombstoneOperationId: fixture.operationId,
      reason: 'empty shells are not worlds',
    })).toThrow(/load-bearing array/);
    expect(fs.existsSync(projectArchiveTombstonePath(dataDir, projectId))).toBe(true);
  });

  it('uses a valid backup without republishing a structurally corrupt archived primary', () => {
    const projectId = 'project_corrupt_primary_valid_backup';
    const fixture = prepareArchive(dataDir, projectId);
    fs.writeFileSync(path.join(dataDir, fixture.moves[0].to), '{}');
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [project('survivor')]);

    const inspection = inspectProjectArchiveRecovery(dataDir, projectId);
    expect(inspection).toMatchObject({
      canRestoreFiles: true,
      world: { needsBackupPromotion: true, canPublishPrimary: true },
    });
    const result = restoreProjectArchive(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedTombstoneOperationId: fixture.operationId,
      reason: 'preserve corrupt evidence and recover from the validated backup',
    });
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, `project_${projectId}.json`), 'utf8')))
      .toEqual(worldData('archive-backup'));
    expect(fs.readFileSync(path.join(dataDir, fixture.moves[0].to), 'utf8')).toBe('{}');
    expect(result.tombstoneRemoved).toBe(true);
  });

  it('promotes a validated nit backup so the reopened canon ledger is readable', () => {
    const projectId = 'project_nit_backup_only';
    const fixture = prepareArchive(dataDir, projectId);
    const nitPrimary = fixture.moves[2];
    const nitBackup = fixture.moves[3];
    fs.unlinkSync(path.join(dataDir, nitPrimary.to));
    setMoveStatus(dataDir, projectId, fixture.operationId, nitPrimary.from, 'missing');
    fs.mkdirSync(path.dirname(path.join(dataDir, nitBackup.to)), { recursive: true });
    fs.writeFileSync(path.join(dataDir, nitBackup.to), JSON.stringify({ commits: [], branches: {} }));
    setMoveStatus(dataDir, projectId, fixture.operationId, nitBackup.from, 'moved');
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [project('survivor')]);

    const inspection = inspectProjectArchiveRecovery(dataDir, projectId);
    expect(inspection).toMatchObject({
      canRestoreFiles: true,
      nit: { canPublishPrimary: true, needsBackupPromotion: true, intentionallyAbsent: false },
    });

    const result = restoreProjectArchive(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedTombstoneOperationId: fixture.operationId,
      reason: 'the nit backup is the only durable canon ledger copy',
    });
    const liveNitPrimary = path.join(dataDir, 'nit', `${projectId}.json`);
    const liveNitBackup = `${liveNitPrimary}.bak`;
    expect(fs.readFileSync(liveNitPrimary)).toEqual(fs.readFileSync(liveNitBackup));
    expect(JSON.parse(fs.readFileSync(liveNitPrimary, 'utf8'))).toEqual({ commits: [], branches: {} });
    expect(result.restoredFiles).toContain(path.join('nit', `${projectId}.json`));
    expect(fs.existsSync(projectArchiveTombstonePath(dataDir, projectId))).toBe(false);
  });

  it('refuses a stale nit backup that cannot satisfy the archived world revision', () => {
    const projectId = 'project_stale_nit_backup';
    const fixture = prepareArchive(dataDir, projectId);
    const keeper = replayEntity('keeper');
    const firstSnapshot = replaySnapshot([keeper]);
    const first = replayCommit([], [{ type: 'ADD_ENTITY', payload: keeper }], firstSnapshot, 1);
    const witness = replayEntity('witness');
    const secondSnapshot = replaySnapshot([keeper, witness]);
    const second = replayCommit(
      [first.hash],
      [{ type: 'ADD_ENTITY', payload: witness }],
      secondSnapshot,
      2,
    );

    fs.writeFileSync(
      path.join(dataDir, fixture.moves[0].to),
      JSON.stringify(worldDataWithCommits([{ id: 'world-2', branch: 'main', nitHash: second.hash }])),
    );
    const nitPrimary = fixture.moves[2];
    const nitBackup = fixture.moves[3];
    fs.unlinkSync(path.join(dataDir, nitPrimary.to));
    setMoveStatus(dataDir, projectId, fixture.operationId, nitPrimary.from, 'missing');
    fs.mkdirSync(path.dirname(path.join(dataDir, nitBackup.to)), { recursive: true });
    fs.writeFileSync(path.join(dataDir, nitBackup.to), JSON.stringify({
      commits: [first],
      branches: { main: { headHash: first.hash, lastSnapshot: firstSnapshot } },
    }));
    setMoveStatus(dataDir, projectId, fixture.operationId, nitBackup.from, 'moved');
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [project('survivor')]);

    const inspection = inspectProjectArchiveRecovery(dataDir, projectId);
    expect(inspection.canRestoreFiles).toBe(false);
    expect(inspection.nit.error).toMatch(/coherence failed.*missing world revision/i);
    expect(() => restoreProjectArchive(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedTombstoneOperationId: fixture.operationId,
      reason: 'the backup must prove the world revision before promotion',
    })).toThrow(/missing world revision/i);
    expect(fs.existsSync(projectArchiveTombstonePath(dataDir, projectId))).toBe(true);
  });

  it('refuses a parseable nit backup whose shape would reset canon history', () => {
    const projectId = 'project_bad_nit_backup';
    const fixture = prepareArchive(dataDir, projectId);
    const nitPrimary = fixture.moves[2];
    const nitBackup = fixture.moves[3];
    fs.unlinkSync(path.join(dataDir, nitPrimary.to));
    setMoveStatus(dataDir, projectId, fixture.operationId, nitPrimary.from, 'missing');
    fs.mkdirSync(path.dirname(path.join(dataDir, nitBackup.to)), { recursive: true });
    fs.writeFileSync(path.join(dataDir, nitBackup.to), JSON.stringify({ commits: 'not-an-array', branches: {} }));
    setMoveStatus(dataDir, projectId, fixture.operationId, nitBackup.from, 'moved');
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [project('survivor')]);

    const inspection = inspectProjectArchiveRecovery(dataDir, projectId);
    expect(inspection.canRestoreFiles).toBe(false);
    expect(inspection.nit.error).toMatch(/commits must be an array/);
    expect(() => restoreProjectArchive(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedTombstoneOperationId: fixture.operationId,
      reason: 'canon history must retain its structure',
    })).toThrow(/commits must be an array/);
    expect(fs.existsSync(projectArchiveTombstonePath(dataDir, projectId))).toBe(true);
  });

  it('resumes a crash after backup promotion but before the primary journal update', () => {
    const projectId = 'project_backup_promotion_resume';
    const fixture = prepareArchive(dataDir, projectId, {
      archivePrimary: false,
      primaryStatus: 'missing',
    });
    const backupMove = fixture.moves[1];
    fs.copyFileSync(path.join(dataDir, backupMove.to), path.join(dataDir, backupMove.from));
    setMoveStatus(dataDir, projectId, fixture.operationId, backupMove.from, 'restored');
    fs.copyFileSync(path.join(dataDir, backupMove.from), path.join(dataDir, `project_${projectId}.json`));
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [project('survivor')]);

    const inspection = inspectProjectArchiveRecovery(dataDir, projectId);
    expect(inspection.moves[0]).toMatchObject({ status: 'missing', disposition: 'already-restored' });
    expect(inspection.canRestoreFiles).toBe(true);

    const result = restoreProjectArchive(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedTombstoneOperationId: fixture.operationId,
      reason: 'resume after verified backup promotion',
    });
    expect(result.alreadyLiveFiles).toContain(`project_${projectId}.json`);
  });

  it.each([
    { projectId: 'project_both_different', livePrimary: true, archivePrimary: true, expected: 'ambiguous-both-present' },
    { projectId: 'project_both_missing', livePrimary: false, archivePrimary: false, expected: 'ambiguous-both-missing' },
  ])('fails closed before adoption for $expected file evidence', ({
    projectId,
    livePrimary,
    archivePrimary,
    expected,
  }) => {
    const fixture = prepareArchive(dataDir, projectId, { livePrimary, archivePrimary });
    if (livePrimary && archivePrimary) {
      fs.writeFileSync(path.join(dataDir, fixture.moves[0].from), JSON.stringify({ different: true }));
    }
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [project('survivor')]);

    expect(() => restoreProjectArchive(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedTombstoneOperationId: fixture.operationId,
      reason: 'attempted after inspection',
    })).toThrow(new RegExp(expected));

    expect(readProjectArchiveTombstone(dataDir, projectId)?.operationId).toBe(fixture.operationId);
    expect(fs.existsSync(projectArchiveTombstonePath(dataDir, projectId))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'projects.json'), 'utf8')))
      .toEqual([project('survivor')]);
  });

  it('requires exact evidence before clearing an unreadable stale project owner', () => {
    const projectId = 'project_unreadable_stale_recovery';
    const fixture = prepareArchive(dataDir, projectId);
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [project('survivor')]);
    const abandoned = acquireProjectBoundaryLock(dataDir, projectId, 'recovery', { now: () => 1 });
    fs.writeFileSync(path.join(abandoned.lockDir, 'owner.json'), '{not-json');
    const old = new Date(0);
    fs.utimesSync(abandoned.lockDir, old, old);
    const clock = { staleAfterMs: 10, now: () => 1_000 };
    const evidenceAt = inspectProjectBoundaryLock(dataDir, projectId, clock).evidenceAt;

    expect(() => restoreProjectArchive(dataDir, projectId, {
      ...clock,
      confirmProjectId: projectId,
      expectedTombstoneOperationId: fixture.operationId,
      reason: 'operator inspected the unreadable owner',
    })).toThrow(new RegExp(`evidenceAt=${evidenceAt}`));

    const result = restoreProjectArchive(dataDir, projectId, {
      ...clock,
      confirmProjectId: projectId,
      expectedTombstoneOperationId: fixture.operationId,
      expectedUnreadableProjectLockEvidenceAt: evidenceAt,
      reason: 'operator inspected the exact unreadable stale-owner evidence',
    });
    expect(result.tombstoneRemoved).toBe(true);
  });

  it('hash-confirms and retains a corrupt tombstone only when the live world and catalog are sound', () => {
    const projectId = 'project_corrupt_quarantine';
    const marker = projectArchiveTombstonePath(dataDir, projectId);
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, '{torn-tombstone');
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [project(projectId)]);
    atomicWriteJsonSync(path.join(dataDir, `project_${projectId}.json`), worldData());

    const inspection = inspectProjectArchiveRecovery(dataDir, projectId);
    expect(inspection).toMatchObject({
      tombstone: null,
      canRestoreFiles: false,
      unreadableTombstone: { exists: true, regular: true },
    });
    const sha256 = inspection.unreadableTombstone!.sha256;
    expect(() => quarantineUnreadableProjectArchiveTombstone(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedTombstoneSha256: '0'.repeat(64),
      reason: 'wrong hash must never move the barrier',
    })).toThrow(/changed from/);
    expect(fs.existsSync(marker)).toBe(true);

    const result = quarantineUnreadableProjectArchiveTombstone(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedTombstoneSha256: sha256,
      reason: 'live world and catalog were independently verified',
    });

    expect(result).toMatchObject({
      projectId,
      tombstoneSha256: sha256,
      primaryPromotedFromBackup: false,
      corruptMarkerRetained: true,
      archiveArtifactsRetained: true,
    });
    expect(fs.existsSync(marker)).toBe(false);
    expect(fs.readFileSync(path.join(dataDir, result.quarantinedPath), 'utf8')).toBe('{torn-tombstone');
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'projects.json'), 'utf8'))).toEqual([project(projectId)]);
    const quarantineAudit = JSON.parse(fs.readFileSync(path.join(dataDir, result.auditFile), 'utf8'));
    expect(quarantineAudit).toMatchObject({
      projectId,
      action: 'quarantine-corrupt-tombstone',
      reason: 'live world and catalog were independently verified',
      state: 'complete',
      tombstoneSha256: sha256,
      corruptMarkerRetained: true,
    });
  });

  it('refuses corrupt-marker quarantine when a sidecar exists only in an archive', () => {
    const projectId = 'project_corrupt_with_orphan';
    const marker = projectArchiveTombstonePath(dataDir, projectId);
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, '{torn-tombstone');
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [project(projectId)]);
    atomicWriteJsonSync(path.join(dataDir, `project_${projectId}.json`), worldData());
    const archivedNit = path.join(
      dataDir,
      'trash',
      'projects',
      `${projectId}_partial`,
      'nit',
      `${projectId}.json`,
    );
    fs.mkdirSync(path.dirname(archivedNit), { recursive: true });
    fs.writeFileSync(archivedNit, JSON.stringify({ version: 1, commits: [], branches: {} }));
    const sha256 = inspectProjectArchiveRecovery(dataDir, projectId).unreadableTombstone!.sha256;

    expect(() => quarantineUnreadableProjectArchiveTombstone(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedTombstoneSha256: sha256,
      reason: 'must account for every archived artifact',
    })).toThrow(/Archive artifact is absent or differs/);
    expect(fs.existsSync(marker)).toBe(true);
    expect(fs.existsSync(archivedNit)).toBe(true);
  });

  it('refuses quarantine when an archived primary is newer than the stale live backup', () => {
    const projectId = 'project_corrupt_newer_archive';
    const marker = projectArchiveTombstonePath(dataDir, projectId);
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, '{torn-after-primary-move');
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [project(projectId)]);
    atomicWriteJsonSync(path.join(dataDir, `project_${projectId}.json.bak`), {
      ...worldData(),
      revision: 'old',
    });
    const archivedPrimary = path.join(
      dataDir,
      'trash',
      'projects',
      `${projectId}_partial`,
      `project_${projectId}.json`,
    );
    fs.mkdirSync(path.dirname(archivedPrimary), { recursive: true });
    atomicWriteJsonSync(archivedPrimary, { ...worldData(), revision: 'new' }, { backup: false });
    const sha256 = inspectProjectArchiveRecovery(dataDir, projectId).unreadableTombstone!.sha256;

    expect(() => quarantineUnreadableProjectArchiveTombstone(dataDir, projectId, {
      confirmProjectId: projectId,
      expectedTombstoneSha256: sha256,
      reason: 'must not reopen an older backup over newer archived bytes',
    })).toThrow(/Archive artifact is absent or differs/);
    expect(fs.existsSync(marker)).toBe(true);
    expect(JSON.parse(fs.readFileSync(archivedPrimary, 'utf8'))).toEqual({ ...worldData(), revision: 'new' });
  });

  it('exposes the guarded corrupt-marker workflow through the operator CLI', () => {
    const projectId = 'project_cli_quarantine';
    const marker = projectArchiveTombstonePath(dataDir, projectId);
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, '{cli-torn-marker');
    atomicWriteJsonSync(path.join(dataDir, 'projects.json'), [project(projectId)]);
    atomicWriteJsonSync(path.join(dataDir, `project_${projectId}.json.bak`), worldData());
    const repoRoot = path.resolve(__dirname, '../..');
    const tsx = path.join(repoRoot, 'node_modules', '.bin', 'tsx');
    const script = path.join(repoRoot, 'scripts', 'project-archive-recovery.ts');

    const help = spawnSync(tsx, [script, 'help'], { cwd: repoRoot, encoding: 'utf8' });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('quarantine <projectId>');
    expect(help.stdout).toContain('--tombstone-sha256 <sha256>');

    const inspect = spawnSync(tsx, [script, 'inspect', projectId, '--data-dir', dataDir], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(inspect.status).toBe(0);
    const inspected = JSON.parse(inspect.stdout);
    const sha256 = inspected.unreadableTombstone.sha256 as string;

    const quarantine = spawnSync(tsx, [
      script,
      'quarantine',
      projectId,
      '--confirm-project',
      projectId,
      '--tombstone-sha256',
      sha256,
      '--reason',
      'CLI operator verified the live backup and catalog',
      '--data-dir',
      dataDir,
    ], { cwd: repoRoot, encoding: 'utf8' });
    expect(quarantine.status).toBe(0);
    const result = JSON.parse(quarantine.stdout);
    expect(result).toMatchObject({
      projectId,
      tombstoneSha256: sha256,
      primaryPromotedFromBackup: true,
      corruptMarkerRetained: true,
    });
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, `project_${projectId}.json`), 'utf8')))
      .toEqual(worldData());
    expect(fs.existsSync(path.join(dataDir, result.quarantinedPath))).toBe(true);
  });
});
