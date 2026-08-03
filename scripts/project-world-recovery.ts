#!/usr/bin/env node

import { resolveNarrativeDataDir } from '../src/config/runtime-paths';
import {
  inspectProjectWorldRecovery,
  recoverProjectWorldFromBackup,
} from '../src/storage/project-world-recovery';

const HELP = `Corrupted world-file recovery (local operator tool)

The incident this routes: project_<id>.json is PRESENT but unreadable or
structurally invalid, no creation/publication journal applies, and the atomic
writer's .bak beside it is the good copy.

Inspect (read-only; prints the evidence recover requires):
  npm run world:recovery -- inspect <projectId> [--data-dir <path>]

Recover (promotes the .bak's exact bytes over the corrupt primary):
  npm run world:recovery -- recover <projectId> \\
    --confirm-project <projectId> --backup-sha256 <hash printed by inspect> \\
    --reason "operator explanation" [--data-dir <path>]

Refusals are routed, not overridable: a tombstone means archive recovery, an
open journal means creation/publication recovery, a lock means the owner is
live (or lock recovery for a stale one), and a backup that disagrees with the
canon ledger means publication recovery. A healthy primary refuses outright.
The corrupt primary is preserved beside the audit; the .bak is never touched.`;

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
    if (name === 'help') {
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

function main(): void {
  const parsed = parse(process.argv.slice(2));
  if (!parsed.command || parsed.command === 'help' || parsed.switches.has('help')) {
    console.log(HELP);
    return;
  }
  const dataDir = resolveNarrativeDataDir(parsed.values.get('data-dir'));
  if (!parsed.projectId) throw new Error('A projectId is required');

  if (parsed.command === 'inspect') {
    console.log(JSON.stringify(inspectProjectWorldRecovery(dataDir, parsed.projectId), null, 2));
    return;
  }
  if (parsed.command === 'recover') {
    const result = recoverProjectWorldFromBackup(dataDir, parsed.projectId, {
      confirmProjectId: required(parsed.values, 'confirm-project'),
      backupSha256: required(parsed.values, 'backup-sha256'),
      reason: required(parsed.values, 'reason'),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  throw new Error(`Unknown command ${parsed.command}; run with --help`);
}

try {
  main();
} catch (error: any) {
  console.error(`World recovery refused: ${error?.message || error}`);
  console.error('Run `npm run world:recovery -- help` for the guarded workflow.');
  process.exitCode = 1;
}
