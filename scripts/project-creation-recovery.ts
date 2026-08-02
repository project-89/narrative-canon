#!/usr/bin/env node

import { resolveNarrativeDataDir } from '../src/config/runtime-paths';
import {
  inspectProjectCreation,
  recoverProjectCreation,
} from '../src/storage/project-creation-journal';

const HELP = `Interrupted project creation recovery (local operator tool)

Inspect:
  npm run creation:recovery -- inspect <projectId> [--data-dir <path>] [--stale-after-ms <ms>]

Publish a complete, journalled creation into the catalog:
  npm run creation:recovery -- recover <projectId> \\
    --confirm-project <projectId> \\
    --journal-operation <operationId> \\
    [--project-lock-operation <operationId>] \\
    --reason "operator explanation" \\
    [--allow-unreadable-project-lock] [--data-dir <path>] [--stale-after-ms <ms>]

The command requires a structurally valid world and, when present, a valid
canon ledger. It never steals a fresh owner and never invents an empty world.`;

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
    if (name === 'help' || name === 'allow-unreadable-project-lock') {
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
  if (!parsed.projectId) throw new Error('A projectId is required');
  const dataDir = resolveNarrativeDataDir(parsed.values.get('data-dir'));
  const staleMs = staleAfterMs(parsed.values);
  if (parsed.command === 'inspect') {
    console.log(JSON.stringify(inspectProjectCreation(dataDir, parsed.projectId, {
      staleAfterMs: staleMs,
    }), null, 2));
    return;
  }
  if (parsed.command !== 'recover') throw new Error(`Unknown command: ${parsed.command}`);
  console.log(JSON.stringify(recoverProjectCreation(dataDir, parsed.projectId, {
    confirmProjectId: required(parsed.values, 'confirm-project'),
    expectedJournalOperationId: required(parsed.values, 'journal-operation'),
    expectedProjectLockOperationId: parsed.values.get('project-lock-operation'),
    allowUnreadableProjectLock: parsed.switches.has('allow-unreadable-project-lock'),
    reason: required(parsed.values, 'reason'),
    staleAfterMs: staleMs,
  }), null, 2));
}

try {
  main();
} catch (error: any) {
  console.error(`Creation recovery refused: ${error?.message || error}`);
  console.error('Run `npm run creation:recovery -- help` for the guarded workflow.');
  process.exitCode = 1;
}
