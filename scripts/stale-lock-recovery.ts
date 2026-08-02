#!/usr/bin/env node

import { resolveNarrativeDataDir } from '../src/config/runtime-paths';
import {
  inspectCatalogBoundaryLock,
  inspectProjectBoundaryLock,
} from '../src/storage/project-archive-boundary';
import { inspectProjectPublicationJournal } from '../src/storage/project-publication-journal';
import {
  recoverStaleCatalogLock,
  recoverStaleProjectPublishLock,
} from '../src/storage/stale-lock-recovery';

const HELP = `Stale filesystem lock recovery (local operator tool)

Inspect:
  npm run lock:recovery -- inspect-project <projectId> [--data-dir <path>] [--stale-after-ms <ms>]
  npm run lock:recovery -- inspect-catalog [--data-dir <path>] [--stale-after-ms <ms>]

Recover an ordinary project publisher (no canon publication journal):
  npm run lock:recovery -- recover-project <projectId> \\
    --confirm-project <projectId> --operation <operationId> \\
    --reason "operator explanation" [--allow-unreadable-owner]

Recover an atomic catalog publisher:
  npm run lock:recovery -- recover-catalog \\
    --operation <operationId> --reason "operator explanation" \\
    [--allow-unreadable-owner]

Fresh locks are never cleared. If inspect-project reports a publication
journal, use npm run publication:recovery instead; blind unlocking is refused.`;

function parse(argv: string[]) {
  const positional: string[] = [];
  const values = new Map<string, string>();
  const switches = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    if (name === 'help' || name === 'allow-unreadable-owner') {
      switches.add(name);
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
    values.set(name, value);
    index += 1;
  }
  return { command: positional[0], projectId: positional[1], values, switches };
}

function required(values: Map<string, string>, name: string): string {
  const value = values.get(name)?.trim();
  if (!value) throw new Error(`Missing required --${name}`);
  return value;
}

function staleAfterMs(values: Map<string, string>): number | undefined {
  const raw = values.get('stale-after-ms');
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error('--stale-after-ms must be non-negative');
  return value;
}

function main(): void {
  const parsed = parse(process.argv.slice(2));
  if (!parsed.command || parsed.command === 'help' || parsed.switches.has('help')) {
    console.log(HELP);
    return;
  }
  const dataDir = resolveNarrativeDataDir(parsed.values.get('data-dir'));
  const staleMs = staleAfterMs(parsed.values);
  if (parsed.command === 'inspect-project') {
    if (!parsed.projectId) throw new Error('A projectId is required');
    console.log(JSON.stringify({
      lock: inspectProjectBoundaryLock(dataDir, parsed.projectId, { staleAfterMs: staleMs }),
      publication: inspectProjectPublicationJournal(dataDir, parsed.projectId, { staleAfterMs: staleMs }).journal,
    }, null, 2));
    return;
  }
  if (parsed.command === 'inspect-catalog') {
    console.log(JSON.stringify(inspectCatalogBoundaryLock(dataDir, { staleAfterMs: staleMs }), null, 2));
    return;
  }
  if (parsed.command === 'recover-project') {
    if (!parsed.projectId) throw new Error('A projectId is required');
    console.log(JSON.stringify(recoverStaleProjectPublishLock(dataDir, parsed.projectId, {
      confirmProjectId: required(parsed.values, 'confirm-project'),
      expectedOperationId: parsed.values.get('operation'),
      allowUnreadableOwner: parsed.switches.has('allow-unreadable-owner'),
      reason: required(parsed.values, 'reason'),
      staleAfterMs: staleMs,
    }), null, 2));
    return;
  }
  if (parsed.command === 'recover-catalog') {
    console.log(JSON.stringify(recoverStaleCatalogLock(dataDir, {
      expectedOperationId: parsed.values.get('operation'),
      allowUnreadableOwner: parsed.switches.has('allow-unreadable-owner'),
      reason: required(parsed.values, 'reason'),
      staleAfterMs: staleMs,
    }), null, 2));
    return;
  }
  throw new Error(`Unknown command: ${parsed.command}`);
}

try {
  main();
} catch (error: any) {
  console.error(`Lock recovery refused: ${error?.message || error}`);
  console.error('Run `npm run lock:recovery -- help` for the guarded workflow.');
  process.exitCode = 1;
}
