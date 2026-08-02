/**
 * Durable project archive boundary.
 *
 * The studio can have two checkout-local processes pointed at the same
 * DATA_DIR (often through two different symlink spellings). In-memory Sets and
 * promise chains cannot coordinate those processes. These primitives use only
 * atomic filesystem operations beneath DATA_DIR:
 *
 * - mkdir of a final lock directory is the cross-process ownership claim;
 * - a fixed tombstone survives a successful archive and prevents a stale
 *   process/catalog cache from resurrecting the project;
 * - the tombstone carries a small forward-recovery journal for partial moves.
 *
 * Deliberately do not realpath DATA_DIR. Filesystem traversal through either
 * symlink reaches the same inode while each checkout keeps its valid lexical
 * workspace shape.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { assertSafeProjectId } from '../security/local-boundary';
import { atomicWriteJsonSync } from './atomic-write';

const BOUNDARY_DIR = '.archive-boundary';
const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1000;
const DEFAULT_WAIT_MS = 5_000;
const DEFAULT_RETRY_MS = 20;

export type ProjectBoundaryPurpose = 'publish' | 'archive' | 'restore' | 'recovery';
export type ArchiveMoveStatus = 'pending' | 'moved' | 'missing' | 'restored';
export type ProjectArchiveState = 'archiving' | 'archived' | 'recovery-required';

export interface BoundaryLockOwner {
  operationId: string;
  purpose: ProjectBoundaryPurpose | 'catalog';
  pid: number;
  hostname: string;
  createdAt: number;
  heartbeatAt: number;
}

export interface ProjectArchiveAdoption {
  previousOperationId: string;
  previousOwner: BoundaryLockOwner;
  previousState: ProjectArchiveState;
  previousError?: string;
  adoptedAt: number;
  adoptedBy: BoundaryLockOwner;
  reason: string;
}

export interface ProjectArchiveMove {
  from: string;
  to: string;
  status: ArchiveMoveStatus;
}

export interface ProjectArchiveTombstone {
  version: 1;
  projectId: string;
  operationId: string;
  state: ProjectArchiveState;
  owner: BoundaryLockOwner;
  archiveDir: string;
  journal: {
    moves: ProjectArchiveMove[];
    catalog: 'pending' | 'removed';
  };
  createdAt: number;
  updatedAt: number;
  error?: string;
  adoptionHistory?: ProjectArchiveAdoption[];
}

export interface LockInspection {
  lockDir: string;
  exists: boolean;
  stale: boolean;
  /** Timestamp used as the stale-owner evidence (heartbeat, or dir mtime). */
  evidenceAt?: number;
  owner?: BoundaryLockOwner;
  unreadableOwner?: boolean;
}

export interface LockAcquireOptions {
  staleAfterMs?: number;
  waitMs?: number;
  retryMs?: number;
  now?: () => number;
  /** Precommitted recovery identity. Ordinary callers should let the boundary generate it. */
  operationId?: string;
}

/** Clearing a stale owner is intentionally a two-step operator action:
 * inspect first, then confirm the exact operation id observed. An unreadable
 * owner has no operation id, so clearing it requires a separate explicit flag. */
export interface StaleLockClearOptions extends Pick<LockAcquireOptions, 'staleAfterMs' | 'now'> {
  expectedOperationId?: string;
  allowUnreadableOwner?: boolean;
}

export interface StaleLockClearResult {
  cleared: boolean;
  inspection: LockInspection;
}

export interface TombstoneAdoptionOptions {
  /** Operation id read from the tombstone before the abandoned lock was cleared. */
  expectedOperationId: string;
  /** Human/operator explanation retained in the durable adoption history. */
  reason: string;
}

export class ProjectBoundaryLockedError extends Error {
  readonly code: 'PROJECT_BOUNDARY_LOCKED' | 'PROJECT_BOUNDARY_STALE';
  readonly stale: boolean;
  readonly inspection: LockInspection;

  constructor(label: string, inspection: LockInspection) {
    const stale = inspection.stale;
    super(stale
      ? `${label} has a stale filesystem owner; explicit recovery is required`
      : `${label} is locked by another process`);
    this.name = 'ProjectBoundaryLockedError';
    this.code = stale ? 'PROJECT_BOUNDARY_STALE' : 'PROJECT_BOUNDARY_LOCKED';
    this.stale = stale;
    this.inspection = inspection;
  }
}

export class ProjectTombstonedError extends Error {
  readonly code = 'PROJECT_TOMBSTONED';
  readonly projectId: string;
  readonly tombstone?: ProjectArchiveTombstone;

  constructor(projectId: string, tombstone?: ProjectArchiveTombstone) {
    super(tombstone
      ? `Project ${projectId} is ${tombstone.state}`
      : `Project ${projectId} has an unreadable archive tombstone; explicit recovery is required`);
    this.name = 'ProjectTombstonedError';
    this.projectId = projectId;
    this.tombstone = tombstone;
  }
}

export class ProjectArchiveJournalError extends Error {
  readonly code = 'PROJECT_ARCHIVE_JOURNAL_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'ProjectArchiveJournalError';
  }
}

export interface ProjectBoundaryLock {
  readonly kind: 'project';
  readonly dataDir: string;
  readonly projectId: string;
  readonly lockDir: string;
  owner: BoundaryLockOwner;
  heartbeat(): void;
  release(): void;
}

export interface CatalogBoundaryLock {
  readonly kind: 'catalog';
  readonly dataDir: string;
  readonly lockDir: string;
  owner: BoundaryLockOwner;
  heartbeat(): void;
  release(): void;
}

function boundaryRoot(dataDir: string): string {
  // path.resolve is lexical; it intentionally does not dereference symlinks.
  return path.join(path.resolve(dataDir), BOUNDARY_DIR);
}

function projectLockDir(dataDir: string, projectIdInput: string): string {
  const projectId = assertSafeProjectId(projectIdInput);
  return path.join(boundaryRoot(dataDir), 'locks', 'projects', `${projectId}.lock`);
}

function catalogLockDir(dataDir: string): string {
  return path.join(boundaryRoot(dataDir), 'locks', 'catalog.lock');
}

export function projectArchiveTombstonePath(dataDir: string, projectIdInput: string): string {
  const projectId = assertSafeProjectId(projectIdInput);
  return path.join(boundaryRoot(dataDir), 'tombstones', 'projects', `${projectId}.json`);
}

function ownerPath(lockDir: string): string {
  return path.join(lockDir, 'owner.json');
}

function isBoundaryLockOwner(value: unknown): value is BoundaryLockOwner {
  const owner = value as Partial<BoundaryLockOwner> | null;
  return Boolean(
    owner
    && typeof owner.operationId === 'string'
    && owner.operationId.length > 0
    && (owner.purpose === 'publish'
      || owner.purpose === 'archive'
      || owner.purpose === 'restore'
      || owner.purpose === 'recovery'
      || owner.purpose === 'catalog')
    && typeof owner.pid === 'number'
    && Number.isInteger(owner.pid)
    && typeof owner.hostname === 'string'
    && owner.hostname.length > 0
    && typeof owner.createdAt === 'number'
    && Number.isFinite(owner.createdAt)
    && typeof owner.heartbeatAt === 'number'
    && Number.isFinite(owner.heartbeatAt)
  );
}

function readOwner(lockDir: string): BoundaryLockOwner | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(ownerPath(lockDir), 'utf8'));
    return isBoundaryLockOwner(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function inspectLockDir(
  lockDir: string,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
  now = Date.now(),
): LockInspection {
  if (!fs.existsSync(lockDir)) return { lockDir, exists: false, stale: false };

  const owner = readOwner(lockDir);
  let lastEvidenceAt = owner?.heartbeatAt;
  if (lastEvidenceAt === undefined) {
    try { lastEvidenceAt = fs.statSync(lockDir).mtimeMs; } catch { lastEvidenceAt = 0; }
  }
  return {
    lockDir,
    exists: true,
    stale: now - lastEvidenceAt > staleAfterMs,
    evidenceAt: lastEvidenceAt,
    ...(owner ? { owner } : { unreadableOwner: true }),
  };
}

export function inspectProjectBoundaryLock(
  dataDir: string,
  projectId: string,
  options: Pick<LockAcquireOptions, 'staleAfterMs' | 'now'> = {},
): LockInspection {
  const now = options.now?.() ?? Date.now();
  return inspectLockDir(projectLockDir(dataDir, projectId), options.staleAfterMs, now);
}

export function inspectCatalogBoundaryLock(
  dataDir: string,
  options: Pick<LockAcquireOptions, 'staleAfterMs' | 'now'> = {},
): LockInspection {
  const now = options.now?.() ?? Date.now();
  return inspectLockDir(catalogLockDir(dataDir), options.staleAfterMs, now);
}

function sameLockEvidence(first: LockInspection, second: LockInspection): boolean {
  if (!first.exists || !second.exists) return first.exists === second.exists;
  if (first.owner || second.owner) {
    return Boolean(
      first.owner
      && second.owner
      && first.owner.operationId === second.owner.operationId
      && first.owner.createdAt === second.owner.createdAt
      && first.owner.heartbeatAt === second.owner.heartbeatAt,
    );
  }
  return first.unreadableOwner === true
    && second.unreadableOwner === true
    && first.evidenceAt === second.evidenceAt;
}

function restoreQuarantinedLock(lockDir: string, quarantineDir: string): void {
  if (fs.existsSync(lockDir)) {
    throw new ProjectArchiveJournalError(
      `Lock ownership changed during stale-owner recovery; evidence is preserved at ${quarantineDir}`,
    );
  }
  try {
    fs.renameSync(quarantineDir, lockDir);
  } catch (error: any) {
    throw new ProjectArchiveJournalError(
      `Could not restore lock after stale-owner recovery was refused: ${error?.message || error}; evidence is preserved at ${quarantineDir}`,
    );
  }
}

function clearStaleLockDir(
  lockDir: string,
  label: string,
  options: StaleLockClearOptions,
): StaleLockClearResult {
  const observedAt = options.now?.() ?? Date.now();
  const inspection = inspectLockDir(lockDir, options.staleAfterMs, observedAt);
  if (!inspection.exists) return { cleared: false, inspection };
  if (!inspection.stale) throw new ProjectBoundaryLockedError(label, inspection);

  if (inspection.owner) {
    if (!options.expectedOperationId) {
      throw new ProjectArchiveJournalError(
        `Refusing to clear stale ${label}: expectedOperationId from a prior inspection is required`,
      );
    }
    if (options.expectedOperationId !== inspection.owner.operationId) {
      throw new ProjectArchiveJournalError(
        `Refusing to clear stale ${label}: owner changed from ${options.expectedOperationId} to ${inspection.owner.operationId}`,
      );
    }
  } else if (options.allowUnreadableOwner !== true) {
    throw new ProjectArchiveJournalError(
      `Refusing to clear stale ${label} with an unreadable owner without allowUnreadableOwner=true`,
    );
  }

  // Rename is the destructive-operation claim. Once moved, the abandoned
  // process still addresses the original path and cannot mutate this evidence.
  // Re-inspect the quarantined directory before deleting it so a heartbeat or
  // owner replacement that raced the first inspection is never erased.
  const quarantineDir = `${lockDir}.clearing-${crypto.randomUUID()}`;
  try {
    fs.renameSync(lockDir, quarantineDir);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return {
        cleared: false,
        inspection: inspectLockDir(lockDir, options.staleAfterMs, observedAt),
      };
    }
    throw error;
  }

  const claimed = inspectLockDir(quarantineDir, options.staleAfterMs, observedAt);
  if (!claimed.stale || !sameLockEvidence(inspection, claimed)) {
    restoreQuarantinedLock(lockDir, quarantineDir);
    if (!claimed.stale) {
      throw new ProjectBoundaryLockedError(label, { ...claimed, lockDir });
    }
    throw new ProjectArchiveJournalError(
      `Refusing to clear stale ${label}: lock evidence changed during recovery`,
    );
  }

  try {
    fs.rmSync(quarantineDir, { recursive: true });
  } catch (error: any) {
    // Preserve fail-closed ownership when cleanup itself fails. If a new owner
    // already claimed the canonical path, never disturb it; retain the stale
    // evidence beside it for explicit operator inspection.
    if (!fs.existsSync(lockDir)) {
      try { fs.renameSync(quarantineDir, lockDir); } catch (restoreError: any) {
        throw new ProjectArchiveJournalError(
          `Failed to clear stale ${label} and could not restore its boundary: ${restoreError?.message || restoreError}; evidence may remain at ${quarantineDir}`,
        );
      }
    }
    throw error;
  }

  return { cleared: true, inspection };
}

/** Explicit operator primitive. Fresh ownership is never cleared, and a
 * readable stale owner requires confirmation of the inspected operation id. */
export function clearStaleProjectBoundaryLock(
  dataDir: string,
  projectIdInput: string,
  options: StaleLockClearOptions = {},
): StaleLockClearResult {
  const projectId = assertSafeProjectId(projectIdInput);
  return clearStaleLockDir(projectLockDir(dataDir, projectId), `Project ${projectId}`, options);
}

/** Catalog counterpart to clearStaleProjectBoundaryLock. */
export function clearStaleCatalogBoundaryLock(
  dataDir: string,
  options: StaleLockClearOptions = {},
): StaleLockClearResult {
  return clearStaleLockDir(catalogLockDir(dataDir), 'Project catalog', options);
}

function assertLockOwner(lockDir: string, operationId: string): BoundaryLockOwner {
  const current = readOwner(lockDir);
  if (!current || current.operationId !== operationId) {
    throw new ProjectArchiveJournalError(
      `Refusing to alter lock ${lockDir}: filesystem ownership no longer matches ${operationId}`,
    );
  }
  return current;
}

function acquireLockDir(
  dataDir: string,
  lockDir: string,
  purpose: BoundaryLockOwner['purpose'],
  label: string,
  options: LockAcquireOptions = {},
): { dataDir: string; lockDir: string; owner: BoundaryLockOwner; heartbeat(): void; release(): void } {
  const normalizedDataDir = path.resolve(dataDir);
  const operationId = options.operationId ?? crypto.randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)) {
    throw new ProjectArchiveJournalError('Boundary operationId must be a UUID');
  }
  fs.mkdirSync(path.dirname(lockDir), { recursive: true });
  try {
    // The parent may be recursive; the final ownership claim never is.
    fs.mkdirSync(lockDir);
  } catch (error: any) {
    if (error?.code !== 'EEXIST') throw error;
    throw new ProjectBoundaryLockedError(
      label,
      inspectLockDir(lockDir, options.staleAfterMs, options.now?.() ?? Date.now()),
    );
  }

  const at = options.now?.() ?? Date.now();
  let owner: BoundaryLockOwner = {
    operationId,
    purpose,
    pid: process.pid,
    hostname: os.hostname(),
    createdAt: at,
    heartbeatAt: at,
  };

  try {
    atomicWriteJsonSync(ownerPath(lockDir), owner, { backup: false });
  } catch (error) {
    try { fs.rmSync(lockDir, { recursive: true, force: true }); } catch { /* best effort */ }
    throw error;
  }

  let released = false;
  return {
    dataDir: normalizedDataDir,
    lockDir,
    get owner() { return owner; },
    set owner(next: BoundaryLockOwner) { owner = next; },
    heartbeat() {
      if (released) throw new ProjectArchiveJournalError(`Cannot heartbeat released lock ${lockDir}`);
      assertLockOwner(lockDir, owner.operationId);
      owner = { ...owner, heartbeatAt: options.now?.() ?? Date.now() };
      atomicWriteJsonSync(ownerPath(lockDir), owner, { backup: false });
    },
    release() {
      if (released) return;
      assertLockOwner(lockDir, owner.operationId);
      fs.rmSync(lockDir, { recursive: true });
      released = true;
    },
  };
}

export function acquireProjectBoundaryLock(
  dataDir: string,
  projectIdInput: string,
  purpose: ProjectBoundaryPurpose,
  options: LockAcquireOptions = {},
): ProjectBoundaryLock {
  const projectId = assertSafeProjectId(projectIdInput);
  const base = acquireLockDir(
    dataDir,
    projectLockDir(dataDir, projectId),
    purpose,
    `Project ${projectId}`,
    options,
  );
  return {
    kind: 'project',
    projectId,
    dataDir: base.dataDir,
    lockDir: base.lockDir,
    get owner() { return base.owner; },
    set owner(next: BoundaryLockOwner) { base.owner = next; },
    heartbeat: () => base.heartbeat(),
    release: () => base.release(),
  };
}

export function acquireCatalogBoundaryLock(
  dataDir: string,
  options: LockAcquireOptions = {},
): CatalogBoundaryLock {
  const base = acquireLockDir(dataDir, catalogLockDir(dataDir), 'catalog', 'Project catalog', options);
  return {
    kind: 'catalog',
    dataDir: base.dataDir,
    lockDir: base.lockDir,
    get owner() { return base.owner; },
    set owner(next: BoundaryLockOwner) { base.owner = next; },
    heartbeat: () => base.heartbeat(),
    release: () => base.release(),
  };
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function acquireWithWait<T>(
  acquire: () => T,
  options: LockAcquireOptions,
): Promise<T> {
  // Retry duration is wall-clock even when a deterministic `now` is injected
  // for stale-owner inspection; a frozen test clock must not create an
  // infinite lock wait.
  const deadline = Date.now() + (options.waitMs ?? DEFAULT_WAIT_MS);
  const retryMs = Math.max(1, options.retryMs ?? DEFAULT_RETRY_MS);
  while (true) {
    try {
      return acquire();
    } catch (error) {
      if (!(error instanceof ProjectBoundaryLockedError)) throw error;
      // A stale/ambiguous owner is a recovery transaction, not a lock to
      // silently steal. Fresh ownership can be waited out for a short period.
      if (error.stale || Date.now() >= deadline) throw error;
      await wait(retryMs);
    }
  }
}

export function acquireProjectBoundaryLockAsync(
  dataDir: string,
  projectId: string,
  purpose: ProjectBoundaryPurpose,
  options: LockAcquireOptions = {},
): Promise<ProjectBoundaryLock> {
  return acquireWithWait(
    () => acquireProjectBoundaryLock(dataDir, projectId, purpose, options),
    options,
  );
}

export function acquireCatalogBoundaryLockAsync(
  dataDir: string,
  options: LockAcquireOptions = {},
): Promise<CatalogBoundaryLock> {
  return acquireWithWait(() => acquireCatalogBoundaryLock(dataDir, options), options);
}

function assertRelativeStoragePath(dataDir: string, value: string, label: string): string {
  if (!value || typeof value !== 'string' || path.isAbsolute(value)) {
    throw new ProjectArchiveJournalError(`${label} must be a non-empty DATA_DIR-relative path`);
  }
  const root = path.resolve(dataDir);
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new ProjectArchiveJournalError(`${label} escapes DATA_DIR`);
  }
  return relative;
}

function assertProjectArchiveDir(
  dataDir: string,
  projectId: string,
  value: string,
): string {
  const archiveDir = assertRelativeStoragePath(dataDir, value, 'archiveDir');
  const expectedParent = path.join('trash', 'projects');
  const basename = path.basename(archiveDir);
  if (
    path.dirname(archiveDir) !== expectedParent
    || !basename.startsWith(`${projectId}_`)
    || basename.length <= projectId.length + 1
  ) {
    throw new ProjectArchiveJournalError(
      `archiveDir must be a project-owned directory beneath ${expectedParent}/${projectId}_…`,
    );
  }
  return archiveDir;
}

function assertProjectArchiveMove(
  dataDir: string,
  projectId: string,
  archiveDir: string,
  move: { from: string; to: string },
): { from: string; to: string } {
  const from = assertRelativeStoragePath(dataDir, move?.from, 'move.from');
  const to = assertRelativeStoragePath(dataDir, move?.to, 'move.to');
  const allowedSources = new Set(expectedProjectArchiveMoveSources(projectId));
  if (!allowedSources.has(from)) {
    throw new ProjectArchiveJournalError(
      `Archive move source is not owned by ${projectId}: ${from}`,
    );
  }
  const expectedDestination = path.join(archiveDir, from);
  if (to !== expectedDestination) {
    throw new ProjectArchiveJournalError(
      `Archive move destination must be ${expectedDestination}: ${to}`,
    );
  }
  return { from, to };
}

function expectedProjectArchiveMoveSources(projectId: string): string[] {
  return [
    `project_${projectId}.json`,
    `project_${projectId}.json.bak`,
    path.join('nit', `${projectId}.json`),
    path.join('nit', `${projectId}.json.bak`),
  ];
}

function hasExactProjectArchiveMoveSources(projectId: string, sources: Set<string>): boolean {
  const expected = expectedProjectArchiveMoveSources(projectId);
  return sources.size === expected.length && expected.every(source => sources.has(source));
}

function assertProjectLock(lock: ProjectBoundaryLock): void {
  assertSafeProjectId(lock.projectId);
  assertLockOwner(lock.lockDir, lock.owner.operationId);
}

function assertSameStorageRoot(first: string, second: string): void {
  try {
    const a = fs.statSync(path.resolve(first));
    const b = fs.statSync(path.resolve(second));
    if (a.dev === b.dev && a.ino === b.ino) return;
  } catch {
    // Fall through to the fail-closed error below.
  }
  throw new ProjectArchiveJournalError('Boundary lock belongs to a different DATA_DIR');
}

export function readProjectArchiveTombstone(
  dataDir: string,
  projectIdInput: string,
): ProjectArchiveTombstone | null {
  const projectId = assertSafeProjectId(projectIdInput);
  const file = projectArchiveTombstonePath(dataDir, projectId);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as ProjectArchiveTombstone;
    const validState = parsed?.state === 'archiving'
      || parsed?.state === 'archived'
      || parsed?.state === 'recovery-required';
    const archiveDir = assertProjectArchiveDir(dataDir, projectId, parsed?.archiveDir);
    const seenMoveSources = new Set<string>();
    const validMoves = Array.isArray(parsed?.journal?.moves)
      && parsed.journal.moves.every(move => {
        const { from, to } = assertProjectArchiveMove(dataDir, projectId, archiveDir, move);
        const uniqueSource = !seenMoveSources.has(from);
        seenMoveSources.add(from);
        return uniqueSource
          && from !== to
          && (move?.status === 'pending'
            || move?.status === 'moved'
            || move?.status === 'missing'
            || move?.status === 'restored');
      })
      && hasExactProjectArchiveMoveSources(projectId, seenMoveSources);
    const validAdoptions = parsed?.adoptionHistory === undefined
      || (Array.isArray(parsed.adoptionHistory) && parsed.adoptionHistory.every(adoption => (
        typeof adoption?.previousOperationId === 'string'
        && adoption.previousOperationId.length > 0
        && isBoundaryLockOwner(adoption.previousOwner)
        && (adoption.previousState === 'archiving'
          || adoption.previousState === 'archived'
          || adoption.previousState === 'recovery-required')
        && (adoption.previousError === undefined || typeof adoption.previousError === 'string')
        && typeof adoption.adoptedAt === 'number'
        && Number.isFinite(adoption.adoptedAt)
        && isBoundaryLockOwner(adoption.adoptedBy)
        && (adoption.adoptedBy.purpose === 'restore' || adoption.adoptedBy.purpose === 'recovery')
        && typeof adoption.reason === 'string'
        && adoption.reason.length > 0
      )));
    if (
      parsed?.version !== 1
      || parsed?.projectId !== projectId
      || typeof parsed?.operationId !== 'string'
      || parsed.operationId.length === 0
      || !isBoundaryLockOwner(parsed.owner)
      || parsed.owner.operationId !== parsed.operationId
      || (parsed.owner.purpose !== 'archive'
        && parsed.owner.purpose !== 'restore'
        && parsed.owner.purpose !== 'recovery')
      || !validState
      || !validMoves
      || !validAdoptions
      || (parsed?.journal?.catalog !== 'pending' && parsed?.journal?.catalog !== 'removed')
      || typeof parsed.createdAt !== 'number'
      || !Number.isFinite(parsed.createdAt)
      || typeof parsed.updatedAt !== 'number'
      || !Number.isFinite(parsed.updatedAt)
      || (parsed.error !== undefined && typeof parsed.error !== 'string')
    ) {
      throw new Error('invalid tombstone shape');
    }
    return parsed;
  } catch {
    // Presence is the safety signal. Corruption must block, never be treated
    // as absence and allow a stale writer to recreate the project.
    throw new ProjectTombstonedError(projectId);
  }
}

export function assertProjectNotTombstoned(dataDir: string, projectIdInput: string): void {
  const projectId = assertSafeProjectId(projectIdInput);
  const file = projectArchiveTombstonePath(dataDir, projectId);
  if (!fs.existsSync(file)) return;
  let tombstone: ProjectArchiveTombstone | undefined;
  try { tombstone = readProjectArchiveTombstone(dataDir, projectId) || undefined; } catch { /* fail closed below */ }
  throw new ProjectTombstonedError(projectId, tombstone);
}

export function tombstonedProjectIds(dataDir: string): Set<string> {
  const dir = path.dirname(projectArchiveTombstonePath(dataDir, 'placeholder'));
  const ids = new Set<string>();
  if (!fs.existsSync(dir)) return ids;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const candidate = entry.name.slice(0, -'.json'.length);
    try { ids.add(assertSafeProjectId(candidate)); } catch { /* unrelated/corrupt filename */ }
  }
  return ids;
}

export function filterTombstonedProjects<T extends { id: string }>(dataDir: string, projects: T[]): T[] {
  const tombstoned = tombstonedProjectIds(dataDir);
  if (tombstoned.size === 0) return [...projects];
  return projects.filter(project => !tombstoned.has(project.id));
}

/** Catalog restoration exception for a verified rollback/restore transaction.
 * Ordinary writers must use filterTombstonedProjects. This variant requires
 * live ownership of the tombstoned project's boundary, so the catalog can be
 * restored while the marker remains in place and is removed LAST. Other
 * tombstoned projects are still filtered. */
export function filterTombstonedProjectsForRestore<T extends { id: string }>(
  dataDir: string,
  projects: T[],
  lock: ProjectBoundaryLock,
): T[] {
  assertProjectLock(lock);
  if (lock.owner.purpose !== 'archive'
    && lock.owner.purpose !== 'restore'
    && lock.owner.purpose !== 'recovery') {
    throw new ProjectArchiveJournalError(
      `A ${lock.owner.purpose} boundary cannot bypass an archive tombstone`,
    );
  }
  // stat follows the symlink without rewriting/rejecting its lexical spelling.
  // This admits the two-checkout shape but prevents a lock from another store
  // being used as a tombstone bypass token.
  assertSameStorageRoot(dataDir, lock.dataDir);
  const tombstone = readProjectArchiveTombstone(dataDir, lock.projectId);
  if (!tombstone) {
    throw new ProjectArchiveJournalError(`No archive tombstone for ${lock.projectId}`);
  }
  if (tombstone.operationId !== lock.owner.operationId) {
    throw new ProjectArchiveJournalError(
      `Archive ${tombstone.operationId} is not owned by lock ${lock.owner.operationId}`,
    );
  }
  const tombstoned = tombstonedProjectIds(dataDir);
  tombstoned.delete(lock.projectId);
  return projects.filter(project => !tombstoned.has(project.id));
}

export function createProjectArchiveTombstone(
  lock: ProjectBoundaryLock,
  input: { archiveDir: string; moves: Array<{ from: string; to: string }> },
): ProjectArchiveTombstone {
  assertProjectLock(lock);
  if (lock.owner.purpose !== 'archive') {
    throw new ProjectArchiveJournalError('Only an archive boundary can create a new archive tombstone');
  }
  const file = projectArchiveTombstonePath(lock.dataDir, lock.projectId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const at = Date.now();
  const archiveDir = assertProjectArchiveDir(lock.dataDir, lock.projectId, input.archiveDir);
  const moveSources = new Set<string>();
  const moves = input.moves.map(move => {
    const { from, to } = assertProjectArchiveMove(
      lock.dataDir,
      lock.projectId,
      archiveDir,
      move,
    );
    if (moveSources.has(from)) {
      throw new ProjectArchiveJournalError(`Duplicate archive move source: ${from}`);
    }
    moveSources.add(from);
    return { from, to, status: 'pending' as const };
  });
  if (!hasExactProjectArchiveMoveSources(lock.projectId, moveSources)) {
    throw new ProjectArchiveJournalError(
      `Archive journal for ${lock.projectId} must contain exactly its world, world backup, nit ledger, and nit backup`,
    );
  }
  const tombstone: ProjectArchiveTombstone = {
    version: 1,
    projectId: lock.projectId,
    operationId: lock.owner.operationId,
    state: 'archiving',
    owner: lock.owner,
    archiveDir,
    journal: {
      moves,
      catalog: 'pending',
    },
    createdAt: at,
    updatedAt: at,
  };

  let fd: number | undefined;
  let createdByThisCall = false;
  try {
    // O_EXCL is the durable tombstone claim. A torn/unreadable file still
    // blocks through filename presence and requires explicit recovery.
    fd = fs.openSync(file, 'wx', 0o600);
    createdByThisCall = true;
    fs.writeFileSync(fd, `${JSON.stringify(tombstone, null, 2)}\n`);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    return tombstone;
  } catch (error: any) {
    if (error?.code === 'EEXIST') {
      let existing: ProjectArchiveTombstone | undefined;
      try { existing = readProjectArchiveTombstone(lock.dataDir, lock.projectId) || undefined; } catch { /* fail closed */ }
      throw new ProjectTombstonedError(lock.projectId, existing);
    }

    // No catalog/file move happens before tombstone creation returns, so this
    // operation may safely remove only the partial file it created. If the
    // marker cannot be removed, leave filename presence as the fail-closed
    // barrier and make the recovery requirement explicit in the error.
    const cleanupErrors: string[] = [];
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (closeError: any) {
        cleanupErrors.push(`close failed: ${closeError?.message || closeError}`);
      }
      fd = undefined;
    }
    if (createdByThisCall) {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch (unlinkError: any) {
        cleanupErrors.push(`unlink failed: ${unlinkError?.message || unlinkError}`);
      }
    }
    let markerRemains = false;
    try { markerRemains = fs.existsSync(file); } catch (existsError: any) {
      markerRemains = true;
      cleanupErrors.push(`marker verification failed: ${existsError?.message || existsError}`);
    }
    if (markerRemains) {
      throw new ProjectArchiveJournalError(
        `Archive tombstone creation failed and its partial marker could not be removed; explicit recovery is required (${cleanupErrors.join('; ')}; original error: ${error?.message || error})`,
      );
    }
    throw error;
  }
}

/**
 * Transfer a valid abandoned journal to a newly acquired restore/recovery
 * boundary. The expected old operation id makes this an explicit adoption of
 * evidence the operator inspected, not a generic tombstone takeover.
 */
export function adoptProjectArchiveTombstone(
  lock: ProjectBoundaryLock,
  options: TombstoneAdoptionOptions,
): ProjectArchiveTombstone {
  assertProjectLock(lock);
  if (lock.owner.purpose !== 'restore' && lock.owner.purpose !== 'recovery') {
    throw new ProjectArchiveJournalError(
      `A ${lock.owner.purpose} boundary cannot adopt an archive tombstone`,
    );
  }
  const expectedOperationId = String(options?.expectedOperationId || '').trim();
  const reason = String(options?.reason || '').trim();
  if (!expectedOperationId) {
    throw new ProjectArchiveJournalError('Tombstone adoption requires the previously inspected operation id');
  }
  if (!reason) {
    throw new ProjectArchiveJournalError('Tombstone adoption requires an operator reason');
  }

  const current = readProjectArchiveTombstone(lock.dataDir, lock.projectId);
  if (!current) throw new ProjectArchiveJournalError(`No archive tombstone for ${lock.projectId}`);
  if (current.operationId !== expectedOperationId) {
    throw new ProjectArchiveJournalError(
      `Refusing tombstone adoption: expected ${expectedOperationId}, found ${current.operationId}`,
    );
  }

  const adoptedAt = Date.now();
  const adoption: ProjectArchiveAdoption = {
    previousOperationId: current.operationId,
    previousOwner: current.owner,
    previousState: current.state,
    ...(current.error !== undefined ? { previousError: current.error } : {}),
    adoptedAt,
    adoptedBy: lock.owner,
    reason,
  };
  const next: ProjectArchiveTombstone = {
    ...current,
    operationId: lock.owner.operationId,
    owner: lock.owner,
    state: lock.owner.purpose === 'recovery' ? 'recovery-required' : current.state,
    updatedAt: adoptedAt,
    ...(lock.owner.purpose === 'recovery'
      ? { error: `Adopted for recovery: ${reason}` }
      : {}),
    adoptionHistory: [...(current.adoptionHistory || []), adoption],
  };
  atomicWriteJsonSync(projectArchiveTombstonePath(lock.dataDir, lock.projectId), next, { backup: false });
  return next;
}

function updateTombstone(
  lock: ProjectBoundaryLock,
  update: (current: ProjectArchiveTombstone) => ProjectArchiveTombstone,
): ProjectArchiveTombstone {
  assertProjectLock(lock);
  const current = readProjectArchiveTombstone(lock.dataDir, lock.projectId);
  if (!current) throw new ProjectArchiveJournalError(`No archive tombstone for ${lock.projectId}`);
  if (current.operationId !== lock.owner.operationId) {
    throw new ProjectArchiveJournalError(
      `Archive ${current.operationId} is not owned by lock ${lock.owner.operationId}`,
    );
  }
  const next = update(current);
  atomicWriteJsonSync(projectArchiveTombstonePath(lock.dataDir, lock.projectId), next, { backup: false });
  return next;
}

export function markProjectArchiveMove(
  lock: ProjectBoundaryLock,
  fromInput: string,
  status: Exclude<ArchiveMoveStatus, 'pending'>,
): ProjectArchiveTombstone {
  const from = assertRelativeStoragePath(lock.dataDir, fromInput, 'move.from');
  return updateTombstone(lock, current => {
    const index = current.journal.moves.findIndex(move => move.from === from);
    if (index < 0) throw new ProjectArchiveJournalError(`Move is not in archive journal: ${from}`);
    const moves = current.journal.moves.map((move, moveIndex) => moveIndex === index ? { ...move, status } : move);
    return { ...current, owner: lock.owner, journal: { ...current.journal, moves }, updatedAt: Date.now() };
  });
}

export function markProjectArchiveCatalogRemoved(lock: ProjectBoundaryLock): ProjectArchiveTombstone {
  return updateTombstone(lock, current => ({
    ...current,
    owner: lock.owner,
    journal: { ...current.journal, catalog: 'removed' },
    updatedAt: Date.now(),
  }));
}

export function markProjectArchiveComplete(lock: ProjectBoundaryLock): ProjectArchiveTombstone {
  return updateTombstone(lock, current => {
    const incomplete = current.journal.moves.filter(move => move.status === 'pending' || move.status === 'restored');
    if (incomplete.length > 0 || current.journal.catalog !== 'removed') {
      throw new ProjectArchiveJournalError(
        `Cannot complete archive with ${incomplete.length} incomplete move(s) and catalog=${current.journal.catalog}`,
      );
    }
    return { ...current, state: 'archived', owner: lock.owner, updatedAt: Date.now(), error: undefined };
  });
}

export function markProjectArchiveRecoveryRequired(
  lock: ProjectBoundaryLock,
  error: string,
): ProjectArchiveTombstone {
  return updateTombstone(lock, current => ({
    ...current,
    state: 'recovery-required',
    owner: lock.owner,
    updatedAt: Date.now(),
    error: String(error || 'Archive recovery required'),
  }));
}

/** Remove only after a verified full rollback or explicit restore. The caller
 * must hold the same project boundary throughout restoration and removes this
 * marker LAST, after live files + catalog are durable again. */
export function removeProjectArchiveTombstone(lock: ProjectBoundaryLock): void {
  assertProjectLock(lock);
  if (lock.owner.purpose !== 'archive'
    && lock.owner.purpose !== 'restore'
    && lock.owner.purpose !== 'recovery') {
    throw new ProjectArchiveJournalError(
      `A ${lock.owner.purpose} boundary cannot remove an archive tombstone`,
    );
  }
  const current = readProjectArchiveTombstone(lock.dataDir, lock.projectId);
  if (!current) return;
  if (current.operationId !== lock.owner.operationId) {
    throw new ProjectArchiveJournalError(
      `Archive ${current.operationId} is not owned by lock ${lock.owner.operationId}`,
    );
  }
  fs.unlinkSync(projectArchiveTombstonePath(lock.dataDir, lock.projectId));
}
