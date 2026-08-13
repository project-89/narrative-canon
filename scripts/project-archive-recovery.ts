#!/usr/bin/env node

import { resolveNarrativeDataDir } from '../src/config/runtime-paths';
import {
  inspectProjectArchiveRecovery,
  quarantineUnreadableProjectArchiveTombstone,
  restoreProjectArchive,
} from '../src/storage/project-archive-recovery';

interface ParsedArguments {
  command?: string;
  projectId?: string;
  flags: Map<string, string>;
}

const HELP = `Project archive recovery (local operator tool)

Inspect first (read-only):
  npm run archive:recovery -- inspect <projectId> [--data-dir <path>] [--stale-after-ms <ms>]

Restore after reviewing inspect output:
  npm run archive:recovery -- restore <projectId> \\
    --confirm-project <projectId> \\
    --tombstone-operation <operationId> \\
    --reason "operator explanation" \\
    [--project-lock-operation <operationId>] \\
    [--catalog-lock-operation <operationId>] \\
    [--unreadable-project-lock-evidence <mtimeMs>] \\
    [--unreadable-catalog-lock-evidence <mtimeMs>] \\
    [--data-dir <path>] [--stale-after-ms <ms>]

Quarantine a corrupt marker only after reviewing its SHA-256 in inspect:
  npm run archive:recovery -- quarantine <projectId> \\
    --confirm-project <projectId> \\
    --tombstone-sha256 <sha256> \\
    --reason "operator explanation" \\
    [--project-lock-operation <operationId>] \\
    [--catalog-lock-operation <operationId>] \\
    [--unreadable-project-lock-evidence <mtimeMs>] \\
    [--unreadable-catalog-lock-evidence <mtimeMs>] \\
    [--data-dir <path>] [--stale-after-ms <ms>]

Restore copies archived files back to the live store; it does not consume the
archive. A stale lock is cleared only when its exact inspected operation id is
provided, or when the exact evidenceAt printed for an unreadable stale owner is
confirmed. Quarantine is limited to an unreadable marker whose exact hash is
confirmed and whose live world, catalog row, and sidecars prove no archive-only
artifact would be orphaned. Fresh ownership, changed evidence, and ambiguous file pairs
fail closed.`;

function parseArguments(argv: string[]): ParsedArguments {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
    flags.set(token.slice(2), value);
    index += 1;
  }
  return { command: positional[0], projectId: positional[1], flags };
}

function staleAfterMs(flags: Map<string, string>): number | undefined {
  const raw = flags.get('stale-after-ms');
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error('--stale-after-ms must be a non-negative number');
  return value;
}

function required(flags: Map<string, string>, name: string): string {
  const value = flags.get(name)?.trim();
  if (!value) throw new Error(`Missing required --${name}`);
  return value;
}

function optionalEvidence(flags: Map<string, string>, name: string): number | undefined {
  const raw = flags.get(name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`--${name} must be the non-negative evidenceAt printed by inspect`);
  }
  return value;
}

function inspectionForOutput(inspection: ReturnType<typeof inspectProjectArchiveRecovery>) {
  return {
    dataDir: inspection.dataDir,
    projectId: inspection.projectId,
    projectLock: inspection.projectLock,
    catalogLock: inspection.catalogLock,
    tombstone: inspection.tombstone && {
      operationId: inspection.tombstone.operationId,
      state: inspection.tombstone.state,
      archiveDir: inspection.tombstone.archiveDir,
      error: inspection.tombstone.error,
      catalog: inspection.tombstone.journal.catalog,
      adoptionHistory: inspection.tombstone.adoptionHistory,
    },
    unreadableTombstone: inspection.unreadableTombstone,
    metadata: {
      path: inspection.metadata.path,
      exists: inspection.metadata.exists,
      valid: inspection.metadata.valid,
      projectId: inspection.metadata.project?.id,
      projectName: inspection.metadata.project?.name,
      error: inspection.metadata.error,
    },
    moves: inspection.moves,
    world: inspection.world,
    nit: inspection.nit,
    canRestoreFiles: inspection.canRestoreFiles,
  };
}

function main(): void {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.command === 'help' || parsed.flags.has('help') || !parsed.command) {
    console.log(HELP);
    return;
  }
  if (!parsed.projectId) throw new Error('A projectId is required');

  const configuredDataDir = parsed.flags.get('data-dir');
  const dataDir = resolveNarrativeDataDir(configuredDataDir);
  const staleMs = staleAfterMs(parsed.flags);
  if (parsed.command === 'inspect') {
    const inspection = inspectProjectArchiveRecovery(dataDir, parsed.projectId, { staleAfterMs: staleMs });
    console.log(JSON.stringify(inspectionForOutput(inspection), null, 2));
    return;
  }
  if (parsed.command !== 'restore' && parsed.command !== 'quarantine') {
    throw new Error(`Unknown command: ${parsed.command}`);
  }
  const sharedOptions = {
    confirmProjectId: required(parsed.flags, 'confirm-project'),
    expectedProjectLockOperationId: parsed.flags.get('project-lock-operation'),
    expectedCatalogLockOperationId: parsed.flags.get('catalog-lock-operation'),
    expectedUnreadableProjectLockEvidenceAt: optionalEvidence(
      parsed.flags,
      'unreadable-project-lock-evidence',
    ),
    expectedUnreadableCatalogLockEvidenceAt: optionalEvidence(
      parsed.flags,
      'unreadable-catalog-lock-evidence',
    ),
    reason: required(parsed.flags, 'reason'),
    staleAfterMs: staleMs,
  };
  const result = parsed.command === 'restore'
    ? restoreProjectArchive(dataDir, parsed.projectId, {
      ...sharedOptions,
      expectedTombstoneOperationId: required(parsed.flags, 'tombstone-operation'),
    })
    : quarantineUnreadableProjectArchiveTombstone(dataDir, parsed.projectId, {
      ...sharedOptions,
      expectedTombstoneSha256: required(parsed.flags, 'tombstone-sha256'),
    });
  console.log(JSON.stringify(result, null, 2));
}

try {
  main();
} catch (error: any) {
  console.error(`Archive recovery refused: ${error?.message || error}`);
  console.error('Run `npm run archive:recovery -- help` for the guarded workflow.');
  process.exitCode = 1;
}
