/** Guarded recovery for abandoned single-artifact project/catalog publishers. */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { assertSafeProjectId } from '../security/local-boundary';
import { atomicWriteJsonSync } from './atomic-write';
import {
  acquireCatalogBoundaryLock,
  acquireProjectBoundaryLock,
  assertProjectNotTombstoned,
  clearStaleCatalogBoundaryLock,
  clearStaleProjectBoundaryLock,
  inspectCatalogBoundaryLock,
  inspectProjectBoundaryLock,
  LockInspection,
  ProjectArchiveJournalError,
} from './project-archive-boundary';
import { inspectProjectPublicationJournal } from './project-publication-journal';
import { validateRecoveryWorldArtifact } from './project-archive-recovery';
import { readProjectCreationJournal } from './project-creation-journal';

export interface StaleLockRecoveryOptions {
  expectedOperationId?: string;
  allowUnreadableOwner?: boolean;
  reason: string;
  staleAfterMs?: number;
  now?: () => number;
}

export interface StaleProjectPublishRecoveryOptions extends StaleLockRecoveryOptions {
  confirmProjectId: string;
  /** Diagnostic hook used by the SIGKILL regression after durable ownership transfers. */
  onRecoveryLockAcquired?: (operationId: string) => void;
}

export interface StaleLockRecoveryResult {
  kind: 'project-publish' | 'catalog';
  operationId?: string;
  unreadableOwner: boolean;
  recovered: true;
  auditFile: string;
}

function readValidatedCatalog(dataDir: string): Array<{ id: string; [key: string]: unknown }> {
  const file = path.join(dataDir, 'projects.json');
  if (!fs.existsSync(file)) throw new ProjectArchiveJournalError('projects.json is missing');
  let parsed: unknown;
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error: any) {
    throw new ProjectArchiveJournalError(`projects.json is unreadable: ${error?.message || error}`);
  }
  if (!Array.isArray(parsed)) throw new ProjectArchiveJournalError('projects.json is not an array');
  const seen = new Set<string>();
  for (const row of parsed) {
    if (!row || typeof row !== 'object' || typeof (row as any).id !== 'string') {
      throw new ProjectArchiveJournalError('projects.json contains an entry without an id');
    }
    const id = assertSafeProjectId((row as any).id);
    if (seen.has(id)) throw new ProjectArchiveJournalError(`projects.json contains duplicate id ${id}`);
    seen.add(id);
  }
  return parsed as Array<{ id: string; [key: string]: unknown }>;
}

function validateProjectWorld(dataDir: string, projectId: string): void {
  const primary = path.join(dataDir, `project_${projectId}.json`);
  const backup = `${primary}.bak`;
  if (!fs.existsSync(primary)) {
    if (fs.existsSync(backup)) {
      throw new ProjectArchiveJournalError(
        `Primary world for ${projectId} is missing while a backup exists; use archive/data recovery`,
      );
    }
    throw new ProjectArchiveJournalError(`Primary world for ${projectId} is missing`);
  }
  const stat = fs.lstatSync(primary);
  if (!stat.isFile()) throw new ProjectArchiveJournalError(`World path is not a regular file: ${primary}`);
  try {
    const parsed = JSON.parse(fs.readFileSync(primary, 'utf8'));
    const validation = validateRecoveryWorldArtifact(parsed);
    if (!validation.valid) throw new Error(validation.error);
  } catch (error: any) {
    throw new ProjectArchiveJournalError(`World for ${projectId} is unreadable: ${error?.message || error}`);
  }
}

function assertStaleInspection(
  label: string,
  inspection: LockInspection,
  options: StaleLockRecoveryOptions,
  expectedPurposes: ReadonlyArray<'publish' | 'recovery' | 'catalog'>,
): void {
  if (!inspection.exists) throw new ProjectArchiveJournalError(`${label} has no lock to recover`);
  if (!inspection.stale) throw new ProjectArchiveJournalError(`${label} still has a live owner`);
  if (inspection.owner) {
    if (!expectedPurposes.includes(inspection.owner.purpose as 'publish' | 'recovery' | 'catalog')) {
      throw new ProjectArchiveJournalError(
        `${label} owner purpose is ${inspection.owner.purpose}; this recovery command only handles ${expectedPurposes.join(' or ')}`,
      );
    }
    if (options.expectedOperationId !== inspection.owner.operationId) {
      throw new ProjectArchiveJournalError(`${label} owner must be confirmed as ${inspection.owner.operationId}`);
    }
  } else if (options.allowUnreadableOwner !== true) {
    throw new ProjectArchiveJournalError(`${label} has an unreadable owner; explicit confirmation is required`);
  }
  if (!String(options.reason || '').trim()) {
    throw new ProjectArchiveJournalError(`${label} recovery requires an operator reason`);
  }
}

function beginAudit(
  dataDir: string,
  kind: StaleLockRecoveryResult['kind'],
  operationId: string | undefined,
  reason: string,
  details: Record<string, unknown> = {},
): string {
  const dir = path.join(dataDir, '.archive-boundary', 'recoveries', 'locks');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${kind}_${Date.now()}_${crypto.randomUUID()}.json`);
  atomicWriteJsonSync(file, {
    version: 1,
    kind,
    operationId,
    reason,
    ...details,
    state: 'initiated',
    initiatedAt: Date.now(),
    pid: process.pid,
  }, { backup: false });
  return file;
}

function findInitiatedProjectRecoveryAudit(
  dataDir: string,
  projectId: string,
  recoveryOperationId: string,
): string | null {
  const dir = path.join(dataDir, '.archive-boundary', 'recoveries', 'locks');
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  const matches: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith('project-publish_') || !entry.name.endsWith('.json')) continue;
    const file = path.join(dir, entry.name);
    try {
      const audit = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (
        audit?.version === 1
        && audit?.kind === 'project-publish'
        && audit?.state === 'initiated'
        && audit?.projectId === projectId
        && audit?.recoveryOperationId === recoveryOperationId
      ) matches.push(file);
    } catch {
      // An unrelated/unreadable audit is not recovery authority.
    }
  }
  if (matches.length > 1) {
    throw new ProjectArchiveJournalError(
      `Project ${projectId} has multiple initiated audits for recovery owner ${recoveryOperationId}`,
    );
  }
  return matches[0] ?? null;
}

function finishAudit(file: string): void {
  try {
    const audit = JSON.parse(fs.readFileSync(file, 'utf8'));
    atomicWriteJsonSync(file, { ...audit, state: 'complete', completedAt: Date.now() }, { backup: false });
  } catch {
    // Recovery already completed; the durable initiated record is preferable
    // to falsely reporting that the lock remains closed.
  }
}

export function recoverStaleProjectPublishLock(
  dataDirInput: string,
  projectIdInput: string,
  options: StaleProjectPublishRecoveryOptions,
): StaleLockRecoveryResult {
  const dataDir = path.resolve(dataDirInput);
  const projectId = assertSafeProjectId(projectIdInput);
  if (options.confirmProjectId !== projectId) {
    throw new ProjectArchiveJournalError(`Project recovery confirmation must exactly equal ${projectId}`);
  }
  assertProjectNotTombstoned(dataDir, projectId);
  const journal = inspectProjectPublicationJournal(dataDir, projectId, options);
  if (journal.journal) {
    throw new ProjectArchiveJournalError(
      `Project ${projectId} has a paired canon publication; use publication recovery, not a plain unlock`,
    );
  }
  if (readProjectCreationJournal(dataDir, projectId)) {
    throw new ProjectArchiveJournalError(
      `Project ${projectId} has an unfinished creation intent; use creation recovery, not a plain unlock`,
    );
  }
  const inspection = inspectProjectBoundaryLock(dataDir, projectId, options);
  assertStaleInspection(`Project ${projectId}`, inspection, options, ['publish', 'recovery']);
  const abandonedPurpose = inspection.owner?.purpose;
  const catalog = readValidatedCatalog(dataDir);
  if (!catalog.some(row => row.id === projectId)) {
    throw new ProjectArchiveJournalError(`projects.json does not contain ${projectId}`);
  }
  validateProjectWorld(dataDir, projectId);
  const recoveryOperationId = abandonedPurpose === 'recovery'
    ? inspection.owner!.operationId
    : crypto.randomUUID();
  const existingAudit = abandonedPurpose === 'recovery'
    ? findInitiatedProjectRecoveryAudit(dataDir, projectId, recoveryOperationId)
    : null;
  if (abandonedPurpose === 'recovery' && !existingAudit) {
    throw new ProjectArchiveJournalError(
      `Stale recovery owner ${recoveryOperationId} is not bound to an initiated project recovery audit`,
    );
  }
  const auditFile = existingAudit ?? beginAudit(
    dataDir,
    'project-publish',
    inspection.owner?.operationId,
    options.reason.trim(),
    {
      projectId,
      abandonedOperationId: inspection.owner?.operationId,
      recoveryOperationId,
    },
  );
  clearStaleProjectBoundaryLock(dataDir, projectId, {
    staleAfterMs: options.staleAfterMs,
    now: options.now,
    expectedOperationId: inspection.owner?.operationId,
    allowUnreadableOwner: !inspection.owner && options.allowUnreadableOwner === true,
  });
  const recovery = acquireProjectBoundaryLock(dataDir, projectId, 'recovery', {
    ...options,
    operationId: recoveryOperationId,
  });
  try {
    options.onRecoveryLockAcquired?.(recovery.owner.operationId);
    assertProjectNotTombstoned(dataDir, projectId);
    if (inspectProjectPublicationJournal(dataDir, projectId, options).journal) {
      throw new ProjectArchiveJournalError('A publication journal appeared while recovering the stale project lock');
    }
    const currentCatalog = readValidatedCatalog(dataDir);
    if (!currentCatalog.some(row => row.id === projectId)) {
      throw new ProjectArchiveJournalError(`projects.json lost ${projectId} during lock recovery`);
    }
    validateProjectWorld(dataDir, projectId);
  } finally {
    recovery.release();
  }
  finishAudit(auditFile);
  return {
    kind: 'project-publish',
    operationId: inspection.owner?.operationId,
    unreadableOwner: !inspection.owner,
    recovered: true,
    auditFile: path.relative(dataDir, auditFile),
  };
}

export function recoverStaleCatalogLock(
  dataDirInput: string,
  options: StaleLockRecoveryOptions,
): StaleLockRecoveryResult {
  const dataDir = path.resolve(dataDirInput);
  const inspection = inspectCatalogBoundaryLock(dataDir, options);
  assertStaleInspection('Project catalog', inspection, options, ['catalog']);
  readValidatedCatalog(dataDir);
  const auditFile = beginAudit(dataDir, 'catalog', inspection.owner?.operationId, options.reason.trim());
  clearStaleCatalogBoundaryLock(dataDir, {
    staleAfterMs: options.staleAfterMs,
    now: options.now,
    expectedOperationId: inspection.owner?.operationId,
    allowUnreadableOwner: !inspection.owner && options.allowUnreadableOwner === true,
  });
  const recovery = acquireCatalogBoundaryLock(dataDir, options);
  try { readValidatedCatalog(dataDir); } finally { recovery.release(); }
  finishAudit(auditFile);
  return {
    kind: 'catalog',
    operationId: inspection.owner?.operationId,
    unreadableOwner: !inspection.owner,
    recovered: true,
    auditFile: path.relative(dataDir, auditFile),
  };
}
