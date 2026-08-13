/**
 * Crash-recovery journal for the two-file canon publication.
 *
 * A canon commit publishes the nit operation ledger first and the authoritative
 * world blob second. The project boundary prevents another checkout from
 * interleaving, but SIGKILL can still land between those two atomic renames.
 * This journal retains the exact prior nit inode (hard-link when possible) and
 * lets the next explicitly-owned project operation either finish an aligned
 * pair or roll the ledger back to the world that actually reached disk.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { assertSafeProjectId } from '../security/local-boundary';
import { atomicWriteJsonSync } from './atomic-write';
import {
  acquireProjectBoundaryLock,
  clearStaleProjectBoundaryLock,
  inspectProjectBoundaryLock,
  LockInspection,
  ProjectArchiveJournalError,
  ProjectBoundaryLock,
} from './project-archive-boundary';
import { validateRecoveryWorldNitCoherence } from './project-archive-recovery';

export interface ProjectPublicationJournal {
  version: 1;
  projectId: string;
  operationId: string;
  nextNitHash: string;
  previousNitExisted: boolean;
  previousNitSha256?: string;
  createdAt: number;
}

export interface ProjectPublicationSettlement {
  action: 'none' | 'active-current-operation' | 'completed' | 'rolled-back';
  nextNitHash?: string;
}

export interface ProjectPublicationInspection {
  projectId: string;
  lock: LockInspection;
  journal: ProjectPublicationJournal | null;
}

export interface RecoverProjectPublicationOptions {
  confirmProjectId: string;
  expectedJournalOperationId: string;
  expectedProjectLockOperationId?: string;
  allowUnreadableProjectLock?: boolean;
  reason: string;
  staleAfterMs?: number;
  now?: () => number;
}

function journalRoot(dataDir: string, projectIdInput: string): string {
  const projectId = assertSafeProjectId(projectIdInput);
  return path.join(path.resolve(dataDir), '.archive-boundary', 'publications', 'projects', projectId);
}

function activeJournalDirs(dataDir: string, projectId: string): string[] {
  const root = journalRoot(dataDir, projectId);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.endsWith('.txn'))
    .map(entry => path.join(root, entry.name));
}

function markerPath(transactionDir: string): string {
  return path.join(transactionDir, 'journal.json');
}

function previousNitPath(transactionDir: string): string {
  return path.join(transactionDir, 'nit-before.json');
}

function worldFile(dataDir: string, projectId: string): string {
  return path.join(path.resolve(dataDir), `project_${projectId}.json`);
}

function nitFile(dataDir: string, projectId: string): string {
  return path.join(path.resolve(dataDir), 'nit', `${projectId}.json`);
}

function sha256File(file: string): string {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    while (true) {
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytes === 0) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function fsyncDirectory(directory: string): void {
  const fd = fs.openSync(directory, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function assertOwnedProjectLock(lock: ProjectBoundaryLock): void {
  assertSafeProjectId(lock.projectId);
  lock.heartbeat();
}

function readJournal(transactionDir: string, projectId: string): ProjectPublicationJournal {
  const file = markerPath(transactionDir);
  if (!fs.existsSync(file)) {
    throw new ProjectArchiveJournalError(
      `Publication transaction ${transactionDir} has no readable journal; explicit recovery is required`,
    );
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as ProjectPublicationJournal;
    if (
      parsed?.version !== 1
      || parsed.projectId !== projectId
      || typeof parsed.operationId !== 'string'
      || !parsed.operationId
      || typeof parsed.nextNitHash !== 'string'
      || !/^[a-f0-9]{64}$/i.test(parsed.nextNitHash)
      || typeof parsed.previousNitExisted !== 'boolean'
      || (parsed.previousNitSha256 !== undefined && !/^[a-f0-9]{64}$/.test(parsed.previousNitSha256))
      || typeof parsed.createdAt !== 'number'
      || !Number.isFinite(parsed.createdAt)
    ) {
      throw new Error('invalid publication journal shape');
    }
    if (parsed.previousNitExisted !== Boolean(parsed.previousNitSha256)) {
      throw new Error('publication journal previous-ledger evidence is inconsistent');
    }
    return parsed;
  } catch (error: any) {
    throw new ProjectArchiveJournalError(
      `Publication journal for ${projectId} is unreadable; explicit recovery is required: ${error?.message || error}`,
    );
  }
}

export function inspectProjectPublicationJournal(
  dataDir: string,
  projectIdInput: string,
  options: Pick<RecoverProjectPublicationOptions, 'staleAfterMs' | 'now'> = {},
): ProjectPublicationInspection {
  const projectId = assertSafeProjectId(projectIdInput);
  const active = activeJournalDirs(dataDir, projectId);
  if (active.length > 1) {
    throw new ProjectArchiveJournalError(
      `Project ${projectId} has ${active.length} active publication journals; explicit filesystem review is required`,
    );
  }
  return {
    projectId,
    lock: inspectProjectBoundaryLock(dataDir, projectId, options),
    journal: active.length === 1 ? readJournal(active[0], projectId) : null,
  };
}

function jsonContainsWorldNitHash(file: string, hash: string): boolean {
  if (!fs.existsSync(file)) return false;
  let parsed: any;
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error: any) {
    throw new ProjectArchiveJournalError(`World blob is unreadable during publication recovery: ${error?.message || error}`);
  }
  return Array.isArray(parsed?.commits) && parsed.commits.some((commit: any) => commit?.nitHash === hash);
}

function jsonContainsLedgerHash(file: string, hash: string): boolean {
  if (!fs.existsSync(file)) return false;
  let parsed: any;
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error: any) {
    throw new ProjectArchiveJournalError(`Nit ledger is unreadable during publication recovery: ${error?.message || error}`);
  }
  return Array.isArray(parsed?.commits) && parsed.commits.some((commit: any) => commit?.hash === hash);
}

function readSemanticArtifact(file: string, label: 'world' | 'nit'): unknown {
  if (!fs.existsSync(file)) {
    throw new ProjectArchiveJournalError(`Publication recovery ${label} artifact is missing: ${file}`);
  }
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile()) throw new Error(`${label} artifact is not a regular file`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error: any) {
    throw new ProjectArchiveJournalError(
      `Publication recovery ${label} artifact is unreadable: ${error?.message || error}`,
    );
  }
}

/**
 * Prove the pair that recovery is ABOUT TO leave live, not merely that both
 * files mention the journalled hash. A completed publication validates the
 * current world + ledger. A rollback validates the current world + retained
 * prior-ledger evidence (or an intentionally absent first ledger).
 *
 * This runs before settle() can copy/delete the ledger or retire the journal,
 * so a parseable but incoherent pair remains recoverable evidence instead of
 * being blessed by matching strings.
 */
function validatePublicationSettlementDecision(
  lock: ProjectBoundaryLock,
  transactionDir: string,
  journal: ProjectPublicationJournal,
): void {
  assertOwnedProjectLock(lock);
  const liveWorld = worldFile(lock.dataDir, lock.projectId);
  const worldValue = readSemanticArtifact(liveWorld, 'world');
  const worldHasNext = jsonContainsWorldNitHash(liveWorld, journal.nextNitHash);
  let prospectiveNit: unknown | null = null;
  if (worldHasNext) {
    const liveNit = nitFile(lock.dataDir, lock.projectId);
    prospectiveNit = fs.existsSync(liveNit) ? readSemanticArtifact(liveNit, 'nit') : null;
  } else if (journal.previousNitExisted) {
    const previous = previousNitPath(transactionDir);
    if (!fs.existsSync(previous) || sha256File(previous) !== journal.previousNitSha256) {
      throw new ProjectArchiveJournalError(`Prior nit evidence is missing or changed for ${lock.projectId}`);
    }
    prospectiveNit = readSemanticArtifact(previous, 'nit');
  }

  const validation = validateRecoveryWorldNitCoherence(worldValue, prospectiveNit);
  if (!validation.valid) {
    throw new ProjectArchiveJournalError(
      `Publication settlement semantic validation failed for ${lock.projectId}: ${validation.error}`,
    );
  }
}

function copyFileAtomically(source: string, destination: string): void {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.publication-recovery-${process.pid}-${crypto.randomUUID()}`;
  try {
    fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL);
    const fd = fs.openSync(temporary, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, destination);
    fsyncDirectory(path.dirname(destination));
  } catch (error) {
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* preserve original error */ }
    throw error;
  }
}

function retireTransaction(transactionDir: string): void {
  const root = path.dirname(transactionDir);
  const retiredRoot = path.join(root, '.retired');
  fs.mkdirSync(retiredRoot, { recursive: true });
  const retired = path.join(retiredRoot, `${path.basename(transactionDir)}-${crypto.randomUUID()}`);
  fs.renameSync(transactionDir, retired);
  fsyncDirectory(root);
  try { fs.rmSync(retired, { recursive: true }); } catch { /* inactive evidence can be cleaned later */ }
}

export function beginProjectPublicationJournal(
  lock: ProjectBoundaryLock,
  nextNitHashInput: string,
): ProjectPublicationJournal {
  assertOwnedProjectLock(lock);
  if (lock.owner.purpose !== 'publish') {
    throw new ProjectArchiveJournalError('Only a publish boundary can begin a canon publication');
  }
  const nextNitHash = String(nextNitHashInput || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(nextNitHash)) {
    throw new ProjectArchiveJournalError('Canon publication requires a 64-character hexadecimal nit hash');
  }
  const existing = activeJournalDirs(lock.dataDir, lock.projectId);
  if (existing.length > 0) {
    throw new ProjectArchiveJournalError(
      `Project ${lock.projectId} has an unfinished canon publication; reconcile it before writing`,
    );
  }

  const root = journalRoot(lock.dataDir, lock.projectId);
  fs.mkdirSync(root, { recursive: true });
  const transactionDir = path.join(root, `${lock.owner.operationId}.txn`);
  // Build outside the active `.txn` namespace. A kill while taking the prior
  // nit snapshot may leave inert `.preparing-*` litter, but never a markerless
  // active transaction that bricks every future inspector.
  const preparingDir = path.join(root, `.preparing-${lock.owner.operationId}-${crypto.randomUUID()}`);
  fs.mkdirSync(preparingDir);
  try {
    const currentNit = nitFile(lock.dataDir, lock.projectId);
    let previousNitSha256: string | undefined;
    if (fs.existsSync(currentNit)) {
      const prior = previousNitPath(preparingDir);
      const stat = fs.lstatSync(currentNit);
      if (!stat.isFile()) throw new ProjectArchiveJournalError(`Nit ledger is not a regular file: ${currentNit}`);
      try {
        fs.linkSync(currentNit, prior);
      } catch {
        fs.copyFileSync(currentNit, prior, fs.constants.COPYFILE_EXCL);
        const priorFd = fs.openSync(prior, 'r');
        try { fs.fsyncSync(priorFd); } finally { fs.closeSync(priorFd); }
      }
      previousNitSha256 = sha256File(prior);
    }
    const journal: ProjectPublicationJournal = {
      version: 1,
      projectId: lock.projectId,
      operationId: lock.owner.operationId,
      nextNitHash,
      previousNitExisted: previousNitSha256 !== undefined,
      ...(previousNitSha256 ? { previousNitSha256 } : {}),
      createdAt: Date.now(),
    };
    atomicWriteJsonSync(markerPath(preparingDir), journal, { backup: false });
    fsyncDirectory(preparingDir);
    fs.renameSync(preparingDir, transactionDir);
    fsyncDirectory(root);
    return journal;
  } catch (error) {
    try { fs.rmSync(preparingDir, { recursive: true, force: true }); } catch { /* inert preparation dir only */ }
    try { fs.rmSync(transactionDir, { recursive: true, force: true }); } catch { /* fail closed via thrown error */ }
    throw error;
  }
}

function settle(lock: ProjectBoundaryLock, allowCurrentOperation: boolean): ProjectPublicationSettlement {
  assertOwnedProjectLock(lock);
  const active = activeJournalDirs(lock.dataDir, lock.projectId);
  if (active.length === 0) return { action: 'none' };
  if (active.length !== 1) {
    throw new ProjectArchiveJournalError(
      `Project ${lock.projectId} has ${active.length} active publication journals; explicit recovery is required`,
    );
  }
  const transactionDir = active[0];
  const journal = readJournal(transactionDir, lock.projectId);
  if (!allowCurrentOperation && journal.operationId === lock.owner.operationId) {
    return { action: 'active-current-operation', nextNitHash: journal.nextNitHash };
  }

  // Every path that can retire the journal proves the pair it will leave live.
  // This includes ordinary reconcile calls reached through save/load/archive,
  // not only the explicit operator command. The current operation's own
  // in-flight journal returned above is deliberately left untouched.
  validatePublicationSettlementDecision(lock, transactionDir, journal);

  const liveWorld = worldFile(lock.dataDir, lock.projectId);
  const liveNit = nitFile(lock.dataDir, lock.projectId);
  const worldHasNext = jsonContainsWorldNitHash(liveWorld, journal.nextNitHash);
  const nitHasNext = jsonContainsLedgerHash(liveNit, journal.nextNitHash);
  if (worldHasNext) {
    if (!nitHasNext) {
      throw new ProjectArchiveJournalError(
        `World ${lock.projectId} references nit ${journal.nextNitHash}, but the ledger does not contain it`,
      );
    }
    retireTransaction(transactionDir);
    return { action: 'completed', nextNitHash: journal.nextNitHash };
  }

  if (journal.previousNitExisted) {
    const previous = previousNitPath(transactionDir);
    if (!fs.existsSync(previous) || sha256File(previous) !== journal.previousNitSha256) {
      throw new ProjectArchiveJournalError(`Prior nit evidence is missing or changed for ${lock.projectId}`);
    }
    const currentMatchesPrevious = fs.existsSync(liveNit)
      && sha256File(liveNit) === journal.previousNitSha256;
    if (!currentMatchesPrevious) {
      if (fs.existsSync(liveNit) && !nitHasNext) {
        throw new ProjectArchiveJournalError(
          `Nit ledger for ${lock.projectId} is neither the prior nor journalled next revision`,
        );
      }
      copyFileAtomically(previous, liveNit);
    }
  } else if (fs.existsSync(liveNit)) {
    if (!nitHasNext) {
      throw new ProjectArchiveJournalError(
        `Unexpected nit ledger appeared during first publication of ${lock.projectId}`,
      );
    }
    fs.unlinkSync(liveNit);
    fsyncDirectory(path.dirname(liveNit));
  }

  retireTransaction(transactionDir);
  return { action: 'rolled-back', nextNitHash: journal.nextNitHash };
}

/** Reconcile only abandoned work. The current lock's own active transaction is left alone. */
export function reconcileProjectPublicationJournal(lock: ProjectBoundaryLock): ProjectPublicationSettlement {
  return settle(lock, false);
}

/** Settle the current transaction after a world-save success or failure. */
export function settleCurrentProjectPublicationJournal(lock: ProjectBoundaryLock): ProjectPublicationSettlement {
  return settle(lock, true);
}

/**
 * Guarded operator workflow for a publisher killed between nit + world files.
 * It clears only the exact stale owner that was inspected, reconciles under a
 * new recovery boundary, and retains a durable audit record of the decision.
 */
export function recoverProjectPublication(
  dataDirInput: string,
  projectIdInput: string,
  options: RecoverProjectPublicationOptions,
): ProjectPublicationSettlement {
  const dataDir = path.resolve(dataDirInput);
  const projectId = assertSafeProjectId(projectIdInput);
  if (options.confirmProjectId !== projectId) {
    throw new ProjectArchiveJournalError(`Publication recovery confirmation must exactly equal ${projectId}`);
  }
  const reason = String(options.reason || '').trim();
  if (!reason) throw new ProjectArchiveJournalError('Publication recovery requires an operator reason');
  const expectedJournalOperationId = String(options.expectedJournalOperationId || '').trim();
  if (!expectedJournalOperationId) {
    throw new ProjectArchiveJournalError('Publication recovery requires the journal operation id printed by inspect');
  }

  const inspected = inspectProjectPublicationJournal(dataDir, projectId, options);
  if (!inspected.journal) throw new ProjectArchiveJournalError(`No unfinished canon publication for ${projectId}`);
  if (inspected.journal.operationId !== expectedJournalOperationId) {
    throw new ProjectArchiveJournalError(
      `Publication journal changed from ${expectedJournalOperationId} to ${inspected.journal.operationId}`,
    );
  }

  // Put the operator's intent down before changing either lock ownership or
  // publication state. If the process dies later, an initiated record remains
  // instead of an apparently unaudited recovery.
  const auditDir = path.join(dataDir, '.archive-boundary', 'recoveries', 'publications');
  fs.mkdirSync(auditDir, { recursive: true });
  const auditFile = path.join(
    auditDir,
    `${projectId}_${Date.now()}_${crypto.randomUUID()}.json`,
  );
  atomicWriteJsonSync(auditFile, {
    version: 1,
    state: 'initiated',
    projectId,
    abandonedOperationId: expectedJournalOperationId,
    observedProjectLockOperationId: inspected.lock.owner?.operationId,
    initiatedAt: Date.now(),
    recoveredBy: { pid: process.pid },
    reason,
  }, { backup: false });

  if (inspected.lock.exists) {
    if (!inspected.lock.stale) {
      throw new ProjectArchiveJournalError(`Project ${projectId} still has a live publisher; recovery refused`);
    }
    if (inspected.lock.owner) {
      if (options.expectedProjectLockOperationId !== inspected.lock.owner.operationId) {
        throw new ProjectArchiveJournalError(
          `Stale publisher must be confirmed as ${inspected.lock.owner.operationId}`,
        );
      }
      clearStaleProjectBoundaryLock(dataDir, projectId, {
        staleAfterMs: options.staleAfterMs,
        now: options.now,
        expectedOperationId: options.expectedProjectLockOperationId,
      });
    } else {
      if (options.allowUnreadableProjectLock !== true) {
        throw new ProjectArchiveJournalError('Unreadable stale publisher requires explicit confirmation');
      }
      clearStaleProjectBoundaryLock(dataDir, projectId, {
        staleAfterMs: options.staleAfterMs,
        now: options.now,
        allowUnreadableOwner: true,
      });
    }
  }

  const recovery = acquireProjectBoundaryLock(dataDir, projectId, 'recovery', options);
  let settlement: ProjectPublicationSettlement;
  try {
    settlement = reconcileProjectPublicationJournal(recovery);
    if (settlement.action !== 'completed' && settlement.action !== 'rolled-back') {
      throw new ProjectArchiveJournalError(`Publication recovery produced unexpected action ${settlement.action}`);
    }
  } finally {
    recovery.release();
  }

  try {
    const initiated = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
    atomicWriteJsonSync(auditFile, {
      ...initiated,
      state: 'complete',
      recoveredAt: Date.now(),
      settlement,
    }, { backup: false });
  } catch {
    // The files and lock are already settled. Keep the durable initiated
    // record and never falsely report that recovery itself failed.
  }
  return settlement;
}
