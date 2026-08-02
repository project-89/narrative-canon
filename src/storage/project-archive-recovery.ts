/**
 * Explicit operator recovery for durable project archives.
 *
 * This is deliberately separate from the API server. Recovery is a local,
 * confirmed maintenance operation: inspect first, confirm the exact project
 * and abandoned operation ids, then restore while holding the same filesystem
 * boundaries used by normal publication/archive traffic.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { isDeepStrictEqual } from 'util';
import { assertSafeProjectId } from '../security/local-boundary';
import { commitContentHash, workingTreeHash } from '../git/format/v1/canonicalize';
import { applyOperations } from '../git/format/v1/derive';
import { Commit, CommitSchema, KNOWN_NIT_FORMAT_VERSIONS, Narrative, NarrativeSchema } from '../git/format/v1/schemas';
import { atomicWriteJsonSync } from './atomic-write';
import {
  acquireCatalogBoundaryLock,
  acquireProjectBoundaryLock,
  adoptProjectArchiveTombstone,
  clearStaleCatalogBoundaryLock,
  clearStaleProjectBoundaryLock,
  filterTombstonedProjectsForRestore,
  inspectCatalogBoundaryLock,
  inspectProjectBoundaryLock,
  LockInspection,
  markProjectArchiveMove,
  ProjectArchiveJournalError,
  ProjectArchiveMove,
  ProjectArchiveTombstone,
  ProjectBoundaryLock,
  ProjectTombstonedError,
  projectArchiveTombstonePath,
  readProjectArchiveTombstone,
  removeProjectArchiveTombstone,
} from './project-archive-boundary';
import { Project } from './storage-adapter';

export type RecoveryMoveDisposition =
  | 'copy-from-archive'
  | 'live-source-intact'
  | 'expected-missing'
  | 'already-restored'
  | 'ambiguous-both-present'
  | 'ambiguous-both-missing'
  | 'ambiguous-live-only'
  | 'ambiguous-archive-only';

export interface ProjectArchiveRecoveryMoveInspection extends ProjectArchiveMove {
  liveExists: boolean;
  archiveExists: boolean;
  disposition: RecoveryMoveDisposition;
}

export interface ArchivedProjectMetadataInspection {
  path: string | null;
  exists: boolean;
  valid: boolean;
  project?: Project;
  error?: string;
}

export interface RecoveryFileEvidence {
  path: string;
  exists: boolean;
  regular: boolean;
  size?: number;
  sha256?: string;
  validJsonObject?: boolean;
  semanticKind?: 'world' | 'nit';
  validArtifact?: boolean;
  error?: string;
}

export interface UnreadableTombstoneInspection extends RecoveryFileEvidence {
  exists: true;
  regular: true;
  size: number;
  sha256: string;
}

export interface RecoverableWorldInspection {
  primaryLive: RecoveryFileEvidence;
  backupLive: RecoveryFileEvidence;
  primarySource: RecoveryFileEvidence | null;
  backupSource: RecoveryFileEvidence | null;
  canPublishPrimary: boolean;
  needsBackupPromotion: boolean;
  error?: string;
}

export interface RecoverableNitInspection extends RecoverableWorldInspection {
  /** Unlike the world blob, a project that never committed may have no nit files. */
  intentionallyAbsent: boolean;
}

export interface ProjectArchiveRecoveryInspection {
  dataDir: string;
  projectId: string;
  projectLock: LockInspection;
  catalogLock: LockInspection;
  tombstone: ProjectArchiveTombstone | null;
  unreadableTombstone: UnreadableTombstoneInspection | null;
  metadata: ArchivedProjectMetadataInspection;
  moves: ProjectArchiveRecoveryMoveInspection[];
  world: RecoverableWorldInspection;
  nit: RecoverableNitInspection;
  canRestoreFiles: boolean;
}

export interface InspectProjectArchiveRecoveryOptions {
  staleAfterMs?: number;
  now?: () => number;
}

export interface RestoreProjectArchiveOptions extends InspectProjectArchiveRecoveryOptions {
  /** Must exactly equal projectId. Prevents a copied command restoring a neighbour. */
  confirmProjectId: string;
  /** Exact operation id printed by inspect for the tombstone being adopted. */
  expectedTombstoneOperationId: string;
  /** Exact stale project owner printed by inspect, when one exists. */
  expectedProjectLockOperationId?: string;
  /** Exact stale catalog owner printed by inspect, when one exists. */
  expectedCatalogLockOperationId?: string;
  /** Exact mtime evidence printed by inspect for an unreadable stale owner. */
  expectedUnreadableProjectLockEvidenceAt?: number;
  /** Exact mtime evidence printed by inspect for an unreadable stale owner. */
  expectedUnreadableCatalogLockEvidenceAt?: number;
  reason: string;
}

export interface RestoreProjectArchiveResult {
  projectId: string;
  archiveDir: string;
  restoredFiles: string[];
  alreadyLiveFiles: string[];
  absentFiles: string[];
  catalogEntry: Project;
  auditFile: string;
  tombstoneRemoved: true;
  archiveArtifactsRetained: true;
}

export interface QuarantineUnreadableTombstoneOptions extends InspectProjectArchiveRecoveryOptions {
  confirmProjectId: string;
  expectedTombstoneSha256: string;
  expectedProjectLockOperationId?: string;
  expectedCatalogLockOperationId?: string;
  expectedUnreadableProjectLockEvidenceAt?: number;
  expectedUnreadableCatalogLockEvidenceAt?: number;
  reason: string;
}

export interface QuarantineUnreadableTombstoneResult {
  projectId: string;
  quarantinedPath: string;
  tombstoneSha256: string;
  catalogEntry: Project;
  auditFile: string;
  primaryPromotedFromBackup: boolean;
  nitPrimaryPromotedFromBackup: boolean;
  corruptMarkerRetained: true;
  archiveArtifactsRetained: true;
}

export interface RecoveryArtifactValidation {
  valid: boolean;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** Compatibility-conscious structural proof for the studio's authoritative
 * world blob. Unknown/additive fields are deliberately ignored and preserved;
 * only the load-bearing arrays whose absence would make loadProjectData fabricate an
 * empty world are required. */
export function validateRecoveryWorldArtifact(value: unknown): RecoveryArtifactValidation {
  if (!isRecord(value)) return { valid: false, error: 'World JSON root is not an object' };
  const requiredArrays = ['entities', 'relationships', 'commits', 'branches', 'interactions'] as const;
  const invalid = requiredArrays.filter(key => !Array.isArray(value[key]));
  return invalid.length === 0
    ? { valid: true }
    : { valid: false, error: `World is missing load-bearing array(s): ${invalid.join(', ')}` };
}

/** Structural, referential, and derivation proof for the canon ledger. A
 * parseable row is not enough: commit hashes must match their content and the
 * stored operation streams must replay to every claimed working-tree hash and
 * branch-head snapshot. */
export function validateRecoveryNitArtifact(value: unknown): RecoveryArtifactValidation {
  if (!isRecord(value)) return { valid: false, error: 'Nit JSON root is not an object' };
  if (!Array.isArray(value.commits)) return { valid: false, error: 'Nit commits must be an array' };
  if (!isRecord(value.branches)) return { valid: false, error: 'Nit branches must be an object' };

  const commitHashes = new Set<string>();
  for (let index = 0; index < value.commits.length; index += 1) {
    const commit = value.commits[index];
    if (!isRecord(commit)) return { valid: false, error: `Nit commit ${index} is not an object` };
    const hash = commit.hash;
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/i.test(hash)) {
      return { valid: false, error: `Nit commit ${index} has an invalid hash` };
    }
    if (commitHashes.has(hash)) return { valid: false, error: `Nit commit hash is duplicated: ${hash}` };
    commitHashes.add(hash);
    if (commit.parentHashes !== undefined) {
      if (!Array.isArray(commit.parentHashes)
        || commit.parentHashes.some(parent => typeof parent !== 'string' || !/^[a-f0-9]{64}$/i.test(parent))) {
        return { valid: false, error: `Nit commit ${index} has invalid parent hashes` };
      }
    }
  }
  for (let index = 0; index < value.commits.length; index += 1) {
    const commit = value.commits[index] as Record<string, unknown>;
    const missingParent = (commit.parentHashes as unknown[] | undefined)?.find(
      parent => !commitHashes.has(parent as string),
    );
    if (missingParent !== undefined) {
      return { valid: false, error: `Nit commit ${index} points to missing parent ${missingParent}` };
    }
  }
  const branchEntries = Object.entries(value.branches);
  if (value.commits.length > 0 && branchEntries.length === 0) {
    return { valid: false, error: 'Nit commits exist without any branch head' };
  }
  for (const [branchName, branchValue] of branchEntries) {
    if (!isRecord(branchValue)) return { valid: false, error: `Nit branch ${branchName} is not an object` };
    if (typeof branchValue.headHash !== 'string' || !/^[a-f0-9]{64}$/i.test(branchValue.headHash)) {
      return { valid: false, error: `Nit branch ${branchName} has an invalid head hash` };
    }
    if (!commitHashes.has(branchValue.headHash)) {
      return { valid: false, error: `Nit branch ${branchName} points to a missing commit` };
    }
    if (!isRecord(branchValue.lastSnapshot)) {
      return { valid: false, error: `Nit branch ${branchName} has an invalid derivation snapshot` };
    }
  }
  const commitByHash = new Map(
    value.commits.map(commit => [(commit as Record<string, unknown>).hash as string, commit as Record<string, unknown>]),
  );
  const reachable = new Set<string>();
  const pending = branchEntries.map(([, branch]) => (branch as Record<string, unknown>).headHash as string);
  while (pending.length > 0) {
    const hash = pending.pop()!;
    if (reachable.has(hash)) continue;
    reachable.add(hash);
    const commit = commitByHash.get(hash)!;
    for (const parent of (commit.parentHashes as string[] | undefined) || []) pending.push(parent);
  }
  if (reachable.size !== commitHashes.size) {
    const orphan = [...commitHashes].find(hash => !reachable.has(hash));
    return { valid: false, error: `Nit commit is unreachable from every branch head: ${orphan}` };
  }
  const commitIndex = new Map<string, number>();
  const parsedCommits: Commit[] = [];
  for (let index = 0; index < value.commits.length; index += 1) {
    const parsedCommit = CommitSchema.safeParse(value.commits[index]);
    if (!parsedCommit.success) {
      return {
        valid: false,
        error: `Nit commit ${index} violates the commit schema: ${parsedCommit.error.issues[0]?.message || 'invalid commit'}`,
      };
    }
    const commit = parsedCommit.data;
    if (commitContentHash(commit) !== commit.hash) {
      return { valid: false, error: `Nit commit ${index} content does not match its hash` };
    }
    for (const parent of commit.parentHashes) {
      if (!commitIndex.has(parent)) {
        return { valid: false, error: `Nit commit ${index} names a parent that does not precede it: ${parent}` };
      }
    }
    commitIndex.set(commit.hash, index);
    parsedCommits.push(commit);
  }
  const replayedCommits = new Set<string>();
  for (const [branchName, branchValue] of branchEntries) {
    const branch = branchValue as Record<string, unknown>;
    const parsedSnapshot = NarrativeSchema.safeParse(branch.lastSnapshot);
    if (!parsedSnapshot.success) {
      return {
        valid: false,
        error: `Nit branch ${branchName} has an invalid derivation snapshot: `
          + `${parsedSnapshot.error.issues[0]?.message || 'invalid narrative'}`,
      };
    }

    const reverseLineage: Commit[] = [];
    let cursor: Commit | undefined = parsedCommits[commitIndex.get(branch.headHash as string)!];
    while (cursor) {
      reverseLineage.push(cursor);
      // Merge materialization has not shipped: there is no durable merge-base
      // snapshot/checkpoint proving which parent the operation stream applies
      // to. Refuse an ambiguous recovery instead of guessing at canon.
      if (cursor.parentHashes.length > 1) {
        return {
          valid: false,
          error: `Nit commit ${cursor.hash} has multiple parents but no replay-base proof`,
        };
      }
      cursor = cursor.parentHashes.length === 1
        ? parsedCommits[commitIndex.get(cursor.parentHashes[0])!]
        : undefined;
    }

    let replayed: Narrative = {
      formatVersion: parsedSnapshot.data.formatVersion,
      metadata: parsedSnapshot.data.metadata,
      entities: [],
      relationships: [],
      scenes: [],
    };
    for (const commit of reverseLineage.reverse()) {
      if (typeof commit.workingTreeHash !== 'string') {
        return { valid: false, error: `Nit commit ${commit.hash} has no working-tree hash` };
      }
      try {
        replayed = applyOperations(replayed, commit.operations);
      } catch (error: any) {
        return {
          valid: false,
          error: `Nit commit ${commit.hash} operations cannot be replayed: ${error?.message || error}`,
        };
      }
      // A commit's workingTreeHash was computed under the formatVersion live
      // at commit time, and no op migrates formatVersion (the round-trip
      // gate's carve-out in derive.ts makes version bumps legal mid-lineage).
      // Tagged commits declare their version; untagged (pre-tag) commits get
      // the known-version list tried against them — self-verifying either
      // way, since only the true version reproduces the stored hash.
      if (commit.formatVersion) {
        replayed = { ...replayed, formatVersion: commit.formatVersion };
        if (workingTreeHash(replayed) !== commit.workingTreeHash) {
          return {
            valid: false,
            error: `Nit commit ${commit.hash} operations do not reconstruct its working tree`,
          };
        }
      } else if (workingTreeHash(replayed) !== commit.workingTreeHash) {
        const rescued = KNOWN_NIT_FORMAT_VERSIONS
          .filter(version => version !== replayed.formatVersion)
          .map(version => ({ ...replayed, formatVersion: version }))
          .find(candidate => workingTreeHash(candidate) === commit.workingTreeHash);
        if (!rescued) {
          return {
            valid: false,
            error: `Nit commit ${commit.hash} operations do not reconstruct its working tree under any known format version`,
          };
        }
        replayed = rescued;
      }
      replayedCommits.add(commit.hash);
    }
    if (workingTreeHash(replayed) !== workingTreeHash(branch.lastSnapshot)) {
      return { valid: false, error: `Nit branch ${branchName} replay does not reconstruct its derivation snapshot` };
    }
  }
  if (replayedCommits.size !== parsedCommits.length) {
    const unproved = parsedCommits.find(commit => !replayedCommits.has(commit.hash));
    return { valid: false, error: `Nit commit has no replayable branch proof: ${unproved?.hash}` };
  }
  return { valid: true };
}

/** Cross-file proof: every canon revision named by the authoritative world
 * must exist in the selected nit ledger, and each ledger branch head must be
 * the world's latest acknowledgement for that branch. A legacy world with no
 * nitHash may have no ledger; unacknowledged/ahead history is a torn pair. */
export function validateRecoveryWorldNitCoherence(
  worldValue: unknown,
  nitValue: unknown | null,
): RecoveryArtifactValidation {
  const worldValidation = validateRecoveryWorldArtifact(worldValue);
  if (!worldValidation.valid) return worldValidation;
  const references: Array<{ hash: string; branch?: string }> = [];
  for (const [index, commit] of ((worldValue as any).commits || []).entries()) {
    if (commit?.nitHash === undefined) continue;
    if (typeof commit.nitHash !== 'string' || !/^[a-f0-9]{64}$/i.test(commit.nitHash)) {
      return { valid: false, error: `World commit ${index} has an invalid nit hash` };
    }
    references.push({
      hash: commit.nitHash,
      ...(typeof commit.branch === 'string' && commit.branch.length > 0 ? { branch: commit.branch } : {}),
    });
  }
  if (nitValue === null || nitValue === undefined) {
    return references.length === 0
      ? { valid: true }
      : { valid: false, error: 'World references canon history but the nit ledger is absent' };
  }
  const nitValidation = validateRecoveryNitArtifact(nitValue);
  if (!nitValidation.valid) return nitValidation;
  if (references.length === 0) {
    return ((nitValue as any).commits || []).length === 0
      ? { valid: true }
      : { valid: false, error: 'Nit ledger contains canon history that no world commit acknowledges' };
  }
  const ledgerHashes = new Set(((nitValue as any).commits || []).map((commit: any) => commit?.hash));
  const missing = references.find(reference => !ledgerHashes.has(reference.hash));
  if (missing) return { valid: false, error: `Nit ledger is missing world revision ${missing.hash}` };

  // Membership alone accepts the exact torn-publication shape we need this
  // boundary to detect: nit publishes H2, the world still names H1, and the
  // transaction journal is lost. The latest acknowledged revision on every
  // named world branch must therefore equal that ledger branch's head. Legacy
  // unlabelled links are accepted only for a single-branch ledger.
  const ledgerBranches = (nitValue as any).branches as Record<string, { headHash: string }>;
  const latestWorldByBranch = new Map<string, string>();
  const unnamedWorldReferences: string[] = [];
  for (const reference of references) {
    if (reference.branch) latestWorldByBranch.set(reference.branch, reference.hash);
    else unnamedWorldReferences.push(reference.hash);
  }
  for (const branchName of latestWorldByBranch.keys()) {
    if (!ledgerBranches[branchName]) {
      return { valid: false, error: `World acknowledges canon branch ${branchName}, but the nit ledger does not` };
    }
  }
  const ledgerBranchEntries = Object.entries(ledgerBranches);
  for (const [branchName, branch] of ledgerBranchEntries) {
    const acknowledged = latestWorldByBranch.get(branchName)
      || (ledgerBranchEntries.length === 1 && latestWorldByBranch.size === 0
        ? unnamedWorldReferences[unnamedWorldReferences.length - 1]
        : undefined);
    if (!acknowledged) {
      return { valid: false, error: `Nit branch ${branchName} has no corresponding world acknowledgement` };
    }
    if (acknowledged !== branch.headHash) {
      return {
        valid: false,
        error: `Nit branch ${branchName} is ahead of or divergent from the world acknowledgement`,
      };
    }
  }
  return { valid: true };
}

function storagePath(dataDir: string, relativePath: string): string {
  const root = path.resolve(dataDir);
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (
    !relative
    || relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    throw new ProjectArchiveJournalError(`Recovery path escapes DATA_DIR: ${relativePath}`);
  }
  return resolved;
}

function inspectRegularFile(
  filePath: string,
  semanticKind?: 'json' | 'world' | 'nit',
): RecoveryFileEvidence {
  if (!fs.existsSync(filePath)) {
    return { path: filePath, exists: false, regular: false };
  }
  try {
    const link = fs.lstatSync(filePath);
    if (!link.isFile()) {
      return {
        path: filePath,
        exists: true,
        regular: false,
        error: 'Path is not a regular file',
      };
    }
    const before = fs.statSync(filePath);
    const bytes = fs.readFileSync(filePath);
    const after = fs.statSync(filePath);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
    ) {
      return {
        path: filePath,
        exists: true,
        regular: true,
        error: 'File changed while it was being inspected',
      };
    }
    const evidence: RecoveryFileEvidence = {
      path: filePath,
      exists: true,
      regular: true,
      size: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    };
    if (!semanticKind) return evidence;
    try {
      const parsed: unknown = JSON.parse(bytes.toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ...evidence, validJsonObject: false, error: 'JSON root is not an object' };
      }
      if (semanticKind === 'json') return { ...evidence, validJsonObject: true, validArtifact: true };
      const validation = semanticKind === 'world'
        ? validateRecoveryWorldArtifact(parsed)
        : validateRecoveryNitArtifact(parsed);
      return {
        ...evidence,
        validJsonObject: true,
        semanticKind,
        validArtifact: validation.valid,
        ...(validation.error ? { error: validation.error } : {}),
      };
    } catch (error: any) {
      return {
        ...evidence,
        validJsonObject: false,
        ...(semanticKind === 'world' || semanticKind === 'nit'
          ? { semanticKind, validArtifact: false }
          : {}),
        error: `JSON is unreadable: ${error?.message || error}`,
      };
    }
  } catch (error: any) {
    return {
      path: filePath,
      exists: true,
      regular: false,
      error: `File inspection failed: ${error?.message || error}`,
    };
  }
}

function sameRegularFileBytes(first: RecoveryFileEvidence, second: RecoveryFileEvidence): boolean {
  return Boolean(
    first.exists
    && second.exists
    && first.regular
    && second.regular
    && first.size === second.size
    && first.sha256
    && first.sha256 === second.sha256,
  );
}

function readInspectedArtifact(evidence: RecoveryFileEvidence): unknown {
  if (!evidence.exists || !evidence.regular || !evidence.sha256) {
    throw new ProjectArchiveJournalError(`Artifact is unavailable: ${evidence.path}`);
  }
  const bytes = fs.readFileSync(evidence.path);
  const currentSha = crypto.createHash('sha256').update(bytes).digest('hex');
  if (currentSha !== evidence.sha256) {
    throw new ProjectArchiveJournalError(`Artifact changed after inspection: ${evidence.path}`);
  }
  return JSON.parse(bytes.toString('utf8'));
}

function validateInspectedWorldNitPair(
  world: RecoveryFileEvidence | null,
  nit: RecoveryFileEvidence | null,
): RecoveryArtifactValidation {
  if (!world || world.validArtifact !== true) {
    return { valid: false, error: 'No validated world source is selected' };
  }
  try {
    return validateRecoveryWorldNitCoherence(
      readInspectedArtifact(world),
      nit ? readInspectedArtifact(nit) : null,
    );
  } catch (error: any) {
    return { valid: false, error: error?.message || String(error) };
  }
}

function inspectUnreadableTombstone(
  dataDir: string,
  projectId: string,
): UnreadableTombstoneInspection | null {
  const file = projectArchiveTombstonePath(dataDir, projectId);
  const evidence = inspectRegularFile(file);
  if (!evidence.exists || !evidence.regular || evidence.size === undefined || !evidence.sha256) return null;
  return evidence as UnreadableTombstoneInspection;
}

function assertNoArchivedOnlyArtifact(dataDir: string, projectId: string): void {
  const projectsTrash = path.join(dataDir, 'trash', 'projects');
  if (!fs.existsSync(projectsTrash)) return;
  const expectedLiveByArchiveRelative = new Map<string, string>([
    [`project_${projectId}.json`, path.join(dataDir, `project_${projectId}.json`)],
    [`project_${projectId}.json.bak`, path.join(dataDir, `project_${projectId}.json.bak`)],
    [path.join('nit', `${projectId}.json`), path.join(dataDir, 'nit', `${projectId}.json`)],
    [path.join('nit', `${projectId}.json.bak`), path.join(dataDir, 'nit', `${projectId}.json.bak`)],
  ]);

  for (const entry of fs.readdirSync(projectsTrash, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(`${projectId}_`)) continue;
    const archiveDir = path.join(projectsTrash, entry.name);
    const pending = [''];
    while (pending.length > 0) {
      const relativeDir = pending.pop()!;
      const absoluteDir = path.join(archiveDir, relativeDir);
      for (const artifact of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
        const relativeArtifact = path.join(relativeDir, artifact.name);
        if (artifact.isDirectory()) {
          pending.push(relativeArtifact);
          continue;
        }
        if (!artifact.isFile()) {
          throw new ProjectArchiveJournalError(
            `Archive evidence contains a non-regular artifact: ${path.relative(dataDir, path.join(absoluteDir, artifact.name))}`,
          );
        }
        if (relativeArtifact === 'project-metadata.json') continue;
        const livePath = expectedLiveByArchiveRelative.get(relativeArtifact);
        if (!livePath) {
          throw new ProjectArchiveJournalError(
            `Archive evidence contains an unknown artifact: ${path.relative(dataDir, path.join(absoluteDir, artifact.name))}`,
          );
        }
        const archived = inspectRegularFile(path.join(absoluteDir, artifact.name));
        const live = inspectRegularFile(livePath);
        if (!sameRegularFileBytes(archived, live)) {
          throw new ProjectArchiveJournalError(
            `Archive artifact is absent or differs from its live counterpart: ${relativeArtifact}`,
          );
        }
      }
    }
  }
}

function isProject(value: unknown, projectId: string): value is Project {
  const candidate = value as Partial<Project> | null;
  return Boolean(
    candidate
    && candidate.id === projectId
    && typeof candidate.name === 'string'
    && typeof candidate.description === 'string'
    && typeof candidate.createdAt === 'number'
    && Number.isFinite(candidate.createdAt)
    && typeof candidate.updatedAt === 'number'
    && Number.isFinite(candidate.updatedAt)
    && typeof candidate.isActive === 'boolean'
    && candidate.stats
    && typeof candidate.stats === 'object'
    && typeof candidate.color === 'string',
  );
}

function inspectMetadata(
  dataDir: string,
  projectId: string,
  tombstone: ProjectArchiveTombstone | null,
): ArchivedProjectMetadataInspection {
  if (!tombstone) return { path: null, exists: false, valid: false, error: 'No archive tombstone' };
  const relativePath = path.join(tombstone.archiveDir, 'project-metadata.json');
  const absolutePath = storagePath(dataDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return { path: relativePath, exists: false, valid: false, error: 'Archived project metadata is missing' };
  }
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    if (!isProject(parsed, projectId)) {
      return { path: relativePath, exists: true, valid: false, error: 'Archived project metadata is invalid' };
    }
    if (parsed.isActive) {
      return {
        path: relativePath,
        exists: true,
        valid: false,
        error: 'Archived project metadata unexpectedly marks the project active',
      };
    }
    return { path: relativePath, exists: true, valid: true, project: parsed };
  } catch (error: any) {
    return {
      path: relativePath,
      exists: true,
      valid: false,
      error: `Archived project metadata is unreadable: ${error?.message || error}`,
    };
  }
}

function dispositionForMove(
  move: ProjectArchiveMove,
  live: RecoveryFileEvidence,
  archive: RecoveryFileEvidence,
): RecoveryMoveDisposition {
  const liveExists = live.exists;
  const archiveExists = archive.exists;
  if (move.status === 'missing') {
    if (!liveExists && !archiveExists) return 'expected-missing';
    return liveExists ? (archiveExists ? 'ambiguous-both-present' : 'ambiguous-live-only') : 'ambiguous-archive-only';
  }
  if (move.status === 'restored') {
    if (liveExists && archiveExists) {
      return sameRegularFileBytes(live, archive) ? 'already-restored' : 'ambiguous-both-present';
    }
    if (liveExists && live.regular) return 'already-restored';
    return archiveExists ? 'ambiguous-archive-only' : 'ambiguous-both-missing';
  }
  if (move.status === 'pending') {
    if (liveExists && archiveExists) {
      // Recovery copies without consuming the immutable archive. A crash after
      // publishing the live copy but before journalling it therefore leaves
      // both paths. Exact byte identity is the resume token.
      return sameRegularFileBytes(live, archive) ? 'already-restored' : 'ambiguous-both-present';
    }
    if (liveExists && live.regular) return 'live-source-intact';
    if (archiveExists && archive.regular) return 'copy-from-archive';
    return liveExists ? 'ambiguous-live-only' : (archiveExists ? 'ambiguous-archive-only' : 'ambiguous-both-missing');
  }

  if (liveExists && archiveExists) {
    return sameRegularFileBytes(live, archive) ? 'already-restored' : 'ambiguous-both-present';
  }
  if (archiveExists && archive.regular) return 'copy-from-archive';
  // The server rollback consumes the archive path with rename(to, from), then
  // journals `restored`. A crash in that one-instruction window leaves a
  // `moved`/live-only pair. A regular live file is sufficient evidence to
  // finish the rollback; the primary world receives stricter JSON validation
  // before this recovery can be finalized.
  if (liveExists && live.regular) return 'already-restored';
  return liveExists ? 'ambiguous-live-only' : (archiveExists ? 'ambiguous-archive-only' : 'ambiguous-both-missing');
}

function inspectMoves(
  dataDir: string,
  tombstone: ProjectArchiveTombstone | null,
): ProjectArchiveRecoveryMoveInspection[] {
  if (!tombstone) return [];
  return tombstone.journal.moves.map(move => {
    const live = inspectRegularFile(storagePath(dataDir, move.from));
    const archive = inspectRegularFile(storagePath(dataDir, move.to));
    return {
      ...move,
      liveExists: live.exists,
      archiveExists: archive.exists,
      disposition: dispositionForMove(move, live, archive),
    };
  });
}

function moveDispositionIsSafe(disposition: RecoveryMoveDisposition): boolean {
  return disposition === 'copy-from-archive'
    || disposition === 'live-source-intact'
    || disposition === 'expected-missing'
    || disposition === 'already-restored';
}

function sourceEvidenceForMove(
  dataDir: string,
  move: ProjectArchiveRecoveryMoveInspection | undefined,
  semanticKind: 'world' | 'nit',
): RecoveryFileEvidence | null {
  if (!move || move.disposition === 'expected-missing') return null;
  const relativePath = move.disposition === 'copy-from-archive' ? move.to : move.from;
  if (!moveDispositionIsSafe(move.disposition)) return null;
  return inspectRegularFile(storagePath(dataDir, relativePath), semanticKind);
}

function reconcileInterruptedBackupPromotion(
  dataDir: string,
  moves: ProjectArchiveRecoveryMoveInspection[],
  primaryRelative: string,
  backupRelative: string,
): void {
  const primary = moves.find(move => move.from === primaryRelative);
  const backup = moves.find(move => move.from === backupRelative);
  if (
    !primary
    || primary.status !== 'missing'
    || primary.disposition !== 'ambiguous-live-only'
  ) return;

  const semanticKind = primaryRelative.startsWith(`nit${path.sep}`) ? 'nit' : 'world';
  const livePrimary = inspectRegularFile(storagePath(dataDir, primary.from), semanticKind);
  const backupSource = sourceEvidenceForMove(dataDir, backup, semanticKind);
  if (
    livePrimary.validArtifact === true
    && backupSource?.validArtifact === true
    && sameRegularFileBytes(livePrimary, backupSource)
  ) {
    // Backup-only recovery publishes a primary and then journals it. If the
    // process dies between those two durable steps, exact content identity is
    // sufficient to resume without overwriting either copy.
    primary.disposition = 'already-restored';
  }
}

function inspectRecoverableWorld(
  dataDir: string,
  projectId: string,
  moves: ProjectArchiveRecoveryMoveInspection[],
): RecoverableWorldInspection {
  const primaryMove = moves.find(move => move.from === `project_${projectId}.json`);
  const backupMove = moves.find(move => move.from === `project_${projectId}.json.bak`);
  const primaryLive = inspectRegularFile(path.join(dataDir, `project_${projectId}.json`), 'world');
  const backupLive = inspectRegularFile(path.join(dataDir, `project_${projectId}.json.bak`), 'world');
  const primarySource = sourceEvidenceForMove(dataDir, primaryMove, 'world');
  const backupSource = sourceEvidenceForMove(dataDir, backupMove, 'world');

  if (primarySource) {
    if (primarySource.validArtifact !== true && backupSource?.validArtifact === true) {
      return {
        primaryLive,
        backupLive,
        primarySource,
        backupSource,
        canPublishPrimary: true,
        needsBackupPromotion: true,
      };
    }
    if (primarySource.validArtifact !== true) {
      return {
        primaryLive,
        backupLive,
        primarySource,
        backupSource,
        canPublishPrimary: false,
        needsBackupPromotion: false,
        error: `Primary world source is invalid: ${primarySource.error || primarySource.path}`,
      };
    }
    return {
      primaryLive,
      backupLive,
      primarySource,
      backupSource,
      canPublishPrimary: true,
      needsBackupPromotion: false,
    };
  }

  if (backupSource?.validArtifact === true) {
    return {
      primaryLive,
      backupLive,
      primarySource,
      backupSource,
      canPublishPrimary: true,
      needsBackupPromotion: true,
    };
  }
  return {
    primaryLive,
    backupLive,
    primarySource,
    backupSource,
    canPublishPrimary: false,
    needsBackupPromotion: false,
    error: backupSource
      ? `Backup world source is invalid: ${backupSource.error || backupSource.path}`
      : 'Archive has no recoverable world blob or backup',
  };
}

function inspectRecoverableNit(
  dataDir: string,
  projectId: string,
  moves: ProjectArchiveRecoveryMoveInspection[],
): RecoverableNitInspection {
  const primaryRelative = path.join('nit', `${projectId}.json`);
  const backupRelative = path.join('nit', `${projectId}.json.bak`);
  const primaryMove = moves.find(move => move.from === primaryRelative);
  const backupMove = moves.find(move => move.from === backupRelative);
  const primaryLive = inspectRegularFile(path.join(dataDir, primaryRelative), 'nit');
  const backupLive = inspectRegularFile(path.join(dataDir, backupRelative), 'nit');
  const primarySource = sourceEvidenceForMove(dataDir, primaryMove, 'nit');
  const backupSource = sourceEvidenceForMove(dataDir, backupMove, 'nit');
  const intentionallyAbsent = primaryMove?.disposition === 'expected-missing'
    && backupMove?.disposition === 'expected-missing';

  if (primarySource) {
    if (primarySource.validArtifact !== true && backupSource?.validArtifact === true) {
      return {
        primaryLive,
        backupLive,
        primarySource,
        backupSource,
        canPublishPrimary: true,
        needsBackupPromotion: true,
        intentionallyAbsent: false,
      };
    }
    return primarySource.validArtifact === true
      ? {
        primaryLive,
        backupLive,
        primarySource,
        backupSource,
        canPublishPrimary: true,
        needsBackupPromotion: false,
        intentionallyAbsent: false,
      }
      : {
        primaryLive,
        backupLive,
        primarySource,
        backupSource,
        canPublishPrimary: false,
        needsBackupPromotion: false,
        intentionallyAbsent: false,
        error: `Primary nit source is invalid: ${primarySource.error || primarySource.path}`,
      };
  }
  if (backupSource?.validArtifact === true) {
    return {
      primaryLive,
      backupLive,
      primarySource,
      backupSource,
      canPublishPrimary: true,
      needsBackupPromotion: true,
      intentionallyAbsent: false,
    };
  }
  if (intentionallyAbsent) {
    return {
      primaryLive,
      backupLive,
      primarySource,
      backupSource,
      canPublishPrimary: true,
      needsBackupPromotion: false,
      intentionallyAbsent: true,
    };
  }
  return {
    primaryLive,
    backupLive,
    primarySource,
    backupSource,
    canPublishPrimary: false,
    needsBackupPromotion: false,
    intentionallyAbsent: false,
    error: backupSource
      ? `Backup nit source is invalid: ${backupSource.error || backupSource.path}`
      : 'Archive has no internally consistent nit ledger state',
  };
}

/** Read-only. It does not create DATA_DIR, locks, temp files, or journals. */
export function inspectProjectArchiveRecovery(
  dataDirInput: string,
  projectIdInput: string,
  options: InspectProjectArchiveRecoveryOptions = {},
): ProjectArchiveRecoveryInspection {
  const dataDir = path.resolve(dataDirInput);
  const projectId = assertSafeProjectId(projectIdInput);
  const lockOptions = { staleAfterMs: options.staleAfterMs, now: options.now };
  let tombstone: ProjectArchiveTombstone | null = null;
  let unreadableTombstone: UnreadableTombstoneInspection | null = null;
  try {
    tombstone = readProjectArchiveTombstone(dataDir, projectId);
  } catch (error) {
    if (!(error instanceof ProjectTombstonedError)) throw error;
    unreadableTombstone = inspectUnreadableTombstone(dataDir, projectId);
  }
  const metadata = inspectMetadata(dataDir, projectId, tombstone);
  const moves = inspectMoves(dataDir, tombstone);
  reconcileInterruptedBackupPromotion(
    dataDir,
    moves,
    `project_${projectId}.json`,
    `project_${projectId}.json.bak`,
  );
  reconcileInterruptedBackupPromotion(
    dataDir,
    moves,
    path.join('nit', `${projectId}.json`),
    path.join('nit', `${projectId}.json.bak`),
  );
  const world = inspectRecoverableWorld(dataDir, projectId, moves);
  const nit = inspectRecoverableNit(dataDir, projectId, moves);
  if (world.canPublishPrimary && nit.canPublishPrimary) {
    const selectedWorld = world.needsBackupPromotion ? world.backupSource : world.primarySource;
    const selectedNit = nit.intentionallyAbsent
      ? null
      : nit.needsBackupPromotion ? nit.backupSource : nit.primarySource;
    const coherence = validateInspectedWorldNitPair(selectedWorld, selectedNit);
    if (!coherence.valid) {
      nit.canPublishPrimary = false;
      nit.error = `World/nit coherence failed: ${coherence.error}`;
    }
  }
  return {
    dataDir,
    projectId,
    projectLock: inspectProjectBoundaryLock(dataDir, projectId, lockOptions),
    catalogLock: inspectCatalogBoundaryLock(dataDir, lockOptions),
    tombstone,
    unreadableTombstone,
    metadata,
    moves,
    world,
    nit,
    canRestoreFiles: Boolean(
      tombstone
      && metadata.valid
      && moves.every(move => moveDispositionIsSafe(move.disposition))
      && world.canPublishPrimary
      && nit.canPublishPrimary
    ),
  };
}

function clearObservedStaleProjectLock(
  dataDir: string,
  projectId: string,
  inspection: LockInspection,
  expectedOperationId: string | undefined,
  expectedUnreadableEvidenceAt: number | undefined,
  options: InspectProjectArchiveRecoveryOptions,
): void {
  if (!inspection.exists) return;
  if (!inspection.stale) {
    throw new ProjectArchiveJournalError(`Project ${projectId} has a live owner; recovery refused`);
  }
  if (!inspection.owner) {
    if (
      inspection.evidenceAt === undefined
      || expectedUnreadableEvidenceAt !== inspection.evidenceAt
    ) {
      throw new ProjectArchiveJournalError(
        `Project ${projectId} has an unreadable stale owner; confirm its inspected evidenceAt=${inspection.evidenceAt}`,
      );
    }
    clearStaleProjectBoundaryLock(dataDir, projectId, {
      staleAfterMs: options.staleAfterMs,
      now: options.now,
      allowUnreadableOwner: true,
    });
    return;
  }
  if (!expectedOperationId || expectedOperationId !== inspection.owner.operationId) {
    throw new ProjectArchiveJournalError(
      `Project ${projectId} stale owner must be confirmed as ${inspection.owner.operationId}`,
    );
  }
  clearStaleProjectBoundaryLock(dataDir, projectId, {
    staleAfterMs: options.staleAfterMs,
    now: options.now,
    expectedOperationId,
  });
}

function clearObservedStaleCatalogLock(
  dataDir: string,
  inspection: LockInspection,
  expectedOperationId: string | undefined,
  expectedUnreadableEvidenceAt: number | undefined,
  options: InspectProjectArchiveRecoveryOptions,
): void {
  if (!inspection.exists) return;
  if (!inspection.stale) {
    throw new ProjectArchiveJournalError('Project catalog has a live owner; recovery refused');
  }
  if (!inspection.owner) {
    if (
      inspection.evidenceAt === undefined
      || expectedUnreadableEvidenceAt !== inspection.evidenceAt
    ) {
      throw new ProjectArchiveJournalError(
        `Project catalog has an unreadable stale owner; confirm its inspected evidenceAt=${inspection.evidenceAt}`,
      );
    }
    clearStaleCatalogBoundaryLock(dataDir, {
      staleAfterMs: options.staleAfterMs,
      now: options.now,
      allowUnreadableOwner: true,
    });
    return;
  }
  if (!expectedOperationId || expectedOperationId !== inspection.owner.operationId) {
    throw new ProjectArchiveJournalError(
      `Project catalog stale owner must be confirmed as ${inspection.owner.operationId}`,
    );
  }
  clearStaleCatalogBoundaryLock(dataDir, {
    staleAfterMs: options.staleAfterMs,
    now: options.now,
    expectedOperationId,
  });
}

function readCatalog(dataDir: string): Project[] {
  const catalogPath = path.join(dataDir, 'projects.json');
  if (!fs.existsSync(catalogPath)) {
    throw new ProjectArchiveJournalError('projects.json is missing; refusing to guess the unrelated catalog state');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  } catch (error: any) {
    throw new ProjectArchiveJournalError(`projects.json is unreadable: ${error?.message || error}`);
  }
  if (!Array.isArray(parsed)) {
    throw new ProjectArchiveJournalError('projects.json is not an array');
  }
  const seen = new Set<string>();
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string') {
      throw new ProjectArchiveJournalError('projects.json contains an entry without a project id');
    }
    const id = assertSafeProjectId(entry.id);
    if (seen.has(id)) throw new ProjectArchiveJournalError(`projects.json contains duplicate project id ${id}`);
    seen.add(id);
  }
  return parsed as Project[];
}

function assertCatalogCanRestore(current: Project[], metadata: Project): void {
  const existing = current.find(project => project.id === metadata.id);
  if (existing && !isDeepStrictEqual(existing, metadata)) {
    throw new ProjectArchiveJournalError(
      `projects.json already contains conflicting metadata for ${metadata.id}`,
    );
  }
  if (metadata.isActive && current.some(project => project.id !== metadata.id && project.isActive)) {
    throw new ProjectArchiveJournalError('Restoration would create two active projects');
  }
}

function copyRecoveryArtifactWithoutRemovingIt(sourcePath: string, livePath: string): void {
  if (fs.existsSync(livePath) || !fs.existsSync(sourcePath)) {
    throw new ProjectArchiveJournalError(`Recovery pair changed before copy: ${livePath}`);
  }
  fs.mkdirSync(path.dirname(livePath), { recursive: true });
  const temporary = `${livePath}.restore-${process.pid}-${crypto.randomUUID()}`;
  try {
    const source = inspectRegularFile(sourcePath);
    if (!source.exists || !source.regular || !source.sha256) {
      throw new ProjectArchiveJournalError(`Recovery source is not a stable regular file: ${sourcePath}`);
    }
    fs.copyFileSync(sourcePath, temporary, fs.constants.COPYFILE_EXCL);
    const copied = inspectRegularFile(temporary);
    if (!sameRegularFileBytes(source, copied)) {
      throw new ProjectArchiveJournalError(`Recovery copy verification failed for ${livePath}`);
    }
    const fd = fs.openSync(temporary, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (fs.existsSync(livePath) || !fs.existsSync(sourcePath)) {
      throw new ProjectArchiveJournalError(`Recovery pair changed during copy: ${livePath}`);
    }
    const sourceAfter = inspectRegularFile(sourcePath);
    if (!sameRegularFileBytes(source, sourceAfter)) {
      throw new ProjectArchiveJournalError(`Recovery source changed during copy: ${sourcePath}`);
    }
    fs.renameSync(temporary, livePath);
    const directoryFd = fs.openSync(path.dirname(livePath), 'r');
    try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
  } catch (error) {
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* preserve original error */ }
    throw error;
  }
}

function beginProjectRecoveryAudit(
  dataDir: string,
  projectId: string,
  action: 'restore' | 'quarantine-corrupt-tombstone',
  reason: string,
  details: Record<string, unknown>,
): string {
  const dir = path.join(dataDir, '.archive-boundary', 'recoveries', 'projects');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${projectId}_${action}_${Date.now()}_${crypto.randomUUID()}.json`);
  atomicWriteJsonSync(file, {
    version: 1,
    projectId,
    action,
    reason,
    state: 'prepared',
    preparedAt: Date.now(),
    pid: process.pid,
    ...details,
  }, { backup: false });
  const directoryFd = fs.openSync(dir, 'r');
  try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
  return file;
}

function completeProjectRecoveryAudit(file: string, details: Record<string, unknown> = {}): void {
  try {
    const prepared = JSON.parse(fs.readFileSync(file, 'utf8'));
    atomicWriteJsonSync(file, {
      ...prepared,
      ...details,
      state: 'complete',
      completedAt: Date.now(),
    }, { backup: false });
    const directoryFd = fs.openSync(path.dirname(file), 'r');
    try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
  } catch {
    // The prepared record already preserves authority, reason and evidence.
    // Recovery must not recreate an active tombstone merely because the final
    // audit-state annotation could not be published after the barrier moved.
  }
}

export interface VerifiedProjectArchiveRestoreFinalization {
  catalogEntry: Project;
  auditFile: string;
}

/**
 * Publish the recovered catalog row and remove the resurrection barrier only
 * after both durable live surfaces can be read back. The helper owns the
 * catalog boundary itself so callers cannot accidentally validate against a
 * row that another checkout changes between check and tombstone removal.
 */
export function finalizeVerifiedProjectArchiveRestore(
  lock: ProjectBoundaryLock,
  expectedProject: Project,
  options: InspectProjectArchiveRecoveryOptions & { reason: string },
): VerifiedProjectArchiveRestoreFinalization {
  const catalogLock = acquireCatalogBoundaryLock(lock.dataDir, options);
  try {
    const latestCatalog = readCatalog(lock.dataDir);
    assertCatalogCanRestore(latestCatalog, expectedProject);
    const candidate = latestCatalog.some(project => project.id === lock.projectId)
      ? latestCatalog
      : [...latestCatalog, expectedProject];

    const targetAllowed = filterTombstonedProjectsForRestore(
      lock.dataDir,
      [expectedProject],
      lock,
    );
    if (targetAllowed.length !== 1) {
      throw new ProjectArchiveJournalError(`Restore boundary did not admit ${lock.projectId}`);
    }
    atomicWriteJsonSync(path.join(lock.dataDir, 'projects.json'), candidate);

    const primary = inspectRegularFile(
      path.join(lock.dataDir, `project_${lock.projectId}.json`),
      'world',
    );
    if (primary.validArtifact !== true) {
      throw new ProjectArchiveJournalError(
        `Recovered primary world is not readable: ${primary.error || primary.path}`,
      );
    }
    const nitPrimary = inspectRegularFile(
      path.join(lock.dataDir, 'nit', `${lock.projectId}.json`),
      'nit',
    );
    const nitBackup = inspectRegularFile(
      path.join(lock.dataDir, 'nit', `${lock.projectId}.json.bak`),
      'nit',
    );
    if (nitPrimary.exists && nitPrimary.validArtifact !== true) {
      throw new ProjectArchiveJournalError(
        `Recovered primary nit ledger is not readable: ${nitPrimary.error || nitPrimary.path}`,
      );
    }
    if (!nitPrimary.exists && nitBackup.exists) {
      throw new ProjectArchiveJournalError(
        `Recovered nit backup exists without its required primary for ${lock.projectId}`,
      );
    }
    const coherence = validateInspectedWorldNitPair(primary, nitPrimary.exists ? nitPrimary : null);
    if (!coherence.valid) {
      throw new ProjectArchiveJournalError(
        `Recovered world/canon pair is inconsistent: ${coherence.error}`,
      );
    }
    const publishedCatalog = readCatalog(lock.dataDir);
    const publishedTarget = publishedCatalog.find(project => project.id === lock.projectId);
    if (!publishedTarget || !isProject(publishedTarget, lock.projectId)) {
      throw new ProjectArchiveJournalError(
        `Recovered catalog row for ${lock.projectId} is missing or invalid`,
      );
    }
    if (!isDeepStrictEqual(publishedTarget, expectedProject)) {
      throw new ProjectArchiveJournalError(
        `Recovered catalog row for ${lock.projectId} changed before finalization`,
      );
    }

    const finalTombstone = readProjectArchiveTombstone(lock.dataDir, lock.projectId);
    if (!finalTombstone) throw new ProjectArchiveJournalError('Archive tombstone disappeared before restore audit');
    const auditFile = beginProjectRecoveryAudit(
      lock.dataDir,
      lock.projectId,
      'restore',
      options.reason,
      {
        restoreOperationId: lock.owner.operationId,
        archiveDir: finalTombstone.archiveDir,
        tombstone: finalTombstone,
        catalogEntry: publishedTarget,
        primarySha256: primary.sha256,
        ...(nitPrimary.exists ? { nitSha256: nitPrimary.sha256 } : {}),
      },
    );

    // LAST: both the primary JSON and exact target catalog row were read back
    // while both project and catalog boundaries remain held. The durable audit
    // above keeps the adopted journal + operator rationale after unlink.
    removeProjectArchiveTombstone(lock);
    completeProjectRecoveryAudit(auditFile, { tombstoneRemoved: true });
    return {
      catalogEntry: publishedTarget,
      auditFile: path.relative(lock.dataDir, auditFile),
    };
  } finally {
    catalogLock.release();
  }
}

/**
 * Restore an archived project without consuming its archive artifacts.
 *
 * The tombstone is adopted only after every file pair, metadata record and
 * current catalog have passed preflight. It remains the resurrection barrier
 * through file and catalog publication and is removed last.
 */
export function restoreProjectArchive(
  dataDirInput: string,
  projectIdInput: string,
  options: RestoreProjectArchiveOptions,
): RestoreProjectArchiveResult {
  const dataDir = path.resolve(dataDirInput);
  const projectId = assertSafeProjectId(projectIdInput);
  if (options.confirmProjectId !== projectId) {
    throw new ProjectArchiveJournalError(`Restore confirmation must exactly equal ${projectId}`);
  }
  const expectedTombstoneOperationId = String(options.expectedTombstoneOperationId || '').trim();
  if (!expectedTombstoneOperationId) {
    throw new ProjectArchiveJournalError('Restore requires the tombstone operation id printed by inspect');
  }
  const reason = String(options.reason || '').trim();
  if (!reason) throw new ProjectArchiveJournalError('Restore requires an operator reason');

  const initial = inspectProjectArchiveRecovery(dataDir, projectId, options);
  if (!initial.tombstone) throw new ProjectArchiveJournalError(`No archive tombstone for ${projectId}`);
  if (initial.tombstone.operationId !== expectedTombstoneOperationId) {
    throw new ProjectArchiveJournalError(
      `Tombstone changed from ${expectedTombstoneOperationId} to ${initial.tombstone.operationId}`,
    );
  }
  clearObservedStaleProjectLock(
    dataDir,
    projectId,
    initial.projectLock,
    options.expectedProjectLockOperationId,
    options.expectedUnreadableProjectLockEvidenceAt,
    options,
  );

  const lock = acquireProjectBoundaryLock(dataDir, projectId, 'restore', options);
  try {
    const ownedPreflight = inspectProjectArchiveRecovery(dataDir, projectId, options);
    if (!ownedPreflight.tombstone || ownedPreflight.tombstone.operationId !== expectedTombstoneOperationId) {
      throw new ProjectArchiveJournalError('Archive tombstone changed while the recovery boundary was being acquired');
    }
    if (!ownedPreflight.metadata.valid || !ownedPreflight.metadata.project) {
      throw new ProjectArchiveJournalError(ownedPreflight.metadata.error || 'Archived project metadata is invalid');
    }
    const ambiguous = ownedPreflight.moves.filter(move => !moveDispositionIsSafe(move.disposition));
    if (ambiguous.length > 0) {
      throw new ProjectArchiveJournalError(
        `Archive has ambiguous file pairs: ${ambiguous.map(move => `${move.from} (${move.disposition})`).join(', ')}`,
      );
    }
    if (!ownedPreflight.world.canPublishPrimary) {
      throw new ProjectArchiveJournalError(
        ownedPreflight.world.error || 'Archive has no recoverable world blob or backup',
      );
    }
    if (!ownedPreflight.nit.canPublishPrimary) {
      throw new ProjectArchiveJournalError(
        ownedPreflight.nit.error || 'Archive has no internally consistent nit ledger state',
      );
    }

    // Catalog inspection/clear is also done before adoption or file writes.
    clearObservedStaleCatalogLock(
      dataDir,
      ownedPreflight.catalogLock,
      options.expectedCatalogLockOperationId,
      options.expectedUnreadableCatalogLockEvidenceAt,
      options,
    );
    const currentCatalog = readCatalog(dataDir);
    assertCatalogCanRestore(currentCatalog, ownedPreflight.metadata.project);

    adoptProjectArchiveTombstone(lock, {
      expectedOperationId: expectedTombstoneOperationId,
      reason,
    });

    const restoredFiles: string[] = [];
    const alreadyLiveFiles: string[] = [];
    const absentFiles: string[] = [];
    const invalidPrimarySourcesToSkip = new Set<string>();
    if (ownedPreflight.world.needsBackupPromotion
      && ownedPreflight.world.primarySource
      && ownedPreflight.world.primarySource.validArtifact !== true) {
      invalidPrimarySourcesToSkip.add(`project_${projectId}.json`);
    }
    if (ownedPreflight.nit.needsBackupPromotion
      && ownedPreflight.nit.primarySource
      && ownedPreflight.nit.primarySource.validArtifact !== true) {
      invalidPrimarySourcesToSkip.add(path.join('nit', `${projectId}.json`));
    }
    for (const move of ownedPreflight.moves) {
      lock.heartbeat();
      const currentTombstone = readProjectArchiveTombstone(dataDir, projectId);
      const currentMoves = inspectMoves(dataDir, currentTombstone);
      reconcileInterruptedBackupPromotion(
        dataDir,
        currentMoves,
        `project_${projectId}.json`,
        `project_${projectId}.json.bak`,
      );
      reconcileInterruptedBackupPromotion(
        dataDir,
        currentMoves,
        path.join('nit', `${projectId}.json`),
        path.join('nit', `${projectId}.json.bak`),
      );
      const currentDisposition = currentMoves.find(candidate => candidate.from === move.from)?.disposition;
      if (currentDisposition !== move.disposition) {
        throw new ProjectArchiveJournalError(
          `Archive pair changed after preflight: ${move.from} (${move.disposition} -> ${currentDisposition})`,
        );
      }
      if (invalidPrimarySourcesToSkip.has(move.from) && move.disposition === 'copy-from-archive') {
        // Keep the corrupt primary immutable in the archive; the validated
        // backup will be promoted after every other source is restored.
        absentFiles.push(move.from);
        continue;
      }
      if (move.disposition === 'copy-from-archive') {
        copyRecoveryArtifactWithoutRemovingIt(
          storagePath(dataDir, move.to),
          storagePath(dataDir, move.from),
        );
        markProjectArchiveMove(lock, move.from, 'restored');
        restoredFiles.push(move.from);
      } else if (move.disposition === 'live-source-intact') {
        markProjectArchiveMove(lock, move.from, 'restored');
        alreadyLiveFiles.push(move.from);
      } else if (move.disposition === 'already-restored') {
        alreadyLiveFiles.push(move.from);
      } else if (move.disposition === 'expected-missing') {
        absentFiles.push(move.from);
      }
    }


    const primaryRelative = `project_${projectId}.json`;
    const primary = inspectRegularFile(path.join(dataDir, primaryRelative), 'world');
    if (primary.validArtifact !== true) {
      const backup = inspectRegularFile(path.join(dataDir, `${primaryRelative}.bak`), 'world');
      if (!primary.exists && backup.validArtifact === true) {
        copyRecoveryArtifactWithoutRemovingIt(backup.path, primary.path);
        const promoted = inspectRegularFile(primary.path, 'world');
        if (!sameRegularFileBytes(backup, promoted) || promoted.validArtifact !== true) {
          throw new ProjectArchiveJournalError('Backup promotion did not publish a verified primary world');
        }
        const primaryMove = ownedPreflight.moves.find(move => move.from === primaryRelative);
        if (primaryMove) markProjectArchiveMove(lock, primaryRelative, 'restored');
        const absentIndex = absentFiles.indexOf(primaryRelative);
        if (absentIndex >= 0) absentFiles.splice(absentIndex, 1);
        if (!restoredFiles.includes(primaryRelative)) restoredFiles.push(primaryRelative);
      } else {
        throw new ProjectArchiveJournalError(
          `Recovery cannot publish a readable primary world: ${primary.error || primary.path}`,
        );
      }
    }

    const nitPrimaryRelative = path.join('nit', `${projectId}.json`);
    const nitBackupRelative = path.join('nit', `${projectId}.json.bak`);
    const nitPrimary = inspectRegularFile(path.join(dataDir, nitPrimaryRelative), 'nit');
    if (nitPrimary.exists && nitPrimary.validArtifact !== true) {
      throw new ProjectArchiveJournalError(
        `Recovered primary nit ledger is invalid: ${nitPrimary.error || nitPrimary.path}`,
      );
    }
    if (!nitPrimary.exists) {
      const nitBackup = inspectRegularFile(path.join(dataDir, nitBackupRelative), 'nit');
      if (nitBackup.validArtifact === true) {
        copyRecoveryArtifactWithoutRemovingIt(nitBackup.path, nitPrimary.path);
        const promotedNit = inspectRegularFile(nitPrimary.path, 'nit');
        if (!sameRegularFileBytes(nitBackup, promotedNit) || promotedNit.validArtifact !== true) {
          throw new ProjectArchiveJournalError('Nit backup promotion did not publish a verified primary ledger');
        }
        const nitPrimaryMove = ownedPreflight.moves.find(move => move.from === nitPrimaryRelative);
        if (nitPrimaryMove) markProjectArchiveMove(lock, nitPrimaryRelative, 'restored');
        const absentIndex = absentFiles.indexOf(nitPrimaryRelative);
        if (absentIndex >= 0) absentFiles.splice(absentIndex, 1);
        if (!restoredFiles.includes(nitPrimaryRelative)) restoredFiles.push(nitPrimaryRelative);
      } else if (!ownedPreflight.nit.intentionallyAbsent) {
        throw new ProjectArchiveJournalError(
          `Recovery cannot publish a readable nit ledger: ${nitBackup.error || nitBackup.path}`,
        );
      }
    }

    // This acquires the catalog boundary, preserves every unrelated row, reads
    // the primary + target row back, and removes the tombstone last.
    const finalization = finalizeVerifiedProjectArchiveRestore(
      lock,
      ownedPreflight.metadata.project,
      { ...options, reason },
    );
    return {
      projectId,
      archiveDir: ownedPreflight.tombstone.archiveDir,
      restoredFiles,
      alreadyLiveFiles,
      absentFiles,
      catalogEntry: finalization.catalogEntry,
      auditFile: finalization.auditFile,
      tombstoneRemoved: true,
      archiveArtifactsRetained: true,
    };
  } finally {
    lock.release();
  }
}

/**
 * Quarantine a corrupt tombstone only when the live side proves that archive
 * processing never got past (or was fully rolled back through) the ordered
 * world/catalog boundary. The corrupt bytes are retained for forensic/manual
 * recovery; no archive directory or artifact is removed.
 */
export function quarantineUnreadableProjectArchiveTombstone(
  dataDirInput: string,
  projectIdInput: string,
  options: QuarantineUnreadableTombstoneOptions,
): QuarantineUnreadableTombstoneResult {
  const dataDir = path.resolve(dataDirInput);
  const projectId = assertSafeProjectId(projectIdInput);
  if (options.confirmProjectId !== projectId) {
    throw new ProjectArchiveJournalError(`Quarantine confirmation must exactly equal ${projectId}`);
  }
  const expectedSha256 = String(options.expectedTombstoneSha256 || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw new ProjectArchiveJournalError('Quarantine requires the exact SHA-256 printed by inspect');
  }
  const reason = String(options.reason || '').trim();
  if (!reason) throw new ProjectArchiveJournalError('Quarantine requires an operator reason');

  const initial = inspectProjectArchiveRecovery(dataDir, projectId, options);
  if (initial.tombstone) {
    throw new ProjectArchiveJournalError('Tombstone is readable; use the journalled restore workflow');
  }
  if (!initial.unreadableTombstone) {
    throw new ProjectArchiveJournalError(`No hashable unreadable tombstone for ${projectId}`);
  }
  if (initial.unreadableTombstone.sha256 !== expectedSha256) {
    throw new ProjectArchiveJournalError(
      `Unreadable tombstone changed from ${expectedSha256} to ${initial.unreadableTombstone.sha256}`,
    );
  }
  clearObservedStaleProjectLock(
    dataDir,
    projectId,
    initial.projectLock,
    options.expectedProjectLockOperationId,
    options.expectedUnreadableProjectLockEvidenceAt,
    options,
  );

  const lock = acquireProjectBoundaryLock(dataDir, projectId, 'recovery', options);
  try {
    const owned = inspectProjectArchiveRecovery(dataDir, projectId, options);
    if (owned.tombstone || owned.unreadableTombstone?.sha256 !== expectedSha256) {
      throw new ProjectArchiveJournalError('Unreadable tombstone changed while the recovery boundary was acquired');
    }
    clearObservedStaleCatalogLock(
      dataDir,
      owned.catalogLock,
      options.expectedCatalogLockOperationId,
      options.expectedUnreadableCatalogLockEvidenceAt,
      options,
    );

    const catalogLock = acquireCatalogBoundaryLock(dataDir, options);
    try {
      const catalog = readCatalog(dataDir);
      const catalogEntry = catalog.find(candidate => candidate.id === projectId);
      if (!catalogEntry || !isProject(catalogEntry, projectId)) {
        throw new ProjectArchiveJournalError(
          `A valid live catalog row for ${projectId} is required before corrupt-marker quarantine`,
        );
      }

      const primaryPath = path.join(dataDir, `project_${projectId}.json`);
      const backupPath = `${primaryPath}.bak`;
      let primary = inspectRegularFile(primaryPath, 'world');
      const backup = inspectRegularFile(backupPath, 'world');
      let primaryPromotedFromBackup = false;
      let nitPrimaryPromotedFromBackup = false;
      if (primary.exists && primary.validArtifact !== true) {
        throw new ProjectArchiveJournalError(
          `Live primary world exists but is invalid; refusing to overwrite it: ${primary.error || primary.path}`,
        );
      }
      if (!primary.exists) {
        if (backup.validArtifact !== true) {
          throw new ProjectArchiveJournalError(
            'Corrupt-marker quarantine requires a readable live primary or backup world',
          );
        }
        copyRecoveryArtifactWithoutRemovingIt(backupPath, primaryPath);
        primary = inspectRegularFile(primaryPath, 'world');
        if (primary.validArtifact !== true || !sameRegularFileBytes(primary, backup)) {
          throw new ProjectArchiveJournalError('Live backup promotion could not be verified');
        }
        primaryPromotedFromBackup = true;
      }

      const nitPrimaryPath = path.join(dataDir, 'nit', `${projectId}.json`);
      const nitBackupPath = `${nitPrimaryPath}.bak`;
      let nitPrimary = inspectRegularFile(nitPrimaryPath, 'nit');
      const nitBackup = inspectRegularFile(nitBackupPath, 'nit');
      if (nitPrimary.exists && nitPrimary.validArtifact !== true) {
        throw new ProjectArchiveJournalError(
          `Live primary nit ledger exists but is invalid: ${nitPrimary.error || nitPrimary.path}`,
        );
      }
      if (!nitPrimary.exists && nitBackup.exists) {
        if (nitBackup.validArtifact !== true) {
          throw new ProjectArchiveJournalError(
            `Live nit backup is invalid: ${nitBackup.error || nitBackup.path}`,
          );
        }
        copyRecoveryArtifactWithoutRemovingIt(nitBackupPath, nitPrimaryPath);
        nitPrimary = inspectRegularFile(nitPrimaryPath, 'nit');
        if (nitPrimary.validArtifact !== true || !sameRegularFileBytes(nitPrimary, nitBackup)) {
          throw new ProjectArchiveJournalError('Live nit backup promotion could not be verified');
        }
        nitPrimaryPromotedFromBackup = true;
      }

      assertNoArchivedOnlyArtifact(dataDir, projectId);

      // Re-read every proof under both locks immediately before the barrier is
      // moved. The archive route moves the primary/backup before any sidecar
      // and removes the catalog only after every move; a live world plus its
      // live catalog row therefore proves no later archived-only move can be
      // hidden by quarantining a torn marker.
      const finalPrimary = inspectRegularFile(primaryPath, 'world');
      const finalNitPrimary = inspectRegularFile(nitPrimaryPath, 'nit');
      const finalNitBackup = inspectRegularFile(nitBackupPath, 'nit');
      const finalCatalogEntry = readCatalog(dataDir).find(candidate => candidate.id === projectId);
      const markerPath = projectArchiveTombstonePath(dataDir, projectId);
      const finalMarker = inspectRegularFile(markerPath);
      if (finalPrimary.validArtifact !== true) {
        throw new ProjectArchiveJournalError('Live primary world changed before quarantine finalization');
      }
      if (
        (finalNitPrimary.exists && finalNitPrimary.validArtifact !== true)
        || (!finalNitPrimary.exists && finalNitBackup.exists)
      ) {
        throw new ProjectArchiveJournalError('Live nit ledger changed before quarantine finalization');
      }
      const coherence = validateInspectedWorldNitPair(
        finalPrimary,
        finalNitPrimary.exists ? finalNitPrimary : null,
      );
      if (!coherence.valid) {
        throw new ProjectArchiveJournalError(
          `Live world/canon pair is inconsistent before quarantine finalization: ${coherence.error}`,
        );
      }
      if (!finalCatalogEntry || !isProject(finalCatalogEntry, projectId)) {
        throw new ProjectArchiveJournalError('Live catalog row changed before quarantine finalization');
      }
      if (!finalMarker.regular || finalMarker.sha256 !== expectedSha256) {
        throw new ProjectArchiveJournalError('Unreadable tombstone changed before quarantine finalization');
      }

      const auditFile = beginProjectRecoveryAudit(
        dataDir,
        projectId,
        'quarantine-corrupt-tombstone',
        reason,
        {
          tombstoneSha256: expectedSha256,
          recoveryOperationId: lock.owner.operationId,
          abandonedProjectLockOperationId: options.expectedProjectLockOperationId,
          abandonedCatalogLockOperationId: options.expectedCatalogLockOperationId,
          unreadableProjectLockEvidenceAt: options.expectedUnreadableProjectLockEvidenceAt,
          unreadableCatalogLockEvidenceAt: options.expectedUnreadableCatalogLockEvidenceAt,
          primarySha256: finalPrimary.sha256,
          ...(finalNitPrimary.exists ? { nitSha256: finalNitPrimary.sha256 } : {}),
          primaryPromotedFromBackup,
          nitPrimaryPromotedFromBackup,
          catalogEntry: finalCatalogEntry,
        },
      );

      const quarantineDir = path.join(
        dataDir,
        '.archive-boundary',
        'quarantine',
        'tombstones',
        'projects',
      );
      fs.mkdirSync(quarantineDir, { recursive: true });
      const quarantinedPath = path.join(
        quarantineDir,
        `${projectId}-${expectedSha256.slice(0, 16)}-${crypto.randomUUID()}.json`,
      );
      fs.renameSync(markerPath, quarantinedPath);
      const quarantined = inspectRegularFile(quarantinedPath);
      if (!quarantined.regular || quarantined.sha256 !== expectedSha256) {
        throw new ProjectArchiveJournalError(
          `Corrupt marker moved but could not be verified; evidence remains at ${quarantinedPath}`,
        );
      }
      const directoryFd = fs.openSync(quarantineDir, 'r');
      try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
      const markerDirectoryFd = fs.openSync(path.dirname(markerPath), 'r');
      try { fs.fsyncSync(markerDirectoryFd); } finally { fs.closeSync(markerDirectoryFd); }
      completeProjectRecoveryAudit(auditFile, {
        quarantinedPath: path.relative(dataDir, quarantinedPath),
        corruptMarkerRetained: true,
      });

      return {
        projectId,
        quarantinedPath: path.relative(dataDir, quarantinedPath),
        tombstoneSha256: expectedSha256,
        catalogEntry: finalCatalogEntry,
        auditFile: path.relative(dataDir, auditFile),
        primaryPromotedFromBackup,
        nitPrimaryPromotedFromBackup,
        corruptMarkerRetained: true,
        archiveArtifactsRetained: true,
      };
    } finally {
      catalogLock.release();
    }
  } finally {
    lock.release();
  }
}
