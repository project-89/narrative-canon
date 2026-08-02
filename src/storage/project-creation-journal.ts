/** Durable intent + explicit recovery for publishing a new project. */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { assertSafeProjectId } from '../security/local-boundary';
import { atomicWriteJsonSync } from './atomic-write';
import {
  acquireCatalogBoundaryLock,
  acquireProjectBoundaryLock,
  assertProjectNotTombstoned,
  clearStaleProjectBoundaryLock,
  inspectProjectBoundaryLock,
  LockInspection,
  ProjectArchiveJournalError,
  ProjectBoundaryLock,
} from './project-archive-boundary';
import {
  validateRecoveryNitArtifact,
  validateRecoveryWorldArtifact,
  validateRecoveryWorldNitCoherence,
} from './project-archive-recovery';
import {
  inspectProjectPublicationJournal,
  reconcileProjectPublicationJournal,
} from './project-publication-journal';
import { Project } from './storage-adapter';

export interface ProjectCreationJournal {
  version: 1;
  projectId: string;
  operationId: string;
  project: Project;
  activate: boolean;
  state: 'prepared' | 'artifacts-published';
  worldSha256?: string;
  nitSha256?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectCreationInspection {
  projectId: string;
  lock: LockInspection;
  journal: ProjectCreationJournal | null;
  catalogContainsProject: boolean;
  world: { exists: boolean; valid: boolean; sha256?: string; error?: string };
  nit: { exists: boolean; valid: boolean; sha256?: string; error?: string };
}

export interface RecoverProjectCreationOptions {
  confirmProjectId: string;
  expectedJournalOperationId: string;
  expectedProjectLockOperationId?: string;
  allowUnreadableProjectLock?: boolean;
  reason: string;
  staleAfterMs?: number;
  now?: () => number;
  /** Diagnostic hook for the SIGKILL-after-recovery-ownership regression. */
  onRecoveryLockAcquired?: (operationId: string) => void;
}

export interface RecoverProjectCreationResult {
  project: Project;
  catalogAction: 'published' | 'already-published';
  publicationSettlement: 'none' | 'completed' | 'rolled-back';
  auditFile: string;
}

function root(dataDir: string, projectIdInput: string): string {
  const projectId = assertSafeProjectId(projectIdInput);
  return path.join(path.resolve(dataDir), '.archive-boundary', 'creations', 'projects', projectId);
}

function activeDirs(dataDir: string, projectId: string): string[] {
  const directory = root(dataDir, projectId);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.endsWith('.txn'))
    .map(entry => path.join(directory, entry.name));
}

function markerPath(transactionDir: string): string {
  return path.join(transactionDir, 'journal.json');
}

function fsyncDirectory(directory: string): void {
  const fd = fs.openSync(directory, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function sha256File(file: string): string {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    while (true) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function validateProject(projectId: string, value: unknown): value is Project {
  const project = value as Partial<Project> | null;
  return Boolean(
    project
    && project.id === projectId
    && typeof project.name === 'string'
    && project.name.trim().length > 0
    && typeof project.createdAt === 'number'
    && Number.isFinite(project.createdAt)
    && typeof project.updatedAt === 'number'
    && Number.isFinite(project.updatedAt)
    && typeof project.isActive === 'boolean',
  );
}

function readJournalDir(transactionDir: string, projectId: string): ProjectCreationJournal {
  try {
    const parsed = JSON.parse(fs.readFileSync(markerPath(transactionDir), 'utf8')) as ProjectCreationJournal;
    if (
      parsed?.version !== 1
      || parsed.projectId !== projectId
      || typeof parsed.operationId !== 'string'
      || !parsed.operationId
      || !validateProject(projectId, parsed.project)
      || typeof parsed.activate !== 'boolean'
      || (parsed.state !== 'prepared' && parsed.state !== 'artifacts-published')
      || (parsed.worldSha256 !== undefined && !/^[a-f0-9]{64}$/.test(parsed.worldSha256))
      || (parsed.nitSha256 !== undefined && !/^[a-f0-9]{64}$/.test(parsed.nitSha256))
      || (parsed.state === 'artifacts-published' && !parsed.worldSha256)
      || typeof parsed.createdAt !== 'number'
      || !Number.isFinite(parsed.createdAt)
      || typeof parsed.updatedAt !== 'number'
      || !Number.isFinite(parsed.updatedAt)
    ) throw new Error('invalid creation journal shape');
    return parsed;
  } catch (error: any) {
    throw new ProjectArchiveJournalError(
      `Creation journal for ${projectId} is unreadable; explicit filesystem review is required: ${error?.message || error}`,
    );
  }
}

export function readProjectCreationJournal(
  dataDir: string,
  projectIdInput: string,
): ProjectCreationJournal | null {
  const projectId = assertSafeProjectId(projectIdInput);
  const active = activeDirs(dataDir, projectId);
  if (active.length > 1) {
    throw new ProjectArchiveJournalError(
      `Project ${projectId} has ${active.length} active creation journals; explicit filesystem review is required`,
    );
  }
  return active.length === 1 ? readJournalDir(active[0], projectId) : null;
}

function readCatalog(dataDir: string): Project[] {
  const file = path.join(path.resolve(dataDir), 'projects.json');
  if (!fs.existsSync(file)) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error: any) {
    throw new ProjectArchiveJournalError(`projects.json is unreadable: ${error?.message || error}`);
  }
  if (!Array.isArray(parsed)) throw new ProjectArchiveJournalError('projects.json is not an array');
  const ids = new Set<string>();
  for (const row of parsed) {
    if (!row || typeof row !== 'object' || typeof (row as any).id !== 'string') {
      throw new ProjectArchiveJournalError('projects.json contains an entry without an id');
    }
    const id = assertSafeProjectId((row as any).id);
    if (ids.has(id)) throw new ProjectArchiveJournalError(`projects.json contains duplicate id ${id}`);
    ids.add(id);
  }
  return parsed as Project[];
}

function readArtifact(
  file: string,
  kind: 'world' | 'nit',
): { exists: boolean; valid: boolean; sha256?: string; value?: any; error?: string } {
  if (!fs.existsSync(file)) return { exists: false, valid: false, error: `${kind} is missing` };
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile()) throw new Error(`${kind} is not a regular file`);
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    const validation = kind === 'world'
      ? validateRecoveryWorldArtifact(value)
      : validateRecoveryNitArtifact(value);
    if (!validation.valid) throw new Error(validation.error);
    return { exists: true, valid: true, sha256: sha256File(file), value };
  } catch (error: any) {
    return { exists: true, valid: false, error: error?.message || String(error) };
  }
}

function inspectArtifacts(dataDir: string, projectId: string) {
  const base = path.resolve(dataDir);
  const worldFile = path.join(base, `project_${projectId}.json`);
  const nitFile = path.join(base, 'nit', `${projectId}.json`);
  if (fs.existsSync(`${worldFile}.bak`) && !fs.existsSync(worldFile)) {
    throw new ProjectArchiveJournalError('Creation world primary is missing while a backup exists');
  }
  if (fs.existsSync(`${nitFile}.bak`) && !fs.existsSync(nitFile)) {
    throw new ProjectArchiveJournalError('Creation nit primary is missing while a backup exists');
  }
  const world = readArtifact(worldFile, 'world');
  const nit = readArtifact(nitFile, 'nit');
  if (world.valid) {
    const coherence = validateRecoveryWorldNitCoherence(
      world.value,
      nit.valid ? nit.value : null,
    );
    if (!coherence.valid) {
      return { world, nit: { ...nit, valid: false, error: coherence.error } };
    }
  }
  return { world, nit };
}

function assertOwnedCreation(lock: ProjectBoundaryLock, journal: ProjectCreationJournal): void {
  lock.heartbeat();
  if (lock.projectId !== journal.projectId || lock.owner.operationId !== journal.operationId) {
    throw new ProjectArchiveJournalError('Creation journal is not owned by this project boundary');
  }
}

export function beginProjectCreationJournal(
  lock: ProjectBoundaryLock,
  project: Project,
  options: { activate?: boolean } = {},
): ProjectCreationJournal {
  lock.heartbeat();
  if (lock.owner.purpose !== 'publish') {
    throw new ProjectArchiveJournalError('Only a publish boundary can begin a project creation');
  }
  if (!validateProject(lock.projectId, project)) {
    throw new ProjectArchiveJournalError('Creation metadata is invalid or belongs to another project');
  }
  assertProjectNotTombstoned(lock.dataDir, lock.projectId);
  if (activeDirs(lock.dataDir, lock.projectId).length > 0) {
    throw new ProjectArchiveJournalError(`Project ${lock.projectId} already has an active creation intent`);
  }
  if (readCatalog(lock.dataDir).some(row => row.id === lock.projectId)) {
    throw new ProjectArchiveJournalError(`Project ${lock.projectId} already exists in the catalog`);
  }
  const base = path.resolve(lock.dataDir);
  for (const file of [
    path.join(base, `project_${lock.projectId}.json`),
    path.join(base, `project_${lock.projectId}.json.bak`),
    path.join(base, 'nit', `${lock.projectId}.json`),
    path.join(base, 'nit', `${lock.projectId}.json.bak`),
  ]) {
    if (fs.existsSync(file)) throw new ProjectArchiveJournalError(`Creation target already exists: ${file}`);
  }

  const directory = root(lock.dataDir, lock.projectId);
  fs.mkdirSync(directory, { recursive: true });
  const preparing = path.join(directory, `.preparing-${lock.owner.operationId}-${crypto.randomUUID()}`);
  const transaction = path.join(directory, `${lock.owner.operationId}.txn`);
  fs.mkdirSync(preparing);
  const now = Date.now();
  const journal: ProjectCreationJournal = {
    version: 1,
    projectId: lock.projectId,
    operationId: lock.owner.operationId,
    project,
    activate: options.activate === true,
    state: 'prepared',
    createdAt: now,
    updatedAt: now,
  };
  try {
    atomicWriteJsonSync(markerPath(preparing), journal, { backup: false });
    fsyncDirectory(preparing);
    fs.renameSync(preparing, transaction);
    fsyncDirectory(directory);
    return journal;
  } catch (error) {
    try { fs.rmSync(preparing, { recursive: true, force: true }); } catch { /* inert only */ }
    throw error;
  }
}

export function markProjectCreationArtifactsPublished(lock: ProjectBoundaryLock): ProjectCreationJournal {
  const journal = readProjectCreationJournal(lock.dataDir, lock.projectId);
  if (!journal) throw new ProjectArchiveJournalError(`Project ${lock.projectId} has no creation intent`);
  assertOwnedCreation(lock, journal);
  const artifacts = inspectArtifacts(lock.dataDir, lock.projectId);
  if (!artifacts.world.valid || !artifacts.world.sha256) {
    throw new ProjectArchiveJournalError(`Creation world is not recoverable: ${artifacts.world.error}`);
  }
  if (artifacts.nit.exists && (!artifacts.nit.valid || !artifacts.nit.sha256)) {
    throw new ProjectArchiveJournalError(`Creation nit is not recoverable: ${artifacts.nit.error}`);
  }
  const next: ProjectCreationJournal = {
    ...journal,
    state: 'artifacts-published',
    worldSha256: artifacts.world.sha256,
    ...(artifacts.nit.sha256 ? { nitSha256: artifacts.nit.sha256 } : {}),
    updatedAt: Date.now(),
  };
  atomicWriteJsonSync(markerPath(activeDirs(lock.dataDir, lock.projectId)[0]), next, { backup: false });
  return next;
}

function validatePublishedArtifacts(dataDir: string, journal: ProjectCreationJournal): ReturnType<typeof inspectArtifacts> {
  const artifacts = inspectArtifacts(dataDir, journal.projectId);
  if (!artifacts.world.valid || !artifacts.world.sha256) {
    throw new ProjectArchiveJournalError(`Creation world is not recoverable: ${artifacts.world.error}`);
  }
  if (journal.worldSha256 && journal.worldSha256 !== artifacts.world.sha256) {
    throw new ProjectArchiveJournalError('Creation world changed after it was journalled');
  }
  if (artifacts.nit.exists && (!artifacts.nit.valid || !artifacts.nit.sha256)) {
    throw new ProjectArchiveJournalError(`Creation nit is not recoverable: ${artifacts.nit.error}`);
  }
  if (journal.nitSha256 && journal.nitSha256 !== artifacts.nit.sha256) {
    throw new ProjectArchiveJournalError('Creation nit changed after it was journalled');
  }
  if (!journal.nitSha256 && artifacts.nit.exists && journal.state === 'artifacts-published') {
    throw new ProjectArchiveJournalError('An unjournalled nit artifact appeared after creation publication');
  }
  return artifacts;
}

function retire(dataDir: string, projectId: string): void {
  const active = activeDirs(dataDir, projectId);
  if (active.length !== 1) throw new ProjectArchiveJournalError(`Project ${projectId} creation intent changed`);
  const directory = path.dirname(active[0]);
  const retiredRoot = path.join(directory, '.retired');
  fs.mkdirSync(retiredRoot, { recursive: true });
  const retired = path.join(retiredRoot, `${path.basename(active[0])}-${crypto.randomUUID()}`);
  fs.renameSync(active[0], retired);
  fsyncDirectory(directory);
  try { fs.rmSync(retired, { recursive: true }); } catch { /* inactive evidence may be cleaned later */ }
}

export function completeProjectCreationJournal(lock: ProjectBoundaryLock): void {
  const journal = readProjectCreationJournal(lock.dataDir, lock.projectId);
  if (!journal) throw new ProjectArchiveJournalError(`Project ${lock.projectId} has no creation intent`);
  assertOwnedCreation(lock, journal);
  if (journal.state !== 'artifacts-published') {
    throw new ProjectArchiveJournalError('Creation artifacts were not durably journalled');
  }
  validatePublishedArtifacts(lock.dataDir, journal);
  if (!readCatalog(lock.dataDir).some(row => row.id === lock.projectId)) {
    throw new ProjectArchiveJournalError('Creation catalog row did not reach durable storage');
  }
  retire(lock.dataDir, lock.projectId);
}

export function inspectProjectCreation(
  dataDirInput: string,
  projectIdInput: string,
  options: Pick<RecoverProjectCreationOptions, 'staleAfterMs' | 'now'> = {},
): ProjectCreationInspection {
  const dataDir = path.resolve(dataDirInput);
  const projectId = assertSafeProjectId(projectIdInput);
  const journal = readProjectCreationJournal(dataDir, projectId);
  const artifacts = inspectArtifacts(dataDir, projectId);
  return {
    projectId,
    lock: inspectProjectBoundaryLock(dataDir, projectId, options),
    journal,
    catalogContainsProject: readCatalog(dataDir).some(row => row.id === projectId),
    world: artifacts.world,
    nit: artifacts.nit,
  };
}

function auditRoot(dataDir: string): string {
  return path.join(dataDir, '.archive-boundary', 'recoveries', 'creations');
}

function findInitiatedAudit(
  dataDir: string,
  projectId: string,
  journalOperationId: string,
  recoveryOperationId?: string,
): string | null {
  const directory = auditRoot(dataDir);
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return null; }
  const matches: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const file = path.join(directory, entry.name);
    try {
      const audit = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (
        audit?.version === 1
        && audit?.state === 'initiated'
        && audit?.projectId === projectId
        && audit?.journalOperationId === journalOperationId
        && (!recoveryOperationId || audit?.recoveryOperationId === recoveryOperationId)
      ) matches.push(file);
    } catch { /* not authority */ }
  }
  if (matches.length > 1) throw new ProjectArchiveJournalError('Multiple initiated creation recovery audits exist');
  return matches[0] ?? null;
}

export function recoverProjectCreation(
  dataDirInput: string,
  projectIdInput: string,
  options: RecoverProjectCreationOptions,
): RecoverProjectCreationResult {
  const dataDir = path.resolve(dataDirInput);
  const projectId = assertSafeProjectId(projectIdInput);
  if (options.confirmProjectId !== projectId) {
    throw new ProjectArchiveJournalError(`Creation recovery confirmation must exactly equal ${projectId}`);
  }
  const reason = String(options.reason || '').trim();
  if (!reason) throw new ProjectArchiveJournalError('Creation recovery requires an operator reason');
  const journal = readProjectCreationJournal(dataDir, projectId);
  if (!journal) throw new ProjectArchiveJournalError(`No unfinished project creation for ${projectId}`);
  if (journal.operationId !== options.expectedJournalOperationId) {
    throw new ProjectArchiveJournalError(
      `Creation journal changed from ${options.expectedJournalOperationId} to ${journal.operationId}`,
    );
  }
  assertProjectNotTombstoned(dataDir, projectId);
  validatePublishedArtifacts(dataDir, journal);

  const lock = inspectProjectBoundaryLock(dataDir, projectId, options);
  if (lock.exists && !lock.stale) throw new ProjectArchiveJournalError(`Project ${projectId} still has a live creator`);
  if (lock.owner && options.expectedProjectLockOperationId !== lock.owner.operationId) {
    throw new ProjectArchiveJournalError(`Stale creator must be confirmed as ${lock.owner.operationId}`);
  }
  if (!lock.owner && lock.exists && options.allowUnreadableProjectLock !== true) {
    throw new ProjectArchiveJournalError('Unreadable stale creator requires explicit confirmation');
  }
  if (lock.owner && lock.owner.purpose !== 'publish' && lock.owner.purpose !== 'recovery') {
    throw new ProjectArchiveJournalError(`Creation recovery cannot adopt a ${lock.owner.purpose} boundary`);
  }
  if (lock.owner?.purpose === 'publish' && lock.owner.operationId !== journal.operationId) {
    throw new ProjectArchiveJournalError('Stale publish owner does not match the creation journal');
  }

  const existingAudit = lock.owner?.purpose === 'recovery'
    ? findInitiatedAudit(dataDir, projectId, journal.operationId, lock.owner.operationId)
    : !lock.exists ? findInitiatedAudit(dataDir, projectId, journal.operationId) : null;
  if (lock.owner?.purpose === 'recovery' && !existingAudit) {
    throw new ProjectArchiveJournalError('Stale creation recovery owner has no matching initiated audit');
  }
  const recoveryOperationId = lock.owner?.purpose === 'recovery'
    ? lock.owner.operationId
    : existingAudit
      ? JSON.parse(fs.readFileSync(existingAudit, 'utf8')).recoveryOperationId
      : crypto.randomUUID();
  const directory = auditRoot(dataDir);
  fs.mkdirSync(directory, { recursive: true });
  const auditFile = existingAudit || path.join(directory, `${projectId}_${Date.now()}_${crypto.randomUUID()}.json`);
  if (!existingAudit) {
    atomicWriteJsonSync(auditFile, {
      version: 1,
      state: 'initiated',
      projectId,
      journalOperationId: journal.operationId,
      observedProjectLockOperationId: lock.owner?.operationId,
      recoveryOperationId,
      reason,
      initiatedAt: Date.now(),
      pid: process.pid,
    }, { backup: false });
  }

  if (lock.exists) {
    clearStaleProjectBoundaryLock(dataDir, projectId, {
      staleAfterMs: options.staleAfterMs,
      now: options.now,
      expectedOperationId: lock.owner?.operationId,
      allowUnreadableOwner: !lock.owner && options.allowUnreadableProjectLock === true,
    });
  }
  const recovery = acquireProjectBoundaryLock(dataDir, projectId, 'recovery', {
    ...options,
    operationId: recoveryOperationId,
  });
  let project: Project;
  let catalogAction: 'published' | 'already-published';
  let publicationSettlement: 'none' | 'completed' | 'rolled-back' = 'none';
  try {
    options.onRecoveryLockAcquired?.(recovery.owner.operationId);
    assertProjectNotTombstoned(dataDir, projectId);
    const publication = inspectProjectPublicationJournal(dataDir, projectId, options).journal
      ? reconcileProjectPublicationJournal(recovery)
      : { action: 'none' as const };
    if (publication.action === 'active-current-operation') {
      throw new ProjectArchiveJournalError('Creation recovery cannot own the abandoned publication operation');
    }
    publicationSettlement = publication.action;
    validatePublishedArtifacts(dataDir, journal);

    const catalogLock = acquireCatalogBoundaryLock(dataDir, options);
    try {
      const catalog = readCatalog(dataDir);
      const existing = catalog.find(row => row.id === projectId);
      if (existing) {
        project = existing;
        catalogAction = 'already-published';
      } else {
        const nextProject = { ...journal.project, isActive: journal.activate };
        const next = journal.activate
          ? [...catalog.map(row => ({ ...row, isActive: false })), nextProject]
          : [...catalog, nextProject];
        atomicWriteJsonSync(path.join(dataDir, 'projects.json'), next);
        project = nextProject;
        catalogAction = 'published';
      }
    } finally {
      catalogLock.release();
    }
    retire(dataDir, projectId);
  } finally {
    recovery.release();
  }

  try {
    const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
    atomicWriteJsonSync(auditFile, {
      ...audit,
      state: 'complete',
      completedAt: Date.now(),
      catalogAction,
      publicationSettlement,
    }, { backup: false });
  } catch { /* initiated record survives */ }
  return {
    project: project!,
    catalogAction: catalogAction!,
    publicationSettlement,
    auditFile: path.relative(dataDir, auditFile),
  };
}
