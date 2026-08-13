/**
 * Guarded recovery for a corrupted-but-present project world file.
 *
 * The one incident class the other four tools don't route: the primary
 * `project_<id>.json` exists but is unreadable or structurally invalid, no
 * creation/publication journal applies (the project published cleanly long
 * ago), and the only good copy is the atomic writer's `.bak`. Before this
 * tool, restoring it meant a bare `cp` — exactly the unguided mutation the
 * recovery rules forbid.
 *
 * Discipline matches the sibling tools: inspect is read-only and prints the
 * exact evidence (the backup's sha256) the mutating command must echo back;
 * recover re-verifies everything under a 'recovery' boundary lock, writes an
 * 'initiated' audit before mutating, preserves the corrupt primary beside the
 * audit, and promotes the backup's exact bytes.
 *
 * THE ONE RULE THAT KEEPS THIS SAFE: promotion must never route through the
 * `.bak`-rotating write path. `writeRawAtomicSync(..., backup: true)` copies
 * the CURRENT primary over `.bak` before renaming — here the current primary
 * is the corrupt file and `.bak` is the only good copy. Promotion therefore
 * always passes `backup: false`, leaving `.bak` untouched as evidence.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { assertSafeProjectId } from '../security/local-boundary';
import { writeRawAtomicSync, atomicWriteJsonSync } from './atomic-write';
import {
  acquireProjectBoundaryLock,
  assertProjectNotTombstoned,
  inspectProjectBoundaryLock,
  ProjectArchiveJournalError,
  readProjectArchiveTombstone,
} from './project-archive-boundary';
import { inspectProjectPublicationJournal } from './project-publication-journal';
import { readProjectCreationJournal } from './project-creation-journal';
import {
  validateRecoveryWorldArtifact,
  validateRecoveryWorldNitCoherence,
} from './project-archive-recovery';

export interface WorldArtifactState {
  exists: boolean;
  bytes?: number;
  mtimeMs?: number;
  readable?: boolean;
  valid?: boolean;
  error?: string;
  sha256?: string;
}

export interface WorldRecoveryInspection {
  projectId: string;
  primary: WorldArtifactState;
  backup: WorldArtifactState;
  /** Whether the backup agrees with the current canon ledger (torn-publication guard). */
  backupCanonCoherent?: boolean;
  backupCanonError?: string;
  catalogued: boolean;
  /** Everything standing between this project and a recover command. */
  blockers: string[];
  /** True when recover would be accepted with the printed evidence. */
  recoverable: boolean;
}

export interface WorldRecoveryOptions {
  confirmProjectId: string;
  /** The exact sha256 printed by inspect; recovery refuses if the backup moved. */
  backupSha256: string;
  reason: string;
  staleAfterMs?: number;
  now?: () => number;
}

export interface WorldRecoveryResult {
  recovered: true;
  projectId: string;
  restoredBytes: number;
  backupSha256: string;
  auditFile: string;
  corruptPrimaryPreservedAt: string;
}

function worldPaths(dataDir: string, projectId: string): { primary: string; backup: string; nit: string } {
  const primary = path.join(dataDir, `project_${projectId}.json`);
  return { primary, backup: `${primary}.bak`, nit: path.join(dataDir, 'nit', `${projectId}.json`) };
}

function readArtifactState(file: string, withSha: boolean): { state: WorldArtifactState; parsed?: unknown; bytes?: Buffer } {
  if (!fs.existsSync(file)) return { state: { exists: false } };
  const stat = fs.lstatSync(file);
  if (!stat.isFile()) {
    return { state: { exists: true, readable: false, valid: false, error: 'not a regular file' } };
  }
  const bytes = fs.readFileSync(file);
  const base: WorldArtifactState = {
    exists: true,
    bytes: stat.size,
    mtimeMs: stat.mtimeMs,
    ...(withSha ? { sha256: crypto.createHash('sha256').update(bytes).digest('hex') } : {}),
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (error: any) {
    return { state: { ...base, readable: false, valid: false, error: `JSON is unreadable: ${error?.message || error}` }, bytes };
  }
  const validation = validateRecoveryWorldArtifact(parsed);
  return {
    state: { ...base, readable: true, valid: validation.valid, ...(validation.valid ? {} : { error: validation.error }) },
    parsed,
    bytes,
  };
}

function readNitLedgerValue(nitFile: string): { value: unknown | null; error?: string } {
  if (!fs.existsSync(nitFile)) return { value: null };
  try {
    return { value: JSON.parse(fs.readFileSync(nitFile, 'utf8')) };
  } catch (error: any) {
    return { value: null, error: `Nit ledger is unreadable: ${error?.message || error}` };
  }
}

function isCatalogued(dataDir: string, projectId: string): { catalogued: boolean; error?: string } {
  const file = path.join(dataDir, 'projects.json');
  if (!fs.existsSync(file)) return { catalogued: false, error: 'projects.json is missing' };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(parsed)) return { catalogued: false, error: 'projects.json is not an array' };
    return { catalogued: parsed.some((row: any) => row?.id === projectId) };
  } catch (error: any) {
    return { catalogued: false, error: `projects.json is unreadable: ${error?.message || error}` };
  }
}

export function inspectProjectWorldRecovery(dataDirInput: string, projectIdInput: string): WorldRecoveryInspection {
  const dataDir = path.resolve(dataDirInput);
  const projectId = assertSafeProjectId(projectIdInput);
  const { primary, backup, nit } = worldPaths(dataDir, projectId);
  const blockers: string[] = [];

  const tombstone = readProjectArchiveTombstone(dataDir, projectId);
  if (tombstone) {
    blockers.push(`Project is tombstoned (${tombstone.state}); use archive recovery, not world recovery`);
  }
  const journal = inspectProjectPublicationJournal(dataDir, projectId, {});
  if (journal.journal) {
    blockers.push('A canon publication journal is open; use publication recovery first');
  }
  if (readProjectCreationJournal(dataDir, projectId)) {
    blockers.push('An unfinished creation intent exists; use creation recovery first');
  }
  const lock = inspectProjectBoundaryLock(dataDir, projectId);
  if (lock.exists) {
    blockers.push(lock.stale
      ? 'A stale boundary lock remains; clear it with lock recovery first'
      : `A live ${lock.owner?.purpose ?? 'unreadable'} owner holds the boundary; stop it or wait`);
  }

  const primaryRead = readArtifactState(primary, false);
  const backupRead = readArtifactState(backup, true);
  if (!primaryRead.state.exists) {
    blockers.push('The primary world file is missing, not corrupted; this tool only repairs a present-but-invalid primary');
  } else if (primaryRead.state.valid) {
    blockers.push('The primary world file is healthy; nothing to recover');
  }
  if (!backupRead.state.exists) {
    blockers.push('No .bak exists to recover from');
  } else if (!backupRead.state.valid) {
    blockers.push(`The backup is not a valid world: ${backupRead.state.error}`);
  }

  const catalog = isCatalogued(dataDir, projectId);
  if (catalog.error) blockers.push(catalog.error);
  else if (!catalog.catalogued) blockers.push('projects.json does not contain this project');

  let backupCanonCoherent: boolean | undefined;
  let backupCanonError: string | undefined;
  if (backupRead.state.valid && backupRead.parsed !== undefined) {
    const ledger = readNitLedgerValue(nit);
    if (ledger.error) {
      backupCanonCoherent = false;
      backupCanonError = ledger.error;
      blockers.push(`${ledger.error}; repair canon history before promoting a world over it`);
    } else {
      const coherence = validateRecoveryWorldNitCoherence(backupRead.parsed, ledger.value);
      backupCanonCoherent = coherence.valid;
      if (!coherence.valid) {
        backupCanonError = coherence.error;
        blockers.push(
          `The backup disagrees with the canon ledger (${coherence.error}); `
          + 'this looks like a torn publication — use publication recovery, not world recovery',
        );
      }
    }
  }

  return {
    projectId,
    primary: primaryRead.state,
    backup: backupRead.state,
    ...(backupCanonCoherent !== undefined ? { backupCanonCoherent } : {}),
    ...(backupCanonError !== undefined ? { backupCanonError } : {}),
    catalogued: catalog.catalogued,
    blockers,
    recoverable: blockers.length === 0,
  };
}

function beginWorldAudit(dataDir: string, details: Record<string, unknown>): string {
  const dir = path.join(dataDir, '.archive-boundary', 'recoveries', 'worlds');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `world_${Date.now()}_${crypto.randomUUID()}.json`);
  atomicWriteJsonSync(file, {
    version: 1,
    kind: 'world-backup-promotion',
    ...details,
    state: 'initiated',
    initiatedAt: Date.now(),
    pid: process.pid,
  }, { backup: false });
  return file;
}

function finishWorldAudit(file: string, details: Record<string, unknown>): void {
  try {
    const audit = JSON.parse(fs.readFileSync(file, 'utf8'));
    atomicWriteJsonSync(file, { ...audit, ...details, state: 'complete', completedAt: Date.now() }, { backup: false });
  } catch {
    // The durable initiated record is preferable to failing a completed
    // recovery over an audit rewrite.
  }
}

export function recoverProjectWorldFromBackup(
  dataDirInput: string,
  projectIdInput: string,
  options: WorldRecoveryOptions,
): WorldRecoveryResult {
  const dataDir = path.resolve(dataDirInput);
  const projectId = assertSafeProjectId(projectIdInput);
  if (options.confirmProjectId !== projectId) {
    throw new ProjectArchiveJournalError(`World recovery confirmation must exactly equal ${projectId}`);
  }
  if (!String(options.reason || '').trim()) {
    throw new ProjectArchiveJournalError('World recovery requires an operator reason');
  }
  const expectedSha = String(options.backupSha256 || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSha)) {
    throw new ProjectArchiveJournalError('World recovery requires the exact --backup-sha256 printed by inspect');
  }

  // Everything is re-proven inside ownership; the pre-flight inspection just
  // refuses early with the same routed guidance inspect prints.
  const preflight = inspectProjectWorldRecovery(dataDir, projectId);
  if (!preflight.recoverable) {
    throw new ProjectArchiveJournalError(`World recovery is blocked: ${preflight.blockers.join(' | ')}`);
  }
  if (preflight.backup.sha256 !== expectedSha) {
    throw new ProjectArchiveJournalError(
      `Backup changed from ${expectedSha} to ${preflight.backup.sha256}; re-run inspect and confirm the new evidence`,
    );
  }

  const boundary = acquireProjectBoundaryLock(dataDir, projectId, 'recovery', {
    staleAfterMs: options.staleAfterMs,
    now: options.now,
  });
  try {
    assertProjectNotTombstoned(dataDir, projectId);
    const { primary, backup, nit } = worldPaths(dataDir, projectId);

    // Re-prove under ownership: the primary must STILL be invalid (if
    // something already repaired it, promoting would clobber newer truth)
    // and the backup bytes must still be the inspected evidence.
    const primaryRead = readArtifactState(primary, false);
    if (!primaryRead.state.exists) {
      throw new ProjectArchiveJournalError('The primary world file disappeared during recovery; use archive recovery');
    }
    if (primaryRead.state.valid) {
      throw new ProjectArchiveJournalError('The primary world file became healthy during recovery; nothing to promote');
    }
    const backupRead = readArtifactState(backup, true);
    if (!backupRead.state.exists || !backupRead.bytes) {
      throw new ProjectArchiveJournalError('The backup disappeared during recovery');
    }
    if (backupRead.state.sha256 !== expectedSha) {
      throw new ProjectArchiveJournalError(
        `Backup changed from ${expectedSha} to ${backupRead.state.sha256} during recovery; re-run inspect`,
      );
    }
    if (!backupRead.state.valid || backupRead.parsed === undefined) {
      throw new ProjectArchiveJournalError(`The backup is not a valid world: ${backupRead.state.error}`);
    }
    const ledger = readNitLedgerValue(nit);
    if (ledger.error) throw new ProjectArchiveJournalError(ledger.error);
    const coherence = validateRecoveryWorldNitCoherence(backupRead.parsed, ledger.value);
    if (!coherence.valid) {
      throw new ProjectArchiveJournalError(`The backup disagrees with the canon ledger: ${coherence.error}`);
    }

    const auditFile = beginWorldAudit(dataDir, {
      projectId,
      reason: options.reason.trim(),
      backupSha256: expectedSha,
      backupBytes: backupRead.state.bytes,
      primaryError: primaryRead.state.error,
      recoveryOperationId: boundary.owner.operationId,
    });

    // Preserve the corrupt primary beside the audit before it is replaced —
    // recovery restores service, it does not erase the forensic trail.
    const corruptCopy = `${auditFile.replace(/\.json$/, '')}.corrupt-primary`;
    writeRawAtomicSync(corruptCopy, fs.readFileSync(primary), false);

    // Promote the EXACT inspected bytes. backup:false is load-bearing — the
    // rotating path would copy the corrupt primary over the good .bak first.
    writeRawAtomicSync(primary, backupRead.bytes, false);

    finishWorldAudit(auditFile, { corruptPrimaryPreservedAt: path.basename(corruptCopy) });

    return {
      recovered: true,
      projectId,
      restoredBytes: backupRead.bytes.length,
      backupSha256: expectedSha,
      auditFile: path.relative(dataDir, auditFile),
      corruptPrimaryPreservedAt: path.relative(dataDir, corruptCopy),
    };
  } finally {
    boundary.release();
  }
}
