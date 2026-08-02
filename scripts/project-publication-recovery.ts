#!/usr/bin/env node

import { resolveNarrativeDataDir } from '../src/config/runtime-paths';
import {
  inspectProjectPublicationJournal,
  recoverProjectPublication,
} from '../src/storage/project-publication-journal';

const HELP = `Paired canon/world publication recovery (local operator tool)

Inspect (read-only):
  npm run publication:recovery -- inspect <projectId> [--data-dir <path>] [--stale-after-ms <ms>]

Recover an explicitly inspected, abandoned publication:
  npm run publication:recovery -- recover <projectId> \\
    --confirm-project <projectId> \\
    --journal-operation <operationId> \\
    --project-lock-operation <operationId> \\
    --reason "operator explanation" \\
    [--allow-unreadable-project-lock] [--data-dir <path>] [--stale-after-ms <ms>]

The tool never steals a fresh lock. It proves whether the world rename landed:
an aligned world+nit pair is completed; an ahead-only nit ledger is restored to
its exact pre-publication inode. The decision is retained in a recovery audit.`;

interface Arguments {
  command?: string;
  projectId?: string;
  values: Map<string, string>;
  switches: Set<string>;
}

function parse(argv: string[]): Arguments {
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
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('--stale-after-ms must be a non-negative number');
  }
  return parsed;
}

function main(): void {
  const parsed = parse(process.argv.slice(2));
  if (!parsed.command || parsed.command === 'help' || parsed.switches.has('help')) {
    console.log(HELP);
    return;
  }
  if (!parsed.projectId) throw new Error('A projectId is required');
  if (parsed.command !== 'inspect' && parsed.command !== 'recover') {
    throw new Error(`Unknown command: ${parsed.command}`);
  }
  const dataDir = resolveNarrativeDataDir(parsed.values.get('data-dir'));
  const staleMs = staleAfterMs(parsed.values);
  if (parsed.command === 'inspect') {
    console.log(JSON.stringify(inspectProjectPublicationJournal(dataDir, parsed.projectId, {
      staleAfterMs: staleMs,
    }), null, 2));
    return;
  }
  const settlement = recoverProjectPublication(dataDir, parsed.projectId, {
    confirmProjectId: required(parsed.values, 'confirm-project'),
    expectedJournalOperationId: required(parsed.values, 'journal-operation'),
    expectedProjectLockOperationId: parsed.values.get('project-lock-operation'),
    allowUnreadableProjectLock: parsed.switches.has('allow-unreadable-project-lock'),
    reason: required(parsed.values, 'reason'),
    staleAfterMs: staleMs,
  });
  console.log(JSON.stringify(settlement, null, 2));
}

try {
  main();
} catch (error: any) {
  console.error(`Publication recovery refused: ${error?.message || error}`);
  console.error('Run `npm run publication:recovery -- help` for the guarded workflow.');
  process.exitCode = 1;
}
